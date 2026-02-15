import { CSS_CLASSES, EVENTS, UI_ICONS, IDS, CASH_WATCHLIST_ID, KANGAROO_ICON_SVG } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { StateAuditor } from '../state/StateAuditor.js';
import { notificationStore } from '../state/NotificationStore.js'; // FIX: Interact with Global Store
import { ToastManager } from './ToastManager.js';
import { VisualSettingsHUD } from './VisualSettingsHUD.js';
import { AuthService } from '../auth/AuthService.js';



export class SidebarCommandCenter {
    constructor(containerSelector) {
        this.containerSelector = containerSelector;
        this.container = null;
    }

    init() {
        this.container = document.querySelector(this.containerSelector);
        if (!this.container) {
            console.error('SidebarCommandCenter: Container not found', this.containerSelector);
            return;
        }

        this._injectStyles(); // FIX: Global Visual Overrides (Sidebar Glow + Chart Opacity)
        this.render();
        this._bindEvents();

        // REACTIVE UPDATE: Keep Control Center Live
        if (StateAuditor && typeof StateAuditor.on === 'function') {
            StateAuditor.on('PRICES_UPDATED', () => {
                // Only re-render if the sidebar is actually in the DOM and likely visible
                if (this.container && document.body.contains(this.container)) {
                    this.render();
                }
            });
        }

        // --- NOTIFICATION UPDATE: Listen for badge hits ---
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, () => {
            if (this.container && document.body.contains(this.container)) {
                this.render();
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('sidebar-fix-styles')) return;
        const style = document.createElement('style');
        style.id = 'sidebar-fix-styles';
        style.textContent = `
            /* SIDEBAR VISUAL FIXES - DEEP DIVE */
            
            /* 1. Global Reset for Tap Highlights & Focus Rings */
            /* This kills the yellow/blue browser default rings */
            *:focus, *:focus-visible, *:active {
                outline: none !important;
                -webkit-tap-highlight-color: transparent !important;
            }

            /* 2. Target specific elements to ensure clean state */
            .command-grid-item, .sentiment-tile, .sidebar-list-item, .nav-item {
                outline: none !important;
                border: none !important;
                box-shadow: none !important;
            }

            /* 3. Innovative Selection: Coffee Glow + Scale (No Background) */
            .command-grid-item:active, .command-grid-item.active, .command-grid-item:hover {
                background-color: transparent !important;
                /* Text Glow - Fixed high intensity as requested */
                text-shadow: 0 0 12px rgba(var(--color-accent-rgb), 0.8) !important;
                /* Text Color - Variable opacity (controlled by slider) */
                color: rgba(var(--color-accent-rgb), var(--accent-opacity, 1)) !important;
                transform: scale(1.05); 
                cursor: pointer;
            }

            .command-grid-item .command-icon {
                transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.2s;
            }

            /* Active State Indicator */
            .command-grid-item:active .command-icon, .command-grid-item:hover .command-icon {
                filter: drop-shadow(0 0 6px var(--color-accent)); 
            }

            /* CHART OPACITY FIX */
            .portfolio-card-chart-bg canvas,
            .portfolio-card-chart-bg {
                opacity: var(--card-chart-opacity, 1) !important;
                transition: opacity 0.25s ease-out;
            }
        `;
        document.head.appendChild(style);
    }

    render() {
        // Market Data Logic (Portfolio Centric)
        const isMarketOpen = this._checkIfMarketOpen();
        const marketStatusText = isMarketOpen ? 'MARKET OPEN' : 'MARKET CLOSED';
        const marketStatusClass = isMarketOpen ? 'status-open' : 'status-closed';

        // Calculate Portfolio Performance (Sum of all owned shares)
        let totalVal = 0;
        let totalDayChange = 0;
        let hasHoldings = false;

        const shares = AppState.data.shares || [];
        shares.forEach(share => {
            if (share.units > 0) {
                hasHoldings = true;
                const live = AppState.livePrices.get(share.code) || {};
                const currentPrice = live.live !== undefined ? live.live : (share.lastPrice || 0);
                const prevClose = live.prevClose !== undefined ? live.prevClose : (share.previousClose || share.lastPrice || 0);

                const val = share.units * currentPrice;
                const prevVal = share.units * prevClose;

                totalVal += val;
                totalDayChange += (val - prevVal);
            }
        });

        // Fallback to ASX index if no holdings
        let pctChange = 0;
        if (hasHoldings && totalVal > 0) {
            // Estimate previous total value to get % change
            const prevTotal = totalVal - totalDayChange;
            pctChange = prevTotal > 0 ? (totalDayChange / prevTotal) * 100 : 0;
        } else {
            const asxData = AppState.livePrices.get('^AXJO') || AppState.livePrices.get('XJO') || { live: 0, pctChange: 0 };
            pctChange = asxData.pctChange || 0;
        }

        const formattedPct = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';

        // Sentiment Logic
        let sentimentTrendClass = 'neutral';
        let sentimentText = 'Portfolio Stable';
        let sentimentIcon = 'fa-chart-line';

        if (pctChange >= 0.5) {
            sentimentTrendClass = 'bullish';
            sentimentText = 'Strong Growth';
        } else if (pctChange > 0) {
            sentimentTrendClass = 'bullish';
            sentimentText = 'Positive Gains';
        } else if (pctChange <= -0.5) {
            sentimentTrendClass = 'bearish';
            sentimentText = 'Heavy Pullback';
            sentimentIcon = 'fa-chart-area';
        } else if (pctChange < 0) {
            sentimentTrendClass = 'bearish';
            sentimentText = 'Slight Dip';
        }

        const isCashMode = AppState.watchlist.id === CASH_WATCHLIST_ID;
        const addLabel = isCashMode ? 'Add Asset' : 'Add Share';
        const metricsLabel = hasHoldings ? 'TOTAL RETURN (DAY)' : 'ASX 200 (NO DATA)';

        // DYNAMIC ICON RETRIEVAL: Get the "Jumping Kangaroo" from the Sidebar Header (as requested)
        // We clone it to inject into the buttons.
        const sourceKangaroo = document.querySelector('.sidebar-kangaroo-icon');
        let kangarooSVG = KANGAROO_ICON_SVG; // Fallback

        if (sourceKangaroo) {
            // Clone and strip classes to avoid layout positioning issues from original
            const clone = sourceKangaroo.cloneNode(true);
            clone.removeAttribute('class');
            clone.removeAttribute('height');
            clone.removeAttribute('width');
            clone.setAttribute('fill', 'currentColor'); // Ensure it takes color
            clone.style.cssText = 'width: 100%; height: 100%;'; // Reset styles
            kangarooSVG = clone.outerHTML;
        } else {
            kangarooSVG = kangarooSVG.replace('<svg', '<svg style="width: 100%; height: 100%;"');
        }

        // Notification Count Logic: TOTAL Count (Read + Unread)
        // FIX: Use Central Store for Truth
        let notifCount = 0;
        try {
            if (notificationStore && typeof notificationStore.getBadgeCounts === 'function') {
                const counts = notificationStore.getBadgeCounts();
                notifCount = counts.total || 0;
                this.annCount = counts.announcements || 0;
            } else {
                // Fallback if store not ready
                const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) notifCount = parsed.length;
                }
                this.annCount = 0;
            }
        } catch (e) { /* ignore */ }

