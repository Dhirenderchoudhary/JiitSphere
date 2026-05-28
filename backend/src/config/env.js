const crypto = require('crypto');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const isProduction = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';

const INSECURE_DEFAULTS = [
  'replace-this-auth-secret',
  'replace-with-strong-random-secret',
  'change-this-admin-key'
];

const rawConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || 5000),
  logHttpRequests: parseBool(process.env.LOG_HTTP_REQUESTS, false),
  logStartup: parseBool(process.env.LOG_STARTUP, false),
  trustProxy: parseBool(process.env.TRUST_PROXY, false),
  corsAllowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jsonBodyLimitMb: Number(process.env.JSON_BODY_LIMIT_MB || 2),
  globalRateLimitWindowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  globalRateLimitMax: Number(process.env.GLOBAL_RATE_LIMIT_MAX || (isProduction ? 300 : 1200)),
  serverKeepAliveTimeoutMs: Number(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || 65000),
  serverHeadersTimeoutMs: Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 66000),
  gracefulShutdownTimeoutMs: Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || 12000),
  mongodbUri: process.env.MONGODB_URI || '',
  allowStartWithoutDb: isProduction ? false : parseBool(process.env.ALLOW_START_WITHOUT_DB, false),
  storageProvider: (process.env.STORAGE_PROVIDER || 's3').toLowerCase(),
  localMaterialsRoot: process.env.LOCAL_MATERIALS_ROOT,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  awsRegion: process.env.AWS_REGION,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsS3Bucket: process.env.AWS_S3_BUCKET,
  s3ExistingPrefix: process.env.S3_EXISTING_PREFIX || '',
  cloudFrontBaseUrl: process.env.CLOUDFRONT_BASE_URL,
  importUploadedBy: process.env.IMPORT_UPLOADED_BY || 'bulk-import-script',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  adminAllowedEmails: String(process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  authSecret: process.env.AUTH_SECRET || '',
  userPasswordHash: process.env.USER_PASSWORD_HASH || '',
  userAllowedIdentifiers: String(process.env.USER_ALLOWED_IDENTIFIERS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  userAllowAll: String(process.env.USER_ALLOWED_IDENTIFIERS || '')
    .split(',')
    .map((value) => value.trim())
    .includes('*'),
  portalRelayBaseUrl: process.env.PORTAL_RELAY_BASE_URL || 'https://webportal.jiit.ac.in:6011/studentportal',
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || (isProduction ? 15 * 60 * 1000 : 60 * 1000)),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || (isProduction ? 5 : 30)),
  portalPublicDemoEnabled: parseBool(process.env.PORTAL_PUBLIC_DEMO_ENABLED, true),
  relayRateLimitWindowMs: Number(process.env.RELAY_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  relayRateLimitMax: Number(process.env.RELAY_RATE_LIMIT_MAX || (isProduction ? 60 : 120)),
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 200),
  portalRealtimeDefault: parseBool(process.env.PORTAL_REALTIME_DEFAULT, false),
  portalRealtimeMinSyncIntervalMs: Number(process.env.PORTAL_REALTIME_MIN_SYNC_INTERVAL_MS || 30000),
  portalBootstrapAttendanceSemesters: Number(process.env.PORTAL_BOOTSTRAP_ATTENDANCE_SEMESTERS || 1),
  portalRequestTimeoutMs: Number(process.env.PORTAL_REQUEST_TIMEOUT_MS || 12000),
  portalTokenMaxAgeMs: Number(process.env.PORTAL_TOKEN_MAX_AGE_MS || 1000 * 60 * 60 * 24 * 7),
  sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_MS || 24 * 60 * 60 * 1000),
  sessionCleanupIntervalMs: Number(process.env.SESSION_CLEANUP_INTERVAL_MS || 15 * 60 * 1000)
};

const envSchema = z.object({
  nodeEnv: z.string(),
  isProduction: z.boolean(),
  port: z.number(),
  logHttpRequests: z.boolean(),
  logStartup: z.boolean(),
  trustProxy: z.boolean(),
  corsAllowedOrigins: z.array(z.string()).refine((val) => !isProduction || val.length > 0, {
    message: "CORS_ALLOWED_ORIGINS must explicitly list allowed origins in production"
  }),
  jsonBodyLimitMb: z.number(),
  globalRateLimitWindowMs: z.number(),
  globalRateLimitMax: z.number(),
  serverKeepAliveTimeoutMs: z.number(),
  serverHeadersTimeoutMs: z.number(),
  gracefulShutdownTimeoutMs: z.number(),
  mongodbUri: z.string().min(1, 'MONGODB_URI must be set'),
  allowStartWithoutDb: z.boolean(),
  storageProvider: z.string(),
  localMaterialsRoot: z.string().optional(),
  publicBaseUrl: z.string(),
  awsRegion: z.string().optional(),
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsS3Bucket: z.string().optional(),
  s3ExistingPrefix: z.string(),
  cloudFrontBaseUrl: z.string().optional(),
  importUploadedBy: z.string(),
  adminApiKey: z.string().refine((val) => {
    if (!isProduction) return true;
    return val.length > 0 && !INSECURE_DEFAULTS.includes(val);
  }, { message: "ADMIN_API_KEY must be set to a strong random value in production" }),
  adminAllowedEmails: z.array(z.string()),
  authSecret: z.string().refine((val) => {
    if (!isProduction) return true;
    return val.length >= 32 && !INSECURE_DEFAULTS.includes(val);
  }, { message: "AUTH_SECRET must be at least 32 characters and not a default in production" }),
  userPasswordHash: z.string().refine((val) => {
    if (!isProduction) return true;
    return val.length > 0;
  }, { message: "USER_PASSWORD_HASH must be set in production" }),
  userAllowedIdentifiers: z.array(z.string()),
  userAllowAll: z.boolean(),
  portalRelayBaseUrl: z.string(),
  authRateLimitWindowMs: z.number(),
  authRateLimitMax: z.number(),
  portalPublicDemoEnabled: z.boolean(),
  relayRateLimitWindowMs: z.number(),
  relayRateLimitMax: z.number(),
  maxUploadSizeMb: z.number(),
  portalRealtimeDefault: z.boolean(),
  portalRealtimeMinSyncIntervalMs: z.number(),
  portalBootstrapAttendanceSemesters: z.number(),
  portalRequestTimeoutMs: z.number(),
  portalTokenMaxAgeMs: z.number(),
  sessionMaxAgeMs: z.number(),
  sessionCleanupIntervalMs: z.number()
});

const parsed = envSchema.safeParse(rawConfig);

if (!parsed.success) {
  console.error('\n╔══════════════════════════════════════════════════════╗');
  console.error('║  FATAL: Environment validation failed                ║');
  console.error('╚══════════════════════════════════════════════════════╝');
  parsed.error.errors.forEach((e) => console.error(`  ✗ ${e.path.join('.')}: ${e.message}`));
  console.error('');
  process.exit(1);
}

module.exports = parsed.data;
