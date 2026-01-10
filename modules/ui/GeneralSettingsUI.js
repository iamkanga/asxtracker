/**
 * GeneralSettingsUI.js
 * Central hub for App, Security, and Data settings.
 * Refined for Professional UI/UX.
 */

import { CSS_CLASSES, UI_ICONS, IDS, EVENTS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { SecurityUI } from './SecurityUI.js';
import { userStore } from '../data/DataService.js';
import { SyncManager } from '../controllers/SyncManager.js';

export class GeneralSettingsUI {

    static showModal(controller) {
        const existing = document.getElementById('general-settings-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'general-settings-modal';
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        const prefs = AppState.preferences.security;
        const isBiometricSupported = controller.securityController.isBiometricSupported;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Settings</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                
                <div class="${CSS_CLASSES.MODAL_BODY}">
                    
                    <!-- 1. SECURITY SECTION -->
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}">
                        <h4 class="${CSS_CLASSES.SIDEBAR_SECTION_TITLE}" style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.75rem; letter-spacing: 1px;">Security</h4>
                        
                        <!-- Biometric Toggle -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Biometric Access</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Unlock using Face ID or Fingerprint</div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="gen-bio-toggle" ${prefs.isBiometricEnabled ? 'checked' : ''} ${isBiometricSupported ? '' : 'disabled'}>
                                <span class="slider round"></span>
                            </label>
                        </div>

                        <!-- PIN Toggle -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">PIN Access</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Require 4-digit PIN</div>
                            </div>
                             <label class="toggle-switch">
                                <input type="checkbox" id="gen-pin-toggle" ${prefs.isPinEnabled ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                         <div id="gen-pin-setup-area" style="margin-top: 5px; ${prefs.isPinEnabled ? '' : 'display: none;'}">
                            <button id="gen-change-pin-btn" class="${CSS_CLASSES.BTN_TEXT_SMALL} ${CSS_CLASSES.TEXT_ACCENT}" style="padding: 0; font-weight: 600;">Change PIN</button>
                        </div>
                    </div>

                    <hr class="settings-divider" style="border: 0; border-top: 1px solid var(--border-color); margin: 20px 0;">

                    <!-- 2. DATA SECTION -->
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}">
                        <h4 class="${CSS_CLASSES.SIDEBAR_SECTION_TITLE}" style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.75rem; letter-spacing: 1px;">Data Management</h4>
                        
                        <!-- Download Logic -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="gen-download-row" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Download Data</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Export records to file</div>
                            </div>
                            <i class="fas fa-chevron-right ${CSS_CLASSES.TEXT_MUTED}" style="transition: transform 0.3s ease;"></i>
                        </div>

                         <!-- 3. PORTFOLIO SYNC -->
                        <div class="${CSS_CLASSES.SETTINGS_SECTION}" style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 25px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                <i class="fas fa-sync-alt" style="color: var(--color-accent); font-size: 1rem;"></i>
                                <h4 class="${CSS_CLASSES.SIDEBAR_SECTION_TITLE}" style="margin-bottom: 0; color: var(--text-muted); font-size: 0.75rem; letter-spacing: 1px;">Portfolio Sync</h4>
                            </div>
                            
                            <div class="${CSS_CLASSES.SETTING_ROW}" style="flex-direction: column; gap: 8px; align-items: flex-start; padding: 10px 0;">
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Import from Sharesight</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}" style="line-height: 1.4; margin-bottom: 10px;">
                                    Upload your "All Trades Report" CSV to update unit counts and purchase dates for your current items.
                                </div>
                                
                                <div style="display: flex; gap: 10px; width: 100%;">
                                    <button id="gen-sync-upload" class="standard-btn" style="flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: white; padding: 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 600; transition: all 0.2s;">
                                        <i class="fas fa-file-csv" style="font-size: 1.1rem;"></i> Select CSV
                                    </button>
                                    <input type="file" id="gen-input-sync-csv" accept=".csv,.tsv,text/csv,text/tab-separated-values" style="display: none;">
                                </div>
                            </div>
                        </div>

                        <!-- Expanded Download Options (Color Coded to Coffee/Accent) -->
                        <div class="${CSS_CLASSES.HIDDEN}" id="gen-download-options" style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-top: 5px; display: flex; gap: 10px; align-items: center;">
                             <!-- CSV Button -->
                             <button id="gen-download-csv" style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 12px; background: transparent; border: 1px solid var(--text-accent); border-radius: 6px; color: var(--text-accent); transition: all 0.2s;">
                                <i class="fas fa-file-csv" style="font-size: 1.5rem; margin-bottom: 5px;"></i>
                                <span style="font-size: 0.8rem; font-weight: 600;">CSV</span>
                             </button>
                             <!-- PDF Button -->
                             <button id="gen-download-pdf" style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 12px; background: transparent; border: 1px solid var(--text-accent); border-radius: 6px; color: var(--text-accent); transition: all 0.2s;">
                                <i class="fas fa-file-pdf" style="font-size: 1.5rem; margin-bottom: 5px;"></i>
                                <span style="font-size: 0.8rem; font-weight: 600;">PDF</span>
                             </button>
                        </div>



                        <!-- Delete Data (No Border, just icon red) -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="gen-delete-row" style="cursor: pointer; margin-top: 5px; display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="color: var(--color-negative); font-size: 0.95rem;">Delete Data</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Reset app and clear cache</div>
                            </div>
                            <i class="fas fa-trash-alt" style="color: var(--color-negative); font-size: 1.1rem;"></i>
                        </div>
                    </div>



                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Navigation Hook
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).click();
            }
        });

        // BIND EVENTS ---------------------------------------------------------

        // Close
        const close = () => {
            modal.remove();
            navManager.popStateSilently();
        };
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);


        // --- SECURITY ---

        // Biometric Toggle
        const bioToggle = modal.querySelector('#gen-bio-toggle');
        bioToggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                const success = await controller.securityController.enableBiometric();
                if (!success) {
                    e.target.checked = false;
                    // Controller handles specific error toasts (IP limit, etc.)
                } else {
                    ToastManager.success("Biometric enabled.");
                }
            } else {
                AppState.saveSecurityPreferences({ isBiometricEnabled: false });
            }
        });

        // PIN Toggle
        const pinToggle = modal.querySelector('#gen-pin-toggle');
        pinToggle.addEventListener('change', (e) => {
            const setupArea = modal.querySelector('#gen-pin-setup-area');
            if (e.target.checked) {
                SecurityUI.renderPinSetup(controller.securityController, () => {
                    setupArea.style.display = 'block';
                    ToastManager.success("PIN enabled.");
                }, () => {
                    e.target.checked = false; // Cancelled
                });
            } else {
                controller.securityController.disablePin();
                setupArea.style.display = 'none';
            }
        });

        // Change PIN
        modal.querySelector('#gen-change-pin-btn').addEventListener('click', () => {
            SecurityUI.renderPinSetup(controller.securityController, () => ToastManager.success("PIN updated."));
        });


        // --- DATA ---

        // Download Expand
        const dlRow = modal.querySelector('#gen-download-row');
        dlRow.addEventListener('click', () => {
            // Architectural Fix: Dispatch global event instead of local expand
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DOWNLOAD_DATA));
            GeneralSettingsUI._close(modal);
        });

        // Download Actions consolidated below in Section 3

        modal.querySelector('#gen-download-pdf').addEventListener('click', () => {
            // Create a printable view
            const printWindow = window.open('', '_blank');
            const shares = AppState.data.shares || [];

            let rows = '';
            shares.forEach(s => {
                const live = AppState.livePrices.get(s.code || s.shareName);
                const price = live ? live.live : (s.currentPrice || s.enteredPrice || 0);
                const code = s.code || s.shareName || s.symbol || '-';
                rows += `
                    <tr>
                        <td>${code}</td>
                        <td>$${price.toFixed(3)}</td>
                        <td>$${s.enteredPrice || 0}</td>
                        <td>${s.portfolioShares || 0}</td>
                        <td>${s.entryDate || '-'}</td>
                    </tr>
                `;
            });

            const html = `
                <html>
                <head>
                    <title>ASX Watchlist Data</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; }
                        h1 { font-size: 18px; margin-bottom: 10px; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
                        th { background-color: #f0f0f0; }
                    </style>
                </head>
                <body>
                    <h1>ASX Watchlist Data</h1>
                    <p>Export Date: ${new Date().toLocaleDateString()}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Price</th>
                                <th>Buy Price</th>
                                <th>Units</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                    <script>
                        // QA Audit Fix: Avoid window.onload pollution
                        setTimeout(() => { 
                            window.print(); 
                            window.close(); 
                        }, 500);
                    </script>
                </body>
                </html>
             `;

            printWindow.document.write(html);
            printWindow.document.close();
            this._close(modal); // Close Settings Modal
        });

        // 3. Download Handlers (Auto-Close)
        const csvBtn = modal.querySelector(`#${IDS.BTN_DOWNLOAD_CSV}`) || modal.querySelector('#gen-download-csv');
        if (csvBtn) {
            csvBtn.addEventListener('click', () => {
                const csvData = GeneralSettingsUI._generateCSV(AppState.data.shares || []);
                const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `asx_watchlist_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                GeneralSettingsUI._close(modal); // Close Settings Modal
            });
        }



        // Delete Data
        modal.querySelector('#gen-delete-row').addEventListener('click', () => {
            GeneralSettingsUI._close(modal); // Close self first
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_DATA));
        });

        // --- SYNC ---
        const syncBtn = modal.querySelector('#gen-sync-upload');
        const syncFileInput = modal.querySelector('#gen-input-sync-csv');

        if (syncBtn && syncFileInput) {
            syncBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[GeneralSettingsUI] Triggering CSV picker...');
                syncFileInput.click();
            });

            syncFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                console.log('[GeneralSettingsUI] CSV Selected:', file.name);
                const reader = new FileReader();
                reader.onload = (event) => {
                    const text = event.target.result;
                    this._showSyncSimulation(text);
                    // Reset input so same file can be selected again
                    syncFileInput.value = '';
                };
                reader.readAsText(file);
            });
        }
    }

    static _showSyncSimulation(csvText) {
        const { matches, ignored } = SyncManager.simulateSync(csvText);

        const simulationModal = document.createElement('div');
        simulationModal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        simulationModal.style.zIndex = '3000'; // Above the general settings modal

        const matchRows = matches.map(m => `
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="font-weight: 700; color: var(--color-accent);">${m.code}</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${m.dateStr} (${m.type})</span>
            </div>
        `).join('');

        simulationModal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}" style="background: rgba(0,0,0,0.8);"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}" style="max-width: 420px; padding: 25px; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color);">
                <h3 style="margin-top: 0; color: white; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-glasses" style="color: var(--color-accent);"></i> Sync Preview
                </h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5;">
                    Matched <strong>${matches.length}</strong> items in your watchlist. 
                    Ignored ${ignored.length} codes not currently tracked.
                </p>
                
                <div style="max-height: 250px; overflow-y: auto; margin-bottom: 25px; padding-right: 8px;">
                    ${matches.length > 0 ? matchRows : '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No matches found.</p>'}
                </div>

                <div style="display: flex; gap: 12px;">
                    <button id="btn-sim-cancel" class="standard-btn" style="flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-color); color: white; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel</button>
                    ${matches.length > 0 ? `<button id="btn-sim-commit" class="standard-btn" style="flex: 1; background: var(--color-accent); border: none; color: white; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">Commit Changes</button>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(simulationModal);

        simulationModal.querySelector('#btn-sim-cancel').addEventListener('click', () => {
            simulationModal.remove();
        });

        const commitBtn = simulationModal.querySelector('#btn-sim-commit');
        if (commitBtn) {
            commitBtn.addEventListener('click', () => {
                this._commitSync(matches);
                simulationModal.remove();
            });
        }
    }

    static async _commitSync(matches) {
        if (!AppState.user) return;

        ToastManager.show(`Syncing ${matches.length} items...`, 'info');
        console.log('[GeneralSettingsUI] Committing sync matches:', matches);

        try {
            const userId = AppState.user.uid;

            // Iterate through matches and update each record
            const promises = matches.map(match => {
                const qty = parseFloat(match.quantity);
                if (isNaN(qty) || qty < 0) {
                    console.warn('[GeneralSettingsUI] Skipping invalid quantity match:', match);
                    return null;
                }

                const updateData = {
                    portfolioShares: qty.toString()
                };

                // Only update price and date if they are present (Trades Mode)
                if (!match.isHoldingsOnly) {
                    updateData.portfolioAvgPrice = match.costBase > 0 ? match.costBase.toString() : match.price.toString();
                    updateData.purchaseDate = match.date.toISOString().split('T')[0];
                }

                return userStore.updateShare(userId, match.shareId, updateData);
            }).filter(p => p !== null);

            await Promise.all(promises);

            ToastManager.show(`Successfully updated ${matches.length} holdings.`, 'success');
        } catch (error) {
            console.error('[GeneralSettingsUI] Sync commit failed:', error);
            ToastManager.show('Sync failed. Check console for details.', 'error');
        }
    }

    static _close(modal) {
        modal.classList.add(CSS_CLASSES.HIDDEN);
        setTimeout(() => modal.remove(), 300);
        navManager.popStateSilently();
    }

    static _generateCSV(shares) {
        if (!shares || !shares.length) return '';
        // User requested: "Name column displays code... rename it code and actual code column can be removed"
        // Interpretation: Single ID column named 'Code', then Price...
        const headers = ['Code', 'Price', 'Buy Price', 'Units', 'Brokerage', 'Purchase Date'];
        const rows = shares.map(s => {
            const code = s.code || s.shareCode || s.shareName || s.symbol || '-';
            const live = AppState.livePrices.get(code);
            const price = live ? live.live : (s.currentPrice || s.enteredPrice || 0);

            return [
                `"${code}"`, // Use quotes for CSV safety
                price,
                s.enteredPrice || 0,
                s.portfolioShares || 0,
                s.brokerage || 0,
                s.purchaseDate || s.entryDate || ''
            ].join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }
}
