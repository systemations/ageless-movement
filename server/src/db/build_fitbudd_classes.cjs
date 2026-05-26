#!/usr/bin/env node
/* FitBudd classes transcribed from Dan's screenshots. NAME-BASED with
   get-or-create: exercises not already in the library are created by name
   (no video yet - per Dan, "put the name of the exercise in"; videos added
   later). Idempotent by workout title. Sections: GST=17, Sweat=12,
   Stretching=6, Lower Body=18. */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'));

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
let all = db.prepare('SELECT id,name,demo_video_url FROM exercises').all().map((e) => ({ ...e, n: norm(e.name) }));
const created = [];
function exId(name) {
  const q = norm(name);
  let hit = all.find((e) => e.n === q) || all.find((e) => e.n.includes(q) || q.includes(e.n));
  if (hit) return hit.id;
  const info = db.prepare('INSERT INTO exercises (name) VALUES (?)').run(name);
  all.push({ id: info.lastInsertRowid, name, n: q, demo_video_url: null });
  created.push(name);
  return info.lastInsertRowid;
}

// block = { type?, sets, rest, items: [[name, reps, meta?], ...] }
const WORKOUTS = [
  {
    section_id: 18, title: "Hammy's & Glutes Workout",
    description: 'A hamstring and glute focused strength session.',
    duration_mins: 51, intensity: 'Moderate', body_parts: 'Lower Body, Core, Upper Body, Hips', equipment: 'Resistance Bands, Body Weight, Barbell, Cable Station, TRX',
    blocks: [
      { type: 'warmup', sets: 1, rest: 30, items: [['Stationary Bike', '3:00', { time_based: 1, duration_secs: 180 }]] },
      { sets: 2, rest: 60, items: [['Lateral Banded Walks', '1:00', { time_based: 1, duration_secs: 60 }], ['Copenhagen Plank', '10 reps / leg', { per_side: 'leg' }], ['Glute Bridge Hold', '1:00', { time_based: 1, duration_secs: 60 }]] },
      { sets: 3, rest: 60, items: [['Hip Thrusts - Barbell', '10 reps'], ['High Step Up', '10 reps / leg', { per_side: 'leg' }], ['Tuck Ups', '15 reps']] },
      { sets: 2, rest: 60, items: [['Cable Donkey Kickback', '10 reps / leg', { per_side: 'leg' }], ['Romanian Deadlift', '10 reps']] },
      { sets: 2, rest: 60, items: [['TRX Hamstring Curls', '10 reps'], ['TRX Hip Thrusts', '10 reps'], ['Half Middle Split Leg Lift', '10 reps / leg', { per_side: 'leg' }]] },
      { sets: 2, rest: 60, items: [['Spinal Segmentation - Jefferson Curls', '5 reps']] },
    ],
  },
  {
    section_id: 17, title: 'Gymnastics Strength Fundamentals | Beginner',
    description: 'Prehab for Performance Strength Fundamentals - beginner. Warm up on a cardio machine or skipping for 3 minutes.',
    duration_mins: 34, intensity: 'Moderate', body_parts: 'Lower Body, Upper Body, Core, Full Body', equipment: 'Resistance Bands, Body Weight',
    blocks: [
      { sets: 2, rest: 30, items: [['Lateral Banded Walks', '10 reps / leg', { per_side: 'leg' }], ['Shoulder Flossing', '1:00', { time_based: 1, duration_secs: 60 }], ['Shrimp Squats', '10 reps / side', { per_side: 'side' }]] },
      { sets: 3, rest: 30, items: [['Tricep Push Up', '10 reps'], ['Horse Stance Squats', '10 reps']] },
      { sets: 2, rest: 30, items: [['Hollow Body Series', '10 reps'], ['Arch Body Series', '10 reps']] },
      { sets: 3, rest: 30, items: [['Glute Bridge Reps', '1:00', { time_based: 1, duration_secs: 60 }], ['Inch Worm', '5 to 10 reps']] },
      { sets: 3, rest: 30, items: [['Side Plank', '45s', { time_based: 1, duration_secs: 45 }]] },
    ],
  },
  {
    section_id: 17, title: 'Gymnastics Strength Fundamentals | Intermediate',
    description: 'Prehab for Performance Strength Fundamentals - intermediate. Warm up on a cardio machine or skipping for 3 minutes.',
    duration_mins: 31, intensity: 'Moderate', body_parts: 'Lower Body, Core, Upper Body, Full Body', equipment: 'Body Weight, Weight Plates, Rings, Parallettes',
    blocks: [
      { sets: 2, rest: 30, items: [['Standing Knee Raises (Weighted)', '10 reps'], ['Front Support with Hip Twist', '30s / side', { time_based: 1, duration_secs: 30, per_side: 'side' }], ['Front Raises with Plate', '10 reps']] },
      { sets: 3, rest: 30, items: [['Back Row on Rings', '1:00', { time_based: 1, duration_secs: 60 }], ['Pigeon Squats', '10 reps']] },
      { sets: 3, rest: 30, items: [['Tuck Planche - Parallettes', '10s', { time_based: 1, duration_secs: 10 }], ['Hamstring Walks on roller', '10 reps']] },
      { sets: 3, rest: 30, items: [['Seated Straddle Leg Lifts', '1:00', { time_based: 1, duration_secs: 60 }], ['Halos', '1:00', { time_based: 1, duration_secs: 60 }]] },
      { sets: 3, rest: 30, items: [['Side Pancake Reps', '10 reps']] },
    ],
  },
  {
    section_id: 12, title: 'Sweat Session #02',
    description: 'Your weekly dose of movement, strength and stamina - Handsdan style. A full hour of guided work.',
    duration_mins: 60, intensity: 'High', body_parts: 'Lower Body, Upper Body, Full Body, Core', equipment: 'Body Weight, Weight Plates, Landmine, Medicine Ball',
    blocks: [
      { type: 'warmup', sets: 3, rest: 60, items: [['Warm Up', '1 rep']] },
      { sets: 3, rest: 60, items: [['Bulgarian Split Squats', '8 to 10 reps / leg', { per_side: 'leg' }], ['Chin Up', '10 reps'], ['Front Raises with Plate', '10 reps']] },
      { sets: 3, rest: 60, items: [['Romanian Deadlift', '8 to 10 reps'], ['Shoulder Press - Landmine', '10 reps / side', { per_side: 'side' }], ['Calf Raises', '10 reps'], ['Calf Raises', '20 reps']] },
      { sets: 3, rest: 60, items: [['Dips', '10 to 15 reps'], ['Single Arm Snatch', '12 reps'], ['Glute Bridge Reps', '15 reps']] },
      { type: 'circuit', sets: 2, rest: 60, items: [['Hanging Tuck Ups', '10 to 20 reps'], ['Medicine Ball Slams', '12 reps'], ['Back Extensions', '15 reps'], ['Weighted Crunches', '15 reps'], ['Reverse Crunch', '10 to 20 reps'], ['Farmers Carrys', '15 reps'], ['Elbow Plank Razors', '10 reps'], ['Tuck Ups', '12 to 15 reps'], ['Side Over Arch', '15 reps']] },
    ],
  },
  {
    section_id: 6, title: 'Full Body Flexibility Workout',
    description: 'A full-body stretch session: a mixture of passive, dynamic and loaded stretches plus PNF-style contractions to build flexibility.',
    duration_mins: 32, intensity: 'Low', body_parts: 'Lower Body, Upper Body, Core', equipment: 'Body Weight',
    blocks: [
      { sets: 1, rest: 30, items: [['Ant Tib Raises', '1:00', { time_based: 1, duration_secs: 60 }]] },
      { sets: 1, rest: 30, items: [['Calf Roll Outs', '2:00', { time_based: 1, duration_secs: 120 }]] },
      { sets: 1, rest: 30, items: [['Frog Stretch', '2:30', { time_based: 1, duration_secs: 150 }]] },
      { sets: 1, rest: 30, items: [['Piriformis Stretch with Contractions', '2:30 / side', { time_based: 1, duration_secs: 150, per_side: 'side' }]] },
      { sets: 1, rest: 30, items: [['Shoulder Capsule Stretch', '1:30 / side', { time_based: 1, duration_secs: 90, per_side: 'side' }]] },
      { sets: 1, rest: 30, items: [['Cactus Up Stretch with Contractions', '1:30 / side', { time_based: 1, duration_secs: 90, per_side: 'side' }]] },
      { sets: 1, rest: 30, items: [['Active Seal', '5 reps']] },
      { sets: 1, rest: 30, items: [['Spinal Segmentation - Jefferson Curls', '5 reps']] },
      { sets: 1, rest: 30, items: [['Couch Stretch', '2:30 / side', { time_based: 1, duration_secs: 150, per_side: 'side' }]] },
      { sets: 1, rest: 30, items: [['Hamstring Stretch', '2:30 / side', { time_based: 1, duration_secs: 150, per_side: 'side' }]] },
    ],
  },
];

