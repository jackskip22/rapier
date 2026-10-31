// SPDX-License-Identifier: AGPL-3.0-only
function _rapierToolFooter(path, npmPackage, repository = 'rapier') {
	const pages = [['/jxl', 'JPEG XL converter'], ['/convert', 'Document converter'], ['/diff', 'Compare'], ['/math', 'Math'], ['/diagrams', 'Diagrams']];
	const link = (label, href, away) => {
		const node = document.createElement('a');
		node.textContent = label; node.href = href;
		if (away) { node.target = '_blank'; node.rel = 'noopener'; }
		return node;
	};
	const line = (...nodes) => { const node = document.createElement('p'); node.className = 'rapier-tool-footer__line'; node.append(...nodes); return node; };
	const joined = links => links.flatMap((node, at) => at ? [' · ', node] : [node]);
	const footer = document.createElement('div');
	footer.className = 'rapier-tool-footer';
	footer.append(line(...joined([link((repository === 'rapier' ? 'Rapier' : repository) + ' on GitHub', 'https://github.com/jackskip22/' + repository, true), link(npmPackage + ' on npm', 'https://www.npmjs.com/package/' + npmPackage, true)])),
		line('Also: ', ...joined(pages.filter(([at]) => at !== path).map(([at, label]) => link(label, 'https://rapier.website' + at)))));
	return footer;
}
