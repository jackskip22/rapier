// Device requests and their receipts carry no document-edit authority. SPDX-License-Identifier: AGPL-3.0-only.
import {PREFERENCE_DEFINITIONS} from '../shell/preferences.mjs';

export const EDITOR_LIMITS = Object.freeze({textChars: 4096, preferenceChars: 256, receipts: 32, contextBytes: 4096, cardMs: 300000,
  previewHead: 360, previewTail: 120});
// Public tools select one fixed device action. The editor queue is internal and accepts no export work.
export const EDITOR_TOOL_ACTIONS = Object.freeze({'editor.read_aloud': 'read_aloud', 'editor.copy': 'copy',
  'editor.open_file': 'open_file', 'editor.install_plugin': 'install_plugin'});
export const EDITOR_ACTIONS = Object.freeze(Object.values(EDITOR_TOOL_ACTIONS));
export const EDITOR_PLUGINS = Object.freeze(['math', 'mermaid', 'pdf', 'ocr', 'letters-field', 'letters-relief', 'letters-leaf', 'letters-arabesque']);
export const EDITOR_COPY_FORMATS = Object.freeze(['markdown', 'plain', 'formatted', 'complete']);
export const PREFERENCE_SCHEMAS = Object.freeze(Object.fromEntries(Object.entries(PREFERENCE_DEFINITIONS).filter(([name]) => name !== 'readOnly').map(([name, definition]) => [name,
  Object.freeze({...definition.values ? {type: typeof definition.fallback, enum: [...definition.values]}
    : typeof definition.fallback === 'boolean' ? {type: 'boolean'} : {type: 'string', maxLength: EDITOR_LIMITS.preferenceChars},
    ...(definition.pattern ? {pattern: definition.pattern} : {})})])));
// What an agent reads for the controls it may set, from the table the gate checks; the person's own controls are named after them.
const settable = Object.entries(PREFERENCE_DEFINITIONS).filter(([name, definition]) => name !== 'readOnly' && definition.agent !== false);
export const PREFERENCE_WORDS = settable.map(([name, definition]) => name + ' ' + (definition.values ? definition.values.join('|')
  : definition.pattern ? 'matching ' + definition.pattern : typeof definition.fallback === 'boolean' ? 'true|false' : 'text')).join('; ') + '. ' +
  Object.keys(PREFERENCE_SCHEMAS).filter(name => !settable.some(([other]) => other === name)).join(' and ') + ' stay the person\'s alone.';

const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const integer = value => Number.isSafeInteger(value) && value >= 0;
// What a card shows of the passage the person is asked to let the editor read or copy: all of it when it is short, otherwise its start,
// the count of characters between and its end, so the card keeps its buttons in reach while the person still sees both ends of what
// will be read or written. The action itself always takes the whole passage.
export function editorPreview(text) {
  const points = Array.from(String(text)), {previewHead: head, previewTail: tail} = EDITOR_LIMITS;
  if (points.length <= head + tail + 60) return {head: points.join(''), omitted: 0, tail: ''};
  return {head: points.slice(0, head).join(''), omitted: points.length - head - tail, tail: points.slice(-tail).join('')};
}
export const editorNeedsTap = request => request?.operation === 'document.device_action' && request.action === 'open_file';
export const editorFailure = reason => ({outcome: 'refused', reason, receipt: {status: 'unavailable', reason},
  ...(reason === 'editor_unavailable' ? {hint: 'Open this document in Rapier, then ask the editor again.'} : {})});

export function validPreference(name, value) {
  if (!own(PREFERENCE_SCHEMAS, name)) return false;
  const definition = PREFERENCE_DEFINITIONS[name];
  return !!definition && typeof value === typeof definition.fallback && (definition.values ? definition.values.includes(value)
    : typeof value !== 'string' || [...value].length <= EDITOR_LIMITS.preferenceChars) &&
    (!definition.pattern || new RegExp(definition.pattern).test(value));
}

export function editorPreferences(value) {
  if (!object(value) || !Object.keys(PREFERENCE_SCHEMAS).every(name => own(value, name) && validPreference(name, value[name]))) return null;
  return Object.fromEntries(Object.keys(PREFERENCE_SCHEMAS).map(name => [name, value[name]]));
}

