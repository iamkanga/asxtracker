
import { CSS_CLASSES, UI_ICONS, IDS } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';

/**
 * GeminiPromptMenu.js
 * Shows a context menu with predefined Gemini prompts.
 * Optimized for Android App Launch and Localhost reliability.
 */
export class GeminiPromptMenu {

    static show(event, prompts, onSelect, targetUrl = 'https://gemini.google.com/app', forceExternal = false) {
        this.close();

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
            border: '1px solid #444',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
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
            borderBottom: '1px solid #333',
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
                borderRadius: '8px',
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
                    window.open(intentUrl, '_blank');
                } else if (isMobile) {
                    window.open(targetUrl, '_blank');
                } else {
                    window.open(targetUrl, '_blank');
                }

                setTimeout(() => this.close(), 300);
            };

            menu.appendChild(item);
        });

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
        if (menu) menu.remove();
        if (overlay) overlay.remove();
    }
}
