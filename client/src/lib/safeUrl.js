// Validate a user/coach-authored URL before it reaches an href or
// window.open. Coach-set fields (group/notification/tier CTAs, event meeting
// links, social links) were bound straight to href/window.open with no scheme
// check, so a `javascript:` (or `data:`/`vbscript:`) value would execute in a
// viewer's session. See SECURITY.md finding F2.
//
// Returns the original URL when it's safe to navigate to, or null when it
// isn't (callers should treat null as "no link"). Allowed: in-app/relative
// paths (leading "/") and the http/https/mailto/tel schemes.

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // In-app routes / same-origin paths. Reject "//host" (protocol-relative)
  // here so it goes through protocol parsing below instead of slipping past.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
