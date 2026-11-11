'use strict';

/** Deployed build self-report: the running service logs the git commit it
 * booted from at startup, via package.json._deployedCommit, so a Render log
 * line like "[deploy] booted commit: <hash>" reveals exactly which build is
 * live. The client /dashboard route below must keep passing summary,
 * transactions, active investments and referralLink into views/dashboard.ejs.
 */

/**
 * Account routes: register, log in, log out, the client dashboard and the
 * admin dashboard.
 *
 * Registration stores name, email, phone, nationality, age and a scrypt hash of
 * the password. The admin dashboard lists every member; the hash is never
 * selected there and never rendered.
 */

const db = require('./db');
const auth = require('./auth');
const ledger = require('./ledger');

const COUNTRIES = [
  'Argentina', 'Australia', 'Austria', 'Bahrain', 'Bangladesh', 'Belgium', 'Brazil', 'Bulgaria',
  'Cameroon', 'Canada', 'Chile', 'China', 'Colombia', 'Croatia', 'Cyprus', 'Czechia', 'Denmark',
  'Egypt', 'Estonia', 'Finland', 'France', 'Germany', 'Ghana', 'Greece', 'Hong Kong', 'Hungary',
  'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Kenya', 'Kuwait', 'Latvia',
  'Lebanon', 'Lithuania', 'Luxembourg', 'Malaysia', 'Malta', 'Mexico', 'Morocco', 'Netherlands',
  'New Zealand', 'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'Saudi Arabia', 'Singapore', 'Slovakia', 'Slovenia',
  'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland', 'Tanzania', 'Thailand',
  'Turkey', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Vietnam', 'Zimbabwe'
];

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validateRegistration(body) {
  const data = {
    fullName: clean(body.fullName, 80),
    email: clean(body.email, 120).toLowerCase(),
    phone: clean(body.phone, 24),
    nationality: clean(body.nationality, 56),
    age: Number(body.age),
    password: String(body.password == null ? '' : body.password).slice(0, 200),
    confirm: String(body.confirmPassword == null ? '' : body.confirmPassword).slice(0, 200)
  };

  const errors = [];
  if (data.fullName.length < 2) errors.push('Enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(data.email)) errors.push('Enter a valid email address.');
  if (!/^\+?[0-9][0-9\s()-]{6,19}$/.test(data.phone)) errors.push('Enter a valid phone number.');
  if (data.nationality.length < 2) errors.push('Select or type your nationality.');
  if (!Number.isInteger(data.age) || data.age < 18 || data.age > 120) {
    errors.push('You must be at least 18 years old to open an account.');
  }
  if (data.password.length < 8) errors.push('Choose a password of at least 8 characters.');
  if (data.password !== data.confirm) errors.push('The two passwords do not match.');

  return { data, errors };
}

/** Only ever redirect to a path on this site. */
function safeNext(value, fallback) {
  const next = String(value || '');
  if (next.startsWith('/') && !next.startsWith('//')) return next;
  return fallback;
}

function register(app) {
  const form = (extra) => Object.assign({
    fullName: '',
    email: '',
    phone: '',
    nationality: '',
    age: ''
  }, extra);

  /* ---------- registration ---------- */

  app.get('/register', (req, res) => {
    if (req.member) return res.redirect('/dashboard');
    res.render('auth/register', {
      title: 'Create your account — Clearwave Crypto',
      description: 'Open a Clearwave Crypto account to track your plans, loans, grants and member ID in one place.',
      active: 'register',
      countries: COUNTRIES,
      values: form(),
      referral: clean(req.query.ref, 24),
      errors: [],
      databaseReady: true,
      localDatabase: db.usesLocalDatabase(),
        hasDatabase: db.hasDatabase()
    });
  });

  app.post('/register', async (req, res, next) => {
    const { data, errors } = validateRegistration(req.body || {});
    const rerender = (status, list) =>
      res.status(status).render('auth/register', {
        title: 'Create your account — Clearwave Crypto',
        description: 'Open a Clearwave Crypto account to track your plans, loans, grants and member ID in one place.',
        active: 'register',
        countries: COUNTRIES,
        values: form({ ...data, password: '', confirm: '' }),
        referral: clean((req.body || {}).ref, 24),
        errors: list,
        databaseReady: true,
        localDatabase: db.usesLocalDatabase(),
        hasDatabase: db.hasDatabase()
      });

    try {
      if (errors.length) return rerender(400, errors);

      const existing = await auth.findMemberByEmail(data.email);
      if (existing) return rerender(409, ['That email address already has an account. Try logging in instead.']);

      const passwordHash = await auth.hashPassword(data.password);
      const referredBy = await auth.resolveReferrer((req.body || {}).ref);
      const member = await auth.createMember({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        nationality: data.nationality,
        age: data.age,
        passwordHash,
        referredBy
      });

      const token = await auth.createSession(member.id);
      auth.setSessionCookie(req, res, token);
      res.redirect('/dashboard?welcome=1');
    } catch (error) {
      // Two forms submitted at the same moment can both pass the email check;
      // the unique index is the real guard, so translate it into a form error.
      if (error.code === '23505' && String(error.constraint || '').includes('email')) {
        return rerender(409, ['That email address already has an account. Try logging in instead.']);
      }
      // A configured-but-unreachable database is a server problem, so say that
      // instead of showing a generic 500 that looks like a broken form.
      if (db.isUnreachable(error)) {
        console.error('[db] registration could not reach the database:', error.message);
        return rerender(503, ['The member database could not be reached, so nothing was saved. Check DATABASE_URL on the server and try again.']);
      }
      next(error);
    }
  });

  /* ---------- login ---------- */

  app.get('/login', (req, res) => {
    if (req.member) return res.redirect(req.member.role === 'admin' ? '/admin' : '/dashboard');
    res.render('auth/login', {
      title: 'Log in — Clearwave Crypto',
      description: 'Log in to your Clearwave Crypto account to view your member dashboard.',
      active: 'login',
      email: clean(req.query.email, 120),
      next: clean(req.query.next, 200),
      errors: [],
      notice: '',
      databaseReady: true,
      localDatabase: db.usesLocalDatabase(),
        hasDatabase: db.hasDatabase()
    });
  });

  app.post('/login', async (req, res, next) => {
    const email = clean((req.body || {}).email, 120).toLowerCase();
    const password = String((req.body || {}).password == null ? '' : (req.body || {}).password).slice(0, 200);
    const nextPath = clean((req.body || {}).next, 200);

    const rerender = (status, errors, notice) =>
      res.status(status).render('auth/login', {
        title: 'Log in — Clearwave Crypto',
        description: 'Log in to your Clearwave Crypto account to view your member dashboard.',
        active: 'login',
        email,
        next: nextPath,
        errors,
        notice: notice || '',
        databaseReady: true,
        localDatabase: db.usesLocalDatabase(),
        hasDatabase: db.hasDatabase()
      });

    try {
      if (!email || !password) return rerender(400, ['Enter your email address and password.']);

      const member = await auth.findMemberByEmail(email);
      const valid = member ? await auth.verifyPassword(password, member.password_hash) : false;
      if (!valid) return rerender(401, ['That email and password combination did not match an account.']);

      const token = await auth.createSession(member.id);
      auth.setSessionCookie(req, res, token);

      const fallback = member.role === 'admin' ? '/admin' : '/dashboard';
      res.redirect(safeNext(nextPath, fallback));
    } catch (error) {
      if (db.isUnreachable(error) || error && error._dbUnavailable) {
        console.error('[db] login could not reach the database:', error && error.message);
        return rerender(503, ['The member database could not be reached right now. Please try again in a moment.']);
      }
      next(error);
    }
  });

  app.post('/logout', async (req, res, next) => {
    try {
      await auth.destroySession(auth.sessionToken(req));
      auth.clearSessionCookie(req, res);
      res.redirect('/');
    } catch (error) {
      next(error);
    }
  });

  /* ---------- client dashboard ---------- */

  app.get('/dashboard', auth.requireMember, async (req, res, next) => {
    try {
      const summary = await ledger.summary(req.member.id);
      res.render('dashboard', {
        title: 'Your dashboard — Clearwave Crypto',
        description: 'Balances, transactions, referrals and investment packages in one place.',
        active: 'dashboard',
        member: req.member,
        welcome: req.query.welcome === '1',
        summary,
        transactions: await ledger.recentTransactions(req.member.id, 8),
        activeInvestments: await ledger.investments(req.member.id, 'active'),
        referralLink: referralLink(req, req.member)
      });
    } catch (error) {
      next(error);
    }
  });

  function referralLink(req, member) {
    const base = (typeof process !== 'undefined' && process.env && process.env.APP_URL && process.env.APP_URL !== 'http://localhost:' + (process.env.PORT || 3000))
      ? process.env.APP_URL.replace(/\/+$/, '')
      : ('https://' + req.headers.host);
    return base + '/register?ref=' + member.member_id;
  }

  /* ---------- admin dashboard ---------- */

  app.get('/admin', auth.requireAdmin, async (req, res, next) => {
    const search = clean(req.query.q, 80);
    try {
      const params = [];
      let where = "role = 'client'";
      if (search) {
        params.push('%' + search.replace(/[%_]/g, '\\$&') + '%');
        where += ` AND (full_name ILIKE $1 OR email ILIKE $1 OR nationality ILIKE $1 OR member_id ILIKE $1)`;
      }

      const requests = await ledger.pendingRequests();

      const [members, stats] = await Promise.all([
        db.query(
          `SELECT id, member_id, full_name, email, phone, nationality, age, role, created_at
             FROM users
            WHERE ${where}
            ORDER BY created_at DESC
            LIMIT 200`,
          params
        ),
        db.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS recent,
                  coalesce(round(avg(age))::int, 0) AS avg_age,
                  count(DISTINCT nationality)::int AS countries
             FROM users
            WHERE role = 'client'`
        )
      ]);

      res.render('admin', {
        title: 'Admin dashboard — Clearwave Crypto',
        description: 'Registered Clearwave members.',
        active: 'admin',
        member: req.member,
        members: members.rows,
        stats: stats.rows[0],
        requests,
        updated: clean(req.query.updated, 12),
        search,
        error: ''
      });
    } catch (error) {
      next(error);
    }
  });

  /* ---------- pending money requests ---------- */

  app.post('/admin/requests/:id/:decision', auth.requireAdmin, async (req, res, next) => {
    const id = Number(req.params.id);
    const decision = req.params.decision === 'approve' ? 'approve' : 'reject';
    if (!Number.isInteger(id) || id <= 0) return res.redirect('/admin');

    try {
      await ledger.setRequestStatus(id, decision);
      res.redirect('/admin?updated=' + decision + '#requests');
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { register, COUNTRIES, validateRegistration };
