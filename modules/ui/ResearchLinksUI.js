import { AppState } from '../state/AppState.js';
import { IDS, CSS_CLASSES, UI_ICONS, RESEARCH_LINKS_TEMPLATE } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * Handles the custom research links management UI.
 */
export default class ResearchLinksUI {
    static init() {
        this.isEditMode = false;
        this._setupEventListeners();
    }

    static _setupEventListeners() {
        document.addEventListener('click', (e) => {
            const addBtn = e.target.closest(`#${IDS.ADD_RESEARCH_LINK_BTN}`);
            if (addBtn) {
                this.showAddLinkDialog();
            }

            const title = e.target.closest(`#${IDS.RESEARCH_LINKS_TITLE}`);
            if (title) {
                this.toggleManageMode();
            }

            const closeBtn = e.target.closest(`#${IDS.MODAL_RESEARCH_LINKS} .modal-close-btn`);
            if (closeBtn) {
                this.hide();
            }

            // Global delegate for actions
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn && actionBtn.closest(`#${IDS.MODAL_RESEARCH_LINKS}`)) {
                const action = actionBtn.dataset.action;
                const index = parseInt(actionBtn.dataset.index);
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
        const custom = AppState.preferences.researchLinks || [];
        if (custom.length > 0) return custom;
        return [...RESEARCH_LINKS_TEMPLATE];
    }

    static show(editMode = true) {
        const modal = document.getElementById(IDS.MODAL_RESEARCH_LINKS);
        if (!modal) return;

        this.isEditMode = editMode;
        this.render();

        modal.classList.add(CSS_CLASSES.SHOW);
        modal.classList.remove(CSS_CLASSES.HIDDEN);

        modal._navActive = true;
        navManager.pushState(() => {
            if (modal._navActive) {
                this.hide();
            }
        });
    }

    static hide() {
        const modal = document.getElementById(IDS.MODAL_RESEARCH_LINKS);
        if (modal) {
            modal.classList.add(CSS_CLASSES.HIDDEN);
            modal.classList.remove(CSS_CLASSES.SHOW);
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        }
    }

    static toggleManageMode() {
        this.isEditMode = !this.isEditMode;
        this.render();
    }

    static render() {
        const list = document.getElementById(IDS.RESEARCH_LINKS_LIST);
        if (!list) return;

        const links = this.getResearchLinks();
        const chevron = document.getElementById(IDS.RESEARCH_LINKS_CHEVRON);

        if (chevron) {
            chevron.style.transform = this.isEditMode ? 'rotate(180deg)' : 'rotate(0deg)';
        }

        if (this.isEditMode) {
            this._renderList(list, links);
        } else {
            this._renderGrid(list, links);
        }
    }

    static _renderGrid(container, links) {
        container.className = 'research-links-grid';
        if (links.length === 0) {
            container.innerHTML = `<div class="empty-state">No research links added yet.</div>`;
            return;
        }

        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try {
                const testUrl = link.url.replace(/\${code}/g, 'ASX');
                hostname = new URL(testUrl).hostname;
            } catch (e) { }

            const iconSrc = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            return `
                <div class="research-link-item" data-index="${index}">
                    <a href="${link.url.replace(/\${code}/g, 'CBA')}" target="_blank" rel="noopener noreferrer" class="research-link-btn">
                        <img src="${iconSrc}" class="link-favicon" alt="">
                        <div class="link-info-stack">
                            <span class="link-name">${link.displayName}</span>
                            <span class="link-desc">${link.description || ''}</span>
                        </div>
                    </a>
                </div>
            `;
        }).join('');
    }

    static _renderList(container, links) {
        container.className = 'research-manage-list';
        container.innerHTML = links.map((link, index) => {
            let hostname = '';
            try {
                const testUrl = link.url.replace(/\${code}/g, 'ASX');
                hostname = new URL(testUrl).hostname;
            } catch (e) { }
            const iconSrc = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

            return `
                <div class="research-manage-row" data-index="${index}" draggable="true">
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
        let draggedIndex = null;

        container.addEventListener('dragstart', (e) => {
            const row = e.target.closest('.research-manage-row');
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
            const row = e.target.closest('.research-manage-row');
            if (!row || draggedIndex === null) return;
            row.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
            const row = e.target.closest('.research-manage-row');
            if (row) row.classList.remove('drag-over');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const row = e.target.closest('.research-manage-row');
            if (!row || draggedIndex === null) return;

            const dropIndex = parseInt(row.dataset.index);
            if (draggedIndex !== dropIndex) {
                this._reorderLinks(draggedIndex, dropIndex);
            }
            draggedIndex = null;
        });

        container.addEventListener('dragend', (e) => {
            const rows = container.querySelectorAll('.research-manage-row');
            rows.forEach(r => r.classList.remove('dragging', 'drag-over'));
            draggedIndex = null;
        });
    }

    static _reorderLinks(from, to) {
        const links = this.getResearchLinks();
        const [moved] = links.splice(from, 1);
        links.splice(to, 0, moved);
        AppState.saveResearchLinks(links);
        this.render();
    }

    static async showAddLinkDialog(existingLink = null, editIndex = -1) {
        const name = prompt('Display Name:', existingLink ? existingLink.displayName : '');
        if (name === null) return;

        let url = prompt('URL (paste any ticker URL, we will generalize it):', existingLink ? existingLink.url : 'https://');
        if (url === null) return;

        if (!url.includes('${code}')) {
            const patterns = [
                /([\/.:=-])([A-Z]{3,4})(?=[\/.:=-]|$)/,
                /([A-Z]{3,4})(?=\.(?:AX|ASX))/
            ];

            let detectedCode = null;
            for (const pattern of patterns) {
                const match = pattern.exec(url);
                if (match) {
                    detectedCode = match[2] || match[1];
                    break;
                }
            }

            if (detectedCode) {
                url = url.replace(detectedCode, '${code}');
                ToastManager.show(`Generalized link for all stocks`, 'info');
            }
        }

        const desc = prompt('Description (max 50 chars):', existingLink ? existingLink.description : '');
        if (desc === null) return;

        const newLink = {
            displayName: name.trim() || 'Untitled',
            url: url.trim(),
            description: (desc || '').substring(0, 50).trim()
        };

        const links = this.getResearchLinks();
        if (editIndex >= 0) {
            links[editIndex] = newLink;
        } else {
            links.push(newLink);
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
