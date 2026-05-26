// Convert Ground Zero (program 1) weeks 1-4 to follow-along videos, one per
// day, matching the source layout (Day 5 = Hips Flexion repeat, Day 6 =
// Shoulders ER; "Foot Mobility" dropped). Clears the per-exercise shells so
// each day is just its follow-along video, like weeks 5-8 already are.
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');

const db = new Database(dbPath);
db.pragma('wal_checkpoint(TRUNCATE)');
const bk = `${dbPath}.reliable-${Date.now()}`;
fs.copyFileSync(dbPath, bk);
console.log('backup:', path.basename(bk));

// day_number -> { title, vimeoId }
// IDs matched to each day by the videos' own Vimeo titles (Dan's paste order
// was not day order). Verified via oembed 2026-05-26.
const DAYS = {
  1: { title: '1. Hips | Flexion & Rotation', id: '849388421' },
  2: { title: '2. Hips - Extension | Shoulder Internal Rotation', id: '849388446' },
  3: { title: '3. Spine - Extension | Shoulder Flexion', id: '849704210' },
  4: { title: '4. Hips - Adduction, Abduction & Rotation', id: '849388500' },
  5: { title: '5. Hips | Flexion & Rotation', id: '849388421' },
  6: { title: '6. Shoulders - External Rotation | Spine Rotation', id: '849388523' },
};

const rows = db.prepare(
  'SELECT id, week_number, day_number, title FROM workouts WHERE program_id = 1 AND week_number IN (1,2,3,4) ORDER BY week_number, day_number'
).all();

const updWorkout = db.prepare(
  "UPDATE workouts SET workout_type='follow_along', title=?, video_url=?, duration_mins=COALESCE(NULLIF(duration_mins,0),10) WHERE id=?"
);
const delEx = db.prepare('DELETE FROM workout_exercises WHERE workout_id=?');

db.transaction(() => {
  for (const w of rows) {
    const d = DAYS[w.day_number];
    if (!d) { console.log('  SKIP (no mapping) W' + w.week_number + 'D' + w.day_number); continue; }
    updWorkout.run(d.title, `https://vimeo.com/${d.id}`, w.id);
    delEx.run(w.id);
  }
})();

console.log('\nResult (weeks 1-4):');
for (const w of db.prepare('SELECT id, week_number, day_number, title, workout_type, video_url FROM workouts WHERE program_id=1 AND week_number IN (1,2,3,4) ORDER BY week_number, day_number').all()) {
  const ex = db.prepare('SELECT COUNT(*) c FROM workout_exercises WHERE workout_id=?').get(w.id).c;
  console.log(`  W${w.week_number}D${w.day_number} [${w.id}] ${w.workout_type} ex=${ex} ${w.video_url} "${w.title}"`);
}
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
