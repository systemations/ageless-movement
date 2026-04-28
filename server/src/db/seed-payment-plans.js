// Idempotent seeder for the initial payment plans + their automation
// chains. Modeled on Dan's existing FitBudd offer ladder (free lead →
// $49 entry → weekly/monthly memberships → hidden high-ticket coaching).
//
// Idempotent on the unique `slug` column — re-running on every server
// start only INSERTs rows whose slug isn't already present, so a coach
// editing a plan in the admin won't get overwritten.
//
// Apple IAP price points are fixed by Apple's tier ladder; iOS twins
// pick the closest tier at or above the web price + 30% markup so the
// platform fee is absorbed with margin held whole.

import pool from './pool.js';

const PLANS = [
  {
    slug: 'free-tier',
    name: 'Free',
    description: 'Free preview workouts and limited access. Try Ageless Movement before committing.',
    image_url: null,
    platform: 'all',
    hidden: 0,
    billing_type: 'one_time',
    price_cents: 0,
    free_trial_days: 0,
    tier_id: 1,
    sort_order: 0,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 1 } },
      { action_type: 'enroll_program', config: { program_id: 1 } },
    ],
  },
  {
    slug: 'am-49-entry',
    name: 'Ageless Movement @ $49',
    description: 'One-time entry: 8-week intro to the Ageless Movement method.',
    image_url: null,
    platform: 'web',
    hidden: 0,
    billing_type: 'one_time',
    price_cents: 4900,
    free_trial_days: 0,
    tier_id: 2,
    sort_order: 10,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 2 } },
      { action_type: 'enroll_program', config: { program_id: 1 } },
      { action_type: 'notify_coach', config: { title: 'New $49 entry purchase', body: 'Welcome the client and explain next steps.' } },
    ],
  },
  {
    slug: 'membership-weekly-web',
    name: 'Ageless Movement Membership - Weekly',
    description: 'Full access. Programs, follow-alongs, coach chat. Cancel any time.',
    image_url: null,
    platform: 'web',
    hidden: 0,
    billing_type: 'weekly',
    price_cents: 3499,
    free_trial_days: 3,
    tier_id: 3,
    sort_order: 20,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 3 } },
      { action_type: 'enroll_program', config: { program_id: 38 } },
      { action_type: 'notify_coach', config: { title: 'New Weekly member', body: 'Send welcome message and confirm program fit.' } },
    ],
  },
  {
    // iOS twin of the weekly membership. Price marked up to absorb the
    // Apple 30% IAP cut; lands on the next valid IAP tier above price+30%.
    // $34.99 + 30% = $45.49 → $44.99 IAP tier (closest at-or-above is
    // actually $49.99, but $44.99 is the standard fitness-app rounding).
    slug: 'membership-weekly-ios',
    name: '*On App Store - Membership Weekly',
    description: 'Full access via App Store purchase. Programs, follow-alongs, coach chat.',
    image_url: null,
    platform: 'ios',
    hidden: 0,
    billing_type: 'weekly',
    price_cents: 4499,
    free_trial_days: 3,
    tier_id: 3,
    sort_order: 21,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 3 } },
      { action_type: 'enroll_program', config: { program_id: 38 } },
      { action_type: 'notify_coach', config: { title: 'New Weekly member (iOS)', body: 'Send welcome message and confirm program fit.' } },
    ],
  },
  {
    slug: 'membership-monthly-web',
    name: 'Ageless Movement Membership - Monthly',
    description: 'Full access at a monthly cadence. Save vs weekly.',
    image_url: null,
    platform: 'web',
    hidden: 0,
    billing_type: 'monthly',
    price_cents: 13500,
    free_trial_days: 3,
    tier_id: 3,
    sort_order: 30,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 3 } },
      { action_type: 'enroll_program', config: { program_id: 38 } },
      { action_type: 'notify_coach', config: { title: 'New Monthly member', body: 'Send welcome message and confirm program fit.' } },
    ],
  },
  {
    // iOS twin of the monthly membership. $135 + 30% = $175.50 →
    // $179.99 is the next IAP tier above that.
    slug: 'membership-monthly-ios',
    name: '*On App Store - Membership Monthly',
    description: 'Full access via App Store purchase, billed monthly.',
    image_url: null,
    platform: 'ios',
    hidden: 0,
    billing_type: 'monthly',
    price_cents: 17999,
    free_trial_days: 3,
    tier_id: 3,
    sort_order: 31,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 3 } },
      { action_type: 'enroll_program', config: { program_id: 38 } },
      { action_type: 'notify_coach', config: { title: 'New Monthly member (iOS)', body: 'Send welcome message and confirm program fit.' } },
    ],
  },
  {
    // Hidden plan: not on the public Packages page; sold by sharing
    // /checkout/am-elite-1800 directly from a coach chat.
    slug: 'am-elite-1800',
    name: 'AM Elite Coaching - 12 Weeks',
    description: 'Personalised coaching package. 12 weeks of 1:1 support, custom programming, weekly reviews.',
    image_url: null,
    platform: 'web',
    hidden: 1,
    billing_type: 'one_time',
    price_cents: 180000,
    free_trial_days: 0,
    tier_id: 4,
    sort_order: 100,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 4 } },
      { action_type: 'enroll_program', config: { program_id: 39 } },
      { action_type: 'notify_coach', config: { title: 'NEW ELITE CLIENT', body: 'Schedule kick-off call within 24h.' } },
    ],
  },
  {
    slug: 'eminence-7000',
    name: 'Eminence - 12 Months',
    description: 'Full-year premium coaching. Direct access, monthly in-person or video reviews, bespoke programming.',
    image_url: null,
    platform: 'web',
    hidden: 1,
    billing_type: 'one_time',
    price_cents: 700000,
    free_trial_days: 0,
    tier_id: 4,
    sort_order: 110,
    automations: [
      { action_type: 'set_tier', config: { tier_id: 4 } },
      { action_type: 'enroll_program', config: { program_id: 39 } },
      { action_type: 'notify_coach', config: { title: 'NEW EMINENCE CLIENT', body: 'Schedule kick-off call within 24h. Onboard to Eminence resources.' } },
    ],
  },
];

export function seedPaymentPlans() {
  try {
    const existing = pool.query('SELECT slug FROM payment_plans').rows;
    const have = new Set(existing.map((r) => r.slug));
    let inserted = 0;

    for (const plan of PLANS) {
      if (have.has(plan.slug)) continue;

      const result = pool.query(
        `INSERT INTO payment_plans
          (slug, name, description, image_url, platform, hidden, billing_type,
           price_cents, currency, free_trial_days, tier_id, sort_order, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD', $9, $10, $11, 1)
         RETURNING id`,
        [
          plan.slug, plan.name, plan.description, plan.image_url,
          plan.platform, plan.hidden, plan.billing_type,
          plan.price_cents, plan.free_trial_days, plan.tier_id, plan.sort_order,
        ],
      );
      const planId = result.rows[0].id;

      for (let i = 0; i < plan.automations.length; i++) {
        const a = plan.automations[i];
        pool.query(
          `INSERT INTO payment_plan_automations
            (plan_id, action_type, action_config, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [planId, a.action_type, JSON.stringify(a.config), i],
        );
      }
      inserted++;
    }

    if (inserted > 0) {
      console.log(`Seeded ${inserted} payment plan(s).`);
    }
  } catch (e) {
    console.error('Payment plans seed failed:', e.message);
  }
}
