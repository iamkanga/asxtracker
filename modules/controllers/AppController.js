/**
 * AppController.js
 * Main Application Orchestrator.
 * Coordinates Services, State, and UI.
 */

import { AuthService } from '../auth/AuthService.js';
import { DataService } from '../data/DataService.js';
import { AppService } from '../data/AppService.js';
import { ViewRenderer } from '../ui/ViewRenderer.js?v=5';
import { AppState } from '../state/AppState.js';
import { HeaderLayout } from '../ui/HeaderLayout.js';
import { processShares, getSingleShareData, getASXCodesStatus } from '../data/DataProcessor.js';
import { WatchlistUI } from '../ui/WatchlistUI.js';
import { ShareFormUI } from '../ui/ShareFormUI.js';
import { SearchDiscoveryUI } from '../ui/SearchDiscoveryUI.js?v=5'; // Added
import { NotificationUI } from '../ui/NotificationUI.js';
import { BriefingUI } from '../ui/BriefingUI.js';
import { SnapshotUI } from '../ui/SnapshotUI.js'; // Added
import { SettingsUI } from '../ui/SettingsUI.js';
import { notificationStore } from '../state/NotificationStore.js';
import { DashboardViewRenderer } from '../ui/DashboardViewRenderer.js?v=5';
import { ModalController } from './ModalController.js';
import { CashController } from './CashController.js';
import { SecurityController } from './SecurityController.js';
import { SecurityUI } from '../ui/SecurityUI.js';
import { GeneralSettingsUI } from '../ui/GeneralSettingsUI.js';
import CalculatorUI from '../ui/CalculatorUI.js';
import {
    ALL_SHARES_ID,
    CASH_WATCHLIST_ID,
    DASHBOARD_WATCHLIST_ID,
    DASHBOARD_SYMBOLS,
    PORTFOLIO_ID,
    USER_MESSAGES,
    STORAGE_KEYS,
    CSS_CLASSES,
    IDS,
    EVENTS,
    SUMMARY_TYPES,
    SORT_OPTIONS
} from '../utils/AppConstants.js?v=10';
import { ToastManager } from '../ui/ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
// renderSortSelect removed

export class AppController {

    constructor() {
        // Services
        this.dataService = new DataService();
        this.appService = new AppService();
        this.viewRenderer = new ViewRenderer();
        this.dashboardRenderer = new DashboardViewRenderer();

        // Controllers
        this.modalController = new ModalController(this.updateDataAndRender.bind(this));
        this.cashController = new CashController(this.modalController);
        this.securityController = new SecurityController();

        // Register controller for UI access
        AppState.securityController = this.securityController;

        // Debug Access
        this.notificationStore = notificationStore;

        // UI Managers
        this.headerLayout = null;
        this.watchlistUI = null;

        // Carousel Stability
        this._carouselGuard = false;
        this._bootSeedTimer = null; // Throttling logic for startup sequence

        // State Tracking
        this._isUnlockedThisSession = false;
        this._lockModalActive = false;

        // Binds
        this.init = this.init.bind(this);
    }

    /**
     * Initialization Entry Point
     */
    async init() {
        // Initialize Navigation Manager (Back Button Support)
        navManager.init();

        // 1. Event Bindings (Global)
        this._bindGlobalEvents();
        this._setupDelegatedEvents(); // Binds Delete, Watchlist Actions, etc.

        // Notification System Bindings (Unified)
        NotificationUI.init(); // Initialize Floating Bell



        // Update Badge Listener (Single)
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, (e) => {
            const { totalCount, customCount } = e.detail;

            // 1. Update Header (Sidebar Badge)
            if (this.headerLayout) {
                this.headerLayout.updateNotificationBadge(totalCount, customCount);
            }
            // Note: NotificationUI handles its own (Floating Bell) badge update via internal listener.
        });

        document.addEventListener(EVENTS.OPEN_SETTINGS, () => SettingsUI.showModal(AppState.user?.uid));
        document.addEventListener(EVENTS.SHOW_DAILY_BRIEFING, () => BriefingUI.show());

        // 2. Initialize Watchlist UI
        this.watchlistUI = new WatchlistUI({
            onWatchlistChange: (watchlistId) => this.handleSwitchWatchlist(watchlistId),
            onRenameWatchlist: async (id, name) => await this.appService.renameWatchlist(id, name)
        });
        this.watchlistUI.init();

        // 2a. Initialize Cash Controller
        this.cashController.init();

        // Listen for Open Notifications Request
        // (Handled above in consolidated block)

        // 3. Initialize Header Layout
        this.headerLayout = new HeaderLayout({
            onViewChange: (mode) => this.changeViewMode(mode),
            onViewToggle: () => this._handleViewToggle(),
            onSort: () => this._handleSortClick(),
            onCarouselPrev: () => this._handleCarousel(-1),
            onCarouselNext: () => this._handleCarousel(1)
        });
        this.headerLayout.init();

        // 3b. Initialize Calculator UI
        this.calculatorUI = new CalculatorUI();

        // Make headerLayout available to other parts if needed via singleton pattern or internal referencing
        // Logic in main.js used 'headerLayout.closeSidebar' in callbacks. 
        // We can expose a method on AppController for this.

        // 4. Auth Observation
        AuthService.observeState((user) => this.handleAuthStateChange(user));

        // 5. Default Dark Theme Enforced
        document.body.classList.add(CSS_CLASSES.DARK_THEME);

        // 6. Setup Cloud Sync Hook (Outbound)
        // BOOT LOCK: Prevent outbound sync until cloud prefs have been received once.
        // This prevents empty localStorage from overwriting valid cloud data.
        this._cloudPrefsLoaded = false;

        AppState.onPersistenceUpdate = (prefs) => {
            this._syncPreferencesWithDebounce(prefs);
        };

        // 7. Watchlist Restoration is handled in handleAuthStateChange
        //    (after data is loaded from Firebase)
        //    We only set defaults here for immediate UI state
        AppState.watchlist.id = 'portfolio';
        AppState.isPortfolioVisible = true;

        // 8. Setup Delegated Events (Legacy DOM logic)
        this._setupDelegatedEvents();

        // 9. Visibility/Lifecycle Handlers (Security)
        this._setupLifecycleHandlers();

