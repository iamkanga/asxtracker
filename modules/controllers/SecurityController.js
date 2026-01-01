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
     * Helper to decode Base64 to ArrayBuffer
     * @param {string} base64 
     * @returns {ArrayBuffer}
     */
    _base64ToBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Helper to encode ArrayBuffer to Base64
     * @param {ArrayBuffer} buffer 
     * @returns {string}
     */
    _bufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Triggers Biometric Authentication (WebAuthn).
     */
    async authenticateBiometric() {
        if (!this.isBiometricSupported || !AppState.preferences.security.isBiometricEnabled) {
            return false;
        }

        const storedCredentialId = AppState.preferences.security.biometricCredentialId;
        if (!storedCredentialId) {
            console.warn("SecurityController: No biometric credential ID found.");
            return false;
        }

        try {
            console.log("SecurityController: Triggering WebAuthn Get...");

            // Random challenge (server-side usually handles this, for client-side we just need A challenge)
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    allowCredentials: [{
                        id: this._base64ToBuffer(storedCredentialId),
                        type: 'public-key',
                        // transports: ['internal'] // Optional: hints at platform authenticators
                    }],
                    userVerification: 'required' // Forces the auth prompt (TouchID/FaceID/Hello)
                }
            });

            if (credential) {
                console.log("SecurityController: Biometric auth successful.");
                return true;
            }
        } catch (error) {
            console.error("Biometric Auth Failed:", error);
            // "NotAllowedError" usually means user cancelled or timed out
        }
        return false;
    }

    /**
     * Enables biometric access by creating a new WebAuthn credential.
     */
    async enableBiometric() {
        if (!this.isBiometricSupported) return false;

        try {
            console.log("SecurityController: Creating WebAuthn Credential...");

            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const userId = new Uint8Array(16);
            window.crypto.getRandomValues(userId);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: {
                        name: "ASX Tracker"
                    },
                    user: {
                        id: userId,
                        name: "user",
                        displayName: "User"
                    },
                    pubKeyCredParams: [{
                        type: "public-key",
                        alg: -7 // ES256
                    }, {
                        type: "public-key",
                        alg: -257 // RS256
                    }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform", // Forces TouchID/FaceID/Windows Hello
                        userVerification: "required"
                    },
                    timeout: 60000,
                    attestation: "none"
                }
            });

            if (credential) {
                const rawIdBase64 = this._bufferToBase64(credential.rawId);

                // Save the new state with the credential ID
                AppState.saveSecurityPreferences({
                    isBiometricEnabled: true,
                    biometricCredentialId: rawIdBase64
                });

                console.log("SecurityController: Biometric enabled & credential saved.");
                return true;
            }

        } catch (error) {
            console.error("SecurityController: Failed to enable biometrics:", error);
            // Errors include user cancelling, or not configured on device
        }

        return false;
    }
}
