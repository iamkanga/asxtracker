import { AppState } from '../state/AppState.js';
import { EVENTS } from '../utils/AppConstants.js';

export class ThemeStudio {
    static get ID() { return 'theme-studio-overlay'; }

    static show() {
        const id = this.ID;
        let overlay = document.getElementById(id);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = id;
            document.body.appendChild(overlay);
        }

        this.render(overlay);

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }

    static hide() {
        const overlay = document.getElementById(this.ID);
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    static render(container) {
        // Current values
        const currentHex = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
        const currentOpacity = getComputedStyle(document.documentElement).getPropertyValue('--accent-opacity').trim() || '1';

        container.className = 'theme-studio-overlay glass-effect';

        // 30 DISTINCT Colors (Strictly Sorted: Dark -> Light per row)
        const palette = [
            // Row 1: Default + Primaries (User's request)
            { name: 'Coffee', hex: '#a49393', default: true },
            { name: 'Red', hex: '#ff0000' },
            { name: 'Blue', hex: '#0055ff' },
            { name: 'Green', hex: '#00aa00' },
            { name: 'Yellow', hex: '#ffff00' },

            // Row 2: Warms (Dark -> Light)
            { name: 'Maroon', hex: '#800000' },
            { name: 'Crimson', hex: '#dc143c' },
            { name: 'Sunset', hex: '#ff4500' },
            { name: 'Orange', hex: '#ff8c00' },
            { name: 'Gold', hex: '#ffd700' },

            // Row 3: Blues (Dark -> Light)
            { name: 'Navy', hex: '#000080' },
            { name: 'Sapphire', hex: '#1e90ff' },
            { name: 'Azure', hex: '#00bfff' },
            { name: 'Sky', hex: '#87ceeb' },
            { name: 'Cyan', hex: '#00ffff' },

            // Row 4: Greens/Teals (Dark -> Light)
            { name: 'Forest', hex: '#006400' },
            { name: 'Teal', hex: '#008080' },
            { name: 'Emerald', hex: '#2ecc71' },
            { name: 'Lime', hex: '#32cd32' },
            { name: 'Mint', hex: '#98ff98' },

            // Row 5: Purples/Pinks (Dark -> Light)
            { name: 'Deep Purple', hex: '#4a0072' },
            { name: 'Purple', hex: '#800080' },
            { name: 'Magenta', hex: '#ff00ff' },
            { name: 'Hot Pink', hex: '#ff69b4' },
            { name: 'Pink', hex: '#ffc0cb' },

            // Row 6: Greys (Dark -> Light)
            { name: 'Black', hex: '#000000' },
            { name: 'Charcoal', hex: '#36454f' },
            { name: 'Grey', hex: '#808080' },
            { name: 'Silver', hex: '#c0c0c0' },
            { name: 'White', hex: '#ffffff' },
        ];

        container.innerHTML = `
            <div class="studio-header">
                <!-- Title Glows for Preview -->
                <span class="studio-title" id="studio-title-preview" style="text-shadow: 0 0 10px rgba(var(--color-accent-rgb), 0.8); color: rgba(var(--color-accent-rgb), var(--accent-opacity, 1));">
                    <i class="fas fa-paint-brush"></i> Design Studio
                </span>
                <button class="studio-close" id="studio-close-btn" title="Close"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="studio-content">
                <!-- 1. Color Opacity Slider -->
                <div class="studio-section">
                    <div class="studio-label">Color Opacity</div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size:0.8rem; opacity:0.6;">10%</span>
                        <!-- Range 0.1 to 1.0 -->
                        <input type="range" class="studio-slider" id="vibrancy-slider" min="0.1" max="1" step="0.05" value="${currentOpacity}">
                        <span style="font-size:0.8rem; opacity:0.6;">100%</span>
                    </div>
                </div>

                <!-- 2. Color Palette -->
                <div class="studio-section">
                    <div class="studio-label">Accents</div>
                    <div class="color-grid">
                        ${palette.map(c => `
                            <button class="color-swatch ${currentHex.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}" 
                                    style="background-color: ${c.hex};" 
                                    data-hex="${c.hex}"
                                    title="${c.name}">
                                    ${c.default ? '<span class="default-badge">DEFAULT</span>' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Style Injection (Scoped)
        if (!document.getElementById('studio-styles')) {
            const s = document.createElement('style');
            s.id = 'studio-styles';
            s.textContent = `
                .theme-studio-overlay {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 60vh;
                    background: rgba(20,20,24,0.98);
                    backdrop-filter: blur(20px);
                    border-top: 1px solid rgba(255,255,255,0.1);
                    z-index: 9999;
                    transform: translateY(100%);
                    transition: transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 -10px 50px rgba(0,0,0,0.7);
                    border-radius: 0; /* Sharp Corners */
                }
                .theme-studio-overlay.visible {
                    transform: translateY(0);
                }
                .studio-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 30px;
                    border-bottom: none;
                }
                .studio-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: rgba(var(--color-accent-rgb), var(--accent-opacity, 1)); /* Dynamic Opacity */
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    transition: text-shadow 0.2s, color 0.2s;
                    text-shadow: 0 0 10px rgba(var(--color-accent-rgb), 0.8); /* Fixed Glow */
                }
                .studio-close {
                    background: transparent;
                    color: var(--color-accent); /* Accent Colored */
                    border: none;
                    width: 32px;
                    height: 32px;
                    font-size: 1.2rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .studio-close:hover {
                    transform: scale(1.1);
                }
                .studio-content {
                    padding: 0 30px 30px 30px;
                    overflow-y: auto;
                    flex: 1;
                }
                .studio-section {
                    margin-bottom: 30px;
                }
                .studio-label {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    margin-bottom: 15px;
                    letter-spacing: 1px;
                    font-weight: 600;
                }
                .color-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
                    gap: 12px;
                }
                .color-swatch {
                    width: 50px;
                    height: 50px;
                    border-radius: 12px; 
                    border: 2px solid rgba(255,255,255,0.05); /* Default faint border */
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                /* Black Swatch Visibility Fix */
                .color-swatch[data-hex="#000000"] {
                    border: 1px solid rgba(255,255,255,0.25); /* Subtle grey line */
                }
                .color-swatch:hover {
                    transform: translateY(-2px);
                }
                .color-swatch.active {
                    border-color: #fff;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    transform: scale(1.05);
                }
                .default-badge {
                    font-size: 0.5rem;
                    color: rgba(0,0,0,0.8); /* Dark text on light badge */
                    background: rgba(255,255,255,0.6);
                    padding: 2px 4px;
                    border-radius: 4px;
                    font-weight: bold;
                    pointer-events: none;
                }
                .studio-slider {
                    width: 100%;
                    height: 4px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 2px;
                    outline: none;
                    -webkit-appearance: none;
                }
                .studio-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: var(--color-accent);
                    cursor: pointer;
                    border: 2px solid #fff;
                    box-shadow: 0 0 10px rgba(0,0,0,0.5);
                }
            `;
            document.head.appendChild(s);
        }

        // Logic
        container.querySelector('#studio-close-btn').addEventListener('click', () => this.hide());

        // Color Logic
        container.querySelectorAll('.color-swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                const hex = btn.dataset.hex;
                // Update UI visually
                container.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Apply Logic
                this.applyColor(hex, container);
            });
        });

        // Opacity Logic
        const slider = container.querySelector('#vibrancy-slider'); // kept ID same logic
        slider.addEventListener('input', (e) => {
            const val = e.target.value;
            this.applyVibrancy(val, container);
        });
    }

    static applyColor(hex, container) {
        // Hex to RGB
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // Get current opacity (default to 1)
        const opacity = getComputedStyle(document.documentElement).getPropertyValue('--accent-opacity').trim() || '1';

        // 1. Set MAIN accent color to RGBA (Applying opacity globally)
        document.documentElement.style.setProperty('--color-accent', `rgba(${r}, ${g}, ${b}, ${opacity})`);

        // 2. Set RGB separately for Glows (which use fixed opacity)
        document.documentElement.style.setProperty('--color-accent-rgb', `${r}, ${g}, ${b}`);

        // Immediate Preview update for Title
        const title = container?.querySelector('#studio-title-preview');
        if (title) {
            title.style.color = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            title.style.textShadow = `0 0 10px rgba(${r}, ${g}, ${b}, 0.8)`;
        }

        AppState.saveAccentPreferences(hex, undefined);
        document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
    }

    static applyVibrancy(opacity, container) {
        document.documentElement.style.setProperty('--accent-opacity', opacity);

        // Get current RGB
        const rgbVals = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-rgb').trim();

        // Update MAIN accent color with new opacity
        if (rgbVals) {
            document.documentElement.style.setProperty('--color-accent', `rgba(${rgbVals}, ${opacity})`);
        }

        // Immediate Preview update for Title
        const title = container?.querySelector('#studio-title-preview');
        if (title && rgbVals) {
            title.style.color = `rgba(${rgbVals}, ${opacity})`;
        }

        AppState.saveAccentPreferences(undefined, opacity);
    }
}
