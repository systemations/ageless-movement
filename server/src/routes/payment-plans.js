// Payment Plans API. Three audiences:
//
//   PUBLIC (unauthenticated):
//     GET /api/plans                    -> list visible plans for current platform
//     GET /api/plans/by-slug/:slug      -> fetch a single plan (for hidden share-links)
//
//   CLIENT (authenticated):
//     GET /api/plans/me/purchases       -> own purchase history
//
//   COACH (authenticated, role=coach):
//     GET /api/plans/admin              -> all plans, including hidden + inactive
//     POST /api/plans/admin             -> create
//     PATCH /api/plans/admin/:id        -> update
//     DELETE /api/plans/admin/:id       -> delete
//     GET /api/plans/admin/:id/automations           -> list chain
//     PUT /api/plans/admin/:id/automations           -> replace chain (atomic)
//     POST /api/plans/admin/:id/mark-paid            -> manual purchase fulfilment
//                                                       body: { user_id, source?, external_id?, amount_cents? }
//     GET /api/plans/admin/clients/:userId/purchases -> client's purchase history

import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, requireCoachOwnsClient, requireCoachOwnsClientBody } from '../middleware/auth.js';
import { processPurchase } from '../lib/processPurchase.js';

const router = Router();

// Detect the requesting platform from User-Agent so we can scope the
// public list. iOS purchases must use IAP, so iOS clients see iOS plans
// (and 'all' plans). Android sees android+all, web sees web+all.
function detectPlatform(req) {
  const ua = req.headers['user-agent'] || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

function rowToPlan(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    image_url: r.image_url,
    platform: r.platform,
    hidden: !!r.hidden,
    billing_type: r.billing_type,
    price_cents: r.price_cents,
    currency: r.currency,
    free_trial_days: r.free_trial_days,
    tier_id: r.tier_id,
    stripe_price_id: r.stripe_price_id,
    apple_iap_product_id: r.apple_iap_product_id,
    sort_order: r.sort_order,
    active: !!r.active,
    created_at: r.created_at,
  };
}

// =========================================================================
// PUBLIC
// =========================================================================

