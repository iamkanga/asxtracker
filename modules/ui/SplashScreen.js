/**
 * SplashScreen.js
 * Manages the application's startup sequence, visual intro, and transition to dashboard.
 * Bridges the gap between DOM_READY and FIREBASE_DATA_LOADED.
 */

import { EVENTS, CSS_CLASSES, IDS, ANIMATIONS } from '../utils/AppConstants.js';

export class SplashScreen {
    constructor() {
        this.container = document.getElementById(IDS.SPLASH_SCREEN);
        // Bindings
        this.init = this.init.bind(this);
    }

    init() {
        if (!this.container) {
            console.warn('SplashScreen: Container not found.');
            return;
        }

        this._setupDOM();

        // --- STATE FLAGS ---
        this.isEntryComplete = false;
        this.isDataLoaded = false;
        this.currentState = 'idle';

        // --- BINDINGS ---
        // Listen for Animation End to transition States
        const logo = this.container.querySelector(`.${CSS_CLASSES.SPLASH_LOGO}`);
        if (logo) {
            logo.addEventListener('animationend', (e) => this._handleAnimationEnd(e));
        }

        // --- DATA SIGNAL ---
        document.addEventListener(EVENTS.FIREBASE_DATA_LOADED, () => {
            this.attemptExit();
        });

        // --- START SEQUENCE ---
        this._setState(CSS_CLASSES.SPLASH_ENTER);
    }

    _setState(state) {
        const logo = this.container.querySelector(`.${CSS_CLASSES.SPLASH_LOGO}`);
        if (!logo) return;

        // Clean previous states
        logo.classList.remove(CSS_CLASSES.SPLASH_ENTER, CSS_CLASSES.SPLASH_LOOP, CSS_CLASSES.SPLASH_EXIT);

        // Apply new state
        logo.classList.add(state);
        this.currentState = state;
        // console.log(`SplashScreen: State -> ${state}`);
    }

    _handleAnimationEnd(e) {
        // Transition: ENTER -> LOOP (or Exit if data is ready)
        if (e.animationName === ANIMATIONS.SLAM_ENTRY) {
            this.isEntryComplete = true;

            // If data is already loaded, go straight to exit. 
            // Otherwise go to loop loop.
            if (this.isDataLoaded) {
                this._checkExit();
            } else {
                this._setState(CSS_CLASSES.SPLASH_LOOP);
            }
        }

        // Transition: EXIT -> REMOVE
        if (e.animationName === ANIMATIONS.ZOOM_EXIT) {
            this.container.classList.add(CSS_CLASSES.HIDDEN);
        }
    }

    attemptExit() {
        // Mark data as ready.
        this.isDataLoaded = true;
        this._checkExit();
    }

    _checkExit() {
        // Only trigger exit if BOTH the entry animation is done AND data is loaded.
        if (this.isEntryComplete && this.isDataLoaded) {
            this._triggerExitAnim();
        }
    }

    _triggerExitAnim() {
        // console.log('SplashScreen: Triggering Exit...');
        this._setState(CSS_CLASSES.SPLASH_EXIT);

        // Fallback safety in case animationend misses (V47: Optimized for smoother release)
        setTimeout(() => {
            if (!this.container.classList.contains(CSS_CLASSES.HIDDEN)) {
                this.container.classList.add(CSS_CLASSES.HIDDEN);
            }
        }, 1200);
    }

    _setupDOM() {
        // Ensure the container has the correct layered structure
        // We expect index.html to have the basic shell, but we ensure classes here.
        this.container.classList.add(CSS_CLASSES.SPLASH_SYSTEM);
    }

    setTheme(themeName) {
        this.currentTheme = themeName;
    }

    hide() {
        if (!this.container) return;

        console.log('SplashScreen: Transitioning to Dashboard...');
        this.container.classList.add(CSS_CLASSES.SPLASH_IS_EXITING);

        setTimeout(() => {
            this.container.classList.add(CSS_CLASSES.HIDDEN);
        }, 800);
    }
}
