/**
 * SecurityUI.js
 * Handles the user interface for PIN entry and security settings.
 */

import { CSS_CLASSES, IDS, EVENTS, UI_ICONS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

export const SecurityUI = {
    /**
     * Renders the PIN entry modal.
     * @param {Object} options - { onUnlock: (pin) => boolean, onBiometric: () => void }
     */
    async renderUnlockModal(options) {
        // Cleanup existing
        document.getElementById(IDS.SECURITY_UNLOCK_MODAL)?.remove();

        const modal = document.createElement('div');
        modal.id = IDS.SECURITY_UNLOCK_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW} ${CSS_CLASSES.SECURITY_LOCK_MODAL}`;

        // We wait for the support check to be sure about biometric button visibility
        const isBiometricSupported = await AppState.securityController.waitForSupportCheck();
        const isBiometricEnabled = AppState.preferences.security.isBiometricEnabled;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.SECURITY_PIN_CONTENT}">
                <div class="${CSS_CLASSES.SECURITY_HEADER}">
                    <div class="${CSS_CLASSES.APP_LOGO_SECURITY}">
                        <i class="fas ${UI_ICONS.FINGERPRINT}"></i>
                    </div>
                    <h2>Privacy Lock</h2>
                    <p>Enter your 4-digit PIN</p>
                </div>

                <div class="${CSS_CLASSES.PIN_DISPLAY}">
                    <div class="${CSS_CLASSES.PIN_DOT}"></div>
                    <div class="${CSS_CLASSES.PIN_DOT}"></div>
                    <div class="${CSS_CLASSES.PIN_DOT}"></div>
                    <div class="${CSS_CLASSES.PIN_DOT}"></div>
                </div>

                <div class="${CSS_CLASSES.PIN_PAD}">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
                        <button class="${CSS_CLASSES.PIN_BTN}" data-value="${num}" aria-label="Enter ${num}">${num}</button>
                    `).join('')}
                    <button class="${CSS_CLASSES.PIN_BTN} ${CSS_CLASSES.PIN_BTN_ICON}" data-action="biometric" aria-label="Use Biometrics" style="${(isBiometricSupported && isBiometricEnabled) ? '' : 'visibility: hidden;'}">
                        <i class="fas ${UI_ICONS.FINGERPRINT}"></i>
                    </button>
                    <button class="${CSS_CLASSES.PIN_BTN}" data-value="0" aria-label="Enter 0">0</button>
                    <button class="${CSS_CLASSES.PIN_BTN} ${CSS_CLASSES.PIN_BTN_ICON}" data-action="delete" aria-label="Delete last digit">
                        <i class="fas ${UI_ICONS.BACKSPACE}"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        let currentPin = "";
        const dots = modal.querySelectorAll(`.${CSS_CLASSES.PIN_DOT}`);

        const updateDots = () => {
            dots.forEach((dot, i) => {
                if (i < currentPin.length) {
                    dot.classList.add(CSS_CLASSES.ACTIVE);
                } else {
                    dot.classList.remove(CSS_CLASSES.ACTIVE);
                }
            });
        };

        const handleInput = (val) => {
            if (currentPin.length < 4) {
                currentPin += val;
                updateDots();

                if (currentPin.length === 4) {
                    // Provide immediate feedback
                    const subtitle = modal.querySelector(`.${CSS_CLASSES.SECURITY_HEADER} p`);
                    if (subtitle) {
                        subtitle.innerText = "Verifying...";
                        subtitle.classList.add(CSS_CLASSES.TEXT_COFFEE);
                    }
                    ToastManager.info("Verifying PIN...", "Security");

                    // Execute immediately (Performance fix)
                    if (options.onUnlock(currentPin)) {
                        modal.classList.add(CSS_CLASSES.FADE_OUT);
                        setTimeout(() => modal.remove(), 300);
                    } else {
                        // Shake animation
                        modal.querySelector(`.${CSS_CLASSES.SECURITY_PIN_CONTENT}`).classList.add(CSS_CLASSES.SHAKE);
                        setTimeout(() => {
                            modal.querySelector(`.${CSS_CLASSES.SECURITY_PIN_CONTENT}`).classList.remove(CSS_CLASSES.SHAKE);
                            currentPin = "";
                            updateDots();
                            if (subtitle) {
                                subtitle.innerText = "Enter your 4-digit PIN";
                                subtitle.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                            }
                        }, 500);
                    }
                }
            }
        };

        const handleDelete = () => {
            if (currentPin.length > 0) {
                currentPin = currentPin.slice(0, -1);
                updateDots();
            }
        };

        modal.querySelectorAll(`.${CSS_CLASSES.PIN_BTN}[data-value]`).forEach(btn => {
            btn.addEventListener('click', () => handleInput(btn.dataset.value));
        });

        modal.querySelector(`.${CSS_CLASSES.PIN_BTN}[data-action="delete"]`).addEventListener('click', handleDelete);

        const bioBtn = modal.querySelector(`.${CSS_CLASSES.PIN_BTN}[data-action="biometric"]`);
        // Note: Biometrics now require explicit user click for better control and to avoid auto-unlock issues.
        if (isBiometricEnabled && isBiometricSupported && bioBtn) {
            bioBtn.addEventListener('click', () => options.onBiometric());
        }
    },

    /**
     * Renders the security settings modal.
     */
    renderSecuritySettings(controller) {
        document.getElementById(IDS.SECURITY_SETTINGS_MODAL)?.remove();

        const prefs = AppState.preferences.security;
        const modal = document.createElement('div');
        modal.id = IDS.SECURITY_SETTINGS_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;

        // Register with NavigationManager
        this._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                this._navActive = false;
                this._closeSecurityModal(modal);
            }
        });

        const isBiometricSupported = controller.isBiometricSupported;
        const isSecureContext = window.isSecureContext;

        // Biometrics require Secure Context (HTTPS or localhost)
        const biometricHint = !isSecureContext ?
            `<div class="${CSS_CLASSES.BIOMETRIC_HINT} ${CSS_CLASSES.BIOMETRIC_HINT_DANGER}">
                <i class="fas ${UI_ICONS.EXCLAMATION_TRIANGLE}"></i> Biometrics require <b>HTTPS</b> or <b>localhost</b>
            </div>` :
            (!isBiometricSupported ?
                `<div class="${CSS_CLASSES.BIOMETRIC_HINT} ${CSS_CLASSES.BIOMETRIC_HINT_MUTED}">
                Your device doesn't support biometric login
            </div>` : '');

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}"><i class="fas ${UI_ICONS.SHIELD}"></i> Security Settings</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}">
                    <div class="${CSS_CLASSES.SETTINGS_SECTION}">
                        <!-- PIN Toggle -->
                        <div class="${CSS_CLASSES.SETTING_ROW}">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}">PIN Access</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Require a PIN to unlock the app</div>
                            </div>
                            <label class="${CSS_CLASSES.SWITCH}">
                                <input type="checkbox" id="${IDS.PIN_TOGGLE}" ${prefs.isPinEnabled ? 'checked' : ''}>
                                <span class="${CSS_CLASSES.SLIDER_ROUND}"></span>
                            </label>
                        </div>

                        <div id="${IDS.PIN_SETUP_AREA}" class="${CSS_CLASSES.PIN_SETUP_AREA}" style="${prefs.isPinEnabled ? '' : 'display: none;'}">
                            <button id="${IDS.CHANGE_PIN_BTN}" class="${CSS_CLASSES.BTN_TEXT_SMALL} ${CSS_CLASSES.TEXT_ACCENT}">Change PIN</button>
                        </div>

                        <!-- Biometric Toggle -->
                        <div class="${CSS_CLASSES.SETTING_ROW} ${isBiometricSupported ? '' : CSS_CLASSES.DISABLED}">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}">Biometric Access</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Use Fingerprint or Face ID</div>
                                ${biometricHint}
                            </div>
                            <label class="${CSS_CLASSES.SWITCH}">
                                <input type="checkbox" id="${IDS.BIO_TOGGLE}" ${prefs.isBiometricEnabled ? 'checked' : ''} ${isBiometricSupported ? '' : 'disabled'}>
                                <span class="${CSS_CLASSES.SLIDER_ROUND}"></span>
                            </label>
                        </div>

                        <!-- Require Lock on Resume -->
                        <div class="${CSS_CLASSES.SETTING_ROW}">
                            <div>
                                <div class="${CSS_CLASSES.FONT_BOLD}">Lock on Resume</div>
                                <div class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED}">Re-lock app when returning from background</div>
                            </div>
                            <label class="${CSS_CLASSES.SWITCH}">
                                <input type="checkbox" id="${IDS.LOCK_RESUME_TOGGLE}" ${prefs.requireLockOnResume ? 'checked' : ''}>
                                <span class="${CSS_CLASSES.SLIDER_ROUND}"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Events
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', () => this._closeSecurityModal(modal));
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', () => this._closeSecurityModal(modal));

        modal.querySelector(`#${IDS.PIN_TOGGLE}`).addEventListener('change', (e) => {
            if (e.target.checked) {
                this.renderPinSetup(controller, () => {
                    modal.querySelector(`#${IDS.PIN_SETUP_AREA}`).style.display = 'block';
                }, () => {
                    e.target.checked = false;
                });
            } else {
                controller.disablePin();
                modal.querySelector(`#${IDS.PIN_SETUP_AREA}`).style.display = 'none';

                // DEPENDENCY: Disabling PIN also disables Biometrics to prevent lockout
                if (AppState.preferences.security.isBiometricEnabled) {
                    AppState.saveSecurityPreferences({ isBiometricEnabled: false });
                    const bioToggle = modal.querySelector(`#${IDS.BIO_TOGGLE}`);
                    if (bioToggle) bioToggle.checked = false;
                    ToastManager.info("Biometrics disabled because PIN was removed.", "Security");
                }
            }
        });

        modal.querySelector(`#${IDS.CHANGE_PIN_BTN}`)?.addEventListener('click', () => {
            this.renderPinSetup(controller);
        });

        modal.querySelector(`#${IDS.BIO_TOGGLE}`).addEventListener('change', async (e) => {
            if (e.target.checked) {
                // DEPENDENCY: Must have PIN to enable Biometrics
                if (!AppState.preferences.security.isPinEnabled) {
                    ToastManager.info("Please set a PIN first to enable Biometrics.", "Security");

                    // Trigger PIN setup flow
                    this.renderPinSetup(controller, async () => {
                        // On PIN success, auto-enable PIN toggle UI
                        modal.querySelector(`#${IDS.PIN_TOGGLE}`).checked = true;
                        modal.querySelector(`#${IDS.PIN_SETUP_AREA}`).style.display = 'block';

                        // THEN try enabling biometrics
                        const success = await controller.enableBiometric();
                        if (!success) e.target.checked = false;
                    }, () => {
                        // On Cancel
                        e.target.checked = false;
                    });
                    return;
                }

                const success = await controller.enableBiometric();
                if (!success) e.target.checked = false;
            } else {
                AppState.saveSecurityPreferences({ isBiometricEnabled: false });
            }
        });

        modal.querySelector(`#${IDS.LOCK_RESUME_TOGGLE}`).addEventListener('change', (e) => {
            AppState.saveSecurityPreferences({ requireLockOnResume: e.target.checked });
        });
    },

    /**
     * Renders simple PIN setup/change modal.
     */
    renderPinSetup(controller, onSuccess, onCancel) {
        let step = 1; // 1 = enter new, 2 = confirm
        let firstPin = "";

        const modal = document.createElement('div');
        modal.id = IDS.PIN_SETUP_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        modal.style.zIndex = "1100"; // Exceptional override for layered modals

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_SMALL} ${CSS_CLASSES.TEXT_CENTER}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h3 id="setup-title" class="${CSS_CLASSES.MODAL_TITLE}">Set New PIN</h3>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}">
                    <p id="setup-subtitle" class="${CSS_CLASSES.TEXT_SM} ${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.MT_SMALL}">Enter 4 digits</p>
                    <div class="${CSS_CLASSES.PIN_DISPLAY}">
                        <div class="${CSS_CLASSES.PIN_DOT}"></div><div class="${CSS_CLASSES.PIN_DOT}"></div><div class="${CSS_CLASSES.PIN_DOT}"></div>
                        <div class="${CSS_CLASSES.PIN_DOT}"></div>
                    </div>
                    <div class="${CSS_CLASSES.PIN_PAD_MINI}">
                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'Del'].map(val => `
                            <button class="${CSS_CLASSES.PIN_SETUP_BTN}" data-val="${val}">${val}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => {
            modal.remove();
            if (onCancel) onCancel();
        };

        // Standard modal events
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', closeModal);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', closeModal);

        let currentInput = "";
        const dots = modal.querySelectorAll(`.${CSS_CLASSES.PIN_DOT}`);

        const updateDots = () => {
            dots.forEach((dot, i) => {
                if (i < currentInput.length) dot.classList.add(CSS_CLASSES.ACTIVE);
                else dot.classList.remove(CSS_CLASSES.ACTIVE);
            });
        };

        modal.querySelectorAll(`.${CSS_CLASSES.PIN_SETUP_BTN}`).forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.val;
                if (val === 'Del') {
                    currentInput = currentInput.slice(0, -1);
                } else if (val === 'C') {
                    modal.remove();
                    if (onCancel) onCancel();
                    return;
                } else if (currentInput.length < 4) {
                    currentInput += val;
                }

                updateDots();

                if (currentInput.length === 4) {
                    // Provide immediate feedback
                    const subtitle = modal.querySelector('#setup-subtitle');
                    const msg = step === 1 ? "Processing..." : "Verifying PIN...";
                    if (subtitle) {
                        subtitle.innerText = msg;
                        subtitle.classList.add(CSS_CLASSES.TEXT_COFFEE);
                    }
                    ToastManager.info(msg, "Security");

                    // Execute immediately (Performance fix)
                    if (step === 1) {
                        firstPin = currentInput;
                        currentInput = "";
                        step = 2;
                        modal.querySelector('#setup-title').innerText = "Confirm PIN";
                        modal.querySelector('#setup-subtitle').innerText = "Re-enter to verify";
                        updateDots();
                    } else {
                        if (currentInput === firstPin) {
                            controller.setPin(currentInput);
                            modal.remove();
                            if (onSuccess) onSuccess();
                        } else {
                            ToastManager.error("PINs do not match. Try again.");
                            firstPin = "";
                            currentInput = "";
                            step = 1;
                            modal.querySelector('#setup-title').innerText = "Set New PIN";
                            if (subtitle) {
                                subtitle.innerText = "Enter 4 digits";
                                subtitle.classList.remove(CSS_CLASSES.TEXT_COFFEE);
                            }
                            updateDots();
                        }
                    }
                }
            });
        });
    },

    _closeSecurityModal(modal) {
        if (modal) {
            modal.remove();
            // Remove from history stack if closed manually
            if (this._navActive) {
                this._navActive = false;
                navManager.popStateSilently();
            }
        }
    }
};
