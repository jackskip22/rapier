// SPDX-License-Identifier: MIT
function mathSemanticPrepared(prepared, options = {}) {
  const {text, safe, tree, error} = prepared;
  return mathML(tree, text, safe, {displayMode: !!options?.displayMode, error});
}
function mathToMathML(source, options = {}) {
  return mathSemanticPrepared(mathPrepare(source), options);
}

import {mathPrepare} from './source.js';
import {mathML} from './mathml.js';
export {mathSemanticPrepared, mathToMathML};
