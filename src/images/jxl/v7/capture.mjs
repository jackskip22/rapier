import './engines.mjs';
import {capture, prepare} from './capture-module.mjs';
export {supported} from './capture-module.mjs';


import {serveRole} from './module-roles.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {install, workerPort} from './worker-runtime.mjs';
import {previewHub} from './preview-relay.mjs';
const raw = {capture, prepare};
serveRole('rapier-jxl/capture', {worker: () => install(workerPort(), [], moduleRuntime(raw, {name: 'rapier-jxl/capture'}), previewHub)});

import {inPlace} from './module-roles.mjs';
const here = inPlace('rapier-jxl/capture', raw, (typeof __RAPIER_JXL_CAPTURE_LEAN__ !== 'undefined' && __RAPIER_JXL_CAPTURE_LEAN__ === true) ? undefined : {url: () => new URL(import.meta.url)});
const captureIn = here.wrap('capture'), prepareIn = here.wrap('prepare');
export {captureIn as capture, prepareIn as prepare};
export const {configure, close} = here;