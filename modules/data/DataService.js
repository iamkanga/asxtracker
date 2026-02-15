/**
 * DataService.js
 * Handles fetching and normalizing stock price data from the API.
 */

const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbwwwMEss5DIYblLNbjIbt_TAzWh54AwrfQlVwCrT_P0S9xkAoXhAUEUg7vSEPYUPOZp/exec";

import { UserStore } from './UserStore.js';
import { db, AuthService } from '../auth/AuthService.js';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const APP_ID = "asx-watchlist-app";

// Initialize and Export UserStore Instance
export const userStore = new UserStore();
export { AuthService };

export class DataService {
    constructor() {
        this.API_ENDPOINT = API_ENDPOINT;
    }
    /**
     * Fetches live prices for specific codes or all stocks if no codes provided.
     * @param {string[]} [codesArray] - Optional array of ASX codes (e.g. ['BHP', 'CBA'])
     * @returns {Promise<Map<string, Object>>} - Map of clean price objects keyed by code.
     */
    async fetchLivePrices(codesArray = null) {
        try {
            const url = new URL(API_ENDPOINT);
            url.searchParams.append('_ts', Date.now()); // Prevent caching

            // API STRATEGY:
            // 1. Single Code: use ?stockCode=XYZ (Fastest)
            // 2. Multiple Codes: Fetch ALL (No params). 
            //    Reason: API fails with comma-separated list, and API ignores repeated params (only returns one).
            //    Fetching all is the only reliable way to get a batch.
            if (codesArray && codesArray.length === 1) {
                url.searchParams.append('stockCode', codesArray[0]);
            }

            // TRACE LOGGING
            // TIMEOUT PROTECTION (20 Seconds)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            try {
                const response = await fetch(url.toString(), { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.error(`DataService Fetch Error: ${response.status} ${response.statusText}`);
                    return { prices: new Map(), dashboard: [] };
                }

                const json = await response.json();

                // Normalize and return both prices and dashboard data
                return this._normalizePriceData(json);

            } catch (error) {
                if (error.name === 'AbortError') {
                    console.error("DataService: Fetch timed out (20s limit).");
                } else {
                    console.error("DataService Exception:", error);
                }
                return { prices: new Map(), dashboard: [] };
            }
        } catch (error) {
            // This outer catch handles errors from URL construction or initial setup
            console.error("DataService: Outer fetchLivePrices error:", error);
            return { prices: new Map(), dashboard: [] };
        }
    }

    /**
     * Triggers the Apps Script to synchronize user profile settings to central global settings.
     * Uses JSONP style fallback (callback param) as the Apps Script handles it via doGet.
     * @param {string} userId - The Firebase UID of the current user.
     */
    async syncUserSettings(userId) {
        if (!userId) return;
        try {
            const url = new URL(API_ENDPOINT);
            url.searchParams.append('userId', userId);
            url.searchParams.append('callback', 'sync_callback_' + Date.now());
            url.searchParams.append('_ts', Date.now());

            // We use a simple fetch. Since it's JSONP-style on the backend, 
            // it will return a 200 OK with a javascript body.
            const response = await fetch(url.toString());
            if (!response.ok) {
                console.warn(`DataService: Sync request failed with status ${response.status}`);
            }
        } catch (err) {
            console.error('DataService: Sync Exception:', err);
        }
    }

