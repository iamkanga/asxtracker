
import { CSS_CLASSES, IDS, EVENTS, UI_LABELS, AI_DEFAULT_TEMPLATES } from '../utils/AppConstants.js';
import { AppState } from '../state/AppState.js';
import { DataService } from '../data/DataService.js';
import { ToastManager } from './ToastManager.js';
import { navManager } from '../utils/NavigationManager.js';

/**
 * AiSummaryUI.js
 * Handles the Universal In-App AI Research Bottom Sheet.
 */
export class AiSummaryUI {
    static init() {
        document.addEventListener(EVENTS.SHOW_AI_SUMMARY, (e) => {
            const { symbol, questionId } = e.detail;
            this.show(symbol, questionId);
        });
    }

    static async show(symbol, questionId) {
        const template = AI_DEFAULT_TEMPLATES.find(t => t.id === questionId) || AI_DEFAULT_TEMPLATES[0];
        const userPrompt = (AppState.preferences.aiPromptTemplates || {})[questionId];
        const activePromptTemplate = userPrompt || template.text;

        // 1. Show Loading immediately
        this.showLoading(symbol, template.label);

        // 2. Check Cache
        const cached = AppState.getGeminiSummary(symbol, questionId);
        const modal = document.getElementById(IDS.AI_SUMMARY_MODAL);

        if (cached) {
            this._updateContent(modal, cached, 'Cached Analysis');
        } else {
            await this._fetchAndDisplay(modal, symbol, questionId, activePromptTemplate);
        }
    }

