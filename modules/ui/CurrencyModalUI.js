import { IDS, CSS_CLASSES, UI_ICONS, EVENTS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';

export default class CurrencyModalUI {
    /**
     * Shows the Currency Converter in a standalone modal.
     */
    static showModal(options = {}) {
        const modalId = IDS.CURRENCY_MODAL || 'currency-modal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const currencyUrl = options.url || 'https://currencyhq.netlify.app';

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="height: 88vh; max-height: 820px; max-width: 480px; display: flex; flex-direction: column; padding: 0; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(18, 20, 26, 0.95);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas ${UI_ICONS.CURRENCY || 'fa-dollar-sign'}" style="color: var(--color-accent, #10b981); font-size: 1rem;"></i>
                        <h3 class="${CSS_CLASSES.MODAL_TITLE}" style="margin: 0; font-size: 1rem; font-weight: 600; letter-spacing: 0.3px;">Currency Converter</h3>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <a href="${currencyUrl}" target="_blank" rel="noopener noreferrer" class="modal-action-btn" title="Open Full Screen in New Tab" style="color: var(--text-muted, #94a3b8); font-size: 0.85rem; padding: 4px; display: flex; align-items: center; text-decoration: none;">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close" style="background: none; border: none; color: var(--text-muted, #94a3b8); font-size: 1.1rem; cursor: pointer; padding: 4px; line-height: 1;">
                            <i class="fas ${UI_ICONS.CLOSE || 'fa-times'}"></i>
                        </button>
                    </div>
                </div>
                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; position: relative; padding: 0; background: #090a0d; overflow: hidden;">
                    <iframe 
                        id="currency-hq-iframe" 
                        src="${currencyUrl}" 
                        title="Currency Converter"
                        style="width: 100%; height: 100%; border: none; display: block; background: #090a0d;" 
                        allow="clipboard-read; clipboard-write">
                    </iframe>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Entrance animation
        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            requestAnimationFrame(() => {
                modal.classList.add(CSS_CLASSES.SHOW);
            });
        });

        // Navigation stack hook
        navManager.pushState(() => {
            if (modal.parentElement) modal.remove();
        });

        // Close logic
        const close = () => {
            if (modal._isClosing) return;
            modal._isClosing = true;

            modal.classList.remove(CSS_CLASSES.SHOW);
            modal.style.pointerEvents = 'none';

            setTimeout(() => {
                modal.classList.add(CSS_CLASSES.HIDDEN);
                modal.remove();
                navManager.popStateSilently();
            }, 300);
        };

        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        if (closeBtn) closeBtn.addEventListener('click', close);

        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
        if (overlay) overlay.addEventListener('click', close);
    }
}
