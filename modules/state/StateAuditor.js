/**
 * StateAuditor.js
 * Reactive State Proxy & Diagnostic Layer
 * 
 * PURPOSE: Wraps AppState with a JavaScript Proxy to:
 * 1. LOG every state mutation (who changed what, when)
 * 2. DETECT race conditions (rapid conflicting writes)
 * 3. SNAPSHOT state before/after major operations for diff comparison
 * 4. VALIDATE state integrity on demand
 * 
 * ARCHITECTURE: Non-invasive. Does NOT modify AppState's shape or behavior.
 * All existing code continues to work identically - the Proxy is transparent.
 * 
 * USAGE:
 *   import { StateAuditor } from './StateAuditor.js';
 *   StateAuditor.enable();  // Start monitoring
 *   StateAuditor.snapshot('before-refactor');  // Take named snapshot
 *   // ... do work ...
 *   StateAuditor.snapshot('after-refactor');   // Take another
 *   StateAuditor.diff('before-refactor', 'after-refactor'); // Compare
 *   StateAuditor.report(); // Get full health report
 */

import { AppState } from './AppState.js';

// --- Configuration ---
const MAX_LOG_ENTRIES = 500;
const RACE_CONDITION_WINDOW_MS = 50; // If same key written twice within 50ms, flag it
const IGNORED_KEYS = new Set([
    'health', '_isFetching', 'lastGlobalFetch', // High-frequency, expected
    'onPersistenceUpdate', // Callback assignment (one-time)
]);

// Keys that are objects/Maps and should be tracked at a deeper level
const DEEP_TRACK_KEYS = new Set(['data', 'preferences', 'watchlist', 'sortConfig']);

class _StateAuditor {
    constructor() {
        this._enabled = false;
        this._log = [];           // Mutation log: [{ key, oldVal, newVal, timestamp, stack }]
        this._snapshots = {};     // Named snapshots: { name: deepClonedState }
        this._writeTimestamps = {}; // Last write time per key (for race detection)
        this._raceConditions = []; // Detected races: [{ key, timeDelta, writes }]
        this._listeners = new Map(); // key -> Set<callback> for reactive subscriptions
        this._channels = new Map(); // channel -> Set<callback> for named event subscriptions
        this._eventLog = [];        // Event history: [{ channel, data, listenerCount, timestamp }]
        this._eventCounts = {};     // { channel: count }
        this._proxyInstalled = false;
        this._originalDescriptors = {}; // Store original property descriptors for uninstall

    }

    /**
     * Enable the auditor. Installs the Proxy trap on AppState.
     * Safe to call multiple times (idempotent).
     */
    enable() {
        if (this._enabled) {
            console.log('%c[StateAuditor] Already enabled.', 'color: #888');
            return;
        }

        this._enabled = true;
        this._installProxy();

        // Take an automatic "boot" snapshot
        this.snapshot('__boot__');

        console.log(
            '%c[StateAuditor] ✅ ENABLED — Monitoring all AppState mutations.',
            'background: #1a1a2e; color: #00ff88; font-weight: bold; padding: 4px 8px; border-radius: 4px;'
        );
        console.log(
            '%c  Commands: StateAuditor.report() | StateAuditor.snapshot(name) | StateAuditor.diff(a, b) | StateAuditor.validate()',
            'color: #aaa; font-style: italic;'
        );
    }

    /**
     * Disable the auditor and remove the Proxy.
     */
    disable() {
        if (!this._enabled) return;
        this._enabled = false;
        this._uninstallProxy();
        console.log('%c[StateAuditor] ❌ DISABLED', 'color: #ff4444');
    }

    /**
     * Install property traps on AppState.
     * We use Object.defineProperty with getters/setters instead of Proxy
     * because AppState is an exported const object — we can't replace the reference,
     * but we CAN intercept property access on it.
     */
    _installProxy() {
        if (this._proxyInstalled) return;

        const self = this;
        const keys = Object.keys(AppState);

        // Store current values in a shadow object
        this._shadow = {};

        for (const key of keys) {
            // Skip functions and special properties
            if (typeof AppState[key] === 'function') continue;

            // Store the original descriptor
            this._originalDescriptors[key] = Object.getOwnPropertyDescriptor(AppState, key);

            // Store current value
            this._shadow[key] = AppState[key];

            // Install intercepting getter/setter
            Object.defineProperty(AppState, key, {
                get() {
                    return self._shadow[key];
                },
                set(newValue) {
                    const oldValue = self._shadow[key];
                    self._shadow[key] = newValue;

                    if (self._enabled && !IGNORED_KEYS.has(key) && oldValue !== newValue) {
                        self._recordMutation(key, oldValue, newValue);
                    }
                },
                configurable: true,
                enumerable: true
            });
        }

        this._proxyInstalled = true;
    }

