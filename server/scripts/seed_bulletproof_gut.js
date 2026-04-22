// Seeds the "Advanced Bulletproof Gut" 12-week schedule using the gut-healing
// recipe cluster (ids ~240-260). One unique week of 7 days, then referenced
// across all 12 weeks via meal_schedule_entries.
//
// Each meal slot gets 1 primary + 1 OR alternative to demonstrate the
// alternative_group feature and give clients flexibility.
//
// Idempotent: drops and regenerates on re-run.
//
// Run: node scripts/seed_bulletproof_gut.js

import db from '../src/db/pool.js';

const COACH_ID = 2;
const TITLE = 'Advanced Bulletproof Gut';
const DESC = '12-week gut-healing protocol built around low-FODMAP, anti-inflammatory meals with protein-rich breakfasts and collagen-supporting snacks.';
const WEEKS = 12;

// 7-day template. Each day: { Breakfast: [primary, alt], Lunch: [p,a], Dinner: [p,a], Snack: [p,a] }
// IDs come from the 240-260 gut cluster.
const WEEK = [
  { // Monday
    Breakfast: [242, 244], // Egg White Omelet / Buckwheat Pancakes
    Lunch:     [245, 260], // BLT Wraps / Detox Salad
    Dinner:    [250, 248], // Miso Salmon / Chicken Madras
    Snack:     [252, 253], // Coconut Custard / Poppy Seed Muffin
  },
  { // Tuesday
    Breakfast: [254, 257], // Antioxidant Smoothie / Protein Smoothie
    Lunch:     [247, 259], // Grilled Chicken Grapefruit / Superfood Tahini
    Dinner:    [246, 251], // Pesto Noodles / Chicken Nuggets
    Snack:     [241, 249], // Egg White Clouds / Curry Potatoes
  },
  { // Wednesday
    Breakfast: [244, 242], // Buckwheat Pancakes / Egg White Omelet
    Lunch:     [260, 245], // Detox Salad / BLT Wraps
    Dinner:    [248, 250], // Chicken Madras / Miso Salmon
    Snack:     [240, 252], // Cottage Cheese Parfait / Coconut Custard
  },
  { // Thursday
    Breakfast: [255, 258], // Mango Smoothie / Raw Beet Smoothie
    Lunch:     [259, 247], // Superfood Tahini / Grilled Chicken Grapefruit
    Dinner:    [251, 246], // Chicken Nuggets / Pesto Noodles
    Snack:     [253, 241], // Poppy Seed Muffin / Egg White Clouds
  },
  { // Friday
    Breakfast: [242, 243], // Egg White Omelet / Herby Sausages
    Lunch:     [245, 260], // BLT Wraps / Detox Salad
    Dinner:    [250, 248], // Miso Salmon / Chicken Madras
    Snack:     [249, 252], // Curry Potatoes / Coconut Custard
  },
  { // Saturday
    Breakfast: [256, 254], // Green Power / Antioxidant
    Lunch:     [247, 259], // Grilled Chicken Grapefruit / Superfood Tahini
    Dinner:    [246, 251], // Pesto Noodles / Chicken Nuggets
    Snack:     [240, 253], // Cottage Cheese Parfait / Poppy Seed Muffin
  },
  { // Sunday
    Breakfast: [244, 257], // Buckwheat Pancakes / Protein Smoothie
    Lunch:     [260, 245], // Detox Salad / BLT Wraps
    Dinner:    [248, 250], // Chicken Madras / Miso Salmon
    Snack:     [252, 241], // Coconut Custard / Egg White Clouds
  },
];

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function verifyRecipes() {
  const allIds = new Set();
  for (const day of WEEK) {
    for (const meal of MEAL_ORDER) {
      for (const id of day[meal]) allIds.add(id);
    }
  }
  const rows = db.query(
    `SELECT id, title FROM recipes WHERE id IN (${[...allIds].join(',')})`,
    [],
  ).rows;
  const found = new Set(rows.map(r => r.id));
  const missing = [...allIds].filter(id => !found.has(id));
  if (missing.length) {
    console.error('Missing recipe ids:', missing);
    process.exit(1);
  }
  console.log(`  verified ${allIds.size} unique recipes`);
}

function cleanExisting() {
  const existing = db.query('SELECT id FROM meal_schedules WHERE title = ?', [TITLE]).rows[0];
  if (!existing) return;
  const entries = db.query('SELECT DISTINCT meal_plan_id FROM meal_schedule_entries WHERE schedule_id = ?', [existing.id]).rows;
  for (const e of entries) {
    db.query('DELETE FROM meal_plan_items WHERE meal_plan_id = ?', [e.meal_plan_id]);
    db.query('DELETE FROM meal_plans WHERE id = ?', [e.meal_plan_id]);
  }
  db.query('DELETE FROM meal_schedule_entries WHERE schedule_id = ?', [existing.id]);
  db.query('DELETE FROM meal_schedules WHERE id = ?', [existing.id]);
  console.log(`  regen (was id=${existing.id})`);
}

function seed() {
  verifyRecipes();
  cleanExisting();

  // Create schedule wrapper
  const sched = db.query(
    `INSERT INTO meal_schedules
      (coach_id, title, description, category, schedule_type, duration_weeks, repeating,
       calorie_target_min, calorie_target_max)
     VALUES (?, ?, ?, 'gut-healing', 'progressive', ?, 0, 1400, 1800) RETURNING id`,
    [COACH_ID, TITLE, DESC, WEEKS],
  ).rows[0];
  const scheduleId = sched.id;

  // Create 7 unique meal_plans (one per day)
  const dayPlanIds = [];
  for (let i = 0; i < 7; i++) {
    const day = WEEK[i];

    const plan = db.query(
      `INSERT INTO meal_plans
        (coach_id, title, description, category, target_calories, target_protein, target_fat, target_carbs)
       VALUES (?, ?, ?, 'gut-healing', 0, 0, 0, 0) RETURNING id`,
      [COACH_ID, DAY_NAMES[i], `${DAY_NAMES[i]} - Advanced Bulletproof Gut`],
    ).rows[0];
    const planId = plan.id;
    dayPlanIds.push(planId);

    // Insert items: primary (alternative_group 0) and one alt per slot (group 1-4)
    let sort = 0;
    let altGroup = 1;
    for (const meal of MEAL_ORDER) {
      const [primaryId, altId] = day[meal];
      // Primary
      db.query(
        `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, serving_qty)
         VALUES (?, ?, ?, 0, ?, 1)`,
        [planId, meal, sort++, primaryId],
      );
      // Alternative
      db.query(
        `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, serving_qty)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [planId, meal, sort++, altGroup++, altId],
      );
    }

    // Recompute plan rollup from primary slots
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
  }

  // Reference the 7 plans across all 12 weeks via entries
  for (let w = 1; w <= WEEKS; w++) {
    for (let d = 1; d <= 7; d++) {
      db.query(
        `INSERT INTO meal_schedule_entries (schedule_id, week_number, day_number, meal_plan_id)
         VALUES (?, ?, ?, ?)`,
        [scheduleId, w, d, dayPlanIds[d - 1]],
      );
    }
  }

  console.log(`  seed  ${TITLE} (id=${scheduleId}) — ${WEEKS} weeks, 7 unique plans, ${WEEKS * 7} entries`);
}

console.log('Seeding Advanced Bulletproof Gut schedule...');
seed();
console.log('Done.');
process.exit(0);
