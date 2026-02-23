/**
 * NotificationUI.js
 * Renders the Notification Modal with Unified Accordion Dashboard.
 * Handles Pin/Unpin interactions and Badge clearing.
 */

import { notificationStore } from '../state/NotificationStore.js';
import { AppState } from '../state/AppState.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS, SECTOR_INDUSTRY_MAP, DASHBOARD_SYMBOLS, UI_LABELS, KANGAROO_ICON_SVG } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { BriefingUI } from './BriefingUI.js?v=327';
import { SnapshotUI } from './SnapshotUI.js';
import { ToastManager } from './ToastManager.js';
import { LinkHelper } from '../utils/LinkHelper.js';
import { getBestShareMatch } from '../data/DataProcessor.js';
import { SettingsUI } from './SettingsUI.js';
import { StateAuditor } from '../state/StateAuditor.js';

export class NotificationUI {

    static _currentSource = 'total';
    // static _bellManuallyHidden removed (Now uses AppState.preferences.showBadges)
    static _prevCount = 0; // Track previous count for change detection
    static _openLock = false; // Debounce lock for modal opening
    static _settingsRestorable = false; // Track if we hid settings
    static _briefingRestorable = false; // Track if we hid briefing
    static _hiloMode = 'high'; // Default toggle state for Market Pulse
    static _restorableModals = []; // Universal stack for hidden modals

