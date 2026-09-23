import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFile } from 'node:fs/promises';
import { withParents } from '../lib/services/profile-relations.mjs';

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://hqvuajcnfylwxgdzypgd.supabase.co') throw new Error('These integration tests are restricted to the new institute development project');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = process.env.TEST_APP_URL || 'http://localhost:3000';
const profiles = []; const users = []; const expenses = []; const files = []; let passed = 0;
const ok = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const check = (condition, name) => { assert.ok(condition, name); passed++; console.log(`PASS ${name}`); };
async function session(email, password) {
  const jar = new Map();
  const client = createServerClient(url, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(v => jar.set(v.name, v.value)) } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { client, cookie: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ') };
}
async function account(role, status) {
  const email = `integration-${randomUUID()}@example.com`; const password = randomBytes(24).toString('hex');
  const { user } = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }));
  users.push(user.id); profiles.push(user.id);
  if (role) ok(await db.from('profiles').update({ role, status }).eq('id', user.id));
  return { id: user.id, ...await session(email, password) };
}
async function api(path, { method = 'GET', body, auth } = {}) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { cookie: auth.cookie() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
try {
  const credentials = JSON.parse(await readFile('.admin-credentials.local.json', 'utf8'));
  const admin = await session(credentials.email, credentials.password);
  const pending = await account(null, 'pending');
  const staff = await account('staff', 'approved');
  const studentAccount = await account('student', 'approved');
  const parent = ok(await admin.client.from('profiles').insert({ full_name: 'Integration parent', role: 'parent', status: 'approved' }).select().single());
  profiles.push(parent.id);
  const student = ok(await staff.client.from('profiles').insert({ full_name: 'Integration K40 student', role: 'student', status: 'approved', monthly_fee: 5000, parent_id: parent.id, biometric_id: `test-${randomUUID()}` }).select().single());
  profiles.push(student.id);
  check(Boolean(student.id), 'admission without an auth account');
  const linked = await withParents(staff.client, [student]);
  check(linked[0].parent?.id === parent.id && !Array.isArray(linked[0].parent), 'guardian resolves by parent_id rather than inverse self-join');
  const own = ok(await pending.client.from('profiles').select('*').eq('id', pending.id).single());
  check(own.status === 'pending', 'pending user can read own profile');
  check(ok(await pending.client.from('profiles').select('id').eq('id', student.id)).length === 0, 'pending user cannot read another profile');
  check(Boolean((await staff.client.from('profiles').update({ role: 'super_admin' }).eq('id', staff.id)).error), 'staff cannot promote self');
  check(Boolean((await staff.client.from('profiles').insert({ full_name: 'Forbidden', role: 'super_admin', status: 'approved' })).error), 'staff cannot create administrator');
  check(ok(await studentAccount.client.from('profiles').select('id').eq('id', student.id)).length === 0, 'student cannot read another student');
  check((await withParents(studentAccount.client, [student]))[0].parent === null, 'guardian lookup preserves session RLS');
  for (const [path, method] of [['/api/admin/approve-user','POST'],['/api/admin/pending-count','GET'],['/api/receipts/pdf','POST'],['/api/notifications/send-whatsapp','POST'],['/api/zkt/enroll','POST'],['/api/push/subscribe','POST']]) {
    check((await api(path,{method,body:method==='POST'?{}:undefined})).status === 401, `anonymous blocked: ${path}`);
  }
  check((await api('/api/admin/approve-user',{method:'POST',auth:staff,body:{userId:pending.id,action:'approve',role:'super_admin'}})).status===403,'staff blocked by admin API');
  check((await api('/api/hardware/config')).status===401,'hardware settings require authentication');
  check((await api('/api/hardware/config',{auth:staff})).status===403,'hardware settings require administrator');
  const hardwareSettings=await api('/api/hardware/config',{auth:admin});
  const hardwareConfig=await hardwareSettings.json();
  check(hardwareSettings.ok && hardwareConfig.port===4370 && !hardwareConfig.configured && !Object.hasOwn(hardwareConfig,'commKey'),'absent K40 settings are available without revealing key');
  check((await api('/api/hardware/config',{method:'POST',auth:admin,body:{action:'save',config:hardwareConfig}})).status===403,'hardware settings reject writes without same-origin header');
  const bridgeStatus=await api('/api/bridge/status',{auth:admin});
  const bridgeHealth=await bridgeStatus.json();
  check(bridgeStatus.ok && bridgeHealth.hardware.reachable && bridgeHealth.whatsapp.reachable,'web backend reaches both packaged adapters');
  check((await api('/api/zkt/enroll',{method:'POST',auth:admin,body:{studentId:student.id,enrollType:'fingerprint',requestId:randomUUID()}})).status===503,'absent K40 returns unavailable');
  check((await api('/api/cron/fee-reminders')).status===401,'cron GET requires secret');
  check((await api('/api/attendance/push',{method:'POST',body:{}})).status===401,'attendance requires device secret');
  check((await api('/api/receipts/pdf',{method:'POST',auth:admin,body:{student_id:student.id,amount:50,discount:60,payment_method:'Cash',request_id:randomUUID()}})).status===400,'invalid discount rejected before payment');

  const request = randomUUID();
  const payment = { student_id:student.id, amount:2500,discount:0,payment_method:'Cash',request_id:request };
  const responses = await Promise.all([api('/api/receipts/pdf',{method:'POST',body:payment,auth:admin}),api('/api/receipts/pdf',{method:'POST',body:payment,auth:admin})]);
  for(const response of responses) { const bytes = Buffer.from(await response.arrayBuffer()); if(!response.ok) console.log('Payment error:', response.status, bytes.toString()); check(response.ok && bytes.subarray(0,4).toString()==='%PDF', 'payment response is a PDF'); }
  check(responses[0].headers.get('x-receipt-id')===responses[1].headers.get('x-receipt-id'),'concurrent payment retry returns same receipt');
  const receipts = ok(await db.from('receipts').select('*').eq('student_id',student.id));
  check(receipts.length===1,'one receipt for concurrent retries');
  check(ok(await db.from('ledger').select('id').eq('student_id',student.id)).length===1,'one ledger entry for concurrent retries');
  check(ok(await db.from('profiles').select('fee_status').eq('id',student.id).single()).fee_status!=='paid','partial fee stays unpaid');
  const second = await api('/api/receipts/pdf',{method:'POST',body:{...payment,request_id:randomUUID()},auth:admin});
  check(second.ok,'remaining payment succeeds'); await second.arrayBuffer();
  check(ok(await db.from('profiles').select('fee_status').eq('id',student.id).single()).fee_status==='paid','full monthly total marks paid');
  check((await api(`/api/receipts/pdf?id=${receipts[0].id}`,{auth:studentAccount})).status===404,'unrelated student cannot download receipt');
  check((await api(`/api/receipts/pdf?id=${receipts[0].id}`,{auth:admin})).status===200,'receipt can be downloaded again');
  const parentAccount = await account('parent','approved');
  ok(await db.from('profiles').update({auth_user_id:null}).eq('id',parentAccount.id));
  ok(await db.from('profiles').update({auth_user_id:parentAccount.id}).eq('id',parent.id));
  check((await api(`/api/receipts/pdf?id=${receipts[0].id}`,{auth:parentAccount})).status===200,'parent login linked to admission can download child receipt');
  check(ok(await parentAccount.client.from('profiles').select('id').eq('id',studentAccount.id)).length===0,'linked parent cannot read unrelated student');
  const attachment=`integration-${randomUUID()}/receipt.pdf`;
  ok(await admin.client.storage.from('expense-receipts').upload(attachment,Buffer.from('%PDF-1.4\n%%EOF'),{contentType:'application/pdf'}));
  files.push(attachment);
  const expense=ok(await admin.client.from('ledger').insert({amount:1,category:'Integration test',transaction_type:'expense',receipt_url:attachment,student_id:student.id}).select().single());
  expenses.push(expense.id);
  check((await api(`/api/expenses/attachment?id=${expense.id}`,{auth:admin})).status===200,'private expense receipt upload and download');
  check((await api(`/api/expenses/attachment?id=${expense.id}`,{auth:staff})).status===403,'staff blocked from private expense attachment');
  const deniedUpload=await staff.client.storage.from('expense-receipts').upload(`integration-${randomUUID()}/forbidden.pdf`,Buffer.from('%PDF'),{contentType:'application/pdf'});
  check(Boolean(deniedUpload.error),'storage RLS blocks staff upload');

  const punch = {p_student:student.id,p_timestamp:'2026-09-20T09:00:00+05:00',p_device:'integration-k40',p_source:randomUUID()};
  const duplicates = await Promise.all([db.rpc('record_device_punch',punch),db.rpc('record_device_punch',punch)]);
  check(duplicates.map(ok).filter(x=>x.duplicate).length===1,'concurrent duplicate attendance inserted once');
  ok(await db.rpc('record_device_punch',{...punch,p_timestamp:'2026-09-20T12:00:00+05:00',p_source:randomUUID()}));
  ok(await db.rpc('record_device_punch',{...punch,p_timestamp:'2026-09-20T10:00:00+05:00',p_source:randomUUID()}));
  const history=ok(await db.from('attendance').select('type').eq('student_id',student.id).order('timestamp'));
  check(history.map(x=>x.type).join(',')==='check_in,check_out,check_in','out-of-order recovery preserves alternation');
  const nextDay=ok(await db.rpc('record_device_punch',{...punch,p_timestamp:'2026-09-21T09:00:00+05:00',p_source:randomUUID()}));
  check(nextDay.record.type==='check_in','new Pakistan day starts with check-in');
  const valid = {user_id:student.biometric_id,timestamp:'2026-09-21T10:00:00+05:00',device_id:'integration-k40',source_event_id:randomUUID(),secret:process.env.DEVICE_WEBHOOK_SECRET};
  const first=await api('/api/attendance/push',{method:'POST',body:valid});
  const retry=await api('/api/attendance/push',{method:'POST',body:valid});
  check(first.ok && (await retry.json()).duplicate===true,'webhook resolves real student and deduplicates');
  const bridge = await api('/api/bridge/status',{auth:admin});
  const health = await bridge.json();
  check(bridge.ok && !health.k40Configured, 'bridge diagnostics preserve unconfigured K40');
  check((await api('/api/whatsapp/session')).status === 401, 'anonymous cannot view WhatsApp QR');
  check((await api('/api/whatsapp/session', { auth: staff })).status === 403, 'staff cannot view WhatsApp QR');
  check((await api('/api/whatsapp/session', { auth: admin, method: 'POST', body: {action:'connect',requestId:randomUUID()} })).status === 403, 'WhatsApp lifecycle rejects missing Origin');
  const whatsapp = await api('/api/whatsapp/session', { auth: admin });
  check(whatsapp.ok && whatsapp.headers.get('cache-control').includes('no-store'), 'admin can read uncached WhatsApp session');
  for (const appBase of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
    const invalidAction = await fetch(appBase + '/api/whatsapp/session', { method:'POST', headers:{cookie:admin.cookie(),Origin:appBase,'Content-Type':'application/json'},body:JSON.stringify({action:'sendMessage',requestId:randomUUID()}) });
    check(invalidAction.status === 400, `session API accepts matching origin but rejects message action: ${appBase}`);
    const crossOrigin = await fetch(appBase + '/api/whatsapp/session', { method:'POST', headers:{cookie:admin.cookie(),Origin:'https://unrelated.example','Content-Type':'application/json'},body:JSON.stringify({action:'connect',requestId:randomUUID()}) });
    check(crossOrigin.status === 403, `session API blocks cross-origin action: ${appBase}`);
  }
  console.log(`${passed} integration assertions passed. No notifications or device operations were performed.`);
} finally {
  // Only IDs created by this test are removed; real institute data is untouched.
  if(profiles.length) {
    ok(await db.from('ledger').delete().in('student_id',profiles));
    ok(await db.from('profiles').delete().in('id',profiles));
  }
  if(expenses.length) ok(await db.from('ledger').delete().in('id',expenses));
  if(files.length) ok(await db.storage.from('expense-receipts').remove(files));
  for(const id of users) ok(await db.auth.admin.deleteUser(id));
  console.log('Disposable test accounts and records removed.');
}
