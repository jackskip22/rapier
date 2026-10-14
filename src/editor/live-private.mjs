// SPDX-License-Identifier: AGPL-3.0-only
import {generateVdk, seal, open} from '../notes/vault.mjs';
import {applyEdit} from '../kernel/live-merge.mjs';
import {validateLiveAct} from '../kernel/live-act.mjs';
import {readLedger} from '../kit/ledger/format.mjs';
import {_rapierHistoryEffects as historyEffects} from '../kit/ledger/journal-records.mjs';
import {initialLiveLedger, liveRows} from './live-ledger.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {PRIVATE_LIVE_PROTOCOL, privateId, privatePeer, privateInteger, privateDigest, privateSecret,
  privateCiphertext, privateBase64, privateUnbase64, privateInitialHash, privateRecordHash} from '../kernel/live-private-wire.mjs';

const utf8 = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed, required = allowed) => plain(value) && required.every(name => Object.hasOwn(value, name)) &&
  Object.keys(value).every(name => allowed.includes(name));
const name = value => typeof value === 'string' && value.length > 0 && [...value].length <= 80 && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value);
const fail = reason => {throw new Error(reason);};
function domain(config, kind, client = '', seq = 0) {
  if (!privateId(config?.id) || !privateSecret(config?.key) || !['initial', 'edit', 'presence'].includes(kind) ||
      kind !== 'initial' && !privatePeer(client) || !privateInteger(seq)) fail('live_private_binding_invalid');
  return JSON.stringify([PRIVATE_LIVE_PROTOCOL, config.id, kind, client, seq]);
}
export async function sealPrivate(config, kind, value, client, seq) {
  const aad = domain(config, kind, client, seq), key = privateUnbase64(config.key), bytes = utf8.encode(JSON.stringify(value));
  if (key.length !== 32) fail('live_private_key_invalid');
  try {return privateBase64(await seal(key, aad, bytes));}
  finally {key.fill(0); bytes.fill(0);}
}
export async function openPrivate(config, kind, ciphertext, client, seq) {
  const aad = domain(config, kind, client, seq), key = privateUnbase64(config.key);
  if (key.length !== 32 || !privateCiphertext(ciphertext)) fail('live_private_key_invalid');
  const envelope = privateUnbase64(ciphertext);
  let bytes;
  try {
    bytes = await open(key, aad, envelope);
    return JSON.parse(decoder.decode(bytes));
  } finally {key.fill(0); envelope.fill(0); bytes?.fill(0);}
}
export async function createPrivateInvitation(value) {
  const initial = privateInitial(value), id = crypto.randomUUID().replaceAll('-', '');
  const key = privateBase64(generateVdk()), access = privateBase64(generateVdk()), owner = privateBase64(generateVdk());
  const {source: _source, ...payload} = initial;
  const ciphertext = await sealPrivate({id, key}, 'initial', payload);
  return {id, key, access, owner, request: {version: 1, id, accessHash: sha256(access), ownerHash: sha256(owner), ciphertext}};
}
export function privateInitial(value) {
  if (!fields(value, ['documentId', 'filename', 'docKind', 'source', 'ledger'], ['documentId', 'filename', 'docKind']) || typeof value.documentId !== 'string' ||
      !value.documentId || typeof value.filename !== 'string' || !value.filename || typeof value.docKind !== 'string' ||
      !value.docKind || value.source !== undefined && (typeof value.source !== 'string' || /[\uD800-\uDFFF]/u.test(value.source)) ||
      !value.ledger && typeof value.source !== 'string') fail('live_private_initial_invalid');
  const checked = readLedger(value.ledger || initialLiveLedger(value), value.source,
    {filename: value.filename, docKind: value.docKind});
  if (checked.ledger.documentAuthority !== value.documentId) fail('live_private_initial_invalid');
  return {documentId: value.documentId, filename: value.filename, docKind: value.docKind,
    source: checked.text, ledger: checked.ledger};
}
export function privateAuthor(client, label) {
  if (!privatePeer(client) || !name(label)) fail('live_private_author_invalid');
  return {id: client, name: label, kind: 'human'};
}
export async function openPrivateInitial(config, ciphertext, expectedDigest) {
  const digest = privateInitialHash(config.id, ciphertext);
  if (expectedDigest && expectedDigest !== digest) fail('live_private_initial_changed');
  return {initial: privateInitial(await openPrivate(config, 'initial', ciphertext)), digest};
}
export async function openPrivatePresence(config, message) {
  if (!privatePeer(message?.client) || !privateCiphertext(message.ciphertext)) fail('live_private_presence_invalid');
  const value = await openPrivate(config, 'presence', message.ciphertext, message.client);
  if (!fields(value, ['gen', 'anchor', 'head', 'composing', 'author']) || !privateInteger(value.gen) ||
      !privateInteger(value.anchor) || !privateInteger(value.head) ||
      !fields(value.author, ['id', 'kind', 'name']) || value.author.id !== message.client || value.author.kind !== 'human' ||
      !name(value.author.name) || value.composing !== false &&
      (!fields(value.composing, ['anchor', 'head']) || !privateInteger(value.composing.anchor) || !privateInteger(value.composing.head)))
    fail('live_private_presence_invalid');
  return {client: message.client, ...value};
}
export async function openPrivateRecord(config, message, model, transcript) {
  if (!privateInteger(message?.gen, 1) || message.gen !== model.gen + 1 || !privatePeer(message.client) ||
      !privateInteger(message.seq, 1) || !privateCiphertext(message.ciphertext) || !privateDigest(message.previous) ||
      !privateDigest(message.digest) || message.previous !== transcript ||
      privateRecordHash(message.previous, message) !== message.digest) fail('live_private_transcript_mismatch');
  const value = await openPrivate(config, 'edit', message.ciphertext, message.client, message.seq);
  if (!fields(value, ['type', 'seq', 'gen', 'splices', 'undoTarget', 'undoes', 'act', 'prejoin'],
      ['type', 'seq', 'gen', 'splices', 'act']) || value.type !== 'edit' || value.seq !== message.seq ||
      !privateInteger(value.gen) || !Array.isArray(value.splices) || value.prejoin !== undefined && value.prejoin !== true)
    fail('live_private_record_invalid');
  const immutable = validateLiveAct(value.act, {author: {kind: 'human', id: message.client}, allowLocal: value.prejoin === true});
  const prior = [...(model.baselineRecords || []), ...model.log.map(row => ({transaction: row.act}))];
  const effects = historyEffects([...prior, {transaction: immutable}]);
  if (!effects.ok) fail('live_private_act_invalid');
  const references = effects.references.get(immutable.id);
  const targets = references.map(id => model.log.find(row => row.actId === id)?.gen).filter(gen => gen !== undefined);
  const previous = model.seen[message.client];
  if (message.seq !== (previous?.seq || 0) + 1) fail('live_private_sequence_gap');
  const result = applyEdit(model, {client: message.client, seq: value.seq, gen: value.gen, splices: value.splices, actId: immutable.id,
    ...(value.undoTarget ? {undoTarget: value.undoTarget} : {}), ...(value.undoes ? {undoes: value.undoes} : {})});
  if (result.status !== 'applied' || result.gen !== message.gen) fail('live_private_merge_refused');
  const entry = result.state.log.at(-1), author = {...immutable.author};
  if (JSON.stringify(entry.undoes) !== JSON.stringify(targets)) fail('live_private_inverse_mismatch');
  const offset = model.baselineRevision || 0;
  const act = {...immutable, actor: 'human', baseRevision: offset + model.gen, revision: offset + message.gen,
    splices: liveRows(model.text, entry.splices)};
  return {entry: {...entry, type: 'edit', author, actId: immutable.id, at: immutable.createdAt, act,
      wireDigest: sha256(message.ciphertext), transcript: message.digest},
    seen: {...model.seen, [message.client]: {seq: message.seq, gen: message.gen}}, transcript: message.digest};
}
