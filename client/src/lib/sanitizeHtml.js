import DOMPurify from 'dompurify';

// Centralised HTML sanitiser for coach-authored rich text (course + lesson
// descriptions from the TipTap editor) before it reaches
// dangerouslySetInnerHTML. DOMPurify strips <script>, inline event handlers
// (onerror=, onclick=, ...) and javascript:/unsafe-data: URLs, which closes
// the stored-XSS path where a poisoned description could run script in a
// viewer's session and exfiltrate their localStorage token.
// See SECURITY.md finding F1.
//
// We keep DOMPurify's default (permissive) tag/attribute allowlist so every
// TipTap formatting feature survives — headings, lists, links, images,
// text-align, colour, highlight — and only the dangerous bits are removed.

// Harden links that open in a new tab against reverse tabnabbing. Runs once
// at import; applies to every sanitize() call.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeHtml(dirty) {
  if (dirty == null) return '';
  return DOMPurify.sanitize(String(dirty));
}
