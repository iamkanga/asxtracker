
/**
 * PullToRefresh.js
 * Implements a premium pull-to-refresh functionality for PWA.
 * Detects downward drag at the top of the container and triggers a reload.
 */
export class PullToRefresh {
    constructor(options = {}) {
        this.containerSelector = options.containerSelector || '#main-content';
        this.contentSelector = options.contentSelector || '#content-container';
        this.threshold = options.threshold || 100; // Increased for better feel
        this.dampening = options.dampening || 0.45;

        this.startY = 0;
        this.currentY = 0;
        this.isPulling = false;
        this.hasTriggered = false;
        this.isRefreshing = false;

        this.container = null;
        this.content = null;
        this.indicator = null;
        this.iconWrap = null;

        this.onRefresh = options.onRefresh || null;
        this._initStyles();
    }

    init() {
        this.container = document.querySelector(this.containerSelector);
        this.content = document.querySelector(this.contentSelector);

        if (!this.container || !this.content) {
            console.warn('[PullToRefresh] Container or Content not found:', {
                container: !!this.container,
                content: !!this.content
            });
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
                top: -80px;
                left: 0;
                width: 100%;
                height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                pointer-events: none;
                transition: transform 0.1s ease-out, opacity 0.2s;
                opacity: 0;
            }
            .ptr-icon-wrap {
                width: 48px;
                height: 48px;
                background: transparent;
                border: none;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--color-accent, #a49393);
                transform: rotate(0deg) scale(0.8);
                transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.3s;
            }
            .ptr-indicator.pulling {
                opacity: 1;
            }
            .ptr-indicator.active .ptr-icon-wrap {
                color: var(--color-accent, #a49393);
                transform: scale(1.2) rotate(180deg);
            }
            .ptr-indicator.refreshing .ptr-icon-wrap {
                color: var(--color-accent, #a49393);
                transform: scale(1.2);
            }
            .ptr-content-transition {
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
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
        if (this.isRefreshing) return;

        // Use a small 5px buffer for better reliability on various devices
        if (this.container.scrollTop <= 5) {
            this.startY = e.touches[0].pageY;
            this.isPulling = true;
            this.hasTriggered = false;

            // Remove transition for immediate response
            this.indicator.style.transition = 'none';
            this.content.style.transition = 'none';
        } else {
            this.isPulling = false;
        }
    }

    _handleTouchMove(e) {
        if (!this.isPulling || this.isRefreshing) return;

        this.currentY = e.touches[0].pageY;
        let diff = (this.currentY - this.startY) * this.dampening;

        if (diff > 0) {
            // Prevent scrolling when pulling down at the top
            if (e.cancelable) e.preventDefault();

            this.indicator.classList.add('pulling');

            // Limit the visual pull
            const pullDistance = Math.min(diff, 150);
            this.indicator.style.transform = `translateY(${pullDistance}px)`;
            this.content.style.transform = `translateY(${pullDistance}px)`;

            // Rotate icon based on pull distance (up to 180deg at threshold)
            const rotation = Math.min((pullDistance / this.threshold) * 180, 180);
            const scale = 0.8 + (Math.min(pullDistance / this.threshold, 1) * 0.3);
            this.iconWrap.style.transform = `rotate(${rotation}deg) scale(${scale})`;

            if (pullDistance > this.threshold) {
                if (!this.hasTriggered) {
                    this.hasTriggered = true;
                    this.indicator.classList.add('active');
                    this.iconWrap.innerHTML = '<i class="fas fa-arrow-up"></i>';

                    // Haptic feedback for "Ready to Refresh"
                    if ('vibrate' in navigator) navigator.vibrate(15);
                }
            } else {
                if (this.hasTriggered) {
                    this.hasTriggered = false;
                    this.indicator.classList.remove('active');
                    this.iconWrap.innerHTML = '<i class="fas fa-arrow-down"></i>';
                }
            }
        } else {
            this._resetIndicator(false);
        }
    }

    async _handleTouchEnd() {
        if (!this.isPulling || this.isRefreshing) return;

        this.isPulling = false;

        if (this.hasTriggered) {
            this.isRefreshing = true;
            this.indicator.classList.remove('active');
            this.indicator.classList.add('refreshing');
            this.iconWrap.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';

            // Add smooth transition to 'holding' position
            this.indicator.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            this.content.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

            this.indicator.style.transform = `translateY(${this.threshold - 20}px)`;
            this.content.style.transform = `translateY(${this.threshold - 20}px)`;

            // Trigger Refresh
            if (this.onRefresh) {
                try {
                    // Final Haptic for the start of the crunching
                    if ('vibrate' in navigator) navigator.vibrate([10, 30]);

                    await this.onRefresh();
                } catch (e) {
                    console.error('[PTR] Refresh failed:', e);
                } finally {
                    this._resetIndicator(true);
                }
            } else {
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            }
        } else {
            this._resetIndicator(true);
        }
    }

    _resetIndicator(smooth = true) {
        if (!this.indicator || !this.content) return;

        if (smooth) {
            const transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.27) 0.1s, opacity 0.3s';
            this.indicator.style.transition = transition;
            this.content.style.transition = transition;
        } else {
            this.indicator.style.transition = 'none';
            this.content.style.transition = 'none';
        }

        this.indicator.style.transform = 'translateY(0)';
        this.content.style.transform = 'translateY(0)';
        this.indicator.classList.remove('pulling', 'active', 'refreshing');

        // Cleanup after animation
        setTimeout(() => {
            if (this.iconWrap) {
                this.iconWrap.innerHTML = '<i class="fas fa-arrow-down"></i>';
                this.iconWrap.style.transform = 'rotate(0deg) scale(0.8)';
            }
            this.isRefreshing = false;
            this.hasTriggered = false;
        }, 600);
    }
}
