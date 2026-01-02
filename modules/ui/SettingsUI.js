/**
 * SettingsUI.js
 * Renders the Settings Modal for Scanner Rules and User Preferences.
 * Handles Firestore Sync logic via UserStore.
 */

import { CSS_CLASSES, IDS, UI_ICONS, EVENTS, SECTORS_LIST } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { userStore } from '../data/DataService.js';

export class SettingsUI {
    static showModal(userId) {
        if (!userId) return;

        const modal = this._renderModal();
        document.body.appendChild(modal);

        // Subscribe to feed data into form
        const unsubscribe = userStore.subscribeToPreferences(userId, (prefs) => {
            if (document.contains(modal)) {
                this._populateForm(modal, prefs || {});
            }
        });

        // Bind Events (Save, Close)
        this._bindEvents(modal, userId, unsubscribe);

        // Show
        requestAnimationFrame(() => modal.classList.remove(CSS_CLASSES.HIDDEN));
    }

    static _renderModal() {
        const existing = document.getElementById(IDS.SETTINGS_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.SETTINGS_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} ${CSS_CLASSES.MODAL_CONTENT_MEDIUM} scrollable-modal">
                
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 class="${CSS_CLASSES.MODAL_TITLE}">Global Price Alerts</h2>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <!-- Save Button Removed (Auto-Save) -->
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY} ${CSS_CLASSES.SCROLLABLE_BODY}" style="padding-top: 0.5rem;"></div>
            </div>
        `;

        // Navigation Hook
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) {
                modal._navActive = false;
                modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).click();
            }
        });

        return modal;
    }

    static _populateForm(modal, prefs) {
        const container = modal.querySelector(`.${CSS_CLASSES.MODAL_BODY}`);

        // 1. Build Structure Once (Tracked via Flag)
        if (!modal.dataset.rendered) {
            this._buildStructure(container, modal);
            modal.dataset.rendered = 'true';
        }

        // 2. Update Values (Preserving Focus)
        this._updateValues(modal, prefs);
    }

    static _buildStructure(container, modal) {
        // Change Modal Title to "Global Settings"
        const modalTitle = modal.querySelector(`.${CSS_CLASSES.MODAL_TITLE}`);
        if (modalTitle) modalTitle.innerHTML = 'Global Settings';

        // --- 1. ALERTS SETTINGS (was Active Monitor) ---
        const summaryCard = document.createElement('div');
        summaryCard.className = CSS_CLASSES.DETAIL_CARD;
        summaryCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="justify-content: flex-start; border-bottom: none !important;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none !important; border-bottom: none !important;">
                    <i class="fas fa-cogs"></i> Alert Settings
                </h3>
            </div>
            
            <div class="settings-summary-grid" style="display: flex; justify-content: space-between; gap: 4px; padding-top: 5px;">
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="flex-direction: column; align-items: flex-start; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="font-size:0.65rem;">Increase</span>
                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.POSITIVE}" id="summary-up" style="font-size:0.85rem;">None</span>
                </div>
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="flex-direction: column; align-items: flex-start; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="font-size:0.65rem;">Decrease</span>
                    <span class="${CSS_CLASSES.DETAIL_VALUE} ${CSS_CLASSES.NEGATIVE}" id="summary-down" style="font-size:0.85rem;">None</span>
                </div>
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="flex-direction: column; align-items: flex-start; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="font-size:0.65rem;">Global Limit</span>
                    <span class="${CSS_CLASSES.DETAIL_VALUE}" id="summary-global" style="font-size:0.85rem;">None</span>
                </div>
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="flex-direction: column; align-items: flex-start; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="font-size:0.65rem;">52W Limit</span>
                    <span class="${CSS_CLASSES.DETAIL_VALUE}" id="summary-hilo" style="font-size:0.85rem;">None</span>
                </div>
            </div>
        `;
        container.appendChild(summaryCard);


