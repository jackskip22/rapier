// SPDX-License-Identifier: AGPL-3.0-only
// ZenUML draws ZenUML: its own renderer lays out every element (message numbers, participant icons, fragment headers with
// their icons and conditions, activation bars, the title frame, groups, dividers and comments), painted with Rapier's theme
// tokens and type by the recipe in zenuml-svg.mjs. It runs inside the closed diagram realm.
import {renderToSvg, validate} from 'rapier:zenuml-renderer';

export const fontCss = '';
export const fontFamily = RAPIER_ZENUML_FONT_FAMILY;

export async function render(text) {
  const source = String(text).replace(/^\s*zenuml\b/, '');
  const result = validate(source);
  if (!result.pass) {
    const first = result.errorDetails[0];
    throw new Error(first ? 'ZenUML line ' + first.line + ', column ' + (first.column + 1) + ': ' + first.msg : 'Invalid ZenUML syntax');
  }
  // ZenUML measures words on a canvas in the diagram's font; the realm holds the page's loaded faces.
  await globalThis.document?.fonts?.load?.('14px ' + fontFamily).catch(() => {});
  const out = renderToSvg(source, {});
  return {svg: '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-roledescription="zenuml" viewBox="' + out.viewBox +
    '" width="' + out.width + '" height="' + out.height + '" style="font-family:' + fontFamily + '">' + out.innerSvg + '</svg>'};
}
