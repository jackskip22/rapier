// SPDX-License-Identifier: MIT
import './engines.mjs';
import {capture, prepare} from './capture-complete-module.mjs';
export {supported} from './capture-complete-module.mjs';
export {setDecoder as configureDecoder} from '../decoder-setting.mjs';


import {serveRole, ownFile, roleName} from './module-roles.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {install, workerPort} from './worker-runtime.mjs';
import {withGroups} from './capture-groups.mjs';
import {serveGroups} from './capture-group-helper.mjs';
const NAME = 'rapier-jxl/capture-complete', raw = {capture, prepare};
serveRole(NAME, {
  worker: () => install(workerPort(), [], moduleRuntime(raw, {name: NAME})),
  groups: () => install(workerPort(), [], withGroups(moduleRuntime(raw, {name: NAME}), raw, NAME, ownFile(roleName(NAME, 'group helper')))),
  'group helper': serveGroups});

import {inPlace} from './module-roles.mjs';
const here = inPlace(NAME, raw, {webgpu: true, url: () => new URL(import.meta.url), prepareOp: 'capture',
  runtime: ready => withGroups(moduleRuntime(raw, {name: NAME}), raw, NAME,
    ownFile(roleName(NAME, 'group helper'), () => new URL(import.meta.url)), ready)});
const captureIn = here.wrap('capture'), prepareIn = here.wrap('prepare');
export {captureIn as capture, prepareIn as prepare};
export const {configure, close} = here;
