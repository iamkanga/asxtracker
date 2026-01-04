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

                <!-- TOOLBAR: Pills - Active Count - Reorder Label -->
                <div style="padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; background: var(--bg-secondary);">
                    
                    <!-- All/None Pill -->
                    <div class="pill-container large-pill" style="width: 120px;">
                        <div class="pill-segment" id="btn-select-all">All</div>
                        <div class="pill-segment" id="btn-select-none">None</div>
                    </div>
                    
                    <!-- Center: Active / Inactive Counts -->
                    <div id="dashboard-count-display" style="display: flex; gap: 15px; font-weight: 700; font-size: 0.9rem;">
                        <span style="color: var(--color-positive);" id="count-active">0 Active</span>
                        <span style="color: var(--color-negative);" id="count-inactive">0 Hidden</span>
                    </div>

                    <!-- Right: Reorder Label -->
                    <span class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}" style="font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">Reorder</span>
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

                /* --- SQUARE RADIO/CHECKBOX STYLES --- */
                .square-radio-wrapper {
                    position: relative;
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .square-radio-wrapper input {
                    opacity: 0;
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    cursor: pointer;
                    z-index: 2;
                    margin: 0;
                }
                .square-radio-visual {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: 2px solid var(--border-color);
                    background: transparent;
                    border-radius: 3px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .square-radio-wrapper input:checked + .square-radio-visual {
                    border-color: var(--color-accent);
                    background: rgba(var(--color-accent-rgb), 0.1);
                }
                .square-radio-visual::after {
                    content: '';
                    width: 10px;
                    height: 10px;
                    background: var(--color-accent);
                    border-radius: 1px;
                    transform: scale(0);
                    transition: transform 0.2s;
                }
                .square-radio-wrapper input:checked + .square-radio-visual::after {
                    transform: scale(1);
                }

                /* --- ROW STYLES --- */
                .dashboard-filter-row {
                    display: flex;
                    align-items: center;
                    padding: 12px 20px;
                    background: var(--bg-card);
                }
                .df-name-col {
                    flex: 1;
                    margin-left: 15px;
                    display: flex;
                    flex-direction: column;
                }
                .df-main-text { font-weight: 700; font-size: 0.95rem; }
                .df-sub-text { font-size: 0.75rem; color: var(--text-muted); }
                
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
        const uniqueSet = new Set([...DASHBOARD_SYMBOLS, ...backendCodes]);
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
                // Futures
                'YAP=F': 'ASX SPI 200', 'TIO=F': 'Iron Ore (62%)', '^VIX': 'Volatility Index',
                'XAUUSD=X': 'Gold Spot (USD)', 'XAGUSD=X': 'Silver Spot (USD)'
            };
            const name = nameMap[code] || code;

            const row = document.createElement('div');
            row.className = 'dashboard-filter-row';
            row.draggable = true; // ENABLE DRAG
            row.dataset.code = code;

            row.innerHTML = `
                <div class="square-radio-wrapper">
                    <input type="checkbox" class="df-check" data-code="${code}" ${isChecked ? 'checked' : ''}>
                    <div class="square-radio-visual"></div>
                </div>

                <div class="df-name-col">
                    <span class="df-main-text">${name}</span>
                    <span class="df-sub-text">${code}</span>
                </div>

                <!-- DRAG HANDLE -->
                <div class="df-reorder-handle" title="Drag to reorder" style="cursor: grab; padding: 10px; color: var(--text-muted); opacity: 0.7;">
                    <i class="fas fa-grip-lines"></i>
                </div>
            `;
            listContainer.appendChild(row);
        });

        // Update Header Count
        const activeCount = displayOrder.length - hiddenSet.size;
        const inactiveCount = hiddenSet.size;

        const activeEl = modal.querySelector('#count-active');
        const inactiveEl = modal.querySelector('#count-inactive');

        if (activeEl) activeEl.textContent = `${activeCount} Active`;
        if (inactiveEl) inactiveEl.textContent = `${inactiveCount} Hidden`;
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

            // Update UI Count
            const activeCount = newOrder.length - newHidden.length;
            const inactiveCount = newHidden.length;

            const activeEl = modal.querySelector('#count-active');
            const inactiveEl = modal.querySelector('#count-inactive');

            if (activeEl) activeEl.textContent = `${activeCount} Active`;
            if (inactiveEl) inactiveEl.textContent = `${inactiveCount} Hidden`;

            // Update Pill State (Highlight Logic)
            const allBtn = modal.querySelector('#btn-select-all');
            const noneBtn = modal.querySelector('#btn-select-none');
            const totalItems = rows.length;
            const selectedCount = activeCount;

            // Reset
            allBtn.classList.remove('active');
            noneBtn.classList.remove('active');

            if (selectedCount === totalItems && totalItems > 0) {
                allBtn.classList.add('active');
            } else if (selectedCount === 0) {
                noneBtn.classList.add('active');
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
                row.classList.add('dragging');
            }
        });

        listContainer.addEventListener('dragend', (e) => {
            const row = e.target.closest('.dashboard-filter-row');
            if (row) {
                row.style.opacity = '1';
                row.classList.remove('dragging');
                draggedItem = null;
                updateState(); // Save the new order!
            }
        });

        listContainer.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessary to allow dropping
            const afterElement = getDragAfterElement(listContainer, e.clientY);
            const draggable = document.querySelector('.dragging');
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
            const draggableElements = [...container.querySelectorAll('.dashboard-filter-row:not(.dragging)')];

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
