import bcrypt from 'bcrypt';
import pool from './pool.js';
import { DEFAULT_CLIENT_TASKS } from '../lib/default-tasks.js';
import { CARLA, NEW_EXERCISES, SESSIONS as CARLA_SESSIONS } from './seed-carla-phase-1.js';

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
  // Seed the initial Terms / Privacy consent versions (SECURITY.md L8). The
  // copy still needs legal review — version dates let us prompt re-consent when
  // it changes. Idempotent via the UNIQUE(kind, version) constraint.
  {
    name: '2026-06-13-seed-consent-versions',
    up: () => {
      pool.query("INSERT OR IGNORE INTO consent_versions (kind, version, summary, effective_date, is_current) VALUES ('terms', '2026-06-13', 'Initial Terms of Service', '2026-06-13', 1)");
      pool.query("INSERT OR IGNORE INTO consent_versions (kind, version, summary, effective_date, is_current) VALUES ('privacy', '2026-06-13', 'Initial Privacy Policy', '2026-06-13', 1)");
    },
  },
  // Draft/Published rollout: workouts.status existed before this feature but
  // was never used for client gating (clients gate on `visible`), so ~92% of
  // coach workouts sit at the column default 'draft' while being fully live.
  // Backfill every existing coach-template workout (owner_user_id IS NULL) to
  // 'published' so adding the new client-side status guard doesn't hide live
  // content. Runs once; workouts created after this default to 'draft' via the
  // route and are the only drafts going forward. Client-built workouts
  // (owner_user_id set) are left untouched - their status is irrelevant.
  {
    name: '2026-06-12-backfill-coach-workout-status-published',
    up: () => {
      pool.query(
        "UPDATE workouts SET status = 'published' WHERE owner_user_id IS NULL AND COALESCE(status, '') <> 'published'",
      );
    },
  },
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
  // Joonas's live account (joonastics@gmail.com) was created as a CLIENT and
  // his role was never flipped to coach. The desktop router sends role=coach
  // to /admin and everyone else to /home, so he kept landing on the client
  // app with the onboarding checklist instead of the coach admin surface.
  // This sets role='coach' for that one account. Single-row, by email,
  // non-destructive (no delete - preserves the account + its coach profile).
  // Idempotent via schema_migrations; case-insensitive match; silent no-op
  // on any DB where the email doesn't exist (e.g. the dev seed, which uses
  // joonas@coach.com instead).
  {
    name: '2026-06-04-set-joonas-role-coach',
    up: () => {
      pool.query(
        "UPDATE users SET role = 'coach' WHERE LOWER(email) = LOWER(?)",
        ['joonastics@gmail.com'],
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
  // Batch: four new exercises (Joonas demos) + merge two supine/inverted
  // duplicate rows Dan flagged. "Supine barbell <X>" and "Inverted barbell
  // <X>" describe the same movement; Supine is canonical because those
  // rows already have the demo videos.
  {
    name: '2026-05-29-exercises-batch-2',
    up: () => {
      const addIfMissing = (name, body_part, exercise_type, video) => {
        const existing = pool.query('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [name]).rows[0];
        if (existing) {
          // Backfill the video if the existing row lacks one.
          const cur = pool.query('SELECT demo_video_url FROM exercises WHERE id = ?', [existing.id]).rows[0];
          if (!cur?.demo_video_url) {
            pool.query('UPDATE exercises SET demo_video_url = ? WHERE id = ?', [video, existing.id]);
          }
          return existing.id;
        }
        return pool.query(
          'INSERT INTO exercises (name, body_part, exercise_type, demo_video_url) VALUES (?, ?, ?, ?) RETURNING id',
          [name, body_part, exercise_type, video],
        ).rows[0].id;
      };

      addIfMissing('Foam Roller Hack Squat',          'Quadriceps, Gluteus Maximus',     'Strength',  'https://vimeo.com/1190868003');
      addIfMissing('Ankle Plantarflexion Isometrics', 'Gastrocnemius, Soleus',           'Mobility',  'https://vimeo.com/1190865051');
      addIfMissing('Bench Hip Flexor Stretch',        'Hip Flexors, Quadriceps',         'Stretching','https://vimeo.com/1088672096');
      addIfMissing('Elbow Supination Banded',         'Forearm, Biceps',                 'Mobility',  'https://vimeo.com/1058403797');

      // Merge duplicates: redirect any workout_exercises rows, then delete
      // the dupe row. Scoped lookups by exact name so we only touch the
      // ones Dan flagged.
      const merges = [
        { fromName: 'Inverted Barbell Chin Up', toName: 'Supine Barbell Chin Up' },
        { fromName: 'Inverted Barbell Pull Up', toName: 'Supine Barbell Pull Up' },
      ];
      for (const { fromName, toName } of merges) {
        const from = pool.query('SELECT id FROM exercises WHERE name = ?', [fromName]).rows[0];
        const to   = pool.query('SELECT id FROM exercises WHERE name = ?', [toName]).rows[0];
        if (!from || !to) continue;
        pool.query('UPDATE workout_exercises SET exercise_id = ? WHERE exercise_id = ?', [to.id, from.id]);
        // Also catch any per-instance alternates / global alternatives pointing at the dupe.
        try { pool.query('UPDATE workout_exercise_alternates SET alternative_id = ? WHERE alternative_id = ?', [to.id, from.id]); } catch {}
        try { pool.query('UPDATE exercise_alternatives SET exercise_id = ? WHERE exercise_id = ?', [to.id, from.id]); } catch {}
        try { pool.query('UPDATE exercise_alternatives SET alternative_id = ? WHERE alternative_id = ?', [to.id, from.id]); } catch {}
        pool.query('DELETE FROM exercises WHERE id = ?', [from.id]);
      }
    },
  },
  // Final cleanup of the leaderboard seed on Dan's account: drop the mock
  // 28-day streak so the real workout-log-driven count takes over. (Steps,
  // welcome DM, and carnivore re-allocation handled by the migration below;
  // running this AFTER it so a single boot picks up everything.)
  {
    name: '2026-05-29-clear-dan-mock-streak',
    up: () => {
      const dan = pool.query(
        "SELECT id FROM users WHERE LOWER(email) = 'dan@systemations.ai'",
      ).rows[0];
      if (!dan) return;
      // Reset to zero; subsequent workout logs will bump current_streak and
      // best_streak normally via the explore.js workout-log handler.
      pool.query(
        'UPDATE streaks SET current_streak = 0, best_streak = 0, last_activity_date = NULL WHERE user_id = ?',
        [dan.id],
      );
    },
  },

  // Undo the side-effects of the leaderboard seed on Dan's REAL account:
  // mock step_logs were polluting his daily steps counter (and not
  // resetting), the welcome DM re-fired because a stale post_signup_tasks
  // row was still pending, and the carnivore meal schedule allocation
  // hadn't taken on the live DB. Idempotent on every step.
  {
    name: '2026-05-29-fix-dan-mock-data',
    up: () => {
      const dan = pool.query(
        "SELECT id FROM users WHERE LOWER(email) = 'dan@systemations.ai'",
      ).rows[0];
      if (!dan) return;

      // 1. Mock steps: clear last 14 days so Dan starts the day at zero
      //    and his real logging takes over.
      pool.query(
        "DELETE FROM step_logs WHERE user_id = ? AND date >= date('now', '-14 days')",
        [dan.id],
      );

      // 2. Carnivore allocation - re-apply (safe if already present).
      pool.query(
        "UPDATE client_profiles SET eating_style = 'carnivore' WHERE user_id = ?",
        [dan.id],
      );
      const carnivore = pool.query(
        "SELECT id FROM meal_schedules WHERE LOWER(title) LIKE '%carnivore%' LIMIT 1",
      ).rows[0];
      if (carnivore) {
        const already = pool.query(
          'SELECT id FROM client_meal_schedules WHERE user_id = ? AND meal_schedule_id = ?',
          [dan.id, carnivore.id],
        ).rows[0];
        if (!already) {
          pool.query(
            "INSERT INTO client_meal_schedules (user_id, meal_schedule_id, started_at) VALUES (?, ?, datetime('now'))",
            [dan.id, carnivore.id],
          );
        }
      }

      // 3. Welcome DM re-fire: mark any pending welcome_dm tasks for Dan
      //    as sent so the job runner skips them. (Also catches plans_nudge
      //    if a stale row is hanging around.)
      pool.query(
        "UPDATE post_signup_tasks SET sent_at = datetime('now') WHERE user_id = ? AND sent_at IS NULL",
        [dan.id],
      );

      // 4. Also clear any in_app_notifications targeted at Dan that are
      //    likely the re-fired welcome ("Welcome", "welcome" in title).
      pool.query(
        "DELETE FROM in_app_notifications WHERE audience = 'user' AND audience_user_id = ? AND LOWER(title) LIKE '%welcome%'",
        [dan.id],
      );
    },
  },
  // Populate streaks + steps for the @example.com seed clients (plus Dan)
  // so the client-side leaderboards aren't empty. Assigns Dan's carnivore
  // diet (meal_schedule id 24) + sets his eating_style so Home Targets
  // recompute to carnivore macros. Idempotent: re-runs leave existing rows
  // untouched but fill in anything missing.
  {
    name: '2026-05-29-seed-leaderboards-and-dan-carnivore',
    up: () => {
      const today = new Date();
      const dateNDaysAgo = (n) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return d.toISOString().slice(0, 10);
      };

      // Deterministic-but-varied numbers driven off user id so the same
      // user always lands at the same rank between deploys.
      const targets = [];
      const ex = pool.query("SELECT id, name FROM users WHERE email LIKE '%@example.com' AND role = 'client'").rows;
      for (const u of ex) {
        const streak  = 2 + (u.id * 7) % 25;     // 2..26
        const best    = streak + ((u.id * 11) % 30);
        const baseSteps = 4500 + ((u.id * 137) % 6000); // 4500..10500
        targets.push({ user: u, streak, best, baseSteps });
      }

      // Dan - find by email so this works on the live DB; place him in the
      // upper half of the board so the mockup looks credible.
      const dan = pool.query(
        "SELECT id, name FROM users WHERE LOWER(email) = 'dan@systemations.ai'",
      ).rows[0];
      if (dan) {
        targets.push({ user: dan, streak: 28, best: 42, baseSteps: 11200, isDan: true });
      }

      for (const t of targets) {
        // Streaks - upsert. Existing rows update last_activity_date so the
        // leaderboard reads them as "current".
        const existing = pool.query('SELECT user_id FROM streaks WHERE user_id = ?', [t.user.id]).rows[0];
        if (existing) {
          pool.query(
            'UPDATE streaks SET current_streak = ?, best_streak = ?, last_activity_date = ? WHERE user_id = ?',
            [t.streak, t.best, dateNDaysAgo(0), t.user.id],
          );
        } else {
          pool.query(
            'INSERT INTO streaks (user_id, current_streak, best_streak, last_activity_date) VALUES (?, ?, ?, ?)',
            [t.user.id, t.streak, t.best, dateNDaysAgo(0)],
          );
        }

        // Step logs - 7 days, varying by day. Skip days the user already
        // has a row for (so a real-user import never gets overwritten).
        for (let d = 0; d < 7; d++) {
          const date = dateNDaysAgo(d);
          const hasRow = pool.query(
            'SELECT id FROM step_logs WHERE user_id = ? AND date = ?',
            [t.user.id, date],
          ).rows[0];
          if (hasRow) continue;
          const wiggle = 1 + ((t.user.id + d) * 0.13);
          const steps = Math.round(t.baseSteps * (0.75 + (wiggle - Math.floor(wiggle)) * 0.5));
          pool.query(
            'INSERT INTO step_logs (user_id, date, steps) VALUES (?, ?, ?)',
            [t.user.id, date, steps],
          );
        }
      }

      // Dan's carnivore allocation
      if (dan) {
        const carnivore = pool.query(
          "SELECT id FROM meal_schedules WHERE LOWER(title) LIKE '%carnivore%' LIMIT 1",
        ).rows[0];
        if (carnivore) {
          const already = pool.query(
            'SELECT id FROM client_meal_schedules WHERE user_id = ? AND meal_schedule_id = ?',
            [dan.id, carnivore.id],
          ).rows[0];
          if (!already) {
            pool.query(
              "INSERT INTO client_meal_schedules (user_id, meal_schedule_id, started_at) VALUES (?, ?, datetime('now'))",
              [dan.id, carnivore.id],
            );
          }
        }
        // Eating style on the profile so Home Targets recomputes macros to
        // the carnivore distribution (35/60/5) automatically.
        pool.query(
          "UPDATE client_profiles SET eating_style = 'carnivore' WHERE user_id = ?",
          [dan.id],
        );
      }
    },
  },
  // Add Wall Wrist Extension Isometric (Vimeo demo by Coach Joonas) to the
  // library. Idempotent on name.
  {
    name: '2026-05-29-add-wall-wrist-extension-isometric',
    up: () => {
      const exists = pool.query("SELECT id FROM exercises WHERE LOWER(name) = LOWER('Wall Wrist Extension Isometric')").rows[0];
      if (exists) return;
      pool.query(
        `INSERT INTO exercises (name, body_part, exercise_type, demo_video_url)
         VALUES (?, ?, ?, ?)`,
        [
          'Wall Wrist Extension Isometric',
          'Wrist Extensors, Forearm',
          'Mobility',
          'https://vimeo.com/1190865926',
        ],
      );
    },
  },
  // Add Wall Glute Stretch as its own exercise (distinct from "Glute Stretch"
  // (394) - the wall provides leverage the floor version doesn't) and remap
  // Carla's Phase 1 Session 1 to use it. Idempotent on name.
  {
    name: '2026-05-29-add-wall-glute-stretch',
    up: () => {
      let row = pool.query("SELECT id FROM exercises WHERE LOWER(name) = LOWER('Wall Glute Stretch')").rows[0];
      if (!row) {
        row = pool.query(
          `INSERT INTO exercises (name, body_part, exercise_type, demo_video_url)
           VALUES (?, ?, ?, ?) RETURNING id`,
          [
            'Wall Glute Stretch',
            'Gluteus Maximus, Hip Flexors',
            'Stretching',
            'https://vimeo.com/1047371883/37e200ea48',
          ],
        ).rows[0];
      }
      // Move Carla's Phase 1 Session 1 (program by title) Glute-Stretch slot
      // to the new Wall Glute Stretch row. Match by workout title so we only
      // touch the one slot that was originally Wall Glute Stretch (Session
      // 1's order 5 - between Toega and Back Squat in the imported order).
      const w = pool.query(
        "SELECT id FROM workouts WHERE title = 'Carla Phase 1 - Session 1'",
      ).rows[0];
      if (w) {
        pool.query(
          // 394 is Glute Stretch; only Carla's slot landed there as a
          // placeholder remap. Other programs use 394 legitimately so we
          // scope the UPDATE to this workout.
          "UPDATE workout_exercises SET exercise_id = ? WHERE workout_id = ? AND exercise_id = 394",
          [row.id, w.id],
        );
      }
    },
  },
  // Carla follow-up: correct her email + replace the two placeholder
  // exercises with the existing AM library equivalents Dan flagged.
  //   Wall Glute Stretch  -> Glute Stretch (id 394)
  //   Inverted Row - Chin Up -> Inverted Barbell Chin Up (id 1263)
  // Remaps any workout_exercises rows referencing the placeholders, then
  // deletes the placeholders. Idempotent: only acts when placeholders exist.
  {
    name: '2026-05-29-carla-corrections',
    up: () => {
      // 1. Email fix
      const u = pool.query(
        "SELECT id FROM users WHERE LOWER(email) = 'otteheinz.9@gmail.com'",
      ).rows[0];
      if (u) {
        pool.query(
          "UPDATE users SET email = 'carlarachelwhyte@hotmail.com' WHERE id = ?",
          [u.id],
        );
      }

      // 2. Remap placeholder exercises -> existing library entries
      const swaps = [
        { fromName: 'Wall Glute Stretch',     toId: 394 },
        { fromName: 'Inverted Row - Chin Up', toId: 1263 },
      ];
      for (const { fromName, toId } of swaps) {
        const ph = pool.query('SELECT id FROM exercises WHERE name = ?', [fromName]).rows[0];
        const target = pool.query('SELECT id FROM exercises WHERE id = ?', [toId]).rows[0];
        if (!ph || !target) continue;
        pool.query(
          'UPDATE workout_exercises SET exercise_id = ? WHERE exercise_id = ?',
          [toId, ph.id],
        );
        pool.query('DELETE FROM exercises WHERE id = ?', [ph.id]);
      }
    },
  },
  // Import Carla Whyte's "Phase 1" custom program from her FitBudd history.
  // Creates her client account (temp password "Welcome2026!" - she changes
  // on first login), ensures the two exercises missing from the AM library
  // exist, builds the program with 3 sessions, and enrols her. Idempotent
  // via existence checks at every step so re-runs are safe.
  {
    name: '2026-05-29-import-carla-whyte-phase-1',
    up: () => {
      // 1. User + client_profile
      const emailLow = CARLA.email.toLowerCase();
      let user = pool.query('SELECT id FROM users WHERE LOWER(email) = ?', [emailLow]).rows[0];
      if (!user) {
        const hash = bcrypt.hashSync('Welcome2026!', 10);
        const inserted = pool.query(
          "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'client') RETURNING id",
          [CARLA.email, hash, CARLA.name],
        ).rows[0];
        user = { id: inserted.id };
        pool.query(
          'INSERT INTO client_profiles (user_id, timezone) VALUES (?, ?)',
          [user.id, CARLA.timezone],
        );
      }

      // 2. Backfill default daily tasks (mirrors what the register endpoint does)
      const hasTasks = pool.query('SELECT 1 FROM tasks WHERE client_id = ? LIMIT 1', [user.id]).rows[0];
      if (!hasTasks) {
        for (const label of DEFAULT_CLIENT_TASKS) {
          pool.query(
            'INSERT INTO tasks (coach_id, client_id, label, recurring) VALUES (NULL, ?, ?, 1)',
            [user.id, label],
          );
        }
      }

      // 3. Ensure the two AM-library gaps exist (NULL demo_video_url until Dan
      //    attaches a Vimeo clip in admin).
      const exIdByName = {};
      for (const ex of NEW_EXERCISES) {
        const found = pool.query('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [ex.name]).rows[0];
        if (found) {
          exIdByName[ex.name] = found.id;
        } else {
          const ins = pool.query(
            "INSERT INTO exercises (name, body_part, exercise_type) VALUES (?, ?, ?) RETURNING id",
            [ex.name, ex.body_part, ex.exercise_type],
          ).rows[0];
          exIdByName[ex.name] = ins.id;
        }
      }

      // 4. Program shell - private custom program for Carla. visible=0 keeps
      //    it out of Explore; only her enrolment surfaces it on Home.
      let program = pool.query(
        "SELECT id FROM programs WHERE title = 'Carla Phase 1' LIMIT 1",
      ).rows[0];
      if (!program) {
        const p = pool.query(
          `INSERT INTO programs (title, description, duration_weeks, workouts_per_week, visible)
           VALUES (?, ?, ?, ?, 0) RETURNING id`,
          ['Carla Phase 1', 'Phase 1 carried over from FitBudd. 3 sessions per week.', 12, 3],
        ).rows[0];
        program = { id: p.id };
      }

      // 5. Workouts + their exercises. Skip session if already imported
      //    (idempotency) - matches by program_id + day_number.
      for (const sess of CARLA_SESSIONS) {
        const existing = pool.query(
          'SELECT id FROM workouts WHERE program_id = ? AND day_number = ? LIMIT 1',
          [program.id, sess.day_number],
        ).rows[0];
        if (existing) continue;
        const w = pool.query(
          `INSERT INTO workouts (program_id, week_number, day_number, title, status, visible)
           VALUES (?, 1, ?, ?, 'published', 1) RETURNING id`,
          [program.id, sess.day_number, sess.title],
        ).rows[0];

        let order = 0;
        for (const ex of sess.exercises) {
          const exerciseId = ex.exercise_id || exIdByName[ex.name];
          if (!exerciseId) continue;
          const we = pool.query(
            `INSERT INTO workout_exercises
               (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs)
             VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [
              w.id, exerciseId, order++,
              ex.sets || 1,
              ex.time_based ? null : (ex.reps || '10'),
              ex.time_based ? ex.duration_secs : null,
              30,
            ],
          ).rows[0];
          pool.query(
            `INSERT INTO workout_exercise_meta
               (workout_exercise_id, time_based, duration_secs, tracking_type)
             VALUES (?, ?, ?, ?)`,
            [we.id, ex.time_based ? 1 : 0, ex.time_based ? ex.duration_secs : null, ex.time_based ? 'duration' : 'reps'],
          );
        }
      }

      // 6. Enrol her in the program
      const enrolled = pool.query(
        'SELECT id FROM client_programs WHERE user_id = ? AND program_id = ?',
        [user.id, program.id],
      ).rows[0];
      if (!enrolled) {
        const totalW = pool.query('SELECT COUNT(*) AS c FROM workouts WHERE program_id = ?', [program.id]).rows[0].c;
        pool.query(
          `INSERT INTO client_programs (user_id, program_id, current_week, current_day, total_workouts)
           VALUES (?, ?, 1, 1, ?)`,
          [user.id, program.id, totalW],
        );
      }
    },
  },
  // Seed the first "warm up" tags on the two existing warmup exercises
  // (Warm Up + Dynamic Warm Up). Coach will tag more as he records them;
  // the picker's Warmup-block recommendations read this tag first.
  // Idempotent: only writes when tags is currently NULL/empty.
  {
    name: '2026-05-28-tag-warmup-exercises',
    up: () => {
      const ids = pool.query(
        "SELECT id FROM exercises WHERE name IN ('Warm Up', 'Dynamic Warm Up')",
      ).rows.map(r => r.id);
      for (const id of ids) {
        pool.query(
          "UPDATE exercises SET tags = 'warm up' WHERE id = ? AND (tags IS NULL OR tags = '')",
          [id],
        );
      }
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
