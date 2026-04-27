/**
 * DividendService.js
 * ===========================================================================
 * ROLE: Read-Only Dividend Math & Logic Layer
 * ARCHITECTURE: Service (Controller-Service-Data)
 * 
 * This module performs ALL dividend calculations on the client side using
 * pre-fetched data from Firestore (written by the GAS background sync).
 * It NEVER triggers a fetch to Yahoo or the GAS bridge.
 * 
 * DATA SOURCE: Firestore collection `metadata_dividends/{TICKER}`
 * DOCUMENT SCHEMA:
 *   {
 *     history: [{ exDate: "YYYY-MM-DD", amount: number, franking: number }],
 *     lastSync: "ISO-8601 string",
 *     ticker: "BHP"
 *   }
 * ===========================================================================
 */

import { db } from '../auth/AuthService.js';
import { AppState } from '../state/AppState.js';
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const APP_ID = 'asx-watchlist-app';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Australian corporate tax rate used for franking credit gross-up */
const AU_CORPORATE_TAX_RATE = 0.30;

/** Gross-up multiplier: amount / (1 - taxRate) - amount = amount * (taxRate / (1 - taxRate)) */
const FRANKING_GROSS_UP_FACTOR = AU_CORPORATE_TAX_RATE / (1 - AU_CORPORATE_TAX_RATE); // 0.4286

/** Stale data threshold in days */
const STALE_THRESHOLD_DAYS = 10;

/** Hero threshold: consecutive years of payment */
const HERO_THRESHOLD_YEARS = 10;

