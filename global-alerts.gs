/**
 * Apps Script for automated alert processing and data management, and for serving data to a web app.
 * Version: 2.5.1 (Production Final Cleanup)
 *
 * Production Features:
 *  - Centralized 52-week high/low scan (global document)
 *  - Centralized global movers scan (directional % / $ change) with market hours guard
 *  - Generic Firestore commit helper (commitCentralDoc_)
 *  - Settings sheet readers & helpers + self-healing Firestore -> Sheet sync
 *  - Legacy per-user alert processing utilities (retained)
 *
 * Removed for production cleanliness:
 *  - All ad-hoc test harness & diagnostic functions
 *  - Admin Tools custom menu
 */

// ======================== CONFIGURATION ========================
const GAS_CONFIG = {
  VERSION: '2.5.2 (Constitutional Hardening)',
  TIME_ZONE: 'Australia/Sydney',
  FIREBASE: {
    PROJECT_ID: 'asx-watchlist-app',
    APP_ID: 'asx-watchlist-app',
    BASE_URL: 'https://firestore.googleapis.com/v1'
  },
  SHEETS: {
    PRICES: 'Prices',
    DASHBOARD: 'Dashboard',
    SUPPRESSION_LOG: 'Suppression Log'
  },
  HOLIDAYS: [
    '2025-01-01', '2025-01-27', '2025-04-18', '2025-04-21',
    '2025-04-25', '2025-06-09', '2025-12-25', '2025-12-26'
  ],
  EMAIL: {
    SUBJECT_PREFIX: 'ASX Daily Briefing',
    FOOTER_TEXT: 'This automated briefing is matched to your personal ASX Tracker thresholds. To change your notification settings, visit the app.'
  }
};

const PRICE_SHEET_NAME = GAS_CONFIG.SHEETS.PRICES;
const DASHBOARD_SHEET_NAME = GAS_CONFIG.SHEETS.DASHBOARD;
const SUPPRESSION_LOG_SHEET_NAME = GAS_CONFIG.SHEETS.SUPPRESSION_LOG;

const ASX_TIME_ZONE = GAS_CONFIG.TIME_ZONE;
const FIREBASE_PROJECT_ID = GAS_CONFIG.FIREBASE.PROJECT_ID;
const APP_ID = GAS_CONFIG.FIREBASE.APP_ID;
const FIRESTORE_BASE = GAS_CONFIG.FIREBASE.BASE_URL;

const GLOBAL_SETTINGS_DOC_SEGMENTS = ['artifacts', APP_ID, 'config', 'globalSettings'];
const DAILY_HILO_HITS_DOC_SEGMENTS = ['artifacts', APP_ID, 'alerts', 'DAILY_HILO_HITS'];
const DAILY_MOVERS_HITS_DOC_SEGMENTS = ['artifacts', APP_ID, 'alerts', 'DAILY_MOVERS_HITS'];
const DAILY_CUSTOM_HITS_DOC_SEGMENTS = ['artifacts', APP_ID, 'alerts', 'DAILY_CUSTOM_TRIGGER_HITS'];

const ASX_HOLIDAYS_2025 = new Set(GAS_CONFIG.HOLIDAYS);

/** Check if today (Sydney time) is a trading day (Mon-Fri, non-holiday). */
function isTradingDay_(dateObj) {
  const d = dateObj || new Date();
  const dayStr = Utilities.formatDate(d, ASX_TIME_ZONE, 'yyyy-MM-dd');
  const dayOfWeek = Utilities.formatDate(d, ASX_TIME_ZONE, 'u'); // 1=Mon, 7=Sun
  
  // 1. Weekend Check (6=Sat, 7=Sun)
  if (dayOfWeek === '6' || dayOfWeek === '7') {
    Logger.log('[isTradingDay] Skipping: Weekend (' + dayStr + ')');
    return false;
  }
  
  // 2. Holiday Check
  if (ASX_HOLIDAYS_2025.has(dayStr)) {
    Logger.log('[isTradingDay] Skipping: Public Holiday (' + dayStr + ')');
    return false;
  }
  
  return true;
}

// ===============================================================
// ============= GENERIC FIRESTORE COMMIT UTILITIES ==============
// ===============================================================

/** Convert a plain JS value into Firestore Value format. */
function _toFsValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(_toFsValue_) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  const t = typeof v;
  if (t === 'string') return { stringValue: v };
  if (t === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (t === 'boolean') return { booleanValue: v };
  // Allow pre-encoded Firestore value objects to pass through
  if (v && (v.stringValue || v.integerValue || v.doubleValue || v.booleanValue || v.arrayValue || v.mapValue || v.nullValue || v.timestampValue)) return v;
  // Object -> mapValue
  const fields = {};
  Object.keys(v).forEach(k => fields[k] = _toFsValue_(v[k]));
  return { mapValue: { fields } };
}

/** Recursively collect updateMask field paths from a plain object. */
function _collectFieldPaths_(prefix, obj, out) {
  Object.keys(obj).forEach(k => {
    const val = obj[k];
    const path = prefix ? (prefix + '.' + k) : k;
    const isPlainObj = val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date) &&
      !(val.stringValue || val.integerValue || val.doubleValue || val.booleanValue || val.arrayValue || val.mapValue || val.nullValue || val.timestampValue);
    if (isPlainObj) {
      _collectFieldPaths_(path, val, out);
    } else {
      out.push(path);
    }
  });
}

/**
 * Upserts a central Firestore document via REST using ScriptApp OAuth token.
 * @param {string[]} docPathSegments e.g. ['artifacts', APP_ID, 'alerts', 'HI_LO_52W']
 * @param {Object} plainData Plain object of fields (primitives, Date, arrays, nested objects)
 * @param {string[]=} explicitMask Optional explicit updateMask paths
 * @returns {{ok:boolean,status:number,body?:object,error?:string}}
 */
function commitCentralDoc_(docPathSegments, plainData, explicitMask) {
  try {
    const token = ScriptApp.getOAuthToken();
    const docPath = docPathSegments.map(encodeURIComponent).join('/');
    const docName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + docPath;
    // Build fields
    const fields = {};
    Object.keys(plainData || {}).forEach(k => fields[k] = _toFsValue_(plainData[k]));
    // Build update mask if not provided
    let fieldPaths = explicitMask && explicitMask.length ? explicitMask.slice() : [];
    if (!fieldPaths.length) _collectFieldPaths_('', plainData, fieldPaths);

    const body = {
      writes: [ {
        update: { name: docName, fields },
        updateMask: { fieldPaths }
      } ]
    };

    const resp = UrlFetchApp.fetch(FIRESTORE_BASE + '/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents:commit', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    const status = resp.getResponseCode();
    const text = resp.getContentText() || '';
    let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch(_){ }
    if (status >= 200 && status < 300) {
      Logger.log('[CentralCommit] OK %s doc=%s', status, docPath);
      return { ok: true, status, body: parsed };
    }
    Logger.log('[CentralCommit] ERROR %s doc=%s\n%s', status, docPath, text);
    return { ok: false, status, error: text, body: parsed };
  } catch (err) {
    Logger.log('[CentralCommit] EXCEPTION %s', err && err.stack || err);
    return { ok: false, status: 0, error: String(err) };
  }
}

// ===============================================================
// ================= 52-WEEK HIGH / LOW SCAN =====================
// ===============================================================

function runGlobal52WeekScan() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Guaranteed latest settings via multi-attempt loop
    const guaranteed = fetchGlobalSettingsGuaranteedLatest_(3, 200);
    if (!guaranteed.ok || !guaranteed.data) { console.log('[HiLo] FAILED settings fetch: ' + (guaranteed.error || 'unknown')); return; }
    const settings = guaranteed.data;

    
    // Auto-Repair: Ensure broken prices are fixed before scanning
    try {
      repairBrokenPrices();
    } catch(repairErr) {
      Logger.log('[HiLo] Auto-Repair warning: ' + repairErr);
    }
    
    const allAsxData = fetchAllAsxData_(ss);
    // Sanitize numeric filters (strip currency symbols, commas, trailing text like 'c', 'cents')
    function sanitizeNumber_(v) {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return isFinite(v) ? v : null;
      let s = String(v).trim();
      if (!s) return null;
      // Common user formats: '0.50', '$0.50', '0.50c', '50c', '0.50 cents'
      s = s.replace(/\$/g,'');
      // If value ends with 'c' and no dollar sign & no decimal, treat as cents
      const centsMatch = /^([0-9]+)c$/i.exec(s);
      if (centsMatch) {
        const centsVal = Number(centsMatch[1]);
        return isFinite(centsVal) ? (centsVal / 100) : null;
      }
      s = s.replace(/cents?/i,'');
      s = s.replace(/,/g,'');
      s = s.replace(/[^0-9.+-]/g,'');
      if (!s) return null;
      const n = Number(s);
      return isFinite(n) ? n : null;
    }

    // NOTE: In multi-user mode, the background scan must be broad enough 
    // to capture hits for EVERY user's potential threshold.
    // We will capture EVERYTHING and filter later during email generation.
    const appliedMinPrice = 0;
    const appliedMinMarketCap = 0;
    const emailEnabled = !!settings.emailAlertsEnabled;
    Logger.log('[HiLo] Scan - capturing all hits for multi-user support.');

    const highObjs = []; const lowObjs = [];
    let scanned = 0, afterFilter = 0;
    let skippedBelowPrice = 0, skippedBelowMcap = 0, skippedInvalid = 0;
    allAsxData.forEach(stock => {
      scanned++;
      // Normalize numeric fields from sheet parsing which can produce NaN/null
      const live = (stock.livePrice != null && !isNaN(stock.livePrice)) ? Number(stock.livePrice) : null;
      const mcap = (stock.marketCap != null && !isNaN(stock.marketCap)) ? Number(stock.marketCap) : null;
      if (!stock.code || live == null || live <= 0) { skippedInvalid++; return; }
      if (appliedMinPrice && live < appliedMinPrice) { skippedBelowPrice++; return; }
      if (appliedMinMarketCap && mcap != null && mcap < appliedMinMarketCap) { skippedBelowMcap++; return; }
      afterFilter++;
      const reachedLow = (!isNaN(stock.low52) && stock.low52 != null && stock.low52 > 0 && live <= stock.low52);
      const reachedHigh = (!isNaN(stock.high52) && stock.high52 != null && stock.high52 > 0 && live >= stock.high52);
      if (reachedLow || reachedHigh) {
        // Normalize object shape for frontend cards
        const o = {
          code: stock.code,
          name: stock.name || stock.companyName || null,
            live: live,
          high52: isNaN(stock.high52)? null : stock.high52,
          low52: isNaN(stock.low52)? null : stock.low52,
          marketCap: (stock.marketCap!=null && !isNaN(stock.marketCap)) ? stock.marketCap : null,
          prevClose: (stock.prevClose!=null && !isNaN(stock.prevClose)) ? stock.prevClose : null
        };
        if (reachedLow) lowObjs.push(o);
        if (reachedHigh) highObjs.push(o);
      }
    });
    Logger.log('[HiLo] Scan rows -> scanned=%s passedFilters=%s highs=%s lows=%s', scanned, afterFilter, highObjs.length, lowObjs.length);
    if (appliedMinPrice) {
      Logger.log('[HiLo] Skip reasons -> belowPrice=%s belowMcap=%s invalidRows=%s', skippedBelowPrice, skippedBelowMcap, skippedInvalid);
    }
    // Final defensive pass: remove any entries that somehow violate filters (belt & braces)
    function enforcePostFilters(arr) {
      return arr.filter(o => {
        if (!o) return false;
        if (appliedMinPrice && (o.live == null || o.live < appliedMinPrice)) return false;
        if (appliedMinMarketCap && o.marketCap != null && o.marketCap < appliedMinMarketCap) return false;
        if (o.live == null || o.live <= 0) return false;
        return true;
      });
    }
    const filteredHighs = enforcePostFilters(highObjs);
    const filteredLows  = enforcePostFilters(lowObjs);
    const removedHighs = highObjs.length - filteredHighs.length;
    const removedLows  = lowObjs.length - filteredLows.length;
    if (removedHighs || removedLows) {
      Logger.log('[HiLo][PostFilter] Removed highs=%s lows=%s due to late filter enforcement', removedHighs, removedLows);
    }
    // Persist filtered arrays only
    writeGlobalHiLoDoc_(filteredHighs, filteredLows, { minPrice: appliedMinPrice, minMarketCap: appliedMinMarketCap });

    // Append persistent daily hit history so intra-scan hits are not lost
    try {
      appendDailyHiLoHits_(filteredHighs, filteredLows);
    } catch (persistErr) {
      Logger.log('[HiLo][DailyHits] Persist error: %s', persistErr && persistErr.message || persistErr);
    }

    // [FIRESTORE READ OPTIMIZATION] 
    // The duplication logic below is extremely expensive (listing all user shares).
    // The frontend NotificationStore already handles this intersection client-side.
    try {
      duplicateHiLoHitsIntoCustom_(filteredHighs, filteredLows);
    } catch (dupErr) {
      Logger.log('[HiLo][Dup->Custom] Error: %s', dupErr && dupErr.message || dupErr);
    }

    // Backfill duplicates for users who added shares after earlier hits today (idempotent)
    /*
    try {
      reconcileCustomDuplicatesFromDailyHits_();
    } catch (reconErr) {
      Logger.log('[HiLo][Recon->Custom] Error: %s', reconErr && reconErr.message || reconErr);
    }
    */

    // Backward-compatible email path removed from frequent scan.
    // The scan now only updates Firestore documents and daily history.
    // Email summarization is consolidated into the daily digest only.
  } catch (e) {
    console.error('[HiLo] Scan error', e);
  }
}

/**
 * Handles the 'generateBriefing' action.
 * Generates a natural language daily briefing based on the user's portfolio context.
 */
/**
 * Handles the 'generateBriefing' action.
 * Generates a natural language daily briefing based on the user's portfolio context.
 */
function handleGenerateBriefing_(payload) {
  try {
    const context = payload.context;
    if (!context) return { ok: false, error: 'Missing context' };

    // 1. Construct Prompt
    const p = context.portfolio || {};
    // Ensure we don't send gigantic JSONs that might confuse the model or hit limits (though 1.5 Flash has huge context)
    const prompt = `
You are a witty, professional financial analyst for the "ASX Tracker" app. 
Write a ONE-paragraph (max 3 sentences) daily briefing for the user based on their portfolio performance today.

Portfolio Stats:
- Day Change: ${p.dayChangePercent}% (${p.dayChangeValue})
- Total Value: ${p.totalValue}
- Key Winners: ${JSON.stringify(p.winners || [])}
- Key Losers: ${JSON.stringify(p.losers || [])}
- Market Sentiment: ${context.sentiment}

Tone:
- If up > 1%: Enthusiastic, congratulatory.
- If down > 1%: Empathetic, "hang in there".
- If flat: Calm, "steady as she goes".
- Use emojis sparingly.
- Focus on the "Why" if possible (e.g. "BHP dragged you down" or "Tech sector rally helped").
- Do NOT output markdown or bold text, just plain text.
    `;

    // 2. Call Gemini
    const result = callGeminiAPI_(prompt);
    
    if (result.success) {
      return { ok: true, text: result.data };
    } else {
      return { ok: false, error: result.reason }; 
    }

  } catch (e) {
    Logger.log('[Gemini] Error: ' + e);
    return { ok: false, error: String(e) };
  }
}

