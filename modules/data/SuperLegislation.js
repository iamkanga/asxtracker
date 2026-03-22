/**
 * SuperLegislation.js
 * Pure-function module containing all Australian superannuation regulation logic.
 * Data-driven — no hard-coded yearly caps in core functions.
 *
 * References:
 * - ATO Minimum Pension Drawdown Rates
 * - SIS Regulation Schedule 7
 * - Contribution Caps (Concessional & Non-Concessional)
 */

// ─────────────────────────────────────────────
// 1. Age-Based Minimum Drawdown Percentages
// ─────────────────────────────────────────────
// Age = member's age at July 1 of the financial year.
// Source: SIS Regulation Schedule 7 (standard rates, post-COVID restoration)
export const DRAWDOWN_TABLE = Object.freeze([
    { minAge: 0,   maxAge: 64,  rate: 0.04 },
    { minAge: 65,  maxAge: 74,  rate: 0.05 },
    { minAge: 75,  maxAge: 79,  rate: 0.06 },
    { minAge: 80,  maxAge: 84,  rate: 0.07 },
    { minAge: 85,  maxAge: 89,  rate: 0.09 },
    { minAge: 90,  maxAge: 94,  rate: 0.11 },
    { minAge: 95,  maxAge: 199, rate: 0.14 }
]);

// ─────────────────────────────────────────────
// 2. Contribution Caps (indexed annually by ATO)
// ─────────────────────────────────────────────
// Key = financial year ending (e.g. 2026 = FY 2025-26)
export const CONTRIBUTION_CAPS = Object.freeze({
    2025: { concessional: 30000, nonConcessional: 120000 },
    2026: { concessional: 30000, nonConcessional: 120000 },
    2027: { concessional: 30000, nonConcessional: 120000 }
});

// ─────────────────────────────────────────────
// 2b. Re-Contribution Eligibility Rules
// ─────────────────────────────────────────────
// When you close a pension and want to re-contribute the balance back
// into accumulation (as a non-concessional contribution), these rules apply.
export const RECONTRIBUTION_RULES = Object.freeze({
    // Under-75 age rule: can re-contribute without a work test
    noWorkTestMaxAge: 74,
    // 75+ work test: must have worked 40hrs in 30 consecutive days within the FY
    workTestRequiredAge: 75,
    // Bring-forward: under-75 can use 3-year bring-forward (3x NCC cap)
    bringForwardMaxAge: 74,
    bringForwardMultiplier: 3,
    // Maximum re-contribution window: must be completed within the same FY
    // as the pension closure (or up to 28 days after in some fund policies)
    maxDaysAfterClosure: 28,
    // Total super balance threshold: NCC is nil if TSB >= threshold at prior June 30
    totalSuperBalanceThreshold: 1900000
});

/**
 * Checks re-contribution eligibility for a member.
 * @param {number} ageAtJuly1 - Member's age at most recent July 1.
 * @param {number} totalSuperBalance - Member's total super balance as at prior 30 June.
 * @param {number} financialYearEnding - The FY ending year (e.g. 2026).
 * @returns {{ eligible: boolean, maxAmount: number, needsWorkTest: boolean, bringForwardAvailable: boolean, reason: string }}
 */
export function checkRecontributionEligibility(ageAtJuly1, totalSuperBalance, financialYearEnding) {
    const caps = getContributionCaps(financialYearEnding);

    // TSB check: no NCC if balance exceeds threshold at prior June 30
    if (totalSuperBalance >= RECONTRIBUTION_RULES.totalSuperBalanceThreshold) {
        return {
            eligible: false,
            maxAmount: 0,
            needsWorkTest: false,
            bringForwardAvailable: false,
            reason: `Total super balance ($${totalSuperBalance.toLocaleString()}) exceeds $${RECONTRIBUTION_RULES.totalSuperBalanceThreshold.toLocaleString()} threshold — non-concessional contributions not permitted.`
        };
    }

    const needsWorkTest = ageAtJuly1 >= RECONTRIBUTION_RULES.workTestRequiredAge;
    const bringForwardAvailable = ageAtJuly1 <= RECONTRIBUTION_RULES.bringForwardMaxAge;
    const maxAmount = bringForwardAvailable
        ? caps.nonConcessional * RECONTRIBUTION_RULES.bringForwardMultiplier
        : caps.nonConcessional;

    return {
        eligible: true,
        maxAmount,
        needsWorkTest,
        bringForwardAvailable,
        reason: needsWorkTest
            ? `Age ${ageAtJuly1}: Work test required (40hrs in 30 consecutive days within the FY).`
            : `Age ${ageAtJuly1}: No work test required. ${bringForwardAvailable ? `Bring-forward available (up to $${maxAmount.toLocaleString()}).` : `Standard NCC cap applies ($${caps.nonConcessional.toLocaleString()}).`}`
    };
}

