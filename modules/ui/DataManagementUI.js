/**
 * DataManagementUI.js
 * Central hub for Data Export and Import/Sync operations.
 * Replaces simple "Download" settings with a robust management tool.
 */

import { CSS_CLASSES, UI_ICONS, IDS, EVENTS, PORTFOLIO_ID } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { SyncManager } from '../controllers/SyncManager.js';
import { userStore } from '../data/DataService.js';

export class DataManagementUI {

    static showModal() {
        const existing = document.getElementById('data-management-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'data-management-modal';
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        // Initial Tabs State
        let activeTab = 'export'; // 'export' | 'import'

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="max-height: 85vh; display: flex; flex-direction: column;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Data Management</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                
                <!-- TABS HEADER -->
                <div style="display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 0;">
                    <div id="tab-btn-export" class="tab-btn active" style="flex: 1; padding: 15px; text-align: center; cursor: pointer; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid transparent; transition: all 0.2s;">
                        <i class="fas fa-file-export" style="margin-right: 8px;"></i> Export Data
                    </div>
                    <div id="tab-btn-import" class="tab-btn" style="flex: 1; padding: 15px; text-align: center; cursor: pointer; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid transparent; transition: all 0.2s;">
                        <i class="fas fa-sync-alt" style="margin-right: 8px;"></i> Portfolio Sync
                    </div>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; overflow-y: auto; padding-top: 20px;">
                    
                    <!-- TAB: EXPORT -->
                    <div id="tab-content-export" class="tab-content">
                        <div style="text-align: center; margin-bottom: 25px;">
                            <div style="font-size: 3rem; color: var(--color-accent); margin-bottom: 15px; opacity: 0.8;">
                                <i class="fas fa-cloud-download-alt"></i>
                            </div>
                            <h3 style="color: white; margin-bottom: 8px;">Export Your Data</h3>
                            <p style="color: var(--text-muted); font-size: 0.9rem;">
                                You have <strong>${(AppState.data.shares || []).length}</strong> records ready for export.
                            </p>
                        </div>

                        <div class="${CSS_CLASSES.SETTINGS_SECTION}">
                            <div style="display: flex; gap: 15px;">
                                <!-- CSV Button -->
                                <button id="dm-btn-csv" style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: white; cursor: pointer; transition: all 0.2s;">
                                    <i class="fas fa-file-csv" style="font-size: 2rem; margin-bottom: 10px; color: var(--color-accent);"></i>
                                    <span style="font-weight: 600;">Download CSV</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Spreadsheet Format</span>
                                </button>
                                
                                <!-- PDF Button -->
                                <button id="dm-btn-pdf" style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: white; cursor: pointer; transition: all 0.2s;">
                                    <i class="fas fa-file-pdf" style="font-size: 2rem; margin-bottom: 10px; color: var(--color-accent);"></i>
                                    <span style="font-weight: 600;">Print / PDF</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Document Format</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- TAB: IMPORT -->
                    <div id="tab-content-import" class="tab-content" style="display: none;">
                        
                        <div style="margin-bottom: 25px;">
                            <h3 style="color: white; margin-bottom: 8px; font-size: 1.1rem;">Portfolio Sync</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5;">
                                Synchronize your portfolio holdings using a Sharesight export. This process will update your **unit counts** and **cost bases** specifically for the Portfolio view.
                            </p>
                            <div style="margin-top: 10px; font-size: 0.75rem; color: var(--color-accent); font-weight: 600; display: flex; gap: 6px; align-items: center;">
                                <i class="fas fa-info-circle"></i> Watchlist-only shares (0 units) are not affected unless added as new holdings.
                            </div>
                        </div>

                        <!-- Option A: File Upload (Primary) -->
                        <div class="import-option" style="background: rgba(255,255,255,0.03); border: 2px dashed var(--border-color); border-radius: 12px; padding: 40px 20px; margin-bottom: 20px; text-align: center; cursor: pointer; transition: all 0.2s;" id="dm-drop-zone">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 2.5rem; color: var(--color-accent); margin-bottom: 15px; opacity: 0.8;"></i>
                            <div style="font-weight: 700; color: white; margin-bottom: 8px; font-size: 1.1rem;">Drop your CSV here</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                Supports Sharesight 'All Trades', 'Holdings' <br>and 'Performance' reports.
                            </div>
                            <input type="file" id="dm-file-input" accept=".csv" style="display: none;">
                        </div>

                        <div style="background: rgba(var(--color-accent-rgb), 0.05); border-radius: 8px; padding: 15px; border: 1px solid rgba(var(--color-accent-rgb), 0.1);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-info-circle" style="color: var(--color-accent);"></i>
                                    <span style="font-size: 0.85rem; color: white; font-weight: 600;">Need a template?</span>
                                </div>
                                <button id="dm-btn-template" class="standard-btn" style="font-size: 0.75rem; background: var(--bg-secondary); color: white; border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 4px; cursor: pointer;">
                                    Download Starter
                                </button>
                            </div>
                        </div>

                    </div>

                </div>
            </div>
            
            <style>
                .tab-btn.active {
                    color: var(--color-accent) !important;
                    border-bottom-color: var(--color-accent) !important;
                    background: rgba(var(--color-accent-rgb), 0.05);
                }
                .import-option:hover {
                    border-color: var(--color-accent) !important;
                }
            </style>
        `;

        document.body.appendChild(modal);

        // Navigation Hook
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).click();
            }
        });

        // --- TAB SWITCHING LOGIC ---
        const switchTab = (tab) => {
            activeTab = tab;
            modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            modal.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

            modal.querySelector(`#tab-btn-${tab}`).classList.add('active');
            modal.querySelector(`#tab-content-${tab}`).style.display = 'block';
        };

        modal.querySelector('#tab-btn-export').addEventListener('click', () => switchTab('export'));
        modal.querySelector('#tab-btn-import').addEventListener('click', () => switchTab('import'));


        // --- CLOSE LOGIC ---
        const close = () => {
            modal.remove();
            navManager.popStateSilently();
        };
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);


