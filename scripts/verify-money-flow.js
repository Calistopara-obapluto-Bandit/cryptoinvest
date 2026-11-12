#!/usr/bin/env node
'use strict';

/**
 * Walks the whole member money flow over HTTP against whatever database the
 * site is configured with, then checks the resulting rows directly:
 *
 *   DATABASE_URL=postgres://… npm run verify:money   # Neon
 *   npm run verify:money                             # embedded Postgres
 *
 * Register → referral → deposit → admin approval → investment → profit credit
 * → withdrawal hold → refusal above the balance → approval → rejection →
 * double-approval guard → restart (balances must survive a restart) → row
 * checks. It removes its own test accounts when it finishes.
 */

const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const db = require('../lib/db');
const auth = require('../lib/auth');

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'FlowCheck!2026';
const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const referrer = {
  fullName: 'Flow Referrer',
  email: 'flow-referrer-' + stamp + '@clearwavecrypto.test',
  phone: '+1 555 0142',
  nationality: 'Canada',
  age: 34
};
const referred = {
  fullName: 'Flow Referred',
  email: 'flow-referred-' + stamp + '@clearwavecrypto.test',
  phone: '+1 555 0143',
  nationality: 'Ghana',
  age: 29
};
const admin = { fullName: 'Flow Admin', email: 'flow-admin-' + stamp + '@clearwavecrypto.test' };

let checks = 0;
let failures = 0;
let child = null;
let base = '';
let serverLog = '';

function check(label, ok, detail) {
  checks += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail === undefined ? '' : '  — ' + detail));
  if (!ok) {
    failures += 1;
    const tail = serverLog.trim().split('\n').slice(-14).join('\n');
    if (tail) console.log('      server log:\n' + tail.replace(/^/gm, '      | '));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function boot() {
  const port = await freePort();
  base = 'http://127.0.0.1:' + port;
  serverLog = '';
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        // The app binds before the database is ready, and GET /register never
        // touches the database, so probe a login with a wrong password: 401
        // means the query ran and the database answered.
        for (let warm = 0; warm < 80; warm += 1) {
          const probe = await fetch(base + '/login', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email: admin.email, password: 'warm-up-probe', next: '' }).toString(),
            redirect: 'manual',
            signal: AbortSignal.timeout(3000)
          });
          if (probe.status === 401) return;
          await sleep(150);
        }
      }
    } catch (error) {
      // still starting
    }
    await sleep(150);
  }
  throw new Error('The site did not start.\n' + serverLog);
}

async function stop() {
  if (!child) return;
  const running = child;
  child = null;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { running.kill('SIGKILL'); resolve(); }, 5000);
    running.once('exit', () => { clearTimeout(timer); resolve(); });
    running.kill('SIGTERM');
  });
}

async function request(pathname, options) {
  const opts = options || {};
  const headers = { 'user-agent': 'clearwave-verify' };
  if (opts.cookie) headers.cookie = opts.cookie;

  let body;
  if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form).toString();
  }

  const response = await fetch(base + pathname, {
    method: opts.method || 'GET',
    headers,
    body,
    redirect: 'manual'
  });
  const text = await response.text();
  const setCookies = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

  return {
    status: response.status,
    location: response.headers.get('location') || '',
    text,
    setCookies
  };
}

function jar(response) {
  const raw = response.setCookies.find((cookie) => cookie.startsWith('cw_session='));
  return raw ? raw.split(';')[0] : '';
}

function tile(html, label) {
  const pattern = new RegExp('<span class="tile-label">' + label + '</span>\\s*<strong class="tile-value">([^<]+)</strong>');
  const match = html.match(pattern);
  return match ? match[1].trim() : '(missing)';
}

function pendingId(html, memberId, action) {
  const rows = html.split('<tr').filter((row) => row.includes(memberId) && row.includes('/admin/requests/'));
  if (!rows.length) return null;
  const match = rows[0].match(new RegExp('/admin/requests/(\\d+)/' + action));
  return match ? match[1] : null;
}

function signupForm(member, ref) {
  // Registration now takes a date of birth and derives the age from it.
  const birthYear = new Date().getFullYear() - member.age;
  return {
    fullName: member.fullName,
    email: member.email,
    phone: member.phone,
    nationality: member.nationality,
    dobDay: '1',
    dobMonth: '1',
    dobYear: String(birthYear),
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ref: ref || ''
  };
}

