
/**
 * ViewRenderer.js
 * Handles the rendering of the watchlist in different modes (Table, Compact, Snapshot).
 * Manages the visibility of view toggles based on watchlist type.
 */

import { formatCurrency, formatPercent, formatFriendlyDate } from '../utils/formatters.js';
import { AppState } from '../state/AppState.js';
import { SORT_OPTIONS, UI_ICONS, UI_LABELS, USER_MESSAGES, RESEARCH_LINKS_TEMPLATE, CSS_CLASSES, IDS, EVENTS, SUMMARY_TYPES, STORAGE_KEYS, PORTFOLIO_ID, KANGAROO_ICON_SRC, KANGAROO_ICON_SVG, VIEW_MODES, FALLBACK_SECTOR_MAP, GEMINI_PROMPTS, REGISTRY_LINKS } from '../utils/AppConstants.js?v=1030';
import { SnapshotUI } from './SnapshotUI.js';
import { LinkHelper } from '../utils/LinkHelper.js';
import { ToastManager } from './ToastManager.js';

import { navManager } from '../utils/NavigationManager.js';
import { MiniChartPreview, ChartModal } from './ChartModal.js';
import { SparklinePreview } from './SparklinePreview.js';
import { SharePieChart } from './SharePieChart.js';

export class ViewRenderer {
    constructor() {
        this.cardsContainerClass = CSS_CLASSES.MOBILE_CONTAINER;
        this.fallbackContainerClass = CSS_CLASSES.FALLBACK_CONTAINER;

        // Cached DOM Elements
        this.container = document.getElementById(IDS.CONTENT_CONTAINER);
        this.sortReorderMode = false;
        this.viewControls = document.getElementById(IDS.VIEW_CONTROLS);

        // Drag state flags (for Sort Picker modal)
        this._isDraggingOrCoolingDown = false;
        this._draggedSortItem = null;

        // Track current stock for live updates
        this._currentDetailsStock = null;

        this._setupGlobalListeners();
    }

