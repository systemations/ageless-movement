import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { enforceTier } from '../middleware/tier.js';

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
  const { title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url, tier_id, visible, featured } = req.body;
  pool.query(
    'UPDATE programs SET title=?, description=?, duration_weeks=?, workouts_per_week=?, min_duration=?, max_duration=?, image_url=?, tier_id=COALESCE(?, tier_id), visible=COALESCE(?, visible), featured=COALESCE(?, featured) WHERE id=?',
    [title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url,
     tier_id ?? null, visible ?? null, featured ?? null, req.params.id]
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
  try {
    const { program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, status } = req.body;
    const result = pool.query(
      'INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title',
      [program_id || null, phase_id || null, week_number || 1, day_number || 1, title, description, duration_mins, intensity || 'Medium', body_parts, equipment, workout_type || 'strength', image_url || null, video_url || null, status || 'draft']
    );
    res.json({ workout: result.rows[0] });
  } catch (err) {
    console.error('POST /workouts error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/workouts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, week_number, day_number, program_id, status } = req.body;
    pool.query(
      'UPDATE workouts SET title=?, description=?, duration_mins=?, intensity=?, body_parts=?, equipment=?, workout_type=?, image_url=?, video_url=?, week_number=?, day_number=?, program_id=?, status=? WHERE id=?',
      [title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url || null, week_number, day_number, program_id || null, status || 'draft', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /workouts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/workouts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM workouts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Quick slot move — used by the Program Builder drag-and-drop grid to reassign
// a workout to a new (week, day) without sending the full workout body.
// Accepts optional program_id so you can also move a workout between programs.
router.patch('/workouts/:id/slot', authenticateToken, requireRole('coach'), (req, res) => {
  const { week_number, day_number, program_id } = req.body;
  if (typeof program_id !== 'undefined') {
    pool.query(
      'UPDATE workouts SET week_number=?, day_number=?, program_id=? WHERE id=?',
      [week_number, day_number, program_id, req.params.id]
    );
  } else {
    pool.query(
      'UPDATE workouts SET week_number=?, day_number=? WHERE id=?',
      [week_number, day_number, req.params.id]
    );
  }
  res.json({ success: true });
});

// Clone an existing workout (metadata + all its workout_exercises + meta rows)
// into a target program at a specific (week, day). Used by the "add existing
// workout" search picker so coaches can reuse library workouts across programs
// without mutating the originals.
router.post('/programs/:programId/workouts/clone', authenticateToken, requireRole('coach'), (req, res) => {
  const sourceId = req.body.source_workout_id;
  const targetProgramId = parseInt(req.params.programId, 10);
  const { week_number, day_number } = req.body;

  const src = pool.query('SELECT * FROM workouts WHERE id = ?', [sourceId]).rows[0];
  if (!src) return res.status(404).json({ error: 'Source workout not found' });

  const inserted = pool.query(
    `INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description,
       duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [targetProgramId, src.phase_id, week_number || 1, day_number || 1, src.title, src.description,
     src.duration_mins, src.intensity, src.body_parts, src.equipment, src.workout_type, src.image_url, src.video_url]
  );
  const newId = inserted.rows[0].id;

  // Copy workout_exercises + meta so the cloned workout is fully standalone
  const exRows = pool.query('SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY order_index', [sourceId]).rows;
  for (const we of exRows) {
    const newWe = pool.query(
      `INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps,
         duration_secs, rest_secs, group_type, group_label, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [newId, we.exercise_id, we.order_index, we.sets, we.reps, we.duration_secs, we.rest_secs, we.group_type, we.group_label, we.notes]
    );
    const newWeId = newWe.rows[0].id;
    const meta = pool.query('SELECT * FROM workout_exercise_meta WHERE workout_exercise_id = ?', [we.id]).rows[0];
    if (meta) {
      pool.query(
        `INSERT INTO workout_exercise_meta (workout_exercise_id, tempo, rir, rpe, per_side,
           modality, training_type, time_based, duration_secs, tracking_type, setwise_variation, secondary_tracking, alternates_disabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newWeId, meta.tempo, meta.rir, meta.rpe, meta.per_side, meta.modality, meta.training_type,
         meta.time_based, meta.duration_secs, meta.tracking_type, meta.setwise_variation, meta.secondary_tracking, meta.alternates_disabled || 0]
      );
    }
  }
  res.json({ workout_id: newId });
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
  const { exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label, notes, tempo, rir, rpe, per_side, modality, training_type, time_based, tracking_type, setwise_variation, secondary_tracking } = req.body;
  const result = pool.query(
    'INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [req.params.id, exercise_id, order_index || 0, sets || 3, reps || '10', duration_secs, rest_secs || 30, group_type, group_label, notes || null]
  );
  const weId = result.rows[0].id;
  // Always save meta row for new tracking fields
  const perSideVal = typeof per_side === 'string' ? per_side : (per_side ? 'per_side' : 'none');
  pool.query(
    'INSERT OR REPLACE INTO workout_exercise_meta (workout_exercise_id, tempo, rir, rpe, per_side, modality, training_type, time_based, duration_secs, tracking_type, setwise_variation, secondary_tracking) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [weId, tempo || null, rir || null, rpe || null, perSideVal, modality || null, training_type || null, time_based ? 1 : 0, duration_secs || null, tracking_type || 'reps', setwise_variation || 'fixed', secondary_tracking ? 1 : 0]
  );
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

// ===== PER-WORKOUT-EXERCISE ALTERNATES (manage which alts show in this slot) =====
// GET — returns the resolved list with override state, plus alternates_disabled.
// If overrides exist, returns them (enabled flags + sort order).
// Otherwise, returns the global pool with enabled=1 in default order.
router.get('/workout-exercises/:id/alternates', authenticateToken, requireRole('coach'), (req, res) => {
  const weId = req.params.id;
  const we = pool.query('SELECT id, exercise_id FROM workout_exercises WHERE id = ?', [weId]);
  if (we.rows.length === 0) return res.status(404).json({ error: 'Workout exercise not found' });
  const exerciseId = we.rows[0].exercise_id;

  const meta = pool.query('SELECT alternates_disabled FROM workout_exercise_meta WHERE workout_exercise_id = ?', [weId]);
  const alternates_disabled = !!meta.rows[0]?.alternates_disabled;

  const overrides = pool.query(`
    SELECT wea.alternative_id AS id, e.name, e.thumbnail_url, e.body_part,
           wea.enabled, wea.sort_order,
           wea.sets, wea.reps, wea.duration_secs, wea.rest_secs,
           wea.tracking_type, wea.notes, wea.interval_structure
    FROM workout_exercise_alternates wea
    JOIN exercises e ON wea.alternative_id = e.id
    WHERE wea.workout_exercise_id = ?
    ORDER BY wea.sort_order, e.name
  `, [weId]);

  let alternates;
  if (overrides.rows.length > 0) {
    alternates = overrides.rows.map(r => ({
      ...r,
      enabled: !!r.enabled,
      interval_structure: r.interval_structure ? (() => {
        try { return JSON.parse(r.interval_structure); } catch { return null; }
      })() : null,
    }));
  } else {
    // Bidirectional global pool
    const globals = pool.query(`
      SELECT e.id, e.name, e.thumbnail_url, e.body_part FROM exercise_alternatives ea
      JOIN exercises e ON ea.alternative_id = e.id WHERE ea.exercise_id = ?
      UNION
      SELECT e.id, e.name, e.thumbnail_url, e.body_part FROM exercise_alternatives ea
      JOIN exercises e ON ea.exercise_id = e.id WHERE ea.alternative_id = ?
    `, [exerciseId, exerciseId]);
    alternates = globals.rows.map((r, i) => ({ ...r, enabled: true, sort_order: i }));
  }

  // Primary exercise (pinned at top of the modal)
  const primary = pool.query('SELECT id, name, thumbnail_url, body_part FROM exercises WHERE id = ?', [exerciseId]);

  res.json({
    primary: primary.rows[0],
    alternates_disabled,
    alternates,
  });
});

// PATCH — saves the per-instance overrides and the master disable flag.
// Body: { alternates_disabled, alternates: [{ id, enabled, sort_order }, ...] }
router.patch('/workout-exercises/:id/alternates', authenticateToken, requireRole('coach'), (req, res) => {
  const weId = req.params.id;
  const { alternates_disabled, alternates } = req.body;

  const we = pool.query('SELECT id FROM workout_exercises WHERE id = ?', [weId]);
  if (we.rows.length === 0) return res.status(404).json({ error: 'Workout exercise not found' });

  // Upsert master disable flag into workout_exercise_meta
  const existingMeta = pool.query('SELECT id FROM workout_exercise_meta WHERE workout_exercise_id = ?', [weId]);
  if (existingMeta.rows.length > 0) {
    pool.query('UPDATE workout_exercise_meta SET alternates_disabled = ? WHERE workout_exercise_id = ?',
      [alternates_disabled ? 1 : 0, weId]);
  } else {
    pool.query('INSERT INTO workout_exercise_meta (workout_exercise_id, alternates_disabled) VALUES (?, ?)',
      [weId, alternates_disabled ? 1 : 0]);
  }

  // Replace the per-instance alternates list. Each alt can carry its own
  // metric overrides (sets/reps/duration/tracking_type/interval_structure).
  // Blank fields fall back to the primary exercise's values at render time.
  pool.query('DELETE FROM workout_exercise_alternates WHERE workout_exercise_id = ?', [weId]);
  if (Array.isArray(alternates)) {
    alternates.forEach((a, i) => {
      const intervalJson = a.interval_structure
        ? (typeof a.interval_structure === 'string' ? a.interval_structure : JSON.stringify(a.interval_structure))
        : null;
      pool.query(
        `INSERT INTO workout_exercise_alternates
          (workout_exercise_id, alternative_id, enabled, sort_order,
           sets, reps, duration_secs, rest_secs, tracking_type, notes, interval_structure)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          weId, a.id, a.enabled ? 1 : 0, typeof a.sort_order === 'number' ? a.sort_order : i,
          Number.isFinite(a.sets) ? a.sets : null,
          a.reps || null,
          Number.isFinite(a.duration_secs) ? a.duration_secs : null,
          Number.isFinite(a.rest_secs) ? a.rest_secs : null,
          a.tracking_type || null,
          a.notes || null,
          intervalJson,
        ]
      );
    });
  }
  res.json({ success: true });
});

// Save interval_structure (phase list) on a specific workout_exercise row.
// Body: { interval_structure: [{label, duration_secs, intensity, zone, notes}, ...] | null }
// Passing null clears it — the workout player falls back to simple sets/duration.
router.patch('/workout-exercises/:id/interval', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { interval_structure } = req.body || {};
    const we = pool.query('SELECT id FROM workout_exercises WHERE id = ?', [req.params.id]);
    if (we.rows.length === 0) return res.status(404).json({ error: 'Workout exercise not found' });

    let json = null;
    if (interval_structure) {
      if (!Array.isArray(interval_structure)) {
        return res.status(400).json({ error: 'interval_structure must be an array of phase objects' });
      }
      json = JSON.stringify(interval_structure);
    }
    pool.query('UPDATE workout_exercises SET interval_structure = ? WHERE id = ?', [json, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH interval_structure error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== EXERCISES WITHOUT VIDEO =====
router.get('/exercises/no-video', authenticateToken, requireRole('coach'), (req, res) => {
  const exercises = pool.query("SELECT id, name, body_part, equipment FROM exercises WHERE demo_video_url IS NULL OR demo_video_url = '' ORDER BY name");
  res.json({ exercises: exercises.rows, count: exercises.rows.length });
});

// ===== TIERS =====
router.get('/tiers', authenticateToken, (req, res) => {
  const tiers = pool.query('SELECT * FROM tiers ORDER BY level');
  res.json({ tiers: tiers.rows });
});

router.post('/tiers', authenticateToken, requireRole('coach'), (req, res) => {
  const { name, level, description, price_label, features, cta_type, cta_url, cta_label } = req.body;
  const result = pool.query(
    'INSERT INTO tiers (name, level, description, price_label, features, cta_type, cta_url, cta_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [name, level || 0, description || null, price_label || null,
     features || null, cta_type || 'message_coach', cta_url || null, cta_label || null]
  );
  res.json({ tier: result.rows[0] });
});

router.put('/tiers/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { name, level, description, price_label, features, cta_type, cta_url, cta_label } = req.body;
  pool.query(
    'UPDATE tiers SET name=?, level=?, description=?, price_label=?, features=?, cta_type=?, cta_url=?, cta_label=? WHERE id=?',
    [name, level, description, price_label,
     features || null, cta_type || 'message_coach', cta_url || null, cta_label || null,
     req.params.id]
  );
  res.json({ success: true });
});

router.delete('/tiers/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM tiers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ===== EXPLORE SECTIONS =====
router.get('/explore-sections', authenticateToken, (req, res) => {
  const sections = pool.query(`
    SELECT es.*, t.name as tier_name, t.level as tier_level
    FROM explore_sections es
    LEFT JOIN tiers t ON es.min_tier_id = t.id
    ORDER BY es.parent_tab, es.sort_order
  `);

  // For each section, get its items
  const result = sections.rows.map(s => {
    const items = pool.query(`
      SELECT esi.*,
        CASE
          WHEN esi.item_type = 'program' THEN (SELECT title FROM programs WHERE id = esi.item_id)
          WHEN esi.item_type = 'workout' THEN (SELECT title FROM workouts WHERE id = esi.item_id)
          WHEN esi.item_type = 'course' THEN (SELECT title FROM courses WHERE id = esi.item_id)
          WHEN esi.item_type = 'recipe' THEN (SELECT title FROM recipes WHERE id = esi.item_id)
          WHEN esi.item_type = 'meal_plan' THEN (SELECT title FROM meal_plans WHERE id = esi.item_id)
        END as item_title,
        CASE
          WHEN esi.item_type = 'program' THEN (SELECT image_url FROM programs WHERE id = esi.item_id)
          WHEN esi.item_type = 'workout' THEN (SELECT image_url FROM workouts WHERE id = esi.item_id)
          WHEN esi.item_type = 'course' THEN (SELECT image_url FROM courses WHERE id = esi.item_id)
          WHEN esi.item_type = 'recipe' THEN (SELECT thumbnail_url FROM recipes WHERE id = esi.item_id)
          WHEN esi.item_type = 'meal_plan' THEN (SELECT thumbnail_url FROM meal_plans WHERE id = esi.item_id)
        END as item_image,
        CASE
          WHEN esi.item_type = 'program' THEN (SELECT duration_weeks FROM programs WHERE id = esi.item_id)
          ELSE NULL
        END as duration_weeks
      FROM explore_section_items esi
      WHERE esi.section_id = ?
      ORDER BY esi.sort_order
    `, [s.id]);
    return { ...s, items: items.rows };
  });

  res.json({ sections: result });
});

router.post('/explore-sections', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, section_type, layout, tile_size, sort_order, visible, min_tier_id, parent_tab, content_type } = req.body;
  const result = pool.query(
    'INSERT INTO explore_sections (title, description, section_type, layout, tile_size, sort_order, visible, min_tier_id, parent_tab, content_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [title, description || null, section_type || 'carousel', layout || 'square', tile_size || 'medium',
     sort_order || 0, visible !== undefined ? visible : 1, min_tier_id || 1, parent_tab || 'fitness',
     content_type || null]
  );
  res.json({ section: result.rows[0] });
});

router.put('/explore-sections/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, section_type, layout, tile_size, sort_order, visible, min_tier_id, parent_tab, content_type } = req.body;
  pool.query(
    'UPDATE explore_sections SET title=?, description=?, section_type=?, layout=?, tile_size=?, sort_order=?, visible=?, min_tier_id=?, parent_tab=?, content_type=? WHERE id=?',
    [title, description, section_type, layout, tile_size, sort_order, visible, min_tier_id, parent_tab, content_type || null, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/explore-sections/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM explore_section_items WHERE section_id = ?', [req.params.id]);
  pool.query('DELETE FROM explore_sections WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Add item to section
router.post('/explore-sections/:id/items', authenticateToken, requireRole('coach'), (req, res) => {
  const { item_type, item_id, sort_order } = req.body;
  const result = pool.query(
    'INSERT INTO explore_section_items (section_id, item_type, item_id, sort_order) VALUES (?, ?, ?, ?) RETURNING *',
    [req.params.id, item_type, item_id, sort_order || 0]
  );
  res.json({ item: result.rows[0] });
});

// Reorder items in section
router.put('/explore-sections/:id/items/reorder', authenticateToken, requireRole('coach'), (req, res) => {
  const { items } = req.body; // [{id, sort_order}]
  if (items) {
    items.forEach(({ id, sort_order }) => {
      pool.query('UPDATE explore_section_items SET sort_order = ? WHERE id = ?', [sort_order, id]);
    });
  }
  res.json({ success: true });
});

// Remove item from section
router.delete('/explore-section-items/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM explore_section_items WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ===== COURSES =====
router.get('/courses', authenticateToken, (req, res) => {
  const courses = pool.query(`
    SELECT c.*, t.name as tier_name
    FROM courses c
    LEFT JOIN tiers t ON c.tier_id = t.id
    ORDER BY c.sort_order, c.title
  `);
  res.json({ courses: courses.rows });
});

router.post('/courses', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, subtitle, description, image_url, difficulty, duration, modules, lessons, tier_id, visible, featured } = req.body;
  const result = pool.query(
    'INSERT INTO courses (title, subtitle, description, image_url, difficulty, duration, modules, lessons, tier_id, visible, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [title, subtitle, description, image_url, difficulty || 'All Levels', duration, modules || 0, lessons || 0, tier_id || 1, visible !== undefined ? visible : 1, featured || 0]
  );
  res.json({ course: result.rows[0] });
});

router.put('/courses/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, subtitle, description, image_url, difficulty, duration, modules, lessons, tier_id, visible, featured } = req.body;
  pool.query(
    'UPDATE courses SET title=?, subtitle=?, description=?, image_url=?, difficulty=?, duration=?, modules=?, lessons=?, tier_id=?, visible=?, featured=? WHERE id=?',
    [title, subtitle, description, image_url, difficulty, duration, modules, lessons, tier_id, visible, featured, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/courses/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Get single course with modules + lessons + per-lesson completion state
// for the requesting user. Each lesson includes `completed: boolean`, and
// each module gets `completed` (all lessons done) + `completed_count`.
router.get('/courses/:id', authenticateToken, (req, res) => {
  const course = pool.query('SELECT c.*, t.name as tier_name, t.level as tier_level FROM courses c LEFT JOIN tiers t ON c.tier_id = t.id WHERE c.id = ?', [req.params.id]);
  if (course.rows.length === 0) return res.status(404).json({ error: 'Course not found' });

  const guard = enforceTier(req.user.id, course.rows[0].tier_level);
  if (!guard.ok) {
    return res.status(403).json({ error: 'Tier required', required_tier: guard.required_tier });
  }

  // Fetch completions in one query so we don't loop N+1
  const completions = pool.query(
    `SELECT lesson_id FROM user_lesson_completions WHERE user_id = ?`,
    [req.user.id],
  ).rows;
  const completedSet = new Set(completions.map((c) => c.lesson_id));

  const modules = pool.query('SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order', [req.params.id]);
  let totalLessons = 0;
  let totalCompleted = 0;
  const moduleList = modules.rows.map(mod => {
    const lessons = pool.query('SELECT * FROM course_lessons WHERE module_id = ? ORDER BY sort_order', [mod.id]);
    let modCompleted = 0;
    const lessonList = lessons.rows.map(lesson => {
      const resources = pool.query('SELECT * FROM lesson_resources WHERE lesson_id = ? ORDER BY sort_order', [lesson.id]);
      const completed = completedSet.has(lesson.id);
      if (completed) modCompleted++;
      return { ...lesson, resources: resources.rows, completed };
    });
    totalLessons += lessonList.length;
    totalCompleted += modCompleted;
    return {
      ...mod,
      lessonList,
      completed_count: modCompleted,
      completed: lessonList.length > 0 && modCompleted === lessonList.length,
    };
  });

  res.json({
    course: {
      ...course.rows[0],
      moduleList,
      progress: {
        total_lessons: totalLessons,
        completed_lessons: totalCompleted,
        pct: totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0,
      },
    },
  });
});

// Mark a lesson complete / uncomplete for the current user.
router.post('/lessons/:id/complete', authenticateToken, (req, res) => {
  try {
    // UNIQUE(user_id, lesson_id) makes this idempotent
    pool.query(
      'INSERT OR IGNORE INTO user_lesson_completions (user_id, lesson_id) VALUES (?, ?)',
      [req.user.id, req.params.id],
    );
    res.json({ ok: true, completed: true });
  } catch (err) {
    console.error('Lesson complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/lessons/:id/uncomplete', authenticateToken, (req, res) => {
  try {
    pool.query(
      'DELETE FROM user_lesson_completions WHERE user_id = ? AND lesson_id = ?',
      [req.user.id, req.params.id],
    );
    res.json({ ok: true, completed: false });
  } catch (err) {
    console.error('Lesson uncomplete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Coach view: per-client progress for a course.
router.get('/courses/:id/participants', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const totalLessons = pool.query(
      `SELECT COUNT(*) as n FROM course_lessons cl
       JOIN course_modules cm ON cl.module_id = cm.id
       WHERE cm.course_id = ?`,
      [req.params.id],
    ).rows[0]?.n || 0;

    // Find every user who has any completion on this course.
    const rows = pool.query(`
      SELECT u.id as user_id, u.name, u.email,
        COALESCE(cp.profile_image_url, u.avatar_url) as photo_url,
        COUNT(ulc.id) as completed_count,
        MAX(ulc.completed_at) as last_completed_at
      FROM user_lesson_completions ulc
      JOIN course_lessons cl ON cl.id = ulc.lesson_id
      JOIN course_modules cm ON cm.id = cl.module_id
      JOIN users u ON u.id = ulc.user_id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE cm.course_id = ? AND u.role = 'client'
      GROUP BY u.id
      ORDER BY completed_count DESC, last_completed_at DESC
    `, [req.params.id]).rows;

    const participants = rows.map((r) => ({
      ...r,
      total_lessons: totalLessons,
      pct_complete: totalLessons > 0 ? Math.round((r.completed_count / totalLessons) * 100) : 0,
      finished: totalLessons > 0 && r.completed_count >= totalLessons,
    }));

    res.json({ participants, total_lessons: totalLessons });
  } catch (err) {
    console.error('Course participants error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper to update course counts
function updateCourseCounts(courseId) {
  const modCount = pool.query('SELECT COUNT(*) as c FROM course_modules WHERE course_id = ?', [courseId]);
  const lessonCount = pool.query(
    'SELECT COUNT(*) as c FROM course_lessons cl JOIN course_modules cm ON cl.module_id = cm.id WHERE cm.course_id = ?',
    [courseId]
  );
  pool.query('UPDATE courses SET modules = ?, lessons = ? WHERE id = ?', [modCount.rows[0].c, lessonCount.rows[0].c, courseId]);
}

// Helper to update module lesson count
function updateModuleLessonCount(moduleId) {
  const count = pool.query('SELECT COUNT(*) as c FROM course_lessons WHERE module_id = ?', [moduleId]);
  pool.query('UPDATE course_modules SET lessons = ? WHERE id = ?', [count.rows[0].c, moduleId]);
}

// ===== COURSE MODULES =====
router.post('/courses/:id/modules', authenticateToken, requireRole('coach'), (req, res) => {
  const { title } = req.body;
  const maxOrder = pool.query('SELECT MAX(sort_order) as m FROM course_modules WHERE course_id = ?', [req.params.id]);
  const sortOrder = (maxOrder.rows[0].m || 0) + 1;
  const result = pool.query(
    'INSERT INTO course_modules (course_id, title, sort_order) VALUES (?, ?, ?) RETURNING *',
    [req.params.id, title || 'New Module', sortOrder]
  );
  updateCourseCounts(req.params.id);
  res.json({ module: result.rows[0] });
});

router.put('/course-modules/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, status, duration } = req.body;
  const mod = pool.query('SELECT * FROM course_modules WHERE id = ?', [req.params.id]);
  if (mod.rows.length === 0) return res.status(404).json({ error: 'Module not found' });
  pool.query(
    'UPDATE course_modules SET title = ?, status = ?, duration = ? WHERE id = ?',
    [title ?? mod.rows[0].title, status ?? mod.rows[0].status, duration ?? mod.rows[0].duration, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/course-modules/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const mod = pool.query('SELECT course_id FROM course_modules WHERE id = ?', [req.params.id]);
  if (mod.rows.length === 0) return res.status(404).json({ error: 'Module not found' });
  const courseId = mod.rows[0].course_id;
  pool.query('DELETE FROM course_modules WHERE id = ?', [req.params.id]);
  updateCourseCounts(courseId);
  res.json({ success: true });
});

router.put('/courses/:id/modules/reorder', authenticateToken, requireRole('coach'), (req, res) => {
  const { order } = req.body; // array of module ids in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  order.forEach((moduleId, i) => {
    pool.query('UPDATE course_modules SET sort_order = ? WHERE id = ? AND course_id = ?', [i, moduleId, req.params.id]);
  });
  res.json({ success: true });
});

// ===== COURSE LESSONS =====
router.post('/course-modules/:id/lessons', authenticateToken, requireRole('coach'), (req, res) => {
  const { title } = req.body;
  const mod = pool.query('SELECT course_id FROM course_modules WHERE id = ?', [req.params.id]);
  if (mod.rows.length === 0) return res.status(404).json({ error: 'Module not found' });

  const maxOrder = pool.query('SELECT MAX(sort_order) as m FROM course_lessons WHERE module_id = ?', [req.params.id]);
  const sortOrder = (maxOrder.rows[0].m || 0) + 1;
  const result = pool.query(
    'INSERT INTO course_lessons (module_id, title, sort_order) VALUES (?, ?, ?) RETURNING *',
    [req.params.id, title || 'New Lesson', sortOrder]
  );
  updateModuleLessonCount(req.params.id);
  updateCourseCounts(mod.rows[0].course_id);
  res.json({ lesson: result.rows[0] });
});

router.put('/course-lessons/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, video_url, video_thumbnail, thumbnail_url, duration, status } = req.body;
  const lesson = pool.query('SELECT * FROM course_lessons WHERE id = ?', [req.params.id]);
  if (lesson.rows.length === 0) return res.status(404).json({ error: 'Lesson not found' });
  const l = lesson.rows[0];
  pool.query(
    'UPDATE course_lessons SET title=?, description=?, video_url=?, video_thumbnail=?, thumbnail_url=?, duration=?, status=? WHERE id=?',
    [title ?? l.title, description ?? l.description, video_url ?? l.video_url, video_thumbnail ?? l.video_thumbnail, thumbnail_url ?? l.thumbnail_url, duration ?? l.duration, status ?? l.status, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/course-lessons/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const lesson = pool.query('SELECT cl.module_id, cm.course_id FROM course_lessons cl JOIN course_modules cm ON cl.module_id = cm.id WHERE cl.id = ?', [req.params.id]);
  if (lesson.rows.length === 0) return res.status(404).json({ error: 'Lesson not found' });
  const { module_id, course_id } = lesson.rows[0];
  pool.query('DELETE FROM course_lessons WHERE id = ?', [req.params.id]);
  updateModuleLessonCount(module_id);
  updateCourseCounts(course_id);
  res.json({ success: true });
});

router.put('/course-modules/:id/lessons/reorder', authenticateToken, requireRole('coach'), (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  order.forEach((lessonId, i) => {
    pool.query('UPDATE course_lessons SET sort_order = ? WHERE id = ? AND module_id = ?', [i, lessonId, req.params.id]);
  });
  res.json({ success: true });
});

// ===== LESSON RESOURCES =====
router.get('/course-lessons/:id/resources', authenticateToken, (req, res) => {
  const resources = pool.query('SELECT * FROM lesson_resources WHERE lesson_id = ? ORDER BY sort_order', [req.params.id]);
  res.json({ resources: resources.rows });
});

router.post('/course-lessons/:id/resources', authenticateToken, requireRole('coach'), (req, res) => {
  const { filename, original_name, url, file_type, file_size } = req.body;
  if (!url || !original_name) return res.status(400).json({ error: 'url and original_name required' });
  const maxOrder = pool.query('SELECT MAX(sort_order) as m FROM lesson_resources WHERE lesson_id = ?', [req.params.id]);
  const sortOrder = (maxOrder.rows[0].m || 0) + 1;
  const result = pool.query(
    'INSERT INTO lesson_resources (lesson_id, filename, original_name, url, file_type, file_size, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [req.params.id, filename || original_name, original_name, url, file_type || null, file_size || 0, sortOrder]
  );
  res.json({ resource: result.rows[0] });
});

router.delete('/lesson-resources/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM lesson_resources WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ===== CLIENT TIER ASSIGNMENT =====
router.put('/clients/:id/tier', authenticateToken, requireRole('coach'), (req, res) => {
  const { tier_id } = req.body;
  pool.query('UPDATE client_profiles SET tier_id = ? WHERE user_id = ?', [tier_id, req.params.id]);
  res.json({ success: true });
});

export default router;
