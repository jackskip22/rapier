// SPDX-License-Identifier: MIT
import {readLedger, exportLedger, textRoot, rootAfter} from './format.mjs';
import {_rapierTransformSplices, _rapierHistoryEffects} from './journal-records.mjs';
import {sha256} from './hash.mjs';
import {plainData, documentText, nonnegative, exactKeys, fault} from './data.mjs';
function coalesce(runs) {
  const out = [];
  for (const run of runs) {
    if (run[0] === run[1]) continue;
    const last = out.at(-1);
    if (last && last[1] === run[0] && last.slice(2).every((value, i) => value === run[i + 2])) last[1] = run[1];
    else out.push(run.slice());
  }
  return out;
}
export function authorship(input) {
  const {ledger, text} = readLedger(input), references = _rapierHistoryEffects(ledger.records).references, removed = new Map();
  let runs = ledger.start.text ? [[0, ledger.start.text.length, 'system', 'unattributed', 0]] : [];
  for (const record of ledger.records) {
    // An Undo or Redo puts back text the act it references removed: that text keeps the runs it had.
    const tx = record.transaction, gone = [], kept = (references?.get(tx.id) || []).flatMap(id => removed.get(id) || []);
    for (const row of record.splices) {
      const cut = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length, before = [], after = [], inside = [];
      for (const run of runs) {
        if (run[0] < row.pos) before.push([run[0], Math.min(run[1], row.pos), ...run.slice(2)]);
        if (run[1] > cut) after.push([Math.max(run[0], cut) + delta, run[1] + delta, ...run.slice(2)]);
        if (run[0] < cut && run[1] > row.pos) inside.push([Math.max(run[0], row.pos) - row.pos, Math.min(run[1], cut) - row.pos, ...run.slice(2)]);
      }
      if (row.removed) gone.push({text: row.removed, runs: inside});
      const at = row.inserted ? kept.findIndex(entry => entry.text === row.inserted) : -1;
      const put = at < 0 ? [[row.pos, row.pos + row.inserted.length, tx.actor.kind, tx.actor.id, tx.createdAt]]
        : kept.splice(at, 1)[0].runs.map(run => [run[0] + row.pos, run[1] + row.pos, ...run.slice(2)]);
      runs = coalesce([...before, ...put, ...after]);
    }
    removed.set(tx.id, gone);
  }
  return {format: 'rapier-authorship/1', sha256: sha256(text), runs};
}
export function readAuthorship(input, text) {
  documentText(text); const value = plainData(input);
  if (!exactKeys(value, ['format','sha256','runs']) || value.format !== 'rapier-authorship/1' || value.sha256 !== sha256(text) || !Array.isArray(value.runs)) throw fault('authorship is not for this text');
  let cursor = 0;
  for (const run of value.runs) {
    if (!Array.isArray(run) || run.length !== 5 || run[0] !== cursor || !nonnegative(run[1]) || run[1] <= cursor || run[1] > text.length ||
        !['human','agent','system'].includes(run[2]) || typeof run[3] !== 'string' || !run[3] || run[3].length > 160 || !(run[4] === null || nonnegative(run[4])) ||
        /[\uD800-\uDFFF]/u.test(text.slice(cursor, run[1]))) throw fault('invalid authorship run');
    cursor = run[1];
  }
  if (cursor !== text.length) throw fault('authorship does not cover the text');
  return value;
}
// Authorship-only imports become an incomplete insertion ledger. There is no mutable blame database.
export function ledgerFromAuthorship(input, text, documentAuthority, metadata) {
  const value = readAuthorship(input, text), records = [];
  let current = '', root = textRoot('');
  for (const [start, end, kind, id, createdAt] of value.runs) {
    const row = {pos: start, removed: '', inserted: text.slice(start, end)}, revision = records.length + 1;
    const beforeHash = root; root = rootAfter(root, row);
    current = _rapierTransformSplices(current, [row]);
    records.push({beforeHash, afterHash: root, splices: [row], transaction: {
      id: documentAuthority.slice(0, 48) + ':authorship:' + revision.toString(36), documentAuthority,
      baseRevision: revision - 1, revision, actor: {kind, id}, transport: 'platform', operation: 'authorship.import',
      requestId: null, sourceTransactionId: null, affectedBlockIds: [], parent: records.at(-1)?.transaction.id ?? null,
      reverts: null, reapplies: null, createdAt,
    }});
  }
  return exportLedger({text: current, metadata, records, documentAuthority, revision: records.length, root, complete: false});
}
