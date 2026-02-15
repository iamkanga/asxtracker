/**
 * HeaderLayout.js
 * Manages header layout, sidebar toggling, and content padding.
 */
import { CSS_CLASSES } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { StateAuditor } from '../state/StateAuditor.js';

// Custom Event Names removed (Registry Rule)
import { EVENTS, UI_ICONS, IDS, WATCHLIST_NAMES, ALL_SHARES_ID, PORTFOLIO_ID, CASH_WATCHLIST_ID, DASHBOARD_WATCHLIST_ID, STORAGE_KEYS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { GeneralSettingsUI } from './GeneralSettingsUI.js';
import { SidebarCommandCenter } from './SidebarCommandCenter.js?v=1080';
import { VisualSettingsHUD } from './VisualSettingsHUD.js';

export class HeaderLayout {
    /**
     * @param {Object} callbacks
     * @param {Function} callbacks.onViewChange - Called when view mode changes (mode) => void
     */
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.sidebarOverlay = null;
        this.sidebarState = false;
        this._navActive = false; // Tracks if sidebar is in history stack
        this._isTitleListenerBound = false;
        this.container = document.getElementById(IDS.APP_HEADER); // Use ID constant
        this.commandCenter = new SidebarCommandCenter('#sidebar-command-center');
    }

    init() {
        if (!this.container) {
            console.error('HeaderLayout: Critical Error - #appHeader not found in DOM.');
            return;
        }
        this.render();
        this.cacheDOM();
        this.bindEvents();
        this._subscribeToStateEvents();

        // Initial Time Set
        this._updateRefreshTime();
        // Architectural Change: Removed JS-based padding adjustment.
        // We now rely on CSS sticky positioning for proper layout flow.
    }

    /**
     * REACTIVE SUBSCRIPTION: Listen for state events via StateAuditor channels.
     * This replaces the need for AppController to manually call update methods.
     */
    _subscribeToStateEvents() {
        // AUTO-UPDATE: Refresh timestamp when prices arrive
        StateAuditor.on('PRICES_UPDATED', (payload) => {
            this._updateRefreshTime();

            // Visual feedback: pulse the connection dot green
            const dot = document.getElementById('connection-dot');
            if (dot) {
                dot.classList.add('pulse-fresh');
                setTimeout(() => dot.classList.remove('pulse-fresh'), 2000);
            }
        });
    }

    /**
     * Updates the refresh time display in the header.
     */
    _updateRefreshTime() {
        const el = document.getElementById(IDS.LIVE_REFRESH_TIME);
        if (el) {
            el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
    }

    render() {
        this.container.innerHTML = `
        <div class="${CSS_CLASSES.HEADER_INNER}">
            <div class="${CSS_CLASSES.HEADER_TOP_ROW}">
                <div class="${CSS_CLASSES.HEADER_LEFT_CONTAINER}">
                    <button id="${IDS.HAMBURGER_BTN}" class="${CSS_CLASSES.HAMBURGER_BTN}" aria-label="Menu">
                        <i class="fas ${UI_ICONS.BARS}"></i>
                    </button>
                </div>

                <div class="watchlist-carousel-nav">
                    <button id="${IDS.CAROUSEL_PREV_BTN}" class="${CSS_CLASSES.CAROUSEL_NAV_BTN} prev" aria-label="Previous Watchlist">
                        <i class="fas ${UI_ICONS.CHEVRON_LEFT}"></i>
                    </button>

                    <h1 id="${IDS.DYNAMIC_WATCHLIST_TITLE}" class="${IDS.WATCHLIST_SELECTOR}">
                        <span id="${IDS.CURRENT_WATCHLIST_NAME}">Portfolio</span>
                    </h1>

                    <button id="${IDS.CAROUSEL_NEXT_BTN}" class="${CSS_CLASSES.CAROUSEL_NAV_BTN} next" aria-label="Next Watchlist">
                        <i class="fas ${UI_ICONS.CHEVRON_RIGHT}"></i>
                    </button>
                </div>

                <div class="${CSS_CLASSES.HEADER_ACTION_BTN_RIGHT}">
                     <!-- Bell Icon Removed (Moved to FAB) -->
                     
                     <!-- CLEAN RENDER: No timestamp, only toggle -->
                     <!-- Pre-calculate icon classes to support 'far' (Regular) icons correctly -->
                     <button id="${IDS.VIEW_TOGGLE_BTN}" class="${CSS_CLASSES.HEADER_ACTION_BTN}" aria-label="Cycle View">
                        <i class="${(UI_ICONS.VIEW_TABLE.includes('far ') ? '' : 'fas ')}${UI_ICONS.VIEW_TABLE}"></i>
                    </button>
                </div>
            </div>

            <div class="${CSS_CLASSES.HEADER_CONTROLS_ROW}">
                 <div class="${CSS_CLASSES.CONTROLS_LEFT}">
                    <div id="${IDS.ASX_TOGGLE}" class="${CSS_CLASSES.ASX_TOGGLE_TEXT}" role="button" aria-pressed="false">ASX Codes&nbsp;<i class="fas ${UI_ICONS.CARET_DOWN} ${CSS_CLASSES.TEXT_COFFEE}"></i></div>
                    <div id="${IDS.DASHBOARD_REORDER_TOGGLE}" class="${CSS_CLASSES.DASHBOARD_TIME_REF} hidden" role="button"></div>
                 </div>
                 <div class="${CSS_CLASSES.CONTROLS_RIGHT}">
                    <button id="${IDS.SORT_PICKER_BTN}" class="${CSS_CLASSES.HEADER_ACTION_BTN} ${CSS_CLASSES.APP_TITLE_COMPACT}" aria-label="Sort Shares">
                        <i class="fas ${UI_ICONS.SORT_AMOUNT_DOWN}"></i> Sort
                    </button>
                 </div>
                 <div style="grid-column: 3; justify-self: end; display: flex; align-items: flex-end;">
                    <div id="connection-status" class="hidden" title="Live Prices Active - Login to Save">
                        <div class="status-dot"></div>
                        <span>Read Only</span>
                    </div>
                    <button id="${IDS.LIVE_REFRESH_BTN}" class="live-refresh-btn" aria-label="Refresh Prices" title="Refresh Live Prices">
                        <span id="connection-dot" class="connection-dot connected"></span><span id="${IDS.LIVE_REFRESH_TIME}">--:--:--</span>
                    </button>
                 </div>
            </div>
            
            <div id="${IDS.ASX_CONTAINER}" class="${CSS_CLASSES.ASX_CODE_BUTTONS_CONTAINER}"></div>
        </div>
    `;
    }

    cacheDOM() {
        // Updated IDs
        this.menuToggle = document.getElementById(IDS.HAMBURGER_BTN);
        this.sidebar = document.getElementById(IDS.SIDEBAR);
        this.sidebarOverlay = document.getElementById(IDS.SIDEBAR_OVERLAY);
        this.closeSidebarBtn = document.getElementById(IDS.CLOSE_SIDEBAR);

        // Carousel Navigation
        this.carouselPrevBtn = document.getElementById(IDS.CAROUSEL_PREV_BTN);
        this.carouselNextBtn = document.getElementById(IDS.CAROUSEL_NEXT_BTN);

        this.asxToggle = document.getElementById(IDS.ASX_TOGGLE);
        this.asxContainer = document.getElementById(IDS.ASX_CONTAINER);

        this.mainContent = document.getElementById(IDS.MAIN_CONTENT);

        // Notifications & Settings
        // Notifications & Settings
        // this.btnNotifications = document.getElementById(IDS.BTN_NOTIFICATIONS); // Removed
        // this.notificationBadge = document.getElementById(IDS.NOTIFICATION_BADGE); // Removed for FAB logic (managed by NotificationUI)
        this.sidebarNotificationsBtn = document.getElementById(IDS.BTN_SIDEBAR_NOTIFICATIONS);
        this.btnSettings = document.getElementById(IDS.BTN_SETTINGS);
        this.btnGeneralSettings = document.getElementById(IDS.BTN_GENERAL_SETTINGS);

        // Create Watchlist Modal Elements
        this.createWatchlistBtn = document.getElementById(IDS.BTN_CREATE_WATCHLIST);
        this.createWatchlistModal = document.getElementById(IDS.MODAL_CREATE_WATCHLIST);
        this.createWatchlistInput = document.getElementById(IDS.CREATE_WL_INPUT);
        this.createWatchlistSubmit = document.getElementById(IDS.CREATE_WL_SUBMIT);

        // Edit Watchlist Modal Elements
        this.editWatchlistBtn = document.getElementById(IDS.BTN_EDIT_WATCHLIST);
        this.editWatchlistModal = document.getElementById(IDS.MODAL_EDIT_WATCHLIST);
        this.editWatchlistInput = document.getElementById(IDS.EDIT_WL_INPUT);
        this.editWatchlistSubmit = document.getElementById(IDS.EDIT_WL_SUBMIT);
        this.editWatchlistDelete = document.getElementById(IDS.EDIT_WL_DELETE);
        this.currentEditWatchlistId = null; // Track which watchlist is being edited

        // Initialize Command Center
        if (this.commandCenter) this.commandCenter.init();
    }


    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        // Sidebar
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => this._toggleSidebar(true));
        }
        if (this.closeSidebarBtn) {
            this.closeSidebarBtn.addEventListener('click', () => this._toggleSidebar(false));
        }
        if (this.sidebarOverlay) {
            // Primary: Direct overlay click handler
            this.sidebarOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleSidebar(false);
            });
        } else {
            console.error('[HeaderLayout] CRITICAL: Sidebar Overlay element NOT FOUND! ID sought:', IDS.SIDEBAR_OVERLAY);
        }

        // FALLBACK & FOCUS PREVENTION: 
        // Use 'mousedown' to prevent focus (border) and 'click' to strictly block actions.
        // We use a flag to ensure the click event is blocked even if the sidebar state changes during mousedown.
        const handleOutside = (e) => {
            if (this._ignoreClicks) {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                return;
            }

            if (!this.sidebarState) return;

            // Check if inside sidebar
            if (this.sidebar && this.sidebar.contains(e.target)) return;
            // Check if hamburger
            if (this.menuToggle && (this.menuToggle === e.target || this.menuToggle.contains(e.target))) return;

            // Outside interaction detected
            // STOP EVERYTHING
            e.stopPropagation();

            // Critical: preventDefault on touchstart stops the "highlight" / active state
            if (e.cancelable) e.preventDefault();

            // Close sidebar (only trigger once)
            this._toggleSidebar(false);

            // Set flag to block subsequent generated events
            this._ignoreClicks = true;
            setTimeout(() => this._ignoreClicks = false, 300);
        };

        // Options: capture=true is essential. passive=false is ESSENTIAL for touchstart preventDefault.
        document.addEventListener('touchstart', handleOutside, { capture: true, passive: false });
        document.addEventListener('mousedown', handleOutside, true);
        document.addEventListener('click', handleOutside, true);

        // ASX Toggle
        if (this.asxToggle && this.asxContainer) {
            this.asxToggle.addEventListener('click', () => {
                const isExpanded = this.asxContainer.classList.toggle(CSS_CLASSES.EXPANDED);
                this.asxToggle.setAttribute('aria-pressed', isExpanded);
            });
        }

        // Core Header Controls (Moved from main.js)
        const viewToggleBtn = document.getElementById(IDS.VIEW_TOGGLE_BTN);
        if (viewToggleBtn) {
            let pressTimer = null;
            let isLongPress = false;
            const LONG_PRESS_DURATION = 600;

            const startPress = (e) => {
                // Only left click or single touch
                if (e.type === 'mousedown' && e.button !== 0) return;

                isLongPress = false;
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) navigator.vibrate(50);
                    VisualSettingsHUD.toggle();
                }, LONG_PRESS_DURATION);
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            // Bind Press Events
            viewToggleBtn.addEventListener('mousedown', startPress);
            viewToggleBtn.addEventListener('mouseup', cancelPress);
            viewToggleBtn.addEventListener('mouseleave', cancelPress);
            viewToggleBtn.addEventListener('touchstart', startPress, { passive: true });
            viewToggleBtn.addEventListener('touchend', cancelPress);
            viewToggleBtn.addEventListener('touchmove', cancelPress);

            // Bind Click Action
            viewToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isLongPress) {
                    isLongPress = false;
                    return;
                }

                if (this.callbacks.onViewToggle) {
                    this.callbacks.onViewToggle();
                }
            });
        } else {
            console.warn('HeaderLayout: View Toggle Button Not Found', IDS.VIEW_TOGGLE_BTN);
        }

        // DURO-BIND: Delegated Carousel Navigation (Immune to innerHTML wipes)
        this.container.addEventListener('click', (e) => {
            const prevBtn = e.target.closest(`#${IDS.CAROUSEL_PREV_BTN}`);
            const nextBtn = e.target.closest(`#${IDS.CAROUSEL_NEXT_BTN}`);

            if (prevBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (this.callbacks.onCarouselPrev) this.callbacks.onCarouselPrev();
            } else if (nextBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (this.callbacks.onCarouselNext) this.callbacks.onCarouselNext();
            }
        });

        const sortBtn = document.getElementById(IDS.SORT_PICKER_BTN);
        if (sortBtn && this.callbacks.onSort) {
            sortBtn.addEventListener('click', (e) => {
                e.preventDefault();

                // Check if the chevron was the direct target to toggle instead of opening modal
                const chevron = e.target.closest(`#${IDS.SORT_PICKER_CHEVRON}`);
                if (chevron) {
                    e.stopPropagation();
                    document.dispatchEvent(new CustomEvent(EVENTS.TOGGLE_SORT_DIRECTION));
                    return;
                }

                this.callbacks.onSort();
            });
        }

        // Create Watchlist Modal Handlers
        this._bindCreateWatchlistModal();
        this._bindEditWatchlistModal();
        this._bindSidebarSearch();
        this._bindNotificationEvents();
        this._bindWatchlistTitle(); // Constitutional Bind
        this._bindDisplaySettings(); // Relocated from GeneralSettings
        this._bindMarketIntel(); // New Market Intel Dropdown
        this._bindCalculators(); // New Calculators Dropdown
    }

    _bindSidebarSearch() {
        const btn = document.getElementById(IDS.SIDEBAR_SEARCH_BTN);
        if (btn) {
            btn.addEventListener('click', () => {
                this._toggleSidebar(false); // Close sidebar pop history

                // Delay opening discovery modal to avoid history race
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_OPEN_DISCOVERY_MODAL));
                }, 150);
            });
        }
    }

    /**
     * CONSTITUTIONAL FIX: Decoupled Watchlist Toggling
     * Publisher Logic: Header simply announces "Toggle List Requested"
     */
    _bindWatchlistTitle() {
        const titleEl = document.getElementById(IDS.DYNAMIC_WATCHLIST_TITLE);
        if (!titleEl) {
            console.error('[HeaderLayout] Critical: Watchlist Title Element Not Found!');
            return;
        }

        let pressTimer = null;
        let isLongPress = false;
        const LONG_PRESS_DURATION = 600;

        // Start Press
        const startPress = (e) => {
            // Only left click or single touch
            if (e.type === 'mousedown' && e.button !== 0) return;

            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                // Visual feedback (optional) or haptic
                try {
                    if (navigator.vibrate) navigator.vibrate(50);
                } catch (err) { }

                document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_QUICK_NAV));
            }, LONG_PRESS_DURATION);
        };

        // Cancel Press (Move/End)
        const cancelPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        // Click Handler (Gated)
        const handleClick = (e) => {
            e.stopPropagation();
            e.preventDefault();

            if (isLongPress) {
                // If it was a long press, we ignore the click (it's essentially consumed)
                isLongPress = false;
                return;
            }

            // Normal Click -> Open Selector
            document.dispatchEvent(new CustomEvent(EVENTS.TOGGLE_WATCHLIST_MODAL));
        };

        // Mouse Events
        titleEl.addEventListener('mousedown', startPress);
        titleEl.addEventListener('mouseup', cancelPress);
        titleEl.addEventListener('mouseleave', cancelPress);

        // Touch Events (Passive false for preventDefault if needed, though we rely on click mostly)
        titleEl.addEventListener('touchstart', startPress, { passive: true });
        titleEl.addEventListener('touchend', cancelPress);
        titleEl.addEventListener('touchmove', cancelPress);

        // Main Action
        titleEl.addEventListener('click', handleClick);
    }

    /**
     * Binds event handlers for the Create Watchlist modal
     */
    _bindCreateWatchlistModal() {
        if (!this.createWatchlistModal) return;

        // Sidebar Button -> Open Modal (and close sidebar)
        if (this.createWatchlistBtn) {
            this.createWatchlistBtn.addEventListener('click', () => {
                this._toggleSidebar(false);

                // Delay opening modal to allow sidebar history pop to settle
                setTimeout(() => {
                    this._openCreateWatchlistModal();
                }, 150);
            });
        }

        // Input validation -> Enable/Disable Create button
        if (this.createWatchlistInput && this.createWatchlistSubmit) {
            this.createWatchlistInput.addEventListener('input', () => {
                const value = this.createWatchlistInput.value.trim();
                this.createWatchlistSubmit.disabled = !value;
            });
        }

        // Close button (X) -> Close modal
        const closeBtn = this.createWatchlistModal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this._closeCreateWatchlistModal();
            });
        }

        // Overlay click -> Close modal
        const overlay = this.createWatchlistModal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        if (overlay) {
            overlay.addEventListener('click', () => {
                this._closeCreateWatchlistModal();
            });
        }

        // Create button -> Dispatch event
        if (this.createWatchlistSubmit) {
            this.createWatchlistSubmit.addEventListener('click', () => {
                const name = this.createWatchlistInput.value.trim();
                if (name) {
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_NEW_WATCHLIST, {
                        detail: { name }
                    }));
                    this._closeCreateWatchlistModal();
                }
            });
        }
    }

    /**
     * Opens the Create Watchlist modal
     */
    _openCreateWatchlistModal() {
        if (!this.createWatchlistModal) return;
        this.createWatchlistModal.classList.remove(CSS_CLASSES.HIDDEN);
        this.createWatchlistModal.classList.add(CSS_CLASSES.SHOW);

        // Register with NavigationManager
        this._createModalNavActive = true;
        navManager.pushState(() => {
            this._createModalNavActive = false;
            this._closeCreateWatchlistModal();
        });

        // Reset input
        if (this.createWatchlistInput) {
            this.createWatchlistInput.value = '';
            this.createWatchlistInput.focus();
        }
        if (this.createWatchlistSubmit) {
            this.createWatchlistSubmit.disabled = true;
        }
    }

    /**
     * Closes the Create Watchlist modal
     */
    _closeCreateWatchlistModal() {
        if (!this.createWatchlistModal) return;
        this.createWatchlistModal.classList.add(CSS_CLASSES.HIDDEN);
        this.createWatchlistModal.classList.remove(CSS_CLASSES.SHOW);

        // Remove from history stack if closed manually
        if (this._createModalNavActive) {
            this._createModalNavActive = false;
            navManager.popStateSilently();
        }
    }

    /**
     * Binds event handlers for the Edit Watchlist modal
     */
    _bindEditWatchlistModal() {
        if (!this.editWatchlistModal) return;

        // Sidebar Button -> Open Modal (and close sidebar)
        if (this.editWatchlistBtn) {
            this.editWatchlistBtn.addEventListener('click', () => {
                this._toggleSidebar(false);

                // Delay opening modal to allow sidebar history pop to settle
                setTimeout(() => {
                    this._openEditWatchlistModal();
                }, 150);
            });
        }

        // Input validation -> Enable/Disable Save button
        if (this.editWatchlistInput && this.editWatchlistSubmit) {
            this.editWatchlistInput.addEventListener('input', () => {
                const value = this.editWatchlistInput.value.trim();
                this.editWatchlistSubmit.disabled = !value;
            });
        }

        // Close button (X) -> Close modal
        const closeBtn = this.editWatchlistModal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this._closeEditWatchlistModal();
            });
        }

        // Overlay click -> Close modal
        const overlay = this.editWatchlistModal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        if (overlay) {
            overlay.addEventListener('click', () => {
                this._closeEditWatchlistModal();
            });
        }

        // Save button -> Dispatch update event
        if (this.editWatchlistSubmit) {
            this.editWatchlistSubmit.addEventListener('click', () => {
                const newName = this.editWatchlistInput.value.trim();
                if (newName && this.currentEditWatchlistId) {
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_UPDATE_WATCHLIST, {
                        detail: { id: this.currentEditWatchlistId, newName }
                    }));
                    this._closeEditWatchlistModal();
                }
            });
        }

        // Delete button -> Dispatch delete event
        if (this.editWatchlistDelete) {
            this.editWatchlistDelete.addEventListener('click', () => {
                if (this.currentEditWatchlistId) {
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_WATCHLIST, {
                        detail: { id: this.currentEditWatchlistId }
                    }));
                    this._closeEditWatchlistModal();
                }
            });
        }
    }

    /**
     * Opens the Edit Watchlist modal with pre-filled data
     */
    _openEditWatchlistModal() {
        if (!this.editWatchlistModal) return;

        // Get current watchlist ID from AppState
        const currentId = AppState.watchlist?.id || PORTFOLIO_ID;

        // Resolve display name (respecting custom names)
        const customNames = AppState.preferences.customWatchlistNames || {};
        let currentName = customNames[currentId];

        if (!currentName) {
            if (currentId === ALL_SHARES_ID) currentName = WATCHLIST_NAMES.ALL_SHARES;
            else if (currentId === PORTFOLIO_ID || currentId === 'portfolio') currentName = WATCHLIST_NAMES.PORTFOLIO;
            else if (currentId === DASHBOARD_WATCHLIST_ID) currentName = WATCHLIST_NAMES.DASHBOARD;
            else if (currentId === CASH_WATCHLIST_ID) currentName = WATCHLIST_NAMES.CASH;
            else {
                const w = (AppState.data.watchlists || []).find(it => it.id === currentId);
                currentName = w ? w.name : 'Watchlist';
            }
        }

        // Handle system vs custom UI (Hide delete for system views)
        const systemIds = [ALL_SHARES_ID, PORTFOLIO_ID, 'portfolio', CASH_WATCHLIST_ID, DASHBOARD_WATCHLIST_ID];
        const isSystem = systemIds.includes(currentId);

        if (this.editWatchlistDelete) {
            this.editWatchlistDelete.style.display = isSystem ? 'none' : 'block';
        }

        // Store the current ID for save/delete operations
        this.currentEditWatchlistId = currentId;

        this.editWatchlistModal.classList.remove(CSS_CLASSES.HIDDEN);
        this.editWatchlistModal.classList.add(CSS_CLASSES.SHOW);

        // Register with NavigationManager
        this._editModalNavActive = true;
        navManager.pushState(() => {
            this._editModalNavActive = false;
            this._closeEditWatchlistModal();
        });

        // Pre-fill input with current name
        if (this.editWatchlistInput) {
            this.editWatchlistInput.value = currentName;
            this.editWatchlistInput.focus();
            this.editWatchlistInput.select();
        }
        if (this.editWatchlistSubmit) {
            this.editWatchlistSubmit.disabled = !currentName;
        }
    }

    /**
     * Closes the Edit Watchlist modal
     */
    _closeEditWatchlistModal() {
        if (!this.editWatchlistModal) return;
        this.editWatchlistModal.classList.add(CSS_CLASSES.HIDDEN);
        this.editWatchlistModal.classList.remove(CSS_CLASSES.SHOW);
        this.currentEditWatchlistId = null;

        // Remove from history stack if closed manually
        if (this._editModalNavActive) {
            this._editModalNavActive = false;
            navManager.popStateSilently();
        }
    }

    /**
     * Toggles sidebar visibility
     * @param {boolean|null} forceState 
     */
    _toggleSidebar(forceState = null) {
        if (!this.sidebar || !this.sidebarOverlay) return;

        if (forceState !== null) {
            this.sidebarState = forceState;
        } else {
            this.sidebarState = !this.sidebarState;
        }

        if (this.sidebarState) {
            this.sidebar.classList.remove(CSS_CLASSES.COLLAPSED);
            this.sidebarOverlay.classList.remove(CSS_CLASSES.HIDDEN); // Legacy cleanup
            this.sidebarOverlay.classList.add(CSS_CLASSES.ACTIVE); // Explicit State

            // Register with NavigationManager
            this._navActive = true;
            this._updateSidebarSettingsUI(); // Sync coloring state on open
            navManager.pushState(() => {
                if (this.sidebarState) {
                    this._navActive = false; // Prevent popStateSilently in next step
                    this._toggleSidebar(false);
                }
            });
        } else {
            this.sidebar.classList.add(CSS_CLASSES.COLLAPSED);
            this.sidebarOverlay.classList.add(CSS_CLASSES.HIDDEN); // Legacy cleanup
            this.sidebarOverlay.classList.remove(CSS_CLASSES.ACTIVE); // Explicit State

            // AUTO-COLLAPSE: Close all accordions when sidebar closes (USER REQUEST)
            this.sidebar.querySelectorAll('.sidebar-accordion-content').forEach(container => {
                container.classList.add(CSS_CLASSES.COLLAPSED);
                container.classList.remove(CSS_CLASSES.EXPANDED);
            });
            this.sidebar.querySelectorAll('.sidebar-accordion-btn').forEach(btn => {
                btn.setAttribute('aria-expanded', 'false');
            });

            // If we closed it manually, we need to pop from history
            if (this._navActive) {
                this._navActive = false;
                navManager.popStateSilently();
            }
        }

        // Always re-render Command Center on toggle to ensure fresh data/state
        if (this.sidebarState && this.commandCenter) {
            this.commandCenter.render();
        }
    }

    /**
     * Public method to close sidebar (e.g. after external actions)
     */
    closeSidebar() {
        this._toggleSidebar(false);
    }



    updateViewToggleIcon(mode) {
        const btn = document.getElementById(IDS.VIEW_TOGGLE_BTN);
        if (!btn) return;

        const effectiveMode = (mode || '').toLowerCase();
        const icons = {
            'table': UI_ICONS.VIEW_TABLE,
            'compact': UI_ICONS.VIEW_COMPACT,
            'snapshot': UI_ICONS.VIEW_SNAPSHOT
        };
        const iconClass = icons[effectiveMode] || UI_ICONS.VIEW_TABLE;
        // Support 'far' (Regular) icons by checking prefix, defaulting to 'fas' (Solid)
        const prefix = (iconClass.includes('far ') || iconClass.includes('fab ')) ? '' : 'fas ';
        btn.innerHTML = `<i class="${prefix}${iconClass}"></i>`;
    }

    _bindNotificationEvents() {
        // Bell Icon
        // Bell Icon (Removed from Header)
        /*
        if (this.btnNotifications) {
            this.btnNotifications.addEventListener('click', (e) => {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS));
            });
        }
        */

        // Sidebar Notification Entry
        if (this.sidebarNotificationsBtn) {
            this.sidebarNotificationsBtn.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS, {
                        detail: { source: 'total' }
                    }));
                }, 150);
            });
        }

        // Sidebar Settings (Trigger/Sector) Entry
        if (this.btnSettings) {
            this.btnSettings.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
                }, 150);
            });
        }

        // Sidebar General Settings (Security/Data) Entry
        if (this.btnGeneralSettings) {
            this.btnGeneralSettings.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_GENERAL_SETTINGS));
                }, 150);
            });
        }

        // Sidebar Briefing Entry (New)
        this.btnBriefing = document.getElementById('sidebar-briefing-btn');
        if (this.btnBriefing) {
            this.btnBriefing.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.SHOW_DAILY_BRIEFING));
                }, 150);
            });
        }

        // Sidebar Market Pulse Entry (New)
        this.btnMarketPulse = document.getElementById('sidebar-market-pulse-btn');
        if (this.btnMarketPulse) {
            this.btnMarketPulse.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    // Note: Dispatching a placeholder event or re-using SHOW_DAILY_BRIEFING if synonymous, 
                    // but assuming it maps to a specific view. For now, we'll dispatch a custom event.
                    document.dispatchEvent(new CustomEvent('open-market-pulse'));
                }, 150);
            });
        }

        // Sidebar Favorite Links Entry
        // Sidebar Favorite Links Entry
        this.btnFavoriteLinks = document.getElementById(IDS.BTN_FAVORITE_LINKS);
        if (this.btnFavoriteLinks) {
            this.btnFavoriteLinks.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_FAVORITE_LINKS));
                }, 150);
            });
        }
    }

    updateNotificationBadge(totalCount, customCount) {
        // Target the new Sidebar Badge explicitly
        const sidebarBadge = document.getElementById('sidebar-badge');

        if (sidebarBadge) {


            if (totalCount > 0) {
                sidebarBadge.innerText = `All ${totalCount > 99 ? '99+' : totalCount}`;
                sidebarBadge.classList.remove(CSS_CLASSES.HIDDEN);
                sidebarBadge.classList.remove(CSS_CLASSES.APP_BADGE_HIDDEN);
            } else {
                sidebarBadge.classList.add(CSS_CLASSES.HIDDEN);
            }
        }

        // Note: Floating Bell (Kangaroo) visibility is managed by NotificationUI.updateBadgeCount
        // which listens to the same NOTIFICATION_UPDATE event.
    }

    /**
     * Updates the connection status indicator and app health.
     * @param {boolean} isConnected - True if authenticated
     * @param {string} healthStatus - 'healthy', 'stale', or 'critical'
     */
    updateConnectionStatus(isConnected, healthStatus = 'healthy') {
        const dot = document.getElementById('connection-dot');
        if (dot) {
            // Remove all health classes first
            dot.classList.remove(CSS_CLASSES.CONNECTED, CSS_CLASSES.HEALTH_STALE, CSS_CLASSES.HEALTH_CRITICAL);

            if (isConnected) {
                dot.classList.add(CSS_CLASSES.CONNECTED);

                if (healthStatus === 'stale') {
                    dot.classList.add(CSS_CLASSES.HEALTH_STALE);
                    dot.title = 'Connected - Application is stale (refresh recommended for stability)';
                } else if (healthStatus === 'critical') {
                    dot.classList.add(CSS_CLASSES.HEALTH_CRITICAL);
                    dot.title = 'Connected - Sync issues detected. Refresh required to ensure data integrity.';
                } else {
                    dot.title = 'Connected - Logic is fresh';
                }
            } else {
                dot.title = 'Disconnected - Click to Reconnect';
            }
        }

        // Legacy fallback (maintain if element still exists elsewhere)
        const oldEl = document.getElementById('connection-status');
        if (oldEl) {
            if (isConnected) {
                oldEl.classList.remove(CSS_CLASSES.VISIBLE);
                oldEl.classList.remove(CSS_CLASSES.STATUS_DISCONNECTED);
            } else {
                oldEl.classList.add(CSS_CLASSES.VISIBLE);
                oldEl.classList.add(CSS_CLASSES.STATUS_DISCONNECTED);
                if (!oldEl._hasBind) {
                    oldEl._hasBind = true;
                    oldEl.addEventListener('click', () => {
                        document.dispatchEvent(new CustomEvent('auth-reconnect-needed'));
                    });
                }
            }
        }
    }

    /**
     * TOGGLE: Market Intel Sidebar Dropdown
     */
    _bindMarketIntel() {
        const toggleBtn = document.getElementById('btn-market-intel-toggle');
        const container = document.getElementById('market-intel-container');

        if (toggleBtn && container) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent Sidebar Close
                const isExpanded = container.classList.toggle('expanded');
                toggleBtn.setAttribute('aria-expanded', isExpanded);
                // Optional: Add chevron rotation if we add a chevron icon later
            });
        }
    }

    /**
     * Relocated Display Coloring Settings (Formerly in GeneralSettingsUI)
     */
    _bindDisplaySettings() {
        const toggleBtn = document.getElementById('btn-sidebar-coloring-toggle');
        const container = document.getElementById('sidebar-coloring-container');

        if (toggleBtn && container) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent Sidebar Close
                const isExpanded = container.classList.toggle(CSS_CLASSES.EXPANDED);
                toggleBtn.setAttribute('aria-expanded', isExpanded);
            });
        }

        // FIXED SELECTOR: Limit to #sidebar-coloring-container to avoid matching Market Intel list
        const listContainer = document.querySelector('#sidebar-coloring-container .sidebar-vertical-list');
        if (!listContainer) return;

        // 1. Border Settings Trigger
        const borderBtn = document.getElementById('sidebar-border-settings-btn');
        if (borderBtn) {
            borderBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Close sidebar first (USER REQUEST)
                this._toggleSidebar(false);

                // standard 150ms delay for history stabilization
                setTimeout(() => {
                    GeneralSettingsUI._renderBorderSelector();
                }, 150);
            });
        }

        // 2. Tone Intensity Handlers
        listContainer.querySelectorAll('.sidebar-list-item[data-value]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent Sidebar Close

                const val = parseFloat(item.dataset.value);
                const tint = item.dataset.tint || '0%';

                // Update UI state
                listContainer.querySelectorAll('.sidebar-list-item').forEach(p => p.classList.toggle('active', p === item));

                // Apply CSS Variables Immediately
                document.documentElement.style.setProperty('--gradient-strength', val);
                document.documentElement.style.setProperty('--gradient-tint', tint);

                // Persist to AppState & LocalStorage
                AppState.preferences.gradientStrength = val;
                localStorage.setItem(STORAGE_KEYS.GRADIENT_STRENGTH, val);

                // Trigger Sync
                if (AppState.triggerSync) AppState.triggerSync();
            });
        });

        // 3. Innovative Style Presets
        listContainer.querySelectorAll('.sidebar-preset-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const preset = item.dataset.preset;
                this._applyStylePreset(preset);

                // Update UI state
                listContainer.querySelectorAll('.sidebar-list-item').forEach(p => p.classList.toggle('active', p === item));

                ToastManager.success(`Style: ${preset.charAt(0).toUpperCase() + preset.slice(1)} applied.`);
                this._updateSidebarSettingsUI(); // Immediate UI Sync (Label & Ticks)
            });
        });
    }

    _applyStylePreset(preset) {
        let gradientStrength = 0.25;
        let borderPrefs = { sides: [0, 0, 0, 0], thickness: 1 };

        switch (preset) {
            case 'minimal':
                gradientStrength = 0.0;
                borderPrefs = { sides: [0, 0, 0, 1], thickness: 3 }; // Left border only, 3px
                break;
            case 'classic':
                gradientStrength = 0.25;
                borderPrefs = { sides: [0, 0, 0, 1], thickness: 3 }; // Left border only, 3px
                break;
            case 'rich':
                gradientStrength = 0.85;
                borderPrefs = { sides: [1, 1, 1, 1], thickness: 2 }; // All borders, slightly thicker
                break;
        }

        // Apply immediately
        document.documentElement.style.setProperty('--gradient-strength', gradientStrength);

        // Persist and Refresh
        AppState.preferences.gradientStrength = gradientStrength;
        localStorage.setItem(STORAGE_KEYS.GRADIENT_STRENGTH, gradientStrength);

        AppState.saveBorderPreferences(borderPrefs);

        // Notify app to re-render rows with new borders
        document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
    }

    /**
     * TOGGLE: Calculators Sidebar Dropdown
     */
    _bindCalculators() {
        const toggleBtn = document.getElementById('btn-calculators-toggle');
        const container = document.getElementById('calculators-container');

        if (toggleBtn && container) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent Sidebar Close
                const isExpanded = container.classList.toggle(CSS_CLASSES.EXPANDED);
                toggleBtn.setAttribute('aria-expanded', isExpanded);
            });
        }

        // Sub-item: Standard Calculator
        const simpleBtn = document.getElementById('sidebar-calc-simple-btn');
        if (simpleBtn) {
            simpleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeSidebar();
                if (this.callbacks.onOpenCalculator) {
                    setTimeout(() => this.callbacks.onOpenCalculator('simple'), 150);
                }
            });
        }

        // Sub-item: Dividend Calculator
        const dividendBtn = document.getElementById('sidebar-calc-dividend-btn');
        if (dividendBtn) {
            dividendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeSidebar();
                if (this.callbacks.onOpenCalculator) {
                    setTimeout(() => this.callbacks.onOpenCalculator('dividend'), 150);
                }
            });
        }
    }

    _updateSidebarSettingsUI() {
        const val = typeof AppState.preferences.gradientStrength === 'number' ? AppState.preferences.gradientStrength : 0.25;
        const borders = AppState.preferences.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };

        // FIXED SELECTOR: Limit to #sidebar-coloring-container
        const listContainer = document.querySelector('#sidebar-coloring-container .sidebar-vertical-list');
        if (!listContainer) return;

        // Determine if a preset is active
        let activePreset = null;
        const sidesSum = (borders.sides || []).reduce((a, b) => a + b, 0);

        if (Math.abs(val - 0.0) < 0.01 && sidesSum === 1 && borders.sides[3] === 1 && borders.thickness === 3) {
            activePreset = 'minimal';
        } else if (Math.abs(val - 0.25) < 0.01 && sidesSum === 1 && borders.sides[3] === 1 && borders.thickness === 3) {
            activePreset = 'classic';
        } else if (Math.abs(val - 0.85) < 0.01 && sidesSum === 4 && borders.thickness === 2) {
            activePreset = 'rich';
        }

        // Update Active Item
        listContainer.querySelectorAll('.sidebar-list-item').forEach(item => {
            if (item.dataset.value !== undefined) {
                const pVal = parseFloat(item.dataset.value);
                item.classList.toggle('active', Math.abs(pVal - val) < 0.01);
            } else if (item.dataset.preset !== undefined) {
                item.classList.toggle('active', item.dataset.preset === activePreset);
            }
        });

        // Update Button Label (Innovation)
        const labelEl = document.getElementById('active-visual-style-label');
        if (labelEl) {
            if (activePreset) {
                labelEl.textContent = activePreset.charAt(0).toUpperCase() + activePreset.slice(1);
                labelEl.style.color = 'var(--color-accent)';
            } else {
                labelEl.textContent = HeaderLayout._getStrengthLabel(val);
                labelEl.style.color = '';
            }
        }

        // Update 'Borders' Title Color (User Request)
        // Only coffee/accent colored if borders are actually selected
        const borderBtn = document.getElementById('sidebar-border-settings-btn');
        if (borderBtn) {
            const hasBorders = sidesSum > 0;
            // Assuming the button text or icon should be highlighted
            borderBtn.style.color = hasBorders ? 'var(--color-accent)' : '';
            borderBtn.style.fontWeight = hasBorders ? '700' : '';
        }
    }

    static _getStrengthLabel(val) {
        val = parseFloat(val);
        if (val === 0) return 'None';
        if (val <= 0.125) return 'Muted';
        if (val <= 0.25) return 'Subtle';
        if (val <= 0.4) return 'Light';
        if (val <= 0.6) return 'Medium';
        return 'Strong';
    }
}
