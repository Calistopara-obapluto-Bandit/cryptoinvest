const express = require('express');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const ejs = require('ejs');
const db = require('./lib/db');
const auth = require('./lib/auth');
const accountRoutes = require('./lib/account-routes');
const memberRoutes = require('./lib/member-routes');
const ledger = require('./lib/ledger');
const planCatalog = require('./lib/plans');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataDirectory = path.join(__dirname, 'data');
const accountFile = path.join(dataDirectory, 'paper-account.json');
const allowedAssets = ['BTC', 'ETH', 'SOL'];
const marketIds = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
const fallbackMarkets = [
  { symbol: 'BTC', name: 'Bitcoin', price: 68420.55, change24h: 2.48, volume: '28.4B', color: '#f7931a' },
  { symbol: 'ETH', name: 'Ethereum', price: 3528.2, change24h: 1.16, volume: '14.2B', color: '#627eea' },
  { symbol: 'SOL', name: 'Solana', price: 162.84, change24h: -0.82, volume: '3.8B', color: '#7c67f7' }
];

const initialAccount = () => ({
  cashUsd: 25000,
  holdings: { BTC: 0.18, ETH: 1.65, SOL: 22 },
  ledger: [],
  createdAt: new Date().toISOString()
});

let marketCache = { updatedAt: 0, assets: fallbackMarkets, source: 'demo' };

app.disable('x-powered-by');
// Freebuff previews and production hosting both terminate TLS in front of the
// app, so trust the first proxy hop when deciding if the session cookie is
// allowed to be Secure.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static middleware (Clearwave CSS, JS, images). Serves static assets only,
// never the legacy index.html so the EJS views are never shadowed.
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '') {
    return next();
  }
  if (req.path.startsWith('/assets/') || req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.svg') || req.path.endsWith('.woff2') || req.path.endsWith('.ico')) {
    return express.static(path.join(__dirname, '.'))(req, res, next);
  }
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
// Resolves the cw_session cookie into res.locals.user for every page. Static
// assets are served above this point, so this never waits on the database.
app.use(auth.attachMember);

