/**
 * DIAGNOSTIC: Audit Notification Store Output
 * Run this in the browser console to see exactly what the UI is receiving.
 */
(async function auditNotificationStore() {
    console.log("🔍 Starting Notification Store Audit...");

    // 1. Access the Store
    // We need to import it or access it via the global registry if available.
    // Since modules are closed, we can try to access via the UI DOM if attached, or standard import not possible in console easily.
    // STRATEGY: We will re-import the module dynamically.

    try {
        const nsModule = await import('./modules/state/NotificationStore.js?t=' + Date.now());
        const store = nsModule.notificationStore;

        if (!store) {
            console.error("❌ Could not access notificationStore. Is the app running?");
            return;
        }

        console.log("✅ Store Accessed. Fetching Global Alerts...");

        const globals = store.getGlobalAlerts(true); // true = bypass strict mode to see everything
        const highs = globals.hilo?.high || [];
        const lows = globals.hilo?.low || [];

        console.log(`📊 Global Highs Found: ${highs.length}`);
        console.log(`📊 Global Lows Found: ${lows.length}`);

        // INSPECT SPECIFIC "PROBLEM" STOCKS
        const targets = ['JHPI', 'FBR', 'ANZ', 'BHP'];

        targets.forEach(code => {
            const matchHigh = highs.find(h => (h.code || '').includes(code));
            const matchLow = lows.find(h => (h.code || '').includes(code));

            if (matchHigh || matchLow) {
                console.group(`🔎 Analysis for ${code}`);
                if (matchHigh) {
                    console.log("Type: HIGH Alert");
                    console.log("Raw High:", matchHigh.high);
                    console.log("Raw Low:", matchHigh.low);
                    console.log("High52 Prop:", matchHigh.high52);
                    console.log("Low52 Prop:", matchHigh.low52);
                    console.log("Live Price:", matchHigh.live || matchHigh.price);
                    console.log("Full Object:", matchHigh);
                }
                if (matchLow) {
                    console.log("Type: LOW Alert");
                    console.log("Raw High:", matchLow.high);
                    console.log("Raw Low:", matchLow.low);
                    console.log("High52 Prop:", matchLow.high52);
                    console.log("Low52 Prop:", matchLow.low52);
                    console.log("Live Price:", matchLow.live || matchLow.price);
                    console.log("Full Object:", matchLow);
                }
                console.groupEnd();
            } else {
                console.log(`⚠️ ${code} not found in Global Alerts list.`);
            }
        });

    } catch (e) {
        console.error("Audit Failed:", e);
    }
})();
