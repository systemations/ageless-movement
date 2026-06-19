import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { config } from '../lib/config.js';

// In-memory map of userId -> last last_active_at bump timestamp. Prevents
// us from hitting the DB on every single API call - we only update when
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

// ── Uploaded-file access gate (SECURITY.md L1) ────────────────────────────
// Files under /uploads (avatars, progress / check-in / chat photos, benchmark
// videos) are personal data. They were served by express.static with no auth,
// so anyone holding a URL could fetch them. We now gate them behind a short
// httpOnly cookie carrying the user's JWT: it's set on the first authenticated
// API call of a session and is sent automatically on same-origin <img>
// requests, so no client markup or stored *_url values change. This blocks
// anonymous URL access while keeping every image working for logged-in users.
const FILE_COOKIE = 'am_file';
const FILE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // match the JWT lifetime

// httpOnly auth cookie (SECURITY.md L2): carries the JWT so it's never exposed
// to JS. SameSite=Lax keeps it off cross-site state-changing requests (CSRF
// defence). Set on login/register, cleared on logout.
const AUTH_COOKIE = 'am_auth';
export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.IS_PROD,
    maxAge: FILE_COOKIE_MAX_AGE,
    path: '/',
  });
}
export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function cookieIsValid(value) {
  if (!value) return false;
  try { jwt.verify(value, config.JWT_SECRET, { algorithms: ['HS256'] }); return true; }
  catch { return false; }
}

// True when a token's session has been revoked (logout, password change/reset).
// Tokens minted before sessions existed carry no `sid` and are allowed through
// until expiry (so a deploy doesn't force-log-out everyone). Shared by the API
// auth path and the /uploads file gate so a revoked token can't keep fetching
// files until JWT expiry (SECURITY.md L1 + L3).
function sessionRevoked(decoded) {
  if (!decoded || !decoded.sid) return false;
  const sess = pool.query('SELECT revoked_at FROM sessions WHERE id = ?', [decoded.sid]).rows[0];
  return !sess || !!sess.revoked_at;
}

// Set the file-access cookie only when the request isn't already carrying a
// valid one, so we don't append Set-Cookie to every authenticated response.
function ensureFileCookie(req, res, token) {
  if (cookieIsValid(parseCookies(req.headers.cookie)[FILE_COOKIE])) return;
  res.cookie(FILE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.IS_PROD,
    maxAge: FILE_COOKIE_MAX_AGE,
    path: '/',
  });
}

// Guard used by the /uploads static handler in index.js. Honors session
// revocation (via fileCookieUser) so a logged-out / revoked token is rejected.
export function fileCookieValid(req) {
  return fileCookieUser(req) !== null;
}

