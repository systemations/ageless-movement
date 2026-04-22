const db = require("better-sqlite3")("data/ageless.db");

// Broad categories with the granular body_part substrings that map to them
const CATEGORIES = [
  { name: 'Hip Exercises', match: ['hip', 'glute'] },
  { name: 'Back Exercises', match: ['back', 'lat', 'rhomb', 'erector', 'trap'] },
  { name: 'Shoulder Exercises', match: ['delt', 'shoulder', 'rotator'] },
  { name: 'Core Exercises', match: ['abdom', 'core', 'obliq'] },
  { name: 'Arm Exercises', match: ['bicep', 'tricep', 'forearm', 'brach'] },
  { name: 'Leg Exercises', match: ['quad', 'hamstring', 'calf', 'tibial'] },
  { name: 'Chest Exercises', match: ['pec', 'chest'] },
  { name: 'Full Body Exercises', match: ['full body'] },
];

// Get the max sort_order from existing sections in the fitness tab
const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM explore_sections WHERE parent_tab = 'fitness'").get();
let sortOrder = (maxOrder?.m || 0) + 1;

// Ensure content_type column exists
try { db.exec("ALTER TABLE explore_sections ADD COLUMN content_type TEXT"); } catch (e) { /* already exists */ }

const allExercises = db.prepare("SELECT id, name, body_part FROM exercises WHERE demo_video_url IS NOT NULL AND length(demo_video_url) > 0").all();
console.log("Exercises with videos:", allExercises.length);

let totalInserted = 0;

for (const cat of CATEGORIES) {
  // Find exercises matching this category
  const matching = allExercises.filter(ex => {
    if (!ex.body_part) return false;
    const bp = ex.body_part.toLowerCase();
    return cat.match.some(m => bp.includes(m));
  });

  if (matching.length === 0) {
    console.log(`Skipping ${cat.name} -- no exercises`);
    continue;
  }

  // Limit to 20 exercises per section (prioritise ones with thumbnails)
  const withThumb = db.prepare(
    `SELECT id FROM exercises WHERE id IN (${matching.map(() => '?').join(',')}) AND thumbnail_url IS NOT NULL AND length(thumbnail_url) > 0`
  ).all(...matching.map(e => e.id));
  const withoutThumb = matching.filter(e => !withThumb.find(t => t.id === e.id));
  const selected = [...withThumb.map(t => matching.find(e => e.id === t.id)), ...withoutThumb].slice(0, 20);

  // Create explore section
  const info = db.prepare(
    "INSERT INTO explore_sections (title, section_type, layout, tile_size, sort_order, visible, parent_tab, content_type) VALUES (?, 'carousel', 'square', 'small', ?, 1, 'fitness', 'exercise')"
  ).run(cat.name, sortOrder++);

  const sectionId = info.lastInsertRowid;

  // Insert items
  const insert = db.prepare(
    "INSERT INTO explore_section_items (section_id, item_type, item_id, sort_order) VALUES (?, 'exercise', ?, ?)"
  );
  selected.forEach((ex, i) => {
    insert.run(sectionId, ex.id, i);
  });

  console.log(`${cat.name}: ${selected.length} exercises (section ${sectionId})`);
  totalInserted += selected.length;
}

console.log(`\nDone. ${totalInserted} exercises added across ${CATEGORIES.length} sections.`);