    _setupGlobalListeners() {
        window.addEventListener(EVENTS.RESEARCH_LINKS_UPDATED, () => {
            const modal = document.getElementById(IDS.STOCK_DETAILS_MODAL);
            if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN) && this._currentDetailsStock) {
                this._refreshResearchLinks(modal, this._currentDetailsStock);
            }
        });
    }

    _refreshResearchLinks(modal, stock) {
        const grid = modal.querySelector('.research-links-grid');
        if (!grid) return;

        // Re-get links from AppState via the static helper or direct prefs
        const custom = AppState.preferences.researchLinks || [];
        const links = custom.length > 0 ? custom : JSON.parse(JSON.stringify(RESEARCH_LINKS_TEMPLATE));

        grid.innerHTML = links.map(link => {
            const finalLink = typeof link === 'string' ? { name: link, url: link } : link;
            let hostname = '';
            try {
                hostname = new URL(LinkHelper.replacePlaceholders(finalLink.url, { code: 'ASX', name: 'ASX' })).hostname;
            } catch (e) {
                hostname = 'research';
            }
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
            const substitutedUrl = LinkHelper.replacePlaceholders(finalLink.url, stock);

            return `
                <a href="${substitutedUrl}" target="_blank" rel="noopener noreferrer" class="research-link-btn">
                    <img src="${faviconUrl}" class="link-favicon" alt="">
                    <div class="link-info-stack">
                        <span class="link-name">${finalLink.displayName || finalLink.name}</span>
                        <span class="link-desc">${finalLink.description || ''}</span>
                    </div>
                </a>
            `;
        }).join('');
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
        // 1b. DOM Stability Guard
        if (!this.container || !document.body.contains(this.container)) {
            this.container = document.getElementById(IDS.CONTENT_CONTAINER);
        }

        if (!this.container) {
            return;
        }

        // 2. Clear Container
        this.container.innerHTML = '';
        // Resetting class names more aggressively to ensure only relevant ones are applied
        this.container.className = '';
        this.container.id = IDS.CONTENT_CONTAINER; // Ensure ID is always correct

        // 2a. Render Summary (ONLY for Portfolio)
        // User Logic: if (currentWatchlistName === 'Portfolio') { renderSummary(); }
        // Refinement V3: ALWAYS show summary if in Portfolio Context, regardless of mode.
        // Portfolio forces its own Grid layout, so strict mode checks (TABLE/COMPACT) are counter-productive here.
        if (summaryMetrics && (AppState.watchlist.id === PORTFOLIO_ID || AppState.isPortfolioVisible) && mode === VIEW_MODES.TABLE) {
            this.renderSummary(summaryMetrics, data);
        }

        switch (mode) {
            case VIEW_MODES.TABLE:
                this.container.classList.add(CSS_CLASSES.VIEW_TABLE);
                this.renderTable(data);
                break;
            case VIEW_MODES.COMPACT:
                this.container.classList.add(CSS_CLASSES.VIEW_COMPACT);
                this.renderGrid(data, 'compact');
                break;
            case VIEW_MODES.SNAPSHOT:
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
            this.container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center; padding: 20px;">
                    <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.03); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                        <i class="fas ${UI_ICONS.CHART_LINE}" style="font-size: 32px; color: var(--text-muted); opacity: 0.5;"></i>
                    </div>
                    <h2 class="${CSS_CLASSES.DISPLAY_TITLE}" style="font-size: 1.5rem; margin-bottom: 12px; color: var(--text-shimmer);">Watchlist Empty</h2>
                    <p style="color: var(--text-muted); font-size: 1rem; max-width: 300px; line-height: 1.5; margin-bottom: 32px;">
                        This watchlist is waiting for its first share.
                    </p>
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 30px; font-size: 0.9rem; color: var(--color-accent); font-weight: 600;">
                        <i class="fas fa-arrow-left"></i>
                        <span>Open Sidebar to Add Share</span>
                    </div>
                </div>
            `;
            return;
        }

        const isPortfolioView = AppState.watchlist.id === PORTFOLIO_ID || AppState.isPortfolioVisible;

        if (isPortfolioView) {
            // 1. Portfolio Grid (Now for both Desktop and Mobile)
            const gridContainer = document.createElement('div');
            gridContainer.classList.add(this.cardsContainerClass); // 'mobile-share-cards'
            gridContainer.classList.add(CSS_CLASSES.PORTFOLIO_GRID); // Registry-compliant class

            const html = data.map(item => this.createCardHTML(item, 'portfolio')).join('');
            gridContainer.innerHTML = html;
            this.container.appendChild(gridContainer);

            // Hydrate background charts (delayed significantly to prioritize UI paint)
            setTimeout(() => {
                requestAnimationFrame(() => {
                    this._initPortfolioCharts(data);
                });
            }, 150);
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

            const tableHtml = `
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
            table.innerHTML = tableHtml;
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
            this.container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center; padding: 20px;">
                    <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.03); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                        <i class="fas ${UI_ICONS.CHART_LINE}" style="font-size: 32px; color: var(--text-muted); opacity: 0.5;"></i>
                    </div>
                    <h2 class="${CSS_CLASSES.DISPLAY_TITLE}" style="font-size: 1.5rem; margin-bottom: 12px; color: var(--text-shimmer);">Watchlist Empty</h2>
                    <p style="color: var(--text-muted); font-size: 1rem; max-width: 300px; line-height: 1.5; margin-bottom: 32px;">
                        This watchlist is waiting for its first share.
                    </p>
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 30px; font-size: 0.9rem; color: var(--color-accent); font-weight: 600;">
                        <i class="fas fa-arrow-left"></i>
                        <span>Open Sidebar to Add Share</span>
                    </div>
                </div>
            `;
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
        if (!item.code) console.warn('[ViewRenderer] createRowHTML: item has no code!', item);
        const price = item.currentPrice || 0;
        const changePercent = item.dayChangePercent || 0;

        // Consistent check for Portfolio view content
        const isPortfolioView = AppState.watchlist.id === PORTFOLIO_ID || AppState.isPortfolioVisible;

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
                    <span class="${CSS_CLASSES.WHITESPACE_NOWRAP}">
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
            // User Request: Change Tick to Chat Symbol
            const notesHtml = hasNotes ? `<i class="fas ${UI_ICONS.COMMENTS}" style="color: var(--color-accent); font-size: 0.9rem;" title="${item.comments.length} Note(s)"></i>` : '';

            extraCells = `
                <td>${targetHtml}</td>
                <td>${starsHtml}</td>
                <td class="text-center">${notesHtml}</td>
            `;
        }

        // Gradient Background Logic
        let gradeClass = CSS_CLASSES.DASHBOARD_GRADE_NEUTRAL; // Default: coffee/amber
        if (changePercent > 0) gradeClass = CSS_CLASSES.DASHBOARD_GRADE_UP;
        else if (changePercent < 0) gradeClass = CSS_CLASSES.DASHBOARD_GRADE_DOWN;

        const borderStyle = this._getBorderStyles(changePercent);

        return `
            <tr data-id="${item.id}" data-code="${item.code}" class="${trendClass} ${gradeClass}" style="${borderStyle}">
                <td class="${CSS_CLASSES.CODE_CELL} ${CSS_CLASSES.FONT_BOLD}">
                    <div class="card-code-pill" style="background: none; border: none; padding: 0; gap: 6px; display: inline-flex; align-items: center; vertical-align: middle;">
                        <img src="https://files.marketindex.com.au/xasx/96x96-png/${item.code.toLowerCase()}.png" class="favicon-icon" style="width: 14px; height: 14px;" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                        <span>${item.code}</span>
                    </div>
                </td>
                <td>${formatCurrency(price)}</td>
                <td class="${CSS_CLASSES.DESKTOP_ONLY} ${changeValue >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE} ${CSS_CLASSES.CHANGE_VALUE}">
                    ${formatCurrency(Math.abs(changeValue))} (${formatPercent(changePercent)})
                </td>
                ${extraCells}
            </tr>
        `;
    }

    createCardHTML(item, type = PORTFOLIO_ID) {
        if (!item.code) console.warn('[ViewRenderer] createCardHTML: item has no code!', item);
        const price = item.currentPrice || 0;
        const changePercent = item.dayChangePercent || 0;

        const isPortfolioView = AppState.watchlist.id === PORTFOLIO_ID || AppState.isPortfolioVisible;

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

        let gradeClass = CSS_CLASSES.DASHBOARD_GRADE_NEUTRAL;
        if (changePercent > 0) gradeClass = CSS_CLASSES.DASHBOARD_GRADE_UP;
        else if (changePercent < 0) gradeClass = CSS_CLASSES.DASHBOARD_GRADE_DOWN;

        const borderStyle = this._getBorderStyles(changePercent);

        if (type === PORTFOLIO_ID) {
            const value = item.value || 0;
            const capitalGain = item.capitalGain || 0;
            const ghostClass = (item.isGhost || item.isHidden) ? CSS_CLASSES.GHOSTED : '';
            const eyeIcon = item.isHidden ? UI_ICONS.EYE_SLASH : UI_ICONS.EYE;

            // For the new Portfolio Card, always use TOTAL holding change
            const displayChangeValue = item.dayChangeValue || 0;

            // Background Chart Container (Hydrated post-render)
            // Using ID based on item ID to ensure uniqueness
            const showCharts = !AppState.preferences.containerBorders || AppState.preferences.containerBorders.showCardCharts !== false;
            const chartBgHtml = showCharts ? `
                <div class="portfolio-card-chart-bg" id="bg-chart-${item.id}" data-code="${item.code}" data-change="${item.dayChangeValue || 0}"></div>
            ` : '';

            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass} ${gradeClass} ${ghostClass}" data-id="${item.id}" data-code="${item.code}" style="${borderStyle}">
                    ${chartBgHtml}
                    <div class="${CSS_CLASSES.CARD_HEADER_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MB_2PX} ${CSS_CLASSES.BORDER_NONE}" style="position:relative; z-index:1;">
                        <div class="${CSS_CLASSES.CARD_HEADER_LEFT} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START}">
                            <div class="card-code-pill" style="background: none; border: none; padding: 0; gap: 6px;">
                                <img src="https://files.marketindex.com.au/xasx/96x96-png/${item.code.toLowerCase()}.png" class="favicon-icon" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                                <span class="${CSS_CLASSES.CARD_CODE}" data-code="${item.code}">${item.code}</span>
                            </div>
                        </div>
                        <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.TEXT_CENTER} ${CSS_CLASSES.FLEX_2}">${formatCurrency(price)}</span>
                        <div class="${CSS_CLASSES.CARD_CHANGE_COL} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_END}">
                            <span class="${CSS_CLASSES.CHANGE_VALUE} ${displayChangeValue >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${formatCurrency(Math.abs(displayChangeValue))}
                            </span>
                            <span class="${CSS_CLASSES.CHANGE_PERCENT} ${CSS_CLASSES.TEXT_SM} ${changePercent >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${formatPercent(changePercent)}
                            </span>
                        </div>
                    </div>

                    <div class="${CSS_CLASSES.CARD_BODY_SECTION} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MT_TINY} ${CSS_CLASSES.PT_SMALL} ${CSS_CLASSES.BORDER_TOP_NONE}" style="position:relative; z-index:1;">
                        <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.PY_TINY}">
                            <span class="${CSS_CLASSES.DETAIL_LABEL}">Current Value</span>
                            <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.FONT_BOLD}">${formatCurrency(value)}</span>
                        </div>
                        <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.PY_TINY}">
                            <span class="${CSS_CLASSES.DETAIL_LABEL}">Capital Gain</span>
                            <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.FONT_BOLD} ${capitalGain >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                ${formatCurrency(Math.abs(capitalGain))}
                            </span>
                        </div>
                    </div>

                    <!-- Visibility Toggle (Portfolio Corner) -->
                    <button class="${CSS_CLASSES.ICON_BTN_GHOST} ${CSS_CLASSES.VISIBILITY_TOGGLE_BTN} portfolio-visibility-btn" 
                            onclick="event.stopPropagation(); document.dispatchEvent(new CustomEvent('${EVENTS.SHARE_TOGGLE_VISIBILITY}', { detail: { id: '${item.id}' } }))"
                            title="${item.isHidden ? 'Show Share' : 'Hide Share'}">
                        <i class="fas ${eyeIcon}"></i>
                    </button>
                </div>
            `;
        } else if (type === 'watchlist') {
            const hasAlert = item.targetPrice && item.targetPrice !== 0;
            const hasStars = item.starRating && item.starRating !== 0;
            const hasComments = item.comments && item.comments.length > 0;

            const faviconUrl = `https://files.marketindex.com.au/xasx/96x96-png/${item.code.toLowerCase()}.png`;

            // Row 2: Utility Slots (Status Badges) - Only render if they have content
            const activeSlots = [];

            if (hasAlert) {
                activeSlots.push(`
                    <div class="utility-slot has-content" data-action="deep-link" data-id="${item.id}" data-section="target">
                        <i class="fas fa-crosshairs utility-icon"></i>
                    </div>`);
            }

            if (hasStars) {
                activeSlots.push(`
                    <div class="utility-slot has-content" data-action="deep-link" data-id="${item.id}" data-section="rating">
                        <i class="fas ${UI_ICONS.STAR} utility-icon"></i>
                        ${item.starRating}
                    </div>`);
            }

            if (hasComments) {
                activeSlots.push(`
                    <div class="utility-slot has-content" data-action="deep-link" data-id="${item.id}" data-section="notes">
                        <i class="fas ${UI_ICONS.COMMENTS} utility-icon" style="margin-right: 0;"></i>
                    </div>`);
            }

            const utilityBarHtml = activeSlots.length > 0 ? `
                <div class="card-row-utility">
                    ${activeSlots.join('')}
                </div>
            ` : '';

            return `
                <div class="${CSS_CLASSES.CARD} unified-layout ${trendClass} ${gradeClass}" data-id="${item.id}" data-code="${item.code}" style="${borderStyle}">
                    <div class="card-main-content">
                        <!-- Left Column: Identity & Utilities -->
                        <div class="card-left-col">
                            <div class="card-code-pill">
                                <img src="${faviconUrl}" class="favicon-icon" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                                <span class="${CSS_CLASSES.CARD_CODE}" data-code="${item.code}">${item.code}</span>
                            </div>
                            <!-- Company Name (New) -->
                            <div class="card-name-label" style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 2px;">
                                ${item.name || item.companyName || ''}
                            </div>
                            
                            <!-- Row 2: Utility Bar (Underneath Code) -->
                            ${utilityBarHtml}
                        </div>

                        <!-- Right Column: Value & Change -->
                        <div class="card-right-col">
                            <span class="${CSS_CLASSES.CARD_PRICE}">${formatCurrency(price)}</span>
                            <div class="card-change-stack">
                                <span class="${CSS_CLASSES.CHANGE_VALUE} ${changeValue >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">${formatCurrency(Math.abs(changeValue))}</span>
                                <span class="${CSS_CLASSES.CHANGE_PERCENT} ${changePercent >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                                    (${formatPercent(changePercent)})
                                </span>
                            </div>
                        </div>
                    </div>
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
                    costPriceHtml = `<span class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.GHOSTED} ${CSS_CLASSES.TEXT_RIGHT} ${CSS_CLASSES.ML_AUTO}" title="Avg Cost Price">${formatCurrency(costPrice)}</span>`;
                }
            }

            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass} ${gradeClass}" data-id="${item.id}" data-code="${item.code}" data-view="compact" style="${borderStyle}">
                    <div class="${CSS_CLASSES.CARD_HEADER} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL}">
                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.ALIGN_CENTER}">
                            <span class="${CSS_CLASSES.CARD_CODE} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.CODE_PILL} ${CSS_CLASSES.JUSTIFY_START}" style="font-size: 1.1rem;" data-code="${item.code}">${item.code}</span>
                            <img src="https://files.marketindex.com.au/xasx/96x96-png/${item.code.toLowerCase()}.png" class="favicon-icon" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                        </div>
                        
                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_START} ${CSS_CLASSES.ALIGN_BASELINE} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.MT_TINY}">
                            <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.PRIMARY_TEXT} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.TEXT_LEFT}">${formatCurrency(price)}</span>
                            ${costPriceHtml}
                        </div>
                    </div>
                    <div class="${CSS_CLASSES.SNAPSHOT_FOOTER}">
                        <span class="${CSS_CLASSES.CHANGE_VALUE} ${CSS_CLASSES.TEXT_SM}">${formatCurrency(Math.abs(changeValue))}</span>
                        <span class="${CSS_CLASSES.CHANGE_PERCENT} ${CSS_CLASSES.TEXT_SM}">${formatPercent(changePercent)}</span>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="${CSS_CLASSES.CARD} ${trendClass} ${gradeClass}" data-id="${item.id}" data-code="${item.code}" data-view="snapshot" style="${borderStyle}">
                    <div class="${CSS_CLASSES.CARD_HEADER} ${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.W_FULL}">
                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.ALIGN_CENTER}">
                            <span class="${CSS_CLASSES.CARD_CODE} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.CODE_PILL} ${CSS_CLASSES.JUSTIFY_START}" style="font-size: 1rem;" data-code="${item.code}">${item.code}</span>
                            <img src="https://files.marketindex.com.au/xasx/96x96-png/${item.code.toLowerCase()}.png" class="favicon-icon" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                        </div>
                        <span class="${CSS_CLASSES.CARD_PRICE} ${CSS_CLASSES.PRIMARY_TEXT} ${CSS_CLASSES.TEXT_LG} ${CSS_CLASSES.MT_TINY} ${CSS_CLASSES.TEXT_LEFT}">${formatCurrency(price)}</span>
                    </div>
                    <div class="${CSS_CLASSES.SNAPSHOT_FOOTER}">
                        <span class="${CSS_CLASSES.CHANGE_VALUE} ${CSS_CLASSES.TEXT_SM}">${formatCurrency(Math.abs(changeValue))}</span>
                        <span class="${CSS_CLASSES.CHANGE_PERCENT} ${CSS_CLASSES.TEXT_SM}">${formatPercent(changePercent)}</span>
                    </div>
                </div>
            `;
        }
    }

    renderSummary(metrics, shares = []) {
        // 1. Create Container
        const container = document.createElement('div');
        container.id = 'portfolio-summary';
        container.className = CSS_CLASSES.PORTFOLIO_SUMMARY;
        // Note: Styles for .portfolio-summary should be in CSS, not JS.

        // Gradient classes for summary cards
        const isTotalPos = metrics.totalReturn >= 0;

        // 2. Proportional Sentiment Logic (Dynamic Gradient) - Value-based
        // Robustness: Strip commas and force number conversion to handle formatted strings safely
        const rawGain = String(metrics.dayGain || 0).replace(/,/g, '');
        const rawLoss = String(metrics.dayLoss || 0).replace(/,/g, '');

        const dayGain = Number(rawGain);
        const dayLoss = Math.abs(Number(rawLoss));

        // Static Gradients (Needed for all cards)
        const neutralGradient = 'linear-gradient(90deg, rgba(164, 147, 147, var(--gradient-strength, 0.6)) 0%, rgba(20, 20, 20, 1) 50%, rgba(164, 147, 147, var(--gradient-strength, 0.6)) 100%)';
        const greenGradient = 'linear-gradient(90deg, rgba(0, 180, 0, var(--gradient-strength, 0.6)) 0%, rgba(20, 20, 20, 1) 50%, rgba(0, 180, 0, var(--gradient-strength, 0.6)) 100%)';
        const redGradient = 'linear-gradient(90deg, rgba(180, 0, 0, var(--gradient-strength, 0.6)) 0%, rgba(20, 20, 20, 1) 50%, rgba(180, 0, 0, var(--gradient-strength, 0.6)) 100%)';

        // Day Change Mixed Gradient Logic (Proportional & Dominant Side)
        const totalMovement = dayGain + dayLoss;

        let splitPercent = 50;
        let startColor = `rgba(0, 180, 0, var(--gradient-strength, 0.6))`; // Green Default
        let endColor = `rgba(180, 0, 0, var(--gradient-strength, 0.6))`;   // Red Default

        if (totalMovement > 0) {
            if (dayGain >= dayLoss) {
                // Gain Dominant (Green Left)
                splitPercent = (dayGain / totalMovement) * 100;
                startColor = `rgba(0, 180, 0, var(--gradient-strength, 0.6))`;
                endColor = `rgba(180, 0, 0, var(--gradient-strength, 0.6))`;
            } else {
                // Loss Dominant (Red Left)
                splitPercent = (dayLoss / totalMovement) * 100; // Use Loss Ratio
                startColor = `rgba(180, 0, 0, var(--gradient-strength, 0.6))`;
                endColor = `rgba(0, 180, 0, var(--gradient-strength, 0.6))`;
            }
        }

        // Safety Clean
        splitPercent = Math.min(Math.max(Math.round(splitPercent), 0), 100);

        const dayChangeGradient = `linear-gradient(to right, 
            ${startColor} 0%, 
            rgba(20, 20, 20, 1) ${splitPercent}%, 
            ${endColor} 100%)`;

        const capitalGainGradient = isTotalPos ? greenGradient : redGradient;

        // BORDER LOGIC for Summary Cards
        const valueBorderStyle = this._getBorderStyles(0); // Value is neutral
        const changeBorderStyle = this._getBorderStyles(metrics.dayChangeValue);

        const gainBorderStyle = this._getBorderStyles(1); // Gain is positive
        const lossBorderStyle = this._getBorderStyles(-1); // Loss is negative
        const returnBorderStyle = this._getBorderStyles(metrics.totalReturn);

        // 3. Construct HTML (Centered Hero Layout - Ultra Compact)
        const transition = 'transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease, background 0.2s ease !important;';
        const cardCommon = `${transition} cursor: pointer !important; position: relative; overflow: hidden; text-align: center;`;
        const stripThickness = 9;
        const baseCardHeight = 70; // Ultra compact height
        const mainValueSize = '1.3rem';
        const labelSize = '0.6rem';

        container.innerHTML = `
             <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE}" 
                  style="background: ${neutralGradient} !important; ${valueBorderStyle}; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: ${10 + stripThickness}px 20px 6px !important; min-height: ${baseCardHeight}px; max-height: ${baseCardHeight}px; ${cardCommon}"
                  data-type="${SUMMARY_TYPES.VALUE}"
                  onmouseenter="this.style.transform='scale(1.02)'; this.style.zIndex='10';"
                  onmouseleave="this.style.transform='scale(1)'; this.style.zIndex='1';">
                 
                 <!-- Gloss Overlay -->
                 <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255,255,255,0.05), transparent); pointer-events: none;"></div>
                 
                 <div class="share-dna-container" style="position: absolute; top: 0; left: 0; height: ${stripThickness}px; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.1); z-index: 5;"></div>
                 
                 <span class="${CSS_CLASSES.METRIC_LABEL}" style="margin: 0 0 2px 0; text-transform: uppercase; font-size: ${labelSize}; letter-spacing: 1px; opacity: 0.8; font-weight: 600;">Portfolio Value</span>
                 <span class="${CSS_CLASSES.METRIC_VALUE_LARGE}" style="font-size: ${mainValueSize}; line-height: 1; font-weight: 800;">${formatCurrency(metrics.totalValue)}</span>
             </div>

             <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE}" 
                  style="background: ${dayChangeGradient} !important; ${changeBorderStyle}; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: ${10 + stripThickness}px 20px 6px !important; min-height: ${baseCardHeight}px; max-height: ${baseCardHeight}px; ${cardCommon}"
                  data-type="${SUMMARY_TYPES.DAY_CHANGE}"
                  onmouseenter="this.style.transform='scale(1.02)'; this.style.zIndex='10';"
                  onmouseleave="this.style.transform='scale(1)'; this.style.zIndex='1';">
                  
                  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255,255,255,0.03), transparent); pointer-events: none;"></div>
                  
                  <span class="${CSS_CLASSES.METRIC_LABEL}" style="margin: 0 0 2px 0; text-transform: uppercase; font-size: ${labelSize}; letter-spacing: 1px; opacity: 0.8; font-weight: 600;">Day Change</span>
                  <div style="display: flex; align-items: baseline; gap: 4px; justify-content: center;">
                      <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${(metrics.dayChangeValue >= 0) ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: ${mainValueSize}; line-height: 1; font-weight: 800;">
                          ${formatCurrency(Math.abs(metrics.dayChangeValue))}
                      </span>
                      <span class="${CSS_CLASSES.METRIC_PERCENT_SMALL} ${(metrics.dayChangePercent >= 0) ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: 0.75rem; font-weight: 700;">
                          ${formatPercent(metrics.dayChangePercent)}
                      </span>
                  </div>
             </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE}" 
                 style="background: ${greenGradient} !important; ${gainBorderStyle}; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: ${10 + stripThickness}px 20px 6px !important; min-height: ${baseCardHeight}px; max-height: ${baseCardHeight}px; ${cardCommon}"
                 data-type="${SUMMARY_TYPES.WINNERS}"
                 onmouseenter="this.style.transform='scale(1.02)'; this.style.zIndex='10';"
                 onmouseleave="this.style.transform='scale(1)'; this.style.zIndex='1';">
                
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255,255,255,0.03), transparent); pointer-events: none;"></div>
                
                <span class="${CSS_CLASSES.METRIC_LABEL}" style="margin: 0 0 2px 0; text-transform: uppercase; font-size: ${labelSize}; letter-spacing: 1px; opacity: 0.8; font-weight: 600;">Day Gain</span>
                <div style="display: flex; align-items: baseline; gap: 4px; justify-content: center;">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${CSS_CLASSES.TEXT_POSITIVE}" style="font-size: ${mainValueSize}; line-height: 1; font-weight: 800;">
                        ${formatCurrency(Math.abs(metrics.dayGain || 0))}
                    </span>
                    <span class="${CSS_CLASSES.METRIC_PERCENT_SMALL} ${CSS_CLASSES.TEXT_POSITIVE}" style="font-size: 0.75rem; font-weight: 700;">
                        ${formatPercent(metrics.dayGainPercent || 0)}
                    </span>
                </div>
            </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE}" 
                 style="background: ${redGradient} !important; ${lossBorderStyle}; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: ${10 + stripThickness}px 20px 6px !important; min-height: ${baseCardHeight}px; max-height: ${baseCardHeight}px; ${cardCommon}"
                 data-type="${SUMMARY_TYPES.LOSERS}"
                 onmouseenter="this.style.transform='scale(1.02)'; this.style.zIndex='10';"
                 onmouseleave="this.style.transform='scale(1)'; this.style.zIndex='1';">
                
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255,255,255,0.03), transparent); pointer-events: none;"></div>
                
                <span class="${CSS_CLASSES.METRIC_LABEL}" style="margin: 0 0 2px 0; text-transform: uppercase; font-size: ${labelSize}; letter-spacing: 1px; opacity: 0.8; font-weight: 600;">Day Loss</span>
                <div style="display: flex; align-items: baseline; gap: 4px; justify-content: center;">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: ${mainValueSize}; line-height: 1; font-weight: 800;">
                        ${formatCurrency(Math.abs(metrics.dayLoss || 0))}
                    </span>
                    <span class="${CSS_CLASSES.METRIC_PERCENT_SMALL} ${CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: 0.75rem; font-weight: 700;">
                        ${formatPercent(metrics.dayLossPercent || 0)}
                    </span>
                </div>
            </div>

            <div class="${CSS_CLASSES.SUMMARY_CARD} ${CSS_CLASSES.CLICKABLE}" 
                 style="background: ${capitalGainGradient} !important; ${returnBorderStyle}; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: ${10 + stripThickness}px 20px 6px !important; min-height: ${baseCardHeight}px; max-height: ${baseCardHeight}px; ${cardCommon}"
                 data-type="${SUMMARY_TYPES.CAPITAL_GAIN}"
                 onmouseenter="this.style.transform='scale(1.02)'; this.style.zIndex='10';"
                 onmouseleave="this.style.transform='scale(1)'; this.style.zIndex='1';">
                
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255,255,255,0.03), transparent); pointer-events: none;"></div>
                
                <span class="${CSS_CLASSES.METRIC_LABEL}" style="margin: 0 0 2px 0; text-transform: uppercase; font-size: ${labelSize}; letter-spacing: 1px; opacity: 0.8; font-weight: 600;">Total Capital Gain</span>
                <div style="display: flex; align-items: baseline; gap: 4px; justify-content: center;">
                    <span class="${CSS_CLASSES.METRIC_VALUE_LARGE} ${isTotalPos ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: ${mainValueSize}; line-height: 1; font-weight: 800;">
                        ${formatCurrency(Math.abs(metrics.totalReturn))}
                    </span>
                    <span class="${CSS_CLASSES.METRIC_PERCENT_SMALL} ${isTotalPos ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: 0.75rem; font-weight: 700;">
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

        // 4. Initialize DNA Strip if shares available
        const dnaContainer = container.querySelector('.share-dna-container');
        if (dnaContainer && shares.length > 0) {
            const pieChart = new SharePieChart(shares);
            pieChart.renderDnaStrip(dnaContainer, 9);
        }
    }

    renderStockDetailsModal(stock) {
        this._currentDetailsStock = stock;
        const existingModal = document.getElementById(IDS.STOCK_DETAILS_MODAL);
        if (existingModal) existingModal.remove();

        // FAILSAFE: Resolve Name if missing (e.g. from partial updates)
        if (!stock.name) {
            const found = AppState.data.shares.find(s => (s.code === stock.code || s.shareName === stock.code));
            if (found && found.name) stock.name = found.name;
            else if (found && found.companyName) stock.name = found.companyName;
        }

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
        const changeStr = formatCurrency(Math.abs(change));
        const pctStr = formatPercent(stock.pctChange || stock.dayChangePercent);

        // Resolve Sector
        const sectorName = stock.sector || FALLBACK_SECTOR_MAP[stock.code] || '';

        const colorClass = isPos ? CSS_CLASSES.PREVIEW_CHANGE_POS : (isNeg ? CSS_CLASSES.PREVIEW_CHANGE_NEG : CSS_CLASSES.NEUTRAL);
        const trendBgClass = isPos ? CSS_CLASSES.TREND_UP_BG : (isNeg ? CSS_CLASSES.TREND_DOWN_BG : CSS_CLASSES.TREND_NEUTRAL_BG);

        const modal = document.createElement('div');
        modal.id = IDS.STOCK_DETAILS_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;
        modal.dataset.stockCode = stock.code;

        // Ensure Details modal is on top of Allocation modal (Allocation is at 20002)
        modal.style.setProperty('z-index', '21000', 'important');

        // Research Links - Use the static seeding logic
        const rawLinks = (AppState.preferences.researchLinks && AppState.preferences.researchLinks.length > 0)
            ? AppState.preferences.researchLinks
            : RESEARCH_LINKS_TEMPLATE;

        const links = rawLinks.map(link => ({
            displayName: link.displayName || link.name,
            url: LinkHelper.replacePlaceholders(link.url, stock),
            description: link.description || ''
        }));

        const safeVal = (v, fmt) => (v !== undefined && v !== null && v !== 0) ? fmt(v) : '-';

        // Check if we should show a Back button (e.g. if Allocation modal is present)
        const hasAllocationModal = document.getElementById('share-pie-modal') !== null;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
                <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_LARGE}">
                    <!-- Header -->
                    <div class="${CSS_CLASSES.MODAL_HEADER}">
                        <div class="${CSS_CLASSES.MODAL_HEADER_LEFT} ${CSS_CLASSES.FLEX_1}">
                            <div class="${CSS_CLASSES.TEXT_LEFT} ${CSS_CLASSES.W_FULL}">
                                <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER} ${CSS_CLASSES.JUSTIFY_START}">
                                    ${hasAllocationModal ? `
                                        <button class="modal-back-btn" id="details-back-btn" title="Back to Allocation" style="margin-right: 12px; margin-left: -5px;">
                                            <i class="fas fa-chevron-left"></i>
                                        </button>
                                    ` : ''}
                                    <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" id="gemini-header-link" role="link" aria-label="Ask AI Deep Dive" style="text-decoration: none; color: inherit; display: inline-flex; align-items: center; -webkit-touch-callout: default !important; user-select: auto !important; position: relative; z-index: 10; padding: 4px; margin: -4px;">
                                        <div class="card-code-pill" style="background: none; border: none; padding: 0; gap: 8px; display: inline-flex; align-items: center;">
                                            <img src="https://files.marketindex.com.au/xasx/96x96-png/${stock.code.toLowerCase()}.png" class="favicon-icon" style="width: 24px; height: 24px;" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                                            <h1 class="${CSS_CLASSES.MODAL_TITLE} ${CSS_CLASSES.DISPLAY_TITLE} ${CSS_CLASSES.MB_0} ${CSS_CLASSES.TEXT_LEFT} ${CSS_CLASSES.MODAL_TITLE_AUTO}">${stock.code}</h1>
                                        </div>
                                        <span style="display: inline-block; width: 1.5ch;"></span>
                                        <img src="gemini-icon.png" style="width: 20px; height: 20px; pointer-events: none; vertical-align: middle;">
                                    </a>
                                </div>
                                <div class="${CSS_CLASSES.MODAL_SUBTITLE} ${CSS_CLASSES.TEXT_LEFT}" style="margin-top: 4px; font-weight: 500; opacity: 0.9;">${stock.name || 'ASX Share'}</div>
                                ${stock.starRating > 0 ? `
                                    <div class="${CSS_CLASSES.STAR_RATING} ${CSS_CLASSES.MT_TINY}" style="justify-content: flex-start;">
                                        ${Array.from({ length: stock.starRating }, () => `
                                            <i class="fas ${UI_ICONS.STAR} ${CSS_CLASSES.TEXT_COFFEE}"></i>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
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
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.TEXT_LEFT} ${CSS_CLASSES.INVESTMENT_CARD} ${trendBgClass} ${CSS_CLASSES.CURSOR_POINTER}" data-action="deep-link" data-id="${stock.id}" data-section="core" title="Edit Share Details">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.TEXT_LEFT} ${CSS_CLASSES.START_CENTER_ROW}">
                                        <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.W_FULL}">
                                            <div class="${CSS_CLASSES.FLEX_COLUMN} ${CSS_CLASSES.ALIGN_START} ${CSS_CLASSES.CURSOR_POINTER}" data-action="market-index" data-code="${stock.code}" title="View ${stock.code} on Market Index" style="position: relative; z-index: 10;">
                                                <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER}">
                                                    <i class="fas ${UI_ICONS.INVESTMENT}" style="margin-right: 8px;"></i>
                                                    <span>Investment</span>
                                                </div>
                                                ${sectorName ? `<span class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.GHOSTED} ${CSS_CLASSES.ITALIC} ${CSS_CLASSES.FONT_NORMAL} mt-1px">${sectorName}</span>` : ''}
                                            </div>
                                            <div class="${CSS_CLASSES.KANGAROO_WRAPPER} ${stock.muted ? CSS_CLASSES.IS_MUTED : ''}"
                                                 data-code="${stock.code}"
                                                 data-share-id="${stock.id || ''}"
                                                 title="${stock.muted ? 'Unmute Share' : 'Mute Share'}"
                                                 style="position: relative; z-index: 50; cursor: pointer;"
                                                  onclick="
                                                    event.stopPropagation(); 
                                                    event.preventDefault(); 
                                                    const code = this.dataset.code;
                                                    const shareId = this.dataset.shareId;
                                                    const currentlyMuted = this.classList.contains('${CSS_CLASSES.IS_MUTED}');
                                                    
                                                    // Toggle class immediately for responsive UI
                                                    this.classList.toggle('${CSS_CLASSES.IS_MUTED}'); 
                                                    
                                                    document.dispatchEvent(new CustomEvent('${EVENTS.TOGGLE_SHARE_MUTE}', { 
                                                        detail: { id: shareId || null, code: code, muted: currentlyMuted } 
                                                    }))">
                                                <img src="${KANGAROO_ICON_SRC}" class="${CSS_CLASSES.KANGAROO_ICON_IMG}" />
                                            </div>
                                        </div>
                                    </h3>

                                </div>
                                <div class="${CSS_CLASSES.PRICE_PREVIEW} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.BORDER_NONE} ${CSS_CLASSES.BG_TRANSPARENT} ${CSS_CLASSES.GAP_SMALL} ${CSS_CLASSES.MB_0} ${CSS_CLASSES.FLEX_COLUMN}">
                                    <div class="${CSS_CLASSES.PREVIEW_ROW_MAIN} ${CSS_CLASSES.MB_TINY}">
                                        <span class="${CSS_CLASSES.PREVIEW_PRICE} ${CSS_CLASSES.PREVIEW_PRICE_LARGE}">${formatCurrency(stock.live || currentPrice)}</span>
                                        <span class="${CSS_CLASSES.PREVIEW_CHANGE} ${isPos ? CSS_CLASSES.PREVIEW_CHANGE_POS : CSS_CLASSES.PREVIEW_CHANGE_NEG}">
                                            ${changeStr} (${pctStr})
                                        </span>
                                    </div>

                                    ${units > 0 ? `
                                    <div class="${CSS_CLASSES.DETAIL_ROW} ${CSS_CLASSES.PT_TINY} ${CSS_CLASSES.MB_SMALL}">
                                        <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Impact</span>
                                        <span class="${CSS_CLASSES.DETAIL_VALUE} ${stock.dayChangeValue > 0 ? CSS_CLASSES.POSITIVE : (stock.dayChangeValue < 0 ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.NEUTRAL)}">
                                            ${formatCurrency(Math.abs(stock.dayChangeValue || 0))}
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
                                    </div>
                                    <div class="${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.JUSTIFY_BETWEEN} ${CSS_CLASSES.ALIGN_END} ${CSS_CLASSES.MT_AUTO} ${CSS_CLASSES.W_FULL} ${CSS_CLASSES.PT_TINY}">
                                        <div class="${CSS_CLASSES.WATCHLIST_MEMBERSHIP} ${CSS_CLASSES.GHOSTED} ${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.OPACITY_70} ${CSS_CLASSES.ITALIC} ${CSS_CLASSES.TEXT_LEFT}">
                                            ${watchlistsText}
                                        </div>
                                        ${stock.shareRegistry && REGISTRY_LINKS[stock.shareRegistry] ? (
                (() => {
                    const url = REGISTRY_LINKS[stock.shareRegistry];
                    let hostname = '';
                    try {
                        hostname = new URL(url).hostname;
                        if (stock.shareRegistry === 'MUFG') hostname = 'linkmarketservices.com.au';
                    } catch (e) { }
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
                    return `
                                                <a href="${url}" target="_blank" rel="noopener noreferrer" class="${CSS_CLASSES.ICON_BTN_GHOST}" title="Open ${stock.shareRegistry}" style="padding: 0; display: flex; align-items: center;" onclick="event.stopPropagation()">
                                                    <img src="${faviconUrl}" style="width: 24px; height: 24px; border-radius: 4px;" alt="${stock.shareRegistry}">
                                                </a>
                                            `;
                })()
            ) : ''}
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: Holdings & Performance (Conditional) -->
                            ${units > 0 ? `
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${trendBgClass} ${CSS_CLASSES.CURSOR_POINTER}" data-action="deep-link" data-id="${stock.id}" data-section="holdings">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas ${UI_ICONS.WALLET}"></i> Holdings & Performance
                                        </div>
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
                                            ${formatCurrency(Math.abs((stock.live || currentPrice) - avgPrice))} 
                                            (${formatPercent((((stock.live || currentPrice) - avgPrice) / (avgPrice || 1)) * 100)})
                                        </span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Return</span>
                                        <span class="${CSS_CLASSES.DETAIL_VALUE} ${capitalGain > 0 ? CSS_CLASSES.POSITIVE : (capitalGain < 0 ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.NEUTRAL)}">
                                            ${formatCurrency(Math.abs(capitalGain))} 
                                            (${formatPercent((capitalGain / (costBasis || 1)) * 100)})
                                        </span>
                                </div>

                                <div class="${CSS_CLASSES.DETAIL_ROW}">
                                    <span class="${CSS_CLASSES.DETAIL_LABEL}">Net Cost</span>
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatCurrency(costBasis)}</span>
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

                                <!-- Sharesight Link (Bottom Right) -->
                                <div style="position: absolute; bottom: 12px; right: 12px; z-index: 10;">
                                    <a href="https://portfolio.sharesight.com/${stock.shareSightCode ? `holdings/${stock.shareSightCode}` : ''}" target="_blank" rel="noopener noreferrer" class="${CSS_CLASSES.ICON_BTN_GHOST}" title="Open in Sharesight" style="padding: 0; display: flex;" onclick="event.stopPropagation()">
                                        <img src="https://www.google.com/s2/favicons?domain=sharesight.com&sz=64" style="width: 22px; height: 22px; border-radius: 4px; opacity: 0.8;" alt="Sharesight">
                                    </a>
                                </div>
                            </div>
                            ` : ''}

                            <!-- Card: 52W Chart Preview -->
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${trendBgClass} ${CSS_CLASSES.CURSOR_POINTER}" id="miniChartCard_${stock.code}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}">
                                        <i class="fas fa-hourglass-half"></i> 52W Chart Preview
                                    </h3>
                                </div>
                                <div id="miniChartHost_${stock.code}" style="margin-top: 8px;"></div>
                            </div>
    
                            <!-- Card 3: Dividends -->
                            ${stock.dividendAmount > 0 ? `
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${trendBgClass} ${CSS_CLASSES.CURSOR_POINTER}" data-action="deep-link" data-id="${stock.id}" data-section="dividends">
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
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${CSS_CLASSES.CURSOR_POINTER} ${trendBgClass}" data-action="deep-link" data-id="${stock.id}" data-section="target">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="display: flex; align-items: center; gap: 8px;">
                                    <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-crosshairs"></i> Alerts
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
                                <div class="${CSS_CLASSES.DETAIL_CARD} ${CSS_CLASSES.CURSOR_POINTER} ${trendBgClass}" data-action="deep-link" data-id="${stock.id}" data-section="notes">
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
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${trendBgClass} ${CSS_CLASSES.CURSOR_POINTER}" data-action="deep-link" data-id="${stock.id}" data-section="holdings">
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
                                    <span class="${CSS_CLASSES.DETAIL_VALUE}">${formatFriendlyDate(stock.entryDate || stock.purchaseDate)}</span>
                                </div>
                            </div>

                            <!-- Card 6: Research -->
                            <div class="${CSS_CLASSES.DETAIL_CARD} ${trendBgClass}">
                                <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}">
                                    <h3 id="${IDS.RESEARCH_LINKS_TITLE_DETAILS}" class="${CSS_CLASSES.DETAIL_LABEL} clickable" style="width: 100%; display: flex; align-items: center; justify-content: flex-start;">
                                        <i class="fas ${UI_ICONS.GLOBE}"></i> 
                                        <span style="margin-left: 8px;">Research</span>
                                        <i class="fas fa-chevron-down chevron-discreet"></i>
                                    </h3>
                                </div>
                                <div class="research-links-grid">
                                    ${links.map(link => {
                const finalLink = typeof link === 'string' ? { name: link, url: link } : link;
                let hostname = '';
                try {
                    hostname = new URL(finalLink.url).hostname;
                } catch (e) {
                    console.warn('Invalid URL for favicon:', finalLink.url);
                }

                // Fix for SelfWealth: Use DuckDuckGo icons
                let faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
                if (hostname.includes('selfwealth')) {
                    faviconUrl = 'https://icons.duckduckgo.com/ip3/selfwealth.com.au.ico';
                }

                const substitutedUrl = (finalLink.url || '').replace(/\${code}/gi, stock.code);

                return `
                    <a href="${substitutedUrl}" target="_blank" rel="noopener noreferrer external" class="research-link-btn" onclick="event.stopPropagation();">
                        <img src="${faviconUrl}" class="link-favicon" alt="">
                        <div class="link-info-stack">
                            <span class="link-name">${finalLink.displayName || finalLink.name}</span>
                            <span class="link-desc">${finalLink.description || ''}</span>
                        </div>
                    </a>
                `;
            }).join('')}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
        `;

        document.body.appendChild(modal);

        // Gemini Interaction Binding
        const geminiLink = modal.querySelector('#gemini-header-link');
        if (geminiLink) {
            LinkHelper.bindGeminiInteraction(
                geminiLink,
                () => GEMINI_PROMPTS.STOCK.map(p => ({
                    ...p,
                    text: LinkHelper.replacePlaceholders(p.text, stock)
                }))
            );
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
                            shareCode: stock.code || stock.shareName,
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
                if (!stock.id) {
                    // Do NOT return. Let AppController attempt to find it or treat as Add.
                }

                // REMOVED close() to allow stacking and "Step Back" support.
                // Details modal stays open, Edit modal pushes on top.

                setTimeout(() => {
                    const event = new CustomEvent(EVENTS.REQUEST_EDIT_SHARE, { detail: { code: stock.code, id: stock.id } });
                    document.dispatchEvent(event);
                }, 150);
            });
        }

        // Research Links Management Handler
        const researchTitle = modal.querySelector(`#${IDS.RESEARCH_LINKS_TITLE_DETAILS}`);
        if (researchTitle) {
            researchTitle.addEventListener('click', () => {
                const event = new CustomEvent('REQUEST_RESEARCH_LINKS_MANAGE', {
                    detail: { code: stock.code }
                });
                document.dispatchEvent(event);
            });
        }

        // AUTO-REFRESH RESEARCH SECTION
        const researchUpdateHandler = () => {
            if (document.contains(modal)) {
                // Determine new links
                const newLinks = AppState.preferences.researchLinks && AppState.preferences.researchLinks.length > 0
                    ? AppState.preferences.researchLinks
                    : RESEARCH_LINKS_TEMPLATE;

                const grid = modal.querySelector('.research-links-grid');
                if (grid) {
                    grid.innerHTML = newLinks.map(link => {
                        const finalLink = typeof link === 'string' ? { displayName: 'Link', url: link } : link;

                        // Robust substitution for both URL and Display Name
                        const codeRegex = /\$(?:\{code\}|\(code\)|code)/gi;
                        const substitutedUrl = (finalLink.url || '').replace(codeRegex, stock.code);
                        const substitutedName = (finalLink.displayName || finalLink.name || 'Link').replace(codeRegex, stock.code);

                        let hostname = '';
                        try { hostname = new URL(substitutedUrl).hostname; } catch (e) { }
                        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

                        return `
                            <a href="${substitutedUrl}" target="_blank" rel="noopener noreferrer" class="research-link-btn">
                                <img src="${faviconUrl}" class="link-favicon" alt="">
                                <div class="link-info-stack">
                                    <span class="link-name">${substitutedName}</span>
                                    <span class="link-desc">${finalLink.description || ''}</span>
                                </div>
                            </a>
                        `;
                    }).join('');
                }
            } else {
                window.removeEventListener(EVENTS.RESEARCH_LINKS_UPDATED, researchUpdateHandler);
            }
        };
        window.addEventListener(EVENTS.RESEARCH_LINKS_UPDATED, researchUpdateHandler);


        // Mini Chart Preview - instantiate and wire click to expand
        const miniChartHost = modal.querySelector(`#miniChartHost_${stock.code}`);
        let miniChartInstance = null;

        if (miniChartHost) {
            // Use day change to determine line color (green if up, red if down)
            const dayChange = stock.change || stock.dayChangeValue || 0;
            // Pass callback to open fullscreen chart
            // Pass callback to open fullscreen chart
            miniChartInstance = new MiniChartPreview(
                miniChartHost,
                stock.code,
                stock.name,
                dayChange,
                () => ChartModal.show(stock.code, stock.name)
            );
        }

        // Back Button functionality
        const detailsBackBtn = modal.querySelector('#details-back-btn');
        if (detailsBackBtn) {
            detailsBackBtn.addEventListener('click', () => {
                history.back(); // Triggers NavManager to close this modal and return to previous
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
            <svg class="sort-asx-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="currentColor">ASX</text>
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
            // Chevron Padding Expanded: Left (20px) overlaps text, Right (30px) extends right.
            // Matching Negative Margins ensure the icon remains in its original visual location.
            sortBtn.innerHTML = `${iconHtml}<span>${activeOption.label}</span> <span id="${IDS.SORT_PICKER_CHEVRON}" class="${CSS_CLASSES.CHEVRON_ICON}" style="padding: 10px 30px 10px 20px; margin-right: -30px; margin-left: -18px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s;"><i class="fas ${arrowIcon} ${arrowClass}"></i></span>`;
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

        // Research Links
        const rawLinks = AppState.preferences.researchLinks && AppState.preferences.researchLinks.length > 0
            ? AppState.preferences.researchLinks
            : RESEARCH_LINKS_TEMPLATE;

        const linksHtml = rawLinks.map(link => {
            const finalLink = typeof link === 'string' ? { name: link, url: link } : link;
            let hostname = '';
            try {
                hostname = new URL(finalLink.url).hostname;
            } catch (e) {
                console.warn('Invalid URL for favicon:', finalLink.url);
            }
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

            // Robust substitution using Regex (Matches Details Card logic)
            const codeRegex = /\$(?:\{code\}|\(code\)|code)/gi;
            const substitutedUrl = (finalLink.url || '').replace(codeRegex, stock.code);

            // CommSec Deep Link Fix (Firebase Dynamic Link)
            let finalUrl = substitutedUrl;
            if (substitutedUrl.includes('commsec.com.au') && !substitutedUrl.includes('page.link')) {
                const encodedTarget = encodeURIComponent(substitutedUrl);
                finalUrl = `https://commsecau.page.link/?link=${encodedTarget}&apn=au.com.commsec.android`;
            }

            return `
                <a href="${finalUrl}" target="_blank" rel="noopener noreferrer external" class="research-link-btn" onclick="event.stopPropagation();">
                    <img src="${faviconUrl}" class="link-favicon" alt="">
                    <div class="link-info-stack">
                        <span class="link-name">${finalLink.displayName || finalLink.name}</span>
                        <span class="link-desc">${link.description || ''}</span>
                    </div>
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
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" id="gemini-research-link" role="link" aria-label="Ask AI Deep Dive" style="text-decoration: none; color: inherit; display: inline-flex; align-items: center; -webkit-touch-callout: default !important; user-select: text !important; position: relative; z-index: 10; padding: 4px; margin: -4px;">
                                    <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="margin-bottom: 0;">${stock.code}</h2>
                                    <span style="display: inline-block; width: 2.5ch;"></span>
                                    <img src="gemini-icon.png" style="width: 18px; height: 18px; pointer-events: none; vertical-align: middle;">
                                </a>
                            </div>
                            <div class="${CSS_CLASSES.MODAL_SUBTITLE}" style="margin-top: 2px;">${stock.name}</div>
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
                                    ${formatCurrency(Math.abs(stock.change))} (${formatPercent(stock.pctChange)})
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
                        <h4 id="research-discovery-tools-title" class="${CSS_CLASSES.SECTION_TITLE} clickable">
                            Research <i class="fas fa-chevron-right research-chevron"></i>
                        </h4>
                        <div class="research-links-grid">
                            ${linksHtml}
                        </div>
                    </div>
                </div>
        `;

        // Bind Events
        modal.querySelector('#research-discovery-tools-title').addEventListener('click', () => {
            const event = new CustomEvent('REQUEST_RESEARCH_LINKS_MANAGE', {
                detail: { code: stock.code }
            });
            document.dispatchEvent(event);
        });

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

        // Gemini Interaction Binding
        const geminiLink = modal.querySelector('#gemini-research-link');
        if (geminiLink) {
            LinkHelper.bindGeminiInteraction(
                geminiLink,
                () => `Summarize the latest technical and fundamental developments for ${stock.code} on the ASX. Focus on recent price action, volume, and any relevant news or upcoming announcements. Provide a comprehensive outlook.`
            );
        }

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

        // CRITICAL: Reset edit mode on fresh open (prevents stale title "Hide / Global / Reorder")
        if (isFreshOpen || isDifferentWatchlist) {
            this.isSortEditMode = false;
        }

        // STRICT RULE: If Fresh Open or Watchlist Switch, force reset to Current Sort (Truth)
        // The UI rendering logic will then automatically offer the OPPOSITE of this value.
        if (!pendingDir) {
            const currentDir = currentSort.direction || 'asc';
            pendingDir = currentDir;
        }

        // ROBUST: Merge with existing context if arguments are missing to prevent overwriting callbacks
        const existingContext = this._sortContext || {};

        this._sortContext = {
            watchlistId,
            currentSort,
            onSelect: onSelect || existingContext.onSelect,
            onHide: onHide || existingContext.onHide,
            onGlobalToggle: onGlobalToggle || existingContext.onGlobalToggle,
            onGlobalCancel: onGlobalCancel || existingContext.onGlobalCancel,
            pendingDir
        };

        if (this.isSortEditMode === undefined) this.isSortEditMode = false;
        const mode = this.isSortEditMode ? 'reorder' : 'default';
        this.sortPickerMode = mode;

        // 2. Ensure Modal Exists (Singleton Pattern)
        const modal = this._getOrCreateSortModal();

        // 3. Prepare Data
        let type = 'STOCK';
        if (watchlistId === 'portfolio') type = 'PORTFOLIO';
        if (watchlistId === 'CASH') type = 'CASH';

        // Resolve Global Sort Order
        let optionsSource = SORT_OPTIONS.STOCK;
        if (type === 'PORTFOLIO') optionsSource = SORT_OPTIONS.PORTFOLIO;
        if (type === 'CASH') optionsSource = SORT_OPTIONS.CASH;

        let displayOptions = [...optionsSource];

        // Apply Saved Sort Order
        // FIX: Keys must match format used in _saveSortOptionOrder: "field-direction" (e.g., "code-asc")
        const savedOrder = AppState.preferences.sortOptionOrder ? AppState.preferences.sortOptionOrder[type] : null;
        if (savedOrder && Array.isArray(savedOrder)) {
            displayOptions.sort((a, b) => {
                // Match the key format used in save: field-direction
                const keyA = `${a.field}-${a.direction || 'asc'}`;
                const keyB = `${b.field}-${b.direction || 'asc'}`;
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

        // 3a. Unified Sort Logic (Deduplicate Fields)
        const seen = new Set();
        const filteredOptions = displayOptions.filter(opt => {
            if (seen.has(opt.field)) return false;
            seen.add(opt.field);
            return true;
        });

        // 4. Update UI Content (Incremental DOM Update)
        this._updateSortPickerUI(modal, filteredOptions, hiddenSet, currentSort, type);

        // NOTE: Drag events are now bound inside _updateSortPickerUI after the container is cloned.
        // Removed redundant binding attempt here that was failing due to dragBound guard issues.

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
        let modal = document.getElementById('sort-picker-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'sort-picker-modal';
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.SORT_PICKER_MODAL}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="sort-modal-title" class="${CSS_CLASSES.MODAL_TITLE} ${CSS_CLASSES.CLICKABLE}">
                        Select Sort Order 
                        <svg class="modal-title-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-left: 8px; transition: transform 0.3s ease;">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" data-dismiss="modal">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>

                <!-- Sort Direction Toggle (Unified) -->
                <div id="${IDS.SORT_DIRECTION_TOGGLE}" class="sort-direction-toggle">
                    <div class="${CSS_CLASSES.SEGMENTED_CONTROL}">
                        <button id="${IDS.SORT_TOGGLE_BTN}" class="${CSS_CLASSES.SEGMENTED_BUTTON} w-full">
                            <!-- Content populated dynamically -->
                        </button>
                    </div>
                </div>

                <!-- Combined Reorder/Hide Header -->
                <!-- Grid Columns: Equal 1fr width for perfect alignment -->
                <div id="sortEditHeaders" class="sort-header-row sort-edit-grid-layout ${CSS_CLASSES.HIDDEN}">
                    <div class="col-hide">Hide</div>
                    <div class="col-global">Global</div>
                    <div class="col-reorder">Reorder</div>
                </div>

                <div class="sort-picker-list" id="sort-picker-list"></div>
            </div>
            </style>
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

        // Bind Drag Events (MOVED TO TOGGLE LOGIC)

        // Root Delegation (Fixes Stale Context)
        if (!modal.dataset.clickBound) {
            modal.dataset.clickBound = "true";
            modal.addEventListener('click', (e) => {
                const context = this._sortContext || {};

                // DIAGNOSTIC CORE: Log details of Sort Picker Interaction
                const targetId = e.target.id;

                // --- DRAG COOLDOWN GUARD (TOP LEVEL) ---
                // If we are dragging or just finished, BLOCK ALL CLICKS immediately.
                if (this._isDraggingOrCoolingDown) {
                    console.warn('[ViewRenderer] Click BLOCKED by Drag Cooldown');
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return;
                }

                // Mode Toggle via Title (RESTORED)
                if (e.target.closest(`#${IDS.SORT_MODAL_TITLE}`)) {
                    // TERMINATION RULE: Switching to Reorder Mode cancels Global Sort
                    if (context.onGlobalCancel) {
                        context.onGlobalCancel();
                    }

                    this.isSortEditMode = !this.isSortEditMode;
                    // Default toggle logic:
                    if (this.isSortEditMode) {
                        this.sortPickerMode = 'reorder';
                    } else {
                        this.sortPickerMode = 'default';
                    }


                    // Update Title Text & Style
                    const title = modal.querySelector(`#${IDS.SORT_MODAL_TITLE}`);
                    if (title) {
                        if (this.isSortEditMode) {
                            title.firstChild.textContent = 'Hide / Global / Reorder ';
                            title.classList.add(CSS_CLASSES.TEXT_COFFEE);
                        } else {
                            title.firstChild.textContent = 'Select Sort Order ';
                            title.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                        }
                    }

                    this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect, context.onHide);
                    return;
                }

                // Mode Buttons (REMOVED)

                // Direction Toggles (Unified)
                const toggleBtn = e.target.closest(`#${IDS.SORT_TOGGLE_BTN}`);
                if (toggleBtn) {
                    const currentDir = this._sortContext.pendingDir || 'desc';
                    const newDir = (currentDir === 'desc') ? 'asc' : 'desc';

                    this._sortContext.pendingDir = newDir;

                    // Trigger immediate sort if we have a field
                    if (context.currentSort?.field) {
                        const f = context.currentSort.field;
                        // Notify Controller (Updates Background List)
                        context.onSelect({ field: f, direction: newDir }, 'TOGGLE');

                        // Update Modal State (Keep Open)
                        context.currentSort.direction = newDir;
                        this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect, context.onHide, context.onGlobalToggle, context.onGlobalCancel);
                    } else {
                        this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect, context.onHide, context.onGlobalToggle, context.onGlobalCancel);
                    }
                    return;
                }

                // --- DRAG COOLDOWN GUARD MOVED TO TOP ---

                // Global Selection Radio Interaction (Center Column)
                // TIGHTENED: Only trigger when clicking on the radio VISUAL or INPUT, not the wrapper
                // This prevents accidental global sort activation when clicking elsewhere on the row
                const clickedRadioVisual = e.target.closest('.square-radio-visual') ||
                    e.target.closest('input[name="global-sort-edit-radio"]');
                const globalRadioWrapper = clickedRadioVisual ? clickedRadioVisual.closest('.global-sort-radio-wrapper') : null;

                if (globalRadioWrapper) {
                    e.preventDefault();
                    e.stopPropagation();

                    const row = globalRadioWrapper.closest(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
                    if (!row) return;

                    const key = row.dataset.key; // "field-direction"
                    const [field] = key.split('-');

                    // Use pending direction or default 'asc'. 
                    // Note: user wants to "force that selection option". 
                    // If the user clicks "Dividend", we should probably use the CURRENT direction of Dividends if active, or default 'desc'?
                    // However, without a toggle visible, we rely on the row's implicit direction?
                    // Actually, the row IS `field-direction`.
                    // So if we have "Target Price-asc" row, we use "asc".
                    // But the sort picker renders BOTH directions? No, it usually renders ONE row per field unless expanded?
                    // Wait, `SORT_OPTIONS` usually has defined directions like "High to Low".
                    // Let's use the direction FROM THE KEY. This is the precise option displayed.
                    const directionFromKey = key.split('-')[1];

                    const direction = directionFromKey || this._sortContext.pendingDir || 'asc';

                    // USER FEEDBACK: "It should just highlight the radio button"
                    // Reverting the "Switch to Default" logic so buttons don't disappear.
                    // We stay in Edit Mode, but the UI updates to show the checked state.

                    if (context.onGlobalToggle) {
                        context.onGlobalToggle({ field, direction });
                        // Stay in Edit Mode.

                        // MANUAL TITLE UPDATE: "Global Sort Active" confirmation
                        // User Feedback: "when I [select] a global radio button it did not change the global Sort active in the title bar"
                        const title = document.getElementById(IDS.SORT_MODAL_TITLE);
                        if (title) {
                            const chevronHtml = `
                        <svg class="modal-title-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 1; transform: rotate(180deg); margin-left: 8px; transition: transform 0.3s ease;">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>`;
                            title.innerHTML = `<i class="fas ${UI_ICONS.GLOBE}"></i> Global Sort Active ${chevronHtml}`;
                        }

                    } else {
                        console.error('[ViewRenderer] onGlobalToggle callback missing!');
                    }
                    return;
                }

                // --- List Item Delegation ---
                const row = e.target.closest(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
                if (!row) return;

                // GUARD: Ignore clicks on the Drag Handle or its icon
                // This prevents "Selection" logic from firing when the user tries to drag.
                if (e.target.closest('.reorder-handle') || e.target.closest('.sort-reorder-handle')) {
                    e.stopPropagation(); // KILL the event here.
                    return;
                }

                const key = row.dataset.key; // "field-direction"

                // Reorder Arrow Buttons
                if (e.target.closest('.sort-arrow-up')) {
                    e.preventDefault(); e.stopPropagation();
                    const currentRow = row;
                    const prevRow = row.previousElementSibling;
                    if (prevRow) {
                        row.parentNode.insertBefore(currentRow, prevRow);
                        this._saveSortOptionOrder(row.parentNode);
                        // No need to full re-render, swap is visual. But to be safe on state:
                        if (this._sortContext) {
                            const ctx = this._sortContext;
                            // Short delay to allow visual update perception? No, instant is better.
                            // this.renderSortPickerModal(ctx.watchlistId, ctx.currentSort, ctx.onSelect, ctx.onHide, ctx.onGlobalToggle, ctx.onGlobalCancel);
                        }
                    }
                    return;
                }

                if (e.target.closest('.sort-arrow-down')) {
                    e.preventDefault(); e.stopPropagation();
                    const currentRow = row;
                    const nextRow = row.nextElementSibling;
                    if (nextRow) {
                        // unexpected behavior with insertBefore: to move down, we insert before next's next.
                        row.parentNode.insertBefore(currentRow, nextRow.nextSibling);
                        this._saveSortOptionOrder(row.parentNode);
                    }
                    return;
                }

                // Reorder Action Buttons (Legacy? No, ActBtn used to be there)
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

                    // CRITICAL FIX: Display Options must include HIDDEN items now, so we can unhide/reorder them? 
                    // User said: "Normally if a sort order is ticked. That sort will be hidden from the list"
                    // This implies the list IN THE MODAL shows everything? 
                    // "Sort order reorder AND hide function... combine them".
                    // Yes, the modal must show ALL options.
                    // The previous logic filtered them out. We must pass full list to reorder.

                    // Use the same filtered/unfiltered list as rendered. 
                    // In Render, we will now SHOW hidden items.
                    const displayOptions = options; // Show ALL in this modal

                    this._handleSortReorder(type, displayOptions, index, dir, context.watchlistId, context.currentSort, context.onSelect);
                    return;
                }

                // Row Interaction (Hide / Select)
                if (this.sortPickerMode === 'reorder') {
                    // Label Interaction (Hide / Unhide) - User Requirement: "Hide Shares by Tapping Name"
                    // UPDATED: Supports tapping Name, Checkbox (wrapper), OR the Visibility Icon itself
                    if (e.target.closest(`.${CSS_CLASSES.SORT_PICKER_LABEL}`) ||
                        e.target.closest('.sort-hide-checkbox') ||
                        e.target.closest('.sort-icon-slot') ||
                        e.target.closest(`.sort-item-visibility`)) {

                        const row = e.target.closest(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
                        if (!row) return;

                        const key = row.dataset.key; // "field-direction"
                        const type = row.dataset.type || 'STOCK';
                        const stringKey = String(key);

                        if (!AppState.hiddenSortOptions[type]) AppState.hiddenSortOptions[type] = new Set();
                        const hiddenSet = AppState.hiddenSortOptions[type];

                        if (hiddenSet.has(stringKey)) hiddenSet.delete(stringKey);
                        else hiddenSet.add(stringKey);

                        AppState.saveHiddenSortOptions();
                        if (typeof this._sortContext.onHide === 'function') {
                            this._sortContext.onHide();
                        }

                        // Optimistic UI Update (Re-render)
                        this.renderSortPickerModal(context.watchlistId, context.currentSort, context.onSelect, context.onHide, context.onGlobalToggle, context.onGlobalCancel);
                        return;
                    }
                    // Do not allow "Select" in reorder mode (unless we want to?)
                    // Usually edit mode disables selection.
                    return;
                }

                // Default Mode: Selection (Clicking Icon or Row Background)
                // Long Press Guard
                if (isLongPress) {
                    isLongPress = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                // Standard List Selection
                if (!this.isSortEditMode && !isLongPress) {
                    const [field, direction] = key.split('-');
                    const pendingDir = this._sortContext.pendingDir || 'desc';

                    context.onSelect({ field, direction: pendingDir }, 'LIST');
                    this._closeSortPickerInstance();
                }
            });
        } // Close guard

        return modal;
    }

    _updateSortPickerUI(modal, displayOptions, hiddenSet, currentSort, type) {
        // CRITICAL GUARD: Block all UI updates while a drag is in progress.
        // Background processes (live prices, preference syncs) can trigger re-renders mid-drag.
        // If we rebuild the list from saved order while dragging, items snap back to original positions.
        if (this._isDraggingOrCoolingDown || this._draggedSortItem) {
            return;
        }

        // Update Title Style
        const title = modal.querySelector(`#${IDS.SORT_MODAL_TITLE}`);

        const chevronHtml = `
            <svg class="modal-title-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-left: 8px; transition: transform 0.3s ease;">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>`;

        if (this.isSortEditMode) {
            title.innerHTML = `Hide / Global / Reorder ${chevronHtml}`;
            title.classList.add(CSS_CLASSES.TEXT_COFFEE);
        } else {
            // Check Global Sort
            if (AppState.preferences.globalSort) {
                title.classList.add(CSS_CLASSES.TEXT_COFFEE);
                title.innerHTML = `<i class="fas ${UI_ICONS.GLOBE}"></i> Global Sort Active ${chevronHtml}`;
            } else {
                title.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                title.innerHTML = `Select Sort Order ${chevronHtml}`;
            }
        }

        // Show/Hide Header Row (Title Helper)
        const headerRow = modal.querySelector('#sortEditHeaders');
        if (headerRow) {
            if (this.isSortEditMode) {
                headerRow.classList.add(CSS_CLASSES.IS_ACTIVE);
                headerRow.classList.remove(CSS_CLASSES.HIDDEN);
            } else {
                headerRow.classList.remove(CSS_CLASSES.IS_ACTIVE);
                headerRow.classList.add(CSS_CLASSES.HIDDEN);
            }
        }

        // Animate Chevron (Hide in Global Mode or ensure consistent state)
        const chevron = modal.querySelector('.modal-title-chevron');
        if (chevron) {
            // If Global Mode, we don't show the chevron usually as the title replaced it.
            // But if we did, logic here:
            chevron.style.transform = this.isSortEditMode ? 'rotate(180deg)' : 'rotate(0deg)';
            chevron.style.opacity = this.isSortEditMode ? '1' : '0.3';
        }

        // --- Toggle Button Visibility (Hide in Reorder Mode) ---
        const toggleContainer = modal.querySelector(`#${IDS.SORT_DIRECTION_TOGGLE}`);
        if (toggleContainer) {
            // Hide toggle in Reorder mode (to focus on reordering)
            toggleContainer.classList.toggle(CSS_CLASSES.HIDDEN, this.isSortEditMode);
        }

        // Update Toggle Button Content (if visible)
        if (!this.isSortEditMode) {
            const activeDir = this._sortContext.pendingDir || 'desc';
            const toggleBtn = modal.querySelector(`#${IDS.SORT_TOGGLE_BTN}`);

            if (toggleBtn) {
                const currentField = currentSort.field || 'code';
                const isTextField = ['code', 'name', 'category', 'comments', 'targetPrice'].includes(currentField);
                const highToLowDir = isTextField ? 'asc' : 'desc';
                let iconClass = '';
                let colorClass = '';
                let labelText = '';

                if (activeDir === highToLowDir) {
                    iconClass = 'fa-chevron-down';
                    colorClass = CSS_CLASSES.TEXT_NEGATIVE;
                    labelText = 'Low to High';
                } else {
                    iconClass = 'fa-chevron-up';
                    colorClass = CSS_CLASSES.TEXT_POSITIVE;
                    labelText = 'High to Low';
                }

                toggleBtn.innerHTML = `
                    <div class="${CSS_CLASSES.W_FULL} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER}" style="justify-content: center;">
                        <i class="fas ${iconClass} ${colorClass}" style="margin-right: 15px;"></i>
                        <span class="${CSS_CLASSES.FONT_BOLD}">${labelText}</span>
                        <i class="fas ${iconClass} ${colorClass}" style="margin-left: 15px;"></i>
                    </div>
                `;
                toggleBtn.classList.remove(CSS_CLASSES.GHOSTED);
            }
        }

        // Filter Options for Default Mode (Hide Hidden Items)
        let filteredOptions = displayOptions;

        // In Reorder/Edit Mode we show ALL options.
        if (!this.isSortEditMode) {
            filteredOptions = displayOptions.filter(opt => !hiddenSet.has(`${opt.field}-${opt.direction}`));
        }

        // Generate and Update List Content
        // Generate and Update List Content
        const listContainer = modal.querySelector('#sort-picker-list');
        listContainer.innerHTML = ''; // Clear existing

        // Toggle Reorder Active Class on List (For CSS specifics if needed)
        if (this.isSortEditMode) {
            listContainer.classList.add(CSS_CLASSES.REORDER_ACTIVE);
        } else {
            listContainer.classList.remove(CSS_CLASSES.REORDER_ACTIVE);
        }

        filteredOptions.forEach((opt, index) => {
            const uniqueKey = `${opt.field}-${opt.direction}`;
            let isActive = (currentSort.field === opt.field);
            const isHidden = hiddenSet.has(String(uniqueKey));

            // Class Logic
            // Class Logic
            let rowClasses = 'sort-picker-row'; // HARDCODED FIX: Bypass missing constant risk
            // In Reorder mode, highlight hidden items
            if (this.isSortEditMode) {
                rowClasses += ' edit-mode';
                if (isHidden) rowClasses += ' sort-item-hidden';
            }
            // In Default mode, highlight active item
            if (!this.isSortEditMode && isActive) {
                rowClasses += ' active'; // Standard active class
            }

            // Ensure icons are mapped correctly or default
            let iconClass = opt.icon;
            if (opt.label === 'ASX Code') iconClass = '';

            let iconHtml;
            if (opt.label === 'ASX Code') {
                iconHtml = `
            <div class="sort-icon-slot">
                <svg class="sort-asx-icon modal-asx-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <text x="0" y="16" dominant-baseline="alphabetic" text-anchor="start" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="currentColor">ASX</text>
                </svg>
            </div>`;
            } else {
                iconHtml = `<div class="sort-icon-slot"><i class="fas ${iconClass}"></i></div>`;
            }

            // Right Control: Reorder Arrows (Edit Mode) vs Checkmark (Default)
            let rightControl = '';
            let centerControl = '<div class="sort-spacer"></div>'; // Default spacer


            // EDIT MODE: 3-Column Layout
            // Col 1: Hide Checkbox + Info (Handled by startContent + rowContent)
            // Col 2: Global Radio (Center)
            // Col 3: Reorder (Drag Handle)

            if (this.isSortEditMode) {
                // GLOBAL RADIO (Center Column)
                const globalPref = AppState.preferences.globalSort;
                const isGlobalActive = globalPref && (globalPref.field === opt.field);

                centerControl = `
                    <div class="global-sort-radio-wrapper square-radio-wrapper" style="justify-self: center;">
                        <input type="radio" name="global-sort-edit-radio" ${isGlobalActive ? 'checked' : ''} style="pointer-events: none;">
                        <div class="square-radio-visual"></div>
                    </div>
                `;

                rightControl = `
                    <div class="sort-reorder-handle reorder-handle" title="Drag to reorder" style="color: var(--text-muted); opacity: 0.7; touch-action: none;">
                        <i class="fas fa-grip-lines" style="pointer-events: none;"></i>
                    </div>`;
            }

            // DEFAULT MODE
            else {
                if (isActive) {
                    rightControl = `<div class="sort-selection-tick active" style="margin-left: auto;"><i class="fas ${UI_ICONS.CHECK}"></i></div>`;
                } else {
                    rightControl = `<div style="margin-left: auto;"></div>`; // Empty placeholder for grid
                }
            }

            // MODIFIED ROW CONTENT FOR EDIT MODE
            // Left Column is just Label + Icon (Click to Hide)
            // Center Column is Global Radio

            // Override grid layout via class
            // Row style override removed - CSS handles layout via .sort-picker-row class
            const rowStyle = '';

            const extraClass = this.isSortEditMode ? 'sort-edit-grid-layout is-active' : '';

            // HIGHLIGHT LOGIC: If this row is the active global sort, startContent (Label/Icon) should be coffee colored
            // We use the same condition 'isGlobalActive' calculated for the radio button above relative to Scope (Edit Mode)
            // But wait, 'isGlobalActive' was defined inside the 'if (this.isSortEditMode)' block.
            // We should lift validGlobal check to be accessible here or recalculate.
            const validGlobal = AppState.preferences.globalSort;
            const isRowGlobal = validGlobal && (validGlobal.field === opt.field);

            // Apply coffee color to the TEXT/ICON container if global OR active in default mode
            const contentColorClass = (isRowGlobal || (!this.isSortEditMode && isActive)) ? CSS_CLASSES.TEXT_COFFEE : '';

            // CONSTRUCT TEMPLATE (Inner HTML Only)
            const innerHTML = `
                <div class="${CSS_CLASSES.SORT_PICKER_ROW_CONTENT} ${contentColorClass}" style="align-items: center;">
                    <div class="${CSS_CLASSES.SORT_PICKER_ICON}">${iconHtml}</div>
                    <div class="${CSS_CLASSES.SORT_PICKER_LABEL}">${opt.label}</div>
                </div>

                <!-- Center Column (Global Radio or Spacer) - Only in Edit Mode -->
                ${this.isSortEditMode ? centerControl : ''}

                <!-- Right Column (Reorder or Tick) -->
                ${rightControl}
            `;

            // CREATE DOM ELEMENT (Robust Approach)
            const div = document.createElement('div');
            // Set attributes
            const activeClass = this.isSortEditMode ? CSS_CLASSES.IS_ACTIVE : '';
            div.className = `${rowClasses} ${extraClass} ${activeClass}`;
            div.draggable = this.isSortEditMode; // CRITICAL: Enable Native Drag


            // Note: rowClasses already includes SORT_PICKER_ROW
            div.dataset.key = uniqueKey;
            div.dataset.index = index;
            div.dataset.type = modal.dataset.type || 'STOCK'; // Wait, modal doesn't have dataset?
            // Actually _saveSortOptionOrder uses container.querySelector.dataset.type.
            // But opt doesn't have type?
            // The method _updateSortPickerUI has 'type' argument! (Line 1598)
            // But wait, I need to check if 'type' is available in scope.
            // Snippet 1193 showed '_updateSortPickerUI(modal, displayOptions, hiddenSet, currentSort, type)'.
            // Yes, 'type' is In Scope.
            div.dataset.type = type || 'STOCK';

            // Set Style
            // div.style = ... (No)

            // SET DRAGGABLE EXPLICITLY
            if (this.isSortEditMode) {
                div.draggable = true;
                div.setAttribute('draggable', 'true'); // For CSS selectors
                div.dataset.draggable = "true";
            } else {
                div.setAttribute('draggable', 'false');
            }

            div.innerHTML = innerHTML;
            listContainer.appendChild(div);

        });

        // NUCLEAR OPTION: Clone container to strip ALL old listeners (including click/drag) and re-bind.
        // This guarantees a clean slate.
        const newContainer = listContainer.cloneNode(true);
        listContainer.parentNode.replaceChild(newContainer, listContainer);

        // BINDING STRATEGY: 
        // 1. Native HTML5 Drag (for Mouse/Desktop Pro users)
        this._bindSortDragEvents(newContainer);

        // 2. Native HTML5 Drag Only (Restored)
        // Ensure we only have ONE binding call.
    }

    // _bindPointerDragLogic REMOVED - Reverting to Standard Native Drag


    _bindSortDragEvents(container) {
        // FIX: Removed the dragBound guard entirely.
        // The "Nuclear Option" (cloneNode) is used in _updateSortPickerUI to get a fresh container,
        // but cloneNode(true) copies ALL attributes including data-drag-bound="true".
        // This caused the guard to skip binding, leaving the cloned container with NO drag events.
        // WatchlistUI and DashboardFilterModal work because they have no such guard.
        // Since we ALWAYS get a freshly cloned container in edit mode, we can safely bind every time.

        this._draggedSortItem = null;

        // CLONED FROM WATCHLIST UI
        container.addEventListener('dragstart', (e) => {
            const row = e.target.closest(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
            if (row) {
                // Set Global Drag Flag (for Click Guard)
                this._isDraggingOrCoolingDown = true;
                this._draggedSortItem = row;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(row.dataset.key || ''));
                setTimeout(() => row.classList.add(CSS_CLASSES.DRAGGING), 0);
            }
        });

        container.addEventListener('dragend', (e) => {
            const row = e.target.closest(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
            if (row) {
                row.classList.remove(CSS_CLASSES.DRAGGING);
                this._draggedSortItem = null;
                this._saveSortOptionOrder(container); // Pass container explicitly

                // Start Cooldown: Block clicks for 200ms after drop
                setTimeout(() => {
                    this._isDraggingOrCoolingDown = false;
                }, 200);
            } else {
                this._isDraggingOrCoolingDown = false; // Safety reset
            }

            // Clean up lines
            const rows = container.querySelectorAll(`.${CSS_CLASSES.SORT_PICKER_ROW}`);
            rows.forEach(r => r.classList.remove(CSS_CLASSES.DRAG_OVER, CSS_CLASSES.DRAG_OVER_BOTTOM));
        });

        container.addEventListener('dragover', (e) => {
            if (!this._draggedSortItem) return;
            e.preventDefault();

            // Explicitly allow drop
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }

            const afterElement = this._getSortDragAfterElement(container, e.clientY);

            // Visual Line Logic
            const rows = [...container.querySelectorAll(`.${CSS_CLASSES.SORT_PICKER_ROW}:not(.${CSS_CLASSES.DRAGGING})`)];
            rows.forEach(r => r.classList.remove(CSS_CLASSES.DRAG_OVER, CSS_CLASSES.DRAG_OVER_BOTTOM));

            if (afterElement == null) {
                const lastRow = rows[rows.length - 1];
                if (lastRow) lastRow.classList.add(CSS_CLASSES.DRAG_OVER_BOTTOM);
                container.appendChild(this._draggedSortItem);
            } else {
                afterElement.classList.add(CSS_CLASSES.DRAG_OVER);
                container.insertBefore(this._draggedSortItem, afterElement);
            }
        });
    }



    _getSortDragAfterElement(container, y) {
        // EXACT CLONE OF WATCHLIST LOGIC (but with Sort classes)
        const draggableElements = [...container.querySelectorAll(`.sort-picker-row:not(.dragging)`)];

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

    _saveSortOptionOrder(container) {
        const context = this._sortContext || {};
        const type = container.querySelector(`.sort-picker-row`)?.dataset.type || 'STOCK';
        const rows = Array.from(container.querySelectorAll(`.sort-picker-row`));
        const newOrder = rows.map(r => r.dataset.key);

        if (!AppState.preferences.sortOptionOrder) AppState.preferences.sortOptionOrder = {};
        AppState.preferences.sortOptionOrder[type] = newOrder;

        localStorage.setItem(STORAGE_KEYS.SORT_OPTION_ORDER, JSON.stringify(AppState.preferences.sortOptionOrder));

        if (AppState.triggerSync) AppState.triggerSync();
        // Since we are update the order on DragEnd, we don't necessarily need to re-render 
        // because the DOM is already sorted visually by the dragover event.
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
        container.querySelectorAll(`.${CSS_CLASSES.ASX_DROPDOWN_PILL} `).forEach(pill => {
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
            this.isSortEditMode = false;
            this.sortPickerMode = 'default';
            this.sortReorderMode = false;

            // Reset Title Text & Style
            const title = modal.querySelector(`#${IDS.SORT_MODAL_TITLE} `);
            if (title) {
                title.firstChild.textContent = 'Select Sort Order ';
                title.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                const chevron = title.querySelector('.modal-title-chevron');
                if (chevron) {
                    chevron.style.transform = 'rotate(0deg)';
                    chevron.style.opacity = '0.3';
                }
            }

            // Remove from history stack if closed manually
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        }
    }

    renderSummaryDetailModal(title, shares, valueField, trendClass = '') {
        const existing = document.getElementById(IDS.SUMMARY_DETAIL_MODAL);
        if (existing) existing.remove();

        // Apply trend-based class to the modal content for matching gradients
        const modal = document.createElement('div');
        modal.id = IDS.SUMMARY_DETAIL_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW} `;
        const modalContentClass = `${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM} ${trendClass}`;

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
                <div class="${modalContentClass}">
                    <div class="${CSS_CLASSES.MODAL_HEADER}">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">${title}</h2>
                        <div class="${CSS_CLASSES.MODAL_ACTIONS}">
                            ${title === 'Current Value' ? `
                                <button class="portfolio-history-modal-btn ${CSS_CLASSES.MODAL_ACTION_BTN}" title="View History">
                                    <i class="fas ${UI_ICONS.CHART}"></i>
                                </button>
                            ` : ''}
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

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN} `).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY} `).addEventListener('click', close);

        const historyModalBtn = modal.querySelector('.portfolio-history-modal-btn');
        if (historyModalBtn) {
            historyModalBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_PORTFOLIO_CHART));
            });
        }

        // Click row to open stock details
        modal.querySelectorAll(`.${CSS_CLASSES.SUMMARY_DETAIL_ROW} `).forEach(row => {
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

    /**
     * Shows a full-screen loading overlay with a custom message.
     * Complies with Constitution (View logic in Renderer).
     */
    showLoadingOverlay(title, subtitle) {
        const overlay = document.createElement('div');
        overlay.id = 'app-loading-overlay'; // Standard ID for removal
        overlay.className = CSS_CLASSES.SPLASH_SCREEN;
        overlay.style.flexDirection = 'column';
        overlay.style.zIndex = '99999';

        overlay.innerHTML = `
            <div style="font-size: 3rem; color: var(--color-accent); margin-bottom: 20px;">
                <i class="fas ${UI_ICONS.SPINNER}"></i>
            </div>
            <div class="${CSS_CLASSES.TEXT_XL} ${CSS_CLASSES.FONT_BOLD}">${title}</div>
            <div class="${CSS_CLASSES.TEXT_MUTED}" style="margin-top: 10px;">${subtitle}</div>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * Removes the loading overlay.
     */
    hideLoadingOverlay() {
        const overlay = document.getElementById('app-loading-overlay');
        if (overlay) overlay.remove();
    }

    /**
     * Internal helper to calculate border style string based on prefs and performance.
     */
    _getBorderStyles(changePercent) {
        const prefs = AppState.preferences.containerBorders;
        if (!prefs || !prefs.sides || prefs.sides.every(s => s === 0)) return '';

        let color = 'var(--color-accent)'; // Coffee default
        if (changePercent > 0) color = 'var(--color-positive)';
        else if (changePercent < 0) color = 'var(--color-negative)';

        const t = `${prefs.thickness}px`;
        const s = prefs.sides;

        let shadows = [];
        // Use inset box-shadow to achieve 90-degree square corners (no mitering)
        if (s[0]) shadows.push(`inset 0 ${t} 0 0 ${color}`); // Top
        if (s[1]) shadows.push(`inset -${t} 0 0 0 ${color}`); // Right
        if (s[2]) shadows.push(`inset 0 -${t} 0 0 ${color}`); // Bottom
        if (s[3]) shadows.push(`inset ${t} 0 0 0 ${color}`); // Left

        return shadows.length ? `box-shadow: ${shadows.join(', ')} !important; border-radius: 0 !important;` : '';
    }

    /**
     * Calculates the percentage position for the 52-week range marker.
     * @private
     */


    /**
     * Initializes background charts for Portfolio cards using MiniChartPreview.
     * @private
     */
    _initPortfolioCharts(data) {
        if (!data || data.length === 0) return;

        // Disconnect existing observer to prevent leaks or zombie callbacks
        if (this.portfolioChartObserver) {
            this.portfolioChartObserver.disconnect();
            this.portfolioChartObserver = null;
        }

        // Create IntersectionObserver for lazy loading
        this.portfolioChartObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target;

                    // Stop observing immediately
                    observer.unobserve(container);

                    // Get metadata
                    const code = container.dataset.code;
                    const change = Number(container.dataset.change) || 0;

                    // Lookup item for name (safer than dataset encoding)
                    const item = data.find(d => d.code === code);
                    const name = item ? item.name : code;

                    // Ensure no existing chart
                    if (container.querySelector('div')) return;

                    // Hydrate chart
                    new SparklinePreview(container, code, name, change, () => {
                        ChartModal.show(code, name);
                    }, false, '#a49393');
                }
            });
        }, {
            root: null, // viewport
            rootMargin: '100px', // Load shortly before appearing
            threshold: 0.01
        });

        // Observe elements
        // We use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            data.forEach(item => {
                const container = document.getElementById(`bg-chart-${item.id}`);
                if (container) {
                    this.portfolioChartObserver.observe(container);
                }
            });
        });
    }
}
