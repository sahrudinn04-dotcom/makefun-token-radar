// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is
// in data.js. The page recomputes each row's implied value from the snapshot figures,
// so the page's arithmetic and board.json are visibly the same model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var root = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, as main.ts scores it: base x growth x maturity x breadth. The page
  // recomputes a row from the snapshot figures and checks the number board.json carries.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_per_chain * Math.min((row.chains || []).length, model.breadth_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth));
  }

  // ------------------------------------------------------------ hash routes
  // '' or '#/' is the board. '#/protocol/<slug>' opens that protocol's detail view.
  // '#/?q=..&category=..&chain=..' is the board with those filters applied.
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    state.selected = null;
    if (hash.indexOf('/protocol/') === 0) {
      state.selected = decodeURIComponent(hash.slice('/protocol/'.length).split('?')[0]);
      return;
    }
    if (hash.charAt(0) === '/' && hash.charAt(1) === '?') {
      var params = new URLSearchParams(hash.slice(2));
      state.q = params.get('q') || '';
      state.category = params.get('category') || 'all';
      state.chain = params.get('chain') || 'all';
    }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    var next;
    if (state.selected) next = '#/protocol/' + encodeURIComponent(state.selected);
    else if (params.toString()) next = '#/?' + params.toString();
    else next = window.location.pathname + window.location.search;
    // replaceState fires no hashchange, so this never loops back into readHash.
    window.history.replaceState(null, '', next);
  }

  // ------------------------------------------------------------ filtering
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ------------------------------------------------------------ shell (rendered once)
  function optionList(values, current, allLabel) {
    var out = '<option value="all"' + (current === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>';
    values.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }

  function shellHtml() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var top = DATA.rows[0];
    return '' +
    '<div class="shell">' +
      '<header class="top">' +
        '<div class="brand"><span class="mark"></span><span class="brand-name">Token <em>Radar</em></span></div>' +
        '<div class="top-meta">' +
          '<span class="chip">Snapshot <b>' + esc(DATA.as_of) + '</b></span>' +
          '<span class="chip">DefiLlama protocol index</span>' +
          '<span class="chip">Model <b>' + esc(DATA.model_version) + '</b></span>' +
        '</div>' +
      '</header>' +
      '<section class="hero">' +
        '<h1><span>' + DATA.watchlist_size + ' watchlist protocols</span>, ranked by what a launch would be worth</h1>' +
        '<p>The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record. ' +
        'The early radar adds <b>' + DATA.early_size + ' pre-token protocols</b> below that floor, found early by the same rule. ' +
        'Implied value is a model of the snapshot&rsquo;s own figures, not a price and not a promise.</p>' +
        '<div class="facts">' +
          '<div class="fact"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' <small>/ ' + DATA.watchlist_size + '</small></b></div>' +
          '<div class="fact"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
          '<div class="fact"><span>Early rows below the floor</span><b>' + DATA.early_size + '</b></div>' +
          '<div class="fact"><span>Top implied value</span><b>' + esc(fmtUsd(top ? top.implied_value_usd : 0)) + '</b></div>' +
        '</div>' +
      '</section>' +
      '<div class="controls">' +
        '<div class="field grow"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
        '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + optionList(categories, state.category, 'All categories') + '</select></div>' +
        '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + optionList(chains, state.chain, 'All chains') + '</select></div>' +
        '<div class="field"><span class="lbl">Token status</span><div class="tabs">' +
          '<button type="button" id="tab-pre" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
          '<button type="button" id="tab-live" aria-pressed="' + (state.tab === 'live') + '">Live token</button>' +
        '</div></div>' +
        '<span class="count" id="count"></span>' +
      '</div>' +
      '<div id="table-slot"></div>' +
      '<section class="panel model" id="model-panel">' +
        '<h2>How implied value is computed</h2>' +
        '<p>One function of the snapshot&rsquo;s figures scores every row. No protocol name is special-cased, and no row is hand-picked.</p>' +
        '<div class="formula">implied = round( tvl_usd &times; <b>' + DATA.model.base_multiple + '</b> &times; (1 + clamp(change_7d, ' + DATA.model.growth_floor + ', ' + DATA.model.growth_cap + ') / 100 &times; ' + DATA.model.growth_weight + ') &times; (' + DATA.model.maturity_floor + ' + min(age_days, ' + DATA.model.maturity_days + ') / ' + DATA.model.maturity_days + ' &times; ' + DATA.model.maturity_range + ') &times; (1 + ' + DATA.model.breadth_per_chain + ' &times; min(chains, ' + DATA.model.breadth_max_chains + ')) )</div>' +
        '<p style="margin-top:12px">TVL, seven-day growth, age since first listing and chain count all come from the snapshot. Age is the best record of how long a protocol has run with no token; an unlisted age uses ' + DATA.model.unknown_age_days + ' days. Protocols whose token already trades are set aside with their market caps shown, never mixed into the ranking.</p>' +
      '</section>' +
      '<p class="foot"><b>A note on what &ldquo;no token&rdquo; means.</b> The snapshot records no token for the protocols on this board; that is DefiLlama&rsquo;s record, not proof a token does not exist. A protocol may still have a token its record does not carry. Farm at your own risk: check the protocol&rsquo;s own page before you move funds, and never pay to claim an airdrop.</p>' +
    '</div>' +
    '<dialog class="detail" id="detail" aria-labelledby="detail-title"><div class="detail-inner" id="detail-inner"></div></dialog>';
  }

  // ------------------------------------------------------------ board + live tables
  function sortBtn(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' &#9660;' : ' &#9650;') : '';
    return '<th scope="col" class="' + (key === 'name' ? '' : 'num') + '"><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }

  function boardHtml() {
    var list = sortedRows(visibleRows());
    var count = document.getElementById('count');
    if (count) count.textContent = list.length + ' rows shown';
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category or chain to see the board again.</p><button class="btn" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (!max) max = 1;
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + esc(fmtUsd(r.tvl_usd)) + '</td>' +
        '<td class="num ' + growthClass + '">' + growth + '</td>' +
        '<td class="num">' + esc(fmtAge(r.age_days)) + '</td>' +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + esc(fmtUsd(r.implied_value_usd)) + '</span></div></td>' +
        '<td><span class="status pre">no token</span></td>' +
      '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortBtn('implied', 'Rank') + sortBtn('name', 'Protocol') + sortBtn('tvl', 'TVL') + sortBtn('growth', '7d') + sortBtn('age', 'Age') + sortBtn('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function liveHtml() {
    var count = document.getElementById('count');
    if (count) count.textContent = DATA.live.length + ' live-token protocols';
    var rows = DATA.live.map(function (r) {
      var growthClass = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      return '<tr>' +
        '<td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + esc(fmtUsd(r.tvl_usd)) + '</td>' +
        '<td class="num ' + growthClass + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + esc(fmtUsd(r.mcap_usd)) + '</td>' +
        '<td><span class="status live">already trades</span></td>' +
      '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col" class="num">TVL</th><th scope="col" class="num">7d</th><th scope="col" class="num">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function updateBoard() {
    var slot = document.getElementById('table-slot');
    if (!slot) return;
    slot.innerHTML = state.tab === 'pre-token' ? boardHtml() : liveHtml();
    var panel = document.getElementById('model-panel');
    if (panel) panel.style.display = state.tab === 'pre-token' ? '' : 'none';
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all';
      var q = document.getElementById('q'); if (q) q.value = '';
      var c = document.getElementById('category'); if (c) c.value = 'all';
      var ch = document.getElementById('chain'); if (ch) ch.value = 'all';
      writeHash(); updateBoard();
    });
  }

  // ------------------------------------------------------------ detail view
  var dialog, inner;
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row, DATA.model);
    var agrees = recomputed === row.implied_value_usd;
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    inner.innerHTML =
      '<div class="detail-head"><div>' +
        '<span class="rank">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
        '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
        '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + '</p>' +
      '</div><button class="close" type="button" id="detail-close" aria-label="Close details">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value</h3>' +
        '<div class="equation">' +
          '<div><span>TVL</span><b>' + esc(fmtUsd(row.tvl_usd)) + '</b></div>' +
          '<div><span>Seven-day growth</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
          '<div><span>Age with no token</span><b>' + esc(fmtAge(row.age_days)) + '</b></div>' +
          '<div><span>Chains</span><b>' + (row.chains || []).length + '</b></div>' +
          '<div><span>Growth multiplier</span><b>' + row.growth_multiplier + '</b></div>' +
          '<div><span>Maturity multiplier</span><b>' + row.maturity_multiplier + '</b></div>' +
          '<div><span>Breadth multiplier</span><b>' + row.breadth_multiplier + '</b></div>' +
          '<div><span>Implied value</span><b class="gold">' + esc(fmtUsd(row.implied_value_usd)) + '</b></div>' +
        '</div>' +
        '<p class="note">Model ' + esc(DATA.model_version) + ': the page recomputes this row as ' + esc(fmtUsd(recomputed)) +
        (agrees ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
        ' This is an estimate, not a price.</p>' +
      '</section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></section>';
    document.getElementById('detail-close').addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // ------------------------------------------------------------ wire up
  function render() {
    root.innerHTML = shellHtml();
    root.setAttribute('aria-busy', 'false');
    dialog = document.getElementById('detail');
    inner = document.getElementById('detail-inner');
    dialog.addEventListener('close', function () {
      if (state.selected) { state.selected = null; writeHash(); updateBoard(); }
    });

    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; writeHash(); updateBoard(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); updateBoard(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); updateBoard(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; syncTabs(); updateBoard(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; syncTabs(); updateBoard(); });

    var slot = document.getElementById('table-slot');
    slot.addEventListener('click', function (e) {
      var sortBtnEl = e.target.closest ? e.target.closest('[data-sort]') : null;
      if (sortBtnEl) {
        var key = sortBtnEl.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        updateBoard();
        return;
      }
      var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
      if (tr) openDetail(tr.getAttribute('data-slug'));
    });
    slot.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('tr[data-slug]')) {
        e.preventDefault();
        openDetail(e.target.getAttribute('data-slug'));
      }
    });

    updateBoard();
    if (state.selected) openDetail(state.selected);
  }

  function syncTabs() {
    var pre = document.getElementById('tab-pre');
    var live = document.getElementById('tab-live');
    if (pre) pre.setAttribute('aria-pressed', String(state.tab === 'pre-token'));
    if (live) live.setAttribute('aria-pressed', String(state.tab === 'live'));
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () {
    var had = state.selected;
    readHash();
    var q = document.getElementById('q'); if (q) q.value = state.q;
    var c = document.getElementById('category'); if (c) c.value = state.category;
    var ch = document.getElementById('chain'); if (ch) ch.value = state.chain;
    updateBoard();
    if (state.selected) openDetail(state.selected);
    else if (had && dialog && dialog.open) dialog.close();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && dialog.open) dialog.close();
  });
})();
