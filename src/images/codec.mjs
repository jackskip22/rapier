// Worker-only JPEG XL adapter. Vendor provenance is in vendor/jxl-encoder/PROVENANCE.json.
import {codecError, byteView, boundedDimensions} from './header.mjs';

export function createJPEGXLCodec({encoderFactory, encoderWasm}) {
  if (typeof document !== 'undefined') throw codecError('JXL_THREAD_REQUIRED', 'JPEG XL must run in an image worker.');
  let encoder;
  let stage = 'starting';
  const concise = value => String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 512);
  const initialize = async () => {
    stage = 'unpacking encoder';
    if (typeof WebAssembly !== 'object' || typeof encoderFactory !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL codec is unavailable.');
    let binary = encoderWasm;
    if (typeof binary === 'string') {
      const source = atob(binary);
      binary = new Uint8Array(source.length);
      for (let i = 0; i < source.length; i++) binary[i] = source.charCodeAt(i);
    }
    const wasmBinary = new Uint8Array(await new Response(new Blob([byteView(binary)]).stream()
      .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    stage = 'starting encoder';
    return encoderFactory({wasmBinary});
  };
  return Object.freeze({
    async encode(image, options = {}) {
      stage = 'checking image';
      const {width, height} = boundedDimensions(image?.width, image?.height), data = byteView(image.data);
      if (data.byteLength !== width * height * 4) throw codecError('JXL_RGBA', 'JPEG XL encoding requires one RGBA value per pixel.');
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
      const lossless = options.lossless === true, quality = lossless ? 100 : options.quality ?? 90, effort = options.effort ?? (quality === 100 ? 1 : 3);
      if (!Number.isFinite(quality) || quality < 0 || quality > 100 || !Number.isInteger(effort) || effort < 1 || effort > 9) throw codecError('JXL_OPTIONS', 'JPEG XL quality must be 0–100 and effort 1–9.');
      const module = await (encoder ||= initialize());
      stage = 'encoding image';
      // The pinned wrapper bounds and copies its result before releasing the WASM heap.
      // Header/pixel round trips belong to the encoder witnesses, not a second runtime reader.
      try { return module.encode(data, width, height, {quality, effort}); }
      // A trap leaves its allocations in the heap: the next encode gets a fresh instance.
      catch (error) { if (!error?.code || error.code === 'JXL_MEMORY') encoder = undefined; throw error; }
    },
    // No decode (R83): browsers read JPEG XL themselves.
    failure(error) {
      const reason = concise((error?.name && error.name !== 'Error' ? error.name + ': ' : '') + String(error?.message || error || '')) ||
        'The codec returned no failure details.';
      const detail = reason;
      const policy = /Content Security Policy|code generation|unsafe-eval|wasm-unsafe-eval/i.test(detail);
      const allocation = /out of memory|bad_alloc|allocation failed|cannot (?:allocate|enlarge|grow).*memory|memory (?:allocation|growth) failed/i.test(detail);
      const code = concise(error?.code) || (policy ? 'JXL_POLICY' : allocation ? 'JXL_MEMORY' :
        stage.startsWith('unpacking') ? 'JXL_UNPACK' : stage.startsWith('starting') ? 'JXL_INITIALIZE' :
        stage === 'encoding image' ? 'JXL_ENCODE' : 'JXL_CODEC');
      const message = error?.code ? reason : policy ? 'This host blocks JPEG XL codec execution.' :
        allocation ? 'JPEG XL could not allocate enough memory for this image.' :
        stage.startsWith('unpacking') ? 'Rapier could not unpack its bundled JPEG XL codec.' :
        stage.startsWith('starting') ? 'Rapier could not start its bundled JPEG XL codec.' :
        stage === 'encoding image' ? 'JPEG XL could not encode this image.' :
        'JPEG XL image processing failed.';
      return {code, stage, detail, message: message + (!error?.code ? '\n\nDetails (' + stage + '): ' + detail : '')};
    }
  });
}

export function installJPEGXLWorker(configuration) {
  const codec = createJPEGXLCodec(configuration);
  let busy = false;
  globalThis.onmessage = async ({data: request}) => {
    const id = request?.id;
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id).length > 128) return;
    if (busy) {
      globalThis.postMessage({id, ok: false, error: {code: 'JXL_BUSY', message: 'The image worker is busy.'}});
      return;
    }
    busy = true;
    try {
      if (request.operation === 'encode') {
        const bytes = await codec.encode({width: request.width, height: request.height, data: request.data}, request.options);
        globalThis.postMessage({id, ok: true, bytes}, [bytes.buffer]);
      } else throw codecError('JXL_OPERATION', 'Unknown JPEG XL operation.');
    } catch (error) {
      globalThis.postMessage({id, ok: false, error: codec.failure(error)});
    } finally {
      busy = false;
    }
  };
}
