// SPDX-License-Identifier: MIT
import {_rapierValidLedgerRecord, _rapierRecordSplices, _rapierTransformSplices} from './journal-records.mjs';
import {textRoot, rootAfter, sha256} from './hash.mjs';
import {canonicalJSON, plainData, documentText, exactKeys, nonnegative, fault} from './data.mjs';
export {textRoot, rootAfter};
const digest = value => sha256(canonicalJSON(value));
const rootShape = value => typeof value === 'string' && /^\d+:[a-z0-9]+:[a-z0-9]+$/.test(value);
export function readLedger(input, expectedText) {
  const ledger = plainData(input);
  if (!exactKeys(ledger, ['format','documentAuthority','start','records','head','complete','sha256']) || ledger.format !== 'rapier-ledger/1' ||
      typeof ledger.documentAuthority !== 'string' || !ledger.documentAuthority || ledger.documentAuthority.length > 256 ||
      typeof ledger.complete !== 'boolean' || !Array.isArray(ledger.records) ||
      !exactKeys(ledger.start, ['text','revision','root','sha256']) || !exactKeys(ledger.head, ['revision','root','sha256'])) throw fault('invalid envelope');
  const {sha256: claimed, ...payload} = ledger;
  if (claimed !== digest(payload)) throw fault('envelope checksum differs');
  let text = documentText(ledger.start.text), root = ledger.start.root, revision = ledger.start.revision;
  if (!nonnegative(revision) || !rootShape(root) || (revision === 0 && root !== textRoot(text)) || ledger.start.sha256 !== sha256(text) ||
      (ledger.complete && revision !== 0)) throw fault('invalid start');
  const earlier = [];
  for (const record of ledger.records) {
    if (!Array.isArray(record.splices) || !record.splices.length || !_rapierValidLedgerRecord(record, earlier.at(-1) || null, earlier,
        ledger.documentAuthority, 25 * 1024 * 1024, text => new TextEncoder().encode(text).length, !ledger.complete) ||
        record.transaction.baseRevision < revision || (record.transaction.baseRevision !== revision && ledger.complete) ||
        (record.transaction.baseRevision === revision && record.beforeHash !== root)) throw fault('record chain differs');
    // A pruned cancelling pair leaves a stated revision gap, just as in the editor's restore reader.
    if (record.transaction.baseRevision !== revision) root = record.beforeHash;
    const next = _rapierTransformSplices(text, record.splices);
    if (next === null) throw fault('splice does not replay');
    text = documentText(next);
    for (const row of record.splices) root = rootAfter(root, row);
    if (root !== record.afterHash) throw fault('record root differs');
    revision = record.transaction.revision; earlier.push(record);
  }
  if (ledger.head.revision !== revision || ledger.head.root !== root || ledger.head.sha256 !== sha256(text) ||
      (expectedText !== undefined && text !== expectedText)) throw fault('history does not describe this document');
  return {ledger, text, root, revision, complete: ledger.complete};
}
export function exportLedger({text, records, documentAuthority, revision, root, complete = false, earlier = records} = {}) {
  documentText(text);
  if (!Array.isArray(records) || !Array.isArray(earlier)) throw fault('records required');
  // Inspect before touching properties: exporting must not call accessors on an alleged record.
  records = plainData(records); earlier = plainData(earlier);
  const expanded = records.map(record => {
    const rows = _rapierRecordSplices(record, earlier);
    if (!rows) throw fault('navigation target was not retained');
    return {transaction: record.transaction, splices: rows.map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted})),
      beforeHash: record.beforeHash, afterHash: record.afterHash};
  });
  let startText = text;
  for (let i = expanded.length - 1; i >= 0; i--) {
    startText = _rapierTransformSplices(startText, expanded[i].splices, true);
    if (startText === null) throw fault('history does not reverse from this document');
  }
  revision ??= expanded.at(-1)?.transaction.revision ?? 0;
  root ??= expanded.at(-1)?.afterHash ?? textRoot(text);
  documentAuthority ??= expanded[0]?.transaction.documentAuthority;
  const startRevision = expanded[0]?.transaction.baseRevision ?? revision;
  const payload = {format: 'rapier-ledger/1', documentAuthority,
    start: {text: startText, revision: startRevision, root: expanded[0]?.beforeHash ?? root, sha256: sha256(startText)},
    records: expanded, head: {revision, root, sha256: sha256(text)}, complete: complete === true && startRevision === 0 && expanded.every((row, i) => !i || row.transaction.baseRevision === expanded[i - 1].transaction.revision)};
  const ledger = {...payload, sha256: digest(payload)};
  readLedger(ledger, text); return ledger;
}
// Derived navigation, never a second history. A target older than start is intentionally unavailable.
export function historyEnvelope(input, segmentIdentity = []) {
  const {ledger, text} = readLedger(input), ids = new Set(ledger.records.map(row => row.transaction.id));
  let branch = [], cursor = 0;
  for (const {transaction: tx} of ledger.records) {
    const target = tx.reverts || tx.reapplies;
    if (target) {
      if (!ids.has(target)) continue;
      if (tx.reverts && branch[cursor - 1] === target) cursor--;
      else if (tx.reapplies && branch[cursor] === target) cursor++;
      else throw fault('invalid navigation order');
    } else { branch = branch.slice(0, cursor); branch.push(tx.id); cursor = branch.length; }
  }
  const byId = new Map(ledger.records.map(row => [row.transaction.id, row]));
  let traversed = text;
  for (let i = cursor - 1; i >= 0; i--) {
    traversed = _rapierTransformSplices(traversed, byId.get(branch[i]).splices, true);
    if (traversed === null) throw fault('undo branch does not reverse');
  }
  traversed = text;
  for (let i = cursor; i < branch.length; i++) {
    traversed = _rapierTransformSplices(traversed, byId.get(branch[i]).splices);
    if (traversed === null) throw fault('redo branch does not replay');
  }
  if (ledger.complete) {
    if (ledger.records.length && !branch.length) throw fault('complete history lost its branch');
    let active = ledger.start.text;
    if (!cursor && active !== text) throw fault('complete history start differs');
    for (let i = 0; i < branch.length; i++) {
      active = _rapierTransformSplices(active, byId.get(branch[i]).splices);
      if (active === null || (i + 1 === cursor && active !== text)) throw fault('complete branch differs');
    }
  }
  return {schemaVersion: 4, documentAuthority: ledger.documentAuthority, documentRevision: ledger.head.revision,
    ledger: ledger.records, branch, cursor, earliestRevision: ledger.start.revision, earliestHash: ledger.start.root,
    sourceRootId: ledger.head.root, segmentIdentity, historyComplete: ledger.complete,
    trimReason: ledger.complete ? '' : 'carried_start', trimmedBytes: 0};
}
export function agentActorId(door, agent) {
  if (typeof door !== 'string' || !door || door.length > 160 || /[\u0000-\u001f\u007f]/.test(door)) throw fault('invalid door');
  if (agent == null) return door;
  agent = plainData(agent);
  if (!exactKeys(agent, ['name']) || typeof agent.name !== 'string' || !agent.name.trim() || agent.name.length > 96 ||
      /[\u0000-\u001f\u007f]/.test(agent.name) || door.length + agent.name.length + 1 > 160) throw fault('invalid host-given name');
  return door + '/' + agent.name;
}

