# Okasha Institute

See [WORK_COMPLETED.md](WORK_COMPLETED.md) for the completed changes, verification results and remaining work.

Next.js 15, React 19 and Supabase institute management, with a separate local backend and combined K40/WhatsApp bridge. The backend requires Node.js 24+. The Windows bridge includes its own Python and Node runtimes.

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

## Local backend and raw bridge

The application uses **Next.js → local backend (`127.0.0.1:14310`) → Okasha Bridge → K40/WhatsApp**. One tray launcher owns the hardware adapter on port 14318 and WhatsApp adapter on 14320. Next.js never sends commands directly to the bridge. See [local/README.md](local/README.md) for endpoints and ownership of each layer.

The backend exposes the same library function catalogs as the bridge. It owns device configuration, account targeting, number normalization, the persistent command queue/results, reconnect preferences and enrollment verification. The bridge validates a raw command, calls the library, and returns its result. It retains only the protocol session needed by Baileys; it has no institute database, tenant ownership, controller leases, attendance polling or notification rules.

All services bind only to loopback. The backend rejects browser origins; the bridge accepts all origins for this build but still requires its bearer token. Set `INSTITUTE_ALLOWED_ORIGINS` to comma-separated origins when a restriction is needed. The browser uses authenticated Next.js routes and never receives local service tokens. The original Gymatic services on ports 4318/4320 remain independent.

**The K40 is not present, so its IP remains empty.** In **Settings → K40 & Local Bridge**, save its real IP, device ID, port and communication key when available, then test the saved connection. Defaults are device ID `k40-main`, port 4370 and key 0. Existing environment values provide initial defaults; saved backend preferences take priority. No physical device commands have been tested. Assign numeric device user IDs and save actual RFID card numbers rather than generated tags.

## Link WhatsApp

Run `npm run local:services` alongside Next.js on this Windows computer. It starts the installed bridge (or the built portable copy) and the local backend. This project contains its own adapted hardware and Baileys source under `bridge/`; no Gymatic installation is required. The launcher stores its generated token in `%LOCALAPPDATA%/OkashaInstitute/Bridge/bridge.token`; the backend reads that file, with `LOCAL_BRIDGE_TOKEN` as a development fallback. `LOCAL_BACKEND_TOKEN` remains a separate secret in `.env.local`.

In **Settings → WhatsApp**, click **Link WhatsApp**. On the institute phone, open **WhatsApp → Linked devices → Link a device** and scan the QR. The panel refreshes QR codes and connection status automatically. Only an approved administrator can view QR codes or change the session.

Credentials are stored separately in `%LOCALAPPDATA%/OkashaInstitute/WhatsApp`, encrypted by the adapter with a Windows DPAPI-protected key. The backend restores paired sessions after restart; its command journal and preferences live in `%LOCALAPPDATA%/OkashaInstitute/Backend`. **Disconnect** keeps credentials and stops automatic reconnection; **Reconnect WhatsApp** resumes it. **Unlink account** clears this institute session and logs out remotely when connected. When offline, also remove the linked device from the phone. Start local services again after reboot; no Windows startup task is installed.

Notifications target the currently connected account explicitly. `BRIDGE_WHATSAPP_ACCOUNT_ID` is an optional account pin; leave it empty to use the account linked through Settings. Pairing does not enable notifications or send a test message. Enable the desired notification channel separately.

`/api/bridge/status` checks the local backend. `/api/zkt/enroll` queues `enroll_user` through it; device user slots must already exist. The backend checks both the library's enrollment result and template readback. Failed, cancelled and uncertain commands are never reported as completed enrollment. Card enrollment is performed on the K40; save the observed card number in the student's profile.

The Next server must run on the bridge PC for server-side enrollment and WhatsApp. A cloud deployment cannot reach this PC through its own `127.0.0.1`; those operations need a browser/local controller in a cloud deployment. This checkout does not create a public tunnel.

## Attendance ingestion

After configuring the real K40, run `npm run bridge:forward` on the backend PC. This backend-side worker queues `get_attendance` through the local backend, interprets device wall times as Pakistan time, forwards them in timestamp order and retries failed database handoffs without clearing device logs. `NEXT_PUBLIC_APP_URL` may be a local app or an HTTPS cloud receiver. The worker stays stopped while the device IP/ID are empty.

`POST /api/attendance/push` accepts a normalized record from a local forwarder, **not raw ZKTeco ADMS protocol**:

```json
{
  "user_id": "101",
  "timestamp": "2026-09-23T09:00:00+05:00",
  "device_id": "k40-main",
  "source_event_id": "stable-bridge-event-id",
  "secret": "DEVICE_WEBHOOK_SECRET value"
}
```

Retries are deduplicated in PostgreSQL. Check-in/out alternation is per Pakistan calendar day and is recalculated for recovered records arriving out of order. Historical punches older than five minutes do not send fresh arrival alerts. Physical device behavior still requires validation when the K40 is available.

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
