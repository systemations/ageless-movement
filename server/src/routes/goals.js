// Goals — hybrid manual/auto progress tracking.
//
// metric_type='manual': user updates progress directly via a slider on
// the goal card. progress column is the source of truth.
//
// metric_type='workouts_per_week': progress is computed live from
// workout_logs (count of completed sessions in the last 7 days /
// target_value × 100, capped 0-100). Updating manually is blocked.
//
// Add more auto types by extending computeProgress() — same pattern.

import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, requireCoachOwnsClient } from '../middleware/auth.js';

const router = Router();

const VALID_METRIC_TYPES = new Set([
  'manual',
  'workouts_per_week',
  'streak_days',
  'course_completion',
  'workouts_total',
]);

// Compute the live progress percentage for an auto-typed goal. Returns
// null for manual goals (caller falls back to the stored progress).
const computeProgress = (goal) => {
  const target = parseFloat(goal.target_value);

  if (goal.metric_type === 'workouts_per_week') {
    if (!target || target <= 0) return 0;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const count = pool.query(
      `SELECT COUNT(*) AS n FROM workout_logs
        WHERE user_id = ? AND completed = 1 AND date >= ?`,
      [goal.user_id, since],
    ).rows[0]?.n || 0;
    return cap(count / target);
  }

  // Streak: walk back day by day from today, stop at first gap.
  // Capped at 365 days for safety.
  if (goal.metric_type === 'streak_days') {
    if (!target || target <= 0) return 0;
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now); d.setUTCDate(now.getUTCDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const has = pool.query(
        `SELECT 1 FROM workout_logs
          WHERE user_id = ? AND completed = 1 AND date = ? LIMIT 1`,
        [goal.user_id, ds],
      ).rows[0];
      if (has) streak++;
      else if (i === 0) {
        // No workout today doesn't break the streak; streak counts
        // consecutive days they trained, which can include "yesterday".
        continue;
      } else break;
    }
    return cap(streak / target);
  }

  // Workouts total — lifetime count toward a milestone (e.g. 100 workouts).
  if (goal.metric_type === 'workouts_total') {
    if (!target || target <= 0) return 0;
    const count = pool.query(
      `SELECT COUNT(*) AS n FROM workout_logs
        WHERE user_id = ? AND completed = 1`,
      [goal.user_id],
    ).rows[0]?.n || 0;
    return cap(count / target);
  }

  // Course completion — % of lessons completed in the course whose id
  // is stored as target_value. Pulls live from user_lesson_completions
  // so it stays in sync as the client ticks lessons off.
  if (goal.metric_type === 'course_completion') {
    const courseId = parseInt(target, 10);
    if (!courseId) return 0;
    const total = pool.query(
      `SELECT COUNT(*) AS n FROM course_lessons cl
         JOIN course_modules cm ON cm.id = cl.module_id
        WHERE cm.course_id = ? AND COALESCE(cl.status, 'published') != 'draft'`,
      [courseId],
    ).rows[0]?.n || 0;
    if (!total) return 0;
    const done = pool.query(
      `SELECT COUNT(*) AS n FROM user_lesson_completions ulc
         JOIN course_lessons cl ON cl.id = ulc.lesson_id
         JOIN course_modules cm ON cm.id = cl.module_id
        WHERE ulc.user_id = ? AND cm.course_id = ?`,
      [goal.user_id, courseId],
    ).rows[0]?.n || 0;
    return cap(done / total);
  }

  return null;
};

const cap = (ratio) => Math.max(0, Math.min(100, Math.round(ratio * 100)));

// Shape a row for API. Replaces stored progress with computed value
// for auto goals so the client always shows live data.
const shapeGoal = (row) => {
  const computed = computeProgress(row);
  return {
    id: row.id,
    title: row.title,
    target: row.target,
    category: row.category,
    metric_type: row.metric_type || 'manual',
    target_value: row.target_value,
    progress: computed != null ? computed : row.progress,
    achieved: !!row.achieved,
    achieved_date: row.achieved_date,
    created_at: row.created_at,
    is_auto: row.metric_type && row.metric_type !== 'manual',
  };
};

// List own goals split into active + achieved.
router.get('/', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY achieved, created_at DESC',
      [req.user.id],
    ).rows;
    const shaped = rows.map(shapeGoal);
    res.json({
      active: shaped.filter(g => !g.achieved),
      achieved: shaped.filter(g => g.achieved),
    });
  } catch (err) {
    console.error('goals list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a goal. Required: title. Optional: target (description),
// category, metric_type ('manual' default), target_value (numeric for
// auto types).
router.post('/', authenticateToken, (req, res) => {
  try {
    const { title, target, category, metric_type, target_value } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title required' });
    }
    const mt = metric_type || 'manual';
    if (!VALID_METRIC_TYPES.has(mt)) {
      return res.status(400).json({ error: 'invalid metric_type' });
    }
    if (mt !== 'manual' && !target_value) {
      return res.status(400).json({ error: 'auto-tracked goals need a target_value' });
    }
    const result = pool.query(
      `INSERT INTO goals (user_id, title, target, category, metric_type, target_value, progress)
       VALUES (?, ?, ?, ?, ?, ?, 0) RETURNING *`,
      [req.user.id, title.trim(), target || null, category || 'General', mt, target_value || null],
    );
    res.json({ goal: shapeGoal(result.rows[0]) });
  } catch (err) {
    console.error('goals create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update progress on a manual goal. Auto-typed goals reject — their
// progress is computed from real data.
router.post('/:id/progress', authenticateToken, (req, res) => {
  try {
    const pct = parseInt(req.body?.progress, 10);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'progress must be 0-100' });
    }
    const goal = pool.query(
      'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.metric_type && goal.metric_type !== 'manual') {
      return res.status(400).json({ error: 'auto-tracked goals update from real data, not manually' });
    }
    pool.query('UPDATE goals SET progress = ? WHERE id = ?', [pct, goal.id]);
    res.json({ ok: true, progress: pct });
  } catch (err) {
    console.error('goals progress error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark achieved. Stamps achieved_date. Re-marking achieved is a no-op.
router.post('/:id/achieve', authenticateToken, (req, res) => {
  try {
    const goal = pool.query(
      'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    pool.query(
      `UPDATE goals SET achieved = 1, achieved_date = datetime('now'), progress = 100 WHERE id = ?`,
      [goal.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('goals achieve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const goal = pool.query(
      'SELECT id FROM goals WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    pool.query('DELETE FROM goals WHERE id = ?', [goal.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('goals delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Coach view — read-only across all of a client's goals.
router.get('/clients/:userId', authenticateToken, requireRole('coach'), requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const rows = pool.query(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY achieved, created_at DESC',
      [req.params.userId],
    ).rows;
    const shaped = rows.map(shapeGoal);
    res.json({
      active: shaped.filter(g => !g.achieved),
      achieved: shaped.filter(g => g.achieved),
    });
  } catch (err) {
    console.error('coach goals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
