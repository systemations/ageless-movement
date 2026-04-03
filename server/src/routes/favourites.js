import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get all favourites for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const favs = pool.query('SELECT * FROM favourites WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json({ favourites: favs.rows });
  } catch (err) {
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
