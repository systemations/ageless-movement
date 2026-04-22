import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get all favourites for current user, with the source item's image resolved at read-time
router.get('/', authenticateToken, async (req, res) => {
  try {
    const favs = pool.query(`
      SELECT
        f.*,
        CASE
          WHEN f.item_type = 'recipe'   THEN (SELECT thumbnail_url FROM recipes  WHERE id = f.item_id)
          WHEN f.item_type = 'workout'  THEN (SELECT image_url     FROM workouts WHERE id = f.item_id)
          WHEN f.item_type = 'program'  THEN (SELECT image_url     FROM programs WHERE id = f.item_id)
          WHEN f.item_type = 'course'   THEN (SELECT image_url     FROM courses  WHERE id = f.item_id)
          WHEN f.item_type = 'exercise' THEN (SELECT thumbnail_url FROM exercises WHERE id = f.item_id)
          ELSE NULL
        END AS image_url
      FROM favourites f
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [req.user.id]);
    res.json({ favourites: favs.rows });
  } catch (err) {
    console.error('Get favourites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle a favourite
router.post('/toggle', authenticateToken, async (req, res) => {
  try {
    const { item_type, item_id, item_title, item_meta } = req.body;
    if (!item_type || !item_id) return res.status(400).json({ error: 'item_type and item_id required' });

    const existing = pool.query(
      'SELECT id FROM favourites WHERE user_id = ? AND item_type = ? AND item_id = ?',
      [req.user.id, item_type, item_id]
    );

    if (existing.rows.length > 0) {
      pool.query('DELETE FROM favourites WHERE user_id = ? AND item_type = ? AND item_id = ?',
        [req.user.id, item_type, item_id]);
      res.json({ favourited: false });
    } else {
      pool.query(
        'INSERT INTO favourites (user_id, item_type, item_id, item_title, item_meta) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, item_type, item_id, item_title || '', item_meta || '']
      );
      res.json({ favourited: true });
    }
  } catch (err) {
    console.error('Toggle fav error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if item is favourited
router.get('/check', authenticateToken, async (req, res) => {
  try {
    const { item_type, item_id } = req.query;
    const existing = pool.query(
      'SELECT id FROM favourites WHERE user_id = ? AND item_type = ? AND item_id = ?',
      [req.user.id, item_type, item_id]
    );
    res.json({ favourited: existing.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
