/**
 * LinkHelper.js
 * Utility to generate external financial links for various asset types.
 * Supports Google Finance and Yahoo Finance.
 */

export class LinkHelper {
    /**
     * Generates a Google Finance URL for a given symbol.
     * @param {string} symbol - The asset symbol (e.g., 'BHP', 'XJO', 'AUDUSD').
     * @returns {string} - Google Finance URL.
     */
    static getGoogleFinanceUrl(symbol) {
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
     * Tapping triggers an internal summary.
     * Long-holding (or right-clicking) pre-pops the clipboard with a prompt and shows the native menu.
     * @param {HTMLElement} el - The element to bind.
     * @param {Function} getPrompt - Callback returning the deep-dive prompt string.
     * @param {Function} onShortPress - Callback for the internal AI analysis.
     */
    static bindGeminiInteraction(el, getPrompt, onShortPress) {
        if (!el) return;
        let holdTimer;

        const startHold = () => {
            holdTimer = setTimeout(async () => {
                try {
                    const prompt = getPrompt();
                    await navigator.clipboard.writeText(prompt);
                } catch (err) {
                    console.warn('Gemini clipboard prep failed', err);
                }
            }, 400); // Prime clipboard just before context menu (usually 500ms+)
        };

        const cancelHold = () => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        };

        // Pointer events for robust multi-device support
        el.addEventListener('pointerdown', startHold);
        ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach(evt => {
            el.addEventListener(evt, cancelHold);
        });

        // Native menu fallback (Right click / Long press)
        el.addEventListener('contextmenu', (e) => {
            // We do NOT preventDefault to allow native browser menus
            // But we ensure clipboard is ready even if timer was tight
            try {
                const prompt = getPrompt();
                navigator.clipboard.writeText(prompt).catch(() => { });
            } catch (err) { }
        });

        // Short press interception
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onShortPress();
        });
    }
}
