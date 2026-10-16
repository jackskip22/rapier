import {validateInput, agentInputSchema} from './validate-input.mjs';
import {EDITOR_PLUGINS} from './editor.mjs';
import {TOOLS as KERNEL_OPERATIONS, HOST_TOOLS as OPERATIONS, SET_VIEW_SCHEMA, SET_PREFERENCES_SCHEMA, READ_ALOUD_SCHEMA, COPY_SCHEMA, OPEN_FILE_SCHEMA, INSTALL_PLUGIN_SCHEMA, MARK, ICONS, MAX_TEXT_BYTES, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS} from './operation-contracts.mjs';
export {ICONS, MAX_TEXT_BYTES, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS, validateInput};
export {SET_VIEW_SCHEMA, SET_PREFERENCES_SCHEMA, READ_ALOUD_SCHEMA, COPY_SCHEMA, OPEN_FILE_SCHEMA, INSTALL_PLUGIN_SCHEMA, MARK};

export const UI_RESOURCE = 'ui://rapier/editor';
export const GUIDE_TOPICS = Object.freeze(['overview', 'draw', 'water', 'blocks']);
const string = (maxLength = 256, description) => ({type: 'string', maxLength, ...(description ? {description} : {})});
const integer = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({type: 'integer', minimum, ...(maximum === Number.MAX_SAFE_INTEGER ? {} : {maximum})});
const object = (properties = {}, required = []) => ({type: 'object', properties, ...(required.length ? {required} : {}), additionalProperties: false});
const present = key => ({required: [key]});
const text = string(MAX_TEXT_BYTES), flag = {type: 'boolean'};
const revision = {type: ['integer', 'string']};
const noteRef = {...string(160), minLength: 1};
const heading = {oneOf: [string(1024), {type: 'array', items: string(256), maxItems: 32}]};
const scope = {block: string(128), heading};
const identity = {agent: string(64), operation_id: {...string(128), minLength:1}};
const turn = {turn_id: string(160), label: string(120)};
const change = {oneOf: [object({old: text, new: text, ...scope}, ['old', 'new']), object({after: text, insert: text, ...scope}, ['after', 'insert']), object({text}, ['text'])]};
const tool = (name, title, description, effect, properties, required = [], constraints = {}) => {
  const inputSchema = agentInputSchema({...object({...properties, ...identity}, required), ...constraints});
  if (properties.note) inputSchema.properties.note = {...properties.note};
  return Object.freeze({name, title, description, effect,
    class: effect === 'read' ? 'read' : ['show', 'export'].includes(name) ? 'sensitive-write' : effect === 'view' ? 'presentation' : 'write', inputSchema});
};

const readSelection = {
  note: noteRef, ...scope, lines: {type: 'array', items: integer(1), minItems: 2, maxItems: 2}, query: string(2048), search: string(2048),
  as: {...string(32), enum: ['text', 'image', 'outline']}, versions: flag, version: integer(1), cursor: string(256), limit: integer(1, 32768),
  state: flag, history: flag, since: string(256), comparison: flag, return_id: string(128),
  after_revision: {...integer(0), description: 'With wait_ms: return when the revision passes this.'}, wait_ms: {...integer(0, 20000), description: 'Bounded wait (ms) for the next human revision.'},
};

