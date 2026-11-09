// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {brotliCompressSync, constants} from 'node:zlib';
import {readContainer, readContainerSteps} from '../container-advanced.mjs';
import {fileHeader, boxHeader, FTYP, BRAND, CODESTREAM, BROB} from '../container.mjs';
import {boundedHeaderSteps, header} from '../v7/inspect.mjs';
import {decode, prepare} from '../v7/decode.mjs';
import {recompress} from '../v7/jpeg.mjs';
import {decodeOptions} from '../decode-image.mjs';
import {decodeBands} from '../decode-parallel.mjs';
import {displayProfile} from '../public/test/icc.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';
import {joinedBytes, unit} from '../step-journal.mjs';

const join = parts => new Uint8Array(Buffer.concat(parts));
const u32 = n => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0,n); return bytes; };
const provider = decode[Symbol.for('rapier-jxl.verify.groups')];
function trace(steps) {
  let next; const counts = {};
  do {
    next = journalNext(steps,undefined,{tools,join:joinedBytes});
    if (next.value?.unitDone) counts[next.value.unitDone] = (counts[next.value.unitDone] ?? 0) + 1;
  } while (!next.done);
  return {value:next.value,counts};
}
const outcome = run => { try { return run(); } catch (error) { return [error.code,error.message]; } };

test('the original container owner carries long brand lists and preserves whole-reader refusals', async () => {
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg',import.meta.url)));
  const encoded = (await recompress(photo,{effort:1})).bytes, stream = readContainer(encoded).codestream;
  const brands = new Uint8Array(196620); brands.set(u32(BRAND)); brands.set(u32(BRAND),brands.length - 4);
  const bytes = join([fileHeader().subarray(0,12),boxHeader(FTYP,brands.length),brands,boxHeader(CODESTREAM,stream.length),stream]);
  const observed = trace(readContainerSteps(bytes));
  assert.deepEqual(observed.value.codestream.subarray(0),stream);
  assert.ok(observed.counts['container-boxes'] >= 4,'compatible brands yield at 64 KiB windows');
  assert.deepEqual(trace(boundedHeaderSteps(bytes)).value,header(bytes));
  const bad = bytes.slice(); bad.fill(0,12 + 8 + brands.length - 4,12 + 8 + brands.length);
  for (const input of [bad,bytes.subarray(0,19),bytes.subarray(0,bytes.length - 1),join([bytes,Uint8Array.of(1)])])
    assert.deepEqual(outcome(()=>trace(readContainerSteps(input)).value),outcome(()=>readContainer(input)));
});

function withICC(photo,profile) {
  const apps = [], tag = new TextEncoder().encode('ICC_PROFILE\0'), count = Math.ceil(profile.length / 65519);
  for (let at = 0, sequence = 1; at < profile.length; at += 65519,sequence++) {
    const bytes = profile.subarray(at,at + 65519), app = new Uint8Array(bytes.length + 18), length = bytes.length + 16;
    app.set([255,226,length >> 8,length & 255]); app.set(tag,4); app.set([sequence,count],16); app.set(bytes,18); apps.push(app);
  }
  return join([photo.subarray(0,2),...apps,photo.subarray(2)]);
}

test('saved provider preparation resumes ICC and brob once, then opens the same photographic region', {timeout:30000}, async () => {
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg',import.meta.url)));
  const profile = displayProfile({curve:'table',description:'ICC description boundary '.repeat(4000)});
  const encoded = (await recompress(withICC(photo,profile),{effort:1,icc:'preserve'})).bytes;
  const metadata = new Uint8Array(140003); for (let i = 0; i < metadata.length; i++) metadata[i] = photo[i % photo.length];
  const compressed = new Uint8Array(brotliCompressSync(metadata,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}));
  const input = join([fileHeader(),boxHeader(BROB,compressed.length + 4),u32(0x75756964),compressed,encoded.subarray(fileHeader().length)]);
  const options = {applyOrientation:false,region:{x:255,y:255,width:16,height:2}}, expected = await decode(input,options);
  await prepare();
  const codec = () => createJournalStepper({tools, id:'pb1/decode-open',build:'9'.repeat(64),normalize:()=>({budgetMs:Number.MIN_VALUE}),
    open:function* (_,bytes) {
      const opened = yield* provider.open(bytes,{applyOrientation:false});
      const rgba = yield* unit('photo-region',()=>decodeBands(bytes,decodeOptions({...options,borrowed:true}),opened).data);
      return joinedBytes([opened.h.icc,opened.input.boxes.find(box=>box.type === 'uuid').data,rgba]);
    }});
  const units = trace(provider.open(input,{applyOrientation:false})).counts;
  const source = {generation:'open/1',sha256:await digest(input),byteLength:input.length}, parts = new Map(), reads = [];
  let checkpoint,calls = 0;
  const keep = result => {
    for (const {ref,bytes} of result.parts) parts.set(ref.hash,bytes.slice());
    checkpoint = JSON.parse(JSON.stringify(result.checkpoint));
  };
  const host = () => ({source,expectedRevision:checkpoint.revision,read:ref=>parts.get(ref.hash)?.slice(),
    readMany:refs=>refs.map(ref=>parts.get(ref.hash)?.slice()),readSource:(at,n)=>{reads.push([at,n]);return input.slice(at,at+n);}});
  keep(await codec().start({source}));
  while (checkpoint.status !== 'done') {
    keep(await codec().advance(checkpoint,host(),{units:1}));
    assert.ok(++calls < 180,'saved provider preparation makes progress');
  }
  const output = []; for await (const bytes of codec().outputParts(checkpoint,host())) output.push(bytes);
  assert.deepEqual(join(output),join([profile,metadata,new Uint8Array(expected.data)]));
  assert.ok(calls > 12,'metadata crosses actual serialized advances');
  assert.ok(units['decode-icc-profile-part'] > 1 && units['decode-brotli-output'] > 1,'both metadata readers expose their output units');
  assert.ok(reads.every(([,n])=>n <= 65536),'preparation and the small region never request the complete source');
});
