# Web-controlled bridge architecture

Updated 2 October 2026. This supersedes the local-backend architecture in the September completion notes.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Supabase | Authentication, institute data, device settings, command state and controller heartbeat |
| Next.js on Vercel | Permissions, command creation, phone normalization, attendance processing, notifications and UI |
| Web app on the operating laptop | Claims work, invokes the local adapters, reports results and requests attendance reads while signed in |
| Windows bridge | Authenticated raw pyzk/Baileys commands, protocol sessions and results; no institute rules or database access |

Vercel cannot reach the laptop by calling its own localhost. The browser on the laptop calls the bridge directly on ports 14318 and 14320. No port 14310 service, public tunnel or local web server is needed for the deployed app.

## Connection

Install Bridge 0.2.0, open the deployed site as an approved administrator and paste the tray menu's pairing key into Settings. Allow the site's local network permission. Keep this browser and the tray application running during operating hours. Browser closure or logout stops new work. Device/session commands expire after ten minutes, ordinary messages after 24 hours and arrival alerts after five minutes. No promise of unattended execution is made when the browser is closed or suspended by the OS.

The bridge accepts all origins by default as requested, but requires its randomly generated local key. The key stays in the paired browser's local storage. Vercel and Supabase never receive it. Version 0.2.0 rotates previously exposed keys once; the WhatsApp session is retained. Do not place bridge keys in `NEXT_PUBLIC_*` variables. Current Chrome may require [Local Network Access permission](https://developer.chrome.com/blog/local-network-access) for browser-to-loopback requests.

One controller lease is active at a time. The database serializes claims and a second browser cannot take an active lease. Lease expiry permits another operating browser to take over, but does not cause previously dispatched commands to execute again.

## Commands and failures

1. An authenticated Next.js route validates a requested workflow and stores its concrete command in Supabase.
2. The operating browser claims it atomically. State changes to `running` before local dispatch.
3. The browser invokes the raw adapter, including the concrete device or account target.
4. The browser reports `succeeded`, `failed` or `uncertain`. Reports may be retried; executions are not retried automatically.
5. If the browser vanishes after dispatch, an expired running command becomes uncertain when claiming resumes. Users can inspect command history before deciding whether to retry manually.

Request IDs deduplicate submissions. Transport failures never trigger a fallback send through another route. Queued and uncertain outcomes are never displayed as delivered. Account changes prevent queued WhatsApp commands from being sent by a different account. Device commands capture settings at submission time.

Hardware and WhatsApp commands have separate serial queues. Fingerprint enrollment is successful only when the adapter confirms template readback. QR data is shown only through the administrator session route while valid, and is excluded from the durable command result.

## Attendance and notifications

While configured and connected, the web controller schedules attendance reads approximately every 30 seconds. Next.js processes saved results in batches of 20, applies Pakistan time, resolves students and deduplicates device events. It does not clear the K40's logs. Stable attendance notification IDs prevent duplicate WhatsApp sends when a batch is replayed.

The Vercel reminder job queues messages in Supabase. The operating browser dispatches them when open. Cron responses distinguish queued notifications from completed sends. Automatic payment receipt delivery remains outside this change; the manual message/receipt actions use the same queue.

## Deployment and validation

- Apply migration `20261002000100_cloud_bridge_commands.sql` after the previous four migrations.
- Deploy the updated source and configure Supabase service credentials and application notification settings on Vercel.
- Remove obsolete local-backend/public bridge token variables from Vercel. They are not used by the new application.
- Install the rebuilt 0.2.0 bridge and pair the operating browser. The bridge has no Supabase credentials.
- Optionally set `NEXT_PUBLIC_BRIDGE_DOWNLOAD_URL` to the hosted installer location; the generated EXE is excluded from Git.

Run `npm run test:cloud-bridge`, `npm run test:cloud-integration`, `npm run test:hardware` and `npm run build`. The cloud integration suite uses disposable accounts/commands in the institute development project and refuses to run while an operating controller is active. It makes no physical device calls and sends no messages.

Physical K40 behavior still needs validation when the device is available. Browser/OS suspension can delay processing. Legacy scripts under `local/` remain for reference and compatibility, but the deployed app does not invoke them.
