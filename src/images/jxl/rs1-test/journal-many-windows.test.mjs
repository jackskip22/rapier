// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVED,readEach} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest,encodeData,decodeData} from '../resumable-data.mjs';

test('thousands of saved sample windows resume within the one-part checkpoint limit', async t => {
  const count = 5000, size = 1024, input = Uint8Array.of(6,6), parts = new Map();
  let generated = 0, checkpoint, savedWindows = null;
  t.mock.method(performance,'now',() => generated < count ? 0 : 100);
  const codec = createJournalStepper({id:'many-read-only-windows',build:'7'.repeat(64),normalize:() => ({budgetMs:10}),
    async run(_plan,_input,_source,journal) {
      const unit = async (name,run,flags = {}) => {
        const saved = await journal({unit:name,...flags});
        if (saved && Object.hasOwn(saved,SAVED)) return {value:saved[SAVED]};
        let value;
        try { value = run(); } catch (error) { await journal({unitFailed:name}); throw error; }
        await journal({unitDone:name,value}); return {value};
      };
      const windows = [];
      for (let k = 0; k < count; k++) windows.push((await unit('window',() => {
        generated++;
        return new Uint8Array(size).fill(k % 251);
      },{cold:true,borrowed:true,alone:true})).value);
      return (await unit('read',() => {
        const samples = readEach([0,Math.floor(count / 2),count - 1].map(k => () => {
          return windows[k][size - 1];
        }));
        return Uint8Array.from(samples);
      })).value;
    }});
  const source = {generation:'many-read-only-windows',sha256:await digest(input),byteLength:input.length};
  const persist = next => {
    for (const {ref,bytes} of next.parts) { assert.ok(bytes.length <= 1048576); parts.set(ref.hash,bytes.slice()); }
    checkpoint = structuredClone(next.checkpoint);
    if (checkpoint.state) {
      const state = decodeData(parts.get(checkpoint.state.hash));
      if (Object.values(state.codec?.journal ?? {}).filter(entry => entry.name === 'window').length === count)
        savedWindows ??= structuredClone(checkpoint);
    }
  };
  const host = () => ({source,expectedRevision:checkpoint.revision,
    read:async ref => parts.get(ref.hash)?.slice(),readMany:async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource:async (at,length) => input.slice(at,at + length)});
  persist(await codec.start({source,options:{}}));
  for (let calls = 0; checkpoint.status !== 'done'; calls++) {
    assert.ok(calls < 20,'the sample windows resume');
    persist(await codec.advance(checkpoint,host(),{units:1}));
  }
  assert.ok(savedWindows,'all sample windows survive a persisted checkpoint before they are consumed');
  assert.deepEqual(await codec.output(checkpoint,host(),length => new Uint8Array(length)),Uint8Array.from([0,Math.floor(count / 2) % 251,(count - 1) % 251]));
  for (const conflict of [false,true]) {
    const state = decodeData(parts.get(savedWindows.state.hash));
    const entry = Object.values(state.codec.journal).find(entry => entry.metaIndex !== undefined);
    assert.ok(entry);
    if (conflict) entry.meta = state.codec.metas[entry.metaIndex];
    else entry.metaIndex = state.codec.metas.length;
    const bytes = encodeData(state), ref = {hash:await digest(bytes),length:bytes.length};
    parts.set(ref.hash,bytes);
    const {hash,...body} = {...savedWindows,state:ref};
    checkpoint = {...body,hash:await digest(encodeData(body))};
    await assert.rejects(codec.advance(checkpoint,host(),{units:1}),{code:'JXL_INPUT'});
  }
});
