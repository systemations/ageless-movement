# Security — Ageless Movement V1 alpha

Honest documentation of the security posture as the app enters internal
red-team review. Read this before poking at the app — it explains what we
already know about and are deferring, so your time is best spent on the
unknowns.

## Threat model

- **Health + personal data:** names, emails, tier, photos, body
  measurements, check-in text, benchmark results, supplements taken.
- **Uploaded media:** profile photos, progress photos, check-in photos,
  benchmark verification videos.
- **Payments (not yet wired):** Stripe integration pending. Cards never
  touch our servers (Stripe Elements tokenises client-side).
- **GDPR:** EU users in scope. Render service runs in Frankfurt region
  (Ageless Movement is Ireland-based).

## What's in place (solid)

### Auth
- Passwords hashed with bcrypt (cost 10).
- JWT secret enforced from env in prod — server refuses to boot if unset
  or uses the legacy dev default. 32-char minimum in prod.
- JWT algorithm pinned to `HS256` on verify (defence-in-depth against
  `none`-algorithm attacks even though jsonwebtoken >=9 blocks them).
- Rate limits: login 10/15m, signup 5/hr, password reset 10/15m per IP.
- Password reset tokens are 32-byte random (`crypto.randomBytes`), single
  use, expiry enforced server-side at validation time.

### Authorization
- `requireCoachOwnsClient(param)` + `requireCoachOwnsClientBody(bodyKey)`
  middlewares guard coach routes that touch per-client data.
- Tier guards on Explore detail endpoints return 403 with
  `required_tier` so locked content can't be deep-linked.
- Enrolment bypass for programs/workouts: once a client is enrolled,
  they keep access even if their tier later drops.

### Input handling
- All SQL parameterised via `?` bindings (better-sqlite3). Dynamic field
  names (e.g. `notification_reads.dismissed_at` vs `completed_at`) gated
  through a hard-coded whitelist before string interpolation.
- Express body limit: 1MB JSON + 1MB urlencoded.
- Multer uploads: mime-type whitelist, 10MB size cap (50MB for benchmark
  videos), UUID filenames (never user-controlled), files-count cap.

### Transport + headers
- HTTPS terminated at Render.
- `helmet` default headers active: HSTS (prod), X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, hidden X-Powered-By. CSP is **off**
  — documented below.
- CORS locked to `ALLOWED_ORIGINS` env list in prod. Dev keeps open CORS
  for Postman + the Vite proxy.
- `trust proxy` set in prod so rate limiters key off the real client IP.

### Secrets + deps
- `.env` gitignored. `.env.example` documents every env the server reads.
- `npm audit` clean on server + client (0 vulnerabilities) at commit time.

## Security status tracker

At-a-glance status of every known security item. Update the status here when
you ship a fix, and log the change in [CHANGELOG.md](CHANGELOG.md).
Legend: ✅ Done · 🟡 In progress · ⬜ Open (deferred / not started).

