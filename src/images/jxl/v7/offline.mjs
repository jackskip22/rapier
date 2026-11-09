import {effortJob} from '../effort-job.mjs';
import {ordinaryStillReader} from './ordinary-still-policy.mjs';
import {stillPhotoTargetSteps} from './still-photo-target.mjs';
import {lowPhotoSteps} from './low-photo.mjs';
import {searchV6} from '../photo-v6-search.mjs';
import {photoAnsSteps} from '../photo-v6-blocks.mjs';
import {EXACT_LADDER} from '../exact-ladder.mjs';
import {encodePhotoSteps} from '../photo-advanced.mjs';
import {scoreTarget} from './score-target.mjs';
import {coreSteps} from './instant.mjs';
import {check, dimensions, fail, declared, callers} from './primitives.mjs';
import {drain, encodeOptions, callOptions, targetSource} from './common.mjs';
import {own} from './ownership.mjs';
import {surface} from './surface.mjs';
import {acceleration} from './acceleration.mjs';
import {featureless} from './first-region-option.mjs';

export const encode = (input, options) => encodeHere(input, options).catch(error => { throw error === options?.signal?.reason ? error : declared(error); });
async function encodeHere(input, options = {}) {
  options = featureless(options);
  const {codec: {target, ...codec}, hooks: {webgpu, maxPixels}} = callOptions(encodeOptions(options));
  check(options.signal);
  if (typeof Blob !== 'undefined' && input instanceof Blob) throw fail('JXL_INPUT', 'The offline encoder takes pixels, ImageData, a canvas or an ImageBitmap, not a Blob.');
  input = surface(input, {readAs: options.readAs, maxPixels});
  if (Array.isArray(input?.frames)) throw fail('JXL_INPUT', 'The offline encoder takes one picture; use encode for animations.');
  dimensions(input?.width, input?.height, maxPixels);
  const report = options.onProgress, onProgress = report && (fraction => { try { report(fraction); } catch (error) { throw callers(error); } });
  const hooks = {signal: options.signal ?? new AbortController().signal, onProgress};
  const captured = own({input, codec, features: options.features, target}, maxPixels), intent = codec.qualityIntent;
  {
    const reader = ordinaryStillReader({signal: hooks.signal, maxPixels}), picture = captured.input;
    const exactAllowed = captured.features === undefined && target === undefined && picture.orientation === undefined && picture.extraChannels === undefined;
    try { captured.codec = reader.read(codec, picture, {exactAllowed}) ?? await reader.project(codec, picture); }
    finally { reader.destroy(); }
  }
  await acceleration(webgpu, 0, 0, codec.quality < 100 ? codec.effort : 0, 'the one-file still encoder');
  const {data,width,height,...source} = captured.input;
  const featured = captured.features !== undefined || source.orientation !== undefined || source.extraChannels !== undefined;
  if (captured.target !== undefined) {
    if (source.orientation !== undefined || source.extraChannels !== undefined)
      throw fail('JXL_INPUT', 'A measured fidelity needs 8-bit straight sRGB RGBA, no orientation or extra channels.');
    targetSource(data, source, captured.codec);
    return (await scoreTarget(data, width, height, source, captured.codec, captured.target, hooks, webgpu)).bytes;
  }
  if (featured && (captured.codec.quality === 100 || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray)))
    throw fail('JXL_UNSUPPORTED', 'Orientation, extra channels and features need 8-bit lossy; use format({kind: \'channels\'}) for exact extra channels.');
  const settings = {...source, ...captured.codec};
  const measured = featured ? null : stillPhotoTargetSteps(data, width, height, settings, {intent, signal: hooks.signal, maxPixels,
    exact: () => effortJob(data, width, height, {...settings, quality: 100, effort: 4}, false, undefined, undefined, undefined, EXACT_LADDER)});
  const low = featured ? null : measured ?? lowPhotoSteps(data, width, height, settings);
  const steps = featured ? encodePhotoSteps(data, width, height, {...settings, ...captured.features})
    : low ?? (settings.effort === 1 ? coreSteps(data, width, height, settings)
      : effortJob(data, width, height, settings, false, undefined, settings.quality < 100 && settings.effort >= 8 ? searchV6 : undefined,
        settings.quality < 100 && settings.effort >= 6 ? photoAnsSteps : undefined, EXACT_LADDER));
  return drain(steps, hooks);
}
