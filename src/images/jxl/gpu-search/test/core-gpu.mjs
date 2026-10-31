import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const chrome = opt('--chrome', undefined), out = opt('--out', null), qualities = opt('--qualities', '75,90').split(',').map(Number);
const stillEfforts = opt('--still-efforts', '1').split(',').filter(Boolean).map(Number);
const flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7)), photos = args.filter(a => !a.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const rows = [];
let failed = 0;
for (const png of photos) {
  copyFileSync(png, dir + 'cg.png');
  const r = await browser.page.evaluate(async ({url, qualities, stillEfforts}) => {
    const ms = () => performance.now();
    const bitmap = await createImageBitmap(await (await fetch(url, {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
    const width = bitmap.width, height = bitmap.height, canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
    const {prepareV6, photoV6Image, V6, GABORISH} = await import('/photo-v6.mjs'), {GpuCore} = await import('/gpu-core.mjs');
    const {varDCTSteps} = await import('/vardct.mjs'), {complete} = await import('/bits.mjs'), {photoXYBSteps, XYB_TABLES} = await import('/photo-xyb.mjs');
    const {transformDCT8, dct8Basis} = await import('/photo-dct.mjs'), {encode, encodeAsync} = await import('/index.mjs');
    const {createStillEncoder} = await import('/rapier-still.mjs'), still = createStillEncoder();
    const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
    const device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
    const errors = [];
    device.addEventListener('uncapturederror', e => errors.push(e.error.message.slice(0, 300)));
    const core = await GpuCore.create(device, {complete, photoXYBSteps, transformDCT8, dct8Basis, xyb: XYB_TABLES}), out = [];
    const hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
    for (const quality of qualities) {
      let t = ms(); const cpu = photoV6Image(prepareV6(rgba, width, height), quality); const cpuMs = ms() - t;
      await core.image(rgba, width, height, quality, {...V6, ...GABORISH});
      t = ms(); const g = await core.image(rgba, width, height, quality, {...V6, ...GABORISH}); const gpuMs = ms() - t;
      let levels = 0, cfl = 0;
      for (let c = 0; c < 3; c++) { const a = cpu.components[c].coeffs, b = g.image.components[c].coeffs; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) levels++; }
      for (let i = 0; i < cpu.cfl.x.length; i++) if (cpu.cfl.x[i] !== g.image.cfl.x[i] || cpu.cfl.b[i] !== g.image.cfl.b[i]) cfl++;
      t = ms(); const bytesCpu = complete(varDCTSteps(cpu)); const entropyMs = ms() - t;
      const bytesGpu = complete(varDCTSteps(g.image));
      t = ms(); const fileCpu = encode(rgba, width, height, {quality}); const encodeMs = ms() - t;
      await encodeAsync(rgba, width, height, {quality, gpu: device});
      t = ms(); const fileGpu = await encodeAsync(rgba, width, height, {quality, gpu: device}); const asyncMs = ms() - t;
      const stillRows = [];
      for (const effort of stillEfforts) {
        const o = {quality, effort, photo: true, parallel: false};
        t = ms(); const a = await still.encode(rgba, width, height, {...o, gpu: false}); const cpuMs = ms() - t;
        t = ms(); const b = await still.encode(rgba, width, height, {...o, gpu: device}); const gpuMs = ms() - t;
        stillRows.push({effort, same: (await hash(a)) === (await hash(b)), bytes: a.length, cpuMs: Math.round(cpuMs), gpuMs: Math.round(gpuMs)});
      }
      out.push({quality, still: stillRows, levelsDiffering: levels, cflDiffering: cfl, sameBytes: (await hash(bytesCpu)) === (await hash(bytesGpu)), bytes: bytesCpu.length,
        doubtfulBlocks: g.doubtfulBlocks, doubtfulTiles: g.doubtfulTiles, blocks: g.blocks, tiles: g.tiles,
        cpuForwardMs: Math.round(cpuMs), gpuForwardMs: Math.round(gpuMs), entropyMs: Math.round(entropyMs),
        coreSame: (await hash(fileCpu)) === (await hash(fileGpu)), coreBytes: fileCpu.length, encodeMs: Math.round(encodeMs), encodeAsyncMs: Math.round(asyncMs)});
    }
    device.destroy();
    return {width, height, adapter: adapter.info.description || adapter.info.architecture, rows: out, errors: errors.slice(0, 3)};
  }, {url: "/gpu-search/bench/.data/cg.png", qualities, stillEfforts});
  for (const row of r.rows) {
    const ok = !row.levelsDiffering && !row.cflDiffering && row.sameBytes && row.coreSame && row.still.every(x => x.same);
    if (!ok) failed++;
    console.log(`${ok ? 'same' : 'DIFF'} ${basename(png)} q${row.quality} ${r.width}x${r.height}: levels ${row.levelsDiffering} cfl ${row.cflDiffering} bytes ${row.sameBytes ? 'same' : 'differ'} (${row.bytes}); doubtful blocks ${row.doubtfulBlocks}/${row.blocks} (${(row.doubtfulBlocks / row.blocks * 100).toFixed(2)}%), tiles ${row.doubtfulTiles}/${row.tiles}; forward cpu ${row.cpuForwardMs} ms, gpu ${row.gpuForwardMs} ms; entropy ${row.entropyMs} ms; core encode ${row.encodeMs} ms, encodeAsync ${row.encodeAsyncMs} ms (${row.coreSame ? 'same file' : 'FILE DIFFERS'})` +
      row.still.map(x => `; still e${x.effort} ${x.same ? 'same' : 'DIFFERS'} cpu ${x.cpuMs} ms gpu ${x.gpuMs} ms`).join(''));
  }
  if (r.errors.length) { console.log('GPU errors', r.errors); failed++; }
  rows.push({photo: basename(png), ...r});
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
}
await browser.close();
rmSync(dir + 'cg.png', {force: true});
process.exit(failed ? 1 : 0);
