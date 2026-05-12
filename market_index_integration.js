/**
 * ============================================================================
 *  MARKET INDEX  FIRESTORE PIPELINE
 * ============================================================================
 *
 * A standalone Google Apps Script that monitors Gmail for Market Index emails,
 * classifies them (Company Alert vs. Market Report), extracts the best
 * actionable URL, and writes structured data to Firestore.
 *
 *  PIPELINE 
 *   SCOUT    CLASSIFY    EXTRACT    INJECT    CLEAN
 *   Gmail      Subject      HTML        Firestore   Mark Read
 *
 *  DESIGN PRINCIPLES 
 *  Self-contained: Zero dependencies on other .gs files.
 *  Defensive: Every external call wrapped in try/catch.
 *  Idempotent: Re-running on the same inbox is safe (unread guard).
 *  Testable: TRASH_AFTER_SUCCESS = false keeps emails in inbox.
 *
 *  SETUP 
 * 1. Paste this file into Google Apps Script.
 * 2. Run `setupTrigger()` once.
 * 3. Emails process every 10 minutes automatically.
 *
 *  TESTING vs PRODUCTION 
 *  Testing:    TRASH_AFTER_SUCCESS = false  VERSION: '1.2.1', // v1159: Explicit Code Mapping
  TRASH_AFTER_SUCCESS: true, // v1159: Trash processed emails to avoid duplicate processing
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const MI_CONFIG = {
  /** Master kill switch. Set false to pause processing without removing trigger. */
  ENABLED: true,

  /**
   * TESTING MODE FLAG
   * 
   * false = Emails are ONLY marked as read after successful Firestore write.
   *         They remain in the inbox/archive for manual inspection.
   * true  = Emails are marked read AND moved to trash after success.
   */
  VERSION: '1.2.2', // v1161: User-Scoped Isolation
  TRASH_AFTER_SUCCESS: true, 

  /** Gmail search query. */
  GMAIL_QUERY: 'marketindex is:unread',

  /** Maximum threads per execution. */
  BATCH_SIZE: 10,

  /** 
   * USER IDENTIFIER
   * Set this to your unique User ID from the app's Profile/Settings page.
   * This ensures your emails are only visible to you.
   */
  USER_ID: 'sh3zcZGXSceviejDNJQsjRJjVgJ3', 

  /** Firestore REST API configuration. */
  FIREBASE: {
    PROJECT_ID: 'asx-watchlist-app',
    BASE_URL: 'https://firestore.googleapis.com/v1',
  },

  /** 
   * Firestore collection path.
   * v1161: Transitioned to private user-scoped path.
   */
  get STREAM_PATH() {
    return `artifacts/asx-watchlist-app/users/${this.USER_ID}/market_alerts`;
  }
};

// =============================================================================
// LINK EXTRACTION  BLOCKLIST & PRIORITY KEYWORDS
// =============================================================================

/**
 * Any URL containing one of these substrings is NEVER a valid destination.
 * Catches unsubscribe, social, and preference/tracking junk.
 */
const URL_BLOCKLIST = [
  'unsubscribe',
  'privacy',
  'manage-watchlist',
  'preferences',
  'advertise',
  'google.com',
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'youtube.com',
  'mailto:',
];

/**
 * PRIMARY CTA button text  these indicate the actual article/announcement link.
 * These are checked FIRST and take absolute priority.
 */
const CTA_PRIMARY = /Read\s*Full|Read\s*Online|Read\s*Article|Read\s*Story|Read\s*More|Read\s*Next|Read\s*this\s*online|Read\s*full\s*\w+\s*Wrap/i;

/**
 * SECONDARY CTA button text  lower confidence. Only used if no primary CTA found.
 * "View in Browser" is a common Mailchimp/email boilerplate that SOMETIMES is the
 * only usable link, but is often junk.
 */
const CTA_SECONDARY = /View\s*Online|Web\s*Version|Open\s*in\s*browser/i;

/**
 * CTA text that should ALWAYS be rejected, even if it matches a CTA pattern.
 * These are email boilerplate links that never lead to article content.
 */
const CTA_JUNK_TEXT = /View\s*this\s*email|Manage\s*your\s*preferences|Update.*preferences|Change.*email|Email\s*not\s*displaying/i;

/**
 * Domains we trust for content URLs. Anything outside these (except Mandrill
 * tracking redirects) is ignored during the fallback URL sweep.
 */
