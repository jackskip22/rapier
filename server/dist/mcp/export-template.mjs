// SPDX-License-Identifier: AGPL-3.0-only
import {carry} from '../skills/rapier-html/wrap.mjs';

export const EXPORT_TEMPLATE_CACHE_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {ignoreBOM: true});
let retained = null;
const strongTag = value => typeof value === 'string' && /^"[^"\r\n]{1,256}"$/.test(value);

export async function exportTemplate(assets, include, load, signal) {
  signal?.throwIfAborted();
  const key = JSON.stringify(include);
  const held = retained?.assets === assets && retained.key === key ? retained : null;
  const loaded = await load(held?.etag);
  signal?.throwIfAborted();
  if (loaded.unchanged) {
    if (!held || loaded.etag && loaded.etag !== held.etag) throw new Error('export template validator mismatch');
    await new Promise(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    return decoder.decode(held.bytes);
  }
  const page = carry(loaded.page, include);
  if (strongTag(loaded.etag) && page.length <= EXPORT_TEMPLATE_CACHE_BYTES) {
    const bytes = encoder.encode(page);
    if (bytes.byteLength <= EXPORT_TEMPLATE_CACHE_BYTES) retained = {assets, key, etag: loaded.etag, bytes};
  }
  return page;
}
