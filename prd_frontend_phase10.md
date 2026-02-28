# Product Requirements Document (PRD): Phase 10 - Frontend Master Dashboard Interface

## 1. Overview

### 1.1 Objective
Phase 10 transitions development entirely to the **Frontend Dashboard** layer. With the backend API robustly handling authentication, automated cron synchronization, Gemini AI analysis, and WebSocket broadcasts, the objective of Phase 10 is to build a modern, high-performance, and visually appealing web interface. This interface will allow Restaurant Managers to view real-time data, filter reviews, and act upon escalated AI feedback seamlessly.

### 1.2 Scope
- **App Layout & State Management:** Establishing the core Dashboard shell (Sidebar, Header toolbar, dynamic Main Content area) and securing the routes using the active JWT token.
- **Real-Time KPI Dashboard:** A landing page displaying macro analytical data (Average Rating, Total Volume, Sentiment breakdown) fetched from our previously built `GET /api/analytics/dashboard` endpoint.
- **WebSocket Live Review Feed:** A dedicated "Inbox" style feed that actively listens to `socket.io` broadcasts and dynamically injects newly synced/analyzed Google and Internal reviews without requiring page refreshes.
- **Manual Operations & AI Drafting:** Integrating action buttons on individual reviews allowing managers to "Suggest AI Reply" or manually override miscategorized AI labels.

---

## 2. User Stories

1. **As a Restaurant Manager**, I want to log in and immediately see my branch's overall health metrics (KPI cards and sentiment breakdown) so I can quickly gauge current performance.
2. **As a Branch Executive**, I want my review inbox to update automatically in real-time as customers post new reviews, so I don't have to constantly hit refresh.
3. **As a Customer Service Rep**, I want a one-click button to generate a Gemini contextual response to a negative review so I can effectively handle complaints faster.
4. **As an Admin**, I want to visually filter the live feed by 'Sentiment' or 'Category' to isolate critical issues (e.g., all "Cleanliness" reviews).
5. **As a Manager**, I want a button to export the current view into a CSV spreadsheet for my weekly corporate report.

---

## 3. Technical Requirements

### 3.1 Technology Stack (Frontend)
- **Structure:** Vanilla HTML5 Semantic Elements.
- **Styling:** Vanilla CSS (CSS Variables, Flexbox, Grid, Glassmorphism aesthetics matching the Login Page).
- **Interactivity:** Vanilla JavaScript (ES6 Modules) - NO heavy framework overhead like React/Vue for Phase 10 to maintain pure speed and raw API integration capabilities.
- **Communication:** `fetch` API for REST commands, `socket.io-client` for real-time listeners.
- **Charting:** Chart.js (or equivalent lightweight library) to render the mathematical metrics.

### 3.2 Key Components to Build

**A. `dashboard.html` (The Shell)**
- Permanent left-aligned sidebar with navigation icons (Overview, Reviews Inbox, Settings).
- Top header featuring the logged-in User's Profile name, Branch selector, and a "Logout" action.

**B. `css/dashboard.css` (The Styling Engine)**
- High-contrast typography.
- Status badges matching the AI Sentiment outputs (e.g., Red for Negative, Green for Positive, Orange for Escalated).
- Smooth CSS transitions for live-injecting WebSocket feed elements.

**C. `js/dashboard.js` (The Controller)**
- **Bootstrap Routine:** Validate JWT token in `localStorage` -> fetch `/auth/me` -> If invalid, redirect to `login.html`.
- **API Fetching Layer:** Generic wrapper to attach Bearer tokens automatically to all outbound requests.
- **Socket Initializer:** Establish connection to `ws://localhost:8000` specifying the User's Bearer token for secure branch subscription.

**D. The "Reviews Engine" UI Matrix**
- A scrollable list rendering review cards.
- Each card must display: Source logo (Internal/Google), Star Rating, Snippet, AI Sentiment Badge, and AI Category Badge.
- Hidden dropdown options on cards for API actions: `Suggest Reply` (triggers loading spinner -> opens modal with AI text) and `Change Category` (PATCH request).

---

## 4. UI / UX Aesthetic Directives

- **Color Palette:** Deep navy/dark backgrounds mapping to neon interactive accents (Cyan/Indigo) to create a premium "Command Center" feel.
- **Micro-Interactions:** Buttons must possess hover states (scale, brightness), and modals must animate in using ease-out transforms. 
- **Empty States:** Beautiful vector illustrations or centered informative text if a branch currently has "0 Reviews" or "0 Escalations".

---

## 5. End-to-End Acceptance Criteria

1. **Gatekeeping:** A user navigating to `/dashboard.html` without a token is thrown back to `/login.html` instantly.
2. **Data Hydration:** Upon loading, the application successfully calls `GET /api/analytics/dashboard` and paints the Top KPI numbers cleanly onto the screen.
3. **Real-Time Injection:** If a backend script manually pushes a new review via the test suite, the UI Feed should visibly animate and append the new review at the very top of the list instantly.
4. **AI Generation Modal:** Clicking "Draft Reply" places a loading state on the button, fetches the string from the Gemini service, and displays it in a readable textarea for the manager to copy.
5. **CSV Download:** Clicking "Export Report" hits `/api/analytics/export` and successfully utilizes browser blob creation to trigger a physical `.csv` file download.

---

## 6. Development Phasing Timeline (Phase 10 Sandbox)

- **Step 1:** Create `dashboard.html` and `dashboard.css`. Build the static visual wireframe (Cards, Sidebar, Header layout).
- **Step 2:** Implement `auth.js` helper functions inside the frontend to protect the HTML route and parse the LocalStorage.
- **Step 3:** Perform physical wiring of the `GET /dashboard` endpoints to populate numerical data.
- **Step 4:** Build the List interface and append `socket.io-client` CDNs to facilitate real-time live data syncing.
- **Step 5:** Wire up the specialized interactive buttons (Draft Reply, CSV Export).
