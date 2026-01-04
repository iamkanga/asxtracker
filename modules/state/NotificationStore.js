/**
 * NotificationStore.js
 * Manages fetching, filtering, and persistence of Local and Global alerts.
 * Implements "Zero-Cost" architecture by reading central daily documents
 * and filtering client-side, rather than querying collections.
 */

import { db } from '../auth/AuthService.js';
import { AppState } from './AppState.js';
// Import userStore to listen for Preference Updates
import { userStore } from '../data/DataService.js';
import { EVENTS, STORAGE_KEYS, DASHBOARD_SYMBOLS } from '../utils/AppConstants.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, setDoc, getDocFromServer } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const APP_ID = "asx-watchlist-app";

export class NotificationStore {
    constructor() {
        this.listeners = [];
        this.scanData = {
            customHits: [], // All users' hits (Raw)
            globalMovers: { up: [], down: [] },
            globalHiLo: { high: [], low: [] }
        };
        this.dataTimestamp = null; // Store last update time from DB
        this.pinnedAlerts = [];
        this.scannerRules = { up: {}, down: {} }; // Capture rules
        this.lastViewed = { total: 0, custom: 0 };
        this.unsubscribePinned = null;
        this.unsubscribePrefs = null; // Subscription handle
        this.userId = null;
        this.alertTimestampCache = new Map(); // Session-based timestamp cache
        this.isReady = false; // LOGIC HARDENING: Race condition guard
    }

    /**
     * Initializes the store: loads local storage state, subscribes to pinned items,
     * and fetches the daily scan data.
     * @param {string} userId 
     */
    async init(userId) {
        try {
            this.userId = userId;
            this._loadLocalState();

            if (userId) {
                this._subscribeToPinned(userId);
                // Subscribe to Live Preferences (Rules)
                this._subscribeToPreferences(userId);

                // Fetch data implies a network call. We do this once on init.
                await this.refreshDailyData();

                // LOGIC HARDENING: Mark store as ready AFTER data is loaded
                this.isReady = true;
                document.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_READY));

                // Initial Rule Fetch (Redundant if subscription works fast, but safe)
                await this.refreshScannerRules();
            }

