
import { ToastManager } from '../ui/ToastManager.js';
import { GeminiPromptMenu } from '../ui/GeminiPromptMenu.js';
import { AppState } from '../state/AppState.js';
import { AI_DEFAULT_TEMPLATES, EVENTS } from './AppConstants.js';

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
            return `https://www.google.com/finance/quote/${base}-USD`;
        }

        // 2. CRYPTO
        if (s === 'BTC' || s === 'ETH' || s === 'SOL') {
            return `https://www.google.com/finance/quote/${s}-USD`;
        }

        // 3. INDEX
        if (s.startsWith('^') || s === 'XJO' || s === 'AXJO') {
            const indexBase = s.replace('^', '');
            if (indexBase === 'AXJO' || indexBase === 'XJO') return `https://www.google.com/finance/quote/XJO:INDEXASX`;
            if (indexBase === 'GSPC' || indexBase === 'INX') return `https://www.google.com/finance/quote/.INX:INDEXSP`;
            if (indexBase === 'IXIC') return `https://www.google.com/finance/quote/.IXIC:INDEXNASDAQ`;
            if (indexBase === 'DJI') return `https://www.google.com/finance/quote/.DJI:INDEXDJI`;
            return `https://www.google.com/finance/quote/${indexBase}`;
        }

        // 4. EQUITIES (Default to ASX)
        if (!s.includes('.')) {
            return `https://www.google.com/finance/quote/${s}:ASX`;
        }

        return `https://www.google.com/finance/quote/${s}`;
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
     * Internal helper to show the intelligence menu.
     */
    static onShowIntelligence(e, getPrompt) {
        const result = getPrompt();
        let symbol = 'ASX';
        let checkText = '';

        if (typeof result === 'string') {
            checkText = result;
        } else if (Array.isArray(result) && result.length > 0) {
            checkText = typeof result[0] === 'string' ? result[0] : (result[0].text || '');
        }

        if (checkText) {
            const matches = checkText.match(/\b([A-Z0-9]{3,4})\b/g);
            if (matches) {
                symbol = matches.find(m => m !== 'ASX' && m !== 'HTML') || matches[0];
            }
        }

        const intelligencePrompts = AI_DEFAULT_TEMPLATES.map(t => ({
            label: t.label,
            icon: t.icon,
            internal: true,
            questionId: t.id
        }));

        GeminiPromptMenu.show(e, intelligencePrompts, (selected) => {
            if (selected.internal) {
                document.dispatchEvent(new CustomEvent(EVENTS.SHOW_AI_SUMMARY, {
                    detail: { symbol, questionId: selected.questionId }
                }));
            }
        });
    }

    /**
     * Binds Gemini interaction to an element.
     */
    static bindGeminiInteraction(el, getPrompt) {
        if (!el) return;

        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (AppState.preferences.oneTapResearch) {
                this.onShowIntelligence(e, getPrompt);
                return;
            }

            try {
                const result = getPrompt();
                if (!result) throw new Error('Prompts missing');
                const targetUrl = el.getAttribute('href') || 'https://gemini.google.com/app';

                if (Array.isArray(result)) {
                    GeminiPromptMenu.show(e, result, null, targetUrl);
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = result;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    ToastManager.info('COPIED: Paste into Gemini');
                    window.open(targetUrl, '_blank');
                }
            } catch (err) {
                console.warn('[LinkHelper] Click Failed:', err);
            }
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
