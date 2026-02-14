/**
 * NotificationStore.js
 * Manages fetching, filtering, and persistence of Local and Global alerts.
 * Implements "Zero-Cost" architecture by reading central daily documents
 * and filtering client-side, rather than querying collections.
 */

import { db } from '../auth/AuthService.js';
import { AppState } from './AppState.js';
import { StateAuditor } from './StateAuditor.js';
// Import userStore to listen for Preference Updates
import { userStore } from '../data/DataService.js';
import { EVENTS, STORAGE_KEYS, DASHBOARD_SYMBOLS, SECTOR_INDUSTRY_MAP } from '../utils/AppConstants.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, setDoc, getDocFromServer, collection, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getBestShareMatch } from '../data/DataProcessor.js';

const APP_ID = "asx-watchlist-app";

export class NotificationStore {
    constructor() {
        this.settingsListenerUnsubscribe = null;

        // --- DIAGNOSTIC EXPOSURE (Requested by User) ---
        // usage: window.debugGSCF() in console
        window.debugGSCF = () => this.debugGSCF_Probe();
        // usage: window.debugDashboardLeak() in console
        window.debugDashboardLeak = () => this.debugDashboardLeak_Probe();

        this.listeners = [];
        this.scanData = {
            customHits: [], // All users' hits (Raw)
            globalMovers: { up: [], down: [] },
            globalHiLo: { high: [], low: [] }
        };
        this.dataTimestamp = null; // Store last update time from DB
        this.pinnedAlerts = [];
        this.scannerRules = { up: {}, down: {} }; // Capture rules
        this.marketIndexAlerts = []; // Market Index Stream Data
        this.unsubscribeMarketIndex = null; // Listener for Market Index
        this.lastViewed = { total: 0, custom: 0 };
        this.unsubscribePinned = null;
        this.unsubscribePrefs = null; // Subscription handle
        this.userId = null;
        this.alertTimestampCache = new Map(); // Session-based timestamp cache
        this._hiloSeenSet = new Set(); // SUPPRESSION: Tracks 52-week alerts shown this session
        this.isReady = false; // LOGIC HARDENING: Race condition guard
        this._notificationDebounceTimer = null; // DEBOUNCE: Timer for notification updates
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
                // Subscribe to Market Index Stream
                this._subscribeToMarketIndex();

                // Fetch data implies a network call. We do this once on init.
                await this.refreshDailyData();

                // LOGIC HARDENING: Mark store as ready AFTER data is loaded
                this.isReady = true;
                document.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_READY));

                // Initial Rule Fetch (Redundant if subscription works fast, but safe)
                await this.refreshScannerRules();
            }

            // --- BIND TO LIVE DATA UPDATES (Event-Driven) ---
            // Replaces manual calls from AppController and dead legacy events.
            StateAuditor.on('PRICES_UPDATED', () => {
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
            return;
        }

        try {
            this.unsubscribePrefs = userStore.subscribeToPreferences(userId, (prefs, metadata) => {
                if (prefs) {
                    // Update Local Rules
                    const data = prefs.scannerRules || {};
                    this.scannerRules = {
                        up: data.up || {},
                        down: data.down || {},
                        minPrice: (data.minPrice !== undefined && data.minPrice !== null) ? data.minPrice : null,
                        hiloMinPrice: (data.hiloMinPrice !== undefined && data.hiloMinPrice !== null) ? data.hiloMinPrice : null,
                        moversEnabled: data.moversEnabled, // Capture toggle
                        hiloEnabled: data.hiloEnabled,     // Capture 52W Toggle
                        personalEnabled: data.personalEnabled, // Capture Personal Toggle
                        excludePortfolio: prefs.excludePortfolio !== false, // Capture Override Toggle
                        activeFilters: Array.isArray(prefs.scanner?.activeFilters)
                            ? prefs.scanner.activeFilters.map(f => f.toUpperCase())
                            : null // Preserve 'null' for "All Sectors"
                    };

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
        this._notifyCountChange();
    }

    /**
     * Public API to update the store with fresh prices from background refresh.
     * @param {Map} prices 
     */
    updateLivePrices(prices) {
        // AppState.livePrices is already updated by AppController before calling this.
        // We just need to trigger a recalculation/notification.
        this._notifyCountChange();
    }


    /**
     * Fetches the 3 central daily documents: Custom Hits, Movers, HiLo.
     */
    async refreshDailyData() {
        if (!this.userId) return;

        try {
            const customRef = doc(db, `artifacts/${APP_ID}/alerts/CUSTOM_TRIGGER_HITS`);
            const moversRef = doc(db, `artifacts/${APP_ID}/alerts/DAILY_MOVERS_HITS`);
            const hiloRef = doc(db, `artifacts/${APP_ID}/alerts/DAILY_HILO_HITS`);

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
                this.scanData.customHits = this._filterStale(normalizeHits(data.hits || [], null));
            } else {
                this.scanData.customHits = [];
            }

            // FILTER: Source-Level Exclusion of Dashboard Symbols (XJO, XAO, etc.)
            // We do this AFTER normalization to ensure we catch "XJO.AX" as "XJO".
            // FILTER: Source-Level Exclusion of Dashboard Symbols (XJO, XAO, etc.)
            // We do this AFTER normalization to ensure we catch "XJO.AX" as "XJO".
            const filterDashboard = (list) => {
                return list.filter(h => {
                    const code = h.code || h.shareName;
                    if (!code) return false;

                    // --- ROBUST CENTRAL HELPER CHECK ---
                    if (this._isDashboardCode(code)) return false;

                    return true;
                });
            };

            if (hiloSnap.status === 'fulfilled' && hiloSnap.value.exists()) {
                const data = hiloSnap.value.data();
                const docTime = data.updatedAt;
                this.scanData.globalHiLo = {
                    high: this._filterStale(filterDashboard(normalizeHits(data.highHits || data.high || [], docTime))),
                    low: this._filterStale(filterDashboard(normalizeHits(data.lowHits || data.low || [], docTime)))
                };
            }

            if (moversSnap.status === 'fulfilled' && moversSnap.value.exists()) {
                const data = moversSnap.value.data();
                const docTime = data.updatedAt;

                const rawUp = data.upHits || data.up || [];
                const rawDown = data.downHits || data.down || [];

                this.scanData.globalMovers = {
                    up: this._filterStale(filterDashboard(normalizeHits(rawUp, docTime))),
                    down: this._filterStale(filterDashboard(normalizeHits(rawDown, docTime)))
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
            const rulesRef = doc(db, `artifacts/${APP_ID}/users/${this.userId}/preferences/config`);
            const snap = await getDocFromServer(rulesRef);
            if (snap.exists()) {
                const config = snap.data();
                // FIX: SettingsUI saves scanner settings under 'scannerRules' field in 'config' doc.
                const data = config.scannerRules || {};

                // Map to internal structure
                this.scannerRules = {
                    up: data.up || {},
                    down: data.down || {},
                    // FIX: Allow 0 vs Null for Global Limit too.
                    minPrice: (data.minPrice !== undefined && data.minPrice !== null) ? data.minPrice : null,
                    // FIX: Allow 0 (None). Use Nullish Coalescing.
                    hiloMinPrice: (data.hiloMinPrice !== undefined && data.hiloMinPrice !== null) ? data.hiloMinPrice : null,
                    // FIX: Preserve 'null' for "All Sectors" - null should NOT become empty array
                    activeFilters: (() => {
                        const raw = data.activeFilters ?? config.scanner?.activeFilters;
                        return Array.isArray(raw) ? raw.map(f => f.toUpperCase()) : null;
                    })(),
                    excludePortfolio: config.excludePortfolio !== false, // Capture Override Toggle
                    hiloEnabled: data.hiloEnabled // Capture 52-Week Toggle
                };
            }
        } catch (e) {
            console.error('[NotificationStore] Error fetching rules:', e);
        }
    }

    /**
     * Internal helper to retrieve scanner rules from AppState for filtering.
     */
    getScannerRules() {
        const rules = (AppState.preferences && AppState.preferences.scannerRules) ? AppState.preferences.scannerRules : {};
        // Ensure robust return of all fields
        return {
            up: rules.up || {},
            down: rules.down || {},
            minPrice: (rules.minPrice !== undefined && rules.minPrice !== null) ? Number(rules.minPrice) : 0,
            hiloMinPrice: (rules.hiloMinPrice !== undefined && rules.hiloMinPrice !== null) ? Number(rules.hiloMinPrice) : 0,
            moversEnabled: rules.moversEnabled !== false,
            hiloEnabled: rules.hiloEnabled !== false,
            personalEnabled: rules.personalEnabled !== false,
            excludePortfolio: AppState.preferences.excludePortfolio !== false,
            activeFilters: this.scannerRules.activeFilters // Use the normalized one from store
        };
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
        // EXCEPTION: If Override is ON, we must process list to find implicit items.
        const overrideOn = rules.excludePortfolio !== false;
        if (strictMode && !overrideOn) {
            const isDefined = (hasPct || hasDol);
            if (!isDefined) return [];
        }

        // Use Defaults for Comparison (0 if null/undefined)
        // logic allows 0 to match >0.
        // FIX: Strict Number Casting to avoid "0" (string) !== 0 (number) issues.
        const rulePct = rules.percentThreshold;
        const ruleDol = rules.dollarThreshold;

        const tPct = (rulePct === null || rulePct === undefined || rulePct === '') ? null : Number(rulePct);
        const tDol = (ruleDol === null || ruleDol === undefined || ruleDol === '') ? null : Number(ruleDol);
        const minPrice = (rules.minPrice === null || rules.minPrice === undefined) ? null : Number(rules.minPrice);

        // NEW LOGIC: Blank = Off for ALL containers.
        // For Increase/Decrease: 0 = Off.
        // For Limit Containers (Min Price): 0 = On (Show All).
        const hasTPct = rules.isHilo ? (tPct !== null) : (tPct !== null && tPct !== 0);
        const hasTDol = rules.isHilo ? (tDol !== null) : (tDol !== null && tDol !== 0);
        const hasMinPrice = (minPrice !== null || rules.isHilo); // Hilo can have null/zero min price

        // If both thresholds are OFF -> filter out this category
        if (!hasTPct && !hasTDol) return [];
        // If Min Price (Limit) is OFF -> filter out
        if (!hasMinPrice) return [];

        // OPTIMIZATION: Pre-calculate Muted Set for O(1) lookup
        const mutedCodes = new Set();
        if (AppState.data && AppState.data.shares) {
            AppState.data.shares.forEach(s => {
                if (s.muted) mutedCodes.add((s.shareName || '').toUpperCase());
            });
        }

        const result = hits.filter(hit => {
            // CONSTANTS & BYPASS LOGIC (Moved to Top for Reference Safety)
            // HARDENED: null = "All Sectors" - do NOT convert to empty array
            const activeFilters = rules.activeFilters; // Can be null (All), [] (None), or [...industries]
            const isAllSectors = (activeFilters === null || activeFilters === undefined);
            const isLocal = hit._isLocal === true;
            const overrideOn = rules.excludePortfolio !== false;
            const isTarget = (hit.intent === 'target' || hit.intent === 'TARGET');
            const shouldBypass = isTarget || hit._bypassFilters === true || (isLocal && overrideOn);

            // 1. Zombie Check
            // Block items with no meaningful movement. Handles undefined or NaN values.
            // EXCEPTION: Always allow 52-Week High/Low notifications even if daily move is flat.
            if (!rules.isHilo) {
                const pctZero = Number(hit.pct) === 0 || isNaN(Number(hit.pct));
                const changeZero = hit.change === undefined || Number(hit.change) === 0;
                if (pctZero && changeZero) return false;
            }

            // 2. Global Price Filter (Min Price)
            // Handle different property names (live, price, lastPrice)
            const price = hit.live || hit.price || hit.lastPrice || 0;
            const thresholdMin = minPrice || 0;

            // OVERRIDE LOGIC: 
            // If Override is ON, we bypass the global minPrice check for items in the user's watchlist (`shouldBypass`).
            // However, we still respect it for generic global alerts.
            if (!shouldBypass && thresholdMin > 0 && price < thresholdMin) {
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

            // 2c. MUTE FILTER (New Feature) - OPTIMIZED O(1)
            // Check if user has muted this stock in their portfolio
            const isMuted = mutedCodes.has((hit.code || hit.shareName || '').toUpperCase());
            if (isMuted) return false;

            // 2d. SCANNER INDUSTRY FILTER (User Request)
            // Block alerts from industries NOT in the activeFilters whitelist.
            // EXCEPTION 1: Always show if the stock is in the user's watchlist AND override is enabled.
            // EXCEPTION 2: Always show Price Targets (User Intent) regardless of sector.
            // EXCEPTION 3: If activeFilters is null, ALL sectors are allowed (no filtering).

            // Consolidate Industry Lookup
            let ind = (hit.Industry || hit.Sector || hit.industry || hit.sector || '').toUpperCase();
            if (!ind && hit.code) {
                if (AppState.livePrices instanceof Map) {
                    const priceData = AppState.livePrices.get(hit.code);
                    if (priceData) ind = (priceData.Industry || priceData.Sector || priceData.industry || priceData.sector || '').toUpperCase();
                }
                if (!ind && AppState.data.shares) {
                    const share = AppState.data.shares.find(s => s.code === hit.code);
                    if (share) ind = (share.industry || share.sector || share.Industry || share.Sector || '').toUpperCase();
                }
            }

            if (!shouldBypass && !isAllSectors) {
                // If Whitelist is explicitly empty array, block everything that isn't bypassed
                if (activeFilters.length === 0) return false;

                // STRICT FILTERING: If whitelist is active, item MUST match.
                // Previously allowed items with unknown sector (ind='') to pass. Now filtered.
                if (!ind || !activeFilters.includes(ind)) {
                    return false;
                }
            }

            // 2e. HIDDEN SECTOR FILTER
            const hiddenSectors = AppState.preferences?.hiddenSectors;
            if (hiddenSectors && Array.isArray(hiddenSectors) && hiddenSectors.length > 0) {
                if (ind && hiddenSectors.includes(ind)) {
                    if (!shouldBypass) return false;
                }
            }

            // 2f. 52-WEEK MILESTONE SUPPRESSION (Global Fix)
            // REMOVED: Suppressing in filterHits causes it to disappear from the list immediately.
            // Requirement was likely for Badge/Notification persistence.
            /*
            if (rules.isHilo && hit.code) {
                const dateKey = new Date().toISOString().split('T')[0];
                const seenKey = `${hit.code}|${hit.intent || 'hilo'}|${dateKey}`;
                if (this._hiloSeenSet.has(seenKey)) return false;
                this._hiloSeenSet.add(seenKey);
            }
            */

            // 3. Threshold Check
            // EXCEPTION: Targets and 52-Week Hi/Lo hits are explicit events. They bypass generic movement thresholds.
            // FIXED: "Override" (shouldBypass) strictly applies to FILTERS (Sector, Min Price), not thresholds.
            // Watchlist items MUST still meet the %/$ requirements to prevent noise.
            if (isTarget || rules.isHilo) return true;

            // TRUTH OVERRIDE: Use LIVE price data for threshold comparison
            // Backend data can be stale (e.g., -5% when live shows -1.8%)
            let valPct = Math.abs(Number(hit.pct) || 0);
            let valDol = Math.abs(Number(hit.change) || 0);

            // Check for fresher live data
            if (hit.code && AppState.livePrices instanceof Map) {
                const live = AppState.livePrices.get(hit.code);
                if (live) {
                    const livePct = Number(live.pctChange ?? live.changeInPercent ?? live.pct ?? live.dayChangePercent ?? 0);
                    const liveDol = Number(live.change ?? live.dayChange ?? live.c ?? 0);
                    // Only use live if we have valid data (price > 0 proves it's real)
                    if (Number(live.live || live.price || live.last || 0) > 0) {
                        valPct = Math.abs(livePct);
                        valDol = Math.abs(liveDol);
                    }
                }
            }

            if (hasTPct && hasTDol) {
                return (valPct >= (tPct || 0)) || (valDol >= (tDol || 0));
            } else if (hasTPct) {
                return valPct >= (tPct || 0);
            } else if (hasTDol) {
                return valDol >= (tDol || 0);
            }

            return true;
        });


        return result;
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
            const metadata = snap.metadata;


            if (snap.exists()) {
                const data = snap.data();
                this.pinnedAlerts = Array.isArray(data.pinnedAlerts) ? data.pinnedAlerts : [];
                this.scannerRules = data.scannerRules || { up: {}, down: {} };

                // --- CROSS-DEVICE SYNC OF READ STATE ---
                // DISABLED: Session-Only Notifications requested.
                // if (data.lastViewedAlerts && data.lastViewedAlerts > this.lastViewedTime) {
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
        let clientTargets = this._generateClientSideWatchlistAlerts();

        // PERSONAL ALERTS FILTER:
        // If Personal Alerts is OFF, suppress:
        // 1. Explicit Targets (intent: 'target' -> Set in Add Share Modal)
        // 2. Pinned Alerts (Handled at return)
        // NOTE: We KEEP 'mover' and 'hilo' (52W) as they represent Market Events for the watchlist,
        // and are governed by Global 'Movers'/'52-Week' toggles.
        const rules = this.getScannerRules();
        if (rules.personalEnabled === false) {
            clientTargets = clientTargets.filter(t => t.intent !== 'target');
        }

        // MERGE FIX: Deduplicate Server vs Client Hits.
        // Normalize 'target-hit' vs 'target' to ensure matches work.
        const normalizeIntent = (i) => (i || '').toUpperCase().replace('-HIT', '');

        const clientSignatures = new Set(clientTargets.map(h => {
            const sig = `${h.code}|${normalizeIntent(h.intent)}`;
            return sig;
        }));

        // Filter Server Hits: Drop if covered by Client
        const uniqueServerHits = this.scanData.customHits.filter(h => {
            // Also suppress Server-Side Targets if Personal is OFF
            if (rules.personalEnabled === false) {
                const intent = normalizeIntent(h.intent);
                if (intent === 'TARGET') return false;
            }

            const sig = `${h.code}|${normalizeIntent(h.intent)}`.toUpperCase();
            const isDuplicate = clientSignatures.has(sig);
            return !isDuplicate;
        });

        // Merge Hits: Append Client Targets to Unique Server Hits
        const rawHits = [...uniqueServerHits, ...clientTargets];

        // OPTIMIZATION: Pre-calculate Muted Set for O(1) lookup
        const mutedCodes = new Set();
        if (AppState.data && AppState.data.shares) {
            AppState.data.shares.forEach(s => {
                if (s.muted) mutedCodes.add((s.shareName || '').toUpperCase());
            });
        }

        // DATA INTEGRITY FIX:
        // Server Hits might be stale (e.g. PrevClose mismatch).
        // If we have fresher data in AppState.livePrices, OVERWRITE the hit stats.
        const verifiedHits = rawHits.map(h => {
            // Clone to avoid mutation side-effects
            const hit = { ...h };
            if (hit.code && AppState.livePrices instanceof Map && AppState.livePrices.has(hit.code)) {
                const fresh = AppState.livePrices.get(hit.code);
                // Only overwrite if we have valid numbers
                if (fresh.live > 0 && fresh.prevClose > 0) {
                    hit.live = fresh.live;
                    hit.prevClose = fresh.prevClose;
                    hit.change = fresh.change;
                    hit.pct = fresh.pctChange;
                    // Re-calculate direction based on fresh data
                    hit.direction = hit.change > 0 ? 'up' : (hit.change < 0 ? 'down' : 'neutral');
                }

                // FIX: Enrich 52-Week Data if available (for UI range display)
                if (fresh.high52 || fresh.high_52 || fresh.high) hit.high52 = Number(fresh.high52 || fresh.high_52 || fresh.high);
                if (fresh.low52 || fresh.low_52 || fresh.low) hit.low52 = Number(fresh.low52 || fresh.low_52 || fresh.low);
            }
            return hit;
        });

        // 2. Apply Filters (Rules, Muted, Pinned)
        return this.filterLocalHits(verifiedHits, rules, mutedCodes, this.pinnedAlerts);
    }

    /**
     * Filters a list of raw hits based on user preferences and rules.
     * This function is used by both `getGlobalAlerts` and `getLocalAlerts`.
     * @param {Array<Object>} rawHits - The unfiltered list of alert hits.
     * @param {Object} rules - The scanner rules from user preferences.
     * @param {Set<string>} mutedCodes - A set of uppercase stock codes that are muted.
     * @param {Array<Object>} pinnedAlerts - The list of pinned alerts.
     * @returns {Array<Object>} The filtered list of alert hits.
     */
    filterLocalHits(rawHits, rules, mutedCodes, pinnedAlerts) {


        const filtered = rawHits.filter(hit => {
            const match = String(hit.userId) === String(this.userId);
            if (!match) return false;

            // Debug specific stock
            // const isDebug = (hit.code === 'BHP' || hit.code === 'CBA' || (hit.code && hit.code.includes('YOUR_STOCK_CODE_HERE'))); // Replace if known
            // if (isDebug) console.log(`[NotificationStore] Checking ${hit.code} (${hit.intent})...`);


            // --- TARGET HIT GUARD ---
            // If it's a target alert, re-validate against CURRENT price to ensure it's still a hit.
            // This prevents "Displacement" where a mover is hidden by a target card that is no longer valid.
            if (hit.intent === 'target' || hit.intent === 'target-hit' || (hit.intent || '').toLowerCase() === 'target') {
                const cleanC = (hit.code || '').toUpperCase();
                const share = getBestShareMatch(AppState.data.shares, cleanC);
                if (share) {
                    const target = Number(share.targetPrice || 0);
                    const direction = share.targetDirection || 'below';
                    const liveRef = AppState.livePrices?.get(cleanC);
                    const currentPrice = liveRef ? Number(liveRef.live || liveRef.price || 0) : hit.live;

                    if (target > 0 && currentPrice > 0) {
                        const isCurrentlyHit = (direction === 'above' && currentPrice >= (target - 0.0001)) ||
                            (direction === 'below' && currentPrice <= (target + 0.0001));

                        if (!isCurrentlyHit) {
                            // NOT a hit anymore - Drop this specific target alert.
                            // If there's an underlying mover alert, it will survive and become master.
                            return false;
                        }
                    }
                }
            }

            // --- ZOMBIE CHECK (FINAL GATEKEEPER) ---
            // Re-verify against AppState.livePrices to ensure we don't show static/stale server hits.
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

            // --- MUTE FILTER (Custom Triggers Early Exit) - OPTIMIZED O(1) ---
            const code = hit.code || hit.shareName || hit.symbol;
            if (code && mutedCodes && typeof mutedCodes.has === 'function' && mutedCodes.has(code.toUpperCase())) return false;

            // DEBUG: Watchlist Override / Threshold Trace
            const debugRules = this.getScannerRules() || {};
            const debugOverride = debugRules.excludePortfolio !== false;
            const debugMinPrice = debugRules.minPrice || 0;
            const debugHitPrice = Number(hit.price || hit.last || 0);

            // if (code === 'BHP' || code === 'CBA' || price < 1.0) { // Filter noise
            // }

            // --- EXCLUDE DASHBOARD SYMBOLS ---
            // Fix: Check against Registry Constant (Both exact match and fuzzy logic)
            if (hit.code) {
                if (this._isDashboardCode(hit.code)) return false;
            }

            // --- SECTOR FILTER (Enforce if Override is OFF) ---
            const rules = this.getScannerRules() || {};
            const overrideOn = rules.excludePortfolio !== false;
            // HARDENED: null = "All Sectors" - do NOT convert to empty array
            const activeFilters = rules.activeFilters; // Can be null (All), [] (None), or [...industries]
            const isAllSectors = (activeFilters === null || activeFilters === undefined);
            const isTarget = (hit.intent === 'target' || hit.intent === 'TARGET');
            const shouldBypass = isTarget || overrideOn; // In localAlerts, it's always "local"

            // Consolidate Industry Lookup
            let ind = (hit.Industry || hit.Sector || hit.industry || hit.sector || '').toUpperCase();
            if (!ind && hit.code) {
                if (AppState.livePrices instanceof Map) {
                    const priceData = AppState.livePrices.get(hit.code);
                    if (priceData) ind = (priceData.Industry || priceData.Sector || priceData.industry || priceData.sector || '').toUpperCase();
                }
                if (!ind && AppState.data.shares) {
                    const share = AppState.data.shares.find(s => s.code === hit.code);
                    if (share) ind = (share.industry || share.sector || share.Industry || share.Sector || '').toUpperCase();
                }
            }

            // EXCEPTION: Targets are exempt from sector filtering
            // EXCEPTION: If activeFilters is null, ALL sectors are allowed (no filtering)
            if (!shouldBypass && !isAllSectors) {
                // If Whitelist is explicitly empty array, block everything
                if (activeFilters.length === 0) return false;

                if (ind && !activeFilters.includes(ind)) return false;
            }

            // --- HIDDEN SECTOR FILTER ---
            const hiddenSectors = AppState.preferences?.hiddenSectors;
            if (hiddenSectors && Array.isArray(hiddenSectors) && hiddenSectors.length > 0) {
                if (ind && hiddenSectors.includes(ind)) {
                    if (!shouldBypass) return false;
                }
            }

            // --- UNIFIED PRICE AUTHORITY: Cross-Check Reported Data vs Live Data ---
            const live = (AppState.livePrices instanceof Map) ? AppState.livePrices.get(hit.code) : null;
            if (live) {
                const livePrice = Number(live.live || live.price || live.last || 0);
                const prevClose = Number(live.prevClose || live.close || 0);

                // Re-calculate verified change using live prices ONLY
                const verifiedChange = (prevClose > 0) ? (livePrice - prevClose) : 0;
                const verifiedPct = (prevClose > 0) ? ((verifiedChange / prevClose) * 100) : 0;

                // 1. DIRECTION LOCKING: If reported direction (~hit.pct) contradicts actual live trend, block it.
                // This stops "dual directional alerts" if the backend is stale.
                const reportedPct = Number(hit.pct || 0);
                if (Math.abs(reportedPct) > 0.05 && Math.abs(verifiedPct) > 0.05) {
                    const sameDirection = (reportedPct > 0 && verifiedPct > 0) || (reportedPct < 0 && verifiedPct < 0);
                    if (!sameDirection) {
                        return false;
                    }
                }

                // 2. PHANTOM DATA CHECK: If reporting a massive move but live data shows no move, block it.
                const isPhantom = Math.abs(reportedPct) > 1.0 && Math.abs(verifiedPct) < 0.1;
                if (isPhantom) {
                    hit._isPhantom = true; // Mark for UI health check
                    return false;
                }

                // Update hit with verified values to ensure UI matches reality
                hit.live = livePrice;
                hit.change = verifiedChange;
                hit.pct = verifiedPct;
            }

            // --- 52-WEEK MILESTONE SUPPRESSION ---
            if (hit.intent === 'high' || hit.intent === 'low' || hit.intent === 'hilo') {
                // JIT Enrichment (if price missing)
                let price = Number(hit.live || hit.price || hit.last || 0);
                if (price === 0 && hit.code && AppState.livePrices) {
                    const liveData = AppState.livePrices.get(hit.code);
                    if (liveData) price = Number(liveData.live || liveData.price || liveData.last || 0);
                }

                if (rules.hiloMinPrice > 0 && price < rules.hiloMinPrice) return false;

                // --- SUPPRESSION: Re-evaluating Once-per-day ---
                // If we suppress here, it disappears from the list after one render.
                // We'll keep it visible for the remainder of the day/session.
                /*
                const dateKey = new Date().toISOString().split('T')[0];
                const seenKey = `${hit.code}|${hit.intent}|${dateKey}`;
                if (this._hiloSeenSet.has(seenKey)) return false;
                this._hiloSeenSet.add(seenKey);
                */
            }

            // --- STRICT FILTER FOR PERSONAL MOVERS (RMD FIX) ---
            // FIX: Normalize intent to catch server-side 'MOVER' vs client 'mover'
            // ALSO: Catch items with NO intent (Implied Movers) to ensure they don't bypass thresholds.
            const intent = (hit.intent || '').toLowerCase();
            const type = (hit.type || '').toLowerCase();

            // 0. 52-WEEK HIT RECOGNITION (Server-Side)
            if (intent === '52w-high' || intent === '52w-low') {
                // Determine if strict minPrice should apply (using hiloMinPrice logic form above)
                if (rules.hiloEnabled === false) return false;
                const price = Number(hit.live || hit.price || hit.last || 0);
                if (rules.hiloMinPrice > 0 && price < rules.hiloMinPrice) return false;
                return true; // Allow valid 52W hits
            }

            // 1. MOVER RECOGNITION (Expanded to catch 'gainers', 'losers', 'up', 'down')
            const isMoverIntent = intent === 'mover' || intent === 'up' || intent === 'down' || intent === 'gainers' || intent === 'losers';
            if (isMoverIntent || !intent) {
                // 1. Global Feature Toggle: If Movers are disabled entirely, block EVERYTHING.
                if (rules.moversEnabled === false) return false;

                // FIX: Respect explicit intent for direction if available
                let isDown = (hit.direction || '').toLowerCase() === 'down' || (hit.pct || 0) < 0;
                if (intent === 'up' || intent === 'gainers') isDown = false;
                if (intent === 'down' || intent === 'losers') isDown = true;

                const activeRules = isDown ? (rules.down || {}) : (rules.up || {});

                const thresholdPct = activeRules.percentThreshold || 0;
                const thresholdDol = activeRules.dollarThreshold || 0;

                // FIX: STRICT ZERO CHECK
                // If the user set "Increase Threshold" to "None" (0), they want NO ALERTS.
                // We must block backend hits in this case.
                if (thresholdPct === 0 && thresholdDol === 0) return false;

                // 2. Override Logic: If Override is ON, implicit items bypass NUMERIC Thresholds (but not Disabled ones).
                // User Requirement: Override ON = Bypass Thresholds. Override OFF = Respect Thresholds.
                // REMOVED: if (overrideOn) return true;

                // --- JIT ENRICHMENT FOR ACCURATE FILTERING & DISPLAY ---
                // Use Live Data if available, otherwise fallback to snapshot
                let pct = Math.abs(Number(hit.pct || hit.changeInPercent || hit.changeP || 0));
                let dol = Math.abs(Number(hit.change || hit.c || 0));

                // Base Price (Use live or snapshot)
                let price = Number(hit.price || hit.last || 0);

                if (hit.code && AppState.livePrices instanceof Map) {
                    const live = AppState.livePrices.get(hit.code);
                    if (live) {
                        // Robust check for various API keys
                        const lPct = Number(live.changeInPercent ?? live.pct ?? live.pctChange ?? live.dayChangePercent ?? 0);
                        const lDol = Number(live.change ?? live.c ?? live.dayChange ?? 0);

                        // Only override if we have valid non-zero data (or if price exists to prove it's live)
                        if (live.live || live.price || Math.abs(lPct) > 0) {
                            pct = Math.abs(lPct);
                            dol = Math.abs(lDol);
                        }
                        // Update Price from Live
                        if (live.price || live.last) price = Number(live.price || live.last);

                        // ENRICHMENT: Update High/Low 52W from Live Data (Freshness Fix)
                        if (live.high > 0) hit.high = live.high;
                        if (live.low > 0) hit.low = live.low;
                        // Also map to explicit props for UI
                        hit.high52 = hit.high;
                        hit.low52 = hit.low;
                    }
                }

                // 3. Global Min Price Filter (Enforce UNIVERSALLY as per user request)
                // "Ignore stocks below..." rule applies to Portfolio items too now.
                const minPrice = rules.minPrice || 0;
                if (minPrice > 0 && price < minPrice) {
                    return false;
                }

                // Threshold Check
                const metPct = (thresholdPct > 0 && pct >= thresholdPct);
                const metDol = (thresholdDol > 0 && dol >= thresholdDol);
                if (!metPct && !metDol) {
                    return false;
                }
            }

            // --- HEARTBEAT SILENCE: Filter out items with no movement AND no recognized intent ---
            const hasMovement = Math.abs(hit.pct || 0) > 0 || Math.abs(hit.change || 0) > 0;
            const hasIntent = hit.intent && (hit.intent === 'target' || hit.intent.includes('hilo') || hit.intent === 'mover');
            if (!hasMovement && !hasIntent) return false;

            return true;
        });

        // 2. Merge with Pinned (Avoid duplicates if pinned item is also in today's hits?)
        // Pinned items might be from past days.
        // We show ALL pinned items at the top.
        // Then remaining daily hits.

        // Duplicate check set
        const consolidated = new Map();
        // REMOVED DUPLICATE: mutedCodes is already defined at top of function.
        // const mutedCodes = new Set();
        // if (AppState.data && AppState.data.shares) {
        //    AppState.data.shares.forEach(s => {
        //        if (s.muted) mutedCodes.add(s.shareName);
        //    });
        // }

        // Helper to merge or add - UPDATED WITH INTENT PRIORITY
        const addOrMerge = (hit) => {
            const code = hit.code || hit.shareName;
            if (!code) return;

            const getPriority = (h) => {
                const i = (h.intent || '').toLowerCase();
                // 1. TARGET (Highest priority when HIT - per user request to take precedence)
                if (i === 'target' || i === 'target-hit') return 200;
                // 2. MOVERS (Second priority)
                if (i === 'mover' || i === 'up' || i === 'down' || i === 'gainers' || i === 'losers') return 100;
                // 3. HI/LO (52W)
                if (i.includes('hilo') || i.includes('52')) return 50;
                return 0;
            };

            if (!consolidated.has(code)) {
                const master = { ...hit, matches: [hit] };
                consolidated.set(code, master);
            } else {
                const master = consolidated.get(code);
                master.matches.push(hit);

                // UPGRADE MASTER: If this new hit has higher priority than current master
                if (getPriority(hit) > getPriority(master)) {
                    // Update master fields while preserving matches
                    const matches = master.matches;
                    Object.assign(master, hit);
                    master.matches = matches;
                }
            }
        };

        filtered.forEach(addOrMerge);
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
            pinned: (rules.personalEnabled !== false) ? this.pinnedAlerts : [],
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
            // Exclude Indices/Currencies (Strict Helper)
            if (this._isDashboardCode(item.code)) return false;

            if (item.code.startsWith('.')) return false;

            // Robust Property Access
            const pct = item.pctChange ?? item.changeInPercent ?? item.pct ?? item.dayChangePercent ?? 0;
            const change = item.change ?? item.c ?? item.dayChange ?? 0;

            // Must have valid change
            if (Math.abs(pct) === 0 && Math.abs(change) === 0) return false;

            return true;
        });

        // 1. Gainers (Sort by % Change DESC, then by $ Change DESC)
        const gainers = [...candidates]
            .filter(i => (i.pctChange ?? i.changeInPercent ?? i.pct ?? 0) > 0)
            .sort((a, b) => {
                const pctA = a.pctChange ?? a.changeInPercent ?? a.pct ?? 0;
                const pctB = b.pctChange ?? b.changeInPercent ?? b.pct ?? 0;

                // Rounding for tie detection (Matches UI)
                const pAR = Math.round(pctA * 100);
                const pBR = Math.round(pctB * 100);

                if (pBR !== pAR) return pBR - pAR; // Primary: Percentage DESC

                const chgA = Math.abs(a.change ?? a.dayChange ?? a.c ?? 0);
                const chgB = Math.abs(b.change ?? b.dayChange ?? b.c ?? 0);
                return chgB - chgA; // Secondary: Dollar magnitude DESC
            })
            .slice(0, 500)
            .map(i => ({ ...this._mapPriceToHit(i), intent: 'mover', type: 'up' }));

        // 2. Losers (Sort by % Change ASC -> Most Negative First, then by $ Change DESC Magnitude)
        const losers = [...candidates]
            .filter(i => (i.pctChange ?? i.changeInPercent ?? i.pct ?? 0) < 0)
            .sort((a, b) => {
                const pctA = a.pctChange ?? a.changeInPercent ?? a.pct ?? 0;
                const pctB = b.pctChange ?? b.changeInPercent ?? b.pct ?? 0;

                // Rounding for tie detection (Matches UI)
                const pAR = Math.round(pctA * 100);
                const pBR = Math.round(pctB * 100);

                if (pAR !== pBR) return pAR - pBR; // Primary: Percentage ASC (Most Negative First)

                const chgA = Math.abs(a.change ?? a.dayChange ?? a.c ?? 0);
                const chgB = Math.abs(b.change ?? b.dayChange ?? b.c ?? 0);
                return chgB - chgA; // Secondary: Dollar magnitude DESC (Biggest loss first)
            })
            .slice(0, 500)
            .map(i => ({ ...this._mapPriceToHit(i), intent: 'mover', type: 'down' }));

        // 3. 52-Week Highs (Price >= 99% of 52w High)
        // Sort by % Change DESC (Biggest movers at highs)
        // FIX: DataService maps High52 -> .high, Low52 -> .low
        // SLICE: Increase to 2500 (Full Market) to ensure we don't drop valid stocks due to penny stock crowding before MinPrice filter.
        const highs = [...candidates]
            .filter(i => {
                const price = i.live || i.price || i.lastPrice || 0;
                return i.high > 0 && price >= (i.high * 0.99);
            })
            .sort((a, b) => {
                const pA = a.pctChange ?? a.changeInPercent ?? a.pct ?? 0;
                const pB = b.pctChange ?? b.changeInPercent ?? b.pct ?? 0;
                const pAR = Math.round(pA * 100);
                const pBR = Math.round(pB * 100);
                if (pBR !== pAR) return pBR - pAR;
                return Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0);
            })
            .slice(0, 2500)
            .map(i => ({ ...this._mapPriceToHit(i), type: 'high', intent: 'hilo-up' }));

        // 4. 52-Week Lows (Price <= 101% of 52w Low)
        // Sort by % Change ASC (Biggest drops at lows)
        const lows = [...candidates]
            .filter(i => {
                const price = i.live || i.price || i.lastPrice || 0;
                return i.low > 0 && price <= (i.low * 1.01);
            })
            .sort((a, b) => {
                const pA = a.pctChange ?? a.changeInPercent ?? a.pct ?? 0;
                const pB = b.pctChange ?? b.changeInPercent ?? b.pct ?? 0;
                const pAR = Math.round(pA * 100);
                const pBR = Math.round(pB * 100);
                if (pAR !== pBR) return pAR - pBR;
                return Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0);
            })
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
            live: Number(priceObj.live || priceObj.price || priceObj.lastPrice || 0), // Robust Price
            change: Number(priceObj.change || priceObj.dayChange || priceObj.c || 0),
            pct: Number(priceObj.pctChange ?? priceObj.changeInPercent ?? priceObj.pct ?? priceObj.dayChangePercent ?? 0), // Robust Map
            dayChangePercent: Number(priceObj.pctChange ?? priceObj.changeInPercent ?? priceObj.pct ?? 0), // Redundancy for UI
            high: priceObj.high || 0, // Pass 52W High
            low: priceObj.low || 0,   // Pass 52W Low
            t: this._getStableTimestamp ? this._getStableTimestamp(`${priceObj.code} -global`) : Date.now()
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
        // FORCE HYDRATION: Always prefer client-side calculation for "Dumb Pipe" accuracy
        const isBackendSparse = true; // (rawGlobalUp.length + rawGlobalDown.length) < 20;

        if (isBackendSparse) {
            // Backend data sparse (<20). Triggering Client-Side Hydration (Silent).
            const hydrated = this._hydrateFromClientCache();
            if (hydrated.up.length > 0) rawGlobalUp = hydrated.up;
            if (hydrated.down.length > 0) rawGlobalDown = hydrated.down;


            // Also hydrate Hi/Lo if we are generating data
            if (hydrated.high.length > 0) rawGlobalHigh = hydrated.high;
            if (hydrated.low.length > 0) rawGlobalLow = hydrated.low;
        }



        const rules = this.getScannerRules() || {};

        // OPTIMIZATION: Pre-calculate Muted Set for Global usage too
        const mutedCodes = new Set();
        if (AppState.data && AppState.data.shares) {
            AppState.data.shares.forEach(s => {
                if (s.muted) mutedCodes.add((s.shareName || '').toUpperCase());
            });
        }

        // 2. Get Local Data (Portfolio/Watchlist)
        // We want to merge "Movers" from local into Global Lists.
        // Local Alerts structure: { pinned: [], fresh: [] }
        // We filter 'fresh' for movers.
        const local = this.getLocalAlerts();
        const localMovers = (local.fresh || []).filter(item => item.intent === 'mover' || item.intent === 'up' || item.intent === 'down');

        // Split Local by Direction - STRICT SIGN CHECK
        // Using 'type' label is risky if price flipped. Trust the math.
        const localUp = localMovers.filter(i => (Number(i.pct) || 0) > 0);
        const localDown = localMovers.filter(i => (Number(i.pct) || 0) < 0);

        // 3. Merge Strategies (Dedup by Code)
        const personalEnabled = rules.personalEnabled !== false; // Check Personal Alerts Preference

        const mergeLists = (globalList, localList) => {
            const map = new Map();
            // Add Global First
            (globalList || []).forEach(item => {
                if (item.code) map.set(item.code, item);
            });

            // Add Local ONLY if Personal Alerts are Enabled
            if (personalEnabled) {
                // Add Local (Override or Append?)
                // Local is usually "live" so might be fresher. Let's overwrite global with local if collision.
                (localList || []).forEach(item => {
                    if (item.code) map.set(item.code, {
                        ...item,
                        _isLocal: true,
                        // If Override pref is ON, explicitly flag local items to bypass global filters later
                        _bypassFilters: rules.excludePortfolio !== false
                    });
                });
            }
            return Array.from(map.values());
        };

        // Filter Movers
        const movers = {};
        // Strict Mode Logic: 
        // If bypassStrict is TRUE, strictMode is FALSE.
        // If bypassStrict is FALSE (Default), strictMode is TRUE (Original Behavior).
        const strictMode = !bypassStrict;
        const overrideOn = rules.excludePortfolio !== false;

        if (rules.moversEnabled !== false) {
            // MERGE BEFORE FILTERING? 
            // The backend data is raw (or hydrated). The local data is already filtered by getLocalAlerts logic.
            // We merge them now.

            let mergedUp = mergeLists(rawGlobalUp, localUp);
            let mergedDown = mergeLists(rawGlobalDown, localDown);

            // FORCE FINAL SORT (Desc for Up, Asc for Down)
            // FORCE FINAL SORT (Desc for Up, Asc for Down)
            mergedUp = mergedUp.filter(i => (Number(i.pctChange) || Number(i.pct) || 0) > 0);
            mergedUp.sort((a, b) => (Number(b.pctChange) || Number(b.pct) || 0) - (Number(a.pctChange) || Number(a.pct) || 0));

            mergedDown = mergedDown.filter(i => (Number(i.pctChange) || Number(i.pct) || 0) < 0);
            mergedDown.sort((a, b) => (Number(a.pctChange) || Number(a.pct) || 0) - (Number(b.pctChange) || Number(b.pct) || 0));

            // Pass Global minPrice, activeFilters, and excludePortfolio into filterHits rules
            // FIX: Remove '|| 0' from minPrice. Allow null (Blank) to pass through as "Off".
            // FIX: If activeFilters is null/undefined, it means "Show All". Populate with ALL sectors.
            // If it is [], it means "None" (Block All).

            const allSectors = Object.values(SECTOR_INDUSTRY_MAP).flat().map(s => s.toUpperCase());
            const userFilters = rules.activeFilters; // Can be null (All) or [] (None)
            // FIX: Treat empty array as "Show All" (null) to prevent accidental blocking of all global alerts
            const resolveFilters = (f) => (f === null || f === undefined || (Array.isArray(f) && f.length === 0)) ? null : f;

            const upRules = {
                ...(rules.up || {}),
                minPrice: rules.minPrice,
                activeFilters: resolveFilters(userFilters),
                excludePortfolio: false // GLOBAL MOVER RULES: Always respect filters (ignore watchlist override)
            };
            const downRules = {
                ...(rules.down || {}),
                minPrice: rules.minPrice,
                activeFilters: resolveFilters(userFilters),
                excludePortfolio: false // GLOBAL MOVER RULES: Always respect filters (ignore watchlist override)
            };

            // Fix Argument Mismatch: filterHits(rawHits, rules, strictMode)
            // filterHits returns an ARRAY (not an object with .fresh)
            const upResult = this.filterHits(mergedUp, upRules, strictMode);
            const downResult = this.filterHits(mergedDown, downRules, strictMode);

            movers.up = Array.isArray(upResult) ? upResult : [];
            movers.down = Array.isArray(downResult) ? downResult : [];
        }

        // Filter Hi/Lo
        // FIX: If hiloMinPrice is NULL (Blank) OR 0, Disable. User must set > 0 to enable.
        // NEW: Respect Explicit "52W Notifications" Switch.
        const hiloLimit = rules.hiloMinPrice;
        const hiloEnabled = (rules.hiloEnabled !== false);

        // Merge Local HiLo? (User didn't explicitly ask, but consistent).
        // Local Alerts includes 'hilo'.
        const localHilo = (local.fresh || []).filter(item => item.intent === 'hilo' || item.intent.includes('hilo'));
        const localHigh = localHilo.filter(i => i.type === 'high');
        const localLow = localHilo.filter(i => i.type === 'low');

        // LOGIC: If Hilo Disabled, but Override ON -> Merge Local Only.
        let mergedHigh = hiloEnabled ? mergeLists(rawGlobalHigh, localHigh) : (overrideOn ? localHigh : []);
        let mergedLow = hiloEnabled ? mergeLists(rawGlobalLow, localLow) : (overrideOn ? localLow : []);

        // FORCE FINAL SORT for HiLo (Based on PCT Change, as requested)
        if (hiloEnabled || overrideOn) {
            // Highs: Biggest Gainers First
            mergedHigh.sort((a, b) => (b.pctChange || b.pct || 0) - (a.pctChange || a.pct || 0));
            // Lows: Biggest Losers First
            mergedLow.sort((a, b) => (a.pctChange || a.pct || 0) - (b.pctChange || b.pct || 0));
        }

        // Match Global minPrice for HiLo too. Treat Blank minPrice as Off (null).
        // Treat Null activeFilters as Show All.
        const allSectorsHilo = Object.values(SECTOR_INDUSTRY_MAP).flat().map(s => s.toUpperCase());
        const userFiltersHilo = rules.activeFilters;
        // FIX: Treat empty array as "Show All" (null) for HiLo too
        const resolveFiltersHilo = (f) => (f === null || f === undefined || (Array.isArray(f) && f.length === 0)) ? null : f;

        const hiloRules = {
            percentThreshold: 0,
            dollarThreshold: 0,
            minPrice: rules.hiloMinPrice ?? 0, // Default to 0 (None) to ensure alerts show
            activeFilters: resolveFiltersHilo(userFiltersHilo),
            excludePortfolio: false, // GLOBAL HILO RULES: Always respect filters (ignore watchlist override)
            isHilo: true
        };

        const enrichHilo = (list) => {
            return list.map(hit => {
                if (hit.code && AppState.livePrices instanceof Map) {
                    const live = AppState.livePrices.get(hit.code);
                    if (live) {
                        if (live.high > 0) hit.high = live.high;
                        if (live.low > 0) hit.low = live.low;
                        // DO NOT overwrite high52/low52 with daily high/low!
                        // They are distinct values.
                    }
                }
                return hit;
            });
        };

        // filterHits returns an ARRAY (not an object with .fresh)
        const hiloHighResult = hiloEnabled ? this.filterHits(enrichHilo(mergedHigh), hiloRules, strictMode) : [];
        const hiloLowResult = hiloEnabled ? this.filterHits(enrichHilo(mergedLow), hiloRules, strictMode) : [];

        // FRESHNESS FILTER: Remove stale 52w items (0% movement = not a current hit)
        const filterFresh = (items) => {
            return items.filter(item => {
                let pct = 0;
                if (item.code && AppState.livePrices instanceof Map) {
                    const live = AppState.livePrices.get(item.code);
                    if (live) {
                        pct = Math.abs(Number(live.dayChangePercent ?? live.pctChange ?? live.pct ?? 0));
                    }
                }
                if (pct === 0) {
                    pct = Math.abs(Number(item.pct ?? item.pctChange ?? 0));
                }
                return pct > 0; // Only keep items with movement
            });
        };

        const hilo = {
            high: Array.isArray(hiloHighResult) ? filterFresh(hiloHighResult) : [],
            low: Array.isArray(hiloLowResult) ? filterFresh(hiloLowResult) : []
        };

        // FINAL SAFETY SORT: Enforce strict order on output
        // FIX: Use parseFloat to handle potential string inputs (e.g. "0.5%") which Number() chokes on.
        // FIX: Use parseFloat to handle potential string inputs (e.g. "0.5%") which Number() chokes on.
        // ENHANCED FIX: Look up Live Data if missing, AND ENFORCE SIGN to match UI.
        const getDisplayPct = (i, type) => {
            let val = 0;

            // ALWAYS try live data FIRST (Truth Override)
            if (i.code && AppState.livePrices && AppState.livePrices instanceof Map) {
                const code = String(i.code).toUpperCase();
                const cleanCode = code.replace(/\.AX$/i, '').trim();
                const live = AppState.livePrices.get(cleanCode) || AppState.livePrices.get(code);

                if (live) {
                    val = parseFloat(live.dayChangePercent ?? live.changeInPercent ?? live.pctChange ?? live.pct ?? 0);
                    // Write back so UI and tests use same value
                    i.pct = val;
                }
            }

            // Fallback to backend value if no live data
            if (val === 0) {
                val = parseFloat(i.pct || i.pctChange || i.changeInPercent || i.changeP || i.changePercent || 0);
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

        // Helper to get live $ change
        const getLiveChangeDol = (item) => {
            let dol = Math.abs(Number(item.change || item.c || 0));
            if (item.code && AppState.livePrices instanceof Map) {
                const live = AppState.livePrices.get(item.code);
                if (live && Number(live.live || live.price || 0) > 0) {
                    dol = Math.abs(Number(live.change ?? live.dayChange ?? live.c ?? dol));
                }
            }
            return dol;
        };

        // Get thresholds from rules
        const pctThresh = Number(rules.up?.percentThreshold ?? 0);
        const dolThresh = Number(rules.up?.dollarThreshold ?? 0);

        const sortDesc = (type) => (a, b) => {
            const valA = Math.abs(getDisplayPct(a, type));
            const valB = Math.abs(getDisplayPct(b, type));
            const dolA = getLiveChangeDol(a);
            const dolB = getLiveChangeDol(b);

            // Determine if each met % threshold
            const aMetPct = valA >= pctThresh && pctThresh > 0;
            const bMetPct = valB >= pctThresh && pctThresh > 0;

            // Group: % threshold items first, then $ only items
            if (aMetPct && !bMetPct) return -1;
            if (!aMetPct && bMetPct) return 1;

            // Within same group:
            if (aMetPct && bMetPct) {
                // Both met % - sort by % (highest first)
                return valB - valA;
            } else {
                // Both only met $ - sort by $ (highest first)
                return dolB - dolA;
            }
        };

        const sortAsc = (type) => (a, b) => {
            const valA = Math.abs(getDisplayPct(a, type));
            const valB = Math.abs(getDisplayPct(b, type));
            const dolA = getLiveChangeDol(a);
            const dolB = getLiveChangeDol(b);

            // For losers, use down thresholds
            const losePctThresh = Number(rules.down?.percentThreshold ?? 0);
            const loseDolThresh = Number(rules.down?.dollarThreshold ?? 0);

            const aMetPct = valA >= losePctThresh && losePctThresh > 0;
            const bMetPct = valB >= losePctThresh && losePctThresh > 0;

            if (aMetPct && !bMetPct) return -1;
            if (!aMetPct && bMetPct) return 1;

            if (aMetPct && bMetPct) {
                return valB - valA;
            } else {
                return dolB - dolA;
            }
        };

        if (movers.up && Array.isArray(movers.up)) movers.up.sort(sortDesc('up'));
        if (movers.down && Array.isArray(movers.down)) movers.down.sort(sortAsc('down'));

        // HILO SORT: Simple % magnitude sort (highest first) using live data
        const sortHilo = (a, b) => {
            const valA = Math.abs(getDisplayPct(a, 'high'));
            const valB = Math.abs(getDisplayPct(b, 'high'));
            return valB - valA; // Highest % first
        };
        if (hilo.high && Array.isArray(hilo.high)) hilo.high.sort(sortHilo);
        if (hilo.low && Array.isArray(hilo.low)) hilo.low.sort(sortHilo);


        return {
            movers: { up: movers.up || [], down: movers.down || [] },
            hilo: { high: hilo.high || [], low: hilo.low || [] }
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
        console.group("%c ðŸ§ª GLOBAL ALERTS SELF-TEST ", "background: #222; color: #bada55; font-size: 14px; padding: 4px;");

        if (!AppState.livePrices || AppState.livePrices.size === 0) {
            console.error("âŒ ABORT: No Live Price Data to test against.");
            console.groupEnd();
            return;
        }

        const prices = Array.from(AppState.livePrices.values());
        console.log(`ðŸ“Š Data Source: Scanning ${prices.length} live instruments.`);

        // --- TEST SCENARIO ---
        const TEST_MIN_PRICE = 0.50;
        const TEST_PCT_THRESHOLD = 3.0;

        console.log(`âš™ï¸  Test Rules: Price > $${TEST_MIN_PRICE}, Move > ${TEST_PCT_THRESHOLD}% `);

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
                console.error(`âŒ COUNT MISMATCH: Expected ${control.length}, Got ${system.length} `);
            } else {
                console.log(`âœ… Count Matching: ${system.length} items.`);
            }

            // Content Check (Sample Top 3)
            const limit = Math.min(3, system.length);
            for (let i = 0; i < limit; i++) {
                const sysItem = system[i];
                const ctrlItem = control[i];
                if (sysItem.code !== ctrlItem.code) {
                    console.error(`âŒ ORDER / CONTENT FAIL at #${i + 1}: Expected ${ctrlItem.code} (${ctrlItem.pctChange}%), Got ${sysItem.code} (${sysItem.pct}%)`);
                } else {
                    console.log(`   OK #${i + 1}: ${sysItem.code} @${sysItem.pct}% `);
                }
            }

            // Sorting Valid Check
            let sortOk = true;
            for (let i = 0; i < system.length - 1; i++) {
                const curr = Math.abs(system[i].pct);
                const next = Math.abs(system[i + 1].pct);
                // Magnitude should descend
                if (curr < next) {
                    console.warn(`âš ï¸ SORT WARN at #${i}: ${curr}% < ${next}% `);
                    sortOk = false;
                }
            }
            if (sortOk && system.length > 0) console.log("âœ… Sorting Valid (Biggest magnitude first)");

            console.groupEnd();
        };

        check("ðŸ“ˆ TEST: Global Gainers", controlUp, systemUp, 'desc');
        check("ðŸ“‰ TEST: Global Losers", controlDown, systemDown, 'asc');

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

        check("ðŸš€ TEST: 52 Week Highs", controlHigh, systemHigh, 'desc');

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
        check("ðŸ”» TEST: 52 Week Lows", controlLow, systemLow, 'asc');

        console.log("%c TEST COMPLETE ", "background: #222; color: #bada55");
        console.log(`User ID: ${this.userId} `);
        console.log(`Last Updated: ${this.lastUpdated} `);
        console.table(this.scannerRules);

        console.group("1. Raw Data Sources");
        console.log(`Backend Global Gainers: ${this.scanData.globalMovers.up.length} `);
        console.log(`Backend Global Losers: ${this.scanData.globalMovers.down.length} `);
        console.log(`Backend Global Highs: ${this.scanData.globalHiLo.high.length} `);
        console.log(`Backend Global Lows: ${this.scanData.globalHiLo.low.length} `);
        console.groupEnd();

        console.group("2. Dashboard Filter Check");
        const blockedUp = (this.scanData.globalMovers.up || []).filter(i => DASHBOARD_SYMBOLS.includes(i.code));
        if (blockedUp.length > 0) {
            console.warn(`Blocked ${blockedUp.length} Gainers due to Dashboard Filter: `, blockedUp.map(i => i.code));
        } else {
            console.log("No Gainers blocked by Dashboard Filter.");
        }
        console.groupEnd();

        console.group("3. Local/Portfolio Merge");
        const local = this.getLocalAlerts();
        console.log(`Local Fresh Alerts: ${local.fresh.length} `);
        const localMovers = local.fresh.filter(i => i.intent === 'mover' || i.intent === 'up' || i.intent === 'down');
        console.log(`Local Movers(to be merged): ${localMovers.length} `, localMovers.map(i => `${i.code} (${i.pct}%)`));
        console.groupEnd();

        console.group("4. Final Output (Strict Mode Bypassed)");
        const final = this.getGlobalAlerts(true);
        console.log(`Final Gainers: ${final.movers.up.length} `);
        console.log(`Final Losers: ${final.movers.down.length} `);
        if (final.movers.up.length === 0) console.warn("WARNING: Final Gainers is EMPTY.");
        console.groupEnd();

        console.groupEnd();

        return "Diagnostic Complete. Check Console.";
    }

    /**
     * Centralized Reporting: Returns accurate counts for Gainers, Losers, Highs, Lows, and Custom Alerts.
     * These counts respect all active filters (Thresholds, Min Price, Sectors, Muting).
     */
    getPulseCounts() {
        if (!this.userId) return { gainers: 0, losers: 0, highs: 0, lows: 0, custom: 0 };

        const global = this.getGlobalAlerts();
        const local = this.getLocalAlerts();

        return {
            gainers: (global.movers?.up || []).length,
            losers: (global.movers?.down || []).length,
            highs: (global.hilo?.high || []).length,
            lows: (global.hilo?.low || []).length,
            custom: (local.fresh || []).length,
            // Original data for badge counting
            _global: global,
            _local: local
        };
    }

    /**
     * Computed: Badge Counts for Sidebar (Total) and Kangaroo (Custom Triggers).
     */
    getBadgeCounts() {
        if (!this.userId) return { total: 0, custom: 0 };

        const thresholds = {
            total: this.lastViewed.total || 0,
            custom: this.lastViewed.custom || 0
        };

        const pulse = this.getPulseCounts();
        const myHits = pulse._local.fresh || [];
        const globalHits = [
            ...(pulse._global.movers?.up || []),
            ...(pulse._global.movers?.down || []),
            ...(pulse._global.hilo?.high || []),
            ...(pulse._global.hilo?.low || [])
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
        // DEBOUNCE: Limit the frequency of expensive badge recalculations and event dispatches.
        if (this._notificationDebounceTimer) {
            clearTimeout(this._notificationDebounceTimer);
        }

        this._notificationDebounceTimer = setTimeout(() => {
            const counts = this.getBadgeCounts();


            document.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_UPDATE, {
                detail: {
                    count: counts.total,
                    totalCount: counts.total,
                    customCount: counts.custom
                }
            }));
            this._notificationDebounceTimer = null;
        }, 500); // 500ms debounce
    }

    /**
     * Centralized Dashboard Filtering Helper
     * Returns true if code should be excluded.
     */
    _isDashboardCode(code) {
        if (!code) return false;

        // 1. Exact Match against Blacklist
        // Includes: XJO, XAO, AUDUSD, AUD/USD
        if (DASHBOARD_SYMBOLS.includes(code)) return true;

        // 2. Normalized Check (Strip non-alphanumeric)
        // Catches: AUD-USD -> AUDUSD
        // Note: 'AUD/USD' in blacklist ensures direct hit, but 'AUDUSD' in list handles normalize('AUD/USD')
        const normalized = code.replace(/[^A-Za-z0-9]/g, '');
        if (DASHBOARD_SYMBOLS.includes(normalized)) return true;

        // 3. Common Index Prefixes/Suffixes
        // ^XJO (Yahoo), .AX (handled elsewhere but safety here)
        if (code.startsWith('^')) return true;

        // 4. Manual "Known Bad" Patterns from User Reports if any mismatch with list
        // e.g. "YAP=F" is in list. "TIO=F" is in list.

        return false;
    }

    /**
     * Generates persistent alerts for User Price Targets AND 52-Week Hi/Lo using Live Data.
     * This bypasses the need for the Backend to be perfectly sync'd.
     */
    _generateClientSideWatchlistAlerts() {
        if (!this.userId || !AppState.data.shares || !AppState.livePrices) return [];

        const alerts = [];
        const uniqueCodes = [...new Set(AppState.data.shares.map(s => (s.shareName || '').toUpperCase()).filter(c => c))];
        uniqueCodes.forEach(code => {
            const share = getBestShareMatch(AppState.data.shares, code);
            if (!share) return;

            // Exclude Dashboard Symbols from alerts
            if (this._isDashboardCode(code)) return;
            // Normalized Check (Redundant if helper is good, but keeping safe)
            // if (DASHBOARD_SYMBOLS.includes(code.replace(/[^A-Za-z0-9]/g, ''))) return;

            const liveData = AppState.livePrices.get(code);

            if (code && liveData) {
                // EXCLUDE DASHBOARD SYMBOLS (Double Check)
                if (this._isDashboardCode(code)) return;

                // EXCLUDE NON-TRADABLE ASSETS (Currencies, Indices, Commodities)
                // We only want alerts for actionable Shares and ETFs.
                const type = (liveData.type || '').toUpperCase();
                // Default to allowing if type is missing (fallback to share), but block known bad types
                if (type && type !== 'SHARE' && type !== 'ETF' && type !== 'company') {
                    return;
                }

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
                    // FIX: Only apply this check if we have a valid PrevClose to calculate against.
                    // If PrevClose is 0/Missing, we MUST trust the API's 'changeInPercent'.
                    if (liveData.prevClose > 0 && Math.abs(pctChange) > 1.0 && Math.abs(calcPct) < 0.1) {
                        isPhantom = true;
                        console.warn(`[NotificationStore] Phantom Hit Detected & Blocked: ${code} (Repo ${pctChange}% vs Calc ${calcPct}%)`);
                    }

                    // --- DEEP TRACE FOR GAP PARADOX REMOVED ---


                    // --- LOAD RULES EARLY ---
                    const rules = this.getScannerRules() || {};

                    // 1. MOVERS (Implicit Watchlist Alerts)
                    // PRIORITY: Movers are processed first so they can become the "Master" in grouping,
                    // preventing "Target Displacement" where a movement is hidden by a coffee background.
                    const overrideOn = rules.excludePortfolio !== false;

                    if (rules.moversEnabled !== false && !isPhantom) {
                        const upRules = rules.up || {};
                        const downRules = rules.down || {};
                        const r = pctChange >= 0 ? upRules : downRules;

                        const thresholdPct = Number(r.percentThreshold);
                        const thresholdDol = Number(r.dollarThreshold);

                        let isHit = false;

                        const hasPct = (thresholdPct !== null && thresholdPct !== undefined && thresholdPct !== 0);
                        const hasDol = (thresholdDol !== null && thresholdDol !== undefined && thresholdDol !== 0);

                        if (hasPct || hasDol) {
                            if (hasPct && absPct >= thresholdPct) isHit = true;
                            if (hasDol && absChange >= thresholdDol) isHit = true;
                        }

                        if (absPct === 0 && absChange === 0) isHit = false;

                        if (isHit) {
                            const moverType = pctChange >= 0 ? 'up' : 'down';
                            const key = `${code}-mover-${moverType}`;

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

                    // 2. PRICE TARGETS
                    const targetPrice = Number(share.targetPrice || 0);
                    if (targetPrice > 0 && !isStatic && !isPhantom) {
                        const direction = share.targetDirection || 'below';
                        let hit = false;
                        const prev = Number(liveData.prevClose || 0);

                        // STRICTOR CHECK: Only trigger if price REACHES/CROSSES the target today.
                        // If it was already below/above target yesterday, it's a persistent state, not a "new hit".
                        if (direction === 'above' && price >= (targetPrice - 0.0001) && (prev < targetPrice || prev === 0)) hit = true;
                        if (direction === 'below' && price <= (targetPrice + 0.0001) && (prev > targetPrice || prev === 0)) hit = true;

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

                    // 3. 52-WEEK HIGH/LOW (Implicit Watchlist Alerts)
                    const hiloLimit = rules.hiloMinPrice ?? 0;
                    const overrideActive = rules.excludePortfolio !== false;
                    const featureEnabled = rules.hiloEnabled !== false;

                    const passesThreshold = (hiloLimit === 0 || price >= hiloLimit);
                    const shouldProcess = featureEnabled && (passesThreshold || overrideActive);

                    if (shouldProcess && !isStatic && !isPhantom) {
                        const high52 = Number(liveData.high || liveData.high52 || 0);
                        const low52 = Number(liveData.low || liveData.low52 || 0);
                        const tolerance = 0.001;

                        if (high52 > 0 && price >= (high52 - tolerance)) {
                            const key = `${code}-hilo-high`;
                            alerts.push({
                                userId: this.userId,
                                code: code,
                                intent: 'hilo',
                                type: 'high',
                                price: price,
                                prevClose: Number(liveData.prevClose || 0),
                                high52: high52,
                                low52: low52,
                                pct: pctChange,
                                change: dolChange,
                                t: this._getStableTimestamp(key)
                            });
                        }

                        if (low52 > 0 && price <= (low52 + tolerance)) {
                            const key = `${code}-hilo-low`;
                            alerts.push({
                                userId: this.userId,
                                code: code,
                                intent: 'hilo',
                                type: 'low',
                                price: price,
                                prevClose: Number(liveData.prevClose || 0),
                                low52: low52,
                                high52: high52,
                                pct: pctChange,
                                change: dolChange,
                                t: this._getStableTimestamp(key)
                            });
                        }
                    }
                    /*
                                        // 4. VALUE ALERTS (PE Ratio) - DISABLED BY USER REQUEST
                                        // Only for Shares (not ETFs/Indices which have no P/E or aggregate P/E)
                                        // Note: Independent of Hilo 'shouldProcess' flag.
                                        if (!isStatic && !isPhantom && liveData.pe > 0 && type === 'SHARE') {
                                            const pe = Number(liveData.pe);
                    
                                            // Rule: High PE Warning (> 35)
                                            if (pe > 35) {
                                                const key = `${code}-value-highpe`;
                                                alerts.push({
                                                    userId: this.userId,
                                                    code: code,
                                                    intent: 'value',
                                                    type: 'overvalued',
                                                    price: price,
                                                    pe: pe,
                                                    message: `High PE Ratio: ${pe.toFixed(1)}`,
                                                    t: this._getStableTimestamp(key)
                                                });
                                            }
                    
                                            // Rule: Low PE Opportunity (< 15)
                                            if (pe < 15 && pe > 0) {
                                                const key = `${code}-value-lowpe`;
                                                alerts.push({
                                                    userId: this.userId,
                                                    code: code,
                                                    intent: 'value',
                                                    type: 'undervalued',
                                                    price: price,
                                                    pe: pe,
                                                    message: `Low PE Ratio: ${pe.toFixed(1)}`,
                                                    t: this._getStableTimestamp(key)
                                                });
                                            }
                                        }
                    */ // End PE
                } // End Price > 0
            } // End Data
        }); // End forEach

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

    /**
     * DIAGNOSTIC TOOL: Debug Missing Movers
     * Iterates through ALL live prices and logs why they are being filtered.
     * Usage: notificationStore.debugMissingMovers(1.0, 3.0) // MinPrice $1, MinPct 3%
     */
    debugMissingMovers(minPrice = 0, minPct = 0) {
        console.clear();
        console.group("%c ðŸ•µï¸ DEBUG OBSERVER: Missing Movers Analysis ", "background: #000; color: #0f0; font-size: 14px; padding: 4px;");

        if (!AppState.livePrices || AppState.livePrices.size === 0) {
            console.error("âŒ ABORT: No Live Price Data available.");
            console.groupEnd();
            return;
        }

        const prices = Array.from(AppState.livePrices.values());
        console.log(`ðŸ“Š Scanning ${prices.length} live instruments against criteria: > $${minPrice} AND > ${minPct}% `);

        // Fetch Current Rules
        const rules = this.getScannerRules() || {};
        console.log("âš™ï¸  Current Store Rules:", JSON.parse(JSON.stringify(rules)));

        let candidates = 0;
        let passed = 0;
        let failed = 0;

        prices.forEach(p => {
            const code = p.code;
            // 1. Basic Criteria Check (Is this a candidate?)
            const price = Number(p.live || p.price || 0);

            // Robust check (matching filterHits fix)
            let pct = Number(p.changeInPercent ?? p.pct ?? p.pctChange ?? p.dayChangePercent ?? 0);
            if (pct === 0 && (Math.abs(p.change) > 0 || Math.abs(p.c) > 0)) {
                // If pct is 0 but we have dollars, try to calculate? (Optional, but better to trust explicit keys)
                // For now, let's just stick to the robust keys.
            }

            // Allow sloppy match (ignore sign for now)
            if (price < minPrice || Math.abs(pct) < minPct) return;

            candidates++;

            // It SHOULD show up. Let's see why it fails filterHits.
            const direction = pct >= 0 ? 'up' : 'down';
            const ruleSet = rules[direction] || {};

            console.groupCollapsed(`ðŸ” Investigating ${code} (${pct.toFixed(2)}%, $${price.toFixed(3)})`);

            // Simulation of filterHits logic
            let blockedReason = null;

            // 1. Zombie Block
            const absPct = Math.abs(pct);
            const absChange = Math.abs(p.change || 0);
            if (absPct === 0 && absChange === 0) blockedReason = "Zombie (No Movement)";

            // 2. Global Min Price Block
            const overrideOn = rules.excludePortfolio !== false;
            const isInWatchlist = (AppState.data.shares || []).some(s => s.shareName === code);
            const shouldBypass = (isInWatchlist && overrideOn);

            if (!blockedReason && !shouldBypass && rules.minPrice > 0 && price < rules.minPrice) {
                blockedReason = `Global Min Price($${rules.minPrice})`;
            }

            // 3. Sector Block
            const activeFilters = rules.activeFilters || [];
            if (!blockedReason && !shouldBypass && activeFilters.length > 0) {
                // --- FIX: Lookup Sector in Master List if missing in Live Price ---
                let ind = (p.Industry || p.industry || p.Sector || p.sector || '').toUpperCase();
                if (!ind && AppState.data.shares) {
                    const share = AppState.data.shares.find(s => s.code === code);
                    if (share) ind = (share.industry || share.sector || share.Industry || share.Sector || '').toUpperCase();
                }

                if (!ind || !activeFilters.includes(ind)) {
                    blockedReason = `Sector Mismatch(${ind})`;
                }
            }

            // 4. Threshold Block
            const tPct = ruleSet.percentThreshold || 0;
            const tDol = ruleSet.dollarThreshold || 0;

            const metPct = (tPct > 0 && absPct >= tPct);
            const metDol = (tDol > 0 && absChange >= tDol);

            // STRICT Threshold Logic (fixed):
            if (!blockedReason && !shouldBypass) {
                if (!metPct && !metDol) {
                    blockedReason = `Threshold Miss(Need ${tPct} % or $${tDol})`;
                }
            }

            // 5. Phantom Check
            const calcChange = (p.prevClose > 0) ? (price - p.prevClose) : 0;
            const calcPct = (p.prevClose > 0) ? ((calcChange / p.prevClose) * 100) : 0;
            if (!blockedReason && p.prevClose > 0 && Math.abs(pct) > 1.0 && Math.abs(calcPct) < 0.1) {
                blockedReason = `Phantom Data(API ${pct} % vs Calc ${calcPct.toFixed(2)} %)`;
            }

            if (blockedReason) {
                console.warn(`âŒ BLOCKED: ${blockedReason} `);
                failed++;
            } else {
                console.log(`âœ… PASSED: Should be visible in ${direction.toUpperCase()} list.`);
                passed++;
            }
            console.groupEnd();
        });

        console.log(`ðŸ Analysis Complete.Candidates: ${candidates}, Valid: ${passed}, Blocked: ${failed} `);
        console.groupEnd();
    }

    /**
     * Filtration: 24-Hour Freshness Guard
     * Ensures we ignore any record that is truly stale, regardless of collection name.
     */
    _filterStale(list) {
        if (!Array.isArray(list)) return [];
        const now = Date.now();
        const limit = 24 * 60 * 60 * 1000; // 24 Hours

        return list.filter(item => {
            const timeVal = item.t || item.timestamp || item.createdAt;

            // CONSTITUTIONAL HARDENING: If it has no timestamp, it's a legacy zombie. Kill it.
            if (!timeVal) return false;

            let ms = 0;
            if (typeof timeVal === 'object' && timeVal.toMillis) ms = timeVal.toMillis();
            else if (typeof timeVal === 'object' && timeVal.seconds) ms = timeVal.seconds * 1000;
            else ms = new Date(timeVal).getTime();

            const isFresh = (now - ms) < limit;

            // PERSISTENCE GUARD: Manual target hits have strict RULES:
            // 1. MUST currently meet the target (Condition Check).
            // 2. We prioritize the CURRENT target from AppState (User may have changed it).
            if (item.intent === 'target' || item.intent === 'target-hit') {
                const code = (item.code || '').toUpperCase();
                const share = getBestShareMatch(AppState.data.shares, code);

                // CROSS-CHECK: Always validate against ACTUAL live price from AppState
                let live = Number(item.live || 0);
                const liveSnapshot = (AppState.livePrices && AppState.livePrices.has(code)) ? AppState.livePrices.get(code) : null;
                if (liveSnapshot) {
                    const currentLive = Number(liveSnapshot.live || liveSnapshot.price || liveSnapshot.last || 0);
                    if (currentLive > 0) live = currentLive;
                }

                if (!share) return false;

                const target = Number(share.targetPrice || item.target || 0);
                const direction = share.targetDirection || item.direction || 'below';

                // Condition Guard: If target not met at CURRENT live price, hide it (it's stale/invalid).
                if (target > 0 && live > 0) {
                    if (direction === 'above' && live < (target - 0.0001)) return false;
                    if (direction === 'below' && live > (target + 0.0001)) return false;
                }

                // If it meets current conditions, it persists even if old
                return true;
            }

            // AUTO-GENERATED (52w, Movery): Strict 24h expiry.
            if (!isFresh) {
                // Silently drop - it's a zombie record
                return false;
            }
            return true;
        });
    }

    /**
     * DIAGNOSTIC: Probe GSCF Staleness Logic
     * Run window.debugGSCF() in console to trigger.
     */
    debugGSCF_Probe() {
        console.log("%c🔍 STARTING GSCF PROBE...", "color: #00ffff; font-weight: bold; font-size: 14px;");

        // 1. The Raw Data from Backend (Hardcoded for fidelity)
        const rawZombie = {
            code: "GSCF",
            t: "2026-01-18T19:13:25.491Z",
            intent: "52w-high",
            live: 18.72,
            target: null
        };

        console.log("1. RAW ZOMBIE DATA:", rawZombie);

        // 2. Test _filterStale logic
        const input = [rawZombie];
        const filtered = this._filterStale(input);

        if (filtered.length === 0) {
            console.log("%c2. FILTER RESULT: ✅ KILLED (Logic is working)", "color: #00ff00");
        } else {
            console.log("%c2. FILTER RESULT: ❌ SURVIVED (Logic FAILED)", "color: #ff0000");
        }

        // 3. Check Current Store State
        const currentHits = this.scanData.customHits || [];
        const foundInStore = currentHits.find(h => h.code === "GSCF");

        if (foundInStore) {
            console.log("%c3. CURRENT STORE STATE: ❌ FOUND 'GSCF' IN STORE!", "color: #ff0000; font-weight: bold;");
            console.log("   -> It is sneaking through. Details:", foundInStore);
        } else {
            console.log("%c3. CURRENT STORE STATE: ✅ NOT IN STORE.", "color: #00ff00");
        }
        console.log("%c🔍 PROBE COMPLETE", "color: #00ffff; font-weight: bold;");
    }

    /**
     * DIAGNOSTIC: Probe Dashboard Leak Logic (e.g. Currencies showing in 52w)
     * Run window.debugDashboardLeak() in console to trigger.
     */
    debugDashboardLeak_Probe() {
        console.log("%c🔍 STARTING DASHBOARD LEAK PROBE...", "color: #00ffff; font-weight: bold; font-size: 14px;");

        const testCodes = ["XJO", "AUDUSD", "BTCUSD", "GSCF"];

        testCodes.forEach(code => {
            console.group(`Testing Code: ${code}`);

            // 1. Check Function Existence
            if (typeof this._isDashboardCode !== 'function') {
                console.error("❌ CRITICAL: _isDashboardCode is NOT DEFINED.");
                console.groupEnd();
                return;
            }

            // 2. Check Logic
            const result = this._isDashboardCode(code);
            const status = result ? "✅ IDENTIFIED AS DASHBOARD (Blocked)" : "❌ FAILED (Allowed through)";
            const color = result ? "color: #00ff00" : "color: #ff0000";

            console.log(`%cResult: ${status}`, color);
            console.groupEnd();
        });
        console.log("%c🔍 PROBE COMPLETE", "color: #00ffff; font-weight: bold;");
    }

    /**
     * Subscribes to the Market Index alerts stream in Firestore.
     * Listens for the latest batches of alerts.
     */
    _subscribeToMarketIndex() {
        if (this.unsubscribeMarketIndex) this.unsubscribeMarketIndex();

        try {
            // "artifacts/asx-watchlist-app/alerts_stream"
            // Note: APP_ID is "asx-watchlist-app" defined at top
            const streamRef = collection(db, "artifacts", APP_ID, "alerts_stream");
            const q = query(streamRef, orderBy("timestamp", "desc"), limit(20));

            this.unsubscribeMarketIndex = onSnapshot(q, (snapshot) => {
                const batches = [];
                snapshot.forEach((doc) => {
                    batches.push(doc.data());
                });

                console.log('[NotificationStore] Raw Stream Batches:', batches); // DEBUG: Inspect Data Structure

                // Flatten batches into a single list of alerts
                let allAlerts = [];
                batches.forEach(batch => {
                    let items = [];
                    if (batch.items && Array.isArray(batch.items)) {
                        items = batch.items;
                    } else if (batch.latestAlerts && Array.isArray(batch.latestAlerts)) {
                        items = batch.latestAlerts;
                    }

                    // Pre-process items to ensure timestamp exists
                    items.forEach(item => {
                        // Inherit Batch Timestamp if item missing it
                        if (!item.timestamp && item.date) {
                            item.timestamp = new Date(item.date).getTime();
                        } else if (!item.timestamp && batch.timestamp) {
                            item.timestamp = batch.timestamp;
                        }
                        allAlerts.push(item);
                    });
                });

                // Sort by timestamp descending (newest first)
                // Filter out invalid items just in case
                this.marketIndexAlerts = allAlerts
                    .filter(item => item && item.timestamp)
                    .sort((a, b) => b.timestamp - a.timestamp);

                // Dispatch event for UI
                document.dispatchEvent(new CustomEvent('MARKET_INDEX_UPDATED', {
                    detail: {
                        count: this.marketIndexAlerts.length,
                        alerts: this.marketIndexAlerts
                    }
                }));

                console.log(`[NotificationStore] Market Index Stream Updated: ${this.marketIndexAlerts.length} items.`);
            }, (error) => {
                console.error("[NotificationStore] Market Index Stream Error:", error);
            });

        } catch (e) {
            console.error("[NotificationStore] Failed to subscribe to Market Index:", e);
        }
    }

    /**
     * Returns the current list of Market Index alerts.
     */
    getMarketIndexAlerts() {
        return this.marketIndexAlerts || [];
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

            // ALWAYS use the absolute latest price for validation and display
            if (live) {
                const currentPrice = Number(live.live || live.price || live.last || 0);
                if (currentPrice > 0) hit.live = currentPrice;

                // Polyfill Missing Change Data
                const hasOwnChange = (Math.abs(hit.change || hit.c || 0) > 0) || (Math.abs(hit.pct || hit.cp || 0) > 0);
                if (!hasOwnChange) {
                    hit.change = Number(live.change || live.c || 0);
                    hit.pct = Number(live.changeInPercent || live.pct || live.pctChange || 0);
                    hit.dayChangePercent = hit.pct;
                }

                // FIX: Enrich 52-Week Data for UI Range Display
                if (live.high52 || live.high_52 || live.high) hit.high52 = Number(live.high52 || live.high_52 || live.high);
                if (live.low52 || live.low_52 || live.low) hit.low52 = Number(live.low52 || live.low_52 || live.low);
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

