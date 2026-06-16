# Launch & Operations Checklist — owner action items

These are the things **only you can do** — they're not code. The codebase work is
done; this is environment/secrets, DNS, legal, ops, and a few decisions. Grouped
by when they're needed. Cross-references point at [SECURITY.md](SECURITY.md).

Legend: ⬜ not started · 🟡 in progress · ✅ done

---

## A. Before / at production deploy (blockers)

- ⬜ **Set `DB_ENCRYPTION_KEY` in the Render environment.** *(SECURITY.md L4)*
  - *Why:* the database is encrypted at rest now; **production refuses to boot
    without it**, and this key is what decrypts the DB.
  - *How:* generate a key —
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` —
    add it as a Render env var named `DB_ENCRYPTION_KEY`, and save a copy in your
    password manager.
  - ⚠️ **Set it once and never lose or change it.** Losing/changing the key makes
    the database **permanently unreadable**. On the first deploy with the key,
    your existing plaintext prod DB auto-encrypts itself in place.

- ⬜ **Confirm `JWT_SECRET` is set in prod** (≥32 random chars). Already required;
  just verify it's present — the server won't boot without it.

- ⬜ **Deploy/restart cleanly so migrations run.** On boot the app creates the new
  tables (`file_assets`, the `is_admin` column) and runs the backfill migrations
  automatically. Nothing to do beyond a clean deploy.

## B. Email deliverability (password reset depends on this)

- ⬜ **Verify your sending domain in Resend + set `EMAIL_FROM`.**
  - *Why:* emails currently use Resend's shared test sender
    (`onboarding@resend.dev`), which **only delivers to the Resend account
    owner**. Real users won't receive password-reset emails until this is done.
  - *How:* in Resend, add and verify `agelessmovement.com` (add the DNS records
    Resend shows you), then set the `EMAIL_FROM` env var to a real address on it,
    e.g. `Ageless Movement <noreply@agelessmovement.com>`.

- ⬜ **Add SPF / DKIM / DMARC DNS records** for the sending domain. Resend gives
  you SPF + DKIM during verification; add a DMARC record yourself. Without these,
  reset emails are likely to land in spam.

## C. Before inviting real / EU users

- ⬜ **Get lawyer-reviewed Terms of Service + Privacy Policy copy.** *(SECURITY.md L8)*
  - The consent versioning + the re-consent gate are built; only the legal *text*
    is outstanding. When you update the copy, publish a new version (a one-line
    migration: set the old `consent_versions` row `is_current = 0`, insert the new
    one `is_current = 1`) — the app then re-prompts every user to accept.

- ⬜ **Run the CSP browser smoke-test.** *(SECURITY.md L7)*
  - Open the app in a browser with DevTools → Console, click through
    workouts/videos/images and a coach profile, and confirm there are **no
    `Content-Security-Policy` violation errors** (Vimeo embeds + styles should all
    load). Claude can drive this with you.

- ⬜ **Commission a third-party penetration test.** Independent adversarial testing
  before you hold real health data. Hand the tester the "Suggested attack surface"
  section of [SECURITY.md](SECURITY.md) as the brief.

- ⬜ **Review who should be an admin coach.** The multi-coach migration made *all*
  existing coaches admins (non-breaking). Decide who should really be admin and
  demote the rest: `UPDATE users SET is_admin = 0 WHERE id = <coach id>;`

## D. Backups & recovery (ops)

- ⬜ **Configure an off-box backup.** *(SECURITY.md L9)* The app writes daily
  encrypted backups, but they sit on the **same Render disk** as the live DB. Add
  a Render disk-snapshot schedule (or copy backups to external storage like S3) so
  a disk loss doesn't lose everything.

- ⬜ **Test a restore.** Take a backup, restore it to a fresh database, and confirm
  the app opens it with the encryption key. An untested backup isn't a backup.

## E. Ongoing / optional

- 🟡 **Enable Dependabot** (dependency vulnerability monitoring). The config file
  [`.github/dependabot.yml`](.github/dependabot.yml) is in place — it schedules
  weekly grouped version-update PRs for the root, `server/`, and `client/`
  packages. **Remaining (you):** on GitHub → repo **Settings → Code security**,
  turn on **Dependabot alerts** *and* **Dependabot security updates** so you also
  get automatic PRs for newly-disclosed CVEs. (Takes effect once this file is
  pushed to the default branch.)

- ⬜ **Stripe / payments (future).** Not wired yet. When you add it: verify Stripe
  webhook signatures, and never let card data touch the server (Stripe Elements
  tokenises client-side).

## F. Decisions for you (no single right answer)

- ⬜ **Register email enumeration.** Signup returns "email already registered,"
  which confirms whether an email has an account. It's standard signup UX, but it
  does leak account existence. *Leave it (better UX) or make it generic (more
  private).*

- ⬜ **Office-doc / zip upload scanning.** `.doc/.docx/.xls/.zip` uploads are
  accepted and not malware-scanned (they're served as downloads, never executed).
  *Accept the risk for now, or add scanning before wider use.*

---

*Code/deploy note: pushing and deploying are yours (you've said so). All the
session's code changes are committed locally but not pushed.*
