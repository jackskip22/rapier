// SPDX-License-Identifier: MIT
// SVG glyphs, TeX packages and chemistry belong to the payload. The synchronous Markdown
// renderer cannot suspend an equation to download a font range or an extension.
export function createMathRenderer({mathjax, TeX, SVG, liteAdaptor, RegisterHTMLHandler, SafeHandler, Safe,
  MathJaxNewcmFont, fontExtensions, Loader, loaderConfig, dependencies, packages, version}) {
  const missing = name => { throw new Error('Math resource is not bundled: ' + name); };
  mathjax.asyncLoad = missing;
  loaderConfig.require = missing;
  loaderConfig.dependencies = dependencies;
  Loader.preLoaded('core', 'input/tex-base', ...packages.map(name => '[tex]/' + name));
  for (const extension of fontExtensions) MathJaxNewcmFont.addExtension(extension);
  const font = new MathJaxNewcmFont();
  for (const range of Object.values(MathJaxNewcmFont.dynamicFiles)) {
    range.setup(font);
    if (range.failed) throw new Error('Math font range is not bundled: ' + range.file);
    range.promise = Promise.resolve();
  }
  const adaptor = liteAdaptor();
  SafeHandler(RegisterHTMLHandler(adaptor));
  class MathSafe extends Safe {
    constructor(...args) {
      super(...args);
      // URL parsing covers controls inside a protocol as the browser does.
      this.filterMethods.filterURL = (_safe, value) => {
        try {
          const url = new URL(value, 'https://rapier.invalid/');
          return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
        } catch (_) { return null; }
      };
    }
    sanitizeNode(node) {
      const attributes = node.attributes.getAllAttributes();
      // TeX's data macro uses the same admission as MathML data attributes.
      for (const name of Object.keys(attributes)) {
        if (name.startsWith('data-') && this.mmlAttribute(name, attributes[name]) === null) delete attributes[name];
      }
      super.sanitizeNode(node);
    }
  }
  const tex = new TeX({
    packages: ['base', 'ams', 'newcommand', 'textmacros', 'require', 'autoload', 'configmacros', 'mhchem'],
    require: {defaultAllow: false, allow: Object.fromEntries(packages
      .filter(name => !['base', 'autoload', 'configmacros', 'tagformat'].includes(name)).map(name => [name, true]))},
  });
  const document = mathjax.document('', {InputJax: tex, SafeClass: MathSafe,
    // A cursor can name a remote image; an equation never supplies that resource.
    safeOptions: {safeProtocols: {file: false}, safeStyles: {cursor: false}},
    OutputJax: new SVG({fontData: font, fontCache: 'none', linebreaks: {inline: false}})});
  return Object.freeze({version, renderToString(source, options = {}) {
    const text = String(source ?? '');
    for (let retry = 0; ; retry++) {
      try {
        const node = document.convert(text, {display: !!options.displayMode});
        const svg = adaptor.tags(node, 'svg')[0];
        if (!svg) throw new Error('Math renderer did not produce SVG');
        adaptor.setAttribute(svg, 'aria-label', text);
        return adaptor.serializeXML(svg);
      } catch (error) {
        // A preloaded TeX package can add a preprocessor while parsing \require. Its
        // registration is synchronous; restart the expression with that processor active.
        if (!error.retry || retry >= packages.length) throw error;
      }
    }
  }});
}
