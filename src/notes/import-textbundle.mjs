// SPDX-License-Identifier: AGPL-3.0-only
import {linkMask} from './links.mjs';
import {importTags, importMetadata, importDate, importTrash, IMPORT_JSON_MAX_BYTES} from './import.mjs';
import {importMarkdown, tagsIn} from './import-markdown.mjs';
import {readImportText, finishImportCharacters} from './import-characters.mjs';

const encoder = new TextEncoder();
const rootOf = row => String(row.rootId || '');
const mime = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', jxl: 'image/jxl', svg: 'image/svg+xml', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif'};
const textName = /(?:^|\/)text\.(?:md|markdown)$/i;

function readManifest(group, warnings) {
  const say = (code, message) => warnings.push({code, message});
  const quoted = value => String(JSON.stringify(value)).slice(0, 40);
  const present = group.manifests, readable = present.filter(row => !row.unreadable && !row.oversize);
  if (!present.length) { say('textbundle-manifest-missing', 'This bundle has no info.json. Its text was read as ordinary Markdown.'); return {kept: []}; }
  if (present.length > 1) {
    say('textbundle-manifest-ambiguous', 'This bundle has more than one info.json (' + present.map(row => row.name).join(', ') + '), so none was read. Each is kept as a file.');
    return {kept: readable};
  }
  const [row] = present;
  if (!readable.length) { say('textbundle-manifest-unreadable', 'The info.json of this bundle could not be read (' + (row.unreadable || 'it is too large') + '). Its text was read as ordinary Markdown.'); return {kept: []}; }
  const size = row.bytes?.byteLength ?? encoder.encode(typeof row.text === 'string' ? row.text : '').length;
  const unreadable = why => { say('textbundle-manifest-unreadable', 'The info.json of this bundle ' + why + '. Its text was read as ordinary Markdown, and the file is kept as it came.'); return {kept: [row]}; };
  if (size > IMPORT_JSON_MAX_BYTES) return unreadable('exceeds the 25 MiB source bound');
  warnings.push(...(row.characterWarnings || []));
  let info;
  try { info = JSON.parse(readImportText(row, warnings).replace(/^\uFEFF/, '')); }
  catch (error) { return unreadable('is not valid JSON (' + String(error?.message || error) + ')'); }
  if (!info || typeof info !== 'object' || Array.isArray(info)) return unreadable('is not a JSON object');
  if (![1, 2].includes(info.version))
    say('textbundle-manifest-version', 'The info.json of this bundle ' + (info.version === undefined ? 'has no version' : 'says version ' + quoted(info.version)) + '; this reader knows versions 1 and 2. Its text was read as Markdown and the manifest is kept in the import record.');
  if (info.type !== undefined && info.type !== 'net.daringfireball.markdown')
    say('textbundle-manifest-type', 'The info.json of this bundle says type ' + quoted(info.type) + ', not Markdown. Its text was read as Markdown and the manifest is kept in the import record.');
  return {info, row, kept: []};
}

const BEAR = 'net.shinyfrog.bear';
function applyManifest(info, entry, warnings, options) {
  const bear = info[BEAR] && typeof info[BEAR] === 'object' && !Array.isArray(info[BEAR]) ? info[BEAR] : null, applied = [];
  if (bear) {
    const created = importDate(bear.creationDate, Date.parse(bear.creationDate), warnings, 'Bear creation date');
    const modified = importDate(bear.modificationDate, Date.parse(bear.modificationDate), warnings, 'Bear edit date');
    if (created !== undefined) { entry.created = created; applied.push('creationDate'); }
    if (modified !== undefined) { entry.modified = modified; applied.push('modificationDate'); }
    for (const flag of ['pinned', 'archived', 'trashed']) if ([0, 1, false, true].includes(bear[flag])) { entry[flag] = !!bear[flag]; applied.push(flag); }
    importTrash(entry, options, warnings);
    importMetadata(bear, applied, warnings, 'Bear note details', {at: BEAR});
  }
  importMetadata(info, [BEAR, ...([1, 2].includes(info.version) ? ['version'] : []), ...(info.type === 'net.daringfireball.markdown' ? ['type'] : [])],
    warnings, 'Bundle details');
}