    /**
     * Shows the Bottom Sheet immediately in a 'thinking' state.
     * Use this before an async AI call to show the "Actioning" UI right away.
     */
    static showLoading(symbol, title = 'AI Market Insight') {
        this._dismissOthers();
        const modal = this._renderModal(symbol, title);
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('show'));
        return modal;
    }

    /**
     * Show a custom result (like a chat answer) in the AI Bottom Sheet.
     */
    static showResult(title, symbol, text, modelName = 'Gemini 3 Flash') {
        let modal = document.getElementById(IDS.AI_SUMMARY_MODAL);

        // If modal doesn't exist, create it (fallback)
        if (!modal) {
            this._dismissOthers();
            modal = this._renderModal(symbol, title);
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));
        }

        this._updateContent(modal, text, modelName);
    }

    static _dismissOthers() {
        this._restorableModals = [];

        [
            IDS.STOCK_DETAILS_MODAL,
            IDS.SUMMARY_DETAIL_MODAL,
            IDS.DISCOVERY_DETAIL_VIEW,
            IDS.SNAPSHOT_MODAL_CONTAINER,
            'asx-search-modal',
            'asx-briefing-modal'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains(CSS_CLASSES.HIDDEN)) {
                el.classList.add(CSS_CLASSES.HIDDEN);
                this._restorableModals.push(el);
            }
        });

        // Always remove existing AI summary modal if it exists
        const existing = document.getElementById(IDS.AI_SUMMARY_MODAL);
        if (existing) existing.remove();
    }

    static _restoreOthers() {
        if (this._restorableModals && this._restorableModals.length > 0) {
            this._restorableModals.forEach(el => {
                if (el) el.classList.remove(CSS_CLASSES.HIDDEN);
            });
            this._restorableModals = [];
        }
    }

    static _renderModal(symbol, title) {
        const modal = document.createElement('div');
        modal.id = IDS.AI_SUMMARY_MODAL;
        modal.className = `ai-summary-modal ${CSS_CLASSES.MODAL_OVERLAY}`;

        modal.innerHTML = `
            <div class="modal-content">
                <div class="ai-summary-drag-handle"></div>
                <div class="ai-summary-body">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                        <div style="flex: 1;">
                            <h2 style="margin: 0; font-size: 1.25rem; color: #fff;"><i class="fas fa-brain" style="color: var(--color-accent); margin-right: 8px;"></i>${title}</h2>
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Analysis for ${symbol}</div>
                        </div>
                        <button class="${CSS_CLASSES.MODAL_CLOSE_BTN}" style="background: rgba(255,255,255,0.05); border: none; color: var(--color-accent); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div id="ai-summary-content">
                        <div class="skeleton-loader">
                            <div class="skeleton-line medium"></div>
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                        <p style="text-align: center; color: #666; font-size: 0.8rem; margin-top: 15px;">
                            AI is analyzing market signals...
                        </p>
                    </div>
                </div>
            </div>
        `;

        const closeModal = () => this.close();

        modal._navActive = true;
        navManager.pushState(closeModal);

        modal.querySelector(`.${CSS_CLASSES.MODAL_CLOSE_BTN}`).onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        return modal;
    }

    static close() {
        const modal = document.getElementById(IDS.AI_SUMMARY_MODAL);
        if (!modal) return;

        // Restore underlying modals IMMEDIATELY so they are visible behind the closing sheet
        this._restoreOthers();

        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
        }, 300);

        if (modal._navActive) {
            modal._navActive = false;
            navManager.popStateSilently();
        }
    }

    static async _fetchAndDisplay(modal, symbol, questionId, promptTemplate) {
        const contentEl = modal.querySelector('#ai-summary-content');
        const ds = new DataService();

        try {
            const result = await ds.fetchAiSummary(symbol, questionId, promptTemplate);

            if (result && result.ok && result.text) {
                const modelName = result.model || 'Gemini 3 Flash';
                this._updateContent(modal, result.text, modelName);
                // Save to Daily Cache
                AppState.saveGeminiSummary(symbol, questionId, result.text);
            } else {
                const errorMsg = result?.error === 'RATE_LIMIT'
                    ? 'AI is currently busy. Please try again in a minute.'
                    : (result?.error || 'Failed to generate summary.');

                contentEl.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: var(--color-negative);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <p>${errorMsg}</p>
                        <button class="standard-btn" style="margin-top: 15px; background: #333;" onclick="AiSummaryUI.close()">Close</button>
                    </div>
                `;
            }
        } catch (err) {
            contentEl.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
        }
    }

    static _updateContent(modal, text, modelName = 'Gemini 3 Flash') {
        const contentEl = modal.querySelector('#ai-summary-content');
        if (!contentEl) return;

        const formattedHtml = this._formatMarkdown(text);

        contentEl.innerHTML = `
            <div style="animation: fadeIn 0.6s ease-out forwards;">
                <div class="ai-text-body">
                    ${formattedHtml}
                </div>
                <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; opacity: 0.5; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">
                    <span><i class="fas fa-microchip"></i> Powered by ${modelName.split('/').pop()}</span>
                    <span><i class="fas fa-history"></i> Daily Snapshot</span>
                </div>
            </div>
        `;
    }

    /**
     * Converts AI markdown-style output into structured, elegant HTML.
     */
    static _formatMarkdown(text, symbol = '') {
        if (!text) return '';

        let html = text;

        // 1. Branding & Identity Cleanup (User: Remove "AU ASX")
        html = html.replace(/AU\s*ASX/gi, 'ASX');

        // 2. Symbol & Structural Cleaning (User: Remove hashtags, brackets, vertical lines)
        // We replace vertical lines with clean bullets and strip brackets
        html = html.replace(/\|/g, ' • ');
        html = html.replace(/[\[\]]/g, '');

        // 3. Symbol Cleaning (Remove AI's repetitive prefixes like "AMP 1." or "AMP.AX")
        if (symbol && typeof symbol === 'string') {
            const baseSymbol = symbol.replace('.AX', '');
            const escaped = baseSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prefixRegex = new RegExp(`(?:${escaped}(?:\\.AX)?\\s*)?(\\d+\\.)\\s*`, 'gi');
            html = html.replace(prefixRegex, '$1 ');
        }

        // 4. Pre-process Bold
        html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 5. Process Headers (#, ##, ###) - Much more robust
        // Matches headers even with leading/trailing spaces or multiple hashtags
        html = html.replace(/^\s*(#+)\s*(.*?)\s*$/gm, (match, hashes, title) => {
            const level = hashes.length;
            const cls = level === 1 ? 'ai-header-1' : (level === 2 ? 'ai-header-2' : 'ai-header-3');
            const tag = level === 1 ? 'h2' : (level === 2 ? 'h3' : 'h4');
            // Extract title and strip any trailing symbols/metadata
            const cleanTitle = title.trim();
            return `<${tag} class="${cls}">${cleanTitle}</${tag}>`;
        });

        // 6. Process Numerical Lists
        html = html.replace(/^\d+\.\s+(.*?)$/gm, '<li class="ai-list-item-num" style="margin-bottom: 8px; list-style: decimal; margin-left: 20px; padding-left: 4px;">$1</li>');

        // 7. Process Bullet Lists
        html = html.replace(/^[*\-]\s+(.*?)$/gm, '<li class="ai-list-item-bullet" style="margin-bottom: 8px; list-style: disc; margin-left: 20px; padding-left: 4px;">$1</li>');

        // 8. Wrap <li> groups in <ul> or <ol>
        html = html.replace(/(<li class="ai-list-item-(num|bullet)".*?>.*?<\/li>\s*)+/gs, (match) => {
            const isNum = match.includes('ai-list-item-num');
            const tag = isNum ? 'ol' : 'ul';
            return `<${tag} style="margin-bottom: 16px; padding-left: 0; list-style-position: outside;">${match}</${tag}>`;
        });

        // 9. Paragraphs
        const blocks = html.split(/\n\n+/);
        html = blocks.map(block => {
            const trimmed = block.trim();
            if (!trimmed) return '';

            // If it's already a tag we handled, return as is
            if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<li')) {
                return trimmed;
            }

            return `<p style="margin-bottom: 16px; line-height: 1.6;">${trimmed.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        // 10. NUCLEAR CLEANUP: Remove any remaining hashes (#) or asterisks (*)
        // This ensures stray markdown characters never reach the UI.
        html = html.replace(/[#\*]+/g, '');

        return html;
    }
}