| Item | Area | Status | Notes |
|------|------|--------|-------|
| L1 — Public upload URLs | Uploads | ✅ Done | 2026-06-12 — `/uploads` gated behind a session cookie (`am_file`); anonymous URL fetches now 403. Per-user authz still open (any logged-in user with a URL can fetch) |
| L2 — JWT in `localStorage` | Auth | ✅ Done | 2026-06-13 — real JWT moved to an httpOnly + SameSite=Lax `am_auth` cookie ([auth.js](server/src/middleware/auth.js)); the SPA holds only a sentinel ([AuthContext.jsx](client/src/context/AuthContext.jsx)), so XSS can't read the token. CSRF via SameSite=Lax + prod Origin check. Verified |
| L3 — JWT revocation | Auth | ✅ Done | 2026-06-12 — server-side `sessions` table (id in JWT `sid`); logout + password-change/reset revoke instantly; backward-compatible with pre-feature tokens. Verified |
| L4 — SQLite not encrypted at rest | Data | ⬜ Open | Postgres migration planned |
| L5 — Account deletion / export | GDPR | ✅ Done | 2026-06-12 — self-service GDPR export + password-gated account deletion ([gdpr.js](server/src/routes/gdpr.js)); UI on client Profile. Verified end-to-end |
| L6 — Data-access audit log | Observability | ✅ Done | 2026-06-12 — `access_log` captures authed mutations + sensitive reads ([accessLog.js](server/src/middleware/accessLog.js)); coach viewer at `GET /api/coach/audit` |
| L7 — Content-Security-Policy | Headers | ✅ Done | 2026-06-12 — strict CSP via helmet (`script-src 'self'`, no inline scripts; `style-src` allows inline attrs). Header + asset serving verified; **browser smoke-test recommended before prod deploy** |
| L8 — Consent versioning | GDPR | 🟡 In progress | 2026-06-13 — versioned `consent_versions` + timestamped/IP-stamped `user_consents` captured at signup ([consent.js](server/src/routes/consent.js)). Infra done; **legal-reviewed copy + re-consent-on-version-change still required** before EU end-users |
| L9 — Automated backups | Ops | ✅ Done | 2026-06-13 — daily online backup (`VACUUM INTO`) to `data/backups/` with 7-file retention ([backup.js](server/src/jobs/backup.js)). Pair with a Render disk snapshot for off-box copies |
| L10 — Client routes taking body `user_id` | Authz | ✅ Done | 2026-06-12 — full sweep: body `user_id` cases guarded; every client mutation scopes to `req.user.id` / verifies ownership; no client IDOR found |
| F1 — Stored XSS via unsanitized rich-text | XSS | ✅ Done | Fixed 2026-06-10 — DOMPurify sanitises all 6 rich-text sinks ([sanitizeHtml.js](client/src/lib/sanitizeHtml.js)) |
| F2 — `javascript:` URLs in coach links | XSS | ✅ Done | Fixed 2026-06-12 — shared `safeUrl()` allowlist (http/https/mailto/tel/relative) on every href + window.open sink ([safeUrl.js](client/src/lib/safeUrl.js)) |
| F3 — Client `npm audit` | Deps | ✅ Done | 2026-06-13 — **0 vulnerabilities**: react-router open-redirect fixed (6.30.4); removed the unused `vite-plugin-pwa` and upgraded to vite 8.0.16 / @vitejs/plugin-react 6 (clears the esbuild/vite chain). Build + dev server + CSP-compat verified |

