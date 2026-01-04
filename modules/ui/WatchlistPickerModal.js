import { IDS, CSS_CLASSES, UI_ICONS } from '../utils/AppConstants.js';

export class WatchlistPickerModal {
    getModalHTML() {
        return `
        <div id="${IDS.WATCHLIST_PICKER_MODAL}" class="${CSS_CLASSES.MODAL} ${CSS_CLASSES.HIDDEN}">
            <div class="${CSS_CLASSES.MODAL_OVERLAY}"></div>
            <div class="${CSS_CLASSES.MODAL_CONTENT}">
                <div class="${CSS_CLASSES.MODAL_HEADER}">
                    <h2 id="${IDS.WATCHLIST_MODAL_TITLE}" class="${CSS_CLASSES.MODAL_TITLE} ${CSS_CLASSES.MODAL_REORDER_TITLE} ${CSS_CLASSES.CLICKABLE}">
                        Select Watchlist <i class="fas ${UI_ICONS.CARET_DOWN} ${CSS_CLASSES.TEXT_COFFEE}"></i>
                    </h2>
                    <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" data-dismiss="modal">
                        <i class="fas ${UI_ICONS.CLOSE}"></i>
                    </button>
                </div>
                <!-- Selection Mode Container (Hidden by default) -->
                <div id="${IDS.WATCHLIST_MODE_CONTAINER}" class="${CSS_CLASSES.HIDDEN} ${CSS_CLASSES.MODE_SELECTOR}" style="padding: 10px 20px 0 20px;">
                    <div class="${CSS_CLASSES.SEGMENTED_CONTROL}">
                        <button id="${IDS.MODE_REARRANGE}" class="${CSS_CLASSES.SEGMENTED_BUTTON}" data-mode="rearrange">Reorder</button>
                        <button id="${IDS.MODE_HIDE}" class="${CSS_CLASSES.SEGMENTED_BUTTON}" data-mode="hide">Hide</button>
                        <button id="${IDS.MODE_CAROUSEL}" class="${CSS_CLASSES.SEGMENTED_BUTTON}" data-mode="carousel">Carousel</button>
                    </div>
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
