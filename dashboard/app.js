// Token Launch Radar: renders window.RADAR (written by main.ts beside this page) in the
// shape every crypto reader already knows from the big ranking sites — a stats strip,
// trending boxes, a clean ranking table and a per-protocol page — except every row is a
// protocol whose token does not exist yet. No network, no framework.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const compact = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v}`);
const full = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v) => (v === null ? '—' : `${v > 0 ? '▲ ' : v < 0 ? '▼ ' : ''}${Math.abs(v).toFixed(1)}%`);
const noTokenFor = (v) => (v === null ? 'not reported' : v >= 730 ? `${(v / 365).toFixed(1)} years` : v >= 60 ? `${Math.round(v / 30)} months` : `${v} days`);
const isScoped = (r) => r.model.includes('scoped:');
const initials = (name) => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const hue = (slug) => { let h = 0; for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360; return h; };
const avatar = (r, lg) => `<span class="avatar${lg ? ' lg' : ''}" style="background:hsl(${hue(r.slug)},52%,46%)">${esc(initials(r.name))}</span>`;

// ---- stats strip, model tables, footer -------------------------------------------------

$('strip').innerHTML = [
  ['Protocols', R.protocol_count], ['Still no token', R.rows.length],
  ['Watchlist covered', `${R.watchlist_count}/${R.watchlist_count}`], ['Already trading', R.live_count],
  ['Snapshot', R.as_of], ['Global peer price', `${R.global_multiple.toFixed(2)}x per $1 locked`],
].map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('');
$('asof').textContent = R.as_of;

$('multiples').innerHTML =
  '<tr><th>Type</th><th class="num">Live examples</th><th class="num">Median price</th><th class="num">Price used</th></tr>' +
  R.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.live}</td><td class="num">${c.median_multiple.toFixed(2)}x</td><td class="num">${c.used_multiple.toFixed(2)}x</td></tr>`).join('');
$('live').innerHTML =
  '<tr><th>Protocol</th><th class="num">Money locked</th><th class="num">Token value today</th></tr>' +
  R.live.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${compact(p.tvl_usd)}</td><td class="num">${compact(p.mcap_usd)}</td></tr>`).join('');

// ---- the three boxes ---------------------------------------------------------------------

const boxRow = (r, show) => `
  <div class="box-row" data-slug="${esc(r.slug)}">
    <span class="br-rank">${r.rank}</span>${avatar(r)}
    <span class="br-name">${esc(r.name)}</span>
    <span class="br-val ${show === 'growth' ? (r.change_7d >= 0 ? 'pos' : 'neg') : ''}">${show === 'growth' ? pct(r.change_7d) : compact(show === 'tvl' ? r.tvl_usd : r.implied_value_usd)}</span>
  </div>`;
const candidates = R.rows.filter((r) => !isScoped(r));
$('boxes').innerHTML = [
  ['Top launches to watch', 'by estimated value', [...R.rows].sort((a, b) => b.implied_value_usd - a.implied_value_usd).slice(0, 3), 'value'],
  ['Most money locked', 'no token yet', [...candidates].sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 3), 'tvl'],
  ['Fastest growing', '7-day TVL, $50M+ locked', candidates.filter((r) => r.tvl_usd >= 50e6 && r.change_7d !== null).sort((a, b) => b.change_7d - a.change_7d).slice(0, 3), 'growth'],
].map(([title, sub, rows, show]) => `
  <div class="box"><h3>${esc(title)} <span>${esc(sub)}</span></h3>${rows.map((r) => boxRow(r, show)).join('')}</div>`).join('');
for (const row of document.querySelectorAll('.box-row')) {
  row.addEventListener('click', () => select(row.dataset.slug, true));
}

// ---- controls: search (in the masthead), category chips, sort, watchlist ------------------

const categories = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorised'))].sort();
const chipCats = ['', 'Lending', 'Dexs', 'Liquid Staking', 'Yield', 'Derivatives', 'RWA', 'Risk Curators', 'Bridge']
  .filter((c) => c === '' || categories.includes(c));
$('chips').innerHTML = chipCats.map((c) =>
  `<button class="chip" type="button" data-cat="${esc(c)}">${c === '' ? 'All types' : esc(c)}</button>`).join('');

const state = { q: '', category: '', watch: false, sort: 'value', selected: null };
const params = new URLSearchParams(location.search);
if (params.get('shot') === 'board') document.body.classList.add('shot');
if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
if (params.get('category')) state.category = params.get('category');
if (params.get('watch') === '1') { state.watch = true; $('watch').checked = true; }
if (params.get('sort')) { state.sort = params.get('sort'); $('sort').value = state.sort; }

function paintChips() {
  for (const chip of $('chips').children) {
    chip.classList.toggle('on', chip.dataset.cat === state.category);
    chip.onclick = () => { state.category = chip.dataset.cat; paintChips(); render(); };
  }
}

