import {exactBytes, sha256} from './integrity.mjs';

export const DELETE_FRAME_BYTES = 4096;
export const DELETE_HEADER_BYTES = 256;
export const DELETE_RESERVE_FILE = '.rapier-delete-reserve.bin';
const PAYLOAD_END = DELETE_FRAME_BYTES - 64;
const MAX_RESERVE = 64 * 1024 * 1024;
const fail = (code, message) => Object.assign(new Error(message), {code});
const equal = (a, b) => a != null && b != null && a.length === b.length && a.every((byte, i) => byte === b[i]);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const namespace = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
const noteId = value => { if (typeof value !== 'string') return false; const match = /^([^:]+):([1-9][0-9]*)$/.exec(value); return !!match && namespace(match[1]) && Number.isSafeInteger(Number(match[2])); };
const decode = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
export function deleteFrameName(slot) {
 if (slot !== 0 && slot !== 1) throw fail('delete-frame', 'Invalid deletion frame.');
 return '.rapier-delete-' + slot + '.bin';
}
export function isDeletePrivateName(name) {
 return typeof name === 'string' && /^(?:\.rapier-delete-[01]\.bin|\.rapier-delete-reserve\.bin|\.rapier-delete-[a-f0-9]{32}\.held)$/.test(name);
}
export function isDeleteOwnedName(name) {
 if (typeof name !== 'string') return false;
 const manifest = /^history\/manifests\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}!([1-9][0-9]*)\.json$/.exec(name);
 return /^\.rapier-delete-[a-f0-9]{32}\.held$/.test(name) || /^history\/(?:texts|blobs)\/[a-f0-9]{64}$/.test(name) || !!manifest && Number.isSafeInteger(Number(manifest[1]));
}
function ownerOf(index) {
 const owner = index?.deleteOwner || index?.folderDeviceId;
 if (typeof owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(owner)) throw fail('delete-owner', 'Deletion recovery needs this folder’s durable identity.');
 return owner;
}
function header(owner, kind) {
 const bytes = exactBytes(JSON.stringify({type: 'rapier-delete', version: 1, owner, kind}));
 if (bytes.length >= DELETE_HEADER_BYTES) throw fail('delete-frame', 'Deletion ownership does not fit its fixed header.');
 const out = new Uint8Array(DELETE_HEADER_BYTES); out.set(bytes); return out;
}
function owned(bytes, owner, kind, size = null) {
 return bytes != null && (size === null || bytes.length === size) && bytes.length >= DELETE_HEADER_BYTES && equal(bytes.subarray(0, DELETE_HEADER_BYTES), header(owner, kind));
}
async function encode(owner, slot, record) {
 const payload = exactBytes(JSON.stringify(record));
 if (payload.length > PAYLOAD_END - DELETE_HEADER_BYTES - 4) throw fail('delete-capacity', 'This deletion cannot fit its bounded recovery record. Nothing was removed.');
 const out = new Uint8Array(DELETE_FRAME_BYTES); out.set(header(owner, slot));
 new DataView(out.buffer).setUint32(DELETE_HEADER_BYTES, payload.length);
 out.set(payload, DELETE_HEADER_BYTES + 4); out.set(exactBytes(await sha256(payload)), PAYLOAD_END); return out;
}
async function payload(bytes) {
 try {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(DELETE_HEADER_BYTES);
  if (length < 1 || length > PAYLOAD_END - DELETE_HEADER_BYTES - 4) return null;
  const body = bytes.subarray(DELETE_HEADER_BYTES + 4, DELETE_HEADER_BYTES + 4 + length);
  if (decode(bytes.subarray(PAYLOAD_END)) !== await sha256(body)) return null;
  const record = JSON.parse(decode(body));
  if (!record || typeof record !== 'object' || Array.isArray(record) || !Number.isSafeInteger(record.sequence) || record.sequence < 0 || !['idle', 'admitted', 'detached', 'cancelled'].includes(record.phase)) return null;
  if (record.phase !== 'idle' && (!hex(record.baseDigest) || !hex(record.digest) || !hex(record.fileDigest) || !hex(record.reserveDigest) || !Number.isSafeInteger(record.reserveLength) || record.reserveLength < DELETE_HEADER_BYTES || record.reserveLength > MAX_RESERVE || !Number.isSafeInteger(record.at) || record.at < 0 || !noteId(record.id) || !noteId(record.opId) || !namespace(record.device) || !record.opId.startsWith(record.device + ':') || !Number.isSafeInteger(record.counter) || record.counter !== Number(record.opId.split(':')[1]) + 1 || record.sync !== undefined && record.sync !== true || record.checkpoint !== undefined && (typeof record.checkpoint !== 'string' || record.checkpoint.length > 256) || !/^[a-f0-9]{32}$/.test(record.token))) return null;
  return record;
 } catch (_) { return null; }
}
export function createDeleteIntent(store) {
 const api = store?.deletePressure;
 if (!api) return null;
 const read = async index => {
  let slots;
  try { slots = await Promise.all([0, 1].map(slot => api.read(deleteFrameName(slot)))); }
  catch (error) { if (store.deletePressure == null) return {slots: [null, null], slot: -1, record: null, unsupported: true}; throw error; }
  if (slots.every(bytes => bytes == null)) return {slots, slot: -1, record: null};
  const owner = ownerOf(index), records = [];
  for (let slot = 0; slot < 2; slot++) {
   if (slots[slot] == null) continue;
   if (!owned(slots[slot], owner, slot, DELETE_FRAME_BYTES)) throw fail('delete-custody', 'An unknown deletion-frame occupant was kept. Recovery needs attention.');
   const record = await payload(slots[slot]); if (record) records.push({slot, record});
  }
  if (!records.length) throw fail('delete-corrupt', 'Both deletion records are unreadable. Every remaining file was kept.');
  if (records.length === 2 && records[0].record.sequence === records[1].record.sequence && JSON.stringify(records[0].record) !== JSON.stringify(records[1].record)) throw fail('delete-corrupt', 'Deletion records disagree at the same sequence. Every remaining file was kept.');
  records.sort((a, b) => b.record.sequence - a.record.sequence);
  return {slots, ...records[0]};
 };
 const transition = async (index, prior, record, reserve = null) => {
  const current = await read(index);
  if (current.slot !== prior.slot || JSON.stringify(current.record) !== JSON.stringify(prior.record) || current.slots.some((bytes, i) => bytes == null ? prior.slots[i] != null : !equal(bytes, prior.slots[i]))) throw fail('delete-changed', 'The deletion record changed. Its files were kept.');
  const sequence = (current.record?.sequence ?? -1) + 1;
  if (!Number.isSafeInteger(sequence)) throw fail('delete-capacity', 'The deletion sequence is exhausted.');
  const slot = current.slot === 0 ? 1 : 0, next = {...record, sequence};
  const bytes = await encode(ownerOf(index), slot, next);
  if (!await api.writeFrame(slot, current.slots[slot], bytes, {releaseReserve: reserve})) throw fail('delete-changed', 'The deletion admission changed. Nothing else was removed.');
  const confirmed = await read(index);
  if (confirmed.slot !== slot || JSON.stringify(confirmed.record) !== JSON.stringify(next)) throw fail('delete-verify', 'The deletion record did not survive readback. No removal was admitted.');
  return confirmed;
 };
 const reserveBytes = (owner, size) => { const bytes = new Uint8Array(size); bytes.set(header(owner, 'reserve')); return bytes; };
 const validReserve = (bytes, index) => owned(bytes, ownerOf(index), 'reserve') && bytes.subarray(DELETE_HEADER_BYTES).every(byte => byte === 0);
 const arm = async (index, byteLength) => {
  if (!Object.keys(index.notes || {}).length) return false;
  let state = await read(index);
  if (state.unsupported) return false;
  if (state.record && state.record.phase !== 'idle') return false;
  for (let n = 0; n < 2 && state.slots.some(bytes => bytes == null); n++) state = await transition(index, state, {phase: 'idle'});
  if (!(await Promise.all(state.slots.map(payload))).every(Boolean)) state = await transition(index, state, {phase: 'idle'});
  const size = Math.max(DELETE_FRAME_BYTES, byteLength * 2 + 8192);
  if (!Number.isSafeInteger(size) || size > MAX_RESERVE) return false;
  const held = await api.read(DELETE_RESERVE_FILE);
  if (held != null && !validReserve(held, index)) throw fail('delete-custody', 'An unknown checkpoint-reserve occupant was kept.');
  if (held?.length >= size) return true;
  const bytes = reserveBytes(ownerOf(index), size);
  if (!await api.reserve(held, bytes) || !equal(bytes, await api.read(DELETE_RESERVE_FILE))) throw fail('delete-verify', 'Checkpoint headroom could not be reserved.');
  return true;
 };
 const admit = async (index, record, requiredBytes) => {
  const state = await read(index);
  if (state.record?.phase !== 'idle' || state.slots.some(bytes => bytes == null)) throw fail('delete-unarmed', 'Low-space deletion is not armed. Free some space and try again. Nothing was removed.');
  const reserve = await api.read(DELETE_RESERVE_FILE);
  if (!validReserve(reserve, index) || reserve.length < requiredBytes + 8192) throw fail('delete-capacity', 'There is not enough reserved checkpoint space for this deletion. Nothing was removed.');
  return transition(index, state, {...record, phase: 'admitted', reserveLength: reserve.length, reserveDigest: await sha256(reserve)}, reserve);
 };
 const releaseReserve = async record => {
  const held = await api.read(DELETE_RESERVE_FILE);
  if (held == null) return;
  if (held.length !== record.reserveLength || await sha256(held) !== record.reserveDigest || !await api.releaseReserve(held)) throw fail('delete-custody', 'The checkpoint reserve changed. It was kept.');
 };
 const capture = async () => {
  const entries = new Map();
  for (const name of [deleteFrameName(0), deleteFrameName(1), DELETE_RESERVE_FILE]) { const bytes = await api.read(name); if (bytes != null) entries.set(name, bytes); }
  return entries;
 };
 return {read, transition, arm, admit, releaseReserve, capture, api,
  retire: (index, state) => transition(index, state, {phase: 'idle'}),
  heldName: record => '.rapier-delete-' + record.token + '.held'};
}

