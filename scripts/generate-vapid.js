const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const destination = path.join(__dirname, '..', '.env.local');
const env = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : '';
if (/^VAPID_PRIVATE_KEY=.+/m.test(env)) throw new Error('VAPID keys already exist. Do not rotate keys while subscriptions use them.');
const keys = webpush.generateVAPIDKeys();
fs.appendFileSync(destination, `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:mrzeeshan6009@gmail.com\n`);
console.log('VAPID keys saved to ignored .env.local; private key was not printed.');
