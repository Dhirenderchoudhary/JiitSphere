# 🕵️‍♂️ Comprehensive Audit Report: JiitSphere Codebase

## 1. 🔒 SECURITY ANALYSIS

### Vulnerabilities & Risks

1. **Mass Assignment in S3 File Import/Admin Updates:**
   The `adminController.js` loops directly over requested `updatableFields`, including `isPublished`, blindly storing whatever is supplied as boolean/string. While minimally validated, this approach can easily become dangerous if new fields are added to the DB model without explicit stripping (e.g. ID tampering or permission escalation if fields leak).

2. **Timing Attack on Admin Key verification:**
   In `authAdmin.js`, `timingSafeEqual` is correctly used for checking the admin key, but the string is cast to buffer immediately without a prior length check (which throws when buffer lengths are different). A malicious actor can still glean string length details through repeated, variable length calls before a match occurs.

3. **Weak Authorization Flow for API keys:**
   The use of static `X-Admin-Key` and `X-Admin-Email` in `authAdmin.js` allows for severe replay attacks and compromises if either leaks (e.g. via logs or proxies). It should use modern JWT tokens like the rest of the application or HMAC-based challenge signatures for the static script access.

4. **Regex DoS Risk (ReDoS):**
   In `customPortalClient.js` and `portalMarks.js`, there are multiple heavy regex patterns (like `/[\s\S]*?/`) running on potentially huge HTML responses from the portal. This opens up the Node server to Regex DoS if the remote portal returns malformed huge payloads.

5. **Lack of Rate Limit on File Uploads:**
   The admin file upload endpoint `/api/v1/admin/materials` is excluded from a specific heavy-duty rate limit and purely relies on the global `apiLimiter`. Uploads (multipart forms) stream into memory/disk via `multer` which can lead to rapid storage exhaustion or memory crashes before global IP limits are hit.

### Fixes & Snippets
*Admin Key Timing Attack fix (`authAdmin.js`)*:
```javascript
const timingSafeEqual = (a, b) => {
  if (!a || !b) return false;
  // Pad strings to a consistent length before comparison to mask original length
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};
```

---

## 2. 🐛 BUG DETECTION

### Logical Errors & Broken Flows

1. **S3 Loop Operations Issue:**
   In `importFromS3.js`, the script loops sequentially inside a `for...of` array to do `await Material.findOne()` and `await Material.create()`. This generates an N+1 query problem against MongoDB Atlas which can timeout during large imports. Note that `AGENTS.md` (via memory) dictates batch processing using `$in` and `insertMany({ ordered: false })` - however, `importFromS3.js` currently still loops 1-by-1.

2. **Missing Local S3 Rollback on Model Failure:**
   In `adminController.js` `updateMaterial`, an S3 file is uploaded *before* the model is saved (`await material.save();`). If Mongoose validation fails or MongoDB goes down mid-request, the orphaned file lives forever in S3.

3. **Improper Cache Clearing on Updates:**
   In `materialController.js`, `browseOptionsCache` and `filterOptionsCache` are cached strictly via TTL (Time To Live). When an admin creates or deletes a material, the cache is not explicitly purged. The users will see stale search filters for up to 30 seconds.

### Fixes & Snippets
*Orphan File rollback fix (`adminController.js`)*:
```javascript
    try {
      const oldS3Key = material.s3Key;
      const uploadResult = await uploadFileToS3({...});
      // ... populate fields

      try {
        await material.save();
      } catch (dbErr) {
        // Rollback new S3 file if DB save fails
        await deleteFromS3(uploadResult.s3Key);
        throw dbErr;
      }

      if (oldS3Key && oldS3Key !== material.s3Key) {
        await deleteFromS3(oldS3Key);
      }
```

---

## 3. ⚡ PERFORMANCE OPTIMIZATION

### Concerns & Improvements

1. **Unbounded Mongoose Text Search:**
   `materialController.js` utilizes Mongoose's `$text = { $search: trimmedSearch }`. MongoDB Atlas Text Search is highly intensive on large collections. Implementing Atlas Vector Search or Atlas Search (Lucene) is significantly faster and more capable (fuzzy search).

2. **Memory Leak Risk in Cache Maps:**
   `browseOptionsCache` caps at 150 entries but clears the *oldest* entry. However, the deletion logic uses `[...browseOptionsCache.entries()].sort()` on every insertion once full. This is `O(n log n)` on an operation that blocks the event loop. It should utilize an LRU library like `lru-cache`.

3. **Redundant `$in` Queries on SDK marks:**
   The `portalMarks.js` parser processes enormous multi-page HTML documents by chunking strings. It processes synchronously, severely blocking the main Node thread. Parsing should ideally be farmed out to `worker_threads`.

