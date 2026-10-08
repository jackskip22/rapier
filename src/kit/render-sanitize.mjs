// SPDX-License-Identifier: MIT
const RAPIER_SANITIZE_FORBID_TAGS = Object.freeze(['form', 'style', 'dialog', 'template', 'iframe']);
const RAPIER_SANITIZE_FORBID_ATTR = Object.freeze(['action', 'formaction', 'form', 'for']);
// The document profiles use one allowlist in a browser and in an inert server parser.
const RAPIER_SANITIZE_PROFILES = Object.freeze({
	htmlTags: Object.freeze(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),
	svgTags: Object.freeze(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),
	mathTags: Object.freeze(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),
	htmlAttributes: Object.freeze(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),
	svgAttributes: Object.freeze(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dominant-baseline","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","pointer-events","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-orientation","text-rendering","textlength","type","u1","u2","unicode","values","vector-effect","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),
	mathAttributes: Object.freeze(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),
	xmlAttributes: Object.freeze(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),
});
const RAPIER_SANITIZE_DROP_CONTENTS = Object.freeze('annotation-xml.audio.colgroup.desc.foreignobject.head.iframe.math.mi.mn.mo.ms.mtext.noembed.noframes.noscript.plaintext.script.selectedcontent.style.svg.template.thead.title.video.xmp'.split('.'));
function _rapierSanitizeProfile(...kinds) {
	return {ALLOWED_TAGS: Object.freeze(['#text', ...new Set(kinds.flatMap(kind => RAPIER_SANITIZE_PROFILES[kind + 'Tags']))]),
		ALLOWED_ATTR: Object.freeze([...new Set(kinds.flatMap(kind => RAPIER_SANITIZE_PROFILES[kind + 'Attributes']).concat(kinds.some(kind => kind !== 'html') ? RAPIER_SANITIZE_PROFILES.xmlAttributes : []))]),
		FORBID_CONTENTS: RAPIER_SANITIZE_DROP_CONTENTS};
}
const RAPIER_SANITIZE_OPTIONS = Object.freeze({
	render: Object.freeze({
		..._rapierSanitizeProfile('html', 'svg', 'math'),
		FORBID_TAGS: RAPIER_SANITIZE_FORBID_TAGS,
		FORBID_ATTR: RAPIER_SANITIZE_FORBID_ATTR,
	}),
	paste: Object.freeze({
		..._rapierSanitizeProfile('html'),
		FORBID_TAGS: RAPIER_SANITIZE_FORBID_TAGS,
		FORBID_ATTR: RAPIER_SANITIZE_FORBID_ATTR,
	}),
	snippet: Object.freeze({
		..._rapierSanitizeProfile('html'),
		FORBID_TAGS: RAPIER_SANITIZE_FORBID_TAGS,
		FORBID_ATTR: Object.freeze([...'style']),
	}),
	diagram: Object.freeze({
		..._rapierSanitizeProfile('html', 'svg'),
		FORBID_TAGS: Object.freeze(['form', 'dialog', 'template', 'iframe', 'script', 'foreignobject']),
		FORBID_ATTR: RAPIER_SANITIZE_FORBID_ATTR,
	}),
});

const DIAGRAM_LABEL_HTML = new Set('div span p br strong em b i s u del code sub sup'.split(' '));
const DIAGRAM_LABEL_MATH = new Set(('math mrow mi mn mo mtext mspace ms msub msup msubsup mfrac msqrt mroot mstyle merror '
	+ 'mpadded mphantom mfenced menclose munder mover munderover mtable mtr mtd mlabeledtr mmultiscripts mprescripts none semantics').split(' '));
const DIAGRAM_LABEL_MATH_ATTRIBUTES = new Set(('display mathvariant mathsize mathcolor mathbackground dir accent accentunder '
	+ 'columnalign columnlines columnspacing columnspan columnwidth depth displaystyle equalcolumns equalrows fence frame framespacing '
	+ 'height largeop linebreak linethickness lspace maxsize minsize movablelimits notation rowalign rowlines rowspacing rowspan rspace '
	+ 'scriptlevel scriptminsize scriptsizemultiplier separator stretchy subscriptshift superscriptshift valign voffset width').split(' '));
