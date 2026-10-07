// SPDX-License-Identifier: AGPL-3.0-only
const _RAPIER_PASTE_PROSE_TARGET = 3200;
const _RAPIER_PASTE_PROSE_MAX    = 5200;

function _rapierPlainPasteLineKind(line) {
	const raw = String(line || '');
	const s = raw.trim();
	if (!s) return 'blank';
	if (/^(`{3,}|~{3,})/.test(s)) return 'fence';
	if (/^\$\$\s*$/.test(s)) return 'math-fence';
	if (/^(?:#{1,6}\s+|>\s?|(?:[-+*]|\d+[.)])\s+|(?:---+|___+|\*\s*\*\s*\*+)\s*$)/.test(s)) return 'markdown';
	if (/^(?:\[[^\]]+\]|\[\^[^\]]+\]):(?:\s*\S.*)?$/.test(s)) return 'definition';
	if (/^\|.*\|\s*$/.test(s) || /^\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(raw)) return 'table';
	if (/^(?:<\/?(?:details|summary|div|table|thead|tbody|tfoot|tr|th|td|pre|blockquote|ul|ol|li|h[1-6]|p)\b|\x3c!--)/i.test(s)) return 'html';
	if (/^(?: {4}|\t)\S/.test(raw)) return 'indented-code';
	return 'prose';
}

function _rapierPasteEndsSentence(line) {
	return /(?:[.!?…]|[。！？])(?:["'”’»）)\]}]*)$/.test(String(line || '').trim());
}
function _rapierPasteFirstCharacter(line) {
	const stripped = String(line || '')
		.trim()
		.replace(/^["'“‘«（([\{]+/u, '')
		.trimStart();
	const [first = ''] = stripped;
	return first;
}
function _rapierPasteStartsSentence(line) {
	const first = _rapierPasteFirstCharacter(line);
	return /[\p{Lu}\p{Lt}\p{N}]/u.test(first) ||
		(/\p{L}/u.test(first) && !/\p{Ll}/u.test(first));
}
function _rapierPasteLooksProse(text, minimumLength = 240) {
	const s = String(text || '');
	const compactScript = /[\u3040-\u30ff\u3400-\u9fff\u0e00-\u0eff\u1780-\u17ff]/u.test(s);
	const requiredLength = compactScript ? Math.min(minimumLength, 12) : minimumLength;
	if (s.length < requiredLength) return false;
	const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
	const spaces  = (s.match(/\s/g) || []).length;
	return letters / Math.max(1, s.length) > 0.52 &&
		(spaces / Math.max(1, s.length) > 0.08 || compactScript);
}
function _rapierPasteRunLooksCode(lines) {
	const values = Array.isArray(lines) ? lines.filter(value => String(value || '').trim()) : [];
	if (!values.length) return false;
	const signals = values.filter(value => {
		const s = String(value || '').trim();
		return /(?:[{};]$|=>|===|!==|&&|\|\||::|<\/?[A-Za-z][^>]*>|^[A-Za-z_$][\w$]*\s*[:=]\s*[^,]+,?$)/.test(s) ||
			/^(?:const|let|var|function|class|interface|type|import|export|return|throw|if|else|for|while|switch|case|def|async|await|try|catch|finally)\b/.test(s);
	}).length;
	return signals >= Math.max(2, Math.ceil(values.length * 0.30));
}

function _rapierSplitOversizeProseLine(line) {
	const text = String(line || '');
	if (text.length <= _RAPIER_PASTE_PROSE_MAX || !_rapierPasteLooksProse(text)) return [text];
	const chunks = [];
	let rest = text;
	while (rest.length > _RAPIER_PASTE_PROSE_MAX) {
		const floor = Math.min(_RAPIER_PASTE_PROSE_TARGET, rest.length - 1);
		const ceiling = Math.min(_RAPIER_PASTE_PROSE_MAX, rest.length);
		const windowText = rest.slice(0, ceiling);
		let cut = -1;
		const sentence = /[.!?…。！？]["'”’»）)\]}]*(?=\s+)/gu;
		let match;
		while ((match = sentence.exec(windowText))) {
			const end = match.index + match[0].length;
			if (end >= floor) cut = end;
		}
		if (cut < floor) {
			const whitespace = windowText.lastIndexOf(' ', ceiling);
			if (whitespace >= floor) cut = whitespace;
		}
		if (cut < floor) break;
		// Paragraph boundaries add newlines without consuming the spaces at the cut.
		chunks.push(rest.slice(0, cut));
		rest = rest.slice(cut);
	}
	if (rest) chunks.push(rest);
	return chunks.length ? chunks : [text];
}

function _rapierNormalizePlainTextPaste(markdown) {
	const source = String(markdown || '').replace(/\r\n?|[\u2028\u2029]/g, '\n');
	if (!source.includes('\n')) {
		return _rapierSplitOversizeProseLine(source).join('\n\n');
	}

	const lines = source.split('\n');
	const out = [];
	const hardBreak = /(?: {2}|\\)$/;
	let i = 0;
	let fence = null;
	let inMath = false;

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();
		if (fence) {
			out.push(line);
			if (fence.test(trimmed)) fence = null;
			i++;
			continue;
		}
		if (inMath) {
			out.push(line);
			if (/^\$\$\s*$/.test(trimmed)) inMath = false;
			i++;
			continue;
		}
		const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
		if (fenceMatch) {
			fence = new RegExp('^' + fenceMatch[1][0] + '{' + fenceMatch[1].length + ',}\\s*$');
			out.push(line);
			i++;
			continue;
		}
		if (/^\$\$\s*$/.test(trimmed)) {
			inMath = true;
			out.push(line);
			i++;
			continue;
		}
		if (!trimmed) {
			out.push(line);
			i++;
			continue;
		}

		const kind = _rapierPlainPasteLineKind(line);
		if (kind !== 'prose') {
			out.push(line);
			i++;
			continue;
		}

		const run = [];
		while (i < lines.length && _rapierPlainPasteLineKind(lines[i]) === 'prose') {
			run.push(lines[i]);
			i++;
		}

		const runText = run.join(' ');
		const codeRun = _rapierPasteRunLooksCode(run);
		const proseRun = !codeRun && _rapierPasteLooksProse(runText, 48);
		if (!proseRun) {
			// Short lines the person pasted are lines, not a hard break invented inside one paragraph.
			if (codeRun || run.length < 2) out.push(...run);
			else for (let position = 0; position < run.length; position++) {
				if (position && !hardBreak.test(run[position - 1])) out.push('');
				out.push(run[position]);
			}
			continue;
		}

		const lengths = run.map(value => value.trim().length).filter(Boolean);
		const sorted = lengths.slice().sort((a, b) => a - b);
		const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
		const terminalRatio = run.filter(_rapierPasteEndsSentence).length / Math.max(1, run.length);
		const lowerStarts = run.slice(1).filter(value => /\p{Ll}/u.test(_rapierPasteFirstCharacter(value))).length;
		const wrapLike = run.length >= 3 && median >= 55 && terminalRatio < 0.55 && lowerStarts >= Math.max(1, Math.floor((run.length - 1) * 0.25));
		const independentLines = run.length >= 3 && !wrapLike && terminalRatio >= 0.60;

		let paragraphChars = 0;
		for (let r = 0; r < run.length; r++) {
			const chunks = _rapierSplitOversizeProseLine(run[r]);
			for (let c = 0; c < chunks.length; c++) {
				const chunk = chunks[c];
				if (out.length && out[out.length - 1] !== '') {
					const previous = c > 0 ? chunks[c - 1] : (r > 0 ? run[r - 1] : '');
					const sizeBoundary = paragraphChars > 0 &&
						paragraphChars + chunk.length + 1 > _RAPIER_PASTE_PROSE_MAX;
					const explicitParagraph = c > 0 || (!hardBreak.test(previous) && (sizeBoundary || independentLines || (
						_rapierPasteEndsSentence(previous) &&
						_rapierPasteStartsSentence(chunk) &&
						!(wrapLike && previous.trim().length >= Math.max(45, median - 12))
					)));
					if (explicitParagraph) {
						out.push('');
						paragraphChars = 0;
					}
				}
				out.push(chunk);
				paragraphChars += chunk.length + (paragraphChars ? 1 : 0);
			}
		}
	}

	return out.join('\n');
}

// The paste's one decision. Every paste resolver asks it, at every size and in both views: a Markdown
// flavour is taken as written; with the caret inside code (`insideCode`: a fence's body, a code block's
// words, inline code) the plain text is taken as written, since code holds characters; HTML that carries
// only its words gives way to the plain text beside it (the engine answers that from the DOM, asked only
// when it decides); other HTML is converted; plain text is kept, and a diagram's source is fenced.
function _rapierPasteDecision(payload, htmlCarriesOnlyWords) {
	const value = payload || {};
	if (String(value.markdown || '')) return 'markdown';
	const plain = String(value.plain || '');
	if (value.insideCode && plain) return 'code';
	if (String(value.html || '').trim() && !(plain.trim() && htmlCarriesOnlyWords())) return 'html';
	return plain ? 'plain' : null;
}

function _rapierLooksLikeDiagramSource(text) {
	const t = String(text || '').replace(/^\uFEFF/, '').trim();
	if (!t || t.length < 8 || t.length > 32768) return false;
	if (/^`{3,}|^~{3,}/.test(t)) return false;
	const rows = t.split('\n');
	const kept = [];
	for (let i = 0; i < rows.length && kept.length < 12; i++) {
		const s = rows[i].trim();
		if (!s || s.startsWith('%%')) continue;
		kept.push(s);
	}
	// The keyword alone on its first line, and a second line after it. graph and flowchart
	// also name a direction; pie names title or showData, or a data row (`"Dogs" : 386`). A
	// sentence that only begins with the word is prose, and so is a list headed by the word.
	if (kept.length < 2) return false;
	const line = kept[0];
	const flow = /^(?:flowchart|graph)\s+(\S+)$/.exec(line);
	if (flow) return /^(?:TB|TD|BT|RL|LR)$/.test(flow[1]);
	if (line === 'pie') return kept.slice(1).some(row => /^title\s+\S/.test(row) || /^showData\b/.test(row) || /^"[^"]*"\s*:\s*\d/.test(row));
	if (/^pie\s+title\s+\S/.test(line) || /^pie\s+showData\b/.test(line)) return true;
	return /^(?:sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|gitGraph|mindmap|timeline|journey|quadrantChart|requirementDiagram|sankey(?:-beta)?|xychart(?:-beta)?|C4Context|C4Container|C4Component)$/.test(line);
}

// What the decision gives the paste. Converted HTML keeps the plain text's own edge spaces, so a
// phrase pasted between words stays apart from them; plain text that is a diagram's source arrives
// as its fenced block.
function _rapierPasteContent(decision, payload, converted = '') {
	const value = payload || {};
	if (decision === 'markdown') return { kind: 'markdown', markdown: String(value.markdown), plainText: false, html: '' };
	const plain = String(value.plain || '');
	if (decision === 'code') return { kind: 'plain', markdown: plain, plainText: true, html: '' };
	if (decision === 'html') {
		const lead = /^[ \t ]+(?=\S)/.test(plain) ? ' ' : '';
		const tail = /\S[ \t ]+$/.test(plain) ? ' ' : '';
		return { kind: 'html', markdown: lead + String(converted) + tail, plainText: false, html: '' };
	}
	if (_rapierLooksLikeDiagramSource(plain)) {
		const source = plain.replace(/^﻿/, '');
		return {
			kind: 'markdown',
			markdown: '```mermaid\n' + source + (/[\r\n]$/.test(source) ? '' : '\n') + '```',
			plainText: false,
			html: '',
			fenced: true,
		};
	}
	return { kind: 'plain', markdown: plain, plainText: true, html: '' };
}

// Whether a caret after `before` (the source up to it) is inside a fenced code block: a fence opened
// on a line before the caret's (up to three spaces in, three or more backticks or tildes, a backtick
// fence's info holding no backtick) and not closed by a line of the same character, at least as long.
function _rapierPasteInsideFence(before) {
	const lines = String(before == null ? '' : before).split(/\r\n|\r|\n/);
	lines.pop();
	let fence = null;
	for (const line of lines) {
		if (fence) {
			const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
			continue;
		}
		const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (open && !(open[1][0] === '`' && open[2].includes('`'))) fence = open[1];
	}
	return !!fence;
}

// The fence the decision wrote (a diagram's source, `fenced`), pasted into source text, stands on lines of
// its own: its opener starts a line and its closer ends one, or the fence would take the words beside it
// and never close. The doors ask only for fences Rapier wrote; a person's own pasted bytes are theirs.
// Converted HTML (`converted`) is Rapier's writing too, and may open or close with a code block around its
// words: each edge that is a fence gets its own line.
function _rapierPasteOnOwnLines(inserted, before, after, converted = false) {
	const text = String(inserted == null ? '' : inserted);
	const opens = /^ {0,3}(`{3,}|~{3,})/.test(text), closes = /(?:^|\n) {0,3}(`{3,}|~{3,})[ \t]*$/.test(text);
	if (converted ? !opens && !closes : !opens || !closes) return text;
	return (opens && before && !/[\r\n]$/.test(before) ? '\n' : '') + text + (closes && after && !/^[\r\n]/.test(after) ? '\n' : '');
}

export { _RAPIER_PASTE_PROSE_TARGET, _RAPIER_PASTE_PROSE_MAX, _rapierPlainPasteLineKind, _rapierPasteEndsSentence, _rapierPasteFirstCharacter, _rapierPasteStartsSentence, _rapierPasteLooksProse, _rapierPasteRunLooksCode, _rapierSplitOversizeProseLine, _rapierNormalizePlainTextPaste, _rapierPasteDecision, _rapierLooksLikeDiagramSource, _rapierPasteContent, _rapierPasteInsideFence, _rapierPasteOnOwnLines };
