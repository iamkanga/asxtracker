/**
 * SecurityController.js
 * Handles PIN and Biometric (WebAuthn) logic.
 */

import { AppState } from '../state/AppState.js';
import { EVENTS } from '../utils/AppConstants.js';

export class SecurityController {
    constructor() {
        this.isBiometricSupported = false;
        this._supportCheckPromise = this._checkBiometricSupport();
    }

    async _checkBiometricSupport() {
        // Biometrics require Secure Context (HTTPS or localhost)
        if (!window.isSecureContext) {
            console.warn("SecurityController: Insecure context detected. Biometrics unavailable.");
            this.isBiometricSupported = false;
            return false;
        }

        if (window.PublicKeyCredential &&
            PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
            try {
                this.isBiometricSupported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            } catch (e) {
                this.isBiometricSupported = false;
            }
        }
        console.log("SecurityController: Biometric Support:", this.isBiometricSupported);
        return this.isBiometricSupported;
    }

    /**
     * Allows UI to wait for the biometric support check to complete.
     */
    async waitForSupportCheck() {
        return this._supportCheckPromise;
    }

    /**
     * Checks if the app should be locked based on user preferences.
     */
    shouldLock() {
        const prefs = AppState.preferences.security;
        return prefs && (prefs.isPinEnabled || prefs.isBiometricEnabled);
    }

    /**
     * Verifies the provided PIN against the stored hashed PIN.
     * Note: In a pure client-side app, this is a "Privacy Lock".
     * @param {string} pin 
     * @returns {boolean}
     */
    verifyPin(pin) {
        if (!AppState.preferences.security.isPinEnabled) return true;

        // Simple hashing for "Privacy Lock" (not intended for banking-grade security without back-end salt)
        const hashedAttempt = this._hashPin(pin);
        return hashedAttempt === AppState.preferences.security.hashedPin;
    }

    /**
     * Hashes a PIN for storage.
     * @param {string} pin 
     * @returns {string}
     */
    _hashPin(pin) {
        // Simple string transformation as a placeholder for SHA-256 or similar
        // For a full implementation, SubtleCrypto would be used.
        let hash = 0;
        for (let i = 0; i < pin.length; i++) {
            const char = pin.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return `p_${hash}`;
    }

    /**
     * Registers a new PIN.
     * @param {string} pin 
     */
    setPin(pin) {
        const hashedPin = this._hashPin(pin);
        AppState.saveSecurityPreferences({
            isPinEnabled: true,
            hashedPin: hashedPin
        });
    }

    /**
     * Disables PIN access.
     */
    disablePin() {
        AppState.saveSecurityPreferences({
            isPinEnabled: false,
            hashedPin: null
        });
    }

    /**
     * Triggers Biometric Authentication (WebAuthn).
     * This is a simplified placeholder for the WebAuthn flow.
     */
    async authenticateBiometric() {
        if (!this.isBiometricSupported || !AppState.preferences.security.isBiometricEnabled) {
            return false;
        }

        try {
            console.log("SecurityController: Triggering local biometric auth...");

            // Add a small delay to simulate the platform authentication prompt
            await new Promise(resolve => setTimeout(resolve, 800));

            return true;
        } catch (error) {
            console.error("Biometric Auth Failed:", error);
            return false;
        }
    }

    /**
     * Enables biometric access.
     */
    async enableBiometric() {
        if (!this.isBiometricSupported) return false;

        // Registering usually involves creating a credential via navigator.credentials.create()
        AppState.saveSecurityPreferences({ isBiometricEnabled: true });
        return true;
    }
}
