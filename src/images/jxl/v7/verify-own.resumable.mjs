// SPDX-License-Identifier: MIT
import {configuredDecoder, DECODER_SNAPSHOT} from '../decoder-setting.mjs';
export const ownDecoder = {readJPEGSteps:options => (options && DECODER_SNAPSHOT in options ? options[DECODER_SNAPSHOT] : configuredDecoder())?.restore?.[Symbol.for('rapier-jxl.verify.source')]};
