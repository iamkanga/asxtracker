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
// 2. Contribution Caps & Thresholds (Indexed)
// ─────────────────────────────────────────────
// Key = financial year ending (e.g. 2024 = FY 2023-24)
export const CONTRIBUTION_CAPS = Object.freeze({
    2024: { concessional: 27500, nonConcessional: 110000, tbc: 1900000 },
    2025: { concessional: 30000, nonConcessional: 120000, tbc: 1900000 },
    2026: { concessional: 30000, nonConcessional: 120000, tbc: 2000000 }
});

export function getCapData(financialYearEnding) {
    const caps = CONTRIBUTION_CAPS[financialYearEnding];
    if (caps) return caps;
    const years = Object.keys(CONTRIBUTION_CAPS).map(Number).sort((a, b) => b - a);
    return CONTRIBUTION_CAPS[years[0]] || { concessional: 30000, nonConcessional: 120000, tbc: 2000000 };
}

// ─────────────────────────────────────────────
// 2b. Re-Contribution & Bring-Forward Rules
// ─────────────────────────────────────────────
// When you restart a pension, the closed pension balance is re-contributed
// back into accumulation as a non-concessional contribution (NCC).
// Brighter Super treats this as a pension restart — the account stays open.
export const RECONTRIBUTION_RULES = Object.freeze({
    // Bring-forward: up to 3-year window
    bringForwardWindowYears: 3,
    // Re-contribution window: complete within same FY as closure
    maxDaysAfterClosure: 28
});

/**
 * Checks whether the bring-forward rule is available based on the last FY it was used.
 * The bring-forward is a 3-year rolling window. If triggered in FY2024, it covers
 * FY2024 + FY2025 + FY2026. New NCCs are available again from FY2027.
 *
 * @param {number|null} bringForwardTriggeredFY - The FY ending year when bring-forward was last triggered (e.g. 2024). Null if never used.
 * @param {number} currentFY - The current FY ending year.
 * @returns {{ available: boolean, nextAvailableFY: number|null, yearsRemaining: number }}
 */
export function isBringForwardAvailable(bringForwardTriggeredFY, currentFY) {
    if (!bringForwardTriggeredFY) {
        return { available: true, nextAvailableFY: null, yearsRemaining: 0 };
    }
    const windowEnd = bringForwardTriggeredFY + RECONTRIBUTION_RULES.bringForwardWindowYears;
    const available = currentFY >= windowEnd;
    return {
        available,
        nextAvailableFY: available ? null : windowEnd,
        yearsRemaining: available ? 0 : windowEnd - currentFY
    };
}

/**
 * Checks re-contribution eligibility for a member.
 * @param {number} totalSuperBalance - Member's total super balance as at prior 30 June.
 * @param {number} financialYearEnding - The FY ending year (e.g. 2026).
 * @param {number|null} bringForwardTriggeredFY - FY when bring-forward was last triggered.
 * @param {number} [bringForwardUsedAmount=0] - Cumulative NCC used in current BF window.
 * @returns {{ eligible: boolean, maxAmount: number, bringForwardStatus: object, reason: string }}
 */
