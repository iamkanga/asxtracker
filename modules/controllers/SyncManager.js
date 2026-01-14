import { AppState } from '../state/AppState.js';
import { CsvParserService } from '../utils/CsvParserService.js';
import { PORTFOLIO_ID } from '../utils/AppConstants.js';
import { userStore } from '../data/DataService.js';

/**
 * SyncManager.js
 * Handles cross-referencing CSV data with the user's active portfolio.
 */
export const SyncManager = {
    /**
     * Compares parsed CSV data against the current Portfolio watchlist.
     * @param {string} csvText 
     * @returns {Object} { matches: Object[], ignored: string[] }
     */
    simulateSync(csvText) {
        const { rows, type: reportType } = CsvParserService.parseSharesightTrades(csvText);

        // 1. Determine Mode Based on Detected Type
        let syncData;
        if (reportType === 'HOLDINGS') {
            console.log('[SyncManager] Holdings Report detected. Updating Quantities Only.');
            syncData = CsvParserService.getHoldingsData(rows);
        } else {
            console.log('[SyncManager] Trades Report detected. Updating Full Trade Data.');
            syncData = CsvParserService.getLatestPurchases(rows);
        }

        // 2. Search across ALL shares in AppState (not just Portfolio)
        const allShares = AppState.data.shares || [];
        console.log(`[SyncManager] Searching across ${allShares.length} total user shares for matches.`);

        const matches = [];
        const ignored = []; // Array of { code, reason }
        const newShares = [];

        syncData.forEach((data, csvCode) => {
            if (!csvCode) return;
            // Normalize CSV code (Strip ASX: or .AX)
            const cleanCsvCode = csvCode.toUpperCase().replace(/^ASX:|\.AX$/g, '').trim();

            if (!cleanCsvCode || cleanCsvCode.length < 2) {
                ignored.push({ code: csvCode, reason: 'Invalid or missing code' });
                return;
            }

            if (data.quantity <= 0) {
                ignored.push({ code: cleanCsvCode, reason: 'Zero or negative quantity' });
                return;
            }

            const shareRecord = allShares.find(s => {
                // Check every possible "code" property in the user's record
                const candidates = [
                    s.shareName,
                    s.code,
                    s.shareCode,
                    s.symbol
                ].filter(Boolean).map(c => String(c).toUpperCase().replace(/^ASX:|\.AX$/g, '').trim());

                return candidates.includes(cleanCsvCode);
            });

            if (shareRecord) {
                matches.push({
                    ...data,
                    shareId: shareRecord.id
                });
            } else {
                // Check if it's a valid ASX-like code (optional but good for filtering true junk)
                // For now, we assume if it got past the basic check, it's a potential new share.
                newShares.push({
                    ...data,
                    code: cleanCsvCode,
                    isNew: true
                });
            }
        });

        console.log(`[SyncManager] Simulation Result: ${matches.length} Matches, ${newShares.length} New, ${ignored.length} Ignored.`);
        return { matches, newShares, ignored, reportType };
    }
};
