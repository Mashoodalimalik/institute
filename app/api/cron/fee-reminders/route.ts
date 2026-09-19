import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/services/store';
import {
  sendSMS,
  sendWhatsApp,
  sendWebPush,
  buildFeeReminderMessage,
} from '@/lib/services/notifications';

export const runtime = 'nodejs';

/**
 * POST /api/cron/fee-reminders
 *
 * Scheduled daily cron job — marks overdue, applies late fees, dispatches SMS, WhatsApp, and Web Push notifications.
 */
export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const results: {
    processed: number;
    reminded: number;
    overdue_marked: number;
    late_fees_applied: number;
    notifications_sent: number;
    errors: string[];
  } = {
    processed: 0,
    reminded: 0,
    overdue_marked: 0,
    late_fees_applied: 0,
    notifications_sent: 0,
    errors: [],
  };

  try {
    const settings = await demoStore.getFeeSettings();
    const {
      universal_due_day,
      grace_period_days,
      late_fee_amount,
      late_fee_is_percent,
      notify_sms,
      notify_whatsapp,
      institute_name,
    } = settings;

    // Calculate due/overdue boundary for this month
    const dueDate = new Date(today.getFullYear(), today.getMonth(), universal_due_day);
    const overdueDate = new Date(dueDate);
    overdueDate.setDate(overdueDate.getDate() + grace_period_days);

    const students = await demoStore.getStudentsNeedingReminders(settings);
    results.processed = students.length;

    for (const student of students) {
      try {
        const isCurrentlyOverdue = today > overdueDate;
        const wasAlreadyOverdue = student.fee_status === 'overdue';

        // ── Mark overdue + apply late fee ─────────────────────────
        if (isCurrentlyOverdue && !wasAlreadyOverdue) {
          await demoStore.updateStudent(student.id, { fee_status: 'overdue' });
          results.overdue_marked++;

          if (late_fee_amount > 0) {
            const lateFee = late_fee_is_percent
              ? ((student.monthly_fee || 0) * late_fee_amount) / 100
              : late_fee_amount;

            await demoStore.insertLedgerEntry({
              student_id: student.id,
              amount: lateFee,
              transaction_type: 'income',
              category: 'Late Fee',
              notes: `Late fee applied for ${today.toLocaleString('en-PK', { month: 'long', year: 'numeric' })}`,
              date: today.toISOString().split('T')[0],
            });
            results.late_fees_applied++;
          }
        }

        // ── Web Push Notification ────────────────────────────────────
        if (student.parent && student.parent.web_push_sub) {
          const pushTitle = isCurrentlyOverdue || wasAlreadyOverdue
            ? `⚠️ Fee Overdue Alert — ${institute_name}`
            : `📚 Fee Reminder — ${institute_name}`;
          
          const pushBody = `Fee of PKR ${student.monthly_fee?.toLocaleString()} for ${student.full_name} is ${
            isCurrentlyOverdue ? 'OVERDUE' : 'due soon'
          }.`;

          const pushRes = await sendWebPush(student.parent.web_push_sub, {
            title: pushTitle,
            body: pushBody,
            url: '/dashboard',
          });

          if (pushRes.success) results.notifications_sent++;
        }

        // ── SMS / WhatsApp ──────────────────────────────────────────
        const message = buildFeeReminderMessage({
          studentName: student.full_name,
          amount: student.monthly_fee || 0,
          instituteName: institute_name,
          isOverdue: isCurrentlyOverdue || wasAlreadyOverdue,
          dueDay: universal_due_day,
        });

        const notificationTargets = [
          student.phone_number,
          student.parent?.phone_number,
        ].filter(Boolean) as string[];

        for (const phone of notificationTargets) {
          if (notify_sms) {
            const r = await sendSMS(phone, message);
            if (r.success) results.notifications_sent++;
            else results.errors.push(`SMS to ${phone}: ${r.error}`);
          }
          if (notify_whatsapp) {
            const r = await sendWhatsApp(phone, message);
            if (r.success) results.notifications_sent++;
            else results.errors.push(`WhatsApp to ${phone}: ${r.error}`);
          }
          if (!notify_sms && !notify_whatsapp && !student.parent?.web_push_sub) {
            console.log(`[CRON DEMO] Fee reminder → ${student.full_name} (${phone})`);
            results.notifications_sent++;
          }
        }

        // Update last_reminder_sent
        await demoStore.updateStudent(student.id, { last_reminder_sent: today.toISOString() });
        results.reminded++;
      } catch (studentErr) {
        results.errors.push(`Student ${student.id}: ${String(studentErr)}`);
      }
    }

    return NextResponse.json({
      success: true,
      run_at: today.toISOString(),
      results,
    });
  } catch (err) {
    console.error('[Cron Error]', err);
    return NextResponse.json({ error: 'Cron failed', details: String(err) }, { status: 500 });
  }
}

// Status check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/cron/fee-reminders',
    description: 'Daily fee reminder cron with Web Push',
    schedule: '0 9 * * * (09:00 daily)',
  });
}
