// Points Rescue: a small static US directory of official missed-rewards instructions.
// Recognition and preparation only. Eligibility is decided by each restaurant.

import { formatMoney } from './money.js';

export const VERIFIED_ON = '2026-10-24';

/**
 * @typedef {{id: string, name: string, program: string, aliases: string[],
 *   links: {label: string, href: string, note?: string}[], steps: string[],
 *   requirements: string[], fields: ('storeNumber'|'dateText'|'timeText'|'orderNumber'|'receiptTotal')[],
 *   verifiedOn: string}} RewardsEntry
 */

/** @type {RewardsEntry[]} */
export const DIRECTORY = [
  {
    id: 'chickfila', name: 'Chick-fil-A', program: 'Chick-fil-A One', aliases: ['chickfila'],
    links: [
      { label: 'View Chick-fil-A instructions', href: 'https://www.chick-fil-a.com/forgottoscan' },
      { label: 'Missed-transaction FAQ', href: 'https://www.chick-fil-a.com/customer-support/ordering-and-payment/missed-transactions/can-i-receive-points-for-my-purchase-if-i-forgot-to-scan' },
    ],
    steps: ['Sign in to your Chick-fil-A One account on the official page.', 'Enter the receipt details below.'],
    requirements: [
      'Transaction less than 30 days old, with a readable retained receipt.',
      'A Chick-fil-A One account is required on Chick-fil-A’s site.',
      'One transaction per submission per day; Chick-fil-A also mentions a lifetime limit.',
      'Approval and points are decided by Chick-fil-A.',
    ],
    fields: ['storeNumber', 'dateText', 'orderNumber', 'receiptTotal'],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: 'mcdonalds', name: 'McDonald’s', program: 'MyMcDonald’s Rewards (US)', aliases: ['mcdonalds'],
    links: [{ label: 'View McDonald’s rewards FAQ', href: 'https://www.mcdonalds.com/us/en-us/faq/mymcdonalds-rewards.html' }],
    steps: ['In the McDonald’s app: More → Add Missing Points from Receipt → Enter Receipt Details.'],
    requirements: [
      'Physical receipt and an opted-in rewards account.',
      'Submit within 7 days; limited to one receipt every 30 days.',
      'Provider says submissions may take 1–6 days to appear.',
    ],
    fields: ['storeNumber', 'dateText', 'timeText', 'orderNumber', 'receiptTotal'],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: 'wendys', name: 'Wendy’s', program: 'Wendy’s Rewards (US)', aliases: ['wendys'],
    links: [
      { label: 'View Wendy’s receipt instructions', href: 'https://www.wendys.com/rewards', note: 'Current route: Earn → Claim Receipt Rewards → scan the receipt barcode or enter its code. Check current receipt-claim conditions there.' },
      { label: 'Missing-points form — separate conditions', href: 'https://www.wendys.com/mobile-rewards-redemption-form', note: 'This form only: within 24 hours, one claim per 24 hours and four per month, up to 100 points.' },
    ],
    steps: ['Use the receipt route in the Wendy’s app, or the separate form if it applies.'],
    requirements: [
      'A Wendy’s Rewards account is required.',
      'Each route has its own conditions; no single deadline applies to every route.',
    ],
    fields: ['storeNumber', 'dateText', 'timeText', 'orderNumber', 'receiptTotal'],
    verifiedOn: VERIFIED_ON,
  },
];

/** Lowercase, drop punctuation inside words, split into tokens. */
function tokens(name) {
  return String(name ?? '').toLowerCase().replace(/['’`.\-]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Match a merchant header name to a directory entry. A full alias must equal the
 * leading tokens of the name; partial words (e.g. "Wendy burger") never match.
 * @param {string} merchant
 * @returns {RewardsEntry|null}
 */
export function matchMerchant(merchant) {
  const t = tokens(merchant);
  if (!t.length) return null;
  for (const entry of DIRECTORY) {
    for (const alias of entry.aliases) {
      for (let k = 1; k <= Math.min(t.length, 3); k++) {
        if (t.slice(0, k).join('') === alias) return entry;
      }
    }
  }
  return null;
}

const FIELD_NAMES = { storeNumber: 'Restaurant / store number', dateText: 'Date', timeText: 'Time', orderNumber: 'Order number', receiptTotal: 'Receipt total' };

/**
 * Receipt detail pack, using the receipt's own printed total (never the paid amount with added tip).
 * @param {RewardsEntry} entry
 * @param {{storeNumber: string, dateText: string, timeText: string, orderNumber: string, receiptTotalCents: number|null, sampleDisclaimer?: boolean}} receipt
 * @param {boolean} sample
 */
export function receiptDetails(entry, receipt, sample) {
  const rows = entry.fields.map(f => {
    const value = f === 'receiptTotal'
      ? (receipt.receiptTotalCents === null ? '' : formatMoney(receipt.receiptTotalCents))
      : receipt[f];
    return { label: FIELD_NAMES[f], value: value || 'not recognized' };
  });
  const text = [
    ...(sample ? ['DO NOT SUBMIT — SAMPLE'] : []),
    `${entry.name} receipt details`,
    ...rows.map(r => `${r.label}: ${r.value}`),
  ].join('\n');
  return { rows, text };
}
