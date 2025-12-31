/**
 * NavigationManager.js
 * Version 7: Eager Synchronization & High-Stability Control
 * Specifically designed to eliminate race conditions in rapid nested transition scenarios.
 */
import { ToastManager } from '../ui/ToastManager.js';

class NavigationManager {
    constructor() {
        this.popStack = [];
        this.currentStateId = 0;
        this.baseStateId = 2; // Index 1: Anchor, Index 2: Hub
        this.ignoreCount = 0;
        this._initialized = false;
        this._isHandlingPop = false;
        this._isLocked = false;
        this._lastToastTime = 0;
        this._toastCooldown = 2000;
        this._pendingPushes = 0;
    }

    /**
     * Initializes the manager with a 2-state anchor system.
     */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Reset History Anchor
        window.history.replaceState({ stateId: 1, type: 'anchor' }, '');
        window.history.pushState({ stateId: 2, type: 'hub' }, '');

        this.baseStateId = 2;
        this.currentStateId = 2;

        window.addEventListener('popstate', (event) => {
            this._handlePopState(event);
        });

        console.log('NavigationManager v7: Initialized with High-Stability Control.');
    }

    /**
     * Registers a callback for the back button.
     * Includes an eager lock to prevent desync if history moves are pending.
     */
    async pushState(popCallback) {
        if (typeof popCallback !== 'function') return;

        // Eager Lock: Wait for any existing history movements (pop/push) to settle.
        // This prevents 'Double Push' or 'Push-during-Back' race conditions.
        let attempts = 0;
        while ((this._isLocked || this._isHandlingPop || this.ignoreCount > 0) && attempts < 10) {
            console.log(`NavigationManager: Waiting for settle... (depth: ${this.popStack.length})`);
            await new Promise(r => setTimeout(r, 50));
            attempts++;
        }

        this.popStack.push(popCallback);
        this.currentStateId++;

        // Eagerly update local state before calling browser history
        const newStateId = this.currentStateId;
        window.history.pushState({ stateId: newStateId, type: 'ui-state' }, '');

        console.log(`NavigationManager: Pushed ID ${newStateId}. Stack depth: ${this.popStack.length}`);
    }

    /**
     * Manually triggers a history back event without firing callbacks.
     * Used when the UI element is closed via code instead of the browser's back button.
     */
    popStateSilently() {
        if (this.popStack.length === 0) return;
        if (this._isHandlingPop) return; // Already on the move

        // Eagerly update state
        this.popStack.pop();
        this.ignoreCount++;
        this._isLocked = true;

        console.log(`NavigationManager: Eagerly popping (ignore: ${this.ignoreCount}). New Target: ${this.currentStateId - 1}`);
        window.history.back();

        // Safety: Auto-unlock if popstate is swallowed by the browser (rare but happens)
        setTimeout(() => {
            if (this._isLocked && this.ignoreCount > 0) {
                console.warn('NavigationManager: Pop State Safety Unlock.');
                this._isLocked = false;
                this.ignoreCount = 0;
                // Force sync current ID based on current browser state if possible
                if (window.history.state && window.history.state.stateId) {
                    this.currentStateId = window.history.state.stateId;
                }
            }
        }, 500);
    }

    /**
     * Internal handler for all history navigation events (back/forward).
     */
    _handlePopState(event) {
        this._isHandlingPop = true;
        this._isLocked = false;

        try {
            const state = event.state;
            const stateId = (state && state.stateId) ? state.stateId : 1;

            console.log(`NavigationManager v7: Pop detected. State: ${stateId}, Current Stack Depth: ${this.popStack.length}`);

            // 1. SILENT POP SYNC: Check if this was a manual pop we should ignore
            if (this.ignoreCount > 0) {
                this.ignoreCount--;
                this.currentStateId = stateId;
                console.log(`NavigationManager: Manual ignore resolved. Current state: ${stateId}`);
                return;
            }

            // 2. UI CLOSURE: If moving backwards, call registered callbacks
            if (stateId < this.currentStateId) {
                const diff = this.currentStateId - stateId;
                // Only pop callbacks that are 'above' the target stateId
                // Example: Hub is 2. If we go to 2, we should pop everything in stack.
                const popsRequired = Math.min(diff, this.popStack.length);

                if (popsRequired > 0) {
                    console.log(`NavigationManager: Automatically closing ${popsRequired} element(s).`);
                    for (let i = 0; i < popsRequired; i++) {
                        const callback = this.popStack.pop();
                        if (callback) {
                            try { callback(); } catch (err) { console.error('Callback error:', err); }
                        }
                    }
                }
            }

            // 3. EXIT PREVENTION: Trap browser going past the Hub (Anchor 1)
            if (stateId < this.baseStateId) {
                console.warn('NavigationManager: Hub Exit Trap triggered.');
                window.history.go(this.baseStateId - stateId);
                this.currentStateId = this.baseStateId;
                this._showExitToast();
                return;
            }

            // Standard synchronization
            this.currentStateId = stateId;

        } catch (err) {
            console.error('NavigationManager Critical Failure:', err);
        } finally {
            this._isHandlingPop = false;
        }
    }

    _showExitToast() {
        const now = Date.now();
        if (now - this._lastToastTime > this._toastCooldown) {
            ToastManager.info('To exit the app, please use the Logout button.');
            this._lastToastTime = now;
        }
    }
}

export const navManager = new NavigationManager();
