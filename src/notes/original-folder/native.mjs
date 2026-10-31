import {fail as failure, generation} from './core.mjs';
const check = signal => { if (signal?.aborted) throw failure('cancelled'); };

export function nativeTree(hello, request, retire) {
  let bodyReserved = 0, inflight = 0, active = true, cleanup = Promise.resolve();
  function call(method, args = {}, cleaning = false) {
    if (['release', 'listClose', 'readClose', 'writeClose'].includes(method) && !cleaning) {
      const result = cleanup.then(() => call(method, args, true));
      cleanup = result.catch(() => {});
      return result;
    }
    if (!active) return Promise.reject(failure('revoked'));
    if (!cleaning && inflight >= 32 || new TextEncoder().encode(JSON.stringify({method, args})).length > 16000)
      return Promise.reject(failure('request_limit'));
    inflight++;
    return Promise.resolve().then(() => request(method, args)).finally(() => { inflight--; });
  }
  return Object.freeze({
    ...hello,
    lookup: path => call('lookup', {path}),
    relative: (row, path) => call('relative', {id: row.id, path}),
    retain: (row, {forSave = false} = {}) => call('retain', {id: row.id, forSave}),
    release: rows => call('release', {ids: rows.map(row => row.id)}),
    validate: row => call('validate', {id: row.id}),
    listStart: row => call('listStart', {id: row.id}),
    listNext: (cursor, limit) => call('listNext', {cursor, limit}),
    listClose: cursor => call('listClose', {cursor}),
    create: (row, name) => call('create', {id: row.id, name}),
    rename: (row, name, expected) => call('rename', {id: row.id, name, expected}),
    async save(row, bytes, expected, {signal} = {}) {
      check(signal);
      const digest = (await generation(bytes)).split(':')[1];
      check(signal);
      const upload = await call('writeStart', {id: row.id, size: bytes.length, expected, digest});
      try {
        for (let at = 0; at < bytes.length; at += 8192) {
          check(signal);
          await call('writeChunk', {write: upload, offset: at,
            data: btoa(String.fromCharCode(...bytes.subarray(at, at + 8192)))});
        }
        check(signal);
        return await call('writeFinish', {write: upload});
      } finally { await call('writeClose', {write: upload}); }
    },
    async read(row, {signal, maxBytes = 64 * 1024 * 1024, onChunk} = {}) {
      check(signal);
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 * 1024) throw failure('too_large');
      const first = await call('readStart', {id: row.id});
      let reserved = 0;
      try {
      check(signal);
      if (!Number.isSafeInteger(first.size) || first.size < 0 || first.size > maxBytes) throw failure('too_large');
      if (bodyReserved + first.size > 64 * 1024 * 1024) throw failure('read_limit');
      reserved = first.size; bodyReserved += reserved;
      const bytes = new Uint8Array(first.size);
      for (let at = 0; at < bytes.length; at += 65536) {
        check(signal);
        const length = Math.min(65536, bytes.length - at);
        const part = await call('readChunk', {read: first.read, offset: at, length});
        check(signal);
        const data = Uint8Array.from(atob(part.data), c => c.charCodeAt(0));
        if (part.version !== first.version || data.length !== length) throw failure('changed_during_read');
        bytes.set(data, at);
        if (onChunk) await onChunk(at + data.length);
      }
      const after = await call('readChunk', {read: first.read, offset: 0, length: 0});
      check(signal);
      if (after.version !== first.version) throw failure('changed_during_read');
      return bytes;
      } finally { bodyReserved -= reserved; await call('readClose', {read: first.read}); }
    },
    stats: async () => ({...await call('stats'), pendingBodyBytes: bodyReserved}),
    async close() { if (active) { active = false; await retire(); } },
  });
}
