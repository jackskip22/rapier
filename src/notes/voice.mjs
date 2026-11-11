import {recordingHref, recordingLine, durationWords} from './audio.mjs';
import {literalBlock} from './import.mjs';

export function createWords() {
	const lines = [];
	let partial = null;
	return {
		heard(text, at) {
			const words = String(text ?? '').trim();
			if (!words) { partial = null; return; }
			partial = {at: partial ? partial.at : Math.max(0, Math.floor(Number(at) || 0)), text: words};
		},
		said(text, at) {
			const words = String(text ?? '').trim();
			const began = partial ? partial.at : Math.max(0, Math.floor(Number(at) || 0));
			partial = null;
			if (words) lines.push({at: began, text: words});
		},
		settle() { if (partial) { lines.push(partial); partial = null; } },
		get lines() { return lines.slice(); },
		get partial() { return partial; },
		get empty() { return !lines.length && !partial; },
	};
}

const TITLE_WORDS = 6;
export function voiceTitle(lines, fallback = 'Voice note') {
	const first = (lines || []).map(line => line && line.text).find(text => text && String(text).trim());
	if (!first) return fallback;
	const words = String(first).replace(/[\\`*_~#>\[\]<|{}()]/g, ' ').replace(/[.,;:!?"'…“”]+(\s|$)/g, '$1').split(/\s+/).filter(Boolean).slice(0, TITLE_WORDS);
	const title = words.join(' ');
	return title ? title.charAt(0).toUpperCase() + title.slice(1) : fallback;
}

export function wordsMarkdown(name, lines) {
	return (lines || []).filter(line => line && String(line.text || '').trim())
		.map(line => '[' + durationWords(line.at) + '](' + recordingHref(name) + '#t=' + Math.max(0, Math.floor(line.at)) + ') ' + literalBlock(String(line.text).trim()))
		.join('\n\n');
}

export function voiceNoteText(entry, lines) {
	const words = wordsMarkdown(entry.name, lines);
	return recordingLine(entry) + '\n' + (words ? '\n' + words + '\n' : '');
}
