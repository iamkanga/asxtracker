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
        this.isEditingPosition = false;
    }

    // ─────────────────────────────────────────
    // Static Modal Launcher
    // ─────────────────────────────────────────

    static showModal() {
        const existing = document.getElementById(IDS.SUPER_STRATEGY_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.SUPER_STRATEGY_MODAL;
        modal.className = `${CSS_CLASSES.WIDGET_PANEL} widget-hidden`;
        modal.style.cssText = `
            position: fixed;
            top: 60px;
            right: 0;
            width: 380px;
            height: calc(100vh - 60px);
            background: #000000;
            z-index: 20000;
            display: flex;
            flex-direction: column;
            border-left: 1px solid rgba(255,255,255,0.05);
            box-shadow: -10px 0 50px rgba(0, 0, 0, 1);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
            transform: translateX(100%);
            opacity: 0;
            overflow: hidden;
        `;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.4);
            backdrop-filter: blur(4px);
            z-index: 19999;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        modal.innerHTML = `
            <!-- HEADER -->
            <div class="widget-header" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div class="${CSS_CLASSES.MODAL_HEADER_LEFT}">
                    <h2 class="widget-title" style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--color-accent); margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas ${UI_ICONS.SUPER_STRATEGY}"></i>
                        Super Strategy
                    </h2>
                </div>
                <div class="widget-header-actions">
                    <button class="widget-close-btn" style="background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 1.1rem; padding: 6px 8px;">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
            </div>
            <!-- BODY -->
            <div id="super-modal-body" class="widget-scroll-container" style="flex: 1; overflow-y: auto; padding: 0;"></div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // Mobile Responsiveness Override
        if (window.innerWidth <= 480) {
            modal.style.width = '100%';
        }

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
            // First frame: ensure it's painted off-screen
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                // Second frame: trigger the slide-in
                modal.classList.remove('widget-hidden');
                modal.style.opacity = '1';
                overlay.style.opacity = '1';
                overlay.style.visibility = 'visible';
            });
        });

        // Nav hook
        navManager.pushState(() => {
            if (modal.parentElement) {
                overlay.remove();
                modal.remove();
            }
        });

        // Close logic
        const close = () => {
            if (modal._isClosing) return;
            modal._isClosing = true;
            
            // Trigger standard Side-Drawer slide-out
            modal.classList.add('widget-hidden');
            modal.style.opacity = '0';
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';

            setTimeout(() => {
                modal.remove();
                overlay.remove();
                navManager.popStateSilently();
            }, 300);
        };

        const titleBar = modal.querySelector('.widget-header');
        if (titleBar) titleBar.addEventListener('click', close);

        modal.querySelector('.widget-close-btn').addEventListener('click', close);
        overlay.addEventListener('click', close);

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

        // Auto-open if position is not yet confirmed
        if (!data.isPositionConfirmed) {
            this.isEditingPosition = true;
        }

        this.container.innerHTML = `
            <div style="text-align: center; margin-top: 16px; color: var(--color-accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">
                <i class="fas fa-calendar-day" style="margin-right: 6px;"></i>Financial Year ${fy - 1}/${String(fy).slice(-2)}
            </div>

            ${this._renderTabs()}

            <!-- MEMBER POSITION SUMMARY (Sleek, balanced line) -->
            ${(this.activeTab === 'pipeline') ? this._renderCompactMemberSummary(data, calc) : ''}
            
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
            { id: 'info', label: 'Reference', icon: 'fa-piggy-bank' }
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
            ${this.isEditingPosition ? `
                ${this._renderBalanceHeader(data, calc, true)}
                ${!data.isPositionConfirmed ? `
                    <button id="super-confirm-position-btn" 
                            class="${CSS_CLASSES.PRIMARY_PILL_BTN}" 
                            style="width: 100%; padding: 16px; font-weight: 950; font-size: 0.9rem; background: var(--color-accent); color: #000; border: none; border-radius: 0; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); margin-bottom: 40px; margin-top: -10px;">
                        Confirm Position & Start Strategy →
                    </button>
                ` : ''}
            ` : ''}

            ${H('Strategy Execution Pipeline')}
            <div class="super-pipeline-layout" style="display: block; margin-top: 4px;">
                <div class="super-pipeline-stepper-top" style="margin-bottom: 8px;">
                    ${this._renderVerticalStepper()}
                </div>
                <div class="super-pipeline-content">
                    ${this._renderActiveStepDetail(data)}
                </div>
            </div>
            
            ${this._renderSafetyFloorBanner(data, calc)}
        `;
    }

    _renderPositionSetupStep(data, calc) {
        const fy = calc.financialYear;
        return `
            <div style="padding: 10px 0;">
                ${this._renderOrangeWarning('Step 0: Foundation', `Confirm your member position as of 1st July ${fy - 1} to initialize the strategy pipeline.`)}

                ${this._renderBalanceHeader(data, calc, true)}

                <button id="super-confirm-position-btn" 
                        class="${CSS_CLASSES.PRIMARY_PILL_BTN}" 
                        style="width: 100%; padding: 16px; font-weight: 950; font-size: 0.9rem; background: var(--color-accent); color: #000; border: none; border-radius: 0; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); margin-bottom: 40px;">
                    Confirm Position & Start Strategy →
                </button>
            </div>
        `;
    }

    _renderCompactMemberSummary(data, calc) {
        if (!data.isPositionConfirmed) return '';

        const eligibility = calc.recontributionEligibility;
        const nccStatus = eligibility?.eligible ? 'Cap Available' : 'Cap Used';
        const nccColor = eligibility?.eligible ? 'var(--color-positive)' : 'var(--color-warning)';
        
        const SL = (t) => `<span style="font-size: 0.52rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin-right: 4px;">${t}</span>`;
        const V = (v, c='#fff') => `<span style="font-size: 0.72rem; font-weight: 850; color: ${c};">${v}</span>`;

        return `
            <div style="background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 8px 16px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                <div style="display: flex; gap: 15px; align-items: center; flex: 1; justify-content: space-around;">
                    <div style="display: flex; align-items: center; white-space: nowrap;">
                        ${SL('Acc.')} ${V(formatCurrency(data.accumulationBalance).replace('.00', ''))}
                    </div>
                    <div style="display: flex; align-items: center; white-space: nowrap;">
                        ${SL('Pen.')} ${V(formatCurrency(data.pensionBalance).replace('.00', ''))}
                    </div>
                    <div style="display: flex; align-items: center; white-space: nowrap;">
                        ${SL('Total')} ${V(formatCurrency(calc.totalBalance).replace('.00', ''), 'var(--color-accent)')}
                    </div>
                    <div style="display: flex; align-items: center; white-space: nowrap;">
                        ${V(nccStatus, nccColor)}
                    </div>
                </div>
                <div id="super-edit-position-btn" style="padding: 4px 8px; cursor: pointer; color: var(--color-accent); opacity: 0.5; transition: all 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5;">
                    <i class="fas fa-pen" style="font-size: 0.75rem;"></i>
                </div>
            </div>
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

                <div style="height: 12px;"></div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:10px;">
                    <div style="${CARD}">
                        <div style="${SL}">Age at July 1</div>
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
                            <div style="${CST}">Available 1st July ${calc.recontributionEligibility.bringForwardStatus.nextAvailableFY - 1}</div>
                        ` : ''}
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:10px;">
                    <div style="${CARD}">
                        <div style="${SL} margin-bottom: 2px;">BF Started FY Ending</div>
                        <div style="${SL} opacity: 0.35; margin-bottom: 8px;">e.g. ${fy - 1}</div>
                        <input type="number" id="${IDS.SUPER_BRING_FORWARD_FY}"
                               value="${data.bringForwardTriggeredFY || ''}" placeholder="None" min="2000" max="2099"
                               ${!isEditable ? 'readonly style="pointer-events:none; opacity:0.8;"' : ''}
                               style="font-size:1.1rem;font-weight:900;background:transparent;border:none;padding:0;color:#fff;outline:none;width:100%;">
                    </div>
                    <div style="${CARD}">
                        <div style="${SL} margin-bottom: 2px;">BF Amount Already Used</div>
                        <div style="${SL} opacity: 0.35; margin-bottom: 8px;">Total Spent 0-360k</div>
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
        const fy = getCurrentFinancialYear();

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
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;" onclick="const inp = this.querySelector('input'); if(inp && document.activeElement !== inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
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
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;" onclick="const inp = this.querySelector('input'); if(inp && document.activeElement !== inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
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
                            <div class="super-toggle-track" style="width: 48px; height: 24px; background: ${stateData.skipped ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}; border-radius: 0 !important; position: relative; transition: all 0.2s;">
                                <input type="checkbox" id="super-noi-skip-toggle" ${stateData.skipped ? 'checked' : ''} style="opacity: 0; width: 100%; height: 100%; cursor: pointer; position: absolute; z-index: 2;">
                                <div style="width: 18px; height: 18px; background: #fff; border-radius: 0 !important; position: absolute; top: 3px; left: ${stateData.skipped ? '27px' : '3px'}; transition: all 0.2s; z-index: 1; box-shadow: 0 1px 4px rgba(0,0,0,0.4);"></div>
                            </div>
                        </label>
                    </div>

                    ${(stateData.skipped && superStrategyStore.getRecontributionEligibility().eligible) ? this._renderOrangeWarning('Strategic Skip', 'This contribution will stay "Non-Concessional" (No 15% tax).') : ''}


                    ${(() => {
                        if (!stateData.skipped || superStrategyStore.getRecontributionEligibility().eligible) return '';
                        
                        const eligibility = superStrategyStore.getRecontributionEligibility();
                        const isTsbBlackout = superStrategyStore.getTotalBalance() >= getCapData(getCurrentFinancialYear()).tbc;
                        const nextFY = eligibility?.bringForwardStatus?.nextAvailableFY;
                        const availableDate = nextFY ? `1st July ${nextFY - 1}` : null;

                        return `
                            <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px; color: #ff3b30; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">
                                <i class="fas fa-ban"></i>
                                <span>
                                    ${isTsbBlackout 
                                        ? 'Cap Blocked: TSB Limit Exceeded' 
                                        : `Cap not available until ${availableDate || 'next FY'}`}
                                </span>
                            </div>
                        `;
                    })()}
                `;
                break;

            case SUPER_STATES.FUND_ACKNOWLEDGEMENT:
                fieldsHtml = `
                    ${this._renderOrangeWarning('Validation Gate', 'Confirm fund NOI acknowledgement before proceeding.')}
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
                        <div style="display: flex; align-items: center; gap: 14px; padding: 18px; background: rgba(var(--accent-rgb, 120, 100, 255), 0.08); border: 1px solid rgba(var(--accent-rgb, 120, 100, 255), 0.2); margin-bottom: 24px;">
                            <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--color-accent); flex-shrink: 0;">
                                <i class="fas fa-file-signature" style="font-size: 1.6rem;"></i>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 0.65rem; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">P10 - Pension Restart Form</div>
                                <div style="font-size: 0.82rem; font-weight: 900; color: #fff; line-height: 1.2; margin-bottom: 4px;">
                                    Master Execution Trigger
                                </div>
                                <div style="font-size: 0.68rem; color: var(--text-muted); line-height: 1.3; opacity: 0.8; font-weight: 600;">
                                    This form instructs Brighter Super to close your existing pension, pay out your pro-rata minimum, and merge your final balances for the restart.
                                </div>
                            </div>
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:20px;" onclick="const inp = this.querySelector('input'); if(inp && document.activeElement !== inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                            <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Planned Closure Date</label>
                            <input type="${stateData.closureDate ? 'date' : 'text'}" 
                                   id="${IDS.SUPER_CLOSURE_DATE}" 
                                   class="${CSS_CLASSES.FORM_CONTROL}"
                                   value="${stateData.closureDate || ''}"
                                   placeholder="Date"
                                   onfocus="this.type='date';"
                                   onblur="if(!this.value) this.type='text';"
                                   style="border-radius:0;padding:12px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                            <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 8px; font-weight: 600; opacity: 0.7;">*Confirm payout date to calculate mandatory pro-rata drawdown.</div>
                        </div>

                        ${(stateData.closureDate && new Date(stateData.closureDate).getMonth() !== 5 && getCurrentFinancialYear(new Date(stateData.closureDate)) === getCurrentFinancialYear()) ? `
                            ${this._renderOrangeWarning('Strategic Alert: Timing Trap', 'Pushing your closure to May 31st and restarting on June 1st allows you to avoid mandatory drawdowns while keeping your funds tax-free.')}
                        ` : ''}

                        ${(() => {
                            if (!proRata) return '';
                            const cDate = new Date(stateData.closureDate);
                            const isJune1st = cDate.getMonth() === 5 && cDate.getDate() >= 1;
                            const statusColor = isJune1st ? 'var(--color-positive)' : 'var(--color-negative)';
                            const statusRgb = isJune1st ? '6, 255, 79' : '255, 59, 48';

                            return `
                                <div style="background: linear-gradient(135deg, rgba(${statusRgb},0.1) 0%, rgba(${statusRgb},0.05) 100%); border-radius:0; padding:20px; border:1px solid rgba(${statusRgb},0.25); box-shadow: 0 4px 15px rgba(0,0,0,0.1); margin-top: 10px;">
                                    <div style="font-size:0.65rem;color:${statusColor};font-weight:900;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">Mandatory Pro-Rata Payment</div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                        <span style="font-size:0.85rem;color:#fff;font-weight:700;">Required Payout</span>
                                        <span style="font-size:1.6rem;font-weight:950;color:${statusColor};">${formatCurrency(proRata.amount)}</span>
                                    </div>
                                    <div style="height:1px; background:rgba(${statusRgb},0.2); margin:12px 0;"></div>
                                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);font-weight:700;opacity:0.8;">
                                        <span>${proRata.days} days elapsed in FY</span>
                                        <span style="color:${statusColor}; opacity:1;">Rate: ${(proRata.rate * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                            `;
                        })()}
                    </div>
                `;
                break;
            }

            case SUPER_STATES.PENSION_COMMENCEMENT: {
                const closureData = superStrategyStore.getStateData(SUPER_STATES.PENSION_CLOSURE);
                fieldsHtml = `
                    <div style="margin-bottom: 24px; padding: 18px; background: rgba(255,255,255,0.02); border-radius: 0; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 0.65rem; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 14px;">Synchronize Restart</div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); opacity: 0.4;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Pension Account Closed (Step 4)</span>
                                <span style="font-size: 0.58rem; color: var(--color-warning); font-weight: 600; margin-top: 2px;">Confirmed Completion</span>
                            </div>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800;">${closureData?.closureDate ? new Date(closureData.closureDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not Set'}</span>
                        </div>

                        <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:20px;" onclick="const inp = this.querySelector('input'); if(inp && document.activeElement !== inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                            <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Planned Commencement Date</label>
                        <input type="${stateData.commencementDate ? 'date' : 'text'}" 
                               id="${IDS.SUPER_COMMENCE_DATE}" 
                               class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.commencementDate || ''}"
                               placeholder="Date"
                               onfocus="this.type='date';"
                               onblur="if(!this.value) this.type='text';"
                               style="border-radius:0;padding:12px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                        
                        ${(stateData.commencementDate && new Date(stateData.commencementDate).getMonth() !== 5 && getCurrentFinancialYear(new Date(stateData.commencementDate)) === getCurrentFinancialYear()) ? `
                            ${this._renderOrangeWarning('Strategic Alert: Pro-Rata Trap', 'Starting before June 1st triggers a mandatory pro-rata payment. Delaying until June 1st allows you to bypass this payment entirely.')}
                        ` : ''}
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
            }

            case SUPER_STATES.FINALISED: {
                const closureData = superStrategyStore.getStateData(SUPER_STATES.PENSION_CLOSURE);
                const recontribData = superStrategyStore.getStateData(SUPER_STATES.RECONTRIBUTION);
                const commencementDate = stateData.commencementDate ? new Date(stateData.commencementDate) : null;
                const isJune1st = commencementDate && commencementDate.getMonth() === 5 && commencementDate.getDate() >= 1;
                
                // Determine remaining FY mandate
                let remainingPayout = 'N/A';
                if (isJune1st) {
                    remainingPayout = '$0.00 (Strategic Reset)';
                } else if (commencementDate) {
                    const fy = getCurrentFinancialYear(commencementDate);
                    const fyEnd = new Date(fy, 5, 30);
                    const drawRate = getDrawdownRate(data.ageAtJuly1);
                    const msPerDay = 86400000;
                    const daysRemaining = Math.max(1, Math.ceil((fyEnd - commencementDate) / msPerDay) + 1);
                    const totalDays = Math.ceil((fyEnd - new Date(fy - 1, 6, 1)) / msPerDay) + 1;
                    remainingPayout = formatCurrency(Math.round(calc.newPensionStart * drawRate * (daysRemaining / totalDays) * 100) / 100);
                }

                return `
                    <div id="${IDS.SUPER_STEP_DETAIL}" style="padding: 0; background: transparent; border-radius: 0; margin: 0 0 24px;">
                        
                        <div style="padding: 24px 20px; border: 1px solid rgba(255,255,255,0.12); border-radius: 0; margin-bottom: 24px; background: rgba(255,255,255,0.02); box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                            <!-- Clean Header -->
                            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 18px;">
                                <div style="color: var(--color-positive); font-size: 1.6rem;">
                                    <i class="fas fa-file-invoice-dollar"></i>
                                </div>
                                <div>
                                    <h3 style="font-size: 1.1rem; font-weight: 950; color: #fff; margin: 0; letter-spacing: -0.5px; text-transform: uppercase;">Master Strategy Record</h3>
                                    <div style="font-size: 0.62rem; color: var(--color-positive); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8;">Phase 3 Completion Audit</div>
                                </div>
                            </div>

                            <!-- 1. Baseline Position -->
                            <div style="margin-bottom: 24px;">
                                <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-database"></i> Baseline Position <span style="font-weight: 400; opacity: 0.6;">(1 July)</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                                    <span style="font-size: 0.72rem; color: #fff; opacity: 0.8;">Total Member Balance</span>
                                    <span style="font-size: 0.75rem; color: #fff; font-weight: 800;">${formatCurrency(data.accumulationBalance + data.pensionBalance)}</span>
                                </div>
                            </div>

                            <!-- 2. Execution Forensics -->
                            <div style="margin-bottom: 24px;">
                                <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-microchip"></i> Strategy Forensics
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                                    <span style="font-size: 0.72rem; color: #fff; opacity: 0.8;">Tax-Free Conversion</span>
                                    <span style="font-size: 0.75rem; color: var(--color-accent); font-weight: 800;">${formatCurrency(recontribData?.recontributionAmount || 0)}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                                    <span style="font-size: 0.72rem; color: #fff; opacity: 0.8;">Pensions Closure Payout</span>
                                    <span style="font-size: 0.75rem; color: #fff; font-weight: 800;">${formatCurrency(closureData?.proRataPayout || 0)}</span>
                                </div>
                            </div>

                            <!-- 3. Final Result -->
                            <div style="padding: 16px 0; border-top: 1px solid rgba(255,255,255,0.1);">
                                <div style="font-size: 0.62rem; color: var(--color-accent); font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-check-double"></i> Current Post-Strategy Result
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">Restart Date</span>
                                        <span style="font-size: 0.85rem; color: #fff; font-weight: 800;">${stateData.commencementDate ? new Date(stateData.commencementDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Confirmed'}</span>
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                        <span style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">New Pension Start</span>
                                        <span style="font-size: 1.1rem; color: var(--color-positive); font-weight: 950;">${formatCurrency(calc.newPensionStart)}</span>
                                    </div>
                                </div>
                                <div style="padding-top: 10px; border-top: 1px dotted rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.65rem; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Remaining FY Payout</span>
                                    <span style="font-size: 0.8rem; color: ${isJune1st ? 'var(--color-positive)' : 'var(--color-accent)'}; font-weight: 950;">${remainingPayout}</span>
                                </div>
                            </div>
                        </div>

                         <button id="super-final-reset-btn" class="${CSS_CLASSES.PRIMARY_PILL_BTN}" style="width: 100%; border-radius: 0; padding: 16px; font-weight: 950; font-size: 0.9rem; background: var(--color-accent); color: #000; border: none; cursor: pointer; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 1px;">
                            Archive & Restart Pipeline
                        </button>
                        <button id="super-back-btn" style="width: 100%; padding: 12px; border-radius: 0; background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                            <i class="fas fa-arrow-left" style="margin-right: 8px; font-size: 0.75rem;"></i>Adjust Strategy Details
                        </button>
                    </div>
                `;
                break;
            }

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
                    <div style="font-size: 0.65rem; color: var(--color-accent); font-weight: 950; text-transform: uppercase; letter-spacing: 2.5px; margin-bottom: 20px;">FY ${fy - 1}/${String(fy).slice(-2)} Consolidation Command</div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                            <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Current Acc. Balance</span>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800;">${formatCurrency(calc.currentAcc)}</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                            <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Pension Closure (Net)</span>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800;">${formatCurrency(closedBalanceNet)}</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <div style="display: flex; flex-direction: column; opacity: 0.4;">
                                <span style="font-size: 0.62rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Personal Contribution (Step 1)</span>
                                <span style="font-size: 0.58rem; color: var(--color-positive); font-weight: 600; margin-top: 2px;">(Included in Valuation)</span>
                            </div>
                            <span style="font-size: 0.95rem; color: #fff; font-weight: 800; opacity: 0.4;">${formatCurrency(clearedStep1)}</span>
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

                        ${calc.excessTBC > 0 ? this._renderOrangeWarning(`TBC Overlap Detected (${formatCurrency(calc.contributionCaps.tbc).replace(',000,000', '.0')}M Cap)`, `Your restart exceeds the Transfer Balance Cap. You can only put ${formatCurrency(calc.contributionCaps.tbc)} into the tax-free pension. The remaining ${formatCurrency(calc.excessTBC)} MUST stay in accumulation.`) : ''}

                        <!-- Fixed Account Verification Note -->
                        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 0; border: 1px solid rgba(255,255,255,0.03); margin-top: 12px; font-size: 0.65rem; color: var(--text-muted); line-height: 1.4;">
                            <i class="fas fa-shield-check" style="margin-right: 6px; color: var(--color-positive); opacity: 0.7;"></i>
                            <strong>Data Integrity:</strong> Your manual valuation above should match your fund dashboard, which already includes your completed Step 1 contribution.
                        </div>
                    </div>



                    <!-- Available to Re-Contribute Tile (Redundant tile removed) -->

                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 20px;" onclick="const inp = this.querySelector('input'); if(inp && document.activeElement !== inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                        <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: block; opacity: 0.7;">Re-Contribution Amount</label>
                        <input type="number" id="${IDS.SUPER_RECONTRIBUTION_AMOUNT}" class="${CSS_CLASSES.FORM_CONTROL}"
                               value="${stateData.recontributionAmount || ''}" placeholder="0.00" step="0.01"
                               ${!eligibility.eligible ? 'disabled' : ''}
                               max="${eligibility.maxAmount}"
                               style="border-radius: 0; padding: 12px; font-weight: 700; width: 100%; outline: none; ${!eligibility.eligible ? 'opacity: 0.4;' : ''}">
                        
                        ${!eligibility.eligible ? `
                        <div style="font-size: 0.65rem; color: #ff3b30; font-weight: 800; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-lock"></i> 
                            <span>Contribution Blocked: ${calc.totalBalance >= calc.contributionCaps.tbc ? 'TSB Limit Reached' : 'Cap Exhausted'}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom: 20px;" onclick="const inp = this.querySelector('input'); if(inp && document.activeElement !== inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
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
                                Starting in May requires a mandatory pro-rata payment before June 30, ${fy}. If you have any doubt, delay your restart until June 1st to skip this payment.
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
    // Info / Reference Tab
    // ─────────────────────────────────────────

    _renderInfoTab(data, calc) {
        const fy = calc.financialYear;
        const daysLeft = calc.daysUntilEOFY;
        const countdownColor = daysLeft <= 30 ? '#ff3b30' : daysLeft <= 60 ? '#ffa500' : 'var(--color-positive)';

        // Shared Style Tokens
        const CARD_STYLE = `background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:0; padding:20px; position:relative; overflow:hidden; margin-bottom:16px;`;
        const CARD_NUMBER = (n) => `<div style="position:absolute; right:-10px; top:-15px; font-size:6rem; font-weight:950; color:rgba(255,255,255,0.03); z-index:0; user-select:none;">${n}</div>`;
        const STEP_TITLE = `font-size:0.85rem; color:#fff; font-weight:950; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:4px; position:relative; z-index:1;`;
        const STEP_GOAL = `font-size:0.68rem; color:var(--text-muted); font-weight:600; line-height:1.4; margin-bottom:0; opacity:0.6; position:relative; z-index:1;`;
        const ADVICE_BOX = (type, text) => {
            const color = type === 'alert' ? '#ff3b30' : type === 'check' ? 'var(--color-positive)' : 'var(--color-accent)';
            const icon = type === 'alert' ? 'fa-exclamation-triangle' : type === 'check' ? 'fa-check-circle' : 'fa-info-circle';
            return `
                <div style="display:flex; gap:10px; padding:12px; background:rgba(${type === 'alert' ? '255,59,48' : 'var(--accent-rgb, 120, 100, 255)'}, 0.06); border:1px solid rgba(${type === 'alert' ? '255,59,48' : 'var(--accent-rgb, 120, 100, 255)'}, 0.15); margin-top:10px; position:relative; z-index:1;">
                    <i class="fas ${icon}" style="color:${color}; margin-top:2px; font-size:0.8rem;"></i>
                    <div style="font-size:0.72rem; color:var(--text-muted); line-height:1.4; font-weight:600;">${text}</div>
                </div>
            `;
        };

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
            <!-- 1. The Pulse (EOFY Countdown & Target) -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:24px;">
                <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); padding:16px; border-top:3px solid ${countdownColor};">
                    <div style="font-size:0.6rem; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-muted); margin-bottom:6px;">EOF Strategy Countdown</div>
                    <div style="font-size:1.4rem; font-weight:950; color:${countdownColor}; line-height:1;">${daysLeft} Days</div>
                </div>
                <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); padding:16px; border-top:3px solid var(--color-accent);">
                    <div style="font-size:0.6rem; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-muted); margin-bottom:6px;">Current FY Target</div>
                    <div style="font-size:1.4rem; font-weight:950; color:#fff; line-height:1;">30 JUNE ${fy}</div>
                </div>
            </div>

            <!-- 2. The Guardrails (High-Impact Caps) -->
            <!-- 2. The Guardrails (High-Impact Caps) -->
            <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:24px 0(14px) 2px;">Legislative Guardrails FY ${fy - 1} ${String(fy).slice(-2)}</div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:32px;">
                
                <!-- Concessional Card -->
                <details class="super-guardrail-accordion">
                    <summary style="background:rgba(0,188,212,0.06); border:1px solid rgba(0,188,212,0.2); padding:16px; border-top:3px solid #00bcd4; cursor:pointer; list-style:none;">
                        <div style="font-size:0.6rem; color:#00bcd4; font-weight:800; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            Concessional <i class="fas fa-chevron-down" style="font-size:0.5rem; opacity:0.4;"></i>
                        </div>
                        <div style="font-size:1.2rem; font-weight:950; color:#fff;">${formatCurrency(calc.contributionCaps.concessional)}</div>
                        <div style="font-size:0.55rem; color:rgba(255,255,255,0.4); margin-top:4px;">Employer & Tax-Claimed</div>
                    </summary>
                    <div style="padding:12px; background:rgba(0,0,0,0.2); font-size:0.65rem; color:var(--text-muted); line-height:1.4; border:1px solid rgba(0,188,212,0.1); border-top:none;">
                        <div style="font-weight:900; color:#00bcd4; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">Quick Reference</div>
                        <ul style="margin:0; padding-left:14px; list-style-type:circle;">
                            <li>The $30,000 cap includes Employer SG and Salary Sacrifice.</li>
                            <li><strong>Catch-up Rule:</strong> Carry forward up to 5 years of unused cap.</li>
                            <li><strong>Eligibility:</strong> Total Super Balance (TSB) must be under $500,000.</li>
                            <li>Personal deductible contributions also count toward this limit.</li>
                        </ul>
                    </div>
                </details>

                <!-- Non-Concessional Card -->
                <details class="super-guardrail-accordion">
                    <summary style="background:rgba(120,100,255,0.06); border:1px solid rgba(120,100,255,0.2); padding:16px; border-top:3px solid #7864ff; cursor:pointer; list-style:none;">
                        <div style="font-size:0.6rem; color:#7864ff; font-weight:800; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            Non Concessional <i class="fas fa-chevron-down" style="font-size:0.5rem; opacity:0.4;"></i>
                        </div>
                        <div style="font-size:1.2rem; font-weight:950; color:#fff;">${formatCurrency(calc.contributionCaps.nonConcessional)}</div>
                        <div style="font-size:0.55rem; color:rgba(255,255,255,0.4); margin-top:4px;">After-Tax Contribution</div>
                    </summary>
                    <div style="padding:12px; background:rgba(0,0,0,0.2); font-size:0.65rem; color:var(--text-muted); line-height:1.4; border:1px solid rgba(120,100,255,0.1); border-top:none;">
                        <div style="font-weight:900; color:#7864ff; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">Quick Reference</div>
                        <ul style="margin:0; padding-left:14px; list-style-type:circle;">
                            <li>$120,000 standard annual cap from after-tax savings.</li>
                            <li><strong>Bring-Forward:</strong> Up to $360,000 over 3 years trigger.</li>
                            <li><strong>Balance Limits:</strong> TSB must be &lt; $1.66M for the 3-year window.</li>
                            <li>Caps reduce to $240k or $0 as balance approaches $1.9M.</li>
                        </ul>
                    </div>
                </details>

                <!-- Transfer Cap Card -->
                <details class="super-guardrail-accordion">
                    <summary style="background:rgba(255,165,0,0.06); border:1px solid rgba(255,165,0,0.2); padding:16px; border-top:3px solid #ffa500; cursor:pointer; list-style:none;">
                        <div style="font-size:0.6rem; color:#ffa500; font-weight:800; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            Transfer Cap <i class="fas fa-chevron-down" style="font-size:0.5rem; opacity:0.4;"></i>
                        </div>
                        <div style="font-size:1.2rem; font-weight:950; color:#fff;">${formatCurrency(calc.contributionCaps.tbc).replace(',000,000', '.0M')}</div>
                        <div style="font-size:0.55rem; color:rgba(255,255,255,0.4); margin-top:4px;">Pension Entry Limit TBC</div>
                    </summary>
                    <div style="padding:12px; background:rgba(0,0,0,0.2); font-size:0.65rem; color:var(--text-muted); line-height:1.4; border:1px solid rgba(255,165,0,0.1); border-top:none;">
                        <div style="font-weight:900; color:#ffa500; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">Quick Reference</div>
                        <ul style="margin:0; padding-left:14px; list-style-type:circle;">
                            <li>The limit on the amount of super that can be moved to pension phase.</li>
                            <li>Currently $1.9 million for the 2024-25 financial year.</li>
                            <li>Earnings inside a pension are generally tax-free (0%).</li>
                            <li>Excess funds must remain in accumulation (15% tax phase).</li>
                        </ul>
                    </div>
                </details>

                <!-- NCC Availability Card -->
                <details class="super-guardrail-accordion">
                    <summary style="background:rgba(255,59,48,0.06); border:1px solid rgba(255,59,48,0.2); padding:16px; border-top:3px solid #ff3b30; cursor:pointer; list-style:none;">
                        <div style="font-size:0.6rem; color:#ff3b30; font-weight:800; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            NCC Availability <i class="fas fa-chevron-down" style="font-size:0.5rem; opacity:0.4;"></i>
                        </div>
                        <div style="font-size:1.2rem; font-weight:950; color:#fff;">
                            ${calc.recontributionEligibility.eligible ? formatCurrency(calc.recontributionEligibility.maxAmount).replace('.00', '') : 'Cap Used'}
                        </div>
                        <div style="font-size:0.55rem; color:rgba(255,255,255,0.4); margin-top:4px;">
                            ${calc.recontributionEligibility.bringForwardStatus.available ? 'Ready for New Window' : `Available 1st July ${calc.recontributionEligibility.bringForwardStatus.nextAvailableFY - 1}`}
                        </div>
                    </summary>
                    <div style="padding:12px; background:rgba(0,0,0,0.2); font-size:0.65rem; color:var(--text-muted); line-height:1.4; border:1px solid rgba(255,59,48,0.1); border-top:none;">
                        <div style="font-weight:900; color:#ff3b30; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">Quick Reference</div>
                        <ul style="margin:0; padding-left:14px; list-style-type:circle;">
                            <li>Tracks your personal 3-year bring-forward window status.</li>
                            <li><strong>Trigger:</strong> Contributing over $120,000 in a single year.</li>
                            <li>Availability depends on your TSB from the previous June 30th.</li>
                            <li>NCC contributions are generally restricted after age 75.</li>
                        </ul>
                    </div>
                </details>
            </div>

            <!-- 3. The 7-Step Strategic Roadmap -->
            <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:24px 0 14px 2px;">Step-by-Step Strategic Roadmap</div>
            
            <!-- Step 1: Contribution -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">01</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 1 - Contribution Entry</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Move your after-tax savings into your Brighter Super account. This is the physical start of the recycling process.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        You can use BPAY or Electronic Funds Transfer. This step turns your personal bank savings into superannuation assets. It is vital to keep your transaction receipt as proof of the date the transfer was initiated.
                    </div>
                    ${ADVICE_BOX('accent', `Timing Strategy - Funds should clear before 20 June to avoid bank delays. Late entries may miss the tax year deadline.`)}
                    ${ADVICE_BOX('check', `Positive Strategy - Getting funds in early maximizes your time inside the low-tax super environment. The 15% internal tax rate is significantly more efficient than personal tax on bank interest.`)}
                </div>
            </details>
 
            <!-- Step 2: The Tax Claim -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">02</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 2 - Notice of Intent</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Formally notify the fund that you intend to claim this contribution as a personal tax deduction.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        This is the "Tax Switch" stage. By submitting this notice, you tell the ATO that this money should reduce your taxable income. Without this form, you cannot claim the 15% super tax rate benefit on your personal return.
                    </div>
                    ${data.ageAtJuly1 >= 67 ? ADVICE_BOX('alert', `Work Test Required - As you are aged 67 or older, you MUST meet the 40-hour work test to claim this tax deduction. Non-deductible contributions do not require this test.`) : ''}
                    ${ADVICE_BOX('alert', `Strategic Lock - You must receive the Fund Acknowledge Letter before you close the account or start a pension.`)}
                    ${ADVICE_BOX('check', `Tax Benefit - Successful submission effectively reduces your taxable income, potentially moving you into a lower tax bracket for the year.`)}
                </div>
            </details>
 
            <!-- Step 3: Confirmation -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">03</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 3 - Fund Confirmation</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Verify that your contribution has officially been recorded as Concessional.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        Log into your Brighter Super portal and check your 'Contribution History'. You are looking for the status to change from 'Personal After-Tax' to 'Personal Concessional'. This ensures the tax office recognizes the strategy.
                    </div>
                    ${ADVICE_BOX('check', `Look for the official "Notice of Intent Acknowledgment" in your portal inbox.`)}
                </div>
            </details>
 
            <!-- Step 4: Pension Closure -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">04</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 4 - Pension Closure</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Close your current pension account to allow your new money to be consolidated.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        Closing the pension, also known as commutation, stops the current income stream so that the money can be sent back to accumulation. This allows the new tax-deductible money from Stage 1 to mix with your existing balance.
                    </div>
                    ${ADVICE_BOX('alert', `Mandatory Payout - Before closure, you must receive a pro-rata payment based on your existing annual minimum requirement, calculated up to the closure date.`)}
                    ${ADVICE_BOX('check', `The Goal - This stage 'unlocks' your pension so you can combine it with new contributions, effectively refreshing your tax-free components.`)}
                </div>
            </details>
 
            <!-- Step 5: Re-Contribution -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">05</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 5 - Re-Contribution Command</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Move the consolidated money back into super as tax-free Non-Concessional funds.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        This is the "Tax Switch" stage. To change the tax components, the consolidated money must be physically withdrawn from the fund as a lump sum to your personal bank account and then deposited back as a new Non-Concessional contribution.
                    </div>
                    ${ADVICE_BOX('alert', `Condition of Release - A re-contribution tax switch requires a full Condition of Release, such as reaching age 60 and declaring permanent retirement.`)}
                    ${ADVICE_BOX('alert', `Avoid the Tax Switch Trap - To move money to the Tax-Free component, you MUST register this as a Non-Concessional contribution. Do NOT claim a tax deduction in Step 2 for these specific switch funds, or they will remain taxable.`)}
                    ${ADVICE_BOX('alert', `Bring-Forward Rule - $360,000 window. Exceeding this triggers a 47% penalty tax rate from the ATO.`)}
                    ${ADVICE_BOX('alert', `Age Restriction - Non-concessional contributions are generally only permitted until age 75. Ensure this strategy is completed before this milestone.`)}
                </div>
            </details>
 
            <!-- Step 6: Commencement -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">06</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 6 - New Pension Entry</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Start your new consolidated tax-free income stream.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        This step restarts your pension. You will set a new monthly payment amount. Starting after June 1st is a strategic move that can reduce your mandatory withdrawal requirements for the remainder of the year.
                    </div>
                    ${ADVICE_BOX('check', `Strategic Play - The June 1st Rule resets the mandatory minimum to zero for the rest of this financial year.`)}
                    ${ADVICE_BOX('accent', `Success - By restarting now, you avoid taking an unecessary cash payment this year, keeping your capital working for you longer.`)}
                </div>
            </details>
 
            <!-- Step 7: Finalised -->
            <details class="super-accordion">
                <summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:inline-flex; align-items:center; gap:12px;">
                            <span style="font-size:1.2rem; font-weight:950; color:rgba(255,255,255,0.1);">07</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:900; text-transform:uppercase; letter-spacing:1.5px;">Stage 7 - Strategy Finalised</span>
                        </div>
                        <div style="${STEP_GOAL} margin-bottom:0; padding-left:42px;">Confirm your position is audit-ready for the upcoming financial year.</div>
                    </div>
                </summary>
                <div class="super-accordion-content" style="padding-top:10px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px; position:relative; z-index:1;">
                        Double check that your bank account is receiving the correct monthly pension amounts. Ensure your accountant has all the Acknowledge Letters and receipts from the steps above for your next tax return.
                    </div>
                    ${ADVICE_BOX('accent', `Final Audit - Verify that automated pension payments match the new strategy in your portal.`)}
                </div>
            </details>
 
            <!-- 4. Technical Appendix (Deep Dive) -->
            <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);opacity:0.5;margin:24px 0 14px 2px;">Technical Appendices</div>
            
            <details class="super-accordion">
                <summary>Brighter Super Accumulation Account</summary>
                <div class="super-accordion-content">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px;">
                        The accumulation phase is designed for building wealth while you are still working or contributing. It serves as the primary container for employer SG, salary sacrifice, and personal deductible contributions.
                    </div>
                    ${ADVICE_BOX('accent', `Taxation - Investment earnings within this account are taxed at a maximum of 15%.`)}
                    ${ADVICE_BOX('check', `Fee Cap Benefit - Brighter Super caps administration fees at $650 per financial year. Accumulation accounts also receive a 15% tax rebate on these fees, further reducing the cost.`)}
                </div>
            </details>

            <details class="super-accordion">
                <summary>Brighter Super Pension Account</summary>
                <div class="super-accordion-content">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px;">
                        The pension phase (Account Based Pension) is used to provide an income stream once you meet a Condition of Release. New contributions cannot be added directly to this account; they must first go through accumulation.
                    </div>
                    ${ADVICE_BOX('check', `Tax-Free - Investment earnings in this account are 100% tax-exempt (0% tax).`)}
                    ${ADVICE_BOX('alert', `Fee Cap - The $650 administration fee cap also applies here, but without the 15% tax rebate as the account is already tax-free.`)}
                    ${ADVICE_BOX('accent', `Mandatory Drawdowns - ATO rules require a minimum annual withdrawal based on your age at July 1st each year.`)}
                </div>
            </details>

            <details class="super-accordion">
                <summary>Fund Specific Thresholds</summary>
                <div class="super-accordion-content">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom:12px;">
                        <div style="background: rgba(255,255,255,0.03); padding: 14px; border-left: 4px solid var(--color-accent);">
                            <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Accumulation Min</div>
                            <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.minAccumulationBalance)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 14px; border-left: 4px solid var(--color-accent);">
                            <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Pension Min</div>
                            <div style="font-size: 1.1rem; font-weight: 950; color: #fff;">${formatCurrency(SUPER_THRESHOLDS.minPensionRestart)}</div>
                        </div>
                    </div>
                    <div style="font-size:0.68rem; color:var(--text-muted); line-height:1.4; opacity:0.8;">
                         <i class="fas fa-info-circle" style="margin-right:4px; color:var(--color-accent);"></i>
                         <strong>Retention Buffer:</strong> Brighter Super requires a minimum of $8,000 to remain in accumulation to keep the account active when transferring to a pension. Balances under $6,000 have fees capped at 3% by the ATO.
                    </div>
                </div>
            </details>
 
            <details class="super-accordion">
                <summary>NCC Cap History</summary>
                <div class="super-accordion-content">
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
                                <td style="padding: 10px 16px; text-align: right;">$110,000</td>
                                <td style="padding: 10px 16px; text-align: right; font-weight: 800; color: var(--color-accent);">$330,000</td>
                            </tr>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <td style="padding: 10px 16px; font-weight: 700; color: #fff;">24-25</td>
                                <td style="padding: 10px 16px; text-align: right;">$120,000</td>
                                <td style="padding: 10px 16px; text-align: right; font-weight: 800; color: var(--color-accent);">$360,000</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 16px; font-weight: 700; color: #fff;">25-26 Target</td>
                                <td style="padding: 10px 16px; text-align: right;">$120,000</td>
                                <td style="padding: 10px 16px; text-align: right; font-weight: 800; color: var(--color-accent);">$360,000</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </details>
 
            <details class="super-accordion">
                <summary>Downsizer Contribution Opportunity</summary>
                <div class="super-accordion-content">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px;">
                        If you are aged 55 or older, you may be able to contribute up to $300,000 from the sale of your main residence. This is a one-time contribution that does not count toward your standard contribution caps.
                    </div>
                    ${ADVICE_BOX('check', `No Work Test - Downsizer contributions are exempt from the work test and the standard $1.9M balance limit.`)}
                    ${ADVICE_BOX('accent', `Lump Sum - This can be up to $600,000 for a couple, provided the home was owned for at least 10 years.`)}
                </div>
            </details>
 
            <details class="super-accordion">
                <summary>Total Super Balance (TSB) Thresholds</summary>
                <div class="super-accordion-content">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px;">
                        Your TSB as of June 30th in the previous financial year determines your eligibility for almost all high-impact strategies.
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.72rem; color: var(--text-muted);">
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px 0; color: #fff; font-weight: 700;">Under $500,000</td>
                            <td style="padding: 8px 0; text-align: right;">Eligible for Concessional Catch-up</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px 0; color: #fff; font-weight: 700;">Under $1.76M</td>
                            <td style="padding: 8px 0; text-align: right;">Eligible for 3yr NCC ($360k)</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px 0; color: #fff; font-weight: 700;">$1.76M – $1.88M</td>
                            <td style="padding: 8px 0; text-align: right;">Eligible for 2yr NCC ($240k)</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px 0; color: #fff; font-weight: 700;">$1.88M – $2.0M</td>
                            <td style="padding: 8px 0; text-align: right;">Standard NCC Only ($120k)</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #ff3b30; font-weight: 700;">Over $2.0M</td>
                            <td style="padding: 8px 0; text-align: right; color: #ff3b30;">NCC Cap is Zero (Blackout)</td>
                        </tr>
                    </table>
                </div>
            </details>

            <details class="super-accordion">
                <summary>Division 293 High Income Tax</summary>
                <div class="super-accordion-content">
                    <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.5; margin-bottom:12px;">
                        If your 'Combined Income' (Taxable Income + Reportable Fringe Benefits + Concessional Super Contributions) exceeds $250,000, you are subject to an additional 15% tax on your contributions.
                    </div>
                    ${ADVICE_BOX('alert', `Combined Threshold - This tax is triggered when your personal income and employer super together cross the $250k line.`)}
                </div>
            </details>
 
            <details class="super-accordion">
                <summary>ATO Statutory Drawdown Rates</summary>
                <div class="super-accordion-content">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.03);">
                                <th style="padding: 14px 18px; font-size: 0.65rem; text-align: left; color: var(--text-muted); text-transform: uppercase;">Age at 1 July</th>
                                <th style="padding: 14px 18px; font-size: 0.65rem; text-align: right; color: var(--text-muted); text-transform: uppercase;">Min Rate</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </details>
        `;
    }

    // ─────────────────────────────────────────
 
    _renderTimingStrategies(data, calc) {
        const cards = [];
        const daysLeft = calc.daysUntilEOFY;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentState = superStrategyStore.getCurrentState();
 
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
 
        if (currentMonth >= 3 && currentMonth <= 5) {
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
 
        if (currentState === SUPER_STATES.PENSION_CLOSURE || currentState === SUPER_STATES.RECONTRIBUTION) {
            cards.push({
                icon: 'fa-repeat',
                title: 'Re-Contribution Window',
                color: 'var(--color-accent)',
                text: `Maximise compounding by re-contributing early in the FY.`
            });
        }
 
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
 
        const SL   = 'font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);opacity:0.55;margin-bottom:4px;display:block;';
        const CV   = 'font-size:1.1rem;font-weight:900;color:#fff;line-height:1.2;';
        const CARD = 'background:rgba(255,255,255,0.04);border-radius:0;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);';
 
        return `
            <div style="background:rgba(255,255,255,0.04);border-radius:0;padding:20px;border:1px solid rgba(255,255,255,0.06);margin-bottom:16px;">
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
            ${H('What-If Simulator')}
            <div style="font-size: 0.6rem; color: var(--color-accent); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: -8px 0 16px 2px; opacity: 0.8;">
                <i class="fas fa-microchip" style="margin-right: 4px;"></i>
                Modeled for Financial Year ${fy - 1}-${String(fy).slice(-2)}
            </div>
            <div style="margin-bottom:32px;background:rgba(255,255,255,0.04);border-radius:0;padding:20px;border:1px solid rgba(255,255,255,0.06);box-shadow:var(--shadow-strong);">
                <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;font-weight:500;margin-bottom:24px;opacity:0.8;">
                    Model the impact of restarting your pension on a specific date. See how timing affects your mandatory pre-closure withdrawal, new pension minimum, and capital sustainability.
                </div>
 
                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;" onclick="const inp = this.querySelector('input'); if(inp) { try { inp.showPicker(); } catch (e) { inp.click(); } }">
                    <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">New Pension Start Date</label>
                    <input type="text" id="${IDS.SUPER_SIMULATION_DATE}" class="${CSS_CLASSES.FORM_CONTROL}"
                           placeholder="Date"
                           onfocus="this.type='date';"
                           onblur="if(!this.value) this.type='text'"
                           style="border-radius:0;padding:11px;cursor:pointer;font-weight:700;outline:none;width:100%;">
                </div>
 
                <div class="${CSS_CLASSES.FORM_GROUP}" style="margin-bottom:14px;">
                    <label style="font-size:0.62rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;display:block;opacity:0.55;">Re-Contribution Amount $</label>
                    <input type="number" id="super-sim-contribution" class="${CSS_CLASSES.FORM_CONTROL}"
                           placeholder="0.00" step="0.01"
                           style="border-radius:0;padding:11px;font-weight:700;outline:none;">
                </div>
 
                <div style="margin-bottom:20px;padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:0;border:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div style="font-size:0.85rem;font-weight:800;color:#fff;letter-spacing:0.2px;">Claim Tax Deduction</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;font-weight:600;opacity:0.7;">You save tax personally, but the fund takes 15% and this money becomes Taxable for your heirs.</div>
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
                        <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">First-year mandatory payment</div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--color-accent);">${formatCurrency(results.newMinimumDrawdown.amount)}</div>
                        <div style="font-size: 0.55rem; color: var(--text-muted); margin-top: 2px;">
                            ${results.june1stRuleApplies ? 'June 1st Rule - $0.00' : `Mandatory Pro-rata - ${results.newMinimumDrawdown.days} days`}
                        </div>
                    </div>
                </div>
 
                ${(!results.june1stRuleApplies && results.isNearEndOfYear) ? this._renderOrangeWarning('Strategic Warning: Late-Year Commencement', `Pushing closure to May 31st and restarting on June 1st avoids mandatory pro-rata payments for this year.`) : ''}

                ${(() => {
                    const d = new Date(results.proposedRestartDate);
                    if (d.getMonth() === 5) { // June
                        return `
                        <div style="margin-bottom: 16px; padding: 12px; background: rgba(120,100,255,0.1); border: 1px solid rgba(120,100,255,0.2); border-radius: 0;">
                            <div style="font-size: 0.65rem; color: #7864ff; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                                <i class="fas fa-lightbulb"></i> Pro-Tip - June Indexation Cliff
                            </div>
                            <div style="font-size: 0.72rem; color: #fff; line-height: 1.4; font-weight: 600;">
                                You are modeling a restart in June. Note that waiting until July 1st could unlock an additional $100,000 in Non-Concessional cap space due to legislated indexation. Compare this against a July 2nd start date to see the impact.
                            </div>
                        </div>
                        `;
                    }
                    return '';
                })()}
 
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">
                        ${results.isDeductible ? 'Concessional - Deductible' : 'Non-Concessional'}
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
 
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Pre-Closure Payout</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.preClosurePayout.amount)}</span>
                </div>
 
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Projected Balance</span>
                    <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${formatCurrency(results.projectedBalance)}</span>
                </div>
 
                <div style="display: flex; justify-content: space-between; padding: 10px 0; align-items: center;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Safety Floor Status</span>
                    <span style="font-size: 0.85rem; font-weight: 700; color: ${floorColor};">
                        <i class="fas ${results.safetyFloorCheck.safe ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="margin-right: 4px;"></i>
                        ${results.safetyFloorCheck.safe ? 'Safe' : `Shortfall ${formatCurrency(results.safetyFloorCheck.shortfall)}`}
                    </span>
                </div>
 
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
                </div>
 
                <div style="margin-top: 10px; font-size: 0.7rem; color: var(--text-muted); text-align: center;">
                    ${results.daysRemaining} days remaining in FY
                </div>
            </div>
        `;
    }

    _renderOrangeWarning(title, text) {
        return `
            <div style="margin-bottom: 24px;">
                <div style="font-size: 0.65rem; color: #ffa500; font-weight: 950; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${title}
                </div>
                <div style="font-size: 0.72rem; color: rgba(255,255,255,0.6); line-height: 1.5; font-weight: 600;">
                    ${text}
                </div>
            </div>
        `;
    }

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
            const dateInput = this.container.querySelector(`#${IDS.SUPER_SIMULATION_DATE}`);
            const contribInput = this.container.querySelector('#super-sim-contribution');
            const deductibleInput = this.container.querySelector(`#${IDS.SUPER_SIM_DEDUCTIBLE}`);

            const validateSim = () => {
                const amount = parseFloat(contribInput?.value) || 0;
                const isDeductible = deductibleInput?.checked || false;
                const simDate = dateInput?.value || new Date().toISOString();
                const tempFY = getCurrentFinancialYear(new Date(simDate));
                const caps = getCapData(tempFY);
                const calc = superStrategyStore.getCalculatedValues();
                const nccLimit = calc.recontributionEligibility.maxAmount;
                const limit = isDeductible ? caps.concessional : nccLimit;

                if (amount > limit) {
                    simBtn.disabled = true;
                    simBtn.style.opacity = '0.4';
                    simBtn.style.cursor = 'not-allowed';
                    simBtn.innerHTML = `Cap Exceeded (Max ${formatCurrency(limit).replace('.00','')})`;
                } else {
                    simBtn.disabled = false;
                    simBtn.style.opacity = '1';
                    simBtn.style.cursor = 'pointer';
                    simBtn.innerHTML = 'Run Forecast Simulation';
                }
            };

            if (contribInput) contribInput.addEventListener('input', validateSim);
            if (deductibleInput) deductibleInput.addEventListener('change', validateSim);
            if (dateInput) dateInput.addEventListener('change', validateSim);

            simBtn.addEventListener('click', () => {
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

        // Foundation Gate: Confirm / Edit
        const confirmBtn = this.container.querySelector('#super-confirm-position-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                superStrategyStore.confirmPosition();
                this.isEditingPosition = false;
                this.render();
            });
        }

        const editBtn = this.container.querySelector('#super-edit-position-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.isEditingPosition = !this.isEditingPosition;
                this.render();
            });
        }

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

        // Balance Inputs (Accumulation / Pension)
        const accEl = this.container.querySelector(`#${IDS.SUPER_ACCUMULATION_INPUT}`);
        const penEl = this.container.querySelector(`#${IDS.SUPER_PENSION_INPUT}`);
        if (accEl) accEl.addEventListener('change', (e) => {
            superStrategyStore.setAccumulationBalance(parseFloat(e.target.value) || 0);
            this.render();
        });
        if (penEl) penEl.addEventListener('change', (e) => {
            superStrategyStore.setPensionBalance(parseFloat(e.target.value) || 0);
            this.render();
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
