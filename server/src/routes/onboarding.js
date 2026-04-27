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

export default router;
