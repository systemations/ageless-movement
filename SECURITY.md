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
- Global API limiter (abuse backstop): 1000/min per authenticated user
  (keyed per-user, so one account can't affect others), 200/min per
  anonymous IP. Auth routes are exempt — they use the per-action limits above.
- Password reset tokens are 32-byte random (`crypto.randomBytes`), single
  use, expiry enforced server-side at validation time.

### Authorization
- `requireCoachOwnsClient(param)` + `requireCoachOwnsClientBody(bodyKey)`
  middlewares guard coach routes that touch per-client data.
- Multi-coach isolation (2026-06-16): only an admin coach (`users.is_admin`) may
  act on behalf of another coach (`?coach_id=`) or delete coaches; a regular
  coach is scoped to themselves + their own clients. Existing coaches were
  grandfathered as admins; coaches created later default to non-admin.
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
  X-Frame-Options, Referrer-Policy, hidden X-Powered-By. **Strict CSP is now
  on** (`script-src 'self'`, no inline scripts; `style-src` allows inline
  attrs) — see L7. Browser smoke-test still recommended before prod deploy.
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
| L1 — Public upload URLs | Uploads | ✅ Done | 2026-06-12 anonymous gate (`am_file` cookie → anon fetches 403); **2026-06-16 per-user authz** — a `file_assets` registry records each upload's owner + visibility, and the `/uploads` gate ([auth.js](server/src/middleware/auth.js) `canAccessFile`) enforces it: private media (check-in/progress photos, benchmark videos, client avatars, nutrition photos) serves only to the owner + their coach; chat photos only to conversation members; coach-uploaded content to any authed user. Existing files backfilled; no client/URL changes. Policy verified across all access cases. **2026-06-16 hardening (audit follow-up):** the file gate now enforces session revocation (a revoked/logged-out token can't keep fetching files until expiry), and chat-attachment re-scoping now verifies the sender owns the file |
| L2 — JWT in `localStorage` | Auth | ✅ Done | 2026-06-13 — real JWT moved to an httpOnly + SameSite=Lax `am_auth` cookie ([auth.js](server/src/middleware/auth.js)); the SPA holds only a sentinel ([AuthContext.jsx](client/src/context/AuthContext.jsx)), so XSS can't read the token. CSRF via SameSite=Lax + prod Origin check. Verified |
| L3 — JWT revocation | Auth | ✅ Done | 2026-06-12 — server-side `sessions` table (id in JWT `sid`); logout + password-change/reset revoke instantly; backward-compatible with pre-feature tokens. Verified |
| L4 — SQLite not encrypted at rest | Data | ✅ Done | 2026-06-16 — DB encrypted at rest via SQLite3MultipleCiphers (drop-in `better-sqlite3-multiple-ciphers`, key from `DB_ENCRYPTION_KEY`, required in prod). Existing plaintext DB auto-migrates on first boot (`PRAGMA rekey`); backups (`VACUUM INTO`) inherit encryption. A full Postgres move was scoped + deferred (not needed for encryption-at-rest; revisit when multi-instance scaling requires it). Verified on a copy of the real DB |
| L5 — Account deletion / export | GDPR | ✅ Done | 2026-06-12 — self-service GDPR export + password-gated account deletion ([gdpr.js](server/src/routes/gdpr.js)); UI on client Profile. Verified end-to-end |
| L6 — Data-access audit log | Observability | ✅ Done | 2026-06-12 — `access_log` captures authed mutations + sensitive reads ([accessLog.js](server/src/middleware/accessLog.js)); coach viewer at `GET /api/coach/audit` |
| L7 — Content-Security-Policy | Headers | ✅ Done | 2026-06-12 — strict CSP via helmet (`script-src 'self'`, no inline scripts; `style-src` allows inline attrs). Header + asset serving verified; **browser smoke-test recommended before prod deploy** |
| L8 — Consent versioning | GDPR | 🟡 In progress | 2026-06-16 — versioned `consent_versions` + timestamped/IP-stamped `user_consents` at signup, **plus the re-consent gate**: a logged-in user with an unaccepted current version (or no prior consent at all) is blocked until they accept (`GET /api/consent/outstanding` + `POST /api/consent/accept` [consent.js](server/src/routes/consent.js); [ConsentGate.jsx](client/src/components/ConsentGate.jsx)). Verified on real data. **Engineering complete — only legal-reviewed Terms/Privacy copy remains (non-eng).** To publish a new version: flip the old row's `is_current=0` and insert the new version with `is_current=1` (via a migration) — the gate then re-prompts everyone automatically |
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

> **Status (2026-06-16):** most of these are now fixed — the
> [Security status tracker](#security-status-tracker) above is the authoritative
> source. Addressed: #1 (uploads gated + per-user authz),
> #2 (localStorage JWT → httpOnly cookie), #3 (JWT revocation), #4 (SQLite
> encrypted at rest via SQLite3MultipleCiphers), #5 (GDPR export/delete), #6
> (audit log), #7 (CSP), #9 (backups), #10 (body `user_id` sweep). **Still open:
> #8** (consent) — but only the legal-reviewed copy remains; the re-consent gate
> shipped 2026-06-16, so the engineering side is done.

