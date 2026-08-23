/**
 * MarketSchedule.js
 * Comprehensive exchange schedule engine for the Australian Securities Exchange (ASX).
 * Uses standard Intl.DateTimeFormat for robust Sydney timezone (AEST/AEDT) calculation.
 */

export const ASX_SESSION = Object.freeze({
    OPEN: 'OPEN',
    AUCTION: 'AUCTION',
    PRE_OPEN: 'PRE_OPEN',
    CLOSED: 'CLOSED'
});

/**
 * Standard Australian National Public Holidays where ASX is closed (Month is 1-indexed).
 * Fixed-date holidays; dynamic Easter/Queen's birthday calculated for current years.
 */
function isASXHoliday(year, month, day) {
    // 1. Fixed-date holidays (or standard observed days)
    // New Year's Day (Jan 1)
    if (month === 1 && (day === 1 || (day === 2 && new Date(year, 0, 1).getDay() === 0))) return true;
    // Australia Day (Jan 26)
    if (month === 1 && (day === 26 || (day === 27 && new Date(year, 0, 26).getDay() === 0))) return true;
    // Anzac Day (Apr 25)
    if (month === 4 && day === 25) return true;
    // Christmas Day (Dec 25)
    if (month === 12 && day === 25) return true;
    // Boxing Day (Dec 26)
    if (month === 12 && (day === 26 || day === 27 || day === 28)) {
        if (day === 26) return true;
        // If Christmas or Boxing Day fell on weekend, observed on Mon/Tue
        const xmasDay = new Date(year, 11, 25).getDay();
        if (xmasDay === 0 || xmasDay === 6) return true;
    }

    // 2. Easter Computations (Anonymous Gregorian algorithm)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
    const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

    // Good Friday = Easter Sunday - 2 days
    const goodFriday = new Date(year, easterMonth - 1, easterDay - 2);
    if (month === (goodFriday.getMonth() + 1) && day === goodFriday.getDate()) return true;

    // Easter Monday = Easter Sunday + 1 day
    const easterMonday = new Date(year, easterMonth - 1, easterDay + 1);
    if (month === (easterMonday.getMonth() + 1) && day === easterMonday.getDate()) return true;

    // King's Birthday (Second Monday in June in NSW/ASX)
    if (month === 6) {
        const firstDayJune = new Date(year, 5, 1).getDay();
        const firstMonday = firstDayJune === 1 ? 1 : (firstDayJune === 0 ? 2 : (9 - firstDayJune));
        const secondMonday = firstMonday + 7;
        if (day === secondMonday) return true;
    }

    return false;
}

export class MarketSchedule {
    /**
     * Extracts Sydney time components.
     * @param {Date} [date=new Date()]
     * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: string, totalMinutes: number, timeString: string }}
     */
    static getSydneyTime(date = new Date()) {
        try {
            const formatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Australia/Sydney',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                weekday: 'short',
                hour12: false
            });

            const parts = formatter.formatToParts(date);
            const get = (type) => parts.find(p => p.type === type)?.value;

            const year = parseInt(get('year') || '0', 10);
            const month = parseInt(get('month') || '0', 10);
            const day = parseInt(get('day') || '0', 10);
            const hour = parseInt(get('hour') || '0', 10);
            const minute = parseInt(get('minute') || '0', 10);
            const second = parseInt(get('second') || '0', 10);
            const weekday = get('weekday') || 'Mon';
            const totalMinutes = hour * 60 + minute;
            const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

            return { year, month, day, hour, minute, second, weekday, totalMinutes, timeString };
        } catch (err) {
            // Safe fallback to local system time if Intl fails
            const d = date || new Date();
            const hour = d.getHours();
            const minute = d.getMinutes();
            return {
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                day: d.getDate(),
                hour,
                minute,
                second: d.getSeconds(),
                weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
                totalMinutes: hour * 60 + minute,
                timeString: d.toLocaleTimeString('en-GB', { hour12: false })
            };
        }
    }

    /**
     * Evaluates current ASX trading session and metadata.
     * @param {Date} [date=new Date()]
     * @returns {{ session: string, isTrading: boolean, label: string, description: string, sydneyTime: string }}
     */
    static getASXStatus(date = new Date()) {
        const syd = this.getSydneyTime(date);
        const isWeekend = (syd.weekday === 'Sat' || syd.weekday === 'Sun');
        const isHoliday = !isWeekend && isASXHoliday(syd.year, syd.month, syd.day);

        if (isWeekend || isHoliday) {
            return {
                session: ASX_SESSION.CLOSED,
                isTrading: false,
                label: isHoliday ? 'Market Holiday' : 'Market Closed',
                description: `ASX Closed (${isHoliday ? 'Holiday' : 'Weekend'}) • Showing EOD Prices`,
                sydneyTime: syd.timeString
            };
        }

        const mins = syd.totalMinutes;

        // 1. Pre-Open (07:00 to 10:00 Sydney)
        if (mins >= (7 * 60) && mins < (10 * 60)) {
            return {
                session: ASX_SESSION.PRE_OPEN,
                isTrading: false,
                label: 'Pre-Open',
                description: 'ASX Pre-Open (07:00-10:00) • Orders Queued',
                sydneyTime: syd.timeString
            };
        }

        // 2. Normal Trading (10:00 to 16:00 Sydney)
        if (mins >= (10 * 60) && mins < (16 * 60)) {
            return {
                session: ASX_SESSION.OPEN,
                isTrading: true,
                label: 'Market Open',
                description: 'ASX Open • 15-Min Delayed Live Feed',
                sydneyTime: syd.timeString
            };
        }

        // 3. Closing Single Price Auction (16:00 to 16:10 Sydney)
        if (mins >= (16 * 60) && mins < (16 * 60 + 10)) {
            return {
                session: ASX_SESSION.AUCTION,
                isTrading: true,
                label: 'Closing Auction',
                description: 'ASX Closing Auction (16:00-16:10) • Final Matches',
                sydneyTime: syd.timeString
            };
        }

        // 4. Closed / Overnight
        return {
            session: ASX_SESSION.CLOSED,
            isTrading: false,
            label: 'Market Closed',
            description: 'ASX Closed • Showing EOD Closing Prices',
            sydneyTime: syd.timeString
        };
    }

    /**
     * Returns whether the ASX market is currently actively trading (Open or Closing Auction).
     * @param {Date} [date=new Date()]
     * @returns {boolean}
     */
    static isASXTrading(date = new Date()) {
        return this.getASXStatus(date).isTrading;
    }
}
