import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import ReceiptDocument from '@/components/ReceiptDocument';
import { serverStore } from '@/lib/services/server-store';
import { requireUser } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { Receipt } from '@/lib/types';
import React from 'react';

export const runtime = 'nodejs';

async function render(receipt: Receipt) {
  const student = await serverStore.getStudentById(receipt.student_id);
  if (!student) throw new Error('Student not found');
  const settings = await serverStore.getFeeSettings();
  const pdf = await renderToBuffer(React.createElement(ReceiptDocument, { receipt, student, instituteName: settings.institute_name }) as any);
  return new NextResponse(new Uint8Array(pdf), { headers: {
    'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="receipt-${receipt.receipt_number}.pdf"`,
    'X-Receipt-Number': receipt.receipt_number, 'X-Receipt-Id': receipt.id, 'X-Ledger-Id': receipt.ledger_id || '',
  } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  const body = await req.json().catch(() => null);
  const { student_id, amount, discount = 0, payment_method, notes, request_id } = body || {};
  if (!student_id || !Number.isFinite(amount) || amount <= 0 || amount > 99999999 || !Number.isFinite(discount) || discount < 0 || discount >= amount ||
      !['Cash', 'Bank Transfer', 'Online'].includes(payment_method) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id || '')) {
    return NextResponse.json({ error: 'Invalid payment. Provide a positive amount, a smaller nonnegative discount, payment method and request_id UUID.' }, { status: 400 });
  }
  const { data: receipt, error } = await createServiceClient().rpc('collect_fee', {
    p_student: student_id, p_amount: amount, p_discount: discount, p_method: payment_method,
    p_notes: notes || null, p_request: request_id, p_actor: auth.profile.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try { return await render(receipt); }
  catch (error) { console.error('Receipt PDF render failed:', error); return NextResponse.json({ error: 'Payment saved, but PDF generation failed. Retry with the same request_id or download the receipt from Fee History.', receipt_id: receipt.id }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Receipt ID required' }, { status: 400 });
  // Session client applies student/parent/staff RLS before service-role rendering.
  const { data: receipt, error } = await auth.supabase.from('receipts').select('*').eq('id', id).single();
  if (error || !receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  try { return await render(receipt); }
  catch { return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 }); }
}