### 1. Uploaded files are publicly accessible by URL
✅ **Addressed (2026-06-12):** `/uploads/*` is now gated by a `requireFileCookie`
check in [index.js](server/src/index.js). A short httpOnly `am_file` cookie
(carrying the user's JWT) is set on the first authenticated API call
([auth.js](server/src/middleware/auth.js)) and is sent automatically on
same-origin `<img>` requests, so anonymous fetches get a 403 with no client or
DB changes. ✅ **Per-user authz added (2026-06-16):** the prior residual — a
*logged-in* user could fetch another user's file from its URL — is closed. A
`file_assets` registry records each upload's owner + visibility, and the gate
([auth.js](server/src/middleware/auth.js) `canAccessFile`) now serves private
media (check-in/progress photos, benchmark videos, client avatars, nutrition
photos) only to the owner + their coach, chat photos only to conversation
members, and coach content to any authed user. Existing files were backfilled.
The original note below is kept for context.

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
✅ **Addressed (2026-06-13, L2):** the real JWT now lives only in an httpOnly
`am_auth` cookie; the SPA holds a non-functional sentinel, so XSS can't read it.
The original note is kept below for context.

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
✅ **Addressed (2026-06-12, L3):** a server-side `sessions` table backs the JWT
`sid` claim; logout and password change/reset revoke the token immediately. The
original note is kept below for context.

Tokens are valid for 7 days with no server-side blocklist. If a token
leaks, it stays live until expiry.

- **Planned fix:** session table with revocation + shorter JWT expiry +
  refresh tokens. Post red-team.

### 4. SQLite not encrypted at rest
✅ **Addressed (2026-06-16):** the database is now encrypted at rest with
SQLite3MultipleCiphers (`better-sqlite3-multiple-ciphers`, a drop-in fork of
better-sqlite3 — same synchronous API). The key comes from `DB_ENCRYPTION_KEY`
(required in prod, enforced in [config.js](server/src/lib/config.js)); the
driver applies it on every connection, an existing plaintext DB is migrated to
encrypted on first boot (`PRAGMA rekey`), and `VACUUM INTO` backups inherit the
encryption. A full Postgres migration was scoped and **deferred** — it's a
multi-week sync→async port of ~1000 call sites and isn't required to achieve
encryption-at-rest; revisit it when multi-instance scaling actually needs it.
The original note is kept below for context.

The database file on Render's persistent disk is plaintext. Only the web
service has access to that disk (Render doesn't expose disks externally),
but a compromise of the Render service would expose all user data.

- **Planned fix:** migrate to Postgres with disk-level encryption when
  leaving alpha. Blocked on the better-sqlite3 → pg driver port
  (hundreds of callsites use sync query style).

### 5. No account deletion / data export
✅ **Addressed (2026-06-12, L5):** self-service GDPR export + password-gated
account deletion are live (controls on the client Profile). The original note
is kept below for context.

GDPR Art. 17 (right to be forgotten) and Art. 20 (data portability)
require both. Neither is implemented yet.

- **Required before inviting EU end-users.** Not required for the
  internal team pass. Planned as a dedicated commit.

### 6. No audit log of data access
✅ **Addressed (2026-06-12, L6):** an `access_log` table records authenticated
mutations + sensitive reads (user, path, status, IP); coach viewer at
`GET /api/coach/audit`. The original note is kept below for context.

If a breach occurs we can't accurately report what was accessed. Server
currently logs only errors (with credentials scrubbed) via `console.error`.

- **Planned fix:** lightweight access log table keyed on user_id, path,
  method, status, timestamp, on sensitive routes.

### 7. No Content-Security-Policy
✅ **Addressed (2026-06-12, L7):** a strict CSP is now **on** via helmet
(`script-src 'self'`, no inline scripts; `style-src` allows inline attrs) —
this supersedes the "disabled" note below. A browser smoke-test is still
recommended before prod deploy.

Helmet's CSP is disabled because a locked-down policy for a React SPA
with Vimeo embeds needs per-asset nonces.

- **Planned fix:** strict CSP with nonce middleware once the asset story
  stabilises. Pre public beta.

### 8. No consent / privacy-policy enforcement
🟡 **Mostly addressed (2026-06-16):** consent is now versioned
(`consent_versions`) and each acceptance is timestamped + IP-stamped
(`user_consents`), captured at signup and again via a **re-consent gate**
([ConsentGate.jsx](client/src/components/ConsentGate.jsx)) that blocks any
signed-in user with an unaccepted current version until they accept. The
**only remaining gap is legal-reviewed `/terms` + `/privacy` copy** (a
business/legal task, not engineering). The original note is kept below.

There are placeholder `/privacy` and `/terms` pages and a consent
checkbox on signup, but the text is not legally reviewed and consent is
not timestamped or versioned.

- **Required before inviting EU end-users:** lawyer-reviewed copy +
  consent_versions table + timestamped user_consents records.

### 9. No automated backups
🟡 **Mostly addressed (2026-06-13, L9):** daily online backups (`VACUUM INTO`,
7-file retention) run on a schedule and inherit the DB encryption. **Remaining:
an off-box copy (Render disk snapshot) and a tested restore.** The original note
is kept below for context.

Render supports disk snapshots but no schedule is configured yet.

- **Required before real user data:** daily snapshot + tested restore.

### 10. Client-side routes that take `user_id` in body
✅ **Addressed (2026-06-12, L10):** full sweep done — every client-facing
mutation scopes to `req.user.id` or verifies ownership; body `user_id` cases are
guarded; no client IDOR found. The original note is kept below for context.

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
3. **Upload access control (L1)** — `/uploads/*` is now gated (anonymous → 403)
   with per-user authorization. Logged in as one user, try to fetch another
   user's file by URL (check-in/progress photos, benchmark videos, chat
   attachments); try a coach reading a non-client's private media; check if any
   endpoint leaks upload URLs unexpectedly (logs, error messages, HTML).
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
