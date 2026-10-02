// SPDX-License-Identifier: AGPL-3.0-only
// Host resource URIs are capabilities from a file entrypoint, never URLs to fetch.
export function fileInput(value) {
  if (!value || typeof value !== 'object' || typeof value.name !== 'string' ||
      !value.name || /[\\/\u0000-\u001f\u007f]/.test(value.name) ||
      typeof value.resourceUri !== 'string' || !value.resourceUri.trim()) return null;
  return Object.freeze({name: value.name, resourceUri: value.resourceUri});
}

export async function readHostFile(request, file, maxBytes) {
  const result = await request('resources/read', {uri: file.resourceUri,
    _meta: {'openai/resource': {representation: 'blob'}}});
  const rows = result?.contents;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.uri !== file.resourceUri) throw new Error('FILE_INVALID');
  const row = rows[0];
  let text;
  if (typeof row.blob === 'string' && row.text === undefined) {
    if (row.blob.length > Math.ceil(maxBytes / 3) * 4) throw new Error('FILE_TOO_LARGE');
    if (row.blob.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(row.blob)) throw new Error('FILE_INVALID');
    const binary = atob(row.blob);
    if (binary.length > maxBytes) throw new Error('FILE_TOO_LARGE');
    // ignoreBOM means the decoder retains the authored BOM rather than stripping it.
    text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } else if (typeof row.text === 'string' && row.blob === undefined) {
    text = row.text;
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > maxBytes) throw new Error('FILE_TOO_LARGE');
    if (new TextDecoder('utf-8', {ignoreBOM: true}).decode(bytes) !== text) throw new Error('FILE_INVALID');
  } else throw new Error('FILE_INVALID');
  const meta = row._meta?.['openai/resource'];
  return Object.freeze({text, writable: meta?.writable === true,
    etag: typeof meta?.etag === 'string' && meta.etag ? meta.etag : null});
}

// One serialized persistence owner for the opened host file. The editor/agent kernel still
// owns the document. A lost write receipt is reconciled by reading before another CAS write.
export function createHostFileBinding({request, file, resource, maxBytes, changed = () => {}}) {
  let saved = resource, latest = null, uncertain = null, issue = '', disposed = false, busy = 0;
  let queue = Promise.resolve();
  const current = () => { if (disposed) throw new Error('FILE_CLOSED'); };
  const serialized = work => {
    const task = queue.then(async () => {
      current();
      busy++;
      try { return await work(); }
      finally { busy--; if (!disposed) changed(); }
    });
    queue = task.catch(() => {});
    return task;
  };
  const read = async () => {
    const value = await readHostFile(request, file, maxBytes);
    current();
    if (uncertain && value.text === uncertain.text) {
      saved = value;
      uncertain = null;
      latest = null;
      issue = '';
    } else if (value.text === saved.text) {
      saved = value;
      uncertain = null;
      latest = null;
      issue = '';
    } else {
      latest = value;
      uncertain = null;
      issue = 'conflict';
    }
    return value;
  };
  const isSaved = text => text === saved.text && !uncertain && (!latest || latest.text === text);
  return Object.freeze({
    file,
    get resource() { return saved; },
    get incoming() { return latest; },
    get pending() { return busy > 0 || !!uncertain; },
    get issue() { return issue; },
    isSaved,
    refresh: () => serialized(read),
    save: text => serialized(async () => {
      if (uncertain) await read();
      if (isSaved(text)) return true;
      if (latest) { issue = 'conflict'; return false; }
      if (!saved.writable) { issue = 'read_only'; return false; }
      // An unversioned write cannot protect concurrent host edits, even when writable is true.
      if (!saved.etag) { issue = 'unversioned'; return false; }
      const sent = {text, etag: saved.etag};
      uncertain = sent;
      let result;
      try { result = await request('openai/resources/write', {uri: file.resourceUri, ifMatch: sent.etag, text}); }
      catch (error) { issue = 'unconfirmed'; throw error; }
      current();
      if (result?.outcome === 'saved' && typeof result.etag === 'string' && result.etag) {
        saved = Object.freeze({text, etag: result.etag, writable: true});
        uncertain = null;
        issue = '';
        return true;
      }
      if (result?.outcome === 'conflict') {
        await read();
        return isSaved(text);
      }
      if (result?.outcome === 'too-large') {
        uncertain = null;
        issue = 'too_large';
        return false;
      }
      issue = 'unconfirmed';
      throw new Error('FILE_WRITE_INVALID');
    }),
    // Only a successful document transaction or an explicit "Keep my version" may advance
    // this baseline to the external contents; a later host change still fails the next ETag.
    accept: value => {
      current();
      if (busy || uncertain || value !== latest) return false;
      saved = value;
      latest = null;
      issue = '';
      changed();
      return true;
    },
    settled: () => queue,
    dispose: () => { disposed = true; },
  });
}
