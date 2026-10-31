// SPDX-License-Identifier: MIT
import {render} from '../dist/index.mjs';
self.onmessage = ({data: {id, source}}) => {
  try { self.postMessage({id, source, result: render(source)}); }
  catch (error) { self.postMessage({id, source, error: {code: error.code, message: error.message}}); }
};
// Keep a request id per message; install a reply only if it is still current.
