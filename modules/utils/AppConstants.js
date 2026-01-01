/**
 * AppConstants.js
 * Centralized constants for the application.
 */

export const ALL_SHARES_ID = 'ALL';
export const CASH_WATCHLIST_ID = 'CASH';
export const DASHBOARD_WATCHLIST_ID = 'DASHBOARD';
export const DASHBOARD_SYMBOLS = [
    'XJO', 'XKO', 'XAO', 'INX', '.DJI', '.IXIC',
    'AUDUSD', 'AUDTHB', 'USDTHB', 'BTCUSD',
    'GCW00', 'SIW00', 'BZW00'
];
export const DASHBOARD_LINKS = {
    // Indices
    'XJO': 'https://www.marketindex.com.au/asx200',
    'XKO': 'https://www.marketindex.com.au/asx300',
    'XAO': 'https://www.marketindex.com.au/all-ordinaries',
    'INX': 'https://www.google.com/finance/quote/.INX:INDEXSP',
    '.DJI': 'https://www.google.com/finance/quote/.DJI:INDEXDJX',
    '.IXIC': 'https://www.google.com/finance/quote/.IXIC:INDEXNASDAQ',

    // FX & Crypto
    'AUDUSD': 'https://www.google.com/finance/quote/AUD-USD',
    'AUDTHB': 'https://www.google.com/finance/quote/AUD-THB',
    'USDTHB': 'https://www.google.com/finance/quote/USD-THB',
    'BTCUSD': 'https://www.google.com/finance/quote/BTC-usd',

    // Commodities
    'GCW00': 'https://www.marketindex.com.au/gold',
    'SIW00': 'https://www.marketindex.com.au/silver',
    'BZW00': 'https://www.marketindex.com.au/crude-oil'
};
export const PORTFOLIO_ID = 'portfolio';
export const SEARCH_WATCHLIST_ID = 'search';

export const WATCHLIST_MODES = {
    DEFAULT: 'default',
    REARRANGE: 'rearrange',
    CAROUSEL: 'carousel',
    HIDE: 'hide'
};

export const STORAGE_KEYS = {
    WATCHLIST_ID: 'ASX_NEXT_lastWatchlistId',
    SORT: 'ASX_NEXT_sortConfig',
    HIDDEN_ASSETS: 'ASX_NEXT_hiddenAssets',
    PINNED_ALERTS: 'ASX_NEXT_pinnedAlerts',
    LAST_VIEWED_ALERTS: 'ASX_NEXT_lastViewedAlerts',
    CASH_CATEGORY_FILTER: 'ASX_NEXT_cashCategoryFilter',
    SECURITY_PREFS: 'ASX_NEXT_securityPrefs',
    DASHBOARD_ORDER: 'ASX_NEXT_dashboardOrder',
    WATCHLIST_ORDER: 'ASX_NEXT_watchlistOrder',
    SORT_OPTION_ORDER: 'ASX_NEXT_sortOptionOrder',
    CAROUSEL_SELECTIONS: 'ASX_NEXT_carouselSelections',
    WATCHLIST_PICKER_MODE: 'ASX_NEXT_watchlistPickerMode',
    HIDDEN_WATCHLISTS: 'ASX_NEXT_hiddenWatchlists',
    HIDDEN_SORT_OPTIONS: 'ASX_NEXT_hiddenSortOptions',
    GLOBAL_SORT: 'ASX_NEXT_globalSort',
    NOTIFICATIONS_VIEWED: 'ASX_NEXT_notificationsViewed',
    USER_CATEGORIES: 'ASX_NEXT_userCategories',
    SNAPSHOT_SORT: 'ASX_NEXT_snapshotSort'
};

export const EVENTS = {
    // Watchlist Events
    REFRESH_WATCHLIST: 'refresh-watchlist',
    WATCHLIST_CHANGED: 'watchlist-changed',
    REQUEST_NEW_WATCHLIST: 'request-new-watchlist',
    REQUEST_UPDATE_WATCHLIST: 'request-update-watchlist',
    REQUEST_DELETE_WATCHLIST: 'request-delete-watchlist',

    // Share/Asset Events
    REQUEST_EDIT_SHARE: 'request-edit-share',
    REQUEST_DELETE_SHARE: 'REQUEST_DELETE_SHARE',
    SHARE_TOGGLE_VISIBILITY: 'share-toggle-visibility',
    ASX_CODE_CLICK: 'ASX_CODE_CLICK',
    REQUEST_DELETE_CASH_ASSET: 'REQUEST_DELETE_CASH_ASSET',

    // Search & Discovery Events
    REQUEST_SYMBOL_SEARCH: 'REQUEST_SYMBOL_SEARCH',
    UPDATE_SEARCH_RESULTS: 'UPDATE_SEARCH_RESULTS',
    REQUEST_LIVE_PRICE: 'REQUEST_LIVE_PRICE',
    UPDATE_MODAL_PREVIEW: 'UPDATE_MODAL_PREVIEW',
    REQUEST_DISCOVERY_SEARCH: 'REQUEST_DISCOVERY_SEARCH',
    UPDATE_DISCOVERY_RESULTS: 'UPDATE_DISCOVERY_RESULTS',
    REQUEST_ADD_SHARE_PREFILL: 'REQUEST_ADD_SHARE_PREFILL',
    REQUEST_RENDER_WATCHLIST: 'REQUEST_RENDER_WATCHLIST',
    CASH_ASSET_TOGGLE_VISIBILITY: 'cash-asset-toggle-visibility',
    CASH_ASSET_SELECTED: 'cash-asset-selected',
    REQUEST_OPEN_DISCOVERY_MODAL: 'REQUEST_OPEN_DISCOVERY_MODAL',
    AUTH_STATE_CHANGED: 'auth-state-changed',
    SECURITY_STATE_CHANGED: 'security-state-changed',
    REQUEST_SECURITY_UNLOCK: 'request-security-unlock',
    REQUEST_SECURITY_SETTINGS: 'request-security-settings',

    OPEN_RESEARCH_MODAL: 'open-research-modal',

    // Summary Events
    REQUEST_SUMMARY_DETAIL: 'request-summary-detail',

    // Security Events
    SECURITY_PREFS_CHANGED: 'security-prefs-changed',
    REQUEST_UNLOCK: 'request-unlock',
    SECURITY_SETTINGS_OPEN: 'security-settings-open',

    // Data Management Events
    REQUEST_DOWNLOAD_DATA: 'request-download-data',
    REQUEST_DELETE_DATA: 'request-delete-data',

    // Notification & Settings Events
    OPEN_NOTIFICATIONS: 'open-notifications',
    NOTIFICATION_UPDATE: 'notification-update', // New Event
    NOTIFICATION_READY: 'notification-ready', // Data loaded event
    OPEN_SETTINGS: 'open-settings',
    PIN_ALERT: 'pin-alert',
    UNPIN_ALERT: 'unpin-alert',
    SAVE_SCANNER_SETTINGS: 'save-scanner-settings',
    REQUEST_REFRESH_DETAILS: 'request-refresh-details',
    SHOW_DAILY_BRIEFING: 'show-daily-briefing', // Sidebar Button Trigger
    FIREBASE_DATA_LOADED: 'firebase-data-loaded' // Splash Screen Trigger
};

