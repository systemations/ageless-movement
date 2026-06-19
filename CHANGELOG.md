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

## 2026-06-16

### Feature
- `[Feature]` **Going-native Phase 3 — native status bar + splash.** Added the
  StatusBar plugin (solid `#060D1A` bar with light icons — matches the dark theme
  instead of clashing) and the SplashScreen plugin (dark `#060D1A` splash so there's
  no white flash on launch; hidden as soon as the app renders). Wired via
  `configureNativeUI()` ([nativeApi.js](client/src/lib/nativeApi.js)) + plugin config
  ([capacitor.config.json](client/capacitor.config.json)); plugins are dynamically
  imported so they never load in the web bundle. **Android 12+ system splash:** its
  background is a native theme attribute, not the plugin config — set
  `windowSplashScreenBackground` to a dark `splash_bg` color in the launch theme
  (`android/app/src/main/res/values/styles.xml` + `colors.xml`) so the cold-start
  splash is dark, not white. (The centered logo is still the placeholder launcher
  icon — branded icon + splash come with the Phase 5 asset pass.)
- `[Feature]` **Going-native Phase 1b — images load on the native app.** Native
  `<img src="/uploads/...">` can't send the Bearer header, so uploaded media
  (avatars, check-in/progress photos) was broken in the Android build. Added a
  short **file-only access token** (`GET /api/auth/file-token` — `typ='file'`,
  carries user + session, 7d, revoked by logout) that the `/uploads` gate accepts
  via `?ft=` while still enforcing the L1 per-file authz
  ([auth.js](server/src/routes/auth.js), [middleware/auth.js](server/src/middleware/auth.js)).
  The native fetch wrapper rewrites `/uploads/...` URLs in JSON responses to
  absolute, token-signed URLs ([nativeApi.js](client/src/lib/nativeApi.js)), so all
  ~70 image sites work with **zero component changes**; the web build is untouched.
  Verified: the token unlocks only the user's own files (others blocked), respects
  logout, and can't be swapped for the main JWT.

### Fix
- `[Fix]` **Auth screens fit the viewport on mobile (no scroll).** Two layered
  causes: (1) `min-height: 100vh` is the larger "address-bar-hidden" height on
  mobile (taller than visible), and (2) `.app-shell` already insets the top by
  `env(safe-area-inset-top)`, so a child demanding a full `100dvh` overflowed the
  content area by the status-bar height → a small residual scroll.
  - All five — **Welcome** + **Login / Register / ForgotPassword / ResetPassword**
    — now size to `calc(100dvh - env(safe-area-inset-top))` (the app-shell's
    actual content area) with bottom safe-area padding only (no double top inset).
    This fits one screen in **portrait** (no scroll) but **scrolls in landscape**,
    where the content is taller than the short viewport — a `position: fixed`
    approach was tried first but clipped the CTA off-screen in landscape
    ([Welcome.jsx](client/src/pages/auth/Welcome.jsx)).
  - Admin desktop `100vh` layouts left as-is (no mobile address-bar issue).
- `[Fix]` **Build-a-Workout touch targets (mobile).** On the native app the block
  builder's controls were far too small to tap — the ▲▼ reorder arrows (~15px),
  the ✕ remove buttons (bare glyphs), the format chips (scrolled off-screen), the
  Reps/Time toggle, and the Sets/Reps/Notes inputs. Resized every interactive
  control to a comfortable ≥40px tap target, made the format chips **wrap** (so
  none are hidden), and bumped inputs to 16px (stops iOS zooming on focus)
  ([BuildWorkout.jsx](client/src/pages/client/BuildWorkout.jsx)). Sweep: the
  ▲▼/cramped-control pattern only otherwise appears in the coach desktop
  ExploreManager; other client screens use small *labels*, not small touch
  targets.

### Chore
- `[Chore]` **Going-native groundwork (Capacitor Phase 0).** Added
  [GOING-NATIVE.md](GOING-NATIVE.md) — the full runbook for wrapping the PWA into
  iOS/Android via Capacitor (phases, the WebView auth adaptation, store
  requirements, gotchas). Installed Capacitor (`core`/`cli`/`ios`/`android`) in
  `client/`, added [capacitor.config.json](client/capacitor.config.json)
  (`com.agelessmovement.app`, webDir `dist`) and `cap:sync`/`cap:android`/`cap:ios`
  scripts. No app-behaviour change. **Android platform added** (`client/android/`
  Gradle project, web build copied in) — ready to open in Android Studio; iOS
  still needs a Mac. Auth won't work in the native build until Phase 1 (the
  cookie→Bearer adaptation). Owner prerequisites in
  [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) §G.
