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
        this.filter = 'SHARES_ONLY';
        this.chart = null;
        this.dataService = new DataService();
        this.modal = null;

        // Series References
        this.series = {
            total: null,
            shares: null,
            super: null,
            cash: null
        };

        // Visibility State (Sources instead of Metric Types)
        this.visibleLayers = {
            total: true,
            shares: false,
            super: false,
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

        // Prepare Category Breakdown Dropdown Items
        const cashByCat = this._getCashByCategory();
        const catItemsHtml = Object.keys(cashByCat)
            .filter(catId => catId !== 'super')
            .map((catId, idx) => {
                const label = this._getCategoryLabel(catId);
                const active = !!this.visibleLayers[`cat_${catId}`];
                const color = this._getCategoryColor(catId, idx);

                return `
                <div class="dropdown-item layer-toggle-btn" data-layer="cat_${catId}" data-color="${color}"
                     style="padding: 8px 12px; display:flex; align-items:center; gap:10px; cursor:pointer; transition:background 0.1s;">
                     <div class="checkbox-indicator" style="width:14px; height:14px; border:1px solid rgba(255,255,255,0.3); border-radius:2px; display:flex; align-items:center; justify-content:center; background:${active ? color : 'transparent'};">
                        ${active ? '<i class="fas fa-check" style="font-size:0.6rem; color:#fff;"></i>' : ''}
                     </div>
                     <span style="font-size:0.85rem; color:${active ? '#fff' : 'rgba(255,255,255,0.6)'}; margin-top:1px;">${label}</span>
                </div>
            `;
            }).join('');

        this.modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} portfolio-chart-content" style="width: 100%; height: 100%; max-width: none; border-radius: 0; display:flex; flex-direction:column; background:var(--card-bg); overflow:hidden;">
                
                <!-- HEADER: Stacked on Mobile, Row on Desktop -->
                <div class="${CSS_CLASSES.MODAL_HEADER} chart-header-responsive" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 16px 24px; display:flex; align-items:flex-start; justify-content:space-between;">
                    <div class="header-content-wrapper" style="display:flex; flex-grow:1; flex-direction:row; align-items:center; justify-content:space-between; margin-right:16px;">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="font-size: 1.4rem; display:flex; align-items:center; gap:10px;">
                                <i class="fas fa-chart-line" style="color:var(--color-accent);"></i> Portfolio History
                            </h2>
                        </div>
                        <div class="chart-stats-summary" style="text-align:right;"></div>
                    </div>

                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close" style="flex-shrink:0;">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                
                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex:1; position:relative; padding:0; overflow:hidden; background:#111;">
                    <div id="portfolio-chart-container" style="width:100%; height:100%; touch-action: pan-y;"></div>
                    <div id="portfolio-chart-loading" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; flex-direction:column; z-index:10; backdrop-filter: blur(2px);">
                        <i class="fas ${UI_ICONS.SPINNER} fa-2x" style="color:var(--color-accent);"></i>
                        <span style="margin-top:16px; font-weight:600; font-size: 0.9rem; color: #fff;">Calculating Performance...</span>
                    </div>
                </div>

                <div class="portfolio-chart-controls" style="padding:12px 16px; background:var(--card-bg); display:flex; flex-direction:column; gap:20px; border-top: 1px solid rgba(255,255,255,0.05); overflow:visible; z-index:20; position:relative; transition: max-height 0.3s ease-out, padding 0.3s ease-out;">
                    <!-- Collapse Toggle Handle -->
                    <div class="controls-collapse-toggle" style="height: 32px; width: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: -8px;">
                        <div style="width: 40px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.2);"></div>
                    </div>
                    
                    <!-- Timeframe Toggles -->
                    <div class="control-row timeframe-row" style="display:flex; gap:18px; justify-content:center; overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling: touch; flex-shrink:0;">
                        ${['1d', '5d', '1m', '3m', '6m', '1y', '5y', '10y', 'max'].map(r => `
                            <button class="range-btn ${this.range === r ? 'active' : ''}" data-range="${r}" 
                                    style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; text-transform:uppercase; transition: color 0.15s ease;">
                                ${r}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Main Source Toggles & Other Assets Dropdown -->
                    <div class="control-row layer-row" style="display:flex; gap:24px; justify-content:center; flex-wrap:wrap; align-items:center;">
                        <button class="layer-toggle-btn ${this.visibleLayers.total ? 'active' : ''}" data-layer="total" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                             <span style="width:10px; height:10px; border-radius:2px; background:#06FF4F; opacity:${this.visibleLayers.total ? 1 : 0.4};"></span>
                             Total
                        </button>
                        <button class="layer-toggle-btn ${this.visibleLayers.super ? 'active' : ''}" data-layer="super" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                             <span style="width:10px; height:10px; border-radius:2px; background:#9C27B0; opacity:${this.visibleLayers.super ? 1 : 0.4};"></span>
                             Super
                        </button>
                        <button class="layer-toggle-btn ${this.visibleLayers.shares ? 'active' : ''}" data-layer="shares" 
                                style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px;">
                             <span style="width:10px; height:10px; border-radius:2px; background:#a49393; opacity:${this.visibleLayers.shares ? 1 : 0.4};"></span>
                             Shares
                        </button>

                        <!-- Divider -->
                        <div style="width:1px; height:16px; background:rgba(255,255,255,0.1);"></div>

                        <!-- Other Assets Dropdown -->
                        <div class="custom-dropdown-container" style="position:relative;">
                            <button id="other-assets-btn" 
                                    style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:6px 12px; color:#fff; font-size:0.8rem; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; transition:all 0.2s;">
                                 Other Assets <i class="fas fa-chevron-down" style="font-size:0.7rem; opacity:0.7;"></i>
                            </button>
                            <!-- Dropdown Menu -->
                            <div id="other-assets-menu" 
                                 style="position:absolute; bottom:100%; right:50%; transform:translateX(50%); margin-bottom:8px; width:200px; background:#1e1e1e; border:1px solid rgba(255,255,255,0.1); border-radius:6px; box-shadow:0 4px 20px rgba(0,0,0,0.5); display:none; flex-direction:column; padding:4px 0; z-index:100;">
                                ${catItemsHtml || '<div style="padding:12px; font-size:0.8rem; opacity:0.5; text-align:center;">No other assets</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                #portfolio-chart-modal .active {
                    color: var(--color-accent) !important;
                }
                #portfolio-chart-modal .timeframe-row::-webkit-scrollbar { display: none; }
                #portfolio-chart-modal .timeframe-row { -ms-overflow-style: none; scrollbar-width: none; }
                
                #portfolio-chart-modal .portfolio-chart-controls.collapsed {
                    max-height: 40px !important;
                    padding-bottom: 0 !important;
                    padding-top: 8px !important;
                    gap: 0 !important;
                }
                #portfolio-chart-modal .portfolio-chart-controls.collapsed .control-row {
                    display: none !important;
                }
                /* Dropdown Item Hover */
                #portfolio-chart-modal .dropdown-item:hover { background: rgba(255,255,255,0.05); }

                /* Responsive Logic */
                @media (max-width: 600px) and (orientation: portrait) {
                    .chart-header-responsive .header-content-wrapper {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 12px;
                    }
                    .chart-header-responsive .header-content-wrapper .chart-stats-summary {
                        text-align: left !important;
                        width: 100%;
                    }
                    /* Force left alignment for the flex column inside stats */
                    .chart-stats-summary > div {
                        align-items: flex-start !important;
                    }
                }
                
                /* Default Desktop/Landscape Alignment */
                 .chart-stats-summary > div {
                    align-items: flex-end; /* Default right align for desktop */
                }
                #portfolio-chart-container {
                    touch-action: pan-y;
                }
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

        // Bind Range Buttons
        this.modal.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.range = btn.dataset.range;
                this.modal.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadData();
            });
        });

        // Bind Main Layer Toggles & Dropdown Items
        this.modal.querySelectorAll('.layer-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // If inside dropdown, stop propagation to keep menu open
                if (btn.closest('#other-assets-menu')) {
                    e.stopPropagation();
                }

                const layer = btn.dataset.layer;
                this.visibleLayers[layer] = !this.visibleLayers[layer];
                const isActive = this.visibleLayers[layer];

                // Handle Dropdown Item Styling
                if (btn.classList.contains('dropdown-item')) {
                    const indicator = btn.querySelector('.checkbox-indicator');
                    const text = btn.querySelector('span');
                    const color = btn.dataset.color || '#fff';

                    if (indicator) {
                        indicator.style.background = isActive ? color : 'transparent';
                        indicator.innerHTML = isActive ? '<i class="fas fa-check" style="font-size:0.6rem; color:#fff;"></i>' : '';
                    }
                    if (text) text.style.color = isActive ? '#fff' : 'rgba(255,255,255,0.6)';

                } else {
                    // Main Toggles
                    btn.classList.toggle('active', isActive);
                    const dot = btn.querySelector('span');
                    if (dot) dot.style.opacity = isActive ? 1 : 0.4;
                }

                this._updateSeriesVisibility();
            });
        });

        // Dropdown Open/Close Logic
        const dropdownBtn = this.modal.querySelector('#other-assets-btn');
        const dropdownMenu = this.modal.querySelector('#other-assets-menu');

        if (dropdownBtn && dropdownMenu) {
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = dropdownMenu.style.display === 'none';
                dropdownMenu.style.display = isHidden ? 'flex' : 'none';
            });

            // Close when clicking outside
            const closeDropdown = (e) => {
                if (!document.body.contains(this.modal)) {
                    document.removeEventListener('click', closeDropdown);
                    return;
                }
                if (dropdownMenu.style.display !== 'none' && !dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                    dropdownMenu.style.display = 'none';
                }
            };
            document.addEventListener('click', closeDropdown);
        }

        // Bind Collapse Toggle
        const collapseHandle = this.modal.querySelector('.controls-collapse-toggle');
        const controls = this.modal.querySelector('.portfolio-chart-controls');
        if (collapseHandle && controls) {
            collapseHandle.addEventListener('click', () => {
                controls.classList.toggle('collapsed');
            });
        }
    }

    initChart() {
        const container = document.getElementById('portfolio-chart-container');
        if (!container || typeof LightweightCharts === 'undefined') return;

        this.chart = LightweightCharts.createChart(container, {
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: 'rgba(42, 46, 57, 0.05)' }, horzLines: { color: 'rgba(42, 46, 57, 0.05)' } },
            handleScroll: {
                vertTouchDrag: false, // Allow page scroll on mobile
            },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderVisible: false, rightOffset: 5 },
            crosshair: {
                vertLine: { color: 'rgba(164, 147, 147, 0.5)', labelBackgroundColor: '#111' },
                horzLine: { color: 'rgba(164, 147, 147, 0.5)', labelBackgroundColor: '#111' }
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
            if (!this.chart || !container) return;
            // Use offsets for more accurate "real" dimensions during transitions
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            if (width > 0 && height > 0) {
                this.chart.applyOptions({ width, height });
                // Force a fitContent to ensure simulation isn't "half screen"
                this.chart.timeScale().fitContent();
            }
        });
        this.resizeObserver.observe(container);

        // Explicit Orientation change listener as a fallback for some mobile browsers
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (this.chart && container) {
                    this.chart.applyOptions({ width: container.offsetWidth, height: container.offsetHeight });
                    this.chart.timeScale().fitContent();
                }
            }, 200);
        });

        const accountingFormat = {
            type: 'price',
            precision: 0,
            minMove: 1,
        };

        // Total Portfolio Series (Value)
        this.series.total = this.chart.addAreaSeries({
            lineColor: '#06FF4F',
            topColor: 'rgba(6, 255, 79, 0.4)',
            bottomColor: 'rgba(6, 255, 79, 0.05)',
            lineWidth: 3,
            visible: this.visibleLayers.total,
            priceFormat: accountingFormat
        });

        // Superannuation Series
        this.series.super = this.chart.addLineSeries({
            color: '#9C27B0',
            lineWidth: 2,
            visible: this.visibleLayers.super,
            priceFormat: accountingFormat
        });

        // Shares Portfolio Series
        this.series.shares = this.chart.addLineSeries({
            color: '#a49393',
            lineWidth: 2,
            visible: this.visibleLayers.shares,
            priceFormat: accountingFormat
        });

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
        console.log(`[PortfolioChartUI] v1106 Loading... Range: ${this.range}`);
        const loading = document.getElementById('portfolio-chart-loading');
        if (loading) loading.style.display = 'flex';

        try {
            const rawShares = (AppState.data.shares || []).filter(s => s && s.shareName);
            const rawCash = AppState.data.cash || [];

            // 1. Calculate Timestep start for filtering the visible window
            const startTs = this._getRangeStartTs();

            // 2. Prepare Source Components
            const cashByCat = {};
            rawCash.forEach(item => {
                if (item.category === 'shares') return;
                const bal = parseFloat(item.balance || 0);
                const catId = item.category || 'cash';
                cashByCat[catId] = (cashByCat[catId] || 0) + bal;
            });

            // 3. Fetch Shares History (For ALL shares in portfolio)
            const results = await Promise.all(rawShares.map(s => this.dataService.fetchHistory(s.shareName, this.range)));
            const allTimestamps = new Set();
            const shareHistories = [];

            results.forEach((res, i) => {
                const s = rawShares[i];
                const map = new Map();
                if (res && res.ok && Array.isArray(res.data)) {
                    res.data.forEach(d => {
                        if (d.time >= startTs) {
                            allTimestamps.add(d.time);
                            map.set(d.time, d.close);
                        }
                    });
                }

                // Purchase Date logic
                let purchaseTs = 0;
                if (s.purchaseDate || s.entryDate) {
                    const dateStr = s.purchaseDate || s.entryDate;
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
                    purchaseTs: purchaseTs,
                    data: map,
                    code: s.shareName
                });
            });

            // 4. Inject Historical Data Timestamps (Cash/Super Anchors)
            Object.keys(cashByCat).forEach(cid => {
                const history = AppState.preferences.historicalData?.[cid];
                if (history && Array.isArray(history)) {
                    history.forEach(p => {
                        if (p.time >= startTs) allTimestamps.add(p.time);
                    });
                }
            });

            // Fallback Timeline
            let sortedTimes = Array.from(allTimestamps).sort((a, b) => a - b);
            if (sortedTimes.length === 0) {
                const now = Math.floor(Date.now() / 1000);
                for (let i = 30; i >= 0; i--) sortedTimes.push(now - (i * 86400));
            }

            // Inject Live Price
            const nowTs = Math.floor(Date.now() / 1000);
            const liveMap = new Map();
            let hasLiveUpdates = false;
            rawShares.forEach(s => {
                const priceData = AppState.livePrices.get(s.shareName);
                if (priceData && priceData.live > 0) {
                    liveMap.set(s.shareName, priceData.live);
                    hasLiveUpdates = true;
                    // Also update the map for each history
                    const sh = shareHistories.find(h => h.code === s.shareName);
                    if (sh) sh.data.set(nowTs, priceData.live);
                }
            });

            if (nowTs >= startTs) {
                const lastTs = sortedTimes[sortedTimes.length - 1] || 0;
                if (nowTs - lastTs > 3600) sortedTimes.push(nowTs);
            }

            const totalData = [], superData = [], sharesData = [];
            const catBuffers = {};
            Object.keys(cashByCat).forEach(cid => catBuffers[cid] = []);

            // Last known prices for interpolation
            const lastPrices = shareHistories.map(sh => liveMap.get(sh.code) || 0);

            // 5. Loop through timeline and calculate sources
            sortedTimes.forEach(time => {
                let daySharesValue = 0;
                let daySuperValue = 0;
                let dayTotalCash = 0;

                // A. Shares
                shareHistories.forEach((sh, idx) => {
                    if (sh.purchaseTs > 0 && time < sh.purchaseTs) return;
                    if (sh.data.has(time)) {
                        lastPrices[idx] = sh.data.get(time);
                    }
                    const val = lastPrices[idx] * sh.units;
                    daySharesValue += val;

                    // Super Check
                    const watchlists = AppState.data.watchlists || [];
                    const isSuper = watchlists.some(w =>
                        w.name?.toLowerCase().includes('super') &&
                        w.items?.some(i => i.code === sh.code)
                    );
                    if (isSuper) daySuperValue += val;
                });

                // B. Cash
                Object.keys(cashByCat).forEach(cid => {
                    const histVal = this._getHistoricalValue(cid, time, cashByCat[cid]);
                    if (cid === 'super') daySuperValue += histVal;
                    dayTotalCash += histVal;
                    if (catBuffers[cid]) catBuffers[cid].push({ time, value: histVal });
                });

                const dayTotalValue = daySharesValue + dayTotalCash;
                totalData.push({ time, value: dayTotalValue });
                superData.push({ time, value: daySuperValue });
                sharesData.push({ time, value: daySharesValue });
            });

            // 6. Push to Series
            if (this.series.total) this.series.total.setData(totalData);
            if (this.series.super) this.series.super.setData(superData);
            if (this.series.shares) this.series.shares.setData(sharesData);

            // 7. Breakdown Series
            Object.keys(catBuffers).forEach((catId, idx) => {
                if (!this.categorySeries[catId]) {
                    this.categorySeries[catId] = this.chart.addLineSeries({
                        color: this._getCategoryColor(catId, idx),
                        lineWidth: 2,
                        visible: !!this.visibleLayers[`cat_${catId}`],
                        priceFormat: { type: 'price', precision: 0, minMove: 1 }
                    });
                }
                this.categorySeries[catId].setData(catBuffers[catId]);
            });

            // 8. Markers
            if (hasLiveUpdates && totalData.length > 0 && this.series.total) {
                this.series.total.setMarkers([{
                    time: totalData[totalData.length - 1].time,
                    position: 'aboveBar',
                    color: '#e91e63',
                    shape: 'arrowDown',
                    text: 'LIVE'
                }]);
            }

            if (this.chart) this.chart.timeScale().fitContent();
            this._updateStats(totalData);

            if (loading) loading.style.display = 'none';
        } catch (e) {
            console.error('[PortfolioChartUI] Load Error:', e);
            if (loading) loading.style.display = 'none';
        }
    }

    _getRangeStartTs() {
        const now = Math.floor(Date.now() / 1000);
        const day = 86400;
        switch (this.range) {
            case '1d': return now - day;
            case '5d': return now - (5 * day);
            case '1m': return now - (31 * day);
            case '3m': return now - (92 * day);
            case '6m': return now - (183 * day);
            case '1y': return now - (365 * day);
            case '5y': return now - (5 * 365 * day);
            case '10y': return now - (10 * 365 * day);
            case 'max': return 0;
            default: return now - (365 * day);
        }
    }

    _getFilterColor(filter) {
        const map = {
            'total': { hex: '#06FF4F', rgb: '6, 255, 79' },
            'super': { hex: '#9C27B0', rgb: '156, 39, 176' },
            'shares': { hex: '#a49393', rgb: '164, 147, 147' }
        };
        const c = map[filter] || map['total'];
        return { hex: c.hex, rgba: (opacity) => `rgba(${c.rgb}, ${opacity})` };
    }

    _updateFilterStyles() { }
    _applySourceFilter() { }

    _getCashByCategory() {
        const cash = AppState.data.cash || [];
        const map = {};
        cash.forEach(item => {
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

    _getCategoryColor(catId, index) {
        const userCat = AppState.preferences.userCategories?.find(c => c.id === catId);
        if (userCat && userCat.color) return userCat.color;
        const firstAssetInCat = (AppState.data.cash || []).find(a => a.category === catId && a.color);
        if (firstAssetInCat && firstAssetInCat.color) return firstAssetInCat.color;
        const palette = ['#4db8ff', '#ff4d4d', '#4dff88', '#ffcc4d', '#ff4db8', '#b84dff', '#4dffff', '#ff994d'];
        return palette[index % palette.length];
    }

    _getHistoricalValue(catId, time, currentBalance) {
        const history = AppState.preferences.historicalData?.[catId];
        if (!history || history.length === 0) return currentBalance;
        const points = [...history].sort((a, b) => a.time - b.time);
        const lastPoint = points[points.length - 1];
        if (time >= lastPoint.time) {
            const now = Math.floor(Date.now() / 1000);
            if (time >= now) return currentBalance;
            if (now - lastPoint.time < 86400) return currentBalance;
            const t = (time - lastPoint.time) / (now - lastPoint.time);
            return lastPoint.val + t * (currentBalance - lastPoint.val);
        }
        if (time <= points[0].time) return points[0].val;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (time >= p1.time && time <= p2.time) {
                const t = (time - p1.time) / (p2.time - p1.time);
                return p1.val + t * (p2.val - p1.val);
            }
        }
        return currentBalance;
    }

    _updateStats(data) {
        if (!data || data.length === 0) return;
        const last = data[data.length - 1].value;
        const statsEl = this.modal.querySelector('.chart-stats-summary');
        if (statsEl) {
            statsEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="font-size: 1.3rem; font-weight: 900; color: #fff; line-height: 1.1;">$${Math.floor(last).toLocaleString('en-AU')}</div>
                        <div style="font-size: 0.7rem; opacity: 0.5; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Current Value</div>
                    </div>
                `;
        }
    }
}
