/**
 * ModalController.js
 * Handles interaction logic for opening and managing modals (Add Share, Add Cash, etc).
 * Decouples main controller from specific modal UI orchestration.
 */

import { AppState } from '../state/AppState.js';
import { ShareFormUI } from '../ui/ShareFormUI.js';
import { CashAssetUI } from '../ui/CashAssetUI.js';
import { DataService } from '../data/DataService.js';
import { AppService } from '../data/AppService.js';
import { normalizeComments } from '../data/DataProcessor.js'; // Added
import {
    USER_MESSAGES,
    CASH_WATCHLIST_ID,
    SEARCH_WATCHLIST_ID,
    PORTFOLIO_ID,
    IDS,
    CSS_CLASSES,
    EVENTS
} from '../utils/AppConstants.js';
import { ToastManager } from '../ui/ToastManager.js';





// Instantiate services or allow injection. 
const dataService = new DataService();
const appService = new AppService();

export class ModalController {

    constructor(viewRendererUpdateCallback) {
        this.updateCallback = viewRendererUpdateCallback; // Callback to refresh UI after save
    }

    /**
     * Orchestrates the Cash Asset Modal.
     * @param {string|null} assetId 
     */
    handleOpenCashModal(assetId = null) {
        const asset = assetId ? AppState.data.cash.find(c => c.id === assetId) : null;
        const ui = new CashAssetUI();

        ui.showAddEditModal(asset, async (formData) => {
            await appService.saveCashAsset(formData, assetId);
            if (this.updateCallback) await this.updateCallback(false);
        }, async () => {
            if (assetId) {
                await appService.deleteCashCategory(assetId);
                if (this.updateCallback) await this.updateCallback(false);
            }
        });
    }