const DIAGRAM_LABEL_CLASSES = new Set('nodeLabel edgeLabel labelBkg markdown-node-label katex messageText'.split(' '));
const DIAGRAM_LABEL_CSS = new Set(('color fill stroke background-color font-family font-size font-style font-weight font-variant '
	+ 'font-variant-ligatures font-feature-settings line-height letter-spacing word-spacing text-align vertical-align white-space '
	+ 'word-break overflow-wrap text-wrap text-transform text-decoration text-decoration-line text-decoration-style text-decoration-color '
	+ 'text-decoration-thickness text-underline-offset align-items align-content justify-content justify-items flex-direction flex-wrap '
	+ 'width height min-width min-height max-width max-height margin margin-top margin-right margin-bottom margin-left '
	+ 'padding padding-top padding-right padding-bottom padding-left').split(' '));
const DIAGRAM_LABEL_SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DIAGRAM_LABEL_HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const DIAGRAM_LABEL_MATH_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

// Snapshot current math text before a Markdown writer collapses whitespace. Rendered SVG
// glyphs have no textContent: put their retained source in this inert copy so the writer's
// blank-node rule cannot discard an equation or its containing paragraph/list item.
function prepareMathSource(input, DOMParser) {
	const html = typeof input === 'string';
	const MARK = 'span[data-rapier-math-source],span.math-rendered[data-math-src]';
	if (html ? !/data-(?:rapier-math-source|math-src)/i.test(input) : typeof input?.cloneNode !== 'function' ||
		!(input.matches?.(MARK) || input.querySelector?.(MARK))) return input;
	const root = html ? new DOMParser().parseFromString(
		'<x-turndown id="turndown-root">' + input + '</x-turndown>', 'text/html').getElementById('turndown-root') : input.cloneNode(true);
	const nodes = Array.from(root.querySelectorAll(MARK));
	const sourceRoot = root.nodeName === 'SPAN' && root.matches(MARK);
	if (sourceRoot) nodes.push(root);
	for (const node of nodes) {
		if (node.classList.contains('math-rendered') && node.hasAttribute('data-math-src')) {
			try { node.textContent = decodeURIComponent(node.getAttribute('data-math-src')); } catch (_) {}
			continue;
		}
		try { node.setAttribute('data-rapier-math-source', encodeURIComponent(node.textContent || '')); }
		catch (_) { node.removeAttribute('data-rapier-math-source'); }
	}
	return sourceRoot ? root.outerHTML : root;
}

