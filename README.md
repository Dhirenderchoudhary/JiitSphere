# JiitSphere

Study material & student portal platform for JIIT students — notes, slides, PYQs, lectures, and an integrated web portal.

## Stack

- **Frontend:** Next.js 14 (App Router) · Tailwind CSS · shadcn/ui
- **Backend:** Express.js · MongoDB · AWS S3
- **Auth:** NextAuth (Google OAuth, `@mail.jiit.ac.in` only) + Guest access
- **Deployment:** Vercel (frontend) + Railway (backend)

## Features

- Browse materials by degree → branch → year → semester → subject → resource type
- Auto-filtering — results load as you select filters
- In-app PDF/document viewer
- Admin upload dashboard with login
- Superadmin analytics dashboard (visitors, charts, stats)
- Student portal relay (JIIT WebKiosk integration)
- S3 bulk import from existing folder structure
- Guest mode with 5-download limit
- PWA support (installable on mobile)
- Dark mode

## Quick Start

```bash
# Backend
cd backend
cp .env.example .env   # fill in your values
bun install && bun run dev

# Frontend (new terminal)
cd web
cp .env.example .env.local   # fill in your values
bun install && bun run dev
```

## Current Deployment Flow

1. The browser loads the Next.js app on Vercel from `web/`.
2. Public study-material pages fetch data from the Railway backend at `/api/v1/materials`, `/api/v1/auth`, `/api/v1/admin`, and `/api/v1/superadmin`.
3. Vercel-hosted API routes handle local app concerns such as study-lock unlock, admin upload forwarding, guest auth, and NextAuth callbacks.
4. The backend connects to MongoDB Atlas for metadata and uses AWS S3 for file storage and bulk imports.
5. The portal page uses the backend relay and SDK endpoints under `/api/v1/portal` to talk to the JIIT student portal without exposing portal requests directly in the browser.
6. Portal data is returned to the frontend, where the attendance, grades, profile, exams, subjects, and fees views render from the cached SDK session.

## S3 Import

```bash
cd backend
bun run import:s3              # import from S3 bucket
bun run import:s3 -- --dry-run # preview only
```

## Docs

- [Deployment Guide](docs/DEPLOYMENT.md)
- [API Examples](docs/API_EXAMPLES.md)
- [Admin Workflow](docs/ADMIN_WORKFLOW.md)
- [System Guide](docs/COMPLETE_SYSTEM_GUIDE.md)

## License

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later). See [LICENSE](LICENSE).
