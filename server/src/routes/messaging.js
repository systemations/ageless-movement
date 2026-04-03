import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get all conversations for current user
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const convos = pool.query(`
      SELECT c.*, cm.user_id as member_id,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ?
      ORDER BY last_message_at DESC
    `, [userId]);

    // For direct convos, get the other person's info
    const enriched = convos.rows.map(c => {
      if (c.type === 'direct') {
        const other = pool.query(`
          SELECT u.id, u.name, u.avatar_url, u.role FROM conversation_members cm
          JOIN users u ON cm.user_id = u.id
          WHERE cm.conversation_id = ? AND cm.user_id != ?
        `, [c.id, userId]);
        return { ...c, other_user: other.rows[0] || null };
      }
      // For groups, get member count
      const members = pool.query('SELECT COUNT(*) as count FROM conversation_members WHERE conversation_id = ?', [c.id]);
      return { ...c, member_count: members.rows[0].count };
    });

    res.json({ conversations: enriched });
  } catch (err) {
    console.error('Conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    // Verify user is a member
    const member = pool.query('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const messages = pool.query(`
      SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar, u.role as sender_role
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [req.params.id]);

    const convo = pool.query('SELECT * FROM conversations WHERE id = ?', [req.params.id]);

    res.json({ messages: messages.rows, conversation: convo.rows[0] });
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { content, message_type, attachment_url } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const member = pool.query('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const msg = pool.query(
      'INSERT INTO messages (conversation_id, sender_id, content, message_type, attachment_url) VALUES (?, ?, ?, ?, ?) RETURNING id, conversation_id, sender_id, content, message_type, created_at',
      [req.params.id, req.user.id, content, message_type || 'text', attachment_url || null]
    );

    // Log activity
    pool.query('INSERT INTO activity_log (user_id, action_type, description) VALUES (?, ?, ?)',
      [req.user.id, 'message_sent', `Sent a message`]);

    res.json({ message: msg.rows[0] });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a direct conversation (coach creates with client)
router.post('/conversations/direct', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.body;

    // Check if direct convo already exists
    const existing = pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      WHERE c.type = 'direct'
    `, [req.user.id, user_id]);

    if (existing.rows.length > 0) {
      return res.json({ conversation_id: existing.rows[0].id });
    }

    const convo = pool.query("INSERT INTO conversations (type) VALUES ('direct') RETURNING id", []);
    pool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convo.rows[0].id, req.user.id]);
    pool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convo.rows[0].id, user_id]);

    res.json({ conversation_id: convo.rows[0].id });
  } catch (err) {
    console.error('Create convo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
