const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'), { readonly: true });

const items = db.prepare(`
  SELECT esi.item_type, esi.item_id FROM explore_section_items esi
  JOIN explore_sections es ON es.id = esi.section_id
  WHERE es.visible = 1 AND esi.item_type IN ('program','workout')`).all();
const progIds = items.filter(i => i.item_type === 'program').map(i => i.item_id);
const woIds = new Set(items.filter(i => i.item_type === 'workout').map(i => i.item_id));
if (progIds.length) {
  const ph = progIds.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT id FROM workouts WHERE program_id IN (${ph})`).all(...progIds)) woIds.add(r.id);
}
const woArr = [...woIds];
const ph = woArr.map(() => '?').join(',');

const rows = db.prepare(`
  SELECT DISTINCT we.exercise_id, p.title FROM workout_exercises we
  JOIN workouts w ON w.id = we.workout_id
  LEFT JOIN programs p ON p.id = w.program_id
  WHERE we.workout_id IN (${ph})`).all(...woArr);

const noVid = new Set(db.prepare("SELECT id FROM exercises WHERE demo_video_url IS NULL OR TRIM(demo_video_url) = ''").all().map(r => r.id));

const byProg = {};
const distinct = new Set();
for (const r of rows) {
  if (noVid.has(r.exercise_id)) {
    distinct.add(r.exercise_id);
    const k = r.title || '(standalone workout)';
    (byProg[k] = byProg[k] || new Set()).add(r.exercise_id);
  }
}
console.log('Distinct no-video exercises used in LIVE Explore:', distinct.size, '\n');
console.log('Per live program (no-video exercise count):');
Object.entries(byProg).sort((a, b) => b[1].size - a[1].size).forEach(([t, s]) => console.log(`  ${String(s.size).padStart(4)}  ${t}`));
