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
npm install && npm run dev

# Frontend (new terminal)
cd web
cp .env.local.example .env.local   # fill in your values
npm install && npm run dev
```

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
