/**
 * GeneralSettingsUI.js
 * Central hub for App, Security, and Data settings.
 * Refined for Professional UI/UX.
 */

import { CSS_CLASSES, UI_ICONS, IDS, EVENTS, STORAGE_KEYS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { SecurityUI } from './SecurityUI.js';
import { userStore } from '../data/DataService.js';
import { SyncManager } from '../controllers/SyncManager.js';
import { DataManagementUI } from './DataManagementUI.js';

export class GeneralSettingsUI {

    static showModal(controller) {
        const existing = document.getElementById(IDS.GENERAL_SETTINGS_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.GENERAL_SETTINGS_MODAL;
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
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}" style="margin-bottom: 50px;">
                        <h4 class="${CSS_CLASSES.SIDEBAR_SECTION_TITLE}" style="margin-bottom: 15px; color: var(--color-accent); font-size: 0.85rem; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1px solid rgba(var(--color-accent-rgb), 0.2); padding-bottom: 8px; font-weight: 800;">Security</h4>
                        
                        <!-- Biometric Toggle -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Biometric Access</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Unlock using Face ID or Fingerprint</div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="${IDS.GEN_BIO_TOGGLE}" ${prefs.isBiometricEnabled ? 'checked' : ''} ${isBiometricSupported ? '' : 'disabled'}>
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
                                <input type="checkbox" id="${IDS.GEN_PIN_TOGGLE}" ${prefs.isPinEnabled ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                         <div id="${IDS.GEN_PIN_SETUP_AREA}" style="margin-top: 5px; ${prefs.isPinEnabled ? '' : 'display: none;'}">
                            <button id="${IDS.GEN_CHANGE_PIN_BTN}" class="${CSS_CLASSES.BTN_TEXT_SMALL} ${CSS_CLASSES.TEXT_ACCENT}" style="padding: 0; font-weight: 600;">Change PIN</button>
                        </div>
                    </div>

                        <!-- 3. DATA SECTION -->
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}">
                        <h4 class="${CSS_CLASSES.SIDEBAR_SECTION_TITLE}" style="margin-bottom: 15px; color: var(--color-accent); font-size: 0.85rem; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1px solid rgba(var(--color-accent-rgb), 0.2); padding-bottom: 8px; font-weight: 800;">Data Management</h4>
                        
                        <!-- NEW: Unified Data Management Hub -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="${IDS.GEN_DATA_MGMT_ROW}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
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
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="${IDS.GEN_DELETE_ROW}" style="cursor: pointer; margin-top: 5px; display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
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
        const bioToggle = modal.querySelector(`#${IDS.GEN_BIO_TOGGLE}`);
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
        const pinToggle = modal.querySelector(`#${IDS.GEN_PIN_TOGGLE}`);
        pinToggle.addEventListener('change', (e) => {
            const setupArea = modal.querySelector(`#${IDS.GEN_PIN_SETUP_AREA}`);
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
        modal.querySelector(`#${IDS.GEN_CHANGE_PIN_BTN}`).addEventListener('click', () => {
            SecurityUI.renderPinSetup(controller.securityController, () => ToastManager.success("PIN updated."));
        });


        // --- DATA ---
        // Open Data Management Hub
        const dataRow = modal.querySelector(`#${IDS.GEN_DATA_MGMT_ROW}`);
        if (dataRow) {
            dataRow.addEventListener('click', () => {
                // Stack on top

                DataManagementUI.showModal();
            });
        }

        // Delete Data
        modal.querySelector(`#${IDS.GEN_DELETE_ROW}`).addEventListener('click', () => {
            GeneralSettingsUI._close(modal); // Close self first
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_DATA));
        });
    }

    static _getStrengthLabel(val) {
        val = parseFloat(val);
        if (val === 0) return 'None';
        if (val <= 0.125) return 'Muted';
        if (val <= 0.25) return 'Subtle';
        if (val <= 0.4) return 'Light';
        if (val <= 0.6) return 'Medium';
        return 'Strong';
    }

    static _close(modal) {
        modal.classList.add(CSS_CLASSES.HIDDEN);
        setTimeout(() => modal.remove(), 300);
        navManager.popStateSilently();
    }

    static _renderBorderSelector() {
        const existing = document.getElementById(IDS.BORDER_SELECTOR_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.BORDER_SELECTOR_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        const prefs = AppState.preferences.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };
        const sides = prefs.sides; // [T, R, B, L]

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="max-width: 450px;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Card Customization</h2>
                    <div class="${CSS_CLASSES.FLEX_ROW}" style="gap: 15px;">
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" style="font-size: 1.5rem;"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                    </div>
                </div>
                
                <div class="${CSS_CLASSES.MODAL_BODY}" style="display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 35px 25px;">
                    
                    <!-- BOX SELECTOR WIDGET -->
                    <div id="${IDS.BORDER_BOX_WIDGET}" style="width: 150px; height: 150px; position: relative; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);">
                        <!-- Clickable Edges (ENLARGED FOR MOBILE) -->
                        <div class="border-edge edge-top ${sides[0] ? CSS_CLASSES.ACTIVE : ''}" data-side="0" style="position: absolute; top: -15px; left: 0; width: 100%; height: 35px; cursor: pointer; z-index: 10;"></div>
                        <div class="border-edge edge-right ${sides[1] ? CSS_CLASSES.ACTIVE : ''}" data-side="1" style="position: absolute; top: 0; right: -15px; width: 35px; height: 100%; cursor: pointer; z-index: 10;"></div>
                        <div class="border-edge edge-bottom ${sides[2] ? CSS_CLASSES.ACTIVE : ''}" data-side="2" style="position: absolute; bottom: -15px; left: 0; width: 100%; height: 35px; cursor: pointer; z-index: 10;"></div>
                        <div class="border-edge edge-left ${sides[3] ? CSS_CLASSES.ACTIVE : ''}" data-side="3" style="position: absolute; top: 0; left: -15px; width: 35px; height: 100%; cursor: pointer; z-index: 10;"></div>
                        
                        <!-- Visual Feedback Borders -->
                        <div class="border-visual visual-top" style="position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: ${sides[0] ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}; transition: background 0.2s;"></div>
                        <div class="border-visual visual-right" style="position: absolute; top: 0; right: 0; width: 4px; height: 100%; background: ${sides[1] ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}; transition: background 0.2s;"></div>
                        <div class="border-visual visual-bottom" style="position: absolute; bottom: 0; left: 0; width: 100%; height: 4px; background: ${sides[2] ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}; transition: background 0.2s;"></div>
                        <div class="border-visual visual-left" style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${sides[3] ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}; transition: background 0.2s;"></div>
                        
                        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-muted); font-size: 0.6rem; text-align: center; pointer-events: none; opacity: 0.4; letter-spacing: 1px;">
                            TAP EDGES
                        </div>
                    </div>

                    <!-- THICKNESS CONTROL -->
                    <div style="width: 100%; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 30px;">
                        <div class="${CSS_CLASSES.DETAIL_LABEL}" style="text-align: center; margin-bottom: 25px; font-size: 0.8rem; letter-spacing: 2px; color: var(--text-muted); font-weight: 800;">THICKNESS</div>
                        <div class="thickness-selector-refined" style="display: flex; justify-content: space-around; width: 100%; gap: 15px;">
                            <div class="thickness-option ${prefs.thickness === 1 ? CSS_CLASSES.ACTIVE : ''}" data-value="1">1px</div>
                            <div class="thickness-option ${prefs.thickness === 2 ? CSS_CLASSES.ACTIVE : ''}" data-value="2">2px</div>
                            <div class="thickness-option ${prefs.thickness === 3 ? CSS_CLASSES.ACTIVE : ''}" data-value="3">3px</div>
                            <div class="thickness-option ${prefs.thickness === 4 ? CSS_CLASSES.ACTIVE : ''}" data-value="4">4px</div>
                            <div class="thickness-option ${prefs.thickness === 5 ? CSS_CLASSES.ACTIVE : ''}" data-value="5">5px</div>
                            <div class="thickness-option ${prefs.thickness === 6 ? CSS_CLASSES.ACTIVE : ''}" data-value="6">6px</div>
                        </div>
                    </div>

                    <!-- PORTFOLIO BACKGROUND TOGGLE -->
                    <div style="width: 100%; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 35px; margin-top: 10px; display: flex; align-items: center; justify-content: space-between;">
                         <div>
                            <div class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.8rem; letter-spacing: 2px; color: var(--text-muted); font-weight: 800; margin-bottom: 6px;">PORTFOLIO BACKGROUND</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); opacity: 0.8;">Show chart lines on portfolio cards</div>
                        </div>
                        <div id="chart-bg-toggle" class="square-radio-btn ${prefs.showCardCharts !== false ? 'selected' : ''}" style="cursor: pointer; width: 22px; height: 22px; border: 2px solid var(--text-muted); padding: 3px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <div class="inner-square" style="width: 100%; height: 100%; background: var(--color-accent); opacity: ${prefs.showCardCharts !== false ? '1' : '0'}; transition: opacity 0.2s;"></div>
                        </div>
                    </div>

                </div>
            </div>
            <style>
                .thickness-option {
                    padding: 12px 6px;
                    font-size: 0.95rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: var(--text-muted);
                    border-bottom: 3px solid transparent;
                    flex: 1;
                    text-align: center;
                }
                .thickness-option.${CSS_CLASSES.ACTIVE} {
                    color: var(--color-accent) !important;
                    border-bottom: 3px solid var(--color-accent) !important;
                }
                .thickness-option:hover {
                    color: white;
                }
            </style>
        `;

        document.body.appendChild(modal);
        navManager.pushState(() => modal.remove());

        // Logic
        const currentSides = [...sides];
        let currentThickness = prefs.thickness;

        const widget = modal.querySelector(`#${IDS.BORDER_BOX_WIDGET}`);
        const edges = widget.querySelectorAll('.border-edge');

        // Toggle Logic
        const chartToggle = modal.querySelector('#chart-bg-toggle');
        const innerSquare = chartToggle.querySelector('.inner-square');

        // Initial Coloring State Check
        if (prefs.showCardCharts !== false) {
            chartToggle.classList.add('selected');
            chartToggle.style.borderColor = 'var(--color-accent)';
            innerSquare.style.opacity = '1';
        } else {
            chartToggle.classList.remove('selected');
            chartToggle.style.borderColor = 'var(--text-muted)';
            innerSquare.style.opacity = '0';
        }

        chartToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const isCurrentlySelected = chartToggle.classList.contains('selected');
            const newState = !isCurrentlySelected;

            if (newState) {
                chartToggle.classList.add('selected');
                chartToggle.style.borderColor = 'var(--color-accent)';
                innerSquare.style.opacity = '1';
            } else {
                chartToggle.classList.remove('selected');
                chartToggle.style.borderColor = 'var(--text-muted)';
                innerSquare.style.opacity = '0';
            }

            // Save
            AppState.saveBorderPreferences({ sides: currentSides, thickness: currentThickness, showCardCharts: newState });
            document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
        });

        edges.forEach(edge => {
            edge.addEventListener('click', () => {
                const sideIdx = parseInt(edge.dataset.side);
                currentSides[sideIdx] = currentSides[sideIdx] ? 0 : 1;

                const sideNames = ['top', 'right', 'bottom', 'left'];
                const visual = widget.querySelector(`.visual-${sideNames[sideIdx]}`);
                if (visual) {
                    visual.style.background = currentSides[sideIdx] ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)';
                }
                edge.classList.toggle(CSS_CLASSES.ACTIVE, currentSides[sideIdx] === 1);

                // Immediate Update (USER REQUEST)
                AppState.saveBorderPreferences({ sides: currentSides, thickness: currentThickness });
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });

        const thicknessOpts = modal.querySelectorAll('.thickness-option');
        thicknessOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                thicknessOpts.forEach(o => o.classList.remove(CSS_CLASSES.ACTIVE));
                opt.classList.add(CSS_CLASSES.ACTIVE);
                currentThickness = parseInt(opt.dataset.value);

                // Immediate Update (USER REQUEST)
                AppState.saveBorderPreferences({ sides: currentSides, thickness: currentThickness });
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });



        // Close
        const close = () => {
            modal.remove();
            navManager.popStateSilently();
        };
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);
    }
}
