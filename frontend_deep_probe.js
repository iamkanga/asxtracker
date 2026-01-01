/**
 * FRONTEND DEEP PROBE SCRIPT
 * --------------------------
 * Copy and paste this entire block into your Browser Console (F12 > Console).
 * It performs two checks:
 * 1. CHECKS THE UI: Inspects the actual notification cards on screen to see what data is stored inside them.
 * 2. CHECKS THE NETWORK: Fetches a fresh copy of data from the server to compare.
 */

(async function runDeepProbe() {
    console.clear();
    console.log("%c🕵️ STARTING DEEP DATA PROBE...", "color: #00e676; font-size: 16px; font-weight: bold;");

    const TARGET_CODE = 'JHPI';

    // --- CHECK 1: UI INSPECTION ---
    console.log(`%c[1] INSPECTING UI FOR ${TARGET_CODE}...`, "color: #29b6f6; font-weight: bold;");

    const cards = Array.from(document.querySelectorAll('.notification-card'));
    const targetCard = cards.find(c => c.dataset.code === TARGET_CODE || (c._alertData && c._alertData.code === TARGET_CODE));

    if (targetCard) {
        console.log("✅ Found Notification Card for JHPI.");
        console.log("   Internal Data:", targetCard._alertData);

        const data = targetCard._alertData || {};
        const rangeText = targetCard.innerText.replace(/\n/g, " ");
        console.log("   Displayed Text:", rangeText);

        // Validation Logic
        const high = parseFloat(data.high52 || data.high || 0);
        const low = parseFloat(data.low52 || data.low || 0);

        if (high > 53) {
            console.log(`%c✅ UI STATUS: PASS. High52 is ${high} (Correct).`, "color: #00e676; font-weight: bold;");
        } else {
            console.log(`%c❌ UI STATUS: FAIL. High52 is ${high} (Expected > 53).`, "color: #ff5252; font-weight: bold;");
            console.warn("   Possible cause: Old cached data is still being rendered.");
        }
    } else {
        console.warn(`⚠️ UI STATUS: JHPI Notification Card not found on screen. Open the notification modal first!`);
    }

    // --- CHECK 2: NETWORK FETCH ---
    console.log(`%c\n[2] CHECKING SERVER RESPONSE (Direct Fetch)...`, "color: #29b6f6; font-weight: bold;");
    const API_URL = "https://script.google.com/macros/s/AKfycbwwwMEss5DIYblLNbjIbt_TAzWh54AwrfQlVwCrT_P0S9xkAoXhAUEUg7vSEPYUPOZp/exec";

    try {
        const response = await fetch(`${API_URL}?stockCode=${TARGET_CODE}&_t=${Date.now()}`);
        const json = await response.json();

        // Handle array or single object response
        const item = Array.isArray(json) ? json.find(i => i.ASXCode === TARGET_CODE) : (json.ASXCode === TARGET_CODE ? json : null);

        if (item) {
            console.log("✅ Server Data Received:", item);
            const high = parseFloat(item.High52 || 0);

            if (high > 53) {
                console.log(`%c✅ NETWORK STATUS: PASS. Server returned High52: ${high}`, "color: #00e676; font-weight: bold;");
            } else {
                console.log(`%c❌ NETWORK STATUS: FAIL. Server returned High52: ${high}`, "color: #ff5252; font-weight: bold;");
            }
        } else {
            console.error("❌ Network Status: Item not found in response.", json);
        }
    } catch (e) {
        console.error("❌ Network Check Failed:", e);
    }

    console.log("%c\n🏁 PROBE COMPLETE", "color: #bdbdbd; font-weight: bold;");
})();
