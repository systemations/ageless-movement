import pool from '../db/pool.js';

// Resolve the tier level for a given user id. Coaches always return
// Infinity so they bypass every guard while previewing content.
export function clientTierLevel(userId) {
  const role = pool.query('SELECT role FROM users WHERE id = ?', [userId]).rows[0]?.role;
  if (role === 'coach') return Infinity;
  const tierId = pool.query('SELECT tier_id FROM client_profiles WHERE user_id = ?', [userId]).rows[0]?.tier_id || 1;
  return pool.query('SELECT level FROM tiers WHERE id = ?', [tierId]).rows[0]?.level || 0;
}

// Returns { ok: true } or { ok: false, required_tier } when the client's
// tier level is below itemLevel. Stops clients deep-linking around the
// Explore lock overlays.
export function enforceTier(userId, itemLevel) {
  const mine = clientTierLevel(userId);
  if (mine >= (itemLevel || 0)) return { ok: true };
  const required = pool.query('SELECT * FROM tiers WHERE level = ? ORDER BY id LIMIT 1', [itemLevel]).rows[0];
  return { ok: false, required_tier: required || null };
}
