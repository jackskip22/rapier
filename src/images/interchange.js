async function _rapierInterchangeFonts(snapshot, comparison) {
  const base = comparison && snapshot.comparisonBase && RapierLedgerCarried.readBase(snapshot.comparisonBase);
  return {...snapshot, canonical: await _rapierDocumentFonts.materialize(snapshot.canonical),
    ...(base ? {comparisonBase: await _rapierDocumentFonts.materialize(base, {comparison: true})} : {})};
}

async function _rapierPrepareInterchangeContext(options, captured, progress = null) {
  const work = options?.work || captured?.work || null;
  let parsed;
  const offlinePage = ['share', 'standalone', 'page'].includes(options?.kind) || ['html', 'html-standalone'].includes(options?.format);
  let snapshot = captured || {canonical: _rapierGetCanonicalText(), metadata: _rapierGetDocumentMetadata(), plain: _rapierPlainLayout()};
  if (snapshot.metadata.docKind === 'markdown' && !options?.comparison) snapshot = await _rapierInterchangeFonts(snapshot, offlinePage);
  work?.signal?.throwIfAborted();
  if (offlinePage && options?.kind !== 'page' && snapshot.metadata.docKind === 'markdown') {
    const needed = new Set();
    const visit = tokens => { for (const token of tokens) {
      if (token.type === 'math_inline' || token.type === 'math_block') needed.add('math');
      if (token.type === 'fence' && token.meta?.rapierFenceClosed !== false &&
          String(token.info || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid' &&
          globalThis.RapierFlowchart?.parseFlowchart(token.content).ok !== true) needed.add('mermaid');
      if (token.children) visit(token.children);
    }};
    const body = _rapierSplitOpeningFrontmatter(snapshot.canonical).body;
    parsed = work ? await _rapierExportParse(body, {work}) : {tokens: md.parse(body, _rapierMarkdownEnvironment())};
    visit(parsed.tokens);
    await Promise.all([...needed].map(async key => {
      const provider = _rapierProviders[key];
      if (!provider) throw new Error('The ' + key + ' renderer is unavailable.');
      if (provider.status !== 'ready') await provider.install();
      if (provider.status !== 'ready') throw new Error('The ' + key + ' renderer could not start.');
    }));
  }
  const preparedRoot = work ? await _rapierRenderModule('render-markdown')._rapierRenderSemanticRootAsync(
    snapshot.canonical, snapshot.metadata, {work, parsed}) : null;
  const context = _rapierBuildInterchangeContext(options, snapshot, preparedRoot);
  context.imageSubstitutions = new Map();
  await globalThis.RapierEmbeddedImages.materialize(context.semanticRoot, context.canonical, context.imageSubstitutions,
    {compat: context.imageCompat !== false, drawn: options?.print === true, progress: progress || (work ? fraction => work.onProgress?.(.6 + .1 * fraction) : null), signal: work?.signal || options?.signal, work});
  if (context.metadata.docKind === 'markdown') {
    const objects = await _rapierDocumentObjects.materialize(context.canonical, {root: context.semanticRoot, signal: work?.signal || options?.signal,
      strict: options?.preserveObjects !== true});
    if (options?.preserveObjects !== true) context.canonical = objects.source;
  }
  const images = [...context.semanticRoot.querySelectorAll('img')];
  context.stats.embeddedImages = images.filter(image => /^data:image\//i.test(image.getAttribute('src') || '')).length;
  context.stats.unresolvedImages = images.filter(image => !/^data:image\//i.test(image.getAttribute('src') || '')).length;
  context.stats.embeddedImageBytes = images.reduce((total, image) => {
    const value = image.getAttribute('src') || '';
    return total + (value.startsWith('data:') ? Math.floor((value.length-value.indexOf(',')-1)*.75) : 0);
  }, 0);
  return context;
}

function _rapierImageSources(...args) { return _rapierRenderModule('render')._rapierImageSources(...args); }

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

function _rapierImageDestinations(...args) { return _rapierRenderModule('render')._rapierImageDestinations(...args); }

function _rapierApplyImageDestinationEdits(source, edits) {
  let end = source.length;
  const parts = [];
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < 0 ||
        edit.end < edit.start || edit.end > end || source.slice(edit.start, edit.end) !== edit.source)
      throw new Error('An image source range could not be preserved');
    parts.push(source.slice(edit.end, end), String(edit.text));
    end = edit.start;
  }
  parts.push(source.slice(0, end));
  return parts.reverse().join('');
}

function _rapierAssertTextPackResources(source, files, parsed, htmlOnly = false) {
  const resource = value => {
    const raw = String(value || '').trim();
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(raw)) return null;
    try {
      const path = decodeURIComponent(new URL(raw, 'https://rapier-textpack.invalid/').pathname.slice(1));
      return files.has(path) ? path : null;
    } catch (_) { return null; }
  };
  const reject = path => { throw new Error('Unsupported package resource: ' + path + '. Its link cannot be preserved in self-contained Markdown.'); };
  const html = [];
  const inspectLinks = tokens => {
    for (const token of tokens || []) {
      if (token.type === 'link_open') {
        const path = resource(token.attrGet('href'));
        if (path) reject(path);
      }
      if (htmlOnly && (token.type === 'html_block' || token.type === 'html_inline')) html.push(token.content);
      if (token.type !== 'image' && token.children) inspectLinks(token.children);
    }
  };
  inspectLinks(parsed.tokens);

  const template = document.createElement('template');
  template.innerHTML = _rapierRenderModule('render-sanitize').sanitizeRapierHtml(htmlOnly ? html.join('\n') : md.renderer.render(parsed.tokens, md.options, parsed.env), 'export');
  for (const element of template.content.querySelectorAll('img,[data-rapier-remote-src]')) {
    const label = element.getAttribute('data-rapier-asset');
    const destination = element.getAttribute('data-rapier-image-url') || element.getAttribute('data-rapier-remote-src') || element.getAttribute('src') ||
      (label ? parsed.assets.assets.get(label)?.url : '') || '';
    if (!_rapierRenderModule('render-sanitize')._rapierSafeRasterDataUrl(destination))
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
  const root = _rapierRenderModule('render-markdown')._rapierRenderSemanticRoot(text, {docKind: 'markdown'});
  const copied = new Set();
  for (const image of root.querySelectorAll('img')) {
    if (!image.hasAttribute('data-rapier-html')) {
      const id = image.getAttribute('data-rapier-asset'), url = id ? parsed.assets.get(assets.normalizeLabel(id))?.url :
        image.getAttribute('data-rapier-image-url') || image.getAttribute('src');
      if (!url || !assets.imageAnimation(url)?.animated) continue;
      image.dataset.rapierAnimation = url;
    }
    const label = globalThis.RapierRenderMarkdown.objectPosterLabel(image), id = assets.normalizeLabel(label);
    const record = parsed.assets.get(id);
    if (!record || existing.references[id] || copied.has(id) || !/^object-poster-v1 /.test(record.title)) continue;
    copied.add(id); text += '\n\n' + source.slice(record.start, record.end);
  }
  return text;
}

async function _rapierAppendImportedImageAssets(source, pending, work) {
  const owner = globalThis.RapierImageAssets, existing = owner.documentAssets(source);
  const identities = new Set([...existing.assets.values()].map(row => row.url + '\n' + row.title));
  const additions = new Map(), blocks = [];
  for (const asset of pending) {
    await work.checkpoint();
    if (!asset || owner.normalizeLabel(asset.label) !== asset.id) throw new Error('image_source_invalid');
    const identity = asset.url + '\n' + (asset.title || '');
    if (identities.has(identity)) continue;
    const previous = additions.get(asset.id) || existing.references[asset.id];
    if (previous) {
      if (previous.href !== asset.url || (previous.title || '') !== (asset.title || '')) throw new Error('image_label_conflict');
      continue;
    }
    if (existing.assets.size + additions.size >= owner.IMAGE_LIMITS.assets) throw new Error('image_asset_count_limit');
    blocks.push(owner.serializeAsset(asset));
    additions.set(asset.id, {href: asset.url, title: asset.title || ''});
    identities.add(identity);
  }
  if (!blocks.length) return {source, assets: existing};
  const eol = /\r\n|\n|\r/.exec(source)?.[0] || '\n', tail = /(?:\r\n?|\n)[ \t]*$/.exec(source);
  const separator = !source || tail && /[\r\n][ \t]*$/.test(source.slice(0, tail.index)) ? '' : tail ? eol : eol + eol;
  const suffix = separator + blocks.join(eol + eol) + eol;
  if (source.length + suffix.length > owner.IMAGE_LIMITS.sourceChars) throw new Error('image_source_limit');
  source += suffix;
  await work.checkpoint();
  const assets = owner.documentAssets(source);
  for (const [id, expected] of additions) {
    if (assets.references[id]?.href !== expected.href) throw new Error('image_appendix_not_available');
  }
  return {source, assets};
}

async function _rapierReadTextPackDocument(file, options = {}) {
  const {profile} = options;
  const work = options.work || globalThis.RapierImageArchive.createImportWork(options);
  const bundle = await globalThis.RapierImageArchive.openTextBundle(file, {work});
  try {
    const textOptions = {bomSeparated: true, signal: work.signal, yield: () => work.checkpoint()};
    let source = await RapierTextCodec.normalizeDocumentAsync(bundle.markdown, undefined, textOptions);
    await work.checkpoint();
    const env = {}, tokens = md.parse(source, env), originalAssets = globalThis.RapierImageAssets.documentAssets(source);
    const body = _rapierSplitOpeningFrontmatter(source).body, bodyEnv = body === source ? env : {};
    _rapierAssertTextPackResources(source, bundle.assets,
      {tokens: body === source ? tokens : md.parse(body, bodyEnv), env: bodyEnv, assets: originalAssets}, true);
    const replacements = [], embedded = [], converted = new Map(), needed = new Map();
    const localAsset = destination => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(destination)) return null;
      const suffix = destination.search(/[?#]/), bare = suffix >= 0 ? destination.slice(0, suffix) : destination;
      let path;
      try { path = decodeURIComponent(bare).replace(/^\.\//, ''); }
      catch (_) { throw new Error('Invalid bundle image path'); }
      if (!bundle.assets.has(path)) throw new Error('Image bytes are missing from the bundle: ' + path);
      if (suffix >= 0) throw new Error('A bundle image query or fragment cannot be preserved when embedding: ' + path);
      if (!needed.has(path)) needed.set(path, {path});
      return needed.get(path);
    };
    for (const destination of _rapierImageSources(tokens)) {
      if (_rapierRenderModule('render-sanitize')._rapierSafeRasterDataUrl(destination)) continue;
      if (!localAsset(destination)) throw new Error('The bundle does not contain bytes for an external image');
    }
    const destinations = _rapierImageDestinations(source, destination => !!localAsset(destination));
    for (const record of needed.values()) {
      const bytes = await bundle.readAsset(record.path);
      record.mime = [...RAPIER_RASTER_MIMES, 'image/svg+xml'].find(type => _rapierRenderModule('render-sanitize')._rapierVerifyRasterBytes(bytes, type));
      if (!record.mime) throw new Error('Unsupported bundle image: ' + record.path);
      const owner = globalThis.RapierImageAssets;
      if (!bytes.length || bytes.length > owner.IMAGE_LIMITS.bytes) throw new Error('Images must be smaller than 16 MiB.');
      record.isJxl = record.mime === 'image/jxl';
      record.info = record.mime === 'image/svg+xml' ? owner.inspectSVG(bytes) : record.isJxl ? owner.inspectJPEGXL(bytes) : owner.inspectRaster(bytes);
      await work.checkpoint();
    }
    await bundle.verify();
    await work.checkpoint();
    const ready = [], aliases = new Map([...originalAssets.assets.values()].map(row => [row.url + '\n' + row.title, row.label]));
    let completed = 0;
    for (const image of destinations) {
      await work.checkpoint();
      const record = localAsset(image.destination), {path, mime} = record, title = image.image?.title || '';
      const key = path + '\n' + title;
      if (!converted.has(key)) {
        const input = {...record, bytes: await bundle.readAsset(path)};
        const conversion = {input, title, signal: work.signal,
          progress: fraction => { work.check(); work.onProgress?.({fraction: .2 + .6 * (completed + fraction) / destinations.length}); }};
        const normalized = mime === 'image/svg+xml' ? await _rapierNormaliseVector(null, conversion) :
          await _rapierNormaliseRaster(null, profile, null, conversion);
        const {id, label, url, title: assetTitle} = normalized.asset;
        converted.set(key, {dataUrl: normalized.dataUrl, reference: normalized.reference, asset: {id, label, url, title: assetTitle}});
        await work.checkpoint();
      }
      const normalized = converted.get(key);
      ready.push({image, normalized});
      if (!image.image) {
        replacements.push({...image, text: normalized.dataUrl});
        aliases.set(normalized.dataUrl + '\n' + image.title, image.reference);
      }
      work.onProgress?.({fraction: .2 + .6 * ++completed / destinations.length});
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
    const assembled = await _rapierAppendImportedImageAssets(source, embedded, work);
    source = await RapierTextCodec.normalizeDocumentAsync(assembled.source, undefined, textOptions);
    await work.checkpoint();
    const finalEnv = {}, finalTokens = md.parse(source, finalEnv);
    if ([..._rapierImageSources(finalTokens)].some(destination => !_rapierRenderModule('render-sanitize')._rapierSafeRasterDataUrl(destination)))
      throw new Error('Some bundle images could not be embedded without changing source');
    const finalBody = _rapierSplitOpeningFrontmatter(source).body, finalBodyEnv = finalBody === source ? finalEnv : {};
    _rapierAssertTextPackResources(source, bundle.assets,
      {tokens: finalBody === source ? finalTokens : md.parse(finalBody, finalBodyEnv), env: finalBodyEnv, assets: assembled.assets});
    await work.checkpoint();
    work.onProgress?.({fraction: 1});
    return source;
  } finally { bundle.close(); }
}