    /**
     * Generates a daily briefing via the backend AI service.
     * @param {Object} context - The portfolio context object.
     * @returns {Promise<string>} - The generated briefing text.
     */
    async generateBriefing(context) {
        try {
            const url = new URL(API_ENDPOINT);
            // Append a specific parameter so we could route via GET if needed, but we use POST.

            const user = AuthService.getCurrentUser();
            const userId = user ? user.uid : null;

            const payload = {
                action: 'generateBriefing',
                userId: userId,
                context: context
            };

            // Using 'no-cors' mode would prevent reading the response. 
            // We assume the GAS Web App is deployed as "Execute as Me" and "Access: Anyone".
            // Typically this allows simple CORS requests if we don't send custom headers.
            // We'll send data as text/plain (default) to avoid Preflight, 
            // enabling the backend to parse E.postData.contents.
            const response = await fetch(url.toString(), {
                method: 'POST',
                body: JSON.stringify(payload)
                // Do NOT set Content-Type: application/json to avoid preflight
            });

            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}` };
            }

            const json = await response.json();
            return json;
        } catch (err) {
            console.error('DataService: Briefing Gen Exception:', err);
            return { ok: false, error: err.message };
        }
    }


    /**
     * Calls Gemini AI to roast the user's portfolio.
     */
    async roastPortfolio(context) {
        try {
            const user = AuthService.getCurrentUser();
            const userId = user ? user.uid : null;

            if (!userId) {
                return { ok: false, error: 'User not logged in' };
            }

            const payload = {
                action: 'roastPortfolio',
                userId: userId,
                context: context
            };

            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('[DataService] Roast Portfolio HTTP Error:', response.status);
                return { ok: false, error: `HTTP ${response.status}` };
            }

            const json = await response.json();
            return json;
        } catch (err) {
            console.error('DataService: Roast Gen Exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Ask Gemini (Smart Alerts or Market Chat).
     * @param {string} mode 'explain' | 'chat'
     * @param {string} query User question (for chat)
     * @param {Object} context Portfolio data or stock info
     */
    async askGemini(mode, query, context) {
        try {
            const user = AuthService.getCurrentUser();
            const userId = user ? user.uid : null;

            if (!userId) return { ok: false, error: 'User not logged in' };

            const payload = {
                action: 'geminiQuery',
                userId: userId,
                mode: mode,
                query: query,
                context: context
            };
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('[DataService] Ask Gemini HTTP Error:', response.status);
                return { ok: false, error: `HTTP ${response.status}` };
            }

            const json = await response.json();
            if (!json.ok && json.error) console.warn('[DataService] Gemini Error:', json.error);
            return json;

        } catch (err) {
            console.error('DataService: Gemini Query Exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Universal Gemini 3 AI Research Fetch
     * @param {string} symbol - Ticker (e.g. CBA)
     * @param {string} questionId - ID (e.g. key_risks)
     * @param {string} promptTemplate - The template text
     */
    async fetchAiSummary(symbol, questionId, promptTemplate) {
        try {
            // 1. Variable Replacement
            const prompt = promptTemplate.replace(/\$\{code\}/g, symbol)
                .replace(/\{\{STOCK\}\}/g, symbol);

            const user = AuthService.getCurrentUser();
            const userId = user ? user.uid : null;

            if (!userId) {
                return { ok: false, error: 'User not logged in' };
            }

            const payload = {
                action: 'gemini3Research',
                userId: userId,
                symbol: symbol,
                questionId: questionId,
                prompt: prompt,
                thinking: true // Critical for dividend/technical analysis
            };
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                if (response.status === 429) return { ok: false, error: 'RATE_LIMIT', retryAfter: 60 };
                return { ok: false, error: `HTTP ${response.status}` };
            }

            const json = await response.json();
            return json;

        } catch (err) {
            console.error('DataService: AI Research Exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Normalizes raw API response into a clean Map.
     * @param {Array|Object} apiResponse 
     * @returns {Map<string, Object>}
     * @private
     */
    /**
     * Searches for stocks within the provided live prices map.
     * Prioritizes results: Ticker Start > Name Start > Name Contains.
     * @param {string} query - The search query (ticker or name).
     * @param {Map} livePrices - The Map of live price objects.
     * @returns {Array} - Array of matching stock objects (limit 50).
     */
    searchStocks(query, livePrices, industryFilters = null) {
        if (!livePrices) return [];

        // Allow empty query if industryFilters is present (Scanner Mode)
        // If industryFilters is null/undefined, it means "No Filter" (Show All).
        // If industryFilters is an array (even empty), it means "Whitelist".
        const isWhitelistMode = Array.isArray(industryFilters);
        if ((!query || typeof query !== 'string') && !isWhitelistMode) return [];

        const q = (query || '').toUpperCase().trim();
        const hasQuery = q.length > 0;

        // Priority Buckets
        const bucketTickerStart = []; // Bucket 1: Ticker starts with Q
        const bucketNameStart = [];   // Bucket 2: Name starts with Q
        const bucketNameContains = []; // Bucket 3: Name contains Q

        for (const [code, data] of livePrices) {
            const upperCode = code.toUpperCase();
            const upperName = (data.name || '').toUpperCase();

            const isTickerMatch = upperCode.startsWith(q);
            const isNameStartMatch = upperName.startsWith(q);
            const isNameContainsMatch = upperName.includes(q);

            const resultItem = {
                code: code,
                name: data.name || '',
                ...data
            };

            // 1. FILTER: Industry (Global Scanner)
            if (isWhitelistMode) {
                const itemIndustry = (data.industry || '').trim().toUpperCase();
                // If whitelist is [], match will always be false (None selected)
                const match = industryFilters.some(f => f.toUpperCase() === itemIndustry);

                // RESILIENCE: If it's an exact ticker match, bypass sector filter (User intent override)
                // This prevents "Black Hole" searches when metadata is incomplete or filters are restrictive.
                const isExactTicker = upperCode === q;

                if (!match && !isExactTicker) {
                    continue;
                }
            }

            // 2. FILTER: Query (if present)
            if (hasQuery) {
                if (isTickerMatch) {
                    bucketTickerStart.push(resultItem);
                } else if (isNameStartMatch) {
                    bucketNameStart.push(resultItem);
                } else if (isNameContainsMatch) {
                    bucketNameContains.push(resultItem);
                }
            } else {
                // If no query but whitelist exists, just add to a bucket (Scanner Mode)
                bucketTickerStart.push(resultItem);
            }
        }

        // Helper to sort by ticker alphabetically
        const sortByTicker = (a, b) => a.code.localeCompare(b.code);

        // Sort each bucket (Consistency)
        bucketTickerStart.sort(sortByTicker);
        bucketNameStart.sort(sortByTicker);
        bucketNameContains.sort(sortByTicker);

        // Merge and limit to 50
        return [
            ...bucketTickerStart,
            ...bucketNameStart,
            ...bucketNameContains
        ].slice(0, 50);
    }

    /**
     * Fetches historical price data.
     * @param {string} code 
     * @param {string} range '1y', '5y', 'max'
     */
    async fetchHistory(code, range) {
        // CACHE IMPLEMENTATION: Check localStorage first to save API quota
        // Key format: asx_history_{code}_{range}
        // Expiry: 24 hours
        const cacheKey = `asx_history_v3_${code}_${range}`;
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    return data; // Return valid cached data
                }
            }
        } catch (e) {
            console.warn('[DataService] Cache read error:', e);
        }

        // RANGE HYGIENE: Yahoo Finance API expects 'mo' for months (1mo, 3mo, 6mo)
        const rangeMap = {
            '1m': '1mo',
            '3m': '3mo',
            '6m': '6mo'
        };
        const mappedRange = rangeMap[range] || range;

        // TIMEOUT PROTECTION (20 Seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
            const user = AuthService.getCurrentUser();
            const userId = user ? user.uid : null;

            if (!userId) {
                clearTimeout(timeoutId);
                console.warn('DataService: fetchHistory called without logged-in user.');
                return { ok: false, error: 'User not logged in' };
            }

            const payload = {
                action: 'fetchHistory',
                userId: userId,
                code: code,
                range: mappedRange
            };

            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}` };
            }

            const json = await response.json();

            // Cache successful valid responses only
            if (json && json.ok && Array.isArray(json.data) && json.data.length > 0) {
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: json
                    }));
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        console.warn('[DataService] Cache full. Purging history keys...');
                        // Strategy: Clear all history keys to make room
                        Object.keys(localStorage).forEach(key => {
                            if (key.startsWith('asx_history_')) localStorage.removeItem(key);
                        });
                        // Retry once
                        try { localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: json })); } catch (e2) { }
                    } else {
                        console.warn('[DataService] Cache write error:', e);
                    }
                }
            }

            return json;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                console.error("DataService: fetchHistory timed out (20s limit).");
            } else {
                console.error('DataService: History Fetch Exception:', err);
            }
            return { ok: false, error: err.message };
        }
    }

    _normalizePriceData(apiResponse) {
        const normalizedPrices = new Map();
        let dashboardData = [];

        // Handle case where response might be structured { prices, dashboard } or flat (backward compatibility)
        const items = apiResponse.prices || (Array.isArray(apiResponse) ? apiResponse : (apiResponse.data || []));
        dashboardData = apiResponse.dashboard || [];

        // RESILIENCE FIX: If dashboardData is missing/empty, auto-extract from the primary items list
        if (dashboardData.length === 0 && Array.isArray(items)) {
            dashboardData = items.filter(item => {
                const code = String(item.ASXCode || item.code || '').trim().toUpperCase();
                const type = String(item.Type || item.type || '').trim();

                // 1. Type-Based Detection (Most Accurate)
                if (['Index', 'Currency', 'Crypto', 'Commodity'].includes(type) || type === 'Index') {
                    return true;
                }

                return code.startsWith('^') ||
                    code.includes('.') ||
                    code.includes('=') ||
                    code === 'XJO' ||
                    code === 'XKO';
            }).map(item => ({
                ...item,
                code: String(item.ASXCode || item.code || '').trim().toUpperCase(),
                name: item.CompanyName || item.Name || item.companyName || item.name || String(item.ASXCode || item.code || '').trim().toUpperCase()
            }));
            if (dashboardData.length > 0) {
            }
        } else if (Array.isArray(dashboardData)) {
            // ROBUST MAPPING: Explicitly normalize keys for the UI to consume directly
            dashboardData = dashboardData.map(item => ({
                ...item,
                code: String(item.ASXCode || item.code || '').trim().toUpperCase(),
                name: item.name || item.CompanyName || item.Name || item.companyName || item.id || item.code || '',
                // CRITICAL FIX: Pass the price directly to the UI object so it doesn't rely solely on the Map
                live: parseFloat(item.LivePrice || item.live || 0),
                valueChange: parseFloat(item.Change || item.valueChange || 0),
                pctChange: parseFloat(item.PctChange || item.pctChange || 0)
            }));
        }

        // VERIFICATION: Log presence and count
        if (dashboardData.length > 0) {
            const sample = dashboardData[0];
        }

        if (!Array.isArray(items)) {
            console.warn("DataService: Unexpected API response format (missing prices array)", apiResponse);
            return { prices: normalizedPrices, dashboard: dashboardData };
        }

        if (items.length === 0 && dashboardData.length === 0) {
            console.warn("DataService: API returned completely empty data payload. This may indicate a temporary backend error.");
        }

        // FULL NORMALIZATION: Both 'prices' and 'dashboard' should be in the Map
        const allItems = [...items, ...dashboardData];

        allItems.forEach(item => {
            // ROBUST KEY LOOKUP: Support both ASXCode (API Standard) and code (Normalized)
            const code = String(item.ASXCode || item.code || '').trim().toUpperCase();

            // Skip invalid entries after normalization
            if (!code || code === 'UNDEFINED') return;

            // DIAGNOSTIC (One-Time): Check for Day High/Low keys AND VALUES
            // if (code === 'ANZ' || code === 'WOW') {
            // }

            // Skip invalid entries after normalization
            if (!code) return;

            const live = parseFloat(item.LivePrice || item.live || 0);
            const prevClose = parseFloat(item.PrevClose || item.prevClose || 0);

            // Ensure numbers are valid
            const isLiveValid = !isNaN(live);
            const isPrevValid = !isNaN(prevClose);

            // Calculate change if possible
            let change = 0;
            let pctChange = 0;

            if (isLiveValid && isPrevValid && prevClose !== 0) {
                change = live - prevClose;
                pctChange = (change / prevClose) * 100;
            }

            // Set the map key using the strictly normalized code
            normalizedPrices.set(code, {
                code: code,
                name: item.name || item.CompanyName || item.companyName || '', // Support both casings
                live: isLiveValid ? live : 0,
                prevClose: isPrevValid ? prevClose : 0,
                // ROBUST NORMALIZATION: Check multiple casing variants from API/Sheet for 52-WEEK data ONLY
                // FIX: Remove fallback to daily .High/.Low which causes false 52W alerts
                high: parseFloat(item.H52 || item.High52 || item.high52 || item.high_52 || item.high || 0),
                low: parseFloat(item.L52 || item.Low52 || item.low52 || item.low_52 || item.low || 0),
                pe: parseFloat(item.PE || item.pe || 0),
                volume: parseInt(item.Volume || 0),
                change: change,
                pctChange: pctChange,
                // NEW METADATA (Enriched)
                sector: item.Sector || item.sector || '',
                industry: item.Industry || item.industry || '',
                type: item.Type || item.type || 'Share',
                lastUpdate: Date.now()
            });
        });

        return { prices: normalizedPrices, dashboard: dashboardData };
    }
}
