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
        if (asset.category) {
            const userCat = AppState.preferences.userCategories?.find(c => c.id === asset.category);
            if (userCat && userCat.color) {
                // Dynamic Color for User Categories - Use physical border for alignment
                card.style.borderLeft = `6px solid ${userCat.color}`;
                card.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)'; // Maintain base shadow
            } else {
                // Standard CSS-based classes
                card.classList.add(`${CSS_CLASSES.CASH_BORDER_PREFIX}${asset.category}`);
            }
        } else {
            card.classList.add(`${CSS_CLASSES.CASH_BORDER_PREFIX}other`);
        }

        // Handle Ghosting
        if (asset.isHidden) {
            card.classList.add(CSS_CLASSES.GHOSTED);
            card.style.opacity = '0.5';
        } else {
            card.style.opacity = '1';
        }

        // --- LEFT COLUMN ---
        const leftCol = document.createElement('div');
        leftCol.className = CSS_CLASSES.CASH_CARD_LEFT;

        const catEl = document.createElement('div');
        catEl.className = CSS_CLASSES.CASH_LABEL;

        const catObj = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])]
            .find(c => c.id === asset.category);
        catEl.textContent = (catObj ? catObj.label : (asset.category || 'Cash').replace(/^user_/i, '').replace(/_/g, ' ')).toUpperCase();

        const nameEl = document.createElement('div');
        nameEl.className = CSS_CLASSES.CASH_NAME;
        nameEl.textContent = asset.name;

        leftCol.appendChild(catEl);
        leftCol.appendChild(nameEl);

        // --- RIGHT COLUMN ---
        const rightCol = document.createElement('div');
        rightCol.className = CSS_CLASSES.CASH_CARD_RIGHT;

        // Eye Icon (Top)
        const eyeWrapper = document.createElement('div');
        eyeWrapper.className = CSS_CLASSES.CASH_EYE_ICON;

        const eyeBtn = document.createElement('button');
        eyeBtn.className = CSS_CLASSES.ICON_BTN_GHOST;
        eyeBtn.innerHTML = `<i class="fas ${asset.isHidden ? UI_ICONS.EYE_SLASH : UI_ICONS.EYE}"></i>`;
        eyeBtn.title = asset.isHidden ? "Show Asset" : "Hide Asset";

        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const event = new CustomEvent(EVENTS.CASH_ASSET_TOGGLE_VISIBILITY, {
                detail: { assetId: asset.id },
                bubbles: true
            });
            this.container.dispatchEvent(event);
        });

        eyeWrapper.appendChild(eyeBtn);

        // Balance (Bottom)
        const balanceEl = document.createElement('div');
        balanceEl.className = CSS_CLASSES.CASH_BALANCE;
        balanceEl.textContent = formatCurrency(asset.balance);

        // Add semantic color
        if (asset.balance > 0) {
            balanceEl.classList.add(CSS_CLASSES.CASH_VALUE_POSITIVE);
        } else if (asset.balance < 0) {
            balanceEl.classList.add(CSS_CLASSES.CASH_VALUE_NEGATIVE);
        } else {
            // Neutral - Coffee Color
            balanceEl.style.color = 'var(--color-accent)';
        }

        rightCol.appendChild(balanceEl);
        rightCol.appendChild(eyeWrapper);

        // Assemble
        card.appendChild(leftCol);
        card.appendChild(rightCol);

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
