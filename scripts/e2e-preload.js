// Only loaded explicitly by e2e-environment.js, never by normal app startup.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const schema = process.env.HW_E2E_SCHEMA;
if (!/^hw_e2e_[a-f0-9]{16}$/.test(schema || '')) throw new Error('Missing isolated E2E schema');
const { migrationUrl } = require('../apps/api/src/infrastructure/database/databaseUrl');
const url = new URL(migrationUrl());
// Neon poolers reject search_path startup options; use the same endpoint directly.
if (url.hostname.endsWith('.neon.tech')) url.hostname = url.hostname.replace('-pooler.', '.');
url.searchParams.set('options', `-c search_path=${schema}`);
for (const key of ['DATABASE_URL', 'POSTGRES_URL', 'DIRECT_URL', 'POSTGRES_URL_NON_POOLING']) process.env[key] = url.toString();
process.env.NODE_ENV = process.env.HW_E2E_NODE_ENV || 'test';
process.env.PORT = '5000';
process.env.CLIENT_URL = require('./frontend-config').frontendURL;
process.env.HW_API = 'http://localhost:5000/api';
process.env.API_URL = 'http://localhost:5000';
process.env.VITE_API_URL = '/api';
// Tests must not send mail or spend third-party API quotas.
for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_ID', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) process.env[key] = '';