// An inert parser and a string sanitizer use the same profile as DOMPurify. Neither port may
// execute document scripts or fetch resources. HTML5 parsing precedes filtering so foreign
// content, entities and malformed table markup cross the same boundary as a browser's parser.
function createInertHtmlSanitizer({parseFragment, serialize, sanitizeHtml, safeRasterDataUrl}) {
	if (![parseFragment, serialize, sanitizeHtml, safeRasterDataUrl].every(port => typeof port === 'function'))
		throw new TypeError('The inert HTML sanitizer requires every parser and filtering port');
	const uri = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
	const uriSafe = new Set(['alt', 'class', 'for', 'id', 'label', 'name', 'pattern', 'placeholder', 'role', 'summary', 'title', 'value', 'style', 'xmlns']);
	const schemes = ['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp', 'matrix'];
	const htmlNamespace = 'http://www.w3.org/1999/xhtml', svgNamespace = 'http://www.w3.org/2000/svg', mathNamespace = 'http://www.w3.org/1998/Math/MathML';
	const svgTags = new Set(RAPIER_SANITIZE_PROFILES.svgTags), mathTags = new Set(RAPIER_SANITIZE_PROFILES.mathTags);
	const mathIntegration = new Set(['mi', 'mo', 'mn', 'ms', 'mtext']), htmlIntegration = new Set(['annotation-xml']);
	const sharedHtmlSvg = new Set(['title', 'style', 'font', 'a', 'script']);
	// DOMPurify's default namespace admission applies in addition to its tag profile. In
	// particular a MathML name parsed as HTML, or HTML inside SVG desc, is not admitted.
	const validNamespace = (node, parent) => {
		const tag = node.tagName.toLowerCase(), parentTag = (parent.tagName || 'template').toLowerCase();
		const namespace = node.namespaceURI, parentNamespace = parent.namespaceURI || htmlNamespace;
		if (namespace === svgNamespace) return parentNamespace === htmlNamespace ? tag === 'svg'
			: parentNamespace === mathNamespace ? tag === 'svg' && (parentTag === 'annotation-xml' || mathIntegration.has(parentTag)) : svgTags.has(tag);
		if (namespace === mathNamespace) return parentNamespace === htmlNamespace ? tag === 'math'
			: parentNamespace === svgNamespace ? tag === 'math' && htmlIntegration.has(parentTag) : mathTags.has(tag);
		return namespace === htmlNamespace && !(parentNamespace === svgNamespace && !htmlIntegration.has(parentTag))
			&& !(parentNamespace === mathNamespace && !mathIntegration.has(parentTag))
			&& !mathTags.has(tag) && (sharedHtmlSvg.has(tag) || !svgTags.has(tag));
	};
	return function sanitize(value, context = 'render') {
		const selected = context === 'raw' || context === 'export' || context === 'source' || RAPIER_SANITIZE_OPTIONS[context] ? context : 'render';
		const options = RAPIER_SANITIZE_OPTIONS[selected] || RAPIER_SANITIZE_OPTIONS.render;
		const forbiddenTags = new Set(options.FORBID_TAGS || []), forbiddenAttributes = new Set(options.FORBID_ATTR || []);
		const tags = new Set(options.ALLOWED_TAGS.filter(tag => tag !== '#text' && !forbiddenTags.has(tag)));
		const attributes = new Set(options.ALLOWED_ATTR);
		const tree = parseFragment(String(value == null ? '' : value));
		const dropContents = new Set(RAPIER_SANITIZE_DROP_CONTENTS);
		const admitTree = parent => {
			for (let index = 0; index < (parent.childNodes || []).length;) {
				const node = parent.childNodes[index], tag = node.tagName?.toLowerCase();
				if (tag && !tags.has(tag)) {
					const children = dropContents.has(tag) ? [] : node.childNodes || [];
					for (const child of children) child.parentNode = parent;
					parent.childNodes.splice(index, 1, ...children);
					continue;
				}
				if (tag && !validNamespace(node, parent) || node.nodeName === '#comment') {
					parent.childNodes.splice(index, 1); continue;
				}
				admitTree(node); index++;
			}
		};
		admitTree(tree);
		const admitNames = node => {
			if (node.tagName && tags.has(node.tagName.toLowerCase())) tags.add(node.tagName);
			for (const child of node.childNodes || []) admitNames(child);
		};
		admitNames(tree);
		const cleaned = sanitizeHtml(serialize(tree), {
			allowedTags: [...tags], allowedAttributes: false,
			disallowedTagsMode: 'discard', nonTextTags: RAPIER_SANITIZE_DROP_CONTENTS,
			allowedSchemes: schemes, allowedSchemesByTag: {img: [...schemes, 'data']},
			allowedSchemesAppliedToAttributes: ['href', 'src', 'xlink:href', 'cite', 'background', 'poster'],
			parseStyleAttributes: false,
			parser: {lowerCaseTags: false, lowerCaseAttributeNames: false, decodeEntities: true},
			transformTags: {'*': (tagName, input) => {
				const attribs = Object.create(null), tag = tagName.toLowerCase();
				for (const [name, inputValue] of Object.entries(input)) {
					const key = name.toLowerCase();
					const value = name === 'value' ? inputValue : inputValue.trim();
					if (forbiddenAttributes.has(key) || key.startsWith('on')) continue;
					if (/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i.test(value)
						|| key === 'attributename' && value.includes('href')) continue;
					const data = /^data-[\-\w.\u00b7-\uffff]+$/.test(key), aria = /^aria-[\-\w]+$/.test(key);
					const pageBreak = key === 'contenteditable' && value === 'false' && tag === 'div' && input['data-md-break'] === 'page';
					if (!(data && selected !== 'raw') && !aria && !pageBreak && !attributes.has(key)) continue;
					const compact = value.replace(/[\u0000-\u0020\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000]/g, '');
					if (!data && !aria && !pageBreak && !uriSafe.has(key) && compact) {
						if (/^data:/i.test(compact)) {
							if (key !== 'src' || tag !== 'img' || !safeRasterDataUrl(compact)) continue;
						} else if (!uri.test(compact)) continue;
					}
					attribs[name] = value;
				}
				if ((tag === 'a' || tag === 'area') && attribs.target?.trim().toLowerCase() === '_blank') attribs.rel = 'noopener noreferrer';
				return {tagName, attribs};
			}},
		});
		return serialize(parseFragment(cleaned));
	};
}