function callGeminiAPI_(promptText) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set');

  // STEP 1: Dynamically find a working model (Self-Healing)
  const modelResult = discoverBestModel_(key);
  if (!modelResult.success) {
    return { success: false, reason: modelResult.error };
  }
  
  const modelName = modelResult.name; // e.g. "models/gemini-1.5-flash"
  // API URL construction: modelName already includes "models/" prefix from the List API
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${key}`;

  const requestBody = {
    contents: [{
      parts: [{ text: promptText }]
    }],
    generationConfig: {
      maxOutputTokens: 2048, // Increased significantly to avoid early cutoffs
      temperature: 0.9 // Increased for more creative/roasty output
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(API_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      
      const candidates = json.candidates;
      // Robust Extraction: Even if MAX_TOKENS, take what we have
      if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts && candidates[0].content.parts.length > 0) {
         const part = candidates[0].content.parts[0];
         if (part.text) {
           return { success: true, data: part.text };
         }
      }
      
      // FAILURE: Analyze why
      let reason = 'AI returned no text.';
      
      // 1. Check Prompt Feedback (Global Block)
      if (json.promptFeedback) {
           reason += ` [PromptFeedback: ${JSON.stringify(json.promptFeedback)}]`;
      }
      
      // 2. Check Candidate Details (Finish Reason)
      if (candidates && candidates.length > 0) {
          // Log the raw candidate structure to debug missing 'parts'
          reason += ` [Candidate 0 Raw: ${JSON.stringify(candidates[0])}]`;
      } else {
          reason += ' [No Candidates returned]';
      }
      
      return { success: false, reason: reason };
      
    } else {
      if (responseCode === 404) {
         Logger.log(`[Gemini] 404 on confirmed model ${modelName}. API Endpoint might be wrong.`);
         return { success: false, reason: `Endpoint 404 for ${modelName}` };
      }
      return { success: false, reason: `API Error ${responseCode}: ${responseText}` };
    }
  } catch (e) {
    return { success: false, reason: 'Exception: ' + e.toString() };
  }
}

/**
 * Queries the API to ask "What models are actually available to this Key?"
 * Prevents 404s by using only valid, listed models.
 */
function discoverBestModel_(key) {
  // Cache the discovery to avoid 2 calls every time (Script Properties cache)
  const CACHE_KEY = 'GEMINI_WORKING_MODEL_NAME';
  const cached = PropertiesService.getScriptProperties().getProperty(CACHE_KEY);
  if (cached) return { success: true, name: cached };

  const LIST_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  
  try {
    const response = UrlFetchApp.fetch(LIST_URL, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      return { success: false, error: `Model Discovery Failed (${response.getResponseCode()}): ${response.getContentText()}` };
    }
    
    const json = JSON.parse(response.getContentText());
    if (!json.models) return { success: false, error: 'No models returned by API' };

    // Filter for models that can generate content
    const viable = json.models.filter(m => 
      m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
    );
    
    if (viable.length === 0) return { success: false, error: 'No generateContent models available' };

    // Priority Sort: Flash 1.5 > Pro 1.5 > Flash 1.0 > Pro 1.0
    // The 'name' field comes like "models/gemini-pro"
    viable.sort((a, b) => {
      const score = (m) => {
        let s = 0;
        if (m.name.includes('1.5')) s += 10;
        if (m.name.includes('flash')) s += 5;
        if (m.name.includes('pro')) s += 2;
        return s;
      };
      return score(b) - score(a);
    });

    const best = viable[0].name; // e.g. "models/gemini-1.5-flash"
    Logger.log(`[Gemini] Discovered best model: ${best}`);
    
    // Cache it
    PropertiesService.getScriptProperties().setProperty(CACHE_KEY, best);
    
    return { success: true, name: best };

  } catch (e) {
    return { success: false, error: 'Discovery Exception: ' + e.toString() };
  }
}

function fetchAllAsxData_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(PRICE_SHEET_NAME);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values.shift();
  const map = headers.reduce((acc,h,i)=>{
    const key = String(h).trim();
    acc[key]=i;
    return acc;
  },{});
  const nameKey = ['Company Name','CompanyName','Name'].find(k=> map[k]!=null);
  const prevKey = map['PrevDayClose']!=null ? 'PrevDayClose' : (map['PrevClose']!=null ? 'PrevClose' : null);
  // LOGIC HARDENING: Fuzzy match helper
  const findKey = (pattern) => Object.keys(map).find(k => pattern.test(String(k)));
  const findIdx = (pattern) => headers.findIndex(h => pattern.test(String(h)));

  const apiPrevKey = findKey(/api.*prev/i) || findKey(/prev.*api/i) || findKey(/pi.*prev/i) || ['API_PrevClose','APIPrevClose','ApiPrevClose','APIPREVCLOSE','PIPREVCLOSE'].find(k=> map[k]!=null);
  
  // Robust search for API_Price (Fuzzy regex: handles "API Price", "API_Price", "Price (API)", etc.)
  const apiPriceIdx = findIdx(/api.*price/i) || findIdx(/price.*api/i) || findIdx(/pi.*price/i);

  // Expand live price detection to handle alternative column headers used in some sheets
  const liveKey = (function(){
    const candidates = ['LivePrice','Last','LastPrice','Last Trade','LastTrade','Last trade'];
    for (let k of candidates) { if (map[k] != null) return k; }
    return 'LivePrice';
  })();

  // Helper to parse currency strings (e.g. "$54.10", "1,200.50")
  const cleanFloat = (v) => {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[$,]/g, '').trim();
    return parseFloat(s);
  };

  return values.map(r => {
    let live = (map[liveKey] != null) ? cleanFloat(r[map[liveKey]]) : cleanFloat(r[map['LivePrice']]);
    
    // Recovery Logic: If Google returns 0 or #N/A, check the API_Price column
    if ((live == null || isNaN(live) || live === 0) && apiPriceIdx != null) {
      const fallback = cleanFloat(r[apiPriceIdx]);
      if (fallback != null && !isNaN(fallback) && fallback > 0) {
        live = fallback;
      }
    }

    // PrevClose Recovery
    let prev = prevKey ? cleanFloat(r[map[prevKey]]) : null;
    const apiPrevIdx = apiPrevKey ? map[apiPrevKey] : -1;
    if ((prev == null || isNaN(prev) || prev === 0) && apiPrevIdx != -1) {
        const val = cleanFloat(r[apiPrevIdx]);
        if (val > 0) prev = val;
    }

    // Primary Column Robustness (Fuzzy regex)
    const highIdx = findIdx(/high.*52|52.*high/i);
    const lowIdx = findIdx(/low.*52|52.*low/i);
    const mcapIdx = findIdx(/market.*cap|mcap/i);

    let high52 = highIdx !== -1 ? cleanFloat(r[highIdx]) : cleanFloat(r[map['High52']]);
    let low52 = lowIdx !== -1 ? cleanFloat(r[lowIdx]) : cleanFloat(r[map['Low52']]);

    // API Recovery for High/Low
    // LOGIC HARDENING: Reuse fuzzy findKey from above
    // Look for "API" and "High" (e.g. "API_High52", "API High", "APIHigh")
    const apiHighKey = findKey(/api.*high/i) || findKey(/high.*api/i) || findKey(/api.*hi/i);
    
    // Look for "API" and "Low" (e.g. "API_Low52", "API Low", "APILow")
    const apiLowKey = findKey(/api.*low/i) || findKey(/low.*api/i) || findKey(/api.*lo/i);

    if ((isNaN(high52) || high52 === 0) && apiHighKey) {
      const v = cleanFloat(r[map[apiHighKey]]);
      if (v > 0) high52 = v;
    }

    if ((isNaN(low52) || low52 === 0) && apiLowKey) {
      const v = cleanFloat(r[map[apiLowKey]]);
      if (v > 0) low52 = v;
    }


    return {
      code: r[map['ASX Code']],
      name: nameKey ? r[map[nameKey]] : null,
      livePrice: live,
      high52: high52,
      low52: low52,
      marketCap: mcapIdx !== -1 ? cleanFloat(r[mcapIdx]) : cleanFloat(r[map['MarketCap']]),
      prevClose: prev
    };
  });
}

function writeGlobalHiLoDoc_(highsArr, lowsArr, filtersMeta) {
  // Accept either arrays of codes (string) or rich objects
  function normalizeEntry(e) {
    if (e == null) return null;
    if (typeof e === 'string') return { code: e.trim().toUpperCase() };
    const code = (e.code || e.shareCode || '').toString().trim().toUpperCase();
    if (!code) return null;
    return {
      code,
      name: e.name || e.companyName || null,
      live: (e.live!=null && !isNaN(e.live)) ? Number(e.live) : (e.livePrice!=null && !isNaN(e.livePrice)? Number(e.livePrice): null),
      high52: (e.high52!=null && !isNaN(e.high52)) ? Number(e.high52) : (e.High52!=null && !isNaN(e.High52)? Number(e.High52): null),
      low52: (e.low52!=null && !isNaN(e.low52)) ? Number(e.low52) : (e.Low52!=null && !isNaN(e.Low52)? Number(e.Low52): null),
      marketCap: (e.marketCap!=null && !isNaN(e.marketCap)) ? Number(e.marketCap) : null,
      prevClose: (e.prevClose!=null && !isNaN(e.prevClose)) ? Number(e.prevClose) : null
    };
  }
  const highsObjs = (Array.isArray(highsArr)? highsArr : []).map(normalizeEntry).filter(Boolean);
  const lowsObjs  = (Array.isArray(lowsArr)? lowsArr : []).map(normalizeEntry).filter(Boolean);
  const data = {
    updatedAt: new Date(),
    highs: highsObjs,
    lows: lowsObjs,
    highCodes: highsObjs.map(o=>o.code), // backward-compatible simple arrays
    lowCodes: lowsObjs.map(o=>o.code),
    filters: filtersMeta ? { minPrice: filtersMeta.minPrice ?? null, minMarketCap: filtersMeta.minMarketCap ?? null } : null
  };
  // Provide explicit mask so we don't accumulate stale fields
  const mask = ['updatedAt','highs','lows','highCodes','lowCodes','filters.minPrice','filters.minMarketCap'];
  return commitCentralDoc_(['artifacts', APP_ID, 'alerts', 'HI_LO_52W'], data, mask);
}

// ================== DAILY 52W HITS PERSISTENCE ==================
/** Format a YYYY-MM-DD key in ASX timezone for daily partitioning. */
function getSydneyDayKey_(dateOpt) {
  const d = dateOpt || new Date();
  return Utilities.formatDate(d, ASX_TIME_ZONE, 'yyyy-MM-dd');
}

/** Fetch current daily 52-week hit history document from Firestore. */
function fetchDailyHiLoHits_() {
  const res = _fetchFirestoreDocument_(DAILY_HILO_HITS_DOC_SEGMENTS);
  if (!res.ok) {
    if (res.notFound) return { ok: true, data: { dayKey: getSydneyDayKey_(), highHits: [], lowHits: [] }, updateTime: null };
    return { ok: false, error: res.error || ('status=' + res.status) };
  }
  const data = res.data || {};
  return { ok: true, data: { dayKey: data.dayKey || getSydneyDayKey_(), highHits: data.highHits || [], lowHits: data.lowHits || [] }, updateTime: res.updateTime || null };
}

/** Commit full daily hits payload (overwrites arrays intentionally). */
function writeDailyHiLoHits_(payload) {
  const now = new Date();
  const body = {
    dayKey: payload.dayKey || getSydneyDayKey_(),
    highHits: Array.isArray(payload.highHits) ? payload.highHits : [],
    lowHits: Array.isArray(payload.lowHits) ? payload.lowHits : [],
    updatedAt: now
  };
  const mask = ['dayKey','highHits','lowHits','updatedAt'];
  return commitCentralDoc_(DAILY_HILO_HITS_DOC_SEGMENTS, body, mask);
}

/** Append today's 52W High/Low hits to the daily history document with de-duplication. */
function appendDailyHiLoHits_(highsArr, lowsArr) {
  const todayKey = getSydneyDayKey_();
  const current = fetchDailyHiLoHits_();
  if (!current.ok) { Logger.log('[HiLo][DailyHits] fetch failed: %s', current.error); return; }
  let highHits = current.data.highHits || [];
  let lowHits = current.data.lowHits || [];
  let dayKey = current.data.dayKey || todayKey;
  if (dayKey !== todayKey) {
    // New day: reset lists for clean slate
    highHits = [];
    lowHits = [];
    dayKey = todayKey;
  }
  const nowIso = new Date().toISOString();
  const seenHigh = new Set(highHits.map(h => h && h.code));
  const seenLow = new Set(lowHits.map(h => h && h.code));
  // Normalize existing seen sets to canonical uppercase codes (defensive)
  const _normCode = (c) => (c || '').toString().trim().toUpperCase();
  const seenHighNorm = new Set(Array.from(seenHigh).map(_normCode));
  const seenLowNorm = new Set(Array.from(seenLow).map(_normCode));

  function normHiLoItem(e) {
    if (!e) return null;
    const code = (e.code || e.shareCode || '').toString().trim().toUpperCase();
    if (!code) return null;
    return {
      code,
      name: e.name || e.companyName || null,
      live: (e.live!=null && !isNaN(e.live)) ? Number(e.live) : (e.livePrice!=null && !isNaN(e.livePrice)? Number(e.livePrice): null),
      high52: (e.high52!=null && !isNaN(e.high52)) ? Number(e.high52) : (e.High52!=null && !isNaN(e.High52)? Number(e.High52): null),
      low52: (e.low52!=null && !isNaN(e.low52)) ? Number(e.low52) : (e.Low52!=null && !isNaN(e.Low52)? Number(e.Low52): null),
      t: nowIso
    };
  }

  (Array.isArray(highsArr) ? highsArr : []).forEach(e => {
    const item = normHiLoItem(e);
  if (!item) return;
  const c = _normCode(item.code);
  item.code = c;
  if (!seenHighNorm.has(c)) { highHits.push(item); seenHighNorm.add(c); }
  });
  (Array.isArray(lowsArr) ? lowsArr : []).forEach(e => {
    const item = normHiLoItem(e);
  if (!item) return;
  const c = _normCode(item.code);
  item.code = c;
  if (!seenLowNorm.has(c)) { lowHits.push(item); seenLowNorm.add(c); }
  });

  writeDailyHiLoHits_({ dayKey, highHits, lowHits });
}

// (Test harness removed for production)

function sendHiLoEmailIfAny_(results, settings) {
  // Disabled: email sending for hi/lo from frequent scan moved to daily digest only.
  // Keep a lightweight log for diagnostics.
  try {
    const highsCount = (results && Array.isArray(results.highs)) ? results.highs.length : 0;
    const lowsCount = (results && Array.isArray(results.lows)) ? results.lows.length : 0;
    if (!highsCount && !lowsCount) return;
    console.log('[sendHiLoEmailIfAny_] Disabled email send – hi/lo results:', { highs: highsCount, lows: lowsCount });
  } catch (e) { console.log('[sendHiLoEmailIfAny_] Disabled function error:', e); }
}

function sendMoversEmailIfAny_(results, settings) {
  // Disabled: email sending for movers from frequent scan moved to daily digest only.
  // Keep a lightweight log for diagnostics.
  try {
    const upCount = (results && Array.isArray(results.up)) ? results.up.length : 0;
    const downCount = (results && Array.isArray(results.down)) ? results.down.length : 0;
    if (!upCount && !downCount) return;
    console.log('[sendMoversEmailIfAny_] Disabled email send – movers results:', { up: upCount, down: downCount });
  } catch (e) { console.log('[sendMoversEmailIfAny_] Disabled function error:', e); }
}

// ===============================================================
// ================== GLOBAL MOVERS (CENTRAL) ====================
// ===============================================================

function runGlobalMoversScan() {
  try {
    const now = new Date();
    const hourSydney = Number(Utilities.formatDate(now, ASX_TIME_ZONE, 'HH'));
    const inHours = (hourSydney >= 10 && hourSydney < 17);
    if (!inHours) console.log('[MoversScan] Outside market hours (' + hourSydney + 'h) – still executing for freshness.');

    const guaranteed = fetchGlobalSettingsGuaranteedLatest_(3, 200);
    if (!guaranteed.ok || !guaranteed.data) { console.log('[MoversScan] FAILED settings fetch: ' + (guaranteed.error || 'unknown')); return; }
    const settings = guaranteed.data;
    
    // For Multi-User support, we use a "Wide Net" threshold for the background scan.
    // This records any move over 0.1% or $0.01 regardless of global settings.
    const scanThresholds = {
      upPercent: 0.1,
      upDollar: 0.01,
      downPercent: 0.1,
      downDollar: 0.01,
      minimumPrice: 0,
      anyActive: true
    };
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    const priceRows = fetchPriceRowsForMovers_(spreadsheet);
    if (!priceRows.length) { console.log('[MoversScan] No price data rows; aborting.'); return; }

    const { upMovers, downMovers } = evaluateMovers_(priceRows, scanThresholds);
    console.log('[MoversScan] Evaluation complete', { up: upMovers.length, down: downMovers.length, total: upMovers.length + downMovers.length, scanThresholds, inHours });

    writeGlobalMoversDoc_(upMovers, downMovers, scanThresholds, { 
      source: 'scan', 
      inHours, 
      settingsSnapshot: settings,
      settingsUpdateTime: guaranteed.updateTime || null,
      settingsFetchAttempts: guaranteed.attempts,
      fetchStrategy: 'guaranteed-loop' + (guaranteed.fallback ? '+fallback' : '')
    });

    // Append persistent daily movers hits so intra-scan events are retained per day
    try {
      appendDailyMoversHits_(upMovers, downMovers);
    } catch (persistErr) {
      Logger.log('[Movers][DailyHits] Persist error: %s', persistErr && persistErr.message || persistErr);
    }

    // NEW: duplicate portfolio-relevant movers into CUSTOM_TRIGGER_HITS
    try {
      duplicateMoversIntoCustom_(upMovers, downMovers);
    } catch (dupErr) {
      Logger.log('[Movers][Dup->Custom] Error: %s', dupErr && dupErr.message || dupErr);
    }

    // Backfill duplicates for users who added shares after earlier hits today (idempotent)
    /*
    try {
      reconcileCustomDuplicatesFromDailyHits_();
    } catch (reconErr) {
      Logger.log('[Movers][Recon->Custom] Error: %s', reconErr && reconErr.message || reconErr);
    }
    */

    // Email sending removed from frequent movers scan.
    // Frequent runs should only persist the movers to Firestore.
  } catch (err) {
    console.error('[MoversScan] ERROR:', err && err.stack || err);
  }
}

function normalizeDirectionalThresholds_(settings) {
  function numOrNull(v) { if (v === '' || v == null) return null; const n = Number(v); return (!isFinite(n) || n <= 0) ? null : n; }
  const upPercent = numOrNull(settings.globalPercentIncrease);
  const upDollar = numOrNull(settings.globalDollarIncrease);
  const downPercent = numOrNull(settings.globalPercentDecrease);
  const downDollar = numOrNull(settings.globalDollarDecrease);
  const minimumPrice = numOrNull(settings.globalMinimumPrice);
  const anyActive = !!(upPercent || upDollar || downPercent || downDollar);
  return { upPercent, upDollar, downPercent, downDollar, minimumPrice, anyActive };
}

function fetchPriceRowsForMovers_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(PRICE_SHEET_NAME);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();
  const map = {}; headers.forEach((h,i)=> map[h]=i);
  // Resolve code column (tolerate slight header variants)
  const codeIdx = (function(){
    const candidates = ['ASX Code','ASXCode','Code'];
    for (let k of candidates) { if (map[k] != null) return map[k]; }
    return map['ASX Code'];
  })();
  // Resolve live price column (support alternative headings)
  const liveIdx = (function(){
    const candidates = ['LivePrice','Last','LastPrice','Last Trade','LastTrade','Last trade','Price','Current'];
    for (let k of candidates) { if (map[k] != null) return map[k]; }
    return map['LivePrice'];
  })();
  // Resolve previous close column (support multiple spellings)
  const prevIdx = (function(){
    const candidates = ['PrevDayClose','PrevClose','Previous Close','PreviousClose','Prev'];
    for (let k of candidates) { if (map[k] != null) return map[k]; }
    return map['PrevDayClose'] != null ? map['PrevDayClose'] : map['PrevClose'];
  })();
  const nameIdx = (map['Company Name']!=null) ? map['Company Name'] : (map['CompanyName']!=null ? map['CompanyName'] : (map['Name']!=null ? map['Name'] : null));
  if (codeIdx == null || liveIdx == null || prevIdx == null) return [];
  const rows = [];
  values.forEach(r => {
    const codeRaw = r[codeIdx]; if (!codeRaw) return;
    const live = r[liveIdx]; const prev = r[prevIdx];
    if (live == null || prev == null || live === '' || prev === '' || prev === 0) return;
    const liveNum = Number(live); const prevNum = Number(prev);
    if (!isFinite(liveNum) || !isFinite(prevNum) || prevNum === 0) return;
    rows.push({ code: String(codeRaw).trim().toUpperCase(), live: liveNum, prev: prevNum, name: (nameIdx!=null? r[nameIdx] : null) });
  });
  return rows;
}

function evaluateMovers_(rows, thresholds) {
  const upObjs = []; const downObjs = [];
  const seenUp = new Set(); const seenDown = new Set();
  rows.forEach(row => {
    const { code, live, prev } = row;
    if (!code) return;
    if (thresholds.minimumPrice && live < thresholds.minimumPrice) return;
    const change = live - prev; if (change === 0) return;
    const pct = (change / prev) * 100; const absChange = Math.abs(change);
    const directionUp = change > 0;
    const qualifiesUp = directionUp && ((thresholds.upPercent && pct >= thresholds.upPercent) || (thresholds.upDollar && absChange >= thresholds.upDollar));
    const qualifiesDown = !directionUp && ((thresholds.downPercent && Math.abs(pct) >= thresholds.downPercent) || (thresholds.downDollar && absChange >= thresholds.downDollar));
    if (qualifiesUp || qualifiesDown) {
      const obj = {
        code,
        name: row.name || null,
        live,
        prevClose: prev,
        change,
        pct,
        absChange: absChange,
        direction: directionUp ? 'up' : 'down'
      };
      if (qualifiesUp && !seenUp.has(code)) { upObjs.push(obj); seenUp.add(code); }
      if (qualifiesDown && !seenDown.has(code)) { downObjs.push(obj); seenDown.add(code); }
    }
  });
  // Sort each by percent magnitude descending
  upObjs.sort((a,b)=> b.pct - a.pct);
  downObjs.sort((a,b)=> Math.abs(b.pct) - Math.abs(a.pct));
  return { upMovers: upObjs, downMovers: downObjs };
}

function writeGlobalMoversDoc_(upMovers, downMovers, thresholds, meta) {
  // upMovers / downMovers expected as arrays of rich objects from evaluateMovers_
  function norm(o){
    if (!o) return null;
    if (typeof o === 'string') return { code: o.toUpperCase() };
    const code = (o.code||'').toString().trim().toUpperCase(); if (!code) return null;
    return {
      code,
      name: o.name || null,
      live: (o.live!=null && !isNaN(o.live)) ? Number(o.live) : null,
      prevClose: (o.prevClose!=null && !isNaN(o.prevClose)) ? Number(o.prevClose) : (o.prev!=null && !isNaN(o.prev)? Number(o.prev): null),
      change: (o.change!=null && !isNaN(o.change)) ? Number(o.change) : (o.live!=null && o.prevClose!=null ? Number(o.live - o.prevClose) : null),
      pct: (o.pct!=null && !isNaN(o.pct)) ? Number(o.pct) : (o.change!=null && o.prevClose ? (o.change / o.prevClose)*100 : null),
      absChange: (o.absChange!=null && !isNaN(o.absChange)) ? Number(o.absChange) : (o.change!=null ? Math.abs(o.change) : null),
      direction: o.direction || ( (o.change!=null && o.change>0) ? 'up':'down')
    };
  }
  const upObjs = (Array.isArray(upMovers)? upMovers: []).map(norm).filter(Boolean);
  const downObjs = (Array.isArray(downMovers)? downMovers: []).map(norm).filter(Boolean);
  const upCodes = upObjs.map(o=>o.code);
  const downCodes = downObjs.map(o=>o.code);
  const data = {
    updatedAt: new Date(),
    upCount: upCodes.length,
    downCount: downCodes.length,
    totalCount: upCodes.length + downCodes.length,
    up: upObjs,
    down: downObjs,
    upCodes: upCodes, // backward compatible arrays of codes
    downCodes: downCodes,
    upSample: upCodes.slice(0,50),
    downSample: downCodes.slice(0,50),
    thresholds: {
      upPercent: thresholds.upPercent ?? null,
      upDollar: thresholds.upDollar ?? null,
      downPercent: thresholds.downPercent ?? null,
      downDollar: thresholds.downDollar ?? null,
      minimumPrice: thresholds.minimumPrice ?? null
    },
    appliedMeta: meta ? {
      source: meta.source || 'scan',
      inHours: meta.inHours === true,
      settingsSnapshot: meta.settingsSnapshot ? sanitizeSettingsSnapshotForMeta_(meta.settingsSnapshot) : null,
      settingsUpdateTime: meta.settingsUpdateTime || null,
      settingsFetchAttempts: meta.settingsFetchAttempts != null ? meta.settingsFetchAttempts : null,
      fetchStrategy: meta.fetchStrategy || null
    } : null
  };
  const mask = [ 'updatedAt','upCount','downCount','totalCount','up','down','upCodes','downCodes','upSample','downSample',
    'thresholds.upPercent','thresholds.upDollar','thresholds.downPercent','thresholds.downDollar','thresholds.minimumPrice',
    'appliedMeta.source','appliedMeta.inHours','appliedMeta.settingsSnapshot.globalPercentIncrease','appliedMeta.settingsSnapshot.globalDollarIncrease','appliedMeta.settingsSnapshot.globalPercentDecrease','appliedMeta.settingsSnapshot.globalDollarDecrease','appliedMeta.settingsSnapshot.globalMinimumPrice','appliedMeta.settingsUpdateTime','appliedMeta.settingsFetchAttempts','appliedMeta.fetchStrategy' ];
  return commitCentralDoc_(['artifacts', APP_ID, 'alerts', 'GLOBAL_MOVERS'], data, mask);
}

// Strip volatile or large fields from settings snapshot to keep doc lean
function sanitizeSettingsSnapshotForMeta_(s){
  if (!s) return null;
  return {
    globalPercentIncrease: s.globalPercentIncrease != null ? Number(s.globalPercentIncrease) : null,
    globalDollarIncrease: s.globalDollarIncrease != null ? Number(s.globalDollarIncrease) : null,
    globalPercentDecrease: s.globalPercentDecrease != null ? Number(s.globalPercentDecrease) : null,
    globalDollarDecrease: s.globalDollarDecrease != null ? Number(s.globalDollarDecrease) : null,
    globalMinimumPrice: s.globalMinimumPrice != null ? Number(s.globalMinimumPrice) : null
  };
}

// (Test harness removed for production)

// ================== DAILY MOVERS HITS PERSISTENCE ==================
/** Fetch current day's GLOBAL_MOVERS hits document from Firestore. */
function fetchDailyMoversHits_() {
  const res = _fetchFirestoreDocument_(DAILY_MOVERS_HITS_DOC_SEGMENTS);
  if (!res.ok) {
    if (res.notFound) return { ok: true, data: { dayKey: getSydneyDayKey_(), upHits: [], downHits: [] }, updateTime: null };
    return { ok: false, error: res.error || ('status=' + res.status) };
  }
  const data = res.data || {};
  return { ok: true, data: { dayKey: data.dayKey || getSydneyDayKey_(), upHits: data.upHits || [], downHits: data.downHits || [] }, updateTime: res.updateTime || null };
}

/** Commit full daily movers hits payload (overwrites arrays intentionally). */
function writeDailyMoversHits_(payload) {
  const now = new Date();
  const body = {
    dayKey: payload.dayKey || getSydneyDayKey_(),
    upHits: Array.isArray(payload.upHits) ? payload.upHits : [],
    downHits: Array.isArray(payload.downHits) ? payload.downHits : [],
    updatedAt: now
  };
  const mask = ['dayKey','upHits','downHits','updatedAt'];
  return commitCentralDoc_(DAILY_MOVERS_HITS_DOC_SEGMENTS, body, mask);
}

/** Append today's movers (up/down) hits to the daily history doc with de-dup by code. */
function appendDailyMoversHits_(upArr, downArr) {
  const todayKey = getSydneyDayKey_();
  const current = fetchDailyMoversHits_();
  if (!current.ok) { Logger.log('[Movers][DailyHits] fetch failed: %s', current.error); return; }
  let upHits = current.data.upHits || [];
  let downHits = current.data.downHits || [];
  let dayKey = current.data.dayKey || todayKey;
  if (dayKey !== todayKey) {
    // New day: reset lists
    upHits = []; downHits = []; dayKey = todayKey;
  }
  const nowIso = new Date().toISOString();
  const seenUp = new Set(upHits.map(h => h && h.code));
  const seenDown = new Set(downHits.map(h => h && h.code));
  // Normalize existing seen sets to uppercase codes
  const _normCode = (c) => (c || '').toString().trim().toUpperCase();
  const seenUpNorm = new Set(Array.from(seenUp).map(_normCode));
  const seenDownNorm = new Set(Array.from(seenDown).map(_normCode));

  function normMoverItem(e) {
    if (!e) return null;
    const code = (e.code || e.shareCode || '').toString().trim().toUpperCase();
    if (!code) return null;
    // Prefer provided fields; compute pct if needed
    const live = (e.live!=null && !isNaN(e.live)) ? Number(e.live) : null;
    const prev = (e.prevClose!=null && !isNaN(e.prevClose)) ? Number(e.prevClose) : (e.prev!=null && !isNaN(e.prev) ? Number(e.prev) : null);
    const change = (e.change!=null && !isNaN(e.change)) ? Number(e.change) : (live!=null && prev!=null ? Number(live - prev) : null);
    const pct = (e.pct!=null && !isNaN(e.pct)) ? Number(e.pct) : ((change!=null && prev) ? Number((change/prev)*100) : null);
    const direction = (e.direction || (change!=null ? (change>0?'up':'down') : null)) || null;
    return { code, name: e.name || e.companyName || null, live: live, prevClose: prev, change: change, pct: pct, direction: direction, t: nowIso };
  }

  (Array.isArray(upArr) ? upArr : []).forEach(e => {
  const item = normMoverItem(e);
  if (!item) return;
  const c = _normCode(item.code);
  item.code = c;
  if (!seenUpNorm.has(c)) { upHits.push(item); seenUpNorm.add(c); }
  });
  (Array.isArray(downArr) ? downArr : []).forEach(e => {
  const item = normMoverItem(e);
  if (!item) return;
  const c = _normCode(item.code);
  item.code = c;
  if (!seenDownNorm.has(c)) { downHits.push(item); seenDownNorm.add(c); }
  });

  writeDailyMoversHits_({ dayKey, upHits, downHits });
}

// ================== PORTFOLIO DUPLICATION -> CUSTOM HITS ==================
/** For each user, if any of their shares' codes appear in today's up/down movers, append into CUSTOM_TRIGGER_HITS. */
function duplicateMoversIntoCustom_(upArr, downArr) {
  try {
    const moversSet = new Set();
    (Array.isArray(upArr) ? upArr : []).forEach(e => { const c=(e&&e.code||'').toString().toUpperCase(); if(c) moversSet.add(c); });
    (Array.isArray(downArr) ? downArr : []).forEach(e => { const c=(e&&e.code||'').toString().toUpperCase(); if(c) moversSet.add(c); });
    if (moversSet.size === 0) return;
    // Build quick map for name/live when present
    const infoMap = {};
    function num(v){ const n=Number(v); return isFinite(n)? n : null; }
    (Array.isArray(upArr)?upArr:[]).concat(Array.isArray(downArr)?downArr:[]).forEach(e=>{
      if (!e || !e.code) return; const c = String(e.code).toUpperCase();
      if (!infoMap[c]) infoMap[c] = { name: e.name || null, live: num(e.live) };
    });
    // Iterate users and their shares
    const usersList = _listFirestoreCollection_(['artifacts', APP_ID, 'users']);
    if (!usersList.ok) { 
        Logger.log('[DupMovers] users list failed: %s', usersList.error); 
        return; 
    }
    
    Logger.log('[DupMovers] Found %s users to process. MoversSet size: %s', usersList.docs.length, moversSet.size);

    const pending = [];
    const nowIso = new Date().toISOString();
    usersList.docs.forEach(u => {
      try {
        const uid = (u.name||'').split('/').pop(); 
        if (!uid) return;
        
        const sharesList = _listFirestoreCollection_(['artifacts', APP_ID, 'users', uid, 'shares']);
        if (!sharesList.ok) {
            Logger.log('[DupMovers] Failed to list shares for user %s: %s', uid, sharesList.error);
            return;
        }
        
        let userMatchCount = 0;
        sharesList.docs.forEach(d => {
          try {
            const shareId = (d.name||'').split('/').pop();
            const f = _fromFsFields_(d.fields || {});
            const rawCode = (f.shareName || f.shareCode || f.code || '').toString().trim();
            const code = rawCode ? rawCode.toUpperCase() : null; 
            
            if (!code) return;
            if (!moversSet.has(code)) return;
            
            userMatchCount++;
            const meta = infoMap[code] || {};
            const direction = (Array.isArray(upArr) && upArr.some(x=> (x.code||'').toString().toUpperCase()===code)) ? 'up' : ((Array.isArray(downArr) && downArr.some(x=> (x.code||'').toString().toUpperCase()===code)) ? 'down' : null);
            
            pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, intent: 'mover', direction: direction, userId: uid, shareId, t: nowIso });
          } catch(e){ Logger.log('[DupMovers] Error processing share for user %s: %s', uid, e); }
        });
        if (userMatchCount > 0) {
            Logger.log('[DupMovers] User %s: matched %s shares.', uid, userMatchCount);
        }
      } catch(e){ Logger.log('[DupMovers] Error for user loop: %s', e); }
    });
    
    if (pending.length) {
        Logger.log('[DupMovers] Success! Appending %s hits to CUSTOM_TRIGGER_HITS.', pending.length);
        appendDailyCustomHits_(pending);
    } else {
        Logger.log('[DupMovers] No matches found across all users.');
    }
  } catch (e) { Logger.log('[DupMovers] EX', e); }
}

/** For each user, if any of their shares' codes appear in today's 52W highs/lows, append into CUSTOM_TRIGGER_HITS. */
function duplicateHiLoHitsIntoCustom_(highsArr, lowsArr) {
  try {
    const hiLoSet = new Set();
    (Array.isArray(highsArr)?highsArr:[]).forEach(e=>{ const c=(e&&e.code||'').toString().toUpperCase(); if(c) hiLoSet.add(c); });
    (Array.isArray(lowsArr)?lowsArr:[]).forEach(e=>{ const c=(e&&e.code||'').toString().toUpperCase(); if(c) hiLoSet.add(c); });
    if (hiLoSet.size === 0) return;
    const infoMap = {};
    function num(v){ const n=Number(v); return isFinite(n)? n : null; }
    (Array.isArray(highsArr)?highsArr:[]).concat(Array.isArray(lowsArr)?lowsArr:[]).forEach(e=>{
      if (!e || !e.code) return; const c = String(e.code).toUpperCase();
      if (!infoMap[c]) infoMap[c] = { name: e.name || null, live: num(e.live) };
    });
    const usersList = _listFirestoreCollection_(['artifacts', APP_ID, 'users']);
    if (!usersList.ok) { Logger.log('[DupHiLo] users list failed: %s', usersList.error); return; }
    const pending = [];
    const nowIso = new Date().toISOString();
    usersList.docs.forEach(u => {
      try {
        const uid = (u.name||'').split('/').pop(); if (!uid) return;
        const sharesList = _listFirestoreCollection_(['artifacts', APP_ID, 'users', uid, 'shares']);
        if (!sharesList.ok) return;
        sharesList.docs.forEach(d => {
          try {
            const shareId = (d.name||'').split('/').pop();
            const f = _fromFsFields_(d.fields || {});
            const rawCode = (f.shareName || f.shareCode || f.code || '').toString().trim();
            const code = rawCode ? rawCode.toUpperCase() : null; if (!code) return;
            if (!hiLoSet.has(code)) return;
            const meta = infoMap[code] || {};
            // include whether it was high or low via intent hint (favor highsArr check)
            const wasHigh = (Array.isArray(highsArr)?highsArr:[]).some(e=> (e&&String(e.code).toUpperCase())===code);
            const intent = wasHigh ? '52w-high' : '52w-low';
            const direction = wasHigh ? 'high' : 'low';
            pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, intent, direction, userId: uid, shareId, t: nowIso });
          } catch(_){}
        });
      } catch(_){}
    });
    if (pending.length) appendDailyCustomHits_(pending);
  } catch (e) { Logger.log('[DupHiLo] EX', e); }
}

// ================== DAILY CUSTOM TRIGGER HITS ==================
/** Fetch current day's CUSTOM_TRIGGER_HITS document from Firestore. */
function fetchDailyCustomHits_() {
  const res = _fetchFirestoreDocument_(DAILY_CUSTOM_HITS_DOC_SEGMENTS);
  if (!res.ok) {
    if (res.notFound) return { ok: true, data: { dayKey: getSydneyDayKey_(), hits: [] }, updateTime: null };
    return { ok: false, error: res.error || ('status=' + res.status) };
  }
  const data = res.data || {};
  return { ok: true, data: { dayKey: data.dayKey || getSydneyDayKey_(), hits: data.hits || [] }, updateTime: res.updateTime || null };
}

/** Write/overwrite CUSTOM_TRIGGER_HITS doc. */
function writeDailyCustomHits_(payload) {
  const now = new Date();
  const body = {
    dayKey: payload.dayKey || getSydneyDayKey_(),
    hits: Array.isArray(payload.hits) ? payload.hits : [],
    updatedAt: now
  };
  const mask = ['dayKey','hits','updatedAt'];
  return commitCentralDoc_(DAILY_CUSTOM_HITS_DOC_SEGMENTS, body, mask);
}

/** Append to CUSTOM_TRIGGER_HITS with de-dup on (userId, code). */
function appendDailyCustomHits_(newHitsArr) {
  const todayKey = getSydneyDayKey_();
  const current = fetchDailyCustomHits_();
  if (!current.ok) { Logger.log('[CustomHits] fetch failed: %s', current.error); return; }
  let hits = current.data.hits || [];
  let dayKey = current.data.dayKey || todayKey;
  if (dayKey !== todayKey) { hits = []; dayKey = todayKey; }
  const nowIso = new Date().toISOString();
  // De-duplication key includes intent so same code can appear once per intent per user per day.
  const _normCode = (c) => (c || '').toString().trim().toUpperCase();
  // Normalize intent: map legacy names, coerce missing to explicit 'none' to avoid empty-key collisions
  const _normIntent = (i) => {
    if (!i) return 'none';
    const s = i.toString().trim().toLowerCase();
    if (s === 'global-mover') return 'mover';
    return s || 'none';
  };
  const seen = new Set(hits.map(h => {
    if (!h) return '';
    const uid = (h.userId || '');
    const code = _normCode(h.code || '');
    const intentRaw = (h.intent || '');
    const intent = _normIntent(intentRaw);
    return uid + '|' + code + '|' + intent;
  }));
    (Array.isArray(newHitsArr) ? newHitsArr : []).forEach(h => {
    if (!h || !h.code) return;
    const uid = (h.userId || '') + '';
    const code = _normCode(h.code);
    const intent = _normIntent(h.intent || null);
    const key = uid + '|' + code + '|' + intent;
    if (seen.has(key)) return;
    const item = {
      code: code,
      name: h.name || null,
      live: (h.live!=null && !isNaN(h.live)) ? Number(h.live) : null,
      target: (h.target!=null && !isNaN(h.target)) ? Number(h.target) : null,
      direction: h.direction || null,
      intent: intent || 'none',
      userId: uid || null,
      shareId: h.shareId || null,
      t: h.t || nowIso,
      userIntent: h.userIntent || null
    };
    hits.push(item); seen.add(key);
  });
  writeDailyCustomHits_({ dayKey, hits });
}

/**
 * Reconcile portfolio-based duplicates from today's daily hits into CUSTOM_TRIGGER_HITS.
 * This ensures that if a user adds a portfolio share later in the day, they still see
 * the corresponding movers/52w events under Custom Triggers. Idempotent.
 */
function reconcileCustomDuplicatesFromDailyHits_() {
  try {
    // Fetch today's daily hits docs
    const hiloRes = fetchDailyHiLoHits_();
    const moversRes = fetchDailyMoversHits_();
    if (!hiloRes.ok && !moversRes.ok) { Logger.log('[CustomRecon] Failed to fetch daily hits'); return; }
    const highHits = (hiloRes && hiloRes.ok && Array.isArray(hiloRes.data.highHits)) ? hiloRes.data.highHits : [];
    const lowHits  = (hiloRes && hiloRes.ok && Array.isArray(hiloRes.data.lowHits)) ? hiloRes.data.lowHits : [];
    const upHits   = (moversRes && moversRes.ok && Array.isArray(moversRes.data.upHits)) ? moversRes.data.upHits : [];
    const downHits = (moversRes && moversRes.ok && Array.isArray(moversRes.data.downHits)) ? moversRes.data.downHits : [];

    // Build quick lookup sets and info maps
    const toCode = (c) => (c==null? '' : String(c)).trim().toUpperCase();
    const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };
    const hiSet = new Set(highHits.map(h => toCode(h && h.code)));
    const loSet = new Set(lowHits.map(h => toCode(h && h.code)));
    const upSet = new Set(upHits.map(h => toCode(h && h.code)));
    const dnSet = new Set(downHits.map(h => toCode(h && h.code)));
    if (hiSet.size===0 && loSet.size===0 && upSet.size===0 && dnSet.size===0) return; // nothing to do

    // Info maps for name/live
    const info = {};
    function putInfo(arr) {
      (Array.isArray(arr)?arr:[]).forEach(h => {
        if (!h) return; const c = toCode(h.code); if (!c) return;
        if (!info[c]) info[c] = { name: h.name || null, live: num(h.live) };
      });
    }
    putInfo(highHits); putInfo(lowHits); putInfo(upHits); putInfo(downHits);

    const usersList = _listFirestoreCollection_(['artifacts', APP_ID, 'users']);
    if (!usersList.ok) { Logger.log('[CustomRecon] users list failed: %s', usersList.error); return; }

    const pending = [];
    const nowIso = new Date().toISOString();
    usersList.docs.forEach(u => {
      try {
        const uid = (u.name||'').split('/').pop(); if (!uid) return;
        const sharesList = _listFirestoreCollection_(['artifacts', APP_ID, 'users', uid, 'shares']);
        if (!sharesList.ok) return;
        sharesList.docs.forEach(d => {
          try {
            const shareId = (d.name||'').split('/').pop();
            const f = _fromFsFields_(d.fields || {});
            const rawCode = (f.shareName || f.shareCode || f.code || '').toString().trim();
            const code = rawCode ? rawCode.toUpperCase() : null; if (!code) return;

            // 52W high/low intents
            if (hiSet.has(code)) {
              const meta = info[code] || {};
              pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, intent: '52w-high', direction: 'high', userId: uid, shareId, t: nowIso });
            }
            if (loSet.has(code)) {
              const meta = info[code] || {};
              pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, intent: '52w-low', direction: 'low', userId: uid, shareId, t: nowIso });
            }

            // Movers intent with direction
            if (upSet.has(code)) {
              const meta = info[code] || {};
              pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, intent: 'mover', direction: 'up', userId: uid, shareId, t: nowIso });
            }
            if (dnSet.has(code)) {
              const meta = info[code] || {};
              pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, intent: 'mover', direction: 'down', userId: uid, shareId, t: nowIso });
            }
          } catch(_){}
        });
      } catch(_){}
    });

    if (pending.length) appendDailyCustomHits_(pending);
  } catch (e) {
    Logger.log('[CustomRecon] EX %s', e && e.message || e);
  }
}

/**
 * Scan all users' enabled custom target alerts against current Prices sheet and persist hits.
 * Rule: direction 'above' -> live >= target; 'below' -> live <= target. target>0 required.
 */
function runCustomTriggersScan() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const priceRows = fetchAllAsxData_(ss) || [];
    if (!priceRows.length) { console.log('[CustomScan] No price data; abort.'); return; }
    // Build quick lookup map by code
    const priceMap = {};
    priceRows.forEach(r => { if (r && r.code) priceMap[String(r.code).toUpperCase()] = r; });

    // List all users under artifacts/{APP_ID}/users
    const usersList = _listFirestoreCollection_(['artifacts', APP_ID, 'users']);
    if (!usersList.ok) { console.log('[CustomScan] Failed to list users:', usersList.error); return; }

  const pendingHits = [];

    usersList.docs.forEach(docMeta => {
      try {
        const name = docMeta.name || '';
        const parts = name.split('/');
        const userId = parts[parts.length - 1];
        if (!userId) return;

        // Alerts enabled state: default ENABLED unless explicitly disabled in alerts/{shareId}
        // Build a set of DISABLED shareIds to skip; absence of a doc means enabled by default.
        const alertsList = _listFirestoreCollection_(['artifacts', APP_ID, 'users', userId, 'alerts']);
        const disabledSet = new Set();
        if (alertsList.ok) {
          alertsList.docs.forEach(d => {
            try {
              const id = (d.name || '').split('/').pop();
              const fields = _fromFsFields_(d.fields || {});
              if (id && fields.enabled === false) disabledSet.add(id);
            } catch(_){}
          });
        }

        // Shares with target configs
        const sharesList = _listFirestoreCollection_(['artifacts', APP_ID, 'users', userId, 'shares']);
        if (!sharesList.ok) { return; }
        sharesList.docs.forEach(d => {
          try {
            const shareId = (d.name || '').split('/').pop();
            const fields = _fromFsFields_(d.fields || {});
            // Accept multiple possible code fields for backward compatibility
            const rawCode = (fields.shareName || fields.shareCode || fields.code || '').toString().trim();
            const code = rawCode ? rawCode.toUpperCase() : null;
            if (!code) return;
            // Consider only when not explicitly disabled (default enabled)
            if (disabledSet.has(shareId)) return;
            // Sanitize target price (accept numeric, strings like '50c', '$0.50', '0.50 cents')
            function _sanitizeTarget_(v){
              if (v === null || v === undefined) return NaN;
              if (typeof v === 'number') return v;
              let s = String(v).trim(); if (!s) return NaN;
              s = s.replace(/\$/g,'');
              const centsMatch = /^([0-9]+)c$/i.exec(s);
              if (centsMatch) { const centsVal = Number(centsMatch[1]); return isFinite(centsVal) ? (centsVal/100) : NaN; }
              s = s.replace(/cents?/i,'');
              s = s.replace(/,/g,'');
              s = s.replace(/[^0-9.+-]/g,'');
              if (!s) return NaN;
              const n = Number(s);
              return isFinite(n) ? n : NaN;
            }
            const tgt = _sanitizeTarget_(fields.targetPrice);
            if (!isFinite(tgt) || tgt <= 0) return;
            const direction = (fields.targetDirection || '').toString().trim().toLowerCase();
            if (direction !== 'above' && direction !== 'below') return;
            const p = priceMap[code]; if (!p || p.livePrice == null || isNaN(p.livePrice)) return;
            const live = Number(p.livePrice);
            const hit = (direction === 'above') ? (live >= tgt) : (live <= tgt);
            if (!hit) return;
            pendingHits.push({
              code,
              name: p.name || fields.companyName || null,
              live,
              target: tgt,
              direction,
              // Classify this as a target-hit event; preserve user-configured intent separately
              intent: 'target-hit',
              userIntent: (function(){ const ui = (fields.intent==null? null : String(fields.intent)); return (ui && ui.trim()) ? ui : null; })(),
              userId,
              shareId,
              t: new Date().toISOString()
            });
          } catch (e) { Logger.log('[CustomScan] share eval error: %s', e && e.message || e); }
        });
      } catch (e) { Logger.log('[CustomScan] user loop error: %s', e && e.message || e); }
    });

    if (pendingHits.length) {
      appendDailyCustomHits_(pendingHits);
      console.log('[CustomScan] Appended hits:', pendingHits.length);
    } else {
      console.log('[CustomScan] No hits this cycle.');
    }
  } catch (err) {
    console.error('[CustomScan] ERROR:', err && err.stack || err);
  }
}

// ===============================================================
// ================= SETTINGS / SHARED HELPERS ==================
// ===============================================================

// (Legacy getSettingsFromSheet_ removed)

// ===============================================================
// ========== LEGACY PER-USER ALERT PROCESSING (UNCHANGED) ======
// ===============================================================

// ===============================================================
// ========== SETTINGS SYNC (Firestore -> Sheet) =================
// ===============================================================
/**
 * Fetch a single Firestore document (native REST) and return plain object of fields.
 * @param {string[]} pathSegments e.g. ['artifacts', APP_ID, 'users', userId, 'settings']
 */
function _fetchFirestoreDocument_(pathSegments, options) {
  const token = ScriptApp.getOAuthToken();
  const docPath = pathSegments.map(encodeURIComponent).join('/');
  const url = FIRESTORE_BASE + '/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + docPath;
  try {
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
    if (options && options.noCache) {
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';
    }
    const resp = UrlFetchApp.fetch(url, { method: 'get', headers, muteHttpExceptions: true });
    const status = resp.getResponseCode();
    const text = resp.getContentText();
    if (status === 404) return { ok: false, status, notFound: true };
    let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch(_) {}
    if (status >= 200 && status < 300 && parsed) {
      return { ok: true, status, data: _fromFsFields_(parsed.fields || {}), updateTime: parsed.updateTime || null };
    }
    return { ok: false, status, error: text };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

/** Convert Firestore Value map to plain JS object. */
function _fromFsFields_(fields) {
  const out = {};
  Object.keys(fields || {}).forEach(k => out[k] = _fromFsValue_(fields[k]));
  return out;
}

/** List all documents under a collection using REST (shallow). Returns array of {name, fields}. */
function _listFirestoreCollection_(collectionPathSegments, options) {
  const token = ScriptApp.getOAuthToken();
  const collPath = collectionPathSegments.map(encodeURIComponent).join('/');
  const url = FIRESTORE_BASE + '/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + collPath;
  try {
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
    // Use pageSize to avoid huge payloads; paginate if nextPageToken appears
    let pageToken = null; const out = [];
    for (let i=0;i<20;i++) { // safety cap
      const fullUrl = url + '?pageSize=100' + (pageToken ? ('&pageToken=' + encodeURIComponent(pageToken)) : '');
      const resp = UrlFetchApp.fetch(fullUrl, { method: 'get', headers, muteHttpExceptions: true });
      const status = resp.getResponseCode(); const text = resp.getContentText();
      if (status === 404) return { ok: true, docs: [] };
      let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch(_) {}
      if (status >= 200 && status < 300 && parsed) {
        const docs = parsed.documents || [];
        docs.forEach(d => out.push({ name: d.name, fields: d.fields || {}, updateTime: d.updateTime || null, createTime: d.createTime || null }));
        pageToken = parsed.nextPageToken || null;
        if (!pageToken) break;
      } else {
        return { ok: false, status, error: text };
      }
    }
    return { ok: true, docs: out };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

function _fromFsValue_(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(_fromFsValue_);
  if ('mapValue' in v) return _fromFsFields_(v.mapValue.fields || {});
  return null;
}

// ===============================================================
// ======= FIRESTORE GLOBAL SETTINGS (SOURCE OF TRUTH) ===========
// ===============================================================
/**
 * Fetch global settings from Firestore central document.
 * Path: /artifacts/{APP_ID}/config/globalSettings
 * Expects a flat map of keys compatible with previous sheet-based names, e.g.:
 *  {
 *    globalPercentIncrease: 5,
 *    globalDollarIncrease: 0.15,
 *    globalPercentDecrease: 5,
 *    globalDollarDecrease: 0.15,
 *    globalMinimumPrice: 0.05,
 *    hiLoMinimumPrice: 0.05,
 *    hiLoMinimumMarketCap: 10000000,
 *    emailAlertsEnabled: true,
 *    alertEmailRecipients: "user@example.com"
 *  }
 * @return {{ok:boolean,data?:Object,error?:string,status?:number}}
 */
function fetchGlobalSettingsFromFirestore(options) {
  try {
    const res = _fetchFirestoreDocument_(GLOBAL_SETTINGS_DOC_SEGMENTS, options || {});
    if (!res.ok) {
      if (res.notFound) return { ok:false, error:'Global settings doc not found', status:404 };
      return { ok:false, error: res.error || ('status=' + res.status), status: res.status };
    }
    return { ok:true, data: res.data, status: res.status, updateTime: res.updateTime || null };
  } catch (e) {
    return { ok:false, error:String(e) };
  }
}

function fetchGlobalSettingsGuaranteedLatest_(attempts, delayMs) {
  const maxAttempts = Math.max(1, attempts || 3);
  const sleepMs = Math.min(1000, delayMs == null ? 250 : delayMs);
  let best = null;
  for (let i=0;i<maxAttempts;i++) {
    // First attempt: normal fetch (no cache bust) to avoid any unforeseen param-based routing issues; subsequent attempts use noCache.
    const useNoCache = (i > 0);
    const r = fetchGlobalSettingsFromFirestore(useNoCache ? { noCache: true } : {});
    if (r.ok && r.data) {
      if (!best || !best.updateTime || (r.updateTime && r.updateTime > best.updateTime)) {
        best = { attempt: i+1, updateTime: r.updateTime || null, data: r.data, status: r.status };
      }
    } else {
      console.log('[MoversScan][settings-fetch] attempt=' + (i+1) + ' failed status=' + (r && r.status) + ' err=' + (r && r.error));
    }
    if (i < maxAttempts - 1) Utilities.sleep(sleepMs);
  }
  if (!best) {
    // Final fallback: single direct fetch without cache bust in case earlier failures were due to timing or transient network.
    const fallback = fetchGlobalSettingsFromFirestore();
    if (fallback.ok && fallback.data) {
      console.log('[MoversScan][settings-fetch] fallback single fetch succeeded after primary attempts failed.');
      return { ok:true, data: fallback.data, updateTime: fallback.updateTime || null, attempts: maxAttempts + 1, fallback: true };
    }
    return { ok:false, error:'Failed to fetch settings after attempts=' + maxAttempts + ' + fallback', attempts: maxAttempts, fallbackTried: true };
  }
  return { ok:true, data: best.data, updateTime: best.updateTime, attempts: maxAttempts };
}

/**
 * Sync a user's profile settings document into the central globalSettings document.
 * This is intended to be called by the Apps Script server (privileged) when a user
 * updates their per-user profile settings and client-side writes are blocked by rules.
 *
 * Usage: either call syncUserProfileToCentralGlobalSettings(userId) from other
 * Apps Script code, or expose via doPost/doGet (careful with auth) or a time-based
 * trigger that periodically reconciles changes.
 *
 * Behavior:
 *  - Reads /artifacts/{APP_ID}/users/{userId}/preferences/config via REST helper
 *  - Normalizes the canonical keys used by the backend scans (directional & hi/lo)
 *  - Writes an object to /artifacts/{APP_ID}/config/globalSettings using commitCentralDoc_
 *  - Adds updatedAt and updatedByUserId metadata
 *
 * @param {string} userId Firestore user id to read profile settings from
 * @return {{ok:boolean,status?:number,error?:string,written?:object}}
 */
function syncUserProfileToCentralGlobalSettings(userId) {
  if (!userId) return { ok: false, error: 'userId required' };
  try {
    // Current frontend path: artifacts/{APP_ID}/users/{userId}/preferences/config
    const primaryDocPath = ['artifacts', APP_ID, 'users', userId, 'preferences', 'config'];
    let res = _fetchFirestoreDocument_(primaryDocPath);
    let pathUsed = primaryDocPath.join('/');
    
    // Fallback path check (profile/settings)
    if (!res.ok && res.notFound) {
      const altDocPath = ['artifacts', APP_ID, 'users', userId, 'profile', 'settings'];
      const altRes = _fetchFirestoreDocument_(altDocPath);
      if (altRes.ok) {
        res = altRes;
        pathUsed = altDocPath.join('/');
      }
    }
    
    if (!res.ok) {
      if (res.notFound) return { ok: false, status: 404, error: 'User preferences not found', pathTried: pathUsed };
      return { ok: false, status: res.status, error: res.error || 'Failed to fetch user preferences', pathTried: pathUsed };
    }
    
    const data = res.data || {};
    const rules = data.scannerRules || {};
    
    // Support path-based extraction from frontend schema
    // Frontend structure: scannerRules: { up: { percentThreshold, dollarThreshold }, ... }
    const centralPayload = {
      globalPercentIncrease: (rules.up && rules.up.percentThreshold != null) ? Number(rules.up.percentThreshold) : null,
      globalDollarIncrease: (rules.up && rules.up.dollarThreshold != null) ? Number(rules.up.dollarThreshold) : null,
      globalPercentDecrease: (rules.down && rules.down.percentThreshold != null) ? Number(rules.down.percentThreshold) : null,
      globalDollarDecrease: (rules.down && rules.down.dollarThreshold != null) ? Number(rules.down.dollarThreshold) : null,
      globalMinimumPrice: rules.minPrice != null ? Number(rules.minPrice) : null,
      hiLoMinimumPrice: rules.hiloMinPrice != null ? Number(rules.hiloMinPrice) : null,
      // Note: hiLoMinimumMarketCap is not currently in SettingsUI but preserved if already in doc
      hiLoMinimumMarketCap: data.hiLoMinimumMarketCap != null ? Number(data.hiLoMinimumMarketCap) : null,
      emailAlertsEnabled: (typeof data.dailyEmail === 'boolean') ? data.dailyEmail : (data.emailAlertsEnabled != null ? !!data.emailAlertsEnabled : null),
      alertEmailRecipients: data.alertEmailRecipients != null ? String(data.alertEmailRecipients) : null,
      // metadata
      updatedByUserId: userId,
      updatedAt: new Date()
    };

    // Remove nulls from payload - commitCentralDoc_ will accept nulls but we prefer explicit nulls for masking
    // Build an explicit mask covering only the keys we are writing
    const mask = [
      'globalPercentIncrease','globalDollarIncrease','globalPercentDecrease','globalDollarDecrease','globalMinimumPrice',
      'hiLoMinimumPrice','hiLoMinimumMarketCap','emailAlertsEnabled','alertEmailRecipients','updatedByUserId','updatedAt'
    ];

    const commitRes = commitCentralDoc_(GLOBAL_SETTINGS_DOC_SEGMENTS, centralPayload, mask);
    if (!commitRes.ok) {
      // Provide useful diagnostic output for troubleshooting in the execution log
      Logger.log('[SyncUser->Central] commit failed for user=%s path=%s status=%s error=%s', userId, pathUsed, commitRes.status, commitRes.error);
      return { ok: false, status: commitRes.status, error: commitRes.error || 'Failed to commit central settings', written: centralPayload };
    }
    Logger.log('[SyncUser->Central] commit succeeded for user=%s path=%s status=%s', userId, pathUsed, commitRes.status);
    return { ok: true, status: commitRes.status, written: centralPayload, pathUsed };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ------------------------------------------------------------------
// Manual Test / Debug Helper
// ------------------------------------------------------------------

// Convenience wrapper to reconcile the calling user's settings into central globalSettings.
// This function inspects the active user's email address from Session.getActiveUser().getEmail()
// and attempts to find a matching Firestore user document. If found (and if the user is authorized to
// the web app with appropriate auth), it will write the profile settings into central config.
// 
// @param {{userId?:string}} options
// @return {{ok:boolean,error?:string,status?:number}}
function reconcileCurrentUserSettings(options) {
  const userId = (options && options.userId) ? options.userId : null;
  try {
    if (!userId) return { ok: false, error: 'userId required' };
    const res = syncUserProfileToCentralGlobalSettings(userId);
    if (!res.ok) return { ok: false, error: res.error || 'sync failed', status: res.status };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ------------------------------------------------------------------
// Web endpoint: secure on-save trigger
// ------------------------------------------------------------------
/**
 * doPost entrypoint for Apps Script Web App.
 * Expects calls from authenticated users (OAuth) and will attempt to
 * sync that user's profile settings into the central globalSettings doc.
 *
 * Security notes (see deployment section below):
 *  - Deploy the Web App with "Execute as: Me (script owner)" so the script
 *    has privileges to write central documents. Restrict access to only
 *    "Only myself" or to your domain, or use OAuth with ID token checks.
 *  - The function will attempt to resolve a userId either from the request
 *    body (options.userId) or from an authenticated mapping supplied by you.
 *
 * For ease of use, the client should call this endpoint after successfully
 * saving the per-user profile settings document. The client must include
 * its OAuth token in the Authorization header if calling directly via fetch.
 *
 * @param {Object} e Apps Script event object
 * @returns {ContentService.TextOutput} JSON response
 */
function doPost(e) {
  try {
    // Best-effort body parse (support both form and raw JSON)
    // Support payloads from fetch() with JSON body and from form-encoded submits.
    let payload = {};
    try {
      if (e && e.postData && e.postData.contents) {
        // postData.contents is raw text; try JSON.parse first
        try {
          payload = JSON.parse(e.postData.contents);
        } catch (jsonErr) {
          // not JSON - try to parse as URL-encoded form body (userId=...&foo=...)
          try {
            const raw = String(e.postData.contents || '');
            const parts = raw.split('&').map(p => p.split('='));
            payload = {};
            parts.forEach(pair => {
              if (!pair || !pair.length) return;
              const k = decodeURIComponent((pair[0] || '').replace(/\+/g, ' '));
              const v = decodeURIComponent((pair[1] || '').replace(/\+/g, ' '));
              payload[k] = v;
            });
          } catch (_) {
            // fallback to parameters
            payload = e.parameter || {};
          }
        }
      } else if (e && e.parameter && Object.keys(e.parameter).length) {
        payload = e.parameter;
      } else {
        payload = {};
      }
    } catch (err) {
      payload = {};
    }

    // 0. SYSTEM ACTIONS (e.g. Gemini AI, Admin ops)
    // Check for explicit 'action' parameter first
    const action = payload.action;
    if (action === 'generateBriefing') {
      const result = handleGenerateBriefing_(payload);
       return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // Accept either { userId } or { userId: '...', settings: {...} }
    const userId = (payload && payload.userId) ? String(payload.userId) : null;
    if (!userId) {
      // If client sent an ID token or auth info we could resolve it here - but for now require userId
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'userId required in payload' })).setMimeType(ContentService.MimeType.JSON);
    }

    // If settings were provided inline, attempt to write them directly to the central doc
    // otherwise, sync from the user's profile document in Firestore.
    let result;
    if (payload && payload.settings && typeof payload.settings === 'object') {
      // Normalize and write settings directly
      try {
        // Build central payload similar to syncUserProfileToCentralGlobalSettings
        const s = payload.settings;
        const centralPayload = {
          globalPercentIncrease: s.globalPercentIncrease != null ? Number(s.globalPercentIncrease) : null,
          globalDollarIncrease: s.globalDollarIncrease != null ? Number(s.globalDollarIncrease) : null,
          globalPercentDecrease: s.globalPercentDecrease != null ? Number(s.globalPercentDecrease) : null,
          globalDollarDecrease: s.globalDollarDecrease != null ? Number(s.globalDollarDecrease) : null,
          globalMinimumPrice: s.globalMinimumPrice != null ? Number(s.globalMinimumPrice) : null,
          hiLoMinimumPrice: s.hiLoMinimumPrice != null ? Number(s.hiLoMinimumPrice) : null,
          hiLoMinimumMarketCap: s.hiLoMinimumMarketCap != null ? Number(s.hiLoMinimumMarketCap) : null,
          emailAlertsEnabled: (typeof s.emailAlertsEnabled === 'boolean') ? s.emailAlertsEnabled : (s.emailAlertsEnabled != null ? !!s.emailAlertsEnabled : null),
          alertEmailRecipients: s.alertEmailRecipients != null ? String(s.alertEmailRecipients) : null,
          updatedByUserId: userId,
          updatedAt: new Date()
        };
        const mask = [
          'globalPercentIncrease','globalDollarIncrease','globalPercentDecrease','globalDollarDecrease','globalMinimumPrice',
          'hiLoMinimumPrice','hiLoMinimumMarketCap','emailAlertsEnabled','alertEmailRecipients','updatedByUserId','updatedAt'
        ];
        const commitRes = commitCentralDoc_(GLOBAL_SETTINGS_DOC_SEGMENTS, centralPayload, mask);
        if (!commitRes.ok) {
          result = { ok: false, status: commitRes.status, error: commitRes.error || 'Failed to commit provided settings', written: centralPayload };
        } else {
          result = { ok: true, status: commitRes.status, written: centralPayload };
        }
      } catch (err) {
        result = { ok: false, error: String(err) };
      }
    } else {
      // No inline settings: read the user's profile settings doc and sync
     if (payload.action === 'syncGlobalWatchlist') {
      result = handleSyncGlobalWatchlist_(payload);
    } else if (payload.action === 'generateBriefing') {
      result = handleGenerateBriefing_(payload);
    } else if (payload.action === 'roastPortfolio') {
      result = handlePortfolioRoast_(payload);
    } else if (payload.action === 'geminiQuery') {
      result = handleGeminiQuery_(payload);
    } else {
      // Default: sync user settings
      result = handleSyncUserSettings_(payload);
    }
    } // End of outer else

    // Final Output Construction
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles the 'roastPortfolio' action.
 * Generates a critical, witty "roast" of the user's portfolio.
 */
function handlePortfolioRoast_(payload) {
  try {
    const context = payload.context;
    if (!context) return { ok: false, error: 'Missing context' };

    const p = context.portfolio || {};
    // Construct a spicy prompt
    const prompt = `
