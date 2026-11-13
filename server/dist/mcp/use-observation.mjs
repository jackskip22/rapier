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
  size_bucket: values('none', 'empty', 'lt10k', '10k_100k', '100k_1m', 'ge1m'),
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
    case 'openai': case 'OpenAI': case 'chatgpt': case 'ChatGPT': case 'openai-mcp': return 'openai';
    case 'claude': case 'Claude': case 'claude-ai': case 'claude-code': case 'Claude Code': return 'claude';
    case 'cursor': case 'Cursor': case 'cursor-vscode': return 'cursor';
    default: return typeof name === 'string' && name.length ? 'other' : 'unknown';
  }
}

export function agentFamily(agent) {
  if (typeof agent !== 'string' || !agent) return 'unknown';
  const ua = agent.slice(0, 64).toLowerCase();
  if (ua.startsWith('openai-mcp/') || ua.startsWith('chatgpt-user') || ua.startsWith('openai/')) return 'openai';
  if (ua.startsWith('claude') || ua.startsWith('anthropic')) return 'claude';
  if (ua.startsWith('cursor')) return 'cursor';
  if (ua.startsWith('codex')) return 'codex';
  return 'unknown';
}
export function sizeBucket(chars) {
  if (!Number.isSafeInteger(chars) || chars < 0) return 'none';
  return chars === 0 ? 'empty' : chars < 10000 ? 'lt10k' : chars < 100000 ? '10k_100k' : chars < 1000000 ? '100k_1m' : 'ge1m';
}
export const RPC_METHODS = values('initialize', 'ping', 'server/discover', 'tools/list', 'tools/call', 'resources/list',
  'resources/read', 'resources/templates/list', 'resources/subscribe', 'resources/unsubscribe', 'prompts/list',
  'prompts/get', 'skills/list', 'skills/get', 'tasks/get', 'tasks/update', 'tasks/cancel', 'tasks/list', 'tasks/result',
  'subscriptions/listen', 'logging/setLevel', 'completion/complete', 'roots/list', 'sampling/createMessage',
  'elicitation/create', 'notifications/initialized', 'notifications/cancelled', 'notifications/progress',
  'notifications/roots/list_changed', 'notifications/message', 'notifications/tasks/status',
  'notifications/resources/updated', 'notifications/resources/list_changed', 'notifications/tools/list_changed',
  'notifications/prompts/list_changed');
