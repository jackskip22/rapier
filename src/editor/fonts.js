const _rapierDocumentFonts = (() => {
	const spec = globalThis.RapierMarkdownSpec, fonts = globalThis.RapierDrawFonts;
	const previewFaces = new Map();
	let documentFaces = [], documentFonts = [], authority = '', prepared = null, materialized = null, refreshSource = null, ticket = 0, choiceTicket = 0, libraryRevision = 0;
	let libraryReady = !_rapierPersonalStore;
	const preference = 'defaultDocumentFont', builtins = Object.freeze({serif: 'Serif', mono: 'Mono', hand: 'Hand'});
	const shelf = () => _rapierPersonalStore ? Object.values(_rapierPersonalStore.values('font/')).filter(Boolean) : [];
	const available = () => [...new Map([...shelf(), ...documentFonts].map(font => [font.id, font])).values()];
	const documentKey = () => JSON.stringify([rapier.identity.authority, rapier.identity.epoch, rapier.identity.loadToken]);
	function defaultChoice() {
		if (globalThis.__rapierServerRenderHost === true || !_rapierFeatureAllowed('defaultDocumentFont')) return undefined;
		const value = RapierPreferences.read(preference);
		if (value) return value;
		if (_rapierPersonalStore && _rapierPersonalStore.values('preference/')[preference] === '') return null;
		return RapierPreferences.chosen(preference) ? null : undefined;
	}
	const stateKey = () => JSON.stringify([defaultChoice() ?? null, defaultChoice() === undefined, libraryRevision]);
	function defaultFamily() {
		const value = defaultChoice();
		return typeof value === 'string' && /^f[0-9a-f]{24}$/.test(value) ? 'rapier-' + value : value;
	}
	function defaultLabel() {
		const value = RapierPreferences.read(preference);
		if (!value) return 'Factory default';
		if (Object.hasOwn(builtins, value)) return builtins[value];
		const font = available().find(font => font.id === value);
		try { return font ? fonts.admitFonts([font], [value])[0].family : 'Unavailable font'; }
		catch (_) { return 'Unavailable font'; }
	}
	function preferenceChanged() {
		const next = stateKey();
		if (prepared?.state === next && refreshSource?.state === next) return;
		prepared = null; materialized = null; refreshSource = null; ticket++; choiceTicket++;
		prunePreviews();
	}
	const descriptors = font => {
		const weight = font.axes?.find(axis => axis.tag === 'wght'), width = font.axes?.find(axis => axis.tag === 'wdth');
		return {style: font.style || 'normal', weight: weight ? weight.min + ' ' + weight.max : String(font.weight || 400),
			stretch: width ? width.min + '% ' + width.max + '%' : (font.stretch || 100) + '%'};
	};
	function prunePreviews() {
		const current = new Map(available().map(font => [font.id, font]));
		for (const [id, entry] of previewFaces) {
			try {
				const font = fonts.admitFonts([current.get(id)])[0];
				if (font !== entry.font) fonts.admitFonts([entry.font, font]);
				entry.font = font;
			} catch (_) {
				previewFaces.delete(id);
				if (entry.face) document.fonts.delete(entry.face);
			}
		}
	}
	async function preview(font) {
		font = fonts.admitFonts([font])[0];
		const prior = previewFaces.get(font.id);
		if (prior) {
			if (prior.font !== font) fonts.admitFonts([prior.font, font]);
			prior.font = font;
			return prior.pending;
		}
		const entry = {font, face: null};
		entry.pending = (async () => {
			const face = await new FontFace(fonts.fontFaceFamily(font), fonts.fontBytes(font), descriptors(font)).load();
			if (previewFaces.get(font.id) === entry) { document.fonts.add(face); entry.face = face; }
			return face;
		})();
		previewFaces.set(font.id, entry);
		entry.pending.catch(() => { if (previewFaces.get(font.id) === entry) previewFaces.delete(font.id); });
		return entry.pending;
	}
	async function chooseDefault(value, {current = () => true} = {}) {
		if (!_rapierRequireFeature('defaultDocumentFont', {source: 'default-document-font'})) return false;
		if (typeof value !== 'string' || !/^(?:|serif|mono|hand|f[0-9a-f]{24})$/.test(value))
			throw new TypeError('Choose a font from your library or reset to the factory default.');
		const mine = ++choiceTicket, stamp = Object.freeze(_rapierMutationStamp());
		const active = () => mine === choiceTicket && current() === true && _rapierMutationStampIsCurrent(stamp) &&
			_rapierFeatureAllowed('defaultDocumentFont');
		await _rapierPersonalStore.ready;
		if (!active()) return false;
		if (/^f[0-9a-f]{24}$/.test(value)) {
			const chosen = available().find(font => font.id === value);
			if (!chosen) throw new Error('That font is unavailable. Add its original file to your library.');
			const font = fonts.admitFonts([chosen], [value])[0];
			await preview(font);
			if (!active()) return false;
			if (!shelf().some(row => row.id === value)) {
				await _rapierPersonalStore.putAsset('font/' + value, font);
				if (!active()) return false;
			}
		}
		if (!active()) return false;
		RapierPreferences.write(preference, value);
		if (RapierPreferences.read(preference) !== value) throw new Error('The default font could not be saved on this device.');
		const appliedState = stateKey();
		try { await _rapierPersonalStore.set('preference/' + preference, value); }
		catch (_) { throw new Error('The default font is kept on this device, but its personal profile could not be saved. Try again.'); }
		if (stateKey() !== appliedState) { preferenceChanged(); _rapierApplyDocumentSettings(); renderSettings(); }
		return true;
	}
	async function add(files) {
		const result = await fonts.importFonts(files);
		await _rapierPersonalStore.ready;
		const accepted = [], refused = result.refused.slice();
		for (const font of result.fonts) {
			try {
				await preview(font);
				await _rapierPersonalStore.putAsset('font/' + font.id, font);
				accepted.push(font);
			} catch (error) { refused.push({name: font.name || font.family, reason: String(error.message || error)}); }
		}
		prunePreviews();
		if (accepted.length) { libraryRevision++; preferenceChanged(); }
		if (accepted.length && rapier.document.docKind === 'markdown') {
			const source = _rapierSourceText(), assets = spec.readFontAssets(source, md).assets;
			const used = new Set([...spec.documentFontUsage(source, md).keys()].map(family => family.toLowerCase()));
			const affects = accepted.some(font => {
				const family = (font.family || font.name).toLowerCase();
				if (!used.has(family)) return false;
				const carried = assets.filter(asset => asset.family.toLowerCase() === family);
				return !carried.length || carried.some(asset => asset.sourceId === font.id && spec.fontAssetKey(asset) === spec.fontAssetKey(font));
			});
			if (affects) {
				refreshSource = null;
				void refresh(source);
			}
		}
		if (accepted.length) _rapierApplyDocumentSettings();
		return {fonts: accepted, refused};
	}
	async function refresh(source) {
		if (globalThis.__rapierServerRenderHost === true) return;
		const key = documentKey();
		if (authority !== key) {
			authority = key; prepared = null; materialized = null; refreshSource = null; ticket++;
			for (const face of documentFaces) document.fonts.delete(face);
			documentFaces = []; documentFonts = [];
			prunePreviews();
		}
		const parsed = rapier.document.docKind === 'markdown' ? spec.readFontAssets(source, md) : {assets: [], refused: []};
		const assets = parsed.assets, signature = JSON.stringify([assets.map(asset =>
			[spec.fontAssetKey(asset), asset.url, asset.sourceId, asset.weightRange, asset.axes]),
			spec.readDocumentSettings(source).defaultfont, parsed.refused]);
		const state = stateKey();
		if (refreshSource?.signature === signature && refreshSource.state === state) return;
		refreshSource = {signature, state};
		const mine = ++ticket, nextFaces = [], session = fonts.fontSession(), read = asset => session.read(asset);
		const active = () => ticket === mine && documentKey() === key && stateKey() === state;
		try {
			await _rapierPersonalStore.ready;
			if (!active()) return;
			if (parsed.refused.length) throw new Error(parsed.refused.map(row => row.name + ': ' + row.reason).join('\n'));
			const library = shelf(), records = [], selected = defaultChoice();
			const inherited = spec.readDocumentSettings(source).defaultfont;
			const inheritedId = /^rapier-(f[0-9a-f]{24})$/.exec(inherited?.family || '')?.[1];
			for (const asset of assets) {
				const exactId = inheritedId && asset.family === inherited.family ? inheritedId :
					asset.family === 'rapier-' + selected ? selected : null;
				const embedded = exactId ? await read(asset) : null;
				if (exactId && (asset.sourceId !== exactId || embedded.id !== exactId ||
					spec.fontAssetKey({...fonts.fontMetadata([embedded])[0], family: asset.family}) !== spec.fontAssetKey(asset)))
					throw new Error('The inherited font asset does not match its selected identity or metadata.');
				const matching = library.filter(font => font.id === asset.sourceId);
				const admitted = matching.length ? fonts.admitFonts(matching, [asset.sourceId])[0] : null;
				const original = admitted && spec.fontAssetKey({...fonts.fontMetadata([admitted])[0],
					family: asset.family === 'rapier-' + admitted.id ? asset.family : admitted.family}) === spec.fontAssetKey(asset) ? admitted : null;
				const font = original || embedded || await read(asset);
				if (!active()) return;
				records.push(font);
				const face = await new FontFace(asset.family, fonts.fontBytes(font), descriptors(asset)).load();
				if (!active()) return;
				nextFaces.push(face);
			}
			if (typeof selected === 'string' && /^f[0-9a-f]{24}$/.test(selected)) {
				const font = library.find(font => font.id === selected);
				if (font) await preview(fonts.admitFonts([font], [selected])[0]);
				else if (!assets.some(asset => asset.family === 'rapier-' + selected && asset.sourceId === selected))
					throw new Error('The default font is unavailable. Add its original file to your library before saving.');
			}
			if (!active()) return;
			for (const face of nextFaces) document.fonts.add(face);
			for (const face of documentFaces) document.fonts.delete(face);
			documentFaces = nextFaces; documentFonts = records;
			prunePreviews();
		} catch (error) {
			if (active()) { refreshSource = null; showToast(String(error.message || error), 'error'); }
		}
	}
	function isPrepared(source) {
		if (rapier.document.docKind !== 'markdown') return true;
		if (!libraryReady) return false;
		if (prepared?.source === source && prepared.document === documentKey() && prepared.state === stateKey()) return true;
		const parsed = spec.readFontAssets(source, md);
		return defaultChoice() == null && !spec.readDocumentSettings(source).defaultfont &&
			!spec.documentFontUsage(source, md).size && !parsed.assets.length && !parsed.refused.length;
	}
	async function materialize(source, {force = false, comparison = false} = {}) {
		if (comparison) source = RapierLedgerCarried.readBase(source);
		const writer = globalThis.RapierExportFonts[comparison ? 'materializeComparisonFonts' : 'materializeDocumentFonts'];
		if (globalThis.__rapierServerRenderHost === true) return writer(source, {parser: md});
		await _rapierPersonalStore.ready;
		if (!comparison && !force && isPrepared(source)) return source;
		const state = stateKey(), key = documentKey(), catalog = shelf();
		const fields = ['id', 'format', 'data', 'family', 'name'];
		const matches = (snapshot, values = catalog) => snapshot.length === values.length && snapshot.every((row, index) =>
			fields.every((field, at) => row[at] === values[index]?.[field]));
		if (!materialized || materialized.source !== source || materialized.document !== key || materialized.state !== state || !matches(materialized.catalog)) {
			const held = {source, document: key, state, catalog: catalog.map(font => fields.map(field => font?.[field]))};
			held.pending = writer(source, {parser: md, catalog, ...(comparison ? {} : {defaultFont: defaultChoice()})});
			materialized = held;
			held.pending.catch(() => { if (materialized === held) materialized = null; });
		}
		const held = materialized;
		try {
			const next = await held.pending;
			if (state !== stateKey()) throw new Error('The default font changed. Try again.');
			if (!matches(held.catalog, shelf())) throw new Error('The font library changed. Try again.');
			return next;
		} finally { if (materialized === held) materialized = null; }
	}
	async function prepare() {
		if (rapier.document.docKind !== 'markdown') return true;
		const requested = documentKey();
		await _rapierPersonalStore.ready;
		if (documentKey() !== requested) return false;
		const captured = await _rapierCaptureSettledExternalDocument();
		if (!captured || documentKey() !== requested) return false;
		const state = stateKey(), key = documentKey();
		const current = () => _rapierMutationStampIsCurrent(captured.stamp) && stateKey() === state &&
			_rapierSourceText() === captured.canonical && !rapier.composition.block && !rapier.composition.source;
		const next = await materialize(captured.canonical);
		if (!current()) return false;
		if (next === captured.canonical) { prepared = {source: next, document: key, state}; return true; }
		const done = await _rapierCommitSourceProjection([_rapierPrefixSuffixDiff(captured.canonical, next)],
			'document.embed-fonts', null, null, _rapierCaptureEditorViewport(), null, current);
		if (done && documentKey() === key && stateKey() === state && _rapierSourceText() === next)
			prepared = {source: next, document: key, state};
		return done;
	}
	if (_rapierPersonalStore) {
		_rapierPersonalStore.ready.then(() => { libraryReady = true; }).catch(() => {});
		_rapierPersonalStore.subscribe(() => {
			libraryRevision++; preferenceChanged();
			queueMicrotask(() => { _rapierApplyDocumentSettings(); renderSettings(); });
		});
	}
	return Object.freeze({add, fonts: available, preview, refresh, materialize, prepare, isPrepared,
		chooseDefault, defaultFamily, defaultLabel, preferenceChanged, stateKey,
		prepared(source) { prepared = {source, document: documentKey(), state: stateKey()}; }, descriptors});
})();

