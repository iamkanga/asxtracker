/**
 * SwipeGestureHelper.js
 * Utility to add smooth, high-performance swipe-to-action gestures
 * to DOM elements. Manages horizontal swipes while protecting vertical scroll.
 */

export class SwipeGestureHelper {
    constructor(wrapperElement, options = {}) {
        this.wrapper = wrapperElement;
        this.swipeContent = wrapperElement.querySelector('.swipe-content');
        this.deleteUnderlay = wrapperElement.querySelector('.delete-underlay');
        this.unreadUnderlay = wrapperElement.querySelector('.unread-underlay');
        
        this.options = Object.assign({
            threshold: 100,
            onSwipeLeft: () => {},
            onSwipeRight: () => {}
        }, options);

        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.isDragging = false;
        this.gestureType = null; // 'horizontal' | 'vertical' | null
        this.swipeBlockedClick = false;

        this.init();
    }

    init() {
        if (!this.swipeContent) return;

        // Bind Touch Events
        this.wrapper.addEventListener('touchstart', (e) => this.handleStart(e), { passive: true });
        this.wrapper.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.wrapper.addEventListener('touchend', (e) => this.handleEnd(e), { passive: true });

        // Bind Mouse Fallback Events
        this.wrapper.addEventListener('mousedown', (e) => this.handleStart(e));
        
        // Prevent click if we were swiping
        this.wrapper.addEventListener('click', (e) => {
            if (this.swipeBlockedClick) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true); // Use capture phase to intercept
    }

    handleStart(e) {
        // Skip swipe if target is one of our active pills or buttons to allow direct tap
        if (e.target.closest('.code-pill') || e.target.closest('.analysis-pill') || e.target.closest('.announcement-pill') || e.target.closest('.stream-dismiss-btn')) {
            return;
        }

        const touch = e.touches ? e.touches[0] : e;
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.currentX = touch.clientX;
        this.currentY = touch.clientY;
        this.isDragging = true;
        this.gestureType = null;

        // Bind document mouse move/up handlers for desktop drags
        if (!e.touches) {
            this._mouseMoveHandler = (evt) => this.handleMove(evt);
            this._mouseUpHandler = (evt) => this.handleEnd(evt);
            document.addEventListener('mousemove', this._mouseMoveHandler, { passive: false });
            document.addEventListener('mouseup', this._mouseUpHandler);
        }
    }

    handleMove(e) {
        if (!this.isDragging) return;

        const touch = e.touches ? e.touches[0] : e;
        this.currentX = touch.clientX;
        this.currentY = touch.clientY;

        const deltaX = this.currentX - this.startX;
        const deltaY = this.currentY - this.startY;

        // Identify gesture type if not already locked in
        if (!this.gestureType) {
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            if (absX > 5 || absY > 5) {
                if (absX >= absY) {
                    this.gestureType = 'horizontal';
                } else {
                    this.gestureType = 'vertical';
                    this.cleanupMouseListeners();
                    this.isDragging = false;
                    return;
                }
            } else {
                return;
            }
        }

        if (this.gestureType === 'horizontal') {
            // Lock vertical scrolling
            if (e.cancelable) {
                e.preventDefault();
            }

            // Apply direct translate (without transition delay for 60fps tracking)
            this.swipeContent.style.transition = 'none';
            this.swipeContent.style.transform = `translateX(${deltaX}px)`;

            // Dynamically show the correct underlay and scale opacity
            if (deltaX > 0) {
                // Dragging right -> reveal delete (red)
                if (this.deleteUnderlay) {
                    this.deleteUnderlay.style.opacity = Math.min(1, deltaX / this.options.threshold);
                }
                if (this.unreadUnderlay) {
                    this.unreadUnderlay.style.opacity = '0';
                }
            } else {
                // Dragging left -> reveal unread (blue)
                const absDelta = Math.abs(deltaX);
                if (this.unreadUnderlay) {
                    this.unreadUnderlay.style.opacity = Math.min(1, absDelta / this.options.threshold);
                }
                if (this.deleteUnderlay) {
                    this.deleteUnderlay.style.opacity = '0';
                }
            }
        }
    }

    handleEnd(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.cleanupMouseListeners();

        const deltaX = this.currentX - this.startX;

        // Restore transitions
        this.swipeContent.style.transition = '';

        if (this.gestureType === 'horizontal') {
            const threshold = this.options.threshold;
            
            // Set flag to block subsequent tap/click events
            this.swipeBlockedClick = true;
            setTimeout(() => {
                this.swipeBlockedClick = false;
            }, 100);

            if (deltaX > threshold) {
                // Complete Swipe Right (Dismiss/Delete)
                this.swipeContent.style.transform = 'translateX(100%)';
                this.swipeContent.style.opacity = '0';
                if (this.deleteUnderlay) this.deleteUnderlay.style.opacity = '1';
                setTimeout(() => this.options.onSwipeRight(), 200);
            } else if (deltaX < -threshold) {
                // Complete Swipe Left (Mark Unread)
                this.swipeContent.style.transform = 'translateX(-100%)';
                this.swipeContent.style.opacity = '0';
                if (this.unreadUnderlay) this.unreadUnderlay.style.opacity = '1';
                setTimeout(() => {
                    this.options.onSwipeLeft();
                    // Snap back to 0
                    this.swipeContent.style.transform = '';
                    this.swipeContent.style.opacity = '';
                    if (this.unreadUnderlay) this.unreadUnderlay.style.opacity = '0';
                }, 200);
            } else {
                // Retracted: snap back
                this.swipeContent.style.transform = '';
                if (this.deleteUnderlay) this.deleteUnderlay.style.opacity = '0';
                if (this.unreadUnderlay) this.unreadUnderlay.style.opacity = '0';
            }
        }

        this.gestureType = null;
    }

    cleanupMouseListeners() {
        if (this._mouseMoveHandler) {
            document.removeEventListener('mousemove', this._mouseMoveHandler);
            this._mouseMoveHandler = null;
        }
        if (this._mouseUpHandler) {
            document.removeEventListener('mouseup', this._mouseUpHandler);
            this._mouseUpHandler = null;
        }
    }
}
