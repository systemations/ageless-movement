const db = require("better-sqlite3")("data/ageless.db");
const rows = db.prepare("SELECT id, name, demo_video_url FROM exercises WHERE demo_video_url IS NOT NULL AND length(demo_video_url) > 0 AND (thumbnail_url IS NULL OR thumbnail_url = '')").all();
console.log("Missing thumbnails:", rows.length);

// Categorize URL types
const types = {};
rows.forEach(r => {
  let type = 'unknown';
  if (r.demo_video_url.includes('player.vimeo.com/external/')) type = 'player_external';
  else if (r.demo_video_url.includes('/manage/videos/')) type = 'manage';
  else if (r.demo_video_url.match(/vimeo\.com\/\d+/)) type = 'standard';
  else if (r.demo_video_url.includes('player.vimeo.com')) type = 'player_other';
  types[type] = (types[type] || 0) + 1;
});
console.log("\nURL type breakdown:", types);

// Show samples of each type
Object.keys(types).forEach(type => {
  const sample = rows.find(r => {
    if (type === 'player_external') return r.demo_video_url.includes('player.vimeo.com/external/');
    if (type === 'manage') return r.demo_video_url.includes('/manage/videos/');
    if (type === 'standard') return r.demo_video_url.match(/vimeo\.com\/\d+/);
    return true;
  });
  if (sample) console.log(`\n${type} sample:`, sample.demo_video_url);
});
