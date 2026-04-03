import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// ===== PROGRAMS =====
router.get('/programs', authenticateToken, requireRole('coach'), (req, res) => {
  const programs = pool.query('SELECT * FROM programs ORDER BY created_at DESC');
  res.json({ programs: programs.rows });
});

router.post('/programs', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url } = req.body;
  const result = pool.query(
    'INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title',
    [req.user.id, title, description, duration_weeks || 8, workouts_per_week || 5, min_duration || '', max_duration || '', image_url || null]
  );
  res.json({ program: result.rows[0] });
});

router.put('/programs/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url } = req.body;
  pool.query(
    'UPDATE programs SET title=?, description=?, duration_weeks=?, workouts_per_week=?, min_duration=?, max_duration=?, image_url=? WHERE id=?',
    [title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/programs/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM programs WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ===== WORKOUTS =====
router.get('/workouts', authenticateToken, requireRole('coach'), (req, res) => {
  const programId = req.query.program_id;
  const workouts = programId
    ? pool.query('SELECT * FROM workouts WHERE program_id = ? ORDER BY week_number, day_number', [programId])
    : pool.query('SELECT w.*, p.title as program_title FROM workouts w LEFT JOIN programs p ON w.program_id = p.id ORDER BY w.created_at DESC');
  res.json({ workouts: workouts.rows });
});

router.post('/workouts', authenticateToken, requireRole('coach'), (req, res) => {
  const { program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url } = req.body;
  const result = pool.query(
    'INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title',
    [program_id, phase_id, week_number || 1, day_number || 1, title, description, duration_mins, intensity || 'Medium', body_parts, equipment, workout_type || 'strength', image_url || null]
  );
  res.json({ workout: result.rows[0] });
});

router.put('/workouts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, week_number, day_number } = req.body;
  pool.query(
    'UPDATE workouts SET title=?, description=?, duration_mins=?, intensity=?, body_parts=?, equipment=?, workout_type=?, image_url=?, week_number=?, day_number=? WHERE id=?',
    [title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, week_number, day_number, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/workouts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM workouts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ===== EXERCISES =====
router.get('/exercises', authenticateToken, requireRole('coach'), (req, res) => {
  const exercises = pool.query('SELECT * FROM exercises ORDER BY name');
  res.json({ exercises: exercises.rows });
});

router.post('/exercises', authenticateToken, requireRole('coach'), (req, res) => {
  const { name, description, demo_video_url, thumbnail_url, body_part, equipment } = req.body;
  const result = pool.query(
    'INSERT INTO exercises (name, description, demo_video_url, thumbnail_url, body_part, equipment) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name',
    [name, description, demo_video_url || null, thumbnail_url || null, body_part, equipment]
  );
  res.json({ exercise: result.rows[0] });
});

router.put('/exercises/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { name, description, demo_video_url, thumbnail_url, body_part, equipment } = req.body;
  pool.query(
    'UPDATE exercises SET name=?, description=?, demo_video_url=?, thumbnail_url=?, body_part=?, equipment=? WHERE id=?',
    [name, description, demo_video_url, thumbnail_url, body_part, equipment, req.params.id]
  );
  res.json({ success: true });
});

// ===== WORKOUT EXERCISES (link exercises to workouts) =====
router.post('/workouts/:id/exercises', authenticateToken, requireRole('coach'), (req, res) => {
  const { exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label } = req.body;
  const result = pool.query(
    'INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [req.params.id, exercise_id, order_index || 0, sets || 3, reps || '10', duration_secs, rest_secs || 30, group_type, group_label]
  );
  res.json({ id: result.rows[0].id });
});

router.delete('/workout-exercises/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM workout_exercises WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
