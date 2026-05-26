#!/usr/bin/env node
/* Build the Prehab & Rehab workouts from the exercise library.
   Idempotent: each workout is keyed by its exact title (program_id NULL);
   re-running wipes + rebuilds that workout's exercises/meta and its place
   in the Prehab Explore section (id 5).

   Contents:
   - 6 rebuilt FitBudd programs (Shoulders/Hips/Spine x At Home/In Gym),
     transcribed from Dan's screenshots, mapped to our library (all
     video-backed; Cat-Cow -> Segmental Cat-Cow [415]; "Neck circles"
     omitted - no videoed neck exercise yet).
   - 2 condition routines (Plantar Fasciitis, Frozen Shoulder), video-only.

   Drafts for Dan's review - nothing is deployed by this script.
*/
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'));

const PREHAB_SECTION_ID = 5;
const DISCLAIMER =
  'Rehab guidance, not medical advice. Always get cleared by a qualified medical professional before starting this or any exercise program, especially if you have an existing injury or condition.';
const PREHAB_NOTE = 'Prehab for Performance. Get cleared by a medical professional before starting.';

// block = { type?, sets, rest, items: [[exId, reps, meta?], ...] }
// meta keys honored if column exists: time_based, duration_secs, per_side
const WORKOUTS = [
  {
    title: 'Shoulders | At Home Programs', image: '/prehab/shoulder.jpg',
    description: `Prehab for Performance mobility for the shoulders, bodyweight and band only. ${DISCLAIMER}`,
    duration_mins: 30, intensity: 'Moderate', body_parts: 'Upper Body', equipment: 'Body Weight, Resistance Bands',
    blocks: [
      { sets: 2, rest: 30, items: [ [249, '2:00', { time_based: 1, duration_secs: 120 }], [244, '1:00', { time_based: 1, duration_secs: 60 }], [43, '10 reps'] ] },
      { sets: 2, rest: 30, items: [ [240, '10 reps'], [250, '30s / arm', { time_based: 1, duration_secs: 30, per_side: 'arm' }] ] },
      { sets: 2, rest: 30, items: [ [266, '30s', { time_based: 1, duration_secs: 30 }], [312, '1:30', { time_based: 1, duration_secs: 90 }] ] },
      { sets: 2, rest: 30, items: [ [259, '1:30 / side', { time_based: 1, duration_secs: 90, per_side: 'side' }], [57, '1:30', { time_based: 1, duration_secs: 90 }] ] },
      { sets: 1, rest: 0, items: [ [237, '1:30', { time_based: 1, duration_secs: 90 }] ] },
    ],
  },
  {
    title: 'Shoulders | Gym Programs', image: '/prehab/shoulder.jpg',
    description: `Prehab for Performance mobility for the shoulders, with kettlebell, dumbbell and cable work. ${DISCLAIMER}`,
    duration_mins: 36, intensity: 'Moderate', body_parts: 'Upper Body, Lower Body', equipment: 'Body Weight, Kettlebell, Dumbbell, Cable Station',
    blocks: [
      { type: 'warmup', sets: 2, rest: 30, items: [ [50, '10 reps / side', { per_side: 'side' }], [46, '10 reps'], [28, '45s to 60s', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [357, '10 reps'], [202, '10 reps / side', { per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [48, '10 reps / side', { per_side: 'side' }], [257, '10 reps / side', { per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [60, '10 reps'], [72, '30 reps'], [213, '10 reps'] ] },
    ],
  },
  {
    title: 'Spine | At Home Programs', image: '/prehab/back.jpg',
    description: `Prehab for Performance mobility for the spine: stretching, strength and active flexibility, bodyweight only. ${DISCLAIMER}`,
    duration_mins: 32, intensity: 'Low', body_parts: 'Core, Upper Body, Lower Body, Neck', equipment: 'Body Weight',
    blocks: [
      { sets: 2, rest: 30, items: [ [279, '45s / side', { time_based: 1, duration_secs: 45, per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [1350, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [229, '10 reps'] ] },
      { sets: 3, rest: 30, items: [ [282, '5 reps'], [29, '5 reps'] ] },
      { sets: 2, rest: 30, items: [ [73, '1:00', { time_based: 1, duration_secs: 60 }], [297, '10 reps'] ] },
      { sets: 3, rest: 30, items: [ [279, '10 reps'], [164, '10 reps / side', { per_side: 'side' }], [35, '45s to 60s', { time_based: 1, duration_secs: 60 }] ] },
    ],
  },
  {
    title: 'Spine | Gym Programs', image: '/prehab/back.jpg',
    description: `Prehab for Performance mobility for the spine, with cable and loaded work. ${DISCLAIMER}`,
    duration_mins: 34, intensity: 'Moderate', body_parts: 'Upper Body, Core', equipment: 'Body Weight, Cables',
    blocks: [
      { sets: 2, rest: 30, items: [ [1350, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [318, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [209, '10 reps / leg', { per_side: 'leg' }] ] },
      { sets: 3, rest: 30, items: [ [282, '5 reps'], [29, '5 reps'] ] },
      { sets: 2, rest: 30, items: [ [38, '10 reps'], [256, '10 reps / side', { per_side: 'side' }] ] },
      { sets: 3, rest: 30, items: [ [146, '1:00', { time_based: 1, duration_secs: 60 }], [187, '10 reps / side', { per_side: 'side' }], [358, '10 reps / side', { per_side: 'side' }] ] },
    ],
  },
  {
    title: 'Hips | At Home Programs', image: '/prehab/hip.jpg',
    description: `Prehab for Performance mobility for the hips, bodyweight only. ${DISCLAIMER}`,
    duration_mins: 34, intensity: 'Moderate', body_parts: 'Lower Body', equipment: 'Body Weight',
    blocks: [
      { type: 'warmup', sets: 2, rest: 30, items: [ [5, '7 reps / side', { per_side: 'side' }], [22, '5 reps / side', { per_side: 'side' }], [107, '10 reps'] ] },
      { sets: 2, rest: 30, items: [ [103, '10 reps'], [174, '10 reps'] ] },
      { sets: 2, rest: 30, items: [ [228, '10 reps'], [203, '10 reps'] ] },
      { sets: 3, rest: 30, items: [ [149, '1:00', { time_based: 1, duration_secs: 60 }], [80, '1:00 / leg', { time_based: 1, duration_secs: 60, per_side: 'leg' }], [58, '1:00 / side', { time_based: 1, duration_secs: 60, per_side: 'side' }] ] },
    ],
  },
  {
    title: 'Hips | Gym Programs', image: '/prehab/hip.jpg',
    description: `Prehab for Performance mobility for the hips, with barbell, kettlebell and band work. ${DISCLAIMER}`,
    duration_mins: 29, intensity: 'Moderate', body_parts: 'Lower Body', equipment: 'Resistance Bands, Barbell, Body Weight, Kettlebell',
    blocks: [
      { type: 'warmup', sets: 2, rest: 30, items: [ [308, '10 reps / side', { per_side: 'side' }], [22, '5 reps / side', { per_side: 'side' }], [5, '7 reps / side', { per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [145, '10 reps'], [190, '10 reps'], [316, '10 reps'], [183, '10 reps'] ] },
      { sets: 3, rest: 30, items: [ [149, '1:00', { time_based: 1, duration_secs: 60 }], [301, '10 reps'], [58, '30s / side', { time_based: 1, duration_secs: 30, per_side: 'side' }] ] },
    ],
  },
  {
    // condition routine - video-only
    title: 'Plantar Fasciitis | Foot & Calf Rehab', image: '/prehab/ankle.jpg',
    description: `A focused foot and calf routine for plantar fasciitis: gentle mobility, controlled calf loading, then release and tibialis work. ${DISCLAIMER}`,
    duration_mins: 20, intensity: 'Low', body_parts: 'Calves, Ankles', equipment: 'Dumbbell, Step',
    blocks: [
      { sets: 1, rest: 30, items: [ [32, '10 reps / side', { per_side: 'side' }], [47, '10 reps / side', { per_side: 'side' }] ] },
      { sets: 3, rest: 60, items: [ [269, '12 reps / side (3s down)', { per_side: 'side' }], [201, '12 reps / side', { per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [59, '45s / side', { time_based: 1, duration_secs: 45, per_side: 'side' }], [270, '45s / side', { time_based: 1, duration_secs: 45, per_side: 'side' }], [34, '15 reps'] ] },
    ],
  },
  {
    // condition routine - video-only
    title: 'Frozen Shoulder | Shoulder ROM & Rehab', image: '/prehab/shoulder.jpg',
    description: `A gentle, progressive routine for frozen shoulder (adhesive capsulitis): controlled shoulder circles and a mobility series, dumbbell/banded rotation work, flossing, finishing with an end-range capsule stretch. Stay within a comfortable, pain-tolerable range. ${DISCLAIMER}`,
    duration_mins: 25, intensity: 'Low', body_parts: 'Shoulders, Rotator Cuff', equipment: 'Dumbbell, Resistance Band',
    blocks: [
      { sets: 1, rest: 30, items: [ [294, '10 reps / direction', { per_side: 'side' }], [249, '30s each', { time_based: 1, duration_secs: 30 }] ] },
      { sets: 3, rest: 45, items: [ [225, '12 reps / side', { per_side: 'side' }], [308, '12 reps / side', { per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [244, '60s', { time_based: 1, duration_secs: 60 }], [240, '12 reps'] ] },
      { sets: 1, rest: 0, items: [ [237, '60s / side', { time_based: 1, duration_secs: 60, per_side: 'side' }] ] },
    ],
  },
];

const groupTypeFor = (n) => (n >= 4 ? 'circuit' : n === 3 ? 'triset' : n === 2 ? 'superset' : 'regular');
const metaCols = new Set(db.prepare('PRAGMA table_info(workout_exercise_meta)').all().map((c) => c.name));

const tx = db.transaction(() => {
  for (const w of WORKOUTS) {
    const old = db.prepare('SELECT id FROM workouts WHERE program_id IS NULL AND title = ?').all(w.title);
    for (const o of old) {
      db.prepare('DELETE FROM workout_exercise_meta WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)').run(o.id);
      db.prepare('DELETE FROM workout_exercises WHERE workout_id = ?').run(o.id);
      db.prepare("DELETE FROM explore_section_items WHERE item_type='workout' AND item_id = ?").run(o.id);
      db.prepare('DELETE FROM workouts WHERE id = ?').run(o.id);
    }

    const info = db.prepare(`
      INSERT INTO workouts (program_id, title, description, duration_mins, intensity, body_parts, workout_type, image_url, visible, status, is_free_preview)
      VALUES (NULL, ?, ?, ?, ?, ?, 'mobility', ?, 1, 'draft', 0)`)
      .run(w.title, w.description, w.duration_mins, w.intensity, w.body_parts, w.image || null);
    const workoutId = info.lastInsertRowid;

    let order = 0;
    w.blocks.forEach((block, bi) => {
      const label = String.fromCharCode(65 + bi);
      const gtype = block.type || groupTypeFor(block.items.length);
      block.items.forEach(([exId, reps, meta]) => {
        const weInfo = db.prepare(`
          INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_secs, group_type, group_label)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(workoutId, exId, order, block.sets, reps, block.rest, gtype, label);
        order++;
        if (meta && metaCols.size) {
          const cols = ['workout_exercise_id'], vals = [weInfo.lastInsertRowid], qs = ['?'];
          for (const [k, v] of Object.entries(meta)) if (metaCols.has(k)) { cols.push(k); vals.push(v); qs.push('?'); }
          if (cols.length > 1) db.prepare(`INSERT INTO workout_exercise_meta (${cols.join(',')}) VALUES (${qs.join(',')})`).run(...vals);
        }
      });
    });

    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM explore_section_items WHERE section_id = ?').get(PREHAB_SECTION_ID).m;
    db.prepare("INSERT INTO explore_section_items (section_id, item_type, item_id, sort_order) VALUES (?, 'workout', ?, ?)")
      .run(PREHAB_SECTION_ID, workoutId, maxSort + 1);

    const noVid = w.blocks.flatMap((b) => b.items).filter(([id]) => {
      const e = db.prepare('SELECT demo_video_url v FROM exercises WHERE id = ?').get(id);
      return !e || !e.v || !e.v.trim();
    }).length;
    console.log(`built [${workoutId}] "${w.title}"  ${w.blocks.reduce((a, b) => a + b.items.length, 0)} ex${noVid ? `  (NO-VIDEO: ${noVid})` : ''}`);
  }
});
tx();

console.log('\nPrehab section now contains:');
for (const r of db.prepare(`
  SELECT w.id, w.title, w.duration_mins FROM explore_section_items esi
  JOIN workouts w ON w.id = esi.item_id
  WHERE esi.section_id = ${PREHAB_SECTION_ID} AND esi.item_type='workout' ORDER BY esi.sort_order`).all())
  console.log(`  [${r.id}] "${r.title}" ${r.duration_mins}min`);

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
