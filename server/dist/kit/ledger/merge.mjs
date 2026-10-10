// SPDX-License-Identifier: MIT
import {readLedger, exportLedger, rootAfter} from './format.mjs';
import {_rapierTransformSplices, _rapierTransformMetadata, _rapierMetadataDelta, _rapierHistoryEffects, _rapierMetadataState} from './journal-records.mjs';
import {mergeText} from './text-merge.mjs';
import {transposeAuthored, authoredPlacements} from './transport.mjs';
import {parseWill} from '../../agent/will.mjs';
import {sha256} from './hash.mjs';
import {canonicalJSON, fault} from './data.mjs';
// The same interval transport used by the agent kernel, now shared with the public ledger.
export function transportInterval(start, end, splices) {
  let a = start, b = end;
  for (const row of splices) {
    if (!Number.isSafeInteger(row.pos) || row.pos < 0) return null;
    if (row.pos + row.removed.length <= a) {
      const delta = row.inserted.length - row.removed.length; a += delta; b += delta;
    } else if (row.pos < b || (a === b && row.pos < a && row.pos + row.removed.length > a)) return null;
  }
  return {start: a, end: b};
}
// Follow the current extent of a touched range for disclosure or the person's focus.
// Unlike transportInterval, this does not prove unchanged source and never grants edit authority.
export function transportTouchedInterval(start, end, splices) {
  const unchanged = transportInterval(start, end, splices);
  if (unchanged) return unchanged;
  let range = {start, end};
  for (const row of splices) {
    // A split replacement can insert at a boundary before another splice touches the range.
    const boundaryInsertion = !row.removed.length && (row.pos === range.start || row.pos === range.end);
    const exact = boundaryInsertion ? null : transportInterval(range.start, range.end, [row]);
    range = exact || {start: Math.min(range.start, row.pos),
      end: Math.max(row.pos + row.inserted.length, range.end + row.inserted.length - row.removed.length)};
  }
  return range;
}
const recordKey = record => sha256(canonicalJSON(record));
// Identity survives rebasing. Position, roots, revision and parent are local placement,
// while authorial choices and semantic inverse targets belong to the original act.
function actFingerprint(record, effects) {
  const tx = record.transaction, references = effects.references.get(tx.id) || [];
  const {id, documentAuthority, baseRevision, revision, parent, reverts, reapplies,
    sourceTransactionId, sourceTransactionIds, remoteTransactionId, ...authored} = tx;
  return sha256(canonicalJSON({transaction: authored, references,
    changeSet: record.changeSet ?? null, derivedCommentIndex: record.derivedCommentIndex ?? null,
    // Applied source placement is proved below, never inferred from this fingerprint.
    // An inverse's physical metadata is projected from its targets at the destination.
    metadata: references.length ? null : Object.fromEntries(Object.entries(record.metadata || {}).map(([key, pair]) => [key, pair.after]))}));
}
const mergeIdentity = (localDigest, incomingDigest) => 'merge:' + sha256(canonicalJSON([localDigest, incomingDigest]));
function checkpointList(read) {
  const list = [{root: read.ledger.start.root, text: read.ledger.start.text, metadata: read.ledger.start.metadata,
    revision: read.ledger.start.revision, identity: null, index: 0}], records = read.ledger.records;
  let text = read.ledger.start.text, metadata = read.ledger.start.metadata;
  for (let i = 0; i < records.length; i++) {
    text = _rapierTransformSplices(text, records[i].splices);
    metadata = _rapierTransformMetadata(metadata, records[i].metadata);
    list.push({root: records[i].afterHash, text, metadata, revision: records[i].transaction.revision,
      identity: recordKey(records[i]), index: i + 1});
  }
  return list;
}
function kept(text) {
  const will = parseWill(text);
  if (will.fault) return {fault: will.fault, text};
  return will.regions.filter(region => region.law === 'keep').map(region => text.slice(region.start, region.end));
}
// A retained suffix can reuse a prefix only when an existing ledger proves its
// exact source, metadata, revision and path root. Export then rechecks the whole
// chain, including the boundary parent. No missing act is invented.
function expandRetainedStart(shorter, longer) {
  if (shorter.ledger.documentAuthority !== longer.ledger.documentAuthority ||
      shorter.ledger.start.revision <= longer.ledger.start.revision) return null;
  const start = shorter.ledger.start, point = checkpointList(longer).find(point =>
    point.revision === start.revision && point.root === start.root && point.text === start.text &&
    canonicalJSON(point.metadata) === canonicalJSON(start.metadata));
  if (!point) return null;
  try { return exportLedger({text: shorter.text, metadata: shorter.metadata,
    records: [...longer.ledger.records.slice(0, point.index), ...shorter.ledger.records],
    documentAuthority: shorter.ledger.documentAuthority, revision: shorter.revision, root: shorter.root,
    complete: longer.complete}); } catch (_) { return null; }
}

