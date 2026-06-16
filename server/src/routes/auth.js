import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';
import { authenticateToken, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { config } from '../lib/config.js';
import { sendEmail, passwordResetEmail } from '../lib/mailer.js';
import { finalizeOnboarding } from '../lib/onboarding.js';
import { recordConsentAtSignup } from './consent.js';
import { queuePostSignupTasks } from '../jobs/post-signup-tasks.js';
import { DEFAULT_CLIENT_TASKS } from '../lib/default-tasks.js';

// Slow down brute-force login / register attempts. Keyed by IP - a
// dedicated attacker can rotate IPs but this blocks the common case of
// credential stuffing from a single host.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 signups per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Try again later.' },
});

// Dedicated bucket for password reset so a login flood can't exhaust it
// (and vice versa). Token guessing is already cryptographically infeasible,
// but this blocks noisy probes and reduces server load.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Try again shortly.' },
});

// Self-service "forgot password" requests. Kept separate from resetLimiter so
// a flood of forgot requests can't exhaust the token-consume bucket. Per IP.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again shortly.' },
});

const router = Router();

// Two flow shapes both land here:
//   1. Slim register (new flow): { email, password, name, role } only.
//      Account is created with onboarding_complete = 0 so the routing
//      guard locks them on /onboarding until they finish the questions.
//      The full questionnaire runs after login and finalises via
//      POST /api/onboarding/finalize.
//   2. Legacy register (kept for the anonymous funnel that still ships
//      the answers in the same request, and for any cached older
//      builds): { email, password, name, role, onboarding } - server
//      finalises immediately. This path will be retired once the slim
//      flow is the only entry point everywhere.
// Server-side sessions for JWT revocation (SECURITY.md L3). Login/register mint
// a session row and bake its id into the JWT as `sid`; authenticateToken rejects
// a token whose session has been revoked. Tokens issued before this feature have
// no sid and stay valid until expiry.
function createSession(userId, req) {
  const sid = crypto.randomUUID();
  const ua = req.headers['user-agent'] || null;
  const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || null;
  try {
    pool.query('INSERT INTO sessions (id, user_id, user_agent, ip) VALUES (?, ?, ?, ?)', [sid, userId, ua, ip]);
  } catch (e) { console.error('createSession failed:', e); }
  return sid;
}
function signToken(user, sid) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, sid },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN },
  );
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, role, onboarding, timezone } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Minimum password strength at signup. Change-password and reset already
    // enforce this; registration did not, so any non-empty password was accepted.
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (role !== 'client') {
      return res.status(400).json({ error: 'Public registration is for clients only' });
    }

    // Normalize email so register / login / reset all match case-insensitively
    // (avoids a mixed-case signup that can't later log in or self-reset).
    const normEmail = String(email).trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [normEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, avatar_url, created_at',
      [normEmail, passwordHash, name, role]
    );

    const user = result.rows[0];
    // Capture browser-detected IANA timezone if the client sent one. Falls
    // back to NULL - the recurring scheduler treats NULL as UTC.
    const tz = (typeof timezone === 'string' && /^[A-Za-z_+\-/0-9]+$/.test(timezone) && timezone.length < 64) ? timezone : null;
    await pool.query('INSERT INTO client_profiles (user_id, timezone) VALUES ($1, $2)', [user.id, tz]);

    // Record versioned, timestamped consent to the current Terms/Privacy (L8).
    const consentIp = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || null;
    recordConsentAtSignup(user.id, consentIp);

    // Queue the deferred welcome DM + 24h plans nudge. Wrapped so any
    // scheduler failure never blocks the register response.
    try { queuePostSignupTasks(user.id); } catch (e) { console.error('queuePostSignupTasks failed:', e); }

    // Pre-populate the Home "Today's Tasks" card with sensible defaults so
    // the surface isn't empty when a new client lands. coach_id NULL marks
    // them as client-managed (same convention as dashboard.js POST /tasks);
    // the client can delete any they don't want.
    try {
      for (const label of DEFAULT_CLIENT_TASKS) {
        await pool.query('INSERT INTO tasks (coach_id, client_id, label, recurring) VALUES (NULL, $1, $2, 1)', [user.id, label]);
      }
    } catch (e) { console.error('Default tasks seed failed:', e); }

    // Legacy path: answers came in the same request, finalise inline.
    let allocation = null;
    if (onboarding && typeof onboarding === 'object') {
      try {
        ({ allocation } = finalizeOnboarding(user.id, onboarding));
      } catch (e) {
        console.error('Inline finalize failed:', e);
        // Don't blow up the register - they'll just hit the post-login
        // questionnaire flow as if it were a slim signup.
      }
    }

    const token = signToken(user, createSession(user.id, req));
    setAuthCookie(res, token); // httpOnly auth cookie (L2)

    res.status(201).json({ user, token, allocation });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, name, role, avatar_url FROM users WHERE LOWER(email) = $1',
      [String(email).trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user, createSession(user.id, req));
    setAuthCookie(res, token); // httpOnly auth cookie (L2)

    // Record login event + bump last-active. Coach ClientProfile uses
    // this for the "Last seen" pill and the Recent logins card.
    try {
      const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim())
        || req.ip || req.connection?.remoteAddress || null;
      const ua = req.headers['user-agent'] || null;
      pool.query(
        'INSERT INTO login_events (user_id, ip, user_agent) VALUES ($1, $2, $3)',
        [user.id, ip, ua],
      );
      pool.query("UPDATE users SET last_active_at = datetime('now') WHERE id = $1", [user.id]);
    } catch (e) { /* non-fatal */ }

    // Refresh stored timezone if the client sent one. People travel, browsers
    // change. The reminder scheduler reads whatever's most recent.
    try {
      const tz = req.body.timezone;
      if (user.role === 'client' && typeof tz === 'string' && /^[A-Za-z_+\-/0-9]+$/.test(tz) && tz.length < 64) {
        pool.query(
          'UPDATE client_profiles SET timezone = $1 WHERE user_id = $2 AND (timezone IS NULL OR timezone != $1)',
          [tz, user.id],
        );
      }
    } catch (e) { /* non-fatal */ }

    // Attach client status (paused/archived drive a banner on the client UI).
    let clientStatus = null;
    if (user.role === 'client') {
      const sp = pool.query(
        "SELECT COALESCE(status, 'active') as status, status_note FROM client_profiles WHERE user_id = $1",
        [user.id],
      ).rows[0];
      clientStatus = sp ? { status: sp.status, note: sp.status_note } : { status: 'active', note: null };
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token, client_status: clientStatus });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    let profile = null;
    if (user.role === 'client') {
      const p = await pool.query('SELECT * FROM client_profiles WHERE user_id = $1', [user.id]);
      profile = p.rows[0] || null;
    } else {
      const p = await pool.query('SELECT * FROM coach_profiles WHERE user_id = $1', [user.id]);
      profile = p.rows[0] || null;
    }

    res.json({ user, profile });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update client profile (currently used for profile photo)
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { profile_image_url } = req.body;
    await pool.query(
      'UPDATE client_profiles SET profile_image_url = $1 WHERE user_id = $2',
      [profile_image_url, req.user.id]
    );
    res.json({ success: true, profile_image_url });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout - revoke the current session (SECURITY.md L3). The JWT stays
