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
    static _bellManuallyHidden = false; // Track manual dismissal
    static _prevCount = 0; // Track previous count for change detection

    static init() {
        this.renderFloatingBell();

        // Listen for updates from the Store (Unified Event Bus)
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, (e) => {
            // 1. Update Badge (Floating Bell)
            this.updateBadgeCount(e.detail.customCount);

            // 2. Live Update Open Modal (Resolves "stale list" issue)
            const modal = document.getElementById(IDS.NOTIFICATION_MODAL);
            if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                // console.log('[NotificationUI] Data update received while modal open. Refreshing list...');
                this._updateList(modal);
            }
        });

        // Listen for Open Requests (Sidebar/Bell)
        document.addEventListener(EVENTS.OPEN_NOTIFICATIONS, (e) => {
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

        // KANGAROO VISIBILITY FIX: Always show the button/container (unless locked or all disabled)
        // Only toggle the BADGE (Red Dot) visibility.
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

    static showModal(activeTabId = 'custom', source = 'total') {
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

        // --- DUPLICATE PROTECTION ---
        if (document.getElementById(IDS.NOTIFICATION_MODAL)) {
            console.log('[NotificationUI] Modal already open. Ignoring.');
            return;
        }

        try {
            // 1. Auto-clear disabled. User must manually clear or it stays.
            // notificationStore.markAsViewed(); 

            // 2. Render Modal
            console.log('[NotificationUI] Rendering modal DOM...');
            const modal = this._renderModal();
            document.body.appendChild(modal);

            // 3. Bind Events
            this._bindEvents(modal);

            // 4. Initial Render of List
            console.log('[NotificationUI] Updating notification list content...');
            this._updateList(modal);

            // 5. Show with animation
            requestAnimationFrame(() => {
                modal.classList.remove(CSS_CLASSES.HIDDEN);
                console.log('[NotificationUI] Modal visibility class removed.');
            });
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
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">
                        <i class="fas ${UI_ICONS.BELL}" style="margin-right: 8px;"></i> Notifications
                    </h2>
                    <div style="margin-left: auto; display: flex; gap: 15px; align-items: center;">
                        <button id="btn-daily-briefing" title="Daily Briefing" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas fa-coffee"></i>
                        </button>
                        <button id="notif-settings-btn" title="Global Settings" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas ${UI_ICONS.PEN}"></i>
                        </button>
                        <button id="notif-mark-read-btn" title="Dismiss Badge" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas ${UI_ICONS.BELL_SLASH}"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <!-- 1. Filter Chips Header -->
                <div class="filter-chips-container" id="filterChips">
                    <!-- Dynamic Chips -->
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
                this._close(modal);
            });
        }

        // Mark as Read Button (Now Dismiss Badge)
        const markReadBtn = modal.querySelector('#notif-mark-read-btn');
        if (markReadBtn) {
            markReadBtn.addEventListener('click', () => {
                if (notificationStore) {
                    console.log(`[NotificationUI] Dismiss Badge clicked. Source: ${this._currentSource}`);
                    notificationStore.markAsViewed(this._currentSource);
                    // Visual feedback
                    markReadBtn.style.opacity = '0.5';
                    markReadBtn.disabled = true;
                }
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
                this._close(modal); // Close notifications when opening settings
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

        const finalMoversUp = filterHiddenSectors(filterDashboardCodes(globalData.movers?.up));
        const finalMoversDown = filterHiddenSectors(filterDashboardCodes(globalData.movers?.down));
        const finalHiloHigh = filterHiddenSectors(filterDashboardCodes(globalData.hilo?.high));
        const finalHiloLow = filterHiddenSectors(filterDashboardCodes(globalData.hilo?.low));

        const rules = notificationStore.getScannerRules() || { up: {}, down: {} };
        const minPrice = rules.up?.minPrice || rules.down?.minPrice || 0.05; // Base default

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

        // SORT: Target Hits (Coffee) FIRST in Custom Section
        const sortedLocal = [...localAlerts].sort((a, b) => {
            const isTargetA = a.intent === 'target' || a.intent === 'target-hit';
            const isTargetB = b.intent === 'target' || b.intent === 'target-hit';
            if (isTargetA && !isTargetB) return -1;
            if (!isTargetA && isTargetB) return 1;
            return 0;
        });

        // Structure Definitions - REORDERED
        const sections = [
            { id: 'custom', title: 'Custom Triggers', subtitle: '<span style="color: var(--color-accent);">Personal Alerts</span>', items: sortedLocal, type: 'custom', color: 'neutral' },
            { id: 'hilo-high', title: '52-Week Highs', subtitle: hiloStrHigh, items: finalHiloHigh, type: 'hilo-up', color: 'green' },
            { id: 'hilo-low', title: '52-Week Lows', subtitle: hiloStrLow, items: finalHiloLow, type: 'hilo-down', color: 'red' },
            { id: 'gainers', title: 'Global Gainers', subtitle: upStr, items: finalMoversUp, type: 'up', color: 'green' },
            { id: 'losers', title: 'Global Losers', subtitle: downStr, items: finalMoversDown, type: 'down', color: 'red' }
        ];

        // --- DEBUG LOGGING: RENDER COUNT ---
        let totalRendered = 0;
        sections.forEach(s => totalRendered += s.items.length);
        // console.log(`[NotificationUI] Rendered Item Count: ${totalRendered}`);

        // Render Chips & Sections
        // 1. "Open All" Chip
        // 1. "Open All" Chip
        const openAllChip = document.createElement('div');
        openAllChip.className = `${CSS_CLASSES.FILTER_CHIP} ${CSS_CLASSES.CHIP_NEUTRAL}`;
        openAllChip.dataset.target = 'open-all';
        // Add badge count here:
        openAllChip.innerHTML = `Open All <span class="chip-badge">${totalRendered}</span>`;
        chips.appendChild(openAllChip);

        sections.forEach(sec => {
            // Chip
            const chip = document.createElement('div');
            // 'chip-green', 'chip-red', 'chip-custom' logic
            let chipClass = '';
            if (sec.color === 'green') chipClass = CSS_CLASSES.CHIP_GREEN;
            if (sec.color === 'red') chipClass = CSS_CLASSES.CHIP_RED;
            if (sec.id === 'custom') chipClass = CSS_CLASSES.CHIP_CUSTOM;

            chip.className = `${CSS_CLASSES.FILTER_CHIP} ${chipClass} ${sec.id === 'custom' ? CSS_CLASSES.ACTIVE : ''}`;
            chip.dataset.target = sec.id;
            chip.innerHTML = `${sec.title} <span class="chip-badge">${sec.items.length}</span>`;
            chips.appendChild(chip);

            // Accordion
            const accordion = this._renderAccordion(sec, rules);
            list.appendChild(accordion);
        });

        // Re-bind events because we replaced innerHTML
        this._bindAccordionEvents(modal);
    }

    static _bindAccordionEvents(modal) {
        const chips = modal.querySelectorAll(`.${CSS_CLASSES.FILTER_CHIP}`);
        const sections = modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_SECTION}`);

        const toggleSection = (targetId, expand) => {
            const section = modal.querySelector(`#section-${targetId}`);
            if (!section) return;

            const chip = modal.querySelector(`.${CSS_CLASSES.FILTER_CHIP}[data-target="${targetId}"]`);

            if (expand) {
                section.classList.add(CSS_CLASSES.EXPANDED);
                if (chip) chip.classList.add(CSS_CLASSES.ACTIVE);
            } else {
                section.classList.remove(CSS_CLASSES.EXPANDED);
                if (chip) chip.classList.remove(CSS_CLASSES.ACTIVE);
            }
        };

        const closeAll = () => {
            sections.forEach(s => s.classList.remove(CSS_CLASSES.EXPANDED));
            chips.forEach(c => {
                c.classList.remove(CSS_CLASSES.ACTIVE);
                if (c.dataset.target === 'open-all') {
                    // Restore Text but KEEP Badge
                    const badge = c.querySelector('.chip-badge');
                    const count = badge ? badge.textContent : '0';
                    c.innerHTML = `Open All <span class="chip-badge">${count}</span>`;
                }
            });
        };

        const openAll = () => {
            sections.forEach(s => s.classList.add(CSS_CLASSES.EXPANDED));
            chips.forEach(c => {
                if (c.dataset.target === 'open-all') {
                    c.classList.add(CSS_CLASSES.ACTIVE);
                    // Toggle Text but KEEP Badge
                    const badge = c.querySelector('.chip-badge');
                    const count = badge ? badge.textContent : '0';
                    c.innerHTML = `Close All <span class="chip-badge">${count}</span>`;
                } else {
                    c.classList.add(CSS_CLASSES.ACTIVE);
                }
            });
        };

        // Chip Events
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = chip.dataset.target;
                const list = modal.querySelector('#notificationList');

                if (targetId === 'open-all') {
                    if (chip.innerHTML.includes('Close All')) {
                        closeAll();
                    } else {
                        openAll();
                        // Scroll to top when opening all to show the first section
                        if (list) list.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } else {
                    const isActive = chip.classList.contains(CSS_CLASSES.ACTIVE);
                    closeAll(); // Close others

                    if (!isActive) {
                        toggleSection(targetId, true); // Open target

                        // Scroll to section (Unify logic)
                        const sec = modal.querySelector(`#section-${targetId}`);
                        if (sec && list) {
                            // Position section header directly under chips
                            // We wait for the transition to settle to get a stable offsetTop
                            setTimeout(() => {
                                list.scrollTo({ top: sec.offsetTop, behavior: 'smooth' });
                            }, 350);
                        }
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
        // Expand 'Custom Triggers' by default, others collapsed
        const isExpanded = section.id === 'custom';
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
            <div class="accordion-header-content">
                <div class="accordion-title">${section.title}</div>
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
            if (section.id === 'custom') hint = 'No custom price targets have been hit today. Add targets in the "Add Share" modal.';
            if (section.id === 'gainers' || section.id === 'losers') hint = 'Global movers are filtered by your Dollar and Percentage thresholds in Settings.';

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
        // --- UI CUSTOMIZATION: EXPLAINER TEXT ---
        // Helper to Generate Text for a Single Logic Item
        // RETURNS: { text: string, range: string | null }
        const getExplainer = (alertItem, alertType) => {
            const intent = alertItem.intent || '';
            const type = alertItem.type || '';

            const isHiLo = intent === 'hilo' || intent.includes('hilo') || alertType.includes('hilo');
            const isMover = intent === 'mover' || intent === 'up' || intent === 'down' ||
                alertType === 'gainers' || alertType === 'losers' || alertType === 'up' || alertType === 'down';

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

            // 3. GLOBAL GAINERS / LOSERS (Priority 3: Threshold Rules)
            if (isMover) {
                const isUp = type === 'up' || intent === 'up' || alertType === 'gainers' || alertType === 'up';
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

            // 4. FALLBACK (Raw Percentage)
            const pct = Number(alertItem.pct || alertItem.changeInPercent || 0);
            const dirArrow = pct >= 0 ? '▲' : '▼';
            return { text: `Price ${dirArrow} ${Math.abs(pct).toFixed(2)}%`, range: null };
        };

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
                const obj = getExplainer(hiloMatch, type);
                explainerRange = obj.range || ''; // Set the Right Aligned Range
            }

            // Generate Lines (Text Only). If we extracted range, we don't need to show it in the text stack to avoid duplicate/clutter
            const labels = sortedMatches.map(m => {
                const obj = getExplainer(m, type);
                // Just display the text part in the left stack
                return `<div style="line-height: 1.2;">${obj.text}</div>`;
            });
            explainerText = labels.join('');

        } else {
            // Single Item
            if (item.reason) {
                explainerText = item.reason;
            } else {
                const obj = getExplainer(item, type);
                explainerText = obj.text;
                explainerRange = obj.range || '';
            }

            // USER FEEDBACK FIX: If "Alert Triggered" generic text, try to show metrics
            // [Moved Explainer Generation to after JIT Enrichment]
        }

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

        // --- EXPLAINER TEXT GENERATION (Moved after JIT) ---
        // Fix: Ensure we use the Enriched 'changePct' for the text, not the stale 'item.pct'.
        if ((explainerText === 'Alert Triggered' || type === 'custom') && item.intent !== 'target' && item.intent !== 'target-hit') {
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
        if (type === 'hilo-up' || type === 'up') changePct = Math.abs(changePct); // Force Positive
        if (type === 'hilo-down' || type === 'down') changePct = -Math.abs(changePct); // Force Negative if not already

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
            </div>
        `;
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
            <div class="bell-icon-wrapper"><i class="fas fa-bell" style="font-size: 2.5rem;"></i></div>
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

        // Dismiss Logic
        dismissOverlay.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent modal open
            bell.classList.add(CSS_CLASSES.HIDDEN); // Hide the BELL itself
            NotificationUI._bellManuallyHidden = true; // Use class ref since we are in static method context but standard func
            // Also save preference? For now just hide session-based.
        });

        // Initialize Badge
        // Handled by AppController via event
    }
}