export const TOOLS = Object.freeze([
  tool('open', 'Open Rapier', 'Create Markdown with text and filename, resume with document, open a Note (title only with note:"new"), or import an authorized host file. Returns revision and whole text when it fits a page; otherwise a document map. A browser code from the person goes to show {target:"pair", code}. Share editor_url when available; keep document private. Workspaces expire after 30 idle days.', 'create', {
    document: string(256), url: string(2048), text, filename: string(MAX_FILENAME_CHARS), note: noteRef, title: string(256),
    file: object({name: string(256), resourceUri: string(8192)}, ['name', 'resourceUri']), createToken: string(128),
  }),
  tool('read', 'Read Rapier', 'Read exact text or a document map; query returns matching lines. Continue next_cursor with cursor alone. Check human context and omissions before editing. Use image for PNG, state for pending work and the person’s presence, after_revision with wait_ms to wait for their next change, or search for Notes. Use guide for instructions; guide resource URIs are not document IDs.', 'read', {
    ...readSelection, guide: {...string(32, 'Instructions only; use no other read selectors. MCP still requires the current document from open.'), enum: GUIDE_TOPICS},
  }, [], {allOf: [{if: present('guide'), then: {not: {anyOf: Object.keys(readSelection).map(present)}}}]}),
  tool('edit', 'Edit Rapier', 'Apply unique exact-text changes atomically as one undoable act; act is its id string. At a moved numeric revision, edits can apply if literals remain untouched and history reaches that revision. Whole-document replacement needs the current revision. Conflicts return current revision and exact context or candidate lines; decide afresh. Drawings, painting, Water, comments and HTML objects use fenced text. Painting needs an open editor; check pending work with read.', 'write', {
    revision, changes: {type: 'array', items: change, minItems: 1, maxItems: 32}, note: noteRef, ...turn,
    fields: {type: 'object', description: 'Note controls: tags, pinned, archived, trashed, colour, reminder. See rapier://guide.', additionalProperties: true},
    filename: string(MAX_FILENAME_CHARS),
  }, ['revision']),
  tool('undo', 'Undo Rapier work', 'Undo one act id string or turn_id (act or turn_id, not both), preserving later work. Inspect conflicts before retrying.', 'write', {act: string(256), turn_id: string(160)}),
  tool('show', 'Show or ask in Rapier', 'Present work or ask for a reply, selection or device action. A 4-letter code from the person\'s browser pairs that editor: show {target:"pair", code}; for a connected workspace its owner first approves at owner_approval_url, then the person chooses ALLOW. Inspect actual presentation; a request is not proof the person saw it. Playback: value false pauses, true plays, here only. A comparison leaves source unchanged. Later human navigation wins.', 'view', {
    target: {...string(48), enum: ['passage', 'block', 'pointer', 'read_aloud', 'playback', 'comparison', 'view', 'preferences', 'plugin', 'file', 'return', 'note', 'ask', 'pair']}, text, ...scope, revision, act: string(256), turn_id: string(160), name: string(256, 'Comparison title or target:plugin name: ' + EDITOR_PLUGINS.join('|') + '.'), words: string(160),
    view: {...string(32), enum: ['formatted', 'source', 'notes']}, question: string(4096), wait: {...string(32), enum: ['selection', 'message']}, timeout_ms: {...integer(1000, 120000), default:20000},
    preference: SET_PREFERENCES_SCHEMA.properties.preference, value: {type: ['string', 'boolean']}, note: noteRef, code: string(4, 'Browser pairing code; only with target:"pair".'),
    close: flag, compare_id: string(128), lifetime: integer(1, 30), after_return_id: string(128),
  }, [], {allOf: [{if: {required: ['target'], properties: {target: {type: 'string', const: 'playback'}}}, then: {required: ['revision', 'value'], properties: {value: {type: 'boolean'}}}}]}),
  tool('export', 'Save or export Rapier', 'Deliver an independent file, save to the bound destination or copy a passage. Use to:sync alone to synchronize the configured Notes store; sync can replace files. Page/Word/PDF need an editor or server renderer. Inspect delivery and verification; export does not publish a website.', 'durable', {
    format: {...string(32), enum: ['markdown', 'html', 'page', 'txt', 'docx', 'pdf', 'plain', 'formatted', 'complete']}, to: {...string(32), enum: ['file', 'save', 'clipboard', 'sync']}, text, ...scope, revision, compare_id: string(128),
  }, [], {allOf: [{if: {required: ['to'], properties: {to: {type: 'string', const: 'sync'}}},
    then: {not: {anyOf: ['format', 'text', 'block', 'heading', 'revision', 'compare_id'].map(present)}}}]}),
]);