export const SORT_OPTIONS = {
    STOCK: [ // Main Watchlists & All Shares
        { label: 'ASX Code', field: 'code', direction: 'asc', icon: 'fa-font' },
        { label: 'Daily Change', field: 'dayChangePercent', direction: 'desc', icon: 'fa-percent' },
        { label: 'Daily Change ($)', field: 'dayChangePerShare', direction: 'desc', icon: 'fa-dollar-sign' },
        { label: 'Rating', field: 'starRating', direction: 'desc', icon: 'fa-star' },
        { label: 'Dividends', field: 'dividendAmount', direction: 'desc', icon: 'fa-hand-holding-usd' },
        { label: 'Comments', field: 'comments', direction: 'asc', icon: 'fa-comment-alt' },
        { label: 'Alert Target', field: 'targetPrice', direction: 'asc', icon: 'fa-crosshairs' },
        { label: 'Date Added', field: 'entryDate', direction: 'desc', icon: 'fa-calendar' }
    ],
    PORTFOLIO: [ // Portfolio View Only
        { label: 'ASX Code', field: 'code', direction: 'asc', icon: 'fa-font' },
        { label: 'Daily Change', field: 'dayChangePercent', direction: 'desc', icon: 'fa-percent' },
        { label: 'Daily P/L', field: 'dayChangeValue', direction: 'desc', icon: 'fa-dollar-sign' },
        { label: 'Current Value', field: 'value', direction: 'desc', icon: 'fa-wallet' },
        { label: 'Capital Gain', field: 'capitalGain', direction: 'desc', icon: 'fa-chart-pie' }
    ],
    CASH: [ // Cash View Only
        { label: 'Category', field: 'category', direction: 'asc', icon: 'fa-layer-group' },
        { label: 'Asset Name', field: 'name', direction: 'asc', icon: 'fa-home' },
        { label: 'Current Value', field: 'balance', direction: 'desc', icon: 'fa-money-bill-wave' }
    ]
};

// Add this Pool to AppConstants as well:
export const WATCHLIST_ICON_POOL = ['fa-list-alt', 'fa-folder-open', 'fa-bookmark', 'fa-star', 'fa-user', 'fa-users', 'fa-layer-group', 'fa-tags', 'fa-gem', 'fa-briefcase'];

export const KANGAROO_ICON_SVG = `<svg viewBox="0 0 122.88 78.88" fill="currentColor"><path d="M75.88,44l-4.71-.7L53.93,67.5h3.66A10.08,10.08,0,0,1,60,68,142.7,142.7,0,0,0,75.88,44Zm19,3.86,4.79-11,7.93-8.6a16.29,16.29,0,0,1,3-.17c4.13.32,4.23.66,5.42,1.19a7.11,7.11,0,0,0,3.93.6,2.15,2.15,0,0,0,1.81-1.62c1.77-1.7,1.54-3.36-.3-5L118,20.52a5.26,5.26,0,0,0-2.94-5.65c2.25-5.1.66-9.35-2-13.27-.9-1.32-1.15-2.33-2.57-.9a7.7,7.7,0,0,0-1.35,2c3.07,2.8,5,6,5.09,9.69,0,.76.16,3.21-.59,3.46-1.45.49-1.48-1.49-1.5-2.25-.09-5.29-2.94-8.65-7.3-10.94-.67-.35-1.77-1.06-2.51-.67-.56.3-.92,1.49-1.12,2.08A11.11,11.11,0,0,0,100.67,8a11.35,11.35,0,0,0,1.27,4.7L104.13,15l-5.69,5c-3,1.55-6.06.91-9.16-2.11-8.2-7.47-16.45-10.7-27.86-10.16a30.81,30.81,0,0,0-15.83,5.62c-7.7,5.2-11.59,9.73-14.76,18.36a140.78,140.78,0,0,0-4.79,17c-1.67,6.75-3,17.51-8.86,21.66A14.22,14.22,0,0,1,7.54,72.7l-5.17-.36c-1.32-.15-2.11.14-2.3.91-1,4.06,8.12,5.39,10.83,5.59a18.52,18.52,0,0,0,14.22-5.57C31.79,66.5,35.74,48.73,42.2,43.08l2.67,1.65,2.68,1.66c1.79.93,2.25,1.42,1.21,3.6l-7.09,16.7c-1.36,2.73-1.52,7,.78,9.34a2.67,2.67,0,0,0,2.34.76H63c3.29-2.11-.25-7.33-5.54-7.76H50.81C57.49,60,64,50.59,70.28,40.82c5.23,1.55,12.94,1.74,18.51,1.37a17.52,17.52,0,0,1-3.19,7.06c-2.94.27-4.58,2.43-3.25,4.65,1.14,1.9,2.7,2,4.94,1.32a17,17,0,0,0,2.08-.71c1-.44,2.26-.68,3-1.53.51-.57.59-1.67,1-2.37a25.12,25.12,0,0,0,1.43-2.79ZM120.2,24.28A1.13,1.13,0,1,1,119,25.37a1.13,1.13,0,0,1,1.18-1.09Zm-8.27-6.61a2.44,2.44,0,0,1,1.93,2.76c-1.49.52-2.54-1.55-1.93-2.76ZM65.1,76.89h6.54c0-8-4.93-8.21-9.84-8.09a8.15,8.15,0,0,1,3.62,3.88,4.55,4.55,0,0,1,.17,3.26,4.08,4.08,0,0,1-.49,1Z"/></svg>`;

export const UI_ICONS = {
    EDIT: 'fa-pen',
    DELETE: 'fa-trash',
    CLOSE: 'fa-times',
    SAVE: 'fa-check',
    ADD: 'fa-plus',
    DIVIDENDS: 'fa-coins',
    CHART: 'fa-chart-line',
    WALLET: 'fa-wallet',
    HISTORY: 'fa-history',
    GLOBE: 'fa-globe',
    SPINNER: 'fa-spinner fa-spin',
    CHEVRON_DOWN: 'fa-chevron-down',
    SORT: 'fa-sort',
    SORT_UP: 'fa-sort-up',
    SORT_DOWN: 'fa-sort-down',
    ARROW_UP: 'fa-arrow-up',
    ARROW_DOWN: 'fa-arrow-down',
    STAR: 'fa-star',
    STAR_EMPTY: 'far fa-star',
    STAR_HALF: 'fa-star-half-alt',
    CARET_UP: 'fa-caret-up',
    CARET_DOWN: 'fa-caret-down',
    VIEW_TABLE: 'view-icon-single',// Single View Screen (Outline Rectangle)
    VIEW_COMPACT: 'view-icon-double', // Double View Screen
    VIEW_SNAPSHOT: 'view-icon-triple',      // Triple View Screen
    ALERTS: 'fa-bell',
    COMMENTS: 'fa-comment-alt',

    // Security Icons
    SHIELD: 'fa-shield-alt',
    FINGERPRINT: 'fa-fingerprint',
    BACKSPACE: 'fa-backspace',
    LOCK: 'fa-lock',
    UNLOCK: 'fa-unlock',

    // System Watchlist Icons
    BRIEFCASE: 'fa-briefcase',
    CHART_LINE: 'fa-chart-line',

    // Header Icons
    BARS: 'fa-bars',
    SORT_AMOUNT_DOWN: 'fa-sort-amount-down',
    CAMERA: 'fa-camera',

    // Alert Icons
    EXCLAMATION_TRIANGLE: 'fa-exclamation-triangle',

    // Check Icon
    CHECK: 'fa-check',
    PEN: 'fa-pen',

    // Eye Icons
    EYE: 'fa-eye',
    EYE_SLASH: 'fa-eye-slash',

    // List Icons
    LIST_ALT: 'fa-list-alt',

    // Carousel Navigation
    CHEVRON_LEFT: 'fa-chevron-left',
    CHEVRON_RIGHT: 'fa-chevron-right',

    // New Icons
    BELL: 'fa-bell',
    BELL_SLASH: 'fa-bell-slash',
    PIN: 'fa-thumbtack',
    COG: 'fa-cog',
    MARK_READ: 'fa-check-double',
    SYNC: 'fa-sync-alt'
};

