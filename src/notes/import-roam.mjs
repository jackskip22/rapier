// SPDX-License-Identifier: AGPL-3.0-only
// Roam's JSON page/block schema: https://roamresearch.com/#/app/help/page/Nxz8u0vXU
// Ordered blocks become ordinary Markdown lists; source-only fields remain readable note data.
import {noteFileName, orderAfter} from './model.mjs';
import {readJsonInputs, literalInline, importDate, importMetadata, appendImportMetadata} from './import.mjs';
import {finishImportCharacters, literalImportSource} from './import-characters.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const unrepresented = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.has(key)));

function closeOpenFence(content) {
  let fence = '';
  for (const line of content.split(/\r\n|\r|\n/)) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    if (fence) {
      if (match[1][0] === fence[0] && match[1].length >= fence.length && /^[ \t]*$/.test(match[2])) fence = '';
    } else if (match[1][0] !== '`' || !match[2].includes('`')) fence = match[1];
  }
  return fence ? content + (/\r\n$|\r$|\n$/.test(content) ? '' : '\n') + fence : content;
}

function pageNote(page, input, ordinal, pool) {
  const sourceItem = 'pages[' + ordinal + ']', warnings = [...(input.characterWarnings || [])];
  if (!object(page) || typeof page.title !== 'string') {
    const kept = literalImportSource({...input, bytes: undefined, text: JSON.stringify(page, null, 2)}, pool,
      'This Roam page has no readable title.', warnings, 'json');
    return {...kept, sourceItem};
  }
  const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
  const represented = new Set(['title']);
  for (const [key, target] of [['create-time', 'created'], ['edit-time', 'modified']]) {
    const value = importDate(page[key], page[key], warnings, 'Roam ' + key);
    if (value !== undefined) { entry[target] = value; represented.add(key); }
  }
  const title = page.title.replace(/\r\n|\r|\n/g, ' ');
  // A title cannot occupy several ATX lines; its full source value stays in the note as well.
  if (title !== page.title) represented.delete('title');
  let text = '# ' + literalInline(title) + '\n';
  const metadata = {}, keptBlocks = [], lines = [], stack = [];
  if (Array.isArray(page.children)) {
    represented.add('children');
    for (let i = page.children.length - 1; i >= 0; i--) stack.push({block: page.children[i], path: [i]});
  }
  // An explicit stack keeps a deeply nested export out of the JavaScript call stack.
  while (stack.length) {
    const {block, path} = stack.pop(), indent = '  '.repeat(path.length - 1), fields = new Set();
    let content = '', heading = '';
    if (object(block)) {
      if (typeof block.string === 'string') { content = block.string; fields.add('string'); }
      else warnings.push({code: 'roam-block-retained', message: 'A block without readable text was kept in the note metadata.', path});
      if (Number.isInteger(block.heading) && block.heading >= 0 && block.heading <= 3) {
        heading = block.heading ? '#'.repeat(block.heading) + ' ' : ''; fields.add('heading');
      }
      if (Array.isArray(block.children)) {
        fields.add('children');
        for (let i = block.children.length - 1; i >= 0; i--) stack.push({block: block.children[i], path: [...path, i]});
      }
    } else warnings.push({code: 'roam-block-retained', message: 'An unreadable block was kept in the note metadata.', path});
    let projected = heading + content;
    if (object(block) && Array.isArray(block.children) && block.children.length) {
      const closed = closeOpenFence(projected);
      if (closed !== projected) {
        projected = closed; fields.delete('string');
        warnings.push({code: 'roam-fence-retained', path,
          message: 'An unclosed block code fence was completed before its children. Its full original text remains in the note metadata.'});
      }
    }
    // Add list indentation; an unclosed code fence cannot consume structured descendants.
    // Existing line endings, wiki links and block references otherwise remain source text.
    lines.push(indent + '- ' + projected.replace(/\r\n|\r|\n/g, ending => ending + indent + '  ') + '\n');
    const kept = object(block) ? unrepresented(block, fields) : {value: block};
    if (Object.keys(kept).length) {
      keptBlocks.push({path, fields: kept});
      importMetadata(kept, [], warnings, 'Roam block fields', {at: path.map(i => 'children[' + i + ']').join('.')});
    }
  }
  if (lines.length) text += '\n' + lines.join('');
  const keptPage = unrepresented(page, represented);
  if (Object.keys(keptPage).length) { metadata.page = keptPage; importMetadata(keptPage, [], warnings, 'Roam page fields'); }
  if (keptBlocks.length) metadata.blocks = keptBlocks;
  text = appendImportMetadata(text, metadata);
  const file = noteFileName('# ' + literalInline(title), pool); pool.push(file);
  return {file, text, entry, sourceName: input.name, sourceItem, sourceWikiAliases: [page.title], rootId: input.rootId ?? '', warnings};
}

export async function importRoam(entries, options = {}) {
  const skipped = [], notes = [], pool = Array.isArray(options.existing) ? options.existing.filter(name => typeof name === 'string') : [];
  const named = await readJsonInputs(Array.isArray(entries) ? entries : [], skipped);
  for (const input of named) {
    if (!/\.json$/i.test(input.name) || typeof input.text !== 'string') continue;
    let pages;
    try { pages = JSON.parse(input.text.replace(/^\uFEFF/, '')); }
    catch {
      notes.push(literalImportSource(input, pool, 'Roam JSON could not be parsed.', input.characterWarnings, 'json'));
      continue;
    }
    if (!Array.isArray(pages)) { skipped.push({name: input.name, why: 'not a Roam page array'}); continue; }
    const start = notes.length, used = pool.length;
    try {
      for (let i = 0; i < pages.length; i++) notes.push(pageNote(pages[i], input, i, pool));
    } catch {
      // If any value cannot be projected, keep the entire source rather than a partial graph.
      notes.length = start; pool.length = used;
      notes.push(literalImportSource(input, pool, 'This Roam graph could not be projected completely.', input.characterWarnings, 'json'));
    }
  }
  let order = typeof options.lastOrder === 'string' ? options.lastOrder : '';
  for (const note of notes.slice().sort((a, b) => (b.entry.created ?? -Infinity) - (a.entry.created ?? -Infinity))) {
    order = orderAfter(order); note.entry.order = order;
  }
  return finishImportCharacters({notes, skipped, sections: [], pictures: []});
}
