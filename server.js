const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');

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
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

async function readAccount() {
  try {
    return JSON.parse(await fs.readFile(accountFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(dataDirectory, { recursive: true });
    const account = initialAccount();
    await writeAccount(account);
    return account;
  }
}

async function writeAccount(account) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${accountFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(account, null, 2));
  await fs.rename(temporaryFile, accountFile);
}

async function getMarkets() {
  if (Date.now() - marketCache.updatedAt < 30_000) return marketCache;

  try {
    const url = new URL('https://api.coingecko.com/api/v3/simple/price');
    url.searchParams.set('ids', Object.values(marketIds).join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
    const data = await response.json();
    const assets = fallbackMarkets.map((asset) => {
      const quote = data[marketIds[asset.symbol]];
      if (!quote || !Number.isFinite(quote.usd)) throw new Error('Market provider response was incomplete');
      return {
        ...asset,
        price: quote.usd,
        change24h: Number.isFinite(quote.usd_24h_change) ? quote.usd_24h_change : 0
      };
    });
    marketCache = { updatedAt: Date.now(), assets, source: 'live' };
  } catch {
    marketCache = { ...marketCache, updatedAt: Date.now(), source: 'demo' };
  }

  return marketCache;
}

function round(value, places = 8) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getAsset(symbol, markets) {
  return markets.assets.find((asset) => asset.symbol === symbol);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/templatemo-622-clearwave.css', (req, res) => res.sendFile(path.join(__dirname, 'templatemo-622-clearwave.css')));
app.get('/templatemo-622-clearwave.js', (req, res) => res.sendFile(path.join(__dirname, 'templatemo-622-clearwave.js')));
app.use('/images', express.static(path.join(__dirname, 'images'), { fallthrough: false }));

app.get('/api/overview', async (req, res, next) => {
  try {
    const [account, markets] = await Promise.all([readAccount(), getMarkets()]);
    const positions = markets.assets.map((asset) => ({
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
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const { side, symbol, amountUsd } = req.body || {};
    const amount = Number(amountUsd);
    if (!['buy', 'sell'].includes(side) || !allowedAssets.includes(symbol) || !Number.isFinite(amount) || amount < 5 || amount > 1_000_000) {
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
      if (quantity > (account.holdings[symbol] || 0)) return res.status(400).json({ error: `Not enough ${symbol} in this demo portfolio to sell that amount.` });
      account.cashUsd = round(account.cashUsd + amount - fee, 2);
      account.holdings[symbol] = round(account.holdings[symbol] - quantity);
    }

    const order = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      side,
      symbol,
      quantity,
      price: asset.price,
      amountUsd: amount,
      feeUsd: fee,
      createdAt: new Date().toISOString()
    };
    account.ledger.unshift(order);
    account.ledger = account.ledger.slice(0, 100);
    await writeAccount(account);
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cash', async (req, res, next) => {
  try {
    const { action, amountUsd } = req.body || {};
    const amount = Number(amountUsd);
    if (!['add', 'withdraw'].includes(action) || !Number.isFinite(amount) || amount < 10 || amount > 100_000) {
      return res.status(400).json({ error: 'Enter a demo amount between $10 and $100,000.' });
    }
    const account = await readAccount();
    if (action === 'withdraw' && amount > account.cashUsd) {
      return res.status(400).json({ error: 'That amount exceeds the available demo cash balance.' });
    }
    account.cashUsd = round(account.cashUsd + (action === 'add' ? amount : -amount), 2);
    account.ledger.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      side: action === 'add' ? 'cash added' : 'cash withdrawn',
      symbol: 'USD',
      amountUsd: amount,
      createdAt: new Date().toISOString()
    });
    account.ledger = account.ledger.slice(0, 100);
    await writeAccount(account);
    res.status(201).json({ cashUsd: account.cashUsd });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reset', async (req, res, next) => {
  try {
    const account = initialAccount();
    await writeAccount(account);
    res.json({ reset: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'paper-trading' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  res.status(500).json({ error: 'The service could not complete that request.' });
});

app.listen(port, () => {
  console.log(`Clearwave paper investing service listening on http://localhost:${port}`);
});
