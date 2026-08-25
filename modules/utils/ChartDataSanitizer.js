/**
 * ChartDataSanitizer.js
 * Multi-point & Multi-series retrospective chart history sanitization & ingestion gatekeeper validation.
 * Eliminates artificial out-of-hours plunges, multi-point plateaus, transient V-spikes, and zeroed holdings across Total, Shares, Super, and Cash.
 */

import { MarketSchedule } from './MarketSchedule.js';
import { resolveStockPrice } from '../data/DataProcessor.js';

export class ChartDataSanitizer {
    /**
     * Sanitizes an array of historical snapshot objects in-place or returning a cleaned copy.
     * Retrospectively removes single-point and multi-point out-of-hours plateaus, V-dips, transient spikes, and zeroed points across all series.
     * @param {Array<Object>} snapshots - Array of snapshot objects { time/date/timestamp, total, shares, super, cash, categories }
     * @param {Object} [options]
     * @param {number} [options.dropThreshold=0.025] - Percentage drop (0.025 = 2.5%) triggering outlier check
     * @param {number} [options.spikeThreshold=0.03] - Percentage spike (0.03 = 3.0%) triggering outlier check
     * @param {number} [options.recoveryTolerance=0.035] - Max delta (3.5%) between recovery point and baseline
     * @param {number} [options.outOfHoursDropThreshold=0.02] - Threshold for out-of-hours movement (2.0%)
     * @param {Object} [options.liveSnapshot=null] - Optional current live snapshot to anchor trailing plateaus
     * @returns {Array<Object>} Cleaned and interpolated snapshots
     */
    static sanitizeSnapshotSeries(snapshots, options = {}) {
        if (!Array.isArray(snapshots) || snapshots.length === 0) return [];

        const dropThreshold = options.dropThreshold ?? 0.025;
        const spikeThreshold = options.spikeThreshold ?? 0.03;
        const recoveryTolerance = options.recoveryTolerance ?? 0.035;
        const outOfHoursDropThreshold = options.outOfHoursDropThreshold ?? 0.02;
        const liveSnapshot = options.liveSnapshot || null;

        const getSnapTs = (snap) => {
            if (snap.time) return Number(snap.time);
            if (snap.date) return Math.floor(new Date(snap.date).getTime() / 1000);
            if (snap.timestamp) return Math.floor(new Date(snap.timestamp).getTime() / 1000);
            return 0;
        };

        // 1. Sort snapshots chronologically and filter invalid timestamps
        let sorted = snapshots
            .map(s => ({ ...s, _cleanTs: getSnapTs(s) }))
            .filter(s => s._cleanTs > 0 && !isNaN(s._cleanTs))
            .sort((a, b) => a._cleanTs - b._cleanTs);

        if (sorted.length === 0) return [];

        // If live snapshot is provided and newer than last snapshot, append it temporarily as a forward recovery anchor
        let hasTempLive = false;
        if (liveSnapshot && getSnapTs(liveSnapshot) > 0) {
            const liveTs = getSnapTs(liveSnapshot);
            const lastTs = sorted[sorted.length - 1]._cleanTs;
            if (liveTs > lastTs) {
                sorted.push({ ...liveSnapshot, _cleanTs: liveTs, _isLiveAnchor: true });
                hasTempLive = true;
            }
        }

        const n = sorted.length;
        const result = sorted.map(s => ({ ...s }));

        // Helper: interpolate all numeric properties across a range of indices [startIdx...endIdx] from prev and next
        const interpolateSnapshotRange = (startIdx, endIdx, prevIdx, nextIdx) => {
            const prev = result[prevIdx];
            const next = result[nextIdx];

            const tPrev = prev._cleanTs;
            const tNext = next._cleanTs;

            for (let k = startIdx; k <= endIdx; k++) {
                const curr = result[k];
                const tCurr = curr._cleanTs;

                let alpha = (tNext > tPrev) ? (tCurr - tPrev) / (tNext - tPrev) : 0.5;
                if (isNaN(alpha) || alpha < 0 || alpha > 1) alpha = 0.5;

                const interpVal = (v1, v2) => {
                    const n1 = Number.isFinite(v1) ? v1 : 0;
                    const n2 = Number.isFinite(v2) ? v2 : 0;
                    return n1 + alpha * (n2 - n1);
                };

                curr.total = interpVal(prev.total, next.total);
                curr.shares = interpVal(prev.shares, next.shares);
                curr.super = interpVal(prev.super, next.super);
                curr.cash = interpVal(prev.cash, next.cash);

                // Interpolate categories if present
                if (prev.categories || next.categories || curr.categories) {
                    curr.categories = { ...(curr.categories || {}) };
                    const allKeys = new Set([
                        ...Object.keys(prev.categories || {}),
                        ...Object.keys(next.categories || {}),
                        ...Object.keys(curr.categories || {})
                    ]);
                    allKeys.forEach(cid => {
                        curr.categories[cid] = interpVal(prev.categories?.[cid], next.categories?.[cid]);
                    });
                }

                curr._sanitized = true;
                curr._corrupted = true;
            }
        };

        // Helper to evaluate if a metric shows an outlier V-dip or V-spike
        const isOutlierBlip = (vPrev, vCurr, vNext, isOutOfHours = false) => {
            if (!Number.isFinite(vPrev) || !Number.isFinite(vCurr) || !Number.isFinite(vNext)) return false;
            if (vPrev <= 0 || vNext <= 0) return false;

            const dropPct = (vPrev - vCurr) / vPrev;
            const spikePct = (vCurr - vPrev) / vPrev;
            const recoveryDelta = Math.abs(vNext - vPrev) / vPrev;
            const absoluteDelta = Math.abs(vPrev - vCurr);

            // V-dip: sharp plunge where drop is at least 1.8x larger than baseline drift between prev and next
            const isVDip = (
                (dropPct >= dropThreshold || (absoluteDelta >= 15000 && dropPct >= 0.015)) &&
                recoveryDelta <= recoveryTolerance &&
                dropPct >= 1.8 * recoveryDelta
            );

            // V-spike: sharp spike where spike is at least 1.8x larger than baseline drift
            const isVSpike = (
                (spikePct >= spikeThreshold || (absoluteDelta >= 20000 && spikePct >= 0.02)) &&
                recoveryDelta <= recoveryTolerance &&
                spikePct >= 1.8 * recoveryDelta
            );

            // Zero / Near-Zero glitch
            const isZeroGlitch = (vCurr <= 0 || vCurr < 0.25 * vPrev) && (vNext >= 0.50 * vPrev);

            // Out-of-hours glitch
            const isOOHGlitch = isOutOfHours && (Math.abs(dropPct) >= outOfHoursDropThreshold) && (recoveryDelta <= recoveryTolerance);

            return isVDip || isVSpike || isZeroGlitch || isOOHGlitch;
        };

        // 2. MULTI-POINT OUT-OF-HOURS PLATEAU SCANNER
        // Scans for sequences of points j...k that dropped out of hours and recovered
        let i = 0;
        while (i < n - 1) {
            const baseline = result[i];
            const pBase = Number.isFinite(baseline.total) ? baseline.total : 0;
            const sBase = Number.isFinite(baseline.shares) ? baseline.shares : 0;
            const uBase = Number.isFinite(baseline.super) ? baseline.super : 0;

            if (pBase <= 0) {
                i++;
                continue;
            }

            let j = i + 1;
            let isCorruptedSequence = false;
            let corruptedEnd = -1;
            let recoveryIdx = -1;

            // Lookahead to find the extent of the drop
            while (j < n) {
                const curr = result[j];
                const pCurr = Number.isFinite(curr.total) ? curr.total : 0;
                const sCurr = Number.isFinite(curr.shares) ? curr.shares : 0;
                const uCurr = Number.isFinite(curr.super) ? curr.super : 0;

                const dropPctTotal = (pBase - pCurr) / pBase;
                const dropPctShares = sBase > 0 ? (sBase - sCurr) / sBase : 0;
                const dropPctSuper = uBase > 0 ? (uBase - uCurr) / uBase : 0;
                const absoluteDrop = pBase - pCurr;
                const isMarketOpen = MarketSchedule.isASXTrading(new Date(curr._cleanTs * 1000));

                // Conditions for an artificial out-of-hours / zero-price corrupted snapshot point:
                const isDepressedPoint = (
                    (!isMarketOpen && (dropPctTotal >= 0.02 || dropPctShares >= 0.025 || dropPctSuper >= 0.03 || absoluteDrop >= 15000)) ||
                    (dropPctShares >= 0.20 && !isMarketOpen) ||
                    (pCurr <= 0.30 * pBase) ||
                    (dropPctTotal >= 0.10 && !isMarketOpen)
                );

                if (isDepressedPoint) {
                    isCorruptedSequence = true;
                    corruptedEnd = j;
                    j++;
                } else {
                    // Reached a non-depressed point: check if it qualifies as a recovery to baseline
                    if (isCorruptedSequence) {
                        const recDeltaTotal = Math.abs(pCurr - pBase) / pBase;
                        const recDeltaShares = sBase > 0 ? Math.abs(sCurr - sBase) / sBase : 0;

                        const isHealthyRecovery = (
                            (recDeltaTotal <= recoveryTolerance || recDeltaShares <= recoveryTolerance) ||
                            (pCurr >= 0.90 * pBase) ||
                            (isMarketOpen && pCurr > 0.85 * pBase)
                        );

                        if (isHealthyRecovery) {
                            recoveryIdx = j;
                        }
                    }
                    break;
                }
            }

            // If a corrupted sequence with a valid recovery point was identified:
            if (isCorruptedSequence && corruptedEnd >= i + 1 && recoveryIdx > corruptedEnd) {
                interpolateSnapshotRange(i + 1, corruptedEnd, i, recoveryIdx);
                i = recoveryIdx; // Fast forward past the plateau
                continue;
            } else if (isCorruptedSequence && corruptedEnd === n - 1 && hasTempLive) {
                // Trailing plateau extending all the way to the live anchor!
                const livePoint = result[n - 1];
                const pLive = Number.isFinite(livePoint.total) ? livePoint.total : 0;
                if (pLive >= 0.85 * pBase || Math.abs(pLive - pBase) / pBase <= recoveryTolerance) {
                    interpolateSnapshotRange(i + 1, corruptedEnd - 1, i, n - 1);
                }
                break;
            }

            i++;
        }

        // 3. SCAN FOR SINGLE-POINT V-DIPS & V-SPIKES ON TOTAL, SHARES, AND SUPER
        for (let k = 1; k < n - 1; k++) {
            if (result[k]._sanitized) continue;

            const prev = result[k - 1];
            const curr = result[k];
            const next = result[k + 1];

            const isOutOfHours = !MarketSchedule.isASXTrading(new Date(curr._cleanTs * 1000));

            const totalBlip = isOutlierBlip(prev.total, curr.total, next.total, isOutOfHours);
            const sharesBlip = isOutlierBlip(prev.shares, curr.shares, next.shares, isOutOfHours);
            const superBlip = isOutlierBlip(prev.super, curr.super, next.super, isOutOfHours);

            if (totalBlip || sharesBlip || superBlip) {
                interpolateSnapshotRange(k, k, k - 1, k + 1);
            }
        }

        // 4. SCAN FOR 2-POINT CONSECUTIVE BLIPS (k and k+1)
        for (let k = 1; k < n - 2; k++) {
            if (result[k]._sanitized || result[k + 1]._sanitized) continue;

            const prev = result[k - 1];
            const curr1 = result[k];
            const curr2 = result[k + 1];
            const next = result[k + 2];

            const isOOH1 = !MarketSchedule.isASXTrading(new Date(curr1._cleanTs * 1000));
            const isOOH2 = !MarketSchedule.isASXTrading(new Date(curr2._cleanTs * 1000));

            const check2Point = (vPrev, vC1, vC2, vNext) => {
                if (!vPrev || !vNext || vPrev <= 0 || vNext <= 0) return false;
                const d1 = (vPrev - vC1) / vPrev;
                const d2 = (vPrev - vC2) / vPrev;
                const rec = Math.abs(vNext - vPrev) / vPrev;
                return (d1 >= 0.02 && d2 >= 0.02 && rec <= recoveryTolerance && (d1 >= 1.8 * rec || isOOH1 || isOOH2));
            };

            if (check2Point(prev.total, curr1.total, curr2.total, next.total) ||
                check2Point(prev.shares, curr1.shares, curr2.shares, next.shares) ||
                check2Point(prev.super, curr1.super, curr2.super, next.super)) {
                interpolateSnapshotRange(k, k + 1, k - 1, k + 2);
                k++; // skip next
            }
        }

        // 5. Boundary Sanitization (Leading point 0)
        if (result.length >= 2) {
            if ((!result[0].total || result[0].total <= 0 || result[0].total < 0.2 * result[1].total) && result[1].total > 0) {
                result[0].total = result[1].total;
                result[0].shares = result[1].shares;
                result[0].super = result[1].super;
                result[0].cash = result[1].cash;
                if (result[1].categories) result[0].categories = { ...result[1].categories };
                result[0]._sanitized = true;
            }
        }

        // Remove temp live anchor if added
        if (hasTempLive) {
            result.pop();
        }

        return result;
    }

