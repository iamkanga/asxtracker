/**
 * SuperStrategyStore.js
 * State-machine store for the Superannuation Strategy Engine.
 * Manages the contribution/pension lifecycle, dual-ledger balances,
 * safety floor, and multi-reminder deadlines.
 *
 * Constitution Compliance:
 * - isReady pattern (Ready Rule)
 * - Event-driven (Event Bus Rule)
 * - Null-safe (Null Guard Rule)
 * - No global pollution
 */

import { EVENTS, STORAGE_KEYS } from '../utils/AppConstants.js';
import { AppState } from './AppState.js';
import {
    calculateProRataMinimum,
    calculateAnnualMinimum,
    isJune1stRuleApplicable,
    getContributionCaps,
    checkSafetyFloor,
    getCurrentFinancialYear,
    daysUntilEOFY,
    runSimulation,
    checkRecontributionEligibility
} from '../data/SuperLegislation.js';

// ─────────────────────────────────────────────
// State Machine Definition
// ─────────────────────────────────────────────
export const SUPER_STATES = Object.freeze({
    CONTRIBUTION_CLEARANCE: 'CONTRIBUTION_CLEARANCE',
    NOI_SUBMISSION: 'NOI_SUBMISSION',
    FUND_ACKNOWLEDGEMENT: 'FUND_ACKNOWLEDGEMENT',
    PENSION_CLOSURE: 'PENSION_CLOSURE',
    RECONTRIBUTION: 'RECONTRIBUTION',
    PENSION_COMMENCEMENT: 'PENSION_COMMENCEMENT',
    FINALISED: 'FINALISED'
});

const STATE_ORDER = [
    SUPER_STATES.CONTRIBUTION_CLEARANCE,
    SUPER_STATES.NOI_SUBMISSION,
    SUPER_STATES.FUND_ACKNOWLEDGEMENT,
    SUPER_STATES.PENSION_CLOSURE,
    SUPER_STATES.RECONTRIBUTION,
    SUPER_STATES.PENSION_COMMENCEMENT,
    SUPER_STATES.FINALISED
];

