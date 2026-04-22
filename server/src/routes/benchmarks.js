import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// ── Video upload for benchmark attempts ──────────────────────────────────
// Videos land in data/uploads/benchmarks/ so the cleanup job can target only
// this subdirectory when purging after 7 days. Limit 50MB (phone clips of
// a 3RM or short run are typically well under this).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const benchmarkVideoDir = path.join(__dirname, '..', '..', 'data', 'uploads', 'benchmarks');
fs.mkdirSync(benchmarkVideoDir, { recursive: true });

const VIDEO_MIMES = {
  'video/mp4':        '.mp4',
  'video/quicktime':  '.mov',
  'video/webm':       '.webm',
  'image/jpeg':       '.jpg',   // phone screenshot of a watch / Strava summary
  'image/png':        '.png',
  'image/heic':       '.heic',
};
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, benchmarkVideoDir),
  filename: (req, file, cb) => {
    const ext = VIDEO_MIMES[file.mimetype] || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) =>
    VIDEO_MIMES[file.mimetype] ? cb(null, true) : cb(new Error(`Type not allowed: ${file.mimetype}`)),
});
const runUpload = (handler) => (req, res, next) => {
  handler(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large (max 50MB)'
      : err.message || 'Upload failed';
    res.status(400).json({ error: msg });
  });
};

