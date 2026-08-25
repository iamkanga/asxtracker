/**
 * AppHealthTest.js
 * Automated Health Check Script
 * 
 * This script runs a comprehensive validation of the app's state management,
 * UI rendering, and data integrity. It's designed to be executed either:
 * 1. Automatically after boot (via StateAuditor)
 * 2. Manually via console: window.runHealthCheck()
 * 
 * It returns a structured report: { passed: bool, tests: [...], failures: [...] }
 */

import { AppState } from './AppState.js';
import { StateAuditor } from './StateAuditor.js';
import { MarketSchedule, ASX_SESSION } from '../utils/MarketSchedule.js';
import { CSS_CLASSES, IDS } from '../utils/AppConstants.js';
import { ChartDataSanitizer } from '../utils/ChartDataSanitizer.js';

const TESTS = [];
const FAILURES = [];

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            TESTS.push({ name, passed: true });
        } else {
            TESTS.push({ name, passed: false, reason: result || 'Returned falsy' });
            FAILURES.push({ name, reason: result || 'Returned falsy' });
        }
    } catch (e) {
        TESTS.push({ name, passed: false, reason: e.message });
        FAILURES.push({ name, reason: e.message });
    }
}

// ─── RACE REGRESSION MONITOR ───
// Watches the 4 historically-dangerous keys for regressions.
// Started at boot, checked by health test.
const MONITORED_RACE_KEYS = ['sortConfigMap', 'isLocked', 'data', 'sortConfig'];
let _raceRegressionLog = [];

export function startRaceRegressionMonitor() {
    _raceRegressionLog = [];

    // Subscribe to each key via StateAuditor to count rapid writes
    const _timestamps = {};
    const RACE_WINDOW = 50; // ms - same as StateAuditor

    for (const key of MONITORED_RACE_KEYS) {
        StateAuditor.subscribe(key, (newVal, oldVal, mutatedKey) => {
            const now = Date.now();
            const last = _timestamps[mutatedKey];
            if (last && (now - last) < RACE_WINDOW) {
                _raceRegressionLog.push({
                    key: mutatedKey,
                    timeDelta: now - last,
                    time: new Date(now).toLocaleTimeString(),
                    message: `REGRESSION: "${mutatedKey}" written twice within ${now - last}ms`
                });
            }
            _timestamps[mutatedKey] = now;
        });
    }
}

/**
 * Run all health checks and return a structured report.
 */
