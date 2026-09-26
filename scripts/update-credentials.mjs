/**
 * update-credentials.mjs
 * Updates super_admin and receptionist accounts in Supabase with new credentials.
 * Run: node --env-file=.env.local scripts/update-credentials.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const accounts = [
  {
    label:    'Super Admin',
    username: 'M.okasha saeed',
    email:    'mokasha.saeed@prismcoaching.edu.pk',
    password: '@Okasha2856',
    role:     'super_admin',
  },
  {
    label:    'Receptionist (Staff)',
    username: 'receptionist',
    email:    'receptionist@prismcoaching.edu.pk',
    password: '@Okasha1234',
    role:     'staff',
  },
];

async function upsertAccount({ label, username, email, password, role }) {
  console.log(`\n──────────────────────────────────────────`);
  console.log(`Processing: ${label} (${email})`);

  // 1. Check if profile already exists by email
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, auth_user_id, email')
    .eq('email', email)
    .maybeSingle();

  let userId;

  if (existing?.auth_user_id) {
    console.log(`  Found existing auth user: ${existing.auth_user_id}`);
    userId = existing.auth_user_id;

    // Update password
    const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, { password });
    if (pwErr) throw new Error(`Failed to update password: ${pwErr.message}`);
    console.log(`  Password updated`);

    // Update display name
    const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: username },
    });
    if (metaErr) throw new Error(`Failed to update metadata: ${metaErr.message}`);

    // Update profile
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ full_name: username, role, status: 'approved' })
      .eq('auth_user_id', userId);
    if (profErr) throw new Error(`Failed to update profile: ${profErr.message}`);
    console.log(`  Profile updated - role: ${role}, name: ${username}`);
  } else {
    console.log(`  No existing user - creating new account...`);
    const { data, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: username },
    });
    if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);
    userId = data.user.id;
    console.log(`  Auth user created: ${userId}`);

    // Update the auto-created profile
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ full_name: username, role, status: 'approved' })
      .eq('auth_user_id', userId);
    if (profErr) throw new Error(`Failed to set profile role: ${profErr.message}`);
    console.log(`  Profile role set: ${role}`);
  }

  console.log(`  DONE: ${label}`);
  console.log(`     Login email : ${email}`);
  console.log(`     Username    : ${username}`);
  console.log(`     Password    : ${password}`);
}

for (const account of accounts) {
  await upsertAccount(account);
}

console.log('\n==============================================');
console.log('All credentials updated successfully.');
console.log('==============================================\n');
