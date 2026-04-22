import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ClientProfile from './ClientProfile';
import MessageThread from '../client/MessageThread';
import GroupEditor from './GroupEditor';

// CoachWorkspace — the FitBudd-style 3-column Messages workspace.
//   [ sidebar ] [ chat list ] [ client workspace with tabs + always-on rail ]
//
// When a coach picks a client conversation, the right pane always shows
// the chat thread in the center AND a persistent client info rail on the
// far right (Summary / Targets / Membership / Recent logins). The Overview,
// Check-ins, Habits etc. tabs swap what's in the center without ever
// removing the rail — coach never loses sight of client context.

const TIER_COLORS = {
  Free:    { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
  Starter: { bg: 'rgba(56,189,248,0.18)',  fg: '#38bdf8' },
  Prime:   { bg: 'rgba(255,140,0,0.18)',   fg: '#FF8C00' },
  Elite:   { bg: 'rgba(236,72,153,0.18)',  fg: '#ec4899' },
};
const TIER_ORDER = ['All', 'Free', 'Starter', 'Prime', 'Elite'];

export default function CoachWorkspace({ initialScope = 'team' }) {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [scope, setScope] = useState(initialScope); // team | direct | group

  // When the sidebar swaps sub-items (Clients ↔ Direct ↔ Groups) we want
  // the workspace to follow along without remounting state like search/filter.
  useEffect(() => { setScope(initialScope); }, [initialScope]);
  const [tierFilter, setTierFilter] = useState('All');
  const [filter, setFilter] = useState('all'); // all | unread | starred
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // { conv }
  // editing: null | { mode: 'new' } | { mode: 'edit', group }
  const [editing, setEditing] = useState(null);
  // Cache the last fetched group record so the editor has fresh metadata
  // (description, visibility, access_tier_ids, etc.) — the conversations
  // list only carries the chat-row subset.
  const fetchGroupFull = async (id) => {
    try {
      const res = await fetch('/api/messages/groups', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.groups || []).find(g => g.id === id) || null;
    } catch { return null; }
  };

  useEffect(() => { fetchConversations(); }, [scope]);
  useEffect(() => {
    // Refresh conversations periodically so unread counts stay live while
    // the coach is on this page.
    const t = setInterval(fetchConversations, 15000);
    return () => clearInterval(t);
  }, [scope]);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`/api/messages/conversations?scope=${scope}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch (err) { console.error(err); }
  };

  const toggleStar = async (conv, e) => {
    e.stopPropagation();
    const method = conv.starred ? 'DELETE' : 'POST';
    await fetch(`/api/messages/conversations/${conv.id}/star`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchConversations();
  };

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      if (filter === 'unread' && !(c.unread_count > 0)) return false;
      if (filter === 'starred' && !c.starred) return false;
      if (scope === 'team' && tierFilter !== 'All') {
        if ((c.client?.tier_name || 'Free') !== tierFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = c.client?.name || c.other_user?.name || c.title || '';
        if (!name.toLowerCase().includes(q) && !(c.last_message || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filter, scope, tierFilter, search]);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* LEFT: chat list */}
      <div style={{
        width: 340, flexShrink: 0, borderRight: '1px solid var(--divider)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 18px 10px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800 }}>
              {scope === 'group' ? 'Groups' : 'Chats'} <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>({filtered.length})</span>
            </h1>
            {scope === 'group' ? (
              <button
                onClick={() => { setSelected(null); setEditing({ mode: 'new' }); }}
                style={{
                  padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 800,
                }}
              >
                + New Group
              </button>
            ) : totalUnread > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
                background: 'var(--accent)', color: '#fff',
              }}>
                {totalUnread} unread
              </span>
            )}
          </div>

          {/* Unread / Starred filter chips */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {['all', 'unread', 'starred'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: filter === f ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                  color: filter === f ? '#000' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Scope tabs removed — Clients/Direct nav items gone; scope is
              set by the parent (AdminLayout) via initialScope. */}

          {/* Tier filter pills — only on team scope */}
          {scope === 'team' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {TIER_ORDER.map(tier => {
                const active = tierFilter === tier;
                const color = TIER_COLORS[tier] || { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-secondary)' };
                return (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(tier)}
                    style={{
                      padding: '3px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: active ? color.fg : color.bg,
                      color: active ? '#000' : color.fg,
                      fontSize: 10, fontWeight: 700,
                    }}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          )}

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: 'var(--bg-card)', border: '1px solid var(--divider)',
              color: 'var(--text-primary)', fontSize: 13,
            }}
          />
        </div>

        {/* Chat rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
              No conversations match.
            </p>
          )}
          {filtered.map(conv => (
            <ChatRow
              key={conv.id}
              conv={conv}
              isSelected={selected?.conv.id === conv.id || editing?.group?.id === conv.id}
              onClick={() => { setEditing(null); setSelected({ conv }); }}
              onToggleStar={(e) => toggleStar(conv, e)}
              onEdit={scope === 'group' ? async (e) => {
                e.stopPropagation();
                const full = await fetchGroupFull(conv.id);
                setSelected(null);
                setEditing({ mode: 'edit', group: full || conv });
              } : null}
            />
          ))}
        </div>
      </div>

      {/* RIGHT: full client workspace (chat + tabs + always-on info rail) */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}>
        {editing && (
          <GroupEditor
            group={editing.mode === 'edit' ? editing.group : null}
            onSaved={() => { setEditing(null); fetchConversations(); }}
            onDeleted={() => { setEditing(null); fetchConversations(); }}
            onCancel={() => setEditing(null)}
          />
        )}
        {!editing && !selected && (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12, color: 'var(--text-tertiary)',
          }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>💬</div>
            <p style={{ fontSize: 14 }}>
              {scope === 'group' ? 'Select a group to see the thread, or tap "+ New Group" to create one.' : 'Select a conversation to see the client.'}
            </p>
          </div>
        )}
        {!editing && selected && selected.conv.client?.id && (
          // Team inbox selected — land on Overview so coaches see client
          // context first; they tap Chats to drop into the thread.
          <ClientProfile
            key={selected.conv.client.id}
            clientId={selected.conv.client.id}
            conversationId={selected.conv.id}
            initialTab="Overview"
            showRail
            onBack={() => setSelected(null)}
          />
        )}
        {!editing && selected && !selected.conv.client?.id && (
          // Direct or Group conversation — no client workspace context,
          // just render the thread full-width
          <MessageThread
            conversationId={selected.conv.id}
            title={selected.conv.other_user?.name || selected.conv.title}
            onBack={() => { setSelected(null); fetchConversations(); }}
          />
        )}
      </div>
    </div>
  );
}

function ChatRow({ conv, isSelected, onClick, onToggleStar, onEdit }) {
  const name = conv.client?.name || conv.other_user?.name || conv.title || 'Untitled';
  const unread = conv.unread_count || 0;
  const tier = conv.scope === 'team' ? (conv.client?.tier_name || 'Free') : null;
  const tierColor = tier ? (TIER_COLORS[tier] || TIER_COLORS.Free) : null;

  // Group avatar priority: branded image_url > emoji-on-color-disc > client photo > letter
  const groupImage = conv.scope === 'group' ? conv.image_url : null;
  const groupEmoji = conv.scope === 'group' ? conv.icon : null;
  const groupBg = conv.scope === 'group' ? (conv.icon_bg || '#E8E8E8') : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        cursor: 'pointer',
        background: isSelected ? 'rgba(255,140,0,0.08)'
          : unread > 0 ? 'rgba(255,140,0,0.03)' : 'transparent',
        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {groupImage ? (
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        }}>
          <img src={groupImage} alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : groupEmoji ? (
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: groupBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>
          {groupEmoji}
        </div>
      ) : conv.client?.photo_url ? (
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          boxShadow: tierColor ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${tierColor.fg}` : 'none',
        }}>
          <img src={conv.client.photo_url} alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
          boxShadow: tierColor ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${tierColor.fg}` : 'none',
        }}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <p style={{
            fontWeight: unread > 0 ? 700 : 600, fontSize: 13,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          }}>
            {name}
          </p>
          {tier && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
              background: tierColor.bg, color: tierColor.fg,
              textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0,
            }}>{tier}</span>
          )}
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {formatDate(conv.last_message_at)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <p style={{
            fontSize: 11.5, color: unread > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: unread > 0 ? 600 : 400, flex: 1, minWidth: 0,
          }}>
            {conv.last_message || 'No messages yet'}
          </p>
          {unread > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 9,
              background: 'var(--accent)', color: '#fff', minWidth: 18, textAlign: 'center',
            }}>{unread}</span>
          )}
        </div>
      </div>

      {/* Edit (group scope only) */}
      {onEdit && (
        <button
          onClick={onEdit}
          title="Edit group"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1, flexShrink: 0,
          }}
        >
          ⚙
        </button>
      )}

      {/* Star toggle */}
      <button
        onClick={onToggleStar}
        title={conv.starred ? 'Unstar' : 'Star'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: conv.starred ? '#facc15' : 'var(--text-tertiary)',
          fontSize: 16, lineHeight: 1, flexShrink: 0,
        }}
      >
        {conv.starred ? '★' : '☆'}
      </button>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IE', { weekday: 'short' });
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}
