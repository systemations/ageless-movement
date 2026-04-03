import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Get all clients for this coach
router.get('/clients', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const clients = pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
        (SELECT date FROM checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as last_checkin,
        (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak,
        (SELECT COUNT(*) FROM workout_logs WHERE user_id = u.id AND completed = 1) as workouts_completed
      FROM users u
      WHERE u.role = 'client'
      ORDER BY u.name
    `);
    res.json({ clients: clients.rows });
  } catch (err) {
    console.error('Clients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get check-ins for all clients
router.get('/checkins', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const clients = pool.query(`
      SELECT u.id, u.name, u.avatar_url,
        (SELECT date FROM checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as last_checkin
      FROM users u
      WHERE u.role = 'client'
      ORDER BY last_checkin DESC
    `);
    res.json({ clients: clients.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get check-in timeline for a specific client
router.get('/checkins/:clientId', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const client = pool.query('SELECT id, name, email, avatar_url FROM users WHERE id = ?', [req.params.clientId]);
    if (client.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const checkins = pool.query('SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC', [req.params.clientId]);

    // Get client notes (from goals as proxy)
    const goals = pool.query('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC', [req.params.clientId]);

    // Get streak
    const streak = pool.query('SELECT * FROM streaks WHERE user_id = ?', [req.params.clientId]);

    // Get profile
    const profile = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [req.params.clientId]);

    res.json({
      client: client.rows[0],
      checkins: checkins.rows,
      goals: goals.rows,
      streak: streak.rows[0] || { current_streak: 0, best_streak: 0 },
      profile: profile.rows[0] || {},
    });
  } catch (err) {
    console.error('Client checkins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit a check-in (client side)
router.post('/checkins', authenticateToken, async (req, res) => {
  try {
    const { weight, body_fat, recovery_score, sleep_hours, stress_level, waist, answers } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const checkin = pool.query(
      `INSERT INTO checkins (user_id, coach_id, date, weight, body_fat, recovery_score, sleep_hours, stress_level, waist, answers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.user.id, 2, today, weight, body_fat, recovery_score, sleep_hours, stress_level, waist, JSON.stringify(answers || {})]
    );

    // Log activity
    pool.query('INSERT INTO activity_log (user_id, action_type, description) VALUES (?, ?, ?)',
      [req.user.id, 'checkin_submitted', `Submitted a check-in (${weight ? weight + 'kg' : 'no weight'})`]);

    res.json({ success: true, id: checkin.rows[0].id });
  } catch (err) {
    console.error('Submit checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get activity feed (coach)
router.get('/activity', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const activities = pool.query(`
      SELECT al.*, u.name as user_name, u.avatar_url
      FROM activity_log al
      JOIN users u ON al.user_id = u.id
      WHERE u.role = 'client'
      ORDER BY al.created_at DESC
      LIMIT 50
    `);
    res.json({ activities: activities.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add client (coach invites)
router.post('/clients/invite', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Email and name required' });

    const existing = pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    // Create client with temporary password
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('welcome123', 10);
    const user = pool.query(
      "INSERT INTO users (email, password_hash, name, role, coach_id) VALUES (?, ?, ?, 'client', ?) RETURNING id, email, name, role",
      [email, hash, name, req.user.id]
    );
    pool.query('INSERT INTO client_profiles (user_id) VALUES (?)', [user.rows[0].id]);
    pool.query('INSERT INTO streaks (user_id, current_streak, best_streak) VALUES (?, 0, 0)', [user.rows[0].id]);

    res.json({ client: user.rows[0] });
  } catch (err) {
    console.error('Invite client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
