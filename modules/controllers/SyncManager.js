import { AppState } from '../state/AppState.js';
import { CsvParserService } from '../utils/CsvParserService.js';
import { PORTFOLIO_ID } from '../utils/AppConstants.js';
import { UserStore } from '../data/UserStore.js';

const userStore = new UserStore();

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

        // Get all codes currently in the "Portfolio" using the standard filter logic
        const allShares = AppState.data.shares || [];
        const portfolioShares = userStore.getWatchlistData(allShares, PORTFOLIO_ID);

        console.log(`[SyncManager] Portfolio contains ${portfolioShares.length} items for matching.`);
        if (portfolioShares.length > 0) {
            console.log(`[SyncManager] Portfolio Sample (first 3):`, portfolioShares.slice(0, 3).map(s => ({
                code: s.code || 'N/A',
                shareName: s.shareName || 'N/A',
                symbol: s.symbol || 'N/A'
            })));
        }


        const matches = [];
        const ignored = [];

        syncData.forEach((data, csvCode) => {
            if (!csvCode) return;
            // Normalize CSV code (Strip ASX: or .AX)
            const cleanCsvCode = csvCode.toUpperCase().replace(/^ASX:|\.AX$/g, '').trim();

            const shareRecord = portfolioShares.find(s => {
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
                ignored.push(csvCode);
            }
        });

        console.log(`[SyncManager] Simulation Result: ${matches.length} Matches, ${ignored.length} Ignored.`);
        return { matches, ignored };
    }
};
