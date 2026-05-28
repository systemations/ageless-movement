import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole, checkCoachOwnsClient } from '../middleware/auth.js';

const router = Router();

// Client-built workouts. A client builds a block-based workout in
// client/src/pages/client/BuildWorkout.jsx; it persists as a normal `workouts`
// row stamped with owner_user_id (so it stays private and out of coach library
// lists) plus its workout_exercises/meta, and is favourited so it surfaces in
// the client's Favourites to schedule/play like any other workout. The builder
// block structure (formats + per-block timer settings + rest) is mirrored into
// workouts.block_settings JSON so the builder can round-trip on edit.

// Builder display label -> canonical group_type id stored on workout_exercises.
// Matches the lowercase ids the WorkoutPlayer / WorkoutBuilder palette use so
// the player groups + colours blocks correctly. 'Straight Set' -> null (a plain
// single exercise, same as the coach 'standard' block).
const TYPE_TO_ID = {
  'Warmup': 'warmup',
  'Straight Set': null,
  'Superset': 'superset',
  'Tri-set': 'triset',
  'Giant Set': 'giant',
  'Circuit': 'circuit',
  'AMRAP': 'amrap',
  'Tabata': 'tabata',
  'EMOM': 'emom',
  'For Time': 'fortime',
};
const ID_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_ID).map(([label, id]) => [id ?? 'standard', label]),
);
const letter = (i) => String.fromCharCode(65 + (i % 26));
// '1:00' -> 60, '0:45' -> 45, '' -> null.
const restToSecs = (v) => {
  if (!v) return null;
  const [m, s] = String(v).split(':').map(Number);
  if (Number.isNaN(m)) return null;
  return m * 60 + (s || 0);
};
const secsToRest = (n) => {
  if (n == null) return '';
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

// Persist a built workout's blocks into workout_exercises (+meta) and capture
// the builder structure into block_settings JSON. Shared by create + update.
function writeBlocks(workoutId, blocks) {
  const blockMeta = [];
  let order = 0;
  blocks.forEach((block, bi) => {
    const groupType = TYPE_TO_ID[block.type] ?? null;
    const groupLabel = letter(bi);
    blockMeta.push({
      label: groupLabel,
      type: block.type,
      settings: block.settings || {},
      restAfter: block.restAfter || '',
    });
    (block.exercises || []).forEach((ex) => {
      const timeBased = ex.measure === 'time';
      const inserted = pool.query(
        `INSERT INTO workout_exercises
           (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          workoutId,
          ex.id,
          order++,
          parseInt(ex.sets, 10) || 1,
          timeBased ? null : (ex.reps || '10'),
          timeBased ? (Number(ex.time) || null) : null,
          restToSecs(ex.restAfter),
          groupType,
          groupLabel,
          ex.notes || null,
        ],
      ).rows[0];
      pool.query(
        `INSERT INTO workout_exercise_meta
           (workout_exercise_id, tempo, rir, rpe, time_based, duration_secs, tracking_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          inserted.id,
          ex.tempo || null,
          ex.rir !== '' && ex.rir != null ? Number(ex.rir) : null,
          ex.rpe !== '' && ex.rpe != null ? Number(ex.rpe) : null,
          timeBased ? 1 : 0,
          timeBased ? (Number(ex.time) || null) : null,
          timeBased ? 'duration' : 'reps',
        ],
      );
    });
  });
  pool.query('UPDATE workouts SET block_settings = ? WHERE id = ?', [JSON.stringify(blockMeta), workoutId]);
}

function clearBlocks(workoutId) {
  const ids = pool.query('SELECT id FROM workout_exercises WHERE workout_id = ?', [workoutId]).rows;
  for (const { id } of ids) {
    pool.query('DELETE FROM workout_exercise_meta WHERE workout_exercise_id = ?', [id]);
  }
  pool.query('DELETE FROM workout_exercises WHERE workout_id = ?', [workoutId]);
}

const totalExercises = (blocks) => (blocks || []).reduce((n, b) => n + (b.exercises?.length || 0), 0);

// POST /api/my-workouts  { title, blocks }
router.post('/', authenticateToken, (req, res) => {
  try {
    const { title, blocks } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    if (!Array.isArray(blocks) || totalExercises(blocks) === 0) {
      return res.status(400).json({ error: 'at least one exercise required' });
    }
    const count = totalExercises(blocks);
    const created = pool.query(
      `INSERT INTO workouts (title, workout_type, owner_user_id, status, visible)
       VALUES (?, 'custom', ?, 'published', 0) RETURNING id`,
      [title.trim(), req.user.id],
    ).rows[0];
    writeBlocks(created.id, blocks);
    pool.query(
      `INSERT INTO favourites (user_id, item_type, item_id, item_title, item_meta)
       VALUES (?, 'workout', ?, ?, ?)`,
      [req.user.id, created.id, title.trim(), `Your workout · ${count} exercise${count === 1 ? '' : 's'}`],
    );
    res.json({ workout_id: created.id });
  } catch (err) {
    console.error('Create my-workout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reconstruct the builder block structure from a stored workout. Merges the
// block_settings JSON (formats/settings/rest, in order) with the persisted
// exercises grouped by their block label.
function reconstruct(workout) {
  const exRows = pool.query(
    `SELECT we.*, e.name, e.thumbnail_url, e.body_part,
       wem.tempo, wem.rir, wem.rpe, wem.time_based
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     LEFT JOIN workout_exercise_meta wem ON wem.workout_exercise_id = we.id
     WHERE we.workout_id = ?
     ORDER BY we.order_index`,
    [workout.id],
  ).rows;

  let meta = [];
  try { meta = workout.block_settings ? JSON.parse(workout.block_settings) : []; } catch { meta = []; }

  // Group exercises by their (consecutive) group_label, preserving order.
  const groups = [];
  let cur = null;
  for (const ex of exRows) {
    if (!cur || ex.group_label !== cur.label) {
      cur = { label: ex.group_label, type: ex.group_type, exercises: [] };
      groups.push(cur);
    }
    cur.exercises.push({
      id: ex.exercise_id,
      name: ex.name,
      thumbnail_url: ex.thumbnail_url,
      body_part: ex.body_part,
      sets: String(ex.sets ?? '3'),
      measure: ex.time_based ? 'time' : 'reps',
      reps: ex.reps || '10',
      time: ex.duration_secs || 30,
      notes: ex.notes || '',
      adv: !!(ex.tempo || ex.rir != null || ex.rpe != null),
      rpe: ex.rpe != null ? String(ex.rpe) : '',
      rir: ex.rir != null ? String(ex.rir) : '',
      tempo: ex.tempo || '',
      restAfter: secsToRest(ex.rest_secs),
    });
  }

  return groups.map((g, gi) => {
    const m = meta[gi] || {};
    return {
      type: m.type || ID_TO_TYPE[g.type ?? 'standard'] || 'Straight Set',
      settings: m.settings || {},
      restAfter: m.restAfter || '',
      exercises: g.exercises,
    };
  });
}

// GET /api/my-workouts/:id  -> { title, blocks } for the builder edit view.
// Owners get the workout for editing; the owner's coach gets it read-only for
// coaching context on the client profile.
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const workout = pool.query('SELECT * FROM workouts WHERE id = ?', [req.params.id]).rows[0];
    if (!workout || workout.owner_user_id == null) {
      return res.status(404).json({ error: 'Not found' });
    }
    const isOwner = workout.owner_user_id === req.user.id;
    const coachOwnsClient = req.user.role === 'coach' &&
      pool.query('SELECT 1 FROM users WHERE id = ? AND coach_id = ?', [workout.owner_user_id, req.user.id]).rows.length > 0;
    if (!isOwner && !coachOwnsClient) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ title: workout.title, blocks: reconstruct(workout), read_only: !isOwner });
  } catch (err) {
    console.error('Get my-workout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/my-workouts/:id  { title, blocks }
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const workout = pool.query('SELECT * FROM workouts WHERE id = ?', [req.params.id]).rows[0];
    if (!workout || workout.owner_user_id !== req.user.id) {
      return res.status(404).json({ error: 'Not found' });
    }
    const { title, blocks } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    if (!Array.isArray(blocks) || totalExercises(blocks) === 0) {
      return res.status(400).json({ error: 'at least one exercise required' });
    }
    const count = totalExercises(blocks);
    pool.query('UPDATE workouts SET title = ? WHERE id = ?', [title.trim(), workout.id]);
    clearBlocks(workout.id);
    writeBlocks(workout.id, blocks);
    pool.query(
      `UPDATE favourites SET item_title = ?, item_meta = ?
       WHERE user_id = ? AND item_type = 'workout' AND item_id = ?`,
      [title.trim(), `Your workout · ${count} exercise${count === 1 ? '' : 's'}`, req.user.id, workout.id],
    );
    res.json({ workout_id: workout.id });
  } catch (err) {
    console.error('Update my-workout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/my-workouts/:id - removes the workout, its exercises, the
// favourite link, and any scheduled instances.
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const workout = pool.query('SELECT * FROM workouts WHERE id = ?', [req.params.id]).rows[0];
    if (!workout || workout.owner_user_id !== req.user.id) {
      return res.status(404).json({ error: 'Not found' });
    }
    clearBlocks(workout.id);
    pool.query('DELETE FROM user_scheduled_workouts WHERE workout_id = ?', [workout.id]);
    pool.query("DELETE FROM favourites WHERE item_type = 'workout' AND item_id = ?", [workout.id]);
    pool.query('DELETE FROM workouts WHERE id = ?', [workout.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete my-workout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/my-workouts/client/:clientId - coach read-only list of a client's
// built workouts (for coaching context on the client profile).
router.get('/client/:clientId', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    if (!checkCoachOwnsClient(req, res, Number(req.params.clientId))) return;
    const rows = pool.query(
      `SELECT id, title, created_at,
         (SELECT COUNT(*) FROM workout_exercises WHERE workout_id = workouts.id) AS exercise_count
       FROM workouts WHERE owner_user_id = ? ORDER BY created_at DESC`,
      [req.params.clientId],
    ).rows;
    res.json({ workouts: rows });
  } catch (err) {
    console.error('Coach list client workouts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
