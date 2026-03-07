/**
 * GeneralSettingsUI.js
 * Accordion-style Settings Bottom Sheet.
 * Central hub for App Configuration, AI Management, Data, Security & Theming.
 * Constitution Compliant: Event Bus, Registry, Null Guards.
 */

import { CSS_CLASSES, UI_ICONS, IDS, EVENTS, AI_DEFAULT_TEMPLATES, UI_LABELS, STORAGE_KEYS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { SecurityUI } from './SecurityUI.js';
import { SecurityController } from '../controllers/SecurityController.js';
import { DataManagementUI } from './DataManagementUI.js';
import { VisualSettingsHUD } from './VisualSettingsHUD.js';

export class GeneralSettingsUI {

    /**
     * Show the General Settings accordion modal.
     * Bottom sheet with collapsible sections.
     * @param {AppController} controller
     */
    static showModal(controller) {
        const existing = document.getElementById(IDS.GENERAL_SETTINGS_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.GENERAL_SETTINGS_MODAL;
        modal.className = 'settings-accordion-modal';

        // --- Determine current theme name ---
        const currentThemeName = this._getCurrentThemeName();

        modal.innerHTML = `
            <div class="settings-accordion-overlay"></div>
            <div class="settings-accordion-sheet">
                <div class="settings-accordion-handle"></div>
                <div class="settings-accordion-header">
                    <span class="settings-accordion-title">Settings</span>
                    <button class="settings-accordion-close" id="settings-acc-close-btn">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <div class="settings-accordion-body">

                    <!-- 1. APPEARANCE (Direct Action) -->
                    <div class="settings-acc-section">
                        <button class="settings-acc-trigger" id="settings-acc-appearance-direct">
                            <div class="settings-acc-icon"><i class="fas fa-palette"></i></div>
                            <div class="settings-acc-row-info">
                                <span class="settings-acc-label" style="display: block;">Appearance</span>
                                <span class="settings-acc-row-desc">Current: <strong>${currentThemeName}</strong></span>
                            </div>
                            <i class="fas fa-chevron-right settings-acc-chevron"></i>
                        </button>
                    </div>

                    <!-- 2. AI MANAGEMENT -->
                    <div class="settings-acc-section">
                        <button class="settings-acc-trigger" data-section="ai">
                            <div class="settings-acc-icon"><i class="fas fa-robot"></i></div>
                            <span class="settings-acc-label">AI Management</span>
                            <i class="fas fa-chevron-right settings-acc-chevron"></i>
                        </button>
                        <div class="settings-acc-content" id="acc-content-ai">
                            <div class="settings-acc-inner">
                                <!-- One-Tap Research Toggle (Moved here from general settings) -->
                                <div class="settings-acc-row" style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 14px;">
                                    <div class="settings-acc-row-info">
                                        <div class="settings-acc-row-title">${UI_LABELS.AI_QUICK_SUMMARY_TOGGLE}</div>
                                        <div class="settings-acc-row-desc">Perform research with a single tap</div>
                                    </div>
                                    <div class="square-radio-wrapper">
                                        <input type="checkbox" id="gen-ai-one-tap-toggle" ${AppState.preferences?.oneTapResearch ? 'checked' : ''}>
                                        <div class="square-radio-visual"></div>
                                    </div>
                                </div>

                                <!-- Prompt Templates -->
                                <div id="ai-prompt-editor-container">
                                    ${this._renderAiPromptTemplates()}
                                </div>

                                <!-- Reset AI Prompts -->
                                <div style="text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06);">
                                    <button id="gen-btn-reset-ai-prompts" class="settings-acc-reset-btn" style="margin: 0 auto;">
                                        <i class="fas fa-undo"></i> ${UI_LABELS.RESET_AI_TOOLS}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. DATA MANAGEMENT -->
                    <div class="settings-acc-section">
                        <button class="settings-acc-trigger" data-section="data">
                            <div class="settings-acc-icon"><i class="fas fa-database"></i></div>
                            <span class="settings-acc-label">Data Management</span>
                            <i class="fas fa-chevron-right settings-acc-chevron"></i>
                        </button>
                        <div class="settings-acc-content" id="acc-content-data">
                            <div class="settings-acc-inner">
                                <!-- Data Tools -->
                                <button class="settings-acc-action-btn" id="settings-acc-data-tools">
                                    <i class="fas fa-tools"></i>
                                    <div class="settings-acc-row-info">
                                        <div class="settings-acc-row-title">Data Tools</div>
                                        <div class="settings-acc-row-desc">Export, Import & Sync</div>
                                    </div>
                                    <i class="fas fa-chevron-right acc-action-chevron"></i>
                                </button>
                                <!-- Delete Data -->
                                <button class="settings-acc-action-btn danger" id="settings-acc-delete-data">
                                    <i class="fas fa-trash-alt"></i>
                                    <div class="settings-acc-row-info">
                                        <div class="settings-acc-row-title" style="color: var(--color-negative);">Delete Data</div>
                                        <div class="settings-acc-row-desc">Reset app and clear cache</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 4. SECURITY -->
                    <div class="settings-acc-section">
                        <button class="settings-acc-trigger" data-section="security">
                            <div class="settings-acc-icon"><i class="fas ${UI_ICONS.SHIELD}"></i></div>
                            <span class="settings-acc-label">Security</span>
                            <i class="fas fa-chevron-right settings-acc-chevron"></i>
                        </button>
                        <div class="settings-acc-content" id="acc-content-security">
                            <div class="settings-acc-inner">
                                <div id="settings-acc-bio-row"></div>
                                <div id="settings-acc-pin-row"></div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Inject Security Controls
        if (controller) {
            this._injectSecurityControls(modal, controller);
        }

        // Navigation Hook
        navManager.pushState(() => {
            if (modal.parentElement) {
                this._dismissModal(modal);
            }
        });

        // --- BINDINGS ---
        this._bindAccordionEvents(modal, controller);

        // Show with animation (next frame)
        requestAnimationFrame(() => {
            modal.classList.add(CSS_CLASSES.SHOW);
        });
    }

    /**
     * Binds all accordion and action events.
     */
    static _bindAccordionEvents(modal, controller) {
        // Close handlers
        const close = () => this._dismissModal(modal);
        modal.querySelector('#settings-acc-close-btn')?.addEventListener('click', close);
        modal.querySelector('.settings-accordion-overlay')?.addEventListener('click', close);

        // Accordion Triggers
        modal.querySelectorAll('.settings-acc-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const section = trigger.closest('.settings-acc-section');
                if (!section) return;

                const content = section.querySelector('.settings-acc-content');
                if (!content) return;

                const isOpen = section.classList.contains('open');

                if (isOpen) {
                    // Close
                    content.style.maxHeight = '0px';
                    section.classList.remove('open');
                } else {
                    // Close others first (classic accordion)
                    modal.querySelectorAll('.settings-acc-section.open').forEach(openSec => {
                        const openContent = openSec.querySelector('.settings-acc-content');
                        if (openContent) openContent.style.maxHeight = '0px';
                        openSec.classList.remove('open');
                    });

                    // Open this one
                    section.classList.add('open');
                    content.style.maxHeight = content.scrollHeight + 'px';

                    // Auto-resize after dynamic content
                    setTimeout(() => {
                        if (section.classList.contains('open')) {
                            content.style.maxHeight = content.scrollHeight + 'px';
                        }
                    }, 100);
                }
            });
        });

        // Appearance Direct Action -> Opens Visual Settings HUD
        modal.querySelector('#settings-acc-appearance-direct')?.addEventListener('click', () => {
            this._dismissModal(modal, true); // true = skip popState because we are pushing a NEW state
            setTimeout(() => {
                VisualSettingsHUD.show(true); // true = cameFromSettings
            }, 300);
        });

        // AI One-Tap Toggle
        const aiToggle = modal.querySelector('#gen-ai-one-tap-toggle');
        if (aiToggle) {
            aiToggle.addEventListener('change', (e) => {
                AppState.saveOneTapResearch(e.target.checked);
                ToastManager.success(e.target.checked ? "One-Tap Research Enabled" : "One-Tap Research Disabled");
            });
        }

        // AI Prompt Textareas
        modal.querySelectorAll('.settings-acc-textarea').forEach(tx => {
            tx.addEventListener('change', (e) => {
                const id = e.target.dataset.templateId;
                const val = e.target.value.trim();
                if (id) {
                    AppState.saveAiPromptTemplate(id, val);
                    ToastManager.info('Prompt template saved');
                }
            });
        });

        // AI Reset
        modal.querySelector('#gen-btn-reset-ai-prompts')?.addEventListener('click', () => {
            if (confirm(UI_LABELS.CONFIRM_RESET_AI)) {
                AppState.resetAiPromptTemplates();
                const editorContainer = modal.querySelector('#ai-prompt-editor-container');
                if (editorContainer) {
                    editorContainer.innerHTML = this._renderAiPromptTemplates();
                }
                ToastManager.success("AI Prompts Reset to Defaults");

                // Re-adjust accordion height
                const aiContent = modal.querySelector('#acc-content-ai');
                if (aiContent) {
                    setTimeout(() => {
                        aiContent.style.maxHeight = aiContent.scrollHeight + 'px';
                    }, 50);
                }
            }
        });

        // Data Tools
        modal.querySelector('#settings-acc-data-tools')?.addEventListener('click', () => {
            this._dismissModal(modal, true);
            setTimeout(() => {
                DataManagementUI.showModal(true); // true = cameFromSettings
            }, 300);
        });

        // Delete Data
        modal.querySelector('#settings-acc-delete-data')?.addEventListener('click', () => {
            this._dismissModal(modal);
            document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DELETE_DATA));
        });
    }

    /**
     * Smooth dismiss with animation.
     * @param {HTMLElement} modal 
     * @param {boolean} skipPopState If true, doesn't call navManager.popStateSilently()
     */
    static _dismissModal(modal, skipPopState = false) {
        if (!modal) return;
        modal.classList.remove(CSS_CLASSES.SHOW);
        setTimeout(() => {
            if (modal.parentElement) modal.remove();
        }, 350);
        if (!skipPopState) {
            navManager.popStateSilently();
        }
    }

    /**
     * Renders AI Prompt Template editors.
     */
    static _renderAiPromptTemplates() {
        const userTemplates = AppState.preferences?.aiPromptTemplates || {};
        return AI_DEFAULT_TEMPLATES.map(t => {
            const currentText = userTemplates[t.id] || t.text;
            return `
                <div class="settings-acc-template-group">
                    <div class="settings-acc-template-label">
                        <i class="fas ${t.icon}"></i> ${t.label}
                    </div>
                    <textarea
                        class="settings-acc-textarea"
                        data-template-id="${t.id}"
                        placeholder="Enter custom prompt..."
                    >${currentText}</textarea>
                </div>
            `;
        }).join('');
    }

    /**
     * Injects Security Controls (Biometric + PIN).
     */
    static _injectSecurityControls(modal, controller) {
        if (!controller?.securityController) return;

        const prefs = AppState.preferences?.security || {};
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
        const bioRow = modal.querySelector('#settings-acc-bio-row');
        if (bioRow) {
            bioRow.innerHTML = `
                <label class="settings-acc-row" style="cursor: pointer; ${bioEnabled ? '' : 'opacity: 0.5; cursor: not-allowed;'}">
                    <div class="settings-acc-row-info">
                        <div class="settings-acc-row-title">Biometric Access</div>
                        <div class="settings-acc-row-desc">Unlock using Face ID</div>
                        ${biometricHint}
                    </div>
                    <div class="square-radio-wrapper">
                        <input type="checkbox" id="${IDS.GEN_BIO_TOGGLE}" ${prefs.isBiometricEnabled ? 'checked' : ''} ${bioEnabled ? '' : 'disabled'}>
                        <div class="square-radio-visual"></div>
                    </div>
                </label>
            `;

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
        }

        // PIN Row
        const pinRow = modal.querySelector('#settings-acc-pin-row');
        if (pinRow) {
            pinRow.innerHTML = `
                <label class="settings-acc-row" style="cursor: pointer;">
                    <div class="settings-acc-row-info">
                        <div class="settings-acc-row-title">PIN Access</div>
                        <div class="settings-acc-row-desc">Require 4-digit PIN</div>
                    </div>
                    <div class="square-radio-wrapper">
                        <input type="checkbox" id="${IDS.GEN_PIN_TOGGLE}" ${prefs.isPinEnabled ? 'checked' : ''}>
                        <div class="square-radio-visual"></div>
                    </div>
                </label>
                <div id="${IDS.GEN_PIN_SETUP_AREA}" style="margin-top: 4px; margin-bottom: 10px; padding-left: 4px; ${prefs.isPinEnabled ? '' : 'display: none;'}">
                    <button id="${IDS.GEN_CHANGE_PIN_BTN}" class="${CSS_CLASSES.BTN_TEXT_SMALL} ${CSS_CLASSES.TEXT_ACCENT}" style="padding: 0; font-weight: 600;">Change PIN</button>
                </div>
            `;

            const pinToggle = pinRow.querySelector(`#${IDS.GEN_PIN_TOGGLE}`);
            if (pinToggle) {
                pinToggle.addEventListener('change', (e) => {
                    const setupArea = pinRow.querySelector(`#${IDS.GEN_PIN_SETUP_AREA}`);
                    if (e.target.checked) {
                        SecurityUI.renderPinSetup(controller.securityController, () => {
                            if (setupArea) setupArea.style.display = 'block';
                            ToastManager.success("PIN enabled.");
                        }, () => {
                            e.target.checked = false;
                        });
                    } else {
                        controller.securityController.disablePin();
                        if (setupArea) setupArea.style.display = 'none';
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
    }

    /**
     * Detects the current theme name based on border/gradient presets.
     */
    static _getCurrentThemeName() {
        try {
            const borders = AppState.preferences?.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };
            const sides = borders.sides || [0, 0, 0, 0];
            const gs = typeof AppState.preferences?.gradientStrength === 'number' ? AppState.preferences.gradientStrength : 0.25;

            const checkPreset = (pSides, pThick, pOp) => {
                return sides.every((v, i) => v === pSides[i]) &&
                    borders.thickness === pThick &&
                    Math.abs(gs - pOp) < 0.05;
            };

            if (checkPreset([0, 0, 0, 1], 3, 0.0)) return 'Minimal';
            if (checkPreset([0, 0, 0, 1], 3, 0.25)) return 'Classic';
            if (checkPreset([1, 1, 1, 1], 2, 0.85)) return 'Rich';

            if (gs <= 0.05) return 'None';
            if (gs <= 0.15) return 'Muted';
            if (gs <= 0.3) return 'Subtle';
            if (gs <= 0.5) return 'Light';
            if (gs <= 0.75) return 'Medium';
            return 'Strong';
        } catch (e) {
            return 'Subtle';
        }
    }

    /**
     * Shows the Appearance/Border Settings Modal.
     * Standalone modal for Visual Styles.
     * PRESERVED for backward compatibility (AppController event binding).
     */
    static showAppearanceModal() {
        const existing = document.getElementById(IDS.BORDER_SELECTOR_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.BORDER_SELECTOR_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        const prefs = AppState.preferences?.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };
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

                    <!-- Tone Intensity -->
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

                    <!-- Quick Styles -->
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
        const edges = modal.querySelectorAll('.border-edge');
        const slider = modal.querySelector('#border-thick-slider');
        const val = modal.querySelector('#border-thick-val');
        const currentSides = [...sides];

        // Tone Intensity
        const tierBtns = modal.querySelectorAll('.tier-btn');
        const currentOpacity = AppState.preferences?.backgroundOpacity || 0.5;
        tierBtns.forEach(btn => {
            if (parseFloat(btn.dataset.val) === currentOpacity) {
                btn.classList.add(CSS_CLASSES.ACTIVE);
            }
            btn.addEventListener('click', () => {
                tierBtns.forEach(b => b.classList.remove(CSS_CLASSES.ACTIVE));
                btn.classList.add(CSS_CLASSES.ACTIVE);
                const opacity = parseFloat(btn.dataset.val);
                AppState.saveGradientStrength(opacity);
            });
        });

        // Quick Styles
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
                AppState.saveGradientStrength(newOpacity);

                modal.remove();
                navManager.popStateSilently();
                setTimeout(() => GeneralSettingsUI.showAppearanceModal(), 50);
            });
        });

        edges.forEach(edge => {
            edge.addEventListener('click', () => {
                const s = parseInt(edge.dataset.side);
                currentSides[s] = currentSides[s] ? 0 : 1;
                edge.style.background = currentSides[s] ? 'var(--color-accent)' : 'transparent';

                AppState.saveBorderPreferences({ sides: currentSides, thickness: parseInt(slider.value) });
            });
        });

        if (slider) {
            slider.addEventListener('input', (e) => {
                if (val) val.textContent = e.target.value + 'px';
                AppState.saveBorderPreferences({ sides: currentSides, thickness: parseInt(e.target.value) });
            });
        }

        // Tone Intensity Handlers (duplicate safe re-bind)
        modal.querySelectorAll('.tier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const opacity = parseFloat(btn.dataset.val);
                document.documentElement.style.setProperty('--glass-strength', opacity);
                ToastManager.info(`Tone set to ${btn.textContent}`);
            });
        });

        // Quick Style Presets (secondary binding)
        modal.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                let newSides = [0, 0, 0, 0];

                if (preset === 'classic') newSides = [0, 0, 1, 0];
                if (preset === 'rich') newSides = [1, 1, 1, 1];

                currentSides[0] = newSides[0]; currentSides[1] = newSides[1];
                currentSides[2] = newSides[2]; currentSides[3] = newSides[3];

                edges.forEach((edge, idx) => {
                    edge.style.background = currentSides[idx] ? 'var(--color-accent)' : 'transparent';
                });

                AppState.saveBorderPreferences({ sides: currentSides, thickness: parseInt(slider.value) });
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
        };
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`)?.addEventListener('click', close);
    }
}
