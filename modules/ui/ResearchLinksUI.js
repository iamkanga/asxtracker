import { AppState } from '../state/AppState.js';
import { IDS, CSS_CLASSES, UI_ICONS, RESEARCH_LINKS_TEMPLATE, EVENTS } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * Handles the custom research links management UI.
 */
export default class ResearchLinksUI {
    static init() {
        this.isEditMode = true; // Always in management mode for this modal
        this._setupEventListeners();
        this._setupGlobalListeners();
    }

    static _setupGlobalListeners() {
        // Listen for updates from other parts of the app (or this modal itself)
        // to ensure we refresh if we're showing a management list
        window.addEventListener(EVENTS.RESEARCH_LINKS_UPDATED, () => {
            const modal = document.getElementById(IDS.MODAL_RESEARCH_LINKS);
            if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                this.render();
            }
        });
    }

    static _setupEventListeners() {
        document.addEventListener('click', (e) => {
            const modalId = IDS.MODAL_RESEARCH_LINKS;
            const modal = document.getElementById(modalId);
            if (!modal) return;

            // Close button
            const closeBtn = e.target.closest(`#${modalId} .modal-close-btn`);
            if (closeBtn) {
                this.hide();
                return;
            }

            // Add Link button
            const addBtn = e.target.closest(`#${IDS.ADD_RESEARCH_LINK_BTN}`);
            if (addBtn) {
                this.showAddLinkDialog();
                return;
            }

            // Title click
            const title = e.target.closest(`#${IDS.RESEARCH_LINKS_TITLE}`);
            if (title) {
                this.hide();
                return;
            }

            // Global delegate for actions
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn && actionBtn.closest(`#${modalId}`)) {
                const action = actionBtn.dataset.action;
                const index = parseInt(actionBtn.dataset.index, 10);
                const links = this.getResearchLinks();

                if (action === 'edit' && !isNaN(index)) {
                    this.showAddLinkDialog(links[index], index);
                } else if (action === 'delete' && !isNaN(index)) {
                    this.deleteLink(index);
                }
            }
        });
    }

    static getResearchLinks() {
        // Normalize all links to object format and ensure defaults if empty
        let links = AppState.preferences.researchLinks;
        if (!links || links.length === 0) {
            links = RESEARCH_LINKS_TEMPLATE;
        }

        return links.map(link => {
            if (typeof link === 'string') {
                return { displayName: 'Link', url: link, description: '' };
            }
            return {
                displayName: link.displayName || link.name || 'Link',
                url: link.url || link.link || '',
                description: link.description || ''
            };
        });
    }

    static show(activeCode = null) {
        this._activeCode = activeCode;
        const modal = document.getElementById(IDS.MODAL_RESEARCH_LINKS);
        if (!modal) return;

        modal.classList.remove(CSS_CLASSES.HIDDEN);
        this.render();

        navManager.pushState(() => this.hide(), 'ResearchLinks');
    }

    static hide() {
        const modal = document.getElementById(IDS.MODAL_RESEARCH_LINKS);
        if (modal) {
            modal.classList.add(CSS_CLASSES.HIDDEN);
            // Safety: Ensure we pop state if we're closing via UI and not via back button
            navManager.popStateSilently();
        }
    }

    static render() {
        const list = document.getElementById(IDS.RESEARCH_LINKS_LIST);
        if (!list) return;

        const links = this.getResearchLinks();
        this._renderList(list, links);
    }

    static _renderList(container, links) {
        container.className = CSS_CLASSES.RESEARCH_MANAGE_LIST;
        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try {
                const testUrl = (link.url || '').replace(/\$(?:\{code\}|\(code\)|code)/gi, 'ASX');
                hostname = new URL(testUrl).hostname;
            } catch (e) { hostname = 'research'; }

            const iconSrc = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            return `
                <div class="${CSS_CLASSES.RESEARCH_MANAGE_ROW}" data-index="${index}" draggable="true">
                    <div class="drag-handle" title="Hold to Drag">
                        <i class="fas fa-bars"></i>
                    </div>
                    
                    <div class="manage-row-content" data-action="edit" data-index="${index}">
                        <img src="${iconSrc}" class="link-favicon" alt="" style="width: 32px; height: 32px;">
                        <div class="manage-text-stack">
                            <span class="manage-link-name">
                                ${link.displayName}
                                <i class="fas fa-pencil-alt manage-edit-icon"></i>
                            </span>
                            <span class="manage-link-desc text-xxs text-muted">${link.description || ''}</span>
                        </div>
                    </div>
                    
                    <div class="manage-controls">
                        <button class="btn-delete" data-action="delete" data-index="${index}" title="Remove Link">
                            <i class="fas fa-trash"></i>
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
            const row = e.target.closest(`.${CSS_CLASSES.RESEARCH_MANAGE_ROW}`);
            if (!row) return;
            this._draggedItem = row;
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this._getDragAfterElement(container, e.clientY);
            const dragging = document.querySelector('.dragging');
            if (afterElement == null) {
                container.appendChild(dragging);
            } else {
                container.insertBefore(dragging, afterElement);
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            this._finalizeReorder(container);
        });

        container.addEventListener('dragend', () => {
            if (this._draggedItem) {
                this._draggedItem.classList.remove('dragging');
                this._draggedItem = null;
            }
        });
    }

    static _getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll(`.${CSS_CLASSES.RESEARCH_MANAGE_ROW}:not(.dragging)`)];

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
        const rows = [...container.querySelectorAll(`.${CSS_CLASSES.RESEARCH_MANAGE_ROW}`)];
        const currentLinks = this.getResearchLinks();

        // Match links to their new DOM order
        const newLinks = rows.map(row => {
            const idx = parseInt(row.dataset.index, 10);
            return currentLinks[idx];
        });

        // Save
        AppState.saveResearchLinks(newLinks);

        // Re-render to update data-indices
        this.render();
    }

    static async showAddLinkDialog(existingLink = null, editIndex = -1) {
        let name = prompt('Display Name:', existingLink ? existingLink.displayName : '');
        if (name === null) return;

        let url = prompt('Paste the URL here:', existingLink ? existingLink.url : 'https://');
        if (url === null) return;

        // SMART UPDATE LOGIC
        // Detect and generalize both URL and potentially Name if it contains the ticker
        if (!url.includes('$(code)') && !url.includes('${code}')) {
            let detectedCode = null;

            // Priority: Container Context
            if (this._activeCode && url.toUpperCase().includes(this._activeCode.toUpperCase())) {
                detectedCode = this._activeCode;
            } else {
                // Secondary: Pattern Match
                const patterns = [
                    /([\/.:=\-?&]|^)([A-Z]{3,4})(?=[\/.:=\-?&]|$)/i,
                    /([A-Z]{3,4})(?=\.(?:AX|ASX))/i
                ];
                for (const pattern of patterns) {
                    const match = url.match(pattern);
                    if (match) {
                        const candidate = (match[2] || match[1]).toUpperCase();
                        const exclusions = ['COM', 'NET', 'ORG', 'WWW', 'ASX', 'INFO', 'BIZ', 'CO', 'AU', 'STOCK', 'SHARE', 'URL', 'HTTP', 'HTTPS', 'FINANCE', 'YAHOO', 'GOOGLE'];
                        if (!exclusions.includes(candidate)) {
                            detectedCode = candidate;
                            break;
                        }
                    }
                }
            }

            if (detectedCode) {
                const escapedCode = detectedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const replaceRegex = new RegExp(`([\\/.:=\\-?&]|^)${escapedCode}(?=[\\/.:=\\-?&]|$)`, 'gi');

                // Replace in URL
                if (replaceRegex.test(url)) {
                    url = url.replace(replaceRegex, (match, p1) => p1 ? `${p1}$(code)` : `$(code)`);
                } else {
                    url = url.replace(new RegExp(escapedCode, 'gi'), '$(code)');
                }

                // Also attempt to generalize the manual name if the user entered the code there
                if (name.toUpperCase().includes(detectedCode.toUpperCase())) {
                    name = name.replace(new RegExp(escapedCode, 'gi'), '$(code)');
                }

                ToastManager.show(`Smart Link: Generalized for all stocks`, 'info');
            }
        }

        const desc = prompt('Description (max 50 chars):', existingLink ? existingLink.description : '');
        if (desc === null) return;

        const newLink = {
            displayName: name.trim() || 'Untitled',
            url: url.trim(),
            description: (desc || '').substring(0, 50).trim()
        };

        // Ensure we seed defaults if needed
        let links = this.getResearchLinks();
        if (editIndex >= 0) {
            links[editIndex] = newLink;
        } else {
            // Seed defaults first if prefs are empty to preserve existing template links
            if (!AppState.preferences.researchLinks || AppState.preferences.researchLinks.length === 0) {
                links = [...JSON.parse(JSON.stringify(RESEARCH_LINKS_TEMPLATE)), newLink];
            } else {
                links.push(newLink);
            }
        }

        AppState.saveResearchLinks(links);
        this.render();
        ToastManager.show(editIndex >= 0 ? 'Link updated' : 'Link added', 'success');

        if (AppState._triggerSync) AppState._triggerSync();
    }

    static deleteLink(index) {
        if (!confirm('Remove this research link?')) return;

        const links = this.getResearchLinks();
        links.splice(index, 1);
        AppState.saveResearchLinks(links);
        this.render();
        ToastManager.show('Link removed', 'success');

        if (AppState._triggerSync) AppState._triggerSync();
    }
}
