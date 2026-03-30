# JIITStudyMaterial

Production-ready starter for college study materials platform with web + mobile + backend.

## Monorepo Structure

```text
JIITStudyMaterial/
  backend/
    src/
      config/
      controllers/
      middlewares/
      models/
      routes/
      services/
      scripts/
      utils/
  web/
    src/app/
    src/components/
    src/lib/
  mobile/
    src/navigation/
    src/screens/
    src/services/
  docs/
  materials/
```

## Core Features Implemented

- Clean MVC backend (Express + MongoDB)
- S3 upload + CloudFront URLs
- Filter APIs for degree/branch/year/semester/subject/resource type
- Admin CRUD APIs
- Admin list API for moderation and pagination
- Bulk import script to ingest your existing folder directly
- Next.js web flow and in-app viewer
- React Native mobile skeleton and in-app viewer

## MongoDB Schema (Material)

- title: String
- description: String
- degree: Enum(BTech, MTech, BCA, MCA)
- branch: String
- year: Number
- semester: Number
- subject: String
- resourceType: Enum(Slides, Lectures, Tutorials, PYQs, Solutions)
- fileType: Enum(pdf, ppt, pptx, doc, docx, mp4, zip, xls, xlsx, txt, other)
- fileSizeBytes: Number
- fileUrl: String
- s3Key: String
- uploadedBy: String
- isPublished: Boolean
- timestamps

## Quick Start

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### 2) Web

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

### 3) Mobile

```bash
cd mobile
npm install
npm run android
# or npm run ios
```

## Use Your Existing StudyMaterial Folder

You already pasted data in:

```text
StudyMaterial/
```

Run dry-run first (recommended):

```bash
cd backend
npm install
npm run import:folder -- ../StudyMaterial --dry-run --report ./import-report.json
```

After reviewing import report, run real import:

```bash
npm run import:folder -- ../StudyMaterial --report ./import-report.json
```

Current dry-run summary on your folder:

- Total discovered files: 5564
- Import-ready files: 4044
- Skipped (missing year/semester inference): 1149
- Unsupported extension files: 371

## API and Deployment Docs

- docs/API_EXAMPLES.md
- docs/ADMIN_WORKFLOW.md
- docs/DEPLOYMENT.md
# JPORTAL
