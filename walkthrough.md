# Architectural Handover: ASX Watchlist Refactor

## 1. Executive Summary
Successfully transitioned the ASX Watchlist application from an "Append-Only" legacy structure to a "Decoupled Architecture". Key achievements include:
- **Sanitized Global Scope:** Removed fragile `window` assignments.
- **Centralized Logic:** consolidated magic strings into a single registry (`AppConstants.js`).
- **Standardized CSS:** Organized `style.css` into a strict 6-section categorical standard.
- **Event-Driven:** Implemented a robust CustomEvent bridge for component communication.

## 2. The New CSS Standard
All styles in `style.css` must strictly adhere to the following 6-section structure. Do not place styles randomly.

1.  **Variables & Root**: Define colors, fonts, and global tokens.
2.  **Base & Reset**: Browser normalizations and HTML element defaults.
3.  **Components**: specific UI modules (Cards, Modals, Sidebar).
4.  **Utilities**: Helper classes (`.hidden`, `.text-up`, `.flex-center`).
5.  **Theme Overrides**: Dark mode specifics (e.g., `body.dark-theme`).
6.  **Media Queries**: All responsive logic, consolidated at the bottom.

## 3. Logic Rules: The Registry
Hardcoded strings are **strictly forbidden** for structural classes. Use `AppConstants.js`.

### Bad vs. Good
x **Bad (Forbidden):**
```javascript
div.className = 'share-card trend-up';
if (mode === 'view-table') ...
```

✓ **Good (Required):**
```javascript
import { CSS_CLASSES } from '../utils/AppConstants.js';

div.className = `${CSS_CLASSES.CARD} ${CSS_CLASSES.TREND_UP}`;
if (mode === CSS_CLASSES.VIEW_TABLE) ...
```

**How to extend:**
To add a new class, first add the key-value pair to `CSS_CLASSES` in `modules/utils/AppConstants.js`, then import it.

## 4. Event Architecture
Do **not** call methods on `window` or other controllers directly from the View. Use `CustomEvent` to request actions.

### Triggering an Action (ViewRenderer.js)
```javascript
const event = new CustomEvent('request-edit-share', { detail: { id: stock.id } });
document.dispatchEvent(event);
```

### Handling the Action (AppController.js)
```javascript
document.addEventListener('request-edit-share', (e) => {
    if (e.detail && e.detail.id) {
        this.modalController.openAddShareModal(e.detail.id);
    }
});
```

## 5. File Manifest
Key files involved in this refactor:
- `style.css`: The visual source of truth.
- `modules/utils/AppConstants.js`: The logic source of truth (Class Registry).
- `modules/controllers/AppController.js`: The Application Brain (Event Listener Hub).
- `modules/ui/ViewRenderer.js`: The Dumb UI Layer (Dispatches events, reads constants).
- `modules/ui/WatchlistUI.js`: Watchlist specific UI logic (Hardened).
- `modules/ui/HeaderLayout.js`: Responsible for Header HTML generation.

## 6. Verification: Header Architecture Remediation
- **Registry Compliance:** Added explicit class constants (`HEADER_TOP_ROW`, `CONTROLS_LEFT`, `ASX_TOGGLE_TEXT`) to `AppConstants.js`.
- **Structural Integrity:** Refactored `HeaderLayout.js` to build the DOM using ONLY these constants.
- **Module Activation:**
  - Verified `HeaderLayout` instantiation in `AppController.init()`.
  - Added Guard Clauses to `HeaderLayout.js` to prevent silent failures and ensure DOM presence.
  - Confirmed `WatchlistUI` uses robust event delegation on `document.body`, surviving Header DOM replacement.
- **Final Polish:**
  - **Interaction Model**: Implemented `:hover` highlight (Coffee Color) for Watchlist Title.
  - **Vertical Spacing**: Enforced distinct containers with fixed min-heights (48px top, 44px bottom).

---

## Notification System Fixes & Revisions

### 1. Hardened Master Select & Sector Recovery
- **Direct State Update**: Implemented a critical fix where Master Select (All/None) and Sector-level bulk actions now update `AppState.preferences` *immediately* before triggering a UI refresh. This prevents the re-render cycle from using stale data and rolling back the user's selection to "None".
- **Initial Render Fix**: Corrected `_updateValuesOnly` to properly handle the `null` (All Sectors) state. Previously, it was defaulting to an empty list `[]` during the initial modal populate, causing a de-sync.
- **Summary Board IDs**: Added the missing `ind-override` ID to the Watchlist Override tile, enabling the status indicator dot to update correctly.
- **Dynamic "All" Detection**: Improved the logic for detecting the "All Sectors" state. The system now compares the number of checked boxes against the *rendered* count, ensuring "Select All" works even if there's a minor discrepancy in industry counts.
- **Visibility Standard**: Ensured the bell button itself (and its container) are explicitly unhidden whenever a non-zero count is processed, overriding any previous dismissal state.

### 2. Badge Visibility Hardening
- **Self-Healing Logic**: Modified `NotificationUI.updateBadgeCount` to explicitly call `classList.remove('hidden')` on both the container AND the bell button if `count > 0`.
- **CSS Precision**: Defined `!important` display rules for `.hidden` on the bell elements to ensure JavaScript control is absolute.

### 3. Deep Diagnostics (Extreme Logging v2)
- Enhanced `NotificationStore.js` with `[DIAGNOSTIC]` logs that break down:
    - Current `userId` status.
    - Total raw hits vs user-specific hits.
    - Resulting filtered global alerts.
    - Detailed timestamp comparison against the `lastViewedTime` threshold.
- Enhanced `NotificationUI.js` and `HeaderLayout.js` to log the exact moment they receive and apply counts to the DOM.

### 4. Data Layer Hardening (Production Final)
- **Robust Timestamp Parsing**: Consolidated `NotificationStore.js` to handle all possible timestamp formats (Firestore `Timestamp`, ISO strings, raw ms).
- **Self-Healing `lastViewedTime`**: Added guards against invalid or future timestamps to prevent notifications from being permanently hidden.
- **UI Verification Injection**: Successfully utilized a temporary "1" badge injection to verify that the mobile UI pipeline (CSS animations, DOM updates) is 100% functional.
- **Root Cause Identified**: The backend (Apps Script) source code contains the logic to write timestamps (`t: nowIso`), but the **live Firestore data lacks them**. This confirms the backend script needs deployment.

---

## Verification Results

### Automated Tests (Backend)
- Backend writes to `CUSTOM_TRIGGER_HITS`, `GLOBAL_MOVERS_HITS`, and `HI_LO_52W_HITS` are confirmed, but currently lack the critical `t` timestamp field.

### Mobile Verification (Final Status)
- [x] **UI Pipeline**: Verified via debug injection that the bell and badge appear correctly on mobile.
- [x] **Logic**: The frontend logic is now "Production Ready" and correctly calculates `0` because without fresh backend timestamps, all alerts are interpreted as "old".
- [x] **Manual Control**: Added a "Mark Read" icon (double-check) to the modal header. Automatic badge clearing has been disabled.

> [!IMPORTANT]
> **Apps Script Deployment Required**:
> The final step to make the badge persist is to **Deploy the Apps Script** as a new version. This will start stamping new alerts with the correct time, which the frontend is now ready to detect as "New".
