/**
 * ONE-CLICK SECTOR POPULATOR
 * ==========================
 * Run this function in the Apps Script Editor to automatically
 * populate the "Sector" column for all your stocks using Yahoo Finance.
 */
function populateSectors() {
    const SHEET_NAME = 'Prices';
    const TARGET_COL_NAME = 'Sector';

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) { Logger.log('❌ Error: Sheet "Prices" not found'); return; }

    Logger.log('--- STARTING SECTOR POPULATION ---');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // 1. Find or Create "Sector" Column
    let sectorIdx = headers.findIndex(h => String(h).trim().toUpperCase() === TARGET_COL_NAME.toUpperCase());
    if (sectorIdx === -1) {
        Logger.log('➕ Creating "Sector" column...');
        const lastCol = sheet.getLastColumn();
        sheet.getRange(1, lastCol + 1).setValue(TARGET_COL_NAME);
        sectorIdx = lastCol; // Index is 0-based, so lastCol is the new index (since length = lastCol)
        SpreadsheetApp.flush(); // Commit structure change
    } else {
        Logger.log('✅ Found "Sector" column at index ' + sectorIdx);
    }

    const codeIdx = headers.findIndex(h => ['ASX Code', 'ASXCode', 'Code'].includes(String(h).trim()));
    if (codeIdx === -1) { Logger.log('❌ Error: Could not find "ASX Code" column.'); return; }

    const rowsToUpdate = [];

    // 2. Scan Rows
    for (let i = 1; i < data.length; i++) {
        const code = String(data[i][codeIdx]).trim().toUpperCase();
        const currentSector = (sectorIdx < data[i].length) ? String(data[i][sectorIdx]).trim() : '';

        // Only fetch if empty
        if (code && (!currentSector || currentSector === '#N/A')) {
            rowsToUpdate.push({ row: i + 1, code: code });
        }
    }

    if (rowsToUpdate.length === 0) {
        Logger.log('✅ All sectors are already populated. Nothing to do.');
        return;
    }

    Logger.log('🔍 Found ' + rowsToUpdate.length + ' rows needing sectors. Fetching...');

    // 3. Batched Fetch (Yahoo URL)
    // Yahoo QuoteSummary V10 is needed for Sector (Profile)
    const BATCH_SIZE = 5; // Small batch to be polite
    const SAFE_LIMIT = 500; // Max updates per run to prevent quota blowout

    if (rowsToUpdate.length > SAFE_LIMIT) {
        Logger.log(`⚠️ Limit Reached: Only processing first ${SAFE_LIMIT} of ${rowsToUpdate.length} rows to save quota.`);
        // We slice the array to just the safe limit
        rowsToUpdate.length = SAFE_LIMIT;
    }

    for (let i = 0; i < rowsToUpdate.length; i += BATCH_SIZE) {
        const batch = rowsToUpdate.slice(i, i + BATCH_SIZE);

        // Yahoo V10 doesn't support bulk comma-separated for this module well, 
        // or requires complex structure. We will do parallel fetch using UrlFetchApp.fetchAll.

        const requests = batch.map(item => {
            // Ensure .AX suffix
            const ticker = item.code.endsWith('.AX') ? item.code : item.code + '.AX';
            return {
                url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryProfile`,
                muteHttpExceptions: true
            };
        });

        try {
            const responses = UrlFetchApp.fetchAll(requests);

            responses.forEach((resp, idx) => {
                const item = batch[idx];
                const status = resp.getResponseCode();
                let sector = '';

                if (status === 200) {
                    try {
                        const json = JSON.parse(resp.getContentText());
                        const profile = json.quoteSummary?.result?.[0]?.summaryProfile;
                        if (profile && profile.sector) {
                            sector = profile.sector;
                        } else {
                            // Fallback: Try "ETF" detection or "Fund"
                            // Some ETFs don't have standard sectors.
                            sector = 'Other';
                        }
                    } catch (e) {
                        // JSON parse error
                    }
                }

                if (sector) {
                    // Write immediately (or cache for bulk write if speed needed, but direct is safer for visibility)
                    sheet.getRange(item.row, sectorIdx + 1).setValue(sector);
                    Logger.log(`✅ [${item.code}] -> ${sector}`);
                } else {
                    Logger.log(`⚠️ [${item.code}] -> Not Found`);
                    sheet.getRange(item.row, sectorIdx + 1).setValue('Unknown');
                }
            });

        } catch (e) {
            const msg = String(e.message);
            if (msg.includes('Service invoked too many times') || msg.includes('Quota')) {
                Logger.log('🚨 DAILY QUOTA EXCEEDED 🚨');
                Logger.log('Google limits UrlFetch calls per day. Please STOP and resume tomorrow.');
                Logger.log(`Progress: Processed up to row ${batch[0].row} before stopping.`);
                break; // STOP THE LOOP
            }
            Logger.log('❌ Batch fetch failed: ' + msg);
        }

        // Rate Limiting Politeness
        Utilities.sleep(1000);
    }

    Logger.log('🎉 Sector population complete.');
}