// The document's renderer. DOM, codecs and host state are explicit inputs.
function createRenderSanitizer(runtime) {
  const {CSSStyleSheet, DOMPurify, RAPIER_RASTER_DATA_URL_RE, URL, _rapierCssDeclaration, _rapierDropRemoteDeclarations, _rapierRemoteContent, _rapierRuleDescriptorIsRemote, _rapierSanitizeRuntime, document, globalThis, location} = runtime;

// Only the diagram reader and its styled export admit static foreignObject labels. The
// ordinary SVG reader still rejects HTML subdocuments. The export class selects scope;
// every descendant is checked again, so a copied class never confers authority.
function diagramLabelRoot(node) {
	for (let current = node; current?.nodeType === 1; current = current.parentElement) {
		if (current.localName?.toLowerCase() === 'foreignobject') return current;
	}
	return null;
}

function diagramLabelStyle(property, value) {
	property = String(property).toLowerCase();
	value = String(value).trim();
	if (property === 'display') return /^(?:none|block|inline|inline-block|table|table-cell|flex|inline-flex)$/.test(value);
	if (/^overflow(?:-[xy])?$/.test(property)) return /^(?:hidden|clip)$/.test(value);
	if (property === 'contain') return value === 'content';
	if (property === 'isolation') return value === 'isolate';
	if (!DIAGRAM_LABEL_CSS.has(property)) return false;
	const declaration = document.createElement('span').style;
	declaration.setProperty(property, value);
	const parsed = declaration.getPropertyValue(property);
	if (!parsed || /(?:url|image-set|element|paint|attr)\s*\(/i.test(parsed)) return false;
	// SVG paint accepts resource references; a custom property must not smuggle one in.
	return !/^(?:fill|stroke)$/.test(property) || !/var\s*\(/i.test(parsed);
}

function diagramLabelElement(node) {
	if (node.nodeType !== 1) return;
	const label = diagramLabelRoot(node);
	if (!label) return;
	if (node === label) {
		const svg = node.parentElement?.closest('svg');
		if (node.namespaceURI !== DIAGRAM_LABEL_SVG_NAMESPACE || !svg || diagramLabelRoot(node.parentElement) ||
				(_rapierSanitizeRuntime.context !== 'diagram' && !svg.classList.contains('rapier-diagram'))) node.remove();
		return;
	}
	const name = node.localName?.toLowerCase();
	if (!(node.namespaceURI === DIAGRAM_LABEL_HTML_NAMESPACE && DIAGRAM_LABEL_HTML.has(name)) &&
			!(node.namespaceURI === DIAGRAM_LABEL_MATH_NAMESPACE && DIAGRAM_LABEL_MATH.has(name))) node.remove();
}

function diagramLabelAttribute(node, data) {
	const label = diagramLabelRoot(node);
	if (!label) return;
	data.forceKeepAttr = false;
	const name = String(data.attrName).toLowerCase();
	const value = String(data.attrValue);
	if (name === 'style') {
		const declaration = document.createElement('span').style;
		declaration.cssText = value;
		for (const property of Array.from(declaration)) {
			if (!diagramLabelStyle(property, declaration.getPropertyValue(property))) declaration.removeProperty(property);
		}
		data.attrValue = declaration.cssText;
		data.keepAttr = !!data.attrValue;
		return;
	}
	if (name === 'class') {
		data.attrValue = value.split(/\s+/).filter(token => DIAGRAM_LABEL_CLASSES.has(token)).join(' ');
		data.keepAttr = !!data.attrValue;
		return;
	}
	if (name === 'xmlns') {
		data.keepAttr = value === node.namespaceURI;
		return;
	}
	if (node === label) {
		data.keepAttr = name === 'transform' || /^(?:x|y|width|height)$/.test(name) &&
			/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:px|%)?$/i.test(value) && Number.isFinite(parseFloat(value)) &&
			(!/^(?:width|height)$/.test(name) || parseFloat(value) >= 0);
		return;
	}
	data.keepAttr = node.namespaceURI === DIAGRAM_LABEL_MATH_NAMESPACE
		? DIAGRAM_LABEL_MATH_ATTRIBUTES.has(name)
		: name === 'dir' && /^(?:ltr|rtl|auto)$/.test(value);
}

function diagramLabelContained(node) {
	const label = diagramLabelRoot(node);
	if (!label) return;
	if (node === label) node.style.setProperty('overflow', 'hidden', 'important');
	else if (node.parentElement === label) node.style.setProperty('contain', 'content', 'important');
}

function _rapierInstallSanitizeHooks() {
	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		if (!/^(?:src|href|xlink:href)$/i.test(data.attrName || '')) return;
		const compact = String(data.attrValue || '').replace(/[\u0000-\u0020\u00a0]+/g, '');
		if (!/^data:/i.test(compact)) return;
		const rasterAllowed = /^(?:render|export|raw|source)$/.test(_rapierSanitizeRuntime.context)
			&& data.attrName.toLowerCase() === 'src'
			&& node && node.nodeName === 'IMG'
			&& _rapierSafeRasterDataUrl(compact);
		if (!rasterAllowed) data.keepAttr = false;
	});
	// Paste, render and export sanitise: a remote <img src> would fetch the instant its markup lands in the page,
	// so the src the hook below is about to strip never survives. Move it to a data-* attribute first
	// (DOMPurify already leaves data-* alone, and the sanitizer's own inert document never fetches it
	// either), so the picture and its alt text still reach Turndown's rapierImage rule as a live
	// pasted-page picture and write out `![alt](url)` -- not vanish -- and an <img> in a document's own
	// HTML (a table kept as HTML) is written again with its URL: the raw profile admits no data-*, so
	// only the three this hook sets on the node it holds back stay. A picture inside a link is the same
	// node with the same fix: the outer <a> rule reads this img's own converted markdown as its content.
	DOMPurify.addHook('uponSanitizeElement', node => {
		if (_rapierRemoteContent.allowed || !/^(?:paste|render|raw|export)$/.test(_rapierSanitizeRuntime.context)) return;
		if (!node || node.nodeName !== 'IMG' || node.hasAttribute('data-rapier-remote-src')) return;
		const src = node.getAttribute('src') || '';
		if (!src || !_rapierRemoteSubresourceOrigin(src)) return;
		node._rapierHeldBack = true;
		node.setAttribute('data-rapier-remote-src', src);
		const alt = node.getAttribute('alt');
		if (alt != null) node.setAttribute('data-rapier-remote-alt', alt);
		const title = node.getAttribute('title');
		if (title != null) node.setAttribute('data-rapier-remote-title', title);
	});
	// A list from Word is named by the style of its paragraph and of the span that holds its marker (mso-list,
	// spec/html-reading.mjs), and the CSS pass below empties a style of every property the browser does not
	// know: a marker's style is only `mso-list:Ignore`. The paste carries both as data-* first, where they stay,
	// for the conversion that reads them (_rapierPasteWordLists).
	DOMPurify.addHook('uponSanitizeElement', node => {
		if (_rapierSanitizeRuntime.context !== 'paste' || !node || !/^(?:P|SPAN)$/.test(node.nodeName)) return;
		// Only the style names them: a page cannot bring these attributes of its own.
		node.removeAttribute('data-rapier-word-level');
		node.removeAttribute('data-rapier-word-marker');
		const style = node.getAttribute('style');
		if (!style || !/mso-list/i.test(style)) return;
		const {wordListLevel, wordListIsMarker} = globalThis.RapierMarkdownSpec;
		const level = node.nodeName === 'P' ? wordListLevel(style) : 0;
		if (level) node.setAttribute('data-rapier-word-level', String(level));
		else if (node.nodeName === 'SPAN' && wordListIsMarker(style)) node.setAttribute('data-rapier-word-marker', '1');
	});
	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		const value = String(data.attrValue == null ? '' : data.attrValue);
		// A document's own HTML never carries an id the chrome owns, remote content allowed or not: the
		// allow is about what the page fetches, and this rule is about what the page's chrome finds.
		if (String(data.attrName || '').toLowerCase() === 'id' && _rapierSanitizeRuntime.context === 'raw' && _rapierChromeOwnsId(value)) { data.keepAttr = false; return; }
		if (_rapierRemoteContent.allowed || _rapierSanitizeRuntime.context === 'source') return;
		if (String(data.attrName || '').toLowerCase() === 'style') {
			const cleaned = _rapierStyleWithoutRemoteUrls(value);
			if (cleaned !== value) data.attrValue = cleaned;
			return;
		}
		const attribute = String(data.attrName || '').toLowerCase();
		// These attributes carry authored text, never resource requests.
		if (attribute === 'alt' || attribute === 'title') return;
		if (/^data-rapier-remote-(?:src|alt|title)$/.test(attribute) && node && node._rapierHeldBack === true) { data.forceKeepAttr = true; return; }
		if (attribute.startsWith('data-')) return;
		const element = String(node && node.nodeName || '').toUpperCase();
		if (attribute === 'href' && (element === 'A' || element === 'AREA')) return;
		if (_rapierCssPresentationIsRemote(attribute, value) ||
			value.split(/[\s,]+/).some(token => _rapierRemoteSubresourceOrigin(token))) {
			data.keepAttr = false;
		}
	});

	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		if (String(data.attrName || '').toLowerCase() === 'contenteditable' && String(data.attrValue) === 'false' &&
				node && node.nodeName === 'DIV' && node.getAttribute && node.getAttribute('data-md-break') === 'page') {
			data.keepAttr = true;
			data.forceKeepAttr = true;
		}
	});
	// A link that opens a new tab never hands that tab a window.opener or a Referer: the editor's own
	// click router already opens with noopener,noreferrer; the sanitized markup that Share and the
	// standalone export carry gets the same rule in its bytes.
	DOMPurify.addHook('afterSanitizeAttributes', node => {
		if (!node || !/^(?:A|AREA)$/i.test(node.nodeName) || !node.hasAttribute('target')) return;
		if (String(node.getAttribute('target') || '').trim().toLowerCase() !== '_blank') return;
		node.setAttribute('rel', 'noopener noreferrer');
	});
	DOMPurify.addHook('afterSanitizeElements', node => {
		if (_rapierRemoteContent.allowed) return;
		if (!node || (node.nodeName !== 'STYLE' && node.nodeName !== 'style')) return;
		const css = String(node.textContent || '');
		if (!css) return;
		const cleaned = _rapierStylesheetWithoutRemoteUrls(css);
		if (cleaned !== css) node.textContent = cleaned;
	});
}

