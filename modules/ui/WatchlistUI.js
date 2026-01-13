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

                // Bind Sort Toggle
                const toggleBtn = document.getElementById(IDS.WATCHLIST_SORT_TOGGLE_BTN);
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const currentSort = AppState.preferences.watchlistSort || 'asc';
                        const newSort = currentSort === 'asc' ? 'desc' : 'asc';
                        AppState.saveWatchlistSort(newSort);
                        this.renderWatchlistDropdown();
                        this.updateToggleUI();
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

        // Initialize Toggle UI if visible
        this.updateToggleUI();
    }

    updateToggleUI() {
        const toggleBtn = document.getElementById(IDS.WATCHLIST_SORT_TOGGLE_BTN);
        if (!toggleBtn) return;

        const isDesc = AppState.preferences.watchlistSort === 'desc';
        const text = isDesc ? 'Z to A' : 'A to Z';
        const iconClass = isDesc ? 'fa-chevron-down' : 'fa-chevron-up';
        const colorClass = isDesc ? CSS_CLASSES.TEXT_NEGATIVE : CSS_CLASSES.TEXT_POSITIVE;

        toggleBtn.innerHTML = `
            <div class="${CSS_CLASSES.W_FULL} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER}" style="justify-content: center;">
                <i class="fas ${iconClass} ${colorClass}" style="margin-right: 15px;"></i>
                <span class="${CSS_CLASSES.FONT_BOLD}">${text}</span>
                <i class="fas ${iconClass} ${colorClass}" style="margin-left: 15px;"></i>
            </div>
        `;
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

    updateHeaderTitle(metrics = null) {
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

        // DYNAMIC HEADER GRADIENT
        // Logic: Dominant sentiment color starts on the Left.
        // Found in index.html: <header id="appHeader" class="app-header">
        const header = document.getElementById('appHeader');
        if (header) {
            if (AppState.watchlist.type === 'cash') {
                header.style.background = ''; // Reset for cash
            } else {
                // 1. Identify Target Shares (or Codes) based on View
                // critical: For Custom Watchlists, we must use the codes list directly, 
                // as AppState.data.shares might only contain Portfolio items.
                let targetItems = [];
                const allShares = AppState.data.shares || [];

                if (currentId === PORTFOLIO_ID || currentId === 'PORTFOLIO') {
                    // Portfolio: Use full share objects where owned > 0
                    targetItems = allShares.filter(s => (parseFloat(s.owned) || 0) > 0);
                } else if (currentId === ALL_SHARES_ID) {
                    // All Shares: Use all available share objects
                    targetItems = allShares;
                } else if (currentId === DASHBOARD_WATCHLIST_ID) {
                    targetItems = (AppState.data.dashboard || []).map(d => (typeof d === 'string' ? { code: d } : d));
                } else {
                    // Custom Watchlist
                    const wList = (AppState.data.watchlists || []).find(w => w.id === currentId);
                    if (wList && wList.stocks) {
                        // Map directly to objects with 'code' property for consistent processing
                        targetItems = wList.stocks.map(c => ({ code: (c || '').toUpperCase() }));
                    }
                }

                // 2. Count Sentiment
                let gainerCount = 0;
                let loserCount = 0;

                if (metrics && typeof metrics.gainerCount === 'number' && typeof metrics.loserCount === 'number') {
                    // Use pre-calculated metrics from AppController/processShares if available
                    gainerCount = metrics.gainerCount;
                    loserCount = metrics.loserCount;
                } else {
                    // Fallback: Calculate manually if metrics not provided
                    targetItems.forEach(item => {
                        const code = item.code || item.shareName;
                        if (!code) return; // Skip invalid

                        // PRIORITIZE LIVE DATA
                        // Logic: Try LivePrice -> Try Share Object (if available) -> Try cached item dayChange
                        const live = AppState.livePrices ? AppState.livePrices.get(code) : null;
                        let change = (live && live.change !== undefined) ? live.change : item.dayChange;

                        // Fallback: If we only had a code (Custom Watchlist) and no live price, 
                        // we might need to find it in allShares to get a cached dayChange
                        if (change === undefined || change === null || change === '') {
                            const cachedShare = allShares.find(s => s.code === code);
                            if (cachedShare) change = cachedShare.dayChange;
                        }

                        // Handle "+0.5%" or "$0.5" strings if present
                        let val = parseFloat(change);
                        if (typeof change === 'string') {
                            change = change.replace(/[+$%]/g, '');
                            val = parseFloat(change);
                        }

                        if (!isNaN(val)) {
                            if (val > 0.001) gainerCount++;
                            else if (val < -0.001) loserCount++;
                        }
                    });
                }



                // (Debug counters removed)

                // 3. Determine Gradient Colors & Proportions
                const GREEN_RGBA = '20, 160, 20';
                const RED_RGBA = '180, 20, 20';

                const total = gainerCount + loserCount;

                if (total === 0) {
                    header.style.background = ''; // Neutral (Revert to CSS default)
                } else {
                    const gainerPct = gainerCount / total;
                    const loserPct = loserCount / total;

                    let leftColor, rightColor, dominantPct;

                    if (gainerPct >= loserPct) {
                        // Green is Dominant (or equal) -> Green on Left
                        leftColor = GREEN_RGBA;
                        // If NO losers, right side should not be Red. make it Green or Black.
                        // User wants "only one color".
                        rightColor = (loserCount === 0) ? GREEN_RGBA : RED_RGBA;
                        dominantPct = Math.round(gainerPct * 100);
                    } else {
                        // Red is Dominant -> Red on Left
                        leftColor = RED_RGBA;
                        rightColor = (gainerCount === 0) ? RED_RGBA : GREEN_RGBA;
                        dominantPct = Math.round(loserPct * 100);
                    }

                    // Constrain for visual aesthetics
                    // If we have mixed sentiment, keep the gap (95%).
                    // If we have Pure sentiment (100%), let it go closer to edge (e.g. 100% or 95% with same color).
                    if (gainerCount > 0 && loserCount > 0) {
                        dominantPct = Math.max(20, Math.min(95, dominantPct));
                    } else {
                        // Pure list: Allow 100% (or very close)
                        dominantPct = 100;
                    }

                    // Gradient Logic: 
                    // Dominant Color starts at 0%.
                    // Dominant Color stays strong until (percent - 20%).
                    // Fades to Dark/Black at (percent).
                    // Fades to Secondary Color at 100%.

                    const spread = 30; // Amount of "fade" space
                    const stopSolid = Math.max(0, dominantPct - spread);

                    header.style.background = `linear-gradient(90deg, 
                        rgba(${leftColor}, var(--gradient-strength, 0.6)) 0%, 
                        rgba(${leftColor}, calc(var(--gradient-strength, 0.6) * 0.8)) ${stopSolid}%, 
                        rgba(20, 20, 20, 1) ${dominantPct}%, 
                        rgba(${rightColor}, var(--gradient-strength, 0.6)) 100%)`;
                }
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

        // --- Toggle Button Visibility (Hide in Reorder Mode) ---
        const toggleContainer = document.getElementById(IDS.WATCHLIST_SORT_DIRECTION_TOGGLE);
        if (toggleContainer) {
            toggleContainer.classList.toggle(CSS_CLASSES.HIDDEN, this.isEditMode);
        }
        this.updateToggleUI();

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
        } else {
            // Default Alphabetical Sort if no manual order
            const sortDir = AppState.preferences.watchlistSort || 'asc';
            fullList.sort((a, b) => {
                const nameA = a.name.toUpperCase();
                const nameB = b.name.toUpperCase();
                if (sortDir === 'asc') {
                    return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
                } else {
                    return nameA > nameB ? -1 : (nameA < nameB ? 1 : 0);
                }
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

            const row = e.target.closest(`.${CSS_CLASSES.WATCHLIST_ITEM}`);
            if (!row) {

                return;
            }


            // HANDLE EDIT MODE
            if (this.isEditMode) {
                // DELETE BUTTON
                if (e.target.closest(`.${CSS_CLASSES.DELETE_WATCHLIST_BTN}`)) {
                    e.stopPropagation();
                    const id = row.dataset.id;

                    const event = new CustomEvent(EVENTS.REQUEST_DELETE_WATCHLIST, {
                        detail: { id: id }
                    });
                    document.dispatchEvent(event);
                    return;
                }

                // HIDE TOGGLE (Col 1)
                if (e.target.closest('.watchlist-col-hide')) {

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