export const HTML_TEMPLATES = {
    NOTE_INPUT: `
        <textarea class="note-input-white" rows="3" placeholder="Enter note..." data-type="comment-body"></textarea>
        <button type="button" class="dropdown-action-btn note-remove-btn" onclick="this.parentElement.remove()">
            <i class="fas fa-times icon-small"></i>
        </button>
    `
};

export const USER_MESSAGES = {
    SHARE_SAVED: 'Share saved successfully!',
    SIGNING_IN: 'signing in...',
    SHARE_DELETED: 'Share deleted.',
    ERROR_SAVE: 'Failed to save share: ',
    ERROR_DELETE: 'Error deleting share: ',
    VALIDATION_CODE: 'Stock code is required.',
    VALIDATION_PRICE: 'Valid price is required.',
    CONFIRM_DELETE: 'Are you sure you want to delete this share?',
    // Final Polish Additions
    SHARE_NOT_FOUND: 'Error: Share not found.',
    VALIDATION_FAILED: 'Validation Failed',
    SIGN_IN_FAILED: 'Sign in failed: ',
    AUTH_REQUIRED: 'Please sign in.',
    AUTH_REQUIRED_FIRST: 'Please sign in first.',
    AUTH_REQUIRED_MANAGE: 'Please sign in to manage watchlists.',
    AUTH_REQUIRED_SAVE_ASSETS: 'You must be logged in to save assets.',
    AUTH_REQUIRED_DELETE_ASSETS: 'You must be logged in to delete assets.',
    AUTH_ERROR_SIGNED_IN: 'Authentication Error: You must be signed in.',
    ASSET_ADDED_SUCCESS: 'Asset added successfully.',
    ASSET_UPDATE_SUCCESS: 'Asset updated successfully.',
    ASSET_DELETED: 'Asset deleted.',
    ERR_ADD_STOCK: 'Failed to add stock.',
    ERR_SAVE_ASSET: 'Failed to save asset: ',
    ERR_DELETE_ASSET: 'Failed to delete asset: ',
    ERR_MISSING_SHARE_ID: 'Update Error: Missing Share ID.',
    SHARE_DUPLICATE: "Share '{0}' is already in your portfolio. Double ups are not permitted.", // {0} = code
    ERR_INVALID_DATA: 'Validation Error: Invalid Data.',
    ERR_INVALID_STOCK_CODE: 'Validation Error: Invalid Stock Code. Record cannot be saved.',
    ERR_CANNOT_IDENTIFY_SHARE: 'Cannot identify share code for removal.',
    RENAME_SYSTEM_VIEW: 'Cannot rename System views.',
    RENAME_RESTRICTED: 'Cannot rename this view. Please create a new watchlist to enable renaming.',
    CONFIRM_DELETE_ALL: 'CRITICAL: This will permanently delete ALL your shares, watchlists, and settings. This action cannot be undone. Are you sure?',
    DATA_WIPED: 'All data has been deleted.'
};

export const RESEARCH_LINKS_TEMPLATE = [
    { name: 'Google Finance', url: 'https://www.google.com/finance/quote/${code}:ASX' },
    { name: 'ASX Official', url: 'https://www2.asx.com.au/markets/company/${code}' },
    { name: 'Market Index', url: 'https://www.marketindex.com.au/asx/${code}' },
    { name: 'HotCopper', url: 'https://hotcopper.com.au/asx/${code}/' },
    { name: 'CommSec', url: 'https://www2.commsec.com.au/quotes/summary?stockCode=${code}&exchangeCode=ASX' },
    { name: 'Rask Media', url: 'https://www.raskmedia.com.au/asx/${code}/' },
    { name: 'TradingView', url: 'https://www.tradingview.com/symbols/ASX-${code}/' },
    { name: 'Google News', url: 'https://www.google.com/search?q=${code}+ASX&tbm=nws' },
    { name: 'Motley Fool', url: 'https://www.fool.com.au/tickers/asx-${code}/' },
    { name: 'Yahoo Finance', url: 'https://au.finance.yahoo.com/quote/${code}.AX' }
];


export const CASH_CATEGORIES = [
    { id: 'cash', label: 'Cash' },
    { id: 'cash_in_bank', label: 'Cash in Bank' },
    { id: 'term_deposit', label: 'Term Deposit' },
    { id: 'property', label: 'Property' },
    { id: 'crypto', label: 'Crypto' },
    { id: 'shares', label: 'Shares' },
    { id: 'super', label: 'Superannuation' },
    { id: 'personal', label: 'Personal' },
    { id: 'other', label: 'Other' }
];

export const SUMMARY_TYPES = {
    VALUE: 'VALUE',
    DAY_CHANGE: 'DAY_CHANGE',
    WINNERS: 'WINNERS',
    LOSERS: 'LOSERS',
    CAPITAL_GAIN: 'CAPITAL_GAIN'
};

