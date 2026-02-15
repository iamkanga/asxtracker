/**
 * main.js
 * Application Entry Point
 * Bootstraps the AppController.
 */

import { AppController } from './modules/controllers/AppController.js?v=1143';
import { SplashScreen } from './modules/ui/SplashScreen.js';
import { marketIndexController } from './modules/ui/MarketIndexController.js';

console.log('%c [MAIN] ASX TRACKER v1143 ', 'background: #222; color: #bada55; font-weight: bold;');

const app = new AppController();
const splash = new SplashScreen();

// Boot
document.addEventListener('DOMContentLoaded', () => {
    // LOGIC HARDENING: Safety wrapper to prevent White Screen of Death
    try {
        splash.init();
    } catch (e) {
        console.error('[main] SplashScreen init failed:', e);
    }

    try {
        app.init();
    } catch (e) {
        console.error('[main] AppController init failed:', e);
    }
});
