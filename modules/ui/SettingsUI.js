/**
 * SettingsUI.js
 * Renders the Settings Modal for Scanner Rules and User Preferences.
 * Handles Firestore Sync logic via UserStore.
 */

import { CSS_CLASSES, IDS, UI_ICONS, EVENTS, SECTORS_LIST, SECTOR_INDUSTRY_MAP, STORAGE_KEYS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { userStore } from '../data/DataService.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';

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
                
                <style>
                    /* Global Pill Architecture (Flush Design) */
                    .pill-container {
                        display: flex;
                        background: var(--bg-secondary);
                        border: 1px solid var(--border-color);
                        overflow: hidden;
                        padding: 0;
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                    }
                    
                    .pill-segment, .bulk-btn, .master-pill-segment, .pill-segment-movers, .pill-segment-hilo, .pill-segment-badge, .pill-segment-email, .pill-segment-override, .accordion-control-segment, .pill-segment-personal {
                        flex: 1;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 800;
                        cursor: pointer;
                        transition: all 0.2s;
                        border-radius: 0 !important; /* Force Flush Design */
                        margin: 0;
                        border: none;
                        background: transparent;
                        color: var(--text-muted);
                    }
                    
                    .pill-container.large-pill { height: 32px; border-radius: 4px; }
                    .pill-container.upsized { height: 26px; border-radius: 4px; }
                    
                    .pill-segment.active, 
                    .bulk-btn.active, 
                    .master-pill-segment.active,
                    .pill-segment-movers.active,
                    .pill-segment-hilo.active,
                    .pill-segment-badge.active,
                    .pill-segment-email.active,
                    .pill-segment-override.active,
                    .accordion-control-segment.active,
                    .pill-segment-personal.active {
                        background: var(--color-accent) !important;
                        color: white !important;
                    }

                    .pill-segment-movers:first-child,
                    .pill-segment-hilo:first-child,
                    .pill-segment-badge:first-child,
                    .pill-segment-email:first-child,
                    .pill-segment-override:first-child,
                    .master-pill-segment:first-child,
                    .accordion-control-segment:first-child,
                    .pill-segment-personal:first-child {
                        border-right: 1px solid var(--border-color);
                    }

                    /* Custom Square Radio-style Selectors */
                    .square-radio-wrapper {
                        position: relative;
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                        flex-shrink: 0;
                    }
                    .square-radio-wrapper input {
                        opacity: 0;
                        position: absolute;
                        width: 100%;
                        height: 100%;
                        cursor: pointer;
                        z-index: 2;
                        margin: 0;
                    }
                    .square-radio-visual {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        border: 2px solid var(--border-color);
                        background: transparent;
                        border-radius: 2px;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .square-radio-wrapper input:checked + .square-radio-visual {
                        border-color: var(--color-accent);
                    }
                    .square-radio-visual::after {
                        content: '';
                        width: 10px;
                        height: 10px;
                        background: var(--color-accent);
                        border-radius: 1px;
                        transform: scale(0);
                        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    }
                    .square-radio-wrapper input:checked + .square-radio-visual::after {
                        transform: scale(1);
                    }
                    
                    /* Clickable Industry Row */
                    .clickable-industry-row {
                        cursor: pointer;
                        transition: background 0.1s ease;
                    }
                    .clickable-industry-row:hover {
                        background: rgba(var(--color-accent-rgb, 164, 147, 147), 0.05) !important;
                    }
                </style>
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
        // Change Modal Title to "Notification Settings"
        const modalTitle = modal.querySelector(`.${CSS_CLASSES.MODAL_TITLE}`);
        if (modalTitle) modalTitle.innerHTML = 'Notification Settings';

        const summaryCard = document.createElement('div');
        summaryCard.className = CSS_CLASSES.DETAIL_CARD;
        summaryCard.style.border = '1px solid var(--border-color)'; // Uniform thin border
        summaryCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="justify-content: flex-start; border-bottom: none !important;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none !important; border-bottom: none !important; color: white !important;">
                    <i class="fas fa-cogs" style="color: var(--color-accent);"></i> Alert Settings
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
                    <span class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="font-size:0.65rem;">Volatility Limit</span>
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
        triggerCard.style.border = '1px solid var(--border-color)'; // Uniform thin border
        triggerCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="justify-content: space-between; border-bottom: none;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none; color: white;">
                    <i class="fas fa-sliders-h" style="color: var(--color-accent);"></i> Threshold Settings
                </h3>
            </div>

            <!-- Column Headers for Percentage/Global logic -->
             <div class="${CSS_CLASSES.DETAIL_ROW}" style="margin-top: 12px; margin-bottom: 2px;">
                 <div style="width: 80px; margin-right: 10px;"></div> <!-- Spacer for Label -->
                 <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Volatility</div>
                 <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center; padding-left: 10px;">52 Wk H/L</div>
             </div>

            <!-- Row 1: Threshold Implementation (Aligned) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px; margin-bottom: 15px;">
                <div class="${CSS_CLASSES.DETAIL_LABEL}" style="width: 80px; color: white;">Threshold</div>
                
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
                <div class="${CSS_CLASSES.DETAIL_LABEL}" style="width: 80px; color: white;">Increase</div>
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
                <div class="${CSS_CLASSES.DETAIL_LABEL}" style="width: 80px; color: white;">Decrease</div>
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
        notifCard.style.border = '1px solid var(--border-color)'; // Uniform thin border
        notifCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="border-bottom: none;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none; color: white;">
                    <i class="fas fa-bell" style="color: var(--color-accent);"></i> Alerts
                </h3>
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700;">Volatility</span>
                <div class="pill-container large-pill movers-pill-selector" style="width: 100px;">
                    <span class="pill-segment-movers" data-value="true">On</span>
                    <span class="pill-segment-movers" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-moversEnabled" class="hidden">
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700;">52 Week</span>
                <div class="pill-container large-pill hilo-pill-selector" style="width: 100px;">
                    <span class="pill-segment-hilo" data-value="true">On</span>
                    <span class="pill-segment-hilo" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-hiloEnabled" class="hidden">
            </div>

            <!-- Personal Alerts (New) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700;">Personal</span>
                 <div class="pill-container large-pill personal-pill-selector" style="width: 100px;">
                      <span class="pill-segment-personal" data-value="true">On</span>
                      <span class="pill-segment-personal" data-value="false">Off</span>
                  </div>
                  <input type="checkbox" id="toggle-personalEnabled" class="hidden">
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700;">App Badges</span>
                <div class="pill-container large-pill pill-selector-badges" style="width: 100px;">
                    <span class="pill-segment-badge" data-value="true">On</span>
                    <span class="pill-segment-badge" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-pref-showBadges" class="hidden">
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 15px;">
                 <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700;">Daily Email</span>
                 <div class="pill-container large-pill pill-selector-email" style="width: 100px;">
                    <span class="pill-segment-email" data-value="true">On</span>
                    <span class="pill-segment-email" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-pref-dailyEmail" class="hidden">
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="padding-top: 10px;">
                <div class="input-wrapper" style="width: 100%;">
                    <div class="input-icon"><i class="fas fa-envelope"></i></div>
                    <input type="email" id="pref-emailAddr" class="settings-input-dark standard-input" placeholder="Email Address">
                </div>
            </div>
        `;
        container.appendChild(notifCard);

        // --- 4. SECTOR SELECTOR (Redesigned) ---
        const sectorCard = document.createElement('div');
        sectorCard.className = CSS_CLASSES.DETAIL_CARD;
        sectorCard.style.border = '1px solid var(--border-color)'; // Uniform thin border
        sectorCard.innerHTML = `
             <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="border-bottom: none; justify-content: space-between;">
                 <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none; font-weight: 700; color: white;">
                     <i class="fas fa-layer-group" style="color: var(--color-accent);"></i> Sector Selector
                 </h3>
             </div>
             <div style="padding: 0 16px 16px 16px;">
                 
                  <!-- "Watchlist Override" Option (Pill Redesign - Minimalist) -->
                  <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 24px;">
                      <div style="display: flex; flex-direction: column; gap: 3px;">
                         <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-weight: 700; color: white;">Watchlist Override</span>
                         </div>
                      </div>
                      <div class="pill-container large-pill portfolio-pill-selector" style="width: 125px;">
                          <span class="pill-segment-override" data-value="true">On</span>
                          <span class="pill-segment-override" data-value="false">Off</span>
                      </div>
                      <input type="checkbox" id="toggle-pref-excludePortfolio" class="hidden">
                  </div>


                 <!-- Master Select (Pill Redesign - Large) -->
                 <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 24px;">
                     <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.85rem; font-weight: 800; color: white; letter-spacing: -0.01em;">Select</span>
                     </div>
                     <div class="pill-container large-pill master-pill-selector" style="width: 125px;">
                          <span class="master-pill-segment" data-action="all">All</span>
                          <span class="master-pill-segment" data-action="none">None</span>
                     </div>
                 </div>

                 <!-- NEW: View All Control -->
                 <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 24px;">
                     <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.85rem; font-weight: 800; color: white; letter-spacing: -0.01em;">View All</span>
                     </div>
                     <div class="pill-container large-pill accordion-pill-selector" style="width: 125px;">
                          <span class="accordion-control-segment" data-action="expand">Open</span>
                          <span class="accordion-control-segment active" data-action="collapse">Close</span>
                     </div>
                 </div>
                 
                 <!-- Dynamic Accordion Container -->
                 <div id="settings-sector-accordion" style="display: flex; flex-direction: column; gap: 10px;">
                     <!-- Dynamically Populated by _renderSectorAccordion -->
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
        const hiloEnabled = rules.hiloEnabled !== false;
        const personalEnabled = rules.personalEnabled !== false; // Capture Personal Flag
        const showBadges = prefs.showBadges !== false;

        // FORCE ON: If email address is present, Daily Email is ALWAYS ON.
        const dailyEmail = !!prefs.alertEmailRecipients || (prefs.dailyEmail === true);

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

        // Helper for checkboxes
        const updateCheck = (id, val) => {
            const el = modal.querySelector(`#${id}`);
            if (el) el.checked = val;
        };
        updateCheck('toggle-moversEnabled', moversEnabled);
        updateCheck('toggle-hiloEnabled', hiloEnabled);
        updateCheck('toggle-personalEnabled', personalEnabled); // Sync Checkbox
        updateCheck('toggle-pref-showBadges', showBadges);


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

        // Toggles State (Defined early for Ghosting Logic)
        const moversOn = rules.moversEnabled ?? true;
        const hiloOn = rules.hiloEnabled ?? true;

        // Update Summaries with Cleaned Values & Ghosting

        // Helper for Ghosting & Coloring
        const updateGhosted = (id, txt, isOn, isNeg = false) => {
            const el = modal.querySelector(`#${id}`);
            if (el) {
                el.textContent = txt;
                // Reset to base class
                el.className = CSS_CLASSES.DETAIL_VALUE;

                if (isOn) {
                    // Active: Add Color Class (Positive/Negative) & Full Opacity
                    // Note: 'isNeg' passed as true for Down (Red). False for Up (Green).
                    el.classList.add(isNeg ? CSS_CLASSES.NEGATIVE : CSS_CLASSES.POSITIVE);
                    el.style.opacity = '1';
                    el.style.removeProperty('color');
                } else {
                    // Inactive: Remove Color Classes, Dim, and set to Muted (Ghosted White)
                    el.classList.remove(CSS_CLASSES.POSITIVE, CSS_CLASSES.NEGATIVE);
                    el.style.opacity = '0.5';
                    el.style.color = 'var(--text-muted)';
                }
            }
        };

        updateGhosted('summary-up', fmtVal(cleanUpPct, cleanUpDol), moversOn, false); // False = Positive (Green)
        updateGhosted('summary-down', fmtVal(cleanDownPct, cleanDownDol), moversOn, true); // True = Negative (Red)

        // Volatility Limit (Global) with Ghosting
        const globalEl = modal.querySelector('#summary-global');
        if (globalEl) {
            globalEl.textContent = (cleanMinPrice !== null && cleanMinPrice !== undefined) ? `$${cleanMinPrice}` : 'None';
            if (moversOn) {
                globalEl.style.opacity = '1';
                globalEl.style.removeProperty('color');
            } else {
                globalEl.style.opacity = '0.5';
                globalEl.style.color = 'var(--text-muted)';
            }
        }

        // 52-Week Limit with Ghosting
        // Note: Using multiple text outputs if distinct lines exist (High/Low) or single summary-hilo
        // Based on previous reads, 'summary-hilo' seems legacy or specific. 
        // If 'summary-hilo-high' exists (from previous steps), handle it.
        // Let's try both to be safe (robustness).
        const hiloTxt = (cleanHilo !== null && cleanHilo !== undefined) ? `$${cleanHilo}` : 'None';

        const updateHiloGhost = (id) => {
            const el = modal.querySelector(`#${id}`);
            if (el) {
                el.textContent = hiloTxt;
                if (hiloOn) {
                    el.style.opacity = '1';
                    el.style.removeProperty('color');
                } else {
                    el.style.opacity = '0.5';
                    el.style.color = 'var(--text-muted)';
                }
            }
        };

        updateHiloGhost('summary-hilo');      // Old/Single
        updateHiloGhost('summary-hilo-high'); // New/Split?? Check html if uncertain.
        updateHiloGhost('summary-hilo-low');  // New/Split??

        // Inputs (Use Cleaned Values)
        updateInput('global-minPrice', cleanMinPrice);
        updateInput('hilo-minPrice', cleanHilo);
        updateInput('up-percentVal', cleanUpPct);
        updateInput('up-dollarVal', cleanUpDol);
        updateInput('down-percentVal', cleanDownPct);
        updateInput('down-dollarVal', cleanDownDol);
        updateInput('pref-emailAddr', prefs.alertEmailRecipients);

        // Toggles UI Updates
        modal.querySelectorAll('.pill-segment-movers').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.value === String(moversOn));
        });

        // Selector tweak: Find pills strictly within the hilo container
        const hiloContainer = modal.querySelector('.hilo-pill-selector');
        if (hiloContainer) {
            hiloContainer.querySelectorAll('.pill-segment-hilo').forEach(pill => {
                pill.classList.toggle('active', pill.dataset.value === String(hiloOn));
            });
        }

        modal.querySelectorAll('.pill-segment-badge').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.value === String(showBadges));
        });

        modal.querySelectorAll('.pill-segment-email').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.value === String(dailyEmail));
        });

        const isExclude = prefs.excludePortfolio ?? true;
        updateCheck('toggle-pref-excludePortfolio', isExclude);
        modal.querySelectorAll('.pill-segment-override').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.value === String(isExclude));
        });

        modal.querySelectorAll('.pill-segment-personal').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.value === String(personalEnabled));
        });

        // Sectors (Renamed to Scanner Filters: Hidden in Prefs -> Unchecked in UI)
        // CRITICAL UPDATE: Scanner uses 'activeFilters' (Whitelist).
        // BUT SettingsUI previously used 'hiddenSectors' (Blacklist).
        // MIGRATION: 
        // 1. If 'scanner.activeFilters' exists, use it.
        // 2. If not, and 'hiddenSectors' exists, infer active? (Scary).
        // 3. User requested "Global Settings". 
        // Let's rely on 'scanner.activeFilters' from AppState preference structure, 
        // BUT 'prefs' passed here is likely the UserStore object.
        // We need to ensure we map correctly.

        let activeFilters = [];
        if (prefs.scanner?.activeFilters) {
            activeFilters = prefs.scanner.activeFilters;
        }

        const totalIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat().length;
        const currentSelectedCount = activeFilters.length;

        modal.querySelectorAll('.master-pill-segment').forEach(seg => {
            const action = seg.dataset.action;
            const isMatch = (action === 'all' && currentSelectedCount === totalIndustries) ||
                (action === 'none' && currentSelectedCount === 0);
            seg.classList.toggle('active', isMatch);
        });

        this._renderSectorAccordion(modal, activeFilters);
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

    /**
     * Renders the Sector -> Industry Accordion
     */
    static _renderSectorAccordion(modal, activeFilters) {
        const container = modal.querySelector('#settings-sector-accordion');
        if (!container) return;

        // 1. Capture Existing State (Open/Closed) by Sector Name
        const stateMap = new Map();
        container.querySelectorAll('.filter-accordion-item').forEach(item => {
            const name = item.querySelector('.sector-name').textContent.trim();
            const body = item.querySelector('.filter-body');
            const isHidden = body.classList.contains('hidden');
            stateMap.set(name, !isHidden); // Store 'isOpen'
        });

        // 2. Clear Container
        container.innerHTML = '';

        // 3. Render
        SECTORS_LIST.forEach(sectorName => {
            const industries = SECTOR_INDUSTRY_MAP[sectorName] || [];
            if (industries.length === 0) return;

            const activeCount = industries.filter(ind => activeFilters.includes(ind)).length;
            const hasActiveChild = activeCount > 0;
            const isAllSelected = activeCount === industries.length;

            let summaryText = '';
            if (activeCount === 0) summaryText = '';
            else if (isAllSelected) summaryText = '';
            else summaryText = `${activeCount} of ${industries.length}`;

            // Logic: If we have state, use it. If not, default to CLOSED (User Request).
            const wasOpen = stateMap.get(sectorName);
            const isOpen = (wasOpen !== undefined) ? wasOpen : false;

            const section = document.createElement('div');
            section.className = 'filter-accordion-item';
            section.style.border = '1px solid var(--border-color)';
            section.style.borderRadius = '0';
            section.style.overflow = 'hidden';

            section.innerHTML = `
                <div class="filter-header" style="background: var(--bg-secondary); padding: 12px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s; border-left: 3px solid ${hasActiveChild ? 'var(--color-accent)' : 'transparent'};">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                        <span class="sector-name" style="font-size: 0.95rem; font-weight: 700; color: ${hasActiveChild ? 'var(--color-accent)' : 'white'}; transition: color 0.2s;">${sectorName}</span>
                         <span class="summary-text" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500; background: rgba(0,0,0,0.04); padding: 2px 8px; border-radius: 10px; ${activeCount === 0 || isAllSelected ? 'display: none;' : ''}">${summaryText}</span>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 14px; justify-content: flex-end;">
                        <!-- Sector Pill Selector (Flush - Upsized) -->
                        <div class="pill-container upsized sector-pill-selector" style="width: 104px;">
                            <span class="bulk-btn ${isAllSelected ? 'active' : ''}" data-action="all" title="Select All" style="font-size: 0.65rem;">All</span>
                            <span class="bulk-btn ${activeCount === 0 ? 'active' : ''}" data-action="none" title="Deselect All" style="font-size: 0.65rem;">None</span>
                        </div>
                        
                        <div style="width: 16px; display: flex; justify-content: center;">
                            <i class="fas fa-chevron-down" style="font-size: 0.8rem; opacity: 0.5; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); ${isOpen ? 'transform: rotate(180deg);' : ''}"></i>
                        </div>
                    </div>
                </div>
                <div class="filter-body ${isOpen ? '' : 'hidden'}" style="padding: 10px; background: var(--bg-card); display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; border-top: 1px solid var(--border-color);">
                    ${industries.map(ind => {
                const isChecked = activeFilters.includes(ind);
                return `
                        <div class="filter-row clickable-industry-row" style="padding: 10px 12px; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px solid rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <span class="industry-name" style="font-size: 0.8rem; color: ${isChecked ? 'var(--color-accent)' : 'var(--text-normal)'}; line-height: 1.2; flex: 1; transition: color 0.2s; font-weight: 500;">${ind}</span>
                             <div class="square-radio-wrapper">
                                <input type="checkbox" class="sector-toggle" data-industry="${ind}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
                                <div class="square-radio-visual"></div>
                             </div>
                        </div>
                    `;
            }).join('')}
                </div>
            `;

            container.appendChild(section);
        });
    }

    static _bindEvents(modal, userId, unsubscribe) {
        // Auto-Save Logic
        let debounceTimer;
        let settingsDebounce = null; // High-level debounce for preference saving

        const saveSettings = () => {
            if (!userId) return;

            // INTERNAL DEBOUNCE: Prevent rapid fire from bulk UI events (e.g. Select All)
            if (settingsDebounce) clearTimeout(settingsDebounce);
            settingsDebounce = setTimeout(() => {
                this._executeSave(modal, userId);
            }, 350);
        };

        this._executeSave = (modal, userId) => {
            const getNum = (id) => {
                const el = modal.querySelector(`#${id}`);
                if (!el || el.value === '') return null;
                const f = parseFloat(el.value);
                return Number.isNaN(f) ? null : f;
            };

            const harvestRules = (type) => ({
                percentThreshold: getNum(`${type}-percentVal`),
                dollarThreshold: getNum(`${type}-dollarVal`)
            });

            // Explicit Boolean Harvesting
            const getCheck = (id) => {
                const el = modal.querySelector(`#${id}`);
                return el ? el.checked : null;
            };

            // Harvest Sectors (Whitelist)
            const activeFilters = [];
            modal.querySelectorAll('.sector-toggle').forEach(cb => {
                if (cb.checked) {
                    const ind = cb.dataset.industry;
                    if (ind) activeFilters.push(ind);
                }
            });

            const newPrefs = {
                scanner: {
                    activeFilters: activeFilters
                },
                scannerRules: {
                    minPrice: getNum('global-minPrice'),
                    hiloMinPrice: getNum('hilo-minPrice'),
                    moversEnabled: getCheck('toggle-moversEnabled') ?? true,
                    hiloEnabled: getCheck('toggle-hiloEnabled') ?? true,
                    personalEnabled: getCheck('toggle-personalEnabled') ?? true, // Harvest Personal Flag
                    up: harvestRules('up'),
                    down: harvestRules('down')
                },
                excludePortfolio: getCheck('toggle-pref-excludePortfolio') ?? true,
                showBadges: getCheck('toggle-pref-showBadges') ?? true,
                dailyEmail: getCheck('toggle-pref-dailyEmail') ?? false,
                alertEmailRecipients: modal.querySelector('#pref-emailAddr')?.value.trim() || ''
            };

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

        // --- CONSOLIDATED EVENT DELEGATION ---

        // 1. Unified Control Pill Handler (Movers, Badges, Email, Override, Personal)
        modal.addEventListener('click', (e) => {
            const pill = e.target.closest('[class*="pill-segment-"]');
            if (!pill) return;

            const val = pill.dataset.value === 'true';
            let targetId = '';

            // Check Parent Container to distinguish specific logic
            const container = pill.parentElement;

            // Logic: Identify Target ID based on Pill Class or Container
            if (container.classList.contains('hilo-pill-selector')) targetId = 'toggle-hiloEnabled';
            else if (container.classList.contains('personal-pill-selector')) targetId = 'toggle-personalEnabled'; // Explicit Container Check
            else if (pill.classList.contains('pill-segment-movers')) targetId = 'toggle-moversEnabled';
            else if (pill.classList.contains('pill-segment-badge')) {
                targetId = 'toggle-pref-showBadges';
                // OPTIMISTIC UPDATE: Immediate Badge Reactivity
                const newVal = pill.dataset.value === 'true';
                if (window.AppState && window.AppState.preferences) {
                    window.AppState.preferences.showBadges = newVal;
                    // Dispatch event to force NotificationUI redrawing
                    document.dispatchEvent(new CustomEvent('ASX_NOTIFICATION_UPDATE', {
                        detail: { forceBadgeUpdate: true }
                    }));
                }
            }
            else if (pill.classList.contains('pill-segment-email')) targetId = 'toggle-pref-dailyEmail';
            else if (pill.classList.contains('pill-segment-override')) targetId = 'toggle-pref-excludePortfolio';

            if (targetId) {
                const hiddenCheck = modal.querySelector(`#${targetId}`);
                if (hiddenCheck) {
                    hiddenCheck.checked = val;
                    // Update visuals within the container
                    // Note: 'container' is already defined above
                    container.querySelectorAll('span').forEach(s => s.classList.remove('active'));
                    pill.classList.add('active');
                    saveSettings();
                }
            }
        });

        // 2. Master "Select" Pill handler
        modal.addEventListener('click', (e) => {
            const seg = e.target.closest('.master-pill-segment');
            if (!seg) return;

            const action = seg.dataset.action;
            const container = seg.parentElement;

            // Update visuals
            container.querySelectorAll('.master-pill-segment').forEach(s => s.classList.remove('active'));
            seg.classList.add('active');

            // Apply to all industry toggles
            modal.querySelectorAll('.sector-toggle').forEach(cb => {
                cb.checked = (action === 'all');
                // Trigger change to update local sector headers
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            });

            saveSettings();
        });

        // 3. Sector-Level Bulk Action Handler
        modal.addEventListener('click', (e) => {
            const bulkBtn = e.target.closest('.bulk-btn');
            if (!bulkBtn || bulkBtn.classList.contains('master-pill-segment')) return;

            const action = bulkBtn.dataset.action;
            const item = bulkBtn.closest('.filter-accordion-item');
            if (item) {
                item.querySelectorAll('.sector-toggle').forEach(cb => {
                    cb.checked = (action === 'all');
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                });
                saveSettings();
            }
        });

        // 4. Sector Toggle & Reactive Meta Updates
        // 4. Sector Toggle & Reactive Meta Updates
        modal.addEventListener('change', (e) => {
            if (e.target.matches('.sector-toggle')) {
                const item = e.target.closest('.filter-accordion-item');
                if (item) {
                    const checkboxes = item.querySelectorAll('.sector-toggle');
                    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
                    const totalCount = checkboxes.length;

                    const header = item.querySelector('.filter-header');
                    const summarySpan = header.querySelector('.summary-text');
                    const sectorSpan = header.querySelector('.sector-name');
                    const pillAll = header.querySelector('.bulk-btn[data-action="all"]');
                    const pillNone = header.querySelector('.bulk-btn[data-action="none"]');

                    const hasActive = checkedCount > 0;
                    const isAll = checkedCount === totalCount;

                    // UI State
                    summarySpan.textContent = (isAll || checkedCount === 0) ? '' : `${checkedCount} of ${totalCount}`;
                    summarySpan.style.display = (isAll || checkedCount === 0) ? 'none' : 'inline-block';
                    sectorSpan.style.color = hasActive ? 'var(--color-accent)' : 'white';
                    header.style.borderLeft = `3px solid ${hasActive ? 'var(--color-accent)' : 'transparent'}`;

                    // Industry Name Color
                    const row = e.target.closest('.filter-row');
                    if (row) {
                        row.querySelector('.industry-name').style.color =
                            e.target.checked ? 'var(--color-accent)' : 'var(--text-normal)';
                    }

                    // Pill Visuals
                    if (pillAll) pillAll.classList.toggle('active', isAll);
                    if (pillNone) pillNone.classList.toggle('active', checkedCount === 0);
                }

                // Global Master Select Sync
                const allCBs = modal.querySelectorAll('.sector-toggle');
                const totalSelected = Array.from(allCBs).filter(cb => cb.checked).length;
                const totalAvailable = allCBs.length;

                modal.querySelectorAll('.master-pill-segment').forEach(seg => {
                    const action = seg.dataset.action;
                    const isMatch = (action === 'all' && totalSelected === totalAvailable) ||
                        (action === 'none' && totalSelected === 0);
                    seg.classList.toggle('active', isMatch);
                });

                saveSettings();
            }
        });

        // 5. View All Control (Expand/Collapse All)
        modal.addEventListener('click', (e) => {
            const seg = e.target.closest(`.${CSS_CLASSES.ACCORDION_CONTROL_SEGMENT}`);
            if (!seg) return;

            const action = seg.dataset.action;
            const container = seg.parentElement;

            // Visual Feedback (Persistent Active State)
            container.querySelectorAll(`.${CSS_CLASSES.ACCORDION_CONTROL_SEGMENT}`).forEach(s => s.classList.remove(CSS_CLASSES.ACTIVE));
            seg.classList.add(CSS_CLASSES.ACTIVE);

            // Execute Logic
            const isExpand = (action === 'expand');
            modal.querySelectorAll(`.${CSS_CLASSES.FILTER_ACCORDION_ITEM}`).forEach(item => {
                const body = item.querySelector(`.${CSS_CLASSES.FILTER_BODY}`);
                const icon = item.querySelector(`.${CSS_CLASSES.FILTER_HEADER} i`);

                if (isExpand) {
                    body.classList.remove(CSS_CLASSES.HIDDEN);
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    body.classList.add(CSS_CLASSES.HIDDEN);
                    icon.style.transform = 'rotate(0deg)';
                }
            });
        });

        // 6. Accordion & Row Logic (Toggle Single)
        modal.addEventListener('click', (e) => {
            const header = e.target.closest(`.${CSS_CLASSES.FILTER_HEADER}`);
            if (header && !e.target.closest('.pill-container')) {
                const item = header.closest(`.${CSS_CLASSES.FILTER_ACCORDION_ITEM}`);
                const body = item.querySelector(`.${CSS_CLASSES.FILTER_BODY}`);
                const icon = header.querySelector('i');
                const isHidden = body.classList.contains(CSS_CLASSES.HIDDEN);

                body.classList.toggle(CSS_CLASSES.HIDDEN);
                icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
                return;
            }

            const row = e.target.closest(`.${CSS_CLASSES.CLICKABLE_INDUSTRY_ROW}`);
            if (row && !e.target.matches('input')) {
                const cb = row.querySelector(`.${CSS_CLASSES.SECTOR_TOGGLE}`);
                if (cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        const triggerDebouncedSave = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(saveSettings, 1000);
        };

        modal.addEventListener('input', (e) => {
            if (e.target.matches('input, select, textarea')) {
                // AUTO-FLIP: If user types an email, auto-enable the daily email toggle.
                if (e.target.id === IDS.PREF_EMAIL_ADDR && e.target.value.trim().length > 0) {
                    const dailyCheck = modal.querySelector(`#${IDS.TOGGLE_DAILY_EMAIL}`);
                    if (dailyCheck && !dailyCheck.checked) {
                        dailyCheck.checked = true;
                        // Update Pill UI
                        const container = modal.querySelector(`.${CSS_CLASSES.PILL_SELECTOR_EMAIL}`);
                        if (container) {
                            container.querySelectorAll('span').forEach(s => s.classList.toggle(CSS_CLASSES.ACTIVE, s.dataset.value === 'true'));
                        }
                    }
                }

                if (e.target.type === 'checkbox' || e.target.type === 'radio') {
                    saveSettings();
                } else {
                    triggerDebouncedSave();
                }
            }
        });

        modal.addEventListener('change', (e) => {
            if (e.target.matches('input, select, textarea')) {
                if (e.target.type !== 'checkbox' && e.target.type !== 'radio') {
                    saveSettings();
                    clearTimeout(debounceTimer);
                }
            }
        });

    }
}
