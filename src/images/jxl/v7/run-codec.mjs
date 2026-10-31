import {DESCRIPTION, described, decodedFields} from './describe.mjs';
import {bytes, check, dimensions, fail, object, isCaller, pixelLimit} from './primitives.mjs';
import {exactFidelity, measuredFidelity} from './fidelity.mjs';
import {runCapture} from './run-capture.mjs';
import {requireWebGPU} from './webgpu.mjs';

async function preloadCaptureCoder(data, width, height, codec) {
  try {
    if (typeof codec.colorSpace === 'object' || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return;
    const {screenLike, flatSamples, CAPTURE_FLAT} = await import('../screen.mjs');
    if (screenLike(data, width, height) || !(codec.quality < 100) && flatSamples(data, width, height) >= CAPTURE_FLAT) {
      const {compileCaptureKernels} = await import('../capture-codec.mjs');
      await compileCaptureKernels();
    }
  } catch {}
}

function plainExact(input, options) {
  if (options.effort !== 1 || !exactFidelity(options.fidelity) || options.features !== undefined) return false;
  return !!input && typeof input === 'object' && (input.data instanceof Uint8Array || input.data instanceof Uint8ClampedArray) &&
    DESCRIPTION.every(key => input[key] === undefined);
}

let decodeModules;
let cachedEncodeDeps = null, cachedEffortJob = null, cachedBlocks = null, cachedDeep = null, cachedInstant = null, cachedKernels = null;
export async function runCodec(operation, input, options = {}, hooks = {}, drive) {
  object(options); check(hooks.signal);
  if (operation === 'capture') return runCapture(input, options, hooks);
  if (operation === 'encode' && Array.isArray(input?.frames)) operation = 'animate';
  const exactScreen = operation === 'encode' && plainExact(input, options);
  const featured = options.features !== undefined || operation === 'encode' && !!input && typeof input === 'object' &&
    (input.orientation !== undefined || input.extraChannels !== undefined);
  const measured = operation === 'encode' && measuredFidelity(options.fidelity);
  const encoder = operation === 'encode' && options.effort !== 1 && !featured && !measured ? (cachedEffortJob ||= import('../effort-job.mjs')) : null;
  const instant = operation === 'encode' && !exactScreen && options.effort === 1 && !featured && !measured ?
    (cachedInstant ||= import('./instant.mjs')) : null;
  const kernels = operation === 'encode' && !exactScreen ? (cachedKernels ||= import('../kernels.mjs')) : null;
  const blocks = encoder && (options.effort ?? 7) >= 6 && !exactFidelity(options.fidelity) ? (cachedBlocks ||= import('../photo-v6-blocks.mjs')) : null;
  encoder?.catch(() => {}); blocks?.catch(() => {}); instant?.catch(() => {}); kernels?.catch(() => {});
  const [{drain, encodeOptions, callOptions, targetSource}, {image, jpegDimensions}, {acceleration, describedRoute}] = operation === 'decode' || operation === 'restore' ? [{}, {}, {}]
    : await (cachedEncodeDeps ||= Promise.all([import('./common.mjs'), import('./input.mjs'), import('./acceleration.mjs')]));
  check(hooks.signal);
  const finish = iterator => drain(iterator, hooks);
  if (operation === 'encode') {
    let normalized;
    ({codec: normalized, hooks} = callOptions(encodeOptions(options), hooks));
    if (hooks.webgpu === 'required')
      await requireWebGPU('required', normalized.quality < 100 || normalized.target !== undefined, normalized.effort);
    let carried = null;
    if (typeof Blob !== 'undefined' && input instanceof Blob && normalized.quality === 100 && normalized.target === undefined &&
        options.readAs === undefined && options.features === undefined) {
      const head = new Uint8Array(await input.slice(0, 2).arrayBuffer());
      check(hooks.signal);
      if (head[0] === 255 && head[1] === 216) {
        const jpeg = new Uint8Array(await input.arrayBuffer());
        check(hooks.signal);
        try { return await runCodec('recompress', jpeg, {effort: normalized.effort}, hooks); }
        catch (error) { if (error?.code !== 'JXL_JPEG') throw error; check(hooks.signal); carried = error; }
      }
    }
    let picture;
    try { picture = await image(input, options, {...hooks, deep: () => import('../source.mjs')}); }
    catch (error) {
      if (carried && !isCaller(error) && typeof error?.code === 'string' && error.code.startsWith('JXL_') && error.code !== 'JXL_ABORTED')
        throw Object.assign(carried, {cause: error});
      throw error;
    }
    const {data,width,height,...source} = picture;
    check(hooks.signal);
    const {target, ...codec} = {...source,...normalized};
    if (exactScreen && typeof codec.colorSpace !== 'object' && codec.effort === 1 && !(codec.quality < 100)) {
      const {screenLike} = await import('../screen.mjs');
      if (screenLike(data, width, height)) {
        const {captureAnswer} = await import('../screen-floor.mjs');
        try {
          const captured = await captureAnswer({data, width, height, colorSpace: codec.colorSpace});
          if (captured instanceof Uint8Array) return captured;
        } catch (error) { if (typeof error?.code !== 'string' || !error.code.startsWith('JXL_') || error.code === 'JXL_ABORTED') throw error; }
      }
    }
    const preloaded = target === undefined && !featured ? preloadCaptureCoder(data, width, height, codec) : null;
    if (target !== undefined) {
      if (source.orientation !== undefined || source.extraChannels !== undefined)
        throw fail('JXL_INPUT', 'A measured fidelity takes 8-bit straight sRGB RGBA, without orientation or extra channels.');
      targetSource(data, source, codec);
      const {encodeToScoreSteps} = await import('./score-steps.mjs');
      await acceleration(hooks.webgpu, 0, 0, codec.effort, 'a measured fidelity');
      const result = await finish(encodeToScoreSteps(data, width, height, {target, effort: codec.effort}));
      return result.bytes;
    }
    if (featured) {
      if (codec.quality === 100 || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray))
        throw fail('JXL_UNSUPPORTED', 'Orientation, extra channels and features need an 8-bit lossy encode in this version; exact and deeper samples write them in a later 8.x. format({kind: \'channels\'}) writes extra channels exactly now.');
      const {encodePhotoSteps} = await import('../photo-advanced.mjs');
      await acceleration(hooks.webgpu, 0, 0, codec.effort, 'codestream features');
      return finish(encodePhotoSteps(data, width, height, {...codec,...options.features}));
    }
    const gpu = await acceleration(hooks.webgpu, width, height, codec.quality < 100 ? codec.effort : 0, describedRoute(data, codec));
    await preloaded;
    if (codec.effort === 1) {
      const {coreSteps} = await (instant ?? import('./instant.mjs'));
      return drain(coreSteps(data, width, height, codec, !!gpu), hooks, gpu);
    }
    const {effortJob} = await (encoder ?? import('../effort-job.mjs'));
    const search = codec.quality < 100 && codec.effort >= 8 ? (await import('./search.mjs')).searchV6 : undefined;
    const writer = codec.quality < 100 && codec.effort >= 6 ? (await (blocks ?? (cachedBlocks ||= import('../photo-v6-blocks.mjs')))).photoAnsSteps : undefined;
    const deep = codec.effort >= 4 ? await (cachedDeep ||= import('../exact-ladder.mjs').then(({EXACT_LADDER}) => EXACT_LADDER)) : null;
    check(hooks.signal);
    const steps = effortJob(data, width, height, codec, !!gpu, undefined, search, writer, deep);
    return drive ? drive(steps, hooks, gpu, width * height) : drain(steps, hooks, gpu);
  }
  if (operation === 'recompress') {
    const allowed = new Set(['effort','icc','maxPixels','signal','onProgress']);
    for (const key of Object.keys(options)) if (!allowed.has(key)) throw fail('JXL_OPTIONS', `Unknown JPEG option: ${key}.`);
    const {maxPixels: limit, ...jpegOptions} = options;
    if (limit !== undefined) hooks = {...hooks, maxPixels: Math.min(pixelLimit(limit), hooks.maxPixels ?? 40000000)};
    options = jpegOptions;
    if (typeof Blob !== 'undefined' && input instanceof Blob) input = new Uint8Array(await input.arrayBuffer());
    bytes(input); jpegDimensions(input, hooks.maxPixels); check(hooks.signal);
    const {ansTranscodeSteps} = await import('../jpeg-ans-effort.mjs');
    await acceleration(false, 0, 0);
    return finish(ansTranscodeSteps(input, {...options, effort: options.effort ?? 7}));
  }
  if (operation === 'restore' || operation === 'decode') {
    if (operation === 'restore') for (const key of Object.keys(options)) if (key !== 'signal' && key !== 'onProgress' && key !== 'maxPixels') throw fail('JXL_OPTIONS', `Unknown restore option: ${key}.`);
    if (operation === 'restore' && options.maxPixels !== undefined) hooks = {...hooks, maxPixels: Math.min(pixelLimit(options.maxPixels), hooks.maxPixels ?? 40000000)};
    const bounds = options;
    if (typeof Blob !== 'undefined' && input instanceof Blob) input = new Uint8Array(await input.arrayBuffer());
    bytes(input);
    let result;
    if (operation === 'restore') {
      if (input[0] === 255 && input[1] === 10) throw fail('JXL_RECONSTRUCTION', 'The file contains no JPEG reconstruction data.');
      const {restoreJPEG} = await import('../jpeg-reconstruction.mjs');
      const limits = {maxPixels: hooks.maxPixels ?? 40000000};
      check(hooks.signal);
      try { result = restoreJPEG(input, undefined, limits); }
      catch (error) {
        if (error?.code !== 'JXL_DICTIONARY') throw error;
        const {brotliDictionary} = await import('../brotli-dictionary.mjs');
        check(hooks.signal); result = restoreJPEG(input, brotliDictionary, limits);
      }
      if (!result) throw fail('JXL_RECONSTRUCTION', 'The file contains no JPEG reconstruction data.');
    } else {
      const [{decodeBands}, {decodeOptions}, {loadPart}] = await (decodeModules ??= Promise.all([import('../decode-parallel.mjs'), import('../decode-image.mjs'), import('../decode-parts.mjs')]).catch(error => { decodeModules = undefined; throw error; }));
      check(hooks.signal);
      const limits = {...bounds, maxPixels: Math.min(bounds.maxPixels ?? Infinity, hooks.maxPixels ?? 40000000)};
      let dictionary;
      for (;;) try { result = decodeBands(input, decodeOptions(dictionary ? {...limits, dictionary} : limits)); break; }
      catch (error) {
        if (await loadPart(error)) { check(hooks.signal); continue; }
        if (error?.code !== 'JXL_DICTIONARY' || dictionary) throw error;
        ({brotliDictionary: dictionary} = await import('../brotli-dictionary.mjs'));
        check(hooks.signal);
      }
      Object.assign(result, decodedFields(result));
      for (const frame of [result, ...(result.frames ?? []), result.preview]) clamped(frame);
    }
    check(hooks.signal); hooks.onProgress?.(1); return result;
  }
  if (operation === 'animate') {
    let settings;
    ({codec: settings, hooks} = callOptions(encodeOptions(options), hooks));
    const {target} = settings; delete settings.target;
    if (hooks.webgpu === 'required') await requireWebGPU('required', settings.quality < 100, settings.effort);
    if (target !== undefined || options.features !== undefined)
      throw fail('JXL_OPTIONS', 'An animation takes exact or a quality, and no features.');
    if (input.orientation !== undefined || input.extraChannels !== undefined)
      throw fail('JXL_INPUT', 'An animation takes no orientation or extra channels.');
    const codec = {...described(input), ...settings};
    dimensions(input?.width, input?.height, hooks.maxPixels);
    await acceleration(hooks.webgpu, 0, 0, codec.quality < 100 ? codec.effort : 0, 'an animation');
    const {encodeAnimationJob} = await import('../animation-steps.mjs');
    if (codec.quality < 100 && codec.effort >= 8) (await import('../animation-frames.mjs')).useMeasuredSearch((await import('./search.mjs')).searchV6);
    return finish(encodeAnimationJob(input, codec));
  }
  if (operation === 'format') {
    await acceleration(false, 0, 0);
    const {author} = await import('./author.mjs');
    return author(input, options, hooks);
  }
  throw fail('JXL_OPERATION', `Unknown operation: ${operation}.`);
}

function clamped(frame) {
  const data = frame?.data;
  if (data instanceof Uint8Array) frame.data = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
}

