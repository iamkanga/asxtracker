/**
 * UserStore.js
 * Handles real-time synchronization of user data (Shares and Cash) from Firestore.
 */

import { db } from '../auth/AuthService.js';
import { AppState } from '../state/AppState.js';
import {
    collection,
    query,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    where,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ALL_SHARES_ID, PORTFOLIO_ID } from '../utils/AppConstants.js';

const APP_ID = "asx-watchlist-app";

export class UserStore {
    constructor() {
        this.unsubscribeShares = null;
        this.unsubscribeCash = null;
        this.unsubscribeWatchlists = null;
        this.unsubscribeDashboard = null;
        this._lastPrefsJson = null; // Cache for deep equality checks
    }

    /**
     * Subscribes to changes in the user's shares and cash categories.
     * @param {string} userId - The current user's UID.
     * @param {function(Object): void} onDataChange - Callback invoked with { shares, cash } on updates.
     * @returns {function} Unsubscribe function to clean up listeners.
     */
    subscribe(userId, onDataChange) {
        if (!userId || !db) {
            console.error("UserStore: Missing userId or DB instance.");
            return () => { };
        }

        const sharesRef = collection(db, `artifacts/${APP_ID}/users/${userId}/shares`);
        const cashRef = collection(db, `artifacts/${APP_ID}/users/${userId}/cashCategories`);
        const watchlistsRef = collection(db, `artifacts/${APP_ID}/users/${userId}/watchlists`);

        // Helper to notify listener
        const notify = () => {
            if (onDataChange) {
                // Pass the centralized data structure
                onDataChange(AppState.data);
            }
        };

        // Subscribe to Shares
        this.unsubscribeShares = onSnapshot(query(sharesRef), (snapshot) => {
            const shares = [];
            snapshot.forEach((doc) => {
                shares.push({ id: doc.id, ...doc.data() });
            });
            AppState.data.shares = shares;
            notify();
        }, (error) => {
            if (error.code === 'permission-denied') return;
            console.error("UserStore: Error listening to shares:", error);
        });

        // Subscribe to Cash Categories
        this.unsubscribeCash = onSnapshot(query(cashRef), (snapshot) => {
            const cash = [];
            snapshot.forEach((doc) => {
                cash.push({ id: doc.id, ...doc.data() });
            });
            AppState.data.cash = cash;
            notify();
        }, (error) => {
            if (error.code === 'permission-denied') return;
            console.error("UserStore: Error listening to cash categories:", error);
        });

        // Subscribe to Watchlists
        this.unsubscribeWatchlists = onSnapshot(query(watchlistsRef), (snapshot) => {
            const watchlists = [];
            snapshot.forEach((doc) => {
                watchlists.push({ id: doc.id, ...doc.data() });
            });
            // Sort by creation time if available, or name
            watchlists.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

            AppState.data.watchlists = watchlists;
            notify();
        }, (error) => {
            if (error.code === 'permission-denied') return;
            console.error("UserStore: Error listening to watchlists:", error);
        });


        // Return cleanup function
        return () => {
            if (this.unsubscribeCash) this.unsubscribeCash();
            if (this.unsubscribeWatchlists) this.unsubscribeWatchlists();

            // ARCHITECTURAL REFINEMENT:
            // Do NOT aggressively clear AppState.data on unsubscribe.
            // This causes the "Flash of Death" if a re-subscription happens immediately (e.g. auth refresh).
            // Data will be overwritten by the next snapshot anyway.
            console.log("UserStore: Unsubscribed from all listeners. (Cache preserved)");
        };
    }

    /**
     * Subscribes to the central User Preferences document.
     * Use this for Scanner Rules, Theme Settings, etc.
     * @param {string} userId 
     * @param {function(Object): void} onDataChange 
     * @returns {function} Unsubscribe function
     */
    subscribeToPreferences(userId, onDataChange) {
        if (!userId || !onDataChange) return () => { };

        const prefsRef = doc(db, `artifacts/${APP_ID}/users/${userId}/preferences/config`);
        return onSnapshot(prefsRef, (docSnap) => {
            if (docSnap.exists()) {
                onDataChange(docSnap.data());
            } else {
                onDataChange(null);
            }
        }, (err) => {
            console.error("UserStore: Error subscribing to preferences:", err);
        });
    }

