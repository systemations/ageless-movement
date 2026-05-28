import { useEffect, useState } from 'react';

// "Mark all read" pill in the inbox header. Hits POST /api/messages/read-all
// then fires the same am:messages-read event MessageThread uses so the bottom
// nav badge clears in the same tick. Polls the unread count so it only renders
// when there's actually something to clear (no point showing the button on a
// quiet inbox).
export default function MarkAllRead({ token, onDone }) {
  const [busy, setBusy] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // Re-check on mount + whenever the global read event fires so the button
  // hides itself the instant the user clears their last unread.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/api/messages/unread-count', { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (alive) setHasUnread((d.count || 0) > 0);
      } catch { /* keep current state */ }
    };
    check();
    const onRead = () => check();
    window.addEventListener('am:messages-read', onRead);
    window.addEventListener('focus', onRead);
    return () => {
      alive = false;
      window.removeEventListener('am:messages-read', onRead);
      window.removeEventListener('focus', onRead);
    };
  }, [token]);

  const run = async () => {
    setBusy(true);
    try {
      await fetch('/api/messages/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      window.dispatchEvent(new Event('am:messages-read'));
      if (onDone) onDone();
    } catch (e) { /* swallow - next poll catches it */ }
    setBusy(false);
  };

  if (!hasUnread) return null;

  return (
    <button
      onClick={run}
      disabled={busy}
      style={{
        padding: '8px 14px', borderRadius: 18, border: 'none',
        background: 'var(--accent-mint)', color: '#000',
        fontSize: 12, fontWeight: 800,
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {busy ? '...' : 'Mark all read'}
    </button>
  );
}
