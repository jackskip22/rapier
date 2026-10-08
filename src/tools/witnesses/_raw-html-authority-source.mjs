// SPDX-License-Identifier: AGPL-3.0-only
// Authored HTML cannot manufacture editor controls.
import assert from 'node:assert/strict';
import {editorAcceptanceParser} from './_exactness-browser-parser.mjs';

export function rawHtmlAuthoritySourceCells() {
  const parser = editorAcceptanceParser({
    sanitizeRapierHtml() { throw new Error('A raw fragment was independently parsed as a complete tree'); },
    _rapierChromeOwnsId: id => id === 'source-textarea',
  });
  const payloads = [
    '<details data-table-action="delete"><summary for="source-textarea">Title</summary>\n\nWords.\n\n</details>',
    '<div ID="&#115;ource-textarea" DATA-DRAW-ACT="clear" data-block-id="7">Words</div>',
    '<div id="&#x73;ource-textarea" data-rapier-batch="0" for=source-textarea>Words</div>',
    '<div data-block-id="1" data-block-id="2"><span data-draw-handle="e">Words</span></div>',
    '<div/data-table-action=delete>Words</div>',
    '<div title="a > b"\n data-table-action="delete">Words</div>',
    'Words <span data-draw-act="clear" id=source-textarea>here</span>.',
    '<!--><div data-draw-act="clear">Words</div>',
  ];
  const dangerous = /(?:\s|\/)(?:data-[a-z0-9_.:-]+|for)\s*=/i;
  for (const source of payloads) {
    const output = parser.render(source);
    // Encoded literal tags cannot bear attributes; inspect only actual HTML tokens.
    const state = new parser.inline.State(output, parser, {}, []);
    const rule = parser.inline.ruler.__rules__.find(entry => entry.name === 'html_inline').fn;
    while (state.pos < state.posMax) {
      if (output[state.pos] === '<' && rule(state, false)) {
        const tag = state.tokens.pop().content;
        if (!/^<[A-Za-z]/.test(tag)) continue;
        assert(!dangerous.test(tag), 'raw source retained an editor-control attribute');
        assert(!/\sid\s*=/i.test(tag), 'raw source retained a chrome-owned id');
      } else state.pos++;
    }
  }
  // Ordinary authored values and public anchors are document data, not authority.
  const title = 'the words data-table-action=delete are an example';
  const output = parser.render('<div id="section" title="' + title + '">Words</div>');
  assert(output.includes('id="section"') && output.includes('title="' + title + '"'), 'safe authored metadata changed');
  return 'raw fragments strip editor hooks and reserved ids; authored metadata and public anchors remain data';
}

export default function(_page, t) { return t.pass(rawHtmlAuthoritySourceCells()); }
