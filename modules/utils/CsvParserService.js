/**
 * CsvParserService.js
 * Utility to parse Sharesight "All Trades" CSV data client-side.
 */
export const CsvParserService = {
    /**
     * Helper to split a CSV/TSV line correctly, handling quoted values.
     */
    _splitLine(line, delimiter) {
        if (delimiter === '\t') return line.split('\t').map(v => v.trim().replace(/^"|"$/g, ''));

        // CSV Regex: Matches either a quoted string or a non-comma string
        const regex = /(".*?"|[^,]+|(?<=,)(?=,)|(?<=^)(?=,)|(?<=,)(?=$))/g;
        const matches = line.match(regex) || [];
        return matches.map(v => v.trim().replace(/^"|"$/g, '').replace(/,/g, ''));
    },

    parseSharesightTrades(csvText) {
        if (!csvText) return { headers: [], rows: [] };

        const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) return { headers: [], rows: [] };

        // 1. FIND HEADER ROW
        let headerIndex = -1;
        let delimiter = null;

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const line = lines[i];
            const testDelimiter = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : null);
            if (!testDelimiter) continue;

            const cols = line.split(testDelimiter).map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());

            const isTrades = cols.includes('code') && (cols.includes('date') || cols.includes('type'));
            const isHoldings = cols.includes('code') && cols.includes('quantity') && cols.includes('market');

            if (isTrades || isHoldings) {
                headerIndex = i;
                delimiter = testDelimiter;
                break;
            }
        }

        if (headerIndex === -1 || !delimiter) {
            console.warn('[CsvParserService] Header row not found.');
            return { headers: [], rows: [], type: null };
        }

        const reportType = lines[headerIndex].toLowerCase().includes('quantity') && lines[headerIndex].toLowerCase().includes('market') ? 'HOLDINGS' : 'TRADES';

        const headers = lines[headerIndex].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        const dataRows = lines.slice(headerIndex + 1).map(line => {
            const values = this._splitLine(line, delimiter);
            const row = {};
            headers.forEach((header, i) => {
                if (header) row[header] = values[i] || '';
            });
            return row;
        }).filter(row => {
            // Basic sanity check: Must have a code and it shouldn't be "Total"
            const code = String(row['Code'] || '').trim().toUpperCase();
            return code && code !== 'TOTAL' && code !== 'MARKET' && !code.startsWith('SHARE PRICES');
        });


        return { headers, rows: dataRows, type: reportType };
    },

    /**
     * Filters and reduces trades to find the latest "Purchase" date for each stock.
     */
    getLatestPurchases(rows) {
        const latest = new Map();
        if (!rows.length) return latest;

        // Transaction types that count as an "active" entry/purchase
        const PURCHASE_TYPES = ['Buy', 'DRRP', 'DRP', 'Dividend Reinvestment', 'Opening Balance', 'Bonus', 'Merge (Buy)'];



        rows.forEach((row, index) => {
            const code = row['Code'];
            const type = row['Type'];
            const dateStr = row['Date'];

            if (!code || !dateStr) {
                if (index < 5) console.warn(`[CsvParserService] Missing Code/Date at row ${index}:`, row);
                return;
            }

            if (!PURCHASE_TYPES.includes(type)) return;

            // Robust Date Parsing (Handles DD/MM/YYYY or YYYY-MM-DD)
            let date;
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/').map(Number);
                if (parts[0] > 1900) { // YYYY/MM/DD
                    date = new Date(parts[0], parts[1] - 1, parts[2]);
                } else { // DD/MM/YYYY
                    date = new Date(parts[2], parts[1] - 1, parts[0]);
                }
            } else {
                date = new Date(dateStr);
            }

            if (isNaN(date.getTime())) {
                console.warn(`[CsvParserService] Invalid date format for code ${code}: ${dateStr}`);
                return;
            }

            // Standardize column names (Cost base might be missing currency suffix, or using Template 'Buy Price')
            const quantity = parseFloat(String(row['Quantity'] || '0').replace(/,/g, ''));
            const price = parseFloat(String(row['Price'] || row['Buy Price'] || row['Unit Price'] || '0').replace(/,/g, ''));
            const costBase = parseFloat(String(row['Cost base per share (AUD)'] || row['Cost base per share'] || row['Buy Price'] || row['Unit Price'] || '0').replace(/,/g, ''));

            if (isNaN(quantity)) return;

            if (!latest.has(code) || date > latest.get(code).date) {
                latest.set(code, {
                    code,
                    date,
                    dateStr,
                    type,
                    quantity,
                    price,
                    costBase
                });
            }
        });


        return latest;
    },

    /**
     * Extracts current holdings (quantities) from a Holdings Report.
     * @param {Object[]} rows 
     * @returns {Map} code -> { code, quantity }
     */
    getHoldingsData(rows) {
        const holdings = new Map();
        if (!rows.length) return holdings;



        rows.forEach((row, index) => {
            const code = row['Code'];
            const quantityStr = row['Quantity'];

            if (!code || quantityStr === undefined) return;

            const quantity = parseFloat(String(quantityStr).replace(/,/g, ''));
            if (isNaN(quantity)) return;

            holdings.set(code, {
                code,
                quantity,
                isHoldingsOnly: true // Flag to indicate no price/date data
            });
        });


        return holdings;
    }
};
