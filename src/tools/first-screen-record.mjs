// SPDX-License-Identifier: AGPL-3.0-only
export function firstScreenKey(parts) {
	let hash = 2166136261;
	for (const part of parts) for (let index = 0; index < part.length; index++) hash = Math.imul(hash ^ part.charCodeAt(index), 16777619);
	return (hash >>> 0).toString(36) + ':' + parts.reduce((sum, part) => sum + part.length, 0);
}

const escapeAttribute = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function firstScreenElement(view, version) {
	if (view.part) {
		const sheets = view.part.sheets.map(sheet => '<style data-rapier-early-sheet="' + escapeAttribute(sheet.id) + '">' + sheet.css + '</style>').join('');
		const presentation = JSON.stringify({part: view.part.id, built: view.part.built || undefined, gpu: view.part.gpu, viewport: view.part.viewport, light: view.light, dark: view.dark}).replace(/</g, '\\u003c');
		const surface = (html, theme) => html.split('\u0001').join(version).replace(/^<([a-z]+)/, '<$1 data-rapier-early-part="' +
			escapeAttribute(view.part.id) + '"' + (theme ? ' data-rapier-early-theme="' + theme + '"' : ''));
		const surfaces = view.part.darkHtml ? surface(view.part.html, 'light') + surface(view.part.darkHtml, 'dark') : surface(view.part.html, '');
		return '<template id="rapier-first-early" data-rapier-presentation="' + escapeAttribute(presentation) + '">' + sheets + surfaces + '</template>';
	}
	const wrappers = view.blocks.map(block => {
		const attributes = Object.entries(block.attributes).map(([name, value]) => ' ' + name + '="' + escapeAttribute(value) + '"').join('');
		const read = block.html == null ? '' : '<div class="block-read md-render">' + block.html.split('\u0001').join(version) + '</div>';
		return '<div data-rapier-early=""' + attributes + '>' + read + (block.controls || '') + '</div>';
	}).join('');
	const presentation = JSON.stringify({mark: view.mark, reach: view.reach, light: view.light, dark: view.dark, shell: view.shell})
		.replace(/</g, '\\u003c');
	const scope = 'html.rapier-first-early body:not(.rapier-first-ready) #editor-blocks>';
	const floats = (view.flows || []).map(flow => {
		const at = scope + '[data-rapier-early-flow="' + flow.picture + '"]', words = scope + '[data-rapier-early-flow-words]';
		const number = value => Math.round(value * 1000) / 1000;
		const picture = at + ' img[data-rapier-image-layout]:not([style*="position: absolute"])';
		return at + '{' + flow.styles[0] + '}' + at + '>.block-read{' + flow.styles[1] + '}' + at + ' p{' + flow.styles[2] + '}' +
			picture + '{position:absolute!important;' + flow.side + ':0!important;top:' + number(flow.top) + 'em!important;width:' + number(flow.width) +
			'%!important;height:auto!important;margin:0!important;max-width:none!important}' +
			(flow.darkSrc ? 'html.rapier-boot-light' + picture.replace(/^html/, '') + '{content:url("' + flow.src + '")}html:not(.rapier-boot-light)' +
				picture.replace(/^html/, '') + '{content:url("' + flow.darkSrc + '")}' : picture + '{content:url("' + flow.src + '")}') +
			words + '{' + flow.text + '}' + words + ' .block-read>p:not([data-rapier-flow])::before{content:"";float:' + flow.side +
			';width:calc(' + number(flow.width) + '% + ' + number(flow.gap) + 'px);height:0;padding-bottom:calc(' + number(flow.width * flow.aspect) + '% + ' +
			number(flow.drop) + 'em)}';
	}).join('');
	const sheet = floats ? '<style data-rapier-early-sheet="rapier-first-early-flow">' + floats.replace(/<\//g, '<\\/') + '</style>' : '';
	return '<template id="rapier-first-early" data-rapier-presentation="' + escapeAttribute(presentation) + '">' + sheet + wrappers + '</template>';
}