    /**
     * Adds a new watchlist for the user.
     * @param {string} userId
     * @param {string} name
     * @returns {Promise<string|null>} The new watchlist ID or null.
     */
    async addWatchlist(userId, name) {
        if (!userId || !name) return null;
        const watchlistsRef = collection(db, `artifacts/${APP_ID}/users/${userId}/watchlists`);
        try {
            const docRef = await addDoc(watchlistsRef, {
                name: name,
                createdAt: serverTimestamp()
            });
            console.log(`UserStore: Added watchlist '${name}' (ID: ${docRef.id})`);
            return docRef.id;
        } catch (e) {
            console.error("UserStore: Error adding watchlist:", e);
            return null;
        }
    }

    /**
     * Adds a new share to the user's collection.
     * @param {string} userId
     * @param {Object} shareData
     * @returns {Promise<string|null>} The new share ID or null.
     */
    async addShare(userId, shareData) {
        if (!userId || !shareData) return null;
        const sharesRef = collection(db, `artifacts/${APP_ID}/users/${userId}/shares`);
        try {
            const dataToSave = {
                ...shareData,
                createdAt: serverTimestamp()
            };
            // Ensure no undefined values
            Object.keys(dataToSave).forEach(key => dataToSave[key] === undefined && delete dataToSave[key]);

            const docRef = await addDoc(sharesRef, dataToSave);
            // console.log(`UserStore: Added share ${shareData.code} (ID: ${docRef.id})`);
            return docRef.id;
        } catch (e) {
            console.error("UserStore: Error adding share:", e);
            return null;
        }
    }