export function checkRecontributionEligibility(totalSuperBalance, financialYearEnding, bringForwardTriggeredFY = null, bringForwardUsedAmount = 0) {
    const caps = getCapData(financialYearEnding);
    
    // Legislative TSB Tiering Limits
    const tier1Limit = caps.tbc;
    const tier2Limit = caps.tbc - caps.nonConcessional;
    const tier3Limit = caps.tbc - (caps.nonConcessional * 2);

    // TSB check: no NCC if balance exceeds general TSB threshold
    if (totalSuperBalance >= tier1Limit) {
        return {
            eligible: false,
            maxAmount: 0,
            bringForwardStatus: { available: false, nextAvailableFY: null, yearsRemaining: 0 },
            reason: `Total super balance ($${totalSuperBalance.toLocaleString()}) exceeds the $${tier1Limit.toLocaleString()} threshold. Non-concessional contributions not permitted this FY.`
        };
    }

    const bfStatus = isBringForwardAvailable(bringForwardTriggeredFY, financialYearEnding);

    let maxAmount;
    let reason;
    let eligible = false;

    if (bfStatus.available) {
        eligible = true;
        if (totalSuperBalance < tier3Limit) {
            maxAmount = caps.nonConcessional * 3;
            reason = `Full Bring-Forward. You can contribute up to $${maxAmount.toLocaleString()} (3 × $${caps.nonConcessional.toLocaleString()}) because TSB is under $${tier3Limit.toLocaleString()}. Locks out NCCs for the next 2 years.`;
        } else if (totalSuperBalance < tier2Limit) {
            maxAmount = caps.nonConcessional * 2;
            reason = `Partial Bring-Forward. You can contribute up to $${maxAmount.toLocaleString()} (2 × $${caps.nonConcessional.toLocaleString()}) because TSB is under $${tier2Limit.toLocaleString()}. Locks out NCCs for the next 1 year.`;
        } else {
            maxAmount = caps.nonConcessional;
            reason = `Bring-Forward Unavailable. TSB is between $${tier2Limit.toLocaleString()} and $${tier1Limit.toLocaleString()}. You are limited to the standard $${maxAmount.toLocaleString()} annual cap.`;
        }
    } else {
        // Active Window Strategy: Limit is (Cap at trigger year * 3) - Used
        const triggerCaps = getCapData(bringForwardTriggeredFY);
        maxAmount = Math.max(0, (triggerCaps.nonConcessional * 3) - bringForwardUsedAmount);
        eligible = maxAmount > 0;
        reason = `Active 3-Year Window (started FY ${bringForwardTriggeredFY - 1}/${String(bringForwardTriggeredFY).slice(-2)}). Your remaining limit is $${maxAmount.toLocaleString()} based on the $${(triggerCaps.nonConcessional * 3).toLocaleString()} cap applied at trigger. A fresh window resets in FY ${bfStatus.nextAvailableFY - 1}/${String(bfStatus.nextAvailableFY).slice(-2)} (${bfStatus.yearsRemaining} year${bfStatus.yearsRemaining > 1 ? 's' : ''} remaining).`;
    }

    return {
        eligible,
        maxAmount,
        bringForwardStatus: bfStatus,
        reason
    };
}

