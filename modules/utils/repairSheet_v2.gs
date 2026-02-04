/**
 * Internal helper to repair a specific sheet.
 * ARCHITECTURAL RULE:
 * 1. 'Dashboard': Pure Yahoo API mode. Forces overwrite with official settlement data.
 * 2. 'Prices' (or others): Safety mode. Only updates if price is broken or formula is missing.
 */
function repairSheet_(sheetName, isForce = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  const isDashboard = (sheetName === 'Dashboard');
  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();
  if (data.length < 2) return;

  // 1. ROBUST HEADER DETECTION
  const rawHeader = data[0].map(h => String(h).toUpperCase().trim());
  const findCol = (name) => rawHeader.indexOf(name.toUpperCase());
  
  const codeIdx = findCol('Code') !== -1 ? findCol('Code') : findCol('ASXCode');
  const priceIdx = findCol('LivePrice') !== -1 ? findCol('LivePrice') : findCol('Price');
  const prevIdx = findCol('PrevClose');
  const targetPrice = priceIdx; // Always write to LivePrice on Dashboard
  const targetPrev = prevIdx;

  if (codeIdx === -1 || targetPrice === -1) {
    Logger.log(`[Error] Required columns missing in ${sheetName}. Looking for Code/LivePrice.`);
    return;
  }

  const problems = [];
  for (let i = 1; i < data.length; i++) {
    const codeRaw = data[i][codeIdx];
    if (!codeRaw) continue;

    const priceVal = data[i][targetPrice];
    let cleanVal = (typeof priceVal === 'string') ? Number(priceVal.replace(/[$, ]/g, '')) : priceVal;
    const isBroken = (cleanVal === 0 || cleanVal === '' || cleanVal == null || isNaN(cleanVal));

    // Dashboard: Always update. Others: Only if broken.
    if (isDashboard || isBroken || isForce) {
      let ticker = String(codeRaw).toUpperCase().trim();
      // Handle Yahoo specifics
      const mapper = { 'XJO': '^AXJO', 'XALL': '^AORD', 'SPX': '^GSPC', 'IXIC': '^IXIC', 'DJI': '^DJI' };
      if (mapper[ticker]) ticker = mapper[ticker];
      if (ticker.endsWith('-F')) ticker = ticker.replace('-F', '=F');
      if (!ticker.includes('^') && !ticker.includes('=') && !ticker.includes('-') && !ticker.includes('.')) ticker += '.AX';

      problems.push({ row: i + 1, code: ticker });
    }
  }

  if (problems.length === 0) return;

  // 2. BATCH FETCH OFFICIAL DATA
  for (let i = 0; i < problems.length; i += 40) {
    const batch = problems.slice(i, i + 40);
    const ts = new Date().getTime();

    batch.forEach(p => {
      // Use v10 quoteSummary for absolute truth on Dashboard settlement
      const url = isDashboard 
        ? `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(p.code)}?modules=price,summaryDetail&_ts=${ts}`
        : `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(p.code)}&_ts=${ts}`;

      try {
        const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (resp.getResponseCode() === 200) {
          const json = JSON.parse(resp.getContentText());
          let live = null, prev = null;

          if (isDashboard) {
            const res = json.quoteSummary.result[0];
            live = res.price.regularMarketPrice?.raw;
            prev = res.summaryDetail.previousClose?.raw || res.price.regularMarketPreviousClose?.raw;
          } else {
            const q = json.quoteResponse.result[0];
            live = q?.regularMarketPrice;
            prev = q?.regularMarketPreviousClose;
          }

          if (live) {
            sheet.getRange(p.row, targetPrice + 1).setValue(live);
            if (targetPrev !== -1 && prev) sheet.getRange(p.row, targetPrev + 1).setValue(prev);
          }
        }
      } catch(e) { }
    });
    if (i + 40 < problems.length) Utilities.sleep(500);
  }
  Logger.log(`[${sheetName}] Force Clean-up Complete.`);
}
