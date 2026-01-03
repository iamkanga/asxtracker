/**
 * WatchlistUI.js
 * Handles the Watchlist Dropdown, Title updating, and Watchlist management UI interactions.
 */
import { AppState } from '../state/AppState.js';
// AppService removed for modularity
// AppService removed for modularity
import { IDS, CSS_CLASSES, EVENTS, WATCHLIST_ICON_POOL, ALL_SHARES_ID, CASH_WATCHLIST_ID, DASHBOARD_WATCHLIST_ID, PORTFOLIO_ID, UI_ICONS, USER_MESSAGES, STORAGE_KEYS, WATCHLIST_MODES, SORT_OPTIONS } from '../utils/AppConstants.js';
import { WatchlistPickerModal } from './WatchlistPickerModal.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

export class WatchlistUI {
    /**
     * @param {Object} userStore - UserStore instance
     * @param {Object} callbacks - { onWatchlistChange, onRenameWatchlist }
     */
    constructor(callbacks) {
        // this.userStore removed for modularity
        this.onWatchlistChange = callbacks.onWatchlistChange;
        this.onRenameWatchlist = callbacks.onRenameWatchlist;
        this.reorderMode = false; // Keep for legacy if needed, but we'll use watchlistMode
        this.watchlistMode = AppState.preferences.watchlistMode || WATCHLIST_MODES.DEFAULT;
    }

