/**
 * formatters.js
 * Utility functions for formatting numbers.
 */

export const formatCurrency = (value) => {
    if (typeof value !== 'number') return '$0.00';

    // Always use absolute value - colors indicate direction, not signs
    const absValue = Math.abs(value);

    // Auto-expand precision for sub-dollar penny stocks (e.g. $0.004)
    // But drop trailing zeros for cleaner display
    if (absValue !== 0 && absValue < 1.0) {
        // Format with 3 decimals, then strip trailing zeros if the 3rd decimal is 0
        const formatted = new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: 'AUD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 3
        }).format(absValue);
        return formatted;
    }

    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(absValue);
};

export const formatPercent = (value) => {
    if (typeof value !== 'number') return '0.00%';
    // Always use absolute value - colors indicate direction, not signs
    return new Intl.NumberFormat('en-AU', { style: 'percent', minimumFractionDigits: 2 }).format(Math.abs(value) / 100);
};

export const formatFriendlyDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    const suffix = (day) => {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    };

    return `${day}${suffix(day)} ${month} ${year}`;
};
