// Picture readings join the existing Find records. Source owns occurrences; DOM nodes only place their marks.
const _rapierPictureFind = (() => {
	let entries = new Map(), blocks = new Map(), authority = '', rootId = '', dirty = true;
	let timer = 0, idle = 0, working = false, bound = false;
	const host = () => document.getElementById('editor-blocks');
	const active = () => rapier.document.docKind === 'markdown' && !rapier.compare.active;
	const local = url => /^(?:data:image\/|blob:)/i.test(url);
	function resolvedUrl(value) {
		const url = _rapierEmbedAssetSource(value) || String(value || '');
		if (!url || local(url)) return url;
		try { const absolute = new URL(url, document.baseURI); return /^https?:$/.test(absolute.protocol) ? absolute.href : ''; }
		catch (_) { return ''; }
	}
	function sourceUrl(image, index) {
		const label = image.reference == null ? null : RapierImageAssets.normalizeLabel(image.reference);
		const url = label == null ? image.destination : index.assets.get(label)?.url || index.references[label]?.href || '';
		return resolvedUrl(url);
	}
	function rawImages(raw) {
		if (!raw.includes('<')) return [];
		const markup = _rapierRenderBlockSpecial(raw) ?? _rapierRenderBlockMarkup(raw).html;
		const prior = _rapierSanitizeRuntime.context;
		_rapierSanitizeRuntime.context = 'render';
		try {
			const fragment = DOMPurify.sanitize(markup, {...RAPIER_SANITIZE_OPTIONS.render, RETURN_DOM_FRAGMENT: true});
			return Array.from(fragment.querySelectorAll('img:not([data-rapier-markdown-image])'), image => ({
				destination: image.getAttribute('src') || '', srcset: image.getAttribute('srcset') || '',
				responsive: image.hasAttribute('srcset') || !!image.closest('picture')?.querySelector('source[srcset]'),
			}));
		} finally { _rapierSanitizeRuntime.context = prior; }
	}
	function imageFor(entry, wake = false, parked = false) {
		if (entries.get(entry.key) !== entry || entry.authority !== rapier.identity.authority) return null;
		let wrapper = _rapierWysiwygLedger.entries.get(String(entry.blockId))?.wrapper;
		if (wake) wrapper = _rapierWysiwygWake(wrapper);
		const surface = wrapper && _blockSurfaceEl(wrapper);
		const image = surface?.querySelectorAll(entry.raw ? 'img:not([data-rapier-markdown-image])' : '[data-rapier-markdown-image]')[entry.imageIndex];
		if (image?.tagName !== 'IMG' || !parked && !host()?.contains(image)) return null;
		const asset = image.getAttribute('data-rapier-asset'), destination = image.getAttribute('data-rapier-image-url');
		// The image owner promotes raw JPEG XL too; its display URL then belongs to that owner.
		const promoted = entry.raw && destination && resolvedUrl(destination) === entry.authoredUrl && entry.authoredUrl === entry.url;
		if (entry.raw && (!promoted && resolvedUrl(image.getAttribute('src')) !== entry.authoredUrl ||
			(image.getAttribute('srcset') || '') !== entry.srcset)) return null;
		if (!local(entry.url) && resolvedUrl(image.currentSrc || image.src) !== entry.url) return null;
		if (asset) return !entry.raw && RapierImageAssets.normalizeLabel(asset) === entry.reference ? image : null;
		if (destination) return (entry.raw ? promoted : destination === entry.destination) ? image : null;
		return resolvedUrl(image.currentSrc || image.src) === entry.url ? image : null;
	}
	function scan() {
		const identity = rapier.identity.authority;
		if (authority !== identity) { entries.clear(); blocks.clear(); authority = identity; }
		if (!active()) { entries.clear(); return; }
		const captured = _rapierEmbeddedImages.index(), spans = _rapierCurrentBodyBlockSpans();
		const next = new Map(), keep = new Set();
		const admit = (key, url, values) => {
			if (!url || !/^(?:data:image\/|blob:|https?:\/\/)/i.test(url)) return;
			const prior = entries.get(key), entry = prior?.url === url ? prior :
				{key, url, authority: identity, reading: null, done: false, pending: false};
			Object.assign(entry, values);
			next.set(key, entry);
		};
		for (let at = 0; at < rapier.document.blocks.length; at++) {
			const block = rapier.document.blocks[at], id = String(block.id), raw = String(block.raw || '');
			keep.add(id);
			let parsed = blocks.get(id);
			if (!parsed || parsed.raw !== raw || parsed.references !== rapier.semantic.referenceRevision || parsed.remote !== _rapierRemoteContent.allowed) {
				parsed = {raw, references: rapier.semantic.referenceRevision, remote: _rapierRemoteContent.allowed,
					images: raw.includes('![') ? _rapierScanMarkdownImages(raw) : [], html: rawImages(raw)};
				blocks.set(id, parsed);
			}
			const start = _rapierCanonicalOffsetOfBody(spans[at]?.start || 0);
			for (const image of parsed.images) admit(id + ':' + image.renderIndex,
				sourceUrl(image, captured.index),
				{blockId: block.id, imageIndex: image.renderIndex, order: start + image.start,
					reference: image.reference == null ? null : RapierImageAssets.normalizeLabel(image.reference), destination: image.destination});
			// Source ordinals survive hydration and replacement. Parsing never wakes a block or requests a picture.
			const wrapper = _rapierWysiwygLedger.entries.get(id)?.wrapper, surface = wrapper && _blockSurfaceEl(wrapper);
			const shown = surface?.querySelectorAll('img:not([data-rapier-markdown-image])');
			for (let ordinal = 0; ordinal < parsed.html.length; ordinal++) {
				const row = parsed.html[ordinal], authoredUrl = resolvedUrl(row.destination), image = shown?.[ordinal];
				const same = image && resolvedUrl(image.getAttribute('src')) === authoredUrl && (image.getAttribute('srcset') || '') === row.srcset;
				const url = row.responsive ? same && image.currentSrc ? resolvedUrl(image.currentSrc) : '' : authoredUrl;
				admit(id + ':html:' + ordinal, url,
					{blockId: block.id, imageIndex: ordinal, raw: true, authoredUrl, srcset: row.srcset, order: start});
			}
		}
		for (const id of blocks.keys()) if (!keep.has(id)) blocks.delete(id);
		entries = next; rootId = rapier.document.source.rootId; dirty = false;
	}
	function schedule(wait = 0) {
		if (timer || idle || working || document.hidden) return;
		if (!_rapierOcrLive() && (!rapier.find.open || !rapier.find.query)) return;
		timer = setTimeout(() => {
			timer = 0;
			if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(() => { idle = 0; void step(); });
			else void step();
		}, wait);
	}
	async function step() {
		if (working || document.hidden || !active()) return;
		if (_rapierOcrBusy()) { schedule(300); return; }
		if (dirty || rootId !== rapier.document.source.rootId || authority !== rapier.identity.authority) {
			scan();
			if (_rapierOcrLive()) refresh();
		}
		if (!_rapierOcrLive()) { offer(); return; }
		const entry = [...entries.values()].find(row => !row.done && !row.pending &&
			(local(row.url) || imageFor(row)?.complete && imageFor(row)?.naturalWidth));
		if (!entry) { refresh(); return; }
		working = entry.pending = true;
		try {
			const reading = await _rapierOcrReading(entry.url, {linked: !local(entry.url)});
			// Reconcile a changed source before admitting the completed reading to this document.
			if (dirty || rootId !== rapier.document.source.rootId || authority !== rapier.identity.authority) scan();
			if (_rapierOcrLive() && entries.get(entry.key) === entry && entry.authority === rapier.identity.authority)
				entry.reading = reading;
		} catch (_) { /* An unreadable picture contributes no words. Its source is untouched. */ }
		finally { entry.done = true; entry.pending = false; working = false; }
		refresh(); schedule(50);
	}
	function offer() {
		if (!rapier.find.open || !rapier.find.query || rapier.view.mode === 'source' || _rapierOcr.provider?.status !== 'absent') return;
		if (entries.size) _rapierOcrRequest(false);
	}
	function merge(text, query, overflow = false) {
		const records = text.slice();
		if (_rapierOcrLive() && active() && authority === rapier.identity.authority && rootId === rapier.document.source.rootId) {
			for (const entry of entries.values()) {
				if (!entry.reading) continue;
				if (entry.query !== query) {
					entry.query = query;
					entry.matches = _rapierOcrModule().pictureMarks(entry.reading, query, undefined, _RAPIER_FIND_MATCH_LIMIT + 1).map((quad, ordinal) =>
						({surface: 'picture', blockId: entry.blockId, entry, quad, ordinal, order: entry.order, range: null}));
				}
				for (const match of entry.matches) { match.order = entry.order; records.push(match); }
			}
			const positions = new Map();
			const position = record => {
				if (record.surface !== 'picture') return record.range;
				if (positions.has(record.entry)) return positions.get(record.entry);
				const image = imageFor(record.entry, false, true), range = image?.parentNode && document.createRange();
				if (range) range.selectNode(image);
				positions.set(record.entry, range);
				return range;
			};
			records.sort((a, b) => {
				if (a.blockId === b.blockId && (a.entry?.raw || b.entry?.raw)) {
					const left = position(a), right = position(b);
					if (left && right && left.startContainer.getRootNode() === right.startContainer.getRootNode()) {
						const order = left.compareBoundaryPoints(Range.START_TO_START, right);
						if (order) return order;
					}
				}
				return (a.surface === 'picture' ? a.order : a.start) -
					(b.surface === 'picture' ? b.order : b.start) ||
					(a.entry?.raw && b.entry?.raw ? a.entry.imageIndex - b.entry.imageIndex : 0) || (a.ordinal || 0) - (b.ordinal || 0);
			});
		}
		overflow ||= records.length > _RAPIER_FIND_MATCH_LIMIT;
		records.length = Math.min(records.length, _RAPIER_FIND_MATCH_LIMIT);
		return {records, overflow};
	}
	function refresh() {
		if (_rapierFindRuntime.job) return;
		if (!rapier.find.open || !rapier.find.query || rapier.view.mode === 'source' || !active()) return;
		if (!_rapierMutationStampSharesDocument(_rapierFindRuntime.documentGuard)) return;
		const selected = rapier.find.ranges[rapier.find.current];
		if (!_rapierFindOwnsCurrentDocument()) {
			const previous = _rapierFindRuntime.documentGuard;
			if (_rapierOcrLive()) {
				if (!_rapierMutationStampSharesDocument(previous) || previous.mode !== String(rapier.view.mode || '')) return;
				const projection = {};
				const found = _rapierFindIndexHits(_rapierGetCanonicalText(), rapier.find.query, 'rendered', projection);
				_rapierFindRuntime.documentGuard = Object.freeze({..._rapierMutationStamp(), projection,
					mode: String(rapier.view.mode || ''), docKind: String(rapier.document.docKind || '')});
				_rapierFindRuntime.textRecords = found.records; _rapierFindRuntime.textOverflow = found.overflow;
				rapier.find.flexible = found.flexible;
			}
		}
		const result = merge(_rapierFindRuntime.textRecords, rapier.find.query,
			_rapierFindRuntime.textOverflow);
		rapier.find.ranges = result.records; rapier.find.overflow = result.overflow;
		const kept = result.records.findIndex(row => row === selected || selected && selected.surface !== 'picture' &&
			row.surface === selected?.surface && row.blockId === selected.blockId && row.start === selected.start && row.end === selected.end);
		rapier.find.current = kept >= 0 ? kept : Math.min(rapier.find.current, Math.max(0, result.records.length - 1));
		if (CSS.highlights) {
			const ranges = result.records.filter(row => row.surface !== 'picture' && row.range).map(row => row.range);
			if (ranges.length) CSS.highlights.set('rapier-find-all', new Highlight(...ranges));
			else CSS.highlights.delete('rapier-find-all');
			const current = result.records[rapier.find.current];
			if (current?.surface !== 'picture' && current?.range) CSS.highlights.set('rapier-find-current', new Highlight(current.range));
			else CSS.highlights.delete('rapier-find-current');
		}
		_setFindCount(result.records.length ? rapier.find.current + 1 : 0, _rapierFindTotalLabel());
		_findScheduleOverlay();
	}
	function range(match, wake = false) {
		const image = imageFor(match.entry, wake);
		if (!image || !_rapierOcrLive()) return null;
		match.range ||= document.createRange();
		match.range.selectNode(image);
		return match.range;
	}
	function geometry(match, image = imageFor(match.entry)) { return RapierPictureMarks.geometry(match.quad, image); }
	function reveal(match) {
		if (match?.surface !== 'picture' || rapier.find.ranges[rapier.find.current] !== match ||
			!_rapierOcrLive() || !_rapierFindOwnsCurrentDocument()) return null;
		return RapierPictureMarks.reveal(match.quad, imageFor(match.entry), host());
	}
	function paint(root, clip, frame) {
		if (!_rapierOcrLive()) return;
		const clips = new Map();
		for (let at = 0; at < rapier.find.ranges.length; at++) {
			const match = rapier.find.ranges[at];
			if (match.surface !== 'picture') continue;
			const image = imageFor(match.entry);
			if (!image || image.hasAttribute('data-rapier-asset-state') && image.dataset.rapierAssetState !== 'ready') continue;
			RapierPictureMarks.paint(root, match.quad, image, at === rapier.find.current, host(), clip, frame.originX, clips);
		}
	}
	function setup() {
		if (bound || !host()) return;
		bound = true;
		new MutationObserver(() => { dirty = true; schedule(100); if (rapier.find.query) _findScheduleOverlay(); }).observe(host(),
			{childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'data-rapier-asset',
				'data-rapier-image-url', 'data-rapier-asset-state']});
		host().addEventListener('load', event => {
			const selected = rapier.find.ranges[rapier.find.current];
			let retired = false, retiredCurrent = false;
			// A remote image can load different bytes at the same URL. Retire its occurrence before idle reads again.
			if (event.target?.tagName === 'IMG') for (const entry of entries.values()) {
				if (!/^https?:\/\//i.test(entry.url) || imageFor(entry) !== event.target) continue;
				entries.delete(entry.key); retired = true;
				retiredCurrent ||= selected?.entry === entry;
			}
			dirty = true;
			if (retired) {
				if (retiredCurrent) _findCancelStableReveal();
				refresh(); _findScheduleOverlay();
			} else _findRefreshOverlayGeometry();
			schedule();
		}, true);
		window.addEventListener('rapier:ocrplugin', () => {
			if (!_rapierOcrLive()) { entries.clear(); rootId = ''; }
			dirty = true; refresh(); schedule();
		});
		document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
		schedule();
	}
	setTimeout(setup, 0);
	return {merge, refresh, range, geometry, reveal, paint, schedule};
})();
