<div align="center">
  <img src="https://via.placeholder.com/150/000000/FFFFFF/?text=JiitSphere" alt="JiitSphere Logo" width="150" height="150">
  
  # 🎓 JiitSphere

  **The ultimate study material & student portal platform for JIIT students.**  
  *Notes, slides, PYQs, lectures, and an integrated web portal.*

  [![CI/CD Pipeline](https://github.com/Dhirenderchoudhary/JiitSphere/actions/workflows/ci.yml/badge.svg)](https://github.com/Dhirenderchoudhary/JiitSphere/actions/workflows/ci.yml)
  [![Coverage Status](https://codecov.io/gh/Dhirenderchoudhary/JiitSphere/branch/main/graph/badge.svg)](https://codecov.io/gh/Dhirenderchoudhary/JiitSphere)
  [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

</div>

---

## 📖 Table of Contents

- [About the Project](#-about-the-project)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Execution](#installation--execution)
- [Deployment & API](#-deployment--api)
- [Useful Commands](#-useful-commands)
- [Rollback Strategy](#-rollback-strategy)
- [License](#-license)

---

## 🚀 About the Project

**JiitSphere** is a comprehensive platform built specifically for students of Jaypee Institute of Information Technology (JIIT), Noida. It seamlessly aggregates study resources (PDFs, PPTs, PYQs, lectures) and integrates directly with the JIIT student web portal. 

---

## ✨ Key Features

- **📚 Robust Study Materials API:** Browse logically by Degree ➔ Branch ➔ Year ➔ Semester ➔ Subject ➔ Resource Type.
- **⚡ Auto-filtering & Caching:** Instant results as you type and filter, aggressively cached using Node-Cache for peak performance.
- **📖 In-app Document Viewer:** Read PDFs and PPTs directly within the portal—no external downloads required.
- **🛡️ Admin Dashboards & Validation:** Strict data integrity with Zod-enforced schema validation during material uploads.
- **🔗 WebKiosk Relay:** Directly syncs and interfaces with the JIIT WebKiosk.
- **☁️ S3 Bulk Import:** Directly map and import study materials from existing AWS S3 bucket folder structures.
- **👤 Guest Mode:** Allows unauthenticated users to download up to 5 resources before requiring a JIIT login.
- **📱 PWA Ready:** Production-grade Progressive Web App featuring offline fallback, dark mode, strict CORS, and Express rate limiting.

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS & shadcn/ui
- **PWA:** Service Workers, Manifest

### Backend
- **Core:** Express.js & Node.js
- **Database:** MongoDB
- **Storage:** AWS S3

### Auth & Security
- **Authentication:** NextAuth (Google OAuth, restricted to `@mail.jiit.ac.in`) + Guest access limits
- **Validation:** Zod (for env variables & API schemas)
- **Caching:** Node-Cache

---

## 🏁 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

- **Node.js** (v20 or higher recommended)
- **MongoDB** (Local instance or MongoDB Atlas URI)
- **pnpm** installed globally (`npm i -g pnpm`)

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
   # Add your MongoDB URI and OAuth secrets to .env
   pnpm install
   pnpm run dev
   ```
   > 💡 *Note: Environment variables are strictly validated on startup using Zod. The server will crash gracefully and inform you if required variables are missing.*

4. **Frontend Setup:**
   Open a new terminal session and run:
   ```bash
   cd web
   cp .env.local.example .env.local
   # Fill in the required environment variables
   pnpm install
   pnpm run dev
   ```

5. **Test & Lint (Root Folder):**
   Run all checks across the monorepo:
   ```bash
   pnpm run test:all
   pnpm run lint:all
   ```

---

## 🌐 Deployment & API

This repository includes a Render Blueprint at `render.yaml` for seamless monorepo deployment.

1. In Render, choose **New +** ➔ **Blueprint** and select this repository.
2. Render will automatically provision two services:
   - `jiitsphere-backend` (Root: `backend`, Health Check: `/health`)
   - `jiitsphere-web` (Root: `web`)
3. **Environment Variables on Render:**
   - **Backend:** Reference `backend/.env.example`
   - **Web:** Reference `web/.env.local.example`
4. **Connect Frontend to Backend:**
   - `NEXT_PUBLIC_API_BASE_URL=https://<your-backend>.onrender.com/api/v1`
   - `INTERNAL_API_BASE_URL=https://<your-backend>.onrender.com/api/v1`

---

## 🧰 Useful Commands

### S3 Import (Backend)
Import files directly from your configured AWS S3 bucket:
```bash
cd backend
pnpm run import:s3              # Import from S3 bucket
pnpm run import:s3 -- --dry-run # Preview the import without making changes
```

### Code Formatting (Backend)
```bash
cd backend
pnpm run format   # Prettier
pnpm run lint     # ESLint
```

---

## ⏪ Rollback Strategy

In case a bad deployment reaches production, you can trigger an automatic Render rollback directly from GitHub Actions:

1. Navigate to the **Actions** tab in this GitHub repository.
2. Select **Deploy JiitSphere** from the left sidebar.
3. Click **Run workflow**.
4. In the `deploy_id` field, enter the ID of the previous stable deployment *(Find this ID in Render's dashboard under Deploys, e.g., `dep-cjabc123...`)*.
5. Click **Run workflow**. The GitHub Action will instruct Render to immediately rollback the backend and verify the health check.

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later). See the [LICENSE](LICENSE) file for more details.

---
<div align="center">
  <i>Built with ❤️ for the students of JIIT</i>
</div>
