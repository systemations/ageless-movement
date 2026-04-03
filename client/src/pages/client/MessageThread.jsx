import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function MessageThread({ conversationId, title, onBack }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [convo, setConvo] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => clearInterval(pollRef.current);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setConvo(data.conversation);
      }
    } catch (err) { console.error(err); }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() }),
      });
      setInput('');
      fetchMessages();
    } catch (err) { console.error(err); }
    setSending(false);
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Group messages by date
  const grouped = [];
  let lastDate = '';
  messages.forEach(msg => {
    const date = formatDate(msg.created_at);
    if (date !== lastDate) {
      grouped.push({ type: 'date', label: date });
      lastDate = date;
    }
    grouped.push({ type: 'message', ...msg });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--divider)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title || convo?.title || 'Chat'}</h2>
        </div>
        <button style={{ background: 'none', border: 'none', color: 'var(--accent-mint)', padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
        {grouped.map((item, i) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${i}`} style={{ textAlign: 'center', margin: '16px 0 8px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-card)', padding: '4px 12px', borderRadius: 10 }}>
                  {item.label}
                </span>
              </div>
            );
          }

          const isMe = item.sender_id === user.id;
          return (
            <div key={item.id} style={{
              display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
              gap: 8, marginBottom: 8, alignItems: 'flex-end',
            }}>
              {!isMe && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#000',
                }}>
                  {item.sender_name?.charAt(0) || '?'}
                </div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 16,
                background: isMe ? 'var(--accent-mint)' : 'var(--bg-card)',
                color: isMe ? '#000' : 'var(--text-primary)',
                borderBottomRightRadius: isMe ? 4 : 16,
                borderBottomLeftRadius: isMe ? 16 : 4,
              }}>
                {!isMe && convo?.type === 'group' && (
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-mint)', marginBottom: 2 }}>{item.sender_name}</p>
                )}
                <p style={{ fontSize: 14, lineHeight: 1.4 }}>{item.content}</p>
                <p style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{formatTime(item.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px 24px', borderTop: '1px solid var(--divider)',
        flexShrink: 0, background: 'var(--bg-primary)',
      }}>
        <button style={{
          width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{
            flex: 1, background: 'var(--bg-card)', border: 'none', borderRadius: 20,
            padding: '10px 16px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: input.trim() ? 'var(--accent-mint)' : 'var(--bg-card)',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#000' : 'var(--text-tertiary)'} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}