    static init() {
        try {
            this.renderFloatingBell();

            // FIX: Immediate Sync (Race Condition Protection)
            const syncBadge = () => {
                if (notificationStore) {
                    try {
                        // ALWAYS fetch fresh from Store to ensure accuracy
                        const counts = notificationStore.getBadgeCounts();
                        // Use fallback if AppState not ready
                        const scope = AppState?.preferences?.badgeScope || 'all';
                        const count = (scope === 'all') ? counts.total : counts.custom;
                        this.updateBadgeCount(count);
                    } catch (e) {
                        console.warn('[NotificationUI] Sync failed:', e);
                        // Only toast critical failures if repeated (managed by poller)
                    }
                }
            };

            syncBadge();

            // DATA UPDATE SYNC: Ensure badge updates when new price data arrives
            if (StateAuditor && typeof StateAuditor.on === 'function') {
                StateAuditor.on('DATA_UPDATED', () => {
                    setTimeout(syncBadge, 500); // Allow Store time to process
                });
            }

            // Listen for updates from the Store (Unified Event Bus)
            document.addEventListener(EVENTS.NOTIFICATION_UPDATE, (e) => {
                // IGNORE event payload, force fresh fetch to synchronise with Store state
                syncBadge();

                // 2. Live Update Open Modal (Resolves "stale list" issue)
                const modal = document.getElementById(IDS.NOTIFICATION_MODAL);
                if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                    this._updateList(modal);
                    this._updateStatusBar(modal);
                    this._updateHeaderBadges(modal);
                    if (notificationStore) {
                        const latestCounts = notificationStore.getBadgeCounts();
                        this._updateDismissState(modal, latestCounts.custom);
                    }
                }
            });

            // Listen for Open Requests (Sidebar/Bell)
            document.addEventListener(EVENTS.OPEN_NOTIFICATIONS, (e) => {
                // DUPLICATE PROTECTION: Debounce rapid triggers
                if (this._openLock) return;
                this._openLock = true;
                setTimeout(() => this._openLock = false, 500);

                const source = (e.detail && e.detail.source) ? e.detail.source : 'total';
                const tab = (e.detail && e.detail.tab) ? e.detail.tab : 'custom';
                const section = (e.detail && e.detail.section) ? e.detail.section : null;
                this.showModal(tab, source, section);
            });

            // LOGIC HARDENING: Listen for ready event to auto-refresh loading modal
            document.addEventListener(EVENTS.NOTIFICATION_READY, () => {
                const modal = document.getElementById(IDS.NOTIFICATION_MODAL);
                if (modal && modal.dataset.loading === 'true') {
                    this._updateList(modal);
                    modal.dataset.loading = 'false';
                }
            });

        } catch (initErr) {
            console.error('[NotificationUI] Init Critical Failure:', initErr);
            setTimeout(() => ToastManager.show('UI Init Failed: ' + initErr.message, 'error'), 1000);
        }
    }

    static updateBadgeCount(count) {
        // Normalize count
        const validCount = Math.max(0, parseInt(count) || 0);

        const bell = document.getElementById(IDS.FLOATING_BELL);
        const container = document.getElementById(IDS.FLOATING_BELL_CONTAINER);

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

        // REDESIGNED ICON DISMISSAL: If showBadges is false, hide the bell button.
        // FIX: Previously hid if count === 0, which caused icon to vanish on boot before data loaded.
        // User wants "Persistence": If I turned it ON, it stays ON, even if 0 notifications.
        if (!showBadges) {
            // Container remains visible (but transparent/pointer-events only) so user can restore it.
            if (container) container.classList.remove(CSS_CLASSES.HIDDEN);
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
            // Same logic: Hide bell, keep container for potential future interactions (or if we want to allow re-enabling even if disabled)
            // Actually, if ALL disabled in settings, maybe we should hide container too?
            // "The kangaroo icon should dismiss itself".
            // Let's allow reinstatement even here, just in case they want to access the settings menu via the modal.
            if (container) container.classList.remove(CSS_CLASSES.HIDDEN);
            bell.classList.add(CSS_CLASSES.HIDDEN);
            return;
        }

        // KANGAROO VISIBILITY FIX (v1148): "If he doesn't hop out there's no notifications"
        // Logic: Count > 0 -> Show + Hop. Count == 0 -> Hide.
        // We removed the "Persistence" override because the user explicitly requested conditional visibility.

        const shouldShow = (validCount > 0 && showBadges);

        if (shouldShow) {
            // If previously hidden, we need to show and animate
            if (bell.classList.contains(CSS_CLASSES.HIDDEN)) {
                bell.classList.remove(CSS_CLASSES.HIDDEN);
                container.classList.remove(CSS_CLASSES.HIDDEN);

                // FORCE ANIMATION REPLAY
                bell.style.animation = 'none';
                void bell.offsetHeight; // Force reflow
                bell.style.animation = ''; // Revert to CSS (hopIn)
            }
        } else {
            // No notifications -> No Kangaroo
            bell.classList.add(CSS_CLASSES.HIDDEN);
            // Keep container visible for potential long-press discovery if desires
            if (container) container.classList.remove(CSS_CLASSES.HIDDEN);
        }


        this._prevCount = validCount;

        // Robust badge selection (might be delay in rendering)
        const badge = bell.querySelector(`.${CSS_CLASSES.NOTIFICATION_BADGE}`);
        if (!badge) {
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

    static async showModal(activeTabId = 'custom', source = 'total', targetSectionId = null) {
        this._currentSource = source || 'total';
        this._targetSection = targetSectionId; // Store for deep linking
        this._activeTab = activeTabId; // Store for initial rendering logic

        // SECURITY: Prevent notifications from overriding Lock Screen
        if (AppState.isLocked) {
            console.warn('[NotificationUI] Blocked showModal: App is Locked.');
            return;
        }

        // LOGIC HARDENING: If store not ready, proceed anyway - modal will update when data arrives
        // The NOTIFICATION_READY event will trigger _updateList to refresh the content

        // Smart Tab Selection: If Custom is empty but Global has hits, switch default.
        if (activeTabId === 'custom' && notificationStore) {
            const local = notificationStore.getLocalAlerts();
            const hasLocal = (local?.pinned?.length || 0) + (local?.fresh?.length || 0) > 0;
            if (!hasLocal) {
                activeTabId = 'global';
            }
        }



        // --- DUPLICATE PROTECTION & SURFACING ---
        let modal = document.getElementById(IDS.NOTIFICATION_MODAL);

        // --- UNIVERSAL STACK MANAGEMENT: Hide any other open modals ---
        // We find all visible modals that are NOT the notification modal
        const allModals = document.querySelectorAll(`.${CSS_CLASSES.MODAL}`);
        this._restorableModals = []; // Reset stack for this session

        allModals.forEach(m => {
            // EXCLUDE: notification-modal itself, or elements that are already hidden
            if (m.id === IDS.NOTIFICATION_MODAL) return;
            if (m.classList.contains(CSS_CLASSES.HIDDEN)) return;

            // Hide and track for restoration

            m.classList.add(CSS_CLASSES.HIDDEN);
            this._restorableModals.push(m);
        });

        // Specific legacy flags for specialized restoration logic (Briefing/Settings have unique needs)
        const settingsModal = document.getElementById(IDS.SETTINGS_MODAL);
        this._settingsRestorable = (settingsModal && this._restorableModals.includes(settingsModal));

        const briefingModal = document.getElementById(IDS.DAILY_BRIEFING_MODAL);
        this._briefingRestorable = (briefingModal && this._restorableModals.includes(briefingModal));

        if (modal) {
            // If already open, just ensure it's visible and update list if needed
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            this._updateList(modal);
        } else {
            // Render Fresh
            modal = this._renderModal();
            document.body.appendChild(modal);
            this._bindEvents(modal); // Bind general events
            // _updateList is called inside _renderModal usually, but let's be sure
            this._updateList(modal);

            requestAnimationFrame(() => {
                modal.classList.remove(CSS_CLASSES.HIDDEN);
            });
        }

        // Push State (Only if not already visible to avoid double-pushing history)
        if (!modal || modal.classList.contains(CSS_CLASSES.HIDDEN)) {
            navManager.pushState(() => {
                this._close(modal);
            });
        }

        try {
            // 1. Auto-clear disabled. User must manually clear or it stays.
            // notificationStore.markAsViewed(); 

            // 2. Render Modal
            // This part is now handled by the if/else block above.
            // modal = this._renderModal();
            // modal.style.zIndex = '2147483647'; // Force Max
            // document.body.appendChild(modal);

            // 3. Bind Events
            // This part is now handled by the if/else block above.
            // this._bindEvents(modal);

            // 4. Initial Render of List
            // This part is now handled by the if/else block above.
            // this._updateList(modal);

            // 4b. Update Status Bar (shows disabled monitors)
            this._updateStatusBar(modal);
            this._updateHeaderBadges(modal);

            // 5. Show with animation
            // 5. Show with animation

            // 6. Inject Dismiss Icon (Kangaroo)
            try {
                let svgContent = KANGAROO_ICON_SVG;
                svgContent = svgContent.replace(/width=".*?"/g, 'width="100%"').replace(/height=".*?"/g, 'height="100%"');

                // 7. Inject Dismiss Icon with Better Styling
                const dismissWrapper = modal.querySelector(`.${CSS_CLASSES.DISMISS_ICON_WRAPPER}`);
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
            } catch (e) {
                console.warn('Failed to inject Header SVG:', e);
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
                    <div>${UI_LABELS.LOADING_NOTIFICATIONS}</div>
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
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">${UI_LABELS.NOTIFICATIONS_TITLE}</h2>
                    <div style="margin-left: auto; display: flex; gap: 15px; align-items: center;">
                        <button id="${IDS.BTN_DAILY_BRIEFING}" title="${UI_LABELS.DAILY_BRIEFING_TITLE}" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas fa-coffee"></i>
                        </button>
                        <button id="${IDS.BTN_ANNOUNCEMENTS}" title="${UI_LABELS.ANNOUNCEMENTS_TITLE}" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem; display: flex; align-items: center; gap: 1px;">
                            <i class="fas fa-newspaper"></i>
                            <span id="notif-announcement-badge" class="${CSS_CLASSES.HIDDEN}" style="color: inherit; font-size: 0.65rem; font-weight: 500; line-height: 1;">0</span>
                        </button>
                        <button id="${IDS.NOTIF_SETTINGS_BTN}" title="${UI_LABELS.NOTIFICATION_SETTINGS}" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                            <i class="fas ${UI_ICONS.PEN}"></i>
                        </button>
                        <button id="${IDS.NOTIF_MARK_READ_BTN}" title="${UI_LABELS.DISMISS_BADGE}" style="background: none; border: none; cursor: pointer; color: var(--color-accent); font-size: 1.2rem;">
                             <div class="${CSS_CLASSES.DISMISS_ICON_WRAPPER}" style="width: 32px; height: 32px; display: inline-block;"></div>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="${UI_LABELS.CLOSE}">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <!-- Unified Control Surface (Command Bar) -->
                <div class="${CSS_CLASSES.NOTIF_HEADER_SURFACE}">
                    <!-- 1. Filter Chips Header (Row 1) -->
                    <div class="${CSS_CLASSES.FILTER_CHIPS_CONTAINER}" id="${IDS.FILTER_CHIPS_CONTAINER}">
                        <!-- Dynamic Chips -->
                    </div>

                    <!-- 2. Discreet Status Ribbon (Row 2 - Total / Override / Sectors) -->
                    <div id="notif-status-ribbon" class="notif-status-ribbon">
                        <!-- Dynamic Ribbon Content -->
                    </div>
                </div>

                <!-- Dashboard Content (Scrolling) -->
                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}" id="${IDS.NOTIFICATION_LIST}" style="flex: 1; padding: 0; position: relative; overflow-y: auto; scroll-behavior: smooth;">
                    <!-- Accordion Sections (Injected Here) -->
                </div>

                <!-- Intelligence Report Overlay (Deep Dive) -->
                <div id="${IDS.INTELLIGENCE_REPORT_OVERLAY}" class="${CSS_CLASSES.INTELLIGENCE_REPORT_OVERLAY}"></div>
            </div>
        `;

        // Register Navigation Logic
        modal._navActive = true;
        // Navigation push handled by showModal to avoid double-pushing on creation.

        return modal;
    }

    static _updateHeaderBadges(modal) {
        if (!notificationStore) return;
        const counts = notificationStore.getBadgeCounts();

        const annBadge = modal.querySelector('#notif-announcement-badge');
        if (annBadge) {
            if (counts.announcements > 0) {
                annBadge.textContent = counts.announcements > 99 ? '99+' : counts.announcements;
                annBadge.classList.remove(CSS_CLASSES.HIDDEN);
                annBadge.style.display = 'flex';
            } else {
                annBadge.classList.add(CSS_CLASSES.HIDDEN);
                annBadge.style.display = 'none';
            }
        }
    }

    static _close(modal) {
        modal.classList.add(CSS_CLASSES.HIDDEN);

        // UNIVERSAL RESTORATION: Restore any modals we hid when opening
        if (this._restorableModals && this._restorableModals.length > 0) {

            this._restorableModals.forEach(m => {
                if (m) {
                    m.classList.remove(CSS_CLASSES.HIDDEN);

                    // Specialized logic for Briefing (Needs z-index pop)
                    if (m.id === IDS.DAILY_BRIEFING_MODAL) {
                        m.style.zIndex = '1001';
                        m.style.display = 'flex';
                        document.body.appendChild(m);
                    }
                }
            });
            this._restorableModals = []; // Clear stack
        }

        // Specific Settings restoration (Fallback if universal logic missed it or for reset)
        if (this._settingsRestorable) {
            const settingsModal = document.getElementById(IDS.SETTINGS_MODAL);
            if (settingsModal && settingsModal.classList.contains(CSS_CLASSES.HIDDEN)) {

                settingsModal.classList.remove(CSS_CLASSES.HIDDEN);
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
        const briefingBtn = modal.querySelector(`#${IDS.BTN_DAILY_BRIEFING}`);
        if (briefingBtn) {
            briefingBtn.addEventListener('click', () => {

                BriefingUI.show();
            });
        }

        // Announcements Button
        const announceBtn = modal.querySelector(`#${IDS.BTN_ANNOUNCEMENTS}`);
        if (announceBtn) {
            announceBtn.addEventListener('click', () => {
                import('./MarketIndexController.js').then(({ marketIndexController }) => {
                    marketIndexController.openModal();
                });
            });
        }

        // Edit/Settings Button
        const settingsBtn = modal.querySelector(`#${IDS.NOTIF_SETTINGS_BTN}`);
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {

                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
                // this._close(modal); // Removed to persist in stack
            });
        }

        // Mark as Read Button (Now Toggle Kangaroo / Dismiss Badge)
        const markReadBtn = modal.querySelector(`#${IDS.NOTIF_MARK_READ_BTN}`);
        if (markReadBtn) {
            markReadBtn.addEventListener('click', async () => {
                // 1. Get Current State (Global Preference)
                const currentState = AppState.preferences.showBadges !== false;
                const newState = !currentState;

                // 2. Update Local State Immediately (Reactivity)
                AppState.preferences.showBadges = newState;
                // FIX: Persist to LocalStorage immediately so it survives Hard Reload
                localStorage.setItem('ASX_NEXT_showBadges', newState);

                // 3. Persist to Cloud via DataService (Dynamic Import)
                try {
                    const { userStore } = await import('../data/DataService.js');
                    if (AppState.user?.uid) {
                        await userStore.savePreferences(AppState.user.uid, { showBadges: newState });
                        localStorage.removeItem('ASX_NEXT_bellHidden'); // Cleanup legacy
                    }
                } catch (err) {
                    console.error('[NotificationUI] Failed to save preference:', err);
                }

                // 4. Trigger Visual Update
                if (notificationStore) {
                    const counts = notificationStore.getBadgeCounts();
                    // FIX: Respect current badge scope preference
                    const scope = AppState?.preferences?.badgeScope || 'all';
                    const count = (scope === 'all') ? counts.total : counts.custom;
                    this.updateBadgeCount(count);
                }

                // 5. Update Dismiss Button Visuals (Sync)
                this._updateDismissState(modal);
            });
        }

        // Accordion Toggle Delegation (Card Clicks)
        const list = modal.querySelector(`#${IDS.NOTIFICATION_LIST}`);
        if (list) {
            const getPrompt = (btn) => {
                const { symbol } = btn.dataset;
                return `Summarize the latest technical and fundamental developments for ${symbol} on the ASX. Focus on recent price action, volume, and any relevant news or upcoming announcements. Provide a comprehensive outlook.`;
            };

            // Delegate Gemini Interaction
            list.addEventListener('pointerdown', (e) => {
                const smartBtn = e.target.closest('.btn-smart-alert');
                if (smartBtn && !smartBtn.dataset.geminiBound) {
                    smartBtn.dataset.geminiBound = 'true';
                    LinkHelper.bindGeminiInteraction(
                        smartBtn,
                        () => getPrompt(smartBtn)
                    );
                    // Re-trigger the event for this instance since it's already down
                    const downEvt = new PointerEvent('pointerdown', e);
                    smartBtn.dispatchEvent(downEvt);
                }
            });

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
                    // Check if we clicked the Gemini button (ignore card click)
                    if (e.target.closest('.btn-smart-alert')) return;

                    const code = card.dataset.code;
                    if (code) {

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




    }

    static _updateList(modal) {
        const list = modal.querySelector(`#${IDS.NOTIFICATION_LIST}`);
        const chips = modal.querySelector(`#${IDS.FILTER_CHIPS_CONTAINER}`);
        if (!list || !chips) return;

        list.innerHTML = '';
        chips.innerHTML = '';

        // Update Time
        const timeArea = modal.querySelector(`#${IDS.NOTIF_TIMESTAMP}`);
        const lastUpd = notificationStore.lastUpdated ? new Date(notificationStore.lastUpdated).toLocaleTimeString() : UI_LABELS.NOT_SET;
        if (timeArea) timeArea.textContent = `${UI_LABELS.LAST_SYNCED} ${lastUpd}`;

        // 0. Update Dismiss Button State (Live)
        if (notificationStore) {
            NotificationUI._updateDismissState(modal);
        }


        // 1. Fetch Data
        // Local Alerts: Returns { pinned: [], fresh: [] }
        const localData = notificationStore.getLocalAlerts() || { pinned: [], fresh: [] };
        // Flatten Local: Pinned first, then Fresh
        let localAlerts = [...(localData.pinned || []), ...(localData.fresh || [])];

        // Global Scans: Returns { movers: {up, down}, hilo: {high, low} }
        // FIX: Use strict mode (false) so that if thresholds are "Not Set" (0), no shares are returned.
        const globalData = notificationStore.getGlobalAlerts(false) || { movers: { up: [], down: [] }, hilo: { high: [], low: [] } };

        const rules = notificationStore.getScannerRules() || { up: {}, down: {} };

        // SORTING HELPERS

        // 1. Alphabetical Sort
        const indexSort = (a, b) => {
            const codeA = String(a.code || a.shareName || '').toUpperCase();
            const codeB = String(b.code || b.shareName || '').toUpperCase();
            return codeA.localeCompare(codeB);
        };

        // 2. Robust Parser: Handles "-$1.27", "4.06%", etc.
        const parseVal = (v) => {
            if (typeof v === 'number') return v;
            if (!v) return 0;
            const clean = String(v).replace(/[^0-9.-]+/g, '');
            return parseFloat(clean) || 0;
        };

        // 3. Percentage Magnitude Sort (Desc Pct -> Tiebreak Dollar)
        const pctSort = (a, b) => {
            const rawPctA = Math.abs(parseVal(a.pct || a.changeInPercent || a.pctChange));
            const rawPctB = Math.abs(parseVal(b.pct || b.changeInPercent || b.pctChange));

            const roundA = Number(rawPctA.toFixed(2));
            const roundB = Number(rawPctB.toFixed(2));
            if (roundA !== roundB) return roundB - roundA;

            const dolA = Math.abs(parseVal(a.change || a.valueChange));
            const dolB = Math.abs(parseVal(b.change || b.valueChange));
            return dolB - dolA;
        };

        // 4. Dollar Magnitude Sort (Desc Dollar -> Tiebreak Pct)
        const dolSort = (a, b) => {
            const dolA = Math.abs(parseVal(a.change || a.valueChange));
            const dolB = Math.abs(parseVal(b.change || b.valueChange));

            if (Math.abs(dolA - dolB) > 0.001) return dolB - dolA;

            const rawPctA = Math.abs(parseVal(a.pct || a.changeInPercent || a.pctChange));
            const rawPctB = Math.abs(parseVal(b.pct || b.changeInPercent || b.pctChange));
            return rawPctB - rawPctA;
        };

        // SORTING HELPERS (Mover Magnitude Sort)
        const moverSort = (a, b, ruleSet) => {
            const pctA = Math.abs(parseVal(a.pct || a.changeInPercent || a.pctChange));
            const pctB = Math.abs(parseVal(b.pct || b.changeInPercent || b.pctChange));
            const threshVal = parseVal(ruleSet?.percentThreshold || 0);

            const hitA = pctA >= threshVal && threshVal > 0;
            const hitB = pctB >= threshVal && threshVal > 0;

            if (hitA && !hitB) return -1;
            if (!hitA && hitB) return 1;

            if (hitA) return pctSort(a, b); // Magnitude % then Magnitude $
            return dolSort(a, b); // Magnitude $ then Magnitude %
        };

        // SORTING (Custom Section Only):
        // Order: Targets -> Losers -> 52W Lows -> 52W Highs -> Gainers
        // Sorting Logic: Targets A-Z, Losers/Gainers Magnitude (% then $), 52W A-Z
        const sortedLocal = [...localAlerts].sort((a, b) => {
            const getRank = (item) => {
                const intent = (item.intent || '').toLowerCase();
                const type = (item.type || '').toLowerCase();
                const pct = Number(item.pct || item.changeInPercent || 0);
                const isDown = (item.direction || '').toLowerCase() === 'down' || pct < 0;
                const isHilo = (intent.includes('hilo') || intent.includes('52') || type.includes('hilo'));

                // Rank 1: Targets ("standard a to z sort")
                if (intent === 'target' || intent === 'target-hit') return 1;

                // Rank 2: Losers (User: "what should be displayed first is the highest percentage losers")
                if (!isHilo && isDown) return 2;

                // Rank 3: 52W Low (User requested order: "52-week low 52-week high")
                const HiloLow = (isHilo && isDown) || (intent.includes('low') && isHilo);
                if (HiloLow) return 3;

                // Rank 4: 52W High
                const HiloHigh = (isHilo && !isDown) || (intent.includes('high') && isHilo);
                if (HiloHigh) return 4;

                // Rank 5: Gainers
                return 5;
            };

            const rankA = getRank(a);
            const rankB = getRank(b);

            if (rankA !== rankB) return rankA - rankB;

            // Tie-breakers
            if (rankA === 1) return indexSort(a, b);
            if (rankA === 2) return moverSort(a, b, rules.down);
            if (rankA === 3 || rankA === 4) return indexSort(a, b);
            if (rankA === 5) return moverSort(a, b, rules.up);

            return indexSort(a, b);
        });

        // Global Scans Extraction
        const finalMoversUp = globalData.movers?.up || [];
        const finalMoversDown = globalData.movers?.down || [];
        const finalHiloHigh = globalData.hilo?.high || [];
        const finalHiloLow = globalData.hilo?.low || [];


        // SPLIT SORT LOGIC: Top Tier (>= Threshold) by Pct, Bottom Tier (< Threshold) by Dollar
        const splitSort = (items, threshold) => {
            if (!items || items.length === 0) return [];
            const threshVal = parseVal(threshold);

            const topTier = [];
            const bottomTier = [];

            items.forEach(item => {
                const pct = Math.abs(parseVal(item.pct || item.changeInPercent || item.pctChange));
                // Use a small epsilon for float comparison safety or standard rounding?
                // Standard Number comparison is usually fine for thresholds like 4 vs 3.77
                if (pct >= threshVal && threshVal > 0) {
                    topTier.push(item);
                } else {
                    bottomTier.push(item);
                }
            });

            topTier.sort(pctSort);
            bottomTier.sort(dolSort);

            return [...topTier, ...bottomTier];
        };

        // Apply Sorting Strategies

        // 52 Week High/Low: "Should just be done alphabetically"
        finalHiloHigh.sort(indexSort);
        finalHiloLow.sort(indexSort);

        // Market Movers: Split Sort based on Rules
        // Gainers
        const upThresh = rules.up?.percentThreshold || 0;
        const sortedMoversUp = splitSort(finalMoversUp, upThresh);

        // Losers
        const downThresh = rules.down?.percentThreshold || 0;
        const sortedMoversDown = splitSort(finalMoversDown, downThresh);

        // (We need to re-assign or use these new variables in the sections array)
        // I will re-assign to the final arrays to minimalize changes below
        finalMoversUp.length = 0; finalMoversUp.push(...sortedMoversUp);
        finalMoversDown.length = 0; finalMoversDown.push(...sortedMoversDown);

        // Format Helper: CLEANER TEXT for Null/Zero
        const fmtRules = (r, defaultMin, dir) => {
            const icon = dir === 'up' ? '<i class="fas fa-caret-up"></i> ' : '<i class="fas fa-caret-down"></i> ';
            const hasPct = r.percentThreshold && r.percentThreshold > 0;
            const hasDol = r.dollarThreshold && r.dollarThreshold > 0;

            if (!hasPct && !hasDol) return UI_LABELS.NOT_SET;

            const parts = [];
            if (hasPct) parts.push(`${icon}${r.percentThreshold}%`);
            if (hasDol) parts.push(`${icon}$${r.dollarThreshold}`);
            return parts.join(' or ');
        };

        const minPriceVal = rules.minPrice ?? 0;
        const thresholdStr = (minPriceVal > 0) ? `Min $${minPriceVal}` : null;
        const thresholdStrColored = thresholdStr ? `<span style="color: var(--color-accent);">${thresholdStr}</span>` : '';

        // 52 Week Highs/Lows Strings
        const hiloPriceVal = rules.hiloMinPrice ?? 0;
        const hiloStrBase = (hiloPriceVal > 0) ? `<span style="color: var(--color-accent);">${UI_LABELS.MIN_PRICE_LABEL}${hiloPriceVal}</span>` : UI_LABELS.NOT_SET;

        const explainerStyle = 'display:block; font-size: 0.65rem; opacity: 0.7; font-weight: normal; margin-top: 2px;';

        const hiloStrHigh = `${hiloStrBase}<span style="${explainerStyle}">${UI_LABELS.HILO_HIGH_EXPLAINER}</span>`;
        const hiloStrLow = `${hiloStrBase}<span style="${explainerStyle}">${UI_LABELS.HILO_LOW_EXPLAINER}</span>`;

        // Gainers
        const upRuleStr = fmtRules(rules.up || {}, 0, 'up');
        let upStr = (upRuleStr === UI_LABELS.NOT_SET && !thresholdStr)
            ? UI_LABELS.NOT_SET
            : (upRuleStr === 'Not set' ? thresholdStrColored : `${upRuleStr}${thresholdStr ? ` • ${thresholdStrColored}` : ''}`);
        upStr += `<span style="${explainerStyle}">${UI_LABELS.GAINERS_EXPLAINER}</span>`;

        // Losers
        const downRuleStr = fmtRules(rules.down || {}, 0, 'down');
        let downStr = (downRuleStr === UI_LABELS.NOT_SET && !thresholdStr)
            ? UI_LABELS.NOT_SET
            : (downRuleStr === UI_LABELS.NOT_SET ? thresholdStrColored : `${downRuleStr}${thresholdStr ? ` • ${thresholdStrColored}` : ''}`);
        downStr += `<span style="${explainerStyle}">${UI_LABELS.LOSERS_EXPLAINER}</span>`;

        // Split local alerts into Target hits and movement hits for section separation
        const wlTargets = sortedLocal.filter(h => h.intent === 'target' || h.intent === 'target-hit');
        const wlOthers = sortedLocal.filter(h => h.intent !== 'target' && h.intent !== 'target-hit');

        // Structure Definitions
        // 1. Calculate Total Alerts for Status Bar (Global + Local)
        // Assuming targetHits, moversHits, highHits, lowHits, gainerHits, loserHits are defined elsewhere
        // For now, using the existing final arrays and wlTargets/wlOthers
        const targetHits = wlTargets;
        const moversHits = { list: wlOthers, count: wlOthers.length }; // Adapting to the instruction's structure
        const highHits = finalHiloHigh;
        const lowHits = finalHiloLow;
        const gainerHits = finalMoversUp;
        const loserHits = finalMoversDown;

        const totalAlertsCount = targetHits.length + moversHits.count + highHits.length + lowHits.length + gainerHits.length + loserHits.length;
        this._updateStatusBar(modal);

        const sections = [
            { id: 'target-alerts', title: 'Target Alerts', chipLabel: 'Targets', headerTitle: `<i class="fas fa-crosshairs" style="color: var(--color-accent); margin-right: 8px;"></i><span style="color: var(--text-color);">Target Alerts</span>`, subtitle: `<span style="color: var(--color-accent);">Your targets hit</span>`, hits: targetHits, type: 'custom', color: 'neutral' },
            { id: 'custom-movers', title: 'Watchlist Movers', chipLabel: 'Watchlist', headerTitle: `<i class="fas fa-binoculars" style="color: var(--color-accent); margin-right: 8px;"></i><span style="color: var(--text-color);">Watchlist Movers</span>`, subtitle: `<span style="color: var(--color-accent);">Your watchlist hits</span>`, hits: moversHits.list, type: 'custom', color: 'neutral' },
            { id: 'hilo-high', title: `${UI_LABELS.FIFTY_TWO_WEEK} <span style="color: var(--color-positive)">${UI_LABELS.HIGH}</span>`, chipLabel: `${UI_LABELS.FIFTY_TWO_WEEK} ${UI_LABELS.HIGH}`, subtitle: hiloStrHigh, hits: highHits, type: 'hilo-up', color: 'green' },
            { id: 'hilo-low', title: `${UI_LABELS.FIFTY_TWO_WEEK} <span style="color: var(--color-negative)">${UI_LABELS.LOW}</span>`, chipLabel: `${UI_LABELS.FIFTY_TWO_WEEK} ${UI_LABELS.LOW}`, subtitle: hiloStrLow, hits: lowHits, type: 'hilo-down', color: 'red' },
            { id: 'gainers', title: `${UI_LABELS.MARKET} <span style="color: var(--color-positive)">${UI_LABELS.GAINERS}</span>`, chipLabel: UI_LABELS.GAINERS, subtitle: upStr, hits: gainerHits, type: 'gainers', color: 'green' },
            { id: 'losers', title: `${UI_LABELS.MARKET} <span style="color: var(--color-negative)">${UI_LABELS.LOSERS}</span>`, chipLabel: UI_LABELS.LOSERS, subtitle: downStr, hits: loserHits, type: 'losers', color: 'red' }
        ];

        // --- DEBUG LOGGING: RENDER COUNT ---
        let totalRendered = 0;
        sections.forEach(s => totalRendered += s.hits.length);

        // Render Filter Chips
        chips.innerHTML = '';

        // 3x2 GRID ORDER (Row 1: Targets, 52W High, Gainers | Row 2: Watchlist, 52W Low, Losers)
        const chipOrder = [
            'target-alerts', 'hilo-high', 'gainers',
            'custom-movers', 'hilo-low', 'losers'
        ];

        chipOrder.forEach(targetId => {
            const section = sections.find(s => s.id === targetId);
            if (section) {
                const itemCount = section.hits.length;
                const chip = document.createElement('div');
                chip.className = `${CSS_CLASSES.FILTER_CHIP} chip-${section.color}`;
                chip.dataset.target = section.id;

                chip.innerHTML = `
                    <span class="${CSS_CLASSES.CHIP_BADGE}">${itemCount}</span>
                    <span class="${CSS_CLASSES.CHIP_LABEL}">${section.chipLabel}</span>
                `;
                chips.appendChild(chip);
            }
        });

        // VIRTUAL LIST ORDER (Vertical Scroll Sequence): Targets, Watchlist, 52W High, 52W Low, Gainers, Losers
        // We iterate through the sections array directly to honor its defined order
        sections.forEach(sec => {
            const accordion = this._renderAccordion(sec, rules);
            list.appendChild(accordion);
        });

        // Re-bind events because we replaced innerHTML
        this._bindAccordionEvents(modal);

        // LOGIC: Handle Deep Linking or Defaults
        if (this._targetSection) {
            const targetChip = chips.querySelector(`.filter-chip[data-target="${this._targetSection}"]`);
            if (targetChip) {
                setTimeout(() => {
                    targetChip.click();
                }, 50);
            }
        }
        // REMOVED: Default to Gainers for Global Tab. 
        // User Request: "The default position should be dashboard open, not a specific selection"
        /*
        else if (this._activeTab === 'global') {
            const targetChip = chips.querySelector('.filter-chip[data-target="gainers"]');
             // ...
        } 
        */

        this._activeTab = null; // Clear to prevent sticky state
    }

    static _bindAccordionEvents(modal) {
        const chips = modal.querySelectorAll(`.${CSS_CLASSES.FILTER_CHIP}`);
        const sections = modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_SECTION}`);
        const listBody = modal.querySelector('#notificationList');

        // HELPER: Toggle a specific section
        const toggleSection = (id, forceExpand = null) => {
            const sec = modal.querySelector(`#section-${id}`);
            if (!sec) return;
            const isExpanded = forceExpand !== null ? forceExpand : !sec.classList.contains(CSS_CLASSES.EXPANDED);

            if (isExpanded) {
                sec.classList.add(CSS_CLASSES.EXPANDED);
                sec.style.display = 'block';
                // Highlight the corresponding chip
                const chip = modal.querySelector(`.filter-chip[data-target="${id}"]`);
                if (chip) chip.classList.add(CSS_CLASSES.ACTIVE);
            } else {
                sec.classList.remove(CSS_CLASSES.EXPANDED);
                const chip = modal.querySelector(`.filter-chip[data-target="${id}"]`);
                if (chip) chip.classList.remove(CSS_CLASSES.ACTIVE);
            }
            syncDashboardLabel();
        };

        // HELPER: Sync the Dashboard chip label
        const syncDashboardLabel = () => {
            // Dashboard chip removed, no need to sync label
        };

        // HELPER: Close all sections
        const closeAll = () => {
            sections.forEach(s => {
                s.classList.remove(CSS_CLASSES.EXPANDED);
            });
            // Also Clear all Dashboard chip highlights
            chips.forEach(c => c.classList.remove(CSS_CLASSES.ACTIVE));
            syncDashboardLabel();
        };

        // HELPER: Open all sections
        const openAll = () => {
            sections.forEach(s => {
                s.classList.add(CSS_CLASSES.EXPANDED);
                s.style.display = 'block';
            });
            syncDashboardLabel();
        };

        // INITIAL STATE: Open Target Alerts by Default
        closeAll();

        // Force instant layout to get the correct height/position
        listBody.classList.add('instant-layout');
        toggleSection('target-alerts', true);

        const firstSec = modal.querySelector('#section-target-alerts');
        if (firstSec && listBody) {
            listBody.scrollTop = firstSec.offsetTop;
        }
        listBody.classList.remove('instant-layout');

        // Navigation Sync: Update Active Tile based on scroll position
        if (listBody) {
            listBody.addEventListener('scroll', () => {
                // If the user clicked a chip, don't let the scroll listener override the highlight
                // until the smooth scroll completes.
                if (this._isManuallyNavigating) return;

                const anyExpanded = Array.from(sections).some(s => s.classList.contains(CSS_CLASSES.EXPANDED));
                let currentId = null;
                const scrollPos = listBody.scrollTop + 80; // Slightly higher threshold for better "sticky" feeling

                if (anyExpanded) {
                    sections.forEach(sec => {
                        if (sec.classList.contains(CSS_CLASSES.EXPANDED) && sec.offsetTop <= scrollPos) {
                            currentId = sec.id.replace('section-', '');
                        }
                    });
                }

                // Update Tile Highlights
                chips.forEach(c => {
                    const isMatched = (c.dataset.target === currentId);
                    if (isMatched) c.classList.add(CSS_CLASSES.ACTIVE);
                    else c.classList.remove(CSS_CLASSES.ACTIVE);
                });
            }, { passive: true });
        }

        // Tile Events (Filter / Anchor Navigation)
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = chip.dataset.target;
                const list = modal.querySelector('#notificationList');

                if (targetId === 'open-all') {
                    // TOGGLE LOGIC: If all are expanded -> Close All. Otherwise -> Open All.
                    const allExpanded = Array.from(sections).every(s => s.classList.contains(CSS_CLASSES.EXPANDED));

                    // Clear EVERY chip highlight first (Single Selection)
                    chips.forEach(c => c.classList.remove(CSS_CLASSES.ACTIVE));

                    if (allExpanded) {
                        closeAll();
                        // Remains black (deselected)
                    } else {
                        openAll();
                        chip.classList.add(CSS_CLASSES.ACTIVE); // Highlight Grey
                        if (list) list.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } else {
                    // USER REQUIREMENT: Focus on specific category with Toggle capability

                    // CHECK: Is this chip ALREADY active?
                    const isAlreadyActive = chip.classList.contains(CSS_CLASSES.ACTIVE);

                    // 1. Force Instant Layout to calculate FINAL position
                    listBody.classList.add('instant-layout');

                    closeAll();

                    // 2. Set manual navigation flag to prevent scroll listener interference
                    this._isManuallyNavigating = true;

                    // 3. Only Open if it wasn't already active (Toggle)
                    if (!isAlreadyActive) {
                        toggleSection(targetId, true); // Ensure target is open
                        chip.classList.add(CSS_CLASSES.ACTIVE);

                        const sec = modal.querySelector(`#section-${targetId}`);
                        if (sec) {
                            // FORCE REFLOW to ensure offsetTop is accurate after toggle
                            void listBody.offsetHeight;

                            const finalTop = sec.offsetTop;

                            // 4. Restore normal layout
                            listBody.classList.remove('instant-layout');

                            // 5. Smooth Scroll to Target
                            listBody.scrollTo({
                                top: finalTop,
                                behavior: 'smooth'
                            });
                        }
                    } else {
                        listBody.classList.remove('instant-layout');
                        chips.forEach(c => c.classList.remove(CSS_CLASSES.ACTIVE));
                    }

                    // Clear flag after smooth scroll duration
                    setTimeout(() => {
                        this._isManuallyNavigating = false;
                    }, 800);
                }
            });
        });

        // Accordion Header Events
        const headers = modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_HEADER} `);
        headers.forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.settings-link')) return; // Ignore subtitle link clicks

                const section = header.closest(`.${CSS_CLASSES.ACCORDION_SECTION}`);
                if (!section) return;
                const targetId = section.id.replace('section-', '');

                // Toggle this section
                const isCurrentlyExpanded = section.classList.contains(CSS_CLASSES.EXPANDED);

                // USER REQUIREMENT: Mutual Exclusion & Auto-Scroll (Match Chip Behavior)
                if (!isCurrentlyExpanded) {
                    // 1. Force Instant Layout to calculate positions correctly after closeAll
                    listBody.classList.add('instant-layout');

                    closeAll(); // Close others first
                    toggleSection(targetId, true);

                    // 2. Scroll to Section
                    const sec = modal.querySelector(`#section-${targetId}`);
                    if (sec) {
                        this._isManuallyNavigating = true; // Prevent scroll spy interference

                        // Small timeout to allow layout repaint if needed, though instant-layout helps
                        setTimeout(() => {
                            listBody.classList.remove('instant-layout');
                            listBody.scrollTo({
                                top: sec.offsetTop,
                                behavior: 'smooth'
                            });
                            // Clear flag after scroll
                            setTimeout(() => { this._isManuallyNavigating = false; }, 800);
                        }, 10);
                    } else {
                        listBody.classList.remove('instant-layout');
                    }
                } else {
                    toggleSection(targetId, false);
                }
            });
        });

        // NOTIFICATION CARD CLICK LISTENER (Delegated)
        // Dispatches ASX_CODE_CLICK to trigger AppController's logic (Watchlist Open OR Search Fallback)
        modal.addEventListener('click', (e) => {
            const card = e.target.closest(`.${CSS_CLASSES.NOTIFICATION_CARD_GRID}`);
            if (card && card.dataset.code) {
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
        const { id, title, subtitle, hits, isSystem, headerTitle, type, color } = section; // Destructure new properties
        const count = hits.length;

        const wrap = document.createElement('div');
        // All sections expanded by default for V3 Dashboard Transparency
        const isExpanded = true;
        wrap.className = `${CSS_CLASSES.ACCORDION_SECTION} ${isExpanded ? CSS_CLASSES.EXPANDED : ''} ${isSystem ? 'system-section' : ''}`; // Add system-section class
        wrap.id = `section-${id}`;

        const header = document.createElement('div');
        header.className = CSS_CLASSES.ACCORDION_HEADER;

        // Determine Subtitle Color Class
        let colorStyle = '';
        if (color === 'green') colorStyle = 'color: var(--color-positive);';
        if (color === 'red') colorStyle = 'color: var(--color-negative);';

        // Header Content with Subtitle
        const subtitleHTML = `<div class="${CSS_CLASSES.ACCORDION_SUBTITLE}" style="${colorStyle}">${subtitle}</div>`;

        header.innerHTML = `
            <div class="accordion-title-row">
                <div class="accordion-title">${headerTitle || title}</div>
                ${subtitleHTML}
            </div>
            <div class="accordion-meta">
                <span class="${CSS_CLASSES.BADGE_PILL}">${count}</span>
                <i class="fas fa-chevron-down accordion-icon"></i>
            </div>
        `;

        const body = document.createElement('div');
        body.className = CSS_CLASSES.ACCORDION_BODY;

        // Handle system sections differently
        if (isSystem && id === 'sector-monitoring') {
            body.innerHTML = this._renderSectorSection();
        } else if (count === 0) {
            let hint = 'No alerts found.';
            if (id === 'custom-movers') hint = 'No custom hits. Add targets in "Add Share".';
            if (id === 'gainers' || id === 'losers') hint = 'Filtered by your Threshold settings.';
            if (id === 'hilo-high' || id === 'hilo-low') hint = 'Filtered by your Min Price setting.';

            body.innerHTML = `
            <div style="text-align:center; color:var(--text-muted); padding:0.5rem 1rem; font-size:0.75rem;">
                ${hint}
            </div>`;
        } else {
            hits.forEach(item => { // Changed from section.items.forEach to hits.forEach
                body.innerHTML += this._renderCard(item, type, rules);
            });
        }

        wrap.appendChild(header);
        wrap.appendChild(body);
        return wrap;
    }

    static _renderCard(item, type, rules = {}) {
        // --- ROBUST KEY MAPPING & ENRICHMENT ---
        let code = String(item.code || item.shareName || item.symbol || item.s || item.shareCode || '???').toUpperCase();
        let name = item.name || item.companyName || '';
        if (!name && item.desc) name = item.desc; // common alias
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
            if (!name) name = liveShare.companyName || liveShare.name || liveShare.desc || '';

            // If still empty, try one last lookup in global shares list
            if (!name && AppState.data.shares) {
                const fallback = AppState.data.shares.find(s => (s.code === cleanCode || s.code === code));
                if (fallback) name = fallback.name || fallback.companyName || '';
            }

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

                // FIX: Always prefer currentPrice if it exists, ensuring the UI reflects live reality
                // rather than the potentially stale snapshot price from the hit document.
                if (currentPrice > 0) {
                    rawPrice = currentPrice;
                    price = formatCurrency(rawPrice);
                }
            }
        }

        // --- HELPER: Icon & Text Generator ---
        const getExplainer = (alertItem, alertType, enrichedPct = null) => {
            const intent = alertItem.intent || '';
            const type = alertItem.type || '';
            let text = '';
            let range = '';
            let iconClass = '';
            let colorVar = 'var(--color-accent)'; // Default to accent color

            const isHiLo = intent === 'hilo' || intent.includes('hilo') || alertType.includes('hilo') || intent === '52w-high' || intent === '52w-low';
            const isGainers = alertType === 'gainers' || intent === 'gainers';
            const isLosers = alertType === 'losers' || intent === 'losers';
            const isTarget = intent === 'target' || intent === 'target-hit';

            // 1. PRICE TARGET
            if (isTarget) {
                iconClass = 'fa-crosshairs'; // Target Icon

                // --- DYNAMIC DATA ENRICHMENT (User Request) ---
                // If we have the share in AppState, prioritize its CURRENT target config
                // over the one captured in the alertItem (which might be stale).
                const cleanC = (code || '').replace(/\.AX$/i, '').trim().toUpperCase();
                const freshShare = getBestShareMatch(AppState.data.shares, cleanC);

                const shareConfig = freshShare || alertItem;
                const currentTarget = freshShare ? freshShare.targetPrice : (alertItem.target || alertItem.targetPrice || 0);
                const currentDirection = freshShare ? freshShare.targetDirection : (alertItem.direction || alertItem.condition || 'below');

                let sbPrefix = 'S'; // Default Sell
                if (shareConfig.buySell === 'buy') {
                    sbPrefix = 'B';
                } else if (shareConfig.buySell === 'sell') {
                    sbPrefix = 'S';
                } else if (currentDirection === 'below') {
                    sbPrefix = 'B'; // Infer Buy for 'below'
                }

                // Caret reflects the actual TRIGGER direction (Above/Below)
                const targetCaret = currentDirection === 'above'
                    ? '<i class="fas fa-caret-up" style="margin-left: 2px;"></i>'
                    : '<i class="fas fa-caret-down" style="margin-left: 2px;"></i>';

                // Display: "B $Target ▲"
                text = `<span style="font-weight: 700; margin-right: 2px;">${sbPrefix}</span> ${formatCurrency(currentTarget)} ${targetCaret} `;

                // Keep Target coffee/netural as usually it's a specific trigger type,
                // but user said "Chevron arrow use assist... should display first".
                // We'll keep default accent color for Target unless specified otherwise.
            }

            // 2. 52-WEEK HIGH / LOW
            else if (isHiLo) {
                iconClass = 'fa-hourglass-half'; // Hourglass Icon
                const limit = rules.hiloMinPrice || 0;
                text = (limit > 0) ? `$${limit} min` : 'None';

                const low = (alertItem.low52 || alertItem.low || 0).toFixed(2);
                const high = (alertItem.high52 || alertItem.high || 0).toFixed(2);
                range = `52w Range ${low} -${high} `;

                // Color Logic
                const intentLower = (alertItem.intent || '').toLowerCase();
                const typeLower = (alertItem.type || '').toLowerCase();
                if (intentLower.includes('high') || typeLower.includes('high')) {
                    colorVar = 'var(--text-positive)';
                } else if (intentLower.includes('low') || typeLower.includes('low')) {
                    colorVar = 'var(--text-negative)';
                }
            }

            // 3. VALUE ALERTS
            else if (intent === 'value' || type === 'overvalued' || type === 'undervalued') {
                iconClass = 'fa-balance-scale';
                const pe = (Number(alertItem.pe) || 0).toFixed(1);

                if (type === 'overvalued') {
                    colorVar = 'var(--color-negative)';
                    text = `High P/E ${pe}`;
                } else {
                    colorVar = 'var(--color-positive)';
                    text = `Low P/E ${pe}`;
                }
            }

            // 4. MARKET MOVERS (Gainers/Losers/Generic)
            else {
                iconClass = 'fa-chart-line'; // Chart Icon
                let direction = 'up';

                // Determine direction
                const intentStr = (item.intent || '').toLowerCase();
                const typeStr = (item.type || '').toLowerCase();
                if (intentStr === 'up' || typeStr === 'up' || intentStr === 'gainers' || typeStr === 'gainers') direction = 'up';
                else if (intentStr === 'down' || typeStr === 'down' || intentStr === 'losers' || typeStr === 'losers') direction = 'down';
                else direction = enrichedPct >= 0 ? 'up' : 'down';

                // Color Logic
                colorVar = direction === 'up' ? 'var(--text-positive)' : 'var(--text-negative)';

                const ruleSet = direction === 'up' ? (rules.up || {}) : (rules.down || {});
                const hasPct = ruleSet.percentThreshold && ruleSet.percentThreshold > 0;
                const hasDol = ruleSet.dollarThreshold && ruleSet.dollarThreshold > 0;

                const chevronIcon = direction === 'up'
                    ? `<i class="fas fa-caret-up" style="margin-right: 1px; font-size: 0.8em; color: ${colorVar};"></i>`
                    : `<i class="fas fa-caret-down" style="margin-right: 1px; font-size: 0.8em; color: ${colorVar};"></i>`;

                if (hasPct || hasDol) {
                    let textParts = [];
                    if (hasPct) textParts.push(`${chevronIcon}${ruleSet.percentThreshold}%`);
                    if (hasDol) textParts.push(`${chevronIcon}$${ruleSet.dollarThreshold}`);

                    const minP = rules.minPrice || 0;
                    const minPart = (minP > 0) ? ` • Min $${minP}` : '';

                    text = `${textParts.join(' or ')}${minPart}`;
                } else {
                    text = `${chevronIcon}${Math.abs(enrichedPct).toFixed(2)}%`;
                }

                const low = (alertItem.low52 || alertItem.low || 0).toFixed(2);
                const high = (alertItem.high52 || alertItem.high || 0).toFixed(2);
                if (low > 0 && high > 0) range = `52w Range ${low} -${high} `;
            }

            return { text, range, iconClass, colorVar };
        };
        // RENDERING LOGIC: SINGLE VS STACKED
        let explainerText = '';
        let explainerRange = '';

        // Stacked (Custom Multiple)
        if (type === 'custom' && item.matches && item.matches.length > 1) {
            // Sort Order: Target -> 52W -> Movers
            const sortedMatches = [...item.matches].sort((a, b) => {
                const getRank = (m) => {
                    const i = (m.intent || '').toLowerCase();
                    const t = (m.type || '').toLowerCase();
                    if (i === 'target' || i === 'target-hit') return 1;
                    if (i.includes('hilo') || i.includes('52') || t.includes('hilo')) return 2;
                    return 3;
                };
                return getRank(a) - getRank(b);
            });

            // Extract Range from Hilo match if exists
            const hiloMatch = sortedMatches.find(m => m.intent && m.intent.includes('hilo'));
            if (hiloMatch) {
                const obj = getExplainer(hiloMatch, type, changePct);
                explainerRange = obj.range || '';
            }

            // Generate Lines with Icons
            const lines = sortedMatches.map(m => {
                const { text, iconClass, colorVar } = getExplainer(m, type, changePct);
                if (!text || text === 'None') return null;
                // Use Dynamic Color
                return `<div style="line-height: 1.4; display: flex; align-items: center;">
                            <i class="fas ${iconClass}" style="color: ${colorVar || 'var(--color-accent)'}; margin-right: 6px; width: 14px; text-align: center;"></i>
                            <span style="color: ${colorVar || 'inherit'}">${text}</span>
                        </div>`;
            }).filter(Boolean);

            explainerText = lines.join('');

        } else {
            // Single Item
            if (item.reason) {
                explainerText = item.reason;
            } else {
                const { text, range, iconClass, colorVar } = getExplainer(item, type, changePct);
                explainerText = `<div style="display: flex; align-items: center;">
                                    <i class="fas ${iconClass}" style="color: ${colorVar || 'var(--color-accent)'}; margin-right: 6px; width: 14px; text-align: center;"></i>
                                    <span style="color: ${colorVar || 'inherit'}">${text}</span>
                                 </div>`;
                explainerRange = range || '';
            }
        }

        // Force Direction based on Type (Override for Hi/Lo/Gainer/Loser)
        if (type === 'hilo-up' || type === 'up' || type === 'gainers') changePct = Math.abs(changePct);
        if (type === 'hilo-down' || type === 'down' || type === 'losers') changePct = -Math.abs(changePct);

        let changeClass = changePct >= 0 ? CSS_CLASSES.POSITIVE : CSS_CLASSES.NEGATIVE;
        let arrowIcon = changePct >= 0 ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';
        let changeFormatted = `${arrowIcon} ${formatCurrency(Math.abs(changeAmt))} (${Math.abs(changePct).toFixed(2)}%)`;

        // Card Border Class Logic
        let cardClass = CSS_CLASSES.CARD_NEUTRAL;
        if (item.intent === 'target' || item.intent === 'target-hit') {
            cardClass = CSS_CLASSES.CARD_TARGET;
        } else if (changePct > 0) {
            cardClass = CSS_CLASSES.CARD_UP;
        } else if (changePct < 0) {
            cardClass = CSS_CLASSES.CARD_DOWN;
        }
        if (item._isPinned) cardClass += ` ${CSS_CLASSES.CARD_PINNED} `;

        // --- SECTOR / INDUSTRY ENRICHMENT ---
        let sector = item.Sector || item.Industry || item.industry || item.sector;
        if (!sector && liveShare) sector = liveShare.industry || liveShare.Industry || liveShare.Sector || liveShare.sector;
        if (!sector) {
            const fallbackShare = AppState.data.shares.find(s => {
                const sCode = String(s.code || s.shareName || s.symbol || '').toUpperCase();
                return sCode === cleanCode;
            });
            if (fallbackShare) sector = fallbackShare.industry || fallbackShare.Sector || fallbackShare.sector;
        }

        let sectorHtml = '';
        if (sector) {
            sectorHtml = `
            <div class="${CSS_CLASSES.NOTIF_CELL_SECTOR} ${CSS_CLASSES.GHOSTED}" style="grid-column: 1 / -1; font-size: 0.85rem; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted);">
                ${sector}
            </div>`;
        }

        // --- SMART ALERT BUTTON (AI Integration) ---
        // Repositioned to bottom-right of container (Absolute)
        // User requested image replacement
        let smartAlertBtn = '';
        // ALWAYS SHOW if we have a code (Relaxed threshold from 2.0%)
        if (code) {
            smartAlertBtn = `<a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" class="btn-smart-alert" role="link" aria-label="Ask AI Deep Dive" title="Ask AI Why" data-symbol="${code}" data-change="${(changePct || 0).toFixed(2)}" data-sector="${sector || ''}" style="border:none; background:none; cursor:pointer; font-size:1.1rem; color: #9c27b0; position: absolute; bottom: 6px; right: 6px; z-index: 10; text-decoration: none; -webkit-touch-callout: default !important; user-select: auto !important;">
            <img src="gemini-icon.png" style="width: 20px; height: 20px; vertical-align: middle; pointer-events: none;">
            </a>`;
        }

        //GRID LAYOUT IMPLEMENTATION
        return `
                <div class="${CSS_CLASSES.NOTIFICATION_CARD_GRID} ${cardClass}" data-code="${code}" style="position: relative;">
                <!--R1: CODE | PRICE-->
                <div class="${CSS_CLASSES.NOTIF_CELL_CODE}">${code}</div>
                <div class="${CSS_CLASSES.NOTIF_CELL_PRICE}">${price}</div>

                <!--R2: NAME | CHANGE-->
                <div class="${CSS_CLASSES.NOTIF_CELL_NAME}">${name}</div>
                <div class="${CSS_CLASSES.NOTIF_CELL_CHANGE} ${changeClass}">${changeFormatted}</div>

                <!--R3: EXPLAINER | RANGE(Optional)-->
                <div class="${CSS_CLASSES.NOTIF_CELL_EXPLAINER}">
                    ${explainerText}
                </div>
                <div class="${CSS_CLASSES.NOTIF_CELL_RANGE}">${explainerRange}</div>
                
                <!--R4: SECTOR(Full Width)-->
            ${sectorHtml}

                <!--AI Button(Floating Bottom Right)-->
            ${smartAlertBtn}
            </div>
            `;
    }

    static async renderFloatingBell() {
        if (document.getElementById('floating-bell-container')) return;

        // 1. Create Wrapper for Formatting/Positioning (Fixed)
        // 1. Create Wrapper for Formatting/Positioning (Fixed)
        // REINSTATEMENT FEATURE: Container MUST remain visible and clickable even if bell is hidden
        const container = document.createElement('div');
        container.id = 'floating-bell-container';
        container.className = `${CSS_CLASSES.FLOATING_BELL_CONTAINER}`;
        // Force dimensions to ensure hit-target exists when empty
        container.style.width = '60px';
        container.style.height = '60px';
        container.style.pointerEvents = 'auto'; // Capture clicks even if children are hidden
        container.style.zIndex = '9999'; // Ensure top layer

        // Note: CSS class usually handles position (fixed bottom left). 
        // We ensure it is NOT hidden by default logic here.

        // 2. Create the Button (The visual bell)
        const bell = document.createElement('button');
        bell.id = 'floating-bell';
        bell.className = CSS_CLASSES.FLOATING_BELL_BTN;

        // Initial InnerHTML with Badge (to ensure it exists for updateBadgeCount immediately)
        bell.innerHTML = `
            <div class="bell-icon-wrapper">
                <span class="kangaroo-icon-inline" style="font-size: 2.5rem; color: var(--color-accent);">${KANGAROO_ICON_SVG}</span>
            </div>
            <span class="notification-badge ${CSS_CLASSES.HIDDEN}">0</span>
        `;

        container.appendChild(bell);
        document.body.appendChild(container);

        // State tracking for long-press
        let pressTimer;
        let isLongPress = false;

        // Get references to the new elements
        const btn = bell; // Alias for cleaner event binding code below

        const startPress = () => {
            if (pressTimer) clearTimeout(pressTimer); // BUGFIX: Clear any existing timers to prevent "two-click" bug
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;

                // TOGGLE LOGIC: Check current preference state
                const currentPref = AppState.preferences.showBadges !== false;
                const newPref = !currentPref;
                // 1. Update State First
                if (AppState.preferences) {
                    AppState.preferences.showBadges = newPref;
                    // FIX: Persist to LocalStorage immediately so it survives Hard Reload
                    localStorage.setItem('ASX_NEXT_showBadges', newPref);

                    import('../data/AppService.js').then(({ AppService }) => {
                        const service = new AppService();
                        service.saveUserPreferences({ showBadges: newPref });
                    });
                }

                // 2. Visual Feedback
                if (newPref === false) {
                    // DISMISSING: Hide Bell Button ONLY (Keep Container for Reinstatement)
                    bell.classList.add(CSS_CLASSES.HIDDEN);
                    // Do NOT hide container: if (container) container.classList.add(CSS_CLASSES.HIDDEN);
                    ToastManager.show("Notifications Dismissed. Long press valid area to restore.", 'info');
                } else {
                    // RESTORING: Show Bell Button
                    bell.classList.remove(CSS_CLASSES.HIDDEN);
                    // bell.style.animation = 'popIn...'; REMOVED to allow CSS 'hopIn' to play instead

                    // Trigger update to render badge count
                    if (notificationStore) {
                        const counts = notificationStore.getBadgeCounts();
                        this.updateBadgeCount(counts.total);
                    }
                    ToastManager.show("Welcome Back! Notifications Restored.", 'success');
                }

                if (navigator.vibrate) navigator.vibrate(50); // Feedback
            }, 800);
        };
        const cancelPress = () => clearTimeout(pressTimer);

        // Bind events to CONTAINER to capture even when bell is hidden
        container.addEventListener('mousedown', startPress);
        container.addEventListener('touchstart', startPress, { passive: true });
        container.addEventListener('mouseup', cancelPress);
        container.addEventListener('mouseleave', cancelPress);
        container.addEventListener('touchend', cancelPress);

        // Keep Button Specifics (Click vs Press)
        // We bind click specific logic to the button, as clicking empty space shouldn't open modal
        btn.addEventListener('click', (e) => {
            if (isLongPress) {
                isLongPress = false;
                e.stopPropagation(); // Stop container click from propagating
                return;
            }
            // ... normal click logic below ...
        });

        // Click Logic (Open/Toggle Modal if not dismissing)
        btn.addEventListener('click', (e) => {
            if (isLongPress) {
                isLongPress = false;
                return; // Handled by startPress/Timer
            }

            // TOGGLE LOGIC: If notification modal is already open, close it.
            const existingModal = document.getElementById(IDS.NOTIFICATION_MODAL);
            if (existingModal && !existingModal.classList.contains(CSS_CLASSES.HIDDEN)) {
                this._close(existingModal);
                return;
            }

            // Dispatch Event for Controller to handle
            document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS, {
                detail: { source: 'custom' }
            }));
        });

        // 3. KANGAROO RESTORED (v1149): Revert to original SVG file
        try {
            const response = await fetch('notification_icon.svg');
            if (response.ok) {
                let svgContent = await response.text();
                // Defensive Fix: Ensure svgContent is a string before calling replace
                if (svgContent && typeof svgContent === 'string') {
                    svgContent = svgContent.replace(/width=".*?"/g, '').replace(/height=".*?"/g, '');
                }

                const wrapper = bell.querySelector('.bell-icon-wrapper');
                if (wrapper) wrapper.innerHTML = svgContent;
            }
        } catch (e) {
            console.error('Failed to load Notification SVG', e);
        }

        // Initialize Badge
        // Handled by AppController via event
    }

    /**
     * Renders a dashboard item for Sector Monitoring status
     */
    static _renderSectorSection() {
        const rules = (notificationStore && typeof notificationStore.getScannerRules === 'function')
            ? notificationStore.getScannerRules()
            : (AppState.preferences?.scannerRules || {});

        const allIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat();
        const totalIndustries = allIndustries.length;
        const activeFilters = rules.activeFilters;
        const isAll = (activeFilters === null || activeFilters === undefined);
        const activeCount = isAll ? totalIndustries : (Array.isArray(activeFilters) ? activeFilters.length : 0);
        const inactiveCount = Math.max(0, totalIndustries - activeCount);

        return `
            <div style="padding: 12px; background: var(--bg-secondary); border-left: 3px solid var(--color-accent); margin: 0 10px 10px 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">SCANNER COVERAGE</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${activeCount} of ${totalIndustries} Industries Active</div>
                </div>
                
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 100px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; text-align: center;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--color-positive);">${activeCount}</div>
                        <div style="font-size: 0.6rem; text-transform: uppercase; color: var(--text-muted); margin-top: 4px;">Monitored</div>
                    </div>
                    <div style="flex: 1; min-width: 100px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; text-align: center;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--color-negative);">${inactiveCount}</div>
                        <div style="font-size: 0.6rem; text-transform: uppercase; color: var(--text-muted); margin-top: 4px;">Blocked</div>
                    </div>
                </div>
                
                <div style="margin-top: 15px; font-size: 0.75rem; line-height: 1.4; color: var(--text-muted);">
                    <i class="fas fa-info-circle" style="margin-right: 6px; color: var(--color-accent);"></i>
                    Your scanner is currently filtering alerts based on your industry preferences.
                </div>
            </div>
            `;
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

        // Fix: Use global preference as source of truth
        const isHidden = (AppState.preferences.showBadges === false);

        if (isHidden) {
            wrapper.classList.remove(CSS_CLASSES.IS_SLASHED);
            dismissBtn.title = "Show Desktop Icon";
        } else {
            wrapper.classList.add(CSS_CLASSES.IS_SLASHED);
            dismissBtn.title = "Hide Desktop Icon";
        }

        // Remove ghosting - keep full strength
        dismissBtn.style.opacity = '1';

        // Never disable, so it remains a clickable toggle
        dismissBtn.disabled = false;
        dismissBtn.style.cursor = 'pointer';
    }

    /**
     * Updates the status bar to show Unified System State (V3 Dashboard Card).
     * Row 1: Override Status Title (STRICT Red/Green).
     * Row 2: Monitor Settings.
     */
    static _updateStatusBar(modal) {
        const ribbon = modal.querySelector('#notif-status-ribbon');
        if (!ribbon) return;

        const rules = (notificationStore && typeof notificationStore.getScannerRules === 'function')
            ? notificationStore.getScannerRules()
            : (AppState.preferences?.scannerRules || {});

        const overrideOn = rules.excludePortfolio !== false;

        // Total Alerts Count (Deduplicated logic from _updateList)
        const local = (notificationStore && typeof notificationStore.getLocalAlerts === 'function')
            ? notificationStore.getLocalAlerts()
            : { pinned: [], fresh: [] };
        const allLocal = [...(local.pinned || []), ...(local.fresh || [])];
        const targetCount = allLocal.filter(h => h.intent === 'target' || h.intent === 'target-hit').length;
        const moversCount = allLocal.filter(h => h.intent !== 'target' && h.intent !== 'target-hit').length;

        const globalData = (notificationStore && typeof notificationStore.getGlobalAlerts === 'function')
            ? notificationStore.getGlobalAlerts(false)
            : { movers: { up: [], down: [] }, hilo: { high: [], low: [] } };

        const totalGlobal = (globalData.movers?.up?.length || 0) + (globalData.movers?.down?.length || 0) +
            (globalData.hilo?.high?.length || 0) + (globalData.hilo?.low?.length || 0);

        const totalAlertsCount = targetCount + moversCount + totalGlobal;

        // Sector Counts
        const allIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat();
        const totalIndustries = allIndustries.length;
        const activeFilters = rules.activeFilters;
        const isAll = (activeFilters === null || activeFilters === undefined);
        const activeCount = isAll ? totalIndustries : (Array.isArray(activeFilters) ? activeFilters.length : 0);

        // SMART UI: Prominence through typography and spacing, no borders/backgrounds
        // User Request: "More relevant... under evaluated quality... click through"
        ribbon.style.cursor = 'pointer';

        ribbon.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div class="ribbon-left" style="display: flex; align-items: center; gap: 12px; font-size: 0.7rem;">
                <span style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--text-dominant); font-weight: 700; letter-spacing: 0.5px; opacity: 0.9;">TOTAL</span>
                    <span style="color: var(--color-positive); font-weight: 700; font-size: 0.7rem;">${totalAlertsCount}</span>
                </span>
                <span style="color: var(--text-muted); opacity: 0.3;">|</span>
                <span class="status-override-discreet" style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--text-dominant); font-weight: 700; letter-spacing: 0.5px; opacity: 0.9;">OVERRIDE</span>
                    <span class="${overrideOn ? 'status-override-on-txt' : 'status-override-off-txt'}" style="font-weight: 700; font-size: 0.7rem;">${overrideOn ? 'ON' : 'OFF'}</span>
                </span>
                <span style="color: var(--text-muted); opacity: 0.3;">|</span>
                <span style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--text-dominant); font-weight: 700; letter-spacing: 0.5px; opacity: 0.9;">SECTORS</span>
                    <span><span style="color: var(--color-positive); font-weight: 700;">${activeCount}</span> <span style="color: var(--text-muted); opacity: 0.7;">/ ${totalIndustries}</span></span>
                </span>
            </div>
                <div class="ribbon-right" style="padding-left: 10px;">
                    <i class="fas fa-chevron-right" style="font-size: 0.75rem; opacity: 0.5; color: var(--color-accent);"></i>
                </div>
            </div>
        `;

        // Make entire ribbon clickable
        ribbon.onclick = (e) => {
            e.stopPropagation();
            this._toggleIntelligenceReport(modal);
        };
    }

    /**
     * Toggles the detailed "Enforcement Report" overlay.
     */
    static _toggleIntelligenceReport(modal) {
        const report = modal.querySelector(`#${IDS.INTELLIGENCE_REPORT_OVERLAY}`);
        if (!report) return;

        if (report.classList.contains('visible')) {
            report.classList.remove('visible');
        } else {
            // Get current state to render fresh report
            const rules = (notificationStore && typeof notificationStore.getScannerRules === 'function')
                ? notificationStore.getScannerRules()
                : (AppState.preferences?.scannerRules || {});
            const prefs = AppState.preferences || {};

            this._renderIntelligenceReport(report, rules, prefs);
            report.classList.add('visible');
        }
    }

    /**
     * Renders the deep-dive transparency report inside the overlay.
     * Restructured for human-friendly hierarchy and "VIP" watchlist awareness.
     */
    static _renderIntelligenceReport(container, rules, prefs) {
        const overrideOn = rules.excludePortfolio !== false;

        // Calculate Total Alerts for display
        const local = (notificationStore && typeof notificationStore.getLocalAlerts === 'function')
            ? notificationStore.getLocalAlerts()
            : { pinned: [], fresh: [] };
        const allLocal = [...(local.pinned || []), ...(local.fresh || [])];
        const targetCount = allLocal.filter(h => h.intent === 'target' || h.intent === 'target-hit').length;
        const moversCount = allLocal.filter(h => h.intent !== 'target' && h.intent !== 'target-hit').length;
        const globalData = (notificationStore && typeof notificationStore.getGlobalAlerts === 'function')
            ? notificationStore.getGlobalAlerts(false)
            : { movers: { up: [], down: [] }, hilo: { high: [], low: [] } };
        const totalGlobal = (globalData.movers?.up?.length || 0) + (globalData.movers?.down?.length || 0) +
            (globalData.hilo?.high?.length || 0) + (globalData.hilo?.low?.length || 0);
        const totalAlertsCount = targetCount + moversCount + totalGlobal;

        // Threshold extraction with fallbacks
        const upPct = rules.up?.percentThreshold || 0;
        const upDol = rules.up?.dollarThreshold || 0;
        const downPct = rules.down?.percentThreshold || 0;
        const downDol = rules.down?.dollarThreshold || 0;
        const moversMinPrice = rules.minPrice || 0;
        const hiloMinPrice = rules.hiloMinPrice || 0;

        // Sectors/Industries (Synchronized with Store)
        const allIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat();
        const activeFilters = rules.activeFilters;
        const isAll = (activeFilters === null || activeFilters === undefined);
        const activeList = isAll ? allIndustries.map(i => i.toUpperCase()) : (Array.isArray(activeFilters) ? activeFilters : []);
        const blockedSectors = allIndustries.filter(s => !activeList.includes(s.toUpperCase()));

        container.innerHTML = `
            <div class="report-header">
                <div class="report-title">Market Intelligence Report</div>
                <button class="report-close-btn"><i class="fas fa-times"></i></button>
            </div>


            <!-- WATCHLIST STATUS EXPLAINER -->
            <!-- TARGET ALERTS PRIORITY (Clickable) -->
            <div class="report-section intel-nav-tile" id="watchlist-priority-btn" style="cursor: pointer; margin-bottom: 25px; padding: 12px; background: rgba(0,0,0,0.15); border-radius: 4px; opacity: 0.8;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="report-section-title" style="margin: 0; color: var(--color-accent); font-size: 0.7rem;">Target Alerts Override <span style="color: var(--color-positive); margin-left: 8px; font-weight: 800;">${totalAlertsCount}</span></div>
                    <div id="priority-toggle-action" style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px;">
                        <span style="font-size: 0.7rem; font-weight: bold; color: ${overrideOn ? 'var(--color-positive)' : 'var(--text-muted)'};">
                            ${overrideOn ? 'ACTIVE' : 'OFF'}
                        </span>
                        <i class="fas fa-chevron-right priority-chevron" style="font-size: 0.65rem; opacity: 0.5; transition: transform 0.2s;"></i>
                    </div>
                </div>
                <div class="priority-explainer" style="display: none; font-size: 0.7rem; line-height: 1.35; color: var(--text-muted); margin-top: 8px;">
                    Stocks in your watchlists are treated as priority. They jump the queue and bypass thresholds and sector muting to ensure you never miss a move on your own holdings.
                </div>
            </div>

            <div class="report-section">
                <div class="report-section-title">Thresholds & Noise Filters</div>
                
                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">Movers Price Floor</span>
                    <span class="report-rule-value">Under $${moversMinPrice.toFixed(2)}</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    Market filters gainers and losers. Mutes mover alerts for stocks valued under $${moversMinPrice.toFixed(2)}.
                </div>

                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">52-Week Price Floor</span>
                    <span class="report-rule-value">Under $${hiloMinPrice.toFixed(2)}</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    Market filters 52w high low. Mutes alerts for stocks valued under $${hiloMinPrice.toFixed(2)}.
                </div>

                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">Gainer Threshold</span>
                    <span class="report-rule-value status-count-green">+${upPct}% or +$${upDol.toFixed(2)}</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    Minimum daily gain required to trigger an alert.
                </div>
                
                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">Loser Threshold</span>
                    <span class="report-rule-value status-count-red">-${downPct}% or -$${downDol.toFixed(2)}</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    Minimum daily drop required to trigger an alert.
                </div>

                <!-- Hidden Sectors -->
                <div style="margin-top: 4px;">
                    <span class="report-rule-label" style="display: block; margin-bottom: 4px;">Hidden Sectors</span>
                    ${blockedSectors.length > 0 ? `
                        <div style="font-size: 0.75rem; line-height: 1.4; opacity: 0.8; padding: 0;">
                            ${blockedSectors.join(', ')}
                        </div>
                    ` : `
                        <div style="font-size: 0.85rem; font-weight: 700;">NONE</div>
                    `}
                    <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-top: 4px; font-style: italic;">
                        Mutes alerts for sectors you've chosen to ignore.
                    </div>
                </div>
            </div>



        <!--ALERT MECHANICS & TIMING-->
            <div class="report-section">
                <div class="report-section-title">Alert Mechanics & Timing</div>
                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">52-Week Price Records</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    You are notified when a stock touches a 12-month price record or gets within 1% of it.
                </div>

                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">App (The Live Feed)</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    Shows every price alert recorded today. If it happened, it stays on this list.
                </div>

                <div class="report-rule-item" style="border-bottom: none; padding-bottom: 0;">
                    <span class="report-rule-label">Email (The Final Verdict)</span>
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7; margin-bottom: 12px; font-style: italic;">
                    A summary of where stocks stood at the 4:15 PM market close.
                </div>
                
                <!-- SUBTLE SYSTEM HEALTH FOOTER -->
                <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-shield-alt" style="font-size: 0.8em; opacity: 0.7;"></i> SYSTEM INTEGRITY
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <!-- 1. The Bouncer -->
                        <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">The Bouncer</div>
                            <div style="font-size: 0.6rem; color: var(--color-positive); font-weight: bold;">ACTIVE</div>
                        </div>

                        <!-- 2. Anti-Spam -->
                        <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Anti-Spam</div>
                            <div style="font-size: 0.6rem; color: var(--color-positive); font-weight: bold;">ACTIVE</div>
                        </div>

                        <!-- 3. Auto-Purge -->
                        <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Auto-Purge</div>
                            <div style="font-size: 0.6rem; color: var(--color-positive); font-weight: bold;">ACTIVE</div>
                        </div>
                    </div>
                    
                    <div style="font-size: 0.6rem; color: var(--text-muted); opacity: 0.5; margin-top: 8px; font-style: italic; text-align: center;">
                        Continuous background verification, duplicate protection, and stale data removal are running.
                    </div>
                </div>
            </div>
            `;

        // Bind Close Event
        const closeBtn = container.querySelector('.report-close-btn');
        if (closeBtn) closeBtn.onclick = () => container.classList.remove('visible');

        // Bind Nav Events (Tiles + Priority)
        container.querySelectorAll('.intel-nav-tile').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                container.classList.remove('visible');
                const userId = AppState.user?.uid || AppState.userId;
                SettingsUI.showModal(userId);
            };
        });

        // Bind Dedicated Toggle for Priority Explainer
        const toggleBtn = container.querySelector('#priority-toggle-action');
        if (toggleBtn) {
            toggleBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent navigating to Settings
                const parent = container.querySelector('#watchlist-priority-btn');
                const explainer = parent.querySelector('.priority-explainer');
                const chevron = parent.querySelector('.priority-chevron');

                const isHidden = explainer.style.display === 'none';
                if (isHidden) {
                    explainer.style.display = 'block';
                    chevron.style.transform = 'rotate(90deg)'; // Point down
                } else {
                    explainer.style.display = 'none';
                    chevron.style.transform = 'rotate(0deg)'; // Point right
                }
            };
        }
    }
}
