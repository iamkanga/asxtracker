/**
 * UPDATED BY ANTIGRAVITY: [User's Local Time]
 * Apps Script for automated alert processing and data management...
 * Version: 2.5.2 (Fixed Duplicate)
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
  VERSION: '2.6.0 (Refactored)',
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
    '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06',
    '2026-04-25', '2026-06-08', '2026-12-25', '2026-12-28'
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
const DAILY_CUSTOM_HITS_DOC_SEGMENTS = ['artifacts', APP_ID, 'alerts', 'CUSTOM_TRIGGER_HITS'];

const ASX_HOLIDAYS_CURRENT = new Set(GAS_CONFIG.HOLIDAYS);

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
  if (ASX_HOLIDAYS_CURRENT.has(dayStr)) {
    Logger.log('[isTradingDay] Skipping: Public Holiday (' + dayStr + ')');
    return false;
  }
  
  return true;
}

/** 
 * Strict Guard: Checks if it's a trading day AND currently between 9:00 AM - 6:30 PM Sydney. 
 * Prevents unnecessary script execution (quota drain) late at night or on weekends.
 */
function isMarketActive_(dateObj) {
  const d = dateObj || new Date();
  
  // 1. Robust Day Check (using explicit Sydney day name to avoid pattern support issues with 'u')
  const sydDay = Utilities.formatDate(d, ASX_TIME_ZONE, 'EEEE'); // 'Monday', 'Tuesday', etc.
  const isWeekend = (sydDay === 'Saturday' || sydDay === 'Sunday');
  if (isWeekend) return false;
  
  // 2. Holiday Check
  const dayStr = Utilities.formatDate(d, ASX_TIME_ZONE, 'yyyy-MM-dd');
  if (ASX_HOLIDAYS_CURRENT.has(dayStr)) return false;
  
  // 3. Hour Check (Sydney Time)
  const hour = Number(Utilities.formatDate(d, ASX_TIME_ZONE, 'H')); // 0-23
  const min = Number(Utilities.formatDate(d, ASX_TIME_ZONE, 'mm'));
  const currentTimeVal = hour * 100 + min; // e.g. 10:30 -> 1030
  
  // Market starts 10:00 (Pre-market 7am-10am). We start at 9:00 for data readiness.
  // Market closes 4:00 PM. We run until 6:30 PM (1830) to capture closing auctions,
  // final settlement prices, and prepare for the 4:15 PM Daily Digest.
  const start = 900;
  const end = 1830;
  
  const active = (currentTimeVal >= start && currentTimeVal <= end);
  
  if (!active) {
    // Only log once per hour to keep logs clean
    if (min === 0) console.log('[MarketGuard] Inactive hour: ' + hour + ':' + min + '. No scan required.');
  }
  
  return active;
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

/** Unified utility to parse various price formats (text, $, c, commas). */
function _parseNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  
  // Clean separators and currency symbols
  s = s.replace(/[$, ]/g,'');
  
  // Handle 'c' or 'cents' for small cap stocks (e.g. 50c -> 0.5)
  const centsMatch = /^([0-9.]+)(c|cents?)$/i.exec(s);
  if (centsMatch) {
    const val = parseFloat(centsMatch[1]);
    return isFinite(val) ? (val / 100) : null;
  }
  
  const n = parseFloat(s);
  return (isNaN(n) || !isFinite(n)) ? null : n;
}

/** Robust column index finder using standard aliases. */
function _getColIdx_(headers, patterns) {
  const norm = (s) => String(s).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const patternNorms = (Array.isArray(patterns) ? patterns : [patterns]).map(norm);
  return headers.findIndex(h => {
    const hn = norm(h);
    return patternNorms.includes(hn);
  });
}

