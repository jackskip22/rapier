// SPDX-License-Identifier: MIT
import {parentPort, workerData} from 'node:worker_threads';
import {stepper} from './core-fixture.mjs';
const parts = new Map(workerData.parts), visited = [], codec = stepper(at => visited.push(at));
try {
  const result = await codec.advance(workerData.checkpoint, {
    source: workerData.source, expectedRevision: workerData.checkpoint.revision,
    readMany: refs => refs.map(ref => parts.get(ref.hash)), read: ref => parts.get(ref.hash),
    readSource: (at, n) => workerData.bytes.subarray(at, at + n)
  }, {units: workerData.units});
  parentPort.postMessage({result, visited});
} catch (error) { parentPort.postMessage({error: {code: error.code, message: error.message}}); }
