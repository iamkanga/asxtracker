/**
 * ColorHelper.js
 * Utilities for extracting and generating colors.
 */
export class ColorHelper {
    /**
     * Static cache for extracted colors to avoid re-calculating and CORS issues.
     */
    static _colorCache = new Map();

    /**
     * Extracts the dominant color from an image URL.
     * Uses canvas to analyze pixels.
     * @param {string} url 
     * @returns {Promise<string>} Hex color
     */
    static async getDominantColor(url) {
        if (this._colorCache.has(url)) return this._colorCache.get(url);

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // Required for Canvas getImageData

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                // Use small scale for performance
                canvas.width = 32;
                canvas.height = 32;
                ctx.drawImage(img, 0, 0, 32, 32);

                try {
                    const pixels = ctx.getImageData(0, 0, 32, 32).data;
                    let r = 0, g = 0, b = 0, count = 0;

                    for (let i = 0; i < pixels.length; i += 4) {
                        const alpha = pixels[i + 3];
                        if (alpha < 128) continue; // Skip transparency

                        // Skip extreme colors (pure white/black)
                        const br = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                        if (br > 240 || br < 20) continue;

                        r += pixels[i];
                        g += pixels[i + 1];
                        b += pixels[i + 2];
                        count++;
                    }

                    if (count === 0) {
                        resolve('#a49393'); // Fallback to "Coffee"
                        return;
                    }

                    const hex = '#' + [r / count, g / count, b / count]
                        .map(x => Math.round(x).toString(16).padStart(2, '0'))
                        .join('').toUpperCase();

                    this._colorCache.set(url, hex);
                    resolve(hex);
                } catch (e) {
                    // Likely CORS issue (Tainted Canvas)
                    resolve('#a49393');
                }
            };
            img.onerror = () => resolve('#a49393');
            img.src = url;
        });
    }

    /**
     * Generates a stable color from a string.
     */
    static getColorForString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0').toUpperCase();
        return `#${c}`;
    }

    /**
     * Adjusts a color to ensure it's not too dark/bright for the UI.
     */
    static validateColor(hex) {
        // Simple brightness check
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        if (brightness < 40) return '#a49393'; // Too dark
        return hex;
    }
}
