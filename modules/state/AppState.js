import { STORAGE_KEYS, CASH_WATCHLIST_ID, ALL_SHARES_ID, PORTFOLIO_ID } from '../utils/AppConstants.js';

/**
 * AppState.js
 * Centralized Application State
 * 
 * Holds all dynamic application information to eliminate scattered global variables.
 * Acts as the single source of truth for:
 * - Current User
 * - Watchlist Selection
 * - View Modes
 * - Data Caches (Shares, Cash, Watchlists)
 * - Live Price Data
 */

export const AppState = {
    // Current Authenticated User
    user: null,

    // Portfolio Visibility
    isPortfolioVisible: false,

    // Watchlist Navigation State
    watchlist: {
        type: 'stock', // 'stock' | 'cash'
        id: null       // null (Portfolio) | 'ALL' | <watchlist_id>
    },

    viewMode: 'TABLE', // 'TABLE' | 'COMPACT' | 'SNAPSHOT'

    // Preferences (Persisted)
    preferences: {
        lastWatchlistId: localStorage.getItem(STORAGE_KEYS.WATCHLIST_ID) || null,
        security: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.SECURITY_PREFS);
                return stored ? JSON.parse(stored) : {
                    isPinEnabled: false,
                    isBiometricEnabled: false,
                    hashedPin: null,
                    requireLockOnResume: true
                };
            } catch (e) {
                return { isPinEnabled: false, isBiometricEnabled: false, hashedPin: null, requireLockOnResume: true };
            }
        })(),
        dashboardOrder: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.DASHBOARD_ORDER);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        watchlistOrder: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.WATCHLIST_ORDER);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        sortOptionOrder: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.SORT_OPTION_ORDER);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        globalSort: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.GLOBAL_SORT);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        watchlistMode: localStorage.getItem(STORAGE_KEYS.WATCHLIST_PICKER_MODE) || 'default',
        onboarded: localStorage.getItem('ASX_NEXT_onboarded') === 'true',
        userCategories: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.USER_CATEGORIES);
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                return [];
            }
        })(),
        snapshotSort: localStorage.getItem(STORAGE_KEYS.SNAPSHOT_SORT) || 'desc'
    },

    // Security Runtime State
    isLocked: true,

    // Per-Watchlist Sort Configuration (keyed by watchlistId)
    sortConfigMap: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.SORT);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn('Corrupted sort config, using defaults');
            return {};
        }
    })(),

    // Current active sort (derived from map + current watchlist)
    sortConfig: { field: 'code', direction: 'asc' },

    // Hidden Asset IDs (Set for fast lookup)
    hiddenAssets: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.HIDDEN_ASSETS);
            return stored ? new Set(JSON.parse(stored).map(String)) : new Set();
        } catch (e) {
            console.warn('Corrupted hidden assets, using empty set');
            return new Set();
        }
    })(),

    // Cash Category Filter
    cashCategoryFilter: (() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.CASH_CATEGORY_FILTER) || null;
        } catch (e) {
            return null;
        }
    })(),

    // Carousel Selections (IDs of watchlists to include in cycle)
    carouselSelections: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.CAROUSEL_SELECTIONS);
            if (stored) {
                return new Set(JSON.parse(stored).map(String));
            }
            // Default selections for new or uninitialized users
            return new Set([ALL_SHARES_ID, PORTFOLIO_ID, CASH_WATCHLIST_ID]);
        } catch (e) {
            console.warn('Corrupted carousel selections, using default set');
            return new Set([ALL_SHARES_ID, PORTFOLIO_ID, CASH_WATCHLIST_ID]);
        }
    })(),

    // Hidden Watchlists (IDs that are hidden from the picker)
    hiddenWatchlists: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.HIDDEN_WATCHLISTS);
            return stored ? new Set(JSON.parse(stored).map(String)) : new Set();
        } catch (e) {
            return new Set();
        }
    })(),

    // Hidden Sort Options (Map of type -> Set of fields)
    // Structure: { 'STOCK': Set(['code', 'entryDate']), 'PORTFOLIO': Set([...]) }
    // Stored as object with arrays for JSON
    hiddenSortOptions: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.HIDDEN_SORT_OPTIONS);
            if (!stored) return {};
            const parsed = JSON.parse(stored);
            // Convert arrays back to Sets
            const result = {};
            for (const key in parsed) {
                result[key] = new Set((parsed[key] || []).map(String));
            }
            return result;
        } catch (e) {
            return {};
        }
    })(),

    // Data Cache (Single Source of Truth)
    data: {
        shares: [],
        cash: [],
        watchlists: [],
        dashboard: []
    },

    // Live Data Cache
    lastGlobalFetch: 0, // Timestamp of last full API fetch
    _isFetching: false, // Concurrency lock
    // Map<StockCode, { live: number, pctChange: number }>
    livePrices: new Map(), // Initialized immediately

    // Subscription Cleanups
    unsubscribeStore: null,

    // Persistence Hook (Cloud Sync)
    // Assigned by AppController to avoid circular dependency
    onPersistenceUpdate: null,

    triggerSync() {
        this._triggerSync();
    },

    _triggerSync() {
        if (this.onPersistenceUpdate && typeof this.onPersistenceUpdate === 'function') {
            this.onPersistenceUpdate({
                lastWatchlistId: this.watchlist.id,
                sortConfigMap: this.sortConfigMap,
                hiddenAssets: [...this.hiddenAssets],
                security: this.preferences.security,
                dashboardOrder: this.preferences.dashboardOrder || [],
                watchlistOrder: this.preferences.watchlistOrder || [],
                watchlistOrder: this.preferences.watchlistOrder || [],
                sortOptionOrder: this.preferences.sortOptionOrder || {},
                globalSort: this.preferences.globalSort || null,
                carouselSelections: [...this.carouselSelections],
                watchlistMode: this.preferences.watchlistMode || 'default',
                onboarded: this.preferences.onboarded || false,
                userCategories: this.preferences.userCategories || [],
                hiddenWatchlists: [...this.hiddenWatchlists],
                hiddenSortOptions: (() => {
                    const out = {};
                    for (const key in this.hiddenSortOptions) {
                        out[key] = [...this.hiddenSortOptions[key]];
                    }
                    return out;
                })()
            });
        }
    },

    saveSecurityPreferences(securityPrefs) {
        this.preferences.security = { ...this.preferences.security, ...securityPrefs };
        localStorage.setItem(STORAGE_KEYS.SECURITY_PREFS, JSON.stringify(this.preferences.security));
        this._triggerSync();
    },



    // Per-Watchlist Sort Persistence
    saveSortConfigForWatchlist(watchlistId) {
        const key = watchlistId || 'portfolio';
        this.sortConfigMap[key] = { ...this.sortConfig };
        localStorage.setItem(STORAGE_KEYS.SORT, JSON.stringify(this.sortConfigMap));
        this._triggerSync();
    },

    getSortConfigForWatchlist(watchlistId) {
        const key = watchlistId || 'portfolio';
        const config = this.sortConfigMap[key];

        if (config) return config;

        // Default Defaults
        if (watchlistId === CASH_WATCHLIST_ID) {
            return { field: 'category', direction: 'asc' };
        }
        return { field: 'code', direction: 'asc' };
    },

    // Legacy alias for backward compatibility
    saveSortConfig() {
        this.saveSortConfigForWatchlist(this.watchlist.id);
    },

    // Hidden Assets Persistence
    saveHiddenAssets() {
        // Enforce array of strings for storage
        const currentList = [...this.hiddenAssets].map(String);
        localStorage.setItem(STORAGE_KEYS.HIDDEN_ASSETS, JSON.stringify(currentList));
        console.log('AppState: Persisting hidden assets:', currentList);
        this._triggerSync();
    },

    toggleHiddenAsset(assetId) {
        const id = String(assetId);
        if (this.hiddenAssets.has(id)) {
            console.log(`AppState: Removing from hiddenAssets: ${id}`);
            this.hiddenAssets.delete(id);
        } else {
            console.log(`AppState: Adding to hiddenAssets: ${id}`);
            this.hiddenAssets.add(id);
        }
        this.saveHiddenAssets();
    },

    // Cash Category Filter Persistence
    saveCashCategoryFilter(category) {
        this.cashCategoryFilter = category;
        if (category) {
            localStorage.setItem(STORAGE_KEYS.CASH_CATEGORY_FILTER, category);
        } else {
            localStorage.removeItem(STORAGE_KEYS.CASH_CATEGORY_FILTER);
        }
    },

    saveWatchlistState() {
        // Persist Watchlist Selection
        if (this.watchlist.id) {
            localStorage.setItem(STORAGE_KEYS.WATCHLIST_ID, this.watchlist.id);
        } else {
            localStorage.removeItem(STORAGE_KEYS.WATCHLIST_ID); // Clear if null (Portfolio default)
        }

        // Update local memory sync if needed (refs are shared so usually fine)
        this.preferences.lastWatchlistId = this.watchlist.id;
        this._triggerSync();
    },

    saveCarouselSelections() {
        const currentList = [...this.carouselSelections];
        localStorage.setItem(STORAGE_KEYS.CAROUSEL_SELECTIONS, JSON.stringify(currentList));
        console.log('AppState: Persisting carousel selections:', currentList);
        this._triggerSync();
    },

    saveWatchlistMode(mode) {
        this.preferences.watchlistMode = mode;
        localStorage.setItem(STORAGE_KEYS.WATCHLIST_PICKER_MODE, mode);
        this._triggerSync();
    },

    saveHiddenWatchlists() {
        const currentList = [...this.hiddenWatchlists];
        localStorage.setItem(STORAGE_KEYS.HIDDEN_WATCHLISTS, JSON.stringify(currentList));
        this._triggerSync();
    },

    saveHiddenSortOptions() {
        // Convert Sets to Arrays for storage
        const storageObj = {};
        for (const key in this.hiddenSortOptions) {
            storageObj[key] = [...this.hiddenSortOptions[key]];
        }
        localStorage.setItem(STORAGE_KEYS.HIDDEN_SORT_OPTIONS, JSON.stringify(storageObj));
        this._triggerSync();
    },

    saveGlobalSort(sortConfig, skipSync = false) {
        this.preferences.globalSort = sortConfig;
        if (sortConfig) {
            localStorage.setItem(STORAGE_KEYS.GLOBAL_SORT, JSON.stringify(sortConfig));
        } else {
            localStorage.removeItem(STORAGE_KEYS.GLOBAL_SORT);
        }
        if (!skipSync) {
            this._triggerSync();
        }
    },

    saveUserCategory(categoryObj) {
        if (!categoryObj.id || !categoryObj.label) return;

        // Prevent duplicates
        const exists = this.preferences.userCategories.find(c => c.id === categoryObj.id);
        if (exists) return;

        this.preferences.userCategories.push(categoryObj);
        localStorage.setItem(STORAGE_KEYS.USER_CATEGORIES, JSON.stringify(this.preferences.userCategories));
        this._triggerSync();
    },

    saveSnapshotSort(sortOrder) {
        this.preferences.snapshotSort = sortOrder;
        localStorage.setItem(STORAGE_KEYS.SNAPSHOT_SORT, sortOrder);
        this._triggerSync();
    }
};
