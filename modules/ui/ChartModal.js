import { formatCurrency } from '../utils/formatters.js';
import { UI_ICONS, CSS_CLASSES, IDS, KANGAROO_ICON_SRC } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * Reusable Chart Component
 * Can be rendered in a Modal or inline.
 */
export class ChartComponent {
    constructor(container, code, name) {
        this.container = container;
        this.code = code;
        this.name = name;
        this.chart = null;
        this.series = null;
        this.lastPriceLine = null; // Track price line to prevent duplicates
        this.currentRange = '1y'; // Default
        this.currentStyle = localStorage.getItem('asx_chart_style') || 'candle'; // Persist choice
        this.cachedData = null; // Store data to allow instant style switching
        this.resizeObserver = null;

        this.init();
    }

    init() {
        // 1. Inject Styles if not present
        if (!document.getElementById('chart-component-styles')) {
            const style = document.createElement('style');
            style.id = 'chart-component-styles';
            style.textContent = `
                .${CSS_CLASSES.CHART_WRAPPER} {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    background: var(--card-bg);
                    position: relative;
                }
                .${CSS_CLASSES.CHART_CANVAS_CONTAINER} {
                    flex: 1;
                    width: 100%;
                    min-height: 250px; /* Ensure visibility inline */
                    position: relative;
                    background: #111;
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                    touch-action: pan-y; /* Allow vertical scroll gesture to bubble up to page */
                }
                .${CSS_CLASSES.CHART_CONTROLS} {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    padding: 6px 8px;
                    background: var(--card-bg);
                    border-top: 1px solid var(--border-color);
                    justify-content: center;
                    align-items: center;
                }
                /* Timeframe row - always centered */
                .chart-timeframe-row {
                    display: flex;
                    gap: 2px;
                    justify-content: center;
                    align-items: center;
                    flex-wrap: wrap;
                }
                /* Second row - style and zoom */
                .chart-style-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                /* Landscape: single line layout */
                @media (orientation: landscape) {
                    .chart-style-row {
                        width: auto;
                        justify-content: center;
                        gap: 6px;
                    }
                    .chart-controls-separator-portrait {
                        display: none;
                    }
                }
                /* Portrait: two row layout */
                @media (orientation: portrait) {
                    .chart-timeframe-row {
                        width: 100% !important;
                    }
                    .chart-style-row {
                        width: 100% !important;
                        margin-top: 2px;
                    }
                    .chart-controls-separator-landscape {
                        display: none !important;
                    }
                }
                .${CSS_CLASSES.CHART_BTN} {
                    background: transparent;
                    border: none;
                    color: #ffffff;
                    padding: 4px 6px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .${CSS_CLASSES.CHART_BTN}:hover {
                    color: var(--text-color);
                }
                .${CSS_CLASSES.CHART_BTN}.active {
                    background: transparent;
                    color: var(--color-accent);
                    font-weight: 800;
                }
                /* Style Dropdown */
                .${CSS_CLASSES.CHART_SELECT} {
                    background: transparent;
                    border: none;
                    color: var(--color-accent);
                    padding: 4px 2px; 
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    outline: none;
                    text-align: center;
                }
                .${CSS_CLASSES.CHART_SELECT}:hover, .${CSS_CLASSES.CHART_SELECT}:focus {
                    color: var(--color-accent);
                }
                /* Period Stats (High/Low) */
                .chart-period-stats {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-right: auto;
                    white-space: nowrap;
                    opacity: 0.9;
                }
                /* Period Stats Overlay (inside chart) */
                .chart-period-overlay {
                    position: absolute;
                    top: 8px;
                    left: 8px;
                    font-size: 0.75rem;
                    background: rgba(17, 17, 17, 0.75);
                    padding: 4px 8px;
                    border-radius: 4px;
                    z-index: 5;
                    pointer-events: none;
                    white-space: nowrap;
                }

                .${CSS_CLASSES.CHART_OVERLAY_LOADER} {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10;
                    color: white;
                    display: none;
                }
                /* Fullscreen Zoom Mode - uses inset anchoring, no viewport units */
                .chart-fullscreen {
                    position: fixed !important;
                    inset: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    z-index: 9999 !important;
                    background: var(--card-bg) !important;
                    border-radius: 0 !important;
                    margin: 0 !important;
                    max-width: none !important;
                    max-height: none !important;
                    overflow: hidden !important;
                }
                /* Parent modal adjustments when content is fullscreen */
                .chart-modal-fullscreen {
                    align-items: stretch !important;
                    justify-content: stretch !important;
                }
                /* Orientation specific header adjustments */
                @media (orientation: landscape) {
                    .chart-modal-header {
                        padding: 4px 16px !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // 2. Build DOM
        this.container.innerHTML = `
            <div class="${CSS_CLASSES.CHART_WRAPPER}">
                <div class="${CSS_CLASSES.CHART_CANVAS_CONTAINER}" id="chartCanvas_${this.code}">
                    <div class="${CSS_CLASSES.CHART_OVERLAY_LOADER}">
                        <i class="fas fa-spinner fa-spin fa-2x"></i>
                    </div>
                    <div class="chart-period-overlay" id="chartPeriodStats_${this.code}">
                        <span class="chart-period-low" style="color:#ffffff;">L: --</span>
                        <span class="chart-period-high" style="color:#ffffff; margin-left:8px;">H: --</span>
                    </div>
                </div>
                <div class="${CSS_CLASSES.CHART_CONTROLS}">
                    <div class="chart-timeframe-row">
                        ${this._renderRangeButtons()}
                    </div>
                    <span class="chart-controls-separator-landscape" style="font-size:0.8rem; color:var(--border-color); margin:0 6px;">|</span>
                    <div class="chart-style-row">
                        <select class="${CSS_CLASSES.CHART_SELECT}" id="${IDS.CHART_STYLE_SELECT}" title="Chart Style">
                            <option value="candle">Candles</option>
                            <option value="bar">Bars</option>
                            <option value="line">Line</option>
                            <option value="area">Area</option>
                        </select>
                        <button id="${IDS.CHART_ROTATOR}" class="${CSS_CLASSES.CHART_BTN}" title="Fullscreen"><i class="fas fa-expand"></i></button>
                    </div>
                </div>
            </div>
        `;

        // 3. Init Library
        this.initChart();

        // 4. Bind Events
        // Range Buttons
        this.container.querySelectorAll('[data-range]').forEach(btn => {
            btn.addEventListener('click', (e) => this.setRange(e.target.dataset.range));
        });

        // Style Selector
        const select = this.container.querySelector(`#${IDS.CHART_STYLE_SELECT}`);
        select.value = this.currentStyle; // Set initial value
        select.addEventListener('change', (e) => this.setStyle(e.target.value));

        // 5. Initial Load
        this.load(this.currentRange);
    }

    _renderRangeButtons() {
        // Updated Ranges: 1D, 5D, 1M, ..., 10Y, Max
        const ranges = ['1d', '5d', '1m', '3m', '6m', '1y', '5y', '10y', 'max'];
        return ranges.map(r =>
            `<button class="${CSS_CLASSES.CHART_BTN} ${this.currentRange === r ? 'active' : ''}" data-range="${r}">${r.toUpperCase()}</button>`
        ).join('');
    }

    initChart() {
        const div = this.container.querySelector(`.${CSS_CLASSES.CHART_CANVAS_CONTAINER}`);
        if (typeof LightweightCharts === 'undefined') {
            div.innerHTML = '<div style="color:red; padding:20px;">Chart library not loaded</div>';
            return;
        }

        this.chart = LightweightCharts.createChart(div, {
            layout: {
                background: { type: 'solid', color: '#111' },
                textColor: '#DDD',
            },
            grid: { vertLines: { color: '#333' }, horzLines: { color: '#333' } },
            width: div.clientWidth,
            height: div.clientHeight,
            handleScroll: {
                vertTouchDrag: false, // Allow page scroll on mobile touch-drag
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#333',
                rightOffset: 0,
                fixLeftEdge: true,
                fixRightEdge: true,
            },
            rightPriceScale: {
                borderColor: '#333',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            crosshair: {
                // "No background selection" - match chart bg or transparent
                vertLine: {
                    color: '#a49393', // Accent Line
                    labelBackgroundColor: '#111', // Match bg to hide "box" feel
                    labelFontColor: '#a49393', // Accent Text
                },
                horzLine: {
                    color: '#a49393',
                    labelBackgroundColor: '#111',
                    labelFontColor: '#a49393',
                },
            },
        });

        // Initial Series Creation
        this._createSeries(this.currentStyle);

        // Resize Observer
        this.resizeObserver = new ResizeObserver(entries => {
            if (!entries[0] || !entries[0].contentRect) return;
            const { width, height } = entries[0].contentRect;
            if (this.chart) this.chart.applyOptions({ width, height });
        }).observe(div);
    }

    /**
     * Creates the specific series type and applies internal reference.
     * @param {string} type 'candle' | 'bar' | 'line' | 'area'
     */
    _createSeries(type) {
        if (!this.chart) return;

        // Remove old if exists
        if (this.series) {
            this.chart.removeSeries(this.series);
            this.lastPriceLine = null;
        }

        // Theme Colors
        const UP_COLOR = '#06FF4F';
        const DOWN_COLOR = '#FF3131';
        const ACCENT_COLOR = '#a49393'; // Coffee

        // Initial / Default Colors for Area/Line (Coffee)
        // These will be overridden by _updateSeriesColor based on data direction
        const DEFAULT_LINE_COLOR = ACCENT_COLOR;
        const DEFAULT_TOP_COLOR = 'rgba(164, 147, 147, 0.4)';
        const DEFAULT_BOTTOM_COLOR = 'rgba(164, 147, 147, 0)';

        switch (type) {
            case 'bar':
                this.series = this.chart.addBarSeries({
                    upColor: UP_COLOR, downColor: DOWN_COLOR,
                    lastValueVisible: false, // Custom PriceLine used instead
                    priceLineVisible: false,
                });
                break;
            case 'line':
            case 'area':
                // User Request: "Line" should now be a filled area with gradient
                // We use AreaSeries for both 'line' and 'area' to support the gradient fill.
                this.series = this.chart.addAreaSeries({
                    topColor: DEFAULT_TOP_COLOR,
                    bottomColor: DEFAULT_BOTTOM_COLOR,
                    lineColor: DEFAULT_LINE_COLOR,
                    lineWidth: 2,
                    lastValueVisible: false,
                    priceLineVisible: false,
                });
                break;
            case 'candle':
            default:
                this.series = this.chart.addCandlestickSeries({
                    upColor: UP_COLOR, downColor: DOWN_COLOR,
                    borderVisible: false, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR,
                    lastValueVisible: false,
                    priceLineVisible: false,
                });
                break;
        }
    }

    _updateLastPriceLine(data) {
        if (!this.series || !data || data.length === 0) return;

        // Find last item
        const last = data[data.length - 1];
        const price = (last.close !== undefined) ? last.close : (last.value !== undefined ? last.value : null);

        if (price === null) return;

        // Remove old if exists to prevent duplication
        if (this.lastPriceLine) {
            this.series.removePriceLine(this.lastPriceLine);
        }

        // Create Price Line
        // We simulate transparent BG by using Chart BG color #111
        // Text Color = Accent #a49393
        this.lastPriceLine = this.series.createPriceLine({
            price: price,
            color: '#a49393', // Line color (Coffee)
            lineWidth: 1,
            lineStyle: 1, // Dotted
            axisLabelVisible: true,
            title: '',
            axisLabelColor: '#111', // Background (matches chart)
            axisLabelTextColor: '#a49393', // Text (Coffee)
        });
    }

    setStyle(newStyle) {
        if (this.currentStyle === newStyle) return;
        this.currentStyle = newStyle;
        localStorage.setItem('asx_chart_style', newStyle); // Persist

        // Swapping series requires re-setting data
        this._createSeries(newStyle);

        if (this.cachedData && this.series) {
            let dataToSet = this.cachedData;

            if (newStyle === 'line' || newStyle === 'area') {
                dataToSet = this.cachedData.map(d => ({
                    time: d.time,
                    value: d.close
                }));
            }

            this.series.setData(dataToSet);
            this._updateLastPriceLine(dataToSet);
            // Apply Dynamic Color for Area/Line
            if (newStyle === 'line' || newStyle === 'area') {
                this._updateSeriesColor(this.cachedData);
            }
        }
    }

    async load(range) {
        this.currentRange = range;
        this._updateButtons();

        const loader = this.container.querySelector(`.${CSS_CLASSES.CHART_OVERLAY_LOADER}`);
        if (loader) loader.style.display = 'flex';

        try {
            const api = AppState.controller.dataService;
            if (!api) throw new Error('DataService not ready');

            const res = await api.fetchHistory(this.code, range);
            if (res && res.ok && res.data) {
                this.cachedData = res.data; // Store for style switching

                // Set data based on current style
                // Set data based on current style
                if (this.chart && this.series) {
                    let dataToSet = this.cachedData;
                    if (this.currentStyle === 'line' || this.currentStyle === 'area') {
                        dataToSet = this.cachedData.map(d => ({
                            time: d.time,
                            value: d.close
                        }));
                    }
                    try {
                        this.series.setData(dataToSet);
                        this._updateLastPriceLine(dataToSet);
                        this._updatePeriodStats(this.cachedData);

                        // Apply Dynamic Colors if Line/Area
                        if (this.currentStyle === 'line' || this.currentStyle === 'area') {
                            this._updateSeriesColor(this.cachedData);
                        }

                        if (this.chart) this.chart.timeScale().fitContent();
                    } catch (err) {
                        console.warn('Error updating chart data:', err);
                    }
                }
            } else {
                console.warn('Chart load failed:', res);
            }
        } catch (e) {
            console.error('Chart load error:', e);
        } finally {
            if (loader) loader.style.display = 'none';
        }
    }

    setRange(range) {
        // Just wrapper for load
        this.load(range);
    }

    /**
     * Updates the Series color (for Line/Area) based on data trend (Start vs End).
     * @param {Array} data - Full OHLC data array
     */
    _updateSeriesColor(data) {
        if (!data || data.length < 2 || !this.series) return;

        // Ensure we are in a mode that supports these options
        if (this.currentStyle !== 'line' && this.currentStyle !== 'area') return;

        const first = data[0].close;
        const last = data[data.length - 1].close;
        const isPositive = last >= first;

        // Constants
        const COLOR_UP = '#06FF4F';
        const COLOR_DOWN = '#FF3131';
        const COLOR_COFFEE = '#a49393';

        // Choose base color
        const baseColor = isPositive ? COLOR_UP : COLOR_DOWN;

        // Apply visual settings
        // Gradient: 0.4 opacity at top -> 0 opacity at bottom
        const rgb = isPositive ? '6, 255, 79' : '255, 49, 49';

        this.series.applyOptions({
            lineColor: baseColor,
            topColor: `rgba(${rgb}, 0.5)`,
            bottomColor: `rgba(${rgb}, 0.0)`,
            // Optional: You could update price line color too if desired, keeping it Coffee or matching
        });
    }

    _updateButtons() {
        this.container.querySelectorAll('[data-range]').forEach(btn => {
            if (btn.dataset.range === this.currentRange) btn.classList.add(CSS_CLASSES.ACTIVE);
            else btn.classList.remove(CSS_CLASSES.ACTIVE);
        });
    }

    /**
     * Calculate and display the period high/low from loaded candle data.
     * @param {Array} data - Array of candle objects with high/low values
     */
    _updatePeriodStats(data) {
        const statsEl = this.container.querySelector(`#chartPeriodStats_${this.code}`);
        if (!statsEl) return;

        const highEl = statsEl.querySelector('.chart-period-high');
        const lowEl = statsEl.querySelector('.chart-period-low');

        if (!data || data.length === 0) {
            if (highEl) highEl.textContent = 'H: --';
            if (lowEl) lowEl.textContent = 'L: --';
            return;
        }

        let periodHigh = -Infinity;
        let periodLow = Infinity;

        for (const candle of data) {
            const h = candle.high !== undefined ? candle.high : candle.close;
            const l = candle.low !== undefined ? candle.low : candle.close;
            if (h > periodHigh) periodHigh = h;
            if (l < periodLow) periodLow = l;
        }

        // Format with appropriate decimal places
        const formatPrice = (val) => {
            if (val >= 1) return '$' + val.toFixed(2);
            return '$' + val.toFixed(4);
        };

        if (highEl) highEl.textContent = 'H: ' + formatPrice(periodHigh);
        if (lowEl) lowEl.textContent = 'L: ' + formatPrice(periodLow);
    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.container.innerHTML = '';
    }
}

/**
 * Modal Wrapper
 */
export class ChartModal {
    static async show(code, name) {
        // Remove existing
        const existing = document.getElementById(IDS.CHART_MODAL);
        if (existing) existing.remove();

        // 1. Create Modal Container - using unique chart-modal class to avoid global modal CSS conflicts
        const modal = document.createElement('div');
        modal.id = IDS.CHART_MODAL;
        modal.className = CSS_CLASSES.CHART_MODAL; // NOT using 'modal' class to avoid global CSS !important rules

        // App-specific overrides to make it feel like "App Store" fullscreen
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 20001;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.CHART_MODAL_CONTENT}" style="width: 95%; height: 85%; max-width: 900px; display:flex; flex-direction:column; background:var(--card-bg); border-radius:12px; overflow:hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                <!-- Header -->
                <div class="chart-modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:8px 16px; border-bottom:1px solid var(--border-color);">
                    <div class="card-code-pill" style="background: none; border: none; padding: 0; gap: 8px; display: inline-flex; align-items: center;">
                        <img src="https://files.marketindex.com.au/xasx/96x96-png/${code.toLowerCase()}.png" class="favicon-icon" style="width: 20px; height: 20px;" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                        <h3 style="margin:0; font-size:1.2rem; font-weight:700;">${code}</h3>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <button id="${IDS.CHART_MODAL_CLOSE}" class="${CSS_CLASSES.CHART_BTN}" style="border:none; font-size:1.2rem;"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <!-- Chart Component Host -->
                <div id="${IDS.MODAL_CHART_BODY}" style="flex:1; position:relative; width:100%; overflow:hidden;"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // 2. Instantiate Chart
        const body = modal.querySelector(`#${IDS.MODAL_CHART_BODY}`);
        const chartComp = new ChartComponent(body, code, name);

        // 3. Event Handling
        let orientationHandler = null;

        const close = () => {
            // Clean up orientation listener
            if (orientationHandler) {
                window.removeEventListener('resize', orientationHandler);
                window.removeEventListener('orientationchange', orientationHandler);
                if (window.visualViewport) {
                    window.visualViewport.removeEventListener('resize', orientationHandler);
                }
            }
            chartComp.destroy();
            modal.remove();

            // Navigation Cleanup: If closed manually, sync history stack
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        };
        modal.querySelector(`#${IDS.CHART_MODAL_CLOSE}`).addEventListener('click', close);

        // Fullscreen - apply immediately when modal opens
        const rotator = chartComp.container.querySelector(`#${IDS.CHART_ROTATOR}`);
        const content = modal.querySelector(`.${CSS_CLASSES.CHART_MODAL_CONTENT}`);

        // Update zoom button for modal context (compress = close fullscreen)
        if (rotator) {
            rotator.title = 'Close';
            const icon = rotator.querySelector('i');
            if (icon) icon.className = 'fas fa-compress';
        }

        // Helper to resize chart - uses viewport dimensions for fullscreen
        const resizeChart = () => {
            if (chartComp.chart) {
                const div = chartComp.container.querySelector(`.${CSS_CLASSES.CHART_CANVAS_CONTAINER}`);
                const header = content.querySelector('div'); // First div is header
                const controls = chartComp.container.querySelector(`.${CSS_CLASSES.CHART_CONTROLS}`);
                if (div) {
                    void div.offsetHeight; // Force layout

                    // Use visualViewport if available (more reliable on mobile)
                    const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
                    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                    const headerHeight = header ? header.offsetHeight : 50;
                    const controlsHeight = controls ? controls.offsetHeight : 45;
                    const width = viewportWidth;
                    const height = viewportHeight - headerHeight - controlsHeight;

                    chartComp.chart.applyOptions({ width, height });
                    chartComp.chart.timeScale().fitContent();
                }
            }
        };

        // Apply fullscreen styles
        const applyFullscreen = () => {
            // Fullscreen the modal backdrop using inset: 0
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: var(--card-bg);
                z-index: 99999;
                display: flex;
                flex-direction: column;
                margin: 0;
                padding: 0;
                overflow: hidden;
            `;

            // Fullscreen the content using inset: 0
            content.style.cssText = `
                position: absolute;
                inset: 0;
                max-width: none;
                max-height: none;
                display: flex;
                flex-direction: column;
                background: var(--card-bg);
                border-radius: 0;
                margin: 0;
                overflow: hidden;
            `;
        };

        // Apply fullscreen immediately when modal opens
        applyFullscreen();

        // Resize chart with multiple delays to wait for layout to settle
        requestAnimationFrame(() => {
            resizeChart();
            setTimeout(resizeChart, 50);
            setTimeout(resizeChart, 150);
            setTimeout(resizeChart, 300);
            setTimeout(resizeChart, 500);
        });

        // Orientation change handler - always resize on any event
        orientationHandler = () => {
            applyFullscreen();
            resizeChart();
            setTimeout(() => { applyFullscreen(); resizeChart(); }, 100);
            setTimeout(() => { applyFullscreen(); resizeChart(); }, 300);
            setTimeout(() => { applyFullscreen(); resizeChart(); }, 500);
        };

        window.addEventListener('resize', orientationHandler);
        window.addEventListener('orientationchange', orientationHandler);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', orientationHandler);
        }

        // Zoom button closes the modal
        rotator.addEventListener('click', close);

        // --- Navigation Support ---
        // Register state so back button dismisses the chart
        modal._navActive = true;
        navManager.pushState(() => {
            if (document.contains(modal)) {
                modal._navActive = false;
                close();
            }
        });
    }
}

/**
 * Mini Chart Preview Component
 * Simplified, non-interactive 52-week line chart for the viewing modal.
 * Uses day sentiment colors (green/red) and opens full ChartModal on click.
 */
export class MiniChartPreview {
    constructor(container, code, name, dayChange = 0, onExpand = null, showScale = true, customColor = null) {
        this.container = container;
        this.code = code;
        this.name = name;
        this.dayChange = dayChange; // Used to determine line color
        this.onExpand = onExpand; // Callback when chart is clicked
        this.showScale = showScale; // Control price scale visibility
        this.customColor = customColor; // Override sentiment color
        this.chart = null;
        this.series = null;
        this.resizeObserver = null;

        this.init();
    }

    // ... (init method remains same)

    init() {
        // ... (styles injection remains same)
        // Inject mini chart specific styles if not present
        if (!document.getElementById('mini-chart-preview-styles')) {
            const style = document.createElement('style');
            style.id = 'mini-chart-preview-styles';
            style.textContent = `
                .mini-chart-container {
                    width: 100%;
                    height: 120px;
                    position: relative;
                    background: transparent;
                    border: 1px solid var(--color-accent);
                    border-radius: 0;
                    overflow: hidden;
                    touch-action: pan-y; /* Allow page scroll */
                    cursor: pointer;
                    transition: opacity 0.2s;
                }
                .mini-chart-container:hover {
                    opacity: 0.85;
                }
                .mini-chart-container:active {
                    opacity: 0.75;
                }
                .mini-chart-stats {
                    position: absolute;
                    top: 6px;
                    left: 8px;
                    font-size: 0.7rem;
                    background: transparent;
                    padding: 0;
                    z-index: 5;
                    pointer-events: none;
                    display: flex;
                    gap: 10px;
                }
                .mini-chart-container canvas,
                .mini-chart-container table {
                    pointer-events: none !important;
                }
                .mini-chart-loader {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: var(--text-muted);
                }
            `;
            document.head.appendChild(style);
        }

        // Build DOM
        this.container.innerHTML = `
            <div class="mini-chart-container" title="Tap to expand chart">
                <div class="mini-chart-stats">
                    <span class="mini-chart-low" style="color:#ffffff;">L: --</span>
                    <span class="mini-chart-high" style="color:#ffffff;">H: --</span>
                </div>
                <div class="mini-chart-loader"><i class="fas ${UI_ICONS.SPINNER} fa-spin"></i></div>
            </div>
        `;

        // Initialize chart
        this.initChart();

        // Bind click handler to container
        const chartContainer = this.container.querySelector('.mini-chart-container');
        if (chartContainer && this.onExpand) {
            chartContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onExpand();
            });
        }

        // Load 1-year data
        this.load();
    }

    initChart() {
        const div = this.container.querySelector('.mini-chart-container');
        if (typeof LightweightCharts === 'undefined') {
            div.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center; font-size:0.8rem;">Chart unavailable</div>';
            return;
        }

        this.chart = LightweightCharts.createChart(div, {
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#AAA',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false },
            },
            width: div.clientWidth,
            height: div.clientHeight,
            timeScale: {
                visible: false, // Hide time axis for clean look
                borderVisible: false,
            },
            rightPriceScale: {
                visible: this.showScale,
                borderVisible: false,
                scaleMargins: { top: 0.15, bottom: 0.15 },
            },
            crosshair: {
                mode: 0, // Disable crosshair (non-interactive)
            },
            handleScroll: false,
            handleScale: false,
        });

        // Create Area series (instead of Line) to support gradient fill
        // Default to Coffee, updated to Red/Green on load
        const lineColor = this.customColor || '#a49393';
        this.series = this.chart.addAreaSeries({
            topColor: 'rgba(164, 147, 147, 0.4)',
            bottomColor: 'rgba(164, 147, 147, 0)',
            lineColor: lineColor,
            lineWidth: 2,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
        });

        // Resize Observer
        this.resizeObserver = new ResizeObserver(entries => {
            if (!entries[0] || !entries[0].contentRect) return;
            const { width, height } = entries[0].contentRect;
            if (this.chart) this.chart.applyOptions({ width, height });
        });
        this.resizeObserver.observe(div);
    }

    async load(retries = 3) {
        const loader = this.container.querySelector('.mini-chart-loader');

        // Jitter: Add random delay (0-500ms) to scatter simultaneous requests (e.g. initial scroll)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500));

        try {
            const api = AppState.controller.dataService;
            if (!api) throw new Error('DataService not ready');

            const res = await api.fetchHistory(this.code, '1y');

            // Check specifically for valid data array
            if (res && res.ok && Array.isArray(res.data) && res.data.length > 0 && this.series) {
                // Convert to line data format
                const lineData = res.data.map(d => ({
                    time: d.time,
                    value: d.close
                }));

                this.series.setData(lineData);
                this._updateStats(res.data);

                // --- DYNAMIC COLOR UPDATE ---
                // Calculate trend from loaded data
                const first = res.data[0].close;
                const last = res.data[res.data.length - 1].close;
                const isPositive = last >= first;

                const rgb = isPositive ? '6, 255, 79' : '255, 49, 49';
                const baseColor = isPositive ? '#06FF4F' : '#FF3131';

                this.series.applyOptions({
                    lineColor: baseColor,
                    topColor: `rgba(${rgb}, 0.5)`,
                    bottomColor: `rgba(${rgb}, 0.0)`
                });
                // -----------------------------

                this.chart.timeScale().fitContent();

                // Hide loader only on success
                if (loader) loader.style.display = 'none';
            } else {
                console.warn('[MiniChartPreview] Invalid response debug:', { code: this.code, res });
                throw new Error('Invalid data response');
            }
        } catch (e) {
            console.warn(`[MiniChartPreview] Load error (${retries} retries left):`, e);
            if (retries > 0) {
                // Backoff retry: 1.5s, 3s, 4.5s
                const delay = (4 - retries) * 1500;
                setTimeout(() => this.load(retries - 1), delay);
            } else {
                // Final failure: Hide loader to keep UI clean
                if (loader) loader.style.display = 'none';
            }
        }
    }

    // ... (rest of file)

    _updateStats(data) {
        const highEl = this.container.querySelector('.mini-chart-high');
        const lowEl = this.container.querySelector('.mini-chart-low');

        if (!data || data.length === 0) return;

        let periodHigh = -Infinity;
        let periodLow = Infinity;

        for (const candle of data) {
            const h = candle.high !== undefined ? candle.high : candle.close;
            const l = candle.low !== undefined ? candle.low : candle.close;
            if (h > periodHigh) periodHigh = h;
            if (l < periodLow) periodLow = l;
        }

        const formatPrice = (val) => {
            if (val >= 1) return '$' + val.toFixed(2);
            return '$' + val.toFixed(4);
        };

        if (highEl) highEl.textContent = 'H: ' + formatPrice(periodHigh);
        if (lowEl) lowEl.textContent = 'L: ' + formatPrice(periodLow);
    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.container.innerHTML = '';
    }
}
