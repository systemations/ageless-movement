import pool from '../db/pool.js';

// Shared helpers for the upload access registry (SECURITY.md L1).
//
// Files are keyed in file_assets by their BASENAME (e.g. `<uuid>.mp4`), not the
// full URL path. Filenames are globally-unique UUIDs, so the basename is a
// collision-free key — and it's exactly what the /uploads gate extracts from
// the request path, including for files in a subdirectory like
// `/uploads/benchmarks/<uuid>.mp4` (benchmark videos). Keying by anything else
// (e.g. the sub-path) makes the gate miss the row and fall back to "allow".

// Basename of an uploaded-file URL or path. Returns null for non-/uploads
// values (external URLs, empty) so callers skip them.
export function fileKey(urlOrPath) {
  if (typeof urlOrPath !== 'string' || !urlOrPath.includes('/uploads/')) return null;
  return urlOrPath.split('/').filter(Boolean).pop() || null;
}

// Register an uploaded file's owner + visibility. Idempotent (filename PK).
// visibility: 'private' (owner + their coach), 'content' (any authed user),
// 'message' (conversation members — set when a chat message is posted).
export function registerFileAsset(filename, ownerId, visibility, conversationId = null) {
  if (!filename) return;
  pool.query(
    'INSERT OR IGNORE INTO file_assets (filename, owner_user_id, visibility, conversation_id) VALUES (?, ?, ?, ?)',
    [filename, ownerId ?? null, visibility, conversationId],
  );
}
