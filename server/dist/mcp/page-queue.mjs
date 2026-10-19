// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from '../kit/ledger/hash.mjs';
import {resolveCaller} from '../agent/door-identity.mjs';
export const RELAY_LIMITS = Object.freeze({intents: 16, bytes: 256 * 1024, lifetimeMs: 24 * 60 * 60 * 1000});
const HEAD = 'relay:head';
const row = seq => 'relay:intent:' + String(seq).padStart(12, '0');
const encoder = new TextEncoder();
const bytesOf = value => encoder.encode(JSON.stringify(value)).byteLength;
const emptyHead = () => ({seq: 0, rows: []});
const identity = (operationId, agent) => {
  const caller = resolveCaller({actor: 'agent', principal: agent?.principal, requestId: operationId}, {transport: 'mcp'});
  return JSON.stringify([caller.transport, caller.actor, caller.principal, caller.invocationKey]);
};

function headOf(kv, now) {
  const head = kv.get(HEAD) || emptyHead();
  return {...head, rows: head.rows.filter(entry => entry.expiresAt > now)};
}

export function pendingReceipt(entry) {
  return {outcome: 'pending', reason: 'page_closed', pending: {kind: 'page', requestId: entry.id},
    hint: "Applies when the person's page opens; the person sees it as your act and can undo it.",
    expiresAt: new Date(entry.expiresAt).toISOString()};
}

export function queueIntent(kv, {intent, operationId = null, agent = null, same = intent, now = Date.now()} = {}) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new TypeError('An intent object is required');
  const head = headOf(kv, now), bytes = bytesOf(intent), work = sha256(JSON.stringify(same));
  if (operationId) {
    const prior = head.rows.find(entry => entry.operationId && identity(entry.operationId, entry.agent) === identity(operationId, agent));
    if (prior) return prior.work === work ? pendingReceipt(prior)
      : {outcome: 'refused', reason: 'operation_id_reused', hint: 'Use a new operation_id for different work.'};
  }
  if (head.rows.length >= RELAY_LIMITS.intents)
    return {outcome: 'refused', reason: 'page_queue_full', hint: `${RELAY_LIMITS.intents} edits are already waiting for the person's page. Ask them to open it (show), then continue.`};
  if (head.rows.reduce((sum, entry) => sum + entry.bytes, 0) + bytes > RELAY_LIMITS.bytes)
    return {outcome: 'refused', reason: 'page_queue_full', hint: "The waiting edits would exceed 256 KB. Ask the person to open the page (show), then continue."};
  const seq = head.seq + 1, entry = {seq, id: 'intent_' + crypto.randomUUID().replace(/-/g, ''), operationId, agent, bytes, work, at: now, expiresAt: now + RELAY_LIMITS.lifetimeMs};
  for (const gone of (kv.get(HEAD)?.rows || []).filter(old => old.expiresAt <= now)) kv.delete(row(gone.seq));
  kv.put(row(seq), {id: entry.id, intent, agent, at: now});
  kv.put(HEAD, {seq, rows: [...head.rows, entry]});
  return pendingReceipt(entry);
}

export function waitingIntents(kv, now = Date.now()) {
  return headOf(kv, now).rows.map(entry => ({...kv.get(row(entry.seq)), seq: entry.seq, operationId: entry.operationId, expiresAt: entry.expiresAt}))
    .filter(entry => entry.intent);
}

export function relayState(kv, now = Date.now()) {
  const rows = headOf(kv, now).rows;
  return {waiting: rows.length, bytes: rows.reduce((sum, entry) => sum + entry.bytes, 0), oldestAt: rows[0]?.at ?? null};
}

export function acknowledgeIntent(kv, id, now = Date.now()) {
  const head = kv.get(HEAD) || emptyHead(), entry = head.rows.find(item => item.id === id);
  if (!entry) return false;
  kv.delete(row(entry.seq));
  const rows = head.rows.filter(item => item.id !== id && item.expiresAt > now);
  for (const gone of head.rows.filter(item => item.id !== id && item.expiresAt <= now)) kv.delete(row(gone.seq));
  if (rows.length) kv.put(HEAD, {seq: head.seq, rows}); else kv.delete(HEAD);
  return true;
}

export function clearIntents(kv) {
  const head = kv.get(HEAD);
  if (!head) return 0;
  for (const entry of head.rows) kv.delete(row(entry.seq));
  kv.delete(HEAD);
  return head.rows.length;
}
