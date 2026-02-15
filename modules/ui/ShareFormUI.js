import { AppState } from '../state/AppState.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { UI_ICONS, HTML_TEMPLATES, CSS_CLASSES, IDS, EVENTS, USER_MESSAGES, PORTFOLIO_ID, REGISTRY_OPTIONS } from '../utils/AppConstants.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';
import { KeyboardModalHandler } from '../utils/KeyboardModalHandler.js';

/**
 * ShareFormUI.js
 * Manages the UI for Adding / Editing Shares and Cash Assets.
 * View Layer: Handles DOM generation, Event Binding, and Data Extraction.
 */

export class ShareFormUI {
    /**
     * Opens the Share Modal and handles all internal UI interactions.
     * @param {Object} options 
     * @param {Array} options.watchlists - List of available watchlists
     * @param {string} options.activeWatchlistId - Currently active watchlist ID
     * @param {Function} options.onSave - Callback(data) when save is clicked
     * @param {Function} options.onDelete - Callback(shareId) when delete is clicked
     * @param {Object} [options.shareData] - Data to pre-fill (for editing)
     */
    static showShareModal({ watchlists, activeWatchlistId, activeWatchlistIds = [], onSave, onDelete, shareData = null, onLookupPrice, initialSection = null }) {
        // Standardize input: activeWatchlistIds should be an array
        // FORCE WATCHLIST SELECTION (Directive: 1. No default watchlist for ADD)
        // If we are in ADD mode (no shareData.id), we normally force empty.
        // BUT: If activeWatchlistIds is explicitly provided (e.g. Ghost Share Recovery or Pre-fill), respect it.
        const isAddMode = !shareData || !shareData.id;

        let currentMemberships = [];
        if (Array.isArray(activeWatchlistIds) && activeWatchlistIds.length > 0) {
            currentMemberships = activeWatchlistIds;

        } else if (activeWatchlistId) {
            currentMemberships = [activeWatchlistId];
        } else if (isAddMode) {
            currentMemberships = []; // Explicitly clear for fresh Add
        }

        // 1. Generate HTML
        const modal = this._renderCleanAddShareModal(watchlists, currentMemberships, shareData);
        // ATTACH DATA FOR EVENTS (Fixes Double-Up on Edit bug)
        modal._shareData = shareData;
        modal._onSave = onSave;

        // 2. Bind Internal UI Events
        this._bindAccordion(modal);
        this._bindWatchlistDropdown(modal);
        this._bindCustomInputs(modal);
        this._bindCommentsLogic(modal, shareData);
        this._bindSearchEvents(modal);
        this._bindSearchResults(modal);
        this._bindPreviewUpdate(modal);

        // CAPTURE INITIAL STATE (For Dirty Checking)
        // We do this after binding inputs but before user interaction.
        // We use a timeout to let any dynamic value setting settle (though synchronous is better).
        setTimeout(() => {
            const initialState = this._extractShareData(modal, true); // Suppress toasts for initial capture
            modal._initialFormJSON = JSON.stringify(initialState);
            // safe-guard: if extract fails (validation), we might disable save anyway.
            this._validateForm(modal);
        }, 0);

        // 3. Bind Actions
        const saveBtn = modal.querySelector(`#${IDS.SAVE_BTN}`);
        const deleteBtn = modal.querySelector(`#${IDS.DELETE_BTN}`);

        saveBtn.addEventListener('click', () => {
            const data = this._extractShareData(modal); // Show toasts on explicit save
            if (!data) return; // Validation failed

            // UI Feedback
            saveBtn.disabled = true;
            const originalIcon = saveBtn.innerHTML;
            saveBtn.innerHTML = `<i class="fas ${UI_ICONS.SPINNER}"></i>`;

            onSave(data).then(() => {
                // Success usually closes modal, but if not (partial success), we must stop spinner.
                if (modal && document.body.contains(modal)) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalIcon;
                }
            }).catch(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalIcon;
            });
        });


        if (shareData && shareData.id) {
            deleteBtn.classList.remove(CSS_CLASSES.HIDDEN);
            deleteBtn.addEventListener('click', () => {
                if (confirm(USER_MESSAGES.CONFIRM_DELETE)) {

                    const event = new CustomEvent(EVENTS.REQUEST_DELETE_SHARE, {
                        detail: {
                            shareId: shareData.id,
                            watchlistId: activeWatchlistId || shareData.watchlistId || 'portfolio'
                        }
                    });
                    document.dispatchEvent(event);
                    modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.click();
                }
            });
        }

        // 4. Show Modal
        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.classList.remove(CSS_CLASSES.HIDDEN);
            const input = modal.querySelector('#shareName');
            if (input) input.focus();

            // EDIT MODE: Trigger Live Preview immediately
            if (shareData && shareData.shareName) {
                const preview = modal.querySelector(`#${IDS.PRICE_PREVIEW_PANEL}`);
                if (preview) {
                    preview.classList.remove(CSS_CLASSES.HIDDEN);
                    preview.innerHTML = `
                       <div style="display: flex; justify-content: center; align-items: center; min-height: 80px; width: 100%;">
                           <i class="fas ${UI_ICONS.SPINNER}" style="font-size: 1.5rem; color: var(--accent-color);"></i>
                       </div>
                    `;
                }

                const subtitle = modal.querySelector(`#${IDS.MODAL_SUBTITLE}`);
                if (subtitle) {
                    let titleText = shareData && shareData.title;

                    // Fallback: Try to find name in Live Prices if not passed explicitly
                    if (!titleText && shareData && shareData.shareName) {
                        const cached = AppState.livePrices.get(shareData.shareName);
                        if (cached) titleText = cached.name;
                    }

                    if (titleText) {
                        subtitle.textContent = titleText;
                    } else {
                        subtitle.textContent = 'Enter share details';
                    }
                }

                document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_LIVE_PRICE, { detail: { code: shareData.shareName } }));

                // Validate immediately (checks for duplicates if refilling)
                this._validateForm(modal, shareData); // This passes it explicitly, which is good.
                // But internal events need to find it too.
            }

            // DEEP LINK: Expand requested section
            if (initialSection) {
                const sectionItem = modal.querySelector(`.${CSS_CLASSES.ACCORDION_ITEM}[data-section="${initialSection}"]`);
                const modalBody = modal.querySelector(`.${CSS_CLASSES.MODAL_BODY}`);
                if (sectionItem) {
                    // Close others
                    modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_ITEM}`).forEach(i => i.classList.remove(CSS_CLASSES.ACTIVE));
                    // Open target
                    sectionItem.classList.add(CSS_CLASSES.ACTIVE);
                    // Scroll to it using modal body for consistent behavior
                    setTimeout(() => {
                        if (modalBody) {
                            modalBody.scrollTo({
                                top: sectionItem.offsetTop,
                                behavior: 'smooth'
                            });
                        }
                    }, 200);
                }
            }
        });
    }

    /**
     * Normalizes a date string to YYYY-MM-DD for input type="date".
     * Handles DD/MM/YYYY, ISO strings, and timestamp formats.
     */
    static _normalizeDateForInput(dateStr) {
        if (!dateStr) return '';


        // 1. Check for standard ISO / YYYY-MM-DD
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            return dateStr.substring(0, 10);
        }

        // 2. Handle DD/MM/YYYY
        if (typeof dateStr === 'string') {
            const parts = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            if (parts) {
                const d = parts[1].padStart(2, '0');
                const m = parts[2].padStart(2, '0');
                const y = parts[3];
                return `${y}-${m}-${d}`;
            }
        }

        // 3. Fallback to JS Date parsing
        try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
        } catch (e) {
            console.warn('[ShareFormUI] Date normalization failed for:', dateStr);
        }

        return '';
    }

    /**
     * Validates the form state and updates UI (Save Button & Banner).
     */
    static _validateForm(modal, shareData = null) {
        const saveBtn = modal.querySelector(`#${IDS.SAVE_BTN}`);
        const input = modal.querySelector(`#${IDS.SHARE_NAME}`);

        if (!saveBtn || !input) return;

        const code = input.value.trim().toUpperCase();
        const selectedWatchlists = [...modal.querySelectorAll('input[name="watchlist"]:checked')];

        let isValid = true;
        let validationMsg = '';

        // 0. AUTH CHECK (Live Read-Only Mode)
        if (!AppState.user) {
            isValid = false;
            validationMsg = 'Login to Save';
        }

        // 1. Check Watchlist Selection
        if (selectedWatchlists.length === 0) {
            isValid = false;
        }
        // 2. Check Code Validity
        else if (code.length < 3) { // Minimal length check
            isValid = false;
        }

        // 3. Duplicate Detection (CRITICAL)
        const currentData = modal._shareData || shareData;

        // FIX: If editing and the name hasn't changed, skip duplicate check.
        // This prevents false positives if the database has legacy duplicates (mixed schema).
        // Use uppercase comparison since input code is uppercased
        let duplicateShare = null;
        if (currentData && (currentData.shareName || '').toUpperCase() === code) {
            duplicateShare = null;
        } else {
            duplicateShare = this._checkDuplicate(code, currentData?.id);
        }

        if (duplicateShare) {
            isValid = false;
        }

        // 4. DIRTY CHECK (Prevent Save if No Changes - EDIT MODE ONLY)
        // If we are Adding a share (even if pre-filled), the act of saving IS the change.
        // We only block "no-op" saves for existing records to prevent network spam.
        const isEditMode = !!(currentData && currentData.id);

        if (isValid && isEditMode && modal._initialFormJSON) {
            const currentFormState = this._extractShareData(modal);
            if (currentFormState) {
                // We perform a simple JSON string comparison.
                // Note: Key order must be stable, which _extractShareData ensures (code construct).
                const currentJSON = JSON.stringify(currentFormState);
                if (currentJSON === modal._initialFormJSON) {
                    isValid = false;
                    // Optional: We could set title to "No changes detected"
                }
            }
        }

        // Save Button State
        if (isValid) {
            saveBtn.disabled = false;
            saveBtn.classList.remove(CSS_CLASSES.GHOSTED);
            saveBtn.title = "Save Changes";
        } else {
            saveBtn.disabled = true;
            saveBtn.classList.add(CSS_CLASSES.GHOSTED);
            saveBtn.title = validationMsg || "Complete all fields to save";
        }
    }

    static _checkDuplicate(code, currentId = null) {
        if (!code) return null;
        // Check against ALL shares in AppState
        const allShares = AppState.data.shares || [];
        const match = allShares.find(s => {
            // Match by CODE (Exact)
            if (s.shareName !== code) return false;
            // Exclude self if editing
            if (currentId && s.id === currentId) return false;
            return true;
        });

        if (match) {
            console.warn('[ShareFormUI] Duplicate Detected:', { inputCode: code, conflictId: match.id, conflictName: match.shareName });
        }
        return match || null;  // Return the share data, not boolean
    }

    /**
     * Converts an Add modal to Edit mode in-place, populating existing share data.
     * @param {HTMLElement} modal - The modal DOM element
     * @param {Object} existingShare - The existing share data to populate
     */
    static _convertToEditMode(modal, existingShare) {
        if (!modal || !existingShare) return;



        // 1. Update modal state to treat as edit
        modal._shareData = existingShare;

        // 2. Update header title
        const titleEl = modal.querySelector(`.${CSS_CLASSES.MODAL_TITLE}`);
        if (titleEl) titleEl.textContent = 'Edit Share';

        // 3. Show delete button and wire event (button was hidden in Add mode)
        const deleteBtn = modal.querySelector(`#${IDS.DELETE_BTN}`);
        if (deleteBtn && existingShare.id) {
            deleteBtn.classList.remove(CSS_CLASSES.HIDDEN);

            // Wire delete event (since it wasn't wired in Add mode)
            // Remove any existing listener first to prevent duplicates
            deleteBtn.replaceWith(deleteBtn.cloneNode(true));
            const newDeleteBtn = modal.querySelector(`#${IDS.DELETE_BTN}`);
            newDeleteBtn.classList.remove(CSS_CLASSES.HIDDEN);
            newDeleteBtn.addEventListener('click', () => {
                if (confirm(USER_MESSAGES.CONFIRM_DELETE)) {

                    const event = new CustomEvent(EVENTS.REQUEST_DELETE_SHARE, {
                        detail: {
                            shareId: existingShare.id,
                            watchlistId: existingShare.watchlistId || 'portfolio'
                        }
                    });
                    document.dispatchEvent(event);
                    modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.click();
                }
            });
        }

        // 4. Populate form fields
        // Holdings
        const unitsInput = modal.querySelector(`#${IDS.PORTFOLIO_SHARES}`);
        if (unitsInput) unitsInput.value = existingShare.portfolioShares || '';

        const avgPriceInput = modal.querySelector(`#${IDS.PORTFOLIO_AVG_PRICE}`);
        if (avgPriceInput) avgPriceInput.value = existingShare.portfolioAvgPrice || '';

        const shareSightCodeInput = modal.querySelector(`#${IDS.SHARE_SIGHT_CODE}`);
        if (shareSightCodeInput) shareSightCodeInput.value = existingShare.shareSightCode || '';

        const registrySelect = modal.querySelector(`#${IDS.SHARE_REGISTRY}`);
        if (registrySelect) registrySelect.value = existingShare.shareRegistry || '';

        const dateInput = modal.querySelector(`#${IDS.PURCHASE_DATE}`);
        if (dateInput && (existingShare.purchaseDate || existingShare.entryDate)) {
            dateInput.type = 'date';
            dateInput.value = this._normalizeDateForInput(existingShare.purchaseDate || existingShare.entryDate);
        }

        // Target & Rating
        const targetInput = modal.querySelector(`#${IDS.TARGET_PRICE}`);
        if (targetInput) targetInput.value = existingShare.targetPrice || '';

        const starInput = modal.querySelector(`#${IDS.STAR_RATING_INPUT}`);
        const starControl = modal.querySelector(`#${IDS.STAR_RATING_CONTROL}`);
        if (starInput && starControl && existingShare.starRating) {
            starInput.value = existingShare.starRating;
            starControl.querySelectorAll('.star-item').forEach((s, i) => {
                s.classList.toggle(CSS_CLASSES.ACTIVE, (i + 1) <= existingShare.starRating);
            });
        }

        // Buy/Sell Toggle
        const buySellInput = modal.querySelector(`#${IDS.BUY_SELL_INPUT}`);
        const buySellControl = modal.querySelector(`#${IDS.BUY_SELL_CONTROL}`);
        if (buySellInput && buySellControl && existingShare.buySell) {
            buySellInput.value = existingShare.buySell;
            buySellControl.querySelectorAll(`.${CSS_CLASSES.TOGGLE_OPTION}`).forEach(opt => {
                opt.classList.toggle(CSS_CLASSES.ACTIVE, opt.dataset.value === existingShare.buySell);
            });
        }

        // Target Direction Toggle
        const dirInput = modal.querySelector(`#${IDS.TARGET_DIRECTION_INPUT}`);
        const dirControl = modal.querySelector(`#${IDS.TARGET_DIRECTION_CONTROL}`);
        if (dirInput && dirControl && existingShare.targetDirection) {
            dirInput.value = existingShare.targetDirection;
            dirControl.querySelectorAll(`.${CSS_CLASSES.TOGGLE_OPTION}`).forEach(opt => {
                opt.classList.toggle(CSS_CLASSES.ACTIVE, opt.dataset.value === existingShare.targetDirection);
            });
        }

        // Dividends
        const divInput = modal.querySelector(`#${IDS.DIVIDEND_AMOUNT}`);
        if (divInput) divInput.value = existingShare.dividendAmount || '';

        const frankInput = modal.querySelector(`#${IDS.FRANKING_CREDITS}`);
        if (frankInput) frankInput.value = existingShare.frankingCredits || '';

        // 5. Update watchlist checkboxes based on which watchlists this share is in
        // Use same dual-lookup logic as ModalController.openAddShareModal
        const stockCode = existingShare.shareName?.toUpperCase() || '';
        const membershipIds = new Set();

        // 5a. Find explicit share documents (Legacy & Mixed Schema)
        const allShares = AppState.data.shares || [];
        allShares.filter(s => (s.shareName || '').toUpperCase() === stockCode).forEach(s => {
            const wId = s.watchlistId || 'portfolio';
            membershipIds.add(wId);

            // FIX: Check Array memberships too
            if (Array.isArray(s.watchlistIds)) {
                s.watchlistIds.forEach(id => membershipIds.add(id));
            }
        });

        // 5b. Find implicit memberships in Watchlist 'stocks' arrays (New Schema)
        (AppState.data.watchlists || []).forEach(wl => {
            if (wl.stocks && Array.isArray(wl.stocks)) {
                if (wl.stocks.some(code => code.toUpperCase() === stockCode)) {
                    membershipIds.add(wl.id);
                }
            }
        });



        modal.querySelectorAll('input[name="watchlist"]').forEach(cb => {
            const isChecked = membershipIds.has(cb.value);
            cb.checked = isChecked;
            const row = cb.closest(`.${CSS_CLASSES.WATCHLIST_ROW}`);
            if (row) row.classList.toggle(CSS_CLASSES.SELECTED, isChecked);
        });

        // Update Holdings visibility for Edit mode
        const holdingsSection = modal.querySelector('#holdingsAccordionItem');
        if (holdingsSection) {
            const isPortfolioItem = membershipIds.has(PORTFOLIO_ID);
            const headerIcon = holdingsSection.querySelector(`.${CSS_CLASSES.ACCORDION_HEADER} i`);
            const hintText = holdingsSection.querySelector('.unlock-hint');

            if (isPortfolioItem) {
                if (headerIcon) headerIcon.className = `fas ${UI_ICONS.CHEVRON_DOWN}`;
                if (hintText) hintText.classList.add(CSS_CLASSES.HIDDEN);
            } else {
                // Keep it "Locked"
                if (headerIcon) headerIcon.className = `fas ${UI_ICONS.LOCK}`;
                if (hintText) hintText.classList.remove(CSS_CLASSES.HIDDEN);
            }
        }

        // Update watchlist trigger text
        const triggerText = modal.querySelector('#watchlistTriggerText');
        if (triggerText) {
            const selectedNames = [];
            modal.querySelectorAll('input[name="watchlist"]:checked').forEach(cb => {
                const row = cb.closest(`.${CSS_CLASSES.WATCHLIST_ROW}`);
                const name = row?.querySelector(`.${CSS_CLASSES.WATCHLIST_NAME}`)?.textContent;
                if (name) selectedNames.push(name);
            });
            triggerText.textContent = selectedNames.length > 0 ? selectedNames.join(', ') : 'Select Watchlists...';
        }

        // 6. Re-run validation (should now pass since it's the same code being edited)
        this._validateForm(modal);

        // 7. Toast feedback
        ToastManager.info(`${existingShare.shareName} already in watchlist. Now editing...`);
    }

    /**
     * Generates the Modal DOM Element.
     */
    static _renderCleanAddShareModal(watchlists, activeWatchlistIds, shareData = null) {
        // Cleanup existing
        const existingModal = document.getElementById(IDS.ADD_SHARE_MODAL);
        if (existingModal) existingModal.remove();

        // HARDENING 1: Ensure all IDs are strings
        const rawMemberships = Array.isArray(activeWatchlistIds) ? activeWatchlistIds : [activeWatchlistIds];
        const stringMemberships = rawMemberships.map(id => String(id));

        // HARDENING 2: Filter Ghost IDs (IDs that are not in the valid watchlists map)
        // This prevents "2 Selected" label when only 1 checkbox is visible
        const validWatchlistIds = new Set(Object.values(watchlists).map(w => String(w.id)));
        const currentMemberships = stringMemberships.filter(id => validWatchlistIds.has(id));
        const modal = document.createElement('div');
        modal.id = IDS.ADD_SHARE_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}`;

        // Determine Title: If we have shareData and are recovering (implied by content), call it "Edit Share"
        // Logic: Add Mode usually implies no shareData.id. 
        // But Ghost Shares also have no ID.
        // So if shareData.shareName (or code) exists, we treat it as "Edit Share" for the title.
        let modalTitle = 'Add Share';
        const hasCode = shareData && (shareData.shareName || shareData.code);
        const hasId = shareData && shareData.id;

        if (hasId) {
            modalTitle = 'Edit Share';
        } else if (hasCode && currentMemberships.length > 0) {
            // "Ghost Share Recovery" - treating as edit
            modalTitle = 'Edit Share';
        }

        // Watchlist Rows
        const watchlistRows = Object.values(watchlists).map(wl => {
            if (wl.id === 'cash_assets_id' || wl.id === 'all_shares_id') return '';

            // STRICT STRING COMPARISON
            const wIdStr = String(wl.id);
            const isChecked = currentMemberships.includes(wIdStr);

            const rowClass = isChecked ? `${CSS_CLASSES.WATCHLIST_ROW} ${CSS_CLASSES.SELECTED}` : CSS_CLASSES.WATCHLIST_ROW;
            const checkState = isChecked ? 'checked' : '';
            return `
                <div class="${rowClass}">
                    <span class="${CSS_CLASSES.WATCHLIST_NAME}">${wl.name}</span>
                    <div class="radio-check"></div>
                    <input type="checkbox" name="watchlist" value="${wl.id}" ${checkState}>
                </div>
            `;
        }).join('');

        const primaryId = currentMemberships[0];
        // Use filtered specific ID to look up name
        const activeName = Object.values(watchlists).find(w => String(w.id) === primaryId)?.name || 'Select Watchlists...';
        const initialLabel = currentMemberships.length > 0 ? (currentMemberships.length === 1 ? activeName : `${currentMemberships.length} Selected`) : 'Select Watchlists...';

        // Check if this is an EDIT (existing record) or ADD (new record, possibly pre-filled)
        const isEdit = shareData && shareData.id;

        // Use modalTitle derived earlier (covers Ghost Share Recovery case)
        const headerTitleText = modalTitle || (isEdit ? 'Edit Share' : 'Add Share');

        // Note: Pre-filling values would happen here if shareData is provided. 
        // For brevity/focus on refactor, I will assume empty state or simple pre-fill logic if needed.

        // Determine Initial Subtitle (Company Name)
        let initialSubtitle = 'Enter share details';
        if (shareData) {
            if (shareData.title) {
                initialSubtitle = shareData.title;
            } else if (shareData.shareName && AppState.livePrices.has(shareData.shareName)) {
                initialSubtitle = AppState.livePrices.get(shareData.shareName).name || 'Enter share details';
            }
        }

        // Initialize Visibility: Holdings is ALWAYS visible (Locked if not in Portfolio)
        const isPortfolioMember = currentMemberships.includes(PORTFOLIO_ID);

        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} modal-content-medium" style="height: 85vh; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden !important; gap: 0 !important;">
                <input type="hidden" id="shareId" value="${shareData?.id || ''}">
                <input type="hidden" id="originalShareName" value="${shareData?.shareName || ''}">
                
                <!-- HEADER (FIXED via flexbox) -->
                <div class="${CSS_CLASSES.MODAL_HEADER}" style="flex-shrink: 0;">
                    <div style="width: 100%;">
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}">${headerTitleText}</h2>
                        <div id="${IDS.MODAL_SUBTITLE}" class="${CSS_CLASSES.MODAL_SUBTITLE}">${initialSubtitle}</div>
                    </div>
                    <div class="${CSS_CLASSES.MODAL_ACTIONS}" style="align-self: flex-start;">
                        <button id="${IDS.DELETE_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.DELETE_BTN} ${CSS_CLASSES.HIDDEN}" title="Delete">
                            <i class="fas ${UI_ICONS.DELETE}"></i>
                        </button>
                        <button id="${IDS.SAVE_BTN}" class="${CSS_CLASSES.MODAL_ACTION_BTN} ${CSS_CLASSES.SAVE_BTN} ${CSS_CLASSES.GHOSTED}" title="Save" disabled>
                            <i class="fas ${UI_ICONS.SAVE}"></i>
                        </button>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                            <i class="fas ${UI_ICONS.CLOSE}"></i>
                        </button>
                    </div>
                </div>
                
                <div id="modalLiveStats" class="${CSS_CLASSES.MODAL_STATS_HEADER} ${CSS_CLASSES.HIDDEN}" style="flex-shrink: 0;"></div>

                <!-- SCROLLABLE BODY -->
                <div class="${CSS_CLASSES.MODAL_BODY}" style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div class="${CSS_CLASSES.ACCORDION}">
                        
                        <div class="${CSS_CLASSES.ACCORDION_ITEM} ${CSS_CLASSES.ACTIVE}" data-section="core">
                            <div class="${CSS_CLASSES.ACCORDION_HEADER}">
                                <span>Core Info</span>
                                <i class="fas ${UI_ICONS.CHEVRON_DOWN}"></i>
                            </div>
                            <div class="${CSS_CLASSES.ACCORDION_CONTENT}">
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.SHARE_NAME}">Share Code / Name</label>
                                    <div class="${CSS_CLASSES.INPUT_WRAPPER}" style="position: relative;">
                                        <input type="text" id="${IDS.SHARE_NAME}" placeholder="e.g. CBA" class="${CSS_CLASSES.FORM_CONTROL} uppercase-input" value="${shareData?.shareName || ''}" autocomplete="off">
                                        <ul id="${IDS.SUGGESTION_LIST}" class="${CSS_CLASSES.SUGGESTION_LIST} ${CSS_CLASSES.HIDDEN}"></ul>
                                    </div>
                                    <div id="${IDS.PRICE_PREVIEW_PANEL}" class="${CSS_CLASSES.PRICE_PREVIEW} ${CSS_CLASSES.HIDDEN}" style="margin-top: 25px;"></div>
                                </div>
                                
                                <div class="${CSS_CLASSES.FORM_GROUP} ${CSS_CLASSES.FORM_GROUP_RELATIVE}">
                                    <label>Watchlists</label>
                                    <div class="${CSS_CLASSES.WATCHLIST_TRIGGER}" id="${IDS.WATCHLIST_TRIGGER}">
                                        <span class="${CSS_CLASSES.WATCHLIST_TRIGGER_TEXT}" id="watchlistTriggerText">${initialLabel}</span>
                                        <i class="fas ${UI_ICONS.CHEVRON_DOWN} ${CSS_CLASSES.WATCHLIST_TRIGGER_ICON}"></i>
                                    </div>
                                    <div class="${CSS_CLASSES.WATCHLIST_DROPDOWN}" id="${IDS.WATCHLIST_DROPDOWN}">
                                        ${watchlistRows}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="${CSS_CLASSES.ACCORDION_ITEM}" data-section="holdings" id="holdingsAccordionItem">
                            <div class="${CSS_CLASSES.ACCORDION_HEADER}">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <span>Holdings</span>
                                    <span class="unlock-hint ${isPortfolioMember ? CSS_CLASSES.HIDDEN : ''}" style="font-size: 0.7em; color: var(--text-muted); opacity: 0.8;">Select Portfolio to unlock</span>
                                </div>
                                <i class="fas ${isPortfolioMember ? UI_ICONS.CHEVRON_DOWN : UI_ICONS.LOCK}"></i>
                            </div>
                            <div class="${CSS_CLASSES.ACCORDION_CONTENT}">
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.PORTFOLIO_SHARES}">Units Held</label>
                                    <input type="number" id="${IDS.PORTFOLIO_SHARES}" step="1" class="${CSS_CLASSES.FORM_CONTROL}" placeholder="0" value="${shareData?.portfolioShares || ''}">
                                </div>
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.PORTFOLIO_AVG_PRICE}">Average Cost Price ($)</label>
                                    <input type="number" id="${IDS.PORTFOLIO_AVG_PRICE}" step="0.01" class="${CSS_CLASSES.FORM_CONTROL}" placeholder="0.00" value="${shareData?.portfolioAvgPrice || ''}">
                                </div>
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.SHARE_SIGHT_CODE}">Sharesight Code <span class="${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.ITALIC}" style="font-size: 0.8em;">(Optional)</span></label>
                                    <input type="text" id="${IDS.SHARE_SIGHT_CODE}" class="${CSS_CLASSES.FORM_CONTROL} validate-trigger" placeholder="e.g. 12345" value="${shareData?.shareSightCode || ''}">
                                </div>
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.SHARE_REGISTRY}">Share Registry <span class="${CSS_CLASSES.TEXT_MUTED} ${CSS_CLASSES.ITALIC}" style="font-size: 0.8em;">(Optional)</span></label>
                                    <select id="${IDS.SHARE_REGISTRY}" class="${CSS_CLASSES.FORM_CONTROL}" style="color: black !important;">
                                        <option value="" style="color: black !important;">Select Registry...</option>
                                        ${REGISTRY_OPTIONS.map(opt => `<option value="${opt}" ${shareData?.shareRegistry === opt ? 'selected' : ''} style="color: black !important;">${opt}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.PURCHASE_DATE}">Last Purchase</label>
                                    <input type="${shareData?.purchaseDate || shareData?.entryDate ? 'date' : 'text'}" 
                                           id="${IDS.PURCHASE_DATE}" 
                                           class="${CSS_CLASSES.FORM_CONTROL}" 
                                           style="pointer-events: auto !important; position: relative; z-index: 10;"
                                           placeholder="e.g. 24/12/2025"
                                           value="${this._normalizeDateForInput(shareData?.purchaseDate || shareData?.entryDate)}"
                                           onfocus="(this.type='date')"
                                           onblur="if(!this.value)this.type='text'">
                                </div>
                            </div>
                        </div>

                        <div class="${CSS_CLASSES.ACCORDION_ITEM}" data-section="target">
                            <div class="${CSS_CLASSES.ACCORDION_HEADER}">
                                <span>Target &amp; Rating</span>
                                <i class="fas ${UI_ICONS.CHEVRON_DOWN}"></i>
                            </div>
                            <div class="${CSS_CLASSES.ACCORDION_CONTENT}">
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label>Rating</label>
                                    <div class="${CSS_CLASSES.STAR_RATING}" id="${IDS.STAR_RATING_CONTROL}">
                                        ${[1, 2, 3, 4, 5].map(i => `
                                            <i class="fas fa-star star-item ${shareData?.starRating >= i ? CSS_CLASSES.ACTIVE : ''}" data-value="${i}"></i>
                                        `).join('')}
                                    </div>
                                    <input type="hidden" id="${IDS.STAR_RATING_INPUT}" value="${shareData?.starRating || 0}">
                                </div>

                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.TARGET_PRICE}">Target Price ($)</label>
                                    <input type="number" id="${IDS.TARGET_PRICE}" step="0.01" class="${CSS_CLASSES.FORM_CONTROL}" placeholder="0.00" value="${shareData?.targetPrice || ''}">
                                </div>

                                <div class="${CSS_CLASSES.TOGGLE_ROW}">
                                    <div class="${CSS_CLASSES.TOGGLE_GROUP}">
                                        <span class="toggle-label">Strategy</span>
                                        <div class="${CSS_CLASSES.SEGMENTED_TOGGLE}" id="${IDS.BUY_SELL_CONTROL}">
                                            <div class="${CSS_CLASSES.TOGGLE_OPTION} ${(!shareData?.buySell || shareData.buySell === 'buy') ? CSS_CLASSES.ACTIVE : ''}" data-value="buy">Buy</div>
                                            <div class="${CSS_CLASSES.TOGGLE_OPTION} ${(shareData?.buySell === 'sell') ? CSS_CLASSES.ACTIVE : ''}" data-value="sell">Sell</div>
                                        </div>
                                        <input type="hidden" id="${IDS.BUY_SELL_INPUT}" value="${shareData?.buySell || 'buy'}">
                                    </div>
                                    <div class="${CSS_CLASSES.TOGGLE_GROUP}">
                                        <span class="toggle-label">Direction</span>
                                        <div class="${CSS_CLASSES.SEGMENTED_TOGGLE}" id="${IDS.TARGET_DIRECTION_CONTROL}">
                                            <div class="${CSS_CLASSES.TOGGLE_OPTION} ${(shareData?.targetDirection === 'above') ? CSS_CLASSES.ACTIVE : ''}" data-value="above">Above</div>
                                            <div class="${CSS_CLASSES.TOGGLE_OPTION} ${(!shareData?.targetDirection || shareData.targetDirection === 'below') ? CSS_CLASSES.ACTIVE : ''}" data-value="below">Below</div>
                                        </div>
                                        <input type="hidden" id="${IDS.TARGET_DIRECTION_INPUT}" value="${shareData?.targetDirection || 'below'}">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="${CSS_CLASSES.ACCORDION_ITEM}" data-section="dividends">
                            <div class="${CSS_CLASSES.ACCORDION_HEADER}">
                                <span>Dividends</span>
                                <i class="fas ${UI_ICONS.CHEVRON_DOWN}"></i>
                            </div>
                            <div class="${CSS_CLASSES.ACCORDION_CONTENT}">
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.DIVIDEND_AMOUNT}">Dividend Amount ($)</label>
                                    <input type="number" id="${IDS.DIVIDEND_AMOUNT}" step="0.01" class="${CSS_CLASSES.FORM_CONTROL}" placeholder="0.00" value="${shareData?.dividendAmount || ''}">
                                </div>
                                <div class="${CSS_CLASSES.FORM_GROUP}">
                                    <label for="${IDS.FRANKING_CREDITS}">Franking Credits (%)</label>
                                    <input type="number" id="${IDS.FRANKING_CREDITS}" step="1" class="${CSS_CLASSES.FORM_CONTROL}" placeholder="100%" value="${shareData?.frankingCredits || ''}">
                                </div>
                            </div>
                        </div>

                        <div class="${CSS_CLASSES.ACCORDION_ITEM}" data-section="notes">
                            <div class="${CSS_CLASSES.ACCORDION_HEADER}">
                                <span>Notes</span>
                                <i class="fas ${UI_ICONS.CHEVRON_DOWN}"></i>
                            </div>
                            <div class="${CSS_CLASSES.ACCORDION_CONTENT} ${CSS_CLASSES.NOTES_DARK_BG}">
                                <div id="${IDS.DYNAMIC_COMMENTS_AREA}"></div>
                                <div class="${CSS_CLASSES.NOTES_FOOTER}">
                                    <button type="button" id="${IDS.BTN_ADD_COMMENT}" class="${CSS_CLASSES.BTN_ADD_SIMPLE}" title="Add Note">
                                        <i class="fas ${UI_ICONS.ADD}"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        // Bind Close Events
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);

        const close = () => {
            // Detach keyboard handler before closing
            KeyboardModalHandler.detach();

            modal.classList.add(CSS_CLASSES.HIDDEN);
            setTimeout(() => modal.remove(), 300);

            // Remove from history stack if closed manually
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        // Register with NavigationManager
        modal._navActive = true;
        navManager.pushState(() => {
            if (modal.parentElement) { // Check if modal is still in DOM
                modal._navActive = false;
                close();
            }
        });

        closeBtn?.addEventListener('click', close);
        overlay?.addEventListener('click', close);

        // Attach keyboard handler for Android keyboard visibility
        KeyboardModalHandler.attach(modal);

        return modal;
    }

    static _bindAccordion(modal) {
        const headers = modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_HEADER}`);
        const modalBody = modal.querySelector(`.${CSS_CLASSES.MODAL_BODY}`);

        headers.forEach(header => {
            header.addEventListener('click', () => {
                const item = header.parentElement;

                // PREVENT EXPANSION if locked (Holdings only)
                if (item.id === 'holdingsAccordionItem' && item.querySelector(`.${UI_ICONS.LOCK}`)) {
                    ToastManager.info("Select 'Portfolio' above to unlock holdings.");
                    return;
                }

                const wasOpen = item.classList.contains(CSS_CLASSES.ACTIVE);

                // Close all sections first
                modal.querySelectorAll(`.${CSS_CLASSES.ACCORDION_ITEM}`).forEach(i => i.classList.remove(CSS_CLASSES.ACTIVE));

                // Open clicked section if it wasn't already open
                if (!wasOpen) {
                    item.classList.add(CSS_CLASSES.ACTIVE);

                    // Auto-scroll to the opened accordion section (just below the fixed header)
                    // Use a delay to ensure the accordion content is fully expanded
                    setTimeout(() => {
                        if (modalBody) {
                            // Calculate scroll position: accordion item's offset within the modal body
                            const itemTop = item.offsetTop;
                            modalBody.scrollTo({
                                top: itemTop,
                                behavior: 'smooth'
                            });
                        }
                    }, 50);
                }
            });
        });
    }

    static _bindWatchlistDropdown(modal) {
        const trigger = modal.querySelector(`#${IDS.WATCHLIST_TRIGGER}`);
        const dropdown = modal.querySelector(`#${IDS.WATCHLIST_DROPDOWN}`);
        const text = modal.querySelector('#watchlistTriggerText');
        const checkboxes = modal.querySelectorAll('input[name="watchlist"]');

        if (!trigger) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle(CSS_CLASSES.SHOW);
        });

        modal.addEventListener('click', () => dropdown.classList.remove(CSS_CLASSES.SHOW));

        // BIND ROW CLICKS (Confirmation Logic for Portfolio Deselection)
        const rows = modal.querySelectorAll(`.${CSS_CLASSES.WATCHLIST_ROW}`);
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                const cb = row.querySelector('input');
                if (!cb) return;

                // 1. CONFIRMATION GATE: If deselecting Portfolio while data exists
                if (cb.value === PORTFOLIO_ID && cb.checked) {
                    const units = modal.querySelector(`#${IDS.PORTFOLIO_SHARES}`)?.value;
                    const price = modal.querySelector(`#${IDS.PORTFOLIO_AVG_PRICE}`)?.value;

                    // If there's any data, warn the user
                    if ((units && parseFloat(units) !== 0) || (price && parseFloat(price) !== 0)) {
                        if (!confirm("Are you sure? Deselecting 'Portfolio' will permanently clear all Units and Price data for this share.")) {
                            e.stopPropagation();
                            return;
                        }
                    }
                }

                // 2. TOGGLE STATE
                cb.checked = !cb.checked;
                row.classList.toggle(CSS_CLASSES.SELECTED, cb.checked);

                // 3. TRIGGER UPDATE / TERMINAL ACTION
                cb.dispatchEvent(new Event('change'));

                // NEW: TERMINAL ACTION SUPPORT
                // If unchecking Portfolio was confirmed, trigger save immediately
                // to satisfy "that should be the end of it" and avoid redundant Save clicks.
                if (!cb.checked && cb.value === PORTFOLIO_ID) {
                    // Extract data (allowing empty watchlists via suppressToasts=true)
                    const data = ShareFormUI._extractShareData(modal, true);
                    if (data && modal._onSave) {
                        // TERMINATE: Auto-Save
                        modal._onSave(data);
                        // Close modal immediately for UX
                        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`)?.click();
                        return; // Stop further processing after terminal action
                    }
                }

                e.stopPropagation();
            });
        });

        checkboxes.forEach(cb => {
            // Prevent double-toggling when clicking the checkbox/label directly
            cb.addEventListener('click', (e) => e.stopPropagation());

            cb.addEventListener('change', () => {
                const selected = Array.from(checkboxes)
                    .filter(c => c.checked)
                    .map(c => c.closest(`.${CSS_CLASSES.WATCHLIST_ROW}`).querySelector(`.${CSS_CLASSES.WATCHLIST_NAME}`).innerText);

                if (selected.length === 0) text.innerText = "Select Watchlists...";
                else text.innerText = selected.join(', ');

                // TOGGLE HOLDINGS visibility/state based on Portfolio selection
                const isPortfolioChecked = Array.from(checkboxes).some(c => c.value === PORTFOLIO_ID && c.checked);
                const holdingsSection = modal.querySelector('#holdingsAccordionItem');

                if (holdingsSection) {
                    const headerIcon = holdingsSection.querySelector(`.${CSS_CLASSES.ACCORDION_HEADER} i`);
                    const hintText = holdingsSection.querySelector('.unlock-hint');

                    if (isPortfolioChecked) {
                        // UNLOCK ONLY (Do not auto-expand or scroll)
                        if (headerIcon) {
                            headerIcon.className = `fas ${UI_ICONS.CHEVRON_DOWN}`;
                        }
                        if (hintText) hintText.classList.add(CSS_CLASSES.HIDDEN);
                    } else {
                        // LOCK & COLLAPSE
                        holdingsSection.classList.remove(CSS_CLASSES.ACTIVE);
                        if (headerIcon) {
                            headerIcon.className = `fas ${UI_ICONS.LOCK}`;
                        }
                        if (hintText) hintText.classList.remove(CSS_CLASSES.HIDDEN);

                        // HARDENING: Clear fields when hidden to maintain dirty-check integrity
                        holdingsSection.querySelectorAll('input').forEach(input => {
                            if (input.type === 'number') input.value = '';
                            else if (input.type === 'date' || input.type === 'text') input.value = '';
                        });
                    }
                }

                // Run Validation: This correctly handles enabling/disabling the Save button
                // if they didn't trigger the terminal auto-save above.
                ShareFormUI._validateForm(modal);
            });

        });
    }

    static _bindCustomInputs(modal) {
        const setupToggle = (controlId, inputId) => {
            const control = modal.querySelector(`#${controlId}`);
            const input = modal.querySelector(`#${inputId}`);
            if (control && input) {
                control.querySelectorAll(`.${CSS_CLASSES.TOGGLE_OPTION}`).forEach(opt => {
                    opt.addEventListener('click', () => {
                        control.querySelectorAll(`.${CSS_CLASSES.TOGGLE_OPTION}`).forEach(o => o.classList.remove(CSS_CLASSES.ACTIVE));
                        opt.classList.add(CSS_CLASSES.ACTIVE);
                        input.value = opt.dataset.value;
                        ShareFormUI._validateForm(modal); // TRIGGER DIRTY CHECK
                    });
                });
            }
        };

        setupToggle(IDS.TARGET_DIRECTION_CONTROL, IDS.TARGET_DIRECTION_INPUT);
        setupToggle(IDS.BUY_SELL_CONTROL, IDS.BUY_SELL_INPUT);

        const starControl = modal.querySelector(`#${IDS.STAR_RATING_CONTROL}`);
        const starInput = modal.querySelector(`#${IDS.STAR_RATING_INPUT}`);
        if (starControl) {
            starControl.querySelectorAll(`.${CSS_CLASSES.STAR_ITEM}`).forEach(star => {
                star.addEventListener('click', () => {
                    const val = parseInt(star.dataset.value);
                    const currentVal = parseInt(starInput.value);

                    // Toggle Logic: If tapping the same star count, reset to 0
                    const newVal = (val === currentVal) ? 0 : val;

                    starInput.value = newVal;
                    starControl.querySelectorAll(`.${CSS_CLASSES.STAR_ITEM}`).forEach(s =>
                        s.classList.toggle(CSS_CLASSES.ACTIVE, parseInt(s.dataset.value) <= newVal)
                    );
                    ShareFormUI._validateForm(modal); // TRIGGER DIRTY CHECK
                });
            });
        }

        // 3. GENERIC INPUT BINDINGS (Date, Shares, Price, Dividends, etc)
        // This handles "dirty check" logic for all standard inputs not covered by specific handlers.
        // We add the 'validate-trigger' class in the HTML or just query generically here.
        const genericInputs = modal.querySelectorAll(`input:not([type="checkbox"]):not([type="hidden"]), select, textarea`);
        genericInputs.forEach(input => {
            input.addEventListener('input', () => ShareFormUI._validateForm(modal));
            input.addEventListener('change', () => ShareFormUI._validateForm(modal));
        });
    }

    static _bindCommentsLogic(modal, shareData = null) {
        const btn = modal.querySelector(`#${IDS.BTN_ADD_COMMENT}`);
        const area = modal.querySelector(`#${IDS.DYNAMIC_COMMENTS_AREA}`);

        const addNote = (existingBody = '', existingDate = '') => {
            const div = document.createElement('div');
            div.className = CSS_CLASSES.NOTE_CONTAINER;
            div.innerHTML = HTML_TEMPLATES.NOTE_INPUT;

            const textarea = div.querySelector('textarea');
            if (textarea) {
                if (existingBody) textarea.value = existingBody;
                if (existingDate) textarea.dataset.date = existingDate;
            }

            area.appendChild(div);
            // Trigger Dirty Check when adding a note
            if (modal) ShareFormUI._validateForm(modal);

            // Bind listener to the textarea for content changes
            const newTextarea = div.querySelector('textarea');
            if (newTextarea) {
                newTextarea.addEventListener('input', () => ShareFormUI._validateForm(modal));
            }
        };

        if (btn) btn.addEventListener('click', () => addNote());

        // Pre-fill existing comments
        if (shareData && shareData.comments && shareData.comments.length > 0) {
            shareData.comments.forEach(c => addNote(c.body, c.date));
        }

        // Auto-add one if entirely empty (new or blank edit)
        if (area && area.children.length === 0) addNote();
    }

    static _bindSearchEvents(modal) {
        const input = modal.querySelector(`#${IDS.SHARE_NAME}`);
        const list = modal.querySelector(`#${IDS.SUGGESTION_LIST}`);
        const preview = modal.querySelector(`#${IDS.PRICE_PREVIEW_PANEL}`);
        const saveBtn = modal.querySelector(`#${IDS.SAVE_BTN}`); // Restore reference

        if (!input) return;

        let debounceTimer;

        // INPUT: Dispatch Request & Validate
        input.addEventListener('input', () => {
            const query = input.value.trim().toUpperCase();

            // 1. Run Validation (Includes Duplicate Check)
            ShareFormUI._validateForm(modal);

            // 2. Duplicate Detection - Switch to Edit Mode (Re-Mount)
            if (query.length >= 3) {
                const currentData = modal._shareData;
                const duplicateShare = ShareFormUI._checkDuplicate(query, currentData?.id);

                if (duplicateShare) {
                    // Prevent spam: Only convert if this code wasn't already processed
                    if (modal._lastToastCode !== query) {
                        modal._lastToastCode = query;

                        // Inform user and dispatch edit request (Instant Re-Mount)
                        ToastManager.info(`${query} already exists.Switching to edit mode...`);

                        document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_EDIT_SHARE, {
                            detail: { id: duplicateShare.id, code: query, instant: true }
                        }));
                    }
                    return; // Stop further processing
                } else {
                    // Reset if it's no longer a duplicate
                    modal._lastToastCode = null;
                }
            } else {
                modal._lastToastCode = null;
            }

            // Clear previous states
            list.classList.add(CSS_CLASSES.HIDDEN);
            if (query.length === 0) preview.classList.add(CSS_CLASSES.HIDDEN);

            clearTimeout(debounceTimer);

            if (query.length < 2) return;

            debounceTimer = setTimeout(() => {
                // Dispatch Search Request
                const event = new CustomEvent(EVENTS.REQUEST_SYMBOL_SEARCH, { detail: { query } });
                document.dispatchEvent(event);
            }, 300);
        });

        // BLUR: Hide list (delayed to allow clicks)
        input.addEventListener('blur', () => {
            setTimeout(() => list.classList.add(CSS_CLASSES.HIDDEN), 200);
        });

        // FOCUS: Reshow list if valid
        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 2 && list.children.length > 0) {
                list.classList.remove(CSS_CLASSES.HIDDEN);
            }
        });
    }

    static _bindSearchResults(modal) {
        const list = modal.querySelector(`#${IDS.SUGGESTION_LIST}`);
        const input = modal.querySelector(`#${IDS.SHARE_NAME}`);

        document.addEventListener(EVENTS.UPDATE_SEARCH_RESULTS, (e) => {
            // Ensure we are acting on the open modal
            if (!document.contains(list)) return;

            const { results } = e.detail;
            list.innerHTML = '';

            if (!results || results.length === 0) {
                list.classList.add(CSS_CLASSES.HIDDEN);
                return;
            }

            results.forEach(item => {
                const li = document.createElement('li');
                li.className = CSS_CLASSES.SUGGESTION_ITEM;

                // Match SearchDiscoveryUI structure exactly
                const code = item.code || item;
                const displayName = item.name || '';

                li.innerHTML = `
                    <div style="font-weight: bold;">${code}</div>
                    <div style="font-size: 0.9rem; color: var(--text-muted);">${displayName}</div>
                `;

                li.addEventListener('click', () => {
                    input.value = code;

                    // CRITICAL FIX: Clean up Dropdown completely to prevent "Zombie" re-open on focus
                    list.classList.add(CSS_CLASSES.HIDDEN);
                    list.innerHTML = '';

                    // Check duplicate immediately on selection - Switch to Edit Mode (Re-Mount)
                    const currentData = modal._shareData;
                    const duplicateShare = ShareFormUI._checkDuplicate(code, currentData?.id);

                    if (duplicateShare) {
                        // Inform user and dispatch edit request (Instant Re-Mount)
                        ToastManager.info(`${code} already exists.Switching to edit mode...`);

                        document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_EDIT_SHARE, {
                            detail: { id: duplicateShare.id, code: code, instant: true }
                        }));
                        return; // Stop further processing
                    }

                    modal._lastToastCode = null;

                    // Run Validation
                    ShareFormUI._validateForm(modal);

                    // Show Loading Spinner in Preview Panel
                    const preview = modal.querySelector('#pricePreviewPanel');
                    if (preview) {
                        preview.classList.remove(CSS_CLASSES.HIDDEN);
                        preview.innerHTML = `
                            <div style="display: flex; justify-content: center; align-items: center; min-height: 80px; width: 100%;">
                                <i class="fas ${UI_ICONS.SPINNER}" style="font-size: 1.5rem; color: var(--text-muted);"></i>
                            </div>
                        `;
                    }

                    // Dispatch Price Request immediately on selection
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_LIVE_PRICE, { detail: { code } }));
                });
                list.appendChild(li);
            });

            list.classList.remove(CSS_CLASSES.HIDDEN);
        });
    }

    static _bindPreviewUpdate(modal) {
        const panel = modal.querySelector(`#${IDS.PRICE_PREVIEW_PANEL}`);
        const subtitle = modal.querySelector(`#${IDS.MODAL_SUBTITLE}`);

        document.addEventListener(EVENTS.UPDATE_MODAL_PREVIEW, (e) => {
            // Ensure we are acting on the open modal
            if (!document.contains(panel)) return;

            const { data } = e.detail;
            if (!data) {
                panel.classList.add(CSS_CLASSES.HIDDEN);
                if (subtitle) subtitle.textContent = '';
                return;
            }

            // Update Header Subtitle
            if (subtitle && data.name) {
                subtitle.textContent = data.name;
            }

            // Row 1: Price and Change
            const isPos = data.change >= 0;
            const colorClass = isPos ? CSS_CLASSES.PREVIEW_CHANGE_POS : CSS_CLASSES.PREVIEW_CHANGE_NEG;

            // Fix Double Plus Issue: Color indicates direction, no sign needed
            let pctStr = formatPercent(data.pctChange);

            // Format Change Value
            let changeStr = formatCurrency(data.change);

            const row1 = `
                <div class="${CSS_CLASSES.PREVIEW_ROW_MAIN}">
                    <span class="preview-price">${formatCurrency(data.live)}</span>
                    <span class="preview-change ${colorClass}">
                        ${changeStr} (${pctStr})
                    </span>
                </div>
            `;

            // Row 2: Stats (Real Data)
            // Use '-' if 0/null/undefined, otherwise format to 2 decimals or currency
            const high = data.high ? formatCurrency(data.high) : '-';
            const low = data.low ? formatCurrency(data.low) : '-';
            const pe = data.pe ? data.pe.toFixed(2) : '-';

            const row2 = `
                <div class="${CSS_CLASSES.PREVIEW_ROW_SUB}">
                    <div class="${CSS_CLASSES.STAT_COL}">
                        <span class="${CSS_CLASSES.STAT_LABEL}">52W Low</span>
                        <span class="${CSS_CLASSES.STAT_VAL}">${low}</span>
                    </div>
                    <div class="${CSS_CLASSES.STAT_COL}">
                        <span class="${CSS_CLASSES.STAT_LABEL}">52W High</span>
                        <span class="${CSS_CLASSES.STAT_VAL}">${high}</span>
                    </div>
                    <div class="${CSS_CLASSES.STAT_COL}">
                        <span class="${CSS_CLASSES.STAT_LABEL}">P/E Ratio</span>
                        <span class="${CSS_CLASSES.STAT_VAL}">${pe}</span>
                    </div>
                </div>
            `;

            panel.innerHTML = row1 + row2;
            panel.classList.remove(CSS_CLASSES.HIDDEN);
        });
    }

    static _extractShareData(modal, suppressToasts = false) {
        const getVal = (id) => modal.querySelector(`#${id}`)?.value.trim();
        const getNum = (id) => {
            const val = modal.querySelector(`#${id}`)?.value || '';
            // Strip any currency symbols or commas just in case
            const cleaned = String(val).replace(/[$,]/g, '').trim();
            return parseFloat(cleaned) || 0;
        };

        const code = getVal(IDS.SHARE_NAME).toUpperCase();
        if (!code) {
            if (!suppressToasts) ToastManager.error(USER_MESSAGES.VALIDATION_CODE);
            return null;
        }

        const selectedWatchlists = [...modal.querySelectorAll('input[name="watchlist"]:checked')].map(cb => cb.value);
        if (selectedWatchlists.length === 0 && !suppressToasts) {
            ToastManager.error("Please select at least one watchlist.");
            return null;
        }

        // Check Duplicate (Toast on Save Attempt)
        const currentData = modal._shareData; // Data attached during render

        let isDuplicate = null;
        // SKIP check if editing the same share code (Case Insensitive)
        if (currentData && (currentData.shareName || '').toUpperCase() === code) {
            isDuplicate = null;
        } else {
            isDuplicate = this._checkDuplicate(code, currentData?.id);
        }

        if (isDuplicate) {
            if (!suppressToasts) ToastManager.error(USER_MESSAGES.SHARE_DUPLICATE.replace('{0}', code));
            return null;
        }

        const comments = [];
        modal.querySelectorAll(`.${CSS_CLASSES.NOTE_CONTAINER} textarea`).forEach(txt => {
            if (txt.value.trim()) {
                comments.push({
                    body: txt.value.trim(),
                    date: txt.dataset.date || new Date().toISOString()
                });
            }
        });
        const rawId = getVal('shareId');
        const dataId = currentData?.id;
        const resolvedId = rawId || dataId || null;
        const payload = {
            id: resolvedId, // CRITICAL: Preserve ID for Updates vs Creates
            shareName: code,
            originalShareName: getVal('originalShareName') || currentData?.shareName || null,
            targetPrice: getNum(IDS.TARGET_PRICE),
            targetDirection: getVal(IDS.TARGET_DIRECTION_INPUT) || 'below',
            buySell: getVal(IDS.BUY_SELL_INPUT) || 'buy',
            starRating: parseInt(getVal(IDS.STAR_RATING_INPUT)) || 0,
            portfolioShares: getNum(IDS.PORTFOLIO_SHARES),
            portfolioAvgPrice: getNum(IDS.PORTFOLIO_AVG_PRICE),
            shareSightCode: getVal(IDS.SHARE_SIGHT_CODE) || '',
            shareRegistry: getVal(IDS.SHARE_REGISTRY) || '',
            purchaseDate: getVal(IDS.PURCHASE_DATE) || '',
            entryDate: getVal(IDS.PURCHASE_DATE) || '', // Keep for legacy compatibility
            dividendAmount: getNum(IDS.DIVIDEND_AMOUNT),
            frankingCredits: getNum(IDS.FRANKING_CREDITS),
            unfrankedYield: getNum(IDS.UNFRANKED_YIELD),
            frankedYield: getNum(IDS.FRANKED_YIELD),
            comments: comments,
            watchlists: selectedWatchlists
        };
        return payload;
    }
}
