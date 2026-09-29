// The one dependency of @gfx/zopfli's emscripten module, `base64-js`, replaced by Node's own Buffer
// (same two functions, no package): build-time only, never shipped.
'use strict';
exports.toByteArray = text => new Uint8Array(Buffer.from(text, 'base64'));
exports.fromByteArray = bytes => Buffer.from(bytes).toString('base64');
exports.byteLength = text => Buffer.from(text, 'base64').length;
