/*
 * util.js — formatting, badge builders, the filtering engine, derived metrics,
 * and shared UI primitives (modal / drawer / toast / menu). Depends on
 * window.AMI_DATA, window.icon, window.Charts.
 */
(function () {
  'use strict';
  const D = window.AMI_DATA;

  // ---- Formatting ---------------------------------------------------------
  const fmt = {
    pct: (n, dp) => (n * 100).toFixed(dp == null ? 1 : dp) + '%',
    usd: (n) => '$' + (n < 1 ? n.toFixed(3) : n.toFixed(2)),
    usdShort: (n) => '$' + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(2)),
    dur: (s) => s >= 60 ? Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's' : s.toFixed(1) + 's',
    int: (n) => n.toLocaleString('en-US'),
    date: (iso) => { const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); },
    datetime: (iso) => { const d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); },
    ago: (iso) => {
      const s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
      if (s < 86400) return Math.round(s / 3600) + 'h ago';
      return Math.round(s / 86400) + 'd ago';
    },
  };
  // Fixed "now" for stable relative-time labels (data ends 2026-07-18).
  const NOW = new Date('2026-07-19T09:00:00Z').getTime();
  fmt.ago = (iso) => {
    const s = (NOW - new Date(iso).getTime()) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- Badge builders -----------------------------------------------------
  function labelBadge(labelId, opts) {
    opts = opts || {};
    const cat = D.taxonomyById[labelId];
    if (!cat) return '';
    const color = window.Charts.seriesColor(labelId);
    return `<span class="badge label-badge${opts.clickable === false ? '' : ' clickable'}" data-label="${labelId}" title="${esc(cat.description)}" style="background:color-mix(in srgb,${color} 14%,var(--surface-1));color:color-mix(in srgb,${color} 72%,var(--text-primary))">
      <span class="dot" style="background:${color}"></span>${esc(cat.name)}${opts.sub ? ' · ' + esc(opts.sub) : ''}</span>`;
  }
  function outcomeBadge(outcome) {
    const map = { pass: 'Pass', partial: 'Partial', fail: 'Fail' };
    return `<span class="badge outcome-${outcome}">${map[outcome] || outcome}</span>`;
  }
  function severityBadge(sev) {
    if (!sev) return '<span class="muted">—</span>';
    const label = { minor: 'Minor', warning: 'Warning', serious: 'Serious', critical: 'Critical' }[sev];
    return `<span class="sev sev-${sev}"><span class="dot"></span>${label}</span>`;
  }
  function reviewBadge(status) {
    const label = { reviewed: 'Reviewed', in_review: 'In review', unreviewed: 'Unreviewed' }[status] || status;
    return `<span class="review-badge rb-${status}"><span class="dot"></span>${label}</span>`;
  }
  function reviewerAvatar(id, size) {
    const r = D.reviewerById[id]; if (!r) return '';
    const hue = (id.charCodeAt(2) * 37) % 360;
    return `<span class="avatar${size === 'sm' ? ' sm' : ''}" title="${esc(r.name)} · ${esc(r.role)}" style="background:hsl(${hue} 45% 45%)">${r.initials}</span>`;
  }

  // ---- Filtering engine ---------------------------------------------------
  // filters: {dateDays, workflow, release, environment, segment, model,
  //           severity, reviewStatus, failureMode, surfaceSuccess, tool, reviewer, dataset}
  function applyFilters(traces, f) {
    f = f || {};
    const cutoff = f.dateDays ? NOW - f.dateDays * 86400 * 1000 : null;
    return traces.filter((t) => {
      if (cutoff && new Date(t.timestamp).getTime() < cutoff) return false;
      if (f.workflow && t.workflow !== f.workflow) return false;
      if (f.release && t.release !== f.release) return false;
      if (f.environment && t.environment !== f.environment) return false;
      if (f.segment && t.segment !== f.segment) return false;
      if (f.model && t.model !== f.model) return false;
      if (f.severity && t.severity !== f.severity) return false;
      if (f.reviewStatus && t.reviewStatus !== f.reviewStatus) return false;
      if (f.failureMode && t.primaryLabel !== f.failureMode && !(t.labels || []).some((l) => l.label_id === f.failureMode)) return false;
      if (f.surfaceSuccess && !t.surfaceSuccess) return false;
      if (f.reviewer && t.reviewer !== f.reviewer) return false;
      if (f.dataset && !(t.datasetIds || []).includes(f.dataset)) return false;
      if (f.tool && !t.steps.some((s) => s.tool === f.tool)) return false;
      if (f.outcome && t.outcome !== f.outcome) return false;
      return true;
    });
  }

  // ---- Metrics ------------------------------------------------------------
  function metrics(traces) {
    const total = traces.length;
    const failing = traces.filter((t) => t.outcome !== 'pass');
    const passing = traces.filter((t) => t.outcome === 'pass');
    const reviewed = traces.filter((t) => t.reviewStatus === 'reviewed');
    const unreviewed = traces.filter((t) => t.reviewStatus === 'unreviewed');
    const backlog = traces.filter((t) => t.reviewStatus === 'in_review' || t.reviewStatus === 'unreviewed');
    const surfaceSuccess = traces.filter((t) => t.surfaceSuccess);
    const critical = traces.filter((t) => t.severity === 'critical');
    const cost = traces.reduce((s, t) => s + t.cost, 0);
    return {
      total, passing: passing.length, failing: failing.length,
      passRate: total ? passing.length / total : 0,
      failRate: total ? failing.length / total : 0,
      reviewed: reviewed.length, unreviewed: unreviewed.length, backlog: backlog.length,
      surfaceSuccess: surfaceSuccess.length, critical: critical.length,
      cost, avgCost: total ? cost / total : 0,
      avgDuration: total ? traces.reduce((s, t) => s + t.duration, 0) / total : 0,
    };
  }

  // Failure-mode counts (by primary label) among a trace set.
  function failureModeCounts(traces) {
    const counts = {};
    D.topCategories.forEach((c) => { counts[c.id] = 0; });
    traces.forEach((t) => { if (t.primaryLabel) counts[t.primaryLabel] = (counts[t.primaryLabel] || 0) + 1; });
    return counts;
  }

  // Per-workflow rollup.
  function workflowStats(traces) {
    return D.workflows.map((w) => {
      const ts = traces.filter((t) => t.workflow === w.id);
      const m = metrics(ts);
      const modes = failureModeCounts(ts.filter((t) => t.outcome !== 'pass'));
      const topMode = Object.entries(modes).sort((a, b) => b[1] - a[1]).filter((e) => e[1] > 0)[0];
      return { workflow: w, total: m.total, failRate: m.failRate, failing: m.failing, critical: m.critical, cost: m.cost, avgCost: m.avgCost, topMode: topMode ? topMode[0] : null, modes };
    }).filter((r) => r.total > 0);
  }

  // Per-tool risk: fraction of failing traces where tool is at/near the root cause.
  function toolStats(traces) {
    const stat = {};
    D.tools.forEach((t) => { stat[t.id] = { tool: t, uses: 0, implicated: 0 }; });
    traces.forEach((t) => {
      const used = new Set(t.steps.filter((s) => s.tool).map((s) => s.tool));
      used.forEach((tl) => { if (stat[tl]) stat[tl].uses++; });
      if (t.outcome !== 'pass' && t.rootStepId) {
        const rc = t.steps.find((s) => s.id === t.rootStepId);
        if (rc && rc.tool && stat[rc.tool]) stat[rc.tool].implicated++;
      }
    });
    return Object.values(stat).map((s) => ({ ...s, risk: s.uses ? s.implicated / s.uses : 0 })).filter((s) => s.uses > 0);
  }

  // Tool x failure-mode co-occurrence matrix (for heatmap).
  function toolFailureMatrix(traces) {
    const rows = D.tools;
    const cols = D.topCategories.filter((c) => ['planning_error', 'tool_misuse', 'context_loss', 'goal_drift', 'groundedness', 'retry_loop', 'dependency_failure', 'guardrail_violation'].includes(c.id));
    const matrix = rows.map(() => cols.map(() => 0));
    traces.forEach((t) => {
      if (t.outcome === 'pass' || !t.primaryLabel) return;
      const ci = cols.findIndex((c) => c.id === t.primaryLabel);
      if (ci < 0) return;
      const rc = t.rootStepId ? t.steps.find((s) => s.id === t.rootStepId) : null;
      const tl = rc && rc.tool ? rc.tool : (t.steps.filter((s) => s.tool).slice(-1)[0] || {}).tool;
      const ri = rows.findIndex((r) => r.id === tl);
      if (ri >= 0) matrix[ri][ci]++;
    });
    return { rows, cols, matrix };
  }

  // Trend over weeks: failure-mode counts per week bucket.
  function weeklyTrend(traces, modeKeys) {
    const weeks = [];
    const start = new Date('2026-03-02').getTime();
    const end = new Date('2026-07-18').getTime();
    const wk = 7 * 86400 * 1000;
    for (let t = start; t <= end; t += wk) weeks.push(t);
    const labels = weeks.map((t) => fmt.date(new Date(t).toISOString()));
    const series = modeKeys.map((k) => ({ key: k, name: D.taxonomyById[k].name, values: weeks.map(() => 0) }));
    const totalsPerWeek = weeks.map(() => 0);
    traces.forEach((t) => {
      const ti = new Date(t.timestamp).getTime();
      let wi = Math.floor((ti - start) / wk);
      if (wi < 0) wi = 0; if (wi >= weeks.length) wi = weeks.length - 1;
      totalsPerWeek[wi]++;
      if (t.outcome !== 'pass' && t.primaryLabel) {
        const s = series.find((x) => x.key === t.primaryLabel);
        if (s) s.values[wi]++;
      }
    });
    return { labels, series, totalsPerWeek, weeks };
  }

  // Release-over-release failure-mode rate.
  function releaseModeRates(traces) {
    return D.releases.map((r) => {
      const ts = traces.filter((t) => t.release === r.id);
      const counts = failureModeCounts(ts.filter((t) => t.outcome !== 'pass'));
      const rates = {};
      D.topCategories.forEach((c) => { rates[c.id] = ts.length ? counts[c.id] / ts.length : 0; });
      return { release: r, total: ts.length, rates, m: metrics(ts) };
    });
  }

  // ---- Similar traces -----------------------------------------------------
  function similarTraces(trace, all, limit) {
    return all.filter((t) => t.id !== trace.id)
      .map((t) => {
        let score = 0;
        if (t.primaryLabel && t.primaryLabel === trace.primaryLabel) score += 3;
        if (t.workflow === trace.workflow) score += 2;
        const rc = trace.rootStepId ? trace.steps.find((s) => s.id === trace.rootStepId) : null;
        const rcTool = rc && rc.tool;
        if (rcTool && t.steps.some((s) => s.tool === rcTool && s.is_root_cause)) score += 2;
        if (t.release === trace.release) score += 0.5;
        return { t, score };
      })
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 6)
      .map((x) => x.t);
  }

  // ---- Shared UI primitives ----------------------------------------------
  function toast(msg, kind) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    const ic = kind === 'success' ? 'checkCircle' : kind === 'warn' ? 'warning' : 'info';
    t.innerHTML = window.icon(ic, 17) + '<span>' + esc(msg) + '</span>';
    stack.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  let overlayEl;
  function overlay() {
    if (!overlayEl) { overlayEl = document.createElement('div'); overlayEl.className = 'overlay'; document.body.appendChild(overlayEl); }
    return overlayEl;
  }
  function openModal(opts) {
    const ov = overlay();
    const modal = document.createElement('div');
    modal.className = 'modal' + (opts.wide ? ' wide' : '');
    modal.innerHTML = `
      <div class="modal-head"><h3>${esc(opts.title)}</h3><button class="iconbtn close" aria-label="Close">${window.icon('close', 18)}</button></div>
      <div class="modal-body">${opts.body || ''}</div>
      ${opts.footer !== false ? `<div class="modal-foot">${opts.footer || ''}</div>` : ''}`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => { ov.classList.add('open'); modal.classList.add('open'); });
    function close() { ov.classList.remove('open'); modal.classList.remove('open'); setTimeout(() => modal.remove(), 180); ov.onclick = null; document.removeEventListener('keydown', onKey); }
    ov.onclick = close;
    modal.querySelector('.close').onclick = close;
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    if (opts.onMount) opts.onMount(modal, close);
    return { modal, close };
  }
  function openDrawer(opts) {
    const ov = overlay();
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.innerHTML = `<div class="drawer-head"><h3>${esc(opts.title)}</h3>${opts.headExtra || ''}<button class="iconbtn close" style="margin-left:auto" aria-label="Close">${window.icon('close', 18)}</button></div><div class="drawer-body">${opts.body || ''}</div>`;
    document.body.appendChild(drawer);
    requestAnimationFrame(() => { ov.classList.add('open'); drawer.classList.add('open'); });
    function close() { ov.classList.remove('open'); drawer.classList.remove('open'); setTimeout(() => drawer.remove(), 220); ov.onclick = null; document.removeEventListener('keydown', onKey); }
    ov.onclick = close;
    drawer.querySelector('.close').onclick = close;
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    if (opts.onMount) opts.onMount(drawer, close);
    return { drawer, close };
  }
  function openMenu(anchor, items, align) {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'menu'; menu.dataset.menu = '1';
    menu.innerHTML = items.map((it) => {
      if (it.sep) return '<div class="menu-sep"></div>';
      if (it.label) return `<div class="menu-label">${esc(it.label)}</div>`;
      return `<div class="menu-item${it.checked ? ' check' : ''}" data-idx="${it._i}">${it.icon ? window.icon(it.icon, 15) : ''}<span>${esc(it.text)}</span></div>`;
    }).join('');
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    let left = align === 'right' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    menu.style.left = left + 'px';
    menu.style.top = (r.bottom + 5) + 'px';
    items.forEach((it, i) => { it._i = i; });
    menu.querySelectorAll('.menu-item').forEach((mi) => {
      mi.onclick = () => { const it = items[+mi.dataset.idx]; closeMenus(); if (it.onClick) it.onClick(); };
    });
    setTimeout(() => document.addEventListener('click', closeMenusOnce, { once: true }), 0);
    return menu;
  }
  function closeMenusOnce() { closeMenus(); }
  function closeMenus() { document.querySelectorAll('[data-menu]').forEach((m) => m.remove()); }

  window.U = {
    D, fmt, esc, NOW,
    labelBadge, outcomeBadge, severityBadge, reviewBadge, reviewerAvatar,
    applyFilters, metrics, failureModeCounts, workflowStats, toolStats,
    toolFailureMatrix, weeklyTrend, releaseModeRates, similarTraces,
    toast, openModal, openDrawer, openMenu, closeMenus,
  };
})();
