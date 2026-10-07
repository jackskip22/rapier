// SPDX-License-Identifier: AGPL-3.0-only
// dayoneapp.com/guides/import-export/importing-data-from-json-files/ supplies the JSON export.
// Photo identifiers address photos/<md5>.<type>; only parsed destination spans are relocated.
import {noteFileName, noteTitle, orderAfter} from './model.mjs';
import {scanLinks} from './links.mjs';
import {importTags, importDate, appendImportMetadata, IMPORT_JSON_MAX_BYTES} from './import.mjs';
import {readImportText, finishImportCharacters} from './import-characters.mjs';

const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rootOf = row => String(row.rootId || '');
const keyOf = (root, path) => JSON.stringify([root, path]);
const mime = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', jxl: 'image/jxl', svg: 'image/svg+xml', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif'};
const photoId = dest => /^dayone-moment:\/\/([^/?#\s]+)$/i.exec(dest)?.[1].toLowerCase();

export async function importDayOne(entries, options = {}) {
  const named = (Array.isArray(entries) ? entries : []).filter(row => row && typeof row.name === 'string');
  const members = new Map(), notes = [], skipped = [], sections = [], pictures = [], pictureKeys = new Set();
  const pool = (Array.isArray(options.existing) ? options.existing : []).filter(name => typeof name === 'string');
  for (const row of named) {
    const key = keyOf(rootOf(row), row.name);
    if (!members.has(key)) members.set(key, []);
    members.get(key).push(row);
  }
  for (const input of named) {
    if (!/\.json$/i.test(input.name)) continue;
    const skip = why => skipped.push({name: input.name, rootId: rootOf(input), why});
    if (input.unreadable || input.oversize) { skip(input.unreadable || 'Day One JSON is not readable.'); continue; }
    const size = input.bytes?.byteLength ?? encoder.encode(typeof input.text === 'string' ? input.text : '').length;
    if (size > IMPORT_JSON_MAX_BYTES) { skip('Day One JSON exceeds the 25 MiB source bound.'); continue; }
    const sourceWarnings = [...(input.characterWarnings || [])];
    let journal;
    try { journal = JSON.parse(readImportText(input, sourceWarnings).replace(/^\uFEFF/, '')); }
    catch (error) { skip('Day One JSON could not be read: ' + String(error?.message || error)); continue; }
    if (!object(journal) || !Array.isArray(journal.entries)) { skip('Not a Day One entries export.'); continue; }
    const {entries: sourceEntries, ...exportFields} = journal;
    const directory = input.name.slice(0, input.name.lastIndexOf('/') + 1), rootId = rootOf(input);
    for (let index = 0; index < sourceEntries.length; index++) {
      const raw = sourceEntries[index], sourceItem = typeof raw?.uuid === 'string' && raw.uuid ? raw.uuid : 'entries[' + index + ']';
      if (!object(raw)) {
        const title = 'Journal entry ' + (index + 1), file = noteFileName('# ' + title, pool); pool.push(file);
        notes.push({file, title, text: appendImportMetadata('', {export: exportFields, entry: raw}), sourceName: input.name, sourceItem, rootId,
          entry: {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''},
          warnings: [...sourceWarnings, {code: 'entry_not_object', name: sourceItem, message: 'This entry was not an object. Its complete JSON value was kept in the note.'}]});
        continue;
      }
      const warnings = [...sourceWarnings], entry = {order: '', pinned: raw.isPinned === true, skill: false, archived: false, trashed: false, colour: ''};
      const created = importDate(raw.creationDate, Date.parse(raw.creationDate), warnings, 'Day One creation date');
      const modified = importDate(raw.modifiedDate, Date.parse(raw.modifiedDate), warnings, 'Day One edit date');
      if (created !== undefined) entry.created = created;
      if (modified !== undefined) entry.modified = modified;
      let body = typeof raw.text === 'string' ? raw.text : '';
      const title = noteTitle(body) || (created !== undefined ? new Date(created).toISOString().slice(0, 10) : 'Journal entry');
      const photos = [], byId = new Map();
      for (const [ordinal, photo] of (Array.isArray(raw.photos) ? raw.photos : []).entries()) {
        if (!object(photo)) continue;
        const id = typeof photo.identifier === 'string' ? photo.identifier.toLowerCase() : '';
        const relative = typeof photo.md5 === 'string' && /^[0-9a-f]{32}$/i.test(photo.md5)
          && typeof photo.type === 'string' && /^[a-z0-9]+$/i.test(photo.type) ? 'photos/' + photo.md5 + '.' + photo.type : '';
        const name = directory + relative, candidates = relative ? (members.get(keyOf(rootId, name)) || []).filter(row => !row.unreadable && !row.oversize && row.bytes instanceof Uint8Array) : [];
        const picture = candidates.length === 1 ? candidates[0] : null;
        const row = {id, relative, picture, ordinal, order: Number.isSafeInteger(photo.orderInEntry) && photo.orderInEntry >= 0 ? photo.orderInEntry : ordinal};
        photos.push(row);
        if (id) { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(row); }
        if (!picture) warnings.push({code: candidates.length > 1 ? 'attachment_ambiguous' : 'attachment_missing', name: relative || photo.identifier || 'photos[' + ordinal + ']', sourcePath: relative,
          message: candidates.length > 1 ? 'More than one photo has this source path. Its reference was kept without choosing a file.' : 'This declared photo was not in the export. Its reference and metadata were kept.'});
        else {
          const key = keyOf(rootId, name);
          if (!pictureKeys.has(key)) { pictureKeys.add(key); pictures.push({...picture, sourceName: name, rootId, mime: mime[photo.type.toLowerCase()] || 'application/octet-stream'}); }
        }
      }
      const referenced = new Set();
      for (const link of scanLinks(body).reverse()) {
        if (!link.image) continue;
        const id = photoId(link.dest);
        if (!id) continue;
        referenced.add(id);
        const choices = byId.get(id) || [], paths = new Set(choices.filter(row => row.picture).map(row => row.relative));
        if (choices.length && paths.size === 1 && choices.every(row => row.picture)) {
          body = body.slice(0, link.destStart) + paths.values().next().value + body.slice(link.destEnd);
        } else if (!choices.length) warnings.push({code: 'attachment_missing', name: link.dest, message: 'This photo reference has no matching metadata in the export. The reference was kept.'});
        else if (paths.size > 1) warnings.push({code: 'attachment_ambiguous', name: link.dest, message: 'More than one photo claims this identifier. The reference was kept without choosing a file.'});
      }
      // A photo-only entry, or a photo the exporter omitted from text, still owns its picture.
      for (const photo of photos.sort((a, b) => a.order - b.order || a.ordinal - b.ordinal)) {
        if (photo.id && referenced.has(photo.id)) continue;
        const destination = photo.picture ? photo.relative : photo.id ? 'dayone-moment://' + photo.id : '';
        if (destination) body += (body ? '\n\n' : '') + '![](' + destination + ')';
      }
      const tags = Array.isArray(raw.tags) ? raw.tags : [];
      const category = tags.find(tag => typeof tag === 'string' && tag.trim())?.trim();
      if (category) {
        entry.category = category;
        if (!sections.some(name => name.toLowerCase() === category.toLowerCase())) sections.push(category);
      }
      // Preserve source spelling and every unsupported field; none becomes private note state.
      const fields = Object.fromEntries(Object.entries(raw).filter(([key, value]) => key !== 'text' || typeof value !== 'string'));
      const text = appendImportMetadata(importTags(body, tags, warnings, sourceItem), {export: exportFields, entry: fields});
      const file = noteFileName('# ' + title, pool); pool.push(file);
      notes.push({file, title, text, entry, sourceName: input.name, sourceItem, rootId, warnings});
    }
  }
  let order = typeof options.lastOrder === 'string' ? options.lastOrder : '';
  for (const note of notes.slice().sort((a, b) => (b.entry.created ?? -Infinity) - (a.entry.created ?? -Infinity))) note.entry.order = order = orderAfter(order);
  return finishImportCharacters({notes, skipped, sections, pictures});
}
