function _rapierPortableRequiredPlugins(source, options = {}) {
  const required = new Set(), assets = globalThis.RapierImageAssets;
  if (options.docKind && options.docKind !== 'markdown') return required;
  const parser = assets.markdownParser();
  const drawing = text => {
    const recipe = globalThis.RapierDrawCore?._rapierDrawReadRecipeFromSVGText(text);
    if (recipe) required.add('drawing');
    for (const shape of recipe?.shapes || []) {
      if (typeof shape.textFont === 'string' && shape.textFont.startsWith('letters:')) required.add('letters-' + shape.textFont.slice(8));
    }
  };
  const visit = tokens => {
    for (const token of tokens || []) {
      if (token.type === 'math_inline' || token.type === 'math_block') required.add('math');
      else if (token.type === 'fence' && token.meta?.rapierFenceClosed === true &&
        token.info.trim().split(/\s+/)[0].toLowerCase() === 'math') required.add('math');
      else if (token.type === 'fence' && token.info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid' &&
        globalThis.RapierFlowchart?.parseFlowchart(token.content).ok !== true) {
        required.add('mermaid');
        if (globalThis.RapierPluginLoader?.zenumlSource(token.content) != null) required.add('mermaid-zenuml');
        if (_rapierProviders.mermaid?.requiresMath?.(token.content)) required.add('math');
      }
      else if (token.type === 'image') {
        const url = token.attrGet('src');
        if (assets.dataImage(url)?.codec === 'image/svg+xml') drawing(new TextDecoder('utf-8', {fatal: true}).decode(assets.decodeDataImageBytes(url).bytes));
      } else if (/^html_(?:block|inline)$/.test(token.type) && /^\s*<svg[\s>]/i.test(token.content)) drawing(token.content);
      if (token.children) visit(token.children);
    }
  };
  for (const text of [source, options.base]) if (typeof text === 'string' && globalThis.RapierMarkdownSpec.isTemplatePage(text)) required.add('layout');
  for (const text of [source, options.base]) if (typeof text === 'string' && /[$\\]|math|mermaid|svg/i.test(text)) visit(parser.parse(text.slice(assets.markdownBodyOffset(text)), {}));
  return required;
}

async function _rapierPackPortablePlugins(groups) {
  const out = {groups: [], bodies: new Map()};
  for (const group of groups) {
    const element = 'rapier-plugin-' + group.id, files = group.files.map(({value, ...file}) => file);
    const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const stream = new Blob(group.files.map(file => file.value)).stream().pipeThrough(new CompressionStream('gzip'));
    const stored = _rapierBase124.encodeBase124(new Uint8Array(await new Response(stream).arrayBuffer()));
    let payload = '<script type="application/rapier-runtime" id="' + element + '">\n' +
      '/* RAPIER_VENDOR_GROUP bytes=' + bytes + ' stored=gzip+base124 */\n' + stored + '\n/* RAPIER_VENDOR_GROUP_END */\n';
    let offset = 0;
    for (const file of files) {
      payload += '/* RAPIER_VENDOR_SPAN ' + file.name + ' offset=' + offset + ' bytes=' + file.bytes + ' */\n';
      offset += file.bytes;
    }
    payload += '/* RAPIER_VENDOR_SPANS_END */\n</script>\n';
    out.bodies.set(group.id, payload);
    out.groups.push({id: group.id, delivery: 'built-in', kind: group.kind, element, bytes, packedBytes: new TextEncoder().encode(payload).length, files});
  }
  return out;
}

async function _rapierPackPlainGroups(html) {
  const plain = /(<script\b[^>]*\bid="([^"]+)"[^>]*>)\n?(\/\* RAPIER_VENDOR_GROUP bytes=\d+ stored=plain \*\/\n[^<]*)<\/script>/g;
  const groups = new Map();
  for (const [, , id, text] of html.matchAll(plain)) groups.set(id, await _rapierInflateVendor(id, text));
  if (!groups.size) return html;
  const pack = async spans => {
    const stream = new Blob(spans.map(span => span.bytes)).stream().pipeThrough(new CompressionStream('gzip'));
    let offset = 0, group = '/* RAPIER_VENDOR_GROUP bytes=' + spans.reduce((sum, span) => sum + span.bytes.length, 0) + ' stored=gzip+base124 */\n' +
      _rapierBase124.encodeBase124(new Uint8Array(await new Response(stream).arrayBuffer())) + '\n/* RAPIER_VENDOR_GROUP_END */\n';
    for (const span of spans) {
      group += '/* RAPIER_VENDOR_SPAN ' + span.name + ' offset=' + offset + ' bytes=' + span.bytes.length + ' */\n';
      offset += span.bytes.length;
    }
    return group + '/* RAPIER_VENDOR_SPANS_END */\n';
  };
  const pin = ({file, bytes, sri}) => 'file:' + JSON.stringify(file) + ',bytes:' + bytes + ',sri:' + JSON.stringify(sri);
  const packed = new Map(), pins = [];
  for (const [id, spans] of groups) {
    if (!id.startsWith('rapier-part-')) continue;
    const body = await pack(spans), bytes = new TextEncoder().encode(body);
    packed.set(id, body);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes)), held = RapierParts.pin(id.slice('rapier-part-'.length));
    pins.push([pin(held), pin({file: held.file, bytes: bytes.length, sri: btoa(String.fromCharCode(...digest))})]);
  }
  for (const [id, spans] of groups) {
    if (packed.has(id)) continue;
    packed.set(id, await pack(spans.map(span => {
      if (span.name !== 'rapier-parts.js') return span;
      const source = pins.reduce((text, [from, to]) => {
        if (text.split(from).length !== 2) throw new Error('Offline editor not written: the part pins could not be carried.');
        return text.replace(from, () => to);
      }, span.source);
      pins.length = 0;
      return {...span, bytes: new TextEncoder().encode(source)};
    })));
  }
  if (pins.length) throw new Error('Offline editor not written: the part pins could not be carried.');
  return html.replace(plain, (whole, open, id) => open + (id.startsWith('rapier-part-') ? '' : '\n') + packed.get(id) + '</script>');
}

const _RAPIER_PORTABLE_PAYLOAD_TYPES = new Set(['application/rapier-runtime', 'application/rapier-jxl-worker', 'text/rapier-vendor', 'application/speedracer-app+json']);

