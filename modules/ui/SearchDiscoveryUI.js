import { UI_ICONS, CSS_CLASSES, RESEARCH_LINKS_TEMPLATE, IDS, EVENTS } from '../utils/AppConstants.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * SearchDiscoveryUI.js
 * Manages the "Stage 1" Discovery Modal.
 * Allows users to search, research, and then initiate the "Add Share" workflow.
 */
export class SearchDiscoveryUI {

    static showModal(initialQuery = null) {
        const existing = document.getElementById(IDS.DISCOVERY_MODAL);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = IDS.DISCOVERY_MODAL;
        modal.className = `${CSS_CLASSES.MODAL} ${CSS_CLASSES.SHOW}`;
        modal.innerHTML = `
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT} modal-content-medium" style="max-height: 85vh; display: flex; flex-direction: column;">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <div>
                        <h2 class="${CSS_CLASSES.MODAL_TITLE}"><i class="fas fa-search-dollar"></i> Search & Research</h2>
                        <div class="${CSS_CLASSES.MODAL_SUBTITLE}">Find and analyze stocks before adding</div>
                    </div>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN} ${CSS_CLASSES.MODAL_ACTION_BTN}" title="Close">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>

                <div class="${CSS_CLASSES.MODAL_BODY}" style="padding: 1rem; overflow: hidden; display: flex; flex-direction: column;">
                    <!-- SEARCH INPUT AREA -->
                    <div class="${CSS_CLASSES.DISCOVERY_SEARCH_AREA}" style="margin-bottom: 1rem;">
                        <input type="text" id="${IDS.DISCOVERY_SEARCH_INPUT}" class="${CSS_CLASSES.FORM_CONTROL}" placeholder="Search by Code or Name (e.g. CBA, BHP)..." autocomplete="off" style="font-size: 1.1rem; padding: 12px;">
                    </div>

                    <!-- TWO PANE LAYOUT -->
                    <div class="${CSS_CLASSES.DISCOVERY_INTERFACE}" id="discoveryInterface" style="flex: 1; overflow-y: auto; position: relative;">
                        <!-- RESULT LIST -->
                        <ul id="${IDS.DISCOVERY_RESULT_LIST}" class="${CSS_CLASSES.DISCOVERY_LIST} ${CSS_CLASSES.HIDDEN}"></ul>

                        <!-- DETAIL VIEW -->
                        <div id="${IDS.DISCOVERY_DETAIL_VIEW}" class="${CSS_CLASSES.DISCOVERY_DETAIL} ${CSS_CLASSES.HIDDEN}"></div>
                        
                        <!-- EMPTY STATE -->
                        <div id="${IDS.DISCOVERY_EMPTY_STATE}" class="${CSS_CLASSES.EMPTY_STATE}">
                            <i class="fas fa-search" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem;"></i>
                            <p>Enter a code to begin research.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Binds
        this._bindEvents(modal);

        // Autofocus & Auto-Search
        setTimeout(() => {
            const input = modal.querySelector(`#${IDS.DISCOVERY_SEARCH_INPUT}`);
            if (input) {
                input.focus();
                if (initialQuery) {
                    input.value = initialQuery;
                    modal.dataset.autoSelect = 'true'; // Enable Auto-Direct
                    // Trigger Immediate Search
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DISCOVERY_SEARCH, { detail: { query: initialQuery } }));
                }
            }
        }, 100);
    }

    static _bindEvents(modal) {
        const input = modal.querySelector(`#${IDS.DISCOVERY_SEARCH_INPUT}`);
        const list = modal.querySelector(`#${IDS.DISCOVERY_RESULT_LIST}`);
        const detail = modal.querySelector(`#${IDS.DISCOVERY_DETAIL_VIEW}`);
        const empty = modal.querySelector(`#${IDS.DISCOVERY_EMPTY_STATE}`);
        const closeBtn = modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`);
        const overlay = modal.querySelector(`.${CSS_CLASSES.MODAL_OVERLAY}`);

        const close = () => {
            modal.remove();

            // Remove from history stack if closed manually
            if (modal._navActive) {
                modal._navActive = false;
                navManager.popStateSilently();
            }
        };

        // Register with NavigationManager
        modal._navActive = true;
        navManager.pushState(() => {
            if (document.contains(modal)) {
                modal._navActive = false;
                close();
            }
        });

        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', close);

        // Input Handling
        let debounce;
        input.addEventListener('input', () => {
            const query = input.value.trim();
            clearTimeout(debounce);

            if (query.length < 2) {
                list.classList.add(CSS_CLASSES.HIDDEN);
                // Don't hide detail if we have one selected? Maybe clearing input clears detail.
                // Let's clear everything for clarity.
                detail.classList.add(CSS_CLASSES.HIDDEN);
                empty.classList.remove(CSS_CLASSES.HIDDEN);
                return;
            }

            debounce = setTimeout(() => {
                // Dispatch Search
                document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_DISCOVERY_SEARCH, { detail: { query } }));
            }, 300);
        });

        // Search Results Handler (Internal to Modal logic)
        // We need to listen to the specific event triggered by AppController
        const resultsHandler = (e) => {
            if (!document.contains(modal)) {
                document.removeEventListener(EVENTS.UPDATE_DISCOVERY_RESULTS, resultsHandler);
                return;
            }
            const { results } = e.detail;

            // AUTO-SELECT LOGIC (For Initial Query)
            let autoSelected = false;
            if (modal.dataset.autoSelect === 'true') {
                const query = input.value.trim().toUpperCase();
                const exactMatch = results.find(r => r.code === query);

                if (exactMatch) {
                    console.log(`[SearchDiscoveryUI] Auto-selecting exact match: ${exactMatch.code}`);
                    this._renderDetail(detail, exactMatch, modal);
                    list.classList.add(CSS_CLASSES.HIDDEN);
                    empty.classList.add(CSS_CLASSES.HIDDEN);
                    detail.classList.remove(CSS_CLASSES.HIDDEN);
                    autoSelected = true;
                }
                modal.dataset.autoSelect = 'false'; // Consume flag
            }

            // Normal Render if not auto-selected
            if (!autoSelected) {
                this._renderResults(list, results, (selectedStock) => {
                    this._renderDetail(detail, selectedStock, modal);
                    list.classList.add(CSS_CLASSES.HIDDEN); // Hide list after selection
                    empty.classList.add(CSS_CLASSES.HIDDEN);
                    detail.classList.remove(CSS_CLASSES.HIDDEN);
                });

                if (results.length > 0) {
                    list.classList.remove(CSS_CLASSES.HIDDEN);
                    empty.classList.add(CSS_CLASSES.HIDDEN);
                    detail.classList.add(CSS_CLASSES.HIDDEN); // Show list, hide detail
                } else {
                    list.classList.add(CSS_CLASSES.HIDDEN);
                    // Only show empty state if detail is ALSO hidden (don't clobber detail view on random typing if we decide to keep it?)
                    // Current logic: new search result = list or empty.
                    if (detail.classList.contains(CSS_CLASSES.HIDDEN)) empty.classList.remove(CSS_CLASSES.HIDDEN);
                }
            }
        };

        document.addEventListener(EVENTS.UPDATE_DISCOVERY_RESULTS, resultsHandler);
    }

    static _renderResults(listContainer, results, onSelect) {
        listContainer.innerHTML = '';
        results.forEach(item => {
            const li = document.createElement('li');
            li.className = CSS_CLASSES.DISCOVERY_ITEM;
            li.innerHTML = `
                <div style="font-weight: bold;">${item.code}</div>
                <div style="font-size: 0.9rem; color: var(--text-muted);">${item.name}</div>
            `;
            li.addEventListener('click', () => onSelect(item));
            listContainer.appendChild(li);
        });
    }

    static _renderDetail(container, stock, modal) {
        const safeVal = (v, fmt) => (v !== undefined && v !== null && v !== 0) ? fmt(v) : '-';

        // Research Links
        const linksHtml = RESEARCH_LINKS_TEMPLATE.map(link => {
            const url = link.url.replace(/\${code}/g, stock.code);
            return `
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="${CSS_CLASSES.RESEARCH_LINK_CARD}">
                    <span class="${CSS_CLASSES.LINK_TEXT}">${link.name}</span>
                    <i class="fas ${CSS_CLASSES.EXTERNAL_LINK_ALT}"></i>
                </a>
            `;
        }).join('');

        container.innerHTML = `
            <div class="${CSS_CLASSES.RICH_PREVIEW_CONTAINER}">
                 <div class="${CSS_CLASSES.DISCOVERY_HEADER_SIMPLE}" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem;">
                    <h2 class="${CSS_CLASSES.DISPLAY_TITLE}">${stock.code}</h2>
                    <span class="${CSS_CLASSES.MODAL_SUBTITLE}">${stock.name}</span>
                </div>

                <div class="${CSS_CLASSES.PREVIEW_MAIN_ROW}">
                    <span class="${CSS_CLASSES.PREVIEW_PRICE}">${formatCurrency(stock.live)}</span>
                    <span class="${CSS_CLASSES.PREVIEW_CHANGE} ${stock.change >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}">
                        ${stock.change >= 0 ? '+' : ''}${formatCurrency(stock.change)} (${formatPercent(stock.pctChange)})
                    </span>
                </div>
                
                <div class="${CSS_CLASSES.STATS_GRID}">
                    <div class="${CSS_CLASSES.STAT_ITEM}">
                        <span class="${CSS_CLASSES.STAT_LABEL}">52W Low</span>
                        <span class="${CSS_CLASSES.STAT_VALUE}">${safeVal(stock.low, formatCurrency)}</span>
                    </div>
                    <div class="${CSS_CLASSES.STAT_ITEM}">
                        <span class="${CSS_CLASSES.STAT_LABEL}">52W High</span>
                        <span class="${CSS_CLASSES.STAT_VALUE}">${safeVal(stock.high, formatCurrency)}</span>
                    </div>
                    <div class="${CSS_CLASSES.STAT_ITEM}">
                        <span class="${CSS_CLASSES.STAT_LABEL}">P/E Ratio</span>
                        <span class="${CSS_CLASSES.STAT_VALUE}">${safeVal(stock.pe, (v) => v.toFixed(2))}</span>
                    </div>
                </div>
            </div>

            <!-- ACTION BUTTON (The Handoff - Subtle Icon) -->
            <div style="display: flex; justify-content: flex-end; margin: 1rem 0;">
                <button id="discoveryAddBtn" class="${CSS_CLASSES.MODAL_ACTION_BTN}" title="Add to Watchlist" style="font-size: 1.5rem;">
                    <i class="fas ${UI_ICONS.ADD}"></i>
                </button>
            </div>

            <h4 class="${CSS_CLASSES.SECTION_TITLE}">Research Tools</h4>
            <div class="${CSS_CLASSES.RESEARCH_LINKS_GRID}">
                ${linksHtml}
            </div>
        `;

        // Bind Add Button
        const addBtn = container.querySelector('#discoveryAddBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                // REMOVED close() to allow stacking (Discovery -> Add Share)

                // Delay opening ShareForm to ensure history settles (lock safety)
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_ADD_SHARE_PREFILL, { detail: { stock } }));
                }, 150);
            });
        }
    }
}
