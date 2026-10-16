// SPDX-License-Identifier: AGPL-3.0-only
import {createMarkdownRenderer} from '../kit/render-markdown.mjs';
import {parseMarkdownWork} from '../kit/parse-work.mjs';
import {createRenderer} from '../kit/render.mjs';
import {createPandocDialect} from './export-dialect.mjs';
import {_rapierLineStartOffsets, _rapierSourceLineSpan} from './source-facts.mjs';
import {RAPIER_MARKDOWN_SPEC, RAPIER_HIGHLIGHT_COLORS, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter, sourceCharEscaped, parseInkBody, fontFamilyCss, typography} from '../agent/markdown-spec.mjs';
import {installMarkdownImages, dataImage} from '../spec/md-assets.mjs';
import {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle, layoutTargets} from '../layout/markdown.mjs';

export function installExportWorker(scope) {
  const work = {signal: scope.signal, yield: scope.yield || (() => Promise.resolve())};
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
  scope.RapierMarkdownSpec = {parseInkBody, fontFamilyCss, typography};
  scope.RapierImageAssets = {installMarkdownImages, configureParser() {}, dataImage};
  scope.RapierMarkdownLayout = {installMarkdownLayout, parseLayout, parseLayoutAttribute, imageStyle, layoutTargets};
  const owner = createMarkdownRenderer(runtime);
  owner.initMarkdownIt();
  const parser = owner.parser();
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
  const parse = async (source, env) => {
    const tokens = await parseMarkdownWork(parser, source, env, work);
    scope.postMessage({progress: 1});
    return tokens;
  };
  let serial = Promise.resolve();
  scope.onmessage = event => { serial = serial.then(() => receive(event)); return serial; };
  const receive = async event => {
    work.signal?.throwIfAborted();
    try {
      let data = event.data || {};
      if (data.next) { if (tokens || value !== null) send(); return; }
      if (data.operation === 'begin') { input = data; parts = []; return; }
      if (data.operation === 'part') { if (input) parts.push(data.text); return; }
      if (data.operation === 'finish') { if (!input) return; data = {...input, source: parts.join('')}; parts = []; input = null; }
      const source = String(data.source || '');
      at = 0;
      if (data.kind === 'pandoc' || data.kind === 'semantic-markdown') {
        const body = splitOpeningFrontmatter(source).body, blocks = await parse(body, {});
        let completed = 0, last = performance.now();
        const dialect = createPandocDialect(parser, size => {
          completed += size;
          if (performance.now() - last >= 24) {
            last = performance.now(); scope.postMessage({fraction: .3 + .4 * completed / Math.max(1, body.length)});
          }
        });
        value = data.kind === 'semantic-markdown' ? dialect.semanticText(source) : dialect.exportText(source, blocks);
        scope.postMessage({value: true}); return;
      }
      if (data.kind === 'destinations') {
        const reader = createRenderer({globalThis: scope, md: parser, _rapierLineStartOffsets, _rapierSourceLineSpan,
          _rapierSourceCharEscaped: sourceCharEscaped, _rapierMarkdownEnvironment: () => ({})});
        scope.postMessage({result: reader._rapierImageDestinations(source, url => !!dataImage(url))}); return;
      }
      const env = data.page ? {rapierPage: true} : {};
      tokens = await parse(source, env);
      if (env.footnotes?.list) env.footnotes.list = env.footnotes.list.map(({tokens, ...note}) => note);
      delete env.__rapierInlineCandidates;
      delete env.__rapierFootnoteDefinitions;
      scope.postMessage({env, count: tokens.length});
    } catch (error) { scope.postMessage({error: String(error?.message || error)}); }
  };
}
