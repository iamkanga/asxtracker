---
trigger: always_on
---

🧱 SYSTEM ARCHITECTURE & OPERATIONAL CONSTITUTION (v2.3 - Modular Edition)
STATUS: [ACTIVE LAW]
INSTRUCTION: READ AND ACKNOWLEDGE. THIS IS THE HIGHEST AUTHORITY IN THE CONTEXT.

1. Core Philosophy
| Aspect | Standard |
| :--- | :--- |
| Architecture | Strict MVC (Model-View-Controller) |
| Pattern | Decoupled & Event-Driven |
| Resilience | Asynchronous Readiness & Null-Safety |
| Goal | "Bulletproof" modularity. Zero global pollution. Zero magic strings. No Race Conditions. |

2. Directory Structure & Responsibilities
| File/Folder | Role | Responsibility |
| :--- | :--- | :--- |
| main.js | Controller | Bootstraps the app with try/catch safety wrappers. |
| AppController.js | Controller | The Brain. Manages logic via Event Listeners. NEVER assigns functions to window. |
| ViewRenderer.js | View | The Artist. Generates HTML. Must check Store.isReady before rendering. |
| AppConstants.js | Registry | The Single Source of Truth for CSS_CLASSES, EVENTS, and IDS. |
| /styles/ | CSS Home | The Modular Style System. New styles MUST live here. |
| style.css | Legacy | DEPRECATED SKELETON. Do NOT add new styles here. |

3. ⚠️ Non-Negotiable Architectural Mandates

I. THE REGISTRY RULE (Anti-Magic String)
You are FORBIDDEN from using hardcoded string literals for CSS classes or IDs in JavaScript.
```javascript
// ❌ Illegal (Magic String):
div.classList.add('share-card');

// ✅ Required (Registry):
div.classList.add(CSS_CLASSES.CARD); // Imported from AppConstants.js
```

II. THE EVENT BUS RULE
Components must communicate via standard CustomEvent. Do not rely on global functions.
```javascript
// ❌ Illegal:
window.refreshWatchlist();

// ✅ Required:
document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
```

III. THE "READY" RULE (Anti-Race Condition)
CRITICAL: UI Modules must NEVER assume data is loaded immediately.
- Stores: Must initialize `this.isReady = false`. Must dispatch `EVENTS.NOTIFICATION_READY` when data is fetched.
- UI: Must check `if (!Store.isReady)` in the render method. If false, show a loading state/spinner.

IV. THE NULL GUARD RULE (Anti-Crash)
Never access external services, global stores, or deep object properties without safety checks.
```javascript
// ❌ Illegal (Risk of Crash):
userStore.subscribe(...);
const badge = AppState.preferences.showBadges;

// ✅ Required (Safe):
if (userStore) userStore.subscribe(...);
const badge = AppState.preferences?.showBadges;
```

V. THE MODULAR CSS STANDARD (Hierarchy)
Styles are now strictly categorized. New code must be injected into the specific module matching its role:
1. `styles/1-variables.css`: Root tokens, colors, and fonts.
2. `styles/2-base.css`: Global resets and standard HTML tags.
3. `styles/components/`: Reusable UI elements (Buttons, Cards, Modals, Toasts).
4. `styles/features/`: Complex functional UI (Dashboard, Research, Calculator, Settings).
5. `styles/5-utilities.css`: Atomic helper classes (.hidden, .text-center).
6. `styles/7-media-queries.css`: Global responsiveness (Must remain last in cascade).

**Mandate**: Never dump CSS at the bottom of a file. Never use the root `style.css` for new features.

VI. ZERO GLOBAL POLLUTION
Never attach variables or functions to window. Instances must be scoped to `main.js` or passed via dependency injection.

4. Operational Rules for the Executor
| Rule | Action |
| :--- | :--- |
| Consult walkthrough.md | This file in the root contains specific implementation patterns. |
| Context-Complete | Provide full logical blocks, not snippets. Do not use // ... rest of code. |
| Destructive Protection | If a user request would violate the Registry Rule or Global Rule, STOP and warn. |
| Logic Hardening | Always wrap external service calls and initialization logic in try/catch blocks. |

When modifying or troubleshooting any alerts or notifications, you MUST read the `NOTIFICATION_ENGINE.md` file first to understand the architectural data flow, the watchlist overrides, and the threshold logic.