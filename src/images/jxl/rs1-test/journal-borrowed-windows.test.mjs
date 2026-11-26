// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVED} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest,decodeData} from '../resumable-data.mjs';

test('borrowed wide samples retain their exact values behind an unaligned metadata prefix', async () => {
  const input = Uint8Array.of(1,2), parts = new Map();
  const codec = createJournalStepper({id:'borrowed-samples',build:'6'.repeat(64),
    normalize:() => ({budgetMs:Number.MIN_VALUE}),
    async run(_plan,_input,_source,journal) {
      const unit = async (name,run,flags = {}) => {
        const saved = await journal({unit:name,...flags});
        if (saved && Object.hasOwn(saved,SAVED)) return {value:saved[SAVED]};
        let value;
        try { value = run(); } catch (error) { await journal({unitFailed:name}); throw error; }
        await journal({unitDone:name,value}); return {value};
      };
      const {value:band} = await unit('band',() => ({
        description:'a'.repeat(1501),data:Float64Array.of(Math.PI,Number.MIN_VALUE,-0,2 ** 40)
      }),{cold:true,borrowed:true,alone:true});
      const {value:answer} = await unit('read',() => {
        assert.deepEqual([...band.data],[Math.PI,Number.MIN_VALUE,-0,2 ** 40]);
        return Uint8Array.of(7);
      });
      return answer;
    }});
  const source = {generation:'borrowed-samples',sha256:await digest(input),byteLength:input.length};
  let checkpoint, unaligned = false;
  const persist = next => {
    for (const {ref,bytes} of next.parts) parts.set(ref.hash,bytes.slice());
    checkpoint = structuredClone(next.checkpoint);
    if (checkpoint.state) for (const entry of Object.values(decodeData(parts.get(checkpoint.state.hash)).codec?.journal ?? {}))
      if (entry.name === 'band') unaligned ||= entry.metaLength % 8 !== 0;
  };
  const host = () => ({source,expectedRevision:checkpoint.revision,
    read:async ref => parts.get(ref.hash)?.slice(),readMany:async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource:async (at,length) => input.slice(at,at + length)});
  persist(await codec.start({source,options:{}}));
  for (let calls = 0; checkpoint.status !== 'done'; calls++) {
    assert.ok(calls < 30,'the cold sample page makes progress');
    persist(await codec.advance(checkpoint,host(),{units:1}));
  }
  assert.ok(unaligned,'the metadata prefix exercises an unaligned wide-array payload');
  assert.deepEqual(await codec.output(checkpoint,host(),length => new Uint8Array(length)),Uint8Array.of(7));
});

test('read-ahead follows borrowed windows without rereading their released prefix', async () => {
  const count = 48, size = 256 * 1024, input = Uint8Array.of(6,6), parts = new Map(), bandRefs = new Set();
  const codec = createJournalStepper({id:'borrowed-read-ahead',build:'6'.repeat(64),
    normalize:() => ({budgetMs:Number.MIN_VALUE}),
    async run(_plan,_input,_source,journal) {
      const unit = async (name,run,flags = {}) => {
        const saved = await journal({unit:name,...flags});
        if (saved && Object.hasOwn(saved,SAVED)) return {value:saved[SAVED]};
        let value;
        try { value = run(); } catch (error) { await journal({unitFailed:name}); throw error; }
        await journal({unitDone:name,value}); return {value};
      };
      const bands = [];
      for (let k = 0; k < count; k++)
        bands.push((await unit('band',() => new Uint8Array(size).fill(k + 1),{cold:true,borrowed:true,alone:true})).value);
      const joined = journal.join(bands);
      let sum = 0;
      for (let k = 0; k < count; k++) {
        const before = sum;
        const {value} = await unit('read',() => {
          joined.ahead(k * size,(k + 1) * size);
          return before + joined.subarray(k * size,(k + 1) * size)[size - 1];
        },{carry:true});
        if (typeof value === 'number') sum = value;
      }
      return Uint8Array.of(sum % 256);
    }});
  const source = {generation:'borrowed-read-ahead',sha256:await digest(input),byteLength:input.length};
  let checkpoint, calls = 0, bandBytes = 0;
  const persist = next => {
    for (const {ref,bytes} of next.parts) parts.set(ref.hash,bytes.slice());
    checkpoint = structuredClone(next.checkpoint);
    if (checkpoint.state) for (const entry of Object.values(decodeData(parts.get(checkpoint.state.hash)).codec?.journal ?? {}))
      if (entry.name === 'band') for (const [ref] of entry.bytes) bandRefs.add(ref.hash);
  };
  const counted = refs => refs.map(ref => {
    if (bandRefs.has(ref.hash)) bandBytes += ref.length;
    return parts.get(ref.hash)?.slice();
  });
  const host = () => ({source,expectedRevision:checkpoint.revision,
    ...(calls >= count && {budgetMs:60000,deadline:performance.now() + 60000}),
    read:async ref => counted([ref])[0],readMany:async refs => counted(refs),
    readSource:async (at,length) => input.slice(at,at + length)});
  persist(await codec.start({source,options:{}}));
  while (checkpoint.status !== 'done') {
    persist(await codec.advance(checkpoint,host(),{units:calls < count ? 1 : 64}));
    assert.ok(++calls < 200,'the saved windows make progress');
  }
  assert.deepEqual(await codec.output(checkpoint,host(),length => new Uint8Array(length)),Uint8Array.of(count * (count + 1) / 2 % 256));
  assert.ok(bandBytes < 2 * count * size,'lookahead must not reread the released prefix');
});
