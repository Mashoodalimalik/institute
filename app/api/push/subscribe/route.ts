import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const body = await req.json().catch(() => null);
  const subscription = body?.subscription;
  let endpoint: URL;
  try { endpoint = new URL(subscription?.endpoint); }
  catch { return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 }); }
  // Prevent a stored subscription from becoming an arbitrary server fetch target.
  const validHost = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(endpoint.hostname)
    || endpoint.hostname.endsWith('.notify.windows.com');
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || !validHost || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
    return NextResponse.json({ error: 'Invalid push provider or keys' }, { status: 400 });
  }
  const { error } = await createServiceClient().from('profiles').update({ web_push_sub: subscription }).eq('id', auth.profile.id);
  return NextResponse.json(error ? { error: 'Could not save subscription' } : { success: true }, { status: error ? 500 : 200 });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { error } = await createServiceClient().from('profiles').update({ web_push_sub: null }).eq('id', auth.profile.id);
  return NextResponse.json(error ? { error: 'Could not remove subscription' } : { success: true }, { status: error ? 500 : 200 });
}