export function editorRequest(state, operation, args = {}) {
  if (!object(state) || typeof state.documentId !== 'string' || !state.documentId || !integer(state.revision)) return editorFailure('document_changed');
  const request = {kind: 'editor', documentId: state.documentId, revision: state.revision, operation};
  if (operation === 'editor.set_preferences') {
    if (!validPreference(args.preference, args.value)) return editorFailure('preference_invalid');
    if (PREFERENCE_DEFINITIONS[args.preference].agent === false) return editorFailure('human_authority_required');
    Object.assign(request, {preference: args.preference, value: args.value});
  } else if (operation === 'document.device_action') {
    if (!EDITOR_ACTIONS.includes(args.action)) return editorFailure('editor_action_invalid');
    request.action = args.action;
    if (['read_aloud', 'copy'].includes(args.action)) {
      if (typeof args.text !== 'string' || !args.text.length || [...args.text].length > EDITOR_LIMITS.textChars) return editorFailure('editor_text_required');
      request.text = args.text;
      if (args.action === 'copy') {
        if (args.format !== undefined && !EDITOR_COPY_FORMATS.includes(args.format)) return editorFailure('editor_format_invalid');
        request.format = args.format || 'markdown';
      } else if (args.format !== undefined) return editorFailure('editor_arguments_invalid');
    } else if (args.text !== undefined || args.context_handle !== undefined || args.format !== undefined) return editorFailure('editor_arguments_invalid');
    if (args.action === 'install_plugin') {
      if (!EDITOR_PLUGINS.includes(args.plugin)) return editorFailure('editor_plugin_invalid');
      request.plugin = args.plugin;
    } else if (args.plugin !== undefined) return editorFailure('editor_arguments_invalid');
  } else return editorFailure('editor_action_invalid');
  return {outcome: 'ok', request};
}

// Return only the receipt: passages never enter the invocation journal through a fact.
export function editorResult(request, fact) {
  if (!object(request) || request.kind !== 'editor' || !object(fact) || fact.kind !== 'editor' ||
      fact.documentId !== request.documentId || fact.revision !== request.revision || fact.operation !== request.operation)
    return editorFailure('document_changed');
  const receipt = fact.receipt;
  if (!object(receipt) || !['applied', 'waiting', 'done', 'declined', 'unavailable'].includes(receipt.status) ||
      receipt.id !== undefined && request.id !== undefined && receipt.id !== request.id) return editorFailure('editor_receipt_invalid');
  if (receipt.preference !== undefined && receipt.preference !== request.preference || receipt.action !== undefined && receipt.action !== request.action)
    return editorFailure('editor_receipt_invalid');
  const observed = {...(request.id ? {id: request.id} : {}), status: receipt.status,
    ...(request.preference ? {preference: request.preference} : {action: request.action})};
  if (receipt.status === 'applied') {
    if (request.operation !== 'editor.set_preferences' || receipt.value !== request.value || !validPreference(request.preference, receipt.previous))
      return editorFailure('editor_receipt_invalid');
    Object.assign(observed, {value: request.value, previous: receipt.previous});
    if (receipt.superseded === true) {
      if (!validPreference(request.preference, receipt.current)) return editorFailure('editor_receipt_invalid');
      Object.assign(observed, {superseded: true, current: receipt.current});
    }
  } else if (receipt.status === 'waiting' || receipt.status === 'declined') {
    if (!editorNeedsTap(request)) return editorFailure('editor_receipt_invalid');
  } else if (receipt.status === 'done') {
    if (request.operation !== 'document.device_action' || !EDITOR_ACTIONS.includes(request.action)) return editorFailure('editor_receipt_invalid');
  }
  if (fact.file !== undefined || receipt.issues !== undefined) return editorFailure('editor_receipt_invalid');
  if (receipt.reason !== undefined) {
    if (typeof receipt.reason !== 'string' || !/^[a-z][a-z0-9_]{0,95}$/.test(receipt.reason)) return editorFailure('editor_receipt_invalid');
    observed.reason = receipt.reason;
  }
  if (receipt.status === 'unavailable') {
    const reason = observed.reason || 'editor_unavailable';
    return {...editorFailure(reason), receipt: {...observed, reason}};
  }
  return {outcome: 'ok', receipt: observed};
}

// A complete editor observation is bounded device data, never a source or authority snapshot.
export function editorContext(value) {
  const preferences = editorPreferences(value?.preferences);
  const receipts = Array.isArray(value?.receipts) ? value.receipts.slice(-EDITOR_LIMITS.receipts).flatMap(row => {
    if (!object(row) || typeof row.id !== 'string' || row.id.length > 128 || !['applied', 'waiting', 'done', 'declined', 'unavailable'].includes(row.status)) return [];
    if (row.preference ? !own(PREFERENCE_DEFINITIONS, row.preference) : !EDITOR_ACTIONS.includes(row.action)) return [];
    const result = {id: row.id, status: row.status, ...(row.preference ? {preference: row.preference} : {action: row.action})};
    if (row.status === 'applied') {
      if (!validPreference(row.preference, row.value) || !validPreference(row.preference, row.previous)) return [];
      Object.assign(result, {value: row.value, previous: row.previous});
      if (row.superseded === true && validPreference(row.preference, row.current)) Object.assign(result, {superseded: true, current: row.current});
    }
    if (row.issues !== undefined) return [];
    if (typeof row.reason === 'string' && /^[a-z][a-z0-9_]{0,95}$/.test(row.reason)) result.reason = row.reason;
    return [result];
  }) : [];
  // The observation shares one result with the rest of the context: the oldest receipts go first, never the preferences.
  const size = () => encoder.encode(JSON.stringify({preferences, receipts})).byteLength;
  while (receipts.length && size() > EDITOR_LIMITS.contextBytes) receipts.shift();
  return {preferences, receipts};
}
