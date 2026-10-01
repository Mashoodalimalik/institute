import { processAttendance } from '@/lib/attendance';
import { NextRequest, NextResponse } from 'next/server';
import { serverStore as demoStore } from '@/lib/services/server-store';
import { BiometricPushPayload } from '@/lib/types';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWhatsApp, sendSMS, sendWebPush, buildAttendanceAlertMessage } from '@/lib/services/notifications';

export const runtime = 'nodejs';

/**
 * POST /api/attendance/push
 *
 * Accepts normalized attendance events from the application controller.
 */
export async function POST(req: NextRequest) {
  try {
    const body: BiometricPushPayload = await req.json();
    const { user_id, timestamp, device_id, secret } = body;

    // ── 1. Authenticate device secret ─────────────────────────────
    const expectedSecret = process.env.DEVICE_WEBHOOK_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized — invalid device secret' }, { status: 401 });
    }

    return processAttendance(body);
  } catch (err) {
    console.error('[Attendance Push Error]', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/attendance/push',
    description: 'Normalized K40 attendance receiver',
    accepts: 'POST',
    payload: { user_id: 'string', timestamp: 'ISO8601', device_id: 'string?', secret: 'string' },
  });
}
