import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, requireCoachOwnsClient } from '../middleware/auth.js';

const router = Router();

const todayIso = () => new Date().toISOString().slice(0, 10);

// Is a notification live for the given day? One-shot checks the window;
// recurring checks starts_at ≤ date ≤ ends_at and day-of-week for weekly.
function isLiveOn(n, dateIso) {
  if (!n.active) return false;
  const d = dateIso;
  if (n.starts_at && d < n.starts_at.slice(0, 10)) return false;
  if (n.ends_at && d > n.ends_at.slice(0, 10)) return false;
  if (n.recurrence === 'weekly' && n.starts_at) {
    const sDay = new Date(n.starts_at).getUTCDay();
    const cDay = new Date(d).getUTCDay();
    if (sDay !== cDay) return false;
  }
  return true;
}

// Does this user match the audience filter?
function matchesAudience(n, userId) {
  if (n.audience === 'all') return true;
  if (n.audience === 'tier') {
    const prof = pool.query('SELECT tier_id FROM client_profiles WHERE user_id = ?', [userId]).rows[0];
    return prof?.tier_id === n.audience_tier_id;
  }
  if (n.audience === 'user') {
    return Number(n.audience_user_id) === Number(userId);
  }
  return false;
}

// ── Client endpoints ───────────────────────────────────────────────────

