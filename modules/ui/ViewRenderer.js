
/**
 * ViewRenderer.js
 * Handles the rendering of the watchlist in different modes (Table, Compact, Snapshot).
 * Manages the visibility of view toggles based on watchlist type.
 */

import { formatCurrency, formatPercent, formatFriendlyDate } from '../utils/formatters.js';
import { AppState } from '../state/AppState.js';
import { SORT_OPTIONS, UI_ICONS, USER_MESSAGES, RESEARCH_LINKS_TEMPLATE, CSS_CLASSES, IDS, EVENTS, SUMMARY_TYPES, STORAGE_KEYS, PORTFOLIO_ID, KANGAROO_ICON_SRC } from '../utils/AppConstants.js?v=10';
import { SnapshotUI } from './SnapshotUI.js'; // Added import
import { navManager } from '../utils/NavigationManager.js';

export class ViewRenderer {
    constructor() {
        this.cardsContainerClass = CSS_CLASSES.MOBILE_CONTAINER;

        // Cached DOM Elements
        this.container = document.getElementById(IDS.CONTENT_CONTAINER);
        this.sortReorderMode = false;
        this.viewControls = document.getElementById(IDS.VIEW_CONTROLS);
    }

    /**
     * Renders the data based on view mode and watchlist type.
     * @param {Array} data - Array of share/asset objects.
     */
    render(data, summaryMetrics = null) {
        const viewMode = AppState.viewMode;
        const watchlistType = AppState.watchlist.type;
        const mode = viewMode.toUpperCase();

        // 1. Handle Toggle Visibility
        if (this.viewControls) {
            const visibilityClass = this._getToggleVisibilityClass(watchlistType);
            this.viewControls.className = `${CSS_CLASSES.VIEW_CONTROLS} ${visibilityClass}`;
            if (visibilityClass === CSS_CLASSES.HIDDEN) {
                this.viewControls.classList.add(CSS_CLASSES.HIDDEN);
            } else {
                this.viewControls.classList.remove(CSS_CLASSES.HIDDEN);
            }
        }

        // 2. Clear Container
        this.container.innerHTML = '';
        this.container.classList.remove(CSS_CLASSES.VIEW_TABLE, CSS_CLASSES.VIEW_COMPACT, CSS_CLASSES.VIEW_SNAPSHOT);

        // 2a. Render Summary (ONLY for Portfolio)
        // User Logic: if (currentWatchlistName === 'Portfolio') { renderSummary(); }
        // Refinement V2: Restrict to Table View (which is Card View on Mobile)
        if (summaryMetrics && (AppState.watchlist.name === 'Portfolio' || AppState.isPortfolioVisible) && mode === 'TABLE') {
            this.renderSummary(summaryMetrics);
        }

        switch (mode) {
            case 'TABLE':
                this.container.classList.add(CSS_CLASSES.VIEW_TABLE);
                this.renderTable(data);
                break;
            case 'COMPACT':
                this.container.classList.add(CSS_CLASSES.VIEW_COMPACT);
                this.renderGrid(data, 'compact');
                break;
            case 'SNAPSHOT':
                this.container.classList.add(CSS_CLASSES.VIEW_SNAPSHOT);
                this.renderGrid(data, 'snapshot');
                break;
            default:
                console.warn(`Unknown view mode: ${mode}, defaulting to TABLE`);
                this.container.classList.add(CSS_CLASSES.VIEW_TABLE);
                this.renderTable(data);
        }
    }