const STATE_LABELS = Object.freeze({
    [SUPER_STATES.CONTRIBUTION_CLEARANCE]: 'Stage 1 - Age & TSB Eligibility',
    [SUPER_STATES.NOI_SUBMISSION]: 'Stages 2 & 3 - Notice of Intent (NOI)',
    [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: 'Stages 2 & 3 - NOI Acknowledgement',
    [SUPER_STATES.PENSION_CLOSURE]: 'Stage 4 - File Pension Restart P10',
    [SUPER_STATES.RECONTRIBUTION]: 'Stage 5 - Re-Contribution Limits',
    [SUPER_STATES.PENSION_COMMENCEMENT]: 'Stages 6 & 7 - Strategy Finalised',
    [SUPER_STATES.FINALISED]: 'Stages 6 & 7 - Strategy Conclusion'
});

const STATE_DESCRIPTIONS = Object.freeze({
    [SUPER_STATES.CONTRIBUTION_CLEARANCE]: 'Verify age and TSB limits before transferring funds into accumulation.',
    [SUPER_STATES.NOI_SUBMISSION]: 'File the Notice of Intent to secure your personal tax deduction.',
    [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: 'Waiting for fund acknowledgement of the NOI before closing accounts.',
    [SUPER_STATES.PENSION_CLOSURE]: 'File the P10 form to close your existing pension and pay out pro-rata minimums.',
    [SUPER_STATES.RECONTRIBUTION]: 'Consolidate accumulation balances ready for the pension restart.',
    [SUPER_STATES.PENSION_COMMENCEMENT]: 'Initiate the new pension account with the consolidated tax-free balance.',
    [SUPER_STATES.FINALISED]: 'The strategy is complete and the position is audit-ready.'
});

// ─────────────────────────────────────────────
// Default Data Shape
// ─────────────────────────────────────────────
function getDefaultData() {
    return {
        // State Machine
        currentState: SUPER_STATES.CONTRIBUTION_CLEARANCE,
        stateData: {
            [SUPER_STATES.CONTRIBUTION_CLEARANCE]: { status: 'active', completedAt: null, amount: 0, clearedDate: null },
            [SUPER_STATES.NOI_SUBMISSION]: { status: 'pending', completedAt: null, submittedDate: null, deductionAmount: 0, isNonConcessionalMode: false },
            [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: { status: 'pending', completedAt: null, acknowledged: false, acknowledgedDate: null, skipped: false },
            [SUPER_STATES.PENSION_CLOSURE]: { status: 'pending', completedAt: null, proRataPayout: 0, closureDate: null },
            [SUPER_STATES.RECONTRIBUTION]: { status: 'pending', completedAt: null, recontributionAmount: 0, recontributionDate: null },
            [SUPER_STATES.PENSION_COMMENCEMENT]: { status: 'pending', completedAt: null, commencementDate: null, newBalance: 0 },
            [SUPER_STATES.FINALISED]: { status: 'pending', completedAt: null }
        },

        // Dual Ledger — Values as at 1 July of the current financial year
        accumulationBalance: 0,
        pensionBalance: 0,

        // Member Info
        dateOfBirth: null, // ISO string
        ageAtJuly1: 65,    // Derived or user-entered (age as at 1 July)

        // Safety Floor (user's personal minimum — starts blank, not a legislative requirement)
        capitalSafetyFloor: 0,
        
        // Retention Buffer (minimum balance to leave in accumulation to keep insurance/account active)
        accumulationRetentionBuffer: 0,

        // Bring-Forward Tracking (FY ending year when bring-forward was last triggered)
        bringForwardTriggeredFY: null,
        bringForwardUsedAmount: 0, // Total NCC used across the 3-year window

        // Reminders: presets (weeks before EOFY) + optional custom date
        reminderPresets: [4, 2, 1], // Default: 4 weeks, 2 weeks, 1 week before June 30
        customReminderDate: null,    // ISO date string for a specific custom reminder

        // External Links
        fundPortalUrl: 'https://brightersuper.com.au/login',
        atoDrawdownUrl: 'https://www.ato.gov.au/rates/key-superannuation-rates-and-thresholds/',

        // Timestamps
        lastUpdated: null,
        createdAt: null,
        
        // UX State
        isPositionConfirmed: false
    };
}

class SuperStrategyStore {
    constructor() {
        this.isReady = false;
        this.data = getDefaultData();
        this._listeners = [];

        // Attach Cloud Sync Listener for Multi-Device Hydration
        document.addEventListener('cloud-preferences-loaded', (e) => {
            const prefs = e.detail;
            if (prefs && prefs.superStrategy) {
                this.hydrateFromCloud(prefs.superStrategy);
            }
        });
    }

    // ─────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────

    init() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SUPER_STRATEGY);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.data = { ...getDefaultData(), ...parsed };
            }
            this.isReady = true;
            this._dispatch(EVENTS.SUPER_READY);
            console.log('[SuperStrategyStore] Initialized', this.data.currentState);
        } catch (e) {
            console.error('[SuperStrategyStore] Init failed:', e);
            this.data = getDefaultData();
            this.isReady = true;
        }
    }

    // ─────────────────────────────────────────
    // State Machine
    // ─────────────────────────────────────────

    getCurrentState() {
        return this.data.currentState;
    }

    getCurrentStateIndex() {
        return STATE_ORDER.indexOf(this.data.currentState);
    }

    getStateLabel(state) {
        return STATE_LABELS[state] || state;
    }

    getStateDescription(state) {
        return STATE_DESCRIPTIONS[state] || '';
    }

    getStateData(state) {
        return this.data.stateData?.[state] || {};
    }

    getStates() {
        return STATE_ORDER.map((state, index) => ({
            id: state,
            label: STATE_LABELS[state],
            description: STATE_DESCRIPTIONS[state],
            status: this.data.stateData?.[state]?.status || 'pending',
            index,
            isCurrent: state === this.data.currentState,
            isComplete: this.data.stateData?.[state]?.status === 'complete',
            isLocked: index > this.getCurrentStateIndex() && this.data.stateData?.[state]?.status !== 'complete'
        }));
    }

    /**
     * Validates whether the current state can transition to the next.
     * Each state has specific validation requirements.
     */
    validateCurrentState() {
        const state = this.data.currentState;
        const sd = this.data.stateData?.[state];
        if (!sd) return { valid: false, message: 'Invalid state.' };

        // --- GLOBAL STRATEGY PICKET LINE ---
        // If they are in Non-Concessional Mode (skipped NOI), check absolute eligibility
        const noiStep = this.data.stateData?.[SUPER_STATES.NOI_SUBMISSION];
        if (noiStep?.isNonConcessionalMode) {
            const eligibility = this.getRecontributionEligibility();
            const contributionAmount = this.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0;
            if (contributionAmount > eligibility.maxAmount) {
                // Determine the correct error message (TSB vs Cap Used)
                const fy = getCurrentFinancialYear();
                const caps = getContributionCaps(fy);
                const isTSB = this.getTotalBalance() >= caps.tbc;

                return { 
                    valid: false, 
                    message: isTSB ? "TSB BLACKOUT: Illegal Strategy." : "CAP USED: Cannot proceed as NCC."
                };
            }
        }

        switch (state) {
            case SUPER_STATES.CONTRIBUTION_CLEARANCE:
                if (!sd.amount || sd.amount <= 0) return { valid: false, message: 'Enter the cleared contribution amount.' };
                if (!sd.clearedDate) return { valid: false, message: 'Confirm the date funds cleared.' };
                return { valid: true, message: 'Contribution verified.' };

            case SUPER_STATES.NOI_SUBMISSION:
                const contributionAmount = this.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0;
                const fyForCaps = getCurrentFinancialYear();
                const caps = getContributionCaps(fyForCaps);

                if (sd.isNonConcessionalMode) {
                    const eligibility = this.getRecontributionEligibility();
                    const remainingNCC = eligibility.maxAmount;
                    
                    if (contributionAmount > remainingNCC) {
                        return { 
                            valid: false, 
                            message: `Cap Error: $${(contributionAmount - remainingNCC).toLocaleString()} over NCC Limit.` 
                        };
                    }
                    return { valid: true, message: 'Ready to proceed as NCC.' };
                }

                if (!sd.submittedDate) return { valid: false, message: 'Enter the NOI submission date.' };
                if (!sd.deductionAmount || sd.deductionAmount <= 0) return { valid: false, message: 'Enter the deduction amount.' };
                
                // --- AUDIT FINDING 1: OVER-CLAIMING CHECK ---
                if (sd.deductionAmount > contributionAmount) {
                    return { 
                        valid: false, 
                        message: `Error: Cannot claim > $${contributionAmount.toLocaleString()} contributed.` 
                    };
                }
                if (sd.deductionAmount > caps.concessional) {
                    return {
                        valid: false,
                        message: `Cap Error: exceeds $${caps.concessional.toLocaleString()} personal limit.`
                    };
                }

                return { valid: true, message: 'NOI submitted.' };

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT:
                // Auto-skip if NOI was skipped
                if (this.data.stateData?.[SUPER_STATES.NOI_SUBMISSION]?.skipped) {
                    return { valid: true, message: 'Fund acknowledgement skipped (Not required).' };
                }
                if (!sd.acknowledged) return { valid: false, message: 'Fund acknowledgement is required before proceeding.' };
                return { valid: true, message: 'Fund has acknowledged NOI.' };

            case SUPER_STATES.PENSION_CLOSURE:
                if (!sd.closureDate) return { valid: false, message: 'Confirm the pension closure date.' };
                return { valid: true, message: 'Pension closure executed.' };

            case SUPER_STATES.RECONTRIBUTION: {
                const eligibility = this.getRecontributionEligibility();
                // If not eligible, they MUST proceed with 0 (skip re-contribution)
                if (!eligibility.eligible) {
                    return { valid: true, message: 'No re-contribution possible (Cap used). Advance to consolidated restart.' };
                }
                if (!sd.recontributionAmount || sd.recontributionAmount <= 0) return { valid: false, message: 'Enter the amount being re-contributed.' };
                if (!sd.recontributionDate) return { valid: false, message: 'Enter the re-contribution date.' };
                return { valid: true, message: 'Re-contribution recorded.' };
            }

            case SUPER_STATES.PENSION_COMMENCEMENT:
                if (!sd.commencementDate) return { valid: false, message: 'Set the pension commencement date.' };
                return { valid: true, message: 'Pension commenced.' };
            
            case SUPER_STATES.FINALISED:
                return { valid: true, message: 'Strategy finalised.' };

            default:
                return { valid: false, message: 'Unknown state.' };
        }
    }

    /**
     * Completes the current state and advances to the next.
     * @returns {{ success: boolean, message: string, newState: string|null }}
     */
    advanceState() {
        const validation = this.validateCurrentState();
        if (!validation.valid) {
            return { success: false, message: validation.message, newState: null };
        }

        const currentIndex = this.getCurrentStateIndex();
        const currentState = this.data.currentState;

        // Mark current as complete
        if (this.data.stateData[currentState]) {
            this.data.stateData[currentState].status = 'complete';
            this.data.stateData[currentState].completedAt = new Date().toISOString();
        }

        // Special Path: Skip NOI if toggled
        if (currentState === SUPER_STATES.NOI_SUBMISSION && this.data.stateData[currentState]?.isNonConcessionalMode) {
            return this.skipNoticeOfIntent();
        }

        // Auto-calculate for pension closure
        if (currentState === SUPER_STATES.PENSION_CLOSURE) {
            this._calculateClosurePayout();
        }

        // Advance or finish
        if (currentIndex < STATE_ORDER.length - 1) {
            const nextState = STATE_ORDER[currentIndex + 1];
            this.data.currentState = nextState;
            if (this.data.stateData[nextState]) {
                this.data.stateData[nextState].status = 'active';
                if (nextState === SUPER_STATES.FINALISED) {
                    this.data.stateData[nextState].status = 'complete';
                    this.data.stateData[nextState].completedAt = new Date().toISOString();
                }
            }
            this._save();
            this._dispatch(EVENTS.SUPER_STATE_CHANGED, { from: currentState, to: nextState });
            return { success: true, message: `Advanced to ${STATE_LABELS[nextState]}.`, newState: nextState };
        }

        return { success: true, message: 'Strategy already finalized.', newState: currentState };
    }

    /**
     * Skips the Notice of Intent submission, designating the contribution as Non-Concessional.
     * Includes a guard to ensure NCC limit room is available.
     * @returns {{ success: boolean, message: string }}
     */
    skipNoticeOfIntent() {
        if (this.data.currentState !== SUPER_STATES.NOI_SUBMISSION) {
            return { success: false, message: 'Action only valid during NOI submission phase.' };
        }

        const contribution = this.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0;
        const eligibility = this.getRecontributionEligibility();

        // Check if there is room in the NCC cap (120k/360k)
        // Fixed: eligibility.maxAmount already accounts for used amount
        if (contribution > eligibility.maxAmount) {
            return {
                success: false,
                message: `Cannot skip NOI. Contribution of ${contribution} exceeds your remaining Non-Concessional cap room.`
            };
        }

        // Mark as skipped and complete
        this.data.stateData[SUPER_STATES.NOI_SUBMISSION].isNonConcessionalMode = true;
        this.data.stateData[SUPER_STATES.NOI_SUBMISSION].status = 'complete';
        this.data.stateData[SUPER_STATES.NOI_SUBMISSION].completedAt = new Date().toISOString();

        // Auto-skip Step 3 (Acknowledgement)
        this.data.stateData[SUPER_STATES.FUND_ACKNOWLEDGEMENT].status = 'complete';
        this.data.stateData[SUPER_STATES.FUND_ACKNOWLEDGEMENT].completedAt = new Date().toISOString();
        this.data.stateData[SUPER_STATES.FUND_ACKNOWLEDGEMENT].skipped = true;

        // Advance to Step 4 (Pension Closure)
        this.data.currentState = SUPER_STATES.PENSION_CLOSURE;
        this.data.stateData[SUPER_STATES.PENSION_CLOSURE].status = 'active';

        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED);

        return { success: true, message: 'NOI skipped. Contribution treated as Non-Concessional.' };
    }

    /**
     * Regresses the state machine to the previous step.
     */
    regressState() {
        const currentIndex = this.getCurrentStateIndex();
        if (currentIndex <= 0) return { success: false, message: 'Already at the first step.' };

        const currentState = this.data.currentState;
        const prevState = STATE_ORDER[currentIndex - 1];

        // Mark current as pending (we are leaving it)
        if (this.data.stateData[currentState]) {
            this.data.stateData[currentState].status = 'pending';
        }

        // Mark previous as active
        if (this.data.stateData[prevState]) {
            this.data.stateData[prevState].status = 'active';
        }

        this.data.currentState = prevState;
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED, { from: currentState, to: prevState });
        
        return { success: true, message: `Regressed to ${STATE_LABELS[prevState]}.`, newState: prevState };
    }

    /**
     * Directly jumps to a specific state.
     * @param {string} state - The SUPER_STATE key to jump to.
     */
    jumpToState(state) {
        if (!this.data.stateData[state]) return;
        const from = this.data.currentState;
        this.data.currentState = state;
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED, { from, to: state });
    }

    /**
     * Resets the state machine back to the beginning.
     */
    resetStateMachine() {
        this.data = { ...this.data, ...getDefaultData(), accumulationBalance: this.data.accumulationBalance, pensionBalance: this.data.pensionBalance, capitalSafetyFloor: this.data.capitalSafetyFloor, dateOfBirth: this.data.dateOfBirth, ageAtJuly1: this.data.ageAtJuly1, reminders: this.data.reminders };
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED, { from: null, to: SUPER_STATES.CONTRIBUTION_CLEARANCE });
    }

    // ─────────────────────────────────────────
    // State Data Updates
    // ─────────────────────────────────────────

    updateStateData(state, updates) {
        if (!this.data.stateData[state]) return;
        Object.assign(this.data.stateData[state], updates);
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED);
    }

    // ─────────────────────────────────────────
    // Dual Ledger
    // ─────────────────────────────────────────

    setAccumulationBalance(val) {
        this.data.accumulationBalance = parseFloat(val) || 0;
        this._save();
        this._checkSafetyFloor();
    }

    setPensionBalance(val) {
        this.data.pensionBalance = parseFloat(val) || 0;
        this._save();
        this._checkSafetyFloor();
    }

    getTotalBalance() {
        return this.data.accumulationBalance + this.data.pensionBalance;
    }

    // ─────────────────────────────────────────
    // Member Info
    // ─────────────────────────────────────────

    setDateOfBirth(isoString) {
        this.data.dateOfBirth = isoString;
        if (isoString) {
            const dob = new Date(isoString);
            const fy = getCurrentFinancialYear();
            const july1 = new Date(fy - 1, 6, 1);
            this.data.ageAtJuly1 = july1.getFullYear() - dob.getFullYear();
            const m = july1.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && july1.getDate() < dob.getDate())) {
                this.data.ageAtJuly1--;
            }
        }
        this._save();
    }

    setAge(val) {
        this.data.ageAtJuly1 = parseInt(val) || 0;
        this._save();
    }

    setCustomReminderDate(val) {
        this.data.customReminderDate = val || null;
        this._save();
    }

    // ─────────────────────────────────────────
    // Safety Floor
    // ─────────────────────────────────────────

    setSafetyFloor(val) {
        this.data.capitalSafetyFloor = parseFloat(val) || 0;
        this._save();
        this._checkSafetyFloor();
    }

    _checkSafetyFloor() {
        const total = this.getTotalBalance();
        const floor = this.data.capitalSafetyFloor;
        if (floor > 0 && total < floor) {
            this._dispatch(EVENTS.SUPER_SUSTAINABILITY_ALERT, {
                currentBalance: total,
                safetyFloor: floor,
                shortfall: floor - total
            });
        }
    }

    // ─────────────────────────────────────────
    // Reminders
    // ─────────────────────────────────────────

    setReminders(presets, customDate = null) {
        if (Array.isArray(presets)) {
            this.data.reminderPresets = presets.filter(w => w > 0).sort((a, b) => b - a);
        }
        if (customDate !== undefined) {
            this.data.customReminderDate = customDate;
        }
        this._save();
    }

    getActiveReminders() {
        const daysLeft = daysUntilEOFY();
        const weeksLeft = Math.ceil(daysLeft / 7);
        
        // Only trigger countdown if within the final 6 weeks of the FY
        if (weeksLeft > 6 || weeksLeft <= 0) return [];

        return [{
            type: 'countdown',
            label: `EOFY Countdown: ${weeksLeft} Week${weeksLeft > 1 ? 's' : ''} Remaining`,
            weeks: weeksLeft,
            isTriggered: true,
            daysUntilEOFY: daysLeft
        }];
    }

    /**
     * Gets re-contribution eligibility based on current member data.
     */

    /**
     * Sets the FY when bring-forward was last triggered.
     * @param {number|null} fy - e.g. 2024 for FY2023-24. Null to clear.
     */
    setBringForwardTriggeredFY(fy) {
        this.data.bringForwardTriggeredFY = fy ? parseInt(fy) : null;
        this._save();
    }

    setBringForwardUsedAmount(amount) {
        this.data.bringForwardUsedAmount = parseFloat(amount) || 0;
        this._save();
    }

    /**
     * Calculates the member's current strategy eligibility based on state and legislation.
     * @returns {Object}
     */
    getRecontributionEligibility() {
        const fy = getCurrentFinancialYear();
        const totalBalance = this.data.accumulationBalance + this.data.pensionBalance;
        
        // Call legislation engine
        const result = checkRecontributionEligibility(
            totalBalance,
            fy,
            this.data.bringForwardTriggeredFY,
            this.data.bringForwardUsedAmount || 0
        );

        return {
            ...result,
            totalNCCUsed: this.data.bringForwardUsedAmount || 0
        };
    }

    /**
     * Executes the strategy simulation based on proposed dates.
     */
    runSimulation(proposedRestartDate, contributionAmount = 0, isDeductible = false) {
        const restartDate = new Date(proposedRestartDate);
        const simFY = getCurrentFinancialYear(restartDate);

        // Extract current pipeline contribution info
        const contribData = this.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE];
        const noiData = this.data.stateData[SUPER_STATES.NOI_SUBMISSION];
        
        let pipelineContribution = null;
        if (contribData && contribData.amount > 0) {
            pipelineContribution = {
                amount: contribData.amount,
                fy: getCurrentFinancialYear(new Date(contribData.clearedDate || new Date())),
                // If NOI step has a deduction amount matching or exceeding the clearance amount, mark as deductible
                isDeductible: noiData && noiData.deductionAmount >= contribData.amount
            };
        }

        return runSimulation({
            accumulationBalance: this.data.accumulationBalance,
            pensionBalance: this.data.pensionBalance,
            ageAtJuly1: this.data.ageAtJuly1,
            proposedRestartDate: restartDate,
            safetyFloor: this.data.capitalSafetyFloor,
            contributionAmount,
            isDeductible,
            bringForwardTriggeredFY: this.data.bringForwardTriggeredFY,
            bringForwardUsedAmount: this.data.bringForwardUsedAmount || 0,
            pipelineContribution
        });
    }

    // ─────────────────────────────────────────
    // Calculated Properties (for UI)
    // ─────────────────────────────────────────

    getCalculatedValues() {
        const age = this.data.ageAtJuly1;
        const fy = getCurrentFinancialYear();
        const annual = calculateAnnualMinimum(this.data.pensionBalance, age);
        const caps = getContributionCaps(fy);
        const daysLeft = daysUntilEOFY();
        const floorCheck = checkSafetyFloor(this.getTotalBalance(), 0, this.data.capitalSafetyFloor);

        const noiStep = this.data.stateData[SUPER_STATES.NOI_SUBMISSION];
        const isNCC = noiStep?.isNonConcessionalMode || false;
        const deduction = isNCC ? 0 : (noiStep?.deductionAmount || 0);
        const contribTax = deduction * 0.15;
        const clearedStep1 = (this.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0) - contribTax;
        
        const closureStep = this.data.stateData[SUPER_STATES.PENSION_CLOSURE];
        const recontribAmount = this.data.stateData[SUPER_STATES.RECONTRIBUTION]?.recontributionAmount || 0;
        
        // Retention Buffer (Optional hold-back for insurance/account survival)
        const buffer = this.data.accumulationRetentionBuffer || 0;
        
        // Use user-adjusted closing balances if provided, fallback to July 1 static data
        const currentAcc = (closureStep?.closingAccumulationBalance !== undefined) ? closureStep.closingAccumulationBalance : this.data.accumulationBalance;
        const currentPen = (closureStep?.closingPensionBalance !== undefined) ? closureStep.closingPensionBalance : this.data.pensionBalance;
        
        const closedBalance = currentPen - (closureStep?.proRataPayout || 0);
        
        // Final Consolidation Estimate
        // Fixed: currentAcc is assumed to be the absolute current balance as 
        // entered by the user (which usually includes Step 1).
        const restartValTotal = currentAcc + closedBalance - buffer;
        const pensionStart = Math.min(restartValTotal, caps.tbc);
        const excessTBC = Math.max(0, restartValTotal - caps.tbc);

        return {
            annualMinimum: annual.annualMinimum,
            drawdownRate: annual.rate,
            contributionCaps: caps,
            recontributionEligibility: this.getRecontributionEligibility(),
            financialYear: fy,
            daysUntilEOFY: daysLeft,
            safetyFloorStatus: floorCheck,
            totalBalance: this.getTotalBalance(),
            accumulationRetentionBuffer: buffer,
            newPensionStart: pensionStart,
            excessTBC: excessTBC,
            clearedStep1: clearedStep1,
            currentAcc: currentAcc,
            residualAccumulation: buffer + excessTBC
        };
    }

    /**
     * Aggregates all chronological and forensic data for the final Phase 3 audit.
     */
    getAuditForensics() {
        const sd = this.data.stateData;
        const calc = this.getCalculatedValues();
        
        return {
            baseline: {
                accumulation: this.data.accumulationBalance,
                pension: this.data.pensionBalance,
                total: this.getTotalBalance()
            },
            timeline: {
                clearanceDate: sd[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.clearedDate,
                noiFiledDate: sd[SUPER_STATES.NOI_SUBMISSION]?.submittedDate,
                fundAckDate: sd[SUPER_STATES.FUND_ACKNOWLEDGEMENT]?.acknowledgedDate,
                mccAmount: sd[SUPER_STATES.NOI_SUBMISSION]?.deductionAmount || 0,
                nccAmount: (sd[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0) - (sd[SUPER_STATES.NOI_SUBMISSION]?.deductionAmount || 0),
                nccAvailable: calc.recontributionEligibility?.eligible,
                completionDate: sd[SUPER_STATES.FINALISED]?.completedAt
            },
            forensics: {
                grossContribution: sd[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0,
                contributionTax: (sd[SUPER_STATES.NOI_SUBMISSION]?.isNonConcessionalMode ? 0 : (sd[SUPER_STATES.NOI_SUBMISSION]?.deductionAmount || 0)) * 0.15,
                netRecontribution: sd[SUPER_STATES.RECONTRIBUTION]?.recontributionAmount || 0,
                closurePayout: sd[SUPER_STATES.PENSION_CLOSURE]?.proRataPayout || 0
            },
            result: {
                restartDate: sd[SUPER_STATES.PENSION_COMMENCEMENT]?.commencementDate,
                newPensionStart: calc.newPensionStart,
                remainingAccumulation: calc.residualAccumulation
            }
        };
    }

    // ─────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────

    _calculateClosurePayout() {
        const sd = this.data.stateData[SUPER_STATES.PENSION_CLOSURE];
        if (!sd?.closureDate || this.data.pensionBalance <= 0) return;

        const fy = getCurrentFinancialYear(new Date(sd.closureDate));
        const fyStart = new Date(fy - 1, 6, 1);
        const result = calculateProRataMinimum(
            this.data.pensionBalance,
            this.data.ageAtJuly1,
            fyStart,
            new Date(sd.closureDate)
        );
        sd.proRataPayout = result.amount;
    }

    /**
     * Confirms the member position and transitions to the strategy pipeline.
     */
    confirmPosition() {
        this.data.isPositionConfirmed = true;
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED);
    }

    /**
     * Unlocks the member position for editing.
     */
    resetPosition() {
        this.data.isPositionConfirmed = false;
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED);
    }

    _save() {
        try {
            this.data.lastUpdated = new Date().toISOString();
            if (!this.data.createdAt) {
                this.data.createdAt = this.data.lastUpdated;
            }
            localStorage.setItem(STORAGE_KEYS.SUPER_STRATEGY, JSON.stringify(this.data));

            // Firebase Sync Integration
            if (AppState && AppState.preferences) {
                AppState.preferences.superStrategy = this.data;
                AppState.triggerSync();
            }
        } catch (e) {
            console.error('[SuperStrategyStore] Save failed:', e);
        }
    }

    hydrateFromCloud(cloudData) {
        if (!cloudData) return;
        
        const cloudTime = new Date(cloudData.lastUpdated || 0).getTime();
        const localTime = new Date(this.data.lastUpdated || 0).getTime();
        
        // Only overwrite if cloud data is STRICTLY newer
        if (cloudTime > localTime) {
            this.data = { ...getDefaultData(), ...cloudData };
            localStorage.setItem(STORAGE_KEYS.SUPER_STRATEGY, JSON.stringify(this.data));
            this._dispatch(EVENTS.SUPER_STATE_CHANGED);
            console.log('[SuperStrategyStore] Hydrated from cloud sync');
            
            // Re-trigger global refresh for dashboard banners
            window.dispatchEvent(new CustomEvent('dashboard-prefs-changed'));
        }
    }

    _dispatch(eventName, detail = null) {
        try {
            document.dispatchEvent(new CustomEvent(eventName, { detail }));
        } catch (e) {
            console.error('[SuperStrategyStore] Dispatch failed:', e);
        }
    }
}

// Singleton export
export const superStrategyStore = new SuperStrategyStore();
