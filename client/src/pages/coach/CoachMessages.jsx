import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SearchIcon } from '../../components/Icons';
import MessageThread from '../client/MessageThread';

export default function CoachMessages() {
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
        setConversations(data.conversations.filter(c => c.type === 'direct'));
      }
    } catch (err) { console.error(err); }
  };

  if (selectedConvo) {
    return <MessageThread conversationId={selectedConvo.id} title={selectedConvo.other_user?.name} onBack={() => { setSelectedConvo(null); fetchConversations(); }} />;
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Messages</h1>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="header-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button className="header-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </button>
          <button className="header-icon"><SearchIcon /></button>
        </div>
      </div>

      {conversations.map((conv) => (
        <div
          key={conv.id}
          onClick={() => setSelectedConvo(conv)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
            borderBottom: '1px solid var(--divider)', cursor: 'pointer',
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)',
            }}>
              {conv.other_user?.name?.substring(0, 2).toUpperCase() || '??'}
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
              borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--bg-primary)',
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>{conv.other_user?.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(conv.last_message_at)}</p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.last_message || 'No messages yet'}
            </p>
          </div>
        </div>
      ))}

      {conversations.length === 0 && (
        <div className="placeholder-page">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
