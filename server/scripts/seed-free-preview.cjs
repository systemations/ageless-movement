#!/usr/bin/env node
// One-shot seed: flag Day 1 of AMS Ground Zero as a free preview so
// Free-tier clients get a single unlocked workout on signup.
//
// Idempotent — safe to re-run; will just log the current state.
//
// Run on Render: open a shell on the ageless-movement service and:
//   node server/scripts/seed-free-preview.cjs

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');
const GROUND_ZERO_ID = 1;

function main() {
  console.log(`Opening ${DB_PATH}`);
  const db = new Database(DB_PATH);

  const day1 = db.prepare(`
    SELECT id, title, is_free_preview FROM workouts
    WHERE program_id = ? AND week_number = 1 AND day_number = 1
  `).get(GROUND_ZERO_ID);

  if (!day1) {
    console.error(`No Day 1 workout found for program_id=${GROUND_ZERO_ID}; aborting`);
    process.exit(1);
  }

  console.log(`Day 1 of Ground Zero: id=${day1.id} "${day1.title}"`);
  console.log(`  current is_free_preview=${day1.is_free_preview}`);

  if (day1.is_free_preview === 1) {
    console.log(`  already flagged — nothing to do`);
  } else {
    db.prepare('UPDATE workouts SET is_free_preview = 1 WHERE id = ?').run(day1.id);
    console.log(`  flipped to is_free_preview=1`);
  }

  db.close();
  console.log('Done.');
}

main();
