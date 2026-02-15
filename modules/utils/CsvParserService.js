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

        // Improved CSV Split: Handles escaped quotes within quoted strings
        const result = [];
        let cur = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = line[i + 1];

            if (char === '"') {
                if (inQuote && next === '"') {
                    // Escaped quote
                    cur += '"';
                    i++;
                } else {
                    inQuote = !inQuote;
                }
            } else if (char === delimiter && !inQuote) {
                result.push(cur.trim().replace(/^"|"$/g, ''));
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur.trim().replace(/^"|"$/g, ''));
        return result.map(v => v.replace(/,/g, '')); // Strip commas for numeric parsing later
    },

    parseSharesightTrades(csvText) {
        if (!csvText) return { headers: [], rows: [] };

        const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 1) return { headers: [], rows: [] };

        // --- FLEXIBLE HEADER MAPPING ---
        const COLUMN_MAP = {
            code: ['code', 'symbol', 'ticker', 'share', 'stock', 'instrument'],
            name: ['name', 'company', 'description', 'label'],
            market: ['market', 'exchange', 'exch'],
            date: ['date', 'purchase date', 'trade date', 'transaction date', 'dt', 'time'],
            type: ['type', 'transaction type', 'action', 'direction', 'side'],
            quantity: ['quantity', 'qty', 'units', 'shares', 'number', 'no.', 'vol', 'volume', 'units held'],
            price: ['price', 'buy price', 'cost', 'cost base', 'avg price', 'rate', 'unit price', 'amount', 'average cost price'],
            total: ['total', 'value', 'market value', 'market', 'balance'],
            url: ['url', 'link', 'sharesight url', 'sharesight link'],
            ssid: ['sharesight code', 'sharesight id', 'ssid'],
            brokerage: ['brokerage', 'fee', 'commission'],
            rating: ['rating', 'star rating', 'score'],
            target: ['target price', 'target', 'goal price'],
            strategy: ['strategy', 'buy sell'],
            direction: ['direction', 'above below', 'target direction'],
            dividend: ['dividend amount', 'dividend', 'div amount'],
            franking: ['franking credits', 'franking', 'credits'],
            notes: ['notes', 'comments', 'remarks']
        };

        // Helper to normalize a header string
        const normalize = (h) => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/[\s\._-]/g, ' ');

        // 1. FIND BEST HEADER ROW
        let headerIndex = -1;
        let delimiter = null;
        let bestScore = 0;
        let bestMap = null;

        // Scan first 20 lines for a potential header
        for (let i = 0; i < Math.min(lines.length, 20); i++) {
            const line = lines[i];
            const testDelimiters = [',', '\t', ';', '|']; // Support more delimiters

            for (const d of testDelimiters) {
                if (!line.includes(d) && testDelimiters.length > 1 && line.includes(',')) continue; // optimization

                const cols = this._splitLine(line, d).map(normalize);

                // Score this row based on how many expected columns it contains
                let score = 0;
                let currentMap = {};

                Object.keys(COLUMN_MAP).forEach(key => {
                    const foundIndex = cols.findIndex(c => COLUMN_MAP[key].some(variation => c === variation || c.includes(variation)));
                    if (foundIndex !== -1) {
                        score++;
                        currentMap[key] = foundIndex; // Store index for direct access later
                    }
                });

                // Critical: Must have at least Code and (Quantity OR Price) to be useful
                if (currentMap.code !== undefined && (currentMap.quantity !== undefined || currentMap.price !== undefined)) {
                    if (score > bestScore) {
                        bestScore = score;
                        headerIndex = i;
                        delimiter = d;
                        bestMap = currentMap;
                    }
                }
            }
        }

        if (headerIndex === -1 || !delimiter) {
            console.warn('[CsvParserService] No valid header row found with flexible matching.');
            return { headers: [], rows: [], type: null };
        }

        // 2. DETERMINE TYPE
        // Heuristic: If we have Quantity but NO Date, it's likely a HOLDINGS / Performance snapshot.
        let reportType = 'TRADES';
        if (bestMap.quantity !== undefined && bestMap.date === undefined) {
            reportType = 'HOLDINGS';
        }
        const rawHeaders = this._splitLine(lines[headerIndex], delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

        // 3. PARSE ROWS USING MAP
        const dataRows = lines.slice(headerIndex + 1).map(line => {
            const values = this._splitLine(line, delimiter);
            if (values.length < 2) return null;

            const row = {};

            // Map the found columns to standard internal names (Code, Date, Type, Quantity, Price, etc.)
            // We basically project the CSV columns into our expected schema

            if (bestMap.code !== undefined) row['Code'] = values[bestMap.code];
            if (bestMap.date !== undefined) row['Date'] = values[bestMap.date];
            if (bestMap.type !== undefined) row['Type'] = values[bestMap.type];
            if (bestMap.quantity !== undefined) row['Quantity'] = values[bestMap.quantity];
            if (bestMap.price !== undefined) row['Price'] = values[bestMap.price];
            if (bestMap.total !== undefined) row['Market Value'] = values[bestMap.total];

            // Extended Fields
            if (bestMap.ssid !== undefined) row['ShareSight Code'] = values[bestMap.ssid];
            if (bestMap.brokerage !== undefined) row['Brokerage'] = values[bestMap.brokerage];
            if (bestMap.rating !== undefined) row['Rating'] = values[bestMap.rating];
            if (bestMap.target !== undefined) row['Target Price'] = values[bestMap.target];
            if (bestMap.strategy !== undefined) row['Strategy'] = values[bestMap.strategy];
            if (bestMap.direction !== undefined) row['Direction'] = values[bestMap.direction];
            if (bestMap.dividend !== undefined) row['Dividend Amount'] = values[bestMap.dividend];
            if (bestMap.franking !== undefined) row['Franking Credits'] = values[bestMap.franking];
            if (bestMap.notes !== undefined) row['Notes'] = values[bestMap.notes];

            // Sharesight URL Extraction (Legacy SSID source fallback)
            if (!row['ShareSight Code'] && bestMap.url !== undefined) {
                const urlVal = values[bestMap.url];
                if (urlVal) {
                    const match = urlVal.match(/\/holdings\/(\d+)/) || urlVal.match(/(\d+)$/);
                    if (match) row['ShareSight Code'] = match[1];
                }
            }

            // Also keep original headers just in case other logic needs them (fallback)
            rawHeaders.forEach((h, i) => {
                if (values[i] !== undefined) row[h] = values[i];
            });

            return row;
        }).filter(row => {
            if (!row) return false;
            const code = String(row['Code'] || '').trim().toUpperCase();
            // Filter junk lines
            return code && code.length > 1 && code !== 'TOTAL' && !code.startsWith('SHARE PRICES');
        });

        return { headers: rawHeaders, rows: dataRows, type: reportType };
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
            const type = row['Type']; // Might be undefined now
            const dateStr = row['Date'];

            if (!code) return; // Need at least a code

            // If Type is present, check against known list. If NO Type is present, assume it's a simple list and check for positive integer quantity later.
            if (type && !PURCHASE_TYPES.some(t => t.toLowerCase() === type.toLowerCase()) && !type.toLowerCase().includes('buy')) {
                // It's a type column, but NOT a buy type (e.g. Sell). Skip.
                // UNLESS it's just a generic "Purchase" or similar that we missed. 
                // Flexible Match:
                const isSell = ['sell', 'sales', 'disposal'].some(s => type.toLowerCase().includes(s));
                if (isSell) return;
            }

            // Normalization for date
            let date;
            if (dateStr) {
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/').map(Number);
                    if (parts[0] > 1900) date = new Date(parts[0], parts[1] - 1, parts[2]); // YYYY/MM/DD
                    else date = new Date(parts[2], parts[1] - 1, parts[0]); // DD/MM/YYYY
                } else {
                    date = new Date(dateStr);
                }
            } else {
                // No date? Maybe just default to now or skip date logic?
                // The prompt was "flaky uploads". If date is missing, we should probably still accept the Qty/Price update.
                date = new Date(0); // Epoch
            }

            if (isNaN(date.getTime())) date = new Date(0);

            // Standardize column names (Cost base might be missing currency suffix, or using Template 'Buy Price')
            const quantity = parseFloat(String(row['Quantity'] || '0').replace(/[^\d\.]/g, ''));

            // Try all price fields with priority
            const priceVal = row['Price'] || row['Buy Price'] || row['Unit Price'] || row['Cost base per share (AUD)'] || row['Cost'] || '0';
            const price = parseFloat(String(priceVal).replace(/[^\d\.]/g, ''));
            const costBase = price;

            if (isNaN(quantity) || quantity <= 0) return; // flexible logic: only positive quantities update "purchases"

            // Logic: prefer latest date, OR if date is tied/missing, just take the last one in the file (often latest)
            if (!latest.has(code) || date >= latest.get(code).date) {
                latest.set(code, {
                    code,
                    date,
                    dateStr: dateStr || '',
                    type: type || 'Buy',
                    quantity,
                    price,
                    price,
                    costBase,
                    shareSightCode: row['ShareSight Code'] || '',
                    brokerage: row['Brokerage'] || '',
                    rating: row['Rating'] || '',
                    targetPrice: row['Target Price'] || '',
                    buySell: row['Strategy'] || 'buy',
                    targetDirection: row['Direction'] || 'below',
                    dividendAmount: row['Dividend Amount'] || '',
                    frankingCredits: row['Franking Credits'] || '',
                    notes: row['Notes'] || ''
                });
            } else {
                // UPDATE EXISTING ENTRY if new one has data we want (like code)
                const existing = latest.get(code);
                if (!existing.shareSightCode && row['ShareSight Code']) {
                    existing.shareSightCode = row['ShareSight Code'];
                }
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
            const quantityStr = row['Quantity']; // now normalized

            if (!code || quantityStr === undefined) return;

            const quantity = parseFloat(String(quantityStr).replace(/,/g, ''));
            if (isNaN(quantity)) return;

            holdings.set(code, {
                code,
                quantity,
                shareSightCode: row['ShareSight Code'] || '',
                brokerage: row['Brokerage'] || '',
                rating: row['Rating'] || '',
                targetPrice: row['Target Price'] || '',
                buySell: row['Strategy'] || 'buy',
                targetDirection: row['Direction'] || 'below',
                dividendAmount: row['Dividend Amount'] || '',
                frankingCredits: row['Franking Credits'] || '',
                notes: row['Notes'] || '',
                isHoldingsOnly: true // Flag to indicate no price/date data
            });
        });

        return holdings;
    }
};
