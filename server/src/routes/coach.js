import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, requireCoachOwnsClient, requireCoachOwnsClientBody, parseUserAgent } from '../middleware/auth.js';

const router = Router();

// Get all clients for this coach
router.get('/clients', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    // Filter archived clients unless ?status=archived or ?status=all is passed.
    // Default: hide archived so the main client list isn't cluttered with ended relationships.
    const statusFilter = req.query.status || 'active_paused';
    let statusSql = "AND COALESCE(cp.status, 'active') != 'archived'";
    if (statusFilter === 'archived') statusSql = "AND cp.status = 'archived'";
    else if (statusFilter === 'all') statusSql = '';

    const clients = pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
        cp.age, cp.gender, cp.location, cp.tier_id,
        COALESCE(cp.status, 'active') as status,
        cp.status_changed_at, cp.status_note,
        t.name as tier_name, t.level as tier_level, t.price_label as tier_price_label,
        oa.goal, oa.experience, oa.injuries, oa.schedule,
        oa.equipment, oa.dietary, oa.sleep, oa.anything_else,
        (SELECT date FROM checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as last_checkin,
        (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak,
        (SELECT COUNT(*) FROM workout_logs WHERE user_id = u.id AND completed = 1) as workouts_completed
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      LEFT JOIN tiers t ON t.id = cp.tier_id
      LEFT JOIN onboarding_answers oa ON oa.user_id = u.id
      WHERE u.role = 'client' ${statusSql}
      ORDER BY u.name
    `);
    // Parse equipment JSON for easy consumption client-side
    const rows = clients.rows.map((c) => {
      let equipment = null;
      if (c.equipment) {
        try { equipment = JSON.parse(c.equipment); } catch { equipment = c.equipment; }
      }
      return { ...c, equipment };
    });
    res.json({ clients: rows });
  } catch (err) {
    console.error('Clients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get check-ins for all clients
router.get('/checkins', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const clients = pool.query(`
      SELECT u.id, u.name, u.avatar_url,
        (SELECT date FROM checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as last_checkin
      FROM users u
      WHERE u.role = 'client'
      ORDER BY last_checkin DESC
    `);
    res.json({ clients: clients.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get check-in timeline for a specific client
router.get('/checkins/:clientId', authenticateToken, requireRole('coach'), requireCoachOwnsClient('clientId'), async (req, res) => {
  try {
    const client = pool.query('SELECT id, name, email, avatar_url FROM users WHERE id = ?', [req.params.clientId]);
    if (client.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const checkins = pool.query('SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC', [req.params.clientId]);

    // Get client notes (from goals as proxy)
    const goals = pool.query('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC', [req.params.clientId]);

    // Get streak
    const streak = pool.query('SELECT * FROM streaks WHERE user_id = ?', [req.params.clientId]);

    // Get profile
    const profile = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [req.params.clientId]);

    res.json({
      client: client.rows[0],
      checkins: checkins.rows,
      goals: goals.rows,
      streak: streak.rows[0] || { current_streak: 0, best_streak: 0 },
      profile: profile.rows[0] || {},
    });
  } catch (err) {
    console.error('Client checkins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client-side: return the authenticated user's own check-ins. Powers the
// photo gallery + Compare flow on Progress.
router.get('/checkins/me/list', authenticateToken, async (req, res) => {
  try {
    const rows = pool.query(
      `SELECT id, date, weight, body_fat, recovery_score, sleep_hours, stress_level, waist,
        photo_front_url, photo_side_url, photo_back_url, notes
       FROM checkins WHERE user_id = ?
       ORDER BY date DESC`,
      [req.user.id],
    ).rows;
    res.json({ checkins: rows });
  } catch (err) {
    console.error('My checkins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit a check-in (client side)
// Accepts: measurements + photo URLs (already uploaded via /api/upload) +
// free-text answers. coach_id is the client's assigned coach (users.coach_id)
// or NULL; with shared team inbox all coaches see the check-in regardless.
router.post('/checkins', authenticateToken, async (req, res) => {
  try {
    const {
      weight, body_fat, recovery_score, sleep_hours, stress_level, waist,
      photo_front_url, photo_side_url, photo_back_url,
      answers,
    } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const assigned = pool.query('SELECT coach_id FROM users WHERE id = ?', [req.user.id]).rows[0];
    const coachId = assigned?.coach_id || null;

    const checkin = pool.query(
      `INSERT INTO checkins (
         user_id, coach_id, date,
         weight, body_fat, recovery_score, sleep_hours, stress_level, waist,
         photo_front_url, photo_side_url, photo_back_url,
         answers
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        req.user.id, coachId, today,
        weight, body_fat, recovery_score, sleep_hours, stress_level, waist,
        photo_front_url || null, photo_side_url || null, photo_back_url || null,
        JSON.stringify(answers || {}),
      ],
    );

    // Feel-snippet (first answer) goes into activity log so the Priority
    // Inbox can show it without re-querying the full payload.
    const feelSnippet = (answers && answers[0]) ? String(answers[0]).slice(0, 120) : '';
    pool.query('INSERT INTO activity_log (user_id, action_type, description) VALUES (?, ?, ?)',
      [req.user.id, 'checkin_submitted',
       `Check-in${weight ? ` · ${weight}kg` : ''}${feelSnippet ? ` · "${feelSnippet}"` : ''}`]);

    res.json({ success: true, id: checkin.rows[0].id });
  } catch (err) {
    console.error('Submit checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get activity feed (coach)
router.get('/activity', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const activities = pool.query(`
      SELECT al.*, u.name as user_name, u.avatar_url
      FROM activity_log al
      JOIN users u ON al.user_id = u.id
      WHERE u.role = 'client'
      ORDER BY al.created_at DESC
      LIMIT 50
    `);
    res.json({ activities: activities.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add client (coach invites)
router.post('/clients/invite', authenticateToken, requireRole('coach'), async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Email and name required' });

    const existing = pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    // Create client with temporary password
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('welcome123', 10);
    const user = pool.query(
      "INSERT INTO users (email, password_hash, name, role, coach_id) VALUES (?, ?, ?, 'client', ?) RETURNING id, email, name, role",
      [email, hash, name, req.user.id]
    );
    pool.query('INSERT INTO client_profiles (user_id) VALUES (?)', [user.rows[0].id]);
    pool.query('INSERT INTO streaks (user_id, current_streak, best_streak) VALUES (?, 0, 0)', [user.rows[0].id]);

    res.json({ client: user.rows[0] });
  } catch (err) {
    console.error('Invite client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== SCHEDULE MANAGEMENT =====

// GET /api/coach/schedules
// List all client enrollments with program info and progress
router.get('/schedules', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const enrollments = pool.query(`
      SELECT cp.id, cp.user_id, cp.program_id, cp.current_week, cp.current_day,
        cp.started_at, cp.completed_workouts, cp.total_workouts,
        u.name AS client_name, u.email AS client_email, u.avatar_url,
        p.title AS program_title, p.duration_weeks, p.workouts_per_week
      FROM client_programs cp
      JOIN users u ON cp.user_id = u.id
      JOIN programs p ON cp.program_id = p.id
      ORDER BY cp.started_at DESC
    `);
    res.json({ enrollments: enrollments.rows });
  } catch (err) {
    console.error('Coach schedules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/coach/schedules
// Assign a program to a client. Body: { user_id, program_id, started_at? }
router.post('/schedules', authenticateToken, requireRole('coach'), requireCoachOwnsClientBody('user_id'), (req, res) => {
  try {
    const { user_id, program_id, started_at } = req.body;
    if (!user_id || !program_id) {
      return res.status(400).json({ error: 'user_id and program_id required' });
    }

    // Check client exists
    const client = pool.query("SELECT id FROM users WHERE id = ? AND role = 'client'", [user_id]);
    if (!client.rows.length) return res.status(404).json({ error: 'Client not found' });

    // Check program exists
    const program = pool.query('SELECT id FROM programs WHERE id = ?', [program_id]);
    if (!program.rows.length) return res.status(404).json({ error: 'Program not found' });

    // Check if already enrolled in this program
    const existing = pool.query(
      'SELECT id FROM client_programs WHERE user_id = ? AND program_id = ?',
      [user_id, program_id]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Client is already enrolled in this program' });
    }

    // Count total workouts in program
    const total = pool.query(
      'SELECT COUNT(*) as c FROM workouts WHERE program_id = ?', [program_id]
    ).rows[0].c;

    const startDate = started_at || new Date().toISOString();
    const result = pool.query(
      `INSERT INTO client_programs (user_id, program_id, current_week, current_day, started_at, completed_workouts, total_workouts)
       VALUES (?, ?, 1, 1, ?, 0, ?) RETURNING id`,
      [user_id, program_id, startDate, total]
    );

    res.json({ id: result.rows[0].id, success: true });
  } catch (err) {
    console.error('Coach assign program error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/coach/schedules/user-workout
// Create an ad-hoc user_scheduled_workouts row for a client on a given date.
// Used by the Schedule tab drag-and-drop when dropping a workout from the
// library panel into a day column, so coaches can slot one-off workouts that
// aren't part of a program.
router.post('/schedules/user-workout', authenticateToken, requireRole('coach'), requireCoachOwnsClientBody('user_id'), (req, res) => {
  try {
    const { user_id, workout_id, scheduled_date } = req.body;
    if (!user_id || !workout_id || !scheduled_date) {
      return res.status(400).json({ error: 'user_id, workout_id and scheduled_date required' });
    }
    const client = pool.query("SELECT id FROM users WHERE id = ? AND role = 'client'", [user_id]);
    if (!client.rows.length) return res.status(404).json({ error: 'Client not found' });
    const workout = pool.query('SELECT id FROM workouts WHERE id = ?', [workout_id]);
    if (!workout.rows.length) return res.status(404).json({ error: 'Workout not found' });
    // Place at the end of that day's list (sort_order = existing count)
    const count = pool.query(
      'SELECT COUNT(*) as c FROM user_scheduled_workouts WHERE user_id = ? AND scheduled_date = ?',
      [user_id, scheduled_date]
    ).rows[0].c;
    const result = pool.query(
      `INSERT INTO user_scheduled_workouts (user_id, workout_id, scheduled_date, sort_order)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [user_id, workout_id, scheduled_date, count]
    );
    res.json({ id: result.rows[0].id, success: true });
  } catch (err) {
    console.error('Coach add user-workout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/coach/schedules/user-workout/:id
// Move an ad-hoc user_scheduled_workouts row to a new date. Used by the
// Schedule tab drag-and-drop when shifting a single one-off workout.
router.patch('/schedules/user-workout/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { scheduled_date } = req.body;
    if (!scheduled_date) return res.status(400).json({ error: 'scheduled_date required' });
    const row = pool.query('SELECT id FROM user_scheduled_workouts WHERE id = ?', [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    pool.query('UPDATE user_scheduled_workouts SET scheduled_date = ? WHERE id = ?', [scheduled_date, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Coach move user-workout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/coach/schedules/:id/shift
// Shift a client's program enrollment forward or backward by N days by
// adjusting started_at. Used when the coach drags a program-driven workout
// to a new day in the Schedule tab — we interpret that as "nudge the whole
// program by the delta" rather than overriding a single day.
router.patch('/schedules/:id/shift', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { days } = req.body;
    if (typeof days !== 'number') return res.status(400).json({ error: 'days (number) required' });
    const row = pool.query('SELECT started_at FROM client_programs WHERE id = ?', [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: 'Enrollment not found' });
    const current = new Date(row.started_at);
    current.setDate(current.getDate() + days);
    pool.query('UPDATE client_programs SET started_at = ? WHERE id = ?', [current.toISOString(), req.params.id]);
    res.json({ success: true, started_at: current.toISOString() });
  } catch (err) {
    console.error('Coach shift enrollment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/coach/schedules/:id
// Remove a client enrollment
router.delete('/schedules/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const row = pool.query('SELECT id FROM client_programs WHERE id = ?', [req.params.id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
    pool.query('DELETE FROM client_programs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Coach remove enrollment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/coach/schedules/:clientId/week?start=YYYY-MM-DD
// View a client's weekly schedule (same logic as the client schedule route but for any client)
router.get('/schedules/:clientId/week', authenticateToken, requireRole('coach'), requireCoachOwnsClient('clientId'), (req, res) => {
  try {
    const { start } = req.query;
    if (!start) return res.status(400).json({ error: 'start query param required (YYYY-MM-DD)' });

    const dates = [];
    const base = new Date(start + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const placeholders = dates.map(() => '?').join(',');
    const result = {};
    dates.forEach(d => { result[d] = []; });

    // Program-driven workouts for each date
    dates.forEach(d => {
      const rows = pool.query(`
        SELECT w.id, w.title, w.duration_mins, w.body_parts, w.workout_type,
          w.week_number, w.day_number, w.image_url, p.title AS program_title,
          cp.id AS enrollment_id, cp.started_at,
          'program' AS source
        FROM client_programs cp
        JOIN programs p ON cp.program_id = p.id
        JOIN workouts w ON w.program_id = cp.program_id
        WHERE cp.user_id = ?
          AND DATE(cp.started_at, '+' || ((w.week_number - 1) * 7 + (w.day_number - 1)) || ' days') = ?
        ORDER BY w.day_number
      `, [req.params.clientId, d]).rows;
      result[d].push(...rows);
    });

    // User-scheduled workouts
    const userRows = pool.query(`
      SELECT usw.id AS schedule_id, usw.scheduled_date, usw.completed,
        w.id AS workout_id, w.title, w.duration_mins, w.body_parts, w.workout_type,
        w.image_url, 'user' AS source
      FROM user_scheduled_workouts usw
      JOIN workouts w ON usw.workout_id = w.id
      WHERE usw.user_id = ? AND usw.scheduled_date IN (${placeholders})
      ORDER BY usw.sort_order, usw.id
    `, [req.params.clientId, ...dates]).rows;

    userRows.forEach(r => {
      if (result[r.scheduled_date]) result[r.scheduled_date].push(r);
    });

    res.json({ week: result });
  } catch (err) {
    console.error('Coach client week error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Coach Home dashboard — aggregate KPIs, priority inbox, upcoming events
// ─────────────────────────────────────────────────────────────────────
router.get('/home', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    // KPI tiles
    const totals = pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'client') as total_clients,
        (SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= ?) as new_clients_7d,
        (SELECT COUNT(*) FROM checkins WHERE date >= ?) as checkins_7d,
        (SELECT COUNT(*) FROM workout_logs WHERE completed = 1 AND date >= ?) as workouts_completed_7d,
        (SELECT COUNT(*) FROM messages WHERE created_at >= ?) as messages_7d,
        (SELECT COUNT(*) FROM coach_bookings WHERE scheduled_at >= ? AND scheduled_at < ?) as sessions_today
    `, [sevenDaysAgo, sevenDaysAgo, sevenDaysAgo, sevenDaysAgo, today, today + 'T23:59:59']).rows[0];

    // Tier distribution — fuels the active-clients donut
    const tierDist = pool.query(`
      SELECT COALESCE(t.name, 'Free') as tier, COUNT(*) as count
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      LEFT JOIN tiers t ON t.id = cp.tier_id
      WHERE u.role = 'client'
      GROUP BY t.name
      ORDER BY MIN(COALESCE(t.level, 0))
    `).rows;

    // At-risk clients: no check-in in 14+ days OR no workout log in 14+ days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const atRisk = pool.query(`
      SELECT u.id, u.name, u.avatar_url,
        COALESCE(cp.profile_image_url, u.avatar_url) as photo_url,
        (SELECT MAX(date) FROM checkins WHERE user_id = u.id) as last_checkin,
        (SELECT MAX(date) FROM workout_logs WHERE user_id = u.id AND completed = 1) as last_workout
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE u.role = 'client'
        AND (
          (SELECT MAX(date) FROM checkins WHERE user_id = u.id) IS NULL
          OR (SELECT MAX(date) FROM checkins WHERE user_id = u.id) < ?
        )
      ORDER BY COALESCE((SELECT MAX(date) FROM checkins WHERE user_id = u.id), '0001-01-01') ASC
      LIMIT 8
    `, [fourteenDaysAgo]).rows;

    // Priority inbox: most recent check-ins across all clients. Includes
    // answers blob so the UI can pull the "how do you feel" snippet and
    // the front photo thumbnail.
    const recentCheckins = pool.query(`
      SELECT c.id, c.user_id, c.date, c.weight, c.body_fat, c.recovery_score, c.sleep_hours,
             c.photo_front_url, c.answers,
             u.name, u.avatar_url,
             COALESCE(cp.profile_image_url, u.avatar_url) as photo_url
      FROM checkins c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      ORDER BY c.date DESC, c.id DESC
      LIMIT 6
    `).rows.map(r => {
      let feel = '';
      try {
        const parsed = r.answers ? JSON.parse(r.answers) : null;
        if (parsed && parsed[0]) feel = String(parsed[0]).slice(0, 140);
      } catch { /* leave blank */ }
      return { ...r, feel };
    });

    // Upcoming — merge 1:1 bookings + scheduled events into one chronological
    // timeline so the admin can see everything each coach has coming up.
    // Optional ?coach_id=X query narrows to one coach. Each row carries
    // coach_user_id + coach_name so the UI can render filter chips.
    const coachFilter = req.query.coach_id ? parseInt(req.query.coach_id) : null;
    const bookings = pool.query(`
      SELECT b.id, b.scheduled_at as start_at, b.status, b.coach_user_id,
             COALESCE(st.event_format, 'one_on_one') as event_format,
             COALESCE(st.title, '1:1 Session') as session_name,
             u.name as client_name, u.avatar_url,
             cu.name as coach_name
      FROM coach_bookings b
      LEFT JOIN coach_session_types st ON st.id = b.session_type_id
      LEFT JOIN users u ON u.id = b.client_user_id
      LEFT JOIN users cu ON cu.id = b.coach_user_id
      WHERE b.scheduled_at >= ?
        AND b.status NOT IN ('cancelled','no_show')
        ${coachFilter ? 'AND b.coach_user_id = ?' : ''}
      ORDER BY b.scheduled_at ASC
    `, coachFilter ? [today, coachFilter] : [today]).rows.map(r => ({
      ...r, kind: 'booking',
    }));

    const events = pool.query(`
      SELECT e.id, e.scheduled_at as start_at, e.status, e.coach_user_id,
             e.event_format, e.title as session_name, e.capacity,
             (SELECT COUNT(*) FROM coach_event_registrations r
              WHERE r.event_id = e.id AND r.status != 'cancelled') as registration_count,
             cu.name as coach_name
      FROM coach_events e
      LEFT JOIN users cu ON cu.id = e.coach_user_id
      WHERE e.scheduled_at >= ?
        AND e.status IN ('published','draft')
        ${coachFilter ? 'AND e.coach_user_id = ?' : ''}
      ORDER BY e.scheduled_at ASC
    `, coachFilter ? [today, coachFilter] : [today]).rows.map(r => ({
      ...r, kind: 'event', client_name: null,
    }));

    const upcoming = [...bookings, ...events]
      .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
      .slice(0, 10);

    // Distinct coaches for the filter chips (no LIMIT above — we've capped after merge)
    const coaches = pool.query(
      "SELECT id, name FROM users WHERE role = 'coach' ORDER BY name"
    ).rows;

    // 30-day activity sparkline: check-ins per day
    const checkinTrend = pool.query(`
      SELECT date, COUNT(*) as c FROM checkins
      WHERE date >= ?
      GROUP BY date
      ORDER BY date ASC
    `, [thirtyDaysAgo]).rows;

    res.json({
      kpis: {
        total_clients: totals.total_clients || 0,
        new_clients_7d: totals.new_clients_7d || 0,
        checkins_7d: totals.checkins_7d || 0,
        workouts_completed_7d: totals.workouts_completed_7d || 0,
        messages_7d: totals.messages_7d || 0,
        sessions_today: totals.sessions_today || 0,
        at_risk_count: atRisk.length,
      },
      tier_distribution: tierDist,
      at_risk: atRisk,
      recent_checkins: recentCheckins,
      upcoming_events: upcoming,
      coaches,
      active_coach_id: coachFilter,
      checkin_trend: checkinTrend,
    });
  } catch (err) {
    console.error('Coach home error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Enriched client list — adds engagement/status signals used by the new
// FitBudd-style Clients table (last check-in, last workout, streak,
// engagement %, at-risk flag). Coach-side only.
// ─────────────────────────────────────────────────────────────────────
router.get('/clients-enriched', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const rows = pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at, u.last_active_at,
        cp.age, cp.gender, cp.location, cp.tier_id, cp.tier_requested_id,
        COALESCE(cp.profile_image_url, u.avatar_url) as photo_url,
        COALESCE(cp.status, 'active') as status,
        cp.status_changed_at, cp.status_note,
        t.name as tier_name, t.level as tier_level,
        tr.name as tier_requested_name, tr.level as tier_requested_level,
        oa.goal,
        (SELECT date FROM checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as last_checkin,
        (SELECT date FROM workout_logs WHERE user_id = u.id AND completed = 1 ORDER BY date DESC LIMIT 1) as last_workout,
        (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak,
        (SELECT COUNT(*) FROM workout_logs WHERE user_id = u.id AND completed = 1 AND date >= ?) as workouts_30d,
        (SELECT COUNT(*) FROM checkins WHERE user_id = u.id AND date >= ?) as checkins_30d
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      LEFT JOIN tiers t ON t.id = cp.tier_id
      LEFT JOIN tiers tr ON tr.id = cp.tier_requested_id
      LEFT JOIN onboarding_answers oa ON oa.user_id = u.id
      WHERE u.role = 'client'
      ORDER BY u.name
    `, [thirtyDaysAgo, thirtyDaysAgo]).rows;

    // Engagement % heuristic: workouts_30d out of ~12 expected (3/week)
    const enriched = rows.map((c) => {
      const expected = 12;
      const engagement = Math.min(100, Math.round(((c.workouts_30d || 0) / expected) * 100));
      const atRisk = !c.last_checkin || c.last_checkin < fourteenDaysAgo;
      return { ...c, engagement, at_risk: atRisk };
    });

    res.json({ clients: enriched });
  } catch (err) {
    console.error('Clients enriched error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Full client profile aggregation — everything the ClientProfile tabs need
// ─────────────────────────────────────────────────────────────────────
router.get('/clients/:id/profile', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const id = req.params.id;
    const client = pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at, u.last_active_at,
        cp.age, cp.gender, cp.location, cp.tier_id, cp.tier_requested_id,
        cp.calorie_target, cp.protein_target, cp.fat_target, cp.carbs_target, cp.water_target,
        cp.plan_title, cp.plan_cycle, cp.plan_started_at, cp.plan_next_renewal_at,
        cp.profile_image_url,
        COALESCE(cp.profile_image_url, u.avatar_url) as photo_url,
        COALESCE(cp.status, 'active') as status,
        cp.status_changed_at, cp.status_note,
        t.name as tier_name, t.level as tier_level,
        tr.name as tier_requested_name, tr.level as tier_requested_level,
        oa.goal, oa.experience, oa.injuries, oa.schedule, oa.equipment, oa.dietary, oa.sleep, oa.anything_else
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      LEFT JOIN tiers t ON t.id = cp.tier_id
      LEFT JOIN tiers tr ON tr.id = cp.tier_requested_id
      LEFT JOIN onboarding_answers oa ON oa.user_id = u.id
      WHERE u.id = ? AND u.role = 'client'
    `, [id]).rows[0];

    if (!client) return res.status(404).json({ error: 'Client not found' });

    const tags = pool.query(
      'SELECT id, label FROM client_tags WHERE client_id = ? ORDER BY label',
      [id],
    ).rows;

    // Parse equipment JSON if present
    if (client.equipment) {
      try { client.equipment = JSON.parse(client.equipment); } catch { /* keep raw */ }
    }

    const checkins = pool.query(
      'SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 60',
      [id],
    ).rows;

    const goals = pool.query(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY achieved ASC, created_at DESC',
      [id],
    ).rows;

    const streak = pool.query('SELECT * FROM streaks WHERE user_id = ?', [id]).rows[0]
      || { current_streak: 0, best_streak: 0 };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const workoutLogs = pool.query(
      'SELECT * FROM workout_logs WHERE user_id = ? AND date >= ? ORDER BY date DESC',
      [id, thirtyDaysAgo],
    ).rows;

    const nutritionTotals = pool.query(`
      SELECT date,
        COALESCE(SUM(calories),0) as calories,
        COALESCE(SUM(protein),0) as protein,
        COALESCE(SUM(fat),0) as fat,
        COALESCE(SUM(carbs),0) as carbs
      FROM nutrition_logs WHERE user_id = ? AND date >= ?
      GROUP BY date ORDER BY date DESC
    `, [id, thirtyDaysAgo]).rows;

    const waterTotals = pool.query(`
      SELECT date, COALESCE(SUM(amount_ml),0) as ml
      FROM water_logs WHERE user_id = ? AND date >= ?
      GROUP BY date ORDER BY date DESC
    `, [id, thirtyDaysAgo]).rows;

    const stepTotals = pool.query(`
      SELECT date, COALESCE(SUM(steps),0) as steps
      FROM step_logs WHERE user_id = ? AND date >= ?
      GROUP BY date ORDER BY date DESC
    `, [id, thirtyDaysAgo]).rows;

    const activeProgram = pool.query(`
      SELECT cp.*, p.title as program_title, p.image_url
      FROM client_programs cp
      JOIN programs p ON cp.program_id = p.id
      WHERE cp.user_id = ?
      ORDER BY cp.started_at DESC LIMIT 1
    `, [id]).rows[0] || null;

    const notes = pool.query(
      `SELECT n.*, u.name as coach_name FROM coach_notes n
       LEFT JOIN users u ON u.id = n.coach_id
       WHERE n.client_id = ? ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [id],
    ).rows;

    // Measurement trends — compare latest vs earliest check-in so the
    // Overview can render "↓9.9kg in 21 months" style deltas.
    const trends = {};
    ['weight', 'body_fat', 'waist', 'sleep_hours', 'stress_level', 'recovery_score'].forEach(k => {
      const withVal = checkins.filter(c => c[k] != null).sort((a, b) => a.date.localeCompare(b.date));
      if (withVal.length >= 2) {
        const first = withVal[0], latest = withVal[withVal.length - 1];
        const monthsSpan = Math.max(1, Math.round(
          (new Date(latest.date) - new Date(first.date)) / (30 * 86400000)
        ));
        trends[k] = {
          latest: latest[k], earliest: first[k],
          delta: latest[k] - first[k],
          months: monthsSpan,
        };
      } else if (withVal.length === 1) {
        trends[k] = { latest: withVal[0][k], earliest: withVal[0][k], delta: 0, months: 0 };
      }
    });

    // Last 10 login events, parsed for friendly display
    const recentLogins = pool.query(
      'SELECT id, ip, user_agent, created_at FROM login_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [id],
    ).rows.map(r => ({ ...r, ...parseUserAgent(r.user_agent) }));

    // Team inbox conversation id — lets the Check-ins tab reply directly
    // into the shared coach/client thread without needing another lookup.
    const teamConvo = pool.query(
      "SELECT id FROM conversations WHERE client_id = ? LIMIT 1",
      [id],
    ).rows[0];

    // Client's daily tasks — these are client-editable items they tick off
    // each day. Coach sees today's list + today's completion state + a
    // simple 7-day completion rate per task.
    const today = new Date().toISOString().split('T')[0];
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const taskRows = pool.query('SELECT * FROM tasks WHERE client_id = ? ORDER BY id', [id]).rows;
    const completedToday = new Set(
      pool.query('SELECT task_id FROM task_completions WHERE user_id = ? AND date = ?', [id, today])
        .rows.map(r => r.task_id),
    );
    const tasks = taskRows.map(t => {
      const weekHits = pool.query(
        'SELECT COUNT(*) as c FROM task_completions WHERE task_id = ? AND user_id = ? AND date >= ?',
        [t.id, id, sevenAgo],
      ).rows[0].c;
      return {
        id: t.id,
        label: t.label,
        recurring: !!t.recurring,
        completed_today: completedToday.has(t.id),
        week_completion_rate: Math.round((weekHits / 7) * 100),
        // assigned_by_coach = this task was created by a coach (not the client themselves)
        assigned_by_coach: !!t.coach_id && t.coach_id !== t.client_id,
        coach_id: t.coach_id,
      };
    });

    res.json({
      client,
      tags,
      checkins,
      goals,
      streak,
      workoutLogs,
      nutritionTotals,
      waterTotals,
      stepTotals,
      activeProgram,
      notes,
      trends,
      recentLogins,
      tasks,
      team_conversation_id: teamConvo?.id || null,
    });
  } catch (err) {
    console.error('Client profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Coach notes CRUD
// ─────────────────────────────────────────────────────────────────────
router.post('/clients/:id/notes', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const { title, content, is_private, is_pinned } = req.body;
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Title and content required' });
    const result = pool.query(
      `INSERT INTO coach_notes (client_id, coach_id, title, content, is_private, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.params.id, req.user.id, title.trim(), content.trim(), is_private ? 1 : 0, is_pinned ? 1 : 0],
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/notes/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { title, content, is_private, is_pinned } = req.body;
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (is_private !== undefined) { fields.push('is_private = ?'); values.push(is_private ? 1 : 0); }
    if (is_pinned !== undefined) { fields.push('is_pinned = ?'); values.push(is_pinned ? 1 : 0); }
    if (!fields.length) return res.json({ ok: true });
    fields.push(`updated_at = datetime('now')`);
    values.push(req.params.id);
    pool.query(`UPDATE coach_notes SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/notes/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM coach_notes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Client tags — freeform labels on a client (Boston, Performer, AMS…)
// ─────────────────────────────────────────────────────────────────────
router.post('/clients/:id/tags', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label required' });
    const clean = label.trim().slice(0, 40);
    pool.query(
      'INSERT OR IGNORE INTO client_tags (client_id, label, created_by) VALUES (?, ?, ?)',
      [req.params.id, clean, req.user.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Add tag error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/clients/:clientId/tags/:tagId', authenticateToken, requireRole('coach'), requireCoachOwnsClient('clientId'), (req, res) => {
  try {
    pool.query('DELETE FROM client_tags WHERE id = ? AND client_id = ?', [req.params.tagId, req.params.clientId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete tag error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Client calendar — scheduled workouts + bookings for a given month.
// Used by ClientProfile Calendar tab. Month is YYYY-MM.
// ─────────────────────────────────────────────────────────────────────
router.get('/clients/:id/calendar', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const endDate = new Date(Date.UTC(y, m, 0)); // last day of month
    const end = endDate.toISOString().slice(0, 10);

    const workouts = pool.query(`
      SELECT usw.id, usw.scheduled_date, usw.completed, w.title, w.id as workout_id
      FROM user_scheduled_workouts usw
      LEFT JOIN workouts w ON w.id = usw.workout_id
      WHERE usw.user_id = ? AND usw.scheduled_date >= ? AND usw.scheduled_date <= ?
      ORDER BY usw.scheduled_date, usw.sort_order
    `, [req.params.id, start, end]).rows;

    const bookings = pool.query(`
      SELECT b.id, b.scheduled_at, b.duration_minutes, b.status, b.payment_status,
             st.title as session_name, st.event_format
      FROM coach_bookings b
      LEFT JOIN coach_session_types st ON st.id = b.session_type_id
      WHERE b.client_user_id = ? AND b.scheduled_at >= ? AND b.scheduled_at < ?
      ORDER BY b.scheduled_at
    `, [req.params.id, start, end + 'T23:59:59']).rows;

    const checkins = pool.query(
      'SELECT id, date FROM checkins WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date',
      [req.params.id, start, end],
    ).rows;

    const completedLogs = pool.query(
      'SELECT DISTINCT date FROM workout_logs WHERE user_id = ? AND completed = 1 AND date >= ? AND date <= ?',
      [req.params.id, start, end],
    ).rows.map(r => r.date);

    res.json({ month, workouts, bookings, checkins, completedLogDates: completedLogs });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Client daily tasks — bidirectional. Clients can self-manage via the
// dashboard endpoints; coaches can also add/edit/remove from here. The
// tasks.coach_id column stamps who created it so the UI can show a
// "Set by coach" badge on client-owned surfaces.
// ─────────────────────────────────────────────────────────────────────
router.post('/clients/:id/tasks', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const { label, recurring } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label required' });
    const result = pool.query(
      'INSERT INTO tasks (coach_id, client_id, label, recurring) VALUES (?, ?, ?, ?) RETURNING id',
      [req.user.id, req.params.id, label.trim().slice(0, 120), recurring === false ? 0 : 1],
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Coach add task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/tasks/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { label, recurring } = req.body;
    const fields = [];
    const values = [];
    if (label !== undefined) { fields.push('label = ?'); values.push(label.trim().slice(0, 120)); }
    if (recurring !== undefined) { fields.push('recurring = ?'); values.push(recurring ? 1 : 0); }
    if (!fields.length) return res.json({ ok: true });
    values.push(req.params.id);
    pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('Coach edit task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/tasks/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Coach delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Supplements — CRUD for a coach's client
// ─────────────────────────────────────────────────────────────────────
router.get('/clients/:id/supplements', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const rows = pool.query(
      `SELECT * FROM supplements WHERE user_id = ?
       ORDER BY COALESCE(section_order, 999), section, COALESCE(sort_order, 999), name`,
      [req.params.id]
    ).rows;
    const withStats = rows.map(r => ({
      ...r,
      double_on_days: r.double_on_days ? JSON.parse(r.double_on_days) : null,
    }));
    res.json({ supplements: withStats });
  } catch (err) {
    console.error('Coach list supplements error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/clients/:id/supplements', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const {
      name, dose, timing, rationale, notes,
      section, section_order, sort_order,
      is_conditional, conditional_trigger, double_on_days,
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const result = pool.query(
      `INSERT INTO supplements
         (user_id, name, dose, timing, rationale, notes, section, section_order, sort_order,
          is_conditional, conditional_trigger, double_on_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        req.params.id,
        name.trim().slice(0, 120),
        dose || null,
        timing || null,
        rationale || null,
        notes || null,
        section || null,
        Number.isFinite(section_order) ? section_order : 0,
        Number.isFinite(sort_order) ? sort_order : 0,
        is_conditional ? 1 : 0,
        conditional_trigger || null,
        Array.isArray(double_on_days) && double_on_days.length ? JSON.stringify(double_on_days) : null,
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Coach add supplement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/supplements/:suppId', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    // Ownership check: coach must own the client this supplement belongs to.
    const row = pool.query(
      `SELECT s.user_id FROM supplements s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND u.role = 'client' AND (u.coach_id IS NULL OR u.coach_id = ?)`,
      [req.params.suppId, req.user.id]
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });

    const {
      name, dose, timing, rationale, notes,
      section, section_order, sort_order,
      is_conditional, conditional_trigger, double_on_days,
    } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined)              { fields.push('name = ?');              values.push(String(name).trim().slice(0, 120)); }
    if (dose !== undefined)              { fields.push('dose = ?');              values.push(dose || null); }
    if (timing !== undefined)            { fields.push('timing = ?');            values.push(timing || null); }
    if (rationale !== undefined)         { fields.push('rationale = ?');         values.push(rationale || null); }
    if (notes !== undefined)             { fields.push('notes = ?');             values.push(notes || null); }
    if (section !== undefined)           { fields.push('section = ?');           values.push(section || null); }
    if (section_order !== undefined)     { fields.push('section_order = ?');     values.push(Number.isFinite(section_order) ? section_order : 0); }
    if (sort_order !== undefined)        { fields.push('sort_order = ?');        values.push(Number.isFinite(sort_order) ? sort_order : 0); }
    if (is_conditional !== undefined)    { fields.push('is_conditional = ?');    values.push(is_conditional ? 1 : 0); }
    if (conditional_trigger !== undefined) { fields.push('conditional_trigger = ?'); values.push(conditional_trigger || null); }
    if (double_on_days !== undefined)    {
      fields.push('double_on_days = ?');
      values.push(Array.isArray(double_on_days) && double_on_days.length ? JSON.stringify(double_on_days) : null);
    }
    if (!fields.length) return res.json({ ok: true });
    values.push(req.params.suppId);
    pool.query(`UPDATE supplements SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('Coach edit supplement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/supplements/:suppId', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const row = pool.query(
      `SELECT s.id FROM supplements s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND u.role = 'client' AND (u.coach_id IS NULL OR u.coach_id = ?)`,
      [req.params.suppId, req.user.id]
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    pool.query('DELETE FROM supplements WHERE id = ?', [req.params.suppId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Coach delete supplement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Client membership — coach-set plan + next renewal
// ─────────────────────────────────────────────────────────────────────
router.patch('/clients/:id/membership', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    // Only update fields that are explicitly present in the request body.
    // Explicit null clears the field; absent key leaves it unchanged.
    const fields = [];
    const values = [];
    ['plan_title', 'plan_cycle', 'plan_started_at', 'plan_next_renewal_at'].forEach(k => {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        fields.push(`${k} = ?`);
        values.push(req.body[k] || null);
      }
    });
    if (!fields.length) return res.json({ ok: true });

    // Ensure a client_profiles row exists — early-onboarding clients may
    // not have one yet and the UPDATE would silently no-op.
    const existing = pool.query('SELECT id FROM client_profiles WHERE user_id = ?', [req.params.id]).rows[0];
    if (!existing) {
      pool.query('INSERT INTO client_profiles (user_id) VALUES (?)', [req.params.id]);
    }

    values.push(req.params.id);
    pool.query(`UPDATE client_profiles SET ${fields.join(', ')} WHERE user_id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('Membership update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Client lifecycle — status change (active / paused / archived) + password reset.
// See project_pre_launch_checklist.md for SMTP send deferral.
// ─────────────────────────────────────────────────────────────────────
router.patch('/clients/:id/status', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['active', 'paused', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, paused, or archived.' });
    }

    // Ensure client_profiles row exists (some early-onboarding users lack one)
    const existing = pool.query('SELECT id FROM client_profiles WHERE user_id = ?', [req.params.id]).rows[0];
    if (!existing) {
      pool.query('INSERT INTO client_profiles (user_id) VALUES (?)', [req.params.id]);
    }

    pool.query(
      `UPDATE client_profiles
         SET status = ?,
             status_changed_at = datetime('now'),
             status_note = ?
       WHERE user_id = ?`,
      [status, note || null, req.params.id],
    );
    res.json({ ok: true, status });
  } catch (err) {
    console.error('Client status update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

import crypto from 'crypto';

router.post('/clients/:id/reset-password', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const client = pool.query(
      "SELECT id, email, name FROM users WHERE id = ? AND role = 'client'",
      [req.params.id],
    ).rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Invalidate any previous unused tokens for this user
    pool.query(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
      [client.id],
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_by)
       VALUES (?, ?, ?, ?)`,
      [client.id, token, expiresAt, req.user.id],
    );

    // Until SMTP is wired, the URL is returned to the coach so they can forward it
    // to the client themselves. See project_pre_launch_checklist.md.
    const origin = req.headers.origin || `http://localhost:${process.env.PORT || 3001}`;
    const url = `${origin}/reset-password?token=${token}`;
    res.json({
      ok: true,
      reset_url: url,
      expires_at: expiresAt,
      email_sent: false,
      note: 'SMTP not configured yet — copy this URL and send it to the client manually.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Per-client workout overrides (personalisations).
// - GET  /clients/:id/workouts/:workoutId                 → template + override state
// - PUT  /clients/:id/workouts/:workoutId/override        → save/replace override
// - DELETE /clients/:id/workouts/:workoutId/override      → drop override (back to template)
// - GET  /workouts/:workoutId/overrides                   → list clients who have overrides for this workout
// See project_edit_scope_choice.md.
// ─────────────────────────────────────────────────────────────────────

// Return the template workout + this client's override (if any).
// Coach uses this to populate the "personalise for [client]" editor.
router.get('/clients/:id/workouts/:workoutId', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const workout = pool.query('SELECT * FROM workouts WHERE id = ?', [req.params.workoutId]).rows[0];
    if (!workout) return res.status(404).json({ error: 'Workout not found' });

    const templateExercises = pool.query(`
      SELECT we.id AS workout_exercise_id, we.exercise_id, we.order_index, we.sets, we.reps,
        we.duration_secs, we.rest_secs, we.group_type, we.group_label, we.notes,
        e.name, e.thumbnail_url, e.body_part, e.equipment, e.demo_video_url,
        wem.tracking_type AS meta_tracking_type, wem.per_side AS meta_per_side,
        wem.tempo, wem.modality, wem.time_based, wem.duration_secs AS meta_duration_secs
      FROM workout_exercises we
      JOIN exercises e ON we.exercise_id = e.id
      LEFT JOIN workout_exercise_meta wem ON wem.workout_exercise_id = we.id
      WHERE we.workout_id = ?
      ORDER BY we.order_index
    `, [req.params.workoutId]).rows;

    const override = pool.query(
      'SELECT id, exercises_json, meta_json, coach_note, created_at, updated_at FROM user_workout_overrides WHERE user_id = ? AND workout_id = ?',
      [req.params.id, req.params.workoutId],
    ).rows[0];

    let overrideExercises = null;
    let overrideMeta = null;
    if (override) {
      try { overrideExercises = JSON.parse(override.exercises_json); } catch {}
      try { overrideMeta = override.meta_json ? JSON.parse(override.meta_json) : null; } catch {}
    }

    res.json({
      workout,
      template_exercises: templateExercises,
      override: override ? {
        exercises: overrideExercises,
        meta: overrideMeta,
        coach_note: override.coach_note,
        created_at: override.created_at,
        updated_at: override.updated_at,
      } : null,
    });
  } catch (err) {
    console.error('Client workout fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save (upsert) an override for this client + workout.
// Body: { exercises: [...], meta?: {...}, coach_note?: string }
router.put('/clients/:id/workouts/:workoutId/override', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    const { exercises, meta, coach_note } = req.body;
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return res.status(400).json({ error: 'exercises array required (use DELETE to remove override)' });
    }

    // Verify client exists and is actually a client
    const client = pool.query("SELECT id FROM users WHERE id = ? AND role = 'client'", [req.params.id]).rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const workout = pool.query('SELECT id FROM workouts WHERE id = ?', [req.params.workoutId]).rows[0];
    if (!workout) return res.status(404).json({ error: 'Workout not found' });

    const exercisesJson = JSON.stringify(exercises);
    const metaJson = meta ? JSON.stringify(meta) : null;

    const existing = pool.query(
      'SELECT id FROM user_workout_overrides WHERE user_id = ? AND workout_id = ?',
      [req.params.id, req.params.workoutId],
    ).rows[0];

    if (existing) {
      pool.query(
        `UPDATE user_workout_overrides
           SET exercises_json = ?, meta_json = ?, coach_note = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [exercisesJson, metaJson, coach_note || null, existing.id],
      );
      res.json({ ok: true, id: existing.id, updated: true });
    } else {
      const row = pool.query(
        `INSERT INTO user_workout_overrides (user_id, workout_id, exercises_json, meta_json, coach_note, created_by)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [req.params.id, req.params.workoutId, exercisesJson, metaJson, coach_note || null, req.user.id],
      );
      res.json({ ok: true, id: row.rows[0].id, created: true });
    }
  } catch (err) {
    console.error('Override save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove an override, reverting this client to the template.
router.delete('/clients/:id/workouts/:workoutId/override', authenticateToken, requireRole('coach'), requireCoachOwnsClient('id'), (req, res) => {
  try {
    pool.query(
      'DELETE FROM user_workout_overrides WHERE user_id = ? AND workout_id = ?',
      [req.params.id, req.params.workoutId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Override delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// For the template-drift prompt on WorkoutBuilder: list which clients have
// personalised this workout, so the coach can see who won't auto-get the edit.
router.get('/workouts/:workoutId/overrides', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const rows = pool.query(`
      SELECT uwo.user_id, uwo.updated_at, u.name, u.email,
        COALESCE(cp.profile_image_url, u.avatar_url) AS photo_url
      FROM user_workout_overrides uwo
      JOIN users u ON u.id = uwo.user_id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE uwo.workout_id = ?
      ORDER BY uwo.updated_at DESC
    `, [req.params.workoutId]).rows;
    res.json({ clients: rows });
  } catch (err) {
    console.error('Overrides list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Aggregated override counts across all workouts — powers the "N personalised"
// badge on the admin Workouts library list. One round-trip instead of N.
router.get('/workouts/overrides/counts', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const rows = pool.query(
      'SELECT workout_id, COUNT(*) AS n FROM user_workout_overrides GROUP BY workout_id'
    ).rows;
    const counts = {};
    rows.forEach(r => { counts[r.workout_id] = Number(r.n) || 0; });
    res.json({ counts });
  } catch (err) {
    console.error('Overrides counts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Drop overrides for the listed user_ids so those clients snap back to the
// (just-edited) template. Used by the WorkoutBuilder drift prompt after a
// coach saves template changes — the coach ticks which clients should receive
// the new version.
// Body: { user_ids: number[] }
router.post('/workouts/:workoutId/overrides/clear', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { user_ids } = req.body || {};
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array required' });
    }
    const requested = user_ids.map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (requested.length === 0) return res.status(400).json({ error: 'user_ids array required' });

    // Scope to clients this coach owns. Unassigned clients (coach_id IS NULL)
    // are considered fair game — matches the team-inbox model. A coach silently
    // skips any id they don't own rather than 403-ing the whole batch.
    const qsR = requested.map(() => '?').join(',');
    const allowed = pool.query(
      `SELECT id FROM users
       WHERE id IN (${qsR}) AND role = 'client' AND (coach_id IS NULL OR coach_id = ?)`,
      [...requested, req.user.id],
    ).rows.map(r => r.id);
    if (allowed.length === 0) {
      return res.status(403).json({ error: 'No matching clients you own' });
    }

    const placeholders = allowed.map(() => '?').join(',');
    const result = pool.query(
      `DELETE FROM user_workout_overrides WHERE workout_id = ? AND user_id IN (${placeholders})`,
      [req.params.workoutId, ...allowed],
    );
    res.json({ ok: true, cleared: result.rowCount ?? allowed.length, skipped: requested.length - allowed.length });
  } catch (err) {
    console.error('Overrides clear error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
