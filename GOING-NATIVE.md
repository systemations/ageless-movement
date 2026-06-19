# Going Native — Ageless Movement → App Store & Play Store (Capacitor)

The plan to take the existing React/Vite PWA into the iOS App Store and Google
Play Store using **Capacitor** (wraps the web app you already have in a native
shell). This is the full runbook: what's needed, the phases in order, and the
app-specific gotchas. It's a real project, not a switch — but every step is
known and solvable.

> **Honest expectation:** Capacitor reuses your web codebase, so you're *not*
> rewriting the app. But you will: adapt auth for the native WebView (the big
> one), add a few native plugins, handle store requirements, and pass Apple
> review. Budget for iteration, especially on Apple's first submission.

---

## Hard prerequisites

- **A Mac with Xcode** — *required* for iOS builds. There is no way to build/
  submit an iOS app from Windows. Options: a Mac, a cloud Mac (MacStadium,
  macincloud), or a CI macOS runner (GitHub Actions / Ionic Appflow). **This repo
  is currently developed on Windows, so iOS work is blocked until you have one.**
- **Android Studio + JDK 17** — for Android builds (works on Windows).
- **Node.js** — already have it.
- **CocoaPods** (Mac only) — for iOS native dependencies.
- **Apple Developer Program** — $99/year (required to ship to the App Store).
- **Google Play Developer account** — $25 one-time.

---

## Progress snapshot (2026-06-16)

- ✅ **Phase 0 — Foundation** (Capacitor installed, config, scripts).
- ✅ **Phase 1 — Auth adaptation (incl. 1b images)** — login works on the S23 via
  the native Bearer path, and `/uploads` images now load: a file-only token
  (`?ft=`) the gate accepts while preserving the L1 per-file authz; the native
  fetch wrapper rewrites `/uploads` URLs in JSON responses. CORS/CSP are fine in
  dev (open); prod still TODO.
- 🟡 **Phase 2 — Platforms** — **Android ✅** added + running on the device.
  **iOS ⬜** (needs a Mac).
- 🟡 **Phase 4 — UI fixes** — auth/Welcome screens fixed for safe areas +
  landscape orientation, Build-a-Workout touch targets enlarged, onboarding
  PackageSelection + PlansPage passed for safe-area/dvh, and the fixed
  fullscreen overlays (WorkoutPlayer, FollowAlongPlayer, FoodSearch scanner)
  now carry all four safe-area insets so edge controls clear the status bar /
  gesture bar / side notch. Remaining: bottom-sheet/FAB dynamic insets (flat
  padding is Android-adequate today; needed before the iOS build) and the
  coach-side fullscreen editors (desktop-oriented, low mobile priority).
- 🟡 **Phase 3 — Native plugins** — StatusBar ✅ + SplashScreen ✅ (dark theme,
  no white flash); Camera + Push ⬜.
- 🟡 **Phase 5 — Store assets** — real app icon + branded splash generated from
  `am-logo.png` via `@capacitor/assets` (adaptive icon + portrait/landscape/dark
  splash, all on `#060D1A`), replacing the Capacitor placeholder. Store
  screenshots + listing copy ⬜.
- ⬜ **Phase 6 — Submission** · ⬜ **Phase 7 — IAP decision**.

**Recommended next step:** rebuild the APK in Android Studio to confirm the new
icon + splash on the device, then a **Play Console** internal-testing build
(Phase 6) — needs the $25 Google account + a signed release build. Remaining
Phase 4 screens (fullscreen players, bottom-nav sweep) and Camera + Push (rest of
Phase 3) are nice-to-haves that can come later.

## Phases (in order)

### Phase 0 — Capacitor foundation ✅ (done this session, Windows-safe)
Install Capacitor and point it at the web build. No app behaviour changes, fully
reversible.
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
  installed in `client/`.
- `client/capacitor.config.json` created (`appId: com.agelessmovement.app`,
  `appName: Ageless Movement`, `webDir: dist`).
- Build flow: `npm run build` (Vite → `client/dist`) then `npx cap sync` copies
  it into the native projects.

### Phase 1 — Auth adaptation for the WebView ✅ DONE (login works on device; residual: Phase 1b images)
This is the biggest app-specific change and **must be done before the native app
can log in.** Why: our web auth (SECURITY.md L2) and the `/uploads` file gate
(L1) use httpOnly `SameSite=Lax` cookies. In Capacitor the UI loads from
`capacitor://localhost` while the API is at `https://<server>`, so requests are
**cross-origin** and Lax cookies won't be sent (and iOS WKWebView blocks
third-party cookies regardless).

Plan:
1. **Detect native context** (`Capacitor.isNativePlatform()`).
2. **Native token storage:** on login, also return the JWT to the client and
   store it in `@capacitor/preferences` (or a secure-storage plugin). Send it as
   `Authorization: Bearer <jwt>` on API calls in native builds. (The server
   already accepts a Bearer token as a fallback — see `authenticateToken` — so
   the backend barely changes.)
3. **Images behind the `am_file` gate:** `<img src>` can't send an Authorization
   header. Options: (a) issue short-lived **signed URLs** for native image loads,
   or (b) fetch images via the native HTTP plugin and render as blobs. Pick one.
