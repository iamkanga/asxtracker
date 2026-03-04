/**
 * WidgetController.js
 * Handles business logic for the widget, including configuration modal
 * and events.
 */
import { AppState } from '../state/AppState.js';
import { widgetPanel, WIDGET_MODULES } from '../ui/WidgetPanel.js?v=1152';
import { EVENTS, CSS_CLASSES, UI_ICONS } from '../utils/AppConstants.js';

export class WidgetController {
    constructor() {
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        this._bindGlobalEvents();
        this.isInitialized = true;
    }

    _bindGlobalEvents() {
        document.addEventListener(EVENTS.WIDGET_TOGGLE, () => {
            console.log('[WidgetController] WIDGET_TOGGLE received');
            widgetPanel.toggle();
        });

        document.addEventListener('open-widget-config', () => {
            this.showConfigModal();
        });

        document.addEventListener('open-widget-dashboard-picker', () => {
            this.showDashboardPicker();
        });
    }

    /**
     * Shows a modal to configure widget modules (visibility and order).
     * Uses app-standard square-radio checkboxes for consistency.
     */
    showConfigModal() {
        const existing = document.getElementById('widget-config-modal');
        if (existing) existing.remove();

        // Close the widget panel so the config modal isn't behind it
        if (widgetPanel.container && !widgetPanel.container.classList.contains('widget-hidden')) {
            widgetPanel.toggle();
        }

        const config = AppState.preferences?.widgetConfig || this._getDefaultConfig();

        // Combine config with module definitions
        const allModules = WIDGET_MODULES.map(m => {
            const userPref = config.find(c => c.id === m.id);
            return { ...m, visible: userPref ? userPref.visible : m.default };
        });

        // Sort by user's preferred order
        if (config.length) {
            allModules.sort((a, b) => {
                const idxA = config.findIndex(c => c.id === a.id);
                const idxB = config.findIndex(c => c.id === b.id);
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        // Build module rows using app's square-radio-wrapper pattern
        const moduleRows = allModules.map(mod => `
            <div class="widget-config-row" data-id="${mod.id}">
                <div class="square-radio-wrapper">
                    <input type="checkbox" class="widget-module-toggle" ${mod.visible ? 'checked' : ''}>
                    <div class="square-radio-visual"></div>
                </div>
                <div class="widget-config-row-info">
                    <i class="fas ${mod.icon}" style="color: var(--color-accent); width: 18px; text-align: center; font-size: 0.85rem;"></i>
                    <div class="widget-config-row-text">
                        <span class="widget-config-row-label">${mod.label}</span>
                        ${mod.description ? `<span class="widget-config-row-desc">${mod.description}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        // Create modal — save button in header, next to close (like all other app modals)
        const modal = document.createElement('div');
        modal.id = 'widget-config-modal';
        modal.className = `${CSS_CLASSES.MODAL}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} modal-content-small">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">
                            <i class="fas fa-sliders-h" style="color: var(--color-accent);"></i>
                            Configure Widget
                        </h2>
                        <span class="modal-subtitle">Toggle modules for Quick Glance</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.SAVE_BTN}" id="save-widget-config" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" id="close-widget-config">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}">
                    <div class="widget-config-list">
                        ${moduleRows}
                    </div>
                </div>
            </div>

            <style>
                /* Square Radio styles scoped to this modal (matching SettingsUI pattern) */
                #widget-config-modal .square-radio-wrapper {
                    position: relative;
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                #widget-config-modal .square-radio-wrapper input {
                    opacity: 0;
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    cursor: pointer;
                    z-index: 2;
                    margin: 0;
                }
                #widget-config-modal .square-radio-visual {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    border: 2px solid var(--border-color);
                    background: transparent;
                    border-radius: 2px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                #widget-config-modal .square-radio-wrapper input:checked + .square-radio-visual {
                    border-color: var(--color-accent);
                }
                #widget-config-modal .square-radio-visual::after {
                    content: '';
                    width: 10px;
                    height: 10px;
                    background: var(--color-accent);
                    border-radius: 1px;
                    transform: scale(0);
                    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                #widget-config-modal .square-radio-wrapper input:checked + .square-radio-visual::after {
                    transform: scale(1);
                }
                #widget-config-modal .widget-config-row {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 12px 15px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                #widget-config-modal .widget-config-row:hover {
                    background: rgba(255, 255, 255, 0.06);
                }
                #widget-config-modal .widget-config-row-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-width: 0;
                }
            </style>
        `;

        document.body.appendChild(modal);

        // Force visibility
        modal.classList.remove(CSS_CLASSES.HIDDEN);
        modal.style.cssText = 'opacity: 1; visibility: visible; pointer-events: auto; z-index: 21000;';

        // Make entire row clickable (toggles the checkbox)
        modal.querySelectorAll('.widget-config-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't double-toggle if clicking the input itself
                if (e.target.tagName === 'INPUT') return;
                const checkbox = row.querySelector('.widget-module-toggle');
                if (checkbox) checkbox.checked = !checkbox.checked;
            });
        });

        // Bind close
        const closeBtn = modal.querySelector('#close-widget-config');
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        const closeModal = () => {
            modal.remove();
            widgetPanel.toggle();
        };
        if (closeBtn) closeBtn.onclick = closeModal;
        if (overlay) overlay.onclick = closeModal;

        // Bind save
        const saveBtn = modal.querySelector('#save-widget-config');
        if (saveBtn) {
            saveBtn.onclick = () => {
                const rows = modal.querySelectorAll('.widget-config-row');
                const newConfig = Array.from(rows).map(row => ({
                    id: row.dataset.id,
                    visible: row.querySelector('.widget-module-toggle')?.checked || false
                }));
                AppState.saveWidgetConfig(newConfig);

                document.dispatchEvent(new CustomEvent(EVENTS.WIDGET_CONFIG_CHANGED));
                modal.remove();
                widgetPanel.toggle();
            };
        }
    }

    /**
     * Shows a picker modal for selecting which dashboard items appear in the widget.
     * Uses square-radio checkboxes matching the app's settings pattern.
     */
    showDashboardPicker() {
        const existing = document.getElementById('widget-dashboard-picker');
        if (existing) existing.remove();

        // Close widget so modal isn't behind it
        if (widgetPanel.container && !widgetPanel.container.classList.contains('widget-hidden')) {
            widgetPanel.toggle();
        }

        const dashboardData = AppState.data.dashboard || [];
        const livePrices = AppState.livePrices || new Map();
        const currentSelection = new Set(
            (AppState.preferences?.widgetDashboardItems || []).map(c => c.toUpperCase())
        );

        // Name map for display
        const NAMES = {
            '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq',
            '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', '^HSI': 'Hang Seng',
            '^STOXX50E': 'Euro Stoxx 50', '^AXJO': 'ASX 200', '^AORD': 'All Ords',
            '^VIX': 'VIX', 'XJO': 'ASX 200', 'XKO': 'ASX 300',
            'GC=F': 'Gold', 'SI=F': 'Silver', 'CL=F': 'Crude Oil',
            'BZ=F': 'Brent Oil', 'HG=F': 'Copper', 'TIO=F': 'Iron Ore',
            'BTC-USD': 'BTC/USD', 'BTC-AUD': 'BTC/AUD',
            'AUDUSD=X': 'AUD/USD', 'AUDGBP=X': 'AUD/GBP', 'AUDEUR=X': 'AUD/EUR',
            'AUDJPY=X': 'AUD/JPY', 'AUDTHB=X': 'AUD/THB', 'AUDNZD=X': 'AUD/NZD',
            'USDTHB=X': 'USD/THB', 'YAP=F': 'SPI 200', 'NICKEL': 'Nickel'
        };

        // Get all available codes from dashboard data
        const allCodes = dashboardData
            .map(d => (d.ASXCode || d.code || '').toUpperCase())
            .filter(Boolean);

        // If no items are selected yet, select first 6 by default
        if (currentSelection.size === 0) {
            allCodes.slice(0, 6).forEach(c => currentSelection.add(c));
        }

        const itemRows = allCodes.map(code => {
            const liveData = livePrices.get(code) || {};
            const name = liveData.name || NAMES[code] || code;
            const isChecked = currentSelection.has(code);
            return `
                <div class="widget-config-row widget-picker-row" data-code="${code}">
                    <div class="square-radio-wrapper">
                        <input type="checkbox" class="widget-dashboard-toggle" data-code="${code}" ${isChecked ? 'checked' : ''}>
                        <div class="square-radio-visual"></div>
                    </div>
                    <div class="widget-config-row-info">
                        <span class="widget-config-row-label">${name}</span>
                        <span class="widget-config-row-desc" style="margin-left: auto; font-family: monospace; font-size: 0.7rem;">${code}</span>
                    </div>
                </div>
            `;
        }).join('');

        const modal = document.createElement('div');
        modal.id = 'widget-dashboard-picker';
        modal.className = `${CSS_CLASSES.MODAL}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} modal-content-small" style="max-height: 80vh;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">
                            <i class="fas fa-globe" style="color: var(--color-accent);"></i>
                            Dashboard Items
                        </h2>
                        <span class="modal-subtitle">Select items for your Quick Glance</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.SAVE_BTN}" id="save-dashboard-picker" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" id="close-dashboard-picker">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}" style="overflow-y: auto; max-height: calc(80vh - 80px);">
                    <div class="widget-config-list">
                        ${itemRows || '<div class="widget-empty">No dashboard items available.</div>'}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.remove(CSS_CLASSES.HIDDEN);
        modal.style.cssText = 'opacity: 1; visibility: visible; pointer-events: auto; z-index: 21000;';

        // Make rows clickable
        modal.querySelectorAll('.widget-picker-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                const cb = row.querySelector('.widget-dashboard-toggle');
                if (cb) cb.checked = !cb.checked;
            });
        });

        // Close
        const closeBtn = modal.querySelector('#close-dashboard-picker');
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        const closeModal = () => {
            modal.remove();
            widgetPanel.toggle();
        };
        if (closeBtn) closeBtn.onclick = closeModal;
        if (overlay) overlay.onclick = closeModal;

        // Save
        const saveBtn = modal.querySelector('#save-dashboard-picker');
        if (saveBtn) {
            saveBtn.onclick = () => {
                const selected = [];
                modal.querySelectorAll('.widget-dashboard-toggle').forEach(cb => {
                    if (cb.checked) selected.push(cb.dataset.code);
                });

                AppState.saveWidgetDashboardItems(selected);

                document.dispatchEvent(new CustomEvent(EVENTS.WIDGET_CONFIG_CHANGED));
                modal.remove();
                widgetPanel.toggle();
            };
        }
    }

    _getDefaultConfig() {
        return WIDGET_MODULES.map(m => ({ id: m.id, visible: m.default }));
    }
}

export const widgetController = new WidgetController();

