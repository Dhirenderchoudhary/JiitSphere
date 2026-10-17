# JiitSphere backend

The Express API behind jiitsphere.com. It serves the study material catalogue,
handles admin uploads, and keeps each student's session with the official JIIT
web portal so the site can show their attendance, grades, exams, subjects, fees
and profile.

## Layout

| Path | What lives there |
|---|---|
| `src/server.js` | Starts the server, connects to MongoDB, shuts down gracefully |
| `src/app.js` | Express app: security headers, CORS, rate limits, routes |
| `src/config/` | `env.js` reads and validates every setting with Zod; `db.js` connects MongoDB |
| `src/routes/`, `src/controllers/` | HTTP routes and their handlers |
| `src/services/` | Portal client, portal session stores, attendance service, storage |
| `src/models/` | Mongoose models: `Material`, `PortalSession`, `LinkCode` |
| `src/middlewares/`, `src/validators/` | Auth, rate limiting, request validation, error handling |
| `src/scripts/` | Import and maintenance scripts, and the portal benchmark |
| `src/tests/` | Jest unit and integration tests |

## Running it

You need Node.js 22, pnpm and a MongoDB database.

```bash
pnpm install            # from the repository root
cd backend
cp .env.example .env    # then fill it in, see below
pnpm run dev            # http://localhost:5000, restarts on change
```

`src/config/env.js` validates the environment on startup and stops with a
message naming anything missing or malformed.

## Settings

`.env.example` lists every variable with a comment. The ones you have to set:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `AUTH_SECRET` | Signs JiitSphere tokens and derives the key that encrypts saved portal sessions. Changing it signs everyone out. |
| `ADMIN_API_KEY`, `ADMIN_ALLOWED_EMAILS` | The key the web app sends for admin calls, and the admin emails it may send with it |
| `STORAGE_PROVIDER` | `local` for a folder on disk, `s3` for S3 or Cloudflare R2 |
| `AWS_*`, `S3_ENDPOINT`, `CLOUDFRONT_BASE_URL` | Bucket credentials and the public file URL when `STORAGE_PROVIDER=s3` |

Session and portal tuning, with the production values:

| Variable | Production | Meaning |
|---|---|---|
| `PORTAL_TOKEN_MAX_AGE` | 30 days | How long a JiitSphere sign-in and its saved portal session last |
| `SESSION_MAX_AGE` | 30 days | How long an idle session stays in memory; keep it at least `PORTAL_TOKEN_MAX_AGE` |
| `SESSION_REFRESH_AFTER` | 1 day | A token older than this is re-issued by `/auth/me`, so active users slide forward |
| `PORTAL_REALTIME_MIN_SYNC_INTERVAL_MS` | 2 minutes | A refresh reuses portal data fetched within this window |
| `PORTAL_RELAY_BASE_URL` | the JIIT portal | Base URL every portal request goes to |

## API

Everything except `/health` is under `/api/v1` and rate limited.

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness check |
| `GET /materials`, `/materials/:id`, `/materials/filters/options`, `/materials/filters/browse` | none | Browse and search study material |
| `GET/POST/PUT/DELETE /admin/materials` | `x-admin-key` plus an `x-admin-email` listed in `ADMIN_ALLOWED_EMAILS` | Manage study material |
| `POST /auth/portal-google` | none | Sign in with the portal's Google login, captured by the extension |
| `POST /auth/link-code` | portal sign-in | Create a one-time code to link a phone |
| `POST /auth/link-code/redeem` | none | Exchange a code for a sign-in on the phone |
| `POST /auth/demo-login` | none | Demo session with sample data |
| `POST /auth/login` | none | The site's own admin login |
| `GET /auth/me` | token | Current user; returns a fresh token when the old one is over a day old |
| `POST /portal/sdk/login` | token | Load the student's data from the portal after sign-in |
| `GET /portal/sdk/session`, `/attendance/meta`, `/attendance`, `/attendance/counts`, `/attendance/subject` | token | Attendance |
| `GET /portal/sdk/grades`, `/marks/semesters`, `/marks/data`, `/marks/download` | token | Grades and marks |
| `GET /portal/sdk/exams`, `/subjects`, `/fees`, `/profile`, `/profile/photo` | token | The rest of the dashboard |
| `POST /superadmin/login`, `GET /superadmin/analytics` | superadmin | Site analytics |

Portal routes accept `?refresh=1` to ask for data newer than the sync window.

## How a portal session works

1. **Sign-in.** The JIIT portal only allows Google sign-in on its own page.
   The extension captures the portal's login response and the web app posts it
   to `/auth/portal-google`. The backend asks the portal who the token belongs
   to and only accepts it if the portal's record names the same student.
2. **Saving.** The sign-in is kept in memory and saved to the `PortalSession`
   collection, encrypted with AES-256-GCM using a key derived from
   `AUTH_SECRET`. A restart restores it from there on the next request.
3. **Loading data.** `/portal/sdk/login` loads the dashboard in two rounds of
   portal calls, then warms daily attendance and exams in the background.
   Later requests reuse that data while it is younger than the sync window.
4. **Renewal.** When the portal answers 401, the backend calls
   `/token/refreshTokenRequest` the way the portal's own app does and repeats
   the request. A renewal also moves the saved session's expiry forward.
5. **Expiry.** If the portal refuses to renew, the session is dropped and the
   student is asked to sign in again. Old data is never shown as current.
6. **Phones.** A signed-in computer creates a link code (8 characters,
   single use, two minutes, stored only as a hash). The phone that redeems it
   gets a token for the same student and reads the same session.

## Tests

```bash
pnpm test          # all tests
pnpm run test:ci   # with coverage, as CI runs them
```

Integration tests run against an in-memory MongoDB and replace the portal with
a mocked `fetch`. The test scripts set `NODE_OPTIONS=--experimental-vm-modules`
because MongoDB driver 7.6+ loads `os` with a dynamic import that otherwise
fails inside Jest (NODE-7832).

`pnpm run bench:portal [latencyMs]` replays the dashboard's request sequence
against a fake portal that answers after a fixed delay, and reports time and
portal calls per step.

## Scripts

| Command | Does |
|---|---|
| `pnpm run import:s3 <prefix> [--dry-run]` | Import material from the bucket |
| `pnpm run import:folder <path> [--dry-run]` | Import material from a folder tree |
| `pnpm run normalize:metadata` | Report inconsistent material metadata; add `:apply` to fix it |
| `pnpm run lint`, `pnpm run format:check` | ESLint and Prettier, as CI runs them |

## Deploying

Production runs on Render's free plan and deploys when `main` changes. Render
sleeps a free service after 15 minutes without requests, so `src/services/keepAwake.js`
pings the service's own URL every 10 minutes from 06:30 to 01:20 IST. That keeps
it within the free plan's shared 750 instance hours a month.
