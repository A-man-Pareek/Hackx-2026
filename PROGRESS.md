# Hackx-2026 SaaS Backend Progress

This document tracks everything that has been successfully built and integrated into the SaaS Review Management System backend across Phase 1, Phase 2, and Phase 3.

---

## Phase 1: Authentication & Authorization Core

A secure foundation was built using **Node.js, Express.js, Firebase Admin SDK, and Firestore**.

### Key Infrastructure Built:
1. **Firebase Integration (`config/firebase.js`)**: Server-side initialization of Firebase Admin to securely verify ID tokens and query Firestore without exposing client secrets.
2. **Server Entrypoint (`server.js`)**: Configured Express with standard JSON parsing, CORS, Environment Variable loading, and a modular routing structure.
3. **Automated Error Handling**: Enforced a consistent JSON schema across all API endpoints: `{ success: boolean, data?: any, error?: string, code?: number }`.
4. **Comprehensive Unit Testing Suite (`tests/auth.test.js`)**: 100% passing test coverage checking token edge cases, missing parameters, and preventing unauthorized role escalation.

### Authentication & Middleware (`modules/auth`):
* **`authMiddleware.js (authenticate)`**: Intercepts `Authorization: Bearer <token>`, validates the Firebase JWT, confirms the user exists in the Firestore `users` collection, verifies they are `isActive: true`, and seamlessly attaches their payload securely to the `req.user` object for downstream use.
* **`roleMiddleware.js (authorizeRoles, authorizeBranch)`**: 
  * `authorizeRoles`: Reusable logic to strictly lock endpoints down to specific allowed roles.
  * `authorizeBranch`: Reusable logic to ensure strict branch data isolation. `admin` can see all branches, while `branch_manager` and `staff` are securely locked out from accessing records that do not match their assigned `branchId`.

### Auth Endpoints (`authRoutes.js`):
1. **`POST /auth/register`**: Used to natively attach role and branch metadata to a Firebase Auth UID. Protected securely so that only an `admin` user is allowed to spawn `admin`, `branch_manager`, or `staff` accounts.
2. **`GET /auth/me`**: Seamlessly retrieves and replies with the authenticated user’s metadata.
3. **`PATCH /auth/deactivate/:uid`**: Soft-deletes users securely by setting `isActive: false`.



## Phase 2: Data Models & API Integration

The architecture was expanded and realigned to strictly match the provided TypeScript schemas (`models.ts`) and mock datasets (`seed.html`).

### Key Infrastructure Refactored:
1. **Role System Normalization**: Hardcoded string roles were strictly normalized across the entire codebase. Replaced legacy roles with: `'admin'`, `'branch_manager'`, and `'staff'`.
2. **Middleware Alignment**: `authController` and `roleMiddleware` were adapted seamlessly to use these exact literal strings. Verified by rewriting the `Jest` unit tests to execute perfectly against the new roles.

### New API Resources Scaffolded:

All endpoints respect the robust middleware. For example, a `GET` request will grant an `admin` the entire global collection, whereas a `branch_manager` will automatically be scoped via a Firestore `.where('branchId', '==', userBranchId)` filter securely enforced by the backend context (`req.user.branchId`).

#### Branches (`modules/branches`)
* **`GET /branches`**: Retrieves branches based on user scope.
* **`POST /branches`**: Admin-only route to instantiate a new branch in the ecosystem, defaulting vital stats like `totalReviews` to 0.

#### Staff (`modules/staff`)
* **`GET /staff`**: Retrieves staff filtered seamlessly by the user's `branchId`.
* **`POST /staff`**: Allows managers/admins to securely register new staff records assigned to their respective branches.

#### Reviews (`modules/reviews`)
* **`GET /reviews`**: Retrieves consumer reviews scoped appropriately by branch context.
* **`POST /reviews`**: Mocks the creation of new reviews locally. Parses 1-5 star ratings to auto-generate baseline sentiment metrics (`positive`, `neutral`, `negative`) and severity thresholds. Defaults `responseStatus` to `pending`.

#### Responses (`modules/responses`)
* **`GET /responses?reviewId=123`**: Fetches all responses natively chained to a given review context.
* **`POST /responses`**: Employs a **Firestore Batch Transaction** to submit the `responseText` into a new document while simultaneously updating the parent `review` document's `responseStatus` to `responded`. Ensures 100% data consistency.

