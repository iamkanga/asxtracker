
/**
 * Reproduction Script for Kangaroo Icon Persistence
 * 
 * This script simulates the app initialization sequence to check if the Kangaroo icon
 * correctly restores its visibility state from persisted preferences.
 */

// Mock AppState and minimal environment
global.AppState = {
    preferences: {}, // Start empty to simulate fresh load
    user: { uid: 'test-user-123' }
};

global.document = {
    getElementById: (id) => {
        if (id === 'floating-bell-container') return null; // Simulate not found initially
        return {
            classList: {
                add: (cls) => console.log(`[DOM] Added class ${cls} to ${id}`),
                remove: (cls) => console.log(`[DOM] Removed class ${cls} from ${id}`),
                contains: (cls) => false
            },
            style: {},
            querySelector: () => null
        };
    },
    createElement: (tag) => {
        return {
            id: '',
            className: '',
            style: {},
            classList: {
                add: () => { },
                remove: () => { },
                contains: () => false
            },
            appendChild: () => { },
            addEventListener: () => { },
            querySelector: () => null,
            innerHTML: ''
        };
    },
    body: {
        appendChild: () => { }
    },
    addEventListener: () => { }
};

global.CSS_CLASSES = { HIDDEN: 'hidden', FLOATING_BELL_CONTAINER: 'floating-bell-container' };
global.IDS = { FLOATING_BELL: 'floating-bell', FLOATING_BELL_CONTAINER: 'floating-bell-container' };
global.KANGAROO_ICON_SVG = '<svg>kangaroo</svg>';

// Mock notificationStore
global.notificationStore = {
    getBadgeCounts: () => ({ total: 5, custom: 2 }),
    getScannerRules: () => ({})
};

// Import NotificationUI (mocking imports)
// In a real env we'd import, but here we'll paste the critical logic to test isolation
// copying the robust preference check from NotificationUI.js line 115
// and the sync logic

async function testIconPersistence() {
    console.log("--- Starting Kangaroo Icon Persistence Test ---");

    // 1. Simulate LocalStorage having 'showBadges' = true (User wants it ON)
    // transforming legacy key or new key?
    // AppService uses 'showBadges' in cloud, and NotificationUI init might check AppState.

    // Scenario: User refresh. AppState is fresh (empty).
    // LocalStorage might have a value?
    // NotificationUI code: const showBadges = AppState?.preferences?.showBadges !== false;

    // CASE A: AppState is empty/undefined initially (Default should be TRUE/Visible)
    console.log("Test Case A: Default Initialization (No Prefs)");
    let showBadges = AppState?.preferences?.showBadges !== false;
    console.log(`AppState.preferences.showBadges is undefined. Result: ${showBadges}`);
    if (showBadges !== true) console.error("FAIL: Should default to visible!");
    else console.log("PASS: Defaults to visible.");

    // CASE B: User explicitly disabled it previously.
    // Simulate cloud load eventually updates AppState
    console.log("\nTest Case B: User Disabled (Cloud Load)");
    AppState.preferences.showBadges = false;
    showBadges = AppState?.preferences?.showBadges !== false;
    console.log(`AppState.preferences.showBadges is false. Result: ${showBadges}`);
    if (showBadges !== false) console.error("FAIL: Should be hidden!");
    else console.log("PASS: Respects disabled state.");

    // CASE C: The 'Undefined' Trap
    // If AppController sets AppState.preferences = {} initially, showBadges is undefined.
    // !== false returns TRUE.

    // BUT what if the logic in `updateBadgeCount` has a flaw?
    /*
        const showBadges = AppState?.preferences?.showBadges !== false; // is TRUE
        if (!showBadges || validCount === 0) {
             bell.classList.add(CSS_CLASSES.HIDDEN);
        }
    */
    // If I have 0 notifications, it hides the bell!
    // "Right when the user has no notifications the kangaroo is still jumping out That shouldn't happen"
    // Wait, the user said: "The kangaroo icon should dismiss itself [if no notifications/all disabled]"

    // The User's CURRENT issue: "Restore Kangaroo Icon Persistence upon Hard Reload"
    // "ensure the 'Kangaroo' icon's visibility state is remembered across hard reloads"

    // If I hide it (Long Press -> Dismiss), AppState.preferences.showBadges becomes FALSE.
    // On Reload, if AppState is re-initialized empty, it defaults to TRUE (Visible).
    // IT NEEDS TO READ FROM LOCALSTORAGE BEFORE CLOUD SYNC!

    // Check AppController.js to see if it reads from localStorage into AppState.preferences during init.
    console.log("\nChecking Logic: We depend on AppState being populated correctly on load.");
}

testIconPersistence();
