// Rewards finder: a static US directory of restaurant loyalty programs, matched from the
// receipt's own header text or printed website. Recognition and links only — SplitCore never
// signs in, submits claims, checks eligibility or predicts points.

import { formatMoney } from './money.js';

export const VERIFIED_ON = '2026-10-24';

/**
 * @typedef {{
 *   id: string, name: string, program: string, category: string,
 *   aliases: string[], domains: string[], url: string,
 *   claim?: { links: {label: string, href: string, note?: string}[], steps: string[], requirements: string[],
 *     fields: ('storeNumber'|'dateText'|'timeText'|'orderNumber'|'receiptTotal')[] }
 * }} RewardsEntry
 */

/**
 * Every `url` was loaded on VERIFIED_ON and showed the program or its sign-up page.
 * Program names come from those pages; where a page did not state one, a plain
 * descriptive name ("Burger King rewards") is used instead of guessing a brand term.
 * @type {RewardsEntry[]}
 */
export const DIRECTORY = [
  {
    id: 'chickfila', name: 'Chick-fil-A', program: 'Chick-fil-A One', category: 'Chicken',
    aliases: ['chickfila'], domains: ['chick-fil-a.com'], url: 'https://www.chick-fil-a.com/one',
    claim: {
      links: [
        { label: 'Add a missed visit', href: 'https://www.chick-fil-a.com/forgottoscan' },
        { label: 'Missed-transaction FAQ', href: 'https://www.chick-fil-a.com/customer-support/ordering-and-payment/missed-transactions/can-i-receive-points-for-my-purchase-if-i-forgot-to-scan' },
      ],
      steps: ['Sign in to Chick-fil-A One on the official page.', 'Enter the receipt details below.'],
      requirements: [
        'Transaction less than 30 days old, with a readable receipt you kept.',
        'One transaction per submission per day; Chick-fil-A also mentions a lifetime limit.',
        'Approval and points are decided by Chick-fil-A.',
      ],
      fields: ['storeNumber', 'dateText', 'orderNumber', 'receiptTotal'],
    },
  },
  {
    id: 'mcdonalds', name: 'McDonald’s', program: 'MyMcDonald’s Rewards', category: 'Burgers',
    aliases: ['mcdonalds'], domains: ['mcdonalds.com'], url: 'https://www.mcdonalds.com/us/en-us/mymcdonalds.html',
    claim: {
      links: [{ label: 'Rewards FAQ (receipts)', href: 'https://www.mcdonalds.com/us/en-us/faq/mymcdonalds-rewards.html' }],
      steps: ['In the McDonald’s app: More → Add Missing Points from Receipt → Enter Receipt Details.'],
      requirements: [
        'Physical receipt and an opted-in rewards account.',
        'Submit within 7 days; limited to one receipt every 30 days.',
        'McDonald’s says points may take 1–6 days to appear.',
      ],
      fields: ['storeNumber', 'dateText', 'timeText', 'orderNumber', 'receiptTotal'],
    },
  },
  {
    id: 'wendys', name: 'Wendy’s', program: 'Wendy’s Rewards', category: 'Burgers',
    aliases: ['wendys'], domains: ['wendys.com'], url: 'https://www.wendys.com/rewards',
    claim: {
      links: [
        { label: 'Receipt-claim instructions', href: 'https://www.wendys.com/rewards', note: 'Current route: Earn → Claim Receipt Rewards → scan the receipt barcode or enter its code.' },
        { label: 'Missing-points form', href: 'https://www.wendys.com/mobile-rewards-redemption-form', note: 'This form only: within 24 hours, one claim per 24 hours and four per month, up to 100 points.' },
      ],
      steps: ['Use the receipt route in the Wendy’s app, or the separate form if it applies.'],
      requirements: ['Each route has its own conditions; no single deadline applies to every route.'],
      fields: ['storeNumber', 'dateText', 'timeText', 'orderNumber', 'receiptTotal'],
    },
  },
  { id: 'starbucks', name: 'Starbucks', program: 'Starbucks Rewards', category: 'Coffee', aliases: ['starbucks', 'starbuckscoffee'], domains: ['starbucks.com'], url: 'https://www.starbucks.com/rewards' },
  { id: 'dominos', name: 'Domino’s', program: 'Domino’s Rewards', category: 'Pizza', aliases: ['dominos', 'dominospizza'], domains: ['dominos.com'], url: 'https://www.dominos.com/my-deals-and-rewards' },
  { id: 'pizzahut', name: 'Pizza Hut', program: 'Hut Rewards', category: 'Pizza', aliases: ['pizzahut'], domains: ['pizzahut.com'], url: 'https://www.pizzahut.com/rewards' },
  { id: 'papajohns', name: 'Papa Johns', program: 'Papa Rewards', category: 'Pizza', aliases: ['papajohns'], domains: ['papajohns.com'], url: 'https://www.papajohns.com/papa-rewards/' },
  { id: 'blaze', name: 'Blaze Pizza', program: 'Blaze Rewards', category: 'Pizza', aliases: ['blazepizza'], domains: ['blazepizza.com'], url: 'https://www.blazepizza.com/rewards' },
  { id: 'mod', name: 'MOD Pizza', program: 'MOD Rewards', category: 'Pizza', aliases: ['modpizza'], domains: ['modpizza.com'], url: 'https://modpizza.com/rewards/' },
  { id: 'tacobell', name: 'Taco Bell', program: 'Taco Bell Rewards', category: 'Mexican', aliases: ['tacobell'], domains: ['tacobell.com'], url: 'https://www.tacobell.com/rewards' },
  { id: 'chipotle', name: 'Chipotle', program: 'Chipotle Rewards', category: 'Mexican', aliases: ['chipotle', 'chipotlemexicangrill'], domains: ['chipotle.com'], url: 'https://www.chipotle.com/rewards' },
  { id: 'qdoba', name: 'QDOBA', program: 'QDOBA Rewards', category: 'Mexican', aliases: ['qdoba', 'qdobamexicaneats'], domains: ['qdoba.com'], url: 'https://www.qdoba.com/rewards' },
  { id: 'moes', name: 'Moe’s Southwest Grill', program: 'Moe Rewards', category: 'Mexican', aliases: ['moessouthwestgrill', 'moes'], domains: ['moes.com'], url: 'https://www.moes.com/rewards' },
  { id: 'torchys', name: 'Torchy’s Tacos', program: 'Taco Junkies Rewards Club', category: 'Mexican', aliases: ['torchys', 'torchystacos'], domains: ['torchystacos.com'], url: 'https://torchystacos.com/torchys-rewards' },
  { id: 'fuzzys', name: 'Fuzzy’s Taco Shop', program: 'Fuzzy’s Rewards', category: 'Mexican', aliases: ['fuzzystacoshop', 'fuzzys'], domains: ['fuzzystacoshop.com'], url: 'https://www.fuzzystacoshop.com/rewards' },
  { id: 'freebirds', name: 'Freebirds World Burrito', program: 'Freebirds Rewards', category: 'Mexican', aliases: ['freebirds', 'freebirdsworldburrito'], domains: ['freebirds.com'], url: 'https://freebirds.com/rewards/' },
  { id: 'cava', name: 'CAVA', program: 'CAVA Rewards', category: 'Mediterranean', aliases: ['cava'], domains: ['cava.com'], url: 'https://cava.com/rewards' },
  { id: 'subway', name: 'Subway', program: 'Subway Sub Club', category: 'Sandwiches', aliases: ['subway'], domains: ['subway.com'], url: 'https://www.subway.com/en-us/rewards' },
  { id: 'jimmyjohns', name: 'Jimmy John’s', program: 'Jimmy John’s Rewards', category: 'Sandwiches', aliases: ['jimmyjohns'], domains: ['jimmyjohns.com'], url: 'https://www.jimmyjohns.com/rewards' },
  { id: 'jerseymikes', name: 'Jersey Mike’s', program: 'Shore Points', category: 'Sandwiches', aliases: ['jerseymikes', 'jerseymikessubs'], domains: ['jerseymikes.com'], url: 'https://www.jerseymikes.com/rewards' },
  { id: 'burgerking', name: 'Burger King', program: 'Burger King rewards', category: 'Burgers', aliases: ['burgerking'], domains: ['bk.com'], url: 'https://www.bk.com/rewards' },
  { id: 'whataburger', name: 'Whataburger', program: 'Whataburger rewards', category: 'Burgers', aliases: ['whataburger'], domains: ['whataburger.com'], url: 'https://whataburger.com/rewards' },
  { id: 'sonic', name: 'Sonic', program: 'SONIC Rewards', category: 'Burgers', aliases: ['sonic', 'sonicdrivein'], domains: ['sonicdrivein.com'], url: 'https://www.sonicdrivein.com/rewards/' },
  { id: 'arbys', name: 'Arby’s', program: 'Arby’s Rewards', category: 'Sandwiches', aliases: ['arbys'], domains: ['arbys.com'], url: 'https://www.arbys.com/rewards/' },
  { id: 'culvers', name: 'Culver’s', program: 'Culver’s rewards', category: 'Burgers', aliases: ['culvers'], domains: ['culvers.com'], url: 'https://www.culvers.com/rewards' },
  { id: 'redrobin', name: 'Red Robin', program: 'Red Robin Royalty', category: 'Burgers', aliases: ['redrobin', 'redrobingourmetburgers'], domains: ['redrobin.com'], url: 'https://www.redrobin.com/rewards' },
  { id: 'popeyes', name: 'Popeyes', program: 'Popeyes rewards', category: 'Chicken', aliases: ['popeyes', 'popeyeslouisianakitchen'], domains: ['popeyes.com'], url: 'https://www.popeyes.com/rewards' },
  { id: 'kfc', name: 'KFC', program: 'KFC Rewards', category: 'Chicken', aliases: ['kfc', 'kentuckyfriedchicken'], domains: ['kfc.com'], url: 'https://www.kfc.com/rewards' },
  { id: 'canes', name: 'Raising Cane’s', program: 'Caniac Club', category: 'Chicken', aliases: ['raisingcanes', 'raisingcaneschickenfingers'], domains: ['raisingcanes.com'], url: 'https://www.raisingcanes.com/caniac-club/' },
  { id: 'zaxbys', name: 'Zaxby’s', program: 'Zaxby’s rewards', category: 'Chicken', aliases: ['zaxbys'], domains: ['zaxbys.com'], url: 'https://www.zaxbys.com/rewards' },
  { id: 'wingstop', name: 'Wingstop', program: 'Club Wingstop', category: 'Wings', aliases: ['wingstop'], domains: ['wingstop.com'], url: 'https://www.wingstop.com/club' },
  { id: 'bww', name: 'Buffalo Wild Wings', program: 'Buffalo Wild Wings Rewards', category: 'Wings', aliases: ['buffalowildwings', 'bdubs'], domains: ['buffalowildwings.com'], url: 'https://www.buffalowildwings.com/rewards/' },
  { id: 'panda', name: 'Panda Express', program: 'Panda Rewards', category: 'Asian', aliases: ['pandaexpress'], domains: ['pandaexpress.com'], url: 'https://www.pandaexpress.com/rewards' },
  { id: 'panera', name: 'Panera Bread', program: 'MyPanera', category: 'Bakery café', aliases: ['panera', 'panerabread'], domains: ['panerabread.com'], url: 'https://www.panerabread.com/en-us/mypanera/meet-mypanera.html' },
  { id: 'noodles', name: 'Noodles & Company', program: 'Noodles Rewards', category: 'Pasta', aliases: ['noodlescompany', 'noodlesandcompany', 'noodlesco'], domains: ['noodles.com'], url: 'https://www.noodles.com/rewards' },
  { id: 'dunkin', name: 'Dunkin’', program: 'Dunkin’ Rewards', category: 'Coffee', aliases: ['dunkin', 'dunkindonuts'], domains: ['dunkindonuts.com'], url: 'https://www.dunkindonuts.com/rewards/' },
  { id: 'krispykreme', name: 'Krispy Kreme', program: 'Krispy Kreme Rewards', category: 'Dessert', aliases: ['krispykreme', 'krispykremedoughnuts'], domains: ['krispykreme.com'], url: 'https://www.krispykreme.com/rewards' },
  { id: 'peets', name: 'Peet’s Coffee', program: 'Peetnik Rewards', category: 'Coffee', aliases: ['peets', 'peetscoffee'], domains: ['peets.com'], url: 'https://www.peets.com/pages/peetnik-rewards' },
  { id: 'dutchbros', name: 'Dutch Bros', program: 'Dutch Rewards', category: 'Coffee', aliases: ['dutchbros', 'dutchbroscoffee'], domains: ['dutchbros.com'], url: 'https://www.dutchbros.com/rewards/' },
  { id: 'einstein', name: 'Einstein Bros. Bagels', program: 'Einstein Bros Rewards', category: 'Bakery café', aliases: ['einsteinbros', 'einsteinbrosbagels', 'einsteinbrothers'], domains: ['einsteinbros.com'], url: 'https://www.einsteinbros.com/rewards/' },
  { id: 'smoothieking', name: 'Smoothie King', program: 'Healthy Rewards', category: 'Smoothies', aliases: ['smoothieking'], domains: ['smoothieking.com'], url: 'https://www.smoothieking.com/rewards/' },
  { id: 'tropical', name: 'Tropical Smoothie Cafe', program: 'Tropic Rewards', category: 'Smoothies', aliases: ['tropicalsmoothiecafe', 'tropicalsmoothie'], domains: ['tropicalsmoothiecafe.com'], url: 'https://www.tropicalsmoothiecafe.com/rewards' },
  { id: 'coldstone', name: 'Cold Stone Creamery', program: 'My Cold Stone Club', category: 'Dessert', aliases: ['coldstone', 'coldstonecreamery'], domains: ['coldstonecreamery.com'], url: 'https://www.coldstonecreamery.com/mycsc/' },
  { id: 'dq', name: 'Dairy Queen', program: 'DQ Rewards', category: 'Dessert', aliases: ['dairyqueen', 'dq'], domains: ['dairyqueen.com'], url: 'https://www.dairyqueen.com/en-us/rewards/' },
  { id: 'chilis', name: 'Chili’s', program: 'My Chili’s Rewards', category: 'Casual dining', aliases: ['chilis', 'chilisgrillbar'], domains: ['chilis.com'], url: 'https://www.chilis.com/rewards' },
  { id: 'applebees', name: 'Applebee’s', program: 'Club Applebee’s', category: 'Casual dining', aliases: ['applebees', 'applebeesgrillbar'], domains: ['applebees.com'], url: 'https://www.applebees.com/en/club-applebees' },
  { id: 'ihop', name: 'IHOP', program: 'IHOP Rewards', category: 'Breakfast', aliases: ['ihop'], domains: ['ihop.com'], url: 'https://www.ihop.com/en/rewards' },
  { id: 'dennys', name: 'Denny’s', program: 'Denny’s Rewards', category: 'Breakfast', aliases: ['dennys'], domains: ['dennys.com'], url: 'https://www.dennys.com/rewards' },
  { id: 'crackerbarrel', name: 'Cracker Barrel', program: 'Cracker Barrel Rewards', category: 'Casual dining', aliases: ['crackerbarrel', 'crackerbarreloldcountrystore'], domains: ['crackerbarrel.com'], url: 'https://www.crackerbarrel.com/rewards' },
];

