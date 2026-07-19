# Agent Failure Intelligence

A production-grade, single-page **web application** for teams operating AI agents.
It turns raw agent traces into a structured, queryable, reviewable system for
understanding **where agents fail, why they fail, how often each failure mode
occurs, and whether product or prompt changes actually improve those failure
modes over time.**

It is **not** a generic trace viewer. Trace viewers show *what happened*; this
tool adds a consistent **semantic layer for failure attribution** — a hybrid of
an observability console, a QA review workbench, and a product-analytics system.

> Everything runs in-browser on realistic mock data. **No backend, no build
> step, no localStorage, no external dependencies.**

---

## Live demo

- **GitHub Pages:** https://ramjoshionline.github.io/Agent-Failure-Intelligence/
- Or open `index.html` directly in a browser (works over `file://`).

## Run locally

```bash
git clone https://github.com/ramjoshionline/Agent-Failure-Intelligence.git
cd Agent-Failure-Intelligence

# Option A — just open it
open index.html            # macOS   (Windows: start index.html · Linux: xdg-open index.html)

# Option B — serve it (recommended)
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, `php -S localhost:8000`, VS Code
Live Server, …). There is nothing to install or compile.

---

## The problem it solves

Current agent logs show tool calls, prompts, outputs, and timing — but they
provide no consistent way to attribute *failure*. Teams can't reliably label a
run as a planning error, tool misuse, context loss, goal drift, groundedness
failure, retry loop, dependency failure, or guardrail violation, so they can't
prioritize fixes or measure whether a change actually worked. This app supplies
that missing semantic layer and the review/eval loop around it.

## Who it's for

- **AI Product Manager** — trends, workflow quality, release-over-release change, top themes.
- **Agent Engineer** — step-level replay, tool-call inspection, root-cause labeling.
- **Evaluation Engineer** — review queues, adjudication, reusable labeled datasets.
- **Reliability / Ops Lead** — SLO-style dashboards, spikes, regressions, drill-down.

---

## Features

| Section | What it does |
|---|---|
| **Overview** | Executive dashboard: KPIs (runs, pass/misbehavior rate, criticals, surface-success failures, backlog, failure spend), failure-mode trend, outcome mix, worst workflows, tool-risk leaderboard, v1.4 regression deltas, most-expensive failing runs, evals-converted, review backlog. |
| **Traces** | Searchable/sortable/expandable table of every run with quick filters, keyboard navigation, and JSON/CSV export. |
| **Trace detail / replay** | Three-pane replay: chronological step list, selected-step detail (input, tool args, output, "why flagged"), and a right rail with model-vs-human labels, eval scores, and root-cause assignment. |
| **Review Queue** | Annotation workbench sorted by uncertainty / impact / cost / enterprise; bulk assign, mark reviewed, promote; model-suggested vs human-final label comparison. |
| **Taxonomy** | First-class failure vocabulary — definition, inclusion/exclusion criteria, symptoms, examples, severity guidance, remediations, and subtypes; plus a tool × failure-mode heatmap. |
| **Compare** | Before/after release, model A/B, segment, or environment — failure-mix shift, metric deltas, and representative traces for each regression/improvement; pin two traces side-by-side. |
| **Datasets** | Promote reviewed failures into eval datasets / regression suites and track pass/fail across builds. |
| **Insights** | Synthesized cross-trace patterns (e.g. "planning errors rose after v1.4", "a quarter of failures look successful on the surface"), each linking to its evidence. |
| **Settings** | Workspace prefs, SLOs & alerting hooks, the auto-labeling classifier, and team. |

Also throughout: light/dark theme, global search (`/` to focus), sticky filters,
drawers/modals/toasts, and first-class empty / loading / error states.

---

## Architecture

Plain HTML/CSS/JS — no framework, no bundler. Files load in order; each attaches
to a small set of globals.

```
index.html      App shell + a README comment describing structure & interactions.
css/app.css     Design tokens (light/dark), layout, and all component styles.
js/data.js      -> window.AMI_DATA   Deterministic mock data (seeded PRNG).
js/icons.js     -> window.icon()     Inline SVG icon set.
js/charts.js    -> window.Charts     Dependency-free SVG charts (line, stacked bar,
                                     heatmap, scatter, leaderboard, diverging deltas,
                                     donut, sankey-style flow, sparkline) with
                                     tooltips + click-to-drill.
js/util.js      -> window.U          Formatting, badge builders, the filter engine,
                                     derived metrics, and shared UI (modal/drawer/
                                     toast/menu).
js/app.js       -> window.AMI        Shell: state, router (view registry), sidebar,
                                     topbar, sticky filter bar, and the Overview view.
js/views.js                          Traces explorer, Trace detail/replay, taxonomy
                                     drawer, label editor, promote/regression modals.
js/views2.js                         Review Queue, Taxonomy, Compare, Datasets,
                                     Insights, Settings.
```

- A view **registry** (`window.AMI_VIEWS`) lets the router swap `#main` while the
  sidebar and topbar persist. Shared state (filters, theme, selections, in-memory
  review edits) lives in `app.js` and is exposed to the view files via `window.AMI`.
- Chart series colors come from validated CSS palette tokens and **follow the
  entity** (failure mode), never the rank — so light/dark and filtering stay
  consistent.

### Mock data model (`js/data.js`)

Generated from a seeded PRNG, so dashboards are stable across reloads.

```
Trace    { id, workflow, release, environment, segment, model, goal, outcome,
           surfaceSuccess, timestamp, steps[], rootStepId, toolCount, stepCount,
           duration, cost, tokens, labels[], reviewStatus, reviewer, humanAgreed,
           humanFeedback, eval{correctness,groundedness,efficiency},
           primaryLabel, suggestedLabel, severity, datasetIds[] }

Step     { id, step_number, type(planner|router|tool_call|memory_retrieval|
           synthesis|guardrail|final_response), input_summary, tool, args, output,
           result, score, suspicion, is_root_cause }

Label    { label_id, subtype_id, source(model_suggestion|human_review), confidence,
           reviewer, timestamp, note, root_cause_step_id, severity }

Category { id, name, parent_id, description, inclusion, exclusion, symptoms[],
           examples[], severity_default, review_guidance, remediations, color }
```

Seeded with **220 traces** (each with nested steps), **8 workflows**, **12 tools**,
**5 releases**, **6 reviewers**, an **11-category taxonomy** with subtypes, and
**5 eval datasets**. It deliberately includes passing runs, false positives,
multi-label traces, reviewed/unreviewed mixes, and "surface success but semantic
failure" cases.

---

## Design notes

- **Utilitarian, high-trust internal tool** — dense but readable, restrained,
  strong status colors, evidence-first. Closer to Linear / Datadog than a
  marketing page.
- **Accessible & responsive** — semantic HTML, visible focus states, keyboard
  table navigation, `prefers-color-scheme` plus a manual theme toggle.
- **Self-contained** — no CDN, no fonts to fetch, no network calls; charts are
  hand-built SVG so the whole app is one static bundle.

## Tech stack

Vanilla HTML, CSS, and JavaScript. No dependencies.

## Status

Front-end prototype with mock data. Every visible control is functional — charts
drill into filtered tables, badges open taxonomy detail, replay steps drive the
root-cause panel, reviewers edit labels, traces pin/compare, and reviewed
failures promote into eval datasets.
