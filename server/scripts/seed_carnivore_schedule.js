// Seeds the "Carnivore Diet | 2200-2400 Calories" 12-month schedule.
//
// Based on Dan's personal carnivore protocol. Every day is the same
// "Carnivore Day" meal plan which lists atomic ingredient-recipes as
// primary items plus multiple OR alternatives per meal slot. Clients
// tick whichever option they actually ate and can swap alternatives
// for more or different portions.
//
// Step 1: Create atomic carnivore ingredient-recipes if missing.
// Step 2: Build the Carnivore Day meal plan (Early Morning / Breakfast
//         / Mid Morning / Lunch / Dinner) with primary stack + alts.
// Step 3: Create the 52-week schedule and insert 364 entries all
//         pointing at the one meal plan.
//
// Idempotent: drops and regenerates on re-run.
//
// Run: node scripts/seed_carnivore_schedule.js

import db from '../src/db/pool.js';

const COACH_ID = 2;
const SCHEDULE_TITLE = 'Carnivore Diet | 2200-2400 Calories';
const WEEKS = 52;
const DAYS_PER_WEEK = 7;

// Three day variants rotate across the week. Dan's original protocol
// anchors a different primary protein on each day — Beef, Chicken, Salmon.
// Every slot lists the remaining proteins as OR alternatives so the client
// can swap based on what they actually ate.
const PLAN_TITLES = {
  beef:    'Carnivore Day · Beef',
  chicken: 'Carnivore Day · Chicken',
  salmon:  'Carnivore Day · Salmon',
};

// Weekly rotation (Mon → Sun): Beef, Chicken, Salmon, Beef, Chicken, Salmon, Beef
const WEEK_ROTATION = ['beef', 'chicken', 'salmon', 'beef', 'chicken', 'salmon', 'beef'];

// Atomic carnivore recipes ----------------------------------------------------
const CARN_RECIPES = [
  { title: 'Coffee (Homemade) 5g',             category: 'Beverages',   calories: 2,   protein: 0.1,  fat: 0,   carbs: 0.2 },
  { title: 'Salted Butter 20g',                category: 'Fats',        calories: 144, protein: 0.2,  fat: 16,  carbs: 0   },
  { title: 'Collagen Hydrolysate 40g',         category: 'Supplements', calories: 144, protein: 36,   fat: 0,   carbs: 0   },
  { title: '1 tsp Honey',                      category: 'Sweeteners',  calories: 20,  protein: 0,    fat: 0,   carbs: 5.4 },
  { title: 'Eggs (2 large, 100g)',             category: 'Proteins',    calories: 151, protein: 12.6, fat: 11,  carbs: 1.1 },
  { title: 'Beef Mince (Organic) 200g',        category: 'Proteins',    calories: 378, protein: 36,   fat: 26,  carbs: 0 },
  { title: 'Chicken Mince (Organic) 200g',     category: 'Proteins',    calories: 340, protein: 40,   fat: 20,  carbs: 0 },
  { title: 'Lamb Mince (Organic) 200g',        category: 'Proteins',    calories: 522, protein: 34,   fat: 42,  carbs: 0 },
  { title: 'Pork Mince (Organic) 200g',        category: 'Proteins',    calories: 514, protein: 34,   fat: 42,  carbs: 0 },
  { title: 'Turkey Mince (Organic) 200g',      category: 'Proteins',    calories: 280, protein: 42,   fat: 12,  carbs: 0 },
  { title: 'Rib Eye Fillet (Organic) 200g',    category: 'Proteins',    calories: 548, protein: 44,   fat: 42,  carbs: 0 },
  { title: 'Porterhouse Steak (Organic) 200g', category: 'Proteins',    calories: 348, protein: 52,   fat: 16,  carbs: 0 },
  { title: 'Scotch Steak (Organic) 200g',      category: 'Proteins',    calories: 566, protein: 42,   fat: 44,  carbs: 0 },
  { title: 'Sirloin Steak (Organic) 200g',     category: 'Proteins',    calories: 449, protein: 52,   fat: 26,  carbs: 0 },
  { title: 'Pork Chops (Organic) 200g',        category: 'Proteins',    calories: 376, protein: 44,   fat: 22,  carbs: 0 },
  { title: 'Lamb Chump Chops (Organic) 200g',  category: 'Proteins',    calories: 380, protein: 40,   fat: 24,  carbs: 0 },
  { title: 'Chicken Thighs (Organic) 200g',    category: 'Proteins',    calories: 484, protein: 38,   fat: 36,  carbs: 0 },
  { title: 'Salmon (Wild Caught) 200g',        category: 'Proteins',    calories: 272, protein: 40,   fat: 12,  carbs: 0 },
  { title: 'Beef Bone Broth 200g',             category: 'Broths',      calories: 43,  protein: 10,   fat: 0,   carbs: 0 },
];

