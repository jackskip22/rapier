export {configureWasm} from '../wasm-modules.mjs';
export {supported} from './capture-support.mjs';
import {createCodec as createClient} from './client.mjs';
import {encoder} from './session.mjs';
import {fail} from './primitives.mjs';
import {sharedClient, LEGACY} from './shared.mjs';
let shared;
export function defaultCodec() { return shared ||= encoder(sharedClient(), {}, LEGACY.operations); }
export function createCodec(config = {}) {
  if (config && typeof config === 'object' && Object.hasOwn(config, 'worker')) {
    const {worker, ...rest} = config, error = message => { throw fail('JXL_OPTIONS', message); };
    if (worker !== undefined && worker !== false) error('worker may be false; supply workerFactory for a custom worker.');
    if (worker === false && rest.workerFactory) error('worker:false and workerFactory are mutually exclusive.');
    return encoder(createClient(rest, worker === false ? {...LEGACY, inPlace: true} : LEGACY), rest, LEGACY.operations);
  }
  return encoder(createClient(config, LEGACY), config, LEGACY.operations);
}
export function encode(input, options) { return defaultCodec().encode(input, options); }
export function capture(input, options) { return defaultCodec().capture(input, options); }
export function decode(input, options) { return defaultCodec().decode(input, options); }
export function recompress(input, options) { return defaultCodec().recompress(input, options); }
export function restore(input, options) { return defaultCodec().restore(input, options); }
export function format(input, options) { return defaultCodec().format(input, options); }
export function prepare(operation) { return defaultCodec().prepare(operation); }
export {inspect, edit} from './inspect-edit.mjs';
