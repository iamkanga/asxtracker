# Notification System: Conceptual Architecture & Rules

This document provides a forensic, conceptual teardown of the notification system. It contains the architectural logic, rule cascading, and fail-safes required to perfectly reconstruct or modify the engine, devoid of underlying technical file names or direct code references.

---

### 1. Conceptual Architecture: The "Zero-Cost" Dual Engine
The notification system is divided into two separate engines that share the same logical "brain", ensuring users get alerts immediately while browsing, as well as offline summaries. 

*   **The In-App Real-Time Engine**: Triggers UI badges, sidebar lists, and pinned alerts while the user has the application open.
*   **The Backend Reporting Engine**: A background process that runs at the market close to scan the final data and dispatch a Daily Digest email to eligible users.

**The "Zero-Cost" Data Model**: 
Instead of the database running complex, expensive queries for every individual user to figure out what alerts they need, the system flips the paradigm. The backend continuously calculates a massive **"Global Master List"** of all stocks moving in the market, all 52-week highs, and all 52-week lows. The user's device simply downloads this master list once, and the frontend app applies the user's specific rules and thresholds to whittle it down to the exact personalized notifications they should see.

---

### 2. The Three Types of Notifications & Their Triggers
The system classifies market movement into three distinct events.

#### A. Target Price Alerts (Personal Intent)
*   **How it works**: A user manually defines a specific price point for a stock on their watchlist and chooses a direction (`Above` or `Below`). 
*   **Trigger**: If the stock's current live price crosses that exact threshold, the alert fires. 
*   **Priority**: This is the highest-priority alert in the system. Because it represents explicit user intent, it overrides almost all global filters (such as sector filters or minimum price filters).

#### B. The Movers (Daily Surges & Dumps)
*   **How it works**: Tracks the general daily percentage and dollar movement of stocks.
*   **Trigger**: Fires when a stock's movement from the previous day's close equals or exceeds the user's defined % or $ thresholds. It calculates Gainers (Up) and Losers (Down) independently.

#### C. 52-Week Extremes (Highs & Lows)
*   **How it works**: Notifies the user when a stock reaches a major historical milestone.
*   **Trigger**: Fires when a stock hits **>= 99%** of its 52-week high, or physically drops to **<= 101%** of its 52-week low. These alerts operate independently of daily percentage movement (a stock might be flat on the day but still trigger a 52-week high alert).

---

### 3. User Controls & Custom Thresholds
To make the system work, the user has granular control over what "noise" gets through the gate. If a user does nothing, the app applies sensible defaults (e.g., a 3% or $1.00 move).

*   **Directional Thresholds (% and $)**: Users can set independent combinations for upward movement and downward movement. If a user sets "Up" to 5% and $0.50, a stock only needs to hit *one* of those markers to trigger an alert.
*   **Global Minimum Price**: A hard floor (e.g., $0.10). Any stock priced below this will normally not generate Mover alerts. This prevents users from being spammed by highly volatile "penny stocks."
*   **52-Week Minimum Price**: A secondary, entirely separate floor applied only to 52-week high/low alerts. 
*   **Master Toggles**: Users can globally flip switches to completely mute Movers, 52-Week alerts, or Personal Target alerts. 

---

### 4. The Rules & Overrides Pipeline (How it all comes together)
When the "Global Master List" hits the user's device, it is poured through a strict, sequential filtering funnel. This is where features like "Watchlist Overrides" and "Sector Overrides" interact. 

Here is the exact gauntlet an alert must survive to be shown to the user:

#### Step 1: Sector Filtering (The Whitelist)
Users can select specific industries they care about (e.g., "Technology", "Healthcare"). If a global alert belongs to an unselected sector, it is immediately discarded. 
*   *Exception: If the user leaves the sector selector completely blank, it defaults to "Show All Sectors".*

#### Step 2: The "Watchlist Override" (The VIP Pass)
Also known in the system as "Exclude Portfolio from Filters". This is a critical logical fork. If a user has this enabled, any stock sitting in their personal watchlist gets a "VIP Pass" that allows it to bypass certain global restrictions:
*   **Bypasses the Sector Filter**: Even if the user only wants "Technology" alerts, if a "Mining" stock is in their watchlist, the alert will still come through.
*   **Bypasses the Minimum Price**: Even if penny stocks are globally banned, a penny stock in their watchlist will still alert them.
*   *Crucial Caveat*: The VIP Pass **does not** bypass the actual `%` or `$` thresholds. The watchlist stock still has to prove it moved enough to be worthy of an alert (unless it hit an explicit Target Price, which always wins).

#### Step 3: The Mute Filter
Users can manually "Mute" specific stocks in their watchlist. This is an absolute kill-switch. If a stock is muted, it is obliterated from the pipeline immediately. It bypasses the VIP Pass, it bypasses Targets, and it will never generate an alert.

#### Step 4: Index / ETF Noise Reduction
The system actively detects if an alert belongs to a generic market index or an ETF (which move slowly and create broad noise). Global index alerts are heavily restricted unless the user has actively added that specific index to their personal watchlist.

---

### 5. Anomalies, Edge Cases, and Failsafes 
Because financial data can be volatile, delayed, or buggy from the source, the notification engine employs aggressive "health checks" before finalizing an alert.

*   **The Zombie Check**: If the server claims an alert happened, but the mathematical change is exactly 0% and $0.00, the system categorizes it as a "Zombie" (stale data) and kills the alert.
*   **The Phantom Data Guard (Truth Override)**: The frontend always cross-references the server's master list with its own live, down-to-the-second price feed. If the server is reporting a massive surge, but the live price shows the stock hasn't moved at all (Phantom Data), the alert is blocked.
*   **Direction Locking**: If the server reports a stock is a "Gainer", but the live price shows it has actually flipped and is now a "Loser" for the day, the notification is suppressed to prevent showing the user conflicting directional data.
*   **Target Hit Displacement**: Because "Personal Targets" are the highest priority, they will overwrite regular "Mover" alerts in the UI. However, if a stock temporarily hits a target and then falls back down, the system dynamically drops the Target Alert and restores the underlying Mover alert so the historical data of the day's movement isn't lost.
*   **Strict Zero Enforcement**: If a user explicitly types `0` into their threshold settings, the system interprets this as "None" (Disable), not "Alert me on 0% movement".

### 6. Architectural Summary (AI Core Directives)
If rebuilding or modifying this notification logic: Implemented using a **Retrieve -> Cross-Reference Live Data -> Sector Block -> Watchlist VIP Bypass -> Threshold Gate -> UI Render** architecture. The highest ruling principle is that explicit User Intent (Targets and Watchlists) almost always supersedes Global Constraints, provided the actual math of the market validates the alert via the Phantom and Zombie guards.
