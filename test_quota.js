/**
 * QUOTA DIAGNOSTIC TOOL
 * Run this function to verify if your Google Apps Script Quota is truly blocked.
 */
function testConnectivity() {
    Logger.log('🧪 Starting Connectivity Test...');

    // TEST 1: Basic Internet Access (Google.com)
    // This checks if UrlFetchApp works AT ALL.
    try {
        Logger.log('1️⃣ Testing Google.com...');
        UrlFetchApp.fetch('https://www.google.com');
        Logger.log('✅ Google.com fetch SUCCESS (Basic internet is working)');
    } catch (e) {
        Logger.log('❌ Google.com fetch FAILED: ' + e.message);
        if (e.message.includes('Service invoked too many times')) {
            Logger.log('💀 CONCLUSION: Your account is HARD BLOCKED by Google for today.');
            return;
        }
    }

    // TEST 2: Yahoo Finance Single Call
    // This checks if the specific Yahoo endpoint is blocked or if it's the batch logic.
    try {
        Logger.log('2️⃣ Testing Yahoo Finance (Single Stock)...');
        const url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/BHP.AX?modules=summaryProfile';
        const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

        if (resp.getResponseCode() === 200) {
            Logger.log('✅ Yahoo fetch SUCCESS (Code 200). Data received!');
            Logger.log('ℹ️ CONCLUSION: Your quota seems FINE. The issue IS "Batch Fetch Failed" in the other script.');
            Logger.log('👉 Since this single one works, the "Batch" script might be constructing bad URLs or hitting a rate limit faster.');
        } else {
            Logger.log('⚠️ Yahoo fetch returned Code: ' + resp.getResponseCode());
            Logger.log('Response: ' + resp.getContentText().substring(0, 100));
        }
    } catch (e) {
        Logger.log('❌ Yahoo fetch FAILED: ' + e.message);
        if (e.message.includes('Service invoked too many times')) {
            Logger.log('💀 CONCLUSION: You hit the "External URL" quota limit.');
        } else {
            Logger.log('❓ Unknown error. It might be a network glitch or Yahoo blocking the script IP.');
        }
    }
}
