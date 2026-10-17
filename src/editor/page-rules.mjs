// SPDX-License-Identifier: AGPL-3.0-only
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter} from '../agent/markdown-spec.mjs';
import {configureParser, installMarkdownImages} from '../images/assets.mjs';
import {outlineMarkdown, structureMarkdown} from '../agent/markdown.mjs';
import {changedReferenceRegion} from '../agent/references.mjs';
import {structureRequest} from '../agent/structure-request.mjs';

export function createPageRules({markdownit, plugins, structureJob}) {
  if (typeof markdownit !== 'function' || typeof structureJob !== 'function') throw new TypeError('page_rules_unavailable');
  const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), plugins);
  installMarkdownMath(parser, RAPIER_MARKDOWN_SPEC.rules.mathBlock);
  installMarkdownImages(parser);
  configureParser(parser, splitOpeningFrontmatter);
  return Object.freeze({
    analyzeMarkdown(input) {
      input.signal?.throwIfAborted();
      const value = outlineMarkdown(input.text, {limit: input.limit}, parser);
      input.signal?.throwIfAborted();
      return value;
    },
    checkMarkdownReferences: (before, after, regions) => changedReferenceRegion(before, after, regions, parser),
    async analyzeDocument(input) {
      input.signal?.throwIfAborted();
      const request = structureRequest(input);
      if (!request) return {ok: false, complete: false, status: 'unavailable', reason: 'structure_unavailable'};
      let result = request.kind === 'markdown' ? structureMarkdown(request, parser) : await structureJob(request, input.signal);
      input.signal?.throwIfAborted();
      if (request.kind !== 'markdown' && result?.budget?.used && result.budget.used.resultBytes !== 0)
        result = {...result, budget: {...result.budget, used: {...result.budget.used, resultBytes: 0}}};
      return result;
    },
  });
}
