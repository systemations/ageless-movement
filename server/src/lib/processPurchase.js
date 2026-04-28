// Single entry point for fulfilling a purchase. Three callers:
//   1. Manual coach action ("Mark as paid" in admin)        source='manual_admin'
//   2. Stripe checkout webhook (when wired)                  source='stripe'
//   3. Apple/Google IAP receipt validation (when wired)      source='apple_iap' | 'google_play'
//
// Records a user_purchases row, then runs each automation step in the
// plan's chain (in sort_order). Every step's result is logged to
// automations_ran (JSON array) on the purchase row so we can debug
// partial failures without re-running the whole chain.
//
// The function is intentionally side-effect-tolerant: if one step
// fails (e.g. coach_id missing for notify_coach), it logs the error
// and continues. The purchase still records as paid; the operator can
// retry individual steps from the admin if needed.

import pool from '../db/pool.js';

// Action handlers — keyed by action_type. Each receives (userId, config)
// where config is the parsed action_config JSON. Throws on failure.
const actionHandlers = {
  set_tier(userId, config) {
    if (!config.tier_id) throw new Error('tier_id required');
    pool.query(
      'UPDATE client_profiles SET tier_id = ? WHERE user_id = ?',
      [config.tier_id, userId],
    );
  },

  enroll_program(userId, config) {
    if (!config.program_id) throw new Error('program_id required');
    const existing = pool.query(
      'SELECT id FROM client_programs WHERE user_id = ? AND program_id = ?',
      [userId, config.program_id],
    );
    if (existing.rows.length > 0) {
      // Already enrolled — no-op rather than duplicate row
      return;
    }
    const workoutCount = pool.query(
      'SELECT COUNT(*) as total FROM workouts WHERE program_id = ?',
      [config.program_id],
    );
    const total = workoutCount.rows[0]?.total || 0;
    pool.query(
      `INSERT INTO client_programs
        (user_id, program_id, current_week, current_day, started_at,
         completed_workouts, total_workouts)
       VALUES (?, ?, 1, 1, ?, 0, ?)`,
      [userId, config.program_id, new Date().toISOString(), total],
    );
  },

  send_message(userId, config) {
    if (!config.body) throw new Error('body required');
    // Resolve from_user_id: explicit > client's coach > first fitness coach.
    let fromUserId = config.from_user_id;
    if (!fromUserId) {
      const clientRow = pool.query(
        'SELECT coach_id FROM users WHERE id = ?',
        [userId],
      ).rows[0];
      fromUserId = clientRow?.coach_id;
    }
    if (!fromUserId) {
      // Fallback: any fitness coach (Dan id=2 or Joonas id=6).
      // Amy (id=5) is excluded per feedback_amy_not_fitness_coach.
      const fallback = pool.query(
        "SELECT id FROM users WHERE role='coach' AND id IN (2, 6) ORDER BY id LIMIT 1",
      ).rows[0];
      fromUserId = fallback?.id;
    }
    if (!fromUserId) throw new Error('no coach available to send from');

    // Find or create a direct conversation between coach and user
    let convo = pool.query(
      `SELECT c.id FROM conversations c
       WHERE c.type = 'direct'
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
       LIMIT 1`,
      [fromUserId, userId],
    ).rows[0];

    if (!convo) {
      const created = pool.query(
        "INSERT INTO conversations (type) VALUES ('direct') RETURNING id",
        [],
      );
      convo = created.rows[0];
      pool.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [convo.id, fromUserId],
      );
      pool.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [convo.id, userId],
      );
    }

    pool.query(
      `INSERT INTO messages
        (conversation_id, sender_id, content, message_type)
       VALUES (?, ?, ?, 'text')`,
      [convo.id, fromUserId, config.body],
    );
  },

  add_to_group(userId, config) {
    if (!config.conversation_id) throw new Error('conversation_id required');
    const existing = pool.query(
      'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [config.conversation_id, userId],
    );
    if (existing.rows.length > 0) return;
    pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
      [config.conversation_id, userId],
    );
  },

  notify_coach(userId, config) {
    if (!config.title) throw new Error('title required');
    // Resolve which coach to notify. Same fallback chain as send_message.
    const clientRow = pool.query(
      'SELECT coach_id FROM users WHERE id = ?',
      [userId],
    ).rows[0];
    let coachId = clientRow?.coach_id;
    if (!coachId) {
      const fallback = pool.query(
        "SELECT id FROM users WHERE role='coach' AND id IN (2, 6) ORDER BY id LIMIT 1",
      ).rows[0];
      coachId = fallback?.id;
    }
    if (!coachId) throw new Error('no coach available to notify');

    pool.query(
      `INSERT INTO in_app_notifications
        (kind, title, body, audience, audience_user_id, active, created_by)
       VALUES ('custom', ?, ?, 'user', ?, 1, ?)`,
      [config.title, config.body || null, coachId, userId],
    );
  },

  schedule_checkin(userId, config) {
    const days = Number.isFinite(config.days_from_now) ? config.days_from_now : 7;
    const due = new Date();
    due.setDate(due.getDate() + days);
    pool.query(
      `INSERT INTO post_signup_tasks (user_id, task_type, due_at)
       VALUES (?, 'checkin_reminder', ?)`,
      [userId, due.toISOString()],
    );
  },
};

export function processPurchase({
  userId,
  planId,
  source,
  externalId = null,
  amountCentsOverride = null,
  markedBy = null,
}) {
  if (!userId || !planId || !source) {
    throw new Error('processPurchase: userId, planId, source required');
  }

  const planRow = pool.query(
    'SELECT * FROM payment_plans WHERE id = ?',
    [planId],
  ).rows[0];
  if (!planRow) throw new Error(`plan ${planId} not found`);

  const automations = pool.query(
    `SELECT action_type, action_config FROM payment_plan_automations
     WHERE plan_id = ? ORDER BY sort_order`,
    [planId],
  ).rows;

  const ran = [];
  for (const step of automations) {
    const handler = actionHandlers[step.action_type];
    const ranAt = new Date().toISOString();
    if (!handler) {
      ran.push({ action_type: step.action_type, ok: false, error: 'unknown action_type', ran_at: ranAt });
      continue;
    }
    let config;
    try {
      config = JSON.parse(step.action_config || '{}');
    } catch (e) {
      ran.push({ action_type: step.action_type, ok: false, error: 'invalid action_config json', ran_at: ranAt });
      continue;
    }
    try {
      handler(userId, config);
      ran.push({ action_type: step.action_type, ok: true, ran_at: ranAt });
    } catch (e) {
      ran.push({ action_type: step.action_type, ok: false, error: e.message, ran_at: ranAt });
    }
  }

  const amount = amountCentsOverride != null ? amountCentsOverride : planRow.price_cents;
  const purchase = pool.query(
    `INSERT INTO user_purchases
      (user_id, plan_id, source, external_id, amount_cents, currency, marked_by, automations_ran)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, purchased_at`,
    [userId, planId, source, externalId, amount, planRow.currency, markedBy, JSON.stringify(ran)],
  );

  return {
    purchase_id: purchase.rows[0].id,
    purchased_at: purchase.rows[0].purchased_at,
    automations_ran: ran,
    plan: { id: planRow.id, name: planRow.name, slug: planRow.slug },
  };
}
