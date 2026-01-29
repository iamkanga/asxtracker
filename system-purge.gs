/**
 * SYSTEM PURGE & REBUILD TOOL
 * ---------------------------
 * WARNING: This will delete ALL current alerts for today and regenerate them
 * based on the latest spreadsheet data.
 *
 * Use this when the System Integrity Audit reports massive errors or "Ghosts".
 */

function purgeAndRebuildSystem() {
  // Confirmation bypassed for Editor Execution
  console.log('=== STARTING SYSTEM PURGE & REBUILD (Automated Mode) ===');
  console.log('⚠️ WARNING: Deleting all alerts and regenerating...');
  
  // 1. PURGE (Wipe the Whiteboard)
  console.log('1. Wiping Firestore Database...');
  try {
    const emptyMovers = { upHits: [], downHits: [], updatedAt: new Date() };
    const emptyHiLo   = { highHits: [], lowHits: [], updatedAt: new Date() };
    const emptyCustom = { hits: [], updatedAt: new Date() };
    
    commitCentralDoc_(DAILY_MOVERS_HITS_DOC_SEGMENTS, emptyMovers);
    commitCentralDoc_(DAILY_HILO_HITS_DOC_SEGMENTS, emptyHiLo);
    commitCentralDoc_(DAILY_CUSTOM_HITS_DOC_SEGMENTS, emptyCustom);
    console.log('✅ Database Wiped Clean.');
  } catch (e) {
    console.error('❌ Purge Failed: ' + e);
    return; // Don't proceed if purge fails
  }
  
  // 2. REPAIR (Fix the Bad Data)
  console.log('2. repairing Stale Data (Fetching fresh prices from Yahoo)...');
  try {
    repairBrokenPrices(); // Force Yahoo fetch for #N/A or $102 XRO items
    console.log('✅ Prices Repaired.');
  } catch (e) {
    console.warn('⚠️ Repair had warnings (check logs), proceeding to scan...');
  }
  
  // 3. REBUILD (Run the Scans)
  console.log('3. Re-running Global Scans...');
  try {
    runGlobalMoversScan();
    console.log('✅ Movers Scan Complete.');
    
    runGlobal52WeekScan();
    console.log('✅ 52-Week Scan Complete.');
  } catch (e) {
    console.error('❌ Rescan Failed: ' + e);
  }
  
  console.log('=== SYSTEM RESET COMPLETE ===');
  console.log('Check your App. Ghost alerts should be gone.');
}
