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

                <!-- NEW SHORTCUT: Market Pulse (Understated) -->
                <div class="briefing-sub-shortcut" id="briefing-pulse-shortcut" style="text-align: left; padding: 0 0 4px 24px; margin-top: -5px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 6px;">
                    <span style="font-size: 0.8rem; color: var(--color-accent); letter-spacing: 0.5px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
                         <i class="fas fa-heartbeat"></i> Market Pulse <i class="fas fa-chevron-right" style="font-size: 0.7em;"></i>
                    </span>
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
                         <div class="briefing-section-title clickable-header" id="market-pulse-header">Market Pulse <i class="fas fa-chevron-right" style="font-size: 0.7em; opacity: 0.5;"></i></div>
                         <div class="briefing-watchlist-grid" id="briefing-market-grid"></div>
                    </div>

                </div>

                <!-- 5. Footer: Market Pulse Link (Minimal Design) -->
                <div class="briefing-footer-pulse minimal" id="briefing-market-pulse">
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
                <div class="hero-header-row" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div class="hero-brand">ASX TRACKER</div>
                    <div class="hero-label" style="margin-bottom: 0;">My Portfolio</div>
                </div>
                <div class="hero-main-stat ${colorClass}">
                    ${Math.abs(totalPctChange).toFixed(2)}% <span class="hero-arrow">${arrow}</span>
                </div>
                <div class="hero-sub-stat ${colorClass}">
                    ${formatCurrency(totalDayChangeVal)} Today
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
        pfMovers.sort((a, b) => {
            const pAR = Math.round((a.pctChange || 0) * 100);
            const pBR = Math.round((b.pctChange || 0) * 100);
            if (pBR !== pAR) return pBR - pAR;
            return Math.abs(b.change || 0) - Math.abs(a.change || 0);
        });
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
        userMovers.sort((a, b) => {
            const pAR = Math.round((a.pctChange || 0) * 100);
            const pBR = Math.round((b.pctChange || 0) * 100);
            if (pBR !== pAR) return pBR - pAR;
            return Math.abs(b.change || 0) - Math.abs(a.change || 0);
        });
        const top3User = userMovers.slice(0, 3);

        const grid = modal.querySelector('#briefing-watchlist-grid');
        if (grid) {
            if (top3User.length === 0) {
                grid.innerHTML = '<div class="briefing-empty">No active data for watchlists yet.</div>';
            } else {
                grid.innerHTML = top3User.map(item => this._renderHighlightCard(item)).join('');
            }
        }

        // --- 4. Market Pulse (Footer & Hero Card) ---
        // Proxy using NotificationStore Global data
        const pulse = notificationStore.getPulseCounts();
        const upCount = pulse.gainers;
        const downCount = pulse.losers;
        const hiCount = pulse.highs;
        const loCount = pulse.lows;
        const customCount = pulse.custom;

        // Sentiment Logic
        let sentiment = 'Neutral';
        let sentimentColor = 'var(--text-muted)'; // Default Gray/Gold
        let iconHtml = '<i class="fas fa-balance-scale"></i>';

        if (upCount > downCount * 1.5) {
            sentiment = 'Bullish';
            sentimentColor = 'var(--color-positive)';
            iconHtml = '<i class="fas fa-arrow-trend-up"></i>';
        } else if (downCount > upCount * 1.5) {
            sentiment = 'Bearish';
            sentimentColor = 'var(--color-negative)';
            iconHtml = '<i class="fas fa-arrow-trend-down"></i>';
        }

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
                        section: null // Default to Dashboard (Overview)
                    }
                }));
            };

            // FORCE OVERRIDE CSS PADDING (Fix for v314 height issue)
            footer.style.padding = '0';
            footer.style.paddingTop = '2px'; // Tiny breathing room
            footer.style.paddingBottom = '4px'; // Tiny breathing room

            // UPDATED FOOTER LAYOUT (V3): Aggressive Vertical Compression (~20% reduction)
            footer.innerHTML = `
                <div style="text-align: center; padding: 0 0 4px 0;">
                    <div style="font-size: 0.95rem; font-weight: 800; color: ${sentimentColor}; margin-bottom: 0px; letter-spacing: -0.3px; line-height: 1.2;">
                        ${iconHtml} Market is ${sentiment}
                    </div>
                    <div class="pulse-minimal-row" style="justify-content: center; opacity: 0.9; font-size: 0.8rem; flex-wrap: wrap; gap: 2px;">
                         <span class="pulse-stat" style="font-weight: 600; color: var(--color-accent);">${customCount} Custom</span>
                         <span class="pulse-divider" style="opacity: 0.3;">|</span>
                         <span class="pulse-stat"><span class="color-positive">${upCount}</span> Gainers</span>
                         <span class="pulse-divider" style="opacity: 0.3;">•</span>
                         <span class="pulse-stat"><span class="color-negative">${downCount}</span> Losers</span>
                         <span class="pulse-divider" style="opacity: 0.3;">•</span>
                         <span class="pulse-stat"><span class="color-positive">${hiCount}</span> Highs</span>
                         <span class="pulse-divider" style="opacity: 0.3;">•</span>
                         <span class="pulse-stat"><span class="color-negative">${loCount}</span> Lows</span>
                    </div>
                </div>
            `;
        }

        // --- 4. Market Pulse Top 3 ---
        // USE Centralized merged list from store
        const allAlerts = [
            ...(pulse._global.movers?.up || []),
            ...(pulse._global.movers?.down || []),
            ...(pulse._global.hilo?.high || []),
            ...(pulse._global.hilo?.low || [])
        ];

        // Sort by magnitude of movement (absolute percentage)
        allAlerts.sort((a, b) => {
            const pA = Math.abs(a.pctChange || a.pct || 0);
            const pB = Math.abs(b.pctChange || b.pct || 0);
            if (pB !== pA) return pB - pA;
            return Math.abs(b.change || 0) - Math.abs(a.change || 0);
        });
        const top3Global = allAlerts.slice(0, 3);

        const marketGrid = modal.querySelector('#briefing-market-grid');
        if (marketGrid) {
            marketGrid.innerHTML = top3Global.map(item => this._renderHighlightCard(item)).join('');

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
        const isUp = (item.pctChange || item.pct || 0) >= 0;
        const colorClass = isUp ? 'color-positive' : 'color-negative';
        const tintClass = isUp ? 'tint-green' : 'tint-red';
        const arrow = isUp ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';

        const pctVal = Math.abs(item.pctChange || item.pct || 0).toFixed(2);
        const dolVal = Math.abs(item.change || item.dol || 0).toFixed(2); // Ensure we have dollar change

        // NAVIGATION PERSISTENCE: Event dispatch opens Sidebar. 
        // We do NOT call _close() here.
        return `
            <div class="highlight-card ${tintClass}" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${item.code}' } }))">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    
                    <!-- LEFT: Code -->
                    <div class="highlight-code">${item.code}</div>

                    <!-- RIGHT: Price Stack -->
                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span class="highlight-price">${formatCurrency(item.live || item.price)}</span>
                        
                    <!-- Change Row: $ then % -->
                        <div class="highlight-change ${colorClass}" style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                            <span>$${dolVal}</span>
                            <span>${arrow} ${pctVal}%</span>
                        </div>
                    </div>

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
                <div class="market-row-change ${colorClass}">${val}%</div>
            </div>
         `;
    }

    static _bindEvents(modal) {
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        const closeHandler = () => this._close(modal);
        if (closeBtn) closeBtn.addEventListener('click', () => this._close(modal));
        if (overlay) overlay.addEventListener('click', () => this._close(modal));

        // REMOVED: Hero Card click binding (card was removed per user request)
        // Footer click binding is now the only Market Pulse entry point
        const footer = modal.querySelector('#briefing-market-pulse');
        if (footer) {
            footer.addEventListener('click', () => {
                // User Request: Footer clicks through to NOTIFICATIONS container
                NotificationUI.show();
            });
        }

        // NEW: Shortcut Click
        const shortcut = modal.querySelector('#briefing-pulse-shortcut');
        if (shortcut) {
            shortcut.addEventListener('click', () => {
                console.log('[BriefingUI] Shortcut clicked. Opening SnapshotUI (Market Pulse).');
                SnapshotUI.show();
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