function ensureRecipe(r) {
  const existing = db.query('SELECT id FROM recipes WHERE title = ?', [r.title]).rows[0];
  if (existing) return existing.id;
  const inserted = db.query(
    `INSERT INTO recipes (title, description, category, calories, protein, fat, carbs, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      r.title,
      `Carnivore protocol ingredient. ${r.title}.`,
      r.category,
      r.calories, r.protein, r.fat, r.carbs,
      JSON.stringify(['carnivore', 'whole-food']),
    ],
  ).rows[0];
  return inserted.id;
}

// Day template factory -------------------------------------------------------
// Each variant anchors a different primary protein for breakfast/lunch/dinner.
// The full list of proteins appears as alternatives in every slot — only the
// primary differs, so a Chicken Day isn't "all chicken", it just defaults to
// chicken thighs and lists every other protein as an OR swap.

const MORNING_STACK = [
  ['Coffee (Homemade) 5g', 1],
  ['Salted Butter 20g', 0.5],         // 10g butter
  ['Collagen Hydrolysate 40g', 0.5],  // 20g collagen
  ['1 tsp Honey', 1],
];

const ALL_PROTEINS = [
  'Beef Mince (Organic) 200g',
  'Chicken Mince (Organic) 200g',
  'Lamb Mince (Organic) 200g',
  'Pork Mince (Organic) 200g',
  'Turkey Mince (Organic) 200g',
  'Rib Eye Fillet (Organic) 200g',
  'Porterhouse Steak (Organic) 200g',
  'Scotch Steak (Organic) 200g',
  'Sirloin Steak (Organic) 200g',
  'Pork Chops (Organic) 200g',
  'Lamb Chump Chops (Organic) 200g',
  'Chicken Thighs (Organic) 200g',
  'Salmon (Wild Caught) 200g',
];

function alternativesExcept(...primaries) {
  const exclude = new Set(primaries);
  return ALL_PROTEINS.filter((p) => !exclude.has(p)).map((p) => [[p, 1]]);
}

// Each variant picks a breakfast / lunch / dinner primary protein.
// Dan's original screenshots show the anchored protein changing per day.
const VARIANTS = {
  beef: {
    breakfast: 'Beef Mince (Organic) 200g',
    lunch:     'Scotch Steak (Organic) 200g',
    dinner:    'Beef Mince (Organic) 200g',
  },
  chicken: {
    breakfast: 'Chicken Thighs (Organic) 200g',
    lunch:     'Chicken Thighs (Organic) 200g',
    dinner:    'Chicken Thighs (Organic) 200g',
  },
  salmon: {
    breakfast: 'Salmon (Wild Caught) 200g',
    lunch:     'Salmon (Wild Caught) 200g',
    dinner:    'Salmon (Wild Caught) 200g',
  },
};

function buildDayTemplate(variantKey) {
  const v = VARIANTS[variantKey];
  return [
    { meal_type: 'Early Morning', primary: MORNING_STACK, alternatives: [] },
    {
      meal_type: 'Breakfast',
      primary: [
        ['Eggs (2 large, 100g)', 1],
        ['Salted Butter 20g', 1],
        [v.breakfast, 1],
      ],
      alternatives: alternativesExcept(v.breakfast),
    },
    { meal_type: 'Mid Morning', primary: MORNING_STACK, alternatives: [] },
    {
      meal_type: 'Lunch',
      primary: [
        ['Eggs (2 large, 100g)', 1],
        ['Salted Butter 20g', 1],
        [v.lunch, 1],
      ],
      alternatives: alternativesExcept(v.lunch),
    },
    {
      meal_type: 'Dinner',
      primary: [
        ['Salted Butter 20g', 1],
        ['Beef Bone Broth 200g', 1],
        [v.dinner, 1],
      ],
      alternatives: alternativesExcept(v.dinner),
    },
  ];
}

function buildPlan(variantKey, recipeIds) {
  const title = PLAN_TITLES[variantKey];
  const template = buildDayTemplate(variantKey);

  // Remove any existing plan with this title
  const oldPlan = db.query('SELECT id FROM meal_plans WHERE title = ?', [title]).rows[0];
  if (oldPlan) {
    db.query('DELETE FROM meal_plan_items WHERE meal_plan_id = ?', [oldPlan.id]);
    db.query('DELETE FROM meal_plans WHERE id = ?', [oldPlan.id]);
  }

  const plan = db.query(
    `INSERT INTO meal_plans (coach_id, title, description, category, target_calories, target_protein, target_fat, target_carbs, tags)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?) RETURNING id`,
    [
      COACH_ID,
      title,
      `Carnivore protocol day template anchored on ${variantKey}. Zero-carb, nose-to-tail. Every meal lists every other protein as an OR alternative you can swap in based on what you actually ate.`,
      'Carnivore',
      JSON.stringify(['carnivore', 'zero-carb', 'nose-to-tail', '75-hard', variantKey]),
    ],
  ).rows[0];
  const planId = plan.id;

  let sort = 0;
  for (const slot of template) {
    for (const [itemTitle, qty] of slot.primary) {
      const rid = recipeIds.get(itemTitle);
      if (!rid) throw new Error(`Missing recipe: ${itemTitle}`);
      db.query(
        `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, serving_qty, serving_unit)
         VALUES (?, ?, ?, 0, ?, ?, 'serving')`,
        [planId, slot.meal_type, sort++, rid, qty],
      );
    }
    slot.alternatives.forEach((altBundle, idx) => {
      const altGroup = idx + 1;
      for (const [itemTitle, qty] of altBundle) {
        const rid = recipeIds.get(itemTitle);
        if (!rid) throw new Error(`Missing recipe: ${itemTitle}`);
        db.query(
          `INSERT INTO meal_plan_items (meal_plan_id, meal_type, sort_order, alternative_group, recipe_id, serving_qty, serving_unit)
           VALUES (?, ?, ?, ?, ?, ?, 'serving')`,
          [planId, slot.meal_type, sort++, altGroup, rid, qty],
        );
      }
    });
  }

  // Roll up macros from primary items only
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

  console.log(`[carnivore] plan ${planId} ${title.padEnd(28)} → ${Math.round(rollup.cals)} kcal, ${Math.round(rollup.prot)}P / ${Math.round(rollup.fat)}F / ${Math.round(rollup.carbs)}C`);
  return planId;
}

async function run() {
  console.log('[carnivore] ensuring atomic recipes...');
  const recipeIds = new Map();
  for (const r of CARN_RECIPES) {
    recipeIds.set(r.title, ensureRecipe(r));
  }
  console.log(`[carnivore] ${recipeIds.size} recipes ready`);

  // Drop old schedule if present
  const oldSched = db.query('SELECT id FROM meal_schedules WHERE title = ?', [SCHEDULE_TITLE]).rows[0];
  if (oldSched) {
    db.query('DELETE FROM meal_schedule_entries WHERE schedule_id = ?', [oldSched.id]);
    db.query('DELETE FROM client_meal_schedules WHERE meal_schedule_id = ?', [oldSched.id]);
    db.query('DELETE FROM meal_schedules WHERE id = ?', [oldSched.id]);
    console.log(`[carnivore] removed old schedule ${oldSched.id}`);
  }

  // Build all three day plans
  const planIdByKey = {
    beef:    buildPlan('beef', recipeIds),
    chicken: buildPlan('chicken', recipeIds),
    salmon:  buildPlan('salmon', recipeIds),
  };

  // Insert schedule
  const sched = db.query(
    `INSERT INTO meal_schedules (coach_id, title, description, category, schedule_type, duration_weeks, repeating, calorie_target_min, calorie_target_max, protein_target, fat_target, carbs_target)
     VALUES (?, ?, ?, ?, 'weekly', ?, 1, ?, ?, ?, ?, ?) RETURNING id`,
    [
      COACH_ID,
      SCHEDULE_TITLE,
      '12-month carnivore protocol. Three rotating day variants (Beef / Chicken / Salmon) with zero-carb nose-to-tail eating and ample alternatives for every meal. Built for fat-adapted metabolism, gut repair, and body composition goals. Scales 1500-3000 kcal via per-client calorie targets.',
      'Carnivore',
      WEEKS, 2000, 2400, 170, 160, 10,
    ],
  ).rows[0];
  const schedId = sched.id;

  // Rotate Beef / Chicken / Salmon across the 7 days of each week
  let entryCount = 0;
  for (let w = 1; w <= WEEKS; w++) {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      const variant = WEEK_ROTATION[d - 1];
      const planId = planIdByKey[variant];
      db.query(
        `INSERT INTO meal_schedule_entries (schedule_id, week_number, day_number, meal_plan_id)
         VALUES (?, ?, ?, ?)`,
        [schedId, w, d, planId],
      );
      entryCount++;
    }
  }

  console.log(`[carnivore] schedule ${schedId}: ${WEEKS} weeks × ${DAYS_PER_WEEK} days = ${entryCount} entries`);
  console.log(`[carnivore] rotation (Mon→Sun): ${WEEK_ROTATION.join(' · ')}`);
  console.log('[carnivore] ✔ done');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
