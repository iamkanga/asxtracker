/**
 * ============================================================================
 * 📰 MARKET INDEX INTEGRATION (PHASE 1: HEADLINE STREAMER)
 * ============================================================================
 * 
 * OBJECTIVE:
 * A lightweight "Sidecar" script to ingest Market Index emails (Company Alerts & Reports),
 * stripping the inbox of noise and piping the headlines directly into the App.
 * 
 * FEATURES:
 * 1. SCOUT: Monitors Gmail for 'no-reply@marketindex.com.au'.
 * 2. FILTER: Separates "Company Alerts" (Stock Specific) from "Market Reports" (General).
 * 3. INJECT: Pushes structured data to Firestore (Alerts & Reports collections).
 * 4. CLEAN: Auto-trashes processed emails to keep Inbox Zero.
 * 
 * ARCHITECTURE:
 * - Standalone: Does NOT depend on global-alerts.gs (Self-contained Config).
 * - Dumb Pipe: No complex parsing, just Subject/Link extraction.
 * 
 * USAGE:
 * 1. Run 'setupMarketIndexTriggers()' once to activate.
 * 2. Toggle 'ENABLED: false' to pause without deleting triggers.
 */

const MARKET_INDEX_CONFIG = {
  ENABLED: true,  // Master Kill Switch
  GMAIL_QUERY: 'marketindex.com.au is:unread',
  // GMAIL_QUERY: 'marketindex.com.au', // Use this for testing existing read emails
  BATCH_SIZE: 10, // Process max 10 threads per run to avoid timeouts
  FIREBASE: {
    PROJECT_ID: 'asx-watchlist-app',
    DEFAULT_USER_ID: 'sh3zcZGXSceviejDNJQsjRJjVgJ3', // Default bucket if user matching fails
    BASE_URL: 'https://firestore.googleapis.com/v1'
  }
};

// ============================================================================
// 1. MAIN PROCESSOR
// ============================================================================

/**
 * 🟢 JOB: The Main Trigger Function
 * Run this every 10-15 minutes.
 */
function processMarketIndexEmails() {
  if (!MARKET_INDEX_CONFIG.ENABLED) {
    console.log('[MarketIndex] Integration is DISABLED. Skipping.');
    return;
  }

  console.log('[MarketIndex] Scouting for new emails...');

  try {
    // 1. SCOUT
    const threads = GmailApp.search(MARKET_INDEX_CONFIG.GMAIL_QUERY, 0, MARKET_INDEX_CONFIG.BATCH_SIZE);
    if (threads.length === 0) {
      console.log('[MarketIndex] No new emails found.');
      return;
    }

    console.log(`[MarketIndex] Processing ${threads.length} threads...`);
    
    // 2. PROCESS LOOP
    const alertsBatch = [];
    const reportsBatch = [];

    threads.forEach((thread, tIdx) => {
      const messages = thread.getMessages();
      console.log(`[MarketIndex] Thread ${tIdx + 1}/${threads.length} (${messages.length} messages)...`);
      
      messages.forEach(msg => {
        // Skip read messages if we are only looking for unread
        if (MARKET_INDEX_CONFIG.GMAIL_QUERY.includes('is:unread') && !msg.isUnread()) return; 
        
        const subject = msg.getSubject();
        // OPTIMIZATION: Market Index emails are HTML. We only need the HTML body for parsing.
        // Fetching both and combining them doubled regex processing time.
        const bodyHtml = msg.getBody(); 
        const date = msg.getDate();
        const link = `https://mail.google.com/mail/u/0/#inbox/${msg.getId()}`; 
        
        // A. CLASSIFY
        const type = classifyEmail_(subject);
        
        if (type === 'COMPANY_ALERT') {
            const data = extractCompanyAlertData_(subject, bodyHtml, date, link);
            if (data) alertsBatch.push(data);
        } else if (type === 'MARKET_REPORT') {
            const data = extractMarketReportData_(subject, bodyHtml, date, link);
            if (data) reportsBatch.push(data);
        } else {
            console.warn(`[MarketIndex] Unclassified Email: "${subject}" - Skipping.`);
        }
      });
      
      // 3. IMMEDIATE CLEANUP (Anti-Timeout Strategy)
      // We move threads to trash IMMEDIATELY after processing their messages.
      // This ensures that if the script times out later in the loop, we don't 
      // duplicate work in the next run.
      GmailApp.moveThreadToTrash(thread);
    });

    // 4. INJECT (Batch Writes to Firestore)
    if (alertsBatch.length > 0) {
        saveAlertsToFirestore_(alertsBatch);
        console.log(`[MarketIndex] Injected ${alertsBatch.length} Company Alerts.`);
    }
    
    if (reportsBatch.length > 0) {
        saveReportsToFirestore_(reportsBatch);
        console.log(`[MarketIndex] Injected ${reportsBatch.length} Market Reports.`);
    }

    console.log('[MarketIndex] Cycle Complete.');

  } catch (e) {
    console.error('[MarketIndex] CRITICAL FAILURE:', e);
  }
}

