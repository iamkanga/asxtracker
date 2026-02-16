
// Mocking the Global Alerts Logic

// Current getVal implementation (BROKEN)
// const getVal = (v, def) => (v !== null && v !== undefined) ? Number(v) : def;

// PROPOSED FIX for getVal
const getVal = (v, def) => {
    if (v === null) return null; // Explicitly disabled
    if (v === undefined) return def; // Not set, use default
    return Number(v);
};

// Mock User Prefs (User wants NO percent threshold, only Dollar)
const userPrefs = {
    scannerRules: {
        up: { percentThreshold: null, dollarThreshold: 1.0 }, // User explicitly disabled percent
        down: { percentThreshold: null, dollarThreshold: 1.0 }
    }
};

// Logic from global-alerts.gs
const rules = userPrefs.scannerRules;

const upThresh = getVal(rules.up?.percentThreshold, 3.0);
const upDollar = getVal(rules.up?.dollarThreshold, 1.0);

console.log(`[Config] Up Threshold: ${upThresh} (Should be null)`);
console.log(`[Config] Up Dollar: $${upDollar}`);

// Simulation
const stock = {
    pctChange: 5.0, // 5% move
    change: 0.50  // $0.50 move
};

const absChange = Math.abs(stock.change);
const pctChange = stock.pctChange;

let isHit = false;
let reason = "";

// PROPOSED LOGIC FIX
if (upThresh !== null && pctChange >= upThresh) {
    isHit = true;
    reason = 'Scanner: %';
}
else if (upDollar !== null && absChange >= upDollar) {
    isHit = true;
    reason = 'Scanner: $';
}

console.log(`Stock: 5% / $0.50`);
console.log(`Result: ${isHit ? 'TRIGGERED' : 'IGNORED'}`);
console.log(`Reason: ${reason}`);

if (isHit && reason === 'Scanner: %') {
    console.log("FAIL: Triggered on % despite user setting it to null (Disabled).");
} else {
    console.log("PASS: Correctly ignored.");
}
