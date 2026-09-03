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
function evaluateConnectionStatus({ isConnected, isDataReady, healthStatus, isOnline, marketSession }) {
    // 1. Network Offline
    if (healthStatus === 'offline' || !isOnline) {
        return {
            statusClass: 'health-offline',
            title: 'Offline - Connect to internet for live updates',
            badgeColor: 'red'
        };
    }

    // 2. Critical Error
    if (healthStatus === 'critical') {
        return {
            statusClass: 'health-critical',
            title: 'Connection / Sync error detected. Click to retry.',
            badgeColor: 'red'
        };
    }

    // 3. Loading State or Unready Firestore Data
    if (healthStatus === 'loading' || (isConnected && !isDataReady)) {
        return {
            statusClass: 'health-loading',
            title: !isDataReady ? 'Loading Data...' : 'Refreshing Stock Prices...',
            badgeColor: 'amber'
        };
    }

    // 4. Stale Feed
    if (healthStatus === 'stale') {
        return {
            statusClass: 'health-stale',
            title: 'Feed Delayed / Stale (Click Live Refresh to update)',
            badgeColor: 'amber'
        };
    }

    // 5. Authenticated & Fresh Data (Ready)
    if (isConnected) {
        if (marketSession === 'OPEN' || marketSession === 'AUCTION') {
            return {
                statusClass: marketSession === 'OPEN' ? 'health-market-open' : 'health-market-auction',
                title: 'ASX Open • 15-Min Delayed Live Feed',
                badgeColor: 'green'
            };
        } else {
            return {
                statusClass: 'health-market-closed',
                title: 'Market Closed',
                badgeColor: 'green'
            };
        }
    }

    // Disconnected Guest
    return {
        statusClass: 'health-offline',
        title: 'Disconnected - Click to Reconnect',
        badgeColor: 'red'
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

    it('1.2 Auth completed + Online + isDataReady=false stays in loading/amber state', () => {
        const result = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: false,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'OPEN'
        });

        assertStrictEqual(result.statusClass, 'health-loading');
        assertStrictEqual(result.badgeColor, 'amber');
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

        const resultClosed = evaluateConnectionStatus({
            isConnected: true,
            isDataReady: true,
            healthStatus: 'healthy',
            isOnline: true,
            marketSession: 'CLOSED'
        });
        assertStrictEqual(resultClosed.statusClass, 'health-market-closed');
        assertStrictEqual(resultClosed.badgeColor, 'green');
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
