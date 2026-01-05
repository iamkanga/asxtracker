import { IDS, CSS_CLASSES, UI_ICONS } from '../utils/AppConstants.js';

export class WatchlistPickerModal {
    getModalHTML() {
        return `
        <div id="${IDS.WATCHLIST_PICKER_MODAL}" class="${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}">
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="${IDS.WATCHLIST_MODAL_TITLE}" class="${CSS_CLASSES.MODAL_TITLE} ${CSS_CLASSES.CLICKABLE}">
                        Select Watchlist 
                        <svg class="modal-title-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-left: 8px; transition: transform 0.3s ease;">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </h2>
                    <button id="marketPulseBtn" class="${CSS_CLASSES.MODAL_CLOSE_BTN}" style="margin-right: 30px;" title="Market Pulse">
                        <i class="fas fa-bolt" style="color: var(--color-accent);"></i>
                    </button>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" data-dismiss="modal">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <!-- Selection Mode Headers (Hidden by default) -->
                <div id="watchlistEditHeaders" class="watchlist-edit-headers ${CSS_CLASSES.HIDDEN}">
                    <span class="col-hide">Hide</span>
                    <span class="col-carousel">Carousel</span>
                    <span class="col-reorder">Reorder</span>
                </div>
                <div id="${IDS.WATCHLIST_PICKER_LIST}" class="${CSS_CLASSES.WATCHLIST_PICKER_LIST}">
                    </div>
                <div class="${CSS_CLASSES.MODAL_ACTION_BUTTONS_FOOTER}" style="padding-top: 10px;">
                    <button id="manageWatchlistsBtn" class="button secondary-button" style="display:none;">Manage Watchlists</button>
                </div>
            </div>
        </div>`;
    }
}
