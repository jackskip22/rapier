// SPDX-License-Identifier: AGPL-3.0-only
const f = value => String(Math.round(value * 10) / 10);
export const ELEMENT_INK = '#121212';
const ELEMENT_ID = /^[a-z][a-z0-9-]{0,47}$/, HEX = /^#[0-9a-fA-F]{6}$/;
const xml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encode = text => { let binary = ''; const bytes = new TextEncoder().encode(text); for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192)); return btoa(binary); };

const moved = (path, dx, dy) => dx || dy ? path.replace(/M(-?\d+)[ ,]?(-?\d+)/g, (_, x, y) => 'M' + (Number(x) + dx) + ' ' + (Number(y) + dy)) : path;

export const bandTiles = item => item.tile === true ? Math.max(2, Math.min(64, Math.round(2400 / item.w))) : 1;

export function elementSVG(item, {ink = ELEMENT_INK, tiles = bandTiles(item)} = {}) {
	if (!item || !ELEMENT_ID.test(item.id) || !HEX.test(ink) || !Number.isInteger(tiles) || tiles < 1 || tiles > 64) return null;
	const repeats = item.tile === true ? tiles : 1, width = item.w * repeats;
	let path = '';
	for (let i = 0; i < repeats; i++) path += moved(item.path, i * item.w, 0);
	const record = JSON.stringify({version: 1, pack: 'traced', piece: item.id, ink, ...(item.tile === true ? {tiles: repeats} : {})});
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + item.h + '" width="' + width + '" height="' + item.h + '" color="' + ink + '" role="img"><title>' +
		xml(item.name) + '</title><metadata id="rapier-element">' + xml(record) + '</metadata><path fill="' + ink + '" fill-rule="evenodd" d="' + path + '"/></svg>';
}

export function readElement(svgText) {
	const match = /<metadata id="rapier-element">([^<]*)<\/metadata>/.exec(String(svgText));
	if (!match) return null;
	try {
		const record = JSON.parse(match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
		return record?.version === 1 && ELEMENT_ID.test(record.piece) && HEX.test(record.ink) ? record : null;
	} catch { return null; }
}
export function recolorElement(svgText, ink) {
	const record = readElement(svgText);
	if (!record || !HEX.test(ink)) return null;
	return String(svgText).split(record.ink).join(ink);
}

export function elementLayout(item) {
	if (item.tile === true) return 'width=100% x=50%';
	const ratio = item.w / item.h;
	return ratio >= 2.5 ? 'width=70% x=50%' : ratio >= 1.4 ? 'width=45% x=50%' : 'width=30% x=50%';
}

const PAPERS = Object.freeze({letter: {width: 8.5, height: 11}, a4: {width: 8.27, height: 11.69}});
export const paperFor = (language = '') => /(?:^|[-_])(?:US|CA|MX|PH|CL|CO|VE|CR|GT)$/i.test(String(language)) ? 'letter' : 'a4';

export function borderSVG(row, {ink = ELEMENT_INK} = {}) {
	if (!row || !ELEMENT_ID.test(row.id) || !HEX.test(ink)) return null;
	const record = JSON.stringify({version: 1, pack: 'borders', piece: row.id, ink});
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + row.w + ' ' + row.h + '" width="' + row.w + '" height="' + row.h + '" preserveAspectRatio="none" color="' + ink + '" role="img"><title>' +
		xml(row.name) + '</title><metadata id="rapier-element">' + xml(record) + '</metadata><path fill="' + ink + '" fill-rule="evenodd" d="' + row.frame.path + '"/></svg>';
}
function marginFor(row, size) {
	const {x, y, w, h} = row.content;
	const inches = Math.max(x / row.w * size.width, (row.w - x - w) / row.w * size.width, y / row.h * size.height, (row.h - y - h) / row.h * size.height);
	return Math.min(6, Math.max(.5, Math.ceil(inches * 10) / 10));
}
export function templateMarkdown(row, {ink = ELEMENT_INK, paper = 'a4'} = {}) {
	const size = PAPERS[paper], svg = row && size && borderSVG(row, {ink});
	if (!svg) return null;
	return '---\ntemplate: page\npapersize: ' + paper + '\ngeometry: margin=' + marginFor(row, size) + 'in\nfontsize: 12pt\nmainfont: serif\npagestyle: empty\n---\n\n' +
		'![' + xml(row.name) + '][template-border] <!--md-layout:v1 width=100% x=50% wrap=behind lock=on-->\n\n' +
		'[template-border]: data:image/svg+xml;base64,' + encode(svg) + '\n';
}

export function thumbnailSVG(item, ink) {
	const path = item.frame ? item.frame.path : item.path;
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + item.w + ' ' + item.h + '" preserveAspectRatio="xMidYMid meet"><path fill="' + ink + '" fill-rule="evenodd" d="' + path + '"/></svg>';
}
