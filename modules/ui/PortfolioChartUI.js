import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { UI_ICONS, CSS_CLASSES, IDS, EVENTS, CASH_CATEGORIES } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';
import { DataService } from '../data/DataService.js';

/**
 * PortfolioChartUI
 * Handles the historical trend chart for the entire portfolio.
 * Implements "Backfill" logic to simulate history based on current holdings.
 * NOW INCLUDES: Cash & Asset integration with category breakdowns.
 * v1047: Corrected property names (portfolioShares/AvgPrice) and Purchase Date logic.
 */
export class PortfolioChartUI {
    static async show() {
        console.log('[PortfolioChartUI:v1047] Global Trigger');
        const shares = AppState.data.shares || [];
        const cash = AppState.data.cash || [];

        if (shares.length === 0 && cash.length === 0) {
            alert('Your portfolio is empty. Add some shares or cash assets to see a trend chart.');
            return;
        }

        const instance = new PortfolioChartUI();
        await instance.render();
    }

    constructor() {
        this.range = '1y';
        this.filter = 'TOTAL';
        this.chart = null;
        this.dataService = new DataService();
        this.modal = null;

        // Series References
        this.series = {
            value: null,
            cost: null,
            profit: null,
            shares: null,
            cash: null
        };

        // Visibility State
        this.visibleLayers = {
            value: true,
            cost: true,
            profit: false,
            shares: false,
            cash: false
        };

        // Categories Breakdown Series
        this.categorySeries = {};
    }

    async render() {
        const existing = document.getElementById('portfolio-chart-modal');
        if (existing) existing.remove();

        this.modal = document.createElement('div');
        this.modal.id = 'portfolio-chart-modal';
        this.modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        // Prepare Category Breakdown Buttons
        const cashByCat = this._getCashByCategory();
        const catButtonsHtml = Object.keys(cashByCat).map((catId, idx) => {
            const label = this._getCategoryLabel(catId);
            const active = !!this.visibleLayers[`cat_${catId}`];
            const palette = ['#4db8ff', '#ff4d4d', '#4dff88', '#ffcc4d', '#ff4db8', '#b84dff', '#4dffff', '#ff994d'];
            const color = palette[idx % palette.length];

            return `
                <button class="layer-toggle-btn cat-toggle ${active ? 'active' : ''}" data-layer="cat_${catId}" 
                        style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px; transition: color 0.15s ease;">
                     <span style="width:8px; height:8px; border-radius:50%; background:${color}; opacity:${active ? 1 : 0.4};"></span>
                     ${label}
                </button>
            `;
        }).join('');

        this.modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} portfolio-chart-content" style="width: 100%; height: 100%; max-width: none; border-radius: 0; display:flex; flex-direction:column; background:var(--card-bg); overflow:hidden;">
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 16px 24px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="font-size: 1.4rem;"><i class="fas fa-chart-line"></i> Portfolio History</h2>
                        
                        <!-- NEW: Source Filter Dropdown -->
                        <div class="source-filter-container" style="display: items-center; gap: 8px;">
                            <select id="portfolio-source-filter" style="background: #1e2026; border: none; color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 0.9rem; cursor: pointer; outline: none; font-weight: 600; appearance: none; -webkit-appearance: none; background-image: url('data:image/svg+xml;utf8,<svg fill=\\'white\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' width=\\'24\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M7 10l5 5 5-5z\\'/></svg>'); background-repeat: no-repeat; background-position: right 8px center; padding-right: 32px;">
                                <option value="TOTAL" style="background: #1e2026; color: #fff;">Total Portfolio</option>
                                <option value="SHARES_ONLY" style="background: #1e2026; color: #fff;">Shares Only</option>
                                <option value="SUPER" style="background: #1e2026; color: #fff;">Superannuation</option>
                                <option value="CASH_ASSETS" style="background: #1e2026; color: #fff;">Cash & Assets</option>
                            </select>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div class="chart-stats-summary" style="margin-bottom:4px;"></div>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>
                
                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex:1; position:relative; padding:0; overflow:hidden; background:#111;">
                    <div id="portfolio-chart-container" style="width:100%; height:100%;"></div>
                    <div id="portfolio-chart-loading" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; flex-direction:column; z-index:10; backdrop-filter: blur(2px);">
                        <i class="fas ${UI_ICONS.SPINNER} fa-2x" style="color:var(--color-accent);"></i>
                        <span style="margin-top:16px; font-weight:600; font-size: 0.9rem; color: #fff;">Simulating Growth...</span>
                    </div>
                </div>

