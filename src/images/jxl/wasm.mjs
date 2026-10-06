// Optional all-in-one accelerated effort door. MIT (images/jxl/LICENSE).
// The one-file build owns the same hooks as its encoder, unlike two separate minified files.
import {configureKernels, kernelMode} from './kernels.mjs';
import {encode, encodeSteps, LIMITS} from './effort.mjs';
configureKernels('auto');
export {encode, encodeSteps, LIMITS, configureKernels, kernelMode};