- `[Chore]` **Client deps back to 0 vulnerabilities.** Installing Capacitor
  surfaced a newly-published advisory in `markdown-it` (a pre-existing TipTap
  transitive dep, GHSA-6v5v-wf23-fmfq, moderate DoS) — *not* introduced by
  Capacitor. Cleared with a non-breaking `npm audit fix`; build verified. (Exactly
  the kind of drift the new Dependabot config will catch automatically.)
- `[Chore]` **Dependabot config + owner checklist.** Added
  [.github/dependabot.yml](.github/dependabot.yml) for continuous dependency
  monitoring (weekly grouped version-update PRs across root/`server`/`client`) —
  closes the "F3 was a one-time `npm audit`" gap (you still flip on Dependabot
  alerts/security-updates in GitHub Settings). Added
  [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md), a separate doc collecting all the
  **non-coding owner action items** (prod env/secrets, Resend domain + DNS, legal
  copy, CSP smoke-test, off-box backups + restore test, admin review, pen-test,
  and the open decisions).

### Security
- `[Security]` **Audit follow-up (Tier 2) — multi-coach isolation.** The
  `?coach_id=` "act as any coach" override and coach deletion were open to any
  coach (fine while solo; a cross-coach IDOR once a second coach exists). Added a
  `users.is_admin` flag ([pool.js](server/src/db/pool.js)); existing coaches are
  backfilled to admin so behaviour is unchanged ([migrations.js](server/src/db/migrations.js)),
  while coaches created later default to non-admin and are scoped to themselves.
  Only an admin may now target another coach via `?coach_id` or delete a coach
  ([coaches.js](server/src/routes/coaches.js)). Also: event-registration PII is
  restricted to the owning coach (was any coach), and benchmark-attempt review +
  `athlete/features?user_id=` now verify the coach owns that client
  ([benchmarks.js](server/src/routes/benchmarks.js),
  [athlete.js](server/src/routes/athlete.js)). Verified: existing coach = admin
  (override honored), new coach scoped to self.
- `[Security]` **Audit follow-up (Tier 3) — low / latent items.**
  - Parameterized the steps-leaderboard date clause — it concatenated
    server-derived dates into SQL (not exploitable, but it was the one SQL-concat
    left in the codebase) ([benchmarks.js](server/src/routes/benchmarks.js)).
  - `safeUrl()` on the admin WorkoutBuilder demo-video link
    ([WorkoutBuilder.jsx](client/src/pages/admin/WorkoutBuilder.jsx)).
  - Email matching is now case-insensitive across register / login /
    forgot-password ([auth.js](server/src/routes/auth.js)) — fixes a mixed-case
    signup that couldn't later log in or self-reset. Verified on a DB copy.
- `[Security]` **Audit follow-up — 5 fixes from a full client + coach/admin
  security re-review** (parallel review across authz/IDOR/auth/injection/client):
  - **File gate now honors session revocation (L1+L3).** The `/uploads` gate only
    verified the JWT, not the `sid` session — so a logged-out / password-changed /
    revoked token could still fetch private files (check-in photos, benchmark
    videos, chat media) until the 7-day expiry. A shared `sessionRevoked` check
    now backs both the API auth path and the file gate
    ([auth.js](server/src/middleware/auth.js)).
  - **Chat attachment ownership (L1).** Posting a message re-scoped a file to the
    conversation without checking the sender owned it — a member could expose
    another user's private file by referencing its basename. Now only the
    sender's own, not-yet-scoped files are bound to the conversation
    ([messaging.js](server/src/routes/messaging.js)).
  - **Recipe library is coach-only.** `POST/PUT/DELETE /api/nutrition/recipes` had
    no `requireRole('coach')`, letting any client edit the shared recipe catalog;
    gated now ([nutrition.js](server/src/routes/nutrition.js)).
  - **Shopping-list item IDOR.** Item add/toggle/delete mutated by raw id with no
    ownership check (edit another user's list by guessing ids); now scoped through
    the parent list's owner ([nutrition.js](server/src/routes/nutrition.js)).
  - **`safeUrl()` on two more CTAs.** `window.open(cta_url)` in
    [PlansPage.jsx](client/src/pages/client/PlansPage.jsx) and
    [OnboardingQuestionnaire.jsx](client/src/pages/client/OnboardingQuestionnaire.jsx)
    bypassed the F2 allowlist (a `javascript:` cta_url = XSS-on-click); routed
    through `safeUrl()` now.
  Verified on a DB copy: revoked session blocked while active/legacy allowed; a
  non-owner cannot re-scope another user's file; client build green.
- `[Security]` **Minimum password length at registration.** `POST /register`
  accepted any non-empty password (even 1 char) while change-password and reset
  already required ≥8 — an inconsistent gap. Register now enforces ≥8 server-side
  ([auth.js](server/src/routes/auth.js)), with a matching client-side check for
  immediate feedback ([Register.jsx](client/src/pages/auth/Register.jsx)).
- `[Docs]` **SECURITY.md consistency pass.** The "Known V1 limitations" prose had
  drifted out of sync with the tracker — items #2/#3/#5/#6/#7/#10 still read as
  open/"planned", and #7 flatly contradicted "What's in place" (claimed CSP was
  off, when it's on). Added ✅/🟡 "Addressed" notes to each (#9 marked partial —
  backups done, off-box copy + tested restore still pending), and updated the
  "Suggested attack surface" upload item to reflect L1's per-user authz instead
  of "uploads are public".
