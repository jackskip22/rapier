import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {serialize, deserialize} from 'node:v8';
import {join, basename} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {prepareV6 as prepare, candidateImage, decisionSteps, cpuMeasure, runSync} from '../../photo-v6-search.mjs';

export function* loadImages(dir, files, qualities) {
  for (const png of files) {
    const {rgba, width, height} = readPng(readFileSync(png)), prepared = prepare(rgba, width, height);
    for (const q of qualities) {
      const name = basename(png, '.png') + '-q' + q, decisions = deserialize(readFileSync(join(dir, name + '.decisions.v8')));
      yield {name, png, gaborish: candidateImage(prepared, 'gaborish', q, null), closed: candidateImage(prepared, 'closed', q, decisions)};
    }
  }
}

const main = import.meta.url === 'file://' + process.argv[1];
const [dir, qualities, ...files] = main ? process.argv.slice(2) : [];
if (main) mkdirSync(dir, {recursive: true});
if (main) for (const png of files) {
  const {rgba, width, height} = readPng(readFileSync(png)), prepared = prepare(rgba, width, height);
  const measure = cpuMeasure(rgba, width, height);
  for (const q of qualities.split(',').map(Number)) {
    const name = basename(png, '.png') + '-q' + q;
    const file = join(dir, name + '.decisions.v8');
    if (existsSync(file)) continue;
    const started = Date.now();
    writeFileSync(file, serialize(runSync(decisionSteps(prepared, q), measure)));
    console.error(name, ((Date.now() - started) / 1000).toFixed(1) + ' s');
  }
}
