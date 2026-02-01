import { IDS, CSS_CLASSES, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';

export class FavoriteLinksUI {
    static _currentMode = 'open'; // 'open' or 'manage'

    static init() {
        this._setupEventListeners();
    }

    static _setupEventListeners() {
        document.addEventListener(EVENTS.OPEN_FAVORITE_LINKS, () => this.showModal());

        document.addEventListener('click', (e) => {
            const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
            if (!modal || modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                // If the modal isn't visible, our work here is done.
                // This prevents actions firing when the modal is not the target.
                const openBtn = e.target.closest(`#${IDS.BTN_FAVORITE_LINKS}`);
                if (openBtn) {
                    this.showModal();
                }
                return;
            }

            // Actions inside the modal
            const addBtn = e.target.closest(`#${IDS.ADD_FAVORITE_BTN}`);
            if (addBtn) {
                this._showLinkDialog();
                return;
            }

            const title = e.target.closest(`#${IDS.FAVORITE_LINKS_TITLE}`);
            if (title) {
                this._toggleMode();
                return;
            }

            const closeBtn = e.target.closest(`#${IDS.MODAL_FAVORITE_LINKS} .modal-close-btn`);
            if (closeBtn) {
                this.closeModal();
                return;
            }
            
            const overlay = e.target.closest(`.${CSS_CLASSES.MODAL_OVERLAY}`);
            if (overlay && e.target === overlay) { // Ensure it's the overlay itself
                 this.closeModal();
                 return;
            }

            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                const index = parseInt(actionBtn.dataset.index, 10);

                if (action === 'edit' && !isNaN(index)) {
                    const links = this._getEffectiveLinks();
                    this._showLinkDialog(links[index], index);
                } else if (action === 'delete' && !isNaN(index)) {
                    this._deleteLink(index);
                }
            }
        });
    }

    static showModal() {
        let modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (!modal) {
            modal = this._createModal();
            document.body.appendChild(modal);
        }

        this._currentMode = 'open';
        this._updateTitleAndControls(modal);

        if (!this._liveUpdateListener) {
            this._liveUpdateListener = () => {
                const openModal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
                if (openModal) this.render(openModal);
            };
            window.addEventListener(EVENTS.FAVORITE_LINKS_UPDATED, this._liveUpdateListener);
        }

        this.render(modal);
        modal.classList.remove(CSS_CLASSES.HIDDEN);

        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
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

    static _createModal() {
        const modal = document.createElement('div');
        modal.id = IDS.MODAL_FAVORITE_LINKS;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} modal-content-large">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="${IDS.FAVORITE_LINKS_TITLE}" class="${CSS_CLASSES.MODAL_TITLE}" style="cursor: pointer; user-select: none; display: flex; align-items: center;">
                        Favorite URLs
                        <svg id="${IDS.FAV_LINKS_CHEVRON}" class="chevron-premium-v5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(0deg);">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </h2>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                        <button id="${IDS.ADD_FAVORITE_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN}" title="Add Link" style="display: none;">
                            <i class="fas ${UI_ICONS.ADD}"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}">
                    <div id="${IDS.FAVORITE_LINKS_LIST}"></div>
                </div>
            </div>
        `;
        return modal;
    }

    static _updateTitleAndControls(modal) {
        const titleEl = modal.querySelector(`#${IDS.FAVORITE_LINKS_TITLE}`);
        const addBtn = modal.querySelector(`#${IDS.ADD_FAVORITE_BTN}`);
        const chevron = modal.querySelector(`#${IDS.FAV_LINKS_CHEVRON}`);

        const isManage = this._currentMode === 'manage';

        if (titleEl) {
            const titleText = isManage ? 'Favorite Tools' : 'Favorite URLs';
            const textNode = Array.from(titleEl.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) {
                textNode.nodeValue = titleText + ' ';
            }
        }
        if (addBtn) {
            addBtn.style.display = isManage ? 'block' : 'none';
        }
        if (chevron) {
            chevron.style.transform = isManage ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }

    static _toggleMode() {
        this._currentMode = this._currentMode === 'open' ? 'manage' : 'open';
        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        this._updateTitleAndControls(modal);
        this.render(modal);
    }

    static get DEFAULTS() {
        return [
            { name: 'Google Finance', url: 'https://www.google.com/finance' },
            { name: 'Sharesight', url: 'https://www.sharesight.com/au/login/' },
            { name: 'Market Index', url: 'https://www.marketindex.com.au' },
            { name: 'ASX Official', url: 'https://www2.asx.com.au' },
            { name: 'InvestorServe', url: 'https://www.investorserve.com.au/' },
            { name: 'Automic Investor', url: 'https://automic.com.au' },
            { name: 'MUFG Corporate Markets', url: 'https://www.mpms.mufg.com/en/mufg-corporate-markets/' },
            { name: 'Computershare', url: 'https://www-au.computershare.com/Investor/#Home' },
            { name: 'Yahoo Finance', url: 'https://au.finance.yahoo.com' },
            { name: 'Motley Fool', url: 'https://www.fool.com.au' },
            { name: 'HotCopper', url: 'https://hotcopper.com.au' },
            { name: 'CommSec', url: 'https://www.commsec.com.au' },
            { name: 'TradingView', url: 'https://www.tradingview.com' },
            { name: 'AFR', url: 'https://www.afr.com' },
            { name: 'Livewire', url: 'https://www.livewiremarkets.com' },
            { name: 'Smallcaps', url: 'https://smallcaps.com.au' },
            { name: 'Listcorp', url: 'https://www.listcorp.com' },
            { name: 'Marketwatch', url: 'https://www.marketwatch.com' },
            { name: 'Morningstar', url: 'https://www.morningstar.com.au' },
            { name: 'Stockhead', url: 'https://stockhead.com.au' },
            { name: 'Intelligent Investor', url: 'https://www.intelligentinvestor.com.au' },
            { name: 'Rask', url: 'https://www.rask.com.au' }
        ];
    }

    static _getEffectiveLinks() {
        const links = AppState.preferences.favoriteLinks;
        if (!links || links.length === 0) {
            return JSON.parse(JSON.stringify(this.DEFAULTS));
        }

        const defaultSharesight = 'https://www.sharesight.com/au/login/';
        const defaultAFR = 'https://www.afr.com';
        const oldAutomic = 'https://portal.automic.com.au/investor/home';
        const oldLink = 'https://au.investorcentre.mpms.mufg.com/Login/Login';

        let sanitzed = links.filter(link => {
            if (link.name === 'Sharesight' && link.url !== defaultSharesight) return false;
            if (link.name === 'AFR' && link.url !== defaultAFR) return false;
            if (link.url === oldAutomic) return false;
            if (link.url === oldLink) return false;
            return true;
        });

        let modified = false;
        if (modified) {
            AppState.saveFavoriteLinks(sanitzed);
        }

        return [...sanitzed];
    }

    static render(modal) {
        const container = modal.querySelector(`#${IDS.FAVORITE_LINKS_LIST}`);
        const links = this._getEffectiveLinks();

        if (this._currentMode === 'open') {
            this._renderGrid(container, links);
        } else {
            this._renderList(container, links);
        }
    }

    // Grid View (Open Mode)
    static _renderGrid(container, links) {
        container.className = 'favorite-links-grid';
        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try { hostname = new URL(link.url).hostname; } catch (e) { hostname = 'unknown'; }

            const iconSrc = link.customIcon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            return `
                <div class="favorite-link-item" data-index="${index}">
                    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="favorite-link-btn">
                        <img src="${iconSrc}" class="link-favicon" alt="">
                        <span class="link-name">${link.name}</span>
                    </a>
                </div>
            `;
        }).join('');
    }

    // List View (Manage Mode)
    static _renderList(container, links) {
        container.className = 'favorite-manage-list';
        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try { hostname = new URL(link.url).hostname; } catch (e) { hostname = 'unknown'; }

            const iconSrc = link.customIcon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            return `
                <div class="favorite-manage-row" data-index="${index}" draggable="true">
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
                        <!-- Delete -->
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
        let draggedIndex = null;

        container.addEventListener('dragstart', (e) => {
            const row = e.target.closest('.favorite-manage-row');
            if (!row) return;
            draggedIndex = parseInt(row.dataset.index);
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';

            if (navigator.vibrate) {
                navigator.vibrate(50); // Haptic feedback
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const row = e.target.closest('.favorite-manage-row');
            if (!row || draggedIndex === null) return;
            row.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
            const row = e.target.closest('.favorite-manage-row');
            if (row) row.classList.remove('drag-over');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const row = e.target.closest('.favorite-manage-row');
            if (!row || draggedIndex === null) return;

            const dropIndex = parseInt(row.dataset.index);
            if (draggedIndex !== dropIndex) {
                this._reorderLinks(draggedIndex, dropIndex);
            }
            draggedIndex = null;
        });

        container.addEventListener('dragend', (e) => {
            const rows = container.querySelectorAll('.favorite-manage-row');
            rows.forEach(r => r.classList.remove('dragging', 'drag-over'));
            draggedIndex = null;
        });
    }

    static _reorderLinks(from, to) {
        const links = this._getEffectiveLinks();
        const [moved] = links.splice(from, 1);
        links.splice(to, 0, moved);
        AppState.saveFavoriteLinks(links);
        this.render(document.getElementById(IDS.MODAL_FAVORITE_LINKS));
    }

    static _showLinkDialog(existingLink = null, editIndex = -1) {
        const name = prompt('Name:', existingLink ? existingLink.name : '');
        if (name === null) return;

        const url = prompt('URL:', existingLink ? existingLink.url : 'https://');
        if (url === null) return;

        const newLink = {
            name: name.trim() || 'Untitled',
            url: url.trim()
        };

        const links = this._getEffectiveLinks();
        if (editIndex >= 0) {
            links[editIndex] = newLink;
        } else {
            links.push(newLink);
        }

        AppState.saveFavoriteLinks(links);
        this.render(document.getElementById(IDS.MODAL_FAVORITE_LINKS));
    }

    static _deleteLink(index) {
        if (!confirm('Delete this link?')) return;
        const links = this._getEffectiveLinks();
        links.splice(index, 1);
        AppState.saveFavoriteLinks(links);
        this.render(document.getElementById(IDS.MODAL_FAVORITE_LINKS));
    }
}


// Global assignment removed - use ES module import instead
