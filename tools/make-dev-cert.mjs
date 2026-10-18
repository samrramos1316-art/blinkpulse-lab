// Creates a self-signed certificate for `npm run dev:phone`, so a phone on the same
// Wi-Fi can open the dev server over https (browsers allow the camera only in a
// secure context). Needs `openssl` on the PATH (Git for Windows includes it).
// The certificate covers localhost and this computer's current LAN addresses; it is
// remade when an address changes. Files go to .cert/ (git-ignored, never commit).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.cert');
const key = join(dir, 'dev-key.pem');
const cert = join(dir, 'dev-cert.pem');
const stamp = join(dir, 'addresses.txt');

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address)
  .sort();
const addresses = ['127.0.0.1', ...lan];

if (existsSync(key) && existsSync(cert) && existsSync(stamp)) {
  if (readFileSync(stamp, 'utf8') === addresses.join(',')) {
    printUrls();
    process.exit(0);
  }
}

mkdirSync(dir, { recursive: true });
const san = ['DNS:localhost', ...addresses.map((a) => `IP:${a}`)].join(',');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-sha256',
    '-days',
    '365',
    '-keyout',
    key,
    '-out',
    cert,
    '-subj',
    '/CN=BlinkPulse Lab local dev',
    '-addext',
    `subjectAltName=${san}`,
  ],
  // openssl prints key-generation progress on stderr; it is shown only if it fails.
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
writeFileSync(stamp, addresses.join(','));
console.log(`Made a self-signed dev certificate for: localhost, ${addresses.join(', ')}`);
printUrls();

function printUrls() {
  if (lan.length === 0) {
    console.log(
      'No Wi-Fi/LAN address found: connect this computer to the same network as the phone.',
    );
    return;
  }
  console.log('On your phone (same Wi-Fi), open:');
  for (const a of lan) console.log(`  https://${a}:5173/`);
  console.log("Accept the certificate warning once (it is this computer's own certificate).");
}
