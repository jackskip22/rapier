// SPDX-License-Identifier: AGPL-3.0-only
import {parts} from './opfs-paths.mjs';
import {sha256State, blobByteChunks, checkByteAbort, byteCopyError} from './integrity.mjs';
import {isRecordingPartial} from './recording-files.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});
const missing = error => error?.name === 'NotFoundError';
const same = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);
const atomic = () => fail('atomic', 'This browser cannot safely replace a note. These notes are read-only here; opening, search and backup still work.');
const failure = error => ({name: String(error?.name || 'Error'), message: String(error?.message || error), ...(error?.code !== undefined ? {code: error.code} : {})});
const synchronous = value => { if (value !== undefined) throw fail('atomic', 'The notes folder did not provide synchronous file access.'); };

async function locate(directory, name, create = false) {
  const path = parts(name); let dir = directory;
  for (const parent of path.slice(0, -1)) dir = await dir.getDirectoryHandle(parent, {create});
  return {dir, name: path.at(-1)};
}
async function fileAt(dir, name) {
  try { return await (await dir.getFileHandle(name)).getFile(); }
  catch (error) { if (missing(error)) return null; throw error; }
}
// A private-looking name is not authority to overwrite or delete its occupant. The folder lease protects
// our writers; the unique token and identity check preserve a foreign or reoccupied scratch entry.
async function scratch(dir, name) {
  try { await dir.getFileHandle(name); throw fail('collision', 'A temporary file already uses this name. It was kept; retry saving.'); }
  catch (error) { if (!missing(error)) throw error; }
  return dir.getFileHandle(name, {create: true});
}
async function discard(dir, name, handle) {
  try { if (await handle.isSameEntry(await dir.getFileHandle(name))) await dir.removeEntry(name); }
  catch (error) { if (!missing(error)) throw error; }
}
async function accessFor(handle) {
  if (typeof handle.createSyncAccessHandle !== 'function' || typeof handle.move !== 'function') throw atomic();
  return handle.createSyncAccessHandle();
}
function put(access, bytes, offset = 0) {
  for (let at = 0; at < bytes.length;) {
    const count = access.write(bytes.subarray(at), {at: offset + at});
    if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - at) throw fail('verify', 'The notes folder did not complete the synchronous write.');
    at += count;
  }
}
function seal(access, size) {
  synchronous(access.truncate(size)); synchronous(access.flush()); synchronous(access.close());
}
async function write(directory, name, bytes, token, refusal = 'The notes folder did not keep the bytes written to ' + name + '.', fresh = false) {
  const at = await locate(directory, name, true), tmp = '.rapier-write-' + token + '.tmp'; let access, handle, owned = false;
  try {
    handle = await scratch(at.dir, tmp); owned = true; access = await accessFor(handle);
    put(access, bytes); seal(access, bytes.length); access = null;
    // The staged File is independently read after closing the handle, before it takes the name.
    if (!same(new Uint8Array(await (await handle.getFile()).arrayBuffer()), bytes)) throw fail('verify', refusal);
    if (fresh && await fileAt(at.dir, at.name) !== null) throw fail('collision', 'This unfinished recording already exists.');
    await handle.move(at.name); owned = false;
  } finally {
    try { if (access) synchronous(access.close()); }
    finally { if (owned) try { await discard(at.dir, tmp, handle); } catch (_) {} }
  }
}
async function prepare(directory, token) {
  const stem = '.rapier-atomic-' + token, a = stem + '.tmp', b = stem + '-target.tmp', u = stem + '-é.tmp';
  let access, ascii = false; const owned = new Map();
  const create = async name => { const handle = await scratch(directory, name); owned.set(name, handle); return handle; };
  try {
    const first = await create(a), target = await create(b);
    const old = new Uint8Array([239,187,191,13,10,0,255]), next = new Uint8Array([65,13,10]);
    access = await accessFor(target); put(access, old); seal(access, old.length); access = null;
    access = await accessFor(first); put(access, next); synchronous(access.flush());
    if (!same(new Uint8Array(await (await target.getFile()).arrayBuffer()), old)) throw fail('atomic', 'The browser exposed an unfinished file write. These notes are read-only here.');
    synchronous(access.close()); access = null;
    if (!same(new Uint8Array(await (await target.getFile()).arrayBuffer()), old)) throw fail('atomic', 'The browser did not keep the file after an abandoned write. These notes are read-only here.');
    await first.move(b); owned.delete(a); owned.set(b, first);
    if (!same(new Uint8Array(await (await fileAt(directory, b)).arrayBuffer()), next) || await fileAt(directory, a) !== null) throw fail('atomic', 'The browser did not replace the whole file. These notes are read-only here.');
    const empty = await create(a); access = await accessFor(empty); seal(access, 0); access = null;
    await empty.move(b); owned.delete(a); owned.set(b, empty);
    if ((await fileAt(directory, b)).size !== 0) throw fail('atomic', 'The browser did not keep an empty file. These notes are read-only here.');
    try { await create(u); }
    catch (error) { if (['TypeMismatchError', 'InvalidCharacterError', 'TypeError'].includes(error?.name)) ascii = true; else throw error; }
    return {ascii};
  } finally {
    try { if (access) synchronous(access.close()); }
    finally { for (const [name, handle] of owned) try { await discard(directory, name, handle); } catch (_) {} }
  }
}
async function writeBlob(request, signal, progress) {
  const {directory, name, blob, token} = request, at = await locate(directory, name, true), tmp = '.rapier-attachment-' + token + '.tmp';
  let access, handle, staged = false;
  try {
    checkByteAbort(signal);
    if (await fileAt(at.dir, at.name) !== null) throw fail('collision', 'Another file already uses ' + name + '. It was kept; retry adding the original.');
    handle = await scratch(at.dir, tmp); staged = true; access = await accessFor(handle);
    const hash = sha256State(); let done = 0;
    await progress({phase: 'writing', done, total: blob.size});
    for await (const bytes of blobByteChunks(blob, {signal})) {
      hash.update(bytes); put(access, bytes, done); done += bytes.length;
      await progress({phase: 'writing', done, total: blob.size});
    }
    checkByteAbort(signal); seal(access, blob.size); access = null;
    const digest = hash.finish(), back = await handle.getFile();
    if (back.size !== blob.size) throw fail('verify', 'The file copy has a different size. Keep the original file.');
    const actual = sha256State(); done = 0;
    await progress({phase: 'verifying', done, total: blob.size});
    for await (const bytes of blobByteChunks(back, {signal})) {
      actual.update(bytes); done += bytes.length; await progress({phase: 'verifying', done, total: blob.size});
    }
    if (actual.finish() !== digest) throw fail('verify', 'The file copy did not match the original. No link was added. Keep the original file.');
    checkByteAbort(signal);
    if (await fileAt(at.dir, at.name) !== null) throw fail('collision', 'Another file arrived under ' + name + '. It was kept; retry adding the original.');
    checkByteAbort(signal); await handle.move(at.name); staged = false;
    return {size: blob.size, digest};
  } catch (error) { throw byteCopyError(error); }
  finally {
    try { if (access) synchronous(access.close()); }
    finally { if (staged) try { await discard(at.dir, tmp, handle); } catch (error) {
      if (!missing(error)) throw fail('cleanup', 'The unfinished copy could not be removed: attachments/' + tmp + '. No link was added. Keep the original file and retry after storage is available.');
    } }
  }
}
async function recording(request) {
  const {directory, name, bytes, offset, operation, token} = request;
  if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
  const at = await locate(directory, name, operation === 'begin'), previous = await fileAt(at.dir, at.name);
  if (operation === 'begin') {
    if (previous !== null) throw fail('collision', 'This unfinished recording already exists.');
    await write(directory, name, new Uint8Array(), token, 'The unfinished recording could not be started safely.', true);
    if ((await fileAt(at.dir, at.name)).size !== 0) throw fail('verify', 'The unfinished recording could not be started safely.');
    return;
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + bytes.length)) throw fail('recording-size', 'The recording byte count is not readable.');
  if (previous === null) throw Object.assign(new Error('File not found'), {name: 'NotFoundError'});
  if (previous.size !== offset) throw fail('changed', 'The unfinished recording changed. Its bytes were kept.');
  // Sync handles mutate their entry immediately. Copy to a sibling so an interrupted append
  // leaves the last acknowledged partial whole. Verify the copied prefix as well as the tail.
  const tmp = '.rapier-recording-' + token + '.tmp', expected = sha256State(); let access, handle, owned = false;
  try {
    handle = await scratch(at.dir, tmp); owned = true; access = await accessFor(handle);
    let done = 0;
    for await (const chunk of blobByteChunks(previous)) { expected.update(chunk); put(access, chunk, done); done += chunk.length; }
    expected.update(bytes); put(access, bytes, offset); seal(access, offset + bytes.length); access = null;
    const back = await handle.getFile(), actual = sha256State();
    if (back.size !== offset + bytes.length) throw fail('verify', 'The last recording chunk could not be verified. Keep the audio captured so far.');
    for await (const chunk of blobByteChunks(back)) actual.update(chunk);
    if (actual.finish() !== expected.finish()) throw fail('verify', 'The last recording chunk could not be verified. Keep the audio captured so far.');
    await handle.move(at.name); owned = false; return back.size;
  } finally {
    try { if (access) synchronous(access.close()); }
    finally { if (owned) try { await discard(at.dir, tmp, handle); } catch (_) {} }
  }
}

