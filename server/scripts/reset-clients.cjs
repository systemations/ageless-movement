#!/usr/bin/env node
// One-shot reset + seed for the next round of internal testing.
//
// What it does:
//   1. Wipes all per-user data for dan@test.com (keeps the account).
//      Resets the client_profile to default (Free tier, no age/gender/etc).
//   2. Creates five fresh client accounts — roz / emily / amy / bonnie /
//      izaac @test.com — with password `test123`, Free tier, assigned to
//      Dan (coach_id = 2).
//
// Safe to re-run: idempotent. Existing accounts are left untouched;
// existing per-user rows for dan@test.com are re-deleted.

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');
const COACH_ID = 2; // danny@handsdan.com
const PASSWORD = 'test123';

const NEW_CLIENTS = [
  { email: 'roz@test.com',    name: 'Roz' },
  { email: 'emily@test.com',  name: 'Emily' },
  { email: 'amy@test.com',    name: 'Amy' },
  { email: 'bonnie@test.com', name: 'Bonnie' },
  { email: 'izaac@test.com',  name: 'Izaac' },
];

// Every table keyed by user_id (or sender_id in messages). Order matters
// only for referential-integrity edge cases — with SQLite's lax FK mode we
// just delete children first, parents last.
const PER_USER_TABLES = [
  // challenges + benchmarks
  'benchmark_attempts',
  'user_challenges',
  // habits / check-ins
  'habit_entries',
  'checkins',
  // supplements (both the user's list + their daily logs)
  'supplement_logs',
  'supplements',
  // workouts
  'user_workout_overrides',
  'user_scheduled_workouts',
  'user_rest_days',
  'client_programs',
  // nutrition
  'client_meal_schedules',
  'shopping_list_items', // via shopping_lists — handled separately below
  'shopping_lists',
  'weekly_meal_plans',
  // courses
  'user_lesson_completions',
  // favourites
  'favourites',
  // messaging (read state + reactions + stars — keep the inbox row itself,
  // we'll detach dan from it and re-attach)
  'message_reactions',
  'notification_reads',
  'conversation_reads',
  'conversation_stars',
  // training blocks + everything hanging off them (children first)
  'phase_calorie_targets', // joined via block_phases.id
  'weekly_schedule',        // via block_id
  'scan_schedule',          // via block_id
  'bloods_schedule',        // via block_id
  'block_phases',           // via block_id
  'training_blocks',
  // login history
  'login_events',
];

function wipeUserData(db, userId) {
  console.log(`\n— wiping per-user rows for user_id=${userId} —`);
  // The nested tables (phase_calorie_targets via block_phases, shopping_list_items
  // via shopping_lists) need a join or a pre-delete lookup.
  const blockIds = db.prepare('SELECT id FROM training_blocks WHERE user_id = ?').all(userId).map(r => r.id);
  const phaseIds = blockIds.length
    ? db.prepare(`SELECT id FROM block_phases WHERE block_id IN (${blockIds.map(() => '?').join(',')})`).all(...blockIds).map(r => r.id)
    : [];
  const shoppingIds = db.prepare('SELECT id FROM shopping_lists WHERE user_id = ?').all(userId).map(r => r.id);

  if (phaseIds.length) {
    const del = db.prepare(`DELETE FROM phase_calorie_targets WHERE block_phase_id IN (${phaseIds.map(() => '?').join(',')})`).run(...phaseIds);
    console.log(`  phase_calorie_targets: ${del.changes}`);
  }
  if (shoppingIds.length) {
    const del = db.prepare(`DELETE FROM shopping_list_items WHERE shopping_list_id IN (${shoppingIds.map(() => '?').join(',')})`).run(...shoppingIds);
    console.log(`  shopping_list_items: ${del.changes}`);
  }

  const simpleTables = PER_USER_TABLES.filter(t => t !== 'phase_calorie_targets' && t !== 'shopping_list_items');
  for (const tbl of simpleTables) {
    try {
      const del = db.prepare(`DELETE FROM ${tbl} WHERE user_id = ?`).run(userId);
      if (del.changes > 0) console.log(`  ${tbl}: ${del.changes}`);
    } catch (err) {
      // Some tables don't have user_id — shopping_list_items handled above,
      // phase_calorie_targets handled above. If a future schema adds a
      // table without user_id that slips in here, log and move on.
      console.warn(`  ${tbl}: skipped (${err.message})`);
    }
  }

  // Messages: delete dan's sent messages AND any DMs where he was the only
  // non-coach participant. For team inbox (shared group), leave it alone —
  // his conversation_members row was dropped, re-added at the end.
  const dmIds = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE c.type = 'direct' AND cm.user_id = ?
  `).all(userId).map(r => r.id);
  for (const convId of dmIds) {
    db.prepare('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)').run(convId);
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
    db.prepare('DELETE FROM conversation_members WHERE conversation_id = ?').run(convId);
    db.prepare('DELETE FROM conversation_reads WHERE conversation_id = ?').run(convId);
    db.prepare('DELETE FROM conversation_stars WHERE conversation_id = ?').run(convId);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(convId);
  }
  if (dmIds.length) console.log(`  removed ${dmIds.length} DM thread(s)`);

  // Team-inbox membership: unhook dan from his own inbox so we can recreate
  // it cleanly. ensureClientTeamInboxes on next request will rebuild.
  const teamInbox = db.prepare("SELECT id FROM conversations WHERE client_id = ? LIMIT 1").get(userId);
  if (teamInbox) {
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(teamInbox.id);
    db.prepare('DELETE FROM conversation_members WHERE conversation_id = ?').run(teamInbox.id);
    db.prepare('DELETE FROM conversation_reads WHERE conversation_id = ?').run(teamInbox.id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(teamInbox.id);
    console.log(`  wiped team-inbox conversation`);
  }

  // Reset client_profile to defaults (keep the row so the account still works)
  db.prepare(`
    UPDATE client_profiles SET
      tier_id = 1, age = NULL, gender = NULL, location = NULL,
      profile_image_url = NULL, status = 'active', status_note = NULL,
      plan_title = NULL, plan_cycle = NULL, plan_next_renewal_at = NULL
    WHERE user_id = ?
  `).run(userId);
  console.log(`  client_profiles: reset to defaults`);
}

function createClient(db, email, name, passwordHash) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.log(`  ${email}: already exists (id=${existing.id}), skipping`);
    return existing.id;
  }
  const ins = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, coach_id)
    VALUES (?, ?, ?, 'client', ?)
  `).run(email, passwordHash, name, COACH_ID);
  const userId = ins.lastInsertRowid;

  db.prepare(`
    INSERT INTO client_profiles (user_id, tier_id, status)
    VALUES (?, 1, 'active')
  `).run(userId);

  console.log(`  ${email}: created (id=${userId})`);
  return userId;
}

async function main() {
  console.log(`Opening ${DB_PATH}`);
  const db = new Database(DB_PATH);

  const dan = db.prepare("SELECT id FROM users WHERE email = 'dan@test.com'").get();
  if (!dan) {
    console.error('dan@test.com not found; aborting');
    process.exit(1);
  }

  wipeUserData(db, dan.id);

  console.log(`\n— creating fresh client accounts —`);
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const c of NEW_CLIENTS) {
    createClient(db, c.email, c.name, hash);
  }

  console.log(`\nDone.`);
  console.log(`\nTest accounts (password: ${PASSWORD}):`);
  console.log(`  dan@test.com     (reset to blank)`);
  for (const c of NEW_CLIENTS) console.log(`  ${c.email.padEnd(18)} (fresh)`);

  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
