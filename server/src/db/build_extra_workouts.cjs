#!/usr/bin/env node
/* FitBudd-migrated standalone workouts (transcribed from Dan's screenshots,
   mapped to our library). Idempotent: keyed by title (program_id NULL);
   re-running rebuilds the workout + its place in the target Explore section.
   block = { type?, sets, rest, items: [[exId, reps, meta?], ...] } */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'));

const WORKOUTS = [
  {
    section_id: 16, // TRX
    title: 'TRX Workout | Beginner Friendly',
    description: 'A beginner-friendly full-body TRX suspension session.',
    duration_mins: 26, intensity: 'Moderate', body_parts: 'Lower Body, Upper Body, Core', equipment: 'TRX',
    blocks: [
      { type: 'warmup', sets: 1, rest: 60, items: [ [343, '15 reps'], [339, '5 reps / side', { per_side: 'side' }], [334, '10 reps'], [332, '10 reps'], [19, '10 reps'], [344, '10 reps'] ] },
      { sets: 2, rest: 30, items: [ [19, '1:00', { time_based: 1, duration_secs: 60 }], [334, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [338, '1:00', { time_based: 1, duration_secs: 60 }], [345, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [331, '30s', { time_based: 1, duration_secs: 30 }], [333, '30s', { time_based: 1, duration_secs: 30 }] ] },
      { sets: 3, rest: 60, items: [ [337, '20s to 1:00', { time_based: 1, duration_secs: 45 }] ] },
    ],
  },
  // Hammy's & Glutes moved to build_fitbudd_classes.cjs (name-based, so it can
  // include Cable Donkey Kickback which isn't yet in the library).
  {
    section_id: 17, // Gymnastics Strength Training
    title: 'Rings | Beginner',
    description: 'A beginner rings strength session.',
    duration_mins: 22, intensity: 'Low', body_parts: 'Upper Body, Core', equipment: 'Body Weight, Resistance Bands, Dumbbell, Rings',
    blocks: [
      { sets: 3, rest: 30, items: [ [361, '10 reps'] ] },
      { sets: 1, rest: 30, items: [ [43, '10 reps'] ] },
      { sets: 1, rest: 30, items: [ [248, '10 reps / side', { per_side: 'side' }] ] },
      { sets: 1, rest: 30, items: [ [267, '10 reps / side', { per_side: 'side' }] ] },
      { sets: 2, rest: 30, items: [ [46, '10 reps'], [76, '1:00', { time_based: 1, duration_secs: 60 }], [89, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [198, '30s to 45s', { time_based: 1, duration_secs: 45 }], [40, '10 reps'] ] },
    ],
  },
  {
    section_id: 17, // Gymnastics Strength Training
    title: 'Rings | Intermediate',
    description: 'An intermediate rings strength session.',
    duration_mins: 22, intensity: 'Moderate', body_parts: 'Upper Body, Core', equipment: 'Body Weight, Resistance Bands, Rings',
    blocks: [
      { sets: 1, rest: 30, items: [ [361, '10 reps'] ] },
      { sets: 1, rest: 30, items: [ [43, '10 reps'] ] },
      { sets: 1, rest: 30, items: [ [267, '10 reps / arm', { per_side: 'arm' }] ] },
      { sets: 1, rest: 30, items: [ [248, '10 reps / arm', { per_side: 'arm' }] ] },
      { sets: 2, rest: 30, items: [ [76, '1:00', { time_based: 1, duration_secs: 60 }], [147, '30s', { time_based: 1, duration_secs: 30 }], [28, '45s to 1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 2, rest: 30, items: [ [83, '20s to 30s', { time_based: 1, duration_secs: 30 }], [208, '10 reps'] ] },
      { sets: 2, rest: 30, items: [ [99, '30s', { time_based: 1, duration_secs: 30 }], [179, '1:00', { time_based: 1, duration_secs: 60 }] ] },
      { sets: 3, rest: 30, items: [ [208, '10 reps'], [101, '10 reps'] ] },
      { sets: 1, rest: 30, items: [ [90, '1:00 / side', { time_based: 1, duration_secs: 60, per_side: 'side' }] ] },
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
      INSERT INTO workouts (program_id, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, visible, status, is_free_preview)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, 'mobility', ?, 1, 'draft', 0)`)
      .run(w.title, w.description, w.duration_mins, w.intensity, w.body_parts, w.equipment, w.image || null);
    const wid = info.lastInsertRowid;
    let order = 0;
    w.blocks.forEach((block, bi) => {
      const label = String.fromCharCode(65 + bi);
      const gtype = block.type || groupTypeFor(block.items.length);
      block.items.forEach(([exId, reps, meta]) => {
        const we = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_secs, group_type, group_label) VALUES (?,?,?,?,?,?,?,?)')
          .run(wid, exId, order, block.sets, reps, block.rest, gtype, label);
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
    const noVid = w.blocks.flatMap((b) => b.items).filter(([id]) => { const e = db.prepare('SELECT demo_video_url v FROM exercises WHERE id=?').get(id); return !e || !e.v; }).length;
    console.log(`built [${wid}] "${w.title}" -> section ${w.section_id}  (${w.blocks.reduce((a,b)=>a+b.items.length,0)} ex, no-video ${noVid})`);
  }
})();
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
