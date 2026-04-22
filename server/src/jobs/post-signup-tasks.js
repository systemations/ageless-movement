import pool from '../db/pool.js';

// Post-signup task runner. Keeps deferred work outside the request/response
// cycle so a slow DM insert or notification write never blocks the register
// POST. Tasks are persisted to the post_signup_tasks table so a restart
// within the due window doesn't drop pending work.
//
// Supported task types:
//   'welcome_dm'   drop a DM from Dan into the client's team inbox
//   'plans_nudge'  insert a per-user in_app_notifications row pointing at /plans
//
// To add a new task type: register a handler below + enqueue from wherever.

const COACH_DAN_EMAIL = 'danny@handsdan.com';
const POLL_INTERVAL_MS = 60 * 1000;

const WELCOME_DM_DELAY_MS = 5 * 60 * 1000;       // 5 min after signup
const PLANS_NUDGE_DELAY_MS = 24 * 60 * 60 * 1000; // 24h after signup

function nowSqlite() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function addMsSqlite(ms) {
  return new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function queuePostSignupTasks(userId) {
  const ins = 'INSERT INTO post_signup_tasks (user_id, task_type, due_at) VALUES (?, ?, ?)';
  pool.query(ins, [userId, 'welcome_dm', addMsSqlite(WELCOME_DM_DELAY_MS)]);
  pool.query(ins, [userId, 'plans_nudge', addMsSqlite(PLANS_NUDGE_DELAY_MS)]);
}

// Finds (or creates) the team-inbox conversation for a client and returns
// its id. Mirrors the logic in messaging.js/ensureClientTeamInboxes but
// scoped to a single client, so we can fire the welcome DM before the
// client has loaded their inbox for the first time.
function getOrCreateTeamInbox(clientUserId) {
  const client = pool.query('SELECT id, name FROM users WHERE id = ?', [clientUserId]).rows[0];
  if (!client) return null;

  let convo = pool.query('SELECT id FROM conversations WHERE client_id = ? LIMIT 1', [clientUserId]).rows[0];
  if (!convo) {
    const res = pool.query(
      "INSERT INTO conversations (type, client_id, title) VALUES ('group', ?, ?) RETURNING id",
      [clientUserId, client.name],
    );
    convo = { id: res.rows[0].id };
  }

  // Make sure the client + all coaches are members
  pool.query('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convo.id, clientUserId]);
  const coaches = pool.query("SELECT id FROM users WHERE role = 'coach'").rows;
  for (const c of coaches) {
    pool.query('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convo.id, c.id]);
  }
  return convo.id;
}

function runWelcomeDm(task) {
  const client = pool.query('SELECT id, name FROM users WHERE id = ?', [task.user_id]).rows[0];
  if (!client) return; // account gone; skip silently

  const dan = pool.query('SELECT id FROM users WHERE email = ?', [COACH_DAN_EMAIL]).rows[0];
  if (!dan) {
    console.warn(`[post-signup] welcome_dm skipped: no coach found at ${COACH_DAN_EMAIL}`);
    return;
  }

  const conversationId = getOrCreateTeamInbox(client.id);
  if (!conversationId) return;

  const firstName = (client.name || '').split(' ')[0] || 'there';
  const body = `Hey ${firstName}, welcome in. I'm Dan. If you've got questions or want a hand finding the right place to start, just reply here.`;

  pool.query(
    'INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES (?, ?, ?, ?)',
    [conversationId, dan.id, body, 'text'],
  );
}

function runPlansNudge(task) {
  const client = pool.query('SELECT id FROM users WHERE id = ?', [task.user_id]).rows[0];
  if (!client) return;

  pool.query(
    `INSERT INTO in_app_notifications
      (kind, title, body, cta_label, cta_url, audience, audience_user_id,
       starts_at, recurrence, active, created_by)
     VALUES ('announcement', ?, ?, ?, ?, 'user', ?, ?, 'none', 1, NULL)`,
    [
      'Ready to unlock more?',
      "See what's in the full library and compare plans.",
      'Explore Plans',
      '/plans',
      client.id,
      nowSqlite(),
    ],
  );
}

const HANDLERS = {
  welcome_dm: runWelcomeDm,
  plans_nudge: runPlansNudge,
};

export function runPostSignupJobs() {
  const due = pool.query(
    `SELECT * FROM post_signup_tasks
     WHERE sent_at IS NULL AND due_at <= datetime('now')
     ORDER BY due_at ASC
     LIMIT 50`,
  ).rows;

  for (const task of due) {
    const handler = HANDLERS[task.task_type];
    if (!handler) {
      console.warn(`[post-signup] unknown task_type "${task.task_type}" (id=${task.id}); marking sent to avoid retry loop`);
      pool.query('UPDATE post_signup_tasks SET sent_at = datetime(\'now\') WHERE id = ?', [task.id]);
      continue;
    }
    try {
      handler(task);
      pool.query('UPDATE post_signup_tasks SET sent_at = datetime(\'now\') WHERE id = ?', [task.id]);
    } catch (err) {
      console.error(`[post-signup] task ${task.id} (${task.task_type}) failed:`, err);
      // Leave sent_at null so the next poll retries. Consider adding a
      // fail_count column if retry storms become a problem.
    }
  }
}

export function startPostSignupJobRunner() {
  // Run once on boot to catch anything that went overdue while the server
  // was down, then every POLL_INTERVAL_MS after that.
  setTimeout(runPostSignupJobs, 5000);
  setInterval(runPostSignupJobs, POLL_INTERVAL_MS);
}
