/**
 * CashAssetUI.js
 * Handles UI interactions for Cash & Assets management (Modals, Forms).
 */

import { CASH_CATEGORIES, CSS_CLASSES, IDS, UI_ICONS, ASSET_CUSTOM_COLORS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { KeyboardModalHandler } from '../utils/KeyboardModalHandler.js';

export class CashAssetUI {
    constructor() {
        this.modalId = IDS.CASH_ASSET_MODAL;
        this.selectedCategory = 'cash'; // Default
        this.customColors = ASSET_CUSTOM_COLORS;
    }

    /**
     * Helper: Get all colors currently in use across categories.
     * Returns a Map of Color (lowercase) -> { id: CategoryID, label: CategoryLabel }
     */
    _getUsedColors(excludeCategoryId = null) {
        const usedMap = new Map();
        const normExclude = (excludeCategoryId || '').toLowerCase().trim();

        // 1. Scan Category Themes (Registry) - ABSOLUTE SOURCE OF TRUTH
        const themedCategories = new Set();
        (AppState.preferences.userCategories || []).forEach(c => {
            if (c.id) {
                const normId = c.id.toLowerCase().trim();
                if (c.color) {
                    const colorVal = c.color.toLowerCase().trim();
                    themedCategories.add(normId);
                    if (normId !== normExclude) {
                        usedMap.set(colorVal, { id: c.id, label: c.label || c.id });
                    }
                }
            }
        });

        // 2. Scan Assets (Fallback for categories without themes)
        (AppState.data.cash || []).forEach(a => {
            if (a.color && a.category) {
                const normId = a.category.toLowerCase().trim();

                // Only consider asset color if the category DOES NOT have a global theme
                // and it's not the category we are currently editing
                if (!themedCategories.has(normId) && normId !== normExclude) {
                    const colorVal = a.color.toLowerCase().trim();
                    if (!usedMap.has(colorVal)) {
                        const catObj = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])].find(c => c.id === a.category);
                        usedMap.set(colorVal, { id: a.category, label: catObj?.label || a.category });
                    }
                }
            }
        });

        // 3. Scan Standard Fallback Colors for active categories without themes
        const activeCategoryIds = new Set((AppState.data.cash || []).map(a => a.category).filter(Boolean));
        const standardColors = {
            'cash': '#4db8ff', 'cash_in_bank': '#3399ff', 'term_deposit': '#0066cc',
            'property': '#ff9933', 'crypto': '#ffcc00', 'shares': '#a49393',
            'super': '#9933ff', 'personal': '#ff3399', 'other': '#808080'
        };

        for (const [id, color] of Object.entries(standardColors)) {
            const normId = id.toLowerCase().trim();
            if (activeCategoryIds.has(id) && !themedCategories.has(normId) && normId !== normExclude) {
                const colorVal = color.toLowerCase().trim();
                if (!usedMap.has(colorVal)) {
                    const catObj = CASH_CATEGORIES.find(c => c.id === id);
                    usedMap.set(colorVal, { id, label: catObj?.label || id });
                }
            }
        }

        return usedMap;
    }

    /**
     * Helper: Pick a color for a new/editing asset.
     */
    _pickInitialColor(name, currentAssetId, currentCategory) {
        let resolvedCategoryId = currentCategory;
        const customInput = document.getElementById('custom-category-name');
        if (currentCategory === 'other' && customInput && customInput.value.trim()) {
            resolvedCategoryId = 'user_' + customInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        }

        // 1. Check if category already has a theme
        const userCat = (AppState.preferences.userCategories || []).find(c => c && c.id === resolvedCategoryId);
        if (userCat && userCat.color) return userCat.color;

        // 2. Find first available unique color
        const usedMap = this._getUsedColors(resolvedCategoryId);
        const available = this.customColors.filter(c => !usedMap.has(c.toLowerCase().trim()));

        if (available.length > 0) {
            // Deterministic selection based on name to keep it stable
            const seedStr = (name || '') + resolvedCategoryId;
            let seed = 0;
            for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
            return available[seed % available.length];
        }

        return this.customColors[0];
    }

    /**
     * Helper: Merge system and user categories while removing duplicates by ID.
     */
    _getMergedCategories() {
        const systemCats = (CASH_CATEGORIES || []).filter(c => c && c.id);
        const userCats = (AppState.preferences.userCategories || []).filter(c => c && c.id);
        const categoryMap = new Map();

        systemCats.forEach(cat => categoryMap.set(cat.id, { ...cat }));
        userCats.forEach(cat => {
            if (categoryMap.has(cat.id)) {
                const existing = categoryMap.get(cat.id);
                categoryMap.set(cat.id, { ...existing, ...cat, label: existing.label || cat.label });
            } else {
                categoryMap.set(cat.id, { ...cat });
            }
        });

        return Array.from(categoryMap.values());
    }

    /**
     * Shows a modal to Add or Edit a cash asset.
     */
    showAddEditModal(asset = null, onSave, onDelete) {
        const isEdit = !!asset;
        const title = isEdit ? 'Edit Asset' : 'Add Cash Asset';

        this.selectedCategory = asset ? asset.category : 'cash';

        const categories = this._getMergedCategories();
        const currentLabel = categories.find(c => c.id === this.selectedCategory)?.label || 'Cash';

        let comments = [];
        if (asset && asset.comments) {
            comments = Array.isArray(asset.comments) ? asset.comments : [{ text: asset.comments }];
        }

        const existing = document.getElementById(this.modalId);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        const startColor = asset ? (asset.color || this._pickInitialColor(asset.name, asset.id, this.selectedCategory)) : this._pickInitialColor('', null, 'cash');
        modal.dataset.selectedColor = startColor;
        modal.dataset.selectedCategory = this.selectedCategory;
        if (isEdit) modal.dataset.editingAssetId = asset.id;

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
            <div class="${CSS_CLASSES.MODAL_CONTENT}" style="height: 85vh; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden !important; gap: 0 !important;">
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="flex-shrink: 0;">
                    <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">${title}</h2>
                    </div>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                        ${isEdit ? `<button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.DELETE_BTN}" title="Delete"><i class="fas ${UI_ICONS.DELETE}"></i></button>` : ''}
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.SAVE_BTN}" title="Save"><i class="fas fa-check"></i></button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                    </div>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div class="${CSS_CLASSES.FORM_CONTAINER}">
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
                                <button type="button" id="btn-toggle-color-picker" class="${CSS_CLASSES.BTN_TEXT_SMALL}" style="font-size: 0.8rem; color: var(--color-accent);">Select Color</button>
                            </div>
                            <div id="color-picker-container" class="${CSS_CLASSES.HIDDEN} mb-3 p-3 bg-[var(--card-bg-light)] rounded border border-[var(--border-color)]">
                                <div class="flex justify-between items-center mb-2">
                                    <div class="text-xs text-muted">Category Color Palette</div>
                                    <button type="button" id="btn-reset-category-color" class="${CSS_CLASSES.BTN_TEXT_SMALL} hidden" style="font-size: 0.7rem;">Reset</button>
                                </div>
                                <div id="color-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 10px;"></div>
                            </div>
                            <input type="text" id="${IDS.ASSET_NAME}" class="${CSS_CLASSES.STANDARD_INPUT}" value="${asset ? asset.name : ''}" placeholder="e.g. High Interest Savings">
                        </div>
                        <div class="${CSS_CLASSES.FORM_GROUP} stacked">
                            <label for="${IDS.ASSET_BALANCE}" class="${CSS_CLASSES.INPUT_LABEL}">Balance ($)</label>
                            <input type="number" id="${IDS.ASSET_BALANCE}" class="${CSS_CLASSES.STANDARD_INPUT}" value="${asset ? asset.balance : ''}" placeholder="0.00" step="0.01">
                        </div>
                        <div class="${CSS_CLASSES.FORM_GROUP} stacked">
                             <label class="${CSS_CLASSES.INPUT_LABEL} mb-2">Comments</label>
                             <div id="${IDS.COMMENTS_LIST_CONTAINER}" class="flex flex-col gap-2"></div>
                             <div style="padding: 8px 0;"><button type="button" id="${IDS.BTN_ADD_COMMENT}" class="${CSS_CLASSES.BTN_TEXT_SMALL}" style="font-size: 1rem;"><i class="fas fa-plus"></i></button></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById(IDS.MODAL_CONTAINER)?.appendChild(modal);

        const togglePickerBtn = modal.querySelector('#btn-toggle-color-picker');
        const pickerContainer = modal.querySelector('#color-picker-container');
        const colorGrid = modal.querySelector('#color-grid');
        const resetColorBtn = modal.querySelector('#btn-reset-category-color');

        const renderPicker = () => {
            let currentCategoryId = this.selectedCategory;
            const customInput = modal.querySelector('#custom-category-name');
            if (currentCategoryId === 'other' && customInput && customInput.value.trim()) {
                currentCategoryId = 'user_' + customInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
            }

            // Usage Map: Color -> { id, label }
            const usedMap = this._getUsedColors(currentCategoryId);
            const selectedColor = modal.dataset.selectedColor;

            const hasOverride = AppState.preferences.userCategories?.some(c => c.id === currentCategoryId && c.color);
            resetColorBtn.classList.toggle('hidden', !hasOverride);

            colorGrid.innerHTML = this.customColors.map(c => {
                const isTaken = usedMap.has(c.toLowerCase().trim());
                const isSelected = selectedColor?.toLowerCase().trim() === c.toLowerCase().trim();
                const sourceCat = isTaken ? usedMap.get(c.toLowerCase().trim()) : null;

                return `
                    <div class="color-swatch-item ${isTaken ? 'is-taken' : 'cursor-pointer hover:scale-110 active:scale-95'}" 
                         data-color="${c}" 
                         data-is-taken="${isTaken}"
                         title="${isTaken ? 'Used by: ' + (sourceCat.label || sourceCat.id) : 'Available'}"
                         style="width: 28px; height: 28px; border-radius: 50%; background-color: ${c}; position: relative; border: 2px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.1)'}; box-shadow: ${isSelected ? '0 0 0 2px var(--color-accent)' : 'none'}; transition: all 0.2s ease;">
                        ${isSelected ? '<i class="fas fa-check" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5);"></i>' : ''}
                        ${isTaken ? `
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg); width: 100%; height: 2px; background: rgba(0,0,0,0.7); box-shadow: 0 0 2px rgba(255,255,255,0.8);"></div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); width: 100%; height: 2px; background: rgba(0,0,0,0.7); box-shadow: 0 0 2px rgba(255,255,255,0.8);"></div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            colorGrid.querySelectorAll('.color-swatch-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (item.dataset.isTaken === 'true') {
                        const source = usedMap.get(item.dataset.color.toLowerCase().trim());
                        ToastManager.error(`Color Conflict! Already assigned to "${source.label}".`);
                        return;
                    }
                    modal.dataset.selectedColor = item.dataset.color;
                    renderPicker();
                    this._updateModalHeaderColor(modal);
                });
            });
        };

        const renderOptions = () => {
            const listContainer = modal.querySelector('#category-options-list');
            const labelText = modal.querySelector(`#${IDS.CATEGORY_LABEL_TEXT}`);
            const cats = this._getMergedCategories();

            listContainer.innerHTML = cats.map(c => `
                <div class="${CSS_CLASSES.DROPDOWN_OPTION} flex justify-between items-center px-3 py-2 cursor-pointer hover:text-[var(--accent-color)]" data-value="${c.id || ''}" style="padding: 10px;">
                    <span>${c.label || 'Unnamed'}</span>
                    ${(c.id && c.id.startsWith('user_')) ? `<button type="button" class="category-delete-btn ${CSS_CLASSES.ICON_BTN_GHOST}" data-id="${c.id}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>` : ''}
                </div>
            `).join('');

            listContainer.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_OPTION}`).forEach(opt => {
                opt.addEventListener('click', (e) => {
                    if (e.target.closest('.category-delete-btn')) {
                        e.stopPropagation();
                        const id = e.target.closest('.category-delete-btn').dataset.id;
                        if (confirm('Delete category?')) {
                            AppState.deleteUserCategory(id);
                            if (this.selectedCategory === id) {
                                this.selectedCategory = 'cash';
                                modal.dataset.selectedCategory = 'cash';
                                labelText.textContent = 'Cash';
                            }
                            renderOptions();
                        }
                        return;
                    }

                    const val = opt.dataset.value;
                    this.selectedCategory = val;
                    modal.dataset.selectedCategory = val;
                    labelText.textContent = opt.querySelector('span').textContent;
                    modal.querySelector(`#${IDS.CATEGORY_OPTIONS}`).classList.add(CSS_CLASSES.HIDDEN);

                    modal.querySelector('#custom-category-group').classList.toggle(CSS_CLASSES.HIDDEN, val !== 'other');
                    if (val === 'other') {
                        modal.querySelector('#custom-category-name').focus();
                        pickerContainer.classList.remove(CSS_CLASSES.HIDDEN);
                        togglePickerBtn.textContent = 'Hide Colors';
                    }

                    // Auto-sync color to category theme
                    modal.dataset.selectedColor = this._pickInitialColor(modal.querySelector(`#${IDS.ASSET_NAME}`).value, asset?.id, val);
                    this._updateModalHeaderColor(modal);
                    renderPicker();
                });
            });
        };

        renderOptions();
        renderPicker();
        this._updateModalHeaderColor(modal);

        modal.querySelector(`#${IDS.CATEGORY_TRIGGER}`).addEventListener('click', (e) => {
            e.stopPropagation();
            modal.querySelector(`#${IDS.CATEGORY_OPTIONS}`).classList.toggle(CSS_CLASSES.HIDDEN);
        });

        // RE-FILTER PICKER ON TYPING
        modal.querySelector('#custom-category-name')?.addEventListener('input', () => {
            renderPicker();
        });

        togglePickerBtn.addEventListener('click', () => {
            const isHidden = pickerContainer.classList.toggle(CSS_CLASSES.HIDDEN);
            togglePickerBtn.textContent = isHidden ? 'Select Color' : 'Hide Colors';
        });

        resetColorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Reset to default color?')) {
                AppState.deleteUserCategory(this.selectedCategory);
                modal.dataset.selectedColor = this._pickInitialColor(modal.querySelector(`#${IDS.ASSET_NAME}`).value, asset?.id, this.selectedCategory);
                renderPicker();
                this._updateModalHeaderColor(modal);
            }
        });

        modal.querySelector('#btn-clear-categories').addEventListener('click', () => {
            if (confirm('Clear ALL custom categories?')) {
                AppState.clearAllUserCategories();
                this.selectedCategory = 'cash';
                modal.dataset.selectedCategory = 'cash';
                renderOptions();
            }
        });

        const commentsContainer = modal.querySelector(`#${IDS.COMMENTS_LIST_CONTAINER}`);
        const addComment = (text = '') => {
            const div = document.createElement('div');
            div.className = 'relative w-full mb-2';
            div.innerHTML = `
                <textarea class="${CSS_CLASSES.STANDARD_TEXTAREA} w-full" rows="1" placeholder="Note..." style="padding-right: 30px;">${text}</textarea>
                <button type="button" class="delete-comment text-coffee" style="position: absolute; top: 8px; right: 8px; background: none; border: none; padding: 0; cursor: pointer; opacity: 0.8;">
                    <i class="fas ${UI_ICONS.CLOSE}"></i>
                </button>
            `;
            div.querySelector('.delete-comment').addEventListener('click', () => div.remove());
            commentsContainer.appendChild(div);
        };
        comments.forEach(c => addComment(c.text || c));
        modal.querySelector(`#${IDS.BTN_ADD_COMMENT}`).addEventListener('click', () => addComment());

        const close = () => {
            // Detach keyboard handler before closing
            KeyboardModalHandler.detach();

            modal.classList.add(CSS_CLASSES.HIDDEN);
            setTimeout(() => modal.remove(), 300);
            navManager.popStateSilently();
        };

        modal.querySelectorAll(`.${CSS_CLASSES.MODAL_CLOSE_BTN}, .${CSS_CLASSES.MODAL_OVERLAY}`).forEach(el => el.addEventListener('click', close));
        modal.querySelector(`.${CSS_CLASSES.SAVE_BTN}`).addEventListener('click', () => {
            const data = this.gatherFormData(modal);
            if (data) { onSave(data); close(); }
        });
        if (isEdit) modal.querySelector(`.${CSS_CLASSES.DELETE_BTN}`).addEventListener('click', () => { if (onDelete) { onDelete(); close(); } });

        navManager.pushState(() => { if (modal.parentElement) close(); });

        // Attach keyboard handler for Android keyboard visibility
        KeyboardModalHandler.attach(modal);

        requestAnimationFrame(() => modal.classList.remove(CSS_CLASSES.HIDDEN));
    }

    gatherFormData(modal) {
        const name = modal.querySelector(`#${IDS.ASSET_NAME}`).value.trim();
        const balanceInput = modal.querySelector(`#${IDS.ASSET_BALANCE}`);
        const balance = parseFloat(balanceInput.value);
        let category = modal.dataset.selectedCategory;
        const color = modal.dataset.selectedColor;

        if (!name) { ToastManager.error('Please enter an asset name.'); return null; }
        if (isNaN(balance)) { ToastManager.error('Please enter a valid balance.'); return null; }

        let resolvedCategory = category;
        let customLabel = '';
        if (category === 'other') {
            const customInput = modal.querySelector('#custom-category-name');
            customLabel = customInput.value.trim();
            if (!customLabel) {
                ToastManager.error('Please enter a name for your new category.');
                customInput.focus();
                return null;
            }
            resolvedCategory = 'user_' + customLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }

        // --- STRICT GLOBAL COLOR BLOCKADE ---
        if (color) {
            const usedMap = this._getUsedColors(resolvedCategory);
            const colorVal = color.toLowerCase().trim();
            if (usedMap.has(colorVal)) {
                const source = usedMap.get(colorVal);
                ToastManager.error(`Color Conflict! Already used by "${source.label || source.id}".`);
                return null;
            }
        }

        // --- PERSIST CHANGES ---
        if (category === 'other') {
            AppState.saveUserCategory({ id: resolvedCategory, label: customLabel, color });
            category = resolvedCategory;
        } else if (color) {
            const cat = this._getMergedCategories().find(c => c.id === category);
            if (cat) {
                AppState.saveUserCategory({ id: category, label: cat.label || category, color });
            }
        }

        const comments = [...modal.querySelectorAll('textarea')].map(t => ({ text: t.value.trim(), date: new Date().toISOString() })).filter(c => c.text);

        return { name, balance, category, color, comments };
    }

    _updateModalHeaderColor(modal) {
        const header = modal.querySelector(`.${CSS_CLASSES.MODAL_HEADER}`);
        if (!header) return;
        const color = modal.dataset.selectedColor || 'var(--asset-other)';
        header.style.background = `linear-gradient(90deg, ${color}, rgba(0,0,0,0.1))`;
        header.style.color = '#fff';
    }
}