F-items (findings from the 2026-06-10 internal review) are detailed in
[CHANGELOG.md](CHANGELOG.md#open-findings-from-the-2026-06-10-review).

## Known V1 limitations (do not treat as finds)

These are real gaps we've decided to defer past internal red-team. Flagging
them here so reviewers focus on deeper issues rather than these.

### 1. Uploaded files are publicly accessible by URL
✅ **Addressed (2026-06-12):** `/uploads/*` is now gated by a `requireFileCookie`
check in [index.js](server/src/index.js). A short httpOnly `am_file` cookie
(carrying the user's JWT) is set on the first authenticated API call
([auth.js](server/src/middleware/auth.js)) and is sent automatically on
same-origin `<img>` requests, so anonymous fetches get a 403 with no client or
DB changes. Residual: no per-user authorization yet — a *logged-in* user who
obtains another user's URL can still fetch it (UUID filenames remain the only
barrier there). The original note below is kept for context.

`/uploads/<uuid>.{jpg|mp4|...}` is served by `express.static` with no auth
check. UUID filenames provide security-through-obscurity — nobody's
guessing `f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg` — but anyone who
obtains a URL (via sharing, a log, a screenshot of devtools) can fetch the
file without a token.

- **Scope of exposure:** profile photos, progress photos, check-in
  photos, benchmark verification videos.
- **Why not fixed yet:** the right fix (signed URLs or cookie-based auth
  for static assets) is a 4-6 hour refactor that changes every
  `<img src=...>` in the SPA plus all DB `*_url` fields.
- **Mitigation before public beta:** implement signed short-lived URLs or
  move sensitive uploads to `/api/files/:id` behind `authenticateToken`.

### 2. JWT stored in `localStorage`
Tokens live at `localStorage['am_token']`. Vulnerable to token theft via
XSS. ⚠️ **Correction (2026-06-10):** an earlier version of this note claimed
"the codebase has zero `dangerouslySetInnerHTML`" — that is **false**. There
are 7 unsanitized `dangerouslySetInnerHTML` sinks rendering coach-authored
rich text (finding **F1**), plus unvalidated URL schemes in coach links
(**F2**). So a real XSS → token-theft path exists today (coach-authored,
reaching all clients). The localStorage deferral below should be
re-evaluated in light of this, and F1/F2 fixed regardless.

- **Planned fix:** migrate to httpOnly+secure+sameSite=lax cookies with a
  CSRF token for state-changing requests. Post red-team.

### 3. No JWT revocation
Tokens are valid for 7 days with no server-side blocklist. If a token
leaks, it stays live until expiry.

- **Planned fix:** session table with revocation + shorter JWT expiry +
  refresh tokens. Post red-team.

### 4. SQLite not encrypted at rest
The database file on Render's persistent disk is plaintext. Only the web
service has access to that disk (Render doesn't expose disks externally),
but a compromise of the Render service would expose all user data.

- **Planned fix:** migrate to Postgres with disk-level encryption when
  leaving alpha. Blocked on the better-sqlite3 → pg driver port
  (hundreds of callsites use sync query style).

### 5. No account deletion / data export
GDPR Art. 17 (right to be forgotten) and Art. 20 (data portability)
require both. Neither is implemented yet.

- **Required before inviting EU end-users.** Not required for the
  internal team pass. Planned as a dedicated commit.

### 6. No audit log of data access
If a breach occurs we can't accurately report what was accessed. Server
currently logs only errors (with credentials scrubbed) via `console.error`.

- **Planned fix:** lightweight access log table keyed on user_id, path,
  method, status, timestamp, on sensitive routes.

### 7. No Content-Security-Policy
Helmet's CSP is disabled because a locked-down policy for a React SPA
with Vimeo embeds needs per-asset nonces.

- **Planned fix:** strict CSP with nonce middleware once the asset story
  stabilises. Pre public beta.

### 8. No consent / privacy-policy enforcement
There are placeholder `/privacy` and `/terms` pages and a consent
checkbox on signup, but the text is not legally reviewed and consent is
not timestamped or versioned.

- **Required before inviting EU end-users:** lawyer-reviewed copy +
  consent_versions table + timestamped user_consents records.

### 9. No automated backups
Render supports disk snapshots but no schedule is configured yet.

- **Required before real user data:** daily snapshot + tested restore.

### 10. Client-side routes that take `user_id` in body
I've swept the coach routes and fixed the ones that trusted body
`user_id` without ownership check. I have NOT fully swept the
client-facing routes. A client injecting `user_id: <other>` in a POST
body might slip through on endpoints that use `req.body.user_id` instead
of `req.user.id`.

- **Explicit ask for reviewers:** grep `req.body?.user_id` and audit each
  handler.

## Suggested attack surface for reviewers

Things we'd love you to try:

1. **IDOR sweep** — swap IDs in any path/query/body param and try to read
   or mutate another user's data.
2. **Upload abuses** — `.jpg` with embedded script tags, mime/extension
   mismatch, huge files, zero-byte files, path-traversal filenames,
   polyglot files.
3. **URL-leakage exploitation** — we've told you `/uploads/*` is public;
   try to enumerate or brute-force UUIDs, check if any endpoint leaks
   upload URLs unexpectedly (logs, error messages, HTML).
4. **Auth flow attacks** — brute-force login (does rate limit actually
   fire?), abuse password reset flow (can you replay a consumed token?
   get a token for a different user?), try `none` algorithm JWT.
5. **User-authored URLs** — any place a user can set a `url` field
   (notification `cta_url`, group `cta_url`, benchmark video link).
   Try `javascript:` payloads, data URIs.
6. **Client routes with body user_id** — as above.
7. **Tier bypass** — find a way to read a locked program / workout /
   course without paying.
8. **Coach cross-ownership** — create two coach accounts, try to have
   coach A read/modify coach B's clients.
9. **Rate-limit bypass** — distribute from multiple IPs, use the
   `X-Forwarded-For` header, fire parallel requests.
10. **Self-serve abuse** — can a client change their own tier? Assign
    themselves to a program they haven't bought? Award themselves
    benchmark points?

## Reporting a finding

Message Dan directly on Signal or open a private issue on GitHub. Include:

- Repro steps (curl / browser actions)
- Observed vs expected
- Impact assessment (your best guess)
- Screenshots / HAR if relevant

Please do not publicly disclose before we've confirmed + rolled a fix.
