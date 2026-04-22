// Re-assign Dan's Hybrid Recomp program + rebuild his training block
// (workouts-side data: block_phases, phase_calorie_targets, weekly_schedule,
// scan_schedule, bloods_schedule). Keeps nutrition tables intact.
//
// Idempotent. Safe to re-run. Usage:
//   node scripts/restore-dan-program.cjs

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DAN_USER_ID = 1;
const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');
const PROGRAM_JSON = path.join(__dirname, '..', 'import-data', 'dan-block-2026-04', 'Dan_12wk_Program.json');
const MEAL_JSON = path.join(__dirname, '..', 'import-data', 'dan-block-2026-04', 'Dan_12wk_MealPlan.json');

// Match session_ref → program 43 workout.title substring
const REF_TO_TITLE = {
  upper_power_handstand:    'Upper Power + Handstand',
  pickleball_social:        'Pickleball',
  zone2_run:                'Zone 2 Run',
  squat_day:                'Squat Day + Lower',
  upper_push_pull_rings:    'Upper Push/Pull + Rings',
  deadlift_day:             'Deadlift Day + Posterior',
  street_session:           'Street Session',
  mobility_reset_plus_sauna:'Sunday Mobility',
};

function main() {
  const prog = JSON.parse(fs.readFileSync(PROGRAM_JSON, 'utf-8'));
  const meal = JSON.parse(fs.readFileSync(MEAL_JSON, 'utf-8'));
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const PROGRAM_ID = db.prepare("SELECT id FROM programs WHERE title LIKE '%Hybrid Recomp%' ORDER BY id LIMIT 1").get()?.id;
  if (!PROGRAM_ID) throw new Error('Hybrid Recomp program not found in DB');

  const tx = db.transaction(() => {
    // ── Client enrollment: swap to Hybrid Recomp ──
    db.prepare('DELETE FROM client_programs WHERE user_id = ?').run(DAN_USER_ID);
    const totalWorkouts = db.prepare('SELECT COUNT(*) as c FROM workouts WHERE program_id = ?').get(PROGRAM_ID).c;
    db.prepare(`
      INSERT INTO client_programs (user_id, program_id, current_week, current_day, started_at, completed_workouts, total_workouts)
      VALUES (?, ?, 1, 1, ?, 0, ?)
    `).run(DAN_USER_ID, PROGRAM_ID, prog.block.start_date, totalWorkouts);

    // ── Wipe existing block + workout-side cascades ──
    const existingBlocks = db.prepare('SELECT id FROM training_blocks WHERE user_id = ?').all(DAN_USER_ID).map(r => r.id);
    for (const bid of existingBlocks) {
      db.prepare('DELETE FROM phase_calorie_targets WHERE block_phase_id IN (SELECT id FROM block_phases WHERE block_id = ?)').run(bid);
      for (const t of ['weekly_schedule','block_phases','scan_schedule','bloods_schedule','nutrition_frameworks','weekly_meal_plans','meal_day_templates','swap_options']) {
        db.prepare(`DELETE FROM ${t} WHERE block_id = ?`).run(bid);
      }
    }
    db.prepare('DELETE FROM training_blocks WHERE user_id = ?').run(DAN_USER_ID);

    // ── Fresh block ──
    const blockResult = db.prepare(`
      INSERT INTO training_blocks (user_id, program_id, name, start_date, end_date, duration_weeks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(DAN_USER_ID, PROGRAM_ID, prog.block.name, prog.block.start_date, prog.block.end_date, prog.block.duration_weeks);
    const blockId = blockResult.lastInsertRowid;
    console.log(`training_block id=${blockId} program_id=${PROGRAM_ID}`);

    // ── Block phases + phase_calorie_targets ──
    const insertBP = db.prepare(`
      INSERT INTO block_phases (block_id, phase_id, name, weeks, theme, intensity_pct_min, intensity_pct_max,
                                volume_rating, plyo_allowance, progression_notes, scan_required, bloods_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const bpIdByKey = {};
    for (const phase of prog.phases) {
      const [lo, hi] = phase.intensity_pct_range || [null, null];
      const r = insertBP.run(
        blockId, null, phase.name, JSON.stringify(phase.weeks), phase.theme,
        lo, hi, phase.volume_rating || null, phase.plyo_allowance || null,
        phase.progression_notes || null, phase.scan_required || null, phase.bloods_required ? 1 : 0
      );
      bpIdByKey[phase.id] = r.lastInsertRowid;
    }
    console.log(`block_phases: ${prog.phases.length}`);

    const insertPCT = db.prepare('INSERT INTO phase_calorie_targets (block_phase_id, training_day_kcal, rest_day_kcal) VALUES (?, ?, ?)');
    let pctCount = 0;
    for (const [key, targets] of Object.entries(meal.daily_calorie_targets_by_phase || {})) {
      const bpId = bpIdByKey[key];
      if (!bpId) continue;
      insertPCT.run(bpId, targets.training_day_kcal, targets.rest_day_kcal);
      pctCount++;
    }
    console.log(`phase_calorie_targets: ${pctCount}`);

    // ── weekly_schedule: map session_refs to existing program 43 workouts ──
    const buildWorkoutMap = () => {
      const rows = db.prepare(`SELECT id, title FROM workouts WHERE program_id = ? AND week_number = 1`).all(PROGRAM_ID);
      const out = {};
      for (const [ref, titleFragment] of Object.entries(REF_TO_TITLE)) {
        const hit = rows.find(r => r.title.toLowerCase().includes(titleFragment.toLowerCase()));
        if (hit) out[ref] = hit.id;
        else console.warn(`  no workout match for session_ref=${ref} (looking for "${titleFragment}")`);
      }
      return out;
    };
    const refToId = buildWorkoutMap();

    const insertWS = db.prepare(`
      INSERT INTO weekly_schedule (block_id, day_of_week, time_slot, session_type, session_ref, workout_id, duration_min)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let wsCount = 0;
    for (const [day, slots] of Object.entries(prog.weekly_schedule_template)) {
      for (const slot of slots) {
        insertWS.run(blockId, day, slot.time, slot.type, slot.session_ref, refToId[slot.session_ref] || null, slot.duration_min);
        wsCount++;
      }
    }
    console.log(`weekly_schedule: ${wsCount}`);

    // ── scan_schedule + bloods_schedule ──
    const insertScan = db.prepare('INSERT INTO scan_schedule (block_id, week_number, scan_type, status, rule) VALUES (?, ?, ?, ?, ?)');
    for (const s of (prog.scan_schedule || [])) {
      insertScan.run(blockId, s.week, s.scan_type || null, s.status || null, s.rule || null);
    }
    const insertBloods = db.prepare('INSERT INTO bloods_schedule (block_id, week_number, panel, cadence) VALUES (?, ?, ?, ?)');
    for (const b of (prog.bloods_schedule || [])) {
      insertBloods.run(blockId, b.week || null, JSON.stringify(b.panel || null), b.cadence || null);
    }

    // ── Nutrition tables (restore) ──
    const nf = prog.nutrition_framework;
    db.prepare(`
      INSERT INTO nutrition_frameworks (user_id, block_id, style, constraints, daily_macros,
                                        protein_per_kg, hydration_l_min, electrolytes, alcohol_policy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      DAN_USER_ID, blockId, nf.dietary_frame,
      JSON.stringify(nf.dietary_constraints), JSON.stringify(nf.daily_macros),
      JSON.stringify(nf.protein_per_kg_bodyweight), nf.hydration_l_min,
      JSON.stringify({ sodium_g: nf.sodium_g_per_day, potassium_g: nf.potassium_g_per_day }),
      nf.alcohol_policy
    );

    const insertMealDay = db.prepare('INSERT INTO meal_day_templates (block_id, day_type, kcal_target, protein_g_target, meals) VALUES (?, ?, ?, ?, ?)');
    for (const [dayType, d] of Object.entries(meal.meal_schedule_by_day_type)) {
      insertMealDay.run(blockId, dayType, d.kcal_target, d.protein_g_target, JSON.stringify(d.meals));
    }
    const insertWMP = db.prepare(`
      INSERT INTO weekly_meal_plans (block_id, week_number, phase_ref, rotation, meat_focus, fish_days,
                                     liver_day, kcal_adjustment, honey_pre_lift_g, notes, shopping_list)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const wk of meal.weekly_meal_plan_12_weeks) {
      insertWMP.run(
        blockId, wk.week, wk.phase, wk.rotation,
        wk.meat_focus ? JSON.stringify(wk.meat_focus) : null,
        wk.fish_days ? JSON.stringify(wk.fish_days) : null,
        wk.liver_day || null, wk.kcal_adjustment || 0, wk.honey_pre_lift_g || null,
        wk.notes || null, wk.shopping_list ? JSON.stringify(wk.shopping_list) : null
      );
    }
    const insertSwap = db.prepare('INSERT INTO swap_options (block_id, original_item, replacements) VALUES (?, ?, ?)');
    for (const [orig, reps] of Object.entries(meal.default_swap_options || {})) {
      insertSwap.run(blockId, orig, JSON.stringify(Array.isArray(reps) ? reps : [reps]));
    }
    console.log('nutrition tables restored');
  });

  tx();
  console.log('done');
  db.close();
}

main();
