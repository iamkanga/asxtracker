
/**
 * PullToRefresh.js
 * Implements a simple pull-to-refresh functionality for PWA.
 * Detects downward drag at the top of the container and triggers a reload.
 */
export class PullToRefresh {
    constructor(options = {}) {
        this.containerSelector = options.containerSelector || '#main-content';
        this.threshold = options.threshold || 80;
        this.dampening = options.dampening || 0.4;

        this.startY = 0;
        this.currentY = 0;
        this.isPulling = false;
        this.hasTriggered = false;

        this.container = null;
        this.indicator = null;
        this.icon = null;

        this.onRefresh = options.onRefresh || null;
        this._initStyles();
    }

    init() {
        this.container = document.querySelector(this.containerSelector);
        if (!this.container) {
            console.warn('[PullToRefresh] Container not found:', this.containerSelector);
            return;
        }

        this._createIndicator();
        this._bindEvents();
    }

    _initStyles() {
        if (document.getElementById('ptr-styles')) return;

        const style = document.createElement('style');
        style.id = 'ptr-styles';
        style.textContent = `
            .ptr-indicator {
                position: absolute;
                top: -60px;
                left: 0;
                width: 100%;
                height: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                pointer-events: none;
                transition: transform 0.2s ease-out, opacity 0.2s;
                opacity: 0;
            }
            .ptr-icon-wrap {
                width: 45px;
                height: 45px;
                background: var(--card-bg, #2c2c2c);
                border: 2px solid var(--color-accent, #a49393);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--color-accent, #a49393);
                box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                transform: rotate(0deg);
                transition: transform 0.1s, background 0.3s, color 0.3s;
            }
            .ptr-indicator.active .ptr-icon-wrap {
                background: var(--color-accent, #a49393);
                color: #fff;
                transform: scale(1.1);
            }
            .ptr-indicator.pulling {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    _createIndicator() {
        this.indicator = document.createElement('div');
        this.indicator.className = 'ptr-indicator';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'ptr-icon-wrap';
        iconWrap.innerHTML = '<i class="fas fa-arrow-down"></i>';

        this.indicator.appendChild(iconWrap);
        this.container.prepend(this.indicator);
        this.iconWrap = iconWrap;
    }

    _bindEvents() {
        this.container.addEventListener('touchstart', this._handleTouchStart.bind(this), { passive: true });
        this.container.addEventListener('touchmove', this._handleTouchMove.bind(this), { passive: false });
        this.container.addEventListener('touchend', this._handleTouchEnd.bind(this), { passive: true });
    }

    _handleTouchStart(e) {
        if (this.container.scrollTop <= 0) {
            this.startY = e.touches[0].pageY;
            this.isPulling = true;
            this.hasTriggered = false;
        } else {
            this.isPulling = false;
        }
    }

    _handleTouchMove(e) {
        if (!this.isPulling) return;

        this.currentY = e.touches[0].pageY;
        const diff = (this.currentY - this.startY) * this.dampening;

        if (diff > 0) {
            // Prevent scrolling when pulling down at the top
            if (e.cancelable) e.preventDefault();

            this.indicator.classList.add('pulling');
            this.indicator.style.transform = `translateY(${diff}px)`;

            // Rotate icon based on pull distance
            const rotation = Math.min(diff * 2, 180);
            this.iconWrap.style.transform = `rotate(${rotation}deg)`;

            if (diff > this.threshold) {
                if (!this.hasTriggered) {
                    this.hasTriggered = true;
                    this.indicator.classList.add('active');
                    this.iconWrap.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';

                    // Simple Haptic feedback if supported
                    if ('vibrate' in navigator) navigator.vibrate(10);
                }
            } else {
                if (this.hasTriggered) {
                    this.hasTriggered = false;
                    this.indicator.classList.remove('active');
                    this.iconWrap.innerHTML = '<i class="fas fa-arrow-down"></i>';
                }
            }
        } else {
            this.indicator.classList.remove('pulling');
            this.indicator.style.transform = 'translateY(0)';
        }
    }

    async _handleTouchEnd() {
        if (!this.isPulling) return;

        if (this.hasTriggered) {
            // Trigger Refresh
            if (this.onRefresh) {
                try {
                    await this.onRefresh();
                } catch (e) {
                    console.error('[PTR] Refresh failed:', e);
                } finally {
                    this._resetIndicator();
                }
            } else {
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            }
        } else {
            this._resetIndicator();
        }

        this.isPulling = false;
    }

    _resetIndicator() {
        if (!this.indicator) return;

        this.indicator.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s';
        this.indicator.style.transform = 'translateY(0)';
        this.indicator.classList.remove('pulling', 'active');

        setTimeout(() => {
            if (this.indicator) {
                this.indicator.style.transition = 'transform 0.1s ease-out, opacity 0.2s';
            }
            if (this.iconWrap) {
                this.iconWrap.innerHTML = '<i class="fas fa-arrow-down"></i>';
            }
        }, 400);
    }
}
