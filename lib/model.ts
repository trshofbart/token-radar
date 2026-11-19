// The token radar's model: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol the snapshot records with no token (no market cap) by the
// value its launch would carry if its record stayed as it is. The number is built only from
// the snapshot's own figures, in four steps a reader can audit on the dashboard:
//
//   peer multiple   Tokenised protocols in the same category set the price of TVL: the
//                   median market-cap / TVL of the category's live protocols, shrunk
//                   toward the global median by the category's sample size. Each live
//                   ratio is first winsorised at the market's own 90th percentile, so
//                   one thin category with a single wild peer cannot price the board.
//   growth          The protocol's own seven-day TVL change, clamped, moves the multiple
//                   a little: a protocol gaining TVL is worth more than a shrinking one.
//   endurance       Days since DefiLlama began tracking it with no token: a long,
//                   large, tokenless run is evidence the launch, if it comes, is a real one.
//   scope           A wrapped, staked or bridged product of a token that already trades,
//                   a bridge or an exchange is not a launch candidate in the same sense:
//                   the house watchlist rule sets those aside, and this board prices at
//                   most $5B of their TVL at the global multiple with a 0.05 scope factor,
//                   the reason printed on the row.
//
// No protocol name is ever special-cased: the same function scores every row, and each row
// carries the arithmetic that produced its number.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One ranked row of the board, as board.json and the dashboard both carry it. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: string;
  farm_steps: string[];
}

/** Everything the dashboard renders: the board plus the model's own workings. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  protocol_count: number;
  watchlist_count: number;
  live_count: number;
  global_multiple: number;
  categories: { category: string; live: number; median_multiple: number; used_multiple: number }[];
  rows: BoardRow[];
  live: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number }[];
}

/** Parse and lightly validate the sealed snapshot text. */
export function parseSnapshot(text: string): Snapshot {
  const snap = JSON.parse(text) as Snapshot;
  if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    throw new Error('snapshot holds no protocols or watchlist array');
  }
  return snap;
}

const DAY_MS = 86_400_000;

/** Whole days from an ISO day (or null) to the snapshot's as_of day; null when unknown. */
function ageInDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const days = Math.floor((Date.parse(asOf) - Date.parse(listedAt)) / DAY_MS);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Categories and name shapes the watchlist rule treats as products of a token that
 *  already trades, or as venues rather than launch candidates. */
const SCOPE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_TAIL = /\s(V2|v2|2\.0|V3|v3|3\.0)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

function isScopeDiscounted(p: SnapshotProtocol): boolean {
  if (p.category !== null && SCOPE_CATEGORIES.has(p.category)) return true;
  if (VERSION_TAIL.test(p.name) || WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(`${x} `));
}

/** Round a dollar figure for display: $0.40 / $1,234 / $45.6M / $7.89B. */
export function usd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  if (v < 10) return `$${v.toFixed(2)}`;
  return `$${Math.round(v)}`;
}

/** Working capital a farm plan assumes, from the protocol's TVL tier. */
function capitalFor(tvl: number): number {
  if (tvl >= 1e9) return 10_000;
  if (tvl >= 1e8) return 2_500;
  if (tvl >= 1e7) return 750;
  return 250;
}

/** A rough one-way gas/fee budget per chain, in dollars, for plan costing. */
const CHAIN_COST: Record<string, number> = {
  Ethereum: 18, Arbitrum: 1.2, Base: 0.6, Optimism: 0.9, 'OP Mainnet': 0.9, BSC: 0.8,
  Polygon: 0.4, Solana: 0.3, Avalanche: 1.5, zkSync: 0.7, Linea: 0.8, Scroll: 0.9,
  Mantle: 0.5, Blast: 0.7, Berachain: 1.0, Sonic: 0.4, Sui: 0.3, Aptos: 0.3,
};
const chainCost = (chain: string) => CHAIN_COST[chain] ?? 2;

/** Small deterministic variation so sibling rows do not read as copies. */
function pick<T>(slug: string, salt: number, options: T[]): T {
  let h = salt * 2654435761;
  for (let i = 0; i < slug.length; i++) h = (h ^ (slug.charCodeAt(i) + h * 31)) >>> 0;
  return options[h % options.length]!;
}

interface Scored extends BoardRow {
  sortKey: number;
}

