/**
 * WidgetPanel.js
 * Renders the configurable Widget Panel surface.
 * Consumes data from AppState and NotificationStore.
 *
 * DESIGN NOTE: Cash items with category === 'shares' are EXCLUDED from cash
 * calculations to prevent double-counting (they mirror AppState.data.shares).
 * This matches PortfolioChartUI.js logic.
 */
import { AppState } from '../state/AppState.js';
import { notificationStore } from '../state/NotificationStore.js';
import { CSS_CLASSES, IDS, EVENTS, UI_ICONS, DASHBOARD_SYMBOLS, CASH_WATCHLIST_ID } from '../utils/AppConstants.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';

export const WIDGET_MODULES = [
    { id: 'day_performance', label: 'Day Performance', description: "Today's portfolio gain/loss detail", icon: 'fa-calendar-day', renderer: '_renderDayPerformance', default: true },
    { id: 'portfolio_summary', label: 'Portfolio Summary', description: 'Total wealth with shares vs cash breakdown', icon: 'fa-wallet', renderer: '_renderPortfolioSummary', default: true },
    { id: 'top_holdings', label: 'Top Holdings', description: 'Your largest positions by value', icon: 'fa-trophy', renderer: '_renderTopHoldings', default: false },
    { id: 'dashboard_snapshot', label: 'Dashboard Snapshot', description: 'Live indexes, currencies & commodities', icon: 'fa-globe', renderer: '_renderDashboardSnapshot', default: true },
    { id: 'notifications', label: 'Latest Alerts', description: 'Most recent price alerts & notifications', icon: 'fa-bell', renderer: '_renderNotifications', default: true },
    { id: 'top_movers', label: 'Biggest Movers', description: 'Top daily % movers in your portfolio', icon: 'fa-bolt', renderer: '_renderTopMovers', default: false },
    { id: 'cash_breakdown', label: 'Cash & Assets', description: 'Breakdown of non-share assets', icon: 'fa-piggy-bank', renderer: '_renderCashBreakdown', default: false },
    { id: 'watchlist_summary', label: 'Watchlists', description: 'Quick view of your watchlists', icon: 'fa-list', renderer: '_renderWatchlistSummary', default: false },
    { id: 'market_snapshot', label: 'Market Snapshot', description: 'ASX 200 index overview', icon: 'fa-chart-line', renderer: '_renderMarketSnapshot', default: false }
];

// Dashboard name map for readable labels
const DASHBOARD_NAMES = {
    '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq',
    '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', '^HSI': 'Hang Seng',
    '^STOXX50E': 'Euro Stoxx 50', '^AXJO': 'ASX 200', '^AORD': 'All Ords',
    '^VIX': 'VIX', 'XJO': 'ASX 200', 'XKO': 'ASX 300',
    'GC=F': 'Gold', 'SI=F': 'Silver', 'CL=F': 'Crude Oil',
    'BZ=F': 'Brent Oil', 'HG=F': 'Copper', 'TIO=F': 'Iron Ore',
    'BTC-USD': 'BTC/USD', 'BTC-AUD': 'BTC/AUD',
    'AUDUSD=X': 'AUD/USD', 'AUDGBP=X': 'AUD/GBP', 'AUDEUR=X': 'AUD/EUR',
    'AUDJPY=X': 'AUD/JPY', 'AUDTHB=X': 'AUD/THB', 'AUDNZD=X': 'AUD/NZD',
    'USDTHB=X': 'USD/THB', 'YAP=F': 'SPI 200', 'NICKEL': 'Nickel',
    'XAUUSD=X': 'Gold Spot', 'XAGUSD=X': 'Silver Spot'
};

// Categorize dashboard symbols for smart formatting
const INDEX_SYMBOLS = new Set([
    '^AXJO', '^AORD', '^GSPC', '^DJI', '^IXIC', '^FTSE', '^N225', '^HSI',
    '^STOXX50E', '^VIX', 'XJO', 'XKO', 'XAO', 'YAP=F'
]);
const CURRENCY_SYMBOLS = new Set([
    'AUDUSD=X', 'AUDGBP=X', 'AUDEUR=X', 'AUDJPY=X', 'AUDTHB=X', 'AUDNZD=X',
    'USDTHB=X', 'XAUUSD=X', 'XAGUSD=X'
]);

