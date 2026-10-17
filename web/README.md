# JiitSphere web

The Next.js 14 site at jiitsphere.com, built with the App Router and Tailwind
CSS. It shows study material and the student portal dashboard, and proxies
every data call to the [backend](../backend/README.md).

## Pages

| Route | Page |
|---|---|
| `/` | Landing page |
| `/study-material`, `/material/[id]` | Browse study material and open a file in the browser |
| `/study-access` | Unlock study material with a college Google account, or as a guest with five free views |
| `/login` | Portal sign-in: Google through the extension on a computer, Link this phone on a phone, or Try Demo |
| `/portal` | Dashboard: attendance, grades, exams, subjects, fees, profile |
| `/link` | Signs a phone in with a code from a signed-in computer |
| `/privacy` | Privacy policy, also linked from the Chrome Web Store listing |
| `/admin`, `/superadmin` | Upload material, and site analytics |
| `/offline` | Shown by the service worker when there is no connection |

## How it talks to the backend

The browser never calls the backend directly. Two route handlers forward
requests server-side, so the browser only ever talks to the site:

- `/api/backend/*` forwards study material requests.
- `/api/portal-auth/*` forwards sign-in and portal dashboard requests.

Other route handlers under `src/app/api/` run on the site itself: the college
Google sign-in for study material (`/api/auth/google/*`), guest access, the
study material file links, and the admin and superadmin logins. Admin uploads
go through `/api/admin/upload`, which adds `ADMIN_API_KEY` on the server, so the
key never reaches the browser.

`src/middleware.js` keeps the study material session sliding and sends anyone
without access to `/study-access`.

## Running it

You need Node.js 22, pnpm and the backend running (see its README).

```bash
pnpm install                       # from the repository root
cd web
cp .env.local.example .env.local   # then fill it in, see below
pnpm run dev                       # http://localhost:3000
```

## Settings

`.env.local.example` lists every variable. The ones you have to set:

| Variable | Purpose |
|---|---|
| `INTERNAL_API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` | Backend API base, `http://localhost:5000/api/v1` locally |
| `ADMIN_API_KEY` | Must match the backend's `ADMIN_API_KEY` |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | The site's own URL, and the secret that signs its cookies |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client for the study material sign-in; only `@mail.jiit.ac.in` accounts are let in |
| `STUDY_MATERIAL_PASSWORD_HASH` | SHA-256 of a study material password checked by `/api/study-material/unlock`; no page offers a password field at the moment |
| `ADMIN_LOGIN_ID`, `ADMIN_LOGIN_PASSWORD_HASH` | The `/admin` login |

`NEXT_PUBLIC_PORTAL_REALTIME=true` makes the dashboard ask the backend for fresh
portal data on each load. The backend still reuses anything fetched in the last
two minutes, so this costs nothing when data is fresh.

## Code layout

| Path | What lives there |
|---|---|
| `src/app/` | Pages and route handlers |
| `src/app/portal/components/` | The dashboard views, the login page and the phone link panel |
| `src/components/` | Shared UI: navigation, study material, install banner, `ui/` primitives |
| `src/lib/api.ts` | Every call to the backend, with timeouts and retries |
| `public/` | Icons, manifest and service worker for installing the site as an app |

## Checks

```bash
pnpm test             # Jest and Testing Library
pnpm run lint         # ESLint
pnpm run format:check # Prettier
pnpm run build        # production build
```

## Deploying

Vercel builds and deploys `main` to production. Every pull request gets a
preview deployment, which needs a Vercel login to open.
