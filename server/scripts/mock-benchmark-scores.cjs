// Mock realistic benchmark attempts, step logs, and streaks for every
// client so the leaderboards + Home Challenges card have data to render.
//
// Idempotent: wipes prior mock data (all benchmark_attempts, all step_logs,
// resets streaks) before re-seeding.
//
// Usage: node scripts/mock-benchmark-scores.cjs

const path = require('path');
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');

function rand(min, max) { return min + Math.random() * (max - min); }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }
function weightedLevel() {
  // 5% at lv0, 20% lv1, 30% lv2, 25% lv3, 15% lv4, 5% lv5
  const r = Math.random();
  if (r < 0.05) return 0;
  if (r < 0.25) return 1;
  if (r < 0.55) return 2;
  if (r < 0.80) return 3;
  if (r < 0.95) return 4;
  return 5;
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const clients = db.prepare(
    "SELECT u.id, u.name, cp.age, cp.gender FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.role = 'client'"
  ).all();

  const benchmarks = db.prepare('SELECT * FROM benchmarks').all();
  const levelsByBm = {};
  for (const l of db.prepare('SELECT * FROM benchmark_levels ORDER BY benchmark_id, level_number').all()) {
    if (!levelsByBm[l.benchmark_id]) levelsByBm[l.benchmark_id] = [];
    levelsByBm[l.benchmark_id].push(l);
  }

  // Backfill missing demographics for Dan's test accounts so they appear in
  // filtered leaderboards.
  db.prepare("UPDATE client_profiles SET age = COALESCE(age, 40), gender = COALESCE(gender, 'male') WHERE user_id IN (SELECT id FROM users WHERE role='client')").run();
  // If client_profile row missing entirely, insert a row with defaults.
  const ensureProfile = db.prepare(`
    INSERT INTO client_profiles (user_id, age, gender) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      age = COALESCE(client_profiles.age, excluded.age),
      gender = COALESCE(client_profiles.gender, excluded.gender)
  `);
  for (const c of clients) {
    if (!c.gender || !c.age) {
      const gender = c.gender || (Math.random() < 0.5 ? 'male' : 'female');
      const age = c.age || randi(25, 55);
      ensureProfile.run(c.id, age, gender);
    }
  }

  // Clear prior mock
  db.prepare('DELETE FROM benchmark_attempts').run();
  db.prepare('DELETE FROM step_logs').run();
  db.prepare('DELETE FROM streaks').run();

  const insAttempt = db.prepare(`
    INSERT INTO benchmark_attempts
      (user_id, benchmark_id, value, notes, video_url, status, reviewed_by_user_id, reviewed_at, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insStep = db.prepare('INSERT INTO step_logs (user_id, date, steps, created_at) VALUES (?, ?, ?, ?)');
  const insStreak = db.prepare(
    'INSERT INTO streaks (user_id, current_streak, best_streak, last_activity_date) VALUES (?, ?, ?, ?)'
  );

  const today = new Date();
  let attempts = 0, stepRows = 0;

  // Find a coach id for reviewed_by
  const coach = db.prepare("SELECT id FROM users WHERE role='coach' LIMIT 1").get();

  for (const c of clients) {
    const profile = db.prepare('SELECT age, gender FROM client_profiles WHERE user_id = ?').get(c.id) || {};
    const gender = (profile.gender || 'male').toLowerCase();
    const thresholdKey = gender === 'female' ? 'female_threshold' : 'male_threshold';

    for (const bm of benchmarks) {
      if (bm.type !== 'numeric') continue;         // skill_ladder skipped for mock
      if (Math.random() < 0.25) continue;           // not every client has every test

      const levels = levelsByBm[bm.id];
      if (!levels || !levels.length) continue;

      const targetLevel = weightedLevel();
      if (targetLevel === 0) continue;

      const targetLvl = levels.find(l => l.level_number === targetLevel);
      const nextLvl   = levels.find(l => l.level_number === targetLevel + 1);
      const tTarget = targetLvl?.[thresholdKey];
      const tNext   = nextLvl?.[thresholdKey];
      if (tTarget == null) continue;

      // Pick a value strictly between this level's threshold and the next.
      let value;
      if (bm.direction === 'lower') {
        const upper = tTarget;
        const lower = tNext != null ? tNext : tTarget * 0.85;
        value = rand(lower, upper);
      } else {
        const lower = tTarget;
        const upper = tNext != null ? tNext : tTarget * 1.15;
        value = rand(lower, upper);
      }

      // Round sensibly per unit
      if (['reps','watts','cal'].includes(bm.unit)) value = Math.round(value);
      else if (bm.unit === 'seconds') value = Math.round(value);
      else if (bm.unit === 'kg') value = Math.round(value * 2) / 2;  // nearest 0.5

      // 65% verified, 20% self_reported, 15% pending_review
      const r = Math.random();
      let status = 'self_reported';
      if (r < 0.65) status = 'verified';
      else if (r < 0.85) status = 'self_reported';
      else status = 'pending_review';

      const daysAgo = randi(1, 45);
      const submittedAt = new Date(today.getTime() - daysAgo * 86400000).toISOString();
      const reviewedAt = status === 'verified' ? new Date(today.getTime() - (daysAgo - 1) * 86400000).toISOString() : null;
      const reviewedBy = status === 'verified' ? (coach?.id || null) : null;
      const videoUrl = bm.requires_video && status !== 'self_reported'
        ? `https://example.com/vids/${bm.slug}-${c.id}.mp4`
        : null;

      insAttempt.run(c.id, bm.id, value, null, videoUrl, status, reviewedBy, reviewedAt, submittedAt);
      attempts++;
    }

    // Step logs — last 30 days with user-specific typical range
    const stepAvg = randi(3000, 14000);
    const stepVar = randi(1000, 3500);
    for (let d = 0; d < 30; d++) {
      if (Math.random() < 0.15) continue; // ~15% off days
      const date = new Date(today.getTime() - d * 86400000).toISOString().split('T')[0];
      const steps = Math.max(0, Math.round(stepAvg + (Math.random() - 0.5) * 2 * stepVar));
      insStep.run(c.id, date, steps, date);
      stepRows++;
    }

    // Streaks — random current + best
    const currentStreak = randi(0, 30);
    const bestStreak = Math.max(currentStreak, randi(currentStreak, 60));
    const lastDate = currentStreak > 0 ? today.toISOString().split('T')[0] : new Date(today.getTime() - randi(2, 14) * 86400000).toISOString().split('T')[0];
    insStreak.run(c.id, currentStreak, bestStreak, lastDate);
  }

  console.log(`seeded ${attempts} benchmark attempts, ${stepRows} step rows, streaks for ${clients.length} clients`);
  db.close();
}

main();
