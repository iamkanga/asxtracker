# API Key Lockdown Guide — ASX Tracker PWA

This guide provides step-by-step instructions for restricting your Firebase API key in the Google Cloud Console. Even though Firebase API keys are designed to be public (they identify your project, not grant access), restricting them prevents quota abuse and unauthorized usage from non-app origins.

---

## Step 1: Access API Key Settings

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Select the project: **asx-watchlist-app**
3. Find your **Browser key** (the one matching your `apiKey` in `AuthService.js`)
4. Click the key name to open its settings

---

## Step 2: Set Application Restrictions

Under **"Application restrictions"**, select **HTTP referrers (websites)**.

Add the following referrer patterns (replace with your actual domains):

```
https://yourdomain.com/*
https://www.yourdomain.com/*
https://asx-watchlist-app.firebaseapp.com/*
https://asx-watchlist-app.web.app/*
http://localhost/*
http://127.0.0.1/*
```

> **Note:** Include `localhost` entries during development. Remove them before production deployment if the app is publicly hosted.

---

## Step 3: Set API Restrictions

Under **"API restrictions"**, select **Restrict key** and enable **only** these 3 APIs:

| # | API Name | Used By | Purpose |
|---|---|---|---|
| 1 | **Identity Toolkit API** | `firebase-auth.js` | Google Sign-In popup, session management |
| 2 | **Token Service API** | `firebase-auth.js` | OAuth token refresh (`getIdToken()`) |
| 3 | **Cloud Firestore API** | `firebase-firestore.js` | User data CRUD (shares, watchlists, prefs, alerts) |

### APIs You Do NOT Need

| API | Reason |
|---|---|
| **Google Sheets API** | Frontend does **not** call Sheets directly. All data flows through the Apps Script Web App URL server-side. |
| **Google Analytics for Firebase** | `measurementId` exists in config but no `firebase-analytics.js` SDK is imported. |
| **Firebase Installations API** | No `firebase-installations.js` imported. Firebase JS SDK v11+ doesn't require it for Auth + Firestore. |
| **Cloud Storage / Messaging** | No storage or push notification SDKs imported. |

### About the Apps Script Web App

The `script.google.com/macros/s/.../exec` URL is a separate execution channel:
- Runs under the **script owner's** Google account (server-side), not the user's browser
- Uses its own OAuth credentials, **not** the Firebase API key
- Requires **no** API enablement in the key restrictions
- Handles Google Sheets, Yahoo Finance, and Gemini API access via `UrlFetchApp`

> **⚠️ Troubleshooting:** If the app breaks after restricting, check browser DevTools for `403 PERMISSION_DENIED` errors — the error message will name the exact API to add.

**Do NOT enable:** Maps, YouTube, Translate, or any other API.

---

## Step 4: Save & Test

1. Click **Save**
2. Wait 5 minutes for restrictions to propagate
3. Test the app from your verified domain — it should work normally
4. Test from an unauthorized origin (e.g., a different website) — requests should be rejected with a `403` error

---

## Step 5: Enable Quota Alerts (Recommended)

1. Go to [Google Cloud Console → APIs & Services → Dashboard](https://console.cloud.google.com/apis/dashboard)
2. Select each enabled API
3. Under **Quotas & System Limits**, click **Edit Quotas**
4. Set reasonable daily limits (e.g., 10,000 requests/day for Identity Toolkit)
5. Enable **Budget alerts** under [Billing → Budgets & Alerts](https://console.cloud.google.com/billing/budgets)

---

## Optional: Firebase App Check

For an additional layer of protection, enable [Firebase App Check](https://firebase.google.com/docs/app-check):

1. Go to [Firebase Console → App Check](https://console.firebase.google.com/project/asx-watchlist-app/appcheck)
2. Register your web app with **reCAPTCHA Enterprise** provider
3. Enforce App Check for **Cloud Firestore** and **Authentication**
4. This ensures only verified app instances can call Firebase APIs, even if the API key is known

> **Important:** App Check adds client-side verification overhead. Test thoroughly before enforcing in production.

---

## Summary Checklist

- [ ] HTTP referrer restrictions set to app domain(s) only
- [ ] API restrictions limited to 3 required APIs (Identity Toolkit, Token Service, Cloud Firestore)
- [ ] Localhost entries removed for production
- [ ] Quota alerts configured
- [ ] Firebase App Check evaluated and optionally enabled
