
import { AppState } from '../state/AppState.js';
import { EVENTS } from '../utils/AppConstants.js';
import { SparklineCache } from '../data/SparklineCache.js';

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

        this._hasRendered = false;

        // 1. Instant local render (Zero-blank-card): synchronous read from memory / localStorage
        this._tryInstantRender();

        // 2. Lifecycle load & update subscription
        this.load();
    }

    /**
     * Synchronous fast-path: immediately draws whatever historical points exist in memory or localStorage.
     * Prevents blank frames on initial paint before async microtasks resolve.
     */
    _tryInstantRender() {
        try {
            const cache = AppState.controller?.dataService?.sparklineCache;
            if (!cache) return;
            const instant = cache.peek(this.code);
            if (SparklineCache.hasData(instant)) {
                this.render(instant.closes);
            }
        } catch (e) {
            // Non-blocking fallback
        }
    }

    /**
     * CACHE-FIRST LOAD: paints instantly from SparklineCache (memory → IndexedDB).
     * Never awaits the network. If the cached record is stale/missing, it only *requests* a quiet
     * background refresh (post-close once per day policy, paced + deferred until after the 30s boot quiet period),
     * and repaints smoothly in place when SPARKLINE_UPDATED fires for this code.
     */
    async load() {
        try {
            const api = AppState.controller?.dataService;
            const cache = api?.sparklineCache;
            if (!api || !cache) return;

            // Bind updates so any background refresh triggers smooth in-place repaint
            this._bindUpdates();

            // If not already drawn by synchronous instant render, wait for cache ready & paint
            if (!this._hasRendered) {
                await cache.whenReady();
                await this._paintFromCache();
            }

            // Stale-while-revalidate: queues background sync only if data is from previous session
            // Never blocks UI or render
            api.requestSparklineRefresh(this.code).catch(() => { });
        } catch (e) {
            console.warn(`[Sparkline] Failed to load for ${this.code}`, e);
        }
    }

    /**
     * Reads the cache and renders if a drawable record exists.
     * @returns {Promise<boolean>} true if rendered
     */
    async _paintFromCache() {
        const cache = AppState.controller?.dataService?.sparklineCache;
        if (!cache) return false;

        const record = cache.peek(this.code) || await cache.get(this.code);
        if (SparklineCache.hasData(record)) {
            this.render(record.closes);
            return true;
        }
        return false;
    }

    /**
     * Subscribes to cache updates for this code. The listener self-removes once the container
     * is detached from the DOM (cards are frequently re-rendered), so it cannot leak.
     */
    _bindUpdates() {
        if (this._onUpdated) return;
        const myCode = SparklineCache.normalizeCode(this.code);

        this._onUpdated = (e) => {
            if (!this.container || !this.container.isConnected) {
                this.destroy();
                return;
            }
            if (SparklineCache.normalizeCode(e?.detail?.code) !== myCode) return;
            this._paintFromCache().catch(() => { });
        };
        document.addEventListener(EVENTS.SPARKLINE_UPDATED, this._onUpdated);
    }

    /** Detaches the cache-update listener. */
    destroy() {
        if (this._onUpdated) {
            document.removeEventListener(EVENTS.SPARKLINE_UPDATED, this._onUpdated);
            this._onUpdated = null;
        }
    }

    /**
     * @param {Array<number|{close?: number, value?: number}>} data - Closes (preferred) or history rows
     */
    render(data) {
        const svg = this.container.querySelector('svg');
        if (!svg) return;

        // 1. Process Data
        // Extract close prices/values and filter out invalid/non-numeric values
        const prices = data
            .map(d => typeof d === 'number' ? d : (d && d.close !== undefined ? d.close : (d && d.value)))
            .map(v => parseFloat(v))
            .filter(v => !isNaN(v) && isFinite(v));

        if (prices.length === 0) return;

        // Find Range
        let min = Infinity;
        let max = -Infinity;
        for (let p of prices) {
            if (p < min) min = p;
            if (p > max) max = p;
        }

        // Verify bounds are valid numbers
        if (!isFinite(min) || !isFinite(max)) {
            return;
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
        const step = prices.length > 1 ? width / (prices.length - 1) : 0;

        const pathPoints = prices.map((p, i) => {
            const x = i * step;
            // Normalized 0 to 1
            const normalized = range > 0 ? (p - min) / range : 0.5;
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
        this._hasRendered = true;
    }
}
