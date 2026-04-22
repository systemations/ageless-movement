const db = require("better-sqlite3")("data/ageless.db");

const total = db.prepare("SELECT COUNT(*) as c FROM workouts").get();
const withImg = db.prepare("SELECT COUNT(*) as c FROM workouts WHERE image_url IS NOT NULL AND length(image_url) > 0").get();
const noImg = db.prepare("SELECT COUNT(*) as c FROM workouts WHERE image_url IS NULL OR length(image_url) = 0").get();

console.log("Total workouts:", total.c);
console.log("With thumbnail:", withImg.c);
console.log("Without thumbnail:", noImg.c);

const images = db.prepare("SELECT image_url, COUNT(*) as c FROM workouts WHERE image_url IS NOT NULL AND length(image_url) > 0 GROUP BY image_url ORDER BY c DESC").all();
console.log("\nDistinct thumbnails (" + images.length + "):");
images.forEach(r => console.log("  [" + r.c + "x]", r.image_url));

// Show workouts grouped by program with their thumbnail status
console.log("\n--- Workouts by program ---");
const programs = db.prepare("SELECT p.id, p.title, COUNT(w.id) as wcount, SUM(CASE WHEN w.image_url IS NOT NULL AND length(w.image_url) > 0 THEN 1 ELSE 0 END) as with_thumb FROM programs p LEFT JOIN workouts w ON w.program_id = p.id GROUP BY p.id ORDER BY p.title").all();
programs.forEach(p => {
  console.log(`${p.title} (id=${p.id}): ${p.wcount} workouts, ${p.with_thumb} with thumbs`);
});

// Standalone workouts (no program)
const standalone = db.prepare("SELECT id, title, image_url, workout_type FROM workouts WHERE program_id IS NULL ORDER BY title").all();
console.log("\n--- Standalone workouts (" + standalone.length + ") ---");
standalone.forEach(w => {
  console.log(`  [${w.id}] ${w.title} | type=${w.workout_type} | thumb=${w.image_url ? 'YES' : 'NO'}`);
});
