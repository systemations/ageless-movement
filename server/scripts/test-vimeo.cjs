const db = require("better-sqlite3")("data/ageless.db");
const rows = db.prepare("SELECT id, name, demo_video_url FROM exercises WHERE demo_video_url IS NOT NULL AND length(demo_video_url) > 0").all();
console.log("Total with video:", rows.length);
rows.slice(0, 5).forEach(r => console.log(r.id, "|", r.demo_video_url));

// Extract a vimeo ID
const url = rows[0].demo_video_url;
const match = url.match(/vimeo\.com\/(\d+)/);
console.log("\nFirst video ID:", match ? match[1] : "no match", "from", url);
