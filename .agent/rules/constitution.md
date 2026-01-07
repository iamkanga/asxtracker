---
trigger: always_on
---

🧱 SYSTEM ARCHITECTURE & OPERATIONAL CONSTITUTION (v2.2 - Hardened Edition)STATUS: [ACTIVE LAW]INSTRUCTION: READ AND ACKNOWLEDGE. THIS IS THE HIGHEST AUTHORITY IN THE CONTEXT.1. Core PhilosophyAspectStandardArchitectureStrict MVC (Model-View-Controller)PatternDecoupled & Event-DrivenResilienceAsynchronous Readiness & Null-Safety (New)Goal"Bulletproof" modularity. Zero global pollution. Zero magic strings. No Race Conditions.2. Directory Structure & ResponsibilitiesFileRoleResponsibilitymain.jsControllerBootstraps the app with try/catch safety wrappers.AppController.jsControllerThe Brain. Manages logic via Event Listeners. NEVER assigns functions to window.ViewRenderer.jsViewThe Artist. Generates HTML. Must check Store.isReady before rendering.AppConstants.jsRegistryThe Single Source of Truth for CSS_CLASSES, EVENTS, and IDS.style.cssStyleFollows the 7-Section Standard. No "append-only" coding.3. ⚠️ Non-Negotiable Architectural MandatesI. THE REGISTRY RULE (Anti-Magic String)You are FORBIDDEN from using hardcoded string literals for CSS classes or IDs in JavaScript.JavaScript// ❌ Illegal (Magic String):
div.classList.add('share-card');

// ✅ Required (Registry):
div.classList.add(CSS_CLASSES.CARD); // Imported from AppConstants.js
II. THE EVENT BUS RULEComponents must communicate via standard CustomEvent. Do not rely on global functions.JavaScript// ❌ Illegal:
window.refreshWatchlist();

// ✅ Required:
document.dispatchEvent(new CustomEvent(EVENTS.REFRESH_WATCHLIST));
III. THE "READY" RULE (Anti-Race Condition)CRITICAL: UI Modules must NEVER assume data is loaded immediately.Stores: Must initialize this.isReady = false. Must dispatch EVENTS.NOTIFICATION_READY (or similar) when data is fetched.UI: Must check if (!Store.isReady) in the render method. If false, show a loading state or spinner.IV. THE NULL GUARD RULE (Anti-Crash)Never access external services, global stores, or deep object properties without safety checks.JavaScript// ❌ Illegal (Risk of Crash):
userStore.subscribe(...);
const badge = AppState.preferences.showBadges;

// ✅ Required (Safe):
if (userStore) userStore.subscribe(...);
const badge = AppState.preferences?.showBadges;
V. THE CSS STANDARD (7-Section Structure)You must respect the "Cascade." New styles must be injected into their specific logical section:Variables & Root (Colors, fonts)Base & Reset (Standard HTML tags)Components (Reusable: Buttons, Cards, Inputs, Modals)Features (Specific: Watchlist, Search, Settings, Sort UI)Utilities (Helpers: .text-center, .hidden)Theme Overrides (Dark mode specifics)Media Queries (Responsiveness) <-- MUST BE LASTConstraint: Do NOT dump code at the bottom. Do NOT use !important unless overriding a third-party library.VI. ZERO GLOBAL POLLUTIONNever attach variables or functions to window. Instances must be scoped to main.js or passed via dependency injection.4. Operational Rules for the ExecutorRuleActionConsult walkthrough.mdThis file in the root contains specific implementation patterns.Context-Complete OutputProvide full logical blocks, not snippets. Do not use // ... rest of code.Destructive ProtectionIf a user request would violate the Registry Rule or Global Rule, STOP and warn the user.Logic HardeningAlways wrap external service calls and initialization logic in try/catch blocks.