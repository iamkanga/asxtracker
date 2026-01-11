/**
 * AppService.js
 * Business logic layer for Cash & Assets.
 * Orchestrates UI data gathering, validation, and persistence.
 */

import { userStore } from './DataService.js';
// CashAssetUI import removed to decouple Service from UI layers
import { AppState } from '../state/AppState.js';
import { USER_MESSAGES } from '../utils/AppConstants.js';
import { ToastManager } from '../ui/ToastManager.js';

export class AppService {
    /**
     * Saves a cash asset (Add or Update).
     * Orchestrates gathering data from the UI and calling persistence.
     * @param {boolean} isSilent - If true, suppresses success alerts (optional).
     */
    /**
     * Saves a cash asset (Add or Update).
     * @param {Object} formData - The asset data { name, balance, category }.
     * @param {string|null} assetId - Optional ID for updates.
     * @param {boolean} isSilent - If true, suppresses success alerts (optional).
     */
    async saveCashAsset(formData, assetId = null, isSilent = false) {
        // Validation
        if (!formData || !formData.name) {
            alert(USER_MESSAGES.ERR_INVALID_DATA);
            return;
        }

        // 3. Resolve User
        const user = AppState.user;
        if (!user) {
            alert(USER_MESSAGES.AUTH_REQUIRED_SAVE_ASSETS);
            return;
        }

        // 4. Determine if Add or Update
        // assetId passed directly now, or we can try to find by name if loose matching is desired.
        // For Strict Logic, we prefer ID if available.

        let targetId = assetId;

        if (!targetId) {
            // Fallback: Check title/name collision if design requires it
            const existing = AppState.data.cash.find(c => c.name === formData.name);
            if (existing) {
                targetId = existing.id;
            }
        }

        try {
            if (targetId) {
                // UPDATE
                console.log(`[AppService DEBUG] UPDATE: ${targetId} -> Color: ${formData.color}`);
                await userStore.updateDocument(user.uid, 'cashCategories', targetId, formData);
                if (!isSilent) ToastManager.success(`${formData.name} updated.`);
            } else {
                // ADD
                console.log(`[AppService DEBUG] ADD -> Color: ${formData.color}`);
                await userStore.addDocument(user.uid, 'cashCategories', formData);
                if (!isSilent) ToastManager.success(`${formData.name} added.`);
            }
        } catch (error) {
            console.error("AppService: Save failed", error);
            ToastManager.error(USER_MESSAGES.ERR_SAVE_ASSET + error.message);
        }
    }

    /**
     * Subscribe to user data updates.
     * @param {string} userId
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    subscribeToUserData(userId, callback) {
        return userStore.subscribe(userId, callback);
    }

    /**
     * Deletes a cash asset category.
     * @param {string} assetId 
     */
    async deleteCashCategory(assetId) {
        if (!assetId) return;

        const user = AppState.user;
        if (!user) {
            alert(USER_MESSAGES.AUTH_REQUIRED_DELETE_ASSETS);
            return;
        }

        try {
            await userStore.deleteDocument(user.uid, 'cashCategories', assetId);
            ToastManager.success(USER_MESSAGES.ASSET_DELETED);
        } catch (error) {
            console.error("AppService: Delete failed", error);
            ToastManager.error(USER_MESSAGES.ERR_DELETE_ASSET + error.message);
        }
    }

    /**
     * Adds a new watchlist.
     * @param {string} name 
     * @returns {Promise<string|null>} The new watchlist ID.
     */
    async addWatchlist(name) {
        if (!name) return null;
        const user = AppState.user;
        if (!user) {
            alert(USER_MESSAGES.AUTH_REQUIRED_FIRST);
            return null;
        }
        return await userStore.addWatchlist(user.uid, name);
    }

    /**
     * Renames a watchlist.
     * @param {string} id 
     * @param {string} name 
     */
    async renameWatchlist(id, name) {
        if (!id || !name) return;
        const user = AppState.user;
        if (!user) {
            alert(USER_MESSAGES.AUTH_REQUIRED_FIRST);
            return;
        }

        // Check if System Watchlist (ID is 'ALL', 'CASH', 'DASHBOARD', 'portfolio')
        // OR any non-backend ID we decide to support.
        const systemIds = ['ALL', 'CASH', 'DASHBOARD', 'portfolio', 'search'];
        if (systemIds.includes(id)) {
            // Persist as Custom Name Preference
            const currentMap = AppState.preferences.customWatchlistNames || {};
            const updatedMap = { ...currentMap, [id]: name };

            // Save to Cloud & Local
            await this.saveUserPreferences({ customWatchlistNames: updatedMap });

            // Update Local State Immediately (for responsiveness)
            AppState.preferences.customWatchlistNames = updatedMap;
            localStorage.setItem('ASX_NEXT_customWatchlistNames', JSON.stringify(updatedMap)); // Local echo

            ToastManager.success('View renamed successfully.');
            return;
        }

        // Default Path for Database Watchlists
        await userStore.renameWatchlist(user.uid, id, name);
    }