        // Smart Theme Name Logic
        // 1. Check Presets
        const borders = AppState.preferences.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };
        const sides = borders.sides || [0, 0, 0, 0];
        const gs = typeof AppState.preferences.gradientStrength === 'number' ? AppState.preferences.gradientStrength : 0.25;

        const checkPreset = (pSides, pThick, pOp) => {
            return sides.every((v, i) => v === pSides[i]) &&
                borders.thickness === pThick &&
                Math.abs(gs - pOp) < 0.05;
        };

        let currentThemeName = 'Subtle'; // Default fallback

        if (checkPreset([0, 0, 0, 1], 3, 0.0)) currentThemeName = 'Minimal';
        else if (checkPreset([0, 0, 0, 1], 3, 0.25)) currentThemeName = 'Classic';
        else if (checkPreset([1, 1, 1, 1], 2, 0.85)) currentThemeName = 'Rich';
        else {
            // Not a preset, use Tone Name
            if (gs <= 0.05) currentThemeName = 'None';
            else if (gs <= 0.15) currentThemeName = 'Muted';
            else if (gs <= 0.3) currentThemeName = 'Subtle';
            else if (gs <= 0.5) currentThemeName = 'Light';
            else if (gs <= 0.75) currentThemeName = 'Medium';
            else currentThemeName = 'Strong';
        }

        const watchlistCount = (AppState.data.watchlists || []).length;
        const shareCount = (AppState.data.shares || []).length;

        this.container.innerHTML = `
            <div class="command-center-inner">
                <!-- Market Sentiment Tile (Triggers Daily Brief) -->
                <div class="sentiment-tile glass-effect ${sentimentTrendClass}" id="act-tile-pulse" role="button" title="View Daily Briefing">
                    <div class="sentiment-header">
                        <span class="market-label">${metricsLabel.replace(' (NO DATA)', '')}</span>
                        <!-- Market Status: Text Only (Red/Green), No Background -->
                        <span class="market-status" style="background: transparent !important; color: ${isMarketOpen ? 'var(--color-positive)' : 'var(--color-negative)'} !important; padding: 0;">${marketStatusText}</span>
                    </div>
                    <div class="sentiment-body">
                        <div class="sentiment-trend">
                            <i class="fas ${sentimentIcon}"></i>
                            <span class="trend-value">${formattedPct}</span>
                        </div>
                        <div class="sentiment-subtext" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <span>${sentimentText}</span>
                            <!-- Coffee Cup Icon (Daily Link) -->
                             <i class="fas fa-coffee" style="font-size: 0.9rem; opacity: 0.7; color: var(--color-accent);"></i>
                        </div>
                    </div>
                </div>

                <!-- Section: Utilities -->
                <div class="command-section">
                    <h4 class="command-section-title">UTILITIES</h4>
                    <div class="command-grid icon-only-grid">
                        <button class="command-grid-item" id="nav-calculator" title="Calculators">
                            <i class="fas fa-calculator command-icon"></i>
                        </button>
                        <button class="command-grid-item" id="nav-announcements" title="Announcements" style="position: relative;">
                            <i class="fas fa-bullhorn command-icon"></i>
                            ${this.annCount > 0 ? `<span class="notification-badge" style="position: absolute; top: 8px; right: 5px; font-size: 0.7rem; color: var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 800; z-index: 10;">${this.annCount}</span>` : ''}
                        </button>
                        <button class="command-grid-item" id="nav-visuals" title="Visual Style">
                            <i class="fas fa-palette command-icon"></i>
                        </button>
                        <button class="command-grid-item" id="nav-favorites" title="Favorite Links">
                            <i class="fas fa-link command-icon"></i>
                        </button>
                    </div>
                    <!-- Theme Status Text -->
                    <div style="text-align: center; margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); opacity: 0.8;">
                        Theme: <span style="color: var(--color-accent); font-weight:600;">${currentThemeName}</span>
                    </div>
                </div>

                <!-- Section: Management -->
                <div class="command-section">
                    <h4 class="command-section-title">MANAGEMENT</h4>
                    <div class="command-grid icon-only-grid">
                        <button class="command-grid-item" id="act-add" title="${addLabel}" style="position: relative;">
                            <i class="fas fa-plus-circle command-icon"></i>
                            ${shareCount > 0 ? `<span class="notification-badge" style="position: absolute; top: 8px; right: 8px; font-size: 0.7rem; color: var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 800; z-index: 10;">${shareCount}</span>` : ''}
                        </button>
                        <button class="command-grid-item" id="act-search" title="Search ASX Symbols">
                            <i class="fas fa-search command-icon"></i>
                        </button>
                        <button class="command-grid-item" id="act-create-wl" title="New Watchlist" style="position: relative;">
                            <i class="fas fa-folder-plus command-icon"></i>
                            ${watchlistCount > 0 ? `<span class="notification-badge" style="position: absolute; top: 8px; right: 14px; font-size: 0.7rem; color: var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 800; z-index: 10;">${watchlistCount}</span>` : ''}
                        </button>
                        <button class="command-grid-item" id="act-edit-wl" title="Edit Watchlist">
                            <div class="composite-icon">
                                <i class="fas fa-folder main-icon command-icon"></i>
                                <i class="fas fa-pen sub-icon" style="font-size: 0.9rem; right: -2px; bottom: -2px;"></i>
                            </div>
                        </button>

                        <button class="command-grid-item" id="nav-notify" title="Notifications" style="position: relative;">
                            <span class="command-icon" style="display: flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem;">
                                ${kangarooSVG}
                            </span>
                            ${notifCount > 0 ? `<span class="notification-badge" style="position: absolute; top: 28px; right: 8px; font-size: 0.7rem; color: var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 800; z-index: 10;">${notifCount}</span>` : ''}
                        </button>
                        <button class="command-grid-item" id="act-alert-config" title="Alert Settings">
                            <div class="composite-icon">
                                <span class="main-icon command-icon" style="display: flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem;">
                                    ${kangarooSVG}
                                </span>
                                <i class="fas fa-cog sub-icon" style="font-size: 0.9rem; right: 6px; bottom: 4px;"></i>
                            </div>
                        </button>
                        <button class="command-grid-item" id="nav-reload" title="Reload App">
                            <i class="fas fa-sync-alt command-icon"></i>
                        </button>
                        <button class="command-grid-item" id="nav-settings" title="App Settings">
                            <i class="fas fa-cog command-icon"></i>
                        </button>
                    </div>

                    <!-- Layout Footer: Notification Count & Auth -->
                    <div class="command-center-footer" style="margin-top: 24px;">

                        ${AppState.user ? `
                            <button id="sidebar-logout-btn" class="sidebar-btn" style="color: #ff3131; background: transparent; border: none; padding: 12px 0; font-size: 1rem; font-weight: 600; justify-content: flex-start; gap: 12px; width: 100%;">
                                <i class="fas fa-sign-out-alt" style="color: #ff3131; width: 20px; text-align: center;"></i> Logout
                            </button>
                        ` : `
                            <button id="sidebar-login-btn" class="sidebar-btn" style="color: var(--color-accent); background: transparent; border: none; padding: 12px 0; font-size: 1rem; font-weight: 600; justify-content: flex-start; gap: 12px; width: 100%;">
                                <i class="fab fa-google" style="color: var(--color-accent); width: 20px; text-align: center;"></i> Login
                            </button>
                        `}
                    </div>
                </div>
            </div>

        `;
    }

    _bindEvents() {
        // ROBUST DELEGATION: Intercept ALL clicks within the container
        this.container.addEventListener('click', (e) => {
            const target = e.target.closest('button, .sentiment-tile');
            if (!target) return;

            // Stop propagation to prevent AppController generic "close sidebar" listener 
            // from firing before we are ready or interfering.
            e.stopPropagation();
            e.preventDefault();

            const id = target.id;
            // console.log('[SidebarCommandCenter] Click intercepted for:', id);

            // Execute action after delay to allow visual feedback / sidebar transition
            setTimeout(() => {
                this._handleAction(id);
                // Manually close sidebar if needed, though usually the dispatched events 
                // or controller actions will handle it.
                // However, since we stopped propagation, we might need to trigger closure explicitly
                // if the action itself doesn't. 
                // Most actions (like opening a modal) will handle z-index or overlay, 
                // but checking if we need to close the sidebar.
            }, 150);
        });
    }

    _handleAction(id) {
        switch (id) {
            case 'act-tile-pulse':
                // Top Tile -> Opens Daily Brief (User Request)
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent(EVENTS.SHOW_DAILY_BRIEFING));
                break;

            case 'nav-announcements':
                // Grid Button -> Opens Announcements (Market Stream)
                this._closeSidebar();
                const announceBtn = document.getElementById('sidebar-market-stream-btn');
                if (announceBtn) {
                    announceBtn.click();
                } else {
                    // Fallback to controller if button not found
                    import('./MarketIndexController.js').then(({ marketIndexController }) => {
                        marketIndexController.openModal();
                    });
                }
                break;

            case 'nav-calculator':
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent('open-calculator'));
                break;


            case 'nav-settings':
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_GENERAL_SETTINGS));
                break;

            case 'nav-notify':
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS, { detail: { source: 'sidebar' } }));
                break;

            case 'act-alert-config':
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_SETTINGS));
                break;

            case 'nav-favorites':
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_FAVORITE_LINKS));
                break;

            case 'nav-reload':
                // Reloads do not need to strictly close sidebar first, but cleaner UI.
                this._closeSidebar();
                setTimeout(() => window.location.reload(true), 300);
                break;

            case 'nav-visuals':
                // Live Visual Studio Mode
                this._closeSidebar();
                VisualSettingsHUD.show();
                break;

            case 'sidebar-login-btn':
                // Auth: Login
                this._closeSidebar();
                AuthService.signIn();
                break;

            case 'sidebar-logout-btn':
                // Auth: Logout
                this._closeSidebar();
                AuthService.signOut();
                break;


            case 'act-add':
                this._closeSidebar();
                if (AppState.controller) {
                    const isCash = AppState.watchlist.id === CASH_WATCHLIST_ID;
                    if (isCash) {
                        AppState.controller.modalController.handleOpenCashModal(null);
                    } else {
                        AppState.controller.modalController.openAddShareModal(null);
                    }
                } else {
                    // Fallback
                    document.getElementById('add-share-sidebar-btn')?.click();
                }
                break;

            case 'act-search':
                this._closeSidebar();
                document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_OPEN_DISCOVERY_MODAL));
                break;

            case 'act-create-wl':
                this._closeSidebar();
                document.getElementById(IDS.BTN_CREATE_WATCHLIST)?.click();
                break;

            case 'act-edit-wl':
                this._closeSidebar();
                document.getElementById(IDS.BTN_EDIT_WATCHLIST)?.click();
                break;
        }
    }

    _checkIfMarketOpen() {
        const now = new Date();
        const sydneyParts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Australia/Sydney',
            hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false
        }).formatToParts(now);

        const getPart = (type) => (sydneyParts.find(p => p.type === type) || {}).value;
        const day = getPart('weekday');
        const hour = parseInt(getPart('hour'));
        const minute = parseInt(getPart('minute'));
        const totalMin = (hour * 60) + minute;

        if (['Sat', 'Sun'].includes(day)) return false;
        return totalMin >= (10 * 60) && totalMin < (16 * 60 + 15);
    }

    _closeSidebar() {
        // Dispatch event for HeaderLayout/AppController to handle
        document.dispatchEvent(new CustomEvent('close-sidebar'));
    }
}
