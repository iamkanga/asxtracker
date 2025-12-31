/**
 * CashController.js
 * Controller for the Cash & Assets view.
 * Handles data retrieval, sorting, event listeners, and coordination with the Renderer.
 */
import { CashViewRenderer } from '../ui/CashViewRenderer.js';
import { CASH_WATCHLIST_ID, SORT_OPTIONS, IDS, EVENTS, CASH_CATEGORIES } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from '../ui/ToastManager.js';

export class CashController {
    constructor(modalController) {
        this.renderer = new CashViewRenderer(IDS.CONTENT_CONTAINER); // Re-using main container
        this.modalController = modalController;
        this.config = {
            // Note: Sort config now managed by AppState.sortConfig for persistence
        };

        // STATE FLAG: Tracks if initial data load is complete
        // Prevents showing "No assets" before data arrives
        // TRUST CACHE: If we have data in memory, we are loaded.
        this.isInitialLoadComplete = (AppState.data.cash && AppState.data.cash.length > 0);



        // Bind methods
        this.handleAssetSelection = this.handleAssetSelection.bind(this);
        this.refreshView = this.refreshView.bind(this);
    }



    /**
     * Initializes the Cash Controller.
     * Sets up event listeners.
     */
    init() {
        // Listen for Visibility Toggle (View Specific)
        // Handled via delegation in AppController, but we still export methods for it.
    }

    /**
     * Refreshes the Cash View with current data and sort settings.
     * @param {Array} [assets] - Optional explicit data handoff.
     */
    refreshView(assets = null) {
        // Guard: Only render if we're actually in Cash view
        if (AppState.watchlist.type !== 'cash') {
            return;
        }

        // Use passed assets or fallback to AppState
        const cashAssets = assets || AppState.data.cash || [];



        // Mark initial load as complete BEFORE rendering
        // Once AppState.data.cash is defined (even if empty array), we're "loaded"
        if (!this.isInitialLoadComplete) {
            if (AppState.data.cash !== undefined) {
                this.isInitialLoadComplete = true;
            }
        }

        // Critical: Store state to prevent "null" crash on subsequent sorts
        this.lastAssets = cashAssets;

        // Apply session-persisted hidden state from localStorage
        const processedAssets = cashAssets.map(a => ({
            ...a,
            isHidden: AppState.hiddenAssets.has(String(a.id))
        }));

        // Calculate Total (Exclude Hidden)
        const totalValue = processedAssets
            .filter(asset => !asset.isHidden)
            .reduce((sum, asset) => sum + (parseFloat(asset.balance) || 0), 0);

        // Sort
        const sortedAssets = this.sortCashCategories(processedAssets);

        // Render with load state flag
        this.renderer.renderCashView(sortedAssets, totalValue, this.isInitialLoadComplete);
    }

    /**
     * Sorts cash assets based on current configuration.
     * Hidden assets always go to the bottom.
     * @param {Array} assets 
     * @returns {Array} Sorted assets
     */
    sortCashCategories(assets) {
        // ... sort logic ...
        if (!assets) return [];
        // Use AppState.sortConfig for persistence parity with stock views
        const { field, direction } = AppState.sortConfig;

        // Combine categories for lookup
        const allCategories = [...CASH_CATEGORIES, ...(AppState.preferences.userCategories || [])];

        return [...assets].sort((a, b) => {
            // 1. Primary Sort: Hidden state (Hidden always last)
            if (a.isHidden && !b.isHidden) return 1;
            if (!a.isHidden && b.isHidden) return -1;

            // 2. Secondary Sort: Selected Field
            let valA = a[field] || '';
            let valB = b[field] || '';

            // SPECIAL CASE: Category Sort
            if (field === 'category') {
                const catA = allCategories.find(c => c.id === valA);
                const catB = allCategories.find(c => c.id === valB);
                valA = catA ? catA.label : valA;
                valB = catB ? catB.label : valB;
            }

            // Normalize for case-insensitive string sort
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            // Handle numeric values
            if (field === 'balance') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // ... updateSort remains ...

    /**
     * Updates the sort configuration and refreshes the view.
     * @param {Object} sortOption 
     */
    updateSort(sortOption) {
        this.config.currentSort = sortOption;
        this.refreshView(this.lastAssets);
    }

    /**
     * Toggles the visibility state of an asset.
     * @param {String} assetId 
     */
    handleToggleVisibility(assetId) {
        const id = String(assetId);
        AppState.toggleHiddenAsset(id);
        const isHidden = AppState.hiddenAssets.has(id);

        // Fetch Name
        const asset = (AppState.data.cash || []).find(a => String(a.id) === id);
        const name = asset ? asset.name : 'Asset';

        console.log(`Asset ${id} visibility toggled: ${isHidden ? 'HIDDEN' : 'VISIBLE'} `);
        ToastManager.success(isHidden ? `${name} hidden.` : `${name} visible.`);

        this.refreshView();
    }

    /**
     * Handles the 'cash-asset-selected' event.
     * @deprecated - Now handled by central delegation in AppController.
     */
    handleAssetSelection(event) {
        // This is now handled by central delegation in AppController
    }


}
