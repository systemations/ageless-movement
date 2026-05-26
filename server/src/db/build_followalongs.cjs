#!/usr/bin/env node
/* Standalone follow-along workouts wired into Explore sections.
   Idempotent: keyed by title (program_id NULL); re-running rebuilds the row
   and its explore_section_items placement. */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'));

// section_id: TRX = 16, Stretching = 6, Mobility-Follow-Along = 8, GST = 17
const ITEMS = [
  {
    section_id: 16,
    title: 'TRX | Full Body Follow Along',
    description: 'A full-body TRX suspension-trainer follow-along session.',
    duration_mins: 19, intensity: 'Moderate', body_parts: 'Full Body', equipment: 'TRX',
    video_url: 'https://vimeo.com/941419661',
    image_url: 'https://i.vimeocdn.com/video/1844405307-eb00a8ddb40a2813f1a7da56fd4666146eacc34dc4e06db00f1c3e5b50597a13-d_295x166?region=us',
  },
  {
    section_id: 17, // Gymnastics Strength Training (placeholder home - confirm w/ Dan)
    title: 'Handstands Class | Beginner Follow Along',
    description: 'A beginner-friendly handstand class to get you more comfortable on your hands.',
    duration_mins: 60, intensity: 'Moderate', body_parts: 'Full Body, Shoulders, Hips', equipment: 'Loop Band, Fabric Resistance Band',
    video_url: 'https://vimeo.com/425084783/183494c968',
    image_url: 'https://i.vimeocdn.com/video/1570158408-56c2220faeaaddaadb72fbafb823e9661ca47fecbe1f88151b4ce2b2589e3200-d_295x166?region=us',
  },
  // --- Mobility - Follow Along (section 8) new additions ---
  {
    section_id: 8, title: 'L-Sit Training Follow Along',
    description: 'A follow-along L-sit progression session.',
    duration_mins: 14, intensity: 'Moderate', body_parts: 'Core, Hips', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/921432761',
    image_url: 'https://i.vimeocdn.com/video/1814128833-702ad0070f7d8464677548e6139ecdacac300d0e8b45cba2fd88dd60a458abc6-d_295x166?region=us',
  },
  {
    section_id: 8, title: 'Ankle Mobility Follow Along',
    description: 'A 25-minute follow-along ankle mobility session.',
    duration_mins: 24, intensity: 'Low', body_parts: 'Ankles, Calves', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/964915583/81962fd988',
    image_url: 'https://i.vimeocdn.com/video/1877544089-f1848ea0467946d0f29ac132fe13fba9dcf6cb23f2bf411bdd56608a51d395e6-d_295x166?region=us',
  },
  {
    section_id: 8, title: 'Shoulder Mobility Follow Along',
    description: 'A 15-minute follow-along shoulder mobility session.',
    duration_mins: 15, intensity: 'Low', body_parts: 'Shoulders', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/963818482/d3c830d8a8',
    image_url: 'https://i.vimeocdn.com/video/1876532250-9c65f816119d04670b919b69484614dd22f6826688bb8def33b599c536fb25c3-d_295x166?region=us',
  },
  {
    section_id: 8, title: "Full Body CARs Routine Follow Along",
    description: 'A full-body controlled articular rotations (CARs) mobility routine.',
    duration_mins: 9, intensity: 'Low', body_parts: 'Full Body', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/958682750',
    image_url: 'https://i.vimeocdn.com/video/1875674029-31171d7dc66135f331904d29fe87c28b887effb583f3464ad92a5ce96965c7e3-d_295x166?region=us',
  },
  {
    section_id: 8, title: 'Mobility | Hips, Shoulders & Spine Follow Along',
    description: 'A 20-minute follow-along mobility session for the hips, shoulders and spine.',
    duration_mins: 24, intensity: 'Low', body_parts: 'Hips, Shoulders, Spine', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/953754850',
    image_url: 'https://i.vimeocdn.com/video/1875674178-fbe512e970d5f7ea428bf4aeaca555b1e61afff16f2ca692d6eb99906578a8c1-d_295x166?region=us',
  },
  {
    section_id: 8, title: 'Spine Mobility Follow Along (28 Min)',
    description: 'An extended 28-minute follow-along spine mobility session.',
    duration_mins: 28, intensity: 'Low', body_parts: 'Spine', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/1010436611',
    image_url: 'https://i.vimeocdn.com/video/1927800894-9bede987f889689bc1e3e8764c941feb426457f785404c6d150630d71af6419a-d_295x166?region=us',
  },
  {
    section_id: 8, title: 'Full Body Mobility Follow Along (10 Min)',
    description: 'A 10-minute full-body mobility follow-along session.',
    duration_mins: 11, intensity: 'Low', body_parts: 'Full Body', equipment: 'Body Weight',
    video_url: 'https://vimeo.com/957984260',
    image_url: 'https://i.vimeocdn.com/video/1875673896-264c05a57f2757980daebf26ec430431c9aea8b1c13aea19f5694dec8538f423-d_295x166?region=us',
  },
];

const tx = db.transaction(() => {
  for (const it of ITEMS) {
    for (const o of db.prepare('SELECT id FROM workouts WHERE program_id IS NULL AND title = ?').all(it.title)) {
      db.prepare("DELETE FROM explore_section_items WHERE item_type='workout' AND item_id = ?").run(o.id);
      db.prepare('DELETE FROM workouts WHERE id = ?').run(o.id);
    }
    const info = db.prepare(`
      INSERT INTO workouts (program_id, title, description, duration_mins, intensity, body_parts, equipment, workout_type, image_url, video_url, visible, status, is_free_preview)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, 'follow_along', ?, ?, 1, 'draft', 0)`)
      .run(it.title, it.description, it.duration_mins, it.intensity, it.body_parts, it.equipment, it.image_url, it.video_url);
    const wid = info.lastInsertRowid;
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM explore_section_items WHERE section_id = ?').get(it.section_id).m;
    db.prepare("INSERT INTO explore_section_items (section_id, item_type, item_id, sort_order) VALUES (?, 'workout', ?, ?)").run(it.section_id, wid, maxSort + 1);
    console.log(`built [${wid}] "${it.title}" -> section ${it.section_id}`);
  }
});
tx();
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
