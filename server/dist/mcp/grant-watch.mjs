// SPDX-License-Identifier: AGPL-3.0-only
import {grantRecordCurrent, oauthGrantCurrent, validGrantReference} from './oauth.mjs';
import {storeShard} from './oauth-store.mjs';

export const GRANT_VERDICT_MS = 60_000;
const WATCHERS = 64;
const ADDRESS = /^[a-f0-9]{64}$/;
const grantKey = reference => 'grant:' + reference.ownerId + ':' + reference.grantId;

export class GrantVerdicts {
  constructor(env) { this.env = env; this.verdicts = new Map(); this.address = null; }

  learn(address) { if (ADDRESS.test(address || '')) this.address = address; }

  async current(reference, {remembered = false, now = Date.now()} = {}) {
    if (!validGrantReference(reference)) return false;
    const key = grantKey(reference), held = this.verdicts.get(key);
    if (held?.revoked) return false;
    if (remembered && held && held.until > now && held.reference === JSON.stringify(reference)) return held.ok;
    const objects = this.env.BUDGET;
    if (!objects?.get || !objects?.idFromName || !this.address) return oauthGrantCurrent(reference, this.env);
    const response = await objects.get(objects.idFromName(storeShard(key))).fetch(new Request('https://rapier.internal/oauth-store',
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op: 'watch', key, workspace: this.address})}));
    if (!response.ok) throw new Error('The grant record is unavailable.');
    const answer = await response.json();
    if (this.verdicts.get(key)?.revoked) return false;
    if (answer.state === 'unknown') return oauthGrantCurrent(reference, this.env);
    let record = null;
    try { record = answer.state === 'value' ? JSON.parse(answer.value) : null; } catch { record = null; }
    const ok = grantRecordCurrent(reference, record, this.env);
    const expires = Number.isSafeInteger(record?.expiresAt) ? record.expiresAt * 1000 : Infinity;
    this.verdicts.set(key, {ok, until: Math.min(now + GRANT_VERDICT_MS, expires), reference: JSON.stringify(reference)});
    return ok;
  }

  revoked(key) {
    if (typeof key !== 'string' || !/^grant:[^:]+:[^:]+$/.test(key)) return false;
    this.verdicts.set(key, {revoked: true});
    return true;
  }
}

export function watchGrant(ctx, {key, workspace}) {
  const kv = ctx.storage.kv, row = 'w:' + key;
  if (typeof key !== 'string' || !key.startsWith('grant:') || !ADDRESS.test(workspace || '')) return null;
  const watchers = kv.get(row) || [];
  if (!watchers.includes(workspace)) kv.put(row, [...watchers, workspace].slice(-WATCHERS));
  return true;
}

export async function tellRevoked(ctx, env, key) {
  const kv = ctx.storage.kv, row = 'w:' + key, watchers = kv.get(row);
  if (!Array.isArray(watchers) || !watchers.length) return 0;
  kv.delete(row);
  if (!env?.DOCUMENTS?.get) return 0;
  const told = await Promise.allSettled(watchers.map(address => env.DOCUMENTS.get(env.DOCUMENTS.idFromName(address))
    .fetch(new Request('https://rapier.internal/grant-revoked', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key})}))));
  return told.filter(row => row.status === 'fulfilled' && row.value.ok).length;
}
