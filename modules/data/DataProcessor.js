/**
 * DataProcessor.js
 * Pure business logic module for processing share data.
 * Handles filtering, merging with live prices, metric calculation, and sorting.
 */

import { UserStore } from './UserStore.js';

// Instantiate strictly for helper methods (stateless usage of getWatchlistData)
const userStore = new UserStore();

/**
 * Normalizes mixed comment formats into a standard array of { body, date }.
 * Handles:
 * - Simple strings: "My comment" -> { body: "My comment", date: <iso> }
 * - Legacy objects: { text: "...", date: "..." } -> { body: "...", date: "..." }
 * - Legacy titles: { title: "Topic", body: "...", date: "..." } -> { body: "Topic: ...", date: "..." }
 * - Mixed arrays of the above.
 * @returns {Array<Object>}
 */
export function normalizeComments(comments) {
    if (!comments) return [];

    // Ensure we handle single items or arrays
    const raw = Array.isArray(comments) ? comments : [comments];

    return raw.map(c => {
        if (!c) return null;

        // Handle Simple String
        if (typeof c === 'string') {
            return { body: c, date: new Date().toISOString() };
        }

        // Handle Object
        if (typeof c === 'object') {
            const body = c.body || c.text || c.note || c.comment || '';
            const title = c.title || '';
            const date = c.date || c.createdAt || new Date().toISOString();

            // Combine Title and Body as requested
            const combinedBody = title ? `${title}: ${body}`.trim() : body.trim();

            return { body: combinedBody, date: date };
        }

        return null;
    }).filter(c => c && c.body && c.body.trim().length > 0);
}

/**
 * Processes raw share data into a view-ready format.
 * @param {Array} allShares - List of all user shares.
 * @param {string|null} watchlistId - Current watchlist ID (or 'ALL', null).
 * @param {Map} livePrices - Map of live price data.
 * @param {Object} sortConfig - { field, direction }
 * @returns {Object} { mergedData, summaryMetrics }
 */
