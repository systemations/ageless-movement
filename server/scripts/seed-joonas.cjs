#!/usr/bin/env node
// Idempotent seed for Joonas accounts on any environment (local or Render prod).
//
// Creates:
//   - joonas@coach.com  (role=coach) + coach_profiles row, Elite tier,
//                        mobility branding mirroring local setup
//   - joonas@test.com   (role=client, coach_id=Dan) + client_profiles row,
//                        Free tier, active status
//
// Password for both: test123
//
// Run on Render: open a shell on the ageless-movement service and:
//   node server/scripts/seed-joonas.cjs

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');
const PASSWORD = 'test123';
const DAN_EMAIL = 'danny@handsdan.com';

function upsertCoach(db, passwordHash) {
  const email = 'joonas@coach.com';
  const name = 'Joonas Ware';

  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) {
    const ins = db.prepare(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (?, ?, ?, 'coach')
    `).run(email, passwordHash, name);
    user = { id: ins.lastInsertRowid };
    console.log(`  ${email}: created user (id=${user.id})`);
  } else {
    console.log(`  ${email}: user already exists (id=${user.id})`);
  }

  const existingProfile = db.prepare('SELECT id FROM coach_profiles WHERE user_id = ?').get(user.id);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO coach_profiles (
        user_id, membership_tier, headline, specialties,
        is_public, sort_order, accent_color, pricing_tier_id
      ) VALUES (?, 'Elite', 'Mobility and Longevity Coach', 'Mobility,Strength,Longevity',
                1, 0, '#FF8C00', 1)
    `).run(user.id);
    console.log(`  ${email}: created coach_profile`);
  } else {
    console.log(`  ${email}: coach_profile already exists`);
  }

  return user.id;
}

function upsertClient(db, passwordHash, danId) {
  const email = 'joonas@test.com';
  const name = 'Joonas Test';

  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) {
    const ins = db.prepare(`
      INSERT INTO users (email, password_hash, name, role, coach_id)
      VALUES (?, ?, ?, 'client', ?)
    `).run(email, passwordHash, name, danId);
    user = { id: ins.lastInsertRowid };
    console.log(`  ${email}: created user (id=${user.id})`);
  } else {
    console.log(`  ${email}: user already exists (id=${user.id})`);
  }

  const existingProfile = db.prepare('SELECT id FROM client_profiles WHERE user_id = ?').get(user.id);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO client_profiles (user_id, tier_id, status)
      VALUES (?, 1, 'active')
    `).run(user.id);
    console.log(`  ${email}: created client_profile`);
  } else {
    console.log(`  ${email}: client_profile already exists`);
  }

  return user.id;
}

async function main() {
  console.log(`Opening ${DB_PATH}`);
  const db = new Database(DB_PATH);

  const dan = db.prepare('SELECT id FROM users WHERE email = ?').get(DAN_EMAIL);
  if (!dan) {
    console.error(`${DAN_EMAIL} not found; aborting`);
    process.exit(1);
  }

  console.log(`\n— seeding Joonas accounts (password: ${PASSWORD}) —`);
  const hash = await bcrypt.hash(PASSWORD, 10);

  upsertCoach(db, hash);
  upsertClient(db, hash, dan.id);

  console.log(`\nDone.`);
  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
