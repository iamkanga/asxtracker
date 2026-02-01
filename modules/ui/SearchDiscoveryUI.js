import { UI_ICONS, CSS_CLASSES, RESEARCH_LINKS_TEMPLATE, IDS, EVENTS, UI_LABELS, KANGAROO_ICON_SRC } from '../utils/AppConstants.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { AppState } from '../state/AppState.js';
import { navManager } from '../utils/NavigationManager.js';
import { ChartModal, ChartComponent } from './ChartModal.js';
import { ToastManager } from './ToastManager.js';
import { LinkHelper } from '../utils/LinkHelper.js';

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
                    modal.dataset.viewingCode = exactMatch.code;

                    this._renderDetail(detail, exactMatch, modal);
                    list.classList.add(CSS_CLASSES.HIDDEN);
                    empty.classList.add(CSS_CLASSES.HIDDEN);
                    detail.classList.remove(CSS_CLASSES.HIDDEN);
                    autoSelected = true;

                    // Trigger Live Sync
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_LIVE_PRICE, { detail: { code: exactMatch.code } }));
                }
                modal.dataset.autoSelect = 'false'; // Consume flag
            }

            // Normal Render if not auto-selected
            if (!autoSelected) {
                this._renderResults(list, results, (selectedStock) => {
                    // Update dataset for Preview sync
                    modal.dataset.viewingCode = selectedStock.code;

                    this._renderDetail(detail, selectedStock, modal);
                    list.classList.add(CSS_CLASSES.HIDDEN); // Hide list after selection
                    empty.classList.add(CSS_CLASSES.HIDDEN);
                    detail.classList.remove(CSS_CLASSES.HIDDEN);

                    // Hook up live lookup (consistent with Add Share UI)
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_LIVE_PRICE, { detail: { code: selectedStock.code } }));
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

        const previewHandler = (e) => {
            if (!document.contains(modal)) {
                document.removeEventListener(EVENTS.UPDATE_MODAL_PREVIEW, previewHandler);
                return;
            }

            const { data } = e.detail;
            if (data && data.code === modal.dataset.viewingCode) {
                // Update detail with fresh values
                this._renderDetail(detail, data, modal);
            }
        };

        document.addEventListener(EVENTS.UPDATE_DISCOVERY_RESULTS, resultsHandler);
        document.addEventListener(EVENTS.UPDATE_MODAL_PREVIEW, previewHandler);
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

        // Helper for Badges
        const renderBadges = (s) => {
            const badges = [];
            const type = (s.type || 'Share').toUpperCase();
            const industry = s.industry || s.sector || '';

            // Type Badge
            if (type === 'ETF') {
                badges.push(`<span class="badge-pill" style="background: var(--color-accent); color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">ETF</span>`);
            } else if (type === 'INDEX') {
                badges.push(`<span class="badge-pill" style="background: var(--text-muted); color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">INDEX</span>`);
            }

            // Industry Badge
            if (industry && industry !== 'Unknown') {
                badges.push(`<span class="badge-pill" style="background: rgba(128,128,128,0.1); color: var(--text-normal); font-size: 0.75rem; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <i class="fas fa-layer-group" style="margin-right:6px; font-size:0.7rem; opacity: 0.7;"></i>${industry}
                 </span>`);
            }

            if (badges.length === 0) return '';
            return `<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">${badges.join('')}</div>`;
        };

        // Research Links
        const rawLinks = AppState.preferences.researchLinks && AppState.preferences.researchLinks.length > 0
            ? AppState.preferences.researchLinks
            : RESEARCH_LINKS_TEMPLATE;

        const linksHtml = rawLinks.map(link => {
            const url = link.url.split('${code}').join(stock.code);
            let hostname = '';
            try {
                hostname = new URL(url).hostname;
            } catch (e) {
                console.warn('Invalid URL for favicon:', url);
            }
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

            return `
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="research-link-btn">
                    <img src="${faviconUrl}" class="link-favicon" alt="">
                    <div class="link-info-stack">
                        <span class="link-name">${link.displayName}</span>
                        <span class="link-desc">${link.description || ''}</span>
                    </div>
                </a>
            `;
        }).join('');

        container.innerHTML = `
            <div class="${CSS_CLASSES.RICH_PREVIEW_CONTAINER}" style="padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); background: rgba(var(--color-accent-rgb), 0.03); margin-bottom: 1.5rem;">
                <!-- Main Header Info -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                    <div style="flex: 1;">
                        <a href="https://gemini.google.com/app" target="_blank" id="gemini-discovery-link" role="link" aria-label="Ask AI Deep Dive" style="text-decoration: none; color: inherit; display: block; -webkit-touch-callout: default !important; user-select: auto !important;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div class="card-code-pill" style="background: none; border: none; padding: 0; gap: 8px; display: inline-flex; align-items: center;">
                                        <img src="https://files.marketindex.com.au/xasx/96x96-png/${stock.code.toLowerCase()}.png" class="favicon-icon" style="width: 24px; height: 24px;" onerror="this.src='${KANGAROO_ICON_SRC}'" alt="">
                                        <h2 style="font-size: 1.8rem; font-weight: 800; margin: 0; line-height: 1; letter-spacing: -0.5px; color: var(--text-color);">${stock.code}</h2>
                                    </div>
                                    <span style="display: inline-block; width: 1.5ch;"></span>
                                    <img src="gemini-icon.png" style="width: 20px; height: 20px; pointer-events: none; vertical-align: middle;">
                                </div>
                                <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 500; opacity: 0.9;">${stock.name}</span>
                            </div>
                        </a>
                        ${renderBadges(stock)}
                    </div>
                    <div style="text-align: right;">
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                             <div style="font-size: 1.6rem; font-weight: 800; line-height: 1; color: var(--text-color);">${formatCurrency(stock.live)}</div>
                             <div class="${stock.change >= 0 ? CSS_CLASSES.TEXT_POSITIVE : CSS_CLASSES.TEXT_NEGATIVE}" style="font-size: 0.9rem; font-weight: 600; margin-top: 8px;">
                                ${formatCurrency(stock.change)} (${formatPercent(stock.pctChange)})
                             </div>
                        </div>
                    </div>
                </div>

                <!-- Detailed Stats Grid -->
                <div class="${CSS_CLASSES.STATS_GRID}" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 1.5rem; padding-top: 1.2rem; border-top: none;">
                    <div class="${CSS_CLASSES.STAT_ITEM}" style="align-items: flex-start;">
                        <span class="${CSS_CLASSES.STAT_LABEL}" style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">52W Low</span>
                        <span class="${CSS_CLASSES.STAT_VALUE}" style="font-size: 0.9rem; font-weight: 700;">${safeVal(stock.low, formatCurrency)}</span>
                    </div>
                    <div class="${CSS_CLASSES.STAT_ITEM}" style="align-items: flex-start;">
                        <span class="${CSS_CLASSES.STAT_LABEL}" style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">52W High</span>
                        <span class="${CSS_CLASSES.STAT_VALUE}" style="font-size: 0.9rem; font-weight: 700;">${safeVal(stock.high, formatCurrency)}</span>
                    </div>
                    <div class="${CSS_CLASSES.STAT_ITEM}" style="align-items: flex-start;">
                        <span class="${CSS_CLASSES.STAT_LABEL}" style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">P/E Ratio</span>
                        <span class="${CSS_CLASSES.STAT_VALUE}" style="font-size: 0.9rem; font-weight: 700;">${safeVal(stock.pe, (v) => v.toFixed(2))}</span>
                    </div>
                </div>

                <!-- INLINE CHART -->
                <div id="inlineChartContainer" style="height:320px; width:100%; border-radius:8px; overflow:hidden; margin-top:1.5rem; border:1px solid var(--border-color); touch-action: pan-y;"></div>
            </div>

            <!-- ACTION BUTTONS -->
            <div style="display: flex; justify-content: center; gap: 12px; margin: 1.5rem 0;">
                <button id="discoveryAddBtn" class="${CSS_CLASSES.ICON_BTN_GHOST}" style="display: flex; align-items: center; padding: 10px 24px; font-size: 0.95rem; font-weight: 700; gap: 10px; border: 1px solid var(--color-accent); border-radius: 30px; transition: all 0.3s ease; color: var(--color-accent);">
                    <span>Add to Watchlist</span>
                    <i class="fas ${UI_ICONS.ADD}" style="font-size: 1.1rem; color: var(--color-accent);"></i>
                </button>
            </div>
            
            <div style="margin-top: 2rem;">
                <h4 id="discovery-research-manage-title" class="${CSS_CLASSES.SECTION_TITLE} clickable" style="font-weight: 700; color: var(--color-accent); border-bottom: none; display: inline-block; padding-bottom: 4px; margin-bottom: 1.5rem;">
                    Research Tools <i class="fas fa-chevron-right research-chevron"></i>
                </h4>
                <div class="research-links-grid">
                    ${linksHtml}
                </div>
            </div>
        `;

        // Bind Research Manage Title
        const researchTitle = container.querySelector('#discovery-research-manage-title');
        if (researchTitle) {
            researchTitle.addEventListener('click', () => {
                const event = new CustomEvent('REQUEST_RESEARCH_LINKS_MANAGE');
                document.dispatchEvent(event);
            });
        }

        // Instantiate Chart and wire up zoom button
        try {
            const chartArea = container.querySelector('#inlineChartContainer');
            if (chartArea) {
                const chartComp = new ChartComponent(chartArea, stock.code, stock.name);
                // Wire up the inline chart's zoom button to open ChartModal
                const zoomBtn = chartArea.querySelector(`#${IDS.CHART_ROTATOR}`);
                if (zoomBtn) {
                    zoomBtn.addEventListener('click', () => {
                        ChartModal.show(stock.code, stock.name);
                    });
                }
            }
        } catch (e) { console.error('Inline chart error', e); }

        // Bind Add Button
        const addBtn = container.querySelector('#discoveryAddBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                // Delay opening ShareForm to ensure history settles (lock safety)
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent(EVENTS.REQUEST_ADD_SHARE_PREFILL, { detail: { stock } }));
                }, 150);
            });
        }

        // Bind Chart Button
        const chartBtn = container.querySelector('#discoveryChartBtn');
        if (chartBtn) {
            chartBtn.addEventListener('click', () => {
                ChartModal.show(stock.code, stock.name);
            });
        }

        // Gemini Interaction Binding
        const geminiLink = container.querySelector('#gemini-discovery-link');
        if (geminiLink) {
            LinkHelper.bindGeminiInteraction(
                geminiLink,
                () => `Summarize the latest technical and fundamental developments for ${stock.code} on the ASX. Focus on recent price action, volume, and any relevant news or upcoming announcements. Provide a comprehensive outlook.`,
                () => {
                    const symbol = stock.code;
                    const change = stock.change || 0;
                    const sector = stock.sector || '';

                    ToastManager.show(`${UI_LABELS.ASKING_GEMINI} ${symbol}...`, 'info');
                    import('../data/DataService.js').then(({ DataService }) => {
                        const ds = new DataService();
                        ds.askGemini('explain', '', { symbol, change, sector }).then(res => {
                            if (res.ok) {
                                alert(`${UI_LABELS.AI_INSIGHT_FOR} ${symbol}:\n\n${res.text}`);
                            } else {
                                ToastManager.show(`${UI_LABELS.ANALYSIS_FAILED} ` + (res.error || 'Unknown error'), 'error');
                            }
                        });
                    });
                }
            );
        }

        window.addEventListener(EVENTS.RESEARCH_LINKS_UPDATED, () => {
            const discoveryModal = document.getElementById(IDS.DISCOVERY_MODAL);
            if (discoveryModal && !discoveryModal.classList.contains(CSS_CLASSES.HIDDEN) && discoveryModal.dataset.viewingCode === stock.code) {
                this._renderDetail(container, stock, modal);
            }
        }, { once: true });
    }
}
