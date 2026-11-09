// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {brotliCompressSync, constants} from 'node:zlib';
import {compressBrotli, decompressBrotli, decompressBrotliSteps} from '../brotli.mjs';
import {decompressBrotliSteps as decodeBrotliSteps} from '../decode-brotli.mjs';
import {brotliDictionary} from '../brotli-dictionary.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const codec = decoder => createJournalStepper({tools, id: 'pb1/brotli-restore-' + decoder, build: '5'.repeat(64), normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* (_, bytes) { return yield* (decoder ? decodeBrotliSteps : decompressBrotliSteps)(bytes, {dictionary: brotliDictionary}); }});
async function resumed(input, decoder = false) {
  const source = {generation: 'brotli/1', sha256: await digest(input), byteLength: input.length}, parts = new Map();
  let checkpoint, calls = 0, outputs = 0;
  const keep = result => { for (const {ref, bytes} of result.parts) parts.set(ref.hash, bytes.slice()); checkpoint = JSON.parse(JSON.stringify(result.checkpoint)); };
  const host = () => ({source, expectedRevision: checkpoint.revision, read: ref => parts.get(ref.hash)?.slice(),
    readMany: refs => refs.map(ref => parts.get(ref.hash)?.slice()), readSource: (at, n) => input.slice(at, at + n)});
  keep(await codec(decoder).start({source}));
  while (checkpoint.status !== 'done') {
    const result = await codec(decoder).advance(checkpoint, host(), {units: 1}); keep(result);
    outputs += result.work?.filter(work => work.name === 'brotli-output').length ?? 0;
    assert.ok(++calls < 200, 'Brotli continuation makes progress');
  }
  const out = [];
  for await (const bytes of codec(decoder).outputParts(checkpoint, host())) out.push(Buffer.from(bytes));
  return {bytes: new Uint8Array(Buffer.concat(out)), calls, outputs};
}

test('Brotli restore carries commands and distant output references through serialized checkpoints', {timeout: 30000}, async () => {
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-progressive-profile.jpg', import.meta.url)));
  const metadata = new Uint8Array(400003); for (let at = 0; at < metadata.length; at++) metadata[at] = photo[at % photo.length];
  for (const input of [compressBrotli(metadata), new Uint8Array(brotliCompressSync(metadata, {params: {[constants.BROTLI_PARAM_QUALITY]: 5}}))]) {
    assert.deepEqual(decompressBrotli(input, {dictionary: brotliDictionary()}), metadata);
    for (const decoder of [false, true]) { const result = await resumed(input, decoder); assert.deepEqual(result.bytes, metadata); assert.ok(result.calls > 10); }
  }
});

test('Brotli restore resolves dictionary words on demand and retains exact refusal semantics', {timeout: 30000}, async () => {
  const text = new TextEncoder().encode('the quick brown fox jumps over the lazy dog'.repeat(2000));
  const input = new Uint8Array(brotliCompressSync(text)); let calls = 0;
  assert.deepEqual(decompressBrotli(input, {dictionary: () => { calls++; return brotliDictionary(); }}), text);
  assert.ok(calls > 0); assert.deepEqual((await resumed(input)).bytes, text);
  assert.deepEqual((await resumed(input, true)).bytes, text);
  assert.throws(() => decompressBrotli(input), error => error.dictionary === true && error.code === 'JXL_INPUT');
  assert.throws(() => decompressBrotli(input, {maxOutputLength: text.length - 1}), {code: 'JXL_SIZE'});
  assert.throws(() => decompressBrotli(Uint8Array.from([...input, 0]), {dictionary: brotliDictionary()}), /bytes follow the final meta-block/);
});