You are a ruthless, cynical, incredibly witty Wall Street hedge fund manager. 
You are looking at a user's retail portfolio. ROAST THEM.

Portfolio Stats:
- Total Value: ${p.totalValue}
- Day Change: ${p.dayChangePercent}% (${p.dayChangeValue})
- Key Positions (Top Winners): ${JSON.stringify(p.winners || [])}
- Key Positions (Top Losers): ${JSON.stringify(p.losers || [])}
- Market Sentiment: ${context.sentiment}

Instructions:
1. Write 2 short paragraphs (approx 100 words total).
2. Be savage but constructive. Make fun of their "diversification" (or lack thereof), their obsession with penny stocks, or their "safe" boomer stocks.
3. If they are losing money: "Did you pick these by throwing darts?"
4. If they are winning: "Pure luck. Don't quit your day job."
5. Use fire emojis 🔥.
6. Do NOT be polite.
    `;

    const result = callGeminiAPI_(prompt);
    
    if (result.success) {
      return { ok: true, text: result.data };
    } else {
      return { ok: false, error: result.reason }; 
    }

  } catch (e) {
    Logger.log('[Gemini] Roast Error: ' + e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Handles 'geminiQuery' for Smart Alerts and Chat.
 * Modes: 'explain' (Why is it moving?) | 'chat' (Ask the Market)
 */
function handleGeminiQuery_(payload) {
  try {
    const { mode, query, context } = payload;
    let prompt = '';

    if (mode === 'explain') {
       // SMART ALERT PROMPT
       // Goal: Plausible market theory without needing live news feed (unless we add it)
       prompt = `
