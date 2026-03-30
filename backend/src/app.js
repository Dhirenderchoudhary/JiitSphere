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
const errorHandler = require('./middlewares/errorHandler');
const requestAnalytics = require('./middlewares/requestAnalytics');
const { apiLimiter } = require('./middlewares/rateLimiters');

const app = express();

/* ── disable Express fingerprinting ──────────────────────────────── */
app.disable('x-powered-by');

const isLocalDevOrigin = (origin) => {
  if (typeof origin !== 'string') return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
};

if (env.trustProxy) {
  app.set('trust proxy', 1);
}

/* ── CORS — strict in production ─────────────────────────────────── */
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      if (env.isProduction) return callback(new Error('CORS origin denied'));
      return callback(null, true);
    }
    if (!env.isProduction && isLocalDevOrigin(origin)) return callback(null, true);
    if (!env.corsAllowedOrigins.length) {
      if (!env.isProduction) return callback(null, true);
      return callback(new Error('CORS origin denied'));
    }
    if (env.corsAllowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Admin-Email'],
  maxAge: 86400
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
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true
  })
);
app.use(
  helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' })
);

app.use(compression());
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

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'jiit-study-material-backend' });
});

if (env.storageProvider === 'local' && env.localMaterialsRoot) {
  app.use('/local-materials', express.static(path.resolve(env.localMaterialsRoot)));
}

app.use('/api/v1/materials', materialRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/portal', portalRoutes);

app.use(errorHandler);

module.exports = app;