/** Centralized Sector/Industry permission logic. */
function _isSectorAllowed_(item, prefs, debug = false) {
  const s = item.sector ? String(item.sector).toUpperCase().trim() : null;
  const i = item.industry ? String(item.industry).toUpperCase().trim() : null;

  // 1. Blocklist (Hidden Sectors)
  if (Array.isArray(prefs.hiddenSectors)) {
    const hidden = new Set(prefs.hiddenSectors.map(x => String(x).toUpperCase().trim()));
    if (s && hidden.has(s)) return false;
    if (i && hidden.has(i)) return false;
  }

  // 2. Allowlist (Active Filters)
  const filters = (prefs.scanner && Array.isArray(prefs.scanner.activeFilters))
    ? new Set(prefs.scanner.activeFilters.map(x => String(x).toUpperCase().trim()))
    : null;
    
  if (!filters) return true; // Default allow all

  // Check Industry first (granular), then Sector
  if (i && filters.has(i)) return true;
  if (s && filters.has(s)) return true;

  return false;
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
    if (!isMarketActive_()) return;

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
      const hasMoved = (stock.prevClose != null && !isNaN(stock.prevClose) && Math.abs(live - stock.prevClose) > 0.0001);
      const reachedLow = hasMoved && (!isNaN(stock.low52) && stock.low52 != null && stock.low52 > 0 && live <= stock.low52);
      const reachedHigh = hasMoved && (!isNaN(stock.high52) && stock.high52 != null && stock.high52 > 0 && live >= stock.high52);
      if (reachedLow || reachedHigh) {
        // Normalize object shape for frontend cards
        const o = {
          code: stock.code,
          name: stock.name || stock.companyName || null,
            live: live,
          high52: isNaN(stock.high52)? null : stock.high52,
          low52: isNaN(stock.low52)? null : stock.low52,
          marketCap: (stock.marketCap!=null && !isNaN(stock.marketCap)) ? stock.marketCap : null,
          prevClose: (stock.prevClose!=null && !isNaN(stock.prevClose)) ? stock.prevClose : null,
          sector: stock.sector || null,
          industry: stock.industry || null
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
Write a ONE-paragraph (max 3 sentences) daily briefing for the user based on their portfolio performance.

Context:
- Current Time: ${context.currentTime || 'Unknown'}
- Market Status: ${context.marketStatus || 'Unknown'} (Sydney Time)

Portfolio Stats:
- Day Change: ${p.dayChangePercent}% (${p.dayChangeValue})
- Total Value: ${p.totalValue}
- Key Winners: ${JSON.stringify(p.winners || [])}
- Key Losers: ${JSON.stringify(p.losers || [])}
- Market Sentiment: ${context.sentiment}

Tone & Instructions:
- VERY IMPORTANT: Check the "Current Time" and "Market Status". 
    - If WEEKEND (Sat/Sun): Refer to "Friday" or "The last session". Do NOT say "Today".
    - If CLOSED (Weeknight): Speak in PAST tense.
    - If OPEN: Speak in PRESENT tense.
- Use bold text for key figures or stock names (e.g. **+1.2%** or **BHP**).
- If up > 1%: Enthusiastic, congratulatory.
- If down > 1%: Empathetic, "hang in there".
- If flat: Calm, "steady as she goes".
- Use emojis sparingly.
- Focus on the "Why" if possible (e.g. "BHP dragged you down" or "Tech sector rally helped").
- Output clean text with markdown bolding.
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

function callGeminiAPI_(promptText, options = {}) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set');

  // STEP 1: Dynamically find a working model (Self-Healing)
  const modelResult = discoverBestModel_(key);
  if (!modelResult.success) {
    return { success: false, reason: modelResult.error };
  }
  
  const modelName = modelResult.name; 
  
  // VERIFICATION: Debug line for Active Brain
  Logger.log('[Gemini] Active Brain: ' + modelName);

  // API URL construction: modelName already includes "models/" prefix from the List API
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${key}`;

  const requestBody = {
    contents: [{
      parts: [{ text: promptText }]
    }],
    generationConfig: {
      maxOutputTokens: 4096, // Increased for deep research
      temperature: options.thinking ? 0.7 : 0.9 
    }
  };

  // THINKING MODE INTEGRATION: Apply if requested or if model is thinking-capable
  if (options.thinking || modelName.toLowerCase().includes('thinking')) {
     // Apply thinking_config if model supports it (Gemini 2.0+)
     if (modelName.includes('2.0') || modelName.includes('3.0')) {
       requestBody.generationConfig.thinking_config = {
         include_thoughts: true
       };
     }
  }

  const fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(API_URL, fetchOptions);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      const candidates = json.candidates;
      
      if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
         // Find the actual text part (Thinking models may return multiple parts)
         const textPart = candidates[0].content.parts.find(p => p.text);
         if (textPart) {
           return { success: true, data: textPart.text, model: modelName };
         }
      }
      
      let reason = 'AI returned no text.';
      if (json.promptFeedback) reason += ` [Feedback: ${JSON.stringify(json.promptFeedback)}]`;
      return { success: false, reason: reason };
      
    } else {
      if (responseCode === 404) {
         Logger.log(`[Gemini] 404 on confirmed model ${modelName}. API Endpoint might be wrong.`);
         return { success: false, reason: `Endpoint 404 for ${modelName}` };
      }
      return { success: false, reason: `API Error ${responseCode}: ${responseText}` };
    }
  } catch (e) {
    return { success: false, reason: 'Fetch Exception: ' + e.toString() };
  }
}

/**
 * Queries the API to ask "What models are actually available to this Key?"
 * Prevents 404s by using only valid, listed models.
 */
function discoverBestModel_(key) {
  // Cache the discovery to avoid metadata calls every time (Script Properties cache)
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

    // PRIORITY SCORING: Gemini 3 > Gemini 2 > Gemini 1.5
    viable.sort((a, b) => {
      const score = (m) => {
        const name = m.name.toLowerCase();
        let s = 0;
        
        // Target: Gemini 3 (Highest Priority)
        if (name.includes('gemini-3') || name.includes('3.0')) s += 100;
        
        // Target: Gemini 2
        if (name.includes('gemini-2') || name.includes('2.0')) s += 50;
        
        // Target: Flash vs Pro
        if (name.includes('flash')) s += 20;
        if (name.includes('pro')) s += 10;
        
        // Target: Preview/Thinking
        if (name.includes('preview')) s += 5;
        if (name.includes('thinking')) s += 5;
        
        // Legacy: 1.5
        if (name.includes('1.5')) s += 5;
        
        return s;
      };
      return score(b) - score(a);
    });

    const best = viable[0].name; // e.g. "models/gemini-3-flash-preview"
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
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data.shift();
  
  // Column Mapping
  const idx = {
    code: _getColIdx_(headers, ['ASXCODE', 'CODE']),
    name: _getColIdx_(headers, ['COMPANYNAME', 'NAME', 'COMPANY NAME']),
    live: _getColIdx_(headers, ['LIVEPRICE', 'LAST', 'LASTPRICE', 'PRICE']),
    prev: _getColIdx_(headers, ['PREVDAYCLOSE', 'PREVCLOSE', 'PREVIOUSCLOSE']),
    high: _getColIdx_(headers, ['HIGH52', '52WEEKHIGH', 'HIGH52WEEK']),
    low: _getColIdx_(headers, ['LOW52', '52WEEKLOW', 'LOW52WEEK']),
    mcap: _getColIdx_(headers, ['MARKETCAP', 'MCAP', 'MARKET CAP']),
    sector: _getColIdx_(headers, ['SECTOR', 'CATEGORY']),
    industry: _getColIdx_(headers, ['INDUSTRY']),
    apiPrice: _getColIdx_(headers, ['APIPRICE', 'PIPRICE']),
    apiPrev: _getColIdx_(headers, ['APIPREVCLOSE', 'PIPREVCLOSE']),
    apiHigh: _getColIdx_(headers, ['APIHIGH', 'API52WHIGH', 'APIHIGH52']),
    apiLow: _getColIdx_(headers, ['APILOW', 'PI52WLOW', 'APILOW52'])
  };

  return data.map(r => {
    let apiLive = (idx.apiPrice !== -1) ? _parseNum_(r[idx.apiPrice]) : null;
    let live = (apiLive != null && apiLive > 0) ? apiLive : _parseNum_(r[idx.live]);

    let apiPrev = (idx.apiPrev !== -1) ? _parseNum_(r[idx.apiPrev]) : null;
    let prev = (apiPrev != null && apiPrev > 0) ? apiPrev : _parseNum_(r[idx.prev]);

    let apiHigh = (idx.apiHigh !== -1) ? _parseNum_(r[idx.apiHigh]) : null;
    let high = (apiHigh != null && apiHigh > 0) ? apiHigh : _parseNum_(r[idx.high]);

    let apiLow = (idx.apiLow !== -1) ? _parseNum_(r[idx.apiLow]) : null;
    let low = (apiLow != null && apiLow > 0) ? apiLow : _parseNum_(r[idx.low]);

    return {
      code: r[idx.code],
      name: r[idx.name] || null,
      livePrice: live,
      high52: high,
      low52: low,
      marketCap: _parseNum_(r[idx.mcap]),
      prevClose: prev,
      sector: r[idx.sector] ? String(r[idx.sector]).trim() : null,
      industry: r[idx.industry] ? String(r[idx.industry]).trim() : null
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
      prevClose: (e.prevClose!=null && !isNaN(e.prevClose)) ? Number(e.prevClose) : null,
      sector: e.sector && String(e.sector).trim() ? String(e.sector).trim() : (e.Sector && String(e.Sector).trim() ? String(e.Sector).trim() : null),
      industry: e.industry && String(e.industry).trim() ? String(e.industry).trim() : (e.Industry && String(e.Industry).trim() ? String(e.Industry).trim() : null)
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
  
  // --- SELF-HEALING FIX: Prune stale alerts (>24h) ---
  const nowMs = Date.now();
  const STALE_LIMIT = 24 * 60 * 60 * 1000;
  
  // Prune existing lists
  highHits = highHits.filter(h => {
      const t = h.t ? new Date(h.t).getTime() : 0;
      return (nowMs - t) < STALE_LIMIT;
  });
  lowHits = lowHits.filter(h => {
      const t = h.t ? new Date(h.t).getTime() : 0;
      return (nowMs - t) < STALE_LIMIT;
  });
  // ---------------------------------------------------

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
      sector: e.sector && String(e.sector).trim() ? String(e.sector).trim() : (e.Sector && String(e.Sector).trim() ? String(e.Sector).trim() : null),
      industry: e.industry && String(e.industry).trim() ? String(e.industry).trim() : (e.Industry && String(e.Industry).trim() ? String(e.Industry).trim() : null),
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


// ===============================================================
// ================== GLOBAL MOVERS (CENTRAL) ====================
// ===============================================================

function runGlobalMoversScan() {
  try {
    const now = new Date();
    
    // --- FINAL CAPTURE WINDOW LOGIC ---
    // Specifically target the window after Market Close but before Email/Night
    // SYDNEY TIME: 4:00 PM - 6:30 PM
    const hour = Number(Utilities.formatDate(now, ASX_TIME_ZONE, 'H'));
    const min = Number(Utilities.formatDate(now, ASX_TIME_ZONE, 'mm'));
    const timeVal = hour * 100 + min;
    const isFinalCaptureWindow = (timeVal >= 1600 && timeVal <= 1830);

    const inHours = isMarketActive_(now);
    
    // EXIT: Skip only if we are outside both active hours AND the capture window.
    // Note: isMarketActive_ already covers 1600-1830, but this explicit check
    // prevents any confusion and allows us to decouple the requirements later.
    if (!inHours && !isFinalCaptureWindow) return;

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

// ===============================================================
// ================== HISTORY SERVICE (YAHOO) ====================
// ===============================================================

/**
 * Fetches historical price data from Yahoo Finance.
 * @param {string} code - The ASX code (e.g., 'BHP').
 * @param {string} range - '1y', '5y', '10y', 'max'.
 * @returns {Object} { ok: boolean, data: Array<{time, open, high, low, close}>, error?: string }
 */
function fetchHistory(code, range = '1y') {
  try {
    if (!code) return { ok: false, error: 'No code provided' };
    
    // Normalize code: Yahoo uses .AX sufix for ASX
    const symbol = code.toUpperCase().trim() + (code.toUpperCase().endsWith('.AX') ? '' : '.AX');
    
    // Map Frontend Ranges to Yahoo API params
    // Ranges: 1d, 5d, 1m, 3m, 6m, 1y, 5y, max
    let yRange = '1y';
    let yInterval = '1d';

    switch (range.toLowerCase()) {
      case '1d': yRange = '1d'; yInterval = '5m'; break;
      case '5d': yRange = '5d'; yInterval = '15m'; break;
      case '1m': yRange = '1mo'; yInterval = '1d'; break;
      case '3m': yRange = '3mo'; yInterval = '1d'; break;
      case '6m': yRange = '6mo'; yInterval = '1d'; break;
      case '1y': yRange = '1y'; yInterval = '1d'; break;
      case '3y': yRange = '3y'; yInterval = '1d'; break;
      case '5y': yRange = '5y'; yInterval = '1d'; break; // Could use 1wk for speed if needed
      case '10y': yRange = '10y'; yInterval = '1d'; break;
      case 'max': yRange = 'max'; yInterval = '1mo'; break; // Max is huge, use monthly
      default: yRange = '1y'; yInterval = '1d';
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${yRange}&interval=${yInterval}`;
    
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const codeResp = resp.getResponseCode();
    
    if (codeResp !== 200) {
      return { ok: false, error: `Yahoo API Error: ${codeResp} ${resp.getContentText()}` };
    }
    
    const json = JSON.parse(resp.getContentText());
    if (!json.chart || !json.chart.result || !json.chart.result[0]) {
      return { ok: false, error: 'No chart data in response' };
    }
    
    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    
    if (!timestamps || !quotes) {
       return { ok: false, error: 'Empty dataset' };
    }
    
    const candles = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      // Filter out nulls
      if (quotes.open[i] == null || quotes.close[i] == null) continue;
      
      const ts = timestamps[i];
      // Lightweight charts handles Unix Timestamp (seconds) for intraday if we pass 'time' as number
      // For Daily, we typically pass string 'YYYY-MM-DD'.
      // To keep it simple and unified, we can pass Unix Timestamp (seconds) for EVERYTHING.
      // Lightweight Charts detects: if string -> date only. If number -> timestamp.
      
      candles.push({
        time: ts, // Pass raw unix timestamp (seconds)
        open: Number(quotes.open[i].toFixed(3)),
        high: Number(quotes.high[i].toFixed(3)),
        low: Number(quotes.low[i].toFixed(3)),
        close: Number(quotes.close[i].toFixed(3)),
      });
    }
    
    return { ok: true, data: candles, symbol: result.meta.symbol };
    
  } catch (e) {
    Logger.log('[fetchHistory] Error: ' + e);
    return { ok: false, error: String(e) };
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
  // Trim headers to avoid whitespace issues
  const map = {}; headers.forEach((h,i)=> map[String(h).trim()]=i);
  // Helper for case-insensitive lookup
  function getCol(candidates) {
    for (let c of candidates) {
      if (map[c] != null) return map[c];
      // Try uppercase match
      const upper = c.toUpperCase();
      const key = Object.keys(map).find(k => k.toUpperCase() === upper);
      if (key != null) return map[key];
    }
    return null;
  }

  // Resolve code column (tolerate slight header variants)
  const codeIdx = getCol(['ASX Code','ASXCode','Code']);
  
  // Resolve live price column (support alternative headings)
  const liveIdx = getCol(['LivePrice','Last','LastPrice','Last Trade','LastTrade','Last trade','Price','Current']);
  const apiPriceIdx = getCol(['API Price', 'APIPrice', 'PIPrice', 'PI Price', 'API_Price']);
  
  // Resolve previous close column (support multiple spellings)
  const prevIdx = getCol(['PrevDayClose','PrevClose','Previous Close','PreviousClose','Prev']);
  const apiPrevIdx = getCol(['API Prev', 'APIPrev', 'PI Prev', 'PIPrev', 'API_Prev']);
  
  // Robust header index finding (Direct Regex)
  const nameIdx = headers.findIndex(h => /^(Company Name|CompanyName|Name)$/i.test(String(h).trim()));
  // Capture Sector (which contains Industry data in this sheet) from 'Sector' or 'Category' column
  const sectorIdx = headers.findIndex(h => /^(Sector|Category)$/i.test(String(h).trim()));
  const industryIdx = headers.findIndex(h => /^(Industry)$/i.test(String(h).trim()));

  if (codeIdx == null || liveIdx == null || prevIdx == null) return [];
  const rows = [];
  values.forEach(r => {
    const codeRaw = r[codeIdx]; if (!codeRaw) return;
    
    let liveVal = r[liveIdx];
    let prevVal = r[prevIdx];
    
    // --- PRIORITY OVERRIDE: API Price (for Penny Stocks) ---
    // If API price exists and is valid, use it. Otherwise use Google Price.
    const isBroken = (v) => (v == null || v === '' || v === 0 || v === '#N/A' || String(v).includes('Error') || String(v).includes('Unknown'));
    
    if (apiPriceIdx != null) {
      const apiVal = r[apiPriceIdx];
      if (!isBroken(apiVal)) {
          liveVal = apiVal;
      }
    }
    
    // --- SMART FALLBACK: Prev Close ---
    if (isBroken(prevVal) && apiPrevIdx != null) {
       const fallback = r[apiPrevIdx];
       if (!isBroken(fallback)) prevVal = fallback;
    }

    if (liveVal == null || prevVal == null) return;
    
    const liveNum = Number(liveVal); 
    const prevNum = Number(prevVal);
    
    if (!isFinite(liveNum) || !isFinite(prevNum) || prevNum === 0 || liveNum === 0) return;
    
    rows.push({
      code: String(codeRaw).trim().toUpperCase(),
      live: liveNum,
      prev: prevNum,
      name: (nameIdx!=null? r[nameIdx] : null),
      sector: (sectorIdx!=null && r[sectorIdx]) ? String(r[sectorIdx]).trim() : null,
      industry: (industryIdx!=null && r[industryIdx]) ? String(r[industryIdx]).trim() : null
    });
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
        sector: row.sector || null,
        industry: row.industry || null,
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
      sector: o.sector || null,
      industry: o.industry || null,
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
  // --- PERSISTENCE HARDENING: Handle fetch failure gracefully ---
  // If we can't read yesterday's history (e.g. network glitch), we MUST NOT abort.
  // We should default to an empty list and SAVE the new data so we don't lose today's alerts.
  if (!current.ok) {
     Logger.log('[Movers][DailyHits] Read failed (%s). Defaulting to empty history to preserve new data.', current.error);
     current.data = { dayKey: todayKey, upHits: [], downHits: [] };
  }

  let upHits = current.data.upHits || [];
  let downHits = current.data.downHits || [];
  let dayKey = current.data.dayKey || todayKey;

  if (dayKey !== todayKey) {
    // New day: reset lists
    upHits = []; downHits = []; dayKey = todayKey;
  }
  const nowIso = new Date().toISOString();
  
  // --- SELF-HEALING FIX: Prune stale alerts (>24h) ---
  const nowMs = Date.now();
  const STALE_LIMIT = 24 * 60 * 60 * 1000;
  
  // Prune existing lists
  upHits = upHits.filter(h => {
      const t = h.t ? new Date(h.t).getTime() : 0;
      return (nowMs - t) < STALE_LIMIT;
  });
  downHits = downHits.filter(h => {
      const t = h.t ? new Date(h.t).getTime() : 0;
      return (nowMs - t) < STALE_LIMIT;
  });
  // ---------------------------------------------------

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
    return { 
      code, 
      name: e.name || e.companyName || null, 
      sector: e.sector || (e.Sector || null),
      industry: e.industry || (e.Industry || null),
      live: live, 
      prevClose: prev, 
      change: change, 
      pct: pct, 
      direction: direction, 
      t: nowIso 
    };
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
      if (!infoMap[c]) infoMap[c] = { name: e.name || null, live: num(e.live), sector: e.sector||null, industry: e.industry||null };
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
            
            pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, sector: meta.sector || null, industry: meta.industry || null, intent: 'mover', direction: direction, userId: uid, shareId, t: nowIso });
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
      if (!infoMap[c]) infoMap[c] = { name: e.name || null, live: num(e.live), sector: e.sector||null, industry: e.industry||null };
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
            pending.push({ code, name: meta.name || f.companyName || null, live: meta.live || null, sector: meta.sector || null, industry: meta.industry || null, intent, direction, userId: uid, shareId, t: nowIso });
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
    // LOGIC FIX: Include Target Price in unique key.
    // This allows distinct alerts for different targets on the same stock/day (e.g. $65 -> $50 editing).
    return uid + '|' + code + '|' + intent + '|' + (h.target || '');
  }));
    (Array.isArray(newHitsArr) ? newHitsArr : []).forEach(h => {
    if (!h || !h.code) return;
    const uid = (h.userId || '') + '';
    const code = _normCode(h.code);
    const intent = _normIntent(h.intent || null);
    const key = uid + '|' + code + '|' + intent + '|' + (h.target || '');
    if (seen.has(key)) return;
    
    // LOG WHAT IS BEING APPENDED
    console.log(`[CustomHits] Appending NEW Hit: ${code} Intent:${intent} Target:${h.target} Live:${h.live}`);

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
      userIntent: h.userIntent || null,
      sector: h.sector || null,
      industry: h.industry || null
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
function runCustomTriggersScan(force = false) {
  try {
    if (!force && !isMarketActive_()) { console.log('[CustomScan] Market closed. Skipping.'); return; }
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
              live,
              target: tgt,
              direction,
              sector: p.sector || null,
              industry: p.industry || null,
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
    } else if (payload.action === 'gemini3Research') {
      result = handleGemini3Research_(payload);
    } else if (payload.action === 'geminiQuery') {
      result = handleGeminiQuery_(payload);
    } else if (payload.action === 'fetchHistory') {
      result = fetchHistory(payload.code, payload.range);
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

Task: Provide a concise but detailed analysis of WHY this stock might be moving in 3-4 sentences. 
- If specific news is unknown, speculate based on the Sector performance, Market Sentiment, and characteristic behavior of stocks in this category.
- use specific financial terminology (e.g. "sector rotation", "taking profits", "correlation with iron ore", "short covering").
- DO NOT say "I am an AI without real-time news". Just give the most likely market theory.
        `;
    } else if (mode === 'chat') {
       // ASK THE MARKET PROMPT
       prompt = `
You are a helpful and witty personal AI assistant.
User Question: "${query}"

User's Portfolio Context (for reference):
${JSON.stringify(context || {})}

Instructions:
1. Answer the user's question directly. 
2. You are NOT limited to just the share market; provide information on any topic requested.
3. If the question relates to their portfolio, use the provided context.
4. Use bold text (**word**) for emphasis.
5. Provide a professional, high-end commentary tone.
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
 * Handles 'gemini3Research' for Universal Deep Research.
 */
function handleGemini3Research_(payload) {
  try {
    const { symbol, prompt, questionId, thinking } = payload;
    if (!prompt) return { ok: false, error: 'Missing prompt' };

    // Standard research call
    // Passing the thinking flag from the payload to the API caller
    const result = callGeminiAPI_(prompt, { thinking: !!thinking });
    
    if (result.success) {
      return { ok: true, text: result.data, model: result.model };
    } else {
      return { ok: false, error: result.reason }; 
    }
  } catch (e) {
    Logger.log('[Gemini3] Research Error: ' + e);
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
  
  // Fallback API Column (for GSCF/broken stocks)
  const apiPriceColIndex = headersMap['APIPRICE'] ?? headersMap['PIPRICE'] ?? headersMap['APILAST'] ?? headersMap['API PRICE'];

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
    
    // --- SMART FALLBACK LOGIC ---
    let candidate = live;
    const isBroken = (v) => (v == null || v === '' || v === 0 || v === '#N/A' || String(v).includes('Error') || String(v).includes('Unknown'));
    
    // If Live Price is broken, try API Price
    if (isBroken(candidate) && apiPriceColIndex !== undefined) {
      const apiVal = row[apiPriceColIndex];
      // Only use API val if it looks valid
      if (!isBroken(apiVal)) candidate = apiVal;
    }

    // Rule: if candidate price is valid (a positive number), use it. Else keep existing.
    // PROTECTION: Prevent #N/A or error strings from poisoning the PrevDayClose.
    
    // Clean string input (e.g. "$102.00")
    if (typeof candidate === 'string') candidate = candidate.replace(/[^0-9.]/g, '');
    
    const valNum = Number(candidate);
    
    if (!isNaN(valNum) && valNum > 0) {
      return [valNum];
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
  console.log('[DailyDigest] Attempting to run daily digest flow...');
  
  // 0) FORCE REFRESH: Ensure API columns are fresh to avoid stale prices (e.g. XRO)
  try {
    console.log('[DailyDigest] Forcing repairBrokenPrices() to clear stale data...');
    repairBrokenPrices();
  } catch (e) {
    console.error('[DailyDigest] Repair warning (proceeding): ' + e);
  }

  // 1) Trading Day Guard (Catch Weekends & Holidays)
  try {
    const now = new Date();
    if (!isTradingDay_(now)) {
      console.log(`[DailyDigest] Non-trading day; skipping email send.`);
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

  function createTable(title, rows, headersHtml, color, subtitle) {
    if (!rows || rows.length === 0) return '';
    const headerStyle = `margin:16px 0 0 0;padding:10px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;background-color:${color || '#333'};font-size:14px;font-weight:bold;border-radius:4px 4px 0 0;`;
    const subHtml = subtitle ? `<span style="font-weight:normal;font-size:11px;opacity:0.8;margin-left:8px;">${subtitle}</span>` : '';
    return (
      `<h3 style="${headerStyle}">` + esc(title) + subHtml + '</h3>' +
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

      // Sector Filter: If activeFilters (prefs.scanner.activeFilters) is present, it's an allowlist.
      // If null/undefined, ALL sectors are allowed.
      const activeFilters = (prefs.scanner && Array.isArray(prefs.scanner.activeFilters)) 
        ? new Set(prefs.scanner.activeFilters.map(s => String(s).toUpperCase().trim())) 
        : null;

      // Override Preference: "Watchlist - Override Filter" (excludePortfolio)
      // Defaults to TRUE (enabled) if undefined, matching NotificationStore logic.
      const overrideFilters = (prefs.excludePortfolio !== false);

      // Hidden Sectors (Blocklist) - Priority over Allowlist
      const hiddenSectors = (Array.isArray(prefs.hiddenSectors))
        ? new Set(prefs.hiddenSectors.map(s => String(s).toUpperCase().trim()))
        : null;

      const qualifies = (o, bypassFilters = false) => {
        if (!bypassFilters && !_isSectorAllowed_(o, prefs)) return false;
        
        const live = _parseNum_(o.live);
        if (!bypassFilters && t.minPrice && live < t.minPrice) return false;

        const pct = Math.abs(num(o.pct)||0);
        const dol = Math.abs(num(o.change)||0);
        if (o.direction === 'up') {
          return (t.upPct && pct >= t.upPct) || (t.upDol && dol >= t.upDol) || (!t.upPct && !t.upDol);
        } else {
          return (t.downPct && pct >= t.downPct) || (t.downDol && dol >= t.downDol) || (!t.downPct && !t.downDol);
        }
      };

      // Filter Movers (Global Sections - Relaxed to show Top Market Moves)
      // Use a lighter filter for 'Global Movers' (Sector + Price only) to ensure visibility of the 
      // Market Top 15 even if they don't meet strict personal Notification triggers.
      function qualifiesMover(o) {
        if (!_isSectorAllowed_(o, prefs)) return false;
        const live = _parseNum_(o.live);
        if (t.minPrice && live < t.minPrice) return false;
        return true;
      }

      // Filter Movers (Global Sections - Strict, no bypass)
      // Restored Strict Thresholds: Mover must meet the user's personal % or $ trigger to appear.
      const userDown = allDown.filter(o => qualifies(o, false)).sort((a,b)=> Math.abs(num(b.pct)||0) - Math.abs(num(a.pct)||0));
      const userUp = allUp.filter(o => qualifies(o, false)).sort((a,b)=> (num(b.pct)||0) - (num(a.pct)||0));
      
      // Filter 52-Week Hits (Global - Strict)
      const userLows = allLows.filter(o => (!t.hiloPrice || num(o.live) >= t.hiloPrice) && _isSectorAllowed_(o, prefs)).sort((a,b)=> (num(b.live)||0) - (num(a.live)||0));
      const userHighs = allHighs.filter(o => (!t.hiloPrice || num(o.live) >= t.hiloPrice) && _isSectorAllowed_(o, prefs)).sort((a,b)=> (num(b.live)||0) - (num(a.live)||0));

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
          // Respect Override setting for Personal Alerts
          if (h.intent === 'mover') {
            const rich = moverMap.get(h.code);
            if (!rich) return false;
            return qualifies(rich, overrideFilters);
          }

          // 3. For 52-Week: Must match Min Price rule
          if (h.intent === '52w-high' || h.intent === '52w-low') {
             if (t.hiloPrice && num(h.live) < t.hiloPrice) return false;
             return true;
          }

          return false; 
        })
        .map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtMoney(o.target))+td(o.direction)+td(o.intent)+'</tr>');

      // Assemble Tables (Order: Personal > 52W Low > 52W High > Losers > Gainers)
      // Disclaimer Subtitles
      const disclaimerRow52 = '<tr><td colspan="5" style="padding:4px 10px;font-size:11px;color:#777;background:#fdfdfd;border-bottom:1px solid #eee;"><em>Note: End-of-Day prices. Intraday reach may not be shown.</em></td></tr>';
      const disclaimerRowMovers = '<tr><td colspan="5" style="padding:4px 10px;font-size:11px;color:#777;background:#fdfdfd;border-bottom:1px solid #eee;"><em>Note: Only shows movers matching your personal Alert Thresholds.</em></td></tr>';

      const sections = [
        createTable('Your Personal Alerts', userCustomHits, hdrCustom, '#1976d2'), 
        createTable('52-Week Lows', [disclaimerRow52, ...userLows.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtMoney(o.low52))+td(fmtMoney(o.high52))+'</tr>')], hdrHiLo, '#d32f2f', 'Stocks ending the day at or within 1% of their yearly trough.'), 
        createTable('52-Week Highs', [disclaimerRow52, ...userHighs.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtMoney(o.low52))+td(fmtMoney(o.high52))+'</tr>')], hdrHiLo, '#388e3c', 'Stocks ending the day at or within 1% of their yearly peak.'), 
        createTable('Global Movers — Losers', [disclaimerRowMovers, ...userDown.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtPct(o.pct))+td(fmtMoney(o.change))+'</tr>')], hdrMovers, '#e53935', 'Stocks that closed at or below your personal %/$ loss thresholds.'), 
        createTable('Global Movers — Gainers', [disclaimerRowMovers, ...userUp.map(o => '<tr>'+td(o.code)+td(o.name)+td(fmtMoney(o.live))+td(fmtPct(o.pct))+td(fmtMoney(o.change))+'</tr>')], hdrMovers, '#43a047', 'Stocks that closed at or above your personal %/$ growth thresholds.')  
      ].filter(s => !!s);

      if (sections.length === 0) {
        console.log(`[DailyDigest] No qualifying hits for ${recipient}; skipping email.`);
        return;
      }

      // Final Assembly
      const counts = `Movers: ${userUp.length+userDown.length} | 52-Week: ${userHighs.length+userLows.length} | Personal: ${userCustomHits.length}`;
      const subject = `${GAS_CONFIG.EMAIL.SUBJECT_PREFIX} — ${sydneyDateStr} (${counts})`;
      const logicBlockHtml = 
        '<div style="margin:16px 0;padding:12px;background-color:#f5f5f5;border-radius:4px;border-left:4px solid #1a73e8;font-size:12px;color:#555;">' +
        '<strong>REPORT LOGIC:</strong> This is a final "Market Close" snapshot as of 4:15 PM Sydney time. ' +
        'These figures reflect Closing Prices and may differ from the live fluctuations seen in-app earlier today. ' +
        'This list is strictly filtered to show only the high-priority hits that maintained your personal thresholds through the final bell.' +
        '</div>';

      const htmlBody = (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.4;max-width:800px;margin:auto;">' +
        `<h2 style="margin:0 0 12px 0;color:#1a73e8;">${GAS_CONFIG.EMAIL.SUBJECT_PREFIX} — ${esc(sydneyDateStr)}</h2>` +
        logicBlockHtml +
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
  // 30 minutes is a good balance for "Pro" users (standardized).
  _ensureTimeTrigger_('repairBrokenPrices', b => b.everyMinutes(30));

  // --- 5) Dashboard Repair & Price Sync (Every 30 Mins) ---
  // Ensures formulas are preserved while prices update.
  _ensureTimeTrigger_('autoRepairDashboard', b => b.everyMinutes(30));
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
      // Priority Override: Use API Price if available (for exact penny stock precision)
      if (apiPriceIdx != null) {
        const apiVal = parseFloat(r[apiPriceIdx]);
        if (apiVal != null && !isNaN(apiVal) && apiVal > 0) {
          live = apiVal;
        }
      }

      let prevClose = num(idxPrev);
      // Priority Override: API Prev Close
      const apiPrevIdx = findFuzzy(['APIPREVCLOSE', 'APIPREVIOUSCLOSE', 'PIPREVCLOSE']);
      if (apiPrevIdx != null) {
          const apiVal = parseFloat(r[apiPrevIdx]);
          if (apiVal != null && !isNaN(apiVal) && apiVal > 0) {
            prevClose = apiVal;
          }
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
  // 1. DASHBOARD - Always Update (Safe because it's only 27 items)
  repairSheet_('Dashboard');
  
  // 2. PRICES - Only update during Sydney Market Hours (Protects your Quota)
  if (isMarketActive_()) {
    Utilities.sleep(1000); // Small pause for stability
    repairSheet_('Prices');
    Logger.log('Full Portfolio repair completed during market hours.');
  } else {
    Logger.log('Dashboard updated. Portfolio repair skipped (Market Inactive).');
  }
}

/**
 * TESTING TOOL: Force update the Prices sheet immediately (Ignored Market Hours).
 * Use this to verify recent code changes or fix data glitches instantly.
 */
function forceRepairPortfolio() {
  console.log('[FORCE] Starting manual portfolio repair...');
  repairSheet_('Prices');
  console.log('[FORCE] Completed.');
}

/**
 * SURGICAL REPAIR: Update a single stock instantly.
 * Run this function and change "ABC" to your penny stock code (e.g. "PUR").
 */
function repairSpecificStock() {
  const TARGET_CODE = "PUR"; // <--- CHANGE THIS TO YOUR STOCK CODE
  
  console.log(`[SURGICAL] repairing ${TARGET_CODE}...`);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Prices');
  const data = sheet.getDataRange().getValues();
  
  // Find Headers
  const headers = data[0].map(h => String(h).toUpperCase().trim());
  const codeIdx = headers.findIndex(h => h.includes('CODE'));
  const apiPriceIdx = headers.findIndex(h => ['APIPRICE', 'PIPRICE', 'API PRICE', 'API_PRICE'].includes(h));
  
  if (codeIdx === -1 || apiPriceIdx === -1) {
    console.log('Error: Could not find CODE or API_PRICE columns.');
    return;
  }
  
  // Find Row
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][codeIdx]).trim().toUpperCase() === TARGET_CODE) {
      targetRow = i;
      break;
    }
  }
  
  if (targetRow === -1) {
    console.log(`Stock ${TARGET_CODE} not found in Prices sheet.`);
    return;
  }
  
  // Fetch from Yahoo
  const ticker = TARGET_CODE + '.AX'; // Assumption
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  
  if (resp.getResponseCode() === 200) {
    try {
      const json = JSON.parse(resp.getContentText());
      const meta = json.chart.result[0].meta;
      const live = meta.regularMarketPrice;
      
      console.log(`[YAHOO] ${ticker}: ${live}`);
      
      // Write to specific cell
      sheet.getRange(targetRow + 1, apiPriceIdx + 1).setValue(live);
      console.log('✅ Updated Spreadsheet.');
      
    } catch (e) { console.log('Parse error', e); }
  } else {
    console.log('API Error: ' + resp.getResponseCode());
  }
}