// ─────────────────────────────────────────────
// 3. Thresholds & Defaults
// ─────────────────────────────────────────────
export const SUPER_THRESHOLDS = Object.freeze({
    // Brighter Super: Minimum balance to keep an accumulation account open
    minAccumulationBalance: 8000,
    // Brighter Super: Minimum balance to COMMENCE a new pension
    minPensionCommencement: 20000,
    // Brighter Super: Minimum balance to RESTART a pension (closed/commenced)
    minPensionRestart: 20000,
    // ATO threshold where fees are capped at 3% for balances under this amount
    autoFeeCapThreshold: 6000
    // Note: TBC and TSB limits are handled dynamically via getCapData()
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
 * @returns {{ concessional: number, nonConcessional: number, tbc: number }}
 */
export function getContributionCaps(financialYearEnding) {
    return getCapData(financialYearEnding);
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
 * @param {boolean} [params.isDeductible] - Whether the contribution is claimed as a tax deduction (NOI).
 * @param {number} [params.bringForwardTriggeredFY] - FY when BF was triggered.
 * @param {number} [params.bringForwardUsedAmount] - Cumulative NCC used in current BF window.
 * @param {object} [params.pipelineContribution] - { amount, fy, isDeductible } of current pipeline payment.
 * @returns {object} Simulation results.
 */
export function runSimulation({
    accumulationBalance,
    pensionBalance,
    ageAtJuly1,
    proposedRestartDate,
    safetyFloor,
    contributionAmount = 0,
    isDeductible = false,
    bringForwardTriggeredFY = null,
    bringForwardUsedAmount = 0,
    pipelineContribution = null
}) {
    const fy = getCurrentFinancialYear(proposedRestartDate);
    const fyStart = new Date(fy - 1, 6, 1);
    const fyEnd = new Date(fy, 5, 30);

    // 0. Contribution Tax (if deductible)
    const taxRate = 0.15;
    const taxAmount = isDeductible ? (contributionAmount * taxRate) : 0;
    const netContribution = contributionAmount - taxAmount;

    // 1. Pre-closure payout (pro-rata minimum on existing pension)
    const preClosure = pensionBalance > 0
        ? calculateProRataMinimum(pensionBalance, ageAtJuly1, fyStart, proposedRestartDate)
        : { amount: 0, rate: 0, days: 0, totalDays: 365 };

    // 2. New pension balance after closure payout + contribution
    const postClosureBalance = pensionBalance - preClosure.amount;
    const newPensionBalance = postClosureBalance + accumulationBalance + netContribution;

    // 3. New pension minimum (considering June 1st rule)
    const june1stApplies = isJune1stRuleApplicable(proposedRestartDate);
    let newMinimum = { amount: 0, rate: 0, days: 0, totalDays: 365 };
    if (!june1stApplies) {
        newMinimum = calculateProRataMinimum(newPensionBalance, ageAtJuly1, proposedRestartDate, fyEnd);
    }

    // 4. Safety floor check
    const totalAfterAllDrawdowns = newPensionBalance - newMinimum.amount;
    const floorCheck = checkSafetyFloor(totalAfterAllDrawdowns, 0, safetyFloor);

    // 5. Cap Analysis
    const totalBalanceBeforeSim = accumulationBalance + pensionBalance;
    const eligibility = checkRecontributionEligibility(totalBalanceBeforeSim, fy, bringForwardTriggeredFY, bringForwardUsedAmount);
    
    // Concessional Analysis
    const caps = getCapData(fy);
    const concessionalRemaining = Math.max(0, caps.concessional); 
    
    // Non-Concessional Analysis
    let pipelineUtilization = 0;

    if (pipelineContribution && pipelineContribution.amount > 0 && !pipelineContribution.isDeductible) {
        // If in same FY OR within active bring-forward window
        const pipelineFY = pipelineContribution.fy;
        const sameFY = pipelineFY === fy;
        const bfStatus = isBringForwardAvailable(bringForwardTriggeredFY, fy);
        const inBFWindow = !bfStatus.available && fy < (bringForwardTriggeredFY + RECONTRIBUTION_RULES.bringForwardWindowYears);

        if (sameFY || inBFWindow) {
            pipelineUtilization = pipelineContribution.amount;
        }
    }

    const nccLimit = eligibility.maxAmount; // Already accounts for TSB and bring-forward used amount
    const nccRemaining = Math.max(0, nccLimit - pipelineUtilization);
    
    // Validation for THIS simulation
    const isOverCap = !isDeductible ? (contributionAmount > nccRemaining) : (contributionAmount > caps.concessional);
    const overflow = !isDeductible ? Math.max(0, contributionAmount - nccRemaining) : Math.max(0, contributionAmount - caps.concessional);

    const capAnalysis = {
        concessionalCap: caps.concessional,
        nonConcessionalCap: nccLimit,
        historicalUtilization: bringForwardUsedAmount,
        utilizedInPipeline: pipelineUtilization,
        remainingNCC: nccRemaining,
        isOverCap,
        overflow,
        bringForwardActive: !eligibility.bringForwardStatus.available,
        bfStartedFY: bringForwardTriggeredFY
    };

    return {
        preClosurePayout: preClosure,
        newPensionBalance,
        newMinimumDrawdown: newMinimum,
        june1stRuleApplies: june1stApplies,
        projectedBalance: totalAfterAllDrawdowns,
        safetyFloorCheck: floorCheck,
        contributionCaps: caps,
        financialYear: fy,
        daysRemaining: daysUntilEOFY(proposedRestartDate),
        contributionTax: taxAmount,
        isDeductible,
        grossContribution: contributionAmount,
        netContribution,
        capAnalysis
    };
}
