// Export dialect is a portable personal preference, owned with the export path.
function _rapierPandocDialectEnabled() {
	try { return localStorage.getItem('rapier:export.pandocDialect') === '1'; } catch (_) { return false; }
}
function _rapierSetPandocDialectEnabled(value) {
	try {
		if (typeof _rapierPersonal !== 'undefined') _rapierPersonal.rememberDrawing('exportDialect', value ? '1' : null);
		if (value) localStorage.setItem('rapier:export.pandocDialect', '1');
		else localStorage.removeItem('rapier:export.pandocDialect');
	} catch (_) {   }
}

/* Shared pages are static views. The editable source rides inside them as plain Markdown:

     <script type="text/markdown" data-filename="notes.md" data-kind="markdown" data-sha256="…"
             data-images="pic image-1" data-image-definitions="PIC">
     # Notes …
     [pic]: #pic
     </script>

   The page's own <img> elements are the picture store. Every Markdown image destination that is a
   data URL the page shows is rewritten, at that destination only (never anywhere else the same
   bytes might appear: code, prose, links), to a fragment `#id` naming the <img id="…"> that holds
   the bytes; the ids the writer used are declared in data-images so a reader resolves exactly those
   and no ordinary `#fragment` link. Only destination bytes are replaced; authored `<…>` delimiters stay encoded around
   the fragment and are restored with the source. A reference definition (`[label]: #id`) is a second, narrower case: its destination alone
   cannot tell a rewritten picture definition from an ordinary link definition someone wrote by hand
   whose target happens to equal a picture id (`[nav]: #pic`), so data-image-definitions separately
   lists which definitions the writer actually rewrote, by their normalized reference label (the same
   fold markdown-it's normalizeReference applies: trim, collapse whitespace, case-fold), each
   percent-encoded so the list stays a plain space-separated token run regardless of what characters
   the label itself contains. A reference definition line resolves only when both hold: its label is
   declared here, and its destination is a declared id. An inline image destination needs no such
   check -- `![…](#id)` names its id directly and is never ambiguous. Four characters are
   entity-encoded so any Markdown survives inside a script element, bijectively: `&` becomes `&amp;`, `<` becomes `&lt;`, authored `#` becomes `&#35;` and CR becomes
   `&#13;`. Only structural image substitutions write raw `#id`. Decode CR before resolving
   those image destinations, then `&#35;`, `&lt;` and `&amp;` after resolution. data-sha256 is the SHA-256 of the
   resolved document, including its leading BOM and delimiter choices. Compatibility conversion
   changes only the picture destination bytes the person requested. Nothing here is private to
   Rapier: any tool can read it or write it (markdown-standard.md, "The document as a web page"). */
const _RAPIER_SHARED_SOURCE_TYPE = 'text/markdown';
const _RAPIER_SHARED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/;
/* One data-image-definitions token: a normalized reference label, percent-encoded (encodeURIComponent's
   own alphabet -- unreserved characters plus %XX) so it can never carry a raw space or quote. */
