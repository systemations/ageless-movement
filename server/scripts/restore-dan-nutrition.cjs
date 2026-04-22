// One-off restore: re-create Dan's nutrition data (meal plans, meal day
// templates, swap options, nutrition framework) after the training block
// was wiped. Creates a shell training_block row to hold the FK references.
//
// Safe to run multiple times — clears Dan's nutrition rows first.
// Usage: node scripts/restore-dan-nutrition.cjs

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DAN_USER_ID = 1;
const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');
const DATA_DIR = path.join(__dirname, '..', 'import-data', 'dan-block-2026-04');
const PROGRAM_JSON = path.join(DATA_DIR, 'Dan_12wk_Program.json');
const MEAL_JSON = path.join(DATA_DIR, 'Dan_12wk_MealPlan.json');

function main() {
  const prog = JSON.parse(fs.readFileSync(PROGRAM_JSON, 'utf-8'));
  const meal = JSON.parse(fs.readFileSync(MEAL_JSON, 'utf-8'));
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const tx = db.transaction(() => {
    // Clear any existing block + nutrition rows for Dan so the restore is idempotent.
    const existingBlocks = db.prepare('SELECT id FROM training_blocks WHERE user_id = ?').all(DAN_USER_ID).map(r => r.id);
    for (const bid of existingBlocks) {
      db.prepare('DELETE FROM phase_calorie_targets WHERE block_phase_id IN (SELECT id FROM block_phases WHERE block_id = ?)').run(bid);
      for (const t of ['weekly_schedule','block_phases','scan_schedule','bloods_schedule','nutrition_frameworks','weekly_meal_plans','meal_day_templates','swap_options']) {
        db.prepare(`DELETE FROM ${t} WHERE block_id = ?`).run(bid);
      }
    }
    db.prepare('DELETE FROM training_blocks WHERE user_id = ?').run(DAN_USER_ID);

    // Create a new shell block. program_id references the AMS ReBuild program
    // if currently enrolled, else falls back to any existing program (nullable).
    const current = db.prepare('SELECT program_id FROM client_programs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1').get(DAN_USER_ID);
    const programId = current?.program_id || prog.block?.program_id || null;
    const block = prog.block;
    const blockResult = db.prepare(`
      INSERT INTO training_blocks (user_id, program_id, name, start_date, end_date, duration_weeks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(DAN_USER_ID, programId, block.name, block.start_date, block.end_date, block.duration_weeks);
    const blockId = blockResult.lastInsertRowid;
    console.log(`shell training_block id=${blockId}, program_id=${programId}`);

    // Nutrition framework
    const nf = prog.nutrition_framework;
    db.prepare(`
      INSERT INTO nutrition_frameworks (user_id, block_id, style, constraints, daily_macros,
                                        protein_per_kg, hydration_l_min, electrolytes, alcohol_policy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      DAN_USER_ID, blockId,
      nf.dietary_frame,
      JSON.stringify(nf.dietary_constraints),
      JSON.stringify(nf.daily_macros),
      JSON.stringify(nf.protein_per_kg_bodyweight),
      nf.hydration_l_min,
      JSON.stringify({ sodium_g: nf.sodium_g_per_day, potassium_g: nf.potassium_g_per_day }),
      nf.alcohol_policy
    );

    // Meal day templates
    const insertMealDay = db.prepare(`
      INSERT INTO meal_day_templates (block_id, day_type, kcal_target, protein_g_target, meals)
      VALUES (?, ?, ?, ?, ?)
    `);
    let mealDays = 0;
    for (const [dayType, dayData] of Object.entries(meal.meal_schedule_by_day_type)) {
      insertMealDay.run(blockId, dayType, dayData.kcal_target, dayData.protein_g_target, JSON.stringify(dayData.meals));
      mealDays++;
    }
    console.log(`meal_day_templates: ${mealDays}`);

    // Weekly meal plans
    const insertWeeklyMeal = db.prepare(`
      INSERT INTO weekly_meal_plans (block_id, week_number, phase_ref, rotation, meat_focus,
                                     fish_days, liver_day, kcal_adjustment, honey_pre_lift_g,
                                     notes, shopping_list)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const wk of meal.weekly_meal_plan_12_weeks) {
      insertWeeklyMeal.run(
        blockId, wk.week, wk.phase, wk.rotation,
        wk.meat_focus ? JSON.stringify(wk.meat_focus) : null,
        wk.fish_days ? JSON.stringify(wk.fish_days) : null,
        wk.liver_day || null,
        wk.kcal_adjustment || 0,
        wk.honey_pre_lift_g || null,
        wk.notes || null,
        wk.shopping_list ? JSON.stringify(wk.shopping_list) : null
      );
    }
    console.log(`weekly_meal_plans: ${meal.weekly_meal_plan_12_weeks.length}`);

    // Swap options
    const insertSwap = db.prepare(`INSERT INTO swap_options (block_id, original_item, replacements) VALUES (?, ?, ?)`);
    let swaps = 0;
    for (const [original, replacements] of Object.entries(meal.default_swap_options)) {
      const replArray = Array.isArray(replacements) ? replacements : [replacements];
      insertSwap.run(blockId, original, JSON.stringify(replArray));
      swaps++;
    }
    console.log(`swap_options: ${swaps}`);
  });

  tx();
  console.log('done');
  db.close();
}

main();