// Decode the user from the file-access cookie (or null). Lets the /uploads gate
// know WHO is requesting a file so it can enforce per-user authorization — and
// rejects a token whose session has been revoked, so logout / password change
// cuts off file access immediately instead of lingering until JWT expiry.
export function fileCookieUser(req) {
  const value = parseCookies(req.headers.cookie)[FILE_COOKIE];
  if (!value) return null;
  let decoded;
  try { decoded = jwt.verify(value, config.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return null; }
  if (sessionRevoked(decoded)) return null;
  return decoded;
}

// Pure boolean version of the coach-owns-client check (no response side effect).
// Mirrors checkCoachOwnsClient: an unassigned client (coach_id NULL) is visible
// to the sole-admin coach. Used by the file gate.
export function coachOwnsClient(coachUserId, clientUserId) {
  if (!Number.isFinite(clientUserId)) return false;
  const row = pool.query('SELECT coach_id, role FROM users WHERE id = ? LIMIT 1', [clientUserId]).rows[0];
  if (!row || row.role !== 'client') return false;
  if (row.coach_id == null) return true;
  return row.coach_id === coachUserId;
}

// Resolve the user from a ?ft=<file-token> query param. Native <img> requests
// can't carry the am_file cookie or an Authorization header cross-origin, so the
// native build appends this file-only token to /uploads URLs (going-native
// Phase 1b). We verify it, require typ='file', and honor session revocation —
// then canAccessFile applies the SAME per-file authz as the cookie path, so L1
// is preserved (the token only unlocks files this user is already allowed to see).
function fileQueryUser(req) {
  const ft = req.query && req.query.ft;
  if (!ft || typeof ft !== 'string') return null;
  let decoded;
  try { decoded = jwt.verify(ft, config.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return null; }
  if (decoded.typ !== 'file') return null;
  if (sessionRevoked(decoded)) return null;
  return decoded;
}

// Per-user authorization for an uploaded file (SECURITY.md L1). Anonymous → no
// (preserves the original cookie gate). Otherwise, by the file's registered
// visibility:
//   content → any authenticated user (coach-uploaded shared content)
//   message → members of the conversation
//   private → the owner, or the owner's coach
// Unregistered files (legacy/seed/coach content not tracked) are allowed: every
// PRIVATE column is backfilled into file_assets, so an unknown file is
// non-sensitive shared content rather than personal data.
export function canAccessFile(req) {
  const user = fileCookieUser(req) || fileQueryUser(req);
  if (!user) return false;
  // Inside the '/uploads' mount, req.path is mount-relative ('/<uuid>.<ext>').
  const filename = (req.path || '').split('/').filter(Boolean).pop() || '';
  if (!filename) return false;
  const asset = pool.query(
    'SELECT owner_user_id, visibility, conversation_id FROM file_assets WHERE filename = ?',
    [filename],
  ).rows[0];
  if (!asset) return true;                              // unregistered → shared/legacy content
  if (asset.visibility === 'content') return true;
  if (user.id === asset.owner_user_id) return true;    // owner always
  if (asset.visibility === 'message') {
    if (!asset.conversation_id) return false;
    return !!pool.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [asset.conversation_id, user.id],
    ).rows[0];
  }
  // private: the owner's coach may view (e.g. coach reviewing check-in photos).
  if (user.role === 'coach' && coachOwnsClient(user.id, asset.owner_user_id)) return true;
  return false;
}

export const authenticateToken = (req, res, next) => {
  // Prefer the httpOnly auth cookie (SECURITY.md L2) so the real JWT never has
  // to live in JS/localStorage where XSS could read it. Fall back to the
  // Authorization header for API tooling and pre-migration clients. (The
  // migrated SPA sends a harmless sentinel Bearer; the cookie is authoritative.)
  const cookieToken = parseCookies(req.headers.cookie)[AUTH_COOKIE];
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Pin the algorithm explicitly. jsonwebtoken >=9 blocks `none` by
    // default, but callers that rely on defaults have been bitten before - 
    // an algorithm whitelist is defence-in-depth and costs nothing.
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    // Session revocation check (SECURITY.md L3) — shared with the file gate.
    if (sessionRevoked(decoded)) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    req.user = decoded;
    ensureFileCookie(req, res, token);
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
// coach flagged as the sole-admin instance) the check passes - useful while
// Dan is the only coach. Once multi-coach, this blocks coach A from reading
// coach B's clients via a path param.
//
// Usage: router.get('/clients/:id/x', authenticateToken, requireRole('coach'),
//          requireCoachOwnsClient('id'), handler)
// Shared ownership check. Sends a response status if the coach shouldn't
// access `clientId`, else returns true. Used by both the param + body
// middleware variants, and inline by handlers that resolve the client id
// via custom logic (e.g. from a row's user_id after looking up by row id).
// Exported so route handlers that don't fit the middleware-factory shape
// (mutation-by-row-id endpoints) can still reuse the same semantics.
export function checkCoachOwnsClient(req, res, clientId) {
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
// body rather than the URL - e.g. /schedules POST where body={ user_id }.
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