        // --- 2. TRIGGER CONFIGURATION ---
        const triggerCard = document.createElement('div');
        triggerCard.className = CSS_CLASSES.DETAIL_CARD;
        triggerCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="justify-content: space-between; border-bottom: none;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none;">
                    <i class="fas fa-sliders-h"></i> Trigger Configuration
                </h3>
                <label class="toggle-switch">
                    <input type="checkbox" id="toggle-moversEnabled" data-target="moversEnabled">
                    <span class="slider round"></span>
                </label>
            </div>

            <!-- Column Headers for Percentage/Global logic -->
             <div class="${CSS_CLASSES.DETAIL_ROW}" style="margin-top: 12px; margin-bottom: 2px;">
                 <div style="width: 80px; margin-right: 10px;"></div> <!-- Spacer for Label -->
                 <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Global</div>
                 <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center; padding-left: 10px;">52 Week</div>
             </div>

            <!-- Row 1: Threshold Implementation (Aligned) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px; margin-bottom: 15px;">
                <div class="${CSS_CLASSES.DETAIL_LABEL}" style="width: 80px; color: var(--text-muted); opacity: 0.7;">Threshold</div>
                
                <div style="flex: 1;">
                    <div class="input-wrapper">
                        <div class="input-icon"><i class="fas fa-dollar-sign"></i></div>
                        <input type="number" id="global-minPrice" class="settings-input-dark standard-input compact-input" step="0.01" placeholder="0">
                    </div>
                </div>
                <div style="flex: 1;">
                    <div class="input-wrapper">
                        <div class="input-icon"><i class="fas fa-dollar-sign"></i></div>
                        <input type="number" id="hilo-minPrice" class="settings-input-dark standard-input compact-input" step="0.01" placeholder="0">
                    </div>
                </div>
            </div>

            <!-- Column Headers for Percentage/Global logic -->
             <div class="${CSS_CLASSES.DETAIL_ROW}" style="margin-top: 12px; margin-bottom: 2px;">
                 <div style="width: 80px; margin-right: 10px;"></div> <!-- Spacer for Label -->
                 <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Percentage</div>
                 <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Dollar</div>
             </div>

            <!-- Row 2: Increase (Green) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px; margin-bottom: 10px;">
                <div class="${CSS_CLASSES.DETAIL_LABEL}" style="width: 80px; color: var(--color-positive);">Increase</div>
                <div class="input-wrapper" style="flex: 1;">
                    <div class="input-icon"><i class="fas fa-percent"></i></div>
                    <input type="number" id="up-percentVal" class="settings-input-dark standard-input compact-input" placeholder="0">
                </div>
                <div class="input-wrapper" style="flex: 1;">
                    <div class="input-icon"><i class="fas fa-dollar-sign"></i></div>
                    <input type="number" id="up-dollarVal" class="settings-input-dark standard-input compact-input" step="0.01" placeholder="0">
                </div>
            </div>

            <!-- Row 3: Decrease (Red) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px;">
                <div class="${CSS_CLASSES.DETAIL_LABEL}" style="width: 80px; color: var(--color-negative);">Decrease</div>
                <div class="input-wrapper" style="flex: 1;">
                    <div class="input-icon"><i class="fas fa-percent"></i></div>
                    <input type="number" id="down-percentVal" class="settings-input-dark standard-input compact-input" placeholder="0">
                </div>
                <div class="input-wrapper" style="flex: 1;">
                    <div class="input-icon"><i class="fas fa-dollar-sign"></i></div>
                    <input type="number" id="down-dollarVal" class="settings-input-dark standard-input compact-input" step="0.01" placeholder="0">
                </div>
            </div>
        `;
        container.appendChild(triggerCard);


        // --- 3. ALERTS (User Prefs) ---
        const notifCard = document.createElement('div');
        notifCard.className = CSS_CLASSES.DETAIL_CARD;
        notifCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="border-bottom: none;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none;">
                    <i class="fas fa-bell"></i> Alerts
                </h3>
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center;">
                <span class="${CSS_CLASSES.DETAIL_LABEL}">App Badges</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="toggle-pref-showBadges" data-target="pref-showBadges">
                    <span class="slider round"></span>
                </label>
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center;">
                 <span class="${CSS_CLASSES.DETAIL_LABEL}">Email</span>
                 <label class="toggle-switch">
                    <input type="checkbox" id="toggle-pref-dailyEmail" data-target="pref-dailyEmail">
                    <span class="slider round"></span>
                </label>
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="padding-top: 10px;">
                <div class="input-wrapper" style="width: 100%;">
                    <div class="input-icon"><i class="fas fa-envelope"></i></div>
                    <input type="email" id="pref-emailAddr" class="settings-input-dark standard-input" placeholder="Email Address">
                </div>
            </div>
        `;
        container.appendChild(notifCard);

