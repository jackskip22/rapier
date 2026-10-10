// SPDX-License-Identifier: AGPL-3.0-only
// Parsing keeps the whole document's references and footnotes in one realm.
import {createMarkdownRenderer} from '../kit/render-markdown.mjs';
import {createRenderer} from '../kit/render.mjs';
import {createPandocDialect} from './export-dialect.mjs';
import {_rapierLineStartOffsets, _rapierSourceLineSpan} from './source-facts.mjs';
import {RAPIER_MARKDOWN_SPEC, RAPIER_HIGHLIGHT_COLORS, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter, sourceCharEscaped, parseInkBody} from '../agent/markdown-spec.mjs';
import {installMarkdownImages, configureParser, dataImage} from '../spec/md-assets.mjs';
import {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle} from '../layout/markdown.mjs';

export function installExportWorker(scope) {
  const runtime = {
    window: scope, globalThis: scope,
    RAPIER_MARKDOWN_SPEC: RAPIER_MARKDOWN_SPEC,
    RAPIER_HIGHLIGHT_COLOR_BY_MARKER: Object.fromEntries(Object.entries(RAPIER_HIGHLIGHT_COLORS).map(([color, marker]) => [marker, color])),
    _rapierApplyMarkdownSpec: applyMarkdownSpec,
    _rapierInstallMarkdownMath: installMarkdownMath,
    _rapierSplitOpeningFrontmatter: splitOpeningFrontmatter,
    _rapierSourceCharEscaped: sourceCharEscaped,
    _rapierHighlightAdmitted: () => false,
    _rapierProviders: {math: null, mermaid: null},
  };
  scope.RapierMarkdownSpec = {parseInkBody};
  scope.RapierImageAssets = {installMarkdownImages, configureParser, dataImage};
  scope.RapierMarkdownLayout = {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle};
  const owner = createMarkdownRenderer(runtime);
  owner.initMarkdownIt();
  const parser = owner.parser();
  const inlineParse = parser.inline.parse;
  let inlineProgress = null, inlineDepth = 0;
  parser.inline.parse = function (source, ...args) {
    const outer = inlineDepth++ === 0;
    try { return inlineParse.call(this, source, ...args); }
    finally {
      inlineDepth--;
      if (outer && inlineProgress) {
        inlineProgress.done += source.length;
        if (performance.now() - inlineProgress.last >= 24) {
          inlineProgress.last = performance.now();
          scope.postMessage({progress: (inlineProgress.index + Math.min(1, inlineProgress.done / (inlineProgress.total || 1))) / inlineProgress.rules});
        }
      }
    }
  };
  let tokens = null, value = null, input = null, parts = [], at = 0;
  const weight = token => (token.content?.length || 0) + (token.attrs || []).reduce((sum, pair) => sum + String(pair[1]).length, 0) +
    (token.children || []).reduce((sum, child) => sum + weight(child), 0);
  const send = () => {
    if (value !== null) {
      if (at >= value.length) { scope.postMessage({done: true, value: true}); value = null; return; }
      const start = at; at = Math.min(value.length, at + 65536);
      scope.postMessage({text: value.slice(start, at), fraction: at / value.length}); return;
    }
    if (at >= tokens.length) { scope.postMessage({done: true}); tokens = null; return; }
    const start = at; let chars = 0;
    do { chars += weight(tokens[at++]); } while (at < tokens.length && at - start < 128 && chars < 16384);
    scope.postMessage({tokens: tokens.slice(start, at), fraction: at / tokens.length});
  };
  const parse = (source, env) => {
    const state = new parser.core.State(source, parser, env);
    const rules = parser.core.ruler.__rules__.filter(rule => rule.enabled);
    for (let index = 0; index < rules.length; index++) {
      inlineProgress = rules[index].name === 'inline' ? {index, rules: rules.length, done: 0, last: performance.now(),
        total: state.tokens.reduce((sum, token) => sum + (token.type === 'inline' ? token.content.length : 0), 0)} : null;
      rules[index].fn(state);
      inlineProgress = null;
      scope.postMessage({progress: (index + 1) / rules.length});
    }
    return state.tokens;
  };
  scope.onmessage = event => {
    try {
      let data = event.data || {};
      if (data.next) { if (tokens || value !== null) send(); return; }
      if (data.operation === 'begin') { input = data; parts = []; return; }
      if (data.operation === 'part') { if (input) parts.push(data.text); return; }
      if (data.operation === 'finish') { if (!input) return; data = {...input, source: parts.join('')}; parts = []; input = null; }
      const source = String(data.source || '');
      at = 0;
      if (data.kind === 'pandoc') {
        const body = splitOpeningFrontmatter(source).body, blocks = parse(body, {});
        let completed = 0, last = performance.now();
        value = createPandocDialect(parser, size => {
          completed += size;
          if (performance.now() - last >= 24) {
            last = performance.now(); scope.postMessage({fraction: .3 + .4 * completed / Math.max(1, body.length)});
          }
        }).exportText(source, blocks);
        scope.postMessage({value: true}); return;
      }
      if (data.kind === 'destinations') {
        const reader = createRenderer({md: parser, _rapierLineStartOffsets, _rapierSourceLineSpan,
          _rapierSourceCharEscaped: sourceCharEscaped, _rapierMarkdownEnvironment: () => ({})});
        scope.postMessage({result: reader._rapierImageDestinations(source, url => !!dataImage(url))}); return;
      }
      const env = data.page ? {rapierPage: true} : {};
      tokens = parse(source, env);
      // The renderer needs labels and counts, not the footnotes' retained parse trees.
      if (env.footnotes?.list) env.footnotes.list = env.footnotes.list.map(({tokens, ...note}) => note);
      delete env.__rapierInlineCandidates;
      delete env.__rapierFootnoteDefinitions;
      scope.postMessage({env, count: tokens.length});
    } catch (error) { scope.postMessage({error: String(error?.message || error)}); }
  };
}
