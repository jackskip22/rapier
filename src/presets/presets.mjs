// SPDX-License-Identifier: AGPL-3.0-only
import {admitPreset, PRESET_BYTES, PRESET_LIMIT, PRESET_SETTINGS, presetName} from './record.mjs';
import {readDocumentSettings, updateDocumentSettings} from '../spec/document-settings.mjs';
import {readFontAssets, writeFontAssets} from '../spec/document-fonts.mjs';
import {splitOpeningFrontmatter} from '../spec/frontmatter.mjs';
import {materializeDocumentFonts} from '../editor/document-fonts.mjs';
export {admitPreset, PRESET_BYTES, PRESET_LIMIT, presetName};
export const newId = () => 'p' + crypto.randomUUID().replaceAll('-', '').slice(0, 24);
export async function preparePreset(input, parser) {
  const record = admitPreset(input);
  if (record.content) {
    portable(record.content.text, parser);
    await materializeDocumentFonts(record.content.text, {parser});
  }
  if (record.presentation) {
    await materializeDocumentFonts(applyPresentation('# Aa0\n\nAa0\n\n`Aa0`\n', record.presentation, parser), {parser});
  }
  return record;
}

export function presentation(source, parser) {
  const settings = readDocumentSettings(source), patch = {};
  for (const key of PRESET_SETTINGS) patch[key] = settings[key]?.family ?? settings[key]?.step ?? null;
  const fonts = readFontAssets(source, parser);
  if (fonts.refused.length) throw new Error('An embedded font cannot be read.');
  return {settings: patch, fonts: writeFontAssets('', fonts.assets, parser)};
}
export function applyPresentation(source, style, parser) {
  const fonts = readFontAssets(style.fonts, parser);
  let rest = style.fonts;
  for (const row of [...fonts.blocks].sort((a, b) => b.start - a.start)) rest = rest.slice(0, row.start) + rest.slice(row.next);
  if (rest.trim() || fonts.refused.length) throw new Error('The style contains something other than embedded fonts.');
  const present = readFontAssets(source, parser), wanted = new Map(present.assets.map(row => [row.key, row]));
  for (const font of fonts.assets) {
    if (wanted.has(font.key) && wanted.get(font.key).url !== font.url) throw new Error('This document already uses a different file for that font.');
    wanted.set(font.key, font);
  }
  return writeFontAssets(updateDocumentSettings(source, style.settings), [...wanted.values()], parser);
}
export function passage(source) { return splitOpeningFrontmatter(source).body; }

export function portable(source, parser) {
  if (/rapier-(?:ledger|authorship|carried)|\[\[/.test(source)) throw new Error('Remove private note links or carried history before saving this starter.');
  const env = {}, tokens = parser.parse(source, env);
  const visit = rows => { for (const row of rows || []) {
    if (row.type === 'text' && /!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/.test(row.content))
      throw new Error('A picture reference cannot be resolved. Embed it before saving.');
    if (['html_inline', 'html_block'].includes(row.type) && !/^\s*<!--(?:md-layout:v1 [^<>]*| rapier-block:[A-Za-z0-9_-]+ rapier-(?:draw|water|paint|svg) )-->\s*$/.test(row.content))
      throw new Error('Use Markdown and embedded SVG objects instead of raw HTML in a starter.');
    if (row.type === 'image') {
      const url = row.attrGet('src');
      if (!/^data:image\/(?:svg\+xml|png|jpeg|webp|gif|jxl);base64,[a-z\d+/=\s]+$/i.test(url || ''))
        throw new Error('Embed every picture before saving this starter.');
    }
    if (row.type === 'link_open' && !/^(?:https?:|mailto:|tel:|#)/i.test(row.attrGet('href') || ''))
      throw new Error('A local link would not travel with this starter.');
    if (row.children) visit(row.children);
  }};
  visit(tokens);
  if (readFontAssets(source, parser).refused.length) throw new Error('An embedded font cannot be read.');
  return source;
}

export function insertPassage(before, text, start, end, parser) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > before.length) throw new Error('Place the caret again.');
  text = passage(text); portable(text, parser);
  const outside = before.slice(0, start) + before.slice(end), left = {}, right = {};
  parser.parse(outside, left); parser.parse(text, right);
  const definitions = new Set([...Object.keys(right.references || {}), ...[...text.matchAll(/^\s{0,3}(?:\*)?\[([^\]\r\n]+)\]:/gm)].map(row => parser.utils.normalizeReference(row[1]))]);
  const bracketed = new Set([...outside.matchAll(/\[([^\[\]\r\n]+)\]/g)].map(row => parser.utils.normalizeReference(row[1])));
  for (const key of definitions) {
    if (Object.hasOwn(left.references || {}, key) || bracketed.has(key))
      throw new Error('A reference in this passage already belongs to the document. Rename it before inserting.');
  }
  const ids = value => [...value.matchAll(/(?:^|\n)```(?:rapier-[a-z]+)[^\n]*\bid=([\w-]+)|<!-- rapier-block:([A-Za-z0-9_-]+) rapier-(?:draw|water|paint|svg) -->/g)].map(match => match[1] || match[2]);
  const existing = new Set(ids(outside));
  if (ids(text).some(id => existing.has(id))) throw new Error('A drawing in this passage already belongs to the document. Rename its id before inserting.');
  const block = /[\r\n]/.test(text), eol = /\r\n|\r|\n/.exec(before)?.[0] || '\n';
  const prefix = block && start && !/[\r\n]{2}$/.test(before.slice(0, start)) ? eol + eol : '';
  const suffix = block && end < before.length && !/^[\r\n]{2}/.test(before.slice(end)) ? eol + eol : '';
  return {pos: start, removed: before.slice(start, end), inserted: prefix + text + suffix};
}
