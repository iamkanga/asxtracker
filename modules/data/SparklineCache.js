/**
 * SparklineCache.js
 * Cache-first store for portfolio-card sparkline data.
 *
 * Architecture:
 *  - L1: in-memory Map (instant repeat renders, zero parsing).
 *  - L2: IndexedDB (async, off the main thread). Falls back to a single slim localStorage map,
 *        then to memory-only, if IndexedDB is unavailable (e.g. private browsing).
 *  - Records are slim: { code, closes: number[<=60], fetchedAt, lastAttemptAt }.
 *
 * Freshness policy (see isStale / needsRefresh):
 *  - A record younger than 24h is NEVER refreshed.
 *  - Older records only refresh if a newer trading-day close has settled since they were fetched.
 *  - Every network attempt (success OR failure) stamps `lastAttemptAt`, which blocks retries for 6h.
 *
 * This module never performs network I/O. See SparklineRefresher for the network side.
 */

import { SPARKLINE_CONFIG, STORAGE_KEYS, EVENTS } from '../utils/AppConstants.js';
import { MarketSchedule } from '../utils/MarketSchedule.js';

// ============================================================================
// STORAGE ADAPTERS (async key-value, keyed by uppercase ASX code)
// ============================================================================

/** Memory-only adapter (final fallback + unit tests). */
export class MemoryAdapter {
    constructor() { this._map = new Map(); }
    async get(code) { return this._map.get(code) || null; }
    async put(record) { this._map.set(record.code, record); }
    async delete(code) { this._map.delete(code); }
    async all() { return Array.from(this._map.values()); }
}

/** Slim localStorage fallback: one JSON map under a single key (records are ~0.5KB each). */
export class LocalStorageAdapter {
    constructor(storage) {
        this._storage = storage;
        this._key = STORAGE_KEYS.SPARKLINE_FALLBACK_CACHE;
    }
    _read() {
        try {
            const raw = this._storage.getItem(this._key);
            const parsed = raw ? JSON.parse(raw) : {};
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            return {};
        }
    }
    _write(map) {
        try {
            this._storage.setItem(this._key, JSON.stringify(map));
        } catch (e) {
            console.warn('[SparklineCache] localStorage fallback write failed:', e?.name || e);
        }
    }
    async get(code) { return this._read()[code] || null; }
    async put(record) {
        const map = this._read();
        map[record.code] = record;
        this._write(map);
    }
    async delete(code) {
        const map = this._read();
        delete map[code];
        this._write(map);
    }
    async all() { return Object.values(this._read()); }
}

/** IndexedDB adapter (primary persistent layer). */
export class IndexedDbAdapter {
    constructor() { this._dbPromise = null; }

    open() {
        if (!this._dbPromise) {
            this._dbPromise = new Promise((resolve, reject) => {
                try {
                    const req = indexedDB.open(SPARKLINE_CONFIG.DB_NAME, SPARKLINE_CONFIG.DB_VERSION);
                    req.onupgradeneeded = () => {
                        const db = req.result;
                        if (!db.objectStoreNames.contains(SPARKLINE_CONFIG.STORE_NAME)) {
                            db.createObjectStore(SPARKLINE_CONFIG.STORE_NAME, { keyPath: 'code' });
                        }
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
                    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
                } catch (e) {
                    reject(e);
                }
            });
        }
        return this._dbPromise;
    }

    async _run(mode, op) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SPARKLINE_CONFIG.STORE_NAME, mode);
            const req = op(tx.objectStore(SPARKLINE_CONFIG.STORE_NAME));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
    }

    async get(code) { return (await this._run('readonly', s => s.get(code))) || null; }
    async put(record) { await this._run('readwrite', s => s.put(record)); }
    async delete(code) { await this._run('readwrite', s => s.delete(code)); }
    async all() { return (await this._run('readonly', s => s.getAll())) || []; }
}

// ============================================================================
// CACHE
// ============================================================================

export class SparklineCache {
    /**
     * @param {Object} [options]
     * @param {Object} [options.adapter] - Inject a storage adapter (tests). Default: auto-select.
     * @param {Function} [options.now] - Clock injection (tests). Default: Date.now.
     * @param {Storage|null} [options.legacyStorage] - Storage holding legacy `asx_history_v3_*` entries.
     */
    constructor(options = {}) {
        this.isReady = false;
        this._now = options.now || (() => Date.now());
        this._adapter = options.adapter || null;
        this._legacyStorage = options.legacyStorage !== undefined
            ? options.legacyStorage
            : (typeof localStorage !== 'undefined' ? localStorage : null);

        this._memory = new Map();
        this._loading = new Map();
        this._writesSinceTrim = 0;
        this._ready = this._init();
    }

    // ---------- Pure helpers ----------

    static normalizeCode(code) {
        return String(code || '').trim().toUpperCase();
    }

