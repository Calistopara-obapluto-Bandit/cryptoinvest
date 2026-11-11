'use strict';

/**
 * Money for members.
 *
 * A client's balances are never stored as columns that can drift — they are
 * derived from the `transactions` and `investments` rows every time the
 * dashboard renders. Account balance = approved deposits + credited profit +
 * bonuses − completed withdrawals − money currently invested.
 */

const db = require('./db');

const PREFIX = { deposit: 'DP', withdrawal: 'WD', investment: 'IN', earning: 'ER', bonus: 'BN' };

function money(value) {
  const amount = Number(value || 0);
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function makeReference(kind) {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6).padEnd(4, 'X');
  return (PREFIX[kind] || 'TX') + '-' + stamp + rand;
}

const num = (value) => Number(value || 0);

async function summary(userId) {
  const totals = await db.query(
    `SELECT
       coalesce(sum(amount) FILTER (WHERE kind = 'deposit' AND status IN ('approved', 'completed')), 0) AS deposits_approved,
       coalesce(sum(amount) FILTER (WHERE kind = 'deposit' AND status = 'pending'), 0) AS deposits_pending,
       coalesce(sum(amount) FILTER (WHERE kind = 'withdrawal' AND status = 'completed'), 0) AS withdrawals_completed,
       coalesce(sum(amount) FILTER (WHERE kind = 'withdrawal' AND status = 'pending'), 0) AS withdrawals_pending,
       coalesce(sum(amount) FILTER (WHERE kind = 'earning' AND status <> 'rejected'), 0) AS earnings_total,
       coalesce(sum(amount) FILTER (WHERE kind = 'earning' AND status <> 'rejected'
                                AND created_at >= date_trunc('day', now())), 0) AS earnings_today,
       coalesce(sum(amount) FILTER (WHERE kind = 'bonus' AND status <> 'rejected'), 0) AS bonus_balance,
       coalesce(sum(amount) FILTER (WHERE kind = 'bonus' AND status <> 'rejected' AND note = 'referral'), 0) AS referral_balance
     FROM transactions
     WHERE user_id = $1`,
    [userId]
  );

  const invested = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'active')::int AS active_count,
            coalesce(sum(amount) FILTER (WHERE status = 'active'), 0) AS active_amount,
            count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
            coalesce(sum(amount) FILTER (WHERE status = 'completed'), 0) AS completed_amount
     FROM investments
     WHERE user_id = $1`,
    [userId]
  );

  const months = await db.query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            coalesce(sum(amount), 0) AS total
     FROM transactions
     WHERE user_id = $1 AND kind = 'earning' AND status <> 'rejected'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 6`,
    [userId]
  );

  const referrals = await db.query(
    `SELECT count(*)::int AS total
     FROM users
     WHERE referred_by = (SELECT member_id FROM users WHERE id = $1)`,
    [userId]
  );

  const t = totals.rows[0];
  const i = invested.rows[0];
  const ongoing = num(i.active_amount);
  const accountBalance = num(t.deposits_approved) + num(t.earnings_total) + num(t.bonus_balance)
    - num(t.withdrawals_completed) - ongoing;

  const monthKey = (date) => date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const byMonth = new Map(months.rows.map((row) => [row.month, num(row.total)]));

  return {
    accountBalance,
    profitBalance: num(t.earnings_total),
    bonusBalance: num(t.bonus_balance),
    ongoingInvestments: ongoing,
    ongoingCount: i.active_count,
    approvedDeposits: num(t.deposits_approved),
    pendingDeposits: num(t.deposits_pending),
    completedInvestments: num(i.completed_amount),
    completedInvestmentsCount: i.completed_count,
    completedWithdrawals: num(t.withdrawals_completed),
    pendingWithdrawals: num(t.withdrawals_pending),
    totalWithdrawal: num(t.withdrawals_completed),
    todayEarning: num(t.earnings_today),
    referralBalance: num(t.referral_balance),
    referrals: referrals.rows[0].total,
    earningThisMonth: byMonth.get(monthKey(now)) || 0,
    earningLastMonth: byMonth.get(monthKey(lastMonth)) || 0,
    earningHistory: months.rows.map((row) => ({ month: row.month, total: num(row.total) })).reverse()
  };
}