// ─────────────────────────────────────────────
// 3. Thresholds & Defaults
// ─────────────────────────────────────────────
export const SUPER_THRESHOLDS = Object.freeze({
    // Minimum balance to keep an accumulation account viable (fund-specific, editable)
    minAccumulationBalance: 6000,
    // Minimum balance to commence an account-based pension (general ATO)
    minPensionBalance: 0,
    // Transfer Balance Cap (TBC) — used for sustainability alerts
    transferBalanceCap: 1900000, // FY 2024-25 indexed value
    // Total Super Balance threshold for non-concessional eligibility
    totalSuperBalanceThreshold: 1900000
});

// ─────────────────────────────────────────────
// 4. Core Calculation Functions
// ─────────────────────────────────────────────

/**
 * Gets the applicable minimum drawdown rate for a given age.
 * @param {number} ageAtJuly1 - Member's age at July 1 of the financial year.
 * @returns {number} The minimum annual drawdown rate (e.g. 0.05 for 5%).
 */
export function getDrawdownRate(ageAtJuly1) {
    const bracket = DRAWDOWN_TABLE.find(b => ageAtJuly1 >= b.minAge && ageAtJuly1 <= b.maxAge);
    return bracket ? bracket.rate : 0.14; // Default to highest if age exceeds table
}

/**
 * Calculates the pro-rata minimum drawdown for a pension being closed mid-year.
 * Formula: Balance × Rate × (daysElapsed / daysInYear)
 *
 * @param {number} pensionBalance - The pension account balance at calculation date.
 * @param {number} ageAtJuly1 - Member's age at July 1 of the financial year.
 * @param {Date} startDate - The start of the drawdown period (usually July 1 or pension commencement).
 * @param {Date} endDate - The end of the drawdown period (closure date or June 30).
 * @returns {{ amount: number, rate: number, days: number, totalDays: number }}
 */
export function calculateProRataMinimum(pensionBalance, ageAtJuly1, startDate, endDate) {
    const rate = getDrawdownRate(ageAtJuly1);

    // Financial year boundaries
    const fyStart = new Date(startDate.getFullYear(), 6, 1); // July 1
    if (startDate.getMonth() < 6) {
        fyStart.setFullYear(fyStart.getFullYear() - 1); // If before July, use previous FY
    }
    const fyEnd = new Date(fyStart.getFullYear() + 1, 5, 30); // June 30

    // Calculate days
    const msPerDay = 86400000;
    const daysElapsed = Math.max(1, Math.ceil((endDate - startDate) / msPerDay) + 1);
    const totalDaysInFY = Math.ceil((fyEnd - fyStart) / msPerDay) + 1;

    const proRataFactor = daysElapsed / totalDaysInFY;
    const amount = Math.round(pensionBalance * rate * proRataFactor * 100) / 100;

    return { amount, rate, days: daysElapsed, totalDays: totalDaysInFY };
}

/**
 * The June 1st Rule:
 * A pension commencing on or after June 1st has a ZERO minimum drawdown
 * for the remainder of that financial year.
 *
 * @param {Date} commencementDate - The proposed pension commencement date.
 * @returns {boolean} True if the zero-minimum rule applies.
 */
export function isJune1stRuleApplicable(commencementDate) {
    if (!commencementDate) return false;
    const month = commencementDate.getMonth(); // 0-indexed: 5 = June
    const day = commencementDate.getDate();
    return month === 5 && day >= 1; // June 1 or later (but still in same FY, i.e. June only)
}

/**
 * Gets contribution caps for a given financial year.
 * @param {number} financialYearEnding - e.g. 2026 for FY 2025-26.
 * @returns {{ concessional: number, nonConcessional: number }}
 */
export function getContributionCaps(financialYearEnding) {
    // Fall back to latest known year if requested year isn't in the table
    const caps = CONTRIBUTION_CAPS[financialYearEnding];
    if (caps) return caps;

    const years = Object.keys(CONTRIBUTION_CAPS).map(Number).sort((a, b) => b - a);
    return CONTRIBUTION_CAPS[years[0]] || { concessional: 30000, nonConcessional: 120000 };
}

