import {readFileSync, writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import {openBrowser, SOFTWARE_FLAGS} from './test/browser.mjs';

const args = process.argv.slice(2), photos = [], opt = {flags: [], settings: 'v6tuned2,v6tuned3,v6tuned4', effort: 7, targets: '[{"ssimulacra2":80},{"butteraugli3":1.0}]', maxPixels: 4e6, repeats: 3};
for (let i = 0; i < args.length; i++) {
  const [key, inline] = args[i].startsWith('--') ? args[i].split(/=(.*)/s) : [null];
  const value = () => inline ?? args[++i];
  if (key === '--chrome') opt.chrome = value();
  else if (key === '--flag') opt.flags.push(value());
  else if (key === '--targets') opt.targets = value();
  else if (key === '--settings') opt.settings = value();
  else if (key === '--effort') opt.effort = Number(value());
  else if (key === '--max-pixels') opt.maxPixels = Number(value());
  else if (key === '--repeats') opt.repeats = Number(value());
  else if (key === '--cpu-search') opt.cpuSearch = true;
  else if (key === '--out') opt.out = value();
  else if (key) throw new Error('unknown option ' + key);
  else photos.push(args[i]);
}
if (!photos.length) throw new Error('name at least one photo');
const flags = opt.flags.length ? opt.flags : SOFTWARE_FLAGS;
const {page, close} = await openBrowser({chrome: opt.chrome, flags});
const reports = [];
for (const photo of photos) {
  const started = Date.now();
  const report = await page.evaluate(async ({b64, options}) => {
    const {benchPhoto} = await import('/gpu-search/bench-entry.mjs');
    const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]);
    return benchPhoto(blob, options);
  }, {b64: readFileSync(photo).toString('base64'), options: {targets: JSON.parse(opt.targets), settings: opt.settings.split(','),
    effort: opt.effort, maxPixels: opt.maxPixels, cpuSearch: !!opt.cpuSearch, repeats: opt.repeats}});
  reports.push({photo: basename(photo), flags, wallMs: Date.now() - started, ...report});
  console.error(basename(photo), 'done in', Date.now() - started, 'ms');
}
await close();
const text = JSON.stringify(reports, null, 1);
if (opt.out) writeFileSync(opt.out, text); else console.log(text);
