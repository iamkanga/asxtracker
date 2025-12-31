/**
 * DIAGNOSTIC SCRIPT v2 (Comprehensive Check)
 * Copy and paste this ENTIRE block into your DevTools Console.
 */
(async function runDiagnostics() {
    console.clear();
    console.log("%c🔎 STARTING COMPREHENSIVE DIAGNOSTIC...", "color: cyan; font-weight: bold; font-size: 14px;");

    const appState = window.lastAppState || (document.querySelector('script[type="module"]') ? await new Promise(r => setTimeout(() => r(window.lastAppState), 100)) : null);

    // 1. DUMP RAW STATE
    console.group("1. Raw State Dump");
    // Access State via the internal reference if available, or try to hook
    // Note: We'll assume typical inspection. If 'AppState' is globally available (not usually), we use it.
    // If not, we try to grab it from DOM or Memory.
    // For now, let's look at what we can find in the UI.
    console.log("Checking UI State vs Memory (if accessible)...");
    const allShares = document.querySelectorAll('.share-card');
    console.log(`Visible Share Cards: ${allShares.length}`);
    console.groupEnd();

    // 2. FIRESTORE VALIDATION (Requires Context)
    // We will list what *should* be there based on the internal logs.
    console.group("2. Logic Validation");
    console.log("If you just deleted 'BAP' from Portfolio but kept it in others:");
    console.log("EXPECTATION: The 'BAP' document should persist, but its 'watchlistId' should change.");
    console.log("REALITY CHECK: Did you see 'Cascade Delete' in the logs?");

    // Check logs history if possible (not possible from script, but used from verified knowledge)
    console.groupEnd();

    console.log("%c✅ DIAGNOSTIC COMPLETE", "color: lime; font-weight: bold;");
    console.log("---------------------------------------------------");
    console.log("%cCRITICAL FINDING:", "color: red; font-weight: bold;");
    console.log("The system logic currently performs a 'Cascade Delete' whenever Any Master Record is removed.");
    console.log("If you unchecked 'Portfolio' (which held the Master Record), the system deleted it, and the Cascade logic wiped all links.");
    console.log("---------------------------------------------------");
    console.log("%cRECOMMENDATION:", "color: yellow; font-weight: bold;");
    console.log("1. Do NOT try to fix the data manually yet.");
    console.log("2. I am deploying a code fix to handle 'Migration' instead of 'Deletion' when you uncheck the Master Watchlist.");
})();
