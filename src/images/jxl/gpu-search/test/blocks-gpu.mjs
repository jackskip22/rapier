// SPDX-License-Identifier: MIT
import {writeFileSync, copyFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', undefined), out = option('--out', null), qualities = option('--qualities', '75,90').split(',').map(Number);
const whole = option('--whole', '').split(',').filter(Boolean).map(Number);
const allowFallback = args.includes('--allow-fallback'), flags = args.filter(v => v.startsWith('--flag=')).map(v => v.slice(7));
const photos = args.filter(v => !v.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const rows = [];
let failures = 0;
try {
  for (let i = 0; !browser.adapter && i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    browser.adapter = await browser.page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? {vendor: a.info.vendor, architecture: a.info.architecture, fallback: a.info.isFallbackAdapter} : null; });
  }
  if (!browser.adapter || (browser.adapter.fallback && !allowFallback)) throw new Error('No hardware adapter: ' + JSON.stringify(browser.adapter));
  for (const photo of photos) {
    copyFileSync(photo, dir + 'blocks.png');
    const result = await browser.page.evaluate(async ({qualities, whole}) => {
      const bitmap = await createImageBitmap(await (await fetch('/gpu-search/bench/.data/blocks.png', {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const width = bitmap.width, height = bitmap.height, rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
      const {blockSearchOptions, v6Image, prepareV6, V6, GABORISH} = await import('/photo-v6.mjs');
      const {xybStrategies, strategyCosts, strategyInputs} = await import('/varblocks.mjs');
      const {perceptualMaskField} = await import('/aq.mjs');
      const {scaledDCTBases, lowFrequencies} = await import('/vardct-strategies.mjs');
      const {configureKernels, prepareKernels} = await import('/kernels.mjs');
      await prepareKernels(); configureKernels('auto');
      const {gpuCoreQualified, gpuCoreImage} = await import('/gpu-core.mjs');
      const {gpuBlocksStats} = await import('/gpu-blocks.mjs');
      const {gpuS2Stats} = await import('/gpu-ssimulacra2-native.mjs');
      const {gpuStats: searchStats} = await import('/photo-v6-search.mjs');
      const {encodeAsync} = await import('/effort.mjs');
      const {photoXYBSteps, XYB_TABLES} = await import('/photo-xyb.mjs');
      const {complete} = await import('/bits.mjs');
      const {transformDCT8, dct8Basis} = await import('/photo-dct.mjs');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
      const qualified = await gpuCoreQualified(device);
      const lib = {complete, photoXYBSteps, transformDCT8, dct8Basis, xyb: XYB_TABLES};
      const stride = Math.ceil(width / 8), lines = Math.ceil(height / 8), rows = [];
      const layoutOf = list => list.map(b => `${b.id}:${b.bx}:${b.by}`).sort().join(';');
      for (const quality of qualities) {
        const options = {...V6, ...GABORISH, calibrationRow: 'blocks'};
        const base = v6Image(prepareV6(rgba, width, height), quality, {keepPlanes: true, calibrationRow: 'blocks'}, false);
        const search = blockSearchOptions(rgba, width, height), weight = perceptualMaskField(base.planes, stride, lines).weight;
        let t = performance.now();
        const cpu = xybStrategies(base, width, height, {...search, priceOnly: true, keepChosen: true});
        const cpuMs = performance.now() - t;
        const exact = strategyCosts(base, width, height, {...search, maskWeight: weight}), input = strategyInputs(base, width, height, search);
        t = performance.now();
        const gpu = await gpuCoreImage(device, {kind: 'blocks', data: rgba, width, height, options, lib, input, search, ids: search.ids, scaledDCTBases, lowFrequencies, weight});
        const gpuMs = performance.now() - t;
        if (!gpu) { rows.push({quality, width, height, failed: true, qualified}); continue; }
        const per = {};
        let outside = 0, compared = 0;
        for (const [id, g] of gpu.costs) {
          const c = exact.get(id), s = per[id] = {compared: 0, outside: 0, flagged: 0, worstD: 0, worstR: 0};
          for (let b = 0; b < g.D.length; b++) {
            if (Number.isNaN(g.D[b])) continue;
            if (!Number.isFinite(g.De[b])) { s.flagged++; continue; }
            s.compared++; compared++;
            const dD = Math.abs(g.D[b] - c.D[b]), dR = Math.abs(g.R[b] - c.R[b]);
            if (!(dD <= g.De[b]) || !(dR <= g.Re[b])) { s.outside++; outside++; }
            s.worstD = Math.max(s.worstD, dD / g.De[b]); s.worstR = Math.max(s.worstR, dR / (g.Re[b] || 1e-300));
          }
        }
        t = performance.now();
        const choice = xybStrategies(base, width, height, {...search, costs: gpu.costs, maskWeight: weight, priceOnly: true, chooseOnly: true});
        const chooseMs = performance.now() - t;
        const same = layoutOf(choice.layout) === layoutOf(cpu.image.strategyData.blocks);
        t = performance.now();
        const made = await gpuCoreImage(device, {kind: 'blocks-levels', data: rgba, width, height, options, lib, input, search, scaledDCTBases, lowFrequencies, layout: choice.layout});
        const levelsMs = performance.now() - t;
        t = performance.now();
        const leveled = made ? xybStrategies(base, width, height, {...search, layout: choice.layout, exact: made.exact}) : null;
        const assembleMs = performance.now() - t;
        const blocksOf = image => image.strategyData.blocks.map(b => [b.id, b.bx, b.by, ...b.coeffs.flatMap(c => [...c]), ...b.dc.flatMap(c => [...c])].join(',')).join(';');
        const sameBlocks = !!leveled && blocksOf(leveled.image) === blocksOf(cpu.image);
        rows.push({quality, width, height, compared, outside, flagged: gpu.flagged, per, reprices: choice.reprices.length, settled: choice.settled, open: choice.open.length, reverted: choice.reverted,
          same, sameBlocks, doubtful: made?.doubtful, levelsMs, assembleMs, cpuSearchMs: cpuMs, gpuCostsMs: gpuMs, chooseMs, qualified, stats: {...gpuBlocksStats}, whole: await (async () => {
            const runs = [];
            for (const effort of whole) {
              const time = async gpu => { const t = performance.now(); const bytes = await encodeAsync(rgba, width, height, {quality, effort, gpu}); return [bytes, performance.now() - t]; };
              const [a] = await time(false), before = gpuBlocksStats.costs, scoresBefore = gpuS2Stats.scores, levelsBefore = searchStats.levels, at = {...gpuBlocksStats};
              const trace = globalThis.__jxlTrace = [], t0 = performance.now(), [b] = await time(device), used = gpuBlocksStats.costs - before, scores = gpuS2Stats.scores - scoresBefore, levels = searchStats.levels - levelsBefore;
              globalThis.__jxlTrace = undefined;
              const stages = trace.map(([label, t], i) => [label, Math.round(t - (i ? trace[i - 1][1] : t0))]);
              const pass = {costsMs: gpuBlocksStats.costsMs - at.costsMs, levelsMs: gpuBlocksStats.levelsMs - at.levelsMs};
              const cpu = [], gpu = [];
              for (let i = 0; i < 3; i++) { cpu.push((await time(false))[1]); gpu.push((await time(device))[1]); }
              const median = v => v.sort((x, y) => x - y)[1];
              let same = a.length === b.length; for (let i = 0; same && i < a.length; i++) same = a[i] === b[i];
              runs.push({effort, same, used, scores, levels, bytes: a.length, cpuWarmMs: median(cpu), gpuWarmMs: median(gpu), firstPass: pass, stages});
            }
            return runs;
          })()});
      }
      device.destroy();
      return rows;
    }, {qualities, whole});
    const name = basename(photo);
    for (const r of result) {
      if (r.failed) { failures++; console.log(`FAIL ${name} q${r.quality}: no answer (qualified ${r.qualified})`); continue; }
      const ok = r.outside === 0 && r.same && r.sameBlocks && r.open === 0 && r.qualified && r.whole.every(w => w.same && w.used > 0 && (w.effort < 8 || w.scores > 0 && w.levels > 0));
      if (!ok) failures++;
      const shapes = Object.entries(r.per).map(([id, s]) => `${id}: ${s.compared}/${s.outside}/${s.flagged} D ${s.worstD.toExponential(1)}`).join(', ');
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name} q${r.quality} ${r.width}x${r.height}: ${r.compared} costs, ${r.outside} outside, ${r.flagged} flagged, settled ${r.settled}, reprices ${r.reprices}, open ${r.open}, reverted ${r.reverted}, same layout ${r.same}, same blocks ${r.sameBlocks} (${r.doubtful} doubtful); CPU search ${r.cpuSearchMs.toFixed(0)} ms, GPU costs ${r.gpuCostsMs.toFixed(0)} ms, choice ${r.chooseMs.toFixed(0)} ms, GPU levels ${r.levelsMs.toFixed(0)} ms, assembly ${r.assembleMs.toFixed(0)} ms`);
      console.log(`  id: compared/outside/flagged worst-D-of-bound: ${shapes}`);
      for (const w of r.whole) console.log(`  e${w.effort}: ${w.same ? 'same bytes' : 'DIFFERENT BYTES'} (${w.bytes} B), the full search's WebGPU costs taken ${w.used}x, S2 scores ${w.scores}, S2 search levels ${w.levels}; warm WebAssembly ${w.cpuWarmMs.toFixed(0)} ms, WebGPU ${w.gpuWarmMs.toFixed(0)} ms (${(w.gpuWarmMs / w.cpuWarmMs).toFixed(2)}); first GPU encode: costs ${w.firstPass.costsMs.toFixed(0)} ms, levels ${w.firstPass.levelsMs.toFixed(0)} ms`);
      for (const w of r.whole) console.log(`  e${w.effort} stages (first GPU encode, ms to each mark): ${w.stages.map(([l, ms]) => `${l} ${ms}`).join(', ')}`);
      rows.push({file: name, ...r, adapter: browser.adapter});
    }
  }
} finally { await browser.close(); }
if (out) writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
process.exit(failures ? 1 : 0);
