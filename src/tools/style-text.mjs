// SPDX-License-Identifier: AGPL-3.0-only
// The text of an authored stylesheet as a page carries it: licence notices kept and every other comment dropped, the sheet's own WOFF2 files
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import parseCSS from './vendor/postcss-parse.cjs';
import {documentSpacingCss} from '../spec/document-settings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A comment ships only when it is a licence notice -- `/*!`, `@license` or `@preserve`, an SPDX line, a
// copyright statement ("Copyright (c)", "Copyright ©" or a year) or a licence grant ("Licensed
// under", "Permission is hereby granted") -- or a `# sourceURL`/`# sourceMappingURL` directive. A
// developer comment that merely mentions a licence does not ship (_page-notices.mjs under profile-seams).
export const keepsComment = value => /^(?:!|[#@]\s*source)|@license|@preserve|SPDX-License-Identifier|\bcopyright\s*(?:\(c\)|©|\d{4})|\blicen[sc]ed under\b|\bpermission is hereby granted\b/i.test(value);

export function packStyleWhitespace(source) {
  const tree = parseCSS(source, {from: 'rapier-build.css'});
  tree.walk(node => {
    node.raws.before = '';
    if ('after' in node.raws) node.raws.after = '';
    if ('between' in node.raws) node.raws.between = node.type === 'decl' ? ':' : '';
    if (node.type === 'rule' && !node.selector.includes('\\') && !node.selector.includes('/*')) node.selector = node.selectors.join(',');
    if (node.nodes) node.raws.semicolon = false;
  });
  tree.raws.after = '';
  return tree.toString();
}

export function inlineFonts(css, path) {
  for (const [url, file] of new Map([...css.matchAll(/url\('([\w./-]+\.woff2)'\)/g)].map(m => [m[0], m[1]])))
    css = css.replaceAll(url, "url('data:font/woff2;base64," + readFileSync(resolve(root, dirname(path), file)).toString('base64') + "')");
  return css;
}

export function stripStyleComments(source) {
  const parts = [];
  let cursor = 0, quote = '', url = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') { index++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (url) { if (char === '(') url++; else if (char === ')') url--; continue; }
    if (source.slice(index, index + 4).toLowerCase() === 'url(' && !/[\w-]/.test(source[index - 1] || '')) { url = 1; index += 3; continue; }
    if (char !== '/' || source[index + 1] !== '*') continue;
    const end = source.indexOf('*/', index + 2);
    if (end < 0) throw new Error('Unclosed stylesheet comment');
    if (!keepsComment(source.slice(index + 2, end)) && (!index || end + 2 === source.length || /[ \t\r\n\f]/.test(source[index - 1]) || /[ \t\r\n\f]/.test(source[end + 2]))) {
      parts.push(source.slice(cursor, index));
      cursor = end + 2;
    }
    index = end + 1;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

export function styleText(path) {
  const spacing = path === 'spec/markdown-style.css' ? documentSpacingCss(null, '.md-render', true) : '';
  return packStyleWhitespace(inlineFonts(stripStyleComments(readFileSync(resolve(root, path), 'utf8')), path) + spacing);
}
