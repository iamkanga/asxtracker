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
import { DataManagementUI } from './DataManagementUI.js';

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
                        
                        <!-- NEW: Unified Data Management Hub -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="gen-data-mgmt-row" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Data Tools</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Export, Import & Sync</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 0.75rem; color: var(--color-accent); font-weight: 600;">Manage</span>
                                <i class="fas fa-chevron-right ${CSS_CLASSES.TEXT_MUTED}"></i>
                            </div>
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
        // Open Data Management Hub
        const dataRow = modal.querySelector('#gen-data-mgmt-row');
        if (dataRow) {
            dataRow.addEventListener('click', () => {
                // Close this modal first, then open the new one
                GeneralSettingsUI._close(modal);
                DataManagementUI.showModal();
            });
        }

        // Delete Data
        modal.querySelector('#gen-delete-row').addEventListener('click', () => {
            GeneralSettingsUI._close(modal); // Close self first
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_DATA));
        });
    }

    static _close(modal) {
        modal.classList.add(CSS_CLASSES.HIDDEN);
        setTimeout(() => modal.remove(), 300);
        navManager.popStateSilently();
    }

}
