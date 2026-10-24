// node gpu-search/test/proof.mjs <png>... [--efforts 1,7,9] [--qualities 50,80,95]; JXL_TOOLS, RAPIER_CHROME as browser.mjs.
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, basename} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {decoder} from '../../public/test/decoder.mjs';
import {encode} from '../../effort.mjs';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const efforts = opt('--efforts', '1,7,9').split(',').map(Number), qualities = opt('--qualities', '50,80,95').split(',').map(Number);
const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools', work = mkdtempSync(join(tmpdir(), 'proof-')), oxide = await decoder();
const browser = await openBrowser();
let failed = 0, files = 0;
for (const png of args) {
  const {width, height, rgba} = readPng(readFileSync(png));
  for (const effort of efforts) for (const quality of qualities) {
    const bytes = encode(rgba, width, height, {quality, effort}), file = join(work, 'p.jxl'), out = join(work, 'p.png');
    writeFileSync(file, bytes); files++;
    let lib, ox, chrome, why = '';
    try { execFileSync(join(tools, 'djxl'), [file, out], {stdio: 'ignore'}); lib = readPng(readFileSync(out)).rgba; } catch { why += ' djxl'; }
    try { const o = oxide(bytes); ox = Uint8Array.from({length: width * height * 4}, (_, i) => o.channels === 4 || i % 4 < 3 ? o.data[(i >> 2) * o.channels + (i & 3)] : 255); } catch { why += ' jxl-oxide'; }
    chrome = await browser.page.evaluate(async ({b64, width, height}) => {
      try {
        const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], {type: 'image/jxl'});
        const bitmap = await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
        const c = new OffscreenCanvas(width, height), x = c.getContext('2d'); x.drawImage(bitmap, 0, 0);
        return Array.from(x.getImageData(0, 0, width, height).data);
      } catch (e) { return String(e); }
    }, {b64: Buffer.from(bytes).toString('base64'), width, height});
    if (typeof chrome === 'string') { why += ' chrome (' + chrome.slice(0, 80) + ')'; chrome = null; }
    let worst = 0;
    if (lib && ox && chrome) for (let i = 0; i < width * height * 4; i++) if (i % 4 < 3) worst = Math.max(worst, Math.abs(lib[i] - ox[i]), Math.abs(lib[i] - chrome[i]));
    const ok = !why && worst <= 1;
    if (!ok) failed++;
    if (!ok || process.env.VERBOSE) console.log((ok ? 'ok  ' : 'FAIL') + ` ${basename(png)} q${quality} e${effort} ${bytes.length} B` + (why ? ' failed in' + why : ` max ${worst}`));
  }
}
console.log(`${files - failed} of ${files} files decode in djxl, jxl-oxide and Chrome ${browser.adapter ? '' : '(no adapter) '}within 1/255`);
await browser.close();
process.exit(failed ? 1 : 0);