    /**
     * Extracts a slim, downsampled array of closing prices from raw history rows.
     * Accepts rows shaped { close } | { value } | plain numbers.
     * @param {Array} rows
     * @returns {number[]}
     */
    static buildCloses(rows) {
        if (!Array.isArray(rows)) {
            if (rows && Array.isArray(rows.data)) rows = rows.data;
            else if (rows && rows.data && Array.isArray(rows.data.data)) rows = rows.data.data;
            else return [];
        }
        const vals = [];
        for (const row of rows) {
            const raw = (typeof row === 'number')
                ? row
                : (row && (row.close !== undefined ? row.close : row.value));
            const v = parseFloat(raw);
            if (Number.isFinite(v)) vals.push(Math.round(v * 10000) / 10000);
        }
        const max = SPARKLINE_CONFIG.MAX_POINTS;
        if (vals.length <= max) return vals;

        const out = [];
        for (let i = 0; i < max; i++) {
            out.push(vals[Math.round(i * (vals.length - 1) / (max - 1))]);
        }
        return out;
    }

    /** True if the record has enough points to draw a line. */
    static hasData(record) {
        return !!record && Array.isArray(record.closes) && record.closes.length > 1;
    }

    // ---------- Freshness policy ----------

    /**
     * Stale = no drawable data, OR data is from a previous trading session
     * (evaluated against post-market close, once per day).
     */
    isStale(record, nowMs = this._now()) {
        if (!SparklineCache.hasData(record)) return true;
        const fetchedAt = Number(record.fetchedAt) || 0;
        if (!fetchedAt) return true;

        const lastClose = MarketSchedule.getLastCloseSettledMs(new Date(nowMs), SPARKLINE_CONFIG.CLOSE_SETTLE_MINUTES);
        if (lastClose > 0) {
            return fetchedAt < lastClose;
        }
        return (nowMs - fetchedAt) >= SPARKLINE_CONFIG.MAX_AGE_MS;
    }

    /**
     * Whether a network refresh is warranted:
     * - If a recent attempt failed (attempt stamped without data saved), back off for 6h.
     * - Otherwise returns isStale (data from previous trading session).
     */
    needsRefresh(record, nowMs = this._now()) {
        if (record) {
            const lastAttempt = Number(record.lastAttemptAt) || 0;
            const fetchedAt = Number(record.fetchedAt) || 0;
            // Back-off for 6h after a failed attempt
            if (lastAttempt > fetchedAt && (nowMs - lastAttempt < SPARKLINE_CONFIG.MIN_ATTEMPT_GAP_MS)) {
                return false;
            }
        }
        return this.isStale(record, nowMs);
    }

    // ---------- Reads ----------

    whenReady() { return this._ready; }

