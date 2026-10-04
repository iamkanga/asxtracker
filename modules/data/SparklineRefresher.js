/**
 * SparklineRefresher.js
 * Quiet, low-priority background refresher for the SparklineCache.
 *
 * Guarantees:
 *  - Never runs until "armed" (after the first live price sync, or a fallback delay), so it
 *    cannot compete with boot-time traffic.
 *  - Strictly serial, paced (REFRESH_GAP_MS), and capped per session (SESSION_REFRESH_CAP).
 *  - Yields to foreground traffic (live price sync, user-initiated chart history).
 *  - Pauses while the tab is hidden or the device is offline.
 *  - Only fetches records the cache says need a refresh (24h / post-close policy + 6h back-off).
 *  - Stamps the attempt BEFORE fetching, so timeouts never cause retry storms.
 *
 * All dependencies are injected, so the class has no knowledge of DataService internals.
 */

import { SPARKLINE_CONFIG } from '../utils/AppConstants.js';
import { SparklineCache } from './SparklineCache.js';

const RESUME_EVENTS = Object.freeze({
    VISIBILITY: 'visibilitychange',
    ONLINE: 'online'
});

export class SparklineRefresher {
    /**
     * @param {Object} deps
     * @param {SparklineCache} deps.cache
     * @param {(code: string) => Promise<Array|null>} deps.fetchRows - Network fetch of 1y history rows (no side effects).
     * @param {() => boolean} [deps.canFetch] - e.g. user is logged in.
     * @param {() => boolean} [deps.isForegroundBusy] - true while user-visible traffic is in flight.
     * @param {() => boolean} [deps.isPaused] - true if hidden/offline. Default: browser checks.
     * @param {(fn: Function) => void} [deps.schedule] - Defers work (default: requestIdleCallback/setTimeout).
     * @param {(ms: number) => Promise<void>} [deps.sleep]
     * @param {Object} [deps.config]
     * @param {number} [deps.bootTime] - Custom boot epoch ms for testability
     * @param {() => number} [deps.now] - Clock function
     */
    constructor({ cache, fetchRows, canFetch, isForegroundBusy, isPaused, schedule, sleep, config, bootTime, now } = {}) {
        this._cache = cache || null;
        this._fetchRows = fetchRows || null;
        this._canFetch = canFetch || (() => true);
        this._isForegroundBusy = isForegroundBusy || (() => false);
        this._isPaused = isPaused || SparklineRefresher.defaultIsPaused;
        this._schedule = schedule || SparklineRefresher.defaultSchedule;
        this._sleep = sleep || (ms => new Promise(r => setTimeout(r, ms)));
        this._cfg = config || SPARKLINE_CONFIG;
        this._now = now || (() => Date.now());
        this._bootTime = Number(bootTime) || this._now();

        this._pending = new Set();
        this._armed = false;
        this._running = false;
        this._sessionCount = 0;
        this._fallbackTimer = null;
        this._bootTimer = null;
        this._resumeBound = false;
    }

    static defaultIsPaused() {
        try {
            const hidden = typeof document !== 'undefined' && document.hidden === true;
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            return hidden || offline;
        } catch (e) {
            return false;
        }
    }