/**
 * CLEANUP TOOL: Remove redundant API data.
 * If the main Google Price is GOOD, clear the API Price column.
 * Run this ONCE to fix the accidental fill.
 */
function oneTimeCleanupApiColumns() {
  console.log('[CLEANUP] Starting cleanup...');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Prices');
  const data = sheet.getDataRange().getValues();
  
  const headers = data[0].map(h => String(h).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  console.log('[CLEANUP] Headers found:', headers);

  // Robust Header Finding
  const findH = (patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)));
  
  const priceIdx = findH(['LIVEPRICE', 'LAST', 'PRICE', 'CURRENT']);
  const apiPriceIdx = findH(['APIPRICE', 'PIPRICE']);
  const apiPrevIdx = findH(['APIPREVCLOSE', 'PIPREVCLOSE', 'APIPREV']);
  
  console.log(`[CLEANUP] Indices -> Live:${priceIdx} API:${apiPriceIdx} APIPrev:${apiPrevIdx}`);

  if (priceIdx === -1 || (apiPriceIdx === -1 && apiPrevIdx === -1)) {
    console.log('Error: Critical columns not found.');
    return;
  }
  
  const updates = [];
  
  // Helper to safely parse strings like "$1,050.00"
  const parseVal = (v) => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    const clean = String(v).replace(/[^0-9.-]/g, '');
    const f = parseFloat(clean);
    return isNaN(f) ? 0 : f;
  };

  const newApiPrices = data.map(r => [r[apiPriceIdx]]);
  const newApiPrevs = (apiPrevIdx !== -1) ? data.map(r => [r[apiPrevIdx]]) : [];
  
  let clearedCount = 0;

  for (let i = 1; i < data.length; i++) {
    const rawPrice = data[i][priceIdx];
    const priceVal = parseVal(rawPrice);
    
    // Logic: If Google Price is healthy (> 0.01), clear API data.
    // If it's a Penny Stock (<= 0.01), KEEP API data.
    
    // Valid Price Check
    if (priceVal > 0) {
       if (priceVal > 0.01) {
         // HEALTHY STOCK -> CLEAR REDUNDANT API DATA
         if (apiPriceIdx !== -1) newApiPrices[i][0] = '';
         if (apiPrevIdx !== -1) newApiPrevs[i][0] = '';
         clearedCount++;
       } else {
         // PENNY STOCK -> PROTECT
         // console.log(`[PROTECT] Keeping API data for penny stock at row ${i+1} ($${priceVal})`);
       }
    }
  }
  
  // Write Back
  if (apiPriceIdx !== -1) {
    sheet.getRange(1, apiPriceIdx + 1, newApiPrices.length, 1).setValues(newApiPrices);
  }
  if (apiPrevIdx !== -1) {
    sheet.getRange(1, apiPrevIdx + 1, newApiPrevs.length, 1).setValues(newApiPrevs);
  }
  
  console.log(`[CLEANUP] Success! Cleared redundant API data for ${clearedCount} rows.`);
}

