// Wire cardio alternatives into the existing exercise + workout schema.
//
// What this does:
//  1. Renames the messy cardio exercise entries (Rowing Mahine (M), etc.)
//  2. Adds "Brisk Walking" if missing (low-impact fallback)
//  3. Attaches Rowing / Stationary Bike / Assault Bike / Ski Erg / Skipping /
//     Brisk Walking as workout_exercise_alternates to the primary "Running"
//     exercise rows inside the two Zone 2 Run workouts (ids 534, 550)
//  4. Populates those two previously-empty workouts with a Running exercise
//     row at 40 min duration so the alternates UI has something to attach to.
//
// Idempotent — safe to re-run. Uses WHERE NOT EXISTS or UPDATE semantics.

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'ageless.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// ── 1. Clean up existing cardio exercise names ─────────────────────────

const renames = [
  { id: 1278, name: 'Rowing Machine', equipment: 'Machine' },
  { id: 1286, name: 'Stationary Bike', equipment: 'Machine' },
  { id: 1248, name: 'Assault Bike',   equipment: 'Machine' },
  { id: 1279, name: 'Running',        equipment: null }, // outdoor / treadmill — no equipment required
  { id: 1284, name: 'Ski Erg',        equipment: 'Machine' },
  { id: 1285, name: 'Skipping',       equipment: 'Rope' },
];

for (const r of renames) {
  db.prepare('UPDATE exercises SET name = ?, equipment = ? WHERE id = ?')
    .run(r.name, r.equipment, r.id);
}

// ── 2. Add Brisk Walking if missing ────────────────────────────────────

let briskWalkingId;
const existing = db.prepare("SELECT id FROM exercises WHERE name = 'Brisk Walking'").get();
if (existing) {
  briskWalkingId = existing.id;
} else {
  const ins = db.prepare(
    "INSERT INTO exercises (name, description, equipment) VALUES (?, ?, ?)"
  ).run(
    'Brisk Walking',
    'Low-impact Zone 2 cardio fallback — outdoor or treadmill. Pace: you can hold a conversation but not sing.',
    null,
  );
  briskWalkingId = Number(ins.lastInsertRowid);
}

console.log('Cardio exercise IDs:');
console.log('  Running (primary):  1279');
console.log('  Rowing Machine:     1278');
console.log('  Stationary Bike:    1286');
console.log('  Assault Bike:       1248');
console.log('  Ski Erg:            1284');
console.log('  Skipping:           1285');
console.log(`  Brisk Walking:      ${briskWalkingId}`);

// ── 3. Populate the two Zone 2 Run workouts with a Running row ─────────

const ALT_IDS = [1278, 1286, 1248, 1284, 1285, briskWalkingId];
const ZONE2_WORKOUT_IDS = [534, 550];
const DURATION_SECS = 40 * 60;

// Wrapped in a single transaction so partial failures don't leave the
// schema in a half-populated state.
const tx = db.transaction(() => {
  for (const workoutId of ZONE2_WORKOUT_IDS) {
    const workout = db.prepare('SELECT id, title FROM workouts WHERE id = ?').get(workoutId);
    if (!workout) {
      console.warn(`  (skip) workout ${workoutId} not found`);
      continue;
    }

    // Ensure there's exactly one Running exercise row in this workout.
    let runRow = db.prepare(
      'SELECT id FROM workout_exercises WHERE workout_id = ? AND exercise_id = 1279 LIMIT 1',
    ).get(workoutId);

    if (!runRow) {
      const ins = db.prepare(
        `INSERT INTO workout_exercises
          (workout_id, exercise_id, order_index, sets, duration_secs, rest_secs, group_type)
         VALUES (?, 1279, 0, 1, ?, 0, 'standard')`,
      ).run(workoutId, DURATION_SECS);
      runRow = { id: Number(ins.lastInsertRowid) };
      console.log(`  ${workout.title} (${workoutId}): added Running exercise row ${runRow.id}`);
    } else {
      // Keep duration in sync with what the workout claims it is.
      db.prepare(
        'UPDATE workout_exercises SET duration_secs = ?, sets = 1 WHERE id = ?',
      ).run(DURATION_SECS, runRow.id);
      console.log(`  ${workout.title} (${workoutId}): Running row ${runRow.id} already present, updated duration`);
    }

    // Mark the exercise meta as duration-tracked so the client renders
    // a timer, not a reps input.
    const existingMeta = db.prepare(
      'SELECT id FROM workout_exercise_meta WHERE workout_exercise_id = ?',
    ).get(runRow.id);
    if (existingMeta) {
      db.prepare(
        "UPDATE workout_exercise_meta SET tracking_type = 'Duration', duration_secs = ?, time_based = 1 WHERE id = ?",
      ).run(DURATION_SECS, existingMeta.id);
    } else {
      db.prepare(
        `INSERT INTO workout_exercise_meta
          (workout_exercise_id, tracking_type, duration_secs, time_based)
         VALUES (?, 'Duration', ?, 1)`,
      ).run(runRow.id, DURATION_SECS);
    }

    // Attach alternates — rowing, bike, ski erg, skipping, walking.
    // workout_exercise_alternates has a unique row per (workout_exercise_id,
    // alternative_id) pair, so we use INSERT OR IGNORE to stay idempotent.
    let altIdx = 0;
    for (const altId of ALT_IDS) {
      db.prepare(
        `INSERT OR IGNORE INTO workout_exercise_alternates
          (workout_exercise_id, alternative_id, enabled, sort_order)
         VALUES (?, ?, 1, ?)`,
      ).run(runRow.id, altId, altIdx);
      altIdx++;
    }
  }
});

tx();

console.log('\nDone. Two Zone 2 Run workouts now have a Running exercise row with 6 alternates attached.');
console.log('Drop a video URL onto exercise 1279 (Running) whenever you have one — it will show in the player.');

db.close();
