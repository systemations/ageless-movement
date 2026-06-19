# Ageless Movement — Access & Accounts Needed from the Director

This is everything I need **from you** to get the app live on the web and into the
Apple App Store + Google Play. It's grouped by area, each with what I need, why,
and roughly what it costs. Items marked **🔴 blocker** stop launch until they're
sorted; **🟠 soon** are needed shortly after; **🟢 later** can wait.

> **Best way to hand this over:** create the accounts below under **one business
> identity** — the company email + a shared password manager (1Password /
> Bitwarden) — and **add me as a member/collaborator** rather than emailing
> passwords. That keeps ownership with the business: if I ever step away, you
> still own everything. Don't create these under my personal accounts.

---

## Access / logins I need from you (so I can set the rest up myself)

**✅ Already in hand** — you have logins for these, so **nothing's needed from the
Director**: `handsdan.com` hosting/DNS · **Resend** · **Stripe**.

I can configure the rest myself **once you give me access** — ideally by
**inviting me as a member** (each supports it) so I use my own login + 2FA rather
than us sharing passwords.

**Still need access (you grant, I configure):**

| Service | How to give me access |
|---|---|
| Render (app hosting) | Invite me as a team member; you cover billing (see §2) |
| Vimeo (video) | Add me as a team member, or share the login |
| Google Cloud (the "Sign in with Google" project) | Add me as **Editor** |
| Google Search Console (verify `handsdan.com`) | Add me as a full / owner user |

**🔒 Only you can create these first (identity / fee), then add me:**

| Service | Why it has to be you | Then |
|---|---|---|
| Google Play Console | Identity verification + D-U-N-S + $25 fee | Add me as a user |
| Apple Developer / App Store Connect | Legal identity + D-U-N-S + $99/yr fee | Add me as a user |

> Most of the Google items hang off **one business Google account** — if you add
> me to it (or to each console individually), it covers Cloud, Search Console,
> Play, and Firebase (push, later). Please turn on **2FA**; for any shared logins,
> keep the password **and** the 2FA codes in the shared password manager.

---

## 1. Domain & DNS — `agelessmovement.handsdan.com` 🔴 blocker

✅ **Decided:** the app lives at **`agelessmovement.handsdan.com`** — a subdomain of
your existing `handsdan.com`. Nothing new to buy, and because the server serves
both the API and the website from one host, the whole app fits on this one
subdomain.

- ✅ **DNS access — in hand.** You have the `handsdan.com` hosting/DNS login, so we
  can add these records ourselves (no Director request needed). Just confirm which
  dashboard it is (Cloudflare, GoDaddy, etc.) so I add the records in the right place.
- Records that will be needed:
  - `agelessmovement.handsdan.com` → **CNAME** to the Render host (web app + API).
  - **Email** records, on *child* names so they don't clash with the CNAME above:
    `send.agelessmovement.handsdan.com` (MX + SPF), `resend._domainkey…` (DKIM),
    `_dmarc…` (DMARC) — Resend gives the exact values.
  - One-off **TXT verification** records for Render (domain ownership), Google
    (Search Console, for the login authorized-domain — see §6), and Apple if we
    add Sign in with Apple.
- **HTTPS certificate:** Render auto-provisions it for the subdomain — nothing to
  buy or configure there.

## 2. Hosting & Server — Render 🔴 blocker

> **Note on the existing `handsdan.com` hosting (which you have):** that's great
> for the DNS + a marketing site, but the Ageless Movement **backend** needs an
> always-on **Node.js** process + a **persistent writable disk** (the encrypted
> database + uploaded files live there). Standard shared/website hosting can't run
> that — so we still need **Render** (or equivalent). The one exception: if
> `handsdan.com` runs on a **VPS / cloud server** we fully control, we *could* host
> there instead (at the cost of managing the server ourselves). **Tell me what the
> handsdan hosting actually is** and I'll confirm whether Render is needed.

- **A Render account** (https://render.com) on a **paid plan** — the app needs an
  always-on service + a persistent disk (the database lives there). Add me as a
  team member, or create it and share access.
- **Billing set up** on that account (card on file).
- *Why:* this is where the live app and the members' database actually run.
- *Cost:* ~**$7–25/month** depending on tier + disk size.

## 3. Production Secrets (you own these, I help generate) 🔴 blocker

- **`DB_ENCRYPTION_KEY`** — the key that encrypts the members' database at rest.
  I'll generate it; **you store the master copy in the password manager** (ideally
  a second copy offline too).
  ⚠️ This is the **one secret with no recovery** — if it's lost, the database can
  never be decrypted again. It can be *rotated* any time as long as you still hold
  the current one; the danger is only losing every copy.
- **`JWT_SECRET`** — secures login sessions. I generate, you keep a copy.
- *What I need from you:* somewhere safe (the shared vault) to record them.