- `[Fix]` **L1 follow-up — benchmark videos were still public.** The first L1
  pass missed that benchmark verification videos upload via a *separate* route
  (`POST /api/benchmarks/attempts/video`) into a subdirectory
  (`/uploads/benchmarks/<uuid>`): that route never registered the file, and the
  backfill keyed it by sub-path (`benchmarks/<uuid>.mp4`) while the gate looks up
  by basename — so the videos read as "unknown" and stayed readable by any
  logged-in user. Fixed by standardising on **basename keying** (UUIDs are
  globally unique) via a shared helper ([files.js](server/src/lib/files.js)
  `registerFileAsset`/`fileKey`, now used by uploads, benchmarks, and messaging),
  registering benchmark uploads as `private` ([benchmarks.js](server/src/routes/benchmarks.js)),
  and a corrective migration ([migrations.js](server/src/db/migrations.js)) that
  drops the mis-keyed rows and re-registers benchmark videos by basename.
  Verified: owner + their coach can view, another client is blocked.
- `[Security]` **L1 residual — per-user authorization on uploads.** Closes the
  last open part of L1: previously any logged-in user who had another user's
  `/uploads/<uuid>` URL could fetch it (only anonymous access was blocked). Now a
  `file_assets` registry ([pool.js](server/src/db/pool.js)) records each upload's
  **owner** and **visibility**, set on upload by uploader role
  ([uploads.js](server/src/routes/uploads.js)): client → `private`, coach →
  `content`; chat attachments are upgraded to `message` (conversation-scoped)
  when posted ([messaging.js](server/src/routes/messaging.js)). The `/uploads`
  gate now enforces it via `canAccessFile`
  ([auth.js](server/src/middleware/auth.js), [index.js](server/src/index.js)):
  private media (check-in/progress photos, benchmark videos, client avatars,
  nutrition photos) serves only to the **owner + their coach**, chat photos only
  to **conversation members**, and coach content to any authed user. A backfill
  migration ([migrations.js](server/src/db/migrations.js)) registers existing
  private files; unknown/legacy files pass through (non-sensitive shared
  content). **No client or URL changes** — `<img src>` stays the same. Verified
  on a copy of the encrypted DB across all access cases (owner allowed, other
  client blocked, coach allowed, content open, message member-only).
- `[Security]` **L8 — re-consent gate (consent versioning, engineering complete).**
  Built the missing piece of L8: when a signed-in user has an unaccepted current
  Terms/Privacy version — a newer version was published, or they predate
  versioned consent entirely — a blocking [ConsentGate.jsx](client/src/components/ConsentGate.jsx)
  overlay requires acceptance before they can use the app (with links to read
  each doc and a Log-out escape). New endpoints `GET /api/consent/outstanding`
  and `POST /api/consent/accept` (timestamped + IP-stamped, idempotent) back it
  ([consent.js](server/src/routes/consent.js)); the gate is mounted once for any
  logged-in user and steps aside on `/terms`/`/privacy` so they're readable.
  Verified on real data (a user with no consent sees both docs outstanding;
  accept clears it). **Only the legal-reviewed copy now remains** (non-eng). To
  publish a new version: flip the old `consent_versions` row to `is_current=0`
  and insert the new one `is_current=1` (via migration) — the gate re-prompts
  everyone automatically.
