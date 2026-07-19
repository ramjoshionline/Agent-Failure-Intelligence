/*
 * views2.js — Review Queue, Taxonomy, Compare, Datasets, Insights, Settings.
 * Continues the view registry from views.js. Shares window.AMI.
 */
(function () {
  'use strict';
  const AMI = window.AMI;
  const { D, U, C, icon, fmt, esc, state, navigate, filtered, filterbar, emptyInline } = AMI;
  const VIEWS = window.AMI_VIEWS;
  const H = window.AMI_VIEW_HELPERS;

  // =========================================================================
  //  VIEW: Review Queue
  // =========================================================================
  function viewReview(main) {
    if (!state.reviewSort) state.reviewSort = 'uncertainty';
    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles"><h1>Review queue</h1><p>An annotation workbench for triaging unlabeled and uncertain traces. Compare the model-suggested label against your judgment, capture rationale, and clear the backlog.</p></div>
        <div class="head-actions">
          <div class="segmented" id="rqSort">
            <button class="active" data-s="uncertainty">Uncertainty</button>
            <button data-s="impact">User impact</button>
            <button data-s="cost">Cost</button>
            <button data-s="enterprise">Enterprise</button>
          </div>
        </div>
      </div>
      <div id="rqFilter"></div>
      <div class="kpi-row" id="rqKpis"></div>
      <div id="rqBulk"></div>
      <div class="card">
        <div class="table-toolbar">
          <span class="checkbox" id="rqSelectAll" title="Select all"></span>
          <span class="count" id="rqCount"></span>
          <span class="spacer"></span>
          <span class="muted" style="font-size:11.5px">Sorted by ${labelForSort(state.reviewSort)}</span>
        </div>
        <div id="rqList"></div>
      </div>
    </div>`;

    main.querySelector('#rqFilter').appendChild(filterbar(() => viewReview(main)));

    function queue() {
      let rows = filtered().filter((t) => t.outcome !== 'pass' && t.reviewStatus !== 'reviewed');
      const sort = state.reviewSort;
      rows.sort((a, b) => {
        if (sort === 'uncertainty') return conf(a) - conf(b);
        if (sort === 'impact') return impact(b) - impact(a);
        if (sort === 'cost') return b.cost - a.cost;
        if (sort === 'enterprise') return (b.segment === 'Enterprise') - (a.segment === 'Enterprise') || impact(b) - impact(a);
        return 0;
      });
      return rows;
    }
    function conf(t) { const l = t.labels.find((x) => x.source === 'model_suggestion'); return l ? l.confidence : 1; }
    function impact(t) { return (D.severityRank[t.severity] || 0) * 10 + (t.segment === 'Enterprise' ? 5 : 0) + (t.humanFeedback === 'thumbs_down' ? 3 : 0); }

    function render() {
      const rows = queue();
      const allReviewable = filtered().filter((t) => t.outcome !== 'pass');
      const m = U.metrics(allReviewable);
      main.querySelector('#rqKpis').innerHTML = [
        { label: 'In queue', value: rows.length, sub: 'unreviewed & uncertain' },
        { label: 'Avg model confidence', value: fmt.pct(rows.reduce((s, t) => s + conf(t), 0) / (rows.length || 1), 0), sub: 'lower = needs eyes' },
        { label: 'Enterprise in queue', value: rows.filter((t) => t.segment === 'Enterprise').length, sub: 'prioritized' },
        { label: 'Critical in queue', value: rows.filter((t) => t.severity === 'critical').length, sub: 'severity = critical' },
        { label: 'Reviewed (window)', value: filtered().filter((t) => t.reviewStatus === 'reviewed').length, sub: 'labels confirmed/corrected' },
      ].map((k) => `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub muted">${esc(k.sub)}</div></div>`).join('');

      main.querySelector('#rqCount').textContent = `${rows.length} traces to review`;
      const list = main.querySelector('#rqList');
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state"><div class="es-icon">${icon('checkCircle', 24)}</div><h3>Queue is clear</h3><p>No unreviewed misbehaving traces match the current filters. Here's the review workflow when new traces arrive:</p>
          <div class="es-steps">
            <div class="es-step"><span class="n">1</span><span>Traces are auto-labeled by the classifier with a confidence score.</span></div>
            <div class="es-step"><span class="n">2</span><span>Low-confidence and high-impact runs surface here, sorted by uncertainty.</span></div>
            <div class="es-step"><span class="n">3</span><span>You confirm or correct the label, set severity, and capture rationale.</span></div>
            <div class="es-step"><span class="n">4</span><span>Reviewed failures can be promoted into eval datasets and regression suites.</span></div>
          </div></div>`;
        return;
      }
      list.innerHTML = rows.map((t) => {
        const sug = t.labels.find((x) => x.source === 'model_suggestion');
        const selected = state.reviewSelection.has(t.id);
        return `<div class="rq-item" data-tr="${t.id}">
          <span class="checkbox${selected ? ' checked' : ''}" data-check="${t.id}">${selected ? icon('check', 12) : ''}</span>
          <div>
            <div class="rq-goal">${esc(t.goal)}</div>
            <div class="rq-meta">
              <span class="pill-mono">${t.id}</span>
              <span>${esc(D.workflowById[t.workflow].name)}</span>
              <span>${t.segment === 'Enterprise' ? '<span class="tag" style="color:var(--series-7)">' + icon('star', 10) + ' Enterprise</span>' : t.segment}</span>
              <span>${t.release}</span>
              ${U.severityBadge(t.severity)}
              ${t.humanFeedback === 'thumbs_down' ? '<span class="tag" style="color:var(--st-critical-fg)">👎 rejected</span>' : ''}
            </div>
          </div>
          <div class="rq-labels">
            <div class="rq-compare">
              <span class="muted" style="font-size:11px">suggested</span>
              ${U.labelBadge(sug ? sug.label_id : t.primaryLabel, { clickable: false })}
              <span class="conf-chip" style="font-size:11px;color:${(sug ? sug.confidence : 1) < 0.5 ? 'var(--st-critical)' : 'var(--text-muted)'}">${fmt.pct(sug ? sug.confidence : 0, 0)}</span>
            </div>
            <button class="btn sm" data-review="${t.id}">${icon('edit', 13)} Review</button>
          </div>
        </div>`;
      }).join('');

      list.querySelectorAll('.rq-item').forEach((el) => el.onclick = (e) => {
        if (e.target.closest('[data-check]')) { toggleSel(el.dataset.tr); return; }
        if (e.target.closest('[data-review]')) { openReview(el.dataset.tr); return; }
        if (e.target.closest('[data-label]')) return;
        navigate('trace', { id: el.dataset.tr });
      });
      renderBulk();
    }

    function toggleSel(id) { if (state.reviewSelection.has(id)) state.reviewSelection.delete(id); else state.reviewSelection.add(id); render(); }
    function openReview(id) { AMI.openLabelEditor(D.traces.find((t) => t.id === id), () => { AMI.reRenderSidebar(); state.reviewSelection.delete(id); render(); }); }

    function renderBulk() {
      const bulk = main.querySelector('#rqBulk');
      const n = state.reviewSelection.size;
      if (!n) { bulk.innerHTML = ''; return; }
      bulk.innerHTML = `<div class="bulk-bar">
        <span class="bb-count">${n} selected</span>
        <button class="btn sm" id="bAssign">${icon('user', 13)} Assign reviewer</button>
        <button class="btn sm" id="bReviewed">${icon('check', 13)} Mark reviewed</button>
        <button class="btn sm" id="bPromote">${icon('beaker', 13)} Promote to dataset</button>
        <span class="spacer"></span>
        <button class="btn sm ghost" id="bClear">Clear</button>
      </div>`;
      bulk.querySelector('#bClear').onclick = () => { state.reviewSelection.clear(); render(); };
      bulk.querySelector('#bAssign').onclick = (e) => {
        U.openMenu(e.currentTarget, D.reviewers.map((r) => ({ text: r.name, icon: 'user', onClick: () => {
          state.reviewSelection.forEach((id) => { const t = D.traces.find((x) => x.id === id); t.reviewer = r.id; t.reviewStatus = 'in_review'; });
          U.toast('Assigned ' + state.reviewSelection.size + ' traces to ' + r.name + '.', 'success'); state.reviewSelection.clear(); AMI.reRenderSidebar(); render();
        } })));
      };
      bulk.querySelector('#bReviewed').onclick = () => {
        let c = 0; state.reviewSelection.forEach((id) => { const t = D.traces.find((x) => x.id === id); const sug = t.labels.find((l) => l.source === 'model_suggestion'); if (sug && !t.labels.find((l) => l.source === 'human_review')) { t.labels.push({ label_id: sug.label_id, subtype_id: sug.subtype_id, source: 'human_review', confidence: 0.9, reviewer: 'r_sam', timestamp: new Date(U.NOW).toISOString(), note: 'Bulk-accepted model suggestion.', root_cause_step_id: t.rootStepId, severity: sug.severity }); } t.reviewStatus = 'reviewed'; t.reviewer = t.reviewer || 'r_sam'; c++; });
        U.toast('Marked ' + c + ' traces reviewed (accepted suggestions).', 'success'); state.reviewSelection.clear(); AMI.reRenderSidebar(); render();
      };
      bulk.querySelector('#bPromote').onclick = () => { const ts = [...state.reviewSelection].map((id) => D.traces.find((x) => x.id === id)); AMI.promoteModal(ts); };
    }

    main.querySelector('#rqSelectAll').onclick = () => {
      const rows = queue();
      const allSel = rows.every((t) => state.reviewSelection.has(t.id));
      if (allSel) rows.forEach((t) => state.reviewSelection.delete(t.id)); else rows.forEach((t) => state.reviewSelection.add(t.id));
      render();
    };
    main.querySelectorAll('#rqSort button').forEach((b) => b.onclick = () => { main.querySelectorAll('#rqSort button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); state.reviewSort = b.dataset.s; render(); });
    render();
  }
  function labelForSort(s) { return { uncertainty: 'uncertainty (lowest confidence first)', impact: 'user impact', cost: 'cost', enterprise: 'enterprise customers' }[s]; }
  VIEWS.review = viewReview;

  // =========================================================================
  //  VIEW: Taxonomy
  // =========================================================================
  function viewTaxonomy(main) {
    if (!state._taxSel) state._taxSel = D.topCategories[0].id;
    const counts = {};
    D.traces.forEach((t) => { if (t.primaryLabel) counts[t.primaryLabel] = (counts[t.primaryLabel] || 0) + 1; });

    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles"><h1>Failure taxonomy</h1><p>A first-class, structured vocabulary for agent misbehavior. Every label carries a definition, inclusion/exclusion criteria, symptoms, severity guidance, and remediations — so reviewers label consistently.</p></div>
        <div class="head-actions"><button class="btn sm" id="taxHeatBtn">${icon('grid', 15)} Tool × mode heatmap</button></div>
      </div>
      <div class="taxonomy-layout">
        <div class="tax-list" id="taxList"></div>
        <div class="card card-pad tax-detail" id="taxDetail"></div>
      </div>
    </div>`;

    function renderList() {
      const list = main.querySelector('#taxList');
      list.innerHTML = D.topCategories.map((c) => {
        const subs = D.subtypesByParent[c.id] || [];
        const active = state._taxSel === c.id || subs.some((s) => s.id === state._taxSel);
        return `<div class="tax-cat">
          <div class="tax-cat-head${state._taxSel === c.id ? ' active' : ''}" data-cat="${c.id}">
            <span class="dot" style="width:9px;height:9px;border-radius:3px;background:${C.seriesColor(c.id)}"></span>
            <span class="tc-name">${esc(c.name)}</span>
            <span class="tc-count">${counts[c.id] || 0}</span>
          </div>
          ${active && subs.length ? `<div class="tax-sub">${subs.map((s) => `<div class="tax-sub-item${state._taxSel === s.id ? ' active' : ''}" data-cat="${s.id}">${icon('arrowRight', 12)} ${esc(s.name)}</div>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
      list.querySelectorAll('[data-cat]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); state._taxSel = el.dataset.cat; renderList(); renderDetail(); });
    }

    function renderDetail() {
      const cat = D.taxonomyById[state._taxSel];
      const isSub = !!cat.parent_id;
      const parent = isSub ? D.taxonomyById[cat.parent_id] : cat;
      const subs = D.subtypesByParent[parent.id] || [];
      const modeTraces = D.traces.filter((t) => t.primaryLabel === parent.id);
      const reviewed = modeTraces.filter((t) => t.reviewStatus === 'reviewed').length;
      const color = C.seriesColor(parent.id);
      const el = main.querySelector('#taxDetail');
      el.innerHTML = `
        <div class="flex" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
          <div>
            <div class="flex" style="gap:9px"><span class="dot" style="width:11px;height:11px;border-radius:3px;background:${color}"></span><h2 style="font-size:17px">${esc(cat.name)}</h2>${isSub ? `<span class="tag">subtype of ${esc(parent.name)}</span>` : ''}</div>
            <p class="secondary" style="margin:8px 0 0;max-width:680px">${esc(cat.description)}</p>
          </div>
          <div class="flex" style="gap:8px">
            <button class="btn sm" data-viewtraces>${icon('traces', 13)} ${modeTraces.length} traces</button>
          </div>
        </div>
        <div class="kpi-row" style="margin:16px 0">
          <div class="kpi"><div class="kpi-label">Default severity</div><div style="margin-top:8px">${U.severityBadge(cat.severity_default)}</div></div>
          <div class="kpi"><div class="kpi-label">Labeled traces</div><div class="kpi-value" style="font-size:22px">${modeTraces.length}</div></div>
          <div class="kpi"><div class="kpi-label">Reviewed</div><div class="kpi-value" style="font-size:22px">${reviewed}</div><div class="kpi-sub muted">${fmt.pct(modeTraces.length ? reviewed / modeTraces.length : 0, 0)} of category</div></div>
          <div class="kpi"><div class="kpi-label">Subtypes</div><div class="kpi-value" style="font-size:22px">${subs.length}</div></div>
        </div>
        ${cat.inclusion ? `<div class="criteria-grid" style="margin-bottom:18px">
          <div class="criteria-card include"><h4 style="color:var(--st-good-fg)">${icon('check', 13)} Inclusion criteria</h4><p class="secondary" style="margin:0;font-size:12.5px">${esc(cat.inclusion)}</p></div>
          <div class="criteria-card exclude"><h4 style="color:var(--st-critical-fg)">${icon('close', 13)} Exclusion criteria</h4><p class="secondary" style="margin:0;font-size:12.5px">${esc(cat.exclusion || '—')}</p></div>
        </div>` : ''}
        <div class="two-col">
          <div class="def-section"><h4>Typical symptoms</h4><ul>${(cat.symptoms || []).map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div>
          <div class="def-section"><h4>${cat.examples && cat.examples.length ? 'Example patterns' : 'Review guidance'}</h4>${cat.examples && cat.examples.length ? `<ul>${cat.examples.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<p class="secondary" style="font-size:12.5px">${esc(cat.review_guidance)}</p>`}</div>
        </div>
        <div class="def-section"><h4>Severity guidance &amp; review notes</h4><div class="io-summary">${esc(cat.review_guidance)}</div></div>
        <div class="def-section"><h4>Suggested remediations</h4><div class="io-summary" style="border-left:3px solid ${color}">${esc(cat.remediations)}</div></div>
        ${subs.length ? `<div class="def-section"><h4>Subtypes</h4><div class="flex wrap" style="gap:8px">${subs.map((s) => `<div class="criteria-card" style="flex:1;min-width:200px;cursor:pointer" data-sub="${s.id}"><div style="font-weight:600;font-size:12.5px">${esc(s.name)}</div><div class="secondary" style="font-size:11.5px;margin-top:3px">${esc(s.description)}</div></div>`).join('')}</div></div>` : ''}
        <div class="def-section"><h4>Example traces</h4>${modeTraces.length ? modeTraces.slice(0, 5).map((t) => `<div class="rq-item" data-tr="${t.id}" style="grid-template-columns:1fr auto"><div><div class="rq-goal">${esc(t.goal)}</div><div class="rq-meta">${t.id} · ${esc(D.workflowById[t.workflow].name)} · ${t.release} · ${U.reviewBadge(t.reviewStatus)}</div></div>${U.severityBadge(t.severity)}</div>`).join('') : '<p class="muted">No labeled traces yet.</p>'}</div>`;
      el.querySelector('[data-viewtraces]').onclick = () => { state.filters.failureMode = parent.id; navigate('traces'); };
      el.querySelectorAll('[data-sub]').forEach((s) => s.onclick = () => { state._taxSel = s.dataset.sub; renderList(); renderDetail(); });
      el.querySelectorAll('[data-tr]').forEach((r) => r.onclick = () => navigate('trace', { id: r.dataset.tr }));
    }

    main.querySelector('#taxHeatBtn').onclick = () => openHeatmapModal();
    renderList(); renderDetail();
  }
  VIEWS.taxonomy = viewTaxonomy;

  function openHeatmapModal() {
    const { rows, cols, matrix } = U.toolFailureMatrix(D.traces);
    U.openModal({
      title: 'Tool × failure-mode heatmap', wide: true,
      body: `<p class="secondary" style="margin-top:0">Where each failure mode concentrates by root-cause tool. Darker = more occurrences. Click a cell to inspect those traces.</p><div id="hmChart"></div>`,
      footer: '<button class="btn" data-close>Close</button>',
      onMount: (modal, close) => {
        C.heatmap(modal.querySelector('#hmChart'), { rows, cols, matrix, onClick: (r, c) => { close(); state.filters.tool = r.id; state.filters.failureMode = c.id; navigate('traces'); } });
        modal.querySelector('[data-close]').onclick = close;
      },
    });
  }

  // =========================================================================
  //  VIEW: Compare / regression analysis
  // =========================================================================
  function viewCompare(main) {
    if (!state._cmp) state._cmp = { mode: 'release', a: 'v1.3', b: 'v1.4' };
    const cmp = state._cmp;

    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles"><h1>Compare &amp; regression analysis</h1><p>Quantify what a release, prompt variant, or workflow change did to the failure mix — what improved, what regressed, and the representative traces behind each shift.</p></div>
      </div>
      <div class="card card-pad mb-16">
        <div class="flex wrap" style="gap:14px;align-items:flex-end">
          <div><label class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">Dimension</label>
            <select class="control" id="cmpMode">
              <option value="release"${cmp.mode === 'release' ? ' selected' : ''}>Before vs after release</option>
              <option value="model"${cmp.mode === 'model' ? ' selected' : ''}>Model version A vs B</option>
              <option value="segment"${cmp.mode === 'segment' ? ' selected' : ''}>User segment A vs B</option>
              <option value="environment"${cmp.mode === 'environment' ? ' selected' : ''}>Environment A vs B</option>
            </select></div>
          <div><label class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">Baseline (A)</label><select class="control" id="cmpA"></select></div>
          <div style="align-self:center;padding-top:18px">${icon('compare', 18)}</div>
          <div><label class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">Candidate (B)</label><select class="control" id="cmpB"></select></div>
          <div style="flex:1"></div>
          <div class="muted" style="font-size:12px">Workflow: <select class="control" id="cmpWf" style="height:28px"><option value="">All</option>${D.workflows.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
        </div>
      </div>
      <div id="cmpResults"></div>
      <div class="card mb-16" style="margin-top:16px">
        <div class="card-head"><h3>Pin two traces side-by-side</h3><span class="sub">same task across two versions</span></div>
        <div class="card-pad"><div class="pinned-traces" id="pinArea"></div></div>
      </div>
    </div>`;

    function optsFor(mode) {
      if (mode === 'release') return D.releases.map((r) => [r.id, r.name]);
      if (mode === 'model') return D.models.map((m) => [m, m]);
      if (mode === 'segment') return D.segments.map((s) => [s, s]);
      if (mode === 'environment') return D.environments.map((e) => [e, e]);
      return [];
    }
    function fill() {
      const opts = optsFor(cmp.mode);
      const aSel = main.querySelector('#cmpA'), bSel = main.querySelector('#cmpB');
      aSel.innerHTML = opts.map((o) => `<option value="${o[0]}"${cmp.a === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('');
      bSel.innerHTML = opts.map((o) => `<option value="${o[0]}"${cmp.b === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('');
      if (!opts.find((o) => o[0] === cmp.a)) cmp.a = opts[0][0];
      if (!opts.find((o) => o[0] === cmp.b)) cmp.b = opts[opts.length - 1][0];
      aSel.value = cmp.a; bSel.value = cmp.b;
    }

    function setFor(val) {
      const wf = main.querySelector('#cmpWf').value;
      return D.traces.filter((t) => t[cmp.mode] === val && (!wf || t.workflow === wf));
    }

    function render() {
      const A = setFor(cmp.a), B = setFor(cmp.b);
      const mA = U.metrics(A), mB = U.metrics(B);
      const modesA = rateMix(A), modesB = rateMix(B);
      const el = main.querySelector('#cmpResults');
      const metricRows = [
        ['Runs', mA.total, mB.total, false],
        ['Misbehavior rate', mA.failRate, mB.failRate, true, true],
        ['Pass rate', mA.passRate, mB.passRate, true, false],
        ['Critical failures', mA.critical, mB.critical, false, true],
        ['Avg cost', mA.avgCost, mB.avgCost, false, true, true],
        ['Avg duration', mA.avgDuration, mB.avgDuration, false, true, false, true],
      ];
      const deltaRows = D.topCategories.map((c) => ({ name: c.name, key: c.id, delta: Math.round((modesB[c.id] - modesA[c.id]) * 100) })).filter((r) => Math.abs(r.delta) >= 1).sort((a, b) => b.delta - a.delta);

      el.innerHTML = `
        <div class="two-col mb-16">
          <div class="card"><div class="card-head"><h3>Metric comparison</h3><span class="sub">${esc(labelOf(cmp.a))} → ${esc(labelOf(cmp.b))}</span></div>
            <div>${metricRows.map((r) => metricRowHtml(r)).join('')}</div>
          </div>
          <div class="card"><div class="card-head"><h3>Failure-mix shift</h3><span class="sub">rate delta by mode (pts)</span></div>
            <div class="card-pad">${deltaRows.length ? `<div id="cmpDelta"></div>` : '<p class="muted">No material change in the failure mix.</p>'}</div>
          </div>
        </div>
        <div class="two-col">
          <div class="card"><div class="card-head"><h3 style="color:var(--st-critical-fg)">${icon('trend', 14)} Regressed</h3><span class="sub">worse in ${esc(labelOf(cmp.b))}</span></div><div id="cmpWorse"></div></div>
          <div class="card"><div class="card-head"><h3 style="color:var(--st-good-fg)">${icon('trendDown', 14)} Improved</h3><span class="sub">better in ${esc(labelOf(cmp.b))}</span></div><div id="cmpBetter"></div></div>
        </div>`;
      if (deltaRows.length) C.deltaBars(el.querySelector('#cmpDelta'), { rows: deltaRows.slice(0, 8), onClick: (r) => { setPinFilter(r.key); } });

      const worst = deltaRows.filter((r) => r.delta > 0).slice(0, 3);
      const best = deltaRows.filter((r) => r.delta < 0).slice(-3).reverse();
      renderClusters(el.querySelector('#cmpWorse'), worst, B, 'worse');
      renderClusters(el.querySelector('#cmpBetter'), best, A, 'better');
    }

    function renderClusters(container, rows, traceSet, kind) {
      if (!rows.length) { container.innerHTML = `<div class="card-pad muted">No ${kind === 'worse' ? 'regressions' : 'improvements'} in this comparison.</div>`; return; }
      container.innerHTML = rows.map((r) => {
        const reps = traceSet.filter((t) => t.primaryLabel === r.key).slice(0, 2);
        return `<div style="padding:11px 16px;border-bottom:1px solid var(--border)">
          <div class="flex" style="justify-content:space-between"><div class="flex" style="gap:8px">${U.labelBadge(r.key, { clickable: true })}</div><span class="delta ${r.delta > 0 ? 'up' : 'down bad'}" style="color:${r.delta > 0 ? 'var(--st-critical)' : 'var(--st-good)'}">${(r.delta > 0 ? '+' : '') + r.delta} pts</span></div>
          ${reps.map((t) => `<div class="rq-item" data-tr="${t.id}" style="grid-template-columns:1fr auto;padding:6px 0"><div><div style="font-size:12px">${esc(t.goal.slice(0, 54))}</div><div class="rq-meta"><span class="pill-mono">${t.id}</span></div></div><button class="btn sm ghost" data-pin="${t.id}">${icon('bookmark', 12)} Pin</button></div>`).join('') || '<div class="muted" style="font-size:11.5px;margin-top:4px">No representative traces</div>'}
        </div>`;
      }).join('');
      container.querySelectorAll('[data-tr]').forEach((r) => r.onclick = (e) => { if (e.target.closest('[data-pin]')) return; navigate('trace', { id: r.dataset.tr }); });
      container.querySelectorAll('[data-pin]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); pin(b.dataset.pin); });
    }

    function renderPins() {
      const area = main.querySelector('#pinArea');
      area.innerHTML = [0, 1].map((i) => {
        const id = state.pinned[i];
        const t = id ? D.traces.find((x) => x.id === id) : null;
        if (!t) return `<div class="pin-slot"><div class="muted" style="margin:auto;text-align:center">${icon('bookmark', 22)}<div style="margin-top:8px">Pin slot ${i + 1}</div><div style="font-size:11.5px">Pin a trace from a regression cluster above, or from any trace list.</div></div></div>`;
        const rc = t.rootStepId ? t.steps.find((s) => s.id === t.rootStepId) : null;
        return `<div class="pin-slot filled">
          <div class="flex" style="justify-content:space-between"><span class="pill-mono" style="font-weight:600">${t.id}</span><button class="iconbtn" data-unpin="${i}">${icon('close', 15)}</button></div>
          <div style="font-weight:500;margin:6px 0">${esc(t.goal)}</div>
          <div class="flex wrap" style="gap:8px;margin-bottom:8px">${U.outcomeBadge(t.outcome)}${U.labelBadge(t.primaryLabel, { clickable: false })}${U.severityBadge(t.severity)}</div>
          <div class="ds-meta-row"><span>${t.release} · ${t.model}</span><span>${fmt.dur(t.duration)}</span><span>${fmt.usd(t.cost)}</span><span>${t.stepCount} steps</span></div>
          <div class="io-summary" style="margin-top:8px;font-size:12px">Root cause: ${rc ? 'step ' + rc.step_number + ' · ' + H.stepLabel(rc.type) : '—'}</div>
          <button class="btn sm" data-open="${t.id}" style="margin-top:10px;align-self:flex-start">${icon('play', 13)} Open replay</button>
        </div>`;
      }).join('');
      area.querySelectorAll('[data-unpin]').forEach((b) => b.onclick = () => { state.pinned[+b.dataset.unpin] = null; renderPins(); });
      area.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => navigate('trace', { id: b.dataset.open }));
    }
    function pin(id) { const slot = state.pinned[0] ? (state.pinned[1] ? 0 : 1) : 0; state.pinned[slot] = id; renderPins(); U.toast('Pinned ' + id + ' to slot ' + (slot + 1) + '.'); }
    function setPinFilter(mode) { U.toast('Filter linked to ' + D.taxonomyById[mode].name); }

    main.querySelector('#cmpMode').onchange = (e) => { cmp.mode = e.target.value; fill(); render(); };
    main.querySelector('#cmpA').onchange = (e) => { cmp.a = e.target.value; render(); };
    main.querySelector('#cmpB').onchange = (e) => { cmp.b = e.target.value; render(); };
    main.querySelector('#cmpWf').onchange = render;
    fill(); render(); renderPins();

    function labelOf(v) { const o = optsFor(cmp.mode).find((x) => x[0] === v); return o ? o[1] : v; }
  }
  function rateMix(traces) {
    const rates = {}; const fails = traces.filter((t) => t.outcome !== 'pass');
    D.topCategories.forEach((c) => { rates[c.id] = traces.length ? fails.filter((t) => t.primaryLabel === c.id).length / traces.length : 0; });
    return rates;
  }
  function metricRowHtml(r) {
    const [name, a, b, isPct, worseUp, isCost, isDur] = r;
    const fmtV = (v) => isPct ? fmt.pct(v, 0) : isCost ? fmt.usd(v) : isDur ? fmt.dur(v) : (typeof v === 'number' && v % 1 ? v.toFixed(1) : fmt.int(Math.round(v)));
    let deltaHtml = '';
    if (typeof a === 'number' && typeof b === 'number') {
      const diff = b - a; const up = diff > 0;
      const bad = worseUp ? up : !up;
      const shown = isPct ? ((diff >= 0 ? '+' : '') + (diff * 100).toFixed(1) + ' pts') : ((diff >= 0 ? '+' : '') + fmtV(Math.abs(diff)).replace('$', diff < 0 ? '-$' : '$'));
      if (Math.abs(diff) > 0.0001) deltaHtml = `<span class="cm-val" style="color:${bad ? 'var(--st-critical)' : 'var(--st-good)'}">${isPct ? shown : (diff >= 0 ? '+' : '−') + fmtV(Math.abs(diff))}</span>`;
      else deltaHtml = '<span class="cm-val muted">—</span>';
    }
    return `<div class="compare-metric-row"><span class="cm-name">${name}</span><span class="cm-val">${fmtV(a)}</span><span class="muted">${icon('arrowRight', 12)}</span><span class="cm-val">${fmtV(b)}</span>${deltaHtml}</div>`;
  }
  VIEWS.compare = viewCompare;

  // =========================================================================
  //  VIEW: Datasets
  // =========================================================================
  function viewDatasets(main, params) {
    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles"><h1>Eval datasets</h1><p>Reviewed failures become reusable test assets. Group labeled traces into datasets, wire them into the nightly regression suite, and watch the pass/fail trend across builds.</p></div>
        <div class="head-actions"><button class="btn sm primary" id="dsNew">${icon('plus', 15)} New dataset</button></div>
      </div>
      <div class="kpi-row" id="dsKpis"></div>
      <div class="grid" id="dsGrid" style="grid-template-columns:1fr"></div>
    </div>`;

    const totalCases = D.datasets.reduce((s, d) => s + d.size, 0);
    const inSuite = D.datasets.filter((d) => d.inRegressionSuite).length;
    main.querySelector('#dsKpis').innerHTML = [
      { label: 'Datasets', value: D.datasets.length, sub: 'labeled failure collections' },
      { label: 'Total cases', value: totalCases, sub: 'promoted traces' },
      { label: 'In regression suite', value: inSuite, sub: 'run nightly' },
      { label: 'Failure modes covered', value: new Set(D.datasets.map((d) => d.failureMode)).size + ' / ' + D.topCategories.length, sub: 'taxonomy coverage' },
    ].map((k) => `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub muted">${esc(k.sub)}</div></div>`).join('');

    function render() {
      main.querySelector('#dsGrid').innerHTML = D.datasets.map((d) => {
        const latest = d.builds[d.builds.length - 1];
        const passRate = latest ? latest.pass / (latest.pass + latest.fail) : null;
        const trend = d.builds.map((b) => b.pass / (b.pass + b.fail));
        return `<div class="card dataset-card" data-ds="${d.id}">
          <div class="card-head">
            <span class="dot" style="width:9px;height:9px;border-radius:3px;background:${C.seriesColor(d.failureMode)}"></span>
            <h3>${esc(d.name)}</h3>
            ${d.inRegressionSuite ? `<span class="tag" style="color:var(--series-1)">${icon('beaker', 11)} in suite</span>` : '<span class="tag muted">draft</span>'}
            <div class="head-actions">
              ${d.builds.length ? `<span class="muted" style="font-size:11px">latest pass rate</span> <strong style="color:${passRate > 0.8 ? 'var(--st-good)' : passRate > 0.6 ? 'var(--st-warning)' : 'var(--st-critical)'}">${fmt.pct(passRate, 0)}</strong> ${C.sparkline(trend, 70, 22, passRate > 0.8 ? 'var(--st-good)' : 'var(--st-warning)')}` : '<span class="muted" style="font-size:11.5px">not yet run</span>'}
            </div>
          </div>
          <div class="ds-body">
            <div class="flex" style="gap:8px">${U.labelBadge(d.failureMode, { clickable: false })}<span class="muted" style="font-size:12px">${d.size} cases</span></div>
            <div class="ds-meta-row">
              <span>${icon('user', 12)} ${esc(D.reviewerById[d.createdBy] ? D.reviewerById[d.createdBy].name : 'You')}</span>
              <span>${icon('calendar', 12)} ${fmt.date(d.created)}</span>
              <span>${icon('beaker', 12)} ${d.builds.length} builds tracked</span>
            </div>
            <div class="ds-tags">${d.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            <div class="flex" style="gap:8px;margin-top:12px">
              <button class="btn sm" data-view="${d.id}">${icon('traces', 13)} View cases</button>
              <button class="btn sm" data-export="${d.id}">${icon('export', 13)} Export</button>
              <button class="btn sm ghost" data-suite="${d.id}">${d.inRegressionSuite ? 'Remove from suite' : icon('beaker', 13) + ' Add to suite'}</button>
            </div>
          </div>
        </div>`;
      }).join('');
      main.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { state.filters = { dateDays: state.filters.dateDays, dataset: b.dataset.view }; navigate('traces'); });
      main.querySelectorAll('[data-export]').forEach((b) => b.onclick = () => { const d = D.datasets.find((x) => x.id === b.dataset.export); U.toast('Exported “' + d.name + '” (' + d.size + ' cases) as JSON (mock).', 'success'); });
      main.querySelectorAll('[data-suite]').forEach((b) => b.onclick = () => { const d = D.datasets.find((x) => x.id === b.dataset.suite); d.inRegressionSuite = !d.inRegressionSuite; U.toast(d.inRegressionSuite ? 'Added to nightly suite.' : 'Removed from suite.', 'success'); render(); });
      main.querySelectorAll('.dataset-card').forEach((c) => c.onclick = (e) => { if (e.target.closest('button')) return; openDatasetDrawer(c.dataset.ds); });
    }

    main.querySelector('#dsNew').onclick = () => {
      const reviewed = D.traces.filter((t) => t.reviewStatus === 'reviewed' && t.outcome !== 'pass').slice(0, 10);
      if (!reviewed.length) { U.toast('Review some failing traces first, then promote them.', 'warn'); return; }
      AMI.promoteModal(reviewed.slice(0, 6));
    };
    render();
    if (params && params.id) setTimeout(() => openDatasetDrawer(params.id), 60);
  }
  VIEWS.datasets = viewDatasets;

  function openDatasetDrawer(id) {
    const d = D.datasets.find((x) => x.id === id); if (!d) return;
    const traces = d.traceIds.map((tid) => D.traces.find((t) => t.id === tid)).filter(Boolean);
    U.openDrawer({
      title: d.name,
      headExtra: d.inRegressionSuite ? `<span class="tag" style="color:var(--series-1)">${icon('beaker', 11)} in suite</span>` : '',
      body: `<div style="padding:18px 20px">
        <div class="flex" style="gap:8px;margin-bottom:12px">${U.labelBadge(d.failureMode, { clickable: false })}<span class="muted">${d.size} cases · created ${fmt.date(d.created)} by ${esc(D.reviewerById[d.createdBy] ? D.reviewerById[d.createdBy].name : 'You')}</span></div>
        ${d.builds.length ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Pass/fail across builds</h3></div><div class="card-pad"><div id="dsBuildChart"></div></div></div>` : `<div class="io-summary" style="margin-bottom:16px">Not yet wired into the regression suite. Add it to start tracking pass/fail across nightly builds.</div>`}
        <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Cases (${traces.length})</h4>
        ${traces.map((t) => `<div class="rq-item" data-tr="${t.id}" style="grid-template-columns:1fr auto"><div><div class="rq-goal">${esc(t.goal)}</div><div class="rq-meta"><span class="pill-mono">${t.id}</span> · ${esc(D.workflowById[t.workflow].name)} · ${t.release}</div></div>${U.severityBadge(t.severity)}</div>`).join('')}
      </div>`,
      onMount: (drawer, close) => {
        if (d.builds.length) {
          C.stackedBar(drawer.querySelector('#dsBuildChart'), {
            categories: d.builds.map((b) => ({ key: b.build, name: b.build.replace('nightly-', ''), parts: [
              { key: 'pass', name: 'Pass', value: b.pass, color: 'var(--st-good)' },
              { key: 'fail', name: 'Fail', value: b.fail, color: 'var(--st-critical)' },
            ] })),
            height: 200,
          });
        }
        drawer.querySelectorAll('[data-tr]').forEach((r) => r.onclick = () => { close(); navigate('trace', { id: r.dataset.tr }); });
      },
    });
  }

  // =========================================================================
  //  VIEW: Insights
  // =========================================================================
  function viewInsights(main) {
    // Compute supporting numbers for each insight from live data.
    const relRates = U.releaseModeRates(D.traces);
    const r14 = relRates.find((r) => r.release.id === 'v1.4'), r13 = relRates.find((r) => r.release.id === 'v1.3');
    const planDelta = Math.round((r14.rates.planning_error - r13.rates.planning_error) * 100);

    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles"><h1>Insights</h1><p>Cross-trace patterns the row-by-row view can't show — regressions after releases, tool concentrations, and failures that look like success. Each insight links to its evidence.</p></div>
        <div class="head-actions"><button class="btn sm" id="inRefresh">${icon('lightning', 15)} Re-run analysis</button></div>
      </div>
      <div class="grid" id="inGrid" style="grid-template-columns:1fr"></div>
      <div class="two-col" style="margin-top:16px">
        <div class="card"><div class="card-head"><h3>Step count vs failure rate</h3><span class="sub">longer runs fail more — context pressure</span></div><div class="card-pad"><div id="inStepChart"></div></div></div>
        <div class="card"><div class="card-head"><h3>Cost vs severity of failing runs</h3><span class="sub">expensive + severe = fix first</span></div><div class="card-pad"><div id="inScatter"></div></div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Reviewer throughput &amp; agreement</h3><span class="sub">reviews completed and how often the human confirmed the model</span></div><div class="table-wrap"><table class="data" id="inReviewers"></table></div></div>
    </div>`;

    // insight cards
    const dyn = { in1: { metric: (planDelta >= 0 ? '+' : '') + planDelta + '%' } };
    main.querySelector('#inGrid').innerHTML = D.insights.map((ins) => {
      const sevColor = { critical: 'var(--st-critical)', serious: 'var(--st-serious)', warning: 'var(--st-warning)' }[ins.severity];
      const bg = { critical: 'var(--st-critical-bg)', serious: 'var(--st-serious-bg)', warning: 'var(--st-warning-bg)' }[ins.severity];
      return `<div class="card insight-card" data-ins="${ins.id}">
        <div class="insight-icon" style="background:${bg};color:${sevColor}">${icon(ins.severity === 'critical' ? 'alert' : ins.severity === 'serious' ? 'trend' : 'info', 20)}</div>
        <div class="insight-body">
          <h3>${esc(ins.title)} <span class="insight-metric" style="color:${sevColor}">${esc(dyn[ins.id] ? dyn[ins.id].metric : ins.metric)}</span></h3>
          <p>${esc(ins.body)}</p>
          <div class="flex" style="gap:8px">
            <button class="btn sm" data-evidence="${ins.id}">${icon('traces', 13)} View evidence</button>
            ${ins.mode ? `<button class="btn sm ghost" data-mode="${ins.mode}">${icon('taxonomy', 13)} ${esc(D.taxonomyById[ins.mode].name)}</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    main.querySelectorAll('[data-evidence]').forEach((b) => b.onclick = () => {
      const ins = D.insights.find((x) => x.id === b.dataset.evidence);
      state.filters = Object.assign({ dateDays: state.filters.dateDays }, ins.evidenceFilter); navigate('traces');
    });
    main.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => AMI.openTaxonomyDetail(b.dataset.mode));

    // step count vs failure rate (bucketed)
    const buckets = [[1, 8], [9, 12], [13, 16], [17, 99]];
    const bucketData = buckets.map(([lo, hi]) => {
      const ts = D.traces.filter((t) => t.stepCount >= lo && t.stepCount <= hi);
      const fails = ts.filter((t) => t.outcome !== 'pass').length;
      return { name: lo + (hi === 99 ? '+' : '–' + hi), rate: ts.length ? fails / ts.length : 0, n: ts.length };
    });
    C.stackedBar(main.querySelector('#inStepChart'), {
      categories: bucketData.map((b) => ({ key: b.name, name: b.name + ' steps', parts: [{ key: 'rate', name: 'Failure rate %', value: Math.round(b.rate * 100), color: 'var(--series-1)' }] })),
      height: 220,
      onClick: () => U.toast('Longer traces carry more context-loss risk.'),
    });

    // scatter cost vs severity
    const failing = D.traces.filter((t) => t.outcome !== 'pass').slice(0, 120);
    C.scatter(main.querySelector('#inScatter'), {
      height: 240, xTitle: 'Cost (USD)', yTitle: 'Severity', maxY: 4.5,
      yFmt: (v) => ['', 'Minor', 'Warn', 'Serious', 'Crit'][Math.round(v)] || '',
      xFmt: (v) => '$' + v.toFixed(2),
      points: failing.map((t) => ({ x: t.cost, y: (D.severityRank[t.severity] || 1) + (Math.random ? 0 : 0), r: 5, color: C.seriesColor(t.primaryLabel), datum: t, label: t.id, tt: `<div class="tt-row">${D.taxonomyById[t.primaryLabel].name}</div><div class="tt-row">Cost<span class="tt-val">${fmt.usd(t.cost)}</span></div><div class="tt-row">Severity<span class="tt-val">${t.severity}</span></div>` })),
      onClick: (t) => navigate('trace', { id: t.id }),
    });

    // reviewer throughput
    const revStats = D.reviewers.map((r) => {
      const reviews = D.traces.filter((t) => t.reviewer === r.id && t.reviewStatus === 'reviewed');
      const agreed = reviews.filter((t) => t.humanAgreed).length;
      return { r, count: reviews.length, agreement: reviews.length ? agreed / reviews.length : 0 };
    }).sort((a, b) => b.count - a.count);
    main.querySelector('#inReviewers').innerHTML = `<thead><tr><th class="nosort">Reviewer</th><th class="nosort">Role</th><th class="nosort">Reviews</th><th class="nosort">Throughput</th><th class="nosort">Agreement w/ model</th></tr></thead>
      <tbody>${revStats.map((s) => `<tr data-rev="${s.r.id}"><td><div class="flex" style="gap:8px">${U.reviewerAvatar(s.r.id, 'sm')} ${esc(s.r.name)}</div></td><td class="muted">${esc(s.r.role)}</td><td class="num">${s.count}</td>
        <td><div class="minibar" style="width:80px"><span style="width:${(s.count / (revStats[0].count || 1)) * 100}%;background:var(--series-1)"></span></div></td>
        <td><div class="flex" style="gap:8px"><div class="minibar" style="width:70px"><span style="width:${s.agreement * 100}%;background:${s.agreement > 0.75 ? 'var(--st-good)' : 'var(--st-warning)'}"></span></div><span style="font-variant-numeric:tabular-nums;font-weight:600">${fmt.pct(s.agreement, 0)}</span></div></td></tr>`).join('')}</tbody>`;
    main.querySelectorAll('#inReviewers [data-rev]').forEach((tr) => tr.onclick = () => { state.filters = { dateDays: state.filters.dateDays, reviewer: tr.dataset.rev, reviewStatus: 'reviewed' }; navigate('traces'); });

    main.querySelector('#inRefresh').onclick = () => {
      const grid = main.querySelector('#inGrid');
      grid.style.opacity = '0.4';
      U.toast('Re-running cross-trace analysis…');
      setTimeout(() => { grid.style.opacity = '1'; U.toast('Insights refreshed against the latest traces.', 'success'); }, 800);
    };
  }
  VIEWS.insights = viewInsights;

  // =========================================================================
  //  VIEW: Settings
  // =========================================================================
  function viewSettings(main) {
    if (!state._settingsTab) state._settingsTab = 'general';
    main.innerHTML = `<div class="view">
      <div class="page-head"><div class="titles"><h1>Settings</h1><p>Configure the workspace, alerting hooks, and the classifier that produces suggested labels. Prototype controls persist for this session.</p></div></div>
      <div class="tabs" id="setTabs">
        <div class="tab${state._settingsTab === 'general' ? ' active' : ''}" data-tab="general">General</div>
        <div class="tab${state._settingsTab === 'alerts' ? ' active' : ''}" data-tab="alerts">Alerting &amp; SLOs</div>
        <div class="tab${state._settingsTab === 'labeling' ? ' active' : ''}" data-tab="labeling">Auto-labeling</div>
        <div class="tab${state._settingsTab === 'team' ? ' active' : ''}" data-tab="team">Team</div>
      </div>
      <div id="setBody"></div>
    </div>`;
    main.querySelectorAll('#setTabs .tab').forEach((t) => t.onclick = () => { state._settingsTab = t.dataset.tab; viewSettings(main); });
    const body = main.querySelector('#setBody');
    if (state._settingsTab === 'general') body.innerHTML = settingsGeneral();
    else if (state._settingsTab === 'alerts') body.innerHTML = settingsAlerts();
    else if (state._settingsTab === 'labeling') body.innerHTML = settingsLabeling();
    else body.innerHTML = settingsTeam();
    body.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', () => U.toast('Setting updated (prototype).', 'success')));
    body.querySelectorAll('[data-toast]').forEach((b) => b.onclick = () => U.toast(b.dataset.toast, 'success'));
  }
  function toggleRow(label, sub, on) {
    return `<div class="flex" style="justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)"><div><div style="font-weight:500;font-size:13px">${label}</div><div class="muted" style="font-size:11.5px;margin-top:2px">${sub}</div></div><label class="flex"><input type="checkbox" ${on ? 'checked' : ''}></label></div>`;
  }
  function settingsGeneral() {
    return `<div class="two-col">
      <div class="card"><div class="card-head"><h3>Workspace</h3></div><div class="card-pad">
        <div class="form-row"><label>Workspace name</label><input class="control" style="width:100%" value="Agent Reliability — Core"></div>
        <div class="form-row"><label>Default date range</label><select class="control" style="width:100%"><option>Last 30 days</option><option selected>All time</option><option>Last 90 days</option></select></div>
        <div class="form-row"><label>Default environment</label><select class="control" style="width:100%">${D.environments.map((e) => `<option${e === 'production' ? ' selected' : ''}>${e}</option>`).join('')}</select></div>
      </div></div>
      <div class="card"><div class="card-head"><h3>Preferences</h3></div>
        ${toggleRow('Show surface-success warnings', 'Highlight traces that look successful but failed semantically', true)}
        ${toggleRow('Cross-highlight taxonomy ↔ steps', 'Link failure labels to their root-cause steps in replay', true)}
        ${toggleRow('Compact table density', 'Tighter rows in the trace explorer', false)}
        ${toggleRow('Keyboard navigation hints', 'Show ↑ ↓ Enter hints on tables', true)}
      </div></div>`;
  }
  function settingsAlerts() {
    return `<div class="card mb-16"><div class="card-head"><h3>SLO targets</h3><span class="sub">reliability thresholds that drive alerts</span></div>
      <div class="card-pad two-col">
        <div class="form-row"><label>Max misbehavior rate</label><input class="control" style="width:100%" value="30%"></div>
        <div class="form-row"><label>Max critical failures / day</label><input class="control" style="width:100%" value="5"></div>
        <div class="form-row"><label>Max review backlog</label><input class="control" style="width:100%" value="40 traces"></div>
        <div class="form-row"><label>Groundedness floor</label><input class="control" style="width:100%" value="85%"></div>
      </div></div>
      <div class="card"><div class="card-head"><h3>Alerting hooks</h3><span class="sub">where reliability alerts fire</span><div class="head-actions"><button class="btn sm" data-toast="Test alert sent to #agent-reliability (mock).">${icon('slack_post', 13)} Send test</button></div></div>
        ${toggleRow('Slack — #agent-reliability', 'Post when misbehavior rate breaches SLO or a critical spike occurs', true)}
        ${toggleRow('PagerDuty — Reliability rotation', 'Page on sustained critical-failure spikes', true)}
        ${toggleRow('Release regression digest', 'Email a failure-mix delta after every release', true)}
        ${toggleRow('Webhook — data platform', 'POST new labeled failures to the eval pipeline', false)}
      </div>`;
  }
  function settingsLabeling() {
    return `<div class="card mb-16"><div class="card-head"><h3>Suggested-label classifier</h3><span class="sub">produces the model_suggestion labels reviewers confirm or correct</span></div>
      <div class="card-pad">
        <div class="io-summary" style="margin-bottom:14px">Observability alone isn't enough — auto-labels seed the feedback loop, but every suggestion is reviewable. The classifier currently agrees with human reviewers <strong>72%</strong> of the time.</div>
        <div class="form-row"><label>Auto-label confidence threshold — route below this to review</label><input type="range" class="control" min="0" max="100" value="60" style="width:100%"></div>
        <div class="two-col">
          <div class="form-row"><label>Classifier model</label><select class="control" style="width:100%"><option>orion-label-2</option><option>astra-label-1</option></select></div>
          <div class="form-row"><label>Re-label cadence</label><select class="control" style="width:100%"><option>On ingest</option><option selected>Nightly batch</option></select></div>
        </div>
      </div></div>
      <div class="card">
        ${toggleRow('Auto-suggest subtypes', 'Predict subtype alongside the top-level category', true)}
        ${toggleRow('Flag surface-success failures', 'Detect confident answers that fail semantically', true)}
        ${toggleRow('Auto-promote high-confidence criticals', 'Add ≥95% confidence critical failures to review-first queue', true)}
        ${toggleRow('Learn from corrections', 'Feed human corrections back into the classifier', true)}
      </div>`;
  }
  function settingsTeam() {
    return `<div class="card"><div class="card-head"><h3>Reviewers</h3><span class="sub">${D.reviewers.length} members</span><div class="head-actions"><button class="btn sm" data-toast="Invite sent (mock).">${icon('plus', 13)} Invite</button></div></div>
      <div class="table-wrap"><table class="data"><thead><tr><th class="nosort">Member</th><th class="nosort">Role</th><th class="nosort">Reviews (all time)</th><th class="nosort">Agreement</th></tr></thead>
      <tbody>${D.reviewers.map((r) => { const reviews = D.traces.filter((t) => t.reviewer === r.id && t.reviewStatus === 'reviewed'); const agr = reviews.filter((t) => t.humanAgreed).length; return `<tr><td><div class="flex" style="gap:8px">${U.reviewerAvatar(r.id, 'sm')} ${esc(r.name)}</div></td><td class="muted">${esc(r.role)}</td><td class="num">${reviews.length}</td><td class="num">${reviews.length ? fmt.pct(agr / reviews.length, 0) : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  VIEWS.settings = viewSettings;

})();
