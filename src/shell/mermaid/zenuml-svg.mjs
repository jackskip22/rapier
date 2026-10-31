// SPDX-License-Identifier: AGPL-3.0-only
// ZenUML's own SVG renderer, taken from its published command-line build (the same renderToSvg that ZenUML's library
// exports, without its React editor or its cloud-icon set). The recipe preserves authored widths, ink/styles and ref labels
// where the command-line renderer drops them. Other geometry remains upstream's. Rapier's font and
// theme tokens replace the default type and fixed colors, so each line, icon and label follows light and dark.
// Each patch names the exact upstream text it replaces and must
// apply exactly as many times as stated, so a different upstream build is refused instead of drawn half-themed.
import {createHash} from 'node:crypto';

export const CLI_PATH = '@zenuml/core/dist/cli/zenuml.mjs';
export const CLI_SHA256 = '26189ae1b160d54556369d3cfa0acb33dd0d8bd7365fe92945ac4209417b2748';
export const FONT_FAMILY = 'Geist, system-ui, sans-serif';

// Rapier's tokens (spec/markdown-style.css). Lines and icons stay at least 3:1 against the page in both themes; words at
// least 4.5:1 against what lies behind them; tints that sit behind words are grounds, as in ZenUML. A message number's
// badge is opaque (ZenUML's tint over the page) because ZenUML can place a number over an activation bar.
const ink = 'var(--md-color-text)', page = 'var(--md-color-bg)', line = 'var(--md-mermaid-border)';
const muted = 'var(--md-mermaid-muted)', tint = 'var(--md-mermaid-grid)';
const mix = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;
const font = `font-family: ${FONT_FAMILY};`;
export const STYLES = `
  .frame-border-outer { fill: ${line}; }
  .frame-border-inner { fill: ${page}; }
  .frame-header-line { stroke: ${line}; stroke-width: 1; shape-rendering: crispEdges; }
  .frame-title { ${font} font-size: 14px; font-weight: 400; fill: ${ink}; }
  .participant-box { fill: ${page}; stroke: ${line}; stroke-width: 1; }
  .participant-label, .stereotype-label { ${font} font-size: 14px; fill: ${ink}; }
  .participant-icon { color: ${ink}; }
  .participant-icon [fill="currentColor"]:not([stroke]) { stroke: currentColor; stroke-width: 1; }
  .lifeline { stroke: ${line}; stroke-width: 1; }
  .message, .creation, .fragment { color: ${ink}; }
  .message-line { stroke: ${ink}; stroke-width: 1; shape-rendering: crispEdges; }
  .message-label { ${font} font-size: 15px; fill: ${ink}; }
  .arrow-head { fill: ${ink}; stroke: ${ink}; stroke-width: 1; }
  .arrow-open { fill: none; }
  .occurrence { fill: ${tint}; stroke: ${line}; stroke-width: 1; shape-rendering: crispEdges; }
  .fragment-border { fill: none; stroke: ${line}; stroke-width: 1; }
  .fragment-header { fill: ${mix(tint, 50)}; stroke: none; shape-rendering: crispEdges; }
  .fragment-number-bg { fill: ${mix(muted, 12)}; stroke: none; }
  .message-number-bg { fill: color-mix(in srgb, ${muted} 12%, ${page}); stroke: none; }
  .fragment-label { ${font} font-size: 14px; font-weight: 400; font-variant-caps: all-small-caps; fill: ${ink}; }
  .fragment-condition { ${font} font-size: 14px; fill: ${ink}; }
  .fragment-separator { stroke: ${line}; stroke-width: 1; shape-rendering: crispEdges; }
  .fragment-section-keyword { font-variant-caps: all-small-caps; }
  .fragment-section-label { ${font} font-size: 14px; fill: ${ink}; }
  .fragment-knockout { fill: ${page}; }
  .return-line { stroke: ${ink}; stroke-width: 1; stroke-dasharray: 6,4; shape-rendering: crispEdges; }
  .return-arrow { stroke: ${ink}; stroke-width: 1; fill: none; }
  .return-label { ${font} font-size: 15px; fill: ${ink}; }
  .return-icon { fill: ${ink}; }
  .divider-line { stroke: var(--md-mermaid-series-6); stroke-width: 1; }
  .divider-bg { fill: var(--md-mermaid-tint-6); stroke: var(--md-mermaid-series-6); stroke-width: 1; }
  .divider-label { ${font} font-size: 14px; fill: ${ink}; }
  .comment-text { ${font} font-size: 14px; fill: ${muted}; }
  .guard-keyword { ${font} font-size: 12px; font-weight: 400; font-variant-caps: all-small-caps; fill: ${muted}; }
  .seq-number { ${font} font-size: 12px; font-weight: 400; fill: ${muted}; }
  .group-outline { fill: none; stroke: ${line}; }
  .group-title-bg { fill: ${page}; stroke: none; }
  .group-title-text { ${font} font-size: 13px; font-weight: 400; fill: ${ink}; }
`;