/** Score every pre-token protocol and assemble the board and the dashboard's data. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const watchlist = new Set(snapshot.watchlist);
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const pre = snapshot.protocols.filter((p) => p.mcap_usd === null);

  // Peer multiples: what the market pays per dollar of TVL, by category. Each live
  // ratio is winsorised at the cross-section's 90th percentile first, and each
  // category median is shrunk toward the global median with a prior weight of 9,
  // so a category with one or two live peers mostly inherits the market's price.
  const rawRatios = live.filter((p) => p.tvl_usd > 0).map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const ratioCap = rawRatios.length > 0 ? rawRatios[Math.floor(rawRatios.length * 0.9)]! : 1;
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of live) {
    if (p.tvl_usd <= 0) continue;
    const ratio = Math.min(p.mcap_usd! / p.tvl_usd, ratioCap);
    allRatios.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
  }
  const globalMultiple = allRatios.length > 0 ? median(allRatios) : 1;
  const categoryRows: RadarData['categories'] = [];
  const usedMultiple = new Map<string, number>();
  for (const [category, ratios] of [...ratiosByCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const med = median(ratios);
    const shrunk = (ratios.length * med + 9 * globalMultiple) / (ratios.length + 9);
    usedMultiple.set(category, shrunk);
    categoryRows.push({ category, live: ratios.length, median_multiple: med, used_multiple: shrunk });
  }
  const multipleFor = (p: SnapshotProtocol) => usedMultiple.get(p.category ?? 'Uncategorised') ?? globalMultiple;

  const scored: Scored[] = pre.map((p) => {
    const multiple = multipleFor(p);
    const growthPct = clamp(p.change_7d ?? 0, -40, 60);
    const growthFactor = Math.max(0.55, 1 + (growthPct / 100) * 0.6);
    const age = ageInDays(p.listed_at, snapshot.as_of);
    const ageFactor = age === null ? 1 : age < 90 ? 0.8 : 1 + (Math.min(age, 1825) / 1825) * 0.2;
    const scoped = !watchlist.has(p.slug) && isScopeDiscounted(p);
    // Scope rows are not launch candidates: their recorded TVL is mostly customer
    // reserves or wrapped supply, so the board prices at most $5B of it, at the
    // global multiple, with a 0.05 scope factor — enough to keep them on the board
    // for completeness, never enough to head it.
    const baseTvl = scoped ? Math.min(p.tvl_usd, 5_000_000_000) : p.tvl_usd;
    const effectiveMultiple = scoped ? globalMultiple : multiple;
    const scopeFactor = scoped ? 0.05 : 1;
    const implied = Math.max(1, Math.round(baseTvl * effectiveMultiple * growthFactor * ageFactor * scopeFactor));

    const catLabel = p.category ?? 'Uncategorised';
    const livePeers = ratiosByCategory.get(catLabel)?.length ?? 0;
    let note =
      `TVL ${usd(p.tvl_usd)} x ${multiple.toFixed(2)} ${catLabel} peer multiple ` +
      `(median of ${livePeers} live ${catLabel} protocols, winsorised at the market's 90th percentile and shrunk toward the ${globalMultiple.toFixed(2)} global median) ` +
      `x growth ${growthFactor.toFixed(2)} (7d ${p.change_7d === null ? 'unreported' : `${p.change_7d.toFixed(1)}%`}) ` +
      `x endurance ${ageFactor.toFixed(2)} (${age === null ? 'listing date unreported' : `${age} days with no token`})`;
    if (scoped) {
      note += ` — then scoped: priced at the ${globalMultiple.toFixed(2)} global multiple on at most $5.00B of TVL x 0.05, because a wrapped, staked, bridged or exchange product of a token that already trades is set aside by the watchlist rule and ranked here only for completeness`;
    }
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      on_watchlist: watchlist.has(p.slug),
      implied_value_usd: implied,
      model: note,
      farm_steps: farmPlan(p, age),
      sortKey: implied,
    };
  });

  scored.sort((a, b) => b.sortKey - a.sortKey || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const board: BoardRow[] = scored.map(({ sortKey: _drop, ...row }, i) => ({ ...row, rank: i + 1 }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    watchlist_count: snapshot.watchlist.length,
    live_count: live.length,
    global_multiple: globalMultiple,
    categories: categoryRows,
    rows: board,
    live: [...live]
      .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
      .slice(0, 12)
      .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
  };
  return { board, radar };
}

/** The farm plan for one protocol: concrete steps with money and time on them. */
export function farmPlan(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = chainCost(chain);
  const capital = capitalFor(p.tvl_usd);
  const cat = p.category ?? 'protocol';
  const weeks = age !== null && age < 180 ? '10-14 weeks' : '6-10 weeks';
  const open = pick(p.slug, 1, [
    `Open ${p.name} on ${chain} and connect a fresh wallet you use only for pre-token farming, so the activity history is clean and attributable.`,
    `Start on ${p.name}'s main deployment on ${chain}; use one dedicated wallet for this protocol so every action below is easy to keep and prove.`,
  ]);
  const fund =
    `Fund the wallet with about ${usd(capital)} of working capital plus ${usd(Math.max(2, gas * 6))} of ${chain} gas money. ` +
    `Budget ${usd(gas)} per transaction on ${chain}; the full plan below costs roughly ${usd(gas * 14)} in fees over ${weeks}.`;
  const core = coreStep(p, chain, capital, gas);
  const second = pick(p.slug, 2, [
    `Repeat the core action on a weekly cadence for ${weeks} rather than in one burst: sustained use across many snapshots is what separates a farmer from a sybil in most points designs.`,
    `Add a second, smaller position (${usd(Math.round(capital / 4))}) in a different ${cat} market or pool of ${p.name} and keep both alive for ${weeks}; breadth inside one protocol beats size in a single pool.`,
    `Join ${p.name}'s governance forum and Discord this week (30 minutes, no cost) and vote on every proposal while your position is open; governance history is cheap to build and often a multiplier.`,
  ]);
  const track =
    `Keep a simple log (date, action, tx hash, balance) after every session, 5 minutes a week. If ${p.name} announces points, a season or a snapshot, ` +
    `your log is the checklist you rebalance against within a day instead of starting from zero.`;
  const exit =
    `Review monthly: if TVL falls for four straight weeks or the team confirms there will be no token, withdraw and rotate the capital to the next protocol on this board. ` +
    `If a token launches, claim on day one and sell into the first week's liquidity rather than holding an unplanned position.`;
  return [open, fund, core, second, track, exit];
}

