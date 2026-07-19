/*
 * data.js — Mock data model for Agent Failure Intelligence
 * ------------------------------------------------------------
 * Everything the prototype renders comes from this module. There is no backend;
 * data is generated deterministically at load time from a seeded PRNG so the
 * dashboards, tables and charts are stable across reloads (no localStorage).
 *
 * Exposed on window.AMI_DATA:
 *   - taxonomy        : array of failure categories (top-level + subtypes)
 *   - taxonomyById    : map id -> category
 *   - workflows       : 8 agent workflows
 *   - tools           : 12 tools
 *   - releases        : 5 release versions (ordered oldest -> newest)
 *   - reviewers       : 6 human reviewers
 *   - environments    : deployment environments
 *   - segments        : user segments
 *   - models          : model versions
 *   - traces          : 220 trace records, each with nested steps + labels
 *   - datasets        : eval datasets built from reviewed failures
 *   - savedViews      : mock saved/bookmarked views
 *   - insights        : synthesized cross-trace insights
 */
(function () {
  'use strict';

  // ---- Seeded PRNG (mulberry32) — deterministic mock data -----------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(0xA11CE);
  const rand = () => rnd();
  const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pickWeighted = (pairs) => {
    // pairs: [[value, weight], ...]
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let r = rand() * total;
    for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const chance = (p) => rand() < p;
  const round2 = (n) => Math.round(n * 100) / 100;

  // ---- Failure taxonomy ---------------------------------------------------
  // Top-level categories carry the analytic palette color. Subtypes inherit.
  const taxonomy = [
    {
      id: 'planning_error', name: 'Planning error', parent_id: null, color: 'blue',
      severity_default: 'serious',
      description: 'The agent produced a flawed plan: it decomposed the task incorrectly, skipped a step required to satisfy the goal, or concluded before the work was actually complete.',
      inclusion: 'Use when the failure originates in how the agent structured its approach — the ordering, the decomposition, or the decision to stop — rather than in any single tool call.',
      exclusion: 'Do not use when the plan was sound but a tool returned bad data (Groundedness / Dependency) or the wrong tool was invoked (Tool misuse).',
      symptoms: ['Answers a narrower question than asked', 'Stops after the first sub-result', 'Never sequences a mandatory verification step', 'Parallelizes steps that had a data dependency'],
      examples: ['Skipped the "check refund policy" step before issuing a refund', 'Concluded "no incidents" without querying the alerts source'],
      review_guidance: 'Look at the planner/router steps first. If the plan text omits a step the rubric requires, label here even if downstream tools ran cleanly.',
      remediations: 'Add plan-validation guardrail; few-shot the decomposition; require explicit checklist for high-stakes workflows.',
    },
    {
      id: 'tool_misuse', name: 'Tool misuse', parent_id: null, color: 'orange',
      severity_default: 'serious',
      description: 'The agent chose the wrong tool, called the right tool with invalid or incomplete parameters, or ignored the tool result it received.',
      inclusion: 'Use when the tool itself was healthy but the agent operated it incorrectly.',
      exclusion: 'Do not use when the tool errored or was unavailable (External dependency failure).',
      symptoms: ['Passes a natural-language question into a SQL argument', 'Calls web_search when the answer was in the provided context', 'Discards a correct tool result and hallucinates instead'],
      examples: ['Called crm_lookup with an email in the account_id field', 'Ran sql_query with an unfiltered scan then ignored the rows'],
      review_guidance: 'Compare the tool args against the tool schema and the step input. Check whether the result was actually used downstream.',
      remediations: 'Tighten tool schemas; add argument validators; add a "did you use the result" reflection step.',
    },
    {
      id: 'context_loss', name: 'Context loss', parent_id: null, color: 'violet',
      severity_default: 'serious',
      description: 'The agent lost information it had earlier: it forgot a user constraint, dropped a finding from a previous step, or truncated memory it needed.',
      inclusion: 'Use when correct information was present earlier in the run but was absent when it mattered.',
      exclusion: 'Do not use when the information was never gathered (Planning error) or was wrong to begin with (Groundedness).',
      symptoms: ['Violates a constraint the user stated up front', 'Re-asks for data already retrieved', 'Final answer contradicts an intermediate finding'],
      examples: ['User said "exclude EU customers" but the brief included them', 'Dropped the severity found in step 3 from the final summary'],
      review_guidance: 'Trace the constraint or finding forward through the steps. Identify the exact step where it disappears — that is the root cause.',
      remediations: 'Pin constraints into a persistent scratchpad; increase memory window; add constraint-recall check before synthesis.',
    },
    {
      id: 'goal_drift', name: 'Goal drift', parent_id: null, color: 'magenta',
      severity_default: 'serious',
      description: 'The agent gradually shifted away from the user\'s actual objective toward a related but incorrect one.',
      inclusion: 'Use when the run starts on-target and progressively optimizes for the wrong outcome.',
      exclusion: 'Do not use for a single wrong decomposition at the start (Planning error).',
      symptoms: ['Answers an adjacent question thoroughly but not the asked one', 'Optimizes a proxy metric', 'Expands scope until the original ask is lost'],
      examples: ['Asked to summarize a contract\'s risks, produced a full rewrite instead', 'Asked for last quarter, drifted into a full-year analysis'],
      review_guidance: 'Read the user goal, then read the final response. If they are on different questions and the middle shows a slow slide, label here.',
      remediations: 'Re-inject the goal before synthesis; add a goal-alignment scorer; shorten agent loops.',
    },
    {
      id: 'groundedness', name: 'Groundedness failure', parent_id: null, color: 'aqua',
      severity_default: 'critical',
      description: 'The agent asserted something not supported by its sources or tools — a hallucinated fact, an unsupported number, or a fabricated citation.',
      inclusion: 'Use when the output contains claims that the retrieved evidence does not support.',
      exclusion: 'Do not use when the source itself was wrong but faithfully reported (Dependency failure).',
      symptoms: ['Cites a document that does not exist', 'States a metric no tool returned', 'Confidently answers with no retrieval at all'],
      examples: ['Reported "$1.2M ARR" with no sql_query backing it', 'Invented a policy clause not present in the contract'],
      review_guidance: 'For every factual claim in the final answer, find the supporting step. Unsupported claims are groundedness failures.',
      remediations: 'Require citations; add a grounding verifier; penalize claims without a source span.',
    },
    {
      id: 'retry_loop', name: 'Retry loop / stuck', parent_id: null, color: 'yellow',
      severity_default: 'serious',
      description: 'The agent repeated the same or near-identical action without progress, burning steps, latency and cost.',
      inclusion: 'Use when the run contains repeated cycles that do not advance the task.',
      exclusion: 'Do not use for a single failed call that then succeeds (normal retry).',
      symptoms: ['Same tool called 4+ times with the same args', 'Alternating between two states', 'Step count far above the workflow median'],
      examples: ['Called browser_automation 7 times on the same failing selector', 'Re-planned in a loop without ever executing'],
      review_guidance: 'Scan the step list for repetition. A loop is the root cause even if an earlier step triggered it.',
      remediations: 'Add loop detection with a hard step cap; back off on repeated identical calls; escalate to human after N retries.',
    },
    {
      id: 'dependency_failure', name: 'External dependency failure', parent_id: null, color: 'green',
      severity_default: 'warning',
      description: 'A tool or external system errored, timed out, rate-limited, or returned malformed data — the failure originated outside the agent.',
      inclusion: 'Use when a downstream system is at fault, not the agent\'s handling of it.',
      exclusion: 'If the agent handled the error badly (ignored it, hallucinated around it), also/instead label Tool misuse or Groundedness.',
      symptoms: ['Tool output is an error payload', 'Timeout on an external call', 'Empty result from a healthy query due to upstream outage'],
      examples: ['crm_lookup returned 503 during a CRM outage', 'sql_query timed out on a locked table'],
      review_guidance: 'Confirm the tool output itself is an error/timeout. This is often a co-label with how the agent then reacted.',
      remediations: 'Add graceful degradation; surface the dependency error to the user; retry with backoff and circuit-breaker.',
    },
    {
      id: 'guardrail_violation', name: 'Guardrail / policy violation', parent_id: null, color: 'red',
      severity_default: 'critical',
      description: 'The agent did something it was not permitted to do — sent an unapproved email, exposed restricted data, or took an action outside policy.',
      inclusion: 'Use for any breach of a stated policy or safety guardrail.',
      exclusion: 'Do not use for merely inefficient-but-allowed behavior (Successful but inefficient).',
      symptoms: ['policy_check skipped or overridden', 'PII in an outbound message', 'Action taken without required approval'],
      examples: ['send_email fired to a customer without the approval gate', 'Included restricted salary data in a shared brief'],
      review_guidance: 'Check whether a policy_check step ran and whether its verdict was honored. A skipped/ignored gate is critical.',
      remediations: 'Make guardrails blocking, not advisory; require explicit approval tokens; audit every restricted action.',
    },
    {
      id: 'output_format', name: 'Output formatting failure', parent_id: null, color: 'neutral',
      severity_default: 'minor',
      description: 'The content was largely correct but the format was wrong: broken JSON, wrong schema, missing required fields, or an unusable structure.',
      inclusion: 'Use when the substance is acceptable but the shape is not machine- or human-usable.',
      exclusion: 'Do not use when the content itself is wrong (Groundedness / Goal drift).',
      symptoms: ['Malformed JSON', 'Missing a required field', 'Markdown where a table was requested'],
      examples: ['Returned prose instead of the requested JSON object', 'Omitted the "severity" field the schema required'],
      review_guidance: 'Validate the output against the expected schema. Format-only issues stay here.',
      remediations: 'Constrained decoding / schema-enforced output; add a format validator step; repair-and-retry on parse failure.',
    },
    {
      id: 'inefficient', name: 'Successful but inefficient', parent_id: null, color: 'neutral',
      severity_default: 'minor',
      description: 'The agent reached a correct outcome but used far more steps, latency or cost than necessary.',
      inclusion: 'Use when the result passes but the path was wasteful.',
      exclusion: 'Do not use when the extra work was a loop with no progress (Retry loop).',
      symptoms: ['Correct answer, 2-3x the median cost', 'Redundant retrievals', 'Unnecessary tool calls that did not change the answer'],
      examples: ['Ran web_search three times when the first result sufficed', 'Correct SQL answer after five redundant exploratory queries'],
      review_guidance: 'Confirm the outcome is actually correct, then compare cost/steps to the workflow median.',
      remediations: 'Cache retrievals; prune redundant branches; reward-shape for efficiency.',
    },
    {
      id: 'human_escalation', name: 'Human escalation required', parent_id: null, color: 'neutral',
      severity_default: 'warning',
      description: 'The task genuinely exceeded the agent\'s scope and should have been handed to a human — either it escalated correctly (a good outcome to confirm) or it should have and did not.',
      inclusion: 'Use when the correct behavior was to defer to a human.',
      exclusion: 'Do not use when the agent could and should have completed the task itself.',
      symptoms: ['Ambiguous, high-stakes request', 'Missing authority or data to act', 'Agent proceeded where it should have deferred'],
      examples: ['Contract edge case needing legal sign-off', 'Refund above the agent\'s authorized limit'],
      review_guidance: 'Judge whether deferral was the right call. Confirm correct escalations; flag missed ones as a failure.',
      remediations: 'Define escalation thresholds; add a confidence-to-escalate policy; route high-stakes intents to review.',
    },
    // ---- Subtypes ----
    { id: 'tm_wrong_tool', name: 'Wrong tool selected', parent_id: 'tool_misuse', color: 'orange', severity_default: 'serious', description: 'A different tool was the correct choice for the sub-task.', symptoms: ['web_search used when a local source had the answer'], examples: [], review_guidance: 'Check if a better-fit tool was available.', remediations: 'Improve tool descriptions and routing.' },
    { id: 'tm_invalid_params', name: 'Invalid parameters', parent_id: 'tool_misuse', color: 'orange', severity_default: 'serious', description: 'The tool was right but called with malformed or wrong arguments.', symptoms: ['Wrong field mapping', 'Missing required arg'], examples: [], review_guidance: 'Diff args against the tool schema.', remediations: 'Add argument validators.' },
    { id: 'tm_incomplete_use', name: 'Incomplete use', parent_id: 'tool_misuse', color: 'orange', severity_default: 'minor', description: 'The tool was used but not fully — a needed parameter or follow-up call was omitted.', symptoms: ['Unfiltered query', 'Partial pagination'], examples: [], review_guidance: 'Check whether the call captured all needed data.', remediations: 'Prompt for completeness.' },
    { id: 'tm_result_ignored', name: 'Result ignored', parent_id: 'tool_misuse', color: 'orange', severity_default: 'serious', description: 'A correct tool result was discarded or contradicted downstream.', symptoms: ['Answer contradicts the tool output'], examples: [], review_guidance: 'Trace the result into the final answer.', remediations: 'Add a use-the-result reflection.' },

    { id: 'cl_forgot_constraint', name: 'Forgot user constraint', parent_id: 'context_loss', color: 'violet', severity_default: 'serious', description: 'A constraint the user stated was violated later in the run.', symptoms: ['Ignores an explicit exclusion'], examples: [], review_guidance: 'Track the constraint forward.', remediations: 'Pin constraints in scratchpad.' },
    { id: 'cl_dropped_finding', name: 'Dropped previous finding', parent_id: 'context_loss', color: 'violet', severity_default: 'serious', description: 'A finding from an earlier step is missing from the final output.', symptoms: ['Final answer omits step-3 finding'], examples: [], review_guidance: 'Match findings to the summary.', remediations: 'Carry-forward summary of findings.' },
    { id: 'cl_memory_truncation', name: 'Memory truncation', parent_id: 'context_loss', color: 'violet', severity_default: 'serious', description: 'The context window truncated information the agent still needed.', symptoms: ['Long run loses early context'], examples: [], review_guidance: 'Check step count and window pressure.', remediations: 'Summarize + compress memory.' },

    { id: 'pe_wrong_decomposition', name: 'Wrong decomposition', parent_id: 'planning_error', color: 'blue', severity_default: 'serious', description: 'The task was broken into the wrong sub-tasks.', symptoms: ['Sub-tasks do not cover the goal'], examples: [], review_guidance: 'Compare plan to the rubric.', remediations: 'Few-shot better decompositions.' },
    { id: 'pe_skipped_step', name: 'Skipped critical step', parent_id: 'planning_error', color: 'blue', severity_default: 'serious', description: 'A mandatory step was never planned or executed.', symptoms: ['No verification step'], examples: [], review_guidance: 'Check for required steps.', remediations: 'Checklist guardrail.' },
    { id: 'pe_premature_conclusion', name: 'Premature conclusion', parent_id: 'planning_error', color: 'blue', severity_default: 'serious', description: 'The agent concluded before the work was complete.', symptoms: ['Stops after first sub-result'], examples: [], review_guidance: 'Check whether all sub-goals were met.', remediations: 'Completion check before answer.' },
  ];
  const taxonomyById = {};
  taxonomy.forEach((t) => { taxonomyById[t.id] = t; });
  const topCategories = taxonomy.filter((t) => t.parent_id === null);
  const subtypesByParent = {};
  taxonomy.filter((t) => t.parent_id).forEach((t) => {
    (subtypesByParent[t.parent_id] = subtypesByParent[t.parent_id] || []).push(t);
  });

  // ---- Workflows ----------------------------------------------------------
  const workflows = [
    { id: 'support_triage', name: 'Support ticket triage', owner: 'Support Platform', criticality: 'high' },
    { id: 'research_assistant', name: 'Research assistant', owner: 'Knowledge', criticality: 'medium' },
    { id: 'sales_brief', name: 'Sales account brief', owner: 'Revenue', criticality: 'medium' },
    { id: 'sql_analytics', name: 'SQL analytics assistant', owner: 'Data Platform', criticality: 'high' },
    { id: 'onboarding_copilot', name: 'Customer onboarding copilot', owner: 'Customer Success', criticality: 'high' },
    { id: 'bug_triage', name: 'Bug triage agent', owner: 'Developer Tools', criticality: 'medium' },
    { id: 'contract_review', name: 'Contract review copilot', owner: 'Legal Ops', criticality: 'high' },
    { id: 'incident_response', name: 'Incident response assistant', owner: 'Reliability', criticality: 'high' },
  ];
  const workflowById = {};
  workflows.forEach((w) => { workflowById[w.id] = w; });

  // ---- Tools --------------------------------------------------------------
  const tools = [
    { id: 'search_docs', name: 'search_docs', kind: 'retrieval' },
    { id: 'web_search', name: 'web_search', kind: 'retrieval' },
    { id: 'sql_query', name: 'sql_query', kind: 'data' },
    { id: 'crm_lookup', name: 'crm_lookup', kind: 'data' },
    { id: 'send_email', name: 'send_email', kind: 'action' },
    { id: 'jira_create', name: 'jira_create', kind: 'action' },
    { id: 'slack_post', name: 'slack_post', kind: 'action' },
    { id: 'policy_check', name: 'policy_check', kind: 'guardrail' },
    { id: 'code_exec', name: 'code_exec', kind: 'compute' },
    { id: 'file_parser', name: 'file_parser', kind: 'compute' },
    { id: 'browser_automation', name: 'browser_automation', kind: 'action' },
    { id: 'memory_fetch', name: 'memory_fetch', kind: 'retrieval' },
  ];
  const toolById = {};
  tools.forEach((t) => { toolById[t.id] = t; });

  // Which tools each workflow tends to use.
  const workflowTools = {
    support_triage: ['memory_fetch', 'search_docs', 'crm_lookup', 'policy_check', 'jira_create', 'send_email'],
    research_assistant: ['web_search', 'search_docs', 'file_parser', 'memory_fetch'],
    sales_brief: ['crm_lookup', 'search_docs', 'web_search', 'memory_fetch'],
    sql_analytics: ['sql_query', 'code_exec', 'memory_fetch', 'search_docs'],
    onboarding_copilot: ['crm_lookup', 'search_docs', 'policy_check', 'send_email', 'slack_post', 'memory_fetch'],
    bug_triage: ['search_docs', 'code_exec', 'jira_create', 'memory_fetch', 'sql_query'],
    contract_review: ['file_parser', 'search_docs', 'policy_check', 'memory_fetch'],
    incident_response: ['sql_query', 'search_docs', 'slack_post', 'code_exec', 'policy_check', 'memory_fetch'],
  };

  // ---- Releases -----------------------------------------------------------
  // Ordered oldest -> newest. v1.4 is "the latest release" referenced in insights.
  const releases = [
    { id: 'v1.0', name: 'v1.0', date: '2026-03-02', note: 'Baseline GA' },
    { id: 'v1.1', name: 'v1.1', date: '2026-04-06', note: 'Routing rework' },
    { id: 'v1.2', name: 'v1.2', date: '2026-05-11', note: 'Memory compression' },
    { id: 'v1.3', name: 'v1.3', date: '2026-06-08', note: 'Tool schema tightening' },
    { id: 'v1.4', name: 'v1.4', date: '2026-07-06', note: 'Planner refactor + new model' },
  ];
  const releaseIndex = {};
  releases.forEach((r, i) => { releaseIndex[r.id] = i; });

  // ---- Reviewers, environments, segments, models --------------------------
  const reviewers = [
    { id: 'r_amara', name: 'Amara Osei', role: 'Eval Engineer', initials: 'AO' },
    { id: 'r_diego', name: 'Diego Ramirez', role: 'Agent Engineer', initials: 'DR' },
    { id: 'r_lin', name: 'Lin Zhao', role: 'Reliability Lead', initials: 'LZ' },
    { id: 'r_priya', name: 'Priya Nair', role: 'Eval Engineer', initials: 'PN' },
    { id: 'r_sam', name: 'Sam Whitfield', role: 'Product Manager', initials: 'SW' },
    { id: 'r_yuki', name: 'Yuki Tanaka', role: 'Agent Engineer', initials: 'YT' },
  ];
  const reviewerById = {};
  reviewers.forEach((r) => { reviewerById[r.id] = r; });

  const environments = ['production', 'staging', 'canary'];
  const segments = ['Enterprise', 'Mid-market', 'SMB', 'Internal'];
  const models = ['gpt-orion-2', 'gpt-orion-2-mini', 'claude-astra-3', 'llama-guard-3'];

  const severities = ['minor', 'warning', 'serious', 'critical'];
  const severityRank = { minor: 1, warning: 2, serious: 3, critical: 4 };

  // ---- Trace step synthesis ----------------------------------------------
  const stepTypes = ['planner', 'router', 'tool_call', 'memory_retrieval', 'synthesis', 'guardrail', 'final_response'];

  const goalTemplates = {
    support_triage: [
      'Route ticket #{n}: customer reports billing charged twice',
      'Triage ticket #{n}: login fails after SSO migration',
      'Classify ticket #{n}: data export stuck for enterprise account',
      'Handle ticket #{n}: refund request for cancelled plan',
    ],
    research_assistant: [
      'Summarize the latest findings on retrieval-augmented agents',
      'Compare three vendors for our vector database migration',
      'Find and synthesize regulatory changes affecting Q3 launch',
      'Draft a literature review on agent evaluation methods',
    ],
    sales_brief: [
      'Build an account brief for Northwind Trading ahead of renewal',
      'Prepare a pre-call brief for the Acme expansion opportunity',
      'Summarize account health and risks for Globex before QBR',
      'Draft outreach context for the Initech pilot',
    ],
    sql_analytics: [
      'What was net revenue retention last quarter, excluding EU?',
      'Break down active users by plan tier for the last 30 days',
      'Find the top 10 accounts by support ticket volume this month',
      'Compute churn rate by cohort for H1',
    ],
    onboarding_copilot: [
      'Guide Meridian Corp through workspace setup and invites',
      'Complete onboarding checklist for the Vertex enterprise account',
      'Configure SSO and provision seats for new customer Halcyon',
      'Walk Summit Labs through data import and first dashboard',
    ],
    bug_triage: [
      'Triage crash report in checkout service, assign to a team',
      'Reproduce and label the flaky auth integration test',
      'Diagnose elevated 500s on the search endpoint',
      'Classify and route the reported data-sync regression',
    ],
    contract_review: [
      'Review the Northwind MSA and flag liability risks',
      'Extract and assess termination clauses in the Acme SOW',
      'Compare the vendor NDA against our standard template',
      'Identify data-processing risks in the Globex DPA',
    ],
    incident_response: [
      'Assess the payments latency spike and recommend next steps',
      'Correlate the database CPU alert with recent deploys',
      'Summarize the ongoing search outage for the incident channel',
      'Determine blast radius of the auth service degradation',
    ],
  };

  function toolArgsFor(toolId, goal) {
    switch (toolId) {
      case 'sql_query': return { query: 'SELECT metric FROM warehouse.fct_revenue WHERE period = :q AND region != :excl', params: { q: '2026-Q2', excl: 'EU' } };
      case 'crm_lookup': return { account_id: 'acct_' + randInt(10000, 99999), fields: ['health', 'arr', 'owner'] };
      case 'search_docs': return { query: goal.slice(0, 48), top_k: 5, source: 'internal_kb' };
      case 'web_search': return { query: goal.slice(0, 40), recency_days: 90 };
      case 'send_email': return { to: 'customer@example.com', template: 'resolution_summary', requires_approval: true };
      case 'jira_create': return { project: 'SUP', issue_type: 'Bug', priority: pick(['P1', 'P2', 'P3']) };
      case 'slack_post': return { channel: '#incident-bridge', text: 'Status update posted' };
      case 'policy_check': return { action: 'outbound_message', scope: pick(['pii', 'approval', 'data_class']) };
      case 'code_exec': return { language: 'python', snippet: 'df.groupby("cohort").churn.mean()' };
      case 'file_parser': return { file: 'contract_' + randInt(100, 999) + '.pdf', mode: 'clauses' };
      case 'browser_automation': return { url: 'https://app.internal/console', action: 'extract_table' };
      case 'memory_fetch': return { keys: ['user_constraints', 'prior_findings'], window: 12 };
      default: return {};
    }
  }

  function buildSteps(trace, failure, rootTool) {
    const wfTools = workflowTools[trace.workflow];
    const steps = [];
    let n = 1;
    const push = (obj) => { obj.step_number = n++; obj.id = trace.id + '-s' + obj.step_number; steps.push(obj); };

    // Planner
    push({
      type: 'planner', tool: null,
      input_summary: 'User goal received. Decomposing into sub-tasks and selecting an execution strategy.',
      output: 'Plan: (1) gather context, (2) run required tools, (3) verify against constraints, (4) synthesize answer.',
      result: 'ok', score: round2(0.7 + rand() * 0.3), suspicion: false, is_root_cause: false,
    });
    // Memory retrieval
    push({
      type: 'memory_retrieval', tool: 'memory_fetch',
      input_summary: 'Fetching prior findings and any standing user constraints for this task.',
      args: toolArgsFor('memory_fetch', trace.goal),
      output: chance(0.85) ? 'Retrieved 2 constraints and 1 prior finding.' : 'No prior context found (cold start).',
      result: 'ok', score: round2(0.6 + rand() * 0.35), suspicion: false, is_root_cause: false,
    });
    // Router
    push({
      type: 'router', tool: null,
      input_summary: 'Selecting tools for the plan based on the workflow toolset.',
      output: 'Routing to: ' + wfTools.slice(0, randInt(2, 3)).join(', '),
      result: 'ok', score: round2(0.65 + rand() * 0.3), suspicion: false, is_root_cause: false,
    });
    // A few tool calls
    const nToolSteps = trace.long ? randInt(6, 11) : randInt(2, 4);
    for (let i = 0; i < nToolSteps; i++) {
      const t = pick(wfTools.filter((x) => x !== 'memory_fetch')) || wfTools[0];
      steps_tool(t, i);
    }
    function steps_tool(t, i) {
      const isDepFail = failure === 'dependency_failure' && t === rootTool;
      const isToolMisuse = failure === 'tool_misuse' && t === rootTool;
      const isLoop = failure === 'retry_loop' && t === rootTool;
      const out = isDepFail ? 'ERROR 503: upstream service unavailable (timeout after 30s)'
        : isToolMisuse ? 'Returned 0 rows — argument mapping looks wrong (natural-language text in an id field).'
          : 'Returned ' + randInt(1, 40) + ' results in ' + randInt(120, 2400) + 'ms.';
      push({
        type: 'tool_call', tool: t,
        input_summary: 'Calling ' + t + ' to advance sub-task ' + (i + 1) + '.',
        args: toolArgsFor(t, trace.goal),
        output: out,
        result: isDepFail ? 'error' : 'ok',
        score: (isDepFail || isToolMisuse) ? round2(0.1 + rand() * 0.2) : round2(0.55 + rand() * 0.4),
        suspicion: isDepFail || isToolMisuse || isLoop,
        is_root_cause: false,
      });
      if (isLoop) {
        for (let k = 0; k < randInt(3, 5); k++) {
          push({
            type: 'tool_call', tool: t,
            input_summary: 'Retrying ' + t + ' with the same arguments (no change in state).',
            args: toolArgsFor(t, trace.goal),
            output: 'Same result as previous attempt — no progress.',
            result: 'ok', score: round2(0.1 + rand() * 0.15), suspicion: true, is_root_cause: false,
          });
        }
      }
    }
    // Guardrail (sometimes)
    const hasGuardrail = wfTools.includes('policy_check') || failure === 'guardrail_violation';
    if (hasGuardrail) {
      const violated = failure === 'guardrail_violation';
      push({
        type: 'guardrail', tool: 'policy_check',
        input_summary: 'Checking the pending action against policy before proceeding.',
        args: toolArgsFor('policy_check', trace.goal),
        output: violated ? 'Policy gate returned REQUIRES_APPROVAL — but the run proceeded without an approval token.'
          : 'Policy gate: allowed.',
        result: violated ? 'error' : 'ok',
        score: violated ? round2(0.05 + rand() * 0.15) : round2(0.7 + rand() * 0.3),
        suspicion: violated, is_root_cause: false,
      });
    }
    // Synthesis
    const synthBad = ['planning_error', 'context_loss', 'goal_drift', 'groundedness', 'output_format'].includes(failure);
    push({
      type: 'synthesis', tool: null,
      input_summary: 'Combining tool results and context into a draft answer.',
      output: failure === 'context_loss' ? 'Draft omits the "exclude EU" constraint carried from memory.'
        : failure === 'goal_drift' ? 'Draft answers a broader question than the user asked.'
          : failure === 'groundedness' ? 'Draft asserts a figure with no supporting tool result.'
            : failure === 'planning_error' ? 'Draft concludes before the verification step ran.'
              : failure === 'output_format' ? 'Draft content is fine but not in the requested JSON schema.'
                : 'Draft synthesized from ' + nToolSteps + ' tool results.',
      result: synthBad ? 'warn' : 'ok',
      score: synthBad ? round2(0.2 + rand() * 0.25) : round2(0.6 + rand() * 0.35),
      suspicion: synthBad, is_root_cause: false,
    });
    // Final response
    const finalBad = trace.outcome === 'fail';
    push({
      type: 'final_response', tool: null,
      input_summary: 'Returning the final answer to the user.',
      output: trace.surfaceSuccess ? 'Confident, well-formatted answer delivered (surface looks successful).'
        : finalBad ? 'Answer delivered, but it does not satisfy the goal.'
          : 'Answer delivered and satisfies the goal.',
      result: finalBad ? 'fail' : 'ok',
      score: finalBad ? round2(0.15 + rand() * 0.25) : round2(0.7 + rand() * 0.3),
      suspicion: finalBad && trace.surfaceSuccess,
      is_root_cause: false,
    });

    // Mark root cause step.
    let rootStep = null;
    if (failure) {
      const candidates = steps.filter((s) => s.suspicion);
      if (failure === 'planning_error') rootStep = steps.find((s) => s.type === 'planner') || steps.find((s) => s.type === 'synthesis');
      else if (failure === 'context_loss' || failure === 'goal_drift' || failure === 'groundedness' || failure === 'output_format') rootStep = steps.find((s) => s.type === 'synthesis');
      else if (failure === 'guardrail_violation') rootStep = steps.find((s) => s.type === 'guardrail');
      else rootStep = candidates[0];
      if (!rootStep) rootStep = candidates[0] || steps[steps.length - 2];
      if (rootStep) { rootStep.is_root_cause = true; rootStep.suspicion = true; }
    }
    return { steps, rootStepId: rootStep ? rootStep.id : null };
  }

  // ---- Trace generation ---------------------------------------------------
  // Baseline failure-rate profile per workflow, plus how v1.4 shifts things.
  const workflowFailBias = {
    support_triage: 0.34,
    research_assistant: 0.28,
    sales_brief: 0.22,
    sql_analytics: 0.41,
    onboarding_copilot: 0.46,
    bug_triage: 0.31,
    contract_review: 0.38,
    incident_response: 0.44,
  };
  // Failure-mode affinity by workflow (weights).
  const workflowFailModes = {
    support_triage: [['tool_misuse', 3], ['context_loss', 3], ['human_escalation', 2], ['dependency_failure', 2], ['guardrail_violation', 1], ['inefficient', 2]],
    research_assistant: [['groundedness', 4], ['goal_drift', 3], ['inefficient', 3], ['retry_loop', 1], ['planning_error', 2]],
    sales_brief: [['groundedness', 3], ['context_loss', 3], ['output_format', 2], ['inefficient', 2], ['goal_drift', 2]],
    sql_analytics: [['tool_misuse', 4], ['groundedness', 3], ['context_loss', 2], ['inefficient', 2], ['dependency_failure', 2]],
    onboarding_copilot: [['guardrail_violation', 3], ['human_escalation', 3], ['context_loss', 3], ['planning_error', 2], ['dependency_failure', 2]],
    bug_triage: [['planning_error', 3], ['tool_misuse', 3], ['retry_loop', 2], ['dependency_failure', 2], ['output_format', 2]],
    contract_review: [['groundedness', 4], ['goal_drift', 3], ['context_loss', 2], ['human_escalation', 2], ['guardrail_violation', 1]],
    incident_response: [['planning_error', 3], ['dependency_failure', 3], ['retry_loop', 3], ['context_loss', 2], ['guardrail_violation', 1]],
  };
  // Tool most associated with each failure per workflow.
  const failRootTool = {
    tool_misuse: { sql_analytics: 'sql_query', support_triage: 'crm_lookup', bug_triage: 'code_exec', default: 'web_search' },
    dependency_failure: { sql_analytics: 'sql_query', incident_response: 'sql_query', support_triage: 'crm_lookup', default: 'web_search' },
    retry_loop: { incident_response: 'browser_automation', bug_triage: 'code_exec', default: 'web_search' },
  };

  function dateForRelease(relId) {
    // Spread traces across the ~20 weeks; newer releases skew recent.
    const idx = releaseIndex[relId];
    const base = new Date('2026-03-02').getTime();
    const span = new Date('2026-07-18').getTime() - base;
    const start = base + (span * idx) / releases.length;
    const end = base + (span * (idx + 1.6)) / releases.length;
    const t = start + rand() * (end - start);
    return new Date(Math.min(t, new Date('2026-07-18').getTime()));
  }

  const traces = [];
  const N = 220;
  for (let i = 0; i < N; i++) {
    const workflow = pickWeighted(workflows.map((w) => [w.id, 1]));
    // Newer releases more likely for recent traces.
    const release = pickWeighted(releases.map((r, idx) => [r.id, idx + 1]));
    const relIdx = releaseIndex[release];

    let failRate = workflowFailBias[workflow];
    // v1.4 planner refactor: planning_error & context worse on some workflows, tool_misuse better.
    if (release === 'v1.4') failRate += 0.06;
    if (release === 'v1.3') failRate -= 0.03;

    const isFail = chance(failRate);
    const surfaceSuccess = isFail && chance(0.28); // surface-success-but-semantic-failure cases
    const outcome = isFail ? (surfaceSuccess ? 'fail' : (chance(0.85) ? 'fail' : 'partial')) : (chance(0.06) ? 'partial' : 'pass');

    let failure = null;
    if (outcome !== 'pass') {
      failure = pickWeighted(workflowFailModes[workflow]);
      // v1.4 bumps planning errors specifically.
      if (release === 'v1.4' && chance(0.35)) failure = 'planning_error';
    }

    const rootToolMap = failure && failRootTool[failure];
    const rootTool = rootToolMap ? (rootToolMap[workflow] || rootToolMap.default) : pick(workflowTools[workflow]);

    const long = failure === 'retry_loop' || chance(0.18);
    const goal = goalTemplates[workflow][randInt(0, goalTemplates[workflow].length - 1)].replace('{n}', String(randInt(48210, 49900)));
    const date = dateForRelease(release);

    const trace = {
      id: 'TR-' + String(20000 + i),
      workflow, release, environment: pickWeighted([['production', 6], ['staging', 2], ['canary', 1]]),
      segment: pickWeighted([['Enterprise', 4], ['Mid-market', 3], ['SMB', 2], ['Internal', 1]]),
      model: relIdx >= 4 ? 'gpt-orion-2' : pick(models.slice(0, 3)),
      goal, outcome, surfaceSuccess, long,
      timestamp: date.toISOString(),
    };

    const built = buildSteps(trace, failure, rootTool);
    trace.steps = built.steps;
    trace.rootStepId = built.rootStepId;
    trace.toolCount = built.steps.filter((s) => s.type === 'tool_call').length;
    trace.stepCount = built.steps.length;
    trace.duration = round2(built.steps.length * (0.6 + rand() * 1.4) + (long ? rand() * 8 : 0)); // seconds
    trace.cost = round2(0.004 * built.steps.length * (0.8 + rand() * 1.5) + (long ? rand() * 0.4 : 0)); // USD
    trace.tokens = Math.round(trace.cost * 1000 * (6 + rand() * 4));

    // Labels: model suggestion + optional human review.
    trace.labels = [];
    if (failure) {
      const cat = taxonomyById[failure];
      const subs = subtypesByParent[failure];
      const subId = subs ? pick(subs).id : null;
      const modelConf = round2(0.45 + rand() * 0.5);
      const modelLabel = {
        label_id: failure, subtype_id: subId,
        source: 'model_suggestion', confidence: modelConf,
        reviewer: null, timestamp: date.toISOString(),
        note: 'Auto-labeled by the classifier from step-level signals.',
        root_cause_step_id: trace.rootStepId,
        severity: cat.severity_default,
      };
      trace.labels.push(modelLabel);

      // ~55% reviewed.
      if (chance(0.55)) {
        const reviewer = pick(reviewers);
        const agree = chance(0.72);
        const finalFailure = agree ? failure : pickWeighted(workflowFailModes[workflow].filter((p) => p[0] !== failure));
        const reviewDate = new Date(date.getTime() + randInt(2, 72) * 3600 * 1000);
        trace.labels.push({
          label_id: finalFailure, subtype_id: agree ? subId : null,
          source: 'human_review', confidence: round2(0.7 + rand() * 0.3),
          reviewer: reviewer.id, timestamp: reviewDate.toISOString(),
          note: agree ? 'Confirmed the suggested label; root cause verified at the flagged step.'
            : 'Corrected: the surface signal pointed elsewhere, but the true root cause is ' + taxonomyById[finalFailure].name.toLowerCase() + '.',
          root_cause_step_id: trace.rootStepId,
          severity: taxonomyById[finalFailure].severity_default,
        });
        trace.reviewStatus = 'reviewed';
        trace.reviewer = reviewer.id;
        trace.humanAgreed = agree;
      } else {
        trace.reviewStatus = chance(0.4) ? 'in_review' : 'unreviewed';
      }
      // ~10% of model suggestions are false positives (outcome pass but a low-conf suggestion).
      trace.falsePositive = false;
      // Multi-label: sometimes add a co-occurring secondary label.
      if (chance(0.22)) {
        const secondary = pickWeighted(workflowFailModes[workflow].filter((p) => p[0] !== failure));
        trace.labels.push({
          label_id: secondary, subtype_id: null, source: 'model_suggestion',
          confidence: round2(0.3 + rand() * 0.3), reviewer: null, timestamp: date.toISOString(),
          note: 'Secondary co-occurring signal.', root_cause_step_id: trace.rootStepId,
          severity: taxonomyById[secondary].severity_default,
        });
      }
    } else {
      trace.reviewStatus = chance(0.15) ? 'reviewed' : 'unreviewed';
      trace.reviewer = trace.reviewStatus === 'reviewed' ? pick(reviewers).id : null;
      // Some passing traces carry a dismissed false-positive suggestion.
      if (chance(0.08)) {
        trace.falsePositive = true;
        trace.labels.push({
          label_id: pick(['inefficient', 'output_format']), subtype_id: null, source: 'model_suggestion',
          confidence: round2(0.3 + rand() * 0.2), reviewer: null, timestamp: date.toISOString(),
          note: 'Low-confidence suggestion — dismissed on review as a false positive.',
          root_cause_step_id: null, severity: 'minor', dismissed: true,
        });
      } else {
        trace.falsePositive = false;
      }
    }

    // Human feedback + eval scores.
    trace.humanFeedback = chance(0.4) ? pick(['thumbs_up', 'thumbs_down', 'thumbs_down', 'flagged']) : null;
    if (outcome === 'pass' && trace.humanFeedback === 'thumbs_down') trace.humanFeedback = 'thumbs_up';
    trace.eval = {
      correctness: round2(outcome === 'pass' ? 0.7 + rand() * 0.3 : 0.1 + rand() * 0.45),
      groundedness: round2(failure === 'groundedness' ? 0.1 + rand() * 0.3 : 0.55 + rand() * 0.45),
      efficiency: round2(trace.long ? 0.2 + rand() * 0.4 : 0.55 + rand() * 0.45),
    };

    // Effective (final) label = human if present else model suggestion.
    const humanLabel = trace.labels.find((l) => l.source === 'human_review');
    const suggested = trace.labels.find((l) => l.source === 'model_suggestion' && !l.dismissed);
    trace.primaryLabel = humanLabel ? humanLabel.label_id : (suggested ? suggested.label_id : null);
    trace.severity = trace.primaryLabel ? (humanLabel ? humanLabel.severity : suggested.severity) : null;
    trace.suggestedLabel = suggested ? suggested.label_id : null;
    trace.datasetIds = [];

    traces.push(trace);
  }

  // Sort newest first.
  traces.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // ---- Datasets (failures promoted into eval suites) ----------------------
  const datasets = [
    { id: 'ds_ground_ret', name: 'Groundedness regressions — research', failureMode: 'groundedness', tags: ['groundedness', 'research_assistant', 'p0'], inRegressionSuite: true, createdBy: 'r_amara', created: '2026-06-14',
      builds: [{ build: 'nightly-0711', pass: 41, fail: 9 }, { build: 'nightly-0714', pass: 44, fail: 6 }, { build: 'nightly-0717', pass: 46, fail: 4 }] },
    { id: 'ds_tool_sql', name: 'SQL tool-misuse cases', failureMode: 'tool_misuse', tags: ['tool_misuse', 'sql_analytics'], inRegressionSuite: true, createdBy: 'r_diego', created: '2026-06-22',
      builds: [{ build: 'nightly-0711', pass: 28, fail: 12 }, { build: 'nightly-0714', pass: 31, fail: 9 }, { build: 'nightly-0717', pass: 30, fail: 10 }] },
    { id: 'ds_guardrail_onb', name: 'Onboarding guardrail violations', failureMode: 'guardrail_violation', tags: ['guardrail_violation', 'onboarding_copilot', 'p0'], inRegressionSuite: true, createdBy: 'r_lin', created: '2026-07-02',
      builds: [{ build: 'nightly-0711', pass: 18, fail: 4 }, { build: 'nightly-0714', pass: 20, fail: 2 }, { build: 'nightly-0717', pass: 21, fail: 1 }] },
    { id: 'ds_context_multi', name: 'Context-loss on long traces', failureMode: 'context_loss', tags: ['context_loss', 'long_run'], inRegressionSuite: false, createdBy: 'r_priya', created: '2026-07-09', builds: [] },
    { id: 'ds_plan_v14', name: 'v1.4 planning regressions', failureMode: 'planning_error', tags: ['planning_error', 'v1.4', 'regression'], inRegressionSuite: true, createdBy: 'r_sam', created: '2026-07-12',
      builds: [{ build: 'nightly-0714', pass: 22, fail: 14 }, { build: 'nightly-0717', pass: 25, fail: 11 }] },
  ];
  // Attach a handful of traces to each dataset.
  datasets.forEach((ds) => {
    const matches = traces.filter((t) => t.primaryLabel === ds.failureMode && t.reviewStatus === 'reviewed').slice(0, randInt(8, 16));
    ds.traceIds = matches.map((t) => t.id);
    ds.size = ds.traceIds.length;
    matches.forEach((t) => t.datasetIds.push(ds.id));
  });

  // ---- Saved views --------------------------------------------------------
  const savedViews = [
    { id: 'sv1', name: 'Critical failures — last 7d', icon: 'alert', filters: { severity: 'critical' } },
    { id: 'sv2', name: 'v1.4 regressions', icon: 'trend', filters: { release: 'v1.4' } },
    { id: 'sv3', name: 'Enterprise escalations', icon: 'star', filters: { segment: 'Enterprise', failureMode: 'human_escalation' } },
    { id: 'sv4', name: 'Unreviewed backlog', icon: 'inbox', filters: { reviewStatus: 'unreviewed' } },
  ];

  // ---- Insights (synthesized, with backing computations done in app) ------
  const insights = [
    { id: 'in1', severity: 'critical', title: 'Planning errors rose after the v1.4 release', metric: '+18%', body: 'Planning-error rate increased following the v1.4 planner refactor, concentrated in Incident response and Bug triage. This is the single largest release-over-release regression.', mode: 'planning_error', release: 'v1.4', evidenceFilter: { release: 'v1.4', failureMode: 'planning_error' } },
    { id: 'in2', severity: 'serious', title: 'Tool misuse is concentrated in two tools', metric: 'sql_query · crm_lookup', body: 'The majority of tool-misuse labels trace back to sql_query and crm_lookup — invalid parameter mapping is the dominant subtype. Tightening these two schemas would address most of the category.', mode: 'tool_misuse', evidenceFilter: { failureMode: 'tool_misuse' } },
    { id: 'in3', severity: 'serious', title: 'Context loss scales with trace length', metric: '>12 steps', body: 'Most context-loss failures occur in traces with more than 12 steps, consistent with memory-window pressure. Long-running runs should compress and re-pin constraints.', mode: 'context_loss', evidenceFilter: { failureMode: 'context_loss' } },
    { id: 'in4', severity: 'warning', title: 'Onboarding has the highest escalation rate', metric: 'onboarding_copilot', body: 'The Customer onboarding copilot escalates to humans far more than any other workflow. Some escalations are correct; a review pass should separate warranted escalations from avoidable ones.', mode: 'human_escalation', evidenceFilter: { workflow: 'onboarding_copilot' } },
    { id: 'in5', severity: 'critical', title: 'A quarter of failures look successful on the surface', metric: 'surface success', body: 'A meaningful share of failing traces returned a confident, well-formatted answer — surface success masking a semantic failure. These are invisible to outcome-only monitoring and are the strongest case for step-level review.', mode: 'groundedness', evidenceFilter: { surfaceSuccess: true } },
    { id: 'in6', severity: 'warning', title: 'Reviewer–model agreement is 72%', metric: '72%', body: 'Human reviewers confirm the model-suggested label roughly seven times in ten. Disagreements cluster on Tool misuse vs Groundedness, where a bad tool result and a hallucination look alike at the surface.', mode: null, evidenceFilter: { reviewStatus: 'reviewed' } },
  ];

  // ---- Public API ---------------------------------------------------------
  window.AMI_DATA = {
    taxonomy, taxonomyById, topCategories, subtypesByParent,
    workflows, workflowById, tools, toolById, releases, releaseIndex,
    reviewers, reviewerById, environments, segments, models,
    severities, severityRank, stepTypes,
    traces, datasets, savedViews, insights,
    workflowFailBias,
  };
})();