export class WidgetPanel {
    constructor() {
        this.container = null;
        this.isInitialized = false;
    }

    init(container) {
        if (this.isInitialized) return;
        this.container = container;
        console.log('[WidgetPanel] Initializing with container:', container);
        this.container.classList.add(CSS_CLASSES.WIDGET_PANEL);
        this.container.classList.add('widget-hidden');
        this.isInitialized = true;
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener(EVENTS.REFRESH_WATCHLIST, () => this.render());
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, () => this.render());
        document.addEventListener(EVENTS.WIDGET_CONFIG_CHANGED, () => this.render());
    }

    toggle() {
        if (!this.container) {
            console.error('[WidgetPanel] No container found during toggle');
            return;
        }

        const isHidden = this.container.classList.toggle('widget-hidden');
        console.log('[WidgetPanel] Toggle State:', isHidden ? 'HIDDEN' : 'VISIBLE');

        if (!isHidden) {
            document.body.appendChild(this.container);
            this.container.className = 'widget-panel';

            const isMobile = window.innerWidth <= 540;
            const panelWidth = isMobile ? '100vw' : '380px';

            this.container.style.cssText = `
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: fixed !important;
                top: 60px !important;
                ${isMobile ? 'left: 0 !important; right: 0 !important;' : 'right: 0 !important; left: auto !important;'}
                width: ${panelWidth} !important;
                height: calc(100vh - 60px) !important;
                background: var(--modal-content-bg, var(--card-bg, #1a1a2e)) !important;
                z-index: 20000 !important;
                border-left: ${isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)'} !important;
                box-shadow: -10px 0 50px rgba(0,0,0,0.8) !important;
                pointer-events: all !important;
                transform: translateX(0) !important;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            `;
            this.render();
        } else {
            this.container.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (this.container.classList.contains('widget-hidden')) {
                    this.container.style.display = 'none';
                }
            }, 300);
        }
    }

    render() {
        if (!this.container) return;
        if (this.container.classList.contains('widget-hidden')) {
            console.log('[WidgetPanel] Skipping render (hidden)');
            return;
        }

        console.log('[WidgetPanel] Starting render...');
        const config = AppState.preferences?.widgetConfig || this._getDefaultConfig();

        // Compute portfolio day change direction for header gradient (matches portfolio title bar)
        const holdings = this._getPortfolioHoldings().filter(h => h.price > 0);
        const totalDayChange = holdings.reduce((acc, h) => acc + h.dayChangeValue, 0);
        const trendClass = holdings.length > 0
            ? (totalDayChange >= 0 ? 'trend-up-bg' : 'trend-down-bg')
            : '';

        let html = `
            <div class="${CSS_CLASSES.WIDGET_HEADER} ${trendClass}">
                <h3 class="${CSS_CLASSES.WIDGET_TITLE}">Quick Glance</h3>
                <div class="widget-header-actions">
                    <button class="widget-settings-btn" id="widget-settings-trigger" title="Widget Settings">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="widget-close-btn" id="widget-close-trigger" title="Close Panel">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
            </div>
            <div class="${CSS_CLASSES.WIDGET_CONTENT} widget-scroll-container ${trendClass}">
        `;

        config.forEach(item => {
            if (!item.visible) return;
            const module = WIDGET_MODULES.find(m => m.id === item.id);
            if (module && typeof this[module.renderer] === 'function') {
                const headerActions = module.id === 'dashboard_snapshot'
                    ? `<i class="fas fa-pen widget-dashboard-edit-btn" title="Edit Selection" onclick="document.dispatchEvent(new CustomEvent('open-widget-dashboard-picker'))" style="margin-left: auto; cursor: pointer; opacity: 0.7; font-size: 0.8rem;"></i>`
                    : '';

                html += `
                    <section class="${CSS_CLASSES.WIDGET_SECTION}" data-module-id="${module.id}">
                        <div class="widget-section-header">
                            <i class="fas ${module.icon}"></i>
                            <span>${module.label}</span>
                            ${headerActions}
                        </div>
                        <div class="${CSS_CLASSES.WIDGET_CONTENT}">
                            ${this[module.renderer]()}
                        </div>
                    </section>
                `;
            }
        });

        html += `</div>`;
        this.container.innerHTML = html;

        this._bindUIActions();
        this._initClocks(); // Initialize market status clocks

        if (!AppState.data?.shares?.length && !AppState.data?.cash?.length) {
            this.container.innerHTML += `<div class="widget-empty-prompt">Add assets to populate your widget.</div>`;
        }
    }

    _bindUIActions() {
        const closeBtn = this.container?.querySelector('#widget-close-trigger');
        if (closeBtn) closeBtn.onclick = () => this.toggle();

        const settingsBtn = this.container?.querySelector('#widget-settings-trigger');
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                document.dispatchEvent(new CustomEvent('open-widget-config'));
            };
        }
    }

    _getDefaultConfig() {
        return WIDGET_MODULES.map(m => ({ id: m.id, visible: m.default }));
    }

    // ──────────────────────────────────────────
    // Shared Helpers
    // ──────────────────────────────────────────

    _getPortfolioHoldings() {
        const shares = AppState.data.shares || [];
        const livePrices = AppState.livePrices || new Map();
        const dedupMap = new Map();

        shares.forEach(s => {
            const units = parseFloat(s.portfolioShares) || 0;
            if (units <= 0) return;
            const code = (s.shareName || s.code || '').trim().toUpperCase();
            if (!code) return;

            const existing = dedupMap.get(code);
            if (existing) {
                existing.units += units;
            } else {
                dedupMap.set(code, { code, units });
            }
        });

        const results = [];
        dedupMap.forEach(item => {
            const liveData = livePrices.get(item.code) || {};
            const price = parseFloat(liveData.live) || 0;
            const change = parseFloat(liveData.change) || 0;
            const pctChange = parseFloat(liveData.pctChange) || 0;

            results.push({
                code: item.code,
                units: item.units,
                price,
                value: price * item.units,
                change,
                pctChange,
                dayChangeValue: change * item.units
            });
        });
        return results;
    }

    _getCashItems() {
        return (AppState.data.cash || []).filter(c => c.category !== 'shares');
    }

    /**
     * Smart price formatter for dashboard items.
     * - Indexes: plain number (no $ sign)
     * - Currencies: 4 decimal places (no $ sign)
     * - Commodities/Crypto: $ with 2dp
     */
    _formatDashboardPrice(code, price) {
        const upCode = code.toUpperCase();
        if (INDEX_SYMBOLS.has(upCode) || INDEX_SYMBOLS.has(code)) {
            return price >= 1000 ? Number(price).toLocaleString('en-AU', { maximumFractionDigits: 1 }) : price.toFixed(1);
        }
        if (CURRENCY_SYMBOLS.has(upCode) || CURRENCY_SYMBOLS.has(code)) {
            return price.toFixed(4);
        }
        return formatCurrency(price);
    }

    // ──────────────────────────────────────────
    // Module Renderers
    // ──────────────────────────────────────────

    _renderDayPerformance() {
        const holdings = this._getPortfolioHoldings().filter(h => h.price > 0);
        if (!holdings.length) return `<div class="widget-empty">No live portfolio data.</div>`;

        const totalValue = holdings.reduce((acc, h) => acc + h.value, 0);
        const totalDayChange = holdings.reduce((acc, h) => acc + h.dayChangeValue, 0);
        const prevTotal = totalValue - totalDayChange;
        const totalPct = prevTotal > 0 ? ((totalDayChange / prevTotal) * 100) : 0;

        const winners = holdings.filter(h => h.pctChange > 0).length;
        const losers = holdings.filter(h => h.pctChange < 0).length;
        const unchanged = holdings.length - winners - losers;

        const dayClass = totalDayChange >= 0 ? 'text-up' : 'text-down';
        const daySign = totalDayChange >= 0 ? '+' : '';

        return `
            <div class="widget-stat-grid">
                <div class="widget-stat-item">
                    <label class="${dayClass}">Day Change</label>
                    <span class="value ${dayClass}">${daySign}${formatCurrency(Math.abs(totalDayChange))}</span>
                </div>
                <div class="widget-stat-item">
                    <label class="${dayClass}">Day Return</label>
                    <span class="value ${dayClass}">${daySign}${totalPct.toFixed(2)}%</span>
                </div>
                <div class="widget-stat-row" style="margin-top: 6px;">
                    <div class="widget-stat-item widget-stat-small">
                        <label>Winners</label>
                        <span class="value text-up">${winners}</span>
                    </div>
                    <div class="widget-stat-item widget-stat-small">
                        <label>Losers</label>
                        <span class="value text-down">${losers}</span>
                    </div>
                    <div class="widget-stat-item widget-stat-small">
                        <label>Flat</label>
                        <span class="value" style="color:var(--text-muted);">${unchanged}</span>
                    </div>
                </div>
            </div>
        `;
    }

    _renderPortfolioSummary() {
        const holdings = this._getPortfolioHoldings();
        const cashItems = this._getCashItems();

        const shareValue = holdings.reduce((acc, h) => acc + h.value, 0);
        const dayChange = holdings.reduce((acc, h) => acc + h.dayChangeValue, 0);
        const cashValue = cashItems.reduce((acc, c) => acc + (parseFloat(c.balance) || 0), 0);

        const totalValue = shareValue + cashValue;
        const prevShareValue = shareValue - dayChange;
        const dayPct = prevShareValue > 0 ? ((dayChange / prevShareValue) * 100) : 0;
        const dayClass = dayChange >= 0 ? 'text-up' : 'text-down';
        const daySign = dayChange >= 0 ? '+' : '';

        return `
            <div class="widget-stat-grid">
                <div class="widget-stat-item">
                    <label>Total Wealth</label>
                    <span class="value">${formatCurrency(totalValue)}</span>
                </div>
                <div class="widget-stat-row">
                    <div class="widget-stat-item widget-stat-small">
                        <label>Shares</label>
                        <span class="value">${formatCurrency(shareValue)}</span>
                    </div>
                    <div class="widget-stat-item widget-stat-small">
                        <label>Cash & Assets</label>
                        <span class="value">${formatCurrency(cashValue)}</span>
                    </div>
                </div>
                ${holdings.length > 0 ? `
                    <div class="widget-day-change ${dayClass}">
                        <span>${daySign}${formatCurrency(Math.abs(dayChange))}</span>
                        <span>(${daySign}${dayPct.toFixed(2)}%) today</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Dashboard Snapshot — personalized selection from dashboard data.
     * Users pick which items to show via widgetDashboardItems preference.
     * Formats intelligently: no $ for indexes, decimals for currencies.
     */
    _renderDashboardSnapshot() {
        const dashboardData = AppState.data.dashboard || [];
        const livePrices = AppState.livePrices || new Map();

        // Get ALL available dashboard codes from backend
        const allCodes = dashboardData
            .map(d => (d.ASXCode || d.code || '').toUpperCase())
            .filter(Boolean);

        // User's PERSONAL selection (stored in preferences)
        // If no selection saved, default to showing first 6 items
        let selectedCodes = AppState.preferences?.widgetDashboardItems;
        if (!selectedCodes || !Array.isArray(selectedCodes) || selectedCodes.length === 0) {
            selectedCodes = allCodes.slice(0, 6);
        }

        // Filter to only codes that actually have live data
        const displayItems = selectedCodes
            .map(c => c.toUpperCase())
            .filter(c => {
                const ld = livePrices.get(c);
                return ld && ld.live;
            });

        if (!displayItems.length) {
            return `<div class="widget-empty">No live dashboard data. <span class="widget-edit-link" style="color:var(--color-accent); cursor:pointer; text-decoration:underline;" onclick="document.dispatchEvent(new CustomEvent('open-widget-dashboard-picker'))">Select items</span></div>`;
        }

        let rows = displayItems.map(code => {
            const liveData = livePrices.get(code) || {};
            const price = parseFloat(liveData.live) || 0;
            const pct = parseFloat(liveData.pctChange) || 0;

            const name = liveData.name || DASHBOARD_NAMES[code] || code;
            const pctClass = pct >= 0 ? 'text-up' : 'text-down';
            const pctSign = pct >= 0 ? '+' : '';
            const priceStr = this._formatDashboardPrice(code, price);

            return `
                <div class="widget-dashboard-row" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${code}' } }))">
                    <div class="widget-dashboard-label">
                        <div class="analog-clock-hook" data-code="${code}" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
                        <span class="widget-dashboard-name">${name}</span>
                    </div>
                    <span class="widget-dashboard-price">${priceStr}</span>
                    <span class="widget-dashboard-change ${pctClass}">${pctSign}${pct.toFixed(2)}%</span>
                </div>
            `;
        }).join('');

        return rows;
    }

    _renderNotifications() {
        try {
            const local = notificationStore?.getLocalAlerts?.() || { pinned: [], fresh: [] };
            const allAlerts = [...(local.pinned || []), ...(local.fresh || [])];

            // Prioritize hit targets and show all targets + up to 4 other alerts
            const targets = allAlerts.filter(a => (a.intent || '').toLowerCase() === 'target');
            const others = allAlerts.filter(a => (a.intent || '').toLowerCase() !== 'target').slice(0, 4);
            const alerts = [...targets, ...others];

            if (!alerts.length) return `<div class="widget-empty">No active alerts.</div>`;

            return alerts.map(a => {
                const message = this._formatAlertMessage(a);
                const pct = Number(a.pct || a.pctChange || a.dayChangePercent || 0);
                const signClass = pct >= 0 ? 'text-up' : 'text-down';
                const code = a.code || '???';
                return `
                    <div class="widget-notification-item" style="cursor: pointer;" onclick="if('${code}' !== '???') document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${code}' } }))">
                        <div class="analog-clock-hook" data-code="${code}" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
                        <span class="code ${signClass}">${code}</span>
                        <span class="message">${message}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('[WidgetPanel] Notification render failed:', e);
            return `<div class="widget-empty">Error loading alerts.</div>`;
        }
    }

    _formatAlertMessage(a) {
        const intent = (a.intent || '').toLowerCase();
        const pct = (a.pct || a.pctChange || a.dayChangePercent || 0);
        const sign = pct >= 0 ? '+' : '';
        const pctStr = `${sign}${Number(pct).toFixed(2)}%`;
        if (intent === 'target') return `Hit target ${formatCurrency(a.target)}`;
        if (intent === 'hilo') return `Hit ${a.type === 'high' ? '52W High' : '52W Low'} (${pctStr})`;
        return `Moved ${pctStr}`;
    }

    _renderMarketSnapshot() {
        const livePrices = AppState.livePrices;
        if (!livePrices) return `<div class="widget-empty">Market data unavailable.</div>`;

        const xjo = livePrices.get('^AXJO') || livePrices.get('XJO');
        if (!xjo || typeof xjo.live === 'undefined') return `<div class="widget-empty">Market data unavailable.</div>`;

        const pct = Number(xjo.pctChange || 0);
        const changeClass = pct >= 0 ? 'text-up' : 'text-down';
        const sign = pct >= 0 ? '+' : '';
        return `
            <div class="widget-market-row">
                <div class="analog-clock-hook" data-code="^AXJO" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
                <span>ASX 200</span>
                <span class="value">${Number(xjo.live || 0).toLocaleString('en-AU', { maximumFractionDigits: 1 })}</span>
                <span class="change ${changeClass}">${sign}${pct.toFixed(2)}%</span>
            </div>
        `;
    }

    _renderTopMovers() {
        const holdings = this._getPortfolioHoldings().filter(h => h.price > 0);
        if (!holdings.length) return `<div class="widget-empty">No holdings with live data.</div>`;

        const sorted = [...holdings].sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange)).slice(0, 5);
        return sorted.map(h => {
            const pctClass = h.pctChange >= 0 ? 'text-up' : 'text-down';
            const pctSign = h.pctChange >= 0 ? '+' : '';
            return `
                <div class="widget-holding-row" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${h.code}' } }))">
                    <div class="analog-clock-hook" data-code="${h.code}" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
                    <span class="code">${h.code}</span>
                    <span class="value">${formatCurrency(h.price)}</span>
                    <span class="change ${pctClass}">${pctSign}${h.pctChange.toFixed(2)}%</span>
                </div>
            `;
        }).join('');
    }

    _renderTopHoldings() {
        const holdings = this._getPortfolioHoldings()
            .filter(h => h.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        if (!holdings.length) return `<div class="widget-empty">No holdings to display.</div>`;
        return holdings.map(h => {
            const pctClass = h.pctChange >= 0 ? 'text-up' : 'text-down';
            const pctSign = h.pctChange >= 0 ? '+' : '';
            return `
                <div class="widget-holding-row" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${h.code}' } }))">
                    <div class="analog-clock-hook" data-code="${h.code}" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
                    <span class="code">${h.code}</span>
                    <span class="value">${formatCurrency(h.value)}</span>
                    <span class="change ${pctClass}">${pctSign}${h.pctChange.toFixed(2)}%</span>
                </div>
             `;
        }).join('');
    }

    _renderCashBreakdown() {
        const cashItems = this._getCashItems();
        if (!cashItems.length) return `<div class="widget-empty">No cash assets.</div>`;

        const totalCash = cashItems.reduce((acc, c) => acc + (parseFloat(c.balance) || 0), 0);
        return `
            <div class="widget-cash-total" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.REQUEST_QUICK_NAV}', { detail: { watchlistId: '${CASH_WATCHLIST_ID}', sortField: 'pctChange', sortDirection: 'desc' } }))">
                <label style="cursor: pointer;">Total Cash & Assets</label>
                <span class="value">${formatCurrency(totalCash)}</span>
            </div>
            ${cashItems.slice(0, 5).map(c => `
                <div class="widget-cash-row" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.REQUEST_QUICK_NAV}', { detail: { watchlistId: '${CASH_WATCHLIST_ID}', sortField: 'pctChange', sortDirection: 'desc' } }))">
                    <span class="label">${c.name || c.category || 'Unnamed'}</span>
                    <span class="value">${formatCurrency(parseFloat(c.balance) || 0)}</span>
                </div>
            `).join('')}
        `;
    }

    _renderWatchlistSummary() {
        const watchlists = AppState.data.watchlists || [];
        const allShares = AppState.data.shares || [];
        const userWatchlists = watchlists.filter(w => {
            const name = (w.name || '').toLowerCase();
            return name !== 'all shares' && name !== 'portfolio' && name !== 'cash & assets' && name !== 'dashboard';
        });

        if (!userWatchlists.length) return `<div class="widget-empty">No custom watchlists.</div>`;

        return userWatchlists.slice(0, 5).map(w => {
            const icon = w.icon || 'fa-list';
            const count = allShares.filter(s => {
                if (Array.isArray(s.watchlistIds)) return s.watchlistIds.includes(w.id);
                return s.watchlistId === w.id;
            }).length;

            return `
                <div class="widget-holding-row" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.REQUEST_QUICK_NAV}', { detail: { watchlistId: '${w.id}', sortField: 'pctChange', sortDirection: 'desc' } }))">
                    <span class="code" style="display:flex; align-items:center; gap:8px;">
                        <i class="fas ${icon}" style="font-size:0.75rem; color:var(--color-accent); width:16px; text-align:center;"></i>
                        ${w.name}
                    </span>
                    <span class="value" style="color:var(--text-muted); font-size:0.8rem;">${count} stock${count !== 1 ? 's' : ''}</span>
                </div>
            `;
        }).join('');
    }

    /**
     * initializes analog clocks for all rows.
     */
    _initClocks() {
        // Cleanup old clocks
        if (this.rowClocks) {
            this.rowClocks.forEach(c => c.destroy());
        }
        this.rowClocks = [];

        import('./AnalogClock.js').then(({ AnalogClock }) => {
            const clockHooks = this.container.querySelectorAll('.analog-clock-hook');
            clockHooks.forEach(el => {
                const code = el.dataset.code;
                if (!code) return;
                const isOpen = this._isMarketOpen(code);
                const clock = new AnalogClock(el, isOpen);
                clock.init();
                this.rowClocks.push(clock);
            });
        });
    }

    /**
     * Approximates market status for dashboard symbols.
     * @private
     */
    _isMarketOpen(code) {
        const now = new Date();
        const utcDay = now.getUTCDay();
        const utcHours = now.getUTCHours();
        const utcMins = now.getUTCMinutes();
        const utcTotal = utcHours * 60 + utcMins;

        const sydneyParts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Australia/Sydney',
            hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false
        }).formatToParts(now);
        const getPart = (type) => sydneyParts.find(p => p.type === type).value;
        const sydHour = parseInt(getPart('hour'));
        const sydMin = parseInt(getPart('minute'));
        const sydTotal = sydHour * 60 + sydMin;
        const sydDay = getPart('weekday');
        const isSydWeekend = (sydDay === 'Sat' || sydDay === 'Sun');

        // Market Logic
        if (code.includes('BTC') || code.includes('ETH')) return true;
        const isASX = code.includes('.AX') || ['^AXJO', '^AXKO', '^AORD', 'XJO', 'XKO', 'XAO', 'YAP=F'].includes(code);
        if (isASX) {
            if (isSydWeekend) return false;
            return sydTotal >= (10 * 60) && sydTotal < (16 * 60 + 10);
        }
        if (code.includes('FTSE') || code.includes('STOXX') || code.includes('EU50')) {
            if (utcDay === 0 || utcDay === 6) return false;
            return utcTotal >= (8 * 60) && utcTotal < (16 * 60 + 30);
        }
        if (code.includes('HSI') || code.includes('N225')) {
            if (utcDay === 0 || utcDay === 6) return false;
            return utcTotal >= (0 * 60 + 30) && utcTotal < (8 * 60);
        }
        if (['INX', '.DJI', '.IXIC', '^GSPC', '^DJI', '^IXIC', '^VIX'].includes(code)) {
            if (utcDay === 0 || utcDay === 6) return false;
            return utcTotal >= (14 * 60 + 30) && utcTotal < (21 * 60);
        }
        const FOREX_CODES = ['AUDUSD', 'AUDTHB', 'AUDGBP', 'AUDEUR', 'AUDJPY', 'AUDNZD', 'USDTHB'];
        const isForex = code.includes('=X') || FOREX_CODES.includes(code);
        if (isForex) {
            if (utcDay === 6) return false;
            if (utcDay === 0 && utcTotal < (22 * 60)) return false;
            if (utcDay === 5 && utcTotal > (22 * 60)) return false;
            return true;
        }
        const COMMODITY_CODES = ['GCW00', 'SIW00', 'BZW00', 'NICKEL'];
        const isFutures = code.includes('=F') || code.includes('-F') || COMMODITY_CODES.includes(code);
        if (isFutures) {
            if (utcDay === 6) return false;
            if (utcDay === 0 && utcTotal < (23 * 60)) return false;
            if (utcDay === 5 && utcTotal > (21 * 60)) return false;
            if (utcTotal >= (21 * 60) && utcTotal < (22 * 60)) return false;
            return true;
        }
        if (isSydWeekend) return false;
        return sydTotal >= (10 * 60) && sydTotal < (16 * 60);
    }
}

export const widgetPanel = new WidgetPanel();