export function processShares(allShares, watchlistId, livePrices, sortConfig, hiddenAssets = new Set()) {
    // 1. Filter by Watchlist
    const filteredShares = userStore.getWatchlistData(allShares, watchlistId);

    if (!filteredShares || filteredShares.length === 0) {
        return { mergedData: [], summaryMetrics: null };
    }

    // 2. Merge Data (Per-Share Calculations)
    const mergedData = filteredShares.map(share => {
        // STRICT LOOKUP: Trim and Uppercase to match DataService keys
        const lookupKey = String(share.shareName).trim().toUpperCase();
        let priceData = livePrices.get(lookupKey);

        // Fallback: Try appending .AX if not found
        if (!priceData && !lookupKey.includes('.')) {
            priceData = livePrices.get(lookupKey + '.AX');
        }
        // Fallback: Try stripping .AX if not found
        if (!priceData && lookupKey.endsWith('.AX')) {
            priceData = livePrices.get(lookupKey.replace('.AX', ''));
        }

        const currentPrice = priceData ? (parseFloat(priceData.live) || 0) : (parseFloat(share.enteredPrice) || 0);
        const dayChangePercent = priceData ? (parseFloat(priceData.pctChange) || 0) : 0;
        const units = parseFloat(share.portfolioShares) || 0;

        // Cost Basis Logic: Expanded fallbacks for rewrite compatibility
        const costPrice = parseFloat(share.buyPrice) ||
            parseFloat(share.portfolioAvgPrice) ||
            parseFloat(share.averageCost) ||
            parseFloat(share.avgCost) ||
            parseFloat(share.avgPrice) ||
            parseFloat(share.purchasePrice) ||
            parseFloat(share.entryPrice) ||
            parseFloat(share.enteredPrice) || 0;

        const enteredPrice = parseFloat(share.entryPrice) ||
            parseFloat(share.enteredPrice) ||
            parseFloat(share.buyPrice) ||
            costPrice || 0;

        const value = units * currentPrice;
        const cost = units * costPrice;

        // Day Change Logic
        const previousValue = value / (1 + (dayChangePercent / 100));
        const dayChangeValue = value - previousValue; // Total holdings change
        const previousPrice = currentPrice / (1 + (dayChangePercent / 100)); // Price before change
        const dayChangePerShare = currentPrice - previousPrice; // Per-share change

        const capitalGain = value - cost;
        const capitalGainPercent = cost !== 0 ? (capitalGain / cost) * 100 : 0;

        return {
            ...share,
            // Robust Link: Usage of 'shareName' (Legacy) vs 'code' (New Schema)
            // We ensure we have a valid code string for display/logic
            code: share.shareName || share.code,
            // We also ensure shareName is backfilled if missing, to satisfy legacy consumers downstream
            shareName: share.shareName || share.code,
            currentPrice: currentPrice,
            dayChangePercent: dayChangePercent,
            dayChangeValue: dayChangeValue, // Total value change for portfolio
            dayChangePerShare: dayChangePerShare, // Per-share change for watchlists
            units: units,
            value: value,
            costBasis: cost,
            costPrice: costPrice,
            enteredPrice: enteredPrice,
            capitalGain: capitalGain,
            capitalGainPercent: capitalGainPercent,
            capitalGain: capitalGain,
            capitalGainPercent: capitalGainPercent,
            comments: normalizeComments(share.comments),
            isHidden: hiddenAssets.has(String(share.id)),
            sector: priceData ? priceData.sector : (share.sector || ''),
            industry: priceData ? priceData.industry : (share.industry || '')
        };
    });

    // DEBUG: Log match rate
    const liveCount = mergedData.filter(m => m.currentPrice > 0).length;
    console.log(`[DEBUG] DataProcessor.processShares: Matched ${liveCount}/${mergedData.length} items with live prices.`);

    // 3. Calculate Totals (ONLY for Portfolio view, usually skip hidden)
    // We pass mergedData but we want the summary to exclude hidden shares.
    const summaryMetrics = calculatePortfolioTotals(mergedData.filter(s => !s.isHidden));

    // 4. Sort Data
    const { field, direction } = sortConfig;
    mergedData.sort((a, b) => {
        // Rule: Hidden shares ALWAYS go to the bottom
        if (a.isHidden && !b.isHidden) return 1;
        if (!a.isHidden && b.isHidden) return -1;

        let valA = a[field];
        let valB = b[field];

        // Pre-process Date fields with fallbacks
        if (field === 'entryDate' || field === 'purchaseDate') {
            const actualA = valA || (field === 'entryDate' ? a.purchaseDate : a.entryDate);
            const actualB = valB || (field === 'entryDate' ? b.purchaseDate : b.entryDate);

            const tA = new Date(actualA).getTime();
            const tB = new Date(actualB).getTime();
            valA = isNaN(tA) ? null : tA;
            valB = isNaN(tB) ? null : tB;
        }

        // Handle string comparison for code/names
        if (field === 'code' || field === 'name') {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        }

        // === Custom Sort: Comments & Targets ===
        // Logic: Presence First, then Code (Asc/Desc based on toggle)
        if (field === 'comments' || field === 'targetPrice') {
            // Determine Presence
            let hasA = false;
            let hasB = false;

            if (field === 'comments') hasA = (a.comments && a.comments.length > 0);
            if (field === 'comments') hasB = (b.comments && b.comments.length > 0);

            if (field === 'targetPrice') hasA = (a.targetPrice && a.targetPrice > 0);
            if (field === 'targetPrice') hasB = (b.targetPrice && b.targetPrice > 0);

            // Primary: Presence
            if (hasA && !hasB) return -1; // A has data, B doesn't -> A first
            if (!hasA && hasB) return 1;  // B has data, A doesn't -> B first

            // Secondary: Code Sort (if both have or both don't)
            // Respect Toggle:
            // High to Low (Green Up) -> 'asc' for Text -> A-Z
            // Low to High (Red Down) -> 'desc' for Text -> Z-A
            const codeA = String(a.code || '').toLowerCase();
            const codeB = String(b.code || '').toLowerCase();

            if (codeA < codeB) return direction === 'asc' ? -1 : 1;
            if (codeA > codeB) return direction === 'asc' ? 1 : -1;
            return 0;
        }

        // Handle Numeric Sorting (Sparse Data Support)
        // Rule: Missing/Invalid values (null, undefined, NaN) ALWAYS go to the bottom.
        // Special Case: For 'starRating' and 'dividendAmount', 0 is considered "Missing".
        const isSparseField = field === 'starRating' || field === 'dividendAmount';
        const isInvalid = (v) => {
            if (v === null || v === undefined || isNaN(Number(v))) return true;
            if (isSparseField && Number(v) === 0) return true;
            return false;
        };

        const badA = isInvalid(valA);
        const badB = isInvalid(valB);

        if (badA && !badB) return 1;  // A is missing -> push to bottom
        if (!badA && badB) return -1; // B is missing -> push to bottom
        if (badA && badB) return 0;   // Both missing -> keep order

        const numA = Number(valA);
        const numB = Number(valB);

        return direction === 'asc' ? numA - numB : numB - numA;
    });

    return { mergedData, summaryMetrics };
}

