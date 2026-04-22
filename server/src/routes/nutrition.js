import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { loadPlan, scalePlanForClient, getScheduleForClient } from '../lib/mealScaling.js';
import https from 'https';

const router = Router();

// ===================================================================
// FOOD DIARY
// ===================================================================

// Get food diary for a date — includes suggested items from today's meal plan
router.get('/diary', authenticateToken, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const userId = req.user.id;

    const profile = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [userId]);
    const p = profile.rows[0] || {};

    const logs = pool.query(
      'SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ? ORDER BY id',
      [userId, date]
    );

    const mealOrder = ['Early Morning', 'Breakfast', 'Mid Morning', 'Lunch', 'Dinner', 'Snack', 'Evening Snack'];
    const meals = {};
    mealOrder.forEach(m => { meals[m] = { items: [], calories: 0 }; });

    logs.rows.forEach(log => {
      const mt = log.meal_type;
      if (!meals[mt]) meals[mt] = { items: [], calories: 0 };
      meals[mt].items.push(log);
      meals[mt].calories += log.calories;
    });

    const totals = logs.rows.reduce((acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      fat: acc.fat + l.fat,
      carbs: acc.carbs + l.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

    // Build suggested items from today's meal plan (if client has one)
    let suggested = {};
    if (p.active_meal_schedule_id) {
      try {
        const assignment = pool.query(
          'SELECT calorie_override, started_at FROM client_meal_schedules WHERE user_id = ? AND meal_schedule_id = ?',
          [userId, p.active_meal_schedule_id]
        ).rows[0];
        const sched = pool.query('SELECT * FROM meal_schedules WHERE id = ?', [p.active_meal_schedule_id]).rows[0];
        if (sched && assignment) {
          const startDate = assignment.started_at || sched.created_at?.split('T')[0] || date;
          const totalWeeks = sched.total_weeks || 1;
          const totalDays = totalWeeks * 7;
          const daysSinceStart = Math.max(0, Math.floor((new Date(date) - new Date(startDate)) / 86400000));
          const dayIndex = sched.repeating ? (daysSinceStart % totalDays) : Math.min(daysSinceStart, totalDays - 1);
          const weekNumber = Math.floor(dayIndex / 7) + 1;
          const dayNumber = (dayIndex % 7) + 1;
          const entry = pool.query(
            'SELECT meal_plan_id FROM meal_schedule_entries WHERE schedule_id = ? AND week_number = ? AND day_number = ?',
            [sched.id, weekNumber, dayNumber]
          ).rows[0];
          if (entry?.meal_plan_id) {
            const { loadPlan, scalePlanForClient } = await import('../lib/mealScaling.js');
            const loaded = loadPlan(entry.meal_plan_id);
            if (loaded) {
              const calTarget = assignment.calorie_override || p.calorie_target || null;
              const scaled = scalePlanForClient(loaded, calTarget);
              // Group primary items by meal_type, attach alternatives as swap options
              const allItems = scaled.items;
              const primary = allItems.filter(i => i.alternative_group === 0);
              // Pre-group alternatives by meal_type
              const altsByMealType = {};
              allItems.filter(i => i.alternative_group > 0).forEach(a => {
                const rawMt = a.meal_type || 'Other';
                const mt = rawMt.charAt(0).toUpperCase() + rawMt.slice(1);
                if (!altsByMealType[mt]) altsByMealType[mt] = [];
                altsByMealType[mt].push(a);
              });
              // Find the last primary item per meal_type (the one the alts belong to)
              const lastPrimaryByMt = {};
              primary.forEach(item => {
                const rawMtKey = item.meal_type || 'Other';
                const mtKey = rawMtKey.charAt(0).toUpperCase() + rawMtKey.slice(1);
                lastPrimaryByMt[mtKey] = item.sort_order;
              });
              primary.forEach(item => {
                const rawMt = item.meal_type || 'Other';
                const mt = rawMt.charAt(0).toUpperCase() + rawMt.slice(1);
                if (!suggested[mt]) suggested[mt] = [];
                const mealtypeAlts = altsByMealType[mt] || [];
                // Attach alternatives only to the last primary item in this meal_type
                const isLastPrimary = item.sort_order === lastPrimaryByMt[mt];
                const alternatives = (isLastPrimary && mealtypeAlts.length > 0) ? mealtypeAlts
                  .map(a => ({
                    recipe_id: a.recipe_id,
                    name: a.custom_name || a.recipe_title,
                    thumbnail_url: a.thumbnail_url,
                    calories: a.scaled_calories,
                    protein: a.scaled_protein,
                    fat: a.scaled_fat,
                    carbs: a.scaled_carbs,
                    serving_qty: a.scaled_serving_qty,
                    serving_size: a.serving_size,
                    serving_unit: a.serving_unit,
                  })) : [];
                suggested[mt].push({
                  recipe_id: item.recipe_id,
                  name: item.custom_name || item.recipe_title,
                  thumbnail_url: item.thumbnail_url,
                  calories: item.scaled_calories,
                  protein: item.scaled_protein,
                  fat: item.scaled_fat,
                  carbs: item.scaled_carbs,
                  serving_qty: item.scaled_serving_qty,
                  serving_size: item.serving_size,
                  serving_unit: item.serving_unit,
                  alternatives,
                });
              });
            }
          }
        }
      } catch (mealErr) {
        console.error('Diary meal plan suggestion error:', mealErr);
      }
    }

    res.json({
      date,
      meals,
      totals,
      suggested,
      targets: {
        calories: p.calorie_target || 1800,
        protein: p.protein_target || 163,
        fat: p.fat_target || 167,
        carbs: p.carbs_target || 10,
      },
    });
  } catch (err) {
    console.error('Diary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update calorie/macro targets
router.put('/targets', authenticateToken, async (req, res) => {
  try {
    const { calorie_target, protein_target, fat_target, carbs_target } = req.body;
    const userId = req.user.id;
    const existing = pool.query('SELECT id FROM client_profiles WHERE user_id = ?', [userId]).rows[0];
    if (existing) {
      const sets = [];
      const vals = [];
      if (calorie_target !== undefined) { sets.push('calorie_target = ?'); vals.push(calorie_target); }
      if (protein_target !== undefined) { sets.push('protein_target = ?'); vals.push(protein_target); }
      if (fat_target !== undefined) { sets.push('fat_target = ?'); vals.push(fat_target); }
      if (carbs_target !== undefined) { sets.push('carbs_target = ?'); vals.push(carbs_target); }
      if (sets.length > 0) {
        vals.push(userId);
        pool.query(`UPDATE client_profiles SET ${sets.join(', ')} WHERE user_id = ?`, vals);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update targets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add food to diary
router.post('/diary', authenticateToken, async (req, res) => {
  try {
    const { date, meal_type, food_name, calories, protein, fat, carbs, serving_size } = req.body;
    const d = date || new Date().toISOString().split('T')[0];

    pool.query(
      'INSERT INTO nutrition_logs (user_id, date, meal_type, food_name, calories, protein, fat, carbs, serving_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, d, meal_type, food_name, calories || 0, protein || 0, fat || 0, carbs || 0, serving_size || '']
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Add food error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete food from diary
router.delete('/diary/:id', authenticateToken, async (req, res) => {
  try {
    pool.query('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// MEAL PLANS + MEAL SCHEDULES (three-tier model)
//
// Hierarchy: Recipe (atomic) → MealPlan (one reusable day) → MealSchedule (assignable timeline)
//
// - meal_plans           : one structured day (e.g. "Monday – 1800 kcal")
// - meal_schedules       : timeline wrapper (e.g. "Advanced Bulletproof Gut – 12 weeks")
// - meal_schedule_entries: join (schedule, week_number, day_number) → meal_plan
// - client_meal_schedules: per-client assignment with calorie_override
//
// All client-facing endpoints scale servings via src/lib/mealScaling.js so a
// single schedule can surface at different calorie targets without cloning.
// ===================================================================

// -------- MEAL PLANS (reusable days) --------

// List meal plans — coach sees all with usage counts, client sees their available pool
router.get('/meal-plans', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'coach') {
      const plans = pool.query(`
        SELECT mp.*,
          (SELECT COUNT(*) FROM meal_plan_items WHERE meal_plan_id = mp.id AND alternative_group = 0) AS item_count,
          (SELECT COUNT(*) FROM meal_schedule_entries WHERE meal_plan_id = mp.id) AS used_in_schedules
        FROM meal_plans mp ORDER BY mp.created_at DESC
      `);
      return res.json({ plans: plans.rows });
    }
    // Clients just see the list — detail/scaling happens via /meal-plans/:id
    const plans = pool.query('SELECT * FROM meal_plans ORDER BY title').rows;
    res.json({ plans });
  } catch (err) {
    console.error('Meal plans list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Meal plan detail — scaled for the calling client's calorie target if they're a client
router.get('/meal-plans/:id', authenticateToken, async (req, res) => {
  try {
    const loaded = loadPlan(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Not found' });

    let target = null;
    if (req.user.role === 'client') {
      const cp = pool.query('SELECT calorie_target FROM client_profiles WHERE user_id = ?', [req.user.id]).rows[0];
      target = cp?.calorie_target || null;
    } else if (req.query.calorie_target) {
      target = Number(req.query.calorie_target);
    }
    const scaled = scalePlanForClient(loaded, target);
    res.json(scaled);
  } catch (err) {
    console.error('Meal plan detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create meal plan
router.post('/meal-plans', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, thumbnail_url, category, target_calories, target_protein, target_fat, target_carbs, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const r = pool.query(
      `INSERT INTO meal_plans
        (coach_id, title, description, thumbnail_url, category, target_calories, target_protein, target_fat, target_carbs, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.user.id, title, description || '', thumbnail_url || null, category || 'general',
       target_calories || 0, target_protein || 0, target_fat || 0, target_carbs || 0, tags || null],
    );
    res.json({ id: r.rows[0].id, success: true });
  } catch (err) {
    console.error('Create meal plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update meal plan metadata
router.put('/meal-plans/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, thumbnail_url, category, target_calories, target_protein, target_fat, target_carbs, tags } = req.body;
    pool.query(
      `UPDATE meal_plans SET title = ?, description = ?, thumbnail_url = ?, category = ?,
         target_calories = ?, target_protein = ?, target_fat = ?, target_carbs = ?, tags = ?
       WHERE id = ?`,
      [title, description, thumbnail_url, category, target_calories, target_protein, target_fat, target_carbs, tags, req.params.id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Update meal plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete meal plan (cascade removes items + entries)
router.delete('/meal-plans/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM meal_plans WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete meal plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add an item to a meal plan (primary or alternative)
router.post('/meal-plans/:id/items', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { meal_type, recipe_id, custom_name, serving_qty, alternative_group } = req.body;
    const count = pool.query('SELECT COUNT(*) c FROM meal_plan_items WHERE meal_plan_id = ?', [req.params.id]).rows[0].c;
    const r = pool.query(
      `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, custom_name, serving_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.params.id, meal_type || 'Breakfast', count, alternative_group || 0, recipe_id || null, custom_name || null, serving_qty || 1],
    );
    res.json({ id: r.rows[0].id, success: true });
  } catch (err) {
    console.error('Add meal item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a meal item
router.delete('/meal-plans/items/:itemId', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM meal_plan_items WHERE id = ?', [req.params.itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// -------- MEAL SCHEDULES (assignable timelines) --------

// List schedules — coach sees all, client sees the pool they can browse
router.get('/meal-schedules', authenticateToken, (req, res) => {
  try {
    if (req.user.role === 'coach') {
      const schedules = pool.query(`
        SELECT ms.*,
          (SELECT COUNT(*) FROM meal_schedule_entries WHERE schedule_id = ms.id) AS entry_count,
          (SELECT COUNT(*) FROM client_meal_schedules WHERE meal_schedule_id = ms.id) AS assigned_count
        FROM meal_schedules ms ORDER BY ms.id DESC
      `).rows;
      return res.json({ schedules });
    }
    const schedules = pool.query(`
      SELECT ms.*,
        (SELECT COUNT(*) FROM meal_schedule_entries WHERE schedule_id = ms.id) AS entry_count
      FROM meal_schedules ms ORDER BY ms.title
    `).rows;
    res.json({ schedules });
  } catch (err) {
    console.error('Meal schedules list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Schedule detail — full week/day tree scaled for the calling client
router.get('/meal-schedules/:id', authenticateToken, (req, res) => {
  try {
    let target = null;
    if (req.user.role === 'client') {
      // Prefer per-assignment override, fall back to profile target
      const assignment = pool.query(
        'SELECT calorie_override FROM client_meal_schedules WHERE user_id = ? AND meal_schedule_id = ?',
        [req.user.id, req.params.id],
      ).rows[0];
      const cp = pool.query('SELECT calorie_target FROM client_profiles WHERE user_id = ?', [req.user.id]).rows[0];
      target = assignment?.calorie_override || cp?.calorie_target || null;
    } else if (req.query.calorie_target) {
      // Coach preview: ?calorie_target=1800
      target = Number(req.query.calorie_target);
    }

    const full = getScheduleForClient(req.params.id, target);
    if (!full) return res.status(404).json({ error: 'Not found' });
    res.json({ ...full, calorie_target: target });
  } catch (err) {
    console.error('Meal schedule detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Current user's active schedule, fully scaled — what the client app renders
router.get('/my-schedule', authenticateToken, (req, res) => {
  try {
    const cp = pool.query(
      'SELECT calorie_target, active_meal_schedule_id FROM client_profiles WHERE user_id = ?',
      [req.user.id],
    ).rows[0];
    if (!cp?.active_meal_schedule_id) return res.json({ schedule: null });

    const assignment = pool.query(
      'SELECT calorie_override FROM client_meal_schedules WHERE user_id = ? AND meal_schedule_id = ?',
      [req.user.id, cp.active_meal_schedule_id],
    ).rows[0];
    const target = assignment?.calorie_override || cp.calorie_target;

    const full = getScheduleForClient(cp.active_meal_schedule_id, target);
    if (!full) return res.json({ schedule: null });
    res.json({ ...full, calorie_target: target });
  } catch (err) {
    console.error('my-schedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign a schedule to a client (coach only)
router.post('/meal-schedules/:id/assign', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { user_id, calorie_override } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // Clear any existing assignment for this user — one active schedule at a time
    pool.query('DELETE FROM client_meal_schedules WHERE user_id = ?', [user_id]);
    pool.query(
      `INSERT INTO client_meal_schedules (user_id, meal_schedule_id, calorie_override)
       VALUES (?, ?, ?)`,
      [user_id, req.params.id, calorie_override || null],
    );
    pool.query(
      'UPDATE client_profiles SET active_meal_schedule_id = ? WHERE user_id = ?',
      [req.params.id, user_id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Assign schedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client self-enroll in a meal schedule (mirrors training program enrollment)
router.post('/meal-schedules/:id/enroll', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const scheduleId = req.params.id;
    const { force } = req.body;

    // Check the schedule exists
    const schedule = pool.query('SELECT id, title FROM meal_schedules WHERE id = ?', [scheduleId]).rows[0];
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    // Check for existing active schedule
    const cp = pool.query('SELECT active_meal_schedule_id FROM client_profiles WHERE user_id = ?', [userId]).rows[0];
    if (cp?.active_meal_schedule_id && cp.active_meal_schedule_id !== Number(scheduleId) && !force) {
      const current = pool.query('SELECT id, title FROM meal_schedules WHERE id = ?', [cp.active_meal_schedule_id]).rows[0];
      return res.status(409).json({
        error: 'active_schedule_exists',
        current: current || { id: cp.active_meal_schedule_id, title: 'Current Schedule' },
      });
    }

    // Clear previous and enroll in new
    pool.query('DELETE FROM client_meal_schedules WHERE user_id = ?', [userId]);
    pool.query(
      `INSERT INTO client_meal_schedules (user_id, meal_schedule_id, calorie_override)
       VALUES (?, ?, NULL)`,
      [userId, scheduleId],
    );
    pool.query(
      'UPDATE client_profiles SET active_meal_schedule_id = ? WHERE user_id = ?',
      [scheduleId, userId],
    );
    res.json({ success: true, schedule });
  } catch (err) {
    console.error('Meal schedule self-enroll error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new schedule (coach only)
router.post('/meal-schedules', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, image_url, category, schedule_type, duration_weeks, duration_days, repeating,
      calorie_target_min, calorie_target_max } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const r = pool.query(
      `INSERT INTO meal_schedules
        (coach_id, title, description, image_url, category, schedule_type, duration_weeks, duration_days, repeating,
         calorie_target_min, calorie_target_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.user.id, title, description || '', image_url || null, category || 'general',
       schedule_type || 'weekly', duration_weeks || 1, duration_days || null, repeating ? 1 : 0,
       calorie_target_min || null, calorie_target_max || null],
    );
    res.json({ id: r.rows[0].id, success: true });
  } catch (err) {
    console.error('Create schedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update schedule metadata
router.patch('/meal-schedules/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const allowed = ['title', 'description', 'image_url', 'category', 'schedule_type',
      'duration_weeks', 'duration_days', 'repeating', 'calorie_target_min', 'calorie_target_max',
      'protein_target', 'fat_target', 'carbs_target'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (key in req.body) {
        sets.push(`${key} = ?`);
        let v = req.body[key];
        if (key === 'repeating') v = v ? 1 : 0;
        vals.push(v);
      }
    }
    if (sets.length === 0) return res.json({ success: true });
    vals.push(req.params.id);
    pool.query(`UPDATE meal_schedules SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ success: true });
  } catch (err) {
    console.error('Update schedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete schedule
router.delete('/meal-schedules/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM meal_schedules WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Batch save: atomically replace the full entries timeline for a schedule.
// Body: { entries: [{week_number, day_number, meal_plan_id}, ...] }
// Clears all existing entries and inserts the new set. Used by the
// fullscreen ScheduleBuilder "Save" button.
router.put('/meal-schedules/:id/entries', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries[] required' });
    pool.query('DELETE FROM meal_schedule_entries WHERE schedule_id = ?', [req.params.id]);
    for (const e of entries) {
      if (!e.meal_plan_id) continue;
      pool.query(
        `INSERT INTO meal_schedule_entries (schedule_id, week_number, day_number, meal_plan_id)
         VALUES (?, ?, ?, ?)`,
        [req.params.id, e.week_number, e.day_number, e.meal_plan_id],
      );
    }
    res.json({ success: true, count: entries.filter((e) => e.meal_plan_id).length });
  } catch (err) {
    console.error('Batch save entries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a single day entry
router.delete('/meal-schedules/:id/entries/:week/:day', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query(
      'DELETE FROM meal_schedule_entries WHERE schedule_id = ? AND week_number = ? AND day_number = ?',
      [req.params.id, req.params.week, req.params.day],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add/update an entry in a schedule's timeline
router.post('/meal-schedules/:id/entries', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { week_number, day_number, meal_plan_id } = req.body;
    if (!week_number || !day_number || !meal_plan_id) {
      return res.status(400).json({ error: 'week_number, day_number, meal_plan_id required' });
    }
    // Upsert via DELETE + INSERT (SQLite UNIQUE constraint)
    pool.query(
      'DELETE FROM meal_schedule_entries WHERE schedule_id = ? AND week_number = ? AND day_number = ?',
      [req.params.id, week_number, day_number],
    );
    pool.query(
      `INSERT INTO meal_schedule_entries (schedule_id, week_number, day_number, meal_plan_id)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, week_number, day_number, meal_plan_id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Add schedule entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// SHOPPING LISTS
// ===================================================================

// List shopping lists for current user
router.get('/shopping-lists', authenticateToken, (req, res) => {
  try {
    const lists = pool.query(
      'SELECT * FROM shopping_lists WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ lists: lists.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a shopping list with items
router.get('/shopping-lists/:id', authenticateToken, (req, res) => {
  try {
    const list = pool.query('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]).rows[0];
    if (!list) return res.status(404).json({ error: 'Not found' });
    const items = pool.query('SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY checked, category, name', [req.params.id]).rows;
    res.json({ list, items });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate a shopping list from either a single meal_plan (one day) OR an
// entire meal_schedule (multi-week). Body accepts { meal_plan_id } or
// { meal_schedule_id }. Ingredients are aggregated across all primary items
// (alternatives are excluded so shoppers don't buy for both options).
router.post('/shopping-lists/generate', authenticateToken, (req, res) => {
  try {
    const { meal_plan_id, meal_schedule_id } = req.body;

    // Collect every primary item we need to source ingredients from
    let items = [];
    let title = '';
    let sourceId = null;

    if (meal_schedule_id) {
      const sched = pool.query('SELECT id, title FROM meal_schedules WHERE id = ?', [meal_schedule_id]).rows[0];
      if (!sched) return res.status(404).json({ error: 'Schedule not found' });
      title = `Shopping: ${sched.title}`;
      sourceId = sched.id;
      items = pool.query(`
        SELECT mpi.serving_qty, r.ingredients
        FROM meal_schedule_entries mse
        JOIN meal_plan_items mpi ON mpi.meal_plan_id = mse.meal_plan_id
        LEFT JOIN recipes r ON r.id = mpi.recipe_id
        WHERE mse.schedule_id = ? AND mpi.alternative_group = 0
      `, [meal_schedule_id]).rows;
    } else if (meal_plan_id) {
      const plan = pool.query('SELECT id, title FROM meal_plans WHERE id = ?', [meal_plan_id]).rows[0];
      if (!plan) return res.status(404).json({ error: 'Meal plan not found' });
      title = `Shopping: ${plan.title}`;
      sourceId = plan.id;
      items = pool.query(`
        SELECT mpi.serving_qty, r.ingredients
        FROM meal_plan_items mpi
        LEFT JOIN recipes r ON r.id = mpi.recipe_id
        WHERE mpi.meal_plan_id = ? AND mpi.alternative_group = 0
      `, [meal_plan_id]).rows;
    } else {
      return res.status(400).json({ error: 'meal_plan_id or meal_schedule_id required' });
    }

    // Create the list
    const listR = pool.query(
      `INSERT INTO shopping_lists (user_id, title, source_meal_plan_id) VALUES (?, ?, ?) RETURNING id`,
      [req.user.id, title, sourceId],
    );
    const listId = listR.rows[0].id;

    // Aggregate ingredients keyed by lowercased name
    const agg = {};
    items.forEach((item) => {
      let ingredients = [];
      if (item.ingredients) {
        try { ingredients = JSON.parse(item.ingredients); } catch (e) {}
      }
      const qty = item.serving_qty || 1;
      ingredients.forEach((ing) => {
        const name = (ing.name || ing.item || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (!agg[key]) agg[key] = { name, quantity: [], category: ing.category || 'General' };
        const q = (ing.qty || ing.quantity || '').toString();
        const unit = (ing.unit || '').toString();
        const piece = `${q}${unit ? ' ' + unit : ''}`.trim();
        if (piece) agg[key].quantity.push(qty === 1 ? piece : `${qty} x ${piece}`);
      });
    });

    const aggItems = Object.values(agg);
    const ins = 'INSERT INTO shopping_list_items (shopping_list_id, name, quantity, category) VALUES (?, ?, ?, ?)';
    aggItems.forEach((it) => {
      pool.query(ins, [listId, it.name, it.quantity.join(', ') || null, it.category]);
    });

    res.json({ id: listId, item_count: aggItems.length, success: true });
  } catch (err) {
    console.error('Generate shopping list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle an item checked/unchecked
router.patch('/shopping-lists/items/:itemId', authenticateToken, (req, res) => {
  try {
    const { checked } = req.body;
    pool.query('UPDATE shopping_list_items SET checked = ? WHERE id = ?', [checked ? 1 : 0, req.params.itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add item manually
router.post('/shopping-lists/:id/items', authenticateToken, (req, res) => {
  try {
    const { name, quantity, category } = req.body;
    pool.query(
      'INSERT INTO shopping_list_items (shopping_list_id, name, quantity, category) VALUES (?, ?, ?, ?)',
      [req.params.id, name, quantity || null, category || 'General']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete item
router.delete('/shopping-lists/items/:itemId', authenticateToken, (req, res) => {
  try {
    pool.query('DELETE FROM shopping_list_items WHERE id = ?', [req.params.itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a whole list
router.delete('/shopping-lists/:id', authenticateToken, (req, res) => {
  try {
    pool.query('DELETE FROM shopping_lists WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// RECIPES (unchanged)
// ===================================================================

router.get('/recipes', authenticateToken, async (req, res) => {
  try {
    const { search, category } = req.query;

    let recipes;
    if (search) {
      recipes = pool.query('SELECT * FROM recipes WHERE title LIKE ? ORDER BY title', [`%${search}%`]);
    } else if (category) {
      recipes = pool.query('SELECT * FROM recipes WHERE category = ? ORDER BY title', [category]);
    } else {
      recipes = pool.query('SELECT * FROM recipes ORDER BY category, title');
    }

    const catOrder = ['Breakfast', 'Smoothies', 'Mains', 'Salads', 'Soups', 'Snacks'];
    const grouped = {};
    recipes.rows.forEach(r => {
      const cat = r.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        id: r.id, name: r.title, description: r.description, thumbnail: r.thumbnail_url,
        calories: r.calories, protein: r.protein, fat: r.fat, carbs: r.carbs,
        servingSize: r.serving_size, servingUnit: r.serving_unit,
        ingredients: JSON.parse(r.ingredients || '[]'),
        instructions: JSON.parse(r.instructions || '[]'),
        tags: r.tags,
      });
    });

    const categories = catOrder.filter(c => grouped[c]).map(c => ({ title: c, recipes: grouped[c] }));
    Object.keys(grouped).forEach(c => {
      if (!catOrder.includes(c)) categories.push({ title: c, recipes: grouped[c] });
    });

    res.json({ categories });
  } catch (err) {
    console.error('Recipes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const result = pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    const r = result.rows[0];
    if (!r) return res.status(404).json({ error: 'Recipe not found' });
    res.json({
      id: r.id, name: r.title, description: r.description, category: r.category,
      thumbnail: r.thumbnail_url, calories: r.calories, protein: r.protein, fat: r.fat, carbs: r.carbs,
      servingSize: r.serving_size, servingUnit: r.serving_unit,
      ingredients: JSON.parse(r.ingredients || '[]'),
      instructions: JSON.parse(r.instructions || '[]'),
      tags: r.tags,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/recipes', authenticateToken, async (req, res) => {
  try {
    const { name, description, category, thumbnail, calories, protein, fat, carbs, ingredients, instructions } = req.body;
    const result = pool.query(
      `INSERT INTO recipes (title, description, category, thumbnail_url, calories, protein, fat, carbs, ingredients, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [name, description || null, category || 'General', thumbnail || null,
       calories || 0, protein || 0, fat || 0, carbs || 0,
       JSON.stringify(ingredients || []), JSON.stringify(instructions || [])]
    );
    res.json({ id: result.rows[0].id, success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const { name, description, category, thumbnail, calories, protein, fat, carbs, ingredients, instructions } = req.body;
    pool.query(
      `UPDATE recipes SET title=?, description=?, category=?, thumbnail_url=?, calories=?, protein=?, fat=?, carbs=?, ingredients=?, instructions=? WHERE id=?`,
      [name, description || null, category || 'General', thumbnail || null,
       calories || 0, protein || 0, fat || 0, carbs || 0,
       JSON.stringify(ingredients || []), JSON.stringify(instructions || []),
       req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/recipes/:id', authenticateToken, async (req, res) => {
  try {
    pool.query('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// SUPPLEMENTS
// ===================================================================

// Return the logged-in client's prescribed supplement stack grouped by
// section (e.g. "Upon Waking", "After Breakfast"), merged with today's logs
// so the UI can render a checkbox state. Date can be overridden via ?date=YYYY-MM-DD.
router.get('/supplements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date + 'T12:00:00').getDay()];

    const supps = pool.query(
      `SELECT * FROM supplements WHERE user_id = ?
       ORDER BY COALESCE(section_order, 999), section, COALESCE(sort_order, 999), name`,
      [userId]
    ).rows;

    const takenIds = new Set(
      pool.query('SELECT supplement_id FROM supplement_logs WHERE user_id = ? AND date = ?', [userId, date])
        .rows.map(r => r.supplement_id)
    );

    // Group by section (fallback "Supplements" if unset so legacy rows still render).
    const grouped = [];
    const indexByLabel = new Map();
    for (const s of supps) {
      const label = s.section || 'Supplements';
      let bucket = indexByLabel.get(label);
      if (!bucket) {
        bucket = { time: label, section_order: s.section_order ?? 999, items: [] };
        indexByLabel.set(label, bucket);
        grouped.push(bucket);
      }
      const doubleDays = s.double_on_days ? JSON.parse(s.double_on_days) : null;
      bucket.items.push({
        id: s.id,
        name: s.name,
        dosage: s.dose || '',
        timing: s.timing || null,
        rationale: s.rationale || null,
        notes: s.notes || null,
        is_conditional: !!s.is_conditional,
        conditional_trigger: s.conditional_trigger || null,
        double_on_days: doubleDays,
        is_double_day: doubleDays ? doubleDays.includes(dayOfWeek) : false,
        is_client_added: !!s.is_client_added,
        taken: takenIds.has(s.id),
      });
    }
    grouped.sort((a, b) => a.section_order - b.section_order);

    res.json({
      title: 'Supplement Stack',
      date,
      sections: grouped,
    });
  } catch (err) {
    console.error('Supplements fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client adds one of their own supplements (is_client_added=1). Coach can
// see these in the admin with a badge.
router.post('/supplements', authenticateToken, (req, res) => {
  try {
    const { name, dose, section, section_order, timing, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const result = pool.query(
      `INSERT INTO supplements
         (user_id, name, dose, section, section_order, timing, notes, is_client_added)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING id`,
      [
        req.user.id,
        name.trim().slice(0, 120),
        dose || null,
        section || 'My Supplements',
        Number.isFinite(section_order) ? section_order : 60,
        timing || null,
        notes || null,
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Client add supplement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client edits their supplements. Coach-prescribed: dose only (treated as the
// client's actual intake). Client-added: dose, name, section, timing, notes.
router.patch('/supplements/:id', authenticateToken, (req, res) => {
  try {
    const supp = pool.query('SELECT * FROM supplements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]).rows[0];
    if (!supp) return res.status(404).json({ error: 'Not found' });

    const fields = [];
    const values = [];
    const body = req.body || {};

    if (body.dose !== undefined) { fields.push('dose = ?'); values.push(body.dose || null); }
    if (supp.is_client_added) {
      if (body.name !== undefined)          { fields.push('name = ?');          values.push(String(body.name).trim().slice(0, 120)); }
      if (body.section !== undefined)       { fields.push('section = ?');       values.push(body.section || null); }
      if (body.section_order !== undefined) { fields.push('section_order = ?'); values.push(Number.isFinite(body.section_order) ? body.section_order : 0); }
      if (body.timing !== undefined)        { fields.push('timing = ?');        values.push(body.timing || null); }
      if (body.notes !== undefined)         { fields.push('notes = ?');         values.push(body.notes || null); }
    }
    if (!fields.length) return res.json({ ok: true });
    values.push(req.params.id);
    pool.query(`UPDATE supplements SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('Client edit supplement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client deletes — only allowed for supplements they added themselves.
router.delete('/supplements/:id', authenticateToken, (req, res) => {
  try {
    const supp = pool.query('SELECT is_client_added FROM supplements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]).rows[0];
    if (!supp) return res.status(404).json({ error: 'Not found' });
    if (!supp.is_client_added) return res.status(403).json({ error: 'Only coach can remove prescribed supplements' });
    pool.query('DELETE FROM supplements WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Client delete supplement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a supplement taken (idempotent — unique(user_id, supplement_id, date)).
router.post('/supplements/log', authenticateToken, (req, res) => {
  try {
    const { supplement_id, date } = req.body;
    const d = date || new Date().toISOString().split('T')[0];
    if (!supplement_id) return res.status(400).json({ error: 'supplement_id required' });
    // Verify ownership: client can only log their own supplements.
    const owned = pool.query('SELECT 1 FROM supplements WHERE id = ? AND user_id = ?', [supplement_id, req.user.id]).rows[0];
    if (!owned) return res.status(403).json({ error: 'Forbidden' });
    pool.query(
      'INSERT OR IGNORE INTO supplement_logs (user_id, supplement_id, date) VALUES (?, ?, ?)',
      [req.user.id, supplement_id, d]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Supplement log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/supplements/log', authenticateToken, (req, res) => {
  try {
    const supplement_id = parseInt(req.query.supplement_id);
    const d = req.query.date || new Date().toISOString().split('T')[0];
    if (!supplement_id) return res.status(400).json({ error: 'supplement_id required' });
    pool.query(
      'DELETE FROM supplement_logs WHERE user_id = ? AND supplement_id = ? AND date = ?',
      [req.user.id, supplement_id, d]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Supplement unlog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================================================
// FOOD DATABASE (local cache + Open Food Facts fallback)
// ===================================================================

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'AgelessMovement/1.0 (coach app)' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('Timeout')); });
  });
}

// Food search — queries local foods table first, falls back to Open Food Facts for more results.
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      // Empty query -> return verified/seeded foods only
      const local = pool.query('SELECT * FROM foods WHERE verified = 1 ORDER BY name LIMIT 30').rows;
      return res.json({ foods: mapFoods(local), source: 'local' });
    }

    // Local search (both verified and cached)
    const local = pool.query(
      'SELECT * FROM foods WHERE name LIKE ? ORDER BY verified DESC, name LIMIT 20',
      [`%${q}%`]
    ).rows;

    // If we have fewer than 5 results, also query Open Food Facts
    let offFoods = [];
    if (local.length < 5) {
      try {
        const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20`;
        const off = await httpsGetJson(offUrl);
        offFoods = (off.products || [])
          .filter(p => p.product_name && p.nutriments)
          .slice(0, 15)
          .map(p => ({
            name: p.product_name,
            brand: p.brands || null,
            barcode: p.code || null,
            source: 'openfoodfacts',
            calories: Math.round(p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal'] || 0),
            protein: Number(p.nutriments.proteins_100g || 0),
            fat: Number(p.nutriments.fat_100g || 0),
            carbs: Number(p.nutriments.carbohydrates_100g || 0),
            serving_size: p.serving_size || '100 g',
            image_url: p.image_thumb_url || null,
            verified: 0,
          }));
      } catch (e) {
        console.warn('Open Food Facts search failed:', e.message);
      }
    }

    res.json({
      foods: [...mapFoods(local), ...offFoods],
      source: offFoods.length ? 'local+openfoodfacts' : 'local',
    });
  } catch (err) {
    console.error('Food search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Barcode lookup — check local cache, fall back to Open Food Facts, cache result.
router.get('/barcode/:code', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code;
    const cached = pool.query('SELECT * FROM foods WHERE barcode = ?', [code]).rows[0];
    if (cached) return res.json({ food: mapFood(cached), source: 'cache' });

    try {
      const off = await httpsGetJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      if (off.status !== 1 || !off.product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const p = off.product;
      const food = {
        name: p.product_name || 'Unknown product',
        brand: p.brands || null,
        barcode: code,
        source: 'openfoodfacts',
        calories: Math.round(p.nutriments?.['energy-kcal_100g'] || p.nutriments?.['energy-kcal'] || 0),
        protein: Number(p.nutriments?.proteins_100g || 0),
        fat: Number(p.nutriments?.fat_100g || 0),
        carbs: Number(p.nutriments?.carbohydrates_100g || 0),
        serving_size: p.serving_size || '100 g',
        image_url: p.image_thumb_url || p.image_small_url || null,
      };

      // Cache it
      pool.query(
        `INSERT INTO foods (name, brand, barcode, source, calories, protein, fat, carbs, serving_size, image_url, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [food.name, food.brand, food.barcode, food.source, food.calories, food.protein, food.fat, food.carbs, food.serving_size, food.image_url]
      );

      res.json({ food, source: 'openfoodfacts' });
    } catch (e) {
      console.warn('OFF barcode lookup failed:', e.message);
      res.status(502).json({ error: 'Could not reach food database' });
    }
  } catch (err) {
    console.error('Barcode lookup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function mapFoods(rows) { return rows.map(mapFood); }
function mapFood(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    calories: r.calories,
    protein: r.protein,
    fat: r.fat,
    carbs: r.carbs,
    serving_size: r.serving_size || '100 g',
    serving: r.serving_size || '100 g', // legacy field name used by FoodSearch UI
    image_url: r.image_url,
    verified: !!r.verified,
  };
}

// ===================================================================
// MEAL TIME PREFERENCES
// ===================================================================

// Get meal times for a day_type (falls back to 'default')
router.get('/meal-times', authenticateToken, async (req, res) => {
  try {
    const dayType = (req.query.day_type || 'default').toLowerCase();
    const userId = req.user.id;

    let rows = pool.query(
      'SELECT meal_type, preferred_time FROM meal_time_preferences WHERE user_id = ? AND day_type = ?',
      [userId, dayType]
    ).rows;

    // Fall back to 'default' if no day-specific rows
    if (rows.length === 0 && dayType !== 'default') {
      rows = pool.query(
        'SELECT meal_type, preferred_time FROM meal_time_preferences WHERE user_id = ? AND day_type = ?',
        [userId, 'default']
      ).rows;
    }

    const times = {};
    rows.forEach(r => { times[r.meal_type] = r.preferred_time; });

    res.json({ times });
  } catch (err) {
    console.error('Get meal times error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upsert a single meal time preference
router.put('/meal-times', authenticateToken, async (req, res) => {
  try {
    const { day_type, meal_type, preferred_time } = req.body;
    if (!day_type || !meal_type || !preferred_time) {
      return res.status(400).json({ error: 'day_type, meal_type and preferred_time are required' });
    }

    pool.query(
      `INSERT OR REPLACE INTO meal_time_preferences (user_id, day_type, meal_type, preferred_time, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [req.user.id, day_type.toLowerCase(), meal_type, preferred_time]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Put meal time error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
