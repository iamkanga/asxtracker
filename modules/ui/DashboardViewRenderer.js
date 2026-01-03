/**
 * DashboardViewRenderer.js
 * Specialized renderer for the Dashboard view.
 * Displays market indices and commodities in a high-density stacked card view.
 */
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { IDS, CSS_CLASSES, DASHBOARD_SYMBOLS, STORAGE_KEYS, DASHBOARD_LINKS } from '../utils/AppConstants.js?v=5';
import { AppState } from '../state/AppState.js';

export class DashboardViewRenderer {
    constructor() {
        this.reorderMode = false;
    }

    /**
     * Renders the dashboard data.
     * @param {Array} data - Array of dashboard items (optional override).
     */
    render(data) {
        this.container = document.getElementById(IDS.CONTENT_CONTAINER);
        if (!this.container) {
            console.warn('DashboardViewRenderer: CONTENT_CONTAINER not found');
            return;
        }

        // ARCHITECTURAL REFINEMENT: Always use the processed data which merges DASHBOARD_SYMBOLS list.
        // This ensures all codes from AppConstants appear even if Firestore metadata is missing.
        let displayData = this._getProcessedData(data);

        if (!displayData || displayData.length === 0) {
            this.container.innerHTML = `
                <div class="${CSS_CLASSES.EMPTY_STATE}">
                    <i class="fas fa-chart-line ${CSS_CLASSES.TEXT_3XL} ${CSS_CLASSES.MB_MEDIUM} ${CSS_CLASSES.OPACITY_30}"></i>
                    <p>No dashboard items found.</p>
                </div>
            `;
            return;
        }

        // Update header Sydney time if in Dashboard watchlist
        const headerTime = document.getElementById(IDS.DASHBOARD_REORDER_TOGGLE);
        if (headerTime) {
            const now = new Date();
            const sydneyTime = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Australia/Sydney',
                hour: '2-digit', minute: '2-digit', weekday: 'short'
            }).format(now);
            headerTime.innerHTML = `Sydney: ${sydneyTime} ${this.reorderMode ? `<span class="${CSS_CLASSES.ML_SMALL} ${CSS_CLASSES.FONT_NORMAL} ${CSS_CLASSES.OPACITY_60}">(Adjusting...)</span>` : ''}`;
        }

        const viewMode = (AppState.viewMode || 'TABLE').toUpperCase();
        const viewModeClass = CSS_CLASSES[`VIEW_MODE_${viewMode}`] || CSS_CLASSES.VIEW_MODE_TABLE;

        let html = `
            <div class="${CSS_CLASSES.DASHBOARD_CONTAINER} ${this.reorderMode ? CSS_CLASSES.REORDER_ACTIVE : ''} ${viewModeClass}">
        `;

        displayData.forEach((item, index) => {
            html += this._createDashboardRow(item, index, displayData.length);
        });

        html += `</div>`;

        // Final sanity check before updating DOM
        if (html.includes('dashboard-row')) {
            this.container.innerHTML = html;
            this._bindEvents();
        }
    }

    /**
     * Binds internal dashboard events.
     * @private
     */
    _bindEvents() {
        // Reorder Toggle
        const toggle = document.getElementById(IDS.DASHBOARD_REORDER_TOGGLE);
        if (toggle) {
            toggle.onclick = () => {
                this.reorderMode = !this.reorderMode;
                this.render(AppState.data.dashboard);
            };
        }

        // Reorder buttons
        this.container.querySelectorAll(`.${CSS_CLASSES.REORDER_BTN}`).forEach(btn => {
            btn.onclick = (e) => {
                const code = btn.dataset.code;
                const direction = btn.dataset.dir; // 'up' or 'down'
                this._handleReorder(code, direction);
            };
        });

        // Clickable Rows (External Links)
        this.container.querySelectorAll(`.${CSS_CLASSES.DASHBOARD_ROW}.clickable`).forEach(row => {
            row.onclick = (e) => {
                // Don't trigger if clicking reorder buttons
                if (e.target.closest(`.${CSS_CLASSES.REORDER_BTN}`)) return;

                const url = row.dataset.url;
                if (url) {
                    window.open(url, '_blank');
                }
            };
        });
    }

    /**
     * Handles moving symbols up or down.
     * @private
     */
    _handleReorder(code, direction) {
        const index = DASHBOARD_SYMBOLS.indexOf(code);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= DASHBOARD_SYMBOLS.length) return;

        // Swap in DASHBOARD_SYMBOLS
        const temp = DASHBOARD_SYMBOLS[index];
        DASHBOARD_SYMBOLS[index] = DASHBOARD_SYMBOLS[newIndex];
        DASHBOARD_SYMBOLS[newIndex] = temp;

        // Persist order to preferences
        AppState.preferences.dashboardOrder = [...DASHBOARD_SYMBOLS];
        localStorage.setItem(STORAGE_KEYS.DASHBOARD_ORDER, JSON.stringify(AppState.preferences.dashboardOrder));
        AppState.triggerSync();

        // Re-render
        this.render(AppState.data.dashboard);
    }

    /**
     * Creates HTML for a single dashboard row.
     * @param {Object} item - Dashboard item data.
     * @param {number} index - Position.
     * @param {number} total - Total items.
     * @private
     */
    _createDashboardRow(item, index, total) {
        const viewMode = (AppState.viewMode || 'TABLE').toUpperCase();
        let lookupCode = (item.code || item.id || '').toUpperCase();
        let liveData = AppState.livePrices.get(lookupCode);

        // Fallback for ASX codes if not in livePrices
        if (!liveData && !lookupCode.includes('.') && !['AUDUSD', 'AUDTHB', 'USDTHB', 'BTCUSD', 'GCW00', 'SIW00', 'BZW00'].includes(lookupCode)) {
            liveData = AppState.livePrices.get(lookupCode + '.AX');
        }

        const nameMap = {
            'XJO': 'ASX 200', 'XKO': 'ASX 300', 'XAO': 'All Ords',
            'INX': 'S&P 500', '.DJI': 'Dow Jones', '.IXIC': 'Nasdaq',
            'AUDUSD': 'AUD/USD', 'AUDTHB': 'AUD/THB', 'USDTHB': 'USD/THB',
            'BTCUSD': 'Bitcoin', 'GCW00': 'Gold', 'SIW00': 'Silver', 'BZW00': 'Brent Oil'
        };

        const code = lookupCode;
        const name = item.name || nameMap[code] || item.label || code;

        const live = liveData ? liveData.live : (item.live || 0);
        const pctChange = liveData ? liveData.pctChange : (item.pctChange || 0);
        const valueChange = liveData ? liveData.change : (item.valueChange || 0);
        const high52 = liveData?.high || item.high || 0;
        const low52 = liveData?.low || item.low || 0;

        const isPositive = pctChange >= 0;
        const sentimentClass = isPositive ? CSS_CLASSES.DASHBOARD_ROW_POSITIVE : CSS_CLASSES.DASHBOARD_ROW_NEGATIVE;

        // Market Status Calculation
        const isOpen = this._isMarketOpen(code);
        const statusClass = isOpen ? 'open' : 'closed';

        const liveValue = live || 0;
        let formattedValue;
        if (liveValue === 0) {
            formattedValue = '--';
        } else if (['AUDUSD', 'AUDTHB', 'USDTHB'].includes(code)) {
            formattedValue = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(liveValue);
        } else if (code === 'BTCUSD') {
            formattedValue = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(liveValue);
        } else if (['XJO', 'XKO', 'XAO', 'INX', '.DJI', '.IXIC', 'GCW00', 'SIW00', 'BZW00'].includes(code)) {
            formattedValue = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(liveValue);
        } else {
            formattedValue = formatCurrency(liveValue);
        }

        const formattedChange = (liveValue === 0) ? '--' : (['AUDUSD', 'AUDTHB', 'USDTHB'].includes(code) ? valueChange.toFixed(4) : valueChange.toFixed(2));
        const formattedPct = (liveValue === 0) ? '--' : formatPercent(pctChange);

        // Layout Selection
        const url = DASHBOARD_LINKS[code];
        const clickableClass = url ? 'clickable' : '';
        const dataUrlAttr = url ? `data-url="${url}"` : '';

        if (viewMode === 'COMPACT' || viewMode === 'SNAPSHOT') {
            return `
                <div class="${CSS_CLASSES.DASHBOARD_ROW} ${sentimentClass} ${clickableClass} ${this.reorderMode ? CSS_CLASSES.REORDER_ACTIVE : ''}" ${dataUrlAttr}>
                    <i class="far fa-clock ${CSS_CLASSES.MARKET_STATUS_ICON} ${statusClass}" title="${isOpen ? 'Market Open' : 'Market Closed'}"></i>
                    ${this.reorderMode ? `
                        <div class="${CSS_CLASSES.DASHBOARD_REORDER_CONTROLS}">
                            ${index > 0 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="up"><i class="fas fa-chevron-up"></i></button>` : '<div style="height:24px"></div>'}
                            ${index < total - 1 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="down"><i class="fas fa-chevron-down"></i></button>` : '<div style="height:24px"></div>'}
                        </div>
                    ` : ''}
                    <div class="${CSS_CLASSES.DASHBOARD_CELL_LEFT} vertical-stack">
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_NAME}">
                            ${name}
                        </div>
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_PRICE}">${formattedValue}</div>
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_CHANGE} ${isPositive ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                            <span class="change-value">${liveValue !== 0 && isPositive ? '+' : ''}${formattedChange}</span>
                            <span class="change-percent">${formattedPct}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // DEFAULT / TABLE VIEW
        return `
            <div class="${CSS_CLASSES.DASHBOARD_ROW} ${sentimentClass} ${clickableClass} ${this.reorderMode ? CSS_CLASSES.REORDER_ACTIVE : ''}" ${dataUrlAttr}>
                ${this.reorderMode ? `
                    <div class="${CSS_CLASSES.DASHBOARD_REORDER_CONTROLS}">
                        ${index > 0 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="up"><i class="fas fa-chevron-up"></i></button>` : '<div style="height:24px"></div>'}
                        ${index < total - 1 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="down"><i class="fas fa-chevron-down"></i></button>` : '<div style="height:24px"></div>'}
                    </div>
                ` : ''}
                <div class="dashboard-row-main">
                    <div class="${CSS_CLASSES.DASHBOARD_CELL_LEFT}">
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_NAME}">
                            ${name}
                        </div>
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_SUB}">
                            <i class="far fa-clock ${CSS_CLASSES.MARKET_STATUS_ICON} ${statusClass}" title="${isOpen ? 'Market Open' : 'Market Closed'}"></i>
                            ${code}
                        </div>
                    </div>
                    <div class="${CSS_CLASSES.DASHBOARD_CELL_RIGHT}">
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_PRICE}">${formattedValue}</div>
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_CHANGE} ${isPositive ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                            ${liveValue !== 0 && isPositive ? '+' : ''}${formattedChange} (${formattedPct})
                        </div>
                    </div>
                </div>
                ${high52 > 0 ? `
                    <div class="${CSS_CLASSES.DASHBOARD_SPARK_CONTAINER}">
                        <span class="${CSS_CLASSES.RANGE_LABEL}">52W</span>
                        <div class="dashboard-range-data-group">
                            <span class="${CSS_CLASSES.RANGE_LOW}">${low52.toFixed(2)}</span>
                            <div class="${CSS_CLASSES.SPARK_RAIL}">
                                <div class="${CSS_CLASSES.SPARK_MARKER}" style="left: ${this._calculateRangePercent(live, low52, high52)}%;"></div>
                            </div>
                            <span class="${CSS_CLASSES.RANGE_HIGH}">${high52.toFixed(2)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Approximates market status for dashboard symbols.
     * @private
     */
    _isMarketOpen(code) {
        const now = new Date();
        const sydneyParts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Australia/Sydney',
            hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false
        }).formatToParts(now);

        const getPart = (type) => sydneyParts.find(p => p.type === type).value;
        const day = getPart('weekday');
        const hour = parseInt(getPart('hour'));
        const minute = parseInt(getPart('minute'));
        const totalMin = (hour * 60) + minute;

        // 1. Weekend Check (Most markets closed except Crypto)
        if (['Sat', 'Sun'].includes(day) && code !== 'BTCUSD') return false;

        // 2. ASX Indices (Sydney Time 10:00 - 16:00)
        if (['XJO', 'XKO', 'XAO'].includes(code)) {
            return totalMin >= (10 * 60) && totalMin < (16 * 60);
        }

        // 3. US Indices (Approx Sydney Time 00:30 - 08:00)
        if (['INX', '.DJI', '.IXIC'].includes(code)) {
            // Very simplified: Open during Sydney early morning
            return totalMin >= (1 * 60 + 30) && totalMin < (8 * 60);
        }

        // 4. Futures (Gold, Silver, Oil) - Sydney 08:00 - 07:00 (Next Day)
        if (['GCW00', 'SIW00', 'BZW00'].includes(code)) {
            // Closed for 1 hour Sydney Time 07:00 - 08:00
            return totalMin >= (8 * 60) || totalMin < (7 * 60);
        }

        // 5. FX & Crypto (24/7 or 24/5)
        if (['AUDUSD', 'AUDTHB', 'USDTHB', 'BTCUSD'].includes(code)) return true;

        return true;
    }

    /**
     * Calculates the percentage position for the 52-week range marker.
     * @private
     */
    _calculateRangePercent(live, low, high) {
        if (high <= low) return 0;
        return Math.min(Math.max(((live - low) / (high - low)) * 100, 0), 100);
    }

    /**
     * Generates processed data from DASHBOARD_SYMBOLS and livePrices.
     * Merges optional data if available.
     * @private
     */
    _getProcessedData(firestoreArray = []) {
        // HYGIENE: Use local copy to avoid mutating the master list in AppConstants
        let activeSymbols = [...DASHBOARD_SYMBOLS];

        const savedOrder = AppState.preferences.dashboardOrder;
        if (savedOrder && Array.isArray(savedOrder) && savedOrder.length === activeSymbols.length) {
            activeSymbols = [...savedOrder];
        }

        const processed = [];
        const nameMap = {
            'XJO': 'ASX 200',
            'XKO': 'ASX 300',
            'XAO': 'All Ords',
            'INX': 'S&P 500',
            '.DJI': 'Dow Jones',
            '.IXIC': 'Nasdaq',
            'AUDUSD': 'AUD/USD',
            'AUDTHB': 'AUD/THB',
            'USDTHB': 'USD/THB',
            'BTCUSD': 'Bitcoin',
            'GCW00': 'Gold',
            'SIW00': 'Silver',
            'BZW00': 'Brent Oil'
        };

        activeSymbols.forEach(code => {
            const upCode = code.toUpperCase();
            const firestoreData = (firestoreArray || []).find(d =>
                (d.code || '').toUpperCase() === upCode ||
                (d.id || '').toUpperCase() === upCode
            );

            let priceData = AppState.livePrices.get(upCode);
            if (!priceData && !upCode.includes('.') && !['AUDUSD', 'AUDTHB', 'USDTHB', 'BTCUSD', 'GCW00', 'SIW00', 'BZW00'].includes(upCode)) {
                priceData = AppState.livePrices.get(upCode + '.AX');
            }

            // Always add the item if it's in DASHBOARD_SYMBOLS, even if data is missing
            processed.push({
                id: upCode,
                code: upCode,
                name: firestoreData?.name || nameMap[upCode] || upCode,
                live: firestoreData?.live || priceData?.live || 0,
                pctChange: firestoreData?.pctChange || priceData?.pctChange || 0,
                valueChange: firestoreData?.valueChange || priceData?.change || 0,
                high: firestoreData?.high || priceData?.high || 0,
                low: firestoreData?.low || priceData?.low || 0,
                updatedAt: firestoreData?.updatedAt || new Date()
            });
        });
        return processed;
    }
}
