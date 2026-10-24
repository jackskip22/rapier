import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {declarations} from '../check-satellite-support.mjs';
import markdownit from '../../agent/vendor/markdownit.mjs';
import {markdownPlugins} from '../../agent/vendor/markdown-plugins.mjs';
import * as colourMath from '../../editor/colour-math.mjs';
import {RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter} from '../../agent/markdown-spec.mjs';
import * as RapierMarkdownSpec from '../../agent/markdown-spec.mjs';
import {installMarkdownImages, dataImage, imagePlaceholderDimensions} from '../../images/assets.mjs';
import * as markdownLayout from '../../layout/markdown.mjs';
import {createMarkdownRenderer} from '../../kit/render-markdown.mjs';

const installer = new Script(declarations(
  readFileSync(new URL('../../editor/engine.js', import.meta.url), 'utf8'),
  ['_rapierDeriveDarkColor', '_rapierEmbedAssetSource']));
export function editorAcceptanceParser(bindings = {}) {
  const context = {
    ...colourMath, _rapierDeriveDarkColorCache: new Map(),
    RAPIER_HIGHLIGHT_COLOR_BY_MARKER: Object.fromEntries(Object.entries(RAPIER_HIGHLIGHT_COLORS).map(([color,marker]) => [marker,color])),
    window: {markdownit, ...markdownPlugins},
    RAPIER_MARKDOWN_SPEC,
    RapierMarkdownSpec,
    _rapierApplyMarkdownSpec: applyMarkdownSpec,
    _rapierInstallMarkdownMath: installMarkdownMath,
    _rapierSplitOpeningFrontmatter: splitOpeningFrontmatter,
    RapierMarkdownLayout: markdownLayout,
    RapierImageAssets: {installMarkdownImages, dataImage, imagePlaceholderDimensions, configureParser(parser) { context.parser = parser; }},
    _rapierEmbed: {active: false},
    ...bindings,
  };
  installer.runInNewContext(context, {timeout: 2000});
  createMarkdownRenderer({...context, globalThis: context}).initMarkdownIt();
  if (!context.parser?.parse) throw new Error('editor installer did not publish its parser');
  return context.parser;
}

// The editor shows an escaped character as its own token (`rapier_escape`, kit/render-markdown.mjs) where the agent's grammar
export function acceptanceFingerprint(tokens) {
  const rows = [];
  for (const token of tokens) {
    const row = token.type === 'rapier_escape'
      ? {type: 'text', tag: '', nesting: 0, content: token.content, markup: '', map: token.map}
      : {type: token.type, tag: token.tag, nesting: token.nesting, content: token.content, markup: token.markup, map: token.map,
        ...(token.children ? {children: acceptanceFingerprint(token.children)} : {})};
    const last = rows.at(-1);
    if (row.type === 'text' && last?.type === 'text' && !row.children && !last.children) last.content += row.content;
    else rows.push(row);
  }
  return rows;
}
