// mealScaling.js
//
// Per-client calorie scaling for meal plans. Given a meal_plan row + its items
// + a client's target calories, returns a scaled copy where each item's
// serving_qty has been multiplied by `client_target / plan_target`, then the
// plan's macro rollup is recomputed from the scaled servings.
//
// Scaling rules:
//   - scale_factor = client_target / plan.target_calories
//   - clamped to [0.6, 2.0] to avoid silly suggestions (e.g. 4× a snack)
//   - snacks stay at 1× — we bump main meals instead of multiplying trail mix
//   - if plan.target_calories is 0 or null we return the plan unchanged
//
// This is the single source of truth — routes and seeders should both use it
// so the same plan surfaces to clients with wildly different calorie needs
// without needing N copies in the DB.

import db from '../db/pool.js';

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;

/**
 * Load a meal plan with all its items (primary + alternatives) fully hydrated
 * with recipe data.
 *
 * @param {number} planId
 * @returns {{plan, items} | null}
 */
export function loadPlan(planId) {
  const plan = db.query('SELECT * FROM meal_plans WHERE id = ?', [planId]).rows[0];
  if (!plan) return null;
  const items = db.query(
    `SELECT mpi.id, mpi.meal_type, mpi.sort_order, mpi.alternative_group,
       mpi.serving_qty, mpi.custom_name,
       r.id AS recipe_id, r.title AS recipe_title, r.thumbnail_url,
       r.calories, r.protein, r.fat, r.carbs,
       r.serving_size, r.serving_unit, r.ingredients, r.instructions
     FROM meal_plan_items mpi
     LEFT JOIN recipes r ON r.id = mpi.recipe_id
     WHERE mpi.meal_plan_id = ?
     ORDER BY mpi.sort_order`,
    [planId],
  ).rows;
  return { plan, items };
}

/**
 * Compute the effective scale factor for a client on a given plan.
 *
 * @param {object} plan - meal_plans row
 * @param {number|null} clientTargetCalories
 * @returns {number}
 */
export function computeScaleFactor(plan, clientTargetCalories) {
  if (!clientTargetCalories || !plan?.target_calories || plan.target_calories <= 0) {
    return 1;
  }
  const raw = clientTargetCalories / plan.target_calories;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
}

/**
 * Scale a loaded plan for a specific client calorie target. Returns a new
 * object — does not mutate the input. Each item gets `scaled_serving_qty`,
 * `scaled_calories`, `scaled_protein`, `scaled_fat`, `scaled_carbs`.
 *
 * Snacks (meal_type = 'Snack') are NOT scaled — bumping snack portions feels
 * weird. The factor is applied to Breakfast/Lunch/Dinner only.
 *
 * @param {{plan, items}} loaded
 * @param {number|null} clientTargetCalories
 * @returns {{plan, items, scale_factor, day_totals}}
 */
export function scalePlanForClient(loaded, clientTargetCalories) {
  if (!loaded) return null;
  const { plan, items } = loaded;
  const factor = computeScaleFactor(plan, clientTargetCalories);

  const scaledItems = items.map((it) => {
    const isSnack = it.meal_type === 'Snack';
    const effFactor = isSnack ? 1 : factor;
    const scaled_serving_qty = (it.serving_qty || 1) * effFactor;
    return {
      ...it,
      scaled_serving_qty,
      scaled_calories: Math.round((it.calories || 0) * scaled_serving_qty),
      scaled_protein:  Math.round((it.protein  || 0) * scaled_serving_qty),
      scaled_fat:      Math.round((it.fat      || 0) * scaled_serving_qty),
      scaled_carbs:    Math.round((it.carbs    || 0) * scaled_serving_qty),
    };
  });

  // Day totals computed from PRIMARY slots only (alternative_group = 0)
  const primary = scaledItems.filter(i => i.alternative_group === 0);
  const day_totals = primary.reduce(
    (acc, i) => ({
      calories: acc.calories + i.scaled_calories,
      protein:  acc.protein  + i.scaled_protein,
      fat:      acc.fat      + i.scaled_fat,
      carbs:    acc.carbs    + i.scaled_carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  return { plan, items: scaledItems, scale_factor: factor, day_totals };
}

/**
 * Convenience: load + scale in one call.
 */
export function getPlanForClient(planId, clientTargetCalories) {
  const loaded = loadPlan(planId);
  if (!loaded) return null;
  return scalePlanForClient(loaded, clientTargetCalories);
}

/**
 * Load a full schedule (with all weeks/days) scaled for a client. Returns a
 * nested structure: { schedule, weeks: [{ week_number, days: [{ day_number, plan }] }] }
 */
export function getScheduleForClient(scheduleId, clientTargetCalories) {
  const schedule = db.query('SELECT * FROM meal_schedules WHERE id = ?', [scheduleId]).rows[0];
  if (!schedule) return null;

  const entries = db.query(
    `SELECT week_number, day_number, meal_plan_id
     FROM meal_schedule_entries
     WHERE schedule_id = ?
     ORDER BY week_number, day_number`,
    [scheduleId],
  ).rows;

  // Cache loaded plans so repeated refs across weeks don't hit the DB 84 times
  const planCache = new Map();
  const load = (id) => {
    if (!planCache.has(id)) planCache.set(id, loadPlan(id));
    return planCache.get(id);
  };

  const weeksMap = new Map();
  for (const e of entries) {
    if (!weeksMap.has(e.week_number)) weeksMap.set(e.week_number, []);
    const scaled = scalePlanForClient(load(e.meal_plan_id), clientTargetCalories);
    weeksMap.get(e.week_number).push({ day_number: e.day_number, ...scaled });
  }

  const weeks = [...weeksMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week_number, days]) => ({
      week_number,
      days: days.sort((a, b) => a.day_number - b.day_number),
    }));

  return { schedule, weeks };
}
