// SPDX-License-Identifier: MIT
import {readLedger, exportLedger, textRoot, rootAfter} from './format.mjs';
import {_rapierTransformSplices, _rapierHistoryEffects} from './journal-records.mjs';
import {projectInverseSource} from './inverse-source.mjs';
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
  const {ledger, text} = readLedger(input), effects = _rapierHistoryEffects(ledger.records);
  const projection = projectInverseSource({source: text, initialSource: ledger.start.text, records: ledger.records,
    rows: ledger.records.map(record => ({record, splices: record.splices})), effects}, new Set(), effects, {origins: true});
  if (!projection.ok) throw fault('authorship source history is invalid');
  const authors = new Map(ledger.records.map(({transaction}) => [transaction.id, transaction]));
  const runs = coalesce(projection.origins.map(([from, to, id]) => {
    const tx = authors.get(id);
    return [from, to, tx?.actor.kind ?? 'system', tx?.actor.id ?? 'unattributed', tx ? tx.createdAt : 0];
  }));
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
