/**
 * DATA INTEGRITY VERIFICATION SUITE
 * ---------------------------------
 * This script verifies the Data Pipeline for JHPI (or any stock).
 * It validates:
 * 1. SERVER: Is the backend sending the correct 52-week data?
 * 2. TRANSLATION: Does the App's logic correctly parse it (vs falling back to Live Price)?
 */

(async function verifyDataIntegrity() {
    console.clear();
    console.log("%c🧪 STARTING DATA INTEGRITY CHECK...", "color: #00e676; font-size: 16px; font-weight: bold;");

    const TARGET = 'JHPI';
    const EXPECTED_MIN_HIGH = 53.0; // We expect ~54.10, so > 53 is safe.

    // 1. FETCH RAW DATA
    console.log(`%c\n[1] FETCHING RAW DATA FROM API...`, "color: #29b6f6; font-weight: bold;");
    const API_URL = "https://script.google.com/macros/s/AKfycbwwwMEss5DIYblLNbjIbt_TAzWh54AwrfQlVwCrT_P0S9xkAoXhAUEUg7vSEPYUPOZp/exec";

    try {
        const response = await fetch(`${API_URL}?stockCode=${TARGET}&_t=${Date.now()}`); // Cash busting
        const json = await response.json();

        let rawItem = null;
        if (Array.isArray(json)) {
            rawItem = json.find(x => x.ASXCode === TARGET);
        } else if (json.ASXCode === TARGET) {
            rawItem = json;
        }

        if (!rawItem) {
            console.error(`❌ FATAL: No data returned for ${TARGET}`);
            return;
        }

        console.log("   Raw Payload:", rawItem);

        // 2. SIMULATE APP TRANSLATION (Logic from DataService.js)
        console.log(`%c\n[2] VERIFYING APP TRANSLATION LOGIC...`, "color: #29b6f6; font-weight: bold;");

        // Exact logic used in DataService.js _normalizePriceData
        const live = parseFloat(rawItem.LivePrice);
        const high52 = parseFloat(rawItem.High52 || 0);
        const low52 = parseFloat(rawItem.Low52 || 0);

        const appObject = {
            code: rawItem.ASXCode,
            live: live,
            high: high52,
            low: low52,
            isProxy: (live === high52 && live === low52) // Detect the old bug condition
        };

        console.log("   Simulated App Object:", appObject);

        // 3. FINAL VERDICT
        console.log(`%c\n[3] DIAGNOSTIC VERDICT`, "color: #29b6f6; font-weight: bold;");

        if (appObject.high > EXPECTED_MIN_HIGH) {
            console.log(`%c✅ PASS: High52 is ${appObject.high} (Correct Manual Data)`, "color: #00e676; font-size: 14px; font-weight: bold;");
        } else if (appObject.isProxy) {
            console.log(`%c❌ FAIL: High52 matches Live Price (${appObject.live}). The Proxy Fallback is still active!`, "color: #ff5252; font-size: 14px; font-weight: bold;");
        } else {
            console.log(`%c⚠️ WARNING: High52 is ${appObject.high}, which is lower than expected (${EXPECTED_MIN_HIGH}). Check data source.`, "color: #ff9800; font-size: 14px; font-weight: bold;");
        }

        if (appObject.low > 0 && appObject.low < appObject.live) {
            console.log(`%c✅ PASS: Low52 is ${appObject.low} (Valid)`, "color: #00e676; font-weight: bold;");
        }

    } catch (e) {
        console.error("❌ TEST FAILED:", e);
    }
})();
