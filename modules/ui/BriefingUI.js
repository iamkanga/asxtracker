/**
 * BriefingUI.js
 * Renders the Daily Briefing modal (V2: Personal Digest).
 * Focuses on User Portfolio, Watchlist Highlights, and Market Pulse.
 */

import { notificationStore } from '../state/NotificationStore.js';
import { AppState } from '../state/AppState.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { SnapshotUI } from './SnapshotUI.js';

// --- BriefingUI.js ---
// Version Tracer: v313 (Alert Probe)
console.log('%c[BriefingUI] Loaded v313', 'background: #000; color: #00ff00');

export class BriefingUI {

    static show() {
        const existingInfo = document.getElementById(IDS.DAILY_BRIEFING_MODAL);
        if (existingInfo) {
            if (existingInfo.classList.contains(CSS_CLASSES.HIDDEN)) {
                existingInfo.classList.remove(CSS_CLASSES.HIDDEN);
                existingInfo.style.zIndex = '1001';
                // Bring to front
                document.body.appendChild(existingInfo);
            }
            return;
        }

        const modal = this._renderModal();
        document.body.appendChild(modal);
        this._bindEvents(modal);

        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
        });

        // Trigger Data Calculation
        this._updateDigest(modal);
    }

    static _renderModal() {
        const modal = document.createElement('div');
        modal.id = IDS.DAILY_BRIEFING_MODAL;
        // Apply classes AND inline z-index for safety against CSS overrides.
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.MODAL_FULLSCREEN} ${CSS_CLASSES.HIDDEN} briefing-modal-wrapper`;
        // Ensure this is higher than standard modals (1000) so it pops.
        modal.style.zIndex = '1001';

        const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
        const dateStr = new Date().toLocaleDateString('en-AU', dateOptions);

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} briefing-modal-content">
                
                <div class="briefing-header">
                    <!-- Title Row: Greeting + Close Button (Perfectly Aligned) -->
                    <div class="briefing-title-row">
                        <h1>Good Morning</h1>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <!-- Pulse Button Removed (Now a Partner Card) -->
                            <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} briefing-close-btn" title="Close">
                                <i class="fas ${UI_ICONS.CLOSE}"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Date Row (Below) -->
                    <div class="briefing-date">${dateStr}</div>
                </div>

                <div class="briefing-scroll-body">
                    
                    <!-- 2. Hero Section: Portfolio + Pulse Partner -->
                    <div class="briefing-section">
                        <div class="briefing-hero-row" style="display: flex; gap: 16px; align-items: stretch; flex-wrap: wrap;">
                            
                            <!-- Portfolio Hero -->
                            <div class="briefing-hero-card" id="briefing-portfolio-hero" style="flex: 2; min-width: 250px;">
                                <div class="hero-label">My Portfolio</div>
                                <div class="hero-main-stat skeleton-text">Computing...</div>
                                <div class="hero-sub-stat skeleton-text">...</div>
                            </div>

                            <!-- Market Pulse Partner Card -->
                            <div class="briefing-hero-card clickable-hero" id="briefing-pulse-card" style="flex: 1; min-width: 140px; display: flex !important; flex-direction: column; justify-content: space-between; position: relative; background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%); border: 1px solid rgba(255, 255, 255, 0.1);">
                                <div class="hero-label">Market Pulse</div>
                                <div style="display: flex; align-items: center; justify-content: center; flex: 1; margin: 15px 0;">
                                    <i class="fas fa-heartbeat" style="font-size: 2.8rem; color: var(--color-accent); filter: drop-shadow(0 0 10px rgba(183,149,11,0.6)); animation: pulseSlow 2s infinite;"></i>
                                </div>
                                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                                    <span style="font-size: 0.8rem; color: var(--color-positive); font-weight: 700;">Live</span>
                                </div>
                                <!-- Background Decoration -->
                                <div style="position: absolute; top: -15px; right: -15px; width: 70px; height: 70px; background: var(--color-accent); opacity: 0.08; border-radius: 50%; filter: blur(25px); pointer-events: none;"></div>
                            </div>

                        </div>
                    </div>

                    <!-- NEW: Portfolio Highlights -->
                    <div class="briefing-section">
                        <div class="briefing-section-title">Portfolio Highlights</div>
                        <div class="briefing-watchlist-grid" id="briefing-portfolio-grid">
                           <!-- Dynamic -->
                        </div>
                    </div>

                    <!-- 3. Watchlist Highlights -->
                    <div class="briefing-section">
                        <div class="briefing-section-title">Watchlist Highlights</div>
                        <div class="briefing-watchlist-grid" id="briefing-watchlist-grid">
                           <!-- Dynamic -->
                        </div>
                    </div>
                    
                    <!-- 4. Top Market Movers (Global) -->
                    <div class="briefing-section">
                         <div class="briefing-section-title clickable-header" id="market-pulse-header">Market Pulse Top 3 <i class="fas fa-chevron-right" style="font-size: 0.7em; opacity: 0.5;"></i></div>
                         <div class="briefing-market-list" id="briefing-market-list"></div>
                    </div>

                </div>

                <!-- Pulse Card Container (Cleaned up) -->
                <div class="briefing-pulse-spacer" style="margin-bottom: 10px;"></div>

                <!-- 5. Footer: Stats -->
                <div class="briefing-footer-pulse" id="briefing-market-pulse">
                    <span class="pulse-item"><i class="fas fa-circle-notch fa-spin"></i> Reading Market...</span>
                </div>
            </div>
        `;

        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                this._close(modal);
            }
        });

        return modal;
    }

    static _updateDigest(modal) {
        // --- 1. Portfolio Calculation ---
        const shares = AppState.data.shares || [];
        const livePrices = AppState.livePrices || new Map();

        // Filter for "Portfolio" (Owned items)
        const portfolioItems = shares.filter(s => {
            const units = parseFloat(s.portfolioShares) || parseFloat(s.units) || 0;
            return units > 0;
        });

        // Loop to calc daily change
        let totalDayChangeVal = 0;
        let totalValue = 0;
        let prevValue = 0;

        portfolioItems.forEach(s => {
            const units = parseFloat(s.portfolioShares) || parseFloat(s.units) || 0;
            const code = s.code || s.shareName || s.symbol || '???';
            // Clean Code for map lookup
            const cleanCode = code.replace(/\.AX$/i, '').trim().toUpperCase();

            const liveData = livePrices.get(cleanCode) || livePrices.get(code) || {};
            const live = liveData.live || Number(s.purchasePrice) || 0;

            // Prev Close Calculation: if raw data has prevClose, use it. Else calculate back from live - change.
            let prevClose = liveData.prevClose;
            if ((!prevClose || prevClose === 0) && liveData.change) {
                prevClose = live - liveData.change;
            }
            if (!prevClose || prevClose === 0) prevClose = live; // Fallback to 0% change

            const valNow = units * live;
            const valPrev = units * prevClose;

            totalValue += valNow;
            totalDayChangeVal += (valNow - valPrev);
            prevValue += valPrev;
        });

        let totalPctChange = 0;
        if (prevValue > 0) {
            totalPctChange = ((totalValue - prevValue) / prevValue) * 100;
        }

        // Render Hero
        const heroCard = modal.querySelector('#briefing-portfolio-hero');
        if (heroCard) {
            const isUp = totalDayChangeVal >= 0;
            const colorClass = isUp ? 'color-positive' : 'color-negative';
            const bgClass = isUp ? 'hero-bg-positive' : 'hero-bg-negative';
            const arrow = isUp ? '↗' : '↘'; // Visual flavor
            const sign = isUp ? '+' : '';

            // Dynamic Styling & Branding
            heroCard.className = `briefing-hero-card ${bgClass} clickable-hero`; // Reset classes + add dynamic
            heroCard.onclick = () => {
                console.log('[BriefingUI] Hero clicked. Opening Portfolio.');
                // NAVIGATION PERSISTENCE: Close Briefing before opening Portfolio View
                // because Portfolio View is the main background, not an overlay.
                this._close(modal);

                // FIXED: Explicitly Close Notification Modal if it exists underneath
                const notifModal = document.getElementById(IDS.NOTIFICATION_MODAL);
                if (notifModal) {
                    console.log('[BriefingUI] Force-closing underlying Notification Modal.');
                    notifModal.remove();
                    // Also maintain Nav Stack integrity if needed, but removal is key for visual cleanup.
                }

                // Dispatch event to open Watchlist "portfolio"
                document.dispatchEvent(new CustomEvent('open-portfolio-view'));
            };

            heroCard.innerHTML = `
                <div class="hero-header-row">
                    <div class="hero-label">My Portfolio</div>
                    <div class="hero-brand">ASX TRACKER</div>
                </div>
                <div class="hero-main-stat ${colorClass}">
                    ${sign}${totalPctChange.toFixed(2)}% <span class="hero-arrow">${arrow}</span>
                </div>
                <div class="hero-sub-stat ${colorClass}">
                    ${sign}${formatCurrency(totalDayChangeVal)} Today
                </div>
                
                <div class="hero-footer-row">
                    <span class="hero-total-label">Total Balance</span>
                    <span class="hero-total-value">${formatCurrency(totalValue)}</span>
                </div>
                
                <div class="hero-click-hint">Tap to view full portfolio <i class="fas fa-chevron-right"></i></div>
            `;
        }

        // --- 2. Portfolio Highlights (Top 3 Movers from Portfolio) ---
        const pfMovers = [];
        portfolioItems.forEach(s => {
            const cleanCode = (s.code || s.shareName || '').replace(/\.AX$/i, '').trim().toUpperCase();
            const data = livePrices.get(cleanCode);
            if (data) {
                pfMovers.push({
                    code: cleanCode,
                    live: data.live || 0,
                    change: data.change || 0,
                    pctChange: data.pctChange || (data.changePercent) || 0,
                    name: data.name || ''
                });
            }
        });
        pfMovers.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
        const top3Portfolio = pfMovers.slice(0, 3);

        const pfGrid = modal.querySelector('#briefing-portfolio-grid');
        if (pfGrid) {
            if (top3Portfolio.length === 0) {
                pfGrid.innerHTML = '<div class="briefing-empty">No portfolio data yet.</div>';
            } else {
                pfGrid.innerHTML = top3Portfolio.map(item => this._renderHighlightCard(item)).join('');
            }
        }


        // --- 3. Watchlist Highlights (Top 3 Movers from User's Lists) ---
        // Includes Portfolio + ANY other watched item
        const watchedCodes = new Set();
        shares.forEach(s => {
            const c = (s.code || s.shareName || s.symbol || '').toUpperCase();
            if (c) watchedCodes.add(c);
        });

        const userMovers = [];
        watchedCodes.forEach(rawCode => {
            let cleanCode = rawCode.replace(/\.AX$/i, '').trim().toUpperCase();
            const data = livePrices.get(cleanCode) || livePrices.get(rawCode);
            if (data) {
                // Enrich with logic for display
                userMovers.push({
                    code: cleanCode,
                    live: data.live || 0,
                    change: data.change || 0,
                    pctChange: data.pctChange || (data.changePercent) || 0,
                    name: data.name || ''
                });
            }
        });

        // Sort by Magnitude of movement (absolute) to find "News"
        userMovers.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
        const top3User = userMovers.slice(0, 3);

        const grid = modal.querySelector('#briefing-watchlist-grid');
        if (grid) {
            if (top3User.length === 0) {
                grid.innerHTML = '<div class="briefing-empty">No active data for watchlists yet.</div>';
            } else {
                grid.innerHTML = top3User.map(item => this._renderHighlightCard(item)).join('');
            }
        }

        // --- 4. Market Pulse (Footer) ---
        // Proxy using NotificationStore Global data
        const globalMovers = notificationStore.getGlobalAlerts(false) || { movers: { up: [], down: [] }, hilo: { high: [], low: [] } };
        const upCount = (globalMovers.movers?.up || []).length;
        const downCount = (globalMovers.movers?.down || []).length;

        const hiCount = (globalMovers.hilo?.high || []).length;
        const loCount = (globalMovers.hilo?.low || []).length;

        let sentiment = 'Neutral';
        let sentimentIcon = '<i class="fas fa-minus"></i>';

        if (upCount > downCount * 1.2) { sentiment = 'Bullish'; sentimentIcon = '<i class="fas fa-arrow-trend-up"></i>'; }
        else if (downCount > upCount * 1.2) { sentiment = 'Bearish'; sentimentIcon = '<i class="fas fa-arrow-trend-down"></i>'; }

        // --- 2b. Clean Up Pulse Card (Removed per user request) ---
        // LOGIC FIX v311: We do NOT remove the Partner Card anymore!
        // We want it there!

        const footer = modal.querySelector('#briefing-market-pulse');
        if (footer) {
            // Make Footer Container General Click
            footer.classList.add('clickable-footer');
            footer.title = "View Market Notifications";

            // General Click (Opens Notification Center)
            footer.onclick = (e) => {
                const targetSec = e.target.closest('[data-section]')?.dataset.section;
                console.log(`[BriefingUI] Stats Footer click. Target Section: ${targetSec || 'General'}`);

                // Dispatch Event (NotificationUI handles Briefing Hiding)
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS, {
                    detail: {
                        tab: 'global', // Force global tab since these are market stats
                        source: 'briefing',
                        section: targetSec || null // Deep link or default
                    }
                }));
            };

            // STRICT STATS DISPLAY + SENTIMENT
            // STRICT STATS DISPLAY + SENTIMENT
            footer.innerHTML = `
                <div class="pulse-stacked-container">
                    <div class="pulse-title-row">
                        ${sentimentIcon} <span style="margin-left:6px">Market ${sentiment}</span>
                    </div>
                    <div class="pulse-stats-grid">
                        <div class="pulse-stat-item hover-highlight" data-section="gainers">
                            <span class="p-val color-positive">${upCount}</span>
                            <span class="p-lbl">Gainers</span>
                        </div>
                        <div class="pulse-stat-item hover-highlight" data-section="losers">
                            <span class="p-val color-negative">${downCount}</span>
                            <span class="p-lbl">Losers</span>
                        </div>
                        <div class="pulse-stat-item hover-highlight" data-section="hilo-high">
                            <span class="p-val color-positive">${hiCount}</span>
                            <span class="p-lbl">Highs</span>
                        </div>
                        <div class="pulse-stat-item hover-highlight" data-section="hilo-low">
                            <span class="p-val color-negative">${loCount}</span>
                            <span class="p-lbl">Lows</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // --- 4. Market Pulse Top 3 ---
        const allGlobal = [...(globalMovers.movers?.up || []), ...(globalMovers.movers?.down || [])];
        // Sort by magnitude
        allGlobal.sort((a, b) => Math.abs(b.pctChange || 0) - Math.abs(a.pctChange || 0));
        const top3Global = allGlobal.slice(0, 3);

        const marketList = modal.querySelector('#briefing-market-list');
        if (marketList) {
            marketList.innerHTML = top3Global.map(item => this._renderCompactRow(item)).join('');

            // Re-bind Header Click (Dynamic Title Update)
            // We use the ID now for safety.
            const header = modal.querySelector('#market-pulse-header');
            if (header) {
                header.onclick = () => {
                    console.log('[BriefingUI] Market Pulse Header Clicked via ID.');
                    document.dispatchEvent(new CustomEvent('open-market-pulse'));
                };
            }
        }
    }

    static _renderHighlightCard(item) {
        const isUp = item.pctChange >= 0;
        const colorClass = isUp ? 'color-positive' : 'color-negative';
        const arrow = isUp ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';

        // NAVIGATION PERSISTENCE: Event dispatch opens Sidebar. 
        // We do NOT call _close() here.
        return `
            <div class="highlight-card" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${item.code}' } }))">
                <div class="highlight-header">
                    <span class="highlight-code">${item.code}</span>
                    <span class="highlight-price">${formatCurrency(item.live)}</span>
                </div>
                <div class="highlight-change ${colorClass}">
                    ${arrow} ${Math.abs(item.pctChange).toFixed(2)}%
                </div>
            </div>
        `;
    }

    static _renderCompactRow(item) {
        const pct = item.pctChange || item.changePct || item.pct || 0;
        const isUp = pct >= 0;
        const colorClass = isUp ? 'color-positive' : 'color-negative';
        const val = Math.abs(pct).toFixed(2);
        const displayCode = item.code || item.s || '???';

        // NAVIGATION PERSISTENCE: Event dispatch opens Sidebar.
        // We do NOT call _close() here.
        return `
            <div class="market-row" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${displayCode}' } }))">
                <div class="market-row-code">${displayCode}</div>
                <div class="market-row-name">${item.name || ''}</div>
                <div class="market-row-change ${colorClass}">${isUp ? '+' : '-'}${val}%</div>
            </div>
         `;
    }

    static _bindEvents(modal) {
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        const closeHandler = () => this._close(modal);
        if (closeBtn) closeBtn.addEventListener('click', () => this._close(modal));
        if (overlay) overlay.addEventListener('click', () => this._close(modal));

        const pulseCard = modal.querySelector('#briefing-pulse-card');
        if (pulseCard) {
            pulseCard.addEventListener('click', () => {
                SnapshotUI.show();
                // Optional: Close Briefing? 
                // this._close(modal); 
                // Keeping it open might be better for "Back" flow, or matching current behavior.
            });
        }

        // Items events are inline onclick dispatching custom event to decouple
        // But we need to ensure the modal closes when navigating
        // We can listen to the same event on document level? 
        // No, simplest is to add specific listeners or handle in AppController. 
        // Currently AppController listens to ASX_CODE_CLICK -> NavManager -> Show Stock
        // We just need to close ourselves.

        // Self-closing listener for the dispatched event if it bubbles?
        // Actually inline click handler dispatches correct event. But we want to close sidebar/modal.
        // Let's add a global listener for navigation inside the modal scope?
        // Easiest: The highlight card onClick contains the dispatch.
        // We will add a wrapper listener to close the modal.
        // Global Modal Click (Close on backdrop only? No, strictly explicit close)
        // We previously closed on content click, but that causes "Flashing" when opening Sidebars.
        // Now we ONLY close on overlay or close button.
        // modal.addEventListener('click', (e) => {
        //    if (e.target.closest('.highlight-card') || e.target.closest('.market-row')) {
        //        this._close(modal);
        //    }
        // });
    }

    static _close(modal) {
        modal.classList.add(CSS_CLASSES.HIDDEN);
        setTimeout(() => modal.remove(), 300);
        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }
}
