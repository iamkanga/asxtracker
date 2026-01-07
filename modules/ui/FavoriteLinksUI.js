import { IDS, CSS_CLASSES, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';

export class FavoriteLinksUI {
    static _currentMode = 'open'; // 'open' or 'manage'

    static init() {
        document.addEventListener(EVENTS.OPEN_FAVORITE_LINKS, () => this.showModal());
    }

    static showModal() {
        let modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        if (!modal) {
            modal = this._createModal();
            document.body.appendChild(modal);
        } else {
            this._bindEvents(modal);
        }

        // HOT PATCH: Force update the title chevron on every open to ensure fresh ICON/Text
        // This solves the issue where cached DOM elements don't reflect new code changes.
        const titleEl = modal.querySelector(`#${IDS.FAVORITE_LINKS_TITLE}`);
        if (titleEl) {
            titleEl.innerHTML = `
                Favorite Links
                <svg id="${IDS.FAV_LINKS_CHEVRON}" class="chevron-premium-v5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
        }

        this._currentMode = 'open'; // Default to Open

        // Subscribe to Live Updates (Sync)
        if (!this._liveUpdateListener) {
            this._liveUpdateListener = () => {
                console.log('[FavoriteLinksUI] Received Live Update Event. Re-rendering.');
                this._renderContent(modal);
            };
            window.addEventListener(EVENTS.FAVORITE_LINKS_UPDATED, this._liveUpdateListener);
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

    static _createModal() {
        const modal = document.createElement('div');
        modal.id = IDS.MODAL_FAVORITE_LINKS;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} modal-content-large">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="${IDS.FAVORITE_LINKS_TITLE}" class="${CSS_CLASSES.MODAL_TITLE}" style="cursor: pointer; user-select: none; display: flex; align-items: center;">
                        Favorite Links
                        <span id="fav-links-chevron" style="margin-left: 8px; font-size: 0.8em; opacity: 0.3; display: inline-block; transition: transform 0.3s ease;">▼</span>
                    </h2>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                        <button id="${IDS.ADD_FAVORITE_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN}" title="Add Link">
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

        // Title Toggle
        const title = modal.querySelector(`#${IDS.FAVORITE_LINKS_TITLE}`);
        if (title) {
            title.onclick = () => this._toggleMode();
        }
    }

    static _toggleMode() {
        this._currentMode = this._currentMode === 'open' ? 'manage' : 'open';
        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);

        // Rotate Chevron (Standard Icon)
        const icon = modal.querySelector(`#${IDS.FAV_LINKS_CHEVRON}`);
        if (icon) {
            icon.style.transform = this._currentMode === 'manage' ? 'rotate(180deg)' : 'rotate(0deg)';
        }

        this._renderContent(modal);
    }

    static get DEFAULTS() {
        return [
            { name: 'Yahoo Finance', url: 'https://au.finance.yahoo.com' },
            { name: 'Google Finance', url: 'https://www.google.com/finance' },
            { name: 'ASX Official', url: 'https://www2.asx.com.au' },
            { name: 'Market Index', url: 'https://www.marketindex.com.au' },
            { name: 'HotCopper', url: 'https://hotcopper.com.au' },
            { name: 'CommSec', url: 'https://www.commsec.com.au' },
            { name: 'TradingView', url: 'https://www.tradingview.com' },
            { name: 'Rask Media', url: 'https://www.raskmedia.com.au' },
            { name: 'Motley Fool', url: 'https://www.fool.com.au' },
            { name: 'Google News', url: 'https://news.google.com' }
        ];
    }

    static _getEffectiveLinks() {
        const links = AppState.preferences.favoriteLinks || [];
        if (links.length === 0) {
            // Return a deep copy of defaults to ensure we don't mutate the constant
            return JSON.parse(JSON.stringify(this.DEFAULTS));
        }
        return [...links]; // Return copy of state
    }

    static _renderContent(modal) {
        const container = modal.querySelector(`#${IDS.FAVORITE_LINKS_LIST}`);
        // Use effective links for rendering (Visual Defaults)
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
                <div class="favorite-manage-row" data-index="${index}">
                    <div class="manage-row-content" onclick="FavoriteLinksUI._editLinkDetails(${index})">
                        <img src="${iconSrc}" class="link-favicon" alt="" style="width: 32px; height: 32px;">
                        <span class="manage-link-name">
                            ${link.name}
                            <i class="fas fa-pencil-alt manage-edit-icon"></i>
                        </span>
                    </div>
                    
                    <div class="manage-controls">
                        <!-- Upload Custom Icon -->
                        <button class="btn-upload-icon" onclick="FavoriteLinksUI._handleIconUpload(${index})" title="Upload Custom Icon">
                            <i class="fas fa-camera"></i>
                        </button>

                        <!-- Reorder Up -->
                        <button class="btn-reorder" onclick="FavoriteLinksUI._moveLink(${index}, -1)" ${index === 0 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-up"></i>
                        </button>
                        
                        <!-- Reorder Down -->
                        <button class="btn-reorder" onclick="FavoriteLinksUI._moveLink(${index}, 1)" ${index === links.length - 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-down"></i>
                        </button>

                        <!-- Delete -->
                        <button class="btn-delete" onclick="FavoriteLinksUI._deleteLink(${index})">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    static _handleIconUpload(index) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Limit file size to 100KB to prevent bloated AppState
            if (file.size > 102400) {
                alert('Image is too large. Please use an image smaller than 100KB.');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const links = this._getEffectiveLinks();
                links[index].customIcon = event.target.result; // Base64
                AppState.saveFavoriteLinks(links);

                const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
                this._renderContent(modal);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    static _moveLink(index, direction) {
        const links = this._getEffectiveLinks(); // Hydrate defaults if needed
        const newIndex = index + direction;

        if (newIndex >= 0 && newIndex < links.length) {
            [links[index], links[newIndex]] = [links[newIndex], links[index]];
            AppState.saveFavoriteLinks(links);
            // Auto-render handled by AppState sync or manual trigger
            const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
            this._renderContent(modal);
        }
    }

    static _editLinkDetails(index) {
        const links = this._getEffectiveLinks(); // Hydrate defaults if needed
        const link = links[index];

        const newName = prompt("Edit Name:", link.name);
        if (newName === null) return;

        const newUrl = prompt("Edit URL:", link.url);
        if (newUrl === null) return;

        if (newName && newUrl) {
            links[index] = { name: newName, url: newUrl };
            AppState.saveFavoriteLinks(links);
            const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
            this._renderContent(modal);
        }
    }

    static _deleteLink(index) {
        if (!confirm('Delete this link?')) return;
        const links = this._getEffectiveLinks(); // Hydrate defaults if needed
        links.splice(index, 1);
        AppState.saveFavoriteLinks(links);

        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        this._renderContent(modal);
    }

    static _showAddLinkForm() {
        const name = prompt("Link Name:");
        if (!name) return;
        const url = prompt("URL (e.g., https://google.com):");
        if (!url) return;

        const links = this._getEffectiveLinks(); // Hydrate defaults if needed
        links.push({ name, url });
        AppState.saveFavoriteLinks(links);

        const modal = document.getElementById(IDS.MODAL_FAVORITE_LINKS);
        this._renderContent(modal);
    }
}

// Expose to window for inline HTML event handlers
window.FavoriteLinksUI = FavoriteLinksUI;
