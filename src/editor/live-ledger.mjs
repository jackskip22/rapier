// SPDX-License-Identifier: AGPL-3.0-only
import {applySplices, parallelSplices} from '../kernel/live-merge.mjs';
import {exportLedger, readLedger} from '../kit/ledger/format.mjs';
import {canonicalJSON} from '../kit/ledger/data.mjs';
import {authoredHistory} from '../kit/ledger/transport.mjs';
import {placedLiveAct} from '../kernel/live-act.mjs';
import {textRoot, rootAfter} from '../kit/ledger/hash.mjs';
import {_rapierTransformSplices as transformSplices, _rapierReplayMetadata as replayMetadata,
  _rapierHistoryEffects as historyEffects, _rapierMetadataState as metadataState,
  _rapierMetadataDelta as metadataDelta} from '../kit/ledger/journal-records.mjs';

export function initialLiveLedger({documentId, source, filename, docKind = 'markdown'}) {
  return exportLedger({documentAuthority: documentId, text: source, metadata: {filename, docKind},
    records: [], revision: 0, root: textRoot(source), complete: true});
}

export function liveRows(source, splices) {
  const rows = splices.slice().reverse().map(row => ({pos: row.at,
    removed: source.slice(row.at, row.at + row.remove), inserted: row.insert}));
  if (transformSplices(source, rows) !== applySplices(source, splices)) throw new Error('live_canonical_source_invalid');
  return rows;
}

export function carriedLiveLedger(baseline, accepted, pending = [], expectedText) {
  const start = readLedger(baseline), records = start.ledger.records.slice();
  let text = start.text, root = start.root, revision = start.revision, metadata = {...start.metadata};
  for (const entry of [...accepted, ...pending]) {
    if (!entry.act || entry.act.id !== entry.actId || !entry.act.author || records.some(row => row.transaction.id === entry.act.id))
      throw new Error('live_canonical_act_invalid');
    const act = placedLiveAct(entry.act, entry.splices);
    const splices = liveRows(text, entry.splices), transaction = {
      id: act.id, documentAuthority: start.ledger.documentAuthority, baseRevision: revision, revision: revision + 1,
      actor: {...act.author}, transport: act.author.kind === 'agent' ? 'webmcp' : 'platform',
      operation: act.operation, requestId: null, sourceTransactionId: act.sourceTransactionId ?? null,
      affectedBlockIds: act.affectedBlockIds || [], parent: records.at(-1)?.transaction.id ?? null,
      reverts: act.reverts ?? null, reapplies: act.reapplies ?? null, createdAt: act.createdAt,
    };
    for (const key of ['sourceTransactionIds', 'turnId', 'turnLabel', 'label'])
      if (act[key] !== undefined) transaction[key] = structuredClone(act[key]);
    const record = {transaction, splices, beforeHash: root, afterHash: splices.reduce(rootAfter, root),
      ...(act.authored ? {authored: structuredClone(act.authored)} : {}),
      ...(act.metadata ? {metadata: structuredClone(act.metadata)} : {}),
      ...(Object.hasOwn(act, 'label') ? {changeSet: {label: act.label}} : {})};
    const effects = historyEffects([...records, record]);
    if (!effects.ok) throw new Error('live_canonical_effect_invalid');
    const nextMetadata = metadataState(start.ledger.start.metadata, [...records, record], effects);
    if (!nextMetadata) throw new Error('live_canonical_metadata_invalid');
    const effect = metadataDelta(metadata, nextMetadata, {assign: effects.references.get(act.id).length
      ? [] : Object.keys(act.metadata || {})});
    if (effect) record.metadata = effect; else delete record.metadata;
    if (!splices.length && !effect && !effects.references.get(act.id).length) continue;
    records.push(record); text = applySplices(text, entry.splices); root = record.afterHash; revision++; metadata = nextMetadata;
  }
  if (expectedText !== undefined && text !== expectedText) throw new Error('live_canonical_source_invalid');
  return exportLedger({documentAuthority: start.ledger.documentAuthority, text, metadata, records,
    revision, root, complete: start.complete});
}

export function appendLiveJournal(ledger, journal, source) {
  const records = [...ledger.records, structuredClone(journal)], metadata = replayMetadata(ledger.start.metadata, records);
  if (!metadata) throw new Error('live_local_metadata_invalid');
  return exportLedger({documentAuthority: ledger.documentAuthority, text: source, metadata, records,
    revision: journal.transaction.revision, root: journal.afterHash, complete: ledger.complete});
}

function liveRecordIdentity(record, origin = null) {
  const transaction = {...record.transaction}, value = {...record, transaction};
  if (origin) value.authored = origin;
  if (transaction.remoteTransactionId === transaction.id) delete transaction.remoteTransactionId;
  if (transaction.actor.kind === 'agent' && transaction.transport === 'webmcp') transaction.transport = 'platform';
  if (transaction.label === null) delete transaction.label;
  if (value.changeSet?.label === null && Object.keys(value.changeSet).length === 1) delete value.changeSet;
  return canonicalJSON(value);
}

export function liveLedgerPrefix(before, after) {
  readLedger(before); readLedger(after);
  if (before.documentAuthority !== after.documentAuthority || before.complete !== after.complete ||
      canonicalJSON(before.start) !== canonicalJSON(after.start) || before.records.length > after.records.length) return false;
  const origins = before.records.some(row => row.authored) || after.records.some(row => row.authored);
  const left = origins ? authoredHistory(before.start.text, before.records).origins : null;
  const right = origins ? authoredHistory(after.start.text, after.records).origins : null;
  return before.records.every((row, index) =>
    liveRecordIdentity(row, left?.get(row.transaction.id)) ===
    liveRecordIdentity(after.records[index], right?.get(after.records[index].transaction.id)));
}

export function liveLedgerPatch(before, after) {
  const from = readLedger(before), to = readLedger(after);
  if (before.documentAuthority !== after.documentAuthority || before.start.text !== after.start.text ||
      before.start.root !== after.start.root || before.start.revision !== after.start.revision)
    throw new Error('live_recovery_branch_unproven');
  let prefix = 0;
  while (prefix < before.records.length && prefix < after.records.length &&
      liveRecordIdentity(before.records[prefix]) === liveRecordIdentity(after.records[prefix])) prefix++;
  const rows = [];
  for (const record of before.records.slice(prefix).reverse()) for (const row of record.splices.slice().reverse())
    rows.push({pos: row.pos, removed: row.inserted, inserted: row.removed});
  for (const record of after.records.slice(prefix)) rows.push(...record.splices);
  if (transformSplices(from.text, rows) !== to.text) throw new Error('live_recovery_source_invalid');
  return liveRows(from.text, parallelSplices(from.text, rows));
}
