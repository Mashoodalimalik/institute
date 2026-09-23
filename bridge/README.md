# Okasha Bridge

One Windows tray application bundles the raw K40/pyzk adapter (port 14318) and WhatsApp/Baileys adapter (port 14320). It accepts a command, executes it and returns the result. Institute data, attendance processing, message rules, device configuration and the command journal belong to the separate local backend.

The hardware protocol implementation and WhatsApp library adapter were copied from `D:\Iron Ledger\apps\hardware-api` and `whatsapp-bridge`. Only protocol-related modules are included. The Gymatic HTTP server, controller ownership, platform sync and databases are not included. The original project is unchanged. The internal Python package name is retained to preserve imports.

## Install and run

Run `output/bridge/OkashaBridgeSetup-0.1.0.exe`, then launch Okasha Bridge from Start. Alternatively, run `output/bridge/portable/OkashaBridge.exe` with the entire portable directory present. The installer is unsigned and requires 64-bit Windows 10 or later. Python and Node are bundled. No startup task is installed.

Start the backend with `npm run local:backend` and the web app separately. `npm run local:services` starts the backend and reuses or launches the combined bridge. Use Settings to link WhatsApp by QR, save K40 connection settings and test the physical device when available. The installer is also downloadable from Settings.

State lives under `%LOCALAPPDATA%\OkashaInstitute`: `Bridge` for the shared adapter token/logs, `WhatsApp` for the encrypted session and `Backend` for configuration/command receipts. Uninstall retains this state. Each Windows user gets independent state. No credentials or paired session are included in the installer.

Both adapters bind to loopback and require the local token for commands. Browser origins default to `*`; set `INSTITUTE_ALLOWED_ORIGINS` to comma-separated exact origins to restrict them later. The backend rejects direct browser-origin requests. An absent K40 remains unconfigured and no device commands run automatically.

## Rebuild

Prerequisites: Node 24, Python 3.13, PowerShell 7, .NET Framework C# compiler and NSIS 3 at its standard Windows install path.

```powershell
python -m venv .venv-bridge
.\.venv-bridge\Scripts\python.exe -m pip install -r bridge/hardware/requirements-dev.txt
npm ci
npm ci --prefix bridge/whatsapp --omit=dev --ignore-scripts --workspaces=false
npm run build:bridge
```

The build creates the setup executable, portable directory, SHA256SUMS.txt and build-info.json under `output/bridge`, and places a setup copy in `public/downloads`. Packaging uses an explicit file selection; local environment files, tokens and databases are excluded. Library notices are bundled. The graduation-cap icon is generated from the local SVG by `build-branding.mjs`.

`npm run test:hardware` and `npm run test:whatsapp` exercise protocol boundaries and backend behavior without physical hardware or sending messages. Device enrollment, punches and communication settings require physical validation when the K40 arrives.