// filename alone never licenses dropping somebody's bytes or importing authority.
export async function deleteIdleScratch(index, names, readBytes) {
 const privateNames = names.filter(isDeletePrivateName), omitted = new Set();
 if (!privateNames.length) return omitted;
 if (privateNames.some(name => name.endsWith('.held'))) throw fail('delete-custody', 'A held deletion file is recovery custody, not idle backup scratch.');
 if (![0, 1].every(slot => privateNames.includes(deleteFrameName(slot)))) throw fail('delete-custody', 'Unpaired deletion scratch cannot be omitted or restored.');
 const intent = createDeleteIntent({deletePressure: {read: readBytes}}), state = await intent.read(index);
 if (!state.record || state.record.phase !== 'idle' || state.slots.some(bytes => bytes == null) || !(await Promise.all(state.slots.map(payload))).every(Boolean)) throw fail('delete-pending', 'Deletion recovery must finish before a normal backup or restore.');
 for (const slot of [0, 1]) omitted.add(deleteFrameName(slot));
 if (privateNames.includes(DELETE_RESERVE_FILE)) {
  const reserve = await readBytes(DELETE_RESERVE_FILE);
  if (!owned(reserve, ownerOf(index), 'reserve') || reserve.length > MAX_RESERVE || !reserve.subarray(DELETE_HEADER_BYTES).every(byte => byte === 0)) throw fail('delete-custody', 'An unknown checkpoint reserve was kept.');
  omitted.add(DELETE_RESERVE_FILE);
 }
 return omitted;
}
