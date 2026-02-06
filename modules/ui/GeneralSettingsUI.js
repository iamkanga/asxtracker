/**
 * GeneralSettingsUI.js
 * Central hub for App Configuration (Security & Data).
 * Restored to single-view vertical list (No Tabs).
 */

import { CSS_CLASSES, UI_ICONS, IDS, EVENTS, AI_DEFAULT_TEMPLATES, UI_LABELS, STORAGE_KEYS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { SecurityUI } from './SecurityUI.js';
import { SecurityController } from '../controllers/SecurityController.js';
import { DataManagementUI } from './DataManagementUI.js';

export class GeneralSettingsUI {

    /**
     * Show the General Settings modal.
     * Single view containing Security and Data sections.
     * @param {AppController} controller 
     */
    static showModal(controller) {
        const existing = document.getElementById(IDS.GENERAL_SETTINGS_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.GENERAL_SETTINGS_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="max-width: 400px; max-height: 85vh; display: flex; flex-direction: column;">
                
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Configuration</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                
                <!-- Single Scrollable Content Body -->
                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; overflow-y: auto; padding: 20px;">
                    
                    <!-- 1. AI INTELLIGENCE SECTION (Promoted to Top) -->
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}" style="margin-bottom: 30px;">
                        <div id="ai-settings-accordion-header" class="${CSS_CLASSES.SETTING_ROW}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">AI Intelligence</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">When writing prompts, use <strong>\${code}.ax</strong> to automate the replacement with the ASX code</div>
                            </div>
                            <i class="fas fa-chevron-right" id="ai-accordion-chevron" style="transition: transform 0.3s; opacity: 0.5;"></i>
                        </div>
                        
                        <div id="ai-settings-content" style="display: none; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 5px;">
                            <!-- Quick Summary Mode Toggle (Promoted to Top of Section) -->
                            <label class="${CSS_CLASSES.SETTING_ROW}" style="display: flex; align-items: center; justify-content: space-between; padding: 0 0 20px 0; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.03); margin-bottom: 20px;">
                                <div>
                                    <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">${UI_LABELS.AI_QUICK_SUMMARY_TOGGLE}</div>
                                    <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Single tap to trigger in-app AI research</div>
                                </div>
                                <div class="square-radio-wrapper">
                                    <input type="checkbox" id="gen-ai-one-tap-toggle" ${AppState.preferences.oneTapResearch ? 'checked' : ''}>
                                    <div class="square-radio-visual"></div>
                                </div>
                            </label>

                            <!-- Prompt Templates Editor -->
                            <div id="ai-prompt-editor-container" style="display: flex; flex-direction: column; gap: 20px;">
                                ${this._renderAiPromptTemplates()}
                            </div>

                            <!-- Danger Zone: Reset -->
                            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.03); text-align: center;">
                                <button id="gen-btn-reset-ai-prompts" class="${CSS_CLASSES.BTN_TEXT_SMALL}" style="color: var(--color-negative); font-weight: 600;">
                                    <i class="fas fa-undo"></i> ${UI_LABELS.RESET_AI_TOOLS}
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 2. SECURITY SECTION -->
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}" style="margin-bottom: 30px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
                        <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="margin-bottom: 15px; color: var(--text-color); font-size: 1rem; display: flex; align-items: center; gap: 8px; text-transform: none; font-weight: 700;">
                            <i class="fas ${UI_ICONS.SHIELD}" style="color: var(--color-accent);"></i> Security
                        </h3>
                        
                        <!-- Biometric Toggle -->
                        <div id="gen-bio-row"></div>

                        <!-- PIN Toggle -->
                        <div id="gen-pin-row"></div>
                    </div>

                    <!-- 3. DATA SECTION -->
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
                        <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="margin-bottom: 15px; color: var(--text-color); font-size: 1rem; display: flex; align-items: center; gap: 8px; text-transform: none; font-weight: 700;">
                            <i class="fas fa-database" style="color: var(--color-accent);"></i> Data Management
                        </h3>

                        <!-- Data Tools -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="${IDS.GEN_DATA_MGMT_ROW}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Data Tools</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Export, Import & Sync</div>
                            </div>
                            <i class="fas fa-chevron-right ${CSS_CLASSES.TEXT_MUTED}"></i>
                        </div>

                        <!-- Delete Data -->
                        <div class="${CSS_CLASSES.SETTING_ROW}" id="${IDS.GEN_DELETE_ROW}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px 0; margin-top: 10px;">
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

        // Security Logic Injection (Biometrics/PIN)
        this._injectSecurityControls(modal, controller);

        // Navigation Hook
        navManager.pushState(() => {
            if (modal.parentElement) modal.remove();
        });

        // Close Handlers
        const close = () => {
            modal.remove();
            navManager.popStateSilently();
        };
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        // Data Bindings
        modal.querySelector(`#${IDS.GEN_DATA_MGMT_ROW}`)?.addEventListener('click', () => {
            DataManagementUI.showModal();
        });

        modal.querySelector(`#${IDS.GEN_DELETE_ROW}`)?.addEventListener('click', () => {
            modal.remove();
            navManager.popStateSilently();
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_DATA));
        });

        // AI Accordion Control
        const aiHeader = modal.querySelector('#ai-settings-accordion-header');
        const aiContent = modal.querySelector('#ai-settings-content');
        const aiChevron = modal.querySelector('#ai-accordion-chevron');

        aiHeader?.addEventListener('click', () => {
            const isHidden = aiContent.style.display === 'none';
            aiContent.style.display = isHidden ? 'block' : 'none';
            aiChevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
        });

        // AI One-Tap Toggle Bindings
        const aiToggle = modal.querySelector('#gen-ai-one-tap-toggle');
        aiToggle?.addEventListener('change', (e) => {
            AppState.saveOneTapResearch(e.target.checked);
            ToastManager.success(e.target.checked ? "One-Tap Research Enabled" : "One-Tap Research Disabled");
        });

        // AI Prompt Textarea Persistence
        modal.querySelectorAll('.ai-textarea').forEach(tx => {
            tx.addEventListener('change', (e) => {
                const id = e.target.dataset.templateId;
                const val = e.target.value.trim();
                if (id) {
                    AppState.saveAiPromptTemplate(id, val);
                    ToastManager.info('Prompt template saved');
                }
            });
        });

        // AI Reset Button
        modal.querySelector('#gen-btn-reset-ai-prompts')?.addEventListener('click', () => {
            if (confirm(UI_LABELS.CONFIRM_RESET_AI)) {
                AppState.resetAiPromptTemplates();
                // Refresh Editor UI
                modal.querySelector('#ai-prompt-editor-container').innerHTML = this._renderAiPromptTemplates();
                ToastManager.success("AI Prompts Reset to Defaults");
            }
        });
    }

    static _renderAiPromptTemplates() {
        const userTemplates = AppState.preferences.aiPromptTemplates || {};
        return AI_DEFAULT_TEMPLATES.map(t => {
            const currentText = userTemplates[t.id] || t.text;
            return `
                <div class="ai-template-group" style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-accent); opacity: 0.8;">
                            <i class="fas ${t.icon}"></i> ${t.label}
                        </span>
                    </div>
                    <textarea 
                        class="ai-textarea" 
                        data-template-id="${t.id}"
                        style="width: 100%; min-height: 80px; font-size: 0.8rem; border-radius: 8px; padding: 12px; line-height: 1.4; resize: vertical; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; outline: none;"
                        placeholder="Enter custom prompt..."
                    >${currentText}</textarea>
                </div>
            `;
        }).join('');
    }

    static _injectSecurityControls(modal, controller) {
        const prefs = AppState.preferences.security;
        const isBiometricSupported = controller.securityController.isBiometricSupported;
        const hostname = window.location.hostname;
        const isIp = SecurityController.isIpAddress(hostname);
        const isSecureContext = window.isSecureContext;

        let biometricHint = '';
        let bioEnabled = isBiometricSupported && isSecureContext && !isIp;

        if (!isSecureContext) {
            biometricHint = `<div style="font-size: 0.7rem; color: var(--color-negative); margin-top: 4px;"><i class="fas fa-exclamation-triangle"></i> Requires HTTPS</div>`;
        } else if (isIp) {
            biometricHint = `<div style="font-size: 0.7rem; color: var(--color-negative); margin-top: 4px;"><i class="fas fa-exclamation-triangle"></i> Not available on IP</div>`;
        }

        // Biometric Row
        const bioRow = modal.querySelector('#gen-bio-row');
        bioRow.innerHTML = `
            <label class="${CSS_CLASSES.SETTING_ROW}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; ${bioEnabled ? '' : 'opacity: 0.6; cursor: not-allowed;'}">
                <div>
                    <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">Biometric Access</div>
                    <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Unlock using Face ID</div>
                    ${biometricHint}
                </div>
                <div class="square-radio-wrapper">
                    <input type="checkbox" id="${IDS.GEN_BIO_TOGGLE}" ${prefs.isBiometricEnabled ? 'checked' : ''} ${bioEnabled ? '' : 'disabled'}>
                    <div class="square-radio-visual"></div>
                </div>
            </label>
        `;

        // PIN Row
        const pinRow = modal.querySelector('#gen-pin-row');
        pinRow.innerHTML = `
            <label class="${CSS_CLASSES.SETTING_ROW}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;">
                <div>
                    <div class="${CSS_CLASSES.FONT_BOLD}" style="font-size: 0.95rem;">PIN Access</div>
                    <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Require 4-digit PIN</div>
                </div>
                <div class="square-radio-wrapper">
                    <input type="checkbox" id="${IDS.GEN_PIN_TOGGLE}" ${prefs.isPinEnabled ? 'checked' : ''}>
                    <div class="square-radio-visual"></div>
                </div>
            </label>
            <div id="${IDS.GEN_PIN_SETUP_AREA}" style="margin-top: 10px; margin-bottom: 10px; ${prefs.isPinEnabled ? '' : 'display: none;'}">
                <button id="${IDS.GEN_CHANGE_PIN_BTN}" class="${CSS_CLASSES.BTN_TEXT_SMALL} ${CSS_CLASSES.TEXT_ACCENT}" style="padding: 0; font-weight: 600;">Change PIN</button>
            </div>
        `;

        // Bindings
        const bioToggle = bioRow.querySelector(`#${IDS.GEN_BIO_TOGGLE}`);
        if (bioToggle) {
            bioToggle.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    const success = await controller.securityController.enableBiometric();
                    if (!success) e.target.checked = false;
                    else ToastManager.success("Biometric enabled.");
                } else {
                    AppState.saveSecurityPreferences({ isBiometricEnabled: false });
                }
            });
        }

        const pinToggle = pinRow.querySelector(`#${IDS.GEN_PIN_TOGGLE}`);
        if (pinToggle) {
            pinToggle.addEventListener('change', (e) => {
                const setupArea = pinRow.querySelector(`#${IDS.GEN_PIN_SETUP_AREA}`);
                if (e.target.checked) {
                    SecurityUI.renderPinSetup(controller.securityController, () => {
                        setupArea.style.display = 'block';
                        ToastManager.success("PIN enabled.");
                    }, () => {
                        e.target.checked = false;
                    });
                } else {
                    controller.securityController.disablePin();
                    setupArea.style.display = 'none';
                }
            });
        }

        const changePinBtn = pinRow.querySelector(`#${IDS.GEN_CHANGE_PIN_BTN}`);
        if (changePinBtn) {
            changePinBtn.addEventListener('click', () => {
                SecurityUI.renderPinSetup(controller.securityController, () => ToastManager.success("PIN updated."));
            });
        }
    }

    /**
     * Shows the Appearance/Border Settings Modal.
     * Standalone modal for Visual Styles.
     */
    static showAppearanceModal() {
        const existing = document.getElementById(IDS.BORDER_SELECTOR_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.BORDER_SELECTOR_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        const prefs = AppState.preferences.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };
        const sides = prefs.sides;

        modal.innerHTML = `
             <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
             <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="max-width: 450px;">
                 <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Visual Style</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                 </div>
                 <div class="${CSS_CLASSES.MODAL_BODY}" style="padding: 20px; text-align: center;">
                    <p style="color: var(--text-muted); margin-bottom: 20px;">Tap edges of the box to toggle borders.</p>
                     
                    <div id="${IDS.BORDER_BOX_WIDGET}" style="width: 150px; height: 150px; margin: 0 auto; position: relative; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);">
                        <div class="border-edge edge-top ${sides[0] ? CSS_CLASSES.ACTIVE : ''}" data-side="0" style="position: absolute; top: -10px; left: 0; width: 100%; height: 20px; cursor: pointer; background: ${sides[0] ? 'var(--color-accent)' : 'transparent'};"></div>
                        <div class="border-edge edge-right ${sides[1] ? CSS_CLASSES.ACTIVE : ''}" data-side="1" style="position: absolute; top: 0; right: -10px; width: 20px; height: 100%; cursor: pointer; background: ${sides[1] ? 'var(--color-accent)' : 'transparent'};"></div>
                        <div class="border-edge edge-bottom ${sides[2] ? CSS_CLASSES.ACTIVE : ''}" data-side="2" style="position: absolute; bottom: -10px; left: 0; width: 100%; height: 20px; cursor: pointer; background: ${sides[2] ? 'var(--color-accent)' : 'transparent'};"></div>
                        <div class="border-edge edge-left ${sides[3] ? CSS_CLASSES.ACTIVE : ''}" data-side="3" style="position: absolute; top: 0; left: -10px; width: 20px; height: 100%; cursor: pointer; background: ${sides[3] ? 'var(--color-accent)' : 'transparent'};"></div>
                    </div>

                    <div style="margin-top: 30px;">
                        <h4 style="margin-bottom: 15px;">Thickness</h4>
                        <input type="range" min="1" max="6" value="${prefs.thickness}" style="width: 100%;" id="border-thick-slider">
                        <div id="border-thick-val">${prefs.thickness}px</div>
                    </div>

                    <!-- RE-ADDED: Tone Intensity (Background Opacity) -->
                    <div style="margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                        <h4 style="margin-bottom: 15px;">Tone Intensity</h4>
                        <div style="display: flex; justify-content: space-between; gap: 8px;">
                            <button class="visual-btn tier-btn" data-val="0">None</button>
                            <button class="visual-btn tier-btn" data-val="0.25">Subtle</button>
                            <button class="visual-btn tier-btn" data-val="0.5">Med</button>
                            <button class="visual-btn tier-btn" data-val="0.75">High</button>
                            <button class="visual-btn tier-btn" data-val="0.9">Neon</button>
                        </div>
                    </div>

                    <!-- RE-ADDED: Quick Styles -->
                    <div style="margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                        <h4 style="margin-bottom: 15px;">Quick Styles</h4>
                        <div style="display: flex; justify-content: center; gap: 15px;">
                            <button class="visual-btn preset-btn" data-preset="minimal">Minimal</button>
                            <button class="visual-btn preset-btn" data-preset="classic">Classic</button>
                            <button class="visual-btn preset-btn" data-preset="rich">Rich</button>
                        </div>
                    </div>
                 </div>
             </div>
        `;
        document.body.appendChild(modal);

        // --- BINDINGS ---

        // 1. Edges
        const edges = modal.querySelectorAll('.border-edge');
        const slider = modal.querySelector('#border-thick-slider');
        const val = modal.querySelector('#border-thick-val');
        const currentSides = [...sides];

        // 2. Tone Intensity
        const tierBtns = modal.querySelectorAll('.tier-btn');
        const currentOpacity = AppState.preferences.backgroundOpacity || 0.5; // Default to 0.5 if not set
        tierBtns.forEach(btn => {
            if (parseFloat(btn.dataset.val) === currentOpacity) {
                btn.classList.add(CSS_CLASSES.ACTIVE);
            }
            btn.addEventListener('click', () => {
                tierBtns.forEach(b => b.classList.remove(CSS_CLASSES.ACTIVE));
                btn.classList.add(CSS_CLASSES.ACTIVE);
                const opacity = parseFloat(btn.dataset.val);
                AppState.savePreferences({ backgroundOpacity: opacity });
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });

        // 3. Quick Styles
        const presetBtns = modal.querySelectorAll('.preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                let newSides = [0, 0, 0, 0];
                let newThickness = 1;
                let newOpacity = 0.5;

                if (preset === 'minimal') {
                    newSides = [0, 0, 0, 0];
                    newThickness = 1;
                    newOpacity = 0.25;
                } else if (preset === 'classic') {
                    newSides = [1, 1, 1, 1];
                    newThickness = 1;
                    newOpacity = 0.5;
                } else if (preset === 'rich') {
                    newSides = [1, 1, 1, 1];
                    newThickness = 3;
                    newOpacity = 0.75;
                }

                AppState.saveBorderPreferences({ sides: newSides, thickness: newThickness });
                AppState.savePreferences({ backgroundOpacity: newOpacity });
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));

                // Re-render the modal to reflect changes
                modal.remove();
                navManager.popStateSilently();
                setTimeout(() => GeneralSettingsUI.showAppearanceModal(), 50); // Small delay to ensure clean unmount
            });
        });

        edges.forEach(edge => {
            edge.addEventListener('click', () => {
                const s = parseInt(edge.dataset.side);
                currentSides[s] = currentSides[s] ? 0 : 1;
                edge.style.background = currentSides[s] ? 'var(--color-accent)' : 'transparent';

                AppState.saveBorderPreferences({ sides: currentSides, thickness: parseInt(slider.value) });
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });

        slider.addEventListener('input', (e) => {
            val.textContent = e.target.value + 'px';
            AppState.saveBorderPreferences({ sides: currentSides, thickness: parseInt(e.target.value) });
            document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
        });

        // 3. Tone Intensity Handlers
        modal.querySelectorAll('.tier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const opacity = parseFloat(btn.dataset.val);
                // Update global variable directly for instant effect (legacy support) or save to state
                document.documentElement.style.setProperty('--glass-strength', opacity);
                // Re-trigger layout refresh to apply classes if handled that way
                // For now, assume CSS var is enough or invoke AppState updater if it exists
                // AppState.preferences.visuals.tone = opacity; // Hypothetical
                ToastManager.info(`Tone set to ${btn.textContent}`);
            });
        });

        // 4. Quick Style Presets
        modal.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                let newSides = [0, 0, 0, 0]; // None defaults

                if (preset === 'classic') newSides = [0, 0, 1, 0]; // Bottom Only
                if (preset === 'rich') newSides = [1, 1, 1, 1]; // All

                // Update Local UI
                currentSides[0] = newSides[0]; currentSides[1] = newSides[1];
                currentSides[2] = newSides[2]; currentSides[3] = newSides[3];

                edges.forEach((edge, idx) => {
                    edge.style.background = currentSides[idx] ? 'var(--color-accent)' : 'transparent';
                });

                AppState.saveBorderPreferences({ sides: currentSides, thickness: parseInt(slider.value) });
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
                ToastManager.success(`Applied ${preset} style`);
            });
        });

        // Navigation Hook
        navManager.pushState(() => {
            if (modal.parentElement) modal.remove();
        });

        const close = () => {
            modal.remove();
            navManager.popStateSilently();
        }
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);
    }
}