- `[Security]` **L4 — database encrypted at rest (SQLCipher).** Closes the last
  fully-open security item. Swapped the SQLite driver for the drop-in fork
  `better-sqlite3-multiple-ciphers` (SQLite3MultipleCiphers — identical
  synchronous API, so zero query/call-site changes) and added transparent
  at-rest encryption keyed from `DB_ENCRYPTION_KEY`
  ([config.js](server/src/lib/config.js), required in prod, optional in dev):
  - The key is applied on every connection; an existing **plaintext DB is
    migrated to encrypted on first boot** via `PRAGMA rekey` (leaving WAL first,
    since rekey needs a rollback journal), and `VACUUM INTO` backups inherit the
    encryption ([pool.js](server/src/db/pool.js)).
  - Boot fails fast with a clear message if the key doesn't match the DB.
  - Dev with no key = plaintext, unchanged. Verified end-to-end on a copy of the
    real DB: plaintext→encrypted migration, keyed reads (29 users/4 coaches),
    unreadable without/with a wrong key, backups encrypted, and the dev no-key
    path still opens the existing WAL DB.
  - A full **SQLite→Postgres** migration was scoped first and **deferred**: it's
    a multi-week sync→async port of ~1000 call sites and isn't needed to achieve
    encryption-at-rest. Revisit when multi-instance scaling requires it.
- `[Docs]` Synced SECURITY.md + CHANGELOG with reality: marked F2/F3 done in the
  findings table, corrected "CSP is off" (it's on), added the global rate-limiter
  to "What's in place", and added a status note over the "Known V1 limitations"
  so the now-fixed items aren't read as still-open.

---

## 2026-06-15

### Fix
- `[Fix]` **Completing a session now shows up.** "Mark Complete" saved the
  workout (log + streak + program count) but gave no feedback and the session
  never visually completed: `/api/athlete/today` never cross-referenced
  `workout_logs`, so the Today's Session card stayed pending, and the player
  only closed back to the workout overview without refreshing anything — a user
  could easily log the same session twice. Now:
  - `/api/athlete/today` flags a session `completed` when a `workout_logs` row
    with `completed=1` exists for that date — matching either the timezone-local
    day or the UTC day the log was written under, so the badge isn't lost across
    the UTC/local boundary ([athlete.js](server/src/routes/athlete.js)).
  - The Today's Session card renders a green "Completed" badge and dims when done
    ([EnhancedToday.jsx](client/src/components/EnhancedToday.jsx)).
  - Both players invalidate the today + dashboard caches on completion so Home
    reflects it; the follow-along player shows a "Session complete!" confirmation
    and routes back to Home
    ([FollowAlongPlayer.jsx](client/src/pages/client/FollowAlongPlayer.jsx),
    [WorkoutPlayer.jsx](client/src/pages/client/WorkoutPlayer.jsx)).
- `[Fix]` **Re-opening a completed session no longer shows a misleading CTA.**
  `/api/explore/workouts/:id` now returns `completed_today`
  ([explore.js](server/src/routes/explore.js)); the follow-along player swaps its
  "Mark Complete" button for a green "✓ Completed today" state, and both players
  confirm before logging a second time the same day so streak/program counts
  aren't bumped by accident.

### Feature
- `[Feature]` **Client-side request cache cuts redundant API traffic.** The app
  had no shared fetch layer, so every screen refetched its data on each mount
  and React StrictMode (dev) fired each effect twice — brisk browsing produced
  bursts of duplicate calls. Added a tiny dependency-free cache
  ([apiCache.js](client/src/lib/apiCache.js)) doing two things: (1) de-dupe
  in-flight identical GETs into one network call, and (2) serve a recent
  response from memory for a short TTL. Cleared automatically on logout;
  `invalidate(urlSubstring)` busts entries after a mutation. Wired the hottest
  read paths through it: Explore's three catalogs (`/explore/content`,
  `/challenges`, `/nutrition/meal-schedules`, 60s TTL), the bottom-nav
  unread-count (15s TTL on navigation; polls/focus/read-events still force a
  fresh read), and WorkoutPlanner's `/athlete/today` + `/dashboard`.