async function main() {
  if (!db.hasDatabase()) {
    throw new Error('No database configured: set DATABASE_URL (Neon) or unset NODE_ENV so the embedded database can be used.');
  }
  console.log('Verifying the money flow against the ' + (db.usesLocalDatabase() ? 'embedded Postgres database.' : 'DATABASE_URL database.'));

  // Throwaway administrator so the review flow does not depend on
  // ADMIN_EMAIL / ADMIN_PASSWORD being configured.
  await db.ensureSchema();
  await auth.createMember({
    fullName: admin.fullName,
    email: admin.email,
    phone: '+1 555 0100',
    nationality: 'Not specified',
    age: 30,
    passwordHash: await auth.hashPassword(PASSWORD),
    role: 'admin'
  });
  await db.close();

  await boot();

  let response = await request('/api/health');
  check('site responds with its health check', response.status === 200);

  /* ---------- registration and referral capture ---------- */

  response = await request('/register', { method: 'POST', form: signupForm(referrer) });
  check('register redirects to the welcome dashboard', response.status === 302 && response.location === '/dashboard?welcome=1', response.status + ' ' + response.location);
  const cookie = jar(response);
  const sessionCookie = response.setCookies.find((item) => item.startsWith('cw_session=')) || '';
  check('session cookie is HttpOnly, SameSite=Lax and lasts 7 days',
    /HttpOnly/i.test(sessionCookie) && /SameSite=Lax/i.test(sessionCookie) && /Max-Age=604800/.test(sessionCookie));

  response = await request('/dashboard', { cookie });
  check('new member sees the dashboard', response.status === 200, String(response.status));
  const memberId = (response.text.match(/CW-\d{4}-\d{4}/) || [])[0] || '';
  check('member ID looks like CW-1234-5678', /^CW-\d{4}-\d{4}$/.test(memberId), memberId);
  check('new account starts at $0.00', tile(response.text, 'Account Balance') === '$0.00', tile(response.text, 'Account Balance'));

  response = await request('/register', { method: 'POST', form: signupForm(referred, memberId) });
  check('registration with a referral link succeeds', response.status === 302 && response.location === '/dashboard?welcome=1');
  const referredCookie = jar(response);
  response = await request('/dashboard', { cookie: referredCookie });
  const referredId = (response.text.match(/CW-\d{4}-\d{4}/) || [])[0] || '';
  check('referred member gets a different member ID', Boolean(referredId) && referredId !== memberId, referredId);

  /* ---------- deposit + approval ---------- */

  response = await request('/dashboard/deposit', { method: 'POST', cookie, form: { amount: '1500', method: 'bank' } });
  check('deposit request is accepted', response.status === 302 && response.location.startsWith('/dashboard?sent='), response.status + ' ' + response.location);

  response = await request('/dashboard', { cookie });
  check('a pending deposit does not change the balance', tile(response.text, 'Account Balance') === '$0.00', tile(response.text, 'Account Balance'));

  response = await request('/login', { method: 'POST', form: { email: admin.email, password: PASSWORD, next: '' } });
  check('administrator logs in to /admin', response.status === 302 && response.location === '/admin', response.status + ' ' + response.location);
  const adminCookie = jar(response);

  let adminPage = await request('/admin', { cookie: adminCookie });
  const depositId = pendingId(adminPage.text, memberId, 'approve');
  check('deposit appears in the admin review queue', Boolean(depositId), String(depositId));

  response = await request('/admin/requests/' + depositId + '/approve', { method: 'POST', cookie: adminCookie });
  check('approving the deposit is confirmed', response.status === 302 && response.location.includes('updated=approve'), response.location);

  response = await request('/dashboard', { cookie });
  check('approved deposit reaches the balance', tile(response.text, 'Account Balance') === '$1,500.00', tile(response.text, 'Account Balance'));

  /* ---------- investment ---------- */

  response = await request('/dashboard/invest', { method: 'POST', cookie, form: { plan: 'starter', amount: '500' } });
  check('investment is accepted', response.status === 302 && response.location.startsWith('/dashboard?invested='), response.location);

  response = await request('/dashboard', { cookie });
  check('investment is held as an ongoing package', tile(response.text, 'Ongoing Investments') === '$500.00', tile(response.text, 'Ongoing Investments'));
  check('starter package credits 1.5% profit', tile(response.text, 'Profit Balance') === '$7.50', tile(response.text, 'Profit Balance'));
  check('balance reflects the investment and the profit', tile(response.text, 'Account Balance') === '$1,007.50', tile(response.text, 'Account Balance'));

  /* ---------- withdrawal: hold, refusal, approval, rejection ---------- */

  response = await request('/dashboard/withdraw', { method: 'POST', cookie, form: { amount: '800', method: 'bank', destination: 'GB33BUKB20201555555555' } });
  check('withdrawal request is accepted', response.status === 302 && response.location.startsWith('/dashboard?withdrawn='), response.location);

  response = await request('/dashboard', { cookie });
  check('pending withdrawal is held out of the balance', tile(response.text, 'Account Balance') === '$207.50', tile(response.text, 'Account Balance'));
  check('the held amount is reported', tile(response.text, 'Pending Withdrawals') === '$800.00', tile(response.text, 'Pending Withdrawals'));

  response = await request('/dashboard/withdraw', { method: 'POST', cookie, form: { amount: '300', method: 'bank', destination: 'GB33BUKB20201555555555' } });
  check('a withdrawal above the available balance is refused', response.status === 400 && response.text.includes('available balance'), String(response.status));

  response = await request('/dashboard/invest', { method: 'POST', cookie, form: { plan: 'starter', amount: '300' } });
  check('held money cannot be invested twice', response.status === 400 && response.text.includes('available balance'), String(response.status));

  adminPage = await request('/admin', { cookie: adminCookie });
  const withdrawalId = pendingId(adminPage.text, memberId, 'approve');
  check('withdrawal is queued for review', Boolean(withdrawalId), String(withdrawalId));

  response = await request('/admin/requests/' + withdrawalId + '/approve', { method: 'POST', cookie: adminCookie });
  check('withdrawal approval is confirmed', response.status === 302 && response.location.includes('updated=approve'));

  response = await request('/dashboard', { cookie });
  check('approved withdrawal settles without changing the balance again', tile(response.text, 'Account Balance') === '$207.50', tile(response.text, 'Account Balance'));
  check('completed withdrawals are recorded', tile(response.text, 'Completed Withdrawals') === '$800.00', tile(response.text, 'Completed Withdrawals'));

  await request('/dashboard/withdraw', { method: 'POST', cookie, form: { amount: '100', method: 'usdt', destination: 'TQn9Y2khDD95J42FQtQTdwVVRZqT5bJ1Mu' } });
  adminPage = await request('/admin', { cookie: adminCookie });
  const rejectedId = pendingId(adminPage.text, memberId, 'reject');
  check('second withdrawal is queued', Boolean(rejectedId), String(rejectedId));

  response = await request('/admin/requests/' + rejectedId + '/reject', { method: 'POST', cookie: adminCookie });
  check('administrator can reject a request', response.status === 302 && response.location.includes('updated=reject'));

  response = await request('/dashboard', { cookie });
  check('a rejected withdrawal holds nothing', tile(response.text, 'Pending Withdrawals') === '$0.00', tile(response.text, 'Pending Withdrawals'));
  check('a rejected withdrawal pays nothing', tile(response.text, 'Account Balance') === '$207.50', tile(response.text, 'Account Balance'));

  /* ---------- guards ---------- */

  response = await request('/admin/requests/' + depositId + '/approve', { method: 'POST', cookie: adminCookie });
  check('a reviewed deposit cannot be approved twice', response.status === 302);
  response = await request('/dashboard', { cookie });
  check('double approval did not change the balance', tile(response.text, 'Account Balance') === '$207.50', tile(response.text, 'Account Balance'));

  response = await request('/admin/requests/' + depositId + '/approve', { method: 'POST', cookie: referredCookie });
  check('members cannot review money requests', response.status === 403, String(response.status));

  response = await request('/dashboard');
  check('signed-out dashboard redirects to login', response.status === 302 && response.location.startsWith('/login?next='));

  response = await request('/dashboard/transactions', { cookie });
  check('transaction history renders', response.status === 200);
  response = await request('/dashboard/account', { cookie });
  check('account page renders', response.status === 200);
  response = await request('/dashboard/invest', { cookie });
  check('invest page renders', response.status === 200);
  response = await request('/dashboard/withdraw', { cookie });
  check('withdraw page renders', response.status === 200);

  /* ---------- second member invests through the referral ---------- */

  response = await request('/dashboard/deposit', { method: 'POST', cookie: referredCookie, form: { amount: '1000', method: 'bitcoin' } });
  check('referred member requests a deposit', response.status === 302);
  adminPage = await request('/admin', { cookie: adminCookie });
  const referredDepositId = pendingId(adminPage.text, referredId, 'approve');
  check('referred deposit is queued', Boolean(referredDepositId), String(referredDepositId));
  await request('/admin/requests/' + referredDepositId + '/approve', { method: 'POST', cookie: adminCookie });

  response = await request('/dashboard/invest', { method: 'POST', cookie: referredCookie, form: { plan: 'starter', amount: '500' } });
  check('referred member opens a package', response.status === 302);
  response = await request('/dashboard', { cookie: referredCookie });
  check('referred member balance is correct', tile(response.text, 'Account Balance') === '$507.50', tile(response.text, 'Account Balance'));

  /* ---------- restart: money lives in the database ---------- */

  await stop();
  await boot();

  response = await request('/dashboard', { cookie });
  check('session still works after a restart', response.status === 200, String(response.status));
  check('balance is read back from the database', tile(response.text, 'Account Balance') === '$207.50', tile(response.text, 'Account Balance'));

  response = await request('/login', { method: 'POST', form: { email: referrer.email, password: PASSWORD, next: '' } });
  check('member can log in again after a restart', response.status === 302 && response.location === '/dashboard', response.status + ' ' + response.location);

  await stop();

  /* ---------- direct row checks ---------- */

  await db.ensureSchema();
  const users = await db.query(
    'SELECT id, member_id, email, password_hash, role, referred_by FROM users WHERE email = ANY($1::text[])',
    [[referrer.email, referred.email, admin.email]]
  );
  const referrerRow = users.rows.find((row) => row.email === referrer.email);
  const referredRow = users.rows.find((row) => row.email === referred.email);
  const adminRow = users.rows.find((row) => row.email === admin.email);

  check('both member rows are stored', Boolean(referrerRow && referredRow));
  check('the administrator row has the admin role', Boolean(adminRow) && adminRow.role === 'admin');
  check('passwords are stored as scrypt hashes',
    Boolean(referrerRow) && /^scrypt\$/.test(referrerRow.password_hash) && !referrerRow.password_hash.includes(PASSWORD));
  check('the referred account records the referrer member ID',
    Boolean(referrerRow && referredRow) && referredRow.referred_by === referrerRow.member_id,
    referredRow && referredRow.referred_by);

  const ledger = await db.query('SELECT kind, status, amount FROM transactions WHERE user_id = $1', [referrerRow.id]);
  const approvedDeposits = ledger.rows.filter((row) => row.kind === 'deposit' && row.status === 'approved').reduce((sum, row) => sum + Number(row.amount), 0);
  const completedWithdrawals = ledger.rows.filter((row) => row.kind === 'withdrawal' && row.status === 'completed').reduce((sum, row) => sum + Number(row.amount), 0);
  const profit = ledger.rows.filter((row) => row.kind === 'earning' && row.status !== 'rejected').reduce((sum, row) => sum + Number(row.amount), 0);

  check('deposit is persisted as approved', approvedDeposits === 1500, String(approvedDeposits));
  check('withdrawal is persisted as completed', completedWithdrawals === 800, String(completedWithdrawals));
  check('profit credit is persisted', profit === 7.5, String(profit));
  check('rejected withdrawal is persisted as rejected',
    ledger.rows.some((row) => row.kind === 'withdrawal' && row.status === 'rejected' && Number(row.amount) === 100));

  const investmentRows = await db.query(
    'SELECT plan_code, plan_name, amount, roi_percent, duration_days, status FROM investments WHERE user_id = $1',
    [referrerRow.id]
  );
  check('investment row uses the catalog plan and term',
    investmentRows.rows.length === 1 &&
    investmentRows.rows[0].plan_code === 'starter' &&
    Number(investmentRows.rows[0].amount) === 500 &&
    Number(investmentRows.rows[0].roi_percent) === 1.5 &&
    investmentRows.rows[0].duration_days === 30 &&
    investmentRows.rows[0].status === 'active');

  const settled = approvedDeposits + profit - completedWithdrawals - 500;
  check('settled balance matches the dashboard figure', Math.round(settled * 100) === 20750, String(settled));
  check('settled balance is never negative', settled >= 0, String(settled));

  await db.close();
}

async function cleanup() {
  await stop();
  try {
    await db.ensureSchema();
    await db.query('DELETE FROM users WHERE email = ANY($1::text[])', [[referrer.email, referred.email, admin.email]]);
    await db.close();
    console.log('\nRemoved the verification accounts.');
  } catch (error) {
    console.error('Cleanup failed: ' + error.message);
  }
}

main()
  .catch((error) => {
    failures += 1;
    console.error('\n' + (error && error.stack ? error.stack : error));
  })
  .finally(async () => {
    await cleanup();
    console.log('\n' + (failures === 0 ? 'All ' + checks + ' checks passed.' : failures + ' of ' + checks + ' checks failed.'));
    process.exit(failures === 0 ? 0 : 1);
  });
