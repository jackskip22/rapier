async function _rapierPrepareInterchangeContext(options, captured) {
  const context = _rapierBuildInterchangeContext(options, captured);
  context.imageSubstitutions = new Map();
  await globalThis.RapierEmbeddedImages.materialize(context.semanticRoot, context.canonical, context.imageSubstitutions,
    {compat: context.imageCompat !== false});
  const images = [...context.semanticRoot.querySelectorAll('img')];
  context.stats.embeddedImages = images.filter(image => /^data:image\//i.test(image.getAttribute('src') || '')).length;
  context.stats.unresolvedImages = images.filter(image => !/^data:image\//i.test(image.getAttribute('src') || '')).length;
  context.stats.embeddedImageBytes = images.reduce((total, image) => {
    const value = image.getAttribute('src') || '';
    return total + (value.startsWith('data:') ? Math.floor((value.length-value.indexOf(',')-1)*.75) : 0);
  }, 0);
  return context;
}

function _rapierImageSources(tokens) {
  const sources = new Set();
  const visit = tokens => {
    for (const token of tokens || []) {
      if (token.type === 'image') sources.add(token.attrGet('src') || '');
      else if (token.children) visit(token.children);
    }
  };
  visit(tokens);
  return sources;
}

function _rapierImageReferences(source, context = source, includeLinks = false) {
  const env = globalThis.RapierImageAssets.imageEnvironment(context), ids = new Set();
  const visit = tokens => { for (const token of tokens || []) {
    if (token.type === 'image' && token.meta?.mdImage?.reference) ids.add(token.meta.mdImage.reference);
    else if (token.children) visit(token.children);
  }};
  visit(md.parse(source, env));
  if (includeLinks) for (const row of env.__rapierInlineCandidates || []) {
    if (row.kind === 'link-reference-use' || row.kind === 'image-reference-use') ids.add(md.utils.normalizeReference(row.rawKey));
  }
  return ids;
}

// start/end is the inner span (without `<…>`); outerStart/outerEnd include the delimiters. Rewriting bytes edits inner;
// replacing the destination (share.js's bare `#id`) edits outer, or it comes out `<#id>`.
function _rapierImageDestinations(source, accepts) {
  const env = {}, tokens = md.parse(source, env), offsets = _rapierLineStartOffsets(source);
  const hrefs = _rapierImageSources(tokens), labels = new Set(), destinations = [], seen = new Set();
  const visit = rows => { for (const token of rows || []) {
    if (token.type === 'image' && token.meta?.mdImage?.reference) labels.add(token.meta.mdImage.reference);
    else if (token.children) visit(token.children);
  }};
  visit(tokens);
  const destinationAt = (start, stop, expected = null, extra = {}) => {
    const parsed = md.helpers.parseLinkDestination(source, start, stop);
    if (!parsed?.ok || parsed.pos <= start || parsed.pos > stop) return false;
    const destination = md.normalizeLink(parsed.str);
    if (expected !== null && destination !== expected || !hrefs.has(destination) || !accepts(destination)) return false;
    const outerStart = start;
    let end = parsed.pos, outerEnd = end, delimited = false;
    if (source[start] === '<' && source[end - 1] === '>') { start++; end--; delimited = true; }
    const key = start + ':' + end;
    if (!seen.has(key)) { seen.add(key); destinations.push({start, end, outerStart, outerEnd, delimited, destination, source: source.slice(start, end), ...extra}); }
    return true;
  };
  for (const image of _rapierScanMarkdownImages(source, tokens)) {
    if (image.kind !== 'inline') continue;
    let start = image.innerStart;
    while (start < image.innerEnd && /[ \t\r\n]/.test(source[start])) start++;
    destinationAt(start, image.innerEnd, null, {image});
  }
  const definitions = new Set();
  for (const token of tokens) {
    if (token.type !== 'reference_definition' || !token.map) continue;
    const label = token.meta?.label;
    if (!label || definitions.has(label)) continue;
    definitions.add(label);
    const destination = env.references?.[label]?.href;
    if (!labels.has(label) || !hrefs.has(destination) || !accepts(destination)) continue;
    const span = _rapierSourceLineSpan(source, offsets, token.map[0], token.map[1]);
    let found = false;
    for (let open = source.indexOf('[', span.start); open >= 0 && open < span.end; open = source.indexOf('[', open + 1)) {
      if (_rapierSourceCharEscaped(source, open)) continue;
      let close = open + 1;
      while (close < span.end && (source[close] !== ']' || _rapierSourceCharEscaped(source, close))) close++;
      if (source[close + 1] !== ':') continue;
      const rawLabel = source.slice(open + 1, close);
      const normalized = md.utils.normalizeReference(rawLabel);
      const unquoted = md.utils.normalizeReference(rawLabel.replace(/\r?\n[ \t]*(?:>[ \t]*)+/g, ' '));
      if (normalized !== label && unquoted !== label) continue;
      let start = close + 2;
      while (start < span.end) {
        if (/[ \t\r\n]/.test(source[start])) start++;
        else if (token.level > 0 && source[start] === '>') start++;
        else break;
      }
      if (destinationAt(start, span.end, destination, {reference: label, title: env.references[label].title || ''})) { found = true; break; }
    }
    if (!found) throw new Error('An image reference destination cannot be changed without altering its source');
  }
  return destinations.sort((left, right) => left.start - right.start);
}

function _rapierApplyImageDestinationEdits(source, edits) {
  let end = source.length, output = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < 0 ||
        edit.end < edit.start || edit.end > end || source.slice(edit.start, edit.end) !== edit.source)
      throw new Error('An image source range could not be preserved');
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    end = edit.start;
  }
  return output;
}

