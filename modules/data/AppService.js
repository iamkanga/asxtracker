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
                await userStore.updateDocument(user.uid, 'cashCategories', targetId, formData);
                if (!isSilent) ToastManager.success(`${formData.name} updated.`);
            } else {
                // ADD
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
    subscribeToUserData(userId, callback = null) {
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
        return await userStore.addShare(user.uid, shareData);
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

    async addStock(symbol, watchlistId, price = null, date = null, explicitDocId = null) {
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED_MANAGE);
            return;
        }
        const lookupKey = String(symbol).trim().toUpperCase();
        const priceData = AppState.livePrices?.get(lookupKey);
        const resolvedPrice = price !== null ? price : (priceData ? (parseFloat(priceData.live) || 0) : 0);
        const resolvedDate = date !== null ? date : new Date().toISOString();

        return await userStore.addStock(user.uid, watchlistId, symbol, resolvedPrice, resolvedDate, explicitDocId);
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
     * Removes a share from a specific watchlist (Unlink).
     * If the share is no longer in ANY watchlist, it deletes the share document.
     * @param {string} watchlistId 
     * @param {string} shareId 
     */
    async removeShareFromWatchlist(watchlistId, shareId) {
        if (!shareId || !watchlistId) return;
        const user = AppState.user;
        if (!user) {
            ToastManager.error(USER_MESSAGES.AUTH_REQUIRED);
            return;
        }
        // 1. Get current share data to check other memberships
        const shares = AppState.data.shares || [];
        const share = shares.find(s => s.id === shareId);

        if (!share) {
            console.warn(`[AppService] Share ${shareId} not found locally.`);
            return;
        }

        const currentIds = Array.isArray(share.watchlistIds) ? share.watchlistIds : [share.watchlistId];
        const newIds = currentIds.filter(id => id !== watchlistId);

        if (newIds.length === 0) {
            // ORPHAN: Delete completely
            await userStore.deleteDocument(user.uid, 'shares', shareId);
        } else {
            // SAFE: Update with removed ID
            await userStore.updateDocument(user.uid, 'shares', shareId, {
                watchlistIds: newIds,
                // Legacy support: If watchlistId matched the one we removed, update it to the first available one
                watchlistId: newIds[0]
            });
        }
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
        // UNIFIED DELETION PROTOCOL (Clean Delete):
        // Previously, this function hunted down "siblings" (shares with same code in other lists) and deleted them too.
        // This was causing data loss when deleting a watchlist or removing a duplicate.
        // V3 Fix: Delete ONLY the specific document ID requested.

        // 1. Get Share Data to find Code (needed for Watchlist Scrub)
        let shareCode = null;
        try {
            const share = (AppState.data.shares || []).find(s => s.id === shareId);
            if (share) shareCode = share.shareName || share.code;
        } catch (e) { console.warn('Could not lookup share code for scrub:', e); }

        // 2. Delete the Document
        await userStore.deleteDocument(user.uid, 'shares', shareId);
        // 3. SCRUB References (Prevent Zombie Resurrection)
        // If the share code remains in a watchlist array, "Ghost Recovery" will resurrect it.
        // We must remove the code from ALL watchlists, including system ones.
        if (shareCode) {
            const customWatchlists = (AppState.data.watchlists || []).map(w => w.id);
            const systemWatchlists = ['portfolio', 'ALL'];
            const allWatchlistIds = [...new Set([...customWatchlists, ...systemWatchlists])];
            const scrubPromises = allWatchlistIds.map(wId =>
                userStore.removeStock(user.uid, wId, shareCode).catch(e => console.warn(`Scrub failed for ${wId}:`, e))
            );
            await Promise.all(scrubPromises);
        }
    }

    /**
     * EMERGENCY: Sanitizes corrupted share records (missing shareName).
     * @param {string} userId 
     */
    async sanitizeCorruptedShares(userId) {
        if (!userId) return;
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
                // alert(`Sanitation Complete: Removed ${deletedCount} corrupted records.`); // Optional specific feedback
            } else {
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
        try {
            // 1. Create default watchlist "My Watch List"
            const watchlistId = await userStore.addWatchlist(userId, 'My Watch List');
            // 2. Add 5 specific Australian top shares (Request: CBA, VAS, BHP, QAN, TLS)
            const defaultStocks = ['CBA', 'VAS', 'BHP', 'QAN', 'TLS'];
            const now = new Date().toISOString();

            for (const symbol of defaultStocks) {
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
            await userStore.savePreferences(userId, {
                carouselSelections: defaultCarousel,
                lastWatchlistId: 'ALL', // Default to All Shares on first load
                onboarded: true,
                // NEW USER DEFAULTS (Requested Jan 2026)
                gradientStrength: 0.25, // Classic Style: 0.25
                containerBorders: { sides: [0, 0, 0, 1], thickness: 3 }, // Classic Style: Left border only, 3px
                badgeScope: 'all', // Badge Count: Set to ALL by default
                excludePortfolio: true, // Watchlist Override: ON
                scanner: {
                    activeFilters: null // Sectors: ALL
                },
                scannerRules: {
                    // Set ALL thresholds to $1.00 as requested (Non-negotiable)
                    up: { percentThreshold: null, dollarThreshold: 1.00 },
                    down: { percentThreshold: null, dollarThreshold: 1.00 },
                    minPrice: 1.00,
                    hiloMinPrice: 1.00, // 52 Week High Low Limit: $1.00
                    moversEnabled: true,
                    hiloEnabled: true,
                    personalEnabled: true
                }
            });
        } catch (error) {
            console.error(`[AppService] CRITICAL FAILURE in onboarding data creation:`, error);
        }
    }

    /**
     * Performs a deep health check and repairs inconsistencies.
     * Focus: Missing IDs (Ghost Shares) and Orphaned linkages.
     */
    async performDataHealthCheck() {
        const user = AppState.user;
        if (!user) return;

        const shares = AppState.data.shares || [];
        const watchlists = AppState.data.watchlists || [];

        console.group('[AppService] 🔍 Data Health Check');

        // 1. Repair Shares without IDs
        const idless = shares.filter(s => !s.id);
        if (idless.length > 0) {
            console.warn(`[AppService] Found ${idless.length} shares without ID. Attempting recovery...`, idless.map(s => s.shareName));
            for (const s of idless) {
                const match = shares.find(other => other.id && other.shareName === s.shareName);
                if (match) {
                    s.id = match.id;
                }
            }
        }

        // 2. Identify Ghost Shares (codes in watchlists that aren't in shares)
        const knownShareCodes = new Set(shares.map(s => (s.shareName || '').toUpperCase()));
        const ghostsFound = [];

        watchlists.forEach(w => {
            if (w.stocks && Array.isArray(w.stocks)) {
                w.stocks.forEach(code => {
                    if (typeof code === 'string' && !knownShareCodes.has(code.toUpperCase())) {
                        ghostsFound.push({ watchlist: w.name, code: code });
                    }
                });
            }
        });

        if (ghostsFound.length > 0) {
            const breakdown = ghostsFound.reduce((acc, g) => {
                if (!acc[g.code]) acc[g.code] = [];
                acc[g.code].push(g.watchlist);
                return acc;
            }, {});
            console.warn(`[AppService] Found ${ghostsFound.length} Ghost Share references (no master document):`, breakdown);
        } else {
        }

        console.groupEnd();
    }

    /**
     * Deep Scrub: Removes all Ghost references from all watchlists.
     */
    async repairGhostShares() {
        const user = AppState.user;
        if (!user) {
            console.error('[AppService] No user session found for repair.');
            return;
        }

        const shares = AppState.data.shares || [];
        const watchlists = AppState.data.watchlists || [];
        const knownCodes = new Set(shares.map(s => (s.shareName || '').toUpperCase()));

        console.group('[AppService] 🧹 Deep Scrubbing Ghost Shares...');

        let removedCount = 0;
        for (const w of watchlists) {
            if (w.stocks && Array.isArray(w.stocks)) {
                // Must iterate backwards or use a copy when removing
                const codesToScrub = w.stocks.filter(code =>
                    typeof code === 'string' && !knownCodes.has(code.toUpperCase())
                );

                for (const code of codesToScrub) {
                    await userStore.removeStock(user.uid, w.id, code);
                    removedCount++;
                }
            }
        }
        console.groupEnd();

        // One-time refresh hint
        if (removedCount > 0) {
            alert(`Cleaned up ${removedCount} ghost references. Refreshing UI...`);
            window.location.reload();
        } else {
            alert('No ghost shares found to clean.');
        }
    }
}
