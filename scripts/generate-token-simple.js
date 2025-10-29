// Simple JWT token generator that doesn't require local dependencies
// This uses Node.js built-in crypto and can work standalone

import { randomBytes, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const JWT_SECRET = randomBytes(32).toString('base64');
const JWT_EXPIRY = '48h';
const JWT_AUDIENCE = 'urn:foo';
const JWT_ISSUER = 'urn:bar';

// Simple JWT sign implementation without jsonwebtoken library
function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function signJWT(payload, secret, expiresIn) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  // Calculate expiration time
  const now = Math.floor(Date.now() / 1000);
  let exp;
  if (expiresIn.endsWith('h')) {
    const hours = parseInt(expiresIn);
    exp = now + (hours * 3600);
  } else if (expiresIn.endsWith('d')) {
    const days = parseInt(expiresIn);
    exp = now + (days * 86400);
  } else {
    exp = now + 3600; // default 1 hour
  }

  const payloadWithExp = { ...payload, exp };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payloadWithExp));
  
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Determine role based on command line args
const role = process.argv[2] === '--admin' ? 'admin' : 
             process.argv[2] === '--user' ? 'user' : 'readonly';

// Create payload based on role
const payload = {
  sub: role === 'admin' ? 'admin-user' : role === 'user' ? 'standard-user' : 'readonly-user',
  id: role === 'admin' ? 'admin-user' : role === 'user' ? 'standard-user' : 'readonly-user',
  email: role === 'admin' ? 'admin@example.com' : role === 'user' ? 'user@example.com' : 'readonly@example.com',
  role: role,
  permissions: role === 'admin' ? ['read', 'write', 'delete'] : 
               role === 'user' ? ['read', 'write'] : 
               ['read'],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE
};

const JWT_TOKEN = signJWT(payload, JWT_SECRET, JWT_EXPIRY);

// Define JWT variables to update
const jwtVariables = {
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_EXPIRY,
  JWT_SECRET,
  JWT_TOKEN,
};

console.log(`Generated JWT token for role=${role}`);
console.log('JWT variables:', { ...jwtVariables, JWT_TOKEN: JWT_TOKEN.substring(0, 50) + '...' });

// Read existing .env file if it exists
let envContent = '';
if (existsSync('.env')) {
  envContent = readFileSync('.env', 'utf8');
}

// Replace or append each JWT variable
for (const [key, value] of Object.entries(jwtVariables)) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const replacement = `${key}="${value}"`;

  if (regex.test(envContent)) {
    // Replace existing variable
    envContent = envContent.replace(regex, replacement);
  } else {
    // Append new variable
    if (envContent && !envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += replacement + '\n';
  }
}

writeFileSync('.env', envContent);
console.log('\n✓ JWT token generated and saved to .env file');