const _RAPIER_SHARED_DEFINITION = /^(?:[A-Za-z0-9\-_.!~*'()]|%[0-9A-Fa-f]{2})+$/;

async function _rapierSharedSourceHash(source) {
	const bytes = new TextEncoder().encode(source);
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Encode authored fragment markers; only a structural image substitution writes raw #id.
// CR survives HTML newline preprocessing. Ampersands decode last, preserving literal entities.
const _rapierSharedEncode = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/#/g, '&#35;').replace(/\r/g, '&#13;');
const _rapierSharedDecode = text => text.replace(/&#35;/g, '#').replace(/&#13;/g, '\r').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

// Rewrites the document's image destinations for the page: a JPEG XL picture becomes the portable
// picture the page shows (images/browser.js materialize, via context.imageSubstitutions), and every
// destination the page shows becomes `#id` into that <img>. Structural only: images/interchange.js's
// destination scanner names the exact source ranges of used image destinations, so the same bytes
// in a code block, a sentence or an ordinary link are never touched. The `#id` swap always replaces
// destination span (row.start/end), leaving authored angle delimiters encoded around it. Returns the resolved document (what a reader recovers, and what is hashed), the
// encoded carried text, the ids used, and the normalized labels of the reference definitions among them.
function _rapierSharedSourceForms(source, root, substitutions) {
	const assets = globalThis.RapierImageAssets;
	const destinations = _rapierImageDestinations(source, url => !!assets.dataImage(url)).sort((a, b) => b.start - a.start);
	const byUrl = new Map(), ids = new Map(), labels = new Map();
	for (const node of root.querySelectorAll('[id]')) ids.set(node.id, (ids.get(node.id) || 0) + 1);
	for (const match of source.matchAll(/^ {0,3}\[([^\]\r\n]+)\]:[ \t]*(data:image\/\S+)/gim)) if (!labels.has(match[2])) labels.set(match[2], match[1]);
	for (const image of root.querySelectorAll('img[src^="data:image/" i]')) {
		const url = image.getAttribute('src');
		if (!assets.dataImage(url) || byUrl.has(url)) continue;
		byUrl.set(url, image);
	}
	let resolved = source;
	const carrierEdits = [];
	const used = [], definitions = [];
	for (const row of destinations) {
		const shownUrl = substitutions?.get(row.destination) || row.destination;
		const image = byUrl.get(shownUrl);
		if (!image) { if (shownUrl !== row.destination) { resolved = resolved.slice(0, row.start) + shownUrl + resolved.slice(row.end); carrierEdits.push({start: row.start, end: row.end, text: _rapierSharedEncode(shownUrl)}); } continue; }
		let id = image.id;
		if (!id || ids.get(id) !== 1 || !_RAPIER_SHARED_ID.test(id)) {
			const label = labels.get(row.destination);
			id = label && _RAPIER_SHARED_ID.test(label) && !ids.has(label) ? label : null;
			for (let number = 1; !id || ids.has(id); number++) id = 'image-' + number;
			image.id = id;
			ids.set(id, 1);
		}
		if (!used.includes(id)) used.push(id);
		if (row.reference && !definitions.includes(row.reference)) definitions.push(row.reference);
		resolved = resolved.slice(0, row.start) + shownUrl + resolved.slice(row.end);
		carrierEdits.push({start: row.start, end: row.end, text: '#' + id});
	}
	let carried = '', cursor = source.length;
	for (const edit of carrierEdits) {
		carried = edit.text + _rapierSharedEncode(source.slice(edit.end, cursor)) + carried;
		cursor = edit.start;
	}
	carried = _rapierSharedEncode(source.slice(0, cursor)) + carried;
	return { resolved, carried, ids: used, definitions };
}

async function _rapierSharedSourceCarrier(context, root) {
	const source = (context.metadata.bom ? '\uFEFF' : '') + context.canonical;
	const forms = _rapierSharedSourceForms(source, root, context.imageSubstitutions);
	const esc = escapeRapierHtmlText;
	return '<script type="' + _RAPIER_SHARED_SOURCE_TYPE + '" data-filename="' + esc(context.metadata.filename) +
		'" data-kind="' + esc(context.metadata.docKind) + '" data-sha256="' + await _rapierSharedSourceHash(forms.resolved) +
		'"' + (forms.ids.length ? ' data-images="' + forms.ids.join(' ') + '"' : '') +
		(forms.definitions.length ? ' data-image-definitions="' + forms.definitions.map(encodeURIComponent).join(' ') + '"' : '') + '>\n' +
		forms.carried + '\n</script>\n';
}

// The inverse of _rapierSharedSourceForms: an inline image destination (`![…](#id)`) resolves on a
// declared id alone -- it names its own id, so nothing else can claim it. A reference definition
// (`[label]: #id`) additionally needs its own normalized label in `definitions`: without that check
// an ordinary hand-written definition whose destination happens to equal a picture id (`[nav]: #pic`)
// would resolve exactly like the picture definition it collides with, corrupting a document that was
// never a picture reference at all (markdown-standard.md, "The document as a web page").
function _rapierSharedResolve(text, ids, images, definitions) {
	if (!ids.length) return { text, broken: false };
	const id = '(' + ids.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
	let broken = false;
	const src = value => {
		const found = images.get(value);
		if (typeof found !== 'string' || !/^data:image\/(?:png|jpeg|webp|svg\+xml|jxl);base64,[A-Za-z0-9+/]+={0,2}$/i.test(found)) { broken = true; return null; }
		return found;
	};
	// Authored # characters were encoded. A raw id after ]( can only be a structural
	// substitution; matching its destination lets nested alt brackets survive unchanged.
	const inline = new RegExp('(\\]\\([ \\t\\r\\n]*(?:&lt;)?)#' + id + '(?=>?[ \\t\\r\\n]*\\)|>?[ \\t\\r\\n]+["\'(])', 'g');
	const definition = new RegExp('(^ {0,3}\\[((?:\\\\.|[^\\]\\\\])+)\\]:[ \\t]*(?:(?:\\r\\n|\\r|\\n)[ \\t]*)?(?:&lt;)?)#' + id + '(?=>?[ \\t]*$|>?[ \\t]+["\'(])', 'gm');
	const swapInline = (match, lead, value) => { const found = src(value); return found == null ? match : lead + found; };
	const swapDefinition = (match, lead, label, value) => {
		if (!definitions.has(md.utils.normalizeReference(_rapierSharedDecode(label)))) return match;
		const found = src(value);
		return found == null ? match : lead + found;
	};
	return { text: text.replace(inline, swapInline).replace(definition, swapDefinition), broken };
}

async function _rapierReadSharedDocument(text, filename) {
	const html = String(text);
	if (!/\.html?$/i.test(filename || '') || !html.includes('type="' + _RAPIER_SHARED_SOURCE_TYPE + '"')) return null;
	// Template contents remain inert, including pictures and scripts in ordinary HTML.
	const template = document.createElement('template');
	template.innerHTML = html;
	const invalid = () => { throw new Error('The editable source in this web page is incomplete or changed'); };
	const carriers = template.content.querySelectorAll('script[type="' + _RAPIER_SHARED_SOURCE_TYPE + '"]');
	if (carriers.length !== 1) return invalid();
	const carrier = carriers[0];
	const name = carrier.getAttribute('data-filename') || '', kind = carrier.getAttribute('data-kind'), sha256 = carrier.getAttribute('data-sha256') || '';
	const ids = (carrier.getAttribute('data-images') || '').split(/\s+/).filter(Boolean);
	const definitionTokens = (carrier.getAttribute('data-image-definitions') || '').split(/\s+/).filter(Boolean);
	if (!_rapierDocumentNameIsAdmissible(name) || !['markdown', 'text', 'code'].includes(kind) || !/^[0-9a-f]{64}$/.test(sha256) ||
			ids.some(id => !_RAPIER_SHARED_ID.test(id)) || definitionTokens.some(token => !_RAPIER_SHARED_DEFINITION.test(token))) return invalid();
	// Only a definition the page declares is an image definition.
	let definitions;
	try { definitions = new Set(definitionTokens.map(decodeURIComponent)); } catch (_) { return invalid(); }
	let source = carrier.textContent;
	if (source.startsWith('\n')) source = source.slice(1);
	if (source.endsWith('\n')) source = source.slice(0, -1);
	source = source.replace(/&#13;/g, '\r');
	// A duplicate id (two <img id="…">) is ambiguous, so it is recorded as null rather than either
	// src -- ties into _rapierSharedResolve's `broken` check the same way a missing image does.
	const images = new Map();
	for (const element of template.content.querySelectorAll('img[id]')) images.set(element.id, images.has(element.id) ? null : element.getAttribute('src'));
	const resolved = _rapierSharedResolve(source, ids, images, definitions);
	source = _rapierSharedDecode(resolved.text);
	if (resolved.broken || source.length > RapierTextCodec.maxDocumentBytes || await _rapierSharedSourceHash(source) !== sha256) return invalid();
	const bom = source.charCodeAt(0) === 0xFEFF;
	if (RapierTextCodec.normalizeDocument(source) !== (bom ? source.slice(1) : source)) return invalid();
	return {source, filename: name, kind, bom};
}

// Rapier's own stylesheet does the look -- the shared page is the same document the standalone
// export is, so it renders through _rapierArtifactStyles and gets the real .md-render rules: the
// numbered list's own counters, the checkbox treatment, callouts, footnotes, tables. What is left
// here is only what Share itself puts on the page and therefore owns the look of.
//
// First the nearest-side float that stands in for the planner when scripts are off: a float needs
// its container to contain it, and needs the blocks that must never run beside a picture to clear
// it. Then the long-code cap: _rapierShareCapLongCodeBlocks appends a "N lines" span inside the
// <pre> and marks the block, and nothing else in Rapier draws either -- without these rules that
// span reads as a line of the person's own code and the block runs the whole height of the page.
// It is hidden for print, where a capped, scrolling block would print as a cropped one.
function _rapierSharedPageFallbackCss() {
	return `
.rapier-page{display:flow-root}
.rapier-page>:first-child{margin-top:0}
.md-render h1{display:flow-root}
.rapier-page>:is(pre,table,hr,figure,.table-scroll-wrap,.math-display-wrap){clear:both}
`;
}

// The live editor, export and Share use the same eligible text blocks, including controls.
function _rapierShareWrapKind(element) {
	if (globalThis.RapierMarkdownLayout.wrapTextBlock(element)) return 'prose';
	const image = element.tagName === 'P' ? element.querySelector('img') : null;
	if (image && globalThis.RapierImageLayout.imageOnly(element, image)) return 'picture';
	// An empty paragraph is transparent to the owner search (R75), as in the editor and the export.
	if (element.tagName === 'P' && !element.textContent.trim() && !image) return 'metadata';
	return null;
}

// Astra-R75 X04: the picture-only paragraph a positioned picture (any of the four wrap values)
// actually occupies -- its own occurrence, either the bare image or a single link wrapping only
// it (the layout model's imageOnly), and that
// occurrence's own owning paragraph. One owner for the check every positioning pass below needs.
function _rapierSharePictureParagraph(image) {
	const occurrence = image.parentElement.tagName === 'A' ? image.parentElement : image;
	if (occurrence !== image && (occurrence.children.length !== 1 || occurrence.textContent.trim())) return null;
	const paragraph = occurrence.parentElement;
	if (!paragraph || paragraph.tagName !== 'P' || paragraph.children.length !== 1 || paragraph.textContent.trim()) return null;
	return paragraph;
}

function _rapierSharedPageLayout(root) {
	// Owner search (wrapNeighbour) reads the sibling chain live, and applying one assignment
	// splices the tree -- moving the owner into a new container moves it out of the very chain
	// a later picture's own search would walk, and a barrier-free skip past an earlier picture
	// can land on that new container instead (it is not a <p>, so it reads as a barrier). So
	// every owner is resolved first, against the one original, unspliced tree, in a pass that
	// only reads; only once all of them are known does a second pass apply any of them. Same
	// two-phase shape as layout/interchange.js's reflow(), which resolves every picture's owner
	// from one upfront `[...root.children]` before it changes anything about any of them.
	const assignments = [];
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'around' && layout?.wrap !== 'box') continue;
		const paragraph = _rapierSharePictureParagraph(image);
		if (!paragraph) continue;
		// Prefer following text, then preceding text, looking past pictures and metadata.
		const owner = globalThis.RapierMarkdownLayout.wrapNeighbour(paragraph, _rapierShareWrapKind);
		if (owner) assignments.push({image, paragraph, layout, owner});
	}
	// A float affects every line box after it in the same flow, which is the wrap law: prose and
	// headings carry on beside the picture across a heading or section boundary as though the blocks
	// between were not there. So the picture paragraph is placed right before its owner's text (a
	// float only reaches what follows it) and left in the page's own flow, uncontained; the blocks
	// that never wrap -- tables, code, figures and rules -- clear it through the page
	// stylesheet instead, and a bordered h1 forms its own block so its rule does not run under the
	// picture. Static CSS, no script: the no-script fallback only -- a reader with scripting off
	// still gets a sensible nearest-side float; the inlined planner (same owner as standalone)
	// replaces it when scripts run.
	for (const {image, paragraph, layout, owner} of assignments) {
		const side = (layout.x ?? 0) < 50 ? 'left' : 'right';
		paragraph.style.cssText = 'float:' + side + ';max-width:100%;margin:0 ' + (side === 'left' ? '1rem 1rem 0' : '0 1rem 1rem');
		if (layout.y > 0) {
			paragraph.style.marginTop = layout.y + 'em';
			paragraph.style.setProperty('shape-outside', 'inset(' + layout.y + 'em 0 0)');
		}
		image.style.margin = '0';
		// Astra-R75 X03: the reserved box comes from the same rotated-bounds geometry every other
		// consumer uses (layout/browser.js, layout/interchange.js's `geometry.rotatedBoundsRad`,
		// layout/model.mjs's one owner), expressed as a percentage of the column the way the
		// unrotated branch below already is -- never the picture's own pixel dimensions, which
		// have no relation to a requested percentage width (a 4000px-wide source at width=40%
		// used to float 1788px wide in a 600px column). Intrinsic width/height supply only the
		// aspect ratio; a percentage padding-top/bottom resolves against the same containing-block
		// width CSS already resolves the float's own percentage width against, so one basis serves
		// both the box and its vertical reservation, and the box stays exactly as wide as the
		// column at every viewport width. The turned box is centred, horizontally and vertically,
		// in the reserved (wider, taller) box rather than left-flush inside it, so the space this
		// paragraph clears for it (the float's own width) is evenly split around the picture on
		// every side, not just above and below. A missing `width` falls back to the picture's own
		// natural pixel size in pixels, the same fallback the unrotated branch below uses; without
		// either width/height attribute the picture still turns, just without the extra
		// reservation (the same graceful narrowing Share already accepts elsewhere).
		const naturalWidth = Number(image.getAttribute('width')) || 0, naturalHeight = Number(image.getAttribute('height')) || 0;
		if (layout.rotate && naturalWidth > 0 && naturalHeight > 0) {
			const rad = layout.rotate * Math.PI / 180, aspect = naturalHeight / naturalWidth;
			// A steep turn (e.g. 90deg on a landscape source) can need the image WIDER than its own
			// reserved box's width -- the rotated bounding box is narrower than the picture's own
			// unrotated width whenever the turn swaps a wide dimension for a narrow one. Share's own
			// global `img{max-width:100%}` (a sensible default everywhere else) would silently clamp
			// exactly that case, shrinking the image and, with it, its auto height -- `max-width:none`
			// here overrides that single rule with a more specific one, only for a picture this pass
			// already sizes deliberately.
			image.style.maxWidth = 'none';
			if (layout.width != null) {
				let width = layout.width, height = width * aspect;
				let bounds = globalThis.RapierImageLayout.rotatedBoundsRad(width, height, rad);
				if (bounds.width > 100) {
					const scale = 100 / bounds.width;
					width *= scale;
					height *= scale;
					bounds = globalThis.RapierImageLayout.rotatedBoundsRad(width, height, rad);
				}
				paragraph.style.width = bounds.width + '%';
				paragraph.style.paddingTop = ((bounds.height - height) / 2) + '%';
				paragraph.style.paddingBottom = ((bounds.height - height) / 2) + '%';
				image.style.width = (width / bounds.width * 100) + '%';
				image.style.marginLeft = image.style.marginRight = (((bounds.width - width) / 2) / bounds.width * 100) + '%';
			} else {
				const bounds = globalThis.RapierImageLayout.rotatedBoundsRad(naturalWidth, naturalHeight, rad);
				paragraph.style.width = bounds.width + 'px';
				paragraph.style.paddingTop = ((bounds.height - naturalHeight) / 2) + 'px';
				paragraph.style.paddingBottom = ((bounds.height - naturalHeight) / 2) + 'px';
				image.style.width = naturalWidth + 'px';
				image.style.marginLeft = image.style.marginRight = ((bounds.width - naturalWidth) / 2) + 'px';
			}
		} else {
			if (layout.width != null) paragraph.style.width = layout.width + '%';
			else if (image.getAttribute('width')) paragraph.style.width = image.getAttribute('width') + 'px';
			if (layout.width != null || image.getAttribute('width')) image.style.width = '100%';
		}
		if (layout.rotate) { image.style.transform = 'rotate(' + layout.rotate + 'deg)'; image.style.transformOrigin = '50% 50%'; }
		// Astra-R75 X04: `wrap=around` wraps to the picture's own alpha silhouette the way
		// standard-adoption.md's rung-2 paragraph already promises -- `shape-outside:url(<the same
		// picture>)`, which every engine that reads shape-outside re-samples from the referenced
		// image's own pixels, no script required. A CSS transform does not turn the shape a
		// `shape-outside` url() samples (it stays the picture's unturned alpha), so a rotated
		// `around` picture keeps the plain rectangular reservation above instead -- an honest
		// conservative box rather than a silhouette shaped for the wrong angle. `layout.y` already
		// owns `shape-outside` for its own inset reservation (below); the two are not combinable
		// (a float has exactly one `shape-outside` value), so a `y`-offset `around` picture keeps
		// that inset instead of silhouette wrapping -- a documented, narrow degradation.
		if (layout.wrap === 'around' && !layout.rotate && !layout.y) {
			const src = image.getAttribute('src');
			if (src) {
				paragraph.style.setProperty('shape-outside', 'url("' + src + '")');
				// Standard 10% alpha cutoff (`layout/model.mjs` alphaThreshold = .1).
				paragraph.style.setProperty('shape-image-threshold', '0.1');
			}
		}
		paragraph.classList.add('rapier-wrap-picture');
		owner.before(paragraph);
	}
	// Astra-R75 X04: `behind`/`front` position the picture exactly where `x`/`y`/`width` say, out
	// of the words' flow entirely (z-index below or above them) -- the absolutely positioned
	// picture standard-adoption.md's rung-2 paragraph already promises for these two placements,
	// no obstacle avoidance, no script. The picture's own paragraph collapses to zero height in
	// place (the same collapse-in-place anchor layout/interchange.js's own reflow uses for every
	// positioned kind) so removing the picture from flow costs the surrounding text nothing.
	const positionedAssignments = [];
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'behind' && layout?.wrap !== 'front') continue;
		const paragraph = _rapierSharePictureParagraph(image);
		if (paragraph) positionedAssignments.push({image, paragraph, layout});
	}
	for (const {image, paragraph, layout} of positionedAssignments) {
		paragraph.style.cssText = 'position:relative;height:0;margin:0;padding:0;line-height:0';
		const x = layout.x ?? 50, naturalWidth = Number(image.getAttribute('width')) || 0;
		if (layout.width != null) {
			image.style.width = layout.width + '%';
			image.style.left = (x - layout.width / 2) + '%';
		} else if (naturalWidth > 0) {
			image.style.width = naturalWidth + 'px';
			image.style.left = 'calc(' + x + '% - ' + (naturalWidth / 2) + 'px)';
		} else {
			image.style.left = x + '%';
		}
		image.style.position = 'absolute';
		image.style.top = (layout.y || 0) + 'em';
		image.style.margin = '0';
		if (layout.rotate) { image.style.transform = 'rotate(' + layout.rotate + 'deg)'; image.style.transformOrigin = '50% 50%'; }
		// Same rule as the live editor and the styled export: `behind` sinks under the owner's
		// own in-flow, non-positioned text; `front` keeps the default stack, already above it.
		if (layout.wrap === 'behind') image.style.zIndex = '-1';
		paragraph.classList.add('rapier-positioned-picture');
	}
	// F75-11: a turned picture Share does not otherwise position (inline, which this static page
	// does not float at all) still turns -- the same picture, painted in place, never upright
	// just because Share's own float model has nothing else to say about it.
	const positioned = new Set([...assignments, ...positionedAssignments].map(row => row.image));
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		if (positioned.has(image)) continue;
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (!layout?.rotate) continue;
		image.style.transform = 'rotate(' + layout.rotate + 'deg)';
		image.style.transformOrigin = '50% 50%';
		const naturalWidth = Number(image.getAttribute('width')) || 0, naturalHeight = Number(image.getAttribute('height')) || 0;
		if (naturalWidth > 0 && naturalHeight > 0) {
			const rad = layout.rotate * Math.PI / 180;
			const boundWidth = naturalWidth * Math.abs(Math.cos(rad)) + naturalHeight * Math.abs(Math.sin(rad));
			const boundHeight = naturalWidth * Math.abs(Math.sin(rad)) + naturalHeight * Math.abs(Math.cos(rad));
			image.style.display = 'block';
			image.style.marginLeft = image.style.marginRight = ((boundWidth - naturalWidth) / 2) + 'px';
			image.style.marginTop = image.style.marginBottom = ((boundHeight - naturalHeight) / 2) + 'px';
		}
	}
}

