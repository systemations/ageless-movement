import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// ────────────────────────────────────────────────────────────────────────
// Conversation bootstrapping
//
// For each client we maintain ONE shared "team inbox" conversation whose
// membership is {the client} + {all coaches}. Any coach sees it and can
// reply; sender_id stamps the reply with that coach's identity.
//
// Existing 2-member `direct` conversations stay valid as private
// coach↔client side-threads. Groups (Weekly Wins etc.) continue to work
// as before.
// ────────────────────────────────────────────────────────────────────────

function ensureGroupConversations(userId) {
  const groups = [
    { title: 'Weekly Wins', icon: '🏆', icon_bg: '#FFF3CD' },
    { title: 'Active Clients', icon: '👤', icon_bg: '#D1ECF1' },
    { title: 'Q&A for the Community', icon: '❓', icon_bg: '#FFE0B2' },
    { title: 'Feedback & Testimonials', icon: '⭐', icon_bg: '#C8E6C9' },
  ];

  for (const g of groups) {
    const existing = pool.query("SELECT c.id FROM conversations c WHERE c.type = 'group' AND c.title = ? AND c.client_id IS NULL", [g.title]);
    if (existing.rows.length === 0) {
      const convo = pool.query("INSERT INTO conversations (type, title, icon, icon_bg) VALUES ('group', ?, ?, ?) RETURNING id", [g.title, g.icon, g.icon_bg]);
      pool.query('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convo.rows[0].id, userId]);
      const allUsers = pool.query('SELECT id FROM users WHERE id != ?', [userId]);
      for (const u of allUsers.rows) {
        pool.query('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convo.rows[0].id, u.id]);
      }
    } else {
      pool.query('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [existing.rows[0].id, userId]);
    }
  }

  // Shared client inboxes
  ensureClientTeamInboxes(userId);
}

// Ensures one shared team-inbox conversation per client exists, and that
// all coaches + the client are members of each one. Called on any
// /conversations read so memberships stay in sync if a new coach or
// client signs up mid-session.
function ensureClientTeamInboxes(currentUserId) {
  const clients = pool.query("SELECT id, name FROM users WHERE role = 'client'").rows;
  const coaches = pool.query("SELECT id FROM users WHERE role = 'coach'").rows;

  for (const client of clients) {
    // Find existing team-inbox convo for this client (or create one)
    let convo = pool.query(
      "SELECT id FROM conversations WHERE client_id = ? LIMIT 1",
      [client.id],
    ).rows[0];

    if (!convo) {
      const res = pool.query(
        "INSERT INTO conversations (type, client_id, title) VALUES ('group', ?, ?) RETURNING id",
        [client.id, client.name],
      );
      convo = { id: res.rows[0].id };
    }

    // Ensure client is a member
    pool.query(
      'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
      [convo.id, client.id],
    );
    // Ensure all coaches are members
    for (const c of coaches) {
      pool.query(
        'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [convo.id, c.id],
      );
    }
  }

  // If a brand-new coach just signed up, also make sure existing DMs
  // (private side-threads) remain intact — we don't touch those here.
  void currentUserId;
}

// ────────────────────────────────────────────────────────────────────────
// Conversations list
// ────────────────────────────────────────────────────────────────────────
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = req.query.scope; // 'team' | 'direct' | 'group' | undefined
    ensureGroupConversations(userId);

    // Determine user's active status for visibility gating. Coaches see
    // everything (they manage all groups). Clients must have status='active'
    // to see 'active_clients' visibility groups.
    const viewer = pool.query('SELECT role FROM users WHERE id = ?', [userId]).rows[0] || {};
    const isCoach = viewer.role === 'coach';
    const clientStatus = isCoach ? 'active' :
      (pool.query('SELECT COALESCE(status, \'active\') as status FROM client_profiles WHERE user_id = ?', [userId]).rows[0]?.status || 'active');
    const isActiveClient = isCoach || clientStatus === 'active';

    // Pull all conversations user is a member of. Community groups with
    // visibility='all_clients' are injected even if the user isn't an
    // explicit member yet (auto-enrolled) so read-only groups like
    // "Feedback & Testimonials" always surface.
    let convos = pool.query(`
      SELECT c.id, c.type, c.title, c.icon, c.icon_bg, c.image_url, c.description,
        c.client_id, c.created_at,
        c.visibility, c.chat_enabled, c.cta_label, c.cta_url,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_id,
        (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender_id
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ?
      ORDER BY last_message_at DESC NULLS LAST
    `, [userId]).rows;

    // Apply visibility gating for community groups (non-DM, no client_id).
    // - invite_only: only explicit members (already enforced by the JOIN above).
    // - active_clients: hide if the user isn't an active client (or coach).
    // - all_clients: visible to everyone who has a client_profile.
    // Also hide empty coach→client DMs on the client side — a coach only
    // surfaces in Direct Messages once they've actually written.
    convos = convos.filter(c => {
      if (c.client_id) return true;
      if (c.type === 'direct') {
        // Client hides empty DMs with a coach (so Amy/Joonas don't clutter
        // the list until they reach out). Coaches always see all their DMs.
        if (!isCoach && !c.last_message_at) return false;
        return true;
      }
      const v = c.visibility || 'invite_only';
      if (v === 'active_clients' && !isActiveClient) return false;
      return true;
    });

    const enriched = convos.map(c => {
      // Compute unread count for this user
      const readRow = pool.query(
        'SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND user_id = ?',
        [c.id, userId],
      ).rows[0];
      const lastReadAt = readRow?.last_read_at || '1970-01-01';
      const unread = pool.query(
        'SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND sender_id != ? AND created_at > ?',
        [c.id, userId, lastReadAt],
      ).rows[0].c;

      // Per-user star flag
      const starred = pool.query(
        'SELECT id FROM conversation_stars WHERE conversation_id = ? AND user_id = ?',
        [c.id, userId],
      ).rows.length > 0;

      // Team inbox: attach client info + tier so inbox rows can render tier pill
      if (c.client_id) {
        const client = pool.query(`
          SELECT u.id, u.name, u.avatar_url,
            COALESCE(cp.profile_image_url, u.avatar_url) as photo_url,
            t.name as tier_name, t.level as tier_level
          FROM users u
          LEFT JOIN client_profiles cp ON cp.user_id = u.id
          LEFT JOIN tiers t ON t.id = cp.tier_id
          WHERE u.id = ?
        `, [c.client_id]).rows[0];
        return { ...c, scope: 'team', client, unread_count: unread, starred };
      }

      // Direct (2-person) — attach other user with resolved photo
      if (c.type === 'direct') {
        const other = pool.query(`
          SELECT u.id, u.name, u.role,
            COALESCE(cp.photo_url, clp.profile_image_url, u.avatar_url) as photo_url,
            u.avatar_url
          FROM conversation_members cm
          JOIN users u ON cm.user_id = u.id
          LEFT JOIN coach_profiles cp ON cp.user_id = u.id
          LEFT JOIN client_profiles clp ON clp.user_id = u.id
          WHERE cm.conversation_id = ? AND cm.user_id != ?
        `, [c.id, userId]).rows[0];
        return { ...c, scope: 'direct', other_user: other || null, unread_count: unread, starred };
      }

      // Global group
      const members = pool.query('SELECT COUNT(*) as count FROM conversation_members WHERE conversation_id = ?', [c.id]).rows[0];
      return { ...c, scope: 'group', member_count: members.count, unread_count: unread, starred };
    });

    const filtered = scope ? enriched.filter(c => c.scope === scope) : enriched;
    res.json({ conversations: filtered });
  } catch (err) {
    console.error('Conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────
// Messages in a conversation
// ────────────────────────────────────────────────────────────────────────
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const member = pool.query('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const messages = pool.query(`
      SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar, u.role as sender_role
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [req.params.id]).rows;

    // Attach reactions per message. One query per conversation; group in JS
    // into { emoji, count, users: [{id, name}], mine } chips for the client.
    if (messages.length > 0) {
      const msgIds = messages.map(m => m.id);
      const placeholders = msgIds.map(() => '?').join(',');
      const reactionRows = pool.query(
        `SELECT r.message_id, r.emoji, r.user_id, u.name
         FROM message_reactions r
         JOIN users u ON u.id = r.user_id
         WHERE r.message_id IN (${placeholders})
         ORDER BY r.created_at ASC`,
        msgIds,
      ).rows;
      const byMsg = new Map();
      for (const r of reactionRows) {
        if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, new Map());
        const byEmoji = byMsg.get(r.message_id);
        if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, count: 0, users: [], mine: false });
        const chip = byEmoji.get(r.emoji);
        chip.count += 1;
        chip.users.push({ id: r.user_id, name: r.name });
        if (r.user_id === req.user.id) chip.mine = true;
      }
      for (const m of messages) {
        const chips = byMsg.get(m.id);
        m.reactions = chips ? Array.from(chips.values()) : [];
      }
    }

    const convo = pool.query('SELECT * FROM conversations WHERE id = ?', [req.params.id]).rows[0];

    // Attach client info + tier for team inboxes so thread header can render it
    let client = null;
    if (convo?.client_id) {
      client = pool.query(`
        SELECT u.id, u.name, u.avatar_url,
          COALESCE(cp.profile_image_url, u.avatar_url) as photo_url,
          t.name as tier_name, t.level as tier_level
        FROM users u
        LEFT JOIN client_profiles cp ON cp.user_id = u.id
        LEFT JOIN tiers t ON t.id = cp.tier_id
        WHERE u.id = ?
      `, [convo.client_id]).rows[0];
    }

    // Read state for current user
    const read = pool.query(
      'SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    ).rows[0];

    // Read state for other members (so sender can see when recipients have read their messages).
    // For 1-on-1 we surface a single `other_last_read_at`; for group chats callers can use
    // `member_reads` to match sender → read state per user.
    const otherReads = pool.query(
      `SELECT user_id, last_read_at FROM conversation_reads
       WHERE conversation_id = ? AND user_id != ?`,
      [req.params.id, req.user.id],
    ).rows;
    const otherLastReadAt = otherReads.length
      ? otherReads.reduce((min, r) => (!min || r.last_read_at < min ? r.last_read_at : min), null)
      : null;

    res.json({
      messages,
      conversation: convo,
      client,
      last_read_at: read?.last_read_at || null,
      other_last_read_at: otherLastReadAt,
      member_reads: otherReads,
    });
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

    // Sender's own messages are implicitly read by them
    upsertRead(req.params.id, req.user.id, msg.rows[0].id);

    pool.query('INSERT INTO activity_log (user_id, action_type, description) VALUES (?, ?, ?)',
      [req.user.id, 'message_sent', `Sent a message`]);

    res.json({ message: msg.rows[0] });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark conversation as read up to latest message
router.post('/conversations/:id/read', authenticateToken, (req, res) => {
  try {
    const member = pool.query('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const latest = pool.query(
      'SELECT id, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.id],
    ).rows[0];

    upsertRead(req.params.id, req.user.id, latest?.id ?? null, latest?.created_at ?? null);
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark conversation as unread. If `message_id` is provided, unread starts
// from that message (so everything from that point on appears unread
// again). Without it, we unread everything by resetting to epoch.
router.post('/conversations/:id/unread', authenticateToken, (req, res) => {
  try {
    const member = pool.query('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const { message_id } = req.body;
    let pivotAt = '1970-01-01 00:00:00';
    let pivotId = null;
    if (message_id) {
      const msg = pool.query('SELECT id, created_at FROM messages WHERE id = ? AND conversation_id = ?', [message_id, req.params.id]).rows[0];
      if (msg) {
        // Set last_read_at just BEFORE this message so it counts as unread
        // We rewind by 1 second which is fine for our timestamp resolution
        const d = new Date(msg.created_at + 'Z');
        d.setSeconds(d.getSeconds() - 1);
        pivotAt = d.toISOString().replace('T', ' ').replace(/\..+Z?$/, '');
        pivotId = msg.id - 1;
      }
    }
    upsertRead(req.params.id, req.user.id, pivotId, pivotAt);
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark unread error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark unread ON BEHALF OF another coach — so Dan can flag a client reply
// for Joonas to pick up. Coach-only. Target must be a coach and a member
// of the conversation.
router.post('/conversations/:id/unread-for', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'coach') return res.status(403).json({ error: 'Coach only' });
    const { target_user_id, message_id } = req.body;
    if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });

    const target = pool.query("SELECT id, role FROM users WHERE id = ?", [target_user_id]).rows[0];
    if (!target || target.role !== 'coach') return res.status(400).json({ error: 'Target must be a coach' });

    // If target isn't a member yet, add them (so the thread surfaces in their inbox).
    pool.query(
      'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
      [req.params.id, target_user_id]
    );

    let pivotAt = '1970-01-01 00:00:00';
    let pivotId = null;
    if (message_id) {
      const msg = pool.query(
        'SELECT id, created_at FROM messages WHERE id = ? AND conversation_id = ?',
        [message_id, req.params.id]
      ).rows[0];
      if (msg) {
        const d = new Date(msg.created_at + 'Z');
        d.setSeconds(d.getSeconds() - 1);
        pivotAt = d.toISOString().replace('T', ' ').replace(/\..+Z?$/, '');
        pivotId = msg.id - 1;
      }
    }
    upsertRead(req.params.id, target_user_id, pivotId, pivotAt);
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark unread-for error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle star on a conversation — per-coach
router.post('/conversations/:id/star', authenticateToken, (req, res) => {
  try {
    const member = pool.query('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });
    pool.query(
      'INSERT OR IGNORE INTO conversation_stars (conversation_id, user_id) VALUES (?, ?)',
      [req.params.id, req.user.id],
    );
    res.json({ starred: true });
  } catch (err) {
    console.error('Star error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/conversations/:id/star', authenticateToken, (req, res) => {
  try {
    pool.query(
      'DELETE FROM conversation_stars WHERE conversation_id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    res.json({ starred: false });
  } catch (err) {
    console.error('Unstar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a direct (private side-thread) conversation between two users.
// Preserved from the old API so coaches can still spin up a 1:1 thread
// with a client outside the shared team inbox.
router.post('/conversations/direct', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.body;

    const existing = pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      WHERE c.type = 'direct' AND c.client_id IS NULL
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

// ────────────────────────────────────────────────────────────────────────
// Community groups — coach admin CRUD (Phase 2)
//
// `type='group' AND client_id IS NULL` is the filter for community groups —
// team inbox conversations are ALSO type='group' but always carry a client_id,
// so exclude them from every query in this section.
// ────────────────────────────────────────────────────────────────────────

function parseTierIds(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function serializeGroup(g) {
  if (!g) return null;
  return {
    ...g,
    access_tier_ids: parseTierIds(g.access_tier_ids),
    chat_enabled: g.chat_enabled === 1 || g.chat_enabled === true,
    mute_new_members: g.mute_new_members === 1 || g.mute_new_members === true,
  };
}

// List all community groups with member counts (coach-only)
router.get('/groups', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const rows = pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count
      FROM conversations c
      WHERE c.type = 'group' AND c.client_id IS NULL
      ORDER BY c.created_at ASC
    `).rows;
    res.json({ groups: rows.map(serializeGroup) });
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create community group. Auto-adds all coaches as members. When visibility
// is 'all_clients' or 'active_clients' members are resolved lazily at list time
// (see /conversations), so we only need to seed coaches + any invite-only picks.
router.post('/groups', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const {
      title,
      reference_name = null,
      description = null,
      image_url = null,
      icon = '👥',
      icon_bg = '#E8E8E8',
      visibility = 'invite_only',
      chat_enabled = true,
      cta_label = null,
      cta_url = null,
      mute_new_members = false,
      access_tier_ids = [],
      member_user_ids = [],
    } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title required' });
    }
    const allowedVis = ['invite_only', 'active_clients', 'all_clients', 'specific_tiers'];
    if (!allowedVis.includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility' });
    }

    const tierIdsJson = Array.isArray(access_tier_ids) && access_tier_ids.length
      ? JSON.stringify(access_tier_ids.map(Number).filter(Boolean))
      : null;

    const ins = pool.query(`
      INSERT INTO conversations
        (type, title, icon, icon_bg, visibility, chat_enabled, cta_label, cta_url,
         description, image_url, reference_name, mute_new_members, access_tier_ids)
      VALUES ('group', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [
      title.trim(), icon, icon_bg, visibility, chat_enabled ? 1 : 0,
      cta_label, cta_url, description, image_url, reference_name,
      mute_new_members ? 1 : 0, tierIdsJson,
    ]);
    const groupId = ins.rows[0].id;

    // Seed coaches as members so every coach sees it immediately
    const coaches = pool.query("SELECT id FROM users WHERE role = 'coach'").rows;
    for (const c of coaches) {
      pool.query(
        'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [groupId, c.id],
      );
    }

    // For invite_only groups, add explicitly picked clients
    if (visibility === 'invite_only' && Array.isArray(member_user_ids)) {
      for (const uid of member_user_ids) {
        if (!uid) continue;
        pool.query(
          'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
          [groupId, Number(uid)],
        );
      }
    }

    const row = pool.query('SELECT * FROM conversations WHERE id = ?', [groupId]).rows[0];
    res.json({ group: serializeGroup(row) });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit community group
router.patch('/groups/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = pool.query(
      "SELECT * FROM conversations WHERE id = ? AND type = 'group' AND client_id IS NULL",
      [id],
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'Group not found' });

    const fields = [];
    const values = [];
    const allow = [
      'title', 'reference_name', 'description', 'image_url', 'icon', 'icon_bg',
      'visibility', 'cta_label', 'cta_url',
    ];
    for (const key of allow) {
      if (key in req.body) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if ('chat_enabled' in req.body) {
      fields.push('chat_enabled = ?');
      values.push(req.body.chat_enabled ? 1 : 0);
    }
    if ('mute_new_members' in req.body) {
      fields.push('mute_new_members = ?');
      values.push(req.body.mute_new_members ? 1 : 0);
    }
    if ('access_tier_ids' in req.body) {
      const arr = Array.isArray(req.body.access_tier_ids)
        ? req.body.access_tier_ids.map(Number).filter(Boolean)
        : [];
      fields.push('access_tier_ids = ?');
      values.push(arr.length ? JSON.stringify(arr) : null);
    }
    if (fields.length) {
      values.push(id);
      pool.query(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const row = pool.query('SELECT * FROM conversations WHERE id = ?', [id]).rows[0];
    res.json({ group: serializeGroup(row) });
  } catch (err) {
    console.error('Edit group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete community group (cascades members + messages via FK)
router.delete('/groups/:id', authenticateToken, requireRole('coach'), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = pool.query(
      "SELECT id FROM conversations WHERE id = ? AND type = 'group' AND client_id IS NULL",
      [id],
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'Group not found' });
    pool.query('DELETE FROM conversations WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle a reaction on a message. Same user + same emoji = remove; otherwise
// insert. Returns the new reaction chip array for that message so the client
// can update optimistically without re-fetching the whole thread.
router.post('/conversations/:id/messages/:messageId/reactions', authenticateToken, (req, res) => {
  try {
    const { emoji } = req.body || {};
    if (!emoji || typeof emoji !== 'string' || emoji.length > 16) {
      return res.status(400).json({ error: 'emoji required' });
    }
    const member = pool.query(
      'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (member.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

    const msg = pool.query(
      'SELECT id FROM messages WHERE id = ? AND conversation_id = ?',
      [req.params.messageId, req.params.id],
    ).rows[0];
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const existing = pool.query(
      'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [req.params.messageId, req.user.id, emoji],
    ).rows[0];

    if (existing) {
      pool.query('DELETE FROM message_reactions WHERE id = ?', [existing.id]);
    } else {
      pool.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        [req.params.messageId, req.user.id, emoji],
      );
    }

    const rows = pool.query(
      `SELECT r.emoji, r.user_id, u.name
       FROM message_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE r.message_id = ?
       ORDER BY r.created_at ASC`,
      [req.params.messageId],
    ).rows;
    const byEmoji = new Map();
    for (const r of rows) {
      if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, count: 0, users: [], mine: false });
      const chip = byEmoji.get(r.emoji);
      chip.count += 1;
      chip.users.push({ id: r.user_id, name: r.name });
      if (r.user_id === req.user.id) chip.mine = true;
    }
    res.json({ reactions: Array.from(byEmoji.values()) });
  } catch (err) {
    console.error('Reaction toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────
function upsertRead(conversationId, userId, lastMessageId, lastReadAt) {
  const now = lastReadAt || new Date().toISOString().replace('T', ' ').replace(/\..+Z?$/, '');
  pool.query(`
    INSERT INTO conversation_reads (conversation_id, user_id, last_read_at, last_read_message_id, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET
      last_read_at = excluded.last_read_at,
      last_read_message_id = excluded.last_read_message_id,
      updated_at = datetime('now')
  `, [conversationId, userId, now, lastMessageId]);
}

export default router;
