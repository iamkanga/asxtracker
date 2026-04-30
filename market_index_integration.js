/**
 * 📰 MARKET INDEX INTEGRATION (FULL STABILIZED VERSION)
 * 
 * OBJECTIVE:
 * A lightweight "Sidecar" script to ingest Market Index emails (Company Alerts & Reports),
 * stripping the inbox of noise and piping the headlines directly into the App.
 */

const MARKET_INDEX_CONFIG = {
  ENABLED: true,
  GMAIL_QUERY: 'marketindex.com.au is:unread',
  BATCH_SIZE: 10,
  FIREBASE: {
    PROJECT_ID: 'asx-watchlist-app',
    BASE_URL: 'https://firestore.googleapis.com/v1'
  }
};

/**
 * 🟢 MAIN TRIGGER: Run this to process emails
 */
function processMarketIndexEmails() {
  if (!MARKET_INDEX_CONFIG.ENABLED) return;
  console.log('[MarketIndex] Scouting for new emails...');

  try {
    const threads = GmailApp.search(MARKET_INDEX_CONFIG.GMAIL_QUERY, 0, MARKET_INDEX_CONFIG.BATCH_SIZE);
    if (threads.length === 0) {
      console.log('[MarketIndex] No new emails found.');
      return;
    }

    const alertsBatch = [];
    const reportsBatch = [];
    const processedThreads = [];

    threads.forEach(thread => {
      thread.getMessages().forEach(msg => {
        if (MARKET_INDEX_CONFIG.GMAIL_QUERY.includes('is:unread') && !msg.isUnread()) return; 
        
        const subject = msg.getSubject();
        const bodyHtml = msg.getBody(); 
        const date = msg.getDate();
        const link = `https://mail.google.com/mail/u/0/#inbox/${msg.getId()}`; 
        const type = classifyEmail_(subject);
        
        if (type === 'COMPANY_ALERT') {
            const data = extractCompanyAlertData_(subject, bodyHtml, date, link);
            if (data) alertsBatch.push(data);
        } else if (type === 'MARKET_REPORT') {
            const data = extractMarketReportData_(subject, bodyHtml, date, link);
            if (data) reportsBatch.push(data);
        }
      });
      processedThreads.push(thread);
    });

    let alertsSuccess = true;
    if (alertsBatch.length > 0) {
        alertsSuccess = saveAlertsToFirestore_(alertsBatch);
        if (alertsSuccess) console.log(`[MarketIndex] Injected ${alertsBatch.length} Company Alerts.`);
    }
    
    let reportsSuccess = true;
    if (reportsBatch.length > 0) {
        reportsSuccess = saveReportsToFirestore_(reportsBatch);
        if (reportsSuccess) console.log(`[MarketIndex] Injected ${reportsBatch.length} Market Reports.`);
    }

    if (alertsSuccess && reportsSuccess) {
        processedThreads.forEach(thread => GmailApp.moveThreadToTrash(thread));
        console.log('[MarketIndex] Cycle Complete. Threads Trashed.');
    }
  } catch (e) {
    console.error('[MarketIndex] failure:', e);
  }
}

// --- CLASSIFICATION & PARSING ---

function classifyEmail_(subject) {
  const s = subject.toUpperCase();
  if (s.includes('[') && s.includes(']') && !s.includes('MARKET INDEX')) {
    return 'COMPANY_ALERT';
  }
  if (s.includes('REPORT') || s.includes('WRAP') || s.includes('RAP') || s.includes('MIDDAY') || s.includes('UPDATE')) {
    return 'MARKET_REPORT';
  }
  return 'UNKNOWN';
}

function extractCompanyAlertData_(subject, body, date, emailLink) {
  let code = 'UNKNOWN';
  let headline = subject;
  const bracketMatch = subject.match(/\[([A-Za-z0-9]{2,6})\]\s*(.*)/i);
  if (bracketMatch) {
    code = bracketMatch[1].toUpperCase();
    headline = bracketMatch[2].trim();
  }
  return {
    code: code,
    headline: headline,
    date: date.toISOString(),
    timestamp: date.getTime(),
    link: getBestMarketIndexUrl_(body, emailLink),
    type: 'announcement'
  };
}