        // --- EXPORT HANDLERS ---
        modal.querySelector('#dm-btn-csv').addEventListener('click', () => {
            this._handleCsvExport();
            close();
        });

        modal.querySelector('#dm-btn-pdf').addEventListener('click', () => {
            this._handlePdfExport();
            close();
        });


        // --- IMPORT HANDLERS ---
        const fileInput = modal.querySelector('#dm-file-input');
        const dropZone = modal.querySelector('#dm-drop-zone');
        // File Selection
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this._processFile(file);
        });

        // Download Template
        modal.querySelector('#dm-btn-template').addEventListener('click', () => {
            const headers = "Code,Purchase Date,Units Held,Average Cost Price,Sharesight URL,Sharesight Code,Dividend Amount,Franking Credits,Notes";
            const row1 = "CBA,2024-01-01,10,105.50,https://www.sharesight.com/holdings/12345,12345,4.50,100,Core holding";
            const row2 = "BHP,2024-02-15,50,45.20,https://www.sharesight.com/holdings/67890,67890,1.20,100,Mining exposure";
            const template = `${headers}\n${row1}\n${row2}`;

            const blob = new Blob([template], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "import_template.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

    }

    // --- LOGIC HELPERS ---

    static _handleCsvExport() {
        // Reuse logic from GeneralSettingsUI (migrated here)
        const shares = AppState.data.shares || [];
        if (!shares.length) {
            ToastManager.error("No data to export.");
            return;
        }

        const headers = [
            'Code', 'Purchase Date', 'Units Held', 'Average Cost Price', 'Sharesight URL',
            'Sharesight Code', 'Dividend Amount', 'Franking Credits', 'Notes'
        ];

        const rows = shares.map(s => {
            const code = s.code || s.shareName || s.symbol || '-';
            const live = AppState.livePrices.get(code);
            const price = live ? live.live : (s.currentPrice || s.enteredPrice || 0);

            // Get latest note
            const latestNote = s.comments && s.comments.length > 0
                ? s.comments[s.comments.length - 1].body.replace(/,/g, ';')
                : '';

            // Construct Sharesight URL if possible
            const ssUrl = s.shareSightCode
                ? `https://www.sharesight.com/holdings/${s.shareSightCode}`
                : '';

            return [
                `"${code}"`,
                `"${s.purchaseDate || ''}"`,
                s.portfolioShares || 0,
                s.portfolioAvgPrice || s.enteredPrice || 0,
                `"${ssUrl}"`,
                `"${s.shareSightCode || ''}"`,
                s.dividendAmount || 0,
                s.frankingCredits || 0,
                `"${latestNote}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `asx_watchlist_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    static _handlePdfExport() {
        const shares = AppState.data.shares || [];
        if (!shares.length) {
            ToastManager.error("No data to export.");
            return;
        }

        // 1. Create/Identify Print Container
        let printContainer = document.getElementById('print-export-container');
        if (!printContainer) {
            printContainer = document.createElement('div');
            printContainer.id = 'print-export-container';
            printContainer.className = 'print-only';
            document.body.appendChild(printContainer);
        }

        // 2. Generate content
        let rows = '';
        shares.forEach(s => {
            const code = s.code || s.shareName;
            const live = AppState.livePrices.get(code);
            const price = live ? live.live : (s.currentPrice || s.enteredPrice || 0);
            const priceStr = price >= 1 ? price.toFixed(2) : price.toFixed(4);
            rows += `<tr><td>${code}</td><td>$${priceStr}</td><td>${s.portfolioShares || 0}</td></tr>`;
        });

        printContainer.innerHTML = `
            <h2>Watchlist Data Export</h2>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <table>
                <thead>
                    <tr><th>Code</th><th>Price</th><th>Units</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

        // 3. Trigger Print
        window.print();

        // 4. Cleanup after print dialog closes
        const cleanup = () => {
            printContainer.innerHTML = '';
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
    }

    static _processFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this._simulateSyncWrapper(e.target.result);
        };
        reader.readAsText(file);
    }

    static _simulateSyncWrapper(csvText) {
        // Calls the existing SyncManager which we will likely enhance next
        const { matches, newShares, ignored } = SyncManager.simulateSync(csvText);

        // Close self
        const existing = document.getElementById('data-management-modal');
        if (existing) existing.remove();

        // Show result
        this._showSyncResult(matches, newShares, ignored);
    }

    static _showSyncResult(matches = [], newShares = [], ignored = []) {
        const modal = document.createElement('div');
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        modal.style.zIndex = '3000';

        const renderItemCard = (item, type) => {
            const isNew = type === 'new';
            const icon = isNew ? UI_ICONS.ADD : UI_ICONS.SYNC;
            const tintClass = isNew ? 'tint-green' : 'tint-accent';
            const badgeLabel = isNew ? 'New Holding' : 'Existing Record';
            const badgeColor = isNew ? '#4ade80' : 'var(--color-accent)';

            return `
                <div class="sync-item-card ${tintClass}" style="
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    backdrop-filter: blur(10px);
                    animation: cardEntry 0.4s ease-out forwards;
                    opacity: 0;
                ">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="
                            width: 40px;
                            height: 40px;
                            border-radius: 10px;
                            background: ${badgeColor}22;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: ${badgeColor};
                            font-size: 1.2rem;
                        ">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 800; font-size: 1.1rem; color: white; letter-spacing: 0.5px;">${item.code}</div>
                            <div style="font-size: 0.75rem; color: ${badgeColor}; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">
                                ${badgeLabel}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1rem; font-weight: 700; color: white;">${item.quantity} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">Units</span></div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">@ $${parseFloat(item.price || 0).toFixed(2)}</div>
                    </div>
        `;
        };

        const totalItems = (matches?.length || 0) + (newShares?.length || 0);

        modal.innerHTML = `
            <style>
                @keyframes cardEntry {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .sync-item-card.tint-green { border-left: 4px solid #4ade80 !important; }
                .sync-item-card.tint-accent { border-left: 4px solid var(--color-accent) !important; }
                .sync-preview-scroll::-webkit-scrollbar { width: 6px; }
                .sync-preview-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }
                .ignored-item { font-size: 0.8rem; color: #ff8a8a; display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
            </style>
            <div class="${CSS_CLASSES.MODAL_OVERLAY}" style="background: rgba(0,0,0,0.85); backdrop-filter: blur(5px);"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}" style="max-width: 500px; padding: 0; background: var(--bg-primary); border: 1px solid var(--border-color); overflow: hidden;">
                
                <div style="padding: 24px; border-bottom: 1px solid var(--border-color); background: rgba(255,255,255,0.02);">
                    <h3 style="color: white; margin: 0; font-size: 1.4rem; font-weight: 800;">Portfolio Sync Preview</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin: 8px 0 0 0;">
                        Applying ${totalItems} updates to your active holdings.
                    </p>
                </div>

                <div class="sync-preview-scroll" style="max-height: 50vh; overflow-y: auto; padding: 20px; background: rgba(0,0,0,0.1);">
                    ${matches.length > 0 ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; margin-left: 4px;">Updates (${matches.length})</div>` : ''}
                    ${matches.map((m, i) => `<div style="animation-delay: ${i * 0.05}s">${renderItemCard(m, 'update')}</div>`).join('')}
                    
                    ${newShares.length > 0 ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin: 24px 0 12px 4px;">New Holdings (${newShares.length})</div>` : ''}
                    ${newShares.map((m, i) => `<div style="animation-delay: ${(matches.length + i) * 0.05}s">${renderItemCard(m, 'new')}</div>`).join('')}

                    ${ignored.length > 0 ? `
                        <div style="margin-top: 24px; border-top: 1px solid var(--border-color); padding-top: 16px;">
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; margin-left: 4px; display: flex; justify-content: space-between;">
                                <span>Skipped Items (${ignored.length})</span>
                                <i class="fas fa-info-circle"></i>
                            </div>
                            <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px;">
                                ${ignored.map(item => `
                                    <div class="ignored-item">
                                        <span style="font-weight: 700;">${item.code}</span>
                                        <span style="opacity: 0.8;">${item.reason}</span>
                                    </div>
                                `).join('')}
                                <div style="margin-top: 8px; font-size: 0.7rem; color: var(--text-muted); italic; opacity: 0.6;">
                                    These items were ignored because they were empty positions, non-ASX codes, or invalid data.
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${totalItems === 0 && ignored.length === 0 ? '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-search" style="font-size: 2rem; margin-bottom: 16px; opacity: 0.3;"></i><br>No valid data found in this file.</div>' : ''}
                </div>

                <div style="padding: 20px; display: flex; gap: 12px; background: rgba(255,255,255,0.02); border-top: 1px solid var(--border-color);">
                    <button id="res-cancel" class="standard-btn" style="flex: 1; background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer;">Cancel</button>
                    ${totalItems > 0 ? `<button id="res-commit" class="standard-btn" style="flex: 2; background: var(--color-accent); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 15px rgba(var(--color-accent-rgb), 0.3);">Apply ${totalItems} Changes</button>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        navManager.pushState(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        });

        const closeModal = () => {
            modal.remove();
            navManager.popStateSilently();
        };

        modal.querySelector('#res-cancel').addEventListener('click', closeModal);

        const commitBtn = modal.querySelector('#res-commit');
        if (commitBtn) {
            commitBtn.addEventListener('click', async () => {
                await this._commitSync(matches, newShares);
                closeModal();
            });
        }
    }

    static async _commitSync(matches = [], newShares = []) {
        if (!AppState.user) return;
        const total = matches.length + newShares.length;
        ToastManager.show(`Updating ${total} records...`, 'info');

        const userId = AppState.user.uid;

        // 1. Update Existing Matches
        const updatePromises = (matches || []).map(match => {
            const updateData = { portfolioShares: match.quantity.toString() };
            if (!match.isHoldingsOnly && match.price) {
                updateData.purchaseDate = match.dateStr || new Date().toISOString().split('T')[0];
                updateData.portfolioAvgPrice = match.price.toString();
            }

            // Sync Additional Fields
            if (match.shareSightCode) updateData.shareSightCode = match.shareSightCode;
            if (match.brokerage) updateData.brokerage = parseFloat(match.brokerage).toString();
            if (match.rating) updateData.starRating = parseInt(match.rating);
            if (match.targetPrice) updateData.targetPrice = parseFloat(match.targetPrice);
            if (match.buySell) updateData.buySell = match.buySell.toLowerCase();
            if (match.targetDirection) updateData.targetDirection = match.targetDirection.toLowerCase();
            if (match.dividendAmount) updateData.dividendAmount = parseFloat(match.dividendAmount);
            if (match.frankingCredits) updateData.frankingCredits = parseFloat(match.frankingCredits);

            if (match.notes) {
                // For matches, we add a new note if it doesn't exist? 
                // Or overwrite? Database logic usually merges. 
                // For sync, we'll append it if it looks new.
                updateData.comments = [{
                    body: match.notes,
                    date: new Date().toISOString()
                }];
            }

            return userStore.updateShare(userId, match.shareId, updateData);
        });

        // 2. Add New Shares
        const addPromises = (newShares || []).map(ns => {
            const shareData = {
                code: ns.code,
                shareName: ns.code,
                portfolioShares: ns.quantity.toString(),
                portfolioAvgPrice: (ns.price || 0).toString(),
                purchaseDate: ns.dateStr || new Date().toISOString().split('T')[0],
                watchlistIds: [PORTFOLIO_ID], // Default to portfolio
                updatedAt: new Date(),
                shareSightCode: ns.shareSightCode || '',
                brokerage: ns.brokerage ? parseFloat(ns.brokerage).toString() : '0',
                starRating: ns.rating ? parseInt(ns.rating) : 0,
                targetPrice: ns.targetPrice ? parseFloat(ns.targetPrice) : 0,
                buySell: (ns.buySell || 'buy').toLowerCase(),
                targetDirection: (ns.targetDirection || 'below').toLowerCase(),
                dividendAmount: ns.dividendAmount ? parseFloat(ns.dividendAmount) : 0,
                frankingCredits: ns.frankingCredits ? parseFloat(ns.frankingCredits) : 0,
            };

            if (ns.notes) {
                shareData.comments = [{
                    body: ns.notes,
                    date: new Date().toISOString()
                }];
            }

            return userStore.addShare(userId, shareData);
        });

        try {
            await Promise.all([...updatePromises, ...addPromises]);
            ToastManager.show(`Successfully processed ${total} items.`, 'success');
        } catch (err) {
            console.error('[DataManagementUI] Sync failed:', err);
            ToastManager.error('Failed to update some records. Check console.');
        }
    }
}
