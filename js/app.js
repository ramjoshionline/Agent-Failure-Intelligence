/*
 * app.js — application shell, router, and all views for
 * Agent Failure Intelligence.
 *
 * Architecture
 *   - state         : filters, theme, current route, in-memory review edits
 *   - router        : hash-free; renderRoute() swaps the #main content
 *   - shell         : sidebar nav + topbar (search / date / env / theme / user)
 *   - filterbar()   : shared, sticky filter component used by data views
 *   - Views         : Overview, Traces, TraceDetail, Review, Taxonomy,
 *                     Compare, Datasets, Insights, Settings
 *
 * Every visible control does something: charts drill into filtered tables,
 * failure badges open taxonomy detail, steps drive the root-cause panel,
 * reviewers can accept/edit labels, traces can be pinned/compared/promoted.
 */
(function () {
  'use strict';
  const D = window.AMI_DATA;
  const U = window.U;
  const C = window.Charts;
  const icon = window.icon;
  const { fmt, esc } = U;

  // ---- Application state --------------------------------------------------
  const state = {
    route: { view: 'overview', params: {} },
    theme: 'light',
    filters: { dateDays: 140 },
    pinned: [null, null],        // compare: two pinned trace ids
    reviewSelection: new Set(),  // review queue bulk selection
    tracesSort: { key: 'timestamp', dir: 'desc' },
    tracesExpanded: new Set(),
    tracesSelectedRow: null,
  };

  const dateRanges = [
    { days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' },
    { days: 90, label: 'Last 90 days' }, { days: 140, label: 'All time' },
  ];
  let currentEnv = 'production';

  // ---- Router -------------------------------------------------------------
  // View render functions live in a registry so they can be split across
  // files (js/views.js). Each file does: window.AMI_VIEWS.<name> = fn.
  window.AMI_VIEWS = window.AMI_VIEWS || {};
  const VIEWS = window.AMI_VIEWS;
  const routes = {
    overview: { label: 'Overview', icon: 'overview' },
    traces: { label: 'Traces', icon: 'traces' },
    trace: { label: 'Trace', icon: 'traces', hidden: true },
    review: { label: 'Review Queue', icon: 'review' },
    taxonomy: { label: 'Taxonomy', icon: 'taxonomy' },
    compare: { label: 'Compare', icon: 'compare' },
    datasets: { label: 'Datasets', icon: 'datasets' },
    insights: { label: 'Insights', icon: 'insights' },
    settings: { label: 'Settings', icon: 'settings' },
  };

  function navigate(view, params) {
    state.route = { view, params: params || {} };
    U.closeMenus();
    renderRoute();
    renderSidebar();
    document.querySelector('.main').scrollTop = 0;
    const sb = document.querySelector('.sidebar'); if (sb) sb.classList.remove('open');
  }

  function renderRoute() {
    const main = document.querySelector('.main');
    const render = VIEWS[state.route.view] || VIEWS.overview;
    if (!render) { main.innerHTML = '<div class="view"><div class="loading-wrap"><div class="spinner"></div><span>Loading…</span></div></div>'; return; }
    render(main, state.route.params);
  }

  // ---- Filtered dataset accessor -----------------------------------------
  function filtered() { return U.applyFilters(D.traces, state.filters); }

  // ---- Shell --------------------------------------------------------------
  function renderShell() {
    document.getElementById('app').innerHTML = `
      <header class="topbar">
        <div class="brand">
          <span class="logo">${icon('layers', 16)}</span>
          <span class="name">Agent Failure Intelligence<small>Agent failure analysis</small></span>
        </div>
        <div class="topsearch">
          <span class="ico">${icon('search', 16)}</span>
          <input id="globalSearch" type="text" placeholder="Search traces, workflows, tools, failure modes, reviewers…" autocomplete="off" />
          <span class="kbd">/</span>
          <div class="search-results" id="searchResults" style="display:none"></div>
        </div>
        <div class="topbar-spacer"></div>
        <div class="topbar-controls">
          <button class="btn sm" id="dateBtn">${icon('calendar', 15)}<span id="dateLabel">All time</span>${icon('chevronDown', 14)}</button>
          <button class="btn sm" id="envBtn">${icon('globe', 15)}<span id="envLabel">production</span>${icon('chevronDown', 14)}</button>
          <button class="iconbtn" id="themeBtn" title="Toggle theme" aria-label="Toggle theme">${icon('moon', 18)}</button>
          <button class="btn sm" id="userBtn" style="padding-left:5px">${U.reviewerAvatar('r_sam')}<span>Sam W.</span>${icon('chevronDown', 14)}</button>
        </div>
      </header>
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main"></main>`;

    renderSidebar();
    wireTopbar();
    renderRoute();
  }

  function renderSidebar() {
    const sb = document.getElementById('sidebar');
    const trs = D.traces;
    const backlog = trs.filter((t) => t.reviewStatus !== 'reviewed' && t.outcome !== 'pass').length;
    const unlabeled = trs.filter((t) => t.reviewStatus === 'unreviewed').length;
    const navGroups = [
      { items: ['overview', 'traces', 'review'] },
      { label: 'Analyze', items: ['taxonomy', 'compare', 'insights'] },
      { label: 'Operationalize', items: ['datasets', 'settings'] },
    ];
    const counts = { review: backlog, traces: trs.length };
    let html = '<nav class="nav">';
    navGroups.forEach((g) => {
      if (g.label) html += `<div class="nav-section-label">${g.label}</div>`;
      g.items.forEach((key) => {
        const r = routes[key];
        const active = state.route.view === key || (key === 'traces' && state.route.view === 'trace');
        html += `<div class="nav-item${active ? ' active' : ''}" data-nav="${key}">${icon(r.icon, 17)}<span>${r.label}</span>${counts[key] != null ? `<span class="badge-count">${counts[key]}</span>` : ''}</div>`;
      });
    });
    html += '</nav>';
    html += `<div class="sidebar-footer"><div class="nav-section-label" style="padding-top:0">Saved views</div>`;
    D.savedViews.forEach((v) => {
      html += `<div class="saved-view" data-saved="${v.id}">${icon(v.icon, 15)}<span>${esc(v.name)}</span></div>`;
    });
    html += `<div class="saved-view" style="color:var(--text-muted);margin-top:4px" data-newview="1">${icon('plus', 15)}<span>New saved view</span></div></div>`;
    sb.innerHTML = html;

    sb.querySelectorAll('[data-nav]').forEach((n) => n.onclick = () => navigate(n.dataset.nav));
    sb.querySelectorAll('[data-saved]').forEach((n) => n.onclick = () => {
      const v = D.savedViews.find((x) => x.id === n.dataset.saved);
      state.filters = Object.assign({ dateDays: state.filters.dateDays }, v.filters);
      navigate('traces');
      U.toast('Applied saved view: ' + v.name);
    });
    const nv = sb.querySelector('[data-newview]');
    if (nv) nv.onclick = () => U.toast('Saved views capture the current filter set (mock).', 'success');
  }

  function wireTopbar() {
    // theme
    document.getElementById('themeBtn').onclick = toggleTheme;
    // date
    document.getElementById('dateBtn').onclick = (e) => {
      U.openMenu(e.currentTarget, dateRanges.map((d) => ({
        text: d.label, checked: state.filters.dateDays === d.days,
        onClick: () => { state.filters.dateDays = d.days; document.getElementById('dateLabel').textContent = d.label; renderRoute(); },
      })));
    };
    // env
    document.getElementById('envBtn').onclick = (e) => {
      U.openMenu(e.currentTarget, D.environments.map((env) => ({
        text: env, checked: currentEnv === env,
        onClick: () => {
          currentEnv = env; document.getElementById('envLabel').textContent = env;
          state.filters.environment = env === 'production' ? undefined : env;
          if (env === 'production') delete state.filters.environment;
          renderRoute();
        },
      })).concat([{ sep: true }, { text: 'All environments', checked: false, onClick: () => { currentEnv = 'production'; document.getElementById('envLabel').textContent = 'all envs'; delete state.filters.environment; renderRoute(); } }]));
    };
    // user
    document.getElementById('userBtn').onclick = (e) => {
      U.openMenu(e.currentTarget, [
        { label: 'Sam Whitfield · Product Manager' },
        { text: 'Profile & preferences', icon: 'user', onClick: () => navigate('settings') },
        { text: 'Notification hooks', icon: 'alert', onClick: () => { navigate('settings'); } },
        { sep: true },
        { text: 'Sign out', icon: 'external', onClick: () => U.toast('Sign-out is a prototype no-op.') },
      ], 'right');
    };
    // search
    wireSearch();
  }

  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    document.getElementById('themeBtn').innerHTML = icon(state.theme === 'light' ? 'moon' : 'sun', 18);
    renderRoute();
  }

  // ---- Global search ------------------------------------------------------
  function wireSearch() {
    const input = document.getElementById('globalSearch');
    const box = document.getElementById('searchResults');
    let activeIdx = -1; let results = [];
    function run(q) {
      q = q.trim().toLowerCase();
      if (!q) { box.style.display = 'none'; return; }
      results = [];
      // traces by id / goal
      D.traces.forEach((t) => {
        if (t.id.toLowerCase().includes(q) || t.goal.toLowerCase().includes(q)) results.push({ type: 'Trace', label: t.id, meta: t.goal.slice(0, 46), action: () => navigate('trace', { id: t.id }) });
      });
      D.workflows.forEach((w) => { if (w.name.toLowerCase().includes(q)) results.push({ type: 'Workflow', label: w.name, meta: 'Filter traces', action: () => { state.filters.workflow = w.id; navigate('traces'); } }); });
      D.tools.forEach((t) => { if (t.name.toLowerCase().includes(q)) results.push({ type: 'Tool', label: t.name, meta: t.kind, action: () => { state.filters.tool = t.id; navigate('traces'); } }); });
      D.topCategories.forEach((c) => { if (c.name.toLowerCase().includes(q)) results.push({ type: 'Failure mode', label: c.name, meta: 'Open taxonomy', action: () => AMI.openTaxonomyDetail(c.id) }); });
      D.reviewers.forEach((r) => { if (r.name.toLowerCase().includes(q)) results.push({ type: 'Reviewer', label: r.name, meta: r.role, action: () => { state.filters.reviewer = r.id; navigate('traces'); } }); });
      results = results.slice(0, 12);
      if (!results.length) { box.innerHTML = '<div class="sr-item muted">No matches</div>'; box.style.display = 'block'; return; }
      let lastType = null; let html = '';
      results.forEach((r, i) => {
        if (r.type !== lastType) { html += `<div class="sr-group">${r.type}</div>`; lastType = r.type; }
        html += `<div class="sr-item" data-i="${i}">${icon(r.type === 'Trace' ? 'traces' : r.type === 'Tool' ? 'tool' : r.type === 'Reviewer' ? 'user' : r.type === 'Workflow' ? 'branch' : 'taxonomy', 14)}<span>${esc(r.label)}</span><span class="sr-meta">${esc(r.meta)}</span></div>`;
      });
      box.innerHTML = html; box.style.display = 'block'; activeIdx = -1;
      box.querySelectorAll('.sr-item').forEach((it) => it.onclick = () => { results[+it.dataset.i].action(); close(); });
    }
    function close() { box.style.display = 'none'; input.value = ''; }
    input.addEventListener('input', () => run(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); input.blur(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(results.length - 1, activeIdx + 1); mark(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); mark(); }
      if (e.key === 'Enter' && results[activeIdx]) { results[activeIdx].action(); close(); input.blur(); }
    });
    function mark() { box.querySelectorAll('.sr-item').forEach((it, i) => it.classList.toggle('active', i === activeIdx)); }
    document.addEventListener('click', (e) => { if (!e.target.closest('.topsearch')) box.style.display = 'none'; });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== input && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  // ---- Shared: filter bar -------------------------------------------------
  const filterDefs = [
    { key: 'workflow', label: 'Workflow', opts: () => D.workflows.map((w) => [w.id, w.name]) },
    { key: 'release', label: 'Release', opts: () => D.releases.map((r) => [r.id, r.name]) },
    { key: 'segment', label: 'Segment', opts: () => D.segments.map((s) => [s, s]) },
    { key: 'model', label: 'Model', opts: () => D.models.map((m) => [m, m]) },
    { key: 'severity', label: 'Severity', opts: () => D.severities.map((s) => [s, s[0].toUpperCase() + s.slice(1)]) },
    { key: 'failureMode', label: 'Failure mode', opts: () => D.topCategories.map((c) => [c.id, c.name]) },
    { key: 'reviewStatus', label: 'Review', opts: () => [['reviewed', 'Reviewed'], ['in_review', 'In review'], ['unreviewed', 'Unreviewed']] },
    { key: 'reviewer', label: 'Reviewer', opts: () => D.reviewers.map((r) => [r.id, r.name]) },
  ];

  function filterbar(onChange) {
    const f = state.filters;
    const activePills = filterDefs.filter((d) => f[d.key]).map((d) => {
      const opt = d.opts().find((o) => o[0] === f[d.key]);
      return `<span class="filter-pill">${esc(d.label)}: ${esc(opt ? opt[1] : f[d.key])}<button data-clear="${d.key}" aria-label="Remove filter">${icon('close', 12)}</button></span>`;
    });
    if (f.tool) activePills.push(`<span class="filter-pill">Tool: ${esc(f.tool)}<button data-clear="tool" aria-label="Remove">${icon('close', 12)}</button></span>`);
    if (f.surfaceSuccess) activePills.push(`<span class="filter-pill">Surface success<button data-clear="surfaceSuccess" aria-label="Remove">${icon('close', 12)}</button></span>`);
    if (f.dataset) { const ds = D.datasets.find((x) => x.id === f.dataset); activePills.push(`<span class="filter-pill">Dataset: ${esc(ds ? ds.name : f.dataset)}<button data-clear="dataset" aria-label="Remove">${icon('close', 12)}</button></span>`); }
    if (f.outcome) activePills.push(`<span class="filter-pill">Outcome: ${esc(f.outcome)}<button data-clear="outcome" aria-label="Remove">${icon('close', 12)}</button></span>`);

    const wrap = document.createElement('div');
    wrap.className = 'filterbar';
    wrap.innerHTML = `
      <span class="fb-label">${icon('filter', 14)} Filters</span>
      ${filterDefs.map((d) => `<span class="chip-filter"><span class="fc-key">${esc(d.label)}</span><select data-filter="${d.key}"><option value="">Any</option>${d.opts().map((o) => `<option value="${o[0]}"${f[d.key] === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></span>`).join('')}
      <span class="spacer"></span>
      <div class="active-filters">${activePills.join('')}</div>
      ${activePills.length ? `<button class="btn sm ghost" data-clearall="1">Clear all</button>` : ''}`;
    wrap.querySelectorAll('select[data-filter]').forEach((sel) => sel.onchange = () => {
      const k = sel.dataset.filter;
      if (sel.value) f[k] = sel.value; else delete f[k];
      onChange();
    });
    wrap.querySelectorAll('[data-clear]').forEach((b) => b.onclick = () => { delete f[b.dataset.clear]; onChange(); });
    const ca = wrap.querySelector('[data-clearall]');
    if (ca) ca.onclick = () => { state.filters = { dateDays: f.dateDays }; onChange(); };
    return wrap;
  }

  // ---- Delegated: failure-badge -> taxonomy detail ------------------------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-label]');
    if (b && b.classList.contains('label-badge')) { e.stopPropagation(); AMI.openTaxonomyDetail(b.dataset.label); }
  });

  // =========================================================================
  //  VIEW: Overview (executive dashboard)
  // =========================================================================
  function viewOverview(main) {
    const trs = filtered();
    const m = U.metrics(trs);
    const prevWindow = U.applyFilters(D.traces, Object.assign({}, state.filters, { dateDays: (state.filters.dateDays || 140) }));
    // release regression: v1.4 vs v1.3
    const relRates = U.releaseModeRates(D.traces);
    const rel14 = relRates.find((r) => r.release.id === 'v1.4');
    const rel13 = relRates.find((r) => r.release.id === 'v1.3');

    const modeCounts = U.failureModeCounts(trs.filter((t) => t.outcome !== 'pass'));
    const topModes = Object.entries(modeCounts).sort((a, b) => b[1] - a[1]).filter((e) => e[1] > 0).slice(0, 7);

    // KPI deltas (compare recent half vs earlier half of window for trend feel)
    const sorted = trs.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const mid = Math.floor(sorted.length / 2);
    const early = U.metrics(sorted.slice(0, mid)); const late = U.metrics(sorted.slice(mid));
    const failDelta = late.failRate - early.failRate;

    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles">
          <h1>Overview</h1>
          <p>Failure intelligence across ${D.workflows.length} agent workflows. Outcome-only monitoring misses semantic failures — this dashboard surfaces where agents misbehave, why, and whether releases move the numbers.</p>
        </div>
        <div class="head-actions">
          <button class="btn sm" id="ovReview">${icon('review', 15)} Review backlog<span class="badge-count" style="margin-left:4px">${m.backlog}</span></button>
          <button class="btn sm primary" id="ovTraces">${icon('traces', 15)} Explore traces</button>
        </div>
      </div>
      <div id="ovFilter"></div>
      <div class="kpi-row" id="ovKpis"></div>
      <div class="col-2-1 mb-16">
        <div class="card">
          <div class="card-head"><h3>Failure-mode trend</h3><span class="sub">weekly, by primary label</span><div class="head-actions"><div class="segmented" id="trendMode"><button class="active" data-mode="count">Count</button><button data-mode="rate">Rate</button></div></div></div>
          <div class="chart-legend" id="trendLegend"></div>
          <div class="card-pad" style="padding-top:4px"><div id="trendChart"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Outcome mix</h3><span class="sub">${fmt.int(m.total)} runs</span></div>
          <div class="card-pad" style="display:flex;flex-direction:column;align-items:center;gap:10px">
            <div id="outcomeDonut"></div>
            <div id="outcomeLegend" style="width:100%"></div>
          </div>
        </div>
      </div>
      <div class="two-col mb-16">
        <div class="card">
          <div class="card-head"><h3>Worst workflows</h3><span class="sub">by misbehavior rate</span></div>
          <div class="table-wrap"><table class="data" id="wfTable"></table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Highest-risk tools</h3><span class="sub">share of runs where the tool is the root-cause step</span></div>
          <div style="padding:8px 0" id="toolLeaderboard"></div>
        </div>
      </div>
      <div class="three-col mb-16">
        <div class="card">
          <div class="card-head"><h3>Regressions after v1.4</h3><span class="sub">vs v1.3</span></div>
          <div class="card-pad"><div id="regressionBars"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Most expensive failing runs</h3><span class="sub">cost of bad outcomes</span></div>
          <div id="expensiveList"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Failures converted to evals</h3><span class="sub">reusable regression assets</span></div>
          <div class="card-pad" id="evalConvert"></div>
        </div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-head"><h3>Human review backlog</h3><span class="sub">newest unlabeled &amp; uncertain traces</span><div class="head-actions"><button class="btn sm" id="goReview">Open queue ${icon('arrowRight', 13)}</button></div></div>
          <div id="backlogList"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Top failure themes</h3><span class="sub">click a mode to drill in</span></div>
          <div style="padding:8px 0" id="themeLeaderboard"></div>
        </div>
      </div>
    </div>`;

    // filter bar
    main.querySelector('#ovFilter').appendChild(filterbar(() => navigate('overview')));

    // KPIs
    const kpis = [
      { label: 'Total runs', value: fmt.int(m.total), sub: `${fmt.int(m.reviewed)} reviewed`, click: () => navigate('traces') },
      { label: 'Pass rate', value: fmt.pct(m.passRate, 0), sub: deltaEl(-failDelta, true), click: () => { state.filters.outcome = 'pass'; navigate('traces'); } },
      { label: 'Misbehavior rate', value: fmt.pct(m.failRate, 0), sub: deltaEl(failDelta, false), click: () => { delete state.filters.outcome; state.filters.severity && delete state.filters.severity; navigate('traces'); } },
      { label: 'Critical failures', value: fmt.int(m.critical), sub: 'severity = critical', click: () => { state.filters.severity = 'critical'; navigate('traces'); } },
      { label: 'Surface-success failures', value: fmt.int(m.surfaceSuccess), sub: 'look right, are wrong', click: () => { state.filters.surfaceSuccess = true; navigate('traces'); } },
      { label: 'Review backlog', value: fmt.int(m.backlog), sub: 'awaiting triage', click: () => navigate('review') },
      { label: 'Failure spend', value: fmt.usdShort(trs.filter((t) => t.outcome !== 'pass').reduce((s, t) => s + t.cost, 0)), sub: 'cost of bad runs', click: () => navigate('traces') },
    ];
    main.querySelector('#ovKpis').innerHTML = kpis.map((k, i) => `<div class="kpi clickable" data-kpi="${i}"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div></div>`).join('');
    main.querySelectorAll('[data-kpi]').forEach((el) => el.onclick = () => kpis[+el.dataset.kpi].click());

    // trend
    const trendKeys = topModes.slice(0, 6).map((e) => e[0]);
    let trendMode = 'count';
    const trendActive = {};
    function drawTrend() {
      const trend = U.weeklyTrend(trs, trendKeys);
      let series = trend.series;
      if (trendMode === 'rate') {
        series = series.map((s) => ({ key: s.key, name: s.name, values: s.values.map((v, i) => trend.totalsPerWeek[i] ? v / trend.totalsPerWeek[i] : 0) }));
      }
      C.lineTrend(main.querySelector('#trendChart'), {
        labels: trend.labels, series, active: trendActive, pct: trendMode === 'rate', height: 240,
        onClick: (idx) => { U.toast('Week of ' + trend.labels[idx] + ' — click a mode below to filter'); },
      });
      main.querySelector('#trendLegend').innerHTML = trendKeys.map((k) => `<span class="legend-item${trendActive[k] === false ? ' muted' : ''}" data-leg="${k}"><span class="swatch" style="background:${C.seriesColor(k)}"></span>${esc(D.taxonomyById[k].name)}</span>`).join('');
      main.querySelectorAll('#trendLegend [data-leg]').forEach((l) => l.onclick = () => { const k = l.dataset.leg; trendActive[k] = trendActive[k] === false ? true : false; drawTrend(); });
    }
    drawTrend();
    main.querySelectorAll('#trendMode button').forEach((b) => b.onclick = () => {
      main.querySelectorAll('#trendMode button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); trendMode = b.dataset.mode; drawTrend();
    });

    // outcome donut
    const oc = { pass: trs.filter((t) => t.outcome === 'pass').length, partial: trs.filter((t) => t.outcome === 'partial').length, fail: trs.filter((t) => t.outcome === 'fail').length };
    C.donut(main.querySelector('#outcomeDonut'), {
      size: 168, parts: [
        { name: 'Pass', value: oc.pass, color: 'var(--st-good)' },
        { name: 'Partial', value: oc.partial, color: 'var(--st-warning)' },
        { name: 'Fail', value: oc.fail, color: 'var(--st-critical)' },
      ], center: fmt.pct(m.passRate, 0), centerSub: 'pass rate',
      onClick: (p) => { state.filters.outcome = p.name.toLowerCase(); navigate('traces'); },
    });
    main.querySelector('#outcomeLegend').innerHTML = [['Pass', oc.pass, 'var(--st-good)'], ['Partial', oc.partial, 'var(--st-warning)'], ['Fail', oc.fail, 'var(--st-critical)']]
      .map(([n, v, c]) => `<div class="flex" style="justify-content:space-between;padding:3px 4px;font-size:12px"><span class="flex" style="gap:6px"><span class="dot" style="width:9px;height:9px;border-radius:3px;background:${c};display:inline-block"></span>${n}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${v} · ${fmt.pct(v / (m.total || 1), 0)}</span></div>`).join('');

    // worst workflows table
    const wfs = U.workflowStats(trs).sort((a, b) => b.failRate - a.failRate);
    main.querySelector('#wfTable').innerHTML = `
      <thead><tr><th class="nosort">Workflow</th><th class="nosort">Runs</th><th class="nosort">Misbehavior</th><th class="nosort">Top mode</th><th class="nosort">Critical</th></tr></thead>
      <tbody>${wfs.map((w) => `<tr data-wf="${w.workflow.id}">
        <td><div style="font-weight:500">${esc(w.workflow.name)}</div><div class="muted" style="font-size:11px">${esc(w.workflow.owner)}</div></td>
        <td class="num">${w.total}</td>
        <td><div class="flex" style="gap:8px"><div class="minibar" style="width:60px"><span style="width:${Math.min(100, w.failRate * 160)}%;background:${w.failRate > 0.4 ? 'var(--st-critical)' : w.failRate > 0.3 ? 'var(--st-serious)' : 'var(--st-warning)'}"></span></div><span style="font-variant-numeric:tabular-nums;font-weight:600">${fmt.pct(w.failRate, 0)}</span></div></td>
        <td>${w.topMode ? U.labelBadge(w.topMode) : '<span class="muted">—</span>'}</td>
        <td class="num">${w.critical || '<span class="muted">0</span>'}</td>
      </tr>`).join('')}</tbody>`;
    main.querySelectorAll('#wfTable tbody tr').forEach((tr) => tr.onclick = () => { state.filters.workflow = tr.dataset.wf; navigate('traces'); });

    // tool leaderboard
    const tools = U.toolStats(trs).sort((a, b) => b.risk - a.risk).slice(0, 8);
    C.leaderboard(main.querySelector('#toolLeaderboard'), {
      rows: tools.map((t) => ({ name: t.tool.name, value: t.risk, sub: `${t.implicated}/${t.uses}`, color: t.risk > 0.25 ? 'var(--st-critical)' : t.risk > 0.15 ? 'var(--st-serious)' : 'var(--series-1)' })),
      fmt: (v) => fmt.pct(v, 0),
      onClick: (r) => { const tl = D.tools.find((x) => x.name === r.name); state.filters.tool = tl.id; navigate('traces'); },
    });

    // regression bars v1.4 vs v1.3
    const regRows = D.topCategories.map((c) => ({ name: c.name, key: c.id, delta: Math.round(((rel14.rates[c.id] - rel13.rates[c.id]) * 100)) }))
      .filter((r) => Math.abs(r.delta) >= 2).sort((a, b) => b.delta - a.delta).slice(0, 6);
    C.deltaBars(main.querySelector('#regressionBars'), { rows: regRows, onClick: (r) => { state.filters.release = 'v1.4'; state.filters.failureMode = r.key; navigate('traces'); } });

    // expensive failing runs
    const expensive = trs.filter((t) => t.outcome !== 'pass').sort((a, b) => b.cost - a.cost).slice(0, 6);
    main.querySelector('#expensiveList').innerHTML = expensive.map((t) => `<div class="lb-row" data-tr="${t.id}" style="grid-template-columns:1fr auto">
      <div><div class="flex" style="gap:7px">${U.labelBadge(t.primaryLabel, { clickable: false })}<span class="muted pill-mono" style="font-size:11px">${t.id}</span></div><div class="muted" style="font-size:11px;margin-top:3px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.goal)}</div></div>
      <div class="lb-val" style="color:var(--st-critical)">${fmt.usd(t.cost)}</div></div>`).join('');
    main.querySelectorAll('#expensiveList [data-tr]').forEach((r) => r.onclick = () => navigate('trace', { id: r.dataset.tr }));

    // evals converted
    const totalPromoted = D.datasets.reduce((s, d) => s + d.size, 0);
    main.querySelector('#evalConvert').innerHTML = `
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px"><span style="font-size:28px;font-weight:700">${totalPromoted}</span><span class="muted">labeled cases across ${D.datasets.length} datasets</span></div>
      ${D.datasets.slice(0, 4).map((d) => `<div class="lb-row" data-ds="${d.id}" style="grid-template-columns:1fr auto;padding-left:0;padding-right:0">
        <div class="flex" style="gap:8px">${U.labelBadge(d.failureMode, { clickable: false })}<span style="font-size:12px">${esc(d.name)}</span></div>
        <div class="flex" style="gap:6px">${d.inRegressionSuite ? `<span class="tag">${icon('beaker', 11)} suite</span>` : ''}<span class="lb-val">${d.size}</span></div></div>`).join('')}`;
    main.querySelectorAll('#evalConvert [data-ds]').forEach((r) => r.onclick = () => navigate('datasets', { id: r.dataset.ds }));

    // backlog list
    const backlog = trs.filter((t) => t.reviewStatus !== 'reviewed' && t.outcome !== 'pass').slice(0, 6);
    main.querySelector('#backlogList').innerHTML = backlog.length ? backlog.map((t) => `<div class="rq-item" data-tr="${t.id}" style="grid-template-columns:1fr auto">
      <div><div class="rq-goal">${esc(t.goal)}</div><div class="rq-meta">${esc(D.workflowById[t.workflow].name)} · ${t.id} · ${U.reviewBadge(t.reviewStatus)} · conf ${fmt.pct((t.labels.find((l) => l.source === 'model_suggestion') || {}).confidence || 0, 0)}</div></div>
      <div>${U.labelBadge(t.suggestedLabel || t.primaryLabel, { clickable: false })}</div></div>`).join('') : emptyInline('All caught up', 'No unreviewed misbehaving traces in this window.');
    main.querySelectorAll('#backlogList [data-tr]').forEach((r) => r.onclick = () => navigate('trace', { id: r.dataset.tr }));

    // theme leaderboard
    C.leaderboard(main.querySelector('#themeLeaderboard'), {
      rows: topModes.map(([k, v]) => ({ name: D.taxonomyById[k].name, value: v, color: C.seriesColor(k) })),
      fmt: (v) => fmt.int(v),
      onClick: (r) => { const c = D.topCategories.find((x) => x.name === r.name); state.filters.failureMode = c.id; navigate('traces'); },
    });

    // header buttons
    main.querySelector('#ovReview').onclick = () => navigate('review');
    main.querySelector('#ovTraces').onclick = () => navigate('traces');
    main.querySelector('#goReview').onclick = () => navigate('review');
  }

  function deltaEl(delta, goodWhenNegative) {
    const pctPts = (delta * 100);
    const up = pctPts >= 0;
    const cls = up ? (goodWhenNegative ? 'up' : 'up') : 'down';
    const good = goodWhenNegative ? !up : up === false;
    const arrow = up ? icon('trend', 12) : icon('trendDown', 12);
    const color = (goodWhenNegative ? !up : up) ? 'var(--st-critical)' : 'var(--st-good)';
    return `<span class="delta" style="color:${color}">${arrow}${(up ? '+' : '') + pctPts.toFixed(1)} pts</span><span class="muted">vs window start</span>`;
  }
  function emptyInline(title, body) {
    return `<div class="empty-state" style="padding:28px 16px"><div class="es-icon">${icon('checkCircle', 22)}</div><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
  }

  // ---- Internal API for split-out view files (js/views.js) ----------------
  // Every helper the other views need is exposed here so they can live in a
  // separate file while sharing this closure's state and utilities.
  const AMI = {
    D, U, C, icon, fmt, esc,
    state, navigate, filtered, filterbar, emptyInline, deltaEl,
    reRenderSidebar: renderSidebar,
    // registered by views.js after load:
    openTaxonomyDetail: function () {},
  };
  window.AMI = AMI;
  VIEWS.overview = viewOverview;

  // ---- boot ---------------------------------------------------------------
  function boot() {
    document.documentElement.setAttribute('data-theme', 'light');
    renderShell();
  }
  // Wait for view modules to register (they run synchronously after this file).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
