import { backupDatabase } from '../db/pool.js';

// Scheduled DB backups (SECURITY.md L9). Writes the first backup a minute after
// boot (so a dev --watch restart storm doesn't fire one every reload — the
// timer resets on each restart), then once a day. Backups land on the same
// persistent disk as the DB; pair with a Render disk snapshot for off-box copies.
const DAY_MS = 24 * 60 * 60 * 1000;

export function startBackupJob() {
  const run = () => {
    try {
      const dest = backupDatabase();
      console.log(`[backup] wrote ${dest}`);
    } catch (e) {
      console.error('[backup] failed:', e.message);
    }
  };
  setTimeout(run, 60_000);
  setInterval(run, DAY_MS);
}
