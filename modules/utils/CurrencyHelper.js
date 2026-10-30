/**
 * CurrencyHelper.js
 * Centralized utility for currency conversion, exchange rate resolution, and Baht formatting.
 * Resolves AUD/THB exchange rates using AppState.livePrices with fallbacks to CurrencyHQ cache and local storage.
 */

import { AppState } from '../state/AppState.js';
import { formatBaht as formatBahtValue } from './formatters.js';

export const DEFAULT_AUD_THB_RATE = 23.70;
const STORAGE_KEY_RATE = 'asx_last_aud_thb_rate';
const STORAGE_KEY_CURRENCYHQ = 'currencyhq_rates_AUD';

/**
 * Gets the latest AUD to THB exchange rate.
 * Priority:
 * 1. AppState.livePrices ('AUDTHB=X' or 'AUDTHB', including prevClose fallback)
 * 2. AppState.data.dashboard ('AUDTHB=X' or 'AUDTHB')
 * 3. CurrencyHQ localStorage cache ('currencyhq_rates_AUD')
 * 4. Last saved rate in localStorage
 * 5. Fallback safe default (23.70)
 * @returns {number}
 */
export function getAudThbRate() {
    try {
        // 1. Try AppState.livePrices
        if (AppState && AppState.livePrices instanceof Map) {
            const pairData = AppState.livePrices.get('AUDTHB=X') || AppState.livePrices.get('AUDTHB');
            const rate = parseFloat(pairData?.live || pairData?.LivePrice || pairData?.prevClose || pairData?.PrevClose || 0);
            if (rate > 0) {
                try { localStorage.setItem(STORAGE_KEY_RATE, String(rate)); } catch (_) {}
                return rate;
            }
        }

        // 2. Try AppState.data.dashboard
        if (AppState && Array.isArray(AppState.data?.dashboard)) {
            const dashItem = AppState.data.dashboard.find(d => {
                const c = String(d?.code || d?.ASXCode || '').trim().toUpperCase();
                return c === 'AUDTHB=X' || c === 'AUDTHB';
            });
            const dashRate = parseFloat(dashItem?.live || dashItem?.LivePrice || dashItem?.prevClose || dashItem?.PrevClose || 0);
            if (dashRate > 0) {
                try { localStorage.setItem(STORAGE_KEY_RATE, String(dashRate)); } catch (_) {}
                return dashRate;
            }
        }

        // 3. Try CurrencyHQ cache
        const chqRaw = localStorage.getItem(STORAGE_KEY_CURRENCYHQ);
        if (chqRaw) {
            const chq = JSON.parse(chqRaw);
            const thbRate = parseFloat(chq?.rates?.THB || 0);
            if (thbRate > 0) {
                try { localStorage.setItem(STORAGE_KEY_RATE, String(thbRate)); } catch (_) {}
                return thbRate;
            }
        }

        // 4. Try last saved rate
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
 * Portfolio-linked or 'shares' category assets are always already in AUD.
 * @param {Object} asset
 * @param {number|null} [explicitRate]
 * @returns {number}
 */
export function convertAssetToAud(asset, explicitRate = null) {
    if (!asset) return 0;
    const balance = parseFloat(asset.balance) || 0;
    if (balance === 0) return 0;

    // Guard: Portfolio-linked or shares-category assets derive their balance from AUD portfolio value
    if (asset.isPortfolioLinked || asset.category === 'shares') {
        return balance;
    }

    const currency = (asset.currency || 'AUD').toUpperCase();
    if (currency === 'THB') {
        const rate = explicitRate && explicitRate > 0 ? explicitRate : getAudThbRate();
        return rate > 0 ? (balance / rate) : balance;
    }

    return balance;
}

export const formatBaht = formatBahtValue;
