'use strict';

/**
 * Postgres access for the member database.
 *
 * Everything here is plain SQL over `pg`, so the same code runs against a Neon
 * branch, a local Postgres or any other hosted Postgres. When DATABASE_URL is
 * absent the site still renders: only the account pages report that the
 * database is not configured yet.
 */

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';

let pool = null;
let schemaReady = null;

function isConfigured() {
  return Boolean(connectionString);
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
  if (!isConfigured()) {
    throw new Error('DATABASE_URL is not set.');
  }
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = null;
  }
}

module.exports = { isConfigured, query, ensureSchema, close };
