/**
 * INTEGRITY AUDIT SCRIPT
 * ----------------------
 * A standalone tool to verify the "Truth" of the system.
 * It compares the Active Alerts (Firestore) against the Raw Data (Spreadsheet)
 * to identify "Ghosts" (False Positives) and "Misses" (False Negatives).
 *
 * HOW TO USE:
 * 1. Add this file to your Apps Script Project (name it: "integrity-audit.gs").
 * 2. Select `runSystemIntegrityAudit` from the dropdown.
 * 3. Click Run.
 * 4. View the Execution Log for the report.
 */

function runSystemIntegrityAudit() {
  console.log('=== STARTING SYSTEM INTEGRITY AUDIT ===');
  console.log('1. Fetching "Truth" (Spreadsheet Data)...');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pricesSheet = ss.getSheetByName(GAS_CONFIG.SHEETS.PRICES);
  const data = pricesSheet.getDataRange().getValues();
  const headers = data[0];
  
  // -- A. Clean Reader Logic (Independent Verification) --
  // We reimplement a simple reader here to avoid using the "potentially buggy" main logic.
  const map = {}; headers.forEach((h,i)=> map[String(h).toUpperCase().replace(/[^A-Z0-9]/g, '')] = i);
  
  const idxCode = map['ASXCODE'] ?? map['CODE'];
  const idxLive = map['LIVEPRICE'] ?? map['LAST'] ?? map['PRICE'];
  const idxPrev = map['PREVCLOSE'] ?? map['PREVDAYCLOSE'];
  const idxHigh = map['HIGH52'] ?? map['52WEEKHIGH'];
  const idxLow  = map['LOW52'] ?? map['52WEEKLOW'];
  
  const idxApiPrice = map['APIPRICE'] ?? map['PIPRICE'] ?? map['APILAST'];
  const idxApiPrev  = map['APIPREV'] ?? map['APIPREVCLOSE'];
  
  const marketMap = new Map();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(row[idxCode]).trim().toUpperCase();
    if (!code) continue;
    
    // -- THE TRUTH LOGIC (Smart Fallback) --
    let live = row[idxLive];
    let prev = row[idxPrev];
    
    const isBroken = (v) => (v == null || v === '' || v === '#N/A' || String(v).includes('Error'));
    
    // Smart Fallback verification
    if (isBroken(live) && idxApiPrice != null && !isBroken(row[idxApiPrice])) {
       live = row[idxApiPrice]; // Recovered
    }
    
    if (isBroken(prev) && idxApiPrev != null && !isBroken(row[idxApiPrev])) {
       prev = row[idxApiPrev]; // Recovered
    }
    
    // Parse
    const nLive = (typeof live === 'number') ? live : Number(String(live).replace(/[^0-9.]/g, ''));
    const nPrev = (typeof prev === 'number') ? prev : Number(String(prev).replace(/[^0-9.]/g, ''));
    const nHigh = Number(row[idxHigh]);
    const nLow  = Number(row[idxLow]);
    
    if (isNaN(nLive) || nLive === 0) continue; // Truly broken, can't audit
    
    marketMap.set(code, { 
      code, 
      live: nLive, 
      prev: nPrev, 
      high: nHigh, 
      low: nLow,
      change: (nLive - nPrev),
      pct: nPrev ? ((nLive - nPrev)/nPrev)*100 : 0
    });
  }
  
  console.log(`> Indexed ${marketMap.size} stocks from Spreadsheet.`);
  
  // -- B. Fetch "System State" (Firestore) --
  console.log('2. Fetching "System State" (Firestore Alerts)...');
  
  const moversDoc = _fetchFirestoreDocument_(DAILY_MOVERS_HITS_DOC_SEGMENTS);
  const hiloDoc   = _fetchFirestoreDocument_(DAILY_HILO_HITS_DOC_SEGMENTS);
  const customDoc = _fetchFirestoreDocument_(DAILY_CUSTOM_HITS_DOC_SEGMENTS);
  
  const movers = (moversDoc.ok && moversDoc.data) ? [...(moversDoc.data.upHits||[]), ...(moversDoc.data.downHits||[])] : [];
  const hilos  = (hiloDoc.ok && hiloDoc.data) ? [...(hiloDoc.data.highHits||[]), ...(hiloDoc.data.lowHits||[])] : [];
  const customs = (customDoc.ok && customDoc.data && customDoc.data.hits) ? customDoc.data.hits : [];
  
  console.log(`> Found: ${movers.length} Movers, ${hilos.length} Hi/Lo, ${customs.length} Custom hits.`);
  
  // -- C. Cross-Examination --
  
  const problems = [];
  
  // 1. Audit MOVERS (Ghosts?)
  movers.forEach(hit => {
    const truth = marketMap.get(hit.code);
    if (!truth) {
      problems.push(`[MOVER] 👻 GHOST: ${hit.code} is in Alerts, but NOT in Spreadsheet!`);
      return;
    }
    // Verify Price
    if (Math.abs(hit.live - truth.live) > 0.02) {
      problems.push(`[MOVER] ⚠️ PRICE MISMATCH: ${hit.code} Alert=$${hit.live} vs Sheet=$${truth.live} (Stale Data?)`);
    }
    // Verify Movement
    if (Math.abs(truth.change) < 0.001) {
       problems.push(`[MOVER] 👻 FAKE MOVER: ${hit.code} listed as Mover, but Sheet change is $0.00 (Flat).`);
    }
  });
  
  // 2. Audit HI/LO (Ghosts?)
  hilos.forEach(hit => {
    const truth = marketMap.get(hit.code);
    if (!truth) return; // skip checks if missing
    
    const isHigh = (hit.live >= truth.high && truth.high > 0);
    const isLow  = (hit.live <= truth.low && truth.low > 0);
    
    if (!isHigh && !isLow) {
       problems.push(`[HILO] 👻 FAKE RECORD: ${hit.code} ($${truth.live}) is NOT at High ($${truth.high}) or Low ($${truth.low}).`);
    }
  });

  // 3. Audit CUSTOM (Stale?)
  customs.forEach(hit => {
    const truth = marketMap.get(hit.code);
    if (!truth) return;
    if (Math.abs(hit.price - truth.live) > 0.05) {
      problems.push(`[CUSTOM] ⚠️ STALE: ${hit.code} Alert=$${hit.price} vs Sheet=$${truth.live}`);
    }
  });
  
  // -- D. Report --
  console.log('=== AUDIT REPORT ===');
  if (problems.length === 0) {
    console.log('✅ CLEAN. No inconsistencies found between Alerts and Spreadsheet.');
  } else {
    console.log(`❌ FOUND ${problems.length} ISSUES:`);
    problems.forEach(p => console.log(p));
  }
  console.log('====================');
}
