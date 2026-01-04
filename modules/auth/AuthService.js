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
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
    dbInstance = getFirestore(app);

    // Set persistence to LOCAL (users stay logged in across restarts)
    persistencePromise = setPersistence(auth, browserLocalPersistence)
        .then(() => {
            console.log("AuthService: Persistence set to LOCAL.");
        })
        .catch((error) => {
            console.error("AuthService: Failed to set persistence.", error);
        });

    console.log("AuthService: Firebase initialized successfully.");
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
        // V65: Hint Dark Mode for Popups
        provider.setCustomParameters({
            // prompt: 'select_account', // Removed to restore auto-login
            theme: 'dark' // Note: Support depends on Google's current API behavior
        });
        try {
            const result = await signInWithPopup(auth, provider);
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
            console.log("AuthService: Signed out.");
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
            callback(user);
        });
    },

    /**
     * Gets the currently signed-in user.
     * @returns {User|null}
     */
    getCurrentUser() {
        return auth ? auth.currentUser : null;
    }
};