const TRUSTED_DOMAINS = /(?:www\.)?(?:marketindex\.com\.au|asx\.com\.au|mandrillapp\.com\/track\/click)/i;

// =============================================================================
// CLASSIFICATION RULES
// =============================================================================

/**
 * Subject-line patterns for Company Alerts.
 * A subject is a Company Alert if it contains a bracketed ticker [BHP],
 * an ASX:CODE prefix, or certain announcement keywords.
 */
const ALERT_INDICATORS = {
  HAS_BRACKET_TICKER: /\[[A-Za-z0-9]{2,5}\]/,
  HAS_ASX_TICKER: /^ASX:[A-Za-z0-9]{2,5}\b/i,
  KEYWORDS: /DIVIDEND|ANNOUNCEMENT|SENSITIVE ANN|HALT|TRADING HALT|SUBSTANTIAL|BUYBACK|TAKEOVER|ACQUISITION|CAPITAL RAISE|PLACEMENT|EARNINGS|PROFIT|RESULTS|GUIDANCE|APPENDIX|QUARTERLY ACTIVIT/i,
};

/**
 * Subject-line patterns for Market Reports.
 * These are the broader, non-ticker-specific daily summaries.
 */
const REPORT_INDICATORS = /WRAP|RAP|REPORT|MIDDAY|MORNING|EVENING|AFTERNOON|PREVIEW|UPDATE|WEEKLY|DAILY|MONTHLY|SECTOR|MARKET CLOSE|MARKET OPEN|ASX CLOSE|ASX OPEN/i;

// =============================================================================
// 1. MAIN ENTRY POINT
// =============================================================================

/**
 * Primary trigger function  called every 10 minutes by Apps Script trigger.
 * Orchestrates the full SCOUT  CLASSIFY  EXTRACT  INJECT  CLEAN pipeline.
 */
function processMarketIndexEmails() {
  if (!MI_CONFIG.ENABLED) {
    Logger.log('[Pipeline]   Integration DISABLED. Skipping.');
    return;
  }

  Logger.log('[Pipeline]  Scouting for unread Market Index emails...');

  try {
    //  SCOUT 
    const threads = GmailApp.search(MI_CONFIG.GMAIL_QUERY, 0, MI_CONFIG.BATCH_SIZE);

    if (threads.length === 0) {
      Logger.log('[Pipeline]  No unread emails found. Done.');
      return;
    }

    Logger.log(`[Pipeline]  Found ${threads.length} thread(s). Processing...`);

    // Accumulators for the two Firestore buckets
    const alertItems = [];
    const reportItems = [];

    // Track which threads had at least one successful extraction
    const succeededThreads = [];

    //  PROCESS EACH THREAD 
    for (let t = 0; t < threads.length; t++) {
      const thread = threads[t];
      const messages = thread.getMessages();
      let threadYieldedData = false;

      Logger.log(`[Pipeline]  Thread ${t + 1}/${threads.length} (${messages.length} msg) `);

      for (let m = 0; m < messages.length; m++) {
        const msg = messages[m];

        // Guard: Skip already-read messages (belt + suspenders with is:unread query)
        if (!msg.isUnread()) continue;

        const subject = msg.getSubject() || '(No Subject)';
        const bodyHtml = msg.getBody();
        const date = msg.getDate();

        Logger.log(`[Pipeline]    "${subject}"`);

        //  CLASSIFY 
        const classification = classifySubject_(subject);
        Logger.log(`[Pipeline]    Classification: ${classification}`);

        if (classification === 'UNKNOWN') {
          Logger.log('[Pipeline]     Unrecognised subject pattern. Skipping message.');
          continue;
        }

        //  EXTRACT 
        if (classification === 'COMPANY_ALERT') {
          const data = extractAlert_(subject, bodyHtml, date);
          if (data) {
            alertItems.push(data);
            threadYieldedData = true;
            Logger.log(`[Pipeline]    Alert: [${data.code}] ${data.headline}`);
            Logger.log(`[Pipeline]      Link: ${data.link}`);
          }
        } else if (classification === 'MARKET_REPORT') {
          const data = extractReport_(subject, bodyHtml, date);
          if (data) {
            reportItems.push(data);
            threadYieldedData = true;
            Logger.log(`[Pipeline]    Report: ${data.title}`);
            Logger.log(`[Pipeline]      Link: ${data.link}`);
          }
        }
      }

      if (threadYieldedData) {
        succeededThreads.push(thread);
      }
    }

    //  INJECT 
    let alertsWritten = false;
    let reportsWritten = false;

    if (alertItems.length > 0) {
      alertsWritten = writeToStream_('COMPANY_ALERTS', alertItems, mapAlertFields_);
      Logger.log(alertsWritten
        ? `[Pipeline]  Wrote ${alertItems.length} alert(s) to Firestore.`
        : `[Pipeline]  FAILED to write alerts. Emails will NOT be touched.`
      );
    }

    if (reportItems.length > 0) {
      reportsWritten = writeToStream_('MARKET_REPORT', reportItems, mapReportFields_);
      Logger.log(reportsWritten
        ? `[Pipeline]  Wrote ${reportItems.length} report(s) to Firestore.`
        : `[Pipeline]  FAILED to write reports. Emails will NOT be touched.`
      );
    }

    //  CLEAN 
    // Only mark/trash threads whose data was successfully written.
    const writeSucceeded = alertsWritten || reportsWritten;

    if (succeededThreads.length > 0 && writeSucceeded) {
      succeededThreads.forEach(thread => {
        thread.markRead();

        if (MI_CONFIG.TRASH_AFTER_SUCCESS) {
          GmailApp.moveThreadToTrash(thread);
        }
      });

      const action = MI_CONFIG.TRASH_AFTER_SUCCESS ? 'marked read + trashed' : 'marked read (testing mode)';
      Logger.log(`[Pipeline]  ${succeededThreads.length} thread(s) ${action}.`);
    }

    // Nothing extracted at all
    if (alertItems.length === 0 && reportItems.length === 0) {
      Logger.log('[Pipeline]  No actionable data extracted from any message.');
    }

    Logger.log('[Pipeline]   Cycle complete.');

  } catch (e) {
    Logger.log(`[Pipeline]  FATAL: ${e.message}`);
    Logger.log(`[Pipeline] Stack: ${e.stack}`);
  }
}

