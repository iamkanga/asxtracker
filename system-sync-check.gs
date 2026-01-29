/**
 * SYSTEM SYNC CHECK
 * -----------------
 * Run this to confirm the App, the Code, and the Sheet are all talking.
 */

function verifySystemicSync() {
  const url = ScriptApp.getService().getUrl();
  console.log("--- SYSTEMIC SYNC CHECK ---");
  console.log("1. Web App URL: " + (url || "❌ NOT DEPLOYED"));
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Call the ACTUAL logic used by the email/app
  const priceRows = fetchPriceRowsForMovers_(ss);
  
  console.log("2. Spreadsheet Connection: Found " + priceRows.length + " valid stocks.");
  
  // Checking XRO as a benchmark for the pipeline
  const benchmark = priceRows.find(r => r.code === 'XRO');
  if (benchmark) {
    console.log("3. Pipeline Test (XRO): Value is $" + benchmark.live);
    if (Math.abs(benchmark.live - 94.9) < 0.1) {
      console.log("✅ RESULT: Pipeline is SUCCESSFUL. Your code sees the correct data.");
    } else {
      console.log("❌ RESULT: Pipeline is STALE. The script is still seeing old data.");
    }
  }
  
  console.log("\n--- ACTION REQUIRED ---");
  console.log("If result is SUCCESS but App still shows old prices:");
  console.log("> You MUST go to: Deploy -> Manage Deployments -> Edit -> Version: NEW VERSION -> Deploy.");
}