async function recentTransactions(userId, limit = 6) {
  const { rows } = await db.query(
    `SELECT id, reference, kind, method, amount, status, note, created_at
       FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function allTransactions(userId) {
  const { rows } = await db.query(
    `SELECT id, reference, kind, method, amount, status, note, created_at
       FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 200`,
    [userId]
  );
  return rows;
}

async function investments(userId, status) {
  const params = [userId];
  let filter = '';
  if (status) {
    params.push(status);
    filter = ' AND status = $2';
  }
  const { rows } = await db.query(
    `SELECT id, reference, plan_code, plan_name, amount, roi_percent, duration_days, status, created_at, matures_at
       FROM investments
      WHERE user_id = $1${filter}
      ORDER BY created_at DESC, id DESC
      LIMIT 50`,
    params
  );
  return rows;
}

async function createTransaction({ userId, kind, amount, method = '', status = 'pending', note = '' }) {
  const reference = makeReference(kind);
  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, reference, kind, method, amount, status, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, reference, kind, method, Number(amount), status, note]
  );
  return rows[0];
}

/** Buys a package: the investment row and its ledger entry land together. */
async function createInvestment({ userId, plan, amount }) {
  return db.transaction(async (tx) => {
    const reference = makeReference('investment');
    const roi = Number(String(plan.rateLabel).replace('%', ''));
    const { rows } = await tx.query(
      `INSERT INTO investments (user_id, reference, plan_code, plan_name, amount, roi_percent, duration_days, matures_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($7 || ' days')::interval)
       RETURNING *`,
      [userId, reference, plan.code, plan.name, Number(amount), roi, plan.days]
    );
    await tx.query(
      `INSERT INTO transactions (user_id, reference, kind, method, amount, status, note)
       VALUES ($1, $2, 'investment', $3, $4, 'completed', $5)`,
      [userId, makeReference('investment'), plan.kind, Number(amount), plan.name]
    );
    return rows[0];
  });
}

/** Pending deposits and withdrawals, for the admin to action. */
async function pendingRequests() {
  const { rows } = await db.query(
    `SELECT t.id, t.reference, t.kind, t.method, t.amount, t.status, t.created_at,
            u.full_name, u.email, u.member_id
       FROM transactions t
       JOIN users u ON u.id = t.user_id
      WHERE t.status = 'pending'
      ORDER BY t.created_at ASC
      LIMIT 100`
  );
  return rows;
}

/** Approving a deposit credits it; approving a withdrawal marks it paid. */
async function setRequestStatus(id, decision) {
  const mirrored = decision === 'approve'
    ? { deposit: 'approved', withdrawal: 'completed' }
    : { deposit: 'rejected', withdrawal: 'rejected' };

  const { rows } = await db.query(
    `UPDATE transactions
        SET status = CASE kind
                       WHEN 'deposit' THEN $2::text
                       WHEN 'withdrawal' THEN $3::text
                       ELSE 'completed'
                     END
      WHERE id = $1 AND status = 'pending'
      RETURNING id, user_id, kind, amount, status`,
    [id, mirrored.deposit, mirrored.withdrawal]
  );
  return rows[0] || null;
}

const KIND_LABELS = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  investment: 'Investment',
  earning: 'Profit',
  bonus: 'Bonus'
};

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  completed: 'Completed',
  rejected: 'Rejected'
};

const METHOD_LABELS = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  usdt: 'USDT',
  bank: 'Bank transfer',
  standard: 'Managed package',
  estate: 'Real estate deal'
};

const kindLabel = (kind) => KIND_LABELS[kind] || 'Entry';
const methodLabel = (method) => METHOD_LABELS[method] || (method ? String(method) : '—');
const statusLabel = (status) => STATUS_LABELS[status] || String(status || '');

module.exports = {
  money,
  kindLabel,
  statusLabel,
  methodLabel,
  summary,
  recentTransactions,
  allTransactions,
  investments,
  createTransaction,
  createInvestment,
  pendingRequests,
  setRequestStatus
};
