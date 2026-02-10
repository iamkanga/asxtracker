
import { AppState } from '../state/AppState.js';
import { EVENTS } from '../utils/AppConstants.js';

/**
 * Lightweight SVG Sparkline Component
 * Optimized for performance in scrolling lists (Portfolio Cards).
 * Replaces the heavy Canvas/WebGL based MiniChartPreview.
 */
export class SparklinePreview {
    /**
     * @param {HTMLElement} container - The DOM element to render into
     * @param {string} code - ASX Code
     * @param {string} name - Company Name
     * @param {number} dayChange - Current change (used for fallback color)
     * @param {Function} onExpand - Callback when clicked
     * @param {boolean} showScale - (Ignored for sparkline, kept for API compatibility)
     * @param {string} customColor - Optional specific color override
     */
    constructor(container, code, name, dayChange = 0, onExpand = null, showScale = false, customColor = null) {
        this.container = container;
        this.code = code;
        this.name = name;
        this.dayChange = dayChange;
        this.onExpand = onExpand;
        this.customColor = customColor || '#a49393'; // Default Coffee

        this.init();
    }

    init() {
        const gradId = `grad_${this.code}_${Math.random().toString(36).substr(2, 9)}`;
        // Create SVG container
        this.container.innerHTML = `
            <div class="sparkline-wrapper" style="width:100%; height:100%; position:relative; overflow:hidden; cursor:pointer;">
                <svg preserveAspectRatio="none" style="width:100%; height:100%; display:block; opacity:0; transition:opacity 0.3s ease;">
                    <defs>
                        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:currentColor; stop-opacity:0.5" />
                            <stop offset="100%" style="stop-color:currentColor; stop-opacity:0" />
                        </linearGradient>
                    </defs>
                    <path class="spark-area" d="" fill="url(#${gradId})" stroke="none" />
                    <path class="spark-line" d="" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
                </svg>
            </div>
        `;

        // Bind Click
        const wrapper = this.container.querySelector('.sparkline-wrapper');
        if (this.onExpand) {
            wrapper.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onExpand();
            });
        }

        this.load();
    }

    async load() {
        try {
            const api = AppState.controller.dataService;
            if (!api) return;

            // Fetch History (Uses localStorage cache automatically from DataService)
            // We use '1y' as standard for portfolio bg
            const res = await api.fetchHistory(this.code, '1y');

            if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
                this.render(res.data);
            }
        } catch (e) {
            console.warn(`[Sparkline] Failed to load for ${this.code}`, e);
        }
    }

    render(data) {
        const svg = this.container.querySelector('svg');
        if (!svg) return;

        // 1. Process Data
        // Extract close prices/values
        const prices = data.map(d => d.close !== undefined ? d.close : d.value);

        // Find Range
        let min = Infinity;
        let max = -Infinity;
        for (let p of prices) {
            if (p < min) min = p;
            if (p > max) max = p;
        }

        // Avoid division by zero
        if (min === max) {
            max += 0.01;
            min -= 0.01;
        }

        const range = max - min;
        const width = 100; // viewBox units
        const height = 100; // viewBox units

        // 2. Determine Color Trend
        const first = prices[0];
        const last = prices[prices.length - 1];
        const isPositive = last >= first;

        const color = isPositive ? '#06FF4F' : '#FF3131'; // Green : Red
        svg.style.color = color; // Used by currentColor in SVG

        // 3. Generate Path
        // Map points to 0-100 coordinate space
        // Y is inverted in SVG (0 is top)
        // Matches LightweightCharts scaleMargins: { top: 0.15, bottom: 0.15 }
        const step = width / (prices.length - 1);

        const pathPoints = prices.map((p, i) => {
            const x = i * step;
            // Normalized 0 to 1
            const normalized = (p - min) / range;
            // Invert Y and scale to height (70% usage, 15% padding top)
            const y = height - (normalized * (height * 0.7) + (height * 0.15));
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });

        // Line Path
        const lineD = 'M ' + pathPoints.join(' L ');

        // Area Path (Close the loop to bottom right -> bottom left -> start)
        const areaD = `${lineD} L ${width},${height} L 0,${height} Z`;

        // 4. Update DOM
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.querySelector('.spark-line').setAttribute('d', lineD);
        svg.querySelector('.spark-area').setAttribute('d', areaD);

        // Fade In
        svg.style.opacity = '1';
    }
}
