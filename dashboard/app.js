// Token Launch Radar: renders window.RADAR (written by main.ts beside this page) as a
// sortable, filterable board with a per-protocol detail view and farm plan. No network,
// no framework: the sealed snapshot is the only data there is.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const compact = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v}`);
const full = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const days = (v) => (v === null ? '—' : v >= 730 ? `${(v / 365).toFixed(1)}y` : `${v}d`);

// ---- header, model tables, footer -------------------------------------------------

$('stats').innerHTML = [
  ['Protocols scanned', R.protocol_count],
  ['Pre-token ranked', R.rows.length],
  ['Watchlist covered', `${R.watchlist_count} / ${R.watchlist_count}`],
  ['Live tokens set aside', R.live_count],
  ['Global peer multiple', `${R.global_multiple.toFixed(2)}x`],
].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
$('asof').textContent = R.as_of;

$('multiples').innerHTML =
  '<tr><th>Category</th><th class="num">Live peers</th><th class="num">Median x</th><th class="num">Used x</th></tr>' +
  R.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.live}</td><td class="num">${c.median_multiple.toFixed(2)}</td><td class="num">${c.used_multiple.toFixed(2)}</td></tr>`).join('');
$('live').innerHTML =
  '<tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th></tr>' +
  R.live.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${compact(p.tvl_usd)}</td><td class="num">${compact(p.mcap_usd)}</td></tr>`).join('');

// ---- controls ----------------------------------------------------------------------

const categories = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorised'))].sort();
$('category').innerHTML += categories.map((c) => `<option>${esc(c)}</option>`).join('');
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
$('chain').innerHTML += chains.map((c) => `<option>${esc(c)}</option>`).join('');

const state = { q: '', category: '', chain: '', watch: false, sort: 'value', selected: null };
const params = new URLSearchParams(location.search);
if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
if (params.get('category')) { state.category = params.get('category'); $('category').value = state.category; }
if (params.get('chain')) { state.chain = params.get('chain'); $('chain').value = state.chain; }
if (params.get('watch') === '1') { state.watch = true; $('watch').checked = true; }
if (params.get('sort')) { state.sort = params.get('sort'); $('sort').value = state.sort; }

function visible() {
  let rows = R.rows.filter((r) =>
    (!state.watch || r.on_watchlist) &&
    (state.category === '' || (r.category ?? 'Uncategorised') === state.category) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (state.q === '' || r.name.toLowerCase().includes(state.q.toLowerCase()) || r.slug.includes(state.q.toLowerCase())));
  const by = {
    value: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    multiple: (a, b) => b.implied_value_usd / b.tvl_usd - a.implied_value_usd / a.tvl_usd,
  }[state.sort];
  return rows.sort(by);
}

function render() {
  const rows = visible();
  $('count').textContent = `${rows.length} of ${R.rows.length} pre-token protocols shown — ranks are the board's own and never move when you sort or filter.`;
  $('rows').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}" class="${state.selected === r.slug ? 'selected' : ''}">
      <td class="num">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${r.on_watchlist ? '<span class="badge">watchlist</span>' : ''}<br><span class="pslug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? 'Uncategorised')}</td>
      <td class="num">${compact(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
      <td class="num">${days(r.age_days)}</td>
      <td class="num value">${compact(r.implied_value_usd)}</td>
      <td class="num">${(r.implied_value_usd / r.tvl_usd) < 0.095 ? (r.implied_value_usd / r.tvl_usd).toFixed(3) : (r.implied_value_usd / r.tvl_usd).toFixed(2)}x</td>
    </tr>`).join('');
  for (const tr of $('rows').children) {
    tr.addEventListener('click', () => select(tr.dataset.slug, false));
  }
}

// ---- detail view --------------------------------------------------------------------

function select(slug, scroll) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  render();
  $('detail').innerHTML = `
    <h2>${esc(r.name)}</h2>
    <p class="sub">${esc(r.slug)} · rank #${r.rank} of ${R.rows.length}${r.on_watchlist ? ' · on the house watchlist' : ''}</p>
    <dl class="kv">
      <div><dt>Implied launch value</dt><dd>${full(r.implied_value_usd)}</dd></div>
      <div><dt>TVL (snapshot)</dt><dd>${full(r.tvl_usd)}</dd></div>
      <div><dt>Category</dt><dd>${esc(r.category ?? 'Uncategorised')}</dd></div>
      <div><dt>7d TVL change</dt><dd>${pct(r.change_7d)}</dd></div>
      <div><dt>Tracked since</dt><dd>${esc(r.listed_at ?? 'unreported')}</dd></div>
      <div><dt>Days with no token</dt><dd>${r.age_days === null ? '—' : r.age_days}</dd></div>
    </dl>
    <h3>Chains</h3>
    <p>${r.chains.map(esc).join(' · ') || '—'}</p>
    <h3>Why this value</h3>
    <p class="model-note">${esc(r.model)}</p>
    <h3>Farm plan</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  if (scroll) $('detail').scrollIntoView({ block: 'start' });
  if (params.get('focus') === 'steps') {
    const steps = document.querySelector('.steps');
    const panel = $('detail');
    if (steps) panel.scrollTop = steps.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 140;
  }
}

$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('category').addEventListener('change', (e) => { state.category = e.target.value; render(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
$('watch').addEventListener('change', (e) => { state.watch = e.target.checked; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('reset').addEventListener('click', () => {
  Object.assign(state, { q: '', category: '', chain: '', watch: false, sort: 'value' });
  $('q').value = ''; $('category').value = ''; $('chain').value = ''; $('watch').checked = false; $('sort').value = 'value';
  render();
});

render();
select(params.get('detail') ?? visible()[0]?.slug ?? R.rows[0].slug, false);
