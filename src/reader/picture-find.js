// SPDX-License-Identifier: AGPL-3.0-only
// Picture readings belong to the document on the page. The shared reader and cache own pixels and words.
const readerPictureFind = (() => {
	let entries = new Map(), assetSource = null, assetIndex = null, shown = -1, dirty = true, working = false, timer = 0, idle = 0, overlay = null, frame = 0;
	const host = () => document.getElementById('editor-blocks');
	const local = url => /^(?:data:image\/|blob:)/i.test(url);
	const active = () => shown === reader.generation && reader.docKind === 'markdown';
	function source(image) {
		if (assetSource !== reader.source) { assetSource = reader.source; assetIndex = RapierImageAssets.documentAssets(assetSource); }
		let url = _rapierOcrImageUrl(image, assetIndex);
		if (!url || local(url)) return url;
		try {
			url = new URL(url, document.baseURI).href;
			if (!/^https?:\/\//i.test(url) || new URL(image.currentSrc || image.src, document.baseURI).href !== url) return '';
			return url;
		} catch (_) { return ''; }
	}
	function current(entry) {
		return active() && entries.get(entry.image) === entry && entry.generation === reader.generation &&
			host().contains(entry.image) && source(entry.image) === entry.url;
	}
	function scan() {
		const next = new Map();
		if (active()) for (const image of host().querySelectorAll('img')) {
			const url = source(image);
			if (!url || !/^(?:data:image\/|blob:|https?:\/\/)/i.test(url)) continue;
			const prior = entries.get(image);
			next.set(image, prior?.url === url && prior.generation === reader.generation ? prior :
				{image, url, generation: reader.generation, reading: null, done: false, pending: false});
		}
		entries = next; dirty = false;
	}
	function schedule(wait = 0) {
		if (timer || idle || working || document.hidden || !active()) return;
		if (!_rapierOcrLive() && (document.getElementById('find-bar').hidden || !document.getElementById('find-input').value)) return;
		timer = setTimeout(() => {
			timer = 0;
			if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(() => { idle = 0; void step(); });
			else void step();
		}, wait);
	}
	function refresh() {
		if (!document.getElementById('find-bar').hidden && document.getElementById('find-input').value) readerFindRun(true);
		else clear();
	}
	async function step() {
		if (working || document.hidden || !active()) return;
		if (_rapierOcrBusy()) { schedule(300); return; }
		if (dirty) scan();
		if (!_rapierOcrLive()) {
			if (entries.size && _rapierOcr.provider?.status === 'absent' && !document.getElementById('find-bar').hidden &&
				document.getElementById('find-input').value) _rapierOcrRequest(false);
			return;
		}
		const entry = [...entries.values()].find(row => !row.done && !row.pending && current(row) &&
			(local(row.url) || row.image.complete && row.image.naturalWidth));
		if (!entry) return;
		working = entry.pending = true;
		try {
			const reading = await _rapierOcrReading(entry.url, {linked: !local(entry.url)});
			if (dirty) scan();
			if (_rapierOcrLive() && current(entry)) entry.reading = reading;
		} catch (_) { /* An unreadable picture contributes no words. */ }
		finally { entry.done = true; entry.pending = false; working = false; }
		refresh(); schedule(50);
	}
	function merge(text, query, overflow) {
		const ranges = text.slice();
		if (dirty) scan();
		if (_rapierOcrLive() && active()) for (const entry of entries.values()) {
			if (!entry.reading || !current(entry)) continue;
			if (entry.query !== query) {
				entry.query = query;
				entry.matches = _rapierOcrModule().pictureMarks(entry.reading, query, undefined, READER_FIND_LIMIT + 1).map((quad, ordinal) => {
					const range = document.createRange();
					range.selectNode(entry.image);
					range.picture = {entry, quad, ordinal};
					return range;
				});
			}
			ranges.push(...entry.matches);
		}
		ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b) || (a.picture?.ordinal || 0) - (b.picture?.ordinal || 0));
		overflow ||= ranges.length > READER_FIND_LIMIT;
		ranges.length = Math.min(ranges.length, READER_FIND_LIMIT);
		return {ranges, overflow};
	}
	function same(a, b) {
		return a === b || (!a.picture && !b.picture && a.startContainer === b.startContainer && a.startOffset === b.startOffset &&
			a.endContainer === b.endContainer && a.endOffset === b.endOffset);
	}
	function clear() { overlay?.replaceChildren(); }
	function paint() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0; clear();
			if (!_rapierOcrLive() || !active() || document.getElementById('find-bar').hidden) return;
			const box = host().getBoundingClientRect(), view = window.visualViewport, clips = new Map();
			const clip = {left: Math.max(box.left, view?.offsetLeft || 0), right: Math.min(box.right, (view?.offsetLeft || 0) + (view?.width || innerWidth)),
				top: Math.max(box.top, view?.offsetTop || 0), bottom: Math.min(box.bottom, (view?.offsetTop || 0) + (view?.height || innerHeight))};
			for (let at = 0; at < reader.find.ranges.length; at++) {
				const picture = reader.find.ranges[at].picture;
				if (!picture || !current(picture.entry)) continue;
				const image = picture.entry.image;
				if (image.hasAttribute('data-rapier-asset-state') && image.dataset.rapierAssetState !== 'ready') continue;
				if (!overlay) {
					overlay = document.createElement('div'); overlay.className = 'rapier-find-overlay'; overlay.setAttribute('aria-hidden', 'true');
					document.body.appendChild(overlay);
				}
				RapierPictureMarks.paint(overlay, picture.quad, image, at === reader.find.current, host(), clip, 0, clips);
			}
		});
	}
	function reveal(range) {
		const picture = range.picture;
		if (!picture || !_rapierOcrLive() || !current(picture.entry)) return null;
		return RapierPictureMarks.reveal(picture.quad, picture.entry.image, host());
	}
	function documentShown() { shown = reader.generation; dirty = true; scan(); schedule(); }
	function setup() {
		if (!host()) return;
		new MutationObserver(() => { dirty = true; refresh(); schedule(100); paint(); }).observe(host(),
			{childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'data-rapier-asset', 'data-rapier-image-url', 'data-rapier-asset-state']});
		host().addEventListener('load', event => {
			const entry = entries.get(event.target);
			if (entry && !local(entry.url)) entries.delete(event.target);
			dirty = true; refresh(); schedule(); paint();
		}, true);
		window.addEventListener('rapier:ocrplugin', () => {
			if (!_rapierOcrLive()) entries.clear();
			dirty = true; refresh(); schedule();
		});
		document.addEventListener('scroll', paint, {capture: true, passive: true});
		window.addEventListener('resize', paint, {passive: true});
		window.visualViewport?.addEventListener('resize', paint, {passive: true});
		window.visualViewport?.addEventListener('scroll', paint, {passive: true});
		document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
		schedule();
	}
	setTimeout(setup, 0);
	return {merge, same, clear, paint, reveal, schedule, documentShown};
})();
