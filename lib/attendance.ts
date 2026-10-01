import 'server-only';
import { serverStore as demoStore } from '@/lib/services/server-store';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendWhatsApp,sendSMS,sendWebPush,buildAttendanceAlertMessage } from '@/lib/services/notifications';
import { BiometricPushPayload } from '@/lib/types';
export async function processAttendance(body:BiometricPushPayload) {
 const {user_id,timestamp,device_id}=body;
    if (typeof user_id !== 'string' || !user_id || typeof timestamp !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > Date.now() + 300000) {
      return NextResponse.json({ error: 'Missing required fields: user_id, timestamp' }, { status: 400 });
    }

    // ── 2. Resolve student by biometric_id or rfid_tag ────────────
    const student = await demoStore.findStudentByBiometric(user_id);
    if (!student) {
      return NextResponse.json(
        { error: `No student found with biometric_id or rfid_tag matching: ${user_id}` },
        { status: 404 }
      );
    }

    // ── 3. Determine punch type (toggle check_in/check_out) ───────
    const { data: saved, error } = await createServiceClient().rpc('record_device_punch', {
      p_student: student.id, p_timestamp: timestamp, p_device: device_id || 'k40',
      p_source: body.source_event_id || null,
    });
    if (error) throw error;
    const record = saved.record;
    const punchType = record.type;

    // ── 5. Notify linked parent ───────────────────────────────────
    const notificationResults: Record<string, unknown> = {};

    // Recovered historical scans are stored without sending an arrival alert now.
    if (student.parent && Date.now() - Date.parse(timestamp) < 300000) {
      const settings = await demoStore.getFeeSettings();
      const message = buildAttendanceAlertMessage({
        studentName:  student.full_name,
        type:         punchType,
        timestamp:    record.timestamp,
        instituteName: settings.institute_name,
      });

      // 5a. Send Web Push Notification if subscribed
      if (!saved.duplicate && student.parent.web_push_sub) {
        const title = punchType === 'check_in' ? '✅ Student Checked IN' : '🚪 Student Checked OUT';
        notificationResults.web_push = await sendWebPush(student.parent.web_push_sub, {
          title: `${title} — ${settings.institute_name || 'The Prism Coaching Center'}`,
          body: `${student.full_name} has ${punchType === 'check_in' ? 'arrived at' : 'left'} the institute.`,
          url: '/parent-dashboard',
        });
      }

      // 5b. Send SMS / WhatsApp if phone available
      if (student.parent.phone_number) {
        if (!saved.duplicate && settings.notify_sms) {
          notificationResults.sms = await sendSMS(student.parent.phone_number, message);
        }
        if (settings.notify_whatsapp) {
          notificationResults.whatsapp = await sendWhatsApp(student.parent.phone_number, message, `attendance-${record.id}`);
        }
      }

      // Always log in demo mode
      if (!settings.notify_sms && !settings.notify_whatsapp && !student.parent.web_push_sub) {
        console.log(`[DEMO ATTENDANCE ALERT] ${punchType.toUpperCase()} → ${student.full_name}`);
        console.log(`  Parent: ${student.parent.full_name}`);
        console.log(`  Message: ${message}`);
        notificationResults.demo_logged = true;
      }
    }

    return NextResponse.json({
      success: true,
      duplicate: Boolean(saved.duplicate),
      record_id: record.id,
      data: {
        student_id:    student.id,
        student_name:  student.full_name,
        punch_type:    punchType,
        timestamp:     record.timestamp,
        record_id:     record.id,
        notifications: notificationResults,
      },
    });
}
