import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { UI_ICONS, CSS_CLASSES, IDS, EVENTS, CASH_CATEGORIES } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';
import { DataService, userStore } from '../data/DataService.js';

/**
 * PortfolioChartUI
 * Handles the historical trend chart for the entire portfolio.
 * Implements "Backfill" logic to simulate history based on current holdings.
 * NOW INCLUDES: Cash & Asset integration with category breakdowns.
 * v1151: Fixed double-counting of portfolio shares in total wealth.
 */
export class PortfolioChartUI {
    static async show() {
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
        this.range = localStorage.getItem('ASX_NEXT_portfolioChartRange') || '1y';
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
        const savedLayers = JSON.parse(localStorage.getItem('ASX_NEXT_portfolioChartLayers') || 'null');
        this.visibleLayers = savedLayers || {
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
        this.modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;
        this.modal.style.setProperty('z-index', '22000', 'important');

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
            <div class="${CSS_CLASSES.MODAL_CONTENT} portfolio-chart-content" style="width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; gap: 0 !important; display:flex; flex-direction:column; background:var(--card-bg); overflow:hidden;">
                
                <!-- HEADER: Stacked on Mobile, Row on Desktop -->
                <div class="${CSS_CLASSES.MODAL_HEADER} chart-header-responsive" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 16px 24px; display:flex; align-items:flex-start; justify-content:space-between; flex-shrink: 0;">
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
                    
                    <!-- High/Low Stats Summary (Innovative Range Display) -->
                    <div class="control-row high-low-row" style="display:none; gap:20px; justify-content:center; overflow-x:auto; padding: 0 16px; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin-bottom: -4px;">
                        <!-- Dynamically populated -->
                    </div>

                    <!-- Timeframe Toggles -->
                    <div class="control-row timeframe-row" style="display:flex; gap:14px; justify-content:center; overflow-x:auto; padding: 4px 8px; -webkit-overflow-scrolling: touch; flex-shrink:0;">
                        ${['1d', '5d', '1m', '3m', '6m', '1y', '3y', '5y', '10y', 'max'].map(r => `
                            <button class="range-btn ${this.range === r ? 'active' : ''}" data-range="${r}" 
                                    style="background:transparent; border:none; outline:none; padding:4px 0; color:#fff; font-size:0.82rem; font-weight:800; cursor:pointer; text-transform:uppercase; transition: color 0.15s ease; flex-shrink:0;">
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
                #portfolio-chart-modal .timeframe-row::-webkit-scrollbar,
                #portfolio-chart-modal .high-low-row::-webkit-scrollbar { display: none; }
                #portfolio-chart-modal .timeframe-row,
                #portfolio-chart-modal .high-low-row { 
                    -ms-overflow-style: none; 
                    scrollbar-width: none; 
                }
                
                @media (max-width: 480px) and (orientation: portrait) {
                    #portfolio-chart-modal .timeframe-row {
                        gap: 8px !important;
                        justify-content: space-between !important;
                        padding-left: 12px !important;
                        padding-right: 12px !important;
                        overflow: hidden !important; /* Force fit if possible */
                    }
                    #portfolio-chart-modal .range-btn {
                        font-size: 0.72rem !important;
                        flex: 1;
                        text-align: center;
                    }
                }
                
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

        requestAnimationFrame(() => {
            this.modal.classList.remove(CSS_CLASSES.HIDDEN);
            requestAnimationFrame(() => {
                this.modal.classList.add(CSS_CLASSES.SHOW);
            });
        });

        setTimeout(() => this.initChart(), 100);
    }

    _bindEvents() {
        const close = () => {
            if (this.modal._isClosing) return;
            this.modal._isClosing = true;

            if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
            if (this.chart) { this.chart.remove(); this.chart = null; }
            
            this.modal.classList.remove(CSS_CLASSES.SHOW);
            this.modal.style.pointerEvents = 'none';
            
            setTimeout(() => {
                this.modal.classList.add(CSS_CLASSES.HIDDEN);
                if (this.modal.parentElement) this.modal.remove();
            }, 450);

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
                localStorage.setItem('ASX_NEXT_portfolioChartRange', this.range);
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
                localStorage.setItem('ASX_NEXT_portfolioChartLayers', JSON.stringify(this.visibleLayers));
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
                vertLine: { 
                    color: 'rgba(164, 147, 147, 0.8)', 
                    width: 1,
                    style: 2, // Dotted
                    labelBackgroundColor: '#a49393', // Coffee (Accent)
                },
                horzLine: { 
                    color: 'rgba(164, 147, 147, 0.8)', 
                    width: 1,
                    style: 2, // Dotted
                    labelBackgroundColor: '#06FF4F', // Total color (Neon Green)
                }
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

        // Dynamic "Scrub" Price Line (Highlight box for mobile scrubbing)
        // This simulates the "Last Price" label but for the point under your finger.
        // We initialize it on the "Total" series by default.
        this.scrubPriceLine = this.series.total.createPriceLine({
            price: 0,
            color: 'rgba(6, 255, 79, 0.3)',
            lineWidth: 1,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: '',
            axisLabelColor: '#06FF4F', // Neon Green Background
            axisLabelTextColor: '#000', // Black Text for maximum clarity
        });
        this.scrubPriceLine._parentSeries = this.series.total;
        this.scrubPriceLine.applyOptions({ visible: false });

        // CROSSHAIR MOVE LISTENER (Mobile Scrubbing Support)
        this.chart.subscribeCrosshairMove(param => {
            if (!this.chart) return;

            if (!param.time || !param.point || param.point.x < 0) {
                if (this.scrubPriceLine) this.scrubPriceLine.applyOptions({ visible: false });
                return;
            }

            // Identify which series to track for the highlight (Total first, then Shares, then Super)
            let seriesToTrack = null;
            if (this.visibleLayers.total) seriesToTrack = this.series.total;
            else if (this.visibleLayers.shares) seriesToTrack = this.series.shares;
            else if (this.visibleLayers.super) seriesToTrack = this.series.super;
            else if (Object.keys(this.categorySeries).length > 0) {
                const firstCatId = Object.keys(this.categorySeries).find(cid => this.visibleLayers[`cat_${cid}`]);
                if (firstCatId) seriesToTrack = this.categorySeries[firstCatId];
            }

            if (!seriesToTrack) {
                if (this.scrubPriceLine) this.scrubPriceLine.applyOptions({ visible: false });
                return;
            }

            // Get the value for the tracked series at this point
            const data = param.seriesData.get(seriesToTrack);
            if (data && (data.value !== undefined || data.close !== undefined)) {
                const price = data.value !== undefined ? data.value : data.close;
                
                // Update and show the scrub line
                // Note: We re-attach/re-create if series changes, but simple update is usually enough
                // if we attach it to the tracked series.
                if (this.scrubPriceLine) {
                    // Identify color based on series
                    let trackColor = '#06FF4F';
                    if (seriesToTrack === this.series.shares) trackColor = '#a49393';
                    else if (seriesToTrack === this.series.super) trackColor = '#9C27B0';
                    else if (seriesToTrack !== this.series.total) {
                        const catId = Object.keys(this.categorySeries).find(cid => this.categorySeries[cid] === seriesToTrack);
                        if (catId) trackColor = this._getCategoryColor(catId, 0);
                    }

                    // Re-create if parent series changed OR if color needs updating
                    if (this.scrubPriceLine._parentSeries !== seriesToTrack) {
                        if (this.scrubPriceLine._parentSeries) {
                            this.scrubPriceLine._parentSeries.removePriceLine(this.scrubPriceLine);
                        }
                        this.scrubPriceLine = seriesToTrack.createPriceLine({
                            price: price,
                            color: trackColor + '4D',
                            lineWidth: 1,
                            lineStyle: 0,
                            axisLabelVisible: true,
                            title: '',
                            axisLabelColor: trackColor,
                            axisLabelTextColor: '#000',
                        });
                        this.scrubPriceLine._parentSeries = seriesToTrack;
                        this.scrubPriceLine._lastColor = trackColor;
                    }

                    this.scrubPriceLine.applyOptions({
                        price: price,
                        visible: true
                    });
                }
            } else {
                if (this.scrubPriceLine) this.scrubPriceLine.applyOptions({ visible: false });
            }
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

        // Update Stats UI to match new visibility
        if (this.lastData) {
            this._updateStats(this.lastData.total, this.lastData.shares, this.lastData.super);
        }
    }

    async loadData() {
        const loading = document.getElementById('portfolio-chart-loading');
        if (loading) loading.style.display = 'flex';

        try {
            const rawShares = AppState.data.shares || [];
            const rawCash = AppState.data.cash || [];
            if (!AppState.user?.uid) return;

            // 1. Fetch Recorded History Snapshots (The "Real" Way)
            const snapshots = await userStore.getHistorySnapshots(AppState.user.uid);
            const startTs = this._getRangeStartTs();

            // 2. Prepare Data Series
            const totalData = [];
            const superData = [];
            const sharesData = [];
            const cashData = [];
            const catBuffers = {};

            // 3. Process Snapshots
            // Snapshots are indexed by timestamp. We sort and filter by visible window.
            const getSnapTs = (snap) => {
                if (snap.time) return Number(snap.time);
                if (snap.date) return Math.floor(new Date(snap.date).getTime() / 1000);
                if (snap.timestamp) return Math.floor(new Date(snap.timestamp).getTime() / 1000);
                return 0;
            };

            const sortedSnapshots = snapshots
                .filter(s => getSnapTs(s) >= startTs)
                .sort((a, b) => getSnapTs(a) - getSnapTs(b));

            sortedSnapshots.forEach(s => {
                const time = getSnapTs(s);
                totalData.push({ time, value: s.total });
                sharesData.push({ time, value: s.shares });
                superData.push({ time, value: s.super });
                cashData.push({ time, value: s.cash || 0 });

                // Categories
                if (s.categories) {
                    Object.keys(s.categories).forEach(cid => {
                        if (!catBuffers[cid]) catBuffers[cid] = [];
                        catBuffers[cid].push({ time, value: s.categories[cid] });
                    });
                }
            });

            // 4. Inject "LIVE" Point (Current State)
            // This ensures the graph always ends on the most recent known values
            const nowTs = Math.floor(Date.now() / 1000);

            // Calculate Current Totals
            let liveSharesVal = 0;
            let liveSuperVal = 0;
            let liveCashVal = 0;
            const liveCatVals = {};

            // Identify Super Watchlist
            const watchlists = AppState.data.watchlists || [];
            const superWatchlist = watchlists.find(w => (w.name || '').toLowerCase().includes('super'));
            const superWatchlistId = superWatchlist ? superWatchlist.id : null;

            // Deduplicate shares by ticker to match DataProcessor logic
            const dedupedSharesMap = new Map();
            rawShares.forEach(s => {
                if (AppState.hiddenAssets.has(String(s.id))) return;
                const units = parseFloat(s.portfolioShares) || parseFloat(s.units) || 0;
                if (units <= 0) return;

                const lookupKey = String(s.shareName || s.code || '').trim().toUpperCase();
                const existing = dedupedSharesMap.get(lookupKey);
                if (existing) {
                    existing.units += units;
                    // Merge watchlist IDs for super check
                    if (s.watchlistIds) {
                        existing.watchlistIds = [...new Set([...(existing.watchlistIds || []), ...s.watchlistIds])];
                    }
                } else {
                    dedupedSharesMap.set(lookupKey, {
                        units,
                        watchlistIds: s.watchlistIds || (s.watchlistId ? [s.watchlistId] : []),
                        shareName: lookupKey
                    });
                }
            });

            dedupedSharesMap.forEach(s => {
                const lookupKey = s.shareName;
                let priceData = AppState.livePrices.get(lookupKey);

                // Fallback: Try appending .AX if not found
                if (!priceData && !lookupKey.includes('.')) {
                    priceData = AppState.livePrices.get(lookupKey + '.AX');
                }
                // Fallback: Try stripping .AX if not found
                if (!priceData && lookupKey.endsWith('.AX')) {
                    priceData = AppState.livePrices.get(lookupKey.replace('.AX', ''));
                }

                const price = priceData?.live || 0;
                const val = s.units * price;
                if (val <= 0) return;

                liveSharesVal += val;
                const isSuper = (superWatchlistId && (s.watchlistIds || []).includes(superWatchlistId));
                if (isSuper) liveSuperVal += val;
            });

            // Initialize liveCatVals for all known categories (to ensure they exist for the breakdown toggles)
            Object.keys(this._getCashByCategory()).forEach(cid => {
                liveCatVals[cid] = 0;
            });

            rawCash.forEach(c => {
                // Filter out hidden cash to match CashController logic
                if (AppState.hiddenAssets.has(String(c.id))) return;

                // CRITICAL FIX: Exclude 'shares' category from cash summation in the chart.
                // Reasoning: The chart already calculates 'liveSharesVal' from the actual stock collection (rawShares).
                // Users often have a 'Shares' asset in their cash list as a placeholder/duplicate.
                if (c.category === 'shares') return;

                const bal = parseFloat(c.balance || 0);
                const cid = c.category || 'other';
                liveCashVal += bal;
                if (cid === 'super') liveSuperVal += bal;
                liveCatVals[cid] = (liveCatVals[cid] || 0) + bal;
            });

            const liveTotalVal = liveSharesVal + liveCashVal;

            // Only add live point if it's newer than the last snapshot OR if no snapshots exist
            const lastSnapUnix = sortedSnapshots.length > 0 ? getSnapTs(sortedSnapshots[sortedSnapshots.length - 1]) : 0;

            if (nowTs > lastSnapUnix + 300) { // 5 min grace
                totalData.push({ time: nowTs, value: liveTotalVal });
                sharesData.push({ time: nowTs, value: liveSharesVal });
                superData.push({ time: nowTs, value: liveSuperVal });
                cashData.push({ time: nowTs, value: liveCashVal });

                Object.keys(liveCatVals).forEach(cid => {
                    if (!catBuffers[cid]) catBuffers[cid] = [];
                    catBuffers[cid].push({ time: nowTs, value: liveCatVals[cid] });
                });
            }

            // 5. Push to Series
            if (this.series.total) this.series.total.setData(totalData);
            if (this.series.super) this.series.super.setData(superData);
            if (this.series.shares) this.series.shares.setData(sharesData);

            // 6. Breakdown Series
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

            // 7. Markers logic handled in _updateStats -> _updateMarkers

            if (this.chart) this.chart.timeScale().fitContent();
            
            // Store for UI updates (like toggles)
            this.lastData = { total: totalData, shares: sharesData, super: superData };

            // Pass visible series to stats updater for High/Low calculations
            this._updateStats(totalData, sharesData, superData);

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
            case '3y': return now - (3 * 365 * day);
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

        // 1. Accumulate balances ONLY from categories that actually have assets
        // This avoids cluttering the history menu with unused defaults like 'Crypto' or 'Property'
        cash.forEach(item => {
            if (item.category === 'shares') return;
            if (item.category === 'super') return; // Super is handled as a primary series

            const cid = item.category || 'cash';
            map[cid] = (map[cid] || 0) + (parseFloat(item.balance) || 0);
        });

        return map;
    }

    _getCategoryLabel(catId) {
        if (!catId) return 'Cash';

        // 1. Check User-Defined Categories first (Exact ID match)
        if (AppState.preferences.userCategories) {
            const ucat = AppState.preferences.userCategories.find(c => c && c.id === catId);
            if (ucat) return ucat.label;
        }

        // 2. Check System Registry
        const sys = CASH_CATEGORIES.find(c => c && c.id === catId);
        if (sys) return sys.label;

        // 3. Intelligent Fallback:
        // If it's a user category or custom ID not in registry, clean it up visually.
        // matches the design logic in CashViewRenderer.
        const label = catId.replace(/^user_/i, '').replace(/_/g, ' ');
        if (!label || label.toLowerCase() === 'asset') return 'Other Asset';

        return label.charAt(0).toUpperCase() + label.slice(1);
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

    _updateStats(totalData, sharesData = [], superData = []) {
        if (!totalData || totalData.length === 0) return;

        // 1. Update Header Summary (Based on Total)
        const first = totalData[0].value;
        const last = totalData[totalData.length - 1].value;
        const change = last - first;
        const pctChange = first !== 0 ? (change / first) * 100 : 0;

        const statsEl = this.modal.querySelector('.chart-stats-summary');
        if (statsEl) {
            const sign = pctChange >= 0 ? '+' : '';
            const color = pctChange >= 0 ? '#06FF4F' : '#FF3131';

            statsEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="font-size: 1.3rem; font-weight: 900; color: #fff; line-height: 1.1;">$${Math.floor(last).toLocaleString('en-AU')}</div>
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                        <span style="font-size: 0.85rem; font-weight: 800; color: ${color};">${sign}${pctChange.toFixed(2)}%</span>
                        <span style="font-size: 0.7rem; opacity: 0.5; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Performance</span>
                    </div>
                </div>
            `;
        }

        // 2. Markers for High/Low (On the Chart)
        this._updateMarkers(totalData, sharesData, superData);

        // 2. Update High/Low Innovative Stats Row
        const highLowRow = this.modal.querySelector('.high-low-row');
        if (!highLowRow) return;

        const renderRangeStat = (label, data, color) => {
            if (!data || data.length === 0) return '';
            const values = data.map(d => d.value);
            const high = Math.max(...values);
            const low = Math.min(...values);
            const current = data[data.length - 1].value;
            
            // Calculate relative position for the progress bar
            const range = high - low;
            const progress = range !== 0 ? ((current - low) / range) * 100 : 100;

            return `
                <div style="display:flex; flex-direction:column; gap:4px; flex-shrink: 0; min-width: 140px; padding: 6px 0;">
                    <div style="display:flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                        <span style="font-size: 0.65rem; color: ${color}; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">${label}</span>
                        <span style="font-size: 0.75rem; font-weight: 800; color: #fff;">$${Math.floor(current).toLocaleString('en-AU')}</span>
                    </div>
                    <div style="height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; position: relative;">
                        <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${progress}%; background: ${color}; opacity: 0.4; border-radius: 2px;"></div>
                        <div style="position: absolute; left: calc(${progress}% - 1px); top: -2px; width: 2px; height: 7px; background: #fff; box-shadow: 0 0 4px ${color}; z-index: 2;"></div>
                    </div>
                    <div style="display:flex; justify-content: space-between; font-size: 0.65rem; font-weight: 900; margin-top: 4px; gap: 8px;">
                        <span style="background: rgba(255, 49, 49, 0.1); color: #FF3131; padding: 2px 6px; border-radius: 4px; flex: 1; text-align: center; border: 1px solid rgba(255, 49, 49, 0.2);">L: $${Math.floor(low).toLocaleString('en-AU')}</span>
                        <span style="background: rgba(6, 255, 79, 0.1); color: #06FF4F; padding: 2px 6px; border-radius: 4px; flex: 1; text-align: center; border: 1px solid rgba(6, 255, 79, 0.2);">H: $${Math.floor(high).toLocaleString('en-AU')}</span>
                    </div>
                </div>
            `;
        };

        let html = '';
        if (this.visibleLayers.total) html += renderRangeStat('Total', totalData, '#06FF4F');
        if (this.visibleLayers.super) html += renderRangeStat('Super', superData, '#9C27B0');
        if (this.visibleLayers.shares) html += renderRangeStat('Shares', sharesData, '#a49393');

        highLowRow.innerHTML = html;
        highLowRow.style.display = html ? 'flex' : 'none';
        
        // Ensure standard flex centering if only one or two items
        const itemCount = (html.match(/min-width: 140px/g) || []).length;
        highLowRow.style.justifyContent = itemCount > 2 ? 'flex-start' : 'center';
    }

    /**
     * Identifies High/Low points in the data and adds markers to the chart.
     */
    _updateMarkers(totalData, sharesData, superData) {
        // Identify which series should receive markers (Priority: Total > Shares > Super)
        let primaryData = null;
        let primarySeries = null;

        if (this.visibleLayers.total) {
            primaryData = totalData;
            primarySeries = this.series.total;
        } else if (this.visibleLayers.shares) {
            primaryData = sharesData;
            primarySeries = this.series.shares;
        } else if (this.visibleLayers.super) {
            primaryData = superData;
            primarySeries = this.series.super;
        } else {
            // Check categories
            const activeCatId = Object.keys(this.categorySeries).find(cid => this.visibleLayers[`cat_${cid}`]);
            if (activeCatId) {
                primarySeries = this.categorySeries[activeCatId];
                // We'd need to fetch the actual data for this category, but usually users care about the main 3.
                // For now, we skip markers for minor categories to keep it clean.
            }
        }

        if (!primarySeries || !primaryData || primaryData.length === 0) return;

        // Clear markers from all potential series to avoid ghost markers when toggling layers
        Object.values(this.series).forEach(s => s && s.setMarkers([]));
        Object.values(this.categorySeries).forEach(s => s && s.setMarkers([]));

        const values = primaryData.map(d => d.value);
        const highVal = Math.max(...values);
        const lowVal = Math.min(...values);

        // Find indices (last occurrence to prioritize recent data if equal)
        const highIdx = primaryData.findLastIndex(d => d.value === highVal);
        const lowIdx = primaryData.findLastIndex(d => d.value === lowVal);

        const markers = [];
        const formatDate = (ts) => {
            const d = new Date(ts * 1000);
            return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        };

        // 1. High Marker
        markers.push({
            time: primaryData[highIdx].time,
            position: 'aboveBar',
            color: '#06FF4F', // Standard High Green
            shape: 'arrowDown',
            text: `High: ${formatDate(primaryData[highIdx].time)}`,
            size: 1.5
        });

        // 2. Low Marker
        markers.push({
            time: primaryData[lowIdx].time,
            position: 'belowBar',
            color: '#FF3131', // Standard Low Red
            shape: 'arrowUp',
            text: `Low: ${formatDate(primaryData[lowIdx].time)}`,
            size: 1.5
        });

        // 3. LIVE Marker (Pink)
        // Only add if it doesn't overlap perfectly with high or low
        const lastPoint = primaryData[primaryData.length - 1];
        if (highIdx !== primaryData.length - 1 && lowIdx !== primaryData.length - 1) {
            markers.push({
                time: lastPoint.time,
                position: 'aboveBar',
                color: '#e91e63',
                shape: 'arrowDown',
                text: 'LIVE'
            });
        }

        // Sort markers by time (Lightweight Charts requirement)
        markers.sort((a, b) => a.time - b.time);
        
        primarySeries.setMarkers(markers);
    }
}
