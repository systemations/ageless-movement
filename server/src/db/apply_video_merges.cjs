// One-off: give 13 no-video exercises the correct video by copying it from
// the matched video-bearing entry. Non-destructive — keeps each exercise's
// own name/cues, only fills demo_video_url (+ thumbnail if empty).
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'));

// [noVideoId, sourceId]
const pairs = [
  [1, 34], [563, 145], [1581, 145], [1582, 145], [1611, 145], [1632, 145],
  [602, 9], [1351, 430], [1557, 285], [1580, 41], [1814, 260], [1860, 244],
  [1849, 351],
];

const get = db.prepare('SELECT id, name, demo_video_url, thumbnail_url FROM exercises WHERE id = ?');
for (const [, src] of pairs) {
  const s = get.get(src);
  if (!s || !s.demo_video_url || !s.demo_video_url.trim()) {
    console.error('SOURCE MISSING VIDEO:', src, s && s.name);
    process.exit(1);
  }
}

const upd = db.prepare(
  "UPDATE exercises SET demo_video_url = ?, thumbnail_url = COALESCE(NULLIF(thumbnail_url, ''), ?) WHERE id = ?"
);
db.transaction(() => {
  for (const [nv, src] of pairs) {
    const s = get.get(src);
    upd.run(s.demo_video_url, s.thumbnail_url, nv);
  }
})();

console.log('Applied:');
for (const [nv] of pairs) {
  const t = get.get(nv);
  console.log(`  [${nv}] ${t.name} -> video ${t.demo_video_url ? 'set' : 'MISSING'}`);
}
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
