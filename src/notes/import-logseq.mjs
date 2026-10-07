// SPDX-License-Identifier: AGPL-3.0-only
// File-graph properties become portable front matter; block source keeps its exact spans.
import {noteFileName, orderAfter} from './model.mjs';
import {parseFrontMatter, serializeFrontMatter, propertiesOf, tagsOf, aliasesOf} from './frontmatter.mjs';
import {frontMatterLine} from '../spec/frontmatter.mjs';
import {linkMask} from './links.mjs';
import {importDate, literalInline} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters} from './import-characters.mjs';

const encoder = new TextEncoder();
const taskMarks = {TODO: ' ', DOING: ' ', LATER: ' ', NOW: ' ', DONE: 'x'};

function *lines(text, start = 0) {
  while (start < text.length) { const line = frontMatterLine(text, start); yield line; start = line.next; }
}

function propertyRows(text) {
  const rows = [];
  for (const line of lines(text, text[0] === '\uFEFF' ? 1 : 0)) {
    const match = /^([^\s:]+)::[ \t]?(.*)$/.exec(line.text);
    if (!match || !/^[\p{L}.*+!_?$%&=<>-][\p{L}\p{N}.*+!_?$%&=<>-]*$/u.test(match[1]) || /^[-+.]\d/.test(match[1])) break;
    const name = match[1].toLowerCase().replace(/_/g, '-');
    rows.push({...line, key: name === 'alias' ? 'aliases' : name, value: match[2]});
  }
  return rows;
}

function pageName(value) {
  const text = value.trim(), match = /^#?\[\[([^\[\]]*)\]\]$/.exec(text);
  return match ? match[1] : text;
}

