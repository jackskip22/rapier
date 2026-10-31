// SPDX-License-Identifier: MIT
export {LIMITS, PHOTO_LIMITS, JPEG_LIMITS} from './limits.mjs';
export {BitWriter, packSigned, floorLog2, ceilLog2, float16Bits, complete, part} from './bits.mjs';
export {codeLengths, canonicalCodes, buildCode, writePrefixCode, uintConfig, writeUintConfig, hybridToken, countToken, writeHybrid, writeContextMap, writeHistograms} from './prefix.mjs';
export {GROUP_DIM, DC_GROUP_DIM, writeModularFrameHeader, writeFrameHeaderEnd, writeTOC, groupLayout, finishSections, assembleCodestream} from './frame.mjs';
export {writeImageHeader} from './icc-write.mjs';
export {PREDICTOR, LZ77, RESIDUAL_CONFIG, ALPHABET, leaf, split, channelTree, streamTree, writeTree, writeTransform, writeModularHeader, writeChannelHistograms} from './modular.mjs';
export {codeChannel} from './modular-channel.mjs';
export {WEIGHTED_PREDICTOR, WEIGHTED_PROPERTY, WEIGHTED_CUTS, codeWeighted} from './weighted.mjs';
export {forwardSqueeze, defaultSqueezeParams} from './squeeze.mjs';
export {inspectPixels, encodeLossless, losslessSteps} from './lossless.mjs';
export {distanceFromQuality, quantiserFor, encodeLossy, lossySteps} from './lossy.mjs';
export {TokenCounts, buildTokenCoding} from './entropy.mjs';
export {encodeVarDCT, varDCTSteps} from './vardct.mjs';
import {encodeVarDCT} from './vardct.mjs';
import {parseJPEG} from './jfif.mjs';
export function transcodeJPEG(bytes, jpeg = parseJPEG(bytes)) { return encodeVarDCT(jpeg); }
export {parseJPEG, profileSpace, ZIGZAG} from './jfif.mjs';
export {fault, admitOptions, admitSize, admitPixels, answer, guard, job} from './admit.mjs';
