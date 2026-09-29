// SPDX-License-Identifier: AGPL-3.0-only
import {PDF_JS_VERSION, PDF_JS_DOWNLOAD_BYTES, PDF_JS_RESOURCE_MANIFEST, PDF_JS_RESOURCE_ROOT, pdfResourceRootText} from './pdf-resources.mjs';
export {PDF_JS_VERSION, PDF_JS_DOWNLOAD_BYTES, PDF_JS_RESOURCE_MANIFEST, PDF_JS_RESOURCE_ROOT, pdfResourceRootText};

export const PDF_LIMITS = Object.freeze({bytes: 25 * 1024 * 1024, textPages: 4096,
  imagePages: 256, textItems: 1000000, pageTextCharacters: 4 * 1024 * 1024, pagePixels: 4 * 1024 * 1024,
  pageSide: 4096, sourceImagePixels: 16 * 1024 * 1024,
  temporaryCanvasPixels: 16 * 1024 * 1024, rasterBytes: 20 * 1024 * 1024, operationMs: 45000});

const escape = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const failure = (message, code) => Object.assign(new Error(message), {code});

/** A PDF supplies page drawing commands, not Markdown structure. These two
 * explicit imports either keep its text layer or rasterize its visible pages. */
export async function readPdf(blob, {mode = 'text', embedImage, checkCurrent = () => {},
  onProgress = () => {}, signal} = {}) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > PDF_LIMITS.bytes)
    throw failure('Choose a PDF smaller than 25 MiB.', 'PDF_SIZE');
  if (mode !== 'text' && mode !== 'pages') throw new Error('Choose editable text or page images.');
  if (mode === 'pages' && typeof embedImage !== 'function') throw new Error('PDF page import needs image embedding.');
  const plugin = globalThis.RapierPdfPlugin;
  if (!plugin) throw new Error('The PDF import plugin is unavailable.');
  const encoder = new TextEncoder();
  const html = [], warnings = new Set();
  const stats = {pages: 0, pagesWithText: 0, images: 0, pixels: 0, reducedPages: 0,
    textItems: 0, inputBytes: blob.size, outputBytes: 0};
  let session = null, loading = null, pdf = null, render = null, textReader = null, page = null, finished = false, destroying = null;
  let abortReject;
  const aborted = new Promise((_, reject) => { abortReject = reject; });
  aborted.catch(() => {});
  const abortError = () => new DOMException('PDF import cancelled.', 'AbortError');
  const check = () => { if (signal?.aborted) throw abortError(); checkCurrent(); };
  const destroy = () => {
    if (!destroying && loading) {
      try { destroying = loading.destroy().catch(() => {}); } catch (_) {}
    }
  };
  const cancel = () => {
    abortReject(abortError());
    try { render?.cancel(); } catch (_) {}
    try { textReader?.cancel().catch(() => {}); } catch (_) {}
    destroy();
  };
  signal?.addEventListener('abort', cancel, {once: true});
  if (signal?.aborted) cancel();
  const step = async (work, label) => {
    work = Promise.resolve(work);
    work.catch(() => {});
    check();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(failure('The PDF took too long to ' + label + '.', 'PDF_TIMEOUT')), PDF_LIMITS.operationMs);
    });
    try {
      const result = await Promise.race([work, aborted, timeout, ...(session ? [session.failure] : [])]);
      check(); return result;
    } finally { clearTimeout(timer); }
  };
  const append = value => {
    if (html.length) value = '\n' + value;
    if (value.length > PDF_LIMITS.bytes - stats.outputBytes) throw failure('The imported PDF exceeds 25 MiB.', 'PDF_OUTPUT_SIZE');
    stats.outputBytes += encoder.encode(value).length;
    if (stats.outputBytes > PDF_LIMITS.bytes) throw failure('The imported PDF exceeds 25 MiB.', 'PDF_OUTPUT_SIZE');
    html.push(value);
  };

  // PDF.js requests temporary canvases for masks, patterns and image conversion.
  // Bound their combined area as well as the one output page retained below.
  const canvases = new Map();
  let canvasPixels = 0;
  class BoundedCanvasFactory {
    create(width, height) {
      const canvas = document.createElement('canvas');
      this.reset({canvas}, width, height);
      const context = canvas.getContext('2d', {willReadFrequently: true});
      if (!context) { this.destroy({canvas}); throw new Error('PDF import needs a 2D canvas.'); }
      return {canvas, context};
    }
    reset(target, width, height) {
      width = Math.ceil(width); height = Math.ceil(height);
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 ||
          width > 16384 || height > 16384 ||
          canvasPixels - (canvases.get(target.canvas) || 0) + pixels > PDF_LIMITS.temporaryCanvasPixels)
        throw failure('A PDF drawing exceeds the image memory limit.', 'PDF_CANVAS_SIZE');
      canvasPixels += pixels - (canvases.get(target.canvas) || 0);
      canvases.set(target.canvas, pixels);
      target.canvas.width = width; target.canvas.height = height;
    }
    destroy(target) {
      if (!target.canvas) return;
      canvasPixels -= canvases.get(target.canvas) || 0;
      canvases.delete(target.canvas);
      target.canvas.width = target.canvas.height = 0;
      target.canvas = target.context = null;
    }
  }

  try {
    check();
    const starting = plugin.createSession().then(value => {
      try {
        if (finished) throw abortError();
        check(); session = value; return value;
      } catch (error) { value.close(); throw error; }
    });
    session = await step(starting, 'start the reader');
    const data = new Uint8Array(await step(blob.arrayBuffer(), 'read the file'));
    loading = session.api.getDocument({data, worker: session.worker, ...session.options,
      stopAtErrors: true, disableFontFace: true, useSystemFonts: false, enableXfa: false,
      disableAutoFetch: true, disableRange: true, disableStream: true,
      maxImageSize: PDF_LIMITS.sourceImagePixels, canvasMaxAreaInBytes: PDF_LIMITS.temporaryCanvasPixels * 4,
      CanvasFactory: BoundedCanvasFactory, verbosity: 0});
    pdf = await step(loading.promise, 'open');
    stats.pages = pdf.numPages;
    const pageLimit = mode === 'text' ? PDF_LIMITS.textPages : PDF_LIMITS.imagePages;
    if (!Number.isSafeInteger(stats.pages) || stats.pages < 1 || stats.pages > pageLimit)
      throw failure('This import supports up to ' + pageLimit + ' PDF pages.', 'PDF_PAGE_LIMIT');
    for (let index = 1; index <= stats.pages; index++) {
      check(); onProgress({page: index, pages: stats.pages});
      page = await step(pdf.getPage(index), 'read page ' + index);
      if (mode === 'text') {
        const parts = [];
        let characters = 0;
        textReader = page.streamTextContent({includeMarkedContent: false}).getReader();
        while (true) {
          const {done, value} = await step(textReader.read(), 'read text on page ' + index);
          if (done) break;
          for (const item of value.items || []) {
            if (typeof item.str !== 'string') continue;
            if (++stats.textItems > PDF_LIMITS.textItems) throw failure('The PDF text layer is too complex to import.', 'PDF_TEXT_LIMIT');
            characters += item.str.length + (item.hasEOL ? 1 : 0);
            if (characters > PDF_LIMITS.pageTextCharacters) throw failure('A PDF page has too much text to import.', 'PDF_TEXT_LIMIT');
            parts.push(item.str);
            if (item.hasEOL) parts.push('\n');
          }
        }
        textReader.releaseLock(); textReader = null;
        const text = parts.join('').replace(/\r\n?/g, '\n').trim();
        if (text) {
          if (stats.pagesWithText) append('<hr>');
          append('<p>' + escape(text).replace(/\n/g, '<br>') + '</p>');
          stats.pagesWithText++;
        }
      } else {
        const natural = page.getViewport({scale: 1});
        if (![natural.width, natural.height].every(value => Number.isFinite(value) && value > 0))
          throw failure('The PDF page has invalid dimensions.', 'PDF_PAGE_SIZE');
        const scale = Math.min(2, (PDF_LIMITS.pageSide - 1) / natural.width, (PDF_LIMITS.pageSide - 1) / natural.height,
          Math.sqrt((PDF_LIMITS.pagePixels - PDF_LIMITS.pageSide * 2) / (natural.width * natural.height)));
        const viewport = page.getViewport({scale});
        const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
        if (width < 1 || height < 1 || width > PDF_LIMITS.pageSide || height > PDF_LIMITS.pageSide || width * height > PDF_LIMITS.pagePixels)
          throw failure('The PDF page cannot fit the image limit.', 'PDF_PAGE_SIZE');
        if (scale < 2) stats.reducedPages++;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        try {
          const context = canvas.getContext('2d', {alpha: false});
          if (!context) throw new Error('PDF import needs a 2D canvas.');
          render = page.render({canvas, canvasContext: context, viewport, background: '#ffffff',
            annotationMode: session.api.AnnotationMode.ENABLE});
          await step(render.promise, 'draw page ' + index);
          render = null;
          const raster = await step(new Promise((resolve, reject) => canvas.toBlob(value =>
            value ? resolve(value) : reject(new Error('The PDF page could not be encoded as an image.')), 'image/png')), 'encode page ' + index);
          if (!raster.size || raster.size > PDF_LIMITS.rasterBytes)
            throw failure('The PDF page image exceeds its memory limit.', 'PDF_RASTER_SIZE');
          // Release the page projection before the existing image encoder runs.
          canvas.width = canvas.height = 0;
          page.cleanup();
          const bytes = new Uint8Array(await step(raster.arrayBuffer(), 'prepare page ' + index));
          const name = 'page-' + index + '.png';
          const alt = 'Page ' + index + (blob.name ? ' of ' + String(blob.name).replace(/\.pdf$/i, '') : ' of imported PDF');
          const reference = await step(embedImage({bytes, name, mime: 'image/png', alt, displayWidth: width, displayHeight: height}), 'embed page ' + index);
          if (typeof reference !== 'string' || !/^[a-z0-9-]+$/i.test(reference))
            throw new Error('The PDF page did not return an image reference.');
          if (stats.images) append('<hr>');
          append('<p><img data-rapier-asset="' + reference + '" alt="' + escape(alt) + '"></p>');
          stats.images++; stats.pixels += width * height;
        } finally { canvas.width = canvas.height = 0; }
      }
      page.cleanup(); page = null;
    }
    if (mode === 'text') {
      if (!stats.pagesWithText) throw failure('This PDF has no selectable text. Import it as page images.', 'PDF_NO_TEXT');
      warnings.add('Text follows the PDF text layer. Pictures, columns, fonts and page formatting are not reconstructed.');
      if (stats.pagesWithText < stats.pages)
        warnings.add((stats.pages - stats.pagesWithText) + ' page(s) had no selectable text and were left out.');
    } else {
      warnings.add('Each PDF page is an image; its text is not editable. Some fonts, colors and annotations can differ from the original.');
      if (stats.reducedPages) warnings.add(stats.reducedPages + ' large page(s) were reduced to fit the 4 megapixel page limit.');
    }
    check();
    return {html: html.join(''), warnings: [...warnings], stats};
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error?.name === 'PasswordException')
      throw failure('Unlock this PDF in its original app, save an unlocked copy, then import that copy.', 'PDF_PASSWORD');
    if (/Image exceeded maximum allowed size/.test(String(error?.message)))
      throw failure('A picture in this PDF exceeds the 16 megapixel decoding limit. The import was stopped.', 'PDF_IMAGE_SIZE');
    throw error;
  } finally {
    finished = true;
    signal?.removeEventListener('abort', cancel);
    try { render?.cancel(); } catch (_) {}
    try { textReader?.cancel().catch(() => {}); } catch (_) {}
    try { page?.cleanup(); } catch (_) {}
    destroy();
    if (destroying) {
      let timer;
      try { await Promise.race([destroying, new Promise(resolve => { timer = setTimeout(resolve, 500); })]); }
      finally { clearTimeout(timer); }
    }
    session?.close();
    try { pdf?.filterFactory?.destroy(); } catch (_) {}
    for (const canvas of canvases.keys()) canvas.width = canvas.height = 0;
    canvases.clear();
  }
}
