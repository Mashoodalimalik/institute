import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backendUrl = process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:14310';
const backendToken = process.env.LOCAL_BACKEND_TOKEN;

if (!url || !serviceKey || !backendToken) {
  console.error('Missing configuration in .env.local');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function sendBackendWhatsApp(phone, message, self = false) {
  const res = await fetch(`${backendUrl}/v1/whatsapp/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${backendToken}`,
    },
    body: JSON.stringify({
      phone,
      message,
      self,
      requestId: randomUUID(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function waitForCommand(requestId) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const res = await fetch(`${backendUrl}/v1/commands/${requestId}`, {
      headers: { Authorization: `Bearer ${backendToken}` },
    });
    const cmd = await res.json();
    if (cmd.state === 'succeeded') return cmd;
    if (cmd.state === 'failed' || cmd.state === 'uncertain') {
      throw new Error(cmd.error?.message || `Command ${cmd.state}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('Command timed out waiting for dispatch');
}

async function run() {
  console.log('1. Looking up student: MASHOOD ALI MALIK...');
  let { data: student, error: studentError } = await db
    .from('profiles')
    .select('*, parent:parent_id(*)')
    .eq('role', 'student')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (studentError || !student) {
    console.error('Student profile lookup failed:', studentError?.message);
    process.exit(1);
  }

  console.log(`Found student: ${student.full_name} (ID: ${student.id})`);
  console.log(`Parent: ${student.parent?.full_name || 'None'} (Phone: ${student.parent?.phone_number || 'None'})`);

  const now = new Date();
  const timestamp = now.toISOString();
  const sourceId = `sim-${Date.now()}`;

  console.log('\n2. Recording fake attendance punch in Supabase...');
  const { data: punchResult, error: punchError } = await db.rpc('record_device_punch', {
    p_student: student.id,
    p_timestamp: timestamp,
    p_device: 'k40-simulated',
    p_source: sourceId,
  });

  if (punchError) {
    console.error('Failed to record punch:', punchError.message);
    process.exit(1);
  }

  const record = punchResult.record || punchResult;
  const punchType = record.type;
  console.log(`✅ Punch recorded successfully! Type: ${punchType.toUpperCase()} at ${record.timestamp}`);

  // Format the attendance message (Pakistan time)
  const timeFormatted = now.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Karachi',
  });
  const dateFormatted = now.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });

  const action = punchType === 'check_in' ? '✅ Checked IN' : '🚪 Checked OUT';
  const alertText = `${action} — *Okasha Institute*\n\nStudent: *${student.full_name}*\nStatus: ${punchType === 'check_in' ? 'Arrived at' : 'Left'} the institute\nTime: *${timeFormatted}* (${dateFormatted})\nDevice: *K40 Biometric Scanner*`;

  console.log('\n3. Attendance message formatted:');
  console.log('-------------------------------------------');
  console.log(alertText);
  console.log('-------------------------------------------');

  const parentPhone = student.parent?.phone_number || '+923002774956';

  console.log(`\n4. Sending WhatsApp alert to parent (${parentPhone})...`);
  try {
    const parentCmd = await sendBackendWhatsApp(parentPhone, alertText, false);
    console.log(`Command queued (ID: ${parentCmd.requestId}). Waiting for bridge delivery...`);
    const parentDelivered = await waitForCommand(parentCmd.requestId);
    console.log(`✅ WhatsApp alert delivered to ${parentPhone}! Result:`, parentDelivered.result);
  } catch (err) {
    console.error(`⚠️ Delivery to ${parentPhone}:`, err.message);
  }

  console.log('\n5. Also sending to connected WhatsApp number (Self Chat) so you can view it directly...');
  try {
    const selfCmd = await sendBackendWhatsApp(null, alertText, true);
    console.log(`Command queued (ID: ${selfCmd.requestId}). Waiting for bridge delivery...`);
    const selfDelivered = await waitForCommand(selfCmd.requestId);
    console.log(`✅ WhatsApp alert delivered to your linked WhatsApp! Result:`, selfDelivered.result);
  } catch (err) {
    console.error('⚠️ Delivery to self:', err.message);
  }

  console.log('\nAttendance simulation completed successfully!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
