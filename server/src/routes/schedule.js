import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// ─── Default weekday convention ─────────────────────────────────────────
// Programs carry a raw `day_number` on each workout — in older seeds that's
// literally "day N after enrollment starts", in newer seeds it matches
// calendar weekdays. Rather than trust the raw value we normalise at
// display time: sort a week's workouts by day_number, assign session
// indexes 1..N, and map each session to a weekday using this table.
//
//   1 workout per week  → Mon
//   2 workouts per week → Tue, Thu
//   3 workouts per week → Mon, Wed, Fri
//   4 workouts per week → Mon, Tue, Thu, Fri
//   5 workouts per week → Mon-Fri
//   6 workouts per week → Mon-Sat
//   7 workouts per week → Mon-Sun
//
// Weekday integers: 1 = Mon, 2 = Tue, ..., 7 = Sun. Clients can shift
// their own sessions away from the default via user_scheduled_workouts
// and workout_reschedules (the override paths below still work).
const DEFAULT_WEEKDAYS = {
  1: [1],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

function cleanDateStr(s) {
  if (!s) return null;
  // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS.sssZ" | "YYYY-MM-DD HH:MM:SS"
  return String(s).split(/[T ]/)[0];
}

// Monday of the week containing the given date. JS getDay() returns
// 0 for Sun so we normalise to 1=Mon..7=Sun before subtracting.
function mondayOf(dateStr) {
  const clean = cleanDateStr(dateStr);
  const d = new Date(clean + 'T12:00:00'); // mid-day avoids DST edge cases
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Compute the calendar date for a program workout's scheduled session
// under the default-weekdays convention.
function computeSessionDate(startedAt, weekNumber, sessionIndex, workoutsPerWeek) {
  const mapping = DEFAULT_WEEKDAYS[workoutsPerWeek]
    || DEFAULT_WEEKDAYS[Math.max(1, Math.min(7, workoutsPerWeek || 3))];
  const weekday = mapping[Math.min(sessionIndex - 1, mapping.length - 1)];
  const week1Monday = mondayOf(startedAt);
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (weekNumber - 1) * 7 + (weekday - 1));
  return isoDate(target);
}

// Helper: fetch workouts prescribed for a user on a given date.
// Two sources merged:
//   1. Program-driven -- if the user is enrolled in a program, its workouts
//      map onto calendar dates starting from `started_at`. Week N day M
//      lands on `started_at + (N-1)*7 + (M-1)` days.
//      Respects workout_reschedules:
//        - permanent overrides shift the day_number for all future weeks
//        - one-off overrides move a specific date's workout to a new date
//   2. user_scheduled_workouts -- explicit additive entries the client
//      added on top. These don't override the program; both show up together.
//
// Returns a flat array with a `source` field ('program' | 'user') so the
// UI can distinguish and gate remove-buttons accordingly.
function getScheduledForDate(userId, date) {
  // Short-circuit: rest days have no prescribed or user-added workouts.
  // Logged workouts are still returned by the endpoint separately since those
  // represent history that cannot be un-done.
  const restDay = pool.query(
    'SELECT id FROM user_rest_days WHERE user_id = ? AND date = ?',
    [userId, date]
  ).rows[0];
  if (restDay) return [];

  // 1. Get all program workouts for this user's enrolments, then filter by
  //    computed date in JS using the default-weekdays convention.
  //    (Previous SQL used raw day_number as a literal day offset, which
  //    ignored the Tue/Thu + Mon/Wed/Fri default. We now normalise in JS.)
  const allProgramWorkouts = pool.query(`
    SELECT
      NULL AS schedule_id,
      ? AS scheduled_date,
      0 AS sort_order,
      0 AS completed,
      NULL AS completed_at,
      'program' AS source,
      w.id AS workout_id,
      w.title,
      w.description,
      w.duration_mins,
      w.intensity,
      w.body_parts,
      w.equipment,
      w.workout_type,
      w.image_url,
      w.video_url,
      w.program_id,
      w.week_number,
      w.day_number,
      p.title AS program_title,
      p.workouts_per_week,
      cp.id AS enrollment_id,
      cp.started_at
    FROM client_programs cp
    JOIN programs p ON cp.program_id = p.id
    JOIN workouts w ON w.program_id = cp.program_id
    WHERE cp.user_id = ?
    ORDER BY cp.id, w.week_number, w.day_number
  `, [date, userId]).rows;

  // Group workouts by (enrolment, week) so we can index sessions 1..N
  // within the week and map them to weekdays per DEFAULT_WEEKDAYS.
  const weekBuckets = new Map();
  for (const w of allProgramWorkouts) {
    const key = `${w.enrollment_id}|${w.week_number}`;
    if (!weekBuckets.has(key)) weekBuckets.set(key, []);
    weekBuckets.get(key).push(w);
  }

  const programWorkouts = [];
  for (const bucket of weekBuckets.values()) {
    bucket.sort((a, b) => a.day_number - b.day_number);
    bucket.forEach((w, idx) => {
      const sessionIndex = idx + 1;
      const target = computeSessionDate(w.started_at, w.week_number, sessionIndex, w.workouts_per_week);
      if (target === date) programWorkouts.push({ ...w, session_index: sessionIndex });
    });
  }

  // 2. Permanent reschedules: `new_day_number` is reinterpreted as the
  //    new target weekday (1=Mon..7=Sun). Compute the target date from
  //    started_at + week offset + weekday, in JS.
  const permRescheduleRows = pool.query(`
    SELECT
      w.id AS workout_id,
      w.title, w.description, w.duration_mins, w.intensity,
      w.body_parts, w.equipment, w.workout_type, w.image_url, w.video_url,
      w.program_id, w.week_number, w.day_number,
      p.title AS program_title,
      cp.id AS enrollment_id,
      cp.started_at,
      wr.new_day_number AS overridden_day
    FROM workout_reschedules wr
    JOIN workouts w ON wr.workout_id = w.id
    JOIN client_programs cp ON cp.program_id = w.program_id AND cp.user_id = wr.user_id
    JOIN programs p ON cp.program_id = p.id
    WHERE wr.user_id = ?
      AND wr.permanent = 1
  `, [userId]).rows;

  const permanentMovedIn = [];
  for (const w of permRescheduleRows) {
    const weekday = Math.max(1, Math.min(7, w.overridden_day || 1));
    const monday = mondayOf(w.started_at);
    const target = new Date(monday);
    target.setDate(monday.getDate() + (w.week_number - 1) * 7 + (weekday - 1));
    if (isoDate(target) === date) {
      permanentMovedIn.push({
        schedule_id: null,
        scheduled_date: date,
        sort_order: 0,
        completed: 0,
        completed_at: null,
        source: 'program',
        ...w,
      });
    }
  }

  // 3. Check for one-off reschedules that move a workout TO this date
  const oneOffMovedIn = pool.query(`
    SELECT
      NULL AS schedule_id,
      ? AS scheduled_date,
      0 AS sort_order,
      0 AS completed,
      NULL AS completed_at,
      'program' AS source,
      w.id AS workout_id,
      w.title,
      w.description,
      w.duration_mins,
      w.intensity,
      w.body_parts,
      w.equipment,
      w.workout_type,
      w.image_url,
      w.video_url,
      w.program_id,
      w.week_number,
      w.day_number,
      p.title AS program_title,
      cp.id AS enrollment_id,
      1 AS is_rescheduled
    FROM workout_reschedules wr
    JOIN workouts w ON wr.workout_id = w.id
    JOIN client_programs cp ON cp.program_id = w.program_id AND cp.user_id = wr.user_id
    JOIN programs p ON cp.program_id = p.id
    WHERE wr.user_id = ?
      AND wr.permanent = 0
      AND wr.new_date = ?
  `, [date, userId, date]).rows;

  // 4. Filter out workouts that have been moved AWAY from this date
  //    a) permanent reschedules: the original day_number no longer applies
  const permanentRescheduleWorkoutIds = new Set(
    pool.query(
      `SELECT workout_id FROM workout_reschedules WHERE user_id = ? AND permanent = 1`,
      [userId]
    ).rows.map(r => r.workout_id)
  );

  //    b) one-off reschedules: specific original_date matches today
  const oneOffMovedAway = new Set(
    pool.query(
      `SELECT workout_id FROM workout_reschedules WHERE user_id = ? AND permanent = 0 AND original_date = ?`,
      [userId, date]
    ).rows.map(r => r.workout_id)
  );

  // Filter the default program workouts
  const filteredProgram = programWorkouts.filter(w => {
    // If this workout has a permanent reschedule, skip it from default position
    if (permanentRescheduleWorkoutIds.has(w.workout_id)) return false;
    // If this workout was one-off moved away from this date, skip it
    if (oneOffMovedAway.has(w.workout_id)) return false;
    return true;
  });

  // Combine: filtered defaults + permanently moved in + one-off moved in
  const allProgram = [...filteredProgram, ...permanentMovedIn, ...oneOffMovedIn];

  // User-added workouts
  const userWorkouts = pool.query(`
    SELECT
      usw.id AS schedule_id,
      usw.scheduled_date,
      usw.sort_order,
      usw.completed,
      usw.completed_at,
      'user' AS source,
      w.id AS workout_id,
      w.title,
      w.description,
      w.duration_mins,
      w.intensity,
      w.body_parts,
      w.equipment,
      w.workout_type,
      w.image_url,
      w.video_url,
      w.program_id,
      w.week_number,
      w.day_number,
      (SELECT title FROM programs WHERE id = w.program_id) AS program_title
    FROM user_scheduled_workouts usw
    JOIN workouts w ON usw.workout_id = w.id
    WHERE usw.user_id = ? AND usw.scheduled_date = ?
    ORDER BY usw.sort_order, usw.id
  `, [userId, date]).rows;

  // Training block workouts (block-based weekly schedule)
  // These are prescribed via the coach's training_block + weekly_schedule,
  // not via client_programs. Must be included so the day-detail sheet matches
  // what the homepage "Today's Sessions" shows.
  const dayOfWeekStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const block = pool.query(
    `SELECT id FROM training_blocks
     WHERE user_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY start_date DESC LIMIT 1`,
    [userId, date, date]
  ).rows[0];

  const blockWorkouts = block ? pool.query(`
    SELECT
      NULL AS schedule_id,
      ? AS scheduled_date,
      ws.id AS sort_order,
      0 AS completed,
      NULL AS completed_at,
      'block' AS source,
      w.id AS workout_id,
      COALESCE(w.title, ws.session_ref) AS title,
      w.description,
      COALESCE(w.duration_mins, ws.duration_min) AS duration_mins,
      w.intensity,
      w.body_parts,
      w.equipment,
      COALESCE(w.workout_type, ws.session_type) AS workout_type,
      w.image_url,
      w.video_url,
      w.program_id,
      w.week_number,
      w.day_number,
      ws.session_type,
      ws.time_slot,
      ws.session_ref,
      (SELECT title FROM programs WHERE id = w.program_id) AS program_title
    FROM weekly_schedule ws
    LEFT JOIN workouts w ON ws.workout_id = w.id
    WHERE ws.block_id = ? AND ws.day_of_week = ?
  `, [date, block.id, dayOfWeekStr]).rows : [];

  // Apply one-off suppressions: user has explicitly deleted a prescribed
  // workout occurrence for this date via the planner's bin icon.
  const suppressedIds = new Set(
    pool.query(
      'SELECT workout_id FROM workout_suppressions WHERE user_id = ? AND date = ?',
      [userId, date]
    ).rows.map(r => r.workout_id)
  );
  const filterSuppressed = (list) => list.filter(w => !w.workout_id || !suppressedIds.has(w.workout_id));

  // Dedupe by workout_id: a workout should appear at most once per day.
  // Priority: user-added > block-prescribed > program-suggested.
  // (User explicitly chose it; block is coach-scheduled; program is passive suggestion.)
  const combined = [
    ...filterSuppressed(userWorkouts),
    ...filterSuppressed(blockWorkouts),
    ...filterSuppressed(allProgram),
  ];
  const seen = new Set();
  const deduped = [];
  for (const w of combined) {
    const key = w.workout_id ?? `ref:${w.session_ref || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(w);
  }

  // Preserve original source ordering: program, user, block (matches UI expectations).
  return [
    ...deduped.filter(w => w.source === 'program'),
    ...deduped.filter(w => w.source === 'user'),
    ...deduped.filter(w => w.source === 'block'),
  ];
}

// GET /api/schedule?date=YYYY-MM-DD
router.get('/', authenticateToken, (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
    const workouts = getScheduledForDate(req.user.id, date);

    // Include logged workouts for this date (from "Log Other Workout" or completed workouts)
    const loggedWorkouts = pool.query(`
      SELECT
        wl.id AS log_id,
        wl.workout_id,
        wl.duration_mins,
        wl.notes,
        wl.completed,
        wl.created_at,
        'logged' AS source,
        COALESCE(w.title, 'Other Workout') AS title,
        w.image_url,
        w.body_parts,
        w.workout_type
      FROM workout_logs wl
      LEFT JOIN workouts w ON wl.workout_id = w.id AND wl.workout_id IS NOT NULL
      WHERE wl.user_id = ? AND wl.date = ?
      ORDER BY wl.created_at
    `, [req.user.id, date]).rows;

    // Check rest day
    const restDay = pool.query(
      'SELECT id FROM user_rest_days WHERE user_id = ? AND date = ?',
      [req.user.id, date]
    ).rows[0];

    res.json({ date, workouts, logged_workouts: loggedWorkouts, is_rest_day: !!restDay });
  } catch (err) {
    console.error('Schedule get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/schedule/week?start=YYYY-MM-DD
router.get('/week', authenticateToken, (req, res) => {
  try {
    const start = req.query.start;
    if (!start) return res.status(400).json({ error: 'start query param required (YYYY-MM-DD)' });
    const dates = [];
    const base = new Date(start + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const byDate = {};
    dates.forEach(d => { byDate[d] = { count: 0, completed_count: 0, logged_count: 0, is_rest_day: false }; });

    // User-added entries
    const placeholders = dates.map(() => '?').join(',');
    const userRows = pool.query(
      `SELECT scheduled_date, COUNT(*) as count, SUM(completed) as completed_count
       FROM user_scheduled_workouts
       WHERE user_id = ? AND scheduled_date IN (${placeholders})
       GROUP BY scheduled_date`,
      [req.user.id, ...dates]
    ).rows;
    userRows.forEach(r => {
      byDate[r.scheduled_date].count += r.count;
      byDate[r.scheduled_date].completed_count += r.completed_count || 0;
    });

    // Logged workouts (from Log Other Workout / completed via explore)
    const loggedRows = pool.query(
      `SELECT date, COUNT(*) as count
       FROM workout_logs
       WHERE user_id = ? AND date IN (${placeholders})
       GROUP BY date`,
      [req.user.id, ...dates]
    ).rows;
    loggedRows.forEach(r => {
      if (byDate[r.date]) byDate[r.date].logged_count = r.count;
    });

    // Rest days
    const restRows = pool.query(
      `SELECT date FROM user_rest_days WHERE user_id = ? AND date IN (${placeholders})`,
      [req.user.id, ...dates]
    ).rows;
    restRows.forEach(r => {
      if (byDate[r.date]) byDate[r.date].is_rest_day = true;
    });

    // Program-driven + block-driven: count per day, respecting reschedules
    dates.forEach(d => {
      const workouts = getScheduledForDate(req.user.id, d);
      const prescribedCount = workouts.filter(w => w.source === 'program' || w.source === 'block').length;
      byDate[d].count += prescribedCount;
    });

    res.json({ week: byDate });
  } catch (err) {
    console.error('Schedule week error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/schedule
// Body: { workout_id, scheduled_date, sort_order? }
router.post('/', authenticateToken, (req, res) => {
  try {
    const { workout_id, scheduled_date, sort_order } = req.body;
    if (!workout_id || !scheduled_date) {
      return res.status(400).json({ error: 'workout_id and scheduled_date required' });
    }
    // Reject duplicates: a workout can only appear once per day, whether it's
    // program-suggested, block-prescribed, or already user-added.
    const alreadyScheduled = getScheduledForDate(req.user.id, scheduled_date)
      .some(w => w.workout_id === workout_id);
    if (alreadyScheduled) {
      return res.status(409).json({ error: 'This workout is already scheduled for that day.' });
    }
    let order = sort_order;
    if (typeof order !== 'number') {
      const existing = pool.query(
        'SELECT COUNT(*) as c FROM user_scheduled_workouts WHERE user_id = ? AND scheduled_date = ?',
        [req.user.id, scheduled_date]
      ).rows[0];
      order = existing?.c || 0;
    }
    const result = pool.query(
      `INSERT INTO user_scheduled_workouts (user_id, workout_id, scheduled_date, sort_order)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [req.user.id, workout_id, scheduled_date, order]
    );
    res.json({ id: result.rows[0].id, success: true });
  } catch (err) {
    console.error('Schedule post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/schedule/recent-workouts
// Returns the user's recently logged unique workouts (for quick-add shortlist)
router.get('/recent-workouts', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(`
      SELECT DISTINCT
        w.id AS workout_id,
        w.title,
        w.image_url,
        w.duration_mins,
        w.body_parts,
        w.workout_type,
        MAX(wl.date) AS last_logged
      FROM workout_logs wl
      JOIN workouts w ON wl.workout_id = w.id
      WHERE wl.user_id = ? AND wl.workout_id != 0
      GROUP BY w.id
      ORDER BY last_logged DESC
      LIMIT 10
    `, [req.user.id]).rows;
    res.json({ workouts: rows });
  } catch (err) {
    console.error('Recent workouts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/schedule/rest-day
// Body: { date: 'YYYY-MM-DD' }
router.post('/rest-day', authenticateToken, (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    pool.query(
      'INSERT OR IGNORE INTO user_rest_days (user_id, date) VALUES (?, ?)',
      [req.user.id, date]
    );
    // Auto-remove user-added scheduled workouts for this date.
    // Prescribed (program/block) workouts are pattern-based and handled by
    // the rest-day short-circuit in getScheduledForDate.
    pool.query(
      'DELETE FROM user_scheduled_workouts WHERE user_id = ? AND scheduled_date = ?',
      [req.user.id, date]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Rest day post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/schedule/suppress
// Body: { workout_id, date }. Hides a prescribed workout for that date.
router.post('/suppress', authenticateToken, (req, res) => {
  try {
    const { workout_id, date } = req.body;
    if (!workout_id || !date) return res.status(400).json({ error: 'workout_id and date required' });
    pool.query(
      'INSERT OR IGNORE INTO workout_suppressions (user_id, workout_id, date) VALUES (?, ?, ?)',
      [req.user.id, workout_id, date]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Suppress error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/schedule/suppress?workout_id=X&date=Y — undo a suppression
router.delete('/suppress', authenticateToken, (req, res) => {
  try {
    const { workout_id, date } = req.query;
    if (!workout_id || !date) return res.status(400).json({ error: 'workout_id and date required' });
    pool.query(
      'DELETE FROM workout_suppressions WHERE user_id = ? AND workout_id = ? AND date = ?',
      [req.user.id, Number(workout_id), date]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Unsuppress error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/schedule/rest-day?date=YYYY-MM-DD
router.delete('/rest-day', authenticateToken, (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date required' });
    pool.query(
      'DELETE FROM user_rest_days WHERE user_id = ? AND date = ?',
      [req.user.id, date]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Rest day delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const row = pool.query('SELECT user_id FROM user_scheduled_workouts WHERE id = ?', [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    pool.query('DELETE FROM user_scheduled_workouts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Schedule delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/schedule/:id/complete
router.patch('/:id/complete', authenticateToken, (req, res) => {
  try {
    const { completed = true } = req.body;
    const row = pool.query('SELECT user_id FROM user_scheduled_workouts WHERE id = ?', [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    pool.query(
      'UPDATE user_scheduled_workouts SET completed = ?, completed_at = ? WHERE id = ?',
      [completed ? 1 : 0, completed ? new Date().toISOString() : null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Schedule complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/schedule/reschedule
// Move a program workout to a different day.
// Body: {
//   workout_id, program_id,
//   original_date (YYYY-MM-DD),
//   new_date (YYYY-MM-DD),
//   permanent (boolean) -- true = all future weeks, false = just this week
// }
router.post('/reschedule', authenticateToken, (req, res) => {
  try {
    const { workout_id, program_id, original_date, new_date, permanent } = req.body;
    if (!workout_id || !program_id || !original_date || !new_date) {
      return res.status(400).json({ error: 'workout_id, program_id, original_date, and new_date required' });
    }

    const isPermanent = permanent ? 1 : 0;

    if (isPermanent) {
      // Calculate the new day_number from the new_date relative to the week start
      // day_number 1 = Monday ... 7 = Sunday
      const newDateObj = new Date(new_date + 'T00:00:00');
      const jsDay = newDateObj.getDay(); // 0=Sun ... 6=Sat
      const newDayNumber = jsDay === 0 ? 7 : jsDay; // convert to 1=Mon...7=Sun

      // Remove any existing reschedule for this workout
      pool.query(
        'DELETE FROM workout_reschedules WHERE user_id = ? AND workout_id = ? AND permanent = 1',
        [req.user.id, workout_id]
      );

      // Also clean up any one-off reschedules for this workout since permanent takes over
      pool.query(
        'DELETE FROM workout_reschedules WHERE user_id = ? AND workout_id = ? AND permanent = 0',
        [req.user.id, workout_id]
      );

      pool.query(
        `INSERT INTO workout_reschedules (user_id, program_id, workout_id, original_date, new_date, new_day_number, permanent)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [req.user.id, program_id, workout_id, original_date, new_date, newDayNumber]
      );

      res.json({ success: true, mode: 'permanent', new_day_number: newDayNumber });
    } else {
      // One-off: remove any existing one-off for this workout + original_date
      pool.query(
        'DELETE FROM workout_reschedules WHERE user_id = ? AND workout_id = ? AND permanent = 0 AND original_date = ?',
        [req.user.id, workout_id, original_date]
      );

      pool.query(
        `INSERT INTO workout_reschedules (user_id, program_id, workout_id, original_date, new_date, permanent)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [req.user.id, program_id, workout_id, original_date, new_date]
      );

      res.json({ success: true, mode: 'one_off' });
    }
  } catch (err) {
    console.error('Reschedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/schedule/reschedule/:workoutId
// Undo a permanent reschedule -- revert workout to its original day
router.delete('/reschedule/:workoutId', authenticateToken, (req, res) => {
  try {
    pool.query(
      'DELETE FROM workout_reschedules WHERE user_id = ? AND workout_id = ?',
      [req.user.id, req.params.workoutId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Undo reschedule error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
