'use strict';

/**
 * Member accounts: password hashing, member IDs and cookie sessions.
 *
 * Passwords are hashed with scrypt from node:crypto — deliberately no native
 * dependency, so a deploy on a Node-only image cannot fail to build. The hash
 * never leaves the database: every read used by a page selects explicit
 * columns instead of `*`.
 */

const crypto = require('node:crypto');
const db = require('./db');

const SESSION_COOKIE = 'cw_session';
const SESSION_DAYS = 7;

const PUBLIC_COLUMNS = `
  id, member_id, full_name, email, phone, nationality, age, role, created_at
`;

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, salt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function makeMemberId() {
  const block = () => String(crypto.randomInt(1000, 10000));
  return `CW-${block()}-${block()}`;
}

/**
 * Inserts a member. Registration always creates the 'client' role — an admin
 * cannot be created through the public form.
 */
async function createMember({ fullName, email, phone, nationality, age, passwordHash, role = 'client' }) {
  const safeRole = role === 'admin' ? 'admin' : 'client';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await db.query(
        `INSERT INTO users (member_id, full_name, email, phone, nationality, age, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${PUBLIC_COLUMNS}`,
        [makeMemberId(), fullName, email, phone, nationality, age, passwordHash, safeRole]
      );
      return rows[0];
    } catch (error) {
      const collision = error.code === '23505' && String(error.constraint || '').includes('member_id');
      if (collision && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error('Could not allocate a member ID.');
}

async function findMemberByEmail(email) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findMemberById(id) {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, userId, String(SESSION_DAYS)]
  );
  return token;
}

async function memberForSession(token) {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.member_id, u.full_name, u.email, u.phone, u.nationality, u.age, u.role, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()
      LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

async function destroySession(token) {
  if (!token) return;
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

async function purgeExpiredSessions() {
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
}

/* ---------- cookies ---------- */

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index === -1) return;
      const name = part.slice(0, index).trim();
      if (!name) return;
      out[name] = decodeURIComponent(part.slice(index + 1).trim());
    });
  return out;
}

function sessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/* ---------- middleware ---------- */

/** Puts the signed-in member on res.locals so every view can use it. */
function attachMember(req, res, next) {
  res.locals.user = null;
  res.locals.databaseReady = db.isConfigured();
  if (!db.isConfigured()) return next();

  const token = sessionToken(req);
  if (!token) return next();

  memberForSession(token)
    .then((member) => {
      req.member = member;
      res.locals.user = member;
      next();
    })
    .catch((error) => {
      console.error('[auth] session lookup failed:', error.message);
      next();
    });
}

function requireMember(req, res, next) {
  if (!req.member) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.member) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  if (req.member.role !== 'admin') {
    return res.status(403).render('message', {
      title: 'Admins only — Clearwave Crypto',
      description: 'That page is restricted to administrators.',
      active: '',
      heading: 'Admins only',
      body: 'Your account does not have access to the admin dashboard. If you believe that is a mistake, contact support and we will look at it.',
      status: 403
    });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createMember,
  findMemberByEmail,
  findMemberById,
  createSession,
  memberForSession,
  destroySession,
  purgeExpiredSessions,
  sessionToken,
  setSessionCookie,
  clearSessionCookie,
  attachMember,
  requireMember,
  requireAdmin
};
