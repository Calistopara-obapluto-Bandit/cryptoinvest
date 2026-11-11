#!/usr/bin/env node
'use strict';

/**
 * Creates the first administrator, or promotes/resets an existing account.
 *
 *   npm run seed:admin -- admin@clearwavecrypto.com "a long password" "Ada Okonkwo"
 *
 * Any argument left out is asked for interactively. Registration on the site
 * can only create clients, so this is the only way to mint an admin.
 */

const readline = require('node:readline/promises');
const auth = require('../lib/auth');
const db = require('../lib/db');

async function main() {
  if (!db.hasDatabase()) {
    console.error('No database is configured. Set DATABASE_URL to your Neon connection string first.');
    process.exit(1);
  }

  const [emailArg, passwordArg, nameArg] = process.argv.slice(2);
  let email = (emailArg || '').trim().toLowerCase();
  let password = passwordArg || '';
  let fullName = (nameArg || '').trim();

  if (!email || !password || !fullName) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!email) email = (await rl.question('Admin email: ')).trim().toLowerCase();
    if (!fullName) fullName = (await rl.question('Admin full name: ')).trim();
    if (!password) password = (await rl.question('Admin password (min 8 characters): ')).trim();
    rl.close();
  }

  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    console.error('That email address is not valid.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Use a password of at least 8 characters.');
    process.exit(1);
  }
  if (fullName.length < 2) {
    console.error('Enter the admin’s full name.');
    process.exit(1);
  }

  const passwordHash = await auth.hashPassword(password);
  const existing = await auth.findMemberByEmail(email);

  if (existing) {
    await db.query(
      `UPDATE users SET role = 'admin', password_hash = $2, full_name = $3 WHERE id = $1`,
      [existing.id, passwordHash, fullName]
    );
    console.log(`Updated ${email} — role admin, password reset. Member ID ${existing.member_id}.`);
  } else {
    const member = await auth.createMember({
      fullName,
      email,
      phone: '+000000000',
      nationality: 'Not specified',
      age: 30,
      passwordHash,
      role: 'admin'
    });
    console.log(`Created admin ${email} — member ID ${member.member_id}.`);
  }

  await db.close();
}

main().catch(async (error) => {
  console.error('Could not seed the admin account:', error.message);
  try {
    await db.close();
  } catch (closeError) {
    // nothing useful to do here
  }
  process.exit(1);
});