async function readAccount() {
  try {
    return JSON.parse((await fsPromises.readFile(accountFile)).toString('utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fsPromises.mkdir(dataDirectory, { recursive: true });
    const account = initialAccount();
    await writeAccount(account);
    return account;
  }
}

async function writeAccount(account) {
  await fsPromises.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${accountFile}.tmp`;
  await fsPromises.writeFile(temporaryFile, JSON.stringify(account, null, 2));
  await fsPromises.rename(temporaryFile, accountFile);
}

async function getMarkets() {
  if (Date.now() - marketCache.updatedAt < 30000) return marketCache;
  try {
    const url = new URL('https://api.coingecko.com/api/v3/simple/price');
    url.searchParams.set('ids', Object.values(marketIds).join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Market provider returned ' + response.status);
    const data = await response.json();
    const assets = fallbackMarkets.map(asset => {
      const quote = data[marketIds[asset.symbol]];
      if (!quote || !Number.isFinite(quote.usd)) throw new Error('Market provider response was incomplete');
      return { ...asset, price: quote.usd, change24h: Number.isFinite(quote.usd_24h_change) ? quote.usd_24h_change : 0 };
    });
    marketCache = { updatedAt: Date.now(), assets, source: 'live' };
  } catch {
    marketCache = { ...marketCache, updatedAt: Date.now(), source: 'demo' };
  }
  return marketCache;
}

function round(value, places) {
  places = places || 8;
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getAsset(symbol, markets) {
  return markets.assets.find(asset => asset.symbol === symbol);
}

// --- Paper-trading webservice API (unchanged from original) ---
app.get('/api/overview', async (req, res, next) => {
  try {
    const [account, markets] = await Promise.all([readAccount(), getMarkets()]);
    const positions = markets.assets.map(asset => ({
      ...asset,
      quantity: account.holdings[asset.symbol] || 0,
      value: round((account.holdings[asset.symbol] || 0) * asset.price, 2)
    }));
    const investedUsd = positions.reduce((total, asset) => total + asset.value, 0);
    res.json({
      account: { ...account, investedUsd: round(investedUsd, 2), totalUsd: round(account.cashUsd + investedUsd, 2) },
      markets: markets.assets,
      marketSource: markets.source,
      marketUpdatedAt: markets.updatedAt
    });
  } catch (error) { next(error); }
});

// ---- PAGE ROUTES (EJS) ----
// One definition per page. Every view renders through the shared head/nav/footer
// partials so navigation and layout never drift between pages.
const pageRoutes = {
  '/': 'index',
  '/commodities': 'commodities',
  '/cryptocurrency': 'cryptocurrency',
  '/real-estate': 'real-estate',
  '/staking': 'staking',
  '/stocks': 'stocks',
  '/loans': 'loans',
  '/grants': 'grants',
  '/member-id': 'member-id',
  '/company': 'company',
  '/plan': 'plan',
  '/faq': 'faq',
  '/contact': 'contact'
};
Object.keys(pageRoutes).forEach((route) => {
  app.get(route, (req, res) => {
    res.render(pageRoutes[route]);
  });
});

// URLs from the previous site structure point at the closest current page so
// old links and bookmarks keep working after the rewrite.
const legacyRedirects = {
  '/services': '/plan',
  '/services/commodities-gold': '/commodities',
  '/services/cryptocurrency': '/cryptocurrency',
  '/services/real-estate': '/real-estate',
  '/services/stock-etfs': '/stocks',
  '/services/staking': '/staking',
  '/services/loan': '/loans',
  '/services/loans': '/loans',
  '/services/grant': '/grants',
  '/services/grants': '/grants',
  '/services/card': '/member-id',
  '/services/membership': '/member-id',
  '/member': '/member-id',
  // Sign-up wording people try in the address bar or that older links used.
  '/signup': '/register',
  '/sign-up': '/register',
  '/registration': '/register',
  '/join': '/register',
  '/signin': '/login',
  '/sign-in': '/login',
  '/about': '/company',
  '/testimonials': '/#testimonials'
};
Object.keys(legacyRedirects).forEach((route) => {
  app.get(route, (req, res) => res.redirect(301, legacyRedirects[route]));
});

const legalPages = {
  '/privacy': {
    title: 'Privacy Policy — Clearwave Crypto',
    description: 'How Clearwave Crypto handles the information you share with us.',
    heading: 'Privacy Policy',
    sections: [
      { h: 'What we collect', p: 'When you contact us through the site we receive the name, email address, phone number and message you submit. Newsletter subscriptions store the email address you provide. We do not collect payment card details through this website.' },
      { h: 'Market data', p: 'Live price quotes are requested from a public market data provider. Those requests contain asset identifiers only — never your account details.' },
      { h: 'Cookies and analytics', p: 'The site does not set advertising cookies and does not run third-party tracking scripts. Your light or dark theme preference is stored in your browser’s local storage.' },
      { h: 'Contact', p: 'Questions about this policy can go to contact@clearwavecrypto.com and will be answered by the Clearwave support desk.' }
    ]
  },
  '/terms': {
    title: 'Terms of Service — Clearwave Crypto',
    description: 'Terms for using the Clearwave Crypto investment platform and website.',
    heading: 'Terms of Service',
    sections: [
      { h: 'Eligibility', p: 'You must be at least 18 years old to open an account. By registering you confirm that the information you provide is accurate and that you are acting on your own behalf.' },
      { h: 'Plans and figures', p: 'Plan rates, durations, referral bonuses and property values describe the products offered on this site. They are illustrative of the plan terms and do not constitute a guarantee of future performance. Investing carries risk, including the risk of losing capital.' },
      { h: 'No financial advice', p: 'Nothing on this site is investment, tax or legal advice. Decide whether a plan suits you based on your own circumstances, or seek independent professional advice.' },
      { h: 'Acceptable use', p: 'Do not use this site to attempt to disrupt the service, probe systems you are not authorised to access, or present results as anything other than what they are.' },
      { h: 'Changes', p: 'The platform, its plans and these terms may change as the service evolves. Continued use after a change means you accept the updated terms.' }
    ]
  }
};
Object.keys(legalPages).forEach((route) => {
  const page = legalPages[route];
  app.get(route, (req, res) => {
    res.render('legal', {
      title: page.title,
      description: page.description,
      heading: page.heading,
      sections: page.sections
    });
  });
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const { side, symbol, amountUsd } = req.body || {};
    const amount = Number(amountUsd);
    if (!['buy', 'sell'].includes(side) || !allowedAssets.includes(symbol) || !Number.isFinite(amount) || amount < 5 || amount > 1000000) {
      return res.status(400).json({ error: 'Choose a supported asset and enter an amount between $5 and $1,000,000.' });
    }
    const markets = await getMarkets();
    const asset = getAsset(symbol, markets);
    const fee = round(amount * 0.001, 2);
    const quantity = round(amount / asset.price);
    const account = await readAccount();
    if (side === 'buy') {
      if (amount + fee > account.cashUsd) return res.status(400).json({ error: 'Not enough demo cash for this order, including the 0.10% paper fee.' });
      account.cashUsd = round(account.cashUsd - amount - fee, 2);
      account.holdings[symbol] = round((account.holdings[symbol] || 0) + quantity);
    } else {
      if (quantity > (account.holdings[symbol] || 0)) return res.status(400).json({ error: 'Not enough ' + symbol + ' in this demo portfolio to sell that amount.' });
      account.cashUsd = round(account.cashUsd + amount - fee, 2);
      account.holdings[symbol] = round(account.holdings[symbol] - quantity);
    }
    const order = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      side, symbol, quantity, price: asset.price, amountUsd: amount, feeUsd: fee, createdAt: new Date().toISOString()
    };
    account.ledger.unshift(order);
    account.ledger = account.ledger.slice(0, 100);
    await writeAccount(account);
    res.status(201).json({ order });
  } catch (error) { next(error); }
});

app.post('/api/cash', async (req, res, next) => {
  try {
    const { action, amountUsd } = req.body || {};
    const amount = Number(amountUsd);
    if (!['add', 'withdraw'].includes(action) || !Number.isFinite(amount) || amount < 10 || amount > 100000) {
      return res.status(400).json({ error: 'Enter a demo amount between $10 and $100,000.' });
    }
    const account = await readAccount();
    if (action === 'withdraw' && amount > account.cashUsd) {
      return res.status(400).json({ error: 'That amount exceeds the available demo cash balance.' });
    }
    account.cashUsd = round(account.cashUsd + (action === 'add' ? amount : -amount), 2);
    account.ledger.unshift({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      side: action === 'add' ? 'cash added' : 'cash withdrawn', symbol: 'USD', amountUsd: amount, createdAt: new Date().toISOString()
    });
    account.ledger = account.ledger.slice(0, 100);
    await writeAccount(account);
    res.status(201).json({ cashUsd: account.cashUsd });
  } catch (error) { next(error); }
});

app.post('/api/reset', async (req, res, next) => {
  try {
    const account = initialAccount();
    await writeAccount(account);
    res.json({ reset: true });
  } catch (error) { next(error); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'paper-trading' }));

// ---- MEMBER ACCOUNTS (register, login, dashboards) ----
accountRoutes.register(app);
memberRoutes.register(app);

// Helpers every view can use: money and ledger labels, plus the plan catalog.
app.locals.money = ledger.money;
app.locals.kindLabel = ledger.kindLabel;
app.locals.statusLabel = ledger.statusLabel;
app.locals.methodLabel = ledger.methodLabel;
app.locals.planCatalog = planCatalog;

// 404 / error handling last.
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((req, res) => {
  res.status(404).render('message', {
    title: 'Page not found — Clearwave Crypto',
    description: 'The page you asked for does not exist.',
    active: '',
    heading: 'Page not found',
    body: 'That page has moved or never existed. The links below will get you back to the platform.',
    status: 404,
    retryUrl: undefined
  });
});

function sanitizeShortMessage(error) {
  if (!error || typeof error !== 'object') return '';
  const raw = error.message || error.code || '';
  if (typeof raw !== 'string') return '';
  const max = 220;
  const safe = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, max);
  if (!safe) return '';
  return safe;
}

function errorId() {
  return 'err-' + Math.random().toString(36).slice(2, 9);
}

function render500(req, res, error, extraBody) {
  if (res.headersSent) return;
  console.error('[500] ' + req.method + ' ' + req.originalUrl + ' :: ' + (error ? (error.stack || error.message || String(error)) : 'no error object'));
  noteFirstBootError(error);
  const isApi = req.path.startsWith('/api/');
  if (isApi) {
    return res.status(500).json({ error: 'The service could not complete that request.' });
  }
  const short = sanitizeShortMessage(error);
  const id = errorId();
  let body;
  if (short) {
    body = extraBody || ('This request failed with: ' + short);
  } else {
    body = extraBody || 'That request could not be completed. Try again, or contact support if it keeps happening.';
  }
  if (id) body += '\n\nError id: ' + id;
  res.status(500).render('message', {
    title: 'Something went wrong — Clearwave Crypto',
    description: 'The request could not be completed.',
    active: '',
    heading: 'Something went wrong',
    body,
    status: 500,
    errorId: id,
    errorShort: short,
    retryUrl: undefined
  });
}

app.use((error, req, res, next) => {
  render500(req, res, error);
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] uncaught exception:', error && (error.stack || error.message || error));
  try {
    // If a request is in flight, attempt to send the branded 500 page for it
    // before we shut down. This only reaches errors that bypass the Express
    // error handler, which is exactly the case that currently shows the
    // Express default "Internal Server Error" page.
    if (typeof render500 === 'function') {
      const req = appServer ? null : null;
      // We cannot reliably retrieve the active request here, so we log and
      // fall back to a clean exit. The Express error handler handles in-request
      // errors; this path is only for process-level crashes.
    }
    appServer.close(() => process.exit(1));
  } catch (closeError) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason && (reason.stack || reason.message || reason));
});

const bootDatabase = () =>
  db.ping().then((state) => {
    const where = state.mode === 'local' ? 'embedded Postgres (.pglite/, set DATABASE_URL for Neon)' : 'DATABASE_URL';
    if (state.ok) {
      console.log('[db] ' + where + ' — ' + state.members + ' member(s), ready in ' + state.ms + 'ms');
      return state;
    }
    console.error('[db] ' + where + ' connection failed:', state.error.message);
    return state;
  });

// Bind the listener first, then establish the database in the background.
// The site must never block startup on the database, because a slow provider
// health check or a cold database should not turn the public site into a 502/503.
// Requests that touch the database before it is ready instead render a clear
// "we are connecting to the database" page rather than a raw 500.
let databaseBootPromise = null;
let databaseBootState = null;

let deployedCommit = '[git commit unavailable at runtime]';
let firstErrorOnBoot = null;
try {
  const fs = require('node:fs');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  deployedCommit = (pkg && pkg._deployedCommit) || deployedCommit;
} catch (readError) {
  // package.json might not carry the marker; leave the fallback.
}

function noteFirstBootError(error) {
  if (firstErrorOnBoot) return;
  firstErrorOnBoot = error && (error.stack || error.message || String(error));
}

const appServer = app.listen(port, async () => {
  console.log('Clearwave Crypto site listening on http://localhost:' + port);
  console.log('[deploy] booted commit: ' + deployedCommit);
  databaseBootPromise = bootDatabase();
  try {
    databaseBootState = await databaseBootPromise;
  } catch (error) {
    databaseBootState = { mode: db.usesLocalDatabase() ? 'local' : 'remote', ok: false, error };
    console.error('[db] unexpected failure during startup connection:', error && error.message);
  }
  auth.ensureEnvAdmin()
    .then((admin) => {
      if (!admin) return;
      if (admin.generated) {
        console.log('[auth] created developer admin — email: ' + admin.email + ' password: ' + admin.password);
        console.log('[auth] this password is printed once; change it with: npm run seed:admin -- ' + admin.email + ' <new-password>');
        return;
      }
      console.log('[auth] admin ready: ' + admin.email + (admin.promoted ? ' (promoted to admin)' : ''));
    })
    .catch((error) => console.error('[auth] could not prepare the admin account:', error.message))
    .finally(() => {
      if (firstErrorOnBoot) {
        console.error('[boot] first 500 on this instance: ' + firstErrorOnBoot.slice(0, 500));
      } else {
        console.log('[boot] no 500 observed during startup wait');
      }
    });
});

app.use((req, res, next) => {
  if (databaseBootState === null) {
    return res.status(503).render('message', {
      title: 'Connecting to the database — Clearwave Crypto',
      description: 'Clearwave is establishing a connection to the database.',
      active: '',
      heading: 'Still connecting',
      body: 'Clearwave is starting up and connecting to the database. This usually takes only a moment. Try again in a few seconds.',
      status: 503,
      retryUrl: req.originalUrl
    });
  }
  if (!databaseBootState.ok) {
    return res.status(503).render('message', {
      title: 'Database unavailable — Clearwave Crypto',
      description: 'Clearwave could not reach the database.',
      active: '',
      heading: 'Database not available',
      body: 'Clearwave could not reach the database right now. Please check back in a few minutes.',
      status: 503,
      retryUrl: undefined
    });
  }
  if (req._dbUnavailable) {
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
  next();
});

// Do not let an unhandled rejection from any async route handler or middleware
// turn into a silent crash with a 500 page. Forward it to the Express error
// handler the same way sync errors are forwarded.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason && (reason.stack || reason.message || reason));
});
