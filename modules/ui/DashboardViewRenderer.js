/**
 * DashboardViewRenderer.js
 * Specialized renderer for the Dashboard view.
 * Displays market indices and commodities in a high-density stacked card view.
 */
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { IDS, CSS_CLASSES, DASHBOARD_SYMBOLS, STORAGE_KEYS, DASHBOARD_LINKS, UI_ICONS, KANGAROO_ICON_SVG } from '../utils/AppConstants.js?v=1031';
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
                    window.open(url, '_blank', 'noopener,noreferrer');
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
            'NICKEL': 'Nickel', 'TIO=F': 'Iron Ore (62%)', 'YAP=F': 'ASX SPI 200'
        };

        const code = lookupCode;
        const name = item.name || nameMap[code] || item.label || code;

        const live = liveData ? liveData.live : (item.live || 0);
        const pctChange = liveData ? liveData.pctChange : (item.pctChange || 0);
        const valueChange = liveData ? liveData.change : (item.valueChange || 0);
        const high52 = [liveData?.high, item.high].find(v => v > 0) || 0;
        const low52 = [liveData?.low, item.low].find(v => v > 0) || 0;

        // CALCULATE RANGE PERCENTAGE (Consolidated for consistency)
        const markerPct = this._calculateRangePercent(live, low52, high52);

        // Kangaroo Color Logic (User Request: < 50% Red, >= 50% Green)
        const kangarooColor = markerPct >= 50 ? 'var(--color-positive)' : 'var(--color-negative)';

        // Robust positioning style - ensuring z-index and overflow are handled
        // Size reduced to 21px (75% of 28px)
        // Opacity 0.6 added to 'ghost' the marker
        const markerStyle = `left: ${markerPct}% !important; position: absolute !important; top: 50% !important; transform: translate(-50%, -50%) !important; z-index: 1000 !important; width: 21px !important; height: 21px !important; display: flex !important; justify-content: center !important; align-items: center !important; pointer-events: none; color: ${kangarooColor} !important; opacity: 0.6 !important;`;
        if (index < 5 || code.includes('IXIC') || code.includes('NASDAQ')) {

        }

        // Sentiment class for border color (3-way: positive/negative/neutral)
        let sentimentClass = 'neutral';
        if (pctChange > 0) sentimentClass = CSS_CLASSES.DASHBOARD_ROW_POSITIVE;
        else if (pctChange < 0) sentimentClass = CSS_CLASSES.DASHBOARD_ROW_NEGATIVE;

        // Gradient Background Class
        let gradeClass = CSS_CLASSES.DASHBOARD_GRADE_NEUTRAL; // Default: coffee/amber
        if (pctChange > 0) gradeClass = CSS_CLASSES.DASHBOARD_GRADE_UP;
        else if (pctChange < 0) gradeClass = CSS_CLASSES.DASHBOARD_GRADE_DOWN;

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
            formattedChange = Math.abs(valueChange).toFixed(4);
        } else if (isIndex || isFuture) {
            // Indices/Futures: 2 Decimals (usually), no $
            formattedValue = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(liveValue);
            formattedChange = Math.abs(valueChange).toFixed(2);
        } else {
            // Default: Monetary (Shares, Crypto, etc.) -> use $
            formattedValue = formatCurrency(liveValue);
            formattedChange = formatCurrency(valueChange);
        }

        const formattedPct = (liveValue === 0) ? '--' : formatPercent(pctChange);

        // Layout Selection
        const url = DASHBOARD_LINKS[code] || LinkHelper.getFinanceUrl(code);
        const clickableClass = url ? 'clickable' : '';
        const dataUrlAttr = url ? `data-url="${url}"` : '';

        // BORDER LOGIC
        const borderStyle = this._getBorderStyles(pctChange);

        if (viewMode === 'COMPACT' || viewMode === 'SNAPSHOT') {
            return `
                <div class="${CSS_CLASSES.DASHBOARD_ROW} ${sentimentClass} ${gradeClass} ${clickableClass} ${this.reorderMode ? CSS_CLASSES.REORDER_ACTIVE : ''}" ${dataUrlAttr} style="${borderStyle}">
                    ${this.reorderMode ? `
                        <div class="${CSS_CLASSES.DASHBOARD_REORDER_CONTROLS}">
                            ${index > 0 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="up"><i class="fas fa-chevron-up"></i></button>` : '<div style="height:24px"></div>'}
                            ${index < total - 1 ? `<button class="${CSS_CLASSES.REORDER_BTN}" data-code="${code}" data-dir="down"><i class="fas fa-chevron-down"></i></button>` : '<div style="height:24px"></div>'}
                        </div>
                    ` : ''}
                    <div class="${CSS_CLASSES.DASHBOARD_CELL_LEFT} vertical-stack">
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_NAME}" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>${name}</span>
                            ${viewMode !== 'SNAPSHOT' ? `<div class="analog-clock-hook" data-open="${isOpen}" style="width:14px; height:14px; opacity:0.8;"></div>` : ''}
                        </div>
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_PRICE}">${formattedValue}</div>
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_CHANGE} ${pctChange >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                            <span class="change-value">${formattedChange}</span>
                            <span class="change-percent">${formattedPct}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // DEFAULT / TABLE VIEW
        return `
            <div class="${CSS_CLASSES.DASHBOARD_ROW} ${sentimentClass} ${gradeClass} ${clickableClass} ${this.reorderMode ? CSS_CLASSES.REORDER_ACTIVE : ''}" ${dataUrlAttr} style="${borderStyle}">
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
                        <div class="${CSS_CLASSES.DASHBOARD_ITEM_CHANGE} ${pctChange >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                            ${formattedChange} (${formattedPct})
                        </div>
                    </div>
                </div>
                ${high52 > 0 ? `
                    <div class="${CSS_CLASSES.DASHBOARD_SPARK_CONTAINER}" style="width: 100% !important; display: flex !important; align-items: center !important; gap: 10px !important;">
                        <span class="${CSS_CLASSES.RANGE_LABEL}" style="flex-shrink: 0 !important; width: auto !important; min-width: 30px !important; font-weight: bold !important;">52W</span>
                        <div class="dashboard-range-data-group" style="flex: 1 !important; display: flex !important; align-items: center !important; gap: 8px !important; width: 100% !important;">
                            <span class="${CSS_CLASSES.RANGE_LOW}" style="flex-shrink: 0 !important;">${low52.toFixed(2)}</span>
                            <div class="${CSS_CLASSES.SPARK_RAIL}" style="flex: 1 !important; height: 4px !important; border-radius: 2px !important; background: rgba(255,255,255,0.15) !important; position: relative !important; overflow: visible !important; margin: 0 5px !important;">
                                <div class="${CSS_CLASSES.SPARK_MARKER}" style="${markerStyle}">
                                    <svg viewBox="0 0 122.88 78.88" fill="currentColor" style="width: 100% !important; height: 100% !important; display: block !important; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8)) !important;">
                                        <path d="M75.88,44l-4.71-.7L53.93,67.5h3.66A10.08,10.08,0,0,1,60,68,142.7,142.7,0,0,0,75.88,44Zm19,3.86,4.79-11,7.93-8.6a16.29,16.29,0,0,1,3-.17c4.13.32,4.23.66,5.42,1.19a7.11,7.11,0,0,0,3.93.6,2.15,2.15,0,0,0,1.81-1.62c1.77-1.7,1.54-3.36-.3-5L118,20.52a5.26,5.26,0,0,0-2.94-5.65c2.25-5.1.66-9.35-2-13.27-.9-1.32-1.15-2.33-2.57-.9a7.7,7.7,0,0,0-1.35,2c3.07,2.8,5,6,5.09,9.69,0,.76.16,3.21-.59,3.46-1.45.49-1.48-1.49-1.5-2.25-.09-5.29-2.94-8.65-7.3-10.94-.67-.35-1.77-1.06-2.51-.67-.56.3-.92,1.49-1.12,2.08A11.11,11.11,0,0,0,100.67,8a11.35,11.35,0,0,0,1.27,4.7L104.13,15l-5.69,5c-3,1.55-6.06.91-9.16-2.11-8.2-7.47-16.45-10.7-27.86-10.16a30.81,30.81,0,0,0-15.83,5.62c-7.7,5.2-11.59,9.73-14.76,18.36a140.78,140.78,0,0,0-4.79,17c-1.67,6.75-3,17.51-8.86,21.66A14.22,14.22,0,0,1,7.54,72.7l-5.17-.36c-1.32-.15-2.11.14-2.3.91-1,4.06,8.12,5.39,10.83,5.59a18.52,18.52,0,0,0,14.22-5.57C31.79,66.5,35.74,48.73,42.2,43.08l2.67,1.65,2.68,1.66c1.79.93,2.25,1.42,1.21,3.6l-7.09,16.7c-1.36,2.73-1.52,7,.78,9.34a2.67,2.67,0,0,0,2.34.76H63c3.29-2.11-.25-7.33-5.54-7.76H50.81C57.49,60,64,50.59,70.28,40.82c5.23,1.55,12.94,1.74,18.51,1.37a17.52,17.52,0,0,1-3.19,7.06c-2.94.27-4.58,2.43-3.25,4.65,1.14,1.9,2.7,2,4.94,1.32a17,17,0,0,0,2.08-.71c1-.44,2.26-.68,3-1.53.51-.57.59-1.67,1-2.37a25.12,25.12,0,0,0,1.43-2.79ZM120.2,24.28A1.13,1.13,0,1,1,119,25.37a1.13,1.13,0,0,1,1.18-1.09Zm-8.27-6.61a2.44,2.44,0,0,1,1.93,2.76c-1.49.52-2.54-1.55-1.93-2.76ZM65.1,76.89h6.54c0-8-4.93-8.21-9.84-8.09a8.15,8.15,0,0,1,3.62,3.88,4.55,4.55,0,0,1,.17,3.26,4.08,4.08,0,0,1-.49,1Z"/>
                                    </svg>
                                </div>
                            </div>
                            <span class="${CSS_CLASSES.RANGE_HIGH}" style="flex-shrink: 0 !important;">${high52.toFixed(2)}</span>
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
        // Use UTC to ensure it works regardless of User's local timezone
        const utcDay = now.getUTCDay(); // 0-6 (Sun-Sat)
        const utcHours = now.getUTCHours();
        const utcMins = now.getUTCMinutes();
        const utcTotal = utcHours * 60 + utcMins;

        // 1. CRYPTO (Always Open)
        if (code.includes('BTC') || code.includes('ETH')) return true;

        // 2. ASX (Sydney 10:00-16:00 AEDT -> UTC 23:00-05:00)
        if (code.includes('.AX') || code.includes('^AXJO') || code.includes('^AORD')) {
            // ASX is active roughly 23:00 UTC (day before) to 05:00 UTC (today)
            // Saturday/Sunday in Sydney (Fri/Sat 23:00 UTC to Sun/Mon 05:00 UTC)
            if (utcDay === 6 || utcDay === 0) return false;
            return utcTotal >= (23 * 60) || utcTotal < (5 * 60 + 30);
        }

        // 3. UK & EUROPE (London/EU 08:00-16:30 UTC)
        if (code.includes('FTSE') || code.includes('STOXX') || code.includes('EU50')) {
            if (utcDay === 0 || utcDay === 6) return false; // Weekend
            return utcTotal >= (8 * 60) && utcTotal < (16 * 60 + 30);
        }

        // 4. ASIAN INDICES (HK/Japan Open roughly 00:30-08:00 UTC)
        if (code.includes('HSI') || code.includes('N225')) {
            if (utcDay === 0 || utcDay === 6) return false;
            return utcTotal >= (0 * 60 + 30) && utcTotal < (8 * 60);
        }

        // 5. US INDICES (NY 09:30-16:00 EST -> UTC 14:30-21:00)
        if (['INX', '.DJI', '.IXIC', '^GSPC', '^DJI', '^IXIC', '^VIX'].includes(code)) {
            if (utcDay === 0 || utcDay === 6) return false;
            return utcTotal >= (14 * 60 + 30) && utcTotal < (21 * 60);
        }

        // 6. FOREX (24/5 -> Sunday 22:00 to Friday 22:00 UTC)
        if (code.includes('=X')) {
            if (utcDay === 6) return false; // Saturday (Closed)
            if (utcDay === 0 && utcTotal < (22 * 60)) return false; // Sunday before open
            if (utcDay === 5 && utcTotal > (22 * 60)) return false; // Friday after close
            return true;
        }

        // 7. FUTURES (23/5 Markets -> 23:00 Sun to 21:00 Fri UTC)
        if (code.includes('=F') || code.includes('-F')) {
            if (utcDay === 6) return false; // Saturday (Closed)
            if (utcDay === 0 && utcTotal < (23 * 60)) return false; // Sun before open
            if (utcDay === 5 && utcTotal > (21 * 60)) return false; // Fri after close
            // Daily maintenance break (NY 16:00-17:00 -> UTC 21:00-22:00)
            if (utcTotal >= (21 * 60) && utcTotal < (22 * 60)) return false;
            return true;
        }

        // Default: Mon-Fri Business Hours (Local User Perspective)
        const localDay = now.getDay();
        const localHours = now.getHours();
        if (localDay === 0 || localDay === 6) return false;
        return localHours >= 9 && localHours < 17;
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
}
