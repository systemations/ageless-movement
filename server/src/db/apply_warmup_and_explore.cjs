// Task 1: ensure the generic warm-up exercises carry the Dynamic Warm Up
//         video so any "WARM UP" block with no specific exercise plays it.
// Task 2: add the 10-min full-body mobility follow-along to the Explore
//         "Mobility - Follow Along" section (id 8).
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');

const db = new Database(dbPath);
db.pragma('wal_checkpoint(TRUNCATE)');
const bk = `${dbPath}.reliable-${Date.now()}`;
fs.copyFileSync(dbPath, bk);
console.log('backup:', path.basename(bk));

const WARMUP_VIDEO = 'https://vimeo.com/918759982';
const WARMUP_THUMB = 'https://i.vimeocdn.com/video/1807822021-bc7975a15bab590415d0e91a295e547595e27010548ec3c5e315a83c5f5219b4-d_295x166?region=us';
const MOB_VIDEO = 'https://vimeo.com/1050901485';
const MOB_THUMB = 'https://i.vimeocdn.com/video/1975602238-e1ca567a11dca41bc900ab566eeb0aabcf94ea38cdebd0a91615f53cccc2b3a7-d_295x166?region=us';

db.transaction(() => {
  // --- Task 1: warm-up video on generic warm-up exercises (8 + 2108) ---
  const upEx = db.prepare("UPDATE exercises SET demo_video_url=?, thumbnail_url=COALESCE(NULLIF(thumbnail_url,''),?) WHERE id=?");
  upEx.run(WARMUP_VIDEO, WARMUP_THUMB, 8);     // "Warm Up" (already set; idempotent)
  upEx.run(WARMUP_VIDEO, WARMUP_THUMB, 2108);  // "Dynamic Warm Up"

  // --- Task 2: 10-min mobility follow-along into Explore section 8 ---
  let wo = db.prepare("SELECT id FROM workouts WHERE video_url LIKE '%1050901485%'").get();
  if (!wo) {
    const info = db.prepare(`
      INSERT INTO workouts (program_id, title, description, duration_mins, intensity, body_parts, workout_type, image_url, visible, video_url, status, is_free_preview)
      VALUES (NULL, ?, ?, ?, 'Low', 'Full Body', 'follow_along', ?, 1, ?, 'draft', 0)`)
      .run('10 Min Full Body Mobility', 'Follow-along mobility session', 11, MOB_THUMB, MOB_VIDEO);
    wo = { id: info.lastInsertRowid };
    console.log('created follow_along workout id', wo.id);
  } else {
    console.log('workout for 1050901485 already exists:', wo.id);
  }
  const exists = db.prepare("SELECT id FROM explore_section_items WHERE section_id=8 AND item_type='workout' AND item_id=?").get(wo.id);
  if (!exists) {
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM explore_section_items WHERE section_id=8').get().m;
    db.prepare("INSERT INTO explore_section_items (section_id, item_type, item_id, sort_order) VALUES (8,'workout',?,?)").run(wo.id, maxSort + 1);
    console.log('added to Explore section 8 at sort', maxSort + 1);
  } else {
    console.log('already in Explore section 8');
  }
})();

console.log('\nVerify:');
console.log('  ex8 vid:', db.prepare('SELECT demo_video_url FROM exercises WHERE id=8').get().demo_video_url);
console.log('  ex2108 vid:', db.prepare('SELECT demo_video_url FROM exercises WHERE id=2108').get().demo_video_url);
for (const it of db.prepare('SELECT esi.sort_order, w.title, w.video_url FROM explore_section_items esi JOIN workouts w ON w.id=esi.item_id WHERE esi.section_id=8 ORDER BY esi.sort_order').all())
  console.log(`  sec8[${it.sort_order}] "${it.title}" ${it.video_url}`);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