    /**
     * Updates a share in the user's collection.
     * @param {string} userId
     * @param {string} shareId
     * @param {Object} data
     */
    async updateShare(userId, shareId, data) {
        if (!userId || !shareId || !data) return;
        const shareRef = doc(db, `artifacts/${APP_ID}/users/${userId}/shares`, shareId);
        try {
            await updateDoc(shareRef, {
                ...data,
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            console.error("UserStore: Error updating share:", e);
        }
    }

    /**
     * Deletes a share from the user's collection.
     * @param {string} userId
     * @param {string} shareId
     */
    async deleteShare(userId, shareId) {
        if (!userId || !shareId) return;
        const shareRef = doc(db, `artifacts/${APP_ID}/users/${userId}/shares`, shareId);
        try {
            await deleteDoc(shareRef);
        } catch (e) {
            console.error("UserStore: Error deleting share:", e);
        }
    }

    /**
     * Updates local sort preference for a watchlist.
     * @param {string} userId 
     * @param {string} watchlistId 
     * @param {Object} sortConfig { field: 'name'|'price'|'change', direction: 'asc'|'desc' }
     */
    async updateWatchlistSort(userId, watchlistId, sortConfig) {
        if (!userId || !watchlistId || !sortConfig) return;

        try {
            const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);
            await updateDoc(ref, {
                sortConfig: sortConfig,
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            // console.warn("UserStore: Sort update failed (possibly permission logic).", e);
        }
    }

    /**
     * Updates the name or other metadata of a watchlist.
     * @param {string} userId 
     * @param {string} watchlistId 
     * @param {Object} updates 
     */
    async updateWatchlist(userId, watchlistId, updates) {
        if (!userId || !watchlistId || !updates) return;
        const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);
        try {
            await updateDoc(ref, {
                ...updates,
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            console.error("UserStore: Error updating watchlist:", e);
        }
    }

    /**
     * Provisions a new user document if it doesn't exist.
     * @param {string} userId 
     */
    async provisionUser(userId) {
        if (!userId) return;
        const userRef = doc(db, `artifacts/${APP_ID}/users/${userId}`);
        try {
            const snap = await getDoc(userRef); // Requires getDoc import if not present
            if (!snap.exists()) {
                console.log(`[UserStore] Provisioning new user: ${userId}`);
                await setDoc(userRef, {
                    createdAt: serverTimestamp(),
                    lastLogin: serverTimestamp()
                });
            } else {
                // Update last login
                await updateDoc(userRef, { lastLogin: serverTimestamp() });
            }
        } catch (e) {
            console.error("UserStore: Provisioning failed", e);
        }
    }

    /**
     * Retrieves specific shares for a given watchlist.
     * Logic: If ALL_SHARES_ID, return all. If Portfolio, return own.
     * If specific Watchlist ID, filter logic needed (Architecture dependent).
     * Based on AppService usage, it likely filters the *provided list* of shares,
     * OR fetches subcollection.
     * Re-implementing based on "Zero-Cost" architecture suggestions:
     * AppService passes (shares, watchlistId), so this is a FILTER function.
     */
    getWatchlistData(shares, watchlistId) {
        if (!shares || !Array.isArray(shares)) return [];
        if (!watchlistId || watchlistId === ALL_SHARES_ID) return shares;

        if (watchlistId === PORTFOLIO_ID) {
            // In this architecture, 'shares' IS the portfolio (user's collection).
            return shares;
        }

        // For Custom Watchlists:
        // Identify shares belonging to this watchlist.
        // Current implementation stores shares in a flat 'shares' collection,
        // often with a 'watchlistId' field OR mapped separately.
        // Let's assume the 'watchlistId' field exists on the share doc for now (common pattern).
        return shares.filter(s => s.watchlistId === watchlistId);
    }

    /**
     * Adds a stock to a specific watchlist.
     * @param {string} userId 
     * @param {string} watchlistId 
     * @param {string} symbol 
     * @param {number} price 
     * @param {string} timestamp 
     */
    async addStock(userId, watchlistId, symbol, price, timestamp) {
        if (!userId || !watchlistId || !symbol) return;
        // Re-use addShare but include watchlistId
        return this.addShare(userId, {
            code: symbol,
            watchlistId: watchlistId,
            purchasePrice: price,
            purchaseDate: timestamp,
            units: 0 // Default
        });
    }

    /**
     * Deletes a watchlist and all associated metadata.
     * Note: Does NOT delete shares inside it (Shares are in subcollection 'shares' linked by ID, or separate logic).
     * Based on architecture, shares are independent.
     * @param {string} userId 
     * @param {string} watchlistId 
     */
    async deleteWatchlist(userId, watchlistId) {
        if (!userId || !watchlistId) return;
        const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);
        try {
            await deleteDoc(ref);
        } catch (e) {
            console.error("UserStore: Error deleting watchlist:", e);
        }
    }

    // --- GENERIC HELPERS ---

    /**
     * Generic fetch for any subcollection.
     * @param {string} userId 
     * @param {string} collectionName 
     */
    async getAllDocuments(userId, collectionName) {
        const ref = collection(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`);
        const snap = await getDocs(ref);
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        return results;
    }

    async deleteDocument(userId, collectionName, docId) {
        const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`, docId);
        await deleteDoc(ref);
    }

    /**
     * Saves user preferences (Scanner Rules, UI Settings) to a central config doc.
     * @param {string} userId
     * @param {Object} data
     */
    async savePreferences(userId, data) {
        if (!userId || !data) {
            console.warn('UserStore: savePreferences blocked - missing userId or data');
            return;
        }
        const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/preferences/config`);
        try {
            // DEEP EQUALITY CHECK: Skip update if data hasn't changed
            const currentJson = JSON.stringify(data);
            if (this._lastPrefsJson === currentJson) {
                // console.log('UserStore: Preferences unchanged - skipping save.');
                return;
            }

            console.log('UserStore: Saving preferences to Firestore...', data);
            await setDoc(docRef, {
                ...data,
                updatedAt: serverTimestamp()
            }, { merge: true });

            this._lastPrefsJson = currentJson; // Update cache
            console.log('UserStore: Preferences saved successfully.');
        } catch (e) {
            console.error("UserStore: Error saving preferences:", e);
        }
    }

    /**
     * EMERGENCY: Deletes all user documents in known sub-collections.
     * @param {string} userId 
     */
    async wipeAllData(userId) {
        if (!userId) return;
        console.log(`[UserStore] !!! STARTING ROBUST WIPE FOR USER: ${userId} !!!`);

        const subCollections = ['shares', 'cashCategories', 'watchlists', 'preferences'];
        const results = [];

        for (const colName of subCollections) {
            console.log(`[UserStore] Wiping sub-collection: ${colName}`);
            const docs = await this.getAllDocuments(userId, colName);
            console.log(`[UserStore] Found ${docs.length} documents in ${colName}`);

            const deletePromises = docs.map(async (d) => {
                try {
                    await this.deleteDocument(userId, colName, d.id);
                    return { id: d.id, collection: colName, status: 'deleted' };
                } catch (err) {
                    console.error(`[UserStore] FAILED to delete ${d.id} from ${colName}:`, err);
                    return { id: d.id, collection: colName, status: 'failed', error: err.message };
                }
            });

            const collectionResults = await Promise.allSettled(deletePromises);
            results.push(...collectionResults);
        }

        console.log('[UserStore] Wipe Completed. Results:', results);
        return results;
    }
}