function extractMarketReportData_(subject, bodyHtml, date, emailLink) {
  const summary = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200) + '...';
  return {
    code: 'MARKET',
    headline: subject,
    date: date.toISOString(),
    timestamp: date.getTime(),
    summary: summary, 
    link: getBestMarketIndexUrl_(bodyHtml, emailLink),
    type: 'report'
  };
}

function getBestMarketIndexUrl_(body, fallback) {
  const targetUrlPattern = /https?:\/\/(?:www\.)?(?:marketindex\.com\.au|asx\.com\.au|mandrillapp\.com\/track\/click)\/[^\s\"\'\>]+/gi;
  const matches = body.match(targetUrlPattern) || [];
  const filtered = matches.filter(url => !url.includes('unsubscribe') && !url.includes('preferences'));
  return filtered[0] || fallback;
}

// --- FIRESTORE WRITERS ---

function mapToFirestore_(item) {
  return {
    mapValue: {
      fields: {
        code: { stringValue: String(item.code || 'UNKNOWN') },
        headline: { stringValue: String(item.headline || 'Announcement') },
        date: { stringValue: String(item.date) },
        timestamp: { integerValue: String(item.timestamp) },
        link: { stringValue: String(item.link || '#') },
        summary: { stringValue: String(item.summary || '') },
        type: { stringValue: String(item.type || 'announcement') }
      }
    }
  };
}

function saveAlertsToFirestore_(items) {
  const inverseTime = (9007199254740991 - Date.now()).toString();
  const path = `artifacts/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/alerts_stream/stream_${inverseTime}_alerts`;
  const payload = {
    fields: {
      batchType: { stringValue: 'COMPANY_ALERTS' },
      timestamp: { integerValue: Date.now().toString() },
      items: { arrayValue: { values: items.map(mapToFirestore_) } }
    }
  };
  return writeFirestoreDocMI_(path, payload);
}

function saveReportsToFirestore_(items) {
  const inverseTime = (9007199254740991 - Date.now()).toString();
  const path = `artifacts/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/alerts_stream/stream_${inverseTime}_reports`;
  const payload = {
    fields: {
      batchType: { stringValue: 'MARKET_REPORT' },
      timestamp: { integerValue: Date.now().toString() },
      items: { arrayValue: { values: items.map(mapToFirestore_) } }
    }
  };
  return writeFirestoreDocMI_(path, payload);
}

function writeFirestoreDocMI_(path, payload) {
  const url = `${MARKET_INDEX_CONFIG.FIREBASE.BASE_URL}/projects/${MARKET_INDEX_CONFIG.FIREBASE.PROJECT_ID}/databases/(default)/documents/${path}`;
  const token = ScriptApp.getOAuthToken();
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 400) {
      console.error("[DEBUG] Firestore Error: " + resp.getContentText());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[DEBUG] Network Error: " + e);
    return false;
  }
}

function setupMarketIndexTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => { if (t.getHandlerFunction() === 'processMarketIndexEmails') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processMarketIndexEmails').timeBased().everyMinutes(10).create();
  console.log('[Setup] ✅ Streamer Active.');
}

function syncMarketIndexHistory() {
  const historyQuery = 'marketindex.com.au -in:trash'; 
  console.log('[MarketIndex] Manual History Sync...');
  try {
    const originalValue = MARKET_INDEX_CONFIG.GMAIL_QUERY;
    MARKET_INDEX_CONFIG.GMAIL_QUERY = historyQuery;
    processMarketIndexEmails();
    MARKET_INDEX_CONFIG.GMAIL_QUERY = originalValue;
  } catch (e) {
    console.error('[MarketIndex] Manual Sync Failed:', e);
  }
}
