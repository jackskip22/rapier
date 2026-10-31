// SPDX-License-Identifier: AGPL-3.0-only
export const PAIRING_EXPIRY_BATCH = 32;
const expiryPrefix = 'pair-expiry:';
const timeKey = at => String(at).padStart(16, '0');
const first = entries => entries[Symbol.iterator]().next().value;

export class PairingStore {
  constructor(kv, epoch = 0) { this.kv = kv; this.epoch = epoch; }
  prefix(kind, epoch = this.epoch) { return 'pair:' + epoch + ':' + kind + ':'; }
  row(secretHash, epoch = this.epoch) { return this.kv.get(this.prefix('browser', epoch) + secretHash); }
  current(secretHash, now) {
    const row = this.row(secretHash);
    return row?.expiresAt > now ? row : null;
  }
  code(code, now) {
    const secretHash = this.kv.get(this.prefix('code') + code);
    return secretHash ? this.current(secretHash, now) : null;
  }
  phaseKey(row, epoch = this.epoch) {
    return this.prefix(row.confirmedAt ? 'confirmed' : 'waiting', epoch) + timeKey(row.expiresAt) + ':' + row.secretHash;
  }
  expiryKey(row, epoch = this.epoch) { return expiryPrefix + timeKey(row.expiresAt) + ':' + epoch + ':' + row.secretHash; }
  remove(row, epoch = this.epoch) {
    this.kv.delete(this.prefix('browser', epoch) + row.secretHash);
    if (this.kv.get(this.prefix('code', epoch) + row.code) === row.secretHash) this.kv.delete(this.prefix('code', epoch) + row.code);
    this.kv.delete(this.phaseKey(row, epoch));
    this.kv.delete(this.expiryKey(row, epoch));
  }
  put(row, now) {
    const codeOwner = this.kv.get(this.prefix('code') + row.code);
    if (codeOwner && codeOwner !== row.secretHash) {
      const previous = this.row(codeOwner);
      if (previous?.expiresAt > now) throw new Error('Pairing code is in use.');
      if (previous) this.remove(previous);
    }
    const previous = this.row(row.secretHash);
    if (previous) this.remove(previous);
    this.kv.put(this.prefix('browser') + row.secretHash, row);
    this.kv.put(this.prefix('code') + row.code, row.secretHash);
    this.kv.put(this.phaseKey(row), {secretHash: row.secretHash, expiresAt: row.expiresAt});
    this.kv.put(this.expiryKey(row), {epoch: this.epoch, secretHash: row.secretHash, expiresAt: row.expiresAt});
  }
  expire(now) {
    let removed = 0;
    for (const [key, held] of this.kv.list({prefix: expiryPrefix, end: expiryPrefix + timeKey(now + 1), limit: PAIRING_EXPIRY_BATCH})) {
      const row = this.row(held.secretHash, held.epoch);
      if (row && row.expiresAt === held.expiresAt) this.remove(row, held.epoch);
      else this.kv.delete(key);
      removed++;
    }
    return removed;
  }
  summary() {
    const waiting = first(this.kv.list({prefix: this.prefix('waiting'), reverse: true, limit: 1}))?.[1];
    const confirmed = first(this.kv.list({prefix: this.prefix('confirmed'), reverse: true, limit: 1}))?.[1];
    const latest = confirmed && this.row(confirmed.secretHash);
    const expiry = first(this.kv.list({prefix: expiryPrefix, limit: 1}))?.[1];
    return {codeUntil: waiting?.expiresAt || 0, confirmedUntil: latest?.expiresAt || 0,
      ownerRequired: !!latest && !latest.ownerApprovedAt, nextExpiry: expiry?.expiresAt || null};
  }
}
