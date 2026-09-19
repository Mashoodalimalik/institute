import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import ReceiptDocument from '@/components/ReceiptDocument';
import { demoStore, generateReceiptNumber, DEMO_STUDENTS } from '@/lib/services/store';
import { CollectFeePayload } from '@/lib/types';
import React from 'react';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const payload: CollectFeePayload = await req.json();
    const { student_id, amount, discount, payment_method, notes } = payload;

    // Resolve student
    const student = await demoStore.getStudentById(student_id);
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const netAmount = amount - (discount || 0);
    const receiptNumber = generateReceiptNumber();
    const today = new Date().toISOString().split('T')[0];

    // Insert ledger entry
    const ledgerEntry = await demoStore.insertLedgerEntry({
      student_id,
      amount: netAmount,
      transaction_type: 'income',
      category: 'Tuition Fee',
      notes: notes || `Monthly fee payment — Receipt #${receiptNumber}`,
      date: today,
    });

    // Create receipt record
    const receipt = await demoStore.insertReceipt({
      student_id,
      ledger_id: ledgerEntry.id,
      receipt_number: receiptNumber,
      amount,
      discount: discount || 0,
      payment_method,
    });

    // Update student fee status
    await demoStore.updateStudent(student_id, { fee_status: 'paid' });

    // Generate PDF buffer
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReceiptDocument, {
        receipt,
        student,
        instituteName: 'Okasha Institute',
      }) as any
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${receiptNumber}.pdf"`,
        'X-Receipt-Number': receiptNumber,
        'X-Receipt-Id': receipt.id,
        'X-Ledger-Id': ledgerEntry.id,
      },
    });
  } catch (err) {
    console.error('[PDF Route Error]', err);
    return NextResponse.json({ error: 'PDF generation failed', details: String(err) }, { status: 500 });
  }
}
