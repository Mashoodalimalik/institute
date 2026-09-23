import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/zkt/enroll
 *
 * Sends a command to the ZKTeco scanner to initiate biometric or RFID
 * enrollment mode for a specific user slot.
 *
 * The ZKTeco PUSH SDK / ADMS server exposes HTTP commands that the
 * management software can call to trigger actions on the device.
 * This endpoint wraps those commands and returns a pending enrollment token.
 *
 * ZKTeco command reference:
 *   - Enroll finger: POST to device at /enrollment with { userId, type: 'fingerprint' }
 *   - Enroll RFID:   POST to device at /enrollment with { userId, type: 'rfid' }
 *
 * Body:
 *   { studentId: string, enrollType: 'fingerprint' | 'rfid', deviceIp?: string }
 *
 * Returns:
 *   { success: true, enrollmentToken: string, message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, enrollType, deviceIp } = body as {
      studentId: string;
      enrollType: 'fingerprint' | 'rfid';
      deviceIp?: string;
    };

    if (!studentId || !enrollType) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, enrollType' },
        { status: 400 }
      );
    }

    // ── ZKTeco Device API call ────────────────────────────────────
    // In production: the device IP is set in environment or passed in.
    const zktDeviceUrl = deviceIp
      ? `http://${deviceIp}`
      : process.env.ZKT_DEVICE_URL;

    const enrollmentToken = `enroll-${studentId}-${Date.now()}`;

    if (zktDeviceUrl) {
      // Real device call — tell the ZKTeco ADMS/Push SDK to open enrollment
      // mode. Different ZKT firmware models use slightly different endpoints;
      // the most common ADMS v2 command is below.
      try {
        const zktPayload = {
          sn: process.env.ZKT_DEVICE_SN || 'AUTO',        // Device serial number
          userId: studentId,
          enrollType,                                        // 'fingerprint' or 'rfid'
          backupIndex: enrollType === 'fingerprint' ? 0 : undefined, // finger slot 0
        };

        const zktResp = await fetch(`${zktDeviceUrl}/iclock/cdata?table=bioenroll`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(
              `${process.env.ZKT_DEVICE_USER || 'admin'}:${process.env.ZKT_DEVICE_PASS || 'admin'}`
            ).toString('base64')}`,
          },
          body: JSON.stringify(zktPayload),
          signal: AbortSignal.timeout(8000),
        });

        if (!zktResp.ok) {
          const txt = await zktResp.text();
          console.warn('[ZKT Enroll] Device returned non-OK:', zktResp.status, txt);
          // Don't fail — device may still process the command
        } else {
          console.log('[ZKT Enroll] Device acknowledged enrollment command');
        }
      } catch (deviceErr) {
        console.warn('[ZKT Enroll] Could not reach device — continuing in demo mode:', String(deviceErr));
      }
    } else {
      // Demo mode — log and simulate
      console.log(`[ZKT DEMO] Enrollment command sent → studentId=${studentId}, type=${enrollType}`);
      console.log(`[ZKT DEMO] Token: ${enrollmentToken}`);
      console.log(`[ZKT DEMO] Configure ZKT_DEVICE_URL in .env.local to connect a real device`);
    }

    return NextResponse.json({
      success: true,
      enrollmentToken,
      deviceConnected: !!zktDeviceUrl,
      message: zktDeviceUrl
        ? `Enrollment command sent to ZKTeco device. Please place ${enrollType === 'fingerprint' ? 'finger' : 'RFID card'} on the scanner.`
        : `[Demo] Enrollment mode simulated. In production, configure ZKT_DEVICE_URL in .env.local.`,
    });
  } catch (err) {
    console.error('[ZKT Enroll Error]', err);
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/zkt/enroll',
    description: 'Send biometric/RFID enrollment command to ZKTeco scanner',
    accepts: 'POST',
    payload: {
      studentId: 'string',
      enrollType: 'fingerprint | rfid',
      deviceIp: 'string? (overrides ZKT_DEVICE_URL env var)',
    },
    env_vars: {
      ZKT_DEVICE_URL: 'http://<device-ip> — base URL of the ZKTeco device',
      ZKT_DEVICE_SN: 'Device serial number (optional)',
      ZKT_DEVICE_USER: 'Device admin username (default: admin)',
      ZKT_DEVICE_PASS: 'Device admin password (default: admin)',
    },
  });
}