// ============================================================================
// 2. PARSING LOGIC (The "Dumb" Parser)
// ============================================================================

/**
 * Distinguishes between News/Alerts and Reports based on Subject Line.
 */
function classifyEmail_(subject) {
  const s = subject.toUpperCase();
  
  if (s.includes('REPORT') || s.includes('WRAP') || s.includes('WEEKLY') || s.includes('MIDDAY') || s.includes('CHART') || s.includes('MORNING') || s.includes('EVENING') || s.includes('PREVIEW')) {
    return 'MARKET_REPORT';
  }
  
  // Typical Format: "[BHP] Change in substantial holding"
  if (s.includes('[') && s.includes(']')) {
    return 'COMPANY_ALERT';
  }
  
  if (s.match(/^[A-Z]{3,6}\s*:/)) { // "BHP: Headline" or "BHP : Headline"
     return 'COMPANY_ALERT';
  }
  
  if (s.includes('PRICE PAUSE') || s.includes('TRADING HALT') || s.includes('REINSTATEMENT')) {
     return 'COMPANY_ALERT';
  }
  
  return 'UNKNOWN';
}

/**
 * Extracts structured data from Company Alerts.
 * Subject format often: "[BHP] Change in substantial holding"
 */
function extractCompanyAlertData_(subject, body, date, emailLink) {
  try {
    let code = 'UNKNOWN';
    let headline = subject;
    
    // Pattern 1: [BHP] Headline
    const bracketMatch = subject.match(/\[([A-Za-z0-9]{3,})\]\s*(.*)/);
    // Pattern 2: BHP: Headline
    const colonMatch = subject.match(/^([A-Za-z0-9]{3,})\s*:\s*(.*)/);

    if (bracketMatch) {
      code = bracketMatch[1].toUpperCase();
      headline = bracketMatch[2].trim();
    } else if (colonMatch) {
      code = colonMatch[1].toUpperCase();
      headline = colonMatch[2].trim();
    }

    // Use centralized link extractor
    const finalLink = getBestMarketIndexUrl_(body, emailLink);
    
    return {
      code: code,
      headline: headline,
      date: date.toISOString(),
      timestamp: date.getTime(),
      source: 'MarketIndex',
      link: finalLink, 
      type: 'announcement'
    };
  } catch (e) {
    console.warn('[MarketIndex] Parse Error (Alert):', e);
    return null;
  }
}

/**
 * Extracts structured data from Market Reports.
 */
function extractMarketReportData_(subject, bodyHtml, date, emailLink) {
  // Use centralized link extractor
  const finalLink = getBestMarketIndexUrl_(bodyHtml, emailLink);
  
  // Strip HTML for a clean summary
  const summary = bodyHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200) + '...';

  return {
    title: subject,
    date: date.toISOString(),
    timestamp: date.getTime(),
    summary: summary, 
    link: finalLink,
    type: 'report'
  };
}

