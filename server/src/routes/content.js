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
  const { name, display_name, description, demo_video_url, thumbnail_url, body_part, equipment, exercise_type, tracking_fields, per_side, target_area } = req.body;
  const result = pool.query(
    'INSERT INTO exercises (name, display_name, description, demo_video_url, thumbnail_url, body_part, equipment, exercise_type, tracking_fields, per_side, target_area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, name',
    [name, display_name || name, description, demo_video_url || null, thumbnail_url || null, body_part, equipment, exercise_type || 'Strength', tracking_fields || 'Repetitions with Weight', per_side || 'None', target_area]
  );
  res.json({ exercise: result.rows[0] });
});

router.put('/exercises/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { name, display_name, description, demo_video_url, thumbnail_url, body_part, equipment, exercise_type, tracking_fields, per_side, target_area } = req.body;
  pool.query(
    'UPDATE exercises SET name=?, display_name=?, description=?, demo_video_url=?, thumbnail_url=?, body_part=?, equipment=?, exercise_type=?, tracking_fields=?, per_side=?, target_area=? WHERE id=?',
    [name, display_name, description, demo_video_url, thumbnail_url, body_part, equipment, exercise_type, tracking_fields, per_side, target_area, req.params.id]
  );
  res.json({ success: true });
});

// ===== WORKOUT EXERCISES (link exercises to workouts) =====
router.post('/workouts/:id/exercises', authenticateToken, requireRole('coach'), (req, res) => {
  const { exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label, tempo, rir, rpe, per_side, modality, training_type, time_based } = req.body;
  const result = pool.query(
    'INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [req.params.id, exercise_id, order_index || 0, sets || 3, reps || '10', duration_secs, rest_secs || 30, group_type, group_label]
  );
  // Save meta if provided
  const weId = result.rows[0].id;
  if (tempo || rir || rpe || per_side || modality || training_type || time_based) {
    pool.query(
      'INSERT OR REPLACE INTO workout_exercise_meta (workout_exercise_id, tempo, rir, rpe, per_side, modality, training_type, time_based, duration_secs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [weId, tempo || null, rir || null, rpe || null, per_side ? 1 : 0, modality || null, training_type || null, time_based ? 1 : 0, duration_secs || null]
    );
  }
  res.json({ id: weId });
});

router.delete('/workout-exercises/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM workout_exercise_meta WHERE workout_exercise_id = ?', [req.params.id]);
  pool.query('DELETE FROM workout_exercises WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ===== EXERCISE ALTERNATIVES (bidirectional) =====
router.get('/exercises/:id/alternatives', authenticateToken, (req, res) => {
  // Get alternatives in BOTH directions
  const alts = pool.query(`
    SELECT ea.id, ea.exercise_id, ea.alternative_id, ea.reps, e.name, e.thumbnail_url, e.body_part, e.demo_video_url
    FROM exercise_alternatives ea
    JOIN exercises e ON ea.alternative_id = e.id
    WHERE ea.exercise_id = ?
    UNION
    SELECT ea.id, ea.alternative_id as exercise_id, ea.exercise_id as alternative_id, ea.reps, e.name, e.thumbnail_url, e.body_part, e.demo_video_url
    FROM exercise_alternatives ea
    JOIN exercises e ON ea.exercise_id = e.id
    WHERE ea.alternative_id = ?
  `, [req.params.id, req.params.id]);
  res.json({ alternatives: alts.rows });
});

router.post('/exercises/:id/alternatives', authenticateToken, requireRole('coach'), (req, res) => {
  const { alternative_id, reps } = req.body;
  // Only insert one direction — the GET query handles bidirectional
  pool.query('INSERT OR IGNORE INTO exercise_alternatives (exercise_id, alternative_id, reps) VALUES (?, ?, ?)',
    [req.params.id, alternative_id, reps || null]);
  res.json({ success: true });
});

router.delete('/exercises/:id/alternatives/:altId', authenticateToken, requireRole('coach'), (req, res) => {
  // Delete in both directions
  pool.query('DELETE FROM exercise_alternatives WHERE (exercise_id = ? AND alternative_id = ?) OR (exercise_id = ? AND alternative_id = ?)',
    [req.params.id, req.params.altId, req.params.altId, req.params.id]);
  res.json({ success: true });
});

// ===== EXERCISES WITHOUT VIDEO =====
router.get('/exercises/no-video', authenticateToken, requireRole('coach'), (req, res) => {
  const exercises = pool.query("SELECT id, name, body_part, equipment FROM exercises WHERE demo_video_url IS NULL OR demo_video_url = '' ORDER BY name");
  res.json({ exercises: exercises.rows, count: exercises.rows.length });
});

export default router;
