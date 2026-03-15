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
import { CSS_CLASSES, IDS, EVENTS, UI_ICONS, UI_LABELS, DASHBOARD_SYMBOLS, DASHBOARD_LINKS, CASH_WATCHLIST_ID } from '../utils/AppConstants.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { LinkHelper } from '../utils/LinkHelper.js';

export const WIDGET_MODULES = [
    { id: 'day_performance', label: 'Day Performance', description: "Today's portfolio gain/loss detail", icon: 'fa-calendar-day', renderer: '_renderDayPerformance', default: true },
    { id: 'dashboard_snapshot', label: 'Dashboard Snapshot', description: 'Live indexes, currencies & commodities', icon: 'fa-globe', renderer: '_renderDashboardSnapshot', default: true },
    { id: 'portfolio_summary', label: 'Portfolio Summary', description: 'Total wealth with shares vs cash breakdown', icon: 'fa-wallet', renderer: '_renderPortfolioSummary', default: true },
    { id: 'market_movers', label: 'Market Movers', description: 'Top 6 biggest movers on the ASX', icon: 'fa-rocket', renderer: '_renderMarketMovers', default: true },
    { id: 'notifications', label: 'Latest Alerts', description: 'Most recent price alerts & notifications', icon: 'fa-bell', renderer: '_renderNotifications', default: true },
    { id: 'top_movers', label: 'Watchlist Movers', description: 'Top daily % movers in your portfolio', icon: 'fa-bolt', renderer: '_renderTopMovers', default: false },
    { id: 'top_holdings', label: 'Top Holdings', description: 'Your largest positions by value', icon: 'fa-trophy', renderer: '_renderTopHoldings', default: false },
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
        this.overlay = null;
        this.isInitialized = false;
    }

    init(container) {
        if (this.isInitialized) return;
        this.container = container;
        console.log('[WidgetPanel] Initializing with container:', container);
        this.container.classList.add(CSS_CLASSES.WIDGET_PANEL);
        this.container.classList.add('widget-hidden');

        this._setupOverlay();

        this.isInitialized = true;
        this._bindEvents();
    }

    _setupOverlay() {
        if (this.overlay) return;
        this.overlay = document.createElement('div');
        this.overlay.id = 'widget-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 19999;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease, visibility 0.3s;
            pointer-events: auto;
            visibility: hidden;
        `;
        this.overlay.addEventListener('click', () => {
            console.log('[WidgetPanel] Overlay clicked - closing panel');
            this.toggle();
        });
        document.body.appendChild(this.overlay);
    }

    _bindEvents() {
        document.addEventListener(EVENTS.REFRESH_WATCHLIST, () => this.render());
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, () => this.render());
        document.addEventListener(EVENTS.WIDGET_CONFIG_CHANGED, () => this.render());

        // Keyboard support (Escape to close)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container && !this.container.classList.contains('widget-hidden')) {
                this.toggle();
            }
        });
    }

    toggle() {
        if (!this.container) {
            console.error('[WidgetPanel] No container found during toggle');
            return;
        }

        const isHidden = this.container.classList.toggle('widget-hidden');
        console.log('[WidgetPanel] Toggle State:', isHidden ? 'HIDDEN' : 'VISIBLE');

        if (!isHidden) {
            // OPENING
            if (this.overlay) {
                this.overlay.style.display = 'block';
                requestAnimationFrame(() => {
                    this.overlay.style.opacity = '1';
                    this.overlay.style.visibility = 'visible';
                });
            }

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
            // CLOSING
            if (this.overlay) {
                this.overlay.style.opacity = '0';
                this.overlay.style.visibility = 'hidden';
                setTimeout(() => {
                    if (this.container.classList.contains('widget-hidden')) {
                        this.overlay.style.display = 'none';
                    }
                }, 300);
            }

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
            return;
        }

        const config = AppState.preferences?.widgetConfig || this._getDefaultConfig();
        const stats = this._getPortfolioStats();
        const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
        const dateStr = new Date().toLocaleDateString('en-AU', dateOptions);

        const getIndexHtml = (code, fallbackCode) => {
            const item = AppState.livePrices?.get(code) || AppState.livePrices?.get(fallbackCode) || { pctChange: 0 };
            const pct = item.pctChange || 0;
            const isUp = pct >= 0;
            const colorVar = isUp ? 'var(--color-positive)' : 'var(--color-negative)';
            return `<span style="color: ${colorVar} !important; font-weight: 700;">${isUp ? '+' : ''}${pct.toFixed(2)}%</span>`;
        };

        const asxHtml = getIndexHtml('^AXJO', 'XJO');
        const spxHtml = getIndexHtml('^GSPC', 'INX');

        // Styles for deep gradients
        const positiveGradient = 'linear-gradient(135deg, rgba(6, 255, 79, 0.45) 0%, rgba(10, 10, 12, 1) 100%)';
        const negativeGradient = 'linear-gradient(135deg, rgba(255, 49, 49, 0.45) 0%, rgba(10, 10, 12, 1) 100%)';
        const activeGradient = stats.isUp ? positiveGradient : negativeGradient;

        let html = `
            <!-- HEADER -->
            <div class="${CSS_CLASSES.BRIEFING_HEADER}" style="padding: 24px 20px 10px 20px; background: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent);">
                <div class="${CSS_CLASSES.BRIEFING_TITLE_ROW}" style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 style="font-size: 1.6rem; margin: 0; font-weight: 700; color: #fff;">${this._getGreeting()}</h1>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <button class="widget-settings-btn" id="widget-settings-trigger" title="Settings" style="background: transparent; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 1.1rem;">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="widget-close-btn" id="widget-close-trigger" title="Close" style="background: transparent; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 1.1rem;">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>
                <div class="${CSS_CLASSES.BRIEFING_DATE}" style="margin-top: 4px; opacity: 0.6; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${dateStr}</div>
            </div>

            <div class="${CSS_CLASSES.W_FULL} widget-scroll-container" style="flex: 1; overflow-y: auto; padding-bottom: 30px;">
                
                <!-- 1. PORTFOLIO HERO -->
                <div class="widget-section-wrapper" style="padding: 12px 16px;">
                    <div class="widget-hero-card ${stats.isUp ? 'is-up' : 'is-down'}" id="widget-portfolio-hero" 
                         style="width: 100%; min-height: auto; padding: 18px; background: ${activeGradient}; box-shadow: 0 4px 20px rgba(0,0,0,0.4); cursor: pointer; border: none !important;">
                        
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; letter-spacing: 1.5px; color: rgba(255,255,255,0.8); font-weight: 800; margin-top: 2px;">
                                ASX TRACKER <img src="gemini-icon.png" style="width: 14px; height: 14px;">
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end;">
                                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                                    <span style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase;">ASX 200</span>
                                    <span style="font-size: 0.9rem; min-width: 65px; text-align: right;">${asxHtml}</span>
                                </div>
                                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                                    <span style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase;">S&P 500</span>
                                    <span style="font-size: 0.9rem; min-width: 65px; text-align: right;">${spxHtml}</span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 5px 0 0 0;">
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase;">My Portfolio</div>
                            <div style="font-size: 2rem; font-weight: 800; color: #fff; line-height: 1.1; margin-bottom: 12px;">
                                ${stats.dayChange >= 0 ? '+' : ''}${formatCurrency(stats.dayChange)}
                            </div>
                            
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase;">Day Change</div>
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 4px;">
                                <div style="font-size: 1.4rem; font-weight: 800; color: ${stats.isUp ? 'var(--color-positive)' : 'var(--color-negative)'}; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas ${stats.isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
                                    ${stats.dayPct.toFixed(2)}%
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px; font-size: 0.85rem; font-weight: 700;">
                                    <span style="color: var(--color-positive); display: flex; align-items: center; gap: 4px;">
                                        ${stats.winners} <i class="fas fa-arrow-trend-up" style="font-size: 0.7rem;"></i>
                                    </span>
                                    <span style="color: var(--color-negative); display: flex; align-items: center; gap: 4px;">
                                        ${stats.losers} <i class="fas fa-arrow-trend-down" style="font-size: 0.7rem;"></i>
                                    </span>
                                    <span style="color: rgba(255, 255, 255, 0.4);">${stats.unchanged}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        `;

        // 2. DYNAMIC MODULES
        const activeModules = WIDGET_MODULES.filter(module => {
            const userPref = config.find(c => c.id === module.id);
            return userPref ? userPref.visible : module.default;
        });

        html += activeModules.map(module => {
            // Hero-promoted modules are already handled or removed
            if (['portfolio_summary', 'day_performance'].includes(module.id)) return '';

            const content = this[module.renderer]();
            if (!content || (typeof content === 'string' && content.includes('empty'))) return '';

            return `
                <div class="widget-section-wrapper" style="padding: 8px 16px;">
                    <div class="widget-section-card" style="background: ${activeGradient}; padding: 18px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: none !important;">
                        <div class="widget-section-header" style="padding: 0 18px 15px 18px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; letter-spacing: 1.5px; color: rgba(255,255,255,0.8); font-weight: 800;">
                                <i class="fas ${module.icon}" style="font-size: 0.8rem; opacity: 0.9;"></i>
                                <span style="text-transform: uppercase;">${module.label}</span>
                            </div>
                            ${module.id === 'dashboard_snapshot' ? '<i class="fas fa-pen" style="cursor: pointer; opacity: 0.4; font-size: 0.8rem;" onclick="document.dispatchEvent(new CustomEvent(\'open-widget-dashboard-picker\'))"></i>' : ''}
                        </div>
                        <div class="widget-section-content">
                            ${content}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        html += `</div>`; // Close scroll container
        this.container.innerHTML = html;

        this._bindUIActions();
        this._initClocks();
    }

    _bindUIActions() {
        if (!this.container) return;

        const closeBtn = this.container.querySelector('#widget-close-trigger');
        if (closeBtn) closeBtn.onclick = () => this.toggle();

        const settingsBtn = this.container.querySelector('#widget-settings-trigger');
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                document.dispatchEvent(new CustomEvent('open-widget-config'));
            };
        }

        const heroCard = this.container.querySelector('#widget-portfolio-hero');
        if (heroCard) {
            heroCard.onclick = () => {
                this.toggle();
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_PORTFOLIO_VIEW));
            };
        }
    }

    _getDefaultConfig() {
        return WIDGET_MODULES.map(m => ({ id: m.id, visible: m.default }));
    }

    // ──────────────────────────────────────────
    // Shared Helpers
    // ──────────────────────────────────────────

    _getPortfolioStats() {
        const holdings = this._getPortfolioHoldings();
        const cashItems = this._getCashItems();

        const shareValue = holdings.reduce((acc, h) => acc + h.value, 0);
        const dayChange = holdings.reduce((acc, h) => acc + h.dayChangeValue, 0);
        const cashValue = cashItems.reduce((acc, c) => acc + (parseFloat(c.balance) || 0), 0);

        const totalValue = shareValue + cashValue;
        const prevShareValue = shareValue - dayChange;
        const dayPct = prevShareValue > 0 ? ((dayChange / prevShareValue) * 100) : 0;

        // Winners/Losers/Flat Logic
        const liveHoldings = holdings.filter(h => h.price > 0);
        const winners = liveHoldings.filter(h => h.pctChange > 0).length;
        const losers = liveHoldings.filter(h => h.pctChange < 0).length;
        const unchanged = liveHoldings.length - winners - losers;

        return {
            totalValue,
            shareValue,
            cashValue,
            dayChange,
            dayPct,
            isUp: dayChange >= 0,
            winners,
            losers,
            unchanged
        };
    }

    _getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return UI_LABELS.GOOD_MORNING || 'Good Morning';
        if (hour < 17) return UI_LABELS.GOOD_AFTERNOON || 'Good Afternoon';
        return UI_LABELS.GOOD_EVENING || 'Good Evening';
    }

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
                <div class="widget-stat-row" style="justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 12px;">
                    <div class="widget-stat-item" style="align-items: flex-start;">
                        <label class="${dayClass}">Day Change</label>
                        <span class="value ${dayClass}">${daySign}${formatCurrency(Math.abs(totalDayChange))}</span>
                    </div>
                    <div class="widget-stat-item" style="align-items: flex-end; text-align: right;">
                        <label class="${dayClass}">Day Return</label>
                        <span class="value ${dayClass}">${daySign}${totalPct.toFixed(2)}%</span>
                    </div>
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

        const allCodes = dashboardData
            .map(d => (d.ASXCode || d.code || '').toUpperCase())
            .filter(Boolean);

        let selectedCodes = AppState.preferences?.widgetDashboardItems;
        if (!selectedCodes || !Array.isArray(selectedCodes) || selectedCodes.length === 0) {
            selectedCodes = allCodes.slice(0, 6);
        }

        const displayItems = selectedCodes
            .map(c => c.toUpperCase())
            .filter(c => {
                const ld = livePrices.get(c);
                return ld && ld.live;
            });

        if (!displayItems.length) return '<div class="widget-empty">No live snapshot data</div>';

        return displayItems.map(code => {
            const liveData = livePrices.get(code) || {};
            const price = parseFloat(liveData.live) || 0;
            const pct = parseFloat(liveData.pctChange) || 0;
            const pctClass = pct >= 0 ? 'text-up' : 'text-down';
            const pctSign = pct >= 0 ? '+' : '';
            const priceStr = this._formatDashboardPrice(code, price);
            const url = DASHBOARD_LINKS[code] || LinkHelper.getFinanceUrl(code);
            const displayName = DASHBOARD_NAMES[code] || code;

            return `
                <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; cursor: pointer;" 
                     onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${code}' } }))">
                    <div style="display: flex; align-items: center; flex: 1; text-align: left; gap: 8px;">
                        <div class="analog-clock-hook" data-code="${code}" style="width: 14px; height: 14px; flex-shrink: 0;"></div>
                        <span class="code" style="font-weight: 800; font-size: 1.05rem; color: #fff;">${displayName}</span>
                    </div>
                    <div style="flex: 2; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                        <span class="value" style="font-weight: 700; font-size: 1.1rem; color: #fff;">${priceStr}</span>
                        <span class="change ${pctClass}" style="font-weight: 700; font-size: 0.9rem; min-width: 65px; text-align: right;">${pctSign}${pct.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    _renderMarketMovers() {
        if (!notificationStore) return '<div class="widget-empty">Data unavailable</div>';
        const alerts = notificationStore.getGlobalAlerts(true);
        if (!alerts || !alerts.movers) return '<div class="widget-empty">No movers found</div>';

        const allMovers = [...(alerts.movers.up || []), ...(alerts.movers.down || [])];
        const enriched = allMovers.map(m => {
            const live = AppState.livePrices?.get(m.code);
            return live ? { ...m, live: live.live || m.live, pctChange: live.pctChange || m.pctChange || 0 } : m;
        });

        const seen = new Set();
        const unique = enriched.filter(m => !seen.has(m.code) && seen.add(m.code));
        unique.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
        const top6 = unique.slice(0, 6);

        if (top6.length === 0) return '<div class="widget-empty">No movers found</div>';

        return top6.map(m => {
            const isUp = m.pctChange >= 0;
            const colorClass = isUp ? 'text-up' : 'text-down';
            return `
                <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; cursor: pointer;"
                     onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${m.code}' } }))">
                    <span class="code" style="font-weight: 800; font-size: 0.85rem; color: #fff; flex: 1; text-align: left;">${m.code}</span>
                    <div style="flex: 2; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                        <span class="price" style="font-weight: 700; font-size: 0.85rem; color: #fff;">${formatCurrency(m.live)}</span>
                        <span class="change ${colorClass}" style="font-weight: 700; font-size: 0.8rem; min-width: 55px; text-align: right;">${isUp ? '+' : ''}${m.pctChange.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    _renderNotifications() {
        try {
            const local = notificationStore?.getLocalAlerts?.() || { pinned: [], fresh: [] };
            const allAlerts = [...(local.pinned || []), ...(local.fresh || [])];
            const filteredAlerts = allAlerts.filter(a => {
                const intent = (a.intent || '').toLowerCase();
                const code = (a.code || '').toUpperCase();
                return intent !== 'mover' && intent !== 'up' && intent !== 'down' && intent !== 'brief' && !code.includes('MORNING');
            });

            const targets = filteredAlerts.filter(a => (a.intent || '').toLowerCase() === 'target');
            const others = filteredAlerts.filter(a => (a.intent || '').toLowerCase() !== 'target').slice(0, 4);
            const alerts = [...targets, ...others];

            if (!alerts.length) return '<div class="widget-empty">No active alerts</div>';

            return alerts.map(a => {
                const message = this._formatAlertMessage(a);
                const pct = Number(a.pct || a.pctChange || a.dayChangePercent || 0);
                const signClass = pct >= 0 ? 'text-up' : 'text-down';
                const code = a.code || '???';
                return `
                    <div class="widget-notification-item" style="padding: 10px 18px; cursor: pointer;" onclick="if('${code}' !== '???') document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${code}' } }))">
                        <span class="code ${signClass}" style="font-weight: 800; margin-right: 10px;">${code}</span>
                        <span class="message" style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">${message}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            return '<div class="widget-empty">Alerts unavailable</div>';
        }
    }

    _formatAlertMessage(a) {
        const intent = (a.intent || '').toLowerCase();
        const pct = (a.pct || a.pctChange || a.dayChangePercent || 0);
        const sign = pct >= 0 ? '+' : '';
        const pctStr = `${sign}${Number(pct).toFixed(2)}%`;
        if (intent === 'target') return `Hit target ${formatCurrency(a.target)}`;
        if (intent === 'hilo') return `52wk ${a.type === 'high' ? 'High' : 'Low'} (${pctStr})`;
        return `Moved ${pctStr}`;
    }

    _renderMarketSnapshot() {
        if (!AppState.livePrices) return '<div class="widget-empty">Market data unavailable</div>';
        const xjo = AppState.livePrices.get('^AXJO') || AppState.livePrices.get('XJO');
        if (!xjo || typeof xjo.live === 'undefined') return '<div class="widget-empty">Market data unavailable</div>';

        const pct = Number(xjo.pctChange || 0);
        const changeClass = pct >= 0 ? 'text-up' : 'text-down';
        const sign = pct >= 0 ? '+' : '';
        const url = DASHBOARD_LINKS['^AXJO'] || LinkHelper.getFinanceUrl('^AXJO');

        return `
            <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; cursor: pointer;" onclick="window.open('${url}', '_blank', 'noopener,noreferrer')">
                <span style="font-weight: 800; font-size: 0.85rem; color: #fff; flex: 1; text-align: left;">ASX 200</span>
                <div style="flex: 2; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; font-size: 0.85rem; color: #fff;">${Number(xjo.live || 0).toLocaleString('en-AU', { maximumFractionDigits: 1 })}</span>
                    <span class="${changeClass}" style="font-weight: 700; font-size: 0.8rem; min-width: 55px; text-align: right;">${sign}${pct.toFixed(2)}%</span>
                </div>
            </div>
        `;
    }

    _renderTopMovers() {
        const local = notificationStore?.getLocalAlerts?.() || { pinned: [], fresh: [] };
        const allAlerts = [...(local.pinned || []), ...(local.fresh || [])];
        let movers = allAlerts.filter(a => {
            const intent = (a.intent || '').toLowerCase();
            return intent === 'mover' || intent === 'up' || intent === 'down';
        });

        if (!movers.length) return '<div class="widget-empty">No significant movers</div>';

        const sorted = movers.sort((a, b) => {
            const pctA = Math.abs(Number(a.pct || a.pctChange || a.dayChangePercent || 0));
            const pctB = Math.abs(Number(b.pct || b.pctChange || b.dayChangePercent || 0));
            return pctB - pctA;
        }).slice(0, 5);

        return sorted.map(h => {
            const code = h.code || '???';
            let price = h.price || 0;
            let pct = Number(h.pct || h.pctChange || h.dayChangePercent || 0);

            if (AppState.livePrices?.has(code)) {
                const live = AppState.livePrices.get(code);
                price = Number(live.live || live.price || price);
                pct = Number(live.dayChangePercent ?? live.pctChange ?? live.pct ?? pct);
            }

            const pctClass = pct >= 0 ? 'text-up' : 'text-down';
            return `
                <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; cursor: pointer;"
                     onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${code}' } }))">
                    <span class="code" style="font-weight: 800; font-size: 0.85rem; color: #fff; flex: 1; text-align: left;">${code}</span>
                    <div style="flex: 2; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                        <span class="value" style="font-weight: 700; font-size: 0.85rem; color: #fff;">${formatCurrency(price)}</span>
                        <span class="change ${pctClass}" style="font-weight: 700; font-size: 0.8rem; min-width: 55px; text-align: right;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    _renderTopHoldings() {
        const holdings = this._getPortfolioHoldings()
            .filter(h => h.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        if (!holdings.length) return '<div class="widget-empty">No portfolio holdings</div>';
        return holdings.map(h => {
            const pctClass = h.pctChange >= 0 ? 'text-up' : 'text-down';
            return `
                <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; cursor: pointer;"
                     onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${h.code}' } }))">
                    <span class="code" style="font-weight: 800; font-size: 0.85rem; color: #fff; flex: 1; text-align: left;">${h.code}</span>
                    <div style="flex: 2; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                        <span class="value" style="font-weight: 700; font-size: 0.85rem; color: #fff;">${formatCurrency(h.value)}</span>
                        <span class="change ${pctClass}" style="font-weight: 700; font-size: 0.8rem; min-width: 55px; text-align: right;">${h.pctChange >= 0 ? '+' : ''}${h.pctChange.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    _renderCashBreakdown() {
        const cashItems = this._getCashItems();
        if (!cashItems.length) return '<div class="widget-empty">No cash assets</div>';

        const totalCash = cashItems.reduce((acc, c) => acc + (parseFloat(c.balance) || 0), 0);
        return `
            <div class="widget-row" style="padding: 10px 18px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; font-size: 0.85rem; color: #fff; flex: 1; text-align: left;">Total Assets</span>
                    <span style="font-weight: 700; font-size: 0.9rem; color: var(--color-accent); flex: 1; text-align: right;">${formatCurrency(totalCash)}</span>
                </div>
            </div>
            ${cashItems.slice(0, 5).map(c => `
                <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; cursor: pointer;" 
                     onclick="document.dispatchEvent(new CustomEvent('${EVENTS.REQUEST_QUICK_NAV}', { detail: { watchlistId: '${CASH_WATCHLIST_ID}' } }))">
                    <span class="label" style="font-size: 0.8rem; color: rgba(255,255,255,0.6); flex: 1; text-align: left;">${c.name || c.category}</span>
                    <span class="value" style="font-weight: 600; font-size: 0.85rem; color: #fff; flex: 1; text-align: right;">${formatCurrency(parseFloat(c.balance) || 0)}</span>
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

        if (!userWatchlists.length) return '<div class="widget-empty">No watchlists found</div>';

        return userWatchlists.slice(0, 5).map(w => {
            const count = allShares.filter(s => {
                if (Array.isArray(s.watchlistIds)) return s.watchlistIds.includes(w.id);
                return s.watchlistId === w.id;
            }).length;

            return `
                <div class="widget-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; cursor: pointer;"
                     onclick="document.dispatchEvent(new CustomEvent('${EVENTS.REQUEST_QUICK_NAV}', { detail: { watchlistId: '${w.id}' } }))">
                    <span class="code" style="font-weight: 800; font-size: 0.85rem; color: #fff; flex: 1; text-align: left;">${w.name}</span>
                    <span class="value" style="font-weight: 700; font-size: 0.8rem; color: rgba(255,255,255,0.5); flex: 1; text-align: right;">${count} Stock${count !== 1 ? 's' : ''}</span>
                    <span style="margin-left: 10px; text-align: right;"><i class="fas fa-chevron-right" style="font-size: 0.7rem; opacity: 0.3;"></i></span>
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

    /**
     * Binds a long-hold trigger to an element to open the widget panel.
     * Replaces the old Market Pulse behavior on specific elements.
     * @param {HTMLElement} element 
     */
    static bindTrigger(element) {
        if (!element) return;

        let pressTimer;
        let hasTriggered = false;
        const LONG_PRESS_DURATION = 600; // Consistent with other app long-presses

        const startHandler = (e) => {
            hasTriggered = false;
            if (e.target.closest('button') || e.target.closest('a')) return;

            pressTimer = setTimeout(() => {
                hasTriggered = true;
                if (navigator.vibrate) navigator.vibrate(50);

                // Trigger the widget panel
                document.dispatchEvent(new CustomEvent(EVENTS.WIDGET_TOGGLE));
            }, LONG_PRESS_DURATION);
        };

        const cancelHandler = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        const clickBlocker = (e) => {
            if (hasTriggered) {
                e.preventDefault();
                e.stopImmediatePropagation();
                hasTriggered = false;
                return false;
            }
        };

        // UI Feedback & Prevents browser default menus
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';
        element.style.webkitTouchCallout = 'none';
        element.style.touchAction = 'manipulation';

        element.addEventListener('mousedown', startHandler);
        element.addEventListener('touchstart', startHandler, { passive: true });
        element.addEventListener('mouseup', cancelHandler);
        element.addEventListener('mouseleave', cancelHandler);
        element.addEventListener('touchend', cancelHandler);
        element.addEventListener('touchmove', cancelHandler);
        element.addEventListener('click', clickBlocker, true);
    }
}

export const widgetPanel = new WidgetPanel();
