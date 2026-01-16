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

        // Determine Mode based on Input Type
        // String or Number (ID) -> Edit Mode
        // Object -> Pre-Fill Mode
        if (input && (typeof input === 'string' || typeof input === 'number')) {
            // EDIT MODE (shareId)
            const inputId = String(input);
            console.log('[ModalController] Opening in Edit Mode. ID:', inputId);

            // Loose lookup to handle String/Number mismatch in data
            const targetShare = AppState.data.shares.find(s => String(s.id) === inputId);

            if (!targetShare) {
                console.error('[ModalController] Share NOT found for ID:', inputId);
                console.log('[ModalController] Available IDs:', AppState.data.shares.slice(0, 5).map(s => s.id));
                ToastManager.error(USER_MESSAGES.SHARE_NOT_FOUND);
                return;
            }
            console.log('[ModalController] Found Share Data:', targetShare);
            stockCode = targetShare.shareName;
            initialData = {
                ...targetShare,
                title: targetShare.name || targetShare.title || '',
                comments: normalizeComments(targetShare.comments) // Fix: Normalize legacy comments
            };

            // 1. Find explicit share documents (Legacy & Mixed Schema)
            AppState.data.shares.filter(s => (s.shareName || '').toUpperCase() === (stockCode || '').toUpperCase()).forEach(s => {
                const wId = s.watchlistId || 'portfolio';
                existingMemberships.set(String(wId), s.id);

                // FIX: Check Array memberships too
                if (Array.isArray(s.watchlistIds)) {
                    s.watchlistIds.forEach(id => existingMemberships.set(String(id), s.id));
                }
            });

            // 2. Find implicit memberships in Watchlist 'stocks' arrays (New Schema)
            (AppState.data.watchlists || []).forEach(wl => {
                if (wl.stocks && Array.isArray(wl.stocks)) {
                    if (wl.stocks.some(code => code.toUpperCase() === stockCode.toUpperCase())) {
                        if (!existingMemberships.has(String(wl.id))) {
                            // Mark as present (id null means no specific share doc found for this watchlist yet)
                            existingMemberships.set(String(wl.id), null);
                        }
                    }
                }
            });
        } else if (typeof input === 'object' && input !== null) {
            // PRE-FILL MODE (New Share or Recovery)
            initialData = input;
            stockCode = input.shareName || input.code; // Robustness

            // FIX: Scan for existing memberships (Ghost Shares) even in Pre-fill Mode
            // This ensures that if we are recovering a share that lost its ID (Ghost),
            // or adding a share that is already in a watchlist array, the boxes are checked.
            if (stockCode) {
                // console.log('[ModalController] Pre-fill Scan for Ghost Memberships:', stockCode);

                // 1. Find explicit share documents (Legacy & Mixed Schema)
                const matchingShares = AppState.data.shares.filter(s => (s.shareName || '').toUpperCase() === stockCode.toUpperCase());
                console.log('[ModalController] Scan: Matching Shares Found:', matchingShares.length);

                matchingShares.forEach(s => {
                    const wId = s.watchlistId || 'portfolio';
                    existingMemberships.set(String(wId), s.id);
                    if (Array.isArray(s.watchlistIds)) {
                        s.watchlistIds.forEach(id => existingMemberships.set(String(id), s.id));
                    }
                });

                // 2. Find implicit memberships in Watchlist 'stocks' arrays (New Schema)
                (AppState.data.watchlists || []).forEach(wl => {
                    if (wl.stocks && Array.isArray(wl.stocks)) {
                        if (wl.stocks.some(code => code.toUpperCase() === stockCode.toUpperCase())) {
                            // console.log('[ModalController] Scan: Found in Watchlist (Array):', wl.name, wl.id);
                            if (!existingMemberships.has(String(wl.id))) {
                                existingMemberships.set(String(wl.id), null);
                            }
                        }
                    }
                });
                console.log('[ModalController] Scan Complete. Active Watchlists:', Array.from(existingMemberships.keys()));
            } else {
                console.warn('[ModalController] Pre-fill Scan Skipped: No Stock Code');
            }
        }

        const activeWatchlistIds = Array.from(existingMemberships.keys());
        if (activeWatchlistIds.length === 0 && AppState.watchlist.id !== SEARCH_WATCHLIST_ID) {
            activeWatchlistIds.push(AppState.watchlist.id || 'portfolio');
        }

        // 2. Open Modal via View Layer
        ShareFormUI.showShareModal({
            watchlists: watchlistsForUI,
            activeWatchlistIds: activeWatchlistIds,
            shareData: initialData,
            initialSection: initialSection,

            // Callback: Live Price Lookup
            onLookupPrice: async (code) => {
                const result = await dataService.fetchLivePrices([code]);
                const prices = result?.prices;
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
                    // FIX: Trust the ID if present (Edit Mode / Search Redirect), otherwise fallback to name check
                    let shareExists = !!formData.id || AppState.data.shares.some(s => (s.shareName || '').toUpperCase() === lookupKey);

                    for (const wid of toAdd) {
                        // FIX: Use explicit PORTFOLIO_ID instead of null for visibility
                        const persistenceId = (wid === PORTFOLIO_ID || wid === 'main') ? PORTFOLIO_ID : wid;

                        // FLAT LOGIC: Resolve Target ID, then Link. If no ID, Create.
                        const lookupKey = String(formData.shareName).trim().toUpperCase();

                        // 1. Resolve Target Document ID
                        // Check inputs + Global State
                        let targetDocId = formData.id;

                        if (!targetDocId) {
                            const found = AppState.data.shares.find(s => (s.shareName || '').toUpperCase() === lookupKey);
                            if (found && found.id) targetDocId = found.id;
                        }

                        if (targetDocId && targetDocId !== 'OPTIMISTIC_LOCK' && !targetDocId.startsWith('temp_')) {
                            // PATH A: LINK EXISTING
                            try {
                                console.log(`[ModalController] Linking Existing Share ${targetDocId} to ${wid}`);
                                const resultId = await appService.addStock(lookupKey, persistenceId, null, null, targetDocId);

                                // Ghost Recovery check (if UserStore created a new ID)
                                if (resultId && resultId !== targetDocId) {
                                    console.warn(`[ModalController] Ghost ID ${targetDocId} replaced by ${resultId}`);
                                    targetDocId = resultId; // Update local var for next iteration

                                    // Update AppState
                                    const inState = AppState.data.shares.find(s => s.id === targetDocId); // old ID might be gone
                                    if (inState) inState.id = resultId;
                                }
                                successCount++;
                            } catch (err) {
                                console.error(`Failed to link ${wid}:`, err);
                                errors.push(wid);
                            }
                        } else {
                            // PATH B: CREATE NEW (Master Record)
                            try {
                                console.log(`[ModalController] Creating New Share ${lookupKey} for ${wid}`);
                                const priceData = AppState.livePrices?.get(lookupKey);
                                const entryPrice = priceData ? (parseFloat(priceData.live) || 0) : 0;
                                const purchaseDate = new Date().toISOString();

                                const dataToAdd = {
                                    ...formData,
                                    code: lookupKey,
                                    shareName: lookupKey,
                                    watchlistId: persistenceId,
                                    enteredPrice: entryPrice,
                                    purchaseDate: purchaseDate,
                                    entryDate: purchaseDate,
                                    watchlistIds: newWatchlists
                                };
                                delete dataToAdd.watchlists;

                                // STRICT OPTIMISM: Inject into State with temp ID IMMEDIATELY
                                const tempId = `temp_${Date.now()}`;
                                console.log(`[ModalController] Optimistic Injection: ${lookupKey} with ${tempId}`);
                                AppState.data.shares.push({
                                    ...dataToAdd,
                                    id: tempId
                                });
                                if (this.updateCallback) await this.updateCallback(); // Force immediate render

                                const newId = await appService.addBaseShareRecord(dataToAdd);
                                console.log(`[ModalController] Success! New ID from DB: ${newId} for ${lookupKey}`);

                                if (!newId) {
                                    throw new Error(`Failed to create share record for ${wid} (ID was null)`);
                                }
                                targetDocId = newId;
                                successCount++;

                                // Update TEMP ID with REAL ID
                                // Fallback: If snapshot replaced the array, find by name
                                let tempShare = AppState.data.shares.find(s => s.id === tempId);
                                if (!tempShare) {
                                    tempShare = AppState.data.shares.find(s => (s.shareName || '').toUpperCase() === lookupKey && !s.id);
                                }

                                if (tempShare) {
                                    tempShare.id = newId;
                                    // POPULATE GUARD: Protect this ID from snapshot overwrites for a few minutes
                                    if (AppState.data.optimisticIds) {
                                        AppState.data.optimisticIds.set(lookupKey, newId);
                                    }
                                    console.log(`[ModalController] Swapped Temp/Ghost for Real ID ${newId}`);
                                    if (this.updateCallback) await this.updateCallback(); // RE-RENDER: Important to update DOM with real ID
                                }
                            } catch (err) {
                                console.error(`Failed to create for ${wid}:`, err);
                                // Rollback temp share
                                AppState.data.shares = AppState.data.shares.filter(s => !String(s.id).startsWith('temp_'));
                                if (this.updateCallback) await this.updateCallback();
                                errors.push(wid);
                            }
                        }
                    }

                    // 2. UPDATE: Watchlists that were already there
                    const toUpdate = newWatchlists.filter(w => existingMemberships.has(w));
                    for (const wid of toUpdate) {
                        const docId = existingMemberships.get(wid);
                        if (!docId) {
                            // GHOST RECOVERY IN UPDATE LOOP
                            // The user "kept" this share in the watchlist, but it has no ID (Ghost).
                            // We must Resurrect it (Create/Link).
                            // console.log(`[ModalController] Resurrecting Ghost Share ${formData.shareName} in ${wid}`);
                            try {
                                const lookupKey = String(formData.shareName).trim().toUpperCase();
                                // Reuse the "Link/Create" logic from addStock
                                const persistenceId = (wid === PORTFOLIO_ID || wid === 'main') ? PORTFOLIO_ID : wid;

                                // We use price from formData if available
                                const entryPrice = formData.enteredPrice || 0;
                                const purchaseDate = formData.purchaseDate || new Date().toISOString();

                                const dataToAdd = {
                                    ...formData,
                                    code: lookupKey,
                                    shareName: lookupKey,
                                    watchlistId: persistenceId,
                                    enteredPrice: entryPrice,
                                    purchaseDate: purchaseDate,
                                    entryDate: purchaseDate,
                                    watchlistIds: newWatchlists
                                };
                                delete dataToAdd.watchlists;

                                const newId = await appService.addBaseShareRecord(dataToAdd);
                                if (!newId) throw new Error(`Ghost Resurrection failed: ID returned null for ${formData.shareName}`);
                                successCount++;

                                // Update Injection
                                // RE-CHECK: Snapshot might have arrived during await
                                const shareNowInState = AppState.data.shares.find(s => s.id === newId || (s.shareName || '').toUpperCase() === lookupKey);

                                if (shareNowInState) {
                                    // Snapshot beat us to it, or we found the ghost.
                                    // Just ensure ID is correct if it was a ghost.
                                    if (!shareNowInState.id) shareNowInState.id = newId;
                                    shareExists = true;
                                } else {
                                    console.log(`[ModalController] Injecting Resurrected Share: ID=${newId}`);
                                    // Truly missing, safe to inject
                                    AppState.data.shares.push({
                                        shareName: lookupKey,
                                        id: newId,
                                        watchlistId: persistenceId,
                                        watchlistIds: [persistenceId]
                                    });
                                    shareExists = true;
                                }
                            } catch (err) {
                                console.error(`Failed to resurrect ghost in ${wid}:`, err);
                                errors.push(wid);
                            }
                            continue;
                        }

                        // FIX: Use explicit PORTFOLIO_ID
                        const persistenceId = (wid === PORTFOLIO_ID || wid === 'main') ? PORTFOLIO_ID : wid;
                        // FIX: Persist the full array of memberships (Sync UI -> DB)
                        const dataToUpdate = { ...formData, watchlistId: persistenceId, watchlistIds: newWatchlists };
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
                        // FIX: Use Original Name for removal if renamed
                        const code = formData.originalShareName || formData.shareName;

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
                                    // FIX: Update watchlistIds array during migration too
                                    await appService.updateShareRecord(docId, { watchlistId: newPersistenceId, watchlistIds: newWatchlists });
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

                        // Fire Refresh for Details Modal if open (or just Close it to force reload)
                        // Simple "Fix Stale UI" strategy: Close the view modal.
                        const detailsModal = document.getElementById(IDS.STOCK_DETAILS_MODAL);
                        if (detailsModal) detailsModal.remove();

                        ToastManager.success(`${code} saved.`);
                        document.querySelector(`#${IDS.ADD_SHARE_MODAL} .${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.click();
                    }

                    if (errors.length > 0) {
                        ToastManager.error(`${USER_MESSAGES.ERR_PARTIAL_FAILURE}${errors.join(', ')}`);
                    }

                } catch (error) {
                    const msg = error.message || error.toString() || 'Unknown Error';
                    console.error("Save Sync Fatal Error:", msg, error);
                    ToastManager.error(USER_MESSAGES.ERROR_SAVE + msg);
                    throw error;
                }
            }
        });
    }
}
