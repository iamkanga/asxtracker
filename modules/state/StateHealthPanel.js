/**
 * StateHealthPanel.js
 * Visual Health Dashboard (Floating Panel)
 * 
 * Provides a compact, always-visible health indicator showing:
 * - State mutation count
 * - Race condition count
 * - Quick validate button
 * - Expandable detail view
 * 
 * Can be toggled via StateAuditor or keyboard shortcut (Ctrl+Shift+H)
 */

import { StateAuditor } from './StateAuditor.js';

const PANEL_STYLES = `
    #state-health-panel {
        position: fixed;
        bottom: 16px;
        left: 16px;
        z-index: 99999;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        color: #e0e0e0;
        background: rgba(18, 18, 28, 0.95);
        border: 1px solid rgba(0, 255, 136, 0.2);
        border-radius: 12px;
        padding: 8px 12px;
        min-width: 180px;
        max-width: 360px;
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: default;
        user-select: none;
    }

    #state-health-panel.collapsed {
        min-width: auto;
        padding: 6px 10px;
        border-radius: 20px;
        opacity: 0.6;
    }

    #state-health-panel.collapsed:hover {
        opacity: 1;
    }

    #state-health-panel .shp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        cursor: pointer;
    }

    #state-health-panel .shp-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #00ff88;
        box-shadow: 0 0 6px #00ff88;
        flex-shrink: 0;
    }

    #state-health-panel .shp-indicator.warn {
        background: #ff9800;
        box-shadow: 0 0 6px #ff9800;
    }

    #state-health-panel .shp-indicator.error {
        background: #ff4444;
        box-shadow: 0 0 6px #ff4444;
        animation: shp-pulse 1s infinite;
    }

    @keyframes shp-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    #state-health-panel .shp-title {
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #888;
    }

    #state-health-panel .shp-stats {
        display: flex;
        gap: 12px;
        margin-top: 6px;
    }

    #state-health-panel .shp-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    #state-health-panel .shp-stat-value {
        font-size: 16px;
        font-weight: 700;
        color: #fff;
    }

    #state-health-panel .shp-stat-label {
        font-size: 9px;
        color: #666;
        text-transform: uppercase;
    }

    #state-health-panel .shp-body {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        max-height: 200px;
        overflow-y: auto;
    }

    #state-health-panel .shp-body::-webkit-scrollbar {
        width: 3px;
    }

    #state-health-panel .shp-body::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
    }

    #state-health-panel .shp-log-entry {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        font-size: 10px;
        color: #aaa;
        border-bottom: 1px solid rgba(255, 255, 255, 0.02);
    }

    #state-health-panel .shp-log-key {
        color: #4fc3f7;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #state-health-panel .shp-log-val {
        color: #888;
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #state-health-panel .shp-actions {
        display: flex;
        gap: 6px;
        margin-top: 8px;
    }

    #state-health-panel .shp-btn {
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #ccc;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 9px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    }

    #state-health-panel .shp-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    #state-health-panel.collapsed .shp-body,
    #state-health-panel.collapsed .shp-stats,
    #state-health-panel.collapsed .shp-actions {
        display: none;
    }
`;

export class StateHealthPanel {
    static _instance = null;
    static _panel = null;
    static _updateInterval = null;
    static _collapsed = true;

    static init() {
        if (this._instance) return;
        this._instance = true;

        // Inject styles
        const style = document.createElement('style');
        style.textContent = PANEL_STYLES;
        document.head.appendChild(style);

        // Create panel
        this._createPanel();

        // Start periodic updates
        this._updateInterval = setInterval(() => this._update(), 2000);

        // Keyboard shortcut: Ctrl+Shift+H
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    static toggle() {
        if (!this._panel) return;
        this._collapsed = !this._collapsed;
        this._panel.classList.toggle('collapsed', this._collapsed);
        if (!this._collapsed) this._update();
    }

    static show() {
        if (!this._panel) this.init();
        this._panel.style.display = 'block';
    }

    static hide() {
        if (this._panel) this._panel.style.display = 'none';
    }

    static _createPanel() {
        const panel = document.createElement('div');
        panel.id = 'state-health-panel';
        panel.className = 'collapsed';
        panel.innerHTML = `
            <div class="shp-header" id="shp-header-toggle">
                <div class="shp-indicator" id="shp-indicator"></div>
                <span class="shp-title">State Health</span>
            </div>
            <div class="shp-stats" id="shp-stats"></div>
            <div class="shp-body" id="shp-body"></div>
            <div class="shp-actions">
                <button class="shp-btn" id="shp-btn-validate">✓ Validate</button>
                <button class="shp-btn" id="shp-btn-snapshot">📸 Snapshot</button>
                <button class="shp-btn" id="shp-btn-report">📊 Report</button>
            </div>
        `;

        document.body.appendChild(panel);
        this._panel = panel;

        // Events
        panel.querySelector('#shp-header-toggle').addEventListener('click', () => this.toggle());
        panel.querySelector('#shp-btn-validate').addEventListener('click', () => {
            const result = StateAuditor.validate();
            this._update();
        });
        panel.querySelector('#shp-btn-snapshot').addEventListener('click', () => {
            const name = `snap_${Date.now()}`;
            StateAuditor.snapshot(name);
            this._update();
        });
        panel.querySelector('#shp-btn-report').addEventListener('click', () => {
            StateAuditor.report();
        });
    }

    static _update() {
        if (!this._panel || this._collapsed) return;

        const log = StateAuditor.getLog();
        const races = StateAuditor._raceConditions;
        const validation = StateAuditor.validate();

        // Indicator
        const indicator = this._panel.querySelector('#shp-indicator');
        if (races.length > 0 || !validation.passed) {
            indicator.className = 'shp-indicator error';
        } else if (log.length > 200) {
            indicator.className = 'shp-indicator warn';
        } else {
            indicator.className = 'shp-indicator';
        }

        // Stats
        const stats = this._panel.querySelector('#shp-stats');
        stats.innerHTML = `
            <div class="shp-stat">
                <span class="shp-stat-value">${log.length}</span>
                <span class="shp-stat-label">Mutations</span>
            </div>
            <div class="shp-stat">
                <span class="shp-stat-value" style="color: ${races.length > 0 ? '#ff4444' : '#00ff88'}">${races.length}</span>
                <span class="shp-stat-label">Races</span>
            </div>
            <div class="shp-stat">
                <span class="shp-stat-value">${Object.keys(StateAuditor._snapshots).length}</span>
                <span class="shp-stat-label">Snapshots</span>
            </div>
            <div class="shp-stat">
                <span class="shp-stat-value" style="color: ${validation.passed ? '#00ff88' : '#ff4444'}">${validation.passed ? '✓' : '✗'}</span>
                <span class="shp-stat-label">Valid</span>
            </div>
        `;

        // Recent log
        const body = this._panel.querySelector('#shp-body');
        const recent = log.slice(-8).reverse();
        body.innerHTML = recent.map(e => `
            <div class="shp-log-entry">
                <span class="shp-log-key">${e.key}</span>
                <span class="shp-log-val">${e.newValue}</span>
                <span style="color: #555">${e.time}</span>
            </div>
        `).join('');
    }

    static destroy() {
        if (this._updateInterval) clearInterval(this._updateInterval);
        if (this._panel) this._panel.remove();
        this._panel = null;
        this._instance = null;
    }
}
