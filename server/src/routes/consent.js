import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

// Versioned consent (SECURITY.md L8). The signup page reads the current
// versions to display + link the Terms/Privacy; on register we record a
// timestamped, IP-stamped acceptance row per current version.
const router = Router();

export function currentConsentVersions() {
  return pool.query(
    'SELECT id, kind, version, summary, effective_date FROM consent_versions WHERE is_current = 1 ORDER BY kind',
  ).rows;
}

// Record the user's acceptance of every current consent version. Called from
// the register handler; never throws into the request.
export function recordConsentAtSignup(userId, ip) {
  try {
    for (const v of currentConsentVersions()) {
      pool.query(
        'INSERT INTO user_consents (user_id, kind, version, consent_version_id, ip) VALUES (?, ?, ?, ?, ?)',
        [userId, v.kind, v.version, v.id, ip || null],
      );
    }
  } catch (e) { console.error('recordConsentAtSignup failed:', e); }
}

// Public: the current Terms/Privacy versions (for the signup screen).
router.get('/current', (req, res) => {
  try { res.json({ versions: currentConsentVersions() }); }
  catch (err) { console.error('Consent current error:', err); res.status(500).json({ error: 'Server error' }); }
});

// The signed-in user's consent history.
router.get('/me', authenticateToken, (req, res) => {
  try {
    const consents = pool.query(
      'SELECT kind, version, consented_at, ip FROM user_consents WHERE user_id = ? ORDER BY consented_at DESC',
      [req.user.id],
    ).rows;
    res.json({ consents });
  } catch (err) { console.error('Consent me error:', err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
