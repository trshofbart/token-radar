// Token Launch Radar: renders window.RADAR (written by main.ts beside this page) for a
// first-time reader. A hero strip of the top five, a filterable board anyone can scan,
// and a detail view that explains each estimate in plain words before it shows the
// arithmetic. No network, no framework: the sealed snapshot is the only data there is.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const compact = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v}`);
const full = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const noTokenFor = (v) => (v === null ? 'not reported' : v >= 730 ? `${(v / 365).toFixed(1)} years` : v >= 60 ? `${Math.round(v / 30)} months` : `${v} days`);

// ---- header stats, model tables, footer --------------------------------------------

$('stats').innerHTML = [
  ['Protocols scanned', R.protocol_count],
  ['Still no token', R.rows.length],
  ['Watchlist covered', `${R.watchlist_count} / ${R.watchlist_count}`],
  ['Already have a token', R.live_count],
].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
$('asof').textContent = R.as_of;

$('multiples').innerHTML =
  '<tr><th>Type</th><th class="num">Live examples</th><th class="num">Median price</th><th class="num">Price used</th></tr>' +
  R.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.live}</td><td class="num">${c.median_multiple.toFixed(2)}x</td><td class="num">${c.used_multiple.toFixed(2)}x</td></tr>`).join('');
$('live').innerHTML =
  '<tr><th>Protocol</th><th class="num">Money locked</th><th class="num">Token value today</th></tr>' +
  R.live.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${compact(p.tvl_usd)}</td><td class="num">${compact(p.mcap_usd)}</td></tr>`).join('');

// ---- top five hero cards --------------------------------------------------------------

$('cards').innerHTML = R.rows.slice(0, 5).map((r) => `
  <button class="card" type="button" data-slug="${esc(r.slug)}">
    <span class="rank">#${r.rank} to watch</span>
    <div class="cname">${esc(r.name)}</div>
    <div class="ccat">${esc(r.category ?? 'Uncategorised')} · ${compact(r.tvl_usd)} locked · no token for ${noTokenFor(r.age_days)}</div>
    <div class="cval">${compact(r.implied_value_usd)}</div>
    <div class="clabel">estimated launch value — tap for the farm plan</div>
  </button>`).join('');
for (const card of $('cards').children) {
  card.addEventListener('click', () => select(card.dataset.slug, true));
}

// ---- controls: search, category chips, sort, watchlist --------------------------------

const categories = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorised'))].sort();
const chipCats = ['', 'Lending', 'Dexs', 'Liquid Staking', 'Yield', 'Derivatives', 'RWA', 'Risk Curators', 'Bridge']
  .filter((c) => c === '' || categories.includes(c));
$('chips').innerHTML = chipCats.map((c) =>
  `<button class="chip" type="button" data-cat="${esc(c)}">${c === '' ? 'All types' : esc(c)}</button>`).join('');

const state = { q: '', category: '', chain: '', watch: false, sort: 'value', selected: null };
const params = new URLSearchParams(location.search);
if (params.get('shot') === 'board') document.body.classList.add('shot');
if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
if (params.get('category')) state.category = params.get('category');
if (params.get('watch') === '1') { state.watch = true; $('watch').checked = true; }
if (params.get('sort')) { state.sort = params.get('sort'); $('sort').value = state.sort; }

function paintChips() {
  for (const chip of $('chips').children) chip.classList.toggle('on', chip.dataset.cat === state.category);
  for (const chip of $('chips').children) {
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
    ? `All ${rows.length} protocols without a token, best launch first. Tap any row to see why it ranks there and how to farm it.`
    : `${rows.length} of ${R.rows.length} protocols match your filters. Ranks never change when you sort or filter — they are the board's own.`;
  $('rows').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}" class="${state.selected === r.slug ? 'selected' : ''}">
      <td class="num">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${r.on_watchlist ? '<span class="badge">watchlist</span>' : ''}<br><span class="pslug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? 'Uncategorised')}</td>
      <td class="num">${compact(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
      <td class="num">${noTokenFor(r.age_days)}</td>
      <td class="num value">${compact(r.implied_value_usd)}</td>
    </tr>`).join('');
  for (const tr of $('rows').children) {
    tr.addEventListener('click', () => select(tr.dataset.slug, false));
  }
}

// ---- detail view -----------------------------------------------------------------------

function select(slug, scroll) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  render();
  const widest = Math.max(r.implied_value_usd, r.tvl_usd);
  const barW = (v) => Math.max(4, Math.round((Math.sqrt(v) / Math.sqrt(widest)) * 100));
  $('detail').innerHTML = `
    <h2>${esc(r.name)}</h2>
    <p class="sub">${esc(r.slug)} · ranked #${r.rank} of ${R.rows.length}${r.on_watchlist ? ' · on the house watchlist' : ''}</p>
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
$('reset').className = 'reset';

paintChips();
render();
select(params.get('detail') ?? visible()[0]?.slug ?? R.rows[0].slug, false);
