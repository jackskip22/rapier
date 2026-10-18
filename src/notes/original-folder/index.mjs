import {Folder, fail} from './core.mjs';
import {browserTree} from './browser.mjs';
import {nativeTree} from './native.mjs';
import {prepareOriginal} from './intake.mjs';

export async function choose(platform = globalThis.RapierPlatform) {
  const host = platform?.host?.originalFolder;
  let provider;
  if (host) {
    const selected = await host.choose();
    if (!selected || selected.cancelled) return {status: 'cancelled'};
    if (selected.status === 'unavailable') return Object.freeze(selected);
    const call = async (method, args = {}) => {
      const reply = await host.call(selected.token, method, args);
      if (reply.error) throw fail(reply.error);
      return reply.value;
    };
    provider = nativeTree(selected, call, () => host.close(selected.token));
  } else if (platform?.environment?.id === 'web' && typeof globalThis.showDirectoryPicker === 'function') {
    try { provider = await browserTree(await globalThis.showDirectoryPicker({mode: 'readwrite'})); }
    catch (error) { if (error?.name === 'AbortError') return {status: 'cancelled'}; throw error; }
  } else return Object.freeze({status: 'unavailable', provider: platform?.environment?.id || 'unknown',
    reason: 'original_folder_picker_unavailable'});
  const folder = new Folder(provider);
  return Object.freeze({status: 'selected', folder, capabilities: folder.capabilities});
}

export async function prepare(folder, entry, files, options) {
  const snapshot = await folder.open(entry, options);
  try { return await prepareOriginal(folder, snapshot, files); }
  catch (error) { await folder.closeDocument(snapshot); throw error; }
}