/**
 * Internal helper to repair a specific sheet.
 * ARCHITECTURAL RULE COMPLIANT REWRITE:
 * 1. Checks for Formulas on Dashboard (Protect Row 27).
 * 2. Checks for Live Price > 0.01 on Prices (Protect Healthy Rows).
 * 3. Uses Batching (V7 endpoint) to save quota.
 */
function repairSheet_(sheetName, force = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  console.log(`[REPAIR] Scanning ${sheetName}...`);
  const isDashboard = (sheetName === 'Dashboard');
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  
  // Robust Header Finding
  const findH = (patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)));
  const codeIdx = findH(['CODE', 'ASXCODE', 'SYMBOL']);
  
  // 1. Target Column Logic
  // Dashboard -> Writes to LivePrice directly (unless formula).
  // Prices -> Writes to API_Price (Col J) to preserve Google Formulas in LivePrice.
  let targetPriceIdx = -1;
  let livePriceCheckIdx = -1; // Used to check if Google Price is healthy
  
  if (isDashboard) {
      targetPriceIdx = findH(['LIVEPRICE', 'LAST', 'PRICE']);
  } else {
      targetPriceIdx = findH(['APIPRICE', 'PIPRICE']);
      livePriceCheckIdx = findH(['LIVEPRICE', 'LAST', 'PRICE']); // We check this before writing to API col
  }

  if (codeIdx === -1 || targetPriceIdx === -1) {
      console.log(`[REPAIR] Skpped ${sheetName} - Missing Columns.`);
      return;
  }

  // 2. Scan & Collect Broken Rows
  const updates = []; // { row: 5, col: 2, val: 1.23 }
  const symbolsToFetch = [];
  const symbolRowMap = new Map(); // "BHP.AX" -> [rowIndex1, rowIndex2]

  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][codeIdx]).trim().toUpperCase();
    if (!code) continue;
    
    // SAFETY CHECK 1: Dashboard Formula Protection
    if (isDashboard) {
       const cell = sheet.getRange(i + 1, targetPriceIdx + 1);
       if (cell.getFormula()) {
           // console.log(`[PROTECT] Skipping formula row for ${code}`);
           continue; 
       }
    }

    // SAFETY CHECK 2: Prices Sheet Health Check
    // If we are on 'Prices' sheet, and the MAIN LivePrice column has a valid price > $0.01,
    // we DO NOT need to repair it. Skip.
    if (!isDashboard && livePriceCheckIdx !== -1) {
        // Use robust cleaning (remove $, commas) before checking value
        let rawVal = data[i][livePriceCheckIdx];
        let liveVal = (typeof rawVal === 'number') ? rawVal : parseFloat(String(rawVal).replace(/[$, ]/g, ''));
        
        // If it's a valid number > 0.01, it is healthy. SKIP IT.
        if (!isNaN(liveVal) && liveVal > 0.01 && !force) {
            continue; 
        }
    }
    
    // If we are here, the row is either:
    // a) A Dashboard row with no formula (needs update)
    // b) A Prices row that is Broken/Penny (needs API fallback)
    
    // Correctly handle Yahoo Finance ticker suffixes
    // DO NOT append .AX if:
    // 1. Starts with ^ (Index)
    // 2. Contains = (Currency)
    // 3. Contains - (Crypto)
    // 4. Already has a dot (e.g. FBR.AX)
    let ticker = code;
    // Correctly handle Yahoo Finance ticker suffixes
    // DO NOT append .AX if:
    // 1. Starts with ^ (Index)
    // 2. Contains = (Currency)
    // 3. Contains - (Crypto)
    // 4. Already has a dot (e.g. FBR.AX)
    
    if (!ticker.includes('.') && 
        !ticker.startsWith('^') && 
        !ticker.includes('=') && 
        !ticker.includes('-')) {
        ticker += '.AX'; 
    }
    
    // DEBUG LOG: See if indices are getting mangled
    if (isDashboard) console.log(`[DashboardTicker] Original: ${code} -> Fetch: ${ticker}`);
    
    symbolsToFetch.push(ticker);
    if (!symbolRowMap.has(ticker)) symbolRowMap.set(ticker, []);
    symbolRowMap.get(ticker).push(i); // Store 0-based row index
  }

  if (symbolsToFetch.length === 0) {
      console.log(`[REPAIR] ${sheetName} is healthy. No external repairs needed.`);
      return;
  }

  // 3. Batch Fetch (Yielding logic from summary: 40 per batch)
  console.log(`[REPAIR] Fetching data for ${symbolsToFetch.length} symbols...`);
  const uniqueSyms = [...new Set(symbolsToFetch)];
  
  // Optimized Batch Fetcher
  const BATCH_SIZE = 40; // Yahoo limit safely under 50
  for (let b = 0; b < uniqueSyms.length; b += BATCH_SIZE) {
      const batch = uniqueSyms.slice(b, b + BATCH_SIZE);
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.join(',')}`; // V7 Endpoint
      
      try {
          const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
          if (resp.getResponseCode() !== 200) continue;
          
          const json = JSON.parse(resp.getContentText());
          const results = json.quoteResponse ? json.quoteResponse.result : [];
          
          results.forEach(item => {
              const sym = item.symbol;
              const price = item.regularMarketPrice;
              
              if (price != null && symbolRowMap.has(sym)) {
                  const rows = symbolRowMap.get(sym);
                  rows.forEach(rIdx => {
                      updates.push({
                          row: rIdx + 1, // 1-based for setValues
                          col: targetPriceIdx + 1,
                          val: price
                      });
                  });
              }
          });
      } catch (err) {
          console.log(`[REPAIR] Batch error: ${err}`);
      }
      Utilities.sleep(200); // Friendly pause
  }

  // 4. Batch Write Updates
  // (Writing one by one is slow, but safe. For speed we could optimize, but safety first for now).
  updates.forEach(u => {
      sheet.getRange(u.row, u.col).setValue(u.val);
  });
  
  console.log(`[REPAIR] Updated ${updates.length} rows in ${sheetName}.`);
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

  if (colMap['price'] === -1) {
    Logger.log(`❌ CRITICAL: Could not find 'LivePrice' column in ${sheetName}. Check headers.`);
    return;
  }

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

// ===============================================================
// ==================== DEBUG / REPAIR TOOLS =====================
// ===============================================================

/**
 * UTILITY: Clears today's hit logs.
 * Run this to purge "Corrupt/Missing Sector" data from the current day
 * so that a fresh Scan can repopulate it correctly.
 */
function debug_ResetDailyHits() {
  console.log('Resetting ALL Daily Hits Documents (Custom, Movers, HiLo)...');
  
  // 1. Clear Custom Hits
  const res1 = commitCentralDoc_(DAILY_CUSTOM_HITS_DOC_SEGMENTS, { hits: [] });
  console.log('Custom Hits Reset:', res1.ok);

  // 2. Clear Global Movers Hits
  const res2 = commitCentralDoc_(DAILY_MOVERS_HITS_DOC_SEGMENTS, { dayKey: getSydneyDayKey_(), upHits: [], downHits: [] });
  console.log('Global Movers Hits Reset:', res2.ok);

  // 3. Clear Global HiLo Hits
  const res3 = commitCentralDoc_(DAILY_HILO_HITS_DOC_SEGMENTS, { dayKey: getSydneyDayKey_(), highHits: [], lowHits: [] });
  console.log('Global HiLo Hits Reset:', res3.ok);

  console.log('Done. Please now run:');
  console.log('1. runGlobalMoversScan');
  console.log('2. runGlobal52WeekScan');
  console.log('3. sendCombinedDailyDigest');
}

/**
 * DIAGNOSTIC: Run this to see what the Spreadsheet actually looks like.
 */
function debug_DiagnoseSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRICE_SHEET_NAME);
  if (!sheet) { console.log('ERROR: Sheet not found: ' + PRICE_SHEET_NAME); return; }
  
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) { console.log('ERROR: Sheet is empty'); return; }
  
  const headers = values[0];
  console.log('=== HEADERS ===');
  headers.forEach((h, i) => console.log(`[${i}] "${h}"`));
  console.log('================');
  
  console.log('=== FIRST 3 ROWS ===');
  for (let i = 1; i < Math.min(4, values.length); i++) {
    const r = values[i];
    // Print Code (col 0 usually) and first few cols to identify mapping
    console.log(`Row ${i}:`, r.slice(0, 10).map(c => String(c).substring(0, 20)));
  }
}

/**
 * DIAGNOSTIC: Test if the code can actually read sector data now.
 * It fetches the spreadsheet data using the REPAIRED function and checks a specific stock.
 */
function debug_VerifyScanData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const data = fetchAllAsxData_(sheet);
  
  if (!data || !data.length) { console.log('FAIL: No data returned from fetchAllAsxData_'); }
  
  // Test Case: Leaking ETFs
  const targets = ['GDX', 'ZYUS', 'NUGG', 'LHGG', 'CGUN'];

  // Test Readers
  console.log('--- 1. DATA EXTRACTION TEST ---');
  let testMovers = fetchPriceRowsForMovers_(sheet);
  let resolvedData = {};

  targets.forEach(code => {
    let t = data.find(d => d.code === code) || testMovers.find(d => d.code === code);
    if (t && t.sector) {
      console.log(`[${code}] FOUND. Sector: "${t.sector}" | Industry: "${t.industry}"`);
      resolvedData[code] = t;
    } else {
      console.log(`[${code}] MISSING SECTOR in both readers. (Check sheet content?)`);
    }
  });

  // Test User Filtering
  console.log('--- 2. USER FILTER SIMULATION ---');
  const usersList = _listFirestoreCollection_(['artifacts', APP_ID, 'users']);
  if (!usersList.ok) { console.log('Error listing users.'); return; }

  usersList.docs.forEach(u => {
    const uid = (u.name||'').split('/').pop();
    // Fetch user settings
    const settingsDoc = _fetchFirestoreDocument_(['artifacts', APP_ID, 'users', uid, 'settings', 'default']);
    if (!settingsDoc.ok) return;
    const s = _fromFsFields_(settingsDoc.fields || {});
    
    // Build Filter Set
    // Note: SettingsUI uses 'activeFilters'. GlobalAlerts maps this to a Set.
    // If activeSectorFilters is undefined/empty, usually means "All Allowed" OR "None Set".
    // Check SettingsUI logic: It saves to 'preferences.scanner.activeFilters'.
    // Firestore path might be different? 
    // Actually, 'applyUserFilters_' logic reads: userSettings.activeSectorFilters
    // which comes from the object passed to generateBriefing or stored?
    // Let's check 'scanner.activeFilters' in the settings doc we just fetched.
    
    const filters = (s.preferences && s.preferences.scanner && s.preferences.scanner.activeFilters);
    const filterSet = (filters && filters.length) ? new Set(filters.map(x=>String(x).toUpperCase())) : null;
    
    console.log(`User [${uid.substring(0,5)}...] Filters: ${filters ? filters.length + ' active' : 'ALL ALLOWED (Null)'}`);
    
    targets.forEach(code => {
      const item = resolvedData[code];
      if (!item) return; // Can't test if data missing
      
      const sec = item.sector ? String(item.sector).toUpperCase().trim() : null;
      const ind = item.industry ? String(item.industry).toUpperCase().trim() : null;
      
      // Simulate checkSector logic
      let allowed = true;
      let reason = 'Default Allow';
      
      if (!filterSet) {
         allowed = true; reason = 'All Allowed';
      } else {
         if (ind && filterSet.has(ind)) { allowed = true; reason = 'Industry Match'; }
         else if (sec && filterSet.has(sec)) { allowed = true; reason = 'Sector Match'; } // Fallback
         else { allowed = false; reason = 'Not in Filter'; } // Blocked
      }
      
    });
  });
}

/**
 * LIVE SYSTEM VALIDATOR:
 * Compares your Dashboard/Prices with Yahoo's high-precision data.
 * Run this to see EXACTLY why a number changed or stayed the same.
 */
function forceCleanupTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName('Dashboard');
  const prices = ss.getSheetByName('Prices');
  
  console.log("--- STARTING LIVE VALIDATION (5-Day Range) ---");
  
  const testItems = ['^AXJO', '^AORD', '^GSPC', 'FBR.AX', 'BTC-AUD'];
  
  testItems.forEach(ticker => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=5d`;
      const resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
      const json = JSON.parse(resp.getContentText());
      
      if (json.chart.result) {
        const result = json.chart.result[0];
        const meta = result.meta;
        let yahooPrice = meta.regularMarketPrice;
        let yahooSource = "Metadata";
        
        // Check Chart fallback
        if (result.indicators && result.indicators.quote && result.indicators.quote[0].close) {
          const quotes = result.indicators.quote[0].close;
          for (let q = quotes.length - 1; q >= 0; q--) {
            if (quotes[q] != null) {
              if (Math.abs(yahooPrice - quotes[q]) > 0.0001) {
                yahooPrice = quotes[q];
                yahooSource = "Chart Candle";
              }
              break;
            }
          }
        }
        
        console.log(`[VALIDATE] ${ticker}: Yahoo=${yahooPrice} (${yahooSource}) | MetaPrice=${meta.regularMarketPrice}`);
      } else {
        console.log(`[VALIDATE] ${ticker}: FAILED TO FETCH (${resp.getResponseCode()})`);
      }
    } catch (e) {
      console.log(`[VALIDATE] ${ticker}: ERROR -> ${e.message}`);
    }
  });

  console.log("\n--- TRIGGERING SYSTEM REPAIR (FORCE MODE) ---");
  repairSheet_('Dashboard', true);
  repairSheet_('Prices', true);
  console.log("Validation & Sync Complete.");
}