    /**
     * Orchestrates the Add/Edit Share Modal.
     * @param {string|Object|null} input - If string, edits shareId. If object, pre-fills new share.
     */
    async openAddShareModal(input = null, initialSection = null) {
        // 1. Prepare Watchlists
        const availableWatchlists = (AppState.data.watchlists || [])
            .filter(w => w.id !== CASH_WATCHLIST_ID && w.id !== SEARCH_WATCHLIST_ID);

        const watchlistsForUI = [
            { id: 'portfolio', name: 'Portfolio' },
            ...availableWatchlists
        ];

        // Membership Map: watchlistId -> documentId
        const existingMemberships = new Map();
        let initialData = null;
        let stockCode = null;

        if (typeof input === 'string') {
            // EDIT MODE (shareId)
            const targetShare = AppState.data.shares.find(s => s.id === input);
            if (!targetShare) {
                ToastManager.error(USER_MESSAGES.SHARE_NOT_FOUND);
                return;
            }
            stockCode = targetShare.shareName;
            initialData = {
                ...targetShare,
                title: targetShare.name || targetShare.title || '',
                comments: normalizeComments(targetShare.comments) // Fix: Normalize legacy comments
            };

            // 1. Find explicit share documents (Legacy & Mixed Schema)
            AppState.data.shares.filter(s => (s.shareName || '').toUpperCase() === (stockCode || '').toUpperCase()).forEach(s => {
                const wId = s.watchlistId || 'portfolio';
                existingMemberships.set(wId, s.id);
            });

            // 2. Find implicit memberships in Watchlist 'stocks' arrays (New Schema)
            (AppState.data.watchlists || []).forEach(wl => {
                if (wl.stocks && Array.isArray(wl.stocks)) {
                    if (wl.stocks.some(code => code.toUpperCase() === stockCode.toUpperCase())) {
                        if (!existingMemberships.has(wl.id)) {
                            // Mark as present (id null means no specific share doc found for this watchlist yet)
                            existingMemberships.set(wl.id, null);
                        }
                    }
                }
            });
        } else if (typeof input === 'object' && input !== null) {
            // PRE-FILL MODE (New Share)
            initialData = input;
            stockCode = input.shareName;
        }

        const activeWatchlistIds = Array.from(existingMemberships.keys());
        if (activeWatchlistIds.length === 0 && AppState.watchlist.id !== SEARCH_WATCHLIST_ID) {
            activeWatchlistIds.push(AppState.watchlist.id || 'portfolio');
        }

        // 2. Open Modal via View Layer
        ShareFormUI.showShareModal({
            watchlists: watchlistsForUI,
            activeWatchlistIds: activeWatchlistIds,
            activeWatchlistIds: activeWatchlistIds,
            shareData: initialData,
            initialSection: initialSection,

            // Callback: Live Price Lookup
            onLookupPrice: async (code) => {
                const prices = await dataService.fetchLivePrices([code]);
                return prices.get(code);
            },

            // Callback: Delete
            onDelete: async (id) => {
                if (confirm(USER_MESSAGES.CONFIRM_DELETE)) {
                    try {
                        await appService.deleteShareRecord(null, id);
                        if (this.updateCallback) await this.updateCallback();

                        // Try to find code from data or default
                        const deletedShare = AppState.data.shares.find(s => s.id === id);
                        const code = deletedShare ? deletedShare.shareName : 'Share';

                        ToastManager.success(`${code} deleted.`);
                        document.querySelector('#add-share-modal .modal-close-btn')?.click();
                    } catch (e) {
                        ToastManager.error(USER_MESSAGES.ERROR_DELETE + e.message);
                    }
                }
            },

            // Callback: Save (SYNC LOGIC)
            onSave: async (formData) => {
                try {
                    const newWatchlists = formData.watchlists || [];
                    const previousWatchlists = Array.from(existingMemberships.keys());

                    const errors = [];
                    let successCount = 0;

                    // 1. ADD: New watchlists not in existing
                    // 1. ADD: New watchlists not in existing
                    const toAdd = newWatchlists.filter(w => !existingMemberships.has(w));

                    // OPTIMISTIC INJECTION FIX:
                    // Determine if the share already exists in AppState (Global Lookup)
                    const lookupKey = String(formData.shareName).trim().toUpperCase();
                    let shareExists = AppState.data.shares.some(s => s.shareName === lookupKey);

                    for (const wid of toAdd) {
                        // FIX: Use explicit PORTFOLIO_ID instead of null for visibility
                        const persistenceId = (wid === PORTFOLIO_ID || wid === 'main') ? PORTFOLIO_ID : wid;

                        if (!shareExists) {
                            // CASE A: FIRST CREATION (Master Record)
                            // We use the full formData to create the definitive "Shared" document.
                            const priceData = AppState.livePrices?.get(lookupKey);
                            const entryPrice = priceData ? (parseFloat(priceData.live) || 0) : 0;
                            const entryDate = new Date().toISOString();

                            const dataToAdd = {
                                ...formData,
                                watchlistId: persistenceId, // Set primary context
                                enteredPrice: entryPrice,
                                entryDate: entryDate
                            };
                            delete dataToAdd.watchlists;

                            try {
                                console.log(`[ModalController] Creating Primary Share Record for ${lookupKey} in ${wid}`);
                                await appService.addBaseShareRecord(dataToAdd);
                                successCount++;

                                // *** OPTIMISTIC INJECTION ***
                                // Immediately "Fake" the share in AppState so the NEXT iteration finds it.
                                // This prevents the loop from creating duplicates.
                                AppState.data.shares.push({
                                    shareName: lookupKey,
                                    id: 'OPTIMISTIC_LOCK', // Temporary ID, sufficient for existence checks
                                    watchlistId: persistenceId
                                });
                                shareExists = true; // Flag as existing for next loop

                            } catch (err) {
                                console.error(`Failed to add to ${wid}:`, err);
                                errors.push(wid);
                            }
                        } else {
                            // CASE B: LINKING (Share already exists / Just created)
                            // We use `addStock` which performs a "Link" (ArrayUnion) to the watchlist
                            // because it finds the share in AppState (thanks to Injection).
                            try {
                                console.log(`[ModalController] Linking ${lookupKey} to Watchlist ${wid}`);
                                await appService.addStock(lookupKey, persistenceId); // Uses 'addStock' logic (Link)
                                successCount++;
                            } catch (err) {
                                console.error(`Failed to link to ${wid}:`, err);
                                errors.push(wid);
                            }
                        }
                    }

                    // 2. UPDATE: Watchlists that were already there
                    const toUpdate = newWatchlists.filter(w => existingMemberships.has(w));
                    for (const wid of toUpdate) {
                        const docId = existingMemberships.get(wid);
                        if (!docId) {
                            // Linked Share (No dedicated document for this watchlist).
                            // The Master Document (usually in Portfolio) will be updated in its own iteration.
                            continue;
                        }

                        // FIX: Use explicit PORTFOLIO_ID
                        const persistenceId = (wid === PORTFOLIO_ID || wid === 'main') ? PORTFOLIO_ID : wid;
                        const dataToUpdate = { ...formData, watchlistId: persistenceId };
                        delete dataToUpdate.watchlists;

                        try {
                            await appService.updateShareRecord(docId, dataToUpdate);
                            successCount++;
                        } catch (err) {
                            console.error(`Failed to update in ${wid}:`, err);
                            errors.push(wid);
                        }
                    }

                    // 3. REMOVE: Watchlists deselected
                    const toRemove = previousWatchlists.filter(w => !newWatchlists.includes(w));
                    for (const wid of toRemove) {
                        const docId = existingMemberships.get(wid);
                        const code = formData.shareName;

                        if (!docId) {
                            // CASE A: Removing a LINK (Array Entry)
                            // The share is just an item in the 'stocks' array of this watchlist.
                            try {
                                console.log(`[ModalController] Removing Link ${code} from Watchlist ${wid}`);
                                await appService.removeStock(code, wid);
                            } catch (err) {
                                console.error(`Failed to remove link from ${wid}:`, err);
                                errors.push(wid);
                            }
                        } else {
                            // CASE B: Removing the MASTER RECORD (Document)
                            // We must be careful!

                            if (newWatchlists.length > 0) {
                                // MIGRATION: The user kept the share in other watchlists.
                                // We must Transfer Ownership of the Master Document to one of the remaining watchlists
                                // instead of deleting it.
                                const newMasterWl = newWatchlists[0];
                                const newPersistenceId = (newMasterWl === PORTFOLIO_ID || newMasterWl === 'main') ? PORTFOLIO_ID : newMasterWl;

                                try {
                                    console.log(`[ModalController] MIGRATING Share ${docId} from ${wid} to ${newMasterWl}`);
                                    await appService.updateShareRecord(docId, { watchlistId: newPersistenceId });
                                    // Note: We don't need to "add" it to newMasterWl because the 'toAdd' loop 
                                    // might have already tried (and linked it). But updating the Master Doc 
                                    // ensures it now "lives" there.
                                } catch (err) {
                                    console.error(`Failed to migrate share ${docId}:`, err);
                                    errors.push(wid);
                                }
                            } else {
                                // DELETION: The user removed it from ALL watchlists.
                                // Now it is safe to delete the document.
                                try {
                                    console.log(`[ModalController] Deleting Share ${docId} (Removed from all lists)`);
                                    await appService.deleteShareRecord(null, docId);
                                } catch (err) {
                                    console.error(`Failed to delete share ${docId}:`, err);
                                    errors.push(wid);
                                }
                            }
                        }
                    }

                    if (successCount > 0 || (toRemove.length > 0 && errors.length === 0)) {
                        if (this.updateCallback) await this.updateCallback();
                        const code = formData.shareName || 'Share';

                        // Fire Refresh for Details Modal if open
                        document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_REFRESH_DETAILS, { detail: { code: formData.shareName } }));

                        ToastManager.success(`${code} saved.`);
                        document.querySelector(`#${IDS.ADD_SHARE_MODAL} .${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.click();
                    }

                    if (errors.length > 0) {
                        ToastManager.error(`${USER_MESSAGES.ERR_PARTIAL_FAILURE}${errors.join(', ')}`);
                    }

                } catch (error) {
                    console.error("Save Sync Fatal Error:", error);
                    ToastManager.error(USER_MESSAGES.ERROR_SAVE + error.message);
                    throw error;
                }
            }
        });
    }
}
