// Seeds four calorie-targeted 1-week meal schedules (1550 / 1800 / 2000 / 2200 kcal)
// built from the existing 329-recipe library. Idempotent via title-based sentinel —
// re-running is a no-op.
//
// Each schedule gets 7 meal_plans (Mon-Sun), and each day has 4 meal slots:
//   Breakfast · Lunch · Dinner · Snack
// We pick recipes by category and greedy-fit to the target calorie budget.
// Alternatives (2 per slot) are added via alternative_group > 0.
//
// Run: node scripts/seed_calorie_schedules.js

import db from '../src/db/pool.js';

const TARGETS = [
  { cals: 1550, title: '1550 kcal · Fat Loss', desc: 'A gentle cut week for clients targeting ~1550 calories/day.' },
  { cals: 1800, title: '1800 kcal · Maintenance', desc: 'Balanced maintenance week — good default starting point.' },
  { cals: 2000, title: '2000 kcal · Active', desc: 'For clients training 4-5x/week at maintenance or slight surplus.' },
  { cals: 2200, title: '2200 kcal · Muscle Gain', desc: 'Lean-bulk week with higher protein and carb pool.' },
];

const COACH_ID = 2; // Dan

function pickRecipes(category, count, excludeIds = new Set()) {
  const rows = db.query(
    `SELECT id, title, calories, protein, fat, carbs
     FROM recipes
     WHERE category = ? AND calories > 0
     ORDER BY RANDOM()`,
    [category],
  ).rows;
  const picks = [];
  for (const r of rows) {
    if (picks.length >= count) break;
    if (excludeIds.has(r.id)) continue;
    picks.push(r);
  }
  return picks;
}

function buildDay(targetCals) {
  // Split budget: 25% breakfast, 30% lunch, 30% dinner, 15% snack
  const bBudget = targetCals * 0.25;
  const lBudget = targetCals * 0.30;
  const dBudget = targetCals * 0.30;
  const sBudget = targetCals * 0.15;

  // Pull a large random pool per category, then pick the closest fit
  const pick = (category, budget) => {
    const pool = pickRecipes(category, 30);
    if (!pool.length) return null;
    pool.sort((a, b) => Math.abs(a.calories - budget) - Math.abs(b.calories - budget));
    return pool[0];
  };

  const pickAlt = (category, budget, excludeId) => {
    const pool = pickRecipes(category, 30, new Set([excludeId]));
    if (!pool.length) return null;
    pool.sort((a, b) => Math.abs(a.calories - budget) - Math.abs(b.calories - budget));
    return pool[0];
  };

  // Breakfast pool combines Breakfast + Smoothies
  const breakfastCats = Math.random() < 0.5 ? 'Breakfast' : 'Smoothies';
  const lunchCats = Math.random() < 0.5 ? 'Mains' : 'Salads';
  const dinnerCats = Math.random() < 0.8 ? 'Mains' : 'Soups';

  const b = pick(breakfastCats, bBudget);
  const l = pick(lunchCats, lBudget);
  const d = pick(dinnerCats, dBudget);
  const s = pick('Snacks', sBudget);

  // Alternative slot picks (different recipe than primary)
  const bAlt = b ? pickAlt(breakfastCats === 'Breakfast' ? 'Smoothies' : 'Breakfast', bBudget, b.id) : null;
  const lAlt = l ? pickAlt(lunchCats === 'Mains' ? 'Salads' : 'Mains', lBudget, l.id) : null;
  const dAlt = d ? pickAlt('Mains', dBudget, d.id) : null;
  const sAlt = s ? pickAlt('Snacks', sBudget, s.id) : null;

  return {
    primary: [
      { meal_type: 'Breakfast', recipe: b },
      { meal_type: 'Lunch',     recipe: l },
      { meal_type: 'Dinner',    recipe: d },
      { meal_type: 'Snack',     recipe: s },
    ],
    alternatives: [
      { meal_type: 'Breakfast', recipe: bAlt },
      { meal_type: 'Lunch',     recipe: lAlt },
      { meal_type: 'Dinner',    recipe: dAlt },
      { meal_type: 'Snack',     recipe: sAlt },
    ],
  };
}

