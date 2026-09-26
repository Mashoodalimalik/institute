import { requireUser } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/bridge/client-token
 * Returns bridge credentials and local endpoint URLs to authorized staff/super_admin.
 * This enables the webapp running in the user's browser to connect directly to the
 * on-device bridge (http://127.0.0.1:14310 / http://127.0.0.1:14320) like an on-device app feature.
 */
export async function GET() {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;

  return NextResponse.json({
    backendUrl: process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:14310',
    backendToken: process.env.LOCAL_BACKEND_TOKEN || '',
    bridgeWhatsAppUrl: process.env.LOCAL_BRIDGE_URL || 'http://127.0.0.1:14320',
    bridgeHardwareUrl: process.env.LOCAL_HARDWARE_BRIDGE_URL || 'http://127.0.0.1:14318',
    bridgeToken: process.env.LOCAL_BRIDGE_TOKEN || '',
  });
}
