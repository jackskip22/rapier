// Execute the editor's actual parser installer in Node, with its UI/render callbacks uncalled.
// This checks parser acceptance, not a browser, Open/Save, DOM rendering or parse-worker budgets.
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {declarations} from '../check-satellite-support.mjs';
import markdownit from '../../agent/vendor/markdownit.mjs';
import {markdownPlugins} from '../../agent/vendor/markdown-plugins.mjs';
import * as colourMath from '../../editor/colour-math.mjs';
import {RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter} from '../../agent/markdown-spec.mjs';
import * as RapierMarkdownSpec from '../../agent/markdown-spec.mjs';
import {installMarkdownImages, dataImage} from '../../images/assets.mjs';
import * as markdownLayout from '../../layout/markdown.mjs';
import {createMarkdownRenderer} from '../../kit/render-markdown.mjs';

// Only the immutable authored program is shared. Every call installs a new parser and
// colour cache in its own context, so one cell's rules cannot change the next cell.
// The parser installer is the kit's factory (kit/render-markdown.mjs, the same owner the page binds); only the
// colour derivation still comes from the engine.
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
    RapierImageAssets: {installMarkdownImages, dataImage, configureParser(parser) { context.parser = parser; }},
    _rapierEmbed: {active: false}, // No connected host: a picture resolves through the person's own assets.
    ...bindings,
  };
  installer.runInNewContext(context, {timeout: 2000});
  createMarkdownRenderer({...context, globalThis: context}).initMarkdownIt();
  if (!context.parser?.parse) throw new Error('editor installer did not publish its parser');
  return context.parser;
}

export function acceptanceFingerprint(tokens) {
  return tokens.map(token => ({type: token.type, tag: token.tag, nesting: token.nesting,
    content: token.content, markup: token.markup, map: token.map,
    ...(token.children ? {children: acceptanceFingerprint(token.children)} : {})}));
}
