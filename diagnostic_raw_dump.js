/**
 * DIAGNOSTIC STEP 2: VERIFY PARSING LOGIC
 * Run this function in the Google Apps Script Editor to confirm the fix works in the backend.
 * If this logs the CORRECT 52-week data (High ~54.1, Low ~45.31), then the issue is simply that
 * the Web App needs to be REDEPLOYED (Manage Deployments -> New Version).
 */
function testJHPIPfeed() {
    Logger.log("--- TESTING buildPriceFeedArray_ FOR JHPI ---");

    // Call the internal function directly
    try {
        var results = buildPriceFeedArray_('JHPI');

        if (results && results.length > 0) {
            var data = results[0];
            Logger.log("Found Data for: " + data.ASXCode);
            Logger.log("Live Price: " + data.LivePrice);
            Logger.log("High52: " + data.High52);
            Logger.log("Low52: " + data.Low52);

            if (data.High52 > 52) {
                Logger.log("✅ SUCCESS: High52 is correctly parsed from API column!");
                Logger.log("👉 ACTION REQUIRED: Please REDEPLOY your Web App to apply this fix to the frontend.");
            } else {
                Logger.log("❌ FAILURE: High52 is still proxied or incorrect.");
            }
        } else {
            Logger.log("No data returned for JHPI.");
        }
    } catch (e) {
        Logger.log("Error running test: " + e.message);
    }
}
