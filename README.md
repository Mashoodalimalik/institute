# Okasha Institute

See [WORK_COMPLETED.md](WORK_COMPLETED.md) for the completed changes, verification results and remaining work.

Next.js 15, React 19 and Supabase institute management, with a Vercel/Supabase web backend and a combined K40/WhatsApp bridge. Development requires Node.js 24+. The Windows bridge includes its own Python and Node runtimes.

## Run locally

```powershell
npm ci
# Install output/bridge/OkashaBridgeSetup-0.1.0.exe first, or build it (see bridge/README.md).
npm run local:services
# In another terminal:
npm run dev
```

Open http://localhost:3000. The repository is linked to the separate Supabase project **Okasha Institute**, ref `hqvuajcnfylwxgdzypgd`, in Singapore. `.env.local` contains this project's keys and generated webhook/cron secrets and is excluded from Git. Initial administrator credentials for `mrzeeshan6009@gmail.com` are in `.admin-credentials.local.json`. No invitation email was sent.

For a new checkout, copy `.env.example` to `.env.local` and fill its values. Do not commit secrets. The UI's unconfigured demo mode is for browsing only; protected APIs require a real authenticated account and server configuration.

## Database

Apply versioned migrations; do not re-run the original `schema.sql` on a migrated database.

```powershell
npx supabase@2.75.0 link --project-ref hqvuajcnfylwxgdzypgd
npx supabase@2.75.0 db push
```

CLI 2.75.0 is used because 2.117.0 failed to read this machine's saved CLI profile. The generated database password is stored only in `.supabase-credentials.local.json`.

Admissions create student/parent records without requiring login accounts. Supabase signups create pending profiles. Only an approved administrator may assign roles or approve them. Admissions and login profiles are connected by `auth_user_id`; existing admission records must be linked deliberately by an administrator rather than trusting matching, unverified email addresses.

Browser queries use the logged-in session and RLS. Service credentials are restricted to authenticated server routes or secret-protected ingestion/cron routes. Database errors never fall back to demo student data in live mode.

Fee collection uses a database transaction and a request UUID. Retries using the same UUID return the original receipt without collecting twice. Partial payments keep the remaining fee unpaid. Status is calculated from current-month receipts. Receipts can be downloaded again using `/api/receipts/pdf?id=...` by authorized staff, the student, or their parent.

## Cloud web app and local bridge

The current architecture is **Supabase ↔ Next.js on Vercel ↔ operating laptop's browser ↔ raw bridge ↔ K40/WhatsApp**. Vercel never calls localhost. No separate local backend on port 14310 is required.

Supabase stores device settings, the command journal, controller heartbeat and short-lived WhatsApp status. Authenticated Next.js routes own validation, permissions, notifications and attendance processing. One administrator browser on the operating laptop claims queued commands and sends them to the raw adapters on `127.0.0.1:14318` (hardware) and `127.0.0.1:14320` (WhatsApp), then reports results. The adapters only execute commands and maintain required library sessions.

### Set up the operating laptop

1. Build or install **Okasha Bridge 0.2.0** and keep its tray application running.
2. Open the deployed web app in Chrome or Edge and sign in as an approved administrator.
3. From the bridge tray menu choose **Copy web app pairing key**. Paste it into **Settings → Connect this PC to the bridge** and click **Connect this PC**.
4. Allow local network access if the browser asks. The key stays in that browser; it is never sent to Vercel or Supabase.
5. Link WhatsApp using its QR panel. Save the actual K40 IP and communication settings when the device is available.
6. Keep this administrator session open during operating hours. The controller continues across application pages; closing the browser or signing out pauses new dispatches.

Bridge 0.2.0 rotates the previous local key once because older web builds contained fallback tokens. Existing WhatsApp credentials remain intact. Pair each trusted browser using the new key. There are no public bridge tokens or credential-download API routes.

Device/session commands expire after ten minutes; ordinary messages can wait up to 24 hours, while arrival alerts expire after five minutes. A command is claimed once before dispatch; a lost response becomes uncertain and is never automatically re-executed. **Settings → Recent bridge commands** distinguishes queued, running, succeeded, failed, cancelled and uncertain outcomes. A queued message is never described as delivered. Only one browser controller may be active at a time.

### K40 and attendance

The physical K40 is not available yet, so its IP remains empty. Defaults are device ID `k40-main`, port `4370` and communication key `0`. Device settings live in Supabase and each queued command captures its target connection, so changing settings cannot retarget queued work. The UI never reveals a saved communication key.

The web controller requests attendance reads about every 30 seconds when configured. Next.js processes returned records in batches, interprets device wall times as Pakistan time, deduplicates them in PostgreSQL and applies check-in/check-out alternation. It never clears device logs. Historical punches older than five minutes do not send fresh arrival alerts. Notification command IDs prevent duplicate attendance messages.

Fingerprint enrollment requires a numeric K40 user ID and an existing device user slot. Success must include template readback verification. Record cards on the K40 and save the actual card number in the student profile.

`/api/attendance/push` remains a secret-protected normalized event endpoint for compatibility. It is not an ADMS protocol server. The old `local/` backend and forwarder are retained as legacy development utilities; the cloud application does not use them.

### Deployment

Apply `20261002000100_cloud_bridge_commands.sql` along with the preceding migrations. Set the Supabase URL, public key, service-role key, app URL, webhook/cron secrets and optional push/SMS credentials on Vercel. Never set `NEXT_PUBLIC_LOCAL_BACKEND_TOKEN` or `NEXT_PUBLIC_LOCAL_BRIDGE_TOKEN`; remove old copies from the deployment settings. Local bridge tokens do not belong in Vercel.

The executable is a generated artifact, not tracked source. Set `NEXT_PUBLIC_BRIDGE_DOWNLOAD_URL` to a hosted installer URL when publishing the web app, or distribute the installer separately. See [bridge/README.md](bridge/README.md) for rebuilding and [CLOUD_ARCHITECTURE.md](CLOUD_ARCHITECTURE.md) for the command lifecycle.

## Notifications and cron

WhatsApp uses the bridge's `sendMessage` with an explicit account target. A missing/disconnected bridge is a delivery failure. SMS is optional through server-side Twilio configuration. Notifications are disabled in the fresh database until configured.

Run `node scripts/generate-vapid.js` once for fresh push credentials. Private keys are never bundled into browser code. The push-only service worker does not cache pages or API responses.

Vercel invokes `GET /api/cron/fee-reminders` at 04:00 UTC (09:00 Pakistan time); manual POST is also supported. Both require `Authorization: Bearer <CRON_SECRET>`. The job refreshes monthly fee status and respects reminder intervals. Uncollected late fees are not recorded as income; collect an actual payment to record income. Late-fee settings are retained for future billing policy work but are not automatically charged.

## Validation

```powershell
npm run build
npm run typecheck
npm run test:whatsapp
npm run test:hardware
npm run test:integration
npm audit --omit=dev
```

Live integration checks use disposable, explicitly identified records and must be pointed at this test/development project. They do not send WhatsApp, SMS, push or email messages, or operate the K40.
