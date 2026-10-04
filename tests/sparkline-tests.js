/**
 * tests/sparkline-tests.js
 * Headless Node tests for the cache-first sparkline pipeline:
 *   - MarketSchedule.getLastCloseSettledMs / isTradingDay
 *   - SparklineCache (policy, persistence, migration, trim, events)
 *   - SparklineRefresher (gating, pacing, back-off, caps, foreground yielding)
 *   - Static architecture guards (no network from UI/cache, wiring present)
 *
 * Run:  node tests/sparkline-tests.js
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ----------------------------------------------------------------------------
// Minimal async harness
// ----------------------------------------------------------------------------
let total = 0, passed = 0, failed = 0;
const queue = [];
function describe(name, fn) { queue.push({ kind: 'suite', name }); fn(); }
function it(name, fn) { queue.push({ kind: 'test', name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function eq(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
}
async function runAll() {
    for (const item of queue) {
        if (item.kind === 'suite') { console.log(`\n\x1b[1m\x1b[36m▶ Suite: ${item.name}\x1b[0m`); continue; }
        total++;
        try {
            await item.fn();
            passed++;
            console.log(`  \x1b[32m✔ PASS:\x1b[0m ${item.name}`);
        } catch (err) {
            failed++;
            console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${item.name}\n    \x1b[33m${err.stack || err.message}\x1b[0m`);
        }
    }
    console.log('\n==================================================');
    console.log(`Total: ${total}  Passed: \x1b[32m${passed}\x1b[0m  Failed: \x1b[${failed ? '31' : '32'}m${failed}\x1b[0m`);
    console.log('==================================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

// ----------------------------------------------------------------------------
// Browser stubs (event bus only)
// ----------------------------------------------------------------------------
const dispatched = [];
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
global.document = {
    hidden: false,
    dispatchEvent(e) { dispatched.push(e); return true; },
    addEventListener() { }, removeEventListener() { }
};

function makeStorage(entries = {}) {
    const m = new Map(Object.entries(entries));
    return {
        get length() { return m.size; },
        key: (i) => Array.from(m.keys())[i] ?? null,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        _m: m
    };
}
const rows = (n, start = 10) => Array.from({ length: n }, (_, i) => ({ date: i, close: start + i }));
const tick = async (n = 60) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const iso = (s) => Date.parse(s);

(async () => {
    const C = await imp('modules/utils/AppConstants.js');
    const { MarketSchedule } = await imp('modules/utils/MarketSchedule.js');
    const { SparklineCache, MemoryAdapter, LocalStorageAdapter } = await imp('modules/data/SparklineCache.js');
    const { SparklineRefresher } = await imp('modules/data/SparklineRefresher.js');
    const { SPARKLINE_CONFIG, STORAGE_KEYS, EVENTS } = C;

    // ========================================================================
    describe('MarketSchedule: last settled close', () => {
        it('Saturday resolves to Friday 16:30 AEDT', () => {
            const r = MarketSchedule.getLastCloseSettledMs(new Date('2026-10-10T02:00:00Z'));
            eq(r, iso('2026-10-09T05:30:00Z'));
        });
        it('Weekday before settle resolves to previous day 16:30 AEST', () => {
            const r = MarketSchedule.getLastCloseSettledMs(new Date('2026-07-01T05:00:00Z')); // Wed 15:00
            eq(r, iso('2026-06-30T06:30:00Z'));
        });
        it('Weekday after settle resolves to same day 16:30 AEST', () => {
            const r = MarketSchedule.getLastCloseSettledMs(new Date('2026-07-01T07:00:00Z')); // Wed 17:00
            eq(r, iso('2026-07-01T06:30:00Z'));
        });
        it('Skips Easter public holidays (Good Friday / Easter Monday 2026)', () => {
            const r = MarketSchedule.getLastCloseSettledMs(new Date('2026-04-07T02:00:00Z')); // Tue noon
            eq(r, iso('2026-04-02T05:30:00Z')); // Thu 16:30 AEDT
        });
        it('isTradingDay: weekend/holiday false, normal weekday true', () => {
            eq(MarketSchedule.isTradingDay(2026, 10, 10), false);
            eq(MarketSchedule.isTradingDay(2026, 4, 3), false);
            eq(MarketSchedule.isTradingDay(2026, 12, 25), false);
            eq(MarketSchedule.isTradingDay(2026, 7, 1), true);
        });
    });

    // ========================================================================
    describe('SparklineCache: data shaping', () => {
        it('buildCloses filters invalid values and accepts close/value/number', () => {
            const out = SparklineCache.buildCloses([{ close: 1 }, { value: '2' }, 3, { close: 'x' }, null, { close: NaN }]);
            eq(JSON.stringify(out), JSON.stringify([1, 2, 3]));
        });
        it('buildCloses downsamples to MAX_POINTS keeping first and last', () => {
            const out = SparklineCache.buildCloses(rows(250, 100));
            eq(out.length, SPARKLINE_CONFIG.MAX_POINTS);
            eq(out[0], 100);
            eq(out[out.length - 1], 349);
        });
        it('buildCloses returns [] for non-arrays', () => {
            eq(SparklineCache.buildCloses(null).length, 0);
            eq(SparklineCache.buildCloses({}).length, 0);
        });
    });

    // ========================================================================
    describe('SparklineCache: freshness policy', () => {
        const mk = (t0) => {
            const clock = { t: t0 };
            const cache = new SparklineCache({ adapter: new MemoryAdapter(), legacyStorage: null, now: () => clock.t });
            return { cache, clock };
        };

        it('missing record needs refresh', async () => {
            const { cache } = mk(iso('2026-07-01T00:00:00Z'));
            await cache.whenReady();
            eq(cache.needsRefresh(null), true);
        });
        it('record fetched after market close is not refreshed next day during trading', async () => {
            const { cache, clock } = mk(iso('2026-07-01T07:00:00Z')); // Wed 17:00 AEST (post-close)
            await cache.saveFromRows('CBA', rows(30));
            clock.t = iso('2026-07-02T04:00:00Z'); // Thu 14:00 AEST (during Thursday trading; Thu close not settled yet)
            eq(cache.needsRefresh(await cache.get('CBA')), false, 'should not refresh during next session trading');
        });
        it('record is refreshed once the next trading session closes and settles', async () => {
            const { cache, clock } = mk(iso('2026-07-01T07:00:00Z')); // Wed 17:00 AEST
            await cache.saveFromRows('CBA', rows(30));
            clock.t = iso('2026-07-02T07:00:00Z'); // Thu 17:00 AEST (post Thursday close)
            eq(cache.needsRefresh(await cache.get('CBA')), true, 'should refresh after Thursday close settles');
        });
        it('weekend: record fetched after Friday close is NOT refreshed (no new close exists)', async () => {
            const { cache, clock } = mk(iso('2026-07-03T07:00:00Z')); // Fri 17:00 AEST
            await cache.saveFromRows('CBA', rows(30));
            clock.t = iso('2026-07-05T12:00:00Z'); // Sun (53h later)
            eq(cache.needsRefresh(await cache.get('CBA')), false, 'should not refresh over weekend');
        });
        it('midday-fetched record gets refreshed once market close settles for that day', async () => {
            const { cache, clock } = mk(iso('2026-07-03T02:00:00Z')); // Fri 12:00 AEST (intraday)
            await cache.saveFromRows('CBA', rows(30));
            clock.t = iso('2026-07-03T07:00:00Z'); // Fri 17:00 AEST (Fri close settled at 16:30)
            eq(cache.needsRefresh(await cache.get('CBA')), true, 'should refresh post-market close');
        });
        it('an attempt (even failed) blocks retries for 6h, then allows again', async () => {
            const { cache, clock } = mk(iso('2026-07-01T00:00:00Z'));
            await cache.markAttempt('NEW'); // placeholder, no data
            const rec = await cache.get('NEW');
            eq(SparklineCache.hasData(rec), false);
            clock.t += 60 * 60 * 1000;
            eq(cache.needsRefresh(rec), false, 'blocked at +1h');
            clock.t += 6 * 60 * 60 * 1000;
            eq(cache.needsRefresh(rec), true, 'allowed at +7h');
        });
        it('markAttempt preserves existing closes so the UI keeps drawing stale data', async () => {
            const { cache } = mk(iso('2026-07-01T00:00:00Z'));
            await cache.saveFromRows('BHP', rows(20));
            await cache.markAttempt('BHP');
            eq(SparklineCache.hasData(await cache.get('BHP')), true);
        });
        it('saveFromRows rejects <2 points and does not write', async () => {
            const { cache } = mk(iso('2026-07-01T00:00:00Z'));
            eq(await cache.saveFromRows('X', rows(1)), false);
            eq(await cache.get('X'), null);
        });
    });

    // ========================================================================
    describe('SparklineCache: persistence, events, migration, trim', () => {
        it('peek() recovers immediately and synchronously from localStorage on cold start', () => {
            const storage = makeStorage({
                [`${STORAGE_KEYS.HISTORY_CACHE_PREFIX}WES_1y`]: JSON.stringify({
                    timestamp: iso('2026-07-01T00:00:00Z'),
                    data: rows(25)
                })
            });
            const c = new SparklineCache({ adapter: new MemoryAdapter(), legacyStorage: storage });
            // Notice: no await c.whenReady()! peek() is completely synchronous
            const instant = c.peek('WES');
            assert(SparklineCache.hasData(instant), 'should instantly recover data synchronously');
            eq(instant.code, 'WES');
        });
        it('persists across instances via adapter (simulated restart) with zero network', async () => {
            const adapter = new MemoryAdapter();
            const a = new SparklineCache({ adapter, legacyStorage: null });
            await a.saveFromRows('cba', rows(40));
            const b = new SparklineCache({ adapter, legacyStorage: null });
            const rec = await b.get('CBA');
            assert(SparklineCache.hasData(rec), 'record should be restored');
            eq(b.peek('CBA') !== null, true, 'L1 populated after read');
        });
        it('emits SPARKLINE_UPDATED with the normalised code on save', async () => {
            dispatched.length = 0;
            const c = new SparklineCache({ adapter: new MemoryAdapter(), legacyStorage: null });
            await c.saveFromRows('wow', rows(10));
            const ev = dispatched.find(e => e.type === EVENTS.SPARKLINE_UPDATED);
            assert(ev, 'event dispatched');
            eq(ev.detail.code, 'WOW');
        });
        it('does not emit events for attempt stamps', async () => {
            dispatched.length = 0;
            const c = new SparklineCache({ adapter: new MemoryAdapter(), legacyStorage: null });
            await c.markAttempt('WOW');
            eq(dispatched.length, 0);
        });
        it('falls back to LocalStorageAdapter when IndexedDB is unavailable', async () => {
            const storage = makeStorage();
            const a = new SparklineCache({ legacyStorage: storage });
            await a.whenReady();
            assert(a._adapter instanceof LocalStorageAdapter, 'uses localStorage fallback');
            await a.saveFromRows('CSL', rows(15));
            const b = new SparklineCache({ legacyStorage: storage });
            assert(SparklineCache.hasData(await b.get('CSL')), 'restored through fallback');
        });
        it('migrates legacy asx_history_v3_*_1y entries once, keeps legacy keys, skips corrupt', async () => {
            const legacyTs = iso('2026-07-01T00:00:00Z');
            const storage = makeStorage({
                [`${STORAGE_KEYS.HISTORY_CACHE_PREFIX}CBA_1y`]: JSON.stringify({ timestamp: legacyTs, data: { ok: true, data: rows(100) } }),
                [`${STORAGE_KEYS.HISTORY_CACHE_PREFIX}BHP_5y`]: JSON.stringify({ timestamp: legacyTs, data: { ok: true, data: rows(100) } }),
                [`${STORAGE_KEYS.HISTORY_CACHE_PREFIX}BAD_1y`]: '{not json',
                unrelated: 'x'
            });
            const adapter = new MemoryAdapter();
            const c = new SparklineCache({ adapter, legacyStorage: storage });
            await c.whenReady();

            const cba = await c.get('CBA');
            assert(SparklineCache.hasData(cba), 'CBA migrated');
            eq(cba.fetchedAt, legacyTs, 'keeps legacy timestamp (so staleness is honest)');
            eq(await c.get('BHP'), null, '5y entries are not sparklines');
            eq(await c.get('BAD'), null, 'corrupt skipped');
            eq(storage.getItem(STORAGE_KEYS.SPARKLINE_MIGRATED), '1');
            assert(storage.getItem(`${STORAGE_KEYS.HISTORY_CACHE_PREFIX}CBA_1y`) !== null, 'legacy key retained for ChartModal');

            // Second boot: flag set => no rescan (mutate legacy and prove it is ignored)
            storage.setItem(`${STORAGE_KEYS.HISTORY_CACHE_PREFIX}NEW_1y`, JSON.stringify({ timestamp: legacyTs, data: { data: rows(50) } }));
            const c2 = new SparklineCache({ adapter, legacyStorage: storage });
            await c2.whenReady();
            eq(await c2.get('NEW'), null, 'migration is one-time');
        });
        it('trim removes only the oldest records beyond MAX_RECORDS (never wipes the cache)', async () => {
            const adapter = new MemoryAdapter();
            const clock = { t: 1_000_000 };
            const c = new SparklineCache({ adapter, legacyStorage: null, now: () => clock.t });
            const N = SPARKLINE_CONFIG.MAX_RECORDS + 10;
            for (let i = 0; i < N; i++) {
                clock.t += 1000;
                await c.saveFromRows(`T${i}`, rows(5));
            }
            await c._trim();
            const all = await adapter.all();
            eq(all.length, SPARKLINE_CONFIG.MAX_RECORDS);
            eq(await adapter.get('T0'), null, 'oldest evicted');
            assert((await adapter.get(`T${N - 1}`)) !== null, 'newest retained');
        });
    });

    // ========================================================================
    describe('SparklineRefresher: gating, pacing, back-off', () => {
        const FRESH_NOW = iso('2026-07-01T07:00:00Z');

        function setup(overrides = {}) {
            const clock = { t: overrides.t0 || FRESH_NOW };
            const cache = new SparklineCache({ adapter: new MemoryAdapter(), legacyStorage: null, now: () => clock.t });
            const calls = [];
            let inFlight = 0, maxInFlight = 0, sleeps = 0;
            const refresher = new SparklineRefresher({
                cache,
                fetchRows: overrides.fetchRows || (async (code) => {
                    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
                    calls.push(code);
                    await Promise.resolve();
                    inFlight--;
                    return rows(30);
                }),
                canFetch: overrides.canFetch,
                isForegroundBusy: overrides.isForegroundBusy,
                isPaused: overrides.isPaused || (() => false),
                schedule: (fn) => { Promise.resolve().then(fn); },
                sleep: async () => { sleeps++; },
                config: overrides.config,
                bootTime: overrides.bootTime !== undefined ? overrides.bootTime : clock.t - 35000,
                now: () => clock.t
            });
            return { clock, cache, refresher, calls, stats: () => ({ maxInFlight, sleeps }) };
        }

        it('does NOT fetch during 30s post-boot quiet period even if armed', async () => {
            const { clock, refresher, calls } = setup({ bootTime: FRESH_NOW }); // Boot is NOW
            await refresher.request('CBA');
            refresher.arm();
            await tick();
            eq(calls.length, 0, 'must not dispatch requests during first 30s of boot');
            // Advance clock past 30s
            clock.t += 31000;
            refresher.arm();
            await tick();
            eq(calls.length, 1, 'dispatches request once 30s boot quiet period expires');
            refresher.dispose();
        });
        it('does NOT fetch before being armed (boot protection)', async () => {
            const { refresher, calls } = setup();
            eq(await refresher.request('CBA'), true);
            await tick();
            eq(calls.length, 0);
            refresher.dispose();
        });
        it('arming drains the queue serially and writes slim records', async () => {
            const { refresher, cache, calls, stats } = setup();
            await refresher.request('CBA'); await refresher.request('BHP'); await refresher.request('WOW');
            refresher.arm();
            await tick();
            eq(calls.join(','), 'CBA,BHP,WOW');
            eq(stats().maxInFlight, 1, 'strictly serial');
            assert(stats().sleeps >= 2, 'paced between fetches');
            assert(SparklineCache.hasData(await cache.get('BHP')));
        });
        it('fresh records are never queued or fetched (zero network)', async () => {
            const { refresher, cache, calls } = setup();
            await cache.saveFromRows('CBA', rows(30));
            eq(await refresher.request('CBA'), false);
            refresher.arm();
            await tick();
            eq(calls.length, 0);
        });
        it('duplicate requests for the same code are de-duplicated', async () => {
            const { refresher } = setup();
            eq(await refresher.request('CBA'), true);
            eq(await refresher.request('cba'), false);
            eq(refresher.pendingCount, 1);
            refresher.dispose();
        });
        it('failures stamp the attempt first: no retry storm for 6h', async () => {
            const { refresher, cache, clock } = setup({ fetchRows: async () => { throw new Error('timeout'); } });
            await refresher.request('CBA');
            refresher.arm();
            await tick();
            const rec = await cache.get('CBA');
            assert(rec && rec.lastAttemptAt > 0, 'attempt stamped');
            eq(await refresher.request('CBA'), false, 'blocked right after failure');
            clock.t += 7 * 3600 * 1000;
            eq(await refresher.request('CBA'), true, 'allowed after 6h back-off');
            refresher.dispose();
        });
        it('null/empty network result still counts as an attempt but keeps old data', async () => {
            const { refresher, cache, clock } = setup({ t0: iso('2026-06-29T07:00:00Z'), fetchRows: async () => null });
            await cache.saveFromRows('CBA', rows(30)); // Mon 17:00
            clock.t = iso('2026-06-30T08:00:00Z');     // Tue 18:00 => stale
            eq(await refresher.request('CBA'), true);
            refresher.arm();
            await tick();
            assert(SparklineCache.hasData(await cache.get('CBA')), 'stale data preserved');
            eq(cache.needsRefresh(await cache.get('CBA')), false, 'backed off');
        });
        it('respects SESSION_REFRESH_CAP', async () => {
            const { refresher, calls } = setup({ config: { ...SPARKLINE_CONFIG, SESSION_REFRESH_CAP: 2 } });
            for (const c of ['A1', 'A2', 'A3', 'A4']) await refresher.request(c);
            refresher.arm();
            await tick();
            eq(calls.length, 2);
            eq(refresher.pendingCount, 0, 'remaining dropped for this session');
        });
        it('yields to foreground traffic, then proceeds', async () => {
            let busy = true;
            const { refresher, calls, stats } = setup({ isForegroundBusy: () => busy });
            await refresher.request('CBA');
            refresher.arm();
            await tick(10);
            eq(calls.length, 0, 'no fetch while busy');
            assert(stats().sleeps > 0, 'waited via sleep');
            busy = false;
            refresher.arm(); // next price sync re-kicks leftovers
            await tick();
            eq(calls.length, 1);
        });
        it('does not run (and does not stamp attempts) when not allowed to fetch (auth not ready)', async () => {
            let ok = false;
            const { refresher, cache, calls } = setup({ canFetch: () => ok });
            await refresher.request('CBA');
            refresher.arm();
            await tick();
            eq(calls.length, 0);
            eq(await cache.get('CBA'), null, 'no attempt stamp => no 6h penalty');
            ok = true;
            refresher.arm();
            await tick();
            eq(calls.length, 1);
        });
        it('pauses while hidden/offline', async () => {
            let paused = true;
            const { refresher, calls } = setup({ isPaused: () => paused });
            await refresher.request('CBA');
            refresher.arm();
            await tick();
            eq(calls.length, 0);
            paused = false;
            refresher.arm();
            await tick();
            eq(calls.length, 1);
        });
        it('fallback arm timer is created when never armed (and cleared on arm)', async () => {
            const { refresher } = setup();
            await refresher.request('CBA');
            assert(refresher._fallbackTimer, 'fallback scheduled');
            refresher.arm();
            eq(refresher._fallbackTimer, null);
        });
    });

    // ========================================================================
    describe('Architecture guards (static)', () => {
        const sparkUI = read('modules/ui/SparklinePreview.js');
        const cacheSrc = read('modules/data/SparklineCache.js');
        const refSrc = read('modules/data/SparklineRefresher.js');
        const ds = read('modules/data/DataService.js');
        const ctrl = read('modules/controllers/AppController.js');

        it('SparklinePreview never calls the network (no fetchHistory / fetch)', () => {
            eq(/fetchHistory\s*\(/.test(sparkUI), false);
            eq(/\bfetch\s*\(/.test(sparkUI), false);
        });
        it('SparklineCache performs no network I/O', () => {
            eq(/\bfetch\s*\(/.test(cacheSrc), false);
        });
        it('SparklineRefresher has no direct fetch (network is injected)', () => {
            eq(/\bfetch\s*\(/.test(refSrc), false);
        });
        it('No window pollution in new modules', () => {
            for (const src of [cacheSrc, refSrc, sparkUI]) eq(/window\.\w+\s*=[^=]/.test(src), false);
        });
        it('DataService wires cache + refresher and uses the registry key prefix', () => {
            assert(ds.includes('new SparklineCache()'));
            assert(ds.includes('new SparklineRefresher('));
            assert(ds.includes('STORAGE_KEYS.HISTORY_CACHE_PREFIX'));
            eq(ds.includes("`asx_history_v3_"), false, 'no magic-string cache key');
        });
        it('AppController arms the refresher on PRICES_UPDATED', () => {
            assert(ctrl.includes('armSparklineRefresher()'));
        });
        it('Registry contains the new constants', () => {
            assert(typeof EVENTS.SPARKLINE_UPDATED === 'string');
            assert(typeof STORAGE_KEYS.SPARKLINE_MIGRATED === 'string');
            assert(Object.isFrozen(SPARKLINE_CONFIG));
        });
    });

    await runAll();
})().catch(err => { console.error('Fatal test harness error:', err); process.exit(1); });
