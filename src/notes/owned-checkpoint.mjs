// SPDX-License-Identifier: AGPL-3.0-only
// Private endpoint setup. Account enrollment supplies separate store keys and already-bound ciphertext transports.
import {backupInventory, backupNames, folderBackupSource, writeBackupStream, createBackupSink, memoryBackupTarget,
  backupStageRecord, retainedBackupSink, detachBackupFile} from './backup.mjs';
import {verifyBackupStream} from './restore.mjs';
import {zipEntries, ZIP_READ_MAX_BYTES} from './zip.mjs';
import {sha256} from './integrity.mjs';
import {seal, open, VDK_BYTES, NONCE_BYTES, TAG_BYTES} from './vault.mjs';
import {putVerified} from './sync.mjs';
import {sealLiveEnvelope, openLiveEnvelope, LIVE_ENVELOPE_MAX_BYTES} from './live-envelope.mjs';

const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const OVERHEAD = 1 + NONCE_BYTES + TAG_BYTES, SAFE = Symbol('owned checkpoint refusal');
const DOMAIN = 'rapier-owned-notes-checkpoint-v1\0', NAME = 'owned-notes-checkpoint.zip';
const FIELDS = ['version', 'workspaceId', 'documentId', 'keyEpoch', 'capturedSequence', 'digest', 'bytes', 'archiveDigest', 'archiveBytes', 'files'];
const integer = (value, min = 0) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = code => {throw Object.assign(new Error(code), {code, [SAFE]: true});};
const exact = (value, allowed, required = allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !required.every(key => Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.includes(key))) fail('notes_checkpoint_input');
};
const bytes = (value, limit, minimum = 0) => {
  if (!(value instanceof Uint8Array) || value.length < minimum || value.length > limit) fail('notes_checkpoint_input');
  return value.slice();
};
const cryptoKey = (key, usage) => key?.type === (usage === 'sign' ? 'private' : 'public') && key.algorithm?.name === 'ECDSA'
  && key.algorithm.namedCurve === 'P-256' && key.usages?.includes(usage);
const publicError = (error, code) => error?.[SAFE] ? error : Object.assign(new Error(code), {code, [SAFE]: true});

// This is the existing backup reader's whole-member route. It never skips an oversize stored member.
async function archiveOf(file, signal) {
  const entries = [];
  for await (const entry of zipEntries(file, {signal})) entries.push({name: entry.name, size: entry.size,
    read: entry.read || (async () => (await entry.source()).read(0, entry.size))});
  return {parts: [{entries}]};
}

