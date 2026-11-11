'use strict';

/** Deployed build self-report: the running service logs the git commit it
 * booted from at startup, via package.json._deployedCommit, so a Render log
 * line like "[deploy] booted commit: <hash>" reveals exactly which build is
 * live. The dashboard route below must keep passing summary, transactions,
 * active investments and referralLink into views/dashboard.ejs.
 */

/**
 * The member area: dashboard, deposits, withdrawals, investments, account and
 * transaction history.
 *
 * Every figure on the dashboard is computed from the ledger, so nothing here
 * stores a running balance that could drift out of step with the records.
 */

const db = require('./db');
const auth = require('./auth');
const ledger = require('./ledger');
const plans = require('./plans');

const DEPOSIT_MIN = 50;
const WITHDRAW_MIN = 20;
const AMOUNT_MAX = 5000000;

const DEPOSIT_METHODS = [
  { code: 'bitcoin', label: 'Bitcoin (BTC)', hint: 'Send to the wallet our desk confirms by email' },
  { code: 'ethereum', label: 'Ethereum (ETH)', hint: 'ERC-20 network' },
  { code: 'usdt', label: 'USDT (TRC-20)', hint: 'Tron network' },
  { code: 'bank', label: 'Bank transfer', hint: 'Use your member ID as the reference' }
];

const WITHDRAW_METHODS = [
  { code: 'bitcoin', label: 'Bitcoin wallet' },
  { code: 'bank', label: 'Bank account' },
  { code: 'usdt', label: 'USDT (TRC-20)' }
];