const sha = text => createHash('sha256').update(text).digest('hex');
const between = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (from < 0 || to < 0 || source.indexOf(start, from + 1) >= 0) throw new Error('ZenUML renderer: marker not found once: ' + start);
  return [from, to];
};

// [name, upstream text, replacement, times]
const PATCHES = [
  ['no Node file access', "import { readFileSync, statSync, mkdirSync, writeFileSync, watch } from 'node:fs';\n", '', 1],
  ['no Node paths', "import { resolve, join, dirname, basename, extname } from 'node:path';\n", '', 1],
  ['Rapier type', 'const DIAGRAM_FONT_STACK = `"${IBM_PLEX_SANS_FAMILY}", Helvetica, Verdana, serif`;', 'const DIAGRAM_FONT_STACK = ' + JSON.stringify(FONT_FAMILY) + ';', 1],
  ['no IBM Plex face', 'const IBM_PLEX_SANS_FONT_FACE_CSS = `@font-face { font-family: "${IBM_PLEX_SANS_FAMILY}"; font-weight: 400; font-style: normal; src: url(${IBM_PLEX_SANS_400_DATA_URI}) format("woff2"); }`;', 'const IBM_PLEX_SANS_FONT_FACE_CSS = "";', 1],
  ['ink strokes follow the theme', 'stroke="#000"', 'stroke="currentColor"', 12],
  ['ink fills follow the theme', 'fill="#000"', 'fill="currentColor"', 3],
  ['filled arrowheads follow the theme', 'isFilled ? "#000" : "none"', 'isFilled ? "currentColor" : "none"', 1],
  ['self-call heads follow the theme', 'isAsync ? "none" : "#000"', 'isAsync ? "none" : "currentColor"', 1],
  ['section label grounds are the page', 'height="20" fill="#fff"/>', 'height="20" class="fragment-knockout"/>', 1],
  ['finally label grounds are the page', 'height="${bgHeight}" fill="#fff"/>', 'height="${bgHeight}" class="fragment-knockout"/>', 1],
  ['section words follow the theme', 'class="fragment-section-label fragment-section-keyword" fill="#222">', 'class="fragment-section-label fragment-section-keyword">', 1],
  ['stereotypes take the names\' color', 'class="stereotype-label" font-size="${STEREOTYPE_FONT_SIZE}"${participantTextStyle()}>', 'class="stereotype-label" font-size="${STEREOTYPE_FONT_SIZE}"${participantTextStyle(p.color)}>', 1],
  ['section conditions follow the theme', 'class="fragment-section-label" fill="#222">', 'class="fragment-section-label">', 1],
  ['participant models carry authored widths',
    'constructor(name, left, label, type, stereotype, color, groupId, emoji) {\n    this.name = name;',
    'constructor(name, left, label, type, stereotype, color, groupId, emoji, width) {\n    this.width = width;\n    this.name = name;', 1],
  ['parser widths reach participant models',
    'participant.groupId,\n      participant.emoji\n    );',
    'participant.groupId,\n      participant.emoji,\n      participant.width\n    );', 1],
  ['authored widths reserve participant space',
    'const participantWidth = Math.max(labelWidth + iconWidth + emojiWidth, MIN_PARTICIPANT_WIDTH) + MARGIN;',
    'if (participant.width != null && (!Number.isSafeInteger(participant.width) || participant.width <= 0)) throw new Error("ZenUML participant width must be a positive safe integer");\n    const participantWidth = (participant.width ?? Math.max(labelWidth + iconWidth + emojiWidth, MIN_PARTICIPANT_WIDTH)) + MARGIN;', 1],
  ['authored widths size participant boxes',
    'if (m.name === _STARTER_) width = Math.min(width, 80);',
    'if (m.width != null) width = m.width;\n    else if (m.name === _STARTER_) width = Math.min(width, 80);', 1],
  ['references display their authored label',
    'const label = ref.getFormattedText?.() || "";',
    'const label = ref.Content()?.getFormattedText?.() || "";', 1],
  ['authored backgrounds choose participant ink',
    'function participantTextStyle() {\n  return ` style="fill:${PARTICIPANT_TEXT_FILL};"`;\n}',
    'function participantInk(color) {\n  if (!color) return null;\n  let hex = normalizeHexColor(color).slice(1);\n  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return PARTICIPANT_TEXT_FILL;\n  if (hex.length <= 4) hex = [...hex.slice(0, 3)].map(c => c + c).join("");\n  const [r, g, b] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));\n  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#000" : "#fff";\n}\nfunction participantTextStyle(color) {\n  const ink = participantInk(color);\n  return ink ? ` style="fill:${ink};"` : "";\n}', 1],
  ['participant names use their authored-background ink',
    'textStyle: participantTextStyle()', 'textStyle: participantTextStyle(color)', 1],
  ['participant icons use their authored-background ink',
    'iconSvg = `<g class="participant-icon" transform="translate(${iconX}, ${iconY}) scale(${scale})"${iconAttrs}>',
    'iconSvg = `<g class="participant-icon" transform="translate(${iconX}, ${iconY}) scale(${scale})"${iconAttrs}${p.color ? ` style="color:${participantInk(p.color)};"` : ""}>', 1],
  ['explicit returns carry their authored styles',
    'isSelf: info.isSelf,\n        number: info.number\n      });\n      const returnBottomPad',
    'isSelf: info.isSelf,\n        number: info.number,\n        style: info.isSelf ? void 0 : messageStyle\n      });\n      const returnBottomPad', 1],
  ['return labels draw their authored styles',
    'text-anchor="middle" class="return-label">${esc(resolveEmojiInText(r.label))}',
    'text-anchor="middle" class="return-label"${r.style ? ` style="${styleToAttr(r.style)}"` : ""}>${esc(resolveEmojiInText(r.label))}', 1],
  ['fragment headers carry their authored styles',
    'fragments.push(fragmentResult.fragment);',
    'fragmentResult.fragment.style = info.fragmentKind === "opt" && commentObj ? cssToSvgStyle(commentObj.textStyle) : messageStyle;\n        fragments.push(fragmentResult.fragment);', 1],
  ['fragment keywords draw their authored styles',
    'class="fragment-label">${esc(kindLabel)}',
    'class="fragment-label"${f.style ? ` style="${styleToAttr(f.style)}"` : ""}>${esc(kindLabel)}', 1],
];
// ZenUML's stylesheet, replaced whole by STYLES; its text is pinned so a changed upstream palette is noticed.
const THEME_START = 'function buildThemeStyles(p) {', THEME_END = '\nconst FRAME_VIEWPORT_HEADER_ALLOWANCE';
export const THEME_SHA256 = '39c35f62498575a89d0020a9857337e7e3a479e8fff47fa2e1d3b9da27596f26';

export function rapierZenUMLRenderer(cli) {
  if (sha(cli) !== CLI_SHA256) throw new Error('ZenUML renderer: the command-line build is not the pinned ' + CLI_SHA256);
  let source = cli.slice(0, cli.indexOf('\nfunction readVersion() {'));
  if (source.length === cli.length || !source.includes('function renderToSvg(code, options)')) throw new Error('ZenUML renderer: the renderer was not found');
  const applied = [];
  for (const [name, from, to, times] of PATCHES) {
    const count = source.split(from).length - 1;
    if (count !== times) throw new Error('ZenUML renderer: ' + name + ' applies ' + count + ' times, not ' + times);
    source = source.replaceAll(from, to); applied.push(name);
  }
  const [start, end] = between(source, THEME_START, THEME_END), upstreamTheme = source.slice(start, end);
  if (sha(upstreamTheme) !== THEME_SHA256) throw new Error('ZenUML renderer: its stylesheet changed');
  source = source.slice(0, start) + 'function buildThemeStyles(p) {\n  return ' + JSON.stringify(STYLES) + ';\n}\n' + source.slice(end);
  applied.push('Rapier theme');
  return {source: source + '\nexport { renderToSvg, validate };\n', applied, themeSha256: sha(upstreamTheme)};
}