function _rapierUniquePayloads(rows) {
	const seen = new Set();
	for (const row of document.querySelectorAll('script')) if (row.id && row.parentNode === document.head) seen.add(row.id);
	return rows.filter(row => {
		const key = row && (row.id || ('\n' + row.type + '\n' + row.textContent));
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

const _RAPIER_PORTABLE_CHOICES = [{id: 'drawing', label: 'Draw'}, {id: 'layout', label: 'Document layout', part: 'document'}, {id: 'math', label: 'Math'}, {id: 'mermaid', label: 'Mermaid', part: 'diagramtheme'}];

async function _rapierPortableChoices(source, options = {}) {
  const {head, first} = globalThis.RapierPortableShell;
  for (const id of ['rapier-platform-runtime', 'rapier-codec-runtime', 'rapier-jxl-worker', 'rapier-styles-runtime', 'rapier-editor-runtime']) {
    await _rapierWhenRuntime(id);
  }
  await _rapierWhenRuntime('lib-acorn');
  const manifest = document.getElementById('rapier-builtin-plugins'), groups = manifest ? JSON.parse(manifest.textContent) : [];
  const optional = new Set(['rapier-builtin-plugins', ...groups.map(group => group.element)]);
  const payloads = _rapierUniquePayloads(Array.from(document.querySelectorAll('script')).filter(row =>
    _RAPIER_PORTABLE_PAYLOAD_TYPES.has(row.type) && row.id !== 'rapier-apps-runtime' && row.id !== 'rapier-first-paint-runtime' && row.parentNode !== document.head &&
    !optional.has(row.id) && !/^rapier-(?:part|plugin)-/.test(row.id)));
  const required = _rapierPortableRequiredPlugins(source, options);
  const used = new Set([...required].map(key => key.startsWith('letters-') ? 'drawing' : key));
  for (const id of options.also || []) used.add(id);
  if (used.has('mermaid') && groups.some(group => group.id === 'mermaid-zenuml')) used.add('mermaid-zenuml');
  const keys = [...used].filter(id => id !== 'drawing' && id !== 'layout').concat(used.has('drawing') ? ['letters'] : []);
  const plugins = groups.length ? await RapierBundledPlugins.portable(keys) : {groups: [], bodies: new Map()};
  const rest = keys.filter(id => !plugins.bodies.has(id));
  if (rest.length && globalThis.RapierPluginLoader) {
    const packed = await _rapierPackPortablePlugins((await globalThis.RapierPluginLoader.portable([])).filter(group => rest.includes(group.id)));
    plugins.groups.push(...packed.groups);
    for (const [id, body] of packed.bodies) plugins.bodies.set(id, body);
  }
  if (required.has('mermaid-zenuml') && !plugins.groups.some(group => group.id === 'mermaid-zenuml'))
    throw Object.assign(new Error('Offline editor not written; install the diagram plug-in before exporting this document.'), {code: 'offline_plugin_unavailable', plugin: 'mermaid-zenuml'});
  const choices = [];
  for (const choice of _RAPIER_PORTABLE_CHOICES) {
    if (!used.has(choice.id)) continue;
    let html;
    if (choice.id === 'drawing') {
      if (typeof RapierParts === 'undefined' || !RapierParts.has('drawing')) continue;
      try { html = await RapierParts.element('drawing'); }
      catch (cause) { if (options.also?.includes('drawing')) throw Object.assign(new Error('Offline editor not written; open Draw once while connected, then save again.', {cause}), {code: 'offline_part_unavailable', part: 'drawing'}); continue; }
    }
    if (choice.part) {
      if (typeof RapierParts === 'undefined' || !RapierParts.has(choice.part)) continue;
      try { html = await RapierParts.element(choice.part); } catch (_) { continue; }
    }
    const carried = plugins.groups.filter(group => group.id === choice.id || choice.id === 'mermaid' && group.id === 'mermaid-zenuml' || choice.id === 'drawing' && group.id === 'letters');
    if (choice.id !== 'drawing' && (!choice.part || choice.id === 'mermaid') && !carried.length) continue;
    choices.push({...choice, html: html || '', needed: choice.id !== 'drawing' && required.has(choice.id), groups: carried});
  }
  const SEP = '\n<!--rapier-piece-->\n', pieces = [head, first, ...payloads.map(row => row.outerHTML), ...choices.map(choice => choice.html)];
  const packed = (await _rapierPackPlainGroups(pieces.join(SEP))).split(SEP);
  if (packed.length !== pieces.length) throw new Error('The offline editor could not be packed.');
  const [shellHead, shellFirst, ...packedRest] = packed, payloadHtml = packedRest.slice(0, payloads.length);
  choices.forEach((choice, index) => { choice.html = packedRest[payloads.length + index]; });
  const encoder = new TextEncoder(), length = text => encoder.encode(text).length;
  for (const choice of choices) choice.bytes = length(choice.html) + choice.groups.reduce((sum, group) => sum + length(plugins.bodies.get(group.id)) + length(JSON.stringify(group)) + 1, 0);
  const held = /<script type="application\/json" id="rapier-builtin-plugins">[^<]*<\/script>\n?/.exec(shellHead);
  const assemble = ids => {
    const chosen = choices.filter(choice => ids.has(choice.id)), carried = chosen.flatMap(choice => choice.groups);
    const inventory = carried.length ? '<script type="application/json" id="rapier-builtin-plugins">' + JSON.stringify(carried).replace(/</g, '\\u003c') + '</script>\n' : '';
    const shell = held ? shellHead.slice(0, held.index) + inventory + shellHead.slice(held.index + held[0].length) : shellHead;
    return globalThis.RapierPortablePage.offlineTemplate('<!doctype html><html lang="en"><head>' + shell + '</head><body>' + shellFirst +
      '\n<template id="rapier-ui-slot"></template>\n' + payloadHtml.join('\n') + '\n' + chosen.map(choice => choice.html).join('') +
      (held ? '' : inventory) + carried.map(group => plugins.bodies.get(group.id)).join('') + '</body></html>');
  };
  return {choices, assemble, needs: new Set(choices.filter(choice => choice.needed || options.also?.includes(choice.id)).map(choice => choice.id))};
}

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

function _rapierEditablePageFilename(name) {
	const filename = String(name || 'document'), carried = /\.rapier\.html$/i.exec(filename);
	const stem = (carried ? filename.slice(0, carried.index) : filename.replace(/(.)\.[a-z0-9]+$/i, '$1')) || 'document';
	let kept = '', bytes = 0;
	for (const character of stem) {
		const code = character.codePointAt(0);
		bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
		if (bytes > 243) break;
		kept += character;
	}
	return (kept || 'document') + (carried ? carried[0] : '.rapier.html');
}

async function _rapierReadSharedDocument(text, filename) {
	if (!/\.rapier\.html$/i.test(String(filename || ''))) {
		if (!/\.html?$/i.test(String(filename || '')) || !String(text).includes('<script type="text/markdown" id="rapier-document"'))
			return _rapierRenderModule('render')._rapierReadSharedDocument(text, filename);
		filename = _rapierEditablePageFilename(filename);
	}
	const template = document.createElement('template');
	template.innerHTML = String(text);
	const carriers = Array.from(template.content.querySelectorAll('#rapier-document'));
	if (carriers.length !== 1 || carriers[0].tagName !== 'SCRIPT' || carriers[0].type !== 'text/markdown') {
		if (!carriers.length) {
			const page = await _rapierRenderModule('render')._rapierReadSharedDocument(text, String(filename).replace(/\.rapier\.html$/i, '.html'));
			if (page) return page;
		}
		throw new Error('This HTML editor file has no complete editable document.');
	}
	const carrier = carriers[0], name = carrier.getAttribute('data-name') || 'document.md';
	const kind = carrier.getAttribute('data-kind') || _classifyDocKind(name);
	if (!_rapierDocumentNameIsAdmissible(filename) || !_rapierDocumentNameIsAdmissible(name) || !['markdown', 'text', 'code'].includes(kind))
		throw new Error('This HTML editor file has invalid document metadata.');
	const source = RapierLedgerCarried.decodeCarried(carrier.textContent), bom = source.charCodeAt(0) === 0xFEFF;
	if (globalThis.RapierPortablePage?.unwrap(String(text)).text !== source)
		throw new Error('This HTML editor file has an incomplete or changed source carrier.');
	if (RapierTextCodec.normalizeDocument(source) !== (bom ? source.slice(1) : source))
		throw new Error('This HTML editor file has invalid source text.');
	const parts = RapierLedgerCarried.readParts(source, Array.from(template.content.querySelectorAll('#rapier-ledger, #rapier-authorship')));
	const comparisonBase = RapierLedgerCarried.readBaseElements(Array.from(template.content.querySelectorAll('#rapier-base')));
	return {source: bom ? source.slice(1) : source, filename, name, kind, bom, ...parts, comparisonBase, editablePage: true};
}

async function _rapierBuildEditablePage(captured, options = {}) {
	const page = await _rapierPrepareEditablePage(captured, options);
	return page.write(options.include ? new Set(options.include) : page.needs);
}

async function _rapierPrepareEditablePage(captured, options = {}) {
	const theme = document.body.classList.contains('light') ? 'light' : 'dark';
	if (!globalThis.RapierPortableShell || !globalThis.RapierPortablePage)
		throw new Error('The offline editor package is unavailable on this host.');
	const pictured = text => /!\[|<(?:img|image|source)\b/i.test(text);
	let linked = 0, readableRoot = null;
	const keepLinks = async root => {
		try { await _rapierRenderModule('render')._rapierRequireOfflinePageImages(root); }
		catch (error) { if (error?.code !== 'offline_image_unavailable') throw error; linked = Math.max(linked, error.missing?.length || 1); }
	};
	if (pictured(captured.canonical)) {
		const current = await _rapierPrepareInterchangeContext({kind: 'page', imageCompat: false, preserveObjects: true}, captured);
		await keepLinks(current.semanticRoot);
		readableRoot = current.semanticRoot;
		captured = {...captured, canonical: current.canonical, comparisonBase: current.comparisonBase};
	} else if (captured.metadata.docKind === 'markdown') captured = await _rapierInterchangeFonts(captured, true);
	if (captured.comparisonBase && pictured(captured.comparisonBase.text)) {
		const base = await _rapierPrepareInterchangeContext({kind: 'page', imageCompat: false, comparison: true, preserveObjects: true}, {...captured, canonical: captured.comparisonBase.text});
		await keepLinks(base.semanticRoot);
	}
	const linkedWords = linked ? (linked === 1 ? '1 picture stays a web link.' : linked + ' pictures stay web links.') : '';
	const portable = await _rapierPortableChoices(captured.canonical,
		{docKind: captured.metadata.docKind, base: captured.comparisonBase?.text, also: options.also});
	const text = (captured.metadata.bom ? '\uFEFF' : '') + captured.canonical;
	const {filename, codeLang} = captured.metadata, ext = codeLang && Object.keys(EXT_TO_LANG).find(e => EXT_TO_LANG[e] === codeLang);
	const own = document.getElementById('rapier-document')?.dataset.name;
	const carrierName = !/\.rapier\.html$/i.test(filename) ? filename
		: own && !/\.rapier\.html$/i.test(own) && (_rapierEditablePageFilename(own) === _rapierEditablePageFilename(filename) || _rapierCarriedKeep.opened === filename) && (!ext || own.endsWith('.' + ext)) ? own
		: filename.replace(/\.rapier\.html$/i, '.' + (ext || (captured.metadata.docKind === 'text' ? 'txt' : 'md')));
	const carriedParts = new Map();
	const readable = _rapierReadableWithoutScripts(captured, readableRoot);
	const write = (ids, carried = captured.carried) => {
		if (!carriedParts.has(carried)) carriedParts.set(carried, _rapierLedgerParts(text, captured.ledger, carried));
		const parts = carriedParts.get(carried);
		const html = globalThis.RapierPortablePage.wrap(portable.assemble(ids), text, carrierName, {
			kind: captured.metadata.docKind, theme, base: captured.comparisonBase || undefined, readable, ...parts,
		});
		const blob = new Blob([html], {type: 'text/html; charset=utf-8'});
		if (blob.size > RapierTextCodec.maxDocumentBytes) throw new Error('This HTML editor file exceeds 64 MiB.');
		return {blob, linkedWords, filename: _rapierEditablePageFilename(captured.metadata.filename), mime: blob.type, canonical: captured.canonical,
			included: portable.choices.filter(choice => ids.has(choice.id)).map(choice => choice.id)};
	};
	return {choices: portable.choices, needs: portable.needs, write};
}

function _rapierReadableWithoutScripts(captured, preparedRoot = null) {
	const {docKind, filename} = captured.metadata;
	if (docKind !== 'markdown') {
		const pre = document.createElement('pre');
		pre.textContent = captured.canonical;
		return pre.outerHTML;
	}
	const render = _rapierRenderModule('render-markdown');
	const root = preparedRoot || render._rapierRenderSemanticRoot(captured.canonical, captured.metadata);
	return render._rapierProjectPortableRoot(render._rapierHeldPicturesAsWords(root), {baseName: _rapierExportStem(filename)}).innerHTML;
}

function _rapierPortableLacks(name) {
	if (typeof RapierParts === 'undefined' || !RapierParts.sealed()) return false;
	showToast('No ' + name + ' in this file.', 'info');
	return true;
}

function _rapierEditablePageCarries() {
	if (!document.getElementById('rapier-document')) return 'history';
	return document.getElementById('rapier-ledger') ? 'history' : document.getElementById('rapier-authorship') ? 'authorship' : 'none';
}

function _rapierEditablePageKeeps() {
	return typeof RapierParts !== 'undefined' && RapierParts.has('drawing') &&
		(document.getElementById('rapier-part-drawing') || RapierParts.ready('drawing')) ? ['drawing'] : [];
}

async function _rapierEditablePageChosen(captured, action, task) {
	const page = await _rapierPrepareEditablePage(captured, {also: _rapierEditablePageKeeps()});
	task.check(); task.end();
	const overlay = document.getElementById('editor-file-overlay');
	if (!overlay) return page.write(page.needs);
	const list = overlay.querySelector('.editor-file-choices'), go = overlay.querySelector('[data-editor-file="go"]');
	const chosen = new Set(page.needs);
	if (page.choices.some(choice => choice.id === 'drawing')) chosen.add('drawing');
	let carried = ['authorship', 'history'].includes(captured.carried) && captured.ledger ? captured.carried : 'none';
	const toggle = (id, words, size) => {
		const row = document.createElement('button'), text = document.createElement('span'), label = document.createElement('span');
		const state = document.createElement('span');
		row.type = 'button'; row.className = 'export-choice-toggle'; row.dataset.editorFile = id;
		text.className = 'export-choice-toggle__text'; label.className = 'export-choice-toggle__label';
		state.className = 'export-choice-toggle__state';
		label.textContent = words; text.append(label);
		if (size != null) {
			const hint = document.createElement('span');
			hint.className = 'export-choice-toggle__hint'; hint.textContent = _rapierShareSize(size);
			text.append(hint);
		}
		row.append(text, state);
		return row;
	};
	const rows = page.choices.map(choice => toggle(choice.id, choice.label, choice.bytes));
	if (captured.ledger) {
		const note = document.createElement('p');
		note.className = 'export-choice__description'; note.textContent = 'History includes deleted text.';
		rows.push(toggle('ledger:authorship', 'Who wrote what'), toggle('ledger:history', 'The whole history'), note);
	}
	list.replaceChildren(...rows);
	go.querySelector('.export-choice__label').textContent = action;
	let written = null;
	const paint = () => {
		for (const row of list.querySelectorAll('[data-editor-file]')) {
			const id = row.dataset.editorFile, on = id.startsWith('ledger:') ? carried === id.slice(7) : chosen.has(id);
			row.setAttribute('aria-pressed', on ? 'true' : 'false');
			row.querySelector('.export-choice-toggle__state').textContent = on ? 'ON' : 'OFF';
		}
		written = page.write(chosen, carried);
		go.querySelector('.export-choice__description').textContent = _rapierShareSize(written.blob.size);
	};
	paint();
	return new Promise(resolve => {
		const done = value => {
			overlay.removeEventListener('click', click);
			closeDialog(overlay);
			resolve(value);
		};
		const click = event => {
			const control = event.target.closest?.('[data-editor-file]');
			if (!control) return;
			const id = control.dataset.editorFile;
			if (id === 'go') done(written);
			else if (id === 'close') done(null);
			else if (id.startsWith('ledger:')) { carried = carried === id.slice(7) ? 'none' : id.slice(7); paint(); }
			else { if (chosen.has(id)) chosen.delete(id); else chosen.add(id); paint(); }
		};
		overlay.addEventListener('click', click);
		openDialog(overlay, {onEscape: () => done(null)});
	});
}

async function _rapierShareFile(options) {
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	const opts = options || {};
	const blob = opts.blob;
	const filename = String(opts.filename || 'document');
	const mime = String(opts.mime || (blob && blob.type) || 'application/octet-stream');
	const platform = window.RapierPlatform;

	if (platform?.host.canShare && typeof platform.host.share === 'function') {
		try {
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
						title: 'ready to share', message: filename, confirmLabel: 'Share',
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

	const place = {};
	const saved = await _download(blob, filename, place);
	if (saved === true) {
		showToast('Saved ' + _rapierShareProduced(place.name || filename, blob) + (place.where || ''), 'success');
		return true;
	}
	if (saved === null) showToast('Couldn’t save ' + filename + '.', 'error');
	return false;
}

const _rapierCarriedKeep = {authority: '', hinted: false, opened: ''};
function _rapierOwnPageFilename() {
	try {
		if (!/^(?:file|https?):$/.test(location.protocol)) return '';
		const base = decodeURIComponent(location.pathname.split('/').pop() || '');
		if (!/.\.html?$/i.test(base) || !_rapierDocumentNameIsAdmissible(base)) return '';
		const proper = /.\.rapier\.html$/i.test(base) && !/\.html?\.html?$/i.test(base);
		if (!proper && location.protocol !== 'file:') return '';
		const carried = document.getElementById('rapier-document')?.getAttribute('data-name') || '';
		return _rapierRecoveredPageFilename(base, carried);
	} catch (_) { return ''; }
}
function _rapierRecoveredPageFilename(filename, carriedName) {
	const base = String(filename || '');
	if (/.\.rapier\.html$/.test(base) && !/\.html?\.html?$/i.test(base)) return _rapierEditablePageFilename(base);
	let stem = base.replace(/(?:\.html?)+$/i, '');
	stem = stem.replace(/(?:\s*\(\d+\)|\[\d+\])+$/g, '').replace(/\s+-\s+copy$/i, '').replace(/\s*\(copy\)$/i, '');
	if (/_rapier$/i.test(stem)) stem = stem.replace(/_rapier$/i, '');
	else stem = stem.replace(/\.rapier$/i, '');
	const generic = /^(?:att\d+|winmail|untitled|noname|attachment)$/i.test(stem);
	if (generic) {
		const carried = String(carriedName || '');
		if (carried && _rapierDocumentNameIsAdmissible(carried)) return _rapierEditablePageFilename(carried);
		stem = 'document';
	}
	return stem ? _rapierEditablePageFilename(stem + '.rapier.html') : '';
}
function _rapierCarriedKeepSettled() {
	for (const toast of document.querySelectorAll('#toast-root .toast[data-notice-kind="carried-keep"]')) {
		if (typeof toast._rapierDismiss === 'function') toast._rapierDismiss({immediate: true}); else toast.remove();
	}
}
function _rapierCarriedKeepHint() {
	const authority = String(rapier.identity.authority || '');
	if (_rapierCarriedKeep.hinted || !authority || _rapierCarriedKeep.authority !== authority) return;
	const files = window.RapierPlatform?.files;
	if (files?.hasWritable?.(authority) || !/\.rapier\.html$/i.test(rapier.document.filename || '')) return;
	_rapierCarriedKeep.hinted = true;
	const name = String(rapier.document.filename);
	showToast(files?.savesChosenType === true
		? 'Save over ' + name + ' to keep changes.'
		: 'Press Save to keep changes.',
		'info', {label: 'Save', fn: () => rapierSave(), kind: 'carried-keep'});
}

function _rapierShareProduced(filename, blob) {
	const bytes = blob && Number.isFinite(blob.size) ? blob.size : 0;
	return bytes ? filename + ' (' + _rapierShareSize(bytes) + ')' : filename;
}
function _rapierShareSize(bytes) {
	return bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
}

function _rapierAnnounceShared(filename, blob) {
	const produced = _rapierShareProduced(filename, blob);
	try { if (typeof srAnnounce === 'function') srAnnounce('shared ' + produced); } catch (_) {}
}

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
function _rapierReturnSaid(message) { return Object.assign(new Error(message), {said: true}); }
function _rapierReturnLost() { return 'Not confirmed. Check your connection. Nothing is retried automatically.'; }
async function _rapierSendBack() {
	if (!_rapierPageReturnCurrent()) return false;
	const saveOffered = ['expired', 'used'].includes(_rapierPageReturn.state);
	_rapierRenderPageReturn();
	if (['expired', 'used'].includes(_rapierPageReturn.state)) return saveOffered ? rapierSave({forceSaveAs: true}) : false;
	if (_rapierPageReturn.state === 'sending' || _rapierPageReturn.state === 'accepted') return false;
	_rapierPageReturn.state = 'sending';
	if (!/\/return\/rpret_[a-f0-9]{64}\.return_[a-f0-9]{32}$/.test(_rapierPageReturn.address)) return _rapierSendBackDirect();
	_rapierPageReturn.message = 'Sending…';
	_rapierRenderPageReturn();
	try {
		const address = _rapierPageReturn.address, origin = new URL(address).origin;
		const popup = window.open(address, '_blank', 'popup');
		if (!popup) throw _rapierReturnSaid('Open the return page to authorize this upload.');
		const {status, answer} = await new Promise((resolve, reject) => {
			let started = false, port;
			const finish = (value, error) => {
				window.removeEventListener('message', ready); clearTimeout(timeout); clearInterval(closed);
				port?.close();
				if (error) { popup.close(); reject(error); } else resolve(value);
			};
			const ready = async event => {
				if (event.source !== popup || event.origin !== origin || started) return;
				if (event.data?.type === 'rapier-return-unavailable') {
					started = true; return finish({status: event.data.status, answer: {accepted: false, reason: event.data.reason}});
				}
				if (event.data?.type !== 'rapier-return-ready') return;
				started = true;
				try {
					const captured = await _rapierCaptureSettledExternalDocument();
					if (!captured || !_rapierPageReturnCurrent() || _rapierPageReturn.address !== address ||
						!_rapierMutationStampSharesDocument(captured.stamp) || _rapierPageReturn.expiresAt <= Date.now())
						throw _rapierReturnSaid('The document changed or the return expired while settling.');
					const channel = new MessageChannel(); port = channel.port1;
					port.onmessage = event => {
						const data = event.data;
						if (data?.type === 'rapier-return-result' && Number.isInteger(data.status) && data.status >= 200 && data.status <= 599)
							finish({status: data.status, answer: data.answer});
					};
					popup.postMessage({type: 'rapier-return-document', name: captured.metadata.filename,
						source: (captured.metadata.bom ? '\uFEFF' : '') + captured.canonical}, origin, [channel.port2]);
				} catch (error) { finish(null, error); }
			};
			window.addEventListener('message', ready);
			const timeout = setTimeout(() => finish(null, _rapierReturnSaid('Return confirmation timed out.')), 5 * 60 * 1000);
			const closed = setInterval(() => { if (popup.closed) finish(null, _rapierReturnSaid('Return page closed.')); }, 500);
		});
		const accepted = status >= 200 && status < 300 && answer?.accepted === true;
		_rapierPageReturn.state = accepted ? 'accepted' : status === 410 ? 'expired' : status === 409 ? 'used' : 'ready';
		_rapierPageReturn.message = accepted ? 'Accepted. Your document was sent back.'
			: _rapierPageReturn.state === 'expired' ? 'Return expired. Your work is safe on this page.'
			: _rapierPageReturn.state === 'used' ? 'Return already used. Your work is safe on this page.'
			: 'Refused: ' + (typeof answer?.reason === 'string' ? answer.reason : 'the worker did not accept this return.');
		return accepted;
	} catch (error) {
		_rapierPageReturn.state = 'ready';
		_rapierPageReturn.message = error?.said ? error.message : _rapierReturnLost();
		return false;
	} finally { _rapierRenderPageReturn(); }
}

async function _rapierSendBackDirect() {
	_rapierPageReturn.message = 'Sending…';
	_rapierRenderPageReturn();
	try {
		const captured = await _rapierCaptureSettledExternalDocument();
		if (!captured || !_rapierPageReturnCurrent() || !_rapierMutationStampSharesDocument(captured.stamp)) {
			_rapierPageReturn.state = 'ready';
			_rapierPageReturn.message = 'Not sent. The document changed or is still being edited.';
			return false;
		}
		if (_rapierPageReturn.expiresAt <= Date.now()) {
			_rapierPageReturn.state = 'expired';
			_rapierPageReturn.message = 'Return expired. Your work is safe on this page.';
			return false;
		}
		const response = await fetch(_rapierPageReturn.address, {
			method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
			headers: {'Content-Type': 'text/markdown;charset=utf-8', 'X-Rapier-Name': encodeURIComponent(captured.metadata.filename)},
			body: (captured.metadata.bom ? '\uFEFF' : '') + captured.canonical,
		});
		const answer = await response.json().catch(() => null);
		const accepted = response.ok && answer?.accepted === true;
		_rapierPageReturn.state = accepted ? 'accepted' : response.status === 410 ? 'expired' : response.status === 409 ? 'used' : 'ready';
		_rapierPageReturn.message = accepted ? 'Accepted. Your document was sent back.'
			: _rapierPageReturn.state === 'expired' ? 'Return expired. Your work is safe on this page.'
			: _rapierPageReturn.state === 'used' ? 'Return already used. Your work is safe on this page.'
			: 'Refused: ' + (typeof answer?.reason === 'string' ? answer.reason : 'the worker did not accept this return.');
		return accepted;
	} catch (_) {
		_rapierPageReturn.state = 'ready';
		_rapierPageReturn.message = _rapierReturnLost();
		return false;
	} finally { _rapierRenderPageReturn(); }
}

async function rapierShare(kind) {
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	let captured;
	if (typeof _rapierMoveOn === 'function') _rapierMoveOn();
	const task = _rapierProgressTask({leaves: true, label: kind === 'web' ? 'Sharing web page' : 'Sharing file', size: rapier.document.source.length, current: () => !captured?.stamp || _rapierMutationStampIsCurrent(captured.stamp)});
	const work = task;
	try {
		await task.yield(0);
		const ledgerChoice = _rapierShareLedgerChoice();
		captured = await _rapierCaptureSettledExternalDocument({carried: kind === 'editor' ? 'history' : ledgerChoice});
		if (!captured) return false;
		captured = {...captured, work, ...(kind === 'editor' ? {carried: ledgerChoice} : {})};
		task.check();
		if (kind !== 'web' && kind !== 'editor' && captured.ledger && captured.metadata.docKind !== 'markdown') throw new Error('Choose web page to carry authorship or history with a code or plain-text document.');
		if (kind !== 'web' && kind !== 'editor') {
			const sourceName = captured.metadata.saveName.replace(/\.rapier\.html$/i, captured.metadata.docKind === 'markdown' ? '.md' : '.txt');
			const sourceMime = sourceName === captured.metadata.saveName ? captured.metadata.mime
				: captured.metadata.docKind === 'markdown' ? 'text/markdown' : 'text/plain';
			task.check(); task.end();
			return await _rapierShareFile({
			blob: new Blob([RapierLedgerCarried.writeDocument((captured.metadata.bom ? '\uFEFF' : '') + captured.canonical,
				_rapierLedgerParts(captured.canonical, captured.ledger, captured.carried))], {type: sourceMime}),
			filename: sourceName, mime: sourceMime,
			});
		}
		const page = await (kind === 'editor' ? _rapierEditablePageChosen(captured, 'share', task) : _rapierRenderModule('render')._rapierBuildSharedPage(captured));
		if (!page) return false;
		task.check(); task.end();
		const shared = await _rapierShareFile({...page, mime: 'text/html'});
		if (shared && page.linkedWords) showToast(page.linkedWords, 'info');
		return shared;
	} catch (error) {
		if (error?.name !== 'AbortError' && error?.code !== 'cancelled') showToast('Couldn’t share.', 'error', null, error);
		return false;
	} finally { task.end(); _rapierShareLedgerReset(); }
}

function _rapierShareCompatSet(toggle, on) {
	if (!toggle) return;
	if (on && toggle.dataset?.ledgerChoice) {
		for (const other of document.querySelectorAll('[data-ledger-choice]')) if (other !== toggle) _rapierShareCompatSet(other, false);
	}
	toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
	const state = toggle.querySelector('.export-choice-toggle__state');
	if (state) state.textContent = on ? 'ON' : 'OFF';
}

function _rapierShareLedgerChoice() {
	return document.querySelector('[data-ledger-choice][aria-pressed="true"]')?.dataset.ledgerChoice || 'none';
}
function _rapierShareLedgerReset() {
	for (const toggle of document.querySelectorAll('[data-ledger-choice]')) _rapierShareCompatSet(toggle, false);
	const names = document.getElementById('share-ledger-authors');
	if (names) {
		const actors = [...new Set(rapier.undo.ledger.filter(row => row.transaction.actor.kind === 'agent').map(row => row.transaction.actor.id))];
		names.textContent = actors.length ? 'Recorded agent names and doors: ' + actors.join('; ') + '. These are host-supplied labels, not verified identities.' : '';
	}
}
{
	const liveShare = document.getElementById('share-live-document');
	if (liveShare) {
		const wear = () => { liveShare.hidden = _rapierUiAndroid() || window.RapierPlatform?.environment.network === false; };
		wear();
		window.addEventListener('rapier:platform-state', wear);
		liveShare.addEventListener('click', () => {
			if (liveShare.hidden) return;
			closeDialog(document.getElementById('share-overlay'));
			if (typeof RapierParts !== 'undefined' && RapierParts.sealed()) { void _rapierFullEditorOnly('Live document'); return; }
			_rapierLive.openJoin();
		});
	}
}
const _rapierQuote = {held: null};
function _rapierQuoteHold() {
	_rapierQuote.held = null;
	const metadata = _rapierGetDocumentMetadata();
	if (metadata.docKind !== 'markdown') return;
	const exact = _rapierResolveExactCanonicalSelection() || _rapierQuoteWiden() && _rapierResolveExactCanonicalSelection();
	if (!exact) return;
	const source = _rapierGetCanonicalText();
	if (source.length !== exact.canonicalLength) return;
	const plan = _rapierPlanCompleteExcerpt(exact, rapier.semantic.facts, rapier.semantic.index);
	const excerpt = (plan && _rapierMaterializeCompleteExcerpt(exact, plan, source)?.excerpt) || source.slice(exact.start, exact.end);
	if (!excerpt.trim()) return;
	const {frontmatter, bodyOffset} = RapierMarkdownSpec.splitOpeningFrontmatter(source);
	const selection = window.getSelection(), range = selection?.rangeCount ? selection.getRangeAt(0) : null;
	_rapierQuote.held = {authority: exact.authority, revision: exact.revision, generation: exact.generation,
		markdown: (frontmatter && exact.start >= bodyOffset ? frontmatter : '') + excerpt, picture: _rapierQuotePicture(range),
		name: _rapierExportStem(metadata.filename)};
}
function _rapierQuoteWiden() {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return false;
	const range = selection.getRangeAt(0).cloneRange(), inline = 'em,strong,a,code,del,s,u,mark,sub,sup,kbd,abbr';
	const outer = (node, offset, end) => {
		let moved = null;
		while (node.parentElement?.matches(inline) && (end
			? offset === (node.nodeType === 3 ? node.length : node.childNodes.length) && node === node.parentNode.lastChild
			: offset === 0 && node === node.parentNode.firstChild)) {
			node = moved = node.parentNode; offset = end ? node.childNodes.length : 0;
		}
		return moved;
	};
	const start = outer(range.startContainer, range.startOffset, false), end = outer(range.endContainer, range.endOffset, true);
	if (!start && !end) return false;
	if (start) start.previousSibling?.nodeType === 3 ? range.setStart(start.previousSibling, start.previousSibling.length) : range.setStartBefore(start);
	if (end) end.nextSibling?.nodeType === 3 ? range.setEnd(end.nextSibling, 0) : range.setEndAfter(end);
	selection.removeAllRanges(); selection.addRange(range);
	return true;
}
function _rapierQuotePicture(range) {
	const all = _blockWrapperChildren(_editorHostEl());
	const chosen = range ? _rangeSelectedWrappers(range) : [];
	if (!chosen.length) return null;
	const drawing = wrapper => [...wrapper.querySelectorAll('img')].find(_rapierDrawImageIsOurs);
	const heading = wrapper => !!wrapper.querySelector('h1,h2,h3,h4,h5,h6');
	for (const wrapper of chosen) { const image = drawing(wrapper); if (image) return _rapierDrawImageDataUrl(image); }
	let before = all.indexOf(chosen[0]), after = all.indexOf(chosen.at(-1));
	const open = {before: !heading(chosen[0]), after: true};
	while (open.before || open.after) {
		for (const side of ['before', 'after']) {
			if (!open[side]) continue;
			const wrapper = all[side === 'before' ? --before : ++after];
			if (!wrapper) { open[side] = false; continue; }
			const image = drawing(wrapper);
			if (image) return _rapierDrawImageDataUrl(image);
			if (heading(wrapper)) open[side] = false;
		}
	}
	return null;
}
function _rapierQuoteCurrent() {
	const held = _rapierQuote.held;
	return held && held.authority === String(rapier.identity.authority || '') && held.revision === Number(rapier.revision.settled || 0) &&
		held.generation === Number(rapier.revision.generation || 0) ? held : null;
}
function _rapierQuoteOffer() {
	const choice = document.getElementById('share-quote-card');
	if (choice) choice.hidden = !_rapierQuoteCurrent();
}

const _RAPIER_QUOTE_SHAPES = [{height: 540, smallest: 17}, {height: 675, smallest: 13}];
async function _rapierShareQuoteCard() {
	const held = _rapierQuoteCurrent();
	if (!held) return false;
	const task = _rapierProgressTask({label: 'Making quote card', size: held.markdown.length, current: () => _rapierQuoteCurrent() === held});
	let frame;
	try {
		await task.yield(0);
		const metadata = {..._rapierGetDocumentMetadata(), bom: false};
		const context = await _rapierPrepareInterchangeContext({kind: 'share', work: task}, {canonical: held.markdown, metadata, work: task});
		const artifact = await _rapierRenderModule('render')._rapierBuildArtifact({kind: 'page', scripts: false}, context);
		const paper = await RapierDrawCore._rapierDrawPaperRequest('hot-press', {ready: true, now: () => performance.now(), pause: () => task.yield()});
		task.check();
		const escape = _rapierRenderModule('render-sanitize').escapeRapierHtmlText;
		frame = document.createElement('iframe');
		frame.setAttribute('sandbox', 'allow-same-origin');
		frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
		frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:540px;height:675px;border:0;pointer-events:none';
		const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
		frame.srcdoc = '<!doctype html><html lang="' + escape(artifact.language) + '" data-rapier-theme="light"><head><meta charset="utf-8">' +
			'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; style-src \'unsafe-inline\'">' +
			'<style>' + artifact.css + '\nhtml,body{background:none!important;margin:0}' +
			'.card{position:relative;display:flex;flex-direction:column;justify-content:center;width:540px;padding:64px 60px;overflow:hidden}' +
			'.card figure{display:flex;justify-content:center;margin:0 0 32px}.card figure img{width:100%;height:220px;object-fit:contain}' +
			'.card .rapier-page{width:auto;margin:0;padding:0;text-wrap:pretty}.card .footnotes,.card .footnotes-sep{display:none}' +
			'.card .mark{position:absolute;right:60px;bottom:30px;margin:0;font:500 10px/1 var(--md-font-sans);letter-spacing:.16em;color:var(--md-color-text-subtle)}' +
			'</style></head><body class="light"><div class="card">' +
			(held.picture ? '<figure><img alt="" src="' + escape(held.picture) + '"></figure>' : '') +
			'<main class="' + artifact.docClass + '" data-md-theme="light">' + artifact.bodyHtml + '</main><p class="mark">rapier</p></div></body></html>';
		document.body.append(frame);
		await loaded;
		const page = frame.contentDocument, card = page.querySelector('.card'), main = card.querySelector('main');
		for (const image of page.querySelectorAll('img')) await image.decode();
		await page.fonts.ready;
		task.check();
		const fits = (shape, unit) => {
			main.style.setProperty('--md-unit', unit + 'px');
			card.style.height = shape.height + 'px';
			const inner = card.clientHeight - 128, used = [...card.children].filter(node => !node.matches('.mark'))
				.reduce((sum, node) => sum + node.getBoundingClientRect().height, 0) + (held.picture ? 32 : 0);
			return used <= inner && main.scrollWidth <= main.clientWidth;
		};
		let shape = null, unit = 0;
		for (const candidate of _RAPIER_QUOTE_SHAPES) {
			for (unit = 26; unit >= candidate.smallest && !fits(candidate, unit); unit--);
			if (unit >= candidate.smallest) { shape = candidate; break; }
		}
		if (!shape) throw new Error('select fewer words.');
		fits(shape, unit);
		const words = await RapierVisualCapture.captureVisual({root: card, clip: {x: 0, y: 0, width: 540, height: shape.height},
			scale: 2, transparent: true, pixels: true, signal: task.signal});
		task.check();
		const canvas = document.createElement('canvas'), context2d = canvas.getContext('2d');
		canvas.width = words.width; canvas.height = words.height;
		context2d.fillStyle = await _rapierQuotePaper(paper, context2d);
		context2d.fillRect(0, 0, canvas.width, canvas.height);
		const rgba = new Uint8ClampedArray(words.width * words.height * 4);
		for (let at = 0; at < words.alpha.length; at++) rgba.set([words.rgb[at * 3], words.rgb[at * 3 + 1], words.rgb[at * 3 + 2], words.alpha[at]], at * 4);
		context2d.drawImage(await createImageBitmap(new ImageData(rgba, words.width, words.height)), 0, 0);
		const blob = await _rapierPngWithText(await _rapierCanvasBlob(canvas, 'image/png'), held.markdown);
		canvas.width = canvas.height = 0;
		task.check(); task.end();
		return await _rapierShareFile({blob, filename: held.name + '-quote.png', mime: 'image/png'});
	} catch (error) {
		if (error?.name !== 'AbortError') showToast('Couldn’t make the quote card.', 'error', null, error);
		return false;
	} finally { task.end(); frame?.remove(); }
}
async function _rapierPngWithText(png, text) {
	const bytes = new Uint8Array(await png.arrayBuffer()), encoder = new TextEncoder();
	const tail = bytes.length - 12, data = new Uint8Array([...encoder.encode('rapier:markdown\0\0\0\0\0'), ...encoder.encode(text)]);
	if (String.fromCharCode(...bytes.subarray(tail + 4, tail + 8)) !== 'IEND') return png;
	const chunk = new Uint8Array(12 + data.length), view = new DataView(chunk.buffer);
	view.setUint32(0, data.length); chunk.set(encoder.encode('iTXt'), 4); chunk.set(data, 8);
	view.setUint32(8 + data.length, RapierCodecs.crc32(chunk.subarray(4, 8 + data.length)));
	return new Blob([bytes.subarray(0, tail), chunk, bytes.subarray(tail)], {type: 'image/png'});
}
async function _rapierQuoteCardDocument(blob, name) {
	const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer), keyword = 'rapier:markdown\0';
	if (bytes.length < 8 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
	for (let at = 8; at + 12 <= bytes.length;) {
		const length = view.getUint32(at), end = at + 12 + length, type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		if (end > bytes.length || type === 'IEND') return null;
		const data = bytes.subarray(at + 8, at + 8 + length);
		if (type === 'iTXt' && String.fromCharCode(...data.subarray(0, keyword.length)) === keyword && data[keyword.length] === 0 &&
			data[keyword.length + 2] === 0 && data[keyword.length + 3] === 0) {
			let markdown;
			try { markdown = new TextDecoder('utf-8', {fatal: true}).decode(data.subarray(keyword.length + 4)); } catch (_) { return null; }
			const card = new Uint8Array(bytes.length - length - 12);
			card.set(bytes.subarray(0, at)); card.set(bytes.subarray(end), at);
			let base64 = '';
			for (let i = 0; i < card.length; i += 32768) base64 += String.fromCharCode(...card.subarray(i, i + 32768));
			let label = 'quote-card';
			while (markdown.toLowerCase().includes('[' + label + ']')) label += '-1';
			const {frontmatter, bodyOffset} = RapierMarkdownSpec.splitOpeningFrontmatter(markdown);
			return {name: _rapierExportStem(name || 'quote.png') + '.md', text: (frontmatter || '') + '![Quote card][' + label + ']\n\n' +
				markdown.slice(bodyOffset).replace(/\n*$/, '\n\n') + '[' + label + ']: data:image/png;base64,' + btoa(base64) + '\n'};
		}
		at = end;
	}
	return null;
}
async function _rapierQuotePaper(paper, context2d) {
	const image = new Image();
	image.src = paper.url;
	await image.decode();
	return context2d.createPattern(image, 'repeat');
}

function _rapierLedgerCapture() {
	return RapierLedger.exportLedger({text: _rapierGetCanonicalText(), metadata: _rapierDocumentMetadata(),
		records: rapier.undo.ledger.map(_rapierJournalRecord), documentAuthority: String(rapier.identity.authority),
		revision: Number(rapier.revision.settled), root: rapier.document.source.rootId,
		complete: _rapierHistoryIsComplete() && !rapier.undo.trimReason});
}
function _rapierLedgerInput() {
	return Object.defineProperty({text: _rapierGetCanonicalText(), metadata: _rapierDocumentMetadata(),
		records: rapier.undo.ledger.map(_rapierJournalRecord), documentAuthority: String(rapier.identity.authority),
		revision: Number(rapier.revision.settled), root: rapier.document.source.rootId,
		complete: _rapierHistoryIsComplete() && !rapier.undo.trimReason}, 'rows', {value: rapier.undo.ledger.slice()});
}
function _rapierLedgerParts(text, ledger, choice) {
	if (!ledger || !['authorship', 'history'].includes(choice)) return {ledger: null, authorship: null};
	const canonical = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
	const carried = RapierLedger.replaceLedgerText(ledger, canonical, {operation: 'export.convert', actor: {kind: 'system', id: 'rapier'}});
	return choice === 'history' ? {ledger: carried, authorship: null} : {ledger: null, authorship: RapierLedger.authorship(carried)};
}
function _rapierLedgerAdmission(text, parts, metadata) {
	const checked = RapierLedgerCarried.validateParts(text, parts);
	const canonical = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
	const ledger = checked.ledger || (checked.authorship
		? RapierLedger.ledgerFromAuthorship(checked.authorship, canonical, _rapierCreateDocumentAuthority(), metadata || {filename: parts.name || parts.filename || rapier.document.filename, docKind: parts.kind || rapier.document.docKind}) : null);
	if (!ledger) return {};
	RapierLedger.historyEnvelope(ledger);
	return {documentAuthority: ledger.documentAuthority, documentKind: ledger.head.metadata.docKind, carriedLedger: ledger};
}
function _rapierPrepareLedgerInstall(ledger, text, metadata) {
	metadata = {...metadata};
	const envelope = RapierLedger.historyEnvelope(ledger, [], text, metadata);
	return () => {
		if (text !== _rapierSourceText() || !_rapierSameDocumentMetadata(metadata, _rapierDocumentMetadata()) ||
				envelope.documentAuthority !== String(rapier.identity.authority)) throw new Error('The carried history does not describe this document.');
		envelope.segmentIdentity = rapier.document.docKind === 'markdown' ? _rapierCurrentSegmentIdentity() : [];
		const previous = {revision: rapier.revision.settled, source: rapier.document.source, checkpoint: rapier.document.source.capture(),
			history: {...rapier.undo, ledger: rapier.undo.ledger.slice(), branch: rapier.undo.branch.slice()}, durable: _rapierPersistenceRuntime.durable};
		try {
			rapier.revision.settled = envelope.documentRevision;
			_rapierResetSource(text, envelope.sourceRootId);
			if (!_rapierInstallRestoredHistory(envelope)) throw new Error('The carried history could not be installed.');
		} catch (error) {
			rapier.revision.settled = previous.revision;
			rapier.document.source = previous.source; previous.checkpoint.restore();
			Object.assign(rapier.undo, previous.history); _rapierPersistenceRuntime.durable = previous.durable;
			throw error;
		}
		_notifyHistoryState();
	};
}
function _rapierLedgerInstall(ledger) {
	_rapierPrepareLedgerInstall(ledger, _rapierSourceText(), _rapierDocumentMetadata())();
}
async function _rapierLedgerMergeCopy(incoming, name) {
	const captured = await _rapierCaptureSettledExternalDocument({carried: 'history'});
	if (!captured || _rapierUserMutationBlocked()) return false;
	const merged = RapierLedger.merge(captured.ledger, incoming);
	if (!merged.clean) {
		if (merged.conflicts.some(row => row.kind === 'metadata')) throw Object.assign(
			new Error('The copies contain conflicting document metadata. The current document is unchanged.'), {code: 'metadata_assignment_conflict'});
		await _rapierCompareStart(captured.canonical, captured.metadata.filename, RapierLedger.readLedger(incoming).text, name);
		return false;
	}
	if (merged.ledger.sha256 === captured.ledger.sha256) return true;
	if (!_rapierMutationStampIsCurrent(captured.stamp)) return false;
	const ctx = {actor: {kind: 'human', id: 'local'}, transport: 'platform', operation: 'document.merge', requestId: null};
	const splice = _rapierPrefixSuffixDiff(captured.canonical, merged.text), rows = splice.removed || splice.inserted ? [splice] : [];
	const metadata = RapierLedger._rapierMetadataDelta(_rapierDocumentMetadata(), merged.metadata);
	if (metadata?.docKind && _rapierDrawShown()) return false;
	await _rapierWithCompoundTransaction(ctx, async compound => {
		if (!_rapierMutationStampIsCurrent(captured.stamp)) throw new Error('The document changed before merging.');
		if (rows.length && !await _rapierApplyCanonicalSplices(rows, {keepSourceMode: rapier.view.mode === 'source', retiredImages: []}))
			throw new Error('The merge could not be applied.');
		if (metadata) {
			if (!_rapierCommitSplices([], {metadata})) throw new Error('The document metadata changed before merging.');
			if (metadata.docKind && metadata.docKind.before !== metadata.docKind.after) await _rapierProjectDocumentMetadata(compound);
			else {updateFilenameDisplay(); renderDocumentKind();}
		}
	}, {carriedLedger: merged.ledger});
	await rapierFlushDirty({snapshot: true, durable: true});
	return true;
}
function _rapierReturnedActs(incoming) {
	if (!incoming || incoming.documentAuthority !== String(rapier.identity.authority)) return null;
	const seen = new Set(rapier.undo.ledger.map(row => row.transaction.id));
	const acts = incoming.records.filter(({transaction: tx}) => !seen.has(tx.id) && tx.revision > rapier.undo.earliestRevision && tx.actor.kind !== 'system');
	if (!acts.length) return null;
	const names = new Set(acts.map(({transaction: {actor}}) => actor.name || (actor.kind === 'agent' ? 'an agent' : 'a person')));
	return {ledger: incoming, ids: acts.map(row => row.transaction.id), by: new Intl.ListFormat('en').format([...names])};
}
function _rapierOfferReturnedCompare(returned) {
	showToast('New edits by ' + returned.by, 'info', {label: 'Compare', fn: async () => {
		const {ledger, ids} = returned, head = RapierLedger.readLedger(ledger);
		const before = RapierLedger.selectiveUndo({source: head.text, metadata: head.metadata, records: ledger.records,
			revision: ledger.head.revision, earliestRevision: ledger.start.revision, complete: ledger.complete}, ids);
		if (!before.ok) return showToast('Couldn’t compare these edits.', 'error');
		const c = rapier.compare;
		c.lens = 'file'; c.changeId = null;
		if (!c.active) c.snapshot = _rapierCompareCaptureView();
		await _rapierCompareStart(before.after, head.metadata.filename, head.text, 'edits by ' + returned.by);
	}});
}