export function methodLabel(method) {
  if (typeof method !== 'string') return 'invalid';
  const at = RPC_METHODS.indexOf(method);
  return at < 0 ? 'other' : RPC_METHODS[at];
}
export function rpcCodeLabel(code) {
  return Number.isSafeInteger(code) && code >= -32768 && code <= -32000 ? String(code) : 'other';
}
export const DOOR_ERROR_CODES = values(
  'CANCELLATION_UNACKNOWLEDGED', 'CANONICAL_ACT_REBASE_CONFLICT', 'COMMIT_ID_REUSED', 'COMMIT_RECEIPT_EXPIRED',
  'CORRUPT_WORKSPACE', 'CREATE_BUDGET_EXCEEDED', 'DAILY_LIMIT', 'DOCUMENT_IDENTITY_CHANGED',
  'DOCUMENT_METADATA_CHANGED', 'DOCUMENT_UNAVAILABLE', 'DRAFT_BASE_UNAVAILABLE', 'DRAW_RESOURCES_UNAVAILABLE',
  'EDITOR_KEY_UNCONFIGURED', 'EMPTY_BODY', 'EXPORT_PAGE_TOO_LARGE', 'EXPORT_TOO_LARGE', 'EXPORT_UNAVAILABLE',
  'HOST_FILE_CHANGED', 'HOST_FILE_HYDRATION_CHANGED', 'HOST_FILE_UNAVAILABLE', 'HUMAN_AUTHORITY_REQUIRED',
  'HUMAN_CONTEXT_STALE', 'INVALID_ACCESS_OPERATION', 'INVALID_CANONICAL_ACTS', 'INVALID_COMMIT_ID',
  'INVALID_CREATE_TOKEN', 'INVALID_DOCUMENT', 'INVALID_DOCUMENT_EDITS', 'INVALID_DOCUMENT_INPUT',
  'INVALID_UI_CONFIGURATION', 'INVALID_UTF8', 'INVALID_VIEW_ACK', 'JSON_TOO_DEEP', 'OAUTH_AUTHORITY_REVOKED',
  'OPEN_ARGUMENTS_CONFLICT', 'OPERATION_ID_REUSED', 'PAIRING_ATTEMPTS_EXCEEDED', 'PAIRING_ATTEMPTS_UNAVAILABLE',
  'PAIRING_PAGE_ONLY', 'PAIRING_REQUIRED', 'PUBLISH_TRANSFER', 'READ_WAIT_SELECTOR_CONFLICT', 'REQUEST_ID_IN_USE',
  'REQUEST_TIMEOUT', 'REQUEST_TOO_LARGE', 'RESOURCE_NOT_FOUND', 'RETURN_TOO_LARGE', 'REVISION_CONFLICT',
  'SAVES_COALESCED', 'SKILLS_NOT_BUILT', 'STORAGE_UNAVAILABLE', 'TEXT_TOO_LARGE', 'TOOL_BUDGET_EXCEEDED',
  'TOOL_BUDGET_UNAVAILABLE', 'TOOL_INVOCATION_ADMISSION', 'UI_NOT_BUILT', 'UI_RESOURCE_TOO_LARGE', 'UNKNOWN_TOOL',
  'UNSUPPORTED_WORKSPACE_FORMAT', 'VIEW_UNAVAILABLE', 'VISUAL_METADATA_INVALID', 'VISUAL_UNAVAILABLE', 'WATER_BUDGET',
  'WATER_BUSY', 'WATER_CLOSED', 'WATER_DEVICE_LOST', 'WATER_GPU_FAILED', 'WATER_GPU_MEMORY', 'WATER_INPUT',
  'WATER_LIMIT', 'WATER_REPLAY_BUDGET', 'WATER_UNSUPPORTED', 'WORKSPACE_CREATION_UNAVAILABLE', 'WORKSPACE_ERROR',
  'WORKSPACE_EXISTS', 'WORKSPACE_STATE_LIMIT', 'WORKSPACE_UNACKNOWLEDGED', 'WORKSPACE_UNAVAILABLE', 'busy',
  'cancelled', 'checkpoint_invalid', 'checkpoint_too_large', 'custody_held', 'custody_refused', 'custody_shared',
  'custody_too_large', 'custody_unavailable', 'document_changed', 'document_deleted', 'document_disconnected',
  'draw_session_open', 'editor_not_present', 'editor_request_expired', 'editor_request_pending', 'editor_unavailable',
  'expired', 'export_expired', 'export_format_invalid', 'export_owner_changed', 'export_page_unavailable',
  'export_render_limit', 'export_render_unavailable', 'export_target_changed', 'export_too_large',
  'export_unavailable', 'figures_invalid', 'forged', 'future', 'human_edit_in_progress', 'human_view_changed',
  'invalid_arguments', 'invalid_request', 'invalid_scope', 'json_required', 'live_unavailable', 'malformed',
  'material_busy', 'material_request_expired', 'material_result_mismatch', 'material_too_large', 'message_too_large',
  'missing', 'oauth_authority_revoked', 'open', 'operation_id_reused', 'page_closed', 'page_queue_full',
  'paint_history_full', 'paint_kept_recipe_changed', 'paint_layer_full', 'paint_mode_mismatch',
  'paint_raster_decoder_unavailable', 'paint_raster_invalid', 'paint_replay_changed', 'paint_replay_unavailable',
  'paint_sample_invalid', 'paint_sample_unavailable', 'paint_sheet_invalid', 'paint_strokes_invalid',
  'paint_target_changed', 'paint_target_invalid', 'paint_target_locked', 'paint_too_large_for_server',
  'paint_unavailable', 'pairing_code_unknown', 'pairing_locked', 'pairing_not_ready', 'pointer_expired',
  'post_required', 'presentation_already_pending', 'presentation_expired', 'publication_changed',
  'publication_digest', 'publication_empty', 'publication_length', 'publication_timeout', 'publication_too_large',
  'publication_utf8', 'range_splits_character', 'recipe_invalid', 'result_over_budget', 'return_envelopes_full',
  'return_read_uses_start_and_limit', 'return_unavailable', 'route_unavailable', 'session_denied',
  'session_identity_conflict', 'sharing_stopped', 'target_over_edit_budget', 'unconfigured', 'view_unavailable',
  'visual_target_changed', 'wait_timed_out', 'wait_unavailable', 'water_pro_unavailable', 'water_video_budget',
  'water_video_invalid', 'water_video_options', 'water_video_source', 'water_video_unavailable',
  'water_webgpu_unavailable', 'websocket_required');
