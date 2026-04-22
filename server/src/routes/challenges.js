import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// ===== CLIENT-FACING =====

// GET /api/challenges
// List all challenges with the requesting user's enrollment status
router.get('/', authenticateToken, (req, res) => {
  try {
    const challenges = pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM challenge_workouts WHERE challenge_id = c.id) AS level_count,
        uc.current_level, uc.completed_levels, uc.started_at AS enrolled_at, uc.completed_at
      FROM challenges c
      LEFT JOIN user_challenges uc ON uc.challenge_id = c.id AND uc.user_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.id]);
    res.json({ challenges: challenges.rows });
  } catch (err) {
    console.error('List challenges error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/challenges/:id
// Full challenge detail including all levels (workouts) and user progress
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const challenge = pool.query('SELECT * FROM challenges WHERE id = ?', [req.params.id]);
    if (!challenge.rows.length) return res.status(404).json({ error: 'Challenge not found' });

    const levels = pool.query(`
      SELECT cw.id AS cw_id, cw.sort_order, cw.level_label,
        w.id AS workout_id, w.title, w.description, w.duration_mins,
        w.image_url, w.video_url, w.workout_type, w.body_parts, w.intensity
      FROM challenge_workouts cw
      JOIN workouts w ON cw.workout_id = w.id
      WHERE cw.challenge_id = ?
      ORDER BY cw.sort_order
    `, [req.params.id]);

    const enrollment = pool.query(
      'SELECT * FROM user_challenges WHERE challenge_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    const userChallenge = enrollment.rows[0];
    let completedLevels = [];
    if (userChallenge?.completed_levels) {
      try { completedLevels = JSON.parse(userChallenge.completed_levels); } catch (e) {}
    }

    res.json({
      challenge: challenge.rows[0],
      levels: levels.rows,
      enrollment: userChallenge ? { ...userChallenge, completed_levels: completedLevels } : null,
    });
  } catch (err) {
    console.error('Challenge detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/challenges/:id/enroll
router.post('/:id/enroll', authenticateToken, (req, res) => {
  try {
    const existing = pool.query(
      'SELECT id FROM user_challenges WHERE user_id = ? AND challenge_id = ?',
      [req.user.id, req.params.id]
    );
    if (existing.rows.length) {
      return res.json({ success: true, message: 'Already enrolled', id: existing.rows[0].id });
    }
    const r = pool.query(
      `INSERT INTO user_challenges (user_id, challenge_id, current_level, completed_levels, started_at)
       VALUES (?, ?, 0, '[]', ?) RETURNING id`,
      [req.user.id, req.params.id, new Date().toISOString()]
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) {
    console.error('Enroll challenge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/challenges/:id/levels/:levelIdx/complete
// Mark a specific level as complete; advances current_level if it was the current one
router.post('/:id/levels/:levelIdx/complete', authenticateToken, (req, res) => {
  try {
    const levelIdx = parseInt(req.params.levelIdx);
    const enrollment = pool.query(
      'SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ?',
      [req.user.id, req.params.id]
    );
    if (!enrollment.rows.length) return res.status(404).json({ error: 'Not enrolled' });

    const uc = enrollment.rows[0];
    let completed = [];
    try { completed = JSON.parse(uc.completed_levels || '[]'); } catch (e) {}
    if (!completed.includes(levelIdx)) completed.push(levelIdx);

    // Advance current_level to next uncompleted level
    const levelCount = pool.query(
      'SELECT COUNT(*) as c FROM challenge_workouts WHERE challenge_id = ?',
      [req.params.id]
    ).rows[0].c;

    let newCurrent = uc.current_level;
    while (newCurrent < levelCount && completed.includes(newCurrent)) {
      newCurrent++;
    }

    const isFullyComplete = completed.length >= levelCount;
    pool.query(
      `UPDATE user_challenges SET current_level = ?, completed_levels = ?, completed_at = ? WHERE id = ?`,
      [newCurrent, JSON.stringify(completed), isFullyComplete ? new Date().toISOString() : null, uc.id]
    );

    res.json({ success: true, current_level: newCurrent, completed_levels: completed, is_complete: isFullyComplete });
  } catch (err) {
    console.error('Complete level error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== COACH ADMIN =====

// GET /api/challenges/admin/all
// Coach view: all challenges with enrollment counts
router.get('/admin/all', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const challenges = pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM challenge_workouts WHERE challenge_id = c.id) AS level_count,
        (SELECT COUNT(*) FROM user_challenges WHERE challenge_id = c.id) AS enrollment_count,
        (SELECT COUNT(*) FROM user_challenges WHERE challenge_id = c.id AND completed_at IS NOT NULL) AS completed_count
      FROM challenges c
      ORDER BY c.created_at DESC
    `);
    res.json({ challenges: challenges.rows });
  } catch (err) {
    console.error('Admin list challenges error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/challenges/admin/:id/participants
// Coach view: every client enrolled in a challenge + their progress level.
// Returns user id/name/photo, current_level, completed_levels (parsed), total levels,
// percentage complete, enrolled_at, completed_at, so coach can spot stalled clients.
router.get('/admin/:id/participants', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const totalLevels = pool.query(
      'SELECT COUNT(*) as n FROM challenge_workouts WHERE challenge_id = ?',
      [req.params.id],
    ).rows[0]?.n || 0;

    const rows = pool.query(`
      SELECT
        uc.id AS enrollment_id,
        uc.user_id,
        uc.current_level,
        uc.completed_levels,
        uc.started_at,
        uc.completed_at,
        u.name,
        u.email,
        COALESCE(cp.profile_image_url, u.avatar_url) AS photo_url
      FROM user_challenges uc
      JOIN users u ON u.id = uc.user_id
      LEFT JOIN client_profiles cp ON cp.user_id = uc.user_id
      WHERE uc.challenge_id = ?
      ORDER BY uc.completed_at IS NULL DESC, uc.started_at DESC
    `, [req.params.id]).rows;

    const participants = rows.map((r) => {
      let completedLevels = [];
      if (r.completed_levels) {
        try { completedLevels = JSON.parse(r.completed_levels); } catch {}
      }
      const pct = totalLevels > 0 ? Math.round((completedLevels.length / totalLevels) * 100) : 0;
      return {
        enrollment_id: r.enrollment_id,
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        photo_url: r.photo_url,
        current_level: r.current_level || 0,
        completed_count: completedLevels.length,
        total_levels: totalLevels,
        pct_complete: pct,
        started_at: r.started_at,
        completed_at: r.completed_at,
      };
    });

    res.json({ participants });
  } catch (err) {
    console.error('Challenge participants error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/challenges/admin
router.post('/admin', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, image_url, category } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const r = pool.query(
      'INSERT INTO challenges (title, description, image_url, category, coach_id) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [title, description || '', image_url || null, category || '', req.user.id]
    );
    res.json({ id: r.rows[0].id, success: true });
  } catch (err) {
    console.error('Create challenge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/challenges/admin/:id
router.put('/admin/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, image_url, category } = req.body;
    pool.query(
      'UPDATE challenges SET title = ?, description = ?, image_url = ?, category = ? WHERE id = ?',
      [title, description, image_url, category, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Update challenge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/challenges/admin/:id
router.delete('/admin/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM challenges WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete challenge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/challenges/admin/:id/workouts
// Replace the full workout sequence for a challenge.
// Body: { workouts: [{ workout_id, level_label }, ...] } (order is the array order)
router.put('/admin/:id/workouts', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { workouts } = req.body;
    if (!Array.isArray(workouts)) return res.status(400).json({ error: 'workouts array required' });

    pool.query('DELETE FROM challenge_workouts WHERE challenge_id = ?', [req.params.id]);
    const insert = 'INSERT INTO challenge_workouts (challenge_id, workout_id, sort_order, level_label) VALUES (?, ?, ?, ?)';
    workouts.forEach((w, i) => {
      pool.query(insert, [req.params.id, w.workout_id, i, w.level_label || `Level ${i + 1}`]);
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Update challenge workouts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
