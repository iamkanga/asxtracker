/**
 * LinkHelper.js
 * Utility to generate external financial links for various asset types.
 * Supports Google Finance and Yahoo Finance.
 */

import { ToastManager } from '../ui/ToastManager.js';
import { GeminiPromptMenu } from '../ui/GeminiPromptMenu.js';

export class LinkHelper {
    // ... (rest of class)

    /**
     * Binds Gemini dual-interaction to an element.
     * Tapping triggers an internal summary.
     * Long-holding (or right-clicking) pre-pops the clipboard with a prompt and shows the native menu.
     * @param {HTMLElement} el - The element to bind.
     * @param {Function} getPrompt - Callback returning the deep-dive prompt string.
     * @param {Function} onShortPress - Callback for the internal AI analysis.
     */
    static bindGeminiInteraction(el, getPrompt, onShortPress) {
        if (!el) return;
        let holdTimer;

        const triggerLongAction = async (e) => {
            console.log('[LinkHelper] Triggering Long Action');
            try {
                // Prevent default menu/click immediately
                e.preventDefault();
                e.stopPropagation();

                const result = getPrompt();
                console.log('[LinkHelper] Prompt Result:', Array.isArray(result) ? 'Array' : result);

                if (Array.isArray(result)) {
                    // ARRAY: Show Menu
                    GeminiPromptMenu.show(e, result);
                    if (navigator.vibrate) navigator.vibrate(50);
                } else {
                    // STRING: Legacy behavior (Copy & Allow Native Menu)
                    await navigator.clipboard.writeText(result);
                    ToastManager.info('Prompt Copied', 'Ready to Paste');
                }
            } catch (err) {
                console.warn('[LinkHelper] Interaction Warning:', err);
                ToastManager.error(`Menu Error: ${err.message || 'Unknown'}`);
            }
        };
        if (!symbol) return '';
        const s = symbol.toUpperCase().trim();

        // 1. FOREX
        // AUDUSD, AUDTHB, etc.
        if (s.length === 6 && !s.includes('.') && !s.includes('=') && !s.includes('-')) {
            return `https://www.google.com/finance/quote/${s.substring(0, 3)}-${s.substring(3, 6)}`;
        }
        if (s.endsWith('=X')) {
            const base = s.replace('=X', '');
            if (base.length === 6) {
                return `https://www.google.com/finance/quote/${base.substring(0, 3)}-${base.substring(3, 6)}`;
            }
            // Spot rates
            if (base.startsWith('XAU')) return `https://www.google.com/finance/quote/XAU-USD`;
            if (base.startsWith('XAG')) return `https://www.google.com/finance/quote/XAG-USD`;
        }

        // 2. CRYPTO
        if (s.startsWith('BTC')) {
            // BTCUSD, BTC-USD, BTC-AUD
            if (s.includes('AUD')) return `https://www.google.com/finance/quote/BTC-AUD`;
            return `https://www.google.com/finance/quote/BTC-USD`;
        }

        // 3. INDICES
        const indexMap = {
            'XJO': 'XJO:INDEXASX',
            '^AXJO': 'XJO:INDEXASX',
            'XKO': 'XKO:INDEXASX',
            'XAO': 'XAO:INDEXASX',
            'INX': '.INX:INDEXSP',
            '^GSPC': '.INX:INDEXSP',
            '.DJI': '.DJI:INDEXDJX',
            '^DJI': '.DJI:INDEXDJX',
            '.IXIC': '.IXIC:INDEXNASDAQ',
            '^IXIC': '.IXIC:INDEXNASDAQ',
            '^VIX': 'VIX:INDEXCBOE',
            '^FTSE': 'UKX:INDEXFTSE',
            '^N225': 'NI225:INDEXNIKKEI',
            '^HSI': 'HSI:INDEXHANGSENG',
            '^STOXX50E': 'SX5E:INDEXEURO'
        };
        if (indexMap[s]) {
            return `https://www.google.com/finance/quote/${indexMap[s]}`;
        }

        // 4. FUTURES / COMMODITIES (Google has limited support for exact codes, often search is better)
        const commodityMap = {
            'GCW00': 'Gold',
            'GC=F': 'Gold',
            'SIW00': 'Silver',
            'SI=F': 'Silver',
            'BZW00': 'Brent+Crude+Oil',
            'BZ=F': 'Brent+Crude+Oil',
            'CL=F': 'Crude+Oil',
            'TIO=F': 'Iron+Ore+Futures'
        };
        if (commodityMap[s]) {
            return `https://www.google.com/search?q=${commodityMap[s]}+finance`;
        }

        // 5. SHARES (Default to ASX)
        // Strip .AX and append :ASX
        let cleanCode = s.split('.')[0];
        // If it looks like a standard ticker (3-4 chars)
        if (cleanCode.length >= 1 && cleanCode.length <= 6 && !cleanCode.includes('^') && !cleanCode.includes('=')) {
            return `https://www.google.com/finance/quote/${cleanCode}:ASX`;
        }

        // Fallback: Google Search
        return `https://www.google.com/search?q=${encodeURIComponent(s)}+finance`;
    }