function _rapierAssertTextPackResources(original, source, files) {
  const resource = value => {
    const raw = String(value || '').trim();
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(raw)) return null;
    try {
      const path = decodeURIComponent(new URL(raw, 'https://rapier-textpack.invalid/').pathname.slice(1));
      return files.has(path) ? path : null;
    } catch (_) { return null; }
  };
  const reject = path => { throw new Error('Unsupported package resource: ' + path + '. Its link cannot be preserved in self-contained Markdown.'); };
  // A definition may serve a picture and an attachment link. Inspect the original
  // links before embedding so an unsupported attachment cannot disappear.
  const inspectLinks = tokens => {
    for (const token of tokens || []) {
      if (token.type === 'link_open') {
        const path = resource(token.attrGet('href'));
        if (path) reject(path);
      }
      if (token.type !== 'image' && token.children) inspectLinks(token.children);
    }
  };
  inspectLinks(md.parse(_rapierSplitOpeningFrontmatter(original).body, {}));

  const template = document.createElement('template');
  const markdown = _rapierSplitOpeningFrontmatter(source).body;
  template.innerHTML = sanitizeRapierHtml(md.render(markdown, {}), 'export');
  for (const element of template.content.querySelectorAll('img,[data-rapier-remote-src]')) {
    const label = element.getAttribute('data-rapier-asset');
    const destination = element.getAttribute('data-rapier-image-url') || element.getAttribute('data-rapier-remote-src') || element.getAttribute('src') ||
      (label ? globalThis.RapierImageAssets.documentAssets(source).assets.get(label)?.url : '') || '';
    if (!_rapierSafeRasterDataUrl(destination))
      throw new Error('An image resource cannot be embedded from this bundle');
  }
  const attributes = ['src', 'href', 'poster', 'xlink:href', 'data-rapier-remote-src'];
  for (const element of template.content.querySelectorAll('[src],[href],[srcset],[poster],[xlink\\:href],[data-rapier-remote-src]')) {
    if (element.closest('pre,code')) continue;
    for (const attribute of attributes) {
      const path = resource(element.getAttribute(attribute));
      if (path) reject(path);
    }
    const srcset = element.getAttribute('srcset') || '';
    for (let at = 0; at < srcset.length;) {
      while (at < srcset.length && /[\t\n\f\r ,]/.test(srcset[at])) at++;
      const start = at;
      while (at < srcset.length && !/[\t\n\f\r ]/.test(srcset[at])) at++;
      const value = srcset.slice(start, at);
      const path = resource(value.replace(/,+$/, ''));
      if (path) reject(path);
      if (value.endsWith(',')) continue;
      let depth = 0;
      while (at < srcset.length) {
        const character = srcset[at++];
        if (character === '(') depth++;
        else if (character === ')' && depth) depth--;
        else if (character === ',' && !depth) break;
      }
    }
  }
}

