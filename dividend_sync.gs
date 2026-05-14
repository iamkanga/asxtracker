/**
 * ============================================================================
 * 💰 DIVIDEND HISTORY SYNC (Background Batch Processor)
 * ============================================================================
 * 
 * ARCHITECTURE: "Low-Volume Perpetual Cycle"
 * - Runs every 30 minutes via Time-Driven Trigger
 * - Processes max 5 tickers per run (rate-limit safe)
 * - 2-second pause between Yahoo requests
 * - Writes to: artifacts/asx-watchlist-app/metadata_dividends/{TICKER}
 * 
 * YAHOO V8 ENDPOINT:
 *   https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}.AX
 *   ?interval=1d&range=max&events=div
 * 
 * FRANKING LOGIC:
 *   - .AX tickers → default franking: 1.0 (100% franked)
 *   - All others   → default franking: 0.0 (unfranked)
 *   - User can override per-ticker later via the PWA
 * 
 * SETUP:
 *   1. Paste this entire file into a new GAS file named "dividend_sync.gs"
 *   2. Run setupDividendSyncTrigger() ONCE to activate the 30-minute cycle
 *   3. Run manualDividendSync() to test immediately
 * 
 * DEPENDENCIES: None (self-contained; does NOT import from other GAS files)
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const DIV_CONFIG = {
  /** Master kill switch — set to false to pause all syncing */
  ENABLED: true,

  /** Max tickers to process per trigger run (rate-limit protection) */
  BATCH_SIZE: 5,

  /** Milliseconds to pause between Yahoo API requests */
  THROTTLE_MS: 2000,

  /** Days between re-syncs for any given ticker */
  SYNC_INTERVAL_DAYS: 7,

  /** Firebase project configuration */
  FIREBASE: {
    PROJECT_ID: 'asx-watchlist-app',
    USER_ID: 'sh3zcZGXSceviejDNJQsjRJjVgJ3',
    BASE_URL: 'https://firestore.googleapis.com/v1'
  }
};

// ============================================================================
// 1. MAIN TRIGGER FUNCTION
// ============================================================================

/**
 * 🟢 MAIN JOB: Called every 30 minutes by Time-Driven Trigger.
 * 
 * Flow:
 *   1. Read all unique tickers from the user's portfolio (Firestore)
 *   2. Filter to those needing a sync (lastSync > 7 days or missing)
 *   3. Take top N tickers from the queue
 *   4. For each: fetch dividends from Yahoo V8, write to Firestore
 *   5. Throttle between requests to avoid Yahoo rate-limiting
 */
function processDividendQueue() {
  if (!DIV_CONFIG.ENABLED) {
    console.log('[DivSync] Integration is DISABLED. Skipping.');
    return;
  }

  console.log('[DivSync] ========================================');
  console.log('[DivSync] Starting dividend sync batch...');

  // 1. Get all unique portfolio tickers from Firestore
  const allTickers = getPortfolioTickers_();
  if (allTickers.length === 0) {
    console.log('[DivSync] No tickers found in portfolio. Nothing to sync.');
    return;
  }
  console.log(`[DivSync] Portfolio contains ${allTickers.length} unique tickers.`);

  // 2. Filter to tickers needing sync (lastSync > 7 days or document missing)
  const needsSync = filterTickersNeedingSync_(allTickers);
  if (needsSync.length === 0) {
    console.log('[DivSync] All tickers are up-to-date. Nothing to sync.');
    return;
  }

  // 3. Take batch (max BATCH_SIZE per run)
  const batch = needsSync.slice(0, DIV_CONFIG.BATCH_SIZE);
  console.log(`[DivSync] Processing ${batch.length} of ${needsSync.length} needing sync.`);

  // 4. Process each ticker
  let successCount = 0;
  let failCount = 0;

  batch.forEach((ticker, idx) => {
    try {
      console.log(`[DivSync] (${idx + 1}/${batch.length}) Fetching: ${ticker}`);
      const dividends = fetchYahooDividends_(ticker);

      if (dividends && dividends.length > 0) {
        writeDividendsToFirestore_(ticker, dividends);
        console.log(`[DivSync] ✅ ${ticker}: ${dividends.length} dividend records written.`);
        successCount++;
      } else {
        // Write empty record so we don't re-fetch non-dividend stocks every cycle
        writeDividendsToFirestore_(ticker, []);
        console.log(`[DivSync] ⚠️ ${ticker}: No dividend data from Yahoo (non-payer or delisted).`);
        successCount++;
      }
    } catch (e) {
      console.error(`[DivSync] ❌ ${ticker}: FAILED — ${e.message}`);
      failCount++;
    }

    // 5. Throttle between requests (skip after last item)
    if (idx < batch.length - 1) {
      Utilities.sleep(DIV_CONFIG.THROTTLE_MS);
    }
  });

  console.log(`[DivSync] Batch complete. Success: ${successCount}, Failed: ${failCount}`);
  console.log('[DivSync] ========================================');
}

