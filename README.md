# WaSender — WhatsApp Bulk Campaign Sender

A self-hosted WhatsApp bulk campaign sender built with Next.js and
[whatsapp-web.js](https://wwebjs.dev/). Connect a WhatsApp number by scanning a
QR code, build message templates, import your contact list, and run bulk
campaigns with randomized delays between messages — all from a dashboard
modeled after the reference screenshot (Overview, Campaigns, Templates,
Contacts, Logs, Devices).

## Features

- **Devices** — link one or more WhatsApp numbers via QR code (whatsapp-web.js
  + LocalAuth session persistence), see live connection status, disconnect or
  reconnect.
- **Templates** — reusable messages with `{{name}}`, `{{phone}}` and any
  custom CSV column as personalization variables, plus an optional image /
  video / PDF attachment.
- **Contacts** — add contacts manually or bulk-import a CSV (auto-detects
  phone/name columns, maps extra columns to custom variables), organize into
  groups.
- **Campaigns** — pick a device, a template, and an audience (a group or all
  contacts), set a min/max random delay between sends, then start, pause,
  resume or stop the run with live progress over WebSockets.
- **Logs** — every send attempt with status (queued/sending/sent/failed/
  skipped), error detail, and timestamps, filterable by status/search.
- **Overview** — dashboard stats: contacts, templates, campaigns, connected
  devices, messages sent/failed today, success rate, recent campaigns.

Out of scope by request: AI Assistant and Apps (present in the reference
image, intentionally not implemented here).

## Architecture

- **Next.js 14 (App Router, TypeScript, Tailwind)** for the UI and REST API
  routes.
- **Custom Node server** (`server.ts`, run via `tsx`) wraps the Next.js
  request handler together with a **Socket.IO** server, because
  whatsapp-web.js needs a long-lived Node process (it drives a headless
  Chromium via Puppeteer) — this can't live inside stateless serverless
  functions.
- **`src/lib/whatsapp/manager.ts`** — a singleton that owns one
  whatsapp-web.js `Client` per connected device, emits state changes (`qr`,
  `authenticated`, `connected`, `disconnected`), which `server.ts` forwards to
  the browser over Socket.IO.
- **`src/lib/campaign/runner.ts`** — a singleton campaign engine: pulls queued
  `CampaignMessage` rows, renders the template, sends via the matching
  device's client, waits a random delay in `[minDelay, maxDelay]` seconds,
  and repeats — with pause/resume/stop control and live progress events.
- **Prisma + SQLite** for storage (`Device`, `Template`, `Group`, `Contact`,
  `Campaign`, `CampaignMessage`).
- **Auth**: a single admin account (env-configured email/password), sessions
  as a signed JWT in an httpOnly cookie, enforced by `src/middleware.ts`.

## Getting started

### Prerequisites

whatsapp-web.js drives a real Chromium browser via Puppeteer, so this needs
to run somewhere Chromium can launch (a VM, container, or your own machine —
not a typical serverless/edge host). On Linux you'll generally want Chromium
system dependencies installed; see the
[whatsapp-web.js guide](https://wwebjs.dev/guide/) if `npm install` didn't
already fetch a working Chromium.

### Setup

```bash
npm install
cp .env.example .env      # then edit ADMIN_EMAIL / ADMIN_PASSWORD / SESSION_SECRET
npx prisma migrate deploy # creates prisma/dev.db and applies the schema
npm run dev                # http://localhost:3000
```

Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`, then:

1. Go to **Devices** → **Add device** → scan the QR with WhatsApp on your
   phone (Settings → Linked devices → Link a device).
2. Go to **Templates** and create a message (optionally with an attachment).
3. Go to **Contacts** and add people manually or **Import CSV** (needs a
   phone/mobile/number column; a name column is picked up automatically, any
   other columns become `{{variables}}`).
4. Go to **Campaigns** → **New campaign**, pick the device, template, and
   audience (a group or "all contacts"), set the delay range, and create it.
5. Open the campaign and hit **Start** — progress updates live; you can
   **Pause**/**Resume**/**Stop** at any time.

### Production

```bash
npm run build
npm start   # NODE_ENV=production tsx server.ts
```

Session files for linked WhatsApp devices live in `.wwebjs_auth/` and
uploaded template media in `uploads/` — both are gitignored; back them up if
you care about not having to re-scan QR codes after a redeploy.

### Deploying with Docker / Dokploy

The repo includes a `Dockerfile` (Debian slim + a system Chromium for
whatsapp-web.js, so no Puppeteer download needed) and a `docker-compose.yml`
with named volumes for everything that must survive a redeploy: the SQLite
database, uploaded template media, and linked-device sessions.

**In Dokploy:**

1. Create a new application from this Git repository, build type **Dockerfile**
   (Dokploy will find it at the repo root — no Nixpacks needed).
2. Under **Environment**, set:
   ```
   DATABASE_URL=file:/app/data/dev.db
   ADMIN_EMAIL=you@yourdomain.com
   ADMIN_PASSWORD=a-real-password
   SESSION_SECRET=a-long-random-string
   PORT=3000
   ```
3. Under **Mounts/Volumes**, add persistent volumes for these container paths
   (Dokploy provisions the backing storage):
   - `/app/data` (the SQLite DB)
   - `/app/uploads` (template attachments)
   - `/app/.wwebjs_auth` (linked WhatsApp sessions — losing this means
     re-scanning every QR code)
   - `/app/.wwebjs_cache`
4. Set the exposed port to `3000` and attach your domain (Dokploy handles the
   Traefik + Let's Encrypt HTTPS for you).
5. Deploy. The container runs `prisma migrate deploy` automatically on
   startup (see `docker-entrypoint.sh`) before starting the server, so the
   first boot creates the schema.
6. Once it's live at your domain, log in and go to **Devices → Add device**
   to scan the QR code for real — this only works on a host with normal
   outbound internet access to `web.whatsapp.com`.

If you'd rather deploy via Dokploy's **Docker Compose** application type
instead, point it at `docker-compose.yml` — it defines the same four
volumes as named volumes, and reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` /
`SESSION_SECRET` / `DEVICE_LIMIT` from the environment Dokploy injects.

### Environment variables

| Variable          | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `DATABASE_URL`     | SQLite file path for Prisma (default `file:./dev.db`) |
| `ADMIN_EMAIL`      | Login email for the single admin account             |
| `ADMIN_PASSWORD`   | Login password (plaintext env var — fine for a self-hosted single-operator tool; see `ADMIN_PASSWORD_HASH` below for a hashed alternative) |
| `ADMIN_PASSWORD_HASH` | Optional bcrypt hash to use instead of `ADMIN_PASSWORD` |
| `SESSION_SECRET`   | Secret used to sign the session JWT                   |
| `PORT` / `HOSTNAME`| Server bind address (default `0.0.0.0:3000`)          |
| `DEVICE_LIMIT`     | Max number of WhatsApp devices (default `5`)          |
| `CHROME_PATH`      | Optional path to a system Chrome/Chromium binary for whatsapp-web.js to launch, instead of the one Puppeteer downloads |

## Disclaimer

WhatsApp does not officially support bulk or automated messaging through
WhatsApp Web, and accounts that send unsolicited or high-volume messages risk
being restricted or banned. Only message contacts who have consented to
receive messages, keep delays realistic, and use this software at your own
risk.
