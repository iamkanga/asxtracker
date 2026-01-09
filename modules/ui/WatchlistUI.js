/**
 * WatchlistUI.js
 * Handles the Watchlist Dropdown, Title updating, and Watchlist management UI interactions.
 */
import { AppState } from '../state/AppState.js';
import { IDS, CSS_CLASSES, EVENTS, WATCHLIST_ICON_POOL, ALL_SHARES_ID, CASH_WATCHLIST_ID, DASHBOARD_WATCHLIST_ID, PORTFOLIO_ID, UI_ICONS, USER_MESSAGES, STORAGE_KEYS, WATCHLIST_MODES, SORT_OPTIONS, WATCHLIST_NAMES } from '../utils/AppConstants.js';
import { WatchlistPickerModal } from './WatchlistPickerModal.js';
import { ToastManager } from './ToastManager.js';
import { SnapshotUI } from './SnapshotUI.js';
import { navManager } from '../utils/NavigationManager.js';

export class WatchlistUI {
    /**
     * @param {Object} userStore - UserStore instance
     * @param {Object} callbacks - { onWatchlistChange, onRenameWatchlist }
     */
    constructor(callbacks) {
        this.onWatchlistChange = callbacks.onWatchlistChange;
        this.onRenameWatchlist = callbacks.onRenameWatchlist;
        this.isEditMode = false; // Unified Edit Mode
    }

