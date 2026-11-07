// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixtureHost} from './runtime-workerd.mjs';

test('runtime host keeps exact ranges and immutable, hash-checked parts', async () => {
  const source = Uint8Array.from({length: 4096}, (_, at) => at & 255), host = await fixtureHost(source, 1024);
  const url = 'http://127.0.0.1:' + host.port, data = source.subarray(37, 141), hash = createHash('sha256').update(data).digest('hex');
  try {
    const range = await fetch(url + '/source?offset=37&length=104');
    assert.deepEqual(new Uint8Array(await range.arrayBuffer()), data);
    assert.equal((await fetch(url + '/source?offset=4095&length=2')).status, 400);
    assert.equal((await fetch(url + '/part/' + hash, {method: 'PUT', body: data})).status, 204);
    assert.equal((await fetch(url + '/part/' + hash, {method: 'PUT', body: data})).status, 204);
    assert.equal(host.parts.size, 1); assert.equal(host.counters.duplicates, 1);
    const changed = new Uint8Array(data); changed[0] ^= 1;
    assert.equal((await fetch(url + '/part/' + hash, {method: 'PUT', body: changed})).status, 400);
    assert.deepEqual(new Uint8Array(await (await fetch(url + '/part/' + hash + '?length=104')).arrayBuffer()), data);
    assert.equal((await fetch(url + '/part/' + hash + '?length=103')).status, 400);
    const batch = await fetch(url + '/parts', {method: 'POST', body: JSON.stringify([{hash, length: 104}, {hash, length: 104}])});
    assert.equal(batch.status, 200); assert.deepEqual(new Uint8Array(await batch.arrayBuffer()), Uint8Array.from([...data, ...data]));
    assert.equal(host.counters.partReadBatches, 1);
    assert.equal((await fetch(url + '/parts', {method: 'POST', body: JSON.stringify([{hash, length: 103}])})).status, 400);
    assert.equal((await fetch(url + '/parts', {method: 'POST', body: JSON.stringify(Array(129).fill({hash, length: 104}))})).status, 400);
    assert.equal((await fetch(url + '/part/' + '0'.repeat(64) + '?length=1')).status, 404);
    assert.equal((await fetch(url + '/part/' + hash, {method: 'PUT', body: source.subarray(0, 1025)})).status, 400);
  } finally { await host.close(); }
});