// ============================================================================
// 2. YAHOO V8 FETCHER
// ============================================================================

/**
 * Fetches historical dividend events from Yahoo Finance V8 chart API.
 * 
 * @param {string} ticker - ASX code WITHOUT suffix (e.g. "BHP")
 * @returns {Array<{exDate: string, amount: number, franking: number}>}
 *   Sorted descending by exDate (newest first).
 */
function fetchYahooDividends_(ticker) {
  const symbol = `${ticker.toUpperCase()}.AX`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=max&events=div`;

  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const httpCode = response.getResponseCode();
  if (httpCode !== 200) {
    throw new Error(`Yahoo HTTP ${httpCode} for ${symbol}`);
  }

  const json = JSON.parse(response.getContentText());
  const result = json?.chart?.result?.[0];

  if (!result) {
    throw new Error(`No chart result in Yahoo response for ${symbol}`);
  }

  // Extract dividend events map
  const divEvents = result?.events?.dividends;
  if (!divEvents || Object.keys(divEvents).length === 0) {
    return []; // Stock doesn't pay dividends — valid result
  }

  // Yahoo Finance does NOT provide franking data. 
  // We set this to null (Unknown) so the UI can display it as such.
  const defaultFranking = null; 

  // Transform V8 timestamp map → sorted array (Descending by date)
  return Object.keys(divEvents)
    .sort((a, b) => parseInt(b) - parseInt(a)) // Descending
    .map(ts => {
      const entry = divEvents[ts];
      const date = new Date(parseInt(ts) * 1000);
      return {
        exDate: Utilities.formatDate(date, 'Australia/Sydney', 'yyyy-MM-dd'),
        amount: parseFloat(entry.amount.toFixed(4)),
        franking: defaultFranking
      };
    });
}

// ============================================================================
// 3. FIRESTORE CONNECTORS
// ============================================================================

/**
 * Reads all unique ticker codes from the user's shares collection.
 * Scans both 'code' and 'shareName' fields for robustness.
 * 
 * @returns {string[]} Array of unique uppercase ticker codes
 */
function getPortfolioTickers_() {
  const cfg = DIV_CONFIG.FIREBASE;
  const url = `${cfg.BASE_URL}/projects/${cfg.PROJECT_ID}/databases/(default)/documents/artifacts/${cfg.PROJECT_ID}/users/${cfg.USER_ID}/shares?pageSize=200`;
  const token = ScriptApp.getOAuthToken();

  try {
    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      console.error(`[DivSync] Failed to read portfolio: HTTP ${resp.getResponseCode()}`);
      return [];
    }

    const data = JSON.parse(resp.getContentText());
    const docs = data.documents || [];

    // Deduplicate: a ticker may appear in multiple watchlists
    const tickers = new Set();
    docs.forEach(d => {
      const fields = d.fields || {};
      const code = (fields.code?.stringValue || fields.shareName?.stringValue || '').trim().toUpperCase();
      if (code && code.length >= 2 && code.length <= 5) {
        tickers.add(code);
      }
    });

    return [...tickers].sort(); // Alphabetical for predictable logging
  } catch (e) {
    console.error('[DivSync] Exception reading portfolio:', e);
    return [];
  }
}

/**
 * Filters tickers that need a dividend sync.
 * A ticker needs sync if:
 *   - Its metadata_dividends document doesn't exist (HTTP 404)
 *   - Its lastSync timestamp is older than SYNC_INTERVAL_DAYS
 * 
 * @param {string[]} tickers - All portfolio tickers
 * @returns {string[]} Tickers needing sync
 */
function filterTickersNeedingSync_(tickers) {
  const cfg = DIV_CONFIG.FIREBASE;
  const token = ScriptApp.getOAuthToken();
  const cutoffMs = Date.now() - (DIV_CONFIG.SYNC_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const needsSync = [];

  if (!tickers || tickers.length === 0) return needsSync;

  const url = `${cfg.BASE_URL}/projects/${cfg.PROJECT_ID}/databases/(default)/documents:batchGet`;
  
  // Format document paths for the batchGet request
  const documents = tickers.map(ticker => 
    `projects/${cfg.PROJECT_ID}/databases/(default)/documents/artifacts/${cfg.PROJECT_ID}/metadata_dividends/${ticker}`
  );

  const payload = {
    documents: documents
  };

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      console.error('[DivSync] BatchGet failed HTTP', resp.getResponseCode());
      return tickers; // Fallback: Assume all need sync on API failure
    }

    const results = JSON.parse(resp.getContentText());
    
    results.forEach(result => {
      let docName = '';
      if (result.found) docName = result.found.name;
      else if (result.missing) docName = result.missing;
      
      if (!docName) return; // Skip readTime-only response objects
      
      const ticker = docName.split('/').pop();
      
      if (result.missing) {
        needsSync.push(ticker);
      } else if (result.found) {
        const lastSync = result.found.fields?.lastSync?.stringValue;
        if (!lastSync || new Date(lastSync).getTime() < cutoffMs) {
          needsSync.push(ticker);
        }
      }
    });
    
  } catch (e) {
     console.error('[DivSync] BatchGet exception:', e);
     return tickers; // Fallback
  }

  // Preserve original sorting format
  return tickers.filter(t => needsSync.includes(t));
}

/**
 * Writes dividend history for a ticker to Firestore.
 * Uses PATCH (upsert) — creates the document if missing, overwrites if exists.
 * 
 * Document path: artifacts/asx-watchlist-app/metadata_dividends/{TICKER}
 * 
 * @param {string} ticker - ASX code (e.g. "BHP")
 * @param {Array<{exDate: string, amount: number, franking: number}>} history
 */
function writeDividendsToFirestore_(ticker, history) {
  const cfg = DIV_CONFIG.FIREBASE;
  const docPath = `artifacts/${cfg.PROJECT_ID}/metadata_dividends/${ticker}`;
  const url = `${cfg.BASE_URL}/projects/${cfg.PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const token = ScriptApp.getOAuthToken();

  // Build Firestore REST payload
  const payload = {
    fields: {
      ticker: { stringValue: ticker },
      lastSync: { stringValue: new Date().toISOString() },
      recordCount: { integerValue: history.length.toString() },
      history: {
        arrayValue: {
          values: history.map(entry => ({
            mapValue: {
              fields: {
                exDate: { stringValue: entry.exDate },
                amount: { doubleValue: entry.amount },
                franking: { doubleValue: entry.franking }
              }
            }
          }))
        }
      }
    }
  };

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      throw new Error(`Firestore write HTTP ${resp.getResponseCode()}: ${resp.getContentText().substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`[DivSync] Firestore write failed for ${ticker}:`, e);
    throw e; // Re-throw so the caller logs it as a failure
  }
}

// ============================================================================
// 4. SETUP & TESTING
// ============================================================================

/**
 * 🛠️ SETUP: Run this function ONCE to create the 30-minute Time-Driven Trigger.
 * 
 * Steps:
 *   1. Open this file in the Apps Script editor
 *   2. Select "setupDividendSyncTrigger" from the function dropdown
 *   3. Click ▶ Run
 *   4. Authorize any permission prompts
 *   5. Verify: Triggers panel (clock icon) → "processDividendQueue" every 30 mins
 */
function setupDividendSyncTrigger() {
  // 1. Clean existing triggers for this function (prevents duplicates)
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;

  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'processDividendQueue') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  if (removed > 0) {
    console.log(`[DivSync Setup] Removed ${removed} existing trigger(s).`);
  }

  // 2. Create new trigger
  ScriptApp.newTrigger('processDividendQueue')
    .timeBased()
    .everyMinutes(30)
    .create();

  console.log('[DivSync Setup] ✅ Trigger created successfully.');
  console.log('[DivSync Setup] processDividendQueue will run every 30 minutes.');
  console.log('[DivSync Setup] At 5 tickers per run, your entire portfolio will sync within hours.');
}

/**
 * 🧪 TESTING: Run this function manually to trigger one sync cycle immediately.
 * Check the Execution Log for output.
 * 
 * Expected output:
 *   [DivSync] Starting dividend sync batch...
 *   [DivSync] Portfolio contains 23 unique tickers.
 *   [DivSync] Processing 5 of 23 needing sync.
 *   [DivSync] (1/5) Fetching: BHP
 *   [DivSync] ✅ BHP: 47 dividend records written.
 *   ...
 */
function manualDividendSync() {
  console.log('[DivSync] === MANUAL SYNC TRIGGERED ===');
  processDividendQueue();
  console.log('[DivSync] === MANUAL SYNC COMPLETE ===');
}

/**
 * 🧹 CLEANUP: Run this to disable all dividend sync triggers.
 * Use this if you need to pause the sync temporarily.
 */
function removeDividendSyncTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processDividendQueue') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  console.log(`[DivSync Cleanup] Removed ${removed} trigger(s). Dividend sync is now PAUSED.`);
  console.log('[DivSync Cleanup] Run setupDividendSyncTrigger() to re-enable.');
}
