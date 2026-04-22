import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SearchIcon } from '../../components/Icons';
import MessageThread from '../client/MessageThread';

// Tier visuals — reused so the colour on the Messages avatar ring matches
// the pill in the Clients table and everywhere else a tier is shown.
const TIER_COLORS = {
  Free:    { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
  Starter: { bg: 'rgba(56,189,248,0.18)',  fg: '#38bdf8' },
  Prime:   { bg: 'rgba(255,140,0,0.18)',   fg: '#FF8C00' },
  Elite:   { bg: 'rgba(236,72,153,0.18)',  fg: '#ec4899' },
};
const TIER_ORDER = ['All', 'Free', 'Starter', 'Prime', 'Elite'];

// CoachMessages — shared team inbox. All coaches see every client's
// thread. Unread count shown per conversation. Clicking a row opens the
// thread. Tabs let the coach switch between Clients (shared team inboxes),
// Direct (private side-threads), and Groups. Tier filter lets the coach
// triage by plan at a glance.

export default function CoachMessages() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [scope, setScope] = useState('team');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('All');

  useEffect(() => { fetchConversations(); }, [scope]);

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

  if (selectedConvo) {
    const title = selectedConvo.scope === 'team'
      ? selectedConvo.client?.name
      : selectedConvo.other_user?.name || selectedConvo.title;
    return (
      <MessageThread
        conversationId={selectedConvo.id}
        title={title}
        subtitle={selectedConvo.scope === 'team' ? 'Team inbox' : null}
        onBack={() => { setSelectedConvo(null); fetchConversations(); }}
      />
    );
  }

  const filtered = conversations.filter(c => {
    if (scope === 'team' && tierFilter !== 'All') {
      if ((c.client?.tier_name || 'Free') !== tierFilter) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    const name = c.client?.name || c.other_user?.name || c.title || '';
    return name.toLowerCase().includes(q) || (c.last_message || '').toLowerCase().includes(q);
  });

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Messages</h1>
          {totalUnread > 0 && (
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
              {totalUnread} unread
            </p>
          )}
        </div>
        <button className="header-icon"><SearchIcon /></button>
      </div>

      {/* Scope tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { id: 'team', label: 'Clients' },
          { id: 'direct', label: 'Direct' },
          { id: 'group', label: 'Groups' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setScope(t.id)}
            style={{
              padding: '7px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
              background: scope === t.id ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: scope === t.id ? '#000' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 700,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tier filter — only meaningful on the Clients scope */}
      {scope === 'team' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {TIER_ORDER.map(tier => {
            const active = tierFilter === tier;
            const color = TIER_COLORS[tier] || { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-secondary)' };
            return (
              <button
                key={tier}
                onClick={() => setTierFilter(tier)}
                style={{
                  padding: '5px 10px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: active ? color.fg : color.bg,
                  color: active ? '#000' : color.fg,
                  fontSize: 11, fontWeight: 700,
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
        placeholder="Search conversations..."
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          background: 'var(--bg-card)', border: '1px solid var(--divider)',
          color: 'var(--text-primary)', fontSize: 13, marginBottom: 12,
        }}
      />

      {filtered.length === 0 && (
        <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {scope === 'team' ? 'No client threads yet.' : scope === 'direct' ? 'No private threads yet.' : 'No groups yet.'}
        </p>
      )}

      {filtered.map((conv) => (
        <ConversationRow
          key={conv.id}
          conv={conv}
          onClick={() => setSelectedConvo(conv)}
        />
      ))}
    </div>
  );
}

function ConversationRow({ conv, onClick }) {
  const name = conv.client?.name || conv.other_user?.name || conv.title || 'Untitled';
  const unread = conv.unread_count || 0;
  // For team inboxes we always want a tier pill (defaults to Free if no
  // profile yet). Direct/group scopes don't have a tier — hide it.
  const tier = conv.scope === 'team' ? (conv.client?.tier_name || 'Free') : null;
  const tierColor = tier ? (TIER_COLORS[tier] || TIER_COLORS.Free) : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px',
        borderRadius: 10, cursor: 'pointer',
        background: unread > 0 ? 'rgba(255,140,0,0.04)' : 'transparent',
        borderBottom: '1px solid var(--divider)',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
        // Tier-coloured ring around the avatar — fast visual triage
        boxShadow: tierColor ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${tierColor.fg}` : 'none',
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <p style={{
              fontWeight: unread > 0 ? 700 : 600, fontSize: 14,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {name}
            </p>
            {tier && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                background: tierColor.bg, color: tierColor.fg,
                textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0,
              }}>
                {tier}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {formatDate(conv.last_message_at)}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <p style={{
            fontSize: 12, color: unread > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: unread > 0 ? 600 : 400, flex: 1, minWidth: 0,
          }}>
            {conv.last_message || 'No messages yet'}
          </p>
          {unread > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 10,
              background: 'var(--accent)', color: '#fff', minWidth: 20, textAlign: 'center',
            }}>
              {unread}
            </span>
          )}
        </div>
      </div>
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
