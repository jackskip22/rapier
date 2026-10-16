function _rapierPortableRequiredPlugins(source, options = {}) {
  const required = new Set(), assets = globalThis.RapierImageAssets;
  if (options.docKind && options.docKind !== 'markdown') return required;
  const parser = assets.markdownParser();
  const drawing = text => {
    const recipe = globalThis.RapierDrawCore?._rapierDrawReadRecipeFromSVGText(text);
    for (const shape of recipe?.shapes || []) {
      if (typeof shape.textFont === 'string' && shape.textFont.startsWith('letters:')) required.add('letters-' + shape.textFont.slice(8));
    }
  };
  const visit = tokens => {
    for (const token of tokens || []) {
      if (token.type === 'math_inline' || token.type === 'math_block') required.add('math');
      else if (token.type === 'fence' && token.info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid' &&
        globalThis.RapierFlowchart?.parseFlowchart(token.content).ok !== true) required.add('mermaid');
      else if (token.type === 'image') {
        const url = token.attrGet('src');
        if (assets.dataImage(url)?.codec === 'image/svg+xml') drawing(new TextDecoder('utf-8', {fatal: true}).decode(assets.decodeDataImageBytes(url).bytes));
      } else if (/^html_(?:block|inline)$/.test(token.type) && /^\s*<svg[\s>]/i.test(token.content)) drawing(token.content);
      if (token.children) visit(token.children);
    }
  };
  for (const text of [source, options.base]) if (typeof text === 'string' && /[$\\]|mermaid|svg/i.test(text)) visit(parser.parse(text.slice(assets.markdownBodyOffset(text)), {}));
  return required;
}

async function _rapierPackPortablePlugins(groups) {
  const inventory = [], payloads = [];
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
    payloads.push(payload);
    inventory.push({id: group.id, delivery: 'built-in', kind: group.kind, element, bytes, packedBytes: new TextEncoder().encode(payload).length, files});
  }
  return inventory.length ? '<script type="application/json" id="rapier-builtin-plugins">' +
    JSON.stringify(inventory).replace(/</g, '\\u003c') + '</script>\n' + payloads.join('') : '';
}

const _RAPIER_PORTABLE_PAYLOAD_TYPES = new Set(['application/rapier-runtime', 'application/rapier-jxl-worker', 'text/rapier-vendor', 'application/speedracer-app+json']);

