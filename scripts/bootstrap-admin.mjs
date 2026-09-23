import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const email = process.env.ADMIN_EMAIL;
if (!email) throw new Error('Set ADMIN_EMAIL to the intended institute administrator');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: existing, error: lookupError } = await db.from('profiles').select('id,auth_user_id').eq('email', email).maybeSingle();
if (lookupError) throw lookupError;
if (existing) throw new Error('An existing profile uses this email; review it before granting administrator access');
const password = randomBytes(24).toString('base64url');
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Zeeshan' } });
if (error) throw error;
await writeFile('.admin-credentials.local.json', JSON.stringify({ email, password, userId: data.user.id, signInUrl: process.env.NEXT_PUBLIC_APP_URL }, null, 2));
const { error: updateError } = await db.from('profiles').update({ role: 'super_admin', status: 'approved' }).eq('auth_user_id', data.user.id);
if (updateError) throw updateError;
console.log('Administrator created. Credentials saved in ignored .admin-credentials.local.json; no email was sent.');
