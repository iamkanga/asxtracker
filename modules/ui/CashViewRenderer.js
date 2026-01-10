/**
 * CashViewRenderer.js
 * Responsible for rendering the Cash & Assets view HTML.
 * Strictly checks for CSS classes from AppConstants.
 */
import { CASH_CATEGORIES, CSS_CLASSES, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
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
                // STATE: Loaded and genuinely empty
                listContainer.innerHTML = `<p class="${CSS_CLASSES.TEXT_NEUTRAL} ${CSS_CLASSES.TEXT_CENTER} ${CSS_CLASSES.P_3}">No cash assets found.</p>`;
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
        headerDiv.className = CSS_CLASSES.CASH_TOTAL_HEADER; // 'cash-total-header'

        const label = document.createElement('span');
        label.textContent = 'Total Cash';

        const value = document.createElement('span');
        value.className = CSS_CLASSES.CASH_VALUE_POSITIVE; // 'cash-value-positive' (assuming typically positive)
        value.textContent = formatCurrency(totalValue);

        headerDiv.appendChild(label);
        headerDiv.appendChild(value);

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

        // Apply Side Border based on Category
        // Apply Sidebar Variable based on Category
        if (asset.category) {
            const userCat = AppState.preferences.userCategories?.find(c => c.id === asset.category);
            if (userCat && userCat.color) {
                card.style.setProperty('--sidebar-color', userCat.color);
            } else {
                // Map standard categories to their CSS variables
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
                const colorVar = standardColors[asset.category] || 'var(--asset-other)';
                card.style.setProperty('--sidebar-color', colorVar);
            }
        } else {
            card.style.setProperty('--sidebar-color', 'var(--asset-other)');
        }

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
            <div class="cash-grid-category">${(catObj ? catObj.label : (asset.category || 'Cash').replace(/^user_/i, '').replace(/_/g, ' ')).toUpperCase()}</div>
            <div class="cash-grid-name">${asset.name}</div>
            <div class="cash-grid-balance ${asset.balance > 0 ? CSS_CLASSES.CASH_VALUE_POSITIVE : asset.balance < 0 ? CSS_CLASSES.CASH_VALUE_NEGATIVE : ''}" 
                 style="${asset.balance === 0 ? 'color: var(--color-accent);' : ''}">
                ${formatCurrency(asset.balance)}
            </div>
            <div class="cash-grid-actions">
                ${hasComments ? `<i class="fas ${UI_ICONS.COMMENTS} cash-comment-indicator" title="Comments available"></i>` : ''}
                <button class="${CSS_CLASSES.ICON_BTN_GHOST} ${CSS_CLASSES.CASH_EYE_BTN}" title="${asset.isHidden ? "Show Asset" : "Hide Asset"}">
                    <i class="fas ${asset.isHidden ? UI_ICONS.EYE_SLASH : UI_ICONS.EYE}"></i>
                </button>
            </div>
        `;

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
}
