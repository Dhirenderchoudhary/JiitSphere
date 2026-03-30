# Deployment Guide (Vercel + Railway)

## 1. MongoDB Atlas (mandatory for full backend)

1. Create Atlas cluster and DB user.
2. In Atlas Network Access, allow Railway egress (or temporarily `0.0.0.0/0` while testing).
3. Copy `mongodb+srv://...` URI for `MONGODB_URI`.

Note:
- If you get `querySrv ECONNREFUSED _mongodb._tcp...`, DNS/SRV lookup is blocked or URI is invalid.
- In dev fallback mode you can set `ALLOW_START_WITHOUT_DB=true` to boot backend without Mongo (limited APIs).

## 2. Backend on Railway

1. Create a new Railway project and link this repo.
2. Set Root Directory to `backend`.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add env vars:
   - `NODE_ENV=production`
   - `PORT=5000`
   - `MONGODB_URI=<atlas-uri>`
   - `ALLOW_START_WITHOUT_DB=false`
   - `AUTH_SECRET=<strong-random-secret>`
   - `USER_ALLOWED_IDENTIFIERS=*` or your allowlist
   - `USER_PASSWORD_HASH=<sha256-of-login-password>`
   - `ADMIN_API_KEY=<strong-random-key>`
   - `ADMIN_ALLOWED_EMAILS=<comma-separated-emails>`
   - `PORTAL_RELAY_BASE_URL=https://webportal.jiit.ac.in:6011/studentportal`
   - `PORTAL_REALTIME_DEFAULT=true`
   - `PORTAL_REALTIME_MIN_SYNC_INTERVAL_MS=15000`
   - `PORTAL_REQUEST_TIMEOUT_MS=12000`
6. Deploy and verify:
   - `GET /health`
   - `GET /api/v1/auth/me` (with token)

## 3. Frontend on Vercel

1. Import the same repo in Vercel.
2. Set Root Directory to `web`.
3. Framework Preset: Next.js.
4. Add env vars:
   - `NEXT_PUBLIC_API_BASE_URL=https://<railway-domain>/api/v1`
   - `INTERNAL_API_BASE_URL=https://<railway-domain>/api/v1`
   - `ADMIN_API_KEY=<same-as-backend>`
   - `NEXT_PUBLIC_PORTAL_REALTIME=true`
   - `NEXT_PUBLIC_ALLOW_UNVERIFIED_PORTAL_LOGIN=false`
   - `STUDY_MATERIAL_PASSWORD_HASH=<sha256-of-site-lock-password>`
5. Deploy and verify:
   - `/study-access` appears when not unlocked
   - Portal login works and data refreshes from backend

## 4. Site Lock Password Hash

Use SHA-256 hash in env, never raw password in code.

Example:
```bash
echo -n "YOUR_PASSWORD" | shasum -a 256
```

Set output hash into:
- `web` env: `STUDY_MATERIAL_PASSWORD_HASH`

## 5. Optional File Storage (S3 + CloudFront)

If you serve files from S3:
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`
- `CLOUDFRONT_BASE_URL`

## 6. Bulk Import Existing Folder

From `backend/`:
```bash
npm run import:folder -- ../StudyMaterial --dry-run --report ./import-report.json
npm run import:folder -- ../StudyMaterial --report ./import-report.json
```