// A writer changing representation records that change, rather than attaching an unrelated head.
export function replaceLedgerText(input, text, {actor = {kind: 'system', id: 'rapier'}, operation = 'document.replace', at} = {}) {
  const current = readLedger(input); documentText(text);
  if (current.text === text) return current.ledger;
  let start = 0, a = current.text.length, b = text.length;
  while (start < a && start < b && current.text[start] === text[start]) start++;
  if (start && /[\uDC00-\uDFFF]/.test(current.text[start] || text[start] || '')) start--;
  while (a > start && b > start && current.text[a - 1] === text[b - 1]) { a--; b--; }
  if (/[\uDC00-\uDFFF]/.test(current.text[a] || text[b] || '')) { a++; b++; }
  const splices = [{pos: start, removed: current.text.slice(start, a), inserted: text.slice(start, b)}];
  const revision = current.revision + 1, root = rootAfter(current.root, splices[0]);
  const record = {beforeHash: current.root, afterHash: root, splices, transaction: {
    id: current.ledger.documentAuthority.slice(0, 48) + ':export:' + revision.toString(36),
    documentAuthority: current.ledger.documentAuthority, baseRevision: current.revision, revision,
    actor, transport: 'platform', operation, requestId: null, sourceTransactionId: null,
    affectedBlockIds: [], parent: current.ledger.records.at(-1)?.transaction.id ?? null,
    reverts: null, reapplies: null, createdAt: at ?? current.ledger.records.at(-1)?.transaction.createdAt ?? 0,
  }};
  return exportLedger({text, records: [...current.ledger.records, record], documentAuthority: current.ledger.documentAuthority,
    revision, root, complete: current.complete});
}
