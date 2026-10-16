import {validateInput, agentInputSchema} from './validate-input.mjs';
import {EDITOR_PLUGINS} from './editor.mjs';
import {TOOLS as KERNEL_OPERATIONS, HOST_TOOLS as OPERATIONS, SET_VIEW_SCHEMA, SET_PREFERENCES_SCHEMA, READ_ALOUD_SCHEMA, COPY_SCHEMA, OPEN_FILE_SCHEMA, INSTALL_PLUGIN_SCHEMA, MARK, ICONS, MAX_TEXT_BYTES, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS, noteFields} from './operation-contracts.mjs';
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
const editRevision = {...revision, description: 'From your latest read or open; a Note\'s is its sha256.'};
const noteRef = {...string(160), minLength: 1};
const heading = {oneOf: [string(1024), {type: 'array', items: string(256), maxItems: 32}]};
const scope = {block: string(128), heading};
const identity = {agent: string(64), operation_id: {...string(128), minLength:1}};
const turn = {turn_id: string(160, 'Groups acts for undo {turn_id}.'), label: string(120)};
const change = {oneOf: [object({old: text, new: text, ...scope}, ['old', 'new']), object({after: text, insert: text, ...scope}, ['after', 'insert']), object({text}, ['text'])]};
const tool = (name, title, description, effect, properties, required = [], constraints = {}) => {
  const inputSchema = agentInputSchema({...object({...properties, ...identity}, required), ...constraints});
  if (properties.note) inputSchema.properties.note = {...properties.note};
  return Object.freeze({name, title, description, effect,
    class: effect === 'read' ? 'read' : ['show', 'export'].includes(name) ? 'sensitive-write' : effect === 'view' ? 'presentation' : 'write', inputSchema});
};

const readSelection = {
  note: noteRef, ...scope, lines: {type: 'array', items: integer(1), minItems: 2, maxItems: 2, description: '[first, last], 1-based, inclusive.'},
  query: string(2048, 'Literal text to find in this document.'), search: string(2048, 'Search the Notes store; "" lists all.'),
  as: {...string(32), enum: ['text', 'image', 'outline']}, versions: flag, version: integer(1), cursor: string(256), limit: integer(1, 32768),
  state: flag, history: flag, since: string(256), comparison: flag, return_id: string(128),
  after_revision: {...integer(0), description: 'With wait_ms: return when the revision passes this.'}, wait_ms: {...integer(0, 20000), description: 'Bounded wait (ms) for the next human revision.'},
};

export const TOOLS = Object.freeze([
  tool('open', 'Open Rapier', 'Create {text, filename}, resume {document}, open a Note {document, note}, create one {document, note:"new", text, title} (title only there), or import a host file {file}. Returns revision and whole text when it fits a page; otherwise a document map. A browser code goes to show {target:"pair", code}. Share editor_url when available; keep document private.', 'create', {
    document: string(256), url: string(2048), text, filename: string(MAX_FILENAME_CHARS), note: noteRef, title: string(256),
    file: object({name: string(256), resourceUri: string(8192)}, ['name', 'resourceUri']), createToken: string(128),
  }),
  tool('read', 'Read Rapier', 'Read exact text, a heading/fence map (as:"outline") or a PNG (as:"image") of the page or of the named block, heading or lines. query finds lines here; search lists Notes. Continue next_cursor with cursor alone. Check human context and omissions before editing. state:true reports pending work and the person’s presence; after_revision with wait_ms waits for their next change. guide returns instructions; guide resource URIs are not document IDs.', 'read', {
    ...readSelection, guide: {...string(32, 'Instructions only; use no other read selectors and no document.'), enum: GUIDE_TOPICS},
  }, [], {allOf: [{if: present('guide'), then: {not: {anyOf: Object.keys(readSelection).map(present)}}}]}),
  tool('edit', 'Edit Rapier', 'Apply unique exact-text changes atomically as one undoable act (act is its id string), rename with filename, or set Note fields with note. At a moved numeric revision, literal edits apply if untouched since; whole-document replacement needs the current revision. A conflict returns current context; decide afresh. Drawings, painting, Water, comments and HTML objects use fenced text; painting needs an open editor and an operation_id.', 'write', {
    revision: editRevision, changes: {type: 'array', items: change, minItems: 1, maxItems: 32}, note: noteRef, ...turn,
    fields: {...object({...noteFields, reminder: {type: ['object', 'null'], description: 'App only; {at} in ms.'}}), description: 'Note fields, with note and without changes.'},
    filename: string(MAX_FILENAME_CHARS),
  }, ['revision']),
  tool('undo', 'Undo Rapier work', 'Undo one act or one turn (act or turn_id, not both), preserving later work.', 'write', {
    act: string(256, 'From edit; pass act or turn_id.'), turn_id: string(160, 'Undo a whole turn; pass act or turn_id.')}),
  tool('show', 'Show or ask in Rapier', 'Present work or ask the person. An omitted target is inferred from its fields. A 4-letter browser code pairs that editor (target:"pair"); a connected workspace\'s owner first approves at owner_approval_url, then the person chooses ALLOW. Inspect actual presentation; a request is not proof the person saw it. A comparison leaves source unchanged. Later human navigation wins.', 'view', {
    target: {...string(48), enum: ['passage', 'block', 'pointer', 'read_aloud', 'playback', 'comparison', 'view', 'preferences', 'plugin', 'file', 'return', 'note', 'ask', 'pair']}, text: string(MAX_TEXT_BYTES, 'Exact passage, or for comparison the whole alternative document.'), ...scope, revision, act: string(256), turn_id: string(160), name: string(256, 'Comparison title or target:plugin name: ' + EDITOR_PLUGINS.join('|') + '.'), words: string(160, 'Pointer label.'),
    view: {...string(32), enum: ['formatted', 'source', 'notes']}, question: string(4096), wait: {...string(32, 'ask: message (default) or selection.'), enum: ['selection', 'message']}, timeout_ms: {...integer(1000, 120000), default:20000},
    preference: SET_PREFERENCES_SCHEMA.properties.preference, value: {type: ['string', 'boolean'], description: 'preferences: the setting; playback: false pauses, true plays.'}, note: noteRef, code: string(4, 'Browser pairing code (target:"pair").'),
    close: flag, compare_id: string(128), lifetime: integer(1, 30), after_return_id: string(128),
  }, [], {allOf: [{if: {required: ['target'], properties: {target: {type: 'string', const: 'playback'}}}, then: {required: ['revision', 'value'], properties: {value: {type: 'boolean'}}}}]}),
  tool('export', 'Save or export Rapier', 'to:"file" (default) delivers markdown, html (the offline editor), page, txt, docx or pdf; to:"save" saves to the bound destination; to:"clipboard" copies a passage as plain, markdown, formatted or complete. to:"sync" alone syncs the Notes store and can replace files. page, docx and pdf need an editor or renderer. Inspect delivery; export never publishes a website.', 'durable', {
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
  const properties = {document: string(256, entry.name === 'read' ? 'From open; not needed with guide.' : undefined), ...entry.inputSchema.properties};
  return {...entry.inputSchema, properties, required: [...(entry.name === 'read' ? [] : ['document']), ...(entry.inputSchema.required || [])]};
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
