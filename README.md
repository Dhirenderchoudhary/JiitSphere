# JiitSphere

Study material & student portal platform for JIIT students — notes, slides, PYQs, lectures, and an integrated web portal.

## Stack

- **Frontend:** Next.js 14 (App Router) · Tailwind CSS · shadcn/ui · PWA (Service Workers, Manifest)
- **Backend:** Express.js · MongoDB · AWS S3
- **Auth:** NextAuth (Google OAuth, `@mail.jiit.ac.in` only) + Guest access
- **Validation:** Zod for strict schema and environment variables checking
- **Caching:** Node-Cache for optimizing heavily requested endpoints
- **Deployment:** Render (frontend + backend)

## Features

- **Robust Study Materials API:** Browse by degree → branch → year → semester → subject → resource type.
- **Auto-filtering:** Results load as you select filters, heavily cached for performance.
- **In-app Viewer:** PDF/document viewer integrated directly into the portal.
- **Admin Dashboards:** Upload and manage materials with Zod-enforced schema validation.
- **Student Portal Relay:** JIIT WebKiosk integration.
- **S3 Bulk Import:** Import materials directly from existing folder structures.
- **Guest Mode:** 5-download limit for non-authenticated users.
- **PWA & Performance:** Production-ready PWA with offline fallback, dark mode, strict CORS, and Express rate limiting.

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env   # fill in your values
pnpm install
pnpm run dev
```

*Note: Environment variables are strictly validated on startup using Zod. The server will crash and inform you if required variables are missing.*

#### Linting & Formatting
```bash
pnpm run format   # Prettier
pnpm run lint     # ESLint
```

### Frontend

Open a new terminal:
```bash
cd web
cp .env.local.example .env.local   # fill in your values
pnpm install
pnpm run dev
```

## Local Setup

### Prerequisites
- Node.js (v20 recommended)
- MongoDB running locally or a MongoDB Atlas URI

### Installation & Execution
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Dhirenderchoudhary/JiitSphere.git
   cd JiitSphere
   ```

2. **Install Root Dependencies (Husky):**
   ```bash
   pnpm install
   ```

3. **Backend Setup:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your MongoDB URI and Auth secrets
   pnpm install
   pnpm run dev
   ```

4. **Frontend Setup:**
   ```bash
   cd ../web
   cp .env.local.example .env.local
   pnpm install
   pnpm run dev
   ```

5. **Test Everything locally:**
   From the root folder, you can run all tests and format checks:
   ```bash
   pnpm run test:all
   pnpm run lint:all
   ```

## How to trigger manual rollback

In case a bad deployment reaches production, you can trigger an automatic Render rollback directly from GitHub Actions:
1. Go to the **Actions** tab in this GitHub repository.
2. Select **Deploy JiitSphere** from the left sidebar.
3. Click **Run workflow**.
4. In the `deploy_id` field, enter the ID of the previous stable deployment (you can find this ID in Render's dashboard under Deploys, e.g., `dep-cjabc123...`).
5. Click **Run workflow**. The GitHub Action will instruct Render to immediately rollback the backend and verify the health check.

## API Documentation & Deployments

This repository includes a Render Blueprint at `render.yaml` for monorepo deployment.

1. In Render, choose **New +** -> **Blueprint** and select this repository.
2. Render will create two services from `render.yaml`:
   - `jiitsphere-backend` (root: `backend`, health: `/health`)
   - `jiitsphere-web` (root: `web`)
3. Set service env vars in Render dashboards:
   - Backend: use `backend/.env.example` as reference
   - Web: use `web/.env.local.example` as reference
4. Connect frontend to backend:
   - `NEXT_PUBLIC_API_BASE_URL=https://<your-backend>.onrender.com/api/v1`
   - `INTERNAL_API_BASE_URL=https://<your-backend>.onrender.com/api/v1`

## S3 Import

```bash
cd backend
pnpm run import:s3              # import from S3 bucket
pnpm run import:s3 -- --dry-run # preview only
```

## Docs

- [Deployment Guide](docs/DEPLOYMENT.md)
- [API Examples](docs/API_EXAMPLES.md)
- [Admin Workflow](docs/ADMIN_WORKFLOW.md)
- [System Guide](docs/COMPLETE_SYSTEM_GUIDE.md)

## License

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later). See [LICENSE](LICENSE).

[![CI/CD Pipeline](https://github.com/Dhirenderchoudhary/JiitSphere/actions/workflows/ci.yml/badge.svg)](https://github.com/Dhirenderchoudhary/JiitSphere/actions/workflows/ci.yml)
[![Coverage Status](https://codecov.io/gh/Dhirenderchoudhary/JiitSphere/branch/main/graph/badge.svg)](https://codecov.io/gh/Dhirenderchoudhary/JiitSphere)

The comprehensive study material platform and student portal for JIIT (Jaypee Institute of Information Technology), Noida.
