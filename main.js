/**
 * main.js
 * Application Entry Point
 * Bootstraps the AppController.
 */

import { AppController } from './modules/controllers/AppController.js?v=1152';
import { SplashScreen } from './modules/ui/SplashScreen.js';
import { marketIndexController } from './modules/ui/MarketIndexController.js';
import { widgetPanel } from './modules/ui/WidgetPanel.js?v=1152';
import { widgetController } from './modules/controllers/WidgetController.js?v=1152';

console.log('%c [MAIN] ASX TRACKER v1152 ', 'background: #222; color: #bada55; font-weight: bold;');

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

    // Initialize Widget Feature
    try {
        const widgetContainer = document.getElementById('widget-panel');
        if (widgetContainer) {
            console.log('[main] Found widget-panel, initializing...');
            widgetPanel.init(widgetContainer);
            widgetController.init();
        } else {
            console.error('[main] FAILED TO FIND widget-panel in DOM');
        }
    } catch (e) {
        console.error('[main] Widget initialization failed:', e);
    }
});
