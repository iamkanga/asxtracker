/**
 * KeyboardModalHandler.js
 * Handles mobile keyboard interactions with modals to keep headers sticky/visible.
 * Uses the visualViewport API to detect keyboard open/close on mobile devices.
 */

class KeyboardModalHandler {
    static _instance = null;
    static _resizeHandler = null;
    static _initialViewportHeight = null;
    static _isKeyboardOpen = false;
    static _activeModal = null;

    /**
     * Initializes the keyboard handler for a specific modal.
     * Call this when a modal with input fields is opened.
     * @param {HTMLElement} modal - The modal element containing inputs
     */
    static attach(modal) {
        if (!modal) return;

        // Store reference to active modal
        this._activeModal = modal;

        // Check if visualViewport API is available (modern browsers/Android)
        if (window.visualViewport) {
            this._initialViewportHeight = window.visualViewport.height;

            // Remove any existing handler
            if (this._resizeHandler) {
                window.visualViewport.removeEventListener('resize', this._resizeHandler);
            }

            // Create resize handler
            this._resizeHandler = () => this._handleViewportResize();
            window.visualViewport.addEventListener('resize', this._resizeHandler);

            // Also listen for scroll to prevent visual issues
            window.visualViewport.addEventListener('scroll', this._resizeHandler);
        }

        // Add CSS class to modal for styling hooks
        modal.classList.add('keyboard-aware-modal');

        // Bind focus/blur events on inputs to help with timing
        const inputs = modal.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', () => this._onInputFocus(modal));
            input.addEventListener('blur', () => this._onInputBlur(modal));
        });
    }

    /**
     * Detaches the keyboard handler. Call when modal is closed.
     */
    static detach() {
        if (this._resizeHandler && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this._resizeHandler);
            window.visualViewport.removeEventListener('scroll', this._resizeHandler);
            this._resizeHandler = null;
        }

        if (this._activeModal) {
            this._activeModal.classList.remove('keyboard-aware-modal');
            this._activeModal.classList.remove('keyboard-open');
            this._activeModal = null;
        }

        this._isKeyboardOpen = false;
        this._initialViewportHeight = null;
    }

    /**
     * Handles viewport resize events (keyboard open/close detection)
     */
    static _handleViewportResize() {
        if (!window.visualViewport || !this._activeModal) return;

        const currentHeight = window.visualViewport.height;
        const heightDiff = this._initialViewportHeight - currentHeight;

        // Keyboard is considered open if viewport shrinks by more than 150px
        const keyboardThreshold = 150;
        const wasOpen = this._isKeyboardOpen;
        this._isKeyboardOpen = heightDiff > keyboardThreshold;

        if (this._isKeyboardOpen !== wasOpen) {
            if (this._isKeyboardOpen) {
                this._onKeyboardOpen();
            } else {
                this._onKeyboardClose();
            }
        }

        // Continuously adjust while keyboard is open
        if (this._isKeyboardOpen) {
            this._adjustModalForKeyboard(currentHeight);
        }
    }

    /**
     * Called when keyboard opens
     */
    static _onKeyboardOpen() {
        if (!this._activeModal) return;

        // Add class for CSS hooks
        this._activeModal.classList.add('keyboard-open');
        document.body.classList.add('keyboard-visible');

        // Get modal content element
        const modalContent = this._activeModal.querySelector('.modal-content');
        if (modalContent) {
            // Make the modal content use fixed positioning relative to viewport
            modalContent.style.position = 'fixed';
            modalContent.style.top = '0';
            modalContent.style.left = '0';
            modalContent.style.right = '0';
            modalContent.style.bottom = 'auto';
            modalContent.style.height = `${window.visualViewport.height}px`;
            modalContent.style.maxHeight = `${window.visualViewport.height}px`;
            modalContent.style.transform = `translateY(${window.visualViewport.offsetTop}px)`;
        }

        // Ensure header stays at top
        const header = this._activeModal.querySelector('.modal-header');
        if (header) {
            header.style.flexShrink = '0';
            header.style.position = 'relative';
            header.style.zIndex = '100';
        }
    }

    /**
     * Called when keyboard closes
     */
    static _onKeyboardClose() {
        if (!this._activeModal) return;

        // Remove class
        this._activeModal.classList.remove('keyboard-open');
        document.body.classList.remove('keyboard-visible');

        // Reset modal content styles
        const modalContent = this._activeModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.position = '';
            modalContent.style.top = '';
            modalContent.style.left = '';
            modalContent.style.right = '';
            modalContent.style.bottom = '';
            modalContent.style.height = '';
            modalContent.style.maxHeight = '';
            modalContent.style.transform = '';
        }

        // Reset header styles
        const header = this._activeModal.querySelector('.modal-header');
        if (header) {
            header.style.flexShrink = '';
            header.style.position = '';
            header.style.zIndex = '';
        }
    }

    /**
     * Adjusts modal dimensions to match visual viewport
     */
    static _adjustModalForKeyboard(viewportHeight) {
        if (!this._activeModal) return;

        const modalContent = this._activeModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.height = `${viewportHeight}px`;
            modalContent.style.maxHeight = `${viewportHeight}px`;
            modalContent.style.transform = `translateY(${window.visualViewport.offsetTop}px)`;
        }
    }

    /**
     * Called when an input gains focus
     */
    static _onInputFocus(modal) {
        // Slight delay to let keyboard animation start
        setTimeout(() => {
            if (window.visualViewport) {
                this._initialViewportHeight = this._initialViewportHeight || window.innerHeight;
                this._handleViewportResize();
            }

            // Scroll the focused input into view within the modal body
            const focusedInput = modal.querySelector(':focus');
            if (focusedInput) {
                const modalBody = modal.querySelector('.modal-body');
                if (modalBody) {
                    // Delay to allow viewport changes to settle
                    setTimeout(() => {
                        focusedInput.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }, 100);
                }
            }
        }, 100);
    }

    /**
     * Called when an input loses focus
     */
    static _onInputBlur(modal) {
        // Delay to check if focus moved to another input
        setTimeout(() => {
            const stillFocused = modal.querySelector(':focus');
            if (!stillFocused) {
                // No input focused, keyboard might close
                if (window.visualViewport) {
                    this._handleViewportResize();
                }
            }
        }, 200);
    }
}

export { KeyboardModalHandler };
