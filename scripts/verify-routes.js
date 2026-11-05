// Boots server.js on an ephemeral port, checks every page route renders the
// shared head/nav/footer, then exits. Run with: node scripts/verify-routes.js
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;

const routes = [
  '/',
  '/services',
  '/services/commodities-gold',
  '/services/cryptocurrency',
  '/services/real-estate',
  '/services/stock-etfs',
  '/services/loan',
  '/services/card',
  '/services/membership',
  '/services/staking',
  '/about',
  '/contact',
  '/testimonials',
  '/privacy',
  '/terms'
];

const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { PORT: String(PORT), PATH: '/usr/local/bin:/usr/bin:/bin' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d.toString(); });
child.stderr.on('data', (d) => { serverLog += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  throw new Error('Server did not become ready.\n' + serverLog);
}

async function check(route) {
  const res = await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(5000) });
  const html = await res.text();
  return {
    status: res.status,
    title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '(none)',
    nav: (html.match(/id="site-nav"/g) || []).length,
    footer: (html.match(/class="footer"/g) || []).length,
    dropdown: (html.match(/id="services-panel"/g) || []).length,
    mobileMenu: (html.match(/id="mobile-menu"/g) || []).length,
    scripts: (html.match(/\/gmf\.js/g) || []).length
  };
}

(async () => {
  try {
    await waitForServer();
    let failures = 0;
    for (const route of routes) {
      const r = await check(route);
      const ok = r.status === 200 && r.nav === 1 && r.footer === 1 && r.dropdown === 1 && r.mobileMenu === 1 && r.scripts === 1;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${route.padEnd(30)} ${r.status} nav:${r.nav} footer:${r.footer} drop:${r.dropdown} menu:${r.mobileMenu} js:${r.scripts}  ${r.title}`
      );
    }

    // Redirect + API + stale asset checks
    const redirect = await fetch(`${BASE}/real-estate`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    console.log(`\n/real-estate -> ${redirect.status} ${redirect.headers.get('location')}`);
    const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    console.log(`/api/health -> ${health.status} ${await health.text()}`);
    const overview = await fetch(`${BASE}/api/overview`, { signal: AbortSignal.timeout(15000) });
    const body = await overview.json();
    console.log(`/api/overview -> ${overview.status} cash=${body.account && body.account.cashUsd} marketSource=${body.marketSource}`);
    const stale = await fetch(`${BASE}/src/main.tsx`, { signal: AbortSignal.timeout(5000) });
    console.log(`/src/main.tsx -> ${stale.status} (expected 404)`);

    console.log(`\n${failures === 0 ? 'All page routes rendered with consistent layout.' : failures + ' route(s) failed layout checks.'}`);
    child.kill();
    process.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    child.kill();
    process.exit(1);
  }
})();
