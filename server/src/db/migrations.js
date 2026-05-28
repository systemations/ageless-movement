import bcrypt from 'bcrypt';
import pool from './pool.js';
import { DEFAULT_CLIENT_TASKS } from '../lib/default-tasks.js';

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
  // Rename the kettlebell program to the AMS family naming, give it the
  // Kinstretch image, and hide the Kinstretch program from Explore.
  {
    name: '2026-05-27-rename-kettlebell-reuse-kinstretch-image',
    up: () => {
      const ks = pool.query("SELECT id, image_url FROM programs WHERE title LIKE 'AMS | Kinstretch%' LIMIT 1").rows[0];
      const kb = pool.query("SELECT id FROM programs WHERE title LIKE 'Kettlebell Foundations%' LIMIT 1").rows[0];
      if (kb) {
        pool.query(
          "UPDATE programs SET title = 'AMS | Kettlebell Foundations', image_url = ? WHERE id = ?",
          [ks?.image_url || null, kb.id],
        );
      }
      if (ks) {
        pool.query("DELETE FROM explore_section_items WHERE item_type = 'program' AND item_id = ?", [ks.id]);
        pool.query('UPDATE programs SET visible = 0 WHERE id = ?', [ks.id]);
      }
    },
  },
  // Strip the trailing ".0" from whole-number reps (a float artifact from the
  // spreadsheet imports: "10.0" should read "10"). Only touches values that
  // are a plain integer followed by ".0" - free-text reps like "8-10", "60s",
  // "1:00", "x2" are left alone. There are no genuine fractional reps.
  {
    name: '2026-05-27-strip-float-reps',
    up: () => {
      for (const table of ['workout_exercises', 'workout_exercise_alternates']) {
        pool.query(
          `UPDATE ${table}
             SET reps = substr(reps, 1, length(reps) - 2)
           WHERE reps LIKE '%.0'
             AND length(reps) > 2
             AND substr(reps, 1, length(reps) - 2) NOT GLOB '*[^0-9]*'`,
        );
      }
    },
  },
  // Retire the "Beta Testers" community group. The server no longer recreates
  // it; this removes the existing row + its memberships/reads/stars, but only
  // if no messages were ever posted (so any real discussion is preserved).
  {
    name: '2026-05-27-remove-beta-testers-group',
    up: () => {
      const g = pool.query(
        "SELECT id FROM conversations WHERE type = 'group' AND title = 'Beta Testers' AND client_id IS NULL",
      ).rows[0];
      if (!g) return;
      const msgs = pool.query('SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?', [g.id]).rows[0].c;
      if (msgs > 0) return;
      pool.query('DELETE FROM conversation_members WHERE conversation_id = ?', [g.id]);
      pool.query('DELETE FROM conversation_reads WHERE conversation_id = ?', [g.id]);
      pool.query('DELETE FROM conversation_stars WHERE conversation_id = ?', [g.id]);
      pool.query('DELETE FROM conversations WHERE id = ?', [g.id]);
    },
  },
  // Add a free "Testimonial Recording" session type for Coach Dan (user 2) so
  // clients can book a short recorded video chat from the testimonial flow.
  // event_format='testimonial' keeps it out of the normal 1:1 list; it's
  // reached by deep-link from the testimonial screen. Idempotent.
  {
    name: '2026-05-27-testimonial-recording-session',
    up: () => {
      const exists = pool.query(
        "SELECT id FROM coach_session_types WHERE coach_user_id = 2 AND event_format = 'testimonial'",
      ).rows[0];
      if (exists) return;
      pool.query(
        `INSERT INTO coach_session_types
           (coach_user_id, title, description, duration_minutes, price_cents, currency, event_format, is_active, sort_order)
         VALUES (2, 'Testimonial Recording',
           'A short, relaxed video call where you share your experience with Ageless Movement. With your permission we may feature clips on social media to help others discover the app.',
           15, 0, 'USD', 'testimonial', 1, 99)`,
      );
    },
  },
  // One-time password reset for the coach account so Dan can get back in
  // after losing the previous password. Runs once via schema_migrations and
  // never again - Dan changes the password from My Profile immediately
  // after first login. Safe to leave in the codebase since it's idempotent
  // (migration runs once) and a coach can always reset later via the same
  // path.
  {
    name: '2026-05-28-reset-coach-danny-password',
    up: () => {
      const hash = bcrypt.hashSync('AdminTemp2026!', 10);
      pool.query(
        "UPDATE users SET password_hash = ? WHERE email = 'danny@handsdan.com'",
        [hash],
      );
    },
  },
  // Same one-time reset for Coach Joonas (joonastics@gmail.com) so he can
  // log in on desktop. Idempotent via schema_migrations; Joonas changes the
  // password from My Profile immediately after first login. Silent no-op
  // on any DB where the email doesn't exist (e.g. dev seed).
  {
    name: '2026-05-28-reset-coach-joonas-password',
    up: () => {
      const hash = bcrypt.hashSync('JoonasTemp2026!', 10);
      pool.query(
        "UPDATE users SET password_hash = ? WHERE email = 'joonastics@gmail.com'",
        [hash],
      );
    },
  },
  // Same one-time reset pattern for the dan@systemations.ai account so Dan
  // can log in via that email. Case-insensitive match in case the email is
  // stored with different casing. Silent no-op where the email doesn't exist.
  {
    name: '2026-05-28-reset-dan-systemations-password',
    up: () => {
      const hash = bcrypt.hashSync('Australia2026', 10);
      pool.query(
        "UPDATE users SET password_hash = ? WHERE LOWER(email) = LOWER(?)",
        [hash, 'Dan@systemations.ai'],
      );
    },
  },
  // Populate Joonas's coach profile (Strength / Mobility / Joint Health) on
  // the live deployment. Idempotent: only fills empty/null fields so a
  // future manual edit by Dan or Joonas isn't clobbered.
  {
    name: '2026-05-28-populate-joonas-coach-profile',
    up: () => {
      const user = pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
        ['joonastics@gmail.com'],
      ).rows[0];
      if (!user) return; // not on this DB (e.g. dev seed)
      const exists = pool.query('SELECT id FROM coach_profiles WHERE user_id = ?', [user.id]).rows[0];
      if (!exists) {
        pool.query('INSERT INTO coach_profiles (user_id) VALUES (?)', [user.id]);
      }
      // COALESCE so any field already set by a coach edit stays. NULL/empty
      // fields get the values below.
      pool.query(
        `UPDATE coach_profiles SET
           headline = COALESCE(NULLIF(headline,''), ?),
           tagline = COALESCE(NULLIF(tagline,''), ?),
           specialties = COALESCE(NULLIF(specialties,''), ?),
           years_experience = COALESCE(years_experience, ?),
           origin_story = COALESCE(NULLIF(origin_story,''), ?),
           pull_quote = COALESCE(NULLIF(pull_quote,''), ?),
           help_bullets = COALESCE(NULLIF(help_bullets,''), ?),
           accent_color = COALESCE(NULLIF(accent_color,''), ?),
           is_public = COALESCE(is_public, 1)
         WHERE user_id = ?`,
        [
          'Strength, Mobility & Joint Health Coach',
          'Joonas loves helping people achieve more mobility and build resilient joints so they can stay active and do the things they love with less pain and more freedom.',
          'Mobility, Strength, Joint Health, Adult Gymnastics',
          4,
          'Joonas began coaching mobility and adult gymnastics strength training in Sydney, Australia 4 years ago. His fitness journey began with a passion for getting stronger and building more muscle, but after countless injuries stopping him from continuing to lift and pursue martial arts, he began delving into methods of training that would leave him feeling good rather than just looking good. Once he started to see results with more functional movement and mobility training, Joonas felt driven to help others overcome the same struggles of beating stiffness and joint pain.',
          "I knew there was something missing from my workouts but for a long time I wasn't sure what. I was getting stronger and building more muscle with calisthenics and weights, but my body still felt stiff and unagile. I also didn't have a way to manage constant joint pain and niggles which would stop me from not only working out, but pursuing new passions like martial arts, running and swimming. Luckily I found the world of mobility training which allows us to expand ranges of motion (so we can move more) while strengthening our joints specifically at the same time, making us less susceptible to injuries.",
          JSON.stringify([
            'Increase your ranges of motion, helping you to move in more ways',
            'Reduce tightness and stiffness',
            'Rehabilitate injuries and come back stronger',
            'Reduce the risk and severity of future injuries',
            'Prepare your joints for an active lifestyle',
          ]),
          '#85FFBA',
          user.id,
        ],
      );
    },
  },
  // The 24h post-signup "Ready to unlock more?" nudge fired for testers
  // before we gated it on beta_mode. Remove the stale notifications so
  // they don't keep popping up for beta users.
  {
    name: '2026-05-28-clear-stale-plans-nudges-beta',
    up: () => {
      pool.query(
        "DELETE FROM in_app_notifications WHERE title = 'Ready to unlock more?' AND cta_url = '/plans'",
      );
    },
  },
  // Backfill the default Home "Today's Tasks" for clients who registered
  // via /api/auth/register before the default-tasks seed shipped. Only
  // touches clients with zero existing tasks - anyone the coach already
  // assigned tasks to (or who added their own) is left alone.
  {
    name: '2026-05-28-backfill-default-client-tasks',
    up: () => {
      const clients = pool.query(
        "SELECT id FROM users WHERE role = 'client'",
      ).rows;
      for (const { id } of clients) {
        const c = pool.query('SELECT COUNT(*) AS c FROM tasks WHERE client_id = ?', [id]).rows[0].c;
        if (c > 0) continue;
        for (const label of DEFAULT_CLIENT_TASKS) {
          pool.query(
            'INSERT INTO tasks (coach_id, client_id, label, recurring) VALUES (NULL, ?, ?, 1)',
            [id, label],
          );
        }
      }
    },
  },
  // Re-date the existing demo events into the future and make them free so beta
  // testers can actually register (the free web beta charges nothing). Keyed by
  // title so it updates whatever the seed/live DB holds; preserves any existing
  // registrations. Re-run a fresh dated migration if these dates pass mid-beta.
  {
    name: '2026-05-27-refresh-demo-events-for-beta',
    up: () => {
      const reschedule = [
        ['Pickleball Mobility Masterclass', '2026-06-04T18:00'],
        ['5-Minute Morning Mobility Routine', '2026-06-11T07:00'],
        ['Ageless Movement Workshop', '2026-06-19T10:00'],
      ];
      for (const [title, when] of reschedule) {
        pool.query(
          "UPDATE coach_events SET scheduled_at = ?, status = 'published', price_cents = 0 WHERE title = ?",
          [when, title],
        );
      }
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