4. **CORS + CSP:** allow the `capacitor://localhost` / `https://localhost` origins
   in `ALLOWED_ORIGINS`, and widen the CSP `connect-src` to the API origin for the
   native build.
5. Keep the **web build exactly as-is** (cookies) — only the native build uses
   the Bearer path.

### Phase 2 — Add the native platforms 🟡 (Android ✅ on device · iOS ⬜ needs a Mac)
- `npx cap add android` (needs Android Studio) → creates `client/android/`.
- `npx cap add ios` (needs a Mac) → creates `client/ios/`.
- `npx cap sync`, then open in Android Studio / Xcode and run on an
  emulator/simulator and a real device.
- Decide what to commit: the generated `android/`/`ios/` folders are usually
  committed (minus build artifacts) so the native config is version-controlled.

### Phase 3 — Native plugins
- **Camera** (`@capacitor/camera`) — proper native photo capture for check-in /
  progress / chat uploads (the web `<input type=file>` works but feels poor).
- **Push notifications** (`@capacitor/push-notifications` + APNs/FCM/Firebase) —
  your current notifications are in-app polling; native push is a separate setup.
- **App / StatusBar / SplashScreen / Keyboard** — lifecycle, status-bar styling,
  launch screen, keyboard insets.

### Phase 4 — App-specific UI fixes 🟡 (auth/Welcome + builder + fullscreen players done)
- **Safe areas / notches:** handled globally by `.app-shell` (top inset) and
  `.bottom-nav` (`max(env(safe-area-inset-bottom), 8px)`) for normal scrollable
  pages. **Fixed `inset:0` overlays bypass `.app-shell`**, so each one applies the
  four insets itself — done for the client fullscreen overlays (WorkoutPlayer,
  FollowAlongPlayer, FoodSearch scanner). Still flat-padded (Android-OK, revisit
  for iOS): client bottom sheets / FAB CTAs, and the coach-side fullscreen
  editors (CourseBuilder, MealScheduleBuilder).
- **Status bar** styling to match the dark theme.
- **Router:** confirm `react-router` works from the local origin (deep links /
  refresh behave differently from the local file scheme; may need config).
- **Vimeo embeds:** confirm inline playback + fullscreen in WKWebView
  (`allowsInlineMediaPlayback`).

### Phase 5 — Store assets 🟡 (icon + splash done; listing assets ⬜)
- ✅ App icon (all densities, adaptive foreground/background) + splash (portrait,
  landscape, `-night` dark) generated from `client/public/am-logo.png`:
  ```
  cp client/public/am-logo.png client/assets/logo.png
  cd client && node_modules/.bin/capacitor-assets generate --android \
    --iconBackgroundColor '#060D1A' --iconBackgroundColorDark '#060D1A' \
    --splashBackgroundColor '#060D1A' --splashBackgroundColorDark '#060D1A'
  ```
  `@capacitor/assets` is a devDependency; source lives in `client/assets/`. Re-run
  after replacing `logo.png` (e.g. with a 1024×1024 master) to regenerate. Then
  rebuild the APK in Android Studio to see it.
- ⬜ Screenshots per device class, app descriptions, keywords, category, age rating.

### Phase 6 — Store setup & submission
**Apple (App Store Connect):**
- Signing certs + provisioning profiles; bundle id `com.agelessmovement.app`.
- TestFlight for beta testing.
- **App Privacy "nutrition labels"** — declare data collected (health metrics,
  photos, email, etc.).
- **Privacy policy URL** — your L8 legal copy.
- **In-app account deletion** — Apple requires it for apps with accounts.
  ✅ Already implemented (GDPR self-delete on the Profile page).
- **Review risk (Guideline 4.2):** a bare web wrapper can be rejected; the native
  plugins (push, camera) + an app-like feel are what get it through.

**Google (Play Console):**
- App signing, internal-testing track first.
- **Data safety form** — Google's equivalent of Apple's privacy labels.
- Target API level requirements (Android Studio handles current targets).

### Phase 7 — Payments decision (only if selling subscriptions in-app)
If you ever sell tier upgrades **inside** the app, Apple/Google generally require
their **in-app purchase** (15–30% cut) for digital subscriptions. Today upgrades
happen off-app (Stripe not wired), which sidesteps this. Decide before adding any
in-app purchase flow — retrofitting IAP is significant.

---

## Consolidated gotchas (the things that bite)
1. **Cookie auth breaks in the WebView** → needs the Bearer/native-token path
   (Phase 1). The #1 item.
2. **`/uploads` images** behind the cookie gate won't load natively → signed URLs
   or native fetch (Phase 1).
3. **iOS needs a Mac** — hard blocker for the App Store half.
4. **Apple review 4.2** — needs genuine native integration, not a bare wrapper.
5. **IAP** for in-app digital subscriptions (Phase 7).
6. **Push** is a separate native setup, not your current polling.
7. **Safe areas / status bar** for notched devices.

## Realistic sequence
Phase 0 (done) → Phase 1 auth (most engineering) → Phase 2 Android first (you can
do it on Windows) to validate the whole flow → native plugins + UI fixes →
Android store submission → then iOS once you have a Mac. Doing **Android first**
lets you prove everything end-to-end without waiting on Mac access.
