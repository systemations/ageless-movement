import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import exploreRoutes from './routes/explore.js';
import nutritionRoutes from './routes/nutrition.js';
import messagingRoutes from './routes/messaging.js';
import coachRoutes from './routes/coach.js';
import favouritesRoutes from './routes/favourites.js';
import uploadRoutes from './routes/uploads.js';
import contentRoutes from './routes/content.js';
import scheduleRoutes from './routes/schedule.js';
import challengeRoutes from './routes/challenges.js';
import coachesRoutes from './routes/coaches.js';
import athleteRoutes from './routes/athlete.js';
import notificationRoutes from './routes/notifications.js';
import benchmarkRoutes from './routes/benchmarks.js';
import onboardingRoutes from './routes/onboarding.js';
import painRoutes from './routes/pain.js';
import goalsRoutes from './routes/goals.js';
import paymentPlansRoutes from './routes/payment-plans.js';
import feedbackRoutes from './routes/feedback.js';
import myWorkoutsRoutes from './routes/my-workouts.js';
import gdprRoutes from './routes/gdpr.js';
import consentRoutes from './routes/consent.js';
import { config } from './lib/config.js';
import { fileCookieValid } from './middleware/auth.js';
import { accessLog } from './middleware/accessLog.js';
import { startPostSignupJobRunner } from './jobs/post-signup-tasks.js';
import { startReminderJobRunner } from './jobs/reminders.js';
import { startBackupJob } from './jobs/backup.js';
import { seedAssessmentLessons } from './db/seed-assessment-lessons.js';
import { seedPaymentPlans } from './db/seed-payment-plans.js';
import { sweepEmDashes } from './db/migrate-em-dash-sweep.js';
import { runMigrations } from './db/migrations.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = config.PORT;

// Trust the first proxy hop (Render's TLS terminator) so req.ip reflects
// the real client - otherwise rate limiters would key every request to
// the proxy's IP and effectively do nothing.
if (config.IS_PROD) app.set('trust proxy', 1);

// Security headers via helmet. Defaults are sensible for an API + SPA:
// HSTS (prod only), X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// plus hidden X-Powered-By. CSP is left off because we serve a React SPA
// from the same origin and locking it down needs per-asset nonces; revisit
// when we move to a strict CSP post-alpha.
// Content-Security-Policy (SECURITY.md L7). The built SPA has zero inline
// scripts (all are external bundles), so script-src can stay 'self' with no
// unsafe-inline. Inline *style attributes* are used throughout the app, so
// style-src needs 'unsafe-inline'. Images come from same-origin /uploads plus
// external thumbnails (Vimeo, handsdan.com) → https:. Vimeo/YouTube players
// are iframes → frame-src. This only enforces in prod, where Express serves
// the SPA; in dev the app is served by Vite and unaffected.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ['https://player.vimeo.com', 'https://www.youtube.com', 'https://youtube.com'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Vimeo iframes break with COEP
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image CDN usage
}));

// CORS policy:
// - Dev: allow every origin (Vite dev server runs on a different port and
//   proxies through; tooling like Postman also needs to work locally).
// - Prod: restrict to ALLOWED_ORIGINS env (comma-separated). If unset, only
//   same-origin requests are accepted - the target state once the client is
//   served from the same host as the API. Requests without an Origin header
//   (curl, server-to-server health checks) are always allowed.
if (config.IS_PROD) {
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (config.ALLOWED_ORIGINS.length === 0) return cb(null, false);
      if (config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));
} else {
  app.use(cors());
}
// Cap request body size. Most endpoints are small JSON; image uploads
// use multipart which multer handles separately with its own limit.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Serve uploaded files
// Served from server/data/uploads so it sits on the Render persistent
// disk. URL path stays /uploads/* - clients and stored URLs don't change.
const uploadsPath = path.join(__dirname, '..', 'data', 'uploads');
// Gate personal uploaded media behind a valid session (SECURITY.md L1). The
// am_file cookie is set on the first authenticated API call and rides along
// on same-origin <img> requests, so anonymous URL access is rejected while
// logged-in users see every image with no client changes.
app.use('/uploads', (req, res, next) => {
  if (fileCookieValid(req)) return next();
  return res.status(403).json({ error: 'Forbidden' });
}, express.static(uploadsPath));