/**
 * Calculates portfolio summary metrics from processed share data.
 * @param {Array} processedShares - Array of processed share objects (with value, costBasis, dayChangeValue).
 * @returns {Object} { totalValue, dayChangeValue, dayChangePercent, totalCost, totalReturn, totalReturnPercent }
 */
export function calculatePortfolioTotals(processedShares) {
    if (!processedShares || processedShares.length === 0) {
        return {
            totalValue: 0,
            dayChangeValue: 0,
            dayChangePercent: 0,
            totalCost: 0,
            totalReturn: 0,
            totalReturnPercent: 0
        };
    }

    let totalValue = 0;
    let totalCost = 0;
    let totalDailyPnL = 0;
    let dayGain = 0;
    let dayLoss = 0;
    let previousTotalValue = 0;

    for (const share of processedShares) {
        totalValue += share.value || 0;
        totalCost += share.costBasis || 0;
        const dailyChange = share.dayChangeValue || 0;
        totalDailyPnL += dailyChange;

        if (dailyChange > 0) {
            dayGain += dailyChange;
        } else {
            dayLoss += dailyChange;
        }

        // precise previous value reconstruction for accurate %
        // current = prev * (1 + pct) -> prev = current / (1 + pct)
        // But we already have dayChangeValue = current - prev -> prev = current - change
        previousTotalValue += (share.value - dailyChange);
    }

    // Total Daily Percent = (Total Daily PnL / Previous Total Value) * 100
    // Fix: If previous value is 0 (new portfolio), change is 0% or infinite? 
    // Usually 0% if no history, but if it grew from 0 it's technically infinite. 
    // Logic: If previousTotalValue is roughly 0, handle gracefully.
    const totalDailyPercent = Math.abs(previousTotalValue) > 0.01
        ? (totalDailyPnL / previousTotalValue) * 100
        : 0;

    const totalReturn = totalValue - totalCost;
    const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

    return {
        totalValue,
        dayChangeValue: totalDailyPnL,
        dayGain,
        dayLoss,
        dayChangePercent: totalDailyPercent,
        totalCost,
        totalReturn,
        totalReturnPercent
    };
}

/**
 * Retrieves and processes data for a single share.
 * @param {string} code - The stock code to look up.
 * @param {Array} allShares - List of all user shares.
 * @param {Map} livePrices - Map of live price data.
 * @param {Array} userWatchlists - List of user's custom watchlists (optional).
 * @returns {Object|null} Processed stock object or null if not found.
 */