// cryptographically valid until expiry, but its session is marked revoked so
// authenticateToken rejects it immediately. Also clears the uploaded-file
// cookie (L1).
router.post('/logout', authenticateToken, (req, res) => {
  try {
    if (req.user.sid) {
      pool.query("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?", [req.user.sid]);
    }
    clearAuthCookie(res);
    res.clearCookie('am_file', { path: '/' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password while logged in (Profile -> Change Password). Requires
// the current password as proof so a hijacked session can't silently swap
// the password and lock the real user out. Same min-length rule as the
// coach-issued reset path.
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const user = pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    // Revoke every OTHER session on password change (keep the one making the
    // change), so a stolen token elsewhere is killed.
    pool.query(
      "UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL AND id != ?",
      [req.user.id, req.user.sid || ''],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Self-service forgot password. The client enters their email; if an account
// exists we mint a single-use token (same shape as the coach-initiated flow)
// and email the reset link via Resend. The response is ALWAYS the same generic
// success regardless of whether the email matched a real account - this is
// what prevents the endpoint from being used to enumerate registered emails.
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  // Identical body whether or not the account exists (anti-enumeration).
  const genericOk = {
    ok: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  };
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = pool.query(
      'SELECT id, email, name FROM users WHERE LOWER(email) = ?',
      [email],
    ).rows[0];
    // Unknown email: return the same success without doing any work.
    if (!user) return res.json(genericOk);

    // Invalidate any previous unused tokens so only the newest link works.
    pool.query(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
      [user.id],
    );

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    // created_by = the user themselves for a self-service request.
    pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_by)
       VALUES (?, ?, ?, ?)`,
      [user.id, tokenHash, expiresAt, user.id],
    );

    const resetUrl = `${config.APP_BASE_URL}/reset-password?token=${token}`;
    try {
      const { subject, html, text } = passwordResetEmail({ name: user.name, resetUrl });
      await sendEmail({ to: user.email, subject, html, text });
    } catch (e) {
      // Don't leak send failures (or account existence) to the caller - the
      // token is already valid, and a transient mail error shouldn't change
      // the response shape. Logged for ops.
      console.error('Forgot-password email failed:', e);
    }
    return res.json(genericOk);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Password reset - consume a token generated by a coach for a client.
// Coach-initiated flow: coach hits POST /api/coach/clients/:id/reset-password
// which returns a URL containing a one-time token. The client opens that URL,
// enters a new password, and this endpoint swaps it in.
router.post('/reset-password', resetLimiter, async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Tokens are stored hashed (see coach reset-password generation), so hash
    // the incoming raw token before looking it up.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = pool.query(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?',
      [tokenHash],
    ).rows[0];
    if (!row) return res.status(400).json({ error: 'Invalid or expired token' });
    if (row.used_at) return res.status(400).json({ error: 'This reset link has already been used' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Ask your coach for a new one.' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id]);
    // A reset means the user had lost access — kill every existing session.
    pool.query("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL", [row.user_id]);
    pool.query(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?",
      [row.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