---

## 4. 🧱 CODE QUALITY & ARCHITECTURE

### Smells & Refactoring Ideas

1. **God Controllers:**
   `portalRelayController.js` (550+ lines) and `portalSdkController.js` (thousands of lines of parsing logic) are massive God objects. They mix Express HTTP request handling (`req, res`), business logic, and crypto processing.
   *Refactor Idea*: Move portal fetch logic to `services/portalFetch.service.js`, and HTML scraping to `utils/portalScraper.js`.

2. **Scattered Error Handling:**
   We have `createHttpError` duplicated locally inside `adminController.js` and `materialController.js`. It should be centralized into `utils/errors.js` and imported.

3. **In-Memory Analytics (Monolith Smell):**
   `requestAnalyticsStore.js` tracks IP addresses, views, and latency directly in local Node heap memory. If deploying multiple replicas to Render (or when Node restarts), this analytics data is permanently lost or fragmented per-instance. It must be migrated to Redis.

---

## 5. 🧪 TESTING

### Assessment
- **Zero test coverage.** The `bun test` runner found 0 test files in both `backend/` and `web/`.
- No end-to-end tests exist for the critical WebKiosk Relay architecture.

### Implementations Needed
1. **Unit Tests (Backend):** Create `backend/src/utils/token.spec.js` to ensure JWT signing/verifying doesn't break.
2. **Integration Tests (Backend):** Use `supertest` with a local MongoMemoryServer to hit `/api/v1/materials`.
3. **E2E Tests (Frontend):** Use Playwright to simulate the `study-access` lock cookie and Google OAuth login flow.

---

## 6. 📦 DEPENDENCIES & DEVOPS

### Outdated Packages
Both `web` and `backend` suffer from severely outdated packages.
- **Backend:** `mongoose` (^8.6.1 -> ^9.5.0), `express` (^4.19.2 -> ^5.2.1).
- **Web:** `next` (^14.2.35 -> ^16.2.4), `react` (18.3.1 -> 19.2.5).

### DevOps Improvements
- **Missing Dockerfile:** The `render.yaml` uses a native Node environment. Including a standardized `Dockerfile` ensures parity across local testing, Render, and potential future Kubernetes migrations.
- **Node vs Bun Runtime:** `package.json` specifies `bun@1.3.11`, but `render.yaml` start commands use `node`. This split brain behavior means dev runs on Bun, but prod runs on Node, leading to unforeseen native module discrepancies (e.g. `crypto`, `fs`).

---

## 7. 🚀 PRODUCTION READINESS

### Observability & Logging
- **Missing Structured Logging:** The app relies on raw `console.log` and `console.error`. In production, this causes un-parseable text streams in Datadog/AWS CloudWatch. Replace with `pino` or `winston` for JSON structured logs.
- **No APM:** Lacks NewRelic/Datadog APM setup to trace the slow S3 uploads or Portal Relay timeouts.

---

## 8. 🧠 FINAL SUMMARY & ROADMAP

### Top 10 Critical Issues (Priority-wise)

1. **CRITICAL:** Missing S3 deletion rollback on MongoDB failure during material uploads.
2. **HIGH:** Static `X-Admin-Key` authorization is susceptible to leaks; migrate to HMAC/JWT.
3. **HIGH:** Native `console.log` usage prevents proper error monitoring in production.
4. **HIGH:** In-memory `requestAnalyticsStore.js` will fragment/lose data on Render instance restarts.
5. **MEDIUM:** Massive God objects (`portalRelayController.js`) make debugging difficult.
6. **MEDIUM:** Text search `$text` on MongoDB will degrade in performance; needs Atlas Search.
7. **MEDIUM:** No Unit or Integration tests.
8. **MEDIUM:** `browseOptionsCache` uses inefficient blocking `sort()` for pruning.
9. **LOW:** Outdated `express` and `mongoose` versions.
10. **LOW:** Discrepancy between Bun (dev package manager) and Node (prod runtime in `render.yaml`).

### Roadmap

*   **Phase 1 (Security & Data Integrity - Week 1):** Fix S3 Rollbacks, implement safe hash comparisons for API keys, and enforce file upload rate limits.
*   **Phase 2 (Observability - Week 2):** Implement `pino` logging, extract `requestAnalyticsStore.js` to a Redis backend.
*   **Phase 3 (Testing & Refactoring - Week 3):** Split `portalRelayController.js` into services. Add `supertest` for backend API integration tests.
*   **Phase 4 (DevOps & Performance - Week 4):** Standardize runtime to Docker (or enforce Bun in Render). Implement LRU cache. Upgrade dependencies to Next.js 15/16 and Express 5.