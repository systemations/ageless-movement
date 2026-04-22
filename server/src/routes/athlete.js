import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/athlete/features
// Returns { features: { feature_key: { unlocked, tier_met, data_exists, label, description } } }
router.get('/features', authenticateToken, (req, res) => {
  try {
    let userId = req.user.id;

    // Coaches can query another user's features
    if (req.query.user_id) {
      const requester = pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]).rows[0];
      if (requester?.role === 'coach') {
        userId = Number(req.query.user_id);
      }
    }

    // Get user's tier level
    const profile = pool.query(
      `SELECT cp.tier_id, COALESCE(t.level, 0) as tier_level
       FROM client_profiles cp
       LEFT JOIN tiers t ON t.id = cp.tier_id
       WHERE cp.user_id = ?`, [userId]
    ).rows[0];
    const tierLevel = profile?.tier_level || 0;

    // Get all feature requirements
    const requirements = pool.query('SELECT * FROM feature_tier_requirements ORDER BY min_tier_level, feature_key').rows;

    // Check data existence for each feature
    const dataChecks = {
      today_screen: true, // always available
      weekly_schedule: true,
      workout_program: pool.query('SELECT 1 FROM client_programs WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      calorie_tracker: true,
      smart_targets: (
        pool.query('SELECT 1 FROM phase_calorie_targets pct JOIN block_phases bp ON bp.id = pct.block_phase_id JOIN training_blocks tb ON tb.id = bp.block_id WHERE tb.user_id = ? LIMIT 1', [userId]).rows.length > 0
        || pool.query('SELECT 1 FROM meal_day_templates mdt JOIN training_blocks tb ON tb.id = mdt.block_id WHERE tb.user_id = ? LIMIT 1', [userId]).rows.length > 0
      ),
      meal_templates: pool.query('SELECT 1 FROM meal_day_templates mdt JOIN training_blocks tb ON tb.id = mdt.block_id WHERE tb.user_id = ? LIMIT 1', [userId]).rows.length > 0,
      weekly_meal_plan: pool.query('SELECT 1 FROM weekly_meal_plans wmp JOIN training_blocks tb ON tb.id = wmp.block_id WHERE tb.user_id = ? LIMIT 1', [userId]).rows.length > 0,
      supplement_tracker: pool.query('SELECT 1 FROM supplements WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      daily_checkin: true, // basic checkin always has data potential
      daily_checkin_full: pool.query('SELECT 1 FROM athlete_metrics WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      wellness_protocols: pool.query('SELECT 1 FROM wellness_protocols WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      phase_banners: pool.query('SELECT 1 FROM block_phases bp JOIN training_blocks tb ON tb.id = bp.block_id WHERE tb.user_id = ? LIMIT 1', [userId]).rows.length > 0,
      scan_reminders: pool.query('SELECT 1 FROM scan_schedule ss JOIN training_blocks tb ON tb.id = ss.block_id WHERE tb.user_id = ? LIMIT 1', [userId]).rows.length > 0,
      strength_tests: pool.query('SELECT 1 FROM athlete_tests WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      tendon_protocols: pool.query('SELECT 1 FROM tendon_protocols WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      emergency_protocols: pool.query('SELECT 1 FROM emergency_protocols WHERE user_id = ? LIMIT 1', [userId]).rows.length > 0,
      shopping_list: pool.query('SELECT 1 FROM weekly_meal_plans wmp JOIN training_blocks tb ON tb.id = wmp.block_id WHERE tb.user_id = ? AND wmp.shopping_list IS NOT NULL LIMIT 1', [userId]).rows.length > 0,
    };

    const features = {};
    for (const r of requirements) {
      const tierMet = tierLevel >= r.min_tier_level;
      const dataExists = dataChecks[r.feature_key] ?? false;
      features[r.feature_key] = {
        unlocked: tierMet && dataExists,
        tier_met: tierMet,
        data_exists: dataExists,
        min_tier_level: r.min_tier_level,
        label: r.label,
        description: r.description,
      };
    }

    res.json({ tier_level: tierLevel, features });
  } catch (err) {
    console.error('Features error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/athlete/today?date=YYYY-MM-DD (optional, defaults to today)
router.get('/today', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date + 'T12:00:00').getDay()];

    // Get user tier
    const profile = pool.query(
      `SELECT cp.tier_id, cp.calorie_target, cp.protein_target, cp.fat_target, cp.carbs_target,
              COALESCE(t.level, 0) as tier_level
       FROM client_profiles cp
       LEFT JOIN tiers t ON t.id = cp.tier_id
       WHERE cp.user_id = ?`, [userId]
    ).rows[0];
    const tierLevel = profile?.tier_level || 0;

    // Get active training block
    const block = pool.query(
      `SELECT tb.*, p.title as program_title
       FROM training_blocks tb
       LEFT JOIN programs p ON p.id = tb.program_id
       WHERE tb.user_id = ? AND tb.start_date <= ? AND tb.end_date >= ?
       ORDER BY tb.start_date DESC LIMIT 1`, [userId, date, date]
    ).rows[0];

    let currentPhase = null;
    let weekNumber = null;
    let phaseCalories = null;

    if (block) {
      // Calculate current week number
      const startDate = new Date(block.start_date + 'T00:00:00');
      const currentDate = new Date(date + 'T00:00:00');
      const diffDays = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
      weekNumber = Math.floor(diffDays / 7) + 1;
      if (weekNumber < 1) weekNumber = 1;
      if (weekNumber > block.duration_weeks) weekNumber = block.duration_weeks;

      // Find current phase by week number
      const phases = pool.query(
        'SELECT * FROM block_phases WHERE block_id = ? ORDER BY id', [block.id]
      ).rows;

      for (const phase of phases) {
        const weeks = JSON.parse(phase.weeks || '[]');
        if (weeks.includes(weekNumber)) {
          currentPhase = phase;
          break;
        }
      }

      // Get phase calorie targets
      if (currentPhase) {
        phaseCalories = pool.query(
          'SELECT training_day_kcal, rest_day_kcal FROM phase_calorie_targets WHERE block_phase_id = ?',
          [currentPhase.id]
        ).rows[0];
      }
    }

    // Get today's scheduled workouts from weekly_schedule
    let todayWorkouts = [];
    if (block) {
      const scheduleEntries = pool.query(
        'SELECT * FROM weekly_schedule WHERE block_id = ? AND day_of_week = ?',
        [block.id, dayOfWeek]
      ).rows;

      todayWorkouts = scheduleEntries.map(entry => {
        let workout = null;
        if (entry.workout_id) {
          workout = pool.query(
            `SELECT w.*, GROUP_CONCAT(DISTINCT e.name) as exercise_names
             FROM workouts w
             LEFT JOIN workout_exercises we ON we.workout_id = w.id
             LEFT JOIN exercises e ON e.id = we.exercise_id
             WHERE w.id = ?
             GROUP BY w.id`, [entry.workout_id]
          ).rows[0];
        }
        return {
          ...entry,
          workout,
        };
      });
    }

    // Respect suppressions (user removed a prescribed workout for today).
    const suppressedIds = new Set(
      pool.query(
        'SELECT workout_id FROM workout_suppressions WHERE user_id = ? AND date = ?',
        [userId, date]
      ).rows.map(r => r.workout_id)
    );
    todayWorkouts = todayWorkouts.filter(w => !w.workout_id || !suppressedIds.has(w.workout_id));

    // Merge in program-driven workouts for today (client self-enrolled via
    // Explore → Enroll). `/api/athlete/today` previously only saw training-block
    // workouts, so program enrollment never surfaced on Home.
    const presentIds = new Set(todayWorkouts.map(e => e.workout_id).filter(Boolean));
    const programRows = pool.query(
      `SELECT w.id AS workout_id, w.title, w.duration_mins, w.workout_type,
              w.image_url, w.body_parts
       FROM client_programs cp
       JOIN workouts w ON w.program_id = cp.program_id
       WHERE cp.user_id = ?
         AND DATE(cp.started_at, '+' || ((w.week_number - 1) * 7 + (w.day_number - 1)) || ' days') = ?`,
      [userId, date]
    ).rows;
    for (const row of programRows) {
      if (presentIds.has(row.workout_id) || suppressedIds.has(row.workout_id)) continue;
      presentIds.add(row.workout_id);
      todayWorkouts.push({
        id: `prog-${row.workout_id}`,
        workout_id: row.workout_id,
        session_type: row.workout_type || 'workout',
        duration_min: row.duration_mins || 0,
        time_slot: null,
        session_ref: null,
        source: 'program',
        workout: {
          id: row.workout_id,
          title: row.title,
          image_url: row.image_url,
          duration_mins: row.duration_mins,
          body_parts: row.body_parts,
          workout_type: row.workout_type,
        },
      });
    }

    // Merge in user-added workouts for today so ad-hoc adds show up in
    // "Today's Sessions". Dedupe by workout_id (block already populated presentIds).
    const blockWorkoutIds = presentIds;
    const userAddedRows = pool.query(
      `SELECT usw.id AS usw_id, usw.workout_id, usw.sort_order,
              w.title, w.duration_mins, w.workout_type, w.image_url, w.body_parts
       FROM user_scheduled_workouts usw
       JOIN workouts w ON w.id = usw.workout_id
       WHERE usw.user_id = ? AND usw.scheduled_date = ?`,
      [userId, date]
    ).rows;
    for (const row of userAddedRows) {
      if (blockWorkoutIds.has(row.workout_id)) continue;
      todayWorkouts.push({
        id: `usw-${row.usw_id}`,
        schedule_id: row.usw_id,
        workout_id: row.workout_id,
        session_type: row.workout_type || 'workout',
        duration_min: row.duration_mins || 0,
        time_slot: null,
        session_ref: null,
        source: 'user_added',
        workout: {
          id: row.workout_id,
          title: row.title,
          image_url: row.image_url,
          duration_mins: row.duration_mins,
          body_parts: row.body_parts,
          workout_type: row.workout_type,
        },
      });
    }

    // Get meal template for today's day type
    let mealTemplate = null;
    if (block && tierLevel >= 2) {
      // Map day of week to day_type
      const dayTypeMap = {
        monday: 'monday_gym_and_pickleball',
        tuesday: 'tuesday_run_afternoon',
        wednesday: 'wed_thu_fri_gym',
        thursday: 'wed_thu_fri_gym',
        friday: 'wed_thu_fri_gym',
        saturday: 'saturday_street_session',
        sunday: 'sunday_rest',
      };
      const dayType = dayTypeMap[dayOfWeek];
      if (dayType) {
        mealTemplate = pool.query(
          'SELECT * FROM meal_day_templates WHERE block_id = ? AND day_type = ?',
          [block.id, dayType]
        ).rows[0];
        if (mealTemplate) {
          mealTemplate.meals = JSON.parse(mealTemplate.meals || '[]');
        }
      }
    }

    // Get supplements
    let supplements = [];
    if (tierLevel >= 3) {
      supplements = pool.query(
        'SELECT * FROM supplements WHERE user_id = ? ORDER BY is_conditional, name', [userId]
      ).rows;
      supplements = supplements.map(s => ({
        ...s,
        double_on_days: s.double_on_days ? JSON.parse(s.double_on_days) : null,
        is_double_day: s.double_on_days ? JSON.parse(s.double_on_days).includes(dayOfWeek) : false,
      }));
    }

    // Get metrics to log today
    let metricsToLog = [];
    if (tierLevel >= 1) {
      const allMetrics = pool.query(
        'SELECT * FROM athlete_metrics WHERE user_id = ?', [userId]
      ).rows;
      metricsToLog = allMetrics.filter(m => {
        if (m.cadence === 'daily' || m.cadence === 'daily_AM_fasted') return true;
        if (m.cadence === 'weekly' && dayOfWeek === 'sunday') return true;
        if (m.cadence === dayOfWeek) return true;
        return false;
      });
    }

    // Get weekly meal plan for current week
    let weeklyMealPlan = null;
    if (block && weekNumber && tierLevel >= 2) {
      weeklyMealPlan = pool.query(
        'SELECT * FROM weekly_meal_plans WHERE block_id = ? AND week_number = ?',
        [block.id, weekNumber]
      ).rows[0];
      if (weeklyMealPlan?.shopping_list) {
        weeklyMealPlan.shopping_list = JSON.parse(weeklyMealPlan.shopping_list);
      }
      if (weeklyMealPlan?.fish_days) {
        weeklyMealPlan.fish_days = JSON.parse(weeklyMealPlan.fish_days);
      }
      if (weeklyMealPlan?.meat_focus) {
        weeklyMealPlan.meat_focus = JSON.parse(weeklyMealPlan.meat_focus);
      }
    }

    // Check for active alerts (tendon red flags, scan reminders, etc.)
    let alerts = [];
    if (block && tierLevel >= 3) {
      // Scan reminders (7 days before due)
      const upcomingScans = pool.query(
        `SELECT * FROM scan_schedule
         WHERE block_id = ? AND status != 'completed' AND week_number IS NOT NULL`,
        [block.id]
      ).rows;
      for (const scan of upcomingScans) {
        const scanDate = new Date(block.start_date);
        scanDate.setDate(scanDate.getDate() + (scan.week_number - 1) * 7);
        const daysUntil = Math.floor((scanDate - new Date(date + 'T00:00:00')) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 7) {
          alerts.push({
            type: 'scan_reminder',
            severity: 'info',
            message: `${scan.scan_type} scan due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (Week ${scan.week_number})`,
            scan,
          });
        }
      }

      // Bloods reminders
      const upcomingBloods = pool.query(
        `SELECT * FROM bloods_schedule
         WHERE block_id = ? AND status = 'pending' AND week_number IS NOT NULL`,
        [block.id]
      ).rows;
      for (const blood of upcomingBloods) {
        const bloodDate = new Date(block.start_date);
        bloodDate.setDate(bloodDate.getDate() + (blood.week_number - 1) * 7);
        const daysUntil = Math.floor((bloodDate - new Date(date + 'T00:00:00')) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 7) {
          alerts.push({
            type: 'bloods_reminder',
            severity: 'info',
            message: `Blood panel due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (Week ${blood.week_number})`,
          });
        }
      }
    }

    // Determine if it's a training day or rest day
    const isTrainingDay = todayWorkouts.some(w => w.session_type === 'gym' || w.session_type === 'circuit');

    // Build calorie targets (phase-aware if available)
    let calorieTargets = {
      calories: profile?.calorie_target || 2200,
      protein: profile?.protein_target || 163,
      fat: profile?.fat_target || 167,
      carbs: profile?.carbs_target || 10,
    };
    if (phaseCalories && tierLevel >= 2) {
      calorieTargets.calories = isTrainingDay ? phaseCalories.training_day_kcal : phaseCalories.rest_day_kcal;
    } else if (mealTemplate && tierLevel >= 2) {
      // No phase calories available (e.g. after program switch wiped block_phases).
      // Fall back to the meal-day-template kcal so Home still shows a target.
      if (mealTemplate.kcal_target) calorieTargets.calories = mealTemplate.kcal_target;
      if (mealTemplate.protein_g_target) calorieTargets.protein = mealTemplate.protein_g_target;
    }

    res.json({
      date,
      day_of_week: dayOfWeek,
      week_number: weekNumber,
      is_training_day: isTrainingDay,
      block: block ? {
        id: block.id,
        name: block.name,
        program_title: block.program_title,
        start_date: block.start_date,
        end_date: block.end_date,
        duration_weeks: block.duration_weeks,
      } : null,
      phase: currentPhase ? {
        id: currentPhase.id,
        name: currentPhase.name,
        theme: currentPhase.theme,
        volume_rating: currentPhase.volume_rating,
        plyo_allowance: currentPhase.plyo_allowance,
        progression_notes: currentPhase.progression_notes,
      } : null,
      calorie_targets: calorieTargets,
      workouts: todayWorkouts,
      meal_template: mealTemplate,
      supplements,
      metrics_to_log: metricsToLog,
      weekly_meal_plan: weeklyMealPlan,
      alerts,
    });
  } catch (err) {
    console.error('Today error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/athlete/checkin
// Body: { date, metrics: { sleep_hours: 7.5, energy_1_10: 8, ... } }
router.post('/checkin', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { date, metrics } = req.body;
    if (!date || !metrics) return res.status(400).json({ error: 'date and metrics required' });

    // Create metric_values table if not exists
    pool.query(`CREATE TABLE IF NOT EXISTS metric_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      metric_name TEXT NOT NULL,
      date TEXT NOT NULL,
      value_numeric REAL,
      value_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, metric_name, date)
    )`, []);

    const entries = Object.entries(metrics);
    for (const [name, value] of entries) {
      const isNumeric = typeof value === 'number';
      pool.query(
        `INSERT OR REPLACE INTO metric_values (user_id, metric_name, date, value_numeric, value_text)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, name, date, isNumeric ? value : null, isNumeric ? null : String(value)]
      );
    }

    res.json({ success: true, logged: entries.length });
  } catch (err) {
    console.error('Checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/athlete/checkin?date=YYYY-MM-DD
router.get('/checkin', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date required' });

    const values = pool.query(
      'SELECT metric_name, value_numeric, value_text FROM metric_values WHERE user_id = ? AND date = ?',
      [userId, date]
    ).rows;

    const metrics = {};
    for (const v of values) {
      metrics[v.metric_name] = v.value_numeric ?? v.value_text;
    }

    res.json({ date, metrics });
  } catch (err) {
    console.error('Checkin get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/athlete/checkin/history?metric=weight_kg&days=30
router.get('/checkin/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { metric, days = 30 } = req.query;
    if (!metric) return res.status(400).json({ error: 'metric required' });

    const values = pool.query(
      `SELECT date, value_numeric, value_text FROM metric_values
       WHERE user_id = ? AND metric_name = ? AND date >= date('now', '-' || ? || ' days')
       ORDER BY date DESC`,
      [userId, metric, days]
    ).rows;

    res.json({ metric, values });
  } catch (err) {
    console.error('Checkin history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/athlete/block?user_id=1
// Coach endpoint to view a specific client's training block
router.get('/block', authenticateToken, (req, res) => {
  try {
    const targetUserId = req.query.user_id || req.user.id;

    // If requesting someone else's data, must be a coach
    if (Number(targetUserId) !== req.user.id) {
      const requester = pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]).rows[0];
      if (!requester || requester.role !== 'coach') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const block = pool.query(
      `SELECT tb.*, p.title as program_title
       FROM training_blocks tb
       LEFT JOIN programs p ON p.id = tb.program_id
       WHERE tb.user_id = ? ORDER BY tb.start_date DESC LIMIT 1`,
      [targetUserId]
    ).rows[0];

    if (!block) return res.json({ block: null });

    const phases = pool.query(
      'SELECT * FROM block_phases WHERE block_id = ? ORDER BY id', [block.id]
    ).rows.map(p => ({
      ...p,
      weeks: JSON.parse(p.weeks || '[]'),
    }));

    const supplements = pool.query(
      'SELECT * FROM supplements WHERE user_id = ? ORDER BY is_conditional, name', [targetUserId]
    ).rows;

    const protocols = pool.query(
      'SELECT * FROM wellness_protocols WHERE user_id = ?', [targetUserId]
    ).rows.map(p => ({ ...p, config: JSON.parse(p.config || '{}') }));

    const metrics = pool.query(
      'SELECT * FROM athlete_metrics WHERE user_id = ?', [targetUserId]
    ).rows;

    const tests = pool.query(
      'SELECT * FROM athlete_tests WHERE user_id = ?', [targetUserId]
    ).rows;

    const athleteProfile = pool.query(
      'SELECT * FROM athlete_profiles WHERE user_id = ?', [targetUserId]
    ).rows[0];
    if (athleteProfile?.goals) athleteProfile.goals = JSON.parse(athleteProfile.goals);
    if (athleteProfile?.genetic_flags) athleteProfile.genetic_flags = JSON.parse(athleteProfile.genetic_flags);

    res.json({
      block: { ...block, phases },
      supplements,
      protocols,
      metrics,
      tests,
      athlete_profile: athleteProfile,
    });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/athlete/preferences
router.get('/preferences', authenticateToken, (req, res) => {
  try {
    const profile = pool.query(
      'SELECT reminder_preferences FROM client_profiles WHERE user_id = ?',
      [req.user.id]
    ).rows[0];
    const prefs = profile?.reminder_preferences ? JSON.parse(profile.reminder_preferences) : {};
    res.json({ preferences: prefs });
  } catch (err) {
    console.error('Preferences fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/athlete/preferences
router.put('/preferences', authenticateToken, (req, res) => {
  try {
    const { preferences } = req.body;
    pool.query(
      'UPDATE client_profiles SET reminder_preferences = ? WHERE user_id = ?',
      [JSON.stringify(preferences), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Preferences save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// App feedback — client submits rating + message. Coaches list recent
// entries on the More screen so Dan can see reactions without a DB poke.
router.post('/feedback', authenticateToken, (req, res) => {
  try {
    const { rating, message } = req.body || {};
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' });
    }
    const m = typeof message === 'string' ? message.trim().slice(0, 2000) : '';
    pool.query(
      'INSERT INTO app_feedback (user_id, rating, message) VALUES (?, ?, ?)',
      [req.user.id, r, m || null],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/feedback', authenticateToken, (req, res) => {
  try {
    const requester = pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]).rows[0];
    if (requester?.role !== 'coach') return res.status(403).json({ error: 'Forbidden' });
    const rows = pool.query(
      `SELECT f.id, f.rating, f.message, f.created_at, u.id as user_id, u.name, u.email
       FROM app_feedback f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT 100`,
    ).rows;
    res.json({ feedback: rows });
  } catch (err) {
    console.error('Feedback list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
