import { CSS_CLASSES, IDS, UI_ICONS, KANGAROO_ICON_SVG } from '../utils/AppConstants.js';

/**
 * ToastManager.js
 * Manages global toast notifications.
 * Implements the "Modern UI" toast system: Top-Right, 3s duration, Tap-to-dismiss.
 */
export class ToastManager {

    static getContainer() {
        let container = document.getElementById(IDS.TOAST_CONTAINER);
        if (!container) {
            container = document.createElement('div');
            container.id = IDS.TOAST_CONTAINER;
            document.body.appendChild(container); // Safe fallback if index.html is missing it
        }
        return container;
    }

    /**
     * Show a toast notification.
     * @param {string} message - The message body.
     * @param {string} [type='info'] - 'success', 'error', 'info'.
     * @param {string} [title=''] - Optional title. If not provided, defaults based on type.
     * @param {number} [duration=3000] - Duration in ms.
     */
    static show(message, type = 'info', title = '', duration = 3000) {
        const container = this.getContainer();

        // Determine classes and icons
        let variantClass = CSS_CLASSES.TOAST_INFO;
        let iconClass = UI_ICONS.ALERTS; // Default bell
        let defaultTitle = 'Info';

        switch (type) {
            case 'success':
                variantClass = CSS_CLASSES.TOAST_SUCCESS;
                iconClass = 'KANGAROO_ICON_SVG';
                defaultTitle = 'Success';
                break;
            case 'error':
                variantClass = CSS_CLASSES.TOAST_ERROR;
                iconClass = 'KANGAROO_ICON_SVG';
                defaultTitle = 'Error';
                break;
            case 'info-no-icon':
                variantClass = CSS_CLASSES.TOAST_INFO;
                iconClass = null; // No icon
                defaultTitle = 'Notification';
                break;
            case 'refresh':
                variantClass = CSS_CLASSES.TOAST_INFO;
                iconClass = 'KANGAROO_ICON_SVG';
                defaultTitle = 'Refreshing';
                break;
            case 'info':
            default:
                variantClass = CSS_CLASSES.TOAST_INFO;
                iconClass = UI_ICONS.ALERTS;
                defaultTitle = 'Notification';
                break;
        }

        const displayTitle = title || defaultTitle;

        // Create Toast Element
        const toast = document.createElement('div');
        toast.className = `${CSS_CLASSES.TOAST} ${variantClass}`;

        // Progress Bar Color Mapping (rough approximation via CSS currentColor)
        // Note: CSS handles text color inheritance for progress bar

        const iconHtml = iconClass === 'KANGAROO_ICON_SVG'
            ? `<div class="${CSS_CLASSES.TOAST_ICON}">${KANGAROO_ICON_SVG}</div>`
            : `<i class="fas ${iconClass} ${CSS_CLASSES.TOAST_ICON}"></i>`;

        toast.innerHTML = `
             ${iconHtml}
             <div class="${CSS_CLASSES.TOAST_BODY}">
                 <div class="${CSS_CLASSES.TOAST_TITLE}">${displayTitle}</div>
                 <div class="${CSS_CLASSES.TOAST_MESSAGE}">${message}</div>
             </div>
             <button class="${CSS_CLASSES.TOAST_CLOSE_BTN}">
                 <i class="fas ${UI_ICONS.CLOSE}"></i>
             </button>
             <div class="${CSS_CLASSES.TOAST_PROGRESS}">
                 <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
             </div>
        `;

        // Add to DOM
        // Prepend or Append? User implies "stack". Usually bottom-up or top-down. 
        // Top-right usually means new ones appear at the top.
        // If we use appendChild and flex-direction column, they stack downwards.
        // If we use prepend, they push others down. 
        // "Come out of the top right". I'll use prepend to make it feel like it enters from the top.
        container.prepend(toast);

        // Auto Dismiss Logic
        let timeoutId;

        const dismiss = () => {
            if (toast.classList.contains(CSS_CLASSES.HIDING)) return; // Already hiding
            toast.classList.add(CSS_CLASSES.HIDING);

            // Wait for animation to finish then remove
            toast.addEventListener('animationend', () => {
                toast.remove();
            }, { once: true });
        };

        if (duration > 0) {
            timeoutId = setTimeout(dismiss, duration);
        }

        // Click to Dismiss (User Request: "dismissed if it's tapped on by the user")
        toast.addEventListener('click', () => {
            clearTimeout(timeoutId); // Stop auto-timer
            dismiss();
        });

        // Close Button (redundant but good UX)
        const closeBtn = toast.querySelector(`.${CSS_CLASSES.TOAST_CLOSE_BTN}`);
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent double trigger
                clearTimeout(timeoutId);
                dismiss();
            });
        }
    }

    static success(msg, title) {
        this.show(msg, 'success', title);
    }

    static error(msg, title) {
        this.show(msg, 'error', title);
    }

    static info(msg, title) {
        this.show(msg, 'info', title);
    }
}
