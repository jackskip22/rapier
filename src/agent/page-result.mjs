// A page tool must return a whole JSON value below the browser's transport boundary.
// SPDX-License-Identifier: AGPL-3.0-only
export const PAGE_RESULT_BYTES = 15 * 1024;
const encoder = new TextEncoder();
export const resultBytes = value => encoder.encode(JSON.stringify(value)).byteLength;

// Applied work is never retried to obtain a smaller receipt. Keep its outcome and identifiers,
// then fit complete fields; an omitted source read carries no editing handles.
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
  const fields = ['documentId', 'documentRevision', 'representation', 'reason', 'changeId', 'reviewId',
    'threadId', 'messageId', 'file', 'applied', 'saved', 'verified', 'replayed', 'editCount', 'decided', 'closed',
    'filename', 'docKind', 'contribution', 'removed', 'replaced', 'availability', 'status', 'pointerId'];
  for (const key of fields) if (!(key === 'reason' && output.reason)) put(key, value[key]);
  for (const [key, names] of Object.entries({
    transaction: ['transactionId', 'baseRevision', 'revision', 'actor', 'principal', 'operation', 'sourceTransactionId', 'contribution', 'contributionBaseRevision'],
    receipt: ['id', 'status', 'state', 'kind', 'action', 'preference', 'presentation', 'landed', 'reason', 'value', 'previous'],
    pending: ['kind', 'requestId', 'proposalId', 'requirements'],
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
  // A surface-fact request has not performed the operation. Its entire continuation is
  // required by the adapter; a pending receipt without it would wait forever.
  if (value.outcome === 'pending' && value.pending?.kind === 'surface-fact' &&
      (!output.pending?.requirements || output.pending.requestId !== value.pending.requestId)) {
    output.outcome = 'refused'; output.reason = 'result_over_budget';
    delete output.pending; delete output.receipt;
    return output;
  }
  if (!readOnly) {
    // Whole fields keep download links, comparison receipts and drawing identities useful.
    // A source handle never survives the removal of the source disclosure it would authorize.
    const excluded = new Set(['complete', 'omissions', 'text', 'handle', 'complete_handle', 'recipe_handle',
      'svg_handle', 'comment_handle', 'coverage', 'content', ...Object.keys(output)]);
    for (const [key, item] of Object.entries(value)) if (!excluded.has(key)) put(key, item);
  }
  return output;
}
