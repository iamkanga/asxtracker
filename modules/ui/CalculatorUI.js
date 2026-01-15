import { IDS, CSS_CLASSES, UI_ICONS } from '../utils/AppConstants.js';
import { formatCurrency } from '../utils/formatters.js';
import { navManager } from '../utils/NavigationManager.js';

export default class CalculatorUI {
    constructor() {
        this.currentMode = 'dividend'; // 'dividend' or 'simple'

        // Simple Calc State
        this.calcState = {
            current: '0',
            previous: null,
            operator: null,
            resetNext: false,
            history: ''
        };

        this.init();
    }

    init() {
        // Note: Sidebar Button binding moved to AppController.js for centralized transition delay control.
        // Tabs removed per USER REQUEST to centralize navigation in sidebar.

        // Bind Modal Close
        const modal = document.getElementById(IDS.CALCULATOR_MODAL);
        if (modal) {
            const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
            if (closeBtn) closeBtn.addEventListener('click', () => this.close());

            // Close on overlay click
            const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);
            if (overlay) overlay.addEventListener('click', () => this.close());
        }

        // --- Dividend Calculator Bindings ---
        const divPriceIp = document.getElementById(IDS.CALC_DIV_PRICE);
        const divAmountIp = document.getElementById(IDS.CALC_DIV_AMOUNT);
        const divFrankingInput = document.getElementById(IDS.CALC_DIV_FRANKING);
        const divInvestmentInput = document.getElementById(IDS.CALC_DIV_INVESTMENT);

        if (divPriceIp) divPriceIp.addEventListener('input', () => this.calculateDividend());
        if (divAmountIp) divAmountIp.addEventListener('input', () => this.calculateDividend());
        if (divFrankingInput) divFrankingInput.addEventListener('input', () => this.calculateDividend());
        if (divInvestmentInput) divInvestmentInput.addEventListener('input', () => this.calculateDividend());

        // --- Simple Calculator Bindings ---
        const keypad = document.querySelector(`.${CSS_CLASSES.CALC_KEYPAD}`);
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

    open(mode = 'dividend') {
        const modal = document.getElementById(IDS.CALCULATOR_MODAL);
        if (!modal) return;

        modal.classList.remove(CSS_CLASSES.HIDDEN);

        // Register with NavigationManager
        this._navActive = true;
        navManager.pushState(() => {
            if (!modal.classList.contains(CSS_CLASSES.HIDDEN)) {
                this._navActive = false;
                this.close();
            }
        });

        // Reset or default to dividend
        this.switchTab(mode);
    }

    close() {
        const modal = document.getElementById(IDS.CALCULATOR_MODAL);
        if (modal) {
            modal.classList.add(CSS_CLASSES.HIDDEN);

            // Remove from history stack if closed manually
            if (this._navActive) {
                this._navActive = false;
                navManager.popStateSilently();
            }
        }
    }

    switchTab(mode) {
        this.currentMode = mode;

        // Update Content
        const divContent = document.getElementById(IDS.CALC_CONTENT_DIVIDEND);
        const simpleContent = document.getElementById(IDS.CALC_CONTENT_SIMPLE);

        if (divContent && simpleContent) {
            const titleEl = document.getElementById('calculator-title');

            if (mode === 'dividend') {
                divContent.classList.remove(CSS_CLASSES.HIDDEN);
                simpleContent.classList.add(CSS_CLASSES.HIDDEN);
                if (titleEl) titleEl.textContent = 'Dividend Calculator';
                // Recalc to ensure fresh state
                this.calculateDividend();
            } else {
                divContent.classList.add(CSS_CLASSES.HIDDEN);
                simpleContent.classList.remove(CSS_CLASSES.HIDDEN);
                if (titleEl) titleEl.textContent = 'Calculator';
                this.updateDisplay();
            }
        }
    }

    // --- Dividend Logic ---
    calculateDividend() {
        const amountEl = document.getElementById(IDS.CALC_DIV_AMOUNT);
        const priceEl = document.getElementById(IDS.CALC_DIV_PRICE);
        const frankingEl = document.getElementById(IDS.CALC_DIV_FRANKING);
        const investmentEl = document.getElementById(IDS.CALC_DIV_INVESTMENT);
        const resultsEl = document.getElementById('calc-div-results');

        if (!amountEl || !frankingEl) return;

        const amount = parseFloat(amountEl.value);
        let franking = parseFloat(frankingEl.value);
        const price = priceEl ? parseFloat(priceEl.value) : 0;
        const investment = investmentEl ? parseFloat(investmentEl.value) : 0;

        // If core inputs are missing, hide results. Price is mandatory for yield.
        if (isNaN(amount) || amount <= 0 || isNaN(price) || price <= 0) {
            resultsEl.classList.add(CSS_CLASSES.HIDDEN);
            return;
        }

        if (isNaN(franking)) franking = 100;
        if (franking > 100) franking = 100;
        if (franking < 0) franking = 0;

        // Formula: Gross = Net / (1 - (TaxRate * FrankingProportion))
        const TAX_RATE = 0.30;
        const frankingProp = franking / 100;

        const grossAmount = amount / (1 - (TAX_RATE * frankingProp));
        const creditAmount = grossAmount - amount;

        // Yield Calculations
        const netYield = (amount / price) * 100;
        const grossYield = (grossAmount / price) * 100;

        // Investment Calculations
        let invUnfranked = 0;
        let invFranked = 0;
        let invGross = 0;
        let showInvestment = false;

        if (investment > 0) {
            const numShares = investment / price;
            invUnfranked = numShares * amount; // Cash
            invFranked = numShares * creditAmount; // Credits
            invGross = numShares * grossAmount; // Gross
            showInvestment = true;
        }

        // Display Results
        document.getElementById(IDS.CALC_RESULT_GROSS).textContent = formatCurrency(grossAmount);
        document.getElementById(IDS.CALC_RESULT_TAX).textContent = formatCurrency(creditAmount);

        const netYieldEl = document.getElementById(IDS.CALC_RESULT_YIELD_NET);
        const grossYieldEl = document.getElementById(IDS.CALC_RESULT_YIELD_GROSS);

        const invContainer = document.getElementById('calc-investment-totals');
        const invUnfrankedEl = document.getElementById(IDS.CALC_RESULT_INV_UNFRANKED);
        const invFrankedEl = document.getElementById(IDS.CALC_RESULT_INV_FRANKED);
        const invGrossEl = document.getElementById(IDS.CALC_RESULT_INV_GROSS);

        if (netYieldEl) netYieldEl.textContent = `${netYield.toFixed(2)}%`;
        if (grossYieldEl) grossYieldEl.textContent = `${grossYield.toFixed(2)}%`;

        if (invContainer) {
            if (showInvestment) {
                invContainer.classList.remove(CSS_CLASSES.HIDDEN);
                if (invUnfrankedEl) invUnfrankedEl.textContent = formatCurrency(invUnfranked);
                if (invFrankedEl) invFrankedEl.textContent = formatCurrency(invFranked);
                if (invGrossEl) invGrossEl.textContent = formatCurrency(invGross);
            } else {
                invContainer.classList.add(CSS_CLASSES.HIDDEN);
            }
        }

        resultsEl.classList.remove(CSS_CLASSES.HIDDEN);
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
        const main = document.getElementById('calc-display-main');
        const sub = document.getElementById('calc-display-sub');
        if (main) main.textContent = this.calcState.current;
        if (sub) sub.textContent = this.calcState.history;
    }
}