// List visible plans for the current platform. Used by the onboarding
// /packages step and any future "Upgrade" surface.
router.get('/', (req, res) => {
  try {
    const platform = (req.query.platform || detectPlatform(req)).toString();
    const rows = pool.query(
      `SELECT * FROM payment_plans
       WHERE active = 1 AND hidden = 0
         AND (platform = 'all' OR platform = ?)
       ORDER BY sort_order, id`,
      [platform],
    ).rows;
    res.json({ plans: rows.map(rowToPlan), platform });
  } catch (err) {
    console.error('List plans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Fetch a single plan by slug. Works for hidden plans too (the slug acts
// as the unguessable-enough share link key for now; can be tightened to
// a separate share_token column later if needed).
router.get('/by-slug/:slug', (req, res) => {
  try {
    const r = pool.query(
      'SELECT * FROM payment_plans WHERE slug = ? AND active = 1',
      [req.params.slug],
    ).rows[0];
    if (!r) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: rowToPlan(r) });
  } catch (err) {
    console.error('Get plan by slug error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =========================================================================
// CLIENT
// =========================================================================

// Record the client's chosen plan from the onboarding Packages step.
// Stamps client_profiles.tier_requested_id from the plan's tier_id so the
// coach sees "chose Prime, awaiting payment". For Free plans we run the
// purchase chain immediately (source='free_signup') so they're enrolled
// in the lead-magnet program with no coach intervention needed.
router.post('/me/choose', authenticateToken, (req, res) => {
  try {
    const planId = Number(req.body?.plan_id);
    if (!Number.isFinite(planId)) return res.status(400).json({ error: 'plan_id required' });
    const plan = pool.query('SELECT * FROM payment_plans WHERE id = ? AND active = 1', [planId]).rows[0];
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const isFree = plan.price_cents === 0;

    // Mark onboarding complete - picking a plan is the terminal step of
    // the funnel, regardless of whether they came via the questionnaire.
    pool.query(
      'UPDATE client_profiles SET onboarding_complete = 1 WHERE user_id = ?',
      [req.user.id],
    );

    if (isFree) {
      const result = processPurchase({
        userId: req.user.id,
        planId: plan.id,
        source: 'free_signup',
        markedBy: req.user.id,
      });
      return res.json({ chosen_plan: { id: plan.id, name: plan.name, slug: plan.slug }, free: true, ...result });
    }

    // Paid plan: stamp tier_requested_id, leave tier_id alone until paid.
    if (plan.tier_id) {
      pool.query(
        'UPDATE client_profiles SET tier_requested_id = ? WHERE user_id = ?',
        [plan.tier_id, req.user.id],
      );
    }
    res.json({ chosen_plan: { id: plan.id, name: plan.name, slug: plan.slug }, free: false });
  } catch (err) {
    console.error('Choose plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/purchases', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      `SELECT up.id, up.plan_id, up.source, up.amount_cents, up.currency,
              up.purchased_at, p.name as plan_name, p.slug as plan_slug
       FROM user_purchases up
       JOIN payment_plans p ON p.id = up.plan_id
       WHERE up.user_id = ?
       ORDER BY up.purchased_at DESC`,
      [req.user.id],
    ).rows;
    res.json({ purchases: rows });
  } catch (err) {
    console.error('My purchases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =========================================================================
// COACH ADMIN
// =========================================================================

const requireCoach = [authenticateToken, requireRole('coach')];

router.get('/admin', ...requireCoach, (req, res) => {
  try {
    const rows = pool.query(
      'SELECT * FROM payment_plans ORDER BY sort_order, id',
    ).rows;
    res.json({ plans: rows.map(rowToPlan) });
  } catch (err) {
    console.error('Admin list plans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PLATFORMS = new Set(['all', 'web', 'android', 'ios']);
const BILLING_TYPES = new Set(['one_time', 'weekly', 'monthly', 'quarterly', 'yearly']);
const ACTION_TYPES = new Set([
  'enroll_program', 'send_message', 'add_to_group', 'set_tier', 'notify_coach', 'schedule_checkin',
]);

function validatePlanInput(body, { partial = false } = {}) {
  const errors = [];
  if (!partial || body.platform !== undefined) {
    if (body.platform && !PLATFORMS.has(body.platform)) errors.push('platform invalid');
  }
  if (!partial || body.billing_type !== undefined) {
    if (body.billing_type && !BILLING_TYPES.has(body.billing_type)) errors.push('billing_type invalid');
  }
  if (!partial) {
    if (!body.name) errors.push('name required');
    if (!body.slug) errors.push('slug required');
  }
  if (body.price_cents !== undefined && (!Number.isFinite(body.price_cents) || body.price_cents < 0)) {
    errors.push('price_cents must be non-negative integer');
  }
  if (body.free_trial_days !== undefined && (!Number.isInteger(body.free_trial_days) || body.free_trial_days < 0)) {
    errors.push('free_trial_days must be non-negative integer');
  }
  return errors;
}

router.post('/admin', ...requireCoach, (req, res) => {
  try {
    const b = req.body || {};
    const errors = validatePlanInput(b);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const dup = pool.query('SELECT id FROM payment_plans WHERE slug = ?', [b.slug]).rows[0];
    if (dup) return res.status(409).json({ error: 'slug already in use' });

    const r = pool.query(
      `INSERT INTO payment_plans
        (slug, name, description, image_url, platform, hidden, billing_type,
         price_cents, currency, free_trial_days, tier_id, stripe_price_id,
         apple_iap_product_id, sort_order, active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        b.slug, b.name, b.description || null, b.image_url || null,
        b.platform || 'all', b.hidden ? 1 : 0, b.billing_type || 'one_time',
        b.price_cents || 0, b.currency || 'USD', b.free_trial_days || 0,
        b.tier_id || null, b.stripe_price_id || null,
        b.apple_iap_product_id || null, b.sort_order || 0,
        b.active === false ? 0 : 1, req.user.id,
      ],
    );
    res.status(201).json({ plan: rowToPlan(r.rows[0]) });
  } catch (err) {
    console.error('Create plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/admin/:id', ...requireCoach, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const existing = pool.query('SELECT * FROM payment_plans WHERE id = ?', [id]).rows[0];
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    const b = req.body || {};
    const errors = validatePlanInput(b, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (b.slug && b.slug !== existing.slug) {
      const dup = pool.query('SELECT id FROM payment_plans WHERE slug = ? AND id <> ?', [b.slug, id]).rows[0];
      if (dup) return res.status(409).json({ error: 'slug already in use' });
    }

    // Whitelisted updatable fields. Sweep b for present keys, build dynamic UPDATE.
    const FIELDS = [
      'slug', 'name', 'description', 'image_url', 'platform', 'hidden',
      'billing_type', 'price_cents', 'currency', 'free_trial_days', 'tier_id',
      'stripe_price_id', 'apple_iap_product_id', 'sort_order', 'active',
    ];
    const sets = [];
    const params = [];
    for (const f of FIELDS) {
      if (b[f] === undefined) continue;
      let v = b[f];
      if (f === 'hidden' || f === 'active') v = v ? 1 : 0;
      sets.push(`${f} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return res.json({ plan: rowToPlan(existing) });
    sets.push("updated_at = datetime('now')");
    params.push(id);

    pool.query(`UPDATE payment_plans SET ${sets.join(', ')} WHERE id = ?`, params);
    const updated = pool.query('SELECT * FROM payment_plans WHERE id = ?', [id]).rows[0];
    res.json({ plan: rowToPlan(updated) });
  } catch (err) {
    console.error('Update plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/admin/:id', ...requireCoach, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const existing = pool.query('SELECT id FROM payment_plans WHERE id = ?', [id]).rows[0];
    if (!existing) return res.status(404).json({ error: 'Plan not found' });
    // Don't hard-delete if there are purchases against it - soft-delete via active=0.
    const purchaseCount = pool.query('SELECT COUNT(*) as c FROM user_purchases WHERE plan_id = ?', [id]).rows[0].c;
    if (purchaseCount > 0) {
      pool.query('UPDATE payment_plans SET active = 0 WHERE id = ?', [id]);
      return res.json({ deactivated: true, reason: 'purchases exist; soft-deleted' });
    }
    pool.query('DELETE FROM payment_plans WHERE id = ?', [id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admin/:id/automations', ...requireCoach, (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = pool.query(
      'SELECT id, action_type, action_config, sort_order FROM payment_plan_automations WHERE plan_id = ? ORDER BY sort_order',
      [id],
    ).rows;
    res.json({
      automations: rows.map((r) => ({
        id: r.id, action_type: r.action_type, sort_order: r.sort_order,
        action_config: safeJson(r.action_config),
      })),
    });
  } catch (err) {
    console.error('List automations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Replace the whole chain atomically. Body: { automations: [{ action_type, action_config }] }.
router.put('/admin/:id/automations', ...requireCoach, (req, res) => {
  try {
    const id = Number(req.params.id);
    const exists = pool.query('SELECT id FROM payment_plans WHERE id = ?', [id]).rows[0];
    if (!exists) return res.status(404).json({ error: 'Plan not found' });

    const list = Array.isArray(req.body?.automations) ? req.body.automations : [];
    for (const a of list) {
      if (!ACTION_TYPES.has(a.action_type)) {
        return res.status(400).json({ error: `unknown action_type: ${a.action_type}` });
      }
      if (a.action_config && typeof a.action_config !== 'object') {
        return res.status(400).json({ error: 'action_config must be an object' });
      }
    }

    pool.query('DELETE FROM payment_plan_automations WHERE plan_id = ?', [id]);
    list.forEach((a, i) => {
      pool.query(
        'INSERT INTO payment_plan_automations (plan_id, action_type, action_config, sort_order) VALUES (?, ?, ?, ?)',
        [id, a.action_type, JSON.stringify(a.action_config || {}), i],
      );
    });

    const rows = pool.query(
      'SELECT id, action_type, action_config, sort_order FROM payment_plan_automations WHERE plan_id = ? ORDER BY sort_order',
      [id],
    ).rows;
    res.json({
      automations: rows.map((r) => ({
        id: r.id, action_type: r.action_type, sort_order: r.sort_order,
        action_config: safeJson(r.action_config),
      })),
    });
  } catch (err) {
    console.error('Update automations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Manual fulfilment - coach marks a client as having paid for a plan.
// Runs the same processPurchase() that Stripe/IAP webhooks will hit later.
router.post('/admin/:id/mark-paid', ...requireCoach, requireCoachOwnsClientBody('user_id'), (req, res) => {
  try {
    const planId = Number(req.params.id);
    const userId = Number(req.body?.user_id);
    if (!Number.isFinite(planId) || !Number.isFinite(userId)) {
      return res.status(400).json({ error: 'plan id and user_id required' });
    }
    const exists = pool.query('SELECT id FROM payment_plans WHERE id = ?', [planId]).rows[0];
    if (!exists) return res.status(404).json({ error: 'Plan not found' });

    const result = processPurchase({
      userId,
      planId,
      source: req.body?.source || 'manual_admin',
      externalId: req.body?.external_id || null,
      amountCentsOverride: Number.isFinite(req.body?.amount_cents) ? req.body.amount_cents : null,
      markedBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('Mark paid error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.get('/admin/clients/:userId/purchases', ...requireCoach, requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const rows = pool.query(
      `SELECT up.*, p.name as plan_name, p.slug as plan_slug
       FROM user_purchases up
       JOIN payment_plans p ON p.id = up.plan_id
       WHERE up.user_id = ?
       ORDER BY up.purchased_at DESC`,
      [userId],
    ).rows;
    res.json({
      purchases: rows.map((r) => ({
        ...r,
        automations_ran: safeJson(r.automations_ran),
      })),
    });
  } catch (err) {
    console.error('Client purchases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export default router;
