import { CSS_CLASSES, UI_ICONS, IDS, EVENTS } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';
import { AppState } from '../state/AppState.js';

/**
 * GeminiPromptMenu.js
 * Shows a context menu with predefined Gemini prompts.
 * Optimized for Android App Launch and Localhost reliability.
 */
export class GeminiPromptMenu {

    static show(event, prompts, onSelect, targetUrl = 'https://gemini.google.com/app', forceExternal = false) {
        this.close();

        // Try to identify context symbol (e.g. CBA) from prompts or targetUrl context
        let contextSymbol = 'ASX';
        const checkText = prompts.length > 0 ? (prompts[0].text || '') : '';
        if (checkText) {
            const matches = checkText.match(/\b([A-Z0-9]{3,4})\b/g);
            if (matches) {
                contextSymbol = matches.find(m => m !== 'ASX' && m !== 'HTML') || matches[0];
            }
        }

        // 1. Create Overlays
        const overlay = document.createElement('div');
        overlay.id = 'gemini-prompt-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: '39999',
            backgroundColor: 'transparent'
        });

        setTimeout(() => {
            overlay.onclick = () => this.close();
        }, 150);
        document.body.appendChild(overlay);

        // 2. Create MENU
        const menu = document.createElement('div');
        menu.id = 'gemini-prompt-menu';
        menu.className = 'gemini-menu';

        Object.assign(menu.style, {
            position: 'fixed',
            zIndex: '40000',
            backgroundColor: '#1a1a1a',
            border: 'none',
            boxShadow: 'inset 0 1px 0 0 #444, inset -1px 0 0 0 #444, inset 0 -1px 0 0 #444, inset 1px 0 0 0 #444 !important',
            borderRadius: '0 !important',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            minWidth: '260px',
            opacity: '1',
            fontFamily: 'Inter, sans-serif'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '10px 14px',
            fontSize: '11px',
            fontWeight: '700',
            color: '#888',
            textTransform: 'uppercase',
            marginBottom: '6px'
        });
        header.textContent = forceExternal ? 'Gemini PWA Mode' : 'Ask Gemini AI';
        menu.appendChild(header);

        const ua = navigator.userAgent;
        const plat = navigator.platform;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        // Real Android devices won't report as Win32 or MacIntel
        const isAndroid = /Android/i.test(ua) && isTouch && !/Win32|Win64|MacIntel/i.test(plat);
        const isMobile = isAndroid || /iPhone|iPad|iPod/i.test(ua);

        prompts.forEach(p => {
            const item = document.createElement('div');
            item.className = 'gemini-menu-item';
            Object.assign(item.style, {
                padding: '14px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#fff',
                fontSize: '15px',
                borderRadius: '0 !important',
                marginBottom: '2px',
                webkitTapHighlightColor: 'transparent'
            });

            const iconClass = p.icon || 'fa-comment-alt';
            item.innerHTML = `
                <i class="fas ${iconClass}" style="width: 20px; text-align: center; color: var(--color-accent, #cda45e);"></i>
                <span style="font-weight: 500;">${p.label}</span>
            `;

            item.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (onSelect) onSelect(p);

                // If internal action AND NOT forcing external, don't copy or navigate
                if (p.internal && !forceExternal) {
                    this.close();
                    return;
                }

                // If forcing external, we need to prepare the prompt text if it's missing (e.g. from internal templates)
                const promptText = p.text || `Summarize the technical and fundamental outlook for ${p.label || 'this stock'} on the ASX.`;

                // 1. Copy (Localhost & Mobile Compatible)
                try {
                    const textArea = document.createElement("textarea");
                    textArea.value = promptText;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    ToastManager.info('COPIED: Paste into Gemini');
                } catch (err) {
                    console.warn('[GeminiMenu] Clipboard fail:', err);
                }

                // 2. NAVIGATION (Trigger App Launch on Android via Intent)
                if (isAndroid) {
                    const intentUrl = `intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;S.browser_fallback_url=${encodeURIComponent(targetUrl)};end`;
                    window.open(intentUrl, '_blank', 'noopener,noreferrer');
                } else if (isMobile) {
                    window.open(targetUrl, '_blank', 'noopener,noreferrer');
                } else {
                    window.open(targetUrl, '_blank', 'noopener,noreferrer');
                }

                setTimeout(() => this.close(), 300);
            };

            menu.appendChild(item);
        });


        const customItem = document.createElement('div');
        customItem.className = 'gemini-menu-item custom-prompt-btn';
        Object.assign(customItem.style, {
            padding: '12px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: 'var(--color-accent, #cda45e)',
            fontSize: '14px',
            borderRadius: '0 !important',
            fontWeight: '600',
            webkitTapHighlightColor: 'transparent'
        });

        customItem.innerHTML = `
            <i class="fas fa-keyboard" style="width: 20px; text-align: center;"></i>
            <span>Ask Your Own Question</span>
        `;

        customItem.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showCustomInput(event, targetUrl, forceExternal, contextSymbol);
        };
        menu.appendChild(customItem);

        document.body.appendChild(menu);

        // Positioning
        let x = event.clientX;
        let y = event.clientY;
        if (x === undefined && event.changedTouches?.length > 0) {
            x = event.changedTouches[0].clientX;
            y = event.changedTouches[0].clientY;
        }

        const rect = menu.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let left = Math.max(10, Math.min(x || 0, winWidth - rect.width - 10));
        let top = (y + rect.height > winHeight) ? ((y || 0) - rect.height - 10) : ((y || 0) + 10);
        if (top < 10) top = 10;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    static close() {
        const menu = document.getElementById('gemini-prompt-menu');
        const overlay = document.getElementById('gemini-prompt-overlay');
        const customContainer = document.getElementById('gemini-custom-container');
        if (menu) menu.remove();
        if (overlay) overlay.remove();
        if (customContainer) customContainer.remove();
    }

    /**
     * Shows a separate container for free-form text input.
     */
    static showCustomInput(event, targetUrl, forceExternal = false, contextSymbol = 'ASX') {
        this.close();

        // 1. Create Overlays
        const overlay = document.createElement('div');
        overlay.id = 'gemini-prompt-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: '39999',
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        });
        document.body.appendChild(overlay);

        // 2. Create Modal Container
        const container = document.createElement('div');
        container.id = 'gemini-custom-container';
        Object.assign(container.style, {
            backgroundColor: '#1a1a1a',
            border: 'none',
            boxShadow: 'inset 0 1px 0 0 #444, inset -1px 0 0 0 #444, inset 0 -1px 0 0 #444, inset 1px 0 0 0 #444 !important',
            borderRadius: '0 !important',
            padding: '24px',
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            fontFamily: 'Inter, sans-serif',
            position: 'relative',
            animation: 'geminiModalOpen 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
        });

        // Add Close Button (Top Right)
        const closeBtn = document.createElement('button');
        closeBtn.className = CSS_CLASSES.MODAL_CLOSE_BTN || 'modal-close-btn';
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '10'
        });
        closeBtn.innerHTML = `<i class="fas ${UI_ICONS.CLOSE || 'fa-times'}"></i>`;
        closeBtn.onclick = () => this.close();
        container.appendChild(closeBtn);

        // Add animation style once
        if (!document.getElementById('gemini-animations')) {
            const style = document.createElement('style');
            style.id = 'gemini-animations';
            style.textContent = `
                @keyframes geminiModalOpen {
                    from { opacity: 0; transform: scale(0.9) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .gemini-custom-textarea:focus {
                    border-color: var(--color-accent, #cda45e) !important;
                    outline: none;
                }
                .gemini-action-btn:active {
                    transform: scale(0.9) !important;
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        Object.assign(header.style, {
            fontSize: '18px',
            fontWeight: '700',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            paddingRight: '30px' // Space for close button
        });
        header.innerHTML = `<i class="fas fa-magic" style="color: var(--color-accent, #cda45e);"></i> Ask Gemini AI`;
        container.appendChild(header);


        const inputWrapper = document.createElement('div');
        Object.assign(inputWrapper.style, {
            position: 'relative',
            width: '100%'
        });

        const textarea = document.createElement('textarea');
        textarea.className = 'gemini-custom-textarea';
        textarea.placeholder = 'Type your question here...';

        // Context Injection: If for external launch (long-press), pre-fill the stock context
        if (forceExternal && contextSymbol && contextSymbol !== 'ASX') {
            textarea.value = `${contextSymbol}.AX `;
        }

        Object.assign(textarea.style, {
            width: '100%',
            height: '140px',
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: '0 !important', // Sharp corners
            padding: '16px 48px 16px 16px', // Right padding for icon
            color: '#fff',
            fontSize: '15px',
            resize: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s ease',
            boxSizing: 'border-box',
            display: 'block'
        });
        inputWrapper.appendChild(textarea);

        // Gemini Icon Button (Bottom Right of textarea)
        const submitBtn = document.createElement('button');
        submitBtn.className = 'gemini-action-btn';
        Object.assign(submitBtn.style, {
            position: 'absolute',
            right: '12px',
            bottom: '12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.1s ease',
            zIndex: '10'
        });
        submitBtn.innerHTML = `<img src="gemini-icon.png" style="width: 24px; height: 24px; pointer-events: none;">`;

        submitBtn.onclick = () => {
            const text = textarea.value.trim();
            if (!text) {
                ToastManager.info('Please enter a question');
                return;
            }
            this._handleCustomAction(text, targetUrl, forceExternal, contextSymbol);
        };
        inputWrapper.appendChild(submitBtn);

        container.appendChild(inputWrapper);

        overlay.appendChild(container);

        // Autofocus
        setTimeout(() => textarea.focus(), 100);

        // Close on overlay tap
        overlay.onclick = (e) => {
            if (e.target === overlay) this.close();
        };
    }

    static async _handleCustomAction(promptText, targetUrl, forceExternal = false, contextSymbol = 'ASX') {
        const quickSummaryOn = AppState.preferences.oneTapResearch !== false;

        // If Quick Summary is ON and we are NOT forcing external (long-press), do in-app AI
        if (quickSummaryOn && !forceExternal) {
            this.close();
            ToastManager.info('Asking AI...');

            try {
                const { DataService } = await import('../data/DataService.js');
                const ds = new DataService();

                // Get context snippet
                const context = {
                    symbol: contextSymbol,
                    timestamp: new Date().toISOString()
                };

                const result = await ds.askGemini('chat', promptText, context);

                if (result && result.ok && result.text) {
                    const { AiSummaryUI } = await import('./AiSummaryUI.js');
                    AiSummaryUI.showResult('AI Market Assistant', contextSymbol, result.text, result.model);
                } else {
                    const err = (result && result.error) ? result.error : 'Network Error';
                    ToastManager.error(`AI Error: ${err}`);
                }
            } catch (ex) {
                console.error('[GeminiMenu] In-app AI failed:', ex);
                ToastManager.error('Failed to reach Gemini');
            }
            return;
        }

        const ua = navigator.userAgent;
        const plat = navigator.platform;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isAndroid = /Android/i.test(ua) && isTouch && !/Win32|Win64|MacIntel/i.test(plat);

        // 1. Copy
        try {
            const textArea = document.createElement("textarea");
            textArea.value = promptText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            ToastManager.info('COPIED: Paste into Gemini');
        } catch (err) {
            console.warn('[GeminiMenu] Clipboard fail:', err);
        }

        // 2. Navigation
        if (isAndroid) {
            const intentUrl = `intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;S.browser_fallback_url=${encodeURIComponent(targetUrl)};end`;
            window.open(intentUrl, '_blank', 'noopener,noreferrer');
        } else {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }

        setTimeout(() => this.close(), 300);
    }
}