export function merge(first, second) {
  const ours = readLedger(first), theirs = readLedger(second);
  const expandedTheirs = expandRetainedStart(theirs, ours);
  if (expandedTheirs) return merge(ours.ledger, expandedTheirs);
  const expandedOurs = expandRetainedStart(ours, theirs);
  if (expandedOurs) {
    const result = merge(expandedOurs, theirs.ledger);
    // A refused join still returns the caller's exact retained envelope.
    return !result.clean && result.ledger.sha256 === expandedOurs.sha256
      ? {...result, ledger: ours.ledger} : result;
  }
  const localEffects = _rapierHistoryEffects(ours.ledger.records), incomingEffects = _rapierHistoryEffects(theirs.ledger.records);
  const localOrigins = authoredPlacements(ours.ledger.start.text, ours.ledger.records),
    incomingOrigins = authoredPlacements(theirs.ledger.start.text, theirs.ledger.records);
  const localIds = new Map(ours.ledger.records.map(record => [record.transaction.id, record])), unproved = new Set();
  for (const record of theirs.ledger.records) {
    const local = localIds.get(record.transaction.id);
    if (local && actFingerprint(local, localEffects) !== actFingerprint(record, incomingEffects)) return {text: ours.text, metadata: ours.metadata, ledger: ours.ledger,
      clean: false, conflicts: [{kind: 'identity', code: 'act_identity_conflict', actId: record.transaction.id}],
      review: {required: true, base: ours.text, proposed: theirs.text}};
    if (local && canonicalJSON(localOrigins.get(local.transaction.id)) !== canonicalJSON(incomingOrigins.get(record.transaction.id)))
      return {text: ours.text, metadata: ours.metadata, ledger: ours.ledger, clean: false,
        conflicts: [{kind: 'identity', code: 'act_order_conflict', actId: record.transaction.id}],
        review: {required: true, base: ours.text, proposed: theirs.text}};
    if (local && (canonicalJSON(local.splices) !== canonicalJSON(record.splices) ||
        canonicalJSON(local.metadata || {}) !== canonicalJSON(record.metadata || {}))) unproved.add(record.transaction.id);
  }
  const a = checkpointList(ours), b = checkpointList(theirs);
  // A synthetic conflict act has one identity derived from both original envelopes.
  // Reconstruct its exact local prefix to recognize a repeat without aliasing act IDs.
  for (const [index, record] of ours.ledger.records.entries()) {
    if (record.transaction.operation !== 'document.merge') continue;
    const point = a[index], prefix = exportLedger({text: point.text, metadata: point.metadata,
      records: ours.ledger.records.slice(0, index), documentAuthority: ours.ledger.documentAuthority,
      revision: point.revision, root: point.root, complete: ours.complete});
    if (record.transaction.id !== mergeIdentity(prefix.sha256, theirs.ledger.sha256)) continue;
    const clean = !ours.text.includes('<!-- note-conflict:v1 ');
    return {text: ours.text, metadata: ours.metadata, ledger: ours.ledger, clean, conflicts: [], review: {required: !clean, base: ours.text, proposed: ours.text}};
  }
  let common = null;
  for (let i = b.length - 1; i >= 0 && !common; i--) {
    if (theirs.ledger.records.slice(0, b[i].index).some(row => unproved.has(row.transaction.id))) continue;
    const found = a.findLast(point => !ours.ledger.records.slice(0, point.index).some(row => unproved.has(row.transaction.id)) && point.root === b[i].root && point.text === b[i].text && point.revision === b[i].revision &&
      point.identity === b[i].identity && canonicalJSON(point.metadata) === canonicalJSON(b[i].metadata));
    if (found) common = {ours: found.index, theirs: b[i].index, text: found.text, metadata: found.metadata};
  }
  if (!common) throw fault('copies have no proven common start');
  // A prior join can contain our acts in a different transported order. After
  // proving their placement below, keep the complete superset's representation.
  const incomingIds = new Set(theirs.ledger.records.map(row => row.transaction.id));
  const sameStart = ours.complete && theirs.complete && ours.ledger.documentAuthority === theirs.ledger.documentAuthority &&
    canonicalJSON(ours.ledger.start) === canonicalJSON(theirs.ledger.start);
  const oursContained = sameStart && [...localIds.keys()].every(id => incomingIds.has(id));
  const theirsContained = sameStart && [...incomingIds].every(id => localIds.has(id));
  const settled = read => ({text: read.text, metadata: read.metadata, ledger: read.ledger,
    clean: !read.text.includes('<!-- note-conflict:v1 '), conflicts: [],
    review: {required: read.text.includes('<!-- note-conflict:v1 '), base: ours.text, proposed: read.text}});
  if (oursContained && theirsContained) {
    if (ours.text !== theirs.text || canonicalJSON(ours.metadata) !== canonicalJSON(theirs.metadata))
      return {text: ours.text, metadata: ours.metadata, ledger: ours.ledger, clean: false,
        conflicts: [{kind: 'identity', code: 'act_order_conflict'}], review: {required: true, base: ours.text, proposed: theirs.text}};
  }
  const records = ours.ledger.records.slice(), imported = new Set(localIds.keys());
  let text = ours.text, metadata = {...ours.metadata}, root = ours.root;
  const append = (splices, original, effect = null, inverseIds = [], origin = original.authored) => {
    const next = _rapierTransformSplices(text, splices);
    if (next === null) return null;
    const beforeHash = root, revision = (records.at(-1)?.transaction.revision ?? ours.ledger.start.revision) + 1;
    let nextRoot = root;
    for (const row of splices) nextRoot = rootAfter(nextRoot, row);
    const {remoteTransactionId, sourceTransactionId, sourceTransactionIds, ...tx} = original.transaction;
    const record = {beforeHash, afterHash: nextRoot, splices, ...(origin ? {authored: origin} : {}), transaction: {
      ...tx, id: tx.id, documentAuthority: ours.ledger.documentAuthority,
      baseRevision: revision - 1, revision, actor: tx.actor, transport: tx.transport, operation: tx.operation, requestId: tx.requestId,
      sourceTransactionId: inverseIds.length === 1 ? inverseIds[0] : null,
      ...(inverseIds.length > 1 ? {sourceTransactionIds: inverseIds} : {}),
      ...(tx.turnId ? {turnId: tx.turnId} : {}), affectedBlockIds: tx.affectedBlockIds.slice(),
      parent: records.at(-1)?.transaction.id ?? null, reverts: null, reapplies: null, createdAt: tx.createdAt,
    }, ...(original.changeSet ? {changeSet: original.changeSet} : {}),
      ...(original.derivedCommentIndex == null ? {} : {derivedCommentIndex: original.derivedCommentIndex})};
    if (inverseIds.length) {
      const after = _rapierMetadataState(ours.ledger.start.metadata, [...records, record]);
      if (!after) return null;
      effect = _rapierMetadataDelta(metadata, after);
    }
    const nextMetadata = _rapierTransformMetadata(metadata, effect);
    if (!nextMetadata) return null;
    if (effect) record.metadata = effect;
    records.push(record); text = next; metadata = nextMetadata; root = nextRoot;
    return record.transaction.id;
  };
  let against = ours.ledger.records.slice(common.ours);
  const incoming = theirs.ledger.records.slice(common.theirs);
  // The same original ID is a repeat only after its immutable fingerprint agrees.
  const unseen = incoming.filter(record => !imported.has(record.transaction.id));
  const refused = (kind, code, details = {}) => ({text: ours.text, metadata: ours.metadata, ledger: ours.ledger,
    clean: false, conflicts: [{kind, code, ...details}],
    review: {required: true, base: ours.text, proposed: theirs.text}});
  const metadataConflict = (code, details) => refused('metadata', code, details);
  const incomingFields = new Set(unseen.flatMap(record => Object.keys(record.metadata || {})));
  const assignmentFields = (record, effects) => effects.references.get(record.transaction.id)?.length ? [] : Object.keys(record.metadata || {});
  const competingFields = (record, pending) => {
    const fields = new Set(pending.flatMap(row => assignmentFields(row, localEffects)));
    return assignmentFields(record, incomingEffects).filter(key => fields.has(key));
  };
  const mappedIds = new Map();
  for (const record of theirs.ledger.records) {
    const local = localIds.get(record.transaction.id);
    if (local) mappedIds.set(record.transaction.id, local.transaction.id);
  }
  const keepDiffers = canonicalJSON(kept(ours.text)) !== canonicalJSON(kept(theirs.text));
  let conflicted = keepDiffers && unseen.length > 0, incomingSource = common.text;
  if (!conflicted) for (const record of incoming) {
    const beforeSource = incomingSource;
    incomingSource = _rapierTransformSplices(incomingSource, record.splices);
    if (incomingSource === null) return refused('history', 'record_transport_conflict');
    if (imported.has(record.transaction.id)) {
      const index = against.findIndex(row => row.transaction.id === record.transaction.id);
      if (index < 0) return refused('identity', 'act_order_conflict', {actId: record.transaction.id});
      const preceding = against.slice(0, index), competing = competingFields(record, preceding);
      if (competing.length) return metadataConflict('metadata_assignment_conflict', {fields: competing});
      unproved.delete(record.transaction.id);
      against = against.filter(row => row.transaction.id !== record.transaction.id);
      continue;
    }
    const competing = competingFields(record, against);
    if (competing.length) return metadataConflict('metadata_assignment_conflict', {fields: competing});
    const references = incomingEffects.references.get(record.transaction.id) || [];
    const inverseIds = references.map(id => mappedIds.get(id));
    if (inverseIds.some(id => !id || !_rapierHistoryEffects(records).active.has(id))) return metadataConflict('inverse_target_unavailable');
    let moved;
    try { moved = transposeAuthored(ours.ledger.start.text, records, {...record, authored: incomingOrigins.get(record.transaction.id)},
      theirs.ledger.records.slice(0, theirs.ledger.records.indexOf(record)).map(row => row.transaction.id)); } catch (_) {}
    if (!moved || moved.submittedBefore !== beforeSource || moved.submitted !== incomingSource ||
      _rapierTransformSplices(text, moved.splices) === null) { conflicted = true; break; }
    const effect = record.metadata ? Object.fromEntries(Object.entries(record.metadata).map(([key, pair]) =>
      [key, {before: metadata[key], after: pair.after}])) : null;
    const origin = record.authored ?? (against.length ? incomingOrigins.get(record.transaction.id) : null);
    const mapped = append(moved.splices, record, effect, inverseIds, origin);
    if (!mapped) return metadataConflict(inverseIds.length ? 'inverse_target_unavailable' : 'record_transport_conflict');
    against = against.filter(row => row.transaction.id !== record.transaction.id);
    mappedIds.set(record.transaction.id, mapped);
  }
  if (!conflicted) {
    if (unproved.size) return refused('identity', 'act_order_conflict', {actId: unproved.values().next().value});
    if (theirsContained) {
      // Only equivalent proved states choose a representation, never competing authored values.
      return settled(oursContained && theirs.ledger.sha256 < ours.ledger.sha256 ? theirs : ours);
    }
    if (oursContained) {
      if (text !== theirs.text || canonicalJSON(metadata) !== canonicalJSON(theirs.metadata))
        return refused('identity', 'act_order_conflict');
      return settled(theirs);
    }
  }
  let conflicts = [];
  if (conflicted) {
    if (unseen.length !== incoming.length) return refused('history', 'record_transport_conflict');
    if (incomingFields.size || unseen.some(record => incomingEffects.references.get(record.transaction.id)?.length))
      return metadataConflict('record_transport_conflict', {fields: [...incomingFields]});
    // Restart from the original local head: partially transported records never leak into a conflict result.
    records.splice(ours.ledger.records.length); text = ours.text; metadata = {...ours.metadata}; root = ours.root;
    const merged = mergeText(keepDiffers ? null : common.text, ours.text, theirs.text, {oursId: 'copy-' + ours.ledger.sha256.slice(0, 16), theirsId: 'copy-' + theirs.ledger.sha256.slice(0, 16)});
    conflicts = merged.conflicts;
    // Text equality cannot replace the unproved original acts with a clean receipt.
    if (!conflicts.length) return refused('history', 'record_transport_conflict');
    if (merged.text !== text) append([{pos: 0, removed: text, inserted: merged.text}], {transaction: {
      id: mergeIdentity(ours.ledger.sha256, theirs.ledger.sha256), actor: {kind: 'system', id: 'merge'}, transport: 'platform', operation: 'document.merge', requestId: null,
      affectedBlockIds: [], createdAt: null}});
  }
  const ledger = exportLedger({text, metadata, records, documentAuthority: ours.ledger.documentAuthority, root,
    revision: records.at(-1)?.transaction.revision ?? ours.revision, complete: ours.complete});
  const clean = !conflicts.length && !text.includes('<!-- note-conflict:v1 ');
  return {text, metadata, ledger, clean, conflicts, review: {required: !clean, base: ours.text, proposed: text}};
}
