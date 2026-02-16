
// Mocking the Global Alerts Logic

// Current getVal implementation
const getVal = (v, def) => (v !== null && v !== undefined) ? Number(v) : def;

// Mock User Prefs (User wants NO percent threshold, only Dollar)
// In Firestore, "No Percent Threshold" might be stored as null.
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

console.log(`[Config] Up Threshold: ${upThresh}% (Should be null/disabled)`);
console.log(`[Config] Up Dollar: $${upDollar}`);

// Simulation
const stock = {
    pctChange: 2.0, // 2% move (Should NOT trigger if default is 3%, but if user Disabled it, strict logic might be tricky)
    // Wait, if user Disabled it, they don't want to filter by it? 
    // No, "Disabled" means "Don't use this as a trigger". 
    // Use ONLY Dollar.
    // If Trigger is OR (Percent OR Dollar):
    // If Percent is OFF, we rely on Dollar.
    // If stock moves 2% and $1.50 -> Should trigger via Dollar.
    // If stock moves 4% and $0.50 -> 
    //    If Percent is OFF -> Should NOT trigger.
    //    If Percent defaults to 3% -> Triggers. (BUG)
    change: 0.50  // $0.50 move
};

const absChange = Math.abs(stock.change);
const pctChange = stock.pctChange;

let isHit = false;
let reason = "";

// Logic from global-alerts.gs
if (pctChange >= upThresh) {
    isHit = true;
    reason = 'Scanner: %';
}
else if (absChange >= upDollar) {
    isHit = true;
    reason = 'Scanner: $';
}

console.log(`Stock: 2% / $0.50`);
console.log(`Result: ${isHit ? 'TRIGGERED' : 'IGNORED'}`);
console.log(`Reason: ${reason}`);

if (isHit && reason === 'Scanner: %') {
    console.log("FAIL: Triggered on % despite user setting it to null (Disabled).");
} else {
    console.log("PASS: Correctly ignored.");
}
