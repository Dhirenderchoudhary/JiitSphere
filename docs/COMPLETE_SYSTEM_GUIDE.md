# JPortal — Complete System Guide

> **Everything you need to understand, from zero knowledge to full mastery.**
> This document explains every single piece of the system — what we built, why, how we bypass the JIIT WebPortal, every API endpoint, every file, every flow, every trick.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [The Big Picture — Architecture Overview](#2-the-big-picture--architecture-overview)
3. [How the JIIT WebPortal Works (The Target System)](#3-how-the-jiit-webportal-works-the-target-system)
4. [How We Bypass It — The Relay & Encryption System](#4-how-we-bypass-it--the-relay--encryption-system)
5. [Backend — Every File, Every Line Explained](#5-backend--every-file-every-line-explained)
6. [Frontend — Every File, Every Component Explained](#6-frontend--every-file-every-component-explained)
7. [The Complete Login Flow (Step by Step)](#7-the-complete-login-flow-step-by-step)
8. [The Complete Data Fetching Flow](#8-the-complete-data-fetching-flow)
9. [Every API Endpoint](#9-every-api-endpoint)
10. [The Study Material System](#10-the-study-material-system)
11. [Security Architecture](#11-security-architecture)
12. [How Frontend Connects to Backend](#12-how-frontend-connects-to-backend)
13. [Session Management](#13-session-management)
14. [Semester Sorting & Data Normalization](#14-semester-sorting--data-normalization)
15. [File-by-File Reference](#15-file-by-file-reference)

---

## 1. What Is This Project?

**JPortal** (a.k.a. JIITStudyMaterial) is a web application with two purposes:

1. **Study Material Platform** — A place for JIIT students to find study materials (PDFs, slides, PYQs) organized by degree, branch, semester, and subject. Materials are stored in AWS S3 / CloudFront.

2. **Portal Bypass / Wrapper** — The main feature. The official JIIT WebPortal (`https://webportal.jiit.ac.in:6011`) is slow, ugly, and annoying. We built our own beautiful frontend that talks to the official portal's internal APIs **through our backend acting as a proxy relay**. Students log in with their real JIIT portal credentials, and our system fetches their attendance, grades, marks, exam schedules, fees, profile — everything — directly from the official portal in real-time.

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | **Next.js 14** (React 18) | Web UI at `localhost:3000` |
| Styling | **Tailwind CSS** + **shadcn/ui** | Beautiful dark/light theme UI |
| Backend | **Express.js** (Node.js) | API server at `localhost:5050` |
| Database | **MongoDB** (Mongoose) | Study material metadata storage |
| File Storage | **AWS S3** + **CloudFront** | Study material file hosting |
| Target | **JIIT WebPortal** | The official portal we proxy to |

---

## 2. The Big Picture — Architecture Overview

```
┌──────────────────┐     HTTP      ┌──────────────────┐     HTTPS      ┌──────────────────────────────┐
│                  │  ──────────►  │                  │  ──────────►  │                              │
│   Next.js        │   /api/v1/    │   Express.js     │   Relay/SDK   │   JIIT WebPortal             │
│   Frontend       │   portal/*   │   Backend        │   requests    │   webportal.jiit.ac.in:6011  │
│   (React 18)     │  ◄──────────  │   (Node.js)      │  ◄──────────  │   /StudentPortalAPI/*        │
│                  │   JSON data   │                  │   JSON data   │                              │
│   localhost:3000 │               │   localhost:5050 │               │   (Official JIIT System)     │
└──────────────────┘               └──────────────────┘               └──────────────────────────────┘
        │                                  │
        │                                  │
        │ /api/v1/materials/*              │ MongoDB + S3
        └─────────────────────────────────►│ (Study Materials)
```

**The key insight**: The student's browser NEVER talks to `webportal.jiit.ac.in` directly. It only talks to our backend. Our backend acts as a "man in the middle" (relay) — it receives the student's credentials, authenticates on their behalf with the official portal, then fetches all their data and sends it back to the frontend in a clean format.

**Why not talk to the portal directly from the browser?**
- The portal has CORS restrictions (blocks requests from other domains)
- The portal uses encrypted request payloads (AES-128-CBC)
- The portal needs specific cookies and headers
- The portal's API responses are messy and inconsistent

Our backend handles all of this complexity.

---

## 3. How the JIIT WebPortal Works (The Target System)

Before understanding our bypass, you need to understand how the official JIIT WebPortal works internally.

### 3.1 The Portal's Architecture

The JIIT WebPortal runs at `https://webportal.jiit.ac.in:6011`. It's an Angular/AngularJS single-page app that talks to backend APIs under `/StudentPortalAPI/`.

**Base URL**: `https://webportal.jiit.ac.in:6011`
**API Base**: `https://webportal.jiit.ac.in:6011/StudentPortalAPI/`
**Frontend**: `https://webportal.jiit.ac.in:6011/studentportal/#/`

### 3.2 The Portal's Authentication System

The portal uses a multi-step login process:

1. **Captcha** — The portal shows a captcha image. It fetches this from:
   ```
   GET /StudentPortalAPI/token/getcaptcha
   ```
   This returns a JSON with `response.captcha.image` (base64 PNG) and `response.captcha.hidden` (a hidden value).

2. **Pre-token Check** — Before the actual login, the portal sends a "pretoken-check":
   ```
   POST /StudentPortalAPI/token/pretoken-check
   Body: ENCRYPTED { username, usertype, captcha: { captcha: "...", hidden: "..." } }
   ```
   This returns a `random` value and an `otppwd` value needed for the next step.

3. **Token Generation** — The actual login:
   ```
   POST /StudentPortalAPI/token/generate-token1
   Body: ENCRYPTED { otppwd, username, passwordotpvalue: password, Modulename: "STUDENTMODULE", random }
   ```
   If successful, this returns the auth token and `regdata` (registration data) containing the student's info.

### 3.3 The Portal's Encryption System (AES-128-CBC)

**THIS IS THE KEY TRICK.** The official portal **encrypts** the request body before sending it to the API. It uses **AES-128-CBC** encryption.

The encryption key is generated dynamically from the **current date**:

```
Key format: qa8y[D1][M1][Y1][DOW][D2][M2][Y2]ty1pn
```

Where:
- `D1` = first digit of day (e.g., day 30 → `3`)
- `M1` = first digit of month (e.g., month 03 → `0`)
- `Y1` = first digit of year last 2 digits (e.g., 2026 → `2`)
- `DOW` = day of week (0=Sun, 1=Mon, ... 6=Sat)
- `D2` = second digit of day (e.g., day 30 → `0`)
- `M2` = second digit of month (e.g., month 03 → `3`)
- `Y2` = second digit of year last 2 digits (e.g., 2026 → `6`)

**Example**: On March 30, 2026 (Monday):
- Day = 30, Month = 03, Year = 26, DayOfWeek = 1
- Key = `qa8y` + `3` + `0` + `2` + `1` + `0` + `3` + `6` + `ty1pn`
- Key = `qa8y3021036ty1pn` (16 bytes = 128 bits, perfect for AES-128)

**IV (Initialization Vector)**: `dcek9wb8frty1pnm` (hardcoded, 16 bytes)

The encryption is:
```javascript
AES-128-CBC(plaintext_json, key, IV) → base64_encoded_ciphertext
```

The portal JS bundle generates this key in the browser, encrypts the request body, and sends the encrypted base64 string as the POST body.

### 3.4 The Portal's Headers

Every authenticated request needs these headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `Authorization` | `Bearer {token}` | The auth token from login |
| `Cookie` | Session cookies | Cookies received from the portal |
| `Origin` | `https://webportal.jiit.ac.in:6011` | CORS origin |
| `Referer` | `https://webportal.jiit.ac.in:6011/studentportal/#/` | Referer check |
| `X-Requested-With` | `XMLHttpRequest` | XHR flag |
| `LocalName` | Encrypted string | A rotating "local name" header |
| `Content-Type` | `application/json` or `text/plain;charset=UTF-8` | Body format |

The `LocalName` header is also encrypted. It's built from random characters + a date sequence, then AES-encrypted.

### 3.5 The Portal's API Endpoints

Here are ALL the official portal API endpoints we discovered and use:

**Authentication:**
- `GET /StudentPortalAPI/token/getcaptcha` — Get captcha image
- `POST /StudentPortalAPI/token/pretoken-check` — Pre-login check (encrypted)
- `POST /StudentPortalAPI/token/generate-token1` — Actual login (encrypted)
- `POST /StudentPortalAPI/token/generate` — Legacy login (plaintext, fallback)

**Student Info & Grades:**
- `POST /StudentPortalAPI/studentgradecard/getstudentinfo` — Get student info for grades
- `POST /StudentPortalAPI/studentgradecard/getregistrationList` — Get semester list
- `POST /StudentPortalAPI/studentgradecard/showstudentgradecard` — Get grade card for a semester
- `POST /StudentPortalAPI/studentsgpacgpa/checkIfstudentmasterexist` — Check SGPA/CGPA availability
- `POST /StudentPortalAPI/studentsgpacgpa/getallsemesterdata` — Get all semester SGPA/CGPA data

**Attendance:**
- `POST /StudentPortalAPI/StudentClassAttendance/getstudentInforegistrationforattendence` — Get attendance meta (semesters)
- `POST /StudentPortalAPI/StudentClassAttendance/getstudentattendancedetail` — Get attendance for a semester
- `POST /StudentPortalAPI/StudentClassAttendance/getstudentsubjectpersentage` — Get day-by-day attendance for a subject

**Profile:**
- `POST /StudentPortalAPI/studentpersinfo/getstudent-personalinformation` — Personal info
- `POST /StudentPortalAPI/studentpersinfo/getstudent-contactinformation` — Contact info
- `POST /StudentPortalAPI/studentpersinfo/getstudent-academicinformation` — Academic info
- `POST /StudentPortalAPI/studentpersinfo/getstudent-familyinformation` — Family info

**Exam Schedule:**
- `POST /StudentPortalAPI/studentcommonsontroller/getsemestercode-withstudentexamevents` — Get exam semester codes
- `POST /StudentPortalAPI/studentcommonsontroller/getstudentexamevents` — Get exam events
- `POST /StudentPortalAPI/studentsttattview/getstudent-examschedule` — Get exam schedule details

**Fees:**
- `POST /StudentPortalAPI/studentfeeledger/loadfeesummary` — Fee summary
- `POST /StudentPortalAPI/studentfeemgmt/getstudentfeelist` — Fee list (fallback)
- `POST /StudentPortalAPI/studentfeestatus/getfeestatus` — Fee status (fallback)

**Subjects:**
- `POST /StudentPortalAPI/reqsubfaculty/getfaculties` — Get registered subjects + faculty info

**Marks PDF:**
- `GET /StudentPortalAPI/studentsexamview/printstudent-exammarks/{instituteid}/{registrationid}/{registrationcode}` — Download marks PDF

---

## 4. How We Bypass It — The Relay & Encryption System

This is the heart of the project. Here's exactly what we do:

### 4.1 The Relay Concept

Our backend acts as a **proxy relay**. The student's browser sends requests to OUR backend, and OUR backend forwards them to the JIIT portal on behalf of the student.

```
Browser ──► Our Backend ──► JIIT Portal
Browser ◄── Our Backend ◄── JIIT Portal
```

Why "relay"? Because we relay (forward) requests.

### 4.2 Relay Sessions

When a student starts the login process, we create a **relay session** in memory on our server. This session stores:

- `sessionId` — A random UUID
- `ownerId` — The user who owns this session
- `cookies` — All cookies received from the JIIT portal
- `authContext` — The student's auth token and registration data from the portal
- `createdAt` / `updatedAt` — Timestamps

The session is stored in a `Map` in memory (not in a database). It expires after 24 hours.

**File**: `backend/src/services/portalRelayService.js`

```javascript
const relaySessions = new Map();

const createRelaySession = (ownerId) => {
  const sessionId = crypto.randomUUID();
  relaySessions.set(sessionId, {
    ownerId,
    cookies: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return sessionId;
};
```

### 4.3 Cookie Forwarding

The JIIT portal sets cookies on responses (like ASP.NET session cookies). Our relay captures these cookies from the portal's `Set-Cookie` header and stores them in the session. On the next request to the portal, we include these cookies in the `Cookie` header.

```javascript
const updateCookiesFromResponse = (session, response) => {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return;
  const parsed = normalizeCookies(setCookie);
  parsed.forEach(({ name, value }) => {
    session.cookies[name] = value;
  });
};
```

This is critical because the portal uses cookies for session management. Without forwarding cookies, every request would be treated as a new session.

### 4.4 The Encryption Implementation

We reverse-engineered the portal's JavaScript bundle to find the AES encryption logic. Our implementation is in `backend/src/utils/portalCrypto.js`:

```javascript
const PORTAL_AES_IV = 'dcek9wb8frty1pnm';  // Hardcoded IV

const buildPortalAesKey = (date = new Date(), timeZone) => {
  const { dayOfMonth, dayOfWeek, month, yearShort } = datePartsForTimeZone(date, timeZone);
  // Mirrors the key generation used by the official frontend bundle
  return `qa8y${dayOfMonth.charAt(0)}${month.charAt(0)}${yearShort.charAt(0)}${dayOfWeek}${dayOfMonth.charAt(1)}${month.charAt(1)}${yearShort.charAt(1)}ty1pn`;
};

const encryptPortalPayload = (plainText, date = new Date(), timeZone) => {
  const key = buildPortalAesKey(date, timeZone);
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(PORTAL_AES_IV));
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
};
```

### 4.5 Timezone Variants

One tricky problem: the encryption key depends on the **date**, but the server and the portal might be in different timezones. If our server is in UTC and the portal is in IST (India Standard Time), the day-of-month could differ around midnight.

We solve this by trying **multiple timezone variants**:

```javascript
const encryptPortalPayloadVariants = (plainText, date = new Date()) => {
  const timeZones = [undefined, 'Asia/Kolkata', 'UTC'];
  const variants = [];
  // ... encrypt with each timezone, deduplicate
};
```

During login, we try the local timezone first, then Asia/Kolkata, then UTC. Whichever one the portal accepts, we use.

### 4.6 The LocalName Header

The portal also expects a `LocalName` header on authenticated requests. This is generated by:

1. Taking random characters + a date code
2. Encrypting the whole thing with the same AES scheme

```javascript
const generatePortalLocalName = (date = new Date()) => {
  const plain = `${randomChars(4)}${generateDateSeq(date)}${randomChars(5)}`;
  return encryptPortalPayload(plain, date);
};
```

### 4.7 The `postPortal` Function — How We Talk to the Portal

The core function that sends requests to the JIIT portal is `postPortal` in `portalSdkController.js`. It:

1. Takes the relay session, auth context, endpoint path, and payload
2. Encrypts the payload using AES-128-CBC
3. Sets all the required headers (Authorization, Cookie, Origin, Referer, LocalName)
4. Sends the request to the portal with a timeout
5. Tries multiple content types if the first fails
6. Falls back to plaintext JSON if encrypted fails

```javascript
const postPortal = async (relaySession, authContext, path, payload, options = {}) => {
  const { encrypted = true } = options;
  const url = toPortalUrl(path);

  if (!encrypted) {
    return postPlainJson();  // Send as plain JSON
  }

  const encryptedBody = encryptPortalPayload(JSON.stringify(payload || {}));

  // Try multiple content types
  const encryptedAttempts = [
    { contentType: 'application/json', body: encryptedBody },
    { contentType: 'text/plain;charset=UTF-8', body: encryptedBody },
    { contentType: 'application/json', body: JSON.stringify(encryptedBody) }
  ];

  for (const attempt of encryptedAttempts) {
    // ... try each, return on success
  }
};
```

**Why multiple attempts?** Because different JIIT portal installations (different campuses, updates) may expect the encrypted payload in different formats:
- Some expect the raw base64 string with `Content-Type: application/json`
- Some expect raw base64 with `Content-Type: text/plain;charset=UTF-8`
- Some expect the base64 string wrapped in JSON quotes

### 4.8 The Full Request Pipeline

When our backend sends a request to the portal:

```
1. Build the JSON payload (e.g., { instituteid: "...", registrationid: "..." })
2. JSON.stringify the payload
3. AES-128-CBC encrypt it with the date-based key
4. Base64 encode the encrypted bytes
5. Set headers:
   - Authorization: Bearer {portal_token}
   - Cookie: {forwarded cookies}
   - Origin: https://webportal.jiit.ac.in:6011
   - Referer: https://webportal.jiit.ac.in:6011/studentportal/#/
   - X-Requested-With: XMLHttpRequest
   - LocalName: {encrypted local name}
   - Content-Type: application/json (or text/plain)
6. POST to https://webportal.jiit.ac.in:6011/StudentPortalAPI/...
7. Parse the response
8. Extract cookies from response for future requests
9. Return the data to our frontend
```

---

## 5. Backend — Every File, Every Line Explained

### 5.1 Directory Structure

```
backend/
├── package.json           # Dependencies and scripts
└── src/
    ├── server.js          # Entry point — starts Express server
    ├── app.js             # Express app configuration (middleware, routes)
    ├── config/
    │   ├── env.js         # Environment variable loading + validation
    │   ├── db.js          # MongoDB connection
    │   └── aws.js         # AWS S3 client setup
    ├── controllers/
    │   ├── authController.js         # Login/auth for OUR system
    │   ├── portalController.js       # Portal status check
    │   ├── portalRelayController.js  # LOW-LEVEL relay (captcha, login attempts)
    │   ├── portalSdkController.js    # HIGH-LEVEL SDK (attendance, grades, etc.)
    │   ├── materialController.js     # Study material CRUD (public)
    │   └── adminController.js        # Admin material management
    ├── middlewares/
    │   ├── authUser.js          # JWT auth for regular users
    │   ├── authAdmin.js         # API key + email auth for admins
    │   ├── errorHandler.js      # Global error handler
    │   ├── rateLimiters.js      # Rate limiting
    │   ├── requestAnalytics.js  # Request tracking
    │   ├── upload.js            # File upload (multer)
    │   └── asyncHandler.js      # Async error wrapper
    ├── models/
    │   └── Material.js          # Mongoose model for study materials
    ├── routes/
    │   ├── authRoutes.js        # /api/v1/auth/*
    │   ├── portalRoutes.js      # /api/v1/portal/*
    │   ├── materialRoutes.js    # /api/v1/materials/*
    │   └── adminRoutes.js       # /api/v1/admin/*
    ├── services/
    │   ├── portalRelayService.js     # Relay session management (cookies, sessions)
    │   ├── ownPortalSdk.js           # SDK session management (dataset storage)
    │   ├── customPortalClient.js     # URL building + legacy login candidates
    │   ├── s3Service.js              # AWS S3 upload/delete
    │   └── requestAnalyticsStore.js  # In-memory request stats
    ├── utils/
    │   ├── portalCrypto.js      # AES encryption for portal payloads
    │   ├── token.js             # Hand-rolled JWT sign/verify (HMAC-SHA256)
    │   ├── file.js              # File type detection + sanitization
    │   └── materialMetadata.js  # Material metadata helpers
    └── scripts/
        ├── importFromFolder.js    # Bulk import study materials
        └── normalizeMetadata.js   # Normalize material metadata
```

### 5.2 `server.js` — The Entry Point

This file starts the server:

1. Connects to MongoDB
2. Starts Express on the configured port
3. Sets keep-alive timeouts
4. Handles graceful shutdown (SIGINT, SIGTERM)
5. Catches unhandled promise rejections

It can start without MongoDB if `ALLOW_START_WITHOUT_DB=true` (dev only).

### 5.3 `app.js` — Express Configuration

This wires everything together:

1. **Security**: Helmet (CSP, HSTS, X-XSS-Protection, noSniff), disables `x-powered-by`
2. **CORS**: Strict in production (only listed origins), permissive in dev (localhost)
3. **Compression**: gzip/brotli response compression
4. **Body parsing**: JSON and URL-encoded, with configurable size limit
5. **Logging**: Morgan (HTTP request logging)
6. **Analytics**: Request tracking middleware
7. **Rate limiting**: Global API rate limit
8. **Routes**: Mounts all route groups
9. **Error handler**: Global catch-all

### 5.4 `config/env.js` — Environment Variables

Loads all config from `.env` and validates critical secrets in production:

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Server port | 5000 |
| `MONGODB_URI` | MongoDB connection string | — |
| `AUTH_SECRET` | JWT signing secret | Must be ≥32 chars in prod |
| `USER_PASSWORD_HASH` | SHA-256 hash of shared student password | — |
| `ADMIN_API_KEY` | API key for admin routes | — |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated admin emails | — |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | — |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | S3 config | — |
| `CLOUDFRONT_BASE_URL` | CloudFront CDN URL | — |
| `PORTAL_RELAY_BASE_URL` | JIIT portal base URL | `https://webportal.jiit.ac.in:6011/studentportal` |
| `PORTAL_REALTIME_DEFAULT` | Auto-refresh portal data | `true` |
| `PORTAL_REALTIME_MIN_SYNC_INTERVAL_MS` | Minimum time between syncs | `30000` |
| `PORTAL_REQUEST_TIMEOUT_MS` | Timeout for portal requests | `8000` |
| `SESSION_MAX_AGE_MS` | Session lifetime | `86400000` (24h) |

In production, the server **refuses to start** if secrets are missing or insecure.

### 5.5 `utils/token.js` — Hand-Rolled JWT

We don't use the `jsonwebtoken` library. Instead, we have a minimal JWT implementation:

- **`sign(payload, secret)`**: Creates `header.payload.signature` using HMAC-SHA256
- **`verify(token, secret)`**: Validates signature using `crypto.timingSafeEqual` (constant-time comparison to prevent timing attacks), checks expiry

This is ~40 lines of code vs importing a huge library.

### 5.6 `middlewares/authUser.js` — User Authentication

Extracts the JWT from the `Authorization: Bearer {token}` header, verifies it with `token.verify()`, and attaches `req.user` with the user's info (userId, name, role).

### 5.7 `middlewares/authAdmin.js` — Admin Authentication

For admin routes (material management), uses a different auth scheme:
- `X-Admin-Key` header must match `ADMIN_API_KEY`
- `X-Admin-Email` header must be in `ADMIN_ALLOWED_EMAILS`
- Uses `crypto.timingSafeEqual` for key comparison (prevents timing attacks)

### 5.8 `controllers/authController.js` — Our Auth System

**`POST /api/v1/auth/login`**

This is for logging into OUR system (not the JIIT portal). Two modes:

1. **Study Material Mode** (`portalMode: false`): User provides a shared password. We hash it with SHA-256 and compare to `USER_PASSWORD_HASH`. Think of it as a shared "access code" for the study material section.

2. **Portal Mode** (`portalMode: true`): The user is logging into the portal. We skip the shared password check (because we'll verify their credentials against the real JIIT portal). We just issue them a JWT token so they can make authenticated requests to our backend.

**`GET /api/v1/auth/me`**: Returns the current user's info from the JWT.

**`GET /api/v1/auth/analytics`**: Admin-only. Returns request statistics.

### 5.9 `controllers/portalRelayController.js` — The Low-Level Relay

This is the **first layer** of portal interaction. It handles raw relay operations.

**`POST /api/v1/portal/relay/start`** — Creates a new relay session (gets a `sessionId`).

**`POST /api/v1/portal/relay/captcha`** — Fetches a captcha image from the portal. The portal returns a base64 PNG. We store the captcha payload in the session for later use.

**`POST /api/v1/portal/relay/try-login`** — The complex login handler. It:

1. Retrieves the relay session
2. Tries the **encrypted login flow** with the default captcha first:
   - Encrypts the username + captcha payload
   - Sends to `/StudentPortalAPI/token/pretoken-check`
   - Gets back `random` + `otppwd`
   - Encrypts the password + random + otppwd
   - Sends to `/StudentPortalAPI/token/generate-token1`
   - Tries multiple timezone variants and content types
3. If that fails and the user provided their own captcha, tries again with the user-provided captcha
4. If encrypted flow fails entirely, tries **legacy plaintext login** as fallback
5. If any attempt succeeds, extracts the auth token + regdata and stores in the session
6. Returns all attempts (for diagnostics) and whether authentication succeeded

**`POST /api/v1/portal/relay/request`** — A generic relay endpoint. The frontend can send any request to any portal endpoint through this.

**`DELETE /api/v1/portal/relay/session`** — Destroys the relay session.

### 5.10 `controllers/portalSdkController.js` — The High-Level SDK (THE BIG FILE ~2700+ lines)

This is the **second layer** — the "SDK" that provides clean, normalized data. It's the biggest and most important file.

When the student logs in via the relay, we then call `loginSdk` which uses the relay session to **bootstrap** (hydrate) all their data at once.

#### `bootstrapDatasetFromPortal` — The Data Hydration Monster

This function fires ~10+ requests to the portal **in parallel** to fetch everything:

**Phase 1 — Initial parallel requests:**
```
┌─ /studentpersinfo/getstudent-personalinformation  (profile)
├─ /studentgradecard/getstudentinfo                  (grade student info)
├─ /studentgradecard/getregistrationList             (semester list for grades)
├─ /StudentClassAttendance/getstudentInforegistrationforattendence  (attendance semesters)
├─ /studentcommonsontroller/getsemestercode-withstudentexamevents   (exam semesters)
└─ /studentfeeledger/loadfeesummary                  (fees)
```

All 6 fire in parallel using `Promise.all([...])`.

**Phase 2 — Per-semester parallel requests:**
Using the semester list from Phase 1, fire for EACH semester:
```
For each semester:
  ├─ /studentgradecard/showstudentgradecard          (grade card)
  ├─ /StudentClassAttendance/getstudentattendancedetail  (attendance)
  └─ /reqsubfaculty/getfaculties                     (subjects + faculty)
```

Plus exam events and SGPA/CGPA calculations.

All of these fire in parallel too.

**Phase 3 — Exam schedule details:**
For each exam event found in Phase 2, fetch the detailed schedule.

The result is a `dataset` object:
```javascript
{
  mode: 'direct-relay',
  relaySessionId: '...',
  realData: true,
  semesters: [...],       // All semesters sorted desc
  attendanceData: {       // Keyed by registration_id
    'sem_123': { studentattendancelist: [...] }
  },
  subjectDailyData: {},   // Lazily loaded per subject
  grades: [...],          // SGPA/CGPA per semester
  gradeCards: {           // Keyed by registration_id
    'sem_123': [{ subjectcode, marks, grade, ... }]
  },
  exams: [...],           // Exam schedule rows
  fees: [...],            // Fee summary rows
  profile: { studentname, enrollmentno, program, ... },
  subjects: {             // Keyed by registration_id
    'sem_123': { registered: [...], faculties: [...] }
  },
  diagnostics: { overall, steps: {...} }
}
```

This dataset is stored in the SDK session (`ownPortalSdk.js`) and served by the individual handler functions.

#### Data Normalization

The portal's APIs return data with inconsistent key names. For example, attendance might come back as `LTattended`, `Lattended`, `attendedclass`, `attendedclasses`, `presentcount` — all meaning the same thing.

We normalize EVERYTHING using `pickFirst()` which tries multiple key names:

```javascript
const attendedclasses = numberOr(
  pickFirst(row, [
    'ltattended', 'LTattended', 'Lattended', 'tattended', 'pattended',
    'attendedclass', 'attendedclasses', 'presentcount', 'presentclasses', 'attended'
  ]),
  0
);
```

This makes our frontend code simple — it always gets `attendedclasses`, never has to handle variants.

#### Individual Handlers

Each handler reads from the cached dataset (with optional realtime refresh):

- **`getAttendanceMeta`** → Returns semester list
- **`getAttendance`** → Returns attendance for a semester
- **`getSubjectAttendance`** → Returns day-by-day attendance (lazily fetched from portal)
- **`getProfile`** → Returns profile (on-demand hydration if incomplete)
- **`getGrades`** → Returns grades + grade cards + realtime refresh
- **`getExams`** → Returns exam schedule (on-demand refresh)
- **`getSubjects`** → Returns registered subjects (fallback to grade cards)
- **`getFees`** → Returns fee data (on-demand fetch with debug mode)
- **`downloadMarks`** → Proxies the marks PDF download from portal

#### Realtime Refresh

When `refresh=1` is in the query string (or `PORTAL_REALTIME_DEFAULT=true`), the handler calls `refreshDatasetRealtime()` which re-runs `bootstrapDatasetFromPortal()` to get fresh data from the portal. It has:

- **Throttling**: Won't refresh more often than `PORTAL_REALTIME_MIN_SYNC_INTERVAL_MS` (30s)
- **Deduplication**: If a refresh is already in progress for this user, new requests wait for it

### 5.11 `services/ownPortalSdk.js` — SDK Session Storage

A simple in-memory `Map` that stores one session per user (keyed by `ownerId`). The session holds the entire dataset from `bootstrapDatasetFromPortal`.

```javascript
const sessionsByOwner = new Map();

const createOrUpdateSession = ({ ownerId, userId, relaySessionId, dataset }) => {
  const session = {
    sessionId: crypto.randomUUID(),
    ownerId,
    userId,
    dataset,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  sessionsByOwner.set(ownerId, session);
  return session;
};
```

Sessions expire after 24 hours (cleanup runs every 15 minutes).

### 5.12 `services/customPortalClient.js` — URL Builder

Handles URL construction for portal endpoints. The JIIT portal has a base URL like `https://webportal.jiit.ac.in:6011/studentportal` but the APIs are at the root (`/StudentPortalAPI/...`).

Also provides `makeLoginCandidates()` which generates all possible login payload combinations for the legacy (non-encrypted) login fallback.

### 5.13 `services/portalRelayService.js` — Relay Session Manager

Manages the relay sessions (the cookies + ownership). Key functions:

- `createRelaySession(ownerId)` → New session with random UUID
- `ensureOwnedSession(sessionId, ownerId)` → Get session only if owner matches
- `updateCookiesFromResponse(session, response)` → Parse `Set-Cookie` and store
- `buildCookieHeader(session)` → Convert stored cookies to `Cookie` header string
- `destroyRelaySession(sessionId, ownerId)` → Delete session

### 5.14 Other Backend Files

**`services/s3Service.js`** — Uploads/deletes files to AWS S3. Creates hierarchical keys like `materials/BTech/CSE/year-3/sem-5/DSA/PYQs/uuid-filename.pdf`.

**`services/requestAnalyticsStore.js`** — In-memory request stats (total counts, by method, by route, top 15 routes, last 7 days, recent 30 requests, unique visitors). Exposed via the admin analytics endpoint.

**`controllers/portalController.js`** — Simple endpoint that fetches the official portal's HTML page and extracts version info and announcements.

**`controllers/materialController.js`** — CRUD for study materials (get all, get by ID, filter options, browse options). Public endpoints.

**`controllers/adminController.js`** — Admin CRUD for materials (list, create, update, delete). Protected by API key + email.

**`middlewares/rateLimiters.js`** — Three rate limiters:
- `authLimiter`: 5 attempts per 15 min in prod (login brute-force protection)
- `relayLimiter`: 60 requests per minute (portal relay throttling)
- `apiLimiter`: 300 requests per minute globally

**`middlewares/upload.js`** — Multer file upload config. Whitelist of allowed MIME types and extensions (PDF, PPT, DOCX, MP4, ZIP, XLS, TXT). Memory storage with configurable size limit.

---

## 6. Frontend — Every File, Every Component Explained

### 6.1 Directory Structure

```
web/
├── package.json             # Next.js + React + Tailwind + shadcn/ui
├── next.config.mjs          # Next.js configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS configuration
├── jsconfig.json            # Path aliases
├── public/                  # Static assets (icons, manifest, SW)
└── src/
    ├── app/
    │   ├── layout.js             # Root layout (meta, service worker, analytics)
    │   ├── page.js               # Homepage (study material browser)
    │   ├── globals.css           # Tailwind imports + global styles
    │   ├── portal/
    │   │   ├── page.js           # Portal entry point (auth gate)
    │   │   ├── constants.js      # Shared constants & feature flags
    │   │   ├── utils.js          # ~50 utility functions
    │   │   └── components/
    │   │       ├── index.js            # Barrel exports
    │   │       ├── LoginView.jsx       # Login form
    │   │       ├── PortalShell.jsx     # Main shell (header + tabs + content)
    │   │       ├── AttendanceView.jsx  # Attendance display
    │   │       ├── GradesView.jsx      # Grades/marks display
    │   │       ├── ExamsView.jsx       # Exam schedule
    │   │       ├── SubjectsView.jsx    # Registered subjects
    │   │       ├── FeesView.jsx        # Fee information
    │   │       ├── ProfileView.jsx     # Student profile
    │   │       ├── AnalyticsView.jsx   # Admin analytics
    │   │       └── HydrationStatusPanel.jsx  # Debug diagnostics
    │   ├── admin/                # Admin material management
    │   ├── study-material/       # Study material browser
    │   ├── study-access/         # Study material access form
    │   ├── material/[id]/        # Individual material page
    │   └── api/                  # Next.js API routes
    ├── components/
    │   ├── ui/                   # shadcn/ui components (Button, Card, Input, etc.)
    │   ├── StudyMaterialClient.jsx  # Study material browser component
    │   ├── FilterStepper.jsx     # Step-through filter UI
    │   ├── MaterialList.jsx      # Material list display
    │   ├── TopPanelTools.jsx     # Theme toggle, install button
    │   ├── CollegeBrand.jsx      # JIIT branding
    │   └── ...
    └── lib/
        ├── api.js                # ALL API calls to backend
        └── utils.js              # shadcn utility (cn function)
```

### 6.2 `lib/api.js` — The API Client (208 lines)

This is the ONLY file that talks to the backend. Every API call goes through here.

```javascript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api/v1';
```

Key functions:

| Function | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| `loginUser(payload)` | POST | `/auth/login` | Login to our system |
| `fetchMe(token)` | GET | `/auth/me` | Get current user |
| `fetchAdminAnalytics(token)` | GET | `/auth/analytics` | Admin analytics |
| `startPortalRelaySession(token)` | POST | `/portal/relay/start` | Start relay session |
| `fetchPortalRelayCaptcha(token, payload)` | POST | `/portal/relay/captcha` | Get portal captcha |
| `tryPortalRelayLogin(token, payload)` | POST | `/portal/relay/try-login` | Try portal login |
| `portalSdkLogin(token, payload)` | POST | `/portal/sdk/login` | Bootstrap SDK session |
| `fetchPortalSdkSession(token)` | GET | `/portal/sdk/session` | Get SDK session info |
| `fetchPortalAttendanceMeta(token)` | GET | `/portal/sdk/attendance/meta` | Attendance semesters |
| `fetchPortalAttendance(token, semester)` | GET | `/portal/sdk/attendance` | Attendance data |
| `fetchPortalSubjectAttendance(token, sem, subject)` | GET | `/portal/sdk/attendance/subject` | Subject daily attendance |
| `fetchPortalProfile(token)` | GET | `/portal/sdk/profile` | Student profile |
| `fetchPortalGrades(token)` | GET | `/portal/sdk/grades` | Grades + grade cards |
| `fetchPortalExams(token)` | GET | `/portal/sdk/exams` | Exam schedule |
| `fetchPortalSubjects(token, semester)` | GET | `/portal/sdk/subjects` | Registered subjects |
| `fetchPortalFees(token)` | GET | `/portal/sdk/fees` | Fee data |
| `downloadPortalMarks(token, regId, regCode)` | GET | `/portal/sdk/marks/download` | Marks PDF blob |

The `sdkGet` helper adds `?refresh=1` when realtime mode is on:
```javascript
const sdkGet = async (token, path, params = {}) => {
  const query = cleanParams(params);
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  // ...
};
```

### 6.3 `portal/page.js` — The Portal Entry Point (39 lines)

Dead simple. It checks if the user has a valid token in localStorage:

```javascript
export default function PortalPage() {
  const [token, setToken] = useState('');

  useEffect(() => {
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';
    if (!verified) {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken('');
      return;
    }
    setToken(savedToken);
  }, []);

  if (!token) return <LoginView onAuth={handleAuth} />;
  return <PortalShell token={token} onLogout={handleLogout} />;
}
```

- No token → Show `LoginView`
- Has token → Show `PortalShell`

### 6.4 `portal/constants.js` — Shared Constants

- `TOKEN_KEY` = `'jaypee_buddy_token'`
- `PORTAL_VERIFIED_KEY` = `'jaypee_buddy_portal_verified'`
- Feature flags loaded from `process.env`
- Tab definitions (Attendance, Grades, Exams, Subjects, Fees, Profile)
- CSS glass/dark panel constants

### 6.5 `components/LoginView.jsx` — The Login Flow

The login form handles the complete multi-step login:

1. User enters enrollment number + password
2. On submit, calls `loginUser({ userId, password, portalMode: true })` → Gets our JWT token
3. Calls `startPortalRelaySession(token)` → Gets a relay `sessionId`
4. Calls `tryPortalRelayLogin(token, { sessionId, userId, password, captcha })` → Attempts portal login
5. If authenticated, calls `portalSdkLogin(token, { userId, password, relaySessionId })` → Bootstraps SDK
6. Saves token to localStorage, calls `onAuth(token)`

If authentication fails:
- Loads captcha image from portal
- Shows captcha input
- User enters captcha, retries

### 6.6 `components/PortalShell.jsx` — The Main App Shell

The container after login. It:

1. Fetches the SDK session (gets semester list, diagnostics)
2. Fetches the current user info
3. Shows the header with "JPortal" branding and Logout button
4. Renders the active tab's content component
5. Shows the bottom navigation bar (Attendance, Grades, Exams, Subjects, Fees, Profile)

### 6.7 `components/AttendanceView.jsx` — Attendance Display

- Fetches attendance meta (semester list) on mount
- Semester dropdown (auto-selects latest)
- Fetches attendance for selected semester
- Shows two modes: **Overview** (subject list with percentages) and **Day by Day** (individual class records)
- Click a subject in overview → loads daily attendance from portal (lazy fetch)
- Color-coded percentages (green/amber/red)
- Target percentage setting (persisted in localStorage)
- "Can miss X classes" / "Need to attend X more" calculation

### 6.8 `components/GradesView.jsx` — Grades & Marks Display

- Fetches grades on mount (all semesters including current)
- Three modes: **Overview** (CGPA/SGPA graph), **Semester** (per-semester grades), **Marks** (detailed marks)
- SVG line chart showing CGPA/SGPA trend over semesters
- Click dots on chart to inspect values
- Semester dropdown (now includes current semester even without grades)
- Download options: Portal PDF (fetched from official portal), custom PDF (jsPDF), CSV
- "No grades yet" shown for current semester

### 6.9 `components/ExamsView.jsx` — Exam Schedule

- Semester filter
- Refresh button for real-time fetch
- Shows subject, date, time, slot, room, seat for each exam

### 6.10 `components/SubjectsView.jsx` — Registered Subjects

- Semester dropdown
- Shows subject name, code, credits, faculty for each registered subject
- Falls back to grade card data if no direct subject data

### 6.11 `components/FeesView.jsx` — Fees Display

- Shows semester-wise fee breakdown
- Total demand, paid, due, fine amounts
- Color-coded status badges (Paid/Partially Paid/Unpaid)
- Summary cards at top (Total Due across all semesters)

### 6.12 `components/ProfileView.jsx` — Student Profile

- Three tabs: Personal, Academic, Contact
- Shows student photo (base64 from portal)
- Displays all profile fields in a clean card layout
- On-demand hydration (fetches missing data from 4 profile endpoints)

### 6.13 `portal/utils.js` — ~50 Utility Functions

Pure utility functions used across components:

- `semesterSortScore()` — Sorts semesters by year then term (EVEN=3 > ODD=2 > SUP=1)
- `toPercent()`, `toFixedSafe()`, `toDisplayNumber()` — Formatting
- `formatCurrency()` — INR currency formatting
- `deriveFeeStatus()`, `feeStatusBadgeClass()` — Fee status logic
- `resolveAttendanceCounts()` — Calculates attended/total from raw data
- `buildAttendanceGuidance()` — "Can miss X" / "Need Y more" calculation
- `monthStatsFromRows()` — Groups attendance by month
- `normalizeCsvCell()` — CSV escaping
- `extractRelayMessage()`, `relayAttemptLooksAuthenticated()` — Login flow helpers
- And ~30 more...

---

## 7. The Complete Login Flow (Step by Step)

Let's trace exactly what happens when a student opens JPortal and logs in:

### Step 1: Page Load

```
Browser → GET localhost:3000/portal
Next.js renders PortalPage component
PortalPage checks localStorage for TOKEN_KEY and PORTAL_VERIFIED_KEY
  → Not found → Renders LoginView
```

### Step 2: User Enters Credentials

```
User types: Enrollment Number = "12345678" and Password = "mypassword"
Clicks "Continue"
```

### Step 3: LoginView.handleLogin() Fires

```javascript
// STEP 3a: Get a JWT for our backend
const auth = await loginUser({ userId: '12345678', password: 'mypassword', portalMode: true });
// Backend creates JWT signed with AUTH_SECRET
// Returns: { token: 'eyJhbGciOiJIUzI1NiJ9...' }
activeToken = auth.data.token;
```

```
Frontend → POST localhost:5050/api/v1/auth/login
Backend: Creates JWT with { userId: '12345678', name: 'Student 12345678', role: 'student', exp: ... }
Backend → Returns: { success: true, data: { token: 'eyJ...' } }
```

### Step 4: Start Relay Session

```javascript
const relay = await startPortalRelaySession(activeToken);
// Returns: { sessionId: 'a1b2c3d4-...' }
```

```
Frontend → POST localhost:5050/api/v1/portal/relay/start (with Bearer token)
Backend: Creates relay session in memory Map
Backend → Returns: { success: true, data: { sessionId: 'a1b2c3d4-...' } }
```

### Step 5: Try Portal Login

```javascript
const probe = await tryPortalRelayLogin(activeToken, {
  sessionId: 'a1b2c3d4-...',
  userId: '12345678',
  password: 'mypassword',
  usertype: 'S'
});
```

```
Frontend → POST localhost:5050/api/v1/portal/relay/try-login

Backend: tryRelayLogin() runs:

  1. Get relay session → { cookies: {}, ownerId: '12345678' }

  2. Try encrypted login with default captcha:
     a. Encrypt { username: '12345678', usertype: 'S', captcha: { captcha: 'phw5n', hidden: 'gmBctEffdSg=' } }
        Key for today = 'qa8y3021036ty1pn'
        IV = 'dcek9wb8frty1pnm'
        Encrypted = AES-128-CBC → Base64 string
     b. POST → https://webportal.jiit.ac.in:6011/StudentPortalAPI/token/pretoken-check
        Headers: { Origin, Referer, X-Requested-With, LocalName: encrypted, Content-Type: application/json }
        Body: <encrypted base64 string>
     c. Portal returns: { response: { random: 'abc123', otppwd: 'xyz789' } }
     d. Store cookies from response

     e. Encrypt { otppwd: 'xyz789', username: '12345678', passwordotpvalue: 'mypassword', Modulename: 'STUDENTMODULE', random: 'abc123' }
     f. POST → https://webportal.jiit.ac.in:6011/StudentPortalAPI/token/generate-token1
        Body: <encrypted base64 string>
     g. Portal returns: { status: { responseStatus: 'Success' }, response: { token: 'portal_jwt', regdata: { memberid, instituteid, clientid, name, enrollmentno, ... } } }
     h. Store auth context in relay session

  3. authenticated = true!

Backend → Returns: { data: { authenticated: true, attempts: [...] } }
```

### Step 6: Bootstrap SDK Session

```javascript
await portalSdkLogin(activeToken, { userId: '12345678', password: 'mypassword', relaySessionId: 'a1b2c3d4-...' });
```

```
Frontend → POST localhost:5050/api/v1/portal/sdk/login

Backend: loginSdk() runs:
  1. Gets relay session and auth context
  2. Calls bootstrapDatasetFromPortal():
     Phase 1: Fire 6 requests in parallel to portal ──►
       ├── getstudent-personalinformation
       ├── getstudentinfo
       ├── getregistrationList
       ├── getstudentInforegistrationforattendence
       ├── getsemestercode-withstudentexamevents
       └── loadfeesummary
     ◄── All 6 return within ~3-8 seconds

     Phase 2: Fire per-semester requests in parallel (based on discovered semesters) ──►
       For each of ~8 semesters:
         ├── showstudentgradecard
         ├── getstudentattendancedetail
         └── getfaculties
       Plus SGPA/CGPA queries
     ◄── All return

     Phase 3: Exam schedule detail requests ──►
     ◄── Return

  3. Creates SDK session with the full dataset
  4. Returns session info

Backend → Returns: { success: true, data: { sessionId, mode: 'direct-relay', realData: true } }
```

### Step 7: Save and Render

```javascript
window.localStorage.setItem(TOKEN_KEY, activeToken);
window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
onAuth(activeToken);
// → PortalPage re-renders with token → Shows PortalShell
```

---

## 8. The Complete Data Fetching Flow

Once logged in, each tab fetches data independently:

### Attendance Tab

```
AttendanceView mounts
  → fetchPortalAttendanceMeta(token)
    → GET /api/v1/portal/sdk/attendance/meta
    → Backend: ensureSession → returns { semesters, latest_semester }
  → setState: semesters, selectedSem = latest

User selects a semester (or auto-selects latest)
  → fetchPortalAttendance(token, selectedSem)
    → GET /api/v1/portal/sdk/attendance?semester=SEM_ID
    → Backend: returns { studentattendancelist: [...] }

User clicks a subject to expand
  → fetchPortalSubjectAttendance(token, selectedSem, subjectCode)
    → GET /api/v1/portal/sdk/attendance/subject?semester=SEM_ID&subject=SUBCODE
    → Backend: If not cached, LIVE FETCHES from portal
      → POST to /StudentPortalAPI/StudentClassAttendance/getstudentsubjectpersentage
    → Returns: { studentAttdsummarylist: [{ datetime, present: 'Present'|'Absent', topic }] }
```

### Grades Tab

```
GradesView mounts
  → fetchPortalGrades(token)
    → GET /api/v1/portal/sdk/grades
    → Backend: refreshDatasetRealtime() → fresh data → returns { semesters, summaries, gradeCards }
  → Frontend now has ALL semesters (including current with no grades yet)
  → Grade cards have per-subject marks for completed semesters
  → Current semester shows "No grades yet"
```

### Profile Tab

```
ProfileView mounts
  → fetchPortalProfile(token)
    → GET /api/v1/portal/sdk/profile
    → Backend: Checks if profile has ≥4 useful fields
      If not → LIVE FETCHES from 4 profile endpoints IN PARALLEL:
        ├── getstudent-personalinformation
        ├── getstudent-contactinformation
        ├── getstudent-academicinformation
        └── getstudent-familyinformation
    → Returns merged profile with 40+ fields
```

---

## 9. Every API Endpoint

### Auth Routes (`/api/v1/auth/`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/login` | None | Login (password or portal mode) |
| GET | `/me` | JWT | Get current user info |
| GET | `/analytics` | JWT (admin) | Request statistics |

### Portal Routes (`/api/v1/portal/`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/status` | JWT | Check official portal status |
| POST | `/relay/start` | JWT | Create relay session |
| POST | `/relay/captcha` | JWT | Fetch portal captcha |
| POST | `/relay/request` | JWT | Generic portal proxy |
| POST | `/relay/try-login` | JWT | Try portal authentication |
| DELETE | `/relay/session` | JWT | Destroy relay session |
| POST | `/sdk/login` | JWT | Bootstrap SDK + hydrate data |
| GET | `/sdk/session` | JWT | SDK session status |
| GET | `/sdk/attendance/meta` | JWT | Attendance semesters |
| GET | `/sdk/attendance` | JWT | Attendance for semester |
| GET | `/sdk/attendance/subject` | JWT | Daily attendance for subject |
| GET | `/sdk/profile` | JWT | Student profile |
| GET | `/sdk/grades` | JWT | Grades + grade cards |
| GET | `/sdk/exams` | JWT | Exam schedule |
| GET | `/sdk/subjects` | JWT | Registered subjects |
| GET | `/sdk/fees` | JWT | Fee data |
| GET | `/sdk/marks/download` | JWT | Download marks PDF |

### Material Routes (`/api/v1/materials/`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | None | Search/list materials |
| GET | `/filters/options` | None | Get all filter values |
| GET | `/filters/browse` | None | Get contextual filter values |
| GET | `/:id` | None | Get single material |

### Admin Routes (`/api/v1/admin/`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/materials` | API Key | List all materials (admin) |
| POST | `/materials` | API Key | Upload new material |
| PUT | `/materials/:id` | API Key | Update material |
| DELETE | `/materials/:id` | API Key | Delete material |

---

## 10. The Study Material System

### How Materials Are Stored

Each material is a MongoDB document:

```javascript
{
  title: "DSA Unit 1 Notes",
  degree: "BTech",              // BTech, MTech, BCA, MCA
  branch: "CSE",
  year: 3,
  semester: 5,
  subject: "Data Structures",
  resourceType: "Slides",       // Slides, Lectures, Tutorials, PYQs, Solutions
  fileType: "pdf",              // pdf, ppt, pptx, doc, docx, mp4, zip, xls, xlsx, txt
  fileSizeBytes: 1024000,
  fileUrl: "https://cdn.example.com/materials/BTech/CSE/year-3/sem-5/...",
  s3Key: "materials/btech/cse/year-3/sem-5/data-structures/slides/uuid-dsa-unit-1.pdf",
  uploadedBy: "admin@jiit.ac.in",
  isPublished: true
}
```

### Upload Flow

1. Admin sends file + metadata to `POST /api/v1/admin/materials`
2. Multer validates file type (whitelist)
3. S3 key is generated: `materials/{degree}/{branch}/year-{N}/sem-{N}/{subject}/{type}/{uuid}-{filename}`
4. File is uploaded to S3
5. MongoDB document is created with the S3 URL
6. If CloudFront is configured, the URL uses the CDN domain

### Browse Flow

The frontend has a step-through filter: Degree → Branch → Year → Semester → Subject → Resource Type. Each step narrows down the options using the `/filters/browse` endpoint.

---

## 11. Security Architecture

### Authentication Layers

1. **Our JWT** — Users get a JWT from our backend. This is used for ALL API calls to our backend. The JWT is HMAC-SHA256 signed with `AUTH_SECRET`.

2. **Portal Token** — When the relay login succeeds, the JIIT portal returns a portal JWT. This is stored in the relay session and used in `Authorization: Bearer` headers to the portal.

3. **Admin API Key** — Admin routes use `X-Admin-Key` header checked with `crypto.timingSafeEqual`.

### Security Measures

- **HSTS**: 1 year, includes subdomains, preload
- **CSP**: Strict Content-Security-Policy (self only)
- **Helmet**: Full suite (noSniff, xssFilter, referrerPolicy, etc.)
- **Rate Limiting**: Per-route rate limits (auth, relay, global)
- **Timing-Safe Compare**: For JWT verification and admin key check
- **Input Sanitization**: File upload whitelist, captcha sanitization, registration ID sanitization
- **Production Secrets Validation**: Server refuses to start with weak secrets
- **CORS Strict Mode**: Only listed origins in production
- **No Fingerprinting**: `x-powered-by` disabled
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT

---

## 12. How Frontend Connects to Backend

The connection is simple HTTP:

1. **Frontend runs at**: `localhost:3000` (Next.js dev server)
2. **Backend runs at**: `localhost:5050` (Express server)
3. **Frontend knows backend URL via**: `NEXT_PUBLIC_API_BASE_URL` env var (defaults to `http://localhost:5000/api/v1`)
4. **Every request includes**: `Authorization: Bearer {token}` header
5. **All responses are JSON** (except marks PDF which is a blob)
6. **CORS**: Backend allows `localhost:3000` in dev mode

The frontend NEVER stores portal credentials. It only stores our JWT token in localStorage.

---

## 13. Session Management

There are TWO types of sessions:

### Relay Session (portalRelayService.js)

- Stores: cookies from JIIT portal, auth context (portal token, regdata)
- Keyed by: random UUID (sessionId)
- Lifetime: 24 hours
- Cleanup: Every 15 minutes, expired sessions are purged
- Purpose: Cookie forwarding and auth token storage for portal requests

### SDK Session (ownPortalSdk.js)

- Stores: The entire dataset (semesters, attendance, grades, exams, fees, profile, subjects)
- Keyed by: ownerId (the user's email/enrollment number)
- Lifetime: 24 hours
- Purpose: Cache all fetched portal data so we don't re-fetch on every tab switch

Both are **in-memory only** (JavaScript `Map`). If the server restarts, all sessions are lost and users need to re-login.

---

## 14. Semester Sorting & Data Normalization

### How Semesters Are Named

JIIT semesters follow this pattern: `{YEAR}{TERM}SEM`
- `2026EVESEM` = Even semester of academic session 2025-26 (Jan-Jun 2026)
- `2025ODDSEM` = Odd semester of 2025-26 (Jul-Dec 2025)
- `SUMMER2024` = Summer supplementary
- `SUP2023ODD` = Supplementary exam

### Semester Sort Score

```javascript
const semesterSortScore = (registrationCode, registrationId) => {
  const yearMatch = text.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const term = text.includes('ODD') ? 2 : text.includes('EVE') || text.includes('EVEN') ? 3 : text.includes('SUP') || text.includes('SUMMER') ? 1 : 0;
  return year * 100000 + term * 1000 + tie;
};
```

**Frontend sort**: EVEN=3 > ODD=2 > SUP/SUMMER=1 (so EVEN appears above ODD)

**Backend sort**: EVEN=1, ODD=2 (original portal order, but reversed in frontend)

This means `2026EVESEM` (score ~202,603,xxx) appears at the TOP of all dropdowns.

### Data Normalization

Portal APIs have wildly inconsistent key names. Examples:

| What we want | Keys the portal might use |
|-------------|--------------------------|
| Subject code | `subjectcode`, `individualsubjectcode`, `subject_code`, `subcode` |
| Student name | `studentname`, `name`, `student_name` |
| Attendance % | `Lpercentage`, `lpercentage`, `lecturepercentage` |
| Fee amount | `demandamount`, `feeamount`, `totalfee`, `total_demand` |
| Grade point | `gradepoint`, `grpoint`, `point` |

The `pickFirst(obj, keys)` function handles this:

```javascript
const pickFirst = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
};
```

---

## 15. File-by-File Reference

### Backend Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/server.js` | ~78 | Server startup, graceful shutdown |
| `src/app.js` | ~106 | Express config, security, routes |
| `src/config/env.js` | ~117 | Environment variables + validation |
| `src/config/db.js` | ~20 | MongoDB connection |
| `src/config/aws.js` | ~12 | S3 client |
| `src/controllers/portalSdkController.js` | ~2700 | **THE BIG FILE** — All SDK logic |
| `src/controllers/portalRelayController.js` | ~370 | Low-level relay + login |
| `src/controllers/authController.js` | ~80 | Our JWT auth system |
| `src/controllers/portalController.js` | ~40 | Portal status check |
| `src/controllers/materialController.js` | ~130 | Study material CRUD |
| `src/controllers/adminController.js` | ~140 | Admin material management |
| `src/services/portalRelayService.js` | ~90 | Relay session management |
| `src/services/ownPortalSdk.js` | ~65 | SDK session storage |
| `src/services/customPortalClient.js` | ~55 | Portal URL builder |
| `src/services/s3Service.js` | ~90 | AWS S3 operations |
| `src/services/requestAnalyticsStore.js` | ~90 | Request stats |
| `src/utils/portalCrypto.js` | ~95 | AES-128-CBC encryption |
| `src/utils/token.js` | ~45 | JWT sign/verify |
| `src/utils/file.js` | ~30 | File type utils |
| `src/middlewares/authUser.js` | ~18 | JWT auth middleware |
| `src/middlewares/authAdmin.js` | ~30 | Admin API key auth |
| `src/middlewares/errorHandler.js` | ~20 | Error handler |
| `src/middlewares/rateLimiters.js` | ~35 | Rate limiting |
| `src/middlewares/requestAnalytics.js` | ~30 | Request tracking |
| `src/middlewares/upload.js` | ~35 | File upload config |
| `src/middlewares/asyncHandler.js` | ~4 | Async error wrapper |
| `src/models/Material.js` | ~80 | Mongoose schema |
| `src/routes/portalRoutes.js` | ~48 | Portal route definitions |
| `src/routes/authRoutes.js` | ~12 | Auth route definitions |
| `src/routes/materialRoutes.js` | ~13 | Material route definitions |
| `src/routes/adminRoutes.js` | ~19 | Admin route definitions |

### Frontend Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/api.js` | ~208 | ALL API calls to backend |
| `src/app/portal/page.js` | ~39 | Portal entry point (auth gate) |
| `src/app/portal/constants.js` | ~34 | Constants + feature flags |
| `src/app/portal/utils.js` | ~450 | ~50 utility functions |
| `src/app/portal/components/LoginView.jsx` | ~175 | Login form + relay flow |
| `src/app/portal/components/PortalShell.jsx` | ~95 | Main shell with tabs |
| `src/app/portal/components/AttendanceView.jsx` | ~315 | Attendance display |
| `src/app/portal/components/GradesView.jsx` | ~520 | Grades/marks display |
| `src/app/portal/components/ExamsView.jsx` | ~135 | Exam schedule |
| `src/app/portal/components/SubjectsView.jsx` | ~120 | Registered subjects |
| `src/app/portal/components/FeesView.jsx` | ~215 | Fee information |
| `src/app/portal/components/ProfileView.jsx` | ~285 | Student profile |
| `src/app/portal/components/AnalyticsView.jsx` | ~80 | Admin analytics |
| `src/app/portal/components/HydrationStatusPanel.jsx` | ~40 | Debug diagnostics |
| `src/app/portal/components/index.js` | ~10 | Barrel exports |

---

## Summary — What We Actually Did

1. **Reverse-engineered** the JIIT WebPortal's JavaScript bundle to discover:
   - The AES-128-CBC encryption scheme
   - The date-based key generation formula
   - The IV (`dcek9wb8frty1pnm`)
   - The `LocalName` header generation
   - All internal API endpoints and their payload structures

2. **Built a relay proxy** that:
   - Creates sessions to store portal cookies
   - Forwards cookies between requests
   - Encrypts request payloads using the discovered AES scheme
   - Adds all required headers (Origin, Referer, Authorization, LocalName)
   - Handles multiple content type variants
   - Handles timezone edge cases

3. **Built an SDK layer** that:
   - Bootstraps all student data in parallel (10+ requests)
   - Normalizes wildly inconsistent API responses
   - Caches data in memory for fast subsequent requests
   - Supports real-time refresh with throttling
   - Provides on-demand lazy loading for detailed data

4. **Built a beautiful frontend** that:
   - Handles the multi-step login flow (JWT → relay → captcha → portal auth → SDK bootstrap)
   - Displays attendance, grades, marks, exams, fees, profile, subjects
   - Supports semester switching with proper sorting (latest first)
   - Generates PDFs and CSVs for marks/grades
   - Downloads official marks PDF from portal
   - Shows attendance guidance (can miss X / need Y more classes)
   - SVG CGPA/SGPA trend graph
   - Dark/light theme
   - Mobile-responsive with bottom tab navigation

5. **Secured everything** with:
   - Production-grade Helmet security headers
   - Rate limiting on all routes
   - CORS strict mode in production
   - Timing-safe comparisons
   - Secret validation at startup
   - Input sanitization everywhere
