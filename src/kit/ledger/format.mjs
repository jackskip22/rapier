// SPDX-License-Identifier: MIT
import {_rapierPrepareHistoryRecords, _rapierValidMetadata, _rapierTransformMetadata} from './journal-records.mjs';
import {pictureHistorySplices} from './history.mjs';
import {HistorySource} from './inverse-source.mjs';
import {authoredHistory} from './transport.mjs';
import {textRoot, rootAfter, sha256, sha256Parts, createSHA256} from './hash.mjs';
import {canonicalJSON, canonicalParts, plainData, documentText, utf8Length, exactKeys, nonnegative, fault} from './data.mjs';
export {textRoot, rootAfter};
const digest = value => sha256Parts(canonicalParts(value));
const rootShape = value => typeof value === 'string' && /^\d+:[a-z0-9]+:[a-z0-9]+$/.test(value);
function* checkedRecords(ledger, prepared) {
  if (!prepared.ok || ledger.records.length !== prepared.records.length) throw fault('record chain differs');
  let root = ledger.start.root, revision = ledger.start.revision;
  for (let index = 0; index < prepared.records.length; index++) {
    const record = ledger.records[index];
    if (!Array.isArray(record.splices) || !prepared.validRecord(index,
        ledger.documentAuthority, 64 * 1024 * 1024, utf8Length, !ledger.complete) ||
        record.transaction.baseRevision < revision || (record.transaction.baseRevision !== revision && ledger.complete) ||
        (record.transaction.baseRevision === revision && record.beforeHash !== root)) throw fault('record chain differs');
    if (record.transaction.baseRevision !== revision) root = record.beforeHash;
    for (const row of record.splices) root = rootAfter(root, row);
    if (root !== record.afterHash) throw fault('record root differs');
    revision = record.transaction.revision;
    yield record;
  }
  if (ledger.head.revision !== revision || ledger.head.root !== root) throw fault('history does not describe this document');
}
function readLedgerState(input, expectedText, expectedMetadata) {
  const ledger = plainData(input);
  if (!exactKeys(ledger, ['format','documentAuthority','start','records','head','complete','sha256']) || ledger.format !== 'rapier-ledger/2' ||
      typeof ledger.documentAuthority !== 'string' || !ledger.documentAuthority || ledger.documentAuthority.length > 256 ||
      typeof ledger.complete !== 'boolean' || !Array.isArray(ledger.records) ||
      !exactKeys(ledger.start, ['text','revision','root','sha256','metadata']) || !exactKeys(ledger.head, ['revision','root','sha256','metadata'])) throw fault('unsupported or invalid envelope');
  const {sha256: claimed, ...payload} = ledger;
  if (claimed !== digest(payload)) throw fault('envelope checksum differs');
  let text = documentText(ledger.start.text), root = ledger.start.root, revision = ledger.start.revision;
  if (!_rapierValidMetadata(ledger.start.metadata) || !_rapierValidMetadata(ledger.head.metadata)) throw fault('invalid document metadata');
  if (!nonnegative(revision) || !rootShape(root) || (revision === 0 && root !== textRoot(text)) || ledger.start.sha256 !== sha256(text) ||
      (ledger.complete && revision !== 0)) throw fault('invalid start');
  const prepared = _rapierPrepareHistoryRecords(ledger.records);
  if (!prepared.ok) throw fault('record chain differs');
  let source = new HistorySource(text), bytes = utf8Length(text);
  for (const record of checkedRecords(ledger, prepared)) {
    const next = source.apply(record.splices);
    if (next === null) throw fault('splice does not replay');
    source = next;
    for (const row of record.splices) bytes += utf8Length(row.inserted) - utf8Length(row.removed);
    if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
    root = record.afterHash; revision = record.transaction.revision;
  }
  text = source.slice();
  if (ledger.records.some(row => Object.hasOwn(row, 'authored'))) {
    try { authoredHistory(ledger.start.text, ledger.records); } catch (_) { throw fault('authored origin differs'); }
  }
  const metadata = prepared.replayMetadata(ledger.start.metadata);
  if (!metadata || canonicalJSON(metadata) !== canonicalJSON(ledger.head.metadata) ||
      (expectedMetadata !== undefined && (!_rapierValidMetadata(expectedMetadata) || canonicalJSON(metadata) !== canonicalJSON(expectedMetadata))))
    throw fault('metadata does not describe this document');
  if (ledger.head.revision !== revision || ledger.head.root !== root || ledger.head.sha256 !== sha256(text) ||
      (expectedText !== undefined && text !== expectedText)) throw fault('history does not describe this document');
  return {value: {ledger, text, metadata, root, revision, complete: ledger.complete}, prepared, source};
}
export function ledgerWithStart(input, text) {
  let source = new HistorySource(documentText(text));
  for (let i = input.records.length - 1; i >= 0; i--) {
    source = source.apply(input.records[i].splices, true);
    if (source === null) throw fault('history does not reverse from this document');
  }
  return {...input, start: {...input.start, text: source.slice()}};
}
export function readLedger(input, expectedText, expectedMetadata) {
  return readLedgerState(input, expectedText, expectedMetadata).value;
}
function* checksum(parts) {
  const hash = createSHA256();
  for (const part of parts) { hash.update(part); yield; }
  return hash.digest();
}
function* sourceFacts(text) {
  if (typeof text !== 'string') throw fault('document is not whole-character text');
  const hash = createSHA256();
  let fnv = 0x811c9dc5, a = 1, b = 0, bytes = 0;
  for (let at = 0; at < text.length;) {
    const start = at, end = Math.min(text.length, at + 65536);
    for (; at < end;) {
      const stop = Math.min(end, at + 4096);
      for (; at < stop; at++) {
        const code = text.charCodeAt(at);
        fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a;
        if (code < 0x80) bytes++;
        else if (code < 0x800) bytes += 2;
        else if ((code & 0xfc00) === 0xd800) {
          if ((text.charCodeAt(at + 1) & 0xfc00) !== 0xdc00) throw fault('document is not whole-character text');
          bytes += 3;
        } else if ((code & 0xfc00) === 0xdc00) {
          if (!at || (text.charCodeAt(at - 1) & 0xfc00) !== 0xd800) throw fault('document is not whole-character text');
          bytes++;
        } else bytes += 3;
      }
      a %= 65521; b %= 65521;
    }
    if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
    hash.update(text.slice(start, end)); yield;
  }
  return {utf8Bytes: bytes, sha256: hash.digest(), contentRoot: text.length + ':' +
    (fnv >>> 0).toString(36) + ':' + (((b << 16) | a) >>> 0).toString(36)};
}
function* produceLedger({text, metadata, records, documentAuthority, revision, root, complete = false, earlier = records} = {}) {
  if (!_rapierValidMetadata(metadata)) throw fault('document metadata required');
  metadata = {...metadata};
  if (!Array.isArray(records) || !Array.isArray(earlier)) throw fault('records required');
  const prepared = _rapierPrepareHistoryRecords(records, earlier);
  if (!prepared.ok) throw fault('navigation target was not retained');
  const headFacts = yield* sourceFacts(text);
  let bytes = headFacts.utf8Bytes;
  const expanded = [];
  for (const {record, splices: rows, metadata: effect} of prepared.rows) {
    if (!rows || effect === undefined) throw fault('navigation target was not retained');
    expanded.push({transaction: plainData(record.transaction), splices: rows.map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted})),
      beforeHash: record.beforeHash, afterHash: record.afterHash, ...(Object.hasOwn(record, 'authored') ? {authored: plainData(record.authored)} : {}), ...(effect ? {metadata: plainData(effect)} : {}),
      ...(record.changeSet && Object.hasOwn(record.changeSet, 'label') ? {changeSet: {label: typeof record.changeSet.label === 'string' ? record.changeSet.label : plainData(record.changeSet.label)}} : {}),
      ...(record.derivedCommentIndex == null ? {} : {derivedCommentIndex: typeof record.derivedCommentIndex === 'string' ? record.derivedCommentIndex : plainData(record.derivedCommentIndex)})});
    yield;
  }
  const headBytes = bytes;
  let startSource = new HistorySource(text), startMetadata = {...metadata};
  for (let i = expanded.length - 1; i >= 0; i--) {
    startSource = startSource.apply(expanded[i].splices, true);
    startMetadata = _rapierTransformMetadata(startMetadata, expanded[i].metadata, true);
    if (startSource === null || !startMetadata) throw fault('history does not reverse from this document');
    for (const row of expanded[i].splices) bytes += utf8Length(row.removed) - utf8Length(row.inserted);
    if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
    yield;
  }
  const startText = startSource.slice();
  const unchangedText = expanded.every(row => !row.splices.length);
  const contentRoot = headFacts.contentRoot;
  revision ??= expanded.at(-1)?.transaction.revision ?? 0;
  root ??= expanded.at(-1)?.afterHash ?? contentRoot;
  documentAuthority ??= expanded[0]?.transaction.documentAuthority;
  const startRevision = expanded[0]?.transaction.baseRevision ?? revision, startRoot = expanded[0]?.beforeHash ?? root;
  if (typeof documentAuthority !== 'string' || !documentAuthority || documentAuthority.length > 256) throw fault('unsupported or invalid envelope');
  if (!nonnegative(startRevision) || !rootShape(startRoot)) throw fault('invalid start');
  const startFacts = unchangedText ? headFacts : yield* sourceFacts(startText);
  if (startRevision === 0 && startRoot !== startFacts.contentRoot) throw fault('invalid start');
  const headSHA = headFacts.sha256, startSHA = startFacts.sha256;
  const payload = {format: 'rapier-ledger/2', documentAuthority,
    start: {text: startText, revision: startRevision, root: startRoot, sha256: startSHA, metadata: startMetadata},
    records: expanded, head: {revision, root, sha256: headSHA, metadata: {...metadata}}, complete: complete === true && startRevision === 0 && expanded.every((row, i) => !i || row.transaction.baseRevision === expanded[i - 1].transaction.revision)};
  for (const _record of checkedRecords(payload, prepared)) yield;
  if (expanded.some(row => Object.hasOwn(row, 'authored'))) {
    try { authoredHistory(startText, expanded); } catch (_) { throw fault('authored origin differs'); }
  }
  const replayedMetadata = prepared.replayMetadata(startMetadata);
  if (!replayedMetadata || canonicalJSON(replayedMetadata) !== canonicalJSON(metadata)) throw fault('metadata does not describe this document');
  const ledger = {...payload, sha256: yield* checksum(canonicalParts(payload))};
  return {ledger, contentRoot, utf8Bytes: headBytes};
}
function finish(producer) {
  let step;
  do { step = producer.next(); } while (!step.done);
  return step.value;
}
export function exportLedger(input) { return finish(produceLedger(input)).ledger; }
export function prepareLedger(input) { return finish(produceLedger(input)); }
export async function prepareLedgerAsync(input, {yield: yieldWork, signal} = {}) {
  const producer = produceLedger(input);
  let step;
  do {
    signal?.throwIfAborted();
    step = producer.next();
    if (!step.done && yieldWork) {
      const pending = yieldWork();
      if (pending) await pending;
    }
  } while (!step.done);
  signal?.throwIfAborted();
  return step.value;
}
export function historyEnvelope(input, segmentIdentity = [], expectedText, expectedMetadata) {
  const {value: {ledger, text, metadata}, prepared, source} = readLedgerState(input, expectedText, expectedMetadata);
  const {byId, effects: {pictures}} = prepared;
  let branch = [], cursor = 0;
  for (const {transaction: tx} of ledger.records) {
    if (pictures.has(tx.id)) continue;
    const target = tx.reverts || tx.reapplies;
    if (target) {
      if (!byId.has(target)) continue;
      if (tx.reverts && branch[cursor - 1] === target) cursor--;
      else if (tx.reapplies && branch[cursor] === target) cursor++;
      else throw fault('invalid navigation order');
    } else { branch.length = cursor; branch.push(tx.id); cursor = branch.length; }
  }
  const step = (source, id, redo) => {
    const target = byId.get(id), folded = pictures.size
      ? pictureHistorySplices({get source() { return source.slice(); }, records: prepared.records}, target, redo) : null;
    return source.apply(folded || target.splices, !folded && !redo);
  };
  let traversed = source, traversedMetadata = {...metadata};
  for (let i = cursor - 1; i >= 0; i--) {
    traversed = step(traversed, branch[i], false);
    traversedMetadata = _rapierTransformMetadata(traversedMetadata, byId.get(branch[i]).metadata, true);
    if (traversed === null || !traversedMetadata) throw fault('undo branch does not reverse');
  }
  if (ledger.complete) {
    if (ledger.records.length && !branch.length) throw fault('complete history lost its branch');
    if (traversed.length !== ledger.start.text.length || !traversed.matches(0, ledger.start.text) ||
        canonicalJSON(traversedMetadata) !== canonicalJSON(ledger.start.metadata)) throw fault('complete branch differs');
  }
  traversed = source; traversedMetadata = {...metadata};
  for (let i = cursor; i < branch.length; i++) {
    traversed = step(traversed, branch[i], true);
    traversedMetadata = _rapierTransformMetadata(traversedMetadata, byId.get(branch[i]).metadata);
    if (traversed === null || !traversedMetadata) throw fault('redo branch does not replay');
  }
  if (ledger.complete && pictures.size) {
    let active = new HistorySource(ledger.start.text), activeMetadata = {...ledger.start.metadata};
    for (let i = 0; i < branch.length; i++) {
      active = step(active, branch[i], true);
      activeMetadata = _rapierTransformMetadata(activeMetadata, byId.get(branch[i]).metadata);
      if (active === null || !activeMetadata || (i + 1 === cursor && (active.length !== text.length || !active.matches(0, text) || canonicalJSON(activeMetadata) !== canonicalJSON(metadata)))) throw fault('complete branch differs');
    }
  }
  return {schemaVersion: 5, documentAuthority: ledger.documentAuthority, documentRevision: ledger.head.revision,
    ledger: ledger.records, branch, cursor, earliestRevision: ledger.start.revision, earliestHash: ledger.start.root,
    sourceRootId: ledger.head.root, earliestMetadata: {...ledger.start.metadata}, documentMetadata: {...metadata}, segmentIdentity, historyComplete: ledger.complete,
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
    reverts: null, reapplies: null, createdAt: at ?? null,
  }};
  return exportLedger({text, metadata: current.metadata, records: [...current.ledger.records, record], documentAuthority: current.ledger.documentAuthority,
    revision, root, complete: current.complete});
}
