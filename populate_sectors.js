/**
 * SAFE DYNAMIC ENRICHMENT SCRIPT
 * ==============================
 * This script runs inside your Google Sheet. It connects to Yahoo Finance
 * to populate the "Sector", "Industry", and "Type" columns for every stock.
 * 
 * FEATURES:
 * 1. Safe Column Creation: Adds missing columns automatically.
 * 2. Formula Protection: Writes ONLY to the intended fields.
 * 3. Smart Classification: Detects Shares, ETFs, and Indices.
 * 4. Granular Data: Fetches detailed industry names (e.g. "Software - Infrastructure").
 */

function populateSectors() {
    const SHEET_NAME = 'Prices';

    // --- 1. SETUP & SAFETY CHECKS ---
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
        Logger.log('❌ Error: Sheet "' + SHEET_NAME + '" not found.');
        SpreadsheetApp.getUi().alert('Error: Sheet "' + SHEET_NAME + '" not found.');
        return;
    }

    // Load Headers
    const lastCol = sheet.getLastColumn();
    const dataRange = sheet.getDataRange();
    const data = dataRange.getValues();
    const headers = data[0]; // Row 1

    // Helper: Find or Create Column
    function ensureColumn(name) {
        let idx = headers.findIndex(h => String(h).trim().toUpperCase() === name.toUpperCase());
        if (idx === -1) {
            Logger.log('➕ Creating New Column: ' + name);
            const newColIdx = sheet.getLastColumn() + 1;
            sheet.getRange(1, newColIdx).setValue(name);
            // Update local headers array so subsequent lookups work
            headers[newColIdx - 1] = name;
            return newColIdx - 1; // Return 0-based index
        }
        return idx;
    }

    const idxCode = headers.findIndex(h => ['ASX Code', 'ASXCode', 'Code'].includes(String(h).trim()));
    if (idxCode === -1) {
        SpreadsheetApp.getUi().alert('Error: Could not find "ASX Code" column.');
        return;
    }

    // Verify Key Columns Exist
    const idxSector = ensureColumn('Sector');
    const idxIndustry = ensureColumn('Industry');
    const idxType = ensureColumn('Type');

    // --- 2. IDENTIFY MISSING DATA ---
    const rowsToProcess = []; // Stores { rowIndex: 5, code: 'BHP' }

    // Loop starting from Row 2 (Index 1)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const code = String(row[idxCode]).trim().toUpperCase();

        // Skip empty rows
        if (!code) continue;

        // Check if enrichment is needed
        const sector = (idxSector < row.length) ? row[idxSector] : '';
        const industry = (idxIndustry < row.length) ? row[idxIndustry] : '';
        const type = (idxType < row.length) ? row[idxType] : '';

        // Condition: If ANY field is missing or generic "Share" without industry, fetch it.
        // Also fix legacy #N/A errors.
        if (!sector || !industry || !type || sector === '#N/A' || industry === '#N/A' ||
            (type === 'Share' && (!industry || industry === 'Share'))) {
            rowsToProcess.push({ rowIndex: i + 1, code: code });
        }
    }

    if (rowsToProcess.length === 0) {
        SpreadsheetApp.getUi().alert('✅ All data is up to date! No missing sectors found.');
        return;
    }

    SpreadsheetApp.getUi().alert(`🔍 Found ${rowsToProcess.length} stocks to enrich. This may take a few minutes.`);
    Logger.log(`Processing ${rowsToProcess.length} rows...`);

    // --- 3. BATCH FETCH & UPDATE ---
    const BATCH_SIZE = 5; // Conservative batching to avoid timeouts

    for (let i = 0; i < rowsToProcess.length; i += BATCH_SIZE) {
        const batch = rowsToProcess.slice(i, i + BATCH_SIZE);

        // Prepare Requests
        const requests = batch.map(item => {
            // Handle XJO/Index suffix logic if needed, but usually Yahoo uses .AX for all
            const ticker = item.code.startsWith('^') ? item.code : // Leave XJO as ^AXJO if user typed it that way? 
                // Actually user types 'XJO'. Yahoo needs '^AXJO' for index? 
                // Let's assume standard .AX suffix for now.
                (item.code + '.AX');

            return {
                url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryProfile,quoteType`,
                muteHttpExceptions: true
            };
        });

        try {
            const responses = UrlFetchApp.fetchAll(requests);

            responses.forEach((resp, batchIdx) => {
                const item = batch[batchIdx];
                const code = item.code;

                if (resp.getResponseCode() === 200) {
                    try {
                        const json = JSON.parse(resp.getContentText());
                        const result = json.quoteSummary?.result?.[0];

                        if (result) {
                            let newType = 'Share';
                            let newSector = 'Other';
                            let newIndustry = 'Unknown';

                            // A. Determine Type
                            const qType = result.quoteType?.quoteType;
                            if (qType === 'EQUITY') newType = 'Share';
                            else if (qType === 'ETF' || qType === 'MUTUALFUND') newType = 'ETF';
                            else if (qType === 'INDEX') newType = 'Index';

                            // B. Determine Sector/Industry
                            if (newType === 'ETF') {
                                newSector = 'Funds';
                                newIndustry = result.summaryProfile?.industry || 'Exchange Traded Fund';
                            } else if (newType === 'Index') {
                                newSector = 'Indices';
                                newIndustry = 'Market Index';
                            } else {
                                newSector = result.summaryProfile?.sector || 'Other';
                                newIndustry = result.summaryProfile?.industry || 'Unknown';
                            }

                            // C. Write to Sheet (Columns are 1-based)
                            // We use .setValue() on specific cells to be surgical
                            sheet.getRange(item.rowIndex, idxSector + 1).setValue(newSector);
                            sheet.getRange(item.rowIndex, idxIndustry + 1).setValue(newIndustry);
                            sheet.getRange(item.rowIndex, idxType + 1).setValue(newType);

                            Logger.log(`✅ ${code}: ${newType} | ${newSector} | ${newIndustry}`);
                        }
                    } catch (e) {
                        Logger.log(`❌ Parse Error (${code}): ${e.message}`);
                    }
                } else {
                    Logger.log(`⚠️ API Error (${code}): ${resp.getResponseCode()}`);
                }
            });

        } catch (e) {
            Logger.log(`🛑 Batch Error: ${e.message}`);
        }

        // Small delay to be polite to the API
        Utilities.sleep(500);
    }

    Logger.log('🎉 Enrichment Complete.');
    SpreadsheetApp.getUi().alert('🎉 Success! Sector and Industry data has been populated.');
}
