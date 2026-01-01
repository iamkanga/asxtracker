/**
 * FORCE DATA UPDATE SCRIPT
 * Run this function in the Google Apps Script Editor.
 * It manually triggers the 52-Week High/Low Scan, forcing the system to
 * re-read the Google Sheet (with the new fix) and update the App's database.
 */
function forceRun52WeekScan() {
    Logger.log("--- FORCE RUNNING 52-WEEK SCAN ---");

    try {
        // This is the main function that your periodic trigger calls.
        // By running it manually, we bypass the 30-minute wait.
        runGlobal52WeekScan();

        Logger.log("✅ Scan completed successfully.");
        Logger.log("The App Database (Firestore) has been updated.");
        Logger.log("👉 Now REFRESH your App to see the changes.");

    } catch (e) {
        Logger.log("❌ Error running scan: " + e.message);
        Logger.log("Stack: " + e.stack);
    }
}