export async function importTextBundle(entries, options = {}) {
  const named = (Array.isArray(entries) ? entries : []).filter(row => row && typeof row.name === 'string');
  const groups = new Map(), sources = new Map(), markdown = [], skipped = [], pictures = [], attachments = [], consumed = [];
  const keyOf = (root, name) => JSON.stringify([root, name]);
  const candidates = named.filter(row => textName.test(row.name) || /(?:^|\/)info\.json$/i.test(row.name));
  const directories = new Set(candidates.map(row => keyOf(rootOf(row), row.name.slice(0, row.name.lastIndexOf('/') + 1))));
  for (const row of candidates) {
    let ancestor = '', asset = false;
    for (const part of row.name.split('/').slice(0, -1)) {
      if (part === 'assets' && directories.has(keyOf(rootOf(row), ancestor))) { asset = true; break; }
      ancestor += part + '/';
    }
    if (asset) continue;
    const directory = row.name.slice(0, row.name.lastIndexOf('/') + 1), key = JSON.stringify([rootOf(row), directory]);
    if (!groups.has(key)) groups.set(key, {directory, rootId: rootOf(row), texts: [], manifests: []});
    groups.get(key)[textName.test(row.name) ? 'texts' : 'manifests'].push(row);
  }
  const resources = new Map();
  for (const asset of named) {
    if (asset.unreadable || asset.oversize) continue;
    const root = rootOf(asset);
    for (let at = asset.name.indexOf('assets/'); at !== -1; at = asset.name.indexOf('assets/', at + 1)) {
      const key = keyOf(root, asset.name.slice(0, at));
      if (!groups.has(key)) continue;
      if (!resources.has(key)) resources.set(key, []);
      resources.get(key).push(asset);
    }
  }
  for (const group of groups.values()) {
    const refuse = why => {
      for (const row of [...group.texts, ...group.manifests]) skipped.push({name: row.name, rootId: group.rootId, why});
    };
    if (group.texts.length !== 1) {
      refuse(group.texts.length ? 'This bundle holds more than one text file (' + group.texts.map(row => row.name.slice(row.name.lastIndexOf('/') + 1)).join(' and ') + '), so none was read as its note.'
        : 'TextBundle is missing text.md or text.markdown.');
      continue;
    }
    const input = group.texts[0];
    if (input.unreadable || input.oversize) { refuse(input.unreadable || 'TextBundle contains an unreadable file.'); continue; }
    const warnings = [...(input.characterWarnings || [])];
    let body;
    try { body = readImportText(input, warnings); } catch (error) { refuse('TextBundle could not be read: ' + String(error?.message || error)); continue; }
    const {info, row: manifest, kept} = readManifest(group, warnings);
    const flavour = String(input.flavour ?? options.flavour ?? '').trim().toLowerCase();
    const tags = info?.creatorIdentifier === 'net.shinyfrog.bear' || flavour === 'bear' ? tagsIn(body, linkMask(body)).map(tag => tag.name) : [];
    const text = importTags(body, tags, warnings, input.name);
    markdown.push({...input, text, bytes: encoder.encode(text), flavour: 'markdown'});
    sources.set(keyOf(group.rootId, input.name), {info, warnings, claimed: [...(manifest ? [manifest] : []), ...kept]});
    for (const row of kept) attachments.push({...row, sourceName: row.name, rootId: group.rootId});
    for (const asset of resources.get(keyOf(group.rootId, group.directory)) || []) {
      const extension = /\.([^./]+)$/.exec(asset.name)?.[1].toLowerCase(), codec = mime[extension];
      const resource = {...asset, sourceName: asset.name, rootId: group.rootId};
      if (codec) pictures.push({...resource, mime: codec});
      else attachments.push(resource);
    }
  }
  const result = await importMarkdown(markdown, {...options, flavour: 'markdown'});
  for (const note of result.notes) {
    const source = sources.get(keyOf(rootOf(note), note.sourceName));
    const warnings = [...source.warnings];
    if (source.info) applyManifest(source.info, note.entry, warnings, options);
    note.warnings = [...warnings, ...(note.warnings || [])];
    for (const row of source.claimed) consumed.push({name: row.name, rootId: rootOf(note), sourceName: note.sourceName});
  }
  return finishImportCharacters({...result, skipped: [...skipped, ...result.skipped], pictures: [...pictures, ...result.pictures], attachments, consumed});
}
