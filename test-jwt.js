// Quick JWT test - run with: bun test-jwt.js
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

// Load .env manually
const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
const envMap = {};
for (const line of lines) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) envMap[key.trim()] = rest.join('=').trim();
}

const APP_ID = envMap['GITHUB_APP_ID'];
let PRIVATE_KEY = envMap['GITHUB_PRIVATE_KEY'];

// Normalize key
if (PRIVATE_KEY) {
  PRIVATE_KEY = PRIVATE_KEY.trim();
  if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) {
    PRIVATE_KEY = PRIVATE_KEY.slice(1, -1).trim();
  }
  PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

console.log(`App ID: ${APP_ID}`);
console.log(`Key starts with: ${PRIVATE_KEY?.substring(0, 40)}...`);
console.log(`Key ends with: ...${PRIVATE_KEY?.substring(PRIVATE_KEY.length - 40)}`);
console.log(`Key length: ${PRIVATE_KEY?.length} characters`);

function base64Url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'RS256', typ: 'JWT' };
const payload = {
  iat: now - 60,
  exp: now + 300,
  iss: parseInt(APP_ID, 10)
};

const tokenHeader = base64Url(JSON.stringify(header));
const tokenPayload = base64Url(JSON.stringify(payload));
const unsignedToken = `${tokenHeader}.${tokenPayload}`;

const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), PRIVATE_KEY);
const encodedSignature = signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const jwt = `${unsignedToken}.${encodedSignature}`;

console.log(`\nJWT generated (first 80 chars): ${jwt.substring(0, 80)}...`);
console.log('\nTesting against GitHub API...');

const req = https.request({
  hostname: 'api.github.com',
  path: '/app',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ZeroCMS-Test'
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(`GitHub Response: ${res.statusCode}`);
    console.log(`Body: ${body}`);
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.end();