    /**
     * Scans Firestore snapshot document records and identifies those that represent corrupted records.
     * Useful for one-time database cleanup / storage purging.
     * @param {Array<Object>} docs - Array of Firestore docs with { id/docId, total, shares, time, date, timestamp }
     * @param {Object} [options]
     * @returns {Array<Object>} List of corrupted document records with detection reasons
     */
    static identifyCorruptedSnapshotDocs(docs, options = {}) {
        if (!Array.isArray(docs) || docs.length === 0) return [];

        const getDocTs = (d) => {
            if (d.time) return Number(d.time);
            if (d.date) return Math.floor(new Date(d.date).getTime() / 1000);
            if (d.timestamp) return Math.floor(new Date(d.timestamp).getTime() / 1000);
            return 0;
        };

        const sorted = docs
            .map(d => ({ ...d, _cleanTs: getDocTs(d) }))
            .filter(d => d._cleanTs > 0 && !isNaN(d._cleanTs))
            .sort((a, b) => a._cleanTs - b._cleanTs);

        if (sorted.length <= 1) return [];

        const corrupted = [];
        const n = sorted.length;

        // Run through full series to flag corrupted points
        const sanitized = this.sanitizeSnapshotSeries(sorted, options);

        for (let i = 0; i < n; i++) {
            const orig = sorted[i];
            const clean = sanitized[i];

            if (clean && clean._corrupted) {
                const isMarketOpen = MarketSchedule.isASXTrading(new Date(orig._cleanTs * 1000));
                let reason = 'Out-of-hours artificial plunge';
                if (orig.shares === 0 && (clean.shares || 0) > 0) {
                    reason = 'Zeroed shares valuation out-of-hours';
                } else if (!isMarketOpen) {
                    reason = `Unconfirmed out-of-hours dip ($${Math.round(orig.total)} vs baseline $${Math.round(clean.total)})`;
                } else {
                    reason = 'Transient single-point pricing glitch';
                }

                corrupted.push({
                    id: orig.id || orig.docId,
                    time: orig._cleanTs,
                    date: orig.date || new Date(orig._cleanTs * 1000).toISOString(),
                    originalTotal: orig.total,
                    originalShares: orig.shares,
                    interpolatedTotal: clean.total,
                    interpolatedShares: clean.shares,
                    reason
                });
            }
        }

        return corrupted;
    }

