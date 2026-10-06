// SPDX-License-Identifier: MIT
import {readLedger, exportLedger, rootAfter} from './format.mjs';
import {_rapierTransformSplices} from './journal-records.mjs';
import {mergeText} from './text-merge.mjs';
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
function over(row, other) {
  // Equal-position insertions have no ordering evidence. Review, never a lexical winner.
  if (!row.removed.length && !other.removed.length && row.pos === other.pos) return null;
  const range = transportInterval(row.pos, row.pos + row.removed.length, [other]);
  return range ? {...row, pos: range.start} : null;
}
const recordKey = record => sha256(canonicalJSON(record));
const origin = record => record.transaction.sourceTransactionId?.startsWith('ledger:') ? record.transaction.sourceTransactionId : 'ledger:' + recordKey(record);
function checkpointList(read) {
  const list = [{root: read.ledger.start.root, text: read.ledger.start.text, index: 0}], records = read.ledger.records;
  let text = read.ledger.start.text;
  for (let i = 0; i < records.length; i++) { text = _rapierTransformSplices(text, records[i].splices); list.push({root: records[i].afterHash, text, index: i + 1}); }
  return list;
}
function kept(text) {
  const will = parseWill(text);
  if (will.fault) return {fault: will.fault, text};
  return will.regions.filter(region => region.law === 'keep').map(region => text.slice(region.start, region.end));
}
export function merge(first, second) {
  const ours = readLedger(first), theirs = readLedger(second);
  // A reviewed conflict receipt names the complete incoming envelope: it too is idempotent.
  if (ours.ledger.records.some(record => record.transaction.operation === 'document.merge' && record.transaction.sourceTransactionId === 'ledger:' + theirs.ledger.sha256)) {
    const clean = !ours.text.includes('<!-- note-conflict:v1 ');
    return {text: ours.text, ledger: ours.ledger, clean, conflicts: [], review: {required: !clean, base: ours.text, proposed: ours.text}};
  }
  const a = checkpointList(ours), b = checkpointList(theirs);
  let common = null;
  for (let i = b.length - 1; i >= 0 && !common; i--) {
    const found = a.findLast(point => point.root === b[i].root && point.text === b[i].text);
    if (found) common = {ours: found.index, theirs: b[i].index, text: found.text};
  }
  if (!common) throw fault('copies have no proven common start');
  const records = ours.ledger.records.slice(), imported = new Set(records.map(origin));
  let text = ours.text, root = ours.root;
  const append = (splices, actor, sourceId, operation, at) => {
    const next = _rapierTransformSplices(text, splices);
    if (next === null) throw fault('transported record failed replay');
    const beforeHash = root, revision = (records.at(-1)?.transaction.revision ?? ours.ledger.start.revision) + 1;
    for (const row of splices) root = rootAfter(root, row);
    records.push({beforeHash, afterHash: root, splices, transaction: {
      id: ours.ledger.documentAuthority.slice(0, 48) + ':merge:' + revision.toString(36), documentAuthority: ours.ledger.documentAuthority,
      baseRevision: revision - 1, revision, actor, transport: 'platform', operation, requestId: null,
      sourceTransactionId: sourceId, affectedBlockIds: [], parent: records.at(-1)?.transaction.id ?? null,
      reverts: null, reapplies: null, createdAt: at,
    }}); text = next;
  };
  let against = ours.ledger.records.slice(common.ours).flatMap(record => record.splices.map(row => ({...row})));
  const incoming = theirs.ledger.records.slice(common.theirs);
  // Complete repeats are detected by record content, never the revision ID (copies can reuse IDs).
  const unseen = incoming.filter(record => !imported.has(origin(record)));
  const keepDiffers = canonicalJSON(kept(ours.text)) !== canonicalJSON(kept(theirs.text));
  let conflicted = keepDiffers && unseen.length > 0;
  if (!conflicted && unseen.length && unseen.length !== incoming.length) conflicted = true; // partial receipt needs a common text merge
  if (!conflicted) for (const record of unseen) {
    const moved = [];
    for (const splice of record.splices) {
      let row = {...splice}; const nextAgainst = [];
      for (const other of against) {
        const next = over(row, other), otherNext = over(other, row);
        if (!next || !otherNext) { conflicted = true; break; }
        nextAgainst.push(otherNext); row = next;
      }
      if (conflicted) break;
      moved.push(row); against = nextAgainst;
    }
    if (conflicted || _rapierTransformSplices(text, moved) === null) { conflicted = true; break; }
    append(moved, record.transaction.actor, origin(record), record.transaction.operation, record.transaction.createdAt);
  }
  let conflicts = [];
  if (conflicted) {
    // Restart from the original local head: partially transported records never leak into a conflict result.
    records.splice(ours.ledger.records.length); text = ours.text; root = ours.root;
    const merged = mergeText(keepDiffers ? null : common.text, ours.text, theirs.text, {oursId: 'copy-' + ours.ledger.sha256.slice(0, 16), theirsId: 'copy-' + theirs.ledger.sha256.slice(0, 16)});
    conflicts = merged.conflicts;
    if (merged.text !== text) append([{pos: 0, removed: text, inserted: merged.text}], {kind: 'system', id: 'merge'},
      'ledger:' + theirs.ledger.sha256, 'document.merge', Math.max(0, ...incoming.map(record => record.transaction.createdAt)));
  }
  const ledger = exportLedger({text, records, documentAuthority: ours.ledger.documentAuthority, root,
    revision: records.at(-1)?.transaction.revision ?? ours.revision, complete: ours.complete});
  const clean = !conflicts.length && !text.includes('<!-- note-conflict:v1 ');
  return {text, ledger, clean, conflicts, review: {required: !clean, base: ours.text, proposed: text}};
}
