
import { AppState } from '../state/AppState.js';
import { CSS_CLASSES } from '../utils/AppConstants.js';

/**
 * ScrollManager.js
 * A blanket "Back to Top" implementation that detects scrolling 
 * in any container and provides a subtle navigation arrow.
 */
export class ScrollManager {
    static init() {
        if (this._initialized) return;
        this._initialized = true;

        this._activeContainer = null;
        this._threshold = 300; // Show after 300px
        this._isVisible = false;

        this._injectStyles();
        this._createButton();
        this._bindEvents();
    }

    static _injectStyles() {
        if (document.getElementById('scroll-manager-styles')) return;

        const style = document.createElement('style');
        style.id = 'scroll-manager-styles';
        style.textContent = `
            .back-to-top-btn {
                position: fixed;
                bottom: 80px; 
                right: 20px;
                width: 38px;
                height: 38px;
                background: rgba(34, 34, 34, 0.4); /* Muted/Ghostly */
                backdrop-filter: blur(8px);
                color: var(--color-accent, #a49393);
                border: 1px solid rgba(164, 147, 147, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 2000000;
                opacity: 0;
                visibility: hidden;
                transform: translateY(15px);
                transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }

            .back-to-top-btn.visible {
                opacity: 0.7;
                visibility: visible;
                transform: translateY(0);
            }

            .back-to-top-btn:hover {
                opacity: 1;
                background: rgba(42, 42, 42, 0.8);
                border-color: var(--color-accent);
                transform: scale(1.1);
            }

            .back-to-top-btn i {
                font-size: 1rem;
                opacity: 0.8;
            }

            /* Adjust for mobile if needed */
            @media (max-width: 768px) {
                .back-to-top-btn {
                    bottom: 90px;
                    right: 15px;
                    width: 36px;
                    height: 36px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    static _createButton() {
        const btn = document.createElement('div');
        btn.id = 'global-back-to-top';
        btn.className = 'back-to-top-btn';
        btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        btn.title = 'Back to top';

        btn.onclick = (e) => {
            e.preventDefault();
            this._scrollToTop();
        };

        document.body.appendChild(btn);
        this._btn = btn;
    }

    static _bindEvents() {
        // Use capture: true to catch scroll events from any element in the DOM
        window.addEventListener('scroll', (e) => {
            this._handleScroll(e.target === document ? document.documentElement : e.target);
        }, true);

        // Also check on window resize (might change overflow)
        window.addEventListener('resize', () => {
            if (!this._activeContainer) return;
            this._handleScroll(this._activeContainer);
        });
    }

    static _handleScroll(element) {
        if (!element || typeof element.scrollTop === 'undefined') return;

        // Visibility Check: Only track elements that are actually visible
        if (element !== document.documentElement && (element.offsetWidth === 0 || element.offsetHeight === 0)) {
            return;
        }

        const isPastThreshold = element.scrollTop > this._threshold;

        if (isPastThreshold) {
            // Update active container to the one currently being scrolled
            this._activeContainer = element;
            this._show();
        } else {
            // If the container that was causing the button to show is now scrolled back up
            if (this._activeContainer === element) {
                this._hide();
            }
        }
    }

    static _show() {
        if (this._isVisible) return;
        this._isVisible = true;
        this._btn.classList.add('visible');
    }

    static _hide() {
        if (!this._isVisible) return;
        this._isVisible = false;
        this._btn.classList.remove('visible');
        // Clear active container after transition
        setTimeout(() => {
            if (!this._isVisible) this._activeContainer = null;
        }, 400);
    }

    static _scrollToTop() {
        const target = this._activeContainer || document.documentElement;

        target.scrollTo({
            top: 0,
            behavior: 'smooth'
        });

        // Forced hide after click for immediate feedback
        this._hide();
    }
}
