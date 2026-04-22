// Coaches routes: public "Meet the Team" + coach admin profile/session/booking
// endpoints. Payment is currently a stub with a single clear hook point marked
// `STRIPE_HOOK` — swapping it for real Stripe Connect later is isolated to this
// file and the webhook handler.
import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// ---------- helpers ---------------------------------------------------------

const toSpecialtiesArray = (raw) =>
  (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const parseJson = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const shapeCoach = (row) => ({
  id: row.user_id,
  user_id: row.user_id,
  name: row.name,
  headline: row.headline,
  tagline: row.tagline,
  accent_color: row.accent_color || '#FF8C00',
  bio: row.bio,
  origin_story: row.origin_story,
  pull_quote: row.pull_quote,
  help_bullets: parseJson(row.help_bullets, []),
  social_links: parseJson(row.social_links, {}),
  photo_url: row.photo_url,
  avatar_url: row.avatar_url,
  specialties: toSpecialtiesArray(row.specialties),
  years_experience: row.years_experience,
  qualifications: row.qualifications,
  is_public: !!row.is_public,
  membership_tier: row.membership_tier,
  pricing_tier_id: row.pricing_tier_id ?? null,
  pricing_tier_slug: row.pricing_tier_slug || null,
  pricing_tier_name: row.pricing_tier_name || null,
  from_price_cents: row.from_price_cents ?? null,
  from_price_currency: row.from_price_currency ?? 'USD',
});

const getCoachProfileRow = (userId) => {
  const q = pool.query(
    `SELECT cp.*, u.name, u.avatar_url,
            cpt.slug AS pricing_tier_slug, cpt.name AS pricing_tier_name,
            (SELECT MIN(price_cents) FROM coach_session_types
              WHERE coach_user_id = u.id AND is_active = 1) AS from_price_cents,
            (SELECT currency FROM coach_session_types
              WHERE coach_user_id = u.id AND is_active = 1
              ORDER BY price_cents ASC LIMIT 1) AS from_price_currency
       FROM coach_profiles cp
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN coach_pricing_tiers cpt ON cpt.id = cp.pricing_tier_id
      WHERE cp.user_id = ?`,
    [userId],
  );
  return q.rows[0] || null;
};

// Update the coach's 30-min and 60-min session types to match the tier's
// default prices. Only touches matching-duration rows; leaves other lengths
// and custom titles/descriptions alone.
const syncCoachSessionPricesToTier = (coachUserId, tierRow) => {
  if (!tierRow) return;
  pool.query(
    `UPDATE coach_session_types
        SET price_cents = ?, currency = ?
      WHERE coach_user_id = ? AND duration_minutes = 30`,
    [tierRow.price_30min_cents, tierRow.currency || 'USD', coachUserId],
  );
  pool.query(
    `UPDATE coach_session_types
        SET price_cents = ?, currency = ?
      WHERE coach_user_id = ? AND duration_minutes = 60`,
    [tierRow.price_60min_cents, tierRow.currency || 'USD', coachUserId],
  );
};

// Weekday number helper — JS Date.getDay() is 0=Sun..6=Sat
const pad2 = (n) => String(n).padStart(2, '0');

// Given availability rows (weekday/start/end) and existing bookings, generate
// 30-minute slot timestamps for the next N days.
const generateSlots = (availability, existingBookings, daysAhead, durationMinutes) => {
  const slots = [];
  const now = new Date();
  const bookingSet = new Set(
    (existingBookings || []).map((b) => new Date(b.scheduled_at).toISOString()),
  );

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const weekday = day.getDay();
    const daySlots = availability.filter((a) => a.weekday === weekday);

    for (const block of daySlots) {
      const [sh, sm] = block.start_time.split(':').map(Number);
      const [eh, em] = block.end_time.split(':').map(Number);
      const blockStart = new Date(day);
      blockStart.setHours(sh, sm, 0, 0);
      const blockEnd = new Date(day);
      blockEnd.setHours(eh, em, 0, 0);

      for (
        let t = new Date(blockStart);
        t.getTime() + durationMinutes * 60_000 <= blockEnd.getTime();
        t.setMinutes(t.getMinutes() + 30)
      ) {
        if (t.getTime() <= now.getTime() + 60 * 60 * 1000) continue; // at least 1h notice
        const iso = new Date(t).toISOString();
        if (bookingSet.has(iso)) continue;
        slots.push({
          iso,
          date: iso.slice(0, 10),
          time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}`,
        });
      }
    }
  }
  return slots;
};

// =====================================================================
//  PUBLIC — any authenticated client
// =====================================================================

// NOTE: all literal paths (/me/*, /admin/*) must be declared BEFORE /:id so
// Express matches them first rather than treating "me" or "admin" as an id.

// List all public coaches for the "Meet the Team" strip
router.get('/', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      `SELECT cp.*, u.name, u.avatar_url,
              (SELECT MIN(price_cents) FROM coach_session_types
                WHERE coach_user_id = u.id AND is_active = 1) AS from_price_cents,
              (SELECT currency FROM coach_session_types
                WHERE coach_user_id = u.id AND is_active = 1
                ORDER BY price_cents ASC LIMIT 1) AS from_price_currency
         FROM coach_profiles cp
         JOIN users u ON u.id = cp.user_id
        WHERE COALESCE(cp.is_public, 1) = 1 AND u.role = 'coach'
        ORDER BY COALESCE(cp.sort_order, 0), u.name`,
    ).rows;
    res.json({ coaches: rows.map(shapeCoach) });
  } catch (err) {
    console.error('coaches list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client's own bookings — must be BEFORE /:id so "me" isn't treated as an id
router.get('/me/bookings', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      `SELECT b.*, u.name AS coach_name, cp.photo_url AS coach_photo, cp.headline AS coach_headline,
              st.title AS session_title
         FROM coach_bookings b
         JOIN users u ON u.id = b.coach_user_id
         LEFT JOIN coach_profiles cp ON cp.user_id = b.coach_user_id
         LEFT JOIN coach_session_types st ON st.id = b.session_type_id
        WHERE b.client_user_id = ?
        ORDER BY b.scheduled_at DESC`,
      [req.user.id],
    ).rows;
    res.json({ bookings: rows });
  } catch (err) {
    console.error('me/bookings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel an upcoming booking (client-initiated)
router.patch('/me/bookings/:id/cancel', authenticateToken, (req, res) => {
  try {
    const row = pool.query(
      'SELECT * FROM coach_bookings WHERE id = ? AND client_user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    pool.query("UPDATE coach_bookings SET status = 'cancelled' WHERE id = ?", [row.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('cancel booking error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================================================================
//  COACH ADMIN — coaches editing profiles + sessions
//  (declared before /:id so "admin" isn't captured as a coach id)
//
//  Any authenticated coach can manage any other coach. Pass ?coach_id=X
//  on any admin endpoint to target that coach; defaults to the caller.
// =====================================================================

// Helper: the coach being edited. Defaults to the calling coach but any
// coach can override with ?coach_id=X (Dan-is-head-coach model).
const targetCoachId = (req) => {
  const q = parseInt(req.query.coach_id, 10);
  if (q && !Number.isNaN(q)) return q;
  if (req.body && req.body.coach_id) {
    const b = parseInt(req.body.coach_id, 10);
    if (!Number.isNaN(b)) return b;
  }
  return req.user.id;
};

// List all coaches (for the Team selector in the admin UI)
router.get('/admin/list', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const rows = pool.query(
      `SELECT u.id AS user_id, u.name, u.email, u.avatar_url,
              cp.headline, cp.tagline, cp.accent_color, cp.photo_url,
              cp.is_public, cp.sort_order,
              cp.pricing_tier_id,
              cpt.slug AS pricing_tier_slug, cpt.name AS pricing_tier_name
         FROM users u
         LEFT JOIN coach_profiles cp ON cp.user_id = u.id
         LEFT JOIN coach_pricing_tiers cpt ON cpt.id = cp.pricing_tier_id
        WHERE u.role = 'coach'
        ORDER BY COALESCE(cp.sort_order, 0), u.name`,
    ).rows;
    res.json({ coaches: rows });
  } catch (err) {
    console.error('admin/list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new coach user + profile + default session types + availability
router.post('/admin/create', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const { email, name, password, headline } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' });
    }
    const existing = pool.query('SELECT id FROM users WHERE email = ?', [email]).rows[0];
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash(password || 'welcome123', 10);

    const user = pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES (?, ?, ?, 'coach')
       RETURNING id, email, name, role`,
      [email, hash, name],
    ).rows[0];

    pool.query(
      `INSERT INTO coach_profiles (user_id, headline, bio, specialties, years_experience, qualifications, is_public)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        user.id,
        headline || 'Mobility and Longevity Coach',
        null,
        'Mobility,Strength,Longevity',
        null,
        null,
      ],
    );

    // Seed default session types matching Dan's $55 / $97 structure
    pool.query(
      `INSERT INTO coach_session_types
        (coach_user_id, title, description, duration_minutes, price_cents, currency, is_active, sort_order)
       VALUES (?, '30 Minute 1:1 Session', 'A focused video call to review your movement, ask questions, or unpack a specific issue. Great for a quick tune-up.', 30, 5500, 'USD', 1, 0)`,
      [user.id],
    );
    pool.query(
      `INSERT INTO coach_session_types
        (coach_user_id, title, description, duration_minutes, price_cents, currency, is_active, sort_order)
       VALUES (?, '60 Minute 1:1 Session', 'A full-length video call for in-depth coaching, full programming review, and detailed technique work.', 60, 9700, 'USD', 1, 1)`,
      [user.id],
    );

    // Seed Mon-Fri 09:00-17:00 availability
    for (let weekday = 1; weekday <= 5; weekday++) {
      pool.query(
        'INSERT INTO coach_availability (coach_user_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
        [user.id, weekday, '09:00', '17:00'],
      );
    }

    res.json({ coach: user });
  } catch (err) {
    console.error('admin/create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a coach (removes user; FKs cascade profile/sessions/availability/bookings)
router.delete('/admin/coaches/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const coachId = parseInt(req.params.id, 10);
    if (coachId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own coach account' });
    }
    const row = pool.query("SELECT id FROM users WHERE id = ? AND role = 'coach'", [coachId]).rows[0];
    if (!row) return res.status(404).json({ error: 'Coach not found' });
    pool.query('DELETE FROM users WHERE id = ?', [coachId]);
    res.json({ success: true });
  } catch (err) {
    console.error('admin/coaches delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get own profile (or a specific coach via ?coach_id=X)
router.get('/admin/me', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const profile = getCoachProfileRow(targetCoachId(req));
    if (!profile) return res.json({ profile: null });
    res.json({ profile: shapeCoach(profile) });
  } catch (err) {
    console.error('admin/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile (own or a specific coach via ?coach_id=X)
router.patch('/admin/me', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const coachId = targetCoachId(req);
    const {
      headline, tagline, accent_color, bio, origin_story, pull_quote,
      help_bullets, social_links, photo_url, specialties, years_experience,
      qualifications, is_public, pricing_tier_id,
    } = req.body;

    const specialtiesStr = Array.isArray(specialties)
      ? specialties.join(',')
      : (specialties ?? null);
    const helpBulletsJson = Array.isArray(help_bullets)
      ? JSON.stringify(help_bullets)
      : (help_bullets ?? null);
    const socialLinksJson = (social_links && typeof social_links === 'object')
      ? JSON.stringify(social_links)
      : (social_links ?? null);

    const existing = pool.query('SELECT id, pricing_tier_id FROM coach_profiles WHERE user_id = ?', [coachId]).rows[0];
    if (!existing) {
      pool.query(
        `INSERT INTO coach_profiles
          (user_id, headline, tagline, accent_color, bio, origin_story, pull_quote,
           help_bullets, social_links, photo_url, specialties, years_experience,
           qualifications, is_public, pricing_tier_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          coachId,
          headline || null,
          tagline || null,
          accent_color || '#FF8C00',
          bio || null,
          origin_story || null,
          pull_quote || null,
          helpBulletsJson,
          socialLinksJson,
          photo_url || null,
          specialtiesStr,
          years_experience || null,
          qualifications || null,
          is_public === false ? 0 : 1,
          pricing_tier_id || null,
        ],
      );
    } else {
      pool.query(
        `UPDATE coach_profiles
            SET headline = COALESCE(?, headline),
                tagline = COALESCE(?, tagline),
                accent_color = COALESCE(?, accent_color),
                bio = COALESCE(?, bio),
                origin_story = COALESCE(?, origin_story),
                pull_quote = COALESCE(?, pull_quote),
                help_bullets = COALESCE(?, help_bullets),
                social_links = COALESCE(?, social_links),
                photo_url = COALESCE(?, photo_url),
                specialties = COALESCE(?, specialties),
                years_experience = COALESCE(?, years_experience),
                qualifications = COALESCE(?, qualifications),
                is_public = COALESCE(?, is_public),
                pricing_tier_id = COALESCE(?, pricing_tier_id)
          WHERE user_id = ?`,
        [
          headline ?? null,
          tagline ?? null,
          accent_color ?? null,
          bio ?? null,
          origin_story ?? null,
          pull_quote ?? null,
          helpBulletsJson,
          socialLinksJson,
          photo_url ?? null,
          specialtiesStr,
          years_experience ?? null,
          qualifications ?? null,
          typeof is_public === 'boolean' ? (is_public ? 1 : 0) : null,
          pricing_tier_id ?? null,
          coachId,
        ],
      );
    }

    // Tiers are now classification-only (Standard / Premium / Elite).
    // Prices live on each session type, so changing the tier does NOT touch
    // session-type prices. Coaches set their own prices per event.

    res.json({ success: true });
  } catch (err) {
    console.error('admin/me patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ----- Coach pricing tiers (Standard / Premium / Elite) --------------------
// List all pricing tiers + how many coaches are on each.
router.get('/admin/pricing-tiers', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const tiers = pool.query(
      `SELECT cpt.*,
              (SELECT COUNT(*) FROM coach_profiles WHERE pricing_tier_id = cpt.id) AS coach_count
         FROM coach_pricing_tiers cpt
        ORDER BY cpt.sort_order, cpt.id`,
    ).rows;
    res.json({ tiers });
  } catch (err) {
    console.error('admin/pricing-tiers list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a pricing tier's name/description. Tiers are classification only —
// prices live on each session type and are not touched here.
router.patch('/admin/pricing-tiers/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const tierId = parseInt(req.params.id, 10);
    const { name, description } = req.body;

    const existing = pool.query('SELECT * FROM coach_pricing_tiers WHERE id = ?', [tierId]).rows[0];
    if (!existing) return res.status(404).json({ error: 'Tier not found' });

    pool.query(
      `UPDATE coach_pricing_tiers
          SET name = COALESCE(?, name),
              description = COALESCE(?, description)
        WHERE id = ?`,
      [name ?? null, description ?? null, tierId],
    );

    const updated = pool.query('SELECT * FROM coach_pricing_tiers WHERE id = ?', [tierId]).rows[0];
    res.json({ tier: updated });
  } catch (err) {
    console.error('admin/pricing-tiers patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Session types CRUD
router.get('/admin/session-types', authenticateToken, requireRole('coach'), (req, res) => {
  const rows = pool.query(
    'SELECT * FROM coach_session_types WHERE coach_user_id = ? ORDER BY sort_order, duration_minutes',
    [targetCoachId(req)],
  ).rows;
  res.json({ session_types: rows });
});

router.post('/admin/session-types', authenticateToken, requireRole('coach'), (req, res) => {
  const {
    title, description, duration_minutes, price_cents, currency,
    event_format, location, capacity, thumbnail_url, meeting_url,
  } = req.body;
  if (!title || !duration_minutes) return res.status(400).json({ error: 'title and duration_minutes required' });
  const result = pool.query(
    `INSERT INTO coach_session_types
      (coach_user_id, title, description, duration_minutes, price_cents, currency,
       is_active, event_format, location, capacity, thumbnail_url, meeting_url)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      targetCoachId(req), title, description || null, duration_minutes,
      price_cents || 0, currency || 'USD',
      event_format || 'one_on_one',
      location || null,
      Number.isFinite(capacity) ? capacity : null,
      thumbnail_url || null,
      meeting_url || null,
    ],
  );
  res.json({ id: result.rows[0].id });
});

router.patch('/admin/session-types/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const {
    title, description, duration_minutes, price_cents, currency, is_active,
    event_format, location, capacity, thumbnail_url, meeting_url,
  } = req.body;
  const row = pool.query('SELECT id FROM coach_session_types WHERE id = ? AND coach_user_id = ?', [req.params.id, targetCoachId(req)]).rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  pool.query(
    `UPDATE coach_session_types
        SET title = COALESCE(?, title),
            description = COALESCE(?, description),
            duration_minutes = COALESCE(?, duration_minutes),
            price_cents = COALESCE(?, price_cents),
            currency = COALESCE(?, currency),
            is_active = COALESCE(?, is_active),
            event_format = COALESCE(?, event_format),
            location = COALESCE(?, location),
            capacity = COALESCE(?, capacity),
            thumbnail_url = COALESCE(?, thumbnail_url),
            meeting_url = COALESCE(?, meeting_url)
      WHERE id = ?`,
    [
      title ?? null,
      description ?? null,
      duration_minutes ?? null,
      price_cents ?? null,
      currency ?? null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      event_format ?? null,
      location ?? null,
      Number.isFinite(capacity) ? capacity : null,
      thumbnail_url ?? null,
      meeting_url ?? null,
      req.params.id,
    ],
  );
  res.json({ success: true });
});

router.delete('/admin/session-types/:id', authenticateToken, requireRole('coach'), (req, res) => {
  pool.query('DELETE FROM coach_session_types WHERE id = ? AND coach_user_id = ?', [req.params.id, targetCoachId(req)]);
  res.json({ success: true });
});

// Availability CRUD
router.get('/admin/availability', authenticateToken, requireRole('coach'), (req, res) => {
  const rows = pool.query(
    'SELECT id, weekday, start_time, end_time FROM coach_availability WHERE coach_user_id = ? ORDER BY weekday, start_time',
    [targetCoachId(req)],
  ).rows;
  res.json({ availability: rows });
});

router.put('/admin/availability', authenticateToken, requireRole('coach'), (req, res) => {
  const { blocks } = req.body;
  if (!Array.isArray(blocks)) return res.status(400).json({ error: 'blocks must be an array' });
  const coachId = targetCoachId(req);
  pool.query('DELETE FROM coach_availability WHERE coach_user_id = ?', [coachId]);
  for (const b of blocks) {
    if (typeof b.weekday !== 'number' || !b.start_time || !b.end_time) continue;
    pool.query(
      'INSERT INTO coach_availability (coach_user_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
      [coachId, b.weekday, b.start_time, b.end_time],
    );
  }
  res.json({ success: true });
});

// Coach's inbox of bookings
router.get('/admin/bookings', authenticateToken, requireRole('coach'), (req, res) => {
  const rows = pool.query(
    `SELECT b.*, u.name AS client_name, u.email AS client_email, u.avatar_url AS client_avatar,
            st.title AS session_title
       FROM coach_bookings b
       JOIN users u ON u.id = b.client_user_id
       LEFT JOIN coach_session_types st ON st.id = b.session_type_id
      WHERE b.coach_user_id = ?
      ORDER BY b.scheduled_at DESC`,
    [targetCoachId(req)],
  ).rows;
  res.json({ bookings: rows });
});

router.patch('/admin/bookings/:id', authenticateToken, requireRole('coach'), (req, res) => {
  const { status, payment_status } = req.body;
  const row = pool.query('SELECT id FROM coach_bookings WHERE id = ? AND coach_user_id = ?', [req.params.id, targetCoachId(req)]).rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  pool.query(
    `UPDATE coach_bookings
        SET status = COALESCE(?, status),
            payment_status = COALESCE(?, payment_status)
      WHERE id = ?`,
    [status ?? null, payment_status ?? null, req.params.id],
  );
  res.json({ success: true });
});

// ==========================================================================
// SCHEDULED EVENTS (masterclasses, webinars, in-person, workshops)
// Must be registered BEFORE /:id so Express matches /events literally
// ==========================================================================

// List published events (client) -- upcoming only
router.get('/events', authenticateToken, (req, res) => {
  try {
    const events = pool.query(`
      SELECT ce.*,
        u.name as coach_name,
        cp.photo_url as coach_photo,
        (SELECT COUNT(*) FROM coach_event_registrations WHERE event_id = ce.id AND status = 'registered') as registration_count
      FROM coach_events ce
      JOIN users u ON ce.coach_user_id = u.id
      LEFT JOIN coach_profiles cp ON ce.coach_user_id = cp.user_id
      WHERE ce.status = 'published' AND ce.scheduled_at >= datetime('now')
      ORDER BY ce.scheduled_at ASC
    `).rows;

    const regRows = pool.query(
      `SELECT event_id FROM coach_event_registrations WHERE user_id = ? AND status = 'registered'`,
      [req.user.id]
    ).rows;
    const registeredIds = new Set(regRows.map(r => r.event_id));

    const enriched = events.map(e => ({
      ...e,
      is_registered: registeredIds.has(e.id),
      spots_left: e.capacity ? Math.max(0, e.capacity - (e.registration_count || 0)) : null,
    }));

    res.json({ events: enriched });
  } catch (err) {
    console.error('list events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// My registered events (client)
router.get('/events/mine', authenticateToken, (req, res) => {
  try {
    const events = pool.query(`
      SELECT ce.*, cer.status as reg_status, cer.registered_at,
        u.name as coach_name,
        cp.photo_url as coach_photo
      FROM coach_event_registrations cer
      JOIN coach_events ce ON cer.event_id = ce.id
      JOIN users u ON ce.coach_user_id = u.id
      LEFT JOIN coach_profiles cp ON ce.coach_user_id = cp.user_id
      WHERE cer.user_id = ? AND cer.status = 'registered'
      ORDER BY ce.scheduled_at ASC
    `, [req.user.id]).rows;
    res.json({ events });
  } catch (err) {
    console.error('my events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register for an event (client)
// Free events: instant registration.
// Paid events: returns { requires_payment: true } so the client can redirect
// to a payment flow. Once payment is confirmed, the client calls this endpoint
// again with { payment_confirmed: true } to finalise registration.
router.post('/events/:id/register', authenticateToken, (req, res) => {
  try {
    const event = pool.query('SELECT * FROM coach_events WHERE id = ?', [req.params.id]).rows[0];
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status !== 'published') return res.status(400).json({ error: 'Event is not available' });

    // Block paid events unless payment has been confirmed
    const { payment_confirmed } = req.body || {};
    if (event.price_cents > 0 && !payment_confirmed) {
      return res.status(402).json({
        requires_payment: true,
        price_cents: event.price_cents,
        currency: event.currency,
        title: event.title,
      });
    }

    if (event.capacity) {
      const count = pool.query(
        `SELECT COUNT(*) as c FROM coach_event_registrations WHERE event_id = ? AND status = 'registered'`,
        [req.params.id]
      ).rows[0].c;
      if (count >= event.capacity) return res.status(400).json({ error: 'Event is full' });
    }

    const existing = pool.query(
      'SELECT id, status FROM coach_event_registrations WHERE event_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    ).rows[0];

    if (existing && existing.status === 'registered') {
      return res.status(400).json({ error: 'Already registered' });
    }

    if (existing) {
      pool.query(
        `UPDATE coach_event_registrations SET status = 'registered', registered_at = datetime('now') WHERE id = ?`,
        [existing.id]
      );
    } else {
      pool.query(
        `INSERT INTO coach_event_registrations (event_id, user_id) VALUES (?, ?)`,
        [req.params.id, req.user.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('register event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel registration (client)
router.post('/events/:id/cancel', authenticateToken, (req, res) => {
  try {
    pool.query(
      `UPDATE coach_event_registrations SET status = 'cancelled' WHERE event_id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('cancel event reg error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================================================================
//  `/:id` GENERIC ROUTES -- registered last so literal paths match first
// =====================================================================

// Full coach profile + session types + next 14 days of open slots
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const coachId = parseInt(req.params.id, 10);
    const profile = getCoachProfileRow(coachId);
    if (!profile) return res.status(404).json({ error: 'Coach not found' });

    const sessionTypes = pool.query(
      `SELECT id, title, description, duration_minutes, price_cents, currency,
              event_format, location, capacity, thumbnail_url, meeting_url
         FROM coach_session_types
        WHERE coach_user_id = ? AND is_active = 1
        ORDER BY sort_order, duration_minutes`,
      [coachId],
    ).rows;

    const availability = pool.query(
      'SELECT weekday, start_time, end_time FROM coach_availability WHERE coach_user_id = ?',
      [coachId],
    ).rows;

    const now = new Date().toISOString();
    const upcoming = pool.query(
      `SELECT scheduled_at, duration_minutes FROM coach_bookings
        WHERE coach_user_id = ? AND scheduled_at > ? AND status != 'cancelled'`,
      [coachId, now],
    ).rows;

    // Upcoming group events run by this coach — webinars, masterclasses,
    // in-person sessions etc. These live in coach_events (a separate table
    // from session_types) and need to be surfaced on the coach's profile.
    const events = pool.query(
      `SELECT ce.*,
        (SELECT COUNT(*) FROM coach_event_registrations
          WHERE event_id = ce.id AND status = 'registered') as registration_count,
        (SELECT id FROM coach_event_registrations
          WHERE event_id = ce.id AND user_id = ? AND status = 'registered' LIMIT 1) as my_registration_id
       FROM coach_events ce
       WHERE ce.coach_user_id = ? AND ce.status = 'published' AND ce.scheduled_at >= datetime('now')
       ORDER BY ce.scheduled_at ASC`,
      [req.user.id, coachId],
    ).rows.map(e => ({
      ...e,
      is_registered: !!e.my_registration_id,
      spots_left: e.capacity ? Math.max(0, e.capacity - (e.registration_count || 0)) : null,
    }));

    res.json({
      coach: shapeCoach(profile),
      session_types: sessionTypes,
      availability,
      booked_slots: upcoming,
      events,
    });
  } catch (err) {
    console.error('coach detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Compute open slots for a given session type
router.get('/:id/slots', authenticateToken, (req, res) => {
  try {
    const coachId = parseInt(req.params.id, 10);
    const sessionTypeId = parseInt(req.query.session_type_id, 10);
    if (!sessionTypeId) return res.status(400).json({ error: 'session_type_id required' });

    const st = pool.query(
      'SELECT duration_minutes FROM coach_session_types WHERE id = ? AND coach_user_id = ?',
      [sessionTypeId, coachId],
    ).rows[0];
    if (!st) return res.status(404).json({ error: 'Session type not found' });

    const availability = pool.query(
      'SELECT weekday, start_time, end_time FROM coach_availability WHERE coach_user_id = ?',
      [coachId],
    ).rows;
    const now = new Date().toISOString();
    const bookings = pool.query(
      `SELECT scheduled_at FROM coach_bookings
        WHERE coach_user_id = ? AND scheduled_at > ? AND status != 'cancelled'`,
      [coachId, now],
    ).rows;

    const slots = generateSlots(availability, bookings, 14, st.duration_minutes);
    res.json({ slots });
  } catch (err) {
    console.error('slots error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a booking. Payment is stubbed — see STRIPE_HOOK below.
router.post('/:id/bookings', authenticateToken, (req, res) => {
  try {
    const coachId = parseInt(req.params.id, 10);
    const { session_type_id, scheduled_at, notes } = req.body;
    if (!session_type_id || !scheduled_at) {
      return res.status(400).json({ error: 'session_type_id and scheduled_at required' });
    }

    const st = pool.query(
      'SELECT * FROM coach_session_types WHERE id = ? AND coach_user_id = ?',
      [session_type_id, coachId],
    ).rows[0];
    if (!st) return res.status(404).json({ error: 'Session type not found' });

    // Collision check: any booking for this coach within the session window
    const collision = pool.query(
      `SELECT id FROM coach_bookings
        WHERE coach_user_id = ? AND scheduled_at = ? AND status != 'cancelled'`,
      [coachId, scheduled_at],
    ).rows[0];
    if (collision) return res.status(409).json({ error: 'That slot was just booked, please pick another' });

    // ---- STRIPE_HOOK ------------------------------------------------------
    // TODO: replace this stub with a Stripe Connect PaymentIntent creation.
    // The controller expects: { payment_status: 'paid'|'unpaid', payment_ref,
    // checkout_url? }. Free sessions (price_cents === 0) skip Stripe entirely.
    const isFree = st.price_cents === 0;
    const paymentResult = isFree
      ? { payment_status: 'free', payment_ref: null, checkout_url: null }
      : {
          payment_status: 'stub',
          payment_ref: `stub_${Date.now()}`,
          // When Stripe is wired up, return a hosted Checkout URL or use
          // Stripe Elements client-side with a PaymentIntent clientSecret.
          checkout_url: null,
        };
    // ---- /STRIPE_HOOK ----------------------------------------------------

    const insert = pool.query(
      `INSERT INTO coach_bookings
        (client_user_id, coach_user_id, session_type_id, scheduled_at,
         duration_minutes, price_cents, currency, status, payment_status, payment_ref, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        req.user.id,
        coachId,
        session_type_id,
        scheduled_at,
        st.duration_minutes,
        st.price_cents,
        st.currency,
        isFree ? 'confirmed' : 'pending',
        paymentResult.payment_status,
        paymentResult.payment_ref,
        notes || null,
      ],
    );

    res.json({
      booking_id: insert.rows[0].id,
      status: isFree ? 'confirmed' : 'pending',
      payment_status: paymentResult.payment_status,
      checkout_url: paymentResult.checkout_url,
    });
  } catch (err) {
    console.error('booking create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================================================
// ---------- COACH ADMIN: Scheduled Events ----------

// List all events (coach)
router.get('/admin/events', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const events = pool.query(`
      SELECT ce.*,
        (SELECT COUNT(*) FROM coach_event_registrations WHERE event_id = ce.id AND status = 'registered') as registration_count
      FROM coach_events ce
      WHERE ce.coach_user_id = ?
      ORDER BY ce.scheduled_at DESC
    `, [req.user.id]).rows;
    res.json({ events });
  } catch (err) {
    console.error('admin list events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create event (coach)
router.post('/admin/events', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, event_format, scheduled_at, end_at, duration_minutes,
      location, meeting_url, capacity, price_cents, currency, thumbnail_url, status } = req.body;
    if (!title || !scheduled_at) return res.status(400).json({ error: 'Title and date/time required' });

    const result = pool.query(
      `INSERT INTO coach_events
        (coach_user_id, title, description, event_format, scheduled_at, end_at, duration_minutes,
         location, meeting_url, capacity, price_cents, currency, thumbnail_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [req.user.id, title, description || '', event_format || 'masterclass', scheduled_at,
       end_at || null, duration_minutes || 60, location || null, meeting_url || null,
       capacity || null, price_cents || 0, currency || 'USD', thumbnail_url || null,
       status || 'published']
    );
    res.json({ event: result.rows[0] });
  } catch (err) {
    console.error('create event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update event (coach)
router.put('/admin/events/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, description, event_format, scheduled_at, end_at, duration_minutes,
      location, meeting_url, capacity, price_cents, currency, thumbnail_url, status } = req.body;
    pool.query(
      `UPDATE coach_events SET title=?, description=?, event_format=?, scheduled_at=?, end_at=?,
       duration_minutes=?, location=?, meeting_url=?, capacity=?, price_cents=?, currency=?,
       thumbnail_url=?, status=? WHERE id=? AND coach_user_id=?`,
      [title, description, event_format, scheduled_at, end_at, duration_minutes,
       location, meeting_url, capacity, price_cents || 0, currency || 'USD',
       thumbnail_url, status, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('update event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete event (coach)
router.delete('/admin/events/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM coach_events WHERE id = ? AND coach_user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('delete event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Event registrations list (coach)
router.get('/admin/events/:id/registrations', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const regs = pool.query(`
      SELECT cer.*, u.name as user_name, u.email as user_email
      FROM coach_event_registrations cer
      JOIN users u ON cer.user_id = u.id
      WHERE cer.event_id = ?
      ORDER BY cer.registered_at DESC
    `, [req.params.id]).rows;
    res.json({ registrations: regs });
  } catch (err) {
    console.error('event regs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