Analyze this stock movement:
Symbol: ${context.symbol || 'Unknown'}
Change: ${context.change || 'Unknown'}
Sector: ${context.sector || 'Unknown'}
Current Market Sentiment: ${context.sentiment || 'Unknown'}

Task: Explain WHY this stock might be moving in 1-2 sentences. 
- If specific news is unknown, speculate based on the Sector performance and Market Sentiment.
- use specific financial terminology (e.g. "sector rotation", "taking profits", "correlation with iron ore").
- DO NOT say "I am an AI without real-time news". Just give the most likely market theory.
       `;
    } else if (mode === 'chat') {
       // ASK THE MARKET PROMPT
       prompt = `
You are a helpful ASX financial assistant.
User Question: "${query}"

User's Portfolio Context:
${JSON.stringify(context || {})}

Instructions:
1. Answer the user's question concisely (under 100 words).
2. If they ask about their portfolio, use the provided context.
3. If they ask generic market questions, answer based on your training.
4. Use bullet points for lists.
       `;
    } else {
       return { ok: false, error: 'Invalid mode' };
    }

    const result = callGeminiAPI_(prompt);
    
    if (result.success) {
      return { ok: true, text: result.data };
    } else {
      return { ok: false, error: result.reason };
    }

  } catch (e) {
    Logger.log('[Gemini] Query Error: ' + e);
    return { ok: false, error: String(e) };
  }
}


/**
 * Placeholder for the sync handling logic which was accidentally overwritten.
 * TODO: Restore full sync logic.
 */
function handleSyncUserSettings_(payload) {
  // Use payload.userId if available, otherwise it might be passed as argument if refactored.
  // The original syncUserProfileToCentralGlobalSettings took userId as arg.
  // doPost calls it as: handleSyncUserSettings_(payload)
  // Logic below adapts the backup code to use payload.userId or payload directly if it is just a wrapper.
  
  const userId = (payload && payload.userId) ? String(payload.userId) : null;
  
  if (!userId) return { ok: false, error: 'userId required' };
  try {
    // Prefer the canonical profile/settings path but fall back to legacy location for compatibility.
    const primaryDocPath = ['artifacts', APP_ID, 'users', userId, 'profile', 'settings'];
    let res = _fetchFirestoreDocument_(primaryDocPath);
    let pathUsed = primaryDocPath.join('/');
    if (!res.ok) {
      if (res.notFound) {
        // Try legacy fallback path used by older clients
        const legacyDocPath = ['artifacts', APP_ID, 'users', userId, 'settings', 'general'];
        const legacyRes = _fetchFirestoreDocument_(legacyDocPath);
        if (legacyRes.ok) {
          res = legacyRes;
          pathUsed = legacyDocPath.join('/');
        }
      }
    }
    if (!res.ok) {
      if (res.notFound) return { ok: false, status: 404, error: 'User profile settings not found', pathTried: pathUsed };
      return { ok: false, status: res.status, error: res.error || 'Failed to fetch user profile settings', pathTried: pathUsed };
    }
    const data = res.data || {};
    // Only copy the expected global keys to avoid crowding central config with user-specific metadata
    const centralPayload = {
      globalPercentIncrease: data.globalPercentIncrease != null ? Number(data.globalPercentIncrease) : null,
      globalDollarIncrease: data.globalDollarIncrease != null ? Number(data.globalDollarIncrease) : null,
      globalPercentDecrease: data.globalPercentDecrease != null ? Number(data.globalPercentDecrease) : null,
      globalDollarDecrease: data.globalDollarDecrease != null ? Number(data.globalDollarDecrease) : null,
      globalMinimumPrice: data.globalMinimumPrice != null ? Number(data.globalMinimumPrice) : null,
      hiLoMinimumPrice: data.hiLoMinimumPrice != null ? Number(data.hiLoMinimumPrice) : null,
      hiLoMinimumMarketCap: data.hiLoMinimumMarketCap != null ? Number(data.hiLoMinimumMarketCap) : null,
      emailAlertsEnabled: (typeof data.emailAlertsEnabled === 'boolean') ? data.emailAlertsEnabled : (data.emailAlertsEnabled != null ? !!data.emailAlertsEnabled : null),
      alertEmailRecipients: data.alertEmailRecipients != null ? String(data.alertEmailRecipients) : null,
      // metadata
      updatedByUserId: userId,
      updatedAt: new Date()
    };

    // Remove nulls from payload - commitCentralDoc_ will accept nulls but we prefer explicit nulls for masking
    // Build an explicit mask covering only the keys we are writing
    const mask = [
      'globalPercentIncrease','globalDollarIncrease','globalPercentDecrease','globalDollarDecrease','globalMinimumPrice',
      'hiLoMinimumPrice','hiLoMinimumMarketCap','emailAlertsEnabled','alertEmailRecipients','updatedByUserId','updatedAt'
    ];

    const commitRes = commitCentralDoc_(GLOBAL_SETTINGS_DOC_SEGMENTS, centralPayload, mask);
    if (!commitRes.ok) {
      // Provide useful diagnostic output for troubleshooting in the execution log
      Logger.log('[SyncUser->Central] commit failed for user=%s path=%s status=%s error=%s', userId, pathUsed, commitRes.status, commitRes.error);
      return { ok: false, status: commitRes.status, error: commitRes.error || 'Failed to commit central settings', written: centralPayload };
    }
    Logger.log('[SyncUser->Central] commit succeeded for user=%s path=%s status=%s', userId, pathUsed, commitRes.status);
    return { ok: true, status: commitRes.status, written: centralPayload, pathUsed };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
// (Legacy syncUserSettingsFromFirestore removed)

// (All temporary sync test harnesses & menu removed for production)


// (Legacy checkMarketAlerts removed)

/**
 * MASTER DAILY PREP FUNCTION
 * Runs at 6:00 AM Sydney.
 * 1. Checks if today is a Trading Day.
 * 2. If YES: Executes Daily Reset (clears hits) AND Capture Close (zeros price change).
 * 3. If NO: Does nothing (preserves weekend/holiday stats).
 */
function runDailyMorningPrep() {
  const now = new Date();
  console.log(`[DailyPrep] Starting Morning Prep for ${now}...`);
  
  if (!isTradingDay_(now)) {
    console.log('[DailyPrep] Non-trading day. Skipping Reset & Capture.');
    return;
  }
  
  // 1. Reset Daily Hit Counters (Firestore)
  console.log('[DailyPrep] Executing Daily Reset...');
  try {
    dailyResetTrigger(); 
  } catch (e) {
    console.error('[DailyPrep] Reset Failed:', e);
  }
  
  // 2. Capture Previous Close (Zero the Day Change)
  // We call the logic directly here
  console.log('[DailyPrep] Capturing New Start Price (Zeroing Day Change)...');
  try {
    captureDailyClosePrice();
  } catch (e) {
    console.error('[DailyPrep] Capture Failed:', e);
  }
  
  console.log('[DailyPrep] Complete. Ready for Market Open.');
}

function captureDailyClosePrice() {
  const now = new Date();
  console.log(`[${now}] Capturing daily closing prices...`);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const priceSheet = spreadsheet.getSheetByName(PRICE_SHEET_NAME);
  if (!priceSheet) { console.error(`Price data sheet "${PRICE_SHEET_NAME}" not found.`); return; }
  const range = priceSheet.getDataRange();
  const values = range.getValues();
  if (values.length === 0) return;
  const headers = values[0];
  const headersMap = headers.reduce((acc, header, index) => { 
    const key = String(header).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    acc[key] = index; 
    return acc; 
  }, {});

  // Robust matching for essential columns
  const livePriceColIndex = headersMap['LIVEPRICE'] ?? headersMap['LAST'] ?? headersMap['PRICE'];
  const prevCloseColIndex = headersMap['PREVDAYCLOSE'] ?? headersMap['PREVCLOSE'] ?? headersMap['CLOSEYEST'];

  if (livePriceColIndex === undefined || prevCloseColIndex === undefined) {
    console.error('Missing essential columns. Headers found: ' + JSON.stringify(headersMap));
    return;
  }
  // Optimize: Read column, update in memory, write back column
  // We want to update only the PrevDayClose column.
  // Data starts at row 2 (index 1).
  const numRows = values.length - 1;
  const prevCloseRange = priceSheet.getRange(2, prevCloseColIndex + 1, numRows, 1);
  
  const newPrevCloses = values.slice(1).map(row => {
    const live = row[livePriceColIndex];
    const currentPrev = row[prevCloseColIndex];
    // Rule: if live price is valid, use it. Else keep existing.
    if (live !== null && live !== '') {
      return [live];
    } else {
      return [currentPrev];
    }
  });

  prevCloseRange.setValues(newPrevCloses);
  console.log(`[${now}] Daily closing prices captured (Batch optimized).`);
}

function dailyResetTrigger() {
  const now = new Date();
  // (Legacy suppression log clearing removed as sheet is deprecated)
  // Also reset daily 52-week hit history in Firestore
  try {
    const dayKey = getSydneyDayKey_();
    writeDailyHiLoHits_({ dayKey, highHits: [], lowHits: [] });
    console.log(`[${now}] Daily 52-week hit history reset for ${dayKey}.`);
  } catch (e) {
    console.error('Failed to reset daily 52-week hit history:', e);
  }
  // Reset daily GLOBAL_MOVERS hits in Firestore as well
  try {
    const dayKey2 = getSydneyDayKey_();
    writeDailyMoversHits_({ dayKey: dayKey2, upHits: [], downHits: [] });
    console.log(`[${now}] Daily GLOBAL_MOVERS hit history reset for ${dayKey2}.`);
  } catch (e) {
    console.error('Failed to reset daily GLOBAL_MOVERS hit history:', e);
  }
  // Reset daily CUSTOM_TRIGGER_HITS
  try {
    const dayKey3 = getSydneyDayKey_();
    writeDailyCustomHits_({ dayKey: dayKey3, hits: [] });
    console.log(`[${now}] Daily CUSTOM_TRIGGER_HITS reset for ${dayKey3}.`);
  } catch (e) {
    console.error('Failed to reset daily CUSTOM_TRIGGER_HITS:', e);
  }
}

/**
 * Debug helper: returns counts and small samples from the three daily hits docs.
 * Useful to call from Apps Script editor to quickly confirm whether hits are being appended.
 */
function debugDailyHitsParity() {
  try {
    const movers = _fetchFirestoreDocument_(DAILY_MOVERS_HITS_DOC_SEGMENTS) || {};
    const hilo = _fetchFirestoreDocument_(DAILY_HILO_HITS_DOC_SEGMENTS) || {};
    const custom = _fetchFirestoreDocument_(DAILY_CUSTOM_HITS_DOC_SEGMENTS) || {};
    const out = {
      dayKey: getSydneyDayKey_(),
      movers: { ok: movers.ok === true, dayKey: (movers.data && movers.data.dayKey) || null, upCount: (movers.data && Array.isArray(movers.data.upHits) ? movers.data.upHits.length : null), downCount: (movers.data && Array.isArray(movers.data.downHits) ? movers.data.downHits.length : null), upSample: (movers.data && Array.isArray(movers.data.upHits) ? movers.data.upHits.slice(0,5) : []), downSample: (movers.data && Array.isArray(movers.data.downHits) ? movers.data.downHits.slice(0,5) : []) },
      hilo: { ok: hilo.ok === true, dayKey: (hilo.data && hilo.data.dayKey) || null, highCount: (hilo.data && Array.isArray(hilo.data.highHits) ? hilo.data.highHits.length : null), lowCount: (hilo.data && Array.isArray(hilo.data.lowHits) ? hilo.data.lowHits.length : null), highSample: (hilo.data && Array.isArray(hilo.data.highHits) ? hilo.data.highHits.slice(0,5) : []), lowSample: (hilo.data && Array.isArray(hilo.data.lowHits) ? hilo.data.lowHits.slice(0,5) : []) },
      custom: { ok: custom.ok === true, dayKey: (custom.data && custom.data.dayKey) || null, totalHits: (custom.data && Array.isArray(custom.data.hits) ? custom.data.hits.length : null), sample: (custom.data && Array.isArray(custom.data.hits) ? custom.data.hits.slice(0,10) : []) }
    };
    Logger.log('[debugDailyHitsParity] %s', JSON.stringify(out));
    return out;
  } catch (e) {
    Logger.log('[debugDailyHitsParity] Error: %s', e && e.message || e);
    return { ok: false, error: String(e) };
  }
}

// ================== DAILY COMBINED EMAIL DIGEST ==================
function sendCombinedDailyDigest_() {
  // 1) Weekday Guard
  try {
    const now = new Date();
    const isoDay = Number(Utilities.formatDate(now, ASX_TIME_ZONE, 'u'));
    if (isoDay === 6 || isoDay === 7) { 
      console.log('[DailyDigest] Today is weekend; skipping email send.');
      return;
    }
  } catch (dayErr) {
    console.log('[DailyDigest] Day check failed, proceeding cautiously:', dayErr);
  }

  // [FIRESTORE READ OPTIMIZATION] Run custom trigger scan ONCE before generating email to capture any hits
  try { runCustomTriggersScan(); } catch(e){ Logger.log('[DailyDigest] CustomScan error: %s', e); }
  // Reconcile portfolio-matched hits (Movers/52W) into custom hits for the email digest
  try { reconcileCustomDuplicatesFromDailyHits_(); } catch(e){ Logger.log('[DailyDigest] Recon error: %s', e); }

  // 2) Master Toggle Check (Central Settings)
  const masterSettingsRes = fetchGlobalSettingsFromFirestore({ noCache: true });
  if (!masterSettingsRes.ok || !masterSettingsRes.data) {
    console.log('[DailyDigest] Master settings fetch failed; skipping service.');
    return;
  }
  if (masterSettingsRes.data.emailAlertsEnabled === false) {
    console.log('[DailyDigest] Master switch (emailAlertsEnabled) is OFF; skipping all sends.');
    return;
  }

  // 3) Global Data Retrieval (Fetch once for all users)
  console.log('[DailyDigest] Fetching global hit data...');
  const moversHitsRes = _fetchFirestoreDocument_(DAILY_MOVERS_HITS_DOC_SEGMENTS, { noCache: true });
  const moversHits = (moversHitsRes && moversHitsRes.ok && moversHitsRes.data) ? moversHitsRes.data : { upHits: [], downHits: [] };
  
  const hiloHitsRes = _fetchFirestoreDocument_(DAILY_HILO_HITS_DOC_SEGMENTS, { noCache: true });
  const hiloHits = (hiloHitsRes && hiloHitsRes.ok && hiloHitsRes.data) ? hiloHitsRes.data : { highHits: [], lowHits: [] };
  
  const customHitsRes = _fetchFirestoreDocument_(DAILY_CUSTOM_HITS_DOC_SEGMENTS, { noCache: true });
  const customHits = (customHitsRes && customHitsRes.ok && customHitsRes.data) ? customHitsRes.data : { hits: [] };

  const sydneyDateStr = Utilities.formatDate(new Date(), ASX_TIME_ZONE, 'dd-MM-yyyy');
  const num = v => (v!=null && isFinite(v)) ? Number(v) : null;

  // 4) HTML Helper Functions
  function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
  function td(v){ return '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' + esc(v==null?'' : v) + '</td>'; }
  function fmtMoney(n){ const x = num(n); return x==null? '' : ('$' + x.toFixed(x<1?4:2)); }
  function fmtPct(n){ const x = num(n); return x==null? '' : ((x>=0?'+':'') + x.toFixed(2) + '%'); }

  function createTable(title, rows, headersHtml, color) {
    if (!rows || rows.length === 0) return '';
    const headerStyle = `margin:16px 0 0 0;padding:10px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;background-color:${color || '#333'};font-size:14px;font-weight:bold;border-radius:4px 4px 0 0;`;
    return (
      `<h3 style="${headerStyle}">` + esc(title) + '</h3>' +
      '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;font-size:13px;border:1px solid ' + (color || '#eee') + ';border-top:none;">' +
        '<thead><tr style="text-align:left;background:#f9f9f9;color:#555;">' + headersHtml + '</tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody>' +
      '</table>'
    );
  }

  // 5) Prepare Raw Global Data (Fetched once)
  const allDown = Array.isArray(moversHits.downHits) ? moversHits.downHits : [];
  const allUp = Array.isArray(moversHits.upHits) ? moversHits.upHits : [];
  const allLows = Array.isArray(hiloHits.lowHits) ? hiloHits.lowHits : [];
  const allHighs = Array.isArray(hiloHits.highHits) ? hiloHits.highHits : [];

  const hdrMovers = td('Code')+td('Name')+td('Price')+td('% Change')+td('Δ');
  const hdrHiLo = td('Code')+td('Name')+td('Price')+td('52W Low')+td('52W High');
  const hdrCustom = td('Code')+td('Name')+td('Price')+td('Target')+td('Direction')+td('Intent');

  // 6) Iterate Users & Send Personalized Emails
  console.log('[DailyDigest] Listing users for personalized delivery...');
  const userListRes = _listFirestoreCollection_(['artifacts', APP_ID, 'users']);
  if (!userListRes.ok || !userListRes.docs) {
    console.log('[DailyDigest] User list fetch failed: ' + userListRes.error);
    return;
  }

  let sendCount = 0;
  userListRes.docs.forEach(uDoc => {
    try {
      const userId = (uDoc.name || '').split('/').pop();
      if (!userId) return;

      // Fetch User Preferences (Path: artifacts/{APP_ID}/users/{userId}/preferences/config)
      const prefPath = ['artifacts', APP_ID, 'users', userId, 'preferences', 'config'];
      const prefRes = _fetchFirestoreDocument_(prefPath, { noCache: true });
      if (!prefRes.ok || !prefRes.data) return;

      const prefs = prefRes.data;
      const emailEnabled = prefs.dailyEmail === true;
      const recipient = (prefs.alertEmailRecipients || '').trim();
      if (!emailEnabled || !recipient) return;

      // Individual Threshold Extraction (Scanner Rules)
      const rules = prefs.scannerRules || {};
      const t = {
        upPct: num(rules.up && rules.up.percentThreshold),
        upDol: num(rules.up && rules.up.dollarThreshold),
        downPct: num(rules.down && rules.down.percentThreshold),
        downDol: num(rules.down && rules.down.dollarThreshold),
        minPrice: num(rules.minPrice),
        hiloPrice: num(rules.hiloMinPrice)
      };

      // Helper: Does mover qualify for this specific user?
      const qualifies = (o) => {
        const live = num(o.live);
        if (t.minPrice && live < t.minPrice) return false;
        const pct = Math.abs(num(o.pct)||0);
        const dol = Math.abs(num(o.change)||0);
        if (o.direction === 'up') {
          return (t.upPct && pct >= t.upPct) || (t.upDol && dol >= t.upDol) || (!t.upPct && !t.upDol);
        } else {
          return (t.downPct && pct >= t.downPct) || (t.downDol && dol >= t.downDol) || (!t.downPct && !t.downDol);
        }
      };

      // Filter Movers
      const userDown = allDown.filter(qualifies).sort((a,b)=> Math.abs(num(b.pct)||0) - Math.abs(num(a.pct)||0));
      const userUp = allUp.filter(qualifies).sort((a,b)=> (num(b.pct)||0) - (num(a.pct)||0));
      
      // Filter 52-Week Hits
      const userLows = allLows.filter(o => !t.hiloPrice || num(o.live) >= t.hiloPrice).sort((a,b)=> (num(b.live)||0) - (num(a.live)||0));
      const userHighs = allHighs.filter(o => !t.hiloPrice || num(o.live) >= t.hiloPrice).sort((a,b)=> (num(b.live)||0) - (num(a.live)||0));

      // Build Mover Map for Personal Alerts Validation
      const moverMap = new Map();
      allUp.concat(allDown).forEach(m => moverMap.set(m.code, m));

      // Filter User-Specific Custom Triggers
      const userCustomHits = (Array.isArray(customHits.hits) ? customHits.hits : [])
        .filter(h => h.userId === userId)
        .filter(h => {
          // 1. Always show manual target hits
          if (h.intent === 'target-hit') return true;
          
          // 2. For Movers: Must match User's Thresholds
          if (h.intent === 'mover') {
            const rich = moverMap.get(h.code);
            // If we can't find the rich data, we default to filtering it OUT (safety) 
            // or we could check 'live' vs 'prev' if we had it, but 'qualifies' needs pct/change.
            // Since it came from duplicateMoversIntoCustom_, it SHOULD be in allUp/allDown.
            if (!rich) return false;
            return qualifies(rich);
          }

          // 3. For 52-Week: Must match Min Price rule
          if (h.intent === '52w-high' || h.intent === '52w-low') {
             if (t.hiloPrice && num(h.live) < t.hiloPrice) return false;
             return true;
          }

          // Default: allow other unknown intents? Or strict? 
          // Strict is safer to reduce noise.
          return false; 
        })
        .map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtMoney(o.target))+td(o.direction)+td(o.intent)+'</tr>');

      // Assemble Tables (Order: Personal > 52W Low > 52W High > Losers > Gainers)
      const sections = [
        createTable('Your Personal Alerts', userCustomHits, hdrCustom, '#1976d2'), // Blue
        createTable('52-Week Lows', userLows.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtMoney(o.low52))+td(fmtMoney(o.high52))+'</tr>'), hdrHiLo, '#d32f2f'), // Red
        createTable('52-Week Highs', userHighs.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtMoney(o.low52))+td(fmtMoney(o.high52))+'</tr>'), hdrHiLo, '#388e3c'), // Green
        createTable('Global Movers — Losers', userDown.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtPct(o.pct))+td(fmtMoney(o.change))+'</tr>'), hdrMovers, '#e53935'), // Red (lighter/distinct or same?) - Let's use similar Red
        createTable('Global Movers — Gainers', userUp.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtPct(o.pct))+td(fmtMoney(o.change))+'</tr>'), hdrMovers, '#43a047')  // Green
      ].filter(s => !!s);

      if (sections.length === 0) {
        console.log(`[DailyDigest] No qualifying hits for ${recipient}; skipping email.`);
        return;
      }

      // Final Assembly
      const counts = `Movers: ${userUp.length+userDown.length} | 52-Week: ${userHighs.length+userLows.length} | Personal: ${userCustomHits.length}`;
      const subject = `${GAS_CONFIG.EMAIL.SUBJECT_PREFIX} — ${sydneyDateStr} (${counts})`;
      const htmlBody = (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.4;max-width:800px;margin:auto;">' +
        `<h2 style="margin:0 0 12px 0;color:#1a73e8;">${GAS_CONFIG.EMAIL.SUBJECT_PREFIX} — ${esc(sydneyDateStr)}</h2>` +
        sections.join('<div style="height:20px;"></div>') +
        '<div style="margin-top:24px;color:#888;font-size:11px;border-top:1px solid #eee;padding-top:12px;">' +
        GAS_CONFIG.EMAIL.FOOTER_TEXT +
        '</div></div>'
      );

      MailApp.sendEmail({ to: recipient, subject, htmlBody });
      sendCount++;
      console.log(`[DailyDigest] Sent to: ${recipient} (UID: ${userId}) [${counts}]`);

    } catch (userErr) {
      console.log(`[DailyDigest] Failed to process user ${uDoc.name}: ${userErr}`);
    }
  });

  console.log(`[DailyDigest] Completed. Total emails sent: ${sendCount}`);
}

// Public wrapper for trigger safety: Apps Script triggers call global functions.
function sendCombinedDailyDigest() {
  try { sendCombinedDailyDigest_(); }
  catch (e) { console.error('sendCombinedDailyDigest wrapper failed:', e); }
}

// Public wrapper for trigger: reconcile daily duplicates periodically
function reconcileCustomDuplicatesFromDailyHits() {
  try { reconcileCustomDuplicatesFromDailyHits_(); }
  catch (e) { console.error('reconcileCustomDuplicatesFromDailyHits wrapper failed:', e); }
}

// (Legacy alert helpers removed: fetchAllPriceData, fetchAlertRules, getSuppressionLog, processAlerts, sendAlertEmail)


// ===============================================================
// ================== TRIGGER MANAGEMENT HELPERS =================
// ===============================================================

function createTriggers() {
  // --- Helper: find triggers by handler name ---
  function _getTriggersByHandler_(handlerName) {
    return ScriptApp.getProjectTriggers().filter(t => {
      try { return t.getHandlerFunction && t.getHandlerFunction() === handlerName; } catch (_) { return false; }
    });
  }

  // --- Helper: ensure a time-based trigger exists for a handler (idempotent) ---
  function _ensureTimeTrigger_(handlerName, scheduleFn) {
    const existing = _getTriggersByHandler_(handlerName);
    if (existing && existing.length > 0) {
      console.log('[Triggers] Existing trigger(s) found for ' + handlerName + ': ' + existing.length);
      // Clean up duplicates if more than one exists
      if (existing.length > 1) {
        for (let i = 1; i < existing.length; i++) {
          ScriptApp.deleteTrigger(existing[i]);
        }
        console.log('[Triggers] Cleaned up ' + (existing.length - 1) + ' redundant trigger(s) for ' + handlerName);
      }
      return;
    }
    // Always enforce Sydney timezone on the builder so project-level timezone is irrelevant.
    let builder = ScriptApp.newTrigger(handlerName).timeBased().inTimezone(ASX_TIME_ZONE);
    builder = scheduleFn && typeof scheduleFn === 'function' ? scheduleFn(builder) || builder : builder;
    builder.create();
    console.log('[Triggers] Created time-based trigger for ' + handlerName);
  }

  // --- 1) Essential Daily Triggers (Now Idempotent) ---
  // "Morning Prep" - Runs at 6:00 AM Sydney (2:00 AM Thailand).
  // Checks for trading day, then Resets Stats AND Captures Close (Zeros the day).
  _ensureTimeTrigger_('runDailyMorningPrep', b => b.everyDays(1).atHour(6).nearMinute(0));

  // --- 2) Fix Issue #2: Ensure Global Movers recurring trigger is active (idempotent) ---
  _ensureTimeTrigger_('runGlobalMoversScan', b => b.everyMinutes(10));

  // --- 4) Maintain API Fallback Columns (API_Price / API_PrevClose) ---
  // Run sporadically to patching broken Google Finance data without hitting quotas.
  // 30 minutes is a good balance for "Pro" users; 60 for free tiers. 
  // Yahoo Finance is used here (robust but should be used politely).
  _ensureTimeTrigger_('repairBrokenPrices', b => b.everyHours(1));
  // Ensure a recurring trigger exists for the correct function name
  _ensureTimeTrigger_('runGlobal52WeekScan', b => b.everyMinutes(30));

  // --- 4) Ensure a separate daily digest trigger at ~16:15 Sydney time (idempotent) ---
  // Force timezone to Australia/Sydney so this fires correctly regardless of project settings.
  _ensureTimeTrigger_('sendCombinedDailyDigest', b => b.inTimezone(ASX_TIME_ZONE).everyDays(1).atHour(16).nearMinute(15));

  // --- 5) REPLACED: Custom triggers scan now runs once daily inside daily digest ---
  // _ensureTimeTrigger_('runCustomTriggersScan', b => b.everyMinutes(15));
  
  // --- 6) REPLACED: Reconciliation now disabled as redundant for real-time badges ---
  // _ensureTimeTrigger_('reconcileCustomDuplicatesFromDailyHits', b => b.everyMinutes(30));

  console.log('Triggers ensured (market alerts unchanged; movers ensured; 52W ensured + stale removed).');
}

function deleteTriggers() {
  const all = ScriptApp.getProjectTriggers();
  all.forEach(t => { try { ScriptApp.deleteTrigger(t); } catch(_){} });
  console.log('All triggers deleted.');
}

// ===============================================================
// ================== PUBLIC PRICE FEED (doGet) ==================
// ===============================================================
// Provides a lightweight JSON (or JSONP) feed of current price data sourced
// from the Prices sheet for consumption by the web client. Designed to match
// the flexible field-name heuristics in priceService.js (ASXCode, CompanyName,
// LivePrice, PrevClose, High52, Low52, etc.).
//
// Query Params:
//   stockCode=ABC   (optional; returns only that code if present)
//   compact=true    (optional; omit less-used fields like MarketCap / PE)
//   callback=fnName (optional; JSONP wrapper to bypass strict CORS scenarios)
//
// NOTE: Apps Script Web Apps do not allow arbitrary custom CORS headers; for
// local development where the browser blocks reading the response, either:
//   1) Deploy this Web App with access = "Anyone" (anonymous) so the response
//      is a direct 200 JSON (not a login HTML redirect that triggers CORS), or
//   2) Use a CORS proxy (window.LIVE_PRICE_CORS_PROXY) already supported in
//      priceService.js, or
//   3) Use JSONP: append &callback=__priceFeedCb and adapt the client (optional).
//
// Security: Data here is non-sensitive market snapshot; ensure no user-specific
// fields are leaked. Only sheet-derived columns are exposed.

function doGet(e) {
  const startT = Date.now();
  try {
    // Support JSONP callbacks to allow browser clients to bypass strict CORS
    // preflight issues by using a <script> tag insertion as a fallback.
    // Usage: /exec?userId=...&callback=__myCallback
    const params = e && e.parameter ? e.parameter : {};
    const callback = params.callback ? String(params.callback).trim() : '';
    // If callback provided and a userId is present, attempt a synchronous sync and return JSONP.
    if (callback && params.userId) {
      const uid = String(params.userId);
      const res = syncUserProfileToCentralGlobalSettings(uid);
      const json = JSON.stringify(res || { ok: false, error: 'no-result' });
      const wrapped = callback + '(' + json + ');';
      return ContentService.createTextOutput(wrapped).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  // Otherwise behave as a price feed endpoint as before (non-JSONP GET)
  // reuse `params` and `callback` parsed above
  const requestedCode = params.stockCode ? String(params.stockCode).trim().toUpperCase() : '';
  const compact = params.compact === 'true' || params.compact === '1';

    const data = buildPriceFeedArray_(requestedCode, { compact });
    const elapsed = (Date.now() - startT) / 1000;
    
    // Inject debug meta
    if (!data.meta) data.meta = {};
    data.meta.executionTime = elapsed + 's';
    
    const json = JSON.stringify(data);

    // JSONP fallback if callback specified (callback variable parsed earlier)
    if (callback) {
      const wrapped = `${callback}(${json});`;
      return ContentService.createTextOutput(wrapped).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errorPayload = JSON.stringify({ error: true, message: String(err && err.message || err) });
    return ContentService.createTextOutput(errorPayload).setMimeType(ContentService.MimeType.JSON);
  }
}

function buildPriceFeedArray_(singleCode, options) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pricesOut = [];
  const dashboardOut = [];

  // Helper to process a specific sheet
  const processSheet = (sheetName, targetArray) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    const headers = values.shift();
    const map = headers.reduce((acc,h,i)=>{ acc[h] = i; return acc; }, {});

    function col(nameVariants) {
      for (let i=0;i<nameVariants.length;i++) {
        const n = nameVariants[i];
        if (map[n] != null) return map[n];
      }
      return null;
    }

    const idxCode = col(['ASX Code','ASXCode','Code']);
    const idxCompany = col(['Company Name','CompanyName','Name']);
    const idxLive = col(['LivePrice','Last','Last Price','LastPrice','Last Trade','LastTrade']);
    const idxPrev = col(['PrevDayClose','PrevClose','Previous Close','Last Close']);
    const idxHigh52 = col(['High52','52WeekHigh','High 52','52 High']);
    const idxLow52 = col(['Low52','52WeekLow','Low 52','52 Low']);
    const idxMktCap = col(['MarketCap','Market Cap']);
    const idxPE = col(['PE','PE Ratio']);
    
    // Column Mapping with Fuzzy Logic
    const findFuzzy = (patterns) => {
      const idx = headers.findIndex(h => {
        if (!h) return false;
        const clean = String(h).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return patterns.some(p => clean === p);
      });
      return idx !== -1 ? idx : null;
    };

    const apiPriceIdx = findFuzzy(['APIPRICE', 'PIPRICE']);
    const apiHighIdx = findFuzzy(['APIHIGH', 'PIHIGH', 'API52WHIGH', 'PI52WHIGH', 'APIHIGH52', 'PIHIGH52']);
    const apiLowIdx = findFuzzy(['APILOW', 'PILOW', 'API52WLOW', 'PI52WLOW', 'APILOW52', 'PILOW52']);

    const idxSector = col(['Sector', 'Category']);
    const idxIndustry = col(['Industry']);

    values.forEach(r => {
      const rawCode = idxCode != null ? r[idxCode] : '';
      if (!rawCode) return;
      const code = String(rawCode).trim().toUpperCase();
      if (!code) return;
      if (singleCode && code !== singleCode) return;
      function num(idx) {
        if (idx == null) return null;
        let v = r[idx];
        if (v === '' || v == null) return null;
        // Robustly handle strings with currency symbols (e.g. "$0.004")
        if (typeof v === 'string') {
          v = v.replace(/[^0-9.-]/g, '');
        }
        const n = parseFloat(v);
        return (isNaN(n) || !isFinite(n)) ? null : n;
      }

      let live = num(idxLive);
      
      // Recovery Logic: If Google returns 0 or null, check the API_Price column
      if ((live === 0 || live == null) && apiPriceIdx != null) {
        const fallback = parseFloat(r[apiPriceIdx]);
        if (fallback != null && !isNaN(fallback) && fallback > 0) {
          live = fallback;
        }
      }

      let prevClose = num(idxPrev);
      // PrevClose Recovery
      const apiPrevIdx = findFuzzy(['APIPREVCLOSE', 'APIPREVIOUSCLOSE', 'PIPREVCLOSE']);
      if ((prevClose === 0 || prevClose == null) && apiPrevIdx != null) {
          const val = parseFloat(r[apiPrevIdx]);
          if (val > 0) prevClose = val;
      }

      // 52-Week Recovery
      let high52 = num(idxHigh52);
      if ((high52 === 0 || high52 == null) && apiHighIdx != null) {
          const val = parseFloat(r[apiHighIdx]);
          if (val > 0) high52 = val;
      }

      let low52 = num(idxLow52);
      if ((low52 === 0 || low52 == null) && apiLowIdx != null) {
          const val = parseFloat(r[apiLowIdx]);
          if (val > 0) low52 = val;
      }

      // FINAL FALLBACK: Proxy from Live Price
      if (live > 0) {
        if (high52 === 0 || high52 == null) high52 = live;
        if (low52 === 0 || low52 == null) low52 = live;
        
        // Sanity Check
        if (live > high52) high52 = live;
        if (live < low52) low52 = live;
      }

      const obj = {
        ASXCode: code,
        CompanyName: idxCompany!=null ? (r[idxCompany] || null) : null,
        LivePrice: live,
        PrevClose: prevClose,
        High52: high52,
        Low52: low52
      };
      if (!options || !options.compact) {
        if (idxMktCap != null) obj.MarketCap = num(idxMktCap);
        if (idxPE != null) obj.PE = num(idxPE);
      }

      // SECTOR & INDUSTRY
      if (idxSector != null) {
        const s = r[idxSector];
        if (s && String(s).trim()) obj.Sector = String(s).trim();
      }
      if (idxIndustry != null) {
        const i = r[idxIndustry];
        if (i && String(i).trim()) obj.Industry = String(i).trim();
      }

      targetArray.push(obj);
    });
  };

  // Process both sheets into separate buckets
  processSheet(PRICE_SHEET_NAME, pricesOut);
  processSheet(DASHBOARD_SHEET_NAME, dashboardOut);

  return {
    prices: pricesOut,
    dashboard: dashboardOut
  };
}

// ===============================================================
// ================= FINAL PRICE RECOVERY TOOLS ==================
// ===============================================================

/** 
 * Internal helper to fetch multiple prices from Yahoo Chart API 
 * @param {string[]} tickers Array of tickers like ["CBA.AX", "FMG.AX"]
 * @returns {Object} Map of ticker -> price
 */
function fetchBulkYahooPrices_(tickers) {
  const requests = tickers.map(t => ({
    url: `https://query1.finance.yahoo.com/v8/finance/chart/${t}`,
    muteHttpExceptions: true
  }));
  
  const responses = UrlFetchApp.fetchAll(requests);
  const out = {};
  
  responses.forEach((resp, idx) => {
    const ticker = tickers[idx];
    if (resp.getResponseCode() === 200) {
      try {
        const data = JSON.parse(resp.getContentText());
        const result = data.chart.result[0];
        const price = result.meta.regularMarketPrice;
        const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
        
        if (price != null) {
          out[ticker] = {
            price: price,
            prevClose: prevClose,
            high52: result.meta.fiftyTwoWeekHigh,
            low52: result.meta.fiftyTwoWeekLow
          };
        }
      } catch (e) {}
    }
  });
  
  return out;
}

