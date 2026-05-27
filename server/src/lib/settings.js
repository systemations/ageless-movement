import pool from '../db/pool.js';

// Simple global key/value settings store. Created idempotently on import so it
// ships without a separate migration (same pattern as the feedback table).
pool.query(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Default beta mode ON so beta-checklist reminders run until the coach flips it
// off at the end of testing. INSERT OR IGNORE leaves an existing value alone.
pool.query("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('beta_mode', '1')");

export function getSetting(key, fallback = null) {
  const row = pool.query('SELECT value FROM app_settings WHERE key = ?', [key]).rows[0];
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, String(value)],
  );
}

export function isBetaMode() {
  return getSetting('beta_mode', '1') === '1';
}