export const CSS_CLASSES = {
    // Layout & Utilities
    ACTIVE: 'active',
    HIDDEN: 'hidden',
    MODE_SELECTOR: 'mode-selector',
    REORDER_ACTIVE: 'reorder-active',
    DARK_THEME: 'dark-theme',
    MODAL_REORDER_TITLE: 'modal-reorder-title',
    MOBILE_CONTAINER: 'mobile-share-cards',
    FALLBACK_CONTAINER: 'mobile-cards-fallback',
    POSITIVE: 'positive',
    NEGATIVE: 'negative',
    NEUTRAL: 'neutral',

    // Notification & Settings
    BADGE: 'notification-badge',
    BADGE_PILL: 'badge-pill',
    BADGE_VISIBLE: 'visible',
    TAB_ACTIVE: 'tab-active',
    PINNED_ITEM: 'pinned-item',
    PIN_BTN: 'pin-btn',
    SETTINGS_ROW: 'settings-row',
    SETTINGS_LABEL: 'settings-label',
    SETTINGS_INPUT: 'settings-input',
    SETTINGS_TOGGLE: 'settings-toggle',
    SETTINGS_SECTION: 'settings-section',

    // Components
    CARD: 'share-card',
    TABLE: 'share-table',
    ROW: 'share-row',

    // Trends & State
    TREND_UP: 'trend-up',
    TREND_DOWN: 'trend-down',
    TREND_NEUTRAL: 'trend-neutral',

    // Text Colors
    TEXT_POSITIVE: 'text-positive',
    TEXT_NEGATIVE: 'text-negative',
    TEXT_NEUTRAL: 'text-neutral',
    TEXT_COFFEE: 'text-coffee',
    TEXT_SHIMMER: 'text-shimmer',

    // View Modes
    VIEW_TABLE: 'view-table',
    VIEW_COMPACT: 'view-compact',
    VIEW_SNAPSHOT: 'view-snapshot',

    // Layout Component Classes
    HAMBURGER_BTN: 'hamburger-btn',
    HEADER_LEFT_CONTAINER: 'header-left-container',
    HEADER_ACTION_BTN_RIGHT: 'header-action-btn-right',
    HEADER_ACTION_BTN: 'header-action-btn',
    APP_TITLE_COMPACT: 'app-title-compact',
    ASX_CODE_BUTTONS_CONTAINER: 'asx-code-buttons-container',
    CUSTOM_DROPDOWN: 'custom-dropdown',
    CASH_DROPDOWN_TRIGGER: 'cash-dropdown-trigger',
    DROPDOWN_OPTIONS: 'dropdown-options',
    DROPDOWN_OPTION: 'dropdown-option',
    FORM_CONTAINER: 'form-container',
    INPUT_LABEL: 'input-label',
    STANDARD_INPUT: 'standard-input',
    STANDARD_TEXTAREA: 'standard-textarea',
    COMMENT_INPUT: 'comment-input',
    DELETE_COMMENT_BTN: 'delete-comment-btn',
    BTN_TEXT_SMALL: 'btn-text-small',

    // Modals
    MODAL: 'modal',
    MODAL_OVERLAY: 'modal-overlay',
    MODAL_CONTENT: 'modal-content',

    // Modal Components
    MODAL_HEADER: 'modal-header',
    MODAL_CONTENT_MEDIUM: 'modal-content-medium',
    MODAL_HEADER_LEFT: 'modal-header-left',
    MODAL_TITLE: 'modal-title',
    MODAL_SUBTITLE: 'modal-subtitle',
    MODAL_ACTIONS: 'modal-actions',
    MODAL_CLOSE_BTN: 'modal-close-btn',
    MODAL_ACTION_BTN: 'modal-action-btn',
    MODAL_BODY: 'modal-body',
    SCROLLABLE_BODY: 'scrollable-body',
    MODAL_FOOTER: 'modal-footer',

    // Summary Specific
    SUMMARY_CARD: 'summary-card',
    METRIC_LABEL: 'metric-label',
    METRIC_ROW: 'metric-row',
    METRIC_VALUE_LARGE: 'metric-value-large',
    METRIC_PERCENT_SMALL: 'metric-percent-small',

    SUMMARY_DETAIL_LIST: 'summary-detail-list',
    SUMMARY_DETAIL_ROW: 'summary-detail-row',
    SUMMARY_DETAIL_CODE: 'summary-detail-code',
    SUMMARY_DETAIL_VALUE: 'summary-detail-value',
    CLICKABLE: 'clickable',
    EDIT_BTN: 'edit-btn',
    DELETE_BTN: 'delete-btn',
    SAVE_BTN: 'save-btn',
    NOTIFICATION_BANNER: 'notification-banner',
    FORM_GROUP_RELATIVE: 'form-group-relative',
    WATCHLIST_TRIGGER_TEXT: 'watchlist-trigger-text',
    WATCHLIST_TRIGGER_ICON: 'watchlist-trigger-icon',
    SECTION_TITLE: 'section-title',
    RESEARCH_LINKS_GRID: 'research-links-grid',
    MODAL_STATS_HEADER: 'modal-stats-header',
    CHECK_VISIBLE: 'check-visible',

    // Dropdowns & Interaction
    ACTIVE: 'active',
    SELECTED: 'selected',
    WATCHLIST_ITEM: 'watchlist-item',
    PICKER_ITEM_CONTENT: 'picker-item-content',

    // Watchlist Mode Selection
    MODE_SELECTOR: 'mode-selector',
    SEGMENTED_CONTROL: 'segmented-control',
    SEGMENTED_BUTTON: 'segmented-button',
    CAROUSEL_CHECKBOX: 'carousel-checkbox',
    HIDE_CHECKBOX: 'hide-checkbox',
    CAROUSEL_NAV_BTN: 'carousel-nav-btn',
    CAROUSEL_SELECTED: 'carousel-selected',
    HIDDEN_SELECTED: 'hidden-selected',
    RADIO_DOT: 'radio-dot',

    // Header Layout
    HEADER_INNER: 'header-inner-container',
    HEADER_TOP_ROW: 'header-top-row',
    HEADER_CONTROLS_ROW: 'watchlist-controls-row',
    CONTROLS_LEFT: 'controls-left-group',
    CONTROLS_RIGHT: 'controls-right-group',
    ASX_TOGGLE_TEXT: 'asx-toggle-text',

    // Cash View Specific
    CASH_CONTAINER: 'cash-container',
    CASH_TOTAL_HEADER: 'cash-total-header',
    CASH_CARD: 'cash-card',
    CASH_VALUE_POSITIVE: 'cash-value-positive',
    CASH_VALUE_NEGATIVE: 'cash-value-negative',
    CASH_ASSET_NAME: 'cash-asset-name',
    CASH_ASSET_BALANCE: 'cash-asset-balance',
    CASH_LIST: 'cash-list',
    CASH_VIEW_SINGLE: 'cash-view-single',
    CASH_VIEW_TWO_COLUMN: 'cash-view-two-column',
    CASH_VIEW_THREE_COLUMN: 'cash-view-three-column',
    CASH_BORDER_PREFIX: 'cash-border-',

    // Dashboard / Sparklines
    DASHBOARD_SPARK_CONTAINER: 'dashboard-spark-container',
    RANGE_LABEL: 'range-label',
    RANGE_LOW: 'range-low',
    RANGE_HIGH: 'range-high',
    SPARK_RAIL: 'spark-rail',
    SPARK_MARKER: 'spark-marker',

    // Empty States
    EMPTY_STATE: 'empty-state',

    // Portfolio Summary Borders
    PORTFOLIO_SUMMARY: 'portfolio-summary',
    BORDER_POSITIVE: 'border-positive',
    BORDER_NEGATIVE: 'border-negative',
    BORDER_NEUTRAL: 'border-neutral',

    // Button States
    DISABLED: 'disabled',
    GHOSTED: 'ghosted',

    // ASX Dropdown
    ASX_DROPDOWN_EMPTY: 'asx-dropdown-empty',

    // Modal Show State
    SHOW: 'show',

    // Sidebar Overlay
    SIDEBAR_OVERLAY: 'sidebar-overlay',

    // Search & Live Preview
    SUGGESTION_LIST: 'suggestion-list',
    SUGGESTION_ITEM: 'suggestion-item',
    PRICE_PREVIEW: 'price-preview-panel',
    PREVIEW_PRICE: 'preview-price',
    PREVIEW_CHANGE: 'preview-change',
    PREVIEW_ROW_MAIN: 'preview-row-main',
    PREVIEW_ROW_SUB: 'preview-row-sub',
    PREVIEW_CHANGE_POS: 'preview-change-pos',
    PREVIEW_CHANGE_NEG: 'preview-change-neg',

    // Enhanced Search
    SUGGESTION_CODE: 'search-code-bold',
    SUGGESTION_NAME: 'search-company-name',

    // Modal Refinements
    MODAL_SUBTITLE: 'modal-subtitle',

    // Sidebar & Layout States
    COLLAPSED: 'collapsed',
    EXPANDED: 'expanded',

    // Form Elements
    NOTE_CONTAINER: 'note-container',
    COMMENT_ROW: 'comment-row',

    // Discovery Modal
    DISCOVERY_ITEM: 'discovery-result-item',

    // Cash View Card Structure
    CASH_CARD_LEFT: 'cash-card-left',
    CASH_CARD_RIGHT: 'cash-card-right',
    CASH_LABEL: 'cash-category-label',
    CASH_NAME: 'cash-name-label',
    CASH_BALANCE: 'cash-balance',
    CASH_EYE_ICON: 'cash-eye-icon',

    // Utility Buttons
    ICON_BTN_GHOST: 'icon-btn-ghost',
    RENAME_BTN: 'rename-btn',

    // Stock Details & Form
    DETAIL_CARD: 'detail-card',
    DETAIL_CARD_HEADER: 'detail-card-header',
    SHARE_DETAIL_SECTIONS: 'share-detail-sections',
    DETAIL_ROW: 'detail-row',
    DETAIL_LABEL: 'detail-label',
    DETAIL_VALUE: 'detail-value',
    INVESTMENT_CARD: 'investment-card',
    PRICE_PREVIEW: 'price-preview',
    PREVIEW_ROW_MAIN: 'preview-row-main',
    HIGHLIGHT_ROW: 'highlight-row',
    TEXT_MUTED: 'text-muted',
    COMMENTS_LIST: 'comments-list',
    COMMENT_ITEM: 'comment-item',
    STAT_COL: 'stat-col',
    STAT_LABEL: 'stat-label',
    STAT_VAL: 'stat-val',
    EXTERNAL_LINKS_GRID: 'research-links-grid',
    EXTERNAL_LINK: 'research-link-card',
    LINK_TEXT: 'link-text',
    EXTERNAL_LINK_ALT: 'fa-external-link-alt',
    ACCORDION: 'accordion',
    ACCORDION_ITEM: 'accordion-item',
    ACCORDION_HEADER: 'accordion-header',
    ACCORDION_CONTENT: 'accordion-content',
    FORM_GROUP: 'form-group',
    FORM_CONTROL: 'form-control',
    INPUT_WRAPPER: 'input-wrapper',
    INPUT_ICON: 'input-icon',
    WATCHLIST_TRIGGER: 'watchlist-trigger',
    WATCHLIST_DROPDOWN: 'watchlist-dropdown',
    WATCHLIST_ROW: 'watchlist-row',
    WATCHLIST_NAME: 'watchlist-name',
    WATCHLIST_MEMBERSHIP: 'watchlist-membership',
    STAR_RATING: 'star-rating',
    STAR_ITEM: 'star-item',
    SEGMENTED_CONTROL: 'segmented-control',
    SEGMENTED_BUTTON: 'segmented-button',
    SEGMENTED_TOGGLE: 'segmented-toggle',
    TOGGLE_OPTION: 'toggle-option',
    TOGGLE_GROUP: 'toggle-group',
    TOGGLE_ROW: 'toggle-row',
    NOTES_DARK_BG: 'notes-dark-bg',
    NOTES_FOOTER: 'notes-footer',
    BTN_ADD_SIMPLE: 'btn-add-simple',

    // Search Discovery
    DISCOVERY_SEARCH_AREA: 'discovery-search-area',
    DISCOVERY_INTERFACE: 'discovery-interface',
    DISCOVERY_LIST: 'discovery-list',
    DISCOVERY_DETAIL: 'discovery-detail',
    DISCOVERY_EMPTY_STATE: 'discovery-empty-state',

    // Layout & Flex (Constitution Compliance)
    FLEX_ROW: 'flex-row',
    FLEX_COLUMN: 'flex-column',
    JUSTIFY_BETWEEN: 'justify-between',
    JUSTIFY_END: 'justify-end',
    ALIGN_START: 'align-start',
    ALIGN_CENTER: 'align-center',
    ALIGN_END: 'align-end',
    W_FULL: 'w-full',
    W_AUTO: 'w-auto',
    W_HALF: 'w-half',
    GAP_TINY: 'gap-tiny',
    GAP_SMALL: 'gap-small',
    GAP_MEDIUM: 'gap-medium',
    MT_TINY: 'mt-tiny',
    MT_SMALL: 'mt-small',
    PY_TINY: 'py-tiny',
    PY_SMALL: 'py-small',
    DISPLAY_GRID: 'display-grid',

    // Typography (Constitution Compliance)
    FONT_BOLD: 'font-bold',
    FONT_BOLD: 'font-bold',
    FONT_BOLD_700: 'font-bold700',
    TEXT_XXS: 'text-xxs',
    TEXT_SM: 'text-sm',
    TEXT_MD: 'text-md',
    TEXT_LG: 'text-lg',
    TEXT_XL: 'text-xl',
    TEXT_XXL: 'text-xxl',
    TEXT_LEFT: 'text-left',
    TEXT_CENTER: 'text-center',
    TEXT_RIGHT: 'text-right',
    TEXT_MUTED_LIGHT: 'text-muted-light',
    PRIMARY_TEXT: 'primary-text',
    CHEVRON_ICON: 'chevron-icon',
    ITALIC: 'italic',
    OPACITY_70: 'opacity-70',
    BORDER_NONE: 'border-none',
    BORDER_TOP: 'border-top',
    BG_TRANSPARENT: 'bg-transparent',
    PT_15: 'pt-15',
    PT_15: 'pt-15',
    PREVIEW_PRICE_LARGE: 'preview-price-large',
    PREVIEW_CHANGE_LARGE: 'preview-change-large',
    MB_TINY: 'mb-tiny',
    MB_0: 'mb-0',
    MT_0: 'mt-0',
    MT_AUTO: 'mt-auto',
    PT_0: 'pt-0',
    PT_TINY: 'pt-tiny',
    MB_NEG_10PX: 'mb-neg-10px',
    MB_2PX: 'mb-2px',
    MB_SMALL: 'mb-small',
    MB_4PX: 'mb-4px',
    MB_0PX: 'mb-0px',
    MR_2PX: 'mr-2px',
    MT_4PX: 'mt-4px',
    MT_NEG_2PX: 'mt-neg-2px',
    P_0: 'p-0',
    PT_0: 'pt-0',
    PT_SMALL: 'pt-small',
    PB_4PX: 'pb-4px',
    PY_TINY: 'py-tiny',
    PY_SMALL: 'py-small',
    FLEX_2: 'flex-2',
    ALIGN_BASELINE: 'align-baseline',
    BORDER_TOP_FAINT: 'border-top-faint',
    BORDER_TOP_NONE: 'border-top-none',
    FONT_SIZE_0_7_REM: 'font-size-0-7-rem',
    LINE_HEIGHT_1: 'line-height-1',
    TEXT_OVERFLOW_ELLIPSIS: 'text-overflow-ellipsis',
    OVERFLOW_HIDDEN: 'overflow-hidden',
    WHITESPACE_NOWRAP: 'whitespace-nowrap',
    TEXT_WARNING: 'text-warning',
    MB_2PX: 'mb-2px',
    MB_SMALL: 'mb-small',

    // Detailed Card & Modal Pieces
    CARD_HEADER: 'card-header',
    CARD_HEADER_ROW: 'card-header-row',
    CARD_HEADER_LEFT: 'card-header-left',
    CARD_CODE: 'card-code',
    CARD_PRICE: 'card-price',
    CARD_CHANGE_COL: 'card-change-col',
    CARD_BODY_SECTION: 'card-body-section',
    CARD_CONTENT: 'card-content',
    CODE_PILL: 'code-pill',
    CHANGE_VALUE: 'change-value',
    CHANGE_PERCENT: 'change-percent',
    PORTFOLIO_GRID: 'portfolio-grid',
    DESKTOP_ONLY: 'desktop-only',
    SNAPSHOT_FOOTER: 'snapshot-footer',

    // Metric Pieces
    METRIC_LABEL: 'metric-label',
    METRIC_ROW: 'metric-row',
    METRIC_VALUE_LARGE: 'metric-value-large',
    METRIC_PERCENT_SMALL: 'metric-percent-small',

    // Modal Specifics
    MODAL_HEADER_LEFT: 'modal-header-left',
    MODAL_TITLE: 'modal-title',
    DISPLAY_TITLE: 'display-title',
    MODAL_ACTIONS: 'modal-actions',
    MODAL_ACTION_BTN: 'modal-action-btn',
    MODAL_CLOSE_BTN: 'modal-close-btn',
    MODAL_BODY: 'modal-body',
    SCROLLABLE_BODY: 'scrollable-body',
    SAVE_BTN: 'save-btn',
    EDIT_BTN: 'edit-btn',
    DELETE_BTN: 'delete-btn',

    // Research Modal
    RESEARCH_MODAL_CONTENT: 'research-modal-content',
    RESEARCH_LINK_CARD: 'research-link-card',
    RICH_PREVIEW_CONTAINER: 'rich-preview-container',
    PREVIEW_MAIN_ROW: 'preview-main-row',
    PREVIEW_PRICE: 'preview-price',
    PREVIEW_CHANGE: 'preview-change',
    STATS_GRID: 'stats-grid',
    STAT_ITEM: 'stat-item',
    SECTION_TITLE: 'section-title',
    RESEARCH_LINKS_GRID: 'research-links-grid',

    // Sort Picker Modal
    SORT_PICKER_LIST: 'sort-picker-list',
    SORT_PICKER_ROW: 'sort-picker-row',
    SORT_PICKER_ROW_CONTENT: 'sort-picker-row-content',
    SORT_PICKER_BTN: 'sort-picker-btn',
    SORT_PICKER_MODAL: 'sort-picker-modal',
    SORT_MODAL_TITLE: 'sort-modal-title',
    SORT_MODE_CONTAINER: 'sort-mode-container',
    SORT_MODE_REORDER: 'sort-mode-reorder',
    SORT_MODE_HIDE: 'sort-mode-hide',
    SORT_DIRECTION_TOGGLE: 'sort-direction-toggle',
    SORT_DIR_ASC: 'sort-dir-asc',
    SORT_DIR_DESC: 'sort-dir-desc',
    SORT_PICKER_ICON: 'sort-picker-icon',
    SORT_PICKER_LABEL: 'sort-picker-label',
    SORT_PICKER_DIRECTION: 'sort-picker-direction',
    SORT_ASX_ICON: 'sort-asx-icon',
    SORT_TOGGLE_BTN: 'sort-toggle-btn',


    // ASX Dropdown
    ASX_DROPDOWN_PILL: 'asx-dropdown-pill',
    SORT_ICON: 'sort-icon',
    SORT_ICON_MUTED: 'sort-icon-muted',
    WATCHLIST_PICKER_LIST: 'watchlist-picker-list',
    MODAL_ACTION_BUTTON_FOOTER: 'modal-action-button-footer',

    // Security UI
    SECURITY_LOCK_MODAL: 'security-lock-modal',
    SECURITY_PIN_CONTENT: 'security-pin-content',
    PIN_DISPLAY: 'pin-display',
    PIN_DOT: 'pin-dot',
    PIN_PAD: 'pin-pad',
    PIN_BTN: 'pin-btn',
    PIN_BTN_ICON: 'pin-btn-icon',
    SECURITY_SETTINGS_MODAL: 'security-settings-modal',
    SETTING_ROW: 'setting-row',
    PIN_SETUP_MODAL: 'pin-setup-modal',
    PIN_PAD_MINI: 'pin-pad-mini',
    PIN_SETUP_BTN: 'pin-setup-btn',

    // Modal Size Variants
    MODAL_CONTENT_LARGE: 'modal-content-large',
    MODAL_CONTENT_MEDIUM: 'modal-content-medium',
    MODAL_CONTENT_SMALL: 'modal-content-small',
    MODAL_FULLSCREEN: 'modal-fullscreen',

    // Snapshot UI
    SNAPSHOT_MODAL: 'snapshot-modal',
    SNAPSHOT_GRID: 'snapshot-grid',
    SNAPSHOT_CARD: 'snapshot-card',
    SNAPSHOT_POSITIVE: 'snapshot-positive',
    SNAPSHOT_NEGATIVE: 'snapshot-negative',
    SNAPSHOT_NEUTRAL: 'snapshot-neutral',
    SNAPSHOT_TOGGLE_BTN: 'snapshot-toggle-btn',
    SNAP_COL_LEFT: 'snap-col-left',
    SNAP_COL_CENTER: 'snap-col-center',
    SNAP_COL_RIGHT: 'snap-col-right',
    SNAP_CODE: 'snap-code',
    SNAP_PRICE: 'snap-price',
    SNAP_PERCENT: 'snap-percent',
    SNAP_VALUE_CHANGE: 'snap-value-change',
    TEXT_POS: 'text-pos',
    TEXT_NEG: 'text-neg',

    // Animation Classes
    FADE_OUT: 'fade-out',
    SHAKE: 'shake',

    // Utility Classes
    ML_AUTO: 'ml-auto',


    // Security UI Classes
    APP_LOGO_SECURITY: 'app-logo-security',
    SECURITY_HEADER: 'security-header',
    BIOMETRIC_HINT: 'biometric-hint',
    BIOMETRIC_HINT_DANGER: 'danger',
    BIOMETRIC_HINT_MUTED: 'muted',
    SETTINGS_SECTION: 'settings-section',
    SWITCH: 'switch',
    SLIDER_ROUND: 'slider round',
    TEXT_ACCENT: 'text-accent',

    // Status Classes
    STATUS_PREFIX: 'status-',

    // Code Cell
    CODE_CELL: 'code-cell',

    // View Controls
    VIEW_CONTROLS: 'view-controls',

    // Padding Classes
    P_3: 'p-3',

    // Action Buttons
    VISIBILITY_TOGGLE_BTN: 'visibility-toggle-btn',
    CURSOR_POINTER: 'cursor-pointer',
    RELATIVE: 'relative',
    Z_10: 'z-10',
    TEXT_NORMAL_CASE: 'text-normal-case',
    TEXT_700: 'font-700',
    MR_TINY: 'mr-tiny',
    MX_TINY: 'mx-tiny',
    OPACITY_100: 'opacity-100',
    TEXT_WHITE: 'text-white',
    GAP_6PX: 'gap-6px',
    DISPLAY_FLEX: 'display-flex',
    FONT_1_1_REM: 'font-1-1-rem',

    // Calculator Classes
    CALC_KEYPAD: 'calc-keypad',
    CALC_KEY: 'calc-key',
    CALC_KEY_OPERATOR: 'calc-key-operator',
    CALC_KEY_ACTION: 'calc-key-action',
    CALC_DISPLAY_CONTAINER: 'calc-display-container',
    CALC_DISPLAY_MAIN: 'calc-display-main',
    CALC_DISPLAY_SUB: 'calc-display-sub',
    CALC_RESULT_CARD: 'calc-result-card',

    // Toast Notifications
    TOAST: 'toast',
    HIDING: 'hiding',

    // Global State Classes
    DARK_THEME: 'dark-theme',
    LOGGED_IN: 'logged-in',
    TOAST_SUCCESS: 'toast-success',
    TOAST_ERROR: 'toast-error',
    TOAST_INFO: 'toast-info',
    TOAST_BODY: 'toast-body',
    TOAST_TITLE: 'toast-title',
    TOAST_MESSAGE: 'toast-message',
    TOAST_CLOSE_BTN: 'toast-close-btn',
    TOAST_PROGRESS: 'toast-progress',
    TOAST_ICON: 'toast-icon',

    // Dashboard Specific
    DASHBOARD_CONTAINER: 'dashboard-container',
    DASHBOARD_ROW: 'dashboard-row',
    DASHBOARD_CELL_LEFT: 'dashboard-cell-left',
    DASHBOARD_CELL_RIGHT: 'dashboard-cell-right',
    DASHBOARD_ITEM_NAME: 'dashboard-item-name',
    DASHBOARD_ITEM_SUB: 'dashboard-item-sub',
    DASHBOARD_ITEM_PRICE: 'dashboard-item-price',
    DASHBOARD_ITEM_CHANGE: 'dashboard-item-change',
    DASHBOARD_SPARK_CONTAINER: 'dashboard-spark-rail-container',
    DASHBOARD_TIME_REF: 'dashboard-time-ref',
    DASHBOARD_REORDER_CONTROLS: 'dashboard-reorder-controls',
    REORDER_BTN: 'reorder-btn',
    SPARK_RAIL: 'spark-rail',
    SPARK_MARKER: 'spark-marker',
    RANGE_LABEL: 'range-label',
    RANGE_LOW: 'range-low',
    RANGE_HIGH: 'range-high',
    MARKET_STATUS_ICON: 'market-status-icon',
    REORDER_ACTIVE: 'reorder-active',
    DASHBOARD_ROW_POSITIVE: 'positive',
    DASHBOARD_ROW_NEGATIVE: 'negative',
    VIEW_MODE_COMPACT: 'view-mode-compact',
    VIEW_MODE_SNAPSHOT: 'view-mode-snapshot',
    VIEW_MODE_TABLE: 'view-mode-table',

    // Modal Reorder
    MODAL_REORDER_TITLE: 'modal-reorder-title',
    MODAL_REORDER_CONTROLS: 'modal-reorder-controls',
    MODAL_REORDER_BTN: 'modal-reorder-btn',
    EXTRA_GRAPHIC: 'sidebar-extra-graphic',

    // Splash Screen System
    SPLASH_LOGO: 'splash-logo',
    SPLASH_SYSTEM: 'splash-system',
    SPLASH_IS_EXITING: 'is-exiting',
    SPLASH_ENTER: 'enter',
    SPLASH_LOOP: 'loop',
    SPLASH_EXIT: 'exit',

    // Notification UI (Registry Compliance Fix)
    FILTER_CHIP: 'filter-chip',
    CHIP_NEUTRAL: 'chip-neutral',
    CHIP_GREEN: 'chip-green',
    CHIP_RED: 'chip-red',
    CHIP_CUSTOM: 'chip-custom',
    ACCORDION_SECTION: 'accordion-section',
    ACCORDION_HEADER: 'accordion-header',
    ACCORDION_BODY: 'accordion-body',
    ACCORDION_SUBTITLE: 'accordion-subtitle',
    FLOATING_BELL_CONTAINER: 'floating-bell-container',
    FLOATING_BELL_BTN: 'floating-bell-btn',
    NOTIFICATION_CARD_GRID: 'notification-card-grid',
    CARD_UP: 'card-up',
    CARD_DOWN: 'card-down',
    CARD_NEUTRAL: 'card-neutral',
    CARD_TARGET: 'card-target',
    CARD_PINNED: 'card-pinned'
};

