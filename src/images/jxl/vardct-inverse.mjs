// SPDX-License-Identifier: MIT
import {scaledBasis} from './vardct-dct8-basis.mjs';
import {AFV_BASIS} from './afv-basis.mjs';
import {fault} from './fault.mjs';
export {scaledBasis};
const AFV = ((typeof __RAPIER_JXL_STILL__ !== 'undefined' && __RAPIER_JXL_STILL__ === true) || (typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true)) ? null : AFV_BASIS;

const AFV_AT = 3540096, SMALL_SCRATCH = 4 * 65536 * 8;
export function inverseBlock(kernels, at, shape) {
  const id = shape.id;
  if (id === 0 || id >= 4 && id <= 11 || id >= 18)
    return kernels.idct(at, shape.width, shape.height, kernels.basis(shape.width, () => scaledBasis(shape.width)), kernels.basis(shape.height, () => scaledBasis(shape.height)));
  if (!AFV && id >= 14 && id <= 17) throw fault('JXL_INTERNAL', 'AFV block in a still build');
  if (AFV && !kernels.afvLoaded) { new Float64Array(kernels.buffer, AFV_AT, 256).set(AFV); kernels.afvLoaded = true; }
  kernels.small(at, id, kernels.output.byteOffset, SMALL_SCRATCH, kernels.basis(4, () => scaledBasis(4)), kernels.basis(8, () => scaledBasis(8)), AFV_AT);
}

export {restorationStages, restoreRows, restorationSizes, RESTORE_ROWS, SLICE_ROWS, restorePlanes} from './vardct-restore.mjs';
