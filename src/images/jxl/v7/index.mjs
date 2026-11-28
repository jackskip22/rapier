// SPDX-License-Identifier: MIT
import './engines.mjs';
import {fullEntry} from './full-entry.mjs';
export {supported} from './capture-support.mjs';
export {setDecoder as configureDecoder} from '../decoder-setting.mjs';
export const {encode, fit, variants, prepare, configure, close} = fullEntry('rapier-jxl', () => new URL(import.meta.url));