export function errorCodeLabel(code) {
  const at = typeof code === 'string' ? DOOR_ERROR_CODES.indexOf(code) : -1;
  return at < 0 ? 'other' : DOOR_ERROR_CODES[at];
}
export const PROTOCOL_REVISIONS = values('2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28');
export function protocolLabel(version) {
  if (typeof version !== 'string') return 'none';
  const at = PROTOCOL_REVISIONS.indexOf(version);
  return at < 0 ? 'other' : PROTOCOL_REVISIONS[at];
}
const CAPABILITIES = values('elicitation', 'experimental', 'extensions', 'roots', 'sampling', 'tasks');
export function capabilitiesLabel(capabilities) {
  try {
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return 'none';
    const have = CAPABILITIES.filter(name => Object.hasOwn(capabilities, name));
    return have.length ? have.join('+') : 'empty';
  } catch { return 'none'; }
}
export const ARG_TYPES = values('string', 'integer', 'number', 'boolean', 'object', 'array', 'null', 'missing');
const argType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isSafeInteger(value) ? 'integer'
  : typeof value === 'number' ? 'number' : ['string', 'boolean', 'object'].includes(typeof value) ? typeof value : null;
const KEY_PATTERN = /^[a-z][a-zA-Z_]{0,31}$/;
export const MAX_ARG_KEYS = 16;
export function argumentShape(args, properties = [], required = []) {
  const shape = {keys: [], missing: [], extra: 0, count: 0};
  try {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return shape;
    const known = Array.isArray(properties) ? properties.filter(key => typeof key === 'string' && KEY_PATTERN.test(key)) : [];
    const names = Object.keys(args);
    shape.count = names.length;
    for (const name of names) {
      const at = known.indexOf(name);
      if (at < 0) { shape.extra++; continue; }
      const type = argType(args[name]);
      if (type && shape.keys.length < MAX_ARG_KEYS) shape.keys.push([known[at], type]);
    }
    for (const key of Array.isArray(required) ? required : []) {
      const at = known.indexOf(key);
      if (at >= 0 && !Object.hasOwn(args, key) && shape.missing.length < MAX_ARG_KEYS) shape.missing.push(known[at]);
    }
  } catch {  }
  return shape;
}
export function countBucket(n) {
  return !Number.isSafeInteger(n) || n < 0 ? 'unknown' : n === 0 ? '0' : n === 1 ? '1' : n === 2 ? '2' : n <= 4 ? '3_4'
    : n <= 8 ? '5_8' : n <= 16 ? '9_16' : 'gt16';
}
export function bytesBucket(length) {
  const n = typeof length === 'string' && /^\d{1,12}$/.test(length) ? Number(length) : length;
  return !Number.isSafeInteger(n) || n < 0 ? 'unknown' : n < 1024 ? 'lt1k' : n < 10240 ? '1k_10k' : n < 102400 ? '10k_100k'
    : n < 1048576 ? '100k_1m' : 'ge1m';
}
const PRIOR_SIGNALS = Object.freeze({
  open: [['document', 'resume_handle'], ['url', 'resume_link'], ['file', 'host_file'], ['text', 'create_with_text']],
  read: [['return_id', 'after_show_ask'], ['after_revision', 'after_edit_wait'], ['cursor', 'after_read_page'],
    ['since', 'after_read'], ['version', 'after_read_history']],
  edit: [['turn_id', 'after_edit'], ['revision', 'after_open_or_read']],
  undo: [['turn_id', 'after_edit'], ['act', 'after_edit']],
  show: [['after_return_id', 'after_show_ask'], ['compare_id', 'after_show'], ['turn_id', 'after_edit'],
    ['revision', 'after_open_or_read']],
  export: [['compare_id', 'after_show'], ['revision', 'after_open_or_read']],
  convert: [],
});
export const PRIOR_LABELS = values('fresh', 'resume_handle', 'resume_link', 'host_file', 'create_with_text', 'after_show_ask',
  'after_edit_wait', 'after_read_page', 'after_read', 'after_read_history', 'after_edit', 'after_open_or_read', 'after_show',
  'none');
