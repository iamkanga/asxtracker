import { notificationStore } from '../state/NotificationStore.js';

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
        document.addEventListener('MARKET_INDEX_UPDATED', (e) => {
            if (!this.modal.classList.contains('hidden')) {
                this.render(e.detail.alerts);
            }
        });

        // Event Delegation for Dismiss Buttons
        this.listContainer.addEventListener('click', (e) => {
            const dismissBtn = e.target.closest('.stream-dismiss-btn');
            if (dismissBtn) {
                e.preventDefault();
                e.stopPropagation();
                const alertId = dismissBtn.dataset.id;
                this.dismissAlert(alertId);
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

            const isCompany = alert.code && alert.code !== 'UNKNOWN';
            const badgeClass = isCompany ? 'badge-company' : 'badge-report';
            const badgeText = isCompany ? alert.code : 'MARKET';

            // Phase 2: Link logic. 
            // Ideally links to local PDF viewer or external if provided.
            // For now, use the link from data (which is Gmail link currently).
            const href = alert.link || '#';
            const target = alert.link ? '_blank' : '_self';

            return `
                <div class="market-stream-item-wrapper" style="position: relative; transition: all 0.3s ease;">
                    <a href="${href}" target="${target}" class="market-stream-item">
                        <div class="stream-meta">
                            <span class="stream-badge ${badgeClass}">${badgeText}</span>
                            <span class="stream-time">${dateStr}</span>
                        </div>
                        <div class="stream-title" style="color: var(--text-color);">${alert.title || alert.headline}</div>
                        <div class="stream-footer">
                            <span class="stream-source"><i class="fas fa-rss"></i> Market Index</span>
                            <i class="fas fa-external-link-alt" style="font-size: 0.7rem; opacity: 0.4; color: var(--color-accent);"></i>
                        </div>
                    </a>
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