// Commas inside a page reference are part of that page's name. Adjacent references are
// separate values, while unlinked multiword names remain one value.
function pageValues(value) {
  const pieces = []; let start = 0, depth = 0, quoted = false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"' && value[i - 1] !== '\\') quoted = !quoted;
    if (quoted) continue;
    if (value.slice(i, i + 2) === '[[') { depth++; i++; }
    else if (value.slice(i, i + 2) === ']]' && depth) { depth--; i++; }
    else if (value[i] === ',' && !depth) { pieces.push(value.slice(start, i)); start = i + 1; }
  }
  pieces.push(value.slice(start));
  return pieces.flatMap(piece => {
    const text = piece.trim();
    if (!text) return [];
    if (/^"(?:[^"\\]|\\.)*"$/.test(text)) {
      try { return [JSON.parse(text)]; } catch (_) { return [text]; }
    }
    const refs = [...text.matchAll(/#?\[\[([^\[\]]*)\]\]|#([^\s,\[\]]+)/g)];
    if (refs.length && !text.replace(/#?\[\[([^\[\]]*)\]\]|#([^\s,\[\]]+)/g, '').trim())
      return refs.map(match => match[1] ?? match[2]);
    return [pageName(text)];
  });
}

function portableProperties(source, warnings) {
  const rows = propertyRows(source), grouped = new Map();
  for (const row of rows) { if (!grouped.has(row.key)) grouped.set(row.key, []); grouped.get(row.key).push(row); }
  const edits = new Map(), removed = new Set();
  for (const [key, group] of grouped) {
    if (group.length > 1) {
      warnings.push({code: 'logseq-property-duplicate', field: key,
        message: 'These Logseq properties have the same name. Every original property line remains in the note.'});
      continue;
    }
    const row = group[0];
    edits.set(key, key === 'tags' || key === 'aliases' ? pageValues(row.value) : row.value);
    removed.add(row);
  }
  let at = 0, body = '';
  for (const row of rows) if (removed.has(row)) { body += source.slice(at, row.start); at = row.next; }
  body += source.slice(at);
  // The front-matter owner alone prints values and quotes source strings that look typed.
  try { return serializeFrontMatter(parseFrontMatter(body), edits); }
  catch (error) {
    warnings.push({code: 'logseq-properties-unwritten', message: 'The metadata block could not be edited safely; all original Logseq property lines remain in the note: ' + error.message});
    return source;
  }
}

function convertTasks(text) {
  const mask = linkMask(text), patches = [];
  for (const line of lines(text)) {
    const match = /^([ \t]*[-*][ \t]+)(TODO|DOING|LATER|NOW|DONE)(?=[ \t]|$)/.exec(line.text);
    if (!match) continue;
    const start = line.start + match[1].length, end = start + match[2].length;
    let clear = true;
    for (let i = line.start; i < end; i++) if (mask[i]) { clear = false; break; }
    if (clear) patches.push({start, end, text: '[' + taskMarks[match[2]] + ']'});
  }
  // The patches are in source order and never overlap: one pass copies each span once, however many tasks a page holds.
  let at = 0, out = '';
  for (const patch of patches) { out += text.slice(at, patch.start) + patch.text; at = patch.end; }
  return out + text.slice(at);
}

function fileTitle(name, warnings) {
  const stem = name.split('/').at(-1).replace(/\.(?:md|markdown)$/i, '');
  let title = stem.replace(/___/g, '/');
  try { title = decodeURIComponent(title); } catch (_) { /* Invalid escapes remain original words. */ }
  if (/[\r\n\u0000]/.test(title)) {
    warnings.push({code: 'logseq-filename-title', message: 'The encoded filename contains a line break or NUL, so its original spelling is kept as the title.'});
    title = stem;
  }
  return title || 'note';
}

function journalDate(name, warnings) {
  if (!/(?:^|\/)journals\//i.test(name)) return null;
  const stem = name.split('/').at(-1).replace(/\.(?:md|markdown)$/i, '');
  const match = /^(\d{4})([_-])(\d{2})\2(\d{2})$/.exec(stem);
  let parsed = NaN, title = '';
  if (match) {
    const year = Number(match[1]), month = Number(match[3]), day = Number(match[4]);
    const time = Date.UTC(year, month - 1, day), date = new Date(time);
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      parsed = time; title = match[1] + '-' + match[3] + '-' + match[4];
    }
  }
  const time = importDate(stem, parsed, warnings, 'Logseq journal date');
  return {time, title: time === undefined ? '' : title};
}

function metadataDate(properties, keys, warnings) {
  for (const key of keys) {
    if (!properties.has(key)) continue;
    const value = properties.get(key), parsed = typeof value === 'number' ? value
      : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : typeof value === 'string' ? Date.parse(value) : NaN;
    const time = importDate(value, parsed, warnings, 'Logseq ' + key);
    if (time !== undefined) return time;
  }
}

export async function importLogseq(entries, options = {}) {
  const notes = [], skipped = [], sections = [], pool = [...(options.existing || [])], spelling = new Map();
  for (const raw of options.sections || []) {
    const name = typeof raw === 'string' ? raw : raw?.name;
    if (name) spelling.set(name.toLowerCase(), name);
  }
  for (const source of Array.isArray(entries) ? entries : []) {
    if (typeof source?.name !== 'string' || !/\.(?:md|markdown)$/i.test(source.name)) continue;
    const name = source.name.replace(/\\/g, '/'), warnings = [...(source.characterWarnings || [])];
    if (source.unreadable || source.oversize) { skipped.push({name, rootId: source.rootId ?? '', why: source.unreadable || 'source exceeds the import byte bound'}); continue; }
    try {
      const raw = readImportText(source, warnings), mapped = portableProperties(raw, warnings);
      const properties = propertiesOf(mapped), journal = journalDate(name, warnings);
      const propertyTitle = typeof properties.get('title') === 'string' ? pageName(properties.get('title')) : '';
      const title = propertyTitle || journal?.title || fileTitle(name, warnings);
      if (propertyTitle) reportCharacterChange(properties.get('title'), propertyTitle, warnings, 'Logseq title');
      const parsed = parseFrontMatter(mapped), prefix = mapped.slice(0, mapped.length - parsed.body.length);
      const bom = !parsed.present && parsed.body[0] === '\uFEFF' ? '\uFEFF' : '';
      const body = bom ? parsed.body.slice(1) : parsed.body;
      const separator = /^[\r\n]/.test(body) ? parsed.eol : parsed.eol + parsed.eol;
      const text = prefix + bom + '# ' + literalInline(title) + separator + convertTasks(body);
      const file = noteFileName('# ' + title, pool); pool.push(file);
      const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
      const category = tagsOf(text).find(tag => tag.length <= 48);
      if (category) {
        const key = category.toLowerCase();
        if (!spelling.has(key)) { spelling.set(key, category); sections.push(category); }
        entry.category = spelling.get(key);
      }
      const created = journal?.time ?? metadataDate(properties, ['created-at', 'created', 'date'], warnings);
      const modified = metadataDate(properties, ['updated-at', 'updated', 'modified'], warnings) ?? created;
      if (created !== undefined) entry.created = created;
      if (modified !== undefined) entry.modified = modified;
      notes.push({file, title, text, bytes: encoder.encode(text), entry, sourceName: name,
        sourceWikiAliases: [...new Set([title, ...aliasesOf(text)])], rootId: source.rootId ?? options.rootId ?? '', warnings});
    } catch (error) { skipped.push({name, rootId: source.rootId ?? '', why: 'could not be read: ' + error.message}); }
  }
  let order = typeof options.lastOrder === 'string' ? options.lastOrder : '';
  for (const note of notes.slice().sort((a, b) => (b.entry.created ?? -Infinity) - (a.entry.created ?? -Infinity))) {
    order = orderAfter(order); note.entry.order = order;
  }
  return finishImportCharacters({notes, skipped, sections, pictures: []});
}
