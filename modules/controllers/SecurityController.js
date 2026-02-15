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
        this._sanitizeSecurityState();
    }

    /**
     * CONSTITUTIONAL GUARD: Safe State Enforcement
     * Prevents "Fail Open" (Biometrics ON, PIN OFF) and "Deadlock" states.
     */
    _sanitizeSecurityState() {
        const prefs = AppState.preferences.security;
        if (!prefs) return; // Should exist via defaults, but safety first

        // RULE: Biometrics strictly REQUIRES a PIN fallback
        if (prefs.isBiometricEnabled && !prefs.isPinEnabled) {
            console.warn("SecurityController: Illegal State Detected (Bio ON, PIN OFF). Sanitizing...");

            // DECISION: Disable Biometrics to force user to re-setup correctly (Fail Safe)
            // We cannot force PIN=ON because we don't know the PIN, leading to lockout.
            AppState.saveSecurityPreferences({
                isBiometricEnabled: false
            });

            // Notify User (Wait for ToastManager availability usually, but this is sync boot)
            // We'll rely on the UI rendering the "Biometrics Disabled" toggle state.
        }
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
        // FAIL SECURE: If PIN is not enabled, we cannot verify it, so return false.
        // This prevents the "accept any PIN" bypass when Biometrics are ON but PIN is OFF.
        if (!AppState.preferences.security.isPinEnabled) return false;

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
     * Determines the valid RP ID.
     * WebAuthn forbids IP addresses as RP IDs.
     * @returns {string|undefined}
     */
    _getRpId() {
        const hostname = window.location.hostname;
        // Check for IPv4 or IPv6
        const isIp = SecurityController.isIpAddress(hostname);

        if (isIp) {
            return undefined; // Let browser default to origin
        }
        return hostname;
    }

    /**
     * STATIC HELPER: Checks if a hostname is an IP address.
     * @param {string} hostname 
     * @returns {boolean}
     */
    static isIpAddress(hostname) {
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname.includes(':');
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
            // Random challenge (server-side usually handles this, for client-side we just need A challenge)
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const publicKey = {
                challenge: challenge,
                allowCredentials: [{
                    id: this._base64ToBuffer(storedCredentialId),
                    type: 'public-key',
                    // transports: ['internal'] // Optional: hints at platform authenticators
                }],
                userVerification: 'required' // Forces the auth prompt (TouchID/FaceID/Hello)
            };

            const rpId = this._getRpId();
            if (rpId) publicKey.rpId = rpId;

            const credential = await navigator.credentials.get({ publicKey });

            if (credential) {
                // STRICT SECURITY: Inspect Authenticator Data Flags
                // Byte 32 is the Flags byte.
                // Bit 0: User Presence (UP)
                // Bit 2: User Verification (UV) - We REQUIRE this.
                const authData = new Uint8Array(credential.response.authenticatorData);
                const flags = authData[32];
                const isUserVerified = (flags & 4) !== 0; // Check 3rd bit (value 4)

                if (isUserVerified) {
                    // DIAGNOSTIC TOAST: Remove after debugging
                    // Shows strictly what the authenticator returned.
                    // Bit 0 = UP (1), Bit 2 = UV (4). Expected: 5 or 7.
                    import('../ui/ToastManager.js').then(({ ToastManager }) => {
                        ToastManager.info(`Bio Auth Success. Flags: ${flags} (UV=Yes)`, "Security Debug");
                    });
                    return true;
                } else {
                    console.warn("SecurityController: Biometric rejected - User Verification (UV) flag missing. (Presence only detected)");
                    import('../ui/ToastManager.js').then(({ ToastManager }) => {
                        ToastManager.error(`Biometrics Failed: Strict verification required. (Flags: ${flags})`, "Security Alert");
                    });
                    return false;
                }
            }
        } catch (error) {
            console.error("Biometric Auth Failed:", error);

            // Helpful Error Handling
            if (error.name === 'SecurityError' || error.message.includes('invalid domain')) {
                import('../ui/ToastManager.js').then(({ ToastManager }) => {
                    ToastManager.error("Domain mismatch detected. Biometrics disabled. Please re-enable in Settings.", "Security System");
                });
                // FAIL-SAFE: Disable biometrics to prevent infinite error loops and force re-registration
                if (AppState && AppState.saveSecurityPreferences) {
                    AppState.saveSecurityPreferences({ isBiometricEnabled: false });
                }
            } else if (error.name === 'NotAllowedError') {
                // User cancelled or timed out - valid flow, no massive error needed
            } else {
                import('../ui/ToastManager.js').then(({ ToastManager }) => {
                    ToastManager.error(`Biometric Error: ${error.message}`, "Security");
                });
            }
            return false;
        }
    }

    /**
     * Enables biometric access by creating a new WebAuthn credential.
     */
    async enableBiometric() {
        if (!this.isBiometricSupported) return false;

        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const userId = new Uint8Array(16);
            window.crypto.getRandomValues(userId);

            const rp = {
                name: "ASX Tracker"
            };
            const rpId = this._getRpId();
            // CRITICAL FIX: Only attach ID if it's a valid domain. 
            // WebAuthn fails on simple IPs if ID is provided (even if matching).
            if (rpId) {
                rp.id = rpId;
            } else {
            }

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: rp,
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
                return true;
            }

        } catch (error) {
            console.error("SecurityController: Failed to enable biometrics:", error);
            // Errors include user cancelling, or not configured on device
            if (error.name === 'SecurityError') {
                const hostname = window.location.hostname;
                const isLocalIP = hostname === '127.0.0.1';
                const isIp = this._getRpId() === undefined;

                import('../ui/ToastManager.js').then(({ ToastManager }) => {
                    if (isLocalIP) {
                        ToastManager.error("Browser Blocked: Please change URL from '127.0.0.1' to 'localhost' to enable Biometrics.", "Setup Hint");
                    } else if (isIp) {
                        ToastManager.error("Biometrics unavailable on IP Addresses. Use 'localhost' or a domain.", "Browser Security");
                    } else {
                        ToastManager.error("Security Error: Check HTTPS or Domain config.", "Setup Failed");
                    }
                });
            }
        }

        return false;
    }
}
