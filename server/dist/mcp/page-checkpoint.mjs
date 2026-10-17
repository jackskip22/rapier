// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from '../kit/ledger/hash.mjs';

const HEAD = 'checkpoint:head';
const chunkKey = id => 'checkpoint:chunk:' + id;
export const CHECKPOINT_MAX_CHARS = 8 * 1024 * 1024;

export function writeCheckpoint(kv, {revision, hash, filename, chunks}, {now = Date.now(), retentionMs}) {
  if (!Array.isArray(chunks) || !chunks.length || chunks.length > 512 || !/^[a-f0-9]{64}$/.test(hash || '') || !Number.isFinite(retentionMs))
    return {outcome: 'refused', reason: 'checkpoint_invalid'};
  let chars = 0;
  for (const chunk of chunks) {
    if (typeof chunk?.text !== 'string' || chunk.id !== sha256(chunk.text)) return {outcome: 'refused', reason: 'checkpoint_invalid'};
    chars += chunk.text.length;
  }
  if (chars > CHECKPOINT_MAX_CHARS) return {outcome: 'refused', reason: 'checkpoint_too_large'};
  const text = chunks.map(chunk => chunk.text).join('');
  if (sha256(text) !== hash) return {outcome: 'refused', reason: 'checkpoint_invalid'};
  const previous = kv.get(HEAD), ids = chunks.map(chunk => chunk.id);
  if (previous?.hash === hash && previous.revision === revision && previous.filename === filename && previous.expiresAt - now > retentionMs / 2)
    return {outcome: 'unchanged', revision};
  let written = 0;
  for (const chunk of chunks) if (kv.get(chunkKey(chunk.id)) === undefined) { kv.put(chunkKey(chunk.id), chunk.text); written++; }
  kv.put(HEAD, {revision, hash, filename, chunks: ids, at: now, expiresAt: now + retentionMs});
  const kept = new Set(ids);
  let removed = 0;
  for (const id of new Set(previous?.chunks || [])) if (!kept.has(id)) { kv.delete(chunkKey(id)); removed++; }
  return {outcome: 'ok', revision, rows: written + 1 + removed};
}

export function readCheckpoint(kv, now = Date.now()) {
  const head = kv.get(HEAD);
  if (!head || head.expiresAt <= now) return null;
  const parts = head.chunks.map(id => kv.get(chunkKey(id)));
  if (parts.some(part => typeof part !== 'string')) return null;
  return {text: parts.join(''), revision: head.revision, hash: head.hash, filename: head.filename, at: head.at};
}

export function deleteCheckpoint(kv) {
  const head = kv.get(HEAD);
  if (!head) return 0;
  for (const id of new Set(head.chunks)) kv.delete(chunkKey(id));
  kv.delete(HEAD);
  return head.chunks.length + 1;
}

export const CLOSED_READ_CHARS = 12000;
export function closedPageRead(kv, now = Date.now()) {
  const checkpoint = readCheckpoint(kv, now);
  if (!checkpoint) return {outcome: 'refused', reason: 'page_closed',
    hint: "The person's page is closed and left no copy to read. Ask them to open it: show hands over the link."};
  const whole = checkpoint.text.length <= CLOSED_READ_CHARS, last = checkpoint.text.charCodeAt(CLOSED_READ_CHARS - 1);
  const cut = CLOSED_READ_CHARS - (last >= 0xd800 && last <= 0xdbff ? 1 : 0);
  return {outcome: 'ok', text: whole ? checkpoint.text : checkpoint.text.slice(0, cut), complete: whole, revision: checkpoint.revision, source: 'checkpoint',
    checkpointAt: new Date(checkpoint.at).toISOString(),
    hint: 'This is the page as it was when it last closed; the person may have changed it since. Edits wait for the page.'};
}