    injectModalHTML() {
        const modalHTML = new WatchlistPickerModal().getModalHTML();
        if (document.body) {
            if (!document.getElementById(IDS.WATCHLIST_PICKER_MODAL)) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = modalHTML;
                document.body.appendChild(tempDiv.firstElementChild);

                const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);

                // Bind Close Buttons
                const closeBtns = modal.querySelectorAll(`.${CSS_CLASSES.MODAL_CLOSE_BTN}[data-dismiss="modal"]`);
                closeBtns.forEach(btn => btn.addEventListener('click', () => this.closeModal()));

                // Bind Market Pulse Button
                const marketPulseBtn = document.getElementById('marketPulseBtn');
                if (marketPulseBtn) {
                    marketPulseBtn.addEventListener('click', () => {
                        SnapshotUI.show();
                    });
                }

                // Allow clicking outside to close
                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target.classList.contains(CSS_CLASSES.MODAL_OVERLAY)) {
                        this.closeModal();
                    }
                });

                // Bind Title Click -> Toggle Edit Mode
                const title = document.getElementById(IDS.WATCHLIST_MODAL_TITLE);
                if (title) {
                    title.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.isEditMode = !this.isEditMode;

                        // Update Title Text & Style
                        if (this.isEditMode) {
                            title.firstChild.textContent = 'Hide / Carousel / Reorder ';
                            title.classList.add(CSS_CLASSES.TEXT_COFFEE);
                        } else {
                            title.firstChild.textContent = 'Select Watchlist ';
                            title.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                        }

                        this.renderWatchlistDropdown();
                    });
                }
            }
        }
    }

    closeModal() {
        const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
        if (modal) {
            modal.classList.remove(CSS_CLASSES.SHOW);
            modal.classList.add(CSS_CLASSES.HIDDEN);

            if (this._navActive) {
                this._navActive = false;
                navManager.popStateSilently();
            }
        }

        const selector = document.getElementById(IDS.WATCHLIST_SELECTOR);
        const dynamicTitle = document.getElementById(IDS.DYNAMIC_WATCHLIST_TITLE);
        if (selector) selector.classList.remove(CSS_CLASSES.ACTIVE);
        if (dynamicTitle) dynamicTitle.classList.remove(CSS_CLASSES.ACTIVE);

        // Reset Mode on Close
        this.isEditMode = false;

        const titleEl = document.getElementById(IDS.WATCHLIST_MODAL_TITLE);
        if (titleEl) {
            titleEl.firstChild.textContent = 'Select Watchlist ';
            titleEl.classList.remove(CSS_CLASSES.ACTIVE);
            titleEl.classList.remove(CSS_CLASSES.TEXT_COFFEE);
        }

        // Reset Chevron
        const chevron = modal ? modal.querySelector('.modal-title-chevron') : null;
        if (chevron) {
            chevron.style.transform = 'rotate(0deg)';
            chevron.style.opacity = '0.3'; // Reset opacity
        }
    }

    init() {
        this.injectModalHTML();
        this._bindTitleListener();
    }

    static _toggleHandler = null;

    _bindTitleListener() {
        if (WatchlistUI._toggleHandler) {
            document.removeEventListener(EVENTS.TOGGLE_WATCHLIST_MODAL, WatchlistUI._toggleHandler);
            WatchlistUI._toggleHandler = null;
        }

        WatchlistUI._toggleHandler = () => {
            const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
            const isVisible = modal && modal.classList.contains(CSS_CLASSES.SHOW);

            if (isVisible) {
                this.closeModal();
            } else {
                this.isEditMode = false; // Always start in default mode
                const title = document.getElementById(IDS.WATCHLIST_MODAL_TITLE);
                if (title) {
                    title.firstChild.textContent = 'Select Watchlist ';
                    title.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                }
                this.renderWatchlistDropdown();
                this._openModal();
            }
        };

        document.addEventListener(EVENTS.TOGGLE_WATCHLIST_MODAL, WatchlistUI._toggleHandler);
    }

    _openModal() {
        const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
        const titleEl = document.getElementById(IDS.DYNAMIC_WATCHLIST_TITLE);

        if (modal) {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            modal.classList.add(CSS_CLASSES.SHOW);
            if (titleEl) titleEl.classList.add(CSS_CLASSES.ACTIVE);

            this._navActive = true;
            navManager.pushState(() => {
                if (modal.classList.contains(CSS_CLASSES.SHOW)) {
                    this._navActive = false;
                    this.closeModal();
                }
            });

            // Initial Render
            this.renderWatchlistDropdown();
        }
    }

    setupWatchlistUI() {
        this.init();

        // "Rename Watchlist" Button Logic (Preserved)
        const headerLeft = document.querySelector(`.${CSS_CLASSES.MODAL_HEADER_LEFT}`);
        if (headerLeft && !document.getElementById(IDS.RENAME_WATCHLIST_BTN)) {
            const btn = document.createElement('button');
            btn.id = IDS.RENAME_WATCHLIST_BTN;
            btn.innerHTML = `<i class="fas ${UI_ICONS.PEN}"></i>`;
            btn.className = CSS_CLASSES.RENAME_BTN;
            btn.title = "Rename current watchlist";
            btn.addEventListener('click', async () => {
                const currentUser = AppState.user;
                if (!currentUser) return ToastManager.error(USER_MESSAGES.AUTH_REQUIRED_FIRST);

                const currentWatchlistId = AppState.watchlist.id || PORTFOLIO_ID;
                let oldName = '';
                const customNames = AppState.preferences.customWatchlistNames || {};

                if (customNames[currentWatchlistId]) {
                    oldName = customNames[currentWatchlistId];
                } else if (currentWatchlistId === ALL_SHARES_ID) {
                    oldName = WATCHLIST_NAMES.ALL_SHARES;
                } else if (currentWatchlistId === PORTFOLIO_ID) {
                    oldName = WATCHLIST_NAMES.PORTFOLIO;
                } else if (currentWatchlistId === CASH_WATCHLIST_ID) {
                    oldName = WATCHLIST_NAMES.CASH;
                } else if (currentWatchlistId === DASHBOARD_WATCHLIST_ID) {
                    oldName = WATCHLIST_NAMES.DASHBOARD;
                } else {
                    const currentList = (AppState.data.watchlists || []).find(w => w.id === currentWatchlistId);
                    oldName = currentList ? currentList.name : 'Watchlist';
                }

                const newName = prompt('Enter new name:', oldName);
                if (newName && newName !== oldName) {
                    if (this.onRenameWatchlist) {
                        try {
                            await this.onRenameWatchlist(currentWatchlistId, newName);
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

    updateHeaderTitle() {
        const titleSpan = document.getElementById(IDS.CURRENT_WATCHLIST_NAME);
        if (!titleSpan) return;

        let baseTitle = 'Watchlist';
        const currentId = AppState.watchlist.id || PORTFOLIO_ID;
        const customNames = AppState.preferences.customWatchlistNames || {};

        if (customNames[currentId]) {
            baseTitle = customNames[currentId];
        } else {
            if (AppState.watchlist.type === 'cash') {
                baseTitle = WATCHLIST_NAMES.CASH;
            } else if (AppState.watchlist.id === DASHBOARD_WATCHLIST_ID) {
                baseTitle = WATCHLIST_NAMES.DASHBOARD;
            } else {
                if (AppState.watchlist.id === ALL_SHARES_ID) {
                    baseTitle = WATCHLIST_NAMES.ALL_SHARES;
                } else if (!AppState.watchlist.id || AppState.watchlist.id === PORTFOLIO_ID) {
                    baseTitle = WATCHLIST_NAMES.PORTFOLIO;
                } else {
                    const list = (AppState.data.watchlists || []).find(w => w.id === AppState.watchlist.id);
                    baseTitle = list ? list.name : 'Watchlist';
                }
            }
        }

        if (AppState.preferences.globalSort) {
            titleSpan.innerHTML = `<i class="fas ${UI_ICONS.GLOBE}"></i> ${baseTitle}`;
            titleSpan.classList.add(CSS_CLASSES.TEXT_COFFEE);
        } else {
            titleSpan.textContent = baseTitle;
            titleSpan.classList.remove(CSS_CLASSES.TEXT_COFFEE);
        }

        this._bindTitleListener();

        // Ghosting Logic
        const ghostId = AppState.watchlist.id || PORTFOLIO_ID;
        const isSystem = (ghostId === ALL_SHARES_ID || ghostId === PORTFOLIO_ID || ghostId === CASH_WATCHLIST_ID || ghostId === DASHBOARD_WATCHLIST_ID);

        const renameBtn = document.getElementById(IDS.RENAME_WATCHLIST_BTN);
        if (renameBtn) {
            if (isSystem) {
                // Use simpler logic: pointer-events: none + opacity
                renameBtn.classList.add(CSS_CLASSES.GHOSTED);
                renameBtn.disabled = true;
            } else {
                renameBtn.classList.remove(CSS_CLASSES.GHOSTED);
                renameBtn.disabled = false;
            }
        }
    }

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

    renderWatchlistDropdown() {
        const listContainer = document.getElementById(IDS.WATCHLIST_PICKER_LIST);
        const modal = document.getElementById(IDS.WATCHLIST_PICKER_MODAL);
        if (!listContainer || !modal) return;
        listContainer.innerHTML = '';

        // 1. Handle Chevron & Headers
        const chevron = modal.querySelector('.modal-title-chevron');
        const headerRow = document.getElementById('watchlistEditHeaders');

        if (this.isEditMode) {
            if (chevron) {
                chevron.style.transform = 'rotate(180deg)';
                chevron.style.opacity = '1';
            }
            if (headerRow) headerRow.classList.remove(CSS_CLASSES.HIDDEN);
        } else {
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
                chevron.style.opacity = '0.3';
            }
            if (headerRow) headerRow.classList.add(CSS_CLASSES.HIDDEN);
        }

        // 2. Prepare List Data
        let watchlistItems = [
            { id: ALL_SHARES_ID, name: WATCHLIST_NAMES.ALL_SHARES, icon: UI_ICONS.GLOBE, isSystem: true },
            { id: PORTFOLIO_ID, name: WATCHLIST_NAMES.PORTFOLIO, icon: UI_ICONS.BRIEFCASE, isSystem: true },
            { id: DASHBOARD_WATCHLIST_ID, name: WATCHLIST_NAMES.DASHBOARD, icon: 'fa-chart-pie', isSystem: true },
            { id: CASH_WATCHLIST_ID, name: WATCHLIST_NAMES.CASH, icon: UI_ICONS.WALLET, isSystem: true },
        ];

        const userWatchlists = AppState.data.watchlists || [];
        const userItems = userWatchlists.map(wl => ({
            id: wl.id,
            name: wl.name,
            icon: this._pickIconForId(wl.id),
            isSystem: false
        }));

        const customNames = AppState.preferences.customWatchlistNames || {};
        const fullListRaw = [...watchlistItems, ...userItems];

        const fullList = fullListRaw.map(item => {
            if (customNames[item.id]) {
                return { ...item, name: customNames[item.id] };
            }
            return item;
        });

        // Apply Saved Sort Order
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

        const activeId = AppState.watchlist.id || PORTFOLIO_ID;

        // 3. Render Items
        // In Edit Mode -> Show ALL. In Default Mode -> Filter Hidden.
        let displayList = fullList;
        if (!this.isEditMode) {
            displayList = fullList.filter(wl => !AppState.hiddenWatchlists.has(String(wl.id)));
        }

        displayList.forEach((it, index) => {
            const div = document.createElement('div');
            const isActive = (it.id === activeId) || (activeId === null && it.id === PORTFOLIO_ID);
            const isHidden = AppState.hiddenWatchlists.has(String(it.id));

            // Base class
            div.className = CSS_CLASSES.WATCHLIST_ITEM;
            if (isActive && !this.isEditMode) div.classList.add(CSS_CLASSES.SELECTED);

            // Inner Content
            let innerHTML = '';

            if (this.isEditMode) {
                // --- COL 1: HIDE / TITLE ---
                // Visuals: If hidden -> Coffee Color, Strikethrough, Tick Icon
                const titleStyleClass = isHidden ? 'watchlist-item-hidden' : '';
                // Fix: Manually ensure color coffee for tick
                const hiddenTick = isHidden ? `<i class="fas fa-check" style="margin-left: 8px; font-size: 0.8em; color: var(--color-accent);"></i>` : '';

                innerHTML += `
                    <div class="watchlist-col-hide ${titleStyleClass}">
                        <i class="fas ${it.icon}" style="width: 20px; margin-right: 8px;"></i>
                        <span class="watchlist-name-span">${it.name}</span>
                        ${hiddenTick}
                    </div>
                `;

                // --- COL 2: CAROUSEL ---
                const isCarousel = AppState.carouselSelections.has(String(it.id));
                innerHTML += `
                    <div class="watchlist-col-carousel">
                        <div class="square-radio ${isCarousel ? 'checked' : ''}"></div>
                    </div>
                `;

                // --- COL 3: REORDER ---
                innerHTML += `
                    <div class="watchlist-col-reorder">
                        <span class="reorder-btn ${index === 0 ? 'disabled' : ''}" data-dir="up"><i class="fas fa-caret-up"></i></span>
                        <span class="reorder-btn ${index === displayList.length - 1 ? 'disabled' : ''}" data-dir="down"><i class="fas fa-caret-down"></i></span>
                    </div>
                `;

            } else {
                // --- DEFAULT VIEW ---
                innerHTML = `
                    <div style="flex: 1; display: flex; align-items: center;">
                        <i class="fas ${it.icon}" style="width: 25px;"></i>
                        <span>${it.name}</span>
                    </div>
                    ${isActive ? `<i class="fas ${UI_ICONS.CHECK}" style="color: var(--color-accent);"></i>` : ''}
                `;
            }

            div.innerHTML = innerHTML;

            // --- EVENT HANDLERS ---

            if (this.isEditMode) {
                // Column 1: Hide Toggle
                div.querySelector('.watchlist-col-hide').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const stringId = String(it.id);
                    if (AppState.hiddenWatchlists.has(stringId)) {
                        AppState.hiddenWatchlists.delete(stringId);
                    } else {
                        AppState.hiddenWatchlists.add(stringId);
                    }
                    AppState.saveHiddenWatchlists();
                    this.renderWatchlistDropdown(); // Re-render immediately
                });

                // Column 2: Carousel Toggle
                div.querySelector('.watchlist-col-carousel').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const stringId = String(it.id);
                    if (AppState.carouselSelections.has(stringId)) {
                        AppState.carouselSelections.delete(stringId);
                    } else {
                        AppState.carouselSelections.add(stringId);
                    }
                    AppState.saveCarouselSelections();
                    this.renderWatchlistDropdown();
                });

                // Column 3: Reorder
                div.querySelectorAll('.reorder-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (btn.classList.contains('disabled')) return;
                        this._handleWatchlistReorder(displayList, index, btn.dataset.dir);
                    });
                });

            } else {
                // Default Mode: Select Watchlist
                div.addEventListener('click', () => {
                    this._handleSwitch(it.id);
                    this.closeModal();
                });
            }

            listContainer.appendChild(div);
        });
    }

    _handleWatchlistReorder(list, index, direction) {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= list.length) return;

        const itemA = list[index];
        const itemB = list[newIndex];

        let orderList = [...(AppState.preferences.watchlistOrder || [])];

        // Populate orderList if missing items
        list.forEach(item => {
            if (!orderList.includes(item.id)) orderList.push(item.id);
        });

        const idxA = orderList.indexOf(itemA.id);
        const idxB = orderList.indexOf(itemB.id);

        if (idxA !== -1 && idxB !== -1) {
            [orderList[idxA], orderList[idxB]] = [orderList[idxB], orderList[idxA]];
        }

        AppState.preferences.watchlistOrder = orderList;
        localStorage.setItem(STORAGE_KEYS.WATCHLIST_ORDER, JSON.stringify(orderList));

        if (AppState.triggerSync) AppState.triggerSync();
        this.renderWatchlistDropdown();
    }

    _handleSwitch(id) {
        const canonicalId = id === PORTFOLIO_ID ? null : id;
        if (this.onWatchlistChange) {
            this.onWatchlistChange(canonicalId);
        }
    }
}
