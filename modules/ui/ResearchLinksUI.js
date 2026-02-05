import { AppState } from '../state/AppState.js';
import { IDS, CSS_CLASSES, UI_ICONS, RESEARCH_LINKS_TEMPLATE, EVENTS } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { LinkHelper } from '../utils/LinkHelper.js';
import { getSingleShareData } from '../data/DataProcessor.js';

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
                const testUrl = LinkHelper.replacePlaceholders(link.url, { code: 'ASX', name: 'ASX' });
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
        // Detect and generalize URL and Name components (code, lowercase code, and name slug)
        if (!url.includes('${code}') && !url.includes('$(code)') && !url.includes('${name_slug}') && !url.includes('$(name_slug)')) {
            let detectedCode = null;
            let detectedSlug = null;
            let detectedLowerCode = null;

            // 1. Resolve exact context info for the active stock
            if (this._activeCode) {
                const stock = getSingleShareData(this._activeCode, AppState.data.shares, AppState.livePrices, AppState.data.watchlists);
                if (stock) {
                    const codeUpper = stock.code.toUpperCase();
                    const codeLower = stock.code.toLowerCase();
                    const nameSlug = LinkHelper.slugify(stock.name);

                    // Check for Name Slug
                    const urlLower = url.toLowerCase();
                    if (nameSlug && nameSlug.length > 3 && urlLower.includes(nameSlug)) {
                        detectedSlug = nameSlug;
                    } else {
                        // GREEDY SLUG DETECTION: 
                        // If we see /asx/code/something-here, then 'something-here' is almost certainly the slug
                        const slugRegex = new RegExp(`\/asx\/${codeLower}\/([a-z0-9-]+)`, 'i');
                        const slugMatch = url.match(slugRegex);
                        if (slugMatch) detectedSlug = slugMatch[1];
                    }

                    // Check for Code (Lowercase/Uppercase)
                    if (url.includes(codeUpper)) {
                        detectedCode = codeUpper;
                    } else if (url.includes(codeLower)) {
                        detectedLowerCode = codeLower;
                    }
                }
            }

            // 2. Generic Code Detection (Fallback)
            if (!detectedSlug && !detectedCode && !detectedLowerCode) {
                const pattern = /([\/.:=\-?&]|^)([A-Z]{3,4})(?=[\/.:=\-?&]|$)/gi;
                const exclusions = ['COM', 'NET', 'ORG', 'WWW', 'ASX', 'INFO', 'BIZ', 'CO', 'AU', 'STOCK', 'SHARE', 'URL', 'HTTP', 'HTTPS', 'FINANCE', 'YAHOO', 'GOOGLE', 'TRADING', 'ECONOMICS'];

                let match;
                while ((match = pattern.exec(url)) !== null) {
                    const candidate = (match[2] || match[1]).toUpperCase();
                    if (!exclusions.includes(candidate)) {
                        detectedCode = candidate;
                        break;
                    }
                }
            }

            // 3. Apply Generalization
            let generalized = false;

            // SPECIAL CASE: Investing.com Search Force
            // This site is too inconsistent for slugs, so we force the search relay.
            if (url.includes('investing.com')) {
                url = 'https://au.investing.com/search?q=${code}';
                generalized = true;
            }
            // SPECIAL CASE: Listcorp Redundancy Stripping
            // If it's Listcorp and we have /asx/code/name, just strip the name entirely as /asx/code is superior
            else if (url.includes('listcorp.com') && (detectedCode || detectedLowerCode)) {
                const code = (detectedCode || detectedLowerCode).toLowerCase();
                url = url.replace(new RegExp(`\/asx\/${code}\/([a-z0-9-]+)`, 'i'), `/asx/\${code_lower}`);
                url = url.replace(new RegExp(`\/asx\/${code}`, 'i'), `/asx/\${code_lower}`);
                generalized = true;
            } else {
                if (detectedSlug) {
                    url = url.replace(new RegExp(detectedSlug, 'gi'), '${name_slug}');
                    name = name.replace(new RegExp(detectedSlug, 'gi'), '${name_slug}');
                    generalized = true;
                }
            }

            // Standard placeholders
            if (detectedCode) {
                const escapedCode = detectedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const replaceRegex = new RegExp(`([\\/.:=\\-?&]|^)${escapedCode}(?=[\\/.:=\\-?&]|$)`, 'gi');
                if (replaceRegex.test(url)) {
                    url = url.replace(replaceRegex, (match, p1) => p1 ? `${p1}\${code}` : `\${code}`);
                } else {
                    url = url.replace(new RegExp(escapedCode, 'gi'), '${code}');
                }
                name = name.replace(new RegExp(escapedCode, 'gi'), '${code}');
                generalized = true;
            } else if (detectedLowerCode && !generalized) {
                url = url.replace(new RegExp(detectedLowerCode, 'g'), '${code_lower}');
                name = name.replace(new RegExp(detectedLowerCode, 'g'), '${code_lower}');
                generalized = true;
            }

            if (generalized) {
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
    }

    static deleteLink(index) {
        if (!confirm('Remove this research link?')) return;

        const links = this.getResearchLinks();
        links.splice(index, 1);
        AppState.saveResearchLinks(links);
        this.render();
        ToastManager.show('Link removed', 'success');
    }
}
