/**
 * SuperStrategyUI.js
 * Modal-based UI for the Superannuation Strategy Engine.
 * Follows the CalculatorUI.showModal() pattern.
 *
 * Constitution Compliance:
 * - Registry Rule: All CSS classes from CSS_CLASSES, all IDs from IDS
 * - Event Bus Rule: Communication via EVENTS
 * - Ready Rule: Checks store.isReady before rendering
 * - Null Guard Rule: Safety checks throughout
 */

import { CSS_CLASSES, IDS, EVENTS, UI_ICONS } from '../utils/AppConstants.js';
import { formatCurrency } from '../utils/formatters.js';
import { navManager } from '../utils/NavigationManager.js';
import { superStrategyStore, SUPER_STATES } from '../state/SuperStrategyStore.js';
import {
    getDrawdownRate,
    DRAWDOWN_TABLE,
    SUPER_THRESHOLDS,
    daysUntilEOFY,
    getCurrentFinancialYear
} from '../data/SuperLegislation.js';

export default class SuperStrategyUI {

    constructor() {
        this.modal = null;
        this.container = null;
        this.activeTab = 'pipeline'; // 'pipeline' | 'simulation' | 'info'
    }

    // ─────────────────────────────────────────
    // Static Modal Launcher
    // ─────────────────────────────────────────

    static showModal() {
        const existing = document.getElementById(IDS.SUPER_STRATEGY_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.SUPER_STRATEGY_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="height: 90vh; max-height: 850px; display: flex; flex-direction: column;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">
                            <i class="fas fa-shield-alt" style="margin-right: 8px; color: var(--color-accent);"></i>
                            Super Strategy
                        </h2>
                    </div>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                <div id="super-modal-body" class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; overflow-y: auto; padding: 0;"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Initialize store if needed
        if (!superStrategyStore.isReady) {
            superStrategyStore.init();
        }

        const instance = new SuperStrategyUI();
        instance.modal = modal;
        instance.container = modal.querySelector('#super-modal-body');
        instance.render();

        // Animate in
        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            requestAnimationFrame(() => modal.classList.add(CSS_CLASSES.SHOW));
        });

        // Nav hook
        navManager.pushState(() => {
            if (modal.parentElement) modal.remove();
        });

        // Close logic
        const close = () => {
            if (modal._isClosing) return;
            modal._isClosing = true;
            modal.classList.remove(CSS_CLASSES.SHOW);
            modal.style.pointerEvents = 'none';
            setTimeout(() => {
                modal.classList.add(CSS_CLASSES.HIDDEN);
                modal.remove();
                navManager.popStateSilently();
            }, 450);
        };

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        // Listen for state changes to re-render
        const onStateChange = () => instance.render();
        document.addEventListener(EVENTS.SUPER_STATE_CHANGED, onStateChange);