    /**
     * Sanitizes a standalone line data series array of { time, value } objects.
     * @param {Array<{ time: number, value: number }>} lineData 
     * @param {Object} [options]
     * @returns {Array<{ time: number, value: number }>}
     */
    static sanitizeLineSeries(lineData, options = {}) {
        if (!Array.isArray(lineData) || lineData.length <= 2) return lineData || [];

        const dropThreshold = options.dropThreshold ?? 0.025;
        const spikeThreshold = options.spikeThreshold ?? 0.03;
        const recoveryTolerance = options.recoveryTolerance ?? 0.035;

        const cleaned = lineData.map(d => ({ ...d }));
        const n = cleaned.length;

        for (let i = 1; i < n - 1; i++) {
            const vPrev = cleaned[i - 1].value;
            const vCurr = cleaned[i].value;
            const vNext = cleaned[i + 1].value;

            if (vPrev <= 0 || vNext <= 0) continue;

            const dropPct = (vPrev - vCurr) / vPrev;
            const spikePct = (vCurr - vPrev) / vPrev;
            const recoveryDelta = Math.abs(vNext - vPrev) / vPrev;
            const absoluteDelta = Math.abs(vPrev - vCurr);

            const isVDip = (
                (dropPct >= dropThreshold || (absoluteDelta >= 15000 && dropPct >= 0.015)) &&
                recoveryDelta <= recoveryTolerance &&
                dropPct >= 1.8 * recoveryDelta
            );

            const isVSpike = (
                (spikePct >= spikeThreshold || (absoluteDelta >= 20000 && spikePct >= 0.02)) &&
                recoveryDelta <= recoveryTolerance &&
                spikePct >= 1.8 * recoveryDelta
            );

            const isZero = (vCurr <= 0 || vCurr < 0.25 * vPrev) && (vNext >= 0.50 * vPrev);

            if (isVDip || isVSpike || isZero) {
                const tPrev = cleaned[i - 1].time;
                const tCurr = cleaned[i].time;
                const tNext = cleaned[i + 1].time;
                let alpha = (tNext > tPrev) ? (tCurr - tPrev) / (tNext - tPrev) : 0.5;
                if (isNaN(alpha) || alpha < 0 || alpha > 1) alpha = 0.5;
                cleaned[i].value = vPrev + alpha * (vNext - vPrev);
                cleaned[i]._sanitized = true;
            }
        }

        return cleaned;
    }

