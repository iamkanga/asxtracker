/**
 * SnapshotUI.js
 * Renders the "Market Pulse" Snapshot view.
 * Triggered by Long-Hold on the Portfolio View.
 */

import { AppState } from '../state/AppState.js';
import { StateAuditor } from '../state/StateAuditor.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS, UI_LABELS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';


export class SnapshotUI {

    static show() {
        if (document.getElementById(IDS.SNAPSHOT_MODAL_CONTAINER)) return;

        // CONSTITUTION RULE III & IV: Ready Guard & Null Safety
        if (!AppState?.data || !AppState?.data?.shares) {
            console.warn('[SnapshotUI] Data not ready');
            return;
        }

        const modal = this._renderModal();
        // Force high z-index to clear all other UI
        modal.style.zIndex = '100001';
        document.body.appendChild(modal);

        // Initial Render: Load Preference
        this._currentSort = AppState.preferences?.snapshotSort || 'desc';

        this._updateGrid(modal);
        this._bindEvents(modal);

        // REACTIVE UPDATE: Keep Snapshot Live
        if (StateAuditor && typeof StateAuditor.on === 'function') {
            modal._priceUnsub = StateAuditor.on('PRICES_UPDATED', () => {
                if (document.body.contains(modal) && modal.classList.contains(CSS_CLASSES.SHOW)) {
                    this._updateGrid(modal);
                }
            });
        }

        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            modal.classList.add(CSS_CLASSES.SHOW);
        });
    }

    static _close(modal) {
        if (!modal) return;
        modal.classList.remove(CSS_CLASSES.SHOW);
        modal.classList.add(CSS_CLASSES.HIDDEN);

        if (modal._priceUnsub) {
            modal._priceUnsub();
            modal._priceUnsub = null;
        }

        setTimeout(() => {
            if (modal.parentElement) modal.remove();
        }, 850); // Improved pace: matching 0.8s transition + buffer

        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }

    static _renderModal() {
        const modal = document.createElement('div');
        modal.id = IDS.SNAPSHOT_MODAL_CONTAINER;
        // Use ID for specific overrides, base modal classes for structure
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        // CONSTITUTION RULE I: Using Registry Classes
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}">
                <header class="${CSS_CLASSES.SNAPSHOT_MODAL_HEADER}">
                    <div class="${CSS_CLASSES.SNAPSHOT_TITLE_STACK}">
                        <h1><i class="fas fa-heartbeat"></i> ${UI_LABELS.MARKET_PULSE_TITLE}</h1>
                        <span>${UI_LABELS.ALL_WATCHLIST_CHANGE}</span>
                    </div>
                    <button class="${CSS_CLASSES.SNAPSHOT_CLOSE_BTN_FLOAT} ${CSS_CLASSES.MODAL_CLOSE_BTN}" title="${UI_LABELS.CLOSE}">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </header>
                
                <div class="${CSS_CLASSES.SNAPSHOT_CONTROLS}">
                    <button type="button" id="${IDS.SNAPSHOT_TOGGLE_BTN}">
                        <i class="fas fa-sort" id="${IDS.SNAPSHOT_TOGGLE_ICON}"></i>
                        <span id="${IDS.SNAPSHOT_TOGGLE_TEXT}">${UI_LABELS.LOW_TO_HIGH}</span>
                        <i class="fas fa-sort" id="${IDS.SNAPSHOT_TOGGLE_ICON_2}"></i>
                    </button>
                </div>

                <main class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY} ${CSS_CLASSES.SNAPSHOT_GRID} ${CSS_CLASSES.SNAPSHOT_MAIN_BODY}" id="${CSS_CLASSES.SNAPSHOT_GRID}">
                    <!-- Cards injected here -->
                </main>
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
        const toggleBtn = modal.querySelector(`#${IDS.SNAPSHOT_TOGGLE_BTN}`);

        const closeHandler = () => this._close(modal);
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
        if (overlay) overlay.addEventListener('click', closeHandler);

        const updateToggleUI = () => {
            const isDesc = this._currentSort === 'desc';
            const icon = modal.querySelectorAll('.fas.fa-sort, .fas.fa-caret-up, .fas.fa-caret-down');
            const text = modal.querySelector(`#${IDS.SNAPSHOT_TOGGLE_TEXT}`);

            const label = isDesc ? UI_LABELS.LOW_TO_HIGH : UI_LABELS.HIGH_TO_LOW;
            const iconClass = isDesc ? 'fa-caret-down' : 'fa-caret-up';
            const color = isDesc ? 'var(--color-negative)' : 'var(--color-positive)';

            if (text) text.textContent = label;
            icon.forEach(i => {
                i.className = `fas ${iconClass}`;
                i.style.color = color;
                i.style.marginRight = '15px'; // Reset styles just in case
                if (i.id === 'snapshot-toggle-icon-2') {
                    i.style.marginRight = '0';
                    i.style.marginLeft = '15px';
                }
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

        modal.addEventListener('click', (e) => {
            const card = e.target.closest(`.${CSS_CLASSES.SNAPSHOT_CARD}`);
            if (card && card.dataset.code) {
                document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code: card.dataset.code } }));
                this._close(modal);
            }
        });
    }

    static _updateGrid(modal) {
        const grid = modal.querySelector(`#${CSS_CLASSES.SNAPSHOT_GRID}`);
        if (!grid) return;

        // Dynamic Background Logic
        const content = modal.querySelector(`.${CSS_CLASSES.MODAL_CONTENT}`);
        if (content) {
            content.classList.remove(CSS_CLASSES.TREND_UP_BG, CSS_CLASSES.TREND_DOWN_BG, CSS_CLASSES.TREND_MIXED_DESC_BG, CSS_CLASSES.TREND_MIXED_ASC_BG);
            if (this._currentSort === 'desc') {
                content.classList.add(CSS_CLASSES.TREND_MIXED_DESC_BG); // Green Top -> Red Bottom
            } else {
                content.classList.add(CSS_CLASSES.TREND_MIXED_ASC_BG); // Red Top -> Green Bottom
            }
        }

        const data = this._prepareData(); // Get Aggregated Data

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
        if (!AppState.controller) return [];
        return AppState.controller.getSnapshotData();
    }

    static _renderSparkline(low, high, current) {
        if (!(high > 0 && low > 0 && current > 0 && high > low)) return '';

        const rangePercent = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);

        return `
            <div class="${CSS_CLASSES.SNAP_SPARK_CONTAINER}">
                <div class="${CSS_CLASSES.SNAP_RANGE_LOW}">${low.toFixed(2)}</div>
                <div class="${CSS_CLASSES.SNAP_RAIL}">
                    <div class="${CSS_CLASSES.SNAP_MARKER}" style="left: ${rangePercent}%;"></div>
                </div>
                <div class="${CSS_CLASSES.SNAP_RANGE_HIGH}">${high.toFixed(2)}</div>
            </div>
        `;
    }

    static _renderCard(item) {
        const isPos = item.pctChange > 0;
        const isNeg = item.pctChange < 0;

        let textClass = '';
        if (isPos) textClass = CSS_CLASSES.TEXT_POS;
        else if (isNeg) textClass = CSS_CLASSES.TEXT_NEG;

        const priceStr = formatCurrency(item.price);
        const pctStr = `${Math.abs(item.pctChange).toFixed(2)}%`;
        const valStr = formatCurrency(Math.abs(item.valChange));

        return `
            <div class="${CSS_CLASSES.SNAPSHOT_CARD}" data-code="${item.code}">
                <div class="${CSS_CLASSES.SNAP_COL_LEFT}">
                    <span class="${CSS_CLASSES.SNAP_CODE}">${item.code}</span>
                </div>

                <div class="${CSS_CLASSES.SNAP_COL_CENTER}">
                    ${this._renderSparkline(item.low, item.high, item.price)}
                </div>

                <div class="${CSS_CLASSES.SNAP_COL_RIGHT}">
                     <div class="${CSS_CLASSES.SNAP_PRICE}">${priceStr}</div>
                     <div class="${CSS_CLASSES.SNAP_VALUE_CHANGE}">
                        <span class="${textClass}">${valStr}</span>
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
        const LONG_PRESS_DURATION = 600;

        const startHandler = (e) => {
            hasTriggered = false;
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

        const contextMenuHandler = (e) => {
            const currentId = AppState.watchlist.id;
            if (currentId && currentId.toLowerCase() === 'portfolio') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        };

        element.style.transition = 'opacity 0.2s ease';
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';
        element.style.webkitTouchCallout = 'none';
        element.style.touchAction = 'manipulation';

        element.addEventListener('mousedown', startHandler);
        element.addEventListener('touchstart', startHandler, { passive: true });
        element.addEventListener('mouseup', cancelHandler);
        element.addEventListener('mouseleave', cancelHandler);
        element.addEventListener('touchend', cancelHandler);
        element.addEventListener('touchmove', cancelHandler);
        element.addEventListener('contextmenu', contextMenuHandler);
        element.addEventListener('click', (e) => {
            if (hasTriggered) {
                e.preventDefault();
                e.stopImmediatePropagation();
                hasTriggered = false;
                return false;
            }
        }, true);
    }
}