async function _rapierPortableTemplate(source, options = {}) {
  const {head, first} = globalThis.RapierPortableShell;
  for (const id of ['rapier-platform-runtime', 'rapier-codec-runtime', 'rapier-jxl-worker', 'rapier-styles-runtime', 'rapier-style-rest-runtime', 'rapier-ui-runtime', 'rapier-editor-runtime']) {
    await _rapierWhenRuntime(id);
  }
  await _rapierWhenRuntime('lib-acorn');
  let payloads = Array.from(document.querySelectorAll('script')).filter(row =>
    (_RAPIER_PORTABLE_PAYLOAD_TYPES.has(row.type) || row.type === 'application/json' && row.id === 'rapier-builtin-plugins') &&
    row.id !== 'rapier-apps-runtime' && row.parentNode !== document.head);
  const required = _rapierPortableRequiredPlugins(source, options), manifest = document.getElementById('rapier-builtin-plugins');
  const groups = manifest ? JSON.parse(manifest.textContent) : [];
  const available = new Set(groups.flatMap(group => group.id === 'letters' ? group.files.map(file => file.id.slice(7)) : [group.id]));
  let carried = '';
  if (groups.some(group => group.asset) || !manifest || [...required].some(key => !available.has(key))) {
    carried = groups.some(group => group.asset) ? await RapierBundledPlugins.portable()
      : await _rapierPackPortablePlugins(await globalThis.RapierPluginLoader.portable(required));
    const replaced = new Set(['rapier-builtin-plugins', ...groups.map(group => group.element)]);
    payloads = payloads.filter(row => !replaced.has(row.id));
  }
  let parts = '';
  for (const id of typeof RapierParts === 'undefined' ? [] : RapierParts.ids()) {
    if (document.getElementById('rapier-part-' + id)) continue;
    try { parts += await RapierParts.element(id); }
    catch (cause) { throw Object.assign(new Error('Offline editor not written; open ' + RapierParts.pin(id).label + ' once while connected, then export again.', {cause}), {code: 'offline_part_unavailable', part: id}); }
  }
  return globalThis.RapierPortablePage.offlineTemplate('<!doctype html><html lang="en"><head>' + head + '</head><body>' + first +
    '\n<template id="rapier-ui-slot"></template>\n' + payloads.map(row => row.outerHTML).join('\n') + '\n' + parts + carried + '</body></html>');
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
	const filename = String(name || 'document');
	if (/\.rapier\.html$/i.test(filename)) return filename;
	const stem = filename.replace(/(.)\.[a-z0-9]+$/i, '$1') || 'document';
	return [...stem].slice(0, 244).join('') + '.rapier.html';
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
	if (carriers.length !== 1 || carriers[0].tagName !== 'SCRIPT' || carriers[0].type !== 'text/markdown')
		throw new Error('This HTML editor file has no complete editable document.');
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

async function _rapierBuildEditablePage(captured) {
	if (!globalThis.RapierPortableShell || !globalThis.RapierPortablePage)
		throw new Error('The offline editor package is unavailable on this host.');
	const pictured = text => /!\[|<(?:img|image|source)\b/i.test(text);
	if (pictured(captured.canonical)) {
		const current = await _rapierPrepareInterchangeContext({kind: 'page', imageCompat: false, preserveObjects: true}, captured);
		await _rapierRenderModule('render')._rapierRequireOfflinePageImages(current.semanticRoot);
		captured = {...captured, canonical: current.canonical, comparisonBase: current.comparisonBase};
	} else if (captured.metadata.docKind === 'markdown') captured = await _rapierInterchangeFonts(captured, true);
	if (captured.comparisonBase && pictured(captured.comparisonBase.text)) {
		const base = await _rapierPrepareInterchangeContext({kind: 'page', imageCompat: false, comparison: true, preserveObjects: true}, {...captured, canonical: captured.comparisonBase.text});
		await _rapierRenderModule('render')._rapierRequireOfflinePageImages(base.semanticRoot);
	}
	const template = await _rapierPortableTemplate(captured.canonical,
		{docKind: captured.metadata.docKind, base: captured.comparisonBase?.text});
	const text = (captured.metadata.bom ? '\uFEFF' : '') + captured.canonical;
	const {filename, codeLang} = captured.metadata, ext = codeLang && Object.keys(EXT_TO_LANG).find(e => EXT_TO_LANG[e] === codeLang);
	const html = globalThis.RapierPortablePage.wrap(template, text, ext ? filename.replace(/\.rapier\.html$/i, '.' + ext) : filename, {
		kind: captured.metadata.docKind, base: captured.comparisonBase || undefined,
		..._rapierLedgerParts(text, captured.ledger, captured.carried),
	});
	const blob = new Blob([html], {type: 'text/html; charset=utf-8'});
	if (blob.size > RapierTextCodec.maxDocumentBytes) throw new Error('This HTML editor file exceeds 64 MiB.');
	return {blob, filename: _rapierEditablePageFilename(captured.metadata.filename), mime: blob.type, canonical: captured.canonical};
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

function _rapierShareProduced(filename, blob) {
	const bytes = blob && Number.isFinite(blob.size) ? blob.size : 0;
	const size = bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KiB' : (bytes / 1048576).toFixed(1) + ' MiB';
	return bytes ? filename + ' (' + size + ')' : filename;
}

function _rapierAnnounceShared(filename, blob) {
	const produced = _rapierShareProduced(filename, blob);
	try { if (typeof srAnnounce === 'function') srAnnounce('shared ' + produced); } catch (_) {}
	try { showToast('shared ' + produced, 'success'); } catch (_) {}
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
		if (!popup) throw new Error('Open the return page to authorize this upload.');
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
						throw new Error('The document changed or the return expired while settling.');
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
			const timeout = setTimeout(() => finish(null, new Error('Return confirmation timed out.')), 5 * 60 * 1000);
			const closed = setInterval(() => { if (popup.closed) finish(null, new Error('Return page closed.')); }, 500);
		});
		const accepted = status >= 200 && status < 300 && answer?.accepted === true;
		_rapierPageReturn.state = accepted ? 'accepted' : status === 410 ? 'expired' : status === 409 ? 'used' : 'ready';
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
		if (_rapierPageReturn.expiresAt <= Date.now()) { _rapierPageReturn.state = 'ready'; return false; }
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
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	let captured;
	const task = _rapierProgressTask({label: kind === 'web' ? 'Sharing web page' : 'Sharing file', size: rapier.document.source.length, current: () => !captured?.stamp || _rapierMutationStampIsCurrent(captured.stamp)});
	const work = task;
	try {
		await task.yield(0);
		captured = await _rapierCaptureSettledExternalDocument({carried: _rapierShareLedgerChoice()});
		if (!captured) return false;
		captured = {...captured, work};
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
		const page = await (kind === 'editor' ? _rapierBuildEditablePage(captured) : _rapierRenderModule('render')._rapierBuildSharedPage(captured));
		task.check(); task.end();
		return await _rapierShareFile({...page, mime: 'text/html'});
	} catch (error) {
		if (error?.name !== 'AbortError' && error?.code !== 'cancelled') showToast('Could not share: ' + error.message, 'error');
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
		liveShare.hidden = _rapierUiAndroid();
		liveShare.addEventListener('click', () => {
			if (_rapierUiAndroid()) return;
			closeDialog(document.getElementById('share-overlay'));
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
		name: metadata.filename.replace(/\.[a-z0-9]+$/i, '') || 'document'};
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
	const all = Array.from(_editorHostEl()?.querySelectorAll(':scope > .block-wrapper') || []);
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
		const paper = await RapierDrawCore._rapierDrawPaperRequest('hot-press', {now: () => performance.now(), pause: () => task.yield()});
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
		const blob = await _rapierCanvasBlob(canvas, 'image/png');
		canvas.width = canvas.height = 0;
		task.check(); task.end();
		return await _rapierShareFile({blob, filename: held.name + '-quote.png', mime: 'image/png'});
	} catch (error) {
		if (error?.name !== 'AbortError') showToast('Could not make the quote card: ' + error.message, 'error');
		return false;
	} finally { task.end(); frame?.remove(); }
}
async function _rapierQuotePaper(paper, context2d) {
	const image = new Image();
	image.src = paper.url;
	await image.decode();
	const tile = new OffscreenCanvas(image.width, image.height), pen = tile.getContext('2d');
	pen.drawImage(image, 0, 0);
	const pixels = pen.getImageData(0, 0, tile.width, tile.height), data = pixels.data;
	for (let at = 0; at < data.length; at += 4) {
		const grey = data[at] / 255;
		for (let c = 0; c < 3; c++) data[at + c] = 255 * (paper.gain[c] * grey + paper.offset[c]);
	}
	pen.putImageData(pixels, 0, 0);
	return context2d.createPattern(tile, 'repeat');
}

function _rapierLedgerCapture() {
	return RapierLedger.exportLedger({text: _rapierGetCanonicalText(), metadata: _rapierDocumentMetadata(),
		records: rapier.undo.ledger.map(_rapierJournalRecord), documentAuthority: String(rapier.identity.authority),
		revision: Number(rapier.revision.settled), root: rapier.document.source.rootId,
		complete: _rapierHistoryIsComplete() && !rapier.undo.trimReason});
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
	showToast('New edits by ' + returned.by, 'info', {label: 'Compare changes', fn: async () => {
		const {ledger, ids} = returned, head = RapierLedger.readLedger(ledger);
		const before = RapierLedger.selectiveUndo({source: head.text, metadata: head.metadata, records: ledger.records,
			revision: ledger.head.revision, earliestRevision: ledger.start.revision, complete: ledger.complete}, ids);
		if (!before.ok) return showToast('Could not compare these edits', 'error');
		const c = rapier.compare;
		c.lens = 'file'; c.changeId = null;
		if (!c.active) c.snapshot = _rapierCompareCaptureView();
		await _rapierCompareStart(before.after, head.metadata.filename, head.text, 'edits by ' + returned.by);
	}});
}
