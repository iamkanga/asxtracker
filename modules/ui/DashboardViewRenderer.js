/**
 * DashboardViewRenderer.js
 * Specialized renderer for the Dashboard view.
 * Displays market indices and commodities in a high-density stacked card view.
 */
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { IDS, CSS_CLASSES, DASHBOARD_SYMBOLS, STORAGE_KEYS, DASHBOARD_LINKS, UI_ICONS } from '../utils/AppConstants.js?v=5';
import { AppState } from '../state/AppState.js';
import { DashboardFilterModal } from './DashboardFilterModal.js';
import { LinkHelper } from '../utils/LinkHelper.js';

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

        // Update header Sydney time if in Dashboard watchlist
        const headerTime = document.getElementById(IDS.DASHBOARD_REORDER_TOGGLE);
        if (headerTime) {
            const now = new Date();
            const sydneyTime = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Australia/Sydney',
                hour: '2-digit', minute: '2-digit', weekday: 'short'
            }).format(now);
            headerTime.innerHTML = `Sydney: ${sydneyTime}&nbsp;<i class="fas ${UI_ICONS.CARET_DOWN}"></i> ${this.reorderMode ? `<span class="${CSS_CLASSES.ML_SMALL} ${CSS_CLASSES.FONT_NORMAL} ${CSS_CLASSES.OPACITY_60}">(Adjusting...)</span>` : ''}`;
        }

        // Bind events moved to post-render to ensure elements exist


        if (!displayData || displayData.length === 0) {
            this.container.innerHTML = `
                <div class="${CSS_CLASSES.EMPTY_STATE}">
                    <i class="fas fa-chart-line ${CSS_CLASSES.TEXT_3XL} ${CSS_CLASSES.MB_MEDIUM} ${CSS_CLASSES.OPACITY_30}"></i>
                    <p>No dashboard items found.</p>
                </div>
            `;
            return;
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
            this._initClocks(); // Initialize analog clocks
            this._bindEvents(); // Bind events AFTER elements are in DOM
        }
    }

    /**
     * initializes analog clocks for all rows.
     */
    _initClocks() {
        // Cleanup old clocks
        if (this.rowClocks) {
            this.rowClocks.forEach(c => c.destroy());
        }
        this.rowClocks = [];

        import('./AnalogClock.js').then(({ AnalogClock }) => {
            this.container.querySelectorAll('.analog-clock-hook').forEach(el => {
                const isOpen = el.dataset.open === 'true';
                const clock = new AnalogClock(el, isOpen);
                clock.init();
                this.rowClocks.push(clock);
            });
        });
    }

    /**
     * Binds internal dashboard events.
     * @private
     */
    _bindEvents() {
        // Reorder Toggle (Now opens Filter Modal)
        const toggle = document.getElementById(IDS.DASHBOARD_REORDER_TOGGLE);
        if (toggle) {
            toggle.onclick = () => {
                DashboardFilterModal.show();
            };
        }

        // Listen for external updates (from Modal closing)
        if (!this._boundRefresh) {
            this._boundRefresh = () => this.render(AppState.data.dashboard);
            window.addEventListener('dashboard-prefs-changed', this._boundRefresh);
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
        // Fix: Use the actual rendered list, not the static/incomplete DASHBOARD_SYMBOLS
        // This ensures dynamic items (like AUDTHB=X) and hidden items are handled safely.
        const currentData = this._getProcessedData(AppState.data.dashboard);
        const currentOrder = currentData.map(item => item.code);

        const index = currentOrder.indexOf(code);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= currentOrder.length) return;

        // Swap
        const temp = currentOrder[index];
        currentOrder[index] = currentOrder[newIndex];
        currentOrder[newIndex] = temp;

        // Persist order to preferences
        AppState.preferences.dashboardOrder = currentOrder;
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
            'BTCUSD': 'Bitcoin', 'GCW00': 'Gold', 'SIW00': 'Silver', 'BZW00': 'Brent Oil',
            'NICKEL': 'Nickel', 'TIO=F': 'Iron Ore (62%)'
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

        // --- FORMATTING LOGIC REFINEMENT ---
        // 1. Identify "Non-Monetary" Patterns (Points/Values, no $)
        const isIndex = code.startsWith('^') || ['XJO', 'XKO', 'XAO', 'INX', '.DJI', '.IXIC', '^VIX'].includes(code);
        const isFuture = code.endsWith('=F') || ['GCW00', 'SIW00', 'BZW00'].includes(code);
        const isForex = code.includes('=X') || ['AUDUSD', 'AUDTHB', 'USDTHB'].includes(code);
        const isCrypto = code.includes('BTC'); // Standard to show $ for Bitcoin price

        let formattedValue;
        let formattedChange;

        if (liveValue === 0) {
            formattedValue = '--';
            formattedChange = '--';
        } else if (isForex) {
            // Forex: 4 Decimals, no $
            formattedValue = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(liveValue);
            formattedChange = valueChange.toFixed(4);
        } else if (isIndex || isFuture) {
            // Indices/Futures: 2 Decimals (usually), no $
            formattedValue = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(liveValue);
            formattedChange = valueChange.toFixed(2);
        } else {
            // Default: Monetary (Shares, Crypto, etc.) -> use $
            formattedValue = formatCurrency(liveValue);
            formattedChange = valueChange.toFixed(2);
        }

        const formattedPct = (liveValue === 0) ? '--' : formatPercent(pctChange);

        // Layout Selection
        const url = DASHBOARD_LINKS[code] || LinkHelper.getFinanceUrl(code);
        const clickableClass = url ? 'clickable' : '';
        const dataUrlAttr = url ? `data-url="${url}"` : '';

        if (viewMode === 'COMPACT' || viewMode === 'SNAPSHOT') {
            return `
                <div class="${CSS_CLASSES.DASHBOARD_ROW} ${sentimentClass} ${clickableClass} ${this.reorderMode ? CSS_CLASSES.REORDER_ACTIVE : ''}" ${dataUrlAttr}>
                    ${this.reorderMode ? `
                        <div class="${CSS_CLASSES.DASHBOARD_REORDER_CONTROLS}">
                            ${index > 0 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="up"><i class="fas fa-chevron-up"></i></button>` : '<div style="height:24px"></div>'}
                            ${index < total - 1 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="down"><i class="fas fa-chevron-down"></i></button>` : '<div style="height:24px"></div>'}
                        </div>
                    ` : ''}
                    <div class="${CSS_CLASSES.DASHBOARD_CELL_LEFT} vertical-stack">
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_NAME}" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>${name}</span>
                            <div class="analog-clock-hook" data-open="${isOpen}" style="width:14px; height:14px; opacity:0.8;"></div>
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
                            <div class="analog-clock-hook" data-open="${isOpen}" style="width:16px; height:16px; display:inline-block; vertical-align:middle; margin-right:4px;"></div>
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
        const day = getPart('weekday'); // Mon, Tue, Wed, Thu, Fri, Sat, Sun
        const hour = parseInt(getPart('hour'));
        const minute = parseInt(getPart('minute'));
        const totalMin = (hour * 60) + minute;

        // --- ASSET CLASSES ---

        // 1. CRYPTO (Always Open)
        if (['BTCUSD', 'BTC-USD', 'BTC-AUD'].includes(code)) {
            return true;
        }

        // 2. FOREX (24/5 - Opens Mon Morning Syd, Closes Sat Morning Syd)
        if (['AUDUSD', 'AUDTHB', 'USDTHB', 'AUDUSD=X', 'AUDGBP=X', 'AUDEUR=X', 'AUDJPY=X', 'AUDTHB=X', 'XAUUSD=X', 'XAGUSD=X'].includes(code)) {
            // Closed from Saturday ~07:00am until Monday ~05:00am (Sydney Time)
            if (day === 'Sun') return false;
            if (day === 'Sat' && totalMin > (7 * 60)) return false; // Close Sat Morning
            if (day === 'Mon' && totalMin < (5 * 60)) return false; // Open Mon Morning (early)
            return true;
        }

        // 3. ASX INDICES (Mon-Fri, 10:00 - 16:15 Sydney)
        if (['XJO', 'XKO', 'XAO', '^AXJO'].includes(code)) {
            if (['Sat', 'Sun'].includes(day)) return false;
            return totalMin >= (10 * 60) && totalMin < (16 * 60 + 15);
        }

        // 3. US INDICES (Tue-Sat Morning in Sydney)
        // Converting NY 9:30-16:00 -> Approx Sydney 01:30 - 08:00 (Next Day)
        if (['INX', '.DJI', '.IXIC', '^GSPC', '^DJI', '^IXIC', '^VIX'].includes(code)) {
            // Trading days are effectively Tue, Wed, Thu, Fri, Sat (Morning) in Sydney
            if (['Sun', 'Mon'].includes(day)) return false;

            // Simplified Window: 00:30 to 08:30 Sydney time to catch Pre/Post overlap
            // Note: On Saturday, it closes around 8am. On T-F it opens around 1am.
            // Logic: It's "Open" if early morning.
            return totalMin < (9 * 60) || totalMin > (23 * 60);
        }

        // 4. FUTURES (Gold, Oil, SPI)
        // Usually Open 23h/day. Closed roughly 07:00 - 08:00 Sydney daily.
        // Closed Weekends (Sat Morning -> Mon Morning).
        if (['GCW00', 'SIW00', 'BZW00', 'GC=F', 'SI=F', 'CL=F', 'BZ=F', 'HG=F', 'YAP=F'].includes(code)) {
            // Closed part of Saturday (after 9am) and most of Sunday.
            if (day === 'Sat' && totalMin > (9 * 60)) return false; // Close Sat Morning
            if (day === 'Sun') return false; // Closed Sunday

            // Mondays: Market opens approx 08:00 AM Sydney (6pm Sunday NY)
            if (day === 'Mon' && totalMin < (8 * 60)) return false;

            // Daily Break (approx 7am-9am Sydney, depending on DST)
            // We'll mark "Closed" if between 7am and 9am just to be safe/clear?
            // Actually, let's just use the 1-hour break logic.
            // Break is usually NY Close -> Sydney Open mismatch.
            // Let's say closed 07:00 - 09:00 to be safe.
            if (totalMin >= (7 * 60) && totalMin < (9 * 60)) return false;

            return true;
        }

        // Default Fallback: Assume Mon-Fri Business Hours
        if (['Sat', 'Sun'].includes(day)) return false;
        return totalMin >= (9 * 60) && totalMin < (17 * 60);
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
        // DYNAMIC SOURCE:
        // We now accept anything from the backend, merged with our static known symbols.
        const backendCodes = (firestoreArray || []).map(item => item.ASXCode || item.code).filter(Boolean);

        // REFACTOR: Use LIVE DATA keys as the "Source of Truth" if available.
        // This ensures what we display matches exactly what we fetched from the Sheet/Yahoo.
        // We fallback to DASHBOARD_SYMBOLS only if we have zero live data (offline/boot).
        // STRICK SOURCE OF TRUTH:
        // We only show what is explicitly provided by the Backend/Spreadsheet.
        // Legacy "Smart Filters" and fallback DASHBOARD_SYMBOLS are removed.
        const candidates = backendCodes;

        const uniqueSet = new Set(candidates);
        let activeSymbols = Array.from(uniqueSet);

        const savedOrder = AppState.preferences.dashboardOrder;
        if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
            // Merge strategy: Saved Order + Any New Items not in Saved Order
            const orderedSet = new Set(savedOrder);
            const newItems = activeSymbols.filter(x => !orderedSet.has(x));
            // Keep saved order items only if they exist in our current universe
            const validSaved = savedOrder.filter(x => uniqueSet.has(x));
            activeSymbols = [...validSaved, ...newItems];
        }

        // Apply Hiding
        const hiddenSet = new Set(AppState.preferences.dashboardHidden || []);
        activeSymbols = activeSymbols.filter(code => !hiddenSet.has(code));

        const processed = [];
        const nameMap = {
            'XJO': 'ASX 200 (Legacy)',
            'XKO': 'ASX 300',
            'XAO': 'All Ords',
            'INX': 'S&P 500 (Legacy)',
            '.DJI': 'Dow Jones (Legacy)',
            '.IXIC': 'Nasdaq (Legacy)',
            'AUDUSD': 'AUD/USD',
            'AUDTHB': 'AUD/THB',
            'USDTHB': 'USD/THB',
            'BTCUSD': 'Bitcoin',
            'GCW00': 'Gold (Legacy)',
            'SIW00': 'Silver (Legacy)',
            'BZW00': 'Brent Oil (Legacy)',
            // New Yahoo Codes
            '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq',
            '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', '^HSI': 'Hang Seng',
            '^STOXX50E': 'Euro Stoxx 50', '^AXJO': 'S&P/ASX 200',
            'GC=F': 'Gold Futures', 'SI=F': 'Silver Futures', 'CL=F': 'Crude Oil',
            'BZ=F': 'Brent Oil', 'HG=F': 'Copper',
            'BTC-USD': 'Bitcoin (USD)', 'BTC-AUD': 'Bitcoin (AUD)',
            'AUDUSD=X': 'AUD/USD', 'AUDGBP=X': 'AUD/GBP',
            'AUDEUR=X': 'AUD/EUR', 'AUDJPY=X': 'AUD/JPY', 'AUDTHB=X': 'AUD/THB',
            // Futures
            'YAP=F': 'ASX SPI 200', 'TIO=F': 'Iron Ore (62%)', '^VIX': 'Volatility Index',
            'XAUUSD=X': 'Gold Spot (USD)', 'XAGUSD=X': 'Silver Spot (USD)',
            'NICKEL': 'Nickel'
        };

        activeSymbols.forEach(code => {
            const upCode = code.toUpperCase();
            const firestoreData = (firestoreArray || []).find(d =>
                (d.code || '').toUpperCase() === upCode ||
                (d.id || '').toUpperCase() === upCode
            );

            let priceData = AppState.livePrices.get(upCode);
            if (!priceData && !upCode.includes('.') && !['AUDUSD', 'AUDTHB', 'USDTHB', 'BTCUSD', 'GCW00', 'SIW00', 'BZW00', 'AUDTHB=X'].includes(upCode)) {
                priceData = AppState.livePrices.get(upCode + '.AX');
            }

            // Priority Name Resolution:
            // 1. Explicit name from Spreadsheet/Firestore (normalized in DataService)
            // 2. CompanyName from Spreadsheet/Firestore
            // 3. Name from Live Price Cache (also from spreadsheet)
            // 4. Hardcoded nameMap fallback
            // 5. Code itself
            const resolvedName = firestoreData?.name ||
                firestoreData?.CompanyName ||
                priceData?.name ||
                nameMap[upCode] ||
                upCode;

            processed.push({
                id: upCode,
                code: upCode,
                name: resolvedName,
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