// =============================================================================
// 2. CLASSIFICATION
// =============================================================================

/**
 * Determines whether a subject line represents a Company Alert, a Market
 * Report, or is unrecognised.
 *
 * Decision tree:
 *   0. If subject starts with ASX:CODE  COMPANY_ALERT (always, even if 'Report' appears)
 *   1. If subject contains a bracketed ticker [XXX]  COMPANY_ALERT
 *      (unless it also contains broad report keywords like "Market Index Report")
 *   2. If subject contains alert-specific keywords (Dividend, Halt, etc.)  COMPANY_ALERT
 *   3. If subject contains report keywords (Wrap, Morning, etc.)  MARKET_REPORT
 *   4. Otherwise  UNKNOWN
 *
 * @param {string} subject - The email subject line.
 * @returns {'COMPANY_ALERT'|'MARKET_REPORT'|'UNKNOWN'}
 */
function classifySubject_(subject) {
  if (!subject) return 'UNKNOWN';

  const upper = subject.toUpperCase();

  // Rule 0: ASX:CODE prefix  ALWAYS a Company Alert
  // e.g. "ASX:FBR - Sensitive Ann: Quarterly Activities/Appendix 4C Cash Flow Report"
  // The word "Report" in the subject is part of the announcement title, not a market wrap.
  if (ALERT_INDICATORS.HAS_ASX_TICKER.test(subject)) {
    return 'COMPANY_ALERT';
  }

  // Rule 1: Bracketed ticker  Company Alert (unless it looks like a report header)
  if (ALERT_INDICATORS.HAS_BRACKET_TICKER.test(subject)) {
    // Guard: "[Market Index] Evening Wrap" is a report, not a company alert
    if (upper.includes('MARKET INDEX') && REPORT_INDICATORS.test(subject)) {
      return 'MARKET_REPORT';
    }
    return 'COMPANY_ALERT';
  }

  // Rule 2: Alert keywords without brackets  Company Alert
  if (ALERT_INDICATORS.KEYWORDS.test(subject)) {
    // But not if it's clearly a broad market report ("Dividend Report" without a ticker)
    if (REPORT_INDICATORS.test(subject) && !ALERT_INDICATORS.HAS_ASX_TICKER.test(subject)) {
      return 'MARKET_REPORT';
    }
    return 'COMPANY_ALERT';
  }

  // Rule 3: Report keywords  Market Report
  if (REPORT_INDICATORS.test(subject)) {
    return 'MARKET_REPORT';
  }

  return 'UNKNOWN';
}

