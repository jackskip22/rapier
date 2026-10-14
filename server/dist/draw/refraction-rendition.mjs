// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from '../kit/ledger/hash.mjs';
import {inspectRaster} from '../images/raster.mjs';
import {inspectJPEGXL, JPEG_XL_LIMITS} from '../images/header.mjs';

export const hasRefraction = recipe => recipe?.effect?.type === 'refraction' || recipe?.shapes?.some(shape => shape.effect?.type === 'refraction');

export function refractionRecipeKey(recipe) {
  const {renditions, view, tool, ...source} = recipe;
  return sha256(JSON.stringify(source));
}

const bytes = (url, maximumBytes) => {
  const encoded = url.slice(url.indexOf(',') + 1), padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const length = encoded.length / 4 * 3 - padding;
  const last = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(encoded[encoded.length - padding - 1]);
  if (encoded.length % 4 || length < 1 || length > maximumBytes || padding && (last & (padding === 2 ? 15 : 3)))
    throw new TypeError('Invalid refracted image bytes');
  const binary = atob(encoded), out = new Uint8Array(binary.length);
  for (let i = 0; i < out.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

export function admitRefractionRenditions(raw) {
  if (!Array.isArray(raw) || raw.length > 2049) return null;
  const out = [], scopes = new Set();
  let size = 0;
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).some(key => !['scope', 'key', 'width', 'height', 'view', 'png', 'jxl'].includes(key)) ||
        typeof row.scope !== 'string' || !/^(canvas|(?:shape|layer):[A-Za-z0-9_-]{1,64})$/.test(row.scope) || scopes.has(row.scope) ||
        !/^[a-f0-9]{64}$/.test(row.key || '') || !Number.isInteger(row.width) || !Number.isInteger(row.height) ||
        row.width < 1 || row.height < 1 || row.width * row.height > 12000000) return null;
    const view = row.view;
    if (!view || Object.keys(view).some(key => !['x', 'y', 'w', 'h'].includes(key)) ||
        !['x', 'y', 'w', 'h'].every(key => typeof view[key] === 'number' && Number.isFinite(view[key]) && Math.abs(view[key]) <= 131072) ||
        view.w <= 0 || view.h <= 0) return null;
    try {
      for (const codec of ['png', 'jxl']) {
        const url = row[codec];
        if (typeof url !== 'string' || (size += url.length) > 128 * 1024 * 1024 ||
            !new RegExp('^data:image/' + codec + ';base64,[A-Za-z0-9+/]+={0,2}$').test(url)) return null;
        const maximumBytes = codec === 'png' ? 64 * 1024 * 1024 : JPEG_XL_LIMITS.bytes;
        const data = bytes(url, maximumBytes);
        const header = codec === 'png' ? inspectRaster(data, {maximumBytes}) : inspectJPEGXL(data);
        if (codec === 'png' && header.type !== 'image/png' || header.orientation !== 1 ||
            header.width !== row.width || header.height !== row.height) return null;
      }
    } catch { return null; }
    scopes.add(row.scope);
    out.push({scope: row.scope, key: row.key, width: row.width, height: row.height,
      view: {x: view.x, y: view.y, w: view.w, h: view.h}, png: row.png, jxl: row.jxl});
  }
  return out;
}

export function currentRefractionRenditions(recipe) {
  if (!recipe?.renditions?.length) return [];
  const key = refractionRecipeKey(recipe);
  return recipe.renditions.filter(row => row.key === key);
}

export function stripRefractionRenditions(recipe) {
  return recipe.renditions ? {...recipe, renditions: recipe.renditions.map(row => ({...row, png: undefined, jxl: undefined}))} : recipe;
}

export function restoreRefractionRenditions(recipe, svg) {
  if (!recipe?.renditions) return recipe;
  if (!Array.isArray(recipe.renditions) || recipe.renditions.some(row => row?.png != null || row?.jxl != null))
    throw Object.assign(new Error('The refracted picture contains pixels outside its image resources.'), {code: 'drawing_restore_failed'});
  const images = new Map();
  for (const match of svg.matchAll(/<image\b((?:"[^"]*"|'[^']*'|[^<>"'])*)\/?>/g)) {
    const codec = /\sdata-rapier-refraction-rendition\s*=\s*(?:"(png|jxl)"|'(png|jxl)')/.exec(match[1]);
    if (!codec) continue;
    const scope = /\sdata-refraction-scope\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(match[1]);
    const href = /\s(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(match[1]);
    const key = (scope?.[1] ?? scope?.[2]) + '/' + (codec[1] || codec[2]);
    if (!scope || !href || images.has(key)) throw Object.assign(new Error('The refracted picture contains duplicate or missing pixels.'), {code: 'drawing_restore_failed'});
    images.set(key, href[1] ?? href[2]);
  }
  return {...recipe, renditions: recipe.renditions.map(row => ({...row, png: images.get(row.scope + '/png'), jxl: images.get(row.scope + '/jxl')}))};
}

export function refractionRenditionMarkup(rendition, body) {
  const {x, y, w, h} = rendition.view;
  const image = codec => '<image data-rapier-refraction-rendition="' + codec + '" data-refraction-scope="' + rendition.scope +
    '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" preserveAspectRatio="none" href="' + rendition[codec] + '"/>';
  return '<defs><g data-refraction-source="">' + body + '</g>' + image('jxl') + '</defs>' + image('png');
}
