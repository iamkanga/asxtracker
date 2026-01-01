/**
 * BriefingUI.js
 * Renders the Daily Briefing modal with a summarized overview of market activity.
 * MATCHES NOTIFICATION CENTER LAYOUT (STRICT) WITH HEADERS AND SUBTITLES.
 */

import { notificationStore } from '../state/NotificationStore.js';
import { AppState } from '../state/AppState.js';
import { CSS_CLASSES, IDS, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';

export class BriefingUI {

    static show() {
        if (document.getElementById(IDS.DAILY_BRIEFING_MODAL)) return;

        const modal = this._renderModal();
        document.body.appendChild(modal);
        this._bindEvents(modal);

        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
        });
    }

    static _renderModal() {
        const modal = document.createElement('div');
        modal.id = IDS.DAILY_BRIEFING_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        const data = this._prepareData();

        // Use Data Timestamp if available, otherwise fallback to today
        const sourceTime = notificationStore.getDataTimestamp();
        const dateObj = sourceTime ? (sourceTime.toDate ? sourceTime.toDate() : new Date(sourceTime)) : new Date();
        const dateStr = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM} briefing-modal-content" style="max-height: 90vh;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}" style="display: flex; flex-direction: column; align-items: flex-start; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-coffee" style="color: var(--color-accent);"></i>
                            <span>Daily Briefing</span>
                        </div>
                        <div style="font-size: 0.55em; font-weight: 400; color: var(--text-muted); margin-left: 0;">Top 10 from each section</div>
                    </h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}" style="padding: 15px;">
                    <div class="briefing-date">${dateStr}</div>
                    
                    ${this._renderSection('Custom Triggers', data.subtitles.custom, data.custom, 'custom')}
                    ${this._renderSection('52-Week Lows', data.subtitles.low, data.lows, 'low')}
                    ${this._renderSection('52-Week Highs', data.subtitles.high, data.highs, 'high')}
                    ${this._renderSection('Global Losers', data.subtitles.losers, data.losers, 'down')}
                    ${this._renderSection('Global Gainers', data.subtitles.gainers, data.gainers, 'up')}

                    ${(data.custom.length === data.gainers.length === data.losers.length === data.highs.length === data.lows.length === 0)
                ? `<div class="briefing-empty">No significant market updates for today yet.</div>` : ''}
                </div>
                <div class="${CSS_CLASSES.MODAL_FOOTER}" style="text-align: center; color: var(--text-muted); font-size: 0.75rem; border-top: 1px solid var(--border-color); padding: 10px;">
                    Premium Market Intelligence • ASX Next
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

    static _renderSection(title, subtitle, items, type) {
        if (!items || items.length === 0) return '';

        let colorClass = 'text-accent';
        if (type === 'up' || type === 'high') colorClass = 'text-positive';
        if (type === 'down' || type === 'low') colorClass = 'text-negative';

        // Colored Subtitle Logic (matching NotificationUI)
        let subStyle = '';
        if (type === 'up' || type === 'high') subStyle = 'color: var(--color-positive);';
        if (type === 'down' || type === 'low') subStyle = 'color: var(--color-negative);';

        return `
            <div class="briefing-section">
                <div class="briefing-section-header">
                    <span class="briefing-section-title">${title}</span>
                    <span class="briefing-section-subtitle" style="${subStyle}">${subtitle || ''}</span>
                </div>
                <div class="briefing-grid-cards">
                    ${items.map(item => this._renderCard(item, type)).join('')}
                </div>
            </div>
        `;
    }

    static _renderCard(item, type) {
        // --- 1. Prepare Data & Logic ---

        // Helper to Generate Text for a Single Logic Item
        const getExplainer = (alertItem, alertType) => {
            const intent = alertItem.intent || '';
            const t = alertItem.target || alertItem.targetPrice || 0;

            // 1. PRICE TARGET
            if ((intent === 'target' || intent === 'target-hit' || alertType === 'custom') && t > 0) {
                const tPrice = formatCurrency(t);
                const p = Number(alertItem.price || 0);
                const dirArrow = (alertItem.direction === 'above' || p >= t) ? '▲' : '▼';
                return { text: `Target Hit ${dirArrow} ${tPrice}`, range: null };
            }
            // 1b. CUSTOM FALLBACK (Logic Update)
            if (alertType === 'custom') {
                // If NOT a target, show metrics like a Global Alert
                if (intent !== 'target' && intent !== 'target-hit') {
                    // DYNAMIC RULE PARAMETER DISPLAY
                    const pct = Number(alertItem.pct || alertItem.changeInPercent || 0);
                    // We need rules. We can infer them from NotificationStore if not passed, but _renderCard in BriefingUI doesn't accept rules currently?
                    // We must fix call site.
                    // Assuming 'rules' available in closure or we fetch. 
                    // Let's fetching from Store directly here is safest since static.
                    const rules = notificationStore.getScannerRules() || {};
                    const ruleSet = pct >= 0 ? (rules.up || {}) : (rules.down || {});

                    const arrow = pct >= 0 ? '▲' : '▼';
                    const hasPct = ruleSet.percentThreshold && ruleSet.percentThreshold > 0;
                    const hasDol = ruleSet.dollarThreshold && ruleSet.dollarThreshold > 0;

                    if (hasPct || hasDol) {
                        const parts = [];
                        if (hasPct) parts.push(`${ruleSet.percentThreshold}%`);
                        if (hasDol) parts.push(`$${ruleSet.dollarThreshold}`);
                        return { text: `Price ${arrow} ${parts.join(' or ')}`, range: null };
                    } else {
                        return { text: `Price ${arrow} ${Math.abs(pct).toFixed(2)}%`, range: null };
                    }
                }
                // Absolute Fallback
                return { text: alertItem.comments?.[0]?.body || 'Alert Triggered', range: null };
            }

            // 2. 52-WEEK HIGH / LOW
            const isHiLo = intent === 'hilo' || intent.includes('hilo') || alertType === 'low' || alertType === 'high';
            if (isHiLo) {
                const low = (alertItem.low52 || alertItem.low || 0).toFixed(2);
                const high = (alertItem.high52 || alertItem.high || 0).toFixed(2);
                return { text: '52w Range', range: `${low}-${high}` };
            }

            // 3. GLOBAL MOVERS
            const isMover = intent === 'mover' || intent === 'up' || intent === 'down' || alertType === 'up' || alertType === 'down';
            if (isMover) {
                const isUp = type === 'up' || intent === 'up' || alertType === 'up';
                const dirArrow = isUp ? '▲' : '▼';
                return { text: `Price ${dirArrow}`, range: null };
            }

            return { text: '', range: null };
        };

        const obj = getExplainer(item, type);
        let explainerText = obj.text;
        let explainerRange = obj.range || '';

        // --- ROBUST KEY MAPPING & ENRICHMENT ---
        let code = String(item.code || item.shareName || item.symbol || item.s || '???').toUpperCase();
        let name = item.name || '';
        let rawPrice = item.live || item.price || item.last || item.closePrice || 0;
        let price = formatCurrency(rawPrice);

        // --- PRECISE DAILY CHANGE LOGIC (User Request: "Daily percentage change. That needs to be there.") ---
        let changePct = 0;
        let changeAmt = 0;

        // 1. Try Live Cache (Most reliable for "Daily")
        let cleanCode = code.replace(/\.AX$/i, '').trim().toUpperCase();
        let liveShare = null;
        if (AppState.livePrices && AppState.livePrices instanceof Map) {
            liveShare = AppState.livePrices.get(cleanCode) || AppState.livePrices.get(code);
        }

        // 2. Try App State (Fallback)
        if (!liveShare) {
            liveShare = AppState.data.shares.find(s => {
                const sCode = String(s.code || s.shareName || s.symbol || '').toUpperCase();
                return sCode === cleanCode || sCode === code;
            });
        }

        if (liveShare) {
            // Apply Name Polyfill
            if (!name) {
                name = liveShare.companyName || liveShare.name || '';
                name = name.replace(/\(ASX:[^)]+\)/gi, '').replace(/\bL\.?T\.?D\.?\b/gi, '').replace(/\bLimited\b/gi, '').trim();
            }

            // Calculate Changes (Prioritize explicit day changes)
            // 'dayChangePercent' is standard, 'changeInPercent' is API.
            changePct = Number(liveShare.dayChangePercent || liveShare.changeInPercent || liveShare.pct || liveShare.pctChange || 0);
            changeAmt = Number(liveShare.change || liveShare.c || 0);

            // Fix Price if 0 (e.g. market closed)
            const currentPrice = Number(liveShare.live || liveShare.price || liveShare.last || 0);
            if (rawPrice === 0 && currentPrice > 0) {
                rawPrice = currentPrice;
                price = formatCurrency(rawPrice);
            }
        } else {
            // Fallback to Item Data (Snapshot) if Live not found
            changePct = Number(item.pct || item.changeP || item.cp || item.changePercent || item.pctChange || 0);
            changeAmt = Number(item.change || item.c || 0);
        }

        // Force Direction for specific categories? 
        // NO. If it's a "Top Gainer" but currently down (market swung), show the REAL daily change.
        // But for visual consistency with the SECTION (Gainers), usually we expect green.
        // However, user asked for "Daily percentage change", implying accuracy.
        // For 'up'/'down' sections, if the stock flipped, it might look odd, but it's accurate.
        // Let's stick to accurate Daily Change.

        let changeClass = changePct >= 0 ? 'positive' : 'negative';
        let arrowIcon = changePct >= 0 ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';

        // Format: arrow, Amount, (Percent)
        let changeFormatted = `${arrowIcon} ${formatCurrency(Math.abs(changeAmt))} (${Math.abs(changePct).toFixed(2)}%)`;

        // Card Border Class Logic (Visual Feedback)
        let cardClass = 'card-neutral';

        // 1. Custom/Target -> Coffee (Neutral) ONLY if specific Target
        if (item.intent === 'target' || item.intent === 'target-hit') {
            cardClass = 'card-target'; // Explicit Coffee (New Class)
        }
        else if (type === 'custom') {
            // If local alert but global logic (e.g. pinned stock global hit), use direction
            if (changePct > 0) cardClass = 'card-up';
            else if (changePct < 0) cardClass = 'card-down';
        }
        // 2. Highs/Gainers -> Green (Up) ALWAYS
        else if (type === 'high' || type === 'up') {
            cardClass = 'card-up';
        }
        // 3. Lows/Losers -> Red (Down) ALWAYS
        else if (type === 'low' || type === 'down') {
            cardClass = 'card-down';
        }
        else {
            if (changePct > 0) cardClass = 'card-up';
            else if (changePct < 0) cardClass = 'card-down';
        }

        if (item._isPinned) cardClass += ' card-pinned';

        // --- RENDER HTML (EXACT MATCH to NotificationUI) ---
        return `
            <div class="notification-card-grid ${cardClass}" data-code="${code}" style="cursor: pointer;">
                <!-- R1: CODE | PRICE -->
                <div class="notif-cell-code">${code}</div>
                <div class="notif-cell-price">${price}</div>

                <!-- R2: NAME | CHANGE -->
                <div class="notif-cell-name">${name}</div>
                <div class="notif-cell-change ${changeClass}">${changeFormatted}</div>

                <!-- R3: EXPLAINER | RANGE (Ghosted via Styles) -->
                <div class="notif-cell-explainer ghosted-meta">${explainerText}</div>
                <div class="notif-cell-range ghosted-meta">${explainerRange}</div>
            </div>
        `;
    }

    static _prepareData() {
        // Fetch raw data
        const local = notificationStore.getLocalAlerts() || { pinned: [], fresh: [] };
        const global = notificationStore.getGlobalAlerts(true) || { movers: { up: [], down: [] }, hilo: { high: [], low: [] } };

        // Fetch Rules for Subtitles
        const rules = notificationStore.getScannerRules() || {};

        // Helper to format rules (Ported from NotificationUI)
        const fmtRules = (r, dir) => {
            const icon = dir === 'up' ? '▲ ' : '▼ ';
            const hasPct = r.percentThreshold && r.percentThreshold > 0;
            const hasDol = r.dollarThreshold && r.dollarThreshold > 0;

            if (!hasPct && !hasDol) return 'Not set';
            const parts = [];
            if (hasPct) parts.push(`${icon}${r.percentThreshold}%`);
            if (hasDol) parts.push(`${icon}$${r.dollarThreshold}`);
            return parts.join(' or ');
        };

        // Prepare Subtitles
        const minPriceVal = rules.up?.minPrice || rules.down?.minPrice || 0;
        const thresholdStr = (minPriceVal > 0) ? `Min $${minPriceVal}` : '';
        const thresholdStrColored = thresholdStr ? `<span style="color: var(--color-accent);">${thresholdStr}</span>` : '';

        // Gainers Subtitle
        const upRuleStr = fmtRules(rules.up || {}, 'up');
        const upStr = (upRuleStr === 'Not set' && !thresholdStr) ? 'Not set' : (upRuleStr === 'Not set' ? thresholdStrColored : `${upRuleStr}${thresholdStr ? ` • ${thresholdStrColored}` : ''}`);

        // Losers Subtitle
        const downRuleStr = fmtRules(rules.down || {}, 'down');
        const downStr = (downRuleStr === 'Not set' && !thresholdStr) ? 'Not set' : (downRuleStr === 'Not set' ? thresholdStrColored : `${downRuleStr}${thresholdStr ? ` • ${thresholdStrColored}` : ''}`);

        // HiLo Subtitle
        const hiloPriceVal = rules.hiloMinPrice ?? 0;
        const hiloStr = (hiloPriceVal > 0) ? `<span style="color: var(--color-accent);">Min Price $${hiloPriceVal}</span>` : 'Not set';

        // SORT: Target Hits First
        const customItems = [...(local.pinned || []), ...(local.fresh || [])].sort((a, b) => {
            const isTargetA = a.intent === 'target' || a.intent === 'target-hit';
            const isTargetB = b.intent === 'target' || b.intent === 'target-hit';
            if (isTargetA && !isTargetB) return -1;
            if (!isTargetA && isTargetB) return 1;
            return 0;
        });

        return {
            custom: customItems.slice(0, 10),
            gainers: (global.movers?.up || []).slice(0, 10),
            losers: (global.movers?.down || []).slice(0, 10),
            highs: (global.hilo?.high || []).slice(0, 10),
            lows: (global.hilo?.low || []).slice(0, 10),
            subtitles: {
                custom: '<span style="color: var(--color-accent);">Personal Alerts</span>',
                gainers: upStr,
                losers: downStr,
                high: hiloStr,
                low: hiloStr
            }
        };
    }

    static _bindEvents(modal) {
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);

        const closeHandler = () => this._close(modal);
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
        if (overlay) overlay.addEventListener('click', closeHandler);

        modal.addEventListener('click', (e) => {
            const item = e.target.closest('.notification-card-grid');
            if (item && item.dataset.code) {
                const code = item.dataset.code;
                document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code } }));
                this._close(modal);
            }
        });
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
