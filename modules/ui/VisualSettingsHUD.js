import { CSS_CLASSES, EVENTS, UI_ICONS, IDS } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { ThemeStudio } from './ThemeStudio.js';

export class VisualSettingsHUD {

    static get ID() { return 'visual-settings-hud'; }

    static show() {
        const id = this.ID;
        let hud = document.getElementById(id);

        if (!hud) {
            hud = document.createElement('div');
            hud.id = id;
            document.body.appendChild(hud);
        }

        // Render content
        this.render(hud);

        // Appear animation
        requestAnimationFrame(() => {
            hud.classList.add('visible');
        });
    }

    static hide() {
        const hud = document.getElementById(this.ID);
        if (hud) {
            hud.classList.remove('visible');
            setTimeout(() => hud.remove(), 300); // Wait for transition
        }
    }

    static render(container) {
        const prefs = AppState.preferences.containerBorders || { sides: [0, 0, 0, 0], thickness: 1 };
        // Gradient Strength Logic matches HeaderLayout.js
        const strength = typeof AppState.preferences.gradientStrength === 'number' ? AppState.preferences.gradientStrength : 0.25;
        // Card Chart Opacity (New Feature)
        const chartOpacity = typeof AppState.preferences.cardChartOpacity === 'number' ? AppState.preferences.cardChartOpacity : 1.0;

        // Mapping Strength to Labels
        const toneLevels = [
            { label: 'None', val: 0 },
            { label: 'Muted', val: 0.125 },
            { label: 'Subtle', val: 0.25 },
            { label: 'Light', val: 0.4 },
            { label: 'Medium', val: 0.6 },
            { label: 'Strong', val: 0.9 }
        ];

        // Determine active tone index
        let activeToneIndex = 0;
        let minDiff = 1;
        toneLevels.forEach((t, i) => {
            const diff = Math.abs(t.val - strength);
            if (diff < minDiff) {
                minDiff = diff;
                activeToneIndex = i;
            }
        });

        const sides = prefs.sides || [0, 0, 0, 0];

        // Inject Dynamic CSS Variable for Chart Opacity immediately
        document.documentElement.style.setProperty('--card-chart-opacity', chartOpacity);

        container.className = 'visual-hud glass-effect';
        // Note: 'glass-effect' might add border-radius, we override it in local style below.

        container.innerHTML = `
            <div class="hud-header">
                <span class="hud-title"><i class="fas fa-palette"></i> Visual Studio</span>
                <button class="hud-close" id="hud-close-btn" title="Close"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="hud-content">
                <!-- TOP ROW: BORDERS + QUICK STYLES -->
                <div style="display: flex; flex-direction: row; gap: 40px; align-items: flex-start; padding: 0 10px; width: 100%; box-sizing: border-box;">
                    <!-- 1. BORDERS -->
                    <div class="hud-section" style="flex: 0 0 auto; margin: 0;">
                        <div class="hud-label" style="text-align: left;">Borders</div>
                        <div class="hud-row" style="justify-content: flex-start;">
                            <div class="border-box-widget" style="margin: 0;">
                                <div class="b-edge b-top ${sides[0] ? 'active' : ''}" data-side="0"></div>
                                <div class="b-edge b-right ${sides[1] ? 'active' : ''}" data-side="1"></div>
                                <div class="b-edge b-bottom ${sides[2] ? 'active' : ''}" data-side="2"></div>
                                <div class="b-edge b-left ${sides[3] ? 'active' : ''}" data-side="3"></div>
                                <div class="b-center-label">${prefs.thickness}px</div>
                            </div>
                            <!-- Thickness Slider -->
                            <div class="thickness-control" style="margin-left: 20px;">
                                <input type="range" min="1" max="6" value="${prefs.thickness}" class="hud-slider" id="hud-border-thick">
                            </div>
                        </div>
                    </div>

                    <!-- 3. QUICK STYLES -->
                    <div class="hud-section" style="flex: 1; display: flex; flex-direction: column;">
                        <div class="hud-label" style="text-align: left;">Quick Styles</div>
                        <div class="style-buttons" style="display: flex; flex-direction: row; gap: 10px; width: 100%;">
                            <button class="style-btn" data-preset="minimal" style="flex: 1;">Minimal</button>
                            <button class="style-btn" data-preset="classic" style="flex: 1;">Classic</button>
                            <button class="style-btn" data-preset="rich" style="flex: 1;">Rich</button>
                        </div>
                    </div>
                </div>

                <div class="hud-divider"></div>

                <!-- 2. TONE INTENSITY (Full Width) -->
                <div class="hud-section" style="padding: 0 10px; width: 100%; box-sizing: border-box;">
                    <div class="hud-label" style="text-align: left;">Tone Intensity</div>
                    <div class="tone-segments" style="display: grid; grid-template-columns: repeat(6, 1fr); padding-bottom: 0; width: 100%; gap: 4px;">
                        ${toneLevels.map((t, i) => `
                            <button class="tone-seg-btn ${i === activeToneIndex ? 'active' : ''}" data-val="${t.val}" style="padding: 8px 4px; font-size: 0.65rem;">
                                ${t.label}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="hud-divider"></div>

                <!-- 4. BOTTOM ROW: Design Studio (Left) | Charts (Right) -->
                 <div class="hud-section" style="display: flex; flex-direction: row; gap: 20px; align-items: center; padding: 0 10px; width: 100%; box-sizing: border-box; justify-content: space-between;">
                    <!-- Design Studio Button -->
                    <div style="flex: 1; display: flex;">
                        <button class="hud-action-btn" id="open-theme-studio" style="width: 100%; padding: 12px 0; background: transparent; border: none; color: var(--color-accent); font-weight: 700; cursor: pointer; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; text-align: left;">
                            <i class="fas fa-paint-brush" style="margin-right: 6px;"></i> Design Studio
                        </button>
                    </div>

                    <!-- Card Charts Slider -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                         <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">Card Charts</div>
                         <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                            <input type="range" min="0" max="1" step="0.1" value="${chartOpacity}" class="hud-slider opacity-slider" id="hud-chart-opacity" style="flex: 1;">
                            <span class="opacity-val-label" style="font-size: 0.7rem; color: var(--text-muted); width: 30px; text-align: right;">${Math.round(chartOpacity * 100)}%</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                /* OVERRIDES & LAYOUT */
                .visual-hud {
                    position: fixed;
                    bottom: 0; /* Attach to bottom exactly or slightly floating */
                    left: 50%;
                    transform: translateX(-50%) translateY(100%);
                    width: 100%;
                    max-width: 800px;
                    background: rgba(15, 15, 18, 0.98); /* Darker, more solid */
                    border-top: 1px solid rgba(192, 160, 128, 0.3); /* Subtle coffee top border */
                    border-radius: 0 !important; /* SQUARE CORNERS REQUEST */
                    box-shadow: 0 -5px 30px rgba(0,0,0,0.6);
                    z-index: 9999;
                    opacity: 0;
                    backdrop-filter: blur(20px);
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    pointer-events: auto;
                }
                .visual-hud.visible {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }

                .hud-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 16px;
                    background: rgba(255,255,255,0.02);
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .hud-title {
                    font-size: 0.85rem;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    color: var(--text-muted);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    text-transform: uppercase;
                }
                
                /* Close Button - Coffee X */
                .hud-close {
                    background: transparent;
                    color: var(--color-accent); /* Coffee Color */
                    border: none;
                    font-size: 1.1rem;
                    cursor: pointer;
                    padding: 5px 10px;
                    transition: transform 0.2s, color 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .hud-close:hover {
                    color: #fff;
                    transform: scale(1.1);
                }

                .hud-content {
                    padding: 15px 20px 25px 20px;
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    gap: 25px;
                    flex-wrap: wrap;
                }
                
                .hud-section {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    align-items: center;
                }
                .hud-label {
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--text-muted);
                    font-weight: 500;
                    opacity: 0.7;
                }
                .hud-row {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }
                .centered-row {
                    justify-content: center;
                    width: 100%;
                }
                .hud-divider {
                    width: 1px;
                    height: 40px;
                    background: rgba(255,255,255,0.08);
                    margin-top: 20px;
                }

                /* Border Widget - Thinner Lines, Perfect Corners */
                .border-box-widget {
                    width: 50px;
                    height: 50px;
                    position: relative;
                    /* No background, purely lines */
                    background: transparent;
                }
                .b-edge {
                    position: absolute;
                    background: rgba(255,255,255,0.1);
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .b-edge:hover { background: rgba(255,255,255,0.3); }
                .b-edge.active { background: var(--color-accent); }
                
                /* Perfect Square Corners (overlapping corners style or strict sizing) */
                /* Top/Bottom span full width, Left/Right sit between them to make perfect square */
                .b-top    { top: 0; left: 0; width: 100%; height: 4px; }
                .b-bottom { bottom: 0; left: 0; width: 100%; height: 4px; }
                .b-left   { top: 0; left: 0; width: 4px; height: 100%; }
                .b-right  { top: 0; right: 0; width: 4px; height: 100%; }
                
                .b-center-label {
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    pointer-events: none;
                    font-variant-numeric: tabular-nums;
                }

                .thickness-control { width: 70px; }

                /* Common Slider Style */
                .hud-slider {
                    width: 100px;
                    height: 4px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 2px;
                    outline: none;
                    appearance: none;
                    cursor: pointer;
                }
                .hud-slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: var(--color-accent);
                    cursor: pointer;
                    transition: transform 0.1s;
                }
                .hud-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }

