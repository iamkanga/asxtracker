/**
 * DIAGNOSTIC TOOL: Run this to audit where your 52-week data is coming from.
 * It will log counts and list specific stocks for each data source.
 */
function debug52WeekDataSources() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Prices');
    if (!sheet) { console.log('Prices sheet not found'); return; }

    const values = sheet.getDataRange().getValues();
    const headers = values.shift();
    const map = headers.reduce((acc, h, i) => { acc[String(h).trim()] = i; return acc; }, {});

    // Identifiers
    const codeKey = map['ASX Code'];
    const highKey = map['High52'];
    const lowKey = map['Low52'];
    const liveKey = ['LivePrice', 'Last', 'LastPrice', 'Last Trade', 'LastTrade'].find(k => map[k] != null);

    // API Columns
    const apiHighKey = ['API_High52', 'APIHigh52', 'ApiHigh52', 'APIHIGH', 'PIHIGH'].find(k => map[k] != null);
    const apiLowKey = ['API_Low52', 'APILow52', 'ApiLow52', 'APILOW', 'PILOW'].find(k => map[k] != null);

    if (codeKey == null || highKey == null || lowKey == null || liveKey == null) {
        console.log('Error: Missing core columns for audit.');
        return;
    }

    console.log('--- 52-WEEK DATA SOURCE AUDIT ---');
    console.log('API Columns Found: High=' + (apiHighKey || 'NO') + ', Low=' + (apiLowKey || 'NO'));

    let countGoogle = 0;
    let countAPI = 0;
    let countProxy = 0;
    let countMissing = 0;

    const sampleAPI = [];
    const sampleProxy = [];

    values.forEach(r => {
        const code = r[codeKey];
        if (!code) return;

        const live = parseFloat(r[map[liveKey]]);
        const gHigh = parseFloat(r[highKey]);
        const gLow = parseFloat(r[lowKey]);

        const apiHigh = apiHighKey ? parseFloat(r[map[apiHighKey]]) : NaN;
        const apiLow = apiLowKey ? parseFloat(r[map[apiLowKey]]) : NaN;

        // Logic Audit
        const googleValid = (gHigh > 0 && gLow > 0);
        const apiValid = (apiHigh > 0 && apiLow > 0);

        let source = 'MISSING';

        if (googleValid) {
            source = 'GOOGLE';
            countGoogle++;
        } else if (apiValid) {
            source = 'API_FALLBACK';
            countAPI++;
            sampleAPI.push(code);
        } else if (live > 0) {
            source = 'LIVE_PROXY';
            countProxy++;
            sampleProxy.push(code);
        } else {
            countMissing++;
        }

        // DEBUG: Specific Trace for JHPI
        if (code === 'JHPI') {
            console.log('--- TARGET DUMP: JHPI ---');
            console.log('Sheet Row Raw:', JSON.stringify(r));
            console.log('Live Key:', liveKey, 'Index:', map[liveKey], 'Value:', r[map[liveKey]]);
            console.log('High Key:', highKey, 'Index:', map[highKey], 'Value:', r[highKey]);
            console.log('API High Key:', apiHighKey, 'Index:', map[apiHighKey], 'Value:', apiHighKey ? r[map[apiHighKey]] : 'N/A');
            console.log('API Low Key:', apiLowKey, 'Index:', map[apiLowKey], 'Value:', apiLowKey ? r[map[apiLowKey]] : 'N/A');
            console.log('Parsed - High:', gHigh, 'Low:', gLow);
            console.log('Parsed - API High:', apiHigh, 'API Low:', apiLow);
            console.log('Selected Source:', source);
            console.log('-------------------------');
        }
    });

    console.log(`TOTAL Scanned: ${values.length}`);
    console.log(`SOURCE: Google Finance: ${countGoogle}`);
    console.log(`SOURCE: Yahoo API:      ${countAPI}`);
    console.log(`SOURCE: Live Proxy:     ${countProxy} (Using today's price as high/low)`);
    console.log(`SOURCE: Missing:        ${countMissing}`);

    if (countAPI > 0) console.log('Stocks using API Data (Sample):', sampleAPI.slice(0, 15).join(', '));
    if (countProxy > 0) console.log('Stocks using Live Proxy (Sample):', sampleProxy.slice(0, 15).join(', '));
    console.log('---------------------------------');
}
