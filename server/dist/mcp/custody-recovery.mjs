// SPDX-License-Identifier: AGPL-3.0-only
import {chunkText} from '../agent/checkpoint.mjs';
import {sha256} from '../kit/ledger/hash.mjs';

export const RECOVERY_LIMIT = 8 * 1024 * 1024;
const utf8 = new TextEncoder();
const validHash = value => /^[a-f0-9]{64}$/.test(value || '');

export const durableCustody = value => ({...value, state: {...value.state, humanContexts: {}, contextSequences: {}, clock: 0}});

export function custodyRecovery(value) {
  const text = JSON.stringify(durableCustody(value));
  if (utf8.encode(text).byteLength > RECOVERY_LIMIT) throw new RangeError('custody_recovery_too_large');
  const chunks = chunkText(text);
  return {hash: sha256(text), ids: chunks.map(row => row.id), chunks: new Map(chunks.map(row => [row.id, row.text]))};
}

export function recoveryFrame(value, previous = null) {
  const next = custodyRecovery(value);
  return {next, frame: {type: 'durable', base: previous?.hash || null, hash: next.hash, ids: next.ids,
    chunks: [...next.chunks].filter(([id]) => !previous?.chunks.has(id)).map(([id, text]) => ({id, text}))}};
}

export function recoverFrame(frame, previous = null) {
  if (!frame || frame.type !== 'durable' || frame.base !== (previous?.hash || null) || !validHash(frame.hash) ||
      !Array.isArray(frame.ids) || !frame.ids.length || frame.ids.length > 1024 || !frame.ids.every(validHash) ||
      !Array.isArray(frame.chunks) || frame.chunks.length > 1024) throw new Error('custody_recovery_invalid');
  const chunks = new Map(); let bytes = 0;
  for (const row of frame.chunks) {
    if (!row || typeof row.text !== 'string' || row.text.length > 128 * 1024 + 2 || row.id !== sha256(row.text) || chunks.has(row.id))
      throw new Error('custody_recovery_invalid');
    chunks.set(row.id, row.text);
  }
  const parts = frame.ids.map(id => {
    const part = chunks.get(id) ?? previous?.chunks.get(id);
    if (typeof part !== 'string') throw new Error('custody_recovery_missing');
    bytes += utf8.encode(part).byteLength;
    if (bytes > RECOVERY_LIMIT) throw new RangeError('custody_recovery_too_large');
    return part;
  });
  const text = parts.join('');
  if (sha256(text) !== frame.hash) throw new Error('custody_recovery_invalid');
  return {value: JSON.parse(text), next: {hash: frame.hash, ids: frame.ids, chunks: new Map(frame.ids.map((id, index) => [id, parts[index]]))}};
}
