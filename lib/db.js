'use strict';

/**
 * Member database.
 *
 * With DATABASE_URL set the site talks to hosted Postgres (Neon) through `pg`.
 * Without it, the same SQL runs on an embedded Postgres engine (PGlite) kept in
 * .pglite/, so registration works on a fresh checkout instead of failing with
 * "database not connected". Both engines are real Postgres, so there is one
 * dialect of SQL and no behavioural drift between them.
 */

const path = require('node:path');
const { Pool } = require('pg');

/*
 * Neon's dashboard hands out URLs ending in `channel_binding=require`. Node's
 * `pg` does not implement SCRAM channel binding, so the parameter is dead
 * weight at best and an authentication failure at worst — drop it.
 */
function normalizeConnectionString(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch (error) {
    return raw;
  }
}

const connectionString = normalizeConnectionString(process.env.DATABASE_URL || '');
const isProduction = process.env.NODE_ENV === 'production';
const LOCAL_DIR = process.env.LOCAL_DATABASE_DIR || path.join(process.cwd(), '.pglite');

/*
 * The embedded engine is a development convenience only. A hosting filesystem
 * is ephemeral, so falling back to it there would accept registrations and
 * quietly lose every account on the next restart — refuse instead.
 */
const allowLocal = !isProduction || process.env.ALLOW_LOCAL_DATABASE === '1';

let pool = null;
let local = null;
let schemaReady = null;

/** True when accounts live in the embedded developer database, not Neon. */
function usesLocalDatabase() {
  return !connectionString && allowLocal;
}

/** True when registrations can actually be stored somewhere. */
function hasDatabase() {
  return Boolean(connectionString) || allowLocal;
}

function getLocal() {
  if (!local) {
    const { PGlite } = require('@electric-sql/pglite');
    local = new PGlite(LOCAL_DIR);
  }
  return local;
}

function getPool() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }
  if (!pool) {
    const isLocal = /^postgres(ql)?:\/\/[^/]*(localhost|127\.0\.0\.1)/.test(connectionString);
    pool = new Pool({
      connectionString,
      // Neon's pooled endpoint caps concurrent connections per branch; keep the
      // ceiling configurable for small plans or single-connection proxies.
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Neon (and most hosted Postgres) terminate TLS with a managed
      // certificate chain that node's default store does not always include.
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } })
    });
    pool.on('error', (error) => {
      console.error('[db] idle client error:', error.message);
    });
  }
  return pool;
}

function engine() {
  if (connectionString) return getPool();
  if (!allowLocal) {
    const error = new Error('DATABASE_URL is not set, so member accounts cannot be stored.');
    error.code = 'DATABASE_URL_MISSING';
    throw error;
  }
  return getLocal();
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    member_id     TEXT UNIQUE NOT NULL,
    full_name     TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    phone         TEXT NOT NULL,
    nationality   TEXT NOT NULL,
    age           INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'client',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
`;

/** Creates the tables on first use. Safe to call on every request. */
async function ensureSchema() {
  if (!schemaReady) {
    // The embedded engine needs exec() for a multi-statement script; a pooled
    // client must not receive one (it would be sent as a prepared statement).
    const run = usesLocalDatabase() ? getLocal().exec(SCHEMA) : getPool().query(SCHEMA);
    schemaReady = run
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return engine().query(text, params);
}

/**
 * Checks the database once at boot so a bad DATABASE_URL shows up in the
 * server log instead of as a blank error page on the first registration.
 */
async function ping() {
  const mode = usesLocalDatabase() ? 'local' : 'postgres';
  const startedAt = Date.now();
  try {
    await ensureSchema();
    const { rows } = await engine().query('SELECT count(*)::int AS members FROM users');
    return { mode, ok: true, members: rows[0].members, ms: Date.now() - startedAt };
  } catch (error) {
    return { mode, ok: false, error };
  }
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENETUNREACH',
  '28000', // invalid authorization / role not allowed
  '28P01', // password authentication failed
  '3D000', // database does not exist
  '53300' // too many connections
]);

/** True when the failure is the connection itself, not the data being saved. */
function isUnreachable(error) {
  if (!error) return false;
  if (UNREACHABLE_CODES.has(error.code)) return true;
  return /timeout|terminated|ssl|connect|DATABASE_URL/i.test(String(error.message || ''));
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (local) {
    await local.close();
    local = null;
  }
  schemaReady = null;
}

module.exports = {
  query,
  ensureSchema,
  ping,
  isUnreachable,
  close,
  usesLocalDatabase,
  hasDatabase
};