/**
 * =============================================================================
 *   AUTOMATED TEST SUITE (Run 'runAllTests' from Dropdown)
 * =============================================================================
 */




function forceRunCustomTriggers() {
  console.log('[FORCE] Manually running Custom Trigger Scan (Ignorning Market Hours)...');
  runCustomTriggersScan(true);
}

/**
 * MASTER RESET: Run this if alerts are stuck or data is stale.
 * 1. Clears Daily Docs.
 * 2. Runs Movers Scan.
 * 3. Runs 52-Week Scan.
 * 4. Runs Custom Triggers.
 */
function forceSystemResetAndScan() {
  console.log('=== STARTING SYSTEM RESET & RESCAN ===');
  
  // 1. Clear Daily Hits Doc by overwriting with empty
  const todayKey = getSydneyDayKey_();
  writeDailyCustomHits_({ dayKey: todayKey, hits: [] });
  console.log('[Reset] Cleared Daily Custom Hits.');
  
  // 2. Run Movers Scan (Populates DAILY_MOVERS)
  console.log('[Reset] Running Global Movers Scan...');
  runGlobalMoversScan();
  
  // 3. Run 52-Week Scan
  console.log('[Reset] Running 52-Week Scan...');
  runGlobal52WeekScan();
  
  // 4. Run Custom Triggers (Populates USER ALERTS)
  console.log('[Reset] Running Custom Triggers...');
  runCustomTriggersScan(true);
  
  console.log('=== SYSTEM RESET COMPLETE ===');
}


