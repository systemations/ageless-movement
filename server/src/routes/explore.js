import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get all on-demand content for explore tab
router.get('/content', authenticateToken, async (req, res) => {
  try {
    // All programs
    const programs = pool.query(`
      SELECT p.*, u.name as coach_name
      FROM programs p
      LEFT JOIN users u ON p.coach_id = u.id
      ORDER BY p.created_at DESC
    `);

    // All workouts grouped by type
    const workouts = pool.query(`
      SELECT w.*, p.title as program_title
      FROM workouts w
      LEFT JOIN programs p ON w.program_id = p.id
      ORDER BY w.workout_type, w.week_number, w.day_number
    `);

    // Group workouts into carousels
    const mobilityWorkouts = workouts.rows.filter(w => w.workout_type === 'mobility');
    const strengthWorkouts = workouts.rows.filter(w => w.workout_type === 'strength');

    res.json({
      programs: programs.rows,
      carousels: [
        { title: 'Mobility - Follow Alongs', items: mobilityWorkouts },
        { title: 'Strength Workouts', items: strengthWorkouts },
      ],
    });
  } catch (err) {
    console.error('Explore content error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single program with phases and workouts
router.get('/programs/:id', authenticateToken, async (req, res) => {
  try {
    const program = pool.query('SELECT * FROM programs WHERE id = ?', [req.params.id]);
    if (program.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    const phases = pool.query('SELECT * FROM program_phases WHERE program_id = ? ORDER BY phase_number', [req.params.id]);

    const workouts = pool.query(`
      SELECT w.* FROM workouts w
      WHERE w.program_id = ?
      ORDER BY w.week_number, w.day_number
    `, [req.params.id]);

    // Check if user is enrolled
    const enrollment = pool.query('SELECT * FROM client_programs WHERE user_id = ? AND program_id = ?', [req.user.id, req.params.id]);

    res.json({
      program: program.rows[0],
      phases: phases.rows,
      workouts: workouts.rows,
      enrollment: enrollment.rows[0] || null,
    });
  } catch (err) {
    console.error('Program detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single workout with exercises
router.get('/workouts/:id', authenticateToken, async (req, res) => {
  try {
    const workout = pool.query('SELECT * FROM workouts WHERE id = ?', [req.params.id]);
    if (workout.rows.length === 0) return res.status(404).json({ error: 'Workout not found' });

    const exercises = pool.query(`
      SELECT we.*, e.name, e.description, e.demo_video_url, e.thumbnail_url, e.body_part, e.equipment
      FROM workout_exercises we
      JOIN exercises e ON we.exercise_id = e.id
      WHERE we.workout_id = ?
      ORDER BY we.order_index
    `, [req.params.id]);

    // Get alternatives for each exercise
    const exercisesWithAlts = exercises.rows.map(ex => {
      const alts = pool.query(`
        SELECT ea.*, e.name, e.thumbnail_url, e.body_part
        FROM exercise_alternatives ea
        JOIN exercises e ON ea.alternative_id = e.id
        WHERE ea.exercise_id = ?
      `, [ex.exercise_id]);
      return { ...ex, alternatives: alts.rows };
    });

    res.json({
      workout: workout.rows[0],
      exercises: exercisesWithAlts,
    });
  } catch (err) {
    console.error('Workout detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log a completed workout
router.post('/workouts/:id/log', authenticateToken, async (req, res) => {
  try {
    const { duration_mins, exercise_logs, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const log = pool.query(
      'INSERT INTO workout_logs (user_id, workout_id, date, duration_mins, completed, notes) VALUES (?, ?, ?, ?, 1, ?) RETURNING id',
      [req.user.id, req.params.id, today, duration_mins || 0, notes || '']
    );

    // Log individual exercises
    if (exercise_logs && exercise_logs.length > 0) {
      for (const el of exercise_logs) {
        pool.query(
          'INSERT INTO exercise_logs (workout_log_id, exercise_id, set_number, reps, weight, notes) VALUES (?, ?, ?, ?, ?, ?)',
          [log.rows[0].id, el.exercise_id, el.set_number, el.reps, el.weight, el.notes || '']
        );
      }
    }

    // Update streak
    const streak = pool.query('SELECT * FROM streaks WHERE user_id = ?', [req.user.id]);
    if (streak.rows.length > 0) {
      const s = streak.rows[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let newStreak = s.current_streak;
      if (s.last_activity_date === yesterdayStr || s.last_activity_date === today) {
        if (s.last_activity_date !== today) newStreak += 1;
      } else {
        newStreak = 1;
      }
      const newBest = Math.max(s.best_streak, newStreak);
      pool.query('UPDATE streaks SET current_streak = ?, best_streak = ?, last_activity_date = ? WHERE user_id = ?',
        [newStreak, newBest, today, req.user.id]);
    }

    // Update client_programs completion count
    const workout = pool.query('SELECT program_id FROM workouts WHERE id = ?', [req.params.id]);
    if (workout.rows[0]) {
      pool.query(
        'UPDATE client_programs SET completed_workouts = completed_workouts + 1 WHERE user_id = ? AND program_id = ?',
        [req.user.id, workout.rows[0].program_id]
      );
    }

    res.json({ success: true, log_id: log.rows[0].id });
  } catch (err) {
    console.error('Workout log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