/* A code block over 40 lines gets a scrolling height cap in the offline page, with a small "N
	 lines" note at its top-right so a reader knows there is more; print lifts the cap (see the
	 `[data-rapier-code-lines]` rule in the export's own @media print block) so nothing
	 is cut on paper. The editor's own read surface is untouched -- this runs only here, against the
	 shared page's own styled-root clone, never against spec/markdown-style.css's live block-read. */
const RAPIER_SHARE_LONG_CODE_LINES = 40;
function _rapierShareCapLongCodeBlocks(root) {
	root.querySelectorAll('pre').forEach(pre => {
		const code = pre.querySelector(':scope > code') || pre;
		const text = String(code.textContent || '').replace(/\n$/, '');
		const lineCount = text === '' ? 0 : text.split('\n').length;
		if (lineCount <= RAPIER_SHARE_LONG_CODE_LINES) return;
		pre.setAttribute('data-rapier-code-lines', String(lineCount));
		const note = document.createElement('span');
		note.className = 'rapier-code-lines-note';
		note.setAttribute('contenteditable', 'false');
		note.textContent = lineCount + ' lines';
		pre.appendChild(note);
	});
}

// Embedded assets have already been materialized into the captured export context. A visible
// remote picture is still only a link, even after the author allowed it to load in the editor.
// Refuse the whole page, with every unresolved occurrence named; never export a missing picture
// or turn Export into a new network-consent path. The captured and working source stay untouched.
async function _rapierRequireOfflinePageImages(root) {
	const missing = [];
	for (const [index, image] of [...root.querySelectorAll('img,[data-rapier-remote-src]')].entries()) {
		const src = image.getAttribute('data-rapier-remote-src') ?? image.getAttribute('src') ?? '';
		if (globalThis.RapierImageAssets.dataImage(src)) continue;
		const alt = image.getAttribute('data-rapier-remote-alt') ?? image.getAttribute('alt') ?? '';
		const destination = /^data:/i.test(src) ? '(unsupported embedded image)' : src || '(missing image source)';
		missing.push('Picture ' + (index + 1) + (alt ? ' — ' + alt : '') + ': ' + destination);
	}
	if (!missing.length) return;
	// An acknowledged, scrollable sheet, not a disappearing toast or a partial-file opt-in.
	// Both Close and Cancel below refuse; neither can authorize a page with missing pictures.
	await rapierConfirm({
		title: 'pictures not included',
		message: 'No web page was written. Embed these pictures before exporting or sharing an offline page. '
			+ 'Your document is unchanged. ' + missing.join('; '),
		confirmLabel: 'close',
	});
	throw new Error('Web page not written; embed the listed pictures and try again');
}