            // --- BIND TO LIVE DATA UPDATES ---
            // When AppController fetches new prices, it dispatches REQUEST_RENDER_WATCHLIST.
            // We use this signal to re-calculate Client-Side Alerts (which depend on Live Prices).
            document.addEventListener(EVENTS.REQUEST_RENDER_WATCHLIST, () => {
                this._notifyCountChange();
            });
        } catch (err) {
            console.error('[NotificationStore] init() failed:', err);
            this.isReady = false; // Ensure we don't mark as ready on failure
        }
    }

    /**
     * Subscribes to User Preferences to auto-update alerts when Settings change.
     */
    _subscribeToPreferences(userId) {
        if (this.unsubscribePrefs) this.unsubscribePrefs();

        // LOGIC HARDENING: Null guard for userStore
        if (!userStore) {
            console.warn('[NotificationStore] userStore is unavailable – skipping preferences subscription.');
            return;
        }

        try {
            this.unsubscribePrefs = userStore.subscribeToPreferences(userId, (prefs) => {
                if (prefs) {
                    // Update Local Rules
                    const data = prefs.scannerRules || {};
                    this.scannerRules = {
                        up: data.up || {},
                        down: data.down || {},
                        minPrice: (data.minPrice !== undefined && data.minPrice !== null) ? data.minPrice : null,
                        hiloMinPrice: (data.hiloMinPrice !== undefined && data.hiloMinPrice !== null) ? data.hiloMinPrice : null,
                        moversEnabled: data.moversEnabled, // Capture toggle
                        activeFilters: (prefs.scanner?.activeFilters || []).map(f => f.toUpperCase()) // Capture Whitelist
                    };

                    // console.log('[NotificationStore] Live Preferences Updated. Rules:', this.scannerRules);
                    this._notifyCountChange();
                }
            });
        } catch (err) {
            console.warn('[NotificationStore] Failed to subscribe to preferences:', err);
        }
    }

    /**
     * Loads local UI state (last viewed time) from LocalStorage.
     */
    _loadLocalState() {
        // PER USER REQUEST: Session-Only Notifications.
        // We do NOT load the last viewed time. We simulate "New User" every session.
        // This ensures badges and welcome logic fire every time the app reloads.
        // This ensures badges and welcome logic fire every time the app reloads.
        this.lastViewed = { total: 0, custom: 0 };
    }

    /**
     * Updates the Last Viewed timestamp for ALL sources to sync dismissal.
     * Use "Zero Persistence" requested by user: "Whatever's easiest to resolve it".
     * Syncing both ensures Sidebar dismissal clears Bell, and Bell dismissal clears Sidebar "New" status.
     */
    async markAsViewed(source = 'total') {
        const now = Date.now();

        // ASYMMETRIC DISMISSAL LOGIC:

        // 1. Sidebar Dismissal ('total') -> Clears ONLY Total (Sidebar).
        //    Does NOT affect Custom (Bell) as per user request.
        if (source === 'total') {
            this.lastViewed.total = now;
            localStorage.setItem(`${STORAGE_KEYS.NOTIFICATIONS_VIEWED}_total`, now);
        }

        // 2. Bell Dismissal ('custom') -> Clears ONLY Custom Badge.
        //    Global alerts remain "New" in sidebar.
        else if (source === 'custom') {
            this.lastViewed.custom = now;
            localStorage.setItem(`${STORAGE_KEYS.NOTIFICATIONS_VIEWED}_custom`, now);
        }

        this._notifyCountChange();
    }

    // ...

    /**
     * Public API to force re-calculation of badges (e.g. after Muting)
     */
    recalculateBadges() {
        this._notifyDataChange();
    }

    getBadgeCounts() {
        if (!this.userId) return { total: 0, custom: 0 };

        const thresholds = {
            total: this.lastViewed.total || 0,
            custom: this.lastViewed.custom || 0
        };

        const local = this.getLocalAlerts();
        const myHits = local.fresh || [];

        const global = this.getGlobalAlerts();
        const globalHits = [
            ...(global.movers?.up || []),
            ...(global.movers?.down || []),
            ...(global.hilo?.high || []),
            ...(global.hilo?.low || [])
        ];

        const allVisibleHits = [...myHits, ...globalHits];

        // 1. Calculate DEDUPLICATED counts
        let totalCount = 0;
        let customCount = 0;
        const seenCodesTotal = new Set();
        const seenCodesCustom = new Set();

        const parseTime = (timeVal) => {
            if (timeVal && typeof timeVal === 'object' && timeVal.toMillis) return timeVal.toMillis();
            if (timeVal && typeof timeVal === 'object' && timeVal.seconds) return timeVal.seconds * 1000;
            if (timeVal) return new Date(timeVal).getTime();
            return 0;
        };

        // --- CALC CUSTOM COUNT (Kangaroo) ---
        myHits.forEach(hit => {
            const code = hit.code || hit.shareCode || hit.symbol;
            if (!code || seenCodesCustom.has(code)) return;
            seenCodesCustom.add(code);

            const hitTime = parseTime(hit.t || hit.timestamp || hit.createdAt);
            const isNew = hitTime > 0 && hitTime > thresholds.custom;
            if (isNew) customCount++;
        });

        // --- CALC TOTAL COUNT (Sidebar) ---
        allVisibleHits.forEach(hit => {
            const code = hit.code || hit.shareCode || hit.symbol;
            if (!code || seenCodesTotal.has(code)) return;
            seenCodesTotal.add(code);

            const hitTime = parseTime(hit.t || hit.timestamp || hit.createdAt);
            const isNew = hitTime > 0 && hitTime > thresholds.total;
            if (isNew) {
                totalCount++;
            }
        });

        // console.log(`[NotificationStore] Counts Calculated -> Total: ${totalCount}, Custom: ${customCount}`);
        return { total: totalCount, custom: customCount };
    }

    /**
     * Fetches the 3 central daily documents: Custom Hits, Movers, HiLo.
     */
    async refreshDailyData() {
        if (!this.userId) return;

        try {
            const customRef = doc(db, `artifacts/${APP_ID}/alerts/CUSTOM_TRIGGER_HITS`);
            const moversRef = doc(db, `artifacts/${APP_ID}/alerts/GLOBAL_MOVERS_HITS`);
            const hiloRef = doc(db, `artifacts/${APP_ID}/alerts/HI_LO_52W_HITS`);

            // Defensive fetching: Handle individual failures gracefully
            const [customSnap, moversSnap, hiloSnap] = await Promise.allSettled([
                getDocFromServer(customRef),
                getDocFromServer(moversRef),
                getDocFromServer(hiloRef)
            ]);

            if (customSnap.status === 'fulfilled' && customSnap.value.exists()) {
                const data = customSnap.value.data();
                const docTime = data.updatedAt;
                this.dataTimestamp = docTime; // Capture Source of Truth Date
                this.scanData.customHits = normalizeHits(data.hits || [], docTime);
            } else {
                this.scanData.customHits = [];
            }

            // FILTER: Source-Level Exclusion of Dashboard Symbols (XJO, XAO, etc.)
            // We do this AFTER normalization to ensure we catch "XJO.AX" as "XJO".
            const filterDashboard = (list) => {
                return list.filter(h => {
                    if (!h.code) return false;
                    // Strict Check against Registry Constant
                    if (DASHBOARD_SYMBOLS.includes(h.code)) return false;
                    // Also check for common index prefix if not in list
                    if (h.code.startsWith('^')) return false;
                    return true;
                });
            };

            if (moversSnap.status === 'fulfilled' && moversSnap.value.exists()) {
                const data = moversSnap.value.data();
                const docTime = data.updatedAt;

                const rawUp = data.upHits || data.up || [];
                const rawDown = data.downHits || data.down || [];

                this.scanData.globalMovers = {
                    up: filterDashboard(normalizeHits(rawUp, docTime)),
                    down: filterDashboard(normalizeHits(rawDown, docTime))
                };
            }

            if (hiloSnap.status === 'fulfilled' && hiloSnap.value.exists()) {
                const data = hiloSnap.value.data();
                const docTime = data.updatedAt;
                this.scanData.globalHiLo = {
                    high: filterDashboard(normalizeHits(data.highHits || data.high || [], docTime)),
                    low: filterDashboard(normalizeHits(data.lowHits || data.low || [], docTime))
                };
            }

            this.lastUpdated = new Date();

            // Dispatch Event to Update Badge
            this._notifyCountChange();

        } catch (e) {
            console.error('[NotificationStore] CRITICAL ERROR in refreshDailyData:', e);
        }
    }

    /**
     * Fetches user's scanner preferences to ensure Global Alerts reflect actual thresholds.
     */
    async refreshScannerRules() {
        if (!this.userId) return;
        try {
            const rulesRef = doc(db, `artifacts/${APP_ID}/users/${this.userId}/preferences/scanner`);
            const snap = await getDocFromServer(rulesRef);
            if (snap.exists()) {
                const data = snap.data();
                // Map to internal structure
                this.scannerRules = {
                    up: data.up || {},
                    down: data.down || {},
                    // FIX: Allow 0 vs Null for Global Limit too.
                    minPrice: (data.minPrice !== undefined && data.minPrice !== null) ? data.minPrice : null,
                    // FIX: Allow 0 (None). Use Nullish Coalescing.
                    hiloMinPrice: (data.hiloMinPrice !== undefined && data.hiloMinPrice !== null) ? data.hiloMinPrice : null
                };
                // console.log('[NotificationStore] Scanner Rules Refreshed:', this.scannerRules);
            }
        } catch (e) {
            console.error('[NotificationStore] Error fetching rules:', e);
        }
    }

    /**
     * Filters list of hits against User Thresholds.
     * strictMode = If true, requires at least one threshold (or explicit 0) to be active.
     */
    filterHits(hits, rules, strictMode = false) {
        if (!hits || hits.length === 0) return [];

        const hasPct = (rules.percentThreshold !== undefined && rules.percentThreshold !== null);
        const hasDol = (rules.dollarThreshold !== undefined && rules.dollarThreshold !== null);

        // FIX: STRICT MODE
        // If User set everything to 0/None -> Disable alerts for this category.
        // Assuming NULL means Disabled.
        if (strictMode) {
            const isDefined = (hasPct || hasDol);
            if (!isDefined) return [];
        }

        // Use Defaults for Comparison (0 if null/undefined)
        // logic allows 0 to match >0.
        const tPct = rules.percentThreshold || 0;
        const tDol = rules.dollarThreshold || 0;
        const minPrice = rules.minPrice || 0; // Global Min Price Filter

        return hits.filter(hit => {
            // 1. Zombie Check
            // Block items with no meaningful movement. Handles undefined or NaN values.
            const pctZero = Number(hit.pct) === 0 || isNaN(Number(hit.pct));
            const changeZero = hit.change === undefined || Number(hit.change) === 0;
            if (pctZero && changeZero) return false;

            // 2. Global Price Filter (Min Price)
            // Handle different property names (live, price, lastPrice)
            const price = hit.live || hit.price || hit.lastPrice || 0;
            if (minPrice > 0 && price < minPrice) {
                return false;
            }

            // 2b. ETF/INDEX FILTER (Noise Reduction)
            // Block generic ETF/Index alerts from Global feeds unless specifically watched.
            if (hit.code && AppState.livePrices instanceof Map) {
                const live = AppState.livePrices.get(hit.code);
                if (live) {
                    const type = (live.type || '').toUpperCase();
                    // Block if it's an ETF/Index AND it's not in our local watchlist (meaning just noise)
                    // Note: _isLocal flag is added during mergeLists in getGlobalAlerts
                    if ((type === 'ETF' || type === 'INDEX') && !hit._isLocal) {
                        return false;
                    }
                }
            }

            // 2c. MUTE FILTER (New Feature)
            // Check if user has muted this stock in their portfolio
            if (AppState.data && AppState.data.shares) {
                const stockCode = (hit.code || hit.shareName || '').toUpperCase();
                // Find ANY record of this stock that is muted
                const isMuted = AppState.data.shares.some(s =>
                    s.shareName === stockCode && s.muted === true
                );
                if (isMuted) return false;
            }

            // 2d. SCANNER INDUSTRY FILTER (User Request)
            // Block alerts from industries NOT in the activeFilters whitelist.
            // EXCEPTION: Always show if the stock is in the user's watchlist (_isLocal).
            const activeFilters = rules.activeFilters || [];
            if (!hit._isLocal && activeFilters.length > 0) {
                let ind = (hit.industry || '').toUpperCase();

                // JIT lookup if missing in hit
                if (!ind && hit.code && AppState.livePrices instanceof Map) {
                    const priceData = AppState.livePrices.get(hit.code);
                    if (priceData) ind = (priceData.industry || '').toUpperCase();
                }

                if (ind && !activeFilters.includes(ind)) {
                    // console.log(`[NotificationStore] Filtering out ${hit.code} (Industry: ${ind}) – Not in whitelist.`);
                    return false;
                }
            }

            // 3. Threshold Check
            // OR LOGIC:
            // If Pct Threshold is > 0, check if Pct met.
            // If Dol Threshold is > 0, check if Dol met.
            // If both 0 (but enabled/defined), it passes (Show All).

            const matchesPct = (tPct > 0 ? Math.abs(hit.pct) >= tPct : true);
            const matchesDol = (tDol > 0 ? Math.abs(hit.change) >= tDol : true);

            if (tPct > 0 && tDol > 0) {
                return (Math.abs(hit.pct) >= tPct) || (Math.abs(hit.change) >= tDol);
            } else if (tPct > 0) {
                return Math.abs(hit.pct) >= tPct;
            } else if (tDol > 0) {
                return Math.abs(hit.change) >= tDol;
            }

            // If strictMode is OFF (bypass), and no thresholds set -> Show All (passed via boolean Logic above)
            return true;
        });
    }

    async _fetchDoc(docName) {
        const path = `artifacts/${APP_ID}/alerts/${docName}`;
        const ref = doc(db, path);
        const snap = await getDoc(ref);
        return snap;
    }

    /**
     * Subscribes to the specific pinnedAlerts field in User Preferences.
     */
    _subscribeToPinned(userId) {
        if (this.unsubscribePinned) this.unsubscribePinned();

        const prefRef = doc(db, `artifacts/${APP_ID}/users/${userId}/preferences/config`);
        this.unsubscribePinned = onSnapshot(prefRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                this.pinnedAlerts = Array.isArray(data.pinnedAlerts) ? data.pinnedAlerts : [];
                this.scannerRules = data.scannerRules || { up: {}, down: {} };

                // --- CROSS-DEVICE SYNC OF READ STATE ---
                // DISABLED: Session-Only Notifications requested.
                // if (data.lastViewedAlerts && data.lastViewedAlerts > this.lastViewedTime) {
                //    console.log(`[NotificationStore] Syncing lastViewedTime from Firestore: ${data.lastViewedAlerts}`);
                //    this.lastViewedTime = data.lastViewedAlerts;
                //    localStorage.setItem(STORAGE_KEYS.LAST_VIEWED_ALERTS, this.lastViewedTime.toString());
                // }
            } else {
                this.pinnedAlerts = [];
                this.scannerRules = { up: {}, down: {} };
            }
            this._notifyDataChange();
        });
    }

    /**
     * Pins an alert item. API: Saves entire item object to Firestore to persist even if daily file clears.
     */
    async pinAlert(alertItem) {
        if (!this.userId || !alertItem) return;
        // Sanitize object for Firestore (remove undefined)
        const sanitized = JSON.parse(JSON.stringify(alertItem));
        const prefRef = doc(db, `artifacts/${APP_ID}/users/${this.userId}/preferences/config`);

        // We use arrayUnion. Firestore equality checks deep objects, so exact matches work.
        // But if timestamps differ, it might dup. Ideally we pin by ID, but alerts lack stable IDs across days.
        // Strategy: Store the full Alert Object.
        try {
            await setDoc(prefRef, {
                pinnedAlerts: arrayUnion(sanitized),
                updatedAt: new Date()
            }, { merge: true });
        } catch (e) {
            console.error('[NotificationStore] Pin Error:', e);
        }
    }

    async unpinAlert(alertItem) {
        if (!this.userId || !alertItem) return;
        // Must match exactly for arrayRemove.
        // Strategy: We rely on the UI passing back the exact object reference from the `pinned` array.
        const prefRef = doc(db, `artifacts/${APP_ID}/users/${this.userId}/preferences/config`);

        try {
            await updateDoc(prefRef, {
                pinnedAlerts: arrayRemove(alertItem)
            });
        } catch (e) {
            console.error('[NotificationStore] Unpin Error:', e);
        }
    }

    /**
     * Computed: Get "Local" Alerts (Filtered Custom Hits + Pinned).
     * Filter Logic: Matches userId.
     */
    getLocalAlerts() {
        if (!this.userId) return [];

        // 1. Filter today's hits for this user
        // Ensure stricter type checking for userId

        // --- CLIENT-SIDE WATCHLIST ALERTS (TARGETS & HI/LO) ---
        // If the Backend isn't sending Targets or Watchlist Hi/Lo, we generate them here on the fly.
        const clientTargets = this._generateClientSideWatchlistAlerts();

        // MERGE FIX: Deduplicate Server vs Client Hits.
        // Normalize 'target-hit' vs 'target' to ensure matches work.
        const normalizeIntent = (i) => (i || '').toUpperCase().replace('-HIT', '');

        const clientSignatures = new Set(clientTargets.map(h => {
            const sig = `${h.code}|${normalizeIntent(h.intent)}`;
            return sig;
        }));

        // Filter Server Hits: Drop if covered by Client
        const uniqueServerHits = this.scanData.customHits.filter(h => {
            const sig = `${h.code}|${normalizeIntent(h.intent)}`.toUpperCase();
            const isDuplicate = clientSignatures.has(sig);
            return !isDuplicate;
        });

        // Merge Hits: Append Client Targets to Unique Server Hits
        const rawHits = [...uniqueServerHits, ...clientTargets];

        // --- MOVER LOGIC CONTINUE ---
        const myHits = rawHits.filter(hit => {
            const match = String(hit.userId) === String(this.userId);
            if (!match) return false;

            // --- ZOMBIE CHECK (FINAL GATEKEEPER) ---
            // Re-verify against AppState.livePrices to ensure we don't show static/stale server hits.
            // This fixes issues where 'client generation' blocks a hit (GAP) but 'server hits' let it through.
            if (hit.code) {
                let checkPct = Number(hit.pct || hit.changeInPercent || 0);
                let checkAmt = Number(hit.change || 0);

                // If live data exists, prefer it for the zombie check
                if (AppState.livePrices && AppState.livePrices.has(hit.code)) {
                    const live = AppState.livePrices.get(hit.code);
                    const lpPct = Number(live.changeInPercent || live.pct || live.pctChange || 0);
                    const lpAmt = Number(live.change || 0);
                    // If live data is valid (price > 0), use its movement stats
                    if (Number(live.live || live.price || live.last || 0) > 0) {
                        checkPct = isNaN(lpPct) ? 0 : lpPct;
                        checkAmt = isNaN(lpAmt) ? 0 : lpAmt;
                    }
                }

                // If practically zero movement, BLOCK IT.
                if (Math.abs(checkPct) === 0 && Math.abs(checkAmt) === 0) {
                    return false;
                }
            }

            // --- MUTE FILTER (Custom Triggers Early Exit) ---
            const code = hit.code || hit.shareName || hit.symbol;
            if (code && AppState.data && AppState.data.shares) {
                // Find ANY record of this stock that is muted
                const isMuted = AppState.data.shares.some(s =>
                    s.shareName === code && s.muted === true
                );
                if (isMuted) return false;
            }

            // --- EXCLUDE DASHBOARD SYMBOLS ---
            if (hit.code && DASHBOARD_SYMBOLS.includes(hit.code)) return false;

            // --- STRICT FILTER FOR PERSONAL MOVERS (RMD FIX) ---
            if (hit.intent === 'mover') {
                // BYPASS: Implicit Watchlist Movers (e.g. >5%) always show, regardless of global settings
                // Note: Implicit ones are generated client-side and already passed strict filtering.
                if (hit.isImplicit) return true;

                const rules = this.scannerRules || {};

                // FIX: GLOBAL DISABLE CHECK
                if (rules.moversEnabled === false) return false;

                const isDown = (hit.direction || '').toLowerCase() === 'down' || (hit.pct || 0) < 0;
                const activeRules = isDown ? (rules.down || {}) : (rules.up || {});

                const thresholdPct = activeRules.percentThreshold || 0;
                const thresholdDol = activeRules.dollarThreshold || 0;

                // FIX: STRICT ZERO CHECK
                // If the user set "Increase Threshold" to "None" (0), they want NO ALERTS.
                // We must block backend hits in this case.
                if (thresholdPct === 0 && thresholdDol === 0) return false;

                // --- JIT ENRICHMENT FOR ACCURATE FILTERING & DISPLAY ---
                // Use Live Data if available, otherwise fallback to snapshot
                let pct = Math.abs(Number(hit.pct || hit.changeInPercent || hit.changeP || 0));
                let dol = Math.abs(Number(hit.change || hit.c || 0));

                if (hit.code && AppState.livePrices instanceof Map) {
                    const live = AppState.livePrices.get(hit.code);
                    if (live) {
                        const lPct = Number(live.dayChangePercent || live.changeInPercent || live.pct || 0);
                        const lDol = Number(live.change || live.c || 0);
                        if (Math.abs(lPct) > 0 || Math.abs(lDol) > 0) {
                            pct = Math.abs(lPct);
                            dol = Math.abs(lDol);
                        }
                        // ENRICHMENT: Update High/Low 52W from Live Data (Freshness Fix)
                        if (live.high > 0) hit.high = live.high;
                        if (live.low > 0) hit.low = live.low;
                        // Also map to explicit props for UI
                        hit.high52 = hit.high;
                        hit.low52 = hit.low;
                    }
                }

                // Threshold Check
                const metPct = (thresholdPct > 0 && pct >= thresholdPct);
                const metDol = (thresholdDol > 0 && dol >= thresholdDol);
                if (!metPct && !metDol) return false;
            }

            return true;
        });

        // 2. Merge with Pinned (Avoid duplicates if pinned item is also in today's hits?)
        // Pinned items might be from past days.
        // We show ALL pinned items at the top.
        // Then remaining daily hits.

        // Duplicate check set
        const consolidated = new Map();
        const mutedCodes = new Set();
        if (AppState.data && AppState.data.shares) {
            AppState.data.shares.forEach(s => {
                if (s.muted) mutedCodes.add(s.shareName);
            });
        }

        // Helper to merge or add - UPDATED WITH MUTE FILTER
        const addOrMerge = (hit) => {
            const code = hit.code || hit.shareName;
            if (!code) return;

            // MUTE FILTER (Custom Triggers)
            if (mutedCodes.has(code)) return;

            if (!consolidated.has(code)) {
                // First entry: Clone it and init matches
                const master = { ...hit, matches: [hit] };
                consolidated.set(code, master);
            } else {
                // Existing entry: Merge
                const master = consolidated.get(code);
                master.matches.push(hit);
            }
        };

        myHits.forEach(addOrMerge); // myHits comes from logic below, but we need to ensure IT respects mute too?
        // Actually, myHits is filtered below. Let's look at `myHits` construction. 
        // `myHits` filters `rawHits`. `rawHits` combines `uniqueServerHits` and `clientTargets`.

        // Let's filter `myHits` implicitly via the mutedCodes check in `addOrMerge` 
        // OR better, filter `rawHits` before processing.

        // Let's refine the flow above.
        // `myHits` is `rawHits.filter(...)`.
        // Let's inject mute check into `myHits` filter block.

        const freshConsolidated = Array.from(consolidated.values());
        // --- CONSOLIDATION LOGIC END ---

        return {
            pinned: this.pinnedAlerts,
            fresh: freshConsolidated
        };
    }

    /**
     * Client-Side Fallback: Generates Top Movers & Hi/Lo from local AppState.livePrices
     * Used when backend data is sparse or missing.
     */
    _hydrateFromClientCache() {
        if (!AppState.livePrices || AppState.livePrices.size === 0) return { up: [], down: [], high: [], low: [] };

        const all = Array.from(AppState.livePrices.values());

        // Filter: Exclude Dashboard Symbols and Invalid Data
        const candidates = all.filter(item => {
            if (!item.code) return false;
            // Exclude Indices/Currencies (DASHBOARD_SYMBOLS)
            if (DASHBOARD_SYMBOLS.includes(item.code)) return false;
            if (item.code.startsWith('.')) return false;

            // Must have valid change
            if (Math.abs(item.pctChange) === 0 && Math.abs(item.change) === 0) return false;

            return true;
        });

        // 1. Gainers (Sort by % Change DESC)
        const gainers = [...candidates]
            .filter(i => i.pctChange > 0)
            .sort((a, b) => b.pctChange - a.pctChange)
            .slice(0, 500) // Increased to 500 to allow post-filtering
            .map(i => this._mapPriceToHit(i));

        // 2. Losers (Sort by % Change ASC -> Most Negative First)
        const losers = [...candidates]
            .filter(i => i.pctChange < 0)
            .sort((a, b) => a.pctChange - b.pctChange)
            .slice(0, 500) // Increased to 500
            .map(i => this._mapPriceToHit(i));

        // 3. 52-Week Highs (Price >= 99% of 52w High)
        // Sort by % Change DESC (Biggest movers at highs)
        // FIX: DataService maps High52 -> .high, Low52 -> .low
        // SLICE: Increase to 2500 (Full Market) to ensure we don't drop valid stocks due to penny stock crowding before MinPrice filter.
        const highs = [...candidates]
            .filter(i => {
                const price = i.live || i.price || i.lastPrice || 0;
                return i.high > 0 && price >= (i.high * 0.99);
            })
            .sort((a, b) => b.pctChange - a.pctChange)
            .slice(0, 2500)
            .map(i => ({ ...this._mapPriceToHit(i), type: 'high', intent: 'hilo-up' }));

        // 4. 52-Week Lows (Price <= 101% of 52w Low)
        // Sort by % Change ASC (Biggest drops at lows)
        const lows = [...candidates]
            .filter(i => {
                const price = i.live || i.price || i.lastPrice || 0;
                return i.low > 0 && price <= (i.low * 1.01);
            })
            .sort((a, b) => a.pctChange - b.pctChange)
            .slice(0, 2500)
            .map(i => ({ ...this._mapPriceToHit(i), type: 'low', intent: 'hilo-down' }));



        return { up: gainers, down: losers, high: highs, low: lows };
    }

    /**
     * Map AppState.livePrices object to Notification Hit structure
     */
    _mapPriceToHit(priceObj) {
        return {
            code: priceObj.code,
            name: priceObj.name,
            live: priceObj.live || priceObj.price || priceObj.lastPrice || 0, // Robust Price
            change: priceObj.change,
            pct: priceObj.pctChange, // Map pctChange to pct
            dayChangePercent: priceObj.pctChange, // Redundancy for UI
            high: priceObj.high || 0, // Pass 52W High
            low: priceObj.low || 0,   // Pass 52W Low
            t: this._getStableTimestamp ? this._getStableTimestamp(`${priceObj.code}-global`) : Date.now()
        };
    }

    getGlobalAlerts(bypassStrict = false) {
        // 1. Get Base Global Data (Backend)
        // Check availability. If < 20 items (was 5), assume backend failure/sparse => Trigger Hydration
        let rawGlobalUp = this.scanData.globalMovers.up || [];
        let rawGlobalDown = this.scanData.globalMovers.down || [];
        let rawGlobalHigh = this.scanData.globalHiLo.high || [];
        let rawGlobalLow = this.scanData.globalHiLo.low || [];

        // Increase threshold to prefer local data if backend is weak
        const isBackendSparse = (rawGlobalUp.length + rawGlobalDown.length) < 20;


        if (isBackendSparse) {
            // Backend data sparse (< 20). Triggering Client-Side Hydration (Silent).
            const hydrated = this._hydrateFromClientCache();
            if (hydrated.up.length > 0) rawGlobalUp = hydrated.up;
            if (hydrated.down.length > 0) rawGlobalDown = hydrated.down;

            // Also hydrate Hi/Lo if we are generating data
            if (hydrated.high.length > 0) rawGlobalHigh = hydrated.high;
            if (hydrated.low.length > 0) rawGlobalLow = hydrated.low;
        }

        const rules = this.getScannerRules() || {};

        // 2. Get Local Data (Portfolio/Watchlist)
        // We want to merge "Movers" from local into Global Lists.
        // Local Alerts structure: { pinned: [], fresh: [] }
        // We filter 'fresh' for movers.
        const local = this.getLocalAlerts();
        const localMovers = (local.fresh || []).filter(item => item.intent === 'mover' || item.intent === 'up' || item.intent === 'down');

        // Split Local by Direction
        const localUp = localMovers.filter(i => i.type === 'up' || i.pct > 0);
        const localDown = localMovers.filter(i => i.type === 'down' || i.pct < 0);

        // 3. Merge Strategies (Dedup by Code)
        const mergeLists = (globalList, localList) => {
            const map = new Map();
            // Add Global First
            (globalList || []).forEach(item => {
                if (item.code) map.set(item.code, item);
            });
            // Add Local (Override or Append?)
            // Local is usually "live" so might be fresher. Let's overwrite global with local if collision.
            (localList || []).forEach(item => {
                if (item.code) map.set(item.code, { ...item, _isLocal: true }); // Mark as local for debug
            });
            return Array.from(map.values());
        };

        // Filter Movers
        const movers = {};
        // Strict Mode Logic: 
        // If bypassStrict is TRUE, strictMode is FALSE.
        // If bypassStrict is FALSE (Default), strictMode is TRUE (Original Behavior).
        const strictMode = !bypassStrict;

        if (rules.moversEnabled !== false) {
            // MERGE BEFORE FILTERING? 
            // The backend data is raw (or hydrated). The local data is already filtered by getLocalAlerts logic.
            // We merge them now.

            let mergedUp = mergeLists(rawGlobalUp, localUp);
            let mergedDown = mergeLists(rawGlobalDown, localDown);

            // FORCE FINAL SORT (Desc for Up, Asc for Down)
            mergedUp.sort((a, b) => (b.pctChange || b.pct || 0) - (a.pctChange || a.pct || 0));
            mergedDown.sort((a, b) => (a.pctChange || a.pct || 0) - (b.pctChange || b.pct || 0));

            // Pass Global minPrice into filterHits rules
            const upRules = { ...(rules.up || {}), minPrice: rules.minPrice || 0 };
            const downRules = { ...(rules.down || {}), minPrice: rules.minPrice || 0 };

            movers.up = this.filterHits(mergedUp, upRules, strictMode);
            movers.down = this.filterHits(mergedDown, downRules, strictMode);
        }

        // Filter Hi/Lo
        // FIX: If hiloMinPrice is NULL (Blank) OR 0, Disable. User must set > 0 to enable.
        const hiloLimit = rules.hiloMinPrice;
        const hiloEnabled = (hiloLimit !== null && hiloLimit > 0);

        // Merge Local HiLo? (User didn't explicitly ask, but consistent).
        // Local Alerts includes 'hilo'.
        const localHilo = (local.fresh || []).filter(item => item.intent === 'hilo' || item.intent.includes('hilo'));
        const localHigh = localHilo.filter(i => i.type === 'high');
        const localLow = localHilo.filter(i => i.type === 'low');

        let mergedHigh = hiloEnabled ? mergeLists(rawGlobalHigh, localHigh) : [];
        let mergedLow = hiloEnabled ? mergeLists(rawGlobalLow, localLow) : [];

        // FORCE FINAL SORT for HiLo (Based on PCT Change, as requested)
        if (hiloEnabled) {
            // Highs: Biggest Gainers First
            mergedHigh.sort((a, b) => (b.pctChange || b.pct || 0) - (a.pctChange || a.pct || 0));
            // Lows: Biggest Losers First
            mergedLow.sort((a, b) => (a.pctChange || a.pct || 0) - (b.pctChange || b.pct || 0));
        }

        // Match Global minPrice for HiLo too
        const hiloRules = { percentThreshold: 0, dollarThreshold: 0, minPrice: rules.hiloMinPrice || 0 };

        const enrichHilo = (list) => {
            return list.map(hit => {
                if (hit.code && AppState.livePrices instanceof Map) {
                    const live = AppState.livePrices.get(hit.code);
                    if (live) {
                        if (live.high > 0) hit.high = live.high;
                        if (live.low > 0) hit.low = live.low;
                        hit.high52 = hit.high;
                        hit.low52 = hit.low;
                    }
                }
                return hit;
            });
        };

        const hilo = {
            high: hiloEnabled ? this.filterHits(enrichHilo(mergedHigh), hiloRules, false) : [],
            low: hiloEnabled ? this.filterHits(enrichHilo(mergedLow), hiloRules, false) : []
        };

        // FINAL SAFETY SORT: Enforce strict order on output
        // FIX: Use parseFloat to handle potential string inputs (e.g. "0.5%") which Number() chokes on.
        // FIX: Use parseFloat to handle potential string inputs (e.g. "0.5%") which Number() chokes on.
        // ENHANCED FIX: Look up Live Data if missing, AND ENFORCE SIGN to match UI.
        const getDisplayPct = (i, type) => {
            let val = parseFloat(i.pct || i.pctChange || i.changeInPercent || i.changeP || i.changePercent || 0);

            // JIT Enrichment for Sorting (Match UI Logic)
            if (val === 0 && i.code && AppState.livePrices && AppState.livePrices instanceof Map) {
                // UI LOGIC MATCH: Clean Code (.AX removal)
                const code = String(i.code).toUpperCase();
                const cleanCode = code.replace(/\.AX$/i, '').trim();

                const live = AppState.livePrices.get(cleanCode) || AppState.livePrices.get(code);

                if (live) {
                    val = parseFloat(live.dayChangePercent || live.changeInPercent || live.pct || live.pctChange || 0);
                    // CRITICAL: Write back to object so TEST and UI use the same enriched value
                    i.pct = val;
                    if (i.pctChange === 0 || i.pctChange === undefined) i.pctChange = val;
                }
            }

            val = isNaN(val) ? 0 : val;

            // --- CRITICAL VISUAL FIX: MATCH UI SIGN FORCING ---
            // NotificationUI.js lines 891-893 force signs based on type.
            // Ensure val is a finite number
            if (!Number.isFinite(val)) val = 0;

            // --- CRITICAL VISUAL FIX: MATCH UI SIGN FORCING ---
            // NotificationUI.js force signs based on type.
            // If we don't do this here, a -0.5% High (intraday drop, but 52w High) sorts to bottom.
            if (type === 'hilo-up' || type === 'up' || type === 'high') {
                return Math.abs(val);
            }
            if (type === 'hilo-down' || type === 'down' || type === 'low') {
                return -Math.abs(val);
            }
            return val;
        };

        const sortDesc = (type) => (a, b) => {
            const valA = getDisplayPct(a, type);
            const valB = getDisplayPct(b, type);
            if (valA === valB) return 0;
            return valB - valA; // Strict Descending
        };
        const sortAsc = (type) => (a, b) => {
            const valA = getDisplayPct(a, type);
            const valB = getDisplayPct(b, type);
            if (valA === valB) return 0;
            return valA - valB; // Strict Ascending
        };

        if (movers.up) movers.up.sort(sortDesc('up'));
        if (movers.down) movers.down.sort(sortAsc('down'));
        if (hilo.high) hilo.high.sort(sortDesc('high'));
        if (hilo.low) hilo.low.sort(sortAsc('low'));

        return {
            movers,
            hilo
        };
    }

    /**
     * DIAGNOSTIC TOOL
     * Run via Console: notificationStore.runDiagnostic()
     */
    /**
     * SELF-TEST DIAGNOSTIC TOOL
     * verify that the logic "Delivers information in the correct way".
     */
    testGlobalAlerts() {
        console.clear();
        console.group("%c 🧪 GLOBAL ALERTS SELF-TEST ", "background: #222; color: #bada55; font-size: 14px; padding: 4px;");

        if (!AppState.livePrices || AppState.livePrices.size === 0) {
            console.error("❌ ABORT: No Live Price Data to test against.");
            console.groupEnd();
            return;
        }

        const prices = Array.from(AppState.livePrices.values());
        console.log(`📊 Data Source: Scanning ${prices.length} live instruments.`);

        // --- TEST SCENARIO ---
        const TEST_MIN_PRICE = 0.50;
        const TEST_PCT_THRESHOLD = 3.0;

        console.log(`⚙️  Test Rules: Price > $${TEST_MIN_PRICE}, Move > ${TEST_PCT_THRESHOLD}%`);

        // 1. MANUAL CALCULATION (Control Group)
        const controlUp = prices.filter(p => {
            if (DASHBOARD_SYMBOLS.includes(p.code)) return false;
            // Clean logic
            const price = p.live || p.price || 0;
            return (price >= TEST_MIN_PRICE && p.pctChange >= TEST_PCT_THRESHOLD);
        }).sort((a, b) => b.pctChange - a.pctChange).slice(0, 100);

        const controlDown = prices.filter(p => {
            if (DASHBOARD_SYMBOLS.includes(p.code)) return false;
            const price = p.live || p.price || 0;
            return (price >= TEST_MIN_PRICE && p.pctChange <= -TEST_PCT_THRESHOLD);
        }).sort((a, b) => a.pctChange - b.pctChange).slice(0, 100);

        // 2. ACTUAL SYSTEM OUTPUT (Test Group)
        // Mock the rules injection
        // We temporarily override scanner rules logic by passing explicit rules to a specialized check function 
        // OR we just assume the filterHits logic is what we are testing.
        // Let's use the actual hydration + filter pipeline but bypass the "User Preferences" fetch.

        // We'll call _hydrateFromClientCache (Raw Candidates) then manually filter using filterHits to test that specific function.
        const hydrated = this._hydrateFromClientCache();

        // Construct Rules Object matching the Test Scenario
        const testRules = {
            percentThreshold: TEST_PCT_THRESHOLD,
            dollarThreshold: 0,
            minPrice: TEST_MIN_PRICE
        };

        const systemUp = this.filterHits(hydrated.up, testRules, true); // Strict Mode (Apply thresholds)
        const systemDown = this.filterHits(hydrated.down, testRules, true);

        // 3. COMPARISON & REPORTING
        const check = (label, control, system, sortDir) => {
            console.group(label);

            // Count Check
            if (control.length !== system.length) {
                console.error(`❌ COUNT MISMATCH: Expected ${control.length}, Got ${system.length}`);
            } else {
                console.log(`✅ Count Matching: ${system.length} items.`);
            }

            // Content Check (Sample Top 3)
            const limit = Math.min(3, system.length);
            for (let i = 0; i < limit; i++) {
                const sysItem = system[i];
                const ctrlItem = control[i];
                if (sysItem.code !== ctrlItem.code) {
                    console.error(`❌ ORDER/CONTENT FAIL at #${i + 1}: Expected ${ctrlItem.code} (${ctrlItem.pctChange}%), Got ${sysItem.code} (${sysItem.pct}%)`);
                } else {
                    console.log(`   OK #${i + 1}: ${sysItem.code} @ ${sysItem.pct}%`);
                }
            }

            // Sorting Valid Check
            let sortOk = true;
            for (let i = 0; i < system.length - 1; i++) {
                const curr = Math.abs(system[i].pct);
                const next = Math.abs(system[i + 1].pct);
                // Magnitude should descend
                if (curr < next) {
                    console.warn(`⚠️ SORT WARN at #${i}: ${curr}% < ${next}%`);
                    sortOk = false;
                }
            }
            if (sortOk && system.length > 0) console.log("✅ Sorting Valid (Biggest magnitude first)");

            console.groupEnd();
        };

        check("📈 TEST: Global Gainers", controlUp, systemUp, 'desc');
        check("📉 TEST: Global Losers", controlDown, systemDown, 'asc');

        // 4. 52 WEEK HIGH/LOW CHECK
        // Control:
        const controlHigh = prices.filter(p => {
            if (DASHBOARD_SYMBOLS.includes(p.code)) return false;
            if (p.code.startsWith('.')) return false;

            // Zombie Check (Match System Logic)
            if (Math.abs(p.pctChange) === 0 && Math.abs(p.change === 0)) return false;

            const price = p.live || p.price || p.lastPrice || 0;
            // FIX: Property is .high not .high52
            return p.high > 0 && price >= (p.high * 0.99) && price >= TEST_MIN_PRICE;
        })
            .sort((a, b) => b.pctChange - a.pctChange)
            .slice(0, 100);

        // System:
        // Hydate produces 'high' list. We filter it.
        const systemHigh = this.filterHits(hydrated.high, { minPrice: TEST_MIN_PRICE }, false);

        // Note: hydrated.high is ALREADY sorted by pctChange.
        // We just need to check if minPrice filter worked.

        check("🚀 TEST: 52 Week Highs", controlHigh, systemHigh, 'desc');

        // 5. 52 WEEK LOW CHECK
        const controlLow = prices.filter(p => {
            if (DASHBOARD_SYMBOLS.includes(p.code)) return false;
            if (p.code.startsWith('.')) return false;
            if (Math.abs(p.pctChange) === 0 && Math.abs(p.change === 0)) return false;

            const price = p.live || p.price || p.lastPrice || 0;
            return p.low > 0 && price <= (p.low * 1.01) && price >= TEST_MIN_PRICE;
        })
            .sort((a, b) => a.pctChange - b.pctChange)
            .slice(0, 100);

        const systemLow = this.filterHits(hydrated.low, { minPrice: TEST_MIN_PRICE }, false);
        check("🔻 TEST: 52 Week Lows", controlLow, systemLow, 'asc');

        console.log("%c TEST COMPLETE ", "background: #222; color: #bada55");
        console.log(`User ID: ${this.userId}`);
        console.log(`Last Updated: ${this.lastUpdated}`);
        console.table(this.scannerRules);

        console.group("1. Raw Data Sources");
        console.log(`Backend Global Gainers: ${this.scanData.globalMovers.up.length}`);
        console.log(`Backend Global Losers: ${this.scanData.globalMovers.down.length}`);
        console.log(`Backend Global Highs: ${this.scanData.globalHiLo.high.length}`);
        console.log(`Backend Global Lows: ${this.scanData.globalHiLo.low.length}`);
        console.groupEnd();

        console.group("2. Dashboard Filter Check");
        const blockedUp = (this.scanData.globalMovers.up || []).filter(i => DASHBOARD_SYMBOLS.includes(i.code));
        if (blockedUp.length > 0) {
            console.warn(`Blocked ${blockedUp.length} Gainers due to Dashboard Filter:`, blockedUp.map(i => i.code));
        } else {
            console.log("No Gainers blocked by Dashboard Filter.");
        }
        console.groupEnd();

        console.group("3. Local/Portfolio Merge");
        const local = this.getLocalAlerts();
        console.log(`Local Fresh Alerts: ${local.fresh.length}`);
        const localMovers = local.fresh.filter(i => i.intent === 'mover' || i.intent === 'up' || i.intent === 'down');
        console.log(`Local Movers (to be merged): ${localMovers.length}`, localMovers.map(i => `${i.code} (${i.pct}%)`));
        console.groupEnd();

        console.group("4. Final Output (Strict Mode Bypassed)");
        const final = this.getGlobalAlerts(true);
        console.log(`Final Gainers: ${final.movers.up.length}`);
        console.log(`Final Losers: ${final.movers.down.length}`);
        if (final.movers.up.length === 0) console.warn("WARNING: Final Gainers is EMPTY.");
        console.groupEnd();

        console.groupEnd();

        return "Diagnostic Complete. Check Console.";
    }

    /**
     * Computed: Badge Counts for Sidebar (Total) and Kangaroo (Custom Triggers).
     */
    getBadgeCounts() {
        if (!this.userId) return { total: 0, custom: 0 };

        const now = Date.now();
        const thresholds = {
            total: this.lastViewed.total || 0,
            custom: this.lastViewed.custom || 0
        };

        const local = this.getLocalAlerts();
        const myHits = local.fresh || [];

        const global = this.getGlobalAlerts();
        const globalHits = [
            ...(global.movers?.up || []),
            ...(global.movers?.down || []),
            ...(global.hilo?.high || []),
            ...(global.hilo?.low || [])
        ];

        const allVisibleHits = [...myHits, ...globalHits];

        // 1. Calculate DEDUPLICATED counts
        let totalCount = 0;
        let customCount = 0;
        const seenCodesTotal = new Set();
        const seenCodesCustom = new Set();

        const parseTime = (timeVal) => {
            if (timeVal && typeof timeVal === 'object' && timeVal.toMillis) return timeVal.toMillis();
            if (timeVal && typeof timeVal === 'object' && timeVal.seconds) return timeVal.seconds * 1000;
            if (timeVal) return new Date(timeVal).getTime();
            return 0;
        };

        // --- CALC CUSTOM COUNT (Kangaroo) ---
        myHits.forEach(hit => {
            const code = hit.code || hit.shareCode || hit.symbol;
            if (!code || seenCodesCustom.has(code)) return;
            seenCodesCustom.add(code);

            const hitTime = parseTime(hit.t || hit.timestamp || hit.createdAt);
            const isNew = hitTime > 0 && hitTime > thresholds.custom;
            if (isNew) customCount++;
        });

        // --- CALC TOTAL COUNT (Sidebar) ---
        allVisibleHits.forEach(hit => {
            const code = hit.code || hit.shareCode || hit.symbol;
            if (!code || seenCodesTotal.has(code)) return;
            seenCodesTotal.add(code);

            const hitTime = parseTime(hit.t || hit.timestamp || hit.createdAt);
            const isNew = hitTime > 0 && hitTime > thresholds.total;
            if (isNew) totalCount++;
        });

        return { total: totalCount, custom: customCount };
    }

    getScannerRules() {
        return this.scannerRules;
    }

    getDataTimestamp() {
        return this.dataTimestamp;
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    _notifyDataChange() {
        this.listeners.forEach(cb => cb());
        this._notifyCountChange();
    }

    _notifyCountChange() {
        const counts = this.getBadgeCounts();
        document.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_UPDATE, {
            detail: {
                count: counts.total,
                totalCount: counts.total,
                customCount: counts.custom
            }
        }));
    }

    /**
     * Generates persistent alerts for User Price Targets AND 52-Week Hi/Lo using Live Data.
     * This bypasses the need for the Backend to be perfectly sync'd.
     */
    _generateClientSideWatchlistAlerts() {
        if (!this.userId || !AppState.data.shares || !AppState.livePrices) return [];

        const alerts = [];
        // Removed global 'today' constant. We now resolve per-item.

        const processedCodes = new Set(); // DEDUPLICATION GUARD

        AppState.data.shares.forEach(share => {
            const code = share.shareName;

            // DEDUPLICATION: If user has same stock in 2 watchlists, ignore second.
            if (processedCodes.has(code)) return;
            processedCodes.add(code);

            // Exclude Dashboard Symbols from alerts
            if (DASHBOARD_SYMBOLS.includes(code)) return;

            const liveData = AppState.livePrices.get(code);

            if (code && liveData) {
                // EXCLUDE DASHBOARD SYMBOLS (Double Check)
                if (DASHBOARD_SYMBOLS.includes(code)) return;

                const price = Number(liveData.live || liveData.price || liveData.last || 0);
                const volume = Number(liveData.volume || liveData.vol || 0);

                // STRICT FILTER: Must have Price (Traded at least once ever to have a last price)
                if (price > 0) {
                    // Fix: Handle NaN explicitly. Number(null) is 0, but Number("NaN") is NaN.
                    let pctChange = Number(liveData.changeInPercent || liveData.pct || liveData.pctChange || 0);
                    let dolChange = Number(liveData.change || 0);

                    if (isNaN(pctChange)) pctChange = 0;
                    if (isNaN(dolChange)) dolChange = 0;

                    const absChange = Math.abs(dolChange);
                    const absPct = Math.abs(pctChange);

                    // UNIVERSAL LOGIC:
                    // Volume is missing for some stocks (AKP, IPC), so we cannot use it to prove "Activity".
                    // "Zombie" definition simplifies to "Static Price" (No movement today).
                    // Logic from User: "If zero Price movement... it must have hit its Low or high the previous day... ignore it."
                    const isStatic = (absChange === 0 && absPct === 0);

                    // --- MATH SANITY CHECK (Universal) ---
                    // Calculate Phantom/Stale Status ONCE for both HiLo and Movers
                    const calcChange = (liveData.prevClose > 0) ? (price - liveData.prevClose) : 0;
                    const calcPct = (liveData.prevClose > 0) ? ((calcChange / liveData.prevClose) * 100) : 0;

                    let isPhantom = false;
                    // If Reported Change is "Big" (>1%) but Calculated Change is "Tiny" (<0.1%), likely Stale Data.
                    if (Math.abs(pctChange) > 1.0 && Math.abs(calcPct) < 0.1) {
                        isPhantom = true;
                    }

                    // --- DEEP TRACE FOR GAP PARADOX REMOVED ---


                    // --- LOAD RULES EARLY ---
                    const rules = this.getScannerRules() || {};

                    // 1. PRICE TARGETS
                    // TARGETS ARE EXEMPT from Global Locks. They are explicit user intents.
                    const targetPrice = Number(share.targetPrice || 0);
                    if (targetPrice > 0) {
                        const direction = share.targetDirection || 'below';
                        let hit = false;

                        // FIX: Do NOT use liveData.high/low here as they map to 52-week data in DataService.
                        // Until API provides explicit 'highDay'/'lowDay', we must fallback to PRICE.
                        // This prevents 52-week lows from triggering "Day Low" alerts.
                        const dayHigh = Number(liveData.highDay || price);
                        const dayLow = Number(liveData.lowDay || price);

                        // CHECK DAY HIGH/LOW to catch intraday spikes
                        // FIX: Block Static/Phantom stocks from triggering TARGET hits (prevents GAP Phantom Alert)
                        if (!isStatic && !isPhantom) {
                            if (direction === 'above' && dayHigh >= targetPrice) hit = true;
                            if (direction === 'below' && (dayLow > 0 && dayLow <= targetPrice)) hit = true;
                        }

                        if (hit) {
                            const key = `${code}-target-${direction}`;
                            alerts.push({
                                userId: this.userId,
                                code: code,
                                intent: 'target',
                                price: price,
                                target: targetPrice,
                                direction: direction,
                                pct: pctChange,
                                change: dolChange,
                                t: this._getStableTimestamp(key)
                            });
                        }
                    }

                    // 2. 52-WEEK HIGH/LOW (Implicit Watchlist Alerts)
                    // FIX: GOVERNED BY GLOBAL SETTINGS. 
                    // If 52W Limit is "Blank" (Null) OR 0, Disable. 
                    const hiloLimit = rules.hiloMinPrice;
                    const hiloEnabled = (hiloLimit !== null && hiloLimit !== undefined && hiloLimit > 0);

                    if (hiloEnabled) {
                        const high52 = Number(liveData.high || liveData.high52 || liveData.high_52 || 0);
                        const low52 = Number(liveData.low || liveData.low52 || liveData.low_52 || 0);
                        const tolerance = 0.001; // FP tolerance

                        // Check High
                        if (high52 > 0 && price >= (high52 - tolerance) && !isStatic && !isPhantom) {
                            if (code === 'GAP') console.warn("⚠️ GAP PUSHED HIGH ALERT");
                            const key = `${code}-hilo-high`;
                            alerts.push({
                                userId: this.userId,
                                code: code,
                                intent: 'hilo',
                                type: 'high',
                                price: price,
                                prevClose: Number(liveData.prevClose || 0),
                                high52: high52,
                                low52: low52, // ADDED: Ensure Range is visible
                                pct: pctChange,
                                change: dolChange,
                                t: this._getStableTimestamp(key)
                            });
                        }

                        // Check Low
                        if (low52 > 0 && price <= (low52 + tolerance) && !isStatic && !isPhantom) {
                            if (code === 'GAP') console.warn("⚠️ GAP PUSHED LOW ALERT");
                            const key = `${code}-hilo-low`;
                            alerts.push({
                                userId: this.userId,
                                code: code,
                                intent: 'hilo',
                                type: 'low',
                                price: price,
                                prevClose: Number(liveData.prevClose || 0),
                                low52: low52,
                                high52: high52, // ADDED: Ensure Range is visible
                                pct: pctChange,
                                change: dolChange,
                                t: this._getStableTimestamp(key)
                            });
                        }
                    }

                    if (code === 'GAP') console.groupEnd();

                    // 3. MOVERS (Implicit Watchlist Alerts)
                    // Removed strict Volume check as it may be missing in some data feeds.
                    // Replaced with MATH SANITY CHECK to filter Stale Data.
                    if (rules.moversEnabled !== false) {
                        // Variables pctChange, dolChange, absPct, absChange inherited from parent scope.

                        // ZOMBIE CHECK (Math):
                        // Inherited 'isPhantom' from parent scope.
                        if (isPhantom) {
                            // console.warn(`[NotificationStore] Blocked PHANTOM Alert for ${code}`);
                            return;
                        }

                        const upRules = rules.up || {};
                        const downRules = rules.down || {};

                        const r = pctChange >= 0 ? upRules : downRules;

                        const thresholdPct = r.percentThreshold;
                        const thresholdDol = r.dollarThreshold;

                        let isHit = false;

                        // Strict NULL check.
                        // If Pct is set (>=0), check match.
                        // If Pct is null, ignore Pct check (unless Dol is also null -> disable).
                        const hasPct = (thresholdPct !== null && thresholdPct !== undefined);
                        const hasDol = (thresholdDol !== null && thresholdDol !== undefined);

                        if (!hasPct && !hasDol) {
                            // Both blank = Disabled.
                            isHit = false;
                        } else {
                            if (hasPct && absPct >= thresholdPct) isHit = true;
                            if (hasDol && absChange >= thresholdDol) isHit = true;
                        }

                        // ZOMBIE CHECK (Mover specific): Must have actual movement.
                        if (absPct === 0 && absChange === 0) isHit = false;

                        if (isHit) {
                            const moverType = pctChange >= 0 ? 'up' : 'down';
                            const key = `${code}-mover-${moverType}`;

                            // console.log(`[NotificationStore] Custom Mover Hit: ${code} ${moverType} ${pctChange}% $${dolChange}`);
                            alerts.push({
                                userId: this.userId,
                                code: code,
                                intent: 'mover',
                                isImplicit: true,
                                type: moverType,
                                price: price,
                                pct: pctChange,
                                change: dolChange,
                                t: this._getStableTimestamp(key)
                            });
                        }
                    }
                }
            }
        });
        return alerts;
    }

    /**
     * Returns a stable timestamp for a given alert key for the duration of the session.
     * If the key is seen for the first time, it returns Date.now() and caches it.
     * @param {string} key - Unique identifier for the alert (e.g. "BHP-target-above")
     * @returns {string} ISO Date String
     */
    _getStableTimestamp(key) {
        if (!this.alertTimestampCache.has(key)) {
            // New Alert: Cache current time
            this.alertTimestampCache.set(key, new Date().toISOString());
        }
        return this.alertTimestampCache.get(key);
    }
}