    /**
     * Synchronous immediate recovery from localStorage (fallback map or legacy full-history keys).
     * Guarantees zero blank card delay when historical data already exists on device.
     */
    _tryRecoverFromStorage(key) {
        const store = this._legacyStorage;
        if (!store) return null;
        try {
            // 1. Check slim fallback map
            const rawFallback = store.getItem(STORAGE_KEYS.SPARKLINE_FALLBACK_CACHE);
            if (rawFallback) {
                const map = JSON.parse(rawFallback);
                if (map && map[key] && SparklineCache.hasData(map[key])) {
                    this._memory.set(key, map[key]);
                    return map[key];
                }
            }

            // 2. Check full history cache in localStorage if not yet migrated
            if (!store.getItem(STORAGE_KEYS.SPARKLINE_MIGRATED)) {
                const legacyKey = `${STORAGE_KEYS.HISTORY_CACHE_PREFIX}${key}_${SPARKLINE_CONFIG.RANGE}`;
                const raw = store.getItem(legacyKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const closes = SparklineCache.buildCloses(parsed?.data || parsed);
                    if (closes.length > 1) {
                        const ts = Number(parsed?.timestamp) || 0;
                        const rec = { code: key, closes, fetchedAt: ts, lastAttemptAt: 0 };
                        this._memory.set(key, rec);
                        if (this._adapter) {
                            this._adapter.put(rec).catch(() => {});
                        }
                        return rec;
                    }
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
        return null;
    }

    /** Synchronous L1-only read (checks memory, then synchronous localStorage). */
    peek(code) {
        const key = SparklineCache.normalizeCode(code);
        if (!key) return null;
        const mem = this._memory.get(key);
        if (mem && SparklineCache.hasData(mem)) return mem;
        return this._tryRecoverFromStorage(key);
    }

    /** L1 → L2 read. Never touches the network. Resolves null on miss or error. */
    async get(code) {
        const key = SparklineCache.normalizeCode(code);
        if (!key) return null;

        // Synchronous fast path (memory or local storage)
        const fast = this.peek(key);
        if (fast && SparklineCache.hasData(fast)) return fast;

        await this._ready;
        if (this._memory.has(key)) return this._memory.get(key);
        if (this._loading.has(key)) return this._loading.get(key);

        const p = (async () => {
            try {
                const rec = this._adapter ? await this._adapter.get(key) : null;
                if (rec && typeof rec === 'object' && SparklineCache.hasData(rec)) {
                    this._memory.set(key, rec);
                    return rec;
                }
                return this._tryRecoverFromStorage(key);
            } catch (e) {
                console.warn(`[SparklineCache] Read failed for ${key}:`, e);
                return this._tryRecoverFromStorage(key);
            } finally {
                this._loading.delete(key);
            }
        })();
        this._loading.set(key, p);
        return p;
    }

    // ---------- Writes ----------

    /**
     * Stamps an attempt BEFORE the network call so failures/timeouts also back off (6h).
     */
    async markAttempt(code) {
        const key = SparklineCache.normalizeCode(code);
        if (!key) return;
        const existing = await this.get(key);
        await this._write({
            code: key,
            closes: existing?.closes || [],
            fetchedAt: existing?.fetchedAt || 0,
            lastAttemptAt: this._now()
        });
    }

    /**
     * Persists fresh history rows as a slim record and notifies listeners.
     * @returns {Promise<boolean>} true if a drawable record was saved
     */
    async saveFromRows(code, rows) {
        const key = SparklineCache.normalizeCode(code);
        const closes = SparklineCache.buildCloses(rows);
        if (!key || closes.length < 2) return false;

        const now = this._now();
        await this._write({ code: key, closes, fetchedAt: now, lastAttemptAt: now });
        this._emitUpdated(key);
        return true;
    }

    async _write(record) {
        this._memory.set(record.code, record);
        try {
            if (this._adapter) await this._adapter.put(record);
        } catch (e) {
            console.warn(`[SparklineCache] Write failed for ${record.code}:`, e);
        }
        this._writesSinceTrim++;
        if (this._writesSinceTrim >= SPARKLINE_CONFIG.TRIM_EVERY_N_WRITES) {
            this._writesSinceTrim = 0;
            this._trim().catch(() => { });
        }
    }

    /** LRU-style cap: drops only the oldest records beyond MAX_RECORDS (never wipes everything). */
    async _trim() {
        if (!this._adapter) return;
        const all = await this._adapter.all();
        const excess = all.length - SPARKLINE_CONFIG.MAX_RECORDS;
        if (excess <= 0) return;

        const touched = r => Math.max(Number(r.fetchedAt) || 0, Number(r.lastAttemptAt) || 0);
        all.sort((a, b) => touched(a) - touched(b));
        for (const rec of all.slice(0, excess)) {
            this._memory.delete(rec.code);
            await this._adapter.delete(rec.code);
        }
    }

    _emitUpdated(code) {
        try {
            if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
                document.dispatchEvent(new CustomEvent(EVENTS.SPARKLINE_UPDATED, { detail: { code } }));
            }
        } catch (e) {
            console.warn('[SparklineCache] Event dispatch failed:', e);
        }
    }

    // ---------- Init / migration ----------

    async _init() {
        try {
            if (!this._adapter) this._adapter = await this._createDefaultAdapter();
            await this._migrateLegacy();
        } catch (e) {
            console.warn('[SparklineCache] Init failed, continuing memory-only:', e);
            if (!this._adapter) this._adapter = new MemoryAdapter();
        } finally {
            this.isReady = true;
        }
    }

    async _createDefaultAdapter() {
        try {
            if (typeof indexedDB !== 'undefined' && indexedDB) {
                const idb = new IndexedDbAdapter();
                await idb.open();
                return idb;
            }
        } catch (e) {
            console.warn('[SparklineCache] IndexedDB unavailable, falling back:', e?.message || e);
        }
        if (this._legacyStorage) return new LocalStorageAdapter(this._legacyStorage);
        return new MemoryAdapter();
    }

    /**
     * One-time seed from legacy full-history localStorage entries so existing users render instantly
     * on first launch after this update (no network). Legacy keys are left intact for ChartModal.
     */
    async _migrateLegacy() {
        const store = this._legacyStorage;
        if (!store || !this._adapter) return;

        try {
            if (store.getItem(STORAGE_KEYS.SPARKLINE_MIGRATED)) return;

            const prefix = STORAGE_KEYS.HISTORY_CACHE_PREFIX;
            const suffix = `_${SPARKLINE_CONFIG.RANGE}`;
            const keys = [];
            for (let i = 0; i < store.length; i++) {
                const k = store.key(i);
                if (k && k.startsWith(prefix) && k.endsWith(suffix)) keys.push(k);
            }

            for (const k of keys) {
                try {
                    const parsed = JSON.parse(store.getItem(k));
                    const code = SparklineCache.normalizeCode(k.slice(prefix.length, k.length - suffix.length));
                    const closes = SparklineCache.buildCloses(parsed?.data || parsed);
                    if (!code || closes.length < 2) continue;

                    // NOTE: use the adapter directly (get() awaits _ready, which we are still inside).
                    const existing = await this._adapter.get(code);
                    if (existing && SparklineCache.hasData(existing)) continue;

                    const ts = Number(parsed?.timestamp) || 0;
                    await this._write({ code, closes, fetchedAt: ts, lastAttemptAt: ts });
                } catch (e) {
                    // Skip corrupt legacy entries
                }
            }

            store.setItem(STORAGE_KEYS.SPARKLINE_MIGRATED, '1');
        } catch (e) {
            console.warn('[SparklineCache] Legacy migration skipped:', e);
        }
    }
}