function _rapierTypographyRuns(raw, options = null) {
	const probe = _rapierRenderedMarkProbe(raw, 'bold', !!options?.tableCell);
	return probe ? {...probe, ...globalThis.RapierMarkdownSpec.typography.runs(probe.root)} : null;
}

function _rapierFontRuns(raw, options = null) {
	const probe = _rapierTypographyRuns(raw, options);
	return probe ? {...probe, paint: probe.paint.map(style => style.family?.name || null)} : null;
}

function _rapierPlanTypography(raw, patch, start, end, options = null) {
	const source = String(raw || ''), spec = globalThis.RapierMarkdownSpec, typed = spec.typography;
	if (source.length > RAPIER_EXACT_MARK_RAW_LIMIT) return null;
	let wanted;
	try { wanted = typed.normalize(patch, true); } catch (_) { return null; }
	const before = _rapierTypographyRuns(source, options), keys = Object.keys(wanted);
	if (!before || !keys.length || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end || end > before.text.length) return null;
	const boundary = at => !(at > 0 && at < before.text.length && /[\ud800-\udbff]/.test(before.text[at - 1]) && /[\udc00-\udfff]/.test(before.text[at]));
	if (!boundary(start) || !boundary(end)) return null;
	const same = (key, a, b) => key === 'size' ? (a ? typed.size(a).points : null) === (b ? typed.size(b).points : null)
		: key === 'family' ? (a?.css || null) === (b?.css || null) : (a || null) === (b || null);
	const literal = new Set();
	for (const leaf of before.leaves) if (leaf.blocked) for (let at = leaf.start; at < leaf.end; at++) literal.add(at);
	const desired = before.paint.map((style, at) => {
		if (at < start || at >= end || literal.has(at)) return style;
		const next = {...style};
		for (const key of keys) { if (wanted[key] === null) delete next[key]; else next[key] = wanted[key]; }
		return next;
	});
	if (desired.every((style, at) => keys.every(key => same(key, style[key], before.paint[at][key])))) return source;
	const semantics = _rapierCutSemantics(source, options), map = semantics && _rapierCutSourceMap(source, before.text, semantics.formulas, true, semantics.tokens, true);
	if (!map || map.from[start] == null || map.to[end - 1] == null) return null;
	const ranges = value => {
		const offset = options?.tableCell ? 2 : 0, wrapped = offset ? '| ' + value + ' |\n| --- |' : value;
		return spec.typographySourceRanges(wrapped, md).filter(pair => pair.start >= offset && pair.end <= offset + value.length)
			.map(pair => ({...pair, start: pair.start - offset, innerStart: pair.innerStart - offset, innerEnd: pair.innerEnd - offset, end: pair.end - offset}));
	};
	let pairs;
	try { pairs = ranges(source); } catch (_) { return null; }
	const removed = pairs.filter(pair => pair.innerStart < map.to[end - 1] && pair.innerEnd > map.from[start] && keys.some(key => pair.style[key]));
	const cuts = removed.flatMap(pair => [{start: pair.start, end: pair.innerStart}, {start: pair.innerEnd, end: pair.end}]).sort((a, b) => b.start - a.start);
	let bare = source;
	for (const cut of cuts) bare = bare.slice(0, cut.start) + bare.slice(cut.end);
	const remaining = _rapierTypographyRuns(bare, options), bareSemantics = _rapierCutSemantics(bare, options);
	if (!remaining || remaining.text !== before.text || !bareSemantics) return null;
	const bareMap = _rapierCutSourceMap(bare, before.text, bareSemantics.formulas, true, bareSemantics.tokens, true);
	if (!bareMap) return null;
	const edits = [];
	for (const leaf of remaining.leaves) {
		let at = leaf.start;
		while (at < leaf.end) {
			const delta = {};
			for (const key of ['size', 'color', 'family']) if (!same(key, desired[at][key], remaining.paint[at][key])) {
				if (!desired[at][key]) return null;
				delta[key] = desired[at][key];
			}
			let stop = at + 1;
			while (stop < leaf.end && ['size', 'color', 'family'].every(key =>
				same(key, desired[stop][key], desired[at][key]) && same(key, remaining.paint[stop][key], remaining.paint[at][key]))) stop++;
			if (Object.keys(delta).length && !/^[\r\n]*$/.test(before.text.slice(at, stop))) {
				const from = bareMap.from[at], to = bareMap.to[stop - 1];
				if (from == null || to == null || to <= from || !boundary(at) || !boundary(stop)) return null;
				const content = bare.slice(from, to);
				const lead = /^[\r\n]*/.exec(content)[0], trail = /[\r\n]*$/.exec(content)[0];
				const core = content.slice(lead.length, content.length - trail.length);
				if (core) edits.push({from, to, value: lead + typed.wrap(delta, core) + trail});
			}
			at = stop;
		}
	}
	let next = bare;
	for (const edit of edits.sort((a, b) => b.from - a.from)) next = next.slice(0, edit.from) + edit.value + next.slice(edit.to);
	const after = _rapierTypographyRuns(next, options);
	const fingerprint = value => _rapierOtherSemanticsFingerprint(options?.tableCell ? '| ' + value + ' |\n| --- |' : value, 'typography');
	return after && after.text === before.text && fingerprint(next) === fingerprint(source) &&
		after.paint.every((style, at) => before.text[at] === '\n' || ['size', 'color', 'family'].every(key => same(key, style[key], desired[at][key]))) ? next : null;
}

