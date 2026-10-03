// A local image belongs to its picked container and resolved source path. Wiki paths use the
// shared resolver's documented vault lookup, with ambiguous matches refused.
// Discovery and appendix grammar stay with the shared link and asset owners; this module plans
// source changes only. Unresolved imports are receipt facts, never replacement prose.
import {scanLinks, resolveAssetPath, normalizeSourcePath, resolveLink} from './links.mjs';
import {createAsset} from '../images/assets.mjs';
import {keepImportCharacters, finishImportCharacters} from './import-characters.mjs';
import {appendAssetText, documentAssets, normalizeLabel, markdownParser, escapeImageAlt} from '../spec/md-assets.mjs';

const IMAGE_PATH = /\.(?:png|jpe?g|jxl|webp|svg|gif|bmp|ico|avif|heic|heif)(?:\?|$)/i;
const WIKI_DIMENSIONS = /^[1-9]\d*x[1-9]\d*$/;
const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/jxl', 'image/webp', 'image/svg+xml']);
const rootOf = row => typeof row?.rootId === 'string' ? row.rootId : '';
const nameOf = row => typeof row?.sourceName === 'string' ? row.sourceName : typeof row?.name === 'string' ? row.name : '';
const bytesOf = value => value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
const identity = (rootId, name) => JSON.stringify([rootId, name]);

function picturePool(pictures) {
  const paths = new Map(), aliases = new Map(), files = new Map();
  for (const picture of Array.isArray(pictures) ? pictures : []) {
    const name = nameOf(picture), path = normalizeSourcePath(name);
    if (!name || !path.path || path.outside) continue;
    const key = identity(rootOf(picture), path.path), rows = paths.get(key) || [];
    rows.push(picture); paths.set(key, rows);
    if (!files.has(rootOf(picture))) files.set(rootOf(picture), new Set());
    files.get(rootOf(picture)).add(path.path);
    // Joplin's resource identifier is supplied by its importer, never inferred from a basename.
    for (const alias of new Set(Array.isArray(picture.sourceAliases) ? picture.sourceAliases : [])) {
      if (typeof alias !== 'string' || !/^:\/[^\s]+$/.test(alias)) continue;
      const aliasKey = identity(rootOf(picture), alias), matching = aliases.get(aliasKey) || [];
      matching.push(picture); aliases.set(aliasKey, matching);
    }
  }
  return {paths, aliases, files};
}

function imageAlt(source, link) {
  if (link.kind === 'embed') {
    const alias = link.alias || '';
    return /^[1-9]\d{0,3}$/.test(alias) || WIKI_DIMENSIONS.test(alias) ? '|' + alias : escapeImageAlt(alias);
  }
  if (typeof link.rawAlt === 'string') return link.rawAlt;
  if (Number.isInteger(link.altStart) && Number.isInteger(link.altEnd)) return source.slice(link.altStart, link.altEnd);
  throw new Error('image_occurrence_unmapped');
}

function appendAvailable(source, asset) {
  try { return appendAssetText(source, asset); }
  catch (error) {
    if (error?.message !== 'image_label_conflict') throw error;
    const refs = documentAssets(source).references;
    // Existing source owns its label even if it happens to use an imported asset's digest.
    for (let count = 2; count <= Object.keys(refs).length + 2; count++) {
      const label = asset.label + '-' + count, id = normalizeLabel(label);
      if (!Object.hasOwn(refs, id)) return appendAssetText(source, {...asset, id, label});
    }
    throw error;
  }
}

/**
 * Plan picture embedding for one note. `convert`, when provided, receives a copied picture
 * {bytes,mime,name,rootId,sourceName} and returns {bytes,codec}; the shell may use its existing
 * offline codec owner. Without it, supported original bytes stay in their original codec.
 * The application configures spec/md-assets' shared Markdown parser before calling this door.
 */
