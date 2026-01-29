function debug_CheckDashboardXRO() {
  const ticker = 'XRO';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Dashboard');
  if (!sheet) {
    console.log("❌ 'Dashboard' sheet not found.");
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const xroRow = data.find(r => String(r[0]).toUpperCase() === ticker);
  
  if (xroRow) {
    console.log("✅ Found XRO in Dashboard sheet.");
    console.log(` > Value in Cell: ${xroRow[2] || xroRow[3] || 'Unknown'}`);
    console.log(` > Entire Row: ${JSON.stringify(xroRow)}`);
  } else {
    console.log("❌ XRO not found in Dashboard sheet.");
  }
}
