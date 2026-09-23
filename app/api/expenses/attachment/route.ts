import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
export async function GET(req: NextRequest) {
  const auth = await requireUser(['super_admin']);
  if (auth.response) return auth.response;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Expense ID required' }, { status: 400 });
  const { data } = await auth.supabase.from('ledger').select('receipt_url').eq('id', id).single();
  if (!data?.receipt_url) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  const result = await auth.supabase.storage.from('expense-receipts').createSignedUrl(data.receipt_url, 60);
  if (result.error) return NextResponse.json({ error: 'Attachment unavailable' }, { status: 404 });
  return NextResponse.redirect(result.data.signedUrl);
}
