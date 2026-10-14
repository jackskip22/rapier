// SPDX-License-Identifier: AGPL-3.0-only
import {validateInput} from '../agent/validate-input.mjs';

export const OPENAI_DOOR = '/openai/mcp';
export const OPENAI_LISTING_BYTES = 20480;
const common = ['document', 'agent', 'operation_id'];
const passage = ['text', 'block', 'heading'];
const RO = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false};
const W = (destructive, open = false, idempotent = false) => ({readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: open});

const row = (name, parent, fixed, fields, required, title, description, annotations) =>
  Object.freeze({name, parent, fixed: Object.freeze(fixed), fields: Object.freeze([...fields, ...common]), required: Object.freeze(required), title, description, annotations: Object.freeze(annotations)});

export const PROJECTION = Object.freeze([
  row('open', 'open', {}, ['url', 'text', 'filename', 'note', 'title', 'file', 'createToken'], [], 'Open Rapier',
    'Create a Markdown document (text and filename), resume one (document), open a Note, import an authorized file, or open a Rapier document link (url). Returns revision and the whole text when it fits, otherwise a document map. Share editor_url; keep document private.', W(false, true)),
  row('read', 'read', {}, ['note', 'block', 'heading', 'lines', 'query', 'versions', 'version', 'cursor', 'limit', 'state', 'history', 'since', 'comparison', 'return_id', 'after_revision', 'wait_ms'], ['document'], 'Read Rapier',
    'Read exact text, matching lines (query), a block, heading or line range, history, versions, pending state or comparison. Continue next_cursor with cursor alone. after_revision with wait_ms waits for the person\'s next change.', RO),
  row('read_image', 'read', {as: 'image'}, ['note', 'block', 'heading', 'lines'], ['document'], 'Render Rapier page image',
    'Render the document, or one block, heading or line range, as a PNG image.', RO),
  row('read_outline', 'read', {as: 'outline'}, ['note'], ['document'], 'Read Rapier outline',
    'Read the document map: headings, blocks and their ids.', RO),
  row('read_guide', 'read', {}, ['guide'], ['document', 'guide'], 'Read Rapier instructions',
    'Read one instructions topic (overview, draw, water, blocks). Never document content.', RO),
  row('search_notes', 'read', {}, ['search', 'limit', 'cursor'], ['document', 'search'], 'Search Rapier Notes',
    'Search the person\'s Notes for matching text; returns matching notes.', RO),
  row('edit', 'edit', {}, ['revision', 'changes', 'note', 'turn_id', 'label'], ['document', 'revision', 'changes'], 'Edit Rapier text',
    'Apply unique exact-text changes atomically as one undoable act. Conflicts return the current revision and exact context; decide afresh.', W(true)),
  row('set_note_fields', 'edit', {}, ['revision', 'note', 'fields'], ['document', 'revision', 'fields'], 'Set Rapier Note fields',
    'Set a Note\'s tags, pinned, archived, trashed, colour or reminder. Trashing removes it from the Notes list.', W(true)),
  row('rename', 'edit', {}, ['revision', 'filename'], ['document', 'revision', 'filename'], 'Rename Rapier document',
    'Change the document\'s filename. Text is unchanged.', W(false, false, true)),
  row('undo', 'undo', {}, ['act', 'turn_id'], ['document'], 'Undo Rapier work',
    'Undo one act id or turn_id, preserving later work. Inspect conflicts before retrying.', W(true)),
  row('show_passage', 'show', {target: 'passage'}, passage, ['document'], 'Show a Rapier passage',
    'Scroll the open editor to exact text, a block or a heading. Later human navigation wins.', W(false)),
  row('point_at', 'show', {target: 'pointer'}, [...passage, 'act', 'words', 'lifetime'], ['document'], 'Point at Rapier text',
    'Show a labelled pointer at exact text, a block, a heading or an act in the open editor.', W(false)),
  row('read_aloud', 'show', {target: 'read_aloud'}, passage, ['document'], 'Read Rapier aloud',
    'Ask the open editor to read exact text, a block or a heading aloud.', W(false)),
  row('switch_view', 'show', {target: 'view'}, ['view'], ['document', 'view'], 'Switch Rapier view',
    'Switch the open editor between formatted, source and notes views.', W(false, false, true)),
  row('ask_user', 'show', {target: 'ask'}, ['question', 'wait', 'timeout_ms', 'after_return_id'], ['document'], 'Ask the person in Rapier',
    'Ask the person and wait for their typed reply (wait:message) or selection (wait:selection), up to timeout_ms.', W(false)),
  row('compare', 'show', {target: 'comparison'}, ['text', 'name', 'act', 'turn_id', 'compare_id', 'close'], ['document'], 'Compare in Rapier',
    'Present a side-by-side comparison of proposed text, or of an act or turn, without changing the source; close with compare_id.', W(false)),
  row('create_return', 'show', {target: 'return'}, [], ['document'], 'Create a Rapier return link',
    'Mint a return address the person can use to send a file back to this conversation.', W(false, true)),
  row('export_file', 'export', {to: 'file'}, ['format', ...passage, 'revision', 'compare_id'], ['document'], 'Export a Rapier file',
    'Deliver an independent file (markdown, html, page, txt, docx or pdf). The document is unchanged.', W(false, true)),
  row('save_document', 'export', {to: 'save'}, ['revision'], ['document'], 'Save Rapier document',
    'Save the document to its bound destination, replacing the stored file.', W(true, true)),
  row('copy_passage', 'export', {to: 'clipboard'}, ['format', ...passage], ['document'], 'Copy from Rapier',
    'Copy exact text, a block or a heading to the clipboard of the open editor.', W(false)),
  row('sync_notes', 'export', {to: 'sync'}, [], ['document'], 'Sync Rapier Notes',
    'Synchronize the configured Notes store now. Sync can replace files in that store.', W(true, true)),
]);

