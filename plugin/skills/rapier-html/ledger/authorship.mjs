// SPDX-License-Identifier: MIT
import {readLedger, exportLedger, textRoot, rootAfter} from './format.mjs';
import {_rapierTransformSplices} from './journal-records.mjs';
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
  const {ledger, text} = readLedger(input);
  let runs = ledger.start.text ? [[0, ledger.start.text.length, 'system', 'unattributed', 0]] : [];
  for (const record of ledger.records) for (const row of record.splices) {
    const cut = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length, before = [], after = [];
    for (const run of runs) {
      if (run[0] < row.pos) before.push([run[0], Math.min(run[1], row.pos), ...run.slice(2)]);
      if (run[1] > cut) after.push([Math.max(run[0], cut) + delta, run[1] + delta, ...run.slice(2)]);
    }
    const tx = record.transaction;
    runs = coalesce([...before, [row.pos, row.pos + row.inserted.length, tx.actor.kind, tx.actor.id, tx.createdAt], ...after]);
  }
  return {format: 'rapier-authorship/1', sha256: sha256(text), runs};
}
export function readAuthorship(input, text) {
  documentText(text); const value = plainData(input);
  if (!exactKeys(value, ['format','sha256','runs']) || value.format !== 'rapier-authorship/1' || value.sha256 !== sha256(text) || !Array.isArray(value.runs)) throw fault('authorship is not for this text');
  let cursor = 0;
  for (const run of value.runs) {
    if (!Array.isArray(run) || run.length !== 5 || run[0] !== cursor || !nonnegative(run[1]) || run[1] <= cursor || run[1] > text.length ||
        !['human','agent','system'].includes(run[2]) || typeof run[3] !== 'string' || !run[3] || run[3].length > 160 || !nonnegative(run[4]) ||
        /[\uD800-\uDFFF]/u.test(text.slice(cursor, run[1]))) throw fault('invalid authorship run');
    cursor = run[1];
  }
  if (cursor !== text.length) throw fault('authorship does not cover the text');
  return value;
}
// Authorship-only imports become an incomplete insertion ledger. There is no mutable blame database.
export function ledgerFromAuthorship(input, text, documentAuthority) {
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
  return exportLedger({text: current, records, documentAuthority, revision: records.length, root, complete: false});
}