/** The category-specific core action: the thing a farmer actually does every week. */
function coreStep(p: SnapshotProtocol, chain: string, capital: number, gas: number): string {
  const n = p.name;
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) {
    return `Supply ${usd(capital)} of a major stablecoin or ETH as collateral in ${n} on ${chain} (one deposit, about ${usd(gas)} in gas, 10 minutes), then borrow 40-50% against it and re-supply the borrowed asset once. Keep the health factor above 1.6 and check it twice a week.`;
  }
  if (c.includes('dex') || c.includes('swap')) {
    return `Provide ${usd(capital)} of liquidity to ${n}'s busiest pair on ${chain} (about ${usd(gas * 2)} to approve and deposit, 15 minutes) and route at least ${usd(Math.round(capital / 2))} of swaps a week through the same wallet, so both LP and trader activity accrue to one address.`;
  }
  if (c.includes('staking') || c.includes('restaking')) {
    return `Stake ${usd(capital)} of ETH (or the chain's gas asset) through ${n} on ${chain} (about ${usd(gas)} in gas, 5 minutes) and hold the receipt token in the same wallet; if ${n} supports restaking into an AVS or vault, restake half so both layers of points accrue.`;
  }
  if (c.includes('bridge')) {
    return `Bridge ${usd(Math.round(capital / 2))} to ${chain === 'Ethereum' ? 'two destination chains' : 'Ethereum and back'} through ${n} every week (about ${usd(gas * 2)} per round trip) and keep a balance on the far side for at least a few days each time; volume plus dwell time is the usual bridge-farming signal.`;
  }
  if (c.includes('deriv') || c.includes('perp') || c.includes('option')) {
    return `Trade ${n} on ${chain} with ${usd(capital)} of margin: open and close two or three small positions a week (about ${usd(gas)} a trade in fees) and build volume steadily toward ${usd(capital * 20)} cumulative, favouring maker orders where the book allows.`;
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return `Deposit ${usd(capital)} into ${n}'s largest vault on ${chain} (one deposit, about ${usd(gas)} in gas, 10 minutes) and leave it untouched; curator and allocator vaults reward time in the vault, so add ${usd(Math.round(capital / 5))} monthly instead of churning in and out.`;
  }
  if (c.includes('rwa')) {
    return `Complete ${n}'s onboarding and KYC if the product requires it (about an hour, no fee), then buy ${usd(capital)} of its tokenised treasury or credit exposure on ${chain} and hold it; for RWA the qualifying action is a real, held position, not transaction count.`;
  }
  if (c.includes('cex')) {
    return `Register and complete KYC on ${n} (about 30 minutes), deposit ${usd(capital)}, and run your normal spot trading through it for the season; exchange token distributions, when they happen, have historically weighted KYC'd accounts with real balances and volume.`;
  }
  return `Use ${n}'s core product on ${chain} with ${usd(capital)} of capital at least twice a week (about ${usd(gas)} a session): deposit, transact or subscribe as the product intends, and keep the position open between sessions so the wallet reads as a user, not a passer-by.`;
}

/** The dashboard's data file: the radar object as one script. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** A gate-shaped board problem, or null when the board is fit to hand in. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  for (const [i, row] of board.entries()) {
    if (!slugs.has(row.slug)) return `row ${i + 1} names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${i + 1} carries rank ${row.rank}`;
    if (!(row.implied_value_usd > 0) || row.implied_value_usd > 1e14) return `row ${row.slug} has an implied value out of range`;
    if (row.implied_value_usd > previous) return `implied value rises at rank ${row.rank}`;
    previous = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `a farm step of ${row.slug} is ${len} characters, outside 20-600`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  if (board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every implied value is the same';
  return null;
}
