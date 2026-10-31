// SPDX-License-Identifier: MIT
import {DECODE_LIMITS,decodeOptions} from './decode-image.mjs';
import {decodeBands,decodeAsync as decodeOnThreads} from './decode-parallel.mjs';
import {brotliDictionary} from './brotli-dictionary.mjs';
import {addPart} from './decode-parts.mjs';
import {readFeatures,applyPatches,applySplines,applyNoise} from './decode-features.mjs';
import {readICC} from './decode-icc.mjs';
import {readICCColor} from './decode-color-icc.mjs';
import {upsamplePlane} from './decode-upsample.mjs';
import {decompressBrotli} from './decode-brotli.mjs';
import {readModularTransforms,inverseModularTransforms} from './decode-modular-transforms.mjs';
export {DECODE_LIMITS};

addPart('features',{readFeatures,applyPatches,applySplines,applyNoise});addPart('icc',{readICC});addPart('iccColor',{readICCColor});
addPart('upsample',{upsamplePlane});addPart('brotli',{decompressBrotli});addPart('transforms',{readModularTransforms,inverseModularTransforms});

const withDictionary=options=>options!==null&&typeof options==='object'&&options.dictionary===undefined?{...options,dictionary:brotliDictionary()}:options;

export function decode(bytes,options={}) {
  return decodeBands(bytes,decodeOptions(withDictionary(options)));
}
export function decodeAsync(bytes,options={}) {
  return decodeOnThreads(bytes,withDictionary(options));
}