                /* Tone & Style Buttons - Underline Style */
                .tone-segments, .style-buttons {
                    display: flex;
                    gap: 15px;
                }
                .tone-seg-btn, .style-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-muted); /* Default greyish */
                    padding: 4px 2px;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                    border-bottom: 2px solid transparent; /* Invisible underline default */
                    position: relative;
                }
                
                .tone-seg-btn:hover, .style-btn:hover {
                    color: var(--text-color);
                }

                /* Active State: Coffee Text + Underline */
                .tone-seg-btn.active, .style-btn.active {
                    background: transparent !important;
                    color: var(--color-accent) !important; /* Coffee Color */
                    border-bottom: 2px solid var(--color-accent);
                    text-shadow: 0 0 10px rgba(192, 160, 128, 0.2);
                }

                /* Opacity specific */
                .opacity-slider { width: 120px; }
                .opacity-val-label {
                    font-size: 0.75rem;
                    color: var(--text-color);
                    margin-left: 8px;
                    width: 30px;
                    text-align: right;
                }
                
                /* Chart Opacity CSS Variable Injection (Global targeting) */
                /* This ensures the variable is actually applied to the chart background */
                /* We add a style tag to the document head dynamically or assume standard CSS handles var() */
                /* For now, we rely on the JS setting the property on documentElement */
                
                @media (max-width: 600px) {
                    .visual-hud {
                        width: 100%;
                        bottom: 0;
                        border-radius: 0;
                    }
                    .hud-content {
                        flex-direction: row;
                        justify-content: space-around;
                        gap: 20px;
                    }
                    .hud-divider { display: none; }
                    .hud-section {
                        width: 45%; /* 2x2 gridish on mobile */
                    }
                    .hud-row { justify-content: center; }
                    .tone-segments { 
                        flex-wrap: wrap; 
                        justify-content: center; 
                        gap: 10px;
                    }
                }
            </style>
        `;

        // --- BINDINGS ---

        // Close
        container.querySelector('#hud-close-btn').addEventListener('click', () => this.hide());

        // Borders (Edges)
        const edges = container.querySelectorAll('.b-edge');
        const thickLabel = container.querySelector('.b-center-label');

        edges.forEach(edge => {
            edge.addEventListener('click', (e) => {
                const sideIndex = parseInt(e.target.dataset.side);
                sides[sideIndex] = sides[sideIndex] ? 0 : 1; // Toggle

                // Visual Update
                e.target.classList.toggle('active');

                // State Update
                const newPrefs = { ...prefs, sides: sides };
                AppState.saveBorderPreferences(newPrefs);
                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });

        // Thickness Slider
        const slider = container.querySelector('#hud-border-thick');
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            thickLabel.textContent = val + 'px';

            const newPrefs = { ...prefs, thickness: val };
            AppState.saveBorderPreferences(newPrefs);
            document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
        });

        // Theme Studio Trigger
        const studioBtn = container.querySelector('#open-theme-studio');
        if (studioBtn) {
            studioBtn.addEventListener('click', () => {
                VisualSettingsHUD.hide(); // Hide current HUD
                ThemeStudio.show();      // Show Studio
            });
        }

        // Tone Intensity
        const toneBtns = container.querySelectorAll('.tone-seg-btn');
        toneBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toneBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const val = parseFloat(btn.dataset.val);

                // Manual Persistence
                AppState.preferences.gradientStrength = val;
                localStorage.setItem('asx_gradient_strength', val);
                document.documentElement.style.setProperty('--gradient-strength', val);
                AppState.triggerSync();

                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });

        // Quick Styles
        const styleBtns = container.querySelectorAll('.style-btn');
        styleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Deactivate others
                styleBtns.forEach(b => b.classList.remove('active'));
                // Note: Logic for 'active' style button is tricky as it's a preset. 
                // We'll just highlight it momentarily or keep logic simple.
                // For now, let's just highlight the clicked one.
                btn.classList.add('active');

                const preset = btn.dataset.preset;
                let newSides = [0, 0, 0, 0];
                let newThickness = 1;
                let newOpacity = 0.25;

                if (preset === 'minimal') {
                    newSides = [0, 0, 0, 1]; newThickness = 3; newOpacity = 0.0;
                } else if (preset === 'classic') {
                    newSides = [0, 0, 0, 1]; newThickness = 3; newOpacity = 0.25;
                } else if (preset === 'rich') {
                    newSides = [1, 1, 1, 1]; newThickness = 2; newOpacity = 0.9;
                }

                // Update UI State locally
                sides[0] = newSides[0]; sides[1] = newSides[1];
                sides[2] = newSides[2]; sides[3] = newSides[3];

                // Update Widget Visuals
                container.querySelectorAll('.b-edge').forEach(edge => {
                    const idx = parseInt(edge.dataset.side);
                    edge.classList.toggle('active', !!newSides[idx]);
                });

                slider.value = newThickness;
                thickLabel.textContent = newThickness + 'px';

                // Update Tone UI
                toneBtns.forEach(b => {
                    const bVal = parseFloat(b.dataset.val);
                    b.classList.toggle('active', Math.abs(bVal - newOpacity) < 0.05);
                });

                // Save All
                AppState.saveBorderPreferences({ sides: newSides, thickness: newThickness });

                AppState.preferences.gradientStrength = newOpacity;
                localStorage.setItem('asx_gradient_strength', newOpacity);
                document.documentElement.style.setProperty('--gradient-strength', newOpacity);
                AppState.triggerSync();

                document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
            });
        });

        // Chart Opacity Slider (New Feature)
        const opacitySlider = container.querySelector('#hud-chart-opacity');
        const opacityLabel = container.querySelector('.opacity-val-label');

        opacitySlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            opacityLabel.textContent = Math.round(val * 100) + '%';

            // Live Update CSS Variable
            document.documentElement.style.setProperty('--card-chart-opacity', val);

            // Persist
            AppState.preferences.cardChartOpacity = val;
            localStorage.setItem('asx_card_chart_opacity', val);
            AppState.triggerSync();

            // Note: No need to refresh watchlist if we use CSS variable, unless charts are re-rendered based on logic.
            // But just in case ViewRenderer logic uses the pref for 'showCardCharts', we might want to refresh.
            // However, opacity 0 is just visual.
        });
    }
}
