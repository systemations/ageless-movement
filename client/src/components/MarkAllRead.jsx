import { useState } from 'react';

// Small "Mark all read" pill in the inbox header. Hits POST /api/messages/read-all
// then fires the same am:messages-read event MessageThread uses so the bottom-
// nav badge clears in the same tick. Disabled briefly while in flight to
// prevent a double-tap stampede.
export default function MarkAllRead({ token, onDone }) {
  const [busy, setBusy] = useState(false);

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

  return (
    <button
      onClick={run}
      disabled={busy}
      style={{
        padding: '6px 10px', borderRadius: 16,
        border: '1px solid var(--divider)', background: 'transparent',
        color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700,
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {busy ? '...' : 'Mark all read'}
    </button>
  );
}
