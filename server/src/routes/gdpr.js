import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

// GDPR self-service (SECURITY.md L5): the signed-in user can export all of
// their personal data (Art. 20 portability) and permanently delete their
// account (Art. 17 erasure). Everything here is strictly scoped to
// req.user.id - a user can only export/delete themselves.
const router = Router();

// ── Export ────────────────────────────────────────────────────────────────
router.get('/export', authenticateToken, (req, res) => {
  try {
    const uid = req.user.id;
    const mine = (sql) => pool.query(sql, [uid]).rows;
    const data = {
      exported_at: new Date().toISOString(),
      account: pool.query('SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?', [uid]).rows[0],
      profile: pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [uid]).rows[0] || null,
      onboarding_answers: pool.query('SELECT * FROM onboarding_answers WHERE user_id = ?', [uid]).rows[0] || null,
      checkins: mine('SELECT * FROM checkins WHERE user_id = ?'),
      goals: mine('SELECT * FROM goals WHERE user_id = ?'),
      workout_logs: mine('SELECT * FROM workout_logs WHERE user_id = ?'),
      nutrition_logs: mine('SELECT * FROM nutrition_logs WHERE user_id = ?'),
      water_logs: mine('SELECT * FROM water_logs WHERE user_id = ?'),
      step_logs: mine('SELECT * FROM step_logs WHERE user_id = ?'),
      habit_entries: mine('SELECT * FROM habit_entries WHERE user_id = ?'),
      benchmark_attempts: mine('SELECT * FROM benchmark_attempts WHERE user_id = ?'),
      pain_issues: mine('SELECT * FROM pain_issues WHERE user_id = ?'),
      consents: mine('SELECT kind, version, consented_at, ip FROM user_consents WHERE user_id = ?'),
      goals_and_tasks: mine('SELECT * FROM tasks WHERE client_id = ?'),
      messages_sent: pool.query('SELECT id, conversation_id, content, created_at FROM messages WHERE sender_id = ?', [uid]).rows,
      coach_notes_about_me: pool.query('SELECT title, content, created_at FROM coach_notes WHERE client_id = ?', [uid]).rows,
    };
    res.setHeader('Content-Disposition', `attachment; filename="ageless-data-export-${uid}.json"`);
    res.json(data);
  } catch (err) {
    console.error('GDPR export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Deletion ────────────────────────────────────────────────────────────────
// Every table holding the user's personal data. Deleted before the users row
// so foreign-key checks (PRAGMA foreign_keys = ON) don't block the erasure.
// Wrapped per-statement so a table absent in some schema variant is skipped.
const CHILD_DELETES = [
  ['exercise_logs', 'workout_log_id IN (SELECT id FROM workout_logs WHERE user_id = ?)'],
  ['pain_entries', 'issue_id IN (SELECT id FROM pain_issues WHERE user_id = ?)'],
  ['workout_logs', 'user_id = ?'],
  ['nutrition_logs', 'user_id = ?'],
  ['water_logs', 'user_id = ?'],
  ['step_logs', 'user_id = ?'],
  ['habit_entries', 'user_id = ?'],
  ['checkins', 'user_id = ?'],
  ['goals', 'user_id = ?'],
  ['streaks', 'user_id = ?'],
  ['client_programs', 'user_id = ?'],
  ['task_completions', 'user_id = ?'],
  ['tasks', 'client_id = ?'],
  ['favourites', 'user_id = ?'],
  ['login_events', 'user_id = ?'],
  ['access_log', 'user_id = ?'],
  ['benchmark_attempts', 'user_id = ?'],
  ['supplement_logs', 'user_id = ?'],
  ['quiz_attempts', 'user_id = ?'],
  ['assessment_responses', 'user_id = ?'],
  ['pain_issues', 'user_id = ?'],
  ['onboarding_tasks', 'user_id = ?'],
  ['onboarding_answers', 'user_id = ?'],
  ['post_signup_tasks', 'user_id = ?'],
  ['workout_reschedules', 'user_id = ?'],
  ['user_rest_days', 'user_id = ?'],
  ['user_workout_overrides', 'user_id = ?'],
  ['notification_reads', 'user_id = ?'],
  ['message_reactions', 'user_id = ?'],
  ['messages', 'sender_id = ?'],
  ['conversation_members', 'user_id = ?'],
  ['coach_notes', 'client_id = ?'],
  ['client_meal_schedules', 'user_id = ?'],
  ['user_scheduled_workouts', 'user_id = ?'],
  ['workout_suppressions', 'user_id = ?'],
  ['app_feedback', 'user_id = ?'],
  ['client_tags', 'client_id = ?'],
  ['password_reset_tokens', 'user_id = ?'],
  ['user_purchases', 'user_id = ?'],
  ['coach_bookings', 'client_user_id = ?'],
  ['coach_event_registrations', 'user_id = ?'],
  ['workouts', 'owner_user_id = ?'],
  ['client_profiles', 'user_id = ?'],
  ['coach_profiles', 'user_id = ?'],
  ['sessions', 'user_id = ?'],
];

// Reference columns to NULL out (not delete) so deleting the row doesn't
// orphan-block - covers the coach-being-removed case (their clients, the
// content/reviews they authored stay, just detached).
const DETACH = [
  ['users', 'coach_id'],
  ['in_app_notifications', 'created_by'],
  ['coach_notes', 'coach_id'],
  ['tasks', 'coach_id'],
  ['benchmark_attempts', 'reviewed_by_user_id'],
  ['password_reset_tokens', 'created_by'],
  ['programs', 'coach_id'],
];

router.delete('/me', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.id;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to confirm account deletion' });

    const user = pool.query('SELECT password_hash FROM users WHERE id = ?', [uid]).rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(403).json({ error: 'Password is incorrect' });

    for (const [table, col] of DETACH) {
      try { pool.query(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = ?`, [uid]); } catch { /* skip */ }
    }
    for (const [table, cond] of CHILD_DELETES) {
      try { pool.query(`DELETE FROM ${table} WHERE ${cond}`, [uid]); } catch { /* table absent in this schema */ }
    }
    pool.query('DELETE FROM users WHERE id = ?', [uid]);

    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('GDPR delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