// Active notifications the caller should see right now. Skips ones the user
// already dismissed or completed for the current occurrence.
router.get('/active', authenticateToken, (req, res) => {
  try {
    const today = todayIso();
    const rows = pool.query(
      `SELECT * FROM in_app_notifications
       WHERE active = 1
         AND (starts_at IS NULL OR starts_at <= datetime('now'))
         AND (ends_at IS NULL OR ends_at >= datetime('now'))
       ORDER BY created_at DESC`
    ).rows;

    // Account age gate: brand-new clients don't need a daily-check-in nag on
    // their first login. Give them 24h to settle in before the habit prompt
    // starts appearing. Only applies to kind='daily_checkin'.
    const viewer = pool.query('SELECT created_at FROM users WHERE id = ?', [req.user.id]).rows[0];
    const accountAgeHours = viewer?.created_at
      ? (Date.now() - new Date(viewer.created_at + 'Z').getTime()) / 3600000
      : Infinity;
    const suppressDailyCheckin = accountAgeHours < 24;

    const out = [];
    for (const n of rows) {
      if (!isLiveOn(n, today)) continue;
      if (!matchesAudience(n, req.user.id)) continue;
      if (suppressDailyCheckin && n.kind === 'daily_checkin') continue;
      const occurrence = n.recurrence === 'none' ? null : today;
      const read = pool.query(
        `SELECT dismissed_at, completed_at, seen_at FROM notification_reads
         WHERE notification_id = ? AND user_id = ?
           AND (occurrence_date IS ? OR occurrence_date = ?)`,
        [n.id, req.user.id, occurrence, occurrence],
      ).rows[0];
      if (read?.dismissed_at || read?.completed_at) continue;
      out.push({ ...n, occurrence_date: occurrence });
    }

    res.json({ notifications: out });
  } catch (err) {
    console.error('Active notifications error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Hard-coded whitelist — `field` is interpolated into SQL so we must
// refuse anything outside this set even though all current callers pass
// literals. Protects future refactors from turning a bug into a SQLi.
const READ_FIELDS = new Set(['seen_at', 'dismissed_at', 'completed_at']);

function markRead(notificationId, userId, occurrenceDate, field) {
  if (!READ_FIELDS.has(field)) {
    throw new Error(`markRead: invalid field "${field}"`);
  }
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const existing = pool.query(
    `SELECT id FROM notification_reads
     WHERE notification_id = ? AND user_id = ?
       AND (occurrence_date IS ? OR occurrence_date = ?)`,
    [notificationId, userId, occurrenceDate, occurrenceDate],
  ).rows[0];
  if (existing) {
    pool.query(`UPDATE notification_reads SET ${field} = ? WHERE id = ?`, [now, existing.id]);
  } else {
    pool.query(
      `INSERT INTO notification_reads (notification_id, user_id, occurrence_date, ${field}) VALUES (?, ?, ?, ?)`,
      [notificationId, userId, occurrenceDate, now],
    );
  }
}

router.post('/:id/dismiss', authenticateToken, (req, res) => {
  try {
    const n = pool.query('SELECT recurrence FROM in_app_notifications WHERE id = ?', [req.params.id]).rows[0];
    if (!n) return res.status(404).json({ error: 'Not found' });
    const occ = n.recurrence === 'none' ? null : (req.body?.occurrence_date || todayIso());
    markRead(req.params.id, req.user.id, occ, 'dismissed_at');
    res.json({ ok: true });
  } catch (err) {
    console.error('Dismiss error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// daily_checkin completion: writes the habit_entries row and marks completed.
router.post('/:id/complete-checkin', authenticateToken, (req, res) => {
  try {
    const { sleep_hours, alcohol_units, meditation_minutes, notes } = req.body || {};
    const n = pool.query('SELECT kind, recurrence FROM in_app_notifications WHERE id = ?', [req.params.id]).rows[0];
    if (!n) return res.status(404).json({ error: 'Not found' });
    if (n.kind !== 'daily_checkin') return res.status(400).json({ error: 'Not a daily check-in' });

    const today = todayIso();
    pool.query(
      `INSERT INTO habit_entries (user_id, date, sleep_hours, alcohol_units, meditation_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         sleep_hours = excluded.sleep_hours,
         alcohol_units = excluded.alcohol_units,
         meditation_minutes = excluded.meditation_minutes,
         notes = excluded.notes`,
      [
        req.user.id, today,
        sleep_hours != null ? Number(sleep_hours) : null,
        alcohol_units != null ? Number(alcohol_units) : null,
        meditation_minutes != null ? Number(meditation_minutes) : null,
        typeof notes === 'string' ? notes.trim().slice(0, 500) : null,
      ],
    );
    const occ = n.recurrence === 'none' ? null : today;
    markRead(req.params.id, req.user.id, occ, 'completed_at');
    res.json({ ok: true });
  } catch (err) {
    console.error('Check-in complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Last 30 days of the caller's own habit entries — powers a client-side
// trend card and the coach's client habit history.
router.get('/my-habits', authenticateToken, (req, res) => {
  try {
    const rows = pool.query(
      `SELECT date, sleep_hours, alcohol_units, meditation_minutes, notes
       FROM habit_entries WHERE user_id = ?
       ORDER BY date DESC LIMIT 60`,
      [req.user.id],
    ).rows;
    res.json({ entries: rows });
  } catch (err) {
    console.error('My habits error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Admin endpoints (coach only) ───────────────────────────────────────

router.get('/', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const rows = pool.query(
      `SELECT n.*,
        (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.seen_at IS NOT NULL) as seen_count,
        (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.dismissed_at IS NOT NULL) as dismissed_count,
        (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.completed_at IS NOT NULL) as completed_count
       FROM in_app_notifications n
       ORDER BY n.active DESC, n.created_at DESC`
    ).rows;
    res.json({ notifications: rows });
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'title required' });
    const r = pool.query(
      `INSERT INTO in_app_notifications
        (kind, title, body, cta_label, cta_url, audience, audience_tier_id,
         starts_at, ends_at, recurrence, active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        b.kind || 'announcement',
        b.title,
        b.body || null,
        b.cta_label || null,
        b.cta_url || null,
        b.audience || 'all',
        b.audience === 'tier' ? (b.audience_tier_id || null) : null,
        b.starts_at || null,
        b.ends_at || null,
        b.recurrence || 'none',
        b.active === 0 ? 0 : 1,
        req.user.id,
      ],
    );
    res.json({ id: r.rows[0].id });
  } catch (err) {
    console.error('Notification create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const b = req.body || {};
    const fields = ['kind','title','body','cta_label','cta_url','audience','audience_tier_id','starts_at','ends_at','recurrence','active'];
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(b, f)) {
        sets.push(`${f} = ?`);
        vals.push(b[f]);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push("updated_at = datetime('now')");
    vals.push(req.params.id);
    pool.query(`UPDATE in_app_notifications SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (err) {
    console.error('Notification update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    pool.query('DELETE FROM in_app_notifications WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Notification delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client's habit history — coach view of a specific client's check-in answers.
router.get('/habits/:userId', authenticateToken, requireRole('coach'), requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const rows = pool.query(
      `SELECT date, sleep_hours, alcohol_units, meditation_minutes, notes
       FROM habit_entries WHERE user_id = ?
       ORDER BY date DESC LIMIT 90`,
      [req.params.userId],
    ).rows;
    res.json({ entries: rows });
  } catch (err) {
    console.error('Client habits error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