const BY_ID = new Map(DIRECTORY.map(e => [e.id, e]));
export const getEntry = id => BY_ID.get(id) ?? null;

/** Lowercase, drop punctuation inside words (Chick-fil-A → chickfila), split into tokens. */
export function tokens(text) {
  return String(text ?? '').toLowerCase().replace(/&/g, ' and ').replace(/['’`.\-®™]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

/** True when an alias equals a contiguous run of 1–4 tokens. Short aliases must be whole tokens. */
function lineHasAlias(t, alias) {
  if (alias.length <= 3) return t.includes(alias);
  for (let i = 0; i < t.length; i++) {
    let joined = '';
    for (let k = i; k < Math.min(t.length, i + 4); k++) {
      joined += t[k];
      if (joined === alias) return true;
      if (joined.length >= alias.length) break;
    }
  }
  return false;
}

/**
 * Find a restaurant in a single piece of text (a merchant name or header line).
 * Partial words never match: "Wendy burger" is not Wendy's.
 * @param {string} text
 * @returns {RewardsEntry|null}
 */
export function matchMerchant(text) {
  const t = tokens(text);
  if (!t.length) return null;
  // Prefer the longest alias so "Pizza Hut Express" never resolves to a shorter accidental alias.
  let best = null, bestLen = 0;
  for (const entry of DIRECTORY) {
    for (const alias of entry.aliases) {
      if (alias.length > bestLen && lineHasAlias(t, alias)) { best = entry; bestLen = alias.length; }
    }
  }
  return best;
}

/**
 * Decide which rewards program (if any) applies to a receipt, with the evidence used.
 * Order: the user's explicit choice → the merchant name → other header lines → a printed website.
 * Item lines are never searched, so "WENDY BURGER" or "PIZZA HUT STYLE" items can't trigger a match.
 * @param {{merchant: string, merchantEdited?: boolean, headerLines?: string[], domains?: string[], rewardsChoice?: null|string}} r
 * @returns {{entry: RewardsEntry, via: 'choice'|'name'|'header'|'website', evidence: string} | {entry: null, via: 'none'|'choice', evidence: string}}
 */
export function findRewards(r) {
  if (r.rewardsChoice === 'none') return { entry: null, via: 'choice', evidence: '' };
  if (r.rewardsChoice) {
    const chosen = getEntry(r.rewardsChoice);
    if (chosen) return { entry: chosen, via: 'choice', evidence: chosen.name };
  }
  const byName = matchMerchant(r.merchant);
  if (byName) return { entry: byName, via: 'name', evidence: r.merchant };
  if (!r.merchantEdited) {
    for (const line of r.headerLines ?? []) {
      const e = matchMerchant(line);
      if (e) return { entry: e, via: 'header', evidence: line };
    }
    for (const d of r.domains ?? []) {
      const e = DIRECTORY.find(x => x.domains.includes(d));
      if (e) return { entry: e, via: 'website', evidence: d };
    }
  }
  return { entry: null, via: 'none', evidence: '' };
}

/** Search the directory by restaurant or program name. */
export function searchDirectory(query) {
  const q = tokens(query).join('');
  const list = [...DIRECTORY].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return list;
  const rank = e => {
    const name = tokens(e.name).join('');
    if (name.startsWith(q) || e.aliases.some(a => a.startsWith(q))) return 0;
    if (name.includes(q) || e.aliases.some(a => a.includes(q))) return 1;
    return tokens(`${e.program} ${e.category}`).join('').includes(q) ? 2 : 3;
  };
  return list.map(e => [rank(e), e]).filter(([r]) => r < 3).sort((a, b) => a[0] - b[0]).map(([, e]) => e);
}

const FIELD_NAMES = { storeNumber: 'Restaurant / store number', dateText: 'Date', timeText: 'Time', orderNumber: 'Order number', receiptTotal: 'Receipt total' };

/**
 * Receipt detail pack, using the receipt's own printed total (never the paid amount with added tip).
 * @param {RewardsEntry} entry
 * @param {{storeNumber: string, dateText: string, timeText: string, orderNumber: string, receiptTotalCents: number|null}} receipt
 * @param {boolean} sample
 */
export function receiptDetails(entry, receipt, sample) {
  const fields = entry.claim?.fields ?? ['storeNumber', 'dateText', 'timeText', 'orderNumber', 'receiptTotal'];
  const rows = fields.map(f => {
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
