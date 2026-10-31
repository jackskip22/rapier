// SPDX-License-Identifier: AGPL-3.0-only
import {PDF_JS_VERSION, PDF_READER_FILE, PDF_JS_DOWNLOAD_BYTES, PDF_JS_RESOURCE_MANIFEST, PDF_JS_RESOURCE_ROOT, pdfResourceRootText} from './pdf-resources.mjs';
import {readAttachedSource, SOURCE_SET_ASIDE} from './pdf-source.mjs';
export {PDF_JS_VERSION, PDF_READER_FILE, PDF_JS_DOWNLOAD_BYTES, PDF_JS_RESOURCE_MANIFEST, PDF_JS_RESOURCE_ROOT, pdfResourceRootText};
export {readAttachedSource};

const failure = (message, code) => Object.assign(new Error(message), {code});

export async function readPdf(blob, options = {}) {
  const {mode = 'text', checkCurrent = () => {}, signal} = options;
  if (!(blob instanceof Blob) || !blob.size || blob.size > 25 * 1024 * 1024)
    throw failure('Choose a PDF smaller than 25 MiB.', 'PDF_SIZE');
  if (mode !== 'text' && mode !== 'pages') throw new Error('Choose editable text or page images.');
  let sourceSetAside = false;
  if (mode === 'text') {
    const source = await readAttachedSource(blob, {checkCurrent, signal, onSourceSetAside: () => { sourceSetAside = true; }});
    if (source) return source;
  }
  if (!globalThis.RapierPdfPlugin) throw new Error('The PDF import plugin is unavailable.');
  const result = await globalThis.RapierPdfPlugin.readPdf(blob, options);
  if (sourceSetAside && result) result.warnings = [...(result.warnings || []), SOURCE_SET_ASIDE];
  return result;
}
