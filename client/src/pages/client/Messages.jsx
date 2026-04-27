import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import MessageThread from './MessageThread';

// On the client side, the "team inbox" (conversations.client_id set, client
// is the client themselves) is re-labelled so it doesn't look like the
// client is chatting with themselves.
const TEAM_INBOX_LABEL = 'Ageless Movement Team';
const TEAM_INBOX_ICON  = '🏋️';
const isTeamInboxForClient = (conv, viewerId) =>
  conv.client_id && viewerId && conv.client_id === viewerId;

export default function Messages() {
  const { token, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);

  useEffect(() => { fetchConversations(); }, []);

  // Auto-open the team inbox when arriving from the post-onboarding
  // "Subscribe to Prime" CTA. The server has already stamped
  // tier_requested_id + logged the intent so the coach sees the request
  // in their priority inbox; this just gives the client somewhere to
  // chat about payment details until Stripe is wired.
  useEffect(() => {
    if (!conversations.length || !user?.id) return;
    const params = new URLSearchParams(location.search);
    const intent = params.get('intent');
    if (intent !== 'upgrade-prime') return;
    const teamInbox = conversations.find(c => isTeamInboxForClient(c, user.id))
      || conversations.find(c => c.type === 'direct');
    if (teamInbox) {
      setSelectedConvo(teamInbox);
      // Drop the query param so a refresh doesn't reopen the thread
      navigate('/messages', { replace: true });
    }
  }, [conversations, user, location.search, navigate]);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/messages/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch (err) { console.error(err); }
  };

  if (selectedConvo) {
    const title = isTeamInboxForClient(selectedConvo, user?.id)
      ? TEAM_INBOX_LABEL
      : selectedConvo.type === 'direct'
        ? selectedConvo.other_user?.name || 'Chat'
        : selectedConvo.title;
    return <MessageThread conversationId={selectedConvo.id} title={title} onBack={() => { setSelectedConvo(null); fetchConversations(); }} />;
  }

  const direct = conversations.filter(c => c.type === 'direct');
  const groups = conversations.filter(c => c.type === 'group');

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    const diff = Math.floor((today - d) / 86400000);
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20 }}>👤</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Direct Messages</h1>
      </div>

      {/* Direct Messages */}
      {direct.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>DIRECT MESSAGES</p>
          {direct.map((conv) => (
            <div key={conv.id} onClick={() => setSelectedConvo(conv)} className="card-sm" style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}>
              {conv.other_user?.photo_url ? (
                <img
                  src={conv.other_user.photo_url}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: '#fff',
                }}>
                  {conv.other_user?.name?.charAt(0) || '?'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{conv.other_user?.name || 'Coach'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(conv.last_message_at)}</p>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.last_message || 'No messages yet'}
                </p>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, margin: '20px 0 8px', letterSpacing: 1 }}>GROUPS</p>
          {groups.map((conv) => {
            const teamInbox = isTeamInboxForClient(conv, user?.id);
            const displayTitle = teamInbox ? TEAM_INBOX_LABEL : conv.title;
            const displayIcon  = teamInbox ? TEAM_INBOX_ICON : (conv.icon || '💬');
            const iconBg       = teamInbox ? 'rgba(255,140,0,0.12)' : (conv.icon_bg || 'var(--bg-card)');
            const brandedImage = !teamInbox ? conv.image_url : null;
            return (
              <div key={conv.id} onClick={() => setSelectedConvo(conv)} className="card-sm" style={{
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              }}>
                {brandedImage ? (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  }}>
                    <img src={brandedImage} alt={displayTitle}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: iconBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                  }}>
                    {displayIcon}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: 600, fontSize: 15 }}>{displayTitle}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(conv.last_message_at)}</p>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.last_message || 'No messages yet'}
                  </p>
                </div>
              </div>
            );
          })}
        </>
      )}

      {conversations.length === 0 && (
        <div className="placeholder-page">
          <p style={{ color: 'var(--text-secondary)' }}>No conversations yet</p>
        </div>
      )}
    </div>
  );
}