function sanitizeRapierHtml(value, context = 'render') {
	// 'export' is the render profile under the export hooks; 'raw' is a document's own HTML (initMarkdownIt, html_block):
	// the render profile without data-* attributes, which Rapier's delegated handlers read as their own controls, and
	// (the hook) without an id the chrome owns. 'source' is Markdown source HTML, written and never shown: the render
	// profile's admission, and the block on remote content stays the reader's (a remote picture's URL is the person's words).
	const selected = context === 'raw' || context === 'export' || context === 'source' || RAPIER_SANITIZE_OPTIONS[context] ? context : 'render';
	let options = selected === 'raw' ? { ...RAPIER_SANITIZE_OPTIONS.render, ALLOW_DATA_ATTR: false } : RAPIER_SANITIZE_OPTIONS[selected] || RAPIER_SANITIZE_OPTIONS.render;
	const labels = selected === 'diagram' || selected === 'export';
	if (labels) {
		// DOMPurify's USE_PROFILES replaces explicit allowlists. Add MathML to the
		// selected profile without discarding its admitted HTML and SVG vocabulary.
		options = {...options, ALLOWED_TAGS: [...new Set([...options.ALLOWED_TAGS, ...RAPIER_SANITIZE_PROFILES.mathTags])],
			ALLOWED_ATTR: [...new Set([...options.ALLOWED_ATTR, ...RAPIER_SANITIZE_PROFILES.mathAttributes])], ADD_TAGS: ['foreignobject'],
			HTML_INTEGRATION_POINTS: {foreignobject: true}, FORBID_TAGS: options.FORBID_TAGS.filter(tag => tag !== 'foreignobject')};
		DOMPurify.addHook('uponSanitizeElement', diagramLabelElement);
		DOMPurify.addHook('uponSanitizeAttribute', diagramLabelAttribute);
		DOMPurify.addHook('afterSanitizeAttributes', diagramLabelContained);
	}
	_rapierSanitizeRuntime.context = selected;
	try {
		return DOMPurify.sanitize(value == null ? '' : String(value), options);
	} finally {
		if (labels) {
			DOMPurify.removeHook('uponSanitizeElement', diagramLabelElement);
			DOMPurify.removeHook('uponSanitizeAttribute', diagramLabelAttribute);
			DOMPurify.removeHook('afterSanitizeAttributes', diagramLabelContained);
		}
		_rapierSanitizeRuntime.context = 'render';
	}
}

