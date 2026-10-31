import {effortJob} from '../effort-job.mjs';
import {searchV6} from '../photo-v6-search.mjs';
import {photoAnsSteps} from '../photo-v6-blocks.mjs';
import {EXACT_LADDER} from '../exact-ladder.mjs';
import {encodePhotoSteps} from '../photo-advanced.mjs';
import {encodeToScoreSteps} from '../score.mjs';
import {coreSteps} from './instant.mjs';
import {check, dimensions, fail, declared, callers} from './primitives.mjs';
import {drain, encodeOptions, callOptions, targetSource} from './common.mjs';
import {own} from './ownership.mjs';
import {surface} from './surface.mjs';
import {acceleration} from './acceleration.mjs';

export const encode = (input, options) => encodeHere(input, options).catch(error => { throw error === options?.signal?.reason ? error : declared(error); });
async function encodeHere(input, options = {}) {
  const {codec: {target, ...codec}, hooks: {webgpu, maxPixels}} = callOptions(encodeOptions(options));
  check(options.signal);
  if (typeof Blob !== 'undefined' && input instanceof Blob) throw fail('JXL_INPUT', 'The offline encoder takes pixels, ImageData, a canvas or an ImageBitmap, not a Blob.');
  input = surface(input, {readAs: options.readAs, maxPixels});
  if (Array.isArray(input?.frames)) throw fail('JXL_INPUT', 'The offline encoder takes one picture; animations go through encode.');
  dimensions(input?.width, input?.height, maxPixels);
  const report = options.onProgress, onProgress = report && (fraction => { try { report(fraction); } catch (error) { throw callers(error); } });
  const hooks = {signal: options.signal ?? new AbortController().signal, onProgress};
  const captured = own({input, codec, features: options.features, target}, maxPixels);
  await acceleration(webgpu, 0, 0, codec.quality < 100 ? codec.effort : 0, 'the one-file still encoder');
  const {data,width,height,...source} = captured.input;
  const featured = captured.features !== undefined || source.orientation !== undefined || source.extraChannels !== undefined;
  if (captured.target !== undefined) {
    if (source.orientation !== undefined || source.extraChannels !== undefined)
      throw fail('JXL_INPUT', 'A measured fidelity takes 8-bit straight sRGB RGBA, without orientation or extra channels.');
    targetSource(data, source, captured.codec);
    return (await drain(encodeToScoreSteps(data, width, height, {target: captured.target, effort: captured.codec.effort}), hooks)).bytes;
  }
  if (featured && (captured.codec.quality === 100 || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray)))
    throw fail('JXL_UNSUPPORTED', 'Orientation, extra channels and features need an 8-bit lossy encode in this version; exact and deeper samples write them in a later 8.x. format({kind: \'channels\'}) writes extra channels exactly now.');
  const settings = {...source, ...captured.codec};
  const steps = featured ? encodePhotoSteps(data, width, height, {...settings, ...captured.features})
    : settings.effort === 1 ? coreSteps(data, width, height, settings)
    : effortJob(data, width, height, settings, false, undefined, settings.quality < 100 && settings.effort >= 8 ? searchV6 : undefined,
        settings.quality < 100 && settings.effort >= 6 ? photoAnsSteps : undefined, EXACT_LADDER);
  return drain(steps, hooks);
}
