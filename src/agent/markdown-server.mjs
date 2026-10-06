import markdownit from './vendor/markdownit.mjs';
import {markdownPlugins} from './vendor/markdown-plugins.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter} from './markdown-spec.mjs';
import {configureParser, installMarkdownImages} from '../images/assets.mjs';
import {outlineMarkdown} from './markdown.mjs';
import {changedReferenceRegion} from './references.mjs';

const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
installMarkdownMath(parser, RAPIER_MARKDOWN_SPEC.rules.mathBlock);
installMarkdownImages(parser);
configureParser(parser, splitOpeningFrontmatter);
export const checkMarkdownReferences = (before, after, regions) => changedReferenceRegion(before, after, regions, parser);

export function analyzeMarkdown(input) {
  input.signal?.throwIfAborted();
  const value = outlineMarkdown(input.text, {limit: input.limit}, parser);
  input.signal?.throwIfAborted();
  return value;
}
