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
import { AppController } from '../controllers/AppController.js';

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
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.MODAL_FULLSCREEN} ${CSS_CLASSES.HIDDEN} ${CSS_CLASSES.BRIEFING_MODAL_WRAPPER}`;
        // Ensure this is higher than standard modals (1000) so it pops.
        modal.style.zIndex = '1001';

        const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
        const dateStr = new Date().toLocaleDateString('en-AU', dateOptions);

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.BRIEFING_MODAL_CONTENT}">
                
                <div class="${CSS_CLASSES.BRIEFING_HEADER}">
                    <!-- Title Row: Greeting + Close Button (Perfectly Aligned) -->
                    <div class="${CSS_CLASSES.BRIEFING_TITLE_ROW}">
                        <h1>Good Morning</h1>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} briefing-close-btn" title="Close">
                                <i class="fas ${UI_ICONS.CLOSE}"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Date Row (Below) -->
                    <div class="${CSS_CLASSES.BRIEFING_DATE}">${dateStr}</div>
                </div>

                <!-- NEW SHORTCUT: Market Pulse (Understated) -->
                <div class="${CSS_CLASSES.BRIEFING_SUB_SHORTCUT}" id="${IDS.BRIEFING_PULSE_SHORTCUT}" style="text-align: left; padding: 0 0 4px 24px; margin-top: -5px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 6px;">
                    <span style="font-size: 0.8rem; color: var(--color-accent); letter-spacing: 0.5px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
                         <i class="fas fa-heartbeat"></i> Market Pulse <i class="fas fa-chevron-right" style="font-size: 0.7em;"></i>
                    </span>
                </div>

                <div class="${CSS_CLASSES.BRIEFING_SCROLL_BODY}">
                    
                    <!-- 2. Hero Section: Portfolio + Pulse Partner -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                        <div class="${CSS_CLASSES.BRIEFING_HERO_ROW}" style="display: flex; gap: 16px; align-items: stretch; flex-wrap: wrap;">
                            
                            <!-- Portfolio Hero -->
                            <div class="${CSS_CLASSES.BRIEFING_HERO_CARD}" id="${IDS.BRIEFING_PORTFOLIO_HERO}" style="flex: 2; min-width: 250px;">
                                <div class="${CSS_CLASSES.HERO_LABEL}">My Portfolio</div>
                                <div class="${CSS_CLASSES.HERO_MAIN_STAT} skeleton-text">Computing...</div>
                                <div class="${CSS_CLASSES.HERO_SUB_STAT} skeleton-text">...</div>
                            </div>

                        </div>
                    </div>

                    <!-- NEW: Portfolio Highlights -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                        <div class="${CSS_CLASSES.BRIEFING_SECTION_TITLE}">Portfolio Highlights</div>
                        <div class="${CSS_CLASSES.BRIEFING_WATCHLIST_GRID}" id="${IDS.BRIEFING_PORTFOLIO_GRID}">
                           <!-- Dynamic -->
                        </div>
                    </div>

                    <!-- 3. Watchlist Highlights -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                        <div class="${CSS_CLASSES.BRIEFING_SECTION_TITLE}">Watchlist Highlights</div>
                        <div class="${CSS_CLASSES.BRIEFING_WATCHLIST_GRID}" id="${IDS.BRIEFING_WATCHLIST_GRID}">
                           <!-- Dynamic -->
                        </div>
                    </div>
                    
                    <!-- 4. Top Market Movers (Global) -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                         <div class="${CSS_CLASSES.BRIEFING_SECTION_TITLE} clickable-header" id="${IDS.MARKET_PULSE_HEADER}">Market Pulse <i class="fas fa-chevron-right" style="font-size: 0.7em; opacity: 0.5;"></i></div>
                         <div class="${CSS_CLASSES.BRIEFING_WATCHLIST_GRID}" id="${IDS.BRIEFING_MARKET_GRID}"></div>
                    </div>

                </div>

                <!-- 5. Footer: Market Pulse Link (Minimal Design) -->
                <div class="${CSS_CLASSES.BRIEFING_FOOTER_PULSE} minimal" id="${IDS.BRIEFING_MARKET_PULSE}">
                    <span class="${CSS_CLASSES.PULSE_ITEM}"><i class="fas fa-circle-notch fa-spin"></i> Reading Market...</span>
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
        if (!AppController.instance) {
            console.error('[BriefingUI] AppController instance not found.');
            return;
        }

        const data = AppController.instance.calculateBriefingDigest();
        const { portfolio, highlights, marketSentiment } = data;

        // Render Hero
        const heroCard = modal.querySelector(`#${IDS.BRIEFING_PORTFOLIO_HERO}`);
        if (heroCard) {
            const colorClass = portfolio.isUp ? CSS_CLASSES.COLOR_POSITIVE : CSS_CLASSES.COLOR_NEGATIVE;
            const bgClass = portfolio.isUp ? CSS_CLASSES.HERO_BG_POSITIVE : CSS_CLASSES.HERO_BG_NEGATIVE;
            const arrow = portfolio.isUp ? '↗' : '↘';

            // Dynamic Styling & Branding
            heroCard.className = `${CSS_CLASSES.BRIEFING_HERO_CARD} ${bgClass} ${CSS_CLASSES.CLICKABLE_HERO}`;
            heroCard.onclick = () => {
                this._close(modal);
                const notifModal = document.getElementById(IDS.NOTIFICATION_MODAL);
                if (notifModal) {
                    notifModal.remove();
                }
                document.dispatchEvent(new CustomEvent('open-portfolio-view'));
            };

            heroCard.innerHTML = `
                <div class="${CSS_CLASSES.HERO_HEADER_ROW}" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div class="${CSS_CLASSES.HERO_BRAND}">ASX TRACKER</div>
                    <div class="${CSS_CLASSES.HERO_LABEL}" style="margin-bottom: 0;">My Portfolio</div>
                </div>
                <div class="${CSS_CLASSES.HERO_MAIN_STAT} ${colorClass}">
                    ${Math.abs(portfolio.totalPctChange).toFixed(2)}% <span class="hero-arrow">${arrow}</span>
                </div>
                <div class="${CSS_CLASSES.HERO_SUB_STAT} ${colorClass}">
                    ${formatCurrency(portfolio.totalDayChangeVal)} Today
                </div>
                
                <div class="${CSS_CLASSES.HERO_FOOTER_ROW}">
                    <span class="${CSS_CLASSES.HERO_TOTAL_LABEL}">Total Balance</span>
                    <span class="${CSS_CLASSES.HERO_TOTAL_VALUE}">${formatCurrency(portfolio.totalValue)}</span>
                </div>
                
                <div class="${CSS_CLASSES.HERO_CLICK_HINT}">Tap to view full portfolio <i class="fas fa-chevron-right"></i></div>
            `;
        }

        // Render Highlights
        const pfGrid = modal.querySelector(`#${IDS.BRIEFING_PORTFOLIO_GRID}`);
        if (pfGrid) {
            if (highlights.portfolio.length === 0) {
                pfGrid.innerHTML = `<div class="${CSS_CLASSES.BRIEFING_EMPTY}">No portfolio data yet.</div>`;
            } else {
                pfGrid.innerHTML = highlights.portfolio.map(item => this._renderHighlightCard(item)).join('');
            }
        }

        const wlGrid = modal.querySelector(`#${IDS.BRIEFING_WATCHLIST_GRID}`);
        if (wlGrid) {
            if (highlights.watchlists.length === 0) {
                wlGrid.innerHTML = `<div class="${CSS_CLASSES.BRIEFING_EMPTY}">No active data for watchlists yet.</div>`;
            } else {
                wlGrid.innerHTML = highlights.watchlists.map(item => this._renderHighlightCard(item)).join('');
            }
        }

        const marketGrid = modal.querySelector(`#${IDS.BRIEFING_MARKET_GRID}`);
        if (marketGrid) {
            marketGrid.innerHTML = highlights.market.map(item => this._renderHighlightCard(item)).join('');
            const header = modal.querySelector(`#${IDS.MARKET_PULSE_HEADER}`);
            if (header) {
                header.onclick = () => {
                    document.dispatchEvent(new CustomEvent('open-market-pulse'));
                };
            }
        }

        // Render Footer Sentiment
        const footer = modal.querySelector(`#${IDS.BRIEFING_MARKET_PULSE}`);
        if (footer) {
            footer.classList.add(CSS_CLASSES.CLICKABLE_FOOTER);
            footer.classList.remove(CSS_CLASSES.FOOTER_BG_POSITIVE, CSS_CLASSES.FOOTER_BG_NEGATIVE, CSS_CLASSES.FOOTER_BG_NEUTRAL);

            let sentimentColor = 'var(--text-muted)';
            let iconHtml = '<i class="fas fa-balance-scale"></i>';

            if (marketSentiment.sentiment === 'Bullish') {
                footer.classList.add(CSS_CLASSES.FOOTER_BG_POSITIVE);
                sentimentColor = 'var(--color-positive)';
                iconHtml = '<i class="fas fa-arrow-trend-up"></i>';
            } else if (marketSentiment.sentiment === 'Bearish') {
                footer.classList.add(CSS_CLASSES.FOOTER_BG_NEGATIVE);
                sentimentColor = 'var(--color-negative)';
                iconHtml = '<i class="fas fa-arrow-trend-down"></i>';
            } else {
                footer.classList.add(CSS_CLASSES.FOOTER_BG_NEUTRAL);
            }

            footer.onclick = () => {
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS, {
                    detail: { tab: 'global', source: 'briefing' }
                }));
            };

            const pulse = marketSentiment.pulse;
            footer.style.padding = '2px 0 4px 0';
            footer.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-size: 0.95rem; font-weight: 800; color: ${sentimentColor}; margin-bottom: 0px; letter-spacing: -0.3px; line-height: 1.2;">
                        ${iconHtml} Market is ${marketSentiment.sentiment}
                    </div>
                    <div class="${CSS_CLASSES.PULSE_MINIMAL_ROW}" style="justify-content: center; opacity: 0.9; font-size: 0.8rem; flex-wrap: wrap; gap: 2px;">
                         <span class="${CSS_CLASSES.PULSE_STAT}" style="font-weight: 600; color: var(--color-accent);">${pulse.custom} Custom</span>
                         <span class="${CSS_CLASSES.PULSE_DIVIDER}" style="opacity: 0.3;">|</span>
                         <span class="${CSS_CLASSES.PULSE_STAT}"><span class="${CSS_CLASSES.COLOR_POSITIVE}">${pulse.gainers}</span> Gainers</span>
                         <span class="${CSS_CLASSES.PULSE_DIVIDER}" style="opacity: 0.3;">•</span>
                         <span class="${CSS_CLASSES.PULSE_STAT}"><span class="${CSS_CLASSES.COLOR_NEGATIVE}">${pulse.losers}</span> Losers</span>
                         <span class="${CSS_CLASSES.PULSE_DIVIDER}" style="opacity: 0.3;">•</span>
                         <span class="${CSS_CLASSES.PULSE_STAT}"><span class="${CSS_CLASSES.COLOR_POSITIVE}">${pulse.highs}</span> Highs</span>
                         <span class="${CSS_CLASSES.PULSE_DIVIDER}" style="opacity: 0.3;">•</span>
                         <span class="${CSS_CLASSES.PULSE_STAT}"><span class="${CSS_CLASSES.COLOR_NEGATIVE}">${pulse.lows}</span> Lows</span>
                    </div>
                </div>
            `;
        }
    }

    static _renderHighlightCard(item) {
        const isUp = (item.pctChange || 0) >= 0;
        const colorClass = isUp ? CSS_CLASSES.COLOR_POSITIVE : CSS_CLASSES.COLOR_NEGATIVE;
        const tintClass = isUp ? CSS_CLASSES.TINT_GREEN : CSS_CLASSES.TINT_RED;
        const arrow = isUp ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';

        const pctVal = Math.abs(item.pctChange || 0).toFixed(2);
        const dolVal = Math.abs(item.change || 0).toFixed(2);

        return `
            <div class="${CSS_CLASSES.HIGHLIGHT_CARD} ${tintClass}" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${item.code}' } }))">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div class="${CSS_CLASSES.HIGHLIGHT_CODE}">${item.code}</div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span class="${CSS_CLASSES.HIGHLIGHT_PRICE}">${formatCurrency(item.live || item.price)}</span>
                        <div class="${CSS_CLASSES.HIGHLIGHT_CHANGE} ${colorClass}" style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                            <span>$${dolVal}</span>
                            <span>${arrow} ${pctVal}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    static _bindEvents(modal) {
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        if (closeBtn) closeBtn.addEventListener('click', () => this._close(modal));
        if (overlay) overlay.addEventListener('click', () => this._close(modal));

        const footer = modal.querySelector(`#${IDS.BRIEFING_MARKET_PULSE}`);
        if (footer) {
            footer.addEventListener('click', () => {
                NotificationUI.show();
            });
        }

        const shortcut = modal.querySelector(`#${IDS.BRIEFING_PULSE_SHORTCUT}`);
        if (shortcut) {
            shortcut.addEventListener('click', () => {
                SnapshotUI.show();
            });
        }
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
