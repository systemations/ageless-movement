// Reseed Dan's supplement stack from Dan_12wk_Program.json with clean section
// grouping so the Supplement Plan UI renders as the original design intended:
// Upon Waking → After Breakfast → Pre-Training → Before Bed → As Needed.
//
// Idempotent: wipes Dan's existing supplements first.
// Usage: node scripts/seed-dan-supplements.cjs

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DAN_USER_ID = 1;
const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');
const PROGRAM_JSON = path.join(__dirname, '..', 'import-data', 'dan-block-2026-04', 'Dan_12wk_Program.json');

// Map a timing string to { section, section_order }.
// Section names match what the client UI displays as a divider label.
function sectionFor(timing) {
  const t = (timing || '').toLowerCase();
  if (t === 'bedtime') return { section: 'Before Bed', section_order: 40 };
  if (t.includes('pre_training') || t === 'with_collagen') return { section: 'Pre-Training', section_order: 30 };
  // "AM", "AM_with_fat", "with_D3", "daily_any_time", "anytime", "with_meals" — all batched with morning meal.
  return { section: 'After Breakfast', section_order: 20 };
}

function main() {
  const prog = JSON.parse(fs.readFileSync(PROGRAM_JSON, 'utf-8'));
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const tx = db.transaction(() => {
    // Clear existing for Dan (will cascade into supplement_logs via FK).
    db.prepare('DELETE FROM supplements WHERE user_id = ?').run(DAN_USER_ID);

    const insert = db.prepare(`
      INSERT INTO supplements
        (user_id, name, dose, timing, rationale, section, section_order, sort_order,
         is_conditional, conditional_trigger, double_on_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let order = 0;
    for (const s of (prog.supplements || [])) {
      const { section, section_order } = sectionFor(s.timing);
      insert.run(
        DAN_USER_ID,
        s.name,
        s.dose || null,
        s.timing || null,
        s.rationale || null,
        section,
        section_order,
        order++,
        0, // not conditional
        null,
        Array.isArray(s.double_on_days) && s.double_on_days.length ? JSON.stringify(s.double_on_days) : null
      );
    }

    for (const s of (prog.supplements_conditional || [])) {
      insert.run(
        DAN_USER_ID,
        s.name,
        s.dose || null,
        null, // conditional items aren't tied to a clock time
        null,
        'As Needed',
        50,
        order++,
        1,
        s.trigger || null,
        null
      );
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM supplements WHERE user_id = ?').get(DAN_USER_ID).c;
    console.log(`seeded ${count} supplements for user ${DAN_USER_ID}`);
  });

  tx();
  db.close();
}

main();