        // Cleanup on close
        const observer = new MutationObserver(() => {
            if (!document.contains(modal)) {
                document.removeEventListener(EVENTS.SUPER_STATE_CHANGED, onStateChange);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    }

    // ─────────────────────────────────────────
    // Main Render
    // ─────────────────────────────────────────

    render() {
        if (!this.container) return;
        if (!superStrategyStore.isReady) {
            this.container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
            return;
        }

        const calc = superStrategyStore.getCalculatedValues();
        const data = superStrategyStore.data;
        const fy = calc.financialYear;

        this.container.innerHTML = `
            ${this._renderTabs()}
            <div class="${CSS_CLASSES.SUPER_DETAIL_PANEL}" style="padding: 16px;">
                ${this.activeTab === 'pipeline' ? this._renderPipelineTab(data, calc) : ''}
                ${this.activeTab === 'simulation' ? this._renderSimulationTab(data, calc) : ''}
                ${this.activeTab === 'info' ? this._renderInfoTab(data, calc) : ''}
            </div>
        `;

        this._bindEvents();
    }

    // ─────────────────────────────────────────
    // Tab Navigation
    // ─────────────────────────────────────────

    _renderTabs() {
        const tabs = [
            { id: 'pipeline', label: 'Pipeline', icon: 'fa-tasks' },
            { id: 'simulation', label: 'What-If', icon: 'fa-flask' },
            { id: 'info', label: 'Reference', icon: 'fa-book' }
        ];

        return `
            <div class="${CSS_CLASSES.SEGMENTED_CONTROL}" style="display: flex; background: rgba(255,255,255,0.04); margin: 12px 16px; border-radius: 12px; padding: 4px;">
                ${tabs.map(t => `
                    <button class="super-tab-btn ${this.activeTab === t.id ? CSS_CLASSES.ACTIVE : ''}"
                            data-tab="${t.id}"
                            style="flex: 1; padding: 10px 8px; border: none; background: ${this.activeTab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: ${this.activeTab === t.id ? '#fff' : 'var(--text-muted)'}; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 0.85rem;">
                        <i class="fas ${t.icon}" style="margin-right: 5px; font-size: 0.8rem;"></i>${t.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    // ─────────────────────────────────────────
    // Pipeline Tab
    // ─────────────────────────────────────────

    _renderPipelineTab(data, calc) {
        return `
            ${this._renderBalanceHeader(data, calc)}
            ${this._renderProgressBar()}
            ${this._renderActiveStepDetail(data)}
            ${this._renderSafetyFloorBanner(data, calc)}
            ${this._renderReminderStatus(calc)}
            ${this._renderQuickLinks(data)}
        `;
    }

    _renderBalanceHeader(data, calc) {
        const floorPct = data.capitalSafetyFloor > 0 ? (calc.safetyFloorStatus.safe ? 'safe' : 'warning') : 'none';
        const floorColor = floorPct === 'safe' ? 'var(--color-positive)' : floorPct === 'warning' ? 'var(--color-negative)' : 'var(--text-muted)';
        const fy = calc.financialYear;

        return `
            <div class="${CSS_CLASSES.SUPER_LEDGER}" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
                <div class="${CSS_CLASSES.SUPER_LEDGER_CARD}" style="background: rgba(255,255,255,0.04); border-radius: 12px; padding: 14px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Accumulation <span style="font-weight: 400; text-transform: none; letter-spacing: 0;">(as at 1 Jul)</span></div>
                    <input type="number" id="${IDS.SUPER_ACCUMULATION_INPUT}" class="${CSS_CLASSES.FORM_CONTROL}"
                           value="${data.accumulationBalance || ''}" placeholder="0.00"
                           style="font-size: 1.1rem; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; width: 100%; box-sizing: border-box;">
                </div>
                <div class="${CSS_CLASSES.SUPER_LEDGER_CARD}" style="background: rgba(255,255,255,0.04); border-radius: 12px; padding: 14px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Pension <span style="font-weight: 400; text-transform: none; letter-spacing: 0;">(as at 1 Jul)</span></div>
                    <input type="number" id="${IDS.SUPER_PENSION_INPUT}" class="${CSS_CLASSES.FORM_CONTROL}"
                           value="${data.pensionBalance || ''}" placeholder="0.00"
                           style="font-size: 1.1rem; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; width: 100%; box-sizing: border-box;">
                </div>
            </div>

            <!-- Total + Safety Floor Row -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 10px;">
                <div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Total Balance</div>
                    <div style="font-size: 1.3rem; font-weight: 800; color: #fff;">${formatCurrency(calc.totalBalance)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Safety Floor</div>
                    <div style="display: flex; align-items: center; gap: 6px; justify-content: flex-end;">
                        <input type="number" id="${IDS.SUPER_SAFETY_FLOOR_INPUT}"
                               value="${data.capitalSafetyFloor || ''}" placeholder="Optional"
                               style="width: 110px; font-size: 1rem; font-weight: 700; color: ${floorColor}; background: transparent; border: none; text-align: right; padding: 0;">
                        ${data.capitalSafetyFloor > 0 ? `<i class="fas ${calc.safetyFloorStatus.safe ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="color: ${floorColor}; font-size: 0.9rem;"></i>` : ''}
                    </div>
                </div>
            </div>

            <!-- Safety Floor Explanation -->
            <div style="padding: 8px 14px; margin-bottom: 16px; font-size: 0.72rem; color: var(--text-muted); line-height: 1.5; opacity: 0.7;">
                <i class="fas fa-info-circle" style="margin-right: 4px;"></i>
                <strong>Safety Floor</strong> is your personal minimum — the balance you don't want to drop below. It's not a legislative requirement, just a guardrail for sustainability. Leave blank if not needed.
            </div>

            <!-- Age + FY Row -->
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                <div style="flex: 1; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Age at 1 July</div>
                    <input type="number" id="${IDS.SUPER_AGE_INPUT}" value="${data.ageAtJuly1 || 65}" min="0" max="120"
                           style="width: 60px; font-size: 1.1rem; font-weight: 700; background: transparent; border: none; color: #fff; padding: 0;">
                    <div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 2px;">Drawdown rate is based on your age as at 1 July of the FY</div>
                </div>
                <div style="flex: 1; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Financial Year</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #fff;">FY ${fy - 1}/${String(fy).slice(-2)}</div>
                </div>
                <div style="flex: 1; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Min Rate</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--color-accent);">${(calc.drawdownRate * 100).toFixed(0)}%</div>
                </div>
            </div>
        `;
    }

    _renderProgressBar() {
        const states = superStrategyStore.getStates();

        const stepsHtml = states.map((s, i) => {
            let statusClass = CSS_CLASSES.SUPER_STEP_LOCKED;
            let iconHtml = `<span style="font-size: 0.75rem; font-weight: 700;">${i + 1}</span>`;
            let opacity = '0.35';

            if (s.isComplete) {
                statusClass = CSS_CLASSES.SUPER_STEP_COMPLETE;
                iconHtml = `<i class="fas fa-check" style="font-size: 0.7rem;"></i>`;
                opacity = '0.7';
            } else if (s.isCurrent) {
                statusClass = CSS_CLASSES.SUPER_STEP_ACTIVE;
                opacity = '1';
            }

            const connector = i < states.length - 1
                ? `<div class="${CSS_CLASSES.SUPER_STEP_CONNECTOR}" style="flex: 1; height: 2px; background: ${s.isComplete ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}; margin: 0 2px;"></div>`
                : '';

            return `
                <div style="display: flex; align-items: center; flex: 1;">
                    <div class="${CSS_CLASSES.SUPER_STEP} ${statusClass}" data-step-index="${i}"
                         style="display: flex; flex-direction: column; align-items: center; cursor: ${s.isLocked ? 'default' : 'pointer'}; opacity: ${opacity}; transition: opacity 0.2s;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                                    background: ${s.isComplete ? 'var(--color-accent)' : s.isCurrent ? 'rgba(var(--accent-rgb, 100,100,255), 0.25)' : 'rgba(255,255,255,0.06)'};
                                    border: 2px solid ${s.isComplete ? 'var(--color-accent)' : s.isCurrent ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'};
                                    color: ${s.isComplete ? '#000' : '#fff'}; font-size: 0.8rem; font-weight: 700;">
                            ${iconHtml}
                        </div>
                        <div style="font-size: 0.55rem; font-weight: 600; color: var(--text-muted); margin-top: 4px; text-align: center; max-width: 60px; line-height: 1.2;">
                            ${s.label.split(' ')[0]}
                        </div>
                    </div>
                    ${connector}
                </div>
            `;
        }).join('');

        return `
            <div class="${CSS_CLASSES.SUPER_PROGRESS_BAR}" id="${IDS.SUPER_STATE_PROGRESS}"
                 style="display: flex; align-items: flex-start; padding: 16px 8px; margin-bottom: 16px; background: rgba(255,255,255,0.02); border-radius: 12px;">
                ${stepsHtml}
            </div>
        `;
    }

    _renderActiveStepDetail(data) {
        const current = superStrategyStore.getCurrentState();
        const stateData = superStrategyStore.getStateData(current);
        const label = superStrategyStore.getStateLabel(current);
        const desc = superStrategyStore.getStateDescription(current);
        const validation = superStrategyStore.validateCurrentState();

        let fieldsHtml = '';

        switch (current) {
            case SUPER_STATES.CONTRIBUTION_CLEARANCE:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Cleared Amount ($)</label>
                        <input type="number" id="${IDS.SUPER_CONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.amount || ''}" placeholder="0.00" step="0.01"
                               style="border-radius: 8px; padding: 10px;">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Date Cleared</label>
                        <input type="date" id="${IDS.SUPER_CONTRIBUTION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.clearedDate || ''}"
                               style="border-radius: 8px; padding: 10px;">
                    </div>
                `;
                break;

            case SUPER_STATES.NOI_SUBMISSION:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Deduction Amount ($)</label>
                        <input type="number" id="${IDS.SUPER_NOI_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.deductionAmount || ''}" placeholder="0.00" step="0.01"
                               style="border-radius: 8px; padding: 10px;">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Date Submitted</label>
                        <input type="date" id="${IDS.SUPER_NOI_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.submittedDate || ''}"
                               style="border-radius: 8px; padding: 10px;">
                    </div>
                `;
                break;

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT:
                fieldsHtml = `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 16px; background: rgba(255,165,0,0.08); border-radius: 10px; border: 1px solid rgba(255,165,0,0.15);">
                        <i class="fas fa-exclamation-triangle" style="color: #ffa500; font-size: 1.2rem;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 700; color: #ffa500; font-size: 0.85rem; margin-bottom: 4px;">Validation Gate</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Hard stop — confirm the fund has acknowledged your NOI before proceeding.</div>
                        </div>
                    </div>
                    <label style="display: flex; align-items: center; gap: 10px; margin-top: 14px; cursor: pointer; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                        <input type="checkbox" id="${IDS.SUPER_ACK_CHECKBOX}" ${stateData.acknowledged ? 'checked' : ''}
                               style="width: 18px; height: 18px; accent-color: var(--color-accent);">
                        <span style="font-size: 0.85rem; font-weight: 600;">Fund acknowledgement received</span>
                    </label>
                `;
                break;

            case SUPER_STATES.PENSION_CLOSURE: {
                const proRata = stateData.closureDate && data.pensionBalance > 0
                    ? this._getProRataPreview(data)
                    : null;
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Closure Date</label>
                        <input type="date" id="${IDS.SUPER_CLOSURE_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.closureDate || ''}"
                               style="border-radius: 8px; padding: 10px;">
                    </div>
                    ${proRata ? `
                        <div style="background: rgba(255,255,255,0.04); border-radius: 10px; padding: 14px; margin-top: 8px;">
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Pro-Rata Minimum Drawdown</div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Required Payout</span>
                                <span style="font-size: 1.1rem; font-weight: 800; color: var(--color-accent);">${formatCurrency(proRata.amount)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
                                <span>${proRata.days} of ${proRata.totalDays} days (${(proRata.days / proRata.totalDays * 100).toFixed(1)}%)</span>
                                <span>Rate: ${(proRata.rate * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                    ` : ''}
                `;
                break;
            }

            case SUPER_STATES.PENSION_COMMENCEMENT:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Commencement Date</label>
                        <input type="date" id="${IDS.SUPER_COMMENCE_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.commencementDate || ''}"
                               style="border-radius: 8px; padding: 10px;">
                    </div>
                    ${stateData.commencementDate ? this._renderCommencementPreview(data, stateData.commencementDate) : ''}
                `;
                break;

            case SUPER_STATES.RECONTRIBUTION: {
                const eligibility = superStrategyStore.getRecontributionEligibility();
                const closureData = superStrategyStore.getStateData(SUPER_STATES.PENSION_CLOSURE);
                const closedBalance = data.pensionBalance - (closureData?.proRataPayout || 0);
                fieldsHtml = `
                    <!-- Eligibility Status -->
                    <div style="display: flex; align-items: flex-start; gap: 10px; padding: 14px; background: rgba(${eligibility.eligible ? '6,255,79,0.08' : '255,59,48,0.08'}); border-radius: 10px; margin-bottom: 14px; border: 1px solid rgba(${eligibility.eligible ? '6,255,79,0.15' : '255,59,48,0.15'});">
                        <i class="fas ${eligibility.eligible ? 'fa-check-circle' : 'fa-times-circle'}" style="color: ${eligibility.eligible ? 'var(--color-positive)' : '#ff3b30'}; font-size: 1rem; margin-top: 2px;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 700; font-size: 0.82rem; color: ${eligibility.eligible ? 'var(--color-positive)' : '#ff3b30'}; margin-bottom: 3px;">
                                ${eligibility.eligible ? 'Eligible to Re-Contribute' : 'Not Eligible'}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.5;">${eligibility.reason}</div>
                            ${eligibility.eligible ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Max NCC: <strong style="color: #fff;">${formatCurrency(eligibility.maxAmount)}</strong></div>` : ''}
                        </div>
                    </div>

                    <!-- Available to Re-Contribute -->
                    ${closedBalance > 0 ? `
                        <div style="background: rgba(255,255,255,0.04); border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Post-Closure Pension Balance</div>
                            <div style="font-size: 1rem; font-weight: 700; color: #fff;">${formatCurrency(closedBalance)}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">This is the amount available to re-contribute to accumulation (as a non-concessional contribution).</div>
                        </div>
                    ` : ''}

                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Re-Contribution Amount ($)</label>
                        <input type="number" id="${IDS.SUPER_RECONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionAmount || ''}" placeholder="0.00" step="0.01"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               max="${eligibility.maxAmount}"
                               style="border-radius: 8px; padding: 10px; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                        ${eligibility.eligible && eligibility.needsWorkTest ? '<div style="font-size: 0.7rem; color: #ffa500; margin-top: 4px;"><i class="fas fa-exclamation-triangle" style="margin-right: 4px;"></i>Work test required: 40hrs in 30 consecutive days within the FY.</div>' : ''}
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                        <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Re-Contribution Date</label>
                        <input type="date" id="${IDS.SUPER_RECONTRIBUTION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionDate || ''}"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               style="border-radius: 8px; padding: 10px; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                    </div>
                `;
                break;
            }
        }

        return `
            <div id="${IDS.SUPER_STEP_DETAIL}" class="${CSS_CLASSES.SUPER_DETAIL_PANEL}"
                 style="background: rgba(255,255,255,0.03); border-radius: 14px; padding: 18px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
                    <div>
                        <div style="font-size: 1rem; font-weight: 800; color: #fff; margin-bottom: 4px;">${label}</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">${desc}</div>
                    </div>
                </div>
                ${fieldsHtml}
                <div style="display: flex; gap: 8px; margin-top: 16px;">
                    <button id="super-advance-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}"
                            style="flex: 1; padding: 12px; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer;
                                   background: ${validation.valid ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)'};
                                   color: ${validation.valid ? '#000' : 'var(--text-muted)'}; border: none;
                                   opacity: ${validation.valid ? '1' : '0.5'};">
                        ${validation.valid ? 'Complete & Advance →' : validation.message}
                    </button>
                    <button id="super-reset-btn" style="padding: 12px 16px; border-radius: 10px; background: rgba(255,59,48,0.12); color: #ff3b30; border: none; cursor: pointer; font-weight: 600; font-size: 0.8rem;">
                        <i class="fas fa-undo" style="font-size: 0.75rem;"></i>
                    </button>
                </div>
            </div>
        `;
    }

    _renderSafetyFloorBanner(data, calc) {
        if (calc.safetyFloorStatus.safe || !data.capitalSafetyFloor) return '';
        return `
            <div class="${CSS_CLASSES.SUPER_ALERT_BANNER}"
                 style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(255,59,48,0.1); border-radius: 12px; margin-bottom: 16px; border: 1px solid rgba(255,59,48,0.2);">
                <i class="fas fa-exclamation-triangle" style="color: #ff3b30; font-size: 1.1rem;"></i>
                <div style="flex: 1;">
                    <div style="font-weight: 700; color: #ff3b30; font-size: 0.85rem;">Sustainability Alert</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                        Balance (${formatCurrency(calc.totalBalance)}) is below your safety floor (${formatCurrency(data.capitalSafetyFloor)}).
                        Shortfall: <strong style="color: #ff3b30;">${formatCurrency(calc.safetyFloorStatus.shortfall)}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    _renderReminderStatus(calc) {
        const daysLeft = calc.daysUntilEOFY;
        const reminders = superStrategyStore.getActiveReminders();
        const data = superStrategyStore.data;

        return `
            <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">EOFY Countdown</div>
                    <div style="font-size: 1rem; font-weight: 800; color: ${daysLeft <= 30 ? '#ff3b30' : daysLeft <= 60 ? '#ffa500' : 'var(--color-accent)'};">${daysLeft} days</div>
                </div>

                <!-- Preset Reminders -->
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;">
                    ${reminders.map(r => `
                        <span class="${CSS_CLASSES.SUPER_REMINDER_ROW}" style="padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 600;
                                      background: ${r.isTriggered ? 'rgba(255,165,0,0.15)' : 'rgba(255,255,255,0.04)'};
                                      color: ${r.isTriggered ? '#ffa500' : 'var(--text-muted)'};
                                      border: 1px solid ${r.isTriggered ? 'rgba(255,165,0,0.25)' : 'transparent'};">
                            ${r.label} ${r.isTriggered ? '⚠' : '✓'}
                        </span>
                    `).join('')}
                </div>

                <!-- Custom Reminder Date -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; white-space: nowrap;">Custom:</label>
                    <input type="date" id="${IDS.SUPER_CUSTOM_REMINDER_DATE}"
                           value="${data.customReminderDate || ''}"
                           style="flex: 1; font-size: 0.78rem; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 6px 8px; color: #fff;">
                </div>
            </div>
        `;
    }

    _renderQuickLinks(data) {
        const links = [
            { label: 'Brighter Super', url: data.fundPortalUrl, icon: 'fa-university' },
            { label: 'ATO Drawdown Rates', url: data.atoDrawdownUrl, icon: 'fa-balance-scale' }
        ];

        return `
            <div class="${CSS_CLASSES.SUPER_QUICK_LINKS}" style="display: flex; gap: 8px; margin-bottom: 16px;">
                ${links.map(l => `
                    <a href="${l.url}" target="_blank" rel="noopener noreferrer"
                       style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 10px; text-decoration: none; color: var(--color-accent); font-size: 0.8rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.06); transition: background 0.2s;">
                        <i class="fas ${l.icon}" style="font-size: 0.85rem;"></i>
                        ${l.label}
                    </a>
                `).join('')}
            </div>
        `;
    }

    // ─────────────────────────────────────────
    // Simulation Tab
    // ─────────────────────────────────────────

    _renderSimulationTab(data, calc) {
        return `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 8px;">What-If Simulator</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">
                    Enter a proposed restart date to see the immediate impact on pre-closure payouts, new pension minimums, and capital longevity.
                </div>

                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 12px;">
                    <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Proposed Restart Date</label>
                    <input type="date" id="${IDS.SUPER_SIMULATION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                           style="border-radius: 8px; padding: 10px;">
                </div>

                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 16px;">
                    <label class="${CSS_CLASSES.FORM_GROUP}" style="font-size: 0.75rem;">Additional Contribution ($)</label>
                    <input type="number" id="super-sim-contribution" class="${CSS_CLASSES.FORM_CONTROL}"
                           placeholder="0.00" step="0.01"
                           style="border-radius: 8px; padding: 10px;">
                </div>

                <button id="super-run-sim-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}"
                        style="width: 100%; padding: 12px; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer; background: var(--color-accent); color: #000; border: none;">
                    <i class="fas fa-flask" style="margin-right: 6px;"></i> Run Simulation
                </button>
            </div>

            <div id="${IDS.SUPER_SIMULATION_RESULTS}"></div>
        `;
    }

    _renderSimulationResults(results) {
        const el = this.container?.querySelector(`#${IDS.SUPER_SIMULATION_RESULTS}`);
        if (!el) return;

        const floorColor = results.safetyFloorCheck.safe ? 'var(--color-positive)' : 'var(--color-negative)';

        el.innerHTML = `
            <div style="background: rgba(255,255,255,0.03); border-radius: 14px; padding: 18px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="font-size: 0.85rem; font-weight: 800; color: #fff; margin-bottom: 14px;">
                    <i class="fas fa-chart-line" style="margin-right: 6px; color: var(--color-accent);"></i> Simulation Results
                </div>

                <!-- Pre-Closure Payout -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Pre-Closure Payout</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.preClosurePayout.amount)}</span>
                </div>

                <!-- New Pension Balance -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">New Pension Balance</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.newPensionBalance)}</span>
                </div>

                <!-- New Minimum Drawdown -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                        New Minimum ${results.june1stRuleApplies ? '<span style="color: var(--color-positive); font-size: 0.7rem;">(June 1st Rule)</span>' : ''}
                    </span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: ${results.june1stRuleApplies ? 'var(--color-positive)' : '#fff'};">
                        ${results.june1stRuleApplies ? '$0.00' : formatCurrency(results.newMinimumDrawdown.amount)}
                    </span>
                </div>

                <!-- Projected Balance -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Projected Balance</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.projectedBalance)}</span>
                </div>

                <!-- Safety Floor Status -->
                <div style="display: flex; justify-content: space-between; padding: 10px 0; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Safety Floor Status</span>
                    <span style="font-size: 0.85rem; font-weight: 700; color: ${floorColor};">
                        <i class="fas ${results.safetyFloorCheck.safe ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="margin-right: 4px;"></i>
                        ${results.safetyFloorCheck.safe ? 'Safe' : `Shortfall ${formatCurrency(results.safetyFloorCheck.shortfall)}`}
                    </span>
                </div>

                <!-- Contribution Caps -->
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">FY ${results.financialYear} Caps</div>
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1; font-size: 0.78rem; color: var(--text-muted);">Concessional: <strong style="color: #fff;">${formatCurrency(results.contributionCaps.concessional)}</strong></div>
                        <div style="flex: 1; font-size: 0.78rem; color: var(--text-muted);">Non-CC: <strong style="color: #fff;">${formatCurrency(results.contributionCaps.nonConcessional)}</strong></div>
                    </div>
                </div>

                <div style="margin-top: 10px; font-size: 0.7rem; color: var(--text-muted); text-align: center;">
                    ${results.daysRemaining} days remaining in FY
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────
    // Info / Reference Tab
    // ─────────────────────────────────────────

    _renderInfoTab(data, calc) {
        const tableRows = DRAWDOWN_TABLE.map(b => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 8px 12px; font-size: 0.8rem; color: ${data.ageAtJuly1 >= b.minAge && data.ageAtJuly1 <= b.maxAge ? 'var(--color-accent)' : 'var(--text-muted)'}; font-weight: ${data.ageAtJuly1 >= b.minAge && data.ageAtJuly1 <= b.maxAge ? '800' : '400'};">
                    ${b.minAge}–${b.maxAge > 100 ? '95+' : b.maxAge}
                </td>
                <td style="padding: 8px 12px; font-size: 0.8rem; text-align: right; font-weight: 700; color: ${data.ageAtJuly1 >= b.minAge && data.ageAtJuly1 <= b.maxAge ? 'var(--color-accent)' : '#fff'};">
                    ${(b.rate * 100).toFixed(0)}%
                </td>
            </tr>
        `).join('');

        return `
            <!-- Drawdown Table -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 10px;">
                    <i class="fas fa-table" style="margin-right: 6px; color: var(--color-accent);"></i>
                    Minimum Drawdown Rates
                </div>
                <table style="width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.02); border-radius: 10px; overflow: hidden;">
                    <thead>
                        <tr style="background: rgba(255,255,255,0.04);">
                            <th style="padding: 10px 12px; font-size: 0.7rem; text-align: left; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Age Bracket</th>
                            <th style="padding: 10px 12px; font-size: 0.7rem; text-align: right; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Min %</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>

            <!-- Key Rules -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 10px;">
                    <i class="fas fa-gavel" style="margin-right: 6px; color: var(--color-accent);"></i>
                    Key Rules
                </div>

                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; margin-bottom: 8px;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: #fff; margin-bottom: 4px;">June 1st Rule</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
                        A pension commencing on or after June 1st has a <strong style="color: var(--color-positive);">$0 minimum drawdown</strong> for the remainder of that financial year.
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; margin-bottom: 8px;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: #fff; margin-bottom: 4px;">Pro-Rata Minimum</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
                        When closing a pension mid-year, the minimum drawdown is proportioned by days elapsed: <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">Balance × Rate × (Days / 365)</code>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: #fff; margin-bottom: 4px;">Transfer Balance Cap</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
                        Current TBC: <strong style="color: #fff;">${formatCurrency(SUPER_THRESHOLDS.transferBalanceCap)}</strong>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; margin-top: 8px;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: #fff; margin-bottom: 4px;">Re-Contribution Strategy</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
                        After closing a pension, you can re-contribute the balance back into accumulation as a <strong style="color: #fff;">non-concessional contribution</strong>, then start a new pension with the consolidated amount.
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; line-height: 1.5;">
                        <div style="margin-bottom: 4px;"><strong style="color: var(--color-accent);">Under 75:</strong> No work test required. 3-year bring-forward available (up to $${(120000 * 3).toLocaleString()}).</div>
                        <div style="margin-bottom: 4px;"><strong style="color: var(--color-accent);">75+:</strong> Work test applies (40hrs in 30 consecutive days within the FY).</div>
                        <div><strong style="color: var(--color-accent);">TSB threshold:</strong> NCC is nil if total super balance ≥ $${(1900000).toLocaleString()} at prior 30 June.</div>
                    </div>
                </div>
            </div>

            <!-- Contribution Caps -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 10px;">
                    <i class="fas fa-coins" style="margin-right: 6px; color: var(--color-accent);"></i>
                    FY ${calc.financialYear} Contribution Caps
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Concessional</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${formatCurrency(calc.contributionCaps.concessional)}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Non-Concessional</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${formatCurrency(calc.contributionCaps.nonConcessional)}</div>
                    </div>
                </div>
            </div>

            <!-- Your Current Values -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 10px;">
                    <i class="fas fa-calculator" style="margin-right: 6px; color: var(--color-accent);"></i>
                    Your Numbers
                </div>
                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px;">
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.8rem;">
                        <span style="color: var(--text-muted);">Annual Minimum Drawdown</span>
                        <span style="font-weight: 700; color: #fff;">${formatCurrency(calc.annualMinimum)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.8rem;">
                        <span style="color: var(--text-muted);">Drawdown Rate</span>
                        <span style="font-weight: 700; color: #fff;">${(calc.drawdownRate * 100).toFixed(0)}%</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.8rem;">
                        <span style="color: var(--text-muted);">Days to EOFY</span>
                        <span style="font-weight: 700; color: #fff;">${calc.daysUntilEOFY}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────

    _getProRataPreview(data) {
        const sd = superStrategyStore.getStateData(SUPER_STATES.PENSION_CLOSURE);
        if (!sd?.closureDate) return null;

        try {
            const fy = getCurrentFinancialYear(new Date(sd.closureDate));
            const fyStart = new Date(fy - 1, 6, 1);
            const msPerDay = 86400000;
            const rate = getDrawdownRate(data.ageAtJuly1);
            const closureDate = new Date(sd.closureDate);
            const daysElapsed = Math.max(1, Math.ceil((closureDate - fyStart) / msPerDay) + 1);
            const fyEnd = new Date(fy, 5, 30);
            const totalDays = Math.ceil((fyEnd - fyStart) / msPerDay) + 1;
            const amount = Math.round(data.pensionBalance * rate * (daysElapsed / totalDays) * 100) / 100;
            return { amount, rate, days: daysElapsed, totalDays };
        } catch (e) {
            return null;
        }
    }

    _renderCommencementPreview(data, dateStr) {
        try {
            const commenceDate = new Date(dateStr);
            const june1st = commenceDate.getMonth() === 5 && commenceDate.getDate() >= 1;
            if (june1st) {
                return `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 14px; background: rgba(6,255,79,0.08); border-radius: 10px; margin-top: 10px; border: 1px solid rgba(6,255,79,0.15);">
                        <i class="fas fa-check-circle" style="color: var(--color-positive); font-size: 1.1rem;"></i>
                        <div>
                            <div style="font-weight: 700; color: var(--color-positive); font-size: 0.85rem;">June 1st Rule Applies</div>
                            <div style="font-size: 0.78rem; color: var(--text-muted);">Minimum drawdown for remainder of this FY is <strong>$0.00</strong>.</div>
                        </div>
                    </div>
                `;
            }
            return '';
        } catch (e) {
            return '';
        }
    }

    // ─────────────────────────────────────────
    // Event Binding
    // ─────────────────────────────────────────

    _bindEvents() {
        if (!this.container) return;

        // Tab switching
        this.container.querySelectorAll('.super-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.activeTab = e.currentTarget.dataset.tab;
                this.render();
            });
        });

        // Balance inputs
        const accInput = this.container.querySelector(`#${IDS.SUPER_ACCUMULATION_INPUT}`);
        const penInput = this.container.querySelector(`#${IDS.SUPER_PENSION_INPUT}`);
        const floorInput = this.container.querySelector(`#${IDS.SUPER_SAFETY_FLOOR_INPUT}`);
        const ageInput = this.container.querySelector(`#${IDS.SUPER_AGE_INPUT}`);

        if (accInput) accInput.addEventListener('change', (e) => { superStrategyStore.setAccumulationBalance(e.target.value); this.render(); });
        if (penInput) penInput.addEventListener('change', (e) => { superStrategyStore.setPensionBalance(e.target.value); this.render(); });
        if (floorInput) floorInput.addEventListener('change', (e) => { superStrategyStore.setSafetyFloor(e.target.value); this.render(); });
        if (ageInput) ageInput.addEventListener('change', (e) => { superStrategyStore.setAge(e.target.value); this.render(); });

        // Step-specific inputs
        this._bindStepInputs();

        // Advance button
        const advanceBtn = this.container.querySelector('#super-advance-btn');
        if (advanceBtn) {
            advanceBtn.addEventListener('click', () => {
                const result = superStrategyStore.advanceState();
                if (!result.success) {
                    // Could show toast, but for now the button text shows the message
                    console.warn('[SuperStrategyUI]', result.message);
                }
                // Re-render happens via SUPER_STATE_CHANGED event
            });
        }

        // Reset button
        const resetBtn = this.container.querySelector('#super-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset the super strategy pipeline? Balance and floor values will be preserved.')) {
                    superStrategyStore.resetStateMachine();
                }
            });
        }

        // Simulation
        const simBtn = this.container.querySelector('#super-run-sim-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                const dateInput = this.container.querySelector(`#${IDS.SUPER_SIMULATION_DATE}`);
                const contribInput = this.container.querySelector('#super-sim-contribution');
                if (!dateInput?.value) return;

                const results = superStrategyStore.runSimulation(
                    dateInput.value,
                    parseFloat(contribInput?.value) || 0
                );
                this._renderSimulationResults(results);
            });
        }
    }

    _bindStepInputs() {
        const current = superStrategyStore.getCurrentState();

        switch (current) {
            case SUPER_STATES.CONTRIBUTION_CLEARANCE: {
                const amountEl = this.container.querySelector(`#${IDS.SUPER_CONTRIBUTION_AMOUNT}`);
                const dateEl = this.container.querySelector(`#${IDS.SUPER_CONTRIBUTION_DATE}`);
                if (amountEl) amountEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { amount: parseFloat(e.target.value) || 0 });
                    this.render();
                });
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { clearedDate: e.target.value });
                    this.render();
                });
                break;
            }

            case SUPER_STATES.NOI_SUBMISSION: {
                const amountEl = this.container.querySelector(`#${IDS.SUPER_NOI_AMOUNT}`);
                const dateEl = this.container.querySelector(`#${IDS.SUPER_NOI_DATE}`);
                if (amountEl) amountEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { deductionAmount: parseFloat(e.target.value) || 0 });
                    this.render();
                });
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { submittedDate: e.target.value });
                    this.render();
                });
                break;
            }

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT: {
                const checkEl = this.container.querySelector(`#${IDS.SUPER_ACK_CHECKBOX}`);
                if (checkEl) checkEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, {
                        acknowledged: e.target.checked,
                        acknowledgedDate: e.target.checked ? new Date().toISOString() : null
                    });
                    this.render();
                });
                break;
            }

            case SUPER_STATES.PENSION_CLOSURE: {
                const dateEl = this.container.querySelector(`#${IDS.SUPER_CLOSURE_DATE}`);
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { closureDate: e.target.value });
                    this.render();
                });
                break;
            }

            case SUPER_STATES.RECONTRIBUTION: {
                const amountEl = this.container.querySelector(`#${IDS.SUPER_RECONTRIBUTION_AMOUNT}`);
                const dateEl = this.container.querySelector(`#${IDS.SUPER_RECONTRIBUTION_DATE}`);
                if (amountEl) amountEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { recontributionAmount: parseFloat(e.target.value) || 0 });
                    this.render();
                });
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { recontributionDate: e.target.value });
                    this.render();
                });
                break;
            }

            case SUPER_STATES.PENSION_COMMENCEMENT: {
                const dateEl = this.container.querySelector(`#${IDS.SUPER_COMMENCE_DATE}`);
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { commencementDate: e.target.value });
                    this.render();
                });
                break;
            }
        }

        // Custom reminder date binding (present on pipeline tab)
        const customReminderEl = this.container?.querySelector(`#${IDS.SUPER_CUSTOM_REMINDER_DATE}`);
        if (customReminderEl) {
            customReminderEl.addEventListener('change', (e) => {
                superStrategyStore.setReminders(superStrategyStore.data.reminderPresets, e.target.value || null);
                this.render();
            });
        }
    }
}
