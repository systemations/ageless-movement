import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { config } from '../lib/config.js';

// In-memory map of userId -> last last_active_at bump timestamp. Prevents
// us from hitting the DB on every single API call — we only update when
// the user has been quiet for 60s+.
const lastActiveBump = new Map();
const ACTIVE_DEBOUNCE_MS = 60_000;

function bumpLastActive(userId) {
  const now = Date.now();
  const prev = lastActiveBump.get(userId) || 0;
  if (now - prev < ACTIVE_DEBOUNCE_MS) return;
  lastActiveBump.set(userId, now);
  try {
    pool.query("UPDATE users SET last_active_at = datetime('now') WHERE id = $1", [userId]);
  } catch { /* non-fatal */ }
}

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    bumpLastActive(decoded.id);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: `Access restricted to ${role}s` });
  }
  next();
};

// Middleware factory: verify the caller is the coach assigned to the client
// identified by `req.params[paramName]`. If the caller is an admin user (a
// coach flagged as the sole-admin instance) the check passes — useful while
// Dan is the only coach. Once multi-coach, this blocks coach A from reading
// coach B's clients via a path param.
//
// Usage: router.get('/clients/:id/x', authenticateToken, requireRole('coach'),
//          requireCoachOwnsClient('id'), handler)
// Shared ownership check. Throws a response status if the coach shouldn't
// access `clientId`, else returns true. Used by both the param + body
// middleware variants, and inline by handlers that resolve the client id
// via custom logic (e.g. from a workout's program assignment).
function checkCoachOwnsClient(req, res, clientId) {
  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: 'Invalid client id' });
    return false;
  }
  const row = pool.query(
    "SELECT coach_id, role FROM users WHERE id = ? LIMIT 1",
    [clientId],
  ).rows[0];
  if (!row || row.role !== 'client') {
    res.status(404).json({ error: 'Client not found' });
    return false;
  }
  if (row.coach_id != null && row.coach_id !== req.user.id) {
    res.status(403).json({ error: 'You do not coach this client' });
    return false;
  }
  return true;
}

export const requireCoachOwnsClient = (paramName = 'id') => (req, res, next) => {
  try {
    if (checkCoachOwnsClient(req, res, Number(req.params[paramName]))) next();
  } catch (err) {
    console.error('requireCoachOwnsClient error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Body-param variant. Used when the target client is passed in the request
// body rather than the URL — e.g. /schedules POST where body={ user_id }.
export const requireCoachOwnsClientBody = (bodyKey = 'user_id') => (req, res, next) => {
  try {
    if (checkCoachOwnsClient(req, res, Number(req.body?.[bodyKey]))) next();
  } catch (err) {
    console.error('requireCoachOwnsClientBody error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Lightweight User-Agent parser. Covers the common cases coaches will
// care about (Chrome/Safari/Firefox on macOS/Windows/iOS/Android) without
// pulling a dependency. Returns { browser, os, device }.
export function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: null };
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari'
    : 'Browser';
  const device = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) && /Mobile/.test(ua) ? 'Android phone'
    : /Android/.test(ua) ? 'Android tablet'
    : null;
  return { browser, os, device };
}
