import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// In-app beta feedback. Stored in the DB (no external form) so the coach can
// read submissions in the admin. Table is created idempotently here so this
// ships without a separate migration.
pool.query(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    category TEXT,
    message TEXT NOT NULL,
    context TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const CATEGORIES = new Set(['bug', 'idea', 'praise', 'other', 'testimonial']);

// Submit feedback (any logged-in user).
router.post('/', authenticateToken, (req, res) => {
  try {
    const { category, message, context } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please enter a message.' });
    }
    const cat = CATEGORIES.has(category) ? category : 'other';
    const ua = (req.headers['user-agent'] || '').slice(0, 300);
    pool.query(
      'INSERT INTO feedback (user_id, category, message, context, user_agent) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, cat, message.trim().slice(0, 4000), (context || '').slice(0, 200) || null, ua],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Coach: list all feedback for review.
router.get('/', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const rows = pool.query(`
      SELECT f.id, f.category, f.message, f.context, f.user_agent, f.status, f.created_at,
             u.name AS user_name, u.email AS user_email
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
    `).rows;
    res.json({ feedback: rows });
  } catch (err) {
    console.error('Feedback list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
