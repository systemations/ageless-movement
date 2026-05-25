#!/usr/bin/env node
/* Build a clean production seed DB from a copy of the working DB:
   - keep only the real coach accounts (2 Coach Dan, 5 admin/Amy, 39 Joonas)
   - re-home all content owned by stripped users to Coach Dan (2)
   - delete every stripped user's per-account data, then the users
   - clean up orphaned conversations / explore items
   Operates on server/seed/ageless-seed.db (a copy), never the live dev DB. */

const path = require('path');
const Database = require('better-sqlite3');

const DB = path.join(__dirname, 'ageless-seed.db');
const KEEP = new Set([2, 5, 39]);
const REHOME_TO = 2;

const db = new Database(DB);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
const colsOf = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

// content ownership -> re-home; client references -> delete
const OWNER_COLS = new Set(['coach_id', 'created_by', 'author_id']);
const CLIENT_COLS = new Set(['user_id', 'client_id', 'sender_id', 'recipient_id',
  'member_id', 'participant_id', 'other_user_id', 'from_user_id', 'to_user_id']);

const allUsers = db.prepare('SELECT id FROM users').all().map(u => u.id);
const stripped = allUsers.filter(id => !KEEP.has(id));
const inList = stripped.join(',');

const before = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  programs: db.prepare('SELECT COUNT(*) c FROM programs').get().c,
  exercises: db.prepare('SELECT COUNT(*) c FROM exercises').get().c,
  workouts: db.prepare('SELECT COUNT(*) c FROM workouts').get().c,
};

const tx = db.transaction(() => {
  // 1) re-home content owned by stripped users -> Coach Dan
  let rehomed = 0;
  for (const t of tables) {
    if (t === 'users') continue; // users.coach_id is a client's assigned coach, not content
    for (const col of colsOf(t)) {
      if (OWNER_COLS.has(col)) {
        rehomed += db.prepare(`UPDATE ${t} SET ${col}=? WHERE ${col} IN (${inList})`).run(REHOME_TO).changes;
      }
    }
  }
  // 2) delete rows tied to stripped users via any client-reference column
  let deletedRows = 0;
  for (const t of tables) {
    if (t === 'users') continue;
    for (const col of colsOf(t)) {
      if (CLIENT_COLS.has(col)) {
        deletedRows += db.prepare(`DELETE FROM ${t} WHERE ${col} IN (${inList})`).run().changes;
      }
    }
  }
  // 3) delete the stripped users
  const delUsers = db.prepare(`DELETE FROM users WHERE id IN (${inList})`).run().changes;

  // 4) orphan cleanup
  let orphans = 0;
  // conversations referencing a now-deleted client (the kept coach member
  // alone kept these alive), then cascade their members/messages/reads/stars
  if (tables.includes('conversations')) {
    if (colsOf('conversations').includes('client_id')) {
      orphans += db.prepare(`DELETE FROM conversations WHERE client_id NOT IN (SELECT id FROM users)`).run().changes;
    }
    if (tables.includes('conversation_members')) {
      orphans += db.prepare(`DELETE FROM conversation_members WHERE user_id NOT IN (SELECT id FROM users)`).run().changes;
      orphans += db.prepare(`DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM conversation_members)`).run().changes;
    }
    for (const t of ['messages', 'conversation_reads', 'conversation_stars', 'conversation_members', 'message_reactions']) {
      if (tables.includes(t) && colsOf(t).includes('conversation_id')) {
        orphans += db.prepare(`DELETE FROM ${t} WHERE conversation_id NOT IN (SELECT id FROM conversations)`).run().changes;
      }
    }
  }
  if (tables.includes('messages')) {
    orphans += db.prepare(`DELETE FROM messages WHERE sender_id NOT IN (SELECT id FROM users)`).run().changes;
  }
  // explore items pointing at deleted workouts
  if (tables.includes('explore_section_items')) {
    orphans += db.prepare(`DELETE FROM explore_section_items WHERE item_type='workout' AND NOT EXISTS (SELECT 1 FROM workouts w WHERE w.id=item_id)`).run().changes;
  }
  if (tables.includes('exercise_alternatives')) {
    db.prepare('DELETE FROM exercise_alternatives WHERE exercise_id=alternative_id').run();
  }
  // pre-existing dangling workout_exercises (null or missing exercise) + their meta
  const dangling = db.prepare('SELECT id FROM workout_exercises WHERE exercise_id IS NULL OR exercise_id NOT IN (SELECT id FROM exercises)').all().map(r => r.id);
  for (const id of dangling) {
    db.prepare('DELETE FROM workout_exercise_meta WHERE workout_exercise_id=?').run(id);
    db.prepare('DELETE FROM workout_exercises WHERE id=?').run(id);
  }
  orphans += dangling.length;
  return { rehomed, deletedRows, delUsers, orphans };
});

const r = tx();
db.exec('VACUUM');

const after = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  programs: db.prepare('SELECT COUNT(*) c FROM programs').get().c,
  exercises: db.prepare('SELECT COUNT(*) c FROM exercises').get().c,
  workouts: db.prepare('SELECT COUNT(*) c FROM workouts').get().c,
};
const remaining = db.prepare('SELECT id,email,name,role FROM users ORDER BY id').all();
const progCoaches = db.prepare('SELECT coach_id, COUNT(*) c FROM programs GROUP BY coach_id').all();

console.log('re-homed content rows:', r.rehomed, '| deleted data rows:', r.deletedRows, '| users deleted:', r.delUsers, '| orphans cleaned:', r.orphans);
console.log('BEFORE:', before);
console.log('AFTER :', after);
console.log('remaining users:', remaining);
console.log('programs by coach_id:', progCoaches);
db.close();
