/**
 * CurrencyHelper.js
 * Centralized utility for currency conversion, exchange rate resolution, and Baht formatting.
 * Resolves AUD/THB exchange rates using AppState.livePrices with fallbacks to CurrencyHQ cache and local storage.
 */

import { AppState } from '../state/AppState.js';

export const DEFAULT_AUD_THB_RATE = 23.70;
const STORAGE_KEY_RATE = 'asx_last_aud_thb_rate';
const STORAGE_KEY_CURRENCYHQ = 'currencyhq_rates_AUD';

/**
 * Gets the latest AUD to THB exchange rate.
 * Priority:
 * 1. AppState.livePrices ('AUDTHB=X' or 'AUDTHB')
 * 2. CurrencyHQ localStorage cache ('currencyhq_rates_AUD')
 * 3. Last saved rate in localStorage
 * 4. Fallback safe default (23.70)
 * @returns {number}
 */
export function getAudThbRate() {
    try {
        // 1. Try AppState.livePrices
        if (AppState && AppState.livePrices instanceof Map) {
            const pairData = AppState.livePrices.get('AUDTHB=X') || AppState.livePrices.get('AUDTHB');
            const rate = parseFloat(pairData?.live || pairData?.LivePrice || 0);
            if (rate > 0) {
                try { localStorage.setItem(STORAGE_KEY_RATE, String(rate)); } catch (_) {}
                return rate;
            }
        }

        // 2. Try CurrencyHQ cache
        const chqRaw = localStorage.getItem(STORAGE_KEY_CURRENCYHQ);
        if (chqRaw) {
            const chq = JSON.parse(chqRaw);
            const thbRate = parseFloat(chq?.rates?.THB || 0);
            if (thbRate > 0) {
                try { localStorage.setItem(STORAGE_KEY_RATE, String(thbRate)); } catch (_) {}
                return thbRate;
            }
        }

        // 3. Try last saved rate
        const saved = parseFloat(localStorage.getItem(STORAGE_KEY_RATE) || '0');
        if (saved > 0) {
            return saved;
        }
    } catch (e) {
        console.warn('[CurrencyHelper] Rate resolution warning:', e);
    }

    return DEFAULT_AUD_THB_RATE;
}

/**
 * Converts a cash asset's balance to Australian Dollars (AUD).
 * If the asset is in Thai Baht (THB), divides by the exchange rate.
 * @param {Object} asset
 * @param {number|null} [explicitRate]
 * @returns {number}
 */
export function convertAssetToAud(asset, explicitRate = null) {
    if (!asset) return 0;
    const balance = parseFloat(asset.balance) || 0;
    if (balance === 0) return 0;

    const currency = (asset.currency || 'AUD').toUpperCase();
    if (currency === 'THB') {
        const rate = explicitRate && explicitRate > 0 ? explicitRate : getAudThbRate();
        return rate > 0 ? (balance / rate) : balance;
    }

    return balance;
}

/**
 * Formats a number in Thai Baht currency (e.g. ฿100,000.00).
 * @param {number|string} value
 * @returns {string}
 */
export function formatBaht(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '฿0.00';
    return '฿' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
