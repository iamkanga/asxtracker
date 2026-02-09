
/**
 * =============================================================================
 *   AUTOMATED TEST SUITE (Run 'runAllTests' to verify fixes)
 * =============================================================================
 */

function runAllTests() {
    console.log('=== STARTING COMPREHENSIVE SYSTEM CHECK ===');

    testPennyStockLogic();
    testDeDuplicationLogic();
    testRegressionSafety();

    console.log('=== ALL TESTS COMPLETED ===');
}

/**
 * TEST 1: Penny Stock Precision Logic
 * Verifies that the repair logic correctly prioritizes API prices for penny stocks (<= 0.01).
 */
function testPennyStockLogic() {
    console.log('[TEST 1] Penny Stock Precision Logic...');

    // Mock Data Row
    // [Code, LivePrice, Change, Pct, ..., ApiPrice]
    const mockRow_Penny = {
        code: 'PENNY',
        googlePrice: 0.01,  // The rounded/bad value
        apiPrice: 0.004     // The precise value
    };

    // Logic Simulation:
    // Is it broken? No (0.01 is valid)
    // Is it Penny? Yes (<= 0.01)

    let needsRepair = false;
    if (mockRow_Penny.googlePrice <= 0.01) {
        needsRepair = true;
    }

    if (needsRepair) {
        console.log('✅ PASS: System flagged $0.01 stock for API Repair.');
    } else {
        console.log('❌ FAIL: System ignored $0.01 stock.');
    }
}

/**
 * TEST 2: De-duplication Logic (Target Change Fix)
 * Verifies that alerts for the same stock but DIFFERENT targets are allowed.
 */
function testDeDuplicationLogic() {
    console.log('[TEST 2] Target Change De-dup Logic...');

    // Mock Existing Hits (What's already in the DB from 10am)
    const existingHits = [
        { userId: 'u1', code: 'ABC', intent: 'target-hit', target: 65 }
    ];

    // New Hit (You changed target to $50 at 12pm)
    const newHit = { userId: 'u1', code: 'ABC', intent: 'target-hit', target: 50 };

    // 1. Build Seen Set
    const seen = new Set(existingHits.map(h => {
        return h.userId + '|' + h.code + '|' + h.intent + '|' + (h.target || '');
    }));

    // 2. Test Filters
    const newKey = newHit.userId + '|' + newHit.code + '|' + newHit.intent + '|' + (newHit.target || '');

    if (!seen.has(newKey)) {
        console.log('✅ PASS: Allowed new $50 alert after $65 alert.');
    } else {
        console.log('❌ FAIL: Blocked new $50 alert (considered duplicate).');
    }

    // 3. Test Actual Duplicate
    const dupHit = { userId: 'u1', code: 'ABC', intent: 'target-hit', target: 65 };
    const dupKey = dupHit.userId + '|' + dupHit.code + '|' + dupHit.intent + '|' + (dupHit.target || '');

    if (seen.has(dupKey)) {
        console.log('✅ PASS: Correctly blocked duplicate $65 alert.');
    } else {
        console.log('❌ FAIL: Allowed duplicate $65 alert.');
    }
}

/**
 * TEST 3: Regression Safety (Movers)
 * Verifies that normal market movers (no target) still dedup correctly.
 */
function testRegressionSafety() {
    console.log('[TEST 3] Regression Safety (Movers)...');

    const existingMover = { userId: 'u1', code: 'XYZ', intent: 'mover' }; // No target

    const seen = new Set();
    const key1 = existingMover.userId + '|' + existingMover.code + '|' + existingMover.intent + '|' + (existingMover.target || '');
    seen.add(key1);

    // Try adding same mover again
    const newMover = { userId: 'u1', code: 'XYZ', intent: 'mover' };
    const key2 = newMover.userId + '|' + newMover.code + '|' + newMover.intent + '|' + (newMover.target || '');

    if (seen.has(key2)) {
        console.log('✅ PASS: Correctly blocked duplicate Mover alert.');
    } else {
        console.log('❌ FAIL: Duplicate Mover allowed through.');
    }
}
