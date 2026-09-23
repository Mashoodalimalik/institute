import { NextRequest, NextResponse } from 'next/server';
import { serverStore } from '@/lib/services/server-store';
import { createServiceClient } from '@/lib/supabase/server';
import { sendSMS, sendWhatsApp, sendWebPush, buildFeeReminderMessage } from '@/lib/services/notifications';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const results = { processed: 0, reminded: 0, notifications_sent: 0, errors: [] as string[] };
  try {
    const { error } = await createServiceClient().rpc('refresh_fee_status');
    if (error) throw error;
    const settings = await serverStore.getFeeSettings();
    const students = await serverStore.getStudentsNeedingReminders(settings);
    for (const student of students) {
      results.processed++;
      if (student.last_reminder_sent && Date.now() - Date.parse(student.last_reminder_sent) < settings.reminder_interval_days * 86400000) continue;
      const before = results.notifications_sent;
      const receipts = await serverStore.getReceiptsForStudent(student.id);
      const month = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 7);
      const paid = receipts.filter(r => new Date(Date.parse(r.created_at) + 5 * 3600000).toISOString().startsWith(month)).reduce((sum, r) => sum + Number(r.amount), 0);
      const amount = Math.max(0, (student.monthly_fee || 0) - paid);
      // Unpaid late charges are never booked as cash income by a reminder job.
      const message = buildFeeReminderMessage({ studentName: student.full_name, amount,
        instituteName: settings.institute_name, isOverdue: student.fee_status === 'overdue', dueDay: settings.universal_due_day });
      const record = (result: { success: boolean; error?: string }) => {
        if (result.success) results.notifications_sent++;
        else results.errors.push(`${student.id}: ${result.error || 'Notification failed'}`);
      };
      if (student.parent?.web_push_sub) record(await sendWebPush(student.parent.web_push_sub, {
        title: `Fee reminder — ${settings.institute_name}`, body: `PKR ${amount} remains due for ${student.full_name}.`, url: '/my-fees',
      }));
      for (const phone of Array.from(new Set([student.phone_number, student.parent?.phone_number].filter(Boolean) as string[]))) {
        if (settings.notify_sms) record(await sendSMS(phone, message));
        if (settings.notify_whatsapp) record(await sendWhatsApp(phone, message));
      }
      if (results.notifications_sent > before) {
        await serverStore.updateStudent(student.id, { last_reminder_sent: new Date().toISOString() });
        results.reminded++;
      }
    }
    return NextResponse.json({ success: results.errors.length === 0, results });
  } catch (error) { return NextResponse.json({ error: 'Fee reminder processing failed' }, { status: 500 }); }
}

// Vercel cron invokes GET, with the same required secret as manual POST.
export const GET = POST;
