const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const env = require('./config/env');
const materialRoutes = require('./routes/materialRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const portalRoutes = require('./routes/portalRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const errorHandler = require('./middlewares/errorHandler');
const requestAnalytics = require('./middlewares/requestAnalytics');
const { apiLimiter } = require('./middlewares/rateLimiters');
const { trackPageView } = require('./services/requestAnalyticsStore');
const healthRoute = require('./routes/health');

const app = express();

/* ── disable Express fingerprinting ──────────────────────────────── */
app.disable('x-powered-by');

const isLocalDevOrigin = (origin) => {
  if (typeof origin !== 'string') return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
};

const matchesAllowedOrigin = (origin, allowedOrigin) => {
  if (!origin || !allowedOrigin) return false;
  const normalizedAllowed = String(allowedOrigin).trim();
  if (origin === normalizedAllowed) return true;

  let expectedProtocol = null;
  let wildcardHost = null;

  const schemeWildcard = normalizedAllowed.match(/^(https?):\/\/\*\.(.+)$/i);
  if (schemeWildcard) {
    expectedProtocol = `${schemeWildcard[1].toLowerCase()}:`;
    wildcardHost = schemeWildcard[2].toLowerCase();
  } else if (normalizedAllowed.startsWith('*.')) {
    wildcardHost = normalizedAllowed.slice(2).toLowerCase();
  }

  if (!wildcardHost) return false;

  try {
    const originUrl = new URL(origin);
    const originProtocol = originUrl.protocol;
    const originHost = originUrl.hostname.toLowerCase();

    if (expectedProtocol && originProtocol !== expectedProtocol) return false;

    return originHost === wildcardHost || originHost.endsWith(`.${wildcardHost}`);
  } catch (_error) {
    return false;
  }
};

if (env.trustProxy) {
  app.set('trust proxy', 1);
}

/* ── CORS — strict in production ─────────────────────────────────── */
const corsOptions = {
  origin(origin, callback) {
    const denyCors = () => {
      const originLabel = origin || 'unknown';
      const error = new Error(`CORS origin denied: ${originLabel}`);
      error.statusCode = 403;
      return callback(error);
    };

    if (!origin) {
      // Non-browser callers (health checks, server-to-server, curl) may omit Origin.
      // Allow them and continue to enforce explicit checks when an Origin is present.
      if (env.isProduction) return callback(null, true);
      return callback(null, true);
    }
    if (!env.isProduction && isLocalDevOrigin(origin)) return callback(null, true);
    if (!env.corsAllowedOrigins.length) {
      if (!env.isProduction) return callback(null, true);
      return denyCors();
    }
    if (
      env.corsAllowedOrigins.some((allowedOrigin) => matchesAllowedOrigin(origin, allowedOrigin))
    ) {
      return callback(null, true);
    }
    return denyCors();
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Admin-Email'],
  maxAge: 86400,
};

/* ── Helmet with strict Content-Security-Policy + HSTS ───────────── */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
  })
);
app.use(helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' }));

/**
 * Never gzip the material files themselves. They are already-compressed
 * formats, and encoding them drops Content-Length and byte-range support — so
 * the browser's PDF viewer has to pull the whole file before it can render
 * page one. JSON API responses still get compressed.
 */
app.use(
  compression({
    filter: (req, res) => !req.path.startsWith('/local-materials') && compression.filter(req, res),
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: `${env.jsonBodyLimitMb}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${env.jsonBodyLimitMb}mb` }));
if (env.logHttpRequests && !env.isProduction) {
  app.use(morgan('dev'));
} else if (env.logHttpRequests) {
  app.use(morgan('combined'));
}
app.use(requestAnalytics);
app.use('/api/v1', apiLimiter);

app.use('/health', healthRoute);

if (env.storageProvider === 'local' && env.localMaterialsRoot) {
  app.use(
    '/local-materials',
    express.static(path.resolve(env.localMaterialsRoot), {
      // Keys are UUID-prefixed, so a URL never changes content — cache forever
      // instead of re-downloading the PDF on every view.
      maxAge: '1y',
      immutable: true,
      // Range requests let the browser's PDF viewer stream the first pages
      // instead of waiting for the whole file.
      acceptRanges: true,
    })
  );
}

app.use('/api/v1/materials', materialRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/superadmin', superadminRoutes);

/* ── Lightweight page-view beacon ── */
app.post('/api/v1/track', (req, res) => {
  const page = String(req.body?.page || '/').slice(0, 500);
  trackPageView({
    page,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
    referrer: req.headers.referer || req.headers.referrer || req.body?.referrer || '',
  });
  res.status(204).end();
});

app.use(errorHandler);

module.exports = app;
