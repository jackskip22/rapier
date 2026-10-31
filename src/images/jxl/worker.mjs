// SPDX-License-Identifier: MIT
import {codecError, byteView, boundedDimensions, CONTRACT_VERSION} from './worker-input.mjs';
import {checkSignal} from './async-job.mjs';
import {admitStill} from './still-admit.mjs';
import {BALANCED_EFFORT} from './effort-level.mjs';

function choices(options) {
  const admitted = admitStill(options);
  const source = options && typeof options === 'object' ? options : {};
  const photo = source.photo ?? (source.preset ? admitted.photo : undefined);
  return {quality: admitted.quality, effort: admitted.effort, photo};
}

export function createJPEGXLCodec({encoderFactory, imageReader, formatHandler}) {
  if (typeof document !== 'undefined') throw codecError('JXL_THREAD_REQUIRED', 'JPEG XL must run in an image worker.');
  let encoder;
  let stage = 'starting';
  const concise = value => String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 512);
  const codec = Object.freeze({
    async encode(image, options = {}) {
      stage = 'checking image';
      const admitted = admitStill(options, {data: image?.data, width: image?.width, height: image?.height});
      if (typeof encoderFactory !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL codec is unavailable.');
      stage = 'starting encoder';
      encoder ||= encoderFactory();
      stage = 'encoding image';
      return encoder.encode(admitted.data, admitted.width, admitted.height, admitted.options);
    },
    async animation(input, options = {}) {
      stage = 'checking image';
      if (input?.options && typeof input.options === 'object') options = {...input.options, ...options};
      const {width, height} = boundedDimensions(input?.width, input?.height);
      if (!Array.isArray(input.frames) || !input.frames.length) throw codecError('JXL_INPUT', 'An animation has at least one frame.');
      const frames = input.frames.map(frame => {
        const data = frame?.data instanceof Uint16Array || frame?.data instanceof Float32Array ? frame.data : byteView(frame?.data);
        if (data.length !== width * height * 4) throw codecError('JXL_RGBA', 'JPEG XL encoding requires one RGBA value per pixel.');
        return {data, duration: frame.duration};
      });
      const {quality, effort, photo} = choices(options);
      if (typeof encoderFactory !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL codec is unavailable.');
      stage = 'starting encoder';
      encoder ||= encoderFactory();
      if (typeof encoder.animation !== 'function') throw codecError('JXL_UNAVAILABLE', 'Animation needs JPEG XL complete.');
      stage = 'encoding image';
      return encoder.animation({width, height, loops: input.loops ?? 0, frames}, {...options, quality, effort, ...(photo === undefined ? {} : {photo})});
    },
    async transcode(input, options = {}) {
      stage = 'checking image';
      const jpeg = byteView(input?.bytes);
      if (!jpeg.byteLength) throw codecError('JXL_INPUT', 'The JPEG is empty.');
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
      const effort = options.effort ?? BALANCED_EFFORT;
      if (!Number.isInteger(effort) || effort < 1 || effort > 9) throw codecError('JXL_OPTIONS', 'JPEG XL effort must be 1–9.');
      if (typeof encoderFactory !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL codec is unavailable.');
      stage = 'starting encoder';
      encoder ||= encoderFactory();
      if (typeof encoder.transcode !== 'function') throw codecError('JXL_UNAVAILABLE', 'JPEG recompression needs the JPEG or still entry.');
      stage = 'carrying the JPEG';
      return encoder.transcode(jpeg, {...options, effort});
    },
    async image(input, options = {}) {
      stage = 'reading image';
      if (typeof imageReader !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL codec cannot read pictures.');
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
      choices({...options, quality: options.quality === undefined ? 100 : options.quality});
      checkSignal(options.signal);
      const read = await imageReader(input?.source, options.transcode !== false);
      checkSignal(options.signal);
      if (read.jpeg) return codec.transcode({bytes: read.jpeg}, {effort: options.effort, progress: options.progress, signal: options.signal, hurrySignal: options.hurrySignal});
      if (read.colorSpace !== undefined && options.colorSpace !== undefined && options.colorSpace !== read.colorSpace)
        throw codecError('JXL_OPTIONS', 'The declared colorSpace does not match the decoded browser pixels.');
      const lossy = options.quality !== undefined && options.quality < 100;
      return {bytes: await codec.encode(read, {...options, lossless: !lossy, photo: lossy, ...(read.colorSpace === undefined || options.icc !== undefined ? {} : {colorSpace: read.colorSpace})})};
    },
    async reconstruct(input, options = {}) {
      stage = 'restoring the JPEG';
      const bytes = byteView(input?.bytes);
      if (!bytes.byteLength) throw codecError('JXL_INPUT', 'The JPEG XL is empty.');
      if (typeof encoderFactory !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL codec is unavailable.');
      encoder ||= encoderFactory();
      if (typeof encoder.reconstruct !== 'function') throw codecError('JXL_UNAVAILABLE', 'JPEG reconstruction needs the JPEG or still entry.');
      const dictionary = input?.dictionary === undefined ? undefined : byteView(input.dictionary);
      return encoder.reconstruct(bytes, {signal: options.signal, ...(dictionary ? {dictionary} : {})});
    },
    async format(input, options = {}) {
      stage = 'checking format request';
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw codecError('JXL_INPUT', 'JPEG XL format input is invalid.');
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
      checkSignal(options.signal);
      if (typeof formatHandler !== 'function') throw codecError('JXL_UNAVAILABLE', 'The bundled JPEG XL format writer is unavailable.');
      stage = 'processing JPEG XL format';
      const result = await formatHandler(input, {signal: options.signal, onProgress: options.progress});
      checkSignal(options.signal);
      return result;
    },
    serve(message, report) {
      if (typeof encoderFactory !== 'function') return null;
      encoder ||= encoderFactory();
      return encoder.serve?.(message, report) ?? null;
    },
    failure(error) {
      const reason = concise((error?.name && error.name !== 'Error' ? error.name + ': ' : '') + String(error?.message || error || '')) ||
        'The codec returned no failure details.';
      const detail = reason;
      const allocation = error instanceof RangeError || /out of memory|allocation failed|Array buffer allocation/i.test(detail);
      const code = concise(error?.code) || (allocation ? 'JXL_MEMORY' :
        stage.startsWith('starting') ? 'JXL_INITIALIZE' : stage === 'encoding image' ? 'JXL_ENCODE' : stage === 'carrying the JPEG' ? 'JXL_JPEG' : 'JXL_CODEC');
      const message = error?.code ? reason : allocation ? 'JPEG XL could not allocate enough memory for this image.' :
        stage.startsWith('starting') ? 'Rapier could not start its bundled JPEG XL codec.' :
        stage === 'encoding image' ? 'JPEG XL could not encode this image.' :
        stage === 'carrying the JPEG' ? 'This JPEG could not be carried into JPEG XL.' :
        'JPEG XL image processing failed.';
      return {code, stage, detail, message: message + (!error?.code ? '\n\nDetails (' + stage + '): ' + detail : ''), ...(error?.dictionary === true ? {dictionary: true} : {})};
    }
  });
  return codec;
}

export function installJPEGXLWorker(configuration) {
  const codec = createJPEGXLCodec(configuration);
  const closeSource = request => { if (typeof ImageBitmap === 'function' && request?.source instanceof ImageBitmap) request.source.close(); };
  let active = null;
  globalThis.onmessage = async ({data: request}) => {
    if (request?.protocol === 'rapier-jxl' && request.id === undefined) { globalThis.postMessage({protocol: 'rapier-jxl', version: CONTRACT_VERSION}); return; }
    if (request?.pool) { const reply = codec.serve(request, message => globalThis.postMessage(message)); if (reply) globalThis.postMessage(...reply); return; }
    const id = request?.id;
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id).length > 128) { closeSource(request); return; }
    if (request.operation === 'cancel') {
      if (active?.id === id) active.controller.abort(Object.hasOwn(request, 'reason') ? request.reason
        : codecError('JXL_ABORTED', 'JPEG XL encoding was canceled.'));
      closeSource(request);
      return;
    }
    if (request.operation === 'hurry') {
      if (active?.id === id) active.hurry.abort();
      return;
    }
    if (active) {
      closeSource(request);
      globalThis.postMessage({id, ok: false, error: {code: 'JXL_BUSY', message: 'The image worker is busy.'}});
      return;
    }
    const controller = new AbortController(), hurry = new AbortController();
    active = {id, controller, hurry};
    const reply = (message, transfer) => { checkSignal(controller.signal); globalThis.postMessage(message, transfer); };
    try {
      let reported = 0, at = 0;
      const progress = request.progress === true ? value => {
        const now = Date.now();
        if (typeof value !== 'number' || !(value > reported) || value > 1 || value < 1 && (value - reported < 0.01 || now - at < 100)) return;
        reported = value; at = now;
        globalThis.postMessage({id, progress: value});
      } : undefined;
      const advance = progress ? value => { if (value < 1) progress(value); } : undefined;
      if (request.options !== undefined && (!request.options || typeof request.options !== 'object' || Array.isArray(request.options)))
        throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
      if (request.operation === 'encode') {
        const bytes = await codec.encode({width: request.width, height: request.height, data: request.data}, {...request.options, progress: advance, signal: controller.signal, hurrySignal: hurry.signal});
        progress?.(1);
        reply({id, ok: true, bytes}, [bytes.buffer]);
      } else if (request.operation === 'animation') {
        const bytes = await codec.animation({width: request.width, height: request.height, loops: request.loops, frames: request.frames}, {...request.options, progress: advance, signal: controller.signal, hurrySignal: hurry.signal});
        progress?.(1);
        reply({id, ok: true, bytes}, [bytes.buffer]);
      } else if (request.operation === 'transcode') {
        const carried = await codec.transcode({bytes: request.bytes}, {...request.options, progress: advance, signal: controller.signal, hurrySignal: hurry.signal});
        progress?.(1);
        reply({id, ok: true, ...carried}, [carried.bytes.buffer]);
      } else if (request.operation === 'image') {
        const made = await codec.image({source: request.source}, {...request.options, progress: advance, signal: controller.signal, hurrySignal: hurry.signal});
        progress?.(1);
        reply({id, ok: true, ...made}, [made.bytes.buffer]);
      } else if (request.operation === 'reconstruct') {
        const bytes = await codec.reconstruct({bytes: request.bytes, dictionary: request.dictionary}, {signal: controller.signal});
        reply({id, ok: true, bytes}, bytes ? [bytes.buffer] : []);
      } else if (request.operation === 'format') {
        const result = await codec.format(request.input, {progress: advance, signal: controller.signal, hurrySignal: hurry.signal});
        progress?.(1);
        if (result instanceof Uint8Array) {
          const bytes = result.buffer instanceof ArrayBuffer && result.byteOffset === 0 && result.byteLength === result.buffer.byteLength
            ? result : new Uint8Array(result);
          reply({id, ok: true, bytes}, [bytes.buffer]);
        } else reply({id, ok: true, result});
      } else throw codecError('JXL_OPERATION', 'Unknown JPEG XL operation.');
    } catch (error) {
      const failure = controller.signal.aborted
        ? codecError('JXL_ABORTED', 'JPEG XL encoding was canceled.') : error;
      globalThis.postMessage({id, ok: false, error: codec.failure(failure),
        ...(controller.signal.aborted ? {reason: controller.signal.reason} : {})});
    } finally {
      closeSource(request);
      active = null;
    }
  };
}

