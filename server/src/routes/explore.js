import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { enforceTier } from '../middleware/tier.js';

const router = Router();

// Get all on-demand content for explore tab (dynamic sections with tier filtering)
router.get('/content', authenticateToken, async (req, res) => {
  try {
    // Get client's tier level
    const profile = pool.query('SELECT tier_id FROM client_profiles WHERE user_id = ?', [req.user.id]);
    const clientTierId = profile.rows[0]?.tier_id || 1;
    const clientTier = pool.query('SELECT level FROM tiers WHERE id = ?', [clientTierId]);
    const clientLevel = clientTier.rows[0]?.level || 0;

    // Get all visible sections where client's tier level >= section's min tier level
    const sections = pool.query(`
      SELECT es.*, t.level as min_level
      FROM explore_sections es
      LEFT JOIN tiers t ON es.min_tier_id = t.id
      WHERE es.visible = 1
      ORDER BY es.parent_tab, es.sort_order
    `);

    const result = [];
    for (const section of sections.rows) {
      const minLevel = section.min_level || 0;
      const locked = clientLevel < minLevel;

      // Get items for this section
      const items = pool.query(`
        SELECT esi.*,
          CASE
            WHEN esi.item_type = 'program' THEN (SELECT title FROM programs WHERE id = esi.item_id)
            WHEN esi.item_type = 'workout' THEN (SELECT title FROM workouts WHERE id = esi.item_id)
            WHEN esi.item_type = 'course' THEN (SELECT title FROM courses WHERE id = esi.item_id)
            WHEN esi.item_type = 'exercise' THEN (SELECT name FROM exercises WHERE id = esi.item_id)
          END as title,
          CASE
            WHEN esi.item_type = 'program' THEN (SELECT image_url FROM programs WHERE id = esi.item_id)
            WHEN esi.item_type = 'workout' THEN (SELECT image_url FROM workouts WHERE id = esi.item_id)
            WHEN esi.item_type = 'course' THEN (SELECT image_url FROM courses WHERE id = esi.item_id)
            WHEN esi.item_type = 'exercise' THEN (SELECT thumbnail_url FROM exercises WHERE id = esi.item_id)
          END as image_url,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT subtitle FROM courses WHERE id = esi.item_id)
            ELSE NULL
          END as subtitle,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT difficulty FROM courses WHERE id = esi.item_id)
            ELSE NULL
          END as difficulty,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT duration FROM courses WHERE id = esi.item_id)
            WHEN esi.item_type = 'workout' THEN CAST((SELECT duration_mins FROM workouts WHERE id = esi.item_id) AS TEXT)
            ELSE NULL
          END as duration,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT modules FROM courses WHERE id = esi.item_id)
            ELSE NULL
          END as modules,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT lessons FROM courses WHERE id = esi.item_id)
            ELSE NULL
          END as lessons,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT featured FROM courses WHERE id = esi.item_id)
            ELSE 0
          END as featured,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT t2.name FROM courses c2 LEFT JOIN tiers t2 ON c2.tier_id = t2.id WHERE c2.id = esi.item_id)
            WHEN esi.item_type = 'program' THEN (SELECT t2.name FROM programs p2 LEFT JOIN tiers t2 ON p2.tier_id = t2.id WHERE p2.id = esi.item_id)
            ELSE 'Free'
          END as tier_name,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT t2.level FROM courses c2 LEFT JOIN tiers t2 ON c2.tier_id = t2.id WHERE c2.id = esi.item_id)
            WHEN esi.item_type = 'program' THEN (SELECT t2.level FROM programs p2 LEFT JOIN tiers t2 ON p2.tier_id = t2.id WHERE p2.id = esi.item_id)
            ELSE 0
          END as tier_level,
          CASE
            WHEN esi.item_type = 'program' THEN (SELECT duration_weeks FROM programs WHERE id = esi.item_id)
            ELSE NULL
          END as duration_weeks,
          CASE
            WHEN esi.item_type = 'program' THEN (SELECT workouts_per_week FROM programs WHERE id = esi.item_id)
            ELSE NULL
          END as workouts_per_week,
          CASE
            WHEN esi.item_type = 'program' THEN (SELECT min_duration FROM programs WHERE id = esi.item_id)
            ELSE NULL
          END as min_duration,
          CASE
            WHEN esi.item_type = 'program' THEN (SELECT max_duration FROM programs WHERE id = esi.item_id)
            ELSE NULL
          END as max_duration,
          CASE
            WHEN esi.item_type = 'workout' THEN (SELECT body_parts FROM workouts WHERE id = esi.item_id)
            WHEN esi.item_type = 'exercise' THEN (SELECT body_part FROM exercises WHERE id = esi.item_id)
            ELSE NULL
          END as body_parts,
          CASE
            WHEN esi.item_type = 'exercise' THEN (SELECT equipment FROM exercises WHERE id = esi.item_id)
            ELSE NULL
          END as equipment,
          CASE
            WHEN esi.item_type = 'exercise' THEN (SELECT demo_video_url FROM exercises WHERE id = esi.item_id)
            ELSE NULL
          END as demo_video_url,
          CASE
            WHEN esi.item_type = 'workout' THEN (SELECT workout_type FROM workouts WHERE id = esi.item_id)
            ELSE NULL
          END as workout_type,
          CASE
            WHEN esi.item_type = 'course' THEN (SELECT description FROM courses WHERE id = esi.item_id)
            WHEN esi.item_type = 'program' THEN (SELECT description FROM programs WHERE id = esi.item_id)
            ELSE NULL
          END as description
        FROM explore_section_items esi
        WHERE esi.section_id = ?
        ORDER BY esi.sort_order
      `, [section.id]);

      // Post-enrich recipe + meal_plan items (not handled by the giant CASE above)
      const enrichedItems = items.rows.map(item => {
        if (item.item_type === 'recipe') {
          const r = pool.query('SELECT title, description, thumbnail_url, calories, protein, fat, carbs, category FROM recipes WHERE id = ?', [item.item_id]).rows[0];
          if (r) {
            return {
              ...item,
              title: r.title,
              description: r.description,
              image_url: r.thumbnail_url,
              calories: r.calories,
              protein: r.protein,
              fat: r.fat,
              carbs: r.carbs,
              category: r.category,
            };
          }
        }
        if (item.item_type === 'meal_plan') {
          const p = pool.query('SELECT title, description, thumbnail_url, category, target_calories FROM meal_plans WHERE id = ?', [item.item_id]).rows[0];
          if (p) {
            return {
              ...item,
              title: p.title,
              description: p.description,
              image_url: p.thumbnail_url,
              category: p.category,
              calorie_target: p.target_calories,
            };
          }
        }
        return item;
      });

      result.push({
        id: section.id,
        title: section.title,
        description: section.description,
        section_type: section.section_type,
        layout: section.layout,
        parent_tab: section.parent_tab,
        content_type: section.content_type,
        locked,
        items: enrichedItems.map(item => ({
          ...item,
          item_locked: clientLevel < (item.tier_level || 0),
        })),
      });
    }

    // Also return courses with modules for course detail views
    const allCourses = pool.query('SELECT c.*, t.name as tier_name FROM courses c LEFT JOIN tiers t ON c.tier_id = t.id WHERE c.visible = 1 ORDER BY c.sort_order');
    const coursesWithModules = allCourses.rows.map(c => {
      const mods = pool.query('SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order', [c.id]);
      const moduleList = mods.rows.map(mod => {
        const lessons = pool.query('SELECT * FROM course_lessons WHERE module_id = ? ORDER BY sort_order', [mod.id]);
        const lessonList = lessons.rows.map(lesson => {
          const resources = pool.query('SELECT * FROM lesson_resources WHERE lesson_id = ? ORDER BY sort_order', [lesson.id]);
          return { ...lesson, resources: resources.rows };
        });
        return { ...mod, lessonList };
      });
      return { ...c, moduleList };
    });

    res.json({ sections: result, courses: coursesWithModules });
  } catch (err) {
    console.error('Explore content error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single program with phases and workouts
router.get('/programs/:id', authenticateToken, async (req, res) => {
  try {
    const program = pool.query('SELECT p.*, t.level as tier_level FROM programs p LEFT JOIN tiers t ON t.id = p.tier_id WHERE p.id = ?', [req.params.id]);
    if (program.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    // Check if user is enrolled — enrolment bypasses the tier guard so
    // clients don't lose access to something already assigned to them.
    const enrollment = pool.query('SELECT * FROM client_programs WHERE user_id = ? AND program_id = ?', [req.user.id, req.params.id]);
    if (enrollment.rows.length === 0) {
      const guard = enforceTier(req.user.id, program.rows[0].tier_level);
      if (!guard.ok) {
        return res.status(403).json({ error: 'Tier required', required_tier: guard.required_tier });
      }
    }

    const phases = pool.query('SELECT * FROM program_phases WHERE program_id = ? ORDER BY phase_number', [req.params.id]);

    const workouts = pool.query(`
      SELECT w.* FROM workouts w
      WHERE w.program_id = ?
      ORDER BY w.week_number, w.day_number
    `, [req.params.id]);

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

// Enroll in a program.
// Policy: one active program at a time. If the user already has an active
// program and tries to enroll in a DIFFERENT one, respond 409 with the
// current program so the client can show a confirmation dialog. Pass
// { force: true } in the body to override and replace.
router.post('/programs/:id/enroll', authenticateToken, async (req, res) => {
  try {
    const newProgramId = parseInt(req.params.id);
    const force = !!req.body?.force;

    // Check if already enrolled in THIS program
    const existing = pool.query('SELECT * FROM client_programs WHERE user_id = ? AND program_id = ?', [req.user.id, newProgramId]);
    if (existing.rows.length > 0) {
      return res.json({ enrollment: existing.rows[0], message: 'Already enrolled' });
    }

    // Check for any OTHER active program
    const other = pool.query(`
      SELECT cp.*, p.title as program_title, p.duration_weeks
      FROM client_programs cp
      JOIN programs p ON cp.program_id = p.id
      WHERE cp.user_id = ?
      ORDER BY cp.started_at DESC LIMIT 1
    `, [req.user.id]);

    // Also consider training_blocks — on Home these drive the phase banner
    // and today's sessions, so a new enrollment must replace them too.
    const existingBlock = pool.query(`
      SELECT tb.*, p.title as program_title
      FROM training_blocks tb
      LEFT JOIN programs p ON p.id = tb.program_id
      WHERE tb.user_id = ?
      ORDER BY tb.start_date DESC LIMIT 1
    `, [req.user.id]).rows[0];

    const hasExisting = other.rows.length > 0 || !!existingBlock;

    if (hasExisting && !force) {
      return res.status(409).json({
        requires_confirmation: true,
        current_program: other.rows[0] || {
          program_id: existingBlock.program_id,
          program_title: existingBlock.program_title || existingBlock.name,
          duration_weeks: existingBlock.duration_weeks,
        },
        message: 'You already have an active program. Confirm to replace it.',
      });
    }

    // If forcing, wipe the existing program + the block's WORKOUT-side data
    // (weekly schedule, phases, scan/bloods compliance). Nutrition tables
    // (meal_day_templates, weekly_meal_plans, nutrition_frameworks, swap_options)
    // are intentionally kept attached to the block shell so the client's meal
    // plan survives a workout-program switch.
    if (force && hasExisting) {
      pool.query('DELETE FROM client_programs WHERE user_id = ?', [req.user.id]);
      const blockIds = pool.query('SELECT id FROM training_blocks WHERE user_id = ?', [req.user.id]).rows.map(r => r.id);
      for (const bid of blockIds) {
        pool.query(
          'DELETE FROM phase_calorie_targets WHERE block_phase_id IN (SELECT id FROM block_phases WHERE block_id = ?)',
          [bid]
        );
        pool.query('DELETE FROM weekly_schedule WHERE block_id = ?', [bid]);
        pool.query('DELETE FROM block_phases WHERE block_id = ?', [bid]);
        pool.query('DELETE FROM scan_schedule WHERE block_id = ?', [bid]);
        pool.query('DELETE FROM bloods_schedule WHERE block_id = ?', [bid]);
      }
      // Keep the training_blocks row itself so meal tables retain a valid
      // block_id foreign key. The block is now an empty shell representing
      // "this client has a nutrition plan but no workout schedule from me".
    }

    // Count total workouts in program
    const workoutCount = pool.query('SELECT COUNT(*) as total FROM workouts WHERE program_id = ?', [newProgramId]);
    const total = workoutCount.rows[0]?.total || 0;

    // Create enrollment
    pool.query(
      'INSERT INTO client_programs (user_id, program_id, current_week, current_day, started_at, completed_workouts, total_workouts) VALUES (?, ?, 1, 1, ?, 0, ?)',
      [req.user.id, newProgramId, new Date().toISOString(), total]
    );

    const enrollment = pool.query('SELECT * FROM client_programs WHERE user_id = ? AND program_id = ?', [req.user.id, newProgramId]);
    res.json({ enrollment: enrollment.rows[0], message: 'Enrolled successfully' });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single workout with exercises
router.get('/workouts/:id', authenticateToken, async (req, res) => {
  try {
    const workout = pool.query('SELECT w.*, t.level as tier_level FROM workouts w LEFT JOIN tiers t ON t.id = w.tier_id WHERE w.id = ?', [req.params.id]);
    if (workout.rows.length === 0) return res.status(404).json({ error: 'Workout not found' });

    // Access rules, in order:
    //   1. Workout flagged is_free_preview → always accessible (lead-magnet
    //      content for Free-tier signups).
    //   2. Client is enrolled in the workout's program → accessible.
    //   3. Otherwise → enforce tier level.
    const programId = workout.rows[0].program_id;
    const isFreePreview = !!workout.rows[0].is_free_preview;
    const enrolled = programId
      ? pool.query('SELECT 1 FROM client_programs WHERE user_id = ? AND program_id = ?', [req.user.id, programId]).rows.length > 0
      : false;
    if (!isFreePreview && !enrolled) {
      const guard = enforceTier(req.user.id, workout.rows[0].tier_level);
      if (!guard.ok) {
        return res.status(403).json({ error: 'Tier required', required_tier: guard.required_tier });
      }
    }

    const exercises = pool.query(`
      SELECT we.*, e.name, e.description, e.demo_video_url, e.thumbnail_url, e.body_part, e.equipment,
        wem.tracking_type AS meta_tracking_type, wem.setwise_variation, wem.secondary_tracking,
        wem.tempo, wem.modality, wem.per_side AS meta_per_side, wem.rir, wem.rpe,
        wem.training_type, wem.time_based, wem.duration_secs AS meta_duration_secs
      FROM workout_exercises we
      JOIN exercises e ON we.exercise_id = e.id
      LEFT JOIN workout_exercise_meta wem ON wem.workout_exercise_id = we.id
      WHERE we.workout_id = ?
      ORDER BY we.order_index
    `, [req.params.id]);

    // Parse interval_structure JSON on each row. Null → client falls back
    // to simple sets/duration/rest display + timer.
    for (const ex of exercises.rows) {
      if (ex.interval_structure) {
        try { ex.interval_structure = JSON.parse(ex.interval_structure); }
        catch { ex.interval_structure = null; }
      }
    }

    // Get alternatives for each exercise — respects per-instance overrides
    // and the alternates_disabled master switch on workout_exercise_meta
    const exercisesWithAlts = exercises.rows.map(ex => {
      // Master disable kills all alternates for this slot
      const metaDisabled = pool.query(
        'SELECT alternates_disabled FROM workout_exercise_meta WHERE workout_exercise_id = ?',
        [ex.id]
      );
      if (metaDisabled.rows[0]?.alternates_disabled) {
        return { ...ex, alternatives: [] };
      }

      // Per-instance overrides — now carry their own metric override so a
      // coach can say "if client swaps to rowing, row 5km intervals" even
      // though the primary is "run 40 min steady".
      const overrides = pool.query(`
        SELECT wea.alternative_id, e.name, e.thumbnail_url, e.body_part, wea.sort_order,
          wea.sets, wea.reps, wea.duration_secs, wea.rest_secs,
          wea.tracking_type, wea.notes, wea.interval_structure
        FROM workout_exercise_alternates wea
        JOIN exercises e ON wea.alternative_id = e.id
        WHERE wea.workout_exercise_id = ? AND wea.enabled = 1
        ORDER BY wea.sort_order, e.name
      `, [ex.id]);

      if (overrides.rows.length > 0) {
        // Parse interval_structure JSON on each alt
        for (const alt of overrides.rows) {
          if (alt.interval_structure) {
            try { alt.interval_structure = JSON.parse(alt.interval_structure); }
            catch { alt.interval_structure = null; }
          }
        }
        return { ...ex, alternatives: overrides.rows };
      }

      // Fallback: global alternatives for this exercise
      const alts = pool.query(`
        SELECT ea.alternative_id, e.name, e.thumbnail_url, e.body_part
        FROM exercise_alternatives ea
        JOIN exercises e ON ea.alternative_id = e.id
        WHERE ea.exercise_id = ?
      `, [ex.exercise_id]);
      return { ...ex, alternatives: alts.rows };
    });

    // Per-client override: if this user has a personalised version of this
    // workout, prefer it over the template. See project_edit_scope_choice.md.
    // Stored as a full snapshot of exercises (+ optional workout-level meta).
    const override = pool.query(
      'SELECT id, exercises_json, meta_json, coach_note, updated_at FROM user_workout_overrides WHERE user_id = ? AND workout_id = ?',
      [req.user.id, req.params.id],
    ).rows[0];

    if (override) {
      let exOverride = null;
      let metaOverride = null;
      try { exOverride = JSON.parse(override.exercises_json); } catch { /* fall through to template */ }
      try { metaOverride = override.meta_json ? JSON.parse(override.meta_json) : null; } catch { /* noop */ }
      if (Array.isArray(exOverride)) {
        return res.json({
          workout: { ...workout.rows[0], ...(metaOverride || {}) },
          exercises: exOverride,
          personalised: {
            is_override: true,
            coach_note: override.coach_note,
            updated_at: override.updated_at,
          },
        });
      }
    }

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
    const {
      duration_mins, distance, distance_unit, exercise_logs, notes, date: logDate,
      // Optional metadata the client player sends when the athlete customized
      // (e.g. shortened) their session vs what the coach prescribed.
      prescribed_duration_mins, customized,
    } = req.body;
    const today = new Date().toISOString().split('T')[0];
    // Allow backdating -- use provided date if valid, otherwise today
    const effectiveDate = logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate) ? logDate : today;

    // Use NULL for ad-hoc workouts (id=0) to avoid FK constraint
    const workoutId = req.params.id === '0' ? null : parseInt(req.params.id);

    const distUnit = ['km', 'mi', 'm'].includes(distance_unit) ? distance_unit : 'km';
    const log = pool.query(
      `INSERT INTO workout_logs
        (user_id, workout_id, date, duration_mins, distance, distance_unit, completed, notes,
         prescribed_duration_mins, customized)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?) RETURNING id`,
      [
        req.user.id, workoutId, effectiveDate, duration_mins || 0,
        distance ? parseFloat(distance) : null, distUnit, notes || '',
        Number.isFinite(prescribed_duration_mins) ? prescribed_duration_mins : null,
        customized ? 1 : 0,
      ]
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

// ===== EXERCISE PROGRESS =====

// GET /api/explore/progress/exercises
// Returns exercises the user has logged, ordered by most recent, with summary stats.
router.get('/progress/exercises', authenticateToken, (req, res) => {
  try {
    const exercises = pool.query(`
      SELECT
        el.exercise_id,
        e.name,
        e.thumbnail_url,
        e.body_part,
        COUNT(DISTINCT wl.id) AS session_count,
        COUNT(el.id) AS total_sets,
        MAX(el.weight) AS max_weight,
        MAX(wl.date) AS last_logged
      FROM exercise_logs el
      JOIN workout_logs wl ON el.workout_log_id = wl.id
      JOIN exercises e ON el.exercise_id = e.id
      WHERE wl.user_id = ?
      GROUP BY el.exercise_id
      ORDER BY last_logged DESC
    `, [req.user.id]);
    res.json({ exercises: exercises.rows });
  } catch (err) {
    console.error('Exercise progress list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/explore/progress/exercises/:exerciseId
// Returns all logged sets for a specific exercise, grouped by session date.
router.get('/progress/exercises/:exerciseId', authenticateToken, (req, res) => {
  try {
    const exercise = pool.query('SELECT id, name, thumbnail_url, body_part, equipment FROM exercises WHERE id = ?', [req.params.exerciseId]);
    if (!exercise.rows.length) return res.status(404).json({ error: 'Exercise not found' });

    const logs = pool.query(`
      SELECT
        el.id, el.set_number, el.reps, el.weight, el.notes AS set_notes,
        wl.id AS workout_log_id, wl.date, wl.notes AS workout_notes,
        w.title AS workout_title
      FROM exercise_logs el
      JOIN workout_logs wl ON el.workout_log_id = wl.id
      LEFT JOIN workouts w ON wl.workout_id = w.id
      WHERE wl.user_id = ? AND el.exercise_id = ?
      ORDER BY wl.date DESC, el.set_number ASC
    `, [req.user.id, req.params.exerciseId]);

    // Group by date
    const sessions = [];
    let currentDate = null;
    let currentSession = null;
    for (const row of logs.rows) {
      if (row.date !== currentDate) {
        currentDate = row.date;
        currentSession = {
          date: row.date,
          workout_title: row.workout_title,
          sets: [],
        };
        sessions.push(currentSession);
      }
      currentSession.sets.push({
        set_number: row.set_number,
        reps: row.reps,
        weight: row.weight,
        notes: row.set_notes,
      });
    }

    res.json({ exercise: exercise.rows[0], sessions });
  } catch (err) {
    console.error('Exercise progress detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Browse all exercises with search + filter
router.get('/exercises', authenticateToken, (req, res) => {
  try {
    const { search, body_part, equipment } = req.query;
    let sql = "SELECT id, name, thumbnail_url, body_part, equipment, demo_video_url, description FROM exercises WHERE demo_video_url IS NOT NULL AND length(demo_video_url) > 0";
    const params = [];

    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }
    if (body_part) {
      sql += ' AND body_part LIKE ?';
      params.push(`%${body_part}%`);
    }
    if (equipment) {
      sql += ' AND equipment LIKE ?';
      params.push(`%${equipment}%`);
    }

    sql += ' ORDER BY name';
    const result = pool.query(sql, params);
    res.json({ exercises: result.rows });
  } catch (err) {
    console.error('Exercise browse error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get distinct body parts and equipment for filter chips
router.get('/exercises/filters', authenticateToken, (req, res) => {
  try {
    const bodyParts = pool.query("SELECT DISTINCT body_part FROM exercises WHERE body_part IS NOT NULL AND body_part != '' ORDER BY body_part");
    const equipment = pool.query("SELECT DISTINCT equipment FROM exercises WHERE equipment IS NOT NULL AND equipment != '' ORDER BY equipment");
    res.json({ body_parts: bodyParts.rows.map(r => r.body_part), equipment: equipment.rows.map(r => r.equipment) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
