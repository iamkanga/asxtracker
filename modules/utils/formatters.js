/**
 * formatters.js
 * Utility functions for formatting numbers.
 */

export const formatCurrency = (value) => {
    if (typeof value !== 'number') return '$0.00';

    // Auto-expand precision for sub-dollar penny stocks (e.g. $0.004)
    const opts = { style: 'currency', currency: 'AUD' };
    if (value !== 0 && Math.abs(value) < 1.0) {
        opts.minimumFractionDigits = 3;
        opts.maximumFractionDigits = 3;
    }

    return new Intl.NumberFormat('en-AU', opts).format(value);
};

export const formatPercent = (value) => {
    if (typeof value !== 'number') return '0.00%';
    const formatted = new Intl.NumberFormat('en-AU', { style: 'percent', minimumFractionDigits: 2 }).format(value / 100);
    return (value > 0 ? '+' : '') + formatted;
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
