// SPDX-License-Identifier: AGPL-3.0-only
// ZenUML owns parsing, measurement and SVG geometry inside the closed diagram realm.
import {renderToSvg, ensureDiagramFontsLoaded, validate} from './zenuml-core.mjs';

export const fontCss = RAPIER_ZENUML_FONT_CSS;
export const fontFamily = 'IBM Plex Sans';

export async function render(text) {
  const source = String(text).replace(/^\s*zenuml\b/, '');
  const result = validate(source);
  if (!result.pass) {
    const first = result.errorDetails[0];
    throw new Error(first ? 'ZenUML line ' + first.line + ', column ' + (first.column + 1) + ': ' + first.msg : 'Invalid ZenUML syntax');
  }
  await ensureDiagramFontsLoaded();
  const out = renderToSvg(source, {theme: 'theme-default'});
  return {svg: '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-roledescription="zenuml" viewBox="' + out.viewBox +
    '" width="' + out.width + '" height="' + out.height + '" style="font-family:IBM Plex Sans,sans-serif">' + out.innerSvg + '</svg>'};
}