                <div class="portfolio-chart-controls" style="padding:24px 16px; background:var(--card-bg); display:flex; flex-direction:column; gap:24px; border-top: 1px solid rgba(255,255,255,0.05); overflow-y:auto; max-height:40%;">
                    
                    <!-- Timeframe Toggles -->
                    <div class="control-row timeframe-row" style="display:flex; gap:18px; justify-content:center; overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling: touch; flex-shrink:0;">
                        ${['1d', '5d', '1m', '3m', '6m', '1y', '5y', '10y', 'max'].map(r => `
                            <button class="range-btn ${this.range === r ? 'active' : ''}" data-range="${r}" 
                                    style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; text-transform:uppercase; transition: color 0.15s ease;">
                                ${r}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Main Layer Toggles -->
                    <div class="control-row layer-row" style="display:flex; gap:28px; justify-content:center; flex-wrap:wrap;">
                        <button class="layer-toggle-btn ${this.visibleLayers.value ? 'active' : ''}" data-layer="value" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                             <span style="width:8px; height:8px; border-radius:50%; background:rgba(193, 154, 107, 1); opacity:${this.visibleLayers.value ? 1 : 0.4};"></span>
                             Total Value
                        </button>
                        <button class="layer-toggle-btn ${this.visibleLayers.cost ? 'active' : ''}" data-layer="cost" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                             <span style="width:8px; height:8px; border-radius:50%; background:rgba(140, 140, 140, 0.6); opacity:${this.visibleLayers.cost ? 1 : 0.4};"></span>
                             Cost Basis
                        </button>
                        <button class="layer-toggle-btn ${this.visibleLayers.profit ? 'active' : ''}" data-layer="profit" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                             <span style="width:8px; height:8px; border-radius:50%; background:rgba(0, 255, 0, 0.8); opacity:${this.visibleLayers.profit ? 1 : 0.4};"></span>
                             Profit ($)
                        </button>
                    </div>

                    <!-- Composition Breakdown Toggles -->
                    ${catButtonsHtml || this.visibleLayers.shares ? `
                    <div class="control-row breakdown-row" style="border-top:1px solid rgba(255,255,255,0.03); padding-top:16px;">
                        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; text-align:center; font-weight:800;">Asset Breakdown</div>
                        <div style="display:flex; gap:24px; justify-content:center; flex-wrap:wrap;">
                            <button class="layer-toggle-btn ${this.visibleLayers.shares ? 'active' : ''}" data-layer="shares" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                                 <span style="width:8px; height:8px; border-radius:50%; background:rgba(107, 169, 193, 0.8); opacity:${this.visibleLayers.shares ? 1 : 0.4};"></span>
                                 All Shares
                            </button>
                            ${catButtonsHtml}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <style>
                #portfolio-chart-modal .active {
                    color: var(--color-accent) !important;
                }
                #portfolio-chart-modal .timeframe-row::-webkit-scrollbar { display: none; }
                #portfolio-chart-modal .timeframe-row { -ms-overflow-style: none; scrollbar-width: none; }
            </style>
        `;

        document.body.appendChild(this.modal);
        this._bindEvents();
        setTimeout(() => this.initChart(), 100);
    }

    _bindEvents() {
        const close = () => {
            if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
            if (this.chart) { this.chart.remove(); this.chart = null; }
            this.modal.remove();
            if (this.modal._navActive) { this.modal._navActive = false; navManager.popStateSilently(); }
        };

        this.modal._navActive = true;
        navManager.pushState(() => { if (this.modal.parentElement) { this.modal._navActive = false; close(); } });

        this.modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        this.modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        // Bind Source Filter
        const filterSelect = this.modal.querySelector('#portfolio-source-filter');
        if (filterSelect) {
            filterSelect.value = this.filter;
            filterSelect.addEventListener('change', (e) => {
                this.filter = e.target.value;
                this.loadData();
            });
        }

        this.modal.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.range = btn.dataset.range;
                this.modal.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadData();
            });
        });

        this.modal.querySelectorAll('.layer-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const layer = btn.dataset.layer;
                this.visibleLayers[layer] = !this.visibleLayers[layer];
                btn.classList.toggle('active', this.visibleLayers[layer]);

                const dot = btn.querySelector('span');
                if (dot) dot.style.opacity = this.visibleLayers[layer] ? 1 : 0.4;

                this._updateSeriesVisibility();
            });
        });
    }

    initChart() {
        const container = document.getElementById('portfolio-chart-container');
        if (!container || typeof LightweightCharts === 'undefined') return;

        this.chart = LightweightCharts.createChart(container, {
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: 'rgba(42, 46, 57, 0.05)' }, horzLines: { color: 'rgba(42, 46, 57, 0.05)' } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderVisible: false, rightOffset: 5 },
            crosshair: {
                vertLine: { color: 'rgba(193, 154, 107, 0.5)', labelBackgroundColor: '#111' },
                horzLine: { color: 'rgba(193, 154, 107, 0.5)', labelBackgroundColor: '#111' }
            },
            localization: {
                priceFormatter: (price) => {
                    // Fix sign placement: Use Intl or check sign manually to avoid $-100
                    if (price < 0) return '-$' + Math.abs(Math.floor(price)).toLocaleString('en-AU');
                    return '$' + Math.floor(price).toLocaleString('en-AU');
                }
            }
        });

        // AUTO-RESIZE OBSERVER (Fixes Mobile Landscape / Orientation Issues)
        // This ensures the chart adapts to the container's new size immediately
        this.resizeObserver = new ResizeObserver(entries => {
            if (!this.chart || !entries[0]) return;
            const { width, height } = entries[0].contentRect;
            this.chart.applyOptions({ width, height });
            // Optional: Refit content if drastic change?
            // this.chart.timeScale().fitContent(); 
        });
        this.resizeObserver.observe(container);

        const accountingFormat = {
            type: 'price',
            precision: 0,
            minMove: 1,
        };

        this.series.value = this.chart.addAreaSeries({ lineColor: 'rgba(193, 154, 107, 1)', topColor: 'rgba(193, 154, 107, 0.4)', bottomColor: 'rgba(193, 154, 107, 0.05)', lineWidth: 3, title: 'Total Value', visible: this.visibleLayers.value, priceFormat: accountingFormat });
        this.series.cost = this.chart.addLineSeries({ color: 'rgba(140, 140, 140, 0.6)', lineWidth: 2, lineStyle: 2, title: 'Cost Basis', visible: this.visibleLayers.cost, lastValueVisible: false, priceLineVisible: false, priceFormat: accountingFormat });
        this.series.profit = this.chart.addLineSeries({ color: 'rgba(0, 255, 0, 0.8)', lineWidth: 2, title: 'Total Profit', visible: this.visibleLayers.profit, priceFormat: accountingFormat });
        this.series.shares = this.chart.addLineSeries({ color: 'rgba(107, 169, 193, 0.8)', lineWidth: 2, title: 'All Shares', visible: this.visibleLayers.shares, priceFormat: accountingFormat });

        this.loadData();
    }

    _updateSeriesVisibility() {
        if (!this.chart) return;
        Object.keys(this.series).forEach(key => {
            if (this.series[key]) this.series[key].applyOptions({ visible: !!this.visibleLayers[key] });
        });
        Object.keys(this.categorySeries).forEach(catId => {
            const key = `cat_${catId}`;
            if (this.categorySeries[catId]) this.categorySeries[catId].applyOptions({ visible: !!this.visibleLayers[key] });
        });
    }

    async loadData() {
        console.log(`[PortfolioChartUI] v1055 Loading... Range: ${this.range} Filter: ${this.filter}`);
        const loading = document.getElementById('portfolio-chart-loading');
        if (loading) loading.style.display = 'flex';

        try {
            const rawShares = (AppState.data.shares || []).filter(s => s && s.shareName);
            const rawCash = AppState.data.cash || [];

            // Apply Source Filtering
            const { filteredShares, filteredCash } = this._applySourceFilter(rawShares, rawCash);

            // 1. Calculate Static Cash Components (Filtered)
            let totalCashValue = 0;
            const cashByCat = {};
            filteredCash.forEach(item => {
                const bal = parseFloat(item.balance || 0);
                totalCashValue += bal;
                const catId = item.category || 'cash';
                cashByCat[catId] = (cashByCat[catId] || 0) + bal;
            });

            // 2. Fetch Shares History (Only for filtered shares)
            const results = await Promise.all(filteredShares.map(s => this.dataService.fetchHistory(s.shareName, this.range)));
            const allTimestamps = new Set();
            const shareHistories = [];

            results.forEach((res, i) => {
                const s = filteredShares[i];
                // CRITICAL FIX: Even if a stock has NO history (illiquid in 5d), we MUST include it
                // so it can be valued at its Live Price / Last Known Price.
                // Otherwise, the chart total drops significantly.
                // if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
                const map = new Map();
                if (res && res.ok && Array.isArray(res.data)) {
                    res.data.forEach(d => { allTimestamps.add(d.time); map.set(d.time, d.close); });
                }

                // Purchase Date logic for Backfilling
                let purchaseTs = 0;
                if (s.purchaseDate || s.entryDate) {
                    const dateStr = s.purchaseDate || s.entryDate;
                    // Support DD/MM/YYYY or YYYY-MM-DD
                    let d;
                    if (dateStr.includes('/')) {
                        const p = dateStr.split('/');
                        d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
                    } else {
                        d = new Date(dateStr);
                    }
                    if (!isNaN(d.getTime())) purchaseTs = Math.floor(d.getTime() / 1000);
                }

                shareHistories.push({
                    units: parseFloat(s.portfolioShares || 0),
                    costBasis: parseFloat(s.portfolioShares || 0) * parseFloat(s.portfolioAvgPrice || 0),
                    purchaseTs: purchaseTs,
                    data: map,
                    code: s.shareName
                });
                // }
            });

            // Fallback Timeline
            let sortedTimes = Array.from(allTimestamps).sort((a, b) => a - b);
            if (sortedTimes.length === 0) {
                const now = Math.floor(Date.now() / 1000);
                for (let i = 30; i >= 0; i--) sortedTimes.push(now - (i * 86400));
            }

            const valueData = [], costData = [], profitData = [], sharesValueData = [];
            const catBuffers = {};
            Object.keys(cashByCat).forEach(cid => catBuffers[cid] = []);

            // INJECT LIVE PRICE: Ensure the chart always ends at the current "Live" value from Sidebar
            // This fixes the discrepancy where history might lag by 1 day or miss today's market moves
            const nowTs = Math.floor(Date.now() / 1000);
            const liveMap = new Map();
            let hasLiveUpdates = false;

            filteredShares.forEach(s => {
                const priceData = AppState.livePrices.get(s.shareName);
                if (priceData && priceData.live > 0) {
                    liveMap.set(s.shareName, priceData.live);
                    hasLiveUpdates = true;
                }
            });

            // Initialize lastPrices with LIVE data if available. 
            // This fills the gaps for illiquid stocks that have no history in this range.
            const lastPrices = shareHistories.map(sh => liveMap.get(sh.code) || 0);

            if (hasLiveUpdates) {
                // If the last timestamp is significantly older (>12h), or we just want to force "Now"
                const lastTs = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0;
                if (nowTs - lastTs > 3600) { // If > 1 hour gap, append NOW
                    sortedTimes.push(nowTs);
                    // Append live price to each history's data map for this new timestamp
                    shareHistories.forEach(sh => {
                        if (liveMap.has(sh.code)) {
                            sh.data.set(nowTs, liveMap.get(sh.code));
                        }
                    });
                } else {
                    // Just update the very last point to be the live price if it's "close enough" (e.g. today)
                    // Actually, safer to always append "Now" for visual accuracy of "Current Value"
                    // But duplicates might look weird. Let's stick to appending if gap exist, or updating if same day.
                    // For safety: Always Append. Lightweight charts handles proximity fine.
                    // Actually, let's just push nowTs and let the loop handle it
                    if (nowTs !== lastTs) {
                        sortedTimes.push(nowTs);
                        shareHistories.forEach(sh => {
                            if (liveMap.has(sh.code)) sh.data.set(nowTs, liveMap.get(sh.code));
                        });
                    }
                }
            }

            sortedTimes.forEach(time => {
                let daySharesValue = 0;
                let daySharesCost = 0;

                shareHistories.forEach((sh, idx) => {
                    // Backfilling Filter: If time is before purchase, asset didn't exist in portfolio
                    if (sh.purchaseTs > 0 && time < sh.purchaseTs) return;

                    if (sh.data.has(time)) { lastPrices[idx] = sh.data.get(time); }
                    daySharesValue += (lastPrices[idx] * sh.units);
                    daySharesCost += sh.costBasis;
                });

                const dayTotalValue = daySharesValue + totalCashValue;
                const dayTotalCost = daySharesCost + totalCashValue;

                valueData.push({ time, value: dayTotalValue });
                costData.push({ time, value: dayTotalCost });
                profitData.push({ time, value: dayTotalValue - dayTotalCost });

                sharesValueData.push({ time, value: daySharesValue });

                Object.keys(cashByCat).forEach(cid => {
                    catBuffers[cid].push({ time, value: cashByCat[cid] });
                });
            });

            // 2. Diagnostic Log (Updated)
            console.log(`[PortfolioChartUI] v1055 Diagnostic (${this.filter}): Total=${formatCurrency(valueData[valueData.length - 1].value)}, Shares=${formatCurrency(sharesValueData[sharesValueData.length - 1].value)}, Cash=${formatCurrency(totalCashValue)} (Cost=${formatCurrency(costData[costData.length - 1].value)})`);

            // 3. Update Chart Series
            this.series.value.setData(valueData);
            this.series.cost.setData(costData);
            this.series.profit.setData(profitData);
            this.series.shares.setData(sharesValueData);

            // MARKERS: "Live Price" & "Inception"
            const markers = [];

            // A. Live Price Marker (at the very end)
            if (hasLiveUpdates && valueData.length > 0) {
                const lastPoint = valueData[valueData.length - 1];
                markers.push({
                    time: lastPoint.time,
                    position: 'aboveBar',
                    color: '#e91e63', // Pink/Accent color
                    shape: 'arrowDown',
                    text: 'LIVE'
                });
            }

            // B. Inception Marker (First non-zero value where cost basis starts)
            // Find the first point where cost > 0 (or value > 0 if cost is missing)
            // Actually, we use filteredShares to find the earliest purchaseTs
            let earliestPurchaseTs = Infinity;
            filteredShares.forEach(s => {
                if (s.purchaseTs && s.purchaseTs > 0 && s.purchaseTs < earliestPurchaseTs) {
                    earliestPurchaseTs = s.purchaseTs;
                }
            });

            // If we found a valid earliest purchase time, add a marker
            if (earliestPurchaseTs !== Infinity) {
                // Find the closest data point in valueData
                const inceptionPoint = valueData.find(d => d.time >= earliestPurchaseTs);
                if (inceptionPoint) {
                    markers.push({
                        time: inceptionPoint.time,
                        position: 'belowBar',
                        color: '#2196f3', // Blue color
                        shape: 'arrowUp',
                        text: 'INCEPTION'
                    });
                }
            }

            this.series.value.setMarkers(markers);

            // 4. Manage Breakdown Series Dynamically
            Object.keys(catBuffers).forEach((catId, idx) => {
                if (!this.categorySeries[catId]) {
                    const label = this._getCategoryLabel(catId);
                    const palette = ['#4db8ff', '#ff4d4d', '#4dff88', '#ffcc4d', '#ff4db8', '#b84dff', '#4dffff', '#ff994d'];
                    const color = palette[idx % palette.length];

                    this.categorySeries[catId] = this.chart.addLineSeries({
                        color: color,
                        lineWidth: 2,
                        title: label,
                        visible: !!this.visibleLayers[`cat_${catId}`],
                        priceFormat: { type: 'price', precision: 0, minMove: 1 }
                    });
                }
                this.categorySeries[catId].setData(catBuffers[catId]);
            });

            this.chart.timeScale().fitContent();
            this._updateStats(valueData, costData[costData.length - 1].value);

            if (loading) loading.style.display = 'none';
        } catch (e) {
            console.error('[PortfolioChartUI] Load Error:', e);
            if (loading) {
                loading.innerHTML = `<i class="fas fa-exclamation-triangle fa-2x" style="color:#ff6666;"></i>
                                    <span style="color:#ff6666; margin-top:16px; text-align:center; padding:0 24px;">
                                        Simulation Error<br><small>${e.message}</small>
                                    </span>
                                    <button style="margin-top:20px; background:transparent; border:1px solid #fff; color:#fff; padding:6px 16px; border-radius:4px; font-weight:700;" onclick="location.reload()">REFRESH</button>`;
            }
        }
    }

    /**
     * Filters shares and cash based on the selected Source Filter.
     */
    _applySourceFilter(shares, cash) {
        let filteredShares = [];
        let filteredCash = [];

        const mode = this.filter; // TOTAL, SHARES_ONLY, SUPER, CASH_ASSETS

        if (mode === 'TOTAL') {
            filteredShares = [...shares];
            // Exclude 'shares' category from cash to avoid double counting (standard logic)
            filteredCash = cash.filter(c => c.category !== 'shares');
        }
        else if (mode === 'SHARES_ONLY') {
            filteredShares = [...shares];
            filteredCash = []; // No cash
        }
        else if (mode === 'SUPER') {
            // Include Cash with category 'super'
            filteredCash = cash.filter(c => c.category === 'super');

            // Include Shares in 'Super' watchlist
            // 1. Find the ID of any watchlist named 'Super' (case insensitive)
            const watchlists = AppState.data.watchlists || [];
            const superList = watchlists.find(w => w.name && w.name.toLowerCase().includes('super'));

            if (superList && superList.items) {
                const superCodes = new Set(superList.items.map(i => i.code));
                filteredShares = shares.filter(s => superCodes.has(s.shareName));
            } else {
                filteredShares = [];
            }
        }
        else if (mode === 'CASH_ASSETS') {
            filteredShares = [];
            // Exclude 'shares' category, exclude 'super' category (optional? No, usually Cash Assets implies liquid/personal)
            // Let's include everything EXCEPT 'shares' for now, or maybe strictly non-super?
            // The plan said: "All non-share assets".
            filteredCash = cash.filter(c => c.category !== 'shares');
        }

        return { filteredShares, filteredCash };
    }

    _getCashByCategory() {
        const cash = AppState.data.cash || [];
        const map = {};
        cash.forEach(item => {
            // EXCLUDE 'shares' category from cash aggregation to prevent double-counting
            if (item.category === 'shares') return;

            const bal = parseFloat(item.balance || 0);
            if (bal === 0) return;
            const cid = item.category || 'cash';
            map[cid] = (map[cid] || 0) + bal;
        });
        return map;
    }

    _getCategoryLabel(catId) {
        if (catId.startsWith('user_')) {
            const ucat = AppState.preferences.userCategories?.find(c => c.id === catId);
            if (ucat) return ucat.label;
        }
        const sys = CASH_CATEGORIES.find(c => c.id === catId);
        return sys ? sys.label : 'Asset';
    }

    _updateStats(data, currentCost) {
        if (!data || data.length === 0) return;
        const last = data[data.length - 1].value;
        const change = last - currentCost;
        const pct = currentCost !== 0 ? (change / currentCost) * 100 : 0;

        const statsEl = this.modal.querySelector('.chart-stats-summary');
        if (statsEl) {
            const colorClass = change >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE;
            statsEl.innerHTML = `
                <div style="display:flex; gap:16px; align-items:center;">
                    <span class="${colorClass}" style="font-weight:800; font-size:1.1rem; letter-spacing:-0.2px;">
                        ${change >= 0 ? '+' : ''}${Math.floor(change).toLocaleString('en-AU')} (${formatPercent(pct)})
                    </span>
                    <span style="opacity:0.6; font-weight:700; font-size:0.8rem;">Current Total: ${Math.floor(last).toLocaleString('en-AU')}</span>
                </div>
            `;
        }
    }
}