    /**
     * Helper to render Rating icons.
     * @param {number} rating - 0 to 5
     * @returns {string} HTML string of stars
     */
    _renderStarRating(rating) {
        if (!rating && rating !== 0) return `<span class="${CSS_CLASSES.TEXT_MUTED}">-</span>`;

        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                starsHtml += `<i class="fas ${UI_ICONS.STAR} ${CSS_CLASSES.TEXT_COFFEE}"></i>`; // Full Star
            } else if (i - 0.5 <= rating) {
                starsHtml += `<i class="fas ${UI_ICONS.STAR_HALF} ${CSS_CLASSES.TEXT_COFFEE}"></i>`; // Half Star
            } else {
                starsHtml += `<i class="${UI_ICONS.STAR_EMPTY} ${CSS_CLASSES.TEXT_MUTED_LIGHT}"></i>`; // Empty Star
            }
        }
        return `<div class="${CSS_CLASSES.STAR_RATING}" title="Rating: ${rating}/5">${starsHtml}</div>`;
    }

    _getHiddenClass(type) {
        if (type === 'cash') {
            return CSS_CLASSES.HIDDEN;
        }
        return '';
    }

    renderTable(data) {
        if (!data || data.length === 0) {
            this.container.innerHTML = `<div class="${CSS_CLASSES.EMPTY_STATE}">No shares in this watchlist.</div>`;
            return;
        }

        const isPortfolioView = AppState.watchlist.name === 'Portfolio' || AppState.isPortfolioVisible || AppState.watchlist.id === 'PORTFOLIO';

        if (isPortfolioView) {
            // 1. Portfolio Grid (Now for both Desktop and Mobile)
            const gridContainer = document.createElement('div');
            gridContainer.classList.add(this.cardsContainerClass); // 'mobile-share-cards'
            gridContainer.classList.add(CSS_CLASSES.PORTFOLIO_GRID); // Registry-compliant class

            gridContainer.innerHTML = data.map(item => this.createCardHTML(item, 'portfolio')).join('');
            this.container.appendChild(gridContainer);
        } else {
            // 2. Standard Table (Desktop View)
            const table = document.createElement('table');
            table.className = CSS_CLASSES.TABLE;

            // Check for Generic Watchlist (Not Portfolio/Cash/All Shares usually treated as generic)
            // But user said "Watchlists". Usually 'ALL' is a watchlist too.
            // Strict scope: NOT Portfolio AND NOT Cash.
            const isGenericWatchlist = !isPortfolioView && AppState.watchlist.id !== 'CASH';

            const extraHeaders = isGenericWatchlist ? `
                <th data-sort-field="targetPrice">Target</th>
                <th data-sort-field="starRating">Rating</th>
                <th>Notes</th>
            ` : '';

            table.innerHTML = `
                <thead>
                    <tr>
                        <th data-sort-field="code">Code</th>
                        <th data-sort-field="currentPrice">Price</th>
                        <th class="desktop-only" data-sort-field="dayChangePercent">Change</th>
                        ${extraHeaders}
                    </tr>
                </thead>
                <tbody>
                    ${data.map(item => this.createRowHTML(item, isGenericWatchlist)).join('')}
                </tbody>
            `;
            this.container.appendChild(table);

            // 3. Render Fallback Cards (Mobile Card Design for non-portfolio watchlists)
            // ... (keep fallback container logic)
            const mobileContainer = document.createElement('div');
            mobileContainer.className = CSS_CLASSES.FALLBACK_CONTAINER;
            mobileContainer.innerHTML = data.map(item => this.createCardHTML(item, 'watchlist')).join('');
            this.container.appendChild(mobileContainer);
        }
    }

    renderGrid(data, type) {
        if (!data || data.length === 0) {
            this.container.innerHTML = `<div class="${CSS_CLASSES.EMPTY_STATE}">No shares in this watchlist.</div>`;
            return;
        }

        const gridContainer = document.createElement('div');
        gridContainer.classList.add(this.cardsContainerClass);
        // Note: The specific grid column logic (2 vs 3) is handled by CSS based on the parent class (view-compact vs view-snapshot)

        gridContainer.innerHTML = data.map(item => this.createCardHTML(item, type)).join('');
        this.container.appendChild(gridContainer);
    }


    updateAddStockButtonState(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.innerHTML = `<i class="fas ${UI_ICONS.SPINNER}"></i>`;
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    }

    // Better: purely functional helper
    setElementLoading(el, isLoading, originalContent = null) {
        if (isLoading) {
            el.dataset.originalContent = el.innerHTML;
            el.innerHTML = `<i class="fas ${UI_ICONS.SPINNER}"></i>`;
            el.disabled = true;
        } else {
            if (el.dataset.originalContent) {
                el.innerHTML = el.dataset.originalContent;
            }
            el.disabled = false;
        }
    }



    createRowHTML(item, isGenericWatchlist = false) {
        const price = item.currentPrice || 0;
        const changePercent = item.dayChangePercent || 0;

        // Consistent check for Portfolio view content
        const isPortfolioView = AppState.watchlist.id === 'PORTFOLIO' ||
            AppState.watchlist.type === PORTFOLIO_ID ||
            AppState.watchlist.name === 'Portfolio' ||
            AppState.isPortfolioVisible;

        const changeValue = isPortfolioView ? (item.dayChangeValue || 0) : (item.dayChangePerShare || 0);

        let trendClass = CSS_CLASSES.TREND_UP;
        if (changePercent < 0) {
            trendClass = CSS_CLASSES.TREND_DOWN;
        } else if (changePercent === 0) {
            trendClass = CSS_CLASSES.TREND_NEUTRAL;
        }

        // Extra Cells for Watchlist
        let extraCells = '';
        if (isGenericWatchlist) {
            // Target Logic
            const hasAlert = item.targetPrice && item.targetPrice !== 0;
            let targetHtml = '';

            if (hasAlert) {
                const isSell = item.buySell === 'sell';
                const label = isSell ? 'Sell' : 'Buy';
                const iconClass = isSell ? UI_ICONS.CARET_UP : UI_ICONS.CARET_DOWN;
                const colorClass = isSell ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE;

                targetHtml = `
                    <span class="${CSS_CLASSES.FONT_SIZE_0_7_REM} ${CSS_CLASSES.WHITESPACE_NOWRAP}">
                        ${label} <i class="fas ${iconClass} ${colorClass} ${CSS_CLASSES.MX_TINY}"></i> ${formatCurrency(item.targetPrice)}
                    </span>
                `;
            }

            // Rating Logic
            const hasStars = item.starRating && item.starRating > 0;
            let starsHtml = '';
            if (hasStars) {
                const rating = item.starRating;
                for (let i = 1; i <= 5; i++) {
                    // User Req: Stars in Coffee color (var(--color-accent))
                    // Only render active stars, NO empty stars
                    if (i <= rating) {
                        starsHtml += `<i class="fas ${UI_ICONS.STAR} ${CSS_CLASSES.TEXT_COFFEE}"></i>`;
                    } else if (i - 0.5 <= rating) {
                        starsHtml += `<i class="fas ${UI_ICONS.STAR_HALF} ${CSS_CLASSES.TEXT_COFFEE}"></i>`;
                    }
                }
                starsHtml = `<div class="${CSS_CLASSES.STAR_RATING} ${CSS_CLASSES.JUSTIFY_CENTER}" title="Rating: ${rating}/5">${starsHtml}</div>`;
            }

            // Notes Logic
            const hasNotes = item.comments && item.comments.length > 0;
            const notesHtml = hasNotes ? `<i class="fas ${UI_ICONS.CHECK}" style="color: var(--color-accent);"></i>` : '';

            extraCells = `
                <td>${targetHtml}</td>
                <td>${starsHtml}</td>
                <td class="text-center">${notesHtml}</td>
            `;
        }

        return `
            <tr data-id="${item.id}" data-code="${item.code}" class="${trendClass}">
                <td class="${CSS_CLASSES.CODE_CELL} ${CSS_CLASSES.FONT_BOLD}">${item.code}</td>
                <td>${formatCurrency(price)}</td>
                <td class="${CSS_CLASSES.DESKTOP_ONLY} ${changeValue >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE} ${CSS_CLASSES.CHANGE_VALUE}">
                    ${formatCurrency(changeValue)} (${formatPercent(changePercent)})
                </td>
                ${extraCells}
            </tr>
        `;
    }

    createCardHTML(item, type = PORTFOLIO_ID) {
        const price = item.currentPrice || 0;
        const changePercent = item.dayChangePercent || 0;

        const isPortfolioView = AppState.watchlist.id === 'PORTFOLIO' ||
            AppState.watchlist.type === PORTFOLIO_ID ||
            AppState.watchlist.name === 'Portfolio' ||
            AppState.isPortfolioVisible;

        // In NON-portfolio views, we always use per-share change
        const changeValue = isPortfolioView ? (item.dayChangeValue || 0) : (item.dayChangePerShare || 0);

        let trendClass = CSS_CLASSES.TREND_UP;
        let caretClass = UI_ICONS.CARET_UP;
        let showIcon = true;

        if (changePercent < 0) {
            trendClass = CSS_CLASSES.TREND_DOWN;
            caretClass = UI_ICONS.CARET_DOWN;
        } else if (changePercent === 0) {
            trendClass = CSS_CLASSES.TREND_NEUTRAL;
            showIcon = false;
        }

        if (type === PORTFOLIO_ID) {
            const value = item.value || 0;
            const capitalGain = item.capitalGain || 0;
            const ghostClass = item.isHidden ? CSS_CLASSES.GHOSTED : '';
            const eyeIcon = item.isHidden ? UI_ICONS.EYE_SLASH : UI_ICONS.EYE;

            // For the new Portfolio Card, always use TOTAL holding change
            const displayChangeValue = item.dayChangeValue || 0;

            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass} ${ghostClass}" data-id="${item.id}" data-code="${item.code}">
                    <div class="${CSS_CLASSES.CARD_HEADER_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MB_2PX}">
                        <div class="${CSS_CLASSES.CARD_HEADER_LEFT} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.GAP_SMALL}">
                            <span class="${CSS_CLASSES.CARD_CODE}" data-code="${item.code}">${item.code}</span>
                            <button class="${CSS_CLASSES.ICON_BTN_GHOST} ${CSS_CLASSES.VISIBILITY_TOGGLE_BTN} ${CSS_CLASSES.P_0} ${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.MT_NEG_2PX}" 
                                    onclick="event.stopPropagation(); document.dispatchEvent(new CustomEvent('${EVENTS.SHARE_TOGGLE_VISIBILITY}', { detail: { id: '${item.id}' } }))"
                                    title="${item.isHidden ? 'Show Share' : 'Hide Share'}">
                                <i class="fas ${eyeIcon}"></i>
                            </button>
                        </div>
                        <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.TEXT_CENTER} ${CSS_CLASSES.FLEX_2}">${formatCurrency(price)}</span>
                        <div class="${CSS_CLASSES.CARD_CHANGE_COL} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_END}">
                            <span class="${CSS_CLASSES.CHANGE_VALUE} ${displayChangeValue >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${displayChangeValue >= 0 ? '+' : ''}${formatCurrency(displayChangeValue)}
                            </span>
                            <span class="${CSS_CLASSES.CHANGE_PERCENT} ${CSS_CLASSES.TEXT_SM} ${changePercent >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${formatPercent(changePercent)}
                            </span>
                        </div>
                    </div>

                    <div class="${CSS_CLASSES.CARD_BODY_SECTION} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MT_TINY} ${CSS_CLASSES.BORDER_TOP_FAINT} ${CSS_CLASSES.PT_SMALL}">
                        <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.PY_TINY}">
                            <span class="${CSS_CLASSES.DETAIL_LABEL}">Current Value</span>
                            <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.FONT_BOLD}">${formatCurrency(value)}</span>
                        </div>
                        <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.PY_TINY}">
                            <span class="${CSS_CLASSES.DETAIL_LABEL}">Capital Gain</span>
                            <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.FONT_BOLD} ${capitalGain >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${formatCurrency(capitalGain)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'watchlist') {
            const hasAlert = item.targetPrice && item.targetPrice !== 0;
            const hasStars = item.starRating && item.starRating !== 0;
            const hasComments = item.comments && item.comments.length > 0;

            const alertHtml = hasAlert ? (() => {
                const isSell = item.buySell === 'sell';
                const letter = isSell ? 'S' : 'B';
                const icon = isSell ? UI_ICONS.CARET_UP : UI_ICONS.CARET_DOWN;
                const colorClass = isSell ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE;
                return `
                <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.MB_4PX} ${CSS_CLASSES.ALIGN_BASELINE}">
                    <span class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.LINE_HEIGHT_1} ${CSS_CLASSES.FONT_SIZE_0_7_REM} ${CSS_CLASSES.TEXT_NORMAL_CASE}">Alert target</span>
                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.LINE_HEIGHT_1} ${CSS_CLASSES.FONT_SIZE_0_7_REM}" data-target="${item.targetPrice}">
                        <span class="${CSS_CLASSES.PRIMARY_TEXT} ${CSS_CLASSES.TEXT_700} ${CSS_CLASSES.MR_TINY}">${letter}</span><i class="fas ${icon} ${colorClass} ${CSS_CLASSES.FONT_SIZE_0_7_REM} ${CSS_CLASSES.MR_2PX} ${CSS_CLASSES.OPACITY_100}"></i>${formatCurrency(item.targetPrice)}
                    </span>
                </div>`;
            })() : '';

            const starsHtml = hasStars ? `
                <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_END} ${CSS_CLASSES.MB_4PX} ${CSS_CLASSES.ALIGN_BASELINE} ${CSS_CLASSES.W_FULL}">
                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.LINE_HEIGHT_1} ${CSS_CLASSES.FONT_SIZE_0_7_REM}">
                        ${Array(item.starRating).fill(`<i class="fas ${UI_ICONS.STAR} ${CSS_CLASSES.FONT_SIZE_0_7_REM} ${CSS_CLASSES.TEXT_COFFEE} ${CSS_CLASSES.OPACITY_70}"></i>`).join('')}
                    </span>
                </div>` : '';

            const commentsHtml = hasComments ? `
                <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_START} ${CSS_CLASSES.MB_0PX}">
                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.TEXT_XXS} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.TEXT_OVERFLOW_ELLIPSIS} ${CSS_CLASSES.OVERFLOW_HIDDEN} ${CSS_CLASSES.WHITESPACE_NOWRAP} ${CSS_CLASSES.LINE_HEIGHT_1} ${CSS_CLASSES.FONT_SIZE_0_7_REM}">${item.comments[item.comments.length - 1].body}</span>
                </div>` : '';

            const hasMetadata = hasAlert || hasStars || hasComments;
            const metadataSection = hasMetadata ? `
                <div class="${CSS_CLASSES.CARD_BODY_SECTION} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MT_4PX} ${CSS_CLASSES.BORDER_TOP_NONE} ${CSS_CLASSES.PT_0}">
                    <!-- Alerts Deep Link -->
                    <div data-action="deep-link" data-id="${item.id}" data-section="target" class="${CSS_CLASSES.CURSOR_POINTER} ${CSS_CLASSES.RELATIVE} ${CSS_CLASSES.Z_10}">
                        ${alertHtml}
                    </div>
                    
                    ${starsHtml}

                    <!-- Comments Deep Link -->
                    <div data-action="deep-link" data-id="${item.id}" data-section="notes" class="${CSS_CLASSES.CURSOR_POINTER} ${CSS_CLASSES.RELATIVE} ${CSS_CLASSES.Z_10}">
                        ${commentsHtml}
                    </div>
                </div>` : '';

            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass} ${CSS_CLASSES.PB_4PX}" data-id="${item.id}" data-code="${item.code}">
                    <div class="${CSS_CLASSES.CARD_HEADER_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MB_2PX}">
                        <div class="${CSS_CLASSES.CARD_HEADER_LEFT} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START}">
                            <span class="${CSS_CLASSES.CARD_CODE}" data-code="${item.code}">${item.code}</span>
                        </div>
                        <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.TEXT_CENTER} ${CSS_CLASSES.FLEX_2}">${formatCurrency(price)}</span>
                        <div class="${CSS_CLASSES.CARD_CHANGE_COL} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_END}">
                            <span class="${CSS_CLASSES.CHANGE_VALUE} ${changeValue >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${changeValue >= 0 ? '+' : ''}${formatCurrency(changeValue)}
                            </span>
                            <span class="${CSS_CLASSES.CHANGE_PERCENT} ${CSS_CLASSES.TEXT_SM} ${changePercent >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${formatPercent(changePercent)}
                            </span>
                        </div>
                    </div>
                    ${metadataSection}
                </div>
            `;
        } else if (type === 'compact') {
            const iconHtml = changePercent !== 0
                ? `<i class="fas ${changePercent > 0 ? UI_ICONS.CARET_UP : UI_ICONS.CARET_DOWN} ${CSS_CLASSES.CHEVRON_ICON}"></i>`
                : '';

            let costPriceHtml = '';
            // Only show Cost Price in Portfolio View
            if (isPortfolioView) {
                const costPrice = item.costPrice || 0;
                // Only show if we have a valid cost price (optional check, but good for UI cleanliness)
                if (costPrice > 0) {
                    costPriceHtml = `<span class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.GHOSTED} ${CSS_CLASSES.TEXT_RIGHT}" title="Avg Cost Price">${formatCurrency(costPrice)}</span>`;
                }
            }

            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass}" data-id="${item.id}" data-code="${item.code}" data-view="compact">
                    ${iconHtml}
                    <div class="${CSS_CLASSES.CARD_HEADER} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL}">
                        <span class="${CSS_CLASSES.CARD_CODE} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.CODE_PILL}" data-code="${item.code}">${item.code}</span>
                        
                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.ALIGN_BASELINE} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MT_TINY}">
                            <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.PRIMARY_TEXT} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.TEXT_LEFT}">${formatCurrency(price)}</span>
                            ${costPriceHtml}
                        </div>
                    </div>
                    <div class="${CSS_CLASSES.SNAPSHOT_FOOTER}">
                        <span class="${CSS_CLASSES.CHANGE_VALUE} ${CSS_CLASSES.TEXT_SM}">${formatCurrency(changeValue)}</span>
                        <span class="${CSS_CLASSES.CHANGE_VALUE} ${CSS_CLASSES.TEXT_SM}">${formatPercent(changePercent)}</span>
                    </div>
                </div>
            `;
        } else {
            // Snapshot View
            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass}" data-id="${item.id}" data-code="${item.code}" data-view="snapshot">
                    <div class="${CSS_CLASSES.CARD_HEADER} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL}">
                        <span class="${CSS_CLASSES.CARD_CODE} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.CODE_PILL}" data-code="${item.code}">${item.code}</span>
                        <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.PRIMARY_TEXT} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.MT_TINY}">${formatCurrency(price)}</span>
                    </div>
                    <div class="${CSS_CLASSES.SNAPSHOT_FOOTER}">
                        <span class="${CSS_CLASSES.CHANGE_VALUE} ${CSS_CLASSES.TEXT_SM}">${formatCurrency(changeValue)}</span>
                        <span class="${CSS_CLASSES.CHANGE_VALUE} ${CSS_CLASSES.TEXT_SM}">${formatPercent(changePercent)}</span>
                    </div>
                </div>
            `;
        }
    }

    renderSummary(metrics) {
        // 1. Create Container
        const container = document.createElement('div');
        container.id = 'portfolio-summary';
        container.className = CSS_CLASSES.PORTFOLIO_SUMMARY;
        // Note: Styles for .portfolio-summary should be in CSS, not JS.

        const isDailyPos = metrics.dayChangeValue >= 0;
        const dailySign = isDailyPos ? '+' : ''; // Only for Currency, formatPercent handles its own sign
        const dailyBorder = isDailyPos ? CSS_CLASSES.BORDER_POSITIVE : CSS_CLASSES.BORDER_NEGATIVE;

        const isTotalPos = metrics.totalReturn >= 0;
        const totalSign = isTotalPos ? '+' : '';
        const totalBorder = isTotalPos ? CSS_CLASSES.BORDER_POSITIVE : CSS_CLASSES.BORDER_NEGATIVE;

        // 2. Construct HTML (Card Layout with Inline Percentages)
        container.innerHTML = `
            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE} ${CSS_CLASSES.BORDER_NEUTRAL}" data-type="${SUMMARY_TYPES.VALUE}">
                <span class="${CSS_CLASSES.METRIC_LABEL}">Portfolio Value</span>
                <div class="${CSS_CLASSES.METRIC_ROW}">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE}">${formatCurrency(metrics.totalValue)}</span>
                </div>
            </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE} ${dailyBorder}" data-type="${SUMMARY_TYPES.DAY_CHANGE}">
                <span class="${CSS_CLASSES.METRIC_LABEL}">Day Change</span>
                <div class="${CSS_CLASSES.METRIC_ROW}">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${(metrics.dayChangeValue >= 0) ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                        ${(metrics.dayChangeValue >= 0 ? '+' : '')}${formatCurrency(metrics.dayChangeValue)}
                    </span>
                    <span class="${CSS_CLASSES.METRIC_PERCENT_SMALL} ${(metrics.dayChangePercent >= 0) ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                        ${formatPercent(metrics.dayChangePercent)}
                    </span>
                </div>
            </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE} ${CSS_CLASSES.BORDER_POSITIVE}" data-type="${SUMMARY_TYPES.WINNERS}">
                <span class="${CSS_CLASSES.METRIC_LABEL}">Day Gain</span>
                <div class="${CSS_CLASSES.METRIC_ROW}">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${CSS_CLASSES.TEXT_POSITIVE}">
                        +${formatCurrency(metrics.dayGain || 0)}
                    </span>
                </div>
            </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE} ${CSS_CLASSES.BORDER_NEGATIVE}" data-type="${SUMMARY_TYPES.LOSERS}">
                <span class="${CSS_CLASSES.METRIC_LABEL}">Day Loss</span>
                <div class="${CSS_CLASSES.METRIC_ROW}">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${CSS_CLASSES.TEXT_NEGATIVE}">
                        ${formatCurrency(metrics.dayLoss || 0)}
                    </span>
                </div>
            </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE} ${totalBorder}" data-type="${SUMMARY_TYPES.CAPITAL_GAIN}">
                <span class="${CSS_CLASSES.METRIC_LABEL}">Total Capital Gain</span>
                <div class="${CSS_CLASSES.METRIC_ROW}">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${isTotalPos ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                        ${totalSign}${formatCurrency(metrics.totalReturn)}
                    </span>
                    <span class="${CSS_CLASSES.METRIC_PERCENT_SMALL} ${isTotalPos ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                        ${formatPercent(metrics.totalReturnPercent)}
                    </span>
                </div>
            </div>
        `;

        // Add Click Listeners
        container.querySelectorAll(`.${CSS_CLASSES.SUMMARY_CARD}.${CSS_CLASSES.CLICKABLE}`).forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_SUMMARY_DETAIL, { detail: { type } }));
            });
        });

        // TRIGGER BINDING: Portfolio Value Card -> Market Pulse
        const valueCard = container.querySelector(`[data-type="${SUMMARY_TYPES.VALUE}"]`);
        if (valueCard) {
            SnapshotUI.bindTrigger(valueCard);
        }

        // 3. Inject (Prepend to main container)
        this.container.prepend(container);
    }

    renderStockDetailsModal(stock) {
        const existingModal = document.getElementById(IDS.STOCK_DETAILS_MODAL);
        if (existingModal) existingModal.remove();

        // Calculate Derived Metrics
        const currentPrice = stock.currentPrice || 0;
        const units = stock.units || 0;
        const avgPrice = stock.costPrice || 0;
        const totalValue = stock.value || 0;
        const costBasis = stock.costBasis || 0;
        const capitalGain = stock.capitalGain || 0;
        const isGainPos = capitalGain >= 0;

        // Watchlist Membership Text
        const watchlistsText = stock.watchlistNames && stock.watchlistNames.length > 0
            ? `In: ${stock.watchlistNames.join(' / ')} `
            : '';

        // Price Change Formatting
        const change = Number(stock.change || 0);
        const isPos = change > 0;
        const isNeg = change < 0;
        const isNeu = change === 0;
        const changeStr = isPos ? `+ ${formatCurrency(change)}` : formatCurrency(change);
        const pctStr = formatPercent(stock.pctChange || stock.dayChangePercent);

        const colorClass = isPos ? CSS_CLASSES.PREVIEW_CHANGE_POS : (isNeg ? CSS_CLASSES.PREVIEW_CHANGE_NEG : CSS_CLASSES.NEUTRAL);

        const modal = document.createElement('div');
        modal.id = IDS.STOCK_DETAILS_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        // Research Links Map
        const links = RESEARCH_LINKS_TEMPLATE.map(link => ({
            name: link.name,
            url: link.url.replace(/\${code}/g, stock.code)
        }));

        const safeVal = (v, fmt) => (v !== undefined && v !== null && v !== 0) ? fmt(v) : '-';

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
                <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_LARGE}">
                    <!-- Header -->
                    <div class="${CSS_CLASSES.MODAL_HEADER}">
                        <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                            <h1 class="${CSS_CLASSES.MODAL_TITLE} ${CSS_CLASSES.DISPLAY_TITLE}">${stock.code}</h1>
                            <div class="${CSS_CLASSES.MODAL_SUBTITLE}">${stock.name || 'ASX Share'}</div>
                        </div>
                        <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                            <button id="${IDS.BTN_EDIT_SHARE}" class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.EDIT_BTN}" title="Edit Share">
                                <i class="fas ${UI_ICONS.EDIT}"></i>
                            </button>
                            <button id="${IDS.BTN_DELETE_SHARE}" class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.DELETE_BTN}" title="Delete Share">
                                <i class="fas ${UI_ICONS.DELETE}"></i>
                            </button>
                            <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                                <i class="fas ${UI_ICONS.CLOSE}"></i>
                            </button>
                        </div>
                    </div>

                    <div class="${CSS_CLASSES.MODAL_BODY}">
                        <div class="${CSS_CLASSES.SHARE_DETAIL_SECTIONS}">

                            <!-- Card 1: Investment -->
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.TEXT_LEFT} ${CSS_CLASSES.INVESTMENT_CARD}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.TEXT_LEFT} ${CSS_CLASSES.START_CENTER_ROW}">
                                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.W_FULL}">
                                            <span>Investment</span>
                                            <div class="kangaroo-wrapper ${stock.muted ? 'is-muted' : ''}"
                                                 title="${stock.muted ? 'Unmute Share' : 'Mute Share'}"
                                                 onclick="event.stopPropagation(); this.classList.toggle('is-muted'); document.dispatchEvent(new CustomEvent('${EVENTS.TOGGLE_SHARE_MUTE}', { detail: { id: '${stock.id}' } }))">
                                                <img src="${KANGAROO_ICON_SRC}" class="kangaroo-icon-img" />
                                            </div>
                                        </div>
                                    </h3>
                                    ${stock.starRating > 0 ? `
                                        <div class="${CSS_CLASSES.STAR_RATING}">
                                            ${Array.from({ length: stock.starRating }, () => `
                                                <i class="fas ${UI_ICONS.STAR} ${CSS_CLASSES.TEXT_COFFEE}"></i>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="${CSS_CLASSES.PRICE_PREVIEW} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.BORDER_NONE} ${CSS_CLASSES.BG_TRANSPARENT} ${CSS_CLASSES.GAP_SMALL} ${CSS_CLASSES.MB_0} ${CSS_CLASSES.FLEX_COLUMN}">
                                    <div class="${CSS_CLASSES.PREVIEW_ROW_MAIN} ${CSS_CLASSES.MB_TINY}">
                                        <span class="${CSS_CLASSES.PREVIEW_PRICE} ${CSS_CLASSES.PREVIEW_PRICE_LARGE}">${formatCurrency(stock.live || currentPrice)}</span>
                                        <span class="${CSS_CLASSES.PREVIEW_CHANGE} ${CSS_CLASSES.PREVIEW_CHANGE_LARGE} ${isPos ? CSS_CLASSES.PREVIEW_CHANGE_POS : CSS_CLASSES.PREVIEW_CHANGE_NEG}">
                                            ${changeStr} (${pctStr})
                                        </span>
                                    </div>

                                    ${units > 0 ? `
                                    <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.PT_TINY} ${CSS_CLASSES.MB_SMALL}">
                                        <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Impact</span>
                                        <span class="${CSS_CLASSES.DETAIL_VALUE} ${stock.dayChangeValue > 0 ? CSS_CLASSES.POSITIVE : (stock.dayChangeValue < 0 ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.NEUTRAL)}">
                                            ${stock.dayChangeValue > 0 ? '+' : ''}${formatCurrency(stock.dayChangeValue || 0)}
                                        </span>
                                    </div>
                                    ` : ''}

                                    <div class="${CSS_CLASSES.PREVIEW_ROW_SUB}">
                                        <div class="${CSS_CLASSES.STAT_COL} ${CSS_CLASSES.ALIGN_START}">
                                            <span class="${CSS_CLASSES.STAT_LABEL}">52W Low</span>
                                            <span class="${CSS_CLASSES.STAT_VAL} ${CSS_CLASSES.TEXT_MD} ${CSS_CLASSES.TEXT_WHITE}">${safeVal(stock.low, formatCurrency)}</span>
                                        </div>
                                        <div class="${CSS_CLASSES.STAT_COL} ${CSS_CLASSES.ALIGN_CENTER}">
                                            <span class="${CSS_CLASSES.STAT_LABEL}">52W High</span>
                                            <span class="${CSS_CLASSES.STAT_VAL} ${CSS_CLASSES.TEXT_MD} ${CSS_CLASSES.TEXT_WHITE}">${safeVal(stock.high, formatCurrency)}</span>
                                        </div>
                                        <div class="${CSS_CLASSES.STAT_COL} ${CSS_CLASSES.ALIGN_END}">
                                            <span class="${CSS_CLASSES.STAT_LABEL}">P/E Ratio</span>
                                            <span class="${CSS_CLASSES.STAT_VAL} ${CSS_CLASSES.TEXT_MD}">${safeVal(stock.pe, (v) => v.toFixed(2))}</span>
                                        </div>
                                    </div>
                                    ${watchlistsText ? `
                                            <div class="${CSS_CLASSES.WATCHLIST_MEMBERSHIP} ${CSS_CLASSES.GHOSTED} ${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.OPACITY_70} ${CSS_CLASSES.ITALIC} ${CSS_CLASSES.PT_TINY} ${CSS_CLASSES.MT_AUTO} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.TEXT_LEFT}">
                                                ${watchlistsText}
                                            </div>
                                        ` : ''}
                                </div>
                            </div>

                            <!-- Card 2: Holdings & Performance (Conditional) -->
                            ${units > 0 ? `
                            <div class="${CSS_CLASSES.DETAIL_CARD}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <i class="fas ${UI_ICONS.WALLET}"></i> Holdings & Performance
                                    </h3>
                                </div>
                                
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Total Units</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${units}</span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Unit Cost</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatCurrency(avgPrice)}</span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Unit Margin</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${((stock.live || currentPrice) - avgPrice) > 0 ? CSS_CLASSES.POSITIVE : (((stock.live || currentPrice) - avgPrice) < 0 ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.NEUTRAL)}">
                                        ${((stock.live || currentPrice) - avgPrice) > 0 ? '+' : ''}${formatCurrency((stock.live || currentPrice) - avgPrice)} 
                                        (${formatPercent((((stock.live || currentPrice) - avgPrice) / (avgPrice || 1)) * 100)})
                                    </span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Cost</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatCurrency(costBasis)}</span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Return</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${capitalGain > 0 ? CSS_CLASSES.POSITIVE : (capitalGain < 0 ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.NEUTRAL)}">
                                        ${capitalGain > 0 ? '+' : ''}${formatCurrency(capitalGain)}
                                    </span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Value</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.FONT_BOLD_700} ${capitalGain > 0 ? CSS_CLASSES.POSITIVE : (capitalGain < 0 ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.NEUTRAL)}">
                                        ${formatCurrency(totalValue)}
                                    </span>
                                </div>

                                ${stock.purchaseDate ? `
                                <div class="${CSS_CLASSES.WATCHLIST_MEMBERSHIP} ${CSS_CLASSES.GHOSTED} ${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.OPACITY_70} ${CSS_CLASSES.ITALIC} ${CSS_CLASSES.PT_TINY} ${CSS_CLASSES.MT_AUTO} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.TEXT_LEFT}">
                                    Last Purchased: ${formatFriendlyDate(stock.purchaseDate)}
                                </div>
                                ` : ''}
                            </div>
                            ` : ''}
    
                            <!-- Card 3: Dividends -->
                            ${stock.dividendAmount > 0 ? `
                            <div class="${CSS_CLASSES.DETAIL_CARD}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <i class="fas ${UI_ICONS.DIVIDENDS}"></i> Dividends
                                    </h3>
                                </div>
                                
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Dividend Amount</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatCurrency(stock.dividendAmount || 0)}</span>
                                </div>
    
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Franking Credits</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${(stock.frankingCredits || 0)}%</span>
                                </div>
    
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Unfranked Yield</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatPercent(((stock.dividendAmount || 0) / (stock.live || currentPrice || 1)) * 100)}</span>
                                </div>
    
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Franked Yield</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatPercent((((stock.dividendAmount || 0) / (stock.live || currentPrice || 1)) * 100) * (1 + ((stock.frankingCredits || 0) / 100 * 0.4286)))}</span>
                                </div>
                            </div>
                            ` : ''}
    
                            <!-- Card 4: Alerts (Dynamic Target Price) -->
                            ${stock.targetPrice > 0 ? `
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${CSS_CLASSES.CURSOR_POINTER}" data-action="deep-link" data-id="${stock.id}" data-section="target">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <i class="fas ${UI_ICONS.ALERTS}"></i> Alerts
                                    </h3>
                                </div>
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Target Price</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.DISPLAY_FLEX} ${CSS_CLASSES.ALIGN_CENTER} ${CSS_CLASSES.GAP_6PX}">
                                        <span class="${CSS_CLASSES.TEXT_WHITE} ${CSS_CLASSES.TEXT_700}">${(stock.buySell === 'sell') ? 'S' : 'B'}</span>
                                        <i class="fas ${(stock.buySell === 'sell') ? UI_ICONS.CARET_UP : UI_ICONS.CARET_DOWN} ${(stock.buySell === 'sell') ? CSS_CLASSES.POSITIVE : CSS_CLASSES.NEGATIVE} ${CSS_CLASSES.FONT_1_1_REM}"></i>
                                        <span>${formatCurrency(stock.targetPrice)}</span>
                                    </span>
                                </div>
                            </div>
                            ` : ''}

                            <!-- Card 5: Comments (Conditional) -->
                            ${stock.comments && stock.comments.length > 0 ? `
                                <div class="${CSS_CLASSES.DETAIL_CARD} ${CSS_CLASSES.CURSOR_POINTER}" data-action="deep-link" data-id="${stock.id}" data-section="notes">
                                    <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                        <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                            <i class="fas ${UI_ICONS.COMMENTS}"></i> Comments
                                        </h3>
                                    </div>
                                    <div class="${CSS_CLASSES.COMMENTS_LIST}">
                                        ${stock.comments.map(c => `
                                            <div class="${CSS_CLASSES.COMMENT_ITEM} ${CSS_CLASSES.MT_SMALL} ${CSS_CLASSES.PY_TINY}">
                                                <div class="${CSS_CLASSES.PRIMARY_TEXT} ${CSS_CLASSES.TEXT_SM}">${c.body}</div>
                                                <div class="${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.TEXT_XXS} ${CSS_CLASSES.OPACITY_70} ${CSS_CLASSES.MT_TINY}">${formatFriendlyDate(c.date)}</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                ` : ''}

                            <!-- Card 5: Entry Details (Decoupled & Decentered) -->
                            <div class="${CSS_CLASSES.DETAIL_CARD}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <i class="fas ${UI_ICONS.HISTORY}"></i> Entry Details
                                    </h3>
                                </div>
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Entry Price</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatCurrency(stock.enteredPrice || 0)}</span>
                                </div>
                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Entry Date</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatFriendlyDate(stock.entryDate)}</span>
                                </div>
                            </div>

                            <!-- Card 6: Research -->
                            <div class="${CSS_CLASSES.DETAIL_CARD}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <i class="fas ${UI_ICONS.GLOBE}"></i> Research
                                    </h3>
                                </div>
                                <div class="${CSS_CLASSES.EXTERNAL_LINKS_GRID}">
                                    ${links.map(link => `
                                            <a href="${link.url}" target="_blank" class="${CSS_CLASSES.EXTERNAL_LINK}">
                                                <span class="${CSS_CLASSES.LINK_TEXT}">${link.name}</span>
                                                <i class="fas ${CSS_CLASSES.EXTERNAL_LINK_ALT}"></i>
                                            </a>
                                        `).join('')}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
        `;

        document.body.appendChild(modal);

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

        modal.querySelectorAll(`.${CSS_CLASSES.MODAL_CLOSE_BTN}, .${CSS_CLASSES.MODAL_OVERLAY}`).forEach(el => el.addEventListener('click', close));

        // Delete Handler
        const deleteBtn = modal.querySelector('#btn-delete-share');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                // 1. CLEAR focus immediately
                deleteBtn.blur();

                // 2. Logic
                if (confirm(USER_MESSAGES.CONFIRM_DELETE)) {
                    // Confirmed: Disable
                    deleteBtn.disabled = true;
                    deleteBtn.classList.add(CSS_CLASSES.DISABLED, CSS_CLASSES.GHOSTED);

                    const event = new CustomEvent(EVENTS.REQUEST_DELETE_SHARE, {
                        detail: {
                            shareId: stock.id,
                            watchlistId: stock.watchlistId || 'portfolio'
                        }
                    });
                    document.dispatchEvent(event);
                    close();
                } else {
                    // Cancelled: Re-issue blur in case browser restored focus to triggering element
                    deleteBtn.blur();
                }
                // If Cancel, nothing happens, button stays fully enabled.
            });
        }

        // Edit Handler
        const editBtn = modal.querySelector(`#${IDS.BTN_EDIT_SHARE}`);
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                // REMOVED close() to allow stacking and "Step Back" support.
                // Details modal stays open, Edit modal pushes on top.

                // Delay opening new modal to allow history to settle (lock safety)
                setTimeout(() => {
                    const event = new CustomEvent(EVENTS.REQUEST_EDIT_SHARE, { detail: { code: stock.code, id: stock.id } });
                    document.dispatchEvent(event);
                }, 150);
            });
        }

        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
        });
    }

    _renderStars(count) {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            const cls = i <= count ? `fas ${UI_ICONS.STAR} ${CSS_CLASSES.ACTIVE}` : `${UI_ICONS.STAR_EMPTY} ${CSS_CLASSES.TEXT_MUTED}`;
            html += `<i class="${cls}"></i>`;
        }
        return html;
    }

    _getSortIndicator(field) {
        const config = AppState.sortConfig;
        if (config.field !== field) return `<span class="${CSS_CLASSES.SORT_ICON} ${CSS_CLASSES.SORT_ICON_MUTED}"><i class="fas ${UI_ICONS.SORT}"></i></span>`;

        return config.direction === 'asc'
            ? `<span class="${CSS_CLASSES.SORT_ICON}"><i class="fas ${UI_ICONS.SORT_UP}"></i></span>`
            : `<span class="${CSS_CLASSES.SORT_ICON}"><i class="fas ${UI_ICONS.SORT_DOWN}"></i></span>`;
    }






    /**
     * Updates the Sort Button UI with the active sort configuration
     * @param {string} watchlistId 
     * @param {Object} currentSort 
     */
    updateSortButtonUI(watchlistId, currentSort) {
        let type = 'STOCK';
        if (watchlistId === 'portfolio') type = 'PORTFOLIO';
        if (watchlistId === 'CASH') type = 'CASH';

        const options = SORT_OPTIONS[type] || SORT_OPTIONS.STOCK;

        // Safety Fallback: If currentSort is missing, derive default from type
        const safeSort = currentSort || (type === 'CASH' ? { field: 'category', direction: 'asc' } : { field: 'code', direction: 'asc' });

        // Lookup by FIELD only (Registry is now compressed)
        // If field not found in this type's options, fallback to first option
        const activeOption = options.find(opt => opt.field === safeSort.field) || options[0];

        // ASX SVG Injection for Header Button (Mirror Modal exactly)
        let iconHtml;
        if (activeOption.label === 'ASX Code') {
            iconHtml = `
            <svg class="${CSS_CLASSES.SORT_ASX_ICON}" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-weight="400" font-size="10" fill="currentColor">ASX</text>
            </svg>`;
        } else {
            iconHtml = `<i class="fas ${activeOption.icon}"></i>`;
        }

        // RETARGETING: Update the Sort Picker Button (.header-action-btn)
        const sortBtn = document.getElementById(IDS.SORT_PICKER_BTN);
        if (sortBtn) {
            // Context Aware Logic (Matching Modal)
            const isTextField = ['code', 'name', 'category', 'comments', 'targetPrice'].includes(activeOption.field);
            const highToLowDir = isTextField ? 'asc' : 'desc';

            // Determine if current state is High to Low (Green Up) or Low to High (Red Down)
            // MUST use safeSort.direction, not activeOption.direction
            let isHighToLow = (safeSort.direction === highToLowDir);

            // Icon & Color Logic
            // High to Low = Green Up
            // Low to High = Red Down
            const arrowIcon = isHighToLow ? UI_ICONS.CARET_UP : UI_ICONS.CARET_DOWN;
            const arrowColorClass = isHighToLow ? CSS_CLASSES.POSITIVE : CSS_CLASSES.NEGATIVE;

            // Global Sort Styling
            let arrowClass = arrowColorClass;
            if (AppState.preferences.globalSort) {
                sortBtn.classList.add(CSS_CLASSES.TEXT_COFFEE);
                arrowClass = ''; // Inherit coffee color
            } else {
                sortBtn.classList.remove(CSS_CLASSES.TEXT_COFFEE);
            }

            // Update innerHTML
            sortBtn.innerHTML = `${iconHtml} <span>${activeOption.label}</span> <i class="fas ${arrowIcon} ${arrowClass}"></i>`;
        }
    }

    /**
     * Renders the Research & Add Modal (Sidebar Feature).
     * @param {Object} stock - Stock data object (code, name, live, high, low, pe, etc).
     * @param {Function} onAddCallback - (code) => void.
     */
    renderResearchModal(stock, onAddCallback) {
        // cleanup
        document.getElementById(IDS.RESEARCH_MODAL)?.remove();

        // Template Replacement
        const linksHtml = RESEARCH_LINKS_TEMPLATE.map(link => {
            const url = link.url.replace(/\${code}/g, stock.code);
            return `
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="${CSS_CLASSES.RESEARCH_LINK_CARD}">
                    <span class="${CSS_CLASSES.LINK_TEXT}">${link.name}</span>
                    <i class="fas ${CSS_CLASSES.EXTERNAL_LINK_ALT}"></i>
                </a>
            `;
        }).join('');

        const safeVal = (v, fmt) => (v !== undefined && v !== null && v !== 0) ? fmt(v) : '-';

        const modal = document.createElement('div');
        modal.id = IDS.RESEARCH_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
                <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM} ${CSS_CLASSES.RESEARCH_MODAL_CONTENT}">
                    <div class="${CSS_CLASSES.MODAL_HEADER}">
                        <div>
                            <h2 class="${CSS_CLASSES.MODAL_TITLE}">${stock.code}</h2>
                            <div class="${CSS_CLASSES.MODAL_SUBTITLE}">${stock.name}</div>
                        </div>
                        <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                            <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.DELETE_BTN} ${CSS_CLASSES.HIDDEN}" title="Delete">
                                <i class="fas ${UI_ICONS.DELETE}"></i>
                            </button>
                            <button id="${IDS.RESEARCH_ADD_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.SAVE_BTN}" title="Add to Watchlist">
                                <i class="fas ${UI_ICONS.ADD}"></i>
                            </button>
                            <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                                <i class="fas ${UI_ICONS.CLOSE}"></i>
                            </button>
                        </div>
                    </div>

                    <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}">
                        <!-- Rich Preview Section -->
                        <div class="${CSS_CLASSES.RICH_PREVIEW_CONTAINER}">
                            <div class="${CSS_CLASSES.PREVIEW_MAIN_ROW}">
                                <span class="${CSS_CLASSES.PREVIEW_PRICE}">${formatCurrency(stock.live)}</span>
                                <span class="${CSS_CLASSES.PREVIEW_CHANGE} ${stock.change >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                    ${stock.change >= 0 ? '+' : ''}${formatCurrency(stock.change)} (${formatPercent(stock.pctChange)})
                                </span>
                            </div>

                            <div class="${CSS_CLASSES.STATS_GRID}">
                                <div class="${CSS_CLASSES.STAT_ITEM}">
                                    <span class="${CSS_CLASSES.STAT_LABEL}">52W Low</span>
                                    <span class="${CSS_CLASSES.STAT_VAL}" style="color: #ffffff !important;">${safeVal(stock.low, formatCurrency)}</span>
                                </div>
                                <div class="${CSS_CLASSES.STAT_ITEM}">
                                    <span class="${CSS_CLASSES.STAT_LABEL}">52W High</span>
                                    <span class="${CSS_CLASSES.STAT_VAL}" style="color: #ffffff !important;">${safeVal(stock.high, formatCurrency)}</span>
                                </div>
                                <div class="${CSS_CLASSES.STAT_ITEM}">
                                    <span class="${CSS_CLASSES.STAT_LABEL}">P/E Ratio</span>
                                    <span class="${CSS_CLASSES.STAT_VAL}">${safeVal(stock.pe, (v) => v.toFixed(2))}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Research Links Grid -->
                        <h4 class="${CSS_CLASSES.SECTION_TITLE}">Research Tools</h4>
                        <div class="${CSS_CLASSES.RESEARCH_LINKS_GRID}">
                            ${linksHtml}
                        </div>
                    </div>
                </div>
        `;

        // Bind Events
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

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        modal.querySelector(`#${IDS.RESEARCH_ADD_BTN}`).addEventListener('click', () => {
            // REMOVED close() to allow stacking (Research -> Add)

            // Delay opening add modal to avoid race (history lock)
            setTimeout(() => {
                onAddCallback(stock.code);
            }, 150);
        });

        document.body.appendChild(modal);
    }

    renderSortPickerModal(watchlistId, currentSort, onSelect, onHide = null, onGlobalToggle = null, onGlobalCancel = null) {
        // 1. Initialize Instance Context (Fixes Stale Closures)
        // Detect Fresh Open (External Call vs Internal Re-render)
        // AppController generates a NEW onSelect callback for every click.
        const isFreshOpen = (!this._sortContext?.onSelect) || (this._sortContext.onSelect !== onSelect);
        const isDifferentWatchlist = (this._sortContext?.watchlistId !== watchlistId);

        // Capture previous pendingDir ONLY if it's an internal re-render (same onSelect & same watchlist)
        let pendingDir = (!isFreshOpen && !isDifferentWatchlist) ? this._sortContext?.pendingDir : null;

        // STRICT RULE: If Fresh Open or Watchlist Switch, force reset to Current Sort (Truth)
        // The UI rendering logic will then automatically offer the OPPOSITE of this value.
        if (!pendingDir) {
            const currentDir = currentSort.direction || 'asc';
            pendingDir = currentDir;
        }

        this._sortContext = {
            watchlistId,
            currentSort,
            onSelect,
            onHide,
            onGlobalToggle,
            onGlobalCancel,
            pendingDir
        };

        if (!this.sortPickerMode) this.sortPickerMode = 'default';

        // 2. Ensure Modal Exists (Singleton Pattern)
        const modal = this._getOrCreateSortModal();

        // 3. Prepare Data
        let type = 'STOCK';
        if (watchlistId === 'portfolio') type = 'PORTFOLIO';
        if (watchlistId === 'CASH') type = 'CASH';

        // Resolve Global Sort Order
        let options = [...(SORT_OPTIONS[type] || SORT_OPTIONS.STOCK)];
        const savedOrder = AppState.preferences.sortOptionOrder?.[type];
        if (savedOrder && Array.isArray(savedOrder)) {
            options.sort((a, b) => {
                const keyA = `${a.field}-${a.direction}`;
                const keyB = `${b.field}-${b.direction}`;
                const idxA = savedOrder.indexOf(keyA);
                const idxB = savedOrder.indexOf(keyB);
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        // Initialize Hidden Set
        if (!AppState.hiddenSortOptions[type]) AppState.hiddenSortOptions[type] = new Set();
        const hiddenSet = AppState.hiddenSortOptions[type];

        // Filter Options for Display (Hide Mode shows all)
        let displayOptions = options;
        if (this.sortPickerMode !== 'hide') {
            displayOptions = options.filter(opt => !hiddenSet.has(`${opt.field}-${opt.direction}`));
        }

        // 3a. Unified Sort Logic (Deduplicate Fields & Toggle)
        // Deduplicate Fields (Show one row per field)
        const seen = new Set();
        displayOptions = displayOptions.filter(opt => {
            if (seen.has(opt.field)) return false;
            seen.add(opt.field);
            return true;
        });

        // 4. Update UI Content (Incremental DOM Update)
        this._updateSortPickerUI(modal, displayOptions, hiddenSet, currentSort, type);

        // 5. Ensure Visibility
        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            document.getElementById(IDS.SORT_PICKER_BTN)?.classList.add(CSS_CLASSES.ACTIVE);

            // Register with NavigationManager if not already active
            if (!modal._navActive) {
                modal._navActive = true;
                navManager.pushState(() => {
                    modal._navActive = false;
                    this._closeSortPickerInstance();
                });
            }
        });
    }

    /**
     * Singleton Modal Factory with Delegated Listeners
     */
    _getOrCreateSortModal() {
        let modal = document.getElementById(IDS.SORT_PICKER_MODAL);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = IDS.SORT_PICKER_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="${IDS.SORT_MODAL_TITLE}" class="${CSS_CLASSES.MODAL_TITLE} ${CSS_CLASSES.CLICKABLE}">Select Sort Order</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" data-dismiss="modal">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <!-- Mode Selector -->
                <div id="${IDS.SORT_MODE_CONTAINER}" class="${CSS_CLASSES.HIDDEN} ${CSS_CLASSES.MODE_SELECTOR}" style="padding: 10px 20px 0 20px;">
                    <div class="${CSS_CLASSES.SEGMENTED_CONTROL}">
                        <button id="${IDS.SORT_MODE_REORDER}" class="${CSS_CLASSES.SEGMENTED_BUTTON}">Reorder</button>
                        <button id="${IDS.SORT_MODE_HIDE}" class="${CSS_CLASSES.SEGMENTED_BUTTON}">Hide</button>
                    </div>
                </div>

                <!-- Sort Direction Toggle (Unified) -->
                <div id="${IDS.SORT_DIRECTION_TOGGLE}" class="${CSS_CLASSES.SORT_TAGGLE_CONTAINER} sort-direction-toggle">
                    <div class="${CSS_CLASSES.SEGMENTED_CONTROL}">
                        <button id="${IDS.SORT_TOGGLE_BTN}" class="${CSS_CLASSES.SEGMENTED_BUTTON} w-full">
                            <!-- Content populated dynamically -->
                        </button>
                    </div>
                </div>

                <div class="${CSS_CLASSES.SORT_PICKER_LIST}" id="${IDS.SORT_PICKER_LIST}"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // --- Event Binding (Happens ONCE) ---

        // LONG PRESS LOGIC VARIABLES
        let pressTimer = null;
        let isLongPress = false;
        const LONG_PRESS_DURATION = 800; // 0.8s
        const rowSelector = `.${CSS_CLASSES.SORT_PICKER_ROW}`;

        const startPress = (e) => {
            // Only trigger on rows, not buttons inside rows
            if (e.target.closest('button') || e.target.closest('.hide-checkbox')) return;

            const row = e.target.closest(rowSelector);
            if (!row) return;

            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;

                // Trigger Global Toggle
                const context = this._sortContext || {};
                const key = row.dataset.key; // "field-direction"
                const [field] = key.split('-'); // Ignore row direction, use UI state

                // FIX: Respect the currently selected direction (pendingDir) from the UI toggle
                // Fallback to currentSort.direction to ensure we don't default to 'desc' blindly
                const direction = this._sortContext.pendingDir || this._sortContext.currentSort?.direction || 'asc';

                // Haptic/Visual Feedback
                if (navigator.vibrate) navigator.vibrate(50);

                // Animate Flash
                row.style.transition = 'background-color 0.2s';
                const originalBg = row.style.backgroundColor;
                row.style.backgroundColor = 'var(--coffee-alpha-20)'; // Visual Cue
                setTimeout(() => row.style.backgroundColor = originalBg, 200);

                if (context.onGlobalToggle) {
                    context.onGlobalToggle({ field, direction });
                }
            }, LONG_PRESS_DURATION);
        };

        const cancelPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        // Touch/Mouse Bindings for Long Press
        modal.addEventListener('mousedown', startPress);
        modal.addEventListener('touchstart', startPress, { passive: true });

        modal.addEventListener('mouseup', cancelPress);
        modal.addEventListener('mouseleave', cancelPress);
        modal.addEventListener('touchend', cancelPress);
        modal.addEventListener('touchmove', cancelPress); // Cancel if scrolled


        // Close Handlers
        const closeHandler = () => this._closeSortPickerInstance();
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', closeHandler);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', closeHandler);

        // Root Delegation (Fixes Stale Context)
        modal.addEventListener('click', (e) => {
            const context = this._sortContext || {};

            // DIAGNOSTIC CORE: Log details of Sort Picker clicks
            const targetId = e.target.id;
            const closestBtn = e.target.closest(`.${CSS_CLASSES.SEGMENTED_BUTTON}`);
            console.log('[ViewRenderer] Sort Picker Interaction:', {
                targetId,
                closestBtnId: closestBtn ? closestBtn.id : 'none',
                modeReorderId: IDS.SORT_MODE_REORDER,
                modeHideId: IDS.SORT_MODE_HIDE,
                currentPickerMode: this.sortPickerMode
            });

            // Mode Toggle via Title
            if (e.target.id === IDS.SORT_MODAL_TITLE) {
                // TERMINATION RULE: Switching to Reorder Mode cancels Global Sort
                if (context.onGlobalCancel) {
                    console.log('[ViewRenderer] Title Click -> Triggering Global Cancel');
                    context.onGlobalCancel();
                }

                this.sortPickerMode = (this.sortPickerMode === 'default') ? 'reorder' : 'default';
                this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect);
                return;
            }

            // Mode Buttons
            const reorderBtn = e.target.closest(`#${IDS.SORT_MODE_REORDER}`);
            if (reorderBtn) {
                console.log('[ViewRenderer] reorderBtn found, switching mode to reorder');
                this.sortPickerMode = 'reorder';
                this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect);
                return;
            }

            const hideBtn = e.target.closest(`#${IDS.SORT_MODE_HIDE}`);
            if (hideBtn) {
                console.log('[ViewRenderer] hideBtn found, switching mode to hide');
                this.sortPickerMode = 'hide';
                this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect);
                return;
            }


            // Direction Toggles (Unified)
            const toggleBtn = e.target.closest(`#${IDS.SORT_TOGGLE_BTN}`);
            if (toggleBtn) {
                const currentDir = this._sortContext.pendingDir || 'desc';
                const newDir = (currentDir === 'desc') ? 'asc' : 'desc';

                console.log('[ViewRenderer] Sort Toggle Clicked -> Switching to:', newDir);

                this._sortContext.pendingDir = newDir;

                // Trigger immediate sort if we have a field
                // Trigger immediate sort if we have a field
                if (context.currentSort?.field) {
                    const f = context.currentSort.field;
                    console.log('[ViewRenderer] Triggering Immediate Sort (Keep Open):', { field: f, direction: newDir });

                    // 1. Notify Controller (Updates Background List)
                    context.onSelect({ field: f, direction: newDir }, 'TOGGLE');

                    // 2. Update Modal State (Keep Open)
                    // We must update the context reference so the re-render knows the new direction
                    context.currentSort.direction = newDir;
                    this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect);
                } else {
                    this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect);
                }
                return;
            }

            // --- List Item Delegation ---
            const row = e.target.closest(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
            if (!row) return;

            const key = row.dataset.key; // "field-direction"

            // Reorder Action Buttons
            const actBtn = e.target.closest(`.${CSS_CLASSES.MODAL_REORDER_BTN}`);
            if (actBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (actBtn.disabled || actBtn.classList.contains(CSS_CLASSES.DISABLED)) return;

                const dir = actBtn.dataset.dir;
                const index = parseInt(row.dataset.index);
                const type = row.dataset.type;

                // Logic from previous handleReorder
                let options = [...(SORT_OPTIONS[type] || SORT_OPTIONS.STOCK)];
                const savedOrder = AppState.preferences.sortOptionOrder?.[type];
                if (savedOrder && Array.isArray(savedOrder)) {
                    options.sort((a, b) => {
                        const keyA = `${a.field}-${a.direction}`;
                        const keyB = `${b.field}-${b.direction}`;
                        return savedOrder.indexOf(keyA) - savedOrder.indexOf(keyB);
                    });
                }
                const hiddenSet = AppState.hiddenSortOptions[type] || new Set();
                const displayOptions = options.filter(opt => !hiddenSet.has(`${opt.field}-${opt.direction}`));

                this._handleSortReorder(type, displayOptions, index, dir, context.watchlistId, context.currentSort, context.onSelect);
                return;
            }

            // Row Interaction (Hide / Select)
            if (this.sortPickerMode === 'hide') {
                const type = row.dataset.type;
                const stringKey = String(key);
                if (!AppState.hiddenSortOptions[type]) AppState.hiddenSortOptions[type] = new Set();
                const hiddenSet = AppState.hiddenSortOptions[type];

                console.log('[ViewRenderer] Sort Hide Toggle Clicked:', stringKey, 'Type:', type, 'Target:', e.target.className);
                console.log('[ViewRenderer] Current Set:', [...hiddenSet]);

                if (hiddenSet.has(stringKey)) hiddenSet.delete(stringKey);
                else hiddenSet.add(stringKey);

                console.log('[ViewRenderer] New State:', [...hiddenSet]);

                AppState.saveHiddenSortOptions();
                if (typeof this._sortContext.onHide === 'function') {
                    this._sortContext.onHide();
                }
                setTimeout(() => {
                    this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect, context.onHide);
                }, 50);
                return;
            }

            if (this.sortPickerMode === 'reorder') return;

            // Default Mode: Selection
            // Long Press Guard: If this click was result of a long press, ignore it (handled by timer)
            if (isLongPress) {
                isLongPress = false; // Reset
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const [field, direction] = key.split('-');

            // Unified Selection Logic
            // Always use the pending direction
            const pendingDir = this._sortContext.pendingDir || 'desc';
            console.log('[ViewRenderer] Sort Selection:', { field, direction: pendingDir, pendingCtx: this._sortContext.pendingDir });

            // Note: 'direction' from the key is ignored in favor of the toggle state
            // unless we want to respect the clicked item's underlying direction? 
            // No, the list items are deduplicated by field now, so the key's direction is arbitrary (usually the first one found).
            // So we MUST use pendingDir.

            context.onSelect({ field, direction: pendingDir }, 'LIST');

            this._closeSortPickerInstance();
        });

        return modal;
    }

    _updateSortPickerUI(modal, displayOptions, hiddenSet, currentSort, type) {
        // Update Title Style
        const title = modal.querySelector(`#${IDS.SORT_MODAL_TITLE}`);

        // RESET Classes first
        title.classList.remove(CSS_CLASSES.MODAL_REORDER_TITLE, CSS_CLASSES.TEXT_COFFEE);
        title.innerHTML = 'Select Sort Order'; // Default

        if (this.sortPickerMode !== 'default') {
            title.classList.add(CSS_CLASSES.MODAL_REORDER_TITLE);
            title.textContent = this.sortPickerMode === 'reorder' ? 'Reorder Sort Options' : 'Hide Sort Options';
        } else {
            // Check Global Sort
            if (AppState.preferences.globalSort) {
                title.classList.add(CSS_CLASSES.TEXT_COFFEE);
                // Add Globe Icon
                title.innerHTML = `<i class="fas ${UI_ICONS.GLOBE}"></i> Global Sort Active`;
            }
        }

        // Update Mode Container Visibility
        const modeContainer = modal.querySelector(`#${IDS.SORT_MODE_CONTAINER}`);
        const toggleContainer = modal.querySelector(`#${IDS.SORT_DIRECTION_TOGGLE}`);

        // Unified View: Always Show Toggle, Hide Mode Selector (unless strict mode needed?)
        // User requested removing "Ascending/Descending" selection rows. 
        // We will prioritize the Toggle.

        // Conditional Visibility: Toggle vs Mode Buttons
        if (this.sortPickerMode === 'default') {
            modeContainer.classList.add(CSS_CLASSES.HIDDEN);
            toggleContainer.classList.remove(CSS_CLASSES.HIDDEN);
        } else {
            // In "Edit Mode" (Reorder/Hide), show the Mode Buttons, hide the Toggle
            modeContainer.classList.remove(CSS_CLASSES.HIDDEN);
            toggleContainer.classList.add(CSS_CLASSES.HIDDEN);
        }

        // Update Toggle Button
        const activeDir = this._sortContext.pendingDir || 'desc';
        const toggleBtn = modal.querySelector(`#${IDS.SORT_TOGGLE_BTN}`);

        if (toggleBtn) {
            // REVISED LOGIC (User Request):
            // "High to Low" (Green Up) -> Numbers: Desc, Text: Asc
            // "Low to High" (Red Down) -> Numbers: Asc, Text: Desc

            // Helper to determine field type
            const currentField = currentSort.field || 'code';
            const isTextField = ['code', 'name', 'category', 'comments', 'targetPrice'].includes(currentField);

            // Determine "High to Low" direction for this field
            const highToLowDir = isTextField ? 'asc' : 'desc';

            let btnContent = '';
            let iconClass = '';
            let colorClass = '';
            let labelText = '';

            // If current is 'High to Low', offer 'Low to High' (Red Down)
            if (activeDir === highToLowDir) {
                // Target: Low to High
                iconClass = `${UI_ICONS.CARET_DOWN || 'fa-caret-down'}`;
                colorClass = CSS_CLASSES.TEXT_NEGATIVE;
                labelText = 'Low to High';
            } else {
                // Target: High to Low (Green Up)
                iconClass = `${UI_ICONS.CARET_UP || 'fa-caret-up'}`;
                colorClass = CSS_CLASSES.TEXT_POSITIVE;
                labelText = 'High to Low';
            }

            // Dual Chevron Layout (Justify Center with Specific Gap)
            // User requested: "Too far away... need to sit much closer, just not as close as before."
            // justify-between was too far. justify-center without gap is too close.
            // Solution: justify-center + explicit margin on icons.

            btnContent = `
                <div class="${CSS_CLASSES.W_FULL} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER}" style="justify-content: center;">
                    <i class="fas ${iconClass} ${colorClass}" style="margin-right: 15px;"></i>
                    <span class="${CSS_CLASSES.FONT_BOLD}">${labelText}</span>
                    <i class="fas ${iconClass} ${colorClass}" style="margin-left: 15px;"></i>
                </div>
            `;

            toggleBtn.innerHTML = btnContent;
            toggleBtn.classList.remove(CSS_CLASSES.GHOSTED);
        }

        // --- ENFORCE BUTTON CLASSES (Fixes Stale DOM Issue) ---
        // Explicitly set className to ensure correct base class + active state
        // even if the modal was created before constants were loaded.

        const reorderBtn = modal.querySelector(`#${IDS.SORT_MODE_REORDER}`);
        if (reorderBtn) {
            const isActive = (this.sortPickerMode === 'reorder');
            reorderBtn.className = `${CSS_CLASSES.SEGMENTED_BUTTON} ${isActive ? CSS_CLASSES.ACTIVE : ''}`;
        }

        const hideBtn = modal.querySelector(`#${IDS.SORT_MODE_HIDE}`);
        if (hideBtn) {
            const isActive = (this.sortPickerMode === 'hide');
            hideBtn.className = `${CSS_CLASSES.SEGMENTED_BUTTON} ${isActive ? CSS_CLASSES.ACTIVE : ''}`;
        }

        // Generate and Update List Content
        const rowsHtml = displayOptions.map((opt, index) => {
            const uniqueKey = `${opt.field}-${opt.direction}`;

            // Unified List Item Validation
            // Active check: Just match Field
            let isActive = (currentSort.field === opt.field);

            let activeClass = (isActive && this.sortPickerMode === 'default') ? CSS_CLASSES.ACTIVE : '';
            if (this.sortPickerMode === 'hide' && hiddenSet.has(String(uniqueKey))) activeClass += ` ${CSS_CLASSES.HIDDEN_SELECTED}`;

            // Global Sort Active Row Check
            if (AppState.preferences.globalSort) {
                const g = AppState.preferences.globalSort;
                if (g.field === opt.field) { // Relaxed to just field since direction is toggled
                    activeClass += ' global-sort-active';
                }
            }

            // Ensure icons are mapped correctly or default
            let iconClass = opt.icon; // Default
            if (opt.label === 'ASX Code') iconClass = ''; // Handled by SVG

            // ... Icon HTML generation ...
            let iconHtml;
            if (opt.label === 'ASX Code') {
                iconHtml = `
            <svg class="${CSS_CLASSES.SORT_ASX_ICON}" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-weight="400" font-size="10" fill="currentColor">ASX</text>
            </svg>`;
            } else {
                iconHtml = `<i class="fas ${iconClass}"></i>`;
            }

            let rightControl = '';
            if (this.sortPickerMode === 'reorder') {
                rightControl = `
                    <div class="flex-row">
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.MODAL_REORDER_BTN}" data-dir="up" ${index === 0 ? 'disabled' : ''}>
                            <i class="fas ${UI_ICONS.CARET_UP}"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.MODAL_REORDER_BTN}" data-dir="down" ${index === displayOptions.length - 1 ? 'disabled' : ''}>
                            <i class="fas ${UI_ICONS.CARET_DOWN}"></i>
                        </button>
                    </div>`;
            } else if (this.sortPickerMode === 'hide') {
                const isHidden = hiddenSet.has(uniqueKey);
                rightControl = `
                    <div class="${CSS_CLASSES.HIDE_CHECKBOX} ${isHidden ? CSS_CLASSES.ACTIVE : ''} ${CSS_CLASSES.ML_AUTO}">
                        <div class="${CSS_CLASSES.RADIO_DOT}"></div>
                    </div>`;
            } else {
                if (isActive) {
                    rightControl = `<div class="${CSS_CLASSES.SORT_PICKER_DIRECTION} ${CSS_CLASSES.ACTIVE}"><i class="fas ${UI_ICONS.CHECK}"></i></div>`;
                } else {
                    // No arrows for inactive items in unified view
                    rightControl = '';
                }
            }

            // Note: Added data-index and data-type for delegation
            return `
                <div class="${CSS_CLASSES.SORT_PICKER_ROW} ${activeClass}" data-key="${uniqueKey}" data-index="${index}" data-type="${type}">
                    <div class="${CSS_CLASSES.SORT_PICKER_ROW_CONTENT}">
                        <div class="${CSS_CLASSES.SORT_PICKER_ICON}">${iconHtml}</div>
                        <div class="${CSS_CLASSES.SORT_PICKER_LABEL}">${opt.label}</div>
                        ${rightControl}
                    </div>
                </div>
            `;
        }).join('');

        const listContainer = modal.querySelector(`#${IDS.SORT_PICKER_LIST}`);
        listContainer.innerHTML = rowsHtml;

        // Toggle Reorder Active Class on List
        if (this.sortPickerMode === 'reorder') {
            listContainer.classList.add(CSS_CLASSES.REORDER_ACTIVE);
        } else {
            listContainer.classList.remove(CSS_CLASSES.REORDER_ACTIVE);
        }
    }

    _handleSortReorder(type, displayList, index, direction, watchlistId, currentSort, onSelect) {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= displayList.length) return;

        const itemA = displayList[index];
        const itemB = displayList[newIndex];
        const keyA = `${itemA.field}-${itemA.direction}`;
        const keyB = `${itemB.field}-${itemB.direction}`;

        // Load Global Order (or Init)
        let savedOrder = AppState.preferences.sortOptionOrder?.[type];
        if (!savedOrder || !Array.isArray(savedOrder)) {
            // Initialize with current full list order if missing
            const fullOptions = (SORT_OPTIONS[type] || SORT_OPTIONS.STOCK);
            savedOrder = fullOptions.map(o => `${o.field}-${o.direction}`);
        }

        const idxA = savedOrder.indexOf(keyA);
        const idxB = savedOrder.indexOf(keyB);

        if (idxA !== -1 && idxB !== -1) {
            savedOrder[idxA] = keyB;
            savedOrder[idxB] = keyA;

            if (!AppState.preferences.sortOptionOrder) AppState.preferences.sortOptionOrder = {};
            AppState.preferences.sortOptionOrder[type] = [...savedOrder];

            // Persist
            localStorage.setItem(STORAGE_KEYS.SORT_OPTION_ORDER, JSON.stringify(AppState.preferences.sortOptionOrder));

            this.renderSortPickerModal(watchlistId, currentSort, onSelect);
        }
    }


    renderASXCodeDropdownV2(data) {
        // Render into the existing header container
        const container = document.getElementById(IDS.ASX_CONTAINER);
        if (!container) {
            return;
        }

        // Clear and render into container
        if (!data || data.length === 0) {
            container.innerHTML = `<div class="${CSS_CLASSES.ASX_DROPDOWN_EMPTY}">No Active Shares</div>`;
            return;
        }

        const htmlItems = data.map(item => {
            const status = item.status || 'neutral';

            // NO ARROW - just the code
            return `
            <button class="${CSS_CLASSES.ASX_DROPDOWN_PILL} status-${status}" data-code="${item.code}">
                ${item.code}
            </button>
            `;
        }).join('');

        container.innerHTML = htmlItems;

        // Add Click Handlers
        container.querySelectorAll(`.${CSS_CLASSES.ASX_DROPDOWN_PILL}`).forEach(pill => {
            pill.addEventListener('click', () => {
                const code = pill.dataset.code;
                document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code } }));
            });
        });
    }

    _closeSortPickerInstance() {
        const modal = document.getElementById(IDS.SORT_PICKER_MODAL);
        if (modal) {
            modal.classList.add(CSS_CLASSES.HIDDEN);
            document.getElementById(IDS.SORT_PICKER_BTN)?.classList.remove(CSS_CLASSES.ACTIVE);
            this.sortPickerMode = 'default';

            // Remove from history stack if closed manually
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        }
    }

    renderSummaryDetailModal(title, shares, valueField) {
        const existing = document.getElementById(IDS.SUMMARY_DETAIL_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.SUMMARY_DETAIL_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        const rowsHtml = shares.map(share => {
            const val = share[valueField] || 0;

            // COLOR LOGIC: If displaying Current Value, use Capital Gain for coloring
            let colorBasis = val;
            if (valueField === 'value') {
                colorBasis = share.capitalGain || 0;
            }

            let colorClass = CSS_CLASSES.TEXT_POSITIVE;
            if (colorBasis < 0) colorClass = CSS_CLASSES.TEXT_NEGATIVE;
            else if (colorBasis === 0) colorClass = CSS_CLASSES.TEXT_COFFEE;

            // Formatting based on field
            let formattedVal = formatCurrency(val);
            if (valueField === 'dayChangePercent') {
                formattedVal = formatPercent(val);
            }
            return `
                <div class="${CSS_CLASSES.SUMMARY_DETAIL_ROW}" data-code="${share.code}" data-id="${share.id}">
                    <span class="${CSS_CLASSES.SUMMARY_DETAIL_CODE}">${share.code}</span>
                    <span class="${CSS_CLASSES.SUMMARY_DETAIL_VALUE} ${colorClass}">${formattedVal}</span>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">${title}</h2>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}">
                    <div class="${CSS_CLASSES.SUMMARY_DETAIL_LIST}">
                        ${rowsHtml || `<div class="${CSS_CLASSES.TEXT_CENTER} ${CSS_CLASSES.TEXT_MUTED}">No shares to display.</div>`}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Bind Events
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
            if (modal.parentElement) { // Check if modal is still in DOM
                modal._navActive = false;
                close();
            }
        });

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        // Click row to open stock details
        modal.querySelectorAll(`.${CSS_CLASSES.SUMMARY_DETAIL_ROW}`).forEach(row => {
            row.addEventListener('click', () => {
                const code = row.dataset.code;
                const id = row.dataset.id;

                // REMOVED close() to allow stacking and "Step Back" support.
                // Summary stays in stack, Details pushes on top.

                // Delay opening detail modal to allow history to settle (lock safety)
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code, id } }));
                }, 150);
            });
        });
    }

}