export const EDITOR_TOOLS = Object.freeze(OPERATIONS
  .map(entry => ({...entry, visibility: ['app']})));
export const HUMAN_OPERATIONS = KERNEL_OPERATIONS.filter(entry => ['comments.write', 'comments.read', 'document.read', 'comparison.present'].includes(entry.name));
export const getOwnedOperation = name => KERNEL_OPERATIONS.find(entry => entry.name === name);
export const getHumanOperation = name => HUMAN_OPERATIONS.find(entry => entry.name === name);
export const HOST_TOOLS = EDITOR_TOOLS;
export const PAGE_TOOLS = Object.freeze(TOOLS.map(entry => entry.name !== 'open' ? entry : Object.freeze({...entry,
  description: 'Read the current page or open/create a Note. To choose a device file, use show with target:file.',
  inputSchema: {...entry.inputSchema,
    properties: Object.fromEntries(Object.entries(entry.inputSchema.properties).filter(([key]) =>
      !['document', 'url', 'file', 'filename', 'createToken'].includes(key))),
    allOf: [
      {if: {anyOf: ['text', 'title'].map(present)}, then: {required: ['note'], properties: {note: {const: 'new'}}}},
      {if: {required: ['note'], properties: {note: {const: 'new'}}}, then: present('text')},
    ],
  },
})));
export const publishedSchema = ({allOf, ...schema}) => schema;
export const getTool = name => TOOLS.find(entry => entry.name === name) || EDITOR_TOOLS.find(entry => entry.name === name);
export function inputGuide(name, {mcp = false} = {}) {
  const entry = (mcp ? TOOLS : PAGE_TOOLS).find(tool => tool.name === name);
  return entry ? structuredClone(mcp ? hostedSchema(entry) : entry.inputSchema) : null;
}
function hostedSchema(entry) {
  if (entry.name === 'open') return entry.inputSchema;
  return {...entry.inputSchema, properties: {document: string(256), ...entry.inputSchema.properties}, required: ['document', ...(entry.inputSchema.required || [])]};
}
export function annotations(effect, host = 'mcp', name = '') {
  if (host === 'webmcp') return {readOnlyHint: effect === 'read', untrustedContentHint: true, consequentialHint: effect !== 'read'};
  return {readOnlyHint: effect === 'read', destructiveHint: effect === 'write' || effect === 'durable' || name === 'show',
    idempotentHint: effect === 'read', openWorldHint: OPEN_WORLD.has(name)};
}
export const OPEN_WORLD = new Set(['open', 'show', 'export']);
export function mcpDescriptors({uiResource, auth = 'anonymous', editor = false} = {}) {
  if (!['anonymous', 'oauth', 'server-bearer'].includes(auth)) throw new TypeError('Unknown MCP authentication profile');
  return (editor ? EDITOR_TOOLS : TOOLS).map(entry => {
    const {effect, class: toolClass, visibility, ...descriptor} = entry;
    const security = auth === 'server-bearer' ? {} : {securitySchemes: auth === 'anonymous' ? [{type: 'noauth'}]
      : [{type: 'oauth2', scopes: effect === 'read' ? ['rapier:read'] : ['rapier:read', 'rapier:write']}]};
    return {...descriptor, inputSchema: editor ? entry.inputSchema : hostedSchema(entry),
      annotations: {title: entry.title, ...annotations(effect, 'mcp', entry.name)}, ...security,
      _meta: {...security, 'website.rapier/tool-class': toolClass, ...(editor ? {'openai/widgetAccessible': true} : {}), ui: {visibility: editor ? ['app'] : ['model', 'app'],
        ...(entry.name === 'open' && uiResource ? {resourceUri: uiResource} : {})},
        ...(entry.name === 'open' && uiResource ? {'openai/toolInvocation/invoking': 'Opening Rapier', 'openai/toolInvocation/invoked': 'Rapier is ready'} : {})}};
  });
}