async function _rapierBuildSharedPage(captured) {
	const context = await _rapierPrepareInterchangeContext({kind: 'share'}, captured);
	// One owner for every HTML file Rapier writes, including offline-image admission and CSP.
	// Share adds only the nearest-side no-script float and the long-code treatment.
	const artifact = await _rapierBuildArtifact({
		kind: 'standalone',
		extraCss: _rapierSharedPageFallbackCss(),
		afterRoot(root) {
			/* Unlike TXT/DOCX (which route through _rapierProjectPortableRoot and have no
				 native disclosure widget to fall back on), the shared page is a real HTML
				 document a real browser renders — the same styled root the standalone HTML
				 export already leaves untouched (_rapierBuildArtifact never flattens
				 details for kind:'standalone'). <details>/<summary> pass the 'export'
				 sanitize profile unchanged (only <form> is forbidden), so flattening here
				 only threw away a native, JS-free expand/collapse the architecture's own
				 fidelity table promises ("Complete shared/styled HTML: Exact recoverable
				 source"). Leave it as authored, exactly like standalone HTML export. */
			_rapierSharedPageLayout(root);
			_rapierShareCapLongCodeBlocks(root);
		},
	}, context);
	// No cap and no warning (docs/intent.md, picture format law): the page is as large as the
	// document is. A page over the editor's own 25 MiB open limit still opens in any browser.
	const blob = new Blob([artifact.html], {type: 'text/html;charset=utf-8'});
	return {blob, filename: context.baseName + '.html'};
}

