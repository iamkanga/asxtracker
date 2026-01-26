/**
 * QuickNavUI.js
 * Manages the configuration modal for the long-press Quick Navigation feature.
 */
import { AppState } from '../state/AppState.js';
import { CSS_CLASSES, UI_ICONS, EVENTS, WATCHLIST_NAMES, SORT_OPTIONS, WATCHLIST_ICON_POOL } from '../utils/AppConstants.js';
import { AppController } from '../controllers/AppController.js';
import { ToastManager } from './ToastManager.js';

export class QuickNavUI {
    constructor() {
        this.modal = null;
        this.isVisible = false;
    }

    init() {
        this.renderModal();
        this.bindEvents();
    }

    renderModal() {
        // inline styles for action buttons to ensure they look good without new CSS
        const actionBtnStyle = 'background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 5px; margin-left: 10px; transition: transform 0.2s;';

        const modalHTML = `
            <div id="modal-quick-nav" class="${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}">
                <div class="${CSS_CLASSES.MODAL_OVERLAY}" data-action="close"></div>
                <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}">
                    
                    <!-- Header with Actions -->
                    <div class="${CSS_CLASSES.MODAL_HEADER}">
                        <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                            <h2 class="${CSS_CLASSES.MODAL_TITLE}">Quick Navigation Shortcut</h2>
                        </div>
                        
                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER}">
                            <!-- Delete (Hidden until needed) - COFFEE COLOR REQUESTED -->
                            <button id="qn-clear-btn" class="${CSS_CLASSES.HIDDEN}" style="${actionBtnStyle} color: var(--color-accent);" title="Delete Shortcut">
                                <i class="fas ${UI_ICONS.DELETE}"></i>
                            </button>

                            <!-- Save -->
                            <button id="qn-save-btn" style="${actionBtnStyle} color: var(--color-positive);" title="Save Shortcut">
                                <i class="fas ${UI_ICONS.CHECK}"></i>
                            </button>

                            <!-- Close (Standard) -->
                            <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" data-action="close" style="margin-left: 15px;">
                                <i class="fas ${UI_ICONS.CLOSE}"></i>
                            </button>
                        </div>
                    </div>

                    <div class="${CSS_CLASSES.MODAL_BODY}">
                        <p class="${CSS_CLASSES.Text_MUTED} ${CSS_CLASSES.MB_MEDIUM}">
                            Select a watchlist and sort order to jump to when you long-press the watchlist title.
                        </p>

                        <div class="${CSS_CLASSES.FORM_GROUP}">
                            <label class="${CSS_CLASSES.INPUT_LABEL}">Target Watchlist</label>
                            
                            <!-- Rich Dropdown Trigger (Div acts as Input) -->
                            <div class="${CSS_CLASSES.CUSTOM_DROPDOWN}" id="qn-watchlist-dropdown">
                                <div class="${CSS_CLASSES.INPUT_WRAPPER} dropdown-trigger" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding-right: 15px;">
                                    <div id="qn-watchlist-display" style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                                        <span class="placeholder-text">Select Watchlist...</span>
                                    </div>
                                    <i class="fas ${UI_ICONS.CHEVRON_DOWN}" style="color: var(--color-accent); font-size: 0.9rem;"></i>
                                </div>
                                <div class="${CSS_CLASSES.DROPDOWN_OPTIONS} ${CSS_CLASSES.HIDDEN}" style="margin-top: 12px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 1px solid var(--border-color);"></div>
                            </div>
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP}">
                            <label class="${CSS_CLASSES.INPUT_LABEL}">Sort Preference</label>
                            
                            <!-- Split Config: Sort Field + Direction Toggle -->
                            <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.GAP_SMALL} ${CSS_CLASSES.ALIGN_CENTER}">
                                <div class="${CSS_CLASSES.FLEX_1} ${CSS_CLASSES.CUSTOM_DROPDOWN}" id="qn-sort-dropdown">
                                    <div class="${CSS_CLASSES.INPUT_WRAPPER} dropdown-trigger" id="qn-sort-trigger" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding-right: 15px;">
                                        <div id="qn-sort-display" style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                                            <span class="placeholder-text">Select Sort...</span>
                                        </div>
                                        <!-- Dropdown Indicator (Always Grey/Default) -->
                                        <i class="fas ${UI_ICONS.CHEVRON_DOWN}" style="font-size: 0.9rem; opacity: 0.7;"></i>
                                    </div>
                                    <div class="${CSS_CLASSES.DROPDOWN_OPTIONS} ${CSS_CLASSES.HIDDEN}" style="margin-top: 12px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 1px solid var(--border-color);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('modal-quick-nav');

        // Cache Elements
        this.watchlistDropdown = this.modal.querySelector('#qn-watchlist-dropdown');
        this.watchlistDisplay = this.modal.querySelector('#qn-watchlist-display');
        this.watchlistOptionsContainer = this.watchlistDropdown.querySelector(`.${CSS_CLASSES.DROPDOWN_OPTIONS}`);

        this.sortDropdown = this.modal.querySelector('#qn-sort-dropdown');
        this.sortDisplay = this.modal.querySelector('#qn-sort-display');
        this.sortOptionsContainer = this.sortDropdown.querySelector(`.${CSS_CLASSES.DROPDOWN_OPTIONS}`);

        this.saveBtn = this.modal.querySelector('#qn-save-btn');
        this.clearBtn = this.modal.querySelector('#qn-clear-btn');

        // State for the form
        this.selectedWatchlistId = null;
        this.selectedSortField = null;
        this.selectedSortDirection = 'asc';
    }

    bindEvents() {
        // Modal Close Actions
        this.modal.querySelectorAll('[data-action="close"]').forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });

        // Dropdown Toggles
        const bindDropdown = (container, optionsContainer) => {
            const trigger = container.querySelector('.dropdown-trigger');
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close others
                [this.watchlistOptionsContainer, this.sortOptionsContainer].forEach(el => {
                    if (el !== optionsContainer) el.classList.add(CSS_CLASSES.HIDDEN);
                });
                optionsContainer.classList.toggle(CSS_CLASSES.HIDDEN);
            });
        };

        // Toggle Watchlist Dropdown (RE-RENDER to ensure fresh highlight)
        this.watchlistDisplay.parentElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.watchlistOptionsContainer.classList.toggle(CSS_CLASSES.HIDDEN);
            this.sortOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
            if (!this.watchlistOptionsContainer.classList.contains(CSS_CLASSES.HIDDEN)) {
                this._populateWatchlistOptions(); // Re-render to show correct selection highlight
            }
        });

        // Toggle Sort Dropdown (RE-RENDER to ensure fresh highlight)
        // Note: Sort Trigger now has ID 'qn-sort-trigger' for clearer binding
        const sortTrigger = this.modal.querySelector('#qn-sort-trigger');
        if (sortTrigger) {
            sortTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // If clicking the Arrow (which stops propagation), this won't fire.
                // But just in case, check target.
                if (e.target.closest('#qn-embedded-sort-toggle')) return;

                this.sortOptionsContainer.classList.toggle(CSS_CLASSES.HIDDEN);
                this.watchlistOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
                if (!this.sortOptionsContainer.classList.contains(CSS_CLASSES.HIDDEN)) {
                    this._populateSortOptions(); // Re-render to show correct selection highlight
                }
            });
        }
        // Close dropdowns on outside click
        document.addEventListener('click', () => {
            if (this.isVisible) {
                this.watchlistOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
                this.sortOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
            }
        });

        // Direction Toggle Logic is now embedded in _updateSortDisplay click handler


        // Save
        this.saveBtn.addEventListener('click', () => {
            if (this.selectedWatchlistId) {
                const config = {
                    watchlistId: this.selectedWatchlistId,
                    sortField: this.selectedSortField || 'code', // Default if not selected
                    sortDirection: this.selectedSortDirection
                };
                AppState.saveQuickNav(config);
                ToastManager.success('Shortcut Saved!');
                this.hide();
            } else {
                ToastManager.error('Please select a watchlist.');
            }
        });

        // Clear (Delete)
        this.clearBtn.addEventListener('click', () => {
            if (confirm('Remove this shortcut?')) {
                AppState.saveQuickNav(null);
                ToastManager.info('Shortcut Removed.');
                this.hide();
            }
        });
    }

    show() {
        // Populate options tailored to current state
        this._populateWatchlistOptions();

        // Load current config or defaults
        const currentConfig = AppState.preferences.quickNav;
        const modalTitle = this.modal.querySelector(`.${CSS_CLASSES.MODAL_TITLE}`);

        if (currentConfig) {
            this.selectedWatchlistId = currentConfig.watchlistId;
            this.selectedSortField = currentConfig.sortField;
            this.selectedSortDirection = currentConfig.sortDirection;
            this.clearBtn.classList.remove(CSS_CLASSES.HIDDEN);

            if (modalTitle) modalTitle.innerText = 'Edit Quick Shortcut';
        } else {
            // Default to current view if no config
            this.selectedWatchlistId = AppState.watchlist.id || 'portfolio';
            this.selectedSortField = AppState.sortConfig.field;
            this.selectedSortDirection = AppState.sortConfig.direction;
            this.clearBtn.classList.add(CSS_CLASSES.HIDDEN);

            if (modalTitle) modalTitle.innerText = 'Quick Navigation Shortcut';
        }

        // Update UI
        this._updateWatchlistDisplay();
        this._populateSortOptions(); // Depends on watchlist type
        this._updateSortDisplay();
        this._updateDirectionIcon();

        this.modal.classList.remove(CSS_CLASSES.HIDDEN);
        this.modal.classList.add(CSS_CLASSES.SHOW);
        this.isVisible = true;

        // Animate Buttons
        this.saveBtn.style.transform = 'scale(0.8)';
        setTimeout(() => this.saveBtn.style.transform = 'scale(1)', 150);
    }

    hide() {
        this.modal.classList.remove(CSS_CLASSES.SHOW);
        this.modal.classList.add(CSS_CLASSES.HIDDEN);
        this.isVisible = false;

        // Hide dropdowns
        this.watchlistOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
        this.sortOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
    }

    // === OPTION POPULATION LOGIC with IMPROVED SPACING ===

    _populateWatchlistOptions() {
        this.watchlistOptionsContainer.innerHTML = '';

        const systemLists = [
            { id: 'portfolio', name: 'Portfolio', icon: 'fa-briefcase' },
            { id: 'ALL', name: 'All Shares', icon: 'fa-globe' },
            { id: 'DASHBOARD', name: 'Dashboard', icon: 'fa-tachometer-alt' },
            { id: 'CASH', name: 'Cash & Assets', icon: 'fa-money-bill-wave' }
        ];

        const customLists = (AppState.data.watchlists || []).map(w => ({
            id: w.id,
            name: w.name,
            icon: 'fa-list-ul' // Default custom icon
        }));

        const allLists = [...systemLists, ...customLists];

        allLists.forEach(list => {
            const el = document.createElement('div');
            el.className = `${CSS_CLASSES.DROPDOWN_OPTION}`;

            // Selection Highlight (Text Coffee, No Background)
            const isSelected = String(list.id) === String(this.selectedWatchlistId);

            if (isSelected) {
                el.style.backgroundColor = 'transparent';
                el.style.fontWeight = '700';
            }

            // Explicit Colors for Icon and Text
            // If selected: Both Coffee. If not: Icon Coffee (brand), Text Standard.
            const iconColor = 'var(--color-accent)';
            const textColor = isSelected ? 'var(--color-accent)' : 'var(--text-color)';

            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                    <i class="fas ${list.icon}" style="color: ${iconColor}; width: 24px; text-align: center; font-size: 1rem;"></i>
                    <span style="font-size: 1rem; color: ${textColor};">${list.name}</span>
                </div>
            `;

            el.addEventListener('click', () => {
                this.selectedWatchlistId = list.id;
                this._updateWatchlistDisplay();

                // Reset Sort on watchlist change to default valid
                const isCash = list.id === 'CASH';
                this.selectedSortField = isCash ? 'category' : 'code';
                this.selectedSortDirection = 'asc';

                this._populateSortOptions();
                this._updateSortDisplay();
                // this._updateDirectionIcon(); // This line is removed as per the instruction

                this.watchlistOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
            });

            this.watchlistOptionsContainer.appendChild(el);
        });
    }

    _updateWatchlistDisplay() {
        const getName = (id) => {
            if (id === 'portfolio') return { name: 'Portfolio', icon: 'fa-briefcase' };
            if (id === 'ALL') return { name: 'All Shares', icon: 'fa-globe' };
            if (id === 'DASHBOARD') return { name: 'Dashboard', icon: 'fa-tachometer-alt' };
            if (id === 'CASH') return { name: 'Cash & Assets', icon: 'fa-money-bill-wave' };
            const found = (AppState.data.watchlists || []).find(w => w.id === id);
            return found ? { name: found.name, icon: 'fa-list-ul' } : { name: 'Select Watchlist...', icon: 'fa-question-circle' };
        };

        const { name, icon } = getName(this.selectedWatchlistId);

        // Refined Display - FORCE TEXT COLOR TO COFFEE (User Request)
        this.watchlistDisplay.innerHTML = `
            <i class="fas ${icon}" style="color: var(--color-accent); width: 20px; text-align: center;"></i>
            <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; color: var(--color-accent);">${name}</span>
        `;
    }

    _populateSortOptions() {
        this.sortOptionsContainer.innerHTML = '';

        let sortType = 'STOCK';
        if (this.selectedWatchlistId === 'CASH') sortType = 'CASH';
        else if (this.selectedWatchlistId === 'portfolio') sortType = 'PORTFOLIO';

        const options = SORT_OPTIONS[sortType] || SORT_OPTIONS.STOCK;

        options.forEach(opt => {
            const el = document.createElement('div');
            el.className = `${CSS_CLASSES.DROPDOWN_OPTION}`;

            // Selection Highlight (Text Coffee, No Background)
            const isSelected = opt.field === this.selectedSortField;

            if (isSelected) {
                el.style.backgroundColor = 'transparent';
                el.style.fontWeight = '700';
            }

            const iconColor = 'var(--color-accent)';
            const textColor = isSelected ? 'var(--color-accent)' : 'var(--text-color)';

            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                    <i class="fas ${opt.icon}" style="color: ${iconColor}; width: 24px; text-align: center; font-size: 1rem;"></i>
                    <span style="font-size: 1rem; color: ${textColor};">${opt.label}</span>
                </div>
            `;

            el.addEventListener('click', () => {
                this.selectedSortField = opt.field;
                this.selectedSortDirection = opt.direction; // Default dir for this field
                this._updateSortDisplay();
                // this._updateDirectionIcon(); // This line is removed as per the instruction
                this.sortOptionsContainer.classList.add(CSS_CLASSES.HIDDEN);
            });

            this.sortOptionsContainer.appendChild(el);
        });
    }

    _updateSortDisplay() {
        let sortType = 'STOCK';
        if (this.selectedWatchlistId === 'CASH') sortType = 'CASH';
        else if (this.selectedWatchlistId === 'portfolio') sortType = 'PORTFOLIO';

        const options = SORT_OPTIONS[sortType] || SORT_OPTIONS.STOCK;
        const current = options.find(o => o.field === this.selectedSortField);

        // Determine Direction Arrow (Same Logic as ViewRenderer)
        const isTextField = ['code', 'name', 'category', 'comments', 'targetPrice'].includes(this.selectedSortField);
        const highToLowDir = isTextField ? 'asc' : 'desc';
        const isHighToLow = (this.selectedSortDirection === highToLowDir);

        // Green Up / Red Down
        const dirIconClass = isHighToLow ? `fas fa-chevron-up` : `fas fa-chevron-down`;
        const dirColor = isHighToLow ? 'var(--color-positive)' : 'var(--color-negative)';

        if (current) {
            this.sortDisplay.innerHTML = `
                <i class="fas ${current.icon}" style="color: var(--color-accent); width: 20px; text-align: center;"></i>
                <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-accent);">${current.label}</span>
                
                <!-- INTEGRATED DIRECTION TOGGLE -->
                <span id="qn-embedded-sort-toggle" style="margin-left: 8px; cursor: pointer; padding: 4px 8px; display: inline-flex; align-items: center;">
                    <i class="${dirIconClass}" style="color: ${dirColor};"></i>
                </span>
            `;

            // Re-bind click event for the embedded toggle
            const toggle = this.sortDisplay.querySelector('#qn-embedded-sort-toggle');
            if (toggle) {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent opening the dropdown
                    e.preventDefault();
                    this.selectedSortDirection = this.selectedSortDirection === 'asc' ? 'desc' : 'asc';
                    this._updateSortDisplay(); // Re-render self
                });
            }

        } else {
            this.sortDisplay.innerHTML = `<span class="placeholder-text">Select Sort...</span>`;
        }
    }

    _updateDirectionIcon() {
        // Obsolete - functionality moved to embedded arrow
    }
}