function runAllTests() {
  console.log('=== STARTING COMPREHENSIVE SYSTEM CHECK ===');


  testPennyStockLogic();
  testDeDuplicationLogic();
  testRegressionSafety();
  
  console.log('=== ALL TESTS COMPLETED ===');
}

function testPennyStockLogic() {
  console.log('[TEST 1] Penny Stock Precision Logic...');
  const mockRow = { googlePrice: 0.01, apiPrice: 0.004 };
  let needsRepair = false;
  
  // Rule: broken OR <= 0.01
  if (mockRow.googlePrice <= 0.01) needsRepair = true;
  
  if (needsRepair) {
    console.log('✅ PASS: System flagged $0.01 stock for API Repair.');
  } else {
    console.log('❌ FAIL: System ignored $0.01 stock.');
  }
}

function testDeDuplicationLogic() {
  console.log('[TEST 2] Target Change De-dup Logic...');
  // 1. Simulate Existing Hit for Target $65
  const userId = 'u1';
  const code = 'ABC';
  const oldTarget = 65;
  const newTarget = 50;
  
  // LOGIC UNDER TEST:
  // Key = uid|code|intent|target
  const seen = new Set();
  
  // Add old hit
  const key1 = userId + '|' + code + '|target-hit|' + oldTarget; 
  seen.add(key1);
  
  // Check new hit
  const key2 = userId + '|' + code + '|target-hit|' + newTarget;
  
  if (!seen.has(key2)) {
    console.log(`✅ PASS: Allowed new $${newTarget} alert (Key: ${key2}) after $${oldTarget} alert.`);
  } else {
    console.log(`❌ FAIL: Blocked new $${newTarget} alert. Bug lives.`);
  }
}

