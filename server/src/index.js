import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { config } from './lib/config.js';
import { startPostSignupJobRunner } from './jobs/post-signup-tasks.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = config.PORT;

// Trust the first proxy hop (Render's TLS terminator) so req.ip reflects
// the real client — otherwise rate limiters would key every request to
// the proxy's IP and effectively do nothing.
if (config.IS_PROD) app.set('trust proxy', 1);

// Security headers via helmet. Defaults are sensible for an API + SPA:
// HSTS (prod only), X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// plus hidden X-Powered-By. CSP is left off because we serve a React SPA
// from the same origin and locking it down needs per-asset nonces; revisit
// when we move to a strict CSP post-alpha.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false, // Vimeo iframes break with COEP
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image CDN usage
}));

// CORS policy:
// - Dev: allow every origin (Vite dev server runs on a different port and
//   proxies through; tooling like Postman also needs to work locally).
// - Prod: restrict to ALLOWED_ORIGINS env (comma-separated). If unset, only
//   same-origin requests are accepted — the target state once the client is
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
// disk. URL path stays /uploads/* — clients and stored URLs don't change.
const uploadsPath = path.join(__dirname, '..', 'data', 'uploads');
app.use('/uploads', express.static(uploadsPath));

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from React build in production
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

// SPA fallback — serve index.html for any non-API route. API 404s get a
// real JSON response so callers don't hang.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found', path: req.path });
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startPostSignupJobRunner();
});
