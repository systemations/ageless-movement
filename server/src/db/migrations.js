import pool from './pool.js';

// Run-once content/schema migrations, applied on every boot. This is how
// content reaches an ALREADY-POPULATED production DB without the destructive
// seed reseed (which wipes user data). Once real users exist we never bump
// SEED_VERSION; instead we add a migration here.
//
// Rules for each migration:
//   - `name` is a stable unique id (dated). Never rename or reuse a name.
//   - `up()` must be safe and additive: create/insert/update content, never
//     delete user-generated rows. Use INSERT OR IGNORE / IF NOT EXISTS so a
//     half-applied run is recoverable.
//   - Each runs exactly once (tracked in schema_migrations).
//
// Example:
//   { name: '2026-06-10-add-mobility-program', up: () => { pool.query('INSERT ...'); } },
const MIGRATIONS = [
  // Move the Kettlebell Foundations program to the front of the "Programs"
  // Explore section (it was added last, so it sat off-screen at the end of
  // the carousel). Pure sort_order change - no user data touched.
  {
    name: '2026-05-27-kettlebell-front-of-programs',
    up: () => {
      const sec = pool.query("SELECT id FROM explore_sections WHERE title = 'Programs' AND content_type = 'program' LIMIT 1").rows[0];
      const kb = pool.query("SELECT id FROM programs WHERE title LIKE 'Kettlebell Foundations%' LIMIT 1").rows[0];
      if (!sec || !kb) return;
      const min = pool.query('SELECT MIN(sort_order) AS m FROM explore_section_items WHERE section_id = ?', [sec.id]).rows[0]?.m ?? 0;
      pool.query(
        "UPDATE explore_section_items SET sort_order = ? WHERE section_id = ? AND item_type = 'program' AND item_id = ?",
        [min - 1, sec.id, kb.id],
      );
    },
  },
];

export function runMigrations() {
  pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(pool.query('SELECT name FROM schema_migrations').rows.map(r => r.name));
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    try {
      m.up();
      pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]);
      count++;
      console.log(`[migrations] applied ${m.name}`);
    } catch (e) {
      // Stop on first failure so migrations stay ordered and recoverable.
      console.error(`[migrations] FAILED ${m.name}:`, e.message);
      break;
    }
  }
  if (count) console.log(`[migrations] ${count} migration(s) applied`);
}
