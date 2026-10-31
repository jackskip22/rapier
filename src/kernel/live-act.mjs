// SPDX-License-Identifier: AGPL-3.0-only
import {_rapierValidAuthored, _rapierValidMetadataEffect} from '../kit/ledger/journal-records.mjs';
import {authoredPlacement} from '../kit/ledger/transport.mjs';

const utf8 = new TextEncoder();
const fields = ['id', 'author', 'createdAt', 'operation', 'sourceTransactionId', 'sourceTransactionIds',
  'metadata', 'authored', 'turnId', 'turnLabel', 'label', 'affectedBlockIds', 'reverts', 'reapplies'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const text = (value, limit, empty = false) => typeof value === 'string' && (empty || value.length > 0) &&
  value.length <= limit && value.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(value);
const nullableId = value => value === null || text(value, 256);
const fail = reason => { throw Object.assign(new Error(reason), {code: reason}); };

export function validateLiveAct(value, {author, allowLocal = false} = {}) {
  if (!plain(value) || Object.keys(value).some(key => !fields.includes(key)) ||
      !['id', 'author', 'createdAt', 'operation'].every(key => Object.hasOwn(value, key)) ||
      !text(value.id, 256) || !text(value.operation, 96) ||
      !(value.createdAt === null || integer(value.createdAt)) || !plain(value.author) ||
      Object.keys(value.author).some(key => !['id', 'kind', 'name'].includes(key)) ||
      value.author.kind !== 'human' || !text(value.author.id, 160) ||
      value.author.name !== undefined && !text(value.author.name, 120) ||
      value.sourceTransactionId !== undefined && !nullableId(value.sourceTransactionId) ||
      value.sourceTransactionIds !== undefined && (!Array.isArray(value.sourceTransactionIds) ||
        !value.sourceTransactionIds.length || new Set(value.sourceTransactionIds).size !== value.sourceTransactionIds.length ||
        value.sourceTransactionIds.some(id => !text(id, 256))) ||
      value.sourceTransactionId && value.sourceTransactionIds && !value.sourceTransactionIds.includes(value.sourceTransactionId) ||
      value.turnId !== undefined && !text(value.turnId, 160) ||
      value.turnLabel !== undefined && !text(value.turnLabel, 120) ||
      value.label !== undefined && value.label !== null &&
        (typeof value.label !== 'string' || value.label.length > 120 || !value.label.isWellFormed()) ||
      value.affectedBlockIds !== undefined && (!Array.isArray(value.affectedBlockIds) || !value.affectedBlockIds.every(integer)) ||
      value.metadata !== undefined && !_rapierValidMetadataEffect(value.metadata) ||
      value.authored !== undefined && !_rapierValidAuthored(value.authored) ||
      value.reverts !== undefined && !nullableId(value.reverts) ||
      value.reapplies !== undefined && !nullableId(value.reapplies) || value.reverts && value.reapplies)
    fail('live_act_invalid');
  if (author && (author.kind !== 'human' || value.author.id !== author.id && !(allowLocal && value.author.id === 'local')))
    fail('live_act_author_invalid');
  if (utf8.encode(JSON.stringify(value)).byteLength > 32 * 1024 * 1024) fail('live_act_invalid');
  return structuredClone(value);
}

export function canonicalLiveAct(record, origin = null) {
  const tx = record?.transaction;
  if (!tx) fail('live_act_invalid');
  const value = {id: tx.id, author: {...tx.actor}, createdAt: tx.createdAt, operation: tx.operation};
  for (const key of ['sourceTransactionId', 'sourceTransactionIds', 'turnId', 'turnLabel', 'label',
    'affectedBlockIds', 'reverts', 'reapplies']) if (tx[key] !== undefined) value[key] = tx[key];
  if (record.changeSet && Object.hasOwn(record.changeSet, 'label')) value.label = record.changeSet.label;
  if (record.metadata !== undefined) value.metadata = record.metadata;
  if (record.authored !== undefined) value.authored = record.authored;
  else if (origin) value.authored = authoredPlacement(origin.source, record.splices, origin.basis);
  return validateLiveAct(value);
}

export function placedLiveAct(act, splices) {
  if (!act?.authored || act.reverts || act.reapplies || act.sourceTransactionId || act.sourceTransactionIds) return act;
  const removed = splices.reduce((sum, row) => sum + row.remove, 0);
  if (removed === act.authored.splices.reduce((sum, row) => sum + row.removed.length, 0)) return act;
  const {authored: _, ...placed} = act;
  return placed;
}
