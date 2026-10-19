// SPDX-License-Identifier: AGPL-3.0-only
import {canonicalParts, jsonParts} from '../kit/ledger/data.mjs';
import {sha256Parts, textRoot} from '../kit/ledger/hash.mjs';
import {_rapierRecoveryStateFields} from './recovery-policy.mjs';

const integrity = value => {
  const [chars, fnv, adler] = textRoot(value).split(':');
  return {chars: Number(chars), fnv, adler};
};
export function recoveryHistoryDigest(undo) {
  return sha256Parts(canonicalParts([undo.documentAuthority, undo.documentRevision,
    undo.sourceRootId, undo.historyComplete, undo.earliestRevision, undo.earliestHash,
    undo.documentMetadata, undo.earliestMetadata, undo.ledger, undo.branch, undo.cursor]));
}
export function recoveryHeaderIntegrity(row) {
  return integrity(JSON.stringify([row.integritySchema, row.docId, row.slot || null,
    row.bodyKey || null, row.canonicalIntegrity || row.integrity, row.historyDigest || null,
    row.checkpointId || null, row.sourceRootId || null, row.seenCurrent === true,
    row.setAside === true, row.picture === true, _rapierRecoveryStateFields(row),
    row.authorityIntegrity || null, row.bom === true, row.bomIntegrity || null,
    Number(row.updatedAt || row.ts || 0)]));
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
export function recoveryBodyParts(text, undo = null, ledger = null) {
  return jsonParts(ledger ? {text, ledger: compactRecoveryLedger(ledger)} : {text, undo});
}
export function recoveryRecord(row, text, undo = null, ledger = null, body = null) {
  const {canonicalText, markdown, undo: _undo, ledger: _ledger, body: _body, ...header} = row;
  header.integritySchema = 6;
  header.body = body || new Blob(Array.from(recoveryBodyParts(text, undo, ledger)), {type: 'application/json'});
  header.headerIntegrity = recoveryHeaderIntegrity(header);
  return header;
}
export async function readRecoveryBody(header) {
  if (!recoveryHeaderMatches(header) || !(header.body instanceof Blob)) throw new Error('Saved recovery header could not be admitted');
  return parseRecoveryBody(await header.body.text());
}
export function parseRecoveryBody(raw) {
  const body = JSON.parse(raw);
  if (!body || typeof body.text !== 'string' || /[\uD800-\uDFFF]/u.test(body.text) || Object.keys(body).length !== 2 ||
      !(Object.hasOwn(body, 'undo') !== Object.hasOwn(body, 'ledger'))) throw new Error('Saved recovery body could not be admitted');
  return body;
}
