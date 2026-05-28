// Date helpers that handle the SQLite-on-server quirk: created_at columns
// default to `datetime('now')` which returns "YYYY-MM-DD HH:MM:SS" in UTC
// WITHOUT a trailing 'Z'. Pass that string straight to `new Date(...)` and
// the browser parses it as local time, so for anyone outside UTC the "15
// mins ago" math is wrong by their offset (e.g. Sydney UTC+10 shows a
// timestamp from 10h ago as fresh, and vice versa).
//
// parseDbDate normalises both shapes: ISO strings with a TZ marker pass
// through, bare SQLite strings get 'Z' appended so they're treated as UTC.

export function parseDbDate(s) {
  if (!s) return null;
  const str = String(s);
  // Already has a tz marker (Z, +hh:mm, -hh:mm) -> trust it.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  // Bare SQLite datetime "2026-05-28 02:15:00" -> treat as UTC.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(str)) return new Date(str.replace(' ', 'T') + 'Z');
  // Date-only "2026-05-28" stays as-is (local-midnight is what we want for "today" comparisons).
  return new Date(str);
}

// Standard relative-time formatter. Shared across coach surfaces so they
// all agree on phrasing (and all parse UTC correctly).
export function formatRelative(s) {
  const d = parseDbDate(s);
  if (!d) return 'Never';
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