    /**
     * Deletes a watchlist.
     * @param {string} id 
     */
    async deleteWatchlist(id) {
        if (!id) return;
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED_FIRST);
            return;
        }
        await userStore.deleteWatchlist(user.uid, id);
    }

    /**
     * Wipes all user data across all sub-collections.
     */
    async wipeUserData() {
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED);
            return;
        }

        try {
            await userStore.wipeAllData(user.uid);

            // ARCHITECTURAL REVERSAL: Set onboarded: false after wipe.
            // This allows the next login to trigger the NEW default seeding (BHP, TLS, etc).
            // The "Onboarding Loop" is now prevented by the _onboardingTriggered guard in AppController.
            await userStore.savePreferences(user.uid, { onboarded: false });

            ToastManager.success(USER_MESSAGES.DATA_WIPED);
            // AppController handled reload will now see onboarded: false and seed.
        } catch (error) {
            console.error("AppService: Wipe failed", error);
            ToastManager.error("Failed to delete all data: " + error.message);
            throw error;
        }
    }

    /**
     * Prepares all user data for export.
     * @returns {Object} { shares, cash, watchlists }
     */
    prepareExportData() {
        return {
            shares: AppState.data.shares || [],
            cash: AppState.data.cash || [],
            watchlists: AppState.data.watchlists || []
        };
    }

    /**
     * Prepares the list of watchlists for the UI picker.
     * @returns {Array} List of objects {id, name}
     */
    getWatchlistOptions() {
        // Core Logic: Exclude System Watchlists (Cash, Search)
        const availableWatchlists = (AppState.data.watchlists || [])
            .filter(w => w.id !== 'CASH' && w.id !== 'SEARCH');

        // Always include Portfolio
        return [
            { id: 'portfolio', name: 'Portfolio' },
            ...availableWatchlists
        ];
    }


    /**
     * Adds a base share record to the user's collection.
     * Centralizes the persistence logic for creating new share documents.
     * @param {Object} shareData - The share data object.
     */
    async addBaseShareRecord(shareData) {
        // Service Layer Validation
        if (!shareData || !shareData.shareName || typeof shareData.shareName !== 'string' || shareData.shareName.trim() === '' || shareData.shareName.toUpperCase() === 'UNDEFINED') {
            throw new Error(USER_MESSAGES.ERR_INVALID_STOCK_CODE);
        }

        const user = AppState.user;
        if (!user) {
            throw new Error(USER_MESSAGES.AUTH_ERROR_SIGNED_IN);
        }
        await userStore.addShare(user.uid, shareData);
    }

    /**
     * Updates an existing share record.
     * @param {string} shareId - The ID of the share to update.
     * @param {Object} shareData - The updated data.
     */
    async updateShareRecord(shareId, shareData) {
        if (!shareId) throw new Error(USER_MESSAGES.ERR_MISSING_SHARE_ID);

        // Validation similar to add, but allow partial updates (e.g. just moving watchlist)
        if (!shareData) {
            throw new Error(USER_MESSAGES.ERR_INVALID_DATA);
        }

        const user = AppState.user;
        if (!user) throw new Error(USER_MESSAGES.AUTH_REQUIRED); // "Please sign in."

        await userStore.updateDocument(user.uid, 'shares', shareId, shareData);
    }

    async addStock(symbol, watchlistId, price = null, date = null) {
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED_MANAGE);
            return;
        }
        const lookupKey = String(symbol).trim().toUpperCase();
        const priceData = AppState.livePrices?.get(lookupKey);
        const resolvedPrice = price !== null ? price : (priceData ? (parseFloat(priceData.live) || 0) : 0);
        const resolvedDate = date !== null ? date : new Date().toISOString();

        await userStore.addStock(user.uid, watchlistId, symbol, resolvedPrice, resolvedDate);
    }

    /**
     * Removes a stock from the specified watchlist.
     * @param {string} code - The stock code.
     * @param {string|null} watchlistId - The watchlist ID.
     */
    async removeStock(code, watchlistId) {
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED);
            return;
        }
        await userStore.removeStock(user.uid, watchlistId, code);
    }

    /**
     * Deletes a share record or removes it from a watchlist.
     * @param {string|null} watchlistId - The context we are deleting from.
     * @param {string} shareId - The unique document ID of the share.
     */
    async deleteShareRecord(watchlistId, shareId) {
        if (!shareId) return;
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED);
            return;
        }

        console.log(`[AppService] deleteShareRecord called for ShareID: ${shareId}, Context: ${watchlistId || 'PORTFOLIO/GLOBAL'}`);

        // UNIFIED DELETION PROTOCOL (Clean Delete):
        // Previously, this function hunted down "siblings" (shares with same code in other lists) and deleted them too.
        // This was causing data loss when deleting a watchlist or removing a duplicate.
        // V3 Fix: Delete ONLY the specific document ID requested.

        await userStore.deleteDocument(user.uid, 'shares', shareId);

        console.log(`[AppService] Deleted share document: ${shareId}`);
    }

    /**
     * EMERGENCY: Sanitizes corrupted share records (missing shareName).
     * @param {string} userId 
     */
    async sanitizeCorruptedShares(userId) {
        if (!userId) return;
        // console.log("Running Data Sanitation: Checking for corrupted shares...");

        try {
            const shares = await userStore.getAllDocuments(userId, 'shares');
            let deletedCount = 0;

            for (const share of shares) {
                // Check if invalid: missing shareName, string "undefined", or empty
                if (!share.shareName || share.shareName === 'undefined' || share.shareName.trim() === '') {
                    console.warn(`Sanitize: Found bad record ${share.id}. Deleting...`, share);
                    await userStore.deleteDocument(userId, 'shares', share.id);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                // console.log(`Sanitize: Deleted ${deletedCount} corrupted records.`);
                // alert(`Sanitation Complete: Removed ${deletedCount} corrupted records.`); // Optional specific feedback
            } else {
                // console.log("Sanitize: No corrupted records found.");
            }
        } catch (e) {
            console.error("Sanitize Error:", e);
        }
    }
    /**
     * Helper to filter shares by watchlist.
     * @param {Array} shares 
     * @param {string|null} watchlistId 
     * @returns {Array}
     */
    getWatchlistData(shares, watchlistId) {
        return userStore.getWatchlistData(shares, watchlistId);
    }

    /**
     * Retrieves all unique share codes from the user's data.
     * @returns {Array<string>} List of unique codes.
     */
    getAllShareCodes() {
        const shares = AppState.data.shares || [];
        const uniqueCodes = [...new Set(shares.map(s => s.shareName))].filter(Boolean);
        return uniqueCodes.sort();
    }

    /**
     * Subscribes to cloud user preferences.
     * @param {string} userId 
     * @param {function} callback 
     * @returns {function} unsubscribe
     */
    subscribeToUserPreferences(userId, callback) {
        return userStore.subscribeToPreferences(userId, callback);
    }

    /**
     * Saves user preferences to cloud.
     * @param {Object} prefs 
     */
    async saveUserPreferences(prefs) {
        const user = AppState.user;
        if (!user) return;
        await userStore.savePreferences(user.uid, prefs);
    }

    /**
     * Provisions the user document in Firestore.
     * @param {string} userId
     */
    async provisionUser(userId) {
        if (!userId) return;
        await userStore.provisionUser(userId);
    }

    /**
     * Creates default data for a new user (Onboarding).
     * @param {string} userId 
     */
    async createDefaultOnboardingData(userId) {
        if (!userId) return;

        // console.log(`[AppService] Creating default onboarding data for user: ${userId}`);

        try {
            // 1. Create default watchlist "My Watch List"
            // console.log(`[AppService] Creating 'My Watch List'...`);
            const watchlistId = await userStore.addWatchlist(userId, 'My Watch List');
            // console.log(`[AppService] Watchlist created with ID: ${watchlistId}`);

            // 2. Add 5 specific Australian top shares (Request: BHP, VAS, QAN, CBA, TLS)
            const defaultStocks = ['BHP', 'VAS', 'QAN', 'CBA', 'TLS'];
            console.log('[AppService] Seeding stocks (Active V5):', defaultStocks); // DEBUG: Prove version
            const now = new Date().toISOString();

            for (const symbol of defaultStocks) {
                // console.log(`[AppService] Seeding stock: ${symbol}`);
                // EXCEPTION: User requested Portfolio and Cash be empty.
                // We ONLY add these to the new "My Watch List".
                if (watchlistId) {
                    await userStore.addStock(userId, watchlistId, symbol, 0, now);
                }
            }

            // 3. Initialize default preferences (Carousel Selections)
            // 'ALL', 'portfolio', 'CASH' are system IDs.
            const defaultCarousel = ['ALL', 'portfolio', 'CASH'];
            if (watchlistId) defaultCarousel.push(watchlistId);

            // console.log(`[AppService] Finalizing preferences (onboarded=true)...`);
            await userStore.savePreferences(userId, {
                carouselSelections: defaultCarousel,
                lastWatchlistId: 'ALL', // Default to All Shares on first load
                onboarded: true,
                // NEW USER DEFAULTS (Requested Jan 2026)
                excludePortfolio: true, // Watchlist Override: ON
                scanner: {
                    activeFilters: null // Sectors: ALL
                },
                scannerRules: {
                    up: { percentThreshold: null, dollarThreshold: 0.50 },
                    down: { percentThreshold: null, dollarThreshold: 0.50 },
                    minPrice: null,
                    hiloMinPrice: 0.50, // 52 Week High Low Limit: $0.50
                    moversEnabled: true,
                    hiloEnabled: true,
                    personalEnabled: true
                }
            });

            // console.log(`[AppService] Default data created successfully for ${userId}`);
        } catch (error) {
            console.error(`[AppService] CRITICAL FAILURE in onboarding data creation:`, error);
        }
    }
}