    /**
     * Remove the intercepting getters/setters and restore original behavior.
     */
    _uninstallProxy() {
        if (!this._proxyInstalled) return;

        for (const key in this._originalDescriptors) {
            const desc = this._originalDescriptors[key];
            if (desc) {
                // Restore original value from shadow
                const currentValue = this._shadow[key];
                Object.defineProperty(AppState, key, {
                    value: currentValue,
                    writable: true,
                    configurable: true,
                    enumerable: true
                });
            }
        }

        this._shadow = null;
        this._originalDescriptors = {};
        this._proxyInstalled = false;
    }

    /**
     * Record a mutation event.
     */
    _recordMutation(key, oldValue, newValue) {
        const now = Date.now();
        const entry = {
            key,
            oldValue: this._summarize(oldValue),
            newValue: this._summarize(newValue),
            timestamp: now,
            time: new Date(now).toLocaleTimeString(),
            stack: this._getCallerInfo()
        };

        // Race condition detection
        const lastWrite = this._writeTimestamps[key];
        if (lastWrite && (now - lastWrite) < RACE_CONDITION_WINDOW_MS) {
            const race = {
                key,
                timeDelta: now - lastWrite,
                timestamp: now,
                time: entry.time,
                stack: entry.stack,
                message: `⚡ RACE: "${key}" written twice within ${now - lastWrite}ms`
            };
            this._raceConditions.push(race);
            console.warn(
                `%c${race.message}`,
                'background: #ff4444; color: white; padding: 2px 6px; border-radius: 3px;',
                '\n  Caller:', entry.stack
            );
        }
        this._writeTimestamps[key] = now;

        // Add to log (circular buffer)
        this._log.push(entry);
        if (this._log.length > MAX_LOG_ENTRIES) {
            this._log.shift();
        }

        // Notify reactive listeners
        if (this._listeners.has(key)) {
            for (const cb of this._listeners.get(key)) {
                try {
                    cb(newValue, oldValue, key);
                } catch (e) {
                    console.warn(`[StateAuditor] Listener error for "${key}":`, e);
                }
            }
        }
    }

