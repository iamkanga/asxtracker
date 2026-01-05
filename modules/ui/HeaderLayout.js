/**
 * HeaderLayout.js
 * Manages header layout, sidebar toggling, and content padding.
 */
import { CSS_CLASSES } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';

// Custom Event Names removed (Registry Rule)
import { EVENTS, UI_ICONS, IDS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';

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
        // console.log('HeaderLayout: Instantiated. Container found:', !!this.container);
    }

    init() {
        if (!this.container) {
            console.error('HeaderLayout: Critical Error - #appHeader not found in DOM.');
            return;
        }
        // console.log('HeaderLayout: Initializing...');
        this.render();
        this.cacheDOM();
        this.bindEvents();
        // console.log('HeaderLayout: Render Complete.');

        // Architectural Change: Removed JS-based padding adjustment.
        // We now rely on CSS sticky positioning for proper layout flow.
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
                    <button id="${IDS.LIVE_REFRESH_BTN}" class="live-refresh-btn" aria-label="Refresh Prices" title="Refresh Live Prices">
                        <i class="fas ${UI_ICONS.SYNC} ${CSS_CLASSES.MR_2PX}"></i><span id="${IDS.LIVE_REFRESH_TIME}">--:--:--</span>
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
                // console.log('[HeaderLayout] Overlay clicked directly');
                e.stopPropagation();
                this._toggleSidebar(false);
            });
            // console.log('[HeaderLayout] Overlay click handler bound successfully');
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
            // console.log(`[HeaderLayout] Outside ${e.type} detected. Closing & Blocking.`);

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
            if (this.callbacks.onViewToggle) {
                viewToggleBtn.addEventListener('click', () => {
                    // console.log('HeaderLayout: View Toggle Clicked');
                    this.callbacks.onViewToggle();
                });
                // console.log('HeaderLayout: View Toggle Button Bound Successfully');
            } else {
                console.warn('HeaderLayout: onViewToggle callback missing');
            }
        } else {
            console.warn('HeaderLayout: View Toggle Button Not Found', IDS.VIEW_TOGGLE_BTN);
        }

        // DURO-BIND: Delegated Carousel Navigation (Immune to innerHTML wipes)
        this.container.addEventListener('click', (e) => {
            const prevBtn = e.target.closest(`#${IDS.CAROUSEL_PREV_BTN}`);
            const nextBtn = e.target.closest(`#${IDS.CAROUSEL_NEXT_BTN}`);

            if (prevBtn) {
                // console.log('[HeaderLayout] DELEGATED: Carousel Prev Clicked');
                e.preventDefault();
                e.stopPropagation();
                if (this.callbacks.onCarouselPrev) this.callbacks.onCarouselPrev();
            } else if (nextBtn) {
                // console.log('[HeaderLayout] DELEGATED: Carousel Next Clicked');
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
                    // console.log('[HeaderLayout] Sort Chevron Clicked -> Dispatching TOGGLE_SORT_DIRECTION');
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
        // Use ID constant for robustness
        const titleEl = document.getElementById(IDS.DYNAMIC_WATCHLIST_TITLE);

        if (titleEl) {
            // Remove old listeners (clone node trick optional, but standard addEventListener checks dupes)
            // We use a named handler to "prevent" dupes if init called twice, but here anon is fine if single init.

            titleEl.addEventListener('click', (e) => {
                // STOP bubbling to prevent document.body from closing it instantly if it thinks it's an outside click
                e.stopPropagation();
                e.preventDefault();

                // console.log('[HeaderLayout] Watchlist Title Clicked -> Dispatching TOGGLE_WATCHLIST_MODAL');
                document.dispatchEvent(new CustomEvent(EVENTS.TOGGLE_WATCHLIST_MODAL));
            });
            // console.log('[HeaderLayout] Watchlist Title Publisher Bound.');
        } else {
            console.error('[HeaderLayout] Critical: Watchlist Title Element Not Found!');
        }
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
                    // console.log('HeaderLayout: Dispatching REQUEST_NEW_WATCHLIST with name:', name);
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
                    // console.log('HeaderLayout: Dispatching REQUEST_UPDATE_WATCHLIST:', {
                    //     id: this.currentEditWatchlistId,
                    //     newName
                    // });
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
                    // console.log('HeaderLayout: Dispatching REQUEST_DELETE_WATCHLIST:', {
                    //     id: this.currentEditWatchlistId
                    // });
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
        const currentId = AppState.watchlist?.id;
        const currentName = AppState.watchlist?.name || '';

        // Prevent editing system views
        if (!currentId || currentId === 'portfolio' || currentId === 'ALL' || currentId === 'CASH') {
            ToastManager.error('Cannot edit system views. Please select a custom watchlist first.');
            return;
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

            // If we closed it manually, we need to pop from history
            if (this._navActive) {
                this._navActive = false;
                navManager.popStateSilently();
            }
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

        const icons = {
            'table': UI_ICONS.VIEW_TABLE,
            'compact': UI_ICONS.VIEW_COMPACT,
            'snapshot': UI_ICONS.VIEW_SNAPSHOT
        };
        const iconClass = icons[mode] || UI_ICONS.VIEW_TABLE;
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
                console.log('HeaderLayout: Dispatching OPEN_NOTIFICATIONS');
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS));
            });
        }
        */

        // Sidebar Notification Entry
        if (this.sidebarNotificationsBtn) {
            this.sidebarNotificationsBtn.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    // console.log('HeaderLayout: Dispatching OPEN_NOTIFICATIONS (Sidebar)');
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
                    // console.log('HeaderLayout: Dispatching OPEN_SETTINGS');
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
                }, 150);
            });
        }

        // Sidebar General Settings (Security/Data) Entry
        if (this.btnGeneralSettings) {
            this.btnGeneralSettings.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    // console.log('HeaderLayout: Dispatching OPEN_GENERAL_SETTINGS');
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
                    // console.log('HeaderLayout: Dispatching SHOW_DAILY_BRIEFING');
                    document.dispatchEvent(new CustomEvent(EVENTS.SHOW_DAILY_BRIEFING));
                }, 150);
            });
        }

        // Sidebar Favorite Links Entry
        this.btnFavoriteLinks = document.getElementById(IDS.BTN_FAVORITE_LINKS);
        if (this.btnFavoriteLinks) {
            this.btnFavoriteLinks.addEventListener('click', () => {
                this._toggleSidebar(false);
                setTimeout(() => {
                    // console.log('HeaderLayout: Dispatching OPEN_FAVORITE_LINKS');
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_FAVORITE_LINKS));
                }, 150);
            });
        }
    }

    updateNotificationBadge(totalCount, customCount) {
        // console.log(`[HeaderLayout] updateNotificationBadge called. Total: ${totalCount}, Custom: ${customCount}`);
        // Target the new Sidebar Badge explicitly
        const sidebarBadge = document.getElementById('sidebar-badge');

        if (sidebarBadge) {
            // Respect User Preference for Badges
            const showBadges = AppState.preferences?.showBadges !== false;

            if (totalCount > 0 && showBadges) {
                sidebarBadge.innerText = totalCount > 99 ? '99+' : totalCount;
                sidebarBadge.classList.remove(CSS_CLASSES.HIDDEN);
                sidebarBadge.classList.remove('app-badge-hidden');
            } else {
                sidebarBadge.classList.add(CSS_CLASSES.HIDDEN);
            }
        }

        // Note: Floating Bell (Kangaroo) visibility is managed by NotificationUI.updateBadgeCount
        // which listens to the same NOTIFICATION_UPDATE event.
    }
}
