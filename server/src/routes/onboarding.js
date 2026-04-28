// Logged-in onboarding endpoints. Powers the slim-register flow:
//   1. User signs up with name + email + password (no answers yet)
//   2. Auth context kicks in, routes them to /onboarding (forced)
//   3. They answer the 11 questions in the questionnaire
//   4. Client POSTs the full answer set here on the suggestion screen
//   5. Server runs allocator + Mifflin, enrols in program, writes
//      targets, flips onboarding_complete = 1
//   6. Routing guard releases — they can land on Home / pick a tier
//
// Only available to authenticated clients (not coaches). The legacy
// anonymous funnel still piggybacks on /api/auth/register; this route
// exists for the slim flow.

import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { finalizeOnboarding } from '../lib/onboarding.js';
import { allocateProgram } from '../lib/programAllocator.js';
import { calculateTargets } from '../lib/nutritionTargets.js';

const router = Router();

// Returns the user's current onboarding status — used by the routing
// guard so it can decide whether to lock them on /onboarding.
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const profile = pool.query(
      'SELECT onboarding_complete, active_program_id FROM client_profiles WHERE user_id = ?',
      [req.user.id],
    ).rows[0];
    const answers = pool.query(
      'SELECT answers_json FROM onboarding_answers WHERE user_id = ?',
      [req.user.id],
    ).rows[0];
    res.json({
      onboarding_complete: profile?.onboarding_complete ? 1 : 0,
      saved_answers: answers ? JSON.parse(answers.answers_json || '{}') : null,
    });
  } catch (err) {
    console.error('Onboarding status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Live preview — runs the calc without persisting. Used by the
// suggestion screen so it can show the matched program + nutrition
// targets before the client commits via /finalize. Lets us keep the
// outcome cards always-fresh without bloating /finalize with a return
// payload that the client could just compute itself anyway.
router.post('/preview', authenticateToken, async (req, res) => {
  try {
    const answers = req.body?.answers || {};
    const allocation = allocateProgram(answers);
    const targets = calculateTargets({
      sex: answers.sex,
      weight_kg: answers.weight_kg,
      height_cm: answers.height_cm,
      age: answers.age,
      activity_level: answers.activity_level,
      eating_style: answers.eating_style,
    });
    res.json({ allocation, targets });
  } catch (err) {
    console.error('Onboarding preview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Finalises onboarding — writes everything and flips the gate. Idempotent
// on user_id (safe to retry if the client double-taps).
//
// Body: { answers, tier_choice? } — tier_choice is one of 'free' |
// 'prime' | 'elite'. Free is the default and writes no tier intent.
// Prime / Elite stamp `tier_requested_id` on the profile and log an
// activity_log entry so the coach's priority inbox surfaces the upgrade
// request. Stripe isn't wired yet, so the actual tier change happens
// after the coach manually flips it on payment.
router.post('/finalize', authenticateToken, async (req, res) => {
  try {
    const answers = req.body?.answers || {};
    const tierChoice = req.body?.tier_choice || 'free';
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers required' });
    }

    const result = finalizeOnboarding(req.user.id, answers);

    // Stamp upgrade intent so the coach side can act on it.
    if (tierChoice === 'prime' || tierChoice === 'elite') {
      const tierName = tierChoice === 'prime' ? 'Prime' : 'Elite';
      const tier = pool.query(
        'SELECT id FROM tiers WHERE name = ? LIMIT 1',
        [tierName],
      ).rows[0];
      if (tier) {
        pool.query(
          'UPDATE client_profiles SET tier_requested_id = ? WHERE user_id = ?',
          [tier.id, req.user.id],
        );
      }
      const desc = tierChoice === 'prime'
        ? 'Requested Prime upgrade after onboarding'
        : 'Booked an Elite discovery call after onboarding';
      try {
        pool.query(
          'INSERT INTO activity_log (user_id, action_type, description) VALUES (?, ?, ?)',
          [req.user.id, 'tier_intent', desc],
        );
      } catch (e) { /* activity_log may not exist on a stripped DB */ }
    }

    res.json({ success: true, tier_choice: tierChoice, ...result });
  } catch (err) {
    console.error('Onboarding finalize error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Onboarding checklist — 5 first-action tasks shown on Home
// ─────────────────────────────────────────────────────────────────────
// Each task has an auto-detect rule so we only need a manual mark
// when there's no derivable signal (community_welcome). The card on
// Home polls /checklist and the task ticks off as soon as the
// underlying action happens (quiz attempted, goal added, check-in
// submitted, message sent).

const CHECKLIST_TASKS = [
  {
    key: 'assessment_course',
    title: 'Complete the AMS Getting Started course',
    description: 'Walk through the assessment lessons + take the level quiz.',
    cta_label: 'Open the course',
    cta_route: '/explore',
  },
  {
    key: 'set_goals',
    title: 'Set 1 - 3 goals for the next 90 days',
    description: 'Mobility, consistency, body comp - whatever matters most to you.',
    cta_label: 'Add a goal',
    cta_route: '/progress',
  },
  {
    key: 'community_welcome',
    title: 'Welcome yourself in the Active Clients group',
    description: 'Drop a hello in the community chat so we know who you are.',
    cta_label: 'Open Messages',
    cta_route: '/messages',
    manual: true,
  },
  {
    key: 'first_checkin',
    title: 'Submit your first check-in',
    description: 'Front, side, back photos. Captures your visual baseline.',
    cta_label: 'Start check-in',
    cta_route: '/progress',
  },
  {
    key: 'coach_hello',
    title: 'Send your coach a hello message',
    description: 'Quick intro so the support channel is open from day one.',
    cta_label: 'Open Messages',
    cta_route: '/messages',
  },
];

// Live signal lookups used by /checklist. Each returns a boolean.
const detectComplete = (taskKey, userId) => {
  switch (taskKey) {
    case 'assessment_course':
      return (pool.query(
        'SELECT 1 FROM quiz_attempts WHERE user_id = ? LIMIT 1',
        [userId],
      ).rows[0] || null) !== null;
    case 'set_goals':
      return (pool.query(
        'SELECT 1 FROM goals WHERE user_id = ? LIMIT 1',
        [userId],
      ).rows[0] || null) !== null;
    case 'first_checkin':
      return (pool.query(
        'SELECT 1 FROM checkins WHERE user_id = ? LIMIT 1',
        [userId],
      ).rows[0] || null) !== null;
    case 'coach_hello':
      // Any message they've sent in any conversation. Most clients'
      // first message is to their coach so we don't bother filtering.
      return (pool.query(
        'SELECT 1 FROM messages WHERE sender_id = ? LIMIT 1',
        [userId],
      ).rows[0] || null) !== null;
    default:
      return false;
  }
};

router.get('/checklist', authenticateToken, (req, res) => {
  try {
    const manual = pool.query(
      'SELECT task_key, completed_at FROM onboarding_tasks WHERE user_id = ?',
      [req.user.id],
    ).rows;
    const manualMap = new Map(manual.map(r => [r.task_key, r.completed_at]));

    const tasks = CHECKLIST_TASKS.map(t => {
      const manualCompletedAt = manualMap.get(t.key);
      const auto = !t.manual && detectComplete(t.key, req.user.id);
      const completed = !!(manualCompletedAt || auto);
      return {
        key: t.key,
        title: t.title,
        description: t.description,
        cta_label: t.cta_label,
        cta_route: t.cta_route,
        manual: !!t.manual,
        completed,
        completed_at: manualCompletedAt || null,
      };
    });
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    res.json({ tasks, total, done, all_done: done === total });
  } catch (err) {
    console.error('checklist error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/checklist/:key/complete', authenticateToken, (req, res) => {
  try {
    const def = CHECKLIST_TASKS.find(t => t.key === req.params.key);
    if (!def) return res.status(404).json({ error: 'Task not found' });
    pool.query(
      `INSERT OR IGNORE INTO onboarding_tasks (user_id, task_key) VALUES (?, ?)`,
      [req.user.id, def.key],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('checklist complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/checklist/:key/uncomplete', authenticateToken, (req, res) => {
  try {
    pool.query(
      'DELETE FROM onboarding_tasks WHERE user_id = ? AND task_key = ?',
      [req.user.id, req.params.key],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('checklist uncomplete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// My Profile — view + patch onboarding answers
// ─────────────────────────────────────────────────────────────────────
// Combines BMR-relevant fields (sex/height/weight/age/activity_level/
// eating_style) from client_profiles with the rest (goal/sport/
// experience/equipment/days/injuries) from onboarding_answers.
//
// PATCH writes the right table for the field, then recomputes targets
// if a BMR-affecting field changed so the cards on Home stay in sync.

router.get('/answers', authenticateToken, (req, res) => {
  try {
    const profile = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [req.user.id]).rows[0] || {};
    const ob = pool.query('SELECT * FROM onboarding_answers WHERE user_id = ?', [req.user.id]).rows[0] || {};
    let json = {};
    try { json = ob.answers_json ? JSON.parse(ob.answers_json) : {}; } catch {}
    res.json({
      // BMR-relevant (live on client_profiles)
      sex: profile.sex || null,
      age: profile.age != null ? profile.age : null,
      height_cm: profile.height_cm != null ? profile.height_cm : null,
      weight_kg: profile.weight_kg != null ? profile.weight_kg : null,
      activity_level: profile.activity_level || null,
      eating_style: profile.eating_style || null,
      // BMI on the fly from height + weight
      bmi: (profile.height_cm && profile.weight_kg)
        ? +(profile.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)
        : null,
      // Lifestyle answers (live on onboarding_answers)
      goal:       json.goal       || null,
      sport:      json.sport      || null,
      experience: json.experience || null,
      equipment:  json.equipment  || null,
      days:       json.days != null ? json.days : null,
      injuries:   Array.isArray(json.injuries) ? json.injuries : (json.injuries ? [json.injuries] : []),
      // Targets so the editor can show them next to BMR fields
      calorie_target: profile.calorie_target,
      protein_target: profile.protein_target,
      fat_target:     profile.fat_target,
      carbs_target:   profile.carbs_target,
    });
  } catch (err) {
    console.error('answers get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const BMR_FIELDS = new Set(['sex', 'age', 'height_cm', 'weight_kg', 'activity_level', 'eating_style']);
const LIFESTYLE_FIELDS = new Set(['goal', 'sport', 'experience', 'equipment', 'days', 'injuries']);

router.patch('/answers', authenticateToken, async (req, res) => {
  try {
    const { field, value } = req.body || {};
    if (!field || (!BMR_FIELDS.has(field) && !LIFESTYLE_FIELDS.has(field))) {
      return res.status(400).json({ error: 'unknown field' });
    }

    if (BMR_FIELDS.has(field)) {
      pool.query(`UPDATE client_profiles SET ${field} = ? WHERE user_id = ?`, [value, req.user.id]);

      // Recompute targets if any BMR input changed. Read freshest values.
      const p = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [req.user.id]).rows[0] || {};
      const { calculateTargets } = await import('../lib/nutritionTargets.js');
      const t = calculateTargets({
        sex: p.sex, weight_kg: p.weight_kg, height_cm: p.height_cm, age: p.age,
        activity_level: p.activity_level, eating_style: p.eating_style,
      });
      // Only overwrite if the user hasn't manually customized targets in
      // the Nutrition Targets editor (targets_custom = 1).
      if (t.calorie_target && !p.targets_custom) {
        pool.query(
          'UPDATE client_profiles SET calorie_target = ?, protein_target = ?, fat_target = ?, carbs_target = ? WHERE user_id = ?',
          [t.calorie_target, t.protein_target, t.fat_target, t.carbs_target, req.user.id],
        );
      }
    } else {
      // Lifestyle field — patch onboarding_answers.answers_json + the
      // first-class column when it exists.
      const ob = pool.query('SELECT * FROM onboarding_answers WHERE user_id = ?', [req.user.id]).rows[0];
      let json = {};
      try { json = ob?.answers_json ? JSON.parse(ob.answers_json) : {}; } catch {}
      json[field] = value;

      if (!ob) {
        // Edge case: no onboarding row yet (legacy account). Insert one.
        pool.query(
          `INSERT INTO onboarding_answers (user_id, answers_json) VALUES (?, ?)`,
          [req.user.id, JSON.stringify(json)],
        );
      } else {
        // Update both the JSON blob + the first-class column (if it
        // exists in the schema) so coach-side queries that read columns
        // stay current.
        const colMap = { goal: 'goal', experience: 'experience', equipment: 'equipment', injuries: 'injuries', days: 'schedule' };
        const col = colMap[field];
        if (col) {
          const v = field === 'injuries' && Array.isArray(value) ? value.join(',') : (field === 'days' ? String(value) : value);
          pool.query(
            `UPDATE onboarding_answers SET answers_json = ?, ${col} = ? WHERE user_id = ?`,
            [JSON.stringify(json), v, req.user.id],
          );
        } else {
          pool.query(
            'UPDATE onboarding_answers SET answers_json = ? WHERE user_id = ?',
            [JSON.stringify(json), req.user.id],
          );
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('answers patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
