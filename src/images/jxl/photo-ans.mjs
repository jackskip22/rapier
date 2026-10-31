// SPDX-License-Identifier: MIT
import {PHOTO_LIMITS} from './limits.mjs';
import {complete} from './bits.mjs';
import {photoJob} from './photo-job.mjs';
import {searchV6} from './photo-v6-search.mjs';
import {photoAnsSteps} from './photo-v6-blocks.mjs';

export {PHOTO_LIMITS as LIMITS};
export function encodePhoto(data, width, height, options) { return complete(encodePhotoSteps(data, width, height, options)); }
export function encodePhotoSteps(data, width, height, options) { return photoJob(data, width, height, options, photoAnsSteps, searchV6); }
