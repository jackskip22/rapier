// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Jack Skipworth. See LICENSE-MIT.
import {markdownItConstructor} from '../agent/vendor/markdown-runtime.mjs';
import {createMarkdownPlugins} from '../agent/vendor/markdown-plugins.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath} from './md-parser-config.mjs';
import {configuredMarkdownParser, configureParser, installMarkdownImages} from './md-assets.mjs';
import {splitOpeningFrontmatter} from './frontmatter.mjs';

let owned = null;
const parserMath = Object.freeze({ceil: Math.ceil, random() {
  throw new Error('Markdown task labels need a rendering context.');
}});
export function ensureMarkdownParser() {
  const configured = configuredMarkdownParser();
  if (configured) return configured;
  if (!owned) {
    owned = applyMarkdownSpec(markdownItConstructor()(RAPIER_MARKDOWN_SPEC.options), createMarkdownPlugins(parserMath));
    installMarkdownMath(owned, RAPIER_MARKDOWN_SPEC.rules.mathBlock);
    installMarkdownImages(owned);
  }
  configureParser(owned, splitOpeningFrontmatter);
  return owned;
}
