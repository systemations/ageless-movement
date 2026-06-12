import pool from '../db/pool.js';

// Lightweight access audit log for breach forensics (SECURITY.md L6). Records
// authenticated state-changing requests (POST/PUT/PATCH/DELETE) plus reads of
// sensitive endpoints, with the resolved user, path, response status, and IP.
//
// Runs on response 'finish' so it never adds latency to the request and a
// logging failure can never break a response. High-frequency GET polling
// (dashboard/messages/today) is intentionally NOT logged so the table stays a
// useful forensic record instead of noise. Mounted under /api, so req.path
// here is already relative to that mount — we log req.originalUrl for the full
// path.
const SENSITIVE_GET = /\/clients\b|\/profile\b|\/export\b|\/audit\b|\/purchases\b/;

export function accessLog(req, res, next) {
  res.on('finish', () => {
    try {
      const user = req.user; // set by authenticateToken on protected routes
      if (!user) return;
      const path = (req.originalUrl || req.url).split('?')[0];
      const isMutation = req.method !== 'GET';
      if (!isMutation && !SENSITIVE_GET.test(path)) return;
      const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || null;
      pool.query(
        'INSERT INTO access_log (user_id, method, path, status, ip) VALUES (?, ?, ?, ?, ?)',
        [user.id, req.method, path, res.statusCode, ip],
      );
    } catch { /* never block on logging */ }
  });
  next();
}
