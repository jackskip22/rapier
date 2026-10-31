// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Jack Skipworth. See LICENSE-MIT.
// Vendor code and complete upstream license texts retain their own pinned grants.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const descriptor = 'agent/vendor/MARKDOWN-RUNTIME.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (root, file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
function inventory(root) {
  const value = json(root, descriptor);
  if (value.format !== 'rapier-markdown-vendor/1' || !Array.isArray(value.files) || !Array.isArray(value.licenses))
    throw new Error('The Markdown vendor inventory is invalid');
  const names = value.files.map(row => row.path);
  if (new Set(names).size !== names.length || names.some(name => typeof name !== 'string' ||
      !name.startsWith('agent/vendor/') || name.split('/').includes('..') || name.includes('\\')))
    throw new Error('The Markdown vendor inventory leaves its source directory');
  return value;
}
export function markdownVendorFiles(root) {
  return [descriptor, ...inventory(root).files.map(row => row.path)];
}
export function checkMarkdownVendors(root) {
  const value = inventory(root), contents = new Map();
  for (const row of value.files) {
    const bytes = readFileSync(join(root, row.path));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256)
      throw new Error('Pinned Markdown vendor bytes differ: ' + row.path);
    contents.set(row.path, bytes);
  }
  const runtime = value.runtime, source = contents.get(runtime?.path)?.toString('utf8');
  if (typeof runtime?.prefix !== 'string' || typeof runtime?.suffix !== 'string' ||
      !source?.startsWith(runtime.prefix) || !source.endsWith(runtime.suffix))
    throw new Error('The Markdown constructor wrapper differs');
  const body = Buffer.from(source.slice(runtime.prefix.length, -runtime.suffix.length));
  const entities = json(root, 'agent/vendor/BROWSER-ENTITIES.json');
  const derived = entities.vendors.find(row => row.derived?.sha256 === runtime.bodySha256)?.derived;
  if (!derived || body.length !== runtime.bodyBytes || body.length !== derived.bytes ||
      sha256(body) !== runtime.bodySha256)
    throw new Error('The Markdown constructor is not the pinned published parser');
  const published = json(root, 'agent/vendor/MARKDOWNIT.json');
  const licenses = published.manifests.filter(row => /LICENSE/i.test(row.path));
  if (value.licenses.length !== licenses.length || value.licenses.some(row => !licenses.some(pin =>
      pin.scope === row.source?.scope && pin.path === row.source?.path && pin.bytes === row.source?.bytes &&
      pin.sha256 === row.source?.sha256))) throw new Error('The Markdown upstream license inventory differs');
  for (const row of value.licenses) {
    const bytes = contents.get(row.path);
    if (!bytes || bytes.length !== row.source.bytes || sha256(bytes) !== row.source.sha256)
      throw new Error('The Markdown upstream license text differs: ' + row.path);
  }
  if (!contents.has('agent/vendor/NOTICE.txt') || !contents.has('agent/vendor/markdown-plugins.json'))
    throw new Error('The Markdown plugin notices and source pins are missing');
  const plugins = value.plugins, pluginSource = contents.get(plugins?.path)?.toString('utf8');
  if (typeof plugins?.prefix !== 'string' || typeof plugins?.suffix !== 'string' ||
      !pluginSource?.startsWith(plugins.prefix) || !pluginSource.endsWith(plugins.suffix))
    throw new Error('The Markdown plugin context wrapper differs');
  const pluginBody = Buffer.from(pluginSource.slice(plugins.prefix.length, -plugins.suffix.length));
  if (pluginBody.length !== plugins.bodyBytes || sha256(pluginBody) !== plugins.bodySha256)
    throw new Error('The Markdown plugin bodies differ');
  let offset = 0;
  for (const pin of json(root, 'agent/vendor/markdown-plugins.json').components) {
    const bytes = pluginBody.subarray(offset, offset + pin.bytes);
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256)
      throw new Error('The published Markdown plugin differs: ' + pin.source);
    offset += pin.bytes;
  }
  if (offset !== pluginBody.length) throw new Error('The Markdown plugin spans do not cover their body');
  return {files: value.files.length + 1, runtimeBytes: body.length, upstreamLicenses: licenses.length};
}

export const READABLE_MARKDOWN = 'agent/vendor/markdown-readable/SOURCES.json';
export function readableMarkdownFiles(root) {
  const value = json(root, READABLE_MARKDOWN);
  if (value.format !== 'rapier-markdown-readable/1' || !Array.isArray(value.files) || !value.files.length ||
      value.files.some(row => typeof row.path !== 'string' || row.path.startsWith('/') || row.path.split('/').includes('..')))
    throw new Error('The readable Markdown inventory is invalid');
  return value.files;
}
export function checkReadableMarkdown(root) {
  const files = readableMarkdownFiles(root);
  for (const row of files) {
    const bytes = readFileSync(join(root, 'agent/vendor/markdown-readable', row.path));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error('Pinned readable Markdown bytes differ: ' + row.path);
  }
  return {files: files.length, bytes: files.reduce((sum, row) => sum + row.bytes, 0)};
}
