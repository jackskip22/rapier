import {fail, generation} from './core.mjs';

export function retained(reason, provider) {
  return Object.freeze({status: 'retained-draft', confirmed: false, verified: false, writes: 0,
    originalPreserved: true, reason: String(reason), provider: String(provider || 'unknown'),
    recoveryChoices: Object.freeze(['keep-editing', 'save-copy', 'reopen-original'])});
}

export async function prepareOriginal(folder, snapshot, files) {
  if (!files?.acceptOpened || !files?.detach || !files?.observeGeneration)
    throw fail('platform_intake_unavailable');
  let active = true;
  const current = () => { if (!active) throw fail('stale_source'); folder.assertCurrent(snapshot); };
  const originalFile = Object.freeze({
    name: snapshot.name, displayPath: snapshot.displayPath, capabilities: snapshot.capabilities,
    async read({signal} = {}) {
      current();
      const bytes = await folder.readCurrent(snapshot, {signal});
      current();
      return new File([bytes], snapshot.name, {type: 'text/markdown'});
    },
    async validate() { current(); return folder.revalidate(snapshot); },
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
        return retained(error?.code || 'original_unavailable', snapshot.capabilities.provider);
      }
    },
    resource: (url, options) => { current(); return folder.resource(snapshot, url, options); },
    async follow(url, options) {
      current();
      const next = await folder.openRelative(snapshot, url, options);
      try { current(); return await prepareOriginal(folder, next, files); }
      catch (error) { await folder.closeDocument(next); throw error; }
    },
    async release() { if (active) { active = false; await folder.closeDocument(snapshot); } },
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
