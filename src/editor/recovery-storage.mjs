// SPDX-License-Identifier: AGPL-3.0-only
import {canonicalParts, canonicalRowsParts, isOwnedLedger, jsonParts, jsonPartsKnown} from '../kit/ledger/data.mjs';
import {sha256Parts, sha256PartsAsync, textRoot} from '../kit/ledger/hash.mjs';
import {_rapierRecoveryStateFields} from './recovery-policy.mjs';

const integrity = value => {
  const [chars, fnv, adler] = textRoot(value).split(':');
  return {chars: Number(chars), fnv, adler};
};
function* historyDigestParts(undo) {
  const items = [undo.documentAuthority, undo.documentRevision, undo.sourceRootId, undo.historyComplete, undo.earliestRevision,
    undo.earliestHash, undo.documentMetadata, undo.earliestMetadata, undo.ledger, undo.branch, undo.cursor];
  yield '[';
  for (let i = 0; i < items.length; i++) { if (i) yield ','; yield* i === 8 ? canonicalRowsParts(items[i], 1) : canonicalParts(items[i], 1); }
  yield ']';
}
export function recoveryHistoryDigest(undo) { return sha256Parts(historyDigestParts(undo)); }
export function recoveryHistoryDigestAsync(undo, options = {}) {
  return globalThis.crypto?.subtle ? sha256PartsAsync(historyDigestParts(undo), options) : Promise.resolve(recoveryHistoryDigest(undo));
}
export function recoveryHeaderIntegrity(row) {
  const fields = [row.integritySchema, row.docId, row.slot || null,
    row.bodyKey || null, row.canonicalIntegrity || row.integrity, row.historyDigest || null,
    row.checkpointId || null, row.sourceRootId || null, row.seenCurrent === true,
    row.setAside === true, row.picture === true, _rapierRecoveryStateFields(row),
    row.authorityIntegrity || null, row.bom === true, row.bomIntegrity || null,
    Number(row.updatedAt || row.ts || 0)];
  if (row.encoding !== undefined || row.encodingIntegrity !== undefined)
    fields.push(row.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8', row.encodingIntegrity || null);
  return integrity(JSON.stringify(fields));
}
export function recoveryHeaderMatches(row) {
  if (!row || row.integritySchema !== 6 || Object.hasOwn(row, 'canonicalText') ||
      Object.hasOwn(row, 'markdown') || Object.hasOwn(row, 'undo') || Object.hasOwn(row, 'ledger')) return false;
  const expected = row.headerIntegrity, actual = recoveryHeaderIntegrity(row);
  return !!expected && expected.chars === actual.chars && expected.fnv === actual.fnv && expected.adler === actual.adler;
}
export function compactRecoveryLedger(ledger) {
  const {text, ...start} = ledger.start;
  return {...ledger, start};
}
export function recoveryBodyParts(text, undo = null, ledger = null, known = null) {
  if (ledger && isOwnedLedger(ledger) && typeof text === 'string' && text.isWellFormed())
    return ['{"text":' + JSON.stringify(text) + ',"ledger":' + JSON.stringify(compactRecoveryLedger(ledger)) + '}'];
  const body = ledger ? {text, ledger: compactRecoveryLedger(ledger)} : {text, undo};
  return known ? jsonPartsKnown(body, known) : jsonParts(body);
}
export function recoveryRecord(row, text, undo = null, ledger = null, body = null, known = null) {
  const {canonicalText, markdown, undo: _undo, ledger: _ledger, body: _body, ...header} = row;
  header.integritySchema = 6;
  header.body = body || new Blob(Array.from(recoveryBodyParts(text, undo, ledger, known)), {type: 'application/json'});
  header.headerIntegrity = recoveryHeaderIntegrity(header);
  return header;
}
export async function readRecoveryBody(header, {yield: yieldWork} = {}) {
  if (!recoveryHeaderMatches(header) || !(header.body instanceof Blob)) throw new Error('Saved recovery header could not be admitted');
  const raw = await header.body.text();
  if (!yieldWork) return parseRecoveryBody(raw);
  const body = recoveryBody(raw);
  let turn = performance.now();
  for (let at = 0; at < body.text.length;) {
    let end = Math.min(body.text.length, at + 65536);
    if (end < body.text.length && (body.text.charCodeAt(end - 1) & 0xfc00) === 0xd800 &&
        (body.text.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
    if (!body.text.slice(at, end).isWellFormed()) throw new Error('Saved recovery body could not be admitted');
    at = end;
    if (performance.now() - turn >= 4) { await yieldWork(); turn = performance.now(); }
  }
  return body;
}
function recoveryBody(raw) {
  const body = JSON.parse(raw);
  if (!body || typeof body.text !== 'string' || Object.keys(body).length !== 2 ||
      !(Object.hasOwn(body, 'undo') !== Object.hasOwn(body, 'ledger'))) throw new Error('Saved recovery body could not be admitted');
  return body;
}
export function parseRecoveryBody(raw) {
  const body = recoveryBody(raw);
  if (!body.text.isWellFormed()) throw new Error('Saved recovery body could not be admitted');
  return body;
}
