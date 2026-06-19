import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Native (Capacitor) networking + auth adaptation.
//
// The WEB build is untouched: same-origin relative `/api` URLs + the httpOnly
// cookie auth (SECURITY.md L1/L2). In the native shell the app loads from
// capacitor://localhost, so relative URLs and cross-origin cookies don't work.
// On native we therefore:
//   1. point API calls at a real server (API_BASE),
//   2. authenticate API calls with a Bearer token (the server returns the JWT
//      in the login/register response; the web client just ignores it), and
//   3. make <img src="/uploads/..."> work — those can't send a Bearer header, so
//      we rewrite /uploads URLs in JSON responses to absolute, token-signed URLs
//      (?ft=<file token>). The /uploads gate validates the token and still
//      enforces the per-file L1 access check.
//
// Set the server at build time via VITE_NATIVE_API_BASE:
//   dev  → your PC's LAN IP, e.g. http://192.168.1.20:3001
//   prod → the deployed API origin, e.g. https://api.agelessmovement.com

export const isNative = Capacitor.isNativePlatform();
const API_BASE = (import.meta.env.VITE_NATIVE_API_BASE || '').replace(/\/+$/, '');
const TOKEN_KEY = 'am_native_token';

let nativeToken = null; // the JWT, sent as Bearer on API calls
let fileToken = null;   // short file-only token appended to /uploads URLs

// Load the persisted JWT into memory (call once at boot, before any fetch).
export async function loadNativeToken() {
  if (!isNative) return null;
  try {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    nativeToken = value || null;
  } catch { nativeToken = null; }
  return nativeToken;
}

// Persist (or clear) the JWT after login / logout.
export async function setNativeToken(token) {
  nativeToken = token || null;
  if (!isNative) return;
  try {
    if (token) await Preferences.set({ key: TOKEN_KEY, value: token });
    else await Preferences.remove({ key: TOKEN_KEY });
  } catch { /* ignore */ }
}

// Mint the file-access token (Bearer-authenticated) so native <img> requests can
// load /uploads media. Call once the JWT is available (boot + after login).
export async function loadFileToken() {
  if (!isNative || !API_BASE || !nativeToken) return;
  try {
    const r = await fetch('/api/auth/file-token');
    if (r.ok) fileToken = (await r.json()).token || null;
  } catch { /* leave null; images retry on next mint */ }
}

export function clearFileToken() { fileToken = null; }

// Native chrome (Phase 3): style the status bar to the dark theme (so it doesn't
// clash) and hide the launch splash once the app is up. Plugins are dynamically
// imported so they never load in the web bundle. Best-effort — failures here
// must never block the app.
export async function configureNativeUI() {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false }); // solid bar above the content
    await StatusBar.setStyle({ style: Style.Dark });        // "Dark" = light icons, for our dark bg
    await StatusBar.setBackgroundColor({ color: '#060D1A' }); // Android only; no-op elsewhere
  } catch { /* status-bar styling is non-critical */ }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* ignore */ }
}

// Install a global fetch wrapper (native only): rewrite app-relative /api and
// /uploads URLs to API_BASE, attach the Bearer token, and rewrite /uploads URLs
// inside JSON responses so images load. The web build is untouched.
export function installNativeFetch() {
  if (!isNative) return;
  if (!API_BASE) {
    console.warn('[nativeApi] VITE_NATIVE_API_BASE is not set — API calls will fail in the native build.');
    return;
  }
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    if (typeof input !== 'string' || !(input.startsWith('/api') || input.startsWith('/uploads'))) {
      return orig(input, init);
    }
    const headers = new Headers(init.headers || {});
    if (nativeToken) headers.set('Authorization', `Bearer ${nativeToken}`);
    const res = await orig(API_BASE + input, { ...init, headers, credentials: 'omit' });

    // Rewrite "/uploads/<path>" → "API_BASE/uploads/<path>?ft=<token>" in JSON
    // bodies so every <img src> across the app resolves + authenticates with no
    // per-component changes. Guarded + best-effort: on any error, return as-is.
    if (fileToken) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        try {
          const text = await res.clone().text();
          if (text.includes('/uploads/')) {
            const fixed = text.replace(
              /"\/uploads\/([^"?\\]+)"/g,
              (_m, p) => `"${API_BASE}/uploads/${p}?ft=${fileToken}"`,
            );
            const h = new Headers(res.headers);
            h.delete('content-length'); // body length changed
            return new Response(fixed, { status: res.status, statusText: res.statusText, headers: h });
          }
        } catch { /* fall through to the original response */ }
      }
    }
    return res;
  };
}