async function _rapierShareFile(options) {
	const opts = options || {};
	const blob = opts.blob;
	const filename = String(opts.filename || 'document');
	const mime = String(opts.mime || (blob && blob.type) || 'application/octet-stream');
	const platform = window.RapierPlatform;

	if (platform?.host.canShare && typeof platform.host.share === 'function') {
		try {
			/* Native share APIs ack opening the system share surface, not delivery to a target. */
			const opened = await platform.host.share(blob, filename, mime) === true;
			if (opened) _rapierAnnounceShared(filename, blob);
			return opened;
		} catch (error) {
			if (error?.name === 'AbortError') return false;
			console.warn('[rapier] native share failed', error);
		}
	}

	if (platform && platform.environment.allowsWebShareFallback === true) {
		try {
			if (navigator.canShare && navigator.share && typeof File !== 'undefined') {
				const file = new File([blob], filename, { type: mime });
				if (navigator.canShare({ files: [file] })) {
					if (navigator.userActivation?.isActive === false && !await rapierConfirm({
						title: 'ready to share', message: filename, confirmLabel: 'share',
					})) return false;
					await navigator.share({ files: [file], title: filename });
					_rapierAnnounceShared(filename, blob);
					return true;
				}
			}
		} catch (error) {
			if (error && error.name === 'AbortError') return false;
			console.warn('[rapier] share failed, falling back to save', error);
		}
	}

	const saved = await _download(blob, filename);
	if (saved === true) {
		showToast('share unavailable — saved ' + _rapierShareProduced(filename, blob) + ' instead', 'info');
		return true;
	}
	if (saved === null) showToast('share unavailable — ' + filename + ' could not be saved', 'error');
	return false;
}