// Helper to ensure safe data
function normalizeHits(list, fallbackTime = null) {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
        // Normalize Code: Strip .AX suffix and trim
        let rawCode = item.code || item.shareName || item.symbol || item.s || item.shareCode || '';
        if (rawCode) rawCode = rawCode.toUpperCase().replace(/\.AX$/i, '').trim();

        const hit = {
            ...item,
            code: rawCode || null,
            live: Number(item.live || item.price || item.last || item.p || 0),
            t: item.t || item.timestamp || fallbackTime
        };
        // --- FIX: Extract Symbol from Name if missing (e.g. "CBO" from "Name (ASX:CBO)") ---
        // Also normalize this extracted code.
        if (!hit.code && hit.name) {
            const match = hit.name.match(/\((?:ASX:)?([A-Z0-9]{3,4})\)/i);
            if (match) hit.code = match[1].toUpperCase().replace(/\.AX$/i, '').trim();
        }

        // --- ENRICHMENT I: Global Live Price Cache (Primary Source for Global Alerts) ---
        if (hit.code && AppState.livePrices instanceof Map && AppState.livePrices.has(hit.code)) {
            const live = AppState.livePrices.get(hit.code);
            // Polyfill Missing Data
            const hasOwnChange = (Math.abs(hit.change || hit.c || 0) > 0) || (Math.abs(hit.pct || hit.cp || 0) > 0);

            if (!hasOwnChange && live) {
                hit.live = Number(live.live || live.price || live.last || hit.live);
                hit.change = Number(live.change || live.c || 0);
                // NotificationUI checks 'pct', 'pctChange', 'changePercent', etc.
                // DataService provides 'pctChange'. Live prices from AppController have 'changeInPercent'.
                // We map to 'pct' (primary) and 'dayChangePercent' (fallback for UI).
                hit.pct = Number(live.changeInPercent || live.pct || live.pctChange || 0);
                hit.dayChangePercent = hit.pct;
            }
        }

        // --- ENRICHMENT II: User Watchlist Fallback ---
        // Notifications often lack the full day stats. We polyfill them from the live cache.
        if (hit.code && AppState.data.shares.length > 0) {
            const share = AppState.data.shares.find(s => s.code === hit.code);
            if (share) {
                // If name is missing or generic, use the master list name
                if (!hit.name) hit.name = share.name;

                // If price/live is 0, use current price
                if (hit.live === 0) hit.live = share.price;

                const hasOwnChange = (Math.abs(hit.change || hit.c || 0) > 0) || (Math.abs(hit.pct || hit.cp || 0) > 0);

                if (!hasOwnChange) {
                    hit.change = share.change;
                    hit.pct = share.dayChangePercent || share.changeInPercent;
                    // Ensure we map to the keys _renderCard expects too, if needed, but _renderCard checks 'change', 'pct'.
                    // _renderCard keys: pct, changeP, cp, p, changePercent, pctChange, dayChangePercent
                    hit.dayChangePercent = share.dayChangePercent;
                }
            }
        }
        return hit;
    });
}

export const notificationStore = new NotificationStore();
