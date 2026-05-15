import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, requireCoachOwnsClient } from '../middleware/auth.js';
import { enforceTier } from '../middleware/tier.js';
import { fetchVimeoThumbnail } from '../lib/vimeoOembed.js';

const router = Router();

// ===== PROGRAMS =====
router.get('/programs', authenticateToken, requireRole('coach'), (req, res) => {
  const programs = pool.query('SELECT * FROM programs ORDER BY created_at DESC');
  res.json({ programs: programs.rows });
});

router.post('/programs', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url, intro_video_url } = req.body;
  const result = pool.query(
    'INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url, intro_video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title',
    [req.user.id, title, description, duration_weeks || 8, workouts_per_week || 5, min_duration || '', max_duration || '', image_url || null, intro_video_url || null]
  );
  res.json({ program: result.rows[0] });
});

router.put('/programs/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url, tier_id, visible, featured, intro_video_url } = req.body;
  // intro_video_url is optional; null/undefined leave the existing value
  // alone via COALESCE so partial PUTs from old clients don't wipe it.
  pool.query(
    'UPDATE programs SET title=?, description=?, duration_weeks=?, workouts_per_week=?, min_duration=?, max_duration=?, image_url=?, tier_id=COALESCE(?, tier_id), visible=COALESCE(?, visible), featured=COALESCE(?, featured), intro_video_url=COALESCE(?, intro_video_url) WHERE id=?',
    [title, description, duration_weeks, workouts_per_week, min_duration, max_duration, image_url,
     tier_id ?? null, visible ?? null, featured ?? null, intro_video_url ?? null, req.params.id]
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
    const { program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, status, is_free_preview } = req.body;
    const result = pool.query(
      'INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, status, is_free_preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title',
      [program_id || null, phase_id || null, week_number || 1, day_number || 1, title, description, duration_mins, intensity || 'Medium', body_parts, equipment, workout_type || 'strength', image_url || null, video_url || null, status || 'draft', is_free_preview ? 1 : 0]
    );
    res.json({ workout: result.rows[0] });
  } catch (err) {
    console.error('POST /workouts error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/workouts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, week_number, day_number, program_id, status, is_free_preview } = req.body;
    pool.query(
      'UPDATE workouts SET title=?, description=?, duration_mins=?, intensity=?, body_parts=?, equipment=?, workout_type=?, image_url=?, video_url=?, week_number=?, day_number=?, program_id=?, status=?, is_free_preview=COALESCE(?, is_free_preview) WHERE id=?',
      [title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url || null, week_number, day_number, program_id || null, status || 'draft', typeof is_free_preview === 'undefined' ? null : (is_free_preview ? 1 : 0), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /workouts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk toggle is_free_preview on every workout in a program. Used by the
// Program Builder "Mark all as free preview" / "Unmark all" buttons when
// Dan wants an entire lead-magnet program accessible to Free-tier clients.
router.post('/programs/:id/free-preview', authenticateToken, requireRole('coach'), (req, res) => {
  const value = req.body.value ? 1 : 0;
  pool.query(
    'UPDATE workouts SET is_free_preview = ? WHERE program_id = ?',
    [value, req.params.id]
  );
  const count = pool.query(
    'SELECT COUNT(*) as c FROM workouts WHERE program_id = ? AND is_free_preview = 1',
    [req.params.id]
  ).rows[0]?.c || 0;
  res.json({ success: true, free_preview_count: count, value });
});

router.delete('/workouts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM workouts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Quick slot move - used by the Program Builder drag-and-drop grid to reassign
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
  // Only insert one direction - the GET query handles bidirectional
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
// GET - returns the resolved list with override state, plus alternates_disabled.
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

// PATCH - saves the per-instance overrides and the master disable flag.
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
// Passing null clears it - the workout player falls back to simple sets/duration.
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

// Public read of the tier list - used by the pre-register PackageSelection
// step. Same payload as the auth'd endpoint, but callable before signup.
router.get('/tiers/public', (req, res) => {
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

  // Modules can nest one level deep (STEP 2 → Feet/Spine/Hips/Shoulders).
  // Build a map of all modules for this course, attach lessons, then
  // collect sub-modules under each parent. The response only lists
  // top-level modules at the root; sub-modules live under
  // parent.subModuleList. Progress totals roll up from the deepest
  // lessons regardless of nesting depth.
  const allModules = pool.query(
    'SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order',
    [req.params.id],
  ).rows;

  // Build the quiz prerequisite chain by inverting pass_next_quiz_lesson_id.
  // Quiz lesson A points at B as the next quiz on pass; that means B's
  // prerequisite is A. Walking every quiz lesson in this course once
  // gives us a { [lesson_id]: prereq_lesson_id } map plus the prereq's
  // title for friendly client copy. Then we fetch the user's passing
  // attempts in one query so the per-lesson lock check is a Set lookup.
  const moduleIds = allModules.map(m => m.id);
  const allLessonsRaw = moduleIds.length
    ? pool.query(
        `SELECT id, title, module_id, quiz_data FROM course_lessons
         WHERE module_id IN (${moduleIds.map(() => '?').join(',')})`,
        moduleIds,
      ).rows
    : [];
  const quizPrereqOf = {};       // { lesson_id: { lesson_id, title } }
  const quizLessonIds = [];
  for (const l of allLessonsRaw) {
    if (!l.quiz_data) continue;
    quizLessonIds.push(l.id);
    let q;
    try { q = JSON.parse(l.quiz_data); } catch { continue; }
    if (q?.pass_next_quiz_lesson_id) {
      quizPrereqOf[q.pass_next_quiz_lesson_id] = { id: l.id, title: l.title };
    }
  }
  const passedQuizLessonIds = quizLessonIds.length
    ? new Set(
        pool.query(
          `SELECT DISTINCT lesson_id FROM quiz_attempts
           WHERE user_id = ? AND passed = 1
             AND lesson_id IN (${quizLessonIds.map(() => '?').join(',')})`,
          [req.user.id, ...quizLessonIds],
        ).rows.map(r => r.lesson_id),
      )
    : new Set();

  // Lessons where this user has at least one saved assessment response.
  // Used by the client to gate the Next button on movement-assessment
  // lessons until the user has logged a pick.
  const respondedAssessmentLessonIds = new Set(
    pool.query(
      'SELECT DISTINCT lesson_id FROM assessment_responses WHERE user_id = ?',
      [req.user.id],
    ).rows.map(r => r.lesson_id),
  );

  let totalLessons = 0;
  let totalCompleted = 0;

  const buildModule = (mod) => {
    const lessons = pool.query('SELECT * FROM course_lessons WHERE module_id = ? ORDER BY sort_order', [mod.id]);
    let modCompleted = 0;
    const lessonList = lessons.rows.map(lesson => {
      const resources = pool.query('SELECT * FROM lesson_resources WHERE lesson_id = ? ORDER BY sort_order', [lesson.id]);
      const completed = completedSet.has(lesson.id);
      if (completed) modCompleted++;
      // Parse quiz_data into a structured object so the client doesn't
      // need to JSON.parse it. Bad JSON falls through to null and the
      // lesson renders as a plain (non-quiz) lesson.
      let quiz = null;
      if (lesson.quiz_data) {
        try { quiz = JSON.parse(lesson.quiz_data); }
        catch (e) { /* malformed - treat as no quiz */ }
      }
      // Movement assessment lessons: any lesson living under STEP 2's
      // Mobility Assessment sub-tree (parent_module_id = 22) with no
      // video and at least one image in its description gets tap-to-
      // pick interaction. Toe Balance/Dexterity have videos so are
      // excluded; Thoracic / Pike / etc are the targets.
      const inAssessmentTree = mod.parent_module_id === 22;
      const hasImg = !!lesson.description && /<img\b/i.test(lesson.description);
      const isMovementAssessment = inAssessmentTree && hasImg && !lesson.video_url;
      // Quiz prerequisite lock. Quiz B's prereq is whichever quiz A
      // points at B via pass_next_quiz_lesson_id. Locked = there is a
      // prereq AND the user has not passed it yet. The first quiz in a
      // chain has no prereq and is always accessible.
      const prereq = quiz ? quizPrereqOf[lesson.id] : null;
      const quizLocked = !!prereq && !passedQuizLessonIds.has(prereq.id);
      return {
        ...lesson, resources: resources.rows, completed, quiz,
        is_movement_assessment: isMovementAssessment,
        has_assessment_response: isMovementAssessment && respondedAssessmentLessonIds.has(lesson.id),
        quiz_prerequisite: prereq || null,
        quiz_locked: quizLocked,
      };
    });

    // Recurse into sub-modules so progress counts include their lessons.
    const subModuleList = allModules
      .filter(m => m.parent_module_id === mod.id)
      .map(buildModule);
    let subLessonCount = 0;
    let subCompletedCount = 0;
    for (const sm of subModuleList) {
      subLessonCount += sm.total_lessons;
      subCompletedCount += sm.completed_count;
    }

    const ownTotal = lessonList.length;
    const lessonTotal = ownTotal + subLessonCount;
    const lessonCompleted = modCompleted + subCompletedCount;
    totalLessons += ownTotal;
    totalCompleted += modCompleted;

    return {
      ...mod,
      lessonList,
      subModuleList,
      // Rolled-up: includes own lessons + everything in sub-modules.
      // Renderers should prefer total_lessons / completed_count over
      // lessonList.length so nested counts read correctly.
      total_lessons: lessonTotal,
      completed_count: lessonCompleted,
      completed: lessonTotal > 0 && lessonCompleted === lessonTotal,
    };
  };

  const cleanModuleList = allModules
    .filter(m => !m.parent_module_id)
    .map(buildModule);

  res.json({
    course: {
      ...course.rows[0],
      moduleList: cleanModuleList,
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

// ─────────────────────────────────────────────────────────────────────
// Quiz attempts (append-only)
// ─────────────────────────────────────────────────────────────────────
// Saves a single quiz submission. The renderer computes score + pass/
// fail client-side, but we trust-but-verify by recomputing here from
// the canonical quiz_data so a tampered request can't claim a pass.
router.post('/lessons/:id/quiz-attempt', authenticateToken, (req, res) => {
  try {
    const lesson = pool.query('SELECT id, quiz_data FROM course_lessons WHERE id = ?', [req.params.id]).rows[0];
    if (!lesson || !lesson.quiz_data) return res.status(404).json({ error: 'Quiz not found' });

    let quiz;
    try { quiz = JSON.parse(lesson.quiz_data); } catch { return res.status(500).json({ error: 'Bad quiz data' }); }

    // Prerequisite gate. The quiz chain is encoded by each quiz's
    // pass_next_quiz_lesson_id. Find any quiz lesson that points at
    // this one as the next step; that's the prerequisite. If found
    // and the user has no passing attempt for it, reject so a tampered
    // client can't skip ahead by POSTing directly.
    const prereq = pool.query(
      `SELECT id, title FROM course_lessons
       WHERE quiz_data IS NOT NULL
         AND json_extract(quiz_data, '$.pass_next_quiz_lesson_id') = ?
       LIMIT 1`,
      [lesson.id],
    ).rows[0];
    if (prereq) {
      const passed = pool.query(
        'SELECT 1 FROM quiz_attempts WHERE user_id = ? AND lesson_id = ? AND passed = 1 LIMIT 1',
        [req.user.id, prereq.id],
      ).rows[0];
      if (!passed) {
        return res.status(403).json({
          error: 'Prerequisite quiz not passed',
          prerequisite: { id: prereq.id, title: prereq.title },
        });
      }
    }

    const selections = req.body?.selections || {};
    if (typeof selections !== 'object' || Array.isArray(selections)) {
      return res.status(400).json({ error: 'selections must be an object' });
    }

    // Server-side scoring - same rules as the renderer (sum of option
    // scores / question count → percentage; any C is auto-fail).
    let scoreSum = 0;
    let hasC = false;
    for (const q of quiz.questions || []) {
      const sel = selections[q.id];
      if (sel === 'C') hasC = true;
      const opt = (q.options || []).find(o => o.label === sel);
      scoreSum += opt?.score || 0;
    }
    const total = (quiz.questions || []).length || 1;
    const scorePct = Math.round((scoreSum / total) * 100);
    const passed = !hasC && scorePct >= (quiz.pass_pct || 66);

    pool.query(
      'INSERT INTO quiz_attempts (user_id, lesson_id, score_pct, passed, selections) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, req.params.id, scorePct, passed ? 1 : 0, JSON.stringify(selections)],
    );
    res.json({ ok: true, score_pct: scorePct, passed });
  } catch (err) {
    console.error('Quiz attempt save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// History - own quiz attempts for a lesson (most recent first).
router.get('/lessons/:id/quiz-attempts', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      `SELECT id, score_pct, passed, selections, created_at
         FROM quiz_attempts
        WHERE user_id = ? AND lesson_id = ?
        ORDER BY created_at DESC`,
      [req.user.id, req.params.id],
    ).rows;
    res.json({ attempts: rows.map(r => ({ ...r, passed: !!r.passed, selections: JSON.parse(r.selections || '{}') })) });
  } catch (err) {
    console.error('Quiz history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Assessment responses (tap-to-pick, append-only)
// ─────────────────────────────────────────────────────────────────────
router.post('/lessons/:id/assessment-response', authenticateToken, (req, res) => {
  try {
    const { selected_photo_index, selected_photo_url, notes } = req.body || {};
    if (!Number.isInteger(selected_photo_index) || selected_photo_index < 1) {
      return res.status(400).json({ error: 'selected_photo_index must be a positive integer' });
    }
    pool.query(
      'INSERT INTO assessment_responses (user_id, lesson_id, selected_photo_index, selected_photo_url, notes) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, req.params.id, selected_photo_index, selected_photo_url || null, notes || null],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Assessment save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/lessons/:id/assessment-responses', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      `SELECT id, selected_photo_index, selected_photo_url, notes, created_at
         FROM assessment_responses
        WHERE user_id = ? AND lesson_id = ?
        ORDER BY created_at DESC`,
      [req.user.id, req.params.id],
    ).rows;
    res.json({ responses: rows });
  } catch (err) {
    console.error('Assessment history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-user roll-up of every movement-assessment lesson, grouped by
// region (Spine / Hips / Shoulders) so the Progress tab can render a
// "Movement Assessments" card without 13 round-trips. Only includes
// lessons that match the same is_movement_assessment definition the
// course endpoint uses (parent_module_id = 22, has img, no video) so
// the surfaces stay in sync.
router.get('/assessment-summary', authenticateToken, (req, res) => {
  try {
    const lessons = pool.query(
      `SELECT l.id, l.title, l.description, l.video_url,
              l.module_id, m.title AS module_title, m.sort_order AS module_sort,
              m.course_id, l.sort_order AS lesson_sort
         FROM course_lessons l
         JOIN course_modules m ON m.id = l.module_id
        WHERE m.parent_module_id = 22
        ORDER BY m.sort_order, l.sort_order`,
    ).rows;

    const eligible = lessons.filter(l => {
      const hasImg = !!l.description && /<img\b/i.test(l.description);
      return hasImg && !l.video_url;
    });
    const eligibleIds = eligible.map(l => l.id);
    if (eligibleIds.length === 0) {
      return res.json({ regions: [], total_logged: 0, total_lessons: 0, latest_overall_at: null, course_id: null });
    }
    // All eligible lessons live under one course (AMS Getting Started
    // today). Include the id in the response so the Progress card can
    // deep-link instead of dumping the user on /explore.
    const courseId = eligible[0].course_id;

    // Latest assessment response per (user, lesson) - one query, then
    // map back into the lesson list. Plus a count of attempts so the
    // card can show "3 attempts on file" if useful.
    const responses = pool.query(
      `SELECT lesson_id,
              MAX(created_at) AS latest_at,
              COUNT(*) AS attempts
         FROM assessment_responses
        WHERE user_id = ? AND lesson_id IN (${eligibleIds.map(() => '?').join(',')})
        GROUP BY lesson_id`,
      [req.user.id, ...eligibleIds],
    ).rows;
    const latestByLesson = new Map(responses.map(r => [r.lesson_id, r]));

    // Pull the actual photo index for each lesson's latest row.
    const latestPicks = pool.query(
      `SELECT lesson_id, selected_photo_index
         FROM assessment_responses ar
        WHERE user_id = ?
          AND lesson_id IN (${eligibleIds.map(() => '?').join(',')})
          AND created_at = (
            SELECT MAX(created_at) FROM assessment_responses
             WHERE user_id = ar.user_id AND lesson_id = ar.lesson_id
          )`,
      [req.user.id, ...eligibleIds],
    ).rows;
    const pickByLesson = new Map(latestPicks.map(r => [r.lesson_id, r.selected_photo_index]));

    const regions = new Map();
    let totalLogged = 0;
    let latestOverall = null;
    for (const l of eligible) {
      if (!regions.has(l.module_id)) {
        regions.set(l.module_id, {
          module_id: l.module_id,
          module_title: l.module_title,
          lessons: [],
          counts: { A: 0, B: 0, C: 0, D: 0 },
          logged: 0,
          total: 0,
        });
      }
      const r = regions.get(l.module_id);
      r.total += 1;
      const resp = latestByLesson.get(l.id);
      const idx = pickByLesson.get(l.id) || null;
      const letter = idx ? String.fromCharCode(64 + idx) : null;
      if (resp) {
        r.logged += 1;
        totalLogged += 1;
        if (letter && r.counts[letter] != null) r.counts[letter] += 1;
        if (!latestOverall || resp.latest_at > latestOverall) latestOverall = resp.latest_at;
      }
      r.lessons.push({
        lesson_id: l.id,
        lesson_title: l.title,
        latest_pick: letter,
        latest_at: resp?.latest_at || null,
        attempts: resp?.attempts || 0,
      });
    }

    res.json({
      regions: Array.from(regions.values()),
      total_logged: totalLogged,
      total_lessons: eligible.length,
      latest_overall_at: latestOverall,
      course_id: courseId,
    });
  } catch (err) {
    console.error('Assessment summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Coach view: every quiz attempt + assessment response for a client.
// Used by ClientProfile → Assessments tab.
router.get('/clients/:userId/assessment-history', authenticateToken, requireRole('coach'), requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const quizzes = pool.query(
      `SELECT qa.id, qa.lesson_id, qa.score_pct, qa.passed, qa.created_at, cl.title AS lesson_title
         FROM quiz_attempts qa
         JOIN course_lessons cl ON cl.id = qa.lesson_id
        WHERE qa.user_id = ?
        ORDER BY qa.created_at DESC`,
      [userId],
    ).rows;
    const assessments = pool.query(
      `SELECT ar.id, ar.lesson_id, ar.selected_photo_index, ar.selected_photo_url,
              ar.notes, ar.created_at, cl.title AS lesson_title
         FROM assessment_responses ar
         JOIN course_lessons cl ON cl.id = ar.lesson_id
        WHERE ar.user_id = ?
        ORDER BY ar.created_at DESC`,
      [userId],
    ).rows;
    res.json({
      quiz_attempts: quizzes.map(q => ({ ...q, passed: !!q.passed })),
      assessment_responses: assessments,
    });
  } catch (err) {
    console.error('Coach assessment history error:', err);
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

router.put('/course-lessons/:id', authenticateToken, requireRole('coach'), async (req, res) => {
  const { title, description, video_url, video_thumbnail, thumbnail_url, duration, status, quiz_data } = req.body;
  const lesson = pool.query('SELECT * FROM course_lessons WHERE id = ?', [req.params.id]);
  if (lesson.rows.length === 0) return res.status(404).json({ error: 'Lesson not found' });
  const l = lesson.rows[0];

  // Auto-fetch Vimeo thumbnail when the coach pastes a new video URL
  // and didn't already provide a manual thumbnail. Done synchronously
  // BEFORE the save so the response includes the populated thumbnail
  // and the client doesn't have to refetch. Failures fall through
  // silently - coach can still save the lesson without it.
  let resolvedThumbnail = video_thumbnail ?? l.video_thumbnail;
  const newVideoUrl = video_url ?? l.video_url;
  const videoChanged = video_url && video_url !== l.video_url;
  const needsThumb = !resolvedThumbnail || videoChanged;
  if (needsThumb && newVideoUrl) {
    try {
      const fetched = await fetchVimeoThumbnail(newVideoUrl);
      if (fetched) resolvedThumbnail = fetched;
    } catch (e) { /* ignore - save still proceeds without thumb */ }
  }

  // quiz_data is stored as serialised JSON. Accept either an object (we
  // stringify here) or a JSON string. null/undefined leave the existing
  // value untouched; an empty string clears the quiz.
  let quizSerialised = l.quiz_data;
  if (quiz_data !== undefined) {
    if (quiz_data === null || quiz_data === '') {
      quizSerialised = null;
    } else if (typeof quiz_data === 'string') {
      try { JSON.parse(quiz_data); quizSerialised = quiz_data; }
      catch { return res.status(400).json({ error: 'quiz_data is not valid JSON' }); }
    } else if (typeof quiz_data === 'object') {
      quizSerialised = JSON.stringify(quiz_data);
    }
  }

  pool.query(
    'UPDATE course_lessons SET title=?, description=?, video_url=?, video_thumbnail=?, thumbnail_url=?, duration=?, status=?, quiz_data=? WHERE id=?',
    [title ?? l.title, description ?? l.description, newVideoUrl, resolvedThumbnail, thumbnail_url ?? l.thumbnail_url, duration ?? l.duration, status ?? l.status, quizSerialised, req.params.id]
  );
  res.json({ success: true, video_thumbnail: resolvedThumbnail });
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
router.put('/clients/:id/tier', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  const { tier_id } = req.body;
  pool.query('UPDATE client_profiles SET tier_id = ? WHERE user_id = ?', [tier_id, req.params.id]);
  res.json({ success: true });
});

export default router;