const groupTypeFor = (n) => (n >= 4 ? 'circuit' : n === 3 ? 'triset' : n === 2 ? 'superset' : 'regular');
const metaCols = new Set(db.prepare('PRAGMA table_info(workout_exercise_meta)').all().map((c) => c.name));

db.transaction(() => {
  for (const w of WORKOUTS) {
    for (const o of db.prepare('SELECT id FROM workouts WHERE program_id IS NULL AND title = ?').all(w.title)) {
      db.prepare('DELETE FROM workout_exercise_meta WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)').run(o.id);
      db.prepare('DELETE FROM workout_exercises WHERE workout_id = ?').run(o.id);
      db.prepare("DELETE FROM explore_section_items WHERE item_type='workout' AND item_id = ?").run(o.id);
      db.prepare('DELETE FROM workouts WHERE id = ?').run(o.id);
    }
    const info = db.prepare(`
      INSERT INTO workouts (program_id, title, description, duration_mins, intensity, body_parts, equipment, workout_type, visible, status, is_free_preview)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, 'mobility', 1, 'draft', 0)`)
      .run(w.title, w.description, w.duration_mins, w.intensity, w.body_parts, w.equipment);
    const wid = info.lastInsertRowid;
    let order = 0;
    w.blocks.forEach((block, bi) => {
      const label = String.fromCharCode(65 + bi);
      const gtype = block.type || groupTypeFor(block.items.length);
      block.items.forEach(([name, reps, meta]) => {
        const id = exId(name);
        const we = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_secs, group_type, group_label) VALUES (?,?,?,?,?,?,?,?)')
          .run(wid, id, order, block.sets, reps, block.rest, gtype, label);
        order++;
        if (meta) {
          const cols = ['workout_exercise_id'], vals = [we.lastInsertRowid], qs = ['?'];
          for (const [k, v] of Object.entries(meta)) if (metaCols.has(k)) { cols.push(k); vals.push(v); qs.push('?'); }
          if (cols.length > 1) db.prepare(`INSERT INTO workout_exercise_meta (${cols.join(',')}) VALUES (${qs.join(',')})`).run(...vals);
        }
      });
    });
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM explore_section_items WHERE section_id = ?').get(w.section_id).m;
    db.prepare("INSERT INTO explore_section_items (section_id, item_type, item_id, sort_order) VALUES (?, 'workout', ?, ?)").run(w.section_id, wid, maxSort + 1);
    console.log(`built [${wid}] "${w.title}" -> section ${w.section_id} (${w.blocks.reduce((a, b) => a + b.items.length, 0)} ex)`);
  }
})();
console.log(`\nNew exercises created (no video yet): ${created.length}`);
created.forEach((c) => console.log('  + ' + c));
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
