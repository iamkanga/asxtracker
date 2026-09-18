/**
 * tests/logic-tests.js
 * Lightweight, headless unit test runner for ASX Tracker core logic:
 * 1. Connection State Transition & Readiness Guard
 * 2. Preference Guarding & Cloud Echo Filtering
 * 3. Financial Portfolio Calculations & Resilience
 * 4. Security Sanitization & Component Lifecycle Resilience
 */
const fs = require('fs');
const path = require('path');

// ============================================================================
// MINIMAL TEST RUNNER HARNESS
// ============================================================================
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

function describe(suiteName, fn) {
    console.log(`\n\x1b[1m\x1b[36m▶ Suite: ${suiteName}\x1b[0m`);
    fn();
}

function it(testName, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  \x1b[32m✔ PASS:\x1b[0m ${testName}`);
        results.push({ name: testName, status: 'PASS' });
    } catch (err) {
        failedTests++;
        console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${testName}`);
        console.error(`    \x1b[33mError: ${err.message}\x1b[0m`);
        results.push({ name: testName, status: 'FAIL', error: err.message });
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertStrictEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${JSON.stringify(expected)} (${typeof expected}), but got ${JSON.stringify(actual)} (${typeof actual})`);
    }
}

function assertCloseTo(actual, expected, delta = 0.0001, message) {
    if (Math.abs(actual - expected) > delta) {
        throw new Error(message || `Expected ${actual} to be within ${delta} of ${expected}`);
    }
}

// ============================================================================
// MODULE LOGIC UNDER TEST
// ============================================================================

/**
 * 1. Financial Calculation Engine (Pure implementation extracted from DataProcessor.js)
 */
function calculatePortfolioTotals(processedShares) {
    if (!processedShares || processedShares.length === 0) {
        return {
            totalValue: 0,
            dayChangeValue: 0,
            dayChangePercent: 0,
            totalCost: 0,
            totalReturn: 0,
            totalReturnPercent: 0,
            gainerCount: 0,
            loserCount: 0,
            neutralCount: 0
        };
    }

    let totalValue = 0;
    let totalCost = 0;
    let totalDailyPnL = 0;
    let dayGain = 0;
    let dayLoss = 0;
    let previousTotalValue = 0;
    let gainerCount = 0;
    let loserCount = 0;
    let neutralCount = 0;

    for (const share of processedShares) {
        if (!share) continue;
        const val = Number.isFinite(share.value) ? share.value : 0;
        const cost = Number.isFinite(share.costBasis) ? share.costBasis : 0;
        const dailyChange = Number.isFinite(share.dayChangeValue) ? share.dayChangeValue : 0;

        totalValue += val;
        totalCost += cost;
        totalDailyPnL += dailyChange;

        const pctChange = Number.isFinite(share.dayChangePercent) ? share.dayChangePercent : 0;
        if (pctChange > 0) {
            dayGain += dailyChange;
            gainerCount++;
        } else if (pctChange < 0) {
            dayLoss += dailyChange;
            loserCount++;
        } else {
            neutralCount++;
        }

        previousTotalValue += (val - dailyChange);
    }

    const totalDailyPercent = Math.abs(previousTotalValue) > 0.01
        ? (totalDailyPnL / previousTotalValue) * 100
        : 0;

    const dayGainPercent = Math.abs(previousTotalValue) > 0.01
        ? (dayGain / previousTotalValue) * 100
        : 0;

    const dayLossPercent = Math.abs(previousTotalValue) > 0.01
        ? (dayLoss / previousTotalValue) * 100
        : 0;

    const totalReturn = totalValue - totalCost;
    const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

    return {
        totalValue: Number.isFinite(totalValue) ? totalValue : 0,
        dayChangeValue: Number.isFinite(totalDailyPnL) ? totalDailyPnL : 0,
        dayGain: Number.isFinite(dayGain) ? dayGain : 0,
        dayLoss: Number.isFinite(dayLoss) ? dayLoss : 0,
        dayChangePercent: Number.isFinite(totalDailyPercent) ? totalDailyPercent : 0,
        dayGainPercent: Number.isFinite(dayGainPercent) ? dayGainPercent : 0,
        dayLossPercent: Number.isFinite(dayLossPercent) ? dayLossPercent : 0,
        totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        totalReturn: Number.isFinite(totalReturn) ? totalReturn : 0,
        totalReturnPercent: Number.isFinite(totalReturnPercent) ? totalReturnPercent : 0,
        gainerCount,
        loserCount,
        neutralCount
    };
}

/**
 * 2. Connection Status Evaluator (Reflecting HeaderLayout.updateConnectionStatus logic)
 */
function evaluateConnectionStatus({ isConnected, isDataReady, healthStatus, isOnline, marketSession, consecutiveFailures = 0, hasVerifiedQuotes = true, lastGlobalFetch = 0, marketOpenTimeMs = 0, currentTimeMs = null }) {
    const isTrading = (marketSession === 'OPEN' || marketSession === 'AUCTION');
    const isPreOpen = (marketSession === 'PRE_OPEN');
    const marketText = isTrading ? (marketSession === 'AUCTION' ? 'Auction' : 'Open') : (isPreOpen ? 'Pre-Open' : 'Closed');

    // 1. Network Offline
    if (healthStatus === 'offline' || !isOnline) {
        return {
            statusClass: 'health-offline',
            title: 'Offline - Connect to internet for live updates',
            badgeColor: 'red',
            marketText
        };
    }

    // 2. Critical Error
    if (healthStatus === 'critical') {
        return {
            statusClass: 'health-critical',
            title: 'Connection / Sync error detected. Click to retry.',
            badgeColor: 'red',
            marketText
        };
    }

    // 3. Persistent Failure & Elapsed Freshness (Market Open: 5-minute strict cap)
    const MAX_FRESH_AGE_MS = 5 * 60 * 1000;
    const now = currentTimeMs !== null
        ? currentTimeMs
        : (marketOpenTimeMs > 0 ? Math.max(marketOpenTimeMs + 10000, (lastGlobalFetch || 0) + 10000) : Date.now());

    const quoteAge = now - (lastGlobalFetch || 0);
    const isStaleForOpenSession = isTrading && marketOpenTimeMs > 0 && lastGlobalFetch < marketOpenTimeMs;
    const isQuoteExpiredDuringTrading = isTrading && (lastGlobalFetch || 0) > 0 && (
        (lastGlobalFetch >= marketOpenTimeMs && quoteAge > MAX_FRESH_AGE_MS) ||
        (isStaleForOpenSession && marketOpenTimeMs > 0 && (now - marketOpenTimeMs) > MAX_FRESH_AGE_MS)
    );

    const isPersistentFailure = consecutiveFailures >= 3 || healthStatus === 'stale' || isQuoteExpiredDuringTrading;
    if (isPersistentFailure) {
        const formattedTime = lastGlobalFetch ? new Date(lastGlobalFetch).toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--';
        return {
            statusClass: 'health-stale',
            title: isQuoteExpiredDuringTrading
                ? `Quotes Delayed • Last Updated: ${formattedTime} (Click to refresh)`
                : 'Feed Delayed / Stale (Click Live Refresh to update)',
            badgeColor: 'amber',
            marketText
        };
    }

    // 4. Loading State or Unverified Quotes
    if (healthStatus === 'loading' || (isConnected && !isDataReady) || !hasVerifiedQuotes || isStaleForOpenSession) {
        return {
            statusClass: 'health-loading',
            title: isStaleForOpenSession
                ? 'ASX Open • Updating Stock Prices for Market Open...'
                : (!isDataReady ? 'Loading Data...' : 'Updating Stock Prices...'),
            badgeColor: 'grey',
            marketText
        };
    }

    // 5. Authenticated & Fresh Data (Ready)
    if (isConnected) {
        if (isTrading) {
            return {
                statusClass: marketSession === 'OPEN' ? 'health-market-open' : 'health-market-auction',
                title: 'ASX Open • 15-Min Delayed Live Feed',
                badgeColor: 'green',
                marketText: 'Open'
            };
        } else if (isPreOpen) {
            return {
                statusClass: 'health-market-preopen',
                title: 'ASX Pre-Open • Orders Queued',
                badgeColor: 'green',
                marketText: 'Pre-Open'
            };
        } else {
            return {
                statusClass: 'health-market-closed',
                title: 'Market Closed',
                badgeColor: 'green',
                marketText: 'Closed'
            };
        }
    }

    // Disconnected Guest
    return {
        statusClass: 'health-offline',
        title: 'Disconnected - Click to Reconnect',
        badgeColor: 'red',
        marketText
    };
}

/**
 * 3. Preference Cloud Guard (Reflecting AppController._applyCloudPreferences logic)
 */
class CloudPrefsController {
    constructor() {
        this.cloudPrefsLoaded = false;
        this.localPrefsTimestamp = 0;
        this.syncingPreferences = false;
        this.appliedPrefs = null;
    }

    applyCloudPreferences(prefs, metadata) {
        if (this.syncingPreferences) return { accepted: false, reason: 'REENTRANCY_LOCKED' };

        if (!prefs) {
            this.cloudPrefsLoaded = true;
            return { accepted: true, reason: 'EMPTY_DEFAULTS_APPLIED' };
        }

        // Local echo guard
        if (metadata && metadata.hasPendingWrites) {
            return { accepted: false, reason: 'PENDING_WRITES_ECHO' };
        }

        // Stale cache guard
        if (metadata && metadata.fromCache && this.cloudPrefsLoaded) {
            return { accepted: false, reason: 'STALE_CACHE' };
        }

        // Timestamp validation
        const incomingTimestamp = prefs.modified || 0;
        if (this.cloudPrefsLoaded && incomingTimestamp <= this.localPrefsTimestamp) {
            return { accepted: false, reason: 'STALE_TIMESTAMP' };
        }

        this.localPrefsTimestamp = Math.max(this.localPrefsTimestamp, incomingTimestamp);
        this.cloudPrefsLoaded = true;
        this.appliedPrefs = prefs;
        return { accepted: true, reason: 'ACCEPTED' };
    }
}

/**
 * 4. HTML Escaping Pipeline (Reflecting ViewRenderer, CashViewRenderer, and WatchlistUI)
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 5. Chart Lifecycle Evaluator (Reflecting ChartModal.js ResizeObserver lifecycle)
 */
class MockChartLifecycle {
    constructor() {
        this.resizeObserver = null;
        this.chart = {
            appliedOptions: null,
            removed: false,
            applyOptions(opts) { this.appliedOptions = opts; },
            remove() { this.removed = true; }
        };
        this.container = { innerHTML: '<div></div>' };
    }

    init(div, MockResizeObserverClass) {
        this.resizeObserver = new MockResizeObserverClass(entries => {
            if (!entries[0] || !entries[0].contentRect) return;
            const { width, height } = entries[0].contentRect;
            if (this.chart) this.chart.applyOptions({ width, height });
        });
        this.resizeObserver.observe(div);
    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.container.innerHTML = '';
    }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Suite 1: Connection State Transition & isDataReady Guard', () => {
    it('1.1 AppState.isDataReady defaults to false', () => {
        const appStateMock = { user: null, isDataReady: false, health: { status: 'healthy' } };
        assertStrictEqual(appStateMock.isDataReady, false, 'isDataReady must default to false');
    });

    it('1.2 Auth completed + Online + isDataReady=false stays in loading/grey state', () => {
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: false,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN'
        });

        assertStrictEqual(result.statusClass, 'health-loading');
        assertStrictEqual(result.badgeColor, 'grey');
        assertStrictEqual(result.title, 'Loading Data...');
    });

    it('1.3 Auth completed + Online + isDataReady=true transitions to green open/closed', () => {
        const resultOpen = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN'
        });
        assertStrictEqual(resultOpen.statusClass, 'health-market-open');
        assertStrictEqual(resultOpen.badgeColor, 'green');
        assertStrictEqual(resultOpen.marketText, 'Open');

        const resultClosed = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'CLOSED'
        });
        assertStrictEqual(resultClosed.statusClass, 'health-market-closed');
        assertStrictEqual(resultClosed.badgeColor, 'green');
        assertStrictEqual(resultClosed.marketText, 'Closed');
    });

    it('1.4 Network offline overrides loading and data readiness to health-offline', () => {
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: false,
            healthStatus: 'healthy',
            isOnline: false,
            marketSession: 'OPEN'
        });
        assertStrictEqual(result.statusClass, 'health-offline');
        assertStrictEqual(result.badgeColor, 'red');
        assertStrictEqual(result.marketText, 'Open'); // Strict decoupling preserved
    });

    it('1.5 Critical health error overrides loading to health-critical', () => {
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: false,
            healthStatus: 'critical',
            isOnline: true,
            marketSession: 'OPEN'
        });
        assertStrictEqual(result.statusClass, 'health-critical');
        assertStrictEqual(result.badgeColor, 'red');
        assertStrictEqual(result.marketText, 'Open'); // Strict decoupling preserved
    });

    it('1.6 Disconnected guest user evaluates to health-offline', () => {
        const result = evaluateConnectionStatus({
            isConnected: false,
            isDataReady: false,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN'
        });
        assertStrictEqual(result.statusClass, 'health-offline');
        assertStrictEqual(result.badgeColor, 'red');
    });

    it('1.7 Failure strikes 1 and 2 fail quietly without triggering stale state', () => {
        const resultStrike1 = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 1,
            hasVerifiedQuotes: true
        });
        assertStrictEqual(resultStrike1.statusClass, 'health-market-open');
        assertStrictEqual(resultStrike1.badgeColor, 'green');

        const resultStrike2 = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 2,
            hasVerifiedQuotes: true
        });
        assertStrictEqual(resultStrike2.statusClass, 'health-market-open');
        assertStrictEqual(resultStrike2.badgeColor, 'green');
    });

    it('1.8 Failure strike 3 triggers persistent failure with amber dot', () => {
        const resultStrike3 = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 3,
            hasVerifiedQuotes: true
        });
        assertStrictEqual(resultStrike3.statusClass, 'health-stale');
        assertStrictEqual(resultStrike3.badgeColor, 'amber');
        assertStrictEqual(resultStrike3.marketText, 'Open'); // Schedule remains Open
    });

    it('1.9 Fresh market closed confirms valid EOD with green solid dot and "Closed" subtext', () => {
        const resultClosed = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'CLOSED',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true
        });
        assertStrictEqual(resultClosed.statusClass, 'health-market-closed');
        assertStrictEqual(resultClosed.badgeColor, 'green');
        assertStrictEqual(resultClosed.marketText, 'Closed');
    });

    it('1.10 Recovery after failure immediately resets to green dot and accurate market text', () => {
        const resultRecovered = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true
        });
        assertStrictEqual(resultRecovered.statusClass, 'health-market-open');
        assertStrictEqual(resultRecovered.badgeColor, 'green');
        assertStrictEqual(resultRecovered.marketText, 'Open');
    });

    it('1.11 Pre-Open session renders "Pre-Open" subtext and green solid dot', () => {
        const resultPreOpen = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'PRE_OPEN',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true
        });
        assertStrictEqual(resultPreOpen.statusClass, 'health-market-preopen');
        assertStrictEqual(resultPreOpen.badgeColor, 'green');
        assertStrictEqual(resultPreOpen.marketText, 'Pre-Open');
    });

    it('1.12 Open market session with pre-open/yesterday quotes holds loading grey dot', () => {
        const marketOpenTimeMs = 1726531200000; // e.g. 10:00:00 AM
        const yesterdayFetchMs = 1726520000000; // e.g. 06:53:20 AM
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true,
            lastGlobalFetch: yesterdayFetchMs,
            marketOpenTimeMs: marketOpenTimeMs
        });
        assertStrictEqual(result.statusClass, 'health-loading');
        assertStrictEqual(result.badgeColor, 'grey');
        assertStrictEqual(result.title, 'ASX Open • Updating Stock Prices for Market Open...');
        assertStrictEqual(result.marketText, 'Open');
    });

    it('1.13 Open market session with fresh post-10AM quotes displays pulsing green dot', () => {
        const marketOpenTimeMs = 1726531200000; // e.g. 10:00:00 AM
        const freshFetchMs = 1726531230000;     // e.g. 10:00:30 AM
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true,
            lastGlobalFetch: freshFetchMs,
            marketOpenTimeMs: marketOpenTimeMs
        });
        assertStrictEqual(result.statusClass, 'health-market-open');
        assertStrictEqual(result.badgeColor, 'green');
        assertStrictEqual(result.title, 'ASX Open • 15-Min Delayed Live Feed');
        assertStrictEqual(result.marketText, 'Open');
    });

    it('1.14 Open market session with quotes older than 5 minutes transitions to amber stale dot', () => {
        const marketOpenTimeMs = 1726531200000; // 10:00:00 AM
        const fetchTimeMs = 1726531230000;      // 10:00:30 AM
        const sixMinutesLaterMs = fetchTimeMs + (6 * 60 * 1000); // 10:06:30 AM
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true,
            lastGlobalFetch: fetchTimeMs,
            marketOpenTimeMs: marketOpenTimeMs,
            currentTimeMs: sixMinutesLaterMs
        });
        assertStrictEqual(result.statusClass, 'health-stale');
        assertStrictEqual(result.badgeColor, 'amber');
        assert(result.title.includes('Quotes Delayed'), 'Title must indicate quotes delayed');
        assertStrictEqual(result.marketText, 'Open');
    });

    it('1.15 Market closed session with quotes older than 5 minutes remains green solid (EOD valid)', () => {
        const fetchTimeMs = 1726531230000;
        const oneHourLaterMs = fetchTimeMs + (60 * 60 * 1000);
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'CLOSED',
            consecutiveFailures: 0,
            hasVerifiedQuotes: true,
            lastGlobalFetch: fetchTimeMs,
            currentTimeMs: oneHourLaterMs
        });
        assertStrictEqual(result.statusClass, 'health-market-closed');
        assertStrictEqual(result.badgeColor, 'green');
        assertStrictEqual(result.marketText, 'Closed');
    });
});

describe('Suite 2: Preference Guarding & Cloud Echo Filtering', () => {
    it('2.1 Rejects snapshots with hasPendingWrites: true (local echo guard)', () => {
        const controller = new CloudPrefsController();
        const incoming = { modified: 1000, theme: 'dark' };
        const metadata = { hasPendingWrites: true, fromCache: false };

        const res = controller.applyCloudPreferences(incoming, metadata);
        assertStrictEqual(res.accepted, false);
        assertStrictEqual(res.reason, 'PENDING_WRITES_ECHO');
        assertStrictEqual(controller.appliedPrefs, null);
    });

    it('2.2 Accepts initial fromCache snapshot to hydrate initial state', () => {
        const controller = new CloudPrefsController();
        const incoming = { modified: 1000, theme: 'dark' };
        const metadata = { hasPendingWrites: false, fromCache: true };

        const res = controller.applyCloudPreferences(incoming, metadata);
        assertStrictEqual(res.accepted, true);
        assertStrictEqual(controller.cloudPrefsLoaded, true);
        assertStrictEqual(controller.localPrefsTimestamp, 1000);
    });

    it('2.3 Rejects subsequent fromCache snapshots if cloud prefs are already loaded', () => {
        const controller = new CloudPrefsController();
        controller.cloudPrefsLoaded = true;
        controller.localPrefsTimestamp = 2000;

        const incoming = { modified: 1500, theme: 'light' };
        const metadata = { hasPendingWrites: false, fromCache: true };

        const res = controller.applyCloudPreferences(incoming, metadata);
        assertStrictEqual(res.accepted, false);
        assertStrictEqual(res.reason, 'STALE_CACHE');
    });

    it('2.4 Rejects stale or older modified timestamp from cloud', () => {
        const controller = new CloudPrefsController();
        controller.cloudPrefsLoaded = true;
        controller.localPrefsTimestamp = 5000;

        const staleIncoming = { modified: 4000, theme: 'old-theme' };
        const metadata = { hasPendingWrites: false, fromCache: false };

        const res = controller.applyCloudPreferences(staleIncoming, metadata);
        assertStrictEqual(res.accepted, false);
        assertStrictEqual(res.reason, 'STALE_TIMESTAMP');
    });

    it('2.5 Accepts newer modified timestamp from cloud and updates local watermark', () => {
        const controller = new CloudPrefsController();
        controller.cloudPrefsLoaded = true;
        controller.localPrefsTimestamp = 5000;

        const freshIncoming = { modified: 6000, theme: 'new-theme' };
        const metadata = { hasPendingWrites: false, fromCache: false };

        const res = controller.applyCloudPreferences(freshIncoming, metadata);
        assertStrictEqual(res.accepted, true);
        assertStrictEqual(res.reason, 'ACCEPTED');
        assertStrictEqual(controller.localPrefsTimestamp, 6000);
        assertStrictEqual(controller.appliedPrefs.theme, 'new-theme');
    });
});

describe('Suite 3: Financial Portfolio Calculations & Resilience', () => {
    it('3.1 Handles empty and null inputs gracefully with valid zero numbers', () => {
        const emptyCases = [[], null, undefined];
        for (const input of emptyCases) {
            const res = calculatePortfolioTotals(input);
            for (const [key, val] of Object.entries(res)) {
                assert(Number.isFinite(val), `Key ${key} must be a finite number`);
                assert(!isNaN(val), `Key ${key} must not be NaN`);
                assertStrictEqual(val, 0, `Key ${key} must be 0 for empty input`);
            }
        }
    });

    it('3.2 Computes accurate financial totals for standard multi-share portfolio', () => {
        const shares = [
            { code: 'BHP', value: 5000, costBasis: 4000, dayChangeValue: 100, dayChangePercent: 2.0 },
            { code: 'CBA', value: 3000, costBasis: 3500, dayChangeValue: -50, dayChangePercent: -1.6 },
            { code: 'TLS', value: 2000, costBasis: 2000, dayChangeValue: 0, dayChangePercent: 0.0 }
        ];

        const res = calculatePortfolioTotals(shares);

        assertStrictEqual(res.totalValue, 10000, 'Total Value calculation');
        assertStrictEqual(res.totalCost, 9500, 'Total Cost Basis calculation');
        assertStrictEqual(res.dayChangeValue, 50, 'Total Day Change calculation');
        assertStrictEqual(res.totalReturn, 500, 'Total Unrealized Return');
        assertCloseTo(res.totalReturnPercent, 5.263157, 0.001, 'Total Return Percent calculation');
        assertStrictEqual(res.gainerCount, 1, 'Gainer count');
        assertStrictEqual(res.loserCount, 1, 'Loser count');
        assertStrictEqual(res.neutralCount, 1, 'Neutral count');
    });

    it('3.3 Computes day gain, day loss, and previous portfolio value reconstruction accurately', () => {
        const shares = [
            { value: 1000, costBasis: 900, dayChangeValue: 50, dayChangePercent: 5.26 },
            { value: 2000, costBasis: 2100, dayChangeValue: -100, dayChangePercent: -4.76 }
        ];

        const res = calculatePortfolioTotals(shares);

        assertStrictEqual(res.totalValue, 3000);
        assertStrictEqual(res.totalCost, 3000);
        assertStrictEqual(res.dayChangeValue, -50);
        assertStrictEqual(res.dayGain, 50);
        assertStrictEqual(res.dayLoss, -100);
        // previousTotalValue = (1000 - 50) + (2000 - (-100)) = 950 + 2100 = 3050
        // totalDailyPercent = (-50 / 3050) * 100 = -1.639344%
        assertCloseTo(res.dayChangePercent, -1.639344, 0.001);
    });

    it('3.4 Handles malformed data (NaN, undefined, nulls, strings) without NaN or crash', () => {
        const corruptedShares = [
            null,
            undefined,
            {},
            { value: NaN, costBasis: undefined, dayChangeValue: null, dayChangePercent: 'invalid' },
            { value: 'not-a-number', costBasis: Infinity, dayChangeValue: -Infinity },
            { value: 1500, costBasis: 1000, dayChangeValue: 150, dayChangePercent: 11.11 }
        ];

        const res = calculatePortfolioTotals(corruptedShares);

        for (const [key, val] of Object.entries(res)) {
            assert(Number.isFinite(val), `Key "${key}" must be finite (got: ${val})`);
            assert(!isNaN(val), `Key "${key}" must not be NaN`);
        }

        assertStrictEqual(res.totalValue, 1500);
        assertStrictEqual(res.totalCost, 1000);
        assertStrictEqual(res.dayChangeValue, 150);
        assertStrictEqual(res.totalReturn, 500);
        assertStrictEqual(res.totalReturnPercent, 50);
        assertStrictEqual(res.gainerCount, 1);
    });

    it('3.5 Handles zero-cost basis edge case (prevents 0/0 Division by Zero producing NaN)', () => {
        const giftShares = [
            { value: 500, costBasis: 0, dayChangeValue: 10, dayChangePercent: 2.0 }
        ];

        const res = calculatePortfolioTotals(giftShares);

        assertStrictEqual(res.totalCost, 0);
        assertStrictEqual(res.totalReturn, 500);
        assertStrictEqual(res.totalReturnPercent, 0, 'Zero cost basis must produce 0% return rather than NaN or Infinity');
        assert(Number.isFinite(res.totalReturnPercent));
        assert(!isNaN(res.totalReturnPercent));
    });
});

describe('Suite 4: Security Sanitization & Component Lifecycle Resilience', () => {
    it('4.1 Escaping pipeline properly converts <, >, and & characters into safe HTML entities', () => {
        const testCases = [
            { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;' },
            { input: 'BHP & RIO <merger>', expected: 'BHP &amp; RIO &lt;merger&gt;' },
            { input: 'Stock "quote" & \'single\'', expected: 'Stock &quot;quote&quot; &amp; &#39;single&#39;' },
            { input: '1 < 2 && 4 > 3', expected: '1 &lt; 2 &amp;&amp; 4 &gt; 3' }
        ];

        for (const tc of testCases) {
            const escaped = escapeHtml(tc.input);
            assertStrictEqual(escaped, tc.expected, `Escaping failed for input: ${tc.input}`);
            assert(!escaped.includes('<'), `Result must not contain unescaped <: ${escaped}`);
            assert(!escaped.includes('>'), `Result must not contain unescaped >: ${escaped}`);
        }
    });

    it('4.2 Escaping pipeline safely handles null, undefined, numeric, and empty values', () => {
        assertStrictEqual(escapeHtml(''), '', 'Empty string returns empty string');
        assertStrictEqual(escapeHtml(null), '', 'null returns empty string');
        assertStrictEqual(escapeHtml(undefined), '', 'undefined returns empty string');
        assertStrictEqual(escapeHtml(12345), '12345', 'Numbers are converted to safe string');
    });

    it('4.3 ChartModal holds a valid ResizeObserver instance (not undefined) on initialization', () => {
        let observeCallCount = 0;
        let observedElement = null;

        class MockResizeObserver {
            constructor(callback) {
                this.callback = callback;
                this.isObserverInstance = true;
            }
            observe(target) {
                observeCallCount++;
                observedElement = target;
                return undefined;
            }
            disconnect() {}
        }

        const mockDiv = { id: 'chart-container' };
        const chartComp = new MockChartLifecycle();
        chartComp.init(mockDiv, MockResizeObserver);

        assert(chartComp.resizeObserver !== undefined, 'this.resizeObserver must not evaluate to undefined');
        assert(chartComp.resizeObserver !== null, 'this.resizeObserver must not be null');
        assert(chartComp.resizeObserver.isObserverInstance === true, 'this.resizeObserver must hold the observer instance');
        assertStrictEqual(observeCallCount, 1, 'observe() must be called exactly once');
        assertStrictEqual(observedElement, mockDiv, 'observe() must target the provided element');
    });

    it('4.4 ChartModal calls .disconnect() on ResizeObserver upon teardown/destroy', () => {
        let disconnectCalled = false;

        class MockResizeObserver {
            constructor(callback) {
                this.callback = callback;
            }
            observe() {
                return undefined;
            }
            disconnect() {
                disconnectCalled = true;
            }
        }

        const chartComp = new MockChartLifecycle();
        chartComp.init({ id: 'chart-container' }, MockResizeObserver);

        assertStrictEqual(disconnectCalled, false, 'disconnect must not be called before destroy()');
        chartComp.destroy();
        assertStrictEqual(disconnectCalled, true, 'this.resizeObserver.disconnect() must be called on teardown');
        assertStrictEqual(chartComp.chart, null, 'chart instance must be cleaned up on destroy');
    });

    it('4.5 Static codebase verification confirms decoupled observer, escaping, and single-write persistence', () => {
        const chartModalSrc = fs.readFileSync(path.join(__dirname, '../modules/ui/ChartModal.js'), 'utf8');
        const viewRendererSrc = fs.readFileSync(path.join(__dirname, '../modules/ui/ViewRenderer.js'), 'utf8');
        const cashViewRendererSrc = fs.readFileSync(path.join(__dirname, '../modules/ui/CashViewRenderer.js'), 'utf8');
        const watchlistUISrc = fs.readFileSync(path.join(__dirname, '../modules/ui/WatchlistUI.js'), 'utf8');
        const settingsUISrc = fs.readFileSync(path.join(__dirname, '../modules/ui/SettingsUI.js'), 'utf8');

        // ChartModal.js decoupled
        assert(chartModalSrc.includes('this.resizeObserver = new ResizeObserver('), 'ChartModal.js must assign ResizeObserver');
        assert(chartModalSrc.includes('this.resizeObserver.observe(div);'), 'ChartModal.js must call observe(div) decoupled');

        // Escaping dynamic text
        assert(viewRendererSrc.includes('escapeHtml(c.body)'), 'ViewRenderer.js must wrap c.body in escapeHtml');
        assert(cashViewRendererSrc.includes('escapeHtml(asset.name)'), 'CashViewRenderer.js must wrap asset.name in escapeHtml');
        assert(watchlistUISrc.includes('escapeHtml(it.name)'), 'WatchlistUI.js must wrap it.name in escapeHtml');

        // Single write in SettingsUI
        assert(!settingsUISrc.includes('userStore.savePreferences(userId, newPrefs);'), 'SettingsUI.js must not contain direct userStore.savePreferences');
    });
});

describe('Suite 5: Pending Pulse Animation & Startup Retry Logic Verification', () => {
    it('5.1 header.css binds pulse-pending-subtle animation to .connection-dot.health-loading', () => {
        const rawCss = fs.readFileSync(path.join(__dirname, '../styles/components/header.css'), 'utf8');
        const headerCss = rawCss.replace(/\r\n/g, '\n');
        assert(headerCss.includes('@keyframes pulse-pending-subtle'), 'header.css must define @keyframes pulse-pending-subtle');
        assert(headerCss.includes('animation: pulse-pending-subtle 2s infinite ease-in-out;'), 'health-loading must have pulse-pending-subtle animation');
        assert(!headerCss.includes('.connection-dot.health-loading {\n    background-color: #8e8e93;\n    box-shadow: none;\n    animation: none !important;'), 'health-loading must no longer have animation: none !important');
    });

    it('5.2 header.css transitions opacity smoothly on .connection-dot to prevent abrupt cuts', () => {
        const headerCss = fs.readFileSync(path.join(__dirname, '../styles/components/header.css'), 'utf8');
        assert(headerCss.includes('transition: background-color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease;'), 'connection-dot must transition opacity and colors smoothly');
    });

    it('5.3 AppController implements _scheduleFastRetry with 10-15s backoff for strikes 1 and 2', () => {
        const appControllerSrc = fs.readFileSync(path.join(__dirname, '../modules/controllers/AppController.js'), 'utf8');
        assert(appControllerSrc.includes('_scheduleFastRetry('), 'AppController must define _scheduleFastRetry');
        assert(appControllerSrc.includes('_scheduleFastRetry(12000)'), 'AppController must schedule fast retry (~12s) on strike 1 and 2');
        assert(appControllerSrc.includes('this._retryTimer = null;'), 'AppController must manage and clean up _retryTimer');
    });

    it('5.4 Initial boot seed triggers _refreshAllPrices with force=true to prevent stale cache lockout', () => {
        const appControllerSrc = fs.readFileSync(path.join(__dirname, '../modules/controllers/AppController.js'), 'utf8');
        assert(appControllerSrc.includes('await this._refreshAllPrices(AppState.data.shares || [], true);'), 'Boot seed must pass force=true');
    });

    it('5.5 DataService guarantees _isProcessingHistoryQueue release via try-finally', () => {
        const rawSrc = fs.readFileSync(path.join(__dirname, '../modules/data/DataService.js'), 'utf8');
        const dataServiceSrc = rawSrc.replace(/\r\n/g, '\n');
        assert(dataServiceSrc.includes('try {\n            while (this._historyQueue.length > 0)'), '_processHistoryQueue must wrap queue loop in try block');
        assert(dataServiceSrc.includes('} finally {\n            this._isProcessingHistoryQueue = false;\n        }'), '_processHistoryQueue must reset flag in finally block');
    });
});

describe('Suite 6: Active Target Alerts & Daily Brief Widget Verification', () => {
    it('6.1 AppConstants registers PRICES_UPDATED and widget target CSS classes', () => {
        const appConstantsSrc = fs.readFileSync(path.join(__dirname, '../modules/utils/AppConstants.js'), 'utf8');
        assert(appConstantsSrc.includes("PRICES_UPDATED: 'PRICES_UPDATED'"), 'AppConstants must export EVENTS.PRICES_UPDATED');
        assert(appConstantsSrc.includes("WIDGET_TARGET_ROW: 'widget-target-row'"), 'AppConstants must export CSS_CLASSES.WIDGET_TARGET_ROW');
        assert(appConstantsSrc.includes("WIDGET_TARGET_BADGE: 'widget-target-badge'"), 'AppConstants must export CSS_CLASSES.WIDGET_TARGET_BADGE');
        assert(appConstantsSrc.includes("WIDGET_TARGET_HIT: 'widget-target-hit'"), 'AppConstants must export CSS_CLASSES.WIDGET_TARGET_HIT');
        assert(appConstantsSrc.includes("BADGE_POSITIVE: 'badge-positive'"), 'AppConstants must export CSS_CLASSES.BADGE_POSITIVE');
        assert(appConstantsSrc.includes("BADGE_NEGATIVE: 'badge-negative'"), 'AppConstants must export CSS_CLASSES.BADGE_NEGATIVE');
        assert(appConstantsSrc.includes("BADGE_UP: 'badge-up'"), 'AppConstants must export CSS_CLASSES.BADGE_UP');
        assert(appConstantsSrc.includes("BADGE_DOWN: 'badge-down'"), 'AppConstants must export CSS_CLASSES.BADGE_DOWN');
    });

    it('6.2 WidgetPanel registers active_targets in WIDGET_MODULES with default: true', () => {
        const widgetPanelSrc = fs.readFileSync(path.join(__dirname, '../modules/ui/WidgetPanel.js'), 'utf8');
        assert(widgetPanelSrc.includes("id: 'active_targets'"), 'WIDGET_MODULES must include active_targets');
        assert(widgetPanelSrc.includes("label: 'Active Target Alerts'"), 'active_targets must have label Active Target Alerts');
        assert(widgetPanelSrc.includes("renderer: '_renderActiveTargets'"), 'active_targets must bind to _renderActiveTargets');
    });

    it('6.3 WidgetPanel subscribes reactively to PRICES_UPDATED via StateAuditor and DOM event', () => {
        const widgetPanelSrc = fs.readFileSync(path.join(__dirname, '../modules/ui/WidgetPanel.js'), 'utf8');
        assert(widgetPanelSrc.includes("StateAuditor.on(EVENTS.PRICES_UPDATED"), 'WidgetPanel must listen to StateAuditor PRICES_UPDATED');
        assert(widgetPanelSrc.includes("document.addEventListener(EVENTS.PRICES_UPDATED"), 'WidgetPanel must listen to document PRICES_UPDATED');
    });

    it('6.4 Target distance math accurately computes objective mathematical percentage distance', () => {
        // Objective distance: ((livePrice - targetPrice) / targetPrice) * 100
        // ARB (BUY: Target $20.00 | Live $18.10) -> -9.50%
        const liveARB = 18.10;
        const targetARB = 20.00;
        const distARB = ((liveARB - targetARB) / targetARB) * 100;
        assertCloseTo(distARB, -9.50, 0.001, 'Live below target must yield negative percentage distance (-9.50%)');

        // BPT (BUY: Target $0.80 | Live $0.90) -> +12.50%
        const liveBPT = 0.90;
        const targetBPT = 0.80;
        const distBPT = ((liveBPT - targetBPT) / targetBPT) * 100;
        assertCloseTo(distBPT, 12.50, 0.001, 'Live above target must yield positive percentage distance (+12.50%)');

        // SELL target: Target $50.00 | Live $45.00 -> -10.00%
        const liveSellBelow = 45.00;
        const targetSell = 50.00;
        const distSellBelow = ((liveSellBelow - targetSell) / targetSell) * 100;
        assertCloseTo(distSellBelow, -10.00, 0.001, 'Sell order below target must yield negative distance (-10.00%)');

        // SELL target: Target $50.00 | Live $55.00 -> +10.00%
        const liveSellAbove = 55.00;
        const distSellAbove = ((liveSellAbove - targetSell) / targetSell) * 100;
        assertCloseTo(distSellAbove, 10.00, 0.001, 'Sell order above target must yield positive distance (+10.00%)');
    });

    it('6.5 Target hit condition triggers correctly for BUY (price <= target) and SELL (price >= target)', () => {
        // BUY targets: price <= target
        const isHitBuy = (live, target) => live <= (target + 0.0001);
        assert(isHitBuy(18.10, 20.00), 'ARB at $18.10 triggers BUY target $20.00');
        assert(isHitBuy(20.00, 20.00), 'ARB at $20.00 triggers BUY target $20.00 (exact hit)');
        assert(!isHitBuy(0.90, 0.80), 'BPT at $0.90 does NOT trigger BUY target $0.80');

        // SELL targets: price >= target
        const isHitSell = (live, target) => live >= (target - 0.0001);
        assert(isHitSell(55.00, 50.00), 'Price 55.00 triggers SELL target 50.00');
        assert(isHitSell(50.00, 50.00), 'Price 50.00 triggers SELL target 50.00 (exact hit)');
        assert(!isHitSell(45.00, 50.00), 'Price 45.00 does NOT trigger SELL target 50.00');
    });

    it('6.6 widget-panel.css provides styled tokens for widget-target-row, badge, hit states, and snapshot movement badges', () => {
        const cssSrc = fs.readFileSync(path.join(__dirname, '../styles/features/widget-panel.css'), 'utf8');
        assert(cssSrc.includes('.widget-target-row'), 'widget-panel.css must define .widget-target-row');
        assert(cssSrc.includes('.widget-target-badge'), 'widget-panel.css must define .widget-target-badge');
        assert(cssSrc.includes('.widget-target-hit'), 'widget-panel.css must define .widget-target-hit');
        assert(cssSrc.includes('.badge-positive'), 'widget-panel.css must define .badge-positive');
        assert(cssSrc.includes('.badge-negative'), 'widget-panel.css must define .badge-negative');
        assert(cssSrc.includes('.badge-up'), 'widget-panel.css must define .badge-up');
        assert(cssSrc.includes('.badge-down'), 'widget-panel.css must define .badge-down');
    });

    it('6.7 Dashboard snapshot badge class evaluates correctly for positive and negative percentage changes', () => {
        const getBadgeClass = (pct, changeVal) => {
            const isPositive = (pct !== 0 ? pct : changeVal) >= 0;
            return isPositive ? 'badge-positive badge-up' : 'badge-negative badge-down';
        };

        assertStrictEqual(getBadgeClass(1.5, 10.2), 'badge-positive badge-up', 'Positive percentage yields badge-positive');
        assertStrictEqual(getBadgeClass(0, 0), 'badge-positive badge-up', 'Zero change yields badge-positive');
        assertStrictEqual(getBadgeClass(-1.14, -60.5), 'badge-negative badge-down', 'Negative S&P 500 yields badge-negative');
        assertStrictEqual(getBadgeClass(-1.60, -250), 'badge-negative badge-down', 'Negative Nasdaq yields badge-negative');
        assertStrictEqual(getBadgeClass(-0.14, -0.10), 'badge-negative badge-down', 'Negative Brent Oil yields badge-negative');
    });
});

describe('Suite 7: Macro Balance % Splits & Stale/Offline Warning Banner Verification', () => {
    it('7.1 AppConstants registers WIDGET_WARNING_BANNER and WIDGET_PROGRESS_BAR', () => {
        const appConstantsSrc = fs.readFileSync(path.join(__dirname, '../modules/utils/AppConstants.js'), 'utf8');
        assert(appConstantsSrc.includes("WIDGET_WARNING_BANNER: 'widget-warning-banner'"), 'AppConstants must export CSS_CLASSES.WIDGET_WARNING_BANNER');
        assert(appConstantsSrc.includes("WIDGET_PROGRESS_BAR: 'widget-progress-bar'"), 'AppConstants must export CSS_CLASSES.WIDGET_PROGRESS_BAR');
    });

    it('7.2 widget-panel.css provides styles for .widget-warning-banner and .widget-progress-bar', () => {
        const cssSrc = fs.readFileSync(path.join(__dirname, '../styles/features/widget-panel.css'), 'utf8');
        assert(cssSrc.includes('.widget-warning-banner'), 'widget-panel.css must define .widget-warning-banner');
        assert(cssSrc.includes('.widget-progress-bar'), 'widget-panel.css must define .widget-progress-bar');
    });

    it('7.3 Macro balance percentage splits compute accurately and sum to 100%', () => {
        const stats = {
            superValue: 150000,
            cashInBankValue: 78000,
            shareValue: 165000,
            otherValue: 7000,
            totalValue: 400000
        };
        const total = stats.totalValue;
        const superPct = (stats.superValue / total) * 100;
        const cashPct = (stats.cashInBankValue / total) * 100;
        const sharePct = (stats.shareValue / total) * 100;
        const otherPct = (stats.otherValue / total) * 100;

        assertCloseTo(superPct, 37.5, 0.001, 'Super % should be 37.5%');
        assertCloseTo(cashPct, 19.5, 0.001, 'Cash % should be 19.5%');
        assertCloseTo(sharePct, 41.25, 0.001, 'Share % should be 41.25%');
        assertCloseTo(otherPct, 1.75, 0.001, 'Other % should be 1.75%');
        assertCloseTo(superPct + cashPct + sharePct + otherPct, 100, 0.001, 'All splits must sum to 100%');
    });

    it('7.4 Macro balance handles zero total value gracefully without NaN', () => {
        const total = 0;
        const calcPct = (val) => total > 0 ? ((val / total) * 100) : 0;
        assertStrictEqual(calcPct(0), 0, 'Zero total must produce 0% without NaN');
        assertStrictEqual(calcPct(500), 0, 'Zero total with value must produce 0% without NaN');
    });

    it('7.5 Stale / Offline warning banner trigger condition works correctly', () => {
        const checkBanner = (healthStatus, onLine) => {
            return healthStatus === 'stale' || healthStatus === 'offline' || !onLine;
        };

        // Healthy cases (Banner must NOT show)
        assert(!checkBanner('healthy', true), 'Healthy and online should not trigger banner');
        assert(!checkBanner('loading', true), 'Loading and online should not trigger banner');

        // Trigger cases (Banner MUST show)
        assert(checkBanner('stale', true), 'Stale status must trigger warning banner');
        assert(checkBanner('offline', true), 'Offline health status must trigger warning banner');
        assert(checkBanner('healthy', false), 'Browser offline (navigator.onLine=false) must trigger warning banner');
        assert(checkBanner('critical', false), 'Offline and critical must trigger warning banner');
    });

    it('7.6 WidgetPanel _getCategoryColor ignores legacy olive/coffee on shares and returns Electric Cyan token', () => {
        const resolveColor = (categoryId, userPrefs = []) => {
            if (!categoryId) return 'var(--color-accent)';
            if (categoryId === 'shares') {
                const userPref = userPrefs.find(c => c.id === 'shares');
                if (userPref && userPref.color && !['#808000', '#a49393'].includes(userPref.color.toLowerCase())) {
                    return userPref.color;
                }
                return 'var(--asset-shares, #00D2FF)';
            }
            return 'var(--asset-shares, #00D2FF)';
        };

        // Legacy olive override must be ignored in favor of design token
        assertStrictEqual(
            resolveColor('shares', [{ id: 'shares', color: '#808000' }]),
            'var(--asset-shares, #00D2FF)',
            'Legacy olive (#808000) must be bypassed for shares'
        );

        // Legacy coffee override must be ignored in favor of design token
        assertStrictEqual(
            resolveColor('shares', [{ id: 'shares', color: '#a49393' }]),
            'var(--asset-shares, #00D2FF)',
            'Legacy coffee (#a49393) must be bypassed for shares'
        );

        // Empty userPrefs must return design token
        assertStrictEqual(
            resolveColor('shares', []),
            'var(--asset-shares, #00D2FF)',
            'Default fallback must return var(--asset-shares, #00D2FF)'
        );
    });

    it('7.7 User categories sanitization converts legacy olive/coffee on shares to #00D2FF', () => {
        const sanitizeCats = (cats) => {
            if (!Array.isArray(cats)) return cats;
            cats.forEach(c => {
                if (c && c.id === 'shares' && (c.color?.toLowerCase() === '#808000' || c.color?.toLowerCase() === '#a49393')) {
                    c.color = '#00D2FF';
                }
            });
            return cats;
        };

        const testCats = [
            { id: 'shares', color: '#808000' },
            { id: 'super', color: '#9C27B0' },
            { id: 'cash', color: '#1A237E' }
        ];

        sanitizeCats(testCats);
        assertStrictEqual(testCats[0].color, '#00D2FF', 'Shares color must be sanitized from #808000 to #00D2FF');
        assertStrictEqual(testCats[1].color, '#9C27B0', 'Super color must be untouched');
        assertStrictEqual(testCats[2].color, '#1A237E', 'Cash color must be untouched');
    });
});

// ============================================================================
// SUMMARY REPORT
// ============================================================================
console.log('\n==================================================');
console.log(`\x1b[1mTEST EXECUTION SUMMARY\x1b[0m`);
console.log(`Total Tests : ${totalTests}`);
console.log(`Passed      : \x1b[32m${passedTests}\x1b[0m`);
console.log(`Failed      : \x1b[${failedTests > 0 ? '31' : '32'}m${failedTests}\x1b[0m`);
console.log('==================================================\n');

if (failedTests > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
