import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import MessageThread from './MessageThread';

export default function Messages() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);

  useEffect(() => { fetchConversations(); }, []);

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
    const title = selectedConvo.type === 'direct'
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
        <button className="header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </button>
      </div>

      {/* Direct Messages */}
      {direct.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>DIRECT MESSAGES</p>
          {direct.map((conv) => (
            <div key={conv.id} onClick={() => setSelectedConvo(conv)} className="card-sm" style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, color: '#000',
              }}>
                {conv.other_user?.name?.charAt(0) || '?'}
              </div>
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
          {groups.map((conv) => (
            <div key={conv.id} onClick={() => setSelectedConvo(conv)} className="card-sm" style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: conv.icon_bg || 'var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
              }}>
                {conv.icon || '💬'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{conv.title}</p>
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

      {conversations.length === 0 && (
        <div className="placeholder-page">
          <p style={{ color: 'var(--text-secondary)' }}>No conversations yet</p>
        </div>
      )}
    </div>
  );
}
