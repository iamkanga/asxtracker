/**
 * DashboardFilterModal.js
 * Modal for selecting (hiding/showing) and reordering dashboard items.
 * Dynamic Source: Syncs with Backend Sheet Data.
 */

import { CSS_CLASSES, IDS, UI_ICONS, DASHBOARD_SYMBOLS, EVENTS, STORAGE_KEYS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';

export class DashboardFilterModal {

    static show() {
        const existing = document.getElementById('dashboard-filter-modal');
        if (existing) existing.remove();

        const modal = this._renderModal();
        document.body.appendChild(modal);

        this._renderList(modal);
        this._bindEvents(modal);

        requestAnimationFrame(() => modal.classList.remove(CSS_CLASSES.HIDDEN));
    }

    static _renderModal() {
        const modal = document.createElement('div');
        modal.id = 'dashboard-filter-modal';
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="display: flex; flex-direction: column; max-height: 80vh;">
                
                <!-- HEADER: Left Aligned Title -->
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="justify-content: flex-start; position: relative; padding-left: 20px;">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="margin: 0; font-size: 1.1rem; text-align: left;">Dashboard Items</h2>
                    
                    <!-- Close Button (Absolute Right) -->
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close" style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%);">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>

                <!-- TOOLBAR: Pills - Compact Count -->
                <div style="padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; background: var(--bg-secondary);">
                    
                    <!-- All/None Pill -->
                    <div class="pill-container large-pill" style="width: 100px;">
                        <div class="pill-segment" id="btn-select-all">All</div>
                        <div class="pill-segment" id="btn-select-none">None</div>
                    </div>
                    
                    <!-- Center: Compact Active Count (X/Y ✓) -->
                    <div id="dashboard-count-display" style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.9rem; color: var(--text-color);">
                        <span id="count-active">0</span>/<span id="count-total">0</span>
                        <i class="fas fa-check" style="color: var(--color-positive); font-size: 0.8rem;"></i>
                    </div>
                    
                    <!-- Spacer for balance -->
                    <div style="width: 100px;"></div>
                </div>

                <!-- COLUMN HEADERS -->
                <div style="display: grid; grid-template-columns: 1fr 100px 60px; padding: 10px 15px 6px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
                    <span></span>
                    <span style="text-align: center; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-accent);">Hide</span>
                    <span style="text-align: center; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); opacity: 0.7;">Reorder</span>
                </div>

                <!-- LIST BODY -->
                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}" id="dashboard-filter-list" style="padding: 0; flex: 1; overflow-y: auto;">
                    <!-- List Items -->
                </div>
            </div>
            
            <style>
                /* --- PILL STYLES --- */
                .pill-container {
                    display: flex;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                    padding: 0;
                    justify-content: center;
                    align-items: center;
                    box-sizing: border-box;
                    border-radius: 4px;
                }
                .pill-container.large-pill { height: 32px; }

                .pill-segment {
                    flex: 1;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 800; /* Bold */
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 0 !important;
                    margin: 0;
                    border: none;
                    background: transparent;
                    color: var(--text-muted);
                }
                .pill-segment:first-child { border-right: 1px solid var(--border-color); }
                .pill-segment:hover { color: var(--text-color); background: rgba(255,255,255,0.05); }
                
                /* Active Logic provided in JS */
                .pill-segment.active {
                    background: var(--color-accent) !important;
                    color: white !important;
                }

                /* --- ROW STYLES --- */
                .dashboard-filter-row {
                    display: grid;
                    grid-template-columns: 1fr 100px 60px;
                    align-items: center;
                    padding: 8px 15px;
                    background: var(--bg-card);
                    min-height: 44px;
                }
                .df-name-col {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }
                .df-main-text { font-weight: 700; font-size: 0.95rem; }
                .df-sub-text { font-size: 0.75rem; color: var(--text-muted); }
                
                .df-check-col {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    justify-self: center;
                }
                
                .df-reorder-col {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    justify-self: center;
                }
                
                .df-row-hidden .df-main-text {
                    color: var(--color-accent) !important;
                    text-decoration: line-through;
                    opacity: 0.7;
                }
                .df-row-hidden .df-sub-text {
                    color: var(--color-accent) !important;
                    opacity: 0.5;
                }
                
                .df-reorder-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .df-reorder-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 0 5px;
                    font-size: 0.8rem;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                }
                .df-reorder-btn:hover { opacity: 1; color: var(--color-accent); }
            </style>
        `;

        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).click();
            }
        });

        return modal;
    }

    static _renderList(modal) {
        const listContainer = modal.querySelector('#dashboard-filter-list');
        listContainer.innerHTML = '';

        // DYNAMIC SOURCE: AppState.data.dashboard + Filter Duplicates
        const backendCodes = (AppState.data.dashboard || []).map(item => item.ASXCode || item.code).filter(Boolean);

        // REFACTOR: Use LIVE DATA keys as the "Source of Truth" to align with Dashboard View.
        // STRICK SOURCE OF TRUTH: 100% Backend/Spreadsheet
        const candidates = backendCodes;

        const uniqueSet = new Set(candidates);
        const masterList = Array.from(uniqueSet);

        // Sorting Logic: Saved Order > Master List Fallback
        let displayOrder = [...masterList];
        const savedOrder = AppState.preferences.dashboardOrder;

        if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
            const orderedSet = new Set(savedOrder);
            const newItems = masterList.filter(x => !orderedSet.has(x));
            const validSaved = savedOrder.filter(x => uniqueSet.has(x));
            displayOrder = [...validSaved, ...newItems];
        }

        const hiddenSet = new Set(AppState.preferences.dashboardHidden || []);

        displayOrder.forEach((code, index) => {
            const isHidden = hiddenSet.has(code);
            const isChecked = !isHidden;

            // Name Resolution
            const nameMap = {
                'XJO': 'ASX 200 (Legacy)', 'XKO': 'ASX 300', 'XAO': 'All Ords',
                'INX': 'S&P 500 (Legacy)', '.DJI': 'Dow Jones (Legacy)', '.IXIC': 'Nasdaq (Legacy)',
                'AUDUSD': 'AUD/USD', 'AUDTHB': 'AUD/THB', 'USDTHB': 'USD/THB',
                'BTCUSD': 'Bitcoin', 'GCW00': 'Gold (Legacy)', 'SIW00': 'Silver (Legacy)', 'BZW00': 'Brent Oil (Legacy)',
                // New Yahoo Codes
                '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq',
                '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', '^HSI': 'Hang Seng',
                '^STOXX50E': 'Euro Stoxx 50', '^AXJO': 'S&P/ASX 200',
                'GC=F': 'Gold Futures', 'SI=F': 'Silver Futures', 'CL=F': 'Crude Oil',
                'BZ=F': 'Brent Oil', 'HG=F': 'Copper',
                'BTC-USD': 'Bitcoin (USD)', 'BTC-AUD': 'Bitcoin (AUD)',
                'AUDUSD=X': 'AUD/USD', 'AUDGBP=X': 'AUD/GBP',
                'AUDEUR=X': 'AUD/EUR', 'AUDJPY=X': 'AUD/JPY', 'AUDTHB=X': 'AUD/THB',
                'YAP=F': 'ASX SPI 200', 'TIO=F': 'Iron Ore (62%)', '^VIX': 'Volatility Index',
                'XAUUSD=X': 'Gold Spot (USD)', 'XAGUSD=X': 'Silver Spot (USD)',
                'NICKEL': 'Nickel'
            };
            const name = nameMap[code] || code;

            const row = document.createElement('div');
            row.className = `dashboard-filter-row ${isHidden ? 'df-row-hidden' : ''}`;
            row.draggable = true; // ENABLE DRAG
            row.dataset.code = code;

            row.innerHTML = `
                <div class="df-name-col">
                    <span class="df-main-text">${name}</span>
                    <span class="df-sub-text" style="margin-left: 8px; opacity: 0.5;">${code}</span>
                </div>

                <div class="df-check-col">
                    <div class="square-radio-wrapper">
                        <input type="checkbox" class="df-check" data-code="${code}" ${isChecked ? 'checked' : ''}>
                        <div class="square-radio-visual"></div>
                    </div>
                </div>

                <div class="df-reorder-col">
                    <div class="df-reorder-handle" title="Drag to reorder" style="cursor: grab; color: var(--text-muted); opacity: 0.7;">
                        <i class="fas fa-grip-lines"></i>
                    </div>
                </div>
            `;
            listContainer.appendChild(row);
        });

        // Update Header Count (Compact X/Y format)
        const totalCount = displayOrder.length;
        const activeCount = totalCount - hiddenSet.size;

        const activeEl = modal.querySelector('#count-active');
        const totalEl = modal.querySelector('#count-total');

        if (activeEl) activeEl.textContent = `${activeCount}`;
        if (totalEl) totalEl.textContent = `${totalCount}`;
    }

    static _bindEvents(modal) {
        const closeModal = () => {
            modal.classList.add(CSS_CLASSES.HIDDEN);
            setTimeout(() => { if (modal.parentElement) modal.remove(); }, 300);
            window.dispatchEvent(new Event('dashboard-prefs-changed'));
        };

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).onclick = closeModal;
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).onclick = closeModal;

        // Core State Update Logic
        const updateState = () => {
            const rows = Array.from(modal.querySelectorAll('.dashboard-filter-row'));
            const newOrder = rows.map(r => r.dataset.code);
            const newHidden = [];
            rows.forEach(r => {
                if (!r.querySelector('.df-check').checked) newHidden.push(r.dataset.code);
            });

            // Persist
            AppState.preferences.dashboardOrder = newOrder;
            AppState.preferences.dashboardHidden = newHidden;
            localStorage.setItem(STORAGE_KEYS.DASHBOARD_ORDER, JSON.stringify(newOrder));
            localStorage.setItem(STORAGE_KEYS.DASHBOARD_HIDDEN, JSON.stringify(newHidden));
            AppState.triggerSync();

            // Update UI Count (Compact X/Y format)
            const activeCount = newOrder.length - newHidden.length;
            const totalCount = newOrder.length;

            const activeEl = modal.querySelector('#count-active');
            const totalEl = modal.querySelector('#count-total');

            if (activeEl) activeEl.textContent = `${activeCount}`;
            if (totalEl) totalEl.textContent = `${totalCount}`;

            // Update Pill State (Highlight Logic)
            const allBtn = modal.querySelector('#btn-select-all');
            const noneBtn = modal.querySelector('#btn-select-none');
            const totalItems = rows.length;
            const selectedCount = activeCount;

            // Reset
            allBtn.classList.remove(CSS_CLASSES.ACTIVE);
            noneBtn.classList.remove(CSS_CLASSES.ACTIVE);

            if (selectedCount === totalItems && totalItems > 0) {
                allBtn.classList.add(CSS_CLASSES.ACTIVE);
            } else if (selectedCount === 0) {
                noneBtn.classList.add(CSS_CLASSES.ACTIVE);
            }
        };

        // Initialize State on Open
        updateState();

        // Radio Toggles
        modal.addEventListener('change', (e) => {
            if (e.target.classList.contains('df-check')) updateState();
        });

        // Pills: Select All
        modal.querySelector('#btn-select-all').onclick = () => {
            modal.querySelectorAll('.df-check').forEach(cb => cb.checked = true);
            updateState();
        };

        // Pills: Select None
        modal.querySelector('#btn-select-none').onclick = () => {
            modal.querySelectorAll('.df-check').forEach(cb => cb.checked = false);
            updateState();
        };

        // --- DRAG AND DROP LOGIC (Finger Sort) ---
        const listContainer = modal.querySelector('#dashboard-filter-list');
        let draggedItem = null;

        listContainer.addEventListener('dragstart', (e) => {
            const row = e.target.closest('.dashboard-filter-row');
            if (row) {
                draggedItem = row;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', row.dataset.code);
                row.style.opacity = '0.5';
                row.classList.add(CSS_CLASSES.DRAGGING);
            }
        });

        listContainer.addEventListener('dragend', (e) => {
            const row = e.target.closest('.dashboard-filter-row');
            if (row) {
                row.style.opacity = '1';
                row.classList.remove(CSS_CLASSES.DRAGGING);
                draggedItem = null;
                updateState(); // Save the new order!
            }
        });

        listContainer.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessary to allow dropping
            const afterElement = getDragAfterElement(listContainer, e.clientY);
            const draggable = document.querySelector(`.${CSS_CLASSES.DRAGGING}`);
            if (draggable) {
                if (afterElement == null) {
                    listContainer.appendChild(draggable);
                } else {
                    listContainer.insertBefore(draggable, afterElement);
                }
            }
        });

        // Helper to find the element we are hovering over
        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll(`.dashboard-filter-row:not(.${CSS_CLASSES.DRAGGING})`)];

            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }
}
