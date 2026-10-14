// SPDX-License-Identifier: AGPL-3.0-only
// ZenUML owns parsing, text measurement and SVG geometry. This adapter only admits a
// complete parse, registers that renderer with Mermaid, and carries its measured font.
import {renderToSvg, ensureDiagramFontsLoaded} from '@zenuml/core';
import {validate} from '@zenuml/core/parser';

export const fontCss = RAPIER_ZENUML_FONT_CSS;
export const fontFamily = 'IBM Plex Sans';
// DOMPurify invokes this public predicate in the renderer realm. SVG declarations
// stay inside its network-closed measurement document until final SVG sanitation;
// HTML label styles remain excluded. This grants no claim of built-in provenance.
export function allowSvgStyleAttribute(attributeName, tagName) {
  return attributeName === 'style' && /^(?:g|path|rect|circle|ellipse|line|polyline|polygon)$/.test(tagName);
}
const sourceCode = text => String(text).replace(/^\s*zenuml\b/, '');

function parse(text) {
  const result = validate(sourceCode(text));
  if (!result.pass) {
    const first = result.errorDetails[0];
    throw new Error(first ? 'ZenUML line ' + first.line + ', column ' + (first.column + 1) + ': ' + first.msg : 'Invalid ZenUML syntax');
  }
  return true;
}

export async function register(mermaid) {
  await ensureDiagramFontsLoaded();
  let getConfig;
  await mermaid.registerExternalDiagrams([{
    id: 'zenuml',
    detector: text => /^\s*zenuml\b/.test(text),
    loader: async () => ({id: 'zenuml', diagram: {
      db: {clear() {}},
      parser: {parse},
      styles: () => '',
      injectUtils(log, setLogLevel, config) { getConfig = config; },
      renderer: {
        async draw(text, id) {
          const result = renderToSvg(sourceCode(text), {theme: 'theme-default'});
          const svg = document.getElementById(id);
          if (!svg) throw new Error('The ZenUML render container is missing');
          svg.setAttribute('viewBox', result.viewBox);
          if (getConfig().sequence?.useMaxWidth !== false) {
            svg.setAttribute('width', '100%');
            svg.style.maxWidth = result.width + 'px';
            svg.removeAttribute('height');
          } else {
            svg.setAttribute('width', String(result.width));
            svg.setAttribute('height', String(result.height));
          }
          svg.innerHTML = result.innerSvg;
        },
      },
    }}),
  }]);
}