    /**
     * Generates a Yahoo Finance URL for a given symbol.
     * @param {string} symbol - The asset symbol.
     * @returns {string} - Yahoo Finance URL.
     */
    static getYahooFinanceUrl(symbol) {
        if (!symbol) return '';
        const s = symbol.toUpperCase().trim();

        let yahooSymbol = s;
        // Map common codes to Yahoo specific ones if necessary
        if (s === 'XJO') yahooSymbol = '^AXJO';
        if (s === 'XKO') yahooSymbol = '^AXKO';
        if (s === 'XAO') yahooSymbol = '^AORD';
        if (s === 'INX') yahooSymbol = '^GSPC';

        // Forex
        if (s.length === 6 && !s.includes('.') && !s.includes('=') && !s.includes('-')) {
            yahooSymbol = `${s}=X`;
        }

        // Commodities
        if (s === 'GCW00') yahooSymbol = 'GC=F';
        if (s === 'SIW00') yahooSymbol = 'SI=F';
        if (s === 'BZW00') yahooSymbol = 'BZ=F';

        // Crypto
        if (s === 'BTCUSD') yahooSymbol = 'BTC-USD';

        // ASX Shares (Append .AX if no other suffix)
        if (yahooSymbol.length >= 1 && yahooSymbol.length <= 6 &&
            !yahooSymbol.includes('.') && !yahooSymbol.includes('=') && !yahooSymbol.startsWith('^')) {
            yahooSymbol = `${yahooSymbol}.AX`;
        }

        return `https://finance.yahoo.com/quote/${yahooSymbol}`;
    }

    /**
     * Gets the preferred finance URL (Yahoo Finance).
     * @param {string} symbol
     * @returns {string}
     */
    static getFinanceUrl(symbol) {
        return this.getYahooFinanceUrl(symbol);
    }

    /**
     * Binds Gemini dual-interaction to an element.
     * TAPPING triggers the prompt menu/clipboard preparation.
     * LONG-HOLDING (or Right-Click) triggers the internal AI analysis.
     * @param {HTMLElement} el - The element to bind.
     * @param {Function} getPrompt - Callback returning the prompt(s) (String or Array).
     * @param {Function} onInternalAI - Callback for the internal AI analysis (1.5).
     */
    static bindGeminiInteraction(el, getPrompt, onInternalAI) {
        if (!el) return;
        let holdTimer;
        let isLongPress = false;

        const triggerMenuAction = async (e) => {
            console.log('[LinkHelper] Triggering Prompt Menu (Tap)');
            try {
                // Prevent default specifically if it's a link to allow our logic
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                const result = getPrompt();
                if (Array.isArray(result)) {
                    GeminiPromptMenu.show(e, result);
                    if (navigator.vibrate) navigator.vibrate(50);
                } else {
                    await navigator.clipboard.writeText(result);
                    ToastManager.info('Prompt Copied', 'Ready to Paste');
                }
            } catch (err) {
                console.warn('[LinkHelper] Menu Error:', err);
                ToastManager.error(`Menu Error: ${err.message || 'Unknown'}`);
            }
        };

        const triggerInternalAI = (e) => {
            console.log('[LinkHelper] Triggering Internal AI (Hold)');
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (navigator.vibrate) navigator.vibrate(100);
            onInternalAI(e);
        };

        const startHold = (e) => {
            if (e.button !== 0) return; // Only left click
            isLongPress = false;
            holdTimer = setTimeout(() => {
                isLongPress = true;
                triggerInternalAI(e);
            }, 600);
        };

        const cancelHold = () => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        };

        el.addEventListener('pointerdown', startHold);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
            el.addEventListener(evt, cancelHold);
        });

        // Right Click/Context Menu triggers Internal AI
        el.addEventListener('contextmenu', (e) => {
            cancelHold();
            triggerInternalAI(e);
        });

        el.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            triggerMenuAction(e);
        });
    }

    /**
     * URL-safe slugify helper.
     * @param {string} text 
     * @returns {string} slugified text
     */
    static slugify(text) {
        if (!text) return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')           // Replace spaces with -
            .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
            .replace(/\-\-+/g, '-')         // Replace multiple - with single -
            .replace(/^-+/, '')             // Trim - from start of text
            .replace(/-+$/, '');            // Trim - from end of text
    }

    /**
     * Replaces placeholders in a URL template.
     * Supported: ${code}, ${code_lower}, ${name_slug} (and $ versions)
     * @param {string} template 
     * @param {Object} stock { code, name }
     * @returns {string} substituted URL
     */
    static replacePlaceholders(template, stock) {
        if (!template) return '';
        if (!stock) return template;

        const code = (stock.code || '').toString();
        const name = (stock.name || '').toString();
        const slug = this.slugify(name);

        let result = template;

        // Use a standard approach: Replace all variations of placeholders
        // We support both ${tag} and $(tag) and $tag
        const patterns = {
            code_lower: /\$(?:\{code_lower\}|\(code_lower\)|code_lower)/gi,
            name_slug: /\$(?:\{name_slug\}|\(name_slug\)|name_slug)/gi,
            code: /\$(?:\{code\}|\(code\)|code)/gi
        };

        result = result.replace(patterns.code_lower, code.toLowerCase());
        result = result.replace(patterns.name_slug, slug);
        result = result.replace(patterns.code, code.toUpperCase());

        return result;
    }
}
