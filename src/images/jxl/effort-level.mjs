// SPDX-License-Identifier: MIT
import {fault} from './admit.mjs';
import {PHOTO_LEVELS} from './photo-quality-table.mjs';

export const FAST_EFFORT = 1;
export const MEASURED_EFFORT = 6;
export const measuredLevel = effort => PHOTO_LEVELS[effort].level;
export const BALANCED_EFFORT = 7;

export function admitEffort(options = {}, fallback = FAST_EFFORT, ten = false) {
  if (options === null || typeof options !== 'object') throw fault('JXL_INPUT', 'options: object');
  const effort = options.effort === undefined ? fallback : options.effort;
  const ten10 = (typeof __RAPIER_JXL_EFFORT_TEN__ === 'undefined' || __RAPIER_JXL_EFFORT_TEN__ === true) && ten;
  if (!Number.isInteger(effort) || effort < 1 || effort > (ten10 ? 10 : 9)) throw fault('JXL_INPUT', ten10 ? 'effort: integer 1-10' : 'effort: integer 1-9');
  return effort;
}
