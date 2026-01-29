function FIND_MY_MASTER() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptId = ScriptApp.getScriptId();
  const webAppUrl = ScriptApp.getService().getUrl();
  
  console.log("--- SCRIPT IDENTITY CHECK ---");
  console.log("Current Script ID: " + scriptId);
  console.log("Current Web App URL: " + webAppUrl);
  console.log("Attached to Spreadsheet: " + ss.getName());
  console.log("Spreadsheet URL: " + ss.getUrl());
  console.log("-----------------------------");
  
  const targetAppId = "AKfycbyPQfy1WNnK1RXRWGXU4T3iFv_tgXzA9xtpMfkK_R8"; 
  const liveAppId = "AKfycbwwwMEss5DIYblLNbjIbt_TAzWh54AwrfQlVwCrT_P0S9xkAoXhAUEUg7vSEPYUPOZp";
  
  if (webAppUrl && webAppUrl.includes(liveAppId)) {
    console.log("✅ THIS IS THE MASTER (LIVE) SCRIPT. APPLY FIXES HERE.");
  } else {
    console.log("❌ THIS IS A COPY (OR DEV) SCRIPT. DO NOT FIX THIS ONE.");
    console.log("Please look for the script attached to: " + ss.getName());
  }
}