export async function importPictures(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('picture_source_invalid');
  const {rootId = '', sourceName = '', pictures = [], convert} = options || {};
  const original = source, warnings = [];
  source = keepImportCharacters(source, warnings, 'picture source');
  const pool = picturePool(pictures), unresolved = [], embedded = [], edits = [];
  const ready = new Map(), assets = new Map(), embeddedByKey = new Map(), warned = new Map();
  let text = source;
  const warn = (link, reason, message) => {
    const occurrence = {start: link.start, end: link.end};
    unresolved.push({dest: link.dest, reason, ...occurrence});
    const key = JSON.stringify([link.dest, reason]), prior = warned.get(key);
    if (prior) { prior.occurrences.push(occurrence); return; }
    const row = {code: 'picture_' + reason, rootId, name: sourceName, dest: link.dest, message, ...occurrence, occurrences: [occurrence]};
    warnings.push(row); warned.set(key, row);
  };
  for (const link of scanLinks(source)) {
    if (!(link.image || link.kind === 'embed' && IMAGE_PATH.test(link.dest))) continue;
    if (link.kind === 'embed' && !IMAGE_PATH.test(link.dest)) continue;
    if (link.unresolvedDecode) { warn(link, 'unreadable_reference', 'The Markdown destination could not be decoded; its original link was kept.'); continue; }
    if (/^data:/i.test(link.dest)) continue;
    if (link.anchor) { warn(link, 'fragment', 'The picture fragment was kept in its original link.'); continue; }
    const aliased = pool.aliases.get(identity(rootId, link.dest));
    const resolved = aliased ? {} : resolveAssetPath(sourceName, link.dest);
    if (resolved.outside) { warn(link, 'external', 'The external picture link was kept; no network request was made.'); continue; }
    let found = aliased || pool.paths.get(identity(rootId, resolved.path || '')) || [];
    if (!aliased && link.kind === 'embed') {
      // Obsidian writes the shortest unique path in a vault. The shared link owner decides
      // that path exactly as it decides note links; ambiguity never becomes a guessed image.
      const wiki = resolveLink(link, {from: sourceName, files: pool.files.get(rootId), sourceFiles: true});
      if (wiki.unresolved === 'ambiguous') { warn(link, 'ambiguous', 'More than one picked picture matches this wiki path in this container.'); continue; }
      if (wiki.file) found = pool.paths.get(identity(rootId, wiki.file)) || [];
    }
    if (!found.length) { warn(link, 'missing', 'The picture was not among the files picked for this container.'); continue; }
    if (found.length !== 1) { warn(link, 'ambiguous', 'More than one picked picture has this path in this container.'); continue; }
    // HTML's width, controls and other authored attributes stay byte-exact. The attachment
    // importer carries and relocates these original files; only Markdown pictures are embedded.
    if (link.kind === 'html') continue;
    const picture = found[0], key = identity(rootId, nameOf(picture));
    let asset, alt, title;
    try {
      alt = imageAlt(source, link);
      title = typeof link.titleRaw === 'string' ? markdownParser().utils.unescapeAll(link.titleRaw) : String(link.title || '');
      if (!ready.has(key)) ready.set(key, (async () => {
        const bytes = bytesOf(picture.bytes);
        if (!bytes) throw new Error('image_bytes_invalid');
        const mime = String(picture.mime || picture.codec || '').toLowerCase();
        if (typeof convert === 'function') {
          const converted = await convert({bytes: bytes.slice(), mime, name: nameOf(picture), rootId, sourceName});
          if (!bytesOf(converted?.bytes) || !SUPPORTED.has(converted?.codec)) throw new Error('image_conversion_invalid');
          return converted;
        }
        return {bytes, codec: mime === 'image/svg+xml' || /\.svg$/i.test(nameOf(picture)) ? 'image/svg+xml' : undefined};
      })());
      const assetKey = JSON.stringify([key, title]);
      if (!assets.has(assetKey)) assets.set(assetKey, ready.get(key).then(data => createAsset(data.bytes, null, {codec: data.codec, title})));
      asset = await assets.get(assetKey);
      const appended = appendAvailable(text, asset);
      text = appended.source;
      edits.push({start: link.start, end: link.end, text: '![' + alt + '][' + appended.reference + ']'});
      if (link.kind === 'embed' && WIKI_DIMENSIONS.test(link.alias || '')) warnings.push({code: 'picture_dimensions', rootId, name: sourceName, dest: link.dest, value: link.alias,
        message: 'The original width and height remain in the picture\'s Markdown source. Fixed width and height are not applied by this reader.'});
      const embeddedKey = JSON.stringify([key, appended.id]), previous = embeddedByKey.get(embeddedKey);
      if (previous) previous.uses++;
      else {
        const row = {rootId, name: nameOf(picture), label: appended.reference, codec: asset.codec, byteLength: asset.byteLength, uses: 1};
        embedded.push(row); embeddedByKey.set(embeddedKey, row);
      }
    } catch (error) {
      const mime = String(picture.mime || picture.codec || '').toLowerCase();
      const unsupported = mime && !SUPPORTED.has(mime) || /\.(?:gif|bmp|ico|avif|heic|heif)$/i.test(nameOf(picture));
      const reason = unsupported ? 'unsupported' : 'not_embedded';
      warn(link, reason, 'The original picture link was kept: ' + String(error?.message || error) + '.');
    }
  }
  // Appending precedes the span edits: every offset still addresses the source that was scanned.
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return finishImportCharacters({text, warnings, embedded, unresolved, changed: text !== original});
}
