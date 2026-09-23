import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { bridgeCommand, bridgeResult, hardwareConfiguration } from '@/lib/bridge';
import { serverStore } from '@/lib/services/server-store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  const device = await hardwareConfiguration().catch(()=>null);
  const deviceId = device?.id;
  if (!device?.configured) return NextResponse.json({ error: 'K40 is not configured. Save the student now and enroll when the device is available.' }, { status: 503 });
  try {
    const { studentId, enrollType, requestId } = await req.json();
    if (!studentId || !['fingerprint', 'rfid'].includes(enrollType) || !/^[a-zA-Z0-9_.-]{1,64}$/.test(requestId || '')) {
      return NextResponse.json({ error: 'studentId, enrollType and requestId are required' }, { status: 400 });
    }
    const student = await serverStore.getStudentById(studentId);
    if (!student || student.role !== 'student') return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    if (!/^\d{1,9}$/.test(student.biometric_id || '')) return NextResponse.json({ error: 'Save the numeric K40 user ID first' }, { status: 400 });
    if (enrollType === 'rfid') return NextResponse.json({ error: 'Enroll the card on the K40, then save its actual card number here. Remote card capture is not exposed by pyzk.' }, { status: 422 });
    // The user slot must already exist on the device; never overwrite an unknown slot.
    const id = `enroll-${student.id}-${requestId}`;
    const command = await bridgeCommand('hardware', 'enroll_user', { user_id: student.biometric_id, temp_id: 0 }, { deviceId }, id);
    return NextResponse.json({ success: command.state === 'succeeded', pending: ['queued','running'].includes(command.state), commandId: id, state: command.state,
      message: 'Enrollment requested. Follow the K40 prompts; completion must be confirmed by the bridge.' }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Enrollment failed' }, { status: 502 }); }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  const id = req.nextUrl.searchParams.get('commandId');
  if (!id?.startsWith('enroll-')) return NextResponse.json({ error: 'Enrollment command ID required' }, { status: 400 });
  try { return NextResponse.json(await bridgeResult('hardware', id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Bridge unavailable' }, { status: 502 }); }
}