/**
 * Sweeps the 'Prices' AND 'Dashboard' sheets for broken prices (0 or #N/A)
 * and attempts to "repair" them using Yahoo Finance data.
 */
function repairBrokenPrices() {
  repairSheet_('Prices');
  Utilities.sleep(1000); // Pause between sheets
  repairSheet_('Dashboard');
  Logger.log('Global repair cycle complete.');
}

/**
 * Internal helper to repair a specific sheet.
 */
/**
 * Internal helper to repair a specific sheet.
 * ARCHITECTURAL RULE:
 * 1. 'Dashboard': Pure API-driven. Writes DIRECTLY to LivePrice/PrevClose/etc. (No formulas to protect).
 * 2. 'Prices' (or others): Formula-driven. Writes ONLY to API_* columns. (Protects GoogleFinance formulas).
 */
function repairSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { Logger.log('Skipping ' + sheetName + ': Sheet not found'); return; }
  
  // Policy Determination
  const isDashboard = (sheetName === 'Dashboard');
  const policy = isDashboard ? 'DIRECT_OVERWRITE' : 'SAFE_FALLBACK';
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  const rawHeaders = data[0];
  const headers = rawHeaders.map(h => String(h).replace(/[^A-Z0-9]/gi, '').toUpperCase());
  
  const findIdx = (pattern) => headers.findIndex(h => pattern.test(String(h)));
  const codeIdx = headers.indexOf('ASXCODE') !== -1 ? headers.indexOf('ASXCODE') : headers.indexOf('CODE');
  
  // Standard Columns
  const priceIdx = headers.findIndex(h => ['LIVEPRICE', 'LAST', 'LASTPRICE', 'LASTTRADE', 'PRICE', 'CURRENT'].includes(h));
  const prevIdx = headers.findIndex(h => ['PREVCLOSE','PREVDAYCLOSE','PREVIOUSCLOSE','LASTCLOSE'].includes(h));
  const highIdx = headers.findIndex(h => ['HIGH52','52WEEKHIGH','HIGH52WEEK'].includes(h));
  const lowIdx = headers.findIndex(h => ['LOW52','52WEEKLOW','LOW52WEEK'].includes(h));

  // Fallback API Columns
  const apiPriceIdx = findIdx(/api.*price/i) || findIdx(/price.*api/i) || findIdx(/pi.*price/i);
  const apiPrevIdx = findIdx(/api.*prev/i) || findIdx(/prev.*api/i) || findIdx(/pi.*prev/i);
  const apiHighIdx = findIdx(/api.*high/i) || findIdx(/high.*api/i) || findIdx(/api.*hi/i);
  const apiLowIdx = findIdx(/api.*low/i) || findIdx(/low.*api/i) || findIdx(/api.*lo/i);
  
  // Target Determination based on Policy
  let targetPrice = -1, targetPrev = -1, targetHigh = -1, targetLow = -1;

  if (policy === 'DIRECT_OVERWRITE') {
    // Dashboard: Write to primary columns
    targetPrice = priceIdx;
    targetPrev = prevIdx;
    targetHigh = highIdx;
    targetLow = lowIdx;
  } else {
    // Safe Mode: Write to API columns only
    targetPrice = apiPriceIdx;
    targetPrev = apiPrevIdx;
    targetHigh = apiHighIdx;
    targetLow = apiLowIdx;
    
    // Safety Abort
    if (targetPrice === -1) {
      Logger.log('[' + sheetName + '] Skipped repair: No "API Price" fallback column found. Protecting formulas.');
      return;
    }
  }
  
  if (codeIdx === -1 || targetPrice === -1) {
    Logger.log('[' + sheetName + '] Skipped: Missing target columns for ' + policy + ' mode.');
    return;
  }

  const problems = [];
  // Read formulas to protect them
  const formulas = sheet.getDataRange().getFormulas();

  // Skip header, start at row 2
  for (let i = 1; i < data.length; i++) {
    const codeRaw = data[i][codeIdx];
    // For Dashboard, we always update everything (it's a feed). 
    // For Prices, we only check for broken/missing values.
    const priceVal = (priceIdx !== -1) ? data[i][priceIdx] : null;

    // PROTECTION: Check if target cell has a formula
    let hasFormula = false;
    if (priceIdx !== -1 && formulas[i] && formulas[i][priceIdx] && formulas[i][priceIdx].toString().startsWith('=')) {
      hasFormula = true;
    }
    
    // Definition of 'Needs Update':
    // Dashboard: Always update UNLESS it has a formula.
    // Prices: Only if broken (0, blank, error).
    let needsUpdate = false;
    
    if (policy === 'DIRECT_OVERWRITE') {
       needsUpdate = !hasFormula; // Always fetch fresh for dashboard, respecting formulas
    } else {
       // Safe Mode: Check if primary is broken
       const isExplicitError = (typeof priceVal === 'string' && (priceVal.includes('INVALID') || priceVal.includes('DELISTED') || priceVal.includes('ERROR')));
       const isPriceBroken = !isExplicitError && (priceVal === 0 || priceVal === '' || isNaN(priceVal) || (typeof priceVal === 'string')); 
       needsUpdate = isPriceBroken && !hasFormula;
    }
    
    if (codeRaw && needsUpdate) {
        let ticker = String(codeRaw).trim().toUpperCase();
        ticker = ticker.replace(/\u00A0/g, ' ').trim();
        if (ticker.indexOf(':') !== -1) ticker = ticker.split(':')[1];
        if (/^[A-Z0-9]+$/.test(ticker)) ticker += '.AX';
        problems.push({ row: i + 1, code: ticker });
    }
  }
  
  if (problems.length === 0) return;
  
  Logger.log('[' + sheetName + '] Updating ' + problems.length + ' items (' + policy + ')...');
  
  // Process in batches
  for (let i = 0; i < problems.length; i += 50) {
    const batch = problems.slice(i, i + 50);
    const tickers = batch.map(p => p.code);
    
    try {
      const results = {};
      // ... (Rest of fetch logic remains similar, assuming standard Yahoo fetch)
      const requests = tickers.map(t => ({
        url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(t),
        muteHttpExceptions: true
      }));
      
      const responses = UrlFetchApp.fetchAll(requests);
      responses.forEach((resp, idx) => {
        const ticker = tickers[idx];
        const code = resp.getResponseCode();
        if (code === 200) {
          try {
            const json = JSON.parse(resp.getContentText());
            const meta = json.chart.result[0].meta;
            let safePrice = meta.regularMarketPrice;
            const safePrev = meta.chartPreviousClose || meta.previousClose;
            if (safePrice == null && safePrev != null) safePrice = safePrev;
            let status = 'OK';
            if (safePrice === 0 || safePrice == null) status = 'DELISTED';

            results[ticker] = { status: 'OK', price: safePrice, prevClose: safePrev, high52: meta.fiftyTwoWeekHigh, low52: meta.fiftyTwoWeekLow };
          } catch(e) { results[ticker] = { status: 'ERROR' }; }
        } else { results[ticker] = { status: 'INVALID' }; }
      });
      
      batch.forEach(p => {
        const data = results[p.code];
        if (data && data.status === 'OK' && data.price != null) {
          sheet.getRange(p.row, targetPrice + 1).setValue(data.price).setBackground(null);
          if (targetPrev !== -1 && data.prevClose != null) sheet.getRange(p.row, targetPrev + 1).setValue(data.prevClose);
          if (targetHigh !== -1 && data.high52 != null) sheet.getRange(p.row, targetHigh + 1).setValue(data.high52);
          if (targetLow !== -1 && data.low52 != null) sheet.getRange(p.row, targetLow + 1).setValue(data.low52);
        } else if (data && data.status !== 'OK') {
           // For safe mode, we verify we are writing to API col before writing error status
           sheet.getRange(p.row, targetPrice + 1).setValue(data.status).setBackground(null);
        } else {
           // Clear if no data
           sheet.getRange(p.row, targetPrice + 1).clearContent();
        }
      });
      Logger.log('[' + sheetName + '] Batch ' + (i/50 + 1) + ' processed.');
    } catch (e) {
      Logger.log('[' + sheetName + '] Batch failed: ' + e.message);
    }
    Utilities.sleep(500); 
  }
}

