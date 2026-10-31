// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import parseCSS from './vendor/postcss-parse.cjs';
import {packStyleWhitespace, stripStyleComments, inlineFonts} from './style-text.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WHOLE = ['spec/markdown-style.css', 'editor/styles/rapier-highlight.css'];
const CUT = ['editor/styles/rapier-app.css', 'editor/styles/rapier-editor.css', 'editor/styles/rapier-source.css', 'editor/styles/rapier-info.css'];

function needs(selector) {
	if (selector.includes('\\')) return [];
	let text = selector.replace(/"[^"]*"|'[^']*'/g, '""');
	for (let before = ''; before !== text;) { before = text; text = text.replace(/:{1,2}[\w-]+\([^()]*\)/g, ''); }
	const found = [];
	for (const match of text.matchAll(/\[\s*([^\]=~|^$*\s]+)/g)) found.push(match[1]);
	text = text.replace(/\[[^\]]*\]/g, '');
	for (const match of text.matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)) found.push(match[1]);
	return found;
}

export async function readerStyles({vocabulary, tokens, reader}) {
	const prefixes = [...vocabulary].filter(word => /[-_]$/.test(word) && word.length >= 6 && /[A-Za-z]{3,}/.test(word) &&
		!/^u[0-9a-f]{2,}-$/i.test(word) && !/^x[0-9a-f]+-$/i.test(word) && (word.split('-').length > 2 || word.length >= 16));
	const known = name => vocabulary.has(name) || prefixes.some(prefix => name.startsWith(prefix));
	const report = {};
	const parts = [];
	for (const path of WHOLE) parts.push(packStyleWhitespace(inlineFonts(stripStyleComments(readFileSync(resolve(root, path), 'utf8')), path)));
	for (const path of CUT) {
		const tree = parseCSS(stripStyleComments(readFileSync(resolve(root, path), 'utf8')), {from: 'rapier-build.css'});
		let rules = 0, kept = 0;
		tree.walkRules(rule => {
			if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
			rules++;
			const selectors = rule.selectors.filter(selector => needs(selector).every(known));
			if (!selectors.length) { rule.remove(); return; }
			kept++;
			if (selectors.length !== rule.selectors.length) rule.selector = selectors.join(',');
		});
		for (let again = true; again;) {
			again = false;
			tree.walkAtRules(atRule => {
				if (!/^(media|supports|container|layer)$/i.test(atRule.name) || atRule.nodes?.length) return;
				atRule.remove(); again = true;
			});
		}
		const used = new Set();
		tree.walkDecls(decl => { if (/^(?:-webkit-)?animation(?:-name)?$/.test(decl.prop)) for (const word of decl.value.match(/[A-Za-z_][\w-]*/g) || []) used.add(word); });
		tree.walkAtRules(atRule => { if (/keyframes$/i.test(atRule.name) && !used.has(atRule.params)) atRule.remove(); });
		const text = packStyleWhitespace(tree.toString());
		report[path] = {rules, kept, bytes: text.length};
		parts.push(text);
	}
	parts.push(packStyleWhitespace(tokens), packStyleWhitespace(stripStyleComments(reader)));
	return {text: parts.join('\n'), report};
}
