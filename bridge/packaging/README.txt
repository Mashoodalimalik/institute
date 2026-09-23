OKASHA BRIDGE 0.1.0 — WINDOWS x64

Run OkashaBridge.exe (or install using OkashaBridgeSetup-0.1.0.exe).
The tray launcher starts the hardware and WhatsApp adapters. Closing its window keeps them running. Exit from the tray stops both.

Open the institute web app, then Settings. Link WhatsApp by QR, enter the real K40 IP address, save and test it.
The institute web app/local backend must also be running. The bridge does not host the school database or schedule notifications.

Ports: hardware 14318, WhatsApp 14320. Both bind to 127.0.0.1.
This build accepts requests from any browser domain, with a local bearer token required for operations. INSTITUTE_ALLOWED_ORIGINS can later restrict origins.
The token is generated on this computer under %LOCALAPPDATA%\OkashaInstitute\Bridge\bridge.token. No token or WhatsApp credentials are included in this package.
Saved WhatsApp credentials remain under %LOCALAPPDATA%\OkashaInstitute\WhatsApp and use Windows DPAPI. Uninstall retains data. Gymatic's installation and accounts are independent.

No physical K40 was available for this build's testing. The installer is an unsigned local build.
