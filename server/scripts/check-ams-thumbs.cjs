const db = require("better-sqlite3")("data/ageless.db");

// AMS workout thumbnails
const ams = db.prepare(`SELECT DISTINCT w.image_url, w.title, p.title as program
  FROM workouts w JOIN programs p ON w.program_id = p.id
  WHERE p.title LIKE '%AMS%' AND w.image_url IS NOT NULL AND length(w.image_url) > 0
  LIMIT 10`).all();
ams.forEach(r => console.log(r.program + " | " + r.title + " | " + r.image_url));

// Program-level thumbnails
console.log("\n--- Program thumbnails ---");
const progs = db.prepare("SELECT id, title, image_url FROM programs WHERE title LIKE '%AMS%'").all();
progs.forEach(p => console.log(p.id + " | " + p.title + " | " + (p.image_url || "NO THUMB")));

// Also check the Sweat Session
console.log("\n--- Sweat Session ---");
const sweat = db.prepare("SELECT id, title, image_url FROM workouts WHERE title LIKE '%Sweat%'").all();
sweat.forEach(w => console.log(w.id + " | " + w.title + " | " + (w.image_url || "NO THUMB")));

// Check uploaded files
console.log("\n--- Uploaded files ---");
const uploaded = db.prepare("SELECT DISTINCT image_url FROM workouts WHERE image_url LIKE '/uploads/%'").all();
uploaded.forEach(r => console.log(r.image_url));
const pUploaded = db.prepare("SELECT DISTINCT image_url FROM programs WHERE image_url LIKE '/uploads/%'").all();
pUploaded.forEach(r => console.log("program: " + r.image_url));
