/**
 * AuthService.js
 * Handles Firebase initialization and authentication.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAyIWoTYlzTkaSZ9x-ySiHtzATBM9XFrYw",
    authDomain: "asx-watchlist-app.firebaseapp.com",
    projectId: "asx-watchlist-app",
    storageBucket: "asx-watchlist-app.firebaseapp.com",
    messagingSenderId: "671024168765",
    appId: "1:671024168765:web:f2b62cd0e77a126c0ecf54",
    measurementId: "G-J24BTJ34D2"
};

// Initialize Firebase internally
let app;
let auth;
let dbInstance;
let persistencePromise;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // V70: Switch to Long Polling to resolve Channel 400/404 errors in flaky environments
    dbInstance = initializeFirestore(app, {
        experimentalForceLongPolling: true
    });

    // Set persistence to LOCAL (users stay logged in across restarts)
    persistencePromise = setPersistence(auth, browserLocalPersistence)
        .then(() => {
            // console.log("AuthService: Persistence set to LOCAL.");
        })
        .catch((error) => {
            console.error("AuthService: Failed to set persistence.", error);
        });

    // console.log("AuthService: Firebase initialized successfully.");
} catch (error) {
    console.error("AuthService: Firebase initialization failed.", error);
}

// Export Firestore instance for other modules
export const db = dbInstance;

/**
 * Authentication Service
 */
export const AuthService = {
    /**
     * Signs in with Google using a popup.
     * @returns {Promise<User>}
     */
    async signIn() {
        if (!auth) throw new Error("Firebase Auth not initialized");

        // Ensure persistence is set before sign-in
        if (persistencePromise) {
            await persistencePromise;
        }

        const provider = new GoogleAuthProvider();

        // V71: Smart Login Hint - Auto-select last known account
        const lastEmail = localStorage.getItem('asx_last_email');
        if (lastEmail) {
            console.log('[AuthService] Applying login_hint:', lastEmail);
            provider.setCustomParameters({
                login_hint: lastEmail,
                prompt: 'select_account',
                theme: 'dark'
            });
        } else {
            provider.setCustomParameters({
                theme: 'dark'
            });
        }

        try {
            const result = await signInWithPopup(auth, provider);
            // Persist email for next time
            if (result.user && result.user.email) {
                localStorage.setItem('asx_last_email', result.user.email);
            }
            return result.user;
        } catch (error) {
            console.error("AuthService Sign-In Error:", error);
            throw error;
        }
    },

    /**
     * Signs out the current user.
     * @returns {Promise<void>}
     */
    async signOut() {
        if (!auth) return;
        try {
            await firebaseSignOut(auth);
            // Optional: Clear hint on explicit sign out? 
            // Better to keep it for quick re-login unless user wants to switch.
            // localStorage.removeItem('asx_last_email'); 
        } catch (error) {
            console.error("AuthService Sign-Out Error:", error);
            throw error;
        }
    },

    /**
     * Observes authentication state changes.
     * @param {function(User|null): void} callback 
     * @returns {function} Unsubscribe function
     */
    observeState(callback) {
        if (!auth) return () => { };
        return onAuthStateChanged(auth, (user) => {
            if (user && user.email) {
                localStorage.setItem('asx_last_email', user.email);
            }
            callback(user);
        });
    },

    /**
     * Gets the currently signed-in user.
     * @returns {User|null}
     */
    getCurrentUser() {
        return auth ? auth.currentUser : null;
    },

    /**
     * silently refreshes the id token to keep the session alive.
     * Useful on app resume to prevent stale token errors on write.
     */
    async refreshSession() {
        if (!auth || !auth.currentUser) return false;
        try {
            // Force refresh of the token
            await auth.currentUser.getIdToken(true);
            console.log('[AuthService] Session refreshed silently.');
            return true;
        } catch (e) {
            console.warn('[AuthService] Session refresh failed:', e);
            return false;
        }
    }
};