    /**
     * Ingestion Gatekeeper: Validates a proposed real-time portfolio snapshot before committing.
     * Prevents transient bad data reads, unconfirmed out-of-hours drops, or zeroed holdings from polluting history.
     * @param {Object} params
     * @param {Array} params.shares - Current shares list from AppState
     * @param {Array} params.cash - Current cash assets list from AppState
     * @param {Map} params.livePrices - Current live prices Map
     * @param {number} [params.lastCleanValue=0] - Last recorded clean portfolio total value
     * @param {boolean} [params.isMarketOpen=false] - Whether ASX is currently in active trading
     * @param {Object|null} [params.pendingDownshift=null] - Any existing unconfirmed downshift reading
     * @returns {{ isValid: boolean, reason?: string, proposedTotal: number, requireConfirmation?: boolean, pendingReading?: Object, confirmedDownshift?: boolean }}
     */
    static validateSnapshotProposal({
        shares = [],
        cash = [],
        livePrices = new Map(),
        lastCleanValue = 0,
        isMarketOpen = false,
        pendingDownshift = null
    }) {
        // 1. Check for Active Holding Zero-Price Collapses
        const activeShares = (shares || []).filter(s => {
            const units = parseFloat(s.portfolioShares) || parseFloat(s.units) || 0;
            return units > 0;
        });

        const zeroValuedCodes = [];
        let calculatedSharesTotal = 0;

        activeShares.forEach(s => {
            const code = String(s.shareName || s.code || '').trim().toUpperCase();
            const units = parseFloat(s.portfolioShares) || parseFloat(s.units) || 0;
            const priceData = livePrices ? (livePrices.get(code) || livePrices.get(code + '.AX')) : null;

            const resolvedPrice = resolveStockPrice(priceData, s);
            if (resolvedPrice <= 0) {
                zeroValuedCodes.push(code);
            } else {
                calculatedSharesTotal += units * resolvedPrice;
            }
        });

        if (zeroValuedCodes.length > 0) {
            return {
                isValid: false,
                reason: `Corrupted holding valuation: [${zeroValuedCodes.join(', ')}] resolved to $0.00`,
                proposedTotal: 0
            };
        }

        // 2. Calculate Total Proposed Valuation
        let calculatedCashTotal = 0;
        (cash || []).forEach(c => {
            if (c.category === 'shares') return; // Exclude redundant share-cash link to prevent double-counting
            calculatedCashTotal += parseFloat(c.balance || 0);
        });

        const proposedTotal = calculatedSharesTotal + calculatedCashTotal;

        if (proposedTotal <= 0 && (activeShares.length > 0 || (cash || []).length > 0)) {
            return {
                isValid: false,
                reason: 'Proposed total portfolio valuation is $0.00 despite active holdings',
                proposedTotal: 0
            };
        }

        // 3. Out-of-Hours Discrepancy & Plunge Prevention
        if (lastCleanValue > 0) {
            const dropPct = (lastCleanValue - proposedTotal) / lastCleanValue;

            // Strict Out-of-Hours Rejection: When market is closed, valuation must not plunge > 15%
            if (!isMarketOpen && dropPct > 0.15) {
                return {
                    isValid: false,
                    reason: `Unconfirmed out-of-hours drop of ${(dropPct * 100).toFixed(1)}% while market is closed`,
                    proposedTotal
                };
            }

            // Two-Consecutive-Reading Rule for Radical Downward Shifts (> 15%)
            if (dropPct > 0.15) {
                const now = Date.now();
                const maxPendingAge = 15 * 60 * 1000; // 15 minutes window

                if (pendingDownshift && (now - pendingDownshift.timestamp) <= maxPendingAge) {
                    // Check if second reading is consistent with the first unconfirmed reading (within 5%)
                    const diffVsPending = Math.abs(proposedTotal - pendingDownshift.value) / pendingDownshift.value;
                    if (diffVsPending <= 0.05) {
                        return {
                            isValid: true,
                            confirmedDownshift: true,
                            proposedTotal
                        };
                    }
                }

                // First unconfirmed reading: quarantine until verified by second reading
                return {
                    isValid: false,
                    requireConfirmation: true,
                    pendingReading: { value: proposedTotal, timestamp: now },
                    reason: `Radical valuation shift (-${(dropPct * 100).toFixed(1)}%) requires second consecutive confirmation reading`,
                    proposedTotal
                };
            }
        }

        return {
            isValid: true,
            proposedTotal
        };
    }
}
