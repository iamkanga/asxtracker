/**
 * BriefingUI.js
 * Renders the Daily Briefing modal (V2: Personal Digest).
 * Focuses on User Portfolio, Watchlist Highlights, and Market Pulse.
 */

import { notificationStore } from '../state/NotificationStore.js';
import { AppState } from '../state/AppState.js';
import { StateAuditor } from '../state/StateAuditor.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS, UI_LABELS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { SnapshotUI } from './SnapshotUI.js';
import { NotificationUI } from './NotificationUI.js';
import { LinkHelper } from '../utils/LinkHelper.js';
import { ToastManager } from './ToastManager.js';


export class BriefingUI {

    static show() {
        // ALWAYS remove existing to ensure fresh UI logic & listeners apply
        const existing = document.getElementById(IDS.DAILY_BRIEFING_MODAL);
        if (existing) existing.remove();

        const modal = this._renderModal();
        document.body.appendChild(modal);
        this._bindEvents(modal);

        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
        });

        // Trigger Data Calculation
        this._updateDigest(modal);

        // REACTIVE UPDATE: Keep Briefing Live
        if (StateAuditor && typeof StateAuditor.on === 'function') {
            modal._priceUnsub = StateAuditor.on('PRICES_UPDATED', () => {
                if (document.body.contains(modal) && !modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                    this._updateDigest(modal);
                }
            });
        }
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
                        <h1>${this._getGreeting()}</h1>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} briefing-close-btn" title="${UI_LABELS.CLOSE}">
                                <i class="fas ${UI_ICONS.CLOSE}"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Date Row (Below) -->
                    <div class="${CSS_CLASSES.BRIEFING_DATE}">${dateStr}</div>
                </div>

                <!-- NEW SHORTCUT: Roast Portfolio Only (Centered) -->
                <!-- Top Actions Row: Roast Only -->
                <div class="${CSS_CLASSES.BRIEFING_SUB_SHORTCUT}" style="display: flex; justify-content: center; align-items: center; padding: 0 0 8px 0; margin-top: -5px;">
                    
                    <!-- Roast Portfolio -->
                    <div id="btn-roast-portfolio" style="cursor: pointer; display: flex; align-items: center; gap: 6px; transition: opacity 0.2s;">
                         <span style="font-size: 0.8rem; color: var(--color-negative); letter-spacing: 0.5px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
                             <i class="fas fa-fire"></i> ${UI_LABELS.ROAST_PORTFOLIO}
                         </span>
                    </div>

                </div>

                <div class="${CSS_CLASSES.BRIEFING_SCROLL_BODY}">
                    
                    <!-- Feature 4: Ask the Market -->
                    <div style="margin: 0 0 16px 0; padding: 12px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);">
                       <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 8px;">${UI_LABELS.ASK_THE_MARKET}</div>
                        <div style="position:relative;">
                           <input type="text" id="gemini-chat-input" placeholder="${UI_LABELS.GEMINI_PLACEHOLDER}" style="width:100%; padding: 10px 48px 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #eee; font-family: inherit; font-size: 0.9em;">
                           <button type="button" id="btn-ask-market-direct" aria-label="Send Message" style="position:absolute; right:2px; top:2px; bottom:2px; width:44px; background: transparent; border:none; color:var(--color-accent); cursor:pointer; display: flex; align-items: center; justify-content: center; outline: none; z-index: 10;">
                              <img src="gemini-icon.png" style="width: 20px; height: 20px; opacity: 0.9; pointer-events: none;">
                           </button>
                        </div>
                    </div>

                    <!-- NEW: Consolidated Smart Hero (Portfolio + Market Context) -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                        <div class="${CSS_CLASSES.BRIEFING_HERO_ROW}" style="display: flex; gap: 16px; align-items: stretch; flex-wrap: wrap;"> 
                            <div class="${CSS_CLASSES.BRIEFING_HERO_CARD}" id="${IDS.BRIEFING_PORTFOLIO_HERO}" style="flex: 2; min-width: 250px;">
                                <!-- Dynamic Content Injected via _updateDigest -->
                                <div class="${CSS_CLASSES.HERO_LABEL}">${UI_LABELS.MY_PORTFOLIO}</div>
                                <div class="${CSS_CLASSES.HERO_MAIN_STAT} skeleton-text">${UI_LABELS.COMPUTING}</div>
                            </div>
                        </div>
                    </div>

                    <!-- NEW: Portfolio Highlights -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                        <div class="${CSS_CLASSES.BRIEFING_SECTION_TITLE}">${UI_LABELS.PORTFOLIO_HIGHLIGHTS}</div>
                        <div class="${CSS_CLASSES.BRIEFING_WATCHLIST_GRID}" id="${IDS.BRIEFING_PORTFOLIO_GRID}">
                           <!-- Dynamic -->
                        </div>
                    </div>

                    <!-- 3. Watchlist Highlights -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                        <div class="${CSS_CLASSES.BRIEFING_SECTION_TITLE}">${UI_LABELS.WATCHLIST_HIGHLIGHTS}</div>
                        <div class="${CSS_CLASSES.BRIEFING_WATCHLIST_GRID}" id="${IDS.BRIEFING_WATCHLIST_GRID}">
                           <!-- Dynamic -->
                        </div>
                    </div>
                    
                    <!-- 4. Top Market Movers (Global) -->
                    <div class="${CSS_CLASSES.BRIEFING_SECTION}">
                         <div class="${CSS_CLASSES.BRIEFING_SECTION_TITLE}" id="${IDS.MARKET_PULSE_HEADER}">${UI_LABELS.MARKET}</div>
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
        if (!AppState.controller) {
            console.error('[BriefingUI] AppController instance not found.');
            return;
        }

        const data = AppState.controller.calculateBriefingDigest();
        const { portfolio, highlights, marketSentiment } = data;
        const counts = notificationStore.getBadgeCounts();
        const annCount = counts.announcements || 0;

        // Helper to get index data safely
        const getIndexHtml = (code, fallbackCode) => {
            const item = AppState.livePrices.get(code) || AppState.livePrices.get(fallbackCode) || { pctChange: 0 };
            const pct = item.pctChange || 0;
            const isUp = pct >= 0;
            // Force inline color with !important to override Hero Card white text
            const colorVar = isUp ? 'var(--color-positive)' : 'var(--color-negative)';
            return `<span style="color: ${colorVar} !important;">${isUp ? '+' : ''}${pct.toFixed(2)}%</span>`;
        };

        // (Legacy Top Row Removed)

        // Render Hero
        const heroCard = modal.querySelector(`#${IDS.BRIEFING_PORTFOLIO_HERO}`);
        if (heroCard) {
            const colorClass = portfolio.isUp ? CSS_CLASSES.COLOR_POSITIVE : CSS_CLASSES.COLOR_NEGATIVE;
            const bgClass = portfolio.isUp ? CSS_CLASSES.HERO_BG_POSITIVE : CSS_CLASSES.HERO_BG_NEGATIVE;
            const arrow = portfolio.isUp ? '↗' : '↘';

            // Calculate Border Styles
            const borderStyle = this._getBorderStyles(portfolio.totalPctChange);
            // Add click Hint class
            heroCard.className = `${CSS_CLASSES.BRIEFING_HERO_CARD} ${bgClass} ${CSS_CLASSES.CLICKABLE_HERO}`;
            heroCard.setAttribute('style', `flex: 2; min-width: 250px; ${borderStyle}`);

            // Interaction: Open Portfolio on Tap
            heroCard.onclick = () => {
                this._close(modal);
                const notifModal = document.getElementById(IDS.NOTIFICATION_MODAL);
                if (notifModal) { notifModal.remove(); }
                document.dispatchEvent(new CustomEvent('open-portfolio-view'));
            };

            // NEW INTEGRATED LAYOUT
            const asxHtml = getIndexHtml('^AXJO', 'XJO');
            const spxHtml = getIndexHtml('^GSPC', 'INX');

            heroCard.innerHTML = `
                <!-- 1. Header Row: Branding + Icons -->
                <div class="${CSS_CLASSES.HERO_HEADER_ROW}" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    
                    <!-- Left: Title with Gemini Icon -->
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div class="${CSS_CLASSES.HERO_BRAND}" style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; letter-spacing: 1px;">
                            ASX TRACKER <img src="gemini-icon.png" style="width: 16px; height: 16px; opacity: 1;">
                        </div>
                        <div class="${CSS_CLASSES.HERO_LABEL}" style="margin-bottom: 0;">Daily Briefing</div>
                    </div>

                    <!-- Right: Actions (Market Pulse, Announcements & Portfolio) -->
                    <div style="display: flex; gap: 16px; align-items: center;">
                        
                        <!-- Market Pulse Icon (Coffee Color) -->
                        <div style="opacity: 1; cursor: pointer;" id="hero-pulse-btn" title="Market Pulse">
                            <i class="fas fa-heartbeat" style="font-size: 1.4rem; color: var(--color-accent);"></i>
                        </div>

                        <!-- Announcements Icon (Bullhorn) -->
                        <div style="opacity: 1; cursor: pointer; position: relative;" id="hero-announce-btn" title="Announcements">
                            <i class="fas fa-bullhorn" style="font-size: 1.4rem; color: var(--color-accent);"></i>
                        </div>

                        <!-- Portfolio Icon (Coffee Color) -->
                        <div style="opacity: 1; cursor: pointer;" id="hero-briefcase-btn" title="View Portfolio">
                            <i class="fas fa-briefcase" style="font-size: 1.4rem; color: var(--color-accent);"></i>
                        </div>
                    </div>
                </div>
                
                <!-- 2. Main Content Row -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                    <!-- LEFT: Portfolio Stats -->
                    <div style="display: flex; flex-direction: column;">
                        <div class="${CSS_CLASSES.HERO_LABEL}" style="font-size: 0.75rem; text-transform: uppercase; opacity: 0.7; margin-bottom: 4px;">My Portfolio</div>
                        <div class="${CSS_CLASSES.HERO_MAIN_STAT} ${colorClass}" style="line-height: 1; font-size: 2.8rem; font-weight: 800; letter-spacing: -1px;">
                            ${Math.abs(portfolio.totalPctChange).toFixed(2)}% <span class="hero-arrow" style="font-size: 0.5em; vertical-align: middle;">${arrow}</span>
                        </div>
                        <div class="${CSS_CLASSES.HERO_SUB_STAT} ${colorClass}" style="font-size: 0.95rem; font-weight: 600; margin-top: 4px; opacity: 0.9;">
                            ${formatCurrency(portfolio.totalDayChangeVal)} Today
                        </div>
                    </div>

                    <!-- RIGHT: Market Indices (Compact) -->
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding-bottom: 4px;">
                        <div style="display: flex; gap: 12px; align-items: center; padding: 6px 0;">
                            <div style="display: flex; flex-direction: column; align-items: center;">
                                <span style="font-size: 0.65rem; color: rgba(255,255,255,0.5); font-weight: 700;">ASX 200</span>
                                <span style="font-size: 0.85rem; font-weight: 700;">${asxHtml}</span>
                            </div>
                            <div style="width: 1px; height: 16px; background: rgba(255,255,255,0.1);"></div>
                            <div style="display: flex; flex-direction: column; align-items: center;">
                                <span style="font-size: 0.65rem; color: rgba(255,255,255,0.5); font-weight: 700;">S&P 500</span>
                                <span style="font-size: 0.85rem; font-weight: 700;">${spxHtml}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. AI Summary (Integrated, Minimal) -->
                <div id="briefing-ai-summary" style="font-size: 0.9rem; line-height: 1.5; color: rgba(255,255,255,0.85); font-weight: 400; min-height: 20px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; margin-top: 4px;">
                    <span style="opacity: 0.6;"><i class="fas fa-circle-notch fa-spin"></i> ${UI_LABELS.ANALYZING_PORTFOLIO}</span>
                </div>
            `;

            // Interaction: Pulse
            const pulseBtn = heroCard.querySelector('#hero-pulse-btn');
            if (pulseBtn) {
                pulseBtn.onclick = (e) => {
                    e.stopPropagation();
                    SnapshotUI.show();
                };
            }

            // Interaction: Announcements
            const announceBtn = heroCard.querySelector('#hero-announce-btn');
            if (announceBtn) {
                announceBtn.onclick = (e) => {
                    e.stopPropagation();
                    // Import and open Market Stream
                    import('./MarketIndexController.js').then(({ marketIndexController }) => {
                        marketIndexController.openModal();
                    });
                };
            }

            heroCard.querySelector('#hero-briefcase-btn').onclick = (e) => {
                e.stopPropagation(); // Prevent card click
                this._close(modal);
                const notifModal = document.getElementById(IDS.NOTIFICATION_MODAL);
                if (notifModal) { notifModal.remove(); }
                document.dispatchEvent(new CustomEvent('open-portfolio-view'));
            };

            // TRIGGER AI GENERATION (Async)
            (async () => {
                try {
                    const { DataService } = await import('../data/DataService.js');
                    const ds = new DataService();

                    // Market Context & Time (Fix for "Closed Market" assumption)
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
                    const day = now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Sydney' });
                    // Basic heuristic for status
                    const hour = now.getHours();
                    const isWknd = day === 'Saturday' || day === 'Sunday';
                    const isOpen = !isWknd && hour >= 10 && hour < 16;
                    const statusStr = isOpen ? "Market is OPEN" : "Market is CLOSED";

                    // Construct minimal context for the AI
                    const context = {
                        isWeekend: isWknd,
                        currentTime: `${day} ${timeStr} (Sydney Time)`,
                        marketStatus: statusStr,
                        marketStatus: statusStr,
                        portfolio: {
                            dayChangePercent: portfolio.totalPctChange.toFixed(2),
                            dayChangeValue: formatCurrency(portfolio.totalDayChangeVal),
                            totalValue: formatCurrency(portfolio.totalValue),
                            winners: highlights.portfolio.filter(h => h.pctChange > 0).sort((a, b) => b.pctChange - a.pctChange).slice(0, 3).map(h => `${h.code} ${h.pctChange.toFixed(1)}%`),
                            losers: highlights.portfolio.filter(h => h.pctChange < 0).sort((a, b) => a.pctChange - b.pctChange).slice(0, 3).map(h => `${h.code} ${h.pctChange.toFixed(1)}%`)
                        },
                        sentiment: marketSentiment.sentiment
                    };

                    const result = await ds.generateBriefing(context);
                    const el = document.getElementById('briefing-ai-summary');
                    if (el) {
                        if (result && result.ok && result.text) {
                            const modelName = result.model || 'Gemini 3 Flash';
                            console.log(`%c [${modelName}] Daily Briefing Recieved`, 'color: #00ff00; font-weight: bold;');
                            // Process markdown-ish bolding and fix remaining asterisks
                            const formatted = result.text
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3')
                                .replace(/\*/g, ''); // Sweep remaining asterisks
                            el.innerHTML = formatted;
                            el.style.animation = 'fadeIn 0.5s ease-in';
                        } else {
                            // Debugging Mode: Show detailed error
                            const err = (result && result.error) ? result.error : 'Unknown Error';
                            const msg = (err === 'userId required in payload')
                                ? 'Version Mismatch: App is hitting old code. Please Deploy New Version.'
                                : err;

                            el.innerHTML = `<span style="color:red; font-size: 0.8em; line-height: 1.2; display:block;"><i class="fas fa-bug"></i> ${msg}</span>`;
                        }
                    }
                } catch (e) {
                    console.warn('[BriefingUI] AI Gen failed', e);
                    const el = document.getElementById('briefing-ai-summary');
                    if (el) {
                        el.innerHTML = `<span style="color:red; font-size: 0.8em;">Client Exception: ${e.message}</span>`;
                    }
                }
            })();
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
            // Click-through removed as per user request (Reference: Chat 230)
            /*
            const header = modal.querySelector(`#${IDS.MARKET_PULSE_HEADER}`);
            if (header) {
                header.onclick = () => {
                    document.dispatchEvent(new CustomEvent('open-market-pulse'));
                };
            }
            */
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
                        ${iconHtml} ${UI_LABELS.MARKET_IS} ${marketSentiment.sentiment}
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

        const borderStyle = this._getBorderStyles(item.pctChange);

        return `
            <div class="${CSS_CLASSES.HIGHLIGHT_CARD} ${tintClass}" style="${borderStyle}" onclick="document.dispatchEvent(new CustomEvent('${EVENTS.ASX_CODE_CLICK}', { detail: { code: '${item.code}' } }))">
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

        const roastBtn = modal.querySelector('#btn-roast-portfolio');
        if (roastBtn) {
            roastBtn.addEventListener('click', async () => {
                const heroCard = modal.querySelector(`#${IDS.BRIEFING_PORTFOLIO_HERO}`);
                if (heroCard) {
                    heroCard.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff4444;font-weight:bold;"><i class="fas fa-fire fa-spin" style="margin-right:8px;"></i> Roasting...</div>';
                    heroCard.style.background = '#2a0a0a';
                    heroCard.style.borderColor = '#ff4444';
                }

                try {
                    const data = AppState.controller.calculateBriefingDigest();
                    const context = {
                        portfolio: data.portfolio,
                        highlights: data.highlights,
                        sentiment: data.marketSentiment.sentiment
                    };

                    const { DataService } = await import('../data/DataService.js');
                    const ds = new DataService();
                    const result = await ds.roastPortfolio(context);

                    if (heroCard) {
                        if (result && result.ok && result.text) {
                            const modelName = result.model || 'Gemini 3 Flash';
                            console.log(`%c [${modelName}] Portfolio Roast Recieved`, 'color: #00ff00; font-weight: bold;');
                            heroCard.innerHTML = `<div style="padding: 12px; font-size: 0.85em; line-height: 1.5; color: #fff; text-align: left;">${result.text.replace(/\n/g, '<br>')}</div>`;
                            heroCard.style.background = 'linear-gradient(135deg, #1a0505 0%, #4a0d0d 100%)';
                        } else {
                            const err = result ? result.error : 'Unknown';
                            heroCard.innerHTML = `<span style="color:red;font-size:0.8em">Roast Failed: ${err}</span>`;
                        }
                    }
                } catch (e) {
                    console.error(e);
                    if (heroCard) heroCard.innerHTML = `<span style="color:red">Client Error</span>`;
                }
            });
        }


        // Feature 4: Gemini Chat
        const askBtn = modal.querySelector('#btn-ask-market-direct');
        const askInput = modal.querySelector('#gemini-chat-input');

        const handleAsk = async (e) => {
            if (e) e.preventDefault();
            const query = askInput.value.trim();
            if (!query) return;

            console.log('[BriefingUI] %c ASKING GEMINI DIRECTLY: ' + query, 'color: #00ff00; font-weight: bold;');
            ToastManager.info('Asking AI...');
            askInput.value = '';

            try {
                const data = AppState.controller.calculateBriefingDigest();
                const context = {
                    portfolio: data.portfolio,
                    highlights: data.highlights,
                    sentiment: data.marketSentiment.sentiment
                };

                const { DataService } = await import('../data/DataService.js');
                const ds = new DataService();
                const result = await ds.askGemini('chat', query, context);

                if (result && result.ok && result.text) {
                    const { AiSummaryUI } = await import('./AiSummaryUI.js');
                    AiSummaryUI.showResult('AI Market Assistant', 'ASX', result.text, result.model);
                } else {
                    const err = (result && result.error) ? result.error : 'Backend Error';
                    ToastManager.error(`AI Error: ${err}`);
                }
            } catch (ex) {
                console.error('[BriefingUI] Chat Error:', ex);
                ToastManager.error('Failed to reach AI');
            }
        };

        if (askBtn) {
            askBtn.addEventListener('click', handleAsk);
        }

        if (askInput) {
            askInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleAsk();
            });
        }
    }

    static _getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return UI_LABELS.GOOD_MORNING;
        if (hour < 17) return UI_LABELS.GOOD_AFTERNOON;
        return UI_LABELS.GOOD_EVENING;
    }

    /**
     * Internal helper to calculate border style string based on prefs and performance.
     * Copied from ViewRenderer for consistency.
     */
    static _getBorderStyles(changePercent) {
        const prefs = AppState.preferences.containerBorders;
        // Default to empty if no prefs, BUT if user wants square corners generally, strictly speaking this only applies if borders are ON.
        // However, user complaint implies they HAVE borders enabled.
        if (!prefs || !prefs.sides || prefs.sides.every(s => s === 0)) return 'border-radius: 0 !important;';

        let color = 'var(--color-accent)';
        if (changePercent > 0) color = 'var(--color-positive)';
        else if (changePercent < 0) color = 'var(--color-negative)';

        const t = `${prefs.thickness}px`;
        const s = prefs.sides;

        let shadows = [];
        // Use inset box-shadow to achieve 90-degree square corners
        if (s[0]) shadows.push(`inset 0 ${t} 0 0 ${color}`); // Top
        if (s[1]) shadows.push(`inset -${t} 0 0 0 ${color}`); // Right
        if (s[2]) shadows.push(`inset 0 -${t} 0 0 ${color}`); // Bottom
        if (s[3]) shadows.push(`inset ${t} 0 0 0 ${color}`); // Left

        // Always return border-radius: 0 !important
        return shadows.length ? `box-shadow: ${shadows.join(', ')} !important; border-radius: 0 !important;` : 'border-radius: 0 !important;';
    }

    static _close(modal) {
        // Unsubscribe from Live Updates
        if (modal._priceUnsub) {
            modal._priceUnsub();
            modal._priceUnsub = null;
        }

        modal.classList.add(CSS_CLASSES.HIDDEN);
        setTimeout(() => modal.remove(), 300);
        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }
}
