/*
 * charts.js — dependency-free SVG charts for Agent Failure Intelligence.
 * Colors come from the CSS series tokens (--series-1..8) so light/dark swap
 * automatically. Each chart supports a hover tooltip and an onClick(datum)
 * callback for drill-down. Series colors follow the entity, never the rank.
 *
 * window.Charts:
 *   .seriesColor(key)            -> css var color for a failure-mode/entity key
 *   .lineTrend(el, opts)         -> multi-series line (failure-mode trends)
 *   .stackedBar(el, opts)        -> stacked bars (failure mix by workflow / time)
 *   .heatmap(el, opts)           -> tool x failure-mode density
 *   .scatter(el, opts)           -> cost vs severity
 *   .leaderboard(el, opts)       -> horizontal bar list (returns HTML)
 *   .deltaBars(el, opts)         -> diverging regression deltas
 *   .donut(el, opts)             -> outcome / mix donut
 *   .flow(el, opts)              -> workflow -> failure-type flow (sankey-ish)
 *   .sparkline(values, w, h)     -> tiny inline svg string
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  // Stable failure-mode -> series slot mapping (color follows the entity).
  const MODE_COLOR = {
    planning_error: 'var(--series-1)',
    dependency_failure: 'var(--series-2)',
    goal_drift: 'var(--series-3)',
    retry_loop: 'var(--series-4)',
    groundedness: 'var(--series-5)',
    tool_misuse: 'var(--series-6)',
    context_loss: 'var(--series-7)',
    guardrail_violation: 'var(--series-8)',
    output_format: 'var(--series-neutral)',
    inefficient: 'var(--series-neutral)',
    human_escalation: 'var(--series-neutral)',
  };
  function seriesColor(key) { return MODE_COLOR[key] || 'var(--series-neutral)'; }
  // Fallback palette for arbitrary entities (workflows etc.)
  const SLOTS = ['var(--series-1)', 'var(--series-6)', 'var(--series-7)', 'var(--series-3)', 'var(--series-5)', 'var(--series-4)', 'var(--series-2)', 'var(--series-8)'];
  function slotColor(i) { return SLOTS[i % SLOTS.length]; }

  function el(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---- Tooltip (single shared element) -----------------------------------
  let tip;
  function tooltip() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tooltip'; document.body.appendChild(tip); }
    return tip;
  }
  function showTip(html, ev) {
    const t = tooltip(); t.innerHTML = html; t.style.opacity = '1';
    const pad = 14; let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.style.opacity = '0'; }

  function measure(container) {
    const w = container.clientWidth || 600;
    return w;
  }

  // ---- Multi-series line trend -------------------------------------------
  function lineTrend(container, opts) {
    clear(container);
    const W = measure(container), H = opts.height || 240;
    const m = { t: 14, r: 14, b: 26, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const labels = opts.labels; // x labels
    const series = opts.series;  // [{key,name,values:[]}]
    const active = opts.active || {};
    const maxV = Math.max(0.001, ...series.flatMap((s) => s.values));
    const nY = 4;
    const x = (i) => m.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / maxV) * ih;

    for (let g = 0; g <= nY; g++) {
      const gy = m.t + (g / nY) * ih;
      svg.appendChild(el('line', { class: 'grid-line', x1: m.l, y1: gy, x2: m.l + iw, y2: gy }));
      const lab = el('text', { class: 'axis-label', x: m.l - 6, y: gy + 3, 'text-anchor': 'end' });
      lab.textContent = opts.pct ? Math.round(maxV * (1 - g / nY) * 100) + '%' : Math.round(maxV * (1 - g / nY));
      svg.appendChild(lab);
    }
    // x labels (thinned)
    const step = Math.ceil(labels.length / 8);
    labels.forEach((lb, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const t = el('text', { class: 'axis-label', x: x(i), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = lb; svg.appendChild(t);
    });

    series.forEach((s) => {
      if (active[s.key] === false) return;
      let d = '';
      s.values.forEach((v, i) => { d += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; });
      svg.appendChild(el('path', { d, fill: 'none', stroke: seriesColor(s.key), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });

    // hover crosshair
    const cross = el('line', { class: 'axis-line', y1: m.t, y2: m.t + ih, opacity: 0 });
    svg.appendChild(cross);
    const overlay = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    overlay.style.cursor = 'crosshair';
    overlay.addEventListener('mousemove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const scale = W / rect.width;
      const px = (ev.clientX - rect.left) * scale;
      let idx = Math.round(((px - m.l) / iw) * (labels.length - 1));
      idx = Math.max(0, Math.min(labels.length - 1, idx));
      cross.setAttribute('x1', x(idx)); cross.setAttribute('x2', x(idx)); cross.setAttribute('opacity', 0.6);
      const rows = series.filter((s) => active[s.key] !== false).map((s) =>
        `<div class="tt-row"><span class="sw" style="background:${seriesColor(s.key)}"></span>${s.name}<span class="tt-val">${opts.pct ? Math.round(s.values[idx] * 100) + '%' : s.values[idx]}</span></div>`).join('');
      showTip(`<div class="tt-title">${labels[idx]}</div>${rows}`, ev);
    });
    overlay.addEventListener('mouseleave', () => { hideTip(); cross.setAttribute('opacity', 0); });
    if (opts.onClick) { overlay.style.cursor = 'pointer'; overlay.addEventListener('click', (ev) => {
      const rect = svg.getBoundingClientRect(); const scale = W / rect.width;
      let idx = Math.round((((ev.clientX - rect.left) * scale - m.l) / iw) * (labels.length - 1));
      idx = Math.max(0, Math.min(labels.length - 1, idx)); opts.onClick(idx, labels[idx]); }); }
    svg.appendChild(overlay);
    container.appendChild(svg);
  }

  // ---- Stacked bar --------------------------------------------------------
  function stackedBar(container, opts) {
    clear(container);
    const W = measure(container), H = opts.height || 260;
    const m = { t: 14, r: 12, b: opts.rotate ? 64 : 30, l: 38 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const cats = opts.categories; // [{key,name, parts:[{key,name,value}]}]
    const active = opts.active || {};
    const totals = cats.map((c) => c.parts.reduce((s, p) => s + (active[p.key] === false ? 0 : p.value), 0));
    const maxV = Math.max(0.001, ...totals);
    const nY = 4;
    for (let g = 0; g <= nY; g++) {
      const gy = m.t + (g / nY) * ih;
      svg.appendChild(el('line', { class: 'grid-line', x1: m.l, y1: gy, x2: m.l + iw, y2: gy }));
      const lab = el('text', { class: 'axis-label', x: m.l - 6, y: gy + 3, 'text-anchor': 'end' });
      lab.textContent = Math.round(maxV * (1 - g / nY)); svg.appendChild(lab);
    }
    const bw = Math.min(48, (iw / cats.length) * 0.62);
    const gap = iw / cats.length;
    cats.forEach((c, i) => {
      const cx = m.l + gap * i + gap / 2;
      let yCursor = m.t + ih;
      c.parts.forEach((p) => {
        if (active[p.key] === false || p.value === 0) return;
        const h = (p.value / maxV) * ih;
        if (h <= 0) return;
        const color = p.color || (opts.colorByPart ? seriesColor(p.key) : slotColor(i));
        const rect = el('rect', { class: 'chart-bar', x: cx - bw / 2, y: yCursor - h + 1, width: bw, height: Math.max(0, h - 2), rx: 2, fill: color });
        rect.style.cursor = 'pointer';
        rect.addEventListener('mousemove', (ev) => showTip(`<div class="tt-title">${c.name}</div><div class="tt-row"><span class="sw" style="background:${color}"></span>${p.name}<span class="tt-val">${p.value}</span></div>`, ev));
        rect.addEventListener('mouseleave', hideTip);
        if (opts.onClick) rect.addEventListener('click', () => opts.onClick(c, p));
        svg.appendChild(rect);
        yCursor -= h;
      });
      const lab = el('text', { class: 'axis-label', x: cx, y: H - (opts.rotate ? 46 : 10), 'text-anchor': opts.rotate ? 'end' : 'middle' });
      lab.textContent = c.name.length > 16 && !opts.rotate ? c.name.slice(0, 15) + '…' : c.name;
      if (opts.rotate) lab.setAttribute('transform', `rotate(-32 ${cx} ${H - 46})`);
      svg.appendChild(lab);
    });
    container.appendChild(svg);
  }

  // ---- Heatmap ------------------------------------------------------------
  function heatmap(container, opts) {
    clear(container);
    const rows = opts.rows, cols = opts.cols, matrix = opts.matrix; // matrix[r][c]
    const W = measure(container);
    const m = { t: 12, r: 12, b: 70, l: 118 };
    const cw = Math.max(24, (W - m.l - m.r) / cols.length);
    const ch = 26;
    const H = m.t + rows.length * ch + m.b;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    let maxV = 0.001; matrix.forEach((r) => r.forEach((v) => { if (v > maxV) maxV = v; }));
    // blue sequential
    function cellColor(v) {
      if (v === 0) return 'var(--surface-3)';
      const t = v / maxV; // 0..1
      const a = 0.12 + t * 0.85;
      return `color-mix(in srgb, var(--series-1) ${Math.round(a * 100)}%, var(--surface-1))`;
    }
    rows.forEach((r, ri) => {
      const ry = m.t + ri * ch;
      const lab = el('text', { class: 'axis-label', x: m.l - 8, y: ry + ch / 2 + 3, 'text-anchor': 'end' });
      lab.textContent = r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name; svg.appendChild(lab);
      cols.forEach((c, ci) => {
        const v = matrix[ri][ci];
        const cx = m.l + ci * cw;
        const cell = el('rect', { class: 'heatmap-cell', x: cx + 1.5, y: ry + 1.5, width: cw - 3, height: ch - 3, rx: 3, fill: cellColor(v), stroke: 'var(--border-hairline)' });
        cell.addEventListener('mousemove', (ev) => showTip(`<div class="tt-title">${r.name} × ${c.name}</div><div class="tt-row">Occurrences<span class="tt-val">${v}</span></div>`, ev));
        cell.addEventListener('mouseleave', hideTip);
        if (opts.onClick) cell.addEventListener('click', () => opts.onClick(r, c, v));
        svg.appendChild(cell);
        if (v > 0 && cw > 30) {
          const t = el('text', { x: cx + cw / 2, y: ry + ch / 2 + 3.5, 'text-anchor': 'middle', 'font-size': 10, fill: (v / maxV > 0.55) ? '#fff' : 'var(--text-secondary)', 'font-weight': 600 });
          t.textContent = v; svg.appendChild(t);
        }
      });
    });
    cols.forEach((c, ci) => {
      const cx = m.l + ci * cw + cw / 2;
      const y0 = m.t + rows.length * ch + 12;
      const lab = el('text', { class: 'axis-label', x: cx, y: y0, 'text-anchor': 'end', transform: `rotate(-40 ${cx} ${y0})` });
      lab.textContent = c.name; svg.appendChild(lab);
    });
    container.appendChild(svg);
  }

  // ---- Scatter (cost vs severity/score) ----------------------------------
  function scatter(container, opts) {
    clear(container);
    const W = measure(container), H = opts.height || 280;
    const m = { t: 14, r: 16, b: 40, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const pts = opts.points; // [{x,y,color,r,datum,label}]
    const maxX = Math.max(0.01, ...pts.map((p) => p.x)) * 1.05;
    const maxY = opts.maxY || Math.max(0.01, ...pts.map((p) => p.y)) * 1.05;
    const X = (v) => m.l + (v / maxX) * iw;
    const Y = (v) => m.t + ih - (v / maxY) * ih;
    for (let g = 0; g <= 4; g++) {
      const gy = m.t + (g / 4) * ih;
      svg.appendChild(el('line', { class: 'grid-line', x1: m.l, y1: gy, x2: m.l + iw, y2: gy }));
      const lab = el('text', { class: 'axis-label', x: m.l - 6, y: gy + 3, 'text-anchor': 'end' });
      lab.textContent = opts.yFmt ? opts.yFmt(maxY * (1 - g / 4)) : Math.round(maxY * (1 - g / 4)); svg.appendChild(lab);
    }
    for (let g = 0; g <= 4; g++) {
      const gx = m.l + (g / 4) * iw;
      const lab = el('text', { class: 'axis-label', x: gx, y: H - 22, 'text-anchor': 'middle' });
      lab.textContent = opts.xFmt ? opts.xFmt(maxX * (g / 4)) : Math.round(maxX * (g / 4)); svg.appendChild(lab);
    }
    // axis titles
    const xt = el('text', { class: 'axis-label', x: m.l + iw / 2, y: H - 6, 'text-anchor': 'middle', 'font-weight': 600 }); xt.textContent = opts.xTitle || ''; svg.appendChild(xt);
    const yt = el('text', { class: 'axis-label', x: 12, y: m.t + ih / 2, 'text-anchor': 'middle', 'font-weight': 600, transform: `rotate(-90 12 ${m.t + ih / 2})` }); yt.textContent = opts.yTitle || ''; svg.appendChild(yt);

    pts.forEach((p) => {
      const c = el('circle', { class: 'chart-dot', cx: X(p.x), cy: Y(p.y), r: p.r || 5, fill: p.color, 'fill-opacity': 0.72, stroke: 'var(--surface-1)', 'stroke-width': 1 });
      c.style.cursor = 'pointer';
      c.addEventListener('mousemove', (ev) => showTip(`<div class="tt-title">${p.label}</div>${p.tt || ''}`, ev));
      c.addEventListener('mouseleave', hideTip);
      if (opts.onClick) c.addEventListener('click', () => opts.onClick(p.datum));
      svg.appendChild(c);
    });
    container.appendChild(svg);
  }

  // ---- Leaderboard (HTML, not SVG) ---------------------------------------
  function leaderboard(container, opts) {
    container.innerHTML = '';
    const max = Math.max(0.001, ...opts.rows.map((r) => r.value));
    opts.rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const color = r.color || slotColor(i);
      row.innerHTML = `<div class="lb-name" title="${r.name}">${r.name}</div>
        <div class="lb-track"><span style="width:${(r.value / max) * 100}%;background:${color}"></span></div>
        <div class="lb-val">${opts.fmt ? opts.fmt(r.value) : r.value}</div>`;
      if (r.sub) { row.querySelector('.lb-name').innerHTML += ` <span class="muted" style="font-size:11px">${r.sub}</span>`; }
      if (opts.onClick) row.addEventListener('click', () => opts.onClick(r));
      container.appendChild(row);
    });
  }

  // ---- Diverging delta bars (regression) ---------------------------------
  function deltaBars(container, opts) {
    clear(container);
    const rows = opts.rows; // [{name, delta}] delta can be +/-
    const W = measure(container);
    const rowH = 30; const m = { t: 8, r: 60, b: 8, l: 130 };
    const H = m.t + rows.length * rowH + m.b;
    const iw = W - m.l - m.r;
    const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.delta)));
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const mid = m.l + iw / 2;
    svg.appendChild(el('line', { class: 'axis-line', x1: mid, y1: m.t, x2: mid, y2: H - m.b }));
    rows.forEach((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      const lab = el('text', { class: 'axis-label', x: m.l - 8, y: cy + 3, 'text-anchor': 'end' });
      lab.textContent = r.name.length > 19 ? r.name.slice(0, 18) + '…' : r.name;
      const titleEl = el('title'); titleEl.textContent = r.name; lab.appendChild(titleEl);
      svg.appendChild(lab);
      const w = (Math.abs(r.delta) / maxAbs) * (iw / 2);
      const worse = r.delta > 0; // more failures = worse
      const color = worse ? 'var(--st-critical)' : 'var(--st-good)';
      const x = worse ? mid : mid - w;
      const bar = el('rect', { class: 'chart-bar', x, y: cy - 8, width: Math.max(1, w), height: 16, rx: 3, fill: color });
      bar.addEventListener('mousemove', (ev) => showTip(`<div class="tt-title">${r.name}</div><div class="tt-row">${worse ? 'Worse' : 'Improved'} by<span class="tt-val">${(r.delta > 0 ? '+' : '') + r.delta}</span></div>`, ev));
      bar.addEventListener('mouseleave', hideTip);
      if (opts.onClick) { bar.style.cursor = 'pointer'; bar.addEventListener('click', () => opts.onClick(r)); }
      svg.appendChild(bar);
      const v = el('text', { class: 'axis-label', x: worse ? mid + w + 6 : mid - w - 6, y: cy + 3, 'text-anchor': worse ? 'start' : 'end', 'font-weight': 600, fill: color });
      v.textContent = (r.delta > 0 ? '+' : '') + r.delta; svg.appendChild(v);
    });
    container.appendChild(svg);
  }

  // ---- Donut --------------------------------------------------------------
  function donut(container, opts) {
    clear(container);
    const size = opts.size || 160; const stroke = opts.stroke || 22;
    const r = (size - stroke) / 2; const cx = size / 2; const cy = size / 2;
    const circ = 2 * Math.PI * r;
    const total = opts.parts.reduce((s, p) => s + p.value, 0) || 1;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, width: size, height: size });
    svg.appendChild(el('circle', { cx, cy, r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': stroke }));
    let offset = 0;
    opts.parts.forEach((p) => {
      const frac = p.value / total;
      const arc = el('circle', { cx, cy, r, fill: 'none', stroke: p.color, 'stroke-width': stroke, 'stroke-dasharray': `${frac * circ} ${circ}`, 'stroke-dashoffset': -offset, transform: `rotate(-90 ${cx} ${cy})` });
      arc.style.cursor = opts.onClick ? 'pointer' : 'default';
      arc.addEventListener('mousemove', (ev) => showTip(`<div class="tt-row"><span class="sw" style="background:${p.color}"></span>${p.name}<span class="tt-val">${p.value} (${Math.round(frac * 100)}%)</span></div>`, ev));
      arc.addEventListener('mouseleave', hideTip);
      if (opts.onClick) arc.addEventListener('click', () => opts.onClick(p));
      svg.appendChild(arc);
      offset += frac * circ;
    });
    if (opts.center) {
      const t1 = el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: 'var(--text-primary)', 'pointer-events': 'none' }); t1.textContent = opts.center;
      const t2 = el('text', { x: cx, y: cy + 15, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--text-muted)', 'pointer-events': 'none' }); t2.textContent = opts.centerSub || '';
      svg.appendChild(t1); svg.appendChild(t2);
    }
    container.appendChild(svg);
  }

  // ---- Flow (workflow -> failure type), a Sankey substitute --------------
  function flow(container, opts) {
    clear(container);
    const W = measure(container);
    const left = opts.left;   // [{key,name,value}]
    const right = opts.right; // [{key,name,value}]
    const links = opts.links; // [{from,to,value}]
    const m = { t: 12, b: 12 };
    const nodeH = 22, gap = 8;
    const H = Math.max(left.length, right.length) * (nodeH + gap) + m.t + m.b + 10;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const lx = 8, lw = 150, rx = W - 158, rw = 150;
    const leftTotal = left.reduce((s, n) => s + n.value, 0) || 1;
    const rightTotal = right.reduce((s, n) => s + n.value, 0) || 1;
    const areaH = H - m.t - m.b;
    // position nodes proportionally
    const lpos = {}; let ly = m.t;
    left.forEach((n) => { const h = Math.max(nodeH, (n.value / leftTotal) * areaH - gap); lpos[n.key] = { y: ly, h }; ly += h + gap; });
    const rpos = {}; let ry = m.t;
    right.forEach((n) => { const h = Math.max(nodeH, (n.value / rightTotal) * areaH - gap); rpos[n.key] = { y: ry, h }; ry += h + gap; });
    // links (ordered by left then right offset)
    const lOff = {}; const rOff = {};
    links.forEach((lk) => {
      const lp = lpos[lk.from], rp = rpos[lk.to]; if (!lp || !rp) return;
      const lh = (lk.value / (left.find((n) => n.key === lk.from).value || 1)) * lp.h;
      const rh = (lk.value / (right.find((n) => n.key === lk.to).value || 1)) * rp.h;
      const y1 = lp.y + (lOff[lk.from] = (lOff[lk.from] || 0)) ; lOff[lk.from] += lh;
      const y2 = rp.y + (rOff[lk.to] = (rOff[lk.to] || 0)); rOff[lk.to] += rh;
      const x1 = lx + lw, x2 = rx;
      const cxo = (x2 - x1) / 2;
      const path = el('path', {
        d: `M${x1} ${y1} C${x1 + cxo} ${y1}, ${x2 - cxo} ${y2}, ${x2} ${y2} L${x2} ${y2 + rh} C${x2 - cxo} ${y2 + rh}, ${x1 + cxo} ${y1 + lh}, ${x1} ${y1 + lh} Z`,
        fill: seriesColor(lk.to), 'fill-opacity': 0.28, stroke: 'none',
      });
      path.style.cursor = opts.onClick ? 'pointer' : 'default';
      path.addEventListener('mousemove', (ev) => { path.setAttribute('fill-opacity', 0.5); showTip(`<div class="tt-row">${lk.fromName} → ${lk.toName}<span class="tt-val">${lk.value}</span></div>`, ev); });
      path.addEventListener('mouseleave', () => { path.setAttribute('fill-opacity', 0.28); hideTip(); });
      if (opts.onClick) path.addEventListener('click', () => opts.onClick(lk));
      svg.appendChild(path);
    });
    // nodes
    left.forEach((n) => {
      const p = lpos[n.key];
      svg.appendChild(el('rect', { x: lx, y: p.y, width: lw, height: p.h, rx: 4, fill: 'var(--surface-3)', stroke: 'var(--border)' }));
      const t = el('text', { class: 'axis-label', x: lx + 8, y: p.y + p.h / 2 + 3.5, 'font-weight': 600, fill: 'var(--text-secondary)' });
      t.textContent = n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name; svg.appendChild(t);
    });
    right.forEach((n) => {
      const p = rpos[n.key];
      svg.appendChild(el('rect', { x: rx, y: p.y, width: rw, height: p.h, rx: 4, fill: seriesColor(n.key), 'fill-opacity': 0.9 }));
      const t = el('text', { x: rx + 8, y: p.y + p.h / 2 + 3.5, 'font-size': 10.5, 'font-weight': 600, fill: '#fff' });
      t.textContent = n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name; svg.appendChild(t);
    });
    container.appendChild(svg);
  }

  // ---- Sparkline (inline string) -----------------------------------------
  function sparkline(values, w, h, color) {
    w = w || 80; h = h || 22;
    const max = Math.max(...values, 0.001), min = Math.min(...values, 0);
    const range = (max - min) || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 2) + 1},${h - 2 - ((v - min) / range) * (h - 4)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="chart"><polyline points="${pts}" fill="none" stroke="${color || 'var(--series-1)'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  window.Charts = { seriesColor, slotColor, lineTrend, stackedBar, heatmap, scatter, leaderboard, deltaBars, donut, flow, sparkline, MODE_COLOR };
})();
