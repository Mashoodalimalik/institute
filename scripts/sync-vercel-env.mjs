import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const token = process.env.VERCEL_TOKEN;
const project = process.env.VERCEL_PROJECT || 'institute';

if (!existsSync('.env.local')) {
  console.error('❌ .env.local not found');
  process.exit(1);
}

// Parse .env.local
const envContent = readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

// Keys needed for cloud deployment on Vercel
const keysToSync = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED',
  'DEVICE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
];

console.log(`Syncing ${keysToSync.length} environment variables to Vercel (Project: ${project})...\n`);

for (const key of keysToSync) {
  const val = envVars[key];
  if (!val) {
    console.log(`⚠️ Skipping ${key} (no value found in .env.local)`);
    continue;
  }

  const tokenFlag = token ? `--token ${token}` : '';
  const projectFlag = project ? `--project ${project}` : '';
  
  // Use non-interactive CLI command with --value and --force
  const cmd = `npx vercel env add ${key} production,preview,development --value "${val}" --yes --force ${projectFlag} ${tokenFlag}`;

  try {
    process.stdout.write(`Syncing ${key}... `);
    execSync(cmd, { stdio: 'pipe' });
    console.log('✅ Done');
  } catch (err) {
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    if (output.includes('User not found') || output.includes('Login required') || output.includes('Not logged in') || output.includes('Error: Worker timed out')) {
      console.log('\n❌ Vercel CLI is not authenticated.');
      console.log('Please run `npx vercel login` or supply a VERCEL_TOKEN:');
      console.log('  VERCEL_TOKEN=your_token node scripts/sync-vercel-env.mjs\n');
      process.exit(1);
    } else {
      console.log(`⚠️ Note: ${output.trim().split('\n')[0]}`);
    }
  }
}

console.log('\n🎉 Finished syncing environment variables to Vercel!');