export function getSingleShareData(code, allShares, livePrices, userWatchlists = []) {
    // 1. Find Primary Share (for base fields)
    const primaryShare = allShares.find(s => s.shareName === code);
    if (!primaryShare) return null;

    // 2. Aggregate Memberships from ALL matching share documents
    const membershipSet = new Set();
    const normalizedCode = String(code || '').toUpperCase();

    // Find all records for this code
    const matchingShares = allShares.filter(s => s.shareName === normalizedCode);

    matchingShares.forEach(s => {
        // Collect from watchlistIds (array) or watchlistId (singular)
        const ids = s.watchlistIds || [];
        if (s.watchlistId) ids.push(s.watchlistId);

        ids.forEach(id => {
            if (id === 'portfolio' || id === 'PORTFOLIO') {
                membershipSet.add('Portfolio');
            } else {
                const wl = userWatchlists.find(w => w.id === id);
                if (wl) membershipSet.add(wl.name);
            }
        });

        // Implicitly in portfolio if it has units
        if ((parseInt(s.portfolioShares) || 0) > 0) {
            membershipSet.add('Portfolio');
        }
    });

    // 3. Fallback: Check each Watchlist's stocks array (Fallback/Parallel Logic)
    if (userWatchlists && Array.isArray(userWatchlists)) {
        userWatchlists.forEach(w => {
            if (w.stocks && Array.isArray(w.stocks)) {
                // Check if any of our matching share document IDs are in this watchlist's array
                // OR if the code itself is in the array
                const hasMatch = matchingShares.some(s => w.stocks.includes(s.id)) || w.stocks.includes(normalizedCode);
                if (hasMatch) {
                    membershipSet.add(w.name);
                }
            }
        });
    }

    // 4. Lookup Price
    const lookupKey = normalizedCode;
    let priceData = livePrices.get(lookupKey);

    // Fallback: Try appending .AX if not found
    if (!priceData && !lookupKey.includes('.')) {
        priceData = livePrices.get(lookupKey + '.AX');
    }

    // 5. Process Primary Data (using fields from the first share found)
    const currentPrice = priceData ? priceData.live : (parseFloat(primaryShare.enteredPrice) || 0);
    const dayChangePercent = priceData ? priceData.pctChange : 0;
    const units = matchingShares.reduce((acc, s) => acc + (parseInt(s.portfolioShares) || 0), 0);
    const value = units * currentPrice;

    // Derived Calculations using aggregated units
    const costPrice = parseFloat(primaryShare.buyPrice) ||
        parseFloat(primaryShare.portfolioAvgPrice) ||
        parseFloat(primaryShare.averageCost) ||
        parseFloat(primaryShare.avgCost) ||
        parseFloat(primaryShare.avgPrice) ||
        parseFloat(primaryShare.purchasePrice) ||
        parseFloat(primaryShare.entryPrice) ||
        parseFloat(primaryShare.enteredPrice) || 0;

    const enteredPrice = parseFloat(primaryShare.entryPrice) ||
        parseFloat(primaryShare.enteredPrice) ||
        parseFloat(primaryShare.buyPrice) ||
        costPrice || 0;
    const costBasis = matchingShares.reduce((acc, s) => {
        const u = parseInt(s.portfolioShares) || 0;
        const cp = parseFloat(s.buyPrice) ||
            parseFloat(s.portfolioAvgPrice) ||
            parseFloat(s.averageCost) ||
            parseFloat(s.avgCost) ||
            parseFloat(s.avgPrice) ||
            parseFloat(s.purchasePrice) ||
            costPrice;
        return acc + (u * cp);
    }, 0);

    const capitalGain = value - costBasis;
    const dayChangeValue = priceData && priceData.change ? priceData.change * units : 0;

    // Sort for consistency
    const watchlistNames = Array.from(membershipSet).sort();

    // 6. Return Merged Object
    return {
        ...primaryShare,
        code: normalizedCode,
        name: priceData ? priceData.name : (primaryShare.shareName || ''),
        currentPrice: currentPrice,
        dayChangePercent: dayChangePercent,
        dayChangePerShare: priceData ? priceData.change : 0,
        dayChangeValue: dayChangeValue,
        units: units,
        value: value,
        costBasis: costBasis,
        costPrice: costPrice,
        enteredPrice: enteredPrice,
        capitalGain: capitalGain,
        capitalGainPercent: costBasis !== 0 ? (capitalGain / costBasis) * 100 : 0,
        comments: normalizeComments(primaryShare.comments),
        watchlistNames: watchlistNames,
        high: priceData ? priceData.high : 0,
        low: priceData ? priceData.low : 0,
        pe: priceData ? priceData.pe : 0,
        live: priceData ? priceData.live : currentPrice,
        change: priceData ? priceData.change : 0,
        pctChange: priceData ? priceData.pctChange : dayChangePercent,
        sector: priceData ? priceData.sector : (primaryShare.sector || ''),
        industry: priceData ? priceData.industry : (primaryShare.industry || '')
    };
}

/**
 * Generates status objects for a list of codes based on live price data.
 * @param {Array<string>} codes - List of stock codes.
 * @param {Map} livePrices - Live price map.
 * @returns {Array<Object>} Array of { code, status: 'up'|'down'|'neutral' }
 */
export function getASXCodesStatus(codes, livePrices) {
    return codes.map(code => {
        const lookupKey = String(code).trim().toUpperCase();
        let priceData = livePrices.get(lookupKey);

        // Fallback
        if (!priceData && !lookupKey.includes('.')) {
            priceData = livePrices.get(lookupKey + '.AX');
        }

        let status = 'neutral';

        if (priceData) {
            const pct = parseFloat(priceData.pctChange) || 0;
            if (pct > 0) status = 'up';
            if (pct < 0) status = 'down';
        }

        return { code, status };
    });
}
