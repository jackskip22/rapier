(() => {
  const blocks = globalThis.RapierRenderMarkdown;
  blocks.mountHtmlBlocks(document, {identity: () => rapier.identity.authority, source: () => _rapierSourceText(), notice: message => showToast(message, 'info')});
  let selected = null;
  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted) return;
    const image = event.target.closest?.('img[data-rapier-html]');
    if (image) selected = image;
    else if (event.target.closest?.('#editor-blocks')) selected = null;
  }, true);
  globalThis.RapierHtmlSelection = () => {
    if (!selected?.isConnected) return null;
    const wrapper = selected.closest('.block-wrapper');
    const block = wrapper && rapier.document.blocks.find(row => row.id === Number(wrapper.dataset.blockId));
    const span = block && _rapierExcerptCanonicalBlockSpans().get(block.id);
    return span ? {start: span.start, end: span.start + block.raw.length} : null;
  };
})();

const _rapierDocumentObjects = (() => {
  let lastIssues = [];
  const renderer = () => globalThis.RapierRenderMarkdown;
  async function materialize(source, {root = null, signal, strict = false} = {}) {
    const assets = globalThis.RapierImageAssets;
    if (!root) {
      root = _rapierRenderModule('render-markdown')._rapierRenderSemanticRoot(source, {docKind: 'markdown'});
      await globalThis.RapierEmbeddedImages.materialize(root, source, null, {compat: false, signal});
    }
    const index = assets.documentAssets(source), labels = new Map(), held = new Set(), issues = [];
    const poster = async image => {
      const label = await renderer().objectPosterLabel(image); labels.set(image, label);
      const row = index.assets.get(assets.normalizeLabel(label));
      if (!row || index.duplicateLabels.has?.(assets.normalizeLabel(label)) || row.codec !== 'image/png') return null;
      const match = /^object-poster-v1 (sampled|animation-box|unavailable-box) ([1-9]\d*)x([1-9]\d*)$/.exec(row.title);
      if (!match) return null;
      const {bytes, codec} = assets.decodeDataImageBytes(row.url), size = assets.imageDimensions(bytes, codec);
      if (size.width !== +match[2] || size.height !== +match[3] || size.width * size.height > 1048576) return null;
      held.add(label); return {url: row.url, contour: match[1], width: size.width, height: size.height};
    };
    await renderer().materializeObjects(root, {signal, poster, bestEffort: !strict, issues});
    let next = source, missing = 0;
    const appended = [];
    for (const [image, label] of labels) {
      signal?.throwIfAborted();
      if (!image.hasAttribute('data-rapier-animation') && image.dataset.rapierContour !== 'animation-box') continue;
      const url = image.dataset.rapierFirstFrame;
      if (held.has(label)) continue;
      if (!url?.startsWith('data:image/png;base64,') || url.length > 4 * 1024 * 1024) {missing++; continue;}
      if (index.references[assets.normalizeLabel(label)]) throw new Error('An object poster label conflicts with the captured source. The definition is unchanged.');
      const {bytes, codec} = assets.decodeDataImageBytes(url), size = assets.imageDimensions(bytes, codec);
      const contour = image.dataset.rapierContour === 'sampled' ? 'sampled' : 'animation-box';
      const asset = {id: assets.normalizeLabel(label), label, url, title: 'object-poster-v1 ' + contour + ' ' + size.width + 'x' + size.height};
      next = assets.appendAssetText(next, asset, undefined, {preserveLabel: true}).source; appended.push(asset);
    }
    lastIssues = issues;
    return {source: next, root, issues, appended, missing};
  }
  async function posterSplices(before, splices, object, {signal} = {}) {
    if (rapier.document.docKind !== 'markdown') return [];
    let candidate = before, delta = 0, last = 0;
    for (const row of splices.toSorted((a, b) => b.pos - a.pos)) candidate = candidate.slice(0, row.pos) + row.inserted + candidate.slice(row.pos + row.removed.length);
    for (const row of splices) {delta += row.inserted.length - row.removed.length; last = Math.max(last, row.pos + row.removed.length);}
    try {
      const result = await materialize(object, {signal}), assets = globalThis.RapierImageAssets;
      if (result.missing) return null;
      let next = candidate;
      for (const asset of result.appended) if (!assets.documentAssets(next).assets.has(asset.id)) next = assets.appendAssetText(next, asset, undefined, {preserveLabel: true}).source;
      if (next === candidate) return [];
      const row = next.startsWith(candidate) ? {pos: candidate.length, removed: '', inserted: next.slice(candidate.length)}
        : _rapierPrefixSuffixDiff(candidate, next), pos = row.pos - delta;
      return pos >= last ? [{...row, pos}] : null;
    } catch (error) { if (error?.name === 'AbortError') throw error; return null; }
  }
  return {materialize, posterSplices, issues: () => lastIssues.slice()};
})();
