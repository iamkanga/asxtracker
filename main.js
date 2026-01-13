/**
 * main.js
 * Application Entry Point
 * Bootstraps the AppController.
 */

import { AppController } from './modules/controllers/AppController.js?v=1040';
import { SplashScreen } from './modules/ui/SplashScreen.js';

console.log('%c [MAIN] APPLICATION VERSION 1040 LOADED ', 'background: #222; color: #bada55');

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