    /**
     * Subscribe to changes on a specific state key.
     * Returns an unsubscribe function.
     */
    subscribe(key, callback) {
        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }
        this._listeners.get(key).add(callback);
        return () => this._listeners.get(key)?.delete(callback);
    }

    // =========================================================================
    // EVENT CHANNEL SYSTEM (Production-Grade)
    // Named event channels for meaningful application events.
    // Unlike property subscriptions (which fire on raw key changes),
    // channels fire on semantic events like 'PRICES_UPDATED', 'AUTH_CHANGED'.
    // =========================================================================

    /**
     * Subscribe to a named event channel.
     * @param {string} channel - Event name (e.g., 'PRICES_UPDATED')
     * @param {Function} callback - (data) => void
     * @returns {Function} Unsubscribe function
     */
    on(channel, callback) {
        if (typeof callback !== 'function') {
            console.warn(`[StateAuditor] on('${channel}'): callback is not a function`);
            return () => { };
        }
        if (!this._channels.has(channel)) {
            this._channels.set(channel, new Set());
        }
        this._channels.get(channel).add(callback);
        return () => this._channels.get(channel)?.delete(callback);
    }

    /**
     * Unsubscribe from a named event channel.
     * @param {string} channel - Event name
     * @param {Function} callback - The exact function reference passed to on()
     */
    off(channel, callback) {
        this._channels.get(channel)?.delete(callback);
    }

    /**
     * Emit a named event to all subscribers on that channel.
     * @param {string} channel - Event name (e.g., 'PRICES_UPDATED')
     * @param {*} data - Optional payload to pass to subscribers
     */
    emit(channel, data = null) {
        const subs = this._channels.get(channel);

        // --- DIAGNOSTIC LOGGING ---
        if (this._enabled) {
            this._eventCounts[channel] = (this._eventCounts[channel] || 0) + 1;
            const logEntry = {
                channel,
                data: this._summarize(data),
                listenerCount: subs?.size || 0,
                timestamp: Date.now(),
                time: new Date().toLocaleTimeString()
            };
            this._eventLog.push(logEntry);
            if (this._eventLog.length > MAX_LOG_ENTRIES) this._eventLog.shift();

            // Distinct Purple Logging for Semantic Events
            console.log(
                `%c[StateAuditor] 📡 EVENT: "${channel}" (${subs?.size || 0} listeners)`,
                'color: #bb86fc; font-weight: bold; background: rgba(187, 134, 252, 0.05); padding: 2px 4px; border-radius: 3px;',
                data
            );
        }

        if (!subs || subs.size === 0) return;

        for (const cb of subs) {
            try {
                cb(data);
            } catch (e) {
                console.warn(`[StateAuditor] emit('${channel}') listener error:`, e);
            }
        }
    }

    /**
     * Take a named snapshot of the current AppState.
     */
    snapshot(name) {
        const clone = this._deepClone(this._getStateForSnapshot());
        this._snapshots[name] = {
            data: clone,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString()
        };
        console.log(`%c[StateAuditor] 📸 Snapshot "${name}" saved at ${this._snapshots[name].time}`, 'color: #4fc3f7');
        return clone;
    }

    /**
     * Compare two named snapshots and return the differences.
     */
    diff(nameA, nameB) {
        const a = this._snapshots[nameA];
        const b = this._snapshots[nameB];

        if (!a) { console.error(`Snapshot "${nameA}" not found.`); return null; }
        if (!b) { console.error(`Snapshot "${nameB}" not found.`); return null; }

        const differences = this._deepDiff(a.data, b.data);

        console.group(`%c[StateAuditor] 🔍 Diff: "${nameA}" → "${nameB}" (${differences.length} changes)`, 'color: #e0e0e0; font-weight: bold');
        if (differences.length === 0) {
            console.log('%c  No differences detected.', 'color: #00ff88');
        } else {
            console.table(differences.map(d => ({
                Path: d.path,
                Before: this._summarize(d.oldValue),
                After: this._summarize(d.newValue),
                Type: d.type
            })));
        }
        console.groupEnd();

        return differences;
    }

    /**
     * Validate current state integrity.
     * Checks for common corruption patterns.
     */
    validate() {
        const issues = [];
        const state = this._proxyInstalled ? this._shadow : AppState;

        // 1. User should be null or an object with uid
        if (state.user !== null && (!state.user || !state.user.uid)) {
            issues.push({ severity: 'ERROR', message: 'AppState.user is set but missing .uid', value: state.user });
        }

        // 2. Data arrays should be arrays
        if (state.data) {
            ['shares', 'cash', 'watchlists', 'dashboard'].forEach(key => {
                if (state.data[key] && !Array.isArray(state.data[key])) {
                    issues.push({ severity: 'ERROR', message: `AppState.data.${key} is not an array`, value: typeof state.data[key] });
                }
            });
        }

        // 3. livePrices should be a Map
        if (state.livePrices && !(state.livePrices instanceof Map)) {
            issues.push({ severity: 'ERROR', message: 'AppState.livePrices is not a Map', value: typeof state.livePrices });
        }

        // 4. viewMode should be a valid mode
        const validModes = ['TABLE', 'COMPACT', 'SNAPSHOT'];
        if (state.viewMode && !validModes.includes(state.viewMode.toUpperCase())) {
            issues.push({ severity: 'WARN', message: `AppState.viewMode is "${state.viewMode}" — not a recognized mode`, value: state.viewMode });
        }

        // 5. watchlist.type should be 'stock' or 'cash'
        if (state.watchlist && !['stock', 'cash'].includes(state.watchlist.type)) {
            issues.push({ severity: 'WARN', message: `AppState.watchlist.type is "${state.watchlist.type}" — expected stock|cash`, value: state.watchlist.type });
        }

        // 6. sortConfig should have field and direction
        if (state.sortConfig) {
            if (!state.sortConfig.field) issues.push({ severity: 'WARN', message: 'AppState.sortConfig missing .field' });
            if (!state.sortConfig.direction) issues.push({ severity: 'WARN', message: 'AppState.sortConfig missing .direction' });
        }

        // 7. Check for orphaned subscription handles
        if (state.unsubscribeStore && typeof state.unsubscribeStore !== 'function') {
            issues.push({ severity: 'ERROR', message: 'AppState.unsubscribeStore is set but not a function' });
        }

        // 8. Race condition summary
        if (this._raceConditions.length > 0) {
            issues.push({
                severity: 'WARN',
                message: `${this._raceConditions.length} race condition(s) detected this session`,
                value: this._raceConditions.map(r => r.message)
            });
        }

        // Report
        if (issues.length === 0) {
            console.log('%c[StateAuditor] ✅ State Validation PASSED — No issues found.', 'color: #00ff88; font-weight: bold');
        } else {
            console.group('%c[StateAuditor] ⚠️ State Validation — Issues Found:', 'color: #ff9800; font-weight: bold');
            issues.forEach(issue => {
                const color = issue.severity === 'ERROR' ? '#ff4444' : '#ff9800';
                console.log(`%c  [${issue.severity}] ${issue.message}`, `color: ${color}`, issue.value !== undefined ? issue.value : '');
            });
            console.groupEnd();
        }

        return { passed: issues.filter(i => i.severity === 'ERROR').length === 0, issues };
    }

    /**
     * Generate a comprehensive health report.
     */
    report() {
        const state = this._proxyInstalled ? this._shadow : AppState;

        console.group('%c[StateAuditor] 📊 STATE HEALTH REPORT', 'background: #1a1a2e; color: #00ff88; font-weight: bold; padding: 4px 12px; border-radius: 4px; font-size: 14px;');

        // 1. Current State Summary
        console.group('📋 Current State');
        console.log('User:', state.user ? `✅ ${state.user.email || state.user.uid}` : '❌ Not logged in');
        console.log('Watchlist:', `${state.watchlist?.id || 'portfolio'} (${state.watchlist?.type})`);
        console.log('View Mode:', state.viewMode);
        console.log('Sort:', `${state.sortConfig?.field} ${state.sortConfig?.direction}`);
        console.log('Shares:', (state.data?.shares || []).length);
        console.log('Cash:', (state.data?.cash || []).length);
        console.log('Watchlists:', (state.data?.watchlists || []).length);
        console.log('Live Prices:', state.livePrices instanceof Map ? state.livePrices.size : 'N/A');
        console.log('Locked:', state.isLocked);
        console.groupEnd();

        // 2. Mutation Log Summary
        console.group(`📝 Mutation Log (${this._log.length} entries)`);
        if (this._log.length > 0) {
            // Count mutations per key
            const counts = {};
            this._log.forEach(e => { counts[e.key] = (counts[e.key] || 0) + 1; });
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            console.table(sorted.map(([key, count]) => ({ Key: key, Mutations: count })));

            // Show last 10 mutations
            console.log('Last 10 mutations:');
            console.table(this._log.slice(-10).map(e => ({
                Time: e.time,
                Key: e.key,
                New: e.newValue,
                Caller: e.stack
            })));
        } else {
            console.log('No mutations recorded yet.');
        }
        console.groupEnd();

        // 3. Race Conditions
        console.group(`⚡ Race Conditions (${this._raceConditions.length})`);
        if (this._raceConditions.length > 0) {
            console.table(this._raceConditions.map(r => ({
                Key: r.key,
                Delta: `${r.timeDelta}ms`,
                Time: r.time,
                Caller: r.stack
            })));
        } else {
            console.log('%c  None detected ✅', 'color: #00ff88');
        }
        console.groupEnd();

        // 4. Event Bus Health
        console.group(`📡 Event Bus (${this._channels.size} channels, ${this._eventLog.length} total events)`);
        if (this._channels.size > 0) {
            const channelInfo = Array.from(this._channels.entries()).map(([name, subs]) => ({
                Channel: name,
                Listeners: subs.size,
                Emits: this._eventCounts[name] || 0,
                Status: subs.size === 0 ? '⚠️ NO LISTENERS (Dead)' : '✅ Active'
            }));
            console.table(channelInfo);

            if (this._eventLog.length > 0) {
                console.log('Last 5 Events:');
                console.table(this._eventLog.slice(-5).map(e => ({
                    Time: e.time,
                    Channel: e.channel,
                    Subs: e.listenerCount,
                    Payload: e.data
                })));
            }
        } else {
            console.log('No event channels registered yet.');
        }
        console.groupEnd();

        // 5. Snapshots
        console.group(`📸 Snapshots (${Object.keys(this._snapshots).length})`);
        Object.entries(this._snapshots).forEach(([name, snap]) => {
            console.log(`  "${name}" — ${snap.time}`);
        });
        console.groupEnd();

        // 5. Validation
        this.validate();

        console.groupEnd();

        return {
            mutations: this._log.length,
            raceConditions: this._raceConditions.length,
            snapshots: Object.keys(this._snapshots),
            validation: this.validate()
        };
    }

    /**
     * Get raw mutation log filtered by key.
     */
    getLog(key = null) {
        if (key) return this._log.filter(e => e.key === key);
        return [...this._log];
    }

    /**
     * Clear all accumulated data.
     */
    reset() {
        this._raceConditions = [];
        this._writeTimestamps = {};
        this._eventLog = [];
        this._eventCounts = {};
        console.log('%c[StateAuditor] 🔄 Reset — all logs, snapshots, events, and race data cleared.', 'color: #4fc3f7');
    }

    // --- Internal Helpers ---

    _getStateForSnapshot() {
        const state = this._proxyInstalled ? this._shadow : AppState;
        const obj = {};
        for (const key of Object.keys(state)) {
            if (typeof state[key] === 'function') continue;
            obj[key] = state[key];
        }
        return obj;
    }

    _deepClone(obj) {
        if (obj === null || obj === undefined) return obj;
        if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [k, this._deepClone(v)]));
        if (obj instanceof Set) return new Set([...obj].map(v => this._deepClone(v)));
        if (obj instanceof Date) return new Date(obj.getTime());
        if (Array.isArray(obj)) return obj.map(item => this._deepClone(item));
        if (typeof obj === 'object') {
            const clone = {};
            for (const key of Object.keys(obj)) {
                clone[key] = this._deepClone(obj[key]);
            }
            return clone;
        }
        return obj;
    }

    _deepDiff(a, b, path = '') {
        const diffs = [];

        if (a === b) return diffs;
        if (a === null || b === null || typeof a !== typeof b) {
            diffs.push({ path: path || '(root)', oldValue: a, newValue: b, type: 'changed' });
            return diffs;
        }

        // Handle Maps
        if (a instanceof Map && b instanceof Map) {
            const allKeys = new Set([...a.keys(), ...b.keys()]);
            for (const key of allKeys) {
                const sub = this._deepDiff(a.get(key), b.get(key), `${path}.Map[${key}]`);
                diffs.push(...sub);
            }
            return diffs;
        }

        // Handle Sets
        if (a instanceof Set && b instanceof Set) {
            const added = [...b].filter(x => !a.has(x));
            const removed = [...a].filter(x => !b.has(x));
            if (added.length > 0 || removed.length > 0) {
                diffs.push({ path: path || '(root)', oldValue: `Set(${a.size})`, newValue: `Set(${b.size})`, type: 'changed', added, removed });
            }
            return diffs;
        }

        // Handle arrays
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                diffs.push({ path: path || '(root)', oldValue: `Array(${a.length})`, newValue: `Array(${b.length})`, type: 'resized' });
            }
            const maxLen = Math.max(a.length, b.length);
            for (let i = 0; i < maxLen && i < 10; i++) { // Cap at 10 to prevent huge diffs
                const sub = this._deepDiff(a[i], b[i], `${path}[${i}]`);
                diffs.push(...sub);
            }
            return diffs;
        }

        // Handle objects
        if (typeof a === 'object' && typeof b === 'object') {
            const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const key of allKeys) {
                const sub = this._deepDiff(a[key], b[key], path ? `${path}.${key}` : key);
                diffs.push(...sub);
            }
            return diffs;
        }

        // Primitives
        if (a !== b) {
            diffs.push({ path: path || '(root)', oldValue: a, newValue: b, type: 'changed' });
        }

        return diffs;
    }

    _summarize(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (value instanceof Map) return `Map(${value.size})`;
        if (value instanceof Set) return `Set(${value.size})`;
        if (Array.isArray(value)) return `Array(${value.length})`;
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length <= 3) return JSON.stringify(value).substring(0, 100);
            return `{${keys.slice(0, 3).join(', ')}... +${keys.length - 3}}`;
        }
        if (typeof value === 'string' && value.length > 50) return value.substring(0, 50) + '...';
        return String(value);
    }

    _getCallerInfo() {
        try {
            const stack = new Error().stack;
            const lines = stack.split('\n').filter(l => l.includes('.js'));
            // Find the first line that's NOT StateAuditor.js
            const caller = lines.find(l => !l.includes('StateAuditor'));
            if (caller) {
                const match = caller.match(/at\s+(.+?)\s+\((.+?)\)/);
                if (match) return `${match[1]} (${match[2].split('/').pop()})`;
                const match2 = caller.match(/at\s+(.+)/);
                if (match2) return match2[1].split('/').pop();
            }
            return 'unknown';
        } catch {
            return 'unknown';
        }
    }
}

// Singleton
export const StateAuditor = new _StateAuditor();
