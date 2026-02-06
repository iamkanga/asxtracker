
import { ToastManager } from '../ui/ToastManager.js';
import { GeminiPromptMenu } from '../ui/GeminiPromptMenu.js';

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
        if (s.length === 6 && !s.includes('.') && !s.includes('=') && !s.includes('-')) {
            return `https://www.google.com/finance/quote/${s.substring(0, 3)}-${s.substring(3, 6)}`;
        }
        if (s.endsWith('=X')) {
            const base = s.replace('=X', '');
            if (base.length === 6) {
                return `https://www.google.com/finance/quote/${base.substring(0, 3)}-${base.substring(3, 6)}`;
            }
            if (base.startsWith('XAU')) return `https://www.google.com/finance/quote/XAU-USD`;
            if (base.startsWith('XAG')) return `https://www.google.com/finance/quote/XAG-USD`;
        }

        // 2. CRYPTO
        if (s.startsWith('BTC')) {
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
            '.IXIC': '.IXIC:INDEXNASDAQ',
            '^VIX': 'VIX:INDEXCBOE',
            '^FTSE': 'UKX:INDEXFTSE',
            '^N225': 'NI225:INDEXNIKKEI',
            '^HSI': 'HSI:INDEXHANGSENG',
            '^STOXX50E': 'SX5E:INDEXEURO'
        };
        if (indexMap[s]) return `https://www.google.com/finance/quote/${indexMap[s]}`;

        // 4. COMMODITIES
        const commodityMap = {
            'GCW00': 'Gold', 'GC=F': 'Gold',
            'SIW00': 'Silver', 'SI=F': 'Silver',
            'BZW00': 'Brent+Crude+Oil', 'BZ=F': 'Brent+Crude+Oil',
            'CL=F': 'Crude+Oil', 'TIO=F': 'Iron+Ore+Futures'
        };
        if (commodityMap[s]) return `https://www.google.com/search?q=${commodityMap[s]}+finance`;

        // 5. SHARES (Default to ASX)
        let cleanCode = s.split('.')[0];
        if (cleanCode.length >= 1 && cleanCode.length <= 6 && !cleanCode.includes('^') && !cleanCode.includes('=')) {
            return `https://www.google.com/finance/quote/${cleanCode}:ASX`;
        }

        return `https://www.google.com/search?q=${encodeURIComponent(s)}+finance`;
    }

    /**
     * Generates a Yahoo Finance URL for a given symbol.
     */
    static getYahooFinanceUrl(symbol) {
        if (!symbol) return '';
        const s = symbol.toUpperCase().trim();
        let yahooSymbol = s;
        if (s === 'XJO') yahooSymbol = '^AXJO';
        if (s === 'XKO') yahooSymbol = '^AXKO';
        if (s === 'XAO') yahooSymbol = '^AORD';
        if (s === 'INX') yahooSymbol = '^GSPC';
        if (s.length === 6 && !s.includes('.') && !s.includes('=') && !s.includes('-')) yahooSymbol = `${s}=X`;
        if (s === 'GCW00') yahooSymbol = 'GC=F';
        if (s === 'SIW00') yahooSymbol = 'SI=F';
        if (s === 'BZW00') yahooSymbol = 'BZ=F';
        if (s === 'BTCUSD') yahooSymbol = 'BTC-USD';
        if (yahooSymbol.length >= 1 && yahooSymbol.length <= 6 && !yahooSymbol.includes('.') && !yahooSymbol.includes('=') && !yahooSymbol.startsWith('^')) {
            yahooSymbol = `${yahooSymbol}.AX`;
        }
        return `https://finance.yahoo.com/quote/${yahooSymbol}`;
    }

    static getFinanceUrl(symbol) {
        return this.getYahooFinanceUrl(symbol);
    }

    /**
     * Binds Gemini dual-interaction to an element.
     * TAPPING triggers Choice Menu -> Selection -> Copy + Open Gemini.
     * LONG-HOLDING (or Right Click) triggers Internal AI (1.5).
     */
    static bindGeminiInteraction(el, getPrompt, onInternalAI) {
        if (!el) return;
        let pressStartTime = 0;
        let isHoldTriggered = false;
        let holdTimer;

        // Visual fix: ensure standard OS features don't block our custom hold
        const ua = navigator.userAgent;
        const plat = navigator.platform;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        // Real Android devices won't report as Win32 or MacIntel
        const isAndroid = /Android/i.test(ua) && isTouch && !/Win32|Win64|MacIntel/i.test(plat);
        const isMobile = isAndroid || /iPhone|iPad|iPod/i.test(ua);

        const openGemini = () => {
            const baseUrl = el.getAttribute('href') || 'https://gemini.google.com/app';

            if (isAndroid) {
                // Reverting to window.open to prevent the main app from navigating away.
                // This restores the stability that prevents the 're-signing' reload.
                const intentUrl = `intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;S.browser_fallback_url=${encodeURIComponent(baseUrl)};end`;
                window.open(intentUrl, '_blank');
            } else if (isMobile) {
                // Standard mobile: Use open to keep tracker in background
                window.open(baseUrl, '_blank');
            } else {
                // Desktop: Standard new tab
                window.open(baseUrl, '_blank');
            }
        };

        const triggerTap = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            try {
                const result = getPrompt();
                if (!result) throw new Error('Prompts missing');
                const targetUrl = el.getAttribute('href') || 'https://gemini.google.com/app';

                if (Array.isArray(result)) {
                    GeminiPromptMenu.show(e, result, null, targetUrl);
                } else {
                    // Single prompt logic: Copy and then Launch
                    const textArea = document.createElement("textarea");
                    textArea.value = result;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    ToastManager.info('COPIED: Paste into Gemini');

                    openGemini();
                }
            } catch (err) {
                console.warn('[LinkHelper] Tap Failed:', err);
            }
        };

        const triggerHold = (e) => {
            console.log('[LinkHelper] Executing Hold Action (1.5)');
            isHoldTriggered = true;
            if (e && e.preventDefault) e.preventDefault();
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            onInternalAI(e);
        };

        el.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pressStartTime = performance.now();
            isHoldTriggered = false;

            holdTimer = setTimeout(() => {
                triggerHold(e);
            }, 600);
        });

        el.addEventListener('pointerup', (e) => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }

            const duration = performance.now() - pressStartTime;
            console.log('[LinkHelper] PointerUp. Duration:', duration, 'Hold Triggered:', isHoldTriggered);

            if (!isHoldTriggered && duration < 600) {
                // This was a SHORT TAP
                triggerTap(e);
            }
        });

        el.addEventListener('pointerleave', () => {
            if (holdTimer) clearTimeout(holdTimer);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (holdTimer) clearTimeout(holdTimer);
            triggerHold(e);
        });

        // Block standard click to prevent interference with our custom logic
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    static slugify(text) {
        if (!text) return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    static replacePlaceholders(template, stock) {
        if (!template) return '';
        if (!stock) return template;
        const code = (stock.code || '').toString();
        const name = (stock.name || '').toString();
        const slug = this.slugify(name);

        return template
            .replace(/\$(?:\{code_lower\}|\(code_lower\)|code_lower)/gi, code.toLowerCase())
            .replace(/\$(?:\{name_slug\}|\(name_slug\)|name_slug)/gi, slug)
            .replace(/\$(?:\{code\}|\(code\)|code)/gi, code.toUpperCase());
    }
}