    injectModalHTML() {
        const modalHTML = new WatchlistPickerModal().getModalHTML();
        if (document.body) {
            // Prevent injecting the modal twice if main.js is executed multiple times
            if (!document.getElementById(IDS.WATCHLIST_PICKER_MODAL)) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = modalHTML;
                document.body.appendChild(tempDiv.firstElementChild);

                // Bind close listener immediately
                const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
                const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        this.closeModal();
                    });
                }

                // Allow clicking outside to close
                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target.classList.contains(CSS_CLASSES.MODAL_OVERLAY)) {
                        this.closeModal();
                    }
                });

                // Bind title click for mode selection toggle
                const title = document.getElementById(IDS.WATCHLIST_MODAL_TITLE);
                const modeContainer = document.getElementById(IDS.WATCHLIST_MODE_CONTAINER);

                if (title && modeContainer) {
                    // Inside Modal Title Click -> Reveal/Hide Options
                    title.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isHidden = modeContainer.classList.toggle(CSS_CLASSES.HIDDEN);

                        if (!isHidden) {
                            // REVEALING -> Apply preferred mode immediately (Immediate Response)
                            const preferredMode = AppState.preferences.watchlistMode || WATCHLIST_MODES.REARRANGE;
                            this.watchlistMode = (preferredMode === WATCHLIST_MODES.DEFAULT) ? WATCHLIST_MODES.REARRANGE : preferredMode;
                        } else {
                            // HIDING -> Reset to clean selection list
                            this.watchlistMode = WATCHLIST_MODES.DEFAULT;
                        }
                        this.renderWatchlistDropdown();
                    });

                    // Initial state: Start HIDDEN unless specific header area was tapped
                    if (this.watchlistMode === WATCHLIST_MODES.DEFAULT) {
                        modeContainer.classList.add(CSS_CLASSES.HIDDEN);
                    } else {
                        modeContainer.classList.remove(CSS_CLASSES.HIDDEN);
                    }
                }

                // Root Delegation for Mode Selection (Fixes Stale Context / First Click)
                modal.addEventListener('click', (e) => {
                    const btn = e.target.closest(`.${CSS_CLASSES.SEGMENTED_BUTTON}`);
                    if (btn && btn.dataset.mode) {
                        e.preventDefault();
                        e.stopPropagation();
                        this._handleModeChange(btn.dataset.mode);
                    }
                });
            }
        }
    }

    _handleModeChange(newMode) {
        // Toggle off if clicking the already active mode
        if (this.watchlistMode === newMode) {
            this.watchlistMode = WATCHLIST_MODES.DEFAULT;
        } else {
            this.watchlistMode = newMode;
        }

        // Persist Mode
        AppState.saveWatchlistMode(this.watchlistMode);

        // Update Button States (Robust Fix for Stale DOM)
        const buttons = [
            { id: IDS.MODE_REARRANGE, mode: WATCHLIST_MODES.REARRANGE },
            { id: IDS.MODE_HIDE, mode: WATCHLIST_MODES.HIDE },
            { id: IDS.MODE_CAROUSEL, mode: WATCHLIST_MODES.CAROUSEL }
        ];

        buttons.forEach(def => {
            const btn = document.getElementById(def.id);
            if (btn) {
                const isActive = (this.watchlistMode === def.mode);
                btn.className = `${CSS_CLASSES.SEGMENTED_BUTTON} ${isActive ? CSS_CLASSES.ACTIVE : ''}`;
            }
        });

        // Reset mode if needed, but selections are now in AppState

        this.renderWatchlistDropdown();
    }

    closeModal() {
        const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
        if (modal) {
            modal.classList.remove(CSS_CLASSES.SHOW);
            modal.classList.add(CSS_CLASSES.HIDDEN);

            // Remove from history stack if closed manually
            if (this._navActive) {
                this._navActive = false;
                navManager.popStateSilently();
            }
        }

        // Remove active state
        const selector = document.getElementById(IDS.WATCHLIST_SELECTOR);
        const dynamicTitle = document.getElementById(IDS.DYNAMIC_WATCHLIST_TITLE);
        if (selector) selector.classList.remove(CSS_CLASSES.ACTIVE);
        if (dynamicTitle) dynamicTitle.classList.remove(CSS_CLASSES.ACTIVE);

        // Reset Logic: Ensure next open is fresh
        this.watchlistMode = WATCHLIST_MODES.DEFAULT;
    }

    /**
     * Initializes the UI event listeners.
     */
    init() {
        this.injectModalHTML();
        this._bindTitleListener();
    }

    // STATIC HANDLER REFERENCE (Module Scoped)
    // This exists outside the class instance to survive re-instantiations.
    static _toggleHandler = null;

    _bindTitleListener() {
        // CONSTITUTIONAL FIX: Singleton Event Subscriber
        // We use a static reference to ensure we can remove the previous listener
        // even if the class instance is new.

        if (WatchlistUI._toggleHandler) {
            document.removeEventListener(EVENTS.TOGGLE_WATCHLIST_MODAL, WatchlistUI._toggleHandler);
            WatchlistUI._toggleHandler = null;
            // console.log('[WatchlistUI] Cleaned up orphaned listener.');
        }

        WatchlistUI._toggleHandler = () => {
            // console.log('[WatchlistUI] Received TOGGLE_WATCHLIST_MODAL event.');

            // 1. Check if already active (Hiding Logic)
            const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
            const isVisible = modal && modal.classList.contains(CSS_CLASSES.SHOW);

            if (isVisible) {
                // console.log('[WatchlistUI] Modal active -> Closing.');
                const ui = this; // Capture 'this' for the *current* instance
                ui.closeModal();
            } else {
                // console.log('[WatchlistUI] Modal hidden -> Opening.');
                this.watchlistMode = WATCHLIST_MODES.DEFAULT;
                this.renderWatchlistDropdown();
                this._openModal();
            }
        };

        document.addEventListener(EVENTS.TOGGLE_WATCHLIST_MODAL, WatchlistUI._toggleHandler);
        this._isTitleListenerBound = true;

        // console.log('WatchlistUI: TOGGLE_WATCHLIST_MODAL subscriber bound (Singleton).');
    }

    _openModal() {
        const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
        const titleEl = document.getElementById(IDS.DYNAMIC_WATCHLIST_TITLE);

        if (modal) {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            modal.classList.add(CSS_CLASSES.SHOW);
            if (titleEl) titleEl.classList.add(CSS_CLASSES.ACTIVE);

            // Register with NavigationManager
            this._navActive = true;
            navManager.pushState(() => {
                if (modal.classList.contains(CSS_CLASSES.SHOW)) {
                    this._navActive = false;
                    this.closeModal();
                }
            });

            // Sync container visibility with mode
            const modeContainer = document.getElementById(IDS.WATCHLIST_MODE_CONTAINER);
            if (modeContainer) {
                modeContainer.classList.toggle(CSS_CLASSES.HIDDEN, this.watchlistMode === WATCHLIST_MODES.DEFAULT);
            }
        }
    }

    // _bindTitleListener removed in favor of delegation

    setupWatchlistUI() {
        // This function will now focus on structural setup, but we'll adapt it to call init()
        this.init();

        // Inject "Rename Watchlist" button
        const headerLeft = document.querySelector(`.${CSS_CLASSES.MODAL_HEADER_LEFT}`); // Use standard class
        if (headerLeft && !document.getElementById(IDS.RENAME_WATCHLIST_BTN)) {
            const btn = document.createElement('button');
            btn.id = IDS.RENAME_WATCHLIST_BTN;
            btn.innerHTML = `<i class="fas ${UI_ICONS.PEN}"></i>`;
            btn.className = CSS_CLASSES.RENAME_BTN;
            btn.title = "Rename current watchlist";
            // Check if we should append functionality here is preserved from previous
            btn.addEventListener('click', async () => {
                const currentUser = AppState.user;
                if (!currentUser) return ToastManager.error(USER_MESSAGES.AUTH_REQUIRED_FIRST);

                // NEW LOGIC: Remove artificial restriction on system types
                // user restriction logic removed. 'cash' type warning removed.
                const currentWatchlistId = AppState.watchlist.id || PORTFOLIO_ID;

                // Determine Current Name (System vs Custom vs Database)
                let oldName = '';
                const customNames = AppState.preferences.customWatchlistNames || {};

                if (customNames[currentWatchlistId]) {
                    oldName = customNames[currentWatchlistId]; // User's custom alias
                } else if (currentWatchlistId === ALL_SHARES_ID) {
                    oldName = 'All Shares';
                } else if (currentWatchlistId === PORTFOLIO_ID) {
                    oldName = 'Portfolio';
                } else if (currentWatchlistId === CASH_WATCHLIST_ID) {
                    oldName = 'Cash & Assets';
                } else if (currentWatchlistId === DASHBOARD_WATCHLIST_ID) {
                    oldName = 'Dashboard';
                } else {
                    const currentList = (AppState.data.watchlists || []).find(w => w.id === currentWatchlistId);
                    oldName = currentList ? currentList.name : 'Watchlist';
                }

                const newName = prompt('Enter new name:', oldName);
                if (newName && newName !== oldName) {
                    if (this.onRenameWatchlist) {
                        try {
                            await this.onRenameWatchlist(currentWatchlistId, newName);
                            // Force refresh to update title
                            // Note: UI refresh usually handled by data/pref subscription callback,
                            // but manual trigger here ensures prompt response.
                            this.updateHeaderTitle();
                            this.renderWatchlistDropdown();
                        } catch (err) {
                            console.error("Rename failed via callback:", err);
                        }
                    }
                }
            });
            headerLeft.appendChild(btn);
        }
    }

    /**
     * Updates the header title based on current selection.
     */
    updateHeaderTitle() {
        const titleSpan = document.getElementById(IDS.CURRENT_WATCHLIST_NAME);
        if (!titleSpan) return;

        let baseTitle = 'Watchlist';

        // Check for Custom Name Override
        const currentId = AppState.watchlist.id || PORTFOLIO_ID;
        const customNames = AppState.preferences.customWatchlistNames || {};

        if (customNames[currentId]) {
            baseTitle = customNames[currentId];
        } else {
            // Fallback to Defaults
            if (AppState.watchlist.type === 'cash') {
                baseTitle = 'Cash & Assets';
            } else if (AppState.watchlist.id === DASHBOARD_WATCHLIST_ID) {
                baseTitle = 'Dashboard';
            } else {
                if (AppState.watchlist.id === ALL_SHARES_ID) {
                    baseTitle = 'All Shares';
                } else if (!AppState.watchlist.id || AppState.watchlist.id === PORTFOLIO_ID) {
                    baseTitle = 'Portfolio';
                } else {
                    const list = (AppState.data.watchlists || []).find(w => w.id === AppState.watchlist.id);
                    baseTitle = list ? list.name : 'Watchlist';
                }
            }
        }

        // Apply Global Sort Visuals if Active
        if (AppState.preferences.globalSort) {
            titleSpan.innerHTML = `<i class="fas ${UI_ICONS.GLOBE}"></i> ${baseTitle}`;
            titleSpan.classList.add(CSS_CLASSES.TEXT_COFFEE);
        } else {
            titleSpan.textContent = baseTitle;
            titleSpan.classList.remove(CSS_CLASSES.TEXT_COFFEE);
        }

        // Re-enforce binding after update
        this._bindTitleListener();

        // Check if System Watchlist (Enforce Ghosting)
        const ghostId = AppState.watchlist.id || PORTFOLIO_ID;
        const isSystem = (ghostId === ALL_SHARES_ID || ghostId === PORTFOLIO_ID || ghostId === CASH_WATCHLIST_ID || ghostId === DASHBOARD_WATCHLIST_ID);

        const renameBtn = document.getElementById(IDS.RENAME_WATCHLIST_BTN);
        if (renameBtn) {
            if (isSystem) {
                renameBtn.classList.add(CSS_CLASSES.GHOSTED);
                renameBtn.classList.add(CSS_CLASSES.DISABLED);
                renameBtn.disabled = true;
                renameBtn.style.opacity = '0.5';
                renameBtn.style.pointerEvents = 'none';
                renameBtn.title = 'Cannot rename System views';
            } else {
                renameBtn.classList.remove(CSS_CLASSES.GHOSTED);
                renameBtn.classList.remove(CSS_CLASSES.DISABLED);
                renameBtn.disabled = false;
                renameBtn.style.opacity = '';
                renameBtn.style.pointerEvents = '';
                renameBtn.title = `Rename ${baseTitle}`;
            }
        }
    }

    /**
     * Deterministically assigns an icon based on the ID string hash.
     * @param {string} id 
     * @returns {string} FontAwesome icon class
     */
    _pickIconForId(id) {
        try {
            const s = String(id || '');
            let h = 0;
            for (let i = 0; i < s.length; i++) {
                h = ((h << 5) - h) + s.charCodeAt(i);
                h |= 0;
            }
            return WATCHLIST_ICON_POOL[Math.abs(h) % WATCHLIST_ICON_POOL.length];
        } catch (_) {
            return UI_ICONS.LIST_ALT;
        }
    }

    /**
     * Populates the modal list instead of inline dropdown
     */
    renderWatchlistDropdown() {
        const listContainer = document.getElementById(IDS.WATCHLIST_PICKER_LIST);
        const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
        if (!listContainer || !modal) return;
        listContainer.innerHTML = '';

        // Update Modal Title based on Mode
        const titleEl = document.getElementById(IDS.WATCHLIST_MODAL_TITLE);
        if (titleEl) {
            titleEl.classList.remove(CSS_CLASSES.MODAL_REORDER_TITLE);
            switch (this.watchlistMode) {
                case WATCHLIST_MODES.REARRANGE:
                    titleEl.textContent = 'Reorder Watchlists';
                    titleEl.classList.add(CSS_CLASSES.MODAL_REORDER_TITLE);
                    break;
                case WATCHLIST_MODES.HIDE:
                    titleEl.textContent = 'Hide Watchlists';
                    titleEl.classList.add(CSS_CLASSES.MODAL_REORDER_TITLE);
                    break;
                case WATCHLIST_MODES.CAROUSEL:
                    titleEl.textContent = 'Carousel Selection';
                    titleEl.classList.add(CSS_CLASSES.MODAL_REORDER_TITLE);
                    break;
                default:
                    titleEl.textContent = 'Select Watchlist';
                    break;
            }
        }

        // Apply mode-specific classes
        listContainer.classList.toggle(CSS_CLASSES.REORDER_ACTIVE, this.watchlistMode === WATCHLIST_MODES.REARRANGE);

        // Define the list items
        let watchlistItems = [
            { id: ALL_SHARES_ID, name: 'All Shares', icon: UI_ICONS.GLOBE, isSystem: true },
            { id: PORTFOLIO_ID, name: 'Portfolio', icon: UI_ICONS.BRIEFCASE, isSystem: true },
            { id: DASHBOARD_WATCHLIST_ID, name: 'Dashboard', icon: 'fa-chart-pie', isSystem: true },
            { id: CASH_WATCHLIST_ID, name: 'Cash & Assets', icon: UI_ICONS.WALLET, isSystem: true },
        ];

        // Add custom watchlists
        const userWatchlists = AppState.data.watchlists || [];
        const userItems = userWatchlists.map(wl => ({
            id: wl.id,
            name: wl.name,
            icon: this._pickIconForId(wl.id),
            isSystem: false
        }));

        // APPLY CUSTOM NAMES from Preferences
        const customNames = AppState.preferences.customWatchlistNames || {};
        const fullListRaw = [...watchlistItems, ...userItems];

        const fullList = fullListRaw.map(item => {
            if (customNames[item.id]) {
                return { ...item, name: customNames[item.id] };
            }
            return item;
        });
        const savedOrder = AppState.preferences.watchlistOrder;

        if (savedOrder && Array.isArray(savedOrder)) {
            fullList.sort((a, b) => {
                const idxA = savedOrder.indexOf(a.id);
                const idxB = savedOrder.indexOf(b.id);
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        // Determine active ID for styling
        const activeId = AppState.watchlist.id || PORTFOLIO_ID;

        // Filter out hidden lists unless in HIDE mode
        // User Requirement: "The only way to see it. Is to unhide it. In these settings."
        let displayList = fullList;
        if (this.watchlistMode !== WATCHLIST_MODES.HIDE) {
            displayList = fullList.filter(wl => !AppState.hiddenWatchlists.has(String(wl.id)));
        }

        displayList.forEach((it, index) => {
            const div = document.createElement('div');
            const isActive = (it.id === activeId) || (activeId === null && it.id === PORTFOLIO_ID);

            div.className = `${CSS_CLASSES.WATCHLIST_ITEM} ${isActive ? CSS_CLASSES.ACTIVE : ''}`;
            if (isActive) div.classList.add(CSS_CLASSES.SELECTED);

            const checkIcon = (isActive && this.watchlistMode === WATCHLIST_MODES.DEFAULT) ? `<i class="fas ${UI_ICONS.CHECK} ${CSS_CLASSES.ML_AUTO}"></i>` : '';

            // Carousel Checkbox (Radio-style)
            let toggleControl = '';
            if (this.watchlistMode === WATCHLIST_MODES.CAROUSEL) {
                const isChecked = AppState.carouselSelections.has(String(it.id));
                if (isChecked) div.classList.add(CSS_CLASSES.CAROUSEL_SELECTED);
                toggleControl = `
                    <div class="${CSS_CLASSES.CAROUSEL_CHECKBOX} ${isChecked ? CSS_CLASSES.ACTIVE : ''} ${CSS_CLASSES.ML_AUTO}">
                        <div class="${CSS_CLASSES.RADIO_DOT}"></div>
                    </div>
                `;
            } else if (this.watchlistMode === WATCHLIST_MODES.HIDE) {
                const isHidden = AppState.hiddenWatchlists.has(String(it.id));
                if (isHidden) div.classList.add(CSS_CLASSES.HIDDEN_SELECTED);
                toggleControl = `
                    <div class="${CSS_CLASSES.HIDE_CHECKBOX} ${isHidden ? CSS_CLASSES.ACTIVE : ''} ${CSS_CLASSES.ML_AUTO}">
                        <div class="${CSS_CLASSES.RADIO_DOT}"></div>
                    </div>
                `;
            }

            // Reorder controls
            let reorderControls = '';
            if (this.watchlistMode === WATCHLIST_MODES.REARRANGE) {
                reorderControls = `
                    <div class="${CSS_CLASSES.MODAL_REORDER_CONTROLS}">
                        <button class="${CSS_CLASSES.MODAL_REORDER_BTN} ${index === 0 ? CSS_CLASSES.DISABLED : ''}" data-dir="up">
                            <i class="fas ${UI_ICONS.CARET_UP}"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_REORDER_BTN} ${index === displayList.length - 1 ? CSS_CLASSES.DISABLED : ''}" data-dir="down">
                            <i class="fas ${UI_ICONS.CARET_DOWN}"></i>
                        </button>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="${CSS_CLASSES.PICKER_ITEM_CONTENT}">
                    <i class="fas ${it.icon}"></i>
                    <span>${it.name}</span>
                </div>
                ${checkIcon}
                ${toggleControl}
                ${reorderControls}
            `;

            // Reorder event listeners
            div.querySelectorAll(`.${CSS_CLASSES.MODAL_REORDER_BTN}`).forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const dir = btn.dataset.dir;
                    this._handleWatchlistReorder(displayList, index, dir);
                };
            });

            div.addEventListener('click', (e) => {
                if (this.watchlistMode === WATCHLIST_MODES.REARRANGE) return;

                if (this.watchlistMode === WATCHLIST_MODES.CAROUSEL) {
                    const stringId = String(it.id);
                    // console.log('[WatchlistUI] Carousel Toggle:', stringId, 'Current:', [...AppState.carouselSelections]);
                    if (AppState.carouselSelections.has(stringId)) {
                        AppState.carouselSelections.delete(stringId);
                    } else {
                        AppState.carouselSelections.add(stringId);
                    }
                    // console.log('[WatchlistUI] New State:', [...AppState.carouselSelections]);
                    AppState.saveCarouselSelections();
                    setTimeout(() => this.renderWatchlistDropdown(), 50);
                    return;
                }

                if (this.watchlistMode === WATCHLIST_MODES.HIDE) {
                    const stringId = String(it.id);
                    // console.log('[WatchlistUI] Hide Toggle Clicked:', stringId, 'Target:', e.target.className);
                    // console.log('[WatchlistUI] Current hiddenWatchlists:', [...AppState.hiddenWatchlists]);
                    if (AppState.hiddenWatchlists.has(stringId)) {
                        AppState.hiddenWatchlists.delete(stringId);
                    } else {
                        AppState.hiddenWatchlists.add(stringId);
                    }
                    // console.log('[WatchlistUI] New State:', [...AppState.hiddenWatchlists]);
                    AppState.saveHiddenWatchlists();
                    setTimeout(() => this.renderWatchlistDropdown(), 50);
                    return;
                }

                this._handleSwitch(it.id);
                this.closeModal();
            });
            listContainer.appendChild(div);
        });
    }

    /**
     * Handles manual reordering of watchlists
     * Robust to filtered lists.
     */
    _handleWatchlistReorder(list, index, direction) {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= list.length) return;

        // Identify objects
        const itemA = list[index];
        const itemB = list[newIndex];

        // We need to swap them in the GLOBAL saved order list
        let orderList = [...(AppState.preferences.watchlistOrder || [])];

        // Robust Self-Healing: Ensure everything in the current view is in the sort list
        // This fixes the issue where new or untracked watchlists couldn't be reordered
        list.forEach(item => {
            if (!orderList.includes(item.id)) {
                orderList.push(item.id);
            }
        });

        const idxA = orderList.indexOf(itemA.id);
        const idxB = orderList.indexOf(itemB.id);

        if (idxA !== -1 && idxB !== -1) {
            // Swap in global list
            const temp = orderList[idxA];
            orderList[idxA] = orderList[idxB];
            orderList[idxB] = temp;
        }

        // Persist order
        AppState.preferences.watchlistOrder = orderList;
        localStorage.setItem(STORAGE_KEYS.WATCHLIST_ORDER, JSON.stringify(orderList));

        // Trigger sync if possible
        if (AppState.triggerSync) AppState.triggerSync();

        // Re-render
        this.renderWatchlistDropdown();
    }

    /**
     * Update _handleSwitch to handle the new constant IDs and correct logic
     */
    _handleSwitch(id) {
        // Correctly map portfolio back to null state identifier
        const canonicalId = id === PORTFOLIO_ID ? null : id;

        if (this.onWatchlistChange) {
            this.onWatchlistChange(canonicalId);
        }
    }
}
