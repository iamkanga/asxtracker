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
            // console.log(`DataService: Fetching Live Prices. URL: ${url.toString()}`);

            const response = await fetch(url.toString());

            if (!response.ok) {
                console.error(`DataService Fetch Error: ${response.status} ${response.statusText}`);
                return new Map();
            }

            const json = await response.json();

            const count = Array.isArray(json) ? (json.prices?.length || json.length) : (json.data ? json.data.length : 'Unknown');
            console.log(`DataService: Received ${count} primary items from API.`);

            // The API response is expected to be an array of objects.
            // If the API returns a wrapper (e.g. { data: [...] }), we might need to adjust,
            // but based on legacy analysis 'json' usually is the array or contains it.
            // We'll normalize whatever we get.
            return this._normalizePriceData(json);

        } catch (error) {
            console.error("DataService Exception:", error);
            return new Map();
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
    searchStocks(query, livePrices, industryFilters = []) {
        if (!livePrices) return [];

        // Normalize Filters: Ensure array
        const filters = Array.isArray(industryFilters) ? industryFilters : (industryFilters ? [industryFilters] : []);
        const hasFilters = filters.length > 0;

        // Allow empty query if filter is present (Scanner Mode)
        if ((!query || typeof query !== 'string') && !hasFilters) return [];

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
            if (hasFilters) {
                // Robust Match: Case-insensitive check
                // filters are from UI (likely correct casing), but let's normalize to be safe
                const itemIndustry = (data.industry || '').trim().toUpperCase();

                // Check if *any* filter (uppercase) matches this item
                const match = filters.some(f => f.toUpperCase() === itemIndustry);

                if (!match) {
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
                // If no query but filter exists, just add to a bucket (Scanner Mode)
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

    _normalizePriceData(apiResponse) {
        const normalizedData = new Map();

        // Handle case where response might be structured { prices, dashboard } or flat (backward compatibility)
        const items = apiResponse.prices || (Array.isArray(apiResponse) ? apiResponse : (apiResponse.data || []));

        // VERIFICATION (Dashboard Sheet): Log presence and count
        if (apiResponse && typeof apiResponse === 'object' && apiResponse.dashboard) {
            console.log(`[DataService] Dashboard Content Found: ${apiResponse.dashboard.length} items.`);
            // Note: Dashboard data is available here for future UI expansion.
        } else if (Array.isArray(apiResponse)) {
            // Early diagnostic to see why it might be flat
            // console.log('[DataService] Legacy flat payload detected.');
        }

        if (!Array.isArray(items)) {
            console.warn("DataService: Unexpected API response format", apiResponse);
            return normalizedData;
        }

        items.forEach(item => {
            // Keys based on user provided reference: ASXCode, LivePrice, PrevClose
            if (!item.ASXCode) return;

            // STRICT NORMALIZATION: Trim and Uppercase to match main.js lookup
            const code = String(item.ASXCode).trim().toUpperCase();

            // DIAGNOSTIC (One-Time): Check for Day High/Low keys AND VALUES
            if (code === 'ANZ' || code === 'WOW') {
                console.log(`[DataService] Raw Data for ${code}:`, {
                    H52: item.High52,
                    L52: item.Low52,
                    Live: item.LivePrice
                });
            }

            // Skip invalid entries after normalization
            if (!code) return;

            const live = parseFloat(item.LivePrice);
            const prevClose = parseFloat(item.PrevClose);

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
            normalizedData.set(code, {
                code: code,
                name: item.CompanyName || item.companyName || '', // Support both casings
                live: isLiveValid ? live : 0,
                prevClose: isPrevValid ? prevClose : 0,
                // ROBUST NORMALIZATION: Check multiple casing variants from API/Sheet
                high: parseFloat(item.H52 || item.High52 || item.high52 || item.high_52 || item.High || item.high || 0),
                low: parseFloat(item.L52 || item.Low52 || item.low52 || item.low_52 || item.Low || item.low || 0),
                pe: parseFloat(item.PE || item.pe || 0),
                volume: parseInt(item.Volume || 0),
                change: change,
                pctChange: pctChange,
                // NEW METADATA (Enriched)
                sector: item.Sector || item.sector || '',
                industry: item.Industry || item.industry || '',
                type: item.Type || item.type || 'Share'
            });
        });

        return normalizedData;
    }
}