function escapeRapierHtmlText(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function _rapierChromeOwnsId(id) {
	// Every id the shell's own markup carries, read once before any document renders (initMarkdownIt primes it).
	if (!_rapierSanitizeRuntime.chromeIds) _rapierSanitizeRuntime.chromeIds = new Set(Array.from(typeof document?.querySelectorAll === 'function' ? document.querySelectorAll('[id]') : [], element => element.id));
	return _rapierSanitizeRuntime.chromeIds.has(String(id));
}

function _rapierSafeRasterDataUrl(value) {
	const match = RAPIER_RASTER_DATA_URL_RE.exec(value);
	if (!match) return false;
	try {
		const mime = match[1].toLowerCase();

		// An SVG's root <svg can trail a realistic XML declaration, doctype or generator/license

		const decodeBytes = encoded => { const text = atob(encoded); return Uint8Array.from(text, char => char.charCodeAt(0)); };

		if (_rapierVerifyRasterBytes(decodeBytes(match[2].slice(0, 344)), mime)) return true;
		return mime === 'image/svg+xml' && match[2].length > 344 && _rapierVerifyRasterBytes(decodeBytes(match[2]), mime);
	} catch (_) { return false; }
}

function _rapierCssPresentationIsRemote(property, value) {
	if (!value) return false;
	const declaration = _rapierCssDeclaration();
	declaration.setProperty(property, value);
	return declaration.length ? _rapierDropRemoteDeclarations(declaration) : false;
}

function _rapierRemoteSubresourceOrigin(value) {
	const raw = String(value == null ? '' : value)
		.replace(/[\u0009\u000a\u000d]+/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
	if (!raw) return '';
	let url;
	try { url = new URL(raw, document.baseURI); } catch (_) { return ''; }
	const host = String(url.host || '');
	if (!host) return '';
	const place = String(url.protocol || '').toLowerCase() + '//' + host;
	return place === location.protocol.toLowerCase() + '//' + location.host ? '' : place;
}

function _rapierStyleWithoutRemoteUrls(value) {
	const raw = String(value == null ? '' : value);
	if (!raw) return raw;
	const declaration = _rapierCssDeclaration();
	declaration.cssText = raw;
	if (!declaration.length) return '';
	return _rapierDropRemoteDeclarations(declaration) ? declaration.cssText : raw;
}

function _rapierStylesheetWithoutRemoteUrls(css) {
	let sheet;
	try {
		sheet = new CSSStyleSheet();
		sheet.replaceSync(String(css == null ? '' : css));
	} catch (_) { return ''; }
	_rapierDropRemoteRules(sheet.cssRules, sheet);
	return [].map.call(sheet.cssRules, rule => rule.cssText).join('\n');
}

function _rapierDropRemoteRules(rules, owner) {
	for (let index = rules.length - 1; index >= 0; index--) {
		const rule = rules[index];
		if (!rule.style && !rule.cssRules && _rapierRuleDescriptorIsRemote(rule) &&
				owner && typeof owner.deleteRule === 'function') {
			try { owner.deleteRule(index); continue; } catch (_) {}
		}
		if (rule.style) _rapierDropRemoteDeclarations(rule.style);
		if (rule.cssRules) _rapierDropRemoteRules(rule.cssRules, rule);
	}
}

function _rapierVerifyRasterBytes(bytes, mime) {
	if (mime === 'image/jxl') return globalThis.RapierImageAssets.isJxl(bytes);

	// declaration, doctype or generator/license comment before <svg itself, of whatever length its

	if (mime === 'image/svg+xml') return /<svg[\s>]/i.test(new TextDecoder('utf-8', {fatal: false}).decode(bytes));
	if (mime === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
	if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	if (mime === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
	return false;
}

  return {_rapierVerifyRasterBytes, _rapierInstallSanitizeHooks, sanitizeRapierHtml, diagramLabelStyle, escapeRapierHtmlText, _rapierChromeOwnsId, _rapierSafeRasterDataUrl, _rapierCssPresentationIsRemote, _rapierRemoteSubresourceOrigin, _rapierStyleWithoutRemoteUrls, _rapierStylesheetWithoutRemoteUrls, _rapierDropRemoteRules};
}
export {RAPIER_SANITIZE_FORBID_TAGS as forbidTags, RAPIER_SANITIZE_FORBID_ATTR as forbidAttributes, createRenderSanitizer, createInertHtmlSanitizer, RAPIER_SANITIZE_OPTIONS as options, prepareMathSource};
