// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const resources = JSON.parse(readFileSync(new URL('../shell/font-subset-resources.json', import.meta.url), 'utf8'));
if (resources.files.length !== 1 || resources.files.some(file => !/^[a-z][a-z0-9-]*$/.test(file.name) ||
    !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[A-Za-z0-9+/]{64}$/.test(file.sri)))
  throw new Error('Invalid font subsetter resource pin');
export function fontSubsetResourceFiles(root) {
  return resources.files.map(file => ({...file, id: 'rapier-font-subset', path: join(root, file.path)}));
}
export function fillFontSubsetResources(source) {
  const marker = '/* RAPIER_FONT_SUBSET_RESOURCES */ null';
  if (source.split(marker).length !== 2) throw new Error('The font subsetter needs one resource set');
  return source.replace(marker, () => JSON.stringify({...resources, files: resources.files.map(({path, ...file}) => file)}));
}
