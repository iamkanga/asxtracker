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
                const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
                if (closeBtn) {
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.closeModal();
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
            if (headerRow) {
                headerRow.classList.remove(CSS_CLASSES.HIDDEN);
                headerRow.classList.add('is-active');
            }
            modal.querySelector(`.${CSS_CLASSES.MODAL_CONTENT}`).classList.add('edit-mode');
        } else {
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
                chevron.style.opacity = '0.3';
            }
            if (headerRow) {
                headerRow.classList.add(CSS_CLASSES.HIDDEN);
                headerRow.classList.remove('is-active');
            }
            modal.querySelector(`.${CSS_CLASSES.MODAL_CONTENT}`).classList.remove('edit-mode');
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
            div.style.touchAction = 'none'; // CRITICAL for Windows Hybrid
            div.dataset.id = it.id; // CRITICAL for Reordering Persistence
            if (this.isEditMode) div.classList.add('edit-mode');
            if (isActive && !this.isEditMode) div.classList.add(CSS_CLASSES.SELECTED);

            // Inner Content
            let innerHTML = '';

            if (this.isEditMode) {
                // --- COL 1: HIDE + DELETE (Custom) ---
                // Visuals: If hidden -> Coffee Color, Strikethrough, Tick Icon
                const titleStyleClass = isHidden ? 'watchlist-item-hidden' : '';
                // Changed from HIDDEN_TICK_ICON (green) to text-coffee (explicit theme color)
                const hiddenTick = isHidden ? `<i class="fas fa-check text-coffee" style="margin-left: 8px;"></i>` : '';

                let actionIcon = '';
                // Only show trash can for non-system lists
                if (!it.isSystem) {
                    actionIcon = `<i class="fas ${UI_ICONS.TRASH} ${CSS_CLASSES.DELETE_WATCHLIST_BTN}" title="Delete Watchlist"></i>`;
                }

                innerHTML += `
                    <div class="watchlist-col-hide ${titleStyleClass}">
                        <i class="fas ${it.icon}" style="width: 20px; margin-right: 8px;"></i>
                        <span class="watchlist-name-span">${it.name}</span>
                        ${hiddenTick}
                        ${actionIcon}
                    </div>
                `;

                // --- COL 2: CAROUSEL ---
                const isCarousel = AppState.carouselSelections.has(String(it.id));
                innerHTML += `
                    <div class="watchlist-col-carousel">
                        <div class="square-radio ${isCarousel ? 'checked' : ''}"></div>
                    </div>
                `;

                // --- COL 3: REORDER (DRAG HANDLE) ---
                innerHTML += `
                    <div class="watchlist-col-reorder reorder-handle" title="Drag to reorder">
                        <i class="fas fa-grip-lines"></i>
                    </div>
                `;

            } else {
                // --- DEFAULT VIEW ---
                innerHTML = `
                    <div class="watchlist-col-hide">
                        <i class="fas ${it.icon}" style="width: 20px; margin-right: 8px;"></i>
                        <span class="watchlist-name-span">${it.name}</span>
                    </div>
                    <div class="watchlist-col-carousel"></div>
                    <div class="watchlist-col-reorder">
                        ${isActive ? `<i class="fas ${UI_ICONS.CHECK}" style="color: var(--color-accent); font-size: 0.8em;"></i>` : ''}
                    </div>
                `;
            }

            div.innerHTML = innerHTML;
            if (this.isEditMode) {
                div.draggable = true;
                div.setAttribute('draggable', 'true');
                div.dataset.draggable = "true";
                div.dataset.id = it.id;
                div.dataset.index = index;
            } else {
                div.setAttribute('draggable', 'false');
                div.dataset.draggable = "false";
            }

            // --- EVENT HANDLERS ---

            // Event Listeners removed - using Delegation at Container Level
            listContainer.appendChild(div);
        });

        if (this.isEditMode) {
            // NUCLEAR OPTION: Clone container to strip ALL old listeners (including delegations) and re-bind.
            const newContainer = listContainer.cloneNode(true);
            listContainer.parentNode.replaceChild(newContainer, listContainer);

            // Bind Events (Drag + Click Delegation)
            this._bindDragEvents(newContainer);
            this._bindDelegatedEvents(newContainer);
        } else {
            // In Default Mode, we also want to clean up but maybe not strictly necessary?
            // Let's keep it simple. Standard logic.
            // Wait, if we switch modes, we might have old listeners?
            // Safest is to Nuclear Reset here too, OR just rebind click delegation.
            // We'll trust the render loop replaces content, but listeners on container persist?
            // Let's do Nuclear Reset ALWAYS to be safe.

            const newContainer = listContainer.cloneNode(true);
            listContainer.parentNode.replaceChild(newContainer, listContainer);
            this._bindDelegatedEvents(newContainer);
        }

    }

    _bindDelegatedEvents(container) {
        container.addEventListener('click', (e) => {
            console.log('[WatchlistUI] Click Detected on:', e.target);
            const row = e.target.closest(`.${CSS_CLASSES.WATCHLIST_ITEM}`);
            if (!row) {
                console.log('[WatchlistUI] Click Ignored: No Row');
                return;
            }
            console.log('[WatchlistUI] Row ID:', row.dataset.id);

            // HANDLE EDIT MODE
            if (this.isEditMode) {
                // DELETE BUTTON
                if (e.target.closest(`.${CSS_CLASSES.DELETE_WATCHLIST_BTN}`)) {
                    e.stopPropagation();
                    const id = row.dataset.id;
                    console.log('Requesting Delete Watchlist:', id);
                    const event = new CustomEvent(EVENTS.REQUEST_DELETE_WATCHLIST, {
                        detail: { id: id }
                    });
                    document.dispatchEvent(event);
                    return;
                }

                // HIDE TOGGLE (Col 1)
                if (e.target.closest('.watchlist-col-hide')) {
                    console.log('[WatchlistUI] Hide Toggle Clicked');
                    e.stopPropagation();
                    const stringId = String(row.dataset.id);
                    if (AppState.hiddenWatchlists.has(stringId)) {
                        AppState.hiddenWatchlists.delete(stringId);
                    } else {
                        AppState.hiddenWatchlists.add(stringId);
                    }
                    AppState.saveHiddenWatchlists();
                    this.renderWatchlistDropdown();
                    return;
                }

                // CAROUSEL TOGGLE (Col 2)
                if (e.target.closest('.watchlist-col-carousel')) {
                    e.stopPropagation();
                    const stringId = String(row.dataset.id);
                    if (AppState.carouselSelections.has(stringId)) {
                        AppState.carouselSelections.delete(stringId);
                    } else {
                        AppState.carouselSelections.add(stringId);
                    }
                    AppState.saveCarouselSelections();
                    this.renderWatchlistDropdown();
                    return;
                }
            }
            // HANDLE DEFAULT MODE
            else {
                this._handleSwitch(row.dataset.id);
                this.closeModal();
            }
        });
    }

    _bindDragEvents(container) {
        this._draggedWatchlistItem = null;

        container.addEventListener('dragstart', (e) => {
            const row = e.target.closest(`.${CSS_CLASSES.WATCHLIST_ITEM}`);
            if (row) {
                this._draggedWatchlistItem = row;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(row.dataset.id));

                // Visual feedback
                setTimeout(() => row.classList.add(CSS_CLASSES.DRAGGING), 0);
            }
        });

        container.addEventListener('dragend', (e) => {
            const row = e.target.closest(`.${CSS_CLASSES.WATCHLIST_ITEM}`);
            if (row) {
                row.classList.remove(CSS_CLASSES.DRAGGING);
                this._draggedWatchlistItem = null;
                console.log('[WatchlistUI] Drag End - Saving Order');
                this._saveWatchlistOrder(container); // Pass container explicitly
            }
        });

        container.addEventListener('dragover', (e) => {
            if (!this._draggedWatchlistItem) return;
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }

            const afterElement = this._getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
            } else {
                container.insertBefore(this._draggedWatchlistItem, afterElement);
            }
        });
    }

    // _bindPointerDragEvents REMOVED - Reverting to Standard Native Drag


    _getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll(`.${CSS_CLASSES.WATCHLIST_ITEM}:not(.${CSS_CLASSES.DRAGGING})`)];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    _saveWatchlistOrder(optionalContainer) {
        if (!this.isEditMode) return;

        // Use passed container if available, otherwise fetch
        const listContainer = optionalContainer || document.getElementById(IDS.WATCHLIST_PICKER_LIST);
        if (!listContainer) {
            console.error('[WatchlistUI] Save Failed: Container not found');
            return;
        }

        const rows = Array.from(listContainer.querySelectorAll(`.${CSS_CLASSES.WATCHLIST_ITEM}`));
        const newOrder = rows.map(r => r.dataset.id).filter(id => id !== undefined);

        if (newOrder.length === 0) return;

        AppState.preferences.watchlistOrder = newOrder;

        // Trigger outbound sync via AppController's bound callback
        if (AppState.onPersistenceUpdate) {
            AppState.onPersistenceUpdate({ watchlistOrder: newOrder });
        }

        // Re-render to ensure state consistency (icon/names etc)
        this.renderWatchlistDropdown();
    }


    _handleSwitch(id) {
        const canonicalId = id === PORTFOLIO_ID ? null : id;
        if (this.onWatchlistChange) {
            this.onWatchlistChange(canonicalId);
        }
    }
}
