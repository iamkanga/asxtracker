/**
 * DataManagementUI.js
 * Central hub for Data Export and Import/Sync operations.
 * Replaces simple "Download" settings with a robust management tool.
 */

import { CSS_CLASSES, UI_ICONS, IDS, EVENTS } from '../utils/AppConstants.js';
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
                        <i class="fas fa-file-import" style="margin-right: 8px;"></i> Import / Sync
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
                            <h3 style="color: white; margin-bottom: 8px; font-size: 1.1rem;">Update Portfolio</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5;">
                                Upload a Sharesight export or paste data directly to update your unit counts and purchase dates.
                            </p>
                        </div>

                        <!-- Option A: File Upload -->
                        <div class="import-option" style="background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center; cursor: pointer; transition: all 0.2s;" id="dm-drop-zone">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 1.5rem; color: var(--text-muted); margin-bottom: 10px;"></i>
                            <div style="font-weight: 600; color: white; margin-bottom: 4px;">Upload File</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Sharesight 'All Trades', 'Holdings' or 'Performance' CSV</div>
                            <input type="file" id="dm-file-input" accept=".csv" style="display: none;">
                        </div>

                        <div style="display: flex; align-items: center; margin: 20px 0;">
                            <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
                            <span style="padding: 0 10px; color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">OR PASTE DATA</span>
                            <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
                        </div>

                        <!-- Option B: Paste Template -->
                        <div class="import-option">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <label style="color: white; font-weight: 600; font-size: 0.9rem;">Paste Data</label>
                                <button id="dm-btn-template" class="btn-text-only" style="font-size: 0.75rem; color: var(--color-accent); background: none; border: none; cursor: pointer; text-decoration: underline;">
                                    <i class="fas fa-download"></i> Get Template
                                </button>
                            </div>
                            <textarea id="dm-paste-area" placeholder="Code, Date, Type, Quantity, Price..." style="width: 100%; height: 120px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 12px; font-family: monospace; font-size: 0.85rem; resize: vertical;"></textarea>
                            
                            <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                                <button id="dm-btn-process-paste" class="standard-btn" style="background: var(--color-accent); color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer; opacity: 0.5; pointer-events: none;">
                                    Process Data
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
        const pasteArea = modal.querySelector('#dm-paste-area');
        const processPasteBtn = modal.querySelector('#dm-btn-process-paste');

        // File Selection
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this._processFile(file);
        });

        // Paste Logic
        pasteArea.addEventListener('input', (e) => {
            const hasText = e.target.value.trim().length > 0;
            processPasteBtn.style.opacity = hasText ? '1' : '0.5';
            processPasteBtn.style.pointerEvents = hasText ? 'auto' : 'none';
        });

        processPasteBtn.addEventListener('click', () => {
            const text = pasteArea.value;
            if (text) this._simulateSyncWrapper(text);
        });

        // Download Template
        modal.querySelector('#dm-btn-template').addEventListener('click', () => {
            const template = "Code,Date,Type,Quantity,Buy Price\nCBA,2024-01-01,Buy,10,105.50\nBHP,2024-02-15,Buy,50,45.20";
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

        const headers = ['Code', 'Price', 'Buy Price', 'Units', 'Brokerage', 'Purchase Date'];
        const rows = shares.map(s => {
            const code = s.code || s.shareName || s.symbol || '-';
            const live = AppState.livePrices.get(code);
            const price = live ? live.live : (s.currentPrice || s.enteredPrice || 0);

            return [
                `"${code}"`,
                price,
                s.enteredPrice || 0,
                s.portfolioShares || 0,
                s.brokerage || 0,
                s.purchaseDate || ''
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
        // Simple Print View
        const printWindow = window.open('', '_blank');
        const shares = AppState.data.shares || [];

        // ... (Same HTML generation as before) ...
        // Simplified for brevity, functional equivalent
        let rows = '';
        shares.forEach(s => {
            const live = AppState.livePrices.get(s.code || s.shareName);
            const price = live ? live.live : (s.currentPrice || s.enteredPrice || 0);
            rows += `<tr><td>${s.code || s.shareName}</td><td>$${price.toFixed(3)}</td><td>${s.portfolioShares || 0}</td></tr>`;
        });

        const html = `
            <html><head><title>Export</title>
            <style>body{font-family:sans-serif}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}</style>
            </head><body><h2>Watchlist Data</h2><table><thead><tr><th>Code</th><th>Price</th><th>Units</th></tr></thead><tbody>${rows}</tbody></table>
            <script>setTimeout(()=>{window.print();window.close()},500)</script></body></html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
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
        const { matches, ignored } = SyncManager.simulateSync(csvText);

        // Close self
        const existing = document.getElementById('data-management-modal');
        if (existing) existing.remove();

        // Show result (using the existing logic in GeneralSettingsUI for now, or we can move it here)
        // For now, let's just use the GeneralSettingsUI static method if accessible, or replicate.
        // Better: Delegate back to SyncManager or duplicte the simple UI.

        // Let's implement a simple Result Modal here directly to be self-contained
        this._showSyncResult(matches, ignored);
    }

    static _showSyncResult(matches, ignored) {
        const modal = document.createElement('div');
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        modal.style.zIndex = '3000';

        const matchRows = matches.map(m => `
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="font-weight: 700; color: var(--color-accent);">${m.code}</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${m.quantity} units @ $${m.price || '-'}</span>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}" style="background: rgba(0,0,0,0.8);"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}" style="max-width: 400px; padding: 25px;">
                <h3 style="color: white;">Sync Preview</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Found ${matches.length} matches to update.</p>
                
                <div style="max-height: 300px; overflow-y: auto; margin: 20px 0; border: 1px solid var(--border-color); padding: 10px; border-radius: 4px;">
                    ${matches.length > 0 ? matchRows : 'No matches found.'}
                </div>

                <div style="display: flex; gap: 10px;">
                    <button id="res-cancel" class="standard-btn" style="flex: 1; background: var(--bg-secondary);">Cancel</button>
                    ${matches.length > 0 ? `<button id="res-commit" class="standard-btn" style="flex: 1; background: var(--color-accent);">Update Records</button>` : ''}
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

        if (commitBtn) {
            commitBtn.addEventListener('click', async () => {
                await this._commitSync(matches);
                closeModal();
            });
        }
    }

    static async _commitSync(matches) {
        if (!AppState.user) return;
        ToastManager.show(`Updating ${matches.length} records...`, 'info');

        // Direct DB Update Logic (Replicated from GeneralSettingsUI for independence)
        const userId = AppState.user.uid;
        const promises = matches.map(match => {
            const updateData = { portfolioShares: match.quantity.toString() };
            if (!match.isHoldingsOnly && match.price) {
                updateData.purchaseDate = match.dateStr || new Date().toISOString().split('T')[0];
                updateData.portfolioAvgPrice = match.price.toString();
            }
            return userStore.updateShare(userId, match.shareId, updateData);
        });

        await Promise.all(promises);
        ToastManager.show('Portfolio updated successfully.', 'success');
    }
}
