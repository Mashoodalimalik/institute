import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Read auth token from Vercel CLI config
const authPath = join(process.env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json');
if (!existsSync(authPath)) {
  console.error('❌ Vercel auth.json not found');
  process.exit(1);
}
const auth = JSON.parse(readFileSync(authPath, 'utf8'));
const token = auth.token;

const teamId = 'team_Ow7aqZ4j2uALZNuhnCgSsdK3';
const projectId = 'institute';

// Read .env.local
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
  'LOCAL_BACKEND_TOKEN',
  'LOCAL_BRIDGE_TOKEN',
  'NEXT_PUBLIC_LOCAL_BACKEND_TOKEN',
  'NEXT_PUBLIC_LOCAL_BRIDGE_TOKEN',
];

console.log(`🚀 Updating Vercel Environment Variables for project '${projectId}'...\n`);

for (const key of keysToSync) {
  const value = envVars[key];
  if (!value) continue;

  const isPublic = key.startsWith('NEXT_PUBLIC_');
  const type = isPublic ? 'plain' : 'sensitive';
  const target = ['production', 'preview', 'development'];

  const url = `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key, value, type, target }),
  });

  const data = await res.json();
  if (res.ok) {
    console.log(`✅ ${key}: Added/Updated successfully`);
  } else if (data.error?.code === 'ENV_ALREADY_EXISTS' || data.error?.message?.includes('already exists')) {
    // If it already exists, let's update it or keep it
    console.log(`ℹ️ ${key}: Already exists on Vercel`);
  } else {
    console.error(`❌ ${key}: ${data.error?.message || JSON.stringify(data)}`);
  }
}

console.log('\n🎉 Finished syncing all environment keys to Vercel!');
