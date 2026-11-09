import {createCodec as createClient} from './client.mjs';
import {previewReplies} from './preview-relay.mjs';

export const LEGACY = Object.freeze({
  bytes: true,
  operations: ['encode', 'capture', 'recompress', 'restore', 'decode', 'format'],
  url: () => new URL('./worker.mjs', import.meta.url),
  worker: () => new Worker(new URL('./worker.mjs', import.meta.url), {type: 'module'}),
  runtime: () => import('./runtime.mjs'),
});

let shared;
export function sharedClient() { return shared ||= createClient({}, LEGACY, previewReplies); }
