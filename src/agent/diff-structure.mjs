// SPDX-License-Identifier: AGPL-3.0-only
import {markdown} from '../packages/rapier-diff/markdown.mjs';
import {js} from '../packages/rapier-diff/js.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter} from './markdown-spec.mjs';
import {configureParser, installMarkdownImages, markdownParser} from '../spec/md-assets.mjs';

export function diffStructure(source, options = {}) {
  const code = options.code || (globalThis.acorn ? js(globalThis.acorn) : null);
  if (options.docKind === 'code') {
    return code && /^(?:js|javascript|mjs|cjs|ecmascript|html|htm)$/i.test(options.language || '')
      ? code(source) : {parts: [], links: []};
  }
  if (options.docKind && options.docKind !== 'markdown') return {parts: [], links: []};
  return markdown(markdownParser(options.parserFactory), {code})(source);
}

export function installDiffStructureWorker(scope) {
  const parser = applyMarkdownSpec(scope.markdownit(RAPIER_MARKDOWN_SPEC.options), scope);
  installMarkdownMath(parser, RAPIER_MARKDOWN_SPEC.rules.mathBlock);
  installMarkdownImages(parser);
  configureParser(parser, splitOpeningFrontmatter);
  scope.RapierDiffStructure = {diffStructure};
}
