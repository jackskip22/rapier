import {createCodec as createClient} from './client.mjs';

export const LEGACY = Object.freeze({
  operations: ['encode', 'capture', 'recompress', 'restore', 'decode', 'format'],
  url: () => new URL('./worker.mjs', import.meta.url),
  worker: () => new Worker(new URL('./worker.mjs', import.meta.url), {type: 'module'}),
  runtime: () => import('./runtime.mjs'),
});

let shared;
export function sharedClient() { return shared ||= createClient({}, LEGACY); }