/**
 * Calculates the annual minimum pension drawdown (full year).
 * @param {number} pensionBalance - Account balance at July 1.
 * @param {number} ageAtJuly1 - Member's age at July 1.
 * @returns {{ annualMinimum: number, rate: number }}
 */
export function calculateAnnualMinimum(pensionBalance, ageAtJuly1) {
    const rate = getDrawdownRate(ageAtJuly1);
    const annualMinimum = Math.round(pensionBalance * rate * 100) / 100;
    return { annualMinimum, rate };
}

/**
 * Evaluates whether a proposed action threatens the capital safety floor.
 * @param {number} currentBalance - Total super balance (accumulation + pension).
 * @param {number} proposedWithdrawal - Amount to be withdrawn or moved.
 * @param {number} safetyFloor - User-defined minimum acceptable balance.
 * @returns {{ safe: boolean, remaining: number, shortfall: number }}
 */
export function checkSafetyFloor(currentBalance, proposedWithdrawal, safetyFloor) {
    const remaining = currentBalance - proposedWithdrawal;
    const safe = remaining >= safetyFloor;
    const shortfall = safe ? 0 : safetyFloor - remaining;
    return { safe, remaining, shortfall };
}

/**
 * Gets the current Australian financial year ending.
 * FY runs July 1 → June 30. If current date is Jan-Jun, FY ends this calendar year.
 * If Jul-Dec, FY ends next calendar year.
 * @param {Date} [date] - Optional reference date.
 * @returns {number} The financial year ending year (e.g. 2026).
 */
export function getCurrentFinancialYear(date = new Date()) {
    const month = date.getMonth();
    return month >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

/**
 * Gets the number of days remaining until the end of the current financial year (June 30).
 * @param {Date} [date] - Optional reference date.
 * @returns {number}
 */
export function daysUntilEOFY(date = new Date()) {
    const fy = getCurrentFinancialYear(date);
    const eofy = new Date(fy, 5, 30); // June 30 of the FY ending year
    const msPerDay = 86400000;
    return Math.max(0, Math.ceil((eofy - date) / msPerDay));
}

/**
 * Runs a full simulation for a proposed pension restart.
 * @param {object} params
 * @param {number} params.accumulationBalance
 * @param {number} params.pensionBalance
 * @param {number} params.ageAtJuly1
 * @param {Date}   params.proposedRestartDate
 * @param {number} params.safetyFloor
 * @param {number} [params.contributionAmount] - New contribution being added.
 * @returns {object} Simulation results.
 */
export function runSimulation({ accumulationBalance, pensionBalance, ageAtJuly1, proposedRestartDate, safetyFloor, contributionAmount = 0 }) {
    const fy = getCurrentFinancialYear(proposedRestartDate);
    const fyStart = new Date(fy - 1, 6, 1);
    const fyEnd = new Date(fy, 5, 30);

    // 1. Pre-closure payout (pro-rata minimum on existing pension)
    const preClosure = pensionBalance > 0
        ? calculateProRataMinimum(pensionBalance, ageAtJuly1, fyStart, proposedRestartDate)
        : { amount: 0, rate: 0, days: 0, totalDays: 365 };

    // 2. New pension balance after closure payout + contribution
    const postClosureBalance = pensionBalance - preClosure.amount;
    const newPensionBalance = postClosureBalance + accumulationBalance + contributionAmount;

    // 3. New pension minimum (considering June 1st rule)
    const june1stApplies = isJune1stRuleApplicable(proposedRestartDate);
    let newMinimum = { amount: 0, rate: 0, days: 0, totalDays: 365 };
    if (!june1stApplies) {
        newMinimum = calculateProRataMinimum(newPensionBalance, ageAtJuly1, proposedRestartDate, fyEnd);
    }

    // 4. Safety floor check
    const totalAfterAllDrawdowns = newPensionBalance - newMinimum.amount;
    const floorCheck = checkSafetyFloor(totalAfterAllDrawdowns, 0, safetyFloor);

    // 5. Contribution caps
    const caps = getContributionCaps(fy);

    return {
        preClosurePayout: preClosure,
        newPensionBalance,
        newMinimumDrawdown: newMinimum,
        june1stRuleApplies: june1stApplies,
        projectedBalance: totalAfterAllDrawdowns,
        safetyFloorCheck: floorCheck,
        contributionCaps: caps,
        financialYear: fy,
        daysRemaining: daysUntilEOFY(proposedRestartDate)
    };
}