---

## Phase 4: External Data Synchronization (Google Places API)

The backend was expanded via the `server.js` entrypoint to natively interact directly with Google's REST Places APIs. This automates review ingestion dynamically creating Branch environments and harvesting live organic reviews securely.

### New `models.ts` Properties Supported:
The entire system was aligned to support incoming metadata from Google.
* **Branches:** Appended `placeId` for external referencing.
* **Reviews:** Appended `externalReviewId`, `authorName`, `externalTimestamp`, and `syncedAt` to deduplicate and cache live Google Review payloads. Added the explicit `source: "google"` origin state.

### New Sync Modules Scaffolding (`server.js`):
1. **`POST /api/search-and-add` (Onboarding/Discovery Endpoint)**
   - Takes a plain text string `name` & `location`.
   - Fires a `TextSearch` query to Google Places to locate the definitive global valid `place_id`.
   - Follows up automatically with a `PlaceDetails` query extracting real `name`, `rating`, `user_ratings_total`, and an organic payload of maximum 5 organic recent `reviews`.
   - **Automated Seeding:** Generates a new Branch record internally and forcefully injects the historical reviews into the system, returning `{ branchId, message }`.
2. **`POST /api/sync-reviews` (Cron/Webhook Hydration Engine)**
   - Takes a `branchId`. Looks up the associated `placeId` from Firestore.
   - Pings Google Places API retrieving the freshest array of public feedback.
   - **Intelligent Deduplication Engine:** Iterates across the payload constructing `externalReviewId = author_name + externalTimestamp`. Verifies against the Firestore index bypassing pre-existing matches securely to prevent spam loops or overlapping aggregation metrics.
   - Saves all organic reviews instantly with the flag `sentiment: "pending"`, ensuring they are instantly caught by the asynchronous Phase 3 AI analyzer pipelines!

---

## Phase 3: AI Review Analysis & Escalation

Upgraded the rudimentary Review module to support structured OpenAI-based sentiment analysis, category classification, and intelligent escalation. This entirely replaced the Phase 2 rule-based logic with NLP capabilities while strictly adhering precisely to the product PRD restrictions.

### AI Infrastructure (`modules/ai`)
1. **OpenAI SDK Engine**: Safely queries GPT models tracking API conditions and JSON schemas robustly (`aiService.js`).
2. **Prompt Templates (`promptTemplates.js`)**: Designed a constrained deterministic system parsing engine enforcing that zero markdown or explanations are returned, limiting replies to valid JSON matching `{ sentiment, sentimentConfidence, category, categoryConfidence }`.

### The 7-Step Escalation Workflow (`reviewController.js POST /reviews`):
The creation of a review now follows a rigid sequential contract:
1. **Validate Context**: Branch ID, source, texts, and user properties evaluated. 
2. **Base Configuration**: Construct and persist a base Review object with legacy parameters mapping simple variables (`rating: 1`, `sentiment: 'negative'`). Insert to Firestore (`status: 'pending'`).
3. **AI Evaluation (Non-blocking)**: Offloads the reviewText asynchronous parsing wrapping the OpenAI call wrapped with a `Promise.race()` to enforce a strict **5000ms server timeout**. This safely prevents client interfaces from dragging down on dead HTTP routes.
4. **Receiving AI Enrichments**: Mapped `finalSentiment` and `categoryConfidence` mappings securely resolving into memory. If the AI engine timed-out or threw an API exception, this gracefully swallowed into `aiProcessingError: null` preserving UX reliability natively.
5. **Dynamic Escalation Calculation**: Overrides generic star metrics intelligently appending `isEscalated: true` exactly matching the parameters: if `finalSentiment === 'negative'` or if the native `rating <= 2`.
6. **Apply AI Enrichment**: Performs an asynchronous `.update()` transaction persisting AI parameters securely mapped to the originating review.
7. **Responder Return**: Output formatted responding identical to PRD restrictions providing precise output schemas instantly returning scalar classifications `isEscalated, escalationStatus`.

### Testing and Validation Upgrade (`tests/review.test.js`):
Jest logic rewritten entirely deploying exact mock wrappers over `firebase/firestore`.
- 100% Pass Rate spanning AI generation timeouts, missing keys, forced escalations securely validating `POST /reviews`.
