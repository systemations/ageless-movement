import pool from './pool.js';

// One-shot migration: replace em dashes ( - , U+2014) with " - " (hyphen with
// surrounding spaces) across all user-facing TEXT columns in the SQLite DB.
// Idempotent: if the column has no em dashes the UPDATE is a no-op.
//
// Why a migration: code + seed sources were swept on 2026-05-15, but rows
// already inserted into the prod SQLite at server/data/ageless.db carry the
// original em-dash content (workout descriptions seeded long ago, etc).
// Running once on server start cleans prod without a manual sqlite session.
//
// Drop this file once we're satisfied prod has been swept. The migration
// itself is safe to re-run forever.

const TABLES = [
  ['workouts', ['title', 'description']],
  ['exercises', ['name', 'description', 'tips', 'cues']],
  ['programs', ['title', 'description', 'subtitle']],
  ['course_lessons', ['title', 'description']],
  ['courses', ['title', 'description', 'subtitle']],
  ['payment_plans', ['name', 'description']],
  ['coach_session_types', ['title', 'description']],
  ['coach_events', ['title', 'description', 'location']],
  ['coach_profiles', ['bio', 'headline', 'tagline', 'origin_story', 'pull_quote', 'qualifications']],
  ['benchmarks', ['name', 'description']],
  ['challenges', ['title', 'description']],
  ['explore_sections', ['title', 'description']],
  ['client_pricing_tiers', ['name', 'description', 'features']],
  ['coach_pricing_tiers', ['name', 'description']],
];

export function sweepEmDashes() {
  let touched = 0;
  for (const [table, cols] of TABLES) {
    for (const col of cols) {
      try {
        const n = pool.query(
          `SELECT COUNT(*) as c FROM ${table} WHERE ${col} LIKE '%—%'`,
        ).rows[0].c;
        if (n > 0) {
          pool.query(
            `UPDATE ${table} SET ${col} = REPLACE(${col}, '—', ' - ') WHERE ${col} LIKE '%—%'`,
          );
          // Collapse the double-space sequences the replacement can introduce
          pool.query(
            `UPDATE ${table} SET ${col} = REPLACE(REPLACE(${col}, '  - ', ' - '), ' -  ', ' - ') WHERE ${col} LIKE '%  - %' OR ${col} LIKE '% -  %'`,
          );
          touched += n;
        }
      } catch {
        // column or table doesn't exist on this schema version - silent
      }
    }
  }
  if (touched > 0) {
    console.log(`[em-dash sweep] cleaned ${touched} row(s)`);
  }
}
