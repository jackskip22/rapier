// SPDX-License-Identifier: MIT
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWorkerd, fixtureHost, workerdProcess} from '../re1-test/runtime-workerd.mjs';
import {processCpuClock} from '../re1-test/runtime-cpu.mjs';
import * as entryApi from './workerd-entry.mjs';

const [binary, esbuild, out, ...files] = process.argv.slice(2);
const effort = +(process.env.EFFORT ?? 3), budgetMs = +(process.env.BUDGET ?? 20), modes = (process.env.MODES ?? 'cold,warm').split(',');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const operation = process.env.OPERATION ?? 'capture';
globalThis.RS1_OPERATION = operation;
await mkdir(out, {recursive: true});
const entry = join(resolve(out), 'entry.mjs');
await writeFile(entry, `globalThis.RS1_OPERATION = ${JSON.stringify(operation)};\nexport * from ${JSON.stringify(fileURLToPath(new URL('./workerd-entry.mjs', import.meta.url)))};\n`);
const build = await buildWorkerd({sourceDir: fileURLToPath(new URL('../', import.meta.url)), stepper: entry, workerStepper: entry, esbuild: resolve(esbuild), directory: join(out, 'build')});
const verbs = {...await import('../v7/capture.mjs'), ...await import('../v7/jpeg.mjs'), ...await import('../v7/index.mjs'),
  'capture-complete': (await import('../v7/capture-complete.mjs')).capture};
const {readPng} = await import('../../../jxl/png.mjs');
const clock = processCpuClock(), rows = [];
const median = v => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
for (const file of files) {
  const file_ = new Uint8Array(await readFile(file)), pixels = operation !== 'recompress';
  const {width, height, data} = pixels ? await readPng(file_) : {data: file_};
  const options = {effort, ...(operation === 'encode' && {fidelity: {quality: 85}}), ...JSON.parse(process.env.OPTIONS ?? '{}')};
  const expected = (await verbs[operation](pixels ? {width, height, data: data.slice()} : data.slice(), options)).bytes, hash = sha(data);
  const source = {generation: 'rs1:' + hash.slice(0, 16), sha256: hash, byteLength: data.length, ...(pixels && {width, height})};
  for (const mode of modes) {
    const host = await fixtureHost(data), calls = [];
    let shared = mode === 'warm' ? await workerdProcess({binary, build, hostPort: host.port, clock, label: 'warm'}) : null, checkpoint, done = false;
    try {
      for (let ordinal = 0; ordinal < 20000 && !done; ordinal++) {
        const runtime = shared ?? await workerdProcess({binary, build, hostPort: host.port, clock, label: 'cold'});
        let measured;
        try {
          measured = await runtime.call(ordinal === 0 ? {operation: 'start', source, options}
            : {operation: 'advance', source, checkpoint, expectedRevision: checkpoint.revision, units: 1});
        } finally { if (!shared) await runtime.close(); }
        checkpoint = measured.result.checkpoint; done = !!measured.result.done;
        calls.push({ms: measured.cpuMs, phase: measured.result.work?.[0]?.phase ?? 'start', work: measured.result.work?.[0] ?? null});
      }
      const parts = [];
      for await (const bytes of entryApi.outputParts(checkpoint, {source, expectedRevision: checkpoint.revision,
        readMany: refs => refs.map(ref => host.parts.get(ref.hash)), read: async ref => host.parts.get(ref.hash)})) parts.push(bytes);
      const bytes = Buffer.concat(parts), codec = calls.filter(c => c.phase === 'journal'), source_ = calls.filter(c => c.phase === 'source');
      const worst = codec.reduce((a, c) => c.ms > a.ms ? c : a, {ms: 0});
      const row = {operation, page: file.split('/').pop(), width, height, effort, mode, equal: bytes.equals(Buffer.from(expected)), calls: calls.length,
        sourceCalls: source_.length, sourceWorstMs: +Math.max(...source_.map(c => c.ms)).toFixed(1),
        codecCalls: codec.length, codecMedianMs: +median(codec.map(c => c.ms)).toFixed(1), codecWorstMs: +worst.ms.toFixed(1),
        isolateMedianMs: +median(codec.map(c => c.work?.isolateMs ?? 0)).toFixed(1), isolateWorstMs: Math.max(...codec.map(c => c.work?.isolateMs ?? 0)),
        isolateOver50: codec.filter(c => c.work?.isolateMs > 50).length,
        over50: calls.filter(c => c.ms > 50).length, worst: worst.work, last: codec.at(-1) && {ms: +codec.at(-1).ms.toFixed(1), ...codec.at(-1).work}};
      rows.push(row); console.log(JSON.stringify(row));
      await writeFile(join(out, `calls-${file.split('/').pop()}-${mode}.json`), JSON.stringify(calls.map(c => ({ms: +c.ms.toFixed(1), ...c.work}))));
    } finally { if (shared) await shared.close(); await host.close(); }
  }
}
await writeFile(join(out, 'rows.json'), JSON.stringify(rows, null, 1));
clock.close?.();
process.exit(0);
