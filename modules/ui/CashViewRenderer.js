/**
 * CashViewRenderer.js
 * Responsible for rendering the Cash & Assets view HTML.
 * Strictly checks for CSS classes from AppConstants.
 */
import { CASH_CATEGORIES, CSS_CLASSES, UI_ICONS, EVENTS, ASSET_CUSTOM_COLORS } from '../utils/AppConstants.js';
import { formatCurrency } from '../utils/formatters.js';
import { AppState } from '../state/AppState.js';

export class CashViewRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    /**
     * Renders the full Cash View: Total Header + Asset List.
     * @param {Array} assets - List of cash asset objects.
     * @param {Number} totalValue - Calculated total value of all assets.
     * @param {Boolean} isLoaded - Whether initial data load is complete. Defaults to false (show loading).
     */
    renderCashView(assets, totalValue, isLoaded = false) {
        if (!this.container) return;



        this.container.innerHTML = '';
        this.container.classList.remove(CSS_CLASSES.VIEW_TABLE, CSS_CLASSES.VIEW_COMPACT, CSS_CLASSES.VIEW_SNAPSHOT); // Clear potentially conflicting classes
        this.container.classList.remove(CSS_CLASSES.HIDDEN); // Redundant if cleared, but safe

        // 1. Render Total Header
        const header = this.createTotalHeader(totalValue);
        this.container.appendChild(header);

        // 2. Render List Container
        const listContainer = document.createElement('div');
        listContainer.className = CSS_CLASSES.CASH_CONTAINER; // 'cash-container'

        // Apply Column Views based on AppState.viewMode
        const mode = (AppState.viewMode || 'TABLE').toUpperCase();
        if (mode === 'COMPACT') {
            listContainer.classList.add(CSS_CLASSES.CASH_VIEW_TWO_COLUMN);
        } else if (mode === 'SNAPSHOT') {
            listContainer.classList.add(CSS_CLASSES.CASH_VIEW_THREE_COLUMN);
        } else {
            listContainer.classList.add(CSS_CLASSES.CASH_VIEW_SINGLE);
        }

        if (assets.length === 0) {
            if (!isLoaded) {
                // STATE: Loading - show skeleton/spinner, NOT "No assets"
                listContainer.innerHTML = `
                    <div class="${CSS_CLASSES.EMPTY_STATE}" style="min-height: 100px;">
                        <i class="fas ${UI_ICONS.SPINNER}" style="font-size: 1.5rem; color: var(--text-muted);"></i>
                    </div>
                `;
            } else {
                // STATE: Loaded and genuinely empty (Premium Design)
                listContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 50vh; text-align: center; padding: 20px;">
                    <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.03); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                        <i class="fas ${UI_ICONS.WALLET}" style="font-size: 28px; color: var(--text-muted); opacity: 0.5;"></i>
                    </div>
                    <h2 class="${CSS_CLASSES.DISPLAY_TITLE}" style="font-size: 1.5rem; margin-bottom: 12px; color: var(--text-shimmer);">No Cash Assets</h2>
                    <p style="color: var(--text-muted); font-size: 1rem; max-width: 300px; line-height: 1.5; margin-bottom: 32px;">
                        Track your bank accounts, property, crypto, and other assets here.
                    </p>
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 30px; font-size: 0.9rem; color: var(--color-accent); font-weight: 600;">
                        <i class="fas fa-arrow-left"></i>
                        <span>Open Sidebar to Add Asset</span>
                    </div>
                </div>
                `;
            }
        } else {
            assets.forEach(asset => {
                const card = this.createCashCard(asset);
                listContainer.appendChild(card);
            });
        }

        this.container.appendChild(listContainer);
    }

    /**
     * Creates the Total Cash Header element.
     * @param {Number} totalValue 
     * @returns {HTMLElement}
     */
    createTotalHeader(totalValue) {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'cash-total-header';

        headerDiv.innerHTML = `
            <span class="cash-total-label">Total Portfolio Cash</span>
            <span class="cash-total-amount">${formatCurrency(totalValue)}</span>
        `;

        return headerDiv;
    }

    /**
     * Creates a single Cash Asset Card.
     * @param {Object} asset 
     * @returns {HTMLElement}
     */
    createCashCard(asset) {
        const card = document.createElement('div');
        card.className = CSS_CLASSES.CASH_CARD; // 'cash-card'

        // Apply Side Border & Background based on Category
        let colorVal = 'var(--asset-other)'; // Default

        if (asset.category) {
            const userCat = AppState.preferences.userCategories?.find(c => c.id === asset.category);

            if (userCat && userCat.color) {
                // User Custom Category (HEX)
                colorVal = userCat.color;
            } else {
                // Standard Categories (CSS Vars)
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

                // Prioritize: 
                // 1. Explicit Asset Color (Specific override)
                // 2. User Category Preference (Global theme override - handled above)
                // 3. Name-based Hashing (Only for 'other')
                // 4. Default CSS Var

                if (asset.color) {
                    colorVal = asset.color;
                } else if (standardColors[asset.category]) {
                    colorVal = standardColors[asset.category];
                } else if (asset.category === 'other' && asset.name) {
                    colorVal = this._getColorForString(asset.name);
                }
            }
        } else if (asset.color) {
            colorVal = asset.color;
        }

        // Apply Styles
        // Dynamic "Hue on Black" Background Effect
        // Uses color-mix to blend the category color with black. 
        // We need a stronger blend (e.g. 60% color) to match the 'dashboard-grade' opacity look (approx 0.6).
        // Using "color-mix(in srgb, ${colorVal} 60%, black)" gives 60% color, 40% black.
        // We start with strong color, fade to almost black.
        card.setAttribute('style', `border-left: none !important; border-right: none !important; background: linear-gradient(135deg, color-mix(in srgb, ${colorVal} 60%, black), color-mix(in srgb, ${colorVal} 5%, black)) !important;`);

        // Handle Ghosting
        if (asset.isHidden) {
            card.classList.add(CSS_CLASSES.GHOSTED);
            card.style.opacity = '0.5';
        } else {
            card.style.opacity = '1';
        }

        // --- CONTENT GRID ---
        const hasComments = Array.isArray(asset.comments) && asset.comments.length > 0;
        const catObj = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])]
            .find(c => c.id === asset.category);

        card.innerHTML = `
            <div class="cash-grid-category">
                ${(catObj ? catObj.label : (asset.category || 'Cash').replace(/^user_/i, '').replace(/_/g, ' ')).toUpperCase()}
                ${hasComments ? `<i class="fas ${UI_ICONS.COMMENTS} cash-comment-indicator" style="font-size: 10px; opacity: 0.4; margin-left: 6px;" title="Comments available"></i>` : ''}
            </div>
            <div class="cash-grid-name">
                ${asset.name}
                ${asset.category === 'other' ? `<span style="font-size: 9px; color: #aaa; margin-left: 5px;">[${asset.color || 'NO-CLR'}]</span>` : ''}
            </div>
            <div class="cash-grid-balance ${asset.balance > 0 ? CSS_CLASSES.CASH_VALUE_POSITIVE : asset.balance < 0 ? CSS_CLASSES.CASH_VALUE_NEGATIVE : ''}" 
                 style="${asset.balance === 0 ? 'color: var(--color-accent);' : ''}">
                ${formatCurrency(asset.balance)}
            </div>
            <div class="cash-grid-actions">
                <button class="${CSS_CLASSES.ICON_BTN_GHOST} ${CSS_CLASSES.CASH_EYE_BTN}" title="${asset.isHidden ? "Show Asset" : "Hide Asset"}">
                    <i class="fas ${asset.isHidden ? UI_ICONS.EYE_SLASH : UI_ICONS.EYE}"></i>
                </button>
            </div>
        `;

        // DEBUG LOGGING
        if (asset.category === 'other') {
            console.log(`[CashViewRenderer] Rendering 'Other': ${asset.name}, Color: ${asset.color}, Border: ${card.style.borderLeftColor}`);
        }

        // Eye Button Event
        card.querySelector(`.${CSS_CLASSES.CASH_EYE_BTN}`).addEventListener('click', (e) => {
            e.stopPropagation();
            const event = new CustomEvent(EVENTS.CASH_ASSET_TOGGLE_VISIBILITY, {
                detail: { assetId: asset.id },
                bubbles: true
            });
            this.container.dispatchEvent(event);
        });

        // Card Interaction
        card.addEventListener('click', () => {
            const event = new CustomEvent(EVENTS.CASH_ASSET_SELECTED, {
                detail: { assetId: asset.id, asset: asset },
                bubbles: true
            });
            this.container.dispatchEvent(event);
        });

        return card;
    }

    /**
     * Generates a consistent color for a string from the custom color pool.
     * @param {String} str 
     * @returns {String} Hex Color
     */
    _getColorForString(str) {
        if (!str) return ASSET_CUSTOM_COLORS[0];

        const seed = AppState.preferences?.colorSeed || 0;

        let hash = seed; // Start hash with seed to shift the output
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        const index = Math.abs(hash) % ASSET_CUSTOM_COLORS.length;
        const c = ASSET_CUSTOM_COLORS[index];
        return c;
    }
}
