'use client';

/**
 * CLIENT-SIDE ON-DEVICE BRIDGE COMMUNICATOR
 * 
 * Enables the webapp (whether running on localhost or hosted in the cloud on Vercel)
 * to communicate directly with the local Okasha Bridge daemon / local backend
 * running on the user's laptop (http://127.0.0.1:14310 or http://127.0.0.1:14320).
 * 
 * Works just like modern "Apps on Device" companion architectures (Ledger, Spotify, WebUSB),
 * bypassing cloud routing limits and providing instantaneous local execution.
 */

export interface BridgeCredentials {
  backendUrl: string;
  backendToken: string;
  bridgeWhatsAppUrl: string;
  bridgeHardwareUrl: string;
  bridgeToken: string;
}

export interface ClientWhatsAppSession {
  connection: string;
  account: { id: string; name?: string } | null;
  qr: string | null;
  qrExpiresAt: number | null;
  detail?: string | null;
  onDevice?: boolean;
}

export interface ClientBridgeStatus {
  hardware: { reachable: boolean; version?: string };
  whatsapp: { reachable: boolean };
  k40Configured: boolean;
  onDevice: boolean;
}

let cachedCredentials: BridgeCredentials | null = null;
let lastProbeResult: { available: boolean; timestamp: number } | null = null;

/**
 * Retrieve bridge authentication tokens from server endpoint (authorized staff/admin)
 */
export async function getBridgeCredentials(): Promise<BridgeCredentials> {
  if (cachedCredentials && cachedCredentials.backendToken) {
    return cachedCredentials;
  }

  try {
    const res = await fetch('/api/bridge/client-token', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      cachedCredentials = data;
      return data;
    }
  } catch (err) {
    console.warn('[ClientBridge] Could not fetch server bridge tokens:', err);
  }

  // Fallback defaults for local on-device bridge
  return {
    backendUrl: 'http://127.0.0.1:14310',
    backendToken: process.env.NEXT_PUBLIC_LOCAL_BACKEND_TOKEN || 'e71553fabd7d20fbfd13b11ccd2f22d5e29dad2559ea6bfd6a0afe7c6c4072d1',
    bridgeWhatsAppUrl: 'http://127.0.0.1:14320',
    bridgeHardwareUrl: 'http://127.0.0.1:14318',
    bridgeToken: process.env.NEXT_PUBLIC_LOCAL_BRIDGE_TOKEN || '6c27c9c7c16a8ef09325648bdb611b488d085f68abe584f4e846453ed985e0c9',
  };
}

/**
 * Probes whether the on-device bridge or local backend is running on this machine.
 * Short timeout so cloud users don't suffer delay.
 */
export async function checkOnDeviceBridge(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Use cached probe if recent (< 5 seconds)
  if (lastProbeResult && Date.now() - lastProbeResult.timestamp < 5000) {
    return lastProbeResult.available;
  }

  try {
    const creds = await getBridgeCredentials();
    const probeUrl = creds.backendUrl || 'http://127.0.0.1:14310';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(`${probeUrl}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const isOk = res.ok;
    lastProbeResult = { available: isOk, timestamp: Date.now() };
    return isOk;
  } catch {
    lastProbeResult = { available: false, timestamp: Date.now() };
    return false;
  }
}

/**
 * Get system health from on-device bridge or fallback to server route
 */
export async function fetchBridgeStatus(): Promise<ClientBridgeStatus> {
  const onDevice = await checkOnDeviceBridge();
  if (onDevice) {
    try {
      const creds = await getBridgeCredentials();
      const res = await fetch(`${creds.backendUrl}/v1/status`, {
        headers: {
          'Authorization': `Bearer ${creds.backendToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          hardware: { reachable: Boolean(data.hardware?.reachable), version: data.hardware?.version },
          whatsapp: { reachable: Boolean(data.whatsapp?.reachable) },
          k40Configured: Boolean(data.k40Configured),
          onDevice: true,
        };
      }
    } catch (e) {
      console.warn('[ClientBridge] On-device status failed, falling back:', e);
    }
  }

  // Fallback to server route (works in local dev / Docker)
  const res = await fetch('/api/bridge/status', { cache: 'no-store' });
  const data = await res.json();
  return { ...data, onDevice: false };
}

/**
 * Fetch WhatsApp session (with live QR / account status)
 */
export async function fetchWhatsAppSession(): Promise<ClientWhatsAppSession> {
  const onDevice = await checkOnDeviceBridge();
  if (onDevice) {
    try {
      const creds = await getBridgeCredentials();
      const res = await fetch(`${creds.backendUrl}/v1/whatsapp/session`, {
        headers: {
          'Authorization': `Bearer ${creds.backendToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        return { ...data, onDevice: true };
      }
    } catch (e) {
      console.warn('[ClientBridge] On-device whatsapp session failed:', e);
    }
  }

  // Fallback to server route
  const res = await fetch('/api/whatsapp/session', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'WhatsApp service unavailable');
  return { ...data, onDevice: false };
}

/**
 * Execute a WhatsApp lifecycle action (connect, disconnect, unlink)
 */
export async function executeWhatsAppAction(
  action: 'connect' | 'disconnect' | 'unlink' | 'refresh'
): Promise<ClientWhatsAppSession> {
  const onDevice = await checkOnDeviceBridge();
  if (onDevice) {
    const creds = await getBridgeCredentials();
    const steps = action === 'refresh' ? ['disconnect', 'connect'] : [action];

    for (const step of steps) {
      const res = await fetch(`${creds.backendUrl}/v1/commands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.backendToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          component: 'whatsapp',
          method: step,
          arguments: {},
          target: {},
          requestId: crypto.randomUUID(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to execute WhatsApp action on device');
      }
    }

    // Give socket 500ms then fetch session
    await new Promise(r => setTimeout(r, 600));
    return fetchWhatsAppSession();
  }

  // Fallback to server route
  for (const step of action === 'refresh' ? ['disconnect', 'connect'] : [action]) {
    const response = await fetch('/api/whatsapp/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: step, requestId: crypto.randomUUID() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update WhatsApp');
  }

  return fetchWhatsAppSession();
}

/**
 * Send WhatsApp message directly via on-device bridge or server route
 */
export async function sendWhatsAppMessageDirect(params: {
  phone: string;
  message: string;
}): Promise<{ success: boolean; sid?: string; onDevice?: boolean }> {
  const onDevice = await checkOnDeviceBridge();

  if (onDevice) {
    try {
      const creds = await getBridgeCredentials();
      const requestId = crypto.randomUUID();

      const res = await fetch(`${creds.backendUrl}/v1/whatsapp/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.backendToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: params.phone,
          message: params.message,
          requestId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Device bridge rejected message');

      // Poll command result if queued
      const deadline = Date.now() + 15000;
      let command = data;
      while (['queued', 'running'].includes(command.state) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 350));
        const checkRes = await fetch(`${creds.backendUrl}/v1/commands/${requestId}`, {
          headers: { 'Authorization': `Bearer ${creds.backendToken}` },
        });
        if (checkRes.ok) {
          command = await checkRes.json();
        }
      }

      if (command.state === 'failed') {
        throw new Error(command.error?.message || 'Device bridge failed to send message');
      }

      return { success: true, sid: requestId, onDevice: true };
    } catch (e: any) {
      console.warn('[ClientBridge] Direct on-device send failed, trying server route:', e);
    }
  }

  // Try server route
  const res = await fetch('/api/notifications/send-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: params.phone,
      custom_message: params.message,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to dispatch WhatsApp message');
  }

  return { success: true, sid: data.sid, onDevice: false };
}