        // --- 4. SECTOR FILTERS ---
        const sectorCard = document.createElement('div');
        sectorCard.className = CSS_CLASSES.DETAIL_CARD;
        sectorCard.innerHTML = `
             <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="border-bottom: none;">
                 <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none;">
                     <i class="fas fa-layer-group"></i> Sector Filters
                 </h3>
             </div>
             <div style="padding: 0 16px 16px 16px;">
                 
                 <!-- "Exclude Portfolio" Option -->
                 <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                     <div style="display: flex; flex-direction: column;">
                        <span class="${CSS_CLASSES.DETAIL_LABEL}">Portfolio Override</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">Show my stocks even if sector is hidden</span>
                     </div>
                     <label class="toggle-switch">
                        <input type="checkbox" id="toggle-pref-excludePortfolio">
                        <span class="slider round"></span>
                     </label>
                 </div>

                 <div style="margin-bottom: 10px; font-size: 0.75rem; color: var(--text-muted);">
                     Uncheck sectors to hide them from Global Alerts.
                 </div>
                 
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                     ${SECTORS_LIST.map(sector => `
                         <div style="display: flex; align-items: center; justify-content: space-between; padding-right: 2px;">
                             <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.8rem;">${sector}</span>
                             <label class="toggle-switch transform-scale-0-8">
                                 <input type="checkbox" class="sector-toggle" data-sector="${sector}">
                                 <span class="slider round"></span>
                             </label>
                         </div>
                     `).join('')}
                 </div>
             </div>
         `;
        container.appendChild(sectorCard);
    }

    static _updateValues(modal, prefs) {
        const rules = prefs.scannerRules || {};
        const upPct = rules.up?.percentThreshold ?? null;
        const upDol = rules.up?.dollarThreshold ?? null;
        const downPct = rules.down?.percentThreshold ?? null;
        const downDol = rules.down?.dollarThreshold ?? null;
        const minPrice = rules.minPrice ?? null;
        const hiloPrice = rules.hiloMinPrice ?? null;

        const moversEnabled = rules.moversEnabled !== false;
        const showBadges = prefs.showBadges !== false;
        const dailyEmail = prefs.dailyEmail === true;

        // Format helper: None if null/undefined, otherwise text
        const fmtVal = (pct, dol) => {
            const hasPct = (pct !== null && pct !== undefined);
            const hasDol = (dol !== null && dol !== undefined);

            if (!hasPct && !hasDol) return 'None';

            const p = hasPct ? `${pct}%` : '';
            const d = hasDol ? `$${dol}` : '';
            if (p && d) return `${p} & ${d}`;
            return p || d;
        };

        // Update Summary Texts (Safe Update)
        const updateText = (id, text) => {
            const el = modal.querySelector(`#${id}`);
            if (el) el.textContent = text;
        };

        // Debug Log
        // console.warn('[SettingsUI DEBUG] Update Values:', { upPct, upDol, minPrice, hiloPrice });

        updateText('summary-up', fmtVal(upPct, upDol));
        updateText('summary-down', fmtVal(downPct, downDol));
        updateText('summary-global', (minPrice !== null && minPrice !== undefined) ? `$${minPrice}` : 'None');
        updateText('summary-hilo', (hiloPrice !== null && hiloPrice !== undefined) ? `$${hiloPrice}` : 'None');

        // Helper to safely update input values (prevent focus loss)
        const updateInput = (id, val) => {
            const el = modal.querySelector(`#${id}`);
            if (el && el !== document.activeElement) {
                // console.log(`[SettingsUI] Updating Input ${id} -> ${val}`);

                // Treat NaN as empty
                if (Number.isNaN(val)) val = '';

                // FIX: Distinguish 0 from Null.
                if (val === 0) {
                    el.value = '0';
                } else if (val === null || val === undefined || val === '') {
                    el.value = '';
                } else {
                    el.value = val;
                }
            } else {
                // console.log(`[SettingsUI] Skipped Input ${id} (Active/Missing)`);
            }
        };

        // Helper for checkboxes
        const updateCheck = (id, checked) => {
            const el = modal.querySelector(`#${id}`);
            if (el && el !== document.activeElement) {
                el.checked = checked;
            }
        };


        // --- DATA SANITIZATION ---
        // Treat legacy defaults and '0' as NULL (Disabled) for specific alerts to prevent "0%" spam display.
        // User Intent: "None" should be displayed, and Input should be empty.

        const cleanVal = (val, blacklist = []) => {
            if (val === null || val === undefined) return null;
            if (blacklist.includes(val)) return null;
            return val;
        };

        const cleanMinPrice = cleanVal(minPrice, [0.05]); // Hide legacy 0.05 default as 'None'
        const cleanHilo = cleanVal(hiloPrice, []);       // Allow '1' explicitly (User wants to see/edit it)

        // For Up/Down, we MUST allow explicit 0 (User entered 0) while treating blank/null as None.
        // We do NOT blacklist 0 here anymore.
        const cleanUpPct = cleanVal(upPct, []);
        const cleanUpDol = cleanVal(upDol, []);
        const cleanDownPct = cleanVal(downPct, []);
        const cleanDownDol = cleanVal(downDol, []);

        // Update Summaries with Cleaned Values
        updateText('summary-up', fmtVal(cleanUpPct, cleanUpDol));
        updateText('summary-down', fmtVal(cleanDownPct, cleanDownDol));
        updateText('summary-global', (cleanMinPrice !== null && cleanMinPrice !== undefined) ? `$${cleanMinPrice}` : 'None');
        updateText('summary-hilo', (cleanHilo !== null && cleanHilo !== undefined) ? `$${cleanHilo}` : 'None');

        // Inputs (Use Cleaned Values)
        updateInput('global-minPrice', cleanMinPrice);
        updateInput('hilo-minPrice', cleanHilo);
        updateInput('up-percentVal', cleanUpPct);
        updateInput('up-dollarVal', cleanUpDol);
        updateInput('down-percentVal', cleanDownPct);
        updateInput('down-dollarVal', cleanDownDol);
        updateInput('pref-emailAddr', prefs.alertEmailRecipients);

        // Toggles
        updateCheck('toggle-moversEnabled', rules.moversEnabled ?? true);
        updateCheck('toggle-pref-showBadges', showBadges);
        updateCheck('toggle-pref-dailyEmail', dailyEmail);
        updateCheck('toggle-pref-excludePortfolio', prefs.excludePortfolio ?? true); // Default to TRUE (safer)

        // Sectors (Inverse logic: Hidden in Prefs -> Unchecked in UI)
        const hiddenSectors = prefs.hiddenSectors || [];
        SECTORS_LIST.forEach(sector => {
            const cb = modal.querySelector(`.sector-toggle[data-sector="${sector}"]`);
            if (cb) {
                cb.checked = !hiddenSectors.includes(sector);
            }
        });
    }

    /**
    * Renders a Toggle using the Ring Radio style (YES/NO) logic
    */
    static _renderToggle(id, isChecked, labelOn, labelOff) {
        const name = `toggle-${id}`;
        return `
            <div class="ring-radio-group" style="margin-bottom:0;">
                <label class="ring-radio-label">
                    <input type="radio" name="${name}" value="true" class="ring-radio-input" ${isChecked ? 'checked' : ''} data-target="${id}">
                    <div class="radio-ring"></div>
                    ${labelOn}
                </label>
                <label class="ring-radio-label">
                    <input type="radio" name="${name}" value="false" class="ring-radio-input" ${!isChecked ? 'checked' : ''} data-target="${id}">
                    <div class="radio-ring"></div>
                    ${labelOff}
                </label>
                 <!-- Hidden input to store actual boolean for easy harvesting -->
                 <input type="hidden" id="${id}" value="${isChecked}">
            </div>
        `;
    }

    /**
    * Renders a Compact Switch (Checkbox driven)
    */
    static _renderSwitch(id, isChecked) {
        return `
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-${id}" ${isChecked ? 'checked' : ''} data-target="${id}">
                <span class="slider round"></span>
            </label>
        `;
    }

    static _bindEvents(modal, userId, unsubscribe) {
        // Auto-Save Logic
        let debounceTimer;

        const saveSettings = () => {
            // console.log('[SettingsUI] Auto-saving preferences...');
            // Helper to harvest rules
            // FIX: If empty string, return null. If '0', return 0.
            const getNum = (id) => {
                const el = document.getElementById(id);
                if (!el || el.value === '') return null;
                const f = parseFloat(el.value);
                return Number.isNaN(f) ? null : f;
            };

            const harvestRules = (type) => ({
                percentThreshold: getNum(`${type}-percentVal`),
                dollarThreshold: getNum(`${type}-dollarVal`)
            });

            // Handle potential empty strings as null
            const getVal = (id) => getNum(id);

            const toggleMovers = document.getElementById('toggle-moversEnabled');
            const toggleBadges = document.getElementById('toggle-pref-showBadges');
            const toggleEmail = document.getElementById('toggle-pref-dailyEmail');
            const toggleExclude = document.getElementById('toggle-pref-excludePortfolio');
            const emailInput = document.getElementById('pref-emailAddr');

            // Harvest Sectors (Unchecked = Hidden)
            const hiddenSectors = [];
            modal.querySelectorAll('.sector-toggle').forEach(cb => {
                if (!cb.checked) {
                    hiddenSectors.push(cb.dataset.sector);
                }
            });

            const newPrefs = {
                scannerRules: {
                    minPrice: getVal('global-minPrice'),
                    hiloMinPrice: getVal('hilo-minPrice'),
                    moversEnabled: toggleMovers?.checked ?? true,
                    up: harvestRules('up'),
                    down: harvestRules('down')
                },
                hiddenSectors: hiddenSectors,
                excludePortfolio: toggleExclude?.checked ?? true,
                showBadges: toggleBadges?.checked ?? true,
                dailyEmail: toggleEmail?.checked ?? false,
                alertEmailRecipients: emailInput?.value.trim() || ''
            };

            // Save via UserStore
            userStore.savePreferences(userId, newPrefs);
        };

        const close = () => {
            // Force save on close to capture any pending changes or active input
            saveSettings();

            modal.classList.add(CSS_CLASSES.HIDDEN);
            setTimeout(() => modal.remove(), 300);
            if (unsubscribe) unsubscribe();
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).addEventListener('click', close);
        modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`).addEventListener('click', close);

        const triggerDebouncedSave = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(saveSettings, 1000); // 1s debounce for typing
        };

        // EVENT DELEGATION: Attach to Modal, handle bubbling
        modal.addEventListener('input', (e) => {
            if (e.target.matches('input, select, textarea')) {
                // For text/number inputs, debounce
                if (e.target.type === 'checkbox' || e.target.type === 'radio') {
                    saveSettings(); // Immediate
                } else {
                    triggerDebouncedSave(); // Debounce
                }
            }
        });

        modal.addEventListener('change', (e) => {
            if (e.target.matches('input, select, textarea')) {
                // For checkboxes/selects (and text blur), save immediate
                if (e.target.type === 'checkbox' || e.target.type === 'radio') {
                    // Handled by input? Switch usually triggers change. 
                    // Let's ensure we don't double save, but double save is better than no save.
                    saveSettings();
                } else {
                    // On blur/change of text, ensure saved (cancels debounce if needed? or just lets it run)
                    // If user tabs out, 'change' fires.
                    saveSettings();
                    clearTimeout(debounceTimer); // Clear pending debounce to avoid double save
                }
            }
        });

        // Focus/Blur for Placeholder Logic (Clear on Focus)

    }
}