// ===============================================================
// ================= SYSTEM MAINTENANCE TOOLS ====================
// ===============================================================

/**
 * RESTORE LIVE FORMULAS (MASTER RESET)
 * Replaces static numbers in key columns with Google Finance formulas for BOTH 
 * the 'Prices' and 'Dashboard' sheets.
 * 
 * STRATEGY FOR QUOTA MANAGEMENT:
 * 1. Primary: Use Google Finance Formulas (Free, Unlimited, fast updates).
 * 2. Fallback: 'repairBrokenPrices' script (Uses Yahoo API, has rate limits).
 * 
 * If you assume the sheet is "stuck", it's likely running 100% on the Fallback.
 * Running this function puts you back on the Primary engine, saving Yahoo quota.
 */
function restoreGoogleFinanceFormulas() {
  const sheetsToFix = ['Prices', 'Dashboard'];
  
  sheetsToFix.forEach(sheetName => {
    restoreFormulasForSheet_(sheetName);
  });
  
  Logger.log('✅ Master Reset Complete: All sheets restored to Google Formulas.');
}

/**
 * Helper to process a single sheet
 */
function restoreFormulasForSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { Logger.log(`⚠️ Skipped: Sheet "${sheetName}" not found.`); return; }
  
  Logger.log(`🔄 Scanning "${sheetName}" to restore formulas...`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  const headers = data[0].map(h => String(h).replace(/[^A-Z0-9]/gi, '').toUpperCase());
  
  // Robust Column Matching (matches logic in repairSheet_)
  const findIdx = (patterns) => headers.findIndex(h => patterns.includes(h));
  
  const codeIdx = headers.indexOf('ASXCODE') !== -1 ? headers.indexOf('ASXCODE') : headers.indexOf('CODE');
  
  const colMap = {
    'price': headers.findIndex(h => ['LIVEPRICE', 'LAST', 'LASTPRICE', 'LAST PRICE'].includes(h)),
    'closeyest': headers.findIndex(h => ['PREVCLOSE', 'PREVDAYCLOSE', 'PREVIOUSCLOSE', 'PREVIOUS CLOSE'].includes(h)),
    'pe': headers.findIndex(h => ['PE', 'PERATIO', 'PE RATIO'].includes(h)),
    'high52': headers.findIndex(h => ['HIGH52', '52WEEKHIGH', '52 WEEK HIGH'].includes(h)),
    'low52': headers.findIndex(h => ['LOW52', '52WEEKLOW', '52 WEEK LOW'].includes(h)),
    'marketcap': headers.findIndex(h => ['MARKETCAP', 'MCAP', 'MARKET CAP'].includes(h))
  };

  if (codeIdx === -1) { Logger.log(`❌ Error: ASX Code not found in "${sheetName}".`); return; }

  // Prepare batch updates
  const batches = {};
  Object.keys(colMap).forEach(key => {
    if (colMap[key] !== -1) batches[key] = [];
  });

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const code = data[i][codeIdx];
    let ticker = '';
    
    if (code) {
      ticker = String(code).trim().toUpperCase();
      // Ensure format "ASX:ABC" for Google Finance
      if (ticker.indexOf(':') === -1) {
        ticker = ticker.replace(/\.AX$/i, ''); // Strip Yahoo suffix
        ticker = 'ASX:' + ticker; // Add Google prefix
      }
      count++;
    }

    // For each found column, prepare the formula
    Object.keys(batches).forEach(attr => {
      // If we have a ticker, give it a formula. If not, empty string.
      // Special handling: PE isn't always available, but we try anyway.
      if (ticker) {
        batches[attr].push([`=GOOGLEFINANCE("${ticker}", "${attr}")`]);
      } else {
        batches[attr].push(['']);
      }
    });
  }

  // Apply batches to sheet
  Object.keys(batches).forEach(attr => {
    const colIndex = colMap[attr];
    const formulaPayload = batches[attr];
    // Only write if column exists and we have data
    if (colIndex !== -1 && formulaPayload.length > 0) {
      // Validate range height matches payload
      if (formulaPayload.length === (data.length - 1)) {
         sheet.getRange(2, colIndex + 1, formulaPayload.length, 1).setFormulas(formulaPayload);
         Logger.log(`   Restored ${attr} column (Col ${colIndex+1})`);
      }
    }
  });
  
  Logger.log(`   Processed ${count} rows in "${sheetName}".`);
}

