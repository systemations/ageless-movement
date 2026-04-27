// Shared onboarding finalisation logic. Used by:
//   - Legacy /api/auth/register (anonymous funnel: posts answers + creds
//     in one shot, server runs this immediately after creating the user)
//   - New /api/onboarding/finalize (slim register flow: user is already
//     logged in, posts the answers when they hit the suggestion screen)
//
// Persists onboarding answers, computes targets, enrols in matched
// program, flips onboarding_complete = 1. Returns { allocation, targets }
// so the caller can render the outcome screen.
//
// Server-side execution is deliberate — clients can't tamper their way
// into a tier or program by patching the request, because the allocator
// + Mifflin re-run from the server-trusted answer fields.

import pool from '../db/pool.js';
import { allocateProgram } from './programAllocator.js';
import { calculateTargets } from './nutritionTargets.js';

export function finalizeOnboarding(userId, answers) {
  if (!answers || typeof answers !== 'object') {
    throw new Error('answers required');
  }

  // 1. Persist the answers (first-class columns + JSON blob)
  pool.query(
    `INSERT INTO onboarding_answers
      (user_id, goal, experience, injuries, schedule, equipment, answers_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       goal = excluded.goal,
       experience = excluded.experience,
       injuries = excluded.injuries,
       schedule = excluded.schedule,
       equipment = excluded.equipment,
       answers_json = excluded.answers_json`,
    [
      userId,
      answers.goal || null,
      answers.experience || null,
      Array.isArray(answers.injuries) ? answers.injuries.join(',') : null,
      answers.days != null ? String(answers.days) : null,
      answers.equipment || null,
      JSON.stringify(answers),
    ],
  );

  // 2. Patch demographic + nutrition inputs onto the profile
  const sets = [];
  const vals = [];
  if (typeof answers.age === 'number')            { sets.push('age = ?');             vals.push(answers.age); }
  if (typeof answers.sex === 'string')            { sets.push('sex = ?');             vals.push(answers.sex); }
  if (typeof answers.height_cm === 'number')      { sets.push('height_cm = ?');       vals.push(answers.height_cm); }
  if (typeof answers.weight_kg === 'number')      { sets.push('weight_kg = ?');       vals.push(answers.weight_kg); }
  if (typeof answers.activity_level === 'string') { sets.push('activity_level = ?');  vals.push(answers.activity_level); }
  if (typeof answers.eating_style === 'string')   { sets.push('eating_style = ?');    vals.push(answers.eating_style); }

  // 3. Mifflin → activity → macro split. Only writes targets when the
  //    full input set is present, otherwise we fall back to schema
  //    defaults and the Home prompt card surfaces an empty-state.
  const targets = calculateTargets({
    sex: answers.sex,
    weight_kg: answers.weight_kg,
    height_cm: answers.height_cm,
    age: answers.age,
    activity_level: answers.activity_level,
    eating_style: answers.eating_style,
  });
  if (targets.calorie_target) {
    sets.push('calorie_target = ?'); vals.push(targets.calorie_target);
    sets.push('protein_target = ?'); vals.push(targets.protein_target);
    sets.push('fat_target = ?');     vals.push(targets.fat_target);
    sets.push('carbs_target = ?');   vals.push(targets.carbs_target);
  }

  // 4. Mark onboarding complete so the routing guard releases the lock.
  sets.push('onboarding_complete = ?'); vals.push(1);

  vals.push(userId);
  pool.query(`UPDATE client_profiles SET ${sets.join(', ')} WHERE user_id = ?`, vals);

  // 5. Run allocator and auto-enrol in the matched program. Review
  //    cases (injured / 75+ / etc.) skip enrolment — the coach will
  //    pick on their review pass.
  const allocation = allocateProgram(answers);
  if (allocation.program_id) {
    // Skip if already enrolled (e.g. coach pre-enrolled a user before
    // they finished the funnel)
    const existing = pool.query(
      'SELECT id FROM client_programs WHERE user_id = ? AND program_id = ?',
      [userId, allocation.program_id],
    ).rows[0];
    if (!existing) {
      const total = pool.query(
        'SELECT COUNT(*) as c FROM workouts WHERE program_id = ?',
        [allocation.program_id],
      ).rows[0]?.c || 0;
      pool.query(
        `INSERT INTO client_programs
          (user_id, program_id, current_week, current_day, started_at, completed_workouts, total_workouts)
         VALUES (?, ?, 1, 1, ?, 0, ?)`,
        [userId, allocation.program_id, new Date().toISOString(), total],
      );
    }
  }

  return { allocation, targets };
}
