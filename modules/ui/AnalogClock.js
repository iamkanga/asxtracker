/**
 * AnalogClock.js
 * Renders a strict analog clock (SVG) with market status indication.
 */

export class AnalogClock {
    /**
     * @param {HTMLElement} container - The element to inject the clock into.
     */
    /**
     * @param {HTMLElement} container - The element to inject the clock into.
     * @param {boolean} isOpen - Initial market status (Green/Red).
     */
    constructor(container, isOpen = false) {
        this.container = container;
        this.isOpen = isOpen;
        this.svg = null;
        this.timer = null;
    }

    init() {
        if (!this.container) return;
        this._render();
        this._start();
    }

    _render() {
        this.container.innerHTML = '';
        this.container.style.display = 'inline-block';

        // Remove layout styles that might conflict with card layout
        // The container in the card is likely a wrapper div

        const size = 16; // Small icon size for cards
        const center = size / 2;
        const radius = size / 2 - 1.5;

        // Determine RING color based on status
        const ringColor = this.isOpen ? 'var(--color-positive)' : 'var(--color-negative)';

        this.container.innerHTML = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow: visible; display: block;">
                 <!-- Market Status Ring (Outer) -->
                <circle id="ac-ring" cx="${center}" cy="${center}" r="${radius}" 
                    fill="none" stroke="${ringColor}" stroke-width="2" />
                
                <!-- Center Dot -->
                <circle cx="${center}" cy="${center}" r="1" fill="white" />

                <!-- Hands -->
                <line id="ac-hour" x1="${center}" y1="${center}" x2="${center}" y2="${center - 3}" 
                    stroke="white" stroke-width="1.5" stroke-linecap="round" />
                
                <line id="ac-minute" x1="${center}" y1="${center}" x2="${center}" y2="${center - 5}" 
                    stroke="white" stroke-width="1" stroke-linecap="round" />

                <line id="ac-second" x1="${center}" y1="${center}" x2="${center}" y2="${center - 5}" 
                    stroke="white" stroke-width="0.5" stroke-linecap="round" />
            </svg>
        `;

        this.ring = this.container.querySelector('#ac-ring');
        this.hourHand = this.container.querySelector('#ac-hour');
        this.minuteHand = this.container.querySelector('#ac-minute');
        this.secondHand = this.container.querySelector('#ac-second');
    }

    _start() {
        const update = () => {
            const now = new Date();
            // Local Time (User's perspective)
            const seconds = now.getSeconds();
            const minutes = now.getMinutes();
            const hours = now.getHours();

            const secDeg = ((seconds / 60) * 360);
            const minDeg = ((minutes / 60) * 360) + ((seconds / 60) * 6);
            const hourDeg = ((hours / 12) * 360) + ((minutes / 60) * 30);

            // Center is dynamic based on size (8 for size 16)
            const center = 8;

            if (this.secondHand) this.secondHand.setAttribute('transform', `rotate(${secDeg}, ${center}, ${center})`);
            if (this.minuteHand) this.minuteHand.setAttribute('transform', `rotate(${minDeg}, ${center}, ${center})`);
            if (this.hourHand) this.hourHand.setAttribute('transform', `rotate(${hourDeg}, ${center}, ${center})`);

            this.timer = requestAnimationFrame(update);
        };
        update();
    }

    destroy() {
        if (this.timer) cancelAnimationFrame(this.timer);
    }
}
