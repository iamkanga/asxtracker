/**
 * XRO GLOBAL MOVERS AUDIT (DEEP SCAN)
 * ----------------------------------
 * This script audits the specific document that powers your App UI lists.
 */

function debug_XRO_Audit_Full() {
  console.log('--- STARTING XRO GLOBAL MOVERS AUDIT ---');
  
  const ticker = 'XRO';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Prices');
  
  // 1. SHEET TRUTH
  const data = sheet.getDataRange().getValues();
  const xroRow = data.find(r => String(r[0]).toUpperCase() === ticker);
  const sheetPrice = xroRow ? xroRow[3] : 'MISSING'; // Col D
  console.log(`[Sheet] XRO Price (Col D): ${sheetPrice}`);

  // 2. FIRESTORE AUDIT
  try {
    const segments = ['artifacts', 'asx-watchlist-app', 'alerts', 'GLOBAL_MOVERS'];
    console.log(`[Firestore] Fetching: ${segments.join('/')}`);
    
    // Use manual fetch to be 100% sure we see the raw data
    const url = `https://firestore.googleapis.com/v1/projects/asx-watchlist-app/databases/(default)/documents/artifacts/asx-watchlist-app/alerts/GLOBAL_MOVERS`;
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }
    });
    
    if (response.getResponseCode() !== 200) {
       console.log(`❌ FAILED to fetch Firestore Doc: ${response.getContentText()}`);
       return;
    }

    const doc = JSON.parse(response.getContentText());
    const fields = doc.fields || {};
    
    // Parse the 'down' array
    const downArr = fields.down && fields.down.arrayValue && fields.down.arrayValue.values ? fields.down.arrayValue.values : [];
    
    let found = false;
    downArr.forEach(v => {
      const map = v.mapValue.fields;
      const code = map.code.stringValue;
      if (code === ticker) {
        found = true;
        const live = map.live.doubleValue || map.live.integerValue;
        console.log(`✅ FOUND XRO in GLOBAL_MOVERS Document!`);
        console.log(` > Database Price: ${live}`);
        console.log(` > Database Change: ${map.change.doubleValue || map.change.integerValue}`);
        
        if (Math.abs(live - sheetPrice) > 0.01) {
          console.log(`❌ DISCREPANCY DETECTED: Database still says ${live}, Sheet says ${sheetPrice}`);
        }
      }
    });

    if (!found) {
      console.log(`❓ XRO is NOT in the Global Movers document.`);
    }
    
    console.log(`[Meta] Doc updatedAt: ${fields.updatedAt ? fields.updatedAt.timestampValue : 'N/A'}`);

  } catch (e) {
    console.log(`❌ Error: ${e}`);
  }
}