export function priorStep(tool, args) {
  try {
    const signals = Object.hasOwn(PRIOR_SIGNALS, tool) ? PRIOR_SIGNALS[tool] : null;
    if (!signals || !args || typeof args !== 'object') return 'none';
    for (const [key, label] of signals) if (Object.hasOwn(args, key) && args[key] !== undefined && args[key] !== null) return label;
    return 'fresh';
  } catch { return 'none'; }
}
const MIME_FAMILIES = Object.freeze({'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heic', 'image/gif': 'gif', 'image/avif': 'avif', 'image/jxl': 'jxl',
  'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/svg+xml': 'svg'});
export const PICTURE_FORMATS = values('png', 'jpeg', 'webp', 'heic', 'gif', 'avif', 'jxl', 'bmp', 'tiff', 'svg', 'mixed', 'other', 'none');
export function pictureFormat(files) {
  try {
    const list = Array.isArray(files) ? files : files ? [files] : [];
    const seen = new Set();
    for (const file of list.slice(0, 64)) {
      const mime = file && typeof file === 'object' && typeof file.mime_type === 'string' ? file.mime_type.toLowerCase() : null;
      seen.add(mime && Object.hasOwn(MIME_FAMILIES, mime) ? MIME_FAMILIES[mime] : mime ? 'other' : 'none');
      if (seen.size > 1) return 'mixed';
    }
    return seen.size ? [...seen][0] : 'none';
  } catch { return 'none'; }
}
export const HTTP_METHODS = values('GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PUT', 'PATCH', 'other');
export const ACCEPT_CLASSES = values('event_stream', 'json', 'json_and_stream', 'any', 'none', 'other');
export function httpMethodLabel(method) { return typeof method === 'string' && HTTP_METHODS.includes(method) ? method : 'other'; }
export function acceptClass(accept) {
  if (typeof accept !== 'string' || !accept.trim()) return 'none';
  const a = accept.slice(0, 256).toLowerCase(), stream = a.includes('text/event-stream'), json = a.includes('application/json');
  return stream && json ? 'json_and_stream' : stream ? 'event_stream' : json ? 'json' : a.includes('*/*') ? 'any' : 'other';
}
export const AGENT_KINDS = values('empty', 'browser', 'python', 'node', 'go', 'curl', 'java', 'rust', 'dotnet', 'bot', 'mcp_lib', 'other');
export function agentKind(agent) {
  if (typeof agent !== 'string' || !agent.trim()) return 'empty';
  const ua = agent.slice(0, 64).toLowerCase();
  if (/bot|crawl|spider|scan|probe/.test(ua)) return 'bot';
  if (ua.startsWith('mozilla/')) return 'browser';
  if (ua.startsWith('python') || ua.startsWith('aiohttp') || ua.startsWith('httpx')) return 'python';
  if (ua.startsWith('node') || ua.startsWith('undici') || ua.startsWith('axios') || ua.startsWith('got')) return 'node';
  if (ua.startsWith('go-http-client') || ua.startsWith('go ')) return 'go';
  if (ua.startsWith('curl') || ua.startsWith('wget')) return 'curl';
  if (ua.startsWith('java') || ua.startsWith('okhttp') || ua.startsWith('apache-httpclient')) return 'java';
  if (ua.startsWith('reqwest') || ua.startsWith('rust')) return 'rust';
  if (ua.startsWith('dotnet') || ua.startsWith('microsoft')) return 'dotnet';
  if (ua.includes('mcp')) return 'mcp_lib';
  return 'other';
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
  let finished = false, emitted = false, holds = 0, agent = 'unknown';
  const facts = {__proto__: null, method: 'none', rpc_code: 'none', error_code: 'none', protocol: 'none', capabilities: 'none',
    era: 'none', shape: null, prior: 'none', body: 'unknown', task: 'none', apps: 'unknown', agent_kind: 'none',
    pictures: 'none', picture_format: 'none', unpassed: 'none', quality: 'none', effort: 'none', http_method: 'none', accept: 'none'};
  const detail = () => {
    const shape = facts.shape;
    return Object.freeze({...facts, shape: shape ? Object.freeze({keys: shape.keys.map(pair => Object.freeze([...pair])),
      missing: [...shape.missing], extra: shape.extra, count: shape.count}) : null});
  };
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
    size_bucket: 'none',
    attribution: 'unattributed',
    request_count: 1,
    tool_attempt: 0,
    dispatched: 0,
  };
  const emit = () => {
    if (!finished || emitted || holds) return;
    emitted = true;
    try {
      if ((row.client_family === 'unknown' || row.client_family === 'other') && agent !== 'unknown') row.client_family = agent;
      const ended = clock();
      row.latency_bucket = latencyBucket(started === null || ended === null ? null : ended - started);
      const line = JSON.stringify(row);
      if (line.length <= MAX_USE_OBSERVATION_BYTES) sink(line, row, detail());
    } catch {  }
  };
  return Object.freeze({
    parsed(method) {
      if (emitted) return;
      row.coverage = 'parsed_single';
      row.rpc_family = rpcFamily(method);
      facts.method = arguments.length ? methodLabel(method) : 'none';
    },
    rpcError(code) { if (!emitted) facts.rpc_code = rpcCodeLabel(code); },
    errorCode(code) { if (!emitted) facts.error_code = errorCodeLabel(code); },
    protocol(version, era, capabilities) {
      if (emitted) return;
      facts.protocol = protocolLabel(version);
      facts.era = era === 'modern' ? 'modern' : era === 'legacy' ? 'legacy' : 'none';
      if (arguments.length > 2) facts.capabilities = capabilitiesLabel(capabilities);
    },
    args(args, properties, required) {
      if (emitted || facts.shape) return;
      facts.shape = argumentShape(args, properties, required);
      facts.prior = priorStep(row.tool, args);
    },
    body(length) { if (!emitted) facts.body = bytesBucket(length); },
    mode(task, apps, era) {
      if (emitted) return;
      facts.task = task ? 'task' : 'sync';
      facts.apps = apps === true ? 'apps' : apps === false ? 'no_apps' : 'unknown';
      if (era === 'modern' || era === 'legacy') facts.era = era;
    },
    agentKind(value) { if (!emitted) facts.agent_kind = member(AGENT_KINDS, value, 'other'); },
    http(method, accept) { if (!emitted) { facts.http_method = httpMethodLabel(method); facts.accept = acceptClass(accept); } },
    pictures(files, count, unpassed, quality, effort) {
      if (emitted) return;
      facts.pictures = countBucket(count);
      facts.picture_format = pictureFormat(files);
      facts.unpassed = Number.isSafeInteger(unpassed) && unpassed > 0 ? 'unpassed' : 'all_ids';
      facts.quality = member(['lossless', 'high', 'medium'], quality, quality === undefined ? 'none' : 'other');
      facts.effort = Number.isSafeInteger(effort) && effort >= 1 && effort <= 9 ? String(effort) : effort === undefined ? 'none' : 'other';
    },
    attempted(name) {
      if (emitted) return;
      row.tool_attempt = 1;
      row.tool = member(TOOL_NAMES, name, 'other');
    },
    dispatched() { if (!emitted && row.tool_attempt) row.dispatched = 1; },
    coverage(value) { if (!emitted) row.coverage = member(USE_ENUMS.coverage, value, 'unknown'); },
    client(value) { if (!emitted) row.client_family = member(USE_ENUMS.client_family, value, 'unknown'); },
    agent(value) { if (!emitted) agent = member(USE_ENUMS.client_family, value, 'unknown'); },
    size(chars) { if (!emitted) row.size_bucket = sizeBucket(chars); },
    family() {
      return (row.client_family === 'unknown' || row.client_family === 'other') && agent !== 'unknown' ? agent : row.client_family;
    },
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
