import {join, resolve, sep} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {link, lstat, mkdir, readFile, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {readAll} from 'rapier-jxl/storage';

const STATE = Symbol.for('rapier-jxl.emdash.local-store');
const {locks} = globalThis[STATE] ??= {locks: new Map()};
const PRIVATE = '__rapier_jxl__/', OWNER = 'rapier-jxl/emdash', MAX_REVISION_BYTES = 2048;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const publicSource = key => !key.startsWith(PRIVATE) && /\.(?:jpe?g|jpe|jfif|png|webp|avif)$/i.test(key);
const sameStat = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const invalid = message => Object.assign(new Error(message), {code: 'JXL_INPUT'});
const cancel = body => { try { Promise.resolve(body?.cancel?.()).catch(() => {}); } catch {} };
export function localStore(inner, directory, maxBytes = 256 * 1024 * 1024) {
  const root = resolve(directory), privateDirectory = join(root, PRIVATE);
  function filePath(key) {
    const path = resolve(root, key.replace(/^\//, ''));
    if (!path.startsWith(root + sep)) throw invalid('Local media key is outside its storage directory.');
    return path;
  }
  const revisionPath = key => join(privateDirectory, createHash('sha256').update(key).digest('hex') + '.revision.json');
  async function ensurePrivate(create = false) {
    try {
      if (!(await lstat(privateDirectory)).isDirectory()) throw invalid('Local revision directory must be an ordinary directory.');
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return false;
      await mkdir(privateDirectory, {recursive: true});
      return ensurePrivate();
    }
  }
  async function identity(key) {
    try {
      const value = await stat(filePath(key), {bigint: true});
      if (!value.isFile()) throw invalid('Local media is an ordinary file.');
      return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs, value.birthtimeNs].map(String);
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function locked(key, action) {
    const name = filePath(key), previous = locks.get(name) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(action);
    locks.set(name, task);
    try { return await task; } finally { if (locks.get(name) === task) locks.delete(name); }
  }
  async function readRevision(key) {
    if (!await ensurePrivate()) return null;
    const path = revisionPath(key);
    let info;
    try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!info.isFile() || info.size > MAX_REVISION_BYTES) throw invalid('Invalid local revision record.');
    const bytes = await readFile(path);
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { throw invalid('Invalid local revision record.'); }
    if (bytes.length > MAX_REVISION_BYTES || value?.owner !== OWNER || value.kind !== 'revision' ||
        value.source !== key || !UUID.test(value.version ?? '') ||
        !(value.stat === null || Array.isArray(value.stat) && value.stat.length === 6 &&
          value.stat.every(item => typeof item === 'string' && /^-?[0-9]+$/.test(item))))
      throw invalid('Invalid local revision record.');
    return {value, bytes};
  }
  async function writeRevision(key, value, bytes = Buffer.from(JSON.stringify(value))) {
    if (bytes.length > MAX_REVISION_BYTES) throw invalid('Local revision record exceeds its byte limit.');
    await ensurePrivate(true);
    const path = revisionPath(key), temporary = path + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, bytes, {flag: 'wx', mode: 0o600}); await rename(temporary, path); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return {value, bytes};
  }
  async function removeRevision(key) {
    try { await unlink(revisionPath(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const revision = (key, value) => ({owner: OWNER, kind: 'revision', source: key, version: randomUUID(), stat: value});
  async function currentRevision(key, value) {
    const saved = await readRevision(key);
    return saved && sameStat(saved.value.stat, value) ? saved : value ? writeRevision(key, revision(key, value)) : saved;
  }
  async function mutate(key, action, signal) {
    signal?.throwIfAborted();
    if (!publicSource(key)) return action();
    const before = await identity(key), prior = await currentRevision(key, before);
    signal?.throwIfAborted();
    const intent = revision(key, before);
    await writeRevision(key, intent);
    let committed = false;
    try {
      signal?.throwIfAborted();
      const result = await action(); committed = true;
      const after = await identity(key);
      if (after) await writeRevision(key, {...intent, stat: after}); else await removeRevision(key);
      return result;
    } catch (error) {
      try {
        const after = await identity(key);
        if (!committed && sameStat(before, after)) {
          if (prior) await writeRevision(key, prior.value, prior.bytes); else await removeRevision(key);
        } else if (after) await writeRevision(key, {...intent, stat: after}); else await removeRevision(key);
      } catch {  }
      throw error;
    }
  }
  async function privateWrite(options, exclusive) {
    await ensurePrivate(true);
    const temporary = PRIVATE + randomUUID() + '.tmp';
    try {
      const result = await inner.upload({...options, key: temporary});
      options.signal?.throwIfAborted();
      if (exclusive) {
        try { await link(filePath(temporary), filePath(options.key)); }
        catch (error) { if (error.code === 'EEXIST') return false; throw error; }
        return true;
      }
      await rename(filePath(temporary), filePath(options.key));
      return {...result, key: options.key, ...(typeof inner.getPublicUrl === 'function' ? {url: inner.getPublicUrl(options.key)} : {})};
    } finally {
      await unlink(filePath(temporary)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  const store = new Proxy(inner, {get(target, property) {
    if (property === 'upload') return options => locked(options.key,
      () => options.key.startsWith(PRIVATE) ? privateWrite(options, false) :
        mutate(options.key, () => target.upload(options), options.signal));
    if (property === 'delete') return (key, options) => locked(key,
      () => mutate(key, () => target.delete(key, options), options?.signal));
    if (property === 'download') return (key, options) => locked(key, async () => {
      options?.signal?.throwIfAborted();
      const result = await target.download(key, options);
      try {
        options?.signal?.throwIfAborted();
        if (!publicSource(key)) return result;
        const saved = await currentRevision(key, await identity(key));
        if (!saved) throw invalid('Local media disappeared during its read.');
        const version = saved.value.version;
        if (result.size > maxBytes) return {...result, etag: version, version};
        const bytes = await readAll(result.body, {maxBytes, signal: options?.signal});
        const body = new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }});
        return {...result, body, etag: version, version};
      } catch (error) { cancel(result?.body); throw error; }
    });
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const create = (key, body, {contentType, signal} = {}) => locked(key, async () => {
    signal?.throwIfAborted();
    if (await inner.exists(key, {signal})) return false;
    signal?.throwIfAborted();
    if (key.startsWith(PRIVATE)) return privateWrite({key, body, contentType, signal}, true);
    await mutate(key, () => inner.upload({key, body, contentType, signal}), signal);
    return true;
  });
  return {store, create};
}
