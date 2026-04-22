// Assigns a meal schedule + calorie target to each of the 20 mock clients
// based on their onboarding goal, age, and gender. Idempotent — re-running
// updates existing assignments rather than stacking them.
//
// Logic:
//   - Base calorie need from simplified Mifflin-St Jeor (age + gender)
//   - Adjusted by goal: Lose (-350), Build (+300), Athletic (+200), else 0
//   - Schedule picked from the goal:
//       Lose weight              → 1550 kcal · Fat Loss
//       Build strength           → 2200 kcal · Muscle Gain
//       Athletic performance     → 2000 kcal · Active
//       General fitness          → 1800 kcal · Maintenance
//       Mobility & flexibility   → 1800 kcal · Maintenance
//       Reduce pain / discomfort → Advanced Bulletproof Gut
//       Recover from injury      → Advanced Bulletproof Gut
//
// The calorie_override stored on the assignment is what the scaler uses to
// stretch the schedule's plans up or down for this specific client.
//
// Run: node scripts/assign_mock_schedules.js

import db from '../src/db/pool.js';

const SCHEDULE_TITLES = {
  fat_loss:     '1550 kcal · Fat Loss',
  maintenance:  '1800 kcal · Maintenance',
  active:       '2000 kcal · Active',
  muscle_gain:  '2200 kcal · Muscle Gain',
  gut:          'Advanced Bulletproof Gut',
};

function lookupScheduleIds() {
  const ids = {};
  for (const [key, title] of Object.entries(SCHEDULE_TITLES)) {
    const row = db.query('SELECT id FROM meal_schedules WHERE title = ?', [title]).rows[0];
    if (!row) {
      console.error(`Missing schedule: ${title}`);
      process.exit(1);
    }
    ids[key] = row.id;
  }
  return ids;
}

function baseCalories(age, gender) {
  // Simplified Mifflin-St Jeor assuming moderate activity + ballpark weight.
  // Real app would use weight/height — this is a stand-in for demo data.
  if (gender === 'female') {
    if (age >= 65) return 1700;
    if (age >= 50) return 1850;
    if (age >= 30) return 2000;
    return 2100;
  }
  // male
  if (age >= 65) return 2100;
  if (age >= 50) return 2300;
  if (age >= 30) return 2500;
  return 2700;
}

function adjustForGoal(base, goal) {
  const g = (goal || '').toLowerCase();
  if (g.includes('lose')) return base - 350;
  if (g.includes('build strength')) return base + 300;
  if (g.includes('athletic')) return base + 200;
  return base;
}

function pickSchedule(goal, ids) {
  const g = (goal || '').toLowerCase();
  if (g.includes('lose')) return ids.fat_loss;
  if (g.includes('build strength')) return ids.muscle_gain;
  if (g.includes('athletic')) return ids.active;
  if (g.includes('pain') || g.includes('discomfort') || g.includes('recover') || g.includes('injury')) return ids.gut;
  return ids.maintenance;
}

function run() {
  const scheduleIds = lookupScheduleIds();
  console.log('Schedule ids:', scheduleIds);

  const clients = db.query(
    `SELECT u.id, u.name, cp.age, cp.gender, oa.goal
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN onboarding_answers oa ON oa.user_id = u.id
     WHERE u.role = 'client' AND oa.goal IS NOT NULL
     ORDER BY u.id`,
    [],
  ).rows;

  console.log(`\nAssigning schedules to ${clients.length} clients:\n`);

  for (const c of clients) {
    const base = baseCalories(c.age, c.gender);
    const target = adjustForGoal(base, c.goal);
    const scheduleId = pickSchedule(c.goal, scheduleIds);

    // Update the client_profiles.calorie_target so the dashboard shows it
    db.query(
      'UPDATE client_profiles SET calorie_target = ?, active_meal_schedule_id = ? WHERE user_id = ?',
      [target, scheduleId, c.id],
    );

    // Upsert into client_meal_schedules with the override
    const existing = db.query(
      'SELECT id FROM client_meal_schedules WHERE user_id = ? AND meal_schedule_id = ?',
      [c.id, scheduleId],
    ).rows[0];
    if (existing) {
      db.query(
        'UPDATE client_meal_schedules SET calorie_override = ?, started_at = datetime(\'now\') WHERE id = ?',
        [target, existing.id],
      );
    } else {
      // Clear any previous assignment for this user first (only one active schedule)
      db.query('DELETE FROM client_meal_schedules WHERE user_id = ?', [c.id]);
      db.query(
        `INSERT INTO client_meal_schedules (user_id, meal_schedule_id, calorie_override)
         VALUES (?, ?, ?)`,
        [c.id, scheduleId, target],
      );
    }

    const schedTitle = Object.entries(scheduleIds).find(([, v]) => v === scheduleId)[0];
    console.log(`  ${c.name.padEnd(22)} ${String(c.age).padStart(2)}${c.gender[0].toUpperCase()}  ${target} kcal  →  ${schedTitle}`);
  }

  console.log(`\nDone.`);
}

run();
process.exit(0);
