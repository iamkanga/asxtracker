import { IDS, CSS_CLASSES, UI_ICONS } from '../utils/AppConstants.js';
import { formatCurrency } from '../utils/formatters.js';
import { navManager } from '../utils/NavigationManager.js';

export default class CalculatorUI {
    constructor() {
        this.currentMode = 'dividend'; // 'dividend' or 'simple'
        this.container = null; // Container element

        // Simple Calc State
        this.calcState = {
            current: '0',
            previous: null,
            operator: null,
            resetNext: false,
            history: ''
        };
    }

    /**
     * Shows the Calculator in a standalone modal.
     */
    static showModal(options = {}) {
        const existing = document.getElementById(IDS.CALCULATOR_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.CALCULATOR_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM}" style="height: 85vh; max-height: 750px; display: flex; flex-direction: column;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Calculators</h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}"><i class="fas ${UI_ICONS.CLOSE}"></i></button>
                </div>
                <div id="calc-modal-body" class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; overflow-y: auto; padding: 20px;"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Render Component
        const instance = new CalculatorUI();
        instance.render(modal.querySelector('#calc-modal-body'));

        // Nav Hook
        navManager.pushState(() => {
            if (modal.parentElement) modal.remove();
        });

        // Close Logic
        const close = () => {
            modal.remove();
            navManager.popStateSilently();
        };
        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);
    }

    /**
     * Render the Calculator UI into a specific container.
     * @param {HTMLElement} container - The element to inject the calculator into.
     */
    render(container) {
        if (!container) return;
        this.container = container;
        this.container.innerHTML = this.getTemplate();

        this.bindEvents();
        this.switchTab(this.currentMode);
    }

    getTemplate() {
        return `
            <div class="calculator-wrapper" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
                
                <!-- Internal Segmented Control for Calculator Type -->
                <div class="segmented-control" style="display: flex; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 4px; margin-bottom: 25px;">
                    <button class="segment-btn ${this.currentMode === 'dividend' ? 'active' : ''}" data-mode="dividend" style="flex: 1; padding: 10px; border: none; background: transparent; color: var(--text-muted); font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                        Dividend
                    </button>
                    <button class="segment-btn ${this.currentMode === 'simple' ? 'active' : ''}" data-mode="simple" style="flex: 1; padding: 10px; border: none; background: transparent; color: var(--text-muted); font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                        Standard
                    </button>
                </div>

                <style>
                    .segment-btn.active {
                        background: rgba(255,255,255,0.1) !important;
                        color: white !important;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    }
                </style>

                <!-- Content areas -->
                <div id="${IDS.CALC_CONTENT_DIVIDEND}" class="w-full ${this.currentMode === 'dividend' ? '' : CSS_CLASSES.HIDDEN}">
                    <!-- Inputs -->
                    <div class="form-group">
                        <label class="input-label">Share Price ($)</label>
                        <div class="input-wrapper">
                            <i class="fas fa-tag input-icon"></i>
                            <input type="number" id="${IDS.CALC_DIV_PRICE}" class="standard-input" placeholder="0.00" step="0.01">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="input-label">Dividend Amount ($)</label>
                        <div class="input-wrapper">
                            <i class="fas fa-dollar-sign input-icon"></i>
                            <input type="number" id="${IDS.CALC_DIV_AMOUNT}" class="standard-input" placeholder="0.00" step="0.01">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="input-label">Franking Credit (%)</label>
                        <div class="input-wrapper">
                            <i class="fas fa-percentage input-icon"></i>
                            <input type="number" id="${IDS.CALC_DIV_FRANKING}" class="standard-input" placeholder="100" max="100" min="0">
                        </div>
                    </div>

                    <!-- Investment Option -->
                    <div class="form-group mb-medium mt-small">
                        <label class="input-label">Investment Value ($)</label>
                        <div class="input-wrapper">
                            <i class="fas fa-wallet input-icon"></i>
                            <input type="number" id="${IDS.CALC_DIV_INVESTMENT}" class="standard-input" placeholder="Optional" step="100">
                        </div>
                    </div>

                    <div id="calc-div-results" class="hidden mt-small" style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 15px;">
                        <div class="flex-row justify-between align-center mb-tiny">
                            <span class="text-sm text-muted">Unfranked Yield</span>
                            <span id="${IDS.CALC_RESULT_YIELD_NET}" class="font-bold text-lg text-color">0.00%</span>
                        </div>
                        <div class="flex-row justify-between align-center mb-small">
                            <span class="text-sm text-muted">Franked Yield</span>
                            <span id="${IDS.CALC_RESULT_YIELD_GROSS}" class="font-bold text-lg text-color">0.00%</span>
                        </div>

                        <!-- Investment Totals -->
                        <div id="calc-investment-totals" class="hidden pt-small border-top-subtle" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 10px;">
                            <div class="flex-row justify-between align-center mb-tiny">
                                <span class="text-sm text-muted">Franked Amount</span>
                                <span id="${IDS.CALC_RESULT_INV_UNFRANKED}" class="font-bold text-md text-color">$0.00</span>
                            </div>
                            <div class="flex-row justify-between align-center mb-tiny">
                                <span class="text-sm text-muted">Franking Credits</span>
                                <span id="${IDS.CALC_RESULT_INV_FRANKED}" class="font-bold text-md text-color">$0.00</span>
                            </div>
                            <div class="flex-row justify-between align-center mb-tiny" style="margin-top: 8px;">
                                <span class="text-sm text-muted">Gross Income</span>
                                <span id="${IDS.CALC_RESULT_INV_GROSS}" class="font-bold text-lg text-coffee" style="color: var(--color-accent) !important;">$0.00</span>
                            </div>
                        </div>

                        <!-- Detailed Breakdown -->
                        <div class="flex-row justify-between align-center mt-small px-small" style="margin-top: 15px; opacity: 0.7;">
                            <span class="text-xs text-muted">Gross Income (per share)</span>
                            <span id="${IDS.CALC_RESULT_GROSS}" class="text-xs text-color">$0.00</span>
                        </div>
                        <div class="flex-row justify-between align-center px-small" style="opacity: 0.7;">
                            <span class="text-xs text-muted">Franking Credit (per share)</span>
                            <span id="${IDS.CALC_RESULT_TAX}" class="text-xs text-color">$0.00</span>
                        </div>
                    </div>
                </div>

                <!-- Simple Calculator -->
                <div id="${IDS.CALC_CONTENT_SIMPLE}" class="${this.currentMode === 'simple' ? '' : CSS_CLASSES.HIDDEN} w-full h-full flex-column">
                    <div class="calc-display-container" style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 10px 20px 20px 20px; text-align: right; margin-bottom: 20px; overflow: visible;">
                        <div id="calc-display-sub" class="calc-display-sub" style="font-size: 0.9rem; color: var(--text-muted); min-height: 1.2em; line-height: 1.2;"></div>
                        <div id="calc-display-main" class="calc-display-main" style="font-size: 2.5rem; font-weight: 300; font-family: monospace; line-height: 1.1;">0</div>
                    </div>
                    <div class="calc-keypad" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                        <button class="calc-key calc-key-action" data-action="clear" style="grid-column: span 1; background: rgba(255,59,48,0.2); color: #ff3b30;">C</button>
                        <button class="calc-key calc-key-action" data-action="backspace"><i class="fas fa-backspace"></i></button>
                        <button class="calc-key calc-key-action" data-action="percent">%</button>
                        <button class="calc-key calc-key-operator" data-action="divide" style="color: var(--color-accent);">÷</button>

                        <button class="calc-key" data-number="7">7</button>
                        <button class="calc-key" data-number="8">8</button>
                        <button class="calc-key" data-number="9">9</button>
                        <button class="calc-key calc-key-operator" data-action="multiply" style="color: var(--color-accent);">×</button>

                        <button class="calc-key" data-number="4">4</button>
                        <button class="calc-key" data-number="5">5</button>
                        <button class="calc-key" data-number="6">6</button>
                        <button class="calc-key calc-key-operator" data-action="subtract" style="color: var(--color-accent);">−</button>

                        <button class="calc-key" data-number="1">1</button>
                        <button class="calc-key" data-number="2">2</button>
                        <button class="calc-key" data-number="3">3</button>
                        <button class="calc-key calc-key-operator" data-action="add" style="color: var(--color-accent);">+</button>

                        <button class="calc-key calc-key-zero" data-number="0" style="grid-column: span 2;">0</button>
                        <button class="calc-key" data-action="decimal">.</button>
                        <button class="calc-key calc-key-equal" data-action="calculate" style="background: var(--color-accent); color: #000;">=</button>
                    </div>
                    <style>
                        .calc-key {
                            padding: 15px;
                            border-radius: 12px;
                            border: none;
                            background: rgba(255,255,255,0.06);
                            color: white;
                            font-size: 1.2rem;
                            cursor: pointer;
                            transition: background 0.1s;
                        }
                        .calc-key:active {
                            background: rgba(255,255,255,0.15);
                            transform: scale(0.95);
                        }
                    </style>
                </div>
            </div>
        `;
    }

    bindEvents() {
        if (!this.container) return;

        // --- Mode Toggle ---
        const modeBtns = this.container.querySelectorAll('.segment-btn'); // UPDATED SELECTOR
        modeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode; // Use currentTarget
                this.switchTab(mode);

                // Update active state
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // --- Dividend Calculator Bindings ---
        const divPriceIp = this.container.querySelector(`#${IDS.CALC_DIV_PRICE}`);
        const divAmountIp = this.container.querySelector(`#${IDS.CALC_DIV_AMOUNT}`);
        const divFrankingInput = this.container.querySelector(`#${IDS.CALC_DIV_FRANKING}`);
        const divInvestmentInput = this.container.querySelector(`#${IDS.CALC_DIV_INVESTMENT}`);

        if (divPriceIp) divPriceIp.addEventListener('input', () => this.calculateDividend());
        if (divAmountIp) divAmountIp.addEventListener('input', () => this.calculateDividend());
        if (divFrankingInput) divFrankingInput.addEventListener('input', () => this.calculateDividend());
        if (divInvestmentInput) divInvestmentInput.addEventListener('input', () => this.calculateDividend());

        // --- Simple Calculator Bindings ---
        const keypad = this.container.querySelector(`.calc-keypad`);
        if (keypad) {
            keypad.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;

                // Handle different button types
                if (btn.dataset.number) this.handleNumber(btn.dataset.number);
                else if (btn.dataset.action) this.handleAction(btn.dataset.action);
            });
        }
    }

    switchTab(mode) {
        this.currentMode = mode;
        const divContent = this.container.querySelector(`#${IDS.CALC_CONTENT_DIVIDEND}`);
        const simpleContent = this.container.querySelector(`#${IDS.CALC_CONTENT_SIMPLE}`);

        if (divContent && simpleContent) {
            if (mode === 'dividend') {
                divContent.classList.remove(CSS_CLASSES.HIDDEN);
                simpleContent.classList.add(CSS_CLASSES.HIDDEN);
                this.calculateDividend();
            } else {
                divContent.classList.add(CSS_CLASSES.HIDDEN);
                simpleContent.classList.remove(CSS_CLASSES.HIDDEN);
                this.updateDisplay();
            }
        }
    }

    // --- Dividend Logic ---
    calculateDividend() {
        // Must search within container
        const amountEl = this.container.querySelector(`#${IDS.CALC_DIV_AMOUNT}`);
        const priceEl = this.container.querySelector(`#${IDS.CALC_DIV_PRICE}`);
        const frankingEl = this.container.querySelector(`#${IDS.CALC_DIV_FRANKING}`);
        const investmentEl = this.container.querySelector(`#${IDS.CALC_DIV_INVESTMENT}`);
        const resultsEl = this.container.querySelector('#calc-div-results');

        if (!amountEl || !frankingEl) return;

        const amount = parseFloat(amountEl.value);
        let franking = parseFloat(frankingEl.value);
        const price = priceEl ? parseFloat(priceEl.value) : 0;
        const investment = investmentEl ? parseFloat(investmentEl.value) : 0;

        if (isNaN(amount) || amount <= 0 || isNaN(price) || price <= 0) {
            resultsEl.classList.add(CSS_CLASSES.HIDDEN);
            return;
        }

        if (isNaN(franking)) franking = 100;
        if (franking > 100) franking = 100;
        if (franking < 0) franking = 0;

        const TAX_RATE = 0.30;
        const frankingProp = franking / 100;

        const grossAmount = amount / (1 - (TAX_RATE * frankingProp));
        const creditAmount = grossAmount - amount;

        const netYield = (amount / price) * 100;
        const grossYield = (grossAmount / price) * 100;

        let invUnfranked = 0;
        let invFranked = 0;
        let invGross = 0;
        let showInvestment = false;

        if (investment > 0) {
            const numShares = investment / price;
            invUnfranked = numShares * amount;
            invFranked = numShares * creditAmount;
            invGross = numShares * grossAmount;
            showInvestment = true;
        }

        this.setText(`#${IDS.CALC_RESULT_GROSS}`, formatCurrency(grossAmount));
        this.setText(`#${IDS.CALC_RESULT_TAX}`, formatCurrency(creditAmount));
        this.setText(`#${IDS.CALC_RESULT_YIELD_NET}`, `${netYield.toFixed(2)}%`);
        this.setText(`#${IDS.CALC_RESULT_YIELD_GROSS}`, `${grossYield.toFixed(2)}%`);

        const invContainer = this.container.querySelector('#calc-investment-totals');
        if (invContainer) {
            if (showInvestment) {
                invContainer.classList.remove(CSS_CLASSES.HIDDEN);
                this.setText(`#${IDS.CALC_RESULT_INV_UNFRANKED}`, formatCurrency(invUnfranked));
                this.setText(`#${IDS.CALC_RESULT_INV_FRANKED}`, formatCurrency(invFranked));
                this.setText(`#${IDS.CALC_RESULT_INV_GROSS}`, formatCurrency(invGross));
            } else {
                invContainer.classList.add(CSS_CLASSES.HIDDEN);
            }
        }

        resultsEl.classList.remove(CSS_CLASSES.HIDDEN);
    }

    setText(selector, text) {
        const el = this.container.querySelector(selector);
        if (el) el.textContent = text;
    }

    // --- Simple Calculator Logic ---
    handleNumber(num) {
        if (this.calcState.resetNext) {
            this.calcState.current = num;
            this.calcState.resetNext = false;
        } else {
            this.calcState.current = this.calcState.current === '0' ? num : this.calcState.current + num;
        }
        this.updateDisplay();
    }

    handleAction(action) {
        switch (action) {
            case 'clear':
                this.calcState = { current: '0', previous: null, operator: null, resetNext: false, history: '' };
                break;
            case 'backspace':
                if (this.calcState.current.length > 1) {
                    this.calcState.current = this.calcState.current.slice(0, -1);
                } else {
                    this.calcState.current = '0';
                }
                break;
            case 'decimal':
                if (!this.calcState.current.includes('.')) {
                    this.calcState.current += '.';
                }
                break;
            case 'percent':
                const cur = parseFloat(this.calcState.current);
                if (this.calcState.operator && this.calcState.previous) {
                    const prev = parseFloat(this.calcState.previous);
                    const percentVal = prev * (cur / 100);
                    this.calcState.current = percentVal.toString();
                    this.calcState.history += ` ${cur}%`;
                } else {
                    this.calcState.current = (cur / 100).toString();
                }
                this.calcState.resetNext = true;
                break;
            case 'divide':
            case 'multiply':
            case 'subtract':
            case 'add':
                this.handleOperator(action);
                break;
            case 'calculate':
                this.calculateResult();
                break;
        }
        this.updateDisplay();
    }

    handleOperator(op) {
        if (this.calcState.operator && !this.calcState.resetNext) {
            this.calculateResult();
        }

        this.calcState.previous = this.calcState.current;
        this.calcState.operator = op;
        this.calcState.resetNext = true;

        let symbol = '';
        if (op === 'add') symbol = '+';
        if (op === 'subtract') symbol = '-';
        if (op === 'multiply') symbol = '×';
        if (op === 'divide') symbol = '÷';

        this.calcState.history = `${this.calcState.previous} ${symbol}`;
    }

    calculateResult() {
        if (!this.calcState.previous || !this.calcState.operator) return;

        const prev = parseFloat(this.calcState.previous);
        const current = parseFloat(this.calcState.current);
        let res = 0;

        switch (this.calcState.operator) {
            case 'add': res = prev + current; break;
            case 'subtract': res = prev - current; break;
            case 'multiply': res = prev * current; break;
            case 'divide': res = prev / current; break;
        }

        res = Math.round(res * 100000000) / 100000000;

        this.calcState.current = res.toString();
        this.calcState.operator = null;
        this.calcState.previous = null;
        this.calcState.history = '';
        this.calcState.resetNext = true;
    }

    updateDisplay() {
        const main = this.container.querySelector('#calc-display-main');
        const sub = this.container.querySelector('#calc-display-sub');
        if (main) main.textContent = this.calcState.current;
        if (sub) sub.textContent = this.calcState.history;
    }
}
