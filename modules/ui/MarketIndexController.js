import { notificationStore } from '../state/NotificationStore.js';
import { EVENTS } from '../utils/AppConstants.js';
import { navManager } from '../utils/NavigationManager.js';
import { LinkHelper } from '../utils/LinkHelper.js';

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

        // Prevent duplicate initialization
        if (this._initialized) return;
        this._initialized = true;

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

        // Listen for Data Updates (New Alerts)
        document.addEventListener(EVENTS.MARKET_INDEX_UPDATED, (e) => {
            if (!this.modal.classList.contains('hidden')) {
                this.render(e.detail.alerts);
            }
        });

        // Listen for State Updates (Mark as Read / Sync)
        document.addEventListener(EVENTS.NOTIFICATION_UPDATE, () => {
            // Update read classes in place instead of full re-render
            // This prevents destroying the DOM elements while the user is clicking them!
            if (this.modal && !this.modal.classList.contains('hidden') && this.listContainer) {
                const wrappers = this.listContainer.querySelectorAll('.market-stream-item-wrapper');
                wrappers.forEach(wrapper => {
                    const id = wrapper.getAttribute('data-alert-id');
                    if (id && notificationStore.readAnnouncements.has(id)) {
                        wrapper.classList.add('is-read');
                    }
                });
            }
        });

        // Clear All Logic
        document.getElementById('stream-clear-all')?.addEventListener('click', () => this.dismissAll());
    }

    /**
     * Internal helper to mark an announcement as read and update UI.
     */
    markAsRead(alertId, wrapperElement) {
        if (!alertId) return;

        // Persist to Store if not already there
        if (!notificationStore.readAnnouncements.has(alertId)) {
            notificationStore.markAnnouncementRead(alertId);
        }

        // Immediate Visual Feedback (Direct & Class-based)
        if (wrapperElement) {
            wrapperElement.classList.add('is-read');
            const bodyLink = wrapperElement.querySelector('.market-stream-item');
            if (bodyLink) {
                bodyLink.style.opacity = '0.35';
                bodyLink.style.filter = 'grayscale(80%)';
            }
            const dismissBtn = wrapperElement.querySelector('.stream-dismiss-btn');
            if (dismissBtn) dismissBtn.style.opacity = '0.2';
        }
    }

    openModal() {
        if (!this.modal) return;

        // v1149: Prevent double-opening if already visible
        if (!this.modal.classList.contains('hidden')) return;

        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        this.render(notificationStore.getMarketIndexAlerts());

        // Register with NavigationManager for Back Button support
        navManager.pushState(() => {
            if (this.modal && !this.modal.classList.contains('hidden')) {
                this.closeModal(true);
            }
        });
    }

    closeModal(fromNav = false) {
        if (!this.modal || this.modal.classList.contains('hidden')) return;

        this.modal.classList.add('hidden');
        document.body.style.overflow = '';

        // If closed via UI (X button) instead of Back Button, sync the browser history
        if (!fromNav) {
            navManager.popStateSilently();
        }
    }

    dismissAlert(alertId) {
        if (!alertId) return;
        notificationStore.dismissAnnouncement(alertId);

        const element = this.listContainer.querySelector(`.market-stream-item-wrapper[data-alert-id="${alertId}"]`);
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
                const match = text.match(/^\[?([A-Z]{3,4})\]?\b/);
                if (match) extractedCode = match[1];
            }

            const isCompany = extractedCode && extractedCode !== 'UNKNOWN' && extractedCode !== 'ASX' && extractedCode !== 'MARKET';
            const badgeClass = isCompany ? 'badge-company' : 'badge-report';
            const badgeText = isCompany ? extractedCode : 'MARKET';

            const href = alert.link || '#';
            const target = alert.link ? '_blank' : '_self';

            const isRead = notificationStore.readAnnouncements?.has(id);
            const readClass = isRead ? 'is-read' : '';
            const readStyle1 = isRead ? 'opacity: 0.35; filter: grayscale(80%);' : '';
            const readStyle2 = isRead ? 'opacity: 0.2;' : 'opacity: 0.3;';

            return `
                <div class="market-stream-item-wrapper ${readClass}" data-alert-id="${id}">
                    <a href="${href}" target="${target}" class="market-stream-item" style="${readStyle1}">
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
                        style="position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; z-index: 5; transition: opacity 0.2s; ${readStyle2}">
                        <i class="fas fa-times" style="font-size: 0.8rem;"></i>
                    </button>
                </div>
            `;
        }).join('');

        this.listContainer.innerHTML = html;

        // --- BULLETPROOF TAP & NAVIGATION BINDINGS ---
        // We use direct bindings here using a Smart Tap strategy (Touch + Distance)
        // to deliver instant feedback WITHOUT breaking native iOS/PWA link behavior.
        const wrappers = this.listContainer.querySelectorAll('.market-stream-item-wrapper');
        wrappers.forEach(wrapper => {
            const alertId = wrapper.getAttribute('data-alert-id');
            const link = wrapper.querySelector('.market-stream-item');
            const codePill = wrapper.querySelector('.code-pill');
            const dismissBtn = wrapper.querySelector('.stream-dismiss-btn');

            // 1. SMART TAP (Link Ghosting)
            if (link) {
                let startX = 0, startY = 0;
                let isScrolling = false;

                const handleTouchStart = (e) => {
                    if (e.target.closest('.code-pill') || e.target.closest('.stream-dismiss-btn')) return;
                    isScrolling = false;
                    startX = e.touches ? e.touches[0].clientX : e.clientX;
                    startY = e.touches ? e.touches[0].clientY : e.clientY;
                };

                const handleTouchEnd = (e) => {
                    if (e.target.closest('.code-pill') || e.target.closest('.stream-dismiss-btn')) return;
                    if (isScrolling) return;

                    const endX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
                    const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

                    // If finger moved more than 15px, it's a scroll or swipe, NOT a tap.
                    if (Math.abs(endX - startX) > 15 || Math.abs(endY - startY) > 15) {
                        return;
                    }

                    // 👉 DELIBERATE TAP DETECTED 👈
                    // Update visual state instantly.
                    // Because we do this on touchend (before the synthesized click), the browser 
                    // will paint the ghosting state correctly before the native tab transition occurs.
                    this.markAsRead(alertId, wrapper);
                };

                // Bind Touch (Mobile) and Mouse fallback (Desktop)
                link.addEventListener('touchstart', handleTouchStart, { passive: true });
                link.addEventListener('touchmove', () => { isScrolling = true; }, { passive: true });
                link.addEventListener('touchend', handleTouchEnd);

                // Desktop fallback for visual feedback
                link.addEventListener('mousedown', handleTouchStart);
                link.addEventListener('mouseup', handleTouchEnd);

                // We leave the native 'click' event completely ALONE.
                // We do NOT call preventDefault(). The browser naturally sees the <a target="_blank"> 
                // and executes the safest, most trusted new-tab intent possible.
            }

            // 2. VIEW ASX BUTTON
            if (codePill) {
                codePill.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const code = codePill.dataset.code;
                    if (code) document.dispatchEvent(new CustomEvent(EVENTS.ASX_CODE_CLICK, { detail: { code } }));
                });
            }

            // 3. DISMISS BUTTON
            if (dismissBtn) {
                dismissBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.dismissAlert(alertId);
                });
            }
        });
    }

}

// Singleton for easy import in main.js
export const marketIndexController = new MarketIndexController();