/** localStorage cache prefix */
const CACHE_PREFIX = 'asx_div_';
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours client-side cache

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class DividendService {

    /**
     * Fetches dividend history for a ticker from Firestore (read-only).
     * Uses localStorage as a short-lived client cache to avoid redundant reads.
     * 
     * @param {string} ticker - ASX code (e.g. "BHP")
     * @returns {Promise<{history: Array, lastSync: string|null, status: string}>}
     */
    static async getHistory(ticker) {
        if (!ticker) return { history: [], lastSync: null, status: 'INVALID' };

        const code = ticker.toUpperCase();

        // 1. Check localStorage cache
        try {
            const cacheKey = `${CACHE_PREFIX}${code}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
                    return parsed.data;
                }
            }
        } catch (e) {
            // Cache miss or corrupt — continue to Firestore
        }

        // 2. Firestore read
        try {
            if (!db) return { history: [], lastSync: null, status: 'NO_DB' };

            const docRef = doc(db, `artifacts/${APP_ID}/metadata_dividends/${code}`);
            console.log(`[DividendService] Reading Firestore for: ${code}...`);
            const snap = await getDoc(docRef);

            if (!snap.exists()) {
                console.warn(`[DividendService] No document found for: ${code}`);
                return { history: [], lastSync: null, status: 'PENDING' };
            }

            const data = snap.data();
            console.log(`[DividendService] RAW DATA for ${code}:`, data);
            const result = {
                history: Array.isArray(data.history) ? data.history : [],
                lastSync: data.lastSync || null,
                status: 'OK'
            };

            console.log(`[DividendService] PROCESSED for ${code}:`, result);

            // 3. Cache to localStorage
            try {
                localStorage.setItem(`${CACHE_PREFIX}${code}`, JSON.stringify({
                    timestamp: Date.now(),
                    data: result
                }));
            } catch (e) {
                // Quota exceeded — non-critical
            }

            return result;

        } catch (err) {
            console.warn(`[DividendService] Read failed for ${code}:`, err);
            return { history: [], lastSync: null, status: 'OFFLINE' };
        }
    }

    // ========================================================================
    // GROSS-UP UTILITIES
    // ========================================================================

    /**
     * Calculates the grossed-up dividend amount including franking credits.
     * Formula: grossed = amount + (amount × franking × grossUpFactor)
     * 
     * @param {number} amount - Raw dividend amount per share
     * @param {number} franking - Franking percentage as decimal (1.0 = 100%)
     * @returns {number} Grossed-up amount
     */
    static grossUp(amount, franking = 1.0) {
        if (!amount || amount <= 0) return 0;
        const safeFranking = Math.min(Math.max(franking || 0, 0), 1);
        return amount + (amount * safeFranking * FRANKING_GROSS_UP_FACTOR);
    }

    /**
     * Returns the franking credit component only.
     * @param {number} amount 
     * @param {number} franking 
     * @returns {number}
     */
    static frankingCredit(amount, franking = 1.0) {
        if (!amount || amount <= 0) return 0;
        const safeFranking = Math.min(Math.max(franking || 0, 0), 1);
        return amount * safeFranking * FRANKING_GROSS_UP_FACTOR;
    }

    // ========================================================================
    // YIELD CALCULATIONS
    // ========================================================================

    /**
     * Trailing Twelve Month (TTM) dividend total.
     * Sums all dividends with exDate within the last 365 days.
     * 
     * @param {Array} history - Sorted dividend history array
     * @returns {number} Total TTM dividends per share
     */
    static getTTMDividends(history) {
        if (!Array.isArray(history) || history.length === 0) return 0;

        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        return history.reduce((sum, entry) => {
            if (entry?.exDate >= cutoffStr) {
                return sum + (parseFloat(entry.amount) || 0);
            }
            return sum;
        }, 0);
    }

    /**
     * Current Yield: TTM dividends / current price × 100.
     * 
     * @param {Array} history 
     * @param {number} currentPrice 
     * @returns {number} Yield percentage
     */
    static getCurrentYield(history, currentPrice) {
        if (!currentPrice || currentPrice <= 0) return 0;
        const ttm = DividendService.getTTMDividends(history);
        return (ttm / currentPrice) * 100;
    }

    /**
     * Grossed-Up Yield: TTM grossed-up dividends / current price × 100.
     * 
     * @param {Array} history 
     * @param {number} currentPrice 
     * @returns {number} Grossed-up yield percentage
     */
    static getGrossedUpYield(history, currentPrice) {
        if (!currentPrice || currentPrice <= 0) return 0;
        if (!Array.isArray(history) || history.length === 0) return 0;

        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const ttmGrossed = history.reduce((sum, entry) => {
            if (entry?.exDate >= cutoffStr) {
                return sum + DividendService.grossUp(
                    parseFloat(entry.amount) || 0,
                    entry.franking ?? 1.0
                );
            }
            return sum;
        }, 0);

        return (ttmGrossed / currentPrice) * 100;
    }

    /**
     * Yield on Cost (YoC): TTM dividends / user's average purchase price × 100.
     * This is the "True Yield" for long-term holders.
     * 
     * @param {Array} history 
     * @param {number} avgCostPrice - User's average purchase price
     * @returns {number} YoC percentage
     */
    static getYieldOnCost(history, avgCostPrice) {
        if (!avgCostPrice || avgCostPrice <= 0) return 0;
        const ttm = DividendService.getTTMDividends(history);
        return (ttm / avgCostPrice) * 100;
    }

    // ========================================================================
    // GROWTH METRICS (CAGR)
    // ========================================================================

    /**
     * Calculates the annual dividend totals from raw history.
     * Groups by calendar year, returns { year: total } map sorted ascending.
     * 
     * @param {Array} history 
     * @returns {Map<number, number>} Year → total dividend amount
     */
    static getAnnualTotals(history) {
        const totals = new Map();
        if (!Array.isArray(history)) return totals;

        history.forEach(entry => {
            if (!entry?.exDate || !entry?.amount) return;
            const year = parseInt(entry.exDate.substring(0, 4), 10);
            if (isNaN(year)) return;
            totals.set(year, (totals.get(year) || 0) + (parseFloat(entry.amount) || 0));
        });

        return new Map([...totals].sort((a, b) => a[0] - b[0]));
    }

    /**
     * Compound Annual Growth Rate (CAGR) over N years.
     * Formula: (EndValue / StartValue)^(1/N) - 1
     * 
     * @param {Array} history - Raw dividend history
     * @param {number} years - Period (3, 5, or 10)
     * @returns {number|null} CAGR as percentage, or null if insufficient data
     */
    static getCAGR(history, years = 5) {
        const annuals = DividendService.getAnnualTotals(history);
        if (annuals.size < years + 1) return null; // Need N+1 years of data

        const sortedYears = [...annuals.keys()].sort((a, b) => a - b);
        const currentYear = new Date().getFullYear();

        // Use the most recent COMPLETE year as end, go back N years for start
        // If current year data is incomplete, use previous year as endpoint
        let endYear = currentYear;
        if (!annuals.has(currentYear)) {
            endYear = sortedYears[sortedYears.length - 1];
        }

        const startYear = endYear - years;

        const startVal = annuals.get(startYear);
        const endVal = annuals.get(endYear);

        if (!startVal || startVal <= 0 || !endVal || endVal <= 0) return null;

        const cagr = (Math.pow(endVal / startVal, 1 / years) - 1) * 100;
        return parseFloat(cagr.toFixed(2));
    }

    // ========================================================================
    // CONSISTENCY & "HERO" STATUS
    // ========================================================================

    /**
     * Counts the number of consecutive calendar years with dividend payments,
     * counting backwards from the most recent year.
     * 
     * @param {Array} history 
     * @returns {number} Consecutive years of payment
     */
    static getConsecutiveYears(history) {
        const annuals = DividendService.getAnnualTotals(history);
        if (annuals.size === 0) return 0;

        const years = [...annuals.keys()].sort((a, b) => b - a); // Descending
        let consecutive = 0;

        for (let i = 0; i < years.length; i++) {
            if (i === 0) {
                consecutive = 1;
                continue;
            }
            // Check if this year is exactly 1 less than previous
            if (years[i - 1] - years[i] === 1) {
                consecutive++;
            } else {
                break; // Gap found
            }
        }

        return consecutive;
    }

    /**
     * Determines if the stock qualifies as a "Dividend Hero".
     * Criteria: 10+ consecutive years of dividend payments.
     * 
     * @param {Array} history 
     * @returns {boolean}
     */
    static isDividendHero(history) {
        return DividendService.getConsecutiveYears(history) >= HERO_THRESHOLD_YEARS;
    }

    // ========================================================================
    // EX-DATE AWARENESS
    // ========================================================================

    /**
     * Finds the next upcoming ex-date from history (if within 60 days).
     * Returns null if no upcoming ex-date is known.
     * 
     * Note: This is a heuristic based on historical patterns.
     * It projects the next likely ex-date based on the most recent annual pattern.
     * 
     * @param {Array} history 
     * @returns {{ exDate: string, daysUntil: number }|null}
     */
    static getUpcomingExDate(history) {
        if (!Array.isArray(history) || history.length === 0) return null;

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Strategy: Find all ex-dates, project them forward to current/next year
        const monthDayPairs = new Set();
        history.forEach(entry => {
            if (!entry?.exDate) return;
            const md = entry.exDate.substring(5); // "MM-DD"
            monthDayPairs.add(md);
        });

        const currentYear = today.getFullYear();
        let nearest = null;

        for (const md of monthDayPairs) {
            // Try current year and next year
            for (const year of [currentYear, currentYear + 1]) {
                const projected = `${year}-${md}`;
                if (projected <= todayStr) continue; // Past

                const projDate = new Date(projected);
                const diffMs = projDate - today;
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                if (diffDays <= 60 && diffDays > 0) {
                    if (!nearest || diffDays < nearest.daysUntil) {
                        nearest = { exDate: projected, daysUntil: diffDays };
                    }
                }
            }
        }

        return nearest;
    }

    // ========================================================================
    // DATA FRESHNESS
    // ========================================================================

    /**
     * Checks if the dividend data is stale (lastSync > threshold).
     * @param {string|null} lastSync - ISO timestamp
     * @returns {boolean}
     */
    static isStale(lastSync) {
        if (!lastSync) return true;
        try {
            const syncDate = new Date(lastSync);
            const diffDays = (Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays > STALE_THRESHOLD_DAYS;
        } catch (e) {
            return true;
        }
    }

    // ========================================================================
    // AGGREGATE: Full Analysis Object
    // ========================================================================

    /**
     * Computes a complete dividend analysis for a given stock.
     * This is the primary method called by AppController/ViewRenderer.
     * 
     * @param {string} ticker - ASX code
     * @param {number} currentPrice - Live price
     * @param {number} avgCostPrice - User's average purchase price (0 if not held)
     * @returns {Promise<Object>} Complete dividend analysis
     */
    static async analyze(ticker, currentPrice = 0, avgCostPrice = 0) {
        const { history, lastSync, status } = await DividendService.getHistory(ticker);

        if (status !== 'OK' || history.length === 0) {
            return {
                status,
                isStale: DividendService.isStale(lastSync),
                lastSync,
                ttmDividend: 0,
                currentYield: 0,
                grossedUpYield: 0,
                yieldOnCost: 0,
                cagr3Y: null,
                cagr5Y: null,
                consecutiveYears: 0,
                isDividendHero: false,
                upcomingExDate: null,
                annualTotals: new Map(),
                historyCount: 0
            };
        }

        return {
            status,
            isStale: DividendService.isStale(lastSync),
            lastSync,
            ttmDividend: DividendService.getTTMDividends(history),
            currentYield: DividendService.getCurrentYield(history, currentPrice),
            grossedUpYield: DividendService.getGrossedUpYield(history, currentPrice),
            yieldOnCost: DividendService.getYieldOnCost(history, avgCostPrice),
            cagr3Y: DividendService.getCAGR(history, 3),
            cagr5Y: DividendService.getCAGR(history, 5),
            consecutiveYears: DividendService.getConsecutiveYears(history),
            isDividendHero: DividendService.isDividendHero(history),
            upcomingExDate: DividendService.getUpcomingExDate(history),
            annualTotals: DividendService.getAnnualTotals(history),
            historyCount: history.length
        };
    }
}
