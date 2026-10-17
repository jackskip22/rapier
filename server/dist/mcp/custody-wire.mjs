// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from '../kit/ledger/hash.mjs';

export const CUSTODY_PROTOCOL = 'rapier-custody-v1';
export const CUSTODY_LIMITS = Object.freeze({diffBytes: 4096, turnMs: 25000, recallMs: 10000, renewMs: 86400000, handbackBytes: 24 * 1024 * 1024});
export const custodyBytes = value => utf8.encode(JSON.stringify(value)).byteLength;
const utf8 = new TextEncoder();
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

export const sourceHash = text => sha256(text);

export function viewChanged(before, after) {
  if (JSON.stringify(before.pointers) !== JSON.stringify(after.pointers)) return true;
  if (before.revision !== after.revision || before.text !== after.text || before.filename !== after.filename || before.docKind !== after.docKind || before.compare?.id !== after.compare?.id || before.compare?.revision !== after.compare?.revision) return true;
  const left = before.compare?.changes || [], right = after.compare?.changes || [];
  return left.length !== right.length || left.some((row, index) => row.id !== right[index].id || row.status !== right[index].status);
}

const MATERIAL = /"(?:kind|recognized)":"paint"|"mode":"water"|"strokes":|"actions":|"paintSample":|"return_id":|"figures":|"shapes":|"recipe":/;

export function relayable(input, head) {
  if (!plain(input) || !plain(input.args) || input.page || input.create === true || input.task || input.editorAuthorized === true ||
      input.humanTool === true || input.waitBound !== undefined || input.holdBound !== undefined || input.waitFor !== undefined) return false;
  if (input.operation === 'open' && ['text', 'filename', 'docKind', 'note', 'createToken'].some(key => input.args[key] !== undefined)) return false;
  if (!['read', 'edit', 'undo', 'open'].includes(input.operation)) return false;
  if (head && (head.viewIntent?.status === 'pending' || head.editorIntent || head.visualIntent || head.exportIntent || head.materialIntent ||
      head.materialOwner)) return false;
  if (input.operation === 'read' && (input.args.as === 'image' || head?.humanMessages?.length)) return false;
  return !MATERIAL.test(JSON.stringify(input.args));
}

export function boundedDiff(rows) {
  if (!rows.length) return [];
  const diff = rows.map(row => ({rev: row.revision, splices: row.splices.map(({pos, removed, inserted}) => ({pos, removed, inserted}))}));
  return utf8.encode(JSON.stringify(diff)).byteLength <= CUSTODY_LIMITS.diffBytes ? diff : null;
}

export function validAck(message) {
  if (!plain(message) || message.type !== 'ack' || typeof message.turn !== 'string' || !/^turn_[a-f0-9]{32}$/.test(message.turn)) return false;
  if (message.refused !== undefined) return typeof message.refused === 'string' && /^[a-z_]{1,64}$/.test(message.refused);
  const head = message.head;
  return plain(message.value) && typeof message.outcome === 'string' && message.outcome === (message.value.outcome || 'ok') &&
    integer(message.rev) && /^[a-f0-9]{64}$/.test(message.hash) && (message.act_id === null || typeof message.act_id === 'string') &&
    (message.diff === null || Array.isArray(message.diff) && utf8.encode(JSON.stringify(message.diff)).byteLength <= CUSTODY_LIMITS.diffBytes) &&
    plain(message.collaboration) && plain(head) && head.revision === message.rev && integer(head.version) && integer(head.chars) &&
    typeof head.documentId === 'string' && typeof head.filename === 'string' && typeof head.docKind === 'string';
}
