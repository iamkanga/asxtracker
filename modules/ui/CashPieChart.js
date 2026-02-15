import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { CASH_CATEGORIES, CSS_CLASSES, UI_ICONS, ASSET_CUSTOM_COLORS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * CashPieChart
 * Renders a premium, interactive SVG pie chart for cash asset breakdown.
 */
export class CashPieChart {
    constructor(assets) {
        this.assets = assets || [];
        this.modal = null;
    }

    /**
     * Renders a small pie chart icon for the header.
     * @param {HTMLElement} container 
     */
    async renderSmall(container) {
        if (!container || this.assets.length === 0) return;

        const breakdown = this._getBreakdown();
        const svg = this._createPieSvg(breakdown, 44, 44, false);

        const wrapper = document.createElement('div');
        wrapper.className = 'cash-pie-small-wrapper';
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
        wrapper.addEventListener('click', () => this.showModal());

        // Hover effect
        wrapper.addEventListener('mouseenter', () => wrapper.style.transform = 'scale(1.1)');
        wrapper.addEventListener('mouseleave', () => wrapper.style.transform = 'scale(1)');

        container.appendChild(wrapper);
    }

    /**
     * Renders a horizontal DNA-style strip breakdown.
     * @param {HTMLElement} container 
     * @param {number} height
     */
    async renderDnaStrip(container, height = 9) {
        if (!container || this.assets.length === 0) return;

        const rawBreakdown = this._getBreakdown(true); // Get individual assets
        const total = rawBreakdown.reduce((sum, b) => sum + b.val, 0);
        if (total === 0) return;

        // Grouping logic: Items < 0.5% go into "Others" to keep the strip clean
        const breakdown = [];
        let otherVal = 0;

        rawBreakdown.forEach(item => {
            const pct = (item.val / total) * 100;
            if (pct >= 0.5) {
                breakdown.push(item);
            } else {
                otherVal += item.val;
            }
        });

        if (otherVal > 0) {
            breakdown.push({
                id: 'OTHERS',
                label: 'Other Assets',
                val: otherVal,
                color: 'var(--asset-other)'
            });
        }

        const strip = document.createElement('div');
        strip.className = 'cash-dna-strip';
        strip.style.cssText = `
            width: 100%;
            height: ${height}px;
            display: flex;
            background: rgba(255,255,255,0.05);
            cursor: pointer;
            transition: height 0.2s ease, box-shadow 0.2s ease;
            overflow: hidden;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
            border-bottom: 1px solid rgba(255,255,255,0.05);
        `;

        breakdown.forEach((item, idx) => {
            const pct = (item.val / total) * 100;
            const segment = document.createElement('div');
            segment.title = `${item.label}: ${((item.val / total) * 100).toFixed(1)}%`;
            segment.style.cssText = `
                height: 100%;
                width: ${pct}%;
                flex-shrink: 0;
                background: ${item.color};
                position: relative;
                transition: filter 0.2s ease, width 0.6s cubic-bezier(0.23, 1, 0.32, 1);
                border-right: 0.5px solid rgba(0,0,0,0.1);
                box-sizing: border-box;
            `;

            // Initial animation state
            const finalWidth = pct + '%';
            segment.style.width = '0%';
            requestAnimationFrame(() => {
                segment.style.width = finalWidth;
            });

            // Hover effect
            segment.addEventListener('mouseenter', () => segment.style.filter = 'brightness(1.5) saturate(1.2)');
            segment.addEventListener('mouseleave', () => segment.style.filter = 'none');

            strip.appendChild(segment);
        });

        strip.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showModal();
        });

        // Hover effect for the whole strip container
        container.addEventListener('mouseenter', () => {
            strip.style.height = `${height + 2}px`;
            strip.style.boxShadow = '0 0 10px rgba(0,255,255,0.1)';
        });
        container.addEventListener('mouseleave', () => {
            strip.style.height = `${height}px`;
            strip.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.5)';
        });

        container.innerHTML = '';
        container.appendChild(strip);
    }

    /**
     * Shows the full-screen interactive pie chart modal.
     */
    showModal() {
        // Remove existing if any
        const existing = document.getElementById('cash-pie-modal');
        if (existing) existing.remove();

        const breakdown = this._getBreakdown();
        const total = breakdown.reduce((sum, b) => sum + b.val, 0);

        this.modal = document.createElement('div');
        this.modal.id = 'cash-pie-modal';
        this.modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        this.modal.style.zIndex = '20002'; // Above sidebar but below some high-level alerts if needed

        const rowsHtml = breakdown.map(b => {
            const pct = (b.val / total) * 100;
            return `
                <div class="breakdown-row interactive-row" 
                     data-label="${b.label}" data-val="${b.val}" 
                     style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s ease; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 12px; height: 12px; border-radius: 3px; background: ${b.color}; shadow: 0 0 5px ${b.color}44;"></div>
                        <span style="font-weight: 600; font-size: 0.95rem;">${b.label}</span>
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
                        <i class="fas fa-chart-pie" style="color: var(--color-accent);"></i> Asset Breakdown
                    </h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} pie-close-btn" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}" style="padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 24px;">
                    <div class="pie-container-large" style="position: relative; width: 260px; height: 260px; display: flex; align-items: center; justify-content: center; margin: 10px 0;">
                        ${this._createPieSvg(breakdown, 240, 240, true)}
                        <div style="position: absolute; display: flex; flex-direction: column; align-items: center; pointer-events: none; width: 160px; text-align: center; justify-content: center; gap: 2px;">
                            <span id="cash-pie-center-label" style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 1px; transition: all 0.2s ease;">Assets Value</span>
                            <span id="cash-pie-center-value" style="font-size: 1.1rem; font-weight: 900; color: #fff; transition: all 0.2s ease; line-height: 1.1;">${formatCurrency(total)}</span>
                            <span id="cash-pie-center-sub" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; transition: all 0.2s ease; opacity: 0; transform: translateY(5px);"></span>
                        </div>
                    </div>
                    <div class="breakdown-list" style="width: 100%; max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.03);">
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this._attachInteractivity(this.modal, total);

        // Bind Close
        const close = () => {
            this.modal.remove();
            if (this.modal._navActive) {
                this.modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        this.modal.querySelector('.pie-close-btn').addEventListener('click', close);
        this.modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        // Navigation Support
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
        const labelEl = modal.querySelector('#cash-pie-center-label');
        const valueEl = modal.querySelector('#cash-pie-center-value');
        const subEl = modal.querySelector('#cash-pie-center-sub');

        const defaultLabel = "Assets Value";
        const defaultValue = formatCurrency(total);

        const allInteractive = modal.querySelectorAll('.pie-slice, .interactive-row');

        allInteractive.forEach(el => {
            const label = el.dataset.label;
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
                const slice = modal.querySelector(`.pie-slice[data-label="${label}"]`);
                if (slice) {
                    slice.style.filter = 'brightness(1.2)';
                    slice.style.transform = 'scale(1.05)';
                }

                // Highlight corresponding row if applicable
                if (el.classList.contains('interactive-row')) {
                    el.style.background = 'rgba(255,255,255,0.08)';
                } else if (el.classList.contains('pie-slice')) {
                    const row = modal.querySelector(`.interactive-row[data-label="${label}"]`);
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
                    const slice = modal.querySelector(`.pie-slice[data-label="${label}"]`);
                    if (slice) {
                        slice.style.filter = 'none';
                        slice.style.transform = 'scale(1)';
                    }
                }
            };

            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mouseleave', onLeave);

            // Click to scroll and highlight
            el.addEventListener('click', () => {
                if (el.classList.contains('pie-slice')) {
                    const row = modal.querySelector(`.interactive-row[data-label="${label}"]`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        // Visual Feedback: Temporary stronger highlight
                        const prevTransition = row.style.transition;
                        row.style.transition = 'background 0.3s ease';
                        row.style.background = 'rgba(255,255,255,0.2)';

                        setTimeout(() => {
                            // If still hovering, keep hover color, else reset
                            if (row.matches(':hover')) {
                                row.style.background = 'rgba(255,255,255,0.08)';
                            } else {
                                row.style.background = 'transparent';
                            }
                            row.style.transition = prevTransition;
                        }, 1000);
                    }
                }
            });

            // Touch support for mobile tapping
            el.addEventListener('touchstart', (e) => {
                onEnter();
            }, { passive: true });
        });
    }

    /**
     * Aggregates assets by category or returns individual assets.
     * @param {Boolean} byIndividual - If true, returns individual assets.
     * @returns {Array} Array of { id, label, val, color } objects sorted by value.
     */
    _getBreakdown(byIndividual = false) {
        if (byIndividual) {
            return this.assets
                .filter(a => !a.isHidden && parseFloat(a.balance) > 0)
                .map(asset => {
                    return {
                        id: asset.id,
                        label: asset.name,
                        val: parseFloat(asset.balance),
                        color: this._getAssetColor(asset)
                    };
                })
                .sort((a, b) => b.val - a.val);
        }

        const breakdown = {};
        this.assets.forEach(asset => {
            const catId = asset.category || 'other';
            const val = parseFloat(asset.balance || 0);
            if (val <= 0 || asset.isHidden) return;

            if (!breakdown[catId]) {
                breakdown[catId] = {
                    id: catId,
                    label: this._getCategoryLabel(catId),
                    val: 0,
                    color: this._getCategoryColor(catId)
                };
            }
            breakdown[catId].val += val;
        });

        return Object.values(breakdown).sort((a, b) => b.val - a.val);
    }

    /**
     * Matches CashViewRenderer's color resolution logic exactly.
     */
    _getAssetColor(asset) {
        if (asset.category) {
            const userCat = AppState.preferences.userCategories?.find(c => c.id === asset.category);
            if (userCat && userCat.color) return userCat.color;

            const standardColors = {
                'cash': 'var(--asset-cash)',
                'cash_in_bank': 'var(--asset-cash-in-bank)',
                'term_deposit': 'var(--asset-term-deposit)',
                'property': 'var(--asset-property)',
                'crypto': 'var(--asset-crypto)',
                'shares': 'var(--asset-shares)',
                'super': 'var(--asset-super)',
                'personal': 'var(--asset-personal)',
                'other': 'var(--asset-other)'
            };

            if (asset.color) return asset.color;
            if (standardColors[asset.category]) return standardColors[asset.category];
            if (asset.category === 'other' && asset.name) {
                return this._getColorForString(asset.name);
            }
        } else if (asset.color) {
            return asset.color;
        }
        return 'var(--asset-other)';
    }

    _getColorForString(str) {
        if (!str) return ASSET_CUSTOM_COLORS[0];
        const seed = AppState.preferences?.colorSeed || 0;
        let hash = seed;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % ASSET_CUSTOM_COLORS.length;
        return ASSET_CUSTOM_COLORS[index];
    }

    _getCategoryLabel(catId) {
        if (!catId) return 'Asset';
        const userCat = (AppState.preferences.userCategories || []).find(c => c && c.id === catId);
        if (userCat) return userCat.label;

        const sysCat = CASH_CATEGORIES.find(c => c.id === catId);
        if (sysCat) return sysCat.label;

        return catId.replace(/^user_/i, '').replace(/_/g, ' ');
    }

    _getCategoryColor(catId) {
        if (!catId) return 'var(--asset-other)';
        // Find first asset in this category to get its color if custom
        const userCat = (AppState.preferences.userCategories || []).find(c => c && c.id === catId);
        if (userCat && userCat.color) return userCat.color;

        const firstAssetInCat = this.assets.find(a => a.category === catId && a.color);
        if (firstAssetInCat && firstAssetInCat.color) return firstAssetInCat.color;

        // Fallback to standard colors
        const standardColors = {
            'cash': '#4db8ff',
            'cash_in_bank': '#3399ff',
            'term_deposit': '#0066cc',
            'property': '#ff9933',
            'crypto': '#ffcc00',
            'shares': '#a49393',
            'super': '#9933ff',
            'personal': '#ff3399',
            'other': '#808080'
        };

        return standardColors[catId] || '#a49393';
    }

    /**
     * Creates the Pie SVG string.
     */
    _createPieSvg(breakdown, width, height, isLarge = false) {
        const total = breakdown.reduce((sum, b) => sum + b.val, 0);
        if (total === 0) return '';

        const radius = width / 2;
        const innerRadius = isLarge ? radius * 0.72 : radius * 0.6; // Donut style
        let currentAngle = -Math.PI / 2; // Start from top

        const paths = breakdown.map((b, idx) => {
            let angle = (b.val / total) * Math.PI * 2;

            // Handle 100% slice edge case for SVG Arc (cannot have start == end)
            if (angle >= Math.PI * 2) angle = Math.PI * 2 - 0.001;

            const x1 = (radius + innerRadius * Math.cos(currentAngle)).toFixed(3);
            const y1 = (radius + innerRadius * Math.sin(currentAngle)).toFixed(3);
            const x2 = (radius + radius * Math.cos(currentAngle)).toFixed(3);
            const y2 = (radius + radius * Math.sin(currentAngle)).toFixed(3);

            const x3 = (radius + radius * Math.cos(currentAngle + angle)).toFixed(3);
            const y3 = (radius + radius * Math.sin(currentAngle + angle)).toFixed(3);
            const x4 = (radius + innerRadius * Math.cos(currentAngle + angle)).toFixed(3);
            const y4 = (radius + innerRadius * Math.sin(currentAngle + angle)).toFixed(3);

            const largeArc = angle > Math.PI ? 1 : 0;

            const path = `M ${x1} ${y1} L ${x2} ${y2} A ${radius} ${radius} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1} Z`;

            currentAngle += angle;

            // Gradient per slice for "Premium" feel
            const gradId = `pie-grad-${idx}-${isLarge ? 'lg' : 'sm'}`;
            const gradHtml = `
                <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${b.color};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:color-mix(in srgb, ${b.color} 70%, black);stop-opacity:1" />
                </linearGradient>
            `;

            return { path, gradHtml, gradId, color: b.color, label: b.label, val: b.val };
        });

        // Animation for large pie
        const animation = isLarge ? `
            <style>
                @keyframes pie-rotate {
                    from { transform: rotate(-90deg) scale(0.8); opacity: 0; }
                    to { transform: rotate(0deg) scale(1); opacity: 1; }
                }
                .pie-svg-animated {
                    animation: pie-rotate 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                    transform-origin: center;
                    overflow: visible;
                }
                .pie-slice {
                    cursor: pointer;
                }
            </style>
        ` : '';

        return `
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="${isLarge ? 'pie-svg-animated' : ''}" style="overflow: visible;">
                <defs>${paths.map(p => p.gradHtml).join('')}</defs>
                ${animation}
                <g>
                    ${paths.map(p => `
                        <path class="pie-slice" d="${p.path}" fill="url(#${p.gradId})" 
                              data-label="${p.label}" data-val="${p.val}"
                              style="transition: all 0.3s ease; transform-origin: center;"></path>
                    `).join('')}
                </g>
            </svg>
        `;
    }
}
