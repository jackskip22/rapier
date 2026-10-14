// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from '../kit/ledger/hash.mjs';

export const PRIVATE_LIVE_PROTOCOL = 'rapier-private-v1';
export const PRIVATE_LIVE_LIMITS = Object.freeze({
  frameBytes: 32 * 1024 * 1024, replayBytes: 1024 * 1024, storageBytes: 48 * 1024 * 1024,
  attachmentBytes: 2048, helloMs: 15000,
});
const utf8 = new TextEncoder();
export const privateInteger = (value, minimum = 0) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= minimum;
export const privateId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const privatePeer = value => typeof value === 'string' && /^peer_[a-f0-9]{32}$/.test(value);
export const privateDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const privateSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const privateCiphertext = value => typeof value === 'string' && value.length >= 39 &&
  value.length <= PRIVATE_LIVE_LIMITS.frameBytes && value.length % 4 !== 1 && /^[A-Za-z0-9_-]+$/.test(value);
export const privateJsonBytes = value => utf8.encode(JSON.stringify(value)).byteLength;
export const privateInitialHash = (id, ciphertext) => sha256(JSON.stringify([PRIVATE_LIVE_PROTOCOL, id, ciphertext]));
export const privateRecordHash = (previous, row) =>
  sha256(JSON.stringify([PRIVATE_LIVE_PROTOCOL, previous, row.gen, row.client, row.seq, row.ciphertext]));

export function privateBase64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32768)
    binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function privateUnbase64(value) {
  if (typeof value !== 'string' || !value || value.length > PRIVATE_LIVE_LIMITS.frameBytes ||
      value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('live_ciphertext_invalid');
  let bytes;
  try {bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));}
  catch {throw new Error('live_ciphertext_invalid');}
  if (privateBase64(bytes) !== value) throw new Error('live_ciphertext_invalid');
  return bytes;
}