function seedSchedule({ cals, title, desc }) {
  const existing = db.query('SELECT id FROM meal_schedules WHERE title = ?', [title]).rows[0];
  if (existing) {
    // Clean regenerate to apply serving_qty scaling fix
    const entries = db.query('SELECT meal_plan_id FROM meal_schedule_entries WHERE schedule_id = ?', [existing.id]).rows;
    for (const e of entries) {
      db.query('DELETE FROM meal_plan_items WHERE meal_plan_id = ?', [e.meal_plan_id]);
      db.query('DELETE FROM meal_plans WHERE id = ?', [e.meal_plan_id]);
    }
    db.query('DELETE FROM meal_schedule_entries WHERE schedule_id = ?', [existing.id]);
    db.query('DELETE FROM meal_schedules WHERE id = ?', [existing.id]);
    console.log(`  regen ${title} (was id=${existing.id})`);
  }

  // Create the schedule wrapper
  const sched = db.query(
    `INSERT INTO meal_schedules
      (coach_id, title, description, category, schedule_type, duration_weeks, repeating,
       calorie_target_min, calorie_target_max)
     VALUES (?, ?, ?, 'calorie-targeted', 'weekly', 1, 1, ?, ?) RETURNING id`,
    [COACH_ID, title, desc, cals - 50, cals + 50],
  ).rows[0];

  const scheduleId = sched.id;
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  let rollupRow = 0;
  for (let i = 0; i < 7; i++) {
    const day = buildDay(cals);

    // Create meal_plan shell first (target_* will be recomputed after items inserted)
    const plan = db.query(
      `INSERT INTO meal_plans
        (coach_id, title, description, category, target_calories, target_protein, target_fat, target_carbs)
       VALUES (?, ?, ?, 'calorie-targeted', 0, 0, 0, 0) RETURNING id`,
      [COACH_ID, dayNames[i], `${dayNames[i]} - ${cals} kcal`],
    ).rows[0];

    const planId = plan.id;

    // If naive picks undershoot target, scale serving_qty proportionally on mains
    // (clamped to [1, 1.8] so dinner never goes more than 1.8×).
    const rawTotal = day.primary.reduce((a, x) => a + (x.recipe?.calories || 0), 0);
    const scaleFactor = rawTotal > 0 ? Math.min(1.8, Math.max(1, cals / rawTotal)) : 1;

    // Insert primary items (alternative_group = 0)
    let sort = 0;
    for (const p of day.primary) {
      if (!p.recipe) continue;
      // Scale breakfast/lunch/dinner by the same factor; leave snacks at 1×
      // so the total lands on target without making snacks look weird.
      const qty = p.meal_type === 'Snack' ? 1 : scaleFactor;
      db.query(
        `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, serving_qty)
         VALUES (?, ?, ?, 0, ?, ?)`,
        [planId, p.meal_type, sort++, p.recipe.id, qty],
      );
    }
    // Insert alternatives — one group per meal_type (group 1 = breakfast alt, 2 = lunch alt, etc.)
    let altGroup = 1;
    for (const a of day.alternatives) {
      if (!a.recipe) { altGroup++; continue; }
      db.query(
        `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, serving_qty)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [planId, a.meal_type, sort++, altGroup++, a.recipe.id],
      );
    }

    // Recompute plan macro rollup from actual items × serving_qty (primary slots only)
    const rollup = db.query(
      `SELECT
        COALESCE(SUM(r.calories * COALESCE(mpi.serving_qty, 1)), 0) AS cals,
        COALESCE(SUM(r.protein  * COALESCE(mpi.serving_qty, 1)), 0) AS prot,
        COALESCE(SUM(r.fat      * COALESCE(mpi.serving_qty, 1)), 0) AS fat,
        COALESCE(SUM(r.carbs    * COALESCE(mpi.serving_qty, 1)), 0) AS carbs
       FROM meal_plan_items mpi
       LEFT JOIN recipes r ON r.id = mpi.recipe_id
       WHERE mpi.meal_plan_id = ? AND mpi.alternative_group = 0`,
      [planId],
    ).rows[0];

    db.query(
      'UPDATE meal_plans SET target_calories = ?, target_protein = ?, target_fat = ?, target_carbs = ? WHERE id = ?',
      [Math.round(rollup.cals), Math.round(rollup.prot), Math.round(rollup.fat), Math.round(rollup.carbs), planId],
    );

    // Link plan → schedule via entries
    db.query(
      `INSERT INTO meal_schedule_entries (schedule_id, week_number, day_number, meal_plan_id)
       VALUES (?, 1, ?, ?)`,
      [scheduleId, i + 1, planId],
    );
    rollupRow += rollup.cals;
  }
  const avg = Math.round(rollupRow / 7);
  console.log(`  seed  ${title} (id=${scheduleId}) — avg ${avg} kcal/day`);
}

console.log('Seeding calorie-targeted meal schedules...');
for (const t of TARGETS) seedSchedule(t);
console.log('Done.');
process.exit(0);