export const EXCLUDED = Object.freeze({show: Object.freeze({target: ['block', 'preferences', 'plugin', 'file', 'note', 'pair', 'playback']}),
  read: Object.freeze({as: ['text']}), export: Object.freeze({})});
export const EXCLUDED_FIELDS = Object.freeze({show: ['preference', 'value', 'revision', 'code', 'note'], read: [], edit: [], export: [], undo: [], open: []});

const BY_NAME = new Map(PROJECTION.map(tool => [tool.name, tool]));
export const FORMAT_ENUM = Object.freeze({
  export_file: Object.freeze(['markdown', 'html', 'page', 'txt', 'docx', 'pdf']),
  copy_passage: Object.freeze(['plain', 'formatted', 'complete']),
});

function projectSchema(parent, tool) {
  const source = parent.inputSchema, properties = {};
  for (const key of tool.fields) {
    if (!Object.hasOwn(source.properties, key)) throw new TypeError(`${tool.name}: parent ${parent.name} has no field ${key}`);
    if (Object.hasOwn(tool.fixed, key)) throw new TypeError(`${tool.name}: fixed selector ${key} cannot be a caller field`);
    properties[key] = source.properties[key];
  }
  if (Object.hasOwn(properties, 'format') && FORMAT_ENUM[tool.name])
    properties.format = {...properties.format, enum: [...FORMAT_ENUM[tool.name]]};
  if (tool.name === 'compare' && Object.hasOwn(properties, 'name'))
    properties.name = {...properties.name, description: 'Comparison title.'};
  for (const key of tool.required) if (!Object.hasOwn(properties, key)) throw new TypeError(`${tool.name}: required ${key} is not a field`);
  return {type: 'object', properties, ...(tool.required.length ? {required: [...tool.required]} : {}), additionalProperties: false};
}

export function projectedTools(parents) {
  const byName = new Map(parents.map(tool => [tool.name, tool]));
  const out = [];
  for (const tool of PROJECTION) {
    const parent = byName.get(tool.parent);
    if (!parent) continue;
    const {name: ignored, title: ignoredTitle, description: ignoredDescription, annotations: ignoredAnnotations, inputSchema: ignoredSchema, outputSchema: ignoredOutput, ...rest} = parent;
    out.push({...rest, name: tool.name, title: tool.title, description: tool.description, inputSchema: projectSchema(parent, tool),
      annotations: {...tool.annotations}});
  }
  return out;
}

export function projectCall(name, args, parents) {
  const tool = typeof name === 'string' && BY_NAME.get(name);
  if (!tool) return {unknown: true};
  const parent = parents.find(row => row.name === tool.parent);
  if (!parent) return {unknown: true};
  try { validateInput(projectSchema(parent, tool), args || {}, 'arguments', true); }
  catch (error) { if (error.code === 'invalid_arguments') return {error}; throw error; }
  return {name: tool.parent, arguments: {...args, ...tool.fixed}};
}
