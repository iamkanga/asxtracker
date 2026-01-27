import { formatCurrency } from '../utils/formatters.js';
import { UI_ICONS, CSS_CLASSES, IDS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';

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
                .chart-wrapper {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    background: var(--card-bg);
                    position: relative;
                }
                .chart-canvas-container {
                    flex: 1;
                    width: 100%;
                    min-height: 250px; /* Ensure visibility inline */
                    position: relative;
                    background: #111;
                }
                .chart-controls {
                    display: flex;
                    flex-wrap: wrap; 
                    gap: 6px;
                    padding: 8px;
                    background: var(--card-bg);
                    border-top: 1px solid var(--border-color);
                    justify-content: center;
                    align-items: center;
                }
                .chart-btn {
                    background: transparent;
                    border: none;
                    color: #ffffff;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .chart-btn:hover {
                    color: var(--text-color);
                }
                .chart-btn.active {
                    background: transparent;
                    color: var(--color-accent);
                    font-weight: 800;
                }
                /* Style Dropdown */
                .chart-select {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    padding: 4px 2px; 
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    outline: none;
                    text-align: center;
                }
                .chart-select:hover, .chart-select:focus {
                    color: var(--color-accent);
                }

                .chart-overlay-loader {
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
                /* Rotated Landscape Mode */
                .force-landscape {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vh !important;
                    height: 100vw !important;
                    transform: rotate(90deg) !important;
                    transform-origin: bottom left !important;
                    top: -100vw !important; 
                    left: 0 !important;
                    z-index: 9999 !important;
                    background: var(--card-bg) !important;
                    border-radius: 0 !important;
                    margin: 0 !important;
                    overflow: hidden !important;
                }
            `;
            document.head.appendChild(style);
        }

        // 2. Build DOM
        this.container.innerHTML = `
            <div class="chart-wrapper">
                <div class="chart-canvas-container" id="chartCanvas_${this.code}">
                    <div class="chart-overlay-loader">
                        <i class="fas fa-spinner fa-spin fa-2x"></i>
                    </div>
                </div>
                <div class="chart-controls">
                    ${this._renderRangeButtons()}
                    <span style="font-size:0.8rem; color:var(--border-color); margin:0 6px;">|</span>
                    <select class="chart-select" id="chartStyleSelect" title="Chart Style">
                        <option value="candle">🕯️ Candles</option>
                        <option value="bar">📊 Bars</option>
                        <option value="line">📈 Line</option>
                        <option value="area">🌊 Area</option>
                    </select>
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
        const select = this.container.querySelector('#chartStyleSelect');
        select.value = this.currentStyle; // Set initial value
        select.addEventListener('change', (e) => this.setStyle(e.target.value));

        // 5. Initial Load
        this.load(this.currentRange);
    }

    _renderRangeButtons() {
        // Updated Ranges: 1D, 5D, 1M, ..., Max
        const ranges = ['1d', '5d', '1m', '3m', '6m', '1y', '5y', 'max'];
        return ranges.map(r =>
            `<button class="chart-btn ${this.currentRange === r ? 'active' : ''}" data-range="${r}">${r.toUpperCase()}</button>`
        ).join('');
    }

    initChart() {
        const div = this.container.querySelector('.chart-canvas-container');
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
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#333',
            },
            rightPriceScale: {
                borderColor: '#333',
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
        }

        // Theme Colors
        const UP_COLOR = '#06FF4F';
        const DOWN_COLOR = '#FF3131';
        const ACCENT_COLOR = '#a49393'; // Coffee
        const ACCENT_TRANSPARENT = 'rgba(164, 147, 147, 0.4)';
        const ACCENT_ZERO = 'rgba(164, 147, 147, 0)';

        switch (type) {
            case 'bar':
                this.series = this.chart.addBarSeries({
                    upColor: UP_COLOR, downColor: DOWN_COLOR,
                    lastValueVisible: false, // Custom PriceLine used instead
                    priceLineVisible: false,
                });
                break;
            case 'line':
                this.series = this.chart.addLineSeries({
                    color: ACCENT_COLOR, lineWidth: 2,
                    lastValueVisible: false,
                    priceLineVisible: false,
                });
                break;
            case 'area':
                this.series = this.chart.addAreaSeries({
                    topColor: ACCENT_TRANSPARENT,
                    bottomColor: ACCENT_ZERO,
                    lineColor: ACCENT_COLOR,
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

        // Create Price Line
        // We simulate transparent BG by using Chart BG color #111
        // Text Color = Accent #a49393
        this.series.createPriceLine({
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
        }
    }

    async load(range) {
        this.currentRange = range;
        this._updateButtons();

        const loader = this.container.querySelector('.chart-overlay-loader');
        if (loader) loader.style.display = 'flex';

        try {
            const api = AppState.controller.dataService;
            if (!api) throw new Error('DataService not ready');

            const res = await api.fetchHistory(this.code, range);
            if (res && res.ok && res.data) {
                this.cachedData = res.data; // Store for style switching

                // Set data based on current style
                if (this.series) {
                    let dataToSet = this.cachedData;
                    if (this.currentStyle === 'line' || this.currentStyle === 'area') {
                        dataToSet = this.cachedData.map(d => ({
                            time: d.time,
                            value: d.close
                        }));
                    }
                    this.series.setData(dataToSet);
                    this._updateLastPriceLine(dataToSet);
                    this.chart.timeScale().fitContent();
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

    _updateButtons() {
        this.container.querySelectorAll('[data-range]').forEach(btn => {
            if (btn.dataset.range === this.currentRange) btn.classList.add('active');
            else btn.classList.remove('active');
        });
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
        const existing = document.getElementById('chartModal');
        if (existing) existing.remove();

        // 1. Create Modal Container
        const modal = document.createElement('div');
        modal.id = 'chartModal';
        modal.className = 'modal show'; // Using app standard modal class

        // App-specific overrides to make it feel like "App Store" fullscreen
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100vh;
            background: rgba(0,0,0,0.85); z-index: 2000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        modal.innerHTML = `
            <div class="modal-content" style="width: 95%; height: 85vh; max-width: 900px; display:flex; flex-direction:column; background:var(--card-bg); border-radius:12px; overflow:hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--border-color);">
                    <div>
                        <h3 style="margin:0; font-size:1.2rem; font-weight:700;">${code}</h3>
                        <span style="font-size:0.85rem; color:var(--text-muted);">${name || ''}</span>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <button id="chartRotator" class="chart-btn" title="Landscape"><i class="fas fa-expand"></i></button>
                        <button id="chartModalClose" class="chart-btn" style="border:none; font-size:1.2rem;"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <!-- Chart Component Host -->
                <div id="modalChartBody" style="flex:1; position:relative;"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // 2. Instantiate Chart
        const body = modal.querySelector('#modalChartBody');
        const chartComp = new ChartComponent(body, code, name);

        // 3. Event Handling
        const close = () => {
            chartComp.destroy();
            modal.remove();
        };
        modal.querySelector('#chartModalClose').addEventListener('click', close);

        // Rotation / Force Landscape
        const rotator = modal.querySelector('#chartRotator');
        rotator.addEventListener('click', () => {
            const content = modal.querySelector('.modal-content');
            content.classList.toggle('force-landscape');
        });
    }
}
