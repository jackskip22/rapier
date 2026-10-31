import {fail, generation, errorCode} from './core.mjs';
let projection = null;
export const currentOriginal = () => projection?.current() && projection.files.original?.(projection.authority) === projection.original
  ? projection?.original : null;

export function retained(reason, provider) {
  return Object.freeze({status: 'retained-draft', confirmed: false, verified: false, writes: 0,
    originalPreserved: true, reason: String(reason), provider: String(provider || 'unknown'),
    recoveryChoices: Object.freeze(['keep-editing', 'save-copy', 'reopen-original'])});
}

export async function prepareOriginal(folder, snapshot, files) {
  if (!files?.acceptOpened || !files?.detach || !files?.observeGeneration)
    throw fail('platform_intake_unavailable');
  let active = true, refreshed = null;
  const current = () => { if (!active) throw fail('stale_source'); folder.assertCurrent(snapshot); };
  const originalFile = Object.freeze({
    name: snapshot.name, displayPath: snapshot.displayPath, capabilities: snapshot.capabilities,
    activate(authority, ownsAuthority) {
      current(); projection = {files, authority, original: originalFile, current: ownsAuthority};
      globalThis.dispatchEvent?.(new Event('rapier:original-file-ready'));
    },
    async read({signal} = {}) {
      current();
      const bytes = await folder.readCurrent(snapshot, {signal});
      current();
      return new File([bytes], snapshot.name, {type: 'text/markdown'});
    },
    async validate() { current(); return folder.revalidate(snapshot); },
    async refresh(options) {
      current();
      if (refreshed && currentOriginal() !== refreshed.payload.originalFile) await refreshed.release();
      refreshed = null;
      const next = await folder.refresh(snapshot, options);
      try { current(); return refreshed = await prepareOriginal(folder, next, files); }
      catch (error) { await folder.closeDocument(next); throw error; }
    },
    async save(blob, options = {}) {
      await options.beforeWrite;
      options.check?.();
      try {
        current();
        if (!(blob instanceof Blob) || blob.size > 64 * 1024 * 1024) throw fail('too_large');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        options.check?.();
        const result = await folder.saveBytes(snapshot, bytes, options);
        options.check?.(); current();
        return result;
      } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'cancelled')
          return Object.freeze({status: 'cancelled', confirmed: false, verified: false});
        return retained(errorCode(error), snapshot.capabilities.provider);
      }
    },
    resource: (url, options) => { current(); return folder.resource(snapshot, url, options); },
    addressFrom: (path, url) => { current(); return folder.addressFrom(snapshot, path, url); },
    async embed(url, options) {
      current();
      const embedded = await folder.openRelative(snapshot, url, {...options, maxBytes: 65536});
      try {
        current();
        if (embedded.admittedBytes > 65536) throw fail('too_large');
        return Object.freeze({text: embedded.text, displayPath: embedded.displayPath});
      } finally { await folder.closeDocument(embedded); }
    },
    async follow(url, options) {
      current();
      const next = await folder.openRelative(snapshot, url, options);
      try { current(); return await prepareOriginal(folder, next, files); }
      catch (error) { await folder.closeDocument(next); throw error; }
    },
    async rename(name, options) {
      current();
      const next = await folder.rename(snapshot, name, options);
      try { current(); return await prepareOriginal(folder, next, files); }
      catch (error) { await folder.closeDocument(next); throw error; }
    },
    async release() { if (active) {
      active = false; await folder.closeDocument(snapshot);
      if (refreshed && currentOriginal() !== refreshed.payload.originalFile) await refreshed.release();
      refreshed = null;
      if (projection?.original === originalFile) { projection = null; globalThis.dispatchEvent?.(new Event('rapier:original-file-closed')); }
    } },
  });
  try {
    const blob = await originalFile.read();
    if (await generation(new Uint8Array(await blob.arrayBuffer())) !== snapshot.observedGeneration)
      throw fail('external_file_changed');
    const fileGeneration = await files.observeGeneration(blob);
    current();
    return Object.freeze({payload: Object.freeze({blob, name: snapshot.name, originalFile,
      fileGeneration, transient: false, admittedBytes: blob.size}), release: originalFile.release});
  } catch (error) { await originalFile.release(); throw error; }
}
