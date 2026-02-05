/**
 * SettingsUI.js
 * Renders the Settings Modal for Scanner Rules and User Preferences.
 * Handles Firestore Sync logic via UserStore.
 */

import { CSS_CLASSES, IDS, UI_ICONS, EVENTS, SECTORS_LIST, SECTOR_INDUSTRY_MAP, STORAGE_KEYS, KANGAROO_ICON_SVG } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { userStore } from '../data/DataService.js';
import { AppState } from '../state/AppState.js';
import { ToastManager } from './ToastManager.js';
import { notificationStore } from '../state/NotificationStore.js';

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

        // Register with NavigationManager
        modal._navActive = true;
        navManager.pushState(() => {
            if (document.contains(modal)) {
                modal._navActive = false;
                // Trigger dismissal via the close button to ensure all cleanup (unsubscribes, etc) runs.
                modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.click();
            }
        });

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
            <div class="${CSS_CLASSES.MODAL_CONTENT} settings-modal-body" style="display: flex; flex-direction: column; max-height: 90vh;">
                <!-- Header: Standard Mobile Modal Type -->
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; border: none !important; flex-shrink: 0;">
                    <span class="${CSS_CLASSES.MODAL_TITLE}" style="font-size: 1.45rem; font-weight: 700;">Notification Settings</span>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" style="background: none; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer; padding: 4px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Scrollable Content: Explicit Overflow -->
                <div class="scrollable-body" style="flex: 1; min-height: 0; padding-bottom: 20px; overflow-y: auto; overflow-x: hidden;"></div>
                
                <style>
                    /* Global Pill Architecture (Flush Design) */
                    .pill-container {
                        display: flex;
                        background: transparent !important;
                        border: none !important;
                        overflow: hidden;
                        padding: 0;
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                    }
                    
                    .pill-segment, .bulk-btn, .master-pill-segment, .pill-segment-movers, .pill-segment-hilo, .pill-segment-badge, .pill-segment-email, .pill-segment-override, .accordion-control-segment, .pill-segment-personal, .pill-segment-badge-scope, .pill-segment-accordion {
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
                    .pill-segment-personal.active,
                    .pill-segment-badge-scope.active,
                    .pill-segment-accordion.active {
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
                    .pill-segment-personal:first-child,
                    .pill-segment-badge-scope:first-child,
                    .pill-segment-accordion:first-child {
                        border-right: none !important;
                    }

                    .master-pill-segment, .accordion-control-segment {
                        font-size: 0.75rem;
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
                    
                    .summary-status-indicator.kangaroo.large {
                        width: 24px;
                        height: 24px;
                        opacity: 0.2;
                        margin-top: auto;
                        margin-bottom: 2px;
                        position: relative;
                        transition: all 0.2s ease;
                    }
                    .summary-status-indicator.kangaroo.large.status-on {
                        opacity: 1;
                    }
                    .summary-status-indicator.kangaroo.large.always-on {
                        opacity: 1;
                        filter: drop-shadow(0 0 2px var(--color-accent));
                    }
                    /* Red Muted + Line Through - Upgrade */
                    .summary-status-indicator.kangaroo.status-off {
                        opacity: 0.5;
                        /* Removed grayscale for visibility */
                    }
                    .summary-status-indicator.kangaroo.status-off::after {
                        content: '';
                        position: absolute;
                        top: 50%;
                        left: -10%;
                        width: 120%;
                        height: 2px;
                        background: var(--color-accent);
                        transform: rotate(-45deg);
                        opacity: 0.8;
                    }

                    .summary-tile.thin {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 4px;
                        min-height: 60px;
                    }

                    .summary-tile-header {
                        width: 100%;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 2px;
                    }

                    /* Clickable Industry Row */
                    .clickable-industry-row {
                        cursor: pointer;
                        transition: background 0.1s ease;
                    }
                    .clickable-industry-row:hover {
                        background: rgba(var(--color-accent-rgb, 164, 147, 147), 0.05) !important;
                    }

                    /* Interactive Summary Tiles */
                    .summary-tile-clickable {
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        position: relative;
                        overflow: hidden;
                    }
                    .summary-tile-clickable:hover {
                        background: var(--bg-hover) !important;
                        border-color: var(--color-accent) !important;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    }
                    .summary-tile-clickable:active {
                        transform: translateY(0);
                        filter: brightness(1.2);
                    }

                    /* Flash Highlight for Jump-to-Section */
                    @keyframes flash-highlight {
                        0% { background-color: transparent; }
                        20% { background-color: rgba(var(--color-accent-rgb, 164, 147, 147), 0.2); }
                        100% { background-color: transparent; }
                    }
                    .section-flash {
                        animation: flash-highlight 1.5s ease-out;
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
        const container = modal.querySelector('.scrollable-body');

        // 1. Build Structure Once (Tracked via Flag)
        if (!modal.dataset.rendered) {
            this._buildStructure(container, modal);
            modal.dataset.rendered = 'true';
        }

        // 2. Update Values
        this._updateValuesOnly(modal, prefs);

        // 3. Update Summary Board (Non-invasive)
        this._updateSummaryBoard(modal);
    }

    static _buildStructure(container, modal) {
        // Change Modal Title to "Notification Settings"
        const modalTitle = modal.querySelector(`.${CSS_CLASSES.MODAL_TITLE}`);
        if (modalTitle) {
            modalTitle.innerHTML = 'Notification Settings';

            // Add explainer underneath
            const titleGroup = document.createElement('div');
            titleGroup.style.display = 'flex';
            titleGroup.style.flexDirection = 'column';
            titleGroup.style.gap = '4px';

            modalTitle.parentElement.insertBefore(titleGroup, modalTitle);
            titleGroup.appendChild(modalTitle);

            const explainer = document.createElement('div');
            explainer.style.cssText = 'font-size: 0.73rem; color: var(--text-muted); opacity: 0.8; font-style: italic; margin-top: 4px;';
            explainer.textContent = 'Set thresholds and sectors for the entire ASX';
            titleGroup.appendChild(explainer);
        }


        const summaryCard = document.createElement('div');
        summaryCard.className = CSS_CLASSES.DETAIL_CARD;
        // Border removed for floating effect via style.css
        summaryCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="justify-content: flex-start; border-bottom: none !important;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none !important; border-bottom: none !important; color: white !important; display: flex; align-items: center; font-size: 1.1rem !important;">
                    <i class="fas fa-filter" style="color: var(--color-accent); margin-right: 8px; font-size: 0.9em;"></i> Filter Summary
                </h3>
            </div>
            
            <div class="${CSS_CLASSES.SUMMARY_BOARD}">
                <!-- Monitoring Row: Compact Dots -->
                <div class="summary-section">
                    <div class="summary-section-title" style="color: white !important; font-size: 0.82rem;"><i class="fas fa-satellite-dish" style="color: var(--color-accent);"></i> Alert Monitors</div>
                    <div class="summary-grid-compact">
                        <!-- 1. Scope (Custom / All) -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} thin summary-tile-clickable" data-toggle-target="badge-scope">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}">
                                <span id="val-scope" class="${CSS_CLASSES.SUMMARY_TILE_LABEL}" style="font-size: 0.65rem; color: var(--color-accent); font-weight: 800;">Badge Custom</span>
                            </div>
                            <div class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo large always-on"></div>
                        </div>
                        <!-- 2. Alert Icon -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} thin summary-tile-clickable" data-toggle-target="toggle-pref-showBadges">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Alert Icon</span>
                            </div>
                            <div id="ind-icon" class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo large"></div>
                        </div>
                        <!-- 3. 52w -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} thin summary-tile-clickable" data-toggle-target="toggle-hiloEnabled">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">52w</span>
                            </div>
                            <div id="ind-hilo" class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo large"></div>
                        </div>
                        <!-- 4. Movers -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} thin summary-tile-clickable" data-toggle-target="toggle-moversEnabled">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Market Movers</span>
                            </div>
                            <div id="ind-movers" class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo large"></div>
                        </div>
                        <!-- 5. Personal -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} thin summary-tile-clickable" data-toggle-target="toggle-personalEnabled">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Personal</span>
                            </div>
                            <div id="ind-personal" class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo large"></div>
                        </div>
                        <!-- 6. Email -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} thin summary-tile-clickable" data-toggle-target="toggle-pref-dailyEmail">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Email</span>
                            </div>
                            <div id="ind-email" class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo large"></div>
                        </div>
                    </div>
                </div>

                <!-- Unified Parameter Filters Row -->
                <div class="summary-section">
                    <div class="summary-section-title" style="color: white !important; font-size: 0.82rem;"><i class="fas fa-sliders-h" style="color: var(--color-accent);"></i> Parameter Filters</div>
                    <div class="summary-grid-paired">
                        <!-- Movers & 52w Limit -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} summary-tile-clickable" data-scroll-target="section-thresholds" style="align-items: center;">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Market Movers Limit $</span></div>
                            <div class="${CSS_CLASSES.SUMMARY_TILE_BODY}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_VALUE}" id="sum-val-vol">None</span></div>
                        </div>
                        <div class="${CSS_CLASSES.SUMMARY_TILE} summary-tile-clickable" data-scroll-target="section-thresholds" style="align-items: center;">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">52w Limit $</span></div>
                            <div class="${CSS_CLASSES.SUMMARY_TILE_BODY}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_VALUE}" id="sum-val-hilo">None</span></div>
                        </div>
                    </div>
                    <div class="summary-grid-paired" style="margin-top: 8px;">
                        <!-- Up & Down Alert Thresholds -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} summary-tile-clickable" data-scroll-target="section-movers" style="align-items: center;">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Increase</span></div>
                            <div class="${CSS_CLASSES.SUMMARY_TILE_BODY}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_VALUE}" id="sum-val-up">None</span></div>
                        </div>
                        <div class="${CSS_CLASSES.SUMMARY_TILE} summary-tile-clickable" data-scroll-target="section-movers" style="align-items: center;">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Decrease</span></div>
                            <div class="${CSS_CLASSES.SUMMARY_TILE_BODY}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_VALUE}" id="sum-val-down">None</span></div>
                        </div>
                    </div>
                    <div class="summary-grid-paired" style="margin-top: 8px; grid-template-columns: 1fr 1fr;">
                        <!-- Watchlist Override (New) - Toggleable directly -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} summary-tile-clickable" data-toggle-target="${IDS.PREF_EXCLUDE_PORTFOLIO}" style="align-items: center;">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Target Alerts Override</span></div>
                            <div class="${CSS_CLASSES.SUMMARY_TILE_BODY}" style="justify-content: center; position: relative;">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_VALUE}" id="sum-val-override">...</span>
                                <div id="ind-override" class="${CSS_CLASSES.SUMMARY_STATUS_INDICATOR} kangaroo" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px;"></div>
                            </div>
                        </div>

                        <!-- Sectors (Modified) -->
                        <div class="${CSS_CLASSES.SUMMARY_TILE} summary-tile-clickable" data-scroll-target="section-sectors" style="align-items: center;">
                            <div class="${CSS_CLASSES.SUMMARY_TILE_HEADER}" style="justify-content: center;"><span class="${CSS_CLASSES.SUMMARY_TILE_LABEL}">Industry Sectors</span></div>
                            <div class="${CSS_CLASSES.SUMMARY_TILE_BODY}" style="justify-content: center; flex-direction: column;">
                                <span class="${CSS_CLASSES.SUMMARY_TILE_VALUE}" id="summary-sectors-text" style="font-size: 0.8rem;">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(summaryCard);


        // --- 2. ALERTS (User Prefs) ---
        const notifCard = document.createElement('div');
        notifCard.className = CSS_CLASSES.DETAIL_CARD;
        // Border removed for floating effect via style.css
        notifCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="border-bottom: none;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none; border-bottom: none; color: white; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <span id="btn-open-notifications-icon" class="kangaroo-icon-inline" style="color: var(--color-accent); cursor: pointer; width: 22px; height: 22px;">${KANGAROO_ICON_SVG}</span> Alerts
                </h3>
            </div>

            <!-- 1. Custom Movers (Personal Alerts) -->
            <!-- 1. Badge Count Scope (Moved to Top) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; flex-direction: column; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700; font-size: 0.82rem;">Badge Count</span>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Main icon displays your selection</div>
                </div>
                <div class="pill-container large-pill badge-scope-selector" style="width: 100px;">
                    <span class="pill-segment-badge-scope" data-value="custom" style="font-size: 0.65rem;">Custom</span>
                    <span class="pill-segment-badge-scope" data-value="all" style="font-size: 0.65rem;">All</span>
                </div>
                <input type="hidden" id="${IDS.PREF_BADGE_SCOPE}" value="custom">
            </div>

            <!-- 2. Home Screen Alert Icon (Icon Visibility) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; flex-direction: column; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700; font-size: 0.82rem;">Home Screen Alert Icon</span>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Controls display of home screen notifications icon</div>
                </div>
                <div class="pill-container large-pill pill-selector-badges" style="width: 100px;">
                    <span class="pill-segment-badge" data-value="true">On</span>
                    <span class="pill-segment-badge" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-pref-showBadges" class="hidden">
            </div>

            <!-- 3. 52 week Movers -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; flex-direction: column; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700; font-size: 0.82rem;">52 week Movers</span>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Market filters 52w high low</div>
                </div>
                <div class="pill-container large-pill hilo-pill-selector" style="width: 100px;">
                    <span class="pill-segment-hilo" data-value="true">On</span>
                    <span class="pill-segment-hilo" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-hiloEnabled" class="hidden">
            </div>

            <!-- 4. Market Movers (Volatility) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; flex-direction: column; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700; font-size: 0.82rem;">Market Movers</span>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Market filters gainers and losers</div>
                </div>
                <div class="pill-container large-pill movers-pill-selector" style="width: 100px;">
                    <span class="pill-segment-movers" data-value="true">On</span>
                    <span class="pill-segment-movers" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-moversEnabled" class="hidden">
            </div>

            <!-- 5. Personal Alerts (Targets) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; flex-direction: column; gap: 0;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700; font-size: 0.82rem;">Personal Alerts</span>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Watchlist and individual targets</div>
                </div>
                <div class="pill-container large-pill personal-pill-selector" style="width: 100px;">
                    <span class="pill-segment-personal" data-value="true">On</span>
                    <span class="pill-segment-personal" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-personalEnabled" class="hidden">
            </div>

            <!-- 6. Daily Email -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-bottom: 15px;">
                 <span class="${CSS_CLASSES.DETAIL_LABEL}" style="color: white; font-weight: 700; font-size: 0.82rem;">Daily Email</span>
                 <div class="pill-container large-pill pill-selector-email" style="width: 100px;">
                    <span class="pill-segment-email" data-value="true">On</span>
                    <span class="pill-segment-email" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="toggle-pref-dailyEmail" class="hidden">
            </div>

            <div class="${CSS_CLASSES.DETAIL_ROW}" style="padding-top: 10px;">
                <div class="input-wrapper" style="width: 100%;">
                    <div class="input-icon"><i class="fas fa-envelope" style="color: var(--color-accent);"></i></div>
                    <input type="email" id="pref-emailAddr" class="settings-input-dark standard-input" placeholder="Email Address">
                </div>
            </div>
        `;
        container.appendChild(notifCard);


        // MOVED TO TOP


        // --- 3. COMBINED THRESHOLD & SECTOR SELECTOR ---
        const combinedCard = document.createElement('div');
        combinedCard.className = CSS_CLASSES.DETAIL_CARD;
        // Border removed for floating effect via style.css
        combinedCard.innerHTML = `
            <div class="${CSS_CLASSES.DETAIL_CARD_HEADER}" style="flex-direction: column; align-items: flex-start; gap: 0; border-bottom: none; padding-bottom: 0;">
                <h3 class="${CSS_CLASSES.DETAIL_LABEL}" style="text-decoration: none !important; border-bottom: none !important; color: white !important; display: flex !important; align-items: center !important; gap: 8px !important; margin-bottom: 0 !important; text-transform: none !important; line-height: 1.0 !important; font-size: 1.1rem !important;">
                    <i class="fas fa-sliders-h" style="color: var(--color-accent); width: 18px; text-align: center;"></i> Market Parameters
                </h3>
                <div style="font-size: 0.7rem; color: var(--text-muted); opacity: 0.7; font-style: italic; margin-left: 0; padding-left: 0; margin-top: -6px;">
                    Control notifications volume via $, %, or sector
                </div>
            </div>

            <!-- "Watchlist Override" Option (Direct child, like Alerts rows) -->
            <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: center; margin-top: 20px; margin-bottom: 0;">
                <div style="display: flex; flex-direction: column; gap: 0;">
                   <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.82rem; font-weight: 700; color: white; line-height: 1.1;">Target Alerts Override</span>
                   <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Ignore active filters sector and threshold</div>
                </div>
                <div class="pill-container large-pill portfolio-pill-selector" style="width: 100px;">
                    <span class="pill-segment-override" data-value="true">On</span>
                    <span class="pill-segment-override" data-value="false">Off</span>
                </div>
                <input type="checkbox" id="${IDS.PREF_EXCLUDE_PORTFOLIO}" class="hidden">
            </div>

            <div style="padding: 0 16px 16px 16px;">
                <!-- Thresholds Section -->
                <!-- Thresholds Section -->
                <!-- Thresholds Section -->
                <div id="section-thresholds" style="margin-bottom: 20px; margin-top: 24px; margin-left: -16px; display: flex; flex-direction: column; gap: 0;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-ruler-combined" style="color: var(--color-accent); font-size: 0.9em;"></i>
                        <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.82rem; font-weight: 700; color: white; line-height: 1.1;">Thresholds</span>
                    </div>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Ignore stocks below</div>
                </div>

                <!-- Range Headers (Volatility | 52 Wk H/L) -->
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="margin-top: 0; margin-bottom: 2px;">
                    <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Market Movers</div>
                    <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center; padding-left: 10px;">52 Wk H/L</div>
                </div>

                <!-- Range Inputs -->
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px; margin-bottom: 32px;">
                    <div style="flex: 1;">
                        <div class="input-wrapper" style="position: relative; height: 32px;">
                            <div class="input-icon" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-start; padding-left: 4px; pointer-events: none; color: var(--text-muted);"><i class="fas fa-dollar-sign"></i></div>
                            <input type="number" id="${IDS.PREF_GLOBAL_MIN_PRICE}" class="settings-input-dark standard-input compact-input ${CSS_CLASSES.SETTINGS_INPUT_ALIGNED}" step="0.01" placeholder="0" style="height: 100%; z-index: 10; pointer-events: auto;">
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div class="input-wrapper" style="position: relative; height: 32px;">
                            <div class="input-icon" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-start; padding-left: 4px; pointer-events: none; color: var(--text-muted);"><i class="fas fa-dollar-sign"></i></div>
                            <input type="number" id="${IDS.PREF_HILO_MIN_PRICE}" class="settings-input-dark standard-input compact-input ${CSS_CLASSES.SETTINGS_INPUT_ALIGNED}" step="0.01" placeholder="0" style="height: 100%; z-index: 10; pointer-events: auto;">
                        </div>
                    </div>
                </div>

                <!-- Movers Section -->
                <div id="section-movers" style="margin-bottom: 20px; margin-top: 24px; margin-left: -16px; display: flex; flex-direction: column; gap: 0;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-chart-line" style="color: var(--color-accent); font-size: 0.9em;"></i>
                        <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.82rem; font-weight: 700; color: white; line-height: 1.1;">Market Movers</span>
                    </div>
                    <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 2px; margin-top: -1px;">Triggers when either set limit is met or exceeded</div>
                </div>

                <!-- Movers Headers (Increase | Decrease) -->
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="margin-top: 0; margin-bottom: 2px;">
                    <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Increase</div>
                </div>

                <!-- Increase Row (% and $) -->
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px; margin-bottom: 16px;">
                    <div style="flex: 1;">
                        <div class="input-wrapper" style="position: relative; height: 32px;">
                             <div class="input-icon" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-start; font-weight: bold; font-size: 0.85rem; color: var(--text-muted); padding-left: 4px; pointer-events: none;">%</div>
                             <input type="number" id="${IDS.PREF_UP_PERCENT}" class="settings-input-dark standard-input compact-input ${CSS_CLASSES.SETTINGS_INPUT_ALIGNED}" placeholder="0" style="height: 100%; z-index: 10; pointer-events: auto;">
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div class="input-wrapper" style="position: relative; height: 32px;">
                             <div class="input-icon" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-start; font-weight: bold; font-size: 0.85rem; color: var(--text-muted); padding-left: 4px; pointer-events: none;">$</div>
                             <input type="number" id="${IDS.PREF_UP_DOLLAR}" class="settings-input-dark standard-input compact-input ${CSS_CLASSES.SETTINGS_INPUT_ALIGNED}" step="0.01" placeholder="0" style="height: 100%; z-index: 10; pointer-events: auto;">
                        </div>
                    </div>
                </div>

                <!-- Decrease Header -->
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="margin-top: 0; margin-bottom: 2px;">
                    <div class="${CSS_CLASSES.DETAIL_LABEL} ${CSS_CLASSES.TEXT_XXS}" style="flex: 1; text-align: center;">Decrease</div>
                </div>

                <!-- Decrease Row (% and $) -->
                <div class="${CSS_CLASSES.DETAIL_ROW}" style="align-items: center; gap: 10px; margin-bottom: 24px;">
                    <div style="flex: 1;">
                        <div class="input-wrapper" style="position: relative; height: 32px;">
                             <div class="input-icon" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-start; font-weight: bold; font-size: 0.85rem; color: var(--text-muted); padding-left: 4px; pointer-events: none;">%</div>
                             <input type="number" id="${IDS.PREF_DOWN_PERCENT}" class="settings-input-dark standard-input compact-input ${CSS_CLASSES.SETTINGS_INPUT_ALIGNED}" placeholder="0" style="height: 100%; z-index: 10; pointer-events: auto;">
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div class="input-wrapper" style="position: relative; height: 32px;">
                             <div class="input-icon" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-start; font-weight: bold; font-size: 0.85rem; color: var(--text-muted); padding-left: 4px; pointer-events: none;">$</div>
                             <input type="number" id="${IDS.PREF_DOWN_DOLLAR}" class="settings-input-dark standard-input compact-input ${CSS_CLASSES.SETTINGS_INPUT_ALIGNED}" step="0.01" placeholder="0" style="height: 100%; z-index: 10; pointer-events: auto;">
                        </div>
                    </div>
                </div>

                <!-- Subtle Separator for Sector Selector -->
                <div id="section-sectors" style="border-top: none; padding-top: 0; margin-top: 65px; margin-bottom: 35px; margin-left: -16px; display: flex; align-items: center; gap: 4px;">
                     <i class="fas fa-layer-group" style="color: var(--color-accent); font-size: 0.9em;"></i>
                     <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.82rem; font-weight: 700; color: white; letter-spacing: 0; line-height: 1.1;">Sector Filtering</span>
                </div>

                 <!-- Master Select & View All Row -->
                 <div class="${CSS_CLASSES.DETAIL_ROW}" style="justify-content: space-between; align-items: flex-start; margin-bottom: 45px; margin-top: 25px;">
                     
                     <!-- Bulk Select Control -->
                     <div style="display: flex; flex-direction: column; gap: 0; flex: 1; align-items: flex-start;">
                        <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.75rem; font-weight: 700; color: white; letter-spacing: 0; line-height: 1.1;">Bulk Select</span>
                        <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 4px; margin-top: -1px;">All checked or unchecked</div>
                        <div class="pill-container large-pill master-pill-selector" style="width: 90px;">
                              <span class="master-pill-segment" data-action="all">All</span>
                              <span class="master-pill-segment" data-action="none">None</span>
                        </div>
                     </div>

                     <!-- Spacer -->
                     <div style="width: 15px;"></div>

                     <!-- View All Control -->
                     <div style="display: flex; flex-direction: column; gap: 0; flex: 1; align-items: flex-end;">
                        <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.75rem; font-weight: 700; color: white; letter-spacing: 0; line-height: 1.1;">View Sections</span>
                        <div style="font-size: 0.65rem; opacity: 0.5; color: var(--text-muted); margin-bottom: 4px; margin-top: -1px;">Open or close all</div>
                        <div class="pill-container large-pill accordion-pill-selector" style="width: 90px;">
                              <span class="${CSS_CLASSES.ACCORDION_CONTROL_SEGMENT} pill-segment-accordion" data-action="expand">Open</span>
                              <span class="${CSS_CLASSES.ACCORDION_CONTROL_SEGMENT} pill-segment-accordion ${CSS_CLASSES.ACTIVE}" data-action="collapse">Close</span>
                        </div>
                     </div>
                 </div>

                 <!-- Sectors Label (Tightened) -->
                 <div style="margin-bottom: 8px; margin-top: 8px;">
                    <span class="${CSS_CLASSES.DETAIL_LABEL}" style="font-size: 0.75rem; font-weight: 700; color: white;">Sectors</span>
                 </div>
                 
                 <!-- Dynamic Accordion Container -->
                 <div id="settings-sector-accordion" style="display: flex; flex-direction: column; gap: 10px;">
                     <!-- Dynamically Populated by _renderSectorAccordion -->
                 </div>
            </div>
        `;
        container.appendChild(combinedCard);

        // --- Event Listeners ---
        // 1. Notification Icon Click
        const notifIcon = notifCard.querySelector('#btn-open-notifications-icon');
        if (notifIcon) {
            notifIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Direct Open (Relies on Z-Index to surface)
                document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS));
            });
        }

    }

    static _updateValuesOnly(modal, prefs) {
        // Initialize Form from Prefs
        const rules = prefs.scannerRules || {};
        const updateCheck = (id, val) => {
            // Flexible Input Resolution (Inline)
            let el = modal.querySelector(`#${id}`);
            if (!el && !id.startsWith('toggle-')) el = modal.querySelector(`#toggle-${id}`);
            if (!el && id.startsWith('toggle-')) el = modal.querySelector(`#${id.replace('toggle-', '')}`);

            if (el) {
                if (el.type === 'checkbox' || el.type === 'radio') el.checked = val;
                else el.value = (val === null || val === undefined) ? '' : String(val);
            }
        };

        updateCheck('toggle-moversEnabled', rules.moversEnabled !== false);
        updateCheck('toggle-hiloEnabled', rules.hiloEnabled !== false);
        updateCheck('toggle-personalEnabled', rules.personalEnabled !== false);
        updateCheck('toggle-pref-showBadges', prefs.showBadges !== false);
        updateCheck('toggle-pref-dailyEmail', prefs.dailyEmail === true);
        // Robustly check constants
        updateCheck(IDS.PREF_EXCLUDE_PORTFOLIO, prefs.excludePortfolio ?? true);
        updateCheck(IDS.PREF_BADGE_SCOPE, prefs.badgeScope || 'custom');

        // Thresholds & Min Prices
        updateCheck('global-minPrice', rules.minPrice);
        updateCheck('hilo-minPrice', rules.hiloMinPrice);
        updateCheck('up-percentVal', rules.up?.percentThreshold);
        updateCheck('up-dollarVal', rules.up?.dollarThreshold);
        updateCheck('down-percentVal', rules.down?.percentThreshold);
        updateCheck('down-dollarVal', rules.down?.dollarThreshold);

        // Email
        updateCheck('pref-emailAddr', prefs.alertEmailRecipients || '');



        // Initial Sector Population
        const rawFilters = prefs.scanner?.activeFilters;
        const allIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat().map(f => f.toUpperCase());
        const activeFilters = (rawFilters === null || rawFilters === undefined) ? allIndustries : (rawFilters || []).map(f => f.toUpperCase());
        this._renderSectorAccordion(modal, activeFilters);

        // Initial Summary Update
        this._updateSummaryBoard(modal);
    }

    /**
     * Harvests the CURRENT DOM state of all settings inputs.
     * Used for real-time summary updates and before saving.
     */
    static _harvestState(modal, skipSectors = false) {
        const getNum = (id) => {
            const el = modal.querySelector(`#${id}`);
            if (!el || el.value === '') return null;
            const f = parseFloat(el.value);
            return Number.isNaN(f) ? null : f;
        };

        const getCheck = (id) => {
            // Flexible Input Resolution (Inline)
            let el = modal.querySelector(`#${id}`);
            if (!el && !id.startsWith('toggle-')) el = modal.querySelector(`#toggle-${id}`);
            if (!el && id.startsWith('toggle-')) el = modal.querySelector(`#${id.replace('toggle-', '')}`);

            if (!el) return null;
            if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
            return el.value === 'true';
        };

        const harvestRules = (type) => ({
            percentThreshold: getNum(`${type}-percentVal`),
            dollarThreshold: getNum(`${type}-dollarVal`)
        });

        let activeFilters = null;

        if (skipSectors) {
            // BUG FIX: Prevent converting 'null' (All) into '[]' (None) during fast saves
            const current = AppState.preferences?.scanner?.activeFilters;
            activeFilters = (current === null) ? null : (Array.isArray(current) ? [...current].map(f => f.toUpperCase()) : []);
        } else {
            const toggles = modal.querySelectorAll('.sector-toggle');
            if (toggles.length === 0) {
                // SAFETY: If toggles aren't in the DOM (e.g. accordion closed/not rendered),
                // preserve the current AppState to prevent accidental "none" reset.
                // DEFAULT TO 'null' (All) if AppState is also missing.
                const current = AppState.preferences?.scanner?.activeFilters;
                activeFilters = (current === undefined) ? null : (current === null ? null : [...current].map(f => f.toUpperCase()));
            } else {
                const harvested = [];
                toggles.forEach(cb => {
                    if (cb.checked) {
                        const ind = cb.dataset.industry;
                        if (ind) harvested.push(ind.toUpperCase());
                    }
                });

                // Optimization: If everything is checked OR if counts match the rendered toggles, store as 'null' (All)
                // This is safer than comparing against the hardcoded constant as it remains resilient to UI rendering glitches.
                const totalIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat().length;
                const isAllPhysicallyChecked = harvested.length === toggles.length && toggles.length > 0;

                activeFilters = (isAllPhysicallyChecked || harvested.length === totalIndustries) ? null : harvested;
            }
        }

        return {
            showBadges: getCheck('toggle-pref-showBadges'),
            badgeScope: modal.querySelector(`#${IDS.PREF_BADGE_SCOPE}`)?.value || 'custom',
            dailyEmail: getCheck('toggle-pref-dailyEmail'),
            excludePortfolio: getCheck(IDS.PREF_EXCLUDE_PORTFOLIO),
            scanner: {
                activeFilters: activeFilters
            },
            alertEmailRecipients: modal.querySelector(`#${IDS.PREF_EMAIL_ADDR}`)?.value || '',
            scannerRules: {
                minPrice: getNum(IDS.PREF_GLOBAL_MIN_PRICE),
                hiloMinPrice: getNum(IDS.PREF_HILO_MIN_PRICE),
                moversEnabled: getCheck('toggle-moversEnabled'),
                hiloEnabled: getCheck('toggle-hiloEnabled'),
                personalEnabled: getCheck('toggle-personalEnabled'),
                up: harvestRules('up'),
                down: harvestRules('down')
            }
        };
    }

    static _updateSummaryBoard(modal) {
        const currentState = this._harvestState(modal);
        this._updateValues(modal, currentState);
    }

    static _updateValues(modal, prefs, skipInputs = false) {
        const rules = prefs.scannerRules || {};
        const upPct = rules.up?.percentThreshold ?? null;
        const upDol = rules.up?.dollarThreshold ?? null;
        const downPct = rules.down?.percentThreshold ?? null;
        const downDol = rules.down?.dollarThreshold ?? null;
        const minPrice = rules.minPrice ?? null;
        const hiloPrice = rules.hiloMinPrice ?? null;

        const moversEnabled = rules.moversEnabled !== false;
        const hiloEnabled = rules.hiloEnabled !== false;
        const personalEnabled = rules.personalEnabled !== false;
        const showBadges = prefs.showBadges !== false;
        const dailyEmail = prefs.dailyEmail === true;
        const isExclude = prefs.excludePortfolio ?? true;

        const rawFilters = prefs.scanner?.activeFilters;
        const allIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat().map(f => f.toUpperCase());
        // FIX: Default to ALL if null OR undefined. Previously undefined defaulted to [] (None).
        const activeFilters = (rawFilters === null || rawFilters === undefined) ? allIndustries : (rawFilters || []).map(f => f.toUpperCase());

        // Helper to safely update text and indicators
        const updateTile = (id, indicatorId, isOn, val) => {
            const valEl = modal.querySelector(`#${id}`);
            const indEl = modal.querySelector(`#${indicatorId}`);
            if (valEl) {
                valEl.textContent = val !== undefined ? val : (isOn ? 'On' : 'Off');
                valEl.style.opacity = isOn ? '1' : '0.5';
            }
            if (indEl) {
                // USER REQUEST: Fix "Squares" issue. Remove inline bg color.
                // Use 'always-on' class which (per CSS) adds opacity 1 and drop-shadow.
                // Inactive = opacity 0.2 (Ghosted).

                if (isOn) {
                    indEl.style.opacity = '1';
                    indEl.classList.add(CSS_CLASSES.ALWAYS_ON);
                    // Ensure legacy classes don't override
                    indEl.classList.remove(CSS_CLASSES.STATUS_OFF);
                } else {
                    indEl.style.opacity = '0.2'; // Ghosted
                    indEl.classList.remove(CSS_CLASSES.ALWAYS_ON);
                    indEl.classList.add(CSS_CLASSES.STATUS_OFF);
                }

                // Clean up any inline background color I previously added
                indEl.style.backgroundColor = '';
                indEl.style.boxShadow = '';
            }
        };

        const updateParam = (id, val, isLimit = false) => {
            const el = modal.querySelector(`#${id}`);
            if (el) {
                // If isLimit (Movers/52w Limit), treat 0 as "None" for display
                const isZero = (val === 0 || val === '0' || val === '$0.00' || val === '0.0%');
                const isBlank = (val === null || val === undefined || val === '—');

                if (isLimit && isZero) {
                    el.textContent = 'None';
                    el.parentElement.style.opacity = '0.4';
                } else {
                    el.textContent = isBlank ? '—' : val;
                    el.parentElement.style.opacity = isBlank ? '0.4' : '1';
                }
            }
        };

        const fmtParam = (pct, dol) => {
            const hasP = (pct !== null && pct !== undefined && pct !== 0 && String(pct) !== '');
            const hasD = (dol !== null && dol !== undefined && dol !== 0 && String(dol) !== '');
            const p = hasP ? `${parseFloat(pct).toFixed(1)}%` : 'None %';
            const d = hasD ? `$${parseFloat(dol).toFixed(2)}` : '$ None';

            if (!hasP && !hasD) return null;
            return `${p} | ${d}`;
        };

        // 1. Alert Monitors (Top Row)
        updateTile(null, 'ind-personal', personalEnabled);
        updateTile(null, 'ind-hilo', hiloEnabled);
        updateTile(null, 'ind-movers', moversEnabled);
        updateTile(null, 'ind-icon', showBadges);
        updateTile(null, 'ind-email', dailyEmail);

        // Update Scope Value Display - Now shows "Badge Custom" or "Badge All"
        const scopeEl = modal.querySelector('#val-scope');
        if (scopeEl) {
            const scope = prefs.badgeScope || 'custom';
            scopeEl.textContent = `Badge ${scope.charAt(0).toUpperCase() + scope.slice(1)}`;
        }

        // 2. Parameters (Middle Row)
        // Pass "true" for isLimit to handle 0 as None
        updateParam('sum-val-vol', (minPrice !== null && minPrice !== undefined) ? `$${parseFloat(minPrice).toFixed(2)}` : null, true);
        updateParam('sum-val-hilo', (hiloPrice !== null && hiloPrice !== undefined) ? `$${parseFloat(hiloPrice).toFixed(2)}` : null, true);

        const upTxt = fmtParam(upPct, upDol);
        const downTxt = fmtParam(downPct, downDol);
        updateParam('sum-val-up', upTxt);
        updateParam('sum-val-down', downTxt);

        // Apply Color Triggers
        const upEl = modal.querySelector('#sum-val-up');
        const downEl = modal.querySelector('#sum-val-down');
        if (upEl) {
            upEl.style.color = upTxt ? 'var(--color-positive)' : 'var(--text-muted)';
        }
        if (downEl) {
            downEl.style.color = downTxt ? 'var(--color-negative)' : 'var(--text-muted)';
        }

        // 3. Scanner Depth (Bottom Row)
        updateTile(IDS.SUMMARY_PORTFOLIO_OVERRIDE, 'ind-override', isExclude, isExclude ? 'On' : 'Off');

        // NEW: Update Summary Board Override Text
        const sumOverrideEl = modal.querySelector('#sum-val-override');
        if (sumOverrideEl) {
            sumOverrideEl.textContent = isExclude ? 'On' : 'Off';
            sumOverrideEl.style.color = isExclude ? 'var(--color-positive)' : 'var(--text-muted)';
            sumOverrideEl.style.fontWeight = isExclude ? 'bold' : 'normal';
        }

        const overrideEl = modal.querySelector(`#${IDS.SUMMARY_PORTFOLIO_OVERRIDE}`);
        if (overrideEl) {
            overrideEl.style.color = isExclude ? 'var(--color-positive)' : 'var(--color-negative)';
        }

        // Update Sector tallies
        this._updateSectorTallies(modal, activeFilters || [], prefs.scanner?.activeFilters === null);

        // Helper to safely update input values (prevent focus loss)
        const updateInput = (id, val) => {
            const el = modal.querySelector(`#${id}`);
            if (el && el !== document.activeElement) {
                if (val === 0) el.value = '0';
                else if (val === null || val === undefined || val === '') el.value = '';
                else el.value = val;
            }
        };

        if (!skipInputs) {
            updateInput(IDS.PREF_GLOBAL_MIN_PRICE, minPrice);
            updateInput(IDS.PREF_HILO_MIN_PRICE, hiloPrice);
            updateInput(IDS.PREF_UP_PERCENT, upPct);
            updateInput(IDS.PREF_UP_DOLLAR, upDol);
            updateInput(IDS.PREF_DOWN_PERCENT, downPct);
            updateInput(IDS.PREF_DOWN_DOLLAR, downDol);
            updateInput(IDS.PREF_EMAIL_ADDR, prefs.alertEmailRecipients);
        }

        // Toggles UI Updates
        modal.querySelectorAll('.pill-segment-movers').forEach(pill => {
            pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === String(moversEnabled));
        });

        const hiloContainer = modal.querySelector('.hilo-pill-selector');
        if (hiloContainer) {
            hiloContainer.querySelectorAll('.pill-segment-hilo').forEach(pill => {
                pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === String(hiloEnabled));
            });
        }

        modal.querySelectorAll('.pill-segment-badge').forEach(pill => {
            pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === String(showBadges));
        });

        modal.querySelectorAll('.pill-segment-email').forEach(pill => {
            pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === String(dailyEmail));
        });

        modal.querySelectorAll('.pill-segment-override').forEach(pill => {
            pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === String(isExclude));
        });

        modal.querySelectorAll('.pill-segment-personal').forEach(pill => {
            pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === String(personalEnabled));
        });

        modal.querySelectorAll('.pill-segment-badge-scope').forEach(pill => {
            pill.classList.toggle(CSS_CLASSES.ACTIVE, pill.dataset.value === prefs.badgeScope);
        });

        const totalIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat().length;
        modal.querySelectorAll('.master-pill-segment').forEach(seg => {
            const action = seg.dataset.action;
            const isAllPill = prefs.scanner?.activeFilters === null || activeFilters.length === totalIndustries;
            const isNonePill = Array.isArray(prefs.scanner?.activeFilters) && activeFilters.length === 0;
            const isMatch = (action === 'all' && isAllPill) || (action === 'none' && isNonePill);
            seg.classList.toggle(CSS_CLASSES.ACTIVE, isMatch);
        });

        // Efficient Sector Update: Only re-render if filters changed OR if accordion is currently empty (initial load fix)
        const accordionContainer = modal.querySelector('#settings-sector-accordion');
        // FIX: Ensure casing consistency (Uppercase) for comparison to prevent infinite re-render loop
        const currentActive = Array.from(modal.querySelectorAll('.sector-toggle:checked')).map(cb => (cb.dataset.industry || '').toUpperCase());
        const hasFilterChange = JSON.stringify(currentActive.sort()) !== JSON.stringify(activeFilters.sort());
        const isEmpty = !accordionContainer || accordionContainer.children.length === 0;

        // Render if data changed OR if this is the first time we are populating (isEmpty)
        if (hasFilterChange || isEmpty) {
            this._renderSectorAccordion(modal, activeFilters);
        }
    }

    /**
     * Updates the summary tallies for active/hidden industries (detailed sectors)
     */
    static _updateSectorTallies(modal, activeFilters, isNoFilter = false) {
        const textEl = modal.querySelector('#summary-sectors-text');
        if (!textEl) return;

        const allIndustries = Object.values(SECTOR_INDUSTRY_MAP).flat();
        const totalIndustries = allIndustries.length;

        // activeFilters is an array here (normalized by caller)
        const activeCount = (isNoFilter || activeFilters.length === totalIndustries) ? totalIndustries : activeFilters.length;
        const inactiveCount = totalIndustries - activeCount;

        if (inactiveCount === 0) {
            // All Active
            textEl.textContent = `All ${totalIndustries} Active`;
            textEl.style.color = 'var(--color-positive)';
            textEl.style.fontSize = '0.9rem';
        } else if (activeCount === 0) {
            // All Inactive
            textEl.textContent = `ALL ${totalIndustries} INACTIVE`;
            textEl.style.color = 'var(--color-negative)';
            textEl.style.fontWeight = '700';
            textEl.style.fontSize = '0.9rem';
        } else {
            // Mixed
            textEl.innerHTML = `<span style="color: var(--color-positive)">${activeCount} Active</span> <span style="opacity:0.3; margin: 0 4px;">|</span> <span style="color: var(--color-negative)">${inactiveCount} Inactive</span>`;
            textEl.style.fontSize = '0.8rem';
            textEl.style.width = '100%';
            textEl.style.textAlign = 'center';
        }
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

            const activeCount = industries.filter(ind => activeFilters.includes(ind.toUpperCase())).length;
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
                        <div class="pill-container upsized sector-pill-selector pill-segment-accordion" style="width: 104px;">
                            <span class="bulk-btn ${isAllSelected ? CSS_CLASSES.ACTIVE : ''}" data-action="all" title="Select All" style="font-size: 0.65rem;">All</span>
                            <span class="bulk-btn ${activeCount === 0 ? CSS_CLASSES.ACTIVE : ''}" data-action="none" title="Deselect All" style="font-size: 0.65rem;">None</span>
                        </div>
                        
                        <div style="width: 16px; display: flex; justify-content: center;">
                            <i class="fas fa-chevron-down" style="font-size: 0.8rem; opacity: 0.5; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); ${isOpen ? 'transform: rotate(180deg);' : ''}"></i>
                        </div>
                    </div>
                </div>
                <div class="filter-body sector-industries-grid ${isOpen ? '' : 'hidden'}" style="padding: 10px; background: var(--bg-card); border-top: 1px solid var(--border-color);">
                    ${industries.map(ind => {
                const normalizedInd = ind.toUpperCase();
                const isChecked = activeFilters.includes(normalizedInd);
                return `
                        <div class="filter-row clickable-industry-row" style="padding: 8px 10px; background: rgba(0,0,0,0.02); border-radius: 6px; border: 1px solid rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0;">
                            <span class="industry-name" style="font-size: 0.75rem; color: ${isChecked ? 'var(--color-accent)' : 'var(--text-normal)'}; line-height: 1.2; flex: 1; transition: color 0.2s; font-weight: 500; white-space: normal; word-break: break-word;">${ind}</span>
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
        // --- DYNAMIC AUTO-SAVE LOGIC ---
        let pendingContext = null;

        // Debounce wrapper for Inputs (prevent rapid write spam)
        let saveTimer = null;
        const debouncedSave = () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                this._executeSave(modal, userId);
            }, 800); // 800ms delay for typing
        };

        // Immediate Save for Toggles/Clicks
        const immediateSave = () => {
            this._executeSave(modal, userId);
        };

        this._executeSave = (modal, userId) => {
            const newPrefs = this._harvestState(modal);

            userStore.savePreferences(userId, newPrefs);

            // UPDATE APP STATE: Ensure global sync payload has fresh data.
            AppState.preferences.dailyEmail = newPrefs.dailyEmail;
            AppState.preferences.alertEmailRecipients = newPrefs.alertEmailRecipients;
            AppState.preferences.badgeScope = newPrefs.badgeScope;
            AppState.preferences.showBadges = newPrefs.showBadges;
            AppState.preferences.excludePortfolio = newPrefs.excludePortfolio;

            // Sync scanner rules to AppState for immediate reactivity
            if (!AppState.preferences.scannerRules) AppState.preferences.scannerRules = {};
            Object.assign(AppState.preferences.scannerRules, newPrefs.scannerRules);

            // Sync active filters
            if (!AppState.preferences.scanner) AppState.preferences.scanner = {};
            AppState.preferences.scanner.activeFilters = newPrefs.scanner.activeFilters;

            // Persist locally as well (Registry Rule)
            localStorage.setItem(STORAGE_KEYS.DAILY_EMAIL, newPrefs.dailyEmail);
            localStorage.setItem(STORAGE_KEYS.EMAIL_RECIPIENTS, newPrefs.alertEmailRecipients);
            localStorage.setItem(STORAGE_KEYS.BADGE_SCOPE, newPrefs.badgeScope);

            // Trigger Badge Update (Full Refresh using new persisted data)
            document.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_UPDATE, {
                detail: { forceBadgeUpdate: true }
            }));

            // Trigger AppState Sync
            if (AppState.triggerSync) AppState.triggerSync();

            // USER REQUEST: Toast Notification
            const msg = pendingContext || 'Settings saved';
            ToastManager.show(msg, 'success');
            pendingContext = null; // Reset
        };

        const close = () => {
            // NO REVERT LOGIC - Auto-Saved.
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

        // --- CONSOLIDATED EVENT DELEGATION (V3) ---

        let updateTimer = null;
        const triggerUpdate = (shouldSave = false, context = null) => {
            if (context) pendingContext = context;
            clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                const currentState = this._harvestState(modal, shouldSave === 'fast');
                this._updateValues(modal, currentState, true); // Update Summary UI, SKIP Inputs (Prevent typing glitch)

                // If requested, trigger the actual persistence
                if (shouldSave) {
                    if (shouldSave === 'immediate') immediateSave();
                    else debouncedSave();
                }
            }, 50);
        };

        // 1. Inputs (Text/Number): UI Update Only (Real-time summary)
        modal.addEventListener('input', (e) => {
            if (e.target.matches('input')) {
                // UI update only while typing (Prevents jumpiness)
                triggerUpdate(false);
            }
        });

        // 2. Commit Changes (Blur/Enter): Actual Save
        modal.addEventListener('change', (e) => {
            const input = e.target;
            const inputId = input.id || '';
            const value = input.value;
            let contextMsg = 'Setting saved';

            // Build descriptive message for persistence
            if (inputId.includes('pct') || inputId.includes('Pct')) {
                contextMsg = `${value}% threshold saved`;
            } else if (inputId.includes('dol') || inputId.includes('Dol')) {
                contextMsg = `$${value} threshold saved`;
            } else if (inputId.includes('min') || inputId.includes('Min')) {
                contextMsg = `$${value} minimum saved`;
            } else if (input.type === 'checkbox' || input.type === 'radio') {
                const row = input.closest('.settings-row');
                const label = row ? row.querySelector('.settings-label')?.textContent : 'Preference';
                contextMsg = `${label} updated`;
                // Checkboxes/Pills save immediately on click
                triggerUpdate('immediate', contextMsg);
                return;
            } else {
                let label = input.previousElementSibling?.textContent || input.getAttribute('placeholder') || 'Setting';
                if (label.includes('Threshold')) label = 'Thresholds';
                contextMsg = `${label} saved`;
            }

            // Save on change (Blur)
            triggerUpdate('immediate', contextMsg);
        });

        // 1b. Ring Radio Specialist (YES/NO Toggles)
        modal.addEventListener('click', (e) => {
            const radio = e.target.closest('.ring-radio-input');
            if (radio) {
                const targetId = radio.dataset.target;
                const val = radio.value === 'true';
                const hiddenInput = modal.querySelector(`#${targetId}`);
                if (hiddenInput) {
                    hiddenInput.value = String(val);
                    triggerUpdate('immediate', 'Selection saved'); // Immediate Save
                }
            }
        });

        // 2. Click Delegation (Pills, Bulk Actions, Accordions, Kangaroo, Summary Tiles)
        modal.addEventListener('click', (e) => {
            // --- NEW: Summary Board Interactivity ---
            const tile = e.target.closest('.summary-tile-clickable');
            if (tile) {
                const toggleTarget = tile.dataset.toggleTarget;
                const scrollTarget = tile.dataset.scrollTarget;

                if (toggleTarget) {
                    if (toggleTarget === 'badge-scope') {
                        // Toggle between custom and all
                        const input = modal.querySelector(`#${IDS.PREF_BADGE_SCOPE}`);
                        if (input) {
                            const nextVal = input.value === 'custom' ? 'all' : 'custom';
                            input.value = nextVal;

                            // SYNC FIX: Explicitly trigger badge update in main UI
                            if (notificationStore) {
                                notificationStore.recalculateBadges();
                            }

                            triggerUpdate('immediate', `Badge Scope set to ${nextVal}`);
                        }
                    } else {
                        // Standard Toggle
                        const input = modal.querySelector(`#${toggleTarget}`);
                        if (input && input.type === 'checkbox') {
                            input.checked = !input.checked;
                            input.dispatchEvent(new Event('change', { bubbles: true })); // Trigger persistence
                        }
                    }
                    return;
                }

                if (scrollTarget) {
                    const section = modal.querySelector(`#${scrollTarget}`);
                    if (section) {
                        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Visual feedback flash
                        section.classList.remove(CSS_CLASSES.SECTION_FLASH);
                        void section.offsetWidth; // Trigger reflow
                        section.classList.add(CSS_CLASSES.SECTION_FLASH);
                    }
                    return;
                }
            }

            // A0. Kangaroo Icon (Open Notifications)
            const kangaroo = e.target.closest('.kangaroo');
            if (kangaroo) {
                // Open Notifications Logic
                // Only if visible (opacity > 0.2 approx, or class status-on/always-on)
                const isVisible = kangaroo.classList.contains('status-on') || kangaroo.classList.contains(CSS_CLASSES.ALWAYS_ON) || getComputedStyle(kangaroo).opacity > 0.5;

                if (isVisible) {
                    // Dispatch standard Open Event
                    document.dispatchEvent(new CustomEvent(EVENTS.OPEN_NOTIFICATIONS));
                    return;
                }
            }

            // A. Alert/Monitoring Pill Selectors
            const pill = e.target.closest('.pill-segment-badge, .pill-segment-email, .pill-segment-override, .movers-pill-selector span, .hilo-pill-selector span, .personal-pill-selector span, .pill-segment-badge-scope');
            if (pill) {
                const isBadgeScope = pill.classList.contains('pill-segment-badge-scope');
                const val = isBadgeScope ? pill.dataset.value : (pill.dataset.value === 'true');
                const container = pill.parentElement;
                let targetId = null;
                let contextMsg = 'Setting saved';

                if (pill.classList.contains('pill-segment-badge')) {
                    targetId = 'toggle-pref-showBadges';
                    contextMsg = val ? 'Badges Enabled' : 'Badges Disabled';
                    // NOTE: _executeSave will sync to AppState, no need for manual set here if we save immediate.
                }
                else if (pill.classList.contains('pill-segment-badge-scope')) {
                    targetId = IDS.PREF_BADGE_SCOPE;
                    contextMsg = 'Badge Scope updated';
                    // Auto-Save handles sync.
                }
                else if (pill.classList.contains('pill-segment-email')) {
                    targetId = 'toggle-pref-dailyEmail';
                    contextMsg = val ? 'Daily Email Enabled' : 'Daily Email Disabled';
                }
                else if (pill.classList.contains('pill-segment-override')) {
                    targetId = IDS.PREF_EXCLUDE_PORTFOLIO;
                    contextMsg = val ? 'Override Enabled' : 'Override Disabled';
                }
                else if (pill.closest('.movers-pill-selector')) { targetId = 'toggle-moversEnabled'; contextMsg = 'Movers Filter updated'; }
                else if (pill.closest('.hilo-pill-selector')) { targetId = 'toggle-hiloEnabled'; contextMsg = '52w High/Low Filter updated'; }
                else if (pill.closest('.personal-pill-selector')) { targetId = 'toggle-personalEnabled'; contextMsg = 'Personal Filter updated'; }

                if (targetId) {
                    const hiddenInput = modal.querySelector(`#${targetId}`);
                    if (hiddenInput) {
                        // TYPE SAFETY: Ensure we don't accidentally check the checkbox with a string value like 'custom'
                        if (hiddenInput.type === 'checkbox' || hiddenInput.type === 'radio') {
                            if (typeof val === 'boolean') hiddenInput.checked = val;
                        } else {
                            hiddenInput.value = String(val);
                        }
                        // Update UI Active State (IMMEDIATE FEEDBACK)
                        Array.from(container.children).forEach(p => p.classList.toggle(CSS_CLASSES.ACTIVE, p === pill));

                        // SYNC FIX: If scope changed via pill, update badge instantly
                        if (targetId === IDS.PREF_BADGE_SCOPE && notificationStore) {
                            notificationStore.recalculateBadges();
                        }

                        triggerUpdate('fast', contextMsg); // Fast Save (Skip heavy sector sweep)
                    }
                }
                return;
            }

            // B. Master Sector Bulk Select - OPTIMIZED
            const masterSeg = e.target.closest('.master-pill-segment');
            if (masterSeg) {
                const action = masterSeg.dataset.action;
                const isAll = action === 'all';

                // CRITICAL FIX: Update AppState directly BEFORE re-render cycle
                // This prevents the synchronous _updateSummaryBoard from seeing stale data
                // and rolling back the UI to the previous state.
                if (AppState.preferences?.scanner) {
                    AppState.preferences.scanner.activeFilters = isAll ? null : [];
                }

                modal.querySelectorAll('.sector-toggle').forEach(cb => {
                    cb.checked = isAll;
                });

                // Update Master Pill UI State (Immediate Feedback)
                masterSeg.parentElement.querySelectorAll('.master-pill-segment').forEach(s => s.classList.toggle(CSS_CLASSES.ACTIVE, s.dataset.action === action));

                // Sync UI Components
                this._updateSummaryBoard(modal);
                triggerUpdate('immediate', 'All Sectors Updated');
                return;
            }

            // C. Sector-Level Bulk Action - OPTIMIZED
            const bulkBtn = e.target.closest('.bulk-btn');
            if (bulkBtn && !bulkBtn.classList.contains(CSS_CLASSES.MASTER_PILL_SEGMENT)) {
                const action = bulkBtn.dataset.action;
                const isAll = action === 'all';
                const item = bulkBtn.closest('.filter-accordion-item');
                const sectorName = item?.querySelector('.sector-name')?.textContent;

                if (item && sectorName) {
                    item.querySelectorAll('.sector-toggle').forEach(cb => {
                        cb.checked = isAll;
                    });

                    // CRITICAL FIX: Update AppState directly for this specific sector group
                    // to prevent re-render "rollback" during the next sync cycle.
                    if (AppState.preferences?.scanner) {
                        const industries = SECTOR_INDUSTRY_MAP[sectorName]?.map(i => i.toUpperCase()) || [];
                        let current = AppState.preferences.scanner.activeFilters;

                        // If currently 'All', expand it first
                        if (current === null) {
                            current = Object.values(SECTOR_INDUSTRY_MAP).flat().map(i => i.toUpperCase());
                        }

                        let next;
                        if (isAll) {
                            // Union with this sector's industries
                            next = Array.from(new Set([...current, ...industries]));
                            // If resulting union is everything, set to null
                            const totalCount = Object.values(SECTOR_INDUSTRY_MAP).flat().length;
                            if (next.length === totalCount) next = null;
                        } else {
                            // Subtraction
                            next = current.filter(i => !industries.includes(i));
                        }
                        AppState.preferences.scanner.activeFilters = next;
                    }

                    this._updateSummaryBoard(modal); // Sync UI Immediately
                    triggerUpdate('immediate', 'Sector Group Updated');
                }
                return;
            }

            // D. View All / Accordion Global Control
            const accordionSeg = e.target.closest(`.${CSS_CLASSES.ACCORDION_CONTROL_SEGMENT}`);
            if (accordionSeg) {
                const action = accordionSeg.dataset.action;
                accordionSeg.parentElement.querySelectorAll(`.${CSS_CLASSES.ACCORDION_CONTROL_SEGMENT}`).forEach(s => s.classList.remove(CSS_CLASSES.ACTIVE));
                accordionSeg.classList.add(CSS_CLASSES.ACTIVE);

                const isExpand = (action === 'expand');
                modal.querySelectorAll(`.${CSS_CLASSES.FILTER_ACCORDION_ITEM}`).forEach(item => {
                    const body = item.querySelector(`.${CSS_CLASSES.FILTER_BODY}`);
                    const icon = item.querySelector(`.${CSS_CLASSES.FILTER_HEADER} i`);
                    if (isExpand) { body.classList.remove(CSS_CLASSES.HIDDEN); icon.style.transform = 'rotate(180deg)'; }
                    else { body.classList.add(CSS_CLASSES.HIDDEN); icon.style.transform = 'rotate(0deg)'; }
                });
                triggerUpdate(); // UI update only, no save needed for accordion state
                return;
            }

            // E. Single Accordion Header (Expand/Collapse)
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

            // F. Industrial Row Selection
            const row = e.target.closest(`.${CSS_CLASSES.CLICKABLE_INDUSTRY_ROW}`);
            if (row && !e.target.matches('input')) {
                const cb = row.querySelector(`.${CSS_CLASSES.SECTOR_TOGGLE}`);
                if (cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        // 3. Sector Change Handler (Reactive Tallying + Save)
        modal.addEventListener('change', (e) => {
            if (e.target.matches('.sector-toggle')) {
                // ... Tally Logic is same ...
                const item = e.target.closest('.filter-accordion-item');
                if (item) {
                    // Re-run tally
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

                    if (summarySpan) {
                        if (checkedCount === 0) summarySpan.style.display = 'none';
                        else if (isAll) summarySpan.style.display = 'none';
                        else {
                            summarySpan.style.display = 'inline-block';
                            summarySpan.textContent = `${checkedCount} of ${totalCount}`;
                        }
                    }

                    if (sectorSpan) sectorSpan.style.color = hasActive ? 'var(--color-accent)' : 'white';
                    if (header) header.style.borderLeftColor = hasActive ? 'var(--color-accent)' : 'transparent';
                    if (pillAll) pillAll.classList.toggle(CSS_CLASSES.ACTIVE, isAll);
                    if (pillNone) pillNone.classList.toggle(CSS_CLASSES.ACTIVE, checkedCount === 0);
                }

                // SECTOR UPDATE: Trigger Immediate Save
                // Note: The Sector Change Handler logic (see listener below) updates the DOM checkboxes.
                // We just need to trigger the save cycle here.
                triggerUpdate('immediate', 'Sectors updated'); // Immediate Save on sector check
            }
        });

    }
}
