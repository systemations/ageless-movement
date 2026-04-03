import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import MessageThread from '../client/MessageThread';

export default function CoachGroups() {
  const { token } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => { fetchGroups(); }, []);

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/messages/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.conversations.filter(c => c.type === 'group'));
      }
    } catch (err) { console.error(err); }
  };

  if (selectedGroup) {
    return <MessageThread conversationId={selectedGroup.id} title={selectedGroup.title} onBack={() => { setSelectedGroup(null); fetchGroups(); }} />;
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Groups</h1>
        <button className="header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        </button>
      </div>

      {groups.map((group) => (
        <div
          key={group.id}
          onClick={() => setSelectedGroup(group)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
            borderBottom: '1px solid var(--divider)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: group.icon_bg || 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
          }}>
            {group.icon || '💬'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>{group.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(group.last_message_at)}</p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {group.last_message || 'No messages yet'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
