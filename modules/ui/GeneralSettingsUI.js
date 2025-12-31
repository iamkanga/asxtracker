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

                        <!-- Reload App (User Request: "Previously there was a Reload... at the bottom") -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="gen-reload-row" style="cursor: pointer; margin-top: 15px; display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Reload App</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Refresh application state</div>
                            </div>
                            <i class="fas ${UI_ICONS.SYNC}" style="color: var(--text-muted); font-size: 1.1rem;"></i>
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
                    ToastManager.error("Biometric setup failed.");
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

        // Reload App
        modal.querySelector('#gen-reload-row').addEventListener('click', () => {
            window.location.reload(true);
        });

        // Delete Data
        modal.querySelector('#gen-delete-row').addEventListener('click', () => {
            // GeneralSettingsUI._close(modal); // Close self first
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_DATA));
        });



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
                s.entryDate || ''
            ].join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }
}
