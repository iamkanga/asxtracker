/**
 * SuperStrategyDismissModal.js
 * Modal dialog for selecting dismissal options for the Super Strategy EOFY countdown banner.
 */

import { CSS_CLASSES, IDS, UI_ICONS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';

export class SuperStrategyDismissModal {
    /**
     * Shows the dismissal options modal.
     * @param {Function} onDismissTomorrow Callback for "Dismiss until tomorrow" choice.
     * @param {Function} onDismissPermanently Callback for "Dismiss permanently" choice.
     */
    static show(onDismissTomorrow, onDismissPermanently) {
        // Prevent duplicate instances
        const existing = document.getElementById(IDS.SUPER_DISMISS_MODAL);
        if (existing) existing.remove();

        const modal = this._renderModal();
        document.body.appendChild(modal);
        this._bindEvents(modal, onDismissTomorrow, onDismissPermanently);

        // Standard animated entry
        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            requestAnimationFrame(() => {
                modal.classList.add(CSS_CLASSES.SHOW);
            });
        });
    }

    static _renderModal() {
        const modal = document.createElement('div');
        modal.id = IDS.SUPER_DISMISS_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}" style="max-width: 400px; padding: 24px; text-align: center; gap: 20px;">
                
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="padding: 0; justify-content: center; position: relative;">
                    <h3 class="${CSS_CLASSES.MODAL_TITLE}" style="justify-content: center; font-size: 1.2rem; font-weight: 800; color: #ffa500; margin: 0; text-align: center;">
                        <i class="fas fa-calendar-exclamation" style="color: #ffa500; margin-right: 8px;"></i>
                        Dismiss EOFY Countdown
                    </h3>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close" style="position: absolute; right: 0; top: 0;">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY}" style="padding: 0; margin: 0;">
                    <p style="font-size: 0.9rem; color: var(--text-color); margin: 0; line-height: 1.5; text-align: center;">
                        How would you like to dismiss the Super Strategy Deadline warning?
                    </p>
                </div>

                <div class="${CSS_CLASSES.MODAL_FOOTER}" style="padding: 0; border: none; flex-direction: column; gap: 10px; width: 100%;">
                    <button id="${IDS.SUPER_DISMISS_TOMORROW}" class="btn-primary" style="width: 100%; border-radius: 4px; padding: 12px; font-weight: 700; background-color: var(--color-accent); color: white; border: none; cursor: pointer;">
                        Dismiss until tomorrow
                    </button>
                    <button id="${IDS.SUPER_DISMISS_PERMANENT}" class="btn-secondary" style="width: 100%; border-radius: 4px; padding: 12px; font-weight: 700; background-color: transparent; color: var(--text-color); border: 1px solid var(--border-color); cursor: pointer;">
                        Dismiss permanently
                    </button>
                    <button id="${IDS.SUPER_DISMISS_CANCEL}" class="btn-secondary" style="width: 100%; border-radius: 4px; padding: 12px; font-weight: 700; background-color: transparent; color: var(--text-muted); border: none; cursor: pointer;">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        // Register navigation state
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).click();
            }
        });

        return modal;
    }

    static _bindEvents(modal, onDismissTomorrow, onDismissPermanently) {
        const closeModal = () => {
            if (modal._isClosing) return;
            modal._isClosing = true;

            modal.classList.remove(CSS_CLASSES.SHOW);
            modal.style.pointerEvents = 'none';

            setTimeout(() => {
                if (modal.parentElement) modal.remove();
            }, 450);

            // Pop navigation state
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        // Close triggers
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).onclick = closeModal;
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).onclick = closeModal;
        modal.querySelector(`#${IDS.SUPER_DISMISS_CANCEL}`).onclick = closeModal;

        // Choice actions
        modal.querySelector(`#${IDS.SUPER_DISMISS_TOMORROW}`).onclick = () => {
            if (typeof onDismissTomorrow === 'function') {
                onDismissTomorrow();
            }
            closeModal();
        };

        modal.querySelector(`#${IDS.SUPER_DISMISS_PERMANENT}`).onclick = () => {
            if (typeof onDismissPermanently === 'function') {
                onDismissPermanently();
            }
            closeModal();
        };
    }
}
