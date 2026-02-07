import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { CSS_CLASSES, UI_ICONS, PORTFOLIO_ID } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';
import { ColorHelper } from '../utils/ColorHelper.js';

/**
 * SharePieChart
 * Renders an interactive SVG pie chart for share portfolio breakdown.
 * Uses favicon-extracted colors with value-based sizing.
 */
export class SharePieChart {
    constructor(shares) {
        this.shares = shares || [];
        this.modal = null;
    }

    /**
     * Renders a small pie chart icon.
     * @param {HTMLElement} container 
     */
    async renderSmall(container) {
        if (!container || this.shares.length === 0) return;

        // We don't await the full breakdown here to avoid blocking UI, 
        // but for the small version we need at least the values.
        const breakdown = await this._getBreakdown();
        const svg = this._createPieSvg(breakdown, 44, 44, false);

        const wrapper = document.createElement('div');
        wrapper.className = 'share-pie-small-wrapper';
        wrapper.style.cssText = `
            cursor: pointer;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            background: rgba(255,255,255,0.03);
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.05);
        `;

        wrapper.innerHTML = svg;
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showModal();
        });

        wrapper.addEventListener('mouseenter', () => wrapper.style.transform = 'scale(1.1)');
        wrapper.addEventListener('mouseleave', () => wrapper.style.transform = 'scale(1)');

        container.appendChild(wrapper);
    }

    /**
     * Shows the full-screen interactive breakdown modal.
     */
    async showModal() {
        const existing = document.getElementById('share-pie-modal');
        if (existing) existing.remove();

        // Show loading state if needed, but usually breakdown is cached by now
        const breakdown = await this._getBreakdown();
        const total = breakdown.reduce((sum, b) => sum + b.val, 0);

        this.modal = document.createElement('div');
        this.modal.id = 'share-pie-modal';
        this.modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        this.modal.style.zIndex = '20002';

        const rowsHtml = breakdown.map(b => {
            const pct = (b.val / total) * 100;
            return `
                <div class="breakdown-row interactive-row" 
                     data-id="${b.id}" data-val="${b.val}" 
                     style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s ease; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 8px; height: 8px; background: ${b.color}; border-radius: 50%; box-shadow: 0 0 6px ${b.color}99; flex-shrink: 0;"></div>
                        <img src="https://files.marketindex.com.au/xasx/96x96-png/${b.id.toLowerCase()}.png" style="width: 20px; height: 20px; border-radius: 4px; background: #fff; padding: 1px;" onerror="this.src='favicon.svg'">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 700; font-size: 0.95rem; color: #fff;">${b.id}</span>
                            <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">${b.label.substring(0, 20)}${b.label.length > 20 ? '...' : ''}</span>
                        </div>
                    </div>
                    <div style="text-align: right; display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 700; color: #fff;">${formatCurrency(b.val)}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 800;">${pct.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        }).join('');

        this.modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}" style="max-width: 500px; padding: 0; overflow: hidden; border-radius: 20px; background: var(--card-bg);">
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-chart-pie" style="color: var(--color-accent);"></i> Portfolio Allocation
                    </h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} share-pie-close-btn" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}" style="padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 24px;">
                    <div class="pie-container-large" style="position: relative; width: 260px; height: 260px; display: flex; align-items: center; justify-content: center; margin: 10px 0;">
                        ${this._createPieSvg(breakdown, 240, 240, true)}
                        <div style="position: absolute; display: flex; flex-direction: column; align-items: center; pointer-events: none; width: 160px; text-align: center; justify-content: center; gap: 2px;">
                            <span id="share-pie-center-label" style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 1px; transition: all 0.2s ease;">Market Value</span>
                            <span id="share-pie-center-value" style="font-size: 1.1rem; font-weight: 900; color: #fff; transition: all 0.2s ease; line-height: 1.1;">${formatCurrency(total)}</span>
                            <span id="share-pie-center-sub" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; transition: all 0.2s ease; opacity: 0; transform: translateY(5px);"></span>
                        </div>
                    </div>
                    <div class="breakdown-list" style="width: 100%; max-height: 350px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.03);">
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this._attachInteractivity(this.modal, total);

        const close = () => {
            this.modal.remove();
            if (this.modal._navActive) {
                this.modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        this.modal.querySelector('.share-pie-close-btn').addEventListener('click', close);
        this.modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        this.modal._navActive = true;
        navManager.pushState(() => {
            if (this.modal.parentElement) {
                this.modal._navActive = false;
                close();
            }
        });
    }

    /**
     * Attaches interactivity to the pie slices.
     */
    _attachInteractivity(modal, total) {
        const slices = modal.querySelectorAll('.pie-slice');
        const labelEl = modal.querySelector('#share-pie-center-label');
        const valueEl = modal.querySelector('#share-pie-center-value');
        const subEl = modal.querySelector('#share-pie-center-sub');

        const defaultLabel = "Market Value";
        const defaultValue = formatCurrency(total);

        const allInteractive = modal.querySelectorAll('.pie-slice, .interactive-row');

        allInteractive.forEach(el => {
            const label = el.dataset.id; // Stock Code
            const val = parseFloat(el.dataset.val);
            const pct = ((val / total) * 100).toFixed(1) + '%';
            const valStr = formatCurrency(val);

            const onEnter = () => {
                // Clear all existing highlights first to ensure only one is active
                modal.querySelectorAll('.pie-slice').forEach(s => {
                    s.style.filter = 'none';
                    s.style.transform = 'scale(1)';
                });
                modal.querySelectorAll('.interactive-row').forEach(r => {
                    r.style.background = 'transparent';
                });

                labelEl.textContent = label;
                labelEl.style.color = 'var(--color-accent)';

                valueEl.textContent = pct;
                valueEl.style.fontSize = '1.8rem';
                valueEl.style.color = '#fff';

                subEl.textContent = valStr;
                subEl.style.opacity = '0.6';
                subEl.style.transform = 'translateY(0)';

                // Highlight corresponding slice
                const slice = modal.querySelector(`.pie-slice[data-id="${label}"]`);
                if (slice) {
                    slice.style.filter = 'brightness(1.2)';
                    slice.style.transform = 'scale(1.05)';
                }

                // Highlight corresponding row if applicable
                if (el.classList.contains('interactive-row')) {
                    el.style.background = 'rgba(255,255,255,0.08)';
                } else if (el.classList.contains('pie-slice')) {
                    const row = modal.querySelector(`.interactive-row[data-id="${label}"]`);
                    if (row) row.style.background = 'rgba(255,255,255,0.08)';
                }
            };

            const onLeave = () => {
                labelEl.textContent = defaultLabel;
                labelEl.style.color = 'var(--text-muted)';

                valueEl.textContent = defaultValue;
                valueEl.style.fontSize = '1.1rem';
                valueEl.style.color = '#fff';

                subEl.style.opacity = '0';
                subEl.style.transform = 'translateY(5px)';

                if (el.classList.contains('interactive-row')) {
                    el.style.background = 'transparent';
                    // Reset the corresponding pie slice
                    const slice = modal.querySelector(`.pie-slice[data-id="${label}"]`);
                    if (slice) {
                        slice.style.filter = 'none';
                        slice.style.transform = 'scale(1)';
                    }
                }
            };

            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mouseleave', onLeave);

            // Touch support for mobile tapping on rows
            el.addEventListener('touchstart', (e) => {
                onEnter();
                // We don't preventDefault as we still want scrolling, 
                // but we want the visual immediate feedback
            }, { passive: true });
        });
    }

    /**
     * Aggregates shares by code and calculates current market value.
     */
    async _getBreakdown() {
        // 1. Calculate values for all shares
        const items = this.shares.map(s => {
            const price = AppState.livePrices.get(s.shareName)?.live || s.purchasePrice || 0;
            return {
                id: s.shareName,
                label: s.companyName || s.shareName,
                val: (parseFloat(s.units) || 0) * price
            };
        })
            .filter(i => i.val > 0)
            .sort((a, b) => b.val - a.val);

        const weightedBreakdown = [];
        const usedColors = new Set();

        // 2. Fetch Favicon Colors
        // Limit to top 20 holdings for performance/clarity, group rest as "Other" if too many?
        // Actually, let's keep all but maybe handle async more efficiently.
        const colorPromises = items.map(item => {
            const faviconUrl = `https://files.marketindex.com.au/xasx/96x96-png/${item.id.toLowerCase()}.png`;
            return ColorHelper.getDominantColor(faviconUrl);
        });

        const colors = await Promise.all(colorPromises);

        items.forEach((item, idx) => {
            let color = ColorHelper.validateColor(colors[idx]);

            // Precedence logic: If color is already used by a larger share (lower index in sorted list), 
            // slightly adjust it for the smaller share.
            if (usedColors.has(color)) {
                color = this._adjustColor(color, idx);
            }
            usedColors.add(color);

            weightedBreakdown.push({
                ...item,
                color: color
            });
        });

        return weightedBreakdown;
    }

    /**
     * Shifts a color slightly to make it distinct from a conflict.
     */
    _adjustColor(hex, index) {
        // More robust randomization to ensure distinct colors
        // Use HSL shift to maintain saturation/lightness but change hue significantly
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // Convert to HSL (manual simplified)
        let r_norm = r / 255, g_norm = g / 255, b_norm = b / 255;
        let max = Math.max(r_norm, g_norm, b_norm), min = Math.min(r_norm, g_norm, b_norm);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r_norm: h = (g_norm - b_norm) / d + (g_norm < b_norm ? 6 : 0); break;
                case g_norm: h = (b_norm - r_norm) / d + 2; break;
                case b_norm: h = (r_norm - g_norm) / d + 4; break;
            }
            h /= 6;
        }

        // Apply a deterministic but significant hue shift based on index
        // Shift hue by golden ratio to maximize spacing
        h = (h + (index * 0.618033988749895)) % 1;

        // Ensure color isn't too dark or light for the pie
        l = 0.45 + (index % 3) * 0.1;
        s = 0.6 + (index % 2) * 0.2;

        // Convert back to RGB
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const finalR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
        const finalG = Math.round(hue2rgb(p, q, h) * 255);
        const finalB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

        return '#' + [finalR, finalG, finalB]
            .map(x => x.toString(16).padStart(2, '0'))
            .join('').toUpperCase();
    }

    /**
     * Reuses SVG creation logic from CashPieChart (standardized donut).
     */
    _createPieSvg(breakdown, width, height, isLarge = false) {
        const total = breakdown.reduce((sum, b) => sum + b.val, 0);
        if (total === 0) return '';

        const radius = width / 2;
        const innerRadius = isLarge ? radius * 0.72 : radius * 0.6;
        let currentAngle = -Math.PI / 2;

        const paths = breakdown.map((b, idx) => {
            const angle = (b.val / total) * Math.PI * 2;
            const x1 = radius + innerRadius * Math.cos(currentAngle);
            const y1 = radius + innerRadius * Math.sin(currentAngle);
            const x2 = radius + radius * Math.cos(currentAngle);
            const y2 = radius + radius * Math.sin(currentAngle);
            const x3 = radius + radius * Math.cos(currentAngle + angle);
            const y3 = radius + radius * Math.sin(currentAngle + angle);
            const x4 = radius + innerRadius * Math.cos(currentAngle + angle);
            const y4 = radius + innerRadius * Math.sin(currentAngle + angle);

            const largeArc = angle > Math.PI ? 1 : 0;
            const pathData = `M ${x1} ${y1} L ${x2} ${y2} A ${radius} ${radius} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1} Z`;

            currentAngle += angle;
            const gradId = `share-grad-${idx}-${isLarge ? 'lg' : 'sm'}`;
            const gradHtml = `
                <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${b.color};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:color-mix(in srgb, ${b.color} 70%, black);stop-opacity:1" />
                </linearGradient>`;

            return { path: pathData, gradId: gradId, gradHtml: gradHtml, id: b.id, val: b.val };
        });

        const animation = isLarge ? `
            <style>
                @keyframes pie-pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .pie-svg-share { animation: pie-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; transform-origin: center; overflow: visible; }
                .pie-slice { cursor: pointer; }
            </style>` : '';

        return `
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="${isLarge ? 'pie-svg-share' : ''}" style="overflow: visible;">
                <defs>${paths.map(p => p.gradHtml).join('')}</defs>
                ${animation}
                <g>
                    ${paths.map(p => `<path class="pie-slice" d="${p.path}" fill="url(#${p.gradId})" 
                                        data-id="${p.id}" data-val="${p.val}"
                                        style="transition: all 0.3s ease; transform-origin: center;"></path>`).join('')}
                </g>
            </svg>`;
    }
}
