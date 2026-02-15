import { IDS, CSS_CLASSES, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * FavoriteLinksUI - Handles the Favorite Links modal and management tools.
 * Complies with Constitution: Specialized UI logic, Registry Rule (AppConstants), No Global Pollution.
 */
export class FavoriteLinksUI {
    static _currentMode = 'open'; // Default to grid view

    static init() {
        document.addEventListener(EVENTS.OPEN_FAVORITE_LINKS, () => {
            this._currentMode = 'open';
            this.showModal();
        });
        this._setupGlobalListeners();

        // Delegation for actions within the modal
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target || !target.closest(`#${IDS.MODAL_FAVORITE_LINKS}`)) return;

            const action = target.dataset.action;
            const index = parseInt(target.dataset.index, 10);

            if (action === 'edit' && !isNaN(index)) {
                this._editLinkDetails(index);
            } else if (action === 'delete' && !isNaN(index)) {
                this._deleteLink(index);
            }
        });
    }

    static _setupGlobalListeners() {
        window.addEventListener(EVENTS.FAVORITE_LINKS_UPDATED, () => {
            const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
            if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                this._renderContent(modal);
            }
        });
    }

    static showModal() {
        let modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (!modal) {
            modal = this._createModal();
            document.body.appendChild(modal);
        } else {
            this._bindEvents(modal);
        }

        // Standardized Header
        const titleEl = modal.querySelector(`#${IDS.FAVORITE_LINKS_TITLE}`);
        if (titleEl) {
            if (this._currentMode === 'open') {
                titleEl.innerHTML = `
                    Favorite Links
                    <i id="fav-links-chevron" class="fas fa-chevron-down chevron-discreet"></i>
                `;
            } else {
                // MANAGEMENT MODE Title: "Edit Favourites"
                titleEl.innerHTML = `<button class="modal-back-btn" id="fav-modal-back"><i class="fas fa-chevron-left"></i></button> Edit Favorites`;
            }
        }

        this._renderContent(modal);
        modal.classList.remove(CSS_CLASSES.HIDDEN);

        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                this.closeModal();
            }
        });
    }

    static closeModal() {
        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (modal) {
            modal.classList.add(CSS_CLASSES.HIDDEN);
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        }
    }

    static _toggleMode() {
        this._currentMode = this._currentMode === 'open' ? 'manage' : 'open';
        this.showModal();
    }

    static _createModal() {
        const modal = document.createElement('div');
        modal.id = IDS.MODAL_FAVORITE_LINKS;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_LARGE}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="${IDS.FAVORITE_LINKS_TITLE}" class="${CSS_CLASSES.MODAL_TITLE}" style="cursor: pointer; user-select: none; display: flex; align-items: center;">
                        Favorite Links
                    </h2>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                        <button id="${IDS.RESTORE_FAVORITES_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN}" title="Restore Defaults">
                            <i class="fas fa-undo-alt"></i>
                        </button>
                        <button id="${IDS.ADD_FAVORITE_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN}" title="Add Link">
                            <i class="fas ${UI_ICONS.ADD}"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}">
                    <div id="${IDS.FAVORITE_LINKS_LIST}"></div>
                </div>
            </div>
        `;

        this._bindEvents(modal);
        return modal;
    }

    static _bindEvents(modal) {
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        if (closeBtn) closeBtn.onclick = () => this.closeModal();

        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        if (overlay) overlay.onclick = () => this.closeModal();

        const addBtn = modal.querySelector(`#${IDS.ADD_FAVORITE_BTN}`);
        if (addBtn) addBtn.onclick = () => this._showAddLinkForm();

        const title = modal.querySelector(`#${IDS.FAVORITE_LINKS_TITLE}`);
        if (title) {
            title.onclick = () => this._toggleMode();
        }

        const restoreBtn = modal.querySelector(`#${IDS.RESTORE_FAVORITES_BTN}`);
        if (restoreBtn) {
            restoreBtn.onclick = () => {
                if (confirm('Restore default links? This will overwrite your current list.')) {
                    AppState.saveFavoriteLinks(this.DEFAULTS);
                    this._renderContent(modal);
                }
            };
        }
    }

    static get DEFAULTS() {
        return [
            { name: 'Google Finance', url: 'https://www.google.com/finance' },
            { name: 'Sharesight', url: 'https://www.sharesight.com/au/login/' },
            { name: 'Market Index', url: 'https://www.marketindex.com.au' },
            { name: 'ASX Official', url: 'https://www2.asx.com.au' },
            { name: 'InvestorServe', url: 'https://www.investorserve.com.au/' },
            { name: 'InvestorPort', url: 'https://portals.linkmarketservices.com.au/' },
            { name: 'Automic Investor', url: 'https://automic.com.au' },
            { name: 'MUFG Corporate Markets', url: 'https://www.mpms.mufg.com/en/mufg-corporate-markets/' },
            { name: 'Computershare', url: 'https://www-au.computershare.com/Investor/#Home' },
            { name: 'Yahoo Finance', url: 'https://au.finance.yahoo.com' },
            { name: 'TradingView', url: 'https://www.tradingview.com' },
            { name: 'HotCopper', url: 'https://hotcopper.com.au' },
            { name: 'Simply Wall St', url: 'https://simplywall.st/stocks/asx' },
            { name: 'CommSec', url: 'https://www.commsec.com.au' }
        ];
    }

    static _getEffectiveLinks() {
        // CONSTITUTIONAL FIX: Reinstating defaults if user list is empty or missing
        const userLinks = AppState.preferences.favoriteLinks;
        if (!userLinks || userLinks.length === 0) {
            return JSON.parse(JSON.stringify(this.DEFAULTS));
        }
        return userLinks;
    }

    static _renderContent(modal) {
        const container = modal.querySelector(`#${IDS.FAVORITE_LINKS_LIST}`);
        const links = this._getEffectiveLinks();

        if (this._currentMode === 'manage') {
            this._renderList(container, links);
            const addBtn = modal.querySelector(`#${IDS.ADD_FAVORITE_BTN}`);
            const restoreBtn = modal.querySelector(`#${IDS.RESTORE_FAVORITES_BTN}`);
            if (addBtn) addBtn.classList.remove(CSS_CLASSES.HIDDEN);
            if (restoreBtn) restoreBtn.classList.remove(CSS_CLASSES.HIDDEN);
        } else {
            this._renderGrid(container, links);
            const addBtn = modal.querySelector(`#${IDS.ADD_FAVORITE_BTN}`);
            const restoreBtn = modal.querySelector(`#${IDS.RESTORE_FAVORITES_BTN}`);
            if (addBtn) addBtn.classList.add(CSS_CLASSES.HIDDEN);
            if (restoreBtn) restoreBtn.classList.add(CSS_CLASSES.HIDDEN);
        }
    }

    static _renderGrid(container, links) {
        container.className = CSS_CLASSES.FAVORITE_LINKS_GRID;
        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try { hostname = new URL(link.url).hostname; } catch (e) { hostname = 'unknown'; }

            // Fix for SelfWealth: Use DuckDuckGo icons which are often more reliable for this domain
            let iconSrc = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            if (hostname.includes('selfwealth')) {
                iconSrc = 'https://icons.duckduckgo.com/ip3/selfwealth.com.au.ico';
            }

            return `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="${CSS_CLASSES.FAVORITE_LINK_CARD}">
                    <img src="${iconSrc}" alt="" class="link-favicon">
                    <span class="link-text">${link.name}</span>
                </a>
            `;
        }).join('');
    }

    static _renderList(container, links) {
        container.className = CSS_CLASSES.FAVORITE_MANAGE_LIST;
        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try { hostname = new URL(link.url).hostname; } catch (e) { hostname = 'unknown'; }

            // Fix for SelfWealth: Use DuckDuckGo icons which are often more reliable for this domain
            let iconSrc = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            if (hostname.includes('selfwealth')) {
                iconSrc = 'https://icons.duckduckgo.com/ip3/selfwealth.com.au.ico';
            }

            return `
                <div class="${CSS_CLASSES.FAVORITE_MANAGE_ROW}" data-index="${index}" draggable="true">
                    <div class="drag-handle" title="Hold to Drag">
                        <i class="fas fa-bars"></i>
                    </div>

                    <div class="manage-row-content" data-action="edit" data-index="${index}">
                        <img src="${iconSrc}" class="link-favicon" alt="" style="width: 32px; height: 32px;">
                        <span class="manage-link-name">
                            ${link.name}
                            <i class="fas fa-pencil-alt manage-edit-icon"></i>
                        </span>
                    </div>
                    
                    <div class="manage-controls">
                        <button class="btn-delete" data-action="delete" data-index="${index}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this._setupDragDrop(container);
    }

    static _setupDragDrop(container) {
        // PREVENT LISTENER STACKING
        if (container._dragDropInitialized) return;
        container._dragDropInitialized = true;

        this._draggedItem = null;

        container.addEventListener('dragstart', (e) => {
            const row = e.target.closest(`.${CSS_CLASSES.FAVORITE_MANAGE_ROW}`);
            if (!row) return;

            // Block drag if clicking buttons
            if (e.target.closest('button') || e.target.closest('input')) {
                e.preventDefault();
                return;
            }

            this._draggedItem = row;
            row.classList.add(CSS_CLASSES.DRAGGING);
            e.dataTransfer.effectAllowed = 'move';
            // Set some data for Firefox support
            e.dataTransfer.setData('text/plain', '');
        });

        container.addEventListener('dragover', (e) => {
            if (!this._draggedItem) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const afterElement = this._getDragAfterElement(container, e.clientY);

            // Visual Line Logic
            const rows = [...container.querySelectorAll(`.${CSS_CLASSES.FAVORITE_MANAGE_ROW}:not(.${CSS_CLASSES.DRAGGING})`)];
            rows.forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'));

            if (afterElement == null) {
                const lastRow = rows[rows.length - 1];
                if (lastRow) lastRow.classList.add('drag-over-bottom');
                container.appendChild(this._draggedItem);
            } else {
                afterElement.classList.add('drag-over');
                container.insertBefore(this._draggedItem, afterElement);
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            this._finalizeReorder(container);
        });

        container.addEventListener('dragend', (e) => {
            if (this._draggedItem) {
                this._draggedItem.classList.remove(CSS_CLASSES.DRAGGING);
            }
            this._draggedItem = null;
            const rows = container.querySelectorAll(`.${CSS_CLASSES.FAVORITE_MANAGE_ROW}`);
            rows.forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'));
        });
    }

    static _getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll(`.${CSS_CLASSES.FAVORITE_MANAGE_ROW}:not(.${CSS_CLASSES.DRAGGING})`)];

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

    static _finalizeReorder(container) {
        const rows = Array.from(container.querySelectorAll(`.${CSS_CLASSES.FAVORITE_MANAGE_ROW}`));
        const currentLinks = this._getEffectiveLinks();

        // Match links by URL/Name to current DOM order
        const newLinks = rows.map(row => {
            const idx = parseInt(row.dataset.index, 10);
            return currentLinks[idx];
        });

        AppState.saveFavoriteLinks(newLinks);

        // Re-render to update data-index attributes
        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (modal) this._renderContent(modal);
    }

    static _reorderLinks(from, to) {
        const links = this._getEffectiveLinks();
        const [moved] = links.splice(from, 1);
        links.splice(to, 0, moved);
        AppState.saveFavoriteLinks(links);

        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (modal) {
            // Re-render will trigger _setupDragDrop again but the flag will block new listeners
            this._renderContent(modal);
        }
    }

    static _editLinkDetails(index) {
        const links = this._getEffectiveLinks();
        const link = links[index];

        const newName = prompt("Edit Name:", link.name);
        if (newName === null) return;

        const newUrl = prompt("Edit URL:", link.url);
        if (newUrl === null) return;

        if (newName && newUrl) {
            links[index] = { name: newName, url: newUrl };
            AppState.saveFavoriteLinks(links);
            const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
            if (modal) this._renderContent(modal);
        }
    }

    static _deleteLink(index) {
        if (!confirm('Delete this link?')) return;
        const links = this._getEffectiveLinks();
        links.splice(index, 1);
        AppState.saveFavoriteLinks(links);

        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (modal) this._renderContent(modal);
    }

    static _showAddLinkForm() {
        const name = prompt("Link Name:");
        if (!name) return;
        const url = prompt("URL (e.g., https://google.com):");
        if (!url) return;

        let links = this._getEffectiveLinks();

        // Seed if first time
        if (!AppState.preferences.favoriteLinks || AppState.preferences.favoriteLinks.length === 0) {
            links = [...JSON.parse(JSON.stringify(this.DEFAULTS)), { name, url }];
        } else {
            links.push({ name, url });
        }

        AppState.saveFavoriteLinks(links);

        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (modal) this._renderContent(modal);
    }
}