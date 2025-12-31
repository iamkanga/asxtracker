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

            // Ensure entryDate is set if not provided
            if (!dataToSave.entryDate) {
                dataToSave.entryDate = new Date().toISOString();
            }

            const docRef = await addDoc(sharesRef, dataToSave);
            console.log(`UserStore: Added share '${shareData.shareName}' (ID: ${docRef.id})`);
            return docRef.id;
        } catch (e) {
            console.error("UserStore: Error adding share:", e);
            return null;
        }
    }

    /**
     * Renames an existing watchlist.
     * @param {string} userId
     * @param {string} watchlistId
     * @param {string} newName
     */
    async renameWatchlist(userId, watchlistId, newName) {
        if (!userId || !watchlistId || !newName) return;
        const watchlistDocRef = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);

        try {
            await updateDoc(watchlistDocRef, { name: newName });
            console.log(`UserStore: Renamed watchlist ${watchlistId} to '${newName}'`);
        } catch (e) {
            console.error("UserStore: Error renaming watchlist:", e);
        }
    }

    /**
     * Deletes a watchlist.
     * @param {string} userId
     * @param {string} watchlistId
     */
    async deleteWatchlist(userId, watchlistId) {
        if (!userId || !watchlistId) return;
        const watchlistDocRef = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);

        try {
            await deleteDoc(watchlistDocRef);
            console.log(`UserStore: Deleted watchlist ${watchlistId}`);
        } catch (e) {
            console.error("UserStore: Error deleting watchlist:", e);
        }
    }

    /**
     * Filters shares based on the watchlist ID.
     * Centralizes logic for 'ALL', 'Portfolio' (Default), and Custom lists.
     * @param {Array} shares - The full list of user shares.
     * @param {string|null} watchlistId - 'ALL', null (Portfolio), or a specific ID.
     * @returns {Array} Filtered list of shares.
     */
    /**
     * Adds a stock to a specific watchlist.
     * @param {string} userId
     * @param {string|null} watchlistId - ID of custom watchlist, or null for Portfolio.
     * @param {string} code - Stock code (e.g., 'BHP').
     * @param {number|null} price - Entry price.
     * @param {string|null} date - Entry date.
     */
    async addStock(userId, watchlistId, code, price = null, date = null) {
        if (!userId || !code) return;
        const normalizedCode = code.toUpperCase();

        // 1. Ensure the Share Exists (Global Share Record)
        // Check if it exists in local cache first to avoid unnecessary writes
        const existingShare = AppState.data.shares.find(s => s.shareName === normalizedCode);
        if (!existingShare) {
            await this.addShare(userId, {
                shareName: normalizedCode,
                enteredPrice: price || 0,
                entryDate: date || new Date().toISOString(),
                portfolioShares: 0, // Default 0 owned
                watchlistId: PORTFOLIO_ID // Legacy default, but we'll use array logic primarily now
            });
        }

        // 2. Link to Watchlist
        if (watchlistId && watchlistId !== ALL_SHARES_ID) {
            // Custom Watchlist: Add to 'stocks' array in watchlist doc
            const watchlistRef = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);
            try {
                await updateDoc(watchlistRef, {
                    stocks: arrayUnion(normalizedCode)
                });
                console.log(`UserStore: Added ${normalizedCode} to watchlist ${watchlistId}`);
            } catch (e) {
                console.error("UserStore: Error adding stock to watchlist:", e);
            }
        } else {
            // Portfolio (Default): Ensure it has 'portfolio' tag or just exists
            // Since we ensured existence above, we might need to update it if we strictly filter by 'portfolio' tag
            if (existingShare && (!existingShare.watchlistIds || !existingShare.watchlistIds.includes(PORTFOLIO_ID))) {
                // For now, the legacy system relies on 'watchlistId' property or 'watchlistIds' array on the share itself
                // If we are "Adding" to portfolio, we imply we own it or want to track it in default view.
                // We don't have a single "Portfolio" doc to add 'stocks' to in the current schema (implied).
                // So we update the share document itself.
                const shareRef = doc(db, `artifacts/${APP_ID}/users/${userId}/shares`, existingShare ? existingShare.id : 'unknown'); // 'unknown' case covered by creation above returning ID, but simplified here.
                // Actually, if we just created it using addShare, it defaults to 'portfolio'.
                // IF it existed but wasn't in portfolio (unlikely in this simple app, but possible), we'd update.
                // Minimal change: The check above `existingShare` implies it's already in the cached shares list, effectively "in" the user's universe.
                // If the getWatchlistData for 'null' relies on 'portfolio' string, let's just ensure that.
            }
        }
    }

    /**
     * Removes a stock from a watchlist.
     * @param {string} userId
     * @param {string|null} watchlistId
     * @param {string} code
     */
    async removeStock(userId, watchlistId, code) {
        if (!userId || !code) return;
        const normalizedCode = code.toUpperCase();

        if (watchlistId && watchlistId !== ALL_SHARES_ID) {
            // Custom Watchlist: Remove from 'stocks' array
            const watchlistRef = doc(db, `artifacts/${APP_ID}/users/${userId}/watchlists`, watchlistId);
            try {
                await updateDoc(watchlistRef, {
                    stocks: arrayRemove(normalizedCode)
                });
                console.log(`UserStore: Removed ${normalizedCode} from watchlist ${watchlistId}`);
            } catch (e) {
                console.error("UserStore: Error removing stock from watchlist:", e);
            }
        } else {
            // Portfolio (Default): Remove the share document entirely OR remove ownership?
            // "Remove from Watchlist" usually implies hiding it.
            // If we delete the doc, it's gone from ALL lists.
            // Requirement says: "Remove existing one".
            // Since shares in Portfolio are usually "owned" or "watched",
            // deleting the document is the cleanest way to "remove" it from the default view
            // IF the default view shows ALL shares.
            const share = AppState.data.shares.find(s => s.shareName === normalizedCode);
            if (share) {
                const shareRef = doc(db, `artifacts/${APP_ID}/users/${userId}/shares`, share.id);
                try {
                    await deleteDoc(shareRef);
                    console.log(`UserStore: Deleted share ${normalizedCode} from Portfolio (Database)`);
                } catch (e) {
                    console.error("UserStore: Error deleting share:", e);
                }
            }
        }
    }

    /**
     * Filters shares based on the watchlist ID.
     * @param {Array} shares - The full list of user shares.
     * @param {string|null} watchlistId
     * @returns {Array} Filtered list of shares.
     */
    getWatchlistData(shares, watchlistId) {
        if (!shares || !Array.isArray(shares)) return [];

        // CASE 1: 'ALL'
        if (watchlistId === ALL_SHARES_ID) {
            return shares;
        }

        // CASE 2: Custom Watchlist
        if (watchlistId) {
            const watchlist = (AppState.data.watchlists || []).find(w => w.id === watchlistId);

            // source A: Shares listed in the watchlist's 'stocks' array (New Logic)
            let stocksInArray = [];
            if (watchlist && Array.isArray(watchlist.stocks)) {
                stocksInArray = watchlist.stocks;
            }

            // Return shares that are EITHER in the array OR have the watchlistID (Legacy Logic)
            return shares.filter(share => {
                // Check New Schema (Array in Watchlist)
                if (stocksInArray.includes(share.shareName)) return true;

                // Check Legacy Schema (ID in Share)
                // Note: normalized comparison just in case
                if (share.watchlistIds && Array.isArray(share.watchlistIds)) {
                    return share.watchlistIds.includes(watchlistId);
                }
                return share.watchlistId === watchlistId;
            });
        }

        // CASE 3: Default 'Portfolio' (null)
        if (!watchlistId) {
            // Logic: Show all shares that are NOT specifically hidden?
            // Or follow legacy "Portfolio" logic. 
            // Ideally we return shares that have 'portfolio' tag OR are just "loose" shares if that's the default.
            // Given the user observation, let's ensure we capture everything that is meant to be here.
            return shares.filter(share => {
                if (share.watchlistIds && Array.isArray(share.watchlistIds)) {
                    return share.watchlistIds.includes(PORTFOLIO_ID);
                }
                return share.watchlistId === PORTFOLIO_ID;
            });
        }

        return shares;
    }


    /**
     * Generic Method: Adds a document to a specified sub-collection.
     * @param {string} userId
     * @param {string} collectionName
     * @param {Object} data
     */
    async addDocument(userId, collectionName, data) {
        if (!userId || !collectionName || !data) return;
        const ref = collection(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`);
        try {
            await addDoc(ref, {
                ...data,
                createdAt: serverTimestamp()
            });
            console.log(`UserStore: Added document to ${collectionName}.`);
        } catch (e) {
            console.error(`UserStore: Error adding to ${collectionName}:`, e);
            throw e;
        }
    }

    /**
     * Generic Method: Updates a document in a specified sub-collection.
     * @param {string} userId
     * @param {string} collectionName
     * @param {string} docId
     * @param {Object} data
     */
    async updateDocument(userId, collectionName, docId, data) {
        if (!userId || !collectionName || !docId) return;
        const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`, docId);
        try {
            await updateDoc(docRef, data);
            console.log(`UserStore: Updated document in ${collectionName}.`);
        } catch (e) {
            console.error(`UserStore: Error updating in ${collectionName}:`, e);
            throw e;
        }
    }

    /**
     * Generic Method: Deletes a document from a specified sub-collection.
     * @param {string} userId
     * @param {string} collectionName
     * @param {string} docId
     */
    async deleteDocument(userId, collectionName, docId) {
        if (!userId || !collectionName || !docId) {
            console.error('[UserStore] Blocked deleteDocument: Missing params', { userId, collectionName, docId });
            return;
        }
        console.log(`[UserStore] Attempting to delete document: ${collectionName}/${docId}`);
        const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`, docId);
        try {
            await deleteDoc(docRef);
            console.log(`[UserStore] SUCCESS: Deleted document ${collectionName}/${docId}`);
        } catch (e) {
            console.error(`[UserStore] FAILED to delete from ${collectionName}:`, e);
            throw e;
        }
    }

    /**
     * Generic Method: Fetches all documents from a specified sub-collection.
     * @param {string} userId
     * @param {string} collectionName
     * @returns {Promise<Array>} Array of objects with id and data.
     */
    async getAllDocuments(userId, collectionName) {
        if (!userId || !collectionName) return [];
        const ref = collection(db, `artifacts/${APP_ID}/users/${userId}/${collectionName}`);
        try {
            const snapshot = await getDocs(ref);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error(`UserStore: Error fetching from ${collectionName}:`, e);
            throw e; // Force caller to handle it (no silent failure)
        }
    }

    /**
     * Subscribes to the user's preferences configuration.
     * @param {string} userId
     * @param {function(Object): void} callback
     * @returns {function} Unsubscribe function
     */
    subscribeToPreferences(userId, callback) {
        if (!userId || !callback) {
            console.warn('UserStore: subscribeToPreferences blocked - missing userId or callback');
            return () => { };
        }
        const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/preferences/config`);
        console.log('UserStore: Subscribing to preferences for user:', userId);

        return onSnapshot(docRef, { includeMetadataChanges: true }, (docSnap) => {
            if (docSnap.exists()) {
                console.log('UserStore [V3-METADATA]: Preferences snapshot received. Pending writes:', docSnap.metadata.hasPendingWrites);
                callback(docSnap.data(), docSnap.metadata);
            } else {
                console.log('UserStore: No preferences document exists yet.');
                callback(null);
            }
        }, (error) => {
            if (error.code === 'permission-denied') return;
            console.error("UserStore: Error listening to preferences:", error);
        });
    }

    /**
     * Saves user preferences (merging with existing data).
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
            console.log('UserStore: Saving preferences to Firestore...', data);
            await setDoc(docRef, {
                ...data,
                updatedAt: serverTimestamp()
            }, { merge: true });
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

        // CRITICAL: Explicitly attempt to delete known preference documents by path 
        // (in case getAllDocuments missed them or they are shadow docs)
        const explicitDocs = [
            { col: 'preferences', id: 'config' },
            { col: 'preferences', id: 'scanner' }
        ];

        for (const item of explicitDocs) {
            try {
                const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/${item.col}`, item.id);
                await deleteDoc(docRef);
                console.log(`[UserStore] Explicitly deleted ${item.col}/${item.id}`);
            } catch (err) {
                console.warn(`[UserStore] Explicit deletion skip/fail for ${item.col}/${item.id}:`, err.message);
            }
        }

        console.log(`[UserStore] WIPE COMPLETE for ${userId}. Total operations attempted: ${results.length + explicitDocs.length}`);
        console.table(results.map(r => r.value || r.reason));
    }

    /**
     * Ensures the user root document exists (needed for backend discovery).
     * @param {string} userId 
     */
    async provisionUser(userId) {
        if (!userId) return;
        const userRef = doc(db, `artifacts/${APP_ID}/users`, userId);
        try {
            await setDoc(userRef, {
                lastActive: serverTimestamp()
            }, { merge: true });
            console.log(`UserStore: User document provisioned/touched for ${userId}`);
        } catch (e) {
            console.error("UserStore: Error provisioning user:", e);
        }
    }
}
