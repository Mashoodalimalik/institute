import { requireUser } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsApp, buildReceiptMessage } from '@/lib/services/notifications';
import { serverStore as demoStore } from '@/lib/services/server-store';

export const runtime = 'nodejs';

/**
 * POST /api/notifications/send-whatsapp
 * Send a WhatsApp notification (receipt, reminder, or custom) to a phone number.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  try {
    const { student_id, receipt_id, custom_message, phone } = await req.json();

    let message = custom_message || '';
    let recipientPhone = phone;

    // If receipt_id provided → auto-build receipt notification
    if (receipt_id && student_id) {
      const student = await demoStore.getStudentById(student_id);
      if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

      const receipts = await demoStore.getReceiptsForStudent(student_id);
      const receipt = receipts.find(r => r.id === receipt_id);
      if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

      const settings = await demoStore.getFeeSettings();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      message = buildReceiptMessage({
        studentName: student.full_name,
        receiptNumber: receipt.receipt_number,
        amount: receipt.amount - receipt.discount,
        pdfUrl: receipt.pdf_url || `${appUrl}/api/receipts/pdf?id=${receipt.id}`,
        instituteName: settings.institute_name,
      });

      // Use parent phone if available
      recipientPhone = phone || student.parent?.phone_number || student.phone_number;
    }

    if (!recipientPhone || !message) {
      return NextResponse.json({ error: 'phone and message are required' }, { status: 400 });
    }

    const result = await sendWhatsApp(recipientPhone, message);
    return NextResponse.json({ success: result.success, sid: result.sid, error: result.error }, { status: result.success ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
