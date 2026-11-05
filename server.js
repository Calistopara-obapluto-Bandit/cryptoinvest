const express = require('express');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const ejs = require('ejs');

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
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

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
const servicePages = {
  '/services/commodities-gold': { view: 'services/commodities-gold', title: 'Commodities & Gold — Global Mass Funds', description: 'Simulate spot gold, silver, and energy markets with the same paper simulator used for crypto.' },
  '/services/cryptocurrency': { view: 'services/cryptocurrency', title: 'Cryptocurrency — Global Mass Funds', description: 'Trade BTC, ETH, SOL, and more with paper funds.' },
  '/services/real-estate': { view: 'services/real-estate', title: 'Real Estate — Global Mass Funds', description: 'Simulate residential, commercial, and mixed-use property deals with demo cash.' },
  '/services/stock-etfs': { view: 'services/stock-etfs', title: 'Stock & ETFs — Global Mass Funds', description: 'Trade individual stocks, broad market ETFs, and index funds with the same leveled demo portfolio.' },
  '/services/loan': { view: 'services/loan', title: 'Loan — Global Mass Funds', description: 'Practice borrowing, amortization, and debt service with paper cash.' },
  '/services/card': { view: 'services/card', title: 'Card — Global Mass Funds', description: 'Simulate a premium credit card with grace periods, APR, rewards, and balance management.' },
  '/services/membership': { view: 'services/membership', title: 'Membership ID — Global Mass Funds', description: 'Your unified access key. One Membership ID covers every market.' },
  '/services/staking': { view: 'services/staking', title: 'Staking — Global Mass Funds', description: 'Earn demo yields on BTC, ETH, SOL, and more.' }
};

app.get('/', (req, res) => { res.render('index'); });
app.get('/services', (req, res) => {
  res.render('services', {
    title: 'Services — Global Mass Funds',
    description: 'Explore Global Mass Funds services — commodities & gold, cryptocurrency, real estate, stock & ETFs, loan, card, membership ID, and staking.'
  });
});
Object.keys(servicePages).forEach((route) => {
  const page = servicePages[route];
  app.get(route, (req, res) => {
    res.render(page.view, { title: page.title, description: page.description });
  });
});

// The old standalone real-estate page now lives under /services.
app.get('/real-estate', (req, res) => res.redirect(301, '/services/real-estate'));

app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => res.render('contact'));

app.get('/testimonials', (req, res) => {
  res.render('testimonials', {
    title: 'Reviews — Global Mass Funds',
    description: 'What traders say about using Global Mass Funds paper trading to build discipline before going live.'
  });
});

const legalPages = {
  '/privacy': {
    title: 'Privacy Policy — Global Mass Funds',
    description: 'How Global Mass Funds handles information on the paper trading demo.',
    heading: 'Privacy Policy',
    sections: [
      { h: 'What this demo collects', p: 'The paper trading demo stores a single simulated account record on the server: a demo cash balance, demo holdings, and a trade ledger. No real money, payment details, or brokerage credentials are collected.' },
      { h: 'Market data', p: 'Live price quotes are requested from a public market data provider. Those requests contain asset identifiers only — never your account details.' },
      { h: 'Cookies and analytics', p: 'The demo does not set advertising cookies and does not run third-party tracking scripts. Session state lives on the server, not in your browser.' },
      { h: 'Contact', p: 'Questions about this policy can go to sales@gmfunds.example and will be answered by the GMF Sales desk.' }
    ]
  },
  '/terms': {
    title: 'Terms of Service — Global Mass Funds',
    description: 'Terms for using the Global Mass Funds paper trading demo.',
    heading: 'Terms of Service',
    sections: [
      { h: 'Simulation only', p: 'Global Mass Funds is a paper trading demonstration. All balances, orders, positions, and returns shown are simulated. Nothing on this site is an offer to buy or sell a financial instrument.' },
      { h: 'No financial advice', p: 'Plan tiers, yields, and property figures describe the simulator only. They are not investment advice and must not be relied on as a forecast of real returns.' },
      { h: 'Acceptable use', p: 'Do not use the demo to attempt to disrupt the service, probe systems you are not authorised to access, or present simulated results as real trading performance.' },
      { h: 'Changes', p: 'The demo, its plans, and these terms may change as the simulator evolves. Continued use after a change means you accept the updated terms.' }
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

// 404 / error handling last.
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  res.status(500).json({ error: 'The service could not complete that request.' });
});

app.listen(port, () => {
  console.log('Global Mass Funds paper investing service listening on http://localhost:' + port);
});
