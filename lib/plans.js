'use strict';

/**
 * The packages the site offers.
 *
 * One source of truth: /plan, the homepage plan grid and the member dashboard
 * all read this list, so a client can never be offered a package in the
 * investment form that the plan page does not advertise (or the reverse).
 */

const money = (value) => '$' + Number(value).toLocaleString('en-US');

const STANDARD = [
  { code: 'starter', name: 'Starter Plan', dailyRate: 1.5, days: 30, min: 100, max: 4999 },
  { code: 'golden', name: 'Golden Plan', dailyRate: 2.5, days: 30, min: 5000, max: 99999, featured: true },
  { code: 'ultimate', name: 'Ultimate Plan', dailyRate: 3.5, days: 30, min: 10000, max: 19999 },
  { code: 'premium', name: 'Premium Plan', dailyRate: 4.5, days: 30, min: 20000, max: 39999 },
  { code: 'index', name: 'Index Plan', dailyRate: 5.5, days: 30, min: 40000, max: 49999 },
  { code: 'vip', name: 'VIP Plan', dailyRate: 6.6, days: 30, min: 50000, max: null }
];

const ESTATE = [
  { code: 'skylight', name: 'The Skylight Manor', monthlyRate: 22, days: 30, min: 200000, max: 1200000, img: 'property-1.jpg' },
  { code: 'cedarstone', name: 'Cedarstone Residence', monthlyRate: 18, days: 30, min: 100000, max: 750000, img: 'property-2.jpg' },
  { code: 'montclair', name: 'The Haven at Montclair', monthlyRate: 15, days: 30, min: 50000, max: 500000, img: 'property-3.jpg' }
];

function present(plan, kind) {
  const roi = kind === 'estate' ? plan.monthlyRate : plan.dailyRate;
  const rateLabel = roi + '%';
  return {
    code: plan.code,
    name: plan.name,
    kind,
    featured: Boolean(plan.featured),
    days: plan.days,
    min: plan.min,
    max: plan.max,
    minLabel: money(plan.min),
    maxLabel: plan.max == null ? 'Unlimited' : money(plan.max),
    rateLabel,
    // What the package returns once it matures, on the smallest ticket.
    totalLabel: roi + '% ' + (kind === 'estate' ? 'per month' : 'daily for ' + plan.days + ' days'),
    img: plan.img || null,
    // Display strings the existing plan grid expects.
    rate: rateLabel,
    minText: money(plan.min),
    maxText: plan.max == null ? 'Unlimited' : money(plan.max)
  };
}

const standard = STANDARD.map((plan) => present(plan, 'standard'));
const estate = ESTATE.map((plan) => present(plan, 'estate'));
const all = standard.concat(estate);

function find(code) {
  const wanted = String(code || '').trim().toLowerCase();
  return all.find((plan) => plan.code === wanted) || null;
}

module.exports = { standard, estate, all, find, money };
