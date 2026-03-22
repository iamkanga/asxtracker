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
    PENSION_COMMENCEMENT: 'PENSION_COMMENCEMENT'
});

const STATE_ORDER = [
    SUPER_STATES.CONTRIBUTION_CLEARANCE,
    SUPER_STATES.NOI_SUBMISSION,
    SUPER_STATES.FUND_ACKNOWLEDGEMENT,
    SUPER_STATES.PENSION_CLOSURE,
    SUPER_STATES.RECONTRIBUTION,
    SUPER_STATES.PENSION_COMMENCEMENT
];

const STATE_LABELS = Object.freeze({
    [SUPER_STATES.CONTRIBUTION_CLEARANCE]: 'Contribution Clearance',
    [SUPER_STATES.NOI_SUBMISSION]: 'NOI Submission',
    [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: 'Fund Acknowledgement',
    [SUPER_STATES.PENSION_CLOSURE]: 'Pension Closure',
    [SUPER_STATES.RECONTRIBUTION]: 'Re-Contribution',
    [SUPER_STATES.PENSION_COMMENCEMENT]: 'Pension Commencement'
});

const STATE_DESCRIPTIONS = Object.freeze({
    [SUPER_STATES.CONTRIBUTION_CLEARANCE]: 'Verify that contribution funds have cleared in the accumulation account.',
    [SUPER_STATES.NOI_SUBMISSION]: 'Submit Notice of Intent to claim a tax deduction on the contribution.',
    [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: 'Waiting for fund acknowledgement of NOI. This is a manual/API verification gate.',
    [SUPER_STATES.PENSION_CLOSURE]: 'Calculate and execute mandatory pro-rata drawdowns for existing pension accounts.',
    [SUPER_STATES.RECONTRIBUTION]: 'Re-contribute pension balance back into accumulation as a non-concessional contribution, then consolidate for the new pension.',
    [SUPER_STATES.PENSION_COMMENCEMENT]: 'Initiate the restarted pension account with the consolidated balance.'
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
            [SUPER_STATES.NOI_SUBMISSION]: { status: 'pending', completedAt: null, submittedDate: null, deductionAmount: 0 },
            [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: { status: 'pending', completedAt: null, acknowledged: false, acknowledgedDate: null },
            [SUPER_STATES.PENSION_CLOSURE]: { status: 'pending', completedAt: null, proRataPayout: 0, closureDate: null },
            [SUPER_STATES.RECONTRIBUTION]: { status: 'pending', completedAt: null, recontributionAmount: 0, recontributionDate: null },
            [SUPER_STATES.PENSION_COMMENCEMENT]: { status: 'pending', completedAt: null, commencementDate: null, newBalance: 0 }
        },

        // Dual Ledger — Values as at 1 July of the current financial year
        accumulationBalance: 0,
        pensionBalance: 0,

        // Member Info
        dateOfBirth: null, // ISO string
        ageAtJuly1: 65,    // Derived or user-entered (age as at 1 July)

        // Safety Floor (user's personal minimum — starts blank, not a legislative requirement)
        capitalSafetyFloor: 0,

        // Bring-Forward Tracking (FY ending year when bring-forward was last triggered)
        bringForwardTriggeredFY: null,

        // Reminders: presets (weeks before EOFY) + optional custom date
        reminderPresets: [4, 2, 1], // Default: 4 weeks, 2 weeks, 1 week before June 30
        customReminderDate: null,    // ISO date string for a specific custom reminder

        // External Links
        fundPortalUrl: 'https://brightersuper.com.au/login',
        atoDrawdownUrl: 'https://www.ato.gov.au/rates/key-superannuation-rates-and-thresholds/',

        // Timestamps
        lastUpdated: null,
        createdAt: null
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

        switch (state) {
            case SUPER_STATES.CONTRIBUTION_CLEARANCE:
                if (!sd.amount || sd.amount <= 0) return { valid: false, message: 'Enter the cleared contribution amount.' };
                if (!sd.clearedDate) return { valid: false, message: 'Confirm the date funds cleared.' };
                return { valid: true, message: 'Contribution verified.' };

            case SUPER_STATES.NOI_SUBMISSION:
                if (!sd.submittedDate) return { valid: false, message: 'Enter the NOI submission date.' };
                if (!sd.deductionAmount || sd.deductionAmount <= 0) return { valid: false, message: 'Enter the deduction amount.' };
                return { valid: true, message: 'NOI submitted.' };

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT:
                if (!sd.acknowledged) return { valid: false, message: 'Fund acknowledgement is required before proceeding.' };
                return { valid: true, message: 'Fund has acknowledged NOI.' };

            case SUPER_STATES.PENSION_CLOSURE:
                if (!sd.closureDate) return { valid: false, message: 'Confirm the pension closure date.' };
                return { valid: true, message: 'Pension closure executed.' };

            case SUPER_STATES.RECONTRIBUTION:
                if (!sd.recontributionAmount || sd.recontributionAmount <= 0) return { valid: false, message: 'Enter the amount being re-contributed.' };
                if (!sd.recontributionDate) return { valid: false, message: 'Enter the re-contribution date.' };
                return { valid: true, message: 'Re-contribution recorded.' };

            case SUPER_STATES.PENSION_COMMENCEMENT:
                if (!sd.commencementDate) return { valid: false, message: 'Set the pension commencement date.' };
                return { valid: true, message: 'Pension commenced.' };

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
            }
            this._save();
            this._dispatch(EVENTS.SUPER_STATE_CHANGED, { from: currentState, to: nextState });
            return { success: true, message: `Advanced to ${STATE_LABELS[nextState]}.`, newState: nextState };
        }

        // All complete
        this._save();
        this._dispatch(EVENTS.SUPER_STATE_CHANGED, { from: currentState, to: 'COMPLETE' });
        return { success: true, message: 'All steps complete! Pension commencement finalised.', newState: 'COMPLETE' };
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
        const presetReminders = (this.data.reminderPresets || []).map(weeks => {
            const triggerDays = weeks * 7;
            return {
                type: 'preset',
                label: `${weeks}w before EOFY`,
                weeks,
                triggerDays,
                isTriggered: daysLeft <= triggerDays,
                daysUntilTrigger: Math.max(0, triggerDays - daysLeft),
                daysUntilEOFY: daysLeft
            };
        });

        // Custom date reminder
        if (this.data.customReminderDate) {
            const customDate = new Date(this.data.customReminderDate);
            const now = new Date();
            const msPerDay = 86400000;
            const daysUntilCustom = Math.ceil((customDate - now) / msPerDay);
            presetReminders.push({
                type: 'custom',
                label: `Custom: ${customDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
                weeks: null,
                triggerDays: null,
                isTriggered: daysUntilCustom <= 0,
                daysUntilTrigger: Math.max(0, daysUntilCustom),
                daysUntilEOFY: daysLeft
            });
        }

        return presetReminders;
    }

    /**
     * Gets re-contribution eligibility based on current member data.
     */
    getRecontributionEligibility() {
        const fy = getCurrentFinancialYear();
        return checkRecontributionEligibility(
            this.getTotalBalance(),
            fy,
            this.data.bringForwardTriggeredFY
        );
    }

    /**
     * Sets the FY when bring-forward was last triggered.
     * @param {number|null} fy - e.g. 2024 for FY2023-24. Null to clear.
     */
    setBringForwardTriggeredFY(fy) {
        this.data.bringForwardTriggeredFY = fy ? parseInt(fy) : null;
        this._save();
    }

    // ─────────────────────────────────────────
    // Simulation
    // ─────────────────────────────────────────

    runSimulation(proposedRestartDate, contributionAmount = 0) {
        return runSimulation({
            accumulationBalance: this.data.accumulationBalance,
            pensionBalance: this.data.pensionBalance,
            ageAtJuly1: this.data.ageAtJuly1,
            proposedRestartDate: new Date(proposedRestartDate),
            safetyFloor: this.data.capitalSafetyFloor,
            contributionAmount
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

        return {
            annualMinimum: annual.annualMinimum,
            drawdownRate: annual.rate,
            contributionCaps: caps,
            recontributionEligibility: this.getRecontributionEligibility(),
            financialYear: fy,
            daysUntilEOFY: daysLeft,
            safetyFloorStatus: floorCheck,
            totalBalance: this.getTotalBalance()
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
