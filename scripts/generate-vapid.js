const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('--- GENERATED VAPID KEYS ---');
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY:', vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY:', vapidKeys.privateKey);

const envPath = path.join(__dirname, '..', '.env.local');
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

if (!envContent.includes('NEXT_PUBLIC_VAPID_PUBLIC_KEY')) {
  envContent += `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"\nVAPID_PRIVATE_KEY="${vapidKeys.privateKey}"\nVAPID_SUBJECT="mailto:admin@okasha.edu.pk"\n`;
  fs.writeFileSync(envPath, envContent);
  console.log('Saved VAPID keys to .env.local');
} else {
  console.log('.env.local already contains VAPID keys');
}

// Write a json file with the keys so components can read default demo fallback keys if env is missing
const keysPath = path.join(__dirname, '..', 'lib', 'vapid-keys.json');
fs.writeFileSync(keysPath, JSON.stringify({
  publicKey: vapidKeys.publicKey,
  privateKey: vapidKeys.privateKey,
  subject: 'mailto:admin@okasha.edu.pk'
}, null, 2));
console.log('Saved VAPID keys to lib/vapid-keys.json');
