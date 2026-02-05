
import { CSS_CLASSES, UI_ICONS, IDS } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';

/**
 * GeminiPromptMenu.js
 * Shows a context menu with predefined Gemini prompts.
 */
export class GeminiPromptMenu {

    /**
     * Shows the prompt menu at the specified coordinates.
     * @param {MouseEvent|PointerEvent} event - The triggering event (for coordinates).
     * @param {Array<{label: string, text: string, icon?: string}>} prompts - List of prompts.
     * @param {Function} [onSelect] - Optional callback when a prompt is selected (e.g. to open Gemini). 
     *                                If not provided, it defaults to: copy to clipboard -> show toast -> close.
     */
    static show(event, prompts, onSelect) {
        this.close(); // Close any existing instance

        // Create Menu Element
        const menu = document.createElement('div');
        menu.id = 'gemini-prompt-menu';
        menu.className = 'gemini-menu';

        // Inline Styles for the menu container to ensure it looks good immediately
        Object.assign(menu.style, {
            position: 'fixed',
            zIndex: '9999',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            minWidth: '220px',
            opacity: '0',
            transition: 'opacity 0.1s ease-in-out',
            fontFamily: 'Inter, sans-serif'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: '1px solid #333',
            marginBottom: '4px'
        });
        header.textContent = 'Ask Gemini...';
        menu.appendChild(header);

        prompts.forEach(p => {
            const item = document.createElement('div');
            item.className = 'gemini-menu-item';
            Object.assign(item.style, {
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#eee',
                fontSize: '13px',
                borderRadius: '4px',
                transition: 'background 0.2s'
            });

            // Hover effect via JS since we're using inline styles for speed/isolation
            item.onmouseenter = () => item.style.backgroundColor = 'rgba(255,255,255,0.08)';
            item.onmouseleave = () => item.style.backgroundColor = 'transparent';

            const iconClass = p.icon || 'fa-comment-alt';
            item.innerHTML = `
                <i class="fas ${iconClass}" style="width: 16px; text-align: center; color: var(--color-accent, #cda45e);"></i>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight: 500;">${p.label}</span>
                </div>
            `;

            item.addEventListener('click', async (e) => {
                e.stopPropagation();

                // Copy to clipboard
                try {
                    await navigator.clipboard.writeText(p.text);
                    ToastManager.info('Prompt copied to clipboard', 'Ready to Paste');
                } catch (err) {
                    console.error('Clipboard failed', err);
                    ToastManager.error('Failed to copy to clipboard');
                }

                // Call optional callback (e.g. to open Gemini URL)
                if (onSelect) {
                    onSelect(p);
                }

                this.close();
            });

            menu.appendChild(item);
        });

        document.body.appendChild(menu);

        // Positioning Logic
        const { clientX: x, clientY: y } = event;
        const rect = menu.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let left = x;
        let top = y;

        // Keep within bounds
        if (left + rect.width > winWidth) left = winWidth - rect.width - 10;
        if (top + rect.height > winHeight) top = winHeight - rect.height - 10;

        // Basic bounce (if too low, go up)
        if (top + rect.height > winHeight) {
            top = y - rect.height;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        // Fade In
        requestAnimationFrame(() => {
            menu.style.opacity = '1';
        });

        // Close on outside click
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!menu.contains(e.target)) {
                    this.close();
                    window.removeEventListener('pointerdown', closeHandler);
                }
            };
            window.addEventListener('pointerdown', closeHandler);
        }, 50);
    }

    static close() {
        const menu = document.getElementById('gemini-prompt-menu');
        if (menu) menu.remove();
    }
}
