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
const WITHDRAW_MIN = 100;
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
    return { tone: 'ok', text: 'Your investment ' + clean(query.invested, 24) + ' is live. The package counts towards your ongoing investments and your expected profit has been credited to your balance.' };
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
    const pendingProof = req.cookies && req.cookies.pending_proof;
    res.render('dashboard/deposit', {
      title: 'Deposit — Clearwave Crypto',
      description: 'Add funds to your Clearwave account.',
      active: 'dashboard',
      member: req.member,
      methods: DEPOSIT_METHODS,
      minimum: DEPOSIT_MIN,
      values: { amount: '', method: 'bitcoin' },
      errors: [],
      pendingProof
    });
  });

  app.post('/dashboard/deposit', auth.requireMember, async (req, res, next) => {
    const amount = parseAmount((req.body || {}).amount);
    const method = clean((req.body || {}).method, 20) || 'bitcoin';
    const proofFilename = (req.cookies && req.cookies.pending_proof) || '';
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
        errors,
        pendingProof: proofFilename
      });
    }

    try {
      const note = proofFilename ? 'proof=' + proofFilename : '';
      const entry = await ledger.createTransaction({
        userId: req.member.id,
        kind: 'deposit',
        amount,
        method,
        status: 'pending',
        note
      });
      if (proofFilename) {
        res.clearCookie('pending_proof', { path: '/' });
      }
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
      const pendingProof = req.cookies && req.cookies.pending_withdraw_proof;
      res.render('dashboard/withdraw', {
        title: 'Withdraw — Clearwave Crypto',
        description: 'Request a payout from your available balance.',
        active: 'dashboard',
        member: req.member,
        methods: WITHDRAW_METHODS,
        minimum: WITHDRAW_MIN,
        available: summary.accountBalance,
        values: { amount: '', method: 'bitcoin', destination: '' },
        errors: [],
        pendingProof
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/dashboard/withdraw', auth.requireMember, async (req, res, next) => {
    const amount = parseAmount((req.body || {}).amount);
    const method = clean((req.body || {}).method, 20) || 'bitcoin';
    const destination = clean((req.body || {}).destination, 120);
    const proofFilename = (req.cookies && req.cookies.pending_withdraw_proof) || '';

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
      errors: list,
      pendingProof: proofFilename
    });

    if (errors.length) return rerender(400, errors);

    try {
      const note = destination ? destination + (proofFilename ? ' | proof=' + proofFilename : '') : (proofFilename ? 'proof=' + proofFilename : '');
      const entry = await ledger.createTransaction({
        userId: req.member.id,
        kind: 'withdrawal',
        amount,
        method,
        status: 'pending',
        note
      });
      if (proofFilename) {
        res.clearCookie('pending_withdraw_proof', { path: '/' });
      }
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

  /* ---------- loans ---------- */

  app.get('/dashboard/loans', auth.requireMember, async (req, res, next) => {
    try {
      const summary = await ledger.summary(req.member.id);
      const myLoans = await ledger.loanApplications(req.member.id);
      res.render('dashboard/loans', {
        title: 'Loans — Clearwave Crypto',
        description: 'Apply for a loan against your portfolio holdings.',
        active: 'dashboard',
        member: req.member,
        summary,
        myLoans,
        values: { amount: '', termMonths: 3, note: '' },
        errors: []
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/dashboard/loans', auth.requireMember, async (req, res, next) => {
    const amount = parseAmount((req.body || {}).amount);
    const termMonths = Number((req.body || {}).termMonths) || 3;
    const note = clean((req.body || {}).note, 500);

    let summary;
    try {
      summary = await ledger.summary(req.member.id);
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return res.status(503).render('dashboard/loans', {
          title: 'Loans — Clearwave Crypto',
          description: 'Apply for a loan against your portfolio holdings.',
          active: 'dashboard',
          member: req.member,
          summary: { accountBalance: 0 },
          myLoans: [],
          values: { amount: '', termMonths: 3, note: '' },
          errors: ['The member database could not be reached. Try again in a moment.']
        });
      }
      return next(error);
    }

    const errors = [];
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Enter the loan amount you need.');
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 24) errors.push('Choose a term between 1 and 24 months.');
    if (Number.isFinite(amount) && amount > summary.accountBalance * 2) {
      errors.push('Loan requests are typically sized against your portfolio holdings. Talk to support for larger amounts.');
    }

    const rerender = async (status, list) => res.status(status).render('dashboard/loans', {
      title: 'Loans — Clearwave Crypto',
      description: 'Apply for a loan against your portfolio holdings.',
      active: 'dashboard',
      member: req.member,
      summary,
      myLoans: await ledger.loanApplications(req.member.id).catch(() => []),
      values: { amount: String((req.body || {}).amount || ''), termMonths, note },
      errors: list
    });

    if (errors.length) return rerender(400, errors);

    try {
      const application = await ledger.createLoanApplication({
        userId: req.member.id,
        amount,
        termMonths,
        note
      });
      res.redirect('/dashboard/loans?applied=' + encodeURIComponent(application.reference));
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return rerender(503, ['The member database could not be reached, so nothing was saved. Try again in a moment.']);
      }
      next(error);
    }
  });

  /* ---------- KYC ---------- */

  app.get('/dashboard/kyc', auth.requireMember, async (req, res, next) => {
    try {
      const myKyc = await ledger.kycSubmissions(req.member.id);
      res.render('dashboard/kyc', {
        title: 'KYC — Clearwave Crypto',
        description: 'Verify your identity so we can approve your account for higher limits and loans.',
        active: 'dashboard',
        member: req.member,
        myKyc,
        values: { documentType: 'identity', note: '' },
        errors: [],
        pendingProof: (req.cookies && req.cookies.pending_kyc_proof) || ''
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/dashboard/kyc', auth.requireMember, async (req, res, next) => {
    const documentType = clean((req.body || {}).documentType, 30) || 'identity';
    const note = clean((req.body || {}).note, 500);
    const proofFilename = (req.cookies && req.cookies.pending_kyc_proof) || '';

    const errors = [];
    if (!['identity', 'proof-of-address', 'other'].includes(documentType)) {
      errors.push('Choose a document type.');
    }

    const rerender = async (status, list) => res.status(status).render('dashboard/kyc', {
      title: 'KYC — Clearwave Crypto',
      description: 'Verify your identity so we can approve your account for higher limits and loans.',
      active: 'dashboard',
      member: req.member,
      myKyc: await ledger.kycSubmissions(req.member.id).catch(() => []),
      values: { documentType, note },
      errors: list,
      pendingProof: proofFilename
    });

    if (errors.length) return rerender(400, errors);

    try {
      const documentFile = proofFilename || '';
      const submission = await ledger.createKycSubmission({
        userId: req.member.id,
        documentType,
        documentFile,
        note
      });
      if (proofFilename) {
        res.clearCookie('pending_kyc_proof', { path: '/' });
      }
      res.redirect('/dashboard/kyc?submitted=' + encodeURIComponent(submission.reference));
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        return rerender(503, ['The member database could not be reached, so nothing was saved. Try again in a moment.']);
      }
      next(error);
    }
  });

  app.post('/dashboard/kyc/proof', auth.requireMember, (req, res, next) => {
    // Delegated to server.js where proofUpload is defined.
    next();
  });

  /* ---------- account ---------- */

  app.get('/dashboard/account', auth.requireMember, async (req, res, next) => {
    try {
      const [summary, myCards] = await Promise.all([
        ledger.summary(req.member.id),
        ledger.cardRequests(req.member.id)
      ]);
      res.render('dashboard/account', {
        title: 'Your account — Clearwave Crypto',
        description: 'Your Clearwave profile, member ID, referral link and virtual card.',
        active: 'dashboard',
        member: req.member,
        summary,
        myCards,
        cardNotice: req.query.card ? 'Card request ' + clean(req.query.card, 24) + ' received. It is waiting for admin approval.' : '',
        cardError: clean(req.query.cardError, 200),
        referralLink: referralLink(req, req.member)
      });
    } catch (error) {
      next(error);
    }
  });

  /* ---------- virtual card request ---------- */

  app.post('/dashboard/card', auth.requireMember, async (req, res, next) => {
    const body = req.body || {};
    const nameOnCard = clean(body.nameOnCard, 60);
    const currency = (clean(body.currency, 3) || 'USD').toUpperCase();
    const phone = clean(body.phone, 24);
    const spendingLimit = parseAmount(body.spendingLimit);
    const note = clean(body.note, 200);

    const fail = (message) => res.redirect('/dashboard/account?cardError=' + encodeURIComponent(message) + '#virtual-card');

    if (nameOnCard.length < 2) return fail('Enter the name that should appear on the card.');
    if (!['USD', 'EUR', 'GBP'].includes(currency)) return fail('Choose the currency for the card.');
    if (phone.length < 6) return fail('Add a phone number for the card.');
    if (!Number.isFinite(spendingLimit) || spendingLimit < 50 || spendingLimit > 50000) {
      return fail('Choose a monthly spending limit between 50 and 50,000.');
    }

    try {
      const card = await ledger.createCardRequest({
        userId: req.member.id,
        nameOnCard,
        currency,
        spendingLimit,
        phone,
        note
      });
      res.redirect('/dashboard/account?card=' + encodeURIComponent(card.reference) + '#virtual-card');
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        const message = encodeURIComponent('The member database could not be reached, so the card request was not saved.');
        return res.redirect('/dashboard/account?cardError=' + message + '#virtual-card');
      }
      next(error);
    }
  });
}

module.exports = { register, DEPOSIT_METHODS, WITHDRAW_METHODS, methodLabel };
