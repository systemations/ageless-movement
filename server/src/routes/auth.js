import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { config } from '../lib/config.js';

// Slow down brute-force login / register attempts. Keyed by IP — a
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

const router = Router();

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (role !== 'client') {
      return res.status(400).json({ error: 'Public registration is for clients only' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, avatar_url, created_at',
      [email, passwordHash, name, role]
    );

    const user = result.rows[0];

    if (role === 'client') {
      await pool.query('INSERT INTO client_profiles (user_id) VALUES ($1)', [user.id]);
    } else {
      await pool.query('INSERT INTO coach_profiles (user_id) VALUES ($1)', [user.id]);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.status(201).json({ user, token });
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
      'SELECT id, email, password_hash, name, role, avatar_url FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

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

// Password reset — consume a token generated by a coach for a client.
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

    const row = pool.query(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?',
      [token],
    ).rows[0];
    if (!row) return res.status(400).json({ error: 'Invalid or expired token' });
    if (row.used_at) return res.status(400).json({ error: 'This reset link has already been used' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Ask your coach for a new one.' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id]);
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
