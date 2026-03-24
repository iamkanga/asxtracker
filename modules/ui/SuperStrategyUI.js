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
    RECONTRIBUTION_RULES,
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
                            <div style="display: inline-flex; align-items: center; justify-content: center; width: 1.2rem; height: 1.2rem; position: relative; margin-right: 12px; vertical-align: middle;">
                                <i class="fas ${UI_ICONS.SUPER_STRATEGY}" style="position: absolute; font-size: 1.2rem; color: var(--color-accent);"></i>
                                <span style="position: relative; color: var(--bg-color); font-weight: 950; font-size: 0.55rem; z-index: 10; font-family: 'Inter', sans-serif; margin-top: 1px;">S</span>
                            </div>
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
            <div style="text-align: center; margin-top: 16px; color: var(--color-accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">
                <i class="fas fa-calendar-day" style="margin-right: 6px;"></i>Financial Year ${fy - 1}/${String(fy).slice(-2)}
            </div>
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
            { id: 'pipeline', label: 'Strategy', icon: 'fa-tasks' },
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
        // Section divider header — shared across the whole page
        const H = (t) => `<div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:20px 0 12px 2px;">${t}</div>`;
        
        return `
            ${this._renderBalanceHeader(data, calc, true)}
            
            ${H('Strategy Execution')}
            <div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;border:1px solid rgba(255,255,255,0.06);">
                ${this._renderProgressBar()}
                ${this._renderActiveStepDetail(data)}
            </div>
            
            ${H('Timing Strategies')}
            ${this._renderTimingStrategies(data, calc)}
            ${this._renderSafetyFloorBanner(data, calc)}
            
            ${H('EOFY Reminders')}
            ${this._renderReminderStatus(calc)}
            
            ${H('Quick Access')}
            ${this._renderQuickLinks(data)}
        `;
    }

    _renderBalanceHeader(data, calc, isEditable = true) {
        const floorPct = data.capitalSafetyFloor > 0 ? (calc.safetyFloorStatus.safe ? 'safe' : 'warning') : 'none';
        const floorColor = floorPct === 'safe' ? 'var(--color-positive)' : floorPct === 'warning' ? 'var(--color-negative)' : 'var(--text-muted)';

        // --- Shared token shortcuts (enforced everywhere below) ---
        const SL  = 'font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);opacity:0.55;margin-bottom:4px;'; // section label
        const CV  = 'font-size:1.1rem;font-weight:900;color:#fff;line-height:1.2;';   // card value
        const CST = 'font-size:0.7rem;font-weight:600;color:var(--text-muted);opacity:0.7;margin-top:3px;'; // card subtext
        const CARD = 'background:rgba(255,255,255,0.04);border-radius:14px;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';

        const fy = calc.financialYear;
        // Explainer: Details as of the 1st of July
        
        return `
            <div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px; ${!isEditable ? 'opacity: 0.6; filter: grayscale(0.3);' : ''}">

                <!-- Header with Explainer -->
                <div style="margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                    <div style="font-size: 0.9rem; font-weight: 950; color: #fff; text-transform: uppercase; letter-spacing: 1px;">Your Member Position</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; opacity: 0.7; margin-top: 2px;">Details as of 1st July</div>
                </div>

                <!-- Accumulation + Pension — identical card structure -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:10px;">
                    <div style="${CARD}">
                        <div style="${SL}">Accumulation</div>
                        <input type="number" id="${IDS.SUPER_ACCUMULATION_INPUT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${data.accumulationBalance || ''}" placeholder="0.00"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;width:100%;outline:none;">
                    </div>
                    <div style="${CARD}">
                        <div style="${SL}">Pension</div>
                        <input type="number" id="${IDS.SUPER_PENSION_INPUT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${data.pensionBalance || ''}" placeholder="0.00"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;width:100%;outline:none;">
                    </div>
                </div>

                <!-- Total Member Balance - Moved Underneath -->
                <div style="text-align:center; padding: 18px 0; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div style="${SL}display:block;margin-bottom:8px; opacity:0.4;">Total Member Balance</div>
                    <div style="font-size:1.8rem;font-weight:950;color:#fff;line-height:1;">${formatCurrency(calc.totalBalance)}</div>
                    ${data.capitalSafetyFloor > 0 ? `
                        <div style="margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(0,0,0,0.2);border-radius:20px;border:1px solid ${floorColor}33;">
                            <i class="fas ${calc.safetyFloorStatus.safe ? 'fa-check' : 'fa-exclamation'}" style="color:${floorColor};font-size:0.6rem;"></i>
                            <span style="font-size:0.65rem;font-weight:800;color:${floorColor};">Floor: ${formatCurrency(data.capitalSafetyFloor)}</span>
                        </div>
                    ` : ''}
                </div>

                <!-- Spacer -->
                <div style="height: 12px;"></div>

                <!-- Age + Contribution Status — identical card structure -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:10px;">
                    <div style="${CARD}">
                        <div style="${SL}">Age</div>
                        <input type="number" id="${IDS.SUPER_AGE_INPUT}" value="${data.ageAtJuly1 || 65}" min="0" max="120"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;outline:none;width:60px;">
                    </div>
                    <div style="${CARD}">
                        <div style="${SL}">Contrib. Cap Status</div>
                        <div style="${CV}${calc.recontributionEligibility?.eligible ? 'color:var(--color-positive);' : 'color:var(--color-warning);'}">
                            ${calc.recontributionEligibility?.eligible ? 'Available' : 'Cap Used'}
                        </div>
                        ${!calc.recontributionEligibility?.eligible && calc.recontributionEligibility?.bringForwardStatus?.nextAvailableFY ? `
                            <div style="${CST}">Resets FY ${calc.recontributionEligibility.bringForwardStatus.nextAvailableFY - 1}/${String(calc.recontributionEligibility.bringForwardStatus.nextAvailableFY).slice(-2)}</div>
                        ` : ''}
                    </div>
                </div>

                <!-- Bring-Forward — same card structure -->
                <div style="${CARD}">
                    <div style="${SL} margin-bottom: 2px;">Bring-Forward Started</div>
                    <div style="${SL} opacity: 0.35; margin-bottom: 8px;">Financial Year Ending</div>
                    <input type="number" id="${IDS.SUPER_BRING_FORWARD_FY}"
                           value="${data.bringForwardTriggeredFY || ''}" placeholder="e.g. 2025" min="2000" max="2099"
                           ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                           style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;outline:none;width:100%;">
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
                        <div style="font-size: 0.55rem; font-weight: 800; color: var(--text-muted); margin-top: 6px; text-align: center; max-width: 60px; line-height: 1.1; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${s.label.includes('Contribution') && i > 0 ? 'Re-Contrib' : s.label.split(' ')[0]}
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
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Cleared Amount</label>
                        <input type="number" id="${IDS.SUPER_CONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.amount || ''}" placeholder="0.00" step="0.01"
                               style="border-radius:10px;padding:11px;font-weight:700;outline:none;">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Date Cleared</label>
                        <input type="date" id="${IDS.SUPER_CONTRIBUTION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.clearedDate || ''}"
                               style="border-radius:10px;padding:11px;cursor:pointer;font-weight:700;outline:none;">
                    </div>
                `;
                break;

            case SUPER_STATES.NOI_SUBMISSION:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Deduction Amount</label>
                        <input type="number" id="${IDS.SUPER_NOI_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.deductionAmount || ''}" placeholder="0.00" step="0.01"
                               style="border-radius:10px;padding:11px;font-weight:700;">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Date Submitted</label>
                        <input type="date" id="${IDS.SUPER_NOI_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.submittedDate || ''}"
                               style="border-radius:10px;padding:11px;cursor:pointer;font-weight:700;">
                    </div>
                `;
                break;

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT:
                fieldsHtml = `
                    <div style="display: flex; align-items: center; gap: 14px; padding: 18px; background: rgba(255,165,0,0.06); border-radius: 16px; border: 1px solid rgba(255,165,0,0.1); margin-bottom: 20px;">
                        <div style="background: rgba(255,165,0,0.1); width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #ffa500; flex-shrink: 0;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 1.2rem;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.65rem; color: #ffa500; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">Validation Gate</div>
                            <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; opacity: 0.9; font-weight: 600;">Confirm fund NOI acknowledgement before proceeding.</div>
                        </div>
                    </div>
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 14px; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
                        <input type="checkbox" id="${IDS.SUPER_ACK_CHECKBOX}" ${stateData.acknowledged ? 'checked' : ''}
                               style="width: 20px; height: 20px; accent-color: var(--color-accent); cursor: pointer;">
                        <span style="font-size: 0.85rem; font-weight: 800; color: #fff; letter-spacing: 0.2px;">Fund acknowledgement received</span>
                    </label>
                `;
                break;

            case SUPER_STATES.PENSION_CLOSURE: {
                const proRata = stateData.closureDate && data.pensionBalance > 0
                    ? this._getProRataPreview(data)
                    : null;
                fieldsHtml = `
                    <div style="margin-bottom: 24px;">
                        <div style="font-size: 0.78rem; color: var(--color-warning); line-height: 1.5; font-weight: 700; background: rgba(255,165,0,0.08); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,165,0,0.15); margin-bottom: 20px;">
                            <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
                            Every pension closure requires a final pro-rata drawdown payment to be confirmed first. This ensures regulatory compliance before the accounts are closed and merged back into accumulation.
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:20px;">
                            <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Planned Closure Date</label>
                            <input type="date" id="${IDS.SUPER_CLOSURE_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                                   value="${stateData.closureDate || ''}"
                                   style="border-radius:10px;padding:12px;cursor:pointer;font-weight:700;outline:none;">
                        </div>

                        ${proRata ? `
                            <div style="background: linear-gradient(135deg, rgba(255,165,0,0.1) 0%, rgba(255,165,0,0.05) 100%); border-radius:16px; padding:20px; border:1px solid rgba(255,165,0,0.2); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                                <div style="font-size:0.65rem;color:#ffa500;font-weight:900;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">Mandatory Pro-Rata Payment</div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                    <span style="font-size:0.85rem;color:#fff;font-weight:700;">Required Payout</span>
                                    <span style="font-size:1.6rem;font-weight:950;color:#ffa500;">${formatCurrency(proRata.amount)}</span>
                                </div>
                                <div style="height:1px; background:rgba(255,165,0,0.2); margin:12px 0;"></div>
                                <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);font-weight:700;opacity:0.8;">
                                    <span>${proRata.days} days elapsed in FY</span>
                                    <span style="color:#ffa500; opacity:1;">Rate: ${(proRata.rate * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
                break;
            }

            case SUPER_STATES.PENSION_COMMENCEMENT:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Commencement Date</label>
                        <input type="date" id="${IDS.SUPER_COMMENCE_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.commencementDate || ''}"
                               style="border-radius:10px;padding:11px;cursor:pointer;font-weight:700;outline:none;">
                    </div>
                    ${stateData.commencementDate ? this._renderCommencementPreview(data, stateData.commencementDate) : ''}
                `;
                break;

            case SUPER_STATES.FINALISED:
                return `
                    <div id="${IDS.SUPER_STEP_DETAIL}" style="text-align: center; padding: 40px 24px; background: rgba(6,255,79,0.04); border-radius: 20px; border: 1px solid rgba(6,255,79,0.1); margin: 12px 0 24px; box-shadow: var(--shadow-strong);">
                        <div style="width: 72px; height: 72px; background: rgba(6,255,79,0.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--color-positive); margin: 0 auto 24px;">
                            <i class="fas fa-check-double" style="font-size: 2.22rem;"></i>
                        </div>
                        <h3 style="font-size: 1.4rem; font-weight: 950; color: #fff; margin-bottom: 12px; letter-spacing: -0.5px;">Strategy Finalized</h3>
                        <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.6; max-width: 320px; margin: 0 auto 28px; font-weight: 500; opacity: 0.9;">
                            Your pension restart has been successfully modeled and recorded. All legislative requirements have been accounted for.
                        </p>
                        
                        <div style="background: rgba(0,0,0,0.2); border-radius: 16px; padding: 20px; margin-bottom: 32px; text-align: left; border: 1px solid rgba(255,255,255,0.03);">
                            <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);opacity:0.6;margin-bottom:10px;">Consolidated Restart Balance</div>
                            <div style="font-size:1.6rem;font-weight:950;color:var(--color-positive);line-height:1;">${formatCurrency(superStrategyStore.getTotalBalance())}</div>
                        </div>

                        <button id="super-final-reset-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}" style="width: 100%; border-radius: 12px; padding: 14px; font-weight: 800; font-size: 0.85rem; background: var(--color-accent); color: #000; border: none; cursor: pointer;">
                            Restart New Pipeline
                        </button>
                    </div>
                `;

            case SUPER_STATES.RECONTRIBUTION: {
                const eligibility = superStrategyStore.getRecontributionEligibility();
                const closureData = superStrategyStore.getStateData(SUPER_STATES.PENSION_CLOSURE);
                const closedBalance = data.pensionBalance - (closureData?.proRataPayout || 0);

                fieldsHtml = `
                    <!-- Eligibility Status Tile -->
                    <div style="display: flex; align-items: center; gap: 14px; padding: 18px; background: rgba(${eligibility.eligible ? '6,255,79,0.06' : '255,59,48,0.06'}); border-radius: 16px; border: 1px solid rgba(${eligibility.eligible ? '6,255,79,0.1' : '255,59,48,0.1'}); margin-bottom: 24px;">
                        <div style="background: rgba(${eligibility.eligible ? '6,255,79,0.12' : '255,59,48,0.12'}); width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: ${eligibility.eligible ? 'var(--color-positive)' : '#ff3b30'}; flex-shrink: 0;">
                            <i class="fas ${eligibility.eligible ? 'fa-check-circle' : 'fa-times-circle'}" style="font-size: 1.3rem;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.65rem; color: ${eligibility.eligible ? 'var(--color-positive)' : '#ff3b30'}; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">Contrib. Eligibility</div>
                            <div style="font-size: 0.85rem; font-weight: 900; color: #fff; line-height: 1.2;">
                                ${eligibility.eligible ? `Eligible: ${formatCurrency(eligibility.maxAmount)}` : `Cap Used (Available FY ${eligibility.bringForwardStatus?.nextAvailableFY - 1}/${String(eligibility.bringForwardStatus?.nextAvailableFY).slice(-2)})`}
                            </div>
                        </div>
                    </div>

                    <!-- Account Gateways -->
                    <div style="margin-bottom: 28px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 12px;">Fund Entry Thresholds</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 12px;">
                            <div style="background: rgba(255,255,255,0.03); border-radius: 16px; padding: 16px; border-left: 4px solid var(--color-accent);">
                                <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 6px; opacity: 0.6;">Accumulation Min</div>
                                <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.minAccumulationBalance)}</div>
                            </div>
                            <div style="background: rgba(255,255,255,0.03); border-radius: 16px; padding: 16px; border-left: 4px solid var(--color-accent);">
                                <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 6px; opacity: 0.6;">Pension Min</div>
                                <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.minPensionRestart)}</div>
                            </div>
                        </div>
                        <div style="padding: 14px 18px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 4px; opacity: 0.6;">Fee Protection Limit</div>
                                <div style="font-size: 1rem; font-weight: 900; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.autoFeeCapThreshold)}</div>
                            </div>
                            <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; opacity: 0.6; letter-spacing: 1px;">ATO Fee Cap: 3%</div>
                        </div>
                    </div>

                    <!-- Pension Restart Model -->
                    <div style="margin-bottom: 28px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 12px;">Strategic Continuity</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; font-weight: 600; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.03);">
                            Brighter Super utilizes a <strong>Restart</strong> process (not simple closure):
                            <ul style="padding-left: 20px; margin: 10px 0 0 0; opacity: 0.8; font-weight: 500;">
                                <li style="margin-bottom: 4px;">Existing pension is closed (pro-rata).</li>
                                <li style="margin-bottom: 4px;">Funds combine in accumulation.</li>
                                <li style="margin-bottom: 4px;"><strong>New pension</strong> starts with full balance.</li>
                                <li>Drawdowns reset based on the consolidated restart.</li>
                            </ul>
                        </div>
                    </div>

                    <!-- NCC Multi-Year Caps -->
                    <div style="margin-bottom: 28px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 12px;">NCC Contribution Caps</div>
                        <div style="background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid rgba(255,255,255,0.03); overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.72rem; color: var(--text-muted);">
                                <thead>
                                    <tr style="background: rgba(255,255,255,0.03);">
                                        <th style="padding: 10px 16px; text-align: left; font-weight: 800; text-transform: uppercase; opacity: 0.6;">FY</th>
                                        <th style="padding: 10px 16px; text-align: right; font-weight: 800; text-transform: uppercase; opacity: 0.6;">Standard</th>
                                        <th style="padding: 10px 16px; text-align: right; font-weight: 800; text-transform: uppercase; opacity: 0.6;">B-Forward</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                        <td style="padding: 10px 16px; font-weight: 700; color: #fff;">23-24</td>
                                        <td style="padding: 10px 16px; text-align: right; font-weight: 600;">$110,000</td>
                                        <td style="padding: 10px 16px; text-align: right; font-weight: 800; color: var(--color-accent);">$330,000</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                        <td style="padding: 10px 16px; font-weight: 700; color: #fff;">24-25</td>
                                        <td style="padding: 10px 16px; text-align: right; font-weight: 600;">$120,000</td>
                                        <td style="padding: 10px 16px; text-align: right; font-weight: 800; color: var(--color-accent);">$360,000</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 16px; font-weight: 700; color: #fff;">25-26*</td>
                                        <td style="padding: 10px 16px; text-align: right; font-weight: 600;">$120,000</td>
                                        <td style="padding: 10px 16px; text-align: right; font-weight: 800; color: var(--color-accent);">$360,000</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 8px; font-style: italic; opacity: 0.5;">*Indexation estimated. TSB limits ($1.9M) apply.</div>
                    </div>

                    <!-- Transfer Balance Cap Tile -->
                    <div style="margin-bottom: 24px; padding: 18px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="color: var(--color-accent); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">Transfer Balance Cap</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; font-weight: 600; opacity: 0.85;">
                            The maximum lifetime limit ($1.9M) you can transfer into tax-free pensions. Each restart counts the full amount against this total limit.
                        </div>
                    </div>

                    <!-- Available to Re-Contribute Tile -->
                    ${closedBalance > 0 ? `
                        <div style="background: rgba(255,255,255,0.04); border-radius: 16px; padding: 18px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.6;">Consolidated Entry Balance</div>
                            <div style="font-size: 1.3rem; font-weight: 950; color: #fff; margin-bottom: 4px;">${formatCurrency(closedBalance)}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; opacity: 0.7;">Full balance available for re-entry. Min ${formatCurrency(SUPER_THRESHOLDS.minPensionRestart)} is required.</div>
                        </div>
                    ` : ''}

                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 20px;">
                        <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: block; opacity: 0.7;">Re-Contribution Amount</label>
                        <input type="number" id="${IDS.SUPER_RECONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionAmount || ''}" placeholder="0.00" step="0.01"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               max="${eligibility.maxAmount}"
                               style="border-radius: 12px; padding: 12px; font-weight: 700; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 20px;">
                        <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: block; opacity: 0.7;">Re-Contribution Date</label>
                        <input type="date" id="${IDS.SUPER_RECONTRIBUTION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionDate || ''}"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               style="border-radius: 12px; padding: 12px; font-weight: 700; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                `;
                break;
            }
        }

        return `
            <div id="${IDS.SUPER_STEP_DETAIL}" class="${CSS_CLASSES.SUPER_DETAIL_PANEL}"
                 style="margin-top:12px;">
                <div style="padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);opacity:0.55;margin-bottom:6px;">Active Phase</div>
                    <div style="font-size:1rem;font-weight:900;color:#fff;margin-bottom:6px;line-height:1.2;">${label}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);line-height:1.5;opacity:0.8;font-weight:500;">${desc}</div>
                </div>
                ${fieldsHtml}
                <div style="display:flex;gap:8px;margin-top:16px;">
                    <button id="super-advance-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}"
                            style="flex:1;padding:12px;border-radius:10px;font-weight:700;font-size:0.82rem;cursor:pointer;
                                   background:${validation.valid ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)'};
                                   color:${validation.valid ? '#000' : 'var(--text-muted)'};border:none;
                                   opacity:${validation.valid ? '1' : '0.5'};">
                        ${validation.valid ? 'Complete &amp; Advance →' : validation.message}
                    </button>
                    <button id="super-reset-btn" style="padding:12px 16px;border-radius:10px;background:rgba(255,59,48,0.12);color:#ff3b30;border:none;cursor:pointer;font-weight:600;font-size:0.8rem;">
                        <i class="fas fa-undo" style="font-size:0.75rem;"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────
    // Timing Strategy Cards (Phase C)
    // ─────────────────────────────────────────

    _renderTimingStrategies(data, calc) {
        const cards = [];
        const daysLeft = calc.daysUntilEOFY;
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const currentState = superStrategyStore.getCurrentState();

        // 1. EOFY Contribution Urgency
        if (daysLeft <= 90) {
            const urgency = daysLeft <= 14 ? 'critical' : daysLeft <= 30 ? 'high' : 'moderate';
            const colors = { critical: '#ff3b30', high: '#ffa500', moderate: 'var(--color-accent)' };
            cards.push({
                icon: 'fa-alarm-clock',
                title: 'EOFY Contribution Deadline',
                color: colors[urgency],
                text: `${daysLeft} days to finalise concessional entries. Funds must clear before June 30 for tax deductibility.`
            });
        }

        // 2. June 1st Play
        if (currentMonth >= 3 && currentMonth <= 5) { // April-June
            const isPostClosure = [SUPER_STATES.RECONTRIBUTION, SUPER_STATES.PENSION_COMMENCEMENT].includes(currentState);
            if (isPostClosure || currentMonth === 4 || currentMonth === 5) {
                cards.push({
                    icon: 'fa-calendar-star',
                    title: 'June 1st Rule Opportunity',
                    color: 'var(--color-positive)',
                    text: 'Restarting on or after June 1 suppresses the mandatory minimum drawdown for the remainder of this financial year.'
                });
            }
        }

        // 3. Re-Contribution Window
        if (currentState === SUPER_STATES.PENSION_CLOSURE || currentState === SUPER_STATES.RECONTRIBUTION) {
            cards.push({
                icon: 'fa-repeat',
                title: 'Re-Contribution Window',
                color: 'var(--color-accent)',
                text: `Maximise compounding by re-contributing early in the FY.`
            });
        }

        // 4. Capital Preservation
        if (data.capitalSafetyFloor > 0 && !calc.safetyFloorStatus.safe) {
            cards.push({
                icon: 'fa-user-shield',
                title: 'Preservation Alert',
                color: '#ff3b30',
                text: `Balance is below your specified ${formatCurrency(data.capitalSafetyFloor)} safety floor.`
            });
        }

        if (!cards.length) return '';

        return `
            <div style="margin-bottom:16px;">
                ${cards.map(c => `
                    <div style="display:flex;align-items:flex-start;gap:14px;padding:16px;background:rgba(255,255,255,0.04);border-radius:14px;margin-bottom:10px;border-left:4px solid ${c.color};border-top:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="color:${c.color};font-size:1.1rem;width:32px;height:32px;background:rgba(0,0,0,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas ${c.icon}"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:0.85rem;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:0.2px;">${c.title}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);line-height:1.4;font-weight:600;opacity:0.8;">${c.text}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    _renderSafetyFloorBanner(data, calc) {
        if (calc.safetyFloorStatus.safe || !data.capitalSafetyFloor) return '';
        return `
            <div class="${CSS_CLASSES.SUPER_ALERT_BANNER}"
                 style="display:flex;align-items:center;gap:14px;padding:16px;background:rgba(255,59,48,0.06);border-radius:14px;margin-bottom:16px;border:1px solid rgba(255,59,48,0.1);">
                <div style="background:rgba(255,59,48,0.12);width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#ff3b30;flex-shrink:0;position:relative;">
                    <i class="fas ${UI_ICONS.SUPER_STRATEGY}" style="position:absolute;font-size:1.2rem;"></i>
                    <span style="position:relative;color:#121212;font-weight:950;font-size:0.55rem;z-index:10;font-family:'Inter', sans-serif;margin-top:1px;">S</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:0.62rem;color:#ff3b30;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Floor Breached</div>
                    <div style="font-size:0.85rem;color:#fff;font-weight:900;line-height:1.2;">
                        ${formatCurrency(calc.totalBalance)} <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">(Shortfall: ${formatCurrency(calc.safetyFloorStatus.shortfall)})</span>
                    </div>
                </div>
            </div>
        `;
    }

    _renderReminderStatus(calc) {
        const daysLeft = calc.daysUntilEOFY;
        const reminders = superStrategyStore.getActiveReminders();
        const data = superStrategyStore.data;
        const isCountdownActive = reminders.some(r => r.type === 'countdown');
        const countdownColor = daysLeft <= 30 ? '#ff3b30' : daysLeft <= 60 ? '#ffa500' : 'var(--color-positive)';

        // Shared tokens — must match the rest of the page
        const SL   = 'font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);opacity:0.55;margin-bottom:4px;display:block;';
        const CV   = 'font-size:1.1rem;font-weight:900;color:#fff;line-height:1.2;';
        const CARD = 'background:rgba(255,255,255,0.04);border-radius:14px;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';

        return `
            <div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.06);margin-bottom:16px;">

                <!-- Countdown row -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div>
                        <div style="${SL}">EOFY Countdown</div>
                        <div style="font-size:1.6rem;font-weight:950;color:${countdownColor};line-height:1;">${daysLeft} Days</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="${SL}">Alert Schedule</div>
                        <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);opacity:0.8;">Every Monday</div>
                        <div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);opacity:0.55;">6 weeks before year end</div>
                    </div>
                </div>

                <!-- Weekly Alert + Custom Reminder — identical card structure -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;">
                    <div style="${CARD}">
                        <div style="${SL}">Weekly Alerts</div>
                        <div style="${CV}${isCountdownActive ? 'color:var(--color-positive);' : ''}">
                            ${isCountdownActive ? 'Active' : 'Inactive'}
                        </div>
                    </div>
                    <div style="${CARD}">
                        <div style="${SL}">Custom Date</div>
                        <input type="date" id="${IDS.SUPER_CUSTOM_REMINDER_DATE}"
                               value="${data.customReminderDate || ''}"
                               style="font-size:1.1rem;font-weight:900;color:#fff;background:transparent;border:none;padding:0;cursor:pointer;outline:none;width:100%;">
                    </div>
                </div>

            </div>
        `;
    }

    _renderQuickLinks(data) {
        const links = [
            { label: 'Brighter Super', url: data.fundPortalUrl, icon: 'fa-university' },
            { label: 'ATO Drawdown Rates', url: data.atoDrawdownUrl, icon: 'fa-balance-scale' }
        ];

        const CARD = 'background:rgba(255,255,255,0.04);border-radius:14px;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';

        return `
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:16px;">
                ${links.map(l => `
                    <a href="${l.url}" target="_blank" rel="noopener noreferrer"
                       style="${CARD}display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;transition:opacity 0.2s;">
                        <i class="fas ${l.icon}" style="color:var(--color-accent);font-size:0.9rem;flex-shrink:0;"></i>
                        <span style="font-size:0.78rem;font-weight:700;">${l.label}</span>
                    </a>
                `).join('')}
            </div>
        `;
    }

    // ─────────────────────────────────────────
    // Simulation Tab
    // ─────────────────────────────────────────

    _renderSimulationTab(data, calc) {
        const H = (t) => `<div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:20px 0 12px 2px;">${t}</div>`;
        return `
            ${this._renderBalanceHeader(data, calc, false)}

            ${H('What-If Simulator')}
            <div style="margin-bottom:32px;background:rgba(255,255,255,0.04);border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.06);box-shadow:var(--shadow-strong);">
                <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;font-weight:500;margin-bottom:24px;opacity:0.8;">
                    Model the impact of restarting your pension on a specific date. See how timing affects your pre-closure drawdown, new pension minimum, and capital sustainability.
                </div>

                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                    <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Simulation Start</label>
                    <input type="date" id="${IDS.SUPER_SIMULATION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                           style="border-radius:10px;padding:11px;cursor:pointer;font-weight:700;outline:none;">
                </div>

                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                    <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Modeled Re-Contrib</label>
                    <input type="number" id="super-sim-contribution" class="${CSS_CLASSES.FORM_CONTROL}"
                           placeholder="0.00" step="0.01"
                           style="border-radius:10px;padding:11px;font-weight:700;outline:none;">
                </div>

                <div style="margin-bottom:20px;padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div style="font-size:0.85rem;font-weight:800;color:#fff;letter-spacing:0.2px;">Claim as Tax Deduction (NOI)</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;font-weight:600;opacity:0.7;">Shifts to concessional cap. Incurs 15% tax.</div>
                        </div>
                        <label class="switch-small">
                            <input type="checkbox" id="${IDS.SUPER_SIM_DEDUCTIBLE}">
                            <span class="slider-small round" style="cursor:pointer;"></span>
                        </label>
                    </div>
                </div>

                <button id="super-run-sim-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}"
                        style="width:100%;padding:14px;border-radius:10px;font-weight:800;font-size:0.85rem;cursor:pointer;background:var(--color-accent);color:#000;border:none;">
                    Run Forecast Simulation
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
            <div style="background: rgba(255,255,255,0.03); border-radius: 20px; padding: 24px; margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);opacity:0.55;margin-bottom:20px;">Forecast Results</div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px;">
                    <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Pension Restart</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${formatCurrency(results.newPensionBalance)}</div>
                        ${results.newPensionBalance < SUPER_THRESHOLDS.minPensionRestart ? `
                            <div style="font-size: 0.55rem; color: #ff3b30; font-weight: 700; margin-top: 2px;">
                                <i class="fas fa-exclamation-triangle"></i> Below Brighter Super ${formatCurrency(SUPER_THRESHOLDS.minPensionRestart)} Min
                            </div>
                        ` : ''}
                    </div>
                    <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Min Drawdown</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--color-accent);">${formatCurrency(results.newMinimumDrawdown.amount)}</div>
                        <div style="font-size: 0.55rem; color: var(--text-muted); margin-top: 2px;">${results.june1stRuleApplies ? 'June 1st Rule ($0)' : `Pro-rata (${results.newMinimumDrawdown.days} days)`}</div>
                    </div>
                </div>

                <!-- Contribution Net -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                        ${results.isDeductible ? 'Concessional (Deductible)' : 'Non-Concessional'}
                    </span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">
                        ${formatCurrency(results.grossContribution)}
                    </span>
                </div>

                ${results.isDeductible ? `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.75rem; color: #ff3b30; font-weight: 600;">Less 15% Contribution Tax</span>
                    <span style="font-size: 0.85rem; font-weight: 700; color: #ff3b30;">-${formatCurrency(results.contributionTax)}</span>
                </div>
                ` : ''}

                <!-- Pre-Closure Payout -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Pre-Closure Payout</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.preClosurePayout.amount)}</span>
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

                <!-- Cap Analysis -->
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                        FY ${results.financialYear} Cap Analysis
                    </div>
                    
                    <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Total Non-CC Cap</span>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #fff;">${formatCurrency(results.capAnalysis.nonConcessionalCap)}</span>
                        </div>

                        ${results.capAnalysis.historicalUtilization > 0 ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Historical Utilization</span>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #fff;">${formatCurrency(results.capAnalysis.historicalUtilization)}</span>
                        </div>
                        ` : ''}

                        ${results.capAnalysis.utilizedInPipeline > 0 ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-size: 0.75rem; color: var(--color-accent);">Utilized in Pipeline</span>
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-accent);">${formatCurrency(results.capAnalysis.utilizedInPipeline)}</span>
                        </div>
                        ` : ''}

                        <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Remaining Room</span>
                            <span style="font-size: 0.75rem; font-weight: 700; color: ${results.capAnalysis.isOverCap ? 'var(--color-negative)' : 'var(--color-positive)'};">
                                ${formatCurrency(results.capAnalysis.remainingNCC)}
                            </span>
                        </div>
                    </div>

                    ${results.capAnalysis.isOverCap ? `
                        <div style="margin-top: 10px; padding: 8px; background: rgba(255, 59, 48, 0.1); border-radius: 6px; border: 1px solid rgba(255, 59, 48, 0.2); display: flex; gap: 8px; align-items: center;">
                            <i class="fas fa-exclamation-triangle" style="color: #ff3b30; font-size: 0.8rem;"></i>
                            <div style="font-size: 0.7rem; color: #ff3b30; font-weight: 600; line-height: 1.3;">
                                ${results.isDeductible ? 'Concessional' : 'Non-Concessional'} simulation exceeds cap by ${formatCurrency(results.capAnalysis.overflow)}.
                            </div>
                        </div>
                    ` : ''}

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
        const fy = calc.financialYear;
        const eligibility = superStrategyStore.getRecontributionEligibility();
        const bfFY = data.bringForwardTriggeredFY;
        const H = (t) => `<div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:20px 0 12px 2px;">${t}</div>`;

        const tableRows = DRAWDOWN_TABLE.map(b => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 10px 16px; font-size: 0.8rem; color: ${data.ageAtJuly1 >= b.minAge && data.ageAtJuly1 <= b.maxAge ? 'var(--color-accent)' : 'var(--text-muted)'}; font-weight: ${data.ageAtJuly1 >= b.minAge && data.ageAtJuly1 <= b.maxAge ? '900' : '500'};">
                    ${b.minAge}–${b.maxAge > 100 ? '95+' : b.maxAge}
                </td>
                <td style="padding: 10px 16px; font-size: 0.85rem; text-align: right; font-weight: 800; color: ${data.ageAtJuly1 >= b.minAge && data.ageAtJuly1 <= b.maxAge ? 'var(--color-accent)' : '#fff'};">
                    ${(b.rate * 100).toFixed(0)}%
                </td>
            </tr>
        `).join('');

        return `
            <!-- Key Rules -->
            <div style="margin-bottom: 32px;">
                ${H('Strategic Principles')}

                <div style="background: rgba(255,255,255,0.02); border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">Pension Restart Model</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; font-weight: 600;">
                        Brighter Super follows a <strong style="color: #fff;">restart</strong> process. The existing pension is paused, consolidated with re-contributions, and restarted with the full combined value.
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">The June 1st Strategy</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; font-weight: 600;">
                        Commencing a pension on or after June 1st resets the mandatory minimum to <strong style="color: var(--color-positive);">$0.00</strong> for the remainder of that FY, preserving capital.
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">Sustainability Safeguard</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; font-weight: 600;">
                        An advisory guardrail. A <strong style="color: #ff3b30;">warning</strong> triggers if any modeled transaction drops your total balance below this comfort threshold.
                    </div>
                </div>
            </div>

            <!-- Re-Contribution & BF -->
            <div style="margin-bottom: 32px;">
                ${H('Re-Contribution & Bring-Forward')}

                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; margin-bottom: 8px;">
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px;">
                        After the pro-rata payout, re-contribute the remaining balance back into accumulation as a <strong style="color: #fff;">non-concessional contribution (NCC)</strong>.
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
                        <div style="margin-bottom: 6px;"><strong style="color: var(--color-accent);">Bring-Forward Rule:</strong> Use up to <strong style="color: #fff;">3× the annual NCC cap</strong> in a single year (subject to TSB limits).</div>
                        <div style="margin-bottom: 6px;"><strong style="color: var(--color-accent);">TSB Limit:</strong> NCCs blocked if TSB ≥ $${calc.contributionCaps.tbc.toLocaleString()} prior to 30 June.</div>
                        <div><strong style="color: var(--color-accent);">Timing:</strong> Re-contribute within the same FY as closure.</div>
                    </div>
                </div>

                <!-- Current Bring-Forward Status -->
                <div style="background: rgba(255,255,255,0.04); border-radius: 10px; padding: 12px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Your Bring-Forward Status</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
                        <div style="font-size: 0.8rem; color: ${eligibility.eligible ? 'var(--color-positive)' : 'var(--color-warning)'}; font-weight: 700;">
                            <i class="fas ${eligibility.eligible ? 'fa-check-circle' : (eligibility.bringForwardStatus.nextAvailableFY ? 'fa-hourglass-half' : 'fa-ban')}" style="margin-right: 4px;"></i>
                            ${eligibility.eligible ? 'Available' : (eligibility.bringForwardStatus.nextAvailableFY ? 'Cap Used' : 'Not Eligible')}
                        </div>
                        ${eligibility.eligible 
                            ? `<div style="font-size: 1rem; font-weight: 800; color: #fff;">${formatCurrency(eligibility.maxAmount)}</div>`
                            : (eligibility.bringForwardStatus.nextAvailableFY 
                                ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Resets FY ${eligibility.bringForwardStatus.nextAvailableFY - 1}/${String(eligibility.bringForwardStatus.nextAvailableFY).slice(-2)}</div>` 
                                : '')}
                    </div>
                    ${bfFY ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04);">
                            <div style="font-size: 0.72rem; color: var(--text-muted);">Started: FY ${bfFY - 1}/${String(bfFY).slice(-2)}</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Window Used:</span>
                                <input id="super-bf-used-amount" type="number" value="${data.bringForwardUsedAmount || 0}" 
                                       style="width: 85px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 4px; padding: 2px 6px; font-size: 0.75rem; font-weight: 700; text-align: right;">
                            </div>
                        </div>
                    ` : `<div style="font-size: 0.72rem; color: var(--text-muted);">No bring-forward on record.</div>`}
                </div>
            </div>

            <!-- Contribution Caps -->
            <div style="margin-bottom: 20px;">
                ${H(`FY ${fy} Contribution Caps`)}
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Concessional</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${formatCurrency(calc.contributionCaps.concessional)}</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Tax-deductible contributions (employer, salary sacrifice, personal)</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Non-Concessional</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${formatCurrency(calc.contributionCaps.nonConcessional)}</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">After-tax contributions (re-contributions, personal top-ups)</div>
                    </div>
                </div>
            </div>

            <!-- Your Current Values -->
            <div style="margin-bottom: 32px;">
                ${H('Your Strategy Parameters')}
                <div style="background: rgba(255,255,255,0.03); border-radius: 20px; padding: 24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: var(--shadow-small);">
                    <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <span style="color: var(--text-muted); font-weight: 700;">Annual Minimum Drawdown</span>
                        <span style="font-weight: 900; color: #fff;">${formatCurrency(calc.annualMinimum)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <span style="color: var(--text-muted); font-weight: 700;">Current Drawdown Rate</span>
                        <span style="font-weight: 900; color: #fff;">${(calc.drawdownRate * 100).toFixed(0)}%</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 0.82rem;">
                        <span style="color: var(--text-muted); font-weight: 700;">Days remaining to EOFY</span>
                        <span style="font-weight: 900; color: #fff;">${calc.daysUntilEOFY}</span>
                    </div>
                </div>
            </div>

            <!-- Drawdown Table (Last Section) -->
            <div style="margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 32px;">
                ${H('Statutory Drawdown Rates')}
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; font-weight: 600; opacity: 0.8;">The rate is determined by your age as at 1 July of the financial year. It is applied to the balance as at 1 July (or date of commencement).</div>
                <div style="background: rgba(0,0,0,0.2); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.03);">
                                <th style="padding: 14px 18px; font-size: 0.65rem; text-align: left; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6;">Age at 1 July</th>
                                <th style="padding: 14px 18px; font-size: 0.65rem; text-align: right; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6;">Minimum Rate (%)</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
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
        const bfFYInput = this.container.querySelector(`#${IDS.SUPER_BRING_FORWARD_FY}`);

        if (accInput) accInput.addEventListener('change', (e) => { superStrategyStore.setAccumulationBalance(e.target.value); this.render(); });
        if (penInput) penInput.addEventListener('change', (e) => { superStrategyStore.setPensionBalance(e.target.value); this.render(); });
        if (floorInput) floorInput.addEventListener('change', (e) => { superStrategyStore.setSafetyFloor(e.target.value); this.render(); });
        if (ageInput) ageInput.addEventListener('change', (e) => { superStrategyStore.setAge(e.target.value); this.render(); });
        if (bfFYInput) bfFYInput.addEventListener('change', (e) => { superStrategyStore.setBringForwardTriggeredFY(e.target.value || null); this.render(); });

        const bfUsedInput = this.container.querySelector('#super-bf-used-amount');
        if (bfUsedInput) bfUsedInput.addEventListener('change', (e) => {
            superStrategyStore.setBringForwardUsedAmount(e.target.value);
            this.render();
        });

        const customDateInput = this.container.querySelector(`#${IDS.SUPER_CUSTOM_REMINDER_DATE}`);
        if (customDateInput) {
            customDateInput.addEventListener('change', (e) => {
                superStrategyStore.setCustomReminderDate(e.target.value);
                this.render(); // Re-render local UI
                window.dispatchEvent(new CustomEvent('dashboard-prefs-changed')); // Force refresh dashboard banner
            });
        }

        // Step-specific inputs
        this._bindStepInputs();

        // Advance button
        const advanceBtn = this.container.querySelector('#super-advance-btn');
        if (advanceBtn) {
            advanceBtn.addEventListener('click', () => {
                const current = superStrategyStore.getCurrentState();
                const result = superStrategyStore.advanceState();
                if (!result.success) {
                    console.warn('[SuperStrategyUI]', result.message);
                }
            });
        }
        
        const finalResetBtn = this.container.querySelector('#super-final-reset-btn');
        if (finalResetBtn) {
            finalResetBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset the strategy and start fresh? All implementation dates will be cleared.')) {
                    superStrategyStore.resetStateMachine();
                }
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
                const deductibleInput = this.container.querySelector(`#${IDS.SUPER_SIM_DEDUCTIBLE}`);
                if (!dateInput?.value) return;

                const results = superStrategyStore.runSimulation(
                    dateInput.value,
                    parseFloat(contribInput?.value) || 0,
                    deductibleInput ? deductibleInput.checked : false
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
                });
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { clearedDate: e.target.value });
                });
                break;
            }

            case SUPER_STATES.NOI_SUBMISSION: {
                const amountEl = this.container.querySelector(`#${IDS.SUPER_NOI_AMOUNT}`);
                const dateEl = this.container.querySelector(`#${IDS.SUPER_NOI_DATE}`);
                if (amountEl) amountEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { deductionAmount: parseFloat(e.target.value) || 0 });
                });
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { submittedDate: e.target.value });
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
                });
                break;
            }

            case SUPER_STATES.PENSION_CLOSURE: {
                const dateEl = this.container.querySelector(`#${IDS.SUPER_CLOSURE_DATE}`);
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { closureDate: e.target.value });
                });
                break;
            }

            case SUPER_STATES.RECONTRIBUTION: {
                const amountEl = this.container.querySelector(`#${IDS.SUPER_RECONTRIBUTION_AMOUNT}`);
                const dateEl = this.container.querySelector(`#${IDS.SUPER_RECONTRIBUTION_DATE}`);
                const bfFYEl = this.container.querySelector(`#${IDS.SUPER_BRING_FORWARD_FY}`);
                if (amountEl) amountEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { recontributionAmount: parseFloat(e.target.value) || 0 });
                });
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { recontributionDate: e.target.value });
                });
                break;
            }

            case SUPER_STATES.PENSION_COMMENCEMENT: {
                const dateEl = this.container.querySelector(`#${IDS.SUPER_COMMENCE_DATE}`);
                if (dateEl) dateEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { commencementDate: e.target.value });
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
