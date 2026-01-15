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
        this.unsubscribeDashboard = null;
        this._lastPrefsJson = null; // Cache for deep equality checks
    }

    /**
     * Internal helper to handle write errors.
     * Triggers global reconnection flow if permission denied.
     */
    _handleWriteError(error, context) {
        if (error.code === 'permission-denied') {
            console.warn(`[UserStore] Write denied in ${context}. Triggering Re-Auth.`);
            document.dispatchEvent(new CustomEvent('auth-reconnect-needed'));
        } else {
            console.error(`[UserStore] Error in ${context}:`, error);
        }
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
                const d = doc.data();
                if (d.category === 'other') {
                    console.log(`[UserStore INBOUND] Cash Asset: ${d.name}, Color Field: ${d.color}`);
                }
                cash.push({ id: doc.id, ...d });
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
            this._handleWriteError(e, 'addShare');
            throw e;
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
            if (e.code === 'not-found' || e.message.includes('No document to update')) {
                console.warn(`[UserStore] Share ${shareId} not found (Ghost). Resurrecting...`);
                // Resurrect: Use setDoc to recreate with same ID (preserve references)
                try {
                    await setDoc(shareRef, {
                        ...data,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    console.log(`[UserStore] Share ${shareId} resurrected.`);
                } catch (resurrectError) {
                    this._handleWriteError(resurrectError, 'updateShare-Resurrect');
                    throw resurrectError;
                }
            } else {
                this._handleWriteError(e, 'updateShare');
                throw e;
            }
        }
    }

    /**
     * Adds a new cash asset category.
     * @param {string} userId 
     * @param {Object} data - { name, balance, category }
     */
    async addCashCategory(userId, data) {
        if (!userId || !data) throw new Error("Missing userId or data");
        const ref = collection(db, `artifacts/${APP_ID}/users/${userId}/cashCategories`);
        const docRef = await addDoc(ref, {
            ...data,
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    /**
     * Updates an existing cash asset.
     * @param {string} userId 
     * @param {string} assetId 
     * @param {Object} data - { name, balance, category }
     */
    async updateCashCategory(userId, assetId, data) {
        if (!userId || !assetId || !data) throw new Error("Missing userId, assetId, or data");
        const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/cashCategories`, assetId);
        await updateDoc(ref, {
            ...data,
            updatedAt: serverTimestamp()
        });
    }

    /**
     * Deletes a cash asset.
     * @param {string} userId 
     * @param {string} assetId 
     */
    async deleteCashCategory(userId, assetId) {
        if (!userId || !assetId) throw new Error("Missing userId or assetId");
        const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/cashCategories`, assetId);
        await deleteDoc(ref);
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
     * Renames a watchlist. (Alias for updateWatchlist targeting 'name')
     * @param {string} userId
     * @param {string} watchlistId
     * @param {string} newName
     */
    async renameWatchlist(userId, watchlistId, newName) {
        return this.updateWatchlist(userId, watchlistId, { name: newName });
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
                // Update last login (Non-blocking race avoidance)
                try {
                    await updateDoc(userRef, { lastLogin: serverTimestamp() });
                } catch (err) {
                    console.log('[UserStore] Provision update skipped (possibly conflict or offline):', err.message);
                }
            }
        } catch (e) {
            console.error("UserStore: Provisioning failed", e);
        }
    }

    /**
     * Removes a stock from a specific watchlist.
     * @param {string} userId 
     * @param {string} watchlistId 
     * @param {string} code 
     */
    async removeStock(userId, watchlistId, code) {
        if (!userId || !watchlistId || !code) return;
        // In local architecture, we find documents in 'shares' matching code and watchlistId
        const ref = collection(db, `artifacts/${APP_ID}/users/${userId}/shares`);
        const q = query(ref, where("watchlistId", "==", watchlistId), where("shareName", "==", code.toUpperCase()));

        try {
            const snap = await getDocs(q);
            snap.forEach(async (d) => {
                await deleteDoc(d.ref);
            });
        } catch (e) {
            console.error("UserStore: Error removing stock from watchlist:", e);
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

        // 1. ALL SHARES: Return everything (Admin/Debug view)
        if (!watchlistId || watchlistId === ALL_SHARES_ID) {
            return shares;
        }

        // 2. FILTER LOGIC (Portfolio + Custom)
        // The 'shares' array contains ALL tracked items (owned + watched).
        // We must filter for items that contain the requested watchlistId in their 'watchlistIds' array.
        // This fixes:
        // - Portfolio showing unowned items (was bypassing filter)
        // - Custom watchlists showing nothing (was checking non-existent single 'watchlistId' prop)

        return shares.filter(s => {
            // SPECIAL CASE: Portfolio view includes any share with owned units (shares > 0)
            if (watchlistId === PORTFOLIO_ID) {
                const units = parseFloat(s.portfolioShares) || 0;
                if (units > 0) return true;
                // Continue to check if it's explicitly in the 'portfolio' watchlist too
            }

            // Robustness: Handle array (standard), single string (legacy), or missing
            if (Array.isArray(s.watchlistIds)) {
                return s.watchlistIds.includes(watchlistId);
            }
            if (s.watchlistId === watchlistId) {
                return true; // Legacy fallback
            }
            return false;
        });
    }

    /**
     * Adds a stock to a specific watchlist.
     * @param {string} userId 
     * @param {string} watchlistId 
     * @param {string} symbol 
     * @param {number} price 
     * @param {string} timestamp 
     */
    async addStock(userId, watchlistId, symbol, price, timestamp, explicitDocId = null) {
        if (!userId || !watchlistId || !symbol) return;

        // FIX: Check for existing share first to prevent duplicates (Link Mode)
        const shares = AppState.data.shares || [];

        let existingId = explicitDocId;
        let existing = null;

        if (existingId) {
            console.log(`[UserStore] Using explicit ID for linking: ${existingId}`);
            // Verify it exists in memory for legacy check (optional but good for consistency)
            existing = shares.find(s => s.id === existingId);
        } else {
            existing = shares.find(s => s.shareName === symbol);
            if (existing) existingId = existing.id;
        }

        if (existingId) {
            console.log(`[UserStore] Linking existing share ${symbol} (${existingId}) to ${watchlistId}`);
            const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/shares`, existingId);

            // Migration: Ensure the legacy singular 'watchlistId' is included in the new array
            const idsToUnion = [watchlistId];
            if (existing && existing.watchlistId) idsToUnion.push(existing.watchlistId);

            try {
                await updateDoc(ref, {
                    watchlistIds: arrayUnion(...idsToUnion),
                    updatedAt: serverTimestamp()
                });
                return existing.id;
            } catch (e) {
                // FIX: Handle Ghost Share (Exists in AppState but not in DB)
                if (e.code === 'not-found' || e.message.includes('No document to update')) {
                    console.warn(`[UserStore] Share ${symbol} (${existing.id}) is a Ghost. Recreating...`);
                    // Fallback to Create New Logic (below)
                } else {
                    console.error("UserStore: Error linking stock:", e);
                    return null;
                }
            }
        }

        // Fallback: Create New (Primary Record)
        return this.addShare(userId, {
            code: symbol,
            shareName: symbol,
            watchlistId: watchlistId,
            watchlistIds: [watchlistId], // Initialize Array
            purchasePrice: price,
            purchaseDate: timestamp,
            units: 0
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

    /**
     * Generic document addition with metadata.
     */
    async addDocument(userId, collectionName, data) {
        if (!userId || !collectionName || !data) return null;
        const ref = collection(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`);
        try {
            const dataToSave = {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            // Cleanup undefined
            Object.keys(dataToSave).forEach(k => dataToSave[k] === undefined && delete dataToSave[k]);
            const docRef = await addDoc(ref, dataToSave);
            return docRef.id;
        } catch (e) {
            console.error(`UserStore: Error adding document to ${collectionName}:`, e);
            return null;
        }
    }

    async updateDocument(userId, collectionName, docId, data) {
        if (!userId || !collectionName || !docId || !data) return;
        const ref = doc(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`, docId);
        try {
            await updateDoc(ref, {
                ...data,
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            // FIX: Handle Ghost Document Resurrect
            if (e.code === 'not-found' || e.message.includes('No document to update')) {
                console.warn(`[UserStore] Document ${docId} in ${collectionName} not found. Resurrecting...`);
                await setDoc(ref, {
                    ...data,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            } else {
                console.error(`UserStore: Error updating document in ${collectionName}:`, e);
                throw e;
            }
        }
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

            // Debug check for the specific failure point
            if (data.userCategories) {
                console.log(`[UserStore DEBUG] Categories being saved: ${data.userCategories.length}. Colors:`,
                    data.userCategories.map(c => `${c.label}: ${c.color}`).join(', '));
            }

            await setDoc(docRef, {
                ...data,
                updatedAt: serverTimestamp()
            }, { merge: true });

            this._lastPrefsJson = currentJson; // Update cache
            console.log('UserStore: Preferences saved successfully.');

        } catch (e) {
            this._handleWriteError(e, 'savePreferences');
            throw e;
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
