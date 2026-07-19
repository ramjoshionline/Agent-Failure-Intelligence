/*
 * views.js — the remaining views (Traces, Trace detail, Review, Taxonomy,
 * Compare, Datasets, Insights, Settings) plus the taxonomy-detail drawer.
 * Registers each into window.AMI_VIEWS and shares the app closure via
 * window.AMI. Loaded after app.js.
 */
(function () {
  'use strict';
  const AMI = window.AMI;
  const { D, U, C, icon, fmt, esc, state, navigate, filtered, filterbar, emptyInline } = AMI;
  const VIEWS = window.AMI_VIEWS;

  // =========================================================================
  //  Taxonomy detail drawer (opened from any failure badge)
  // =========================================================================
  function openTaxonomyDetail(id) {
    const cat = D.taxonomyById[id];
    if (!cat) return;
    const isSub = !!cat.parent_id;
    const parent = isSub ? D.taxonomyById[cat.parent_id] : cat;
    const subs = D.subtypesByParent[parent.id] || [];
    const examples = D.traces.filter((t) => t.primaryLabel === parent.id).slice(0, 4);
    const count = D.traces.filter((t) => t.primaryLabel === parent.id).length;
    const color = C.seriesColor(parent.id);
    U.openDrawer({
      title: cat.name,
      headExtra: `<span class="badge" style="background:color-mix(in srgb,${color} 14%,var(--surface-1));color:color-mix(in srgb,${color} 72%,var(--text-primary))"><span class="dot" style="background:${color}"></span>${isSub ? 'Subtype of ' + esc(parent.name) : 'Top-level category'}</span>`,
      body: `<div style="padding:18px 20px">
        <div class="io-summary" style="font-size:13px">${esc(cat.description)}</div>
        <div class="flex wrap" style="gap:14px;margin:14px 0">
          <div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em">Default severity</div><div style="margin-top:3px">${U.severityBadge(cat.severity_default)}</div></div>
          <div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em">Labeled traces</div><div style="margin-top:3px;font-weight:600;font-variant-numeric:tabular-nums">${count}</div></div>
          <div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em">Subtypes</div><div style="margin-top:3px;font-weight:600">${subs.length}</div></div>
        </div>
        <div class="tax-detail">
          ${cat.inclusion ? `<div class="criteria-grid" style="margin-bottom:18px">
            <div class="criteria-card include"><h4>${icon('check', 13)} Inclusion criteria</h4><p class="secondary" style="margin:0;font-size:12.5px">${esc(cat.inclusion)}</p></div>
            <div class="criteria-card exclude"><h4>${icon('close', 13)} Exclusion criteria</h4><p class="secondary" style="margin:0;font-size:12.5px">${esc(cat.exclusion || '—')}</p></div>
          </div>` : ''}
          <div class="def-section"><h4>Typical symptoms</h4><ul>${(cat.symptoms || []).map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div>
          ${(cat.examples && cat.examples.length) ? `<div class="def-section"><h4>Example patterns</h4><ul>${cat.examples.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
          <div class="def-section"><h4>Review guidance</h4><p class="secondary" style="margin:0;font-size:12.5px">${esc(cat.review_guidance || '—')}</p></div>
          <div class="def-section"><h4>Suggested remediations</h4><div class="io-summary" style="font-size:12.5px">${esc(cat.remediations || 'Add a remediation playbook for this category.')}</div></div>
          ${subs.length ? `<div class="def-section"><h4>Subtypes</h4><div class="flex wrap" style="gap:6px">${subs.map((s) => `<span class="tag clickable" data-sub="${s.id}" style="cursor:pointer">${esc(s.name)}</span>`).join('')}</div></div>` : ''}
          <div class="def-section"><h4>Example traces</h4>${examples.length ? examples.map((t) => `<div class="rq-item" data-tr="${t.id}" style="grid-template-columns:1fr auto;padding-left:0;padding-right:0"><div><div class="rq-goal">${esc(t.goal)}</div><div class="rq-meta">${t.id} · ${esc(D.workflowById[t.workflow].name)} · ${U.reviewBadge(t.reviewStatus)}</div></div>${U.severityBadge(t.severity)}</div>`).join('') : '<p class="muted">No labeled traces yet.</p>'}</div>
          <button class="btn primary" data-viewall style="margin-top:6px">View all ${count} ${esc(parent.name.toLowerCase())} traces ${icon('arrowRight', 13)}</button>
        </div>
      </div>`,
      onMount: (drawer, close) => {
        drawer.querySelectorAll('[data-tr]').forEach((r) => r.onclick = () => { close(); navigate('trace', { id: r.dataset.tr }); });
        drawer.querySelectorAll('[data-sub]').forEach((s) => s.onclick = () => { close(); setTimeout(() => openTaxonomyDetail(s.dataset.sub), 200); });
        const va = drawer.querySelector('[data-viewall]');
        if (va) va.onclick = () => { close(); state.filters.failureMode = parent.id; navigate('traces'); };
      },
    });
  }
  AMI.openTaxonomyDetail = openTaxonomyDetail;

  // =========================================================================
  //  VIEW: Traces (explorer)
  // =========================================================================
  const traceCols = [
    { key: 'expand', label: '', sortable: false },
    { key: 'id', label: 'Trace', sortable: true },
    { key: 'timestamp', label: 'Time', sortable: true },
    { key: 'workflow', label: 'Workflow', sortable: true },
    { key: 'goal', label: 'User goal', sortable: false },
    { key: 'outcome', label: 'Outcome', sortable: true },
    { key: 'primaryLabel', label: 'Failure label', sortable: true },
    { key: 'severity', label: 'Severity', sortable: true },
    { key: 'toolCount', label: 'Tools', sortable: true },
    { key: 'duration', label: 'Duration', sortable: true },
    { key: 'cost', label: 'Cost', sortable: true },
    { key: 'reviewStatus', label: 'Review', sortable: true },
    { key: 'release', label: 'Release', sortable: true },
  ];

  function viewTraces(main) {
    const s = state.tracesSort;
    main.innerHTML = `<div class="view">
      <div class="page-head">
        <div class="titles"><h1>Traces</h1><p>Every agent run, searchable and sortable. Rows expand for a quick summary; open a trace for step-level replay and root-cause labeling.</p></div>
        <div class="head-actions">
          <button class="btn sm" id="trBookmark">${icon('bookmark', 15)} Save view</button>
          <button class="btn sm" id="trExport">${icon('export', 15)} Export</button>
        </div>
      </div>
      <div id="trFilter"></div>
      <div class="card">
        <div class="table-toolbar">
          <span class="count" id="trCount"></span>
          <span class="muted" style="font-size:11.5px">${icon('info', 12)} Use ↑ ↓ to navigate, Enter to open, → to expand</span>
          <span class="spacer"></span>
          <div class="segmented" id="trQuick">
            <button class="active" data-q="all">All</button>
            <button data-q="fail">Failing</button>
            <button data-q="surface">Surface-success</button>
            <button data-q="critical">Critical</button>
          </div>
        </div>
        <div class="table-wrap"><table class="data" id="trTable" tabindex="0"></table></div>
        <div id="trEmpty"></div>
      </div>
    </div>`;

    main.querySelector('#trFilter').appendChild(filterbar(() => viewTraces(main)));

    function currentRows() {
      let rows = filtered();
      const q = state._tracesQuick || 'all';
      if (q === 'fail') rows = rows.filter((t) => t.outcome !== 'pass');
      if (q === 'surface') rows = rows.filter((t) => t.surfaceSuccess);
      if (q === 'critical') rows = rows.filter((t) => t.severity === 'critical');
      rows = rows.slice().sort((a, b) => {
        let av = a[s.key], bv = b[s.key];
        if (s.key === 'timestamp') { av = new Date(a.timestamp); bv = new Date(b.timestamp); }
        if (s.key === 'workflow') { av = D.workflowById[a.workflow].name; bv = D.workflowById[b.workflow].name; }
        if (s.key === 'severity') { av = D.severityRank[a.severity] || 0; bv = D.severityRank[b.severity] || 0; }
        if (s.key === 'primaryLabel') { av = av || ''; bv = bv || ''; }
        if (av < bv) return s.dir === 'asc' ? -1 : 1;
        if (av > bv) return s.dir === 'asc' ? 1 : -1;
        return 0;
      });
      return rows;
    }

    function renderTable() {
      const rows = currentRows();
      const table = main.querySelector('#trTable');
      main.querySelector('#trCount').textContent = `${fmt.int(rows.length)} traces` + (rows.length !== D.traces.length ? ` (of ${fmt.int(D.traces.length)})` : '');
      const empty = main.querySelector('#trEmpty');
      if (!rows.length) {
        table.innerHTML = '';
        empty.innerHTML = `<div class="empty-state"><div class="es-icon">${icon('search', 24)}</div><h3>No traces match these filters</h3><p>Adjust or clear the filter set to see runs. Every failing trace here can be labeled and promoted into an eval dataset.</p><button class="btn" id="trClearEmpty">Clear filters</button></div>`;
        const cb = empty.querySelector('#trClearEmpty'); if (cb) cb.onclick = () => { state.filters = { dateDays: state.filters.dateDays }; viewTraces(main); };
        return;
      }
      empty.innerHTML = '';
      const head = `<thead><tr>${traceCols.map((c) => `<th class="${c.sortable ? '' : 'nosort'} ${s.key === c.key ? 'sorted' : ''}" data-col="${c.key}">${esc(c.label)}${c.sortable ? `<span class="sort-ind">${s.key === c.key ? (s.dir === 'asc' ? '▲' : '▼') : '↕'}</span>` : ''}</th>`).join('')}</tr></thead>`;
      const body = rows.map((t, i) => rowHtml(t, i)).join('');
      table.innerHTML = head + `<tbody>${body}</tbody>`;

      table.querySelectorAll('th[data-col]').forEach((th) => {
        const col = traceCols.find((c) => c.key === th.dataset.col);
        if (!col.sortable) return;
        th.onclick = () => { if (s.key === col.key) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.key = col.key; s.dir = 'desc'; } renderTable(); };
      });
      table.querySelectorAll('tbody tr[data-tr]').forEach((tr) => {
        tr.onclick = (e) => {
          if (e.target.closest('.expand-caret')) { toggleExpand(tr.dataset.tr); return; }
          if (e.target.closest('[data-label]')) return;
          navigate('trace', { id: tr.dataset.tr });
        };
        const caret = tr.querySelector('.expand-caret');
        if (caret) caret.onclick = (e) => { e.stopPropagation(); toggleExpand(tr.dataset.tr); };
      });
      wireKeyboard(table, rows);
    }

    function rowHtml(t, i) {
      const expanded = state.tracesExpanded.has(t.id);
      const secondaryLabels = (t.labels || []).filter((l) => l.label_id !== t.primaryLabel && !l.dismissed).map((l) => l.label_id);
      const labelCell = t.primaryLabel
        ? U.labelBadge(t.primaryLabel) + (secondaryLabels.length ? ` <span class="tag" title="${secondaryLabels.map((x) => D.taxonomyById[x].name).join(', ')}">+${secondaryLabels.length}</span>` : '')
        : '<span class="muted">—</span>';
      let html = `<tr data-tr="${t.id}" class="${state.tracesSelectedRow === t.id ? 'selected' : ''}${expanded ? ' expanded-row' : ''}">
        <td style="width:26px"><span class="expand-caret${expanded ? ' open' : ''}">${icon('chevron', 14)}</span></td>
        <td><span class="pill-mono">${t.id}</span>${t.surfaceSuccess ? ` <span class="tag" title="Surface success masks a semantic failure" style="color:var(--st-serious-fg)">${icon('warning', 10)}</span>` : ''}</td>
        <td class="muted">${fmt.datetime(t.timestamp)}</td>
        <td>${esc(D.workflowById[t.workflow].name)}</td>
        <td class="goal-cell" title="${esc(t.goal)}">${esc(t.goal)}</td>
        <td>${U.outcomeBadge(t.outcome)}</td>
        <td>${labelCell}</td>
        <td>${U.severityBadge(t.severity)}</td>
        <td class="num">${t.toolCount}</td>
        <td class="num">${fmt.dur(t.duration)}</td>
        <td class="num">${fmt.usd(t.cost)}</td>
        <td>${U.reviewBadge(t.reviewStatus)}</td>
        <td><span class="tag">${t.release}</span></td>
      </tr>`;
      if (expanded) html += expandHtml(t);
      return html;
    }

    function expandHtml(t) {
      const rc = t.rootStepId ? t.steps.find((x) => x.id === t.rootStepId) : null;
      return `<tr class="expand-panel"><td colspan="${traceCols.length}"><div class="expand-inner">
        <div class="ei-item" style="grid-column:span 2"><div class="k">User goal</div><div class="v">${esc(t.goal)}</div></div>
        <div class="ei-item"><div class="k">Root-cause step</div><div class="v">${rc ? `Step ${rc.step_number} · ${rc.type.replace('_', ' ')}${rc.tool ? ' · ' + rc.tool : ''}` : '<span class="muted">—</span>'}</div></div>
        <div class="ei-item"><div class="k">Model</div><div class="v pill-mono" style="font-size:11.5px">${t.model}</div></div>
        <div class="ei-item"><div class="k">Segment / Env</div><div class="v">${t.segment} · ${t.environment}</div></div>
        <div class="ei-item"><div class="k">Steps</div><div class="v">${t.stepCount} (${t.toolCount} tool calls)</div></div>
        <div class="ei-item"><div class="k">Eval scores</div><div class="v">C ${fmt.pct(t.eval.correctness, 0)} · G ${fmt.pct(t.eval.groundedness, 0)} · E ${fmt.pct(t.eval.efficiency, 0)}</div></div>
        <div class="ei-item"><div class="k">Reviewer</div><div class="v">${t.reviewer ? U.reviewerAvatar(t.reviewer, 'sm') + ' ' + esc(D.reviewerById[t.reviewer].name) : '<span class="muted">Unassigned</span>'}</div></div>
        <div class="ei-item" style="grid-column:1/-1"><button class="btn sm" data-open="${t.id}">${icon('play', 13)} Open replay</button> <button class="btn sm" data-similar="${t.id}">${icon('layers', 13)} Similar traces</button></div>
      </div></td></tr>`;
    }

    function toggleExpand(id) {
      if (state.tracesExpanded.has(id)) state.tracesExpanded.delete(id); else state.tracesExpanded.add(id);
      renderTable();
      main.querySelectorAll('[data-open]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); navigate('trace', { id: b.dataset.open }); });
      main.querySelectorAll('[data-similar]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); showSimilar(D.traces.find((x) => x.id === b.dataset.similar)); });
    }

    function wireKeyboard(table, rows) {
      table.onkeydown = (e) => {
        const cur = rows.findIndex((r) => r.id === state.tracesSelectedRow);
        if (e.key === 'ArrowDown') { e.preventDefault(); const n = Math.min(rows.length - 1, cur + 1); state.tracesSelectedRow = rows[n < 0 ? 0 : n].id; renderTable(); table.focus(); scrollToSel(table); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.max(0, cur - 1); state.tracesSelectedRow = rows[cur < 0 ? 0 : n].id; renderTable(); table.focus(); scrollToSel(table); }
        if (e.key === 'Enter' && state.tracesSelectedRow) { e.preventDefault(); navigate('trace', { id: state.tracesSelectedRow }); }
        if (e.key === 'ArrowRight' && state.tracesSelectedRow) { e.preventDefault(); toggleExpand(state.tracesSelectedRow); }
      };
    }
    function scrollToSel(table) { const el = table.querySelector('tr.selected'); if (el) el.scrollIntoView({ block: 'nearest' }); }

    main.querySelectorAll('#trQuick button').forEach((b) => b.onclick = () => {
      main.querySelectorAll('#trQuick button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); state._tracesQuick = b.dataset.q; renderTable();
    });
    main.querySelector('#trExport').onclick = () => exportModal(currentRows());
    main.querySelector('#trBookmark').onclick = () => U.toast('Saved current filters as a view (mock).', 'success');
    renderTable();
  }
  VIEWS.traces = viewTraces;

  function showSimilar(trace) {
    const sim = U.similarTraces(trace, D.traces, 8);
    U.openModal({
      title: 'Similar traces', wide: true,
      body: `<p class="secondary" style="margin-top:0">Traces sharing the same failure mode, workflow, or root-cause tool as <span class="pill-mono">${trace.id}</span>.</p>
        ${sim.length ? sim.map((t) => `<div class="rq-item" data-tr="${t.id}" style="grid-template-columns:1fr auto"><div><div class="rq-goal">${esc(t.goal)}</div><div class="rq-meta">${t.id} · ${esc(D.workflowById[t.workflow].name)} · ${t.release}</div></div><div class="flex" style="gap:8px">${U.labelBadge(t.primaryLabel, { clickable: false })}${U.severityBadge(t.severity)}</div></div>`).join('') : '<p class="muted">No similar traces found.</p>'}`,
      footer: '<button class="btn" data-close>Close</button>',
      onMount: (modal, close) => {
        modal.querySelectorAll('[data-tr]').forEach((r) => r.onclick = () => { close(); navigate('trace', { id: r.dataset.tr }); });
        modal.querySelector('[data-close]').onclick = close;
      },
    });
  }

  function exportModal(rows) {
    U.openModal({
      title: 'Export traces',
      body: `<p class="secondary" style="margin-top:0">${fmt.int(rows.length)} traces match the current filters. Choose a format — this prototype generates the payload in-browser (no backend).</p>
        <div class="form-row"><label>Format</label><div class="segmented" id="exFmt"><button class="active" data-f="json">JSON</button><button data-f="csv">CSV</button></div></div>
        <div class="form-row"><label>Include</label><div class="flex wrap" style="gap:14px"><label class="flex" style="font-weight:400"><input type="checkbox" checked disabled> Metadata &amp; labels</label><label class="flex" style="font-weight:400"><input type="checkbox" id="exSteps"> Nested steps</label></div></div>
        <div class="code-block" id="exPreview" style="max-height:200px;overflow:auto"></div>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-do>Download</button>',
      onMount: (modal, close) => {
        let fmtSel = 'json';
        function preview() {
          const withSteps = modal.querySelector('#exSteps').checked;
          const sample = rows.slice(0, 2).map((t) => {
            const o = { id: t.id, workflow: t.workflow, outcome: t.outcome, primary_label: t.primaryLabel, severity: t.severity, cost: t.cost, release: t.release };
            if (withSteps) o.steps = t.steps.map((s) => ({ n: s.step_number, type: s.type, tool: s.tool, root_cause: s.is_root_cause }));
            return o;
          });
          modal.querySelector('#exPreview').textContent = fmtSel === 'json' ? JSON.stringify(sample, null, 2) + (rows.length > 2 ? '\n… ' + (rows.length - 2) + ' more' : '') : 'id,workflow,outcome,primary_label,severity,cost,release\n' + rows.slice(0, 4).map((t) => `${t.id},${t.workflow},${t.outcome},${t.primaryLabel || ''},${t.severity || ''},${t.cost},${t.release}`).join('\n') + '\n…';
        }
        modal.querySelectorAll('#exFmt button').forEach((b) => b.onclick = () => { modal.querySelectorAll('#exFmt button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); fmtSel = b.dataset.f; preview(); });
        modal.querySelector('#exSteps').onchange = preview;
        modal.querySelector('[data-close]').onclick = close;
        modal.querySelector('[data-do]').onclick = () => { close(); U.toast(`Exported ${rows.length} traces as ${fmtSel.toUpperCase()} (mock download).`, 'success'); };
        preview();
      },
    });
  }

  // =========================================================================
  //  VIEW: Trace detail / replay
  // =========================================================================
  function viewTraceDetail(main, params) {
    const trace = D.traces.find((t) => t.id === params.id) || D.traces[0];
    if (!state._selectedStep || !trace.steps.find((s) => s.id === state._selectedStep)) {
      state._selectedStep = trace.rootStepId || trace.steps[0].id;
    }
    const wf = D.workflowById[trace.workflow];

    main.innerHTML = `<div class="trace-detail">
      <div class="trace-header">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
          <div>
            <div class="flex" style="gap:10px;margin-bottom:6px">
              <button class="btn sm ghost" id="tdBack">${icon('chevron', 14)} Traces</button>
              <span class="pill-mono" style="font-size:13px;font-weight:600">${trace.id}</span>
              ${U.outcomeBadge(trace.outcome)}
              ${U.severityBadge(trace.severity)}
              ${trace.surfaceSuccess ? `<span class="badge" style="background:var(--st-serious-bg);color:var(--st-serious-fg)">${icon('warning', 11)} Surface success</span>` : ''}
            </div>
            <div style="font-size:15px;font-weight:600;max-width:640px">${esc(trace.goal)}</div>
            <div class="flex wrap muted" style="gap:14px;margin-top:7px;font-size:12px">
              <span>${icon('branch', 13)} ${esc(wf.name)}</span>
              <span>${icon('layers', 13)} ${trace.release} · ${trace.model}</span>
              <span>${icon('clock', 13)} ${fmt.dur(trace.duration)}</span>
              <span>${icon('dollar', 13)} ${fmt.usd(trace.cost)}</span>
              <span>${icon('grid', 13)} ${trace.stepCount} steps</span>
              <span>${icon('globe', 13)} ${trace.environment} · ${trace.segment}</span>
              <span>${U.reviewBadge(trace.reviewStatus)}</span>
            </div>
          </div>
          <div class="flex" style="gap:8px">
            <button class="btn sm" id="tdSimilar">${icon('layers', 14)} Similar</button>
            <button class="btn sm" id="tdRegression">${icon('beaker', 14)} Create regression test</button>
            <button class="btn sm primary" id="tdPromote">${icon('plus', 14)} Promote to dataset</button>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <div class="pane pane-left">
          <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:600;display:flex;justify-content:space-between;align-items:center">Execution trace <span class="muted" style="text-transform:none;letter-spacing:0">${trace.stepCount} steps</span></div>
          <div class="step-list" id="stepList"></div>
        </div>
        <div class="pane pane-main"><div id="stepDetail"></div></div>
        <div class="pane pane-right" id="rightPane"></div>
      </div>
    </div>`;

    function renderSteps() {
      const list = main.querySelector('#stepList');
      list.innerHTML = trace.steps.map((st, i) => {
        const cls = ['step-item'];
        if (st.id === state._selectedStep) cls.push('active');
        if (st.is_root_cause) cls.push('root-cause');
        else if (st.suspicion) cls.push('suspicion');
        const last = i === trace.steps.length - 1;
        return `<div class="${cls.join(' ')}" data-step="${st.id}">
          <div class="step-rail"><div class="step-num">${st.step_number}</div>${last ? '' : '<div class="step-connector"></div>'}</div>
          <div class="step-body">
            <div class="step-type">${stepLabel(st.type)}${st.is_root_cause ? ` <span style="color:var(--st-critical)">${icon('target', 13)}</span>` : ''}</div>
            <div class="step-meta">${st.tool ? '<span class="pill-mono">' + st.tool + '</span> · ' : ''}${esc((st.input_summary || '').slice(0, 44))}…</div>
            <div class="step-flags">
              <span class="step-type-badge">${st.type.replace('_', ' ')}</span>
              ${st.result === 'error' ? '<span class="badge outcome-fail" style="height:17px;font-size:9.5px">error</span>' : ''}
              ${st.is_root_cause ? '<span class="badge" style="height:17px;font-size:9.5px;background:var(--st-critical-bg);color:var(--st-critical-fg)">root cause</span>' : st.suspicion ? '<span class="badge" style="height:17px;font-size:9.5px;background:var(--st-warning-bg);color:var(--st-warning-fg)">suspicious</span>' : ''}
            </div>
          </div>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-step]').forEach((el) => el.onclick = () => { state._selectedStep = el.dataset.step; renderSteps(); renderStepDetail(); });
    }

    function renderStepDetail() {
      const st = trace.steps.find((s) => s.id === state._selectedStep);
      const el = main.querySelector('#stepDetail');
      const scoreColor = st.score >= 0.6 ? 'var(--st-good)' : st.score >= 0.35 ? 'var(--st-warning)' : 'var(--st-critical)';
      el.innerHTML = `<div class="step-detail">
        ${st.is_root_cause ? `<div class="rootcause-banner">${icon('target', 18)}<div><strong>This step is the identified root cause.</strong><div style="margin-top:3px">The ${primaryLabelName(trace)} failure originates here — ${rootCauseExplanation(trace, st)}</div></div></div>` : ''}
        <h2><span class="step-num" style="width:26px;height:26px">${st.step_number}</span> ${stepLabel(st.type)}</h2>
        <div class="flex wrap" style="gap:10px;margin-top:10px">
          ${st.tool ? `<span class="badge" style="background:var(--surface-3)">${icon('tool', 12)} ${st.tool}</span>` : ''}
          <span class="badge" style="background:var(--surface-3)">${st.result === 'error' ? icon('alert', 12) : icon('check', 12)} result: ${st.result}</span>
          <div class="score-meter" style="min-width:160px"><span class="muted" style="font-size:11px">step score</span><div class="track"><div class="fill" style="width:${st.score * 100}%;background:${scoreColor}"></div></div><span class="val">${fmt.pct(st.score, 0)}</span></div>
        </div>
        <div class="kv-block"><div class="kv-title">${icon('arrowRight', 12)} Input context</div><div class="io-summary">${esc(st.input_summary)}</div></div>
        ${st.args ? `<div class="kv-block"><div class="kv-title">${icon('tool', 12)} Tool arguments</div><div class="code-block">${esc(JSON.stringify(st.args, null, 2))}</div></div>` : ''}
        <div class="kv-block"><div class="kv-title">${icon('layers', 12)} Output</div><div class="code-block${st.result === 'error' ? ' error' : ''}">${esc(st.output)}</div></div>
        ${(st.suspicion || st.is_root_cause) ? `<div class="why-block"><div class="why-title">${icon('info', 12)} Why this step is flagged</div><p>${esc(stepFlagReason(trace, st))}</p></div>` : ''}
        <hr class="sep">
        <div class="flex" style="justify-content:space-between">
          <button class="btn sm" id="prevStep" ${st.step_number === 1 ? 'disabled' : ''}>${icon('chevron', 13)} Previous step</button>
          <button class="btn sm" id="markRoot">${st.is_root_cause ? icon('check', 13) + ' Root cause' : icon('target', 13) + ' Mark as root cause'}</button>
          <button class="btn sm" id="nextStep" ${st.step_number === trace.steps.length ? 'disabled' : ''}>Next step ${icon('arrowRight', 13)}</button>
        </div>
      </div>`;
      const prev = el.querySelector('#prevStep'), next = el.querySelector('#nextStep');
      if (prev && st.step_number > 1) prev.onclick = () => { state._selectedStep = trace.steps[st.step_number - 2].id; renderSteps(); renderStepDetail(); };
      if (next && st.step_number < trace.steps.length) next.onclick = () => { state._selectedStep = trace.steps[st.step_number].id; renderSteps(); renderStepDetail(); };
      el.querySelector('#markRoot').onclick = () => {
        trace.steps.forEach((x) => x.is_root_cause = false);
        st.is_root_cause = true; st.suspicion = true; trace.rootStepId = st.id;
        U.toast('Root cause set to step ' + st.step_number + '.', 'success');
        renderSteps(); renderStepDetail(); renderRight();
      };
    }

    function renderRight() {
      const el = main.querySelector('#rightPane');
      const modelLabel = trace.labels.find((l) => l.source === 'model_suggestion' && !l.dismissed);
      const humanLabel = trace.labels.find((l) => l.source === 'human_review');
      const secondary = trace.labels.filter((l) => l !== modelLabel && l !== humanLabel && !l.dismissed);
      el.innerHTML = `
        <div class="right-section">
          <h4>${icon('taxonomy', 13)} Failure analysis</h4>
          ${trace.primaryLabel ? `
            ${modelLabel ? labelCard(modelLabel, 'model') : ''}
            ${humanLabel ? labelCard(humanLabel, 'human') : ''}
            ${secondary.map((l) => labelCard(l, 'model', true)).join('')}
          ` : `<div class="io-summary">No failure label — this run passed. You can still flag it for review if the outcome looks wrong.</div>`}
          <div class="flex" style="gap:6px;margin-top:8px">
            <button class="btn sm" id="editLabel" style="flex:1">${icon('edit', 13)} ${humanLabel ? 'Edit review' : 'Add human review'}</button>
          </div>
        </div>
        <div class="right-section">
          <h4>${icon('target', 13)} Root cause</h4>
          <div class="io-summary">${trace.rootStepId ? `Step ${trace.steps.find((s) => s.id === trace.rootStepId).step_number} — ${stepLabel(trace.steps.find((s) => s.id === trace.rootStepId).type)}. Click any step to inspect, or re-assign the root cause from the step panel.` : 'Not yet localized. Step through the trace to identify where it went wrong.'}</div>
        </div>
        <div class="right-section">
          <h4>${icon('check', 13)} Evaluation scores</h4>
          ${scoreRow('Correctness', trace.eval.correctness)}
          ${scoreRow('Groundedness', trace.eval.groundedness)}
          ${scoreRow('Efficiency', trace.eval.efficiency)}
        </div>
        <div class="right-section">
          <h4>${icon('user', 13)} Human feedback</h4>
          <div class="io-summary">${trace.humanFeedback ? feedbackLabel(trace.humanFeedback) : 'No end-user feedback captured for this run.'}</div>
        </div>
        <div class="right-section">
          <h4>${icon('beaker', 13)} Dataset membership</h4>
          ${trace.datasetIds.length ? trace.datasetIds.map((id) => { const d = D.datasets.find((x) => x.id === id); return `<span class="tag clickable" data-ds="${id}" style="cursor:pointer;margin:2px 2px 0 0">${icon('beaker', 11)} ${esc(d.name)}</span>`; }).join('') : '<div class="io-summary">Not in any eval dataset. Promote this trace to make it a reusable regression case.</div>'}
        </div>`;
      el.querySelector('#editLabel').onclick = () => openLabelEditor(trace, () => { AMI.reRenderSidebar(); renderRight(); renderSteps(); });
      el.querySelectorAll('[data-ds]').forEach((t) => t.onclick = () => navigate('datasets', { id: t.dataset.ds }));
    }
    function scoreRow(name, v) {
      const c = v >= 0.6 ? 'var(--st-good)' : v >= 0.4 ? 'var(--st-warning)' : 'var(--st-critical)';
      return `<div class="score-meter" style="margin-bottom:8px"><span style="min-width:88px;font-size:11.5px" class="secondary">${name}</span><div class="track"><div class="fill" style="width:${v * 100}%;background:${c}"></div></div><span class="val">${fmt.pct(v, 0)}</span></div>`;
    }

    renderSteps(); renderStepDetail(); renderRight();
    main.querySelector('#tdBack').onclick = () => navigate('traces');
    main.querySelector('#tdSimilar').onclick = () => showSimilar(trace);
    main.querySelector('#tdPromote').onclick = () => promoteModal([trace]);
    main.querySelector('#tdRegression').onclick = () => regressionModal(trace);
  }
  VIEWS.trace = viewTraceDetail;

  function labelCard(l, kind, secondary) {
    const cat = D.taxonomyById[l.label_id];
    const sub = l.subtype_id ? D.taxonomyById[l.subtype_id] : null;
    return `<div class="label-card">
      <div class="lc-head">${U.labelBadge(l.label_id, { clickable: true })}<span class="lc-source ${kind}">${kind === 'human' ? 'Human' : secondary ? 'Secondary' : 'Model'}</span></div>
      ${sub ? `<div style="margin-top:6px"><span class="tag">${esc(sub.name)}</span></div>` : ''}
      <div class="lc-note">${esc(l.note)}</div>
      <div class="lc-meta">
        <span class="conf-chip">conf ${fmt.pct(l.confidence, 0)}</span>
        ${U.severityBadge(l.severity)}
        ${l.reviewer ? U.reviewerAvatar(l.reviewer, 'sm') + ' ' + esc(D.reviewerById[l.reviewer].name) : ''}
        <span>· ${fmt.ago(l.timestamp)}</span>
      </div>
    </div>`;
  }
  function stepLabel(type) {
    const map = { planner: 'Planner', router: 'Router', tool_call: 'Tool call', memory_retrieval: 'Memory retrieval', synthesis: 'Synthesis', guardrail: 'Guardrail', final_response: 'Final response' };
    return map[type] || type;
  }
  function primaryLabelName(t) { return t.primaryLabel ? D.taxonomyById[t.primaryLabel].name.toLowerCase() : 'misbehavior'; }
  function feedbackLabel(f) {
    return { thumbs_up: '👍 Positive — user accepted the answer.', thumbs_down: '👎 Negative — user rejected the answer.', flagged: '🚩 Flagged for review by the end user.' }[f] || f;
  }
  function rootCauseExplanation(t, st) {
    const m = t.primaryLabel;
    if (m === 'planning_error') return 'the plan omitted or mis-ordered a step the goal required.';
    if (m === 'tool_misuse') return 'the tool was operated incorrectly (wrong arguments or ignored result) while the tool itself was healthy.';
    if (m === 'context_loss') return 'information present earlier in the run was dropped before it was needed here.';
    if (m === 'goal_drift') return 'the run optimized for an adjacent objective rather than the user\'s actual ask.';
    if (m === 'groundedness') return 'the output asserts something the retrieved evidence does not support.';
    if (m === 'retry_loop') return 'the agent repeated this action without making progress.';
    if (m === 'dependency_failure') return 'a downstream system errored or timed out here.';
    if (m === 'guardrail_violation') return 'a policy gate was skipped or its verdict was not honored.';
    return 'the failure was localized to this step during review.';
  }
  function stepFlagReason(t, st) {
    if (st.result === 'error') return 'The tool returned an error payload — downstream steps built on a failed call. Confirm whether the agent handled the failure or silently proceeded.';
    if (st.type === 'synthesis') return 'The synthesis step is where the drafted answer diverged from what the evidence and constraints support. Compare the draft against the tool outputs above.';
    if (st.type === 'guardrail') return 'The policy gate flagged this action but the run proceeded anyway. Guardrails should be blocking for restricted actions.';
    if (st.type === 'planner') return 'The plan produced here is missing a step the rubric requires, or concludes prematurely.';
    return 'This step shows a low step-score and a suspicious pattern relative to the workflow baseline.';
  }

  // ---- Label editor -------------------------------------------------------
  function openLabelEditor(trace, onSaved) {
    const existing = trace.labels.find((l) => l.source === 'human_review');
    const suggested = trace.labels.find((l) => l.source === 'model_suggestion' && !l.dismissed);
    const startMode = existing ? existing.label_id : (suggested ? suggested.label_id : 'planning_error');
    U.openModal({
      title: existing ? 'Edit human review' : 'Add human review',
      body: `<div class="form-row"><label>Compare — model suggestion vs your label</label>
        <div class="flex wrap" style="gap:10px">
          <div class="label-card" style="flex:1;min-width:180px"><div class="lc-head">${suggested ? U.labelBadge(suggested.label_id, { clickable: false }) : '<span class="muted">none</span>'}<span class="lc-source model">Model</span></div><div class="lc-meta" style="margin-top:6px">${suggested ? 'conf ' + fmt.pct(suggested.confidence, 0) : ''}</div></div>
          <div class="flex" style="align-self:center">${icon('arrowRight', 16)}</div>
          <div class="label-card" style="flex:1;min-width:180px;border-color:var(--series-1)"><div class="lc-head"><span id="finalPreview">${U.labelBadge(startMode, { clickable: false })}</span><span class="lc-source human">Human</span></div><div class="lc-meta" style="margin-top:6px">your final label</div></div>
        </div></div>
        <div class="field-inline form-row">
          <div><label>Failure category</label><select class="control" id="leCat">${D.topCategories.map((c) => `<option value="${c.id}"${c.id === startMode ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div><label>Severity</label><select class="control" id="leSev">${D.severities.map((sv) => `<option value="${sv}"${(existing ? existing.severity : D.taxonomyById[startMode].severity_default) === sv ? ' selected' : ''}>${sv[0].toUpperCase() + sv.slice(1)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row"><label>Subtype (optional)</label><select class="control" id="leSub" style="width:100%"><option value="">— none —</option></select></div>
        <div class="field-inline form-row">
          <div><label>Confidence</label><input class="control" id="leConf" type="range" min="50" max="100" value="${existing ? Math.round(existing.confidence * 100) : 90}" style="width:100%"></div>
          <div><label>Root-cause step</label><select class="control" id="leRoot">${trace.steps.map((s) => `<option value="${s.id}"${s.id === trace.rootStepId ? ' selected' : ''}>Step ${s.step_number} · ${stepLabel(s.type)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row"><label>Reviewer rationale</label><textarea class="control" id="leNote" placeholder="Why this label? What is the evidence at the root-cause step?">${existing ? esc(existing.note) : ''}</textarea></div>`,
      footer: `<button class="btn" data-close>Cancel</button>${existing ? '' : '<button class="btn" data-accept>Accept model suggestion</button>'}<button class="btn primary" data-save>${existing ? 'Update label' : 'Save review'}</button>`,
      onMount: (modal, close) => {
        const catSel = modal.querySelector('#leCat'), subSel = modal.querySelector('#leSub'), sevSel = modal.querySelector('#leSev');
        function refreshSubs() {
          const subs = D.subtypesByParent[catSel.value] || [];
          subSel.innerHTML = '<option value="">— none —</option>' + subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
          modal.querySelector('#finalPreview').innerHTML = U.labelBadge(catSel.value, { clickable: false });
        }
        catSel.onchange = () => { refreshSubs(); sevSel.value = D.taxonomyById[catSel.value].severity_default; };
        refreshSubs();
        if (existing && existing.subtype_id) subSel.value = existing.subtype_id;
        modal.querySelector('[data-close]').onclick = close;
        const acceptBtn = modal.querySelector('[data-accept]');
        if (acceptBtn) acceptBtn.onclick = () => { if (suggested) { catSel.value = suggested.label_id; refreshSubs(); } save(); };
        modal.querySelector('[data-save]').onclick = save;
        function save() {
          const label = {
            label_id: catSel.value, subtype_id: subSel.value || null, source: 'human_review',
            confidence: (+modal.querySelector('#leConf').value) / 100, reviewer: 'r_sam',
            timestamp: new Date(U.NOW).toISOString(), note: modal.querySelector('#leNote').value || 'Reviewed and labeled.',
            root_cause_step_id: modal.querySelector('#leRoot').value, severity: sevSel.value,
          };
          trace.labels = trace.labels.filter((l) => l.source !== 'human_review');
          trace.labels.push(label);
          trace.primaryLabel = label.label_id; trace.severity = label.severity;
          trace.reviewStatus = 'reviewed'; trace.reviewer = 'r_sam';
          trace.rootStepId = label.root_cause_step_id;
          trace.steps.forEach((s) => s.is_root_cause = s.id === label.root_cause_step_id);
          const sug = trace.labels.find((l) => l.source === 'model_suggestion' && !l.dismissed);
          trace.humanAgreed = sug ? sug.label_id === label.label_id : null;
          close(); U.toast('Review saved — trace marked reviewed.', 'success');
          if (onSaved) onSaved();
        }
      },
    });
  }
  AMI.openLabelEditor = openLabelEditor;

  // ---- Promote to dataset / regression ------------------------------------
  function promoteModal(traces) {
    const modes = [...new Set(traces.map((t) => t.primaryLabel).filter(Boolean))];
    const defMode = modes[0] || 'planning_error';
    U.openModal({
      title: 'Promote to eval dataset', wide: true,
      body: `<p class="secondary" style="margin-top:0">Reviewed failures become reusable regression cases. ${traces.length} trace${traces.length > 1 ? 's' : ''} pre-selected${modes.length ? ', labeled ' + modes.map((m) => D.taxonomyById[m].name).join(', ') : ''}.</p>
        <div class="field-inline form-row">
          <div><label>Dataset</label><select class="control" id="pmDs" style="width:100%"><option value="__new">+ New dataset…</option>${D.datasets.map((d) => `<option value="${d.id}">${esc(d.name)} (${d.size})</option>`).join('')}</select></div>
          <div><label>Group by failure mode</label><select class="control" id="pmMode" style="width:100%">${D.topCategories.map((c) => `<option value="${c.id}"${c.id === defMode ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row" id="pmNameRow"><label>New dataset name</label><input class="control" id="pmName" style="width:100%" value="${esc(D.taxonomyById[defMode].name)} regressions — ${esc(D.workflowById[traces[0].workflow].name)}"></div>
        <div class="form-row"><label>Tags</label><input class="control" id="pmTags" style="width:100%" value="${defMode}, ${traces[0].release}, regression"></div>
        <div class="form-row"><label class="flex" style="font-weight:400"><input type="checkbox" id="pmSuite" checked> Add to nightly regression suite</label></div>
        <div class="form-row"><label>Selected traces (${traces.length})</label><div class="code-block" style="max-height:150px;overflow:auto">${traces.map((t) => `${t.id}  ${t.primaryLabel || 'unlabeled'}  ${t.release}`).join('\n')}</div></div>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Promote</button>',
      onMount: (modal, close) => {
        const dsSel = modal.querySelector('#pmDs');
        dsSel.onchange = () => { modal.querySelector('#pmNameRow').style.display = dsSel.value === '__new' ? '' : 'none'; };
        modal.querySelector('[data-close]').onclick = close;
        modal.querySelector('[data-save]').onclick = () => {
          if (dsSel.value === '__new') {
            const ds = { id: 'ds_' + Date.now(), name: modal.querySelector('#pmName').value || 'Untitled dataset', failureMode: modal.querySelector('#pmMode').value, tags: modal.querySelector('#pmTags').value.split(',').map((s) => s.trim()).filter(Boolean), inRegressionSuite: modal.querySelector('#pmSuite').checked, createdBy: 'r_sam', created: new Date(U.NOW).toISOString(), builds: [], traceIds: traces.map((t) => t.id), size: traces.length };
            D.datasets.unshift(ds);
            traces.forEach((t) => { if (!t.datasetIds.includes(ds.id)) t.datasetIds.push(ds.id); });
            close(); U.toast('Created dataset “' + ds.name + '” with ' + traces.length + ' cases.', 'success'); navigate('datasets', { id: ds.id });
          } else {
            const ds = D.datasets.find((d) => d.id === dsSel.value);
            traces.forEach((t) => { if (!t.datasetIds.includes(ds.id)) { t.datasetIds.push(ds.id); ds.traceIds.push(t.id); ds.size++; } });
            close(); U.toast('Added ' + traces.length + ' traces to “' + ds.name + '”.', 'success'); navigate('datasets', { id: ds.id });
          }
        };
      },
    });
  }
  AMI.promoteModal = promoteModal;

  function regressionModal(trace) {
    U.openModal({
      title: 'Create regression test',
      body: `<p class="secondary" style="margin-top:0">Freeze this trace as an assertion so the failure can't silently return in a future build.</p>
        <div class="form-row"><label>Test name</label><input class="control" id="rgName" style="width:100%" value="regression__${trace.workflow}__${trace.primaryLabel || 'failure'}"></div>
        <div class="form-row"><label>Assertion</label><select class="control" id="rgAssert" style="width:100%">
          <option>Outcome must be "pass" (currently ${trace.outcome})</option>
          <option>Must not exhibit ${trace.primaryLabel ? D.taxonomyById[trace.primaryLabel].name.toLowerCase() : 'this failure'}</option>
          <option>Root-cause step must not error</option>
          <option>Cost must stay under ${fmt.usd(trace.cost)}</option>
        </select></div>
        <div class="form-row"><label>Fixture</label><div class="code-block">{
  "trace_id": "${trace.id}",
  "workflow": "${trace.workflow}",
  "input": ${JSON.stringify(trace.goal)},
  "expected": { "no_failure_mode": "${trace.primaryLabel || ''}" }
}</div></div>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Create test</button>',
      onMount: (modal, close) => {
        modal.querySelector('[data-close]').onclick = close;
        modal.querySelector('[data-save]').onclick = () => { close(); U.toast('Regression test created and added to the suite (mock).', 'success'); };
      },
    });
  }

  // ---- register remaining views (defined in views2.js) is not needed;
  //      the rest are defined below in this file.
  window.AMI_VIEW_HELPERS = { openTaxonomyDetail, showSimilar, promoteModal, stepLabel, labelCard };
})();
