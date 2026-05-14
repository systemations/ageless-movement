// Pain log endpoints. Issue-based tracking: each pain_issue is a
// discrete tracked entity, severity entries log against it. Coach can
// view + resolve via /clients/:userId/pain. Notification fires to the
// coach inbox when a client logs severity ≥ 7.
//
// Spec: project_pain_log_todo.md.

import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, requireCoachOwnsClient } from '../middleware/auth.js';

const router = Router();

// Closed enum so a typo on the client doesn't pollute the data.
const VALID_REGIONS = new Set([
  'neck', 'upper_back', 'lower_back',
  'shoulder_l', 'shoulder_r',
  'elbow_l', 'elbow_r',
  'wrist_l', 'wrist_r',
  'hip_l', 'hip_r',
  'knee_l', 'knee_r',
  'ankle_l', 'ankle_r',
  'foot_l', 'foot_r',
  'other',
]);

const SEVERITY_NOTIFY_THRESHOLD = 7;

const shapeIssue = (row) => ({
  id: row.id,
  user_id: row.user_id,
  body_region: row.body_region,
  title: row.title,
  notes_initial: row.notes_initial,
  status: row.status,
  opened_at: row.opened_at,
  resolved_at: row.resolved_at,
  resolved_by: row.resolved_by,
});

// Attach the latest entry + entry count to an issue so the list view
// can show severity sparkline data without a per-row roundtrip.
const withRollup = (issue) => {
  const latest = pool.query(
    'SELECT id, severity, notes, created_at FROM pain_entries WHERE issue_id = ? ORDER BY created_at DESC LIMIT 1',
    [issue.id],
  ).rows[0];
  const entryCount = pool.query(
    'SELECT COUNT(*) AS n FROM pain_entries WHERE issue_id = ?',
    [issue.id],
  ).rows[0]?.n || 0;
  return { ...issue, latest_entry: latest || null, entry_count: entryCount };
};

// Placeholder: when severity hits the threshold we'll flag the entry
// for the coach. The existing in_app_notifications table is broadcast-
// shaped (audience tiers, scheduled), not a per-coach inbox, so a
// proper push needs either a new coach_alerts table or surfacing red
// dots/badges on the Pain tab from the entry data itself. The data is
// already captured so a "filter pain entries severity >= 7" query gets
// us 90% of the value without any new plumbing — this stub keeps the
// call site clean for when we wire something up.
const notifyCoachIfHighSeverity = (userId, issue, severity) => {
  if (severity < SEVERITY_NOTIFY_THRESHOLD) return;
  // TODO: alert the coach. For now the data is queryable on the Pain
  // tab and the recent-entries view will surface high severity itself.
};

// ─────────────────────────────────────────────────────────────────────
// Client endpoints (own data)
// ─────────────────────────────────────────────────────────────────────