        // 8. Expose Globals - REMOVED (Sanitized)
        // Global pollution has been replaced with Event Delegation in _setupDelegatedEvents()
    }

    /**
     * Debounced wrapper for outbound preference synchronization.
     * Prevents rapid UI changes (like toggling multiple checkboxes) from 
     * causing "local echo" race conditions in Firestore.
     * @param {Object} prefs Simple object containing preference keys to sync
     */
    _syncPreferencesWithDebounce(prefs) {
        if (!this._cloudPrefsLoaded) {
            // Still check security if enabled on another device
            if (prefs.security && (prefs.security.isPinEnabled || prefs.security.isBiometricEnabled)) {
                this.handleSecurityLock();
            }
            return;
        }

        if (!AppState.user) {
            console.warn('AppController: Blocked sync - User not logged in.');
            return;
        }

        // Clear existing timer
        if (this._syncTimeout) {
            clearTimeout(this._syncTimeout);
        }

        // Schedule sync
        this._syncTimeout = setTimeout(async () => {
            try {
                // REFRESH DATA (Directive 025):
                // To prevent "Stale Snapshot Race Conditions", we explicitly read fresh state 
                // for critical fields that might have been hydrated during the debounce window.
                const freshPrefs = {
                    ...prefs,
                    hiddenAssets: [...AppState.hiddenAssets], // Fresh Read
                    sortConfigMap: AppState.sortConfigMap,     // Fresh Read
                    carouselSelections: [...AppState.carouselSelections],
                    hiddenWatchlists: [...AppState.hiddenWatchlists],
                    watchlistOrder: AppState.preferences.watchlistOrder,
                    userCategories: AppState.preferences.userCategories || []
                };

                if (freshPrefs.userCategories) {
                    // console.log('[AppController] Syncing Preferences (incl. Categories):', freshPrefs.userCategories.map(c => c.label));
                }
                // if (freshPrefs.hiddenAssets) {
                //     console.log('[AppController] 🐛 OUTBOUND SYNC: Saving hiddenAssets:', freshPrefs.hiddenAssets);
                // }
                await this.appService.saveUserPreferences(freshPrefs);
            } catch (err) {
                console.warn('Sync failed:', err);
            } finally {
                // Important: Clear the timer reference so the Guard allows cloud updates again
                this._syncTimeout = null;
            }
        }, 250); // 250ms debounce
    }

    /* ==========================================================================
       HELPER METHODS
       ========================================================================== */

    /**
     * Seeds the Live Price cache with ALL user shares.
     * Ensures Search and other views have data even if not visiting a specific watchlist.
     */
    async _refreshAllPrices(shares) {
        let codesToFetch = [...new Set((shares || []).map(s => s.shareName))].filter(Boolean);

        // 1. FRESHNESS GUARD: If a full fetch happened in the last 5 minutes, skip.
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (AppState.lastGlobalFetch && (now - AppState.lastGlobalFetch < FIVE_MINUTES)) {
            console.log('Global Price Seed: Cache is fresh (within 5 mins). Skipping fetch.');
            return;
        }

        // 2. CONCURRENCY LOCK: Prevent overlapping fetches
        if (AppState._isFetching) {
            console.log('Global Price Seed: Fetch already in progress. Skipping.');
            return;
        }

        // Include Dashboard Symbols ALWAYS
        DASHBOARD_SYMBOLS.forEach(code => {
            const upCode = code.toUpperCase();
            if (!codesToFetch.includes(upCode)) codesToFetch.push(upCode);
        });

        if (codesToFetch.length === 0) return;

        console.log(`Global Price Seed: STARTING fetch for ${codesToFetch.length} codes...`);
        AppState._isFetching = true;

        try {
            const freshPrices = await this.dataService.fetchLivePrices(codesToFetch);
            if (freshPrices && freshPrices.size > 0) {
                const prevSize = AppState.livePrices.size;
                AppState.livePrices = new Map([...AppState.livePrices, ...freshPrices]);
                AppState.lastGlobalFetch = Date.now();
                console.log(`Global Price Seed: COMPLETE. Merged ${freshPrices.size} prices. Cache size: ${prevSize} -> ${AppState.livePrices.size}`);

                if (this.watchlistUI && AppState.watchlist.id) {
                    this.updateDataAndRender(false);
                }

                // FIX: Notify store that prices have updated so Client-Side Alerts can regenerate
                if (notificationStore) {
                    notificationStore._notifyCountChange();
                }
            }
        } catch (err) {
            console.warn('Global Price Seed failed:', err);
        } finally {
            AppState._isFetching = false;
        }
    }

    /* ================= Logic Handlers ================= */

    async handleAuthStateChange(user) {
        // ARCHITECTURAL FIX: Check if user identity has actually changed.
        // Redundant auth events (e.g. token refresh) should NOT trigger a data wipe (unsubscribe).
        const isSameUser = (user && AppState.user && user.uid === AppState.user.uid);

        AppState.user = user;
        const splashScreen = document.getElementById(IDS.SPLASH_SCREEN);
        // Splash Screen management is now Event-Driven (See SplashScreen.js)

        // Fix ID mismatch (HTML uses 'logout-btn' and 'auth-btn')
        const logoutBtn = document.getElementById(IDS.LOGOUT_BTN);
        const loginBtn = document.getElementById(IDS.AUTH_BTN);

        if (user) {

            // Provision user document (Ensures it exists for backend LIST API)
            this.appService.provisionUser(user.uid);

            // BOOT LOCK: Reset flags for new session
            this._cloudPrefsLoaded = false;
            AppState.isLocked = true;

            // Sanitize only if new session or necessary (idempotent usually, but cheap to skip if same)
            if (!isSameUser) {
                await this.appService.sanitizeCorruptedShares(user.uid);
            }

            // INIT GATE: Keep splash screen VISIBLE until prefs are loaded
            // Splash hide is now handled by prefs callback or timeout fallback
            if (logoutBtn) logoutBtn.classList.remove(CSS_CLASSES.HIDDEN);
            if (loginBtn) loginBtn.classList.add(CSS_CLASSES.HIDDEN);
            document.body.classList.add(CSS_CLASSES.LOGGED_IN);

            // ⚠️ SECURITY GATE ⚠️
            // Intercept normal flow to show Privacy Lock
            this.handleSecurityLock();

            // CRITICAL: Only Unsub/Resub if user CHANGED.
            // Blindly unsubscribing wipes AppState.data.cash (UserStore cleanup), causing the "Flash".
            if (!isSameUser || !AppState.unsubscribeStore) {
                if (AppState.unsubscribeStore) AppState.unsubscribeStore();
                if (AppState.unsubscribePrefs) AppState.unsubscribePrefs();

                // Initialize Notification Store
                notificationStore.init(user.uid);

                // === DATA SUBSCRIPTION ===
                AppState.unsubscribeStore = this.appService.subscribeToUserData(user.uid, async (userData) => {
                    const codes = (userData.shares || []).map(s => (s.code || s.shareName || s.symbol || '???').toUpperCase());
                    AppState.data = userData;

                    // ONBOARDING GATE: If new user (no shares, no watchlists), seed defaults.
                    if (!userData.shares?.length && !userData.watchlists?.length) {
                        // CRITICAL: Wait for Cloud Prefs to be loaded before deciding to onboard.
                        // This prevents a race condition after a "Wipe Data" reload.
                        if (this._cloudPrefsLoaded) {
                            // Only trigger if we are authenticated, haven't tried seeding yet this session,
                            // AND the user hasn't already been onboarded (verified via cloud prefs)
                            if (AppState.user && !this._onboardingTriggered && !AppState.preferences.onboarded) {
                                this._onboardingTriggered = true;
                                this.appService.createDefaultOnboardingData(AppState.user.uid);
                                return; // Wait for the next sync refire
                            }
                        } else {
                            console.log('[AppController] Onboarding Gate triggered, but waiting for cloud preferences sync...');
                        }
                    }

                    if (this.watchlistUI) this.watchlistUI.renderWatchlistDropdown();


                    // === GLOBAL PRICE SEEDING (DEBOUNCED) ===
                    if (this._bootSeedTimer) clearTimeout(this._bootSeedTimer);
                    this._bootSeedTimer = setTimeout(() => {
                        console.log('Global Price Seed: Firestore settled. Triggering fetch.');
                        this._refreshAllPrices(AppState.data.shares || []);
                    }, 800);

                    // === WATCHLIST RESTORATION ===
                    const savedWatchlistId = AppState.preferences.lastWatchlistId;
                    const currentWatchlistId = AppState.watchlist.id;

                    if (savedWatchlistId && currentWatchlistId === 'portfolio') {
                        const isSystemId = savedWatchlistId === 'ALL' ||
                            savedWatchlistId === 'CASH' ||
                            savedWatchlistId === 'DASHBOARD' ||
                            savedWatchlistId === 'portfolio';

                        if (!isSystemId && (!userData.watchlists || userData.watchlists.length === 0)) {
                            console.log('Watchlists loading... skipping restoration validation for now.');
                            return;
                        }

                        const isValidId = isSystemId ||
                            (userData.watchlists && userData.watchlists.find(w => w.id === savedWatchlistId));

                        if (isValidId) {
                            console.log('Restoring saved watchlist:', savedWatchlistId);
                            this.handleSwitchWatchlist(savedWatchlistId, true); // Pass true for isBoot
                            return;
                        } else if (userData.watchlists && userData.watchlists.length > 0) {
                            console.log('Saved watchlist no longer exists, clearing:', savedWatchlistId);
                            localStorage.removeItem(STORAGE_KEYS.WATCHLIST_ID);
                        }
                    }

                    // Handle stale/deleted watchlist
                    if (AppState.watchlist.id &&
                        !['ALL', 'CASH', 'DASHBOARD', 'portfolio'].includes(AppState.watchlist.id) &&
                        userData.watchlists &&
                        !userData.watchlists.find(w => w.id === AppState.watchlist.id)) {
                        console.log('Current watchlist deleted, falling back to portfolio');
                        this.handleSwitchWatchlist('portfolio', true); // Pass true for isBoot
                        return;
                    }


                    this.watchlistUI.updateHeaderTitle();

                    // BOOT STABILITY
                    if (!this._initialRenderComplete) {
                        const PREFS_TIMEOUT = 2500;
                        this._prefsTimeoutId = setTimeout(() => {
                            if (!this._initialRenderComplete) {
                                console.warn('Prefs timeout - rendering with defaults but BLOCKING outbound sync to prevent overwrite.');
                                // this._cloudPrefsLoaded = true; // DISABLED: Do not unblock sync if we haven't confirmed cloud state
                                this._initialRenderComplete = true; // Allow UI to show
                                this.handleSecurityLock();
                                this.updateDataAndRender();
                            }
                        }, PREFS_TIMEOUT);
                    } else {
                        this.updateDataAndRender();
                    }
                });

                // === CLOUD PREFERENCES SYNC (INBOUND) ===
                this.appService.subscribeToUserPreferences(user.uid, (prefs, metadata) => {
                    // Clear pending timeout since prefs arrived
                    if (this._prefsTimeoutId) {
                        clearTimeout(this._prefsTimeoutId);
                        this._prefsTimeoutId = null;
                    }

                    if (!prefs) {
                        // No prefs in cloud - complete initial render with defaults
                        this._cloudPrefsLoaded = true; // Mark as loaded even if empty
                        if (!this._initialRenderComplete) {
                            this._initialRenderComplete = true;
                            // Check lock based on local/default state before hiding splash
                            this.handleSecurityLock();
                        }
                        return;
                    }

                    // SYNC GUARD (Directive 024): 
                    // 1. If we have a local sync timer active, ignore the cloud (our write is pending).
                    // 2. If the snapshot has pending writes (local echo), or if it's from cache while online.
                    if (this._syncTimeout) {
                        console.log('[AppController] Sync Guard: Local sync timer active. Ignoring cloud update.');
                        return;
                    }

                    if (metadata && (metadata.hasPendingWrites || metadata.fromCache)) {
                        console.log(`[AppController [V3]]: Sync Guard: Skipping update (Pending: ${metadata.hasPendingWrites}, Cache: ${metadata.fromCache})`);
                        return;
                    }

                    // Mark as loaded before processing specific updates so handleSecurityLock works
                    this._cloudPrefsLoaded = true;

                    let needsRender = false;

                    // 0. Sync Security Prefs (CRITICAL: Prioritize this)
                    if (prefs.security) {
                        AppState.preferences.security = { ...AppState.preferences.security, ...prefs.security };
                        this.handleSecurityLock();
                    }

                    // 0b. Sync Notification Prefs
                    if (prefs.showBadges !== undefined) {
                        AppState.preferences.showBadges = prefs.showBadges !== false;
                        needsRender = true;
                    }
                    if (prefs.alertEmailRecipients !== undefined) {
                        AppState.preferences.alertEmailRecipients = prefs.alertEmailRecipients || '';
                    }

                    // 1. Sync Watchlist ID (if different and valid)
                    if (prefs.lastWatchlistId && prefs.lastWatchlistId !== AppState.watchlist.id) {
                        if (AppState.watchlist.id === 'portfolio' && prefs.lastWatchlistId !== 'portfolio') {
                            this._initialRenderComplete = true;
                            this.handleSwitchWatchlist(prefs.lastWatchlistId);
                            needsRender = false;
                        }
                    }

                    // 2. Sync Sort Config & Global Sort
                    if (prefs.globalSort) {
                        AppState.saveGlobalSort(prefs.globalSort, true);
                        AppState.sortConfig = { ...prefs.globalSort };
                        needsRender = true;
                    } else if (prefs.sortConfigMap) {
                        AppState.sortConfigMap = { ...AppState.sortConfigMap, ...prefs.sortConfigMap };

                        if (prefs.globalSort === null) {
                            if (AppState.preferences.globalSort) {
                                AppState.saveGlobalSort(null, true);
                                needsRender = true;
                            }
                        }

                        if (!AppState.preferences.globalSort) {
                            const currentKey = AppState.watchlist.id || 'portfolio';
                            if (prefs.sortConfigMap[currentKey]) {
                                AppState.sortConfig = { ...prefs.sortConfigMap[currentKey] };
                                needsRender = true;
                            }
                        }
                    }

                    // 3. Sync Hidden Assets
                    if (prefs.hiddenAssets && Array.isArray(prefs.hiddenAssets)) {
                        AppState.hiddenAssets = new Set(prefs.hiddenAssets.map(String));
                        localStorage.setItem(STORAGE_KEYS.HIDDEN_ASSETS, JSON.stringify(prefs.hiddenAssets)); // Persist immediately
                        needsRender = true;
                    }

                    // 4. Sync Carousel Selections
                    if (prefs.carouselSelections && Array.isArray(prefs.carouselSelections)) {
                        AppState.carouselSelections = new Set(prefs.carouselSelections.map(String));
                        localStorage.setItem(STORAGE_KEYS.CAROUSEL_SELECTIONS, JSON.stringify(prefs.carouselSelections));
                        needsRender = true;
                    }

                    // 5. Sync Watchlist Order
                    if (prefs.watchlistOrder) {
                        AppState.preferences.watchlistOrder = prefs.watchlistOrder;
                        localStorage.setItem(STORAGE_KEYS.WATCHLIST_ORDER, JSON.stringify(prefs.watchlistOrder));
                        needsRender = true;
                    }

                    // 6. Sync Watchlist Mode
                    if (prefs.watchlistMode) {
                        AppState.preferences.watchlistMode = prefs.watchlistMode;
                        localStorage.setItem(STORAGE_KEYS.WATCHLIST_PICKER_MODE, prefs.watchlistMode);
                        needsRender = true;
                    }

                    // 7. Sync Hidden Watchlists
                    if (prefs.hiddenWatchlists && Array.isArray(prefs.hiddenWatchlists)) {
                        AppState.hiddenWatchlists = new Set(prefs.hiddenWatchlists.map(String));
                        localStorage.setItem(STORAGE_KEYS.HIDDEN_WATCHLISTS, JSON.stringify(prefs.hiddenWatchlists));
                        needsRender = true;
                    }

                    // 7.1 Sync Sort Config Map (CRITICAL FOR PERSISTENCE)
                    if (prefs.sortConfigMap) {
                        AppState.sortConfigMap = prefs.sortConfigMap;
                        localStorage.setItem(STORAGE_KEYS.SORT, JSON.stringify(prefs.sortConfigMap));
                        // No render needed, but essential for next watchlist switch
                    }

                    // 7b. Sync Onboarded Flag
                    if (prefs.onboarded !== undefined) {
                        AppState.preferences.onboarded = !!prefs.onboarded;
                    }

                    // 7b. SANITIZE
                    this._sanitizeActiveWatchlist();

                    // 8. Sync Hidden Sort Options
                    if (prefs.hiddenSortOptions) {
                        const restored = {};
                        for (const key in prefs.hiddenSortOptions) {
                            restored[key] = new Set((prefs.hiddenSortOptions[key] || []).map(String));
                        }
                        AppState.hiddenSortOptions = restored;
                        localStorage.setItem(STORAGE_KEYS.HIDDEN_SORT_OPTIONS, JSON.stringify(prefs.hiddenSortOptions));
                        needsRender = true;
                    }

                    // 9. Sync User Categories (Merge Strategy)
                    if (prefs.userCategories && Array.isArray(prefs.userCategories)) {
                        const localCats = AppState.preferences.userCategories || [];
                        const remoteCats = prefs.userCategories;

                        // Union of Local and Remote (Remote wins conflicts, but Local new items are kept)
                        const mergedMap = new Map();
                        localCats.forEach(c => mergedMap.set(c.id, c));
                        remoteCats.forEach(c => mergedMap.set(c.id, c));

                        const mergedList = Array.from(mergedMap.values());

                        // Only update if different
                        if (JSON.stringify(mergedList) !== JSON.stringify(AppState.preferences.userCategories)) {
                            console.log('[AppController] User Category Merge: Updating Local State with merged list.');
                            AppState.preferences.userCategories = mergedList;
                            localStorage.setItem(STORAGE_KEYS.USER_CATEGORIES, JSON.stringify(mergedList));
                            needsRender = true;
                        }

                        // WRITE-BACK: If merged list differs from what Cloud sent, push back to Cloud immediately.
                        // This fixes the case where Local had new items that Cloud didn't know about yet.
                        if (JSON.stringify(mergedList) !== JSON.stringify(remoteCats)) {
                            console.log('[AppController] User Category Write-Back: Merged list differs from Cloud. Triggering strict save.');
                            this._syncPreferencesWithDebounce({
                                ...prefs,
                                userCategories: mergedList
                            });
                        }
                    }

                    if (needsRender) {
                        console.log('[AppController] Applying External Cloud Preferences...');
                        this.updateDataAndRender(false);
                    }

                    // SAFETY: If we didn't switch watchlists (which hides splash), but we are done loading
                    if (!this._initialRenderComplete) {
                        this._initialRenderComplete = true;
                        this.handleSecurityLock(); // Final check
                    }

                    // UNLOCK OUTBOUND SYNC: Cloud prefs have been applied, allow future syncs.
                    if (!this._cloudPrefsLoaded) {
                        console.log('AppController: Cloud prefs loaded. Outbound sync now enabled.');
                        this._cloudPrefsLoaded = true;
                    }
                });
            }
        } else {
            document.body.classList.remove(CSS_CLASSES.LOGGED_IN);

            // Reset security state for next user
            this._isUnlockedThisSession = false;
            this._lockModalActive = false;

            if (AppState.unsubscribeStore) {
                AppState.unsubscribeStore();
                AppState.unsubscribeStore = null;
            }

            if (splashScreen) {
                splashScreen.classList.remove(CSS_CLASSES.HIDDEN);
                splashScreen.classList.remove('is-exiting'); // Reset animation state
                splashScreen.classList.add('is-active');
            }
            // Fix ID mismatch and toggle both buttons
            const logoutBtn = document.getElementById(IDS.LOGOUT_BTN);
            const loginBtn = document.getElementById(IDS.AUTH_BTN);

            if (logoutBtn) logoutBtn.classList.add(CSS_CLASSES.HIDDEN);
            if (loginBtn) loginBtn.classList.remove(CSS_CLASSES.HIDDEN);

            this.viewRenderer.render([]);
        }
    }

    /**
     * Handles the security lock/unlock flow.
     */
    async handleSecurityLock() {
        // 1. SESSION GUARD: If already unlocked this session, don't re-lock.
        if (this._isUnlockedThisSession) {
            AppState.isLocked = false;
            document.dispatchEvent(new CustomEvent(EVENTS.FIREBASE_DATA_LOADED));
            return;
        }

        // 2. CONCURRENCY GUARD: If modal is already showing, don't trigger again.
        if (this._lockModalActive) {
            console.log('AppController: Security modal already active, ignoring request.');
            return;
        }

        // SECURITY GATE: Do NOT unlock until we have cloud prefs OR a timeout occurred.
        if (!this.securityController.shouldLock()) {
            // ONLY unlock if cloud prefs have definitely arrived or we are at least logged in / initialized
            if (this._cloudPrefsLoaded || !AppState.user) {
                AppState.isLocked = false;
                this._isUnlockedThisSession = true; // Mark as passed
                this._lockModalActive = false;
                document.dispatchEvent(new CustomEvent(EVENTS.FIREBASE_DATA_LOADED));
                return;
            }
            // If cloud prefs not loaded, keep isLocked=true and wait.
            return;
        }

        AppState.isLocked = true;
        this._lockModalActive = true;

        await SecurityUI.renderUnlockModal({
            onUnlock: (pin) => {
                const isValid = this.securityController.verifyPin(pin);
                if (isValid) {
                    AppState.isLocked = false;
                    this._isUnlockedThisSession = true;
                    this._lockModalActive = false; // Resolved
                    document.dispatchEvent(new CustomEvent(EVENTS.FIREBASE_DATA_LOADED));
                    this.updateDataAndRender(false);
                }
                return isValid;
            },
            onBiometric: async () => {
                const isAuthed = await this.securityController.authenticateBiometric();
                if (isAuthed) {
                    AppState.isLocked = false;
                    this._isUnlockedThisSession = true;
                    this._lockModalActive = false; // Resolved
                    document.dispatchEvent(new CustomEvent(EVENTS.FIREBASE_DATA_LOADED));
                    // Force remove modal if biometric succeeds
                    document.getElementById(IDS.SECURITY_UNLOCK_MODAL)?.remove();
                    this.updateDataAndRender();
                }
            }
        });
    }

    _setupLifecycleHandlers() {
        // App Visibility Change (Lock on Resume)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (AppState.user && AppState.preferences.security.requireLockOnResume) {
                    this.handleSecurityLock();
                }
            }
        });
    }


    async updateDataAndRender(fetchFresh = false) {
        if (AppState.isLocked) {
            console.log('AppController: Render blocked - App is locked.');
            return;
        }

        if (AppState.watchlist.id === DASHBOARD_WATCHLIST_ID) {
            const dashboardData = AppState.data.dashboard || [];
            this.dashboardRenderer.render(dashboardData);

            // ARCHITECTURAL REFINEMENT:
            // Since we no longer use a real-time Firestore listener for dashboard data,
            // we must manually trigger a price refresh if fetchFresh is requested.
            if (fetchFresh) {
                this._refreshAllPrices([]); // Empty array = just fetch dashboard symbols
            }
            return;
        }

        if (AppState.watchlist.type === 'cash') {
            const cashData = AppState.data.cash || [];

            // CRITICAL FIX: Always render Cash view immediately.
            // CACHE-FIRST NAVIGATION: Trust valid data immediately.
            // CashController.refreshView handles empty arrays and shows empty state.
            // We explicitly clear the container first to ensure no ghost views remain.
            this.viewRenderer.container.innerHTML = '';
            this.cashController.refreshView(cashData);
            return;
        }

        const allShares = AppState.data.shares || [];
        const filteredShares = this.appService.getWatchlistData(allShares, AppState.watchlist.id);

        if (filteredShares.length === 0) {
            this.viewRenderer.render([]);
            this.viewRenderer.renderASXCodeDropdownV2([]); // FIX: Clear container for empty watchlists
            return;
        }

        // === STEP 0: UPDATE SORT UI (Sync visuals with data) ===
        this.viewRenderer.updateSortButtonUI(AppState.watchlist.id, AppState.sortConfig);

        // === RENDER-FIRST ARCHITECTURE ===
        // Step 1: SYNCHRONOUS RENDER with cached data (Zero Latency)
        const { mergedData, summaryMetrics } = processShares(
            allShares,
            AppState.watchlist.id,
            AppState.livePrices, // Use whatever is cached
            AppState.sortConfig,
            AppState.hiddenAssets
        );

        this.viewRenderer.render(mergedData, summaryMetrics);
        this._updateLiveRefreshTime();

        // Render ASX Code Dropdown immediately
        if (AppState.watchlist.type !== 'cash') {
            const activeCodes = mergedData
                .filter(s => !s.isHidden)
                .map(s => s.code)
                .sort((a, b) => a.localeCompare(b));

            if (AppState.livePrices instanceof Map && AppState.livePrices.size > 0) {
                const statuses = getASXCodesStatus(activeCodes, AppState.livePrices);
                this.viewRenderer.renderASXCodeDropdownV2(statuses);
            } else {
                this.viewRenderer.renderASXCodeDropdownV2(activeCodes.map(c => ({ code: c, status: 'neutral' })));
            }
        }

        // Step 2: DEFERRED FETCH (After Paint) - Background refresh
        if (fetchFresh) {
            const originalWatchlistId = AppState.watchlist.id;
            const codes = [...new Set(filteredShares.map(s => s.shareName))].filter(Boolean);

            if (codes.length === 0) return;

            // DATA OPTIMIZATION: 
            // If we are fetching multiple codes, the API forces a "Fetch All" (2249 items).
            // We should ONLY do this if the Cache is stale (> 5 mins).
            if (codes.length > 1) {
                const now = Date.now();
                const FIVE_MINUTES = 5 * 60 * 1000;
                if (AppState.lastGlobalFetch && (now - AppState.lastGlobalFetch < FIVE_MINUTES)) {
                    console.log('Background Refresh Optimized: Cache is fresh. Skipping full fetch for batch.');
                    return;
                }
            }

            // CONCURRENCY LOCK: Set immediately before scheduling to prevent burst overlaps
            if (AppState._isFetching) return;
            AppState._isFetching = true;

            // Schedule after browser paint to ensure Zero-Latency UI
            requestAnimationFrame(() => {
                setTimeout(async () => {
                    try {
                        const freshPrices = await this.dataService.fetchLivePrices(codes);
                        if (freshPrices && freshPrices.size > 0) {
                            // CACHE STABILITY FIX: Merge instead of Replace
                            AppState.livePrices = new Map([...AppState.livePrices, ...freshPrices]);

                            // Update global timestamp if we fetched a significant amount (e.g. > 50 codes)
                            if (codes.length > 50) {
                                AppState.lastGlobalFetch = Date.now();
                            }

                            // CRITICAL RENDERING GUARD
                            if (AppState.watchlist.id !== originalWatchlistId) {
                                console.log(`Background Update Blocked: View changed from ${originalWatchlistId} to ${AppState.watchlist.id}`);
                                return;
                            }

                            // Re-render with fresh data (silent update)
                            const { mergedData: freshMerged, summaryMetrics: freshMetrics } = processShares(
                                AppState.data.shares || [],
                                AppState.watchlist.id,
                                AppState.livePrices,
                                AppState.sortConfig,
                                AppState.hiddenAssets
                            );
                            this.viewRenderer.render(freshMerged, freshMetrics);

                            // Update ASX dropdown with fresh statuses
                            const freshCodes = freshMerged
                                .filter(s => !s.isHidden)
                                .map(s => s.code)
                                .sort((a, b) => a.localeCompare(b));
                            const statuses = getASXCodesStatus(freshCodes, AppState.livePrices);
                            this.viewRenderer.renderASXCodeDropdownV2(statuses);

                            // Update Live Refresh Time
                            this._updateLiveRefreshTime();

                            // Update Notification Badge (Trigger Store logic, which fires event)
                            if (notificationStore) {
                                notificationStore._notifyCountChange();
                            }
                        }
                    } catch (e) {
                        console.warn('Background price refresh failed:', e);
                    } finally {
                        AppState._isFetching = false;
                    }
                }, 0);
            });
        }
    }

    changeViewMode(mode) {
        AppState.viewMode = mode;
        this.updateDataAndRender(false);
    }

    async handleSwitchWatchlist(watchlistId, isBoot = false) {
        // === CONCURRENCY RESET ===
        // Break any existing locks from previous cancelled/stale fetches.
        // This ensures the new view has authority to request data.
        if (AppState._isFetching) {
            console.log('AppController: Resetting concurrency lock for watchlist switch.');
            AppState._isFetching = false;
        }

        // === STEP 1: Update Watchlist Identity ===
        if (watchlistId === CASH_WATCHLIST_ID) {
            AppState.watchlist.type = 'cash';
            AppState.watchlist.id = CASH_WATCHLIST_ID;
            AppState.watchlist.name = 'Cash';
            AppState.isPortfolioVisible = false;
        } else {
            AppState.watchlist.type = 'stock';
            AppState.watchlist.id = (watchlistId === ALL_SHARES_ID) ? ALL_SHARES_ID : watchlistId;

            if (watchlistId === 'portfolio' || watchlistId === null) {
                AppState.watchlist.id = 'portfolio';
                AppState.watchlist.name = 'Portfolio';
                AppState.isPortfolioVisible = false;
            } else if (watchlistId === DASHBOARD_WATCHLIST_ID) {
                AppState.watchlist.type = 'stock'; // Or 'dashboard' if we want a separate type
                AppState.watchlist.id = DASHBOARD_WATCHLIST_ID;
                AppState.watchlist.name = 'Dashboard';
                AppState.isPortfolioVisible = false;
            } else {
                const w = (AppState.data.watchlists || []).find(w => w.id === watchlistId);
                AppState.watchlist.name = w ? w.name : 'Watchlist';
                AppState.isPortfolioVisible = false;
            }
        }

        // === STEP 2: RESTORE SORT CONFIG (BEFORE RENDER) ===
        if (AppState.preferences.globalSort) {
            // GLOBAL OVERRIDE with FALLBACK LOGIC
            const currentGlobal = AppState.preferences.globalSort;

            // Determine current view type for validation
            let viewType = 'STOCK';
            if (AppState.watchlist.type === 'cash') viewType = 'CASH';
            else if (AppState.watchlist.id === 'portfolio') viewType = 'PORTFOLIO';

            // Check if current global sort is valid for this view
            const validOptions = SORT_OPTIONS[viewType] || SORT_OPTIONS.STOCK;
            const isValid = validOptions.some(opt => opt.field === currentGlobal.field);

            if (isValid) {
                AppState.sortConfig = { ...currentGlobal };
            } else {
                console.log(`[AppController] Global Sort '${currentGlobal.field}' incompatible with ${viewType}. Apply Fallback.`);

                // Fallback Logic
                if (viewType === 'CASH') {
                    // Cash/Assets: Asset Name (A to Z) using the "Green Chevron" (High to Low / Ascending for text)
                    AppState.sortConfig = { field: 'name', direction: 'asc' };
                } else {
                    // Standard: ASX Code (A to Z) using "Green Chevron" (High to Low / Ascending for text)
                    AppState.sortConfig = { field: 'code', direction: 'asc' };
                }
            }
        } else {
            // Critical: Read stored config FIRST, then validate
            const storedSort = AppState.getSortConfigForWatchlist(watchlistId);

            // DYNAMIC VALIDATION: Derive valid fields from AppConstants.SORT_OPTIONS
            // This ensures we never miss a field (like targetPrice, comments, etc.)
            const allOptions = [
                ...(SORT_OPTIONS.STOCK || []),
                ...(SORT_OPTIONS.PORTFOLIO || []),
                ...(SORT_OPTIONS.CASH || [])
            ];
            // Create Set for O(1) lookup
            const validFields = new Set(allOptions.map(opt => opt.field));

            if (storedSort && validFields.has(storedSort.field)) {
                // Use stored sort for this watchlist
                AppState.sortConfig = { ...storedSort };
            } else {
                // Fallback to safe defaults
                if (AppState.watchlist.type === 'cash') {
                    AppState.sortConfig = { field: 'category', direction: 'asc' };
                } else {
                    AppState.sortConfig = { field: 'code', direction: 'asc' };
                }
                AppState.saveSortConfigForWatchlist(watchlistId);
            }
        }

        // === STEP 2.5: SANITIZE HIDDEN SORT ===
        this._sanitizeActiveSort();

        // === STEP 3: Update UI Elements ===
        const sidebarAddBtn = document.getElementById('add-share-sidebar-btn');
        if (sidebarAddBtn) {
            if (AppState.watchlist.type === 'cash') {
                sidebarAddBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Cash & Asset';
            } else {
                sidebarAddBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Share';
            }
        }

        // === STEP 3.1: HANDLE EDIT WATCHLIST GHOSTING ===
        const editWatchlistBtn = document.getElementById('btn-edit-watchlist');
        if (editWatchlistBtn) {
            const systemIds = [DASHBOARD_WATCHLIST_ID, ALL_SHARES_ID, PORTFOLIO_ID, CASH_WATCHLIST_ID, 'portfolio'];
            if (systemIds.includes(AppState.watchlist.id)) {
                editWatchlistBtn.classList.add(CSS_CLASSES.GHOSTED);
            } else {
                editWatchlistBtn.classList.remove(CSS_CLASSES.GHOSTED);
            }
        }

        this.watchlistUI.updateHeaderTitle();
        this.watchlistUI.renderWatchlistDropdown();

        // === STEP 4: UPDATE SORT UI SYNCHRONOUSLY (and safely) ===
        // Critical: Sort indicator must match content.
        // We call it immediately for responsiveness, but ALSO schedule a safety update
        // to handle any HeaderLayout initialization race conditions on boot.
        this.viewRenderer.updateSortButtonUI(AppState.watchlist.id, AppState.sortConfig);

        requestAnimationFrame(() => {
            setTimeout(() => {
                this.viewRenderer.updateSortButtonUI(AppState.watchlist.id, AppState.sortConfig);
            }, 50);
        });

        // === STEP 5: RENDER (Fire-and-Forget, Non-Blocking) ===
        // We set fetchFresh to true to ensure we attempt to get recent prices for the new view.
        // The global fetch lock and 5-minute throttle will still protect against data waste.
        this.updateDataAndRender(true).catch(e => console.warn('Render error:', e));

        // === STEP 6: Cleanup & Persist (Background Operations) ===
        if (!isBoot && this.headerLayout) this.headerLayout.closeSidebar();


        // VIEW HYGIENE: Toggle ASX Button Visibility
        const asxToggleBtn = document.getElementById(IDS.ASX_TOGGLE);
        const dashboardTimeBtn = document.getElementById(IDS.DASHBOARD_REORDER_TOGGLE);
        const asxDropdown = document.getElementById(IDS.ASX_CONTAINER);

        if (asxToggleBtn && dashboardTimeBtn) {
            if (watchlistId === DASHBOARD_WATCHLIST_ID || watchlistId === CASH_WATCHLIST_ID) {
                asxToggleBtn.classList.add(CSS_CLASSES.HIDDEN);

                if (watchlistId === DASHBOARD_WATCHLIST_ID) {
                    dashboardTimeBtn.classList.remove(CSS_CLASSES.HIDDEN);
                } else {
                    dashboardTimeBtn.classList.add(CSS_CLASSES.HIDDEN);
                }
            } else {
                asxToggleBtn.classList.remove(CSS_CLASSES.HIDDEN);
                dashboardTimeBtn.classList.add(CSS_CLASSES.HIDDEN);
            }

            // Force close dropdown
            if (asxDropdown) asxDropdown.classList.remove(CSS_CLASSES.EXPANDED);
            asxToggleBtn.setAttribute('aria-pressed', 'false');
        }

        // VIEW HYGIENE: Toggle Header Sort Button Visibility
        const headerSortBtn = document.getElementById(IDS.SORT_PICKER_BTN);
        if (headerSortBtn) {
            if (watchlistId === DASHBOARD_WATCHLIST_ID) {
                headerSortBtn.classList.add(CSS_CLASSES.HIDDEN);
            } else {
                headerSortBtn.classList.remove(CSS_CLASSES.HIDDEN);
            }
        }

        // Persist watchlist state (Fire-and-Forget)
        AppState.saveWatchlistState();
    }

    /**
     * Cycles through available watchlists in a sequence.
     * @param {number} direction - 1 for forward, -1 for backward
     */
    _handleCarousel(direction) {
        console.log('[AppController] _handleCarousel direction:', direction);
        // 1. Build the full sequence of watchlists
        const systemWatchlists = [
            { id: ALL_SHARES_ID, name: 'All Shares' },
            { id: 'portfolio', name: 'Portfolio' },
            { id: DASHBOARD_WATCHLIST_ID, name: 'Dashboard' },
            { id: CASH_WATCHLIST_ID, name: 'Cash & Assets' }
        ];

        const userWatchlists = AppState.data.watchlists || [];
        let fullList = [...systemWatchlists, ...userWatchlists];

        // 2. Respect saved order if available
        const savedOrder = AppState.preferences.watchlistOrder;
        if (savedOrder && Array.isArray(savedOrder)) {
            fullList.sort((a, b) => {
                const idxA = savedOrder.indexOf(a.id);
                const idxB = savedOrder.indexOf(b.id);
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        // 3. Filter by Carousel Selections (New)
        const selections = AppState.carouselSelections;

        // Apply Carousel Selections Filter
        if (selections && selections.size > 0) {
            fullList = fullList.filter(item => selections.has(item.id));
        }

        // Apply Hidden Watchlists Filter (Strict)
        if (AppState.hiddenWatchlists && AppState.hiddenWatchlists.size > 0) {
            fullList = fullList.filter(item => !AppState.hiddenWatchlists.has(item.id));
        }

        if (fullList.length === 0) return;

        // 4. Find current index
        const currentId = AppState.watchlist.id || PORTFOLIO_ID;
        let currentIndex = fullList.findIndex(item => item.id === currentId);

        // If current watchlist is not in the filtered cycle, reset to start of cycle
        if (currentIndex === -1) currentIndex = 0;

        // 5. Calculate next index
        let nextIndex = (currentIndex + direction + fullList.length) % fullList.length;
        const nextWatchlist = fullList[nextIndex];

        // 6. Rapid Navigation Guard
        if (this._carouselGuard) return;
        this._carouselGuard = true;

        console.log(`Carousel Navigation: ${currentId} -> ${nextWatchlist.id} (direction: ${direction})`);

        // 7. Trigger switch
        this.handleSwitchWatchlist(nextWatchlist.id);

        // Reset guard after 300ms to allow next navigation
        setTimeout(() => {
            this._carouselGuard = false;
        }, 300);
    }

    /* ================= Internal Helpers ================= */

    _handleViewToggle() {
        const modes = ['table', 'compact', 'snapshot'];
        const currentMode = AppState.viewMode || 'table';
        let currentIdx = modes.indexOf(currentMode);
        if (currentIdx === -1) currentIdx = 0;

        const nextIdx = (currentIdx + 1) % modes.length;
        const nextMode = modes[nextIdx];

        this.changeViewMode(nextMode);
        this.headerLayout.updateViewToggleIcon(nextMode);
    }

    _handleSortClick() {
        const wId = AppState.watchlist.id;
        const wType = AppState.watchlist.type;
        let contextId = wId;
        if (wType === 'cash') contextId = 'CASH';

        // 1. Define Callbacks first to capture references
        /**
         * @param {Object} newSort - { field, direction }
         * @param {string} source - 'LIST' (user tapped row) | 'TOGGLE' (user tapped directional toggle)
         */
        const onSelect = (newSort, source = 'LIST') => {
            // === GLOBAL SORT HANDLING ===
            const isGlobalActive = !!AppState.preferences.globalSort;

            if (isGlobalActive) {
                if (source === 'LIST') {
                    // TERMINATION RULE: Tapping any list item (even current one) Disable Global Sort
                    console.log(`[AppController] Sort Source '${source}' -> Disabling Global Sort.`);
                    AppState.saveGlobalSort(null);
                    if (this.watchlistUI) this.watchlistUI.updateHeaderTitle();
                } else if (source === 'TOGGLE') {
                    // PERSISTENCE RULE: Tapping Toggle preserves Global Sort (Just updates direction)
                    // Validation: Ensure we are toggling the ACTIVE global sort field
                    const currentGlobal = AppState.preferences.globalSort;
                    if (currentGlobal.field === newSort.field) {
                        console.log(`[AppController] Sort Source '${source}' -> Updating Active Global Sort Direction:`, newSort.direction);
                        AppState.saveGlobalSort(newSort, true); // persist
                        // Ensure Header Title Updates (Global: Label)
                        if (this.watchlistUI) this.watchlistUI.updateHeaderTitle();
                    } else {
                        // Edge case: Toggle on a field that isn't global? (Shouldn't happen in UI)
                        console.warn('[AppController] Toggle on non-global field? Disabling Global.');
                        AppState.saveGlobalSort(null);
                        if (this.watchlistUI) this.watchlistUI.updateHeaderTitle();
                    }
                }
            }

            // Update AppState.sortConfig (unified for both stock and cash)
            AppState.sortConfig = newSort;

            // Persist sort config for this watchlist (Last Used Local)
            AppState.saveSortConfigForWatchlist(AppState.watchlist.id);

            if (wType === 'cash') {
                // Cash specific: refresh using CashController
                this.cashController.refreshView();
            } else {
                // Stock: standard update
                this.updateDataAndRender(false);
            }

            // Update UI to reflect new sort
            this.viewRenderer.updateSortButtonUI(contextId, newSort);
        };

        const onHide = () => {
            this._sanitizeActiveSort();
            this.updateDataAndRender(false);
        };

        const onGlobalCancel = () => {
            if (AppState.preferences.globalSort) {
                console.log('[AppController] Global Cancel Triggered -> Disabling Global Sort');
                AppState.saveGlobalSort(null);
                if (this.watchlistUI) this.watchlistUI.updateHeaderTitle();
                // We don't need to re-render data immediately, just the title bar.
            }
        };

        const onGlobalToggle = (toggleSort) => {
            const currentGlobal = AppState.preferences.globalSort;
            const isSame = currentGlobal && currentGlobal.field === toggleSort.field && currentGlobal.direction === toggleSort.direction;

            if (isSame) {
                // Toggle OFF
                AppState.saveGlobalSort(null);
            } else {
                // Toggle ON
                AppState.saveGlobalSort(toggleSort);
                AppState.sortConfig = { ...toggleSort };
            }

            // Refresh Data & UI
            if (AppState.watchlist.type === 'cash') {
                this.cashController.refreshView();
            } else {
                this.updateDataAndRender(false);
            }

            // Refresh Title Bar (Apply/Remove Coffee + Globe)
            if (this.watchlistUI) this.watchlistUI.updateHeaderTitle();

            // IMMEDIATE HEADER BUTTON UPDATE (Fix Latency)
            this.viewRenderer.updateSortButtonUI(contextId, AppState.sortConfig);

            // Re-render Modal IMMEDIATE (using captured callbacks)
            this.viewRenderer.renderSortPickerModal(
                contextId,
                AppState.sortConfig,
                onSelect,
                onHide,
                onGlobalToggle,
                onGlobalCancel
            );
        };

        // 2. Initial Render
        this.viewRenderer.renderSortPickerModal(
            contextId,
            AppState.sortConfig,
            onSelect,
            onHide,
            onGlobalToggle,
            onGlobalCancel
        );
    }



    _bindGlobalEvents() {
        if (this._globalEventsBound) return;
        this._globalEventsBound = true;

        const signInBtn = document.getElementById(IDS.SPLASH_SIGN_IN_BTN);
        if (signInBtn) {
            signInBtn.addEventListener('click', async () => {
                try {
                    // Phase 1: Immediate Click Feedback
                    signInBtn.disabled = true;
                    signInBtn.style.pointerEvents = 'none';
                    signInBtn.classList.add(CSS_CLASSES.DISABLED);

                    const shimmerSpan = signInBtn.querySelector(`.${CSS_CLASSES.TEXT_SHIMMER}`);
                    if (shimmerSpan) {
                        shimmerSpan.innerHTML = `<i class="fab fa-google"></i> Opening...`;
                    }

                    await AuthService.signIn();

                    // Phase 2: Post-Selection (Selected account)
                    if (shimmerSpan) {
                        shimmerSpan.innerHTML = `<i class="fab fa-google"></i> ${USER_MESSAGES.SIGNING_IN}`;
                    }
                } catch (error) {
                    console.error('Sign in failed:', error);
                    ToastManager.error(`${USER_MESSAGES.SIGN_IN_FAILED} ${error.message}`);

                    // Reset on error
                    signInBtn.disabled = false;
                    signInBtn.style.pointerEvents = 'auto';
                    signInBtn.classList.remove(CSS_CLASSES.DISABLED);
                    const shimmerSpan = signInBtn.querySelector(`.${CSS_CLASSES.TEXT_SHIMMER}`);
                    if (shimmerSpan) {
                        shimmerSpan.innerHTML = `<i class="fab fa-google"></i> Sign in with Google`;
                    }
                }
            });
        }

        const logoutBtn = document.getElementById(IDS.LOGOUT_BTN);

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await AuthService.signOut();
                } catch (error) {
                    console.error('Sign out failed:', error);
                }
            });
        }


    }

    /**
     * SANITIZATION PROTOCOL
     * Ensures the app never displays a hidden watchlist.
     * Called after cloud prefs load or whenever hiddenWatchlists changes.
     */
    _sanitizeActiveWatchlist() {
        const currentId = AppState.watchlist.id || 'portfolio';
        const isHidden = AppState.hiddenWatchlists.has(currentId);

        if (isHidden) {
            console.log(`Sanitization: Current watchlist '${currentId}' is HIDDEN. Finding replacement...`);

            // Priority Order: Dashboard -> All Shares -> Portfolio (if visible) -> First Custom
            let targetId = DASHBOARD_WATCHLIST_ID;

            // If Dashboard is also hidden (rare/impossible usually), try others
            if (AppState.hiddenWatchlists.has(targetId)) {
                if (!AppState.hiddenWatchlists.has(ALL_SHARES_ID)) targetId = ALL_SHARES_ID;
                else if (!AppState.hiddenWatchlists.has(PORTFOLIO_ID)) targetId = PORTFOLIO_ID;
                else {
                    // Find first visible custom list
                    const customLists = AppState.data.watchlists || [];
                    const firstVisible = customLists.find(w => !AppState.hiddenWatchlists.has(w.id));
                    if (firstVisible) targetId = firstVisible.id;
                    else targetId = ALL_SHARES_ID; // Fallback to All Shares even if "hidden" in UI preference, to avoid blank screen.
                }
            }

            console.log(`Sanitization: Switching to '${targetId}'`);
            this.handleSwitchWatchlist(targetId, true); // Pass true for isBoot
            this._initialRenderComplete = true; // Ensure splash hides
        }

    }

    /**
     * SORT SANITIZATION PROTOCOL
     * Ensures that if the current sort is hidden, we fall back to a visible default.
     */
    _sanitizeActiveSort() {
        const currentSort = AppState.sortConfig;
        const type = this._getSortType(AppState.watchlist.id);
        const hiddenSet = AppState.hiddenSortOptions[type];

        if (!hiddenSet || hiddenSet.size === 0) return;

        const sortKey = `${currentSort.field}-${currentSort.direction}`;
        if (hiddenSet.has(sortKey)) {
            console.log(`[AppController] Sanitizing Sort: ${sortKey} is hidden for ${type}.`);

            // Fallback Defaults
            let fallback = { field: 'code', direction: 'asc' };
            if (type === 'CASH') fallback = { field: 'category', direction: 'asc' };

            // Validate Fallback isn't also hidden (extreme edge case)
            if (hiddenSet.has(`${fallback.field}-${fallback.direction}`)) {
                // Find first non-hidden option from registry
                const options = SORT_OPTIONS[type] || SORT_OPTIONS.STOCK;
                const firstVisible = options.find(opt => !hiddenSet.has(`${opt.field}-${opt.direction}`));
                if (firstVisible) {
                    fallback = { field: firstVisible.field, direction: firstVisible.direction };
                }
            }

            AppState.sortConfig = fallback;
            // Persist the correction for this specific watchlist
            AppState.saveSortConfigForWatchlist(AppState.watchlist.id);
        }
    }

    /**
     * Map watchlist ID to sort type (STOCK, PORTFOLIO, CASH)
     * @param {string} watchlistId 
     * @returns {string}
     */
    _getSortType(watchlistId) {
        if (watchlistId === 'CASH') return 'CASH';
        if (watchlistId === 'portfolio') return 'PORTFOLIO';
        return 'STOCK';
    }

    _setupDelegatedEvents() {
        if (this._eventsDelegated) return;
        this._eventsDelegated = true;

        // Global Add Item Delegation (Sidebar & Header)
        document.body.addEventListener('click', (e) => {
            const addBtn = e.target.closest(`#${IDS.SIDEBAR_ADD_BTN}`) || e.target.closest(`#${IDS.HEADER_ADD_BTN}`);
            if (addBtn) {
                console.log('[AppController] Add Button Clicked. Current Watchlist ID:', AppState.watchlist.id);
                if (this.headerLayout) this.headerLayout.closeSidebar();

                // Standard 150ms delay for history stabilization
                setTimeout(() => {
                    if (AppState.watchlist.id === CASH_WATCHLIST_ID) {
                        console.log('[AppController] Opening Cash Modal (Add mode)');
                        this.modalController.handleOpenCashModal(null);
                    } else {
                        console.log('[AppController] Opening Add Share Modal');
                        this.modalController.openAddShareModal(null);
                    }
                }, 150);
            }
        });

        // Cash Asset Selection Delegation
        document.body.addEventListener(EVENTS.CASH_ASSET_SELECTED, (e) => {
            const assetId = e.detail.assetId || (e.detail.asset ? e.detail.asset.id : null);
            console.log('[AppController] Cash Asset Selected Event Received. Asset ID:', assetId);
            if (assetId) {
                this.modalController.handleOpenCashModal(assetId);
            }
        });

        // Initial Sort UI
        if (this.viewRenderer) {
            this.viewRenderer.updateSortButtonUI(AppState.watchlist.id, AppState.sortConfig);
        }

        // Sidebar Auto-Close
        const sidebarContent = document.querySelector('.sidebar-content');
        if (sidebarContent) {
            sidebarContent.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) {
                    if (this.headerLayout) this.headerLayout.closeSidebar();
                }
            });
        }

        // Hard Reload Button - Intentional page reload for cache bust (Settings Feature)
        const reloadBtn = document.getElementById(IDS.RELOAD_BTN);
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(function (registrations) {
                        for (let registration of registrations) {
                            registration.unregister();
                        }
                    });
                }
                window.location.reload(true);
            });
        }

        document.getElementById('btn-general-settings')?.addEventListener('click', () => {
            if (this.headerLayout) this.headerLayout.closeSidebar();
            setTimeout(() => {
                GeneralSettingsUI.showModal(this);
            }, 150);
        });

        // Deprecated: btn-security-settings (Moved to General Settings)
        // Kept comments for reference or removal if cleaner.

        document.getElementById(IDS.BTN_OPEN_CALCULATOR)?.addEventListener('click', () => {
            if (this.headerLayout) this.headerLayout.closeSidebar();
            setTimeout(() => {
                this.calculatorUI.open();
            }, 150);
        });





        // Code Pills (ASX Details)
        document.body.addEventListener('click', (e) => {
            // Deep Link Handling (Alerts/Notes) - Global delegation to catch Modals too
            const deepLink = e.target.closest('[data-action="deep-link"]');
            if (deepLink) {
                e.preventDefault();
                e.stopPropagation();
                const id = deepLink.dataset.id;
                const section = deepLink.dataset.section;
                console.log(`[AppController] Deep Link Clicked: ID=${id}, Section=${section}`);
                if (id && section) {
                    this.modalController.openAddShareModal(id, section);
                }
                return;
            }

            const pill = e.target.closest('.code-pill') || e.target.closest('.asx-dropdown-pill');
            if (pill && pill.dataset.code) {
                const code = pill.dataset.code;

                // Safety delay for modal transitions (e.g. from a dropdown or modal)
                setTimeout(() => {
                    const stockData = getSingleShareData(code, AppState.data.shares, AppState.livePrices, AppState.data.watchlists);
                    if (stockData) {
                        this.viewRenderer.renderStockDetailsModal(stockData);
                        document.getElementById(IDS.ASX_DROPDOWN_MENU)?.classList.remove(CSS_CLASSES.SHOW);
                    } else {
                        // Fallback: Open Discovery Modal
                        console.log(`[AppController] Stock not in watchlist. Opening Discovery for: ${code}`);
                        document.dispatchEvent(new CustomEvent(EVENTS.OPEN_RESEARCH_MODAL, { detail: { query: code } }));
                        document.getElementById(IDS.ASX_DROPDOWN_MENU)?.classList.remove(CSS_CLASSES.SHOW);
                    }
                }, 150);
            }
        });

        // Live Refresh Button Delegation
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest(`#${IDS.LIVE_REFRESH_BTN}`);
            if (btn) {
                e.preventDefault(); // Good practice for buttons
                console.log("Live Refresh Clicked");
                ToastManager.info('Refreshing Live Prices...');
                this.updateDataAndRender(true);
            }
        });

        // Initial Time Set (Defer to ensure DOM is ready)
        setTimeout(() => this._updateLiveRefreshTime(), 500);

        const container = document.getElementById(IDS.CONTENT_CONTAINER);
        if (!container) return;

        container.addEventListener('click', async (e) => {
            // Add Stock (Quick Add) - MOVED TO DELEGATED HANDLER
            // See _setupDelegatedEvents for the 'click' handler on #add-stock-submit
            if (e.target.closest(`#${IDS.ADD_STOCK_SUBMIT}`)) {
                // Actually, this IS the delegated handler logic spot if we want to keep it here, 
                // BUT my intent was to rely on valid structure. 
                // The previous edit deleted the `container.addEventListener` line.
                // Re-adding the wrapper structure correctly.
                return;
            }

            // Stock Details (Row Click)
            if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;

            const row = e.target.closest('tr');
            const card = e.target.closest('.share-card');
            const item = row || card;

            if (item && item.dataset.code) {
                const code = item.dataset.code;
                // Add delay for row click transitions
                setTimeout(() => {
                    const stockData = getSingleShareData(code, AppState.data.shares, AppState.livePrices, AppState.data.watchlists);
                    if (stockData) {
                        this.viewRenderer.renderStockDetailsModal(stockData);
                    }
                }, 150);
            }
        });

        container.addEventListener('keypress', (e) => {
            if (e.target.id === IDS.NEW_STOCK_CODE && e.key === 'Enter') {
                document.getElementById(IDS.ADD_STOCK_SUBMIT)?.click();
            }
        });

        // Edit Share Request Listener (Custom Event)
        // Triggered by ViewRenderer dispatching EVENTS.REQUEST_EDIT_SHARE
        document.addEventListener(EVENTS.REQUEST_EDIT_SHARE, (e) => {
            console.log('AppController received REQUEST_EDIT_SHARE:', e.detail);
            if (e.detail?.id) {
                // Safety delay for transition from detail to edit
                setTimeout(() => {
                    // DEEP LINK: Pass specific section if requested (e.g. 'notes', 'target')
                    console.log('AppController opening modal for section:', e.detail.section);
                    this.modalController.openAddShareModal(e.detail.id, e.detail.section);
                }, 150);
            }
        });

        // Live Refresh of Stock Details (e.g. after Edit)
        document.addEventListener(EVENTS.REQUEST_REFRESH_DETAILS, (e) => {
            const { code } = e.detail || {};
            if (!code) return;

            // Check if Modal is Open
            const modal = document.getElementById(IDS.STOCK_DETAILS_MODAL);
            if (modal && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                // Verify it's the right stock (optional check, but good for safety)
                const titleEl = modal.querySelector(`.${CSS_CLASSES.DISPLAY_TITLE}`);
                if (titleEl && titleEl.textContent === code) {
                    // Refetch Data
                    const stockData = getSingleShareData(code, AppState.data.shares, AppState.livePrices, AppState.data.watchlists);
                    if (stockData) {
                        this.viewRenderer.renderStockDetailsModal(stockData);
                    }
                }
            }
        });

        // === DISCOVERY MODAL EVENT LISTENERS ===
        // Open Search Discovery Modal (from sidebar button)
        document.addEventListener(EVENTS.REQUEST_OPEN_DISCOVERY_MODAL, () => {
            // Already includes delay in HeaderLayout, but for redundancy/consistency:
            SearchDiscoveryUI.showModal();
        });

        // Handle Add Share Pre-fill (from Discovery Modal -> Add Share Modal handoff)
        document.addEventListener(EVENTS.REQUEST_ADD_SHARE_PREFILL, (e) => {
            const { stock } = e.detail || {};
            if (stock?.code) {
                // Safety delay for transition from search to add
                setTimeout(() => {
                    this.modalController.openAddShareModal({ shareName: stock.code, title: stock.name });
                }, 150);
            }
        });

        // Visibility Toggle (Eye Icon)
        document.addEventListener(EVENTS.SHARE_TOGGLE_VISIBILITY, (e) => {
            const { id } = e.detail || {};
            console.log(`Visibility Toggle Event: Received ID = ${id}`);
            if (id) {
                AppState.toggleHiddenAsset(id);
                const isHidden = AppState.hiddenAssets.has(id);
                console.log(`Hidden Assets now:`, [...AppState.hiddenAssets]);

                // Fetch Name
                const share = (AppState.data.shares || []).find(s => s.id === id);
                const name = share ? (share.shareName || share.code) : 'Share';

                // Toast Feedback
                ToastManager.success(isHidden ? `${name} hidden.` : `${name} visible.`);

                this.updateDataAndRender(false);

                // ARCHITECTURAL FIX: Persist immediately to cloud
                this.appService.saveUserPreferences({ hiddenAssets: [...AppState.hiddenAssets] })
                    .catch(e => console.warn('Failed to sync hidden assets:', e));
            }
        });

        // === WATCHLIST CRUD EVENT LISTENERS ===
        // These events are dispatched by HeaderLayout.js modals

        // CREATE WATCHLIST
        document.addEventListener(EVENTS.REQUEST_NEW_WATCHLIST, async (e) => {
            const { name } = e.detail || {};
            if (!name || !AppState.user) {
                console.warn('CREATE: Missing name or user not logged in');
                return;
            }

            try {
                console.log('AppController: Creating watchlist:', name);
                const newId = await this.appService.addWatchlist(name);
                if (newId) {
                    console.log('Watchlist created:', newId);
                    // Switch to new watchlist - User initiated
                    this.handleSwitchWatchlist(newId, false);
                    ToastManager.success(`Watchlist "${name}" created.`);
                }

            } catch (err) {
                console.error('Failed to create watchlist:', err);
                ToastManager.error('Failed to create watchlist: ' + err.message);
            }
        });

        // UPDATE (RENAME) WATCHLIST
        document.addEventListener(EVENTS.REQUEST_UPDATE_WATCHLIST, async (e) => {
            const { id, newName } = e.detail || {};
            if (!id || !newName || !AppState.user) {
                console.warn('UPDATE: Missing id, newName, or user not logged in');
                return;
            }

            // Prevent editing system views
            if (id === 'portfolio' || id === 'ALL' || id === 'CASH') {
                alert(USER_MESSAGES.RENAME_SYSTEM_VIEW);
                return;
            }

            try {
                console.log('AppController: Renaming watchlist:', id, 'to', newName);
                await this.appService.renameWatchlist(id, newName);
                // Refresh UI
                this.watchlistUI.updateHeaderTitle();
                this.watchlistUI.renderWatchlistDropdown();
                ToastManager.success('Watchlist renamed successfully.');
            } catch (err) {
                console.error('Failed to rename watchlist:', err);
                ToastManager.error('Failed to rename watchlist: ' + err.message);
            }
        });

        // DELETE WATCHLIST (with orphan share warning)
        document.addEventListener(EVENTS.REQUEST_DELETE_WATCHLIST, async (e) => {
            const { id } = e.detail || {};
            if (!id || !AppState.user) {
                console.warn('DELETE: Missing id or user not logged in');
                return;
            }

            // Prevent deleting system views
            if (id === 'portfolio' || id === 'ALL' || id === 'CASH') {
                alert('Cannot delete system views.');
                return;
            }

            // Get watchlist info
            const watchlist = (AppState.data.watchlists || []).find(w => w.id === id);
            if (!watchlist) {
                console.warn('DELETE: Watchlist not found:', id);
                return;
            }

            // 1. Find all shares currently assigned to this watchlist (by ID)
            const allShares = AppState.data.shares || [];

            // Filter shares that belong to this watchlist
            const sharesInWatchlist = allShares.filter(s => s.watchlistId === id);

            // 2. Identify Orphans (Shares that are ONLY in this watchlist)
            // Since our data model is 1 Share Doc = 1 Watchlist (mostly), 
            // if s.watchlistId === id, it effectively belongs ONLY here unless we use array-based memberships (which we are moving away from).
            // But let's be safe and check if it has multiple memberships (future proofing).
            // Standard V3 model: share.watchlistId is the primary key. If that matches 'id', deleting 'id' orphans 'share'.

            const orphans = sharesInWatchlist; // In V3, a share belongs to one watchlist context primarily.

            // Build confirmation message
            let message = `Any shares that are unique to this Watchlist will be permanently deleted!`;
            if (orphans.length > 0) {
                const names = orphans.map(s => s.shareName).join(', ');
                message += `\n\n${names}`;
            }

            if (!confirm(message)) return;

            try {
                // 3. Delete Orphans FIRST
                if (orphans.length > 0) {
                    console.log(`Deleting ${orphans.length} orphan shares...`);
                    for (const share of orphans) {
                        await this.appService.deleteShareRecord(id, share.id);
                    }
                }

                // 4. Delete Watchlist
                await this.appService.deleteWatchlist(id);

                // Refresh is automatic via subscription
                ToastManager.success(`Watchlist "${watchlist.name}" deleted.`);

            } catch (err) {
                console.error('Delete Watchlist Error:', err);
                ToastManager.error('Failed to delete watchlist: ' + err.message);
            }
        });

        // DELETE SHARE HANDLER (Fix for Immediate UI Update)
        document.addEventListener(EVENTS.REQUEST_DELETE_SHARE, async (e) => {
            const { shareId, watchlistId } = e.detail;
            if (!shareId) return;

            console.log(`[AppController] REQUEST_DELETE_SHARE received for ID: ${shareId}`);

            try {
                // Determine if we are deleting from a specific watchlist or the share entirely
                // AppService.deleteShareRecord handles the logic (checks ID vs watchlist context)
                await this.appService.deleteShareRecord(watchlistId, shareId);

                // Success Feedback
                ToastManager.success('Share deleted.');

                // Explicitly trigger a re-render to ensure UI reflects change immediately
                // (Though UserStore snapshot will likely trigger it too, this is safe redundancy)
                this.updateDataAndRender(false);

                // CLOSE DETAILS MODAL (Fix for Ghost UI)
                // If the user deleted the share via "Edit" from the "Details Modal", 
                // the Details Modal is still open. We must close it.
                const detailsModal = document.getElementById(IDS.STOCK_DETAILS_MODAL);
                if (detailsModal) {
                    detailsModal.remove();
                }

            } catch (err) {
                console.error('Delete Share Error:', err);
                ToastManager.error('Failed to delete share: ' + err.message);
            }
        });

        // -------------------------------------------------------------------------
        // DELETE CASH ASSET HANDLER (Directive 020)
        // -------------------------------------------------------------------------
        document.addEventListener(EVENTS.REQUEST_DELETE_CASH_ASSET, async (e) => {
            console.log('AppController: REQUEST_DELETE_CASH_ASSET Received:', e.detail);
            const { id } = e.detail;
            if (!id) return;

            // 1. Notify Shield (Removed: Architectural fix handles this now)

            try {
                // 2. Call Service to delete from backend
                await this.appService.deleteCashCategory(id);
                // UI will update via UserStore subscription -> updateDataAndRender -> refreshView
                ToastManager.success('Asset deleted.');
            } catch (err) {
                console.error('Delete Cash Error:', err);
                ToastManager.error('Failed to delete asset.');
            }
        });

        // -------------------------------------------------------------------------
        // CASH ASSET VISIBILITY TOGGLE (Delegate)
        // -------------------------------------------------------------------------
        document.addEventListener(EVENTS.CASH_ASSET_TOGGLE_VISIBILITY, (e) => {
            // Just proxy to controller
            if (this.cashController) {
                this.cashController.handleToggleVisibility(e.detail.assetId);
            }
        });

        // -------------------------------------------------------------------------
        // GENERAL NAVIGATION EVENTS
        // -------------------------------------------------------------------------

        // ASX Code Click (Programmatic View Request)
        document.addEventListener(EVENTS.ASX_CODE_CLICK, (e) => {
            const { code } = e.detail;
            if (code) {
                // Safety delay for modal transitions
                setTimeout(() => {
                    const stockData = getSingleShareData(code, AppState.data.shares, AppState.livePrices, AppState.data.watchlists);
                    if (stockData) {
                        this.viewRenderer.renderStockDetailsModal(stockData);
                        // Ensure any hanging dropdowns or other modals (if applicable) are handled
                        document.getElementById(IDS.ASX_DROPDOWN_MENU)?.classList.remove(CSS_CLASSES.SHOW);
                    } else {
                        // Fallback: Open Discovery Modal
                        console.log(`[AppController] ASX Code Click: Data not found for ${code}. Opening Discovery.`);
                        document.dispatchEvent(new CustomEvent(EVENTS.OPEN_RESEARCH_MODAL, { detail: { query: code } }));
                    }
                }, 150);
            }
        });

        // === SEARCH & RESEARCH EVENTS (TWO-STAGE DISCOVERY) ===

        // 1. General Symbol Search (Used by Add Modal directly too)
        document.addEventListener(EVENTS.REQUEST_SYMBOL_SEARCH, (e) => {
            const { query } = e.detail;
            const results = this.dataService.searchStocks(query, AppState.livePrices);
            document.dispatchEvent(new CustomEvent(EVENTS.UPDATE_SEARCH_RESULTS, { detail: { results } }));
        });

        // 1b. Single Live Price Request (Add/Edit Preview)
        document.addEventListener(EVENTS.REQUEST_LIVE_PRICE, async (e) => {
            const { code } = e.detail;
            if (!code) return;

            // Check cache first
            if (AppState.livePrices.has(code)) {
                // Return simplified structure for Preview
                const data = AppState.livePrices.get(code);
                document.dispatchEvent(new CustomEvent(EVENTS.UPDATE_MODAL_PREVIEW, {
                    detail: { data }
                }));
                return;
            }

            // Fetch fresh
            const map = await this.dataService.fetchLivePrices([code]);
            if (map && map.has(code)) {
                const data = map.get(code);
                AppState.livePrices.set(code, data);

                document.dispatchEvent(new CustomEvent(EVENTS.UPDATE_MODAL_PREVIEW, {
                    detail: { data }
                }));
            }
        });

        // 2. Open Discovery Modal (Stage 1)
        document.addEventListener(EVENTS.OPEN_RESEARCH_MODAL, (e) => {
            const { query } = e.detail || {};
            SearchDiscoveryUI.showModal(query);
        });

        // 3. Discovery Internal Search
        document.addEventListener(EVENTS.REQUEST_DISCOVERY_SEARCH, (e) => {
            const { query } = e.detail;
            const results = this.dataService.searchStocks(query, AppState.livePrices);
            document.dispatchEvent(new CustomEvent(EVENTS.UPDATE_DISCOVERY_RESULTS, { detail: { results } }));
        });

        // 4. Hand-off: Discovery -> Add Share (Stage 2)
        document.addEventListener(EVENTS.REQUEST_ADD_SHARE_PREFILL, (e) => {
            const { stock } = e.detail;
            // Close Discovery is handled by UI, but we ensure Add Modal opens with data
            // We map the stock data to what ShareFormUI expects
            // It expects: shareName (code), title (name), currentPrice (optional but good for preview)
            const shareData = {
                shareName: stock.code,
                title: stock.name,
                // No ID, so ShareFormUI treats as "Add" (thanks to our fix)
            };

            // Open Add Modal via ModalController (or directly since AppController has access)
            this.modalController.openAddShareModal(shareData);
        });

        // 4.5 ASX Code Click Handler (Centralized)
        document.addEventListener(EVENTS.ASX_CODE_CLICK, (e) => {
            const { code } = e.detail;
            if (!code) return;

            // Safety Delay: Ensures any preceding "Close" (history pop) resolves
            setTimeout(() => {
                const stockData = getSingleShareData(code, AppState.data.shares, AppState.livePrices, AppState.data.watchlists);
                if (stockData) {
                    this.viewRenderer.renderStockDetailsModal(stockData);
                }
            }, 150);
        });

        // 5. Summary Detail Modals
        document.addEventListener(EVENTS.REQUEST_SUMMARY_DETAIL, (e) => {
            const { type } = e.detail;
            const allShares = AppState.data.shares || [];

            // Re-process data to get fresh merged stats (using currently cached prices)
            const { mergedData } = processShares(
                allShares,
                PORTFOLIO_ID,
                AppState.livePrices,
                { field: 'code', direction: 'asc' }, // Temporary baseline for filtering
                AppState.hiddenAssets
            );

            // Filter out hidden shares for summary details
            const shares = mergedData.filter(s => !s.isHidden);

            let title = '';
            let filteredShares = [];
            let valueField = '';

            switch (type) {
                case SUMMARY_TYPES.VALUE:
                    title = 'Summary Current Value';
                    filteredShares = [...shares].sort((a, b) => (b.value || 0) - (a.value || 0));
                    valueField = 'value';
                    break;
                case SUMMARY_TYPES.DAY_CHANGE:
                    title = 'Summary Day Change';
                    filteredShares = [...shares].sort((a, b) => (b.dayChangeValue || 0) - (a.dayChangeValue || 0));
                    valueField = 'dayChangeValue';
                    break;
                case SUMMARY_TYPES.WINNERS:
                    title = 'Summary Day Change Winners';
                    filteredShares = shares.filter(s => (s.dayChangeValue || 0) > 0)
                        .sort((a, b) => (b.dayChangeValue || 0) - (a.dayChangeValue || 0));
                    valueField = 'dayChangeValue';
                    break;
                case SUMMARY_TYPES.LOSERS:
                    title = 'Summary Day Change Losers';
                    // Worst negative to least worse negative: means ASC (e.g. -100, -50, -10)
                    filteredShares = shares.filter(s => (s.dayChangeValue || 0) < 0)
                        .sort((a, b) => (a.dayChangeValue || 0) - (b.dayChangeValue || 0));
                    valueField = 'dayChangeValue';
                    break;
                case SUMMARY_TYPES.CAPITAL_GAIN:
                    title = 'Summary Capital Gain';
                    filteredShares = [...shares].sort((a, b) => (b.capitalGain || 0) - (a.capitalGain || 0));
                    valueField = 'capitalGain';
                    break;
                default:
                    console.warn('Unknown summary type:', type);
                    return;
            }
            // Delay opening modal to allow any preceding history moves to settle
            setTimeout(() => {
                this.viewRenderer.renderSummaryDetailModal(title, filteredShares, valueField);
            }, 150);
        });

        // -------------------------------------------------------------------------
        // DATA MANAGEMENT HANDLERS (Download/Delete)
        // -------------------------------------------------------------------------

        // 1. DATA MANAGEMENT EVENT LISTENERS (Business Logic)
        document.addEventListener(EVENTS.REQUEST_DOWNLOAD_DATA || 'request-download-data', () => {
            this._openDownloadModal();
        });

        document.addEventListener(EVENTS.REQUEST_DELETE_DATA || 'request-delete-data', () => {
            this.handleDeleteData();
        });

        // 2. GLOBAL CLICK HANDLER (Interaction Layer)
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target) return;

            // Debug Log


            // Sidebar: Download Data
            const downloadBtn = target.closest(`#${IDS.DOWNLOAD_DATA_BTN || 'btn-download-data'}`);
            if (downloadBtn) {
                if (this.headerLayout && typeof this.headerLayout.closeSidebar === 'function') {
                    this.headerLayout.closeSidebar();
                }
                setTimeout(() => this._openDownloadModal(), 150);
                return;
            }

            // Sidebar: Delete Data
            const deleteBtn = target.closest(`#${IDS.DELETE_DATA_BTN || 'btn-delete-data'}`);
            if (deleteBtn) {
                if (this.headerLayout && typeof this.headerLayout.closeSidebar === 'function') {
                    this.headerLayout.closeSidebar();
                }
                setTimeout(() => {
                    const evt = EVENTS.REQUEST_DELETE_DATA || 'request-delete-data';
                    document.dispatchEvent(new CustomEvent(evt));
                }, 150);
                return;
            }

            // Modal: Download CSV
            if (target.closest(`#${IDS.DOWNLOAD_CSV_BTN}`)) {
                this._closeDownloadModal();
                setTimeout(() => {
                    this.exportData('csv');
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DOWNLOAD_DATA, { detail: { action: 'close' } }));
                }, 100);
                return;
            }

            // Modal: Download PDF
            if (target.closest(`#${IDS.DOWNLOAD_PDF_BTN}`)) {
                this._closeDownloadModal();
                setTimeout(() => this.exportData('pdf'), 100);
                return;
            }

            // Modal: Close / Overlay
            const modalId = IDS.DOWNLOAD_DATA_MODAL || 'modal-download-data';
            const closeBtn = target.closest('.modal-close-btn') && target.closest(`#${modalId}`);
            const isOverlay = target.classList.contains(CSS_CLASSES.MODAL_OVERLAY) && target.closest(`#${modalId}`);

            if (closeBtn || isOverlay) {
                this._closeDownloadModal();
            }
        });
    }

    /**
     * Closes the data download modal.
     */
    _closeDownloadModal() {
        const modalId = IDS.DOWNLOAD_DATA_MODAL || 'modal-download-data';
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add(CSS_CLASSES.HIDDEN || 'hidden');
            modal.style.display = '';
            modal.style.visibility = '';
            modal.style.opacity = '';
            modal.style.pointerEvents = '';

            // Remove from history stack if closed manually
            if (this._downloadNavActive) {
                this._downloadNavActive = false;
                navManager.popStateSilently();
            }
        }
    }

    /**
     * Opens the data download modal.
     */
    _openDownloadModal() {
        const modalId = IDS.DOWNLOAD_DATA_MODAL || 'modal-download-data';
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove(CSS_CLASSES.HIDDEN || 'hidden');
            // Force visibility to overcome any CSS issues
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';

            // Register with NavigationManager
            if (!this._downloadNavActive) {
                this._downloadNavActive = true;
                navManager.pushState(() => {
                    this._downloadNavActive = false;
                    this._closeDownloadModal();
                });
            }
        } else {
            console.error('Download Modal not found:', modalId);
        }
    }

    /**
     * Orchestrates data export in specified format.
     * @param {string} format 
     */
    exportData(format) {
        const data = this.appService.prepareExportData();

        if (format === 'csv') {
            this._downloadCSV(data);
        } else if (format === 'pdf') {
            // PDF is handled by print layout
            window.print();
        }
    }

    /**
     * Generates and downloads a CSV file.
     */
    _downloadCSV(data) {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Type,Code/Name,Balance/Shares,Price,Value,Category/Date\n";

        // Add Shares
        data.shares.forEach(s => {
            const price = s.currentPrice || s.enteredPrice || 0;
            const value = (s.portfolioShares || 0) * price;
            csvContent += `Share,${s.shareName},${s.portfolioShares},${price},${value},${s.entryDate}\n`;
        });

        // Add Cash
        data.cash.forEach(c => {
            csvContent += `Cash,${c.name},${c.balance},1,${c.balance},${c.category}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `asx_data_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Handles the hard delete flow with confirmation.
     */
    async handleDeleteData() {
        if (confirm(USER_MESSAGES.CONFIRM_DELETE_ALL)) {
            // Second confirmation for such a destructive action
            if (confirm("FINAL WARNING: All your data will be permanently wiped. Proceed?")) {
                try {
                    document.body.classList.add('loading'); // Optional UI feedback
                    await this.appService.wipeUserData();
                    // Clear local storage
                    localStorage.clear();

                    // Wait for Auth to settle as NULL before reloading
                    return new Promise(resolve => {
                        const unsub = AuthService.observeState(async (u) => {
                            if (!u) {
                                unsub();
                                console.log("[AppController] Auth settled as NULL. Reloading now.");
                                // Small delay for storage persistence
                                setTimeout(() => window.location.reload(), 500);
                                resolve();
                            }
                        });
                        // Fallback if observer doesn't fire
                        setTimeout(() => window.location.reload(), 2000);
                        AuthService.signOut();
                    });
                } catch (err) {
                    console.error("Wipe failed:", err);
                    document.body.classList.remove('loading');
                }
            }
        }
    }

    /**
     * Handles opening the security settings modal.
     */
    handleSecuritySettings() {
        if (this.headerLayout) {
            this.headerLayout.closeSidebar();
        }
        // Standard 150ms delay for history stabilization
        setTimeout(() => {
            SecurityUI.renderSecuritySettings(this.securityController);
        }, 150);
    }

    _updateLiveRefreshTime() {
        const el = document.getElementById(IDS.LIVE_REFRESH_TIME);
        if (el) {
            el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
    }
}
