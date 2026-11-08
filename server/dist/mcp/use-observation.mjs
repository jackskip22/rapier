// SPDX-License-Identifier: AGPL-3.0-only

const values = (...items) => Object.freeze(items);
export const USE_ENUMS = Object.freeze({
  origin_route: values('mcp', 'door_mcp', 'muse'),
  deployment_version: values('unknown'),
  rpc_family: values('initialize', 'discover', 'tools_list', 'tool_call', 'resources_read', 'skills_read',
    'task_poll', 'task_update', 'task_cancel', 'other', 'invalid', 'unknown'),
  tool: values('open', 'read', 'edit', 'undo', 'show', 'export', 'convert', 'none', 'other'),
  client_family: values('codex', 'openai', 'claude', 'cursor', 'other', 'unknown'),
  feature: values('open_create', 'open_resume', 'open_import', 'read_text', 'read_outline', 'read_image',
    'read_state', 'read_history', 'read_guide', 'read_search', 'read_note', 'read_comparison', 'read_return',
    'edit_note_fields', 'edit_rename', 'edit_unspecified',
    'undo', 'show_pair', 'show_comparison', 'show_ask', 'show_other', 'export_file', 'export_save',
    'export_clipboard', 'export_sync', 'convert', 'none', 'unknown'),
  format: values('markdown', 'html_editor', 'page', 'txt', 'docx', 'pdf', 'plain', 'formatted', 'complete',
    'not_applicable', 'unknown'),
  outcome: values('succeeded', 'tool_error', 'protocol_error', 'auth_refused', 'budget_refused', 'cancelled',
    'task_accepted', 'unknown'),
  error_class: values('none', 'validation', 'conflict', 'unavailable', 'permission', 'limit', 'cancellation', 'other'),
  coverage: values('parsed_single', 'invalid_json', 'rejected_batch', 'body_limit', 'timeout', 'not_parsed', 'unknown'),
  status_class: values('1xx', '2xx', '3xx', '4xx', '5xx', 'unknown'),
  latency_bucket: values('lt50', '50_199', '200_999', '1000_4999', '5000_19999', 'ge20000', 'unknown'),
  attribution: values('unattributed'),
});
export const MAX_USE_OBSERVATION_BYTES = 2048;
const TOOL_NAMES = USE_ENUMS.tool.slice(0, 7);
const noop = () => {};

const member = (list, value, fallback) => {
  const at = typeof value === 'string' ? list.indexOf(value) : -1;
  return at < 0 ? fallback : list[at];
};
function rpcFamily(method) {
  switch (method) {
    case 'initialize': return 'initialize';
    case 'server/discover': return 'discover';
    case 'tools/list': return 'tools_list';
    case 'tools/call': return 'tool_call';
    case 'resources/read': return 'resources_read';
    case 'skills/get': return 'skills_read';
    case 'tasks/get': return 'task_poll';
    case 'tasks/update': return 'task_update';
    case 'tasks/cancel': return 'task_cancel';
    default: return typeof method === 'string' ? 'other' : 'invalid';
  }
}

export function clientFamily(name) {
  switch (name) {
    case 'codex': case 'Codex': case 'codex-mcp-client': return 'codex';
    case 'openai': case 'OpenAI': case 'chatgpt': case 'ChatGPT': return 'openai';
    case 'claude': case 'Claude': case 'claude-ai': case 'claude-code': case 'Claude Code': return 'claude';
    case 'cursor': case 'Cursor': case 'cursor-vscode': return 'cursor';
    default: return typeof name === 'string' && name.length ? 'other' : 'unknown';
  }
}

function latencyBucket(elapsed) {
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) return 'unknown';
  return elapsed < 50 ? 'lt50' : elapsed < 200 ? '50_199' : elapsed < 1000 ? '200_999'
    : elapsed < 5000 ? '1000_4999' : elapsed < 20000 ? '5000_19999' : 'ge20000';
}
function statusClass(status) {
  return Number.isInteger(status) && status >= 100 && status < 600
    ? USE_ENUMS.status_class[Math.floor(status / 100) - 1] : 'unknown';
}
const writeLog = line => console.log(line);

export function createUseObservation(originRoute, options = {}) {
  const route = member(USE_ENUMS.origin_route, originRoute, null);
  if (route === null) return null;
  let sink, now;
  try {
    sink = options.sink === undefined ? writeLog : options.sink;
    now = options.now === undefined ? Date.now : options.now;
  } catch { return null; }
  const clock = () => {
    try {
      const value = now();
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    } catch { return null; }
  };
  const started = clock();
  let finished = false, emitted = false, holds = 0;
  const row = {__proto__: null,
    schema: 2,
    origin_route: route,
    deployment_version: 'unknown',
    rpc_family: 'unknown',
    tool: 'none',
    client_family: 'unknown',
    feature: 'none',
    format: 'not_applicable',
    outcome: 'unknown',
    error_class: 'none',
    coverage: 'not_parsed',
    status_class: 'unknown',
    latency_bucket: 'unknown',
    attribution: 'unattributed',
    request_count: 1,
    tool_attempt: 0,
    dispatched: 0,
  };
  const emit = () => {
    if (!finished || emitted || holds) return;
    emitted = true;
    try {
      const ended = clock();
      row.latency_bucket = latencyBucket(started === null || ended === null ? null : ended - started);
      const line = JSON.stringify(row);
      if (line.length <= MAX_USE_OBSERVATION_BYTES) sink(line);
    } catch {  }
  };
  return Object.freeze({
    parsed(method) {
      if (emitted) return;
      row.coverage = 'parsed_single';
      row.rpc_family = rpcFamily(method);
    },
    attempted(name) {
      if (emitted) return;
      row.tool_attempt = 1;
      row.tool = member(TOOL_NAMES, name, 'other');
    },
    dispatched() { if (!emitted && row.tool_attempt) row.dispatched = 1; },
    coverage(value) { if (!emitted) row.coverage = member(USE_ENUMS.coverage, value, 'unknown'); },
    client(value) { if (!emitted) row.client_family = member(USE_ENUMS.client_family, value, 'unknown'); },
    feature(value, format = 'not_applicable') {
      if (emitted) return;
      row.feature = member(USE_ENUMS.feature, value, 'unknown');
      row.format = member(USE_ENUMS.format, format, 'unknown');
    },
    outcome(value, errorClass = 'none') {
      if (emitted) return;
      row.outcome = member(USE_ENUMS.outcome, value, 'unknown');
      row.error_class = member(USE_ENUMS.error_class, errorClass, 'other');
    },
    hold() {
      if (emitted) return noop;
      holds++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds--;
        emit();
      };
    },
    finish(status) {
      if (finished) return;
      finished = true;
      row.status_class = statusClass(status);
      emit();
    },
  });
}