// =============================================================================
// 3. DATA EXTRACTION
// =============================================================================

/**
 * Extracts structured data from a Company Alert email.
 *
 * Parses the stock ticker from the subject (either [BHP] or BHP: format),
 * finds the best actionable URL from the HTML body, and returns a clean object.
 *
 * @param {string} subject - Email subject line.
 * @param {string} bodyHtml - Raw HTML body of the email.
 * @param {Date} date - Message date.
 * @returns {Object|null} Structured alert data, or null if parsing failed.
 */
function extractAlert_(subject, bodyHtml, date) {
  try {
    let code = 'UNKNOWN';
    let headline = subject;

    // Pattern 1: ASX:FBR - Headline (Market Index format)
    const asxMatch = subject.match(/^ASX:([A-Za-z0-9]{2,5})\s*[-]\s*(.*)/i);
    // Pattern 2: [BHP] Some Headline Text
    const bracketMatch = subject.match(/\[([A-Za-z0-9]{2,5})\]\s*(.*)/);
    // Pattern 3: BHP: Some Headline Text
    const colonMatch = subject.match(/^([A-Za-z]{2,5})\s*:\s*(.*)/);

    if (asxMatch) {
      code = asxMatch[1].toUpperCase();
      headline = asxMatch[2].trim() || subject;
    } else if (bracketMatch) {
      code = bracketMatch[1].toUpperCase();
      headline = bracketMatch[2].trim() || subject;
    } else if (colonMatch) {
      code = colonMatch[1].toUpperCase();
      headline = colonMatch[2].trim() || subject;
    }

    const link = findBestUrl_(bodyHtml);

    return {
      code,
      headline,
      date: date.toISOString(),
      timestamp: date.getTime(),
      source: 'MarketIndex',
      link: link || `https://www.marketindex.com.au/asx/${code.toLowerCase()}`,
      type: 'announcement',
    };
  } catch (e) {
    Logger.log(`[Extract]   Alert parse error: ${e.message}`);
    return null;
  }
}

/**
 * Extracts structured data from a Market Report email.
 *
 * Strips HTML to produce a clean text summary (max 200 chars) and finds the
 * best actionable URL to the full report.
 *
 * @param {string} subject - Email subject line.
 * @param {string} bodyHtml - Raw HTML body of the email.
 * @param {Date} date - Message date.
 * @returns {Object|null} Structured report data, or null if parsing failed.
 */
function extractReport_(subject, bodyHtml, date) {
  try {
    const link = findBestUrl_(bodyHtml);

    // Strip HTML tags, collapse whitespace, and truncate for summary
    const rawText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove style blocks
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks
      .replace(/<[^>]+>/g, ' ')                         // Strip all tags
      .replace(/&nbsp;/gi, ' ')                         // Decode common entities
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')                             // Collapse whitespace
      .trim();

    // Take first 200 meaningful characters
    const summary = rawText.length > 200
      ? rawText.substring(0, 200) + '...'
      : rawText;

    return {
      title: subject,
      date: date.toISOString(),
      timestamp: date.getTime(),
      summary,
      link: link || 'https://www.marketindex.com.au',
      type: 'report',
    };
  } catch (e) {
    Logger.log(`[Extract]   Report parse error: ${e.message}`);
    return null;
  }
}

// =============================================================================
// 4. URL EXTRACTION ENGINE
// =============================================================================

/**
 * The "brain" of the integration. Scans the HTML body and returns the single
 * best URL to link to in the app.
 *
 *  PRIORITY TIERS 
 * Tier 0 (Highest): Direct PDF links (.pdf in any <a> href)
 * Tier 1: CTA button links ("Read Full", "Read Online", "Evening Wrap", etc.)
 * Tier 2: Content-path links (/asx-announcements/, /reports/, /news/, etc.)
 * Tier 3: Stock page links (/asx/BHP with subpages)
 * Tier 4: Any remaining trusted-domain link (first match)
 * Tier 5 (Fallback): null (caller provides its own fallback)
 *
 * Every tier applies the URL_BLOCKLIST filter to exclude junk links.
 *
 * @param {string} html - Raw HTML body of the email.
 * @returns {string|null} The best URL found, or null if nothing usable.
 */
