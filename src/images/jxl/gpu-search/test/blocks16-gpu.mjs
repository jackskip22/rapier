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
  const inputs = photos.length ? photos.map(p => ({name: basename(p), png: p})) : [{name: 'synthetic-600x376', synthetic: [600, 376]}, {name: 'synthetic-333x257', synthetic: [333, 257]}];
  for (const input of inputs) {
    if (input.png) copyFileSync(input.png, dir + 'blocks16.png');
    const result = await browser.page.evaluate(async ({synthetic, qualities, whole}) => {
      let width, height, rgba;
      if (synthetic) {
        [width, height] = synthetic; rgba = new Uint8Array(width * height * 4); let s = 7;
        const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const a = (y * width + x) * 4, smooth = ((x >> 5) + (y >> 5)) % 3 === 0;
          for (let c = 0; c < 3; c++) rgba[a + c] = smooth ? (x * (c + 1) + y) & 255 : (128 + 60 * Math.sin(x / (3 + c)) * Math.cos(y / 5) + rnd() * 40) | 0;
          rgba[a + 3] = 255;
        }
      } else {
        const bitmap = await createImageBitmap(await (await fetch('/gpu-search/bench/.data/blocks16.png', {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0); width = bitmap.width; height = bitmap.height;
        rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
      }
      const {blockSearchOptions, v6Image, prepareV6} = await import('/photo-v6.mjs');
      const {xybStrategies, strategyCosts, strategyInputs} = await import('/varblocks.mjs');
      const {perceptualMaskField} = await import('/aq.mjs');
      const {scaledDCTBases, lowFrequencies} = await import('/vardct-strategies.mjs');
      const {configureKernels, prepareKernels} = await import('/kernels.mjs');
      await prepareKernels(); configureKernels('auto');
      const {gpuBlocks16Costs, gpuBlocks16Levels, gpuBlocks16Stats} = await import('/gpu-blocks16.mjs');
      const {encodeAsync} = await import('/effort.mjs');
      const {gpuCoreQualified} = await import('/gpu-core.mjs');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
      const qualified = await gpuCoreQualified(device);
      const src = await (await fetch('/gpu-core.mjs')).text(), ds = src.slice(src.indexOf('const GC_DS = `') + 15, src.indexOf('`;', src.indexOf('const GC_DS = `')));
      const blocksOf = image => image.strategyData.blocks.map(b => [b.id, b.bx, b.by, ...b.coeffs.flatMap(c => [...c]), ...b.dc.flatMap(c => [...c])].join(',')).join(';');
      const rows = [], stride = Math.ceil(width / 8), lines = Math.ceil(height / 8);
      const {V6, GABORISH} = await import('/photo-v6.mjs');
      const {photoXYBSteps, XYB_TABLES} = await import('/photo-xyb.mjs');
      const {complete} = await import('/bits.mjs');
      const {transformDCT8, dct8Basis} = await import('/photo-dct.mjs');
      const {maskWeights} = await import('/aq.mjs');
      const {gpuCoreImage} = await import('/gpu-core.mjs');
      const lib = {complete, photoXYBSteps, transformDCT8, dct8Basis, xyb: XYB_TABLES};
      for (const quality of qualities) {
        const prepared = prepareV6(rgba, width, height), base = v6Image(prepared, quality, {keepPlanes: true, calibrationRow: 'blocksFast'}, false);
        const search = {...blockSearchOptions(rgba, width, height), ids: [4]}, weight = perceptualMaskField(base.planes, stride, lines).weight;
        let t = performance.now();
        const cpu = xybStrategies(base, width, height, {...search, priceOnly: true, keepChosen: true});
        const cpuMs = performance.now() - t;
        const exact = strategyCosts(base, width, height, {...search, maskWeight: weight}), input = strategyInputs(base, width, height, search);
        for (const source of ['cpu-mask', 'device-mask']) {
          const fields = {data: rgba, width, height, options: {...V6, ...GABORISH, calibrationRow: 'blocksFast'}, lib, ...(source === 'cpu-mask' ? {weight} : {maskWeights})};
          const request = {...fields, input, search, scaledDCTBases, lowFrequencies, lib};
          t = performance.now();
          const gpu = await gpuCoreImage(device, {kind: 'blocks16', ...request});
          const gpuMs = performance.now() - t;
          if (!gpu) { rows.push({quality, width, height, source, failed: true, qualified}); continue; }
          let outside = 0, worstD = 0, worstR = 0, compared = 0, maxRelD = 0, maxWeight = 0;
          for (let b = 0; b < weight.length; b++) maxWeight = Math.max(maxWeight, Math.abs(gpu.weight[b] - weight[b]) / weight[b]);
          for (const id of [0, 4]) {
            const g = gpu.costs.get(id), c = exact.get(id);
            for (let b = 0; b < g.D.length; b++) {
              if (Number.isNaN(g.D[b]) || !Number.isFinite(g.De[b])) continue;
              if (id === 4 && ((b % stride) & 1 || (Math.floor(b / stride)) & 1)) continue;
              compared++;
              const dD = Math.abs(g.D[b] - c.D[b]), dR = Math.abs(g.R[b] - c.R[b]);
              if (!(dD <= g.De[b]) || !(dR <= g.Re[b])) outside++;
              worstD = Math.max(worstD, dD / g.De[b]); worstR = Math.max(worstR, dR / (g.Re[b] || 1e-300)); maxRelD = Math.max(maxRelD, dD / Math.abs(c.D[b]));
            }
          }
          t = performance.now();
          let choice = xybStrategies(base, width, height, {...search, costs: gpu.costs, maskWeight: gpu.weight, costDoubt: gpu.weightDoubt, priceOnly: true, chooseOnly: true});
          const escalated = choice.open.length;
          if (escalated && gpu.weightDoubt) choice = xybStrategies(base, width, height, {...search, costs: gpu.costs, maskWeight: weight, priceOnly: true, chooseOnly: true});
          const chooseMs = performance.now() - t;
          t = performance.now();
          const made = await gpuCoreImage(device, {kind: 'blocks16-levels', ...request, layout: choice.layout});
          const levelsMs = performance.now() - t;
          t = performance.now();
          const leveled = made && !choice.open.length ? xybStrategies(base, width, height, {...search, layout: choice.layout, exact: made.exact}) : null;
          const assembleMs = performance.now() - t;
          rows.push({quality, width, height, source, compared, outside, flagged: gpu.flagged, worstD, worstR, maxRelD, maxWeight, weightDoubt: gpu.weightDoubt,
            reprices: choice.reprices.length, settled: choice.settled, escalated, open: choice.open.length, reverted: choice.reverted, doubtfulBlocks: made?.doubtful,
            same: !!leveled && blocksOf(leveled.image) === blocksOf(cpu.image), cpuSearchMs: cpuMs, gpuCostsMs: gpuMs, chooseMs, levelsMs, assembleMs, qualified,
            whole: source === 'device-mask' ? await (async () => {
              const runs = [];
              for (const effort of whole) {
                const time = async gpu => { const t = performance.now(); const bytes = await encodeAsync(rgba, width, height, {quality, effort, gpu}); return [bytes, performance.now() - t]; };
                const [a] = await time(false), before = {...gpuBlocks16Stats}, [b] = await time(device), used = gpuBlocks16Stats.costs - before.costs, energy = gpuBlocks16Stats.energy - before.energy;
                const cpu = [], gpu = [];
                for (let i = 0; i < 3; i++) { cpu.push((await time(false))[1]); gpu.push((await time(device))[1]); }
                const median = v => v.sort((x, y) => x - y)[1];
                let same = a.length === b.length; for (let i = 0; same && i < a.length; i++) same = a[i] === b[i];
                runs.push({effort, same, used, energy, bytes: a.length, cpuWarmMs: median(cpu), gpuWarmMs: median(gpu), stats: {...gpuBlocks16Stats}});
              }
              return runs;
            })() : []});
        }
      }
      device.destroy();
      return rows;
    }, {synthetic: input.synthetic, qualities, whole});
    for (const r of result) {
      if (r.failed) { failures++; console.log(`FAIL ${input.name} q${r.quality} ${r.source}: no answer (qualified ${r.qualified})`); continue; }
      const ok = r.outside === 0 && r.same && r.open === 0 && r.qualified && r.whole.every(w => w.same && w.used > 0);
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${input.name} q${r.quality} ${r.width}x${r.height} ${r.source}: ${r.compared} costs, ${r.outside} outside, ${r.flagged} flagged, worst D ${r.worstD.toExponential(2)} of bound (rel ${r.maxRelD.toExponential(2)}), worst R ${r.worstR.toExponential(2)}, weights ${r.maxWeight.toExponential(2)} (bound ${r.weightDoubt.toExponential(2)}), settled ${r.settled}, reprices ${r.reprices}, escalated ${r.escalated}, open ${r.open}, reverted ${r.reverted}, ${r.doubtfulBlocks} doubtful blocks, same ${r.same}; CPU search ${r.cpuSearchMs.toFixed(0)} ms, GPU costs ${r.gpuCostsMs.toFixed(0)} ms, choice ${r.chooseMs.toFixed(0)} ms, GPU levels ${r.levelsMs.toFixed(0)} ms, assembly ${r.assembleMs.toFixed(0)} ms`);
      for (const w of r.whole) console.log(`  e${w.effort}: ${w.same ? 'same bytes' : 'DIFFERENT BYTES'} (${w.bytes} B), WebGPU search taken ${w.used}x, its mask from the picture pass ${w.energy}x; warm WebAssembly ${w.cpuWarmMs.toFixed(0)} ms, WebGPU ${w.gpuWarmMs.toFixed(0)} ms (${(w.gpuWarmMs / w.cpuWarmMs).toFixed(2)})`);
      rows.push({file: input.name, ...r, adapter: browser.adapter});
    }
  }
} finally { await browser.close(); }
if (out) writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
process.exit(failures ? 1 : 0);