export function createOwnedNotesCheckpoint({workspaceId, documentId, keyEpoch, actorIndex, storeKey, signingKey, verificationKey,
  store, objects, relay, isCurrent = () => true, createStage} = {}) {
  if (!identifier(workspaceId) || !identifier(documentId) || !integer(keyEpoch, 1) || !integer(actorIndex) ||
      !(storeKey instanceof Uint8Array) || storeKey.length !== VDK_BYTES || !cryptoKey(verificationKey, 'verify') ||
      signingKey !== undefined && !cryptoKey(signingKey, 'sign') || typeof objects?.get !== 'function' ||
      typeof isCurrent !== 'function' || createStage !== undefined && typeof createStage !== 'function') fail('notes_checkpoint_input');
  const sourceFolder = store?.folder;
  if (store && (typeof sourceFolder?.backupSnapshot !== 'function' ||
      ['list', 'attachmentNames', 'audioNames', 'historyNames', 'thumbNames', 'importReceiptNames', 'backupFile'].some(name => typeof store[name] !== 'function'))) fail('notes_checkpoint_input');
  // The tool-channel document key is deliberately not an input. Requesters cannot open a person's whole library.
  const key = storeKey.slice(), scope = Object.freeze({workspaceId, documentId, keyEpoch, actorIndex}), controller = new AbortController();
  let locked = false, pending = Promise.resolve();
  const current = async () => {
    if (locked || !await isCurrent() || locked || store && store.folder !== sourceFolder) fail('notes_checkpoint_locked');
  };
  const aad = capturedSequence => DOMAIN + JSON.stringify([workspaceId, documentId, keyEpoch, capturedSequence]);
  const enqueue = (prepare, operation, failure) => {
    let input;
    try {input = prepare();} catch (error) {return Promise.reject(publicError(error, failure));}
    const task = pending.then(async () => {await current(); return operation(input);}).catch(error => {throw publicError(error, failure);});
    pending = task.catch(() => {}); return task;
  };
  const descriptorOf = async envelope => {
    let opened;
    try {opened = await openLiveEnvelope(envelope, {...scope, verificationKey}, key);} catch (_) {fail('notes_checkpoint_corrupt');}
    let descriptor;
    try {descriptor = JSON.parse(td.decode(opened.bytes));} catch (_) {fail('notes_checkpoint_corrupt');}
    finally {opened.bytes.fill(0);}
    try {exact(descriptor, FIELDS);} catch (_) {fail('notes_checkpoint_corrupt');}
    if (descriptor.version !== 1 || descriptor.workspaceId !== workspaceId || descriptor.documentId !== documentId || descriptor.keyEpoch !== keyEpoch ||
        !integer(descriptor.capturedSequence) || !digest(descriptor.digest) || !digest(descriptor.archiveDigest) ||
        !integer(descriptor.archiveBytes, 22) || descriptor.archiveBytes > ZIP_READ_MAX_BYTES || descriptor.bytes !== descriptor.archiveBytes + OVERHEAD ||
        !integer(descriptor.files, 2) || descriptor.files > 65534 || opened.header.messageKind !== 'checkpoint' || opened.header.baseSequence !== descriptor.capturedSequence) fail('notes_checkpoint_corrupt');
    await current(); return {descriptor, header: opened.header};
  };
  const objectTransport = {
    async get(name) {await current(); const result = await objects.get(name); await current(); return result;},
    async put(name, value) {await current(); const result = await objects.put(name, value); await current(); return result;}
  };

  return Object.freeze({
    // Capture certifies the actual backup owner's complete inventory. A sealed staging target is
    // retained on failure; its existing local lifecycle owns cleanup. The returned package contains
    // ciphertext only and can be kept by that endpoint for identical publication retries after restart.
    // A live enrolled editor calls adapter.captureCheckpoint(this, {operationId, stamp}) so that
    // capture runs on the delivery queue and that owner supplies the actual covered sequence.
    capture(input) {return enqueue(() => {
      exact(input, ['capturedSequence', 'operationId', 'stamp'], ['capturedSequence', 'operationId']);
      const {capturedSequence, operationId, stamp = Date.now()} = input;
      if (!sourceFolder || !cryptoKey(signingKey, 'sign') || !integer(capturedSequence) || !identifier(operationId) ||
          !integer(stamp) || !Number.isFinite(new Date(stamp).getTime())) fail('notes_checkpoint_input');
      return {capturedSequence, operationId, stamp};
    }, async ({capturedSequence, operationId, stamp}) => {
      const snapshot = await sourceFolder.backupSnapshot(); let detached, record;
      try {
        await current();
        const inventory = await backupInventory(store, {signal: controller.signal}), names = inventory.map(row => row.name).join('\n');
        const assertCurrent = async () => {await current(); return await snapshot.current() && names === (await backupNames(store)).join('\n');};
        const target = createStage ? await createStage() : memoryBackupTarget({makeFile: parts => new File(parts, NAME, {type: 'application/zip'})});
        const sink = createBackupSink(target);
        const staged = await writeBackupStream(folderBackupSource(store, {inventory, stamp, signal: controller.signal}), sink,
          {appVersion: 'owned-notes-checkpoint-v1', stamp, assertCurrent, signal: controller.signal});
        record = backupStageRecord({name: NAME, bytes: staged.bytes, files: staged.files, stamp: new Date(stamp).toISOString(), digest: sink.digest});
        const retained = retainedBackupSink(target, record);
        detached = await detachBackupFile(await retained.file(), record, {signal: controller.signal});
        if (!await assertCurrent()) fail('notes_checkpoint_source_changed');
      } finally {await snapshot.release();}
      // Both certification and encryption use independently owned bytes after releasing the folder.
      const archive = await archiveOf(detached, controller.signal), checked = await verifyBackupStream(archive, {signal: controller.signal, notes: true});
      if (!checked.manifest || checked.files.length + 1 !== record.files) fail('notes_checkpoint_corrupt');
      await current();
      const plain = new Uint8Array(await detached.arrayBuffer()); let ciphertext;
      try {
        if (plain.length !== record.bytes || await sha256(plain) !== record.digest) fail('notes_checkpoint_corrupt');
        await current(); ciphertext = await seal(key, aad(capturedSequence), plain);
      } finally {plain.fill(0);}
      await current();
      const descriptor = {version: 1, workspaceId, documentId, keyEpoch, capturedSequence, digest: await sha256(ciphertext), bytes: ciphertext.length,
        archiveDigest: record.digest, archiveBytes: record.bytes, files: record.files};
      const envelope = await sealLiveEnvelope({...scope, operationId, baseSequence: capturedSequence, messageKind: 'checkpoint'}, te.encode(JSON.stringify(descriptor)), key, signingKey);
      await descriptorOf(envelope); await current();
      return Object.freeze({envelope, ciphertext});
    }, 'notes_checkpoint_capture_failed');},

    publish(input) {return enqueue(() => {
      exact(input, ['envelope', 'ciphertext']);
      if (typeof objects.put !== 'function' || typeof relay?.append !== 'function') fail('notes_checkpoint_input');
      return {envelope: bytes(input.envelope, LIVE_ENVELOPE_MAX_BYTES), ciphertext: bytes(input.ciphertext, ZIP_READ_MAX_BYTES + OVERHEAD, 22 + OVERHEAD)};
    }, async ({envelope, ciphertext}) => {
      const {descriptor, header} = await descriptorOf(envelope);
      if (ciphertext.length !== descriptor.bytes || await sha256(ciphertext) !== descriptor.digest) fail('notes_checkpoint_corrupt');
      try {await putVerified(objectTransport, 'objects/' + descriptor.digest, ciphertext);}
      catch (error) {throw publicError(error, 'notes_checkpoint_upload_unconfirmed');}
      await current();
      const receipt = await relay.append({actorIndex, envelope: envelope.slice()});
      await current();
      if (receipt?.outcome !== 'stored' || !integer(receipt.sequence, descriptor.capturedSequence + 1) || receipt.operationId !== header.operationId || typeof receipt.replayed !== 'boolean') fail('notes_checkpoint_publication_unconfirmed');
      return {outcome: 'stored', sequence: receipt.sequence, operationId: receipt.operationId, replayed: receipt.replayed, capturedSequence: descriptor.capturedSequence};
    }, 'notes_checkpoint_publication_unconfirmed');},

    // Restore is a trusted endpoint setup action, never a live tool effect. The ordinary exact
    // restore owner verifies every member, rechecks an empty destination, and journals publication.
    // It also retains its existing rule for clearing carried sync credentials and renewing a writer.
    restore(input) {return enqueue(() => {
      exact(input, ['envelope', 'folder', 'minimumSequence'], ['envelope', 'folder']);
      const {folder, minimumSequence = 0} = input;
      if (typeof folder?.restoreSnapshot !== 'function' || !integer(minimumSequence)) fail('notes_checkpoint_input');
      return {envelope: bytes(input.envelope, LIVE_ENVELOPE_MAX_BYTES), folder, minimumSequence};
    }, async ({envelope, folder, minimumSequence}) => {
      const {descriptor} = await descriptorOf(envelope);
      if (descriptor.capturedSequence < minimumSequence) fail('notes_checkpoint_stale');
      const found = await objectTransport.get('objects/' + descriptor.digest);
      if (!(found?.bytes instanceof Uint8Array) || found.bytes.length !== descriptor.bytes) fail('notes_checkpoint_corrupt');
      const ciphertext = found.bytes.slice();
      if (await sha256(ciphertext) !== descriptor.digest) fail('notes_checkpoint_corrupt');
      await current(); let plain;
      try {plain = await open(key, aad(descriptor.capturedSequence), ciphertext);} catch (_) {fail('notes_checkpoint_corrupt');}
      try {
        if (plain.length !== descriptor.archiveBytes || await sha256(plain) !== descriptor.archiveDigest) fail('notes_checkpoint_corrupt');
        const archive = await archiveOf(new Blob([plain]), controller.signal);
        const checked = await verifyBackupStream(archive, {signal: controller.signal, notes: true});
        if (!checked.manifest || checked.files.length + 1 !== descriptor.files) fail('notes_checkpoint_corrupt');
        await current();
        const restored = await folder.restoreSnapshot(archive, {signal: controller.signal, guard: current});
        return {outcome: 'restored', capturedSequence: descriptor.capturedSequence, verification: restored.verification};
      } finally {plain.fill(0);}
    }, 'notes_checkpoint_restore_failed');},

    async lock() {locked = true; key.fill(0); controller.abort(); await pending;}
  });
}