router.post('/attempts/video', authenticateToken, runUpload(videoUpload.single('file')), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/benchmarks/${req.file.filename}` });
});

// Purge uploaded benchmark videos older than PURGE_AFTER_DAYS. URLs remain;
// only files in our upload dir are touched. Runs on startup + every hour.
const PURGE_AFTER_DAYS = 7;
function purgeOldBenchmarkVideos() {
  try {
    const cutoff = Date.now() - PURGE_AFTER_DAYS * 86400 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(benchmarkVideoDir)) {
      const fp = path.join(benchmarkVideoDir, name);
      const st = fs.statSync(fp);
      if (!st.isFile()) continue;
      if (st.mtimeMs < cutoff) { fs.unlinkSync(fp); removed++; }
    }
    if (removed > 0) console.log(`benchmark videos: purged ${removed} file(s) older than ${PURGE_AFTER_DAYS}d`);
  } catch (err) {
    console.error('Video purge error:', err);
  }
}
purgeOldBenchmarkVideos();
setInterval(purgeOldBenchmarkVideos, 60 * 60 * 1000); // hourly


// ── Helpers ────────────────────────────────────────────────────────────────
const AGE_BUCKETS = [
  { key: '20s', label: '20-29', min: 20, max: 29 },
  { key: '30s', label: '30-39', min: 30, max: 39 },
  { key: '40s', label: '40-49', min: 40, max: 49 },
  { key: '50s', label: '50-59', min: 50, max: 59 },
  { key: '60s', label: '60-69', min: 60, max: 69 },
  { key: '70s', label: '70-79', min: 70, max: 79 },
  { key: '80p', label: '80+',   min: 80, max: 200 },
];

function parseFilters(req) {
  const gender = ['male', 'female'].includes(req.query.gender) ? req.query.gender : null;
  const bucket = AGE_BUCKETS.find(b => b.key === req.query.age) || null;
  return { gender, bucket };
}

function profileFilterSql(gender, bucket) {
  const where = [];
  const params = [];
  if (gender) {
    where.push('LOWER(cp.gender) = ?');
    params.push(gender);
  }
  if (bucket) {
    where.push('cp.age BETWEEN ? AND ?');
    params.push(bucket.min, bucket.max);
  }
  return { clause: where.length ? ' AND ' + where.join(' AND ') : '', params };
}

// Determine a user's current level for a benchmark given their best verified
// (or any, if verified_only=false) value. Returns 0 when no attempts.
function computeLevel(benchmark, levels, userValue, userGender) {
  if (userValue == null || !levels.length) return 0;
  const thresholdKey = userGender === 'female' ? 'female_threshold' : 'male_threshold';
  // Skill ladders have no numeric threshold; level stored on attempt.notes is
  // handled elsewhere. For numeric: walk levels high->low, return first passed.
  const sorted = [...levels].sort((a, b) => b.level_number - a.level_number);
  for (const L of sorted) {
    const target = L[thresholdKey];
    if (target == null) continue;
    const passed = benchmark.direction === 'lower' ? userValue <= target : userValue >= target;
    if (passed) return L.level_number;
  }
  return 0;
}

// ── Client: list all benchmarks grouped by category, with user's current level ──
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const profile = pool.query('SELECT gender FROM client_profiles WHERE user_id = ?', [userId]).rows[0];
    const userGender = profile?.gender?.toLowerCase() || 'male';

    const benchmarks = pool.query(
      'SELECT * FROM benchmarks WHERE visible = 1 ORDER BY category, sort_order, name'
    ).rows;

    const allLevels = pool.query('SELECT * FROM benchmark_levels ORDER BY benchmark_id, level_number').rows;
    const levelsByBm = new Map();
    for (const l of allLevels) {
      if (!levelsByBm.has(l.benchmark_id)) levelsByBm.set(l.benchmark_id, []);
      levelsByBm.get(l.benchmark_id).push(l);
    }

    // User's best verified value per benchmark (for numeric). Use MAX or MIN
    // depending on direction.
    const bestRows = pool.query(
      `SELECT benchmark_id, value, status FROM benchmark_attempts
       WHERE user_id = ? AND status IN ('verified','self_reported')
       ORDER BY submitted_at DESC`,
      [userId]
    ).rows;
    const bestByBm = {};
    for (const row of bestRows) {
      const cur = bestByBm[row.benchmark_id];
      if (!cur) { bestByBm[row.benchmark_id] = row; continue; }
      // "Best" = better of current vs incoming per direction.
    }
    // Re-scan with direction awareness now that we have benchmarks loaded
    const benchmarkById = Object.fromEntries(benchmarks.map(b => [b.id, b]));
    const best = {};
    for (const row of bestRows) {
      const bm = benchmarkById[row.benchmark_id];
      if (!bm) continue;
      const cur = best[row.benchmark_id];
      if (!cur) { best[row.benchmark_id] = row; continue; }
      if (bm.direction === 'lower' ? row.value < cur.value : row.value > cur.value) {
        best[row.benchmark_id] = row;
      }
    }

    const enriched = benchmarks.map(b => {
      const levels = levelsByBm.get(b.id) || [];
      const b_best = best[b.id];
      return {
        ...b,
        requires_video: !!b.requires_video,
        visible: !!b.visible,
        levels,
        best_value: b_best?.value ?? null,
        best_status: b_best?.status ?? null,
        current_level: b.type === 'numeric'
          ? computeLevel(b, levels, b_best?.value, userGender)
          : 0, // skill_ladder level is derived from attempts.notes (level number submitted)
      };
    });

    // Group by category, preserving PDF order
    const CATEGORY_ORDER = ['BURN','LIFT','MOVE','FLEX','NUTRITION','SLEEP'];
    const byCategory = {};
    for (const b of enriched) {
      if (!byCategory[b.category]) byCategory[b.category] = [];
      byCategory[b.category].push(b);
    }
    const categories = CATEGORY_ORDER
      .filter(c => byCategory[c])
      .map(c => ({ category: c, benchmarks: byCategory[c] }));
    // Surface any extras not in the predefined order at the end.
    for (const c of Object.keys(byCategory)) {
      if (!CATEGORY_ORDER.includes(c)) categories.push({ category: c, benchmarks: byCategory[c] });
    }

    // Only surface age buckets that actually have at least one client in
    // them — the client-side chip row hides empty buckets so leaderboards
    // never show "no athletes yet" dead ends for an alpha with ~6 real
    // clients.
    const ageCounts = pool.query(
      "SELECT cp.age FROM client_profiles cp JOIN users u ON u.id = cp.user_id WHERE u.role = 'client' AND cp.age IS NOT NULL"
    ).rows;
    const populatedBucketKeys = new Set();
    for (const { age } of ageCounts) {
      const b = AGE_BUCKETS.find(b => age >= b.min && age <= b.max);
      if (b) populatedBucketKeys.add(b.key);
    }
    const populatedBuckets = AGE_BUCKETS
      .filter(b => populatedBucketKeys.has(b.key))
      .map(b => ({ key: b.key, label: b.label }));

    res.json({
      user_gender: userGender,
      age_buckets: AGE_BUCKETS.map(b => ({ key: b.key, label: b.label })),
      populated_age_buckets: populatedBuckets,
      categories,
    });
  } catch (err) {
    console.error('Benchmarks list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Client: single benchmark detail with levels, user history ─────────────
router.get('/:slug', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const bm = pool.query('SELECT * FROM benchmarks WHERE slug = ?', [req.params.slug]).rows[0];
    if (!bm) return res.status(404).json({ error: 'Not found' });

    const levels = pool.query(
      'SELECT * FROM benchmark_levels WHERE benchmark_id = ? ORDER BY level_number',
      [bm.id]
    ).rows;

    const myAttempts = pool.query(
      `SELECT id, value, notes, video_url, status, submitted_at,
              reviewed_by_user_id, reviewed_at, review_note
       FROM benchmark_attempts WHERE user_id = ? AND benchmark_id = ?
       ORDER BY submitted_at DESC LIMIT 20`,
      [userId, bm.id]
    ).rows;

    res.json({
      benchmark: { ...bm, requires_video: !!bm.requires_video, visible: !!bm.visible },
      levels,
      my_attempts: myAttempts,
    });
  } catch (err) {
    console.error('Benchmark detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Client: submit an attempt ─────────────────────────────────────────────
router.post('/:slug/attempts', authenticateToken, (req, res) => {
  try {
    const bm = pool.query('SELECT * FROM benchmarks WHERE slug = ?', [req.params.slug]).rows[0];
    if (!bm) return res.status(404).json({ error: 'Not found' });

    const { value, notes, video_url } = req.body;
    const num = Number(value);
    if (!Number.isFinite(num)) return res.status(400).json({ error: 'value required' });

    // If a video/URL is required but not provided, fall back to self_reported
    // (still records but won't surface on verified leaderboards).
    const status = bm.requires_video
      ? (video_url ? 'pending_review' : 'self_reported')
      : 'self_reported';

    const r = pool.query(
      `INSERT INTO benchmark_attempts
         (user_id, benchmark_id, value, notes, video_url, status)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.user.id, bm.id, num, notes || null, video_url || null, status]
    );
    res.json({ id: r.rows[0].id, status });
  } catch (err) {
    console.error('Attempt create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Leaderboard: per-benchmark ────────────────────────────────────────────
router.get('/:slug/leaderboard', authenticateToken, (req, res) => {
  try {
    const bm = pool.query('SELECT * FROM benchmarks WHERE slug = ?', [req.params.slug]).rows[0];
    if (!bm) return res.status(404).json({ error: 'Not found' });

    const verifiedOnly = req.query.verified !== '0';
    const { gender, bucket } = parseFilters(req);
    const { clause, params } = profileFilterSql(gender, bucket);

    // Best value per user, direction-aware
    const agg = bm.direction === 'lower' ? 'MIN(a.value)' : 'MAX(a.value)';
    const statusClause = verifiedOnly ? "AND a.status = 'verified'" : "AND a.status IN ('verified','self_reported')";

    const rows = pool.query(`
      SELECT u.id as user_id, u.name, u.avatar_url,
             cp.profile_image_url, cp.age, cp.gender,
             ${agg} as best_value,
             MAX(a.submitted_at) as last_at
      FROM benchmark_attempts a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE a.benchmark_id = ?
        ${statusClause}
        ${clause}
      GROUP BY u.id
      ORDER BY best_value ${bm.direction === 'lower' ? 'ASC' : 'DESC'}
      LIMIT 100
    `, [bm.id, ...params]).rows.map((r, idx) => ({
      ...r,
      rank: idx + 1,
      photo_url: r.profile_image_url || r.avatar_url,
    }));

    res.json({
      benchmark: { ...bm, requires_video: !!bm.requires_video },
      filters: { gender: gender || 'all', age: bucket?.key || 'all', verified_only: verifiedOnly },
      entries: rows,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Leaderboard: Ageless Mover (all-rounder points across all benchmarks) ─
// Points per level: 1/3/6/10/15. Only numeric benchmarks count. Only verified
// and self_reported attempts (pending/rejected excluded). Each benchmark
// contributes the user's BEST attempt's level — direction-aware.
router.get('/leaderboards/ageless-mover', authenticateToken, (req, res) => {
  try {
    const { gender, bucket } = parseFilters(req);
    const { clause, params } = profileFilterSql(gender, bucket);

    // Pull all relevant attempts + benchmarks + levels in-memory, compute level
    // per (user, benchmark) server-side. DB-native path is complex because level
    // threshold depends on the USER'S gender, not a filter.
    const clients = pool.query(`
      SELECT u.id, u.name, u.avatar_url,
             cp.profile_image_url, cp.age, cp.gender
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE u.role = 'client' ${clause}
    `, params).rows;

    const benchmarks = pool.query(
      "SELECT * FROM benchmarks WHERE type = 'numeric' AND visible = 1"
    ).rows;
    const benchmarkById = Object.fromEntries(benchmarks.map(b => [b.id, b]));

    const allLevels = pool.query('SELECT * FROM benchmark_levels').rows;
    const levelsByBm = new Map();
    for (const l of allLevels) {
      if (!levelsByBm.has(l.benchmark_id)) levelsByBm.set(l.benchmark_id, []);
      levelsByBm.get(l.benchmark_id).push(l);
    }

    // Best attempt per (user, benchmark) for verified+self_reported
    const attempts = pool.query(
      `SELECT user_id, benchmark_id, value
       FROM benchmark_attempts
       WHERE status IN ('verified','self_reported')`
    ).rows;
    const bestMap = new Map();
    for (const a of attempts) {
      const bm = benchmarkById[a.benchmark_id];
      if (!bm) continue;
      const key = `${a.user_id}:${a.benchmark_id}`;
      const cur = bestMap.get(key);
      if (!cur || (bm.direction === 'lower' ? a.value < cur.value : a.value > cur.value)) {
        bestMap.set(key, a);
      }
    }

    const POINTS = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 };

    const entries = clients.map(u => {
      const userGender = (u.gender || 'male').toLowerCase();
      let points = 0;
      let tested = 0;
      let sumLevels = 0;
      for (const bm of benchmarks) {
        const best = bestMap.get(`${u.id}:${bm.id}`);
        if (!best) continue;
        const lvl = computeLevel(bm, levelsByBm.get(bm.id) || [], best.value, userGender);
        if (lvl > 0) {
          points += POINTS[lvl] || 0;
          sumLevels += lvl;
          tested++;
        }
      }
      return {
        user_id: u.id,
        name: u.name,
        photo_url: u.profile_image_url || u.avatar_url,
        age: u.age,
        gender: u.gender,
        points,
        tested_count: tested,
        avg_level: tested > 0 ? +(sumLevels / tested).toFixed(1) : 0,
      };
    })
      .filter(e => e.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 100)
      .map((e, idx) => ({ ...e, rank: idx + 1 }));

    res.json({
      filters: { gender: gender || 'all', age: bucket?.key || 'all' },
      max_points: benchmarks.length * 15,
      entries,
    });
  } catch (err) {
    console.error('Ageless Mover error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Leaderboard: streaks ──────────────────────────────────────────────────
router.get('/leaderboards/streaks', authenticateToken, (req, res) => {
  try {
    const { gender, bucket } = parseFilters(req);
    const { clause, params } = profileFilterSql(gender, bucket);
    const rows = pool.query(`
      SELECT u.id as user_id, u.name, u.avatar_url,
             cp.profile_image_url, cp.age, cp.gender,
             COALESCE(s.current_streak, 0) as current_streak,
             COALESCE(s.best_streak, 0) as best_streak,
             s.last_activity_date
      FROM users u
      LEFT JOIN streaks s ON s.user_id = u.id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE u.role = 'client' ${clause}
      ORDER BY current_streak DESC, best_streak DESC
      LIMIT 100
    `, params).rows.map((r, idx) => ({
      ...r,
      rank: idx + 1,
      photo_url: r.profile_image_url || r.avatar_url,
    }));
    res.json({
      filters: { gender: gender || 'all', age: bucket?.key || 'all' },
      entries: rows,
    });
  } catch (err) {
    console.error('Streaks leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Leaderboard: steps (timeframe-aware) ──────────────────────────────────
router.get('/leaderboards/steps', authenticateToken, (req, res) => {
  try {
    const timeframe = ['today', 'week', 'month', 'all'].includes(req.query.timeframe)
      ? req.query.timeframe : 'week';
    const { gender, bucket } = parseFilters(req);
    const { clause, params } = profileFilterSql(gender, bucket);

    const today = new Date().toISOString().split('T')[0];
    let dateClause = '';
    if (timeframe === 'today') { dateClause = `AND sl.date = '${today}'`; }
    else if (timeframe === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      dateClause = `AND sl.date >= '${d.toISOString().split('T')[0]}'`;
    } else if (timeframe === 'month') {
      const d = new Date(); d.setDate(d.getDate() - 29);
      dateClause = `AND sl.date >= '${d.toISOString().split('T')[0]}'`;
    }

    const rows = pool.query(`
      SELECT u.id as user_id, u.name, u.avatar_url,
             cp.profile_image_url, cp.age, cp.gender,
             COALESCE(SUM(sl.steps), 0) as total_steps,
             COUNT(sl.id) as days_logged
      FROM users u
      LEFT JOIN step_logs sl ON sl.user_id = u.id ${dateClause}
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE u.role = 'client' ${clause}
      GROUP BY u.id
      HAVING total_steps > 0
      ORDER BY total_steps DESC
      LIMIT 100
    `, params).rows.map((r, idx) => ({
      ...r,
      rank: idx + 1,
      photo_url: r.profile_image_url || r.avatar_url,
    }));

    res.json({
      timeframe,
      filters: { gender: gender || 'all', age: bucket?.key || 'all' },
      entries: rows,
    });
  } catch (err) {
    console.error('Steps leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Coach: review queue + approve/reject ──────────────────────────────────
// scope=mine (default) — only clients assigned to this coach.
// scope=all             — every coach's pending submissions, plus unassigned.
router.get('/coach/review-queue', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const scope = req.query.scope === 'all' ? 'all' : 'mine';
    const coachId = req.user.id;

    const baseQuery = `
      SELECT a.*, b.name as benchmark_name, b.slug as benchmark_slug,
             b.unit, b.direction, b.type,
             u.name as client_name, u.avatar_url, u.coach_id,
             cp.profile_image_url,
             coach.name as coach_name
      FROM benchmark_attempts a
      JOIN benchmarks b ON b.id = a.benchmark_id
      JOIN users u ON u.id = a.user_id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      LEFT JOIN users coach ON coach.id = u.coach_id
      WHERE a.status = 'pending_review'
    `;

    // "Mine" = clients assigned to this coach OR unassigned (no coach_id yet).
    const rows = pool.query(
      scope === 'mine'
        ? `${baseQuery} AND (u.coach_id = ? OR u.coach_id IS NULL) ORDER BY a.submitted_at ASC`
        : `${baseQuery} ORDER BY a.submitted_at ASC`,
      scope === 'mine' ? [coachId] : []
    ).rows.map(r => ({ ...r, photo_url: r.profile_image_url || r.avatar_url }));

    // Counts for both scopes so the UI can show "Mine N · All N" without two calls.
    const mineCount = pool.query(
      `SELECT COUNT(*) c FROM benchmark_attempts a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'pending_review' AND (u.coach_id = ? OR u.coach_id IS NULL)`,
      [coachId]
    ).rows[0].c;
    const allCount = pool.query(
      `SELECT COUNT(*) c FROM benchmark_attempts WHERE status = 'pending_review'`
    ).rows[0].c;

    res.json({
      pending: rows,
      scope,
      counts: { mine: mineCount, all: allCount },
    });
  } catch (err) {
    console.error('Review queue error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-client benchmark summary for coach view (on ClientProfile).
// Returns: categories with benchmarks + that client's current level + best
// value, plus their Ageless Mover points + rank, plus recent attempts.
router.get('/coach/clients/:id/summary', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const user = pool.query("SELECT id FROM users WHERE id = ? AND role = 'client'", [clientId]).rows[0];
    if (!user) return res.status(404).json({ error: 'Client not found' });

    const profile = pool.query('SELECT gender FROM client_profiles WHERE user_id = ?', [clientId]).rows[0];
    const userGender = (profile?.gender || 'male').toLowerCase();

    const benchmarks = pool.query(
      'SELECT * FROM benchmarks WHERE visible = 1 ORDER BY category, sort_order, name'
    ).rows;

    const allLevels = pool.query('SELECT * FROM benchmark_levels ORDER BY benchmark_id, level_number').rows;
    const levelsByBm = new Map();
    for (const l of allLevels) {
      if (!levelsByBm.has(l.benchmark_id)) levelsByBm.set(l.benchmark_id, []);
      levelsByBm.get(l.benchmark_id).push(l);
    }

    const clientAttempts = pool.query(
      `SELECT benchmark_id, value, status, submitted_at
       FROM benchmark_attempts
       WHERE user_id = ? AND status IN ('verified','self_reported')
       ORDER BY submitted_at DESC`,
      [clientId]
    ).rows;

    const benchmarkById = Object.fromEntries(benchmarks.map(b => [b.id, b]));
    const best = {};
    const mostRecent = {};
    for (const a of clientAttempts) {
      const bm = benchmarkById[a.benchmark_id];
      if (!bm) continue;
      const cur = best[a.benchmark_id];
      if (!cur || (bm.direction === 'lower' ? a.value < cur.value : a.value > cur.value)) {
        best[a.benchmark_id] = a;
      }
      if (!mostRecent[a.benchmark_id]) mostRecent[a.benchmark_id] = a.submitted_at;
    }

    const POINTS = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 };
    let totalPoints = 0;
    let testedCount = 0;

    const enriched = benchmarks.map(b => {
      const levels = levelsByBm.get(b.id) || [];
      const b_best = best[b.id];
      const lvl = b.type === 'numeric'
        ? computeLevel(b, levels, b_best?.value, userGender)
        : 0;
      if (b.type === 'numeric' && lvl > 0) {
        totalPoints += POINTS[lvl] || 0;
        testedCount++;
      }
      return {
        id: b.id, slug: b.slug, name: b.name, category: b.category, subcategory: b.subcategory,
        unit: b.unit, direction: b.direction, type: b.type, icon: b.icon,
        best_value: b_best?.value ?? null,
        best_status: b_best?.status ?? null,
        current_level: lvl,
        last_submitted_at: mostRecent[b.id] || null,
      };
    });

    // Rank on Ageless Mover board
    const allScores = pool.query(`
      SELECT a.user_id, a.value, b.id as benchmark_id, b.direction
      FROM benchmark_attempts a
      JOIN benchmarks b ON b.id = a.benchmark_id
      WHERE a.status IN ('verified','self_reported') AND b.type = 'numeric' AND b.visible = 1
    `).rows;
    const byUser = new Map();
    for (const r of allScores) {
      const key = `${r.user_id}:${r.benchmark_id}`;
      const cur = byUser.get(key);
      if (!cur || (r.direction === 'lower' ? r.value < cur.value : r.value > cur.value)) {
        byUser.set(key, r);
      }
    }
    const userGenders = Object.fromEntries(
      pool.query(`SELECT cp.user_id, COALESCE(cp.gender, 'male') as gender FROM client_profiles cp`).rows
        .map(r => [r.user_id, (r.gender || 'male').toLowerCase()])
    );
    const userPts = new Map();
    for (const [key, row] of byUser) {
      const [uid, bid] = key.split(':').map(Number);
      const bm = benchmarkById[bid];
      const g = userGenders[uid] || 'male';
      const lvl = computeLevel(bm, levelsByBm.get(bid) || [], row.value, g);
      if (lvl > 0) userPts.set(uid, (userPts.get(uid) || 0) + (POINTS[lvl] || 0));
    }
    const sorted = [...userPts.entries()].sort((a, b) => b[1] - a[1]);
    const rank = sorted.findIndex(([uid]) => uid === clientId);

    // Group by category for the UI
    const CATEGORY_ORDER = ['BURN','LIFT','MOVE','FLEX','NUTRITION','SLEEP'];
    const byCategory = {};
    for (const b of enriched) {
      if (!byCategory[b.category]) byCategory[b.category] = [];
      byCategory[b.category].push(b);
    }
    const categories = CATEGORY_ORDER
      .filter(c => byCategory[c])
      .map(c => {
        const items = byCategory[c];
        const tested = items.filter(b => b.current_level > 0);
        return {
          category: c,
          benchmarks: items,
          tested_count: tested.length,
          total_count: items.length,
          avg_level: tested.length > 0
            ? +(tested.reduce((s, b) => s + b.current_level, 0) / tested.length).toFixed(1)
            : 0,
        };
      });

    res.json({
      client_id: clientId,
      gender: userGender,
      ageless_mover: {
        points: totalPoints,
        tested_count: testedCount,
        rank: rank >= 0 ? rank + 1 : null,
        total_athletes: sorted.length,
      },
      categories,
    });
  } catch (err) {
    console.error('Client summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Batch update all levels for a benchmark. Coach-only. Replaces existing rows
// in-place by level_number (no re-numbering). Thresholds can be null (skill
// ladder) or a numeric value.
router.put('/coach/benchmarks/:id/levels', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const bmId = parseInt(req.params.id);
    const bm = pool.query('SELECT id FROM benchmarks WHERE id = ?', [bmId]).rows[0];
    if (!bm) return res.status(404).json({ error: 'Benchmark not found' });
    const { levels } = req.body || {};
    if (!Array.isArray(levels)) return res.status(400).json({ error: 'levels[] required' });

    for (const L of levels) {
      const n = parseInt(L.level_number);
      if (!Number.isFinite(n)) continue;
      const existing = pool.query(
        'SELECT id FROM benchmark_levels WHERE benchmark_id = ? AND level_number = ?',
        [bmId, n]
      ).rows[0];
      if (existing) {
        pool.query(
          `UPDATE benchmark_levels
             SET title = ?, description = ?, male_threshold = ?, female_threshold = ?
           WHERE id = ?`,
          [L.title || null, L.description || null,
           L.male_threshold == null ? null : Number(L.male_threshold),
           L.female_threshold == null ? null : Number(L.female_threshold),
           existing.id]
        );
      } else {
        pool.query(
          `INSERT INTO benchmark_levels
             (benchmark_id, level_number, title, description, male_threshold, female_threshold)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [bmId, n, L.title || null, L.description || null,
           L.male_threshold == null ? null : Number(L.male_threshold),
           L.female_threshold == null ? null : Number(L.female_threshold)]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Level update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/coach/attempts/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const { status, review_note } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be verified or rejected' });
    }
    const existing = pool.query('SELECT id FROM benchmark_attempts WHERE id = ?', [req.params.id]).rows[0];
    if (!existing) return res.status(404).json({ error: 'Not found' });
    pool.query(
      `UPDATE benchmark_attempts
       SET status = ?, reviewed_by_user_id = ?, reviewed_at = datetime('now'), review_note = ?
       WHERE id = ?`,
      [status, req.user.id, review_note || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Attempt review error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