## 4. Transactional Email — Resend 🟠 soon

✅ **Account created + you have the login.** Remaining steps:

- **Confirm the sending domain.** My recommendation: send from
  **`agelessmovement.handsdan.com`** — it matches the app and keeps the app's
  email reputation **isolated from your main `handsdan.com` inbox**, so app emails
  can never hurt Dan's normal email deliverability.
  - *Alternative:* verify the root `handsdan.com` and send from
    `noreply@handsdan.com` (reads as the parent brand). Either is fine — your call.
- **Add the Resend DNS records** (the `send.` / `resend._domainkey.` / `_dmarc.`
  records from §1) so emails authenticate (SPF/DKIM/DMARC) and don't land in spam.
- **Set the "from" address**, e.g. `Ageless Movement <noreply@agelessmovement.handsdan.com>`.
- *Why:* password-reset emails. Until the domain is verified, only test emails to
  your own address deliver — real users can't reset their password.
- *Cost:* **free** up to ~3,000 emails/month, then ~$20/month.

## 5. Video Hosting — Vimeo 🟠 soon

- **Access to the Vimeo account** that holds the workout videos (the app embeds
  Vimeo players) — login or added as a team member.
- **Confirm the plan tier** — we want one that allows **private/domain-restricted
  embedding** (lock playback to `agelessmovement.handsdan.com`) and **hides Vimeo
  branding** (Vimeo Standard/Pro or higher).
- *Why:* every exercise/follow-along video streams from here.
- *Cost:* ~**$12–33/month** depending on tier.

## 6. "Sign in with Google" — Google Cloud / OAuth 🟠 soon

To add Google login, I need these set up under the business Google account
(ideally the **same** one used for Google Play, §8):

