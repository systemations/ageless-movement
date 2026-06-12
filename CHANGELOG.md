# Changelog — Ageless Movement

Running log of everything we change, security and features alike, as we go.
Newest entries first. This is the human-facing companion to git history:
git tells you *what lines* changed; this tells you *what & why* at a glance.

## How to use this file

- Add an entry under today's date (create the date heading if missing).
- Tag each line with one of: `[Security]` `[Feature]` `[Fix]` `[Chore]` `[Docs]`.
- When a change closes a tracked item in [SECURITY.md](SECURITY.md), link it
  (e.g. "closes SECURITY.md L1") and flip that row's status in the
  [Security status tracker](SECURITY.md#security-status-tracker).
- Keep lines short. One change = one line. Detail goes in the PR/commit.

Status legend (shared with SECURITY.md): ✅ Done · 🟡 In progress · ⬜ Open

---

## 2026-06-13

### Security / Chore
- `[Chore]` **F3 complete — client `npm audit` at 0 vulnerabilities.** Removed
  the unused `vite-plugin-pwa` (PWA is a static manifest; nothing imported it)
  and upgraded **vite 5 → 8.0.16** + `@vitejs/plugin-react` 4 → 6, clearing the
  dev-server-only esbuild/vite advisories. Verified: `vite build` (now Rolldown,
  faster) and the dev server both work, and the build still emits only external
  scripts so the L7 CSP (`script-src 'self'`) stays valid.

### Security
- `[Security]` **L2 — JWT moved out of localStorage into an httpOnly cookie.**
  Login/register now set an `am_auth` httpOnly + `SameSite=Lax` (+ `Secure` in
  prod) cookie carrying the JWT; `authenticateToken` reads the cookie first,
  Bearer header as fallback ([auth.js](server/src/middleware/auth.js)). The SPA
  no longer stores the token anywhere — [AuthContext.jsx](client/src/context/AuthContext.jsx)
  bootstraps the session from the cookie via `/me` and exposes only a truthy
  *sentinel* `token`, so the hundreds of existing `Bearer ${token}` call sites
  keep working unchanged while the real JWT stays out of JS (XSS-proof). CSRF is
  covered by `SameSite=Lax` plus a prod-only Origin check
  ([index.js](server/src/index.js)); logout clears the cookie + revokes the
  session (L3). Verified end-to-end (cookie auths; sentinel alone → 403; logout
  → 401). **Note: this deploy logs existing sessions out once** (old localStorage
  token, no cookie → re-login).
- `[Security]` **L8 — consent versioning.** New `consent_versions` (catalogue)
  + `user_consents` (timestamped, IP-stamped acceptance) tables. Initial Terms
  + Privacy versions seeded via migration; register now records the user's
  acceptance of every current version ([consent.js](server/src/routes/consent.js),
  wired into [auth.js](server/src/routes/auth.js)); `GET /api/consent/current`
  and `/me` expose them, and consents are included in the GDPR export. Infra
  verified; legal-reviewed copy + re-consent-on-change still to do.
- `[Security]` **L9 — automated DB backups.** Daily online backup via SQLite
  `VACUUM INTO` ([pool.js](server/src/db/pool.js) `backupDatabase()`), scheduled
  by [backup.js](server/src/jobs/backup.js) (first run 60s after boot, then
  every 24h), writing to `data/backups/` with 7-file retention. Verified the
  copy is a complete, openable DB. (L3 was also completed late on 06-12 — see
  below.)

---

## 2026-06-12

### Feature
- `[Feature]` **App-wide modal system (replaces native alert/confirm/prompt).**
  New [Modal.jsx](client/src/components/Modal.jsx) provides a styled,
  promise-based `ModalProvider` + `useModal()` hook **and** an imperative
  `modal.confirm/notify/prompt` singleton callable from anywhere. Swept **~45
  native `alert()`/`confirm()`/`window.prompt()` call sites across ~25 files**
  over to it (client + coach + admin). The PWA `event.prompt()` install calls
  are intentionally untouched. Several handlers were made `async` so the
  awaited confirms work.
- `[Feature]` **Coach mobile client view — real data + actions.**
  - Coach Home "Needs attention" cards now open the client
    ([CoachHome.jsx](client/src/pages/coach/CoachHome.jsx)).
  - [ClientDetail.jsx](client/src/pages/coach/ClientDetail.jsx) was a
    placeholder (fake email/weight/notes); now it fetches the real profile —
    email, latest weight/body-fat/steps, real check-in photos, real coach
    notes (+ add note via API), and shows the live account status.
  - **Message icon** opens the coach↔client team-inbox thread inline.
  - **3-dots menu**: Reset password (emails the link via Resend), Copy email,
    and Pause / Archive / Reactivate — status changes go through a **confirm
    modal**.
  - The client **Profile tab** links (Logged Nutrition, Workout/Exercise
    History, Habits, Check-Ins, Questionnaire, Activity Timeline) were dead
    placeholders; they now open real drill-down sub-views. The coach profile
    endpoint gained `exerciseHistory`, `habitEntries`, and `activity` to back
    them; the rest reuse data already fetched.
  - The **More → Clients** list ([CoachMore.jsx](client/src/pages/coach/CoachMore.jsx))
    now opens a client on tap, and is **paginated (25/page) with search**.
    `GET /api/coach/clients` gained opt-in `?limit/?offset/?search` (+ total);
    it only paginates when `?limit` is passed, so the admin all-clients view is
    unaffected.

### Feature (earlier today)
- `[Feature]` **Content Manager: Draft/Publish + pagination + sub-category
  filters.** Admin Programs/Workouts/Exercises
  ([ContentManager.jsx](client/src/pages/coach/ContentManager.jsx),
  [content.js](server/src/routes/content.js)):
  - **Draft/Published** on all three (workouts already had `status`; added it to
    programs + exercises). New content defaults to **draft**; a one-time
    migration ([migrations.js](server/src/db/migrations.js)) backfilled all
    existing coach content to **published** so nothing live disappeared.
    Drafts are hidden from clients on the Explore discovery surfaces
    (search, exercise browser/picker, program & workout detail) via
    `status='published'` guards in [explore.js](server/src/routes/explore.js).
    List view shows a Live/Draft pill that toggles status in one tap.
  - **Pagination**: list endpoints are now server-side paginated (50/page +
    total) with a "Load more" button; the admin fetches **only the active tab**
    instead of all three on mount. (Exercises alone was pulling all ~2,200 rows.)
  - **Sub-categories / search**: filter chips per tab — Programs by a new
    coach-editable **Category** field, Workouts by Type, Exercises by **Body
    Part + Type** (body-part groups mirror the client app) — plus a debounced
    search box. All filtering/search runs server-side so it composes with
    pagination. Indexes added on the new filter columns.

### Security
- `[Security]` **L3 — JWT revocation via server-side sessions.** New `sessions`
  table; login/register mint a session whose id is carried in the JWT `sid`
  claim ([auth.js](server/src/routes/auth.js)), and `authenticateToken`
  ([auth.js](server/src/middleware/auth.js)) rejects a token whose session is
  revoked. `POST /api/auth/logout` revokes the current session (+ clears the
  file cookie); change-password revokes all *other* sessions; reset-password
  revokes all. Backward-compatible: pre-feature tokens (no `sid`) stay valid
  until expiry, so no forced logout on deploy. Verified end-to-end
  (logout → same token now 401; legacy token still 200).
- `[Security]` **Deferred-limitations push (L5, L6, L7, L10).**
  - **L10** IDOR sweep — verified clean: every client-facing mutation scopes to
    `req.user.id` / checks ownership; body `user_id` cases are guarded.
  - **L6** access audit log — new `access_log` table +
    [accessLog.js](server/src/middleware/accessLog.js) middleware records
    authenticated mutations + sensitive reads (user, path, status, IP) on
    `finish`; coach viewer at `GET /api/coach/audit`.
  - **L5** GDPR — [gdpr.js](server/src/routes/gdpr.js): `GET /api/gdpr/export`
    (full self-data export, Art. 20) and `DELETE /api/gdpr/me`
    (password-gated comprehensive account erasure, Art. 17), with
    Export/Delete controls on the client
    [Profile](client/src/pages/client/Profile.jsx). Verified end-to-end
    (register → export → audited → delete → erased).
  - **L7** Content-Security-Policy — strict policy via helmet in
    [index.js](server/src/index.js) (`script-src 'self'` — the build has no
    inline scripts; `style-src` allows inline attributes). Header + asset
    serving verified against a prod-mode server; browser smoke-test
    recommended before prod deploy.
- `[Security]` **F3 (dependency audit) — partial.** Ran `npm audit fix` on the
  client: react-router open-redirect (GHSA-2j2x-hqr9-3h42) fixed via
  react-router-dom → 6.30.4 (non-breaking; build verified). The remaining 3
  advisories are the **dev-server-only** vite/esbuild chain, which needs a
  breaking `vite@8` upgrade — deferred (no production impact). Tracked in
  SECURITY.md F3.
- `[Security]` **Fixed F2 (`javascript:` URLs).** Added a shared
  [`safeUrl()`](client/src/lib/safeUrl.js) allowlist (http/https/mailto/tel +
  relative paths) and routed every coach-authored URL sink through it: group
  `cta_url` ([MessageThread](client/src/pages/client/MessageThread.jsx)), event
  `meeting_url` + social links ([Events](client/src/pages/client/Events.jsx)),
  notification/tier CTAs
  ([NotificationPopup](client/src/components/NotificationPopup.jsx),
  [PlansModal](client/src/components/PlansModal.jsx),
  [TiersModal](client/src/components/TiersModal.jsx)), and the client-submitted
  benchmark `video_url` link
  ([ChallengesAdmin](client/src/pages/admin/ChallengesAdmin.jsx)). A
  `javascript:`/`data:`/`vbscript:` value (incl. whitespace- or case-obfuscated)
  is now rejected instead of executing on click.
- `[Security]` **Fixed L1 (unauthenticated uploads).** `/uploads/*` is now
  gated behind a session — a short httpOnly `am_file` cookie (the user's JWT)
  is set on the first authenticated API call
  ([auth.js](server/src/middleware/auth.js)) and rides along on same-origin
  `<img>` requests, so anonymous URL fetches 403
  ([index.js](server/src/index.js)). No client markup or stored `*_url` changes.
  Verified: 403 without/with a bad cookie, 200 with a valid one. Residual:
  per-user authz not enforced yet (tracked in SECURITY.md L1).

### Feature
- `[Feature]` **Photo attachments in chat.** The chat `+` button (previously a
  dead placeholder) now uploads an image via `/api/upload` and posts it as an
  image message, rendered inline (tap to open full)
  ([MessageThread.jsx](client/src/pages/client/MessageThread.jsx)). Backend now
  accepts attachment-only messages
  ([messaging.js](server/src/routes/messaging.js)).

### Fix
- `[Fix]` Image-only messages now show **"📷 Photo"** in the conversation-list
  preview instead of a blank last-message
  ([messaging.js](server/src/routes/messaging.js)).
- `[Fix]` Chat message options menu (`⋯`) was rendering off the right edge for
  long own-messages — now positioned below the dots and clamped to the viewport
  ([MessageThread.jsx](client/src/pages/client/MessageThread.jsx)).

### UI
- `[Feature]` Exercise Library now paginates (50 per page + "Load more") with
  lazy-loaded thumbnails, and the search/category header is sticky
  ([ExerciseBrowser.jsx](client/src/pages/client/ExerciseBrowser.jsx),
  [WorkoutThumb.jsx](client/src/components/WorkoutThumb.jsx)).
- `[Fix]` Onboarding "Here's what we'd suggest" plan cards: more spacing
  between cards and above each CTA button
  ([OnboardingQuestionnaire.jsx](client/src/pages/client/OnboardingQuestionnaire.jsx)).

### Chore
- `[Chore]` Installed the production content snapshot into the local dev DB
  (env-only): the local DB had no Explore course library, so the "Getting
  Started" course opened empty. Backed up the prior dev DB to
  `server/data/ageless.db.pre-snapshot-*`.

---

## 2026-06-10

### Feature
- `[Feature]` **Transactional email (Resend) + self-service password reset.**
  - Added `resend` + a shared mailer ([mailer.js](server/src/lib/mailer.js))
    with a dev fallback (logs the link when `RESEND_API_KEY` is unset) and an
    HTML/text password-reset template (user-supplied names are escaped).
  - New env in [config.js](server/src/lib/config.js) + [.env.example](.env.example):
    `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` (email links no longer rely
    on `req.headers.origin`).
  - New `POST /api/auth/forgot-password` ([auth.js](server/src/routes/auth.js))
    — enumeration-safe (identical response for known/unknown emails),
    rate-limited (5 / 15 min / IP), single-use 1h token.
  - Coach-initiated reset ([coach.js](server/src/routes/coach.js)) now actually
    emails the link (was returning it for manual forwarding); URL still
    returned as a fallback.
  - Client: new [ForgotPassword](client/src/pages/auth/ForgotPassword.jsx) +
    [ResetPassword](client/src/pages/auth/ResetPassword.jsx) pages,
    `/forgot-password` + `/reset-password` routes, and a "Forgot password?"
    link on [Login](client/src/pages/auth/Login.jsx). (The `/reset-password`
    page didn't exist before — coach reset links previously landed on nothing.)
  - Verified: client build green; forgot-password returns generic OK for
    unknown emails; real Resend delivery confirmed (test send to the account
    owner succeeded).
  - **Prod setup still needed:** verify `agelessmovement.com` in Resend and set
    `EMAIL_FROM` to a real address on it (the default `onboarding@resend.dev`
    test sender only delivers to the Resend account owner).

### Security
- `[Security]` **Fixed F1 (stored XSS).** Added DOMPurify and routed all 6
  rich-text `dangerouslySetInnerHTML` sinks in
  [CourseDetail.jsx](client/src/pages/client/CourseDetail.jsx) through a shared
  [`sanitizeHtml()`](client/src/lib/sanitizeHtml.js) helper. Strips
  `<script>`, inline `on*` handlers, and `javascript:` URLs; also forces
  `rel="noopener noreferrer"` on `target="_blank"` links. Closes the
  coach-authored-HTML → client token-theft path. Client build verified green.
- `[Security]` Completed an internal security review of the app (auth, authz,
  dynamic SQL, uploads, all client XSS sinks). Findings logged below and
  tracked in SECURITY.md.
- `[Docs]` Added a Security status tracker to [SECURITY.md](SECURITY.md) so
  finished vs. open items are visible at a glance.
- `[Docs]` Corrected SECURITY.md §2: the codebase **does** use
  `dangerouslySetInnerHTML` (7 sinks, unsanitized) — the prior "zero" claim
  was the stated basis for deferring the localStorage-JWT fix, so that
  deferral needs re-evaluation.

#### Open findings from the 2026-06-10 review

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| F1 | 🔴 High   | Stored XSS — coach-authored TipTap HTML rendered via `dangerouslySetInnerHTML` with no sanitization ([CourseDetail.jsx](client/src/pages/client/CourseDetail.jsx)). Coach → all-clients account takeover via `localStorage.am_token`. | ✅ Done |
| F2 | 🟠 Medium | `javascript:`-scheme URLs accepted in coach-authored links rendered to `href`/`window.open` (group `cta_url`, event `meeting_url`, socials, notification/tier CTAs). No scheme validation. | ⬜ Open |
| F3 | 🟡 Info   | Client `npm audit` no longer clean — 5 moderate (react-router open-redirect GHSA-2j2x-hqr9-3h42 + vite/vite-plugin-pwa chain). SECURITY.md §deps claims 0. | ⬜ Open |

Planned fixes (not yet started): add DOMPurify sanitization on rich-text
render (F1) + a shared `safeUrl()` allowlist helper for `http(s):`/relative
only (F2) + `npm audit fix` on the client (F3).

### Chore
- `[Chore]` Bootstrapped local dev on Windows: sparse-checkout to skip an
  invalid path (`server/import-data/AMS | Ground Zero ™ Assessment.pdf` — `|`
  is illegal on NTFS), created `server/.env`, installed deps, added the
  missing `concurrently` devDependency, seeded the local SQLite DB.