export const ANIMATIONS = {
    SLAM_ENTRY: 'slamEntry',
    ZOOM_EXIT: 'zoomExit',
    SHEEN_PASS: 'sheenPass'
};

export const IDS = {
    SPLASH_SCREEN: 'splashScreen',
    SPLASH_SIGN_IN_BTN: 'splashSignInBtn',
    SECURITY_UNLOCK_MODAL: 'security-lock-modal',
    CONTENT_CONTAINER: 'content-container',
    MODAL_CONTAINER: 'modal-container',
    VIEW_CONTROLS: 'view-controls',
    STOCK_DETAILS_MODAL: 'stock-details-modal',
    ADD_SHARE_MODAL: 'add-share-modal',
    NOTIFICATION_MODAL: 'notification-modal',
    DAILY_BRIEFING_MODAL: 'daily-briefing-modal',
    SETTINGS_MODAL: 'settings-modal',
    NOTIFICATION_BADGE: 'notification-badge',
    BTN_NOTIFICATIONS: 'btn-notifications',
    BTN_SIDEBAR_NOTIFICATIONS: 'sidebar-notifications-btn',
    BTN_SETTINGS: 'btn-settings',
    BTN_GENERAL_SETTINGS: 'btn-general-settings',
    SHARE_NAME: 'shareName',
    SUGGESTION_LIST: 'suggestionList',
    PRICE_PREVIEW_PANEL: 'pricePreviewPanel',
    WATCHLIST_TRIGGER: 'watchlistTrigger',
    WATCHLIST_DROPDOWN: 'watchlistDropdown',
    STAR_RATING_CONTROL: 'starRatingControl',
    STAR_RATING_INPUT: 'starRating',
    TARGET_PRICE: 'targetPrice',
    BUY_SELL_CONTROL: 'buySellControl',
    BUY_SELL_INPUT: 'buySell',
    TARGET_DIRECTION_CONTROL: 'targetDirectionControl',
    TARGET_DIRECTION_INPUT: 'targetDirection',
    PORTFOLIO_SHARES: 'portfolioShares',
    PORTFOLIO_AVG_PRICE: 'portfolioAvgPrice',
    DIVIDEND_AMOUNT: 'dividendAmount',
    FRANKING_CREDITS: 'frankingCredits',
    UNFRANKED_YIELD: 'unfrankedYield',
    FRANKED_YIELD: 'frankedYield',
    DYNAMIC_COMMENTS_AREA: 'dynamicCommentsArea',
    BTN_ADD_COMMENT: 'btnAddComment',
    PURCHASE_DATE: 'purchaseDate',
    SAVE_BTN: 'addShareSaveBtn',
    DELETE_BTN: 'addShareDeleteBtn',
    BTN_EDIT_SHARE: 'btn-edit-share',
    BTN_DELETE_SHARE: 'btn-delete-share',

    // Search Discovery
    DISCOVERY_MODAL: 'discovery-modal',
    DISCOVERY_SEARCH_INPUT: 'discoverySearchInput',
    DISCOVERY_RESULT_LIST: 'discoveryResultList',
    DISCOVERY_DETAIL_VIEW: 'discoveryDetailView',
    DISCOVERY_EMPTY_STATE: 'discoveryEmptyState',

    // Watchlist Management
    WATCHLIST_PICKER_MODAL: 'watchlistPickerModal',
    WATCHLIST_PICKER_LIST: 'watchlistPickerList',
    WATCHLIST_SELECTOR: 'watchlist-selector',
    DYNAMIC_WATCHLIST_TITLE: 'dynamicWatchlistTitle',
    APP_HEADER: 'appHeader',
    HAMBURGER_BTN: 'hamburger-btn',
    SIDEBAR: 'sidebar',
    SIDEBAR_OVERLAY: 'sidebar-overlay',
    CLOSE_SIDEBAR: 'close-sidebar',
    ASX_TOGGLE: 'asxCodeButtonsToggle',
    ASX_CONTAINER: 'asx-code-buttons-container',
    SUMMARY_DETAIL_MODAL: 'summary-detail-modal',
    MAIN_CONTENT: 'main-content',
    VIEW_TOGGLE_BTN: 'viewToggleBtn',
    SORT_PICKER_BTN: 'sortPickerBtn',
    SIDEBAR_SEARCH_BTN: 'sidebar-search-btn',
    CASH_ASSET_MODAL: 'cash-asset-modal',
    CASH_CATEGORY_DROPDOWN: 'cash-category-dropdown',
    CATEGORY_TRIGGER: 'category-trigger',
    SORT_DIRECTION_TOGGLE: 'sortDirectionToggle',
    SORT_DIR_ASC: 'sortDirAsc',
    SORT_DIR_DESC: 'sortDirDesc',
    CATEGORY_LABEL_TEXT: 'category-label-text',
    CATEGORY_OPTIONS: 'category-options',
    ASSET_NAME: 'asset-name',
    ASSET_BALANCE: 'asset-balance',
    COMMENTS_LIST_CONTAINER: 'comments-list-container',
    MODAL_SUBTITLE: 'modalSubtitle',
    RENAME_WATCHLIST_BTN: 'rename-watchlist-btn',
    CURRENT_WATCHLIST_NAME: 'current-watchlist-name',

    // Watchlist Mode Selection
    WATCHLIST_MODE_CONTAINER: 'watchlist-mode-container',
    MODE_REARRANGE: 'mode-rearrange',
    MODE_CAROUSEL: 'mode-carousel',
    MODE_HIDE: 'mode-hide',

    // Carousel Navigation
    CAROUSEL_PREV_BTN: 'carousel-prev-btn',
    CAROUSEL_NEXT_BTN: 'carousel-next-btn',

    // Create Watchlist Modal
    BTN_CREATE_WATCHLIST: 'btn-create-watchlist',
    MODAL_CREATE_WATCHLIST: 'modal-create-watchlist',
    CREATE_WL_INPUT: 'create-watchlist-input',
    CREATE_WL_SUBMIT: 'create-wl-submit-btn',

    // Edit Watchlist Modal
    BTN_EDIT_WATCHLIST: 'btn-edit-watchlist',
    MODAL_EDIT_WATCHLIST: 'modal-edit-watchlist',
    EDIT_WL_INPUT: 'edit-watchlist-input',
    EDIT_WL_SUBMIT: 'edit-wl-submit-btn',
    EDIT_WL_DELETE: 'edit-wl-delete-btn',

    // Security IDS
    SECURITY_UNLOCK_MODAL: 'securityUnlockModal',
    SECURITY_SETTINGS_MODAL: 'securitySettingsModal',

    // Dashboard & Status
    MARKET_STATUS_DOT: 'marketStatusDot',
    MARKET_STATUS_TEXT: 'marketStatusText',
    PIN_SETUP_MODAL: 'pin-setup-modal',
    PIN_TOGGLE: 'pin-toggle',
    BIO_TOGGLE: 'bio-toggle',
    LOCK_RESUME_TOGGLE: 'lock-resume-toggle',
    PIN_SETUP_AREA: 'pin-setup-area',
    CHANGE_PIN_BTN: 'change-pin-btn',
    BTN_SECURITY_SETTINGS: 'btn-security-settings',

    // Core UI / Global Actions
    SPLASH_SCREEN: 'splashScreen',
    SPLASH_SIGN_IN_BTN: 'splashSignInBtn',
    LOGOUT_BTN: 'logout-btn',
    AUTH_BTN: 'auth-btn',
    SIDEBAR_ADD_BTN: 'add-share-sidebar-btn',
    HEADER_ADD_BTN: 'add-item-btn',
    RELOAD_BTN: 'hardReloadBtn',
    LIVE_REFRESH_TIME: 'live-refresh-time',

    // Data Management
    DOWNLOAD_DATA_BTN: 'btn-download-data',
    DELETE_DATA_BTN: 'btn-delete-data',
    DOWNLOAD_DATA_MODAL: 'modal-download-data',
    DOWNLOAD_CSV_BTN: 'download-csv-btn',
    DOWNLOAD_PDF_BTN: 'download-pdf-btn',

    // Modal Registry
    ASX_DROPDOWN_MENU: 'asx-dropdown-menu',
    ADD_STOCK_SUBMIT: 'add-stock-submit',
    NEW_STOCK_CODE: 'new-stock-code',

    // Research & Sort Modals
    RESEARCH_MODAL: 'research-modal',
    SORT_PICKER_MODAL: 'sort-picker-modal',
    SORT_MODE_CONTAINER: 'sort-mode-container',
    SORT_MODE_REORDER: 'sort-mode-reorder',
    SORT_MODE_HIDE: 'sort-mode-hide',
    RESEARCH_ADD_BTN: 'researchAddBtn',
    SORT_PICKER_LIST: 'sortPickerList',

    // Setup Elements
    SETUP_TITLE: 'setup-title',
    SETUP_SUBTITLE: 'setup-subtitle',

    // Calculators
    BTN_OPEN_CALCULATOR: 'btn-open-calculator',
    CALCULATOR_MODAL: 'calculator-modal',
    CALC_TAB_DIVIDEND: 'calc-tab-dividend',
    LIVE_REFRESH_BTN: 'live-refresh-btn',
    LIVE_REFRESH_TIME: 'live-refresh-time',
    CALC_TAB_SIMPLE: 'calc-tab-simple',
    CALC_CONTENT_DIVIDEND: 'calc-content-dividend',
    CALC_CONTENT_SIMPLE: 'calc-content-simple',
    CALC_DIV_AMOUNT: 'calc-div-amount',
    CALC_DIV_PRICE: 'calc-div-price',
    CALC_DIV_FRANKING: 'calc-div-franking',
    CALC_DIV_INVESTMENT: 'calc-div-investment',
    CALC_RESULT_YIELD_NET: 'calc-result-yield-net',
    CALC_RESULT_YIELD_GROSS: 'calc-result-yield-gross',
    CALC_RESULT_EST_RETURN: 'calc-result-est-return',
    CALC_RESULT_INV_UNFRANKED: 'calc-result-inv-unfranked',
    CALC_RESULT_INV_FRANKED: 'calc-result-inv-franked',

    // Toast
    TOAST_CONTAINER: 'toast-container',
    CALC_RESULT_INV_GROSS: 'calc-result-inv-gross',
    CALC_RESULT_GROSS: 'calc-result-gross',
    CALC_RESULT_TAX: 'calc-result-tax',
    CALC_Display: 'calc-display',

    // Dashboard IDs
    DASHBOARD_REORDER_TOGGLE: 'dashboard-reorder-toggle',

    // Modal Titles for Reorder
    WATCHLIST_MODAL_TITLE: 'watchlist-modal-title',
    SORT_MODAL_TITLE: 'sort-modal-title'
};