// This is an I/O port only. The page retains its existing owner, journal, lease and target
// readback; no worker queue, retry, fallback or acknowledgement precedes verified publication.
export function createOPFSWorker({postMessage}) {
  const jobs = new Map(); let lastId = 0;
  return async request => {
    const id = request?.id, operation = request?.operation;
    if (!Number.isSafeInteger(id) || id < 1) return;
    const current = jobs.get(id);
    if (operation === 'cancel') { current?.controller.abort(); current?.progress?.reject(Object.assign(new Error('File copy cancelled. No unfinished file was kept.'), {name: 'AbortError', code: 'cancelled'})); return; }
    if (operation === 'progress') {
      if (current?.progress) { const pending = current.progress; current.progress = null; request.error ? pending.reject(Object.assign(new Error(request.error.message), request.error)) : pending.resolve(); }
      return;
    }
    if (id <= lastId) return; lastId = id;
    const job = {controller: new AbortController(), progress: null}; jobs.set(id, job);
    const progress = async value => {
      checkByteAbort(job.controller.signal);
      if (request.progress) await new Promise((resolve, reject) => { job.progress = {resolve, reject}; postMessage({id, progress: value}); });
      checkByteAbort(job.controller.signal);
    };
    try {
      let value;
      if (operation === 'prepare') value = await prepare(request.directory, request.token);
      else if (operation === 'write') value = await write(request.directory, request.name, request.bytes, request.token);
      else if (operation === 'writeBlob') value = await writeBlob(request, job.controller.signal, progress);
      else if (operation === 'begin' || operation === 'append') value = await recording(request);
      else throw new Error('Unknown notes file operation');
      postMessage({id, value});
    } catch (error) { postMessage({id, error: failure(error)}); }
    finally { jobs.delete(id); }
  };
}
export function installOPFSWorker(scope = globalThis) {
  if (typeof scope.document !== 'undefined') throw new Error('Notes sync storage needs a dedicated worker');
  const receive = createOPFSWorker({postMessage: message => scope.postMessage(message)});
  scope.onmessage = ({data}) => receive(data).catch(error => scope.setTimeout(() => { throw error; }, 0));
}