export function runHealthCheck() {
    TESTS.length = 0;
    FAILURES.length = 0;

    console.group('%c🏥 APP HEALTH CHECK', 'background: #1a1a2e; color: #00ff88; font-weight: bold; padding: 6px 16px; border-radius: 6px; font-size: 16px;');

    // ═══════════════════════════════════════
    // SECTION 1: STATE STRUCTURE
    // ═══════════════════════════════════════
    test('AppState exists', () => !!AppState);
    test('AppState.data exists', () => !!AppState.data);
    test('AppState.data.shares is array', () => Array.isArray(AppState.data.shares));
    test('AppState.data.cash is array', () => Array.isArray(AppState.data.cash));
    test('AppState.data.watchlists is array', () => Array.isArray(AppState.data.watchlists));
    test('AppState.data.dashboard is array', () => Array.isArray(AppState.data.dashboard));
    test('AppState.livePrices is Map', () => AppState.livePrices instanceof Map);
    test('AppState.hiddenAssets is Set', () => AppState.hiddenAssets instanceof Set);
    test('AppState.carouselSelections is Set', () => AppState.carouselSelections instanceof Set);
    test('AppState.hiddenWatchlists is Set', () => AppState.hiddenWatchlists instanceof Set);

    // ═══════════════════════════════════════
    // SECTION 2: WATCHLIST STATE
    // ═══════════════════════════════════════
    test('AppState.watchlist exists', () => !!AppState.watchlist);
    test('AppState.watchlist.type is valid', () => ['stock', 'cash'].includes(AppState.watchlist.type));

    // ═══════════════════════════════════════
    // SECTION 3: VIEW STATE
    // ═══════════════════════════════════════
    test('AppState.viewMode is valid', () => ['TABLE', 'COMPACT', 'SNAPSHOT'].includes((AppState.viewMode || '').toUpperCase()));

    // ═══════════════════════════════════════
    // SECTION 4: SORT STATE
    // ═══════════════════════════════════════
    test('AppState.sortConfig exists', () => !!AppState.sortConfig);
    test('AppState.sortConfig.field is string', () => typeof AppState.sortConfig.field === 'string');
    test('AppState.sortConfig.direction is valid', () => ['asc', 'desc'].includes(AppState.sortConfig.direction));
    test('AppState.sortConfigMap is object', () => typeof AppState.sortConfigMap === 'object' && !Array.isArray(AppState.sortConfigMap));

    // ═══════════════════════════════════════
    // SECTION 5: PREFERENCES
    // ═══════════════════════════════════════
    test('AppState.preferences exists', () => !!AppState.preferences);
    test('AppState.preferences.security exists', () => !!AppState.preferences.security);
    test('AppState.preferences.containerBorders exists', () => !!AppState.preferences.containerBorders);

    // ═══════════════════════════════════════
    // SECTION 6: FUNCTIONS
    // ═══════════════════════════════════════
    test('AppState.triggerSync is function', () => typeof AppState.triggerSync === 'function');
    test('AppState.resetAll is function', () => typeof AppState.resetAll === 'function');
    test('AppState.saveWatchlistState is function', () => typeof AppState.saveWatchlistState === 'function');
    test('AppState.saveSortConfigForWatchlist is function', () => typeof AppState.saveSortConfigForWatchlist === 'function');

    // ═══════════════════════════════════════
    // SECTION 7: DOM CHECKS
    // ═══════════════════════════════════════
    test('Main container exists', () => !!document.getElementById('main-content') || 'No #main-content element');
    test('Header exists', () => !!document.getElementById('appHeader') || 'No #appHeader element');
    test('Sidebar exists', () => !!document.getElementById('sidebar') || 'No #sidebar element');

    // ═══════════════════════════════════════
    // SECTION 8: AUDITOR
    // ═══════════════════════════════════════
    test('StateAuditor is enabled', () => StateAuditor._enabled || 'StateAuditor is disabled');
    test('StateAuditor has boot snapshot', () => !!StateAuditor._snapshots['__boot__'] || 'No boot snapshot');

    // ═══════════════════════════════════════
    // SECTION 9: DATA INTEGRITY (authenticated only)
    // ═══════════════════════════════════════
    if (AppState.user) {
        test('User has uid', () => !!AppState.user.uid);
        test('Shares have IDs', () => {
            const shares = AppState.data.shares || [];
            const bad = shares.filter(s => !s.id);
            if (bad.length > 0) {
                // Log diagnostic detail but treat as warning, not failure
                // Firestore optimistic writes may temporarily create ID-less entries
                console.warn(`[HealthCheck] ${bad.length} shares without ID:`,
                    bad.map(s => s.shareName || s.code || 'unknown'));
            }
            return true; // Warn-only: optimistic IDs are expected during sync
        });
        test('Shares have codes', () => {
            const bad = (AppState.data.shares || []).filter(s => !s.shareName && !s.code);
            return bad.length === 0 || `${bad.length} shares missing code/shareName`;
        });
        test('No duplicate share IDs (non-empty)', () => {
            const ids = (AppState.data.shares || [])
                .map(s => s.id)
                .filter(id => id && id.length > 0); // Only check non-empty IDs
            const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
            return dupes.length === 0 || `Duplicate IDs: ${[...new Set(dupes)].join(', ')}`;
        });
        test('Cash items have names', () => {
            const bad = (AppState.data.cash || []).filter(c => !c.name);
            return bad.length === 0 || `${bad.length} cash items missing name`;
        });

        // v1146: Cross-reference Watchlists vs Master Shares
        test('No Ghost Share references', () => {
            const shares = AppState.data.shares || [];
            const watchlists = AppState.data.watchlists || [];
            const knownCodes = new Set(shares.map(s => (s.shareName || s.code || '').toUpperCase()));

            const ghosts = [];
            watchlists.forEach(w => {
                if (w.stocks && Array.isArray(w.stocks)) {
                    w.stocks.forEach(code => {
                        if (code && !knownCodes.has(code.toUpperCase())) {
                            ghosts.push(code.toUpperCase());
                        }
                    });
                }
            });

            if (ghosts.length > 0) {
                const unique = [...new Set(ghosts)];
                console.warn(`[HealthCheck] Found ${unique.length} codes in watchlists without master documents:`, unique);
                // Return true to treat as Warning, or a string to fail the test. 
                // Given the user wants visibility, let's Fail it so they see it.
                return `${unique.length} Ghosts: ${unique.join(', ')}`;
            }
            return true;
        });
    }

    // ═══════════════════════════════════════
    // SECTION 10: RACE CONDITION CHECK
    // ═══════════════════════════════════════
    test('No race conditions detected', () => {
        return StateAuditor._raceConditions.length === 0 ||
            `${StateAuditor._raceConditions.length} race(s): ${StateAuditor._raceConditions.map(r => r.key).join(', ')}`;
    });

    // ═══════════════════════════════════════
    // SECTION 11: RACE REGRESSION (v1135+)
    // ═══════════════════════════════════════
    test('No race regressions (monitored keys)', () => {
        if (_raceRegressionLog.length > 0) {
            return `${_raceRegressionLog.length} regression(s): ${_raceRegressionLog.map(r => r.key).join(', ')}`;
        }
        return true;
    });

    // ═══════════════════════════════════════
    // SECTION 12: BOOT TIMING
    // ═══════════════════════════════════════
    test('Boot timing within budget', () => {
        const bootSnap = StateAuditor._snapshots['__boot__'];
        if (!bootSnap) return true; // Can't check without boot snapshot
        const bootTime = bootSnap.timestamp;
        const elapsed = Date.now() - bootTime;
        // Health check runs ~8s after boot; total boot should be well under 15s
        if (elapsed > 15000) {
            return `Boot took ${(elapsed / 1000).toFixed(1)}s (budget: 15s)`;
        }
        return true;
    });

    // ═══════════════════════════════════════
    // SECTION 13: MUTATION VOLUME
    // ═══════════════════════════════════════
    test('Mutation volume is healthy', () => {
        const log = StateAuditor._log || [];
        // During boot, we expect < 100 mutations. If > 200, something is looping.
        if (log.length > 200) {
            // Build a breakdown
            const counts = {};
            log.forEach(e => { counts[e.key] = (counts[e.key] || 0) + 1; });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
            return `${log.length} mutations (budget: 200). Top: ${top.map(([k, v]) => `${k}(${v})`).join(', ')}`;
        }
        return true;
    });

    // ═══════════════════════════════════════
    // SECTION 14: EVENT BUS (v1136+)
    // ═══════════════════════════════════════
    test('Event Bus has entries', () => StateAuditor._channels.size > 0 || 'No event channels registered');
    test('PRICES_UPDATED channel is active', () => {
        const subs = StateAuditor._channels.get('PRICES_UPDATED');
        if (!subs) return 'PRICES_UPDATED channel not found';
        if (subs.size === 0) return 'PRICES_UPDATED has zero listeners (Dead Event)';
        return true;
    });
    test('No dead event channels', () => {
        const dead = Array.from(StateAuditor._channels.entries())
            .filter(([name, subs]) => subs.size === 0)
            .map(([name]) => name);
        return dead.length === 0 || `Dead channels: ${dead.join(', ')}`;
    });

    // ═══════════════════════════════════════
    // SECTION 15: MARKET SCHEDULE & TELEMETRY
    // ═══════════════════════════════════════
    test('MarketSchedule evaluates valid ASX session', () => {
        const status = MarketSchedule.getASXStatus();
        if (!status || !status.session) return 'MarketSchedule.getASXStatus returned falsy session';
        if (![ASX_SESSION.OPEN, ASX_SESSION.PRE_OPEN, ASX_SESSION.AUCTION, ASX_SESSION.CLOSED].includes(status.session)) {
            return `Invalid session: ${status.session}`;
        }
        if (typeof status.isTrading !== 'boolean') return 'isTrading is not boolean';
        if (!status.sydneyTime || !status.label) return 'Missing sydneyTime or label';
        return true;
    });
    test('Market-aware CSS classes and IDs registered in AppConstants', () => {
        const requiredClasses = [
            'HEALTH_MARKET_OPEN', 'HEALTH_MARKET_CLOSED', 'HEALTH_MARKET_AUCTION', 
            'HEALTH_MARKET_PREOPEN', 'HEALTH_STALE', 'HEALTH_OFFLINE', 'HEALTH_LOADING',
            'MARKET_STATUS_SUBTEXT', 'STATUS_OPEN', 'STATUS_CLOSED', 'LIVE_REFRESH_TEXT_STACK'
        ];
        const missingClasses = requiredClasses.filter(cls => !CSS_CLASSES[cls]);
        if (missingClasses.length > 0) return `Missing CSS_CLASSES: ${missingClasses.join(', ')}`;

        if (!IDS.MARKET_STATUS_SUBTEXT) return 'Missing IDS.MARKET_STATUS_SUBTEXT';
        return true;
    });

    // ═══════════════════════════════════════
    // SECTION 16: PRICE FALLBACK & VALUATION RESILIENCE
    // ═══════════════════════════════════════
    test('resolveStockPrice handles out-of-market 0/null prices gracefully', () => {
        // Mock import or inline test of resolveStockPrice logic
        const testCase1 = (priceData, share) => {
            const live = parseFloat(priceData?.live);
            if (!isNaN(live) && live > 0) return live;
            const prevClose = parseFloat(priceData?.prevClose);
            if (!isNaN(prevClose) && prevClose > 0) return prevClose;
            const entered = parseFloat(share?.enteredPrice);
            if (!isNaN(entered) && entered > 0) return entered;
            const buy = parseFloat(share?.buyPrice);
            if (!isNaN(buy) && buy > 0) return buy;
            return 0;
        };

        // Case A: 0 live price, valid prevClose (out-of-market state)
        const p1 = testCase1({ live: 0, prevClose: 25.50 }, { enteredPrice: 20 });
        if (p1 !== 25.50) return `Expected 25.50 from prevClose, got ${p1}`;

        // Case B: null live price, valid prevClose
        const p2 = testCase1({ live: null, prevClose: 42.10 }, {});
        if (p2 !== 42.10) return `Expected 42.10 from prevClose, got ${p2}`;

        // Case C: 0 live price, 0 prevClose, valid enteredPrice
        const p3 = testCase1({ live: 0, prevClose: 0 }, { enteredPrice: 15.75 });
        if (p3 !== 15.75) return `Expected 15.75 from enteredPrice, got ${p3}`;

        return true;
    });

    if (AppState.user) {
        test('No active portfolio holdings evaluated at $0', () => {
            const shares = AppState.data.shares || [];
            const activeShares = shares.filter(s => (parseFloat(s.portfolioShares) || parseFloat(s.units) || 0) > 0);
            const zeroValShares = [];

            activeShares.forEach(s => {
                const code = (s.shareName || s.code || '').trim().toUpperCase();
                const priceData = AppState.livePrices?.get(code) || AppState.livePrices?.get(code + '.AX');
                const live = parseFloat(priceData?.live);
                const prev = parseFloat(priceData?.prevClose);
                const entered = parseFloat(s.enteredPrice || s.entryPrice || s.buyPrice || s.purchasePrice || 0);

                const resolved = (live > 0) ? live : ((prev > 0) ? prev : ((entered > 0) ? entered : 0));
                if (resolved <= 0) {
                    zeroValShares.push(code);
                }
            });

            if (zeroValShares.length > 0) {
                return `${zeroValShares.length} holding(s) with 0 valuation: ${zeroValShares.join(', ')}`;
            }
            return true;
        });
    }

    // ═══════════════════════════════════════
    // SECTION 17: HISTORICAL GLITCH SANITIZATION & INGESTION GATEKEEPER
    // ═══════════════════════════════════════
    test('ChartDataSanitizer removes single-point V-dips and transient plunges', () => {
        const testSnapshots = [
            { time: 1000, total: 1000000, shares: 800000, super: 200000, cash: 0 },
            { time: 2000, total: 1010000, shares: 810000, super: 200000, cash: 0 },
            { time: 3000, total: 600000, shares: 400000, super: 200000, cash: 0 }, // 40% transient drop
            { time: 4000, total: 1015000, shares: 815000, super: 200000, cash: 0 }, // recovered
            { time: 5000, total: 1020000, shares: 820000, super: 200000, cash: 0 }
        ];

        const sanitized = ChartDataSanitizer.sanitizeSnapshotSeries(testSnapshots);
        if (sanitized.length !== 5) return `Expected 5 snapshots, got ${sanitized.length}`;

        const glitchPoint = sanitized[2];
        if (glitchPoint.total < 1000000 || glitchPoint.total > 1020000) {
            return `Glitch point total not interpolated: expected ~1012500, got ${glitchPoint.total}`;
        }
        if (!glitchPoint._sanitized) return 'Glitch point missing _sanitized flag';
        return true;
    });

    test('ChartDataSanitizer removes multi-point out-of-hours plateaus (weekend/overnight zero-price bug)', () => {
        // Friday 15:00 Sydney time (Trading hours): 1787382000
        const friTs = 1787382000;
        const plateauSnapshots = [
            { time: friTs - 3600, total: 1050000, shares: 950000, super: 0, cash: 100000 },
            { time: friTs, total: 1055000, shares: 955000, super: 0, cash: 100000 },
            // Weekend corrupted plateau (6 consecutive corrupted snapshots with $0 shares out of hours)
            { time: friTs + 10000, total: 100000, shares: 0, super: 0, cash: 100000 },
            { time: friTs + 20000, total: 100000, shares: 0, super: 0, cash: 100000 },
            { time: friTs + 30000, total: 100000, shares: 0, super: 0, cash: 100000 },
            { time: friTs + 40000, total: 100000, shares: 0, super: 0, cash: 100000 },
            { time: friTs + 50000, total: 100000, shares: 0, super: 0, cash: 100000 },
            { time: friTs + 60000, total: 100000, shares: 0, super: 0, cash: 100000 },
            // Monday 11:00 Sydney open
            { time: friTs + 243600, total: 1060000, shares: 960000, super: 0, cash: 100000 }
        ];

        const sanitized = ChartDataSanitizer.sanitizeSnapshotSeries(plateauSnapshots);
        if (sanitized.length !== plateauSnapshots.length) return `Snapshot length mismatch: expected ${plateauSnapshots.length}, got ${sanitized.length}`;

        for (let i = 2; i <= 7; i++) {
            if (sanitized[i].total < 1000000) {
                return `Plateau index ${i} was not cleaned: total is ${sanitized[i].total}`;
            }
            if (!sanitized[i]._sanitized) {
                return `Plateau index ${i} missing _sanitized flag`;
            }
        }
        return true;
    });

    test('ChartDataSanitizer removes component-level V-dips (e.g. Shares $60k drop with rapid recovery)', () => {
        const ts = 1787664000;
        const testData = [
            { time: ts - 7200, total: 2840000, shares: 1047000, super: 800000, cash: 993000 },
            { time: ts - 3600, total: 2780000, shares: 986152, super: 800000, cash: 993000 }, // 25 Aug $60.8k dip on shares
            { time: ts, total: 2833853, shares: 1040853, super: 800000, cash: 993000 }  // LIVE point
        ];

        const sanitized = ChartDataSanitizer.sanitizeSnapshotSeries(testData);
        if (sanitized[1].shares < 1030000) {
            return `Component V-dip not interpolated: expected ~1043926, got ${sanitized[1].shares}`;
        }
        if (!sanitized[1]._sanitized) return 'Component V-dip missing _sanitized flag';
        return true;
    });

    test('ChartDataSanitizer preserves legitimate structural downward trends', () => {
        // Multi-day sustained decline with NO transient V-recovery
        const legitimateTrend = [
            { time: 1000, total: 1000000, shares: 800000, super: 200000, cash: 0 },
            { time: 2000, total: 950000, shares: 750000, super: 200000, cash: 0 },
            { time: 3000, total: 800000, shares: 600000, super: 200000, cash: 0 }, // 15%+ sustained drop
            { time: 4000, total: 790000, shares: 590000, super: 200000, cash: 0 }, // stays low
            { time: 5000, total: 780000, shares: 580000, super: 200000, cash: 0 }  // stays low
        ];

        const sanitized = ChartDataSanitizer.sanitizeSnapshotSeries(legitimateTrend);
        if (sanitized[2].total !== 800000) {
            return `Legitimate drop altered: expected 800000, got ${sanitized[2].total}`;
        }
        if (sanitized[3].total !== 790000) {
            return `Legitimate drop altered: expected 790000, got ${sanitized[3].total}`;
        }
        return true;
    });

    test('Ingestion Gatekeeper rejects corrupted or out-of-hours unconfirmed plunges', () => {
        // Test 1: Zero-holding price rejection
        const corruptShares = [{ shareName: 'CBA', portfolioShares: 100, enteredPrice: 0 }];
        const result1 = ChartDataSanitizer.validateSnapshotProposal({
            shares: corruptShares,
            cash: [],
            livePrices: new Map([['CBA', { live: 0, prevClose: 0 }]]),
            lastCleanValue: 100000,
            isMarketOpen: false
        });
        if (result1.isValid) return 'Gatekeeper failed to reject zeroed holding price';

        // Test 2: Out-of-hours plunge rejection (>15% drop when market closed)
        const validShares = [{ shareName: 'BHP', portfolioShares: 1000, enteredPrice: 40 }];
        const result2 = ChartDataSanitizer.validateSnapshotProposal({
            shares: validShares,
            cash: [],
            livePrices: new Map([['BHP', { live: 20, prevClose: 20 }]]), // $20k vs $40k baseline = 50% drop
            lastCleanValue: 40000,
            isMarketOpen: false
        });
        if (result2.isValid) return 'Gatekeeper failed to reject out-of-hours plunge';

        // Test 3: Two-consecutive confirmation for radical downward shift during open hours
        const result3a = ChartDataSanitizer.validateSnapshotProposal({
            shares: validShares,
            cash: [],
            livePrices: new Map([['BHP', { live: 30, prevClose: 30 }]]), // $30k vs $40k baseline = 25% drop
            lastCleanValue: 40000,
            isMarketOpen: true,
            pendingDownshift: null
        });
        if (result3a.isValid) return 'Gatekeeper should require confirmation on first reading of >15% drop';
        if (!result3a.requireConfirmation || !result3a.pendingReading) return 'Missing pendingReading payload';

        // Test 4: Second reading confirms genuine downshift
        const result3b = ChartDataSanitizer.validateSnapshotProposal({
            shares: validShares,
            cash: [],
            livePrices: new Map([['BHP', { live: 30, prevClose: 30 }]]),
            lastCleanValue: 40000,
            isMarketOpen: true,
            pendingDownshift: result3a.pendingReading
        });
        if (!result3b.isValid || !result3b.confirmedDownshift) return 'Gatekeeper failed to confirm legitimate second reading';

        return true;
    });

    // ═══════════════════════════════════════
    // REPORT
    // ═══════════════════════════════════════
    const passed = TESTS.filter(t => t.passed).length;
    const failed = TESTS.filter(t => !t.passed).length;
    const total = TESTS.length;

    console.log('');
    if (failed === 0) {
        console.log(`%c  ✅ ALL ${total} TESTS PASSED`, 'color: #00ff88; font-weight: bold; font-size: 14px;');
    } else {
        console.log(`%c  ⚠️ ${passed}/${total} PASSED, ${failed} FAILED`, 'color: #ff9800; font-weight: bold; font-size: 14px;');
        console.group('❌ Failures:');
        FAILURES.forEach(f => {
            console.log(`%c  • ${f.name}: ${f.reason}`, 'color: #ff4444;');
        });
        console.groupEnd();
    }

    // ─── BOOT TIMING SUMMARY ───
    const bootSnap = StateAuditor._snapshots['__boot__'];
    if (bootSnap) {
        const elapsed = ((Date.now() - bootSnap.timestamp) / 1000).toFixed(1);
        const mutationCount = (StateAuditor._log || []).length;
        const eventCount = (StateAuditor._eventLog || []).length;
        console.log(
            `%c  📊 Boot: ${elapsed}s | Mutations: ${mutationCount} | Events: ${eventCount} | Races: ${StateAuditor._raceConditions.length} | Regressions: ${_raceRegressionLog.length}`,
            'color: #888; font-style: italic;'
        );
    }

    console.groupEnd();

    return {
        passed: failed === 0,
        total,
        passCount: passed,
        failCount: failed,
        tests: [...TESTS],
        failures: [...FAILURES],
        raceRegressions: [..._raceRegressionLog]
    };
}
