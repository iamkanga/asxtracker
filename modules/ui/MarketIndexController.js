import { notificationStore } from '../state/NotificationStore.js';
import { EVENTS } from '../utils/AppConstants.js';

export class MarketIndexController {
    constructor() {
        // Defer binding slightly to ensure DOM is ready
        setTimeout(() => this.init(), 100);
    }

    init() {
        this.modal = document.getElementById('modal-market-stream');
        this.sidebarBtn = document.getElementById('sidebar-market-stream-btn');
        this.listContainer = document.getElementById('market-stream-list');
        this.closeBtn = this.modal?.querySelector('.modal-close-btn');

        if (!this.modal) {
            console.warn('[MarketIndexController] Modal missing. Retrying...');
            setTimeout(() => this.init(), 500); // Retry
            return;
        }

        // Sidebar button is optional as it may be rendered dynamically by SidebarCommandCenter
        if (!this.sidebarBtn) {
            // Keep checking for sidebarBtn but don't block
            setTimeout(() => {
                this.sidebarBtn = document.getElementById('sidebar-market-stream-btn') || document.getElementById('nav-announcements');
                if (this.sidebarBtn) this.sidebarBtn.addEventListener('click', () => this.openModal());
            }, 1000);
        }
        this.bindEvents();
    }

    bindEvents() {
        // Bind Events
        this.sidebarBtn?.addEventListener('click', () => this.openModal());
        this.closeBtn?.addEventListener('click', () => this.closeModal());

        // Close on overlay click
        this.modal.querySelector('.modal-overlay')?.addEventListener('click', () => this.closeModal());

        // Listen for Data Updates
        document.addEventListener(EVENTS.MARKET_INDEX_UPDATED, (e) => {
            if (!this.modal.classList.contains('hidden')) {
                this.render(e.detail.alerts);
            }
        });

        // Event Delegation for Dismiss Buttons and Code Pills
        this.listContainer.addEventListener('click', (e) => {
            const dismissBtn = e.target.closest('.stream-dismiss-btn');
            if (dismissBtn) {
                e.preventDefault();
                e.stopPropagation();
                const alertId = dismissBtn.dataset.id;
                this.dismissAlert(alertId);
                return;
            }

            // If user clicks the code pill, spawn the stock details modal but leave the announcements modal open underneath.
            // When they close the stock details modal, they will be right back here.
            const codePill = e.target.closest('.code-pill');
            if (codePill) {
                e.preventDefault();
                e.stopPropagation();
                const code = codePill.dataset.code;
                if (code) {
                    document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code } }));
                }
                return; // Do not mark as read when just viewing the security
            }

            // Mark visually as tapped/read ONLY if the main body link is clicked
            const bodyLink = e.target.closest('a.market-stream-item');
            if (bodyLink) {
                const wrapper = bodyLink.closest('.market-stream-item-wrapper');
                const alertId = wrapper?.dataset.alertId;
                if (wrapper && alertId) {
                    notificationStore.markAnnouncementRead(alertId);
                    wrapper.style.opacity = '0.5';
                    wrapper.style.filter = 'grayscale(30%)';
                }
            }
        });

        // Clear All Logic
        document.getElementById('stream-clear-all')?.addEventListener('click', () => this.dismissAll());
    }

    openModal() {
        if (!this.modal) return;
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        this.render(notificationStore.getMarketIndexAlerts());
    }

    closeModal() {
        this.modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    dismissAlert(alertId) {
        if (!alertId) return;
        notificationStore.dismissAnnouncement(alertId);

        const element = this.listContainer.querySelector(`.market-stream-item-wrapper:has([data-id="${alertId}"])`) ||
            this.listContainer.querySelector(`[data-id="${alertId}"]`);

        if (element) {
            element.style.transform = 'translateX(100%)';
            element.style.opacity = '0';
            setTimeout(() => this.render(notificationStore.getMarketIndexAlerts()), 300);
        }
    }

    dismissAll() {
        notificationStore.dismissAllAnnouncements();
        this.render([]); // Immediate empty state
    }

    render(alerts) {
        if (!this.listContainer) return;

        // Filter out dismissed items
        const visibleAlerts = (alerts || []).filter(a => !notificationStore.dismissedAnnouncements.has(a.id || `${a.code}-${a.timestamp}`));


        if (visibleAlerts.length === 0) {
            this.listContainer.innerHTML = `
                <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-muted);">
                    <i class="fas fa-satellite-dish" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>No recent announcement data.</p>
                </div>`;
            return;
        }

        const html = visibleAlerts.map(alert => {
            const id = alert.id || `${alert.code}-${alert.timestamp}`;
            const date = new Date(alert.timestamp);
            let dateStr = '';
            if (!isNaN(date.getTime())) {
                const now = new Date();
                const isToday = date.toDateString() === now.toDateString();
                dateStr = isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            // Extract ASX Code from Title if the provided code is missing, UNKNOWN, or just generic 'ASX'
            let extractedCode = alert.code;
            if ((!extractedCode || extractedCode === 'UNKNOWN' || extractedCode === 'ASX' || extractedCode === 'MARKET') && (alert.title || alert.headline)) {
                const text = alert.title || alert.headline;
                // Target titles starting with exactly 3-4 uppercase letters, e.g., "BHP - Announcement..." or "[RIO] ..."
                const match = text.match(/^\[?([A-Z]{3,4})\]?\b/);
                if (match) {
                    extractedCode = match[1];
                }
            }

            const isCompany = extractedCode && extractedCode !== 'UNKNOWN' && extractedCode !== 'ASX' && extractedCode !== 'MARKET';
            const badgeClass = isCompany ? 'badge-company' : 'badge-report';
            const badgeText = isCompany ? extractedCode : 'MARKET';

            // Phase 2: Link logic. 
            // Ideally links to local PDF viewer or external if provided.
            // For now, use the link from data (which is Gmail link currently).
            const href = alert.link || '#';
            const target = alert.link ? '_blank' : '_self';

            const isRead = notificationStore.readAnnouncements?.has(id);
            const opacityStyle = isRead ? 'opacity: 0.5; filter: grayscale(30%);' : '';

            return `
                <div class="market-stream-item-wrapper" data-alert-id="${id}" style="position: relative; transition: all 0.3s ease; ${opacityStyle}">
                    <a href="${href}" target="${target}" class="market-stream-item">
                        <div class="stream-meta">
                            <span class="stream-badge ${badgeClass}">${badgeText}</span>
                            <span class="stream-time">${dateStr}</span>
                        </div>
                        <div class="stream-title" style="color: var(--text-color);">${alert.title || alert.headline}</div>
                        <div class="stream-footer" style="padding-bottom: 4px;">
                            <span class="stream-source"><i class="fas fa-rss"></i> Market Index</span>
                            <i class="fas fa-external-link-alt" style="font-size: 0.7rem; opacity: 0.4; color: var(--color-accent);"></i>
                        </div>
                    </a>
                    
                    ${isCompany ? `
                    <button class="code-pill" data-code="${extractedCode}" style="position: absolute; bottom: 8px; left: 16px; z-index: 10; border: 1px solid rgba(var(--color-accent-rgb, 100, 150, 255), 0.4); border-radius: 4px; background: rgba(30, 30, 30, 0.9); color: var(--color-accent, #6496ff); padding: 4px 10px; font-size: 0.75rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" title="View ${extractedCode} Details">
                        <i class="fas fa-search-dollar"></i> View ${extractedCode}
                    </button>
                    ` : ''}

                    <button class="stream-dismiss-btn" data-id="${id}" title="Dismiss"
                        style="position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; z-index: 5; opacity: 0.3; transition: opacity 0.2s;">
                        <i class="fas fa-times" style="font-size: 0.8rem;"></i>
                    </button>
                </div>
            `;
        }).join('');

        this.listContainer.innerHTML = html;
    }
}

// Singleton for easy import in main.js
export const marketIndexController = new MarketIndexController();
