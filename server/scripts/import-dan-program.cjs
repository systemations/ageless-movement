/**
 * import-dan-program.cjs
 *
 * Imports Dan's 12-week training program + meal plan into the Ageless Movement
 * SQLite database. Run from the server/ directory:
 *
 *   node scripts/import-dan-program.cjs
 *
 * Prerequisites:
 *   - data/ageless.db must exist with the standard schema
 *   - import-data/dan-block-2026-04/Dan_12wk_Program.json
 *   - import-data/dan-block-2026-04/Dan_12wk_MealPlan.json
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

// ---------------------------------------------------------------------------
// Paths (script runs from server/)
// ---------------------------------------------------------------------------
const DB_PATH      = path.join(__dirname, '..', 'data', 'ageless.db');
const PROGRAM_JSON = path.join(__dirname, '..', 'import-data', 'dan-block-2026-04', 'Dan_12wk_Program.json');
const MEAL_JSON    = path.join(__dirname, '..', 'import-data', 'dan-block-2026-04', 'Dan_12wk_MealPlan.json');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DAN_USER_ID = 1;
const COACH_ID    = 2;

const DAY_MAP = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};

// ---------------------------------------------------------------------------
// Exercise ID mapping: JSON id -> existing DB id (null = insert new)
// ---------------------------------------------------------------------------
const EXERCISE_MAP = {
  // REUSED from existing library
  'back_squat': 41,
  'front_squat': 97,
  'bench_press': 15,
  'hip_thrust': 145,
  'push_press': 590,
  'romanian_dl': 218,
  'copenhagen_plank': 63,
  'cossack_squat': 65,
  'bulgarian_split_squat': 51,
  'horse_stance_squat_hold': 455,
  '9090_goodmorning': 22,
  'ring_row': 449,
  'active_hang_rings': 28,
  'wall_handstand_hold': 125,
  'handstand_wall_walk': 1203,
  'ring_support_hold': 979,
  'jefferson_curl': 282,
  'band_pull_apart': 43,
  'face_pull': 1196,
  'db_y_raise': 61,
  'plate_front_raise': 95,

  // NEW - need to insert
  'trap_bar_dl': null,
  'weighted_pullup': null,
  'spanish_squat_iso': null,
  'achilles_iso': null,
  'nordic_curl': null,
  'reverse_nordic': null,
  'hsr_patellar': null,
  'hsr_biceps': null,
  'calf_hsr': null,
  'tibialis_raise': null,
  'freestanding_hs_attempt': null,
  'landmine_press_half_kneel': null,
  'landmine_explosive_press': null,
  'cable_rotational_chop': null,
  'pallof_press': null,
  'med_ball_chest_pass': null,
  'med_ball_rotational_throw': null,
  'pogo_hops': null,
  'broad_jump': null,
  'depth_jump': null,
  'single_leg_box_jump': null,
  'split_squat_jump': null,
  'lateral_bounds': null,
  'plyo_pushup': null,
  'cuff_er_ir_cable': null,
  'scap_pullup': null,
  'powell_raise': null,
};

// Map source_library -> body_part description (loose mapping for new exercises)
function patternToBodyPart(pattern) {
  const map = {
    hinge: 'Posterior Chain',
    squat: 'Legs, Glutes',
    squat_iso: 'Legs, Glutes',
    iso: 'Calves',
    horizontal_push: 'Chest, Shoulders',
    vertical_pull: 'Back, Biceps',
    vertical_push: 'Shoulders',
    knee_flex_ecc: 'Hamstrings',
    quad_ecc: 'Quadriceps',
    knee_ext: 'Quadriceps',
    elbow_flex_slow: 'Biceps',
    plantar_flex: 'Calves',
    dorsiflex: 'Tibialis',
    adductor_iso: 'Adductors',
    frontal_plane_squat: 'Legs, Adductors',
    split_squat: 'Legs, Glutes',
    scap_decompress: 'Shoulders, Back',
    handstand: 'Shoulders, Core',
    handstand_dynamic: 'Shoulders, Core',
    gymnastic_iso: 'Shoulders, Core',
    spinal_flex: 'Spine, Hamstrings',
    rotational_push: 'Shoulders, Core',
    rotational_push_power: 'Shoulders, Core',
    rotation: 'Core, Obliques',
    anti_rotation: 'Core',
    horizontal_push_power: 'Chest, Shoulders',
    rotation_power: 'Core, Obliques',
    ankle_ssc: 'Calves, Ankles',
    horizontal_jump: 'Legs, Glutes',
    vertical_ssc: 'Legs, Glutes',
    single_leg_jump: 'Legs, Glutes',
    lateral_jump: 'Legs, Adductors',
    shoulder_rotation: 'Rotator Cuff',
    scap_retract: 'Upper Back',
    scap_depression: 'Shoulders, Back',
    external_rotation: 'Rotator Cuff',
    scap_upward: 'Shoulders',
    shoulder_flex: 'Shoulders',
  };
  return map[pattern] || 'Full Body';
}

// Map source_library -> description prefix (since exercises table has no exercise_type col)
function sourceLibraryToDescription(source) {
  const map = {
    tendon: 'Tendon/Rehab exercise',
    plyo: 'Plyometric exercise',
    prehab: 'Prehab exercise',
    power: 'Power exercise',
    barbell_primary: 'Strength exercise',
    dan_calisthenics: 'Calisthenics/Strength exercise',
  };
  return map[source] || 'Strength exercise';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  // Load JSON data
  const prog = JSON.parse(fs.readFileSync(PROGRAM_JSON, 'utf-8'));
  const meal = JSON.parse(fs.readFileSync(MEAL_JSON, 'utf-8'));

  console.log('Loaded program JSON:', PROGRAM_JSON);
  console.log('Loaded meal plan JSON:', MEAL_JSON);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Build a lookup from exercise id -> library entry
  const exLibMap = {};
  for (const ex of prog.exercise_library) {
    exLibMap[ex.id] = ex;
  }

  // -------------------------------------------------------------------
  // Wrap everything in a single transaction
  // -------------------------------------------------------------------
  const runImport = db.transaction(() => {
    // =================================================================
    // STEP 0: Create new tables if they don't exist
    // =================================================================
    console.log('\n--- Creating new tables (if not exist) ---');

    db.exec(`
      CREATE TABLE IF NOT EXISTS athlete_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE REFERENCES users(id),
        dob_approx_age INTEGER,
        height_cm REAL,
        baseline_weight_kg REAL,
        location TEXT,
        goals TEXT,
        genetic_flags TEXT,
        dietary_frame TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS training_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        program_id INTEGER REFERENCES programs(id),
        name TEXT,
        start_date TEXT,
        end_date TEXT,
        duration_weeks INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS block_phases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id) ON DELETE CASCADE,
        phase_id INTEGER REFERENCES program_phases(id),
        name TEXT,
        weeks TEXT,
        theme TEXT,
        intensity_pct_min INTEGER,
        intensity_pct_max INTEGER,
        volume_rating TEXT,
        plyo_allowance TEXT,
        progression_notes TEXT,
        scan_required TEXT,
        bloods_required INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS supplements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        dose TEXT,
        timing TEXT,
        rationale TEXT,
        is_conditional INTEGER DEFAULT 0,
        conditional_trigger TEXT,
        double_on_days TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS wellness_protocols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        category TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS athlete_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        cadence TEXT,
        metric_type TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS athlete_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        cadence TEXT,
        test_type TEXT,
        protocol TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS scan_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id),
        week_number INTEGER,
        scan_type TEXT,
        status TEXT,
        rule TEXT,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS bloods_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id),
        week_number INTEGER,
        panel TEXT,
        cadence TEXT,
        status TEXT DEFAULT 'pending',
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS emergency_protocols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        trigger_name TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tendon_protocols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        cadence TEXT NOT NULL,
        exercises TEXT NOT NULL,
        red_flag_triggers TEXT,
        red_flag_response TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS nutrition_frameworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        block_id INTEGER REFERENCES training_blocks(id),
        style TEXT,
        constraints TEXT,
        daily_macros TEXT,
        protein_per_kg TEXT,
        hydration_l_min REAL,
        electrolytes TEXT,
        alcohol_policy TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS phase_calorie_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_phase_id INTEGER REFERENCES block_phases(id),
        training_day_kcal INTEGER,
        rest_day_kcal INTEGER
      );

      CREATE TABLE IF NOT EXISTS weekly_meal_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id),
        week_number INTEGER,
        phase_ref TEXT,
        rotation TEXT,
        meat_focus TEXT,
        fish_days TEXT,
        liver_day TEXT,
        kcal_adjustment INTEGER DEFAULT 0,
        honey_pre_lift_g INTEGER,
        notes TEXT,
        shopping_list TEXT
      );

      CREATE TABLE IF NOT EXISTS meal_day_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id),
        day_type TEXT NOT NULL,
        kcal_target INTEGER,
        protein_g_target INTEGER,
        meals TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS swap_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id),
        original_item TEXT NOT NULL,
        replacements TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS weekly_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER REFERENCES training_blocks(id),
        day_of_week TEXT NOT NULL,
        time_slot TEXT,
        session_type TEXT,
        session_ref TEXT,
        workout_id INTEGER REFERENCES workouts(id),
        duration_min INTEGER
      );
    `);
    console.log('Tables created/verified.');

    // =================================================================
    // STEP 1: Insert new exercises
    // =================================================================
    console.log('\n--- Inserting new exercises ---');

    const insertExercise = db.prepare(`
      INSERT INTO exercises (name, description, body_part, equipment)
      VALUES (?, ?, ?, ?)
    `);

    let newExCount = 0;
    for (const [jsonId, dbId] of Object.entries(EXERCISE_MAP)) {
      if (dbId !== null) continue; // already mapped

      const libEntry = exLibMap[jsonId];
      if (!libEntry) {
        console.warn(`  WARNING: No library entry for "${jsonId}", skipping.`);
        continue;
      }

      const desc = sourceLibraryToDescription(libEntry.source_library) + '. ' +
                   (libEntry.tendon_category ? `Tendon category: ${libEntry.tendon_category}. ` : '') +
                   `Pattern: ${libEntry.pattern}.`;
      const bodyPart  = patternToBodyPart(libEntry.pattern);
      const equipment = (libEntry.equipment || '').replace(/_/g, ' ');

      const result = insertExercise.run(libEntry.name, desc, bodyPart, equipment);
      EXERCISE_MAP[jsonId] = result.lastInsertRowid;
      newExCount++;
      console.log(`  Inserted exercise: "${libEntry.name}" => ID ${result.lastInsertRowid}`);
    }
    console.log(`Total new exercises inserted: ${newExCount}`);

    // =================================================================
    // STEP 2: Insert program + phases
    // =================================================================
    console.log('\n--- Inserting program ---');

    const programResult = db.prepare(`
      INSERT INTO programs (coach_id, title, duration_weeks, description, workouts_per_week)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      COACH_ID,
      prog.block.name,
      prog.block.duration_weeks,
      'Dan\'s 12-week Hybrid Recomp + Tendon Bulletproofing + Power Introduction block.',
      6
    );
    const programId = programResult.lastInsertRowid;
    console.log(`Program inserted: ID ${programId}, title: "${prog.block.name}"`);

    // Insert 6 phases
    console.log('\n--- Inserting program phases ---');
    const insertPhase = db.prepare(`
      INSERT INTO program_phases (program_id, phase_number, title, weeks)
      VALUES (?, ?, ?, ?)
    `);

    const phaseIdMap = {}; // phase json id -> DB id
    prog.phases.forEach((phase, idx) => {
      const weeksValue = phase.weeks.length; // program_phases.weeks is INTEGER (num weeks)
      const result = insertPhase.run(programId, idx + 1, phase.name, weeksValue);
      phaseIdMap[phase.id] = result.lastInsertRowid;
      console.log(`  Phase ${idx + 1}: "${phase.name}" (weeks: ${phase.weeks.join(',')}) => ID ${result.lastInsertRowid}`);
    });

    // Gym-phase mapping: session templates with phase_variants use phase-1, phase-2, phase-3
    // Deload/test phases share the prior phase's workout at reduced volume (no separate workouts)
    const GYM_PHASE_IDS = ['phase-1', 'phase-2', 'phase-3'];

    // =================================================================
    // STEP 3: Insert workouts + workout_exercises for gym sessions
    // =================================================================
    console.log('\n--- Inserting gym session workouts ---');

    const insertWorkout = db.prepare(`
      INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, duration_mins,
                            workout_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWE = db.prepare(`
      INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps,
                                     duration_secs, rest_secs, group_type, group_label, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWEM = db.prepare(`
      INSERT INTO workout_exercise_meta (workout_exercise_id, tempo, per_side)
      VALUES (?, ?, ?)
    `);

    // Track workout IDs by session_ref + phase for weekly_schedule linking
    const workoutIdLookup = {}; // e.g. { 'squat_day:phase-1': 42, ... }

    let totalWorkouts = 0;
    let totalWE = 0;

    const gymTemplates = prog.session_templates.filter(t => t.phase_variants);

    for (const template of gymTemplates) {
      const dayNum = DAY_MAP[template.day] || 1;

      for (const phaseKey of Object.keys(template.phase_variants)) {
        const phaseDbId = phaseIdMap[phaseKey];
        if (!phaseDbId) {
          console.warn(`  WARNING: No phase ID for "${phaseKey}" in template "${template.id}"`);
          continue;
        }

        // First week of this phase
        const phaseObj = prog.phases.find(p => p.id === phaseKey);
        const firstWeek = phaseObj ? phaseObj.weeks[0] : 1;

        // Phase label for title
        const phaseLabel = phaseKey.replace('phase-', 'Phase ').replace('deload-', 'Deload ').replace('test-week', 'Test Week');
        const title = `${template.label} - ${phaseLabel}`;

        const wkResult = insertWorkout.run(
          programId, phaseDbId, firstWeek, dayNum, title,
          template.duration_min, 'strength', 'published'
        );
        const workoutId = wkResult.lastInsertRowid;
        totalWorkouts++;

        workoutIdLookup[`${template.id}:${phaseKey}`] = workoutId;

        const exercises = template.phase_variants[phaseKey];
        exercises.forEach((ex, idx) => {
          const exerciseDbId = EXERCISE_MAP[ex.exercise_id];
          if (!exerciseDbId) {
            console.warn(`  WARNING: No DB exercise ID for "${ex.exercise_id}"`);
            return;
          }

          const repsStr = ex.reps != null ? String(ex.reps) : null;
          const durationSecs = ex.duration_sec || null;
          const restSecs = ex.rest_sec || null;
          const groupType = ex.pairing || null;
          const groupLabel = ex.block || null;

          // Collect notes: explicit notes + load info
          const notesParts = [];
          if (ex.notes) notesParts.push(ex.notes);
          if (ex.load) notesParts.push(`Load: ${ex.load}`);
          if (ex.load_pct_1rm) notesParts.push(`${ex.load_pct_1rm}% 1RM`);
          const notesStr = notesParts.length ? notesParts.join('; ') : null;

          const weResult = insertWE.run(
            workoutId, exerciseDbId, idx + 1,
            ex.sets || null, repsStr, durationSecs, restSecs,
            groupType, groupLabel, notesStr
          );
          const weId = weResult.lastInsertRowid;
          totalWE++;

          // Meta: tempo + per_side
          const tempo = ex.tempo || null;
          const perSide = (repsStr && (/\/side|\/leg|\/direction/i.test(repsStr))) ? 1 : 0;

          insertWEM.run(weId, tempo, perSide);
        });

        console.log(`  Workout: "${title}" => ID ${workoutId} (${exercises.length} exercises)`);
      }
    }
    console.log(`Total gym workouts inserted: ${totalWorkouts}, total workout_exercises: ${totalWE}`);

    // =================================================================
    // STEP 4: Insert non-gym sessions
    // =================================================================
    console.log('\n--- Inserting non-gym sessions ---');

    // 4a: Pickleball (sport)
    const pbTemplate = prog.session_templates.find(t => t.id === 'pickleball_social');
    if (pbTemplate) {
      const pbResult = insertWorkout.run(
        programId, null, 1, DAY_MAP[pbTemplate.day],
        pbTemplate.label, pbTemplate.duration_min, 'sport', 'published'
      );
      workoutIdLookup['pickleball_social'] = pbResult.lastInsertRowid;
      console.log(`  Pickleball session => ID ${pbResult.lastInsertRowid}`);
      totalWorkouts++;
    }

    // 4b: Zone 2 Run (cardio)
    const runTemplate = prog.session_templates.find(t => t.id === 'zone2_run');
    if (runTemplate) {
      const runResult = insertWorkout.run(
        programId, null, 1, DAY_MAP[runTemplate.day],
        runTemplate.label, 40, 'cardio', 'published'
      );
      workoutIdLookup['zone2_run'] = runResult.lastInsertRowid;
      console.log(`  Zone 2 Run => ID ${runResult.lastInsertRowid}`);
      totalWorkouts++;
    }

    // 4c: Street Session (circuit) with exercises
    const streetTemplate = prog.session_templates.find(t => t.id === 'street_session');
    if (streetTemplate) {
      const ssResult = insertWorkout.run(
        programId, null, 1, DAY_MAP[streetTemplate.day],
        streetTemplate.label, streetTemplate.duration_min, 'circuit', 'published'
      );
      const ssWorkoutId = ssResult.lastInsertRowid;
      workoutIdLookup['street_session'] = ssWorkoutId;
      totalWorkouts++;

      // Insert template_exercises
      if (streetTemplate.template_exercises) {
        streetTemplate.template_exercises.forEach((ex, idx) => {
          // Street session exercises are generic names, not in EXERCISE_MAP
          // We'll try to find them in the DB by name, or skip exercise_id
          // For now, insert with exercise_id = null (these are ad-hoc exercises)
          // Actually, powell_raise is in the map
          let exId = null;
          if (ex.name === 'Powell Raises') exId = EXERCISE_MAP['powell_raise'];

          const weRes = insertWE.run(
            ssWorkoutId, exId, idx + 1,
            null, // sets (varies by phase)
            String(ex.reps_target), null, null,
            ex.pairing || null, ex.block || null,
            ex.name // store exercise name in notes since many don't have DB entries
          );
          insertWEM.run(weRes.lastInsertRowid, null, /\/side|\/leg/.test(String(ex.reps_target)) ? 1 : 0);
          totalWE++;
        });
      }
      console.log(`  Street Session => ID ${ssWorkoutId} (${streetTemplate.template_exercises?.length || 0} exercises)`);
    }

    // 4d: Mobility Reset + Sauna (recovery)
    const mobTemplate = prog.session_templates.find(t => t.id === 'mobility_reset_plus_sauna');
    if (mobTemplate) {
      const mobResult = insertWorkout.run(
        programId, null, 1, DAY_MAP[mobTemplate.day],
        mobTemplate.label, mobTemplate.duration_min, 'recovery', 'published'
      );
      const mobWorkoutId = mobResult.lastInsertRowid;
      workoutIdLookup['mobility_reset_plus_sauna'] = mobWorkoutId;
      totalWorkouts++;

      // Insert components as workout_exercises
      if (mobTemplate.components) {
        mobTemplate.components.forEach((comp, idx) => {
          const durationSecs = comp.duration_sec || (comp.duration_min ? comp.duration_min * 60 : null);
          const repsStr = comp.reps ? String(comp.reps) : null;
          const notesParts = [];
          if (comp.notes) notesParts.push(comp.notes);
          if (comp.temp_c) notesParts.push(`${comp.temp_c}C`);

          const weRes = insertWE.run(
            mobWorkoutId, null, idx + 1,
            comp.sets || null, repsStr, durationSecs, null,
            null, null,
            comp.name + (notesParts.length ? ' - ' + notesParts.join('; ') : '')
          );
          insertWEM.run(weRes.lastInsertRowid, null, /\/side|\/leg|\/direction/.test(repsStr || '') ? 1 : 0);
          totalWE++;
        });
      }
      console.log(`  Mobility Reset => ID ${mobWorkoutId} (${mobTemplate.components?.length || 0} components)`);
    }

    // =================================================================
    // STEP 5: Assign program to Dan
    // =================================================================
    console.log('\n--- Assigning program to Dan ---');
    db.prepare(`
      INSERT INTO client_programs (user_id, program_id, current_week, total_workouts)
      VALUES (?, ?, 1, ?)
    `).run(DAN_USER_ID, programId, totalWorkouts);
    console.log(`  client_programs: user_id=${DAN_USER_ID}, program_id=${programId}, total_workouts=${totalWorkouts}`);

    // =================================================================
    // STEP 7: Insert athlete profile
    // =================================================================
    console.log('\n--- Inserting athlete profile ---');
    const athlete = prog.athlete;
    db.prepare(`
      INSERT OR REPLACE INTO athlete_profiles (user_id, dob_approx_age, height_cm, baseline_weight_kg,
                                    location, goals, genetic_flags, dietary_frame)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      DAN_USER_ID,
      athlete.dob_approx_age,
      athlete.height_cm,
      athlete.baseline_weight_kg,
      athlete.location,
      JSON.stringify(athlete.goals),
      JSON.stringify(athlete.genetic_flags),
      athlete.dietary_frame
    );
    console.log(`  Athlete profile inserted for user_id=${DAN_USER_ID}`);

    // =================================================================
    // STEP 8: Insert training block + block phases
    // =================================================================
    console.log('\n--- Inserting training block ---');
    const block = prog.block;
    const blockResult = db.prepare(`
      INSERT INTO training_blocks (user_id, program_id, name, start_date, end_date, duration_weeks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(DAN_USER_ID, programId, block.name, block.start_date, block.end_date, block.duration_weeks);
    const blockId = blockResult.lastInsertRowid;
    console.log(`  Training block: "${block.name}" => ID ${blockId}`);

    console.log('\n--- Inserting block phases ---');
    const insertBlockPhase = db.prepare(`
      INSERT INTO block_phases (block_id, phase_id, name, weeks, theme, intensity_pct_min,
                                intensity_pct_max, volume_rating, plyo_allowance,
                                progression_notes, scan_required, bloods_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const blockPhaseIdMap = {}; // phase json id -> block_phases DB id
    for (const phase of prog.phases) {
      const phaseDbId = phaseIdMap[phase.id];
      const intensityMin = phase.intensity_pct_range?.[0] || null;
      const intensityMax = phase.intensity_pct_range?.[1] || null;

      const bpResult = insertBlockPhase.run(
        blockId, phaseDbId, phase.name,
        JSON.stringify(phase.weeks),
        phase.theme,
        intensityMin, intensityMax,
        phase.volume_rating || null,
        phase.plyo_allowance || null,
        phase.progression_notes || null,
        phase.scan_required || null,
        phase.bloods_required ? 1 : 0
      );
      blockPhaseIdMap[phase.id] = bpResult.lastInsertRowid;
      console.log(`  Block phase: "${phase.name}" => ID ${bpResult.lastInsertRowid}`);
    }

    // =================================================================
    // STEP 9: Insert supplements
    // =================================================================
    console.log('\n--- Inserting supplements ---');
    const insertSupplement = db.prepare(`
      INSERT INTO supplements (user_id, name, dose, timing, rationale, is_conditional,
                               conditional_trigger, double_on_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let suppCount = 0;
    // Regular supplements
    for (const s of prog.supplements) {
      insertSupplement.run(
        DAN_USER_ID, s.name, s.dose, s.timing, s.rationale, 0, null,
        s.double_on_days ? JSON.stringify(s.double_on_days) : null
      );
      suppCount++;
    }
    // Conditional supplements
    for (const s of prog.supplements_conditional) {
      insertSupplement.run(
        DAN_USER_ID, s.name, s.dose, null, null, 1, s.trigger, null
      );
      suppCount++;
    }
    console.log(`  Supplements inserted: ${suppCount}`);

    // =================================================================
    // STEP 10: Insert tendon protocols
    // =================================================================
    console.log('\n--- Inserting tendon protocols ---');
    const insertTendon = db.prepare(`
      INSERT INTO tendon_protocols (user_id, cadence, exercises, red_flag_triggers, red_flag_response)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tp = prog.tendon_protocol;
    // daily_5min_morning (includes red flags)
    insertTendon.run(
      DAN_USER_ID, 'daily_5min_morning',
      JSON.stringify(tp.daily_5min_morning),
      JSON.stringify(tp.red_flag_triggers),
      tp.red_flag_response
    );
    // thrice_weekly
    insertTendon.run(
      DAN_USER_ID, 'thrice_weekly',
      JSON.stringify(tp.thrice_weekly),
      null, null
    );
    // twice_weekly
    insertTendon.run(
      DAN_USER_ID, 'twice_weekly',
      JSON.stringify(tp.twice_weekly),
      null, null
    );
    console.log('  Tendon protocols inserted: 3');

    // =================================================================
    // STEP 11: Insert wellness protocols
    // =================================================================
    console.log('\n--- Inserting wellness protocols ---');
    const insertWellness = db.prepare(`
      INSERT INTO wellness_protocols (user_id, category, config)
      VALUES (?, ?, ?)
    `);

    for (const wp of prog.wellness_protocols) {
      insertWellness.run(DAN_USER_ID, wp.category, JSON.stringify(wp));
    }
    console.log(`  Wellness protocols inserted: ${prog.wellness_protocols.length}`);

    // =================================================================
    // STEP 12: Insert metrics + tests
    // =================================================================
    console.log('\n--- Inserting metrics ---');
    const insertMetric = db.prepare(`
      INSERT INTO athlete_metrics (user_id, name, cadence, metric_type)
      VALUES (?, ?, ?, ?)
    `);
    for (const m of prog.metrics) {
      insertMetric.run(DAN_USER_ID, m.name, m.cadence, m.type);
    }
    console.log(`  Metrics inserted: ${prog.metrics.length}`);

    console.log('\n--- Inserting tests ---');
    const insertTest = db.prepare(`
      INSERT INTO athlete_tests (user_id, name, cadence, test_type, protocol)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const t of prog.tests) {
      insertTest.run(DAN_USER_ID, t.name, t.cadence, t.type, t.protocol || null);
    }
    console.log(`  Tests inserted: ${prog.tests.length}`);

    // =================================================================
    // STEP 13: Insert scan_schedule + bloods_schedule
    // =================================================================
    console.log('\n--- Inserting scan schedule ---');
    const insertScan = db.prepare(`
      INSERT INTO scan_schedule (block_id, week_number, scan_type, status, rule)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const s of prog.scan_schedule) {
      const status = s.status || 'pending';
      insertScan.run(blockId, s.week, s.scan_type, status, s.rule || null);
    }
    console.log(`  Scan schedule inserted: ${prog.scan_schedule.length}`);

    console.log('\n--- Inserting bloods schedule ---');
    const insertBloods = db.prepare(`
      INSERT INTO bloods_schedule (block_id, week_number, panel, cadence)
      VALUES (?, ?, ?, ?)
    `);
    for (const b of prog.bloods_schedule) {
      insertBloods.run(
        blockId,
        b.week || null,
        JSON.stringify(b.panel),
        b.cadence || null
      );
    }
    console.log(`  Bloods schedule inserted: ${prog.bloods_schedule.length}`);

    // =================================================================
    // STEP 14: Insert emergency protocols
    // =================================================================
    console.log('\n--- Inserting emergency protocols ---');
    const insertEmergency = db.prepare(`
      INSERT INTO emergency_protocols (user_id, trigger_name, action)
      VALUES (?, ?, ?)
    `);
    for (const ep of prog.emergency_protocols) {
      insertEmergency.run(DAN_USER_ID, ep.trigger, ep.action);
    }
    console.log(`  Emergency protocols inserted: ${prog.emergency_protocols.length}`);

    // =================================================================
    // STEP 15: Insert nutrition framework
    // =================================================================
    console.log('\n--- Inserting nutrition framework ---');
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
    console.log('  Nutrition framework inserted.');

    // =================================================================
    // STEP 16: Insert phase calorie targets
    // =================================================================
    console.log('\n--- Inserting phase calorie targets ---');
    const insertCalTarget = db.prepare(`
      INSERT INTO phase_calorie_targets (block_phase_id, training_day_kcal, rest_day_kcal)
      VALUES (?, ?, ?)
    `);
    const calTargets = meal.daily_calorie_targets_by_phase;
    let calCount = 0;
    for (const [phaseKey, targets] of Object.entries(calTargets)) {
      const bpId = blockPhaseIdMap[phaseKey];
      if (!bpId) {
        console.warn(`  WARNING: No block_phase for "${phaseKey}"`);
        continue;
      }
      insertCalTarget.run(bpId, targets.training_day_kcal, targets.rest_day_kcal);
      calCount++;
    }
    console.log(`  Phase calorie targets inserted: ${calCount}`);

    // =================================================================
    // STEP 17: Insert meal day templates
    // =================================================================
    console.log('\n--- Inserting meal day templates ---');
    const insertMealDay = db.prepare(`
      INSERT INTO meal_day_templates (block_id, day_type, kcal_target, protein_g_target, meals)
      VALUES (?, ?, ?, ?, ?)
    `);
    const mealSchedule = meal.meal_schedule_by_day_type;
    let mealDayCount = 0;
    for (const [dayType, dayData] of Object.entries(mealSchedule)) {
      insertMealDay.run(
        blockId, dayType,
        dayData.kcal_target, dayData.protein_g_target,
        JSON.stringify(dayData.meals)
      );
      mealDayCount++;
    }
    console.log(`  Meal day templates inserted: ${mealDayCount}`);

    // =================================================================
    // STEP 18: Insert weekly meal plans (12 rows)
    // =================================================================
    console.log('\n--- Inserting weekly meal plans ---');
    const insertWeeklyMeal = db.prepare(`
      INSERT INTO weekly_meal_plans (block_id, week_number, phase_ref, rotation, meat_focus,
                                     fish_days, liver_day, kcal_adjustment, honey_pre_lift_g,
                                     notes, shopping_list)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const wk of meal.weekly_meal_plan_12_weeks) {
      insertWeeklyMeal.run(
        blockId,
        wk.week,
        wk.phase,
        wk.rotation,
        wk.meat_focus ? JSON.stringify(wk.meat_focus) : null,
        wk.fish_days ? JSON.stringify(wk.fish_days) : null,
        wk.liver_day || null,
        wk.kcal_adjustment || 0,
        wk.honey_pre_lift_g || null,
        wk.notes || null,
        wk.shopping_list ? JSON.stringify(wk.shopping_list) : null
      );
    }
    console.log(`  Weekly meal plans inserted: ${meal.weekly_meal_plan_12_weeks.length}`);

    // =================================================================
    // STEP 19: Insert swap options
    // =================================================================
    console.log('\n--- Inserting swap options ---');
    const insertSwap = db.prepare(`
      INSERT INTO swap_options (block_id, original_item, replacements)
      VALUES (?, ?, ?)
    `);
    const swaps = meal.default_swap_options;
    let swapCount = 0;
    for (const [original, replacements] of Object.entries(swaps)) {
      const replArray = Array.isArray(replacements) ? replacements : [replacements];
      insertSwap.run(blockId, original, JSON.stringify(replArray));
      swapCount++;
    }
    console.log(`  Swap options inserted: ${swapCount}`);

    // =================================================================
    // STEP 20: Insert weekly schedule
    // =================================================================
    console.log('\n--- Inserting weekly schedule ---');
    const insertSchedule = db.prepare(`
      INSERT INTO weekly_schedule (block_id, day_of_week, time_slot, session_type, session_ref,
                                   workout_id, duration_min)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let schedCount = 0;
    for (const [day, slots] of Object.entries(prog.weekly_schedule_template)) {
      for (const slot of slots) {
        // Try to resolve workout_id from our lookup
        let workoutId = null;

        // For gym sessions, link to phase-1 workout as default
        const ref = slot.session_ref;
        if (workoutIdLookup[`${ref}:phase-1`]) {
          workoutId = workoutIdLookup[`${ref}:phase-1`];
        } else if (workoutIdLookup[ref]) {
          workoutId = workoutIdLookup[ref];
        }

        insertSchedule.run(
          blockId, day, slot.time, slot.type, ref, workoutId, slot.duration_min
        );
        schedCount++;
      }
    }
    console.log(`  Weekly schedule entries inserted: ${schedCount}`);

    // =================================================================
    // Return summary for validation
    // =================================================================
    return { programId, blockId, totalWorkouts, totalWE };
  });

  // -------------------------------------------------------------------
  // Execute the transaction
  // -------------------------------------------------------------------
  console.log('\n========================================');
  console.log('Running import transaction...');
  console.log('========================================\n');

  const result = runImport();

  // -------------------------------------------------------------------
  // Validation queries
  // -------------------------------------------------------------------
  console.log('\n========================================');
  console.log('Validation');
  console.log('========================================\n');

  const counts = {
    program: db.prepare('SELECT COUNT(*) as c FROM programs WHERE id = ?').get(result.programId).c,
    phases: db.prepare('SELECT COUNT(*) as c FROM program_phases WHERE program_id = ?').get(result.programId).c,
    workouts: db.prepare('SELECT COUNT(*) as c FROM workouts WHERE program_id = ?').get(result.programId).c,
    workout_exercises: db.prepare(`
      SELECT COUNT(*) as c FROM workout_exercises
      WHERE workout_id IN (SELECT id FROM workouts WHERE program_id = ?)
    `).get(result.programId).c,
    workout_exercise_meta: db.prepare(`
      SELECT COUNT(*) as c FROM workout_exercise_meta
      WHERE workout_exercise_id IN (
        SELECT we.id FROM workout_exercises we
        JOIN workouts w ON w.id = we.workout_id
        WHERE w.program_id = ?
      )
    `).get(result.programId).c,
    client_program: db.prepare('SELECT COUNT(*) as c FROM client_programs WHERE user_id = ? AND program_id = ?').get(DAN_USER_ID, result.programId).c,
    athlete_profile: db.prepare('SELECT COUNT(*) as c FROM athlete_profiles WHERE user_id = ?').get(DAN_USER_ID).c,
    training_block: db.prepare('SELECT COUNT(*) as c FROM training_blocks WHERE id = ?').get(result.blockId).c,
    block_phases: db.prepare('SELECT COUNT(*) as c FROM block_phases WHERE block_id = ?').get(result.blockId).c,
    supplements: db.prepare('SELECT COUNT(*) as c FROM supplements WHERE user_id = ?').get(DAN_USER_ID).c,
    tendon_protocols: db.prepare('SELECT COUNT(*) as c FROM tendon_protocols WHERE user_id = ?').get(DAN_USER_ID).c,
    wellness_protocols: db.prepare('SELECT COUNT(*) as c FROM wellness_protocols WHERE user_id = ?').get(DAN_USER_ID).c,
    metrics: db.prepare('SELECT COUNT(*) as c FROM athlete_metrics WHERE user_id = ?').get(DAN_USER_ID).c,
    tests: db.prepare('SELECT COUNT(*) as c FROM athlete_tests WHERE user_id = ?').get(DAN_USER_ID).c,
    scan_schedule: db.prepare('SELECT COUNT(*) as c FROM scan_schedule WHERE block_id = ?').get(result.blockId).c,
    bloods_schedule: db.prepare('SELECT COUNT(*) as c FROM bloods_schedule WHERE block_id = ?').get(result.blockId).c,
    emergency_protocols: db.prepare('SELECT COUNT(*) as c FROM emergency_protocols WHERE user_id = ?').get(DAN_USER_ID).c,
    nutrition_framework: db.prepare('SELECT COUNT(*) as c FROM nutrition_frameworks WHERE user_id = ?').get(DAN_USER_ID).c,
    phase_calorie_targets: db.prepare('SELECT COUNT(*) as c FROM phase_calorie_targets WHERE block_phase_id IN (SELECT id FROM block_phases WHERE block_id = ?)').get(result.blockId).c,
    meal_day_templates: db.prepare('SELECT COUNT(*) as c FROM meal_day_templates WHERE block_id = ?').get(result.blockId).c,
    weekly_meal_plans: db.prepare('SELECT COUNT(*) as c FROM weekly_meal_plans WHERE block_id = ?').get(result.blockId).c,
    swap_options: db.prepare('SELECT COUNT(*) as c FROM swap_options WHERE block_id = ?').get(result.blockId).c,
    weekly_schedule: db.prepare('SELECT COUNT(*) as c FROM weekly_schedule WHERE block_id = ?').get(result.blockId).c,
  };

  console.log('Row counts:');
  for (const [table, count] of Object.entries(counts)) {
    const status = count > 0 ? 'OK' : 'EMPTY';
    console.log(`  ${table}: ${count} ${status}`);
  }

  // Quick sanity: list workout titles
  console.log('\nWorkout titles:');
  const workouts = db.prepare('SELECT id, title, workout_type, day_number FROM workouts WHERE program_id = ? ORDER BY day_number, id').all(result.programId);
  for (const w of workouts) {
    console.log(`  [${w.id}] Day ${w.day_number} (${w.workout_type}): ${w.title}`);
  }

  console.log('\nImport complete!');
  console.log(`Program ID: ${result.programId}`);
  console.log(`Block ID: ${result.blockId}`);

  db.close();
}

main();