/**
 * SYSTEM HEALTH CHECK
 * Run this to verify that:
 * 1. Triggers are active.
 * 2. Sheets are correctly using Google Formulas.
 * 3. Prices are fetching correctly.
 */
function verifySystemHealth() {
  const report = [];
  report.push('=== SYSTEM HEALTH CHECK ===');
  
  // 1. CHECK TRIGGERS
  const triggers = ScriptApp.getProjectTriggers();
  report.push(`Triggers Active: ${triggers.length}`);
  const handlers = triggers.map(t => t.getHandlerFunction());
  const essential = ['repairBrokenPrices', 'captureDailyClosePrice', 'dailyResetTrigger'];
  essential.forEach(h => {
    const exists = handlers.includes(h);
    report.push(` - ${h}: ${exists ? '✅ OK' : '❌ MISSING'}`);
  });

  // 2. CHECK SHEETS
  const checkSheet = (name) => {
    report.push(`\n[Checking "${name}" Sheet]`);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) {
      report.push('❌ Sheet not found!');
      return;
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      report.push('⚠️ Sheet empty or only header.');
      return;
    }
    
    // Check LivePrice Column
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerStr = headers.map(h => String(h).replace(/[^A-Z0-9]/gi, '').toUpperCase());
    const priceIdx = headerStr.findIndex(h => ['LIVEPRICE', 'LAST', 'LASTPRICE'].includes(h));
    
    if (priceIdx === -1) {
      report.push('❌ "LivePrice" column not found.');
      return;
    }
    
    const range = sheet.getRange(2, priceIdx + 1, lastRow - 1, 1);
    const formulas = range.getFormulas();
    const values = range.getValues();
    
    let formulaCount = 0;
    let numberCount = 0;
    let errorCount = 0; // #N/A or strings
    
    for (let i = 0; i < values.length; i++) {
      if (formulas[i][0] && formulas[i][0].startsWith('=')) formulaCount++;
      const val = values[i][0];
      if (typeof val === 'number' && val > 0) numberCount++;
      if (val === '#N/A' || val.toString().includes('Error')) errorCount++; // Loose string check
    }
    
    const total = values.length;
    report.push(`Total Rows: ${total}`);
    report.push(`Live Formulas: ${formulaCount} (${Math.round(formulaCount/total*100)}%) ${formulaCount > total*0.9 ? '✅' : '⚠️ Use Restore'}`);
    report.push(`Valid Prices:  ${numberCount} (${Math.round(numberCount/total*100)}%)`);
    report.push(`Errors (#N/A): ${errorCount}`);
  };

  checkSheet('Prices');
  checkSheet('Dashboard');

  console.log(report.join('\n'));
}

