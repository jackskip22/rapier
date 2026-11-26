import {DESCRIPTION, described, decodedFields} from './describe.mjs';
import {ordinaryStillReader, predictedFacts} from './ordinary-still-policy.mjs';
import {bytes, check, dimensions, fail, object, isCaller, pixelLimit, PIXELS, NO_JPEG, JPEG_ELSEWHERE, blobBytes, isBlob} from './primitives.mjs';
import {exactFidelity, measuredFidelity} from './fidelity.mjs';
import {encodeOptions, callOptions} from './encode-options.mjs';
import {featureless} from './first-region-option.mjs';
import {runCapture} from './run-capture.mjs';
import {requireWebGPU} from './webgpu.mjs';
import {needsBands} from './band-size.mjs';
import {inspectPhone} from './phone-container.mjs';
import {resultFacts} from './result-reference.mjs';
import {MEASURED_EFFORT} from '../effort-level.mjs';
import {captureRefused} from '../fault.mjs';

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
  options = featureless(options);
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
  const {image, jpegDimensions, admitJpeg} = operation === 'decode' || operation === 'restore' ? {} : await import('./input.mjs');
  let drain, acceleration, describedRoute, deviceAgain;
  const loadEncodeDeps = async () => {
    [{drain}, {acceleration, describedRoute, deviceAgain}] = await (cachedEncodeDeps ||= Promise.all([import('./common.mjs'), import('./acceleration.mjs')]));
  };
  if (operation !== 'decode' && operation !== 'restore' && !exactScreen) await loadEncodeDeps();
  check(hooks.signal);
  const finish = iterator => drain(iterator, hooks);
  if (operation === 'encode') {
    let normalized;
    ({codec: normalized, hooks} = callOptions(encodeOptions(options), hooks));
    const intent = normalized.qualityIntent;
    const reader = ordinaryStillReader({signal: hooks.signal, maxPixels: hooks.maxPixels});
    try {
      if (hooks.webgpu === 'required')
        await requireWebGPU('required', normalized.quality < 100 || normalized.target !== undefined, normalized.effort);
      if (isBlob(input) && normalized.quality === 100 && normalized.target === undefined &&
          options.readAs === undefined && options.features === undefined) {
        const head = await blobBytes(input, hooks.signal, 0, 2);
        check(hooks.signal);
        if (head[0] === 255 && head[1] === 216) throw fail('JXL_OPTIONS', JPEG_ELSEWHERE);
      }
      const picture = await image(input, options, {...hooks, phone: inspectPhone, deep: async () => {
        const [{readPNG16}, {orientSamples}] = await Promise.all([import('../source.mjs'), import('../sample-transforms.mjs')]);
        return {readSource: readPNG16, orient: orientSamples};
      }});
      const {data,width,height,...source} = picture;
      check(hooks.signal);
      normalized = reader.read(normalized, picture, {exactAllowed: !featured && normalized.target === undefined}) ??
        await reader.project(normalized, picture);
      const {target, ...codec} = {...source,...normalized};
      if (intent !== undefined && codec.quality === 100) resultFacts(options, {kept: 'pixels', measurements: []});
      else if (predictedFacts(codec)) resultFacts(options, predictedFacts(codec));
      if (target !== undefined && featured)
        throw fail('JXL_INPUT', "measured fidelity: remove orientation, extraChannels or features");
      if (exactScreen && typeof codec.colorSpace !== 'object' && codec.effort === 1 && !(codec.quality < 100)) {
        const {screenLike} = await import('../screen.mjs');
        if (screenLike(data, width, height)) {
          const {captureAnswer} = await import('../screen-floor.mjs');
          try {
            const captured = await captureAnswer({data, width, height, colorSpace: codec.colorSpace}, hooks.signal);
            if (captured instanceof Uint8Array) return captured;
          } catch (error) { check(hooks.signal); if (!captureRefused(error)) throw error; }
        }
      }
      if (!drain) await loadEncodeDeps();
      const preloaded = target === undefined && !featured ? preloadCaptureCoder(data, width, height, codec) : null;

      if (featured) {
        if (codec.quality === 100 || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray))
          throw fail('JXL_UNSUPPORTED', 'orientation/channels/features: 8-bit lossy; channels via format({kind: \'channels\'})');
        const {encodePhotoSteps} = await import('../photo-advanced.mjs');
        await acceleration(hooks.webgpu, 0, 0, codec.effort, 'codestream features');
        return await finish(encodePhotoSteps(data, width, height, {...codec,...options.features}));
      }
      await preloaded;
      const encodePicture = (picture, hooks, coding = codec, whole = true) =>
        deviceAgain(hooks.webgpu, webgpu => encodeWith(picture, {...hooks, webgpu}, coding, whole));
      const encodeWith = async ({data, width, height}, hooks, coding, whole) => {
        const gpu = await acceleration(hooks.webgpu, width, height, coding.quality < 100 ? coding.effort : 0, describedRoute(data, coding), undefined, hooks.signal);
        if (whole && intent !== undefined && coding.effort >= MEASURED_EFFORT && coding.quality < 100) {
          const [{stillPhotoTargetSteps}, {effortJob}, {EXACT_LADDER}] = await Promise.all([
            import('./still-photo-target.mjs'), encoder ?? import('../effort-job.mjs'), import('../exact-ladder.mjs'),
          ]);
          const target = stillPhotoTargetSteps(data, width, height, coding, {intent, signal: hooks.signal, maxPixels: hooks.maxPixels,
            selected: facts => resultFacts(options, facts),
            exact: () => effortJob(data, width, height, {...coding, quality: 100, effort: 5}, false,
              undefined, undefined, undefined, EXACT_LADDER)});
          if (target) return drive ? drive(target, hooks, gpu, width * height, true) : drain(target, hooks, gpu);
        }
        if (coding.lowIntent !== undefined && coding.quality < 100) {
          const {lowPhotoSteps} = await import('./low-photo.mjs');
          const low = lowPhotoSteps(data, width, height, coding);
          if (low) return drive ? drive(low, hooks, gpu, width * height, true) : drain(low, hooks, gpu);
        }
        const hdr = coding.quality < 100 && (data instanceof Float32Array || data instanceof Uint16Array || coding.sampleFormat === 'float16')
          ? {...(await import('../photo-hdr.mjs')).HDR, report: facts => resultFacts(options, facts)} : null;
        if (coding.effort === 1) {
          const {coreSteps} = await (instant ?? import('./instant.mjs'));
          return drain(coreSteps(data, width, height, coding, hdr), hooks, gpu);
        }
        const {effortJob} = await (encoder ?? import('../effort-job.mjs'));
        const search = coding.quality < 100 && coding.effort >= 8 ? (await import('../photo-v6-search.mjs')).searchV6 : undefined;
        const writer = coding.quality < 100 && coding.effort >= 6 ? (await (blocks ?? (cachedBlocks ||= import('../photo-v6-blocks.mjs')))).photoAnsSteps : undefined;
        const deep = coding.effort >= 4 ? await (cachedDeep ||= import('../exact-ladder.mjs').then(({EXACT_LADDER}) => EXACT_LADDER)) : null;
        check(hooks.signal);
        const steps = effortJob(data, width, height, coding, !!gpu, undefined, search, writer, deep, hdr);
        return drive ? drive(steps, hooks, gpu, width * height) : drain(steps, hooks, gpu);
      };
      if (target !== undefined) {
        const {scoreTarget} = await import('./score-target.mjs');
        const {data, width, height, ...source} = picture;
        const answer = await scoreTarget(data, width, height, source, codec, target, hooks, hooks.webgpu);
        resultFacts(options, answer.facts);
        return answer.bytes;
      }

      if (needsBands(width, height, codec, data)) {
        const [{encodeBands}, {recodeBand}, {HDR}] = await Promise.all([import('./bands.mjs'), import('./band-recode.mjs'), import('../photo-hdr.mjs')]);
        const writer = codec.quality < 100 && codec.effort >= 6 ? (await (blocks ?? (cachedBlocks ||= import('../photo-v6-blocks.mjs')))).photoAnsSteps : undefined;
        const search = codec.quality < 100 && codec.effort >= 8 ? (await import('../photo-v6-search.mjs')).searchV6 : undefined;
        return await encodeBands({width, height, read: (y, rows) => ({...source, data: data.subarray(y * width * 4, (y + rows) * width * 4), width, height: rows})},
          (band, bandHooks) => encodePicture(band, {...hooks, ...bandHooks}, codec, false), (band, target) => recodeBand(band, normalized, target, HDR, writer, search), drain, hooks);
      }
      return await encodePicture({data, width, height}, hooks);
    } finally { reader.destroy(); }
  }
  if (operation === 'recompress') {
    const allowed = new Set(['effort','maxPixels','signal','onProgress']);
    for (const key of Object.keys(options)) if (!allowed.has(key)) throw fail('JXL_OPTIONS', `unknown option: ${key}`);
    const {maxPixels: limit, ...jpegOptions} = options, queue = hooks.maxPixels ?? PIXELS;
    hooks = {...hooks, maxPixels: limit === undefined ? queue : Math.min(pixelLimit(limit), queue)};
    options = jpegOptions;
    if (isBlob(input)) {
      if (input.size) await admitJpeg(input, hooks.maxPixels, hooks.signal);
      input = await blobBytes(input, hooks.signal);
    }
    bytes(input); jpegDimensions(input, hooks.maxPixels); check(hooks.signal);
    const {ansTranscodeSteps} = await import('../jpeg-ans-effort.mjs');
    await acceleration(false, 0, 0);
    return finish(ansTranscodeSteps(input, {...options, effort: options.effort ?? 7}));
  }
  if (operation === 'restore' || operation === 'decode') {
    if (operation === 'restore') for (const key of Object.keys(options)) if (key !== 'signal' && key !== 'onProgress' && key !== 'maxPixels') throw fail('JXL_OPTIONS', `unknown option: ${key}`);
    if (operation === 'restore') { const queue = hooks.maxPixels ?? PIXELS; hooks = {...hooks, maxPixels: options.maxPixels === undefined ? queue : Math.min(pixelLimit(options.maxPixels), queue)}; }
    const bounds = options;
    if (isBlob(input)) input = await blobBytes(input, hooks.signal);
    bytes(input);
    let result;
    if (operation === 'restore') {
      if (input[0] === 255 && input[1] === 10) throw fail('JXL_RECONSTRUCTION', NO_JPEG);
      const {restoreJPEG} = await import('../jpeg-reconstruction.mjs');
      const limits = {maxPixels: hooks.maxPixels};
      check(hooks.signal);
      try { result = restoreJPEG(input, undefined, limits); }
      catch (error) {
        if (error?.code !== 'JXL_DICTIONARY') throw error;
        const {brotliDictionary} = await import('../brotli-dictionary.mjs');
        check(hooks.signal); result = restoreJPEG(input, brotliDictionary, limits);
      }
      if (!result) throw fail('JXL_RECONSTRUCTION', NO_JPEG);
    } else {
      const [{decodeBands}, {decodeOptions}, {loadPart}, {decodeLimits}] = await (decodeModules ??= Promise.all([import('../decode-parallel.mjs'), import('../decode-image.mjs'), import('../decode-parts.mjs'), import('./decode-limits.mjs')]).catch(error => { decodeModules = undefined; throw error; }));
      check(hooks.signal);
      const maxPixels = Math.min(bounds.maxPixels ?? Infinity, hooks.maxPixels ?? PIXELS), limits = {...bounds, ...decodeLimits({...bounds, maxPixels}), maxPixels};
      if (bounds.region !== undefined) {
        const {admitRegion} = await import('./region.mjs');
        limits.region = admitRegion(bounds.region);
      }
      let dictionary;
      for (;;) try { result = decodeBands(input, decodeOptions(dictionary ? {...limits, dictionary} : limits)); break; }
      catch (error) {
        if (await loadPart(error)) { check(hooks.signal); continue; }
        if (error?.code !== 'JXL_DICTIONARY' || dictionary) throw error;
        ({brotliDictionary: dictionary} = await import('../brotli-dictionary.mjs'));
        check(hooks.signal);
      }
      Object.assign(result, decodedFields(result));
      if (limits.region) result.region = {...limits.region};
      for (const frame of [result, ...(result.frames ?? []), result.preview]) clamped(frame);
    }
    check(hooks.signal); hooks.onProgress?.(1); return result;
  }
  if (operation === 'animate') {
    let settings;
    ({codec: settings, hooks} = callOptions(encodeOptions(options), hooks));
    const {target} = settings; delete settings.target;
    if (hooks.webgpu === 'required') await requireWebGPU('required', settings.quality < 100, settings.quality < 100 ? settings.effort : 0);
    if (target !== undefined || options.features !== undefined)
      throw fail('JXL_OPTIONS', "animation fidelity: exact|{quality}, no features");
    if (input.orientation !== undefined || input.extraChannels !== undefined)
      throw fail('JXL_INPUT', "animation: no orientation/extra channels");
    const codec = {...described(input), ...settings};
    dimensions(input?.width, input?.height, hooks.maxPixels);
    await acceleration(hooks.webgpu, 0, 0, codec.quality < 100 ? codec.effort : 0, 'an animation');
    const {encodeAnimationJob} = await import('../animation-steps.mjs');
    if (codec.quality < 100 && codec.effort >= 8) (await import('../animation-frames.mjs')).useMeasuredSearch((await import('../photo-v6-search.mjs')).searchV6);
    const {animationPhoto} = await import('./animation-photo.mjs');
    const answer = await animationPhoto(input, codec,
      (coding, onProgress) => drain(encodeAnimationJob(input, coding, true), {...hooks, onProgress}), hooks);
    const [{animationTiming}, {displayedAnimationFrames}] = await Promise.all([import('../animation-frames.mjs'), import('../animation-timeline.mjs')]);
    resultFacts(options, {kept: answer.exact ? 'pixels' : 'lossy', measurements: answer.measurements,
      timing: animationTiming(displayedAnimationFrames(input).map(frame => frame.duration))});
    return answer.bytes;
  }
  if (operation === 'format') {
    await acceleration(false, 0, 0);
    const {author} = await import('./author.mjs');
    return author(input, options, hooks);
  }
  throw fail('JXL_OPERATION', `operation: public function required`);
}

function clamped(frame) {
  const data = frame?.data;
  if (data instanceof Uint8Array) frame.data = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
}
