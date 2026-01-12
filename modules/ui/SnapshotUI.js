/**
 * SnapshotUI.js
 * Renders the "Market Pulse" Snapshot view.
 * Triggered by Long-Hold on the Portfolio View.
 */

import { AppState } from '../state/AppState.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';

export class SnapshotUI {

    static show() {
        if (document.getElementById('snapshot-modal-container')) return;

        // V322 FIX: DO NOT HIDE Briefing Modal.
        // We layer Snapshot (z-index 1010) on TOP of Briefing (z-index 1001).

        const modal = this._renderModal();
        modal.style.zIndex = '1010'; // Override generic overlay
        document.body.appendChild(modal);

        // Initial Render: Load Preference
        this._currentSort = AppState.preferences.snapshotSort || 'desc';

        this._updateGrid(modal);
        this._bindEvents(modal);

        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            modal.classList.add(CSS_CLASSES.SHOW);
        });
    }

    static _close(modal) {
        modal.classList.remove(CSS_CLASSES.SHOW);
        modal.classList.add(CSS_CLASSES.HIDDEN);

        // No need for complex restoration since Briefing was never hidden.
        // Just remove ourselves.

        setTimeout(() => {
            if (modal.parentElement) modal.remove();
        }, 300);

        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }

    static _renderModal() {
        const modal = document.createElement('div');
        modal.id = 'snapshot-modal-container';
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.MODAL_FULLSCREEN} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} snapshot-content" style="max-height: 90vh; display: flex; flex-direction: column;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="margin-bottom: 0;">
                            <i class="fas fa-heartbeat" style="color: var(--color-accent); margin-right: 8px;"></i>
                            Market Pulse
                        </h2>
                        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0; font-weight: 400; margin-top: 2px;">All watchlist codes daily change</span>
                    </div>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                
                <!-- NUCLEAR STYLES for Toggle -->
                <style>
                    #snapshot-toggle-btn {
                        border: none !important;
                        outline: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                    }
                    #snapshot-toggle-btn:focus, #snapshot-toggle-btn:active {
                        border: none !important;
                        outline: none !important;
                    }
                    .snapshot-controls {
                        border: none !important;
                        box-shadow: none !important;
                    }
                </style>

                <div class="snapshot-controls" style="padding: 0 15px 2px 15px !important; border-bottom: none !important; display: flex; justify-content: center;">
                    <div class="${CSS_CLASSES.SEGMENTED_CONTROL}" style="width: 100%; max-width: 300px; border: none !important; background: transparent !important; box-shadow: none !important;">
                        <button type="button" class="${CSS_CLASSES.SEGMENTED_BUTTON} w-full" id="snapshot-toggle-btn">
                            <div class="${CSS_CLASSES.W_FULL} ${CSS_CLASSES.FLEX_ROW} ${CSS_CLASSES.ALIGN_CENTER}" style="justify-content: center;">
                                <i class="fas fa-sort" id="snapshot-toggle-icon" style="margin-right: 15px;"></i>
                                <span class="${CSS_CLASSES.FONT_BOLD}" id="snapshot-toggle-text">High to Low</span>
                                <i class="fas fa-sort" id="snapshot-toggle-icon-2" style="margin-left: 15px;"></i>
                            </div>
                        </button>
                    </div>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}" id="${CSS_CLASSES.SNAPSHOT_GRID}" style="padding-top: 0 !important;">
                    <!-- Grid Items Injected Here -->
                </div>
                
                <div class="${CSS_CLASSES.MODAL_FOOTER}" style="text-align: center; color: var(--text-muted); font-size: 0.7rem; padding: 10px;">
                    Tap card to view details
                </div>
            </div>
        `;

        // Nav Manager Hook
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                this._close(modal);
            }
        });

        return modal;
    }

    static _bindEvents(modal) {
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        const toggleBtn = modal.querySelector('#snapshot-toggle-btn');

        const closeHandler = () => this._close(modal);
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
        if (overlay) overlay.addEventListener('click', closeHandler);

        const updateToggleUI = () => {
            const isDesc = this._currentSort === 'desc';
            const icon = modal.querySelectorAll('.fas.fa-sort, .fas.fa-caret-up, .fas.fa-caret-down');
            const text = modal.querySelector('#snapshot-toggle-text');

            // Logic: If currently Descending (High -> Low), Button should say 'Low to High' (Target) 
            // OR should it say Current State? 
            // User requested: "One disappears and displays the other". Usually implies displaying the TARGET.
            // Let's stick to the Notifications Pattern: Display the TARGET state.

            // If current is DESC (High to Low) -> Show "Low to High" option.
            const targetSort = isDesc ? 'asc' : 'desc';
            const label = isDesc ? 'Low to High' : 'High to Low';
            const iconClass = isDesc ? 'fa-caret-down' : 'fa-caret-up';
            const color = isDesc ? 'var(--color-negative)' : 'var(--color-positive)';

            if (text) text.textContent = label;
            icon.forEach(i => {
                i.className = `fas ${iconClass}`;
                i.style.color = color;
                i.style.marginRight = '15px'; // Reset styles just in case
                if (i.id.includes('2')) i.style.marginRight = '0'; // Right icon
                if (i.id.includes('2')) i.style.marginLeft = '15px';
            });
        };

        if (toggleBtn) {
            // Init UI
            updateToggleUI();

            toggleBtn.addEventListener('click', (e) => {
                // Toggle Sort
                this._currentSort = (this._currentSort === 'desc') ? 'asc' : 'desc';
                AppState.saveSnapshotSort(this._currentSort);

                // Update UI & Grid
                updateToggleUI();
                this._updateGrid(modal);
            });
        }

        // Delegate Card Clicks
        modal.addEventListener('click', (e) => {
            const card = e.target.closest(`.${CSS_CLASSES.SNAPSHOT_CARD}`);
            if (card && card.dataset.code) {
                // Determine source watchlist if possible, or just default behavior
                // The main app expects ASX_CODE_CLICK to handle navigation or modals
                document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code: card.dataset.code } }));
                // Optional: Close snapshot on selection? User said "selection tool... display... ASX Code".
                // Usually a snapshot is for browsing. Let's keep it open unless they drill down deep.
                // But ASX_CODE_CLICK usually opens a modal on top. That's fine.
            }
        });
    }

    static _close(modal) {
        modal.classList.remove(CSS_CLASSES.SHOW);
        modal.classList.add(CSS_CLASSES.HIDDEN);

        setTimeout(() => {
            if (modal.parentElement) modal.remove();
        }, 300);

        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }

    static _updateGrid(modal) {
        const grid = modal.querySelector(`#${CSS_CLASSES.SNAPSHOT_GRID}`);
        if (!grid) return;

        // Dynamic Background Logic
        const content = modal.querySelector('.snapshot-content');
        if (content) {
            content.classList.remove('trend-up-bg', 'trend-down-bg', 'trend-mixed-desc-bg', 'trend-mixed-asc-bg');
            if (this._currentSort === 'desc') {
                content.classList.add('trend-mixed-desc-bg'); // Green Top -> Red Bottom
            } else {
                content.classList.add('trend-mixed-asc-bg'); // Red Top -> Green Bottom
            }
        }

        const data = this._prepareData(); // Get Aggregated Data

        console.log('[SnapshotUI] Grid Update. Items found:', data.length);

        if (data.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--border-color); margin: 20px;">
                    <div style="width: 64px; height: 64px; background: var(--bg-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                        <i class="fas fa-plus-circle" style="font-size: 24px; color: var(--color-accent);"></i>
                    </div>
                    <h3 style="color: white; font-size: 1.1rem; margin-bottom: 10px; font-weight: 600;">Your Watchlist is Empty</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 260px; line-height: 1.5; margin-bottom: 25px;">
                        Start tracking your wealth by adding shares, cash, or other assets to your watchlists.
                    </p>
                    <div style="display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: var(--color-accent); color: white; border-radius: 30px; font-size: 0.85rem; font-weight: 700; cursor: default; box-shadow: 0 4px 12px rgba(var(--color-accent-rgb), 0.3);">
                        <i class="fas fa-arrow-left"></i>
                        <span>Use the Sidebar to Add Assets</span>
                    </div>
                    <p style="margin-top: 20px; font-size: 0.75rem; color: var(--text-muted); opacity: 0.6;">
                        Tap the menu icon in the top left to get started.
                    </p>
                </div>
            `;
            return;
        }

        // Sort
        data.sort((a, b) => {
            const pA = a.pctChange || a.dayChangePct || 0;
            const pB = b.pctChange || b.dayChangePct || 0;
            const pAR = Math.round(pA * 100);
            const pBR = Math.round(pB * 100);

            let res = 0;
            if (pBR !== pAR) {
                res = pBR - pAR; // Pct Descending
            } else {
                const dA = a.dayChangeVal || a.change || 0;
                const dB = b.dayChangeVal || b.change || 0;
                res = Math.abs(dB) - Math.abs(dA); // Dollar magnitude Descending
            }

            return this._currentSort === 'desc' ? res : -res;
        });

        grid.innerHTML = data.map(item => this._renderCard(item)).join('');
    }

    static _prepareData() {
        const allItems = new Map();

        // 1. Iterate ALL Watchlists
        const watchlists = AppState.data.watchlists || [];
        // Include System Watchlists if they have stored data? 
        // Actually, AppState.data.shares contains EVERYTHING usually, keyed by ID. 
        // But we want to ensure we get everything *visible* to the user in lists.
        // Simplest: Iterate AppState.data.shares. This is the master list of all tracking.

        const masterList = AppState.data.shares || [];

        console.log('[SnapshotUI] Preparing Data. Master List Size:', masterList.length);
        if (masterList.length > 0) {
            console.log('[SnapshotUI] Sample Item:', masterList[0]);
        }

        masterList.forEach(share => {
            // Support both 'code' and 'shareName' (legacy/firebase mix)
            const code = share.code || share.shareName || share.symbol;

            if (!code) return;

            // Deduplication: Only take the first instance (or merge logic if needed)
            if (!allItems.has(code)) {
                // Enrich with Live Data if available
                let livePrice = share.currentPrice || share.price || 0;
                let dayChangePct = share.dayChangePercent || share.changePercent || 0;
                let dayChangeVal = share.dayChangePerShare || share.dayChange || share.change || 0;

                // Try Live Map Override (Real-time pulse)
                // AppState.livePrices is a Map<Code, {live, change, pctChange...}>
                if (AppState.livePrices && AppState.livePrices.has(code)) {
                    const liveData = AppState.livePrices.get(code);
                    livePrice = liveData.live || livePrice;
                    dayChangePct = liveData.pctChange || dayChangePct;
                    dayChangeVal = liveData.change || dayChangeVal;
                }

                allItems.set(code, {
                    code: code,
                    price: parseFloat(livePrice) || 0,
                    pctChange: parseFloat(dayChangePct) || 0,
                    valChange: parseFloat(dayChangeVal) || 0,
                    high: parseFloat(share.high || (AppState.livePrices.get(code)?.high) || 0),
                    low: parseFloat(share.low || (AppState.livePrices.get(code)?.low) || 0),
                    name: share.name
                });
            }
        });

        return Array.from(allItems.values());
    }

    static _renderCard(item) {
        const isPos = item.pctChange > 0;
        const isNeg = item.pctChange < 0;

        let colorClass = 'snapshot-neutral';
        let textClass = '';

        if (isPos) {
            colorClass = CSS_CLASSES.SNAPSHOT_POSITIVE;
            textClass = CSS_CLASSES.TEXT_POS;
        } else if (isNeg) {
            colorClass = CSS_CLASSES.SNAPSHOT_NEGATIVE;
            textClass = CSS_CLASSES.TEXT_NEG;
        }

        const priceStr = formatCurrency(item.price);
        const pctVal = Math.abs(item.pctChange).toFixed(2);
        const pctStr = `${pctVal}%`;

        const valStr = formatCurrency(Math.abs(item.valChange));
        const displayVal = `${valStr}`;

        const high = item.high || 0;
        const low = item.low || 0;
        const current = item.price || 0;

        // Sparkline Calculation
        let sparklineHtml = '';
        if (high > 0 && low > 0 && current > 0 && high > low) {
            const rangePercent = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);

            sparklineHtml = `
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-right: 6px;">${low.toFixed(2)}</div>
                <div class="${CSS_CLASSES.DASHBOARD_SPARK_CONTAINER}" style="margin: 0; width: 60px; min-width: 60px;">
                    <div class="${CSS_CLASSES.SPARK_RAIL}" style="height: 3px; background-color: var(--border-color); position: relative; width: 100%;">
                        <div class="${CSS_CLASSES.SPARK_MARKER}" style="position: absolute; left: ${rangePercent}%; top: 50%; transform: translate(-50%, -50%); width: 6px; height: 6px; background-color: ${colorClass === CSS_CLASSES.SNAPSHOT_POSITIVE ? 'var(--color-positive)' : (colorClass === CSS_CLASSES.SNAPSHOT_NEGATIVE ? 'var(--color-negative)' : 'var(--color-accent)')}; border-radius: 50%;"></div>
                    </div>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px;">${high.toFixed(2)}</div>
             `;
        }

        return `
            <div class="${CSS_CLASSES.SNAPSHOT_CARD} ${colorClass}" data-code="${item.code}" style="justify-content: space-between;">
                <!-- Left: Code -->
                <div class="${CSS_CLASSES.SNAP_COL_LEFT}" style="flex: 0 0 auto;">
                    <span class="${CSS_CLASSES.SNAP_CODE}">${item.code}</span>
                </div>

                <!-- Center: Sparkline -->
                 <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
                    ${sparklineHtml}
                </div>

                <!-- Right: Price & Changes -->
                <div class="${CSS_CLASSES.SNAP_COL_RIGHT}" style="text-align: right; flex: 0 0 auto;">
                     <div class="${CSS_CLASSES.SNAP_PRICE}" style="font-weight: 700;">${priceStr}</div>
                     <div style="display: flex; gap: 6px; justify-content: flex-end; font-size: 0.8rem;">
                        <span class="${textClass}">${displayVal}</span>
                        <span class="${textClass}">${pctStr}</span>
                     </div>
                </div>
            </div>
        `;
    }

    /**
     * Binds the Long-Hold Trigger to a container.
     * @param {HTMLElement} element The generic container (e.g., #content-container)
     */
    static bindTrigger(element) {
        if (!element) return;

        let pressTimer;
        let hasTriggered = false;
        const LONG_PRESS_DURATION = 600; // Reduced to 600ms for better responsiveness

        // Visual Feedback (Subtle Opacity instead of Scale)
        const addVisual = () => element.style.opacity = '0.7';
        const removeVisual = () => element.style.opacity = '1';

        // Block Click if Long Press occurred
        const clickBlocker = (e) => {
            if (hasTriggered) {
                e.preventDefault();
                e.stopImmediatePropagation();
                hasTriggered = false; // Reset
                console.log('[SnapshotUI] Click Suppressed (Event was consumed by Long Hold)');
                return false;
            }
        };

        const startHandler = (e) => {
            hasTriggered = false;

            // We depend on the fact that bindTrigger is only called for the Portfolio Value Card.
            // If the card exists and this handler is attached, we are good to go.

            // Ignore buttons/links
            if (e.target.closest('button') || e.target.closest('a')) return;

            pressTimer = setTimeout(() => {
                hasTriggered = true;
                if (navigator.vibrate) navigator.vibrate(50);
                this.show();
            }, LONG_PRESS_DURATION);
        };

        const cancelHandler = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        // Context Menu Block (Mobile)
        const contextMenuHandler = (e) => {
            const currentId = AppState.watchlist.id;
            if (currentId && currentId.toLowerCase() === 'portfolio') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        };

        // Add Listeners
        element.style.transition = 'opacity 0.2s ease';

        // Prevent Text Selection and Callouts (Copy/Paste menu)
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none'; // Safari/Chrome
        element.style.webkitTouchCallout = 'none'; // iOS Safari
        element.style.touchAction = 'manipulation'; // Improve tap handling

        element.addEventListener('mousedown', startHandler);
        element.addEventListener('touchstart', startHandler, { passive: true });

        element.addEventListener('mouseup', cancelHandler);
        element.addEventListener('mouseleave', cancelHandler);
        element.addEventListener('touchend', cancelHandler);
        element.addEventListener('touchmove', cancelHandler);

        element.addEventListener('contextmenu', contextMenuHandler);

        // Use Capture Phase to ensure we block the click before the card handler sees it
        element.addEventListener('click', clickBlocker, true);
    }
}
