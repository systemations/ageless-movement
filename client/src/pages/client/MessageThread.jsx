import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeUrl } from '../../lib/safeUrl';
import { useAuth } from '../../context/AuthContext';

// Tier visuals shared with the Clients list + Messages inbox so the user
// always sees the same colour for a given tier.
const TIER_COLORS = {
  Free:    { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
  Starter: { bg: 'rgba(56,189,248,0.18)',  fg: '#38bdf8' },
  Prime:   { bg: 'rgba(255,140,0,0.18)',   fg: '#FF8C00' },
  Elite:   { bg: 'rgba(236,72,153,0.18)',  fg: '#ec4899' },
};

export default function MessageThread({ conversationId, title, subtitle, onBack, hideBackButton = false }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [convo, setConvo] = useState(null);
  const [client, setClient] = useState(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuMsgId, setMenuMsgId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null); // { top, left } viewport coords for the open options menu
  const [reactorsFor, setReactorsFor] = useState(null); // { messageId, emoji } - tapped chip → show names
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    // Reset initial-scroll flag whenever we open a different conversation so
    // the next load re-pins to the bottom regardless of current scroll state.
    initialScrollDoneRef.current = false;
    fetchMessages(true);
    pollRef.current = setInterval(() => fetchMessages(false), 5000);
    return () => clearInterval(pollRef.current);
  }, [conversationId]);

  // On first non-empty render, force-scroll to the bottom. On subsequent
  // renders (polling) only auto-scroll if the user was already near the
  // bottom - otherwise we'd yank them back down mid-scroll-up.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el || messages.length === 0) return;
    const pin = () => { el.scrollTop = el.scrollHeight; };
    if (!initialScrollDoneRef.current) {
      // Double rAF so layout + any image metadata settle before we pin.
      requestAnimationFrame(() => requestAnimationFrame(pin));
      initialScrollDoneRef.current = true;
      // Re-pin when any image inside the thread finishes loading so a
      // photo growing the scrollHeight can't strand the user mid-thread.
      // Also re-pin a couple of times in the first second to cover late
      // layout shifts (fonts, embeds). All gated on user not having
      // scrolled away in the meantime.
      const repinIfStillAtBottom = () => {
        if (!messagesRef.current) return;
        const m = messagesRef.current;
        const dist = m.scrollHeight - m.scrollTop - m.clientHeight;
        if (dist < 200) m.scrollTop = m.scrollHeight;
      };
      const imgs = el.querySelectorAll('img');
      imgs.forEach(img => {
        if (!img.complete) img.addEventListener('load', repinIfStillAtBottom, { once: true });
      });
      const t1 = setTimeout(repinIfStillAtBottom, 250);
      const t2 = setTimeout(repinIfStillAtBottom, 750);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) pin();
  }, [messages.length]);

  // Close message menu / reactors popover on outside click
  useEffect(() => {
    const h = () => { setMenuMsgId(null); setReactorsFor(null); };
    if (menuMsgId != null || reactorsFor != null) {
      window.addEventListener('click', h);
      return () => window.removeEventListener('click', h);
    }
  }, [menuMsgId, reactorsFor]);

  const fetchMessages = async (markRead) => {
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setConvo(data.conversation);
        setClient(data.client || null);
        setOtherLastReadAt(data.other_last_read_at || null);
        if (markRead) {
          // Auto-mark read on open (per-user state). Fire a window event so
          // BottomNav re-fetches its unread badge immediately - otherwise it
          // sits on the old count until the next 30s poll.
          fetch(`/api/messages/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(() => window.dispatchEvent(new Event('am:messages-read')))
            .catch(() => {});
        }
      }
    } catch (err) { console.error(err); }
  };

  const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '👏'];
  const MENU_W = 244; // fixed options-menu width, used to clamp it within the viewport

  // Open the options menu anchored just below the tapped ⋯ button, clamped so
  // it never spills off either screen edge (long own-messages push the dots
  // close to the right edge; short ones keep them there too).
  const openMenu = (messageId, btn) => {
    const r = btn.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - MENU_W - 8);
    const top = Math.min(r.bottom + 4, window.innerHeight - 160);
    setMenuAnchor({ top, left });
    setMenuMsgId(messageId);
  };

  const toggleReaction = async (messageId, emoji) => {
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: data.reactions } : m));
      setMenuMsgId(null);
    } catch (err) { console.error(err); }
  };

  const markMessageUnread = async (messageId) => {
    try {
      await fetch(`/api/messages/conversations/${conversationId}/unread`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      });
      setMenuMsgId(null);
      // Back to the inbox so unread badge re-renders immediately
      onBack?.();
    } catch (err) { console.error(err); }
  };

  // Coach-only: flag this message as unread for a *different* coach so it
  // shows up in their inbox. Used to route client replies to a specific
  // teammate (e.g. "hand this one off to Joonas").
  const markUnreadForCoach = async (messageId, targetCoachId) => {
    try {
      await fetch(`/api/messages/conversations/${conversationId}/unread-for`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, target_user_id: targetCoachId }),
      });
      setMenuMsgId(null);
    } catch (err) { console.error(err); }
  };

  // Fetch other coaches once for the "Mark unread for..." menu. Excludes
  // the current coach (they have their own Mark-as-unread button).
  const [otherCoaches, setOtherCoaches] = useState([]);
  useEffect(() => {
    if (user?.role !== 'coach') return;
    fetch('/api/coaches', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { coaches: [] })
      .then(d => setOtherCoaches((d.coaches || []).filter(c => c.id !== user.id)))
      .catch(() => {});
  }, [token, user]);

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

  // Attach a photo: upload to /api/upload, then post it as an image message
  // (with whatever caption is already typed, if any).
  const handleAttach = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-picked later
    if (!file || uploading || sending) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!up.ok) throw new Error('Upload failed');
      const { url } = await up.json();
      await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim(), attachment_url: url, message_type: 'image' }),
      });
      setInput('');
      fetchMessages();
    } catch (err) { console.error(err); }
    setUploading(false);
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
    <div style={{
      display: 'flex', flexDirection: 'column',
      // Embedded use (hideBackButton=true) fills its parent container; stand-alone
      // uses the dynamic viewport height (dvh) so the input bar isn't hidden
      // behind the mobile browser's bottom toolbar (100vh ignores it).
      height: hideBackButton ? '100%' : '100dvh',
      background: 'var(--bg-primary)', minHeight: 0,
    }}>
      {/* Header - omit the big avatar-coloured back button when we're embedded,
          since the parent workspace already has a header with the client name. */}
      {!hideBackButton && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderBottom: '1px solid var(--divider)', flexShrink: 0,
        }}>
          <button onClick={onBack} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title || convo?.title || 'Chat'}
              </h2>
              {client?.tier_name && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                  background: (TIER_COLORS[client.tier_name] || TIER_COLORS.Free).bg,
                  color: (TIER_COLORS[client.tier_name] || TIER_COLORS.Free).fg,
                  textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0,
                }}>
                  {client.tier_name}
                </span>
              )}
            </div>
            {subtitle && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{subtitle}</p>}
          </div>
        </div>
      )}

      {/* Slim subtitle strip when embedded - explains that this is the team
          inbox without visually competing with the client header above. */}
      {hideBackButton && subtitle && (
        <div style={{
          padding: '8px 14px', flexShrink: 0,
          borderBottom: '1px solid var(--divider)',
          background: 'rgba(255,140,0,0.04)',
          fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: 0.3,
        }}>
          {subtitle}
        </div>
      )}

      {/* Messages */}
      <div ref={messagesRef} style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
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
          // Show sender name on any multi-party conversation (team inbox or group)
          const showSender = !isMe && (convo?.type === 'group' || convo?.client_id != null);
          const menuOpen = menuMsgId === item.id;
          return (
            <div key={item.id} style={{
              display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
              gap: 8, marginBottom: 8, alignItems: 'flex-end',
            }}>
              {!isMe && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                  background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff',
                }}>
                  {item.sender_avatar
                    ? <img src={item.sender_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : ((item.sender_name || '').replace(/^coach\s+/i, '').trim().charAt(0).toUpperCase() || '?')}
                </div>
              )}
              <div style={{ position: 'relative', maxWidth: '75%' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 16,
                  background: isMe
                    ? (otherLastReadAt && item.created_at <= otherLastReadAt
                        ? 'var(--mint-read)'
                        : 'var(--accent-mint)')
                    : 'var(--bg-card)',
                  color: isMe ? '#000' : 'var(--text-primary)',
                  borderBottomRightRadius: isMe ? 4 : 16,
                  borderBottomLeftRadius: isMe ? 16 : 4,
                  transition: 'background 0.3s',
                }}>
                  {showSender && (
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>
                      {item.sender_name}
                      {item.sender_role === 'coach' && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.8 }}>COACH</span>}
                    </p>
                  )}
                  {item.attachment_url && (
                    <img
                      src={item.attachment_url}
                      alt="attachment"
                      loading="lazy"
                      onClick={() => window.open(item.attachment_url, '_blank', 'noopener')}
                      style={{
                        display: 'block', maxWidth: '100%', maxHeight: 260, borderRadius: 10,
                        marginBottom: item.content ? 6 : 2, cursor: 'pointer',
                      }}
                    />
                  )}
                  {item.content && (
                    <p style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{item.content}</p>
                  )}
                  <p style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{formatTime(item.created_at)}</p>
                </div>
                {/* Reaction chips under the bubble. Tap a chip to toggle your
                    own reaction; tap the count to see who reacted. */}
                {item.reactions && item.reactions.length > 0 && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4,
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                  }}>
                    {item.reactions.map(chip => {
                      const showingReactors = reactorsFor?.messageId === item.id && reactorsFor?.emoji === chip.emoji;
                      return (
                        <div key={chip.emoji} style={{ position: 'relative' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Single tap on own chip → toggle; otherwise first
                              // tap reveals reactor list, second toggles.
                              if (showingReactors) {
                                toggleReaction(item.id, chip.emoji);
                                setReactorsFor(null);
                              } else {
                                setReactorsFor({ messageId: item.id, emoji: chip.emoji });
                              }
                            }}
                            title={chip.users.map(u => u.name).join(', ')}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px', borderRadius: 12, border: chip.mine ? '1px solid var(--accent-mint)' : '1px solid var(--divider)',
                              background: chip.mine ? 'rgba(133,255,186,0.15)' : 'var(--bg-card)',
                              color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            <span style={{ fontSize: 13 }}>{chip.emoji}</span>
                            <span style={{ fontSize: 11, fontWeight: 600 }}>{chip.count}</span>
                          </button>
                          {showingReactors && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'absolute', top: 'calc(100% + 4px)', [isMe ? 'right' : 'left']: 0,
                                background: 'var(--bg-card)', border: '1px solid var(--divider)',
                                borderRadius: 8, padding: '6px 10px', zIndex: 10,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: 140,
                                fontSize: 12,
                              }}
                            >
                              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                Reacted {chip.emoji}
                              </p>
                              {chip.users.map(u => (
                                <p key={u.id} style={{ fontSize: 12, color: 'var(--text-primary)', padding: '2px 0' }}>{u.name}</p>
                              ))}
                              {chip.mine && (
                                <button
                                  onClick={() => { toggleReaction(item.id, chip.emoji); setReactorsFor(null); }}
                                  style={{
                                    marginTop: 6, background: 'none', border: 'none',
                                    color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                                    cursor: 'pointer', padding: 0,
                                  }}
                                >Remove your reaction</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Options menu - reactions for everyone; mark-unread only on others' messages */}
                <button
                  onClick={(e) => { e.stopPropagation(); menuOpen ? setMenuMsgId(null) : openMenu(item.id, e.currentTarget); }}
                  title="Message options"
                  style={{
                    position: 'absolute', top: 2, [isMe ? 'left' : 'right']: -28,
                    width: 24, height: 24, borderRadius: '50%', border: 'none',
                    background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, padding: 0,
                  }}
                >⋯</button>
                {menuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed', top: menuAnchor?.top ?? 0, left: menuAnchor?.left ?? 0,
                      width: MENU_W,
                      background: 'var(--bg-card)', border: '1px solid var(--divider)',
                      borderRadius: 10, padding: 6, zIndex: 50,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 2, marginBottom: !isMe ? 4 : 0 }}>
                      {QUICK_EMOJIS.map(e => (
                        <button
                          key={e}
                          onClick={() => toggleReaction(item.id, e)}
                          style={{
                            flex: 1, padding: '6px 4px', background: 'none', border: 'none',
                            fontSize: 18, cursor: 'pointer', borderRadius: 6,
                          }}
                          onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          onMouseLeave={ev => ev.currentTarget.style.background = 'none'}
                        >{e}</button>
                      ))}
                    </div>
                    {!isMe && (
                      <>
                        <button
                          onClick={() => markMessageUnread(item.id)}
                          style={{
                            width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                            color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                            borderRadius: 6,
                          }}
                        >
                          Mark as unread
                        </button>
                        {/* Coach-only: hand this message off to another coach's inbox */}
                        {user?.role === 'coach' && otherCoaches.length > 0 && (
                          <>
                            <div style={{ height: 1, background: 'var(--divider)', margin: '4px 6px' }} />
                            <p style={{
                              fontSize: 9, fontWeight: 800, color: 'var(--text-tertiary)',
                              letterSpacing: 0.8, textTransform: 'uppercase', padding: '4px 12px 2px',
                            }}>
                              Mark unread for...
                            </p>
                            {otherCoaches.map(c => {
                              const short = (c.name || '').replace(/^coach\s+/i, '').trim().split(/\s+/)[0] || c.name;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => markUnreadForCoach(item.id, c.id)}
                                  style={{
                                    width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                                    color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                                    borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
                                  }}
                                >
                                  {c.photo_url || c.avatar_url
                                    ? <img src={c.photo_url || c.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                                    : <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{short.charAt(0).toUpperCase()}</div>}
                                  <span>{short}</span>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Read-only groups render a CTA panel instead of a message input.
          Used for "Feedback & Testimonials" and any announcement-style group. */}
      {convo && convo.chat_enabled === 0 ? (
        <div style={{
          // Clear the floating bottom-nav pill so the feedback link is tappable.
          padding: hideBackButton ? '14px 12px' : '14px 16px calc(88px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--divider)',
          flexShrink: 0, background: 'var(--bg-primary)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 10 }}>
            Chat is read-only here - use the link below to contribute.
          </p>
          {convo.cta_url ? (
            // Internal routes (e.g. /feedback) navigate in-app; external URLs
            // open in a new tab.
            convo.cta_url.startsWith('/') ? (
              <button
                onClick={() => navigate(convo.cta_url)}
                style={{
                  display: 'block', width: '100%', textAlign: 'center', border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff', borderRadius: 22, padding: '12px 16px',
                  fontSize: 13, fontWeight: 800,
                }}
              >
                {convo.cta_label || 'Open'} →
              </button>
            ) : (
              <a
                href={safeUrl(convo.cta_url) || undefined}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block', textAlign: 'center',
                  background: 'var(--accent)', color: '#fff', borderRadius: 22, padding: '12px 16px',
                  fontSize: 13, fontWeight: 800, textDecoration: 'none',
                }}
              >
                {convo.cta_label || 'Open link'} ↗
              </a>
            )
          ) : null}
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: 8,
          // Clear the floating bottom-nav pill (fixed ~12px from the bottom)
          // + the iOS home indicator, so the input isn't hidden behind it.
          padding: hideBackButton ? '10px 12px' : '8px 16px calc(84px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--divider)',
          flexShrink: 0, background: 'var(--bg-primary)',
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            title="Attach a photo"
            style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1,
            }}>
            {uploading
              ? <span style={{ fontSize: 16 }}>⏳</span>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAttach}
            style={{ display: 'none' }}
          />
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
      )}
    </div>
  );
}