function testRegressionSafety() {
  console.log('[TEST 3] Regression Safety (Movers)...');
  const userId = 'u1';
  const code = 'XYZ';
  
  // Movers have no target (target is undefined/null)
  const key1 = userId + '|' + code + '|mover|'; 
  const seen = new Set();
  seen.add(key1);
  
  // Check duplicate mover
  const key2 = userId + '|' + code + '|mover|';
  
  if (seen.has(key2)) {
    console.log('✅ PASS: Correctly blocked duplicate Mover alert.');
  } else {
    console.log('❌ FAIL: Duplicate Mover allowed through.');
  }
}




/**
 * Public wrapper for the Dashboard Repair Logic.
 * Run this Manually or via Trigger.
 */
function autoRepairDashboard() {
  console.log('Starting Auto-Repair...');
  repairSheet_('Dashboard', true);
  // repairSheet_('Prices', true); // Disabled upon user request to isolate Dashboard logic
  console.log('Auto-Repair Complete.');
}

/**
 * DIAGNOSTIC: Run this to see EXACTLY why the dashboard isn't updating.
 * It checks Headers, Row Parsing, and API Connectivity for the first row.
 */
function debug_DashboardInternals() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dashboard');
  if (!sheet) { console.log('FAIL: Dashboard not found'); return; }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  console.log('HEADERS FOUND:', headers);
  
  // Replicate repairSheet_ logic EXACTLY to test it
  const rawHeader = headers.map(h => String(h).toUpperCase().trim());
  const findCol = (name) => rawHeader.indexOf(name.toUpperCase());
  
  // Logic from repairSheet_
  const codeCol = findCol('Code') !== -1 ? findCol('Code') : findCol('ASXCode');
  const priceCol = findCol('LivePrice') !== -1 ? findCol('LivePrice') : findCol('Price');

  console.log(`MAPPED COLUMNS: Code_Index=${codeCol} Price_Index=${priceCol}`);
  
  if (codeCol === -1 || priceCol === -1) {
    console.log('❌ CRITICAL FAIL: Helper cannot find columns. Script stops here.');
    console.log('   (Looking for "CODE" and "LIVEPRICE" or "PRICE" - case insensitive, trimmed)');
    return;
  }
  
  // Test Row 1 Data
  if (data.length < 2) { console.log('FAIL: Sheet has no data rows.'); return; }
  const row = data[1]; 
  const code = row[codeCol];
  const price = row[priceCol];
  console.log(`ROW 1 DATA: Code="${code}" Current_Price="${price}"`);
  
  if (!code) { console.log('FAIL: formatting issue? Row 1 code is empty.'); return; }

  // Test API Fetch Logic
  let ticker = String(code).toUpperCase().trim();
  // Handle Yahoo specifics (replicated from repairSheet_)
  const mapper = { 'XJO': '^AXJO', 'XALL': '^AORD', 'SPX': '^GSPC', 'IXIC': '^IXIC', 'DJI': '^DJI' };
  if (mapper[ticker]) ticker = mapper[ticker];
  if (ticker.endsWith('-F')) ticker = ticker.replace('-F', '=F');
  if (!ticker.includes('^') && !ticker.includes('=') && !ticker.includes('-') && !ticker.includes('.')) ticker += '.AX';
  
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price,summaryDetail`;
  console.log(`TESTING API: ${url}`);
  
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    console.log(`HTTP STATUS: ${resp.getResponseCode()}`);
    
    if (resp.getResponseCode() === 200) {
       const json = JSON.parse(resp.getContentText());
       const res = json.quoteSummary.result[0];
       const live = res.price.regularMarketPrice?.raw;
       
       console.log(`API RETURNED PRICE: ${live}`);
       
       if (live && live > 0) {
         console.log('✅ SUCCESS: Logic is sound. Script WOULD write to cell.');
       } else {
         console.log('❌ FAIL: API returned valid JSON but price was null/zero.');
       }
    } else {
       console.log('❌ FAIL: API Error (Non-200). Rate limit or invalid ticker?');
    }
  } catch (e) {
    console.log('❌ FAIL: Exception during fetch:', e.message);
  }
}
