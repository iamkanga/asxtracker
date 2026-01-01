/**
 * DIAGNOSTIC: Verify Data Ingestion for JHPI
 * Run this in your browser console.
 */
(async function checkDataLikelihood() {
    console.log("🔍 Checking App Data Layer...");

    try {
        // 1. Check DataService Cache (Source of Truth for Live Data)
        const appModule = await import('./modules/data/DataService.js?t=' + Date.now());
        const userStore = appModule.userStore; // Access UserStore via export if needed, or AppState

        // Better: Access AppState directly as it holds the livePrices map
        const stateModule = await import('./modules/state/AppState.js?t=' + Date.now());
        const AppState = stateModule.AppState;

        if (AppState && AppState.livePrices) {
            const data = AppState.livePrices.get('JHPI');
            if (data) {
                console.log("✅ JHPI found in App State:");
                console.log(`   High: ${data.high} (Should be 54.10)`);
                console.log(`   Low:  ${data.low}  (Should be 45.31)`);
                console.log(`   Live: ${data.live}`);

                if (Math.abs(data.high - 54.10) < 0.1) {
                    console.log("🎉 CONCLUSION: Data IS arriving correctly! The App Logic (NotificationStore) is ignoring it.");
                } else if (data.high === data.live) {
                    console.log("❌ CONCLUSION: Data arrives INCORRECTLY as Proxy (High=Live). The App Logic is receiving garbage.");
                } else {
                    console.log("❓ CONCLUSION: Data is different but not 54.10. Received:", data.high);
                }
            } else {
                console.log("⚠️ JHPI not found in App State. (Search filter active?)");
            }
        }
    } catch (e) {
        console.error("Audit error:", e);
    }
})();
