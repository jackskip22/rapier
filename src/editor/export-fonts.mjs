// SPDX-License-Identifier: AGPL-3.0-only
// Application font capabilities stay outside the portable MIT renderer.
import {exportFontCss, requireDocumentFonts, fontRequests, waitForFonts, waitForFontRequests} from '../kit/export-fonts.mjs';
import {materializeDocumentFonts, materializeComparisonFonts} from './document-fonts.mjs';
import {importFonts, printFont, fontSession, fontFaceFamily, fontDataURL} from '../draw/font.mjs';
import {fontCids, maskFontGlyphs} from '../draw/font-subset.mjs';

export {exportFontCss, requireDocumentFonts, fontRequests, waitForFonts, waitForFontRequests, materializeDocumentFonts, materializeComparisonFonts};
export {maskFontGlyphs as maskPdfFont};

export async function embedDiagramFonts(svg, factoryFonts) {
  const session = fontSession(), runs = new Map();
  for (const node of svg.querySelectorAll('text,tspan')) {
    const family = node.style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const weight = Number(node.style.fontWeight) || 400;
    const face = factoryFonts.filter(font => font.family === family)
      .sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
    if (!face) continue;
    if (!runs.has(face)) runs.set(face, []);
    runs.get(face).push(node);
  }
  for (const [face, nodes] of runs) {
    const font = await session.subset(await session.read({url: 'data:font/ttf;base64,' + face.data}), nodes.map(node => node.textContent).join('\n'));
    const family = fontFaceFamily(font), style = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.setAttribute('data-rapier-font', font.id);
    style.textContent = '@font-face{font-family:' + family + ';src:url(' + fontDataURL(font) + ')}';
    svg.insertBefore(style, svg.firstChild);
    for (const node of nodes) node.style.fontFamily = family;
  }
}

export async function validateFont(bytes, {family = 'document-font', format = 'font'} = {}) {
  const result = await importFonts([{name: family + '.' + format, bytes}]);
  return result.refused.length === 0 && result.fonts.length === 1;
}

export async function preparePdfFont(bytes, text, style = {}, face = {}, {subset} = {}) {
  let font = await printFont(bytes, text, face);
  if (font.axes.length) {
    const coordinates = Object.fromEntries(font.axes.map(axis => [axis.tag, Math.max(axis.min, Math.min(axis.max,
      axis.tag === 'wght' ? Number(style.fontWeight) || axis.default :
      axis.tag === 'opsz' && style.fontOpticalSizing !== 'none' ? parseFloat(style.fontSize) * .75 || axis.default : axis.default))]));
    if (Object.entries(coordinates).some(([tag, value]) => value !== font.axes.find(axis => axis.tag === tag).default)) {
      const bytes = await subset?.(font.bytes, text, {format: 'sfnt', coordinates});
      if (!bytes) return null;
      font = await printFont(bytes, text);
      if (!font || font.axes.length) return null;
    }
  }
  return {bytes: font.bytes, cids: fontCids(font.bytes), postscriptName: font.postscriptName, subset: font.subset};
}

export async function systemPdfFonts() {
  if (!globalThis.queryLocalFonts || !globalThis.navigator?.permissions) return [];
  try {
    if ((await navigator.permissions.query({name: 'local-fonts'})).state !== 'granted') return [];
    return (await queryLocalFonts()).map(face => ({family: face.family, style: face.style, fullName: face.fullName, postscriptName: face.postscriptName,
      system: true, read: async () => new Uint8Array(await (await face.blob()).arrayBuffer())}));
  } catch (_) {return [];}
}
