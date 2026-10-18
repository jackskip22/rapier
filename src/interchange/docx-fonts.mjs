// SPDX-License-Identifier: AGPL-3.0-only
import {importFonts, fontBytes, fontAsset, fontSession} from '../draw/font.mjs';
import {readFontAssets, documentFontUsage} from '../spec/document-fonts.mjs';
import {normalizeFontFamily} from '../spec/md-marks.mjs';

export const DOCX_FONT_TYPE = 'application/vnd.openxmlformats-officedocument.obfuscatedFont';
const refuse = (name, reason) => { throw Object.assign(new Error('Font ' + name + ': ' + reason), {code: 'docx_font_invalid'}); };

export function obfuscateDocxFont(bytes, key) {
  const bareKey = typeof key === 'string' && key.startsWith('{') && key.endsWith('}') ? key.slice(1, -1) : key;
  if (!(bytes instanceof Uint8Array) || bytes.length < 32 ||
      typeof bareKey !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(bareKey))
    return refuse('data', 'The embedded font or its obfuscation key is invalid.');
  const digits = bareKey.replace(/-/g, '');
  const mask = Array.from({length: 16}, (_, index) => parseInt(digits.slice((15 - index) * 2, (16 - index) * 2), 16));
  const result = bytes.slice();
  for (let at = 0; at < 32; at++) result[at] ^= mask[at % 16];
  return result;
}

async function admitted(name, bytes) {
  const result = await importFonts([{name, bytes}]);
  if (result.refused.length || result.fonts.length !== 1)
    return refuse(name, result.refused[0]?.reason || 'A Word font part must hold exactly one font.');
  return result.fonts[0];
}

const faceWeightDistance = (face, desired) => {
  const range = face.weightRange || [face.weight, face.weight], low = Number(range[0]) || 400, high = Number(range[1]) || low;
  if (desired >= low && desired <= high) return 0;
  const closest = desired < low ? low : high;
  if (desired === 400) return closest <= 500 && closest > 400 ? closest - 400 : closest < 400 ? 1000 + 400 - closest : 2000 + closest - 400;
  return closest >= 700 ? closest - 700 : 1000 + 700 - closest;
};

const faceStretchDistance = face => {
  const axis = face.axes?.find(axis => axis.tag === 'wdth');
  const low = axis?.min ?? face.stretch ?? 100, high = axis?.max ?? low;
  if (low <= 100 && high >= 100) return 0;
  return high < 100 ? 100 - high : 1000 + low - 100;
};

export async function writeDocxFonts(canonical, {check = () => {}} = {}) {
  if (typeof canonical !== 'string') return [];
  const usage = new Set([...documentFontUsage(canonical).keys()].map(name => name.toLowerCase()));
  const groups = new Map(), session = fontSession();
  for (const asset of readFontAssets(canonical).assets) {
    check();
    if (!usage.has(asset.family.toLowerCase())) continue;
    let font;
    try { font = await session.read(asset); }
    catch (error) { return refuse(asset.family, error.message); }
    check();
    const record = {font, family: asset.family, style: asset.style || font.style,
      weight: asset.weight ?? font.weight, weightRange: asset.weightRange || font.weightRange,
      stretch: asset.stretch ?? font.stretch, axes: font.axes};
    if (!groups.has(record.family)) groups.set(record.family, []);
    groups.get(record.family).push(record);
  }
  const resources = new Map(), result = [];
  for (const [family, faces] of groups) {
    const embeddings = [];
    for (const [slot, italic, weight] of [['Regular', false, 400], ['Bold', false, 700], ['Italic', true, 400], ['BoldItalic', true, 700]]) {
      const candidates = faces.filter(face => (face.style !== 'normal') === italic);
      if (!candidates.length) continue;
      const selected = [...candidates].sort((a, b) => faceStretchDistance(a) - faceStretchDistance(b) ||
        faceWeightDistance(a, weight) - faceWeightDistance(b, weight))[0];
      const actualWeight = selected.weightRange || [selected.weight, selected.weight];
      if (weight === 700 && Number(actualWeight[1]) < 600) continue;
      const font = selected.font;
      let resource = resources.get(font);
      if (!resource) {
        const bytes = fontBytes(font), key = '{' + crypto.randomUUID().toUpperCase() + '}';
        resource = {id: 'rIdFont' + (resources.size + 1), name: 'font' + (resources.size + 1) + '.odttf', key,
          bytes: obfuscateDocxFont(bytes, key), subsetted: font.subset?.subset === true};
        resources.set(font, resource);
      }
      embeddings.push({slot, resource});
    }
    result.push({family, embeddings});
  }
  return result;
}

export async function readDocxFontPart({name, family, bytes, key, type}, {asset = true, checkCurrent = () => {}} = {}) {
  checkCurrent();
  const normalized = normalizeFontFamily(family);
  if (!normalized) return refuse(name, 'The font family is invalid.');
  if (type === DOCX_FONT_TYPE) bytes = obfuscateDocxFont(bytes, key);
  else if (!['application/x-font-ttf', 'application/x-font-truetype', 'application/vnd.ms-opentype', 'application/font-sfnt', 'font/ttf', 'font/otf'].includes(type))
    return refuse(name, 'The embedded font format is unsupported.');
  const font = await admitted(name, bytes);
  checkCurrent();
  if (!asset) return null;
  const embedded = await fontAsset(font);
  checkCurrent();
  return {family: normalized, style: font.style, weight: font.weight, weightRange: font.weightRange,
    stretch: font.stretch, axes: font.axes, url: embedded.url};
}
