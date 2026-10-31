// SPDX-License-Identifier: MIT
import {_rapierPrepareHistoryRecords, _rapierValidMetadata, _rapierTransformMetadata} from "./journal-records.mjs";
import {pictureHistorySplices} from "./history.mjs";
import {HistorySource} from "./source.mjs";
import {authoredHistory} from "./transport.mjs";
import {textRoot, rootAfter, sha256, sha256PartsAsync, createSHA256} from "./hash.mjs";
import {canonicalJSON, canonicalParts, canonicalRowsParts, ownRow, ownLedger, isOwnedLedger, plainData, documentText, utf8Length, exactKeys, nonnegative, fault} from "./data.mjs";
import {diff} from "./diff/diff.mjs";
import {minimalHistorySplice} from "./inverse-source.mjs";
import {evaluateWill} from "./will.mjs";
export {textRoot, rootAfter};
const rootShape = value => typeof value === 'string' && /^\d+:[a-z0-9]+:[a-z0-9]+$/.test(value);
function* checkedRecords(ledger, prepared, from = null) {
  if (!prepared.ok || ledger.records.length !== prepared.records.length) throw fault('record chain differs');
  let root = from ? from.root : ledger.start.root, revision = from ? from.revision : ledger.start.revision;
  for (let index = from ? from.index : 0; index < prepared.records.length; index++) {
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
function* envelopeParts(envelope) {
  const keys = Object.keys(envelope).sort();
  yield '{';
  for (let i = 0; i < keys.length; i++) {
    if (i) yield ',';
    yield JSON.stringify(keys[i]); yield ':';
    yield* keys[i] === 'records' ? canonicalRowsParts(envelope.records, 1) : canonicalParts(envelope[keys[i]], 1, new Set());
  }
  yield '}';
}
const proofs = new WeakMap();
function ownedRows(ledger) {
  if (ledger && Array.isArray(ledger.records)) for (const row of ledger.records) if (row && typeof row === 'object') ownRow(row);
  return ledger;
}
function copiedLedger(input, proof) {
  if (!proof || !input || typeof input !== 'object') return ownedRows(plainData(input));
  const fields = Object.getOwnPropertyDescriptors(input), start = fields.start;
  if (!start || !Object.hasOwn(start, 'value') || !start.value || typeof start.value !== 'object') return ownedRows(plainData(input));
  const parts = Object.getOwnPropertyDescriptors(start.value), text = parts.text;
  if (!text || !Object.hasOwn(text, 'value') || text.value !== proof.startText) return ownedRows(plainData(input));
  const shell = Object.create(Object.getPrototypeOf(input), {...fields, start: {...start,
    value: Object.create(Object.getPrototypeOf(start.value), {...parts, text: {...text, value: ''}})}});
  const ledger = ownedRows(plainData(shell));
  ledger.start.text = proof.startText;
  return ledger;
}
function ledgerAdmission(input) {
  const held = input && typeof input === 'object' ? proofs.get(input) : undefined;
  if (held && isOwnedLedger(input)) return {ledger: input, shell: held.shell, proof: held};
  const ledger = copiedLedger(input, held);
  if (!exactKeys(ledger, ['format','documentAuthority','start','records','head','complete','sha256']) || ledger.format !== 'rapier-ledger/2' ||
      typeof ledger.documentAuthority !== 'string' || !ledger.documentAuthority || ledger.documentAuthority.length > 256 ||
      typeof ledger.complete !== 'boolean' || !Array.isArray(ledger.records) ||
      !exactKeys(ledger.start, ['text','revision','root','sha256','metadata']) || !exactKeys(ledger.head, ['revision','root','sha256','metadata'])) throw fault('unsupported or invalid envelope');
  const shell = Array.from(envelopeParts({...ledger, start: {...ledger.start, text: ''}})).join('');
  const proof = held?.shell === shell && held.startText === ledger.start.text ? held : null;
  return {ledger, shell, proof};
}
function ledgerResult(ledger, proof, expectedText, expectedMetadata) {
  proofs.set(ledger, proof); ownLedger(ledger);
  const {text, metadata, root, revision, prepared, source} = proof;
  if (expectedMetadata !== undefined && (!_rapierValidMetadata(expectedMetadata) || canonicalJSON(metadata) !== canonicalJSON(expectedMetadata)))
    throw fault('metadata does not describe this document');
  if (expectedText !== undefined && text !== expectedText) throw fault('history does not describe this document');
  return {value: {ledger, text, metadata: {...metadata}, root, revision, complete: ledger.complete}, prepared, source, proof};
}
function readLedgerState(input, expectedText, expectedMetadata) {
  const {ledger, shell, proof: held} = ledgerAdmission(input);
  const proof = held || {shell, startText: ledger.start.text, ...finish(proveLedger(ledger))};
  if (typeof input === 'object') proofs.set(input, proof);
  return ledgerResult(ledger, proof, expectedText, expectedMetadata);
}
function* proveLedger(ledger, native = false) {
  const {sha256: claimed, ...payload} = ledger;
  if (claimed !== (yield* checksum(envelopeParts(payload), native))) throw fault('envelope checksum differs');
  let text = ledger.start.text, root = ledger.start.root, revision = ledger.start.revision;
  const startFacts = yield* sourceFacts(text, native);
  if (!_rapierValidMetadata(ledger.start.metadata) || !_rapierValidMetadata(ledger.head.metadata)) throw fault('invalid document metadata');
  if (!nonnegative(revision) || !rootShape(root) || (revision === 0 && root !== startFacts.contentRoot) || ledger.start.sha256 !== startFacts.sha256 ||
      (ledger.complete && revision !== 0)) throw fault('invalid start');
  const prepared = _rapierPrepareHistoryRecords(ledger.records);
  if (!prepared.ok) throw fault('record chain differs');
  let source = new HistorySource(text), bytes = startFacts.utf8Bytes;
  for (const record of checkedRecords(ledger, prepared)) {
    const next = source.apply(record.splices);
    if (next === null) throw fault('splice does not replay');
    source = next;
    for (const row of record.splices) bytes += utf8Length(row.inserted) - utf8Length(row.removed);
    if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
    root = record.afterHash; revision = record.transaction.revision; yield;
  }
  text = source.slice();
  if (ledger.records.some(row => Object.hasOwn(row, 'authored'))) {
    try { authoredHistory(ledger.start.text, ledger.records); } catch (_) { throw fault('authored origin differs'); }
  }
  const metadata = prepared.replayMetadata(ledger.start.metadata);
  if (!metadata || canonicalJSON(metadata) !== canonicalJSON(ledger.head.metadata)) throw fault('metadata does not describe this document');
  const headFacts = ledger.records.every(row => !row.splices.length) ? startFacts : yield* sourceFacts(text, native);
  if (ledger.head.revision !== revision || ledger.head.root !== root || ledger.head.sha256 !== headFacts.sha256) throw fault('history does not describe this document');
  return {text, metadata, root, revision, prepared, source};
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
export async function readLedgerAsync(input, expectedText, expectedMetadata, options = {}) {
  options.signal?.throwIfAborted();
  const {ledger, shell, proof: held} = ledgerAdmission(input);
  const metadata = expectedMetadata === undefined ? undefined : plainData(expectedMetadata);
  const proof = held || {shell, startText: ledger.start.text,
    ...await finishAsync(proveLedger(ledger, !!globalThis.crypto?.subtle), options)};
  options.signal?.throwIfAborted();
  if (typeof input === 'object') proofs.set(input, proof);
  return ledgerResult(ledger, proof, expectedText, metadata).value;
}
function* checksum(parts, native = false) {
  if (native) return yield {parts};
  const hash = createSHA256();
  for (const part of parts) { hash.update(part); yield; }
  return hash.digest();
}
function* sourceFacts(text, native = false) {
  if (typeof text !== 'string') throw fault('document is not whole-character text');
  const hash = native ? null : createSHA256();
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
    hash?.update(text.slice(start, end)); yield;
  }
  const digest = hash ? hash.digest() : yield {parts: [text], byteLength: bytes};
  return {utf8Bytes: bytes, sha256: digest, contentRoot: text.length + ':' +
    (fnv >>> 0).toString(36) + ':' + (((b << 16) | a) >>> 0).toString(36)};
}
const expandedRows = new WeakMap();
const sameSplices = (a, b) => a === b || a.length === b.length &&
  a.every((row, i) => row.pos === b[i].pos && row.removed === b[i].removed && row.inserted === b[i].inserted);
const sameEffect = (a, b) => a === b || !!a && !!b && canonicalJSON(a) === canonicalJSON(b);
const RECENT_TEXT_LIMIT = 1 << 19;
let recentLedgers = [];
function* produceLedger({text, metadata, records, documentAuthority, revision, root, complete = false, earlier = records} = {}, native = false) {
  if (!_rapierValidMetadata(metadata)) throw fault('document metadata required');
  metadata = {...metadata};
  if (!Array.isArray(records) || !Array.isArray(earlier)) throw fault('records required');
  const prepared = _rapierPrepareHistoryRecords(records, earlier);
  if (!prepared.ok) throw fault('navigation target was not retained');
  const headFacts = yield* sourceFacts(text, native);
  let bytes = headFacts.utf8Bytes;
  const expanded = [];
  for (const {record, splices: rows, metadata: effect} of prepared.rows) {
    if (!rows || effect === undefined) throw fault('navigation target was not retained');
    const held = expandedRows.get(record);
    if (held && sameSplices(held.rows, rows) && sameEffect(held.effect, effect)) { expanded.push(held.row); yield; continue; }
    expanded.push(ownRow({transaction: plainData(record.transaction), splices: rows.map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted})),
      beforeHash: record.beforeHash, afterHash: record.afterHash, ...(Object.hasOwn(record, 'authored') ? {authored: plainData(record.authored)} : {}), ...(effect ? {metadata: plainData(effect)} : {}),
      ...(record.changeSet && Object.hasOwn(record.changeSet, 'label') ? {changeSet: {label: typeof record.changeSet.label === 'string' ? record.changeSet.label : plainData(record.changeSet.label)}} : {}),
      ...(record.derivedCommentIndex == null ? {} : {derivedCommentIndex: typeof record.derivedCommentIndex === 'string' ? record.derivedCommentIndex : plainData(record.derivedCommentIndex)})}));
    expandedRows.set(record, {row: expanded.at(-1), rows, effect});
    yield;
  }
  const headBytes = bytes;
  let base = recentLedgers.find(row => row.rows.length <= expanded.length && row.rows.every((value, at) => value === expanded[at]));
  let startSource = new HistorySource(text), startMetadata = {...metadata};
  for (let i = expanded.length - 1; i >= (base ? base.rows.length : 0); i--) {
    startSource = startSource.apply(expanded[i].splices, true);
    if (expanded[i].metadata) startMetadata = _rapierTransformMetadata(startMetadata, expanded[i].metadata, true);
    if (startSource === null || !startMetadata) throw fault('history does not reverse from this document');
    for (const row of expanded[i].splices) bytes += utf8Length(row.removed) - utf8Length(row.inserted);
    if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
    yield;
  }
  if (base && (bytes !== base.headBytes || startSource.length !== base.headText.length || !startSource.matches(0, base.headText) ||
      canonicalJSON(startMetadata) !== base.headMetadata)) {
    base = null; bytes = headBytes; startSource = new HistorySource(text); startMetadata = {...metadata};
    for (let i = expanded.length - 1; i >= 0; i--) {
      startSource = startSource.apply(expanded[i].splices, true);
      if (expanded[i].metadata) startMetadata = _rapierTransformMetadata(startMetadata, expanded[i].metadata, true);
      if (startSource === null || !startMetadata) throw fault('history does not reverse from this document');
      for (const row of expanded[i].splices) bytes += utf8Length(row.removed) - utf8Length(row.inserted);
      if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
      yield;
    }
  }
  if (base) { startMetadata = {...base.startMetadata}; bytes = base.startBytes; }
  const startText = base ? base.startText : startSource.slice();
  const unchangedText = expanded.every(row => !row.splices.length);
  const contentRoot = headFacts.contentRoot;
  revision ??= expanded.at(-1)?.transaction.revision ?? 0;
  root ??= expanded.at(-1)?.afterHash ?? contentRoot;
  documentAuthority ??= expanded[0]?.transaction.documentAuthority;
  const startRevision = expanded[0]?.transaction.baseRevision ?? revision, startRoot = expanded[0]?.beforeHash ?? root;
  if (typeof documentAuthority !== 'string' || !documentAuthority || documentAuthority.length > 256) throw fault('unsupported or invalid envelope');
  if (!nonnegative(startRevision) || !rootShape(startRoot)) throw fault('invalid start');
  const startFacts = unchangedText ? headFacts : base ? base.startFacts : yield* sourceFacts(startText, native);
  if (startRevision === 0 && startRoot !== startFacts.contentRoot) throw fault('invalid start');
  const headSHA = headFacts.sha256, startSHA = startFacts.sha256;
  const payload = {format: 'rapier-ledger/2', documentAuthority,
    start: {text: startText, revision: startRevision, root: startRoot, sha256: startSHA, metadata: startMetadata},
    records: expanded, head: {revision, root, sha256: headSHA, metadata: {...metadata}}, complete: complete === true && startRevision === 0 && expanded.every((row, i) => !i || row.transaction.baseRevision === expanded[i - 1].transaction.revision)};
  const from = base && base.documentAuthority === documentAuthority && base.complete === payload.complete &&
    base.startRoot === startRoot && base.startRevision === startRevision ? {index: base.rows.length, root: base.chainRoot, revision: base.chainRevision} : null;
  for (const _record of checkedRecords(payload, prepared, from)) yield;
  if (expanded.some(row => Object.hasOwn(row, 'authored'))) {
    try { authoredHistory(startText, expanded); } catch (_) { throw fault('authored origin differs'); }
  }
  const replayedMetadata = prepared.replayMetadata(startMetadata);
  if (!replayedMetadata || canonicalJSON(replayedMetadata) !== canonicalJSON(metadata)) throw fault('metadata does not describe this document');
  const ledger = {...payload, sha256: yield* checksum(envelopeParts(payload), native)};
  const others = recentLedgers.filter(row => row.rows[0] !== expanded[0] && row.documentAuthority === documentAuthority);
  recentLedgers = text.length + startText.length > RECENT_TEXT_LIMIT ? [] : [{rows: expanded, headText: text, headMetadata: canonicalJSON(metadata),
    headBytes, startText, startMetadata: {...startMetadata}, startFacts, startBytes: bytes, documentAuthority, complete: payload.complete,
    startRoot, startRevision, chainRoot: payload.head.root, chainRevision: payload.head.revision}, ...others].slice(0, 4);
  ownLedger(ledger);
  proofs.set(ledger, {shell: Array.from(envelopeParts({...ledger, start: {...ledger.start, text: ''}})).join(''), startText,
    text, metadata: {...metadata}, root, revision, prepared: _rapierPrepareHistoryRecords(ledger.records),
    source: new HistorySource(text)});
  return {ledger, contentRoot, utf8Bytes: headBytes};
}
function finish(producer) {
  let step;
  do { step = producer.next(); } while (!step.done);
  return step.value;
}
export function exportLedger(input) { return finish(produceLedger(input)).ledger; }
async function finishAsync(producer, {yield: yieldWork, signal} = {}) {
  let step, digest;
  do {
    signal?.throwIfAborted();
    step = producer.next(digest); digest = undefined;
    if (!step.done && step.value) digest = await sha256PartsAsync(step.value.parts,
      {yield: yieldWork, signal, byteLength: step.value.byteLength});
    else if (!step.done && yieldWork) {
      const pending = yieldWork();
      if (pending) await pending;
    }
  } while (!step.done);
  signal?.throwIfAborted();
  return step.value;
}
export function prepareLedgerAsync(input, options = {}) {
  return finishAsync(produceLedger(input, !!globalThis.crypto?.subtle), options);
}
function historyNavigation(ledger, text, metadata, prepared, source) {
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
    if (byId.get(branch[i]).metadata) traversedMetadata = _rapierTransformMetadata(traversedMetadata, byId.get(branch[i]).metadata, true);
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
    if (byId.get(branch[i]).metadata) traversedMetadata = _rapierTransformMetadata(traversedMetadata, byId.get(branch[i]).metadata);
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
  return {branch, cursor};
}
export function historyEnvelope(input, segmentIdentity = [], expectedText, expectedMetadata) {
  const {value: {ledger, text, metadata}, prepared, source, proof} = readLedgerState(input, expectedText, expectedMetadata);
  const {branch, cursor} = proof.navigation ??= historyNavigation(ledger, text, metadata, prepared, source);
  return {schemaVersion: 5, documentAuthority: ledger.documentAuthority, documentRevision: ledger.head.revision,
    ledger: ledger.records, branch: branch.slice(), cursor, earliestRevision: ledger.start.revision, earliestHash: ledger.start.root,
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
  const splices = diff(current.text, text, {_unit: 'word'}).edits.map(edit =>
    minimalHistorySplice(current.text.slice(...edit.before), text.slice(...edit.after), edit.before[0])).reverse();
  const revision = current.revision + 1, root = splices.reduce(rootAfter, current.root);
  if (actor.kind === 'agent' && current.metadata.docKind === 'markdown' && evaluateWill(current.text, splices).outcome !== 'applied')
    throw fault('will_violation');
  const identity = sha256(canonicalJSON({before: current.ledger.sha256, text, actor, operation, at: at ?? null}));
  const record = {beforeHash: current.root, afterHash: root, splices, transaction: {
    id: current.ledger.documentAuthority.slice(0, 48) + ':export:' + identity,
    documentAuthority: current.ledger.documentAuthority, baseRevision: current.revision, revision,
    actor, transport: 'platform', operation, requestId: null, sourceTransactionId: null,
    affectedBlockIds: [], parent: current.ledger.records.at(-1)?.transaction.id ?? null,
    reverts: null, reapplies: null, createdAt: at ?? null,
  }};
  return exportLedger({text, metadata: current.metadata, records: [...current.ledger.records, record], documentAuthority: current.ledger.documentAuthority,
    revision, root, complete: current.complete});
}
