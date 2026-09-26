import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log(`Connecting to Supabase at: ${url}...`);

try {
  // Test basic auth admin
  const { data: users, error: authError } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authError) {
    console.error('❌ Auth API Error:', authError.message);
  } else {
    console.log('✅ Supabase Auth connection: OK');
  }

  // Check required tables
  const tables = ['profiles', 'fee_settings', 'attendance', 'ledger', 'receipts'];
  for (const table of tables) {
    const { data, error } = await db.from(table).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ Table '${table}' missing or query failed: ${error.message}`);
    } else {
      console.log(`✅ Table '${table}': OK`);
    }
  }

  // Check storage bucket
  const { data: buckets, error: bucketError } = await db.storage.listBuckets();
  if (bucketError) {
    console.log(`❌ Storage buckets check failed: ${bucketError.message}`);
  } else {
    const hasReceipts = buckets.some(b => b.id === 'expense-receipts');
    if (hasReceipts) {
      console.log('✅ Storage bucket expense-receipts: OK');
    } else {
      console.log('⚠️ Storage bucket expense-receipts not found');
    }
  }

  console.log('\nSupabase verification complete.');
} catch (err) {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
}
