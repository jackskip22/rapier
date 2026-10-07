// SPDX-License-Identifier: AGPL-3.0-only
// One resource set feeds the page, native packs and built-in editor resource.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const resources = JSON.parse(readFileSync(new URL('../shell/mermaid-resources.json', import.meta.url), 'utf8'));
for (const file of resources.files) {
  if (!/^[a-z][a-z0-9-]*$/.test(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[A-Za-z0-9+/]{64}$/.test(file.sri))
    throw new Error('Invalid Mermaid resource pin');
}
export function mermaidResourceFiles(root) {
  return resources.files.map(file => ({...file, id: 'rapier-mermaid-' + file.name, ...(file.path ? {path: join(root, file.path)} : {})}));
}
export function fillMermaidResources(source) {
  const marker = '/* RAPIER_MERMAID_RESOURCES */ null';
  if (source.split(marker).length !== 2) throw new Error('The diagram loader needs one resource set');
  const runtime = {...resources, files: resources.files.map(({path, ...file}) => file)};
  return source.replace(marker, () => JSON.stringify(runtime));
}
