// SPDX-License-Identifier: AGPL-3.0-only
import {admitFonts, fontSession, fontAsset, fontMetadata, fontFaceFamily} from '../draw/font.mjs';
import {readFontAssets, writeFontAssets, documentFontUsage, fontAssetKey} from '../spec/document-fonts.mjs';
import {readDocumentSettings, writeDocumentFontSetting} from '../spec/document-settings.mjs';
import {readBase} from '../kit/ledger/carried.mjs';

function fail(message, code = 'export_font_invalid') { throw Object.assign(new Error(message), {code}); }

export async function materializeDocumentFonts(source, options = {}) {
  const snapshot = await resolveDocumentFonts(source, options);
  return snapshot.assets ? writeFontAssets(snapshot.source, snapshot.assets, options.parser) : snapshot.source;
}

export async function materializeComparisonFonts(base, {parser, catalog = []} = {}) {
  base = readBase(base);
  const {assets} = await resolveDocumentFonts(base.text, {parser, catalog, resources: base.fonts, preserve: true});
  const carried = new Set(readFontAssets(base.text, parser).assets.map(fontAssetKey));
  const fonts = writeFontAssets('', (assets || []).filter(asset => !carried.has(fontAssetKey(asset))), parser);
  const {fonts: previous, ...record} = base;
  return fonts ? {...record, fonts} : record;
}

async function resolveDocumentFonts(source, {parser, catalog = [], defaultFont, resources, preserve = false} = {}) {
  if (typeof source !== 'string') throw new TypeError('Document source must be a string');
  const index = readFontAssets(source, parser), existing = index.assets, supplemental = [];
  if (index.refused.length) fail(index.refused.map(row => row.name + ': ' + row.reason).join('\n'));
  if (resources != null) {
    const extra = readFontAssets(resources, parser);
    if (extra.refused.length || writeFontAssets('', extra.assets, parser) !== resources ||
        extra.assets.some(asset => existing.some(row => fontAssetKey(row) === fontAssetKey(asset))))
      fail('The comparison font resources are invalid.');
    existing.push(...extra.assets); supplemental.push(...extra.assets);
  }
  const admitted = new Map(), session = fontSession(), assets = [];
  async function read(asset) {
    try { return await session.read(asset); }
    catch (error) { fail('Font ' + asset.family + ': ' + error.message); }
  }
  for (const asset of supplemental) await read(asset);
  const exact = id => {
    if (!admitted.has(id)) {
      const matching = catalog.filter(font => font?.id === id);
      admitted.set(id, matching.length ? admitFonts(matching, [id])[0] : null);
    }
    return admitted.get(id);
  };
  let selected = null;
  if (defaultFont !== undefined) {
    let family = defaultFont;
    if (defaultFont !== null && !['serif', 'mono', 'hand'].includes(defaultFont)) {
      if (typeof defaultFont !== 'string' || !/^f[0-9a-f]{24}$/.test(defaultFont)) fail('Choose a font from the library.', 'export_font_missing');
      selected = exact(defaultFont);
      if (!selected) {
        const carried = existing.find(asset => asset.sourceId === defaultFont && asset.family === 'rapier-' + defaultFont);
        if (carried) {
          selected = await read(carried);
          if (selected.id !== defaultFont) fail('The inherited font asset does not match its selected identity.');
        }
      }
      if (!selected) fail('The selected default font is missing from the library.', 'export_font_missing');
      family = fontFaceFamily(selected);
    }
    source = writeDocumentFontSetting(source, 'defaultfont', family);
  }
  const inherited = readDocumentSettings(source).defaultfont;
  const inheritedId = inherited?.stack === 'named' ? /^rapier-(f[0-9a-f]{24})$/.exec(inherited.family)?.[1] : null;
  if (inherited?.stack === 'named' && !inheritedId) fail('The inherited font must name its exact font asset.');
  const usage = documentFontUsage(source, parser);
  if (inheritedId && !usage.has(inherited.family)) usage.set(inherited.family, '');
  if (!usage.size && !existing.length) return {source, assets: null};
  const familyKey = value => String(value || '').toLowerCase(), used = new Map();
  for (const [family, text] of usage) {
    const key = familyKey(family), prior = used.get(key);
    if (prior) prior.text += '\n' + text;
    else used.set(key, {family, text});
  }
  for (const [key, {family, text}] of used) {
    const carried = existing.filter(asset => familyKey(asset.family) === key);
    const inheritedFace = inheritedId && familyKey(inherited.family) === key;
    const candidates = carried.length ? await Promise.all(carried.map(async asset => {
      if (inheritedFace && asset.sourceId !== inheritedId) fail('The inherited font asset does not match its selected identity.');
      const embedded = await read(asset), original = asset.sourceId ? exact(asset.sourceId) : null;
      if (inheritedFace && embedded.id !== inheritedId) fail('The inherited font asset does not match its selected identity.');
      const metadata = original || (inheritedFace ? embedded : null);
      if (metadata && fontAssetKey({...fontMetadata([metadata])[0], family: asset.family}) !== fontAssetKey(asset)) fail('The font metadata does not match its original asset.');
      return {asset, font: original || embedded};
    })) : inheritedFace ? [{font: selected || exact(inheritedId)}].filter(row => row.font)
      : catalog.filter(font => familyKey(font?.family || font?.name) === key).map(font => ({font: exact(font.id)}));
    if (!candidates.length) {
      if (!inheritedFace && !carried.length && (key === 'geist' || key === 'geist mono')) continue;
      fail('Font ' + family + ' is missing. Add its original file before saving.', 'export_font_missing');
    }
    const seen = new Map();
    for (const {font, asset: prior} of candidates) {
      const face = {...fontMetadata([font])[0], family: prior?.family || family, sourceId: prior?.sourceId || (inheritedFace ? inheritedId : font.id)};
      if (prior) for (const field of ['style', 'weight', 'weightRange', 'stretch', 'axes'])
        if (prior[field] != null) face[field] = prior[field];
      const identity = fontAssetKey(face);
      if (seen.has(identity)) {
        if (seen.get(identity) !== font.id) fail('More than one library file owns the font face ' + family + '. Choose its exact font asset.');
        continue;
      }
      seen.set(identity, font.id);
      let url = (inheritedFace || preserve) && prior ? prior.url : null;
      if (!url) {
        const encoded = await fontAsset(inheritedFace ? font : await session.subset(font, text), {original: !!inheritedFace});
        url = encoded.url;
      }
      assets.push({...face, url});
    }
  }
  return {source, assets};
}
