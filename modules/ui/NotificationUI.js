/**
 * NotificationUI.js
 * Renders the Notification Modal with Unified Accordion Dashboard.
 * Handles Pin/Unpin interactions and Badge clearing.
 */

import { notificationStore } from '../state/NotificationStore.js';
import { AppState } from '../state/AppState.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { BriefingUI } from './BriefingUI.js';

export class NotificationUI {

    static _currentSource = 'total';
    static _bellManuallyHidden = (localStorage.getItem('ASX_NEXT_bellHidden') === 'true'); // Persist dismissal state
    static _prevCount = 0; // Track previous count for change detection
    static _openLock = false; // Debounce lock for modal opening
    static _settingsRestorable = false; // Track if we hid settings

    static init() {
        this.renderFloatingBell();

        // Listen for updates from the Store (Unified Event Bus)
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, (e) => {
            // 1. Update Badge (Floating Bell)
            // PRIORITY: Use explicit scope from event detail if provided (instant refresh), fallback to AppState
            const scope = e.detail?.scope || AppState?.preferences?.badgeScope || 'custom';

            // If forced, fetch fresh counts from store immediately
            if (e.detail?.forceBadgeUpdate && notificationStore) {
                const counts = notificationStore.getBadgeCounts();
                const count = (scope === 'all') ? counts.total : counts.custom;
                this.updateBadgeCount(count);
            } else {
                const count = (scope === 'all') ? e.detail.totalCount : e.detail.customCount;
                this.updateBadgeCount(count);
            }

            // 2. Live Update Open Modal (Resolves "stale list" issue)
            const modal = document.getElementById(IDS.NOTIFICATION_MODAL);
            if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                // console.log('[NotificationUI] Data update received while modal open. Refreshing list...');
                this._updateList(modal);
                // 2b. Live Update Status Bar (in case disabled logic changed)
                this._updateStatusBar(modal);

                // 3. Update Dismiss Button State (Live)
                if (notificationStore) {
                    const latestCounts = notificationStore.getBadgeCounts();
                    this._updateDismissState(modal, latestCounts.custom);
                }
            }
        });

        // Listen for Open Requests (Sidebar/Bell)
        // Listen for Open Requests (Sidebar/Bell)
        document.addEventListener(EVENTS.OPEN_NOTIFICATIONS, (e) => {
            // DUPLICATE PROTECTION: Debounce rapid triggers (e.g. from rapid clicks or potential loops)
            if (this._openLock) return;
            this._openLock = true;
            setTimeout(() => this._openLock = false, 500);

            const source = (e.detail && e.detail.source) ? e.detail.source : 'total';
            // Default tab depends on source? No, let showModal decide valid tab (default 'custom').
            this.showModal('custom', source);
        });

        // LOGIC HARDENING: Listen for ready event to auto-refresh loading modal
        document.addEventListener(EVENTS.NOTIFICATION_READY, () => {
            const modal = document.getElementById(IDS.NOTIFICATION_MODAL);
            if (modal && modal.dataset.loading === 'true') {
                console.log('[NotificationUI] NOTIFICATION_READY received. Refreshing loading modal...');
                this._updateList(modal);
                modal.dataset.loading = 'false';
            }
        });
    }

    static updateBadgeCount(count) {
        // Normalize count
        const validCount = Math.max(0, parseInt(count) || 0);

        const bell = document.getElementById('floating-bell');
        const container = document.getElementById('floating-bell-container');

        // --- PREFERENCE CHECK (LOGIC HARDENING: strict optional chaining) ---
        const showBadges = AppState?.preferences?.showBadges !== false;

        if (!bell) {
            console.warn('[NotificationUI] updateBadgeCount: Bell NOT found in DOM yet.');
            return;
        }

        // SECURITY: Hide on Lock Screen (Prevent premature access)
        if (AppState.isLocked) {
            if (container) container.classList.add(CSS_CLASSES.HIDDEN);
            bell.classList.add(CSS_CLASSES.HIDDEN);
            return; // Stop processing
        }

        // REDESIGNED ICON DISMISSAL: If showBadges is false, hide the entire kangaroo.
        if (!showBadges) {
            if (container) container.classList.add(CSS_CLASSES.HIDDEN);
            bell.classList.add(CSS_CLASSES.HIDDEN);
            return;
        }

        // --- DISMISSAL LOGIC: "If volatility 52 week and personal alert are turned off The kangaroo icon should dismiss itself" ---
        let allDisabled = false;
        if (notificationStore) {
            const rules = notificationStore.getScannerRules() || {};
            const moversDisabled = (rules.moversEnabled === false);
            const hiloDisabled = (rules.hiloEnabled === false);
            const personalDisabled = (rules.personalEnabled === false);
            allDisabled = (moversDisabled && hiloDisabled && personalDisabled);
        }

        if (allDisabled) {
            if (container) container.classList.add(CSS_CLASSES.HIDDEN);
            bell.classList.add(CSS_CLASSES.HIDDEN);
            return;
        }

        // KANGAROO VISIBILITY FIX: Always show the button/container (unless locked, manually hidden, or all disabled)
        if (this._bellManuallyHidden) {
            if (container) container.classList.add(CSS_CLASSES.HIDDEN);
            bell.classList.add(CSS_CLASSES.HIDDEN);
            return;
        }

        if (container) container.classList.remove(CSS_CLASSES.HIDDEN);
        bell.classList.remove(CSS_CLASSES.HIDDEN);

        this._prevCount = validCount;

        // Robust badge selection (might be delay in rendering)
        const badge = bell.querySelector('.notification-badge');
        if (!badge) {
            // console.warn('[NotificationUI] updateBadgeCount: Badge element NOT found in bell. Trying again in 100ms...');
            // setTimeout(() => this.updateBadgeCount(validCount), 100);
            return;
        }

        // BADGE LOGIC: Show only if count > 0 AND showBadges is TRUE
        const shouldShowBadge = (validCount > 0 && showBadges);

        if (shouldShowBadge) {
            badge.textContent = validCount > 99 ? '99+' : validCount;
            badge.classList.remove(CSS_CLASSES.HIDDEN);
            badge.style.display = 'flex'; // Force display flex for badge
        } else {
            badge.classList.add(CSS_CLASSES.HIDDEN);
            badge.style.display = 'none';
        }
    }

    static async showModal(activeTabId = 'custom', source = 'total') {
        this._currentSource = source || 'total';

        // SECURITY: Prevent notifications from overriding Lock Screen
        if (AppState.isLocked) {
            console.warn('[NotificationUI] Blocked showModal: App is Locked.');
            return;
        }

        // LOGIC HARDENING: Race condition guard - check if store is ready
        if (!notificationStore || !notificationStore.isReady) {
            console.log('[NotificationUI] Store not ready. Showing loading modal...');
            // Render a minimal loading modal
            const loadingModal = this._renderLoadingModal();
            document.body.appendChild(loadingModal);
            loadingModal.dataset.loading = 'true';
            requestAnimationFrame(() => {
                loadingModal.classList.remove(CSS_CLASSES.HIDDEN);
            });
            return;
        }

        // Smart Tab Selection: If Custom is empty but Global has hits, switch default.
        if (activeTabId === 'custom' && notificationStore) {
            const local = notificationStore.getLocalAlerts();
            const hasLocal = (local?.pinned?.length || 0) + (local?.fresh?.length || 0) > 0;
            if (!hasLocal) {
                activeTabId = 'global';
                // console.log('[NotificationUI] Custom tab empty. Defaulting to Global.');
            }
        }

        console.log(`[NotificationUI] showModal() triggered. Tab: ${activeTabId} Source: ${this._currentSource}`);

        // --- DUPLICATE PROTECTION & SURFACING ---
        let modal = document.getElementById(IDS.NOTIFICATION_MODAL);

        // STACK MANAGEMENT: Hide Settings Modal if open (Mimic Overlay)
        const settingsModal = document.getElementById(IDS.SETTINGS_MODAL);
        this._settingsRestorable = false; // Reset state
        if (settingsModal && !settingsModal.classList.contains(CSS_CLASSES.HIDDEN)) {
            console.log('[NotificationUI] Hiding Settings Modal temporarily for focus.');
            settingsModal.classList.add(CSS_CLASSES.HIDDEN);
            this._settingsRestorable = true;
        }

        if (modal) {
            console.log('[NotificationUI] Modal already open. Surfacing to top.');
            document.body.appendChild(modal);
            modal.style.zIndex = '2147483647';
            return;
        }

        try {
            // 1. Auto-clear disabled. User must manually clear or it stays.
            // notificationStore.markAsViewed(); 

            // 2. Render Modal
            console.log('[NotificationUI] Rendering modal DOM...');
            modal = this._renderModal();
            modal.style.zIndex = '2147483647'; // Force Max
            document.body.appendChild(modal);

            // 3. Bind Events
            this._bindEvents(modal);

            // 4. Initial Render of List
            console.log('[NotificationUI] Updating notification list content...');
            this._updateList(modal);

            // 4b. Update Status Bar (shows disabled monitors)
            this._updateStatusBar(modal);

            // 5. Show with animation
            requestAnimationFrame(() => {
                modal.classList.remove(CSS_CLASSES.HIDDEN);
                console.log('[NotificationUI] Modal visibility class removed.');
            });

            // 6. Inject Dismiss Icon (Kangaroo)
            try {
                const response = await fetch('notification_icon.svg');
                if (response.ok) {
                    let svgContent = await response.text();
                    svgContent = svgContent.replace(/width=".*?"/g, 'width="100%"').replace(/height=".*?"/g, 'height="100%"');

                    // 7. Inject Dismiss Icon with Better Styling
                    const dismissWrapper = modal.querySelector('.dismiss-icon-wrapper');
                    if (dismissWrapper) {
                        dismissWrapper.innerHTML = svgContent;
                        // Target the SVG directly to force size
                        const svg = dismissWrapper.querySelector('svg');
                        if (svg) {
                            svg.style.width = '100%';
                            svg.style.height = '100%';
                            svg.style.display = 'block';
                            svg.style.fill = 'var(--color-accent)'; /* Force fill on SVG */
                        }
                        // Fallback: Target all paths
                        const paths = dismissWrapper.querySelectorAll('path');
                        paths.forEach(p => p.style.fill = 'var(--color-accent)');
                    }

                    // 8. Initial Dismiss State (Sync with Store)
                    if (notificationStore) {
                        const counts = notificationStore.getBadgeCounts();
                        this._updateDismissState(modal, counts.custom);
                    }
                }
            } catch (e) {
                console.warn('Failed to load Header SVG:', e);
            }
        } catch (err) {
            console.error('[NotificationUI] CRITICAL FAILURE in showModal:', err);
        }
    }

    /** LOGIC HARDENING: Render a minimal loading modal while store initializes */
    static _renderLoadingModal() {
        const existing = document.getElementById(IDS.NOTIFICATION_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.NOTIFICATION_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="height: 50vh; display:flex; align-items:center; justify-content:center;">
                <div style="text-align:center; color:var(--text-muted);">
                    <i class="fas fa-spinner fa-spin" style="font-size:2rem; margin-bottom:10px;"></i>
                    <div>Loading notifications...</div>
                </div>
            </div>
        `;

        // Register Navigation Logic for back button support
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                this._close(modal);
            }
        });

        // Bind overlay close
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        if (overlay) overlay.addEventListener('click', () => this._close(modal));

        return modal;
    }

    static _renderModal() {
        // Cleanup existing
        const existing = document.getElementById(IDS.NOTIFICATION_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.NOTIFICATION_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="height: 85vh; display: flex; flex-direction: column; overflow: hidden !important;">
                
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Notifications</h2>
                    <div style="margin-left: auto; display: flex; gap: 15px; align-items: center;">
                        <button id="btn-daily-briefing" title="Daily Briefing" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas fa-coffee"></i>
                        </button>
                        <button id="notif-settings-btn" title="Volatility Settings" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas ${UI_ICONS.PEN}"></i>
                        </button>
                        <button id="notif-mark-read-btn" title="Dismiss Badge" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                             <div class="dismiss-icon-wrapper" style="width: 32px; height: 32px; display: inline-block;"></div>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <!-- Unified Control Surface (Command Bar) -->
                <div class="notif-header-surface">
                    <!-- 1. Filter Chips Header -->
                    <div class="filter-chips-container" id="filterChips">
                        <!-- Dynamic Chips -->
                    </div>

                    <!-- Status Bar: Shows only disabled monitors (hidden if all ON) -->
                    <div id="notif-status-bar" class="notif-status-bar hidden" title="Tap to open settings">
                        <span class="status-bar-prefix">Disabled:</span>
                        <span id="notif-status-pills" class="status-bar-pills"></span>
                    </div>
                </div>

                <!-- 2. Dashboard Content (Scrolling) -->
                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}" id="notificationList" style="flex: 1; padding: 10px; padding-top: 0; position: relative; overflow-y: auto;">
                    <div id="notif-timestamp" style="text-align: right; font-size: 0.65rem; color: var(--text-muted); padding: 5px 10px; font-style: italic;"></div>
                    <!-- Accordion Sections -->
                </div>
            </div>
        `;

        // Register Navigation Logic
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                this._close(modal);
            }
        });

        return modal;
    }

    static _close(modal) {
        modal.classList.add(CSS_CLASSES.HIDDEN);

        // RESTORE SETTINGS MODAL IF HIDDEN
        if (this._settingsRestorable) {
            const settingsModal = document.getElementById(IDS.SETTINGS_MODAL);
            if (settingsModal) {
                console.log('[NotificationUI] Restoring Settings Modal visibility.');
                settingsModal.classList.remove(CSS_CLASSES.HIDDEN);
                // Reset Z-Index just in case we messed with it previously
                settingsModal.style.zIndex = '';
            }
            this._settingsRestorable = false;
        }

        setTimeout(() => modal.remove(), 300);
        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }

    static _bindEvents(modal) {
        // Close
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        const closeHandler = () => this._close(modal);
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
        if (overlay) overlay.addEventListener('click', closeHandler);

        // Daily Briefing Button
        const briefingBtn = modal.querySelector('#btn-daily-briefing');
        if (briefingBtn) {
            briefingBtn.addEventListener('click', () => {
                console.log('[NotificationUI] Daily Briefing button clicked.');
                BriefingUI.show();
            });
        }

        // Edit/Settings Button
        const settingsBtn = modal.querySelector('#notif-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                console.log('[NotificationUI] Edit/Settings button clicked.');
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
                // this._close(modal); // Removed to persist in stack
            });
        }

        // Mark as Read Button (Now Toggle Kangaroo / Dismiss Badge)
        const markReadBtn = modal.querySelector('#notif-mark-read-btn');
        if (markReadBtn) {
            markReadBtn.addEventListener('click', () => {
                // 1. Toggle Global Visibility
                this._bellManuallyHidden = !this._bellManuallyHidden;
                console.log(`[NotificationUI] Kangaroo Toggle: ${this._bellManuallyHidden ? 'HIDDEN' : 'VISIBLE'}`);

                // 2. Perform Standard Dismissal Logic (if hidden)
                if (this._bellManuallyHidden && notificationStore) {
                    notificationStore.markAsViewed('custom');
                }

                // 3. Immedate Refresh of the FAB (Kangaroo)
                if (notificationStore) {
                    const counts = notificationStore.getBadgeCounts();
                    this.updateBadgeCount(counts.custom);
                }

                // 4. Update Button Visuals (Ghosting) and Persist
                localStorage.setItem('ASX_NEXT_bellHidden', this._bellManuallyHidden ? 'true' : 'false');
                this._updateDismissState(modal);
            });
        }

        // Accordion Toggle Delegation (Card Clicks)
        const list = modal.querySelector('#notificationList');
        if (list) {
            list.addEventListener('click', (e) => {
                // 1. Pin/Unpin Delegation
                const btn = e.target.closest(`.${CSS_CLASSES.PIN_BTN}`);
                if (btn) {
                    const itemEl = btn.closest('.notification-card');
                    if (!itemEl) return;
                    const itemData = itemEl._alertData;
                    if (itemData && notificationStore) {
                        btn.classList.toggle(CSS_CLASSES.ACTIVE);
                    }
                    return;
                }

                // 2. Card Click Navigation
                const card = e.target.closest('.notification-card');
                if (card) {
                    const code = card.dataset.code;
                    if (code) {
                        console.log(`[NotificationUI] Card clicked for ${code}. Checking watchlist...`);
                        const isSaved = (AppState.data.shares || []).some(s => {
                            const sCode = s.code || s.shareName || s.symbol;
                            return sCode === code;
                        });

                        if (isSaved) {
                            document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code } }));
                        } else {
                            document.dispatchEvent(new CustomEvent(EVENTS.OPEN_RESEARCH_MODAL, { detail: { query: code } }));
                        }
                    }
                }
            });
        }



        // Subtitle Settings Navigation
        modal.addEventListener('click', (e) => {
            if (e.target.closest('.settings-link')) {
                console.log('[NotificationUI] Settings link clicked.');
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
                // this._close(modal); // Removed to persist in stack
            }
        });
    }

    static _updateList(modal) {
        const list = modal.querySelector('#notificationList');
        const chips = modal.querySelector('#filterChips');
        if (!list || !chips) return;

        list.innerHTML = '';
        chips.innerHTML = '';

        // Update Time
        const timeArea = modal.querySelector('#notif-timestamp');
        const lastUpd = notificationStore.lastUpdated ? new Date(notificationStore.lastUpdated).toLocaleTimeString() : 'Never';
        if (timeArea) timeArea.textContent = `Last synced: ${lastUpd}`;

        // 0. Update Dismiss Button State (Live)
        if (notificationStore) {
            NotificationUI._updateDismissState(modal);
        }

        // 1. Fetch Data
        // Local Alerts: Returns { pinned: [], fresh: [] }
        const localData = notificationStore.getLocalAlerts() || { pinned: [], fresh: [] };
        // Flatten Local: Pinned first, then Fresh
        let localAlerts = [...(localData.pinned || []), ...(localData.fresh || [])];

        // --- SORT PRIORITY: TARGETS FIRST ---
        // Requirement: "I want the user set targets that are entered into the AD share modal. To appear first."
        localAlerts.sort((a, b) => {
            const isTargetA = (a.intent === 'target' || a.intent === 'target-hit');
            const isTargetB = (b.intent === 'target' || b.intent === 'target-hit');
            if (isTargetA && !isTargetB) return -1;
            if (!isTargetA && isTargetB) return 1;
            return 0; // Keep existing order (time-based)
        });

        // Global Scans: Returns { movers: {up, down}, hilo: {high, low} }
        // FIX: Use strict mode (false) so that if thresholds are "Not Set" (0), no shares are returned.
        const globalData = notificationStore.getGlobalAlerts(false) || { movers: { up: [], down: [] }, hilo: { high: [], low: [] } };

        // FILTER: Remove Dashboard-Specific Codes (Indices, Currencies, etc.)
        // User Request: "Codes strictly designed for the dashboard... XJO, XAO, SPI200... And that 52 week threshold container"
        const DASHBOARD_BLACKLIST = ['XJO', 'XAO', 'SPI200', 'ALL', 'AUDUSD', 'USDAUD', 'AUDGBP', 'AUDNZD', 'AUDKRW', 'AUDEUR', 'AUDHKD', 'AUDJPY', 'CDIC', 'RBA', 'GLD', 'SLV', 'OIL', 'BTC', 'ETH', 'LTC'];

        const filterDashboardCodes = (list) => {
            if (!list) return [];
            return list.filter(item => {
                const raw = (item.code || item.shareName || item.symbol || '').toUpperCase().trim();
                const c = raw.replace(/\.AX$/i, ''); // Normalize: "XJO.AX" -> "XJO"

                // Filter if in blacklist OR if it's a currency pair (6 chars, starts with AUD, usually) - sticking to explicit list for safety + common indices.
                if (DASHBOARD_BLACKLIST.includes(c) || DASHBOARD_BLACKLIST.includes(raw)) {
                    // console.log(`[NotificationUI] Filtered Dashboard Code: ${raw}`);
                    return false;
                }
                if (c.startsWith('^') || raw.startsWith('^')) return false; // Common Index Prefix
                // Special check for typical Currency pairs if not in list (e.g. AUDUSD)
                // Actually, relying on list is safer unless we want to filter ALL currencies.
                // User said "Codes strictly designed for the dashboard".
                return true;
            });
        };

        const filterHiddenSectors = (list) => {
            if (!list) return [];
            const hidden = AppState.preferences?.hiddenSectors; // Array of strings
            if (!hidden || !Array.isArray(hidden) || hidden.length === 0) return list;

            const excludePortfolio = AppState.preferences?.excludePortfolio ?? true;
            const myCodes = excludePortfolio ? new Set((AppState.data?.shares || []).map(s => s.code)) : null;

            return list.filter(item => {
                const code = item.code || item.symbol || item.asxCode || item.ASXCode; // robustness
                if (!item.Sector) return true;

                if (hidden.includes(item.Sector)) {
                    // If in portfolio (override hidden)
                    if (excludePortfolio && code && myCodes.has(code)) {
                        return true;
                    }
                    return false;
                }
                return true;
            });
        };

        const rules = notificationStore.getScannerRules() || { up: {}, down: {} };
        const minPrice = rules.up?.minPrice || rules.down?.minPrice || 0.05; // Base default

        const globalMoversUp = filterHiddenSectors(filterDashboardCodes(globalData.movers?.up));
        const globalMoversDown = filterHiddenSectors(filterDashboardCodes(globalData.movers?.down));

        // Use Enrichment to Filter Strictly
        const finalMoversUp = this._enrichAndFilter(globalMoversUp, rules.up || {}, 'up');
        const finalMoversDown = this._enrichAndFilter(globalMoversDown, rules.down || {}, 'down');
        const finalHiloHigh = filterHiddenSectors(filterDashboardCodes(globalData.hilo?.high));
        const finalHiloLow = filterHiddenSectors(filterDashboardCodes(globalData.hilo?.low));

        // Wait, 'minPrice' above is LOCAL logic fallback? 
        // No, I'll use proper Coalescing.
        const ruleMin = rules.up?.minPrice ?? 0.05;

        // Format Helper
        // Format Helper: CLEANER TEXT for Null/Zero
        const fmtRules = (r, defaultMin, dir) => {
            const icon = dir === 'up' ? '<i class="fas fa-caret-up"></i> ' : '<i class="fas fa-caret-down"></i> ';

            // Check if Effectively Empty (Null, undefined, or 0)
            const hasPct = r.percentThreshold && r.percentThreshold > 0;
            const hasDol = r.dollarThreshold && r.dollarThreshold > 0;

            if (!hasPct && !hasDol) return 'Not set';

            const parts = [];
            if (hasPct) parts.push(`${icon}${r.percentThreshold}%`);
            if (hasDol) parts.push(`${icon}$${r.dollarThreshold}`);
            return parts.join(' or ');
        };

        const greenUp = '<i class="fas fa-caret-up"></i>';
        const redDown = '<i class="fas fa-caret-down"></i>';

        const minPriceVal = rules.minPrice ?? 0;
        const thresholdStr = (minPriceVal > 0) ? `Min $${minPriceVal}` : null;
        // User Request: Only the "Min $X" part should be coffee color.
        const thresholdStrColored = thresholdStr ? `<span style="color: var(--color-accent);">${thresholdStr}</span>` : '';

        // Gainers
        const upRuleStr = fmtRules(rules.up || {}, 0, 'up');
        const upStr = (upRuleStr === 'Not set' && !thresholdStr)
            ? 'Not set'
            : (upRuleStr === 'Not set' ? thresholdStrColored : `${upRuleStr}${thresholdStr ? ` • ${thresholdStrColored}` : ''}`);

        // Losers
        const downRuleStr = fmtRules(rules.down || {}, 0, 'down');
        const downStr = (downRuleStr === 'Not set' && !thresholdStr)
            ? 'Not set'
            : (downRuleStr === 'Not set' ? thresholdStrColored : `${downRuleStr}${thresholdStr ? ` • ${thresholdStrColored}` : ''}`);

        // 52 Week Highs/Lows
        const hiloPriceVal = rules.hiloMinPrice ?? 0;
        const hiloStrBase = (hiloPriceVal > 0) ? `<span style="color: var(--color-accent);">Min Price $${hiloPriceVal}</span>` : 'Not set';

        const hiloStrHigh = hiloStrBase;
        const hiloStrLow = hiloStrBase;

        // --- OVERRIDE INDICATOR --- 
        // User Request: "Next custom title in the notifications I would like to have some sort of display letting the user if the watch list override is on or off"
        const excludePortfolio = AppState.preferences?.excludePortfolio ?? true;
        const overrideLabel = excludePortfolio
            ? `<span style="font-size: 0.65rem; color: var(--color-accent); font-weight: normal; margin-left: 8px; opacity: 0.8; letter-spacing: 0.5px;">OVERRIDE ON</span>`
            : `<span style="font-size: 0.65rem; color: var(--text-muted); font-weight: normal; margin-left: 8px; opacity: 0.5; letter-spacing: 0.5px;">OVERRIDE OFF</span>`;



        const customTitleChip = 'Custom Movers';
        const customTitleHeader = `Custom Movers${overrideLabel}`;

        // SURFACING: Sort Target Hits (Coffee) FIRST in Custom Section
        const sortedLocal = [...localAlerts].sort((a, b) => {
            const isTargetA = a.intent === 'target' || a.intent === 'target-hit';
            const isTargetB = b.intent === 'target' || b.intent === 'target-hit';
            if (isTargetA && !isTargetB) return -1;
            if (!isTargetA && isTargetB) return 1;
            return 0;
        });

        // Structure Definitions - REORDERED & SPLIT
        const sections = [
            { id: 'custom', title: 'Custom', chipLabel: 'Watcher', headerTitle: customTitleHeader, subtitle: '<span style="color: var(--color-accent);">Watchlist prices and Market filters</span>', items: sortedLocal, type: 'custom', color: 'neutral' },
            { id: 'hilo-high', title: '52 Week High', chipLabel: '52w High', subtitle: hiloStrHigh, items: finalHiloHigh, type: 'hilo-up', color: 'green' },
            { id: 'hilo-low', title: '52 Week Low', chipLabel: '52w Low', subtitle: hiloStrLow, items: finalHiloLow, type: 'hilo-down', color: 'red' },
            { id: 'gainers', title: 'Market Gainers', chipLabel: 'Gainers', subtitle: upStr, items: finalMoversUp, type: 'gainers', color: 'green' },
            { id: 'losers', title: 'Market Losers', chipLabel: 'Losers', subtitle: downStr, items: finalMoversDown, type: 'losers', color: 'red' }
        ];

        // --- DEBUG LOGGING: RENDER COUNT ---
        let totalRendered = 0;
        sections.forEach(s => totalRendered += s.items.length);
        // console.log(`[NotificationUI] Rendered Item Count: ${totalRendered}`);

        // Render Summary Dashboard (V3 Grid)
        // 1. "Dashboard" Tile (Master View)
        const openAllChip = document.createElement('div');
        openAllChip.className = `${CSS_CLASSES.FILTER_CHIP} chip-neutral active`;
        openAllChip.dataset.target = 'open-all';
        openAllChip.innerHTML = `
            <span class="chip-badge">${totalRendered}</span>
            <span class="chip-label">Dashboard</span>
        `;
        chips.appendChild(openAllChip);

        sections.forEach(sec => {
            // Summary Tile
            const chip = document.createElement('div');
            const chipClass = `chip-${sec.color || 'neutral'}`;

            chip.className = `${CSS_CLASSES.FILTER_CHIP} ${chipClass}`;
            chip.dataset.target = sec.id;
            chip.innerHTML = `
                <span class="chip-badge">${sec.items.length}</span>
                <span class="chip-label">${sec.chipLabel || sec.title}</span>
            `;
            chips.appendChild(chip);

            // Accordion (Always Added to List Body)
            const accordion = this._renderAccordion(sec, rules);
            list.appendChild(accordion);
        });

        // Re-bind events because we replaced innerHTML
        this._bindAccordionEvents(modal);
    }

    static _bindAccordionEvents(modal) {
        const chips = modal.querySelectorAll(`.${CSS_CLASSES.FILTER_CHIP}`);
        const sections = modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_SECTION}`);
        const listBody = modal.querySelector('#notificationList');

        // INITIAL STATE: Expand All by Default (Transparency)
        sections.forEach(s => {
            s.style.display = 'block';
            s.classList.add(CSS_CLASSES.EXPANDED);
        });

        // Navigation Sync: Update Active Tile based on scroll position
        if (listBody) {
            listBody.addEventListener('scroll', () => {
                let currentId = 'open-all';
                const scrollPos = listBody.scrollTop + 50; // Offset for better triggering

                sections.forEach(sec => {
                    if (sec.offsetTop <= scrollPos) {
                        currentId = sec.id.replace('section-', '');
                    }
                });

                // Update Tile Highlights
                chips.forEach(c => {
                    if (c.dataset.target === currentId) c.classList.add(CSS_CLASSES.ACTIVE);
                    else c.classList.remove(CSS_CLASSES.ACTIVE);
                });
            }, { passive: true });
        }

        // Tile Events (Anchor Navigation)
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = chip.dataset.target;
                const list = modal.querySelector('#notificationList');

                if (targetId === 'open-all') {
                    if (list) list.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    const sec = modal.querySelector(`#section-${targetId}`);
                    if (sec && list) {
                        list.scrollTo({ top: sec.offsetTop, behavior: 'smooth' });
                    }
                }
            });
        });

        // Accordion Header Events
        const headers = modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_HEADER}`);
        headers.forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.settings-link')) return; // Ignore subtitle link clicks

                const section = header.closest(`.${CSS_CLASSES.ACCORDION_SECTION}`);
                if (!section) return;
                const targetId = section.id.replace('section-', '');
                const list = modal.querySelector('#notificationList');

                if (section.classList.contains(CSS_CLASSES.EXPANDED)) {
                    toggleSection(targetId, false);
                } else {
                    closeAll();
                    toggleSection(targetId, true);

                    // Unified Scroll Logic
                    if (section && list) {
                        setTimeout(() => {
                            list.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
                        }, 350);
                    }
                }
            });
        });

        // NOTIFICATION CARD CLICK LISTENER (Delegated)
        // Dispatches ASX_CODE_CLICK to trigger AppController's logic (Watchlist Open OR Search Fallback)
        modal.addEventListener('click', (e) => {
            const card = e.target.closest(`.${CSS_CLASSES.NOTIFICATION_CARD_GRID}`);
            if (card && card.dataset.code) {
                console.log(`[NotificationUI] Card Clicked: ${card.dataset.code}`);
                // Close modal first? Or let AppController handle it?
                // For native "Click Through" feel, we should prevent standard specific closing unless the app navigates.
                // AppController typically handles navigation.

                document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, {
                    detail: { code: card.dataset.code }
                }));

                // Optional: Close Notification Modal if successful? 
                // AppController logic opens new modals, so we should probably close this one to avoid clutter.
                // notificationStore.markAsViewed? No, that happens on open/dismiss.

                // NOT closing modal: Keeps it in history stack so "Back" works.
            }
        });
    }

    static _renderAccordion(section, rules = {}) {
        const wrap = document.createElement('div');
        // All sections expanded by default for V3 Dashboard Transparency
        const isExpanded = true;
        wrap.className = `${CSS_CLASSES.ACCORDION_SECTION} ${isExpanded ? CSS_CLASSES.EXPANDED : ''}`;
        wrap.id = `section-${section.id}`;

        const header = document.createElement('div');
        header.className = CSS_CLASSES.ACCORDION_HEADER;

        // Determine Subtitle Color Class
        let colorStyle = '';
        if (section.color === 'green') colorStyle = 'color: var(--color-positive);';
        if (section.color === 'red') colorStyle = 'color: var(--color-negative);';

        // Header Content with Subtitle
        const isGlobal = (section.id !== 'custom');
        const subtitleHTML = isGlobal
            ? `<div class="${CSS_CLASSES.ACCORDION_SUBTITLE} settings-link" style="${colorStyle}; cursor: pointer;" title="Adjust Thresholds">${section.subtitle}</div>`
            : `<div class="${CSS_CLASSES.ACCORDION_SUBTITLE}" style="${colorStyle}">${section.subtitle}</div>`;

        header.innerHTML = `
            <div class="accordion-title-row">
                <div class="accordion-title">${section.headerTitle || section.title}</div>
                ${subtitleHTML}
            </div>
            <div class="accordion-meta">
                 <span class="${CSS_CLASSES.BADGE_PILL}">${section.items.length}</span>
                 <i class="fas fa-chevron-down accordion-icon"></i>
            </div>
        `;

        const body = document.createElement('div');
        body.className = CSS_CLASSES.ACCORDION_BODY;

        if (section.items.length === 0) {
            let hint = 'No alerts currently match your criteria.';
            if (section.id === 'custom') hint = 'No personal or target alerts have been hit today. Add targets in the "Add Share" modal.';
            if (section.id === 'gainers' || section.id === 'losers') hint = 'Market movers are filtered by your Dollar and Percentage thresholds in Settings.';
            if (section.id === 'hilo-high' || section.id === 'hilo-low') hint = '52 week movers are filtered by your Min Price threshold in Settings.';

            body.innerHTML = `
                <div style="text-align:center; color:var(--text-muted); padding:1.5rem 1rem; font-size:0.8rem;">
                    <i class="fas fa-info-circle" style="display:block; font-size:1.2rem; margin-bottom:8px; opacity:0.5;"></i>
                    ${hint}
                </div>`;
        } else {
            section.items.forEach(item => {
                body.innerHTML += this._renderCard(item, section.type, rules);
            });
        }

        wrap.appendChild(header);
        wrap.appendChild(body);
        return wrap;
    }

    static _renderCard(item, type, rules = {}) {
        // ... (Skipping Top logic) ...
        // (Assume _renderCard start is unchanged, targeting Explainer block below)

        // ... (middle of _renderCard) ...

        // --- UI CUSTOMIZATION: EXPLAINER TEXT ---
        // Helper to Generate Text for a Single Logic Item
        // RETURNS: { text: string, range: string | null }
        const getExplainer = (alertItem, alertType, enrichedPct = null) => {
            const intent = alertItem.intent || '';
            const type = alertItem.type || '';

            const isHiLo = intent === 'hilo' || intent.includes('hilo') || alertType.includes('hilo');

            // Fix: Explicitly define isGainers / isLosers derived from type/intent
            const isGainers = alertType === 'gainers' || intent === 'gainers';
            const isLosers = alertType === 'losers' || intent === 'losers';

            const isMover = intent === 'mover' || intent === 'up' || intent === 'down' ||
                alertType === 'gainers' || alertType === 'losers' || alertType === 'up' || alertType === 'down' || alertType === 'movers';

            // 1. PRICE TARGET (Priority 1: User set targets)
            if (intent === 'target' || intent === 'target-hit') {
                const tPrice = formatCurrency(alertItem.target || alertItem.targetPrice || 0);

                // INTENT-BASED RENDERING (Constitutional Fix)
                // Use explicit direction from DB if available, rather than inferring from transient price.
                let dirArrow = '';
                let contextInfo = ''; // Helper to explain WHY if price looks wrong

                // Current Price & Target for Context Check
                const p = Number(alertItem.price || 0);
                const t = Number(alertItem.target || alertItem.targetPrice || 0);

                if (alertItem.direction === 'above') {
                    dirArrow = '▲';
                } else if (alertItem.direction === 'below') {
                    dirArrow = '▼';
                } else {
                    dirArrow = (p >= t) ? '▲' : '▼';
                }

                return { text: `Target Hit ${dirArrow} ${tPrice}`, range: null };
            }

            // 2. 52-WEEK HIGH / LOW (Priority 2: Historical Range)
            if (isHiLo) {
                // User Request: "It should just display Min price. And whatever that is. Or if there is a placeholder card there, it should just display None."
                const limit = rules.hiloMinPrice || 0; // null/0 safely handled
                const limitStr = (limit > 0) ? `Min Price $${limit}` : 'None';

                const isHigh = type === 'high' || type === 'up' || intent === 'hilo-up' || alertType.includes('high') || alertType === 'hilo-up';
                const low = (alertItem.low52 || alertItem.low || 0).toFixed(2);
                const high = (alertItem.high52 || alertItem.high || 0).toFixed(2);

                // SPLIT: Text on Left (Limit), Range on Right
                return {
                    text: limitStr,
                    range: `52w Range ${low}-${high}`
                };
            }

            // 3. GLOBAL GAINERS / LOSERS (Modified Logic)
            if (isGainers || isLosers) {
                const rule = isGainers ? (rules.up || {}) : (rules.down || {});
                const dirArrow = isGainers ? '▲' : '▼';

                const tPct = rule.percentThreshold || 0;
                const tDol = rule.dollarThreshold || 0;

                let parts = [];
                if (tPct > 0) parts.push(`${tPct}%`);
                if (tDol > 0) parts.push(`$${tDol}`);

                let text = '';
                if (parts.length > 0) {
                    text = `${dirArrow} ${parts.join(' or ')}`;
                } else {
                    text = `${dirArrow} 0%`; // Default if no rule set
                }

                return { text: text, range: null };
            }

            // 4. GENERIC / FALLBACK MOVERS
            if (isMover) {
                const isUp = type === 'up' || intent === 'up';
                const rule = isUp ? (rules.up || {}) : (rules.down || {});
                const dirArrow = isUp ? '▲' : '▼';

                // Check for null/zero rules -> "None" or "All"
                const hasPct = rule.percentThreshold && rule.percentThreshold > 0;
                const hasDol = rule.dollarThreshold && rule.dollarThreshold > 0;

                let txt = '';
                if (!hasPct && !hasDol) {
                    txt = `Price ${dirArrow}`; // Just direction if no rules
                } else {
                    const parts = [];
                    if (hasPct) parts.push(`${rule.percentThreshold}%`);
                    if (hasDol) parts.push(`$${rule.dollarThreshold}`);
                    txt = `Price ${dirArrow} ${parts.join(' or ')}`;
                }

                return { text: txt, range: null };
            }

            // 5. GENERIC FALLBACK (Raw Percentage)
            const pct = Number(alertItem.pct || alertItem.changeInPercent || 0);
            if (Math.abs(pct) < 0.01 && !intent) return { text: null, range: null }; // Silence 0% heartbeats

            const dirArrow = pct >= 0 ? '▲' : '▼';
            return { text: `Price ${dirArrow} ${Math.abs(pct).toFixed(2)}%`, range: null };
        };

        // --- ROBUST KEY MAPPING & ENRICHMENT ---
        let code = String(item.code || item.shareName || item.symbol || item.s || item.shareCode || '???').toUpperCase();
        let name = item.name || '';
        let rawPrice = item.live || item.price || item.last || item.closePrice || item.p || 0;
        let price = formatCurrency(rawPrice);

        // Backend variants: pct, changeP, cp, p, changePercent, pctChange
        // Ensure we catch dayChangePercent
        let changePct = Number(item.pct || item.changeP || item.cp || item.p || item.changePercent || item.pctChange || item.dayChangePercent || 0);

        // --- DEEP ANALYSIS FIX: JIT ENRICHMENT ---
        let changeAmt = item.change || item.c || 0;

        let cleanCode = code.replace(/\.AX$/i, '').trim().toUpperCase();
        let liveShare = null;

        // 1. Try to find in AppState.livePrices (Primary - most up-to-date)
        if (AppState.livePrices && AppState.livePrices instanceof Map) {
            liveShare = AppState.livePrices.get(cleanCode) || AppState.livePrices.get(code);
        }

        // 2. Fallback to User Shares (Secondary - mainly for name matching or fuller data objects)
        //    Only if livePrices didn't yield a useful result.
        if (!liveShare || (Number(liveShare.live || liveShare.price || liveShare.last || 0) === 0 && Number(liveShare.dayChangePercent || liveShare.changeInPercent || 0) === 0)) {
            const foundInShares = AppState.data.shares.find(s => {
                const sCode = String(s.code || s.shareName || s.symbol || s.shareCode || s.s || '').toUpperCase();
                return sCode === cleanCode || sCode === code;
            });

            // If found in shares, and it's more complete than what we got from livePrices (if any)
            // Or if livePrices was empty, use this.
            if (foundInShares) {
                const foundPrice = Number(foundInShares.live || foundInShares.price || foundInShares.last || 0);
                const foundPct = Number(foundInShares.dayChangePercent || foundInShares.changeInPercent || 0);

                if (!liveShare || (foundPrice > 0 || foundPct !== 0)) {
                    liveShare = foundInShares;
                }
            }
        }

        // --- ENRICHMENT APPLICATION ---
        if (liveShare) {
            // Name polyfill
            if (!name) name = liveShare.companyName || liveShare.name || '';

            // --- NAME CLEANING ---
            name = name
                .replace(/\(ASX:[^)]+\)/gi, '')
                .replace(/\bL\.?T\.?D\.?\b/gi, '')
                .replace(/\bLimited\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            // Determine best percentage key
            let livePct = Number(liveShare.dayChangePercent || liveShare.changeInPercent || liveShare.pct || liveShare.pctChange || 0);
            let liveAmt = Number(liveShare.change || liveShare.c || 0);

            const currentPrice = Number(liveShare.live || liveShare.price || liveShare.last || 0);
            const closePrice = Number(liveShare.prevClose || liveShare.close || liveShare.previousClose || 0);

            // Fallback: Calculate Missing Percentages using Derived Base Price
            if (Math.abs(livePct) === 0 && Math.abs(liveAmt) > 0 && currentPrice > 0) {
                let basePrice = closePrice;
                if (basePrice === 0) basePrice = currentPrice - liveAmt;
                if (basePrice > 0) livePct = (liveAmt / basePrice) * 100;
            }
            // Fallback 2: We have Prices but no Change info at all
            else if (Math.abs(livePct) === 0 && Math.abs(liveAmt) === 0 && currentPrice > 0 && closePrice > 0) {
                liveAmt = currentPrice - closePrice;
                livePct = (liveAmt / closePrice) * 100;
            }

            // Update if we found data, OR if we are fixing a 0-price item
            if (Math.abs(livePct) > 0 || Math.abs(liveAmt) > 0 || rawPrice === 0) {
                changePct = livePct;
                changeAmt = liveAmt;

                // Fix Price if missing/zero
                if (rawPrice === 0) {
                    rawPrice = currentPrice;
                    price = formatCurrency(rawPrice);
                }
            }
        }

        // RENDERING LOGIC: SINGLE VS STACKED
        // For Stacked (Consolidated), we will just stack the text in the left cell.
        // Range support for consolidated items is tricky, we'll assume primary single item logic for now.

        let explainerText = '';
        let explainerRange = ''; // Only for primary single item if applicable

        // Check for Consolidated Matches (Custom Type Only)
        if (type === 'custom' && item.matches && item.matches.length > 1) {
            // Sort: Hilo First, then Target/Mover
            // 52W High/Low should be at top of stack.
            const sortedMatches = [...item.matches].sort((a, b) => {
                const isHiloA = a.intent && a.intent.includes('hilo');
                const isHiloB = b.intent && b.intent.includes('hilo');
                if (isHiloA && !isHiloB) return -1;
                if (!isHiloA && isHiloB) return 1;
                return 0;
            });

            // EXTRACT RANGE: Find the first Hilo match and pull its range for the right side
            const hiloMatch = sortedMatches.find(m => m.intent && m.intent.includes('hilo'));
            if (hiloMatch) {
                const obj = getExplainer(hiloMatch, type, changePct);
                explainerRange = obj.range || ''; // Set the Right Aligned Range
            }

            // Generate Lines (Text Only). Filter out null/empty results.
            const labels = sortedMatches
                .map(m => getExplainer(m, type, changePct).text)
                .filter(txt => txt && txt.trim().length > 0) // Explicit filter for valid strings
                .map(txt => `<div style="line-height: 1.2;">${txt}</div>`);

            explainerText = labels.join('');

        } else {
            // Single Item
            if (item.reason) {
                explainerText = item.reason;
            } else {
                const obj = getExplainer(item, type, changePct);
                explainerText = obj.text;
                explainerRange = obj.range || '';
            }
        }

        // --- EXPLAINER TEXT GENERATION (Moved after JIT) ---
        // Fix: Ensure we use the Enriched 'changePct' for the text, not the stale 'item.pct'.
        if ((explainerText === 'Alert Triggered' || (type === 'custom' && !explainerText)) && item.intent !== 'target' && item.intent !== 'target-hit') {
            // Re-evaluate direction based on FINAL changePct
            const ruleSet = changePct >= 0 ? (rules.up || {}) : (rules.down || {});
            const arrow = changePct >= 0 ? '▲' : '▼';
            const hasPct = ruleSet.percentThreshold && ruleSet.percentThreshold > 0;
            const hasDol = ruleSet.dollarThreshold && ruleSet.dollarThreshold > 0;

            if (hasPct || hasDol) {
                const parts = [];
                if (hasPct) parts.push(`${ruleSet.percentThreshold}%`);
                if (hasDol) parts.push(`$${ruleSet.dollarThreshold}`);
                explainerText = `Price ${arrow} ${parts.join(' or ')}`;
            } else {
                // Fallback: Use the ACTUAL live percent
                explainerText = `Price ${arrow} ${Math.abs(changePct).toFixed(2)}%`;
            }
        }

        // Force Direction based on Type (Override for Hi/Lo/Gainer/Loser)
        if (type === 'hilo-up' || type === 'up' || type === 'gainers') changePct = Math.abs(changePct); // Force Positive
        if (type === 'hilo-down' || type === 'down' || type === 'losers') changePct = -Math.abs(changePct); // Force Negative if not already

        let changeClass = changePct >= 0 ? CSS_CLASSES.POSITIVE : CSS_CLASSES.NEGATIVE;

        // Arrows (Generic)
        let arrowIcon = changePct >= 0 ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';

        let changeFormatted = `${arrowIcon} ${formatCurrency(Math.abs(changeAmt))} (${Math.abs(changePct).toFixed(2)}%)`;

        // Card Border Class Logic (Strict)
        // 1. Custom/Target -> Coffee (Neutral) ALWAYS
        // 2. Highs/Gainers -> Green (Up) ALWAYS
        // 3. Lows/Losers -> Red (Down) ALWAYS

        let cardClass = CSS_CLASSES.CARD_NEUTRAL; // Default to Coffee

        if (item.intent === 'target' || item.intent === 'target-hit') {
            cardClass = CSS_CLASSES.CARD_TARGET; // Explicit Coffee for TARGETS only (New Class)
        }
        else if (type === 'custom') {
            // If custom but NOT a target, use daily change color
            if (changePct > 0) cardClass = CSS_CLASSES.CARD_UP;
            else if (changePct < 0) cardClass = CSS_CLASSES.CARD_DOWN;
            else cardClass = CSS_CLASSES.CARD_NEUTRAL;
        }
        else if (type === 'high' || type === 'up' || type === 'gainers' || type === 'hilo-up') {
            cardClass = CSS_CLASSES.CARD_UP;
        }
        else if (type === 'low' || type === 'down' || type === 'losers' || type === 'hilo-down') {
            cardClass = CSS_CLASSES.CARD_DOWN;
        }
        else {
            // Fallback for generic movers if type isn't explicit (NotificationUI fallback)
            if (changePct > 0) cardClass = CSS_CLASSES.CARD_UP;
            else if (changePct < 0) cardClass = CSS_CLASSES.CARD_DOWN;
        }

        if (item._isPinned) cardClass += ` ${CSS_CLASSES.CARD_PINNED}`;

        // --- SECTOR / INDUSTRY ENRICHMENT ---
        // Priority: 
        // 1. Explicit Item Sector/Industry (from backend)
        let sector = item.Sector || item.Industry || item.industry || item.sector; // try all variants

        if (!sector && liveShare) {
            sector = liveShare.industry || liveShare.Industry || liveShare.Sector || liveShare.sector;
        }

        // Final fallback if we found it in shares but it wasn't the liveShare object
        if (!sector) {
            const fallbackShare = AppState.data.shares.find(s => {
                const sCode = String(s.code || s.shareName || s.symbol || '').toUpperCase();
                return sCode === cleanCode;
            });
            if (fallbackShare) {
                sector = fallbackShare.industry || fallbackShare.Sector || fallbackShare.sector;
            }
        }

        // --- VERIFICATION LOG ---
        console.log(`[NotificationUI] Sector Resolution for ${code}: ${sector ? sector : 'MISSING'}`);
        // ------------------------

        let sectorHtml = '';
        if (sector) {
            // Apply truncation and ghosted styling as requested
            // Grid Column 1 / -1 ensures it spans the full width (like a footer)
            sectorHtml = `
            <div class="notif-cell-sector ${CSS_CLASSES.GHOSTED}" style="grid-column: 1 / -1; font-size: 0.85rem; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted);">
                ${sector}
            </div>`;
        }


        //GRID LAYOUT IMPLEMENTATION
        return `
            <div class="${CSS_CLASSES.NOTIFICATION_CARD_GRID} ${cardClass}" data-code="${code}">
                <!-- R1: CODE | PRICE -->
                <div class="notif-cell-code">${code}</div>
                <div class="notif-cell-price">${price}</div>

                <!-- R2: NAME | CHANGE -->
                <div class="notif-cell-name">${name}</div>
                <div class="notif-cell-change ${changeClass}">${changeFormatted}</div>

                <!-- R3: EXPLAINER | RANGE (Optional) -->
                <div class="notif-cell-explainer">${explainerText}</div>
                <div class="notif-cell-range">${explainerRange}</div>
                
                <!-- R4: SECTOR (Full Width) -->
                ${sectorHtml}
            </div>
        `;
    }

    // --- HELPER: ENRICH & FILTER MOVERS ---
    static _enrichAndFilter(list, rules, direction) {
        if (!list || list.length === 0) return [];

        // Check Override Preference
        const excludePortfolio = AppState.preferences?.excludePortfolio ?? true; // Default True (Override ON)
        // FIX: Use shareName as primary key (UserStore standard), fall back to code.
        const myCodes = excludePortfolio ? new Set((AppState.data?.shares || []).map(s => s.shareName || s.code)) : null;

        const enrichedList = list.map(item => {
            const clone = { ...item };
            const code = clone.code || clone.shareName || clone.symbol;

            // 1. JIT Enrichment from Live Prices
            if (code && AppState.livePrices && AppState.livePrices.has(code)) {
                const live = AppState.livePrices.get(code);

                // Prioritize 'dayChangePercent' (Standard) or 'pct'
                const lPct = Number(live.dayChangePercent ?? live.changeInPercent ?? live.pctChange ?? live.pct ?? 0);
                const lDol = Number(live.change ?? live.c ?? live.dayChange ?? 0);

                if (Math.abs(lPct) > 0 || Math.abs(lDol) > 0) {
                    clone.pct = lPct;
                    clone.change = lDol;
                    // Also update price if available
                    const lPrice = Number(live.live || live.price || live.last || 0);
                    if (lPrice > 0) clone.live = lPrice;
                }
            }
            return clone;
        });

        const limitPct = rules.percentThreshold || 0;
        const limitDol = rules.dollarThreshold || 0;

        return enrichedList.filter(item => {
            const pct = Number(item.pct || 0);
            const dol = Number(item.change || 0);

            // 2. Strict Direction Check
            if (direction === 'up' && pct <= 0) return false;
            if (direction === 'down' && pct >= 0) return false;

            // 3. Threshold Check
            // EXCEPTION: Targets and 52-Week Hi/Lo hits are explicit events. They bypass generic movement thresholds.
            // EXCEPTION: If Override is ON (shouldBypass), we ignore the numeric threshold checks.
            const code = item.code || item.shareName || item.symbol;
            if (limitPct === 0 && limitDol === 0) return true; // Show all if no limits

            // OVERRIDE LOGIC: Bypass if in Watchlist
            if (myCodes && myCodes.has(code)) return true;

            const absPct = Math.abs(pct);
            const absDol = Math.abs(dol);

            const metPct = (limitPct > 0 && absPct >= limitPct);
            const metDol = (limitDol > 0 && absDol >= limitDol);

            return metPct || metDol;
        });
    }

    static async renderFloatingBell() {
        if (document.getElementById('floating-bell-container')) return;

        // 1. Create Wrapper for Formatting/Positioning (Fixed)
        const container = document.createElement('div');
        container.id = 'floating-bell-container';
        container.className = `${CSS_CLASSES.FLOATING_BELL_CONTAINER} ${CSS_CLASSES.HIDDEN}`;

        // 2. Create the Button (The visual bell)
        const bell = document.createElement('button');
        bell.id = 'floating-bell';
        bell.className = CSS_CLASSES.FLOATING_BELL_BTN;

        // Initial InnerHTML with Badge (to ensure it exists for updateBadgeCount immediately)
        bell.innerHTML = `
            <div class="bell-icon-wrapper"><i class="fas ${UI_ICONS.ALERTS}" style="font-size: 2.5rem;"></i></div>
            <span class="notification-badge ${CSS_CLASSES.HIDDEN}">0</span>
            <div class="dismiss-overlay ${CSS_CLASSES.HIDDEN}">
                <i class="fas fa-times"></i>
            </div>
        `;

        container.appendChild(bell);
        document.body.appendChild(container);

        // 3. Fetch and Inline SVG to allow Color Styling
        try {
            const response = await fetch('notification_icon.svg');
            if (response.ok) {
                let svgContent = await response.text();
                svgContent = svgContent.replace(/width=".*?"/g, '').replace(/height=".*?"/g, '');

                const wrapper = bell.querySelector('.bell-icon-wrapper');
                if (wrapper) wrapper.innerHTML = svgContent;
            }
        } catch (e) {
            console.error('Failed to load Notification SVG', e);
        }

        // State tracking for long-press
        let pressTimer;
        let isLongPress = false;

        // Get references to the new elements
        const dismissOverlay = bell.querySelector('.dismiss-overlay');
        const btn = bell; // Alias for cleaner event binding code below

        const startPress = () => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                // Show/Hide Close Button on Long Press (Toggle)
                if (dismissOverlay.classList.contains(CSS_CLASSES.HIDDEN) || getComputedStyle(dismissOverlay).display === 'none') {
                    dismissOverlay.classList.remove(CSS_CLASSES.HIDDEN);
                    console.log('[NotificationUI] Kangaroo Toggle: Show X');
                } else {
                    dismissOverlay.classList.add(CSS_CLASSES.HIDDEN);
                    console.log('[NotificationUI] Kangaroo Toggle: Hide X');
                }

                if (navigator.vibrate) navigator.vibrate(50); // Feedback
            }, 800);
        };
        const cancelPress = () => clearTimeout(pressTimer);

        btn.addEventListener('mousedown', startPress);
        btn.addEventListener('touchstart', startPress, { passive: true });
        btn.addEventListener('mouseup', cancelPress);
        btn.addEventListener('mouseleave', cancelPress);
        btn.addEventListener('touchend', cancelPress);

        // Click Logic (Open Modal if not dismissing)
        btn.addEventListener('click', (e) => {
            if (isLongPress) {
                isLongPress = false;
                return; // Handled by startPress/Timer
            }
            if (e.target.closest('.dismiss-overlay')) return;

            // Dispatch Event for Controller to handle
            document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS, {
                detail: { source: 'custom' }
            }));
        });

        // Dismiss Logic (Desktop View)
        dismissOverlay.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent modal open
            this._bellManuallyHidden = true; // Toggle state
            localStorage.setItem('ASX_NEXT_bellHidden', 'true'); // Persist

            this.updateBadgeCount(this._prevCount); // Refresh visibility immediately
        });

        // Initialize Badge
        // Handled by AppController via event
    }

    /**
     * Updates the Dismiss Button state (Toggle).
     * Slashed if Kangaroo is Visible (Click to cut).
     * No Slash if Kangaroo is Hidden (Click to show).
     */
    static _updateDismissState(modal) {
        const dismissBtn = modal.querySelector('#notif-mark-read-btn');
        if (!dismissBtn) return;

        const wrapper = dismissBtn.querySelector('.dismiss-icon-wrapper');
        if (!wrapper) return;

        // Inverted Logic:
        // Visible (!Hidden) -> Slashed
        // Hidden (true) -> No Slash
        if (this._bellManuallyHidden) {
            wrapper.classList.remove('is-slashed');
            dismissBtn.title = "Show Desktop Icon";
        } else {
            wrapper.classList.add('is-slashed');
            dismissBtn.title = "Hide Desktop Icon";
        }

        // Remove ghosting - keep full strength
        dismissBtn.style.opacity = '1';

        // Never disable, so it remains a clickable toggle
        dismissBtn.disabled = false;
        dismissBtn.style.cursor = 'pointer';
    }

    /**
     * Updates the status bar to show disabled monitors.
     * Hidden if all monitors are ON.
     */
    static _updateStatusBar(modal) {
        const statusBar = modal.querySelector('#notif-status-bar');
        const pillsContainer = modal.querySelector('#notif-status-pills');
        if (!statusBar || !pillsContainer) return;

        // Get current settings via Store (Handles Fallbacks)
        const rules = notificationStore.getScannerRules() || {};
        const prefs = AppState.preferences || {};

        // Check which monitors are OFF
        const disabled = [];

        // Check explicit false (undefined = enabled default)
        if (rules.hiloEnabled === false) disabled.push('52w');
        if (rules.moversEnabled === false) disabled.push('Movers');
        if (rules.personalEnabled === false) disabled.push('Personal');

        // AppState typically has these, but fall back safely
        if (prefs.showBadges === false) disabled.push('Icon');
        if (prefs.dailyEmail === false) disabled.push('Email');

        // Watchlist Override (Exclude Portfolio)
        // If OFF (False) -> Strict filtering (Silent Warning).
        if (rules.excludePortfolio === false) disabled.push('Override');

        console.log('[NotificationUI] Status Bar Check:', {
            activeRules: rules,
            disabledList: disabled
        });

        // Show/hide the bar
        if (disabled.length === 0) {
            statusBar.classList.add(CSS_CLASSES.HIDDEN);
            statusBar.style.display = 'none';
        } else {
            statusBar.classList.remove(CSS_CLASSES.HIDDEN);
            statusBar.style.display = 'flex';

            // Render pills
            pillsContainer.innerHTML = disabled.map(label =>
                `<span class="status-bar-pill">${label}</span>`
            ).join('');
        }

        // Add click handler to open settings
        statusBar.onclick = () => {
            document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
        };
    }

}