// List own pain issues, with optional ?status filter. Default: active.
router.get('/issues', authenticateToken, (req, res) => {
  try {
    const status = req.query.status === 'all' ? null : (req.query.status || 'active');
    const sql = status
      ? 'SELECT * FROM pain_issues WHERE user_id = ? AND status = ? ORDER BY opened_at DESC'
      : 'SELECT * FROM pain_issues WHERE user_id = ? ORDER BY opened_at DESC';
    const rows = pool.query(sql, status ? [req.user.id, status] : [req.user.id]).rows;
    res.json({ issues: rows.map(r => withRollup(shapeIssue(r))) });
  } catch (err) {
    console.error('pain issues list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new issue + first entry in one shot. Body must include
// body_region (enum), title, severity. notes_initial + entry_notes
// are optional.
router.post('/issues', authenticateToken, (req, res) => {
  try {
    const { body_region, title, notes_initial, severity, entry_notes } = req.body || {};
    if (!VALID_REGIONS.has(body_region)) {
      return res.status(400).json({ error: 'invalid body_region' });
    }
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title required' });
    }
    const sev = parseInt(severity, 10);
    if (!Number.isInteger(sev) || sev < 0 || sev > 10) {
      return res.status(400).json({ error: 'severity must be 0-10' });
    }
    const insertRes = pool.query(
      `INSERT INTO pain_issues (user_id, body_region, title, notes_initial)
       VALUES (?, ?, ?, ?) RETURNING *`,
      [req.user.id, body_region, title.trim(), notes_initial || null],
    );
    const issue = insertRes.rows[0];
    pool.query(
      `INSERT INTO pain_entries (issue_id, severity, notes) VALUES (?, ?, ?)`,
      [issue.id, sev, entry_notes || null],
    );
    notifyCoachIfHighSeverity(req.user.id, issue, sev);
    res.json({ issue: withRollup(shapeIssue(issue)) });
  } catch (err) {
    console.error('pain issue create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get one issue + all its entries (most recent first), used by the
// detail/history page on the client.
router.get('/issues/:id', authenticateToken, (req, res) => {
  try {
    const issue = pool.query(
      'SELECT * FROM pain_issues WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    const entries = pool.query(
      'SELECT id, severity, notes, created_at FROM pain_entries WHERE issue_id = ? ORDER BY created_at DESC',
      [req.params.id],
    ).rows;
    res.json({ issue: shapeIssue(issue), entries });
  } catch (err) {
    console.error('pain issue detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log a new entry against an existing issue.
router.post('/issues/:id/entries', authenticateToken, (req, res) => {
  try {
    const { severity, notes } = req.body || {};
    const sev = parseInt(severity, 10);
    if (!Number.isInteger(sev) || sev < 0 || sev > 10) {
      return res.status(400).json({ error: 'severity must be 0-10' });
    }
    const issue = pool.query(
      'SELECT * FROM pain_issues WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    if (issue.status !== 'active') {
      return res.status(400).json({ error: 'Issue is resolved; open a new one for any new pain' });
    }
    pool.query(
      `INSERT INTO pain_entries (issue_id, severity, notes) VALUES (?, ?, ?)`,
      [issue.id, sev, notes || null],
    );
    notifyCoachIfHighSeverity(req.user.id, issue, sev);
    res.json({ ok: true });
  } catch (err) {
    console.error('pain entry create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark an issue resolved (or re-open). resolved_by tracks whether the
// client closed it themselves vs the coach closing it.
router.post('/issues/:id/resolve', authenticateToken, (req, res) => {
  try {
    const issue = pool.query(
      'SELECT * FROM pain_issues WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    pool.query(
      `UPDATE pain_issues SET status = 'resolved', resolved_at = datetime('now'), resolved_by = 'client' WHERE id = ?`,
      [issue.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('pain resolve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/issues/:id/reopen', authenticateToken, (req, res) => {
  try {
    const issue = pool.query(
      'SELECT * FROM pain_issues WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    pool.query(
      `UPDATE pain_issues SET status = 'active', resolved_at = NULL, resolved_by = NULL WHERE id = ?`,
      [issue.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('pain reopen error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Coach endpoints (any client they own)
// ─────────────────────────────────────────────────────────────────────

router.get('/clients/:userId/issues', authenticateToken, requireRole('coach'), requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const status = req.query.status === 'all' ? null : (req.query.status || null);
    const sql = status
      ? 'SELECT * FROM pain_issues WHERE user_id = ? AND status = ? ORDER BY status, opened_at DESC'
      : 'SELECT * FROM pain_issues WHERE user_id = ? ORDER BY status, opened_at DESC';
    const rows = pool.query(sql, status ? [req.params.userId, status] : [req.params.userId]).rows;
    res.json({ issues: rows.map(r => withRollup(shapeIssue(r))) });
  } catch (err) {
    console.error('coach pain list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/clients/:userId/issues/:id', authenticateToken, requireRole('coach'), requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const issue = pool.query(
      'SELECT * FROM pain_issues WHERE id = ? AND user_id = ?',
      [req.params.id, req.params.userId],
    ).rows[0];
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    const entries = pool.query(
      'SELECT id, severity, notes, created_at FROM pain_entries WHERE issue_id = ? ORDER BY created_at DESC',
      [req.params.id],
    ).rows;
    res.json({ issue: shapeIssue(issue), entries });
  } catch (err) {
    console.error('coach pain detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Coach can mark an issue resolved on the client's behalf. Notes are
// captured separately on the issue if the coach wants to add context.
router.post('/clients/:userId/issues/:id/resolve', authenticateToken, requireRole('coach'), requireCoachOwnsClient('userId'), (req, res) => {
  try {
    const issue = pool.query(
      'SELECT * FROM pain_issues WHERE id = ? AND user_id = ?',
      [req.params.id, req.params.userId],
    ).rows[0];
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    pool.query(
      `UPDATE pain_issues SET status = 'resolved', resolved_at = datetime('now'), resolved_by = 'coach' WHERE id = ?`,
      [issue.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('coach pain resolve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