- **A Google Cloud Console project** (https://console.cloud.google.com).
- **OAuth consent screen** configured + **published**: app name (Ageless Movement),
  logo, support email, the Privacy Policy + Terms URLs, and `handsdan.com` as an
  authorized domain. Scopes are just basic **email + profile** (non-sensitive, so
  normally no lengthy Google review).
- **Verify `handsdan.com` in Google Search Console** (free) — required before
  Google will accept it as an authorized domain.
- **OAuth Client IDs** (I'll tell you exactly what to create + provide the
  fingerprints):
  - **Web** client (ID + secret) — website + server-side token check.
  - **Android** client — needs the app package `com.agelessmovement.app` + the
    signing SHA-1 (I provide it).
  - **iOS** client — needs the iOS bundle ID.
- *Cost:* **free.**

> ⚠️ **Apple knock-on — important decision.** Apple's App Store rule (Guideline
> 4.8) says if the **iPhone** app offers Google sign-in, it **must also** offer
> **"Sign in with Apple."** So enabling Google login on iOS means we also build
> Apple login (needs an Apple **Services ID + Sign-In key** from the Developer
> account — no extra cost, but it's extra setup + engineering). **Decision I need:**
> Google login on **iOS too**, or **web + Android only**? (Android/web have no such
> rule.)

*Engineering note (my side, not yours): I build the OAuth flow — server verifies
Google's token, links or creates the account, issues our session — plus the
buttons on web + native, and account-linking for users who already signed up with
email/password.*

## 7. Apple App Store (iPhone/iPad) 🟠 soon

- **Apple Developer Program enrollment** (https://developer.apple.com) — **$99/year**.
  - For a **company** account (recommended), Apple requires a **D-U-N-S number**
    for the legal business entity (free, can take a few days to get).
  - Needs the **legal business name, address, and a verification phone number.**
- **Add me to App Store Connect** as a user once enrolled.
- **A Mac** for the iOS build — Apple requires macOS to build/submit. Options:
  use a Mac you already have, **or** buy a Mac mini (~$599 one-time), **or** a
  cloud-Mac service (~$20–50/month while building).
- **"Sign in with Apple"** (a Services ID + a Sign-In key) — **only if** we enable
  Google login on iOS (see §6). Included with the Developer account.
- *Note:* Android can be built without any of this — so we can ship Android first.

## 8. Google Play Store (Android) 🟠 soon

- **Google Play Developer account** (https://play.google.com/console) —
  **$25 one-time**.
  - Needs a **Google account** (use the business one) and **identity
    verification**; for an organisation account Google also requires a **D-U-N-S
    number** + business details.
- **Add me to the Play Console** as a user.
- *Why:* required to publish the Android app (we can start with a private
  internal-testing track before going public).

## 9. Payments — Stripe 🟢 later (only when we sell plans in-app)

> **Important — Stripe is *not* "in-app purchases," and isn't needed at launch.**
> Selling digital upgrades *inside* the iOS/Android app must use **Apple/Google's**
> billing (15–30% cut), **not** Stripe — using Stripe for in-app digital goods
> gets the app rejected. Stripe is for the **web** version and **off-app**
> payments (e.g. a coach-sent link). The app already routes paid upgrades to the
> coach, who collects payment manually — so we can launch with **zero payment
> code and zero store cut**. Add self-serve **Stripe on the web** first; only
> reach for in-app purchases (IAP) if we specifically need to sell inside the
> native apps.

- ✅ **Stripe login already in hand** — nothing needed from the Director here. (It
  should be connected to the **business bank account**, which it presumably already
  is.)
- **Decision:** whether paid upgrades happen **inside the app** or **off-app**.
  In-app digital subscriptions on iOS/Android must use Apple/Google billing (they
  take **15–30%**). Off-app (Stripe link / handled by the coach) avoids that cut.
- *Cost:* no monthly fee; ~**2.9% + 30¢** per transaction, plus the store cut if
  in-app.

## 10. Later / optional infrastructure 🟢

- **Push notifications** (when we want them): Android uses **Firebase Cloud
  Messaging** (free Firebase project under the business Google account); iOS uses
  **Apple Push Notification service** (an APNs key from the Apple Developer
  account — no extra cost). Today notifications are in-app only.
- **Off-box backups:** the app writes daily encrypted DB backups, but they sit on
  the same Render disk as the live DB. A Render disk-snapshot schedule, or copying
  them to external storage (AWS S3 / Backblaze B2, ~a few $/month), protects
  against disk loss. *(See SECURITY.md L9.)*

## 11. Brand & Legal 🟠 soon

- **Legal entity details** — registered business name + address. Required for the
  app store listings, the privacy policy, and the email footer.
- **Lawyer-reviewed Terms of Service + Privacy Policy** — the app handles health
  data, so these need real legal copy (we have placeholder text in place now). The
  re-consent system is already built; I just need the final wording. *(Also used
  as the Privacy/Terms URLs on the Google consent screen, §6.)*
- **A public Privacy Policy URL** (we can host it at `agelessmovement.handsdan.com/privacy`).
- **High-resolution logo** — ideally a **1024×1024 PNG** master (we're currently
  using a 512px version) for crisp app icons, plus brand colours.
- **App store listing content** — short description, full description, keywords,
  category, age rating answers, and **a support email + (optional) marketing URL.**
- **Screenshots sign-off** — I'll produce store screenshots; you approve them.

## 12. Decisions I Need From You (no cost, just answers)

- **What is the `handsdan.com` hosting?** (a shared web host vs. a VPS we control) —
  determines whether we still need Render (§2). Also: which DNS dashboard is it?
- **Email "from" address** — subdomain vs root (§4).
- **Google login on iOS too, or web + Android only?** (drives whether we also
  build Sign in with Apple — §6).
- **In-app vs off-app payments** (§9).
- **Who is an "admin" coach** — the app supports multiple coaches; you decide who
  has full admin rights vs. a regular coach.
- **Support contact** — the email/phone shown to users for help.
- **Data retention stance** — how long we keep data for inactive/deleted members
  (GDPR self-delete is already built; this is a policy choice).

---

## Quick budget summary

| Item | Cost | When |
|---|---|---|
| Domain (`handsdan.com` subdomain) | **$0 — already owned** | now |
| Render hosting | ~$7–25 / month | at launch |
| Resend (email) | free → ~$20 / month | at launch |
| Vimeo (video) | ~$12–33 / month | at launch |
| Google Sign-In (Cloud + Search Console) | free | with login |
| Apple Developer | $99 / year | for iOS |
| Mac for iOS builds | ~$599 once *or* ~$20–50/mo cloud | for iOS |
| Google Play | $25 one-time | for Android |
| Sign in with Apple / APNs / FCM push | free / included | as needed |
| Off-box backups (optional) | ~$1–5 / month | ops |
| Stripe | ~2.9% + 30¢ per sale | when selling |
| D-U-N-S number | free (a few days) | for store org accounts |

**Rough run-rate once live:** ~**$40–80 / month** + the one-time store/Mac costs.

---

## Fastest path to a working app

1. **DNS access + Render + secrets** (§1–3) → the web app goes live at
   `agelessmovement.handsdan.com`.
2. **Resend domain + Vimeo** (§4–5) → email and videos work for real users.
3. **Google Sign-In** (§6) → social login (decide the iOS question first).
4. **Google Play** (§8) → Android app in testing (no Mac needed).
5. **Apple** (§7) → iPhone app (needs the Mac + Developer account).
6. **Legal + brand** (§11) in parallel — needed before inviting real/EU users.

*The matching engineering tasks are tracked in [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md)
and [GOING-NATIVE.md](GOING-NATIVE.md).*
