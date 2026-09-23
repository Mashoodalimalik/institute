/**
 * NOTIFICATION SERVICE
 * Supports SMS (Twilio), WhatsApp (local backend/Baileys), and Web Push.
 */

import webpush from 'web-push';
import { sendBridgeWhatsApp } from '@/lib/bridge';

interface NotificationPayload {
  to: string;
  message: string;
  channel: 'sms' | 'whatsapp';
}

interface NotificationResult {
  success: boolean;
  sid?: string;
  error?: string;
  demo?: boolean;
}

// Configure Web Push VAPID keys
const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:mrzeeshan6009@gmail.com';

if (publicVapidKey && privateVapidKey) {
  try {
    webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
  } catch (e) {
    console.warn('VAPID setup warning:', e);
  }
}

export async function sendWebPush(
  subscription: any,
  payload: { title: string; body: string; url?: string; icon?: string }
): Promise<NotificationResult> {
  if (!subscription || !subscription.endpoint) {
    console.warn('[WebPush] No valid subscription provided.');
    return { success: false, error: 'No valid subscription endpoint' };
  }

  try {
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      data: { url: payload.url || '/' },
    });

    await webpush.sendNotification(subscription, pushPayload);
    console.log('[WebPush Success] Sent notification to subscription');
    return { success: true };
  } catch (error: any) {
    console.error('[WebPush Error]', error);
    return { success: false, error: error.message || String(error) };
  }
}

export async function sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

  const isDemoMode = !accountSid || !authToken || accountSid.includes('your_twilio');

  if (isDemoMode) {
    console.log(`[DEMO NOTIFICATION] ${payload.channel.toUpperCase()} → ${payload.to}`);
    console.log(`  Message: ${payload.message}`);
    return { success: false, error: 'SMS provider is not configured' };
  }

  try {
    const from = payload.channel === 'whatsapp' ? fromWhatsApp : fromPhone!;
    const to = payload.channel === 'whatsapp' ? `whatsapp:${payload.to}` : payload.to;

    const body = new URLSearchParams({
      From: from,
      To: to,
      Body: payload.message,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    const data = await response.json();
    if (response.ok) {
      return { success: true, sid: data.sid };
    } else {
      console.error('[Twilio Error]', data);
      return { success: false, error: data.message };
    }
  } catch (error) {
    console.error('[Notification Error]', error);
    return { success: false, error: String(error) };
  }
}

export async function sendSMS(to: string, message: string): Promise<NotificationResult> {
  return sendNotification({ to, message, channel: 'sms' });
}

export async function sendWhatsApp(to: string, message: string): Promise<NotificationResult> {
  try { return await sendBridgeWhatsApp(to, message); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'WhatsApp bridge unavailable' }; }
}

export function buildFeeReminderMessage(params: {
  studentName: string;
  amount: number;
  instituteName: string;
  isOverdue: boolean;
  dueDay: number;
}): string {
  const { studentName, amount, instituteName, isOverdue, dueDay } = params;
  const pkr = amount.toLocaleString('en-PK');
  if (isOverdue) {
    return `⚠️ *${instituteName}* — Fee OVERDUE\nDear Parent, the monthly fee of PKR ${pkr} for *${studentName}* is overdue. Please pay immediately to avoid additional charges.\n📞 Contact: admin@okasha.edu.pk`;
  }
  return `📚 *${instituteName}* — Fee Reminder\nDear Parent, the monthly fee of PKR ${pkr} for *${studentName}* is due by the ${dueDay}th. Please pay on time to avoid late charges.\n📞 Contact: admin@okasha.edu.pk`;
}

export function buildAttendanceAlertMessage(params: {
  studentName: string;
  type: 'check_in' | 'check_out';
  timestamp: string;
  instituteName: string;
}): string {
  const { studentName, type, timestamp, instituteName } = params;
  const time = new Date(timestamp).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
  const action = type === 'check_in' ? '✅ Checked IN' : '🚪 Checked OUT';
  return `${action} — *${instituteName}*\n${studentName} has ${type === 'check_in' ? 'arrived at' : 'left'} the institute at ${time}.`;
}

export function buildReceiptMessage(params: {
  studentName: string;
  receiptNumber: string;
  amount: number;
  pdfUrl?: string;
  instituteName: string;
}): string {
  const { studentName, receiptNumber, amount, pdfUrl, instituteName } = params;
  const pkr = amount.toLocaleString('en-PK');
  let msg = `🧾 *${instituteName}* — Payment Received\nFee of PKR ${pkr} for *${studentName}* has been received.\nReceipt No: ${receiptNumber}`;
  if (pdfUrl) {
    msg += `\n📄 Download Receipt: ${pdfUrl}`;
  }
  return msg;
}
