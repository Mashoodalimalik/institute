import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { whatsAppAction, whatsAppSession } from '@/lib/bridge';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private' };

export async function GET() {
  const auth = await requireUser(['super_admin']);
  if (auth.response) return auth.response;
  try { return NextResponse.json(await whatsAppSession(), { headers }); }
  catch { return NextResponse.json({ error: 'WhatsApp service is unavailable. Start the institute local services on this computer.' }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(['super_admin']);
  if (auth.response) return auth.response;
  // Cookie-authenticated lifecycle actions must come from this app.
  const origin = request.headers.get('origin');
  // Next may normalize nextUrl.hostname to localhost even when the browser uses 127.0.0.1.
  const requestOrigin = `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  if (!origin || origin !== requestOrigin) return NextResponse.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }); }
  if (!body || !['connect', 'disconnect', 'unlink'].includes(body.action) || !/^[a-zA-Z0-9_.-]{1,120}$/.test(body.requestId || '')) {
    return NextResponse.json({ error: 'A valid action and request ID are required' }, { status: 400, headers });
  }
  try { return NextResponse.json(await whatsAppAction(body.action, body.requestId), { headers }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp action failed' }, { status: 502, headers }); }
}
