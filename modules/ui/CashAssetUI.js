/**
 * CashAssetUI.js
 * Handles UI interactions for Cash & Assets management (Modals, Forms).
 */

import { CASH_CATEGORIES, CSS_CLASSES, IDS, UI_ICONS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

export class CashAssetUI {
    constructor() {
        this.modalId = IDS.CASH_ASSET_MODAL;
        this.selectedCategory = 'cash'; // Default
        this.customColors = [
            '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
            '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
            '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800',
            '#FF5722', '#795548', '#9E9E9E', '#607D8B'
        ];
    }

    /**
     * Shows a modal to Add or Edit a cash asset.
     * @param {Object|null} asset - The asset to edit, or null for creating new.
     * @param {Function} onSave - Callback(formData) -> void
     * @param {Function} [onDelete] - Callback() -> void
     */
    showAddEditModal(asset = null, onSave, onDelete) {
        const isEdit = !!asset;
        const title = isEdit ? 'Edit Asset' : 'Add Cash Asset';

        // Initialize category
        this.selectedCategory = asset ? asset.category : 'cash';

        // 2. Build Category List (System + User Custom)
        const categories = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])];

        const currentLabel = categories.find(c => c.id === this.selectedCategory)?.label || 'Cash';

        // Ensure comments is an array from the start
        let comments = [];
        if (asset) {
            if (Array.isArray(asset.comments)) {
                comments = asset.comments;
            } else if (typeof asset.comments === 'string' && asset.comments.trim() !== '') {
                comments = [{ text: asset.comments }];
            } else if (typeof asset.comments === 'object' && asset.comments !== null) {
                comments = [asset.comments];
                if (asset.comments.text) comments = [{ text: asset.comments.text }];
            }
        }

        // Remove existing if any
        const existing = document.getElementById(this.modalId);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        // Custom Dropdown HTML
        const dropdownHtml = `
            <div class="${CSS_CLASSES.CUSTOM_DROPDOWN} relative" id="${IDS.CASH_CATEGORY_DROPDOWN}" style="margin-bottom: 20px;">
                <button type="button" class="${CSS_CLASSES.STANDARD_INPUT} ${CSS_CLASSES.CASH_DROPDOWN_TRIGGER}" id="${IDS.CATEGORY_TRIGGER}">
                    <span id="${IDS.CATEGORY_LABEL_TEXT}">${currentLabel}</span>
                    <i class="fas ${UI_ICONS.CHEVRON_DOWN}"></i>
                </button>
                <div class="${CSS_CLASSES.DROPDOWN_OPTIONS} ${CSS_CLASSES.HIDDEN} absolute w-full z-10" id="${IDS.CATEGORY_OPTIONS}" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 0; top: 100%; margin-top: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                    ${categories.map(c => `
                        <div class="${CSS_CLASSES.DROPDOWN_OPTION} px-3 py-2 cursor-pointer hover:text-[var(--accent-color)]" data-value="${c.id}" style="padding: 10px; transition: color 0.1s;">
                            ${c.label}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}">
                <!-- Header -->
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">${title}</h2>
                    </div>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                        ${isEdit ? `
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.DELETE_BTN}" title="Delete">
                            <i class="fas ${UI_ICONS.DELETE}"></i>
                        </button>` : ''}
                        
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.SAVE_BTN}" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                        
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <!-- Body -->
                <div class="${CSS_CLASSES.MODAL_BODY}">
                    <div class="${CSS_CLASSES.FORM_CONTAINER}">
                        
                        <!-- Stacked Fields: Custom Dropdown -->
                        <div class="${CSS_CLASSES.FORM_GROUP} stacked">
                            <label class="${CSS_CLASSES.INPUT_LABEL}">Category</label>
                            ${dropdownHtml}
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP} stacked ${this.selectedCategory === 'other' ? '' : CSS_CLASSES.HIDDEN}" id="custom-category-group">
                            <label for="custom-category-name" class="${CSS_CLASSES.INPUT_LABEL}">New Category Name</label>
                            <input type="text" id="custom-category-name" class="${CSS_CLASSES.STANDARD_INPUT}" placeholder="e.g. Savings Goal">
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP} stacked">
                            <label for="${IDS.ASSET_NAME}" class="${CSS_CLASSES.INPUT_LABEL}">Asset Name</label>
                            <input type="text" id="${IDS.ASSET_NAME}" class="${CSS_CLASSES.STANDARD_INPUT}" value="${asset ? asset.name : ''}" placeholder="e.g. High Interest Savings">
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP} stacked">
                            <label for="${IDS.ASSET_BALANCE}" class="${CSS_CLASSES.INPUT_LABEL}">Balance ($)</label>
                            <input type="number" id="${IDS.ASSET_BALANCE}" class="${CSS_CLASSES.STANDARD_INPUT}" value="${asset ? asset.balance : ''}" placeholder="0.00" step="0.01">
                        </div>

                        <!-- Dynamic Comments Section -->
                        <div class="${CSS_CLASSES.FORM_GROUP} stacked">
                             <label class="${CSS_CLASSES.INPUT_LABEL} mb-2">Comments</label>
                             <div class="${CSS_CLASSES.NOTES_DARK_BG}" style="background: transparent; padding: 0;">
                                 <div id="${IDS.COMMENTS_LIST_CONTAINER}" class="flex flex-col gap-2">
                                    <!-- Comments Injected Here -->
                                 </div>
                                 <div class="${CSS_CLASSES.NOTES_FOOTER}" style="padding: 8px 0;">
                                    <button type="button" id="${IDS.BTN_ADD_COMMENT}" class="${CSS_CLASSES.BTN_TEXT_SMALL}" title="Add Comment" style="font-size: 1rem;">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById(IDS.MODAL_CONTAINER)?.appendChild(modal);

        /* --- Wiring Custom Dropdown --- */
        const trigger = modal.querySelector(`#${IDS.CATEGORY_TRIGGER}`);
        const optionsList = modal.querySelector(`#${IDS.CATEGORY_OPTIONS}`);
        const labelText = modal.querySelector(`#${IDS.CATEGORY_LABEL_TEXT}`);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            optionsList.classList.toggle(CSS_CLASSES.HIDDEN);
        });

        // Close dropdown when clicking outside
        modal.addEventListener('click', (e) => {
            if (!trigger.contains(e.target) && !optionsList.contains(e.target)) {
                optionsList.classList.add(CSS_CLASSES.HIDDEN);
            }
        });

        // Option Selection
        optionsList.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_OPTION}`).forEach(opt => {
            opt.addEventListener('click', (e) => {
                const val = e.target.dataset.value;
                const lab = e.target.textContent.trim();
                this.selectedCategory = val;
                labelText.textContent = lab;
                optionsList.classList.add(CSS_CLASSES.HIDDEN);

                // Show/Hide Custom Input
                const customGroup = modal.querySelector('#custom-category-group');
                if (val === 'other') {
                    customGroup.classList.remove(CSS_CLASSES.HIDDEN);
                    modal.querySelector('#custom-category-name').focus();
                } else {
                    customGroup.classList.add(CSS_CLASSES.HIDDEN);
                }
            });
            // Apply Manual Hover Logic via JS style if CSS fails? 
            // CSS classes added above: hover:text-[var(--accent-color)]
            // We need to ensure text color changes on hover without background.
            opt.onmouseenter = () => {
                opt.style.color = 'var(--accent-color)';
                opt.style.background = 'transparent'; // Ensure no blue bg
            };
            opt.onmouseleave = () => {
                opt.style.color = ''; // Reset
                opt.style.background = 'transparent';
            };
        });


        /* --- Comments Logic (Preserved) --- */
        // Render Initial Comments
        const commentsContainer = modal.querySelector(`#${IDS.COMMENTS_LIST_CONTAINER}`);
        const renderComment = (text = '') => {
            const row = document.createElement('div');
            // Relative container for absolute X positioning
            row.className = `${CSS_CLASSES.COMMENT_ROW} relative`;
            row.style.position = 'relative';
            row.style.marginBottom = '10px';

            row.innerHTML = `
                <textarea class="${CSS_CLASSES.STANDARD_TEXTAREA} ${CSS_CLASSES.COMMENT_INPUT} ${CSS_CLASSES.W_FULL}" rows="2" placeholder="Note..." style="width: 100%; padding-right: 35px; box-sizing: border-box;">${text}</textarea>
                <button type="button" class="${CSS_CLASSES.ICON_BTN_GHOST} ${CSS_CLASSES.DELETE_COMMENT_BTN}" style="position: absolute; top: 8px; right: 8px; color: var(--accent-color); opacity: 1; border: none; background: transparent; cursor: pointer;">
                    <i class="fas ${UI_ICONS.CLOSE}"></i>
                </button>
            `;

            // Delete Listener
            row.querySelector(`.${CSS_CLASSES.DELETE_COMMENT_BTN}`).addEventListener('click', () => row.remove());
            commentsContainer.appendChild(row);
        };

        // Populate existing
        comments.forEach(c => renderComment((typeof c === 'string') ? c : (c.text || '')));

        // Add Button Listener
        const addBtn = modal.querySelector(`#${IDS.BTN_ADD_COMMENT}`);
        if (addBtn) {
            addBtn.addEventListener('click', () => renderComment());
        }

        // Events
        const close = () => {
            modal.classList.add(CSS_CLASSES.HIDDEN);
            setTimeout(() => modal.remove(), 300);

            // Remove from history stack if closed manually
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        // Register with NavigationManager
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                close();
            }
        });

        const save = () => {
            const formData = this.gatherFormData(modal);
            if (formData && onSave) {
                onSave(formData);
                close();
            }
        };

        const del = () => {
            if (onDelete) {
                onDelete();
                close();
            }
        };

        modal.querySelectorAll(`.${CSS_CLASSES.MODAL_CLOSE_BTN}, .${CSS_CLASSES.MODAL_OVERLAY}`).forEach(el => el.addEventListener('click', close));
        modal.querySelector(`.${CSS_CLASSES.SAVE_BTN}`).addEventListener('click', save);

        const deleteBtn = modal.querySelector(`.${CSS_CLASSES.DELETE_BTN}`);
        if (deleteBtn) deleteBtn.addEventListener('click', del);

        requestAnimationFrame(() => modal.classList.remove(CSS_CLASSES.HIDDEN));
    }

    /**
     * Extracts data from the modal form.
     * @param {HTMLElement} modal 
     * @returns {Object|null}
     */
    gatherFormData(modal) {
        const nameInput = modal.querySelector(`#${IDS.ASSET_NAME}`);
        const balanceInput = modal.querySelector(`#${IDS.ASSET_BALANCE}`);
        // Category comes from this.selectedCategory now

        const name = nameInput.value.trim();
        const balance = parseFloat(balanceInput.value);
        let category = this.selectedCategory;

        // Handle Custom Category Creation
        if (category === 'other') {
            const customInput = modal.querySelector('#custom-category-name');
            const customName = customInput.value.trim();
            if (customName) {
                const categoryId = 'user_' + customName.toLowerCase().replace(/[^a-z0-9]/g, '_');

                // Check if already exists
                const existingCat = AppState.preferences.userCategories?.find(c => c.id === categoryId);
                if (!existingCat) {
                    // Pick a color from pool that isn't already used
                    const usedColors = (AppState.preferences.userCategories || []).map(c => c.color);
                    let color = this.customColors.find(c => !usedColors.includes(c));

                    if (!color) {
                        // All unique colors taken, fallback to index-based rotation
                        const existingLen = AppState.preferences.userCategories.length;
                        color = this.customColors[existingLen % this.customColors.length];
                    }

                    const newCat = { id: categoryId, label: customName, color: color };
                    AppState.saveUserCategory(newCat);
                    category = categoryId;
                } else {
                    category = existingCat.id;
                }
            }
        }

        // Gather Comments Array
        const comments = [];
        modal.querySelectorAll(`.${CSS_CLASSES.COMMENT_INPUT}`).forEach(input => {
            const text = input.value.trim();
            if (text) {
                comments.push({
                    text: text,
                    date: new Date().toISOString()
                });
            }
        });

        if (!name) {
            ToastManager.error('Please enter an asset name.');
            return null;
        }
        if (isNaN(balance)) {
            ToastManager.error('Please enter a valid balance.');
            return null;
        }

        return { name, balance, category, comments };
    }
}
