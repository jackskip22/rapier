// SPDX-License-Identifier: MIT
// The prepared tree never crosses the public boundary. Both outputs consume it
// within this call, before any result or caller-mutable parse tree is exposed.
function mathRenderWithMathML(source, options = {}) {
  const prepared = mathPrepare(source), displayMode = !!options?.displayMode;
  const semantics = mathSemanticPrepared(prepared, {displayMode});
  return {...mathRenderPrepared(prepared, {...options, displayMode}), semantics};
}

import {mathPrepare} from './source.js';
import {mathRenderPrepared} from './api.js';
import {mathSemanticPrepared} from './semantic-api.js';
export {mathRenderWithMathML};