    static defaultSchedule(fn) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => fn(), { timeout: SPARKLINE_CONFIG.IDLE_TIMEOUT_MS });
        } else {
            setTimeout(fn, 1000);
        }
    }

    get pendingCount() { return this._pending.size; }
    get sessionCount() { return this._sessionCount; }
    get isArmed() { return this._armed; }

    /**
     * Requests a (possible) refresh for a code. Cheap: only queues if the cache says it's needed.
     * @returns {Promise<boolean>} true if the code was queued
     */
    async request(code) {
        try {
            if (!this._cache || !this._fetchRows) return false;
            const key = SparklineCache.normalizeCode(code);
            if (!key || this._pending.has(key)) return false;

            const record = await this._cache.get(key);
            if (!this._cache.needsRefresh(record)) return false;

            this._pending.add(key);

            const elapsed = this._now() - this._bootTime;
            const remainingBoot = Math.max(0, (this._cfg.BOOT_DEFER_MS || 30000) - elapsed);

            if (this._armed) {
                if (remainingBoot > 0) {
                    this._scheduleBootKick(remainingBoot);
                } else {
                    this._kick();
                }
            } else if (!this._fallbackTimer) {
                const delay = Math.max(remainingBoot, this._cfg.ARM_FALLBACK_MS || 35000);
                this._fallbackTimer = setTimeout(() => {
                    this._fallbackTimer = null;
                    this.arm();
                }, delay);
            }
            return true;
        } catch (e) {
            console.warn('[SparklineRefresher] request failed:', e);
            return false;
        }
    }

    /**
     * Opens the gate (call after a live price sync completes). Safe to call repeatedly;
     * each call also re-kicks any work left over from a paused/failed run once the 30s boot window expires.
     */
    arm() {
        this._armed = true;
        if (this._fallbackTimer) {
            clearTimeout(this._fallbackTimer);
            this._fallbackTimer = null;
        }
        const elapsed = this._now() - this._bootTime;
        const remainingBoot = Math.max(0, (this._cfg.BOOT_DEFER_MS || 30000) - elapsed);
        if (remainingBoot > 0) {
            this._scheduleBootKick(remainingBoot);
        } else {
            this._kick();
        }
    }

    _scheduleBootKick(delayMs) {
        if (this._bootTimer) return;
        this._bootTimer = setTimeout(() => {
            this._bootTimer = null;
            if (this._armed) this._kick();
        }, delayMs);
    }

    /** Clears timers/queue (tests, logout). */
    dispose() {
        if (this._fallbackTimer) clearTimeout(this._fallbackTimer);
        this._fallbackTimer = null;
        if (this._bootTimer) clearTimeout(this._bootTimer);
        this._bootTimer = null;
        this._pending.clear();
        this._armed = false;
    }

    _kick() {
        if (!this._armed || this._running || this._pending.size === 0) return;
        const elapsed = this._now() - this._bootTime;
        const remainingBoot = Math.max(0, (this._cfg.BOOT_DEFER_MS || 30000) - elapsed);
        if (remainingBoot > 0) {
            this._scheduleBootKick(remainingBoot);
            return;
        }
        this._schedule(() => { this._run(); });
    }

    _bindResume() {
        if (this._resumeBound || typeof document === 'undefined') return;
        this._resumeBound = true;
        const resume = () => {
            if (this._isPaused()) return;
            this._resumeBound = false;
            document.removeEventListener(RESUME_EVENTS.VISIBILITY, resume);
            if (typeof window !== 'undefined') window.removeEventListener(RESUME_EVENTS.ONLINE, resume);
            this._kick();
        };
        document.addEventListener(RESUME_EVENTS.VISIBILITY, resume);
        if (typeof window !== 'undefined') window.addEventListener(RESUME_EVENTS.ONLINE, resume);
    }

    async _run() {
        if (this._running) return;
        this._running = true;
        let busyWaits = 0;

        try {
            // Absolute boot guard: enforce 30-second quiet period
            const elapsed = this._now() - this._bootTime;
            const remainingBoot = Math.max(0, (this._cfg.BOOT_DEFER_MS || 30000) - elapsed);
            if (remainingBoot > 0) {
                await this._sleep(remainingBoot);
            }

            while (this._pending.size > 0) {
                if (this._sessionCount >= this._cfg.SESSION_REFRESH_CAP) {
                    this._pending.clear();
                    break;
                }
                if (this._isPaused()) {
                    this._bindResume();
                    break;
                }
                // e.g. auth not ready: leave queue intact, next arm() (each price sync) retries.
                if (!this._canFetch()) break;

                if (this._isForegroundBusy()) {
                    if (++busyWaits > this._cfg.MAX_BUSY_WAITS) break;
                    await this._sleep(this._cfg.BUSY_RETRY_MS);
                    continue;
                }
                busyWaits = 0;

                const code = this._pending.values().next().value;
                this._pending.delete(code);

                const record = await this._cache.get(code);
                if (!this._cache.needsRefresh(record)) continue;

                await this._cache.markAttempt(code);
                this._sessionCount++;

                try {
                    const rows = await this._fetchRows(code);
                    if (rows) await this._cache.saveFromRows(code, rows);
                } catch (e) {
                    console.warn(`[SparklineRefresher] Refresh failed for ${code}:`, e?.message || e);
                }

                if (this._pending.size > 0) await this._sleep(this._cfg.REFRESH_GAP_MS);
            }
        } catch (e) {
            console.warn('[SparklineRefresher] Run aborted:', e);
        } finally {
            this._running = false;
        }
    }
}