/**
 * SETUP DASHBOARD LIST
 * Wipes the 'Dashboard' sheet and repopulates it with the clean, standardized
 * list of Indices, Currencies, and Commodities.
 * 
 * Includes a placeholder for ASX 300 (User to fill code later).
 */
function setupDashboardList() {
  const SHEET_NAME = 'Dashboard';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    console.log('Error: Dashboard sheet not found');
    return;
  }
  
  // 1. The Clean List (Ordered)
  const items = [
    // --- AUSTRALIA ---
    { code: '^AXJO', name: 'ASX 200' },
    { code: '^AORD', name: 'All Ords' },
    { code: 'XKO',   name: 'ASX 300' }, // Placeholder per request
    { code: 'YAP=F', name: 'ASX SPI 200 Futures' },
    
    // --- USA & GLOBAL ---
    { code: '^GSPC', name: 'S&P 500 (US)' },
    { code: '^DJI',  name: 'Dow Jones (US)' },
    { code: '^IXIC', name: 'NASDAQ (US)' },
    { code: '^VIX',  name: 'Volatility Index' },
    { code: '^FTSE', name: 'FTSE 100 (UK)' },
    { code: '^STOXX50E', name: 'EURO STOXX 50 (EU)' },
    { code: '^N225', name: 'Nikkei 225 (Japan)' },
    { code: '^HSI',  name: 'Hang Seng (HK)' },
    
    // --- CURRENCIES ---
    { code: 'AUDUSD=X', name: 'AUD / USD' },
    { code: 'AUDTHB=X', name: 'AUD / THB' },
    { code: 'AUDGBP=X', name: 'AUD / GBP' },
    { code: 'AUDEUR=X', name: 'AUD / EUR' },
    { code: 'AUDJPY=X', name: 'AUD / JPY' },
    { code: 'AUDNZD=X', name: 'AUD / NZD' },
    { code: 'USDTHB=X', name: 'USD / THB' },
    
    // --- CRYPTO ---
    { code: 'BTC-AUD', name: 'Bitcoin (AUD)' },
    { code: 'BTC-USD', name: 'Bitcoin (USD)' },
    
    // --- COMMODITIES ---
    { code: 'GC=F',  name: 'Gold Futures' },
    { code: 'SI=F',  name: 'Silver Futures' },
    { code: 'HG=F',  name: 'Copper Futures' },
    { code: 'CL=F',  name: 'Crude Oil (WTI)' },
    { code: 'BZ=F',  name: 'Brent Crude Oil' },
    { code: 'TIO=F', name: 'Iron Ore' }
  ];
  
  // 2. Prepare Data Grid and Headers
  // Standard Dashboard columns ONLY (No API prefix columns needed for Direct Overwrite)
  const values = [['Code', 'Name', 'LivePrice', 'Change', 'PctChange', 'PrevClose', 'High52', 'Low52']];
  
  items.forEach(item => {
    values.push([item.code, item.name, '', '', '', '', '', '']);
  });
  
  // 3. Write to Sheet (Atomic Clear + Set)
  sheet.clear();
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  
  // 4. Formatting
  // 4. Formatting (Headers)
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  sheet.setFrozenRows(1);
  
  console.log(`✅ Dashboard reset with ${items.length} items.`);
  console.log('🔄 Triggering repair to fetch prices...');
  
  // 5. Trigger Fetch immediately
  repairBrokenPrices();
}