function _rapierCompleteImageExcerpt(excerpt, source) {
  const assets = globalThis.RapierImageAssets;
  const existing = assets.parseAssets(excerpt), parsed = assets.documentAssets(source);
  let text = excerpt;
  for (const id of _rapierImageReferences(excerpt, source, true)) {
    if (existing.references[id]) continue;
    const record = parsed.assets.get(id);
    if (!record) continue;
    if (record.status !== 'unverified') throw new Error('The excerpt contains an unavailable embedded image');
    text += '\n\n' + source.slice(record.start, record.end);
  }
  return text;
}

async function _rapierReadTextPackDocument(file, {profile, checkCurrent}) {
  const bundle = globalThis.RapierImageArchive.parseTextBundle(await globalThis.RapierImageArchive.unpackFiles(file));
  checkCurrent();
  let source = RapierTextCodec.normalizeDocument(bundle.markdown);
  const original = source;
  const replacements = [], embedded = [], converted = new Map();
  const localAsset = destination => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(destination)) return null;
    const suffix = destination.search(/[?#]/), bare = suffix >= 0 ? destination.slice(0, suffix) : destination;
    let path;
    try { path = decodeURIComponent(bare).replace(/^\.\//, ''); }
    catch (_) { throw new Error('Invalid bundle image path'); }
    const bytes = bundle.assets.get(path);
    if (!bytes) throw new Error('Image bytes are missing from the bundle: ' + path);
    if (suffix >= 0) throw new Error('A bundle image query or fragment cannot be preserved when embedding: ' + path);
    return {path, bytes};
  };
  for (const destination of _rapierImageSources(md.parse(source, {}))) {
    if (_rapierSafeRasterDataUrl(destination)) continue;
    if (!localAsset(destination)) throw new Error('The bundle does not contain bytes for an external image');
  }
  const destinations = _rapierImageDestinations(source, destination => !!localAsset(destination));
  const ready = [], aliases = new Map([...globalThis.RapierImageAssets.documentAssets(source).assets.values()]
    .map(row => [row.url + '\n' + row.title, row.label]));
  for (const image of destinations) {
    checkCurrent();
    const {path, bytes} = localAsset(image.destination), title = image.image?.title || '';
    const key = path + '\n' + title;
    if (!converted.has(key)) {
      const mime = [...RAPIER_RASTER_MIMES, 'image/svg+xml'].find(type => _rapierVerifyRasterBytes(bytes, type));
      if (!mime) throw new Error('Unsupported bundle image: ' + path);
      const file = new File([bytes], path, {type:mime});
      converted.set(key, mime === 'image/svg+xml' ? await _rapierNormaliseVector(file, {title}) :
        await _rapierNormaliseRaster(file, profile, null, {title}));
      checkCurrent();
    }
    const normalized = converted.get(key);
    ready.push({image, normalized});
    if (!image.image) {
      replacements.push({...image, text: normalized.dataUrl});
      aliases.set(normalized.dataUrl + '\n' + image.title, image.reference);
    }
  }
  for (const {image, normalized} of ready) {
    if (!image.image) continue;
    const key = normalized.dataUrl + '\n' + (normalized.asset.title || '');
    let label = aliases.get(key);
    if (!label) { label = normalized.reference; aliases.set(key, label); embedded.push(normalized.asset); }
    const start = image.image.altEnd + 1, end = image.image.tokenEnd;
    replacements.push({start, end, source: source.slice(start, end), text: '[' + label + ']'});
  }
  source = _rapierApplyImageDestinationEdits(source, replacements);
  for (const asset of embedded) {
    source = (await globalThis.RapierImageAssets.appendAsset(source, asset)).source;
    checkCurrent();
  }
  if ([..._rapierImageSources(md.parse(source, {}))].some(destination => !_rapierSafeRasterDataUrl(destination)))
    throw new Error('Some bundle images could not be embedded without changing source');
  _rapierAssertTextPackResources(original, source, bundle.assets);
  return RapierTextCodec.normalizeDocument(source);
}
