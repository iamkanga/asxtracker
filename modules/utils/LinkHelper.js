
import { ToastManager } from '../ui/ToastManager.js';
import { GeminiPromptMenu } from '../ui/GeminiPromptMenu.js';
import { AppState } from '../state/AppState.js';
import { AI_DEFAULT_TEMPLATES, EVENTS, UI_LABELS } from './AppConstants.js';

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
    static onShowIntelligence(e, getPrompt, forceExternal = false) {
        const result = getPrompt();
        let symbol = 'ASX';
        let checkText = '';
        let customPrompts = null;

        if (typeof result === 'string') {
            checkText = result;
        } else if (Array.isArray(result) && result.length > 0) {
            customPrompts = result;
            checkText = typeof result[0] === 'string' ? result[0] : (result[0].text || '');
        }

        if (checkText) {
            const matches = checkText.match(/\b([A-Z0-9]{3,4})\b/g);
            if (matches) {
                symbol = matches.find(m => m !== 'ASX' && m !== 'HTML') || matches[0];
            }
        }

        // Use Passed Prompts if they are rich templates, else fallback to Standard AI Templates
        const baseTemplates = (customPrompts && customPrompts.length > 0 && customPrompts[0].label)
            ? customPrompts
            : AI_DEFAULT_TEMPLATES;

        const intelligencePrompts = baseTemplates.map(t => ({
            label: t.label,
            icon: t.icon,
            internal: t.internal !== undefined ? t.internal : (!!t.id), // If it has an ID, it's a standard internal template
            questionId: t.id,
            // Populate text for external copying (Gemini PWA mode)
            text: LinkHelper.replacePlaceholders(t.text, { code: symbol })
        }));

        GeminiPromptMenu.show(e, intelligencePrompts, (selected) => {
            if (selected.internal && !forceExternal) {
                // If it has a questionId, route through the standard Summary UI (which has caching/skeletons)
                if (selected.questionId) {
                    document.dispatchEvent(new CustomEvent(EVENTS.SHOW_AI_SUMMARY, {
                        detail: { symbol, questionId: selected.questionId }
                    }));
                } else {
                    // It's a custom prompt (like from GEMINI_PROMPTS.STOCK)
                    // We route it as a 'explain' query but with the specific text
                    ToastManager.info(`${UI_LABELS.ASKING_GEMINI} ${symbol}...`);
                    Promise.all([
                        import('../data/DataService.js'),
                        import('../ui/AiSummaryUI.js')
                    ]).then(([{ DataService }, { AiSummaryUI }]) => {
                        AiSummaryUI.showLoading(symbol, selected.label);
                        const ds = new DataService();
                        ds.askGemini('explain', selected.text, { symbol }).then(res => {
                            if (res.ok) {
                                AiSummaryUI.showResult(selected.label, symbol, res.text, res.model);
                            } else {
                                ToastManager.error(`AI Error: ${res.error || 'Failed'}`);
                            }
                        });
                    });
                }
            }
        }, 'https://gemini.google.com/app', forceExternal);
    }

    /**
     * Binds Gemini interaction to an element.
     * @param {HTMLElement} el The element to bind to
     * @param {Function} getPrompt Callback returning the prompt text or array
     * @param {Function} [onTap] Optional callback for short-tap (e.g. internal AI)
     */
    static bindGeminiInteraction(el, getPrompt, onTap = null) {
        if (!el) return;

        let pressTimer = null;
        let isLongPress = false;

        const handlePressStart = (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                // Vibrational feedback if available
                if (navigator.vibrate) navigator.vibrate(50);

                // Trigger LONG PRESS behavior: Always External
                const quickSummaryOn = AppState.preferences.oneTapResearch !== false;
                if (quickSummaryOn) {
                    this.onShowIntelligence(e, getPrompt, true); // Force External
                } else {
                    const result = getPrompt();
                    const targetUrl = el.getAttribute('href') || 'https://gemini.google.com/app';
                    if (Array.isArray(result)) {
                        GeminiPromptMenu.show(e, result, null, targetUrl, true);
                    } else {
                        this._openExternal(result, targetUrl);
                    }
                }
            }, 600); // 600ms for long press
        };

        const handlePressEnd = (e) => {
            clearTimeout(pressTimer);
        };

        // Long press detection for both touch and mouse
        el.addEventListener('touchstart', handlePressStart, { passive: true });
        el.addEventListener('touchend', handlePressEnd, { passive: true });
        el.addEventListener('mousedown', handlePressStart);
        el.addEventListener('mouseup', handlePressEnd);
        el.addEventListener('mouseleave', handlePressEnd);

        el.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
                isLongPress = false;
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            // Short Tap Behavior
            if (onTap) {
                onTap(e);
                return;
            }

            const quickSummaryOn = AppState.preferences.oneTapResearch !== false;

            if (quickSummaryOn) {
                // Internal summary (Show Menu)
                this.onShowIntelligence(e, getPrompt, false);
            } else {
                // External PWA
                try {
                    const result = getPrompt();
                    if (!result) throw new Error('Prompts missing');
                    const targetUrl = el.getAttribute('href') || 'https://gemini.google.com/app';

                    if (Array.isArray(result)) {
                        GeminiPromptMenu.show(e, result, null, targetUrl, true); // Force external
                    } else {
                        this._openExternal(result, targetUrl);
                    }
                } catch (err) {
                    console.warn('[LinkHelper] Tap Failed:', err);
                }
            }
        });
    }

    static _openExternal(promptText, targetUrl) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = promptText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            ToastManager.info('COPIED: Paste into Gemini');
        } catch (err) {
            console.warn('[LinkHelper] Clipboard fail:', err);
        }

        const ua = navigator.userAgent;
        const plat = navigator.platform;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isAndroid = /Android/i.test(ua) && isTouch && !/Win32|Win64|MacIntel/i.test(plat);

        if (isAndroid) {
            const intentUrl = `intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;S.browser_fallback_url=${encodeURIComponent(targetUrl)};end`;
            window.open(intentUrl, '_blank', 'noopener,noreferrer');
        } else {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
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

    /**
     * UNIVERSAL LINK OPENER: "The App Browser"
     * Forces the link to open in an integrated Custom Tab on Android 
     * instead of flipping over to the main Chrome browser.
     */
    static openInAppBrowser(url) {
        if (!url) return;

        // Ensure we have a valid absolute URL
        let finalUrl = url;
        if (!finalUrl.startsWith('http')) {
            finalUrl = finalUrl.startsWith('//') ? 'https:' + finalUrl : 'https://' + finalUrl;
        }

        const ua = navigator.userAgent;
        const plat = navigator.platform;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isAndroid = /Android/i.test(ua) && isTouch && !/Win32|Win64|MacIntel/i.test(plat);

        if (isAndroid) {
            // Android Chrome Intent - This "nudges" the phone to use the Custom Tab (In-App) view 
            // if the app is running in PWA/Standalone mode.
            const cleanUrl = finalUrl.replace(/^https?:\/\//, '');
            const fallback = encodeURIComponent(finalUrl);
            const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
            window.open(intentUrl, '_blank', 'noopener,noreferrer');
        } else {
            // iOS / Desktop : Standard cross-origin open
            // Browsers like Safari handle this automatically for PWAs by showing a "Done" button.
            window.open(finalUrl, '_blank', 'noopener,noreferrer');
        }
    }
}
