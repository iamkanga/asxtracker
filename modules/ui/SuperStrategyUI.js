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
    getCurrentFinancialYear,
    getCapData
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
            <div class="${CSS_CLASSES.SEGMENTED_CONTROL}" style="display: flex; background: rgba(255,255,255,0.04); margin: 12px 16px; border-radius: 0; padding: 4px;">
                ${tabs.map(t => `
                    <button class="super-tab-btn ${this.activeTab === t.id ? CSS_CLASSES.ACTIVE : ''}"
                            data-tab="${t.id}"
                            style="flex: 1; padding: 10px 8px; border: none; background: ${this.activeTab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: ${this.activeTab === t.id ? '#fff' : 'var(--text-muted)'}; font-weight: 600; border-radius: 0; cursor: pointer; transition: all 0.2s; font-size: 0.85rem;">
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
            
            ${H('Strategy Execution Pipeline')}
            <div class="super-pipeline-layout" style="display: block; margin-top: 4px;">
                <div class="super-pipeline-stepper-top" style="margin-bottom: 8px;">
                    ${this._renderVerticalStepper()}
                </div>
                <div class="super-pipeline-content">
                    ${this._renderActiveStepDetail(data)}
                </div>
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
        const CARD = 'background:rgba(255,255,255,0.04);border-radius:0;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';

        const fy = calc.financialYear;
        // Explainer: Details as of the 1st of July
        
        return `
            <div style="background:rgba(255,255,255,0.04);border-radius:0;padding:20px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px; ${!isEditable ? 'opacity: 0.6; filter: grayscale(0.3);' : ''}">

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
                        <div style="margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(0,0,0,0.2);border-radius:0;border:1px solid ${floorColor}33;">
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
                        <div style="${SL}">Age (at July 1)</div>
                        <input type="number" id="${IDS.SUPER_AGE_INPUT}" value="${data.ageAtJuly1 || 65}" min="0" max="120"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;outline:none;width:60px;">
                    </div>
                    <div style="${CARD}">
                        <div style="${SL}">Contrib. Cap Status</div>
                        <div style="${CV}${calc.recontributionEligibility?.eligible ? 'color:var(--color-positive);' : 'color:var(--color-warning);'}">
                            ${calc.recontributionEligibility?.eligible 
                                ? (calc.recontributionEligibility.bringForwardStatus.available ? 'Available' : 'Active Window') 
                                : 'Cap Used'}
                        </div>
                        ${!calc.recontributionEligibility?.eligible && calc.recontributionEligibility?.bringForwardStatus?.nextAvailableFY ? `
                            <div style="${CST}">Resets FY ${calc.recontributionEligibility.bringForwardStatus.nextAvailableFY - 1}/${String(calc.recontributionEligibility.bringForwardStatus.nextAvailableFY).slice(-2)}</div>
                        ` : ''}
                    </div>
                </div>

                <!-- Bring-Forward Status Grid -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:10px;">
                    <div style="${CARD}">
                        <div style="${SL} margin-bottom: 2px;">BF Started FY Ending</div>
                        <div style="${SL} opacity: 0.35; margin-bottom: 8px;">e.g. 2025</div>
                        <input type="number" id="${IDS.SUPER_BRING_FORWARD_FY}"
                               value="${data.bringForwardTriggeredFY || ''}" placeholder="None" min="2000" max="2099"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;outline:none;width:100%;">
                    </div>
                    <div style="${CARD}">
                        <div style="${SL} margin-bottom: 2px;">BF Amount Already Used</div>
                        <div style="${SL} opacity: 0.35; margin-bottom: 8px;">Total Spent (0-360k)</div>
                        <input type="number" id="${IDS.SUPER_BRING_FORWARD_USED}"
                               value="${data.bringForwardUsedAmount || 0}" placeholder="0.00" step="0.01"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;outline:none;width:100%;">
                    </div>
                </div>

            </div>
        `;
    }

    _renderVerticalStepper() {
        const states = superStrategyStore.getStates();

        return `
            <div class="${CSS_CLASSES.SUPER_VERTICAL_STEPPER}">
                <!-- Independent Progress Line Base Layer -->
                <div class="super-progress-line-container">
                    <div class="super-progress-line-fill" style="width: ${(states.findIndex(s => s.isCurrent) / (states.length - 1)) * 100}%;"></div>
                </div>

                <!-- Atomic Step Units (Guaranteed Alignment) -->
                ${states.map((s, i) => {
                    const isActive = s.isCurrent;
                    const isComplete = s.isComplete;
                    const isEven = (i + 1) % 2 === 0;
                    
                    const labelMap = {
                        [SUPER_STATES.CONTRIBUTION_CLEARANCE]: 'Clearance',
                        [SUPER_STATES.NOI_SUBMISSION]: 'NOI',
                        [SUPER_STATES.FUND_ACKNOWLEDGEMENT]: 'Approval',
                        [SUPER_STATES.PENSION_CLOSURE]: 'Closure',
                        [SUPER_STATES.RECONTRIBUTION]: 'Recontribution',
                        [SUPER_STATES.PENSION_COMMENCEMENT]: 'Restart',
                        [SUPER_STATES.FINALISED]: 'Finalised'
                    };
                    
                    let label = labelMap[s.id] || s.label.split(' ')[0];
                    const labelHtml = `<div class="${CSS_CLASSES.SUPER_STEP_LABEL} ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''}">${label}</div>`;
                    const emptySlot = `<div class="super-step-label-spacer"></div>`;

                    return `
                        <div class="super-step-unit" style="grid-column: ${i + 1}; cursor: pointer;" data-state="${s.id}">
                            <div class="super-step-slot above">${isEven ? labelHtml : emptySlot}</div>
                            <div class="${CSS_CLASSES.SUPER_STEP_ITEM} ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''}">
                                <div class="${CSS_CLASSES.SUPER_STEP_BALL}">
                                    ${isComplete ? '<i class="fas fa-check"></i>' : (i + 1)}
                                </div>
                            </div>
                            <div class="super-step-slot below">${!isEven ? labelHtml : emptySlot}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    _renderActiveStepDetail(data) {
        const current = superStrategyStore.getCurrentState();
        const stateData = superStrategyStore.getStateData(current);
        const label = superStrategyStore.getStateLabel(current);
        const desc = superStrategyStore.getStateDescription(current);
        const validation = superStrategyStore.validateCurrentState();
        const calc = superStrategyStore.getCalculatedValues();

        let fieldsHtml = '';

        switch (current) {
            case SUPER_STATES.CONTRIBUTION_CLEARANCE:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Cleared Amount</label>
                        <input type="number" id="${IDS.SUPER_CONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.amount || ''}" placeholder="0.00" step="0.01"
                               style="border-radius:0;padding:11px;font-weight:700;outline:none;">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Date Cleared</label>
                        <input type="${stateData.clearedDate ? 'date' : 'text'}" 
                               id="${IDS.SUPER_CONTRIBUTION_DATE}" 
                               class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.clearedDate || ''}"
                               placeholder="Date"
                               onfocus="this.type='date';"
                               onblur="if(!this.value) this.type='text';"
                               style="border-radius:0;padding:11px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                    </div>
                `;
                break;

            case SUPER_STATES.NOI_SUBMISSION:
                fieldsHtml = `
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Deduction Amount</label>
                        <input type="number" id="${IDS.SUPER_NOI_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.deductionAmount || ''}" placeholder="0.00" step="0.01"
                               max="${superStrategyStore.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 30000}"
                               style="border-radius:0;padding:11px;font-weight:700;">
                        <div style="font-size: 0.58rem; color: var(--text-muted); margin-top: 6px; opacity: 0.6; font-weight: 500;">
                            Max claimable: ${formatCurrency(superStrategyStore.data.stateData[SUPER_STATES.CONTRIBUTION_CLEARANCE]?.amount || 0)} (Based on Step 1)
                        </div>
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Date Submitted</label>
                        <input type="${stateData.submittedDate ? 'date' : 'text'}" 
                               id="${IDS.SUPER_NOI_DATE}" 
                               class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.submittedDate || ''}"
                               placeholder="Date"
                               onfocus="this.type='date';"
                               onblur="if(!this.value) this.type='text';"
                               style="border-radius:0;padding:11px;cursor:pointer;font-weight:700;width:100%;">
                    </div>
                    
                    <div style="margin-top: 24px; padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);">
                        <label style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                            <div style="flex: 1; padding-right: 14px;">
                                <div style="font-size: 0.75rem; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Non-Concessional Mode</div>
                                <div style="font-size: 0.64rem; color: var(--text-muted); line-height: 1.4; opacity: 0.8; font-weight: 500;">
                                    Bypass tax deduction (NOI) and keep this as an after-tax contribution.
                                </div>
                            </div>
                            <div class="super-toggle-track" style="width: 48px; height: 24px; background: ${stateData.skipped ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}; border-radius: 20px; position: relative; transition: all 0.2s;">
                                <input type="checkbox" id="super-noi-skip-toggle" ${stateData.skipped ? 'checked' : ''} style="opacity: 0; width: 100%; height: 100%; cursor: pointer; position: absolute; z-index: 2;">
                                <div style="width: 18px; height: 18px; background: #fff; border-radius: 50%; position: absolute; top: 3px; left: ${stateData.skipped ? '27px' : '3px'}; transition: all 0.2s; z-index: 1; box-shadow: 0 1px 4px rgba(0,0,0,0.4);"></div>
                            </div>
                        </label>
                    </div>

                    ${stateData.skipped ? `
                        <div style="margin-top: 14px; padding: 14px; background: rgba(255,165,0,0.06); border: 1px solid rgba(255,165,0,0.12); font-size: 0.68rem; color: #ffa500; line-height: 1.5; font-weight: 600;">
                            <i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i>
                            Strategic Skip: This contribution will stay "Non-Concessional" (No 15% tax).
                        </div>
                    ` : ''}

                    ${(stateData.skipped && !superStrategyStore.getRecontributionEligibility().eligible) ? `
                        <div style="margin-top: 10px; padding: 14px; background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.2); font-size: 0.7rem; color: #ff3b30; line-height: 1.4; font-weight: 700;">
                            <i class="fas fa-ban" style="margin-right: 8px;"></i>
                            TSB BLACKOUT: You cannot use Non-Concessional mode as your balance as of July 1st exceeds the ATO limit. 
                            <br/><span style="font-size: 0.62rem; opacity: 0.8; font-weight: 500;">(You must claim a tax deduction or reduce contribution to $0).</span>
                        </div>
                    ` : ''}
                `;
                break;

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT:
                fieldsHtml = `
                    <div style="display: flex; align-items: center; gap: 14px; padding: 18px; background: rgba(255,165,0,0.06); border-radius: 0; border: 1px solid rgba(255,165,0,0.1); margin-bottom: 20px;">
                        <div style="background: rgba(255,165,0,0.1); width: 42px; height: 42px; border-radius: 0; display: flex; align-items: center; justify-content: center; color: #ffa500; flex-shrink: 0;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 1.2rem;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.65rem; color: #ffa500; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">Validation Gate</div>
                            <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; opacity: 0.9; font-weight: 600;">Confirm fund NOI acknowledgement before proceeding.</div>
                        </div>
                    </div>
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 0; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
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
                        <div style="font-size: 0.78rem; color: var(--color-warning); line-height: 1.5; font-weight: 700; background: rgba(255,165,0,0.08); padding: 16px; border-radius: 0; border: 1px solid rgba(255,165,0,0.15); margin-bottom: 20px;">
                            <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
                            Every pension closure requires a final pro-rata drawdown payment to be confirmed first. This ensures regulatory compliance before the accounts are closed and merged back into accumulation.
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:20px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                            <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Planned Closure Date</label>
                            <input type="${stateData.closureDate ? 'date' : 'text'}" 
                                   id="${IDS.SUPER_CLOSURE_DATE}" 
                                   class="${CSS_CLASSES.FORM_CONTROL}"
                                   value="${stateData.closureDate || ''}"
                                   placeholder="Date"
                                   onfocus="this.type='date';"
                                   onblur="if(!this.value) this.type='text';"
                                   style="border-radius:0;padding:12px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                        </div>

                        <!-- Strategic Guidance -->
                        <div style="font-size:0.68rem; color:var(--text-muted); line-height:1.4; opacity:0.8; margin-top: 24px; margin-bottom: 24px;">
                             <i class="fas fa-info-circle" style="margin-right:4px; color:var(--color-accent);"></i>
                             <strong>Note:</strong> Brighter Super pro-rata is 100% tax-free. Current market valuations for the consolidated restart are now managed in <strong>Step 5 (Re-contribution Hub)</strong> to ensure real-time accuracy.
                        </div>

                        ${proRata ? `
                            <div style="background: linear-gradient(135deg, rgba(255,165,0,0.1) 0%, rgba(255,165,0,0.05) 100%); border-radius:0; padding:20px; border:1px solid rgba(255,165,0,0.2); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
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
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:20px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                        <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Planned Commencement Date</label>
                        <input type="${stateData.commencementDate ? 'date' : 'text'}" 
                               id="${IDS.SUPER_COMMENCE_DATE}" 
                               class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.commencementDate || ''}"
                               placeholder="Date"
                               onfocus="this.type='date';"
                               onblur="if(!this.value) this.type='text';"
                               style="border-radius:0;padding:12px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                    </div>

                    <div style="font-size:0.68rem; color:var(--text-muted); line-height:1.4; opacity:0.8; margin-bottom: 20px;">
                         <i class="fas fa-info-circle" style="margin-right:4px; color:var(--color-accent);"></i>
                         <strong>Confirmed Strategy:</strong> Final commencement will use the $8,000 safety buffer and valuations confirmed in Step 5.
                    </div>

                    <div style="background: rgba(var(--accent-rgb, 120, 100, 255), 0.1); border-radius: 0; padding: 20px; border: 1px solid rgba(var(--accent-rgb, 120, 100, 255), 0.2); margin-bottom: 24px;">
                        <div style="font-size: 0.62rem; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; opacity: 0.8;">Confirmed Transfer Amount</div>
                        <div style="font-size: 1.6rem; font-weight: 950; color: #fff; line-height: 1;">${formatCurrency(calc.newPensionStart)}</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; margin-top: 8px;">Scheduled for new Pension Account</div>
                    </div>

                    ${stateData.commencementDate ? this._renderCommencementPreview(data, stateData.commencementDate) : ''}
                `;
                break;

            case SUPER_STATES.FINALISED:
                return `
                    <div id="${IDS.SUPER_STEP_DETAIL}" style="text-align: center; padding: 40px 24px; background: rgba(6,255,79,0.04); border-radius: 0; border: 1px solid rgba(6,255,79,0.1); margin: 12px 0 24px; box-shadow: var(--shadow-strong);">
                        <div style="width: 72px; height: 72px; background: rgba(6,255,79,0.12); border-radius: 0; display: flex; align-items: center; justify-content: center; color: var(--color-positive); margin: 0 auto 24px;">
                            <i class="fas fa-check-double" style="font-size: 2.22rem;"></i>
                        </div>
                        <h3 style="font-size: 1.4rem; font-weight: 950; color: #fff; margin-bottom: 12px; letter-spacing: -0.5px;">Strategy Finalized</h3>
                        
                        <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 22px; border: 1px solid rgba(255,255,255,0.05); margin: 32px auto; display: inline-block; min-width: 260px;">
                            <div style="font-size: 0.65rem; color: var(--color-accent); font-weight: 850; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; opacity: 0.8;">Confirmed Transfer Amount</div>
                            <div style="font-size: 2rem; font-weight: 950; color: var(--color-positive); line-height: 1;">${formatCurrency(calc.newPensionStart)}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; margin-top: 12px; opacity: 0.6;">Commenced on ${stateData.commencementDate || 'the selected date'}</div>
                        </div>

                        <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.6; max-width: 320px; margin: 0 auto 28px; font-weight: 500; opacity: 0.9;">
                            Your pension restart has been successfully modeled and recorded for your Brighter Super accounts.
                        </p>
                        
                         <button id="super-final-reset-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}" style="width: 100%; border-radius: 0; padding: 14px; font-weight: 800; font-size: 0.85rem; background: var(--color-accent); color: #000; border: none; cursor: pointer; margin-bottom: 12px;">
                            Restart New Pipeline
                        </button>
                        <button id="super-back-btn" style="width: 100%; padding: 12px; border-radius: 0; background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                            <i class="fas fa-arrow-left" style="margin-right: 8px; font-size: 0.75rem;"></i>Back to Commencement
                        </button>
                    </div>
                `;

            case SUPER_STATES.RECONTRIBUTION: {
                const eligibility = superStrategyStore.getRecontributionEligibility();
                const closureData = superStrategyStore.getStateData(SUPER_STATES.PENSION_CLOSURE);
                const step1Data = superStrategyStore.getStateData(SUPER_STATES.CONTRIBUTION_CLEARANCE);
                const calc = superStrategyStore.getCalculatedValues();
                
                const currentAcc = (closureData?.closingAccumulationBalance !== undefined) ? closureData.closingAccumulationBalance : data.accumulationBalance;
                const activePensionVal = (closureData?.closingPensionBalance !== undefined) ? closureData.closingPensionBalance : data.pensionBalance;
                const closedBalanceNet = activePensionVal - (closureData?.proRataPayout || 0);
                const clearedStep1 = (step1Data?.amount || 0) * 0.85; // 15% tax
                const buffer = superStrategyStore.data.accumulationRetentionBuffer || 0;

                fieldsHtml = `
                    <!-- 1. Strategic Market Adjustments -->
                    <div style="margin-bottom: 24px; padding: 18px; background: rgba(255,255,255,0.02); border-radius: 0; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 0.65rem; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 14px;">Review Brighter Super Valuations</div>
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:16px; margin-bottom:12px; align-items: start;">
                            <div class="${CSS_CLASSES.FORM_GROUP}" style="display: flex; flex-direction: column;">
                                <label style="font-size:0.6rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin-bottom:8px; min-height: 24px; display: flex; align-items: flex-end;">Current Accumulation</label>
                                <input type="number" id="super-closing-acc-balance" class="${CSS_CLASSES.FORM_CONTROL}"
                                       value="${currentAcc}"
                                       style="border-radius:0; padding:12px; font-weight:700; width:100%; height: 42px;">
                            </div>
                            <div class="${CSS_CLASSES.FORM_GROUP}" style="display: flex; flex-direction: column;">
                                <label style="font-size:0.6rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin-bottom:8px; min-height: 24px; display: flex; align-items: flex-end;">Current Pension</label>
                                <input type="number" id="super-closing-pen-balance" class="${CSS_CLASSES.FORM_CONTROL}"
                                       value="${activePensionVal}"
                                       style="border-radius:0; padding:12px; font-weight:700; width:100%; height: 42px;">
                            </div>
                        </div>
                        <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 500; opacity: 0.6;">*Update to current market values to ensure the restart is accurate.</div>
                    </div>

                    <!-- 2. Brighter Super Retention Buffer -->
                    <div style="background: rgba(255,165,0,0.06); border: 1px solid rgba(255,165,0,0.15); padding: 18px; margin-bottom: 24px;">
                        <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:12px;">
                            <label style="font-size:0.62rem;color:var(--color-warning);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;">Accumulation Retention Buffer</label>
                            <input type="number" id="super-acc-retention-buffer" class="${CSS_CLASSES.FORM_CONTROL}" 
                                   value="${buffer}" placeholder="e.g. 8000"
                                   style="border-radius:0; padding:10px; font-weight:700; width:100%; border:1px solid rgba(255,165,0,0.3);">
                        </div>
                        <div style="font-size:0.68rem; color:var(--text-muted); line-height:1.4; opacity:0.8;">
                             <i class="fas fa-info-circle" style="margin-right:4px; color:var(--color-accent);"></i>
                             <strong>Brighter Super Rule:</strong> A minimum balance of $8,000 must be retained to keep your accumulation account open during a transfer. Check your specific PDS for your required safety threshold.
                        </div>
                    </div>

                    <!-- 3. Consolidated Strategy Command -->
                    <div style="margin-bottom: 28px; padding: 22px; background: rgba(var(--accent-rgb, 120, 100, 255), 0.12); border-radius: 0; border: 1px solid rgba(var(--accent-rgb, 120, 100, 255), 0.25); box-shadow: 0 8px 32px rgba(0,0,0,0.3); overflow: hidden;">
                        <div style="font-size: 0.65rem; color: var(--color-accent); font-weight: 950; text-transform: uppercase; letter-spacing: 2.5px; margin-bottom: 20px;">FY 2025/26 Consolidation Command</div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                            <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Acc Balance (as of July 1, 2025)</span>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800;">${formatCurrency(currentAcc)}</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                            <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Pension Closure (Net)</span>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800;">${formatCurrency(closedBalanceNet)}</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Step 1 Inflow Check</span>
                                <span style="font-size: 0.58rem; color: var(--color-positive); font-weight: 600; opacity: 0.7; margin-top: 2px;">(Confirmed & Included in Valuation)</span>
                            </div>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800; opacity: 0.8;">${formatCurrency(clearedStep1)}</span>
                        </div>

                        ${buffer > 0 ? `
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px;">
                            <span style="font-size: 0.62rem; color: var(--color-warning); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Retention Buffer</span>
                            <span style="font-size: 0.95rem; color: var(--color-warning); font-weight: 800;">- ${formatCurrency(buffer)}</span>
                        </div>
                        ` : ''}
                        
                        <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0 16px;"></div>
                        
                        <div style="display: block; text-align: right;">
                            <div style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">Estimated Restart Valuation</div>
                            <div style="font-size: 1.6rem; font-weight: 950; color: var(--color-positive); line-height: 1;">${formatCurrency(calc.newPensionStart)}</div>
                        </div>

                        ${calc.excessTBC > 0 ? `
                        <div style="margin-top: 15px; padding: 14px; background: rgba(255,165,0,0.1); border: 1px solid rgba(255,165,0,0.22); border-radius: 0; text-align: left;">
                            <div style="font-size: 0.65rem; color: #ffa500; font-weight: 950; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                                <i class="fas fa-exclamation-triangle"></i> TBC Overlap Detected ($2.0M Cap)
                            </div>
                            <div style="font-size: 0.75rem; color: #fff; line-height: 1.4; font-weight: 700; margin-bottom: 4px;">
                                Your restart exceeds the Transfer Balance Cap (TBC).
                            </div>
                            <div style="font-size: 0.68rem; color: var(--text-muted); line-height: 1.5; font-weight: 500;">
                                You can only put <strong style="color:#fff;">${formatCurrency(calc.contributionCaps.tbc)}</strong> into the tax-free pension.
                                The remaining <strong style="color:#ff3b30;">${formatCurrency(calc.excessTBC)}</strong> MUST stay in your accumulation account.
                            </div>
                        </div>
                        ` : ''}

                        <!-- Fixed Account Verification Note -->
                        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 0; border: 1px solid rgba(255,255,255,0.03); margin-top: 12px; font-size: 0.65rem; color: var(--text-muted); line-height: 1.4;">
                            <i class="fas fa-shield-check" style="margin-right: 6px; color: var(--color-positive); opacity: 0.7;"></i>
                            <strong>Data Integrity:</strong> Your manual valuation above should match your fund dashboard, which already includes your completed Step 1 contribution.
                        </div>
                    </div>

                    ${!eligibility.eligible ? `
                    <div style="background: rgba(255,59,48,0.12); border: 2px solid #ff3b30; padding: 24px; margin-bottom: 24px; display: flex; gap: 18px; align-items: flex-start;">
                        <i class="fas fa-lock" style="color: #ff3b30; font-size: 1.8rem; margin-top: 4px;"></i>
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 950; color: #fff; margin-bottom: 8px;">TSB Strategy Blackout</div>
                            <div style="font-size: 0.78rem; color: #ff3b30; font-weight: 800; line-height: 1.4; margin-bottom: 12px;">
                                Your Total Super Balance (TSB) as of July 1st prevents you from making this contribution as Non-Concessional money.
                            </div>
                            <div style="font-size: 0.7rem; color: #fff; opacity: 0.9; font-weight: 500; line-height: 1.5; max-width: 400px;">
                                The ATO "TSB" limit for this year is ${formatCurrency(getCapData(getCurrentFinancialYear()).tbc)}. Since your balance exceeds this, your allowed after-tax contribution limit is $0.
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Eligibility Status Tile -->
                    <div style="display: flex; align-items: center; gap: 14px; padding: 18px; background: rgba(${eligibility.eligible ? '6,255,79,0.06' : '255,59,48,0.06'}); border-radius: 0; border: 1px solid rgba(${eligibility.eligible ? '6,255,79,0.1' : '255,59,48,0.1'}); margin-bottom: 24px;">
                        <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: ${eligibility.eligible ? 'var(--color-positive)' : '#ff3b30'}; flex-shrink: 0;">
                            <i class="fas ${eligibility.eligible ? 'fa-check-circle' : 'fa-times-circle'}" style="font-size: 1.6rem;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.65rem; color: ${eligibility.eligible ? 'var(--color-positive)' : '#ff3b30'}; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">FY 2025/26 Contrib. Eligibility</div>
                            <div style="font-size: 0.85rem; font-weight: 900; color: #fff; line-height: 1.2; margin-bottom: 4px;">
                                ${eligibility.eligible ? `Eligible: ${formatCurrency(eligibility.maxAmount)}` : `Cap Used (Available FY 2027/28)`}
                            </div>
                            <div style="font-size: 0.68rem; color: var(--text-muted); line-height: 1.3; opacity: 0.8; font-weight: 500;">
                                ${eligibility.reason}
                            </div>
                        </div>
                    </div>

                    <!-- Account Gateways -->
                    <div style="margin-bottom: 28px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 12px;">Fund Thresholds (PDS 2025/26)</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 12px;">
                            <div style="background: rgba(255,255,255,0.03); border-radius: 0; border-left: 4px solid var(--color-accent); padding: 16px;">
                                <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 6px; opacity: 0.6;">Accumulation Min (2026)</div>
                                <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.minAccumulationBalance)}</div>
                            </div>
                            <div style="background: rgba(255,255,255,0.03); border-radius: 0; border-left: 4px solid var(--color-accent); padding: 16px;">
                                <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 6px; opacity: 0.6;">Pension Min</div>
                                <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.minPensionRestart)}</div>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- Pension Restart Model -->
                    <div style="margin-bottom: 28px;">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 12px;">Strategic Continuity</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; font-weight: 600; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 0; border: 1px solid rgba(255,255,255,0.03);">
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
                        <div style="background: rgba(255,255,255,0.02); border-radius: 0; border: 1px solid rgba(255,255,255,0.03); overflow: hidden;">
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
                    <div style="margin-bottom: 24px; padding: 18px; background: rgba(255,255,255,0.03); border-radius: 0; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="color: var(--color-accent); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">Transfer Balance Cap</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; font-weight: 600; opacity: 0.85;">
                            The maximum lifetime limit ($1.9M) you can transfer into tax-free pensions. Each restart counts the full amount against this total limit.
                        </div>
                    </div>

                    <!-- Available to Re-Contribute Tile (Redundant tile removed) -->

                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 20px;" onclick="this.querySelector('input').focus();">
                        <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: block; opacity: 0.7;">Re-Contribution Amount</label>
                        <input type="number" id="${IDS.SUPER_RECONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionAmount || ''}" placeholder="0.00" step="0.01"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               max="${eligibility.maxAmount}"
                               style="border-radius: 0; padding: 12px; font-weight: 700; width: 100%; outline: none; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 20px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                        <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: block; opacity: 0.7;">Re-Contribution Date</label>
                        <input type="${stateData.recontributionDate ? 'date' : 'text'}" 
                               id="${IDS.SUPER_RECONTRIBUTION_DATE}" 
                               class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionDate || ''}"
                               placeholder="Select Date"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               onfocus="this.type='date';"
                               onblur="if(!this.value) this.type='text';"
                               style="border-radius: 0; padding: 12px; font-weight: 700; width: 100%; outline: none; cursor: pointer; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                    </div>

                    ${(stateData.recontributionDate && new Date(stateData.recontributionDate).getMonth() === 4) ? `
                        <div style="margin-bottom: 20px; padding: 14px; background: rgba(255,165,0,0.12); border: 1px solid rgba(255,165,0,0.25); border-radius: 0;">
                            <div style="font-size: 0.65rem; color: #ffa500; font-weight: 950; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                                <i class="fas fa-exclamation-triangle"></i> Strategic Alert: May Commencement
                            </div>
                            <div style="font-size: 0.72rem; color: #fff; line-height: 1.4; font-weight: 600;">
                                Starting in May requires a mandatory pro-rata payment before June 30, 2026. If you have any doubt, delay your restart until June 1st to skip this payment.
                            </div>
                        </div>
                    ` : ''}
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
                    ${superStrategyStore.getCurrentStateIndex() > 0 ? `
                        <button id="super-back-btn" style="padding:12px 14px;border-radius:0;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid rgba(255,255,255,0.08);cursor:pointer;font-weight:600;font-size:0.8rem;display:flex;align-items:center;gap:6px;">
                            <i class="fas fa-chevron-left" style="font-size:0.75rem;"></i>
                        </button>
                    ` : ''}
                    <button id="super-advance-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}"
                            style="flex:1;padding:12px;border-radius:0;font-weight:700;font-size:0.82rem;cursor:pointer;
                                   background:${validation.valid ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)'};
                                   color:${validation.valid ? '#000' : 'var(--text-muted)'};border:none;
                                   opacity:${validation.valid ? '1' : '0.5'};">
                        ${validation.valid 
                            ? (superStrategyStore.data.stateData[SUPER_STATES.NOI_SUBMISSION]?.skipped ? 'Skip & Keep as Non-Concessional →' : 'Complete &amp; Advance →') 
                            : validation.message}
                    </button>
                    <button id="super-reset-btn" style="padding:12px 16px;border-radius:0;background:rgba(255,59,48,0.12);color:#ff3b30;border:none;cursor:pointer;font-weight:600;font-size:0.8rem;" title="Reset Pipeline">
                        <i class="fas fa-sync-alt" style="font-size:0.75rem;"></i>
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
                    <div style="display:flex;align-items:flex-start;gap:14px;padding:16px;background:rgba(255,255,255,0.04);border-radius:0;margin-bottom:10px;border-left:4px solid ${c.color};border-top:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="color:${c.color};font-size:1.1rem;width:32px;height:32px;background:rgba(0,0,0,0.2);border-radius:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
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
                 style="display:flex;align-items:center;gap:14px;padding:16px;background:rgba(255,59,48,0.06);border-radius:0;margin-bottom:16px;border:1px solid rgba(255,59,48,0.1);">
                <div style="background:rgba(255,59,48,0.12);width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;color:#ff3b30;flex-shrink:0;position:relative;">
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
        const CARD = 'background:rgba(255,255,255,0.04);border-radius:0;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';

        return `
            <div style="background:rgba(255,255,255,0.04);border-radius:0;padding:20px;border:1px solid rgba(255,255,255,0.06);margin-bottom:16px;">
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
                    <div style="${CARD}" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                        <div style="${SL}">Custom Date</div>
                        <input type="${data.customReminderDate ? 'date' : 'text'}" 
                               id="${IDS.SUPER_CUSTOM_REMINDER_DATE}"
                               value="${data.customReminderDate || ''}"
                               placeholder="Date"
                               onfocus="this.type='date';"
                               onblur="if(!this.value) this.type='text';"
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

        const CARD = 'background:rgba(255,255,255,0.04);border-radius:0;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';

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
        const fy = calc.financialYear;
        const H = (t) => `<div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:20px 0 12px 2px;">${t}</div>`;
        return `
            ${this._renderBalanceHeader(data, calc, false)}

            ${H('What-If Simulator')}
            <div style="font-size: 0.6rem; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: -8px 0 16px 2px; opacity: 0.8;">
                <i class="fas fa-microchip" style="margin-right: 4px;"></i>
                Modeled for Financial Year ${fy - 1}-${String(fy).slice(-2)}
            </div>
            <div style="margin-bottom:32px;background:rgba(255,255,255,0.04);border-radius:0;padding:20px;border:1px solid rgba(255,255,255,0.06);box-shadow:var(--shadow-strong);">
                <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;font-weight:500;margin-bottom:24px;opacity:0.8;">
                    Model the impact of restarting your pension on a specific date. See how timing affects your pre-closure drawdown, new pension minimum, and capital sustainability.
                </div>

                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                    <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Simulation Start</label>
                    <input type="text" id="${IDS.SUPER_SIMULATION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                           placeholder="Date"
                           onfocus="this.type='date';"
                           onblur="if(!this.value) this.type='text'"
                           style="border-radius:0;padding:11px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                </div>

                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                    <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Modeled Re-Contrib</label>
                    <input type="number" id="super-sim-contribution" class="${CSS_CLASSES.FORM_CONTROL}"
                           placeholder="0.00" step="0.01"
                           style="border-radius:0;padding:11px;font-weight:700;outline:none;">
                </div>

                <div style="margin-bottom:20px;padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:0;border:1px solid rgba(255,255,255,0.06);">
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
                        style="width:100%;padding:14px;border-radius:0;font-weight:800;font-size:0.85rem;cursor:pointer;background:var(--color-accent);color:#000;border:none;">
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
            <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 24px; margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);opacity:0.55;margin-bottom:20px;">Forecast Results</div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px;">
                    <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 0;">
                        <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Pension Restart</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${formatCurrency(results.newPensionBalance)}</div>
                        ${results.newPensionBalance < SUPER_THRESHOLDS.minPensionRestart ? `
                            <div style="font-size: 0.55rem; color: #ff3b30; font-weight: 700; margin-top: 2px;">
                                <i class="fas fa-exclamation-triangle"></i> Below Brighter Super ${formatCurrency(SUPER_THRESHOLDS.minPensionRestart)} Min
                            </div>
                        ` : ''}
                    </div>
                    <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 0;">
                        <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Min Drawdown</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--color-accent);">${formatCurrency(results.newMinimumDrawdown.amount)}</div>
                        <div style="font-size: 0.55rem; color: var(--text-muted); margin-top: 2px;">
                            ${results.june1stRuleApplies ? 'June 1st Rule ($0)' : `Mandatory Pro-rata (${results.newMinimumDrawdown.days} days)`}
                        </div>
                    </div>
                </div>

                ${(!results.june1stRuleApplies && results.isNearEndOfYear) ? `
                <div style="margin-bottom: 16px; padding: 12px; background: rgba(255,165,0,0.1); border: 1px solid rgba(255,165,0,0.2); border-radius: 0;">
                    <div style="font-size: 0.65rem; color: #ffa500; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                        <i class="fas fa-exclamation-triangle"></i> Strategic Warning: Late-Year Commencement
                    </div>
                    <div style="font-size: 0.72rem; color: #fff; line-height: 1.4; font-weight: 600;">
                        Starting on May ${new Date(results.implementationDate).getDate()} requires a pro-rata payment by June 30, 2026. Delaying to June 1 makes your first payment due in FY 2026/27.
                    </div>
                </div>
                ` : ''}

                <!-- Contribution Net -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">
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
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Pre-Closure Payout</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.preClosurePayout.amount)}</span>
                </div>

                <!-- Projected Balance -->
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Projected Balance</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.projectedBalance)}</span>
                </div>

                <!-- Safety Floor Status -->
                <div style="display: flex; justify-content: space-between; padding: 10px 0; align-items: center;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Safety Floor Status</span>
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
                    
                    <div style="background: rgba(0,0,0,0.2); border-radius: 0; padding: 12px;">
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
                        <div style="margin-top: 10px; padding: 8px; background: rgba(255, 59, 48, 0.1); border-radius: 0; border: 1px solid rgba(255, 59, 48, 0.2); display: flex; gap: 8px; align-items: center;">
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
            ${this._renderBalanceHeader(data, calc, false)}

            ${H(`ATO Statutory Limits (FY ${fy - 1}/${String(fy).slice(-2)})`)}
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom: 24px;">
                <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 14px; border-top: 2px solid var(--color-accent);">
                    <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Concessional</div>
                    <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(calc.contributionCaps.concessional)}</div>
                    <div style="font-size: 0.52rem; color: var(--text-muted); margin-top: 4px;">Before-tax & Deduction</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 14px; border-top: 2px solid var(--color-accent);">
                    <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Non-Concessional</div>
                    <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(calc.contributionCaps.nonConcessional)}</div>
                    <div style="font-size: 0.52rem; color: var(--text-muted); margin-top: 4px;">After-tax (indexed)</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 14px; border-top: 2px solid var(--color-positive);">
                    <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Bring-Forward</div>
                    <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(calc.contributionCaps.nonConcessional * 3)}</div>
                    <div style="font-size: 0.52rem; color: var(--text-muted); margin-top: 4px;">3-Year Cumulative</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 14px; border-top: 2px solid #ffa500;">
                    <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Transfer Cap</div>
                    <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(Math.floor(calc.contributionCaps.tbc / 100000) / 10).replace('0,000,000', '')}M</div>
                    <div style="font-size: 0.52rem; color: var(--text-muted); margin-top: 4px;">Pension Entry Limit</div>
                </div>
            </div>

            ${H('Brighter Super Rules & Protection')}
            <div style="background: rgba(var(--accent-rgb, 120, 100, 255), 0.05); border-radius: 0; border: 1px solid rgba(var(--accent-rgb, 120, 100, 255), 0.15); padding: 18px; margin-bottom: 24px;">
                <div style="display: grid; grid-template-columns: 1fr; gap: 14px;">
                    <div>
                        <div style="font-size: 0.72rem; color: #fff; font-weight: 900; margin-bottom: 4px;">Retention Buffer ($8,000)</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">Brighter Super requires a minimum of <strong>$8,000</strong> to be retained in accumulation to keep the account active during partial transfers or pension restarts.</div>
                    </div>
                    <div style="height: 1px; background: rgba(255,255,255,0.05);"></div>
                    <div>
                        <div style="font-size: 0.72rem; color: #fff; font-weight: 900; margin-bottom: 4px;">ATO Fee Protection (PYS Rule)</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">If your balance is <strong>below ${formatCurrency(SUPER_THRESHOLDS.autoFeeCapThreshold)}</strong> on 30 June, the total administration and investment fees charged are capped at <strong>3%</strong> of your account balance for the year. This is a statutory member protection rule.</div>
                    </div>
                </div>
            </div>

            <!-- Strategic Principles Reinstated -->
            <div style="margin-bottom: 32px;">
                ${H('Strategic Execution Principles')}

                <div style="background: rgba(255,255,255,0.02); border-radius: 0; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">Pension Restart Methodology</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; font-weight: 600;">
                        Unlike a simple top-up, your existing pension account must be <strong style="color: #fff;">commuted</strong> (closed pro-rata) before being combined with accumulation funds and restarted as a single, higher-balance pension.
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border-radius: 0; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">The June 1st Strategy</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; font-weight: 600;">
                        Commencing a pension on or after June 1st resets the mandatory minimum to <strong style="color: var(--color-positive);">$0.00</strong> for the remainder of that financial year, preserving capital.
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border-radius: 0; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.7rem; color: #fff; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.9;">Sustainability Safeguard</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; font-weight: 600;">
                        Your capital safety floor is an advisory guardrail. A <strong style="color: #ff3b30;">warning</strong> triggers if any modeled transaction drops your total balance below this comfort threshold.
                    </div>
                </div>
            </div>

            <!-- Re-Contribution Hub Detailed Reinstated -->
            <div style="margin-bottom: 32px;">
                ${H('Re-Contribution & Bring-Forward Rules')}

                <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 18px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 14px;">
                        After the pro-rata payout, re-contribute the remaining balance back into accumulation as a <strong style="color: #fff;">non-concessional contribution (NCC)</strong>.
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.6;">
                        <div style="margin-bottom: 8px;"><strong style="color: var(--color-accent);">Bring-Forward (3-Year):</strong> Use up to <strong style="color: #fff;">$360,000</strong> in a single year (subject to TSB limits) by triggering a 3-year window.</div>
                        <div style="margin-bottom: 8px;"><strong style="color: var(--color-accent);">TSB Asset Limit:</strong> NCCs and Bring-Forward triggers are blocked if your Total Super Balance (TSB) was ≥ $1.9M as of the prior 30 June.</div>
                        <div><strong style="color: var(--color-accent);">Execution Timing:</strong> The re-contribution must be cleared in accumulation within the same financial year as the pension closure.</div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.04); border-radius: 0; padding: 18px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 850; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">Your Current Bring-Forward Status</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 6px;">
                        <div style="font-size: 0.82rem; color: ${eligibility.eligible ? 'var(--color-positive)' : 'var(--color-warning)'}; font-weight: 800;">
                            <i class="fas ${eligibility.eligible ? 'fa-check-circle' : (eligibility.bringForwardStatus.nextAvailableFY ? 'fa-hourglass-half' : 'fa-ban')}" style="margin-right: 6px;"></i>
                            ${eligibility.eligible 
                                ? (eligibility.bringForwardStatus.available ? 'Available' : 'Active Window') 
                                : (eligibility.bringForwardStatus.nextAvailableFY ? 'Cap Used' : 'Not Eligible')}
                        </div>
                        ${eligibility.available 
                            ? `<div style="font-size: 1.2rem; font-weight: 950; color: #fff;">${formatCurrency(eligibility.maxAmount)}</div>`
                            : (eligibility.bringForwardStatus.nextAvailableFY 
                                ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Resets FY ${eligibility.bringForwardStatus.nextAvailableFY - 1}/${String(eligibility.bringForwardStatus.nextAvailableFY).slice(-2)}</div>` 
                                : '')}
                    </div>
                    ${bfFY ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Triggered: FY ${bfFY - 1}/${String(bfFY).slice(-2)}</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.68rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Window Used:</span>
                                <input id="super-bf-used-amount" type="number" value="${data.bringForwardUsedAmount || 0}" 
                                       style="width: 90px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12); color: #fff; border-radius: 0; padding: 4px 8px; font-size: 0.8rem; font-weight: 800; text-align: right;">
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Your Implementation Parameters Reinstated -->
            <div style="margin-bottom: 40px;">
                ${H('Your Active Portfolio Parameters')}
                <div style="background: rgba(255,255,255,0.03); border-radius: 0; padding: 24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: var(--shadow-small);">
                    <div style="display: flex; justify-content: space-between; padding: 14px 0; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <span style="color: var(--text-muted); font-weight: 750;">Annual Minimum Drawdown</span>
                        <span style="font-weight: 950; color: #fff;">${formatCurrency(calc.annualMinimum)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 14px 0; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <span style="color: var(--text-muted); font-weight: 750;">Statutory Drawdown Rate</span>
                        <span style="font-weight: 950; color: #fff;">${(calc.drawdownRate * 100).toFixed(0)}%</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 14px 0; font-size: 0.85rem;">
                        <span style="color: var(--text-muted); font-weight: 750;">Days remaining to EOFY</span>
                        <span style="font-weight: 950; color: #fff;">${calc.daysUntilEOFY}</span>
                    </div>
                </div>
            </div>

            <!-- Drawdown Table Final -->
            <div style="margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 32px;">
                ${H('Statutory Drawdown Rates')}
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; font-weight: 600; opacity: 0.8;">The rate is determined by your age as at 1 July of the financial year. It is applied to the balance as at 1 July (or date of commencement).</div>
                <div style="background: rgba(0,0,0,0.2); border-radius: 0; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.03);">
                                <th style="padding: 14px 18px; font-size: 0.65rem; text-align: left; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6;">Age at 1 July</th>
                                <th style="padding: 14px 18px; font-size: 0.65rem; text-align: right; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6;">Min Rate (%)</th>
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
                    <div style="display: flex; align-items: center; gap: 10px; padding: 14px; background: rgba(6,255,79,0.08); border-radius: 0; margin-top: 10px; border: 1px solid rgba(6,255,79,0.15);">
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

        // Back button
        const backBtn = this.container.querySelector('#super-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                superStrategyStore.regressState();
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
        // Timeline Navigation (Jump between steps)
        const stepUnits = this.container.querySelectorAll('.super-step-unit');
        stepUnits.forEach(u => {
            u.addEventListener('click', (e) => {
                const targetState = e.currentTarget.dataset.state;
                superStrategyStore.jumpToState(targetState);
                this.render();
            });
        });

        // --- INPUT ENHANCEMENTS: Auto-clear zeros on focus ---
        const autoClearInputs = this.container.querySelectorAll('input[type="number"]');
        autoClearInputs.forEach(input => {
            input.addEventListener('focus', (e) => {
                // If it's pure zero, clear it for fresh input
                const val = e.target.value;
                if (val === '0' || val === '0.00' || val === '0.0') {
                    e.target.value = '';
                } else {
                    // Otherwise, auto-select existing content for quick over-writing
                    e.target.select();
                }
            });
        });
    }

    _bindStepInputs() {
        const current = superStrategyStore.getCurrentState();

        // Header Global Bindings (Member Position)
        const bfFYEl = this.container.querySelector(`#${IDS.SUPER_BRING_FORWARD_FY}`);
        const bfUsedEl = this.container.querySelector(`#${IDS.SUPER_BRING_FORWARD_USED}`);
        if (bfFYEl) bfFYEl.addEventListener('change', (e) => {
            superStrategyStore.setBringForwardTriggeredFY(e.target.value);
            this.render(); // Re-render to update eligibility display
        });
        if (bfUsedEl) bfUsedEl.addEventListener('change', (e) => {
            superStrategyStore.setBringForwardUsedAmount(e.target.value);
            this.render(); // Re-render to update eligibility display
        });

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

                const skipToggle = this.container.querySelector('#super-noi-skip-toggle');
                if (skipToggle) skipToggle.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { skipped: e.target.checked });
                    this.render(); // Update button text and warning
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
                const accEl = this.container.querySelector('#super-closing-acc-balance');
                const penEl = this.container.querySelector('#super-closing-pen-balance');
                const bufferEl = this.container.querySelector('#super-acc-retention-buffer');
                const recontribEl = this.container.querySelector(`#${IDS.SUPER_RECONTRIB_AMOUNT}`);

                // Fetch latest data for rendering inside closures
                const getData = () => superStrategyStore.data;

                if (accEl) accEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(SUPER_STATES.PENSION_CLOSURE, { closingAccumulationBalance: parseFloat(e.target.value) || 0 });
                    this.render(); 
                });
                if (penEl) penEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(SUPER_STATES.PENSION_CLOSURE, { closingPensionBalance: parseFloat(e.target.value) || 0 });
                    this.render();
                });
                if (bufferEl) bufferEl.addEventListener('change', (e) => {
                    superStrategyStore.data.accumulationRetentionBuffer = parseFloat(e.target.value) || 0;
                    superStrategyStore._save();
                    this.render();
                });
                if (recontribEl) recontribEl.addEventListener('change', (e) => {
                    superStrategyStore.updateStateData(current, { recontributionAmount: parseFloat(e.target.value) || 0 });
                    this.render();
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
