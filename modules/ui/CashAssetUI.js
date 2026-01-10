/**
 * CashAssetUI.js
 * Handles UI interactions for Cash & Assets management (Modals, Forms).
 */

import { CASH_CATEGORIES, CSS_CLASSES, IDS, UI_ICONS, ASSET_CUSTOM_COLORS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

export class CashAssetUI {
    constructor() {
        this.modalId = IDS.CASH_ASSET_MODAL;
        this.selectedCategory = 'cash'; // Default
        this.customColors = ASSET_CUSTOM_COLORS;
    }

    /**
     * Helper: Pick a color for a new/editing asset.
     * Logic:
     * 1. If name matches existing 'Other' asset, use that color.
     * 2. Else, pick a color NOT used by any visible asset.
     * 3. Fallback to random from pool.
     */
    _pickInitialColor(name, currentAssetId, currentCategory) {
        // 1. Check User Preferences (Category-First / Overrides)
        if (currentCategory) {
            const userCat = AppState.preferences.userCategories?.find(c => c.id === currentCategory);
            if (userCat && userCat.color) {
                console.log(`[CashAssetUI] _pickInitialColor: Using Theme Color for ${currentCategory} -> ${userCat.color}`);
                return userCat.color;
            }
        }

        // Standard categories that HAVEN'T been overridden return null 
        // to use CSS variable defaults in _getPreviewColor
        const isStandard = !currentCategory || currentCategory === 'cash' || currentCategory === 'cash_in_bank' ||
            currentCategory === 'term_deposit' || currentCategory === 'property' ||
            currentCategory === 'crypto' || currentCategory === 'shares' ||
            currentCategory === 'super' || currentCategory === 'personal';

        if (isStandard && currentCategory !== 'other') return null;

        const allAssets = AppState.data.cash || [];

        // 2. Match Name (Case Insensitive)
        // If we have another asset with the same name, we use its color to keep things unified.
        if (name) {
            const match = allAssets.find(a =>
                (a.category === 'other' || a.category?.startsWith('user_')) &&
                a.name.toLowerCase() === name.toLowerCase() &&
                a.id !== currentAssetId &&
                a.color
            );
            if (match) {
                console.log(`[CashAssetUI] _pickInitialColor: Matched Name '${name}' -> ${match.color}`);
                return match.color;
            }
        }

        // 3. Find Unused Color
        const usedColors = new Set(allAssets.filter(a => a.id !== currentAssetId && a.color).map(a => a.color));
        const available = this.customColors.filter(c => !usedColors.has(c));

        if (available.length > 0) {
            const picked = available[Math.floor(Math.random() * available.length)];
            console.log(`[CashAssetUI] _pickInitialColor: Picked Unused -> ${picked}`);
            return picked;
        }

        // 4. Fallback: Random from full pool
        const fallback = this.customColors[Math.floor(Math.random() * this.customColors.length)];
        console.log(`[CashAssetUI] _pickInitialColor: Fallback Random -> ${fallback}`);
        return fallback;
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

        // CRITICAL FIX: Initialize dataset with existing color or category theme
        // This ensures the header preview is correct and theme persistence is maintained from the moment the modal opens.
        const startColor = (asset && (asset.category === 'other' || asset.category.startsWith('user_')) && asset.color)
            ? asset.color
            : this._pickInitialColor(asset ? asset.name : '', asset ? asset.id : null, this.selectedCategory);

        if (startColor) {
            modal.dataset.selectedColor = startColor;
        }

        const renderOptions = (optionsList, currentLabelTarget) => {
            const listContainer = optionsList.querySelector('#category-options-list');
            if (!listContainer) return;

            const currentCategories = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])];

            listContainer.innerHTML = currentCategories.map(c => {
                const isUserCat = c.id.startsWith('user_');
                return `
                    <div class="${CSS_CLASSES.DROPDOWN_OPTION} flex justify-between items-center px-3 py-2 cursor-pointer hover:text-[var(--accent-color)]" data-value="${c.id}" style="padding: 10px; transition: color 0.1s;">
                        <span>${c.label}</span>
                        ${isUserCat ? `
                            <button type="button" class="category-delete-btn ${CSS_CLASSES.ICON_BTN_GHOST}" data-id="${c.id}" style="padding: 4px; color: var(--accent-color); margin-left: 10px;">
                                <i class="fas ${UI_ICONS.CLOSE}" style="font-size: 0.8rem;"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');

            // Option Selection
            listContainer.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_OPTION}`).forEach(opt => {
                opt.addEventListener('click', (e) => {
                    // If click was on delete button, handle it separately
                    if (e.target.closest('.category-delete-btn')) {
                        e.stopPropagation();
                        const catId = e.target.closest('.category-delete-btn').dataset.id;
                        if (confirm(`Delete category "${opt.querySelector('span').textContent}"?`)) {
                            AppState.deleteUserCategory(catId);
                            // If we were selecting this category, revert to 'cash'
                            if (this.selectedCategory === catId) {
                                this.selectedCategory = 'cash';
                                currentLabelTarget.textContent = 'Cash';
                            }
                            renderOptions(optionsList, currentLabelTarget);
                        }
                        return;
                    }

                    const originalVal = opt.dataset.value;
                    const val = String(originalVal).toLowerCase();
                    const lab = opt.querySelector('span').textContent.trim();

                    this.selectedCategory = val;
                    modal.dataset.selectedCategory = val; // Source of Truth for gatherFormData

                    currentLabelTarget.textContent = lab;
                    optionsList.classList.add(CSS_CLASSES.HIDDEN);

                    // Show/Hide Custom Input AND Shuffle Button
                    const customGroup = modal.querySelector('#custom-category-group');
                    // Show Shuffle Button for EVERY category
                    const shuffleBtn = modal.querySelector('#btn-shuffle-colors-main');
                    shuffleBtn.classList.remove(CSS_CLASSES.HIDDEN);
                    const currentName = modal.querySelector('#asset-name')?.value || '';

                    // ALWAYS re-sync color when category changes to ensure Theme persistence
                    const initialColor = this._pickInitialColor(currentName, (asset ? asset.id : null), val);
                    if (initialColor) {
                        modal.dataset.selectedColor = initialColor;
                        console.log(`[CashAssetUI] Dropdown: Synced Theme Color for ${val} -> ${initialColor}`);
                    } else if (!modal.dataset.selectedColor) {
                        // For standard categories that haven't been re-themed, we might not have a hex yet.
                        // _getPreviewColor will handle the CSS variable fallback, but if we want to SHUFFLE,
                        // we need a starting point. Let's not force one unless they click shuffle.
                        // But let's clear the dataset so the variable fallback works.
                        delete modal.dataset.selectedColor;
                    }

                    if (val === 'other') {
                        customGroup.classList.remove(CSS_CLASSES.HIDDEN);
                        modal.querySelector('#custom-category-name').focus();
                    } else {
                        customGroup.classList.add(CSS_CLASSES.HIDDEN);
                    }

                    // LIVE COLOR UPDATE
                    this._updateModalHeaderColor(modal);
                });

                opt.onmouseenter = () => {
                    opt.style.color = 'var(--accent-color)';
                    opt.style.background = 'transparent';
                };
                opt.onmouseleave = () => {
                    opt.style.color = '';
                    opt.style.background = 'transparent';
                };
            });
        };

        const dropdownHtml = `
            <div class="${CSS_CLASSES.CUSTOM_DROPDOWN} relative" id="${IDS.CASH_CATEGORY_DROPDOWN}" style="margin-bottom: 20px;">
                <button type="button" class="${CSS_CLASSES.STANDARD_INPUT} ${CSS_CLASSES.CASH_DROPDOWN_TRIGGER}" id="${IDS.CATEGORY_TRIGGER}">
                    <span id="${IDS.CATEGORY_LABEL_TEXT}">${currentLabel}</span>
                    <i class="fas ${UI_ICONS.CHEVRON_DOWN}"></i>
                </button>
                <div class="${CSS_CLASSES.DROPDOWN_OPTIONS} ${CSS_CLASSES.HIDDEN} absolute w-full z-10" id="${IDS.CATEGORY_OPTIONS}" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 0; top: 100%; margin-top: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                    <div id="category-options-list" style="max-height: 250px; overflow-y: auto;"></div>
                    <div class="dropdown-footer flex justify-between p-2 border-t border-[var(--border-color)]" style="background: var(--card-bg-light);">
                        <button type="button" id="btn-clear-categories" class="${CSS_CLASSES.BTN_TEXT_SMALL} hover:text-red-500" style="font-size: 0.75rem; opacity: 0.7;">
                            Clear All
                        </button>
                    </div>
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
                            <div class="flex justify-between items-center mb-1">
                                <label for="${IDS.ASSET_NAME}" class="${CSS_CLASSES.INPUT_LABEL}">Asset Name</label>
                                <button type="button" id="btn-shuffle-colors-main" class="${CSS_CLASSES.ICON_BTN_GHOST}" title="Change Color Theme" style="font-size: 0.9rem; color: var(--text-muted);">
                                    <i class="fas fa-random"></i>
                                </button>
                            </div>
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

        // Initial Options Render
        renderOptions(optionsList, labelText);

        // Initial Options Render
        renderOptions(optionsList, labelText);

        // Wiring Footer Buttons
        modal.querySelector('#btn-clear-categories').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Clear ALL custom categories? This cannot be undone.')) {
                AppState.clearAllUserCategories();
                this.selectedCategory = 'cash';
                labelText.textContent = 'Cash';
                renderOptions(optionsList, labelText);
            }
        });

        // Initial Color Setup
        if (asset && asset.color) {
            modal.dataset.selectedColor = asset.color;
        } else {
            // Calculate initial color
            const initialName = asset ? asset.name : '';
            const initialColor = this._pickInitialColor(initialName, asset ? asset.id : null, this.selectedCategory);
            if (initialColor) modal.dataset.selectedColor = initialColor;
        }

        modal.querySelector('#btn-shuffle-colors-main').addEventListener('click', (e) => {
            e.stopPropagation();
            // Pick a NEW color that is NOT the current one
            const current = modal.dataset.selectedColor;
            const available = this.customColors.filter(c => c !== current);
            const next = available[Math.floor(Math.random() * available.length)];

            modal.dataset.selectedColor = next;
            this._updateModalHeaderColor(modal);
            ToastManager.info('Theme Changed');
        });

        // Set Initial Color (so they see the current state)
        this._updateModalHeaderColor(modal);


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

        const name = nameInput.value.trim();
        const balance = parseFloat(balanceInput.value);

        // 1. Resolve Category (Normalize)
        let rawCategory = modal.dataset.selectedCategory || this.selectedCategory;
        let category = String(rawCategory || 'cash').toLowerCase();

        // 2. Resolve Color (Early)
        let color = modal.dataset.selectedColor;

        // Persist the explicit color for 'Other', Custom, or re-themed Standard categories
        if (!color) {
            color = modal.dataset.selectedColor || this._pickInitialColor(name, null, category);
        }

        if (color) {
            console.log(`[CashAssetUI] Saving Asset: ${name}, Category: ${category}, Color: ${color}`);
        }  // 3. Handle Custom Category Creation
        if (category === 'other') {
            const customInput = modal.querySelector('#custom-category-name');
            const customName = customInput.value.trim();

            if (customName) {
                const categoryId = 'user_' + customName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                console.log(`[CashAssetUI] Creating Custom Category: "${customName}" -> ID: ${categoryId}`);

                const existingCat = AppState.preferences.userCategories?.find(c => c.id === categoryId);
                if (!existingCat) {
                    const newCat = { id: categoryId, label: customName, color: color || this.customColors[0] };
                    AppState.saveUserCategory(newCat);
                    category = categoryId;
                } else {
                    category = existingCat.id;
                    // If we have a color selected, update the existing category color too
                    if (color && existingCat.color !== color) {
                        AppState.saveUserCategory({ ...existingCat, color: color });
                    }
                }
            }
        } else {
            // Check if this is a standard category or custom category
            // We want to sync the color theme to the registry regardless
            const existingCat = AppState.preferences.userCategories?.find(c => c.id === category);
            if (existingCat) {
                if (color && existingCat.color !== color) {
                    console.log(`[CashAssetUI] Syncing color ${color} to established category ${category}`);
                    AppState.saveUserCategory({ ...existingCat, color: color });
                }
            } else if (color) {
                // It's a standard category being re-themed for the first time
                // We add it to userCategories as an "Override"
                const allCats = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])];
                const label = allCats.find(c => c.id === category)?.label || category;
                console.log(`[CashAssetUI] Creating Theme Override for Standard category: ${category} -> ${color}`);
                AppState.saveUserCategory({ id: category, label: label, color: color });
            }
        }

        // 4. Gather Comments
        const comments = [];
        modal.querySelectorAll(`.${CSS_CLASSES.COMMENT_INPUT}`).forEach(input => {
            const text = input.value.trim();
            if (text) comments.push({ text: text, date: new Date().toISOString() });
        });

        // 5. Validation
        if (!name) { ToastManager.error('Please enter an asset name.'); return null; }
        if (isNaN(balance)) { ToastManager.error('Please enter a valid balance.'); return null; }

        // 6. Final Payload
        const payload = { name, balance, category, comments, color };
        console.log(`[CashAssetUI] gatherFormData: EXIT -> Payload Color: ${payload.color}`);
        return payload;
    }

    /**
     * Determines the preview color based on current modal state.
     * @returns {String} CSS Color Value
     */
    _getPreviewColor(modal) {
        const catId = this.selectedCategory;

        // 1. ALWAYS PRIORITIZE ACTIVE SELECTION (Dataset)
        // This ensures Shuffling or Category Switching shows immediate results
        if (modal.dataset.selectedColor) {
            return modal.dataset.selectedColor;
        }

        // 2. Fallback to existing custom category color
        const userCat = AppState.preferences.userCategories?.find(c => c.id === catId);
        if (userCat && userCat.color) return userCat.color;

        // 3. Standard Colors
        const standardColors = {
            'cash': 'var(--asset-cash)',
            'cash_in_bank': 'var(--asset-cash-in-bank)',
            'term_deposit': 'var(--asset-term-deposit)',
            'property': 'var(--asset-property)',
            'crypto': 'var(--asset-crypto)',
            'shares': 'var(--asset-shares)',
            'super': 'var(--asset-super)',
            'personal': 'var(--asset-personal)',
            'other': 'var(--asset-other)'
        };

        return standardColors[catId] || 'var(--asset-other)';
    }

    /**
     * Updates the Modal Header background color to match the preview.
     */
    _updateModalHeaderColor(modal) {
        const header = modal.querySelector(`.${CSS_CLASSES.MODAL_HEADER}`);
        if (!header) return;

        const color = this._getPreviewColor(modal);

        // Apply color with a subtle gradient/shimmer
        header.style.background = color.startsWith('var')
            ? `linear-gradient(90deg, ${color}, rgba(0,0,0,0.1))`
            : `linear-gradient(90deg, ${color}, rgba(0,0,0,0.2))`;

        // Ensure contrast
        header.style.color = '#ffffff';
        header.style.textShadow = '0 1px 3px rgba(0,0,0,0.3)';
    }

    /**
     * Utility for name-based hashing (duplicates CashViewRenderer logic)
     */
    /**
     * Utility for name-based hashing (duplicates CashViewRenderer logic)
     */
    _getColorForString(str) {
        // If string is empty, use the seed itself as the hash base so "New Assets" also shuffle
        const seed = AppState.preferences?.colorSeed || 0;

        if (!str) {
            const index = Math.abs(seed) % ASSET_CUSTOM_COLORS.length;
            const c = ASSET_CUSTOM_COLORS[index];
            return c;
        }

        let hash = seed;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % ASSET_CUSTOM_COLORS.length;
        const c = ASSET_CUSTOM_COLORS[index];
        return c;
    }
}