// What was produced, named exactly (Weapon §11.5): the file and its size, never a generic word.
function _rapierShareProduced(filename, blob) {
	const bytes = blob && Number.isFinite(blob.size) ? blob.size : 0;
	const size = bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KiB' : (bytes / 1048576).toFixed(1) + ' MiB';
	return bytes ? filename + ' (' + size + ')' : filename;
}

// A share that opened the system sheet: announced to assistive tech (the sheet itself is not in
// the page) and named on screen -- the sheet shows the destination, this names what went into it.
function _rapierAnnounceShared(filename, blob) {
	const produced = _rapierShareProduced(filename, blob);
	try { if (typeof srAnnounce === 'function') srAnnounce('shared ' + produced); } catch (_) {}
	try { showToast('shared ' + produced, 'success'); } catch (_) {}
}

// A return belongs to the carried document's identity, not this window or the document's current
// filename. Capture through Share's settled source door; never mutate or mark the document saved.
const _rapierPageReturn = {address: null, expiresAt: null, stamp: null, state: 'ready', message: '', timer: null};
function _rapierBindPageReturn(address, stamp = _rapierMutationStamp(), expiry = null) {
	let admitted = null, expiresAt = null;
	try {
		if (address) {
			expiresAt = Date.parse(RapierPageReturnAddress.returnExpiresAt(expiry));
			admitted = RapierPageReturnAddress.returnAddress(address);
		}
	} catch (_) { admitted = expiresAt = null; }
	if (!_rapierMutationStampSharesDocument(stamp)) return;
	Object.assign(_rapierPageReturn, {address: admitted, expiresAt, stamp, state: 'ready', message: ''});
	_rapierRenderPageReturn();
}
function _rapierPageReturnCurrent() {
	return !!_rapierPageReturn.address && _rapierMutationStampSharesDocument(_rapierPageReturn.stamp);
}
function _rapierRenderPageReturn() {
	clearTimeout(_rapierPageReturn.timer);
	_rapierPageReturn.timer = null;
	if (_rapierPageReturnCurrent() && _rapierPageReturn.state === 'ready') {
		const remaining = _rapierPageReturn.expiresAt - Date.now();
		if (remaining <= 0) {
			_rapierPageReturn.state = 'expired';
			_rapierPageReturn.message = 'Return expired. Your work is safe on this page.';
		} else _rapierPageReturn.timer = setTimeout(_rapierRenderPageReturn, Math.min(remaining, 2147483647));
	}
	const button = document.getElementById('share-send-back');
	const status = document.getElementById('share-send-back-status');
	if (!button || !status) return;
	button.hidden = !_rapierPageReturnCurrent();
	button.disabled = _rapierPageReturn.state === 'sending' || _rapierPageReturn.state === 'accepted';
	button.querySelector('.export-choice__label').textContent = ['expired', 'used'].includes(_rapierPageReturn.state) ? 'Save' : 'Send back';
	status.textContent = _rapierPageReturn.message || 'send this document back to the agent who gave you this page';
}
async function _rapierSendBack() {
	if (!_rapierPageReturnCurrent()) return false;
	const saveOffered = ['expired', 'used'].includes(_rapierPageReturn.state);
	_rapierRenderPageReturn();
	if (['expired', 'used'].includes(_rapierPageReturn.state)) return saveOffered ? rapierSave({forceSaveAs: true}) : false;
	if (_rapierPageReturn.state === 'sending' || _rapierPageReturn.state === 'accepted') return false;
	_rapierPageReturn.state = 'sending';
	_rapierPageReturn.message = 'Sending…';
	_rapierRenderPageReturn();
	try {
		const captured = await _rapierCaptureSettledExternalDocument();
		if (!captured || !_rapierPageReturnCurrent() || !_rapierMutationStampSharesDocument(captured.stamp)) {
			_rapierPageReturn.state = 'ready';
			_rapierPageReturn.message = 'Not sent. The document changed or is still being edited.';
			return false;
		}
		if (_rapierPageReturn.expiresAt <= Date.now()) { _rapierPageReturn.state = 'ready'; return false; }
		// No redirect may forward the source to another destination; a lost answer is not acceptance.
		const response = await fetch(_rapierPageReturn.address, {
			method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
			headers: {'Content-Type': 'text/markdown;charset=utf-8', 'X-Rapier-Name': encodeURIComponent(captured.metadata.filename)},
			body: (captured.metadata.bom ? '\uFEFF' : '') + captured.canonical,
		});
		const answer = await response.json();
		const accepted = response.ok && answer?.accepted === true;
		_rapierPageReturn.state = accepted ? 'accepted' : response.status === 410 ? 'expired' : response.status === 409 ? 'used' : 'ready';
		_rapierPageReturn.message = accepted ? 'Accepted. Your document was sent back.'
			: _rapierPageReturn.state === 'expired' ? 'Return expired. Your work is safe on this page.'
			: _rapierPageReturn.state === 'used' ? 'Return already used. Your work is safe on this page.'
			: 'Refused: ' + (typeof answer?.reason === 'string' ? answer.reason : 'the worker did not accept this return.');
		return accepted;
	} catch (_) {
		_rapierPageReturn.state = 'ready';
		_rapierPageReturn.message = 'Not confirmed. Check your connection. Nothing is retried automatically.';
		return false;
	} finally { _rapierRenderPageReturn(); }
}

async function rapierShare(kind) {
	try {
		const captured = await _rapierCaptureSettledExternalDocument();
		if (!captured) return false;
		if (kind !== 'web') return await _rapierShareFile({
			blob: new Blob([(captured.metadata.bom ? '\uFEFF' : '') + captured.canonical], {type: captured.metadata.mime}),
			filename: captured.metadata.saveName, mime: captured.metadata.mime,
		});
		const page = await _rapierBuildSharedPage(captured);
		return await _rapierShareFile({...page, mime: 'text/html'});
	} catch (error) {
		showToast('Could not share: ' + error.message, 'error');
		return false;
	}
}

// Image compatibility mode's one writer (R81). A shared page carries JPEG XL -- every current
// browser opens it and it is far smaller; ON converts each picture to the PNG or JPEG an older
// reader needs. The toggle's own `aria-pressed` is the state: one truth, nothing mirrored, nothing
// stored. It lives here rather than in the engine because it is a fact about sharing, and the
// engine's ownership ratchet is right to push it out.
function _rapierShareCompatSet(toggle, on) {
	if (!toggle) return;
	toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
	const state = toggle.querySelector('.export-choice-toggle__state');
	if (state) state.textContent = on ? 'ON' : 'OFF';
}
