/**
 * MailService.js
 * Client-side Gmail integration for Market Index alerts.
 * 
 * This service allows each user to scan their own inbox for notifications,
 * making the app truly multi-user and privacy-respecting.
 */

export const MailService = {
    CONFIG: {
        GMAIL_QUERY: 'marketindex is:unread',
        BASE_URL: 'https://gmail.googleapis.com/gmail/v1/users/me'
    },

    /**
     * Fetches unread Market Index emails and parses them into structured alerts.
     * @returns {Promise<Array>} List of extracted alerts.
     */
    async fetchMarketAlerts() {
        const token = localStorage.getItem('asx_gmail_token');
        if (!token) {
            console.warn('[MailService] No Gmail access token found. User may need to re-login.');
            return [];
        }

        try {
            // 1. Search for matching threads
            const searchUrl = `${this.CONFIG.BASE_URL}/messages?q=${encodeURIComponent(this.CONFIG.GMAIL_QUERY)}&maxResults=10`;
            const searchRes = await fetch(searchUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!searchRes.ok) {
                if (searchRes.status === 401) {
                    console.error('[MailService] Access token expired.');
                    localStorage.removeItem('asx_gmail_token');
                }
                return [];
            }

            const searchData = await searchRes.json();
            if (!searchData.messages || searchData.messages.length === 0) {
                return [];
            }

            const alerts = [];
            
            // 2. Fetch and parse each message
            for (const msgRef of searchData.messages) {
                const msgUrl = `${this.CONFIG.BASE_URL}/messages/${msgRef.id}`;
                const msgRes = await fetch(msgUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (msgRes.ok) {
                    const msgData = await msgRes.json();
                    const parsed = this._parseMessage(msgData);
                    if (parsed) alerts.push(parsed);
                }
            }

            return alerts;

        } catch (e) {
            console.error('[MailService] Failed to fetch alerts:', e);
            return [];
        }
    },

    /**
     * Internal: Parses Gmail message payload into structured alert.
     */
    _parseMessage(msg) {
        try {
            const headers = msg.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const dateStr = headers.find(h => h.name === 'Date')?.value || '';
            const timestamp = new Date(dateStr).getTime();

            // Find HTML body
            let body = '';
            if (msg.payload.parts) {
                const htmlPart = msg.payload.parts.find(p => p.mimeType === 'text/html');
                if (htmlPart && htmlPart.body.data) {
                    body = this._decodeBase64(htmlPart.body.data);
                }
            } else if (msg.payload.body.data) {
                body = this._decodeBase64(msg.payload.body.data);
            }

            // Classification Logic (Ported from integration script)
            const isReport = /WRAP|RAP|REPORT|MIDDAY|MORNING|EVENING|AFTERNOON/i.test(subject);
            
            if (isReport) {
                return {
                    id: `MARKET-${timestamp}`,
                    code: 'MARKET',
                    title: subject,
                    timestamp,
                    date: new Date(timestamp).toISOString(),
                    type: 'report',
                    summary: this._extractSummary(body),
                    link: this._extractLink(body) || 'https://www.marketindex.com.au'
                };
            } else {
                // Company Alert Logic
                const codeMatch = subject.match(/\[([A-Z0-9]{2,5})\]/i) || subject.match(/^ASX:([A-Z0-9]{2,5})/i);
                const code = codeMatch ? codeMatch[1].toUpperCase() : 'UNKNOWN';
                
                return {
                    id: `${code}-${timestamp}`,
                    code,
                    headline: subject,
                    timestamp,
                    date: new Date(timestamp).toISOString(),
                    type: 'announcement',
                    link: this._extractLink(body) || `https://www.marketindex.com.au/asx/${code.toLowerCase()}`
                };
            }
        } catch (e) {
            console.error('[MailService] Parse error:', e);
            return null;
        }
    },

    /**
     * Marks messages as read (removes UNREAD label).
     */
    async markAsRead(messageIds) {
        const token = localStorage.getItem('asx_gmail_token');
        if (!token || !messageIds.length) return;

        try {
            await fetch(`${this.CONFIG.BASE_URL}/messages/batchModify`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ids: messageIds,
                    removeLabelIds: ['UNREAD']
                })
            });
        } catch (e) {
            console.error('[MailService] Failed to mark as read:', e);
        }
    },

    _decodeBase64(data) {
        return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
    },

    _extractLink(html) {
        // Tiered extraction logic similar to GAS script
        const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const links = [];
        while ((match = anchorRegex.exec(html)) !== null) {
            const href = match[1];
            const text = match[2].replace(/<[^>]+>/g, '').trim();
            if (text.match(/Read Full|Read Online|Evening Wrap|Morning Wrap/i)) return href;
            links.push(href);
        }
        return links.find(l => l.includes('/asx-announcements/') || l.includes('/reports/')) || links[0];
    },

    _extractSummary(html) {
        return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim()
                   .substring(0, 150) + '...';
    }
};
