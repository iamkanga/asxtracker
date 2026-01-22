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
        badgeScope: localStorage.getItem(STORAGE_KEYS.BADGE_SCOPE) || 'all',
        scanner: {  // NEW: Global Scanner Settings
            activeFilters: null // null means No Filter (Show All). [] means Filter to None.
        },
        dashboardOrder: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.DASHBOARD_ORDER);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        dashboardHidden: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.DASHBOARD_HIDDEN);
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                return [];
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
        customWatchlistNames: (() => {
            try {
                const stored = localStorage.getItem('ASX_NEXT_customWatchlistNames');
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                return {};
            }
        })(),
        userCategories: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.USER_CATEGORIES);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        snapshotSort: localStorage.getItem(STORAGE_KEYS.SNAPSHOT_SORT) || 'desc',
        watchlistSort: localStorage.getItem(STORAGE_KEYS.WATCHLIST_SORT) || 'asc',
        favoriteLinks: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.FAVORITE_LINKS);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),
        colorSeed: (() => {
            const stored = localStorage.getItem('ASX_NEXT_colorSeed');
            return stored ? parseInt(stored) : 0;
        })(),
        dailyEmail: localStorage.getItem(STORAGE_KEYS.DAILY_EMAIL) === 'true',
        alertEmailRecipients: localStorage.getItem(STORAGE_KEYS.EMAIL_RECIPIENTS) || '',
        gradientStrength: (() => {
            const stored = localStorage.getItem(STORAGE_KEYS.GRADIENT_STRENGTH);
            return stored !== null ? parseFloat(stored) : 0.25;
        })(),
        containerBorders: (() => {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.BORDER_PREFS);
                return stored ? JSON.parse(stored) : { sides: [0, 0, 0, 1], thickness: 3 };
            } catch (e) {
                return { sides: [0, 0, 0, 1], thickness: 3 };
            }
        })()
    },

    // Security Runtime State
    isLocked: true,

    // Per-Watchlist Sort Configuration (keyed by watchlistId)
    sortConfigMap: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.SORT);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
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
        dashboard: [],
        optimisticIds: new Map() // Map<Code, RealID> to guard against snapshot overwrites
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
            const payload = {
                lastWatchlistId: this.watchlist.id,
                sortConfigMap: this.sortConfigMap,
                hiddenAssets: [...this.hiddenAssets],
                security: this.preferences.security,
                dashboardOrder: this.preferences.dashboardOrder || [],
                dashboardHidden: this.preferences.dashboardHidden || [],
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
                })(),
                favoriteLinks: this.preferences.favoriteLinks || [],
                colorSeed: this.preferences.colorSeed || 0,
                dailyEmail: this.preferences.dailyEmail || false,
                alertEmailRecipients: this.preferences.alertEmailRecipients || '',
                gradientStrength: this.preferences.gradientStrength ?? 0.25,
                customWatchlistNames: this.preferences.customWatchlistNames || {},
                containerBorders: this.preferences.containerBorders || { sides: [0, 0, 0, 1], thickness: 3 },
                badgeScope: this.preferences.badgeScope || 'all',
                showBadges: this.preferences.showBadges !== false
            };
            this.onPersistenceUpdate(payload);
        } else {
        }
    },

    saveBorderPreferences(newPrefs) {
        this.preferences.containerBorders = { ...this.preferences.containerBorders, ...newPrefs };
        localStorage.setItem(STORAGE_KEYS.BORDER_PREFS, JSON.stringify(this.preferences.containerBorders));
        this._triggerSync();
    },

    // Internal helper to persist all preferences under a single key
    _persistPreferences() {
        localStorage.setItem('asx_preferences', JSON.stringify(this.preferences));
        this._triggerSync();
    },

    saveSecurityPreferences(newPrefs) {
        this.preferences.security = { ...this.preferences.security, ...newPrefs };
        localStorage.setItem(STORAGE_KEYS.SECURITY_PREFS, JSON.stringify(this.preferences.security));
        this._triggerSync();
    },

    /**
     * Updates and persists scanner preferences.
     * @param {Object} newPrefs 
     */
    saveScannerPreferences(newPrefs) {
        this.preferences.scanner = { ...this.preferences.scanner, ...newPrefs };
        this._persistPreferences();
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
        this._triggerSync();
    },

    toggleHiddenAsset(assetId) {
        const id = String(assetId);
        if (this.hiddenAssets.has(id)) {
            this.hiddenAssets.delete(id);
        } else {
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

        // IMMUTABLE UPDATE (Ensures JSON comparison in UserStore detects change)
        const cats = [...(this.preferences.userCategories || [])];
        const index = cats.findIndex(c => c.id === categoryObj.id);

        if (index !== -1) {
            cats[index] = { ...categoryObj };
        } else {
            cats.push(categoryObj);
        }

        this.preferences.userCategories = cats;
        localStorage.setItem(STORAGE_KEYS.USER_CATEGORIES, JSON.stringify(cats));
        this._triggerSync();
    },

    deleteUserCategory(categoryId) {
        const index = this.preferences.userCategories.findIndex(c => c.id === categoryId);
        if (index === -1) return;

        this.preferences.userCategories.splice(index, 1);
        localStorage.setItem(STORAGE_KEYS.USER_CATEGORIES, JSON.stringify(this.preferences.userCategories));
        this._triggerSync();
    },

    clearAllUserCategories() {
        this.preferences.userCategories = [];
        localStorage.setItem(STORAGE_KEYS.USER_CATEGORIES, JSON.stringify([]));
        this._triggerSync();
    },

    shuffleAssetColors() {
        this.preferences.colorSeed = (this.preferences.colorSeed || 0) + 1;
        localStorage.setItem('ASX_NEXT_colorSeed', this.preferences.colorSeed);
        this._triggerSync();
    },

    saveSnapshotSort(sortOrder) {
        this.preferences.snapshotSort = sortOrder;
        localStorage.setItem(STORAGE_KEYS.SNAPSHOT_SORT, sortOrder);
        this._triggerSync();
    },

    saveWatchlistSort(sortOrder) {
        this.preferences.watchlistSort = sortOrder;
        localStorage.setItem(STORAGE_KEYS.WATCHLIST_SORT, sortOrder);
        this._triggerSync();
    },

    saveCustomWatchlistName(id, name) {
        if (!this.preferences.customWatchlistNames) this.preferences.customWatchlistNames = {};
        this.preferences.customWatchlistNames[id] = name;
        localStorage.setItem('ASX_NEXT_customWatchlistNames', JSON.stringify(this.preferences.customWatchlistNames));
        this._triggerSync();
    },

    saveFavoriteLinks(links) {
        this.preferences.favoriteLinks = links;
        localStorage.setItem(STORAGE_KEYS.FAVORITE_LINKS, JSON.stringify(links));
        this._triggerSync();
    },

    /**
     * Wipes all user-related data from memory.
     * Used during sign-out to prevent data leaks.
     */
    resetAll() {
        this.user = null;
        this.data = {
            shares: [],
            cash: [],
            watchlists: [],
            dashboard: []
        };
        this.livePrices.clear();
        this.lastGlobalFetch = 0;
        this._isFetching = false;

        // Unsubscribe from everything
        if (this.unsubscribeStore) {
            this.unsubscribeStore();
            this.unsubscribeStore = null;
        }
        if (this.unsubscribePrefs) {
            this.unsubscribePrefs();
            this.unsubscribePrefs = null;
        }

        // Reset runtime flags
        this.isLocked = true;
        this.isPortfolioVisible = false;
    }
};

// Removed: window.AppState = AppState; (Constitutional Compliance - No Global Pollution)