// Global API rate limiter. Caps any single user (or anonymous IP) at
// 100 requests/minute across the whole API surface. Real human use
// is nowhere near this - opening Progress fires ~15 calls - so the
// cap only bites at attack speeds (token scraping, runaway client
// loops, DoS). Auth routes have their own per-action buckets in
// routes/auth.js (login 10/15m, register 5/1h, reset 10/15m), so
// we skip those here to avoid double-limiting. Health check is also
// exempt so external uptime monitors don't trip the limit.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user.id when we can read one from the JWT, else IP. This
  // means clients behind a shared NAT (office/family/cafe) don't
  // collectively exhaust the bucket. Decode-without-verify is fine
  // for keying - actual trust still runs in authenticateToken.
  keyGenerator: (req, res) => {
    // Key by user id from the auth cookie (L2) or Bearer header; else by IP.
    const cookieMatch = (req.headers.cookie || '').match(/(?:^|;\s*)am_auth=([^;]+)/);
    const raw = cookieMatch
      ? decodeURIComponent(cookieMatch[1])
      : (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (raw) {
      try {
        const claims = jwt.decode(raw);
        if (claims && claims.id) return `u:${claims.id}`;
      } catch { /* fall through to IP */ }
    }
    // ipKeyGenerator normalises IPv6 (collapses /64 prefix) so an
    // attacker can't trivially rotate addresses inside a single block.
    return `ip:${ipKeyGenerator(req, res)}`;
  },
  skip: (req) => req.path.startsWith('/api/auth') || req.path === '/api/health',
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api', apiLimiter);

// Access audit log (records authenticated mutations + sensitive reads).
app.use('/api', accessLog);

// CSRF defence-in-depth (SECURITY.md L2): the auth cookie is SameSite=Lax, so
// browsers don't attach it to cross-site state-changing requests. In prod we
// additionally reject mutations whose Origin is present and is neither
// same-host nor an allowed origin. Dev is exempt (open CORS for tooling).
if (config.IS_PROD) {
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        let sameHost = false;
        try { sameHost = new URL(origin).host === req.headers.host; } catch { /* malformed */ }
        if (!sameHost && !config.ALLOWED_ORIGINS.includes(origin)) {
          return res.status(403).json({ error: 'Cross-origin request blocked' });
        }
      }
    }
    next();
  });
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/messages', messagingRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/favourites', favouritesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/coaches', coachesRoutes);
app.use('/api/athlete', athleteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/pain', painRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/plans', paymentPlansRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/my-workouts', myWorkoutsRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/consent', consentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from React build in production. Vite hashes bundle
// filenames (index-XXXXXXXX.js) so we can cache /assets/* aggressively;
// the HTML shell must stay no-cache so a deploy is picked up immediately.
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath, {
  setHeaders: (res, filePath) => {
    if (filePath.includes('/assets/')) {
      // Hashed file - safe to cache for a year (and tell the browser it's
      // immutable so it never even revalidates).
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('index.html')) {
      // Shell must always be fresh so a new deploy reaches the user.
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA fallback - serve index.html for any non-API route. API 404s get a
// real JSON response so callers don't hang.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found', path: req.path });
  }
  // Shell must stay fresh - if we let the CDN/browser cache index.html
  // a new deploy's hashed bundle URLs won't reach the user.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startPostSignupJobRunner();
  startReminderJobRunner();
  startBackupJob();
  // Idempotent content seeders. Each one only writes when its target
  // rows are still empty, so this is safe to run on every start (local
  // dev + Render prod). Adds new content without touching coach edits.
  seedAssessmentLessons();
  seedPaymentPlans();
  sweepEmDashes();
  // Run-once content/schema migrations — the non-destructive way to ship
  // content to an already-populated prod DB (vs. a seed reseed that wipes it).
  runMigrations();
});
