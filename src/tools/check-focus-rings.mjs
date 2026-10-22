// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  ...readdirSync(join(root, 'editor/styles')).filter(name => name.endsWith('.css')).map(name => join(root, 'editor/styles', name)),
  join(root, 'spec/markdown-style.css'),
  ...readdirSync(join(root, 'notes')).filter(name => name.endsWith('.css')).map(name => join(root, 'notes', name)),
];
const NONE = /^(?:none|0|0px|unset|initial)(?:\s*!important)?$/i;

export function focusRings(css, file = '') {
  const found = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rule.exec(text))) {
    const selector = match[1].trim();
    if (!/:focus(?:-visible|-within)?\b/.test(selector)) continue;
    for (const declaration of match[2].split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase(), value = declaration.slice(colon + 1).trim();
      const ring = (/^outline(?:-width|-style)?$/.test(property) || property === 'box-shadow') && !NONE.test(value) ||
        /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-(?:color|width|style))?$/.test(property) && !NONE.test(value);
      if (ring) found.push(`${file}: ${selector.replace(/\s+/g, ' ').slice(0, 120)} { ${property}: ${value} }`);
    }
  }
  return found;
}

export function checkFocusRings() {
  const found = SOURCES.flatMap(path => focusRings(readFileSync(path, 'utf8'), relative(root, path)));
  if (found.length) throw new Error('A focused control draws a ring or box (focus shows inside the control):\n' + found.join('\n'));
  return SOURCES.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log('focus rings: none in ' + checkFocusRings() + ' style files'); }
  catch (error) { console.error(error.message); process.exit(1); }
}
