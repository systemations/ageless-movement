# Render Deployment — Ageless Movement (web/API)

Step-by-step to get the production web app live at
**`https://agelessmovement.handsdan.com`**. One Render service runs everything:
the API, the gated `/uploads`, **and** the built React app (the server serves
`client/dist` with a `*` catch-all). No separate frontend host needed.

Legend: **[you]** dashboard/DNS · **[me]** code/config · **[both]**

---

## 0. Before you touch Render — generate the two secrets [you]

Run these **locally** (so the secrets never live in a chat log), then keep both
in the password manager:

```bash
# JWT_SECRET (signs login sessions)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# DB_ENCRYPTION_KEY (encrypts the database at rest)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

⚠️ **`DB_ENCRYPTION_KEY` is the one with no recovery** — save the master copy in
the vault *and* somewhere offline. Losing it = the database can never be decrypted.

---

## 1. Verify the email domain in Resend [you] — can run in parallel

Needed for the `EMAIL_FROM` + `RESEND_API_KEY` vars below (password-reset emails).

1. In Resend → **Domains → Add** `agelessmovement.handsdan.com` (recommended — keeps
   app email isolated from Dan's main inbox).
2. Resend shows DNS records (`send.` MX+SPF, `resend._domainkey` DKIM, `_dmarc`).
   Add them in the `handsdan.com` DNS dashboard.
3. Grab the **API key** (Resend → API Keys).

---

## 2. Create the Render Web Service [you]

Render → **New → Web Service** → connect the GitHub repo
`systemations/ageless-movement`, branch **`main`**.

| Setting | Value |
|---|---|
| **Runtime** | Node |
| **Build Command** | `npm run build:all` |
| **Start Command** | `npm start` |
| **Instance type** | **Starter ($7/mo) or higher** — the free tier has *no persistent disk* and sleeps, so it can't hold the database |
| **Health Check Path** | `/api/health` |
| **Auto-Deploy** | On (deploys each push to `main`) — optional |

### Persistent Disk (required — this is where the DB + uploads live)
Add a disk under the service:
- **Mount path:** `/opt/render/project/src/server/data`
- **Size:** 1 GB to start (grows with uploaded photos/videos)

> Why: the app writes its encrypted DB + uploaded files to `server/data`. On a
> fresh disk it auto-seeds from the bundled snapshot (`server/seed/ageless-seed.db`)
> and encrypts on first boot. Without a persistent disk, all data is wiped on every
> deploy.

---

## 3. Environment variables [you]

Add these under the service's **Environment**:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | *(the 48-byte hex from step 0)* |
| `DB_ENCRYPTION_KEY` | *(the 32-byte hex from step 0)* |
| `ALLOWED_ORIGINS` | `https://agelessmovement.handsdan.com,https://localhost,capacitor://localhost` |
| `APP_BASE_URL` | `https://agelessmovement.handsdan.com` |
| `RESEND_API_KEY` | *(from Resend, step 1)* |
| `EMAIL_FROM` | `Ageless Movement <noreply@agelessmovement.handsdan.com>` |
| `JWT_EXPIRES_IN` | `7d` *(optional)* |
| `NODE_VERSION` | `20` *(pins Node so the native SQLite module builds cleanly; 22 also fine)* |

- **Do NOT set `PORT`** — Render provides it automatically and the server reads it.
- The `https://localhost` / `capacitor://localhost` origins are there so the
  **native app** can talk to prod later; harmless for the web app now.

---

## 4. Deploy & watch the logs [both]

First deploy takes a few minutes (it compiles the native SQLite module). In the
logs you should see, in order:
- `[db] fresh disk — seeded from bundled snapshot (…)`
- `[db] database encrypted at rest (one-time rekey).`
- `Server running on port …`

If it **crashes on boot**, it's almost always a missing env var — the server
*intentionally* refuses to start without `JWT_SECRET` or `DB_ENCRYPTION_KEY` in
production (the error message says which).

---

## 5. Point the domain [you, I guide]

1. Render → the service → **Settings → Custom Domains → Add**
   `agelessmovement.handsdan.com`.
2. Render shows a **CNAME target** (e.g. `xxxx.onrender.com`).
3. In `handsdan.com` DNS, add: `agelessmovement` **CNAME** → *(that target)*.
4. Wait for Render to verify → it auto-issues the HTTPS certificate (a few min).

---

## 6. Smoke test [both]

- Open `https://agelessmovement.handsdan.com` — the app loads over HTTPS.
- **Register + log in** — works.
- **Workout videos + images** load.
- **Forgot password** → the reset email actually arrives (confirms Resend).
- DevTools console — **no CSP errors** (SECURITY.md L7).

---

## After this is green
- **Off-box backups** — schedule a Render disk snapshot (SECURITY.md L9).
- Then **Phase 2/3** in [GOING-NATIVE.md](GOING-NATIVE.md): point the native app at
  this prod URL, remove the dev `cleartext` config, build the signed Android release.

*Owner action items live in [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md); access/accounts
in [DIRECTOR-ACCESS-REQUEST.md](DIRECTOR-ACCESS-REQUEST.md).*