function parseAmount(raw) {
  const cleaned = String(raw == null ? '' : raw).replace(/[$,\s]/g, '');
  if (!cleaned) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function methodLabel(code) {
  const found = DEPOSIT_METHODS.concat(WITHDRAW_METHODS).find((item) => item.code === code);
  return found ? found.label : 'Manual';
}

function referralLink(req, member) {
  const ref = encodeURIComponent(member.member_id);
  const host = req.get('host') || (req.headers && req.headers.host);
  const proto = req.secure || (req.headers && (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') ? 'https' : 'http';
  return proto + '://' + host + '/register?ref=' + ref;
}

function flashFrom(query) {
  if (query.sent) {
    return { tone: 'ok', text: 'Deposit request ' + clean(query.sent, 24) + ' is in. It shows as pending until our desk confirms the funds.' };
  }
  if (query.invested) {
    return { tone: 'ok', text: 'Your investment ' + clean(query.invested, 24) + ' is live. The package now counts towards your ongoing investments.' };
  }
  if (query.withdrawn) {
    return { tone: 'ok', text: 'Withdrawal request ' + clean(query.withdrawn, 24) + ' received. It is queued for approval.' };
  }
  if (query.welcome === '1') {
    return { tone: 'ok', text: 'Your account is open. Fund it with a deposit to start an investment package.' };
  }
  return null;
}

async function dashboardData(req) {
  const member = req.member;
  const summary = await ledger.summary(member.id);
  const transactions = await ledger.recentTransactions(member.id, 6);
  const active = await ledger.investments(member.id, 'active');
  return {
    summary,
    transactions,
    active,
    referral: referralLink(req, member)
  };
}

function register(app) {
  app.get('/dashboard', auth.requireMember, async (req, res, next) => {
    try {
      const data = await dashboardData(req);
      res.render('dashboard', {
        title: 'Your dashboard — Clearwave Crypto',
        description: 'Balances, transactions, referrals and investment packages in one place.',
        active: 'dashboard',
        member: req.member,
        flash: flashFrom(req.query),
        summary: data.summary,
        transactions: data.transactions,
        activeInvestments: data.active,
        referralLink: data.referral,
        plans: plans.standard,
        estatePlans: plans.estate
      });
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return res.status(503).render('message', {
          title: 'Database unavailable — Clearwave Crypto',
          description: 'Clearwave could not reach the database.',
          active: '',
          heading: 'Database not available',
          body: 'Clearwave could not reach the database right now. Please try again in a moment.',
          status: 503,
          retryUrl: undefined
        });
      }
      next(error);
    }
  });

  app.get('/dashboard/transactions', auth.requireMember, async (req, res, next) => {
    try {
      const rows = await ledger.allTransactions(req.member.id);
      res.render('dashboard/transactions', {
        title: 'Transaction history — Clearwave Crypto',
        description: 'Every deposit, withdrawal, investment and profit credit on your account.',
        active: 'dashboard',
        member: req.member,
        transactions: rows
      });
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return res.status(503).render('message', {
          title: 'Database unavailable — Clearwave Crypto',
          description: 'Clearwave could not reach the database.',
          active: '',
          heading: 'Database not available',
          body: 'Clearwave could not reach the database right now. Please try again in a moment.',
          status: 503,
          retryUrl: undefined
        });
      }
      next(error);
    }
  });

  /* ---------- deposits ---------- */

  app.get('/dashboard/deposit', auth.requireMember, (req, res) => {
    res.render('dashboard/deposit', {
      title: 'Deposit — Clearwave Crypto',
      description: 'Add funds to your Clearwave account.',
      active: 'dashboard',
      member: req.member,
      methods: DEPOSIT_METHODS,
      minimum: DEPOSIT_MIN,
      values: { amount: '', method: 'bitcoin' },
      errors: []
    });
  });

  app.post('/dashboard/deposit', auth.requireMember, async (req, res, next) => {
    const amount = parseAmount((req.body || {}).amount);
    const method = clean((req.body || {}).method, 20) || 'bitcoin';
    const errors = [];

    if (!Number.isFinite(amount) || amount <= 0) errors.push('Enter the amount you want to deposit.');
    else if (amount < DEPOSIT_MIN) errors.push('The smallest deposit is ' + ledger.money(DEPOSIT_MIN) + '.');
    else if (amount > AMOUNT_MAX) errors.push('For deposits above ' + ledger.money(AMOUNT_MAX) + ', contact the desk directly.');
    if (!DEPOSIT_METHODS.some((item) => item.code === method)) errors.push('Choose a deposit method.');

    if (errors.length) {
      return res.status(400).render('dashboard/deposit', {
        title: 'Deposit — Clearwave Crypto',
        description: 'Add funds to your Clearwave account.',
        active: 'dashboard',
        member: req.member,
        methods: DEPOSIT_METHODS,
        minimum: DEPOSIT_MIN,
        values: { amount: String((req.body || {}).amount || ''), method },
        errors
      });
    }

    try {
      const entry = await ledger.createTransaction({
        userId: req.member.id,
        kind: 'deposit',
        amount,
        method,
        status: 'pending'
      });
      res.redirect('/dashboard?sent=' + encodeURIComponent(entry.reference));
    } catch (error) {
      if (db.isUnreachable(error)) {
        return res.status(503).render('dashboard/deposit', {
          title: 'Deposit — Clearwave Crypto',
          description: 'Add funds to your Clearwave account.',
          active: 'dashboard',
          member: req.member,
          methods: DEPOSIT_METHODS,
          minimum: DEPOSIT_MIN,
          values: { amount: String((req.body || {}).amount || ''), method },
          errors: ['The member database could not be reached, so nothing was saved. Try again in a moment.']
        });
      }
      next(error);
    }
  });

  /* ---------- withdrawals ---------- */

  app.get('/dashboard/withdraw', auth.requireMember, async (req, res, next) => {
    try {
      const summary = await ledger.summary(req.member.id);
      res.render('dashboard/withdraw', {
        title: 'Withdraw — Clearwave Crypto',
        description: 'Request a payout from your available balance.',
        active: 'dashboard',
        member: req.member,
        methods: WITHDRAW_METHODS,
        minimum: WITHDRAW_MIN,
        available: summary.accountBalance,
        values: { amount: '', method: 'bitcoin', destination: '' },
        errors: []
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/dashboard/withdraw', auth.requireMember, async (req, res, next) => {
    const amount = parseAmount((req.body || {}).amount);
    const method = clean((req.body || {}).method, 20) || 'bitcoin';
    const destination = clean((req.body || {}).destination, 120);

    let summary;
    try {
      summary = await ledger.summary(req.member.id);
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return res.status(503).render('dashboard/withdraw', {
          title: 'Withdraw — Clearwave Crypto',
          description: 'Request a payout from your available balance.',
          active: 'dashboard',
          member: req.member,
          methods: WITHDRAW_METHODS,
          minimum: WITHDRAW_MIN,
          available: 0,
          values: { amount: '', method: 'bitcoin', destination: '' },
          errors: ['The member database could not be reached, so your balance could not be checked right now. Try again in a moment.']
        });
      }
      return next(error);
    }

    const errors = [];
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Enter the amount you want to withdraw.');
    else if (amount < WITHDRAW_MIN) errors.push('The smallest withdrawal is ' + ledger.money(WITHDRAW_MIN) + '.');
    else if (amount > summary.accountBalance) {
      errors.push('That is more than your available balance of ' + ledger.money(summary.accountBalance) + '.');
    }
    if (!WITHDRAW_METHODS.some((item) => item.code === method)) errors.push('Choose where the money should go.');
    if (destination.length < 4) errors.push('Add the wallet address or account number for the payout.');

    const rerender = (status, list) => res.status(status).render('dashboard/withdraw', {
      title: 'Withdraw — Clearwave Crypto',
      description: 'Request a payout from your available balance.',
      active: 'dashboard',
      member: req.member,
      methods: WITHDRAW_METHODS,
      minimum: WITHDRAW_MIN,
      available: summary.accountBalance,
      values: { amount: String((req.body || {}).amount || ''), method, destination },
      errors: list
    });

    if (errors.length) return rerender(400, errors);

    try {
      const entry = await ledger.createTransaction({
        userId: req.member.id,
        kind: 'withdrawal',
        amount,
        method,
        status: 'pending',
        note: destination
      });
      res.redirect('/dashboard?withdrawn=' + encodeURIComponent(entry.reference));
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return rerender(503, ['The member database could not be reached, so nothing was saved. Try again in a moment.']);
      }
      next(error);
    }
  });

  /* ---------- investments ---------- */

  app.get('/dashboard/invest', auth.requireMember, async (req, res, next) => {
    try {
      const summary = await ledger.summary(req.member.id);
      const requested = clean(req.query.plan, 20);
      const chosen = plans.find(requested);
      res.render('dashboard/invest', {
        title: 'New investment — Clearwave Crypto',
        description: 'Choose a Clearwave package and invest from your available balance.',
        active: 'dashboard',
        member: req.member,
        available: summary.accountBalance,
        standard: plans.standard,
        estate: plans.estate,
        values: { amount: '', plan: chosen ? chosen.code : '' },
        errors: []
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/dashboard/invest', auth.requireMember, async (req, res, next) => {
    const plan = plans.find((req.body || {}).plan);
    const amount = parseAmount((req.body || {}).amount);

    let summary;
    try {
      summary = await ledger.summary(req.member.id);
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return res.status(503).render('dashboard/invest', {
          title: 'New investment — Clearwave Crypto',
          description: 'Choose a Clearwave package and invest from your available balance.',
          active: 'dashboard',
          member: req.member,
          available: 0,
          standard: plans.standard,
          estate: plans.estate,
          values: { amount: '', plan: '' },
          errors: ['The member database could not be reached, so your balance could not be checked right now. Try again in a moment.']
        });
      }
      return next(error);
    }

    const errors = [];
    if (!plan) errors.push('Choose one of the packages.');
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Enter the amount you want to invest.');
    if (plan && Number.isFinite(amount) && amount > 0) {
      if (amount < plan.min) errors.push(plan.name + ' starts at ' + plan.minLabel + '.');
      if (plan.max != null && amount > plan.max) errors.push(plan.name + ' tops out at ' + plan.maxLabel + '.');
    }
    if (Number.isFinite(amount) && amount > summary.accountBalance) {
      errors.push('Your available balance is ' + ledger.money(summary.accountBalance) + '. Deposit first, or invest a smaller amount.');
    }

    const rerender = (status, list) => res.status(status).render('dashboard/invest', {
      title: 'New investment — Clearwave Crypto',
      description: 'Choose a Clearwave package and invest from your available balance.',
      active: 'dashboard',
      member: req.member,
      available: summary.accountBalance,
      standard: plans.standard,
      estate: plans.estate,
      values: { amount: String((req.body || {}).amount || ''), plan: plan ? plan.code : '' },
      errors: list
    });

    if (errors.length) return rerender(400, errors);

    try {
      const investment = await ledger.createInvestment({ userId: req.member.id, plan, amount });
      res.redirect('/dashboard?invested=' + encodeURIComponent(investment.reference));
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return rerender(503, ['The member database could not be reached, so nothing was invested. Try again in a moment.']);
      }
      next(error);
    }
  });

  /* ---------- account ---------- */

  app.get('/dashboard/account', auth.requireMember, async (req, res, next) => {
    try {
      const summary = await ledger.summary(req.member.id);
      res.render('dashboard/account', {
        title: 'Your account — Clearwave Crypto',
        description: 'Your Clearwave profile, member ID and referral link.',
        active: 'dashboard',
        member: req.member,
        summary,
        referralLink: referralLink(req, req.member)
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { register, DEPOSIT_METHODS, WITHDRAW_METHODS, methodLabel };
