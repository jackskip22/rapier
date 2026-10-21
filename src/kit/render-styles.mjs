// SPDX-License-Identifier: MIT
function createRenderStyles(runtime) {
  const {_rapierArtifactAccent, _rapierStyleText} = runtime;
function _rapierArtifactThemeCss(houseDefaults = false) {
	// MIT reference sheet. Static code highlighting reads the app token names.
	const accent = houseDefaults ? '' : ':root,.md-render{--md-color-accent:' + _rapierArtifactAccent() + '}';
	return `
${accent}
html[data-rapier-theme="dark"]{color-scheme:dark}
html[data-rapier-theme="light"]{color-scheme:light}
html[data-rapier-theme="system"]{color-scheme:light dark}
*{box-sizing:border-box}
html{font-size:16px;-webkit-text-size-adjust:100%;background:var(--md-color-bg)}
body{
	--color-text:var(--md-color-text);--color-text-secondary:var(--md-color-text-secondary);
	--color-text-subtle:var(--md-color-text-subtle);--color-accent-text:var(--md-color-accent-text);
	margin:0;background:var(--md-color-bg);color:var(--md-color-text);font-family:var(--md-font-sans);-webkit-font-smoothing:antialiased
}
.rapier-page{width:min(100%,calc(var(--md-measure,39.6rem) + 32px));margin:0 auto;padding:48px 16px 72px}
.rapier-page [id]{scroll-margin-top:var(--md-space-8)}
.artifact-flat{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}
.artifact-flat--text{font:var(--md-fw-regular) 1rem/1.7 var(--md-font-sans)}
.artifact-flat--code{font:var(--md-fw-regular) .875rem/1.6 var(--md-font-mono);overflow-x:auto;white-space:pre}
@media screen{html{scrollbar-width:none}html::-webkit-scrollbar{width:0;height:0;display:none}}
@media (max-width:600px){.rapier-page{padding:32px 16px 56px}}
@media (prefers-color-scheme:light){.rapier-page[data-md-theme="system"]{--md-heading-color:var(--md-color-line);--md-heading-muted-color:var(--md-color-line)}}
`;
}

function _rapierArtifactPrintCss() {
	return `
@media print{
	html,body{
		width:auto!important;height:auto!important;min-height:0!important;max-height:none!important;
		margin:0!important;padding:0!important;overflow:visible!important;position:static!important;
		background:#fff!important;color:#111!important;color-scheme:light!important
	}
	.rapier-page{
		display:block!important;width:100%!important;max-width:none!important;height:auto!important;
		margin:0!important;padding:0!important;overflow:visible!important;position:static!important
	}
}
` + _rapierDocumentPrintCss('');
}

function _rapierDocumentPrintCss(hostSelector) {
	const p = sel => (hostSelector ? hostSelector + ' ' : '') + sel;
	const list = (...sels) => sels.map(p).join(',');
	return `
@page{size:auto;margin:12mm 14mm 14mm}
@media print{
	${p('.md-render')}{color-scheme:light!important;--md-color-line:#000000!important}
	${list('.md-render h1','.md-render h2','.md-render h3','.md-render h4','.md-render h5','.md-render h6')}{page-break-after:avoid;break-after:avoid-page;color:#111}
	${list('.md-render p','.md-render li','.md-render blockquote')}{orphans:3;widows:3}
	${p('.md-render img')}{max-width:100%!important;height:auto!important;break-inside:avoid-page}
	${list('.md-render pre','.artifact-flat')}{white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:break-word!important;overflow:visible!important;max-height:none!important}
	${p('.diagram-block[data-diagram-state="ready"] .diagram-source')}{display:none!important}
	${p('.artifact-flat')}{margin:0;font:400 12pt/1.55 var(--md-font-sans);tab-size:2}
	${p('.artifact-flat--code')}{font:400 10pt/1.5 var(--md-font-mono)}
	${list('.table-scroll-wrap','.math-display-wrap')}{overflow:visible!important;padding:0!important}
	${list('.table-scroll-wrap table','.md-render table')}{width:100%!important;min-width:0!important;max-width:100%!important;table-layout:auto}
	${list('.md-render th','.md-render td')}{overflow-wrap:anywhere;word-break:normal}
	${p('.md-render thead')}{display:table-header-group}
	${p('.md-render tfoot')}{display:table-footer-group}
	${p('.md-render tr')}{page-break-inside:avoid;break-inside:avoid-page}
	${p('.md-render details>*:not(summary)')}{display:block!important}
	${p('.md-render details')}{break-inside:auto}
	${p('.md-render a')}{color:#111!important;text-decoration:underline}
	${p('.md-render ol>li::before')}{background:#fff!important;color:#111!important;border-color:#111!important}
	${p('.md-render ol>li:not(:last-child)::after')}{border-color:#111!important}
	${p('.md-render blockquote.callout')}{background:none!important;color:#111!important;--md-color-success:#188844;--md-color-warning:#b26105;--md-color-error:#c00}
}`;
}

function _rapierArtifactStyles(theme, includeFonts, printMode, houseDefaults = false, fontCss = null) {
	const parts = [];
	if (fontCss !== null) parts.push(fontCss);
	else if (includeFonts) parts.push(_rapierStyleText('rapier-font-style'));
	parts.push(_rapierStyleText('rapier-content-style'));
	parts.push(_rapierArtifactThemeCss(houseDefaults));
	if (!includeFonts && fontCss === null) parts.push(`@font-face{font-family:'Geist/Roboto';src:local('Roboto');font-weight:400 500;size-adjust:105%;ascent-override:95.7%;descent-override:28.1%;line-gap-override:0%}
@font-face{font-family:'Geist/Roboto';src:local('Roboto Bold');font-weight:600 700;size-adjust:105%;ascent-override:95.7%;descent-override:28.1%;line-gap-override:0%}
@font-face{font-family:'Geist/Helvetica Neue';src:local('Helvetica Neue');font-weight:400 500;size-adjust:103.8%;ascent-override:96.8%;descent-override:28.4%;line-gap-override:0%}
@font-face{font-family:'Geist/Helvetica Neue';src:local('Helvetica Neue Bold');font-weight:600 700;size-adjust:103.8%;ascent-override:96.8%;descent-override:28.4%;line-gap-override:0%}
@font-face{font-family:'Geist/Segoe UI';src:local('Segoe UI');font-weight:400 500;size-adjust:105.3%;ascent-override:95.4%;descent-override:28%;line-gap-override:0%}
@font-face{font-family:'Geist/Segoe UI';src:local('Segoe UI Bold');font-weight:600 700;size-adjust:105.3%;ascent-override:95.4%;descent-override:28%;line-gap-override:0%}
@font-face{font-family:'Geist/Arial';src:local('Arial');font-weight:400 500;size-adjust:104.8%;ascent-override:95.9%;descent-override:28.2%;line-gap-override:0%}
@font-face{font-family:'Geist/Arial';src:local('Arial Bold');font-weight:600 700;size-adjust:104.8%;ascent-override:95.9%;descent-override:28.2%;line-gap-override:0%}
@font-face{font-family:'Geist/Noto Sans';src:local('Noto Sans');font-weight:400 500;size-adjust:98.5%;ascent-override:102%;descent-override:29.9%;line-gap-override:0%}
@font-face{font-family:'Geist/Noto Sans';src:local('Noto Sans Bold');font-weight:600 700;size-adjust:98.5%;ascent-override:102%;descent-override:29.9%;line-gap-override:0%}
@font-face{font-family:'Geist/Ubuntu';src:local('Ubuntu');font-weight:400 500;size-adjust:102.6%;ascent-override:97.9%;descent-override:28.7%;line-gap-override:0%}
@font-face{font-family:'Geist/Ubuntu';src:local('Ubuntu Bold');font-weight:600 700;size-adjust:102.6%;ascent-override:97.9%;descent-override:28.7%;line-gap-override:0%}
@font-face{font-family:'Geist/Liberation Sans';src:local('Liberation Sans');font-weight:400 500;size-adjust:105.7%;ascent-override:95%;descent-override:27.9%;line-gap-override:0%}
@font-face{font-family:'Geist/Liberation Sans';src:local('Liberation Sans Bold');font-weight:600 700;size-adjust:105.7%;ascent-override:95%;descent-override:27.9%;line-gap-override:0%}
@font-face{font-family:'Geist/DejaVu Sans';src:local('DejaVu Sans');font-weight:400 500;size-adjust:92.1%;ascent-override:109.1%;descent-override:32%;line-gap-override:0%}
@font-face{font-family:'Geist/DejaVu Sans';src:local('DejaVu Sans Bold');font-weight:600 700;size-adjust:92.1%;ascent-override:109.1%;descent-override:32%;line-gap-override:0%}
:root,.md-render{--md-font-sans:'Geist','Geist/Roboto','Geist/Helvetica Neue','Geist/Segoe UI','Geist/Arial','Geist/Noto Sans','Geist/Ubuntu','Geist/Liberation Sans','Geist/DejaVu Sans',system-ui,sans-serif}`);
	const highlightCss = _rapierStyleText('rapier-highlight-style');
	parts.push(highlightCss);
	for (const [, palette, light] of highlightCss.matchAll(/html\[data-highlights="(standard|accent)"\] body\.light\s*\{([^}]*)\}/g)) {
		if (theme === 'system') parts.push('@media (prefers-color-scheme:light){html[data-rapier-theme="system"][data-highlights="' + palette + '"] body{' + light.trim() + '}}');
		if (printMode) parts.push('@media print{html[data-highlights="' + palette + '"] body{' + light.trim() + '}}');
	}
	if (printMode) parts.push(_rapierArtifactPrintCss());
	return parts.filter(Boolean).join('\n\n');
}

  return {_rapierArtifactThemeCss, _rapierArtifactPrintCss, _rapierDocumentPrintCss, _rapierArtifactStyles};
}
export {createRenderStyles};
