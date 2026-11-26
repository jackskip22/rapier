import {decode} from './decode.mjs';

const said = error => `${error?.code ? error.code + ': ' : ''}${error?.message ?? error}` + (error?.cause ? ` [cause: ${error.cause.message ?? error.cause}]` : '');
async function here() {
  try {
    const module = await WebAssembly.compile(await (await fetch(new URL('decode.wasm', import.meta.url))).arrayBuffer());
    new WebAssembly.Instance(module);
    return 'decode.wasm compiles and starts here';
  } catch (error) { return `decode.wasm here: ${error?.name}: ${error?.message}`; }
}
let detail;
try {
  const image = await decode(new Uint8Array(await (await fetch(new URL('../in/readback', import.meta.url))).arrayBuffer()));
  detail = {value: [image.frames.length, image.frames.reduce((sum, frame) => sum + frame.durationSeconds, 0)]};
} catch (error) {
  detail = {error: said(error) + (error?.code === 'JXL_WASM' ? ` (${await here()})` : '')};
}
dispatchEvent(new CustomEvent('readback', {detail}));
