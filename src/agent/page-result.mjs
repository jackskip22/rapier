// SPDX-License-Identifier: AGPL-3.0-only
export const TOOL_RESULT_BYTES = 12 * 1024;
export const PAGE_RESULT_BYTES = 15 * 1024;
const encoder = new TextEncoder();
export const resultBytes = value => encoder.encode(JSON.stringify(value)).byteLength;

export function inputErrorResult({message, path, omitted}) {
  const feedback = {outcome: 'refused', isError: true, code: 'invalid_arguments', message, path,
    ...(omitted ? {omitted} : {})};
  return {isError: true, content: [{type: 'text', text: JSON.stringify(feedback)}]};
}

export function boundedResult(value, {limit = PAGE_RESULT_BYTES, readOnly = false} = {}) {
  if (resultBytes(value) < limit) return value;
  const outcome = typeof value.outcome === 'string' && resultBytes(value.outcome) < 128
    ? value.outcome : readOnly ? 'refused' : 'uncertain';
  const output = {outcome: readOnly && outcome === 'ok' ? 'refused' : outcome,
    complete: false, omissions: [{domain: 'receipt', reason: 'result_over_budget'}]};
  if (readOnly && value.outcome === 'ok') output.reason = 'result_over_budget';
  const put = (key, item) => {
    if (item === undefined) return;
    output[key] = item;
    if (resultBytes(output) >= limit) delete output[key];
  };
  const fields = ['revision', 'document', 'editor_url', 'documentId', 'documentRevision', 'representation', 'reason', 'act',
    'threadId', 'messageId', 'file', 'applied', 'saved', 'verified', 'replayed', 'editCount', 'decided', 'closed',
    'filename', 'docKind', 'turn_id', 'removed', 'replaced', 'availability', 'status', 'pointerId'];
  for (const key of fields) if (!(key === 'reason' && output.reason)) put(key, value[key]);
  for (const [key, names] of Object.entries({
    receipt: ['id', 'status', 'state', 'kind', 'action', 'preference', 'presentation', 'landed', 'reason', 'value', 'previous'],
    pending: ['kind', 'requestId', 'requirements'],
  })) {
    if (!value[key] || typeof value[key] !== 'object') continue;
    const record = {};
    for (const name of names) {
      if (value[key][name] === undefined) continue;
      record[name] = value[key][name];
      if (resultBytes({...output, [key]: record}) >= limit) delete record[name];
    }
    put(key, record);
  }
  if (value.outcome === 'pending' && value.pending?.kind === 'surface-fact' &&
      (!output.pending?.requirements || output.pending.requestId !== value.pending.requestId)) {
    output.outcome = 'refused'; output.reason = 'result_over_budget';
    delete output.pending; delete output.receipt;
    return output;
  }
  if (!readOnly) {
    const excluded = new Set(['complete', 'omissions', 'text', 'handle', 'complete_handle', 'recipe_handle',
      'svg_handle', 'comment_handle', 'coverage', 'content', ...Object.keys(output)]);
    for (const [key, item] of Object.entries(value)) if (!excluded.has(key)) put(key, item);
  }
  return output;
}

const omittedKeys = new Set(['documentId', 'documentRevision', 'version', 'docKind', 'sourceChanged', 'sourceRevision', 'editCount', 'observation_cursor', 'document_id', 'sourceDocumentId', 'exportId']);
const openKeys = new Set(['document', 'filename', 'expiresAt', 'chars']);
const keptKeys = {export: result => ['ok', 'exported'].includes(result.outcome) ? ['filename'] : []};
const editorKeys = new Set(['created', 'resumed', 'currentVersion']);
const idleFacts = {
  human: value => value.status === 'unobserved',
  surface: value => value.kind === 'headless',
  'continuation.person': value => !value.intents?.length && value.intentsComplete === true && !value.omittedIntents,
};
export function modelReply(name, result) {
  const clean = (value, path = '') => {
    if (value == null) return undefined;
    if (typeof value !== 'object') return value;
    if (Object.hasOwn(idleFacts, path) && idleFacts[path](value)) return undefined;
    if (Array.isArray(value)) {
      const rows = value.map(row => clean(row, path + '[]')).filter(row => row !== undefined);
      return rows.length || !['omissions', 'receipts', 'returns'].includes(path) ? rows : undefined;
    }
    const output = [];
    for (const [key, item] of Object.entries(value)) {
      if (omittedKeys.has(key) || !path && editorKeys.has(key) || key === 'representation' && item === 'source' && path !== 'fidelity' ||
          ['history.acts[]', 'sourceChanges.changes[].act'].includes(path) && key === 'operation' ||
          !path && (name !== 'open' && openKeys.has(key) && !keptKeys[name]?.(result).includes(key) || key === 'editor_url' && name !== 'open' &&
            ['ok', 'applied', 'rebased', 'created', 'resumed', 'current', 'unchanged', 'saved', 'exported', 'shown', 'done', 'message'].includes(result.outcome) && result.availability !== 'unavailable')) continue;
      let shaped = item;
      if (key === 'sourceChanges' && item && typeof item === 'object') {
        const changes = (item.changes || []).filter(row => row.yours !== true);
        if (!changes.length && item.complete !== false && !item.omitted) continue;
        shaped = {...item, changes};
      }
      if (!path && key === 'act' && item && typeof item === 'object') shaped = item.id;
      const child = clean(shaped, path ? path + '.' + key : key);
      if (child !== undefined) output.push([key, child]);
    }
    return output.length ? Object.fromEntries(output) : undefined;
  };
  const reply = clean(result) || {};
  if (name === 'edit') {
    delete reply.hash;
    if (typeof reply.passage === 'string' && typeof reply.text !== 'string') reply.text = reply.passage;
    delete reply.passage;
  }
  if (typeof reply.text !== 'string' && typeof reply.context?.text === 'string') {
    const {context, ...value} = reply; Object.assign(reply, context, value); delete reply.context;
  }
  for (const key of ['matches', 'outline', 'candidates']) if (Array.isArray(reply[key])) {
    const rows = reply[key]; reply[key] = rows.length;
    if (rows.length && typeof reply.text !== 'string') reply.text = rows.map(row => row.line + ': ' + row.text).join('\n');
  }
  return reply;
}
export function parseReply(text) {
  const at = text.indexOf('\n');
  const receipt = JSON.parse(at < 0 ? text : text.slice(0, at));
  return at < 0 ? receipt : {...receipt, text: text.slice(at + 1)};
}