function _rapierPlanFont(raw, family, start, end, options = null) {
	return _rapierPlanTypography(raw, {family}, start, end, options);
}

const _rapierFontPicker = (() => {
	let session = null;
	const select = () => document.getElementById('font-picker-select');
	const current = held => session === held && _rapierUi.picker === 'font' &&
		_rapierMutationStampIsCurrent(held.stamp) && _rapierSourceText() === held.before &&
		rapier.view.restoreToken === held.intent &&
		!rapier.composition.block && !rapier.composition.source;
	function cancel() {
		session = null;
		const control = select();
		if (control) { control.disabled = false; control.removeAttribute('aria-busy'); }
	}
	function paint(held) {
		const control = select(), spec = globalThis.RapierMarkdownSpec;
		control.replaceChildren();
		const row = (value, label, disabled = false) => {
			const option = document.createElement('option');
			option.value = value; option.textContent = label; option.disabled = disabled; control.append(option);
		};
		for (const [value, label] of [['', 'Inherit'], ['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono'], ['system', 'System'], ['hand', 'Hand']]) row(value, label);
		const records = [];
		for (const raw of _rapierDocumentFonts.fonts()) {
			try { records.push(globalThis.RapierDrawFonts.admitFonts([raw])[0]); }
			catch (_) {  }
		}
		for (const family of [...new Set(records.map(font => font.family || font.name))].sort((a, b) => a.localeCompare(b))) row(family, family);
		control.setAttribute('aria-label', held.whole ? 'Font for the document' : 'Font for selected text');
		if (held.whole) {
			const named = spec.readDocumentSettings(held.before)?.mainfont?.family || '';
			const value = Object.hasOwn({sans: 1, serif: 1, mono: 1, system: 1, hand: 1}, named.toLowerCase()) ? named.toLowerCase() : named;
			if (![...control.options].some(option => option.value === value)) row(value, value, true);
			control.value = value;
			return;
		}
		const range = held.format.range, common = range.commonAncestorContainer, names = new Set();
		const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT);
		let node = common.nodeType === Node.TEXT_NODE ? common : walker.nextNode();
		for (; node; node = walker.nextNode()) {
			if (!range.intersectsNode(node)) continue;
			const from = node === range.startContainer ? range.startOffset : 0;
			const to = node === range.endContainer ? range.endOffset : node.length;
			if (!node.data.slice(from, to).trim()) continue;
			const css = getComputedStyle(node.parentElement).fontFamily;
			let family = spec.typography.familyCss(css)?.name || css;
			const inherited = records.find(font => 'rapier-' + font.id === family);
			if (inherited) family = inherited.family || inherited.name;
			names.add(family);
		}
		const family = names.size === 1 ? [...names][0] : '';
		if (names.size > 1) { row('__mixed__', 'Mixed fonts', true); control.value = '__mixed__'; return; }
		if (![...control.options].some(option => option.value === family)) row(family, family, true);
		control.value = family;
	}
	function open(event = null) {
		if (_rapierUi.picker === 'font') { _rapierUiClosePicker('font', false); return true; }
		if (_rapierUserMutationBlocked() || rapier.document.docKind !== 'markdown') return false;
		_rapierRestoreToolbarSelection();
		const format = _rapierFormatSelectionState({marks: true}), segments = format && _rapierHighlightSegments(format);
		const words = segments?.some(segment => segment.start < segment.end) &&
			(rapier.view.mode === 'edit' || rapier.view.mode === 'read' && format.wrappers.length >= 2);
		const caret = !words && window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
		const held = words ? {format, segments, range: format.range.cloneRange(), intent: rapier.view.restoreToken, bookmark: _rapierSelectionBookmark(format, segments), before: _rapierSourceText(),
			stamp: Object.freeze(_rapierMutationStamp()), viewport: _rapierCaptureEditorViewport(), busy: false}
			: {whole: true, range: caret || document.createRange(), intent: rapier.view.restoreToken, before: _rapierSourceText(),
				stamp: Object.freeze(_rapierMutationStamp()), viewport: _rapierCaptureEditorViewport(), busy: false};
		session = held;
		paint(held);
		refreshFormatToolbar();
		_rapierUiOpenPicker('font', event);
		void _rapierPersonalStore.ready.then(() => { if (current(held) && !held.busy) paint(held); });
		return true;
	}
	function selectionChanged(selection) {
		if (!session || _rapierUi.picker !== 'font') return;
		const range = _rapierSelectionContext(selection)?.range, held = session.range;
		const nativeCollapse = range?.collapsed && (select() === document.activeElement || session.busy);
		if (!current(session) || range && !nativeCollapse && (range.startContainer !== held.startContainer || range.startOffset !== held.startOffset ||
			range.endContainer !== held.endContainer || range.endOffset !== held.endOffset)) _rapierUiClosePicker('font', false);
	}
	async function choose() {
		const held = session, control = select();
		if (!held || held.busy || control.selectedOptions[0]?.disabled || _rapierUserMutationBlocked()) return false;
		if (!current(held)) { showToast('The document changed. Open Fonts again.', 'error'); return false; }
		const family = control.value || null, fontState = _rapierDocumentFonts.stateKey();
		held.busy = true; control.disabled = true; control.setAttribute('aria-busy', 'true');
		if (held.whole) try {
			const candidate = globalThis.RapierMarkdownSpec.writeDocumentFontSetting(held.before, 'mainfont', family);
			const portable = await _rapierDocumentFonts.materialize(candidate, {force: true});
			if (!current(held) || fontState !== _rapierDocumentFonts.stateKey()) return false;
			_rapierUiClosePicker('font', false);
			rapierFocusEditingHost();
			if (held.range.startContainer?.isConnected) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(held.range); }
			if (portable === held.before) return true;
			const admitted = () => _rapierMutationStampIsCurrent(held.stamp) && _rapierSourceText() === held.before &&
				fontState === _rapierDocumentFonts.stateKey() && !rapier.composition.block && !rapier.composition.source;
			if (!await _rapierCommitSourceProjection([_rapierPrefixSuffixDiff(held.before, portable)], 'document.typography', null, null, held.viewport, null, admitted)) return false;
			if (_rapierSourceText() === portable) _rapierDocumentFonts.prepared(portable);
			_rapierRestoreEditorViewport(held.viewport);
			return true;
		} catch (error) { if (_rapierMutationStampSharesDocument(held.stamp)) showToast(String(error.message || error), 'error'); return false; }
		finally { if (session === held) { held.busy = false; control.disabled = false; control.removeAttribute('aria-busy'); } }
		try {
			const splices = [], spans = _rapierCurrentBodyBlockSpans();
			for (let index = 0; index < held.segments.length; index++) {
				const segment = held.segments[index], block = held.format.blocksBefore[index];
				if (segment.start >= segment.end) continue;
				const changed = segment.cells ? _rapierPlanTableCells(block.raw, segment.cells, (cell, words, start, end) => _rapierPlanFont(cell, family, start, end, {tableCell: true}))
					: _rapierPlanFont(block.raw, family, segment.start, segment.end);
				if (changed == null) throw new Error('Select the words within one paragraph or table cell.');
				const span = spans.find(row => row.id === block.id);
				if (!span) throw new Error('The document changed. Open Fonts again.');
				if (changed !== block.raw) splices.push({pos: _rapierCanonicalOffsetOfBody(span.start), removed: block.raw, inserted: changed});
			}
			splices.sort((a, b) => b.pos - a.pos);
			const candidate = _rapierTransformSplices(held.before, splices);
			const portable = await _rapierDocumentFonts.materialize(candidate, {force: true});
			if (portable !== candidate) splices.push(_rapierPrefixSuffixDiff(candidate, portable));
			if (!current(held) || fontState !== _rapierDocumentFonts.stateKey()) return false;
			const admitted = () => _rapierMutationStampIsCurrent(held.stamp) && _rapierSourceText() === held.before &&
				rapier.view.restoreToken === held.intent &&
				fontState === _rapierDocumentFonts.stateKey() && !rapier.composition.block && !rapier.composition.source;
			_rapierUiClosePicker('font', false);
			rapierFocusEditingHost();
			_rapierRestoreSelectionBookmark(held.bookmark);
			if (splices.length && !await _rapierCommitSourceProjection(splices, 'document.typography', null, null, held.viewport, null, admitted)) return false;
			if (_rapierMutationStampSharesDocument(held.stamp) && _rapierSourceText() === portable && fontState === _rapierDocumentFonts.stateKey()) {
				_rapierDocumentFonts.prepared(portable);
				_rapierRestoreSelectionBookmark(held.bookmark);
				_rapierRestoreEditorViewport(held.viewport);
			}
			return true;
		} catch (error) { if (_rapierMutationStampSharesDocument(held.stamp)) showToast(String(error.message || error), 'error'); return false; }
		finally { if (session === held) { held.busy = false; control.disabled = false; control.removeAttribute('aria-busy'); } }
	}
	return Object.freeze({open, choose, cancel, selectionChanged, ownsFocus: () => !!session && _rapierUi.picker === 'font' &&
		current(session) && (session.busy || select() === document.activeElement)});
})();