function getBestMarketIndexUrl_(body, fallback) {
  // 0. TOP PRIORITY: Primary CTAs (Read Full Announcement, Read Online, View in Browser, etc.)
  // PERFORMANCE FIX: Refactored to search each <a> tag individually to prevent "catastrophic matching" 
  // where the regex accidentally grabs the very first link in the email instead of the button's link.
  const anchorsPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  
  while ((match = anchorsPattern.exec(body)) !== null) {
      const link = match[1];
      const text = match[2];
      
      const ctaPattern = /Read Full|Read Online|Read Article|View.*Browser|Web Version|View Online|Read Story|Read More|Read Next|Morning Wrap|Evening Wrap|Read this online|Open in browser/i;
      
      if (ctaPattern.test(text)) {
          if (!link.includes('unsubscribe') && !link.includes('privacy') && !link.includes('preferences')) {
              return link;
          }
      }
  }

  // 1. PERFORMANCE FIX: Use a more targeted regex for URLs instead of matching everything first
  // Added support for Mandrill tracking links which Market Index uses for their emails
  const targetUrlPattern = /https?:\/\/(?:www\.)?(?:marketindex\.com\.au|asx\.com\.au|mandrillapp\.com\/track\/click)\/[^\s\"\'\>]+/gi;
  const bodyLinks = (body.match(targetUrlPattern) || []).filter(url => 
    !url.includes('unsubscribe') && 
    !url.includes('privacy') && 
    !url.includes('manage-watchlist') &&
    !url.includes('advertise') &&
    !url.includes('preferences') &&
    !url.includes('google.com')
  );
  
  if (bodyLinks.length === 0) return fallback;

  // 1. Priority: Direct PDF links (The "Actual File")
  const pdfLink = bodyLinks.find(url => url.toLowerCase().includes('.pdf'));
  if (pdfLink) return pdfLink;

  // 2. Priority: News/Announcement specific links
  const contentLink = bodyLinks.find(url => 
    url.includes('/asx-announcements/') || 
    url.includes('/announcement') ||
    url.includes('/news/') ||
    url.includes('/market-news/') ||
    url.includes('/reports/') ||
    url.includes('/report/') ||
    url.includes('/insights/') ||
    url.includes('/alerts/') ||
    url.includes('displayAnnouncement') // ASX specific
  );
  if (contentLink) return contentLink;

  // 3. Priority: Stock pages (Fallback for metadata)
  const stockLink = bodyLinks.find(url => {
      if (!url.includes('/asx/')) return false;
      const parts = url.split('/');
      const lastPart = parts[parts.length - 1];
      return lastPart.length > 6 || parts.length > 5;
  });
  if (stockLink) return stockLink;

  // 4. Fallback: First stock link (/asx/CODE)
  const basicStockLink = bodyLinks.find(url => url.includes('/asx/'));
  if (basicStockLink) return basicStockLink;

  // 5. Ultimate Fallback: First relevant link found
  return bodyLinks[0] || fallback;
}

// ============================================================================
// 3. FIRESTORE CONNECTORS
// ============================================================================

/** 
 * Writes batch of alerts to a shared 'INBOX' collection or daily bucket.
 * Destination: artifacts/asx-watchlist-app/alerts/STREAM_COMPANY_ALERTS
 */
function saveAlertsToFirestore_(items) {
  const docPath = `artifacts/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/alerts/STREAM_HEADLINES`;
  
  // 1. Fetch Existing
  const existing = getFirestoreDocMI_(docPath);
  let masterList = [];
  
  // FORCE PUSH STRATEGY: 
  // We use an INVERSE TIMESTAMP so that Firestore naturally orders them newest-first 
  // without needing a complex index or orderBy query which can fail.
  const inverseTime = (Number.MAX_SAFE_INTEGER - Date.now()).toString().padStart(16, '0');
  const streamId = `stream_${inverseTime}_alerts`;
  const streamPath = `artifacts/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/alerts_stream/${streamId}`;
  
  const batchPayload = {
      fields: {
          batchType: { stringValue: 'COMPANY_ALERTS' },
          timestamp: { integerValue: Date.now().toString() },
          items: { arrayValue: { values: items.map(mapAlertToFirestore_) } }
      }
  };
  
  writeFirestoreDocMI_(streamPath, batchPayload);
}

function saveReportsToFirestore_(items) {
  const inverseTime = (Number.MAX_SAFE_INTEGER - Date.now()).toString().padStart(16, '0');
  const streamId = `stream_${inverseTime}_reports`;
  const streamPath = `artifacts/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/alerts_stream/${streamId}`;
  
  const batchPayload = {
      fields: {
          batchType: { stringValue: 'MARKET_REPORT' },
          timestamp: { integerValue: Date.now().toString() },
          items: { arrayValue: { values: items.map(mapReportToFirestore_) } }
      }
  };
  
  writeFirestoreDocMI_(streamPath, batchPayload);
}


// --- HELPERS ---

function mapAlertToFirestore_(item) {
    return {
        mapValue: {
            fields: {
                code: { stringValue: item.code },
                headline: { stringValue: item.headline },
                date: { stringValue: item.date },
                timestamp: { integerValue: item.timestamp.toString() },
                link: { stringValue: item.link },
                type: { stringValue: item.type }
            }
        }
    };
}

function mapReportToFirestore_(item) {
    return {
        mapValue: {
            fields: {
                title: { stringValue: item.title },
                summary: { stringValue: item.summary },
                date: { stringValue: item.date },
                timestamp: { integerValue: item.timestamp.toString() },
                link: { stringValue: item.link },
                type: { stringValue: item.type }
            }
        }
    };
}

// Isolated Firestore Helpers
function writeFirestoreDocMI_(pathFragment, payload) {
    const firestoreUrl = `${MARKET_INDEX_CONFIG.FIREBASE.BASE_URL}/projects/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/databases/(default)/documents/${pathFragment}`;
    const token = ScriptApp.getOAuthToken();
    
    try {
        UrlFetchApp.fetch(firestoreUrl, {
            method: 'patch',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch (e) {
        console.warn('[MarketIndex] FireStore Write Fail (Standard/Patch):', e);
    }
}

function getFirestoreDocMI_(path) {
  return null; 
}

// ============================================================================
// 4. SETUP
// ============================================================================

/**
 * 🛠️ SETUP TRIGGER
 * Run this ONCE to start the "Headline Streamer".
 */
function setupMarketIndexTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  
  triggers.forEach(t => {
      if (t.getHandlerFunction() === 'processMarketIndexEmails') {
          ScriptApp.deleteTrigger(t);
      }
  });
  
  console.log('[Setup] Creating Market Index Trigger...');
  
  ScriptApp.newTrigger('processMarketIndexEmails')
    .timeBased()
    .everyMinutes(10)
    .create();
    
  console.log('[Setup] ✅ Streamer Active. Emails will be processed every 10 mins.');
}

/**
 * 🛠️ MANUAL SYNC (Run this to fetch existing read emails)
 */
function syncMarketIndexHistory() {
  const historyQuery = 'marketindex.com.au -in:trash'; 
  console.log('[MarketIndex] Performing Manual History Sync...');
  
  try {
    const originalValue = MARKET_INDEX_CONFIG.GMAIL_QUERY;
    MARKET_INDEX_CONFIG.GMAIL_QUERY = historyQuery;
    processMarketIndexEmails();
    console.log('[MarketIndex] Manual Sync Complete.');
  } catch (e) {
    console.error('[MarketIndex] Manual Sync Failed:', e);
  }
}
