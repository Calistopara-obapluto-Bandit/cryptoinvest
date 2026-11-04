import React from 'react';

const Nav = () => (
  <header className="nav">
    <div className="nav-inner">
      <a href="#" className="nav-logo">GMF<span className="accent-light">Funds</span></a>
      <ul className="nav-links">
        <li><a href="#hero">Home</a></li>
        <li><a href="#plans">Plans</a></li>
        <li><a href="#real-estate">Real Estate</a></li>
        <li><a href="#testimonials">Reviews</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
      <div className="nav-cta"><a href="#contact" className="btn-primary">Get Started</a></div>
    </div>
  </header>
);

export default function App() {
  return (
    <div className="App">
      <Nav />
      <main>

      <section className="hero" id="hero">
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badge"><span className="hero-badge-dot">✦</span> Build <strong>paper-rich</strong> portfolios with confidence</div>
            <h1 className="hero-title">Simulate real markets,<br/><em>risk-free</em> in your browser.</h1>
            <p className="hero-sub">Paper trading lets you test strategies, track live crypto moves, and learn the market — no capital at stake.</p>
            <div className="hero-actions">
              <a href="#plans" className="btn-primary-lg">Choose a Plan<span className="btn-arrow">→</span></a>
              <a href="#contact" className="btn-outline-lg"><span>▶</span> Talk to an advisor</a>
            </div>
          </div>
        </div>
      </section>

      <section className="gmf-video" id="video">
        <img src="https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" alt="How Global Mass Funds works" />
      </section>

      <section className="features-section" id="benefits">
        <div className="container">
          <div className="features-header">
            <div className="section-label">Why Traders Trust Us</div>
            <h2 className="section-title">Build skills before you <em>risk real money</em></h2>
            <p className="section-sub">Paper trading gives you the same speed, size, and feedback as live markets — without the regret.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginTop: '32px' }}>
            <div className="gmf-benefit-card">
              <div className="gmf-benefit-icon">📈</div>
              <div className="gmf-benefit-title">Live market feeds</div>
              <p className="gmf-benefit-desc">Real-time BTC, ETH, and SOL quotes with 24h change and volume — exactly what you'd see on an exchange.</p>
            </div>
            <div className="gmf-benefit-card">
              <div className="gmf-benefit-icon">🎯</div>
              <div className="gmf-benefit-title">Risk-free practice</div>
              <p className="gmf-benefit-desc">Execute simulated orders, track your P&amp;L, and refine your strategy until it's second nature.</p>
            </div>
            <div className="gmf-benefit-card">
              <div className="gmf-benefit-icon">🛡️</div>
              <div className="gmf-benefit-title">No capital at risk</div>
              <p className="gmf-benefit-desc">Paper funds only. No real loss, no regret — just the muscle memory you need for the live market.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-section" id="plans">
        <div className="container">
          <div className="pricing-header">
            <div className="section-label">Investment Plans</div>
            <h2 className="section-title">Pick your <em>rank</em></h2>
            <p className="section-sub">Daily compounded profit on BTC, ETH, and SOL — from starter to premium.</p>
          </div>
          <div className="price-toggle">
            <span className="toggle-label active">Daily</span>
            <div className="toggle-switch" role="switch" tabindex="0" aria-label="Toggle daily compounding"></div>
            <span className="toggle-label">Monthly</span>
            <span className="toggle-badge">Compounds daily</span>
          </div>
          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="pricing-tier">Starter</div>
              <div className="pricing-price">5% <small>/ day</small></div>
              <div className="pricing-desc">For anyone starting paper trading.</div>
              <div className="pricing-features">
                <div className="pricing-feature"><span>Min deposit $100</span></div>
                <div className="pricing-feature"><span>Max balance $2,500</span></div>
                <div className="pricing-feature"><span>BTC · ETH · SOL</span></div>
              </div>
              <a href="#contact" className="pricing-cta">Choose Starter</a>
            </div>
            <div className="pricing-card featured">
              <div className="pricing-badge">Recommended</div>
              <div className="pricing-tier">Golden</div>
              <div className="pricing-price">12% <small>/ day</small></div>
              <div className="pricing-desc">Best balance of access and limits.</div>
              <div className="pricing-features">
                <div className="pricing-feature"><span>Min deposit $500</span></div>
                <div className="pricing-feature"><span>Max balance $10,000</span></div>
                <div className="pricing-feature"><span>BTC · ETH · SOL · Demo</span></div>
              </div>
              <a href="#contact" className="pricing-cta">Choose Golden</a>
            </div>
            <div className="pricing-card">
              <div className="pricing-tier">Ultimate</div>
              <div className="pricing-price">18% <small>/ day</small></div>
              <div className="pricing-desc">All demo markets.</div>
              <div className="pricing-features">
                <div className="pricing-feature"><span>Min deposit $2,000</span></div>
                <div className="pricing-feature"><span>Max balance $50,000</span></div>
                <div className="pricing-feature"><span>All demo markets</span></div>
              </div>
              <a href="#contact" className="pricing-cta">Choose Ultimate</a>
            </div>
            <div className="pricing-card">
              <div className="pricing-tier">Premium</div>
              <div className="pricing-price">22% <small>/ day</small></div>
              <div className="pricing-desc">All markets plus credit.</div>
              <div className="pricing-features">
                <div className="pricing-feature"><span>Min deposit $5,000</span></div>
                <div className="pricing-feature"><span>Max balance $150,000</span></div>
                <div className="pricing-feature"><span>All markets + credit</span></div>
              </div>
              <a href="#contact" className="pricing-cta">Choose Premium</a>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section" id="real-estate">
        <div className="container">
          <div className="features-header">
            <div className="section-label">Real Estate Portfolio</div>
            <h2 className="section-title">Diversify beyond <em>the crypto chart</em></h2>
            <p className="section-sub">Trade simulation on real-world property deals alongside your crypto paper accounts.</p>
          </div>
          <div className="real-estate-grid">
            <div className="prop-card">
              <div className="prop-img"><span className="prop-tag">Residential</span>
                <div className="prop-body">
                  <div className="prop-roi">14.2%</div>
                  <div className="prop-price">$840,000</div>
                  <div className="prop-meta"><span>12 units</span><span>Austin, TX</span><span>5.8% cap rate</span></div>
                  <a href="#contact" className="prop-cta">View Deal</a>
                </div>
              </div>
            </div>
            <div className="prop-card">
              <div className="prop-img"><span className="prop-tag">Commercial</span>
                <div className="prop-body">
                  <div className="prop-roi">9.6%</div>
                  <div className="prop-price">$2.1M</div>
                  <div className="prop-meta"><span>14,400 sqft</span><span>Chicago, IL</span><span>8.1% yield</span></div>
                  <a href="#contact" className="prop-cta">View Deal</a>
                </div>
              </div>
            </div>
            <div className="prop-card">
              <div className="prop-img"><span className="prop-tag">Mixed Use</span>
                <div className="prop-body">
                  <div className="prop-roi">16.8%</div>
                  <div className="prop-price">$1.4M</div>
                  <div className="prop-meta"><span>32 units</span><span>Phoenix, AZ</span><span>6.4% cap rate</span></div>
                  <a href="#contact" className="prop-cta">View Deal</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="testimonials-section" id="testimonials">
        <div className="container">
          <div className="testimonials-header">
            <div className="section-label">What Traders Say</div>
            <h2 className="section-title">Paper trading, <em>done right</em></h2>
            <p className="section-sub">Thousands of traders have honed their edge before going live.</p>
          </div>
          <div className="testimonials-grid">
            <div className="testimonial-card">
              <div className="quote-stars">★★★★★</div>
              <p className="quote">"I went from watching crypto videos to placing real simulated orders in under an hour. The demo balance gives me room to make mistakes without guilt."</p>
              <div className="author"><div className="avatar">SK</div><div><div className="author-name">Sarah Kim</div><div className="author-role">Day Trader · NY</div></div></div>
            </div>
            <div className="testimonial-card">
              <div className="quote-stars">★★★★★</div>
              <p className="quote">"Better than any tutorial. I learned position sizing, stop-loss habits, and how fees actually eat into a trade — all with fake money."</p>
              <div className="author"><div className="avatar">DC</div><div><div className="author-name">David Chen</div><div className="author-role">Portfolio Manager · Singapore</div></div></div>
            </div>
            <div className="testimonial-card">
              <div className="quote-stars">★★★★★</div>
              <p className="quote">"I used the ledger to review every trade for three weeks. My win rate went from 42% to 68% before I touched real cash."</p>
              <div className="author"><div className="avatar">JL</div><div><div className="author-name">Julia Lopez</div><div className="author-role">Crypto Trader · Buenos Aires</div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="container">
          <div className="features-header">
            <div className="section-label">4 Steps to Paper Trading</div>
            <h2 className="section-title">From zero to <em>live practice</em></h2>
            <p className="section-sub">No sign-up friction. Just pick a plan and start simulating.</p>
          </div>
          <div className="step-list">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-title">Pick a plan</div>
              <div className="step-desc">Choose Starter, Golden, Ultimate, or Premium — each unlocks different asset markets and balance caps.</div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-title">Fund your demo account</div>
              <div className="step-desc">Add between $100 and $100,000 of pretend cash. Top up or withdraw anytime from your dashboard.</div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div className="step-title">Trade live markets</div>
              <div className="step-desc">Buy and sell BTC, ETH, and SOL with live prices. Watch your ledger fill up with every order.</div>
            </div>
            <div className="step">
              <div className="step-num">4</div>
              <div className="step-title">Review and repeat</div>
              <div className="step-desc">Track pnl, read your trade journal, and scale up only when your strategy is proven.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="calculator-section">
        <div className="container">
          <div className="calculator-grid">
            <div className="calculator-card">
              <div className="calculator-value">1,000 <small>USD</small></div>
              <div className="calculator-label">Starting Balance</div>
              <div className="calculator-sub">Per plan</div>
            </div>
            <div className="calculator-card">
              <div className="calculator-value">24 <small>hrs</small></div>
              <div className="calculator-label">Trading Simulation</div>
              <div className="calculator-sub">Live 24h market ticks</div>
            </div>
            <div className="calculator-card">
              <div className="calculator-value">0.10 <small>%</small></div>
              <div className="calculator-label">Paper Fee per Order</div>
              <div className="calculator-sub">Excluded from demo profit</div>
            </div>
            <div className="calculator-card">
              <div className="calculator-value">12 <small>%</small></div>
              <div className="calculator-label">Daily Plan Yield</div>
              <div className="calculator-sub">Apply after qualifying trades</div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section" id="contact">
        <div className="container">
          <div className="faq-inner">
            <div className="faq-sidebar">
              <div className="section-label">Contact</div>
              <h2 className="section-title">Get in touch <em>with a GMF rep</em></h2>
              <p className="section-sub">Ask about plans, risk controls, or how to set up your first simulated portfolio.</p>
            </div>
            <div className="faq-list" id="contact-list">
              <div className="faq-item">
                <div className="faq-question" tabindex="0" role="button" aria-expanded="false">Which plans include demo cash?<div className="faq-icon">+</div></div>
                <div className="faq-answer"><div className="faq-answer-inner">Every plan starts with $100–$100,000 of demo cash. Golden includes an extra $500 welcome top-up.</div></div>
              </div>
              <div className="faq-item">
                <div className="faq-question" tabindex="0" role="button" aria-expanded="false">How do I withdraw my profit?<div className="faq-icon">+</div></div>
                <div className="faq-answer"><div className="faq-answer-inner">Cash out to your bank via the demo dashboard. Withdrawals settle in 1–3 business days for paper funds.</div></div>
              </div>
              <div className="faq-item">
                <div className="faq-question" tabindex="0" role="button" aria-expanded="false">What assets can I trade?<div className="faq-icon">+</div></div>
                <div className="faq-answer"><div className="faq-answer-inner">BTC, ETH, SOL, and additional demo markets scale up as you move to higher plans.</div></div>
              </div>
              <div className="faq-item">
                <div className="faq-question" tabindex="0" role="button" aria-expanded="false">Is there a time limit on demo accounts?<div className="faq-icon">+</div></div>
                <div className="faq-answer"><div className="faq-answer-inner">Demo cash stays active as long as you hold an active plan. Pause the plan and balances pause too.</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="contacts">
        <div className="container">
          <div className="contact-grid">
            <div className="contact-box">
              <div className="contact-label">Representative</div>
              <div className="contact-name">Elena Voss</div>
              <div className="contact-role">Head of Trader Education</div>
              <div className="contact-value"><span>Email</span> elena.gmf@gmail.com</div>
              <div className="contact-value"><span>Phone</span> +1 (555) 019-2847</div>
              <div className="contact-value"><span>Office</span> 9:00 AM – 6:00 PM UTC</div>
            </div>
            <div className="contact-box">
              <div className="contact-label">Sales</div>
              <div className="contact-name">GMF Sales</div>
              <div className="contact-role">Plan & Account Support</div>
              <div className="contact-value"><span>Email</span> sales@gmfunds.example</div>
              <div className="contact-value"><span>Live chat</span> Chat opens in &lt;30s</div>
              <div className="contact-value"><span>Support hours</span> 24/7 for Gold+</div>
            </div>
          </div>
        </div>
      </section>

      <section className="newsletter">
        <div className="newsletter-text">
          <div className="newsletter-title">Trade with the market, not against it</div>
          <div className="newsletter-sub">Get one lesson a week on paper trading, risk control, and live crypto moves — before it changes your real portfolio.</div>
        </div>
        <form className="newsletter-form">
          <input className="newsletter-input" type="email" placeholder="Enter your email" aria-label="Email address" />
          <button className="newsletter-btn" type="submit">Subscribe</button>
        </form>
      </section>

      <section className="cta-section">
        <div className="container">
          <div className="cta-inner">
            <div className="cta-content">
              <div className="cta-label">Start Paper Trading Today</div>
              <h2 className="cta-title">Practice with fake cash, <em>trade with confidence</em></h2>
              <p className="cta-sub">Join 12k+ traders who simulate BTC, ETH, and SOL before going live.</p>
            </div>
            <div className="cta-actions">
              <a href="#contact" className="btn-cta-primary">Choose a Plan<span>→</span></a>
              <a href="#contact" className="btn-cta-ghost">Talk to an advisor</a>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#" className="nav-logo">GMF<span className="accent-light">Funds</span></a>
            <p className="footer-brand-desc">Paper trading demo with live crypto markets — practice before you commit real capital.</p>
            <div className="footer-socials">
              <a href="#" className="social-btn" aria-label="Twitter / X"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
              <a href="#" className="social-btn" aria-label="LinkedIn"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
              <a href="#" className="social-btn" aria-label="YouTube"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
              <a href="#" className="social-btn" aria-label="TikTok"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></a>
            </div>
          </div>
          <div>
            <div className="footer-col-label">Product</div>
            <div className="footer-links"><a href="#plans">Plans</a><a href="#real-estate">Real Estate</a><a href="#testimonials">Reviews</a><a href="#contact">Contact</a></div>
          </div>
          <div>
            <div className="footer-col-label">Company</div>
            <div className="footer-links"><a href="#">About</a><a href="#">Blog</a><a href="#">Careers</a><a href="#">Press Kit</a><a href="#">Status</a></div>
          </div>
          <div>
            <div className="footer-col-label">Support</div>
            <div className="footer-links"><a href="#">Help Center</a><a href="#">Documentation</a><a href="#">Security</a><a href="#">Contact</a><a href="#">Community</a></div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">© 2025 Global Mass Funds. Paper trading demo inspired by globalmassfunds.com — design by TemplateMo.</div>
          <div className="footer-legal"><a href="#">Privacy Policy</a><a href="#">Terms of Service</a><a href="#">Cookie Policy</a></div>
        </div>
      </div>
    </footer>
  </div>
);
}
