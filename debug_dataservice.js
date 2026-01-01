/**
 * DIAGNOSTIC: Audit DataService Cache for JHPI
 */
(async function auditDataService() {
    console.log("🔍 Checking AppState.livePrices...");

    try {
        const appStateModule = await import('./modules/state/AppState.js?t=' + Date.now());
        const AppState = appStateModule.AppState;

        if (!AppState || !AppState.livePrices) {
            console.error("❌ AppState.livePrices not available.");
            return;
        }

        const code = 'JHPI';
        const data = AppState.livePrices.get(code);

        if (data) {
            console.log(`✅ Data found for ${code}:`);
            console.log("Live:", data.live);
            console.log("High52 (data.high):", data.high);
            console.log("Low52  (data.low):", data.low);

            if (data.high === data.live && data.low === data.live) {
                console.error("❌ FAILURE: DataService has Proxy Data (High = Low = Live).");
                console.log("This means the Backend API returned this, OR DataService normalization failed.");
            } else {
                console.log("✅ SUCCESS: DataService has REAL range.");
            }
        } else {
            console.error(`❌ ${code} not found in AppState.livePrices.`);
        }

    } catch (e) {
        console.error("Audit Failed:", e);
    }
})();