function _rapierFontCommand() {
	return { id: 'document.font', label: 'Fonts', group: 'format', icon: 'type', keywords: ['typeface', 'family'],
		section: true, run: () => _rapierFontPicker.open() };
}

function _rapierFontSheetOpen(options = null) {
	if (options?.default !== true) return _rapierFontPicker.open();
	if (!_rapierRequireFeature('defaultDocumentFont', {source: 'default-document-font'})) return false;
	const before = _rapierSourceText(), stamp = Object.freeze(_rapierMutationStamp());
	let busy = false;
	const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
	const overlay = el('div', 'settings-overlay rapier-font-overlay open'), panel = el('section', 'settings-panel rapier-pop rapier-font-sheet');
	panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'rapier-font-title');
	const body = el('div', 'settings-panel__body'), title = el('h2', 'settings-panel__title', 'Default document font'); title.id = 'rapier-font-title';
	const list = el('div', 'rapier-font-choices'), status = el('p', 'rapier-font-status');
	status.setAttribute('role', 'status'); status.hidden = true;
	const actions = el('div'); actions.setAttribute('data-pop-row', '');
	const add = el('button', 'rapier-draw-chip', 'Add font'), done = el('button', 'rapier-draw-chip', 'Cancel');
	add.type = done.type = 'button'; add.dataset.pop = 'affirm'; done.dataset.pop = 'affirm'; actions.append(add, done);
	const input = el('input'); input.type = 'file'; input.multiple = true; input.hidden = true;
	input.accept = '.ttf,.otf,.woff,.woff2,.ttc,.otc,.zip,font/ttf,font/otf,font/woff,font/woff2,application/zip';
	body.append(title, list, status, actions, input); panel.append(body); overlay.append(panel);
	const dialog = _rapierBeginEngineDialog(overlay);
	dialog.blocking = () => busy;
	const note = value => { status.hidden = !value; status.textContent = value || ''; };
	const close = () => { if (!busy) dialog.close(true); };
	overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
	done.addEventListener('click', close);
	async function choose(family) {
		if (busy) return;
		if (!_rapierMutationStampIsCurrent(stamp) || _rapierSourceText() !== before) { note('The document changed. Open Fonts again.'); return; }
		busy = true; panel.setAttribute('aria-busy', 'true');
		const progress = _rapierProgressOver(overlay), popup = progress.open({label: 'Preparing font', after: 500});
		try {
			const changed = await _rapierDocumentFonts.chooseDefault(family, {current: () => overlay.isConnected &&
				_rapierMutationStampIsCurrent(stamp) && _rapierSourceText() === before});
			if (changed) dialog.close(false);
			else note('The document changed. Open Default document font again.');
		} catch (error) { if (overlay.isConnected) note(String(error.message || error)); else showToast(String(error.message || error), 'error'); }
		finally { busy = false; panel.removeAttribute('aria-busy'); popup.end(); progress.release(); }
	}
	function paint() {
		list.replaceChildren();
		const selectedFont = RapierPreferences.read('defaultDocumentFont');
		const row = (id, label, font, parent) => {
			const button = el('button', 'rapier-draw-chip rapier-font-choice'); button.type = 'button'; button.dataset.fontId = id;
			const name = el('span', 'rapier-font-name', label); button.append(name);
			name.style.fontFamily = font ? globalThis.RapierDrawFonts.fontFaceFamily(font) : globalThis.RapierMarkdownSpec.fontFamilyCss(id || 'sans');
			if (font) {
				void _rapierDocumentFonts.preview(font).catch(() => {});
				button.append(el('span', 'rapier-font-detail', (font.axes?.length ? 'Variable' : font.subfamily || String(font.weight || 400)) + ' · ' + font.id.slice(-6)));
			}
			button.setAttribute('aria-pressed', String(selectedFont === id));
			button.addEventListener('click', () => void choose(id)); parent.append(button);
		};
		const defaults = el('div', 'rapier-font-defaults');
		for (const [id, label] of [['', 'Factory default'], ['serif', 'Serif'], ['mono', 'Mono'], ['hand', 'Hand']]) row(id, label, null, defaults);
		list.append(defaults);
		const records = [];
		for (const raw of _rapierDocumentFonts.fonts()) {
			try { records.push(globalThis.RapierDrawFonts.admitFonts([raw])[0]); }
			catch (_) { note('A font in your library is unreadable. Add its original file again.'); }
		}
		records.sort((a, b) => a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
		if (records.length) list.append(el('h3', 'rapier-font-section', 'Your fonts'));
		for (const font of records) row(font.id, font.family || font.name, font, list);
	}
	add.addEventListener('click', () => { if (!busy) { input.value = ''; input.click(); } });
	input.addEventListener('change', async () => {
		const files = [...(input.files || [])]; input.value = '';
		if (!files.length || busy) return;
		busy = true; panel.setAttribute('aria-busy', 'true'); note('');
		const progress = _rapierProgressOver(overlay), popup = progress.open({label: 'Adding fonts', after: 500});
		try {
			const result = await _rapierDocumentFonts.add(files);
			paint(); note(result.refused.map(row => row.name + ': ' + row.reason).join('\n'));
		} catch (error) { note(String(error.message || error)); }
		finally { busy = false; panel.removeAttribute('aria-busy'); popup.end(); progress.release(); }
	});
	paint(); _rapierPopArrange(actions);
	void _rapierPersonalStore.ready.then(() => { if (overlay.isConnected) paint(); });
	done.focus({preventScroll: true});
	return true;
}