function visible() {
  let rows = R.rows.filter((r) =>
    (!state.watch || r.on_watchlist) &&
    (state.category === '' || (r.category ?? 'Uncategorised') === state.category) &&
    (state.q === '' || r.name.toLowerCase().includes(state.q.toLowerCase()) || r.slug.includes(state.q.toLowerCase())));
  const by = {
    value: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
  }[state.sort];
  return rows.sort(by);
}

function render() {
  const rows = visible();
  $('count').textContent = rows.length === R.rows.length
    ? `All ${rows.length} protocols without a token, best launch first. Click any row for its estimate breakdown and farm plan.`
    : `${rows.length} of ${R.rows.length} protocols match your filters. Ranks never change when you sort or filter — they are the board's own.`;
  $('rows').innerHTML = rows.map((r) => {
    const ratio = r.implied_value_usd / r.tvl_usd;
    return `
    <tr data-slug="${esc(r.slug)}" class="${state.selected === r.slug ? 'selected' : ''}">
      <td class="num">${r.rank}</td>
      <td>${r.on_watchlist ? '<span class="star" title="On the house watchlist">★</span>' : ''}</td>
      <td>${avatar(r)} <span class="pname">${esc(r.name)}</span><span class="pslug">${esc(r.slug)}</span></td>
      <td class="num value">${compact(r.implied_value_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
      <td class="num">${compact(r.tvl_usd)}</td>
      <td class="num">${noTokenFor(r.age_days)}</td>
      <td><span class="mult"><span class="track"><i style="width:${Math.min(100, Math.round((ratio / 1.5) * 100))}%"></i></span><span class="mval">${ratio < 0.095 ? ratio.toFixed(3) : ratio.toFixed(2)}x</span></span></td>
    </tr>`;
  }).join('');
  for (const tr of $('rows').children) {
    tr.addEventListener('click', () => select(tr.dataset.slug, false));
  }
}

// ---- detail view ----------------------------------------------------------------------------

function select(slug, scroll) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  render();
  const widest = Math.max(r.implied_value_usd, r.tvl_usd);
  const barW = (v) => Math.max(4, Math.round((Math.sqrt(v) / Math.sqrt(widest)) * 100));
  $('detail').innerHTML = `
    <div class="detail-head">${avatar(r, true)}
      <div><h2>${esc(r.name)}</h2>
      <p class="sub">${esc(r.slug)} · ranked #${r.rank} of ${R.rows.length}${r.on_watchlist ? ' · ★ house watchlist' : ''}</p></div>
    </div>
    <div class="big-value">${full(r.implied_value_usd)}</div>
    <p class="big-label">estimated value if ${esc(r.name)} launched a token with today's record</p>
    <div class="bar-wrap">
      <div class="bar-row"><span class="bar-name">Launch estimate</span><span class="bar"><i style="width:${barW(r.implied_value_usd)}%"></i></span><span class="bar-val">${compact(r.implied_value_usd)}</span></div>
      <div class="bar-row"><span class="bar-name">Money locked</span><span class="bar locked"><i style="width:${barW(r.tvl_usd)}%"></i></span><span class="bar-val">${compact(r.tvl_usd)}</span></div>
    </div>
    <h3>The facts</h3>
    <dl class="kv">
      <div><dt>Type</dt><dd>${esc(r.category ?? 'Uncategorised')}</dd></div>
      <div><dt>Money locked (TVL)</dt><dd>${full(r.tvl_usd)}</dd></div>
      <div><dt>7-day trend</dt><dd>${pct(r.change_7d)}</dd></div>
      <div><dt>Running since</dt><dd>${esc(r.listed_at ?? 'not reported')}</dd></div>
      <div><dt>Without a token for</dt><dd>${noTokenFor(r.age_days)}</dd></div>
      <div><dt>Works on</dt><dd>${r.chains.slice(0, 3).map(esc).join(', ') || '—'}</dd></div>
    </dl>
    <h3>Why this estimate</h3>
    <p class="model-note">${esc(r.model)}</p>
    <h3>How to farm it</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  if (scroll) $('detail').scrollIntoView({ block: 'start' });
  if (params.get('focus') === 'steps') {
    const steps = document.querySelector('.steps');
    const panel = $('detail');
    if (steps) panel.scrollTop = steps.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 140;
  }
}

$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('watch').addEventListener('change', (e) => { state.watch = e.target.checked; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('reset').addEventListener('click', () => {
  Object.assign(state, { q: '', category: '', watch: false, sort: 'value' });
  $('q').value = ''; $('watch').checked = false; $('sort').value = 'value';
  paintChips(); render();
});

paintChips();
render();
select(params.get('detail') ?? visible()[0]?.slug ?? R.rows[0].slug, false);