- `[Feature]` **Extended the cache to the data-heavy screens.** Home, Profile,
  and Challenges now share cached reads for the static/reference endpoints —
  `/athlete/preferences` (120s, invalidated when Profile saves a toggle),
  `/athlete/features` (5min feature flags), `/explore/content` (shared key with
  the Explore page → fetched once), and `/benchmarks` (60s, shared across Home's
  card and Challenges' "My Levels"; invalidated when a benchmark attempt is
  logged so levels update immediately). Frequently-mutated reads (dashboard
  tasks/water/steps, schedule edits, notifications) were left live to avoid
  staleness. Also migrated the two existing ad-hoc module caches (`homeCache`,
  `challengesCache`) onto the shared layer and fixed `challengesCache` not being
  cleared on logout (it could briefly show the previous user's benchmark levels).

### Fix
- `[Fix]` **Rate limiter no longer locks out normal use.** Two problems in the
  global API limiter ([index.js](server/src/index.js)):
  1. *Broken auth exemption.* The limiter is mounted at `/api`, so inside it
     `req.path` is mount-relative (`/auth/login`, not `/api/auth/login`). The
     skip rule checked `req.path.startsWith('/api/auth')`, which never matched —
     so `/auth/login` and `/auth/me` were wrongly counted against the global
     bucket instead of only their own per-action limiters. Exhausting the bucket
     then blocked `/me` (appeared logged out) and `/login` (couldn't get back
     in). Skip now matches the mount-relative path (`/auth`, `/health`).
  2. *Cap too low.* 100 req/min was below what brisk, legitimate browsing of a
     data-heavy SPA produces (each navigation fires many parallel calls; dev
     StrictMode doubles them). Raised to a per-user ceiling of 1000/min for
     authenticated traffic (keyed per-user, so one account can't affect others)
     and 200/min for anonymous IPs. The limiter is now purely an abuse backstop
     (runaway loops / scraping / DoS), not a throttle on real users.
- `[Fix]` **Workout video no longer cut off in landscape.** The follow-along
  player sized the video to a width-driven 16:9 box (`paddingTop: 56.25%`), so
  on a rotated (wide, short) screen the box was taller than the viewport and the
  top/bottom of the clip got clipped. The video now fills the available area
  between the top bar and action bar and lets the player letterbox the clip, so
  the whole video stays visible in both orientations
  ([FollowAlongPlayer.jsx](client/src/pages/client/FollowAlongPlayer.jsx)).
- `[Fix]` **Tier change now requires confirmation.** Switching a client's tier
  in the admin ClientProfile was a one-click action that instantly changed their
  content access (could lock paid programs or unlock them for free). It now pops
  a confirm modal naming the move ("Move X from Free to Prime?")
  ([ClientProfile.jsx](client/src/pages/admin/ClientProfile.jsx)). The
  Account-lifecycle (Pause/Archive) buttons already had a confirm step.
- `[Fix]` **Events coach-profile view polish** ([Events.jsx](client/src/pages/client/Events.jsx)):
  - Killed the left-right scroll — the hero had `margin: 0 -16px` against a
    `padding: 0` container, bleeding 32px past the screen edges.
  - More breathing room: 20px side padding + extra top spacing.
  - Social icons are no longer hidden behind the floating bottom nav (container
    now has 140px bottom padding so they scroll clear).
  - "Book Now" 1:1 session options are now **expanded by default** instead of
    requiring a tap.

### Chore
- `[Chore]` Integrated 19 upstream commits from origin/main via a clean merge
  (no conflicts; both sides' changes preserved). Local build + migrations
  verified before push.

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
| F2 | 🟠 Medium | `javascript:`-scheme URLs accepted in coach-authored links rendered to `href`/`window.open` (group `cta_url`, event `meeting_url`, socials, notification/tier CTAs). No scheme validation. | ✅ Done |
| F3 | 🟡 Info   | Client `npm audit` no longer clean — 5 moderate (react-router open-redirect GHSA-2j2x-hqr9-3h42 + vite/vite-plugin-pwa chain). SECURITY.md §deps claims 0. | ✅ Done |

All three are now fixed: F1 (DOMPurify on rich-text, 2026-06-10), F2 (shared
`safeUrl()` allowlist, 2026-06-12), F3 (client `npm audit` → 0 vulnerabilities
via react-router 6.30.4 + vite 8, 2026-06-13). See the
[Security status tracker](SECURITY.md#security-status-tracker).

### Chore
- `[Chore]` Bootstrapped local dev on Windows: sparse-checkout to skip an
  invalid path (`server/import-data/AMS | Ground Zero ™ Assessment.pdf` — `|`
  is illegal on NTFS), created `server/.env`, installed deps, added the
  missing `concurrently` devDependency, seeded the local SQLite DB.
