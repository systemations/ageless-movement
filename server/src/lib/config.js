// Centralised server config. Loads from process.env and enforces that
// security-critical values are set in production — so a missed Render env
// var crashes the boot instead of silently running with a dev default.
//
// dotenv is loaded *here* (not just in index.js) because ESM imports hoist
// before side-effect code, so any module that imports `config` would see an
// empty process.env if dotenv were only configured in the entrypoint.
import 'dotenv/config';
import crypto from 'crypto';

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// The old baked-in default. Anyone still using this in prod is shipping
// a known-bad secret — treat it as if the env var is unset.
const LEGACY_DEV_SECRET = 'ageless-movement-jwt-secret-change-in-production';

function loadJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  const isMissing = !fromEnv || fromEnv === LEGACY_DEV_SECRET;
  if (isMissing && IS_PROD) {
    // Refuse to boot. A running server with a known secret is worse than
    // no server at all — anyone with the secret can forge tokens.
    throw new Error(
      'JWT_SECRET is missing or uses the legacy dev default. Set a long random value in the production environment before launching.',
    );
  }
  if (isMissing) {
    // Dev: generate an ephemeral secret so the server still boots. Every
    // restart invalidates existing sessions — annoying but safe.
    const ephemeral = crypto.randomBytes(48).toString('hex');
    console.warn('[config] JWT_SECRET not set; generated ephemeral dev secret. Set JWT_SECRET in .env for stable sessions.');
    return ephemeral;
  }
  if (fromEnv.length < 32 && IS_PROD) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  return fromEnv;
}

// Comma-separated list of origins allowed to hit the API in production.
// e.g. ALLOWED_ORIGINS=https://app.agelessmovement.com,https://www.agelessmovement.com
// If empty in production, CORS is effectively off (API only accepts same-origin
// requests, which is the target state once client is served from the same host).
function loadAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export const config = {
  NODE_ENV,
  IS_PROD,
  PORT: Number(process.env.PORT) || 3001,
  JWT_SECRET: loadJwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  ALLOWED_ORIGINS: loadAllowedOrigins(),
};

// Fields that must NEVER appear in logs. Used by request-body scrubber.
export const SENSITIVE_FIELDS = new Set([
  'password', 'current', 'new_password', 'newPw', 'newPassword',
  'confirm', 'token', 'jwt', 'secret', 'authorization',
  'card', 'cvv', 'card_number', 'stripe_secret',
]);
