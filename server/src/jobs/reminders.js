// Reminder scheduler. Ticks every minute, walks every opted-in client,
// and fires any reminder kind whose target moment matches the user's
// current local time. The actual "delivery" today is just an in-app
// notifications row + a reminder_log entry for idempotency. Once we
// wrap with Capacitor and have native push tokens, deliver() picks up
// extra branches (APNs / FCM dispatch) without changing the rest of
// this file.
//
// Why local-time matching instead of pre-computed UTC due_at: makes
// timezone changes (travel) self-correcting and removes any need for
// daylight-savings recalculation. Trade-off is the runner has to walk
// every opted-in user every minute, but with O(100s) of clients this
// is well within budget.

import pool from '../db/pool.js';

const POLL_INTERVAL_MS = 60 * 1000;       // 1 minute
const TICK_WINDOW_MIN  = 5;               // accept a fire up to N min late
const DEFAULT_TIMEZONE = 'Europe/Dublin'; // Dan-friendly fallback

// Per-kind schedule definition. Each entry says "what time + which
// weekday should this reminder fire" plus the payload to write. Kind
// keys mirror the toggles in client_profiles.reminder_preferences.
//
// weekday: 1-7 ISO (Mon..Sun) or '*' for every day.
// hour/minute: target local time.
// title/body: rendered into the in-app notification when fired.
const SCHEDULE = {
  weekly_checkin: {
    weekday: 1,                     // Monday
    hour: 9, minute: 0,
    title: 'Time for your weekly check-in',
    body: 'Take 2 minutes to log how the week went so we can see your trend.',
    cta_label: 'Open check-in',
    cta_url: '/progress',
  },
  supplement_reminder: {
    weekday: '*',
    hour: 8, minute: 0,
    title: 'Daily supplements',
    body: 'A quick nudge to take your supplement stack for the day.',
    cta_label: 'Open supplements',
    cta_url: '/home',
  },
  workout_reminder: {
    weekday: '*',
    hour: 7, minute: 30,
    title: 'Today\'s session',
    body: 'Your training is ready - hit it before the day gets busy.',
    cta_label: 'Open today',
    cta_url: '/home',
  },
};

// Returns { weekday: 1-7, hour, minute, ymd } for "now" in `tz`.
// 'en-CA' locale gives ISO-style YYYY-MM-DD without juggling parts.
function nowInTz(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value;
  // 'en-CA' formatToParts returns hour as "00".."24" with hour12:false;
  // convert "24" back to 0 for sane wall-clock matching.
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    weekday: wdMap[get('weekday')] || null,
    hour,
    minute,
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

// Returns true if `now` (hour, minute) is within TICK_WINDOW_MIN of
// the schedule target. Catches the case where the server boots a few
// minutes late or a tick is missed because of a long GC.
function withinFireWindow(now, target) {
  const nowMin = now.hour * 60 + now.minute;
  const tgtMin = target.hour * 60 + target.minute;
  const delta = nowMin - tgtMin;
  return delta >= 0 && delta <= TICK_WINDOW_MIN;
}

// Fire a single reminder. Idempotent via the UNIQUE(user, kind, date)
// constraint on reminder_log - a duplicate insert throws and we skip
// the in-app notification step.
function deliver(userId, kind, schedule, ymd) {
  try {
    pool.query(
      `INSERT INTO reminder_log (user_id, reminder_kind, fired_local_date, payload_json)
       VALUES (?, ?, ?, ?)`,
      [userId, kind, ymd, JSON.stringify({ title: schedule.title, body: schedule.body })],
    );
  } catch (err) {
    // SQLITE_CONSTRAINT_UNIQUE means we already fired today - swallow.
    if (/UNIQUE/i.test(err.message || '')) return false;
    throw err;
  }
  // Per-user in-app notification row so the existing /api/notifications/active
  // endpoint surfaces the reminder when the client next opens the app.
  // 'custom' kind keeps this distinct from coach broadcasts.
  pool.query(
    `INSERT INTO in_app_notifications
       (kind, title, body, cta_label, cta_url, audience, audience_user_id, recurrence, active)
     VALUES ('custom', ?, ?, ?, ?, 'user', ?, 'none', 1)`,
    [schedule.title, schedule.body, schedule.cta_label, schedule.cta_url, userId],
  );
  console.log(`[reminders] fired ${kind} for user ${userId} (${ymd})`);
  return true;
}

export function runReminderTick() {
  // Pull everyone with at least one preferences blob. Empty / null is
  // skipped early so we don't burn cycles on coaches or stub accounts.
  const profiles = pool.query(
    `SELECT cp.user_id, cp.reminder_preferences, cp.timezone
       FROM client_profiles cp
       JOIN users u ON u.id = cp.user_id
      WHERE u.role = 'client'
        AND (cp.reminder_preferences IS NOT NULL AND cp.reminder_preferences != '{}')`,
  ).rows;

  for (const p of profiles) {
    let prefs;
    try { prefs = JSON.parse(p.reminder_preferences); }
    catch { continue; }
    const tz = p.timezone || DEFAULT_TIMEZONE;
    const now = nowInTz(tz);
    if (!now.weekday) continue;

    for (const [kind, schedule] of Object.entries(SCHEDULE)) {
      if (!prefs[kind]) continue;
      if (schedule.weekday !== '*' && schedule.weekday !== now.weekday) continue;
      if (!withinFireWindow(now, schedule)) continue;
      try {
        deliver(p.user_id, kind, schedule, now.ymd);
      } catch (err) {
        console.error(`[reminders] deliver ${kind} for user ${p.user_id} failed:`, err);
      }
    }
  }
}

export function startReminderJobRunner() {
  // First run fires 5s after boot to catch any minute we just missed
  // while the server was restarting. Then every POLL_INTERVAL_MS.
  setTimeout(runReminderTick, 5000);
  setInterval(runReminderTick, POLL_INTERVAL_MS);
}