function findBestUrl_(html) {
  if (!html) return null;

  //  PHASE 1: Parse all <a> tags into structured link objects 
  // We iterate each anchor individually to avoid the "first link wins" regex bug.
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  let anchorMatch;

  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const href = anchorMatch[1].trim();
    const innerHtml = anchorMatch[2] || '';

    // Strip HTML from inner text for cleaner keyword matching
    const innerText = innerHtml.replace(/<[^>]+>/g, '').trim();

    // Immediately discard blocked URLs
    if (isBlockedUrl_(href)) continue;

    links.push({ href, innerText, innerHtml });
  }

  //  TIER 0: Direct PDF Links 
  const pdfLink = links.find(l => /\.pdf(\?|$|#)/i.test(l.href));
  if (pdfLink) {
    Logger.log(`[URL] Tier 0 (PDF): ${pdfLink.href}`);
    return pdfLink.href;
  }

  //  TIER 1A: PRIMARY CTA Button Links 
  // "Read Full Announcement", "Read full Evening Wrap", etc.
  const primaryCta = links.find(l => {
    const text = l.innerText || l.innerHtml;
    return CTA_PRIMARY.test(text) && !CTA_JUNK_TEXT.test(text);
  });
  if (primaryCta) {
    Logger.log(`[URL] Tier 1A (Primary CTA "${primaryCta.innerText.substring(0, 40)}"): ${primaryCta.href}`);
    return primaryCta.href;
  }

  //  TIER 1B: SECONDARY CTA Button Links 
  // "View Online", "Web Version"  only if no primary CTA found.
  const secondaryCta = links.find(l => {
    const text = l.innerText || l.innerHtml;
    return CTA_SECONDARY.test(text) && !CTA_JUNK_TEXT.test(text);
  });
  if (secondaryCta) {
    Logger.log(`[URL] Tier 1B (Secondary CTA "${secondaryCta.innerText.substring(0, 40)}"): ${secondaryCta.href}`);
    return secondaryCta.href;
  }

  //  TIER 2: Content-Path Links 
  // URLs with paths that indicate real article/announcement/report content.
  const contentPaths = [
    '/asx-announcements/',
    '/announcement',
    '/news/',
    '/market-news/',
    '/reports/',
    '/report/',
    '/insights/',
    '/alerts/',
    'displayAnnouncement',
  ];
  const contentLink = links.find(l =>
    contentPaths.some(path => l.href.includes(path))
  );
  if (contentLink) {
    Logger.log(`[URL] Tier 2 (Content Path): ${contentLink.href}`);
    return contentLink.href;
  }

  //  TIER 3: Stock-Specific Pages 
  // URLs like marketindex.com.au/asx/BHP/announcements (deep pages, not just /asx/BHP)
  const stockDeepLink = links.find(l => {
    if (!l.href.includes('/asx/')) return false;
    const afterAsx = l.href.split('/asx/')[1] || '';
    // Must have more path segments beyond the ticker code itself
    return afterAsx.includes('/') || afterAsx.length > 6;
  });
  if (stockDeepLink) {
    Logger.log(`[URL] Tier 3 (Stock Deep): ${stockDeepLink.href}`);
    return stockDeepLink.href;
  }

  //  TIER 4: Any Trusted-Domain Link 
  // Sweep all links from trusted domains (marketindex, asx, mandrill tracking)
  const trustedLink = links.find(l => TRUSTED_DOMAINS.test(l.href));
  if (trustedLink) {
    Logger.log(`[URL] Tier 4 (Trusted Domain): ${trustedLink.href}`);
    return trustedLink.href;
  }

  //  PHASE 2: Fallback  Regex sweep of raw HTML for non-anchor URLs 
  // Some emails embed URLs in tracking pixels or inline styles.
  const rawUrlRegex = /https?:\/\/(?:www\.)?(?:marketindex\.com\.au|asx\.com\.au|mandrillapp\.com\/track\/click)\/[^\s"'<>]+/gi;
  const rawUrls = (html.match(rawUrlRegex) || []).filter(url => !isBlockedUrl_(url));

  if (rawUrls.length > 0) {
    // Apply same priority within raw URLs
    const rawPdf = rawUrls.find(u => /\.pdf(\?|$|#)/i.test(u));
    if (rawPdf) {
      Logger.log(`[URL] Fallback (Raw PDF): ${rawPdf}`);
      return rawPdf;
    }

    const rawContent = rawUrls.find(u =>
      contentPaths.some(path => u.includes(path))
    );
    if (rawContent) {
      Logger.log(`[URL] Fallback (Raw Content): ${rawContent}`);
      return rawContent;
    }

    Logger.log(`[URL] Fallback (Raw First): ${rawUrls[0]}`);
    return rawUrls[0];
  }

  Logger.log('[URL]   No usable URL found in email body.');
  return null;
}

/**
 * Checks a URL against the blocklist.
 * @param {string} url
 * @returns {boolean} True if the URL should be discarded.
 */
function isBlockedUrl_(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return URL_BLOCKLIST.some(fragment => lower.includes(fragment));
}

// =============================================================================
// 5. FIRESTORE CONNECTORS
// =============================================================================

/**
 * Writes a batch of items to Firestore as a single stream document.
 *
 * Uses an inverse-timestamp document ID so that Firestore naturally orders
 * documents newest-first (smallest ID = newest) without requiring a composite
 * index or orderBy query.
 *
 * @param {string} batchType - 'COMPANY_ALERTS' or 'MARKET_REPORT'
 * @param {Array} items - Array of extracted data objects.
 * @param {Function} mapFn - Function to convert each item to Firestore field format.
 * @returns {boolean} True if the write succeeded (HTTP < 400).
 */
function writeToStream_(batchType, items, mapFn) {
  // Inverse timestamp ensures newest documents have the smallest ID
  const inverseTime = (Number.MAX_SAFE_INTEGER - Date.now()).toString().padStart(16, '0');
  const suffix = batchType === 'COMPANY_ALERTS' ? 'alerts' : 'reports';
  const docId = `stream_${inverseTime}_${suffix}`;
  const docPath = `${MI_CONFIG.STREAM_PATH}/${docId}`;

  const payload = {
    fields: {
      batchType: { stringValue: batchType },
      timestamp: { integerValue: Date.now().toString() },
      items: {
        arrayValue: {
          values: items.map(mapFn),
        },
      },
    },
  };

  return writeFirestoreDoc_(docPath, payload);
}

/**
 * Converts an alert item to Firestore REST API field format.
 * @param {Object} item
 * @returns {Object} Firestore mapValue
 */
function mapAlertFields_(item) {
  return {
    mapValue: {
      fields: {
        code: { stringValue: item.code || 'UNKNOWN' },
        headline: { stringValue: item.headline || '' },
        date: { stringValue: item.date || '' },
        timestamp: { integerValue: (item.timestamp || 0).toString() },
        link: { stringValue: item.link || '' },
        type: { stringValue: item.type || 'announcement' },
        source: { stringValue: item.source || 'MarketIndex' },
      },
    },
  };
}

/**
 * Converts a report item to Firestore REST API field format.
 * @param {Object} item
 * @returns {Object} Firestore mapValue
 */
function mapReportFields_(item) {
  return {
    mapValue: {
      fields: {
        code: { stringValue: 'MARKET' }, // Explicit for frontend stability
        title: { stringValue: item.title || '' },
        summary: { stringValue: item.summary || '' },
        date: { stringValue: item.date || '' },
        timestamp: { integerValue: (item.timestamp || 0).toString() },
        link: { stringValue: item.link || '' },
        type: { stringValue: item.type || 'report' },
      },
    },
  };
}

/**
 * Low-level Firestore REST API writer.
 * Uses PATCH (upsert) to create or overwrite a document.
 *
 * @param {string} docPath - Full document path relative to the database root.
 * @param {Object} payload - Firestore document payload with `fields` property.
 * @returns {boolean} True if the response code is < 400.
 */
function writeFirestoreDoc_(docPath, payload) {
  const url = `${MI_CONFIG.FIREBASE.BASE_URL}/projects/${MI_CONFIG.FIREBASE.PROJECT_ID}/databases/(default)/documents/${docPath}`;

  try {
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();

    if (code >= 400) {
      Logger.log(`[Firestore]  Write FAILED (HTTP ${code}): ${response.getContentText().substring(0, 300)}`);
      return false;
    }

    return true;
  } catch (e) {
    Logger.log(`[Firestore]  Exception: ${e.message}`);
    return false;
  }
}

// =============================================================================
// 6. TRIGGER MANAGEMENT
// =============================================================================

/**
 *  ONE-TIME SETUP
 * Run this function once to register the time-based trigger.
 * It will clean up any existing trigger for this function first.
 */
function setupTrigger() {
  // Remove existing triggers for this function to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processMarketIndexEmails') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('[Setup]   Removed existing trigger.');
    }
  });

  // Create new 10-minute interval trigger
  ScriptApp.newTrigger('processMarketIndexEmails')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('[Setup]  Trigger created. Emails will be processed every 10 minutes.');
  Logger.log(`[Setup]  Trash mode: ${MI_CONFIG.TRASH_AFTER_SUCCESS ? 'PRODUCTION (will trash)' : 'TESTING (mark read only)'}`);
}

/**
 *  MANUAL TEST RUN
 * Runs the pipeline once immediately. Useful for testing without waiting
 * for the trigger interval.
 */
function manualRun() {
  Logger.log('');
  Logger.log('  MANUAL RUN  Market Index Pipeline');
  Logger.log(`  Trash Mode: ${MI_CONFIG.TRASH_AFTER_SUCCESS ? 'PRODUCTION' : 'TESTING'}`);
  Logger.log('');
  processMarketIndexEmails();
}

// =============================================================================
// =============================================================================
// 7. DIAGNOSTIC TOOLS
// =============================================================================

function diagnoseMI() {
  Logger.log('=== DIAGNOSTIC - Gmail Search Debug ===');

  const queries = [
    MI_CONFIG.GMAIL_QUERY,
    'from:marketindex in:trash',
    'subject:"Morning Wrap" in:trash',
    'subject:"Evening Wrap" in:trash'
  ];

  queries.forEach(q => {
    try {
      const results = GmailApp.search(q, 0, 10);
      Logger.log('\nQuery: "' + q + '" -> ' + results.length + ' thread(s)');
      results.forEach((thread, i) => {
        const msg = thread.getMessages()[0];
        const subject = msg.getSubject();
        const unread = thread.isUnread();
        const date = msg.getDate();
        const classification = classifySubject_(subject);
        Logger.log('  [' + i + '] ' + date.toLocaleDateString() + ' | ' + (unread ? 'UNREAD' : 'read') + ' | Class: ' + classification);
        Logger.log('      Subject: "' + subject + '"');
      });
    } catch (e) {
      Logger.log('Query: "' + q + '" -> ERROR: ' + e.message);
    }
  });

  Logger.log('\nConfig Check:');
  Logger.log('  ENABLED = ' + MI_CONFIG.ENABLED);
  Logger.log('  GMAIL_QUERY = "' + MI_CONFIG.GMAIL_QUERY + '"');
  Logger.log('  TRASH_AFTER_SUCCESS = ' + MI_CONFIG.TRASH_AFTER_SUCCESS);
  Logger.log('\n=== Diagnostic complete ===');
}

/**
 * VERIFY - Reads back data from Firestore to confirm writes persisted.
 * Run this after manualRun() to check if data actually exists.
 */
function verifyFirestoreData() {
  Logger.log('=== VERIFY - Firestore Data Check ===');
  const collectionPath = MI_CONFIG.STREAM_PATH;
  const url = MI_CONFIG.FIREBASE.BASE_URL + '/projects/' + MI_CONFIG.FIREBASE.PROJECT_ID + '/databases/(default)/documents/' + collectionPath + '?pageSize=15&orderBy=timestamp%20desc';

  try {
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    Logger.log('HTTP Status: ' + code);

    if (code >= 400) {
      Logger.log('FAILED: ' + response.getContentText().substring(0, 500));
      return;
    }

    const data = JSON.parse(response.getContentText());
    const docs = data.documents || [];

    Logger.log('Documents found: ' + docs.length);

    docs.forEach((doc, i) => {
      const name = doc.name || 'unknown';
      const shortName = name.split('/').pop();
      const fields = doc.fields || {};
      const batchType = fields.batchType ? fields.batchType.stringValue : 'N/A';
      const items = fields.items && fields.items.arrayValue ? fields.items.arrayValue.values || [] : [];

      Logger.log('\n[Doc ' + (i + 1) + '] ' + shortName + ' | Type: ' + batchType + ' | Items: ' + items.length);

      items.forEach((item, j) => {
        const f = item.mapValue ? item.mapValue.fields : {};
        const code = f.code ? f.code.stringValue : '';
        const headline = f.headline ? f.headline.stringValue : f.title ? f.title.stringValue : '';
        Logger.log('    -> ' + (code ? '[' + code + '] ' : '') + headline.substring(0, 60));
      });
    });

  } catch (e) {
    Logger.log('Error: ' + e.message);
  }
  Logger.log('\n=== VERIFY COMPLETE ===');
}
