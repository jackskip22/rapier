const _rapierHeavyRuntime = Object.seal({
	window: null,
	parkedSelection: null,
	draft: null,
	ticket(value) {
		return {...value, store: rapier.document.source, key: rapier.document.source.cacheKey,
			authority: rapier.identity.authority};
	},
	owns(value) {
		return !!value && value.store === rapier.document.source && value.key === rapier.document.source.cacheKey &&
			value.authority === rapier.identity.authority;
	},
	composing: false,
	slideTimer: 0,
	slideWhy: '',
	selection(ta) {
		if (_rapierSelectionOwnsDocument(ta)) return {start: 0, end: rapier.document.source.length,
			direction: ta.selectionDirection || 'forward'};
		const held = _rapierHeavyRuntime.parkedSelection;
		if (_rapierHeavyRuntime.owns(held))
			return {start: held.start, end: held.end, direction: held.direction || 'none'};
		return {start: _rapierAbsPos(ta.selectionStart || 0),
			end: _rapierAbsPos(ta.selectionEnd ?? ta.selectionStart ?? 0), direction: ta.selectionDirection || 'none'};
	},
	safeCut(source, offset, direction) {
		const at = Math.max(0, Math.min(source.length, offset));
		const pair = source.readSlice(Math.max(0, at - 1), at + 1);
		return at > 0 && at < source.length && (pair === '\r\n' ||
			(pair.charCodeAt(0) & 0xFC00) === 0xD800 && (pair.charCodeAt(1) & 0xFC00) === 0xDC00)
			? at + direction : at;
	},
	facts(source, startChar, endChar, limit) {
		const startLine = source.lineAt(startChar), endLine = source.lineAt(endChar) + 1;
		return {startChar, endChar, startLine, endLine,
			suffixLines: Math.max(0, source.lineAt(limit) + 1 - endLine),
			partialStart: startChar !== source.lineStart(startLine),
			partialEnd: endChar < Math.min(limit, source.lineEnd(endLine - 1))};
	},
	restoreSelection() {
		const held = _rapierHeavyRuntime.parkedSelection;
		if (!held) return;
		if (!_rapierHeavyRuntime.owns(held)) {
			_rapierHeavyRuntime.parkedSelection = null;
			return;
		}
		if (held.end - held.start > _RAPIER_HW_MOUNT_CHARS) return;
		_rapierHeavyRuntime.parkedSelection = null;
		const win = _rapierHeavyRuntime.window;
		if (win && held.start >= win.startChar && held.end <= win.endChar) return;
		_rapierHeavyWindowMountFromString(rapier.document.source, held.start, held.end, {preserveAssets: true,
			direction: held.direction || 'forward',
			...(win?.assetFold ? {assetFold: true, assetEnd: win.assetEnd} : {})});
		const ta = document.getElementById('source-textarea');
		if (ta) ta.setSelectionRange(_rapierTaPos(held.start), _rapierTaPos(held.end), held.direction || 'none');
	},
	deleteCommand(source, start, end, inputType) {
		let from = start, to = end;
		if (from === to) {
			const backward = /Backward$/.test(inputType), line = source.lineAt(start);
			if (/HardLine/.test(inputType)) {
				if (backward) from = source.lineStart(line); else to = source.lineEnd(line);
			} else {
				if (backward && !start || !backward && start === source.length) return null;
				const edge = _rapierSourceSegmentEdge(source, start, backward, /Word/.test(inputType));
				if (backward) from = edge; else to = edge;
			}
		}
		if (from === to) return null;
		return {splices: [{pos: from, removed: source.readSlice(from, to), inserted: ''}], selectionAfter: {start: from, end: from}};
	},
	indentCommand(source, start, end, unit, outdent) {
		const first = source.lineAt(start), last = source.lineAt(end > start && end === source.lineStart(source.lineAt(end)) ? end - 1 : end);
		const splices = [];
		for (let line = last; line >= first; line--) {
			const pos = source.lineStart(line), stop = source.lineEnd(line);
			if (outdent) {
				const prefix = source.readSlice(pos, Math.min(stop, pos + Math.max(1, unit.length)));
				const removed = prefix[0] === '\t' ? '\t' : /^ */.exec(prefix)[0].slice(0, unit === '\t' ? 1 : unit.length);
				if (removed) splices.push({pos, removed, inserted: ''});
			} else if (stop > pos) splices.push({pos, removed: '', inserted: unit});
		}
		const move = value => splices.reduce((at, row) => at < row.pos ? at :
			at >= row.pos + row.removed.length ? at + row.inserted.length - row.removed.length : row.pos, value);
		return {splices, selectionAfter: {start: move(start), end: move(end)}};
	},
	key(event) {
		if (event.defaultPrevented || event.isComposing || _rapierHeavyRuntime.composing) return;
		const win = _rapierHeavyRuntime.window, ta = event.currentTarget;
		if (!win || !ta) return;
		if (/^(?:ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key))
			rapier.undo.flushTypingBurst?.();
		const source = rapier.document.source;
		const held = _rapierSelectionOwnsDocument(ta) ? _rapierHeavyRuntime.ticket(_rapierHeavyRuntime.selection(ta))
			: _rapierHeavyRuntime.parkedSelection;
		const parkedLive = !!(held && _rapierHeavyRuntime.owns(held) && held.end > held.start &&
			(held.start < win.startChar || held.end > win.endChar));
		const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
		const mac = typeof navigator !== 'undefined' && /^(?:Mac|iP)/.test(navigator.platform || '');
		if (horizontal && (mac ? event.ctrlKey : event.metaKey || event.altKey)) return;
		if (horizontal || parkedLive && /^(?:ArrowUp|ArrowDown|Home|End)$/.test(event.key) &&
				!event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			const selected = _rapierHeavyRuntime.selection(ta);
			const focus = selected.direction === 'backward' ? selected.start : selected.end;
			const anchor = selected.direction === 'backward' ? selected.end : selected.start;
			const modified = event.ctrlKey || event.metaKey || event.altKey;
			let next;
			if (horizontal && modified) {
				next = event.metaKey ? _rapierSourceVisualOffset(ta, source, focus, event.key === 'ArrowLeft' ? 'Home' : 'End')
					: _rapierSourceSegmentEdge(source, focus, event.key === 'ArrowLeft', true);
			} else if (horizontal && !event.shiftKey && selected.start !== selected.end) {
				next = event.key === 'ArrowLeft' ? selected.start : selected.end;
			} else next = horizontal ? _rapierStepSourceOffset(source, focus, event.key)
				: _rapierSourceVisualOffset(ta, source, focus, event.key);
			const fixed = event.shiftKey ? anchor : next;
			_rapierHeavyWindowMountFromString(source, Math.min(fixed, next), Math.max(fixed, next),
				{preserveAssets: true, direction: next < fixed ? 'backward' : 'forward', ..._rapierCarriedAssetFold()});
			_rapierNoteWindowSelection(ta);
			return;
		}
		if (!parkedLive) _rapierHeavyRuntime.restoreSelection();
		const start = parkedLive ? held.start : _rapierAbsPos(ta.selectionStart);
		const end = parkedLive ? held.end : _rapierAbsPos(ta.selectionEnd);
		const direction = parkedLive ? (held.direction || 'none') : ta.selectionDirection;
		const focus = direction === 'backward' ? start : end;
		const homeEnd = event.key === 'Home' || event.key === 'End';
		if (!event.ctrlKey && !event.metaKey && !event.altKey &&
				(homeEnd || event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			const line = source.lineAt(focus), from = source.lineStart(line), to = source.lineStart(line + 1);
			const local = direction === 'backward' ? ta.selectionStart : ta.selectionEnd;
			const partialUp = event.key === 'ArrowUp' && win.partialStart && line === win.startLine && local <= win.guardLoChars;
			const partialDown = event.key === 'ArrowDown' && win.partialEnd && line === source.lineAt(win.endChar) &&
				local >= ta.value.length - win.guardHiFromEnd;
			if ((homeEnd || partialUp || partialDown) && (from < win.startChar || to > win.endChar)) {
				if (to - from > _RAPIER_HW_MOUNT_CHARS) {
					event.preventDefault();
					const target = _rapierSourceVisualOffset(ta, source, focus, event.key);
					const anchor = event.shiftKey ? direction === 'backward' ? end : start : target;
					_rapierHeavyWindowMountFromString(source, Math.min(anchor, target), Math.max(anchor, target),
						{preserveAssets: true, direction: target < anchor ? 'backward' : 'forward', ..._rapierCarriedAssetFold()});
					return;
				}
				_rapierHeavyWindowSet(Math.min(from, win.startChar), Math.max(to, win.endChar), {skipRefresh: true, keepWindow: true});
				return;
			}
			if (homeEnd) return;
		}
		if (homeEnd && (event.ctrlKey || event.metaKey) && !event.altKey) {
			const target = event.key === 'Home' ? 0 : source.length;
			if (!parkedLive && target >= win.startChar && target <= win.endChar) return;
			event.preventDefault();
			const anchor = event.shiftKey ? direction === 'backward' ? end : start : target;
			if (Math.min(anchor, target) === 0 && Math.max(anchor, target) === source.length && anchor !== target) {
				_rapierSelectAllSource(ta, target < anchor ? 'backward' : 'forward'); return;
			}
			const extentDirection = target < anchor ? 'backward' : 'forward';
			_rapierHeavyWindowMountFromString(source, Math.min(anchor, target), Math.max(anchor, target),
				{preserveAssets: true, direction: extentDirection});
			if (!_rapierHeavyRuntime.parkedSelection) {
				ta.setSelectionRange(_rapierTaPos(Math.min(anchor, target)), _rapierTaPos(Math.max(anchor, target)), extentDirection);
			}
			_rapierNoteWindowSelection(ta);
			return;
		}
		const backward = /^(?:ArrowLeft|ArrowUp|Backspace)$/.test(event.key);
		const forward = /^(?:ArrowRight|ArrowDown|Delete)$/.test(event.key);
		if (backward && ta.selectionStart === 0 && win.startChar > 0 ||
				forward && ta.selectionEnd === ta.value.length && win.endChar < source.length) {
			_rapierHeavyWindowMountFromString(source, start, end, {preserveAssets: true,
				...(win.assetFold ? {assetFold: true, assetEnd: win.assetEnd} : {})});
			ta.setSelectionRange(_rapierTaPos(start), _rapierTaPos(end), direction);
		}
	},
});
const _RAPIER_HEAVY_TYPING_LINES = 4000;
function _rapierHeavyBuffer() {
	return (rapier.stats.lines | 0) >= _RAPIER_HEAVY_TYPING_LINES;
}
const _RAPIER_HW_SIDE_CHARS       = 4 * 1024;
const _RAPIER_HW_EDGE_GUARD_CHARS = 1024;
const _RAPIER_HW_SCROLL_GUARD_PX  = 500;
const _RAPIER_HW_EXIT_LINES       = _RAPIER_HEAVY_TYPING_LINES - 100;
const _RAPIER_HW_WHOLE_CHARS      = 262144;
const _RAPIER_HW_MOUNT_CHARS      = _RAPIER_HW_SIDE_CHARS * 8;
function _rapierHeavyWindowed() { return _rapierHeavyRuntime.window != null; }
function _rapierHeavyWindowTotalLines(ta) {
	if (!_rapierHeavyRuntime.window) return _rapierLineCount(ta ? ta.value : '');
	return _rapierHeavyRuntime.window.startLine + _rapierLineCount(ta.value) + _rapierHeavyRuntime.window.suffixLines;
}
function _rapierHeavyWindowChooseBounds(source, limit, selectionStart, selectionEnd = selectionStart, direction = 'forward') {
	const anchor = Math.max(0, Math.min(limit, selectionStart));
	const through = Math.max(anchor, Math.min(limit, Number(selectionEnd) || 0));
	const budget = _RAPIER_HW_MOUNT_CHARS;
	const focus = direction === 'backward' ? anchor : through;
	const coverFrom = through - anchor > budget ? focus : anchor;
	const coverTo = through - anchor > budget ? focus : through;
	let start = Math.max(0, coverFrom - _RAPIER_HW_SIDE_CHARS);
	let end = Math.min(limit, coverTo + _RAPIER_HW_SIDE_CHARS);
	if (end - start > budget) {
		const slack = Math.max(0, budget - (coverTo - coverFrom));
		start = Math.max(0, coverFrom - Math.floor(slack / 2));
		end = Math.min(limit, start + budget);
		if (end < coverTo) {
			end = Math.min(limit, coverTo);
			start = Math.max(0, end - budget);
		}
		if (start > coverFrom) start = coverFrom;
	}
	const followingStart = source.lineStart(source.lineAt(start) + (start ? 1 : 0));
	if (followingStart < coverFrom && end - followingStart <= budget) start = followingStart;
	const lastLine = source.lineAt(end), lastEnd = source.lineEnd(lastLine);
	const precedingEnd = lastEnd <= end ? lastEnd : lastLine ? source.lineEnd(lastLine - 1) : -1;
	const longLine = lastEnd - source.lineStart(lastLine) > _RAPIER_HW_SIDE_CHARS;
	if (!longLine && end < limit && precedingEnd >= coverTo && precedingEnd - start <= budget) end = precedingEnd;
	start = _rapierHeavyRuntime.safeCut(source, start, -1);
	end = Math.min(limit, _rapierHeavyRuntime.safeCut(source, end, 1));
	if (end < start) end = start;
	if (end - start > budget + 2) {
		end = Math.min(limit, start + budget);
		end = _rapierHeavyRuntime.safeCut(source, end, -1);
		if (end < start) end = start;
	}
	return _rapierHeavyRuntime.facts(source, start, end, limit);
}
function _rapierHeavyWindowComputeGuards(winText) {
	const win = _rapierHeavyRuntime.window;
	const limit = win.assetFold ? win.assetEnd ?? win.endChar : rapier.document.source.length;
	const guard = Math.min(_RAPIER_HW_EDGE_GUARD_CHARS, Math.floor(winText.length / 4));
	win.guardLoChars = win.startChar > 0 ? guard : -1;
	win.guardHiFromEnd = win.endChar < limit ? guard : -1;
}
function _rapierHeavyWindowReset() {
	if (_rapierHeavyRuntime.slideTimer) clearTimeout(_rapierHeavyRuntime.slideTimer);
	_rapierHeavyRuntime.slideTimer = 0;
	_rapierHeavyRuntime.slideWhy = '';
	_rapierHeavyRuntime.composing = false;
	_rapierHeavyRuntime.draft = null;
	_rapierHeavyRuntime.window = null;
	_rapierHeavyRuntime.parkedSelection = null;
}
function _rapierHeavyWindowMountFromString(source, selStart, selEnd, opts) {
	const ta = document.getElementById('source-textarea');
	if (!ta) return;
	opts = opts || {};
	const admittedSelStart = selStart;
	const admittedSelEnd = selEnd == null ? admittedSelStart : selEnd;
	if (!opts.assetFold && !opts.preserveAssets && source.contains(']:') && source.contains('data:image/', true) &&
			globalThis.RapierSourceAssets?.mount(source, {...opts, start: admittedSelStart,
			end: admittedSelEnd, windowed: true})) return;
	const limit = opts.assetFold && Number.isSafeInteger(opts.assetEnd) ? Math.min(source.length, opts.assetEnd) : source.length;
	const anchorPos = Math.max(0, Math.min(admittedSelStart | 0, limit));
	const anchorLine = source.lineAt(anchorPos);
	const direction = opts.direction || 'forward';
	const b = _rapierHeavyWindowChooseBounds(source, limit, anchorPos, admittedSelEnd, direction);
	const sourceStart = b.startChar, sourceEnd = b.endChar;
	const winText = _rapierNormalizeSourceNewlines(source.readSlice(sourceStart, sourceEnd));

	_rapierHeavyRuntime.window = {
		...b,
		guardLoChars: -1, guardHiFromEnd: -1,
		assetFold: opts.assetFold === true,
		...(opts.assetFold ? {assetEnd: opts.assetEnd, assetSuffix: source.length - opts.assetEnd,
			assetKey: opts.assetKey || _rapierHeavyRuntime.window?.assetKey || null} : {}),
	};
	rapier.selection.scope = 'window';
	const outside = admittedSelStart < sourceStart || admittedSelEnd > sourceEnd;
	_rapierHeavyRuntime.parkedSelection = outside && admittedSelStart !== admittedSelEnd
		? _rapierHeavyRuntime.ticket({start: Math.max(0, admittedSelStart),
			end: Math.max(admittedSelStart, admittedSelEnd), direction}) : null;
	ta.value = winText;
	const shownStart = Math.max(sourceStart, Math.min(admittedSelStart, sourceEnd));
	const shownEnd = Math.max(shownStart, Math.min(admittedSelEnd, sourceEnd));
	const ls = Math.max(0, Math.min(source.projectionOffsetFromSource(shownStart, sourceStart), winText.length));
	const le = Math.max(ls, Math.min(source.projectionOffsetFromSource(shownEnd, sourceStart), winText.length));
	try { ta.setSelectionRange(ls, le, direction); } catch (_) {}
	const localLine = anchorLine - b.startLine;
	const caret = _rapierSourceLayout(ta, winText, layout => layout.point(ls));
	ta.scrollTop = opts.scrollTop != null
		? opts.scrollTop
		: Math.max(0, (caret?.y ?? localLine * _rapierMetrics().lineH) - ta.clientHeight / 2);
	if (caret) ta.scrollLeft = opts.scrollLeft ?? Math.max(0, caret.x - ta.clientWidth / 2);
	_rapierHeavyRuntime.window.scrollTop = ta.scrollTop;
	_rapierHeavyWindowComputeGuards(winText);
	if (!opts.skipRefresh) _rapierRefreshSourceProjection();
	if (!opts.preserveAssets) globalThis.RapierSourceAssets?.refresh();
}
function _rapierSourceTextThrough(text, at) {
	const end = text.indexOf('\n', Math.max(0, at));
	return end < 0 ? text : text.slice(0, end + 1);
}
function _rapierHeavyWindowRowStart(ta, source, start, previous) {
	const old = previous.startChar, line = source.lineAt(start);
	if (start === source.lineStart(line) || source.lineAt(old) !== line) return start;
	return _rapierSourceLayout(ta, _rapierSourceTextThrough(ta.value, 0), layout => {
		if (!layout.wrapped) return start;
		if (start >= old) return start - old > ta.value.length ? start : old + layout.row(start - old).start;
		const meet = old + layout.row(0).end;
		if (meet >= source.lineEnd(line)) return start;
		for (let at = start, tries = 0; tries < 8; tries++) {
			if (at <= source.lineStart(line)) return source.lineStart(line);
			const text = source.readSlice(at, Math.min(source.lineEnd(line), meet + 256));
			const row = _rapierSourceLayout(ta, text, other => other.row(meet - at));
			if (row.start === meet - at) return at;
			at = _rapierHeavyRuntime.safeCut(source, at - (row.end - (meet - at)), -1);
		}
		return start;
	}) ?? start;
}
function _rapierHeavyWindowSet(startChar2, endChar2, opts) {
	const ta = document.getElementById('source-textarea');
	if (!ta) return;
	opts = opts || {};
	const previous = _rapierHeavyRuntime.window;
	const assetEnd = previous?.assetFold ? previous.assetEnd ?? previous.endChar : null;
	const source = rapier.document.source, limit = assetEnd ?? source.length;
	startChar2 = _rapierHeavyRuntime.safeCut(source, Math.max(0, Math.min(startChar2, limit)), -1);
	endChar2 = Math.min(limit, _rapierHeavyRuntime.safeCut(source, Math.max(startChar2, Math.min(endChar2, limit)), 1));
	if (endChar2 - startChar2 > _RAPIER_HW_MOUNT_CHARS) {
		const focus = Math.max(startChar2, Math.min(endChar2, _rapierAbsPos(ta.selectionEnd || ta.selectionStart || 0)));
		startChar2 = _rapierHeavyRuntime.safeCut(source, Math.max(0, focus - (_RAPIER_HW_MOUNT_CHARS >> 1)), -1);
		endChar2 = Math.min(limit, _rapierHeavyRuntime.safeCut(source, Math.min(limit, startChar2 + _RAPIER_HW_MOUNT_CHARS), 1));
		if (endChar2 - startChar2 > _RAPIER_HW_MOUNT_CHARS + 2) endChar2 = Math.min(limit, startChar2 + _RAPIER_HW_MOUNT_CHARS);
	}
	if (previous) {
		startChar2 = _rapierHeavyWindowRowStart(ta, source, startChar2, previous);
		endChar2 = Math.min(endChar2, _rapierHeavyRuntime.safeCut(source, Math.min(limit, startChar2 + _RAPIER_HW_MOUNT_CHARS), 1));
	}
	const curStartChar = previous?.startChar || 0;

	const held = _rapierHeavyRuntime.ticket(_rapierHeavyRuntime.selection(ta));
	const selS = held.start, selE = held.end;
	const y = ta.scrollTop, x = ta.scrollLeft || 0;
	rapier.selection.start = selS;
	rapier.selection.end = selE;
	rapier.selection.scope = 'window';
	rapier.selection.epoch = Number(rapier.identity.epoch || 0);

	const anchor = Math.max(startChar2, Math.min(endChar2, selE));
	const beforeAt = source.projectionOffsetFromSource(anchor, curStartChar);
	const before = anchor >= curStartChar && anchor <= (previous?.endChar ?? source.length)
		? _rapierSourceLayout(ta, _rapierSourceTextThrough(ta.value, beforeAt), layout => layout.point(beforeAt)) : null;
	const fallback = (source.lineAt(curStartChar) - source.lineAt(startChar2)) * (_rapierMetrics().lineH || 20);
	ta.value = _rapierNormalizeSourceNewlines(source.readSlice(startChar2, endChar2));
	const afterAt = source.projectionOffsetFromSource(anchor, startChar2);
	const after = before == null ? null : _rapierSourceLayout(ta, _rapierSourceTextThrough(ta.value, afterAt),
		layout => layout.point(afterAt));
	const slide = after == null ? fallback : after.y - before.y;
	const sh2 = ta.scrollHeight;
	const yIdeal = y + slide;
	let yNew = Math.max(0, Math.min(yIdeal, Math.max(0, sh2 - ta.clientHeight)));

	const stranded = Math.abs(yIdeal - yNew) > ta.clientHeight / 2;

	if (startChar2 === 0 && endChar2 >= limit && assetEnd == null && !opts.keepWindow) {
		_rapierHeavyRuntime.window = null;
	} else {
		_rapierHeavyRuntime.window = {
			..._rapierHeavyRuntime.facts(source, startChar2, endChar2, limit),
			guardLoChars: -1, guardHiFromEnd: -1,
			assetFold: assetEnd != null, ...(assetEnd != null ? {assetEnd, assetSuffix: source.length - assetEnd,
				assetKey: previous?.assetKey || null} : {}),
		};
		_rapierHeavyWindowComputeGuards(ta.value);
	}
	const lo = startChar2, hi = endChar2;
	_rapierHeavyRuntime.parkedSelection = opts.parkSelection || selS < lo || selE > hi ? held : null;
	try {
		ta.setSelectionRange(
			_rapierTaPos(Math.min(Math.max(selS, lo), hi)),
			_rapierTaPos(Math.min(Math.max(selE, lo), hi)), held.direction
		);
	} catch (_) {}
	if (stranded && ta.value.length > 0) {
		const frac = (ta.selectionStart | 0) / ta.value.length;
		yNew = Math.max(0, Math.min(frac * sh2 - ta.clientHeight / 2,
																Math.max(0, sh2 - ta.clientHeight)));
	}
	ta.scrollTop = yNew;
	if (after) ta.scrollLeft = Math.max(0, x + after.x - before.x);
	if (_rapierHeavyRuntime.window) _rapierHeavyRuntime.window.scrollTop = ta.scrollTop;

	if (!opts.skipRefresh) _rapierRefreshSourceProjection();
}
function _rapierHeavyEnsureState() {
	if (rapier.document.docKind === 'markdown') return;
	const ta = document.getElementById('source-textarea');
	if (!ta) return;
	if (_rapierHeavyRuntime.window) {
		if (rapier.document.source.length < _RAPIER_HW_WHOLE_CHARS && _rapierHeavyWindowTotalLines(ta) < _RAPIER_HW_EXIT_LINES) {
			_rapierHeavyWindowSet(0, Number.MAX_SAFE_INTEGER, { skipRefresh: true });
		}
		return;
	}
	if (ta.value.length >= _RAPIER_HW_WHOLE_CHARS || _rapierLineCount(ta.value) >= _RAPIER_HEAVY_TYPING_LINES) {
		_rapierHeavyWindowMountFromString(rapier.document.source, _rapierAbsPos(ta.selectionStart), _rapierAbsPos(ta.selectionEnd),
			{skipRefresh: true, preserveAssets: true});
	}
}
function _rapierHeavyWindowScheduleSlide(why) {
	if (why === 'caret') _rapierHeavyRuntime.slideWhy = 'caret';
	else if (!_rapierHeavyRuntime.slideWhy) _rapierHeavyRuntime.slideWhy = why;
	if (_rapierHeavyRuntime.slideTimer) return;
	_rapierHeavyRuntime.slideTimer = setTimeout(_rapierHeavyWindowSlideNow, 90);
}
function _rapierHeavyWindowSlideNow() {
	_rapierHeavyRuntime.slideTimer = 0;
	const why = _rapierHeavyRuntime.slideWhy; _rapierHeavyRuntime.slideWhy = '';
	const win = _rapierHeavyRuntime.window;
	if (!win || win.assetFold && !Number.isSafeInteger(win.assetEnd)) return;
	if (_rapierHeavyRuntime.composing) { _rapierHeavyWindowScheduleSlide(why || 'scroll'); return; }
	const ta = document.getElementById('source-textarea');
	if (!ta) return;
	if (_rapierSelectionOwnsDocument(ta)) return;
	const source = rapier.document.source, limit = win.assetFold ? win.assetEnd : source.length;
	let anchor, through;
	if (why === 'caret' && document.activeElement === ta) {
		if (_rapierHeavyRuntime.parkedSelection) return;
		anchor = _rapierAbsPos(ta.selectionStart | 0); through = _rapierAbsPos(ta.selectionEnd | 0);
	} else {
		const local = _rapierSourceLayout(ta, ta.value, layout => {
			let lo = 0, hi = ta.value.length;
			const y = ta.scrollTop + ta.clientHeight / 2;
			while (lo < hi) { const mid = (lo + hi) >>> 1; if (layout.point(mid).y < y) lo = mid + 1; else hi = mid; }
			return lo;
		});
		anchor = source.sourceOffsetFromProjection(local ?? ta.selectionStart, win.startChar, win.endChar);
		through = anchor;
	}
	const b = _rapierHeavyWindowChooseBounds(source, limit, anchor, through);
	if (b.startChar === win.startChar && b.endChar === win.endChar) return;
	_rapierHeavyWindowSet(b.startChar, b.endChar, {parkSelection: why !== 'caret'});
}
function _rapierHeavyWindowMaybeSlideForCaret(ta) {
	if (!_rapierHeavyRuntime.window || _rapierHeavyRuntime.parkedSelection || _rapierSelectionOwnsDocument(ta)) return;
	const s = ta.selectionStart | 0, e = ta.selectionEnd | 0;
	if (ta.value.length - (e - s) > 2 * _RAPIER_HW_SIDE_CHARS + 2 ||
			(_rapierHeavyRuntime.window.guardLoChars >= 0 && s < _rapierHeavyRuntime.window.guardLoChars)
			|| (_rapierHeavyRuntime.window.guardHiFromEnd >= 0 && e > ta.value.length - _rapierHeavyRuntime.window.guardHiFromEnd)) {
		_rapierHeavyWindowScheduleSlide('caret');
	}
}
function _rapierHeavyWindowMaybeSlideForScroll(ta) {
	const win = _rapierHeavyRuntime.window;
	if (!win) return;
	const y = ta.scrollTop, vh = ta.clientHeight;
	if (win.scrollTop === y) return;
	win.scrollTop = y;
	const limit = win.assetFold ? win.assetEnd ?? win.endChar : rapier.document.source.length;
	if ((y < _RAPIER_HW_SCROLL_GUARD_PX && win.startChar > 0)
			|| (y + vh > ta.scrollHeight - _RAPIER_HW_SCROLL_GUARD_PX && win.endChar < limit)) {
		_rapierHeavyWindowScheduleSlide('scroll');
	}
}
function _rapierSourceRangeText(start, end) {
	const store = rapier.document.source;
	const from = Math.max(0, Math.min(store.length, Number(start) || 0));
	const to = Math.max(from, Math.min(store.length, Number(end) || 0));
	if (from === 0 && to === store.length) return store.read();
	if (rapier.document.docKind === 'markdown' && (store.contains('<!--ink') || store.contains('<!--/ink'))) {
		const full = store.read();
		return globalThis.RapierMarkdownSpec.sliceInkArrows(full, from, to, _rapierInkSourceMarkers(full));
	}
	return store.readSlice(from, to);
}
function _rapierSourceSelectionExceedsWindow(textarea) {
	const win = _rapierHeavyRuntime.window;
	if (!win) return false;
	const selected = _rapierHeavyRuntime.selection(textarea);
	return selected.start !== selected.end && (selected.start < win.startChar || selected.end > win.endChar);
}
function _rapierSourceClipboardMarkdown(textarea) {
	if (rapier.document.docKind !== 'markdown') return null;
	const whole = _rapierSelectionOwnsDocument(textarea);
	const selected = _rapierHeavyRuntime.selection(textarea);
	if (!whole && selected.start === selected.end) return null;
	const start = whole ? 0 : selected.start, end = whole ? rapier.document.source.length : selected.end;
	return _rapierSourceRangeText(start, end);
}
function _rapierSourceClipboardWithPictures(markdown, whole) {
	if (whole) return markdown;
	try { return _rapierCompleteImageExcerpt(markdown, _rapierSourceText()); } catch (_) { return markdown; }
}
function _rapierSourceClipboardCopy(e) {
	const ta = e.currentTarget;
	const selected = _rapierHeavyRuntime.selection(ta);
	if (selected.start === 0 && selected.end === rapier.document.source.length && _rapierCopyWholeSource(e)) return;
	const whole = _rapierSelectionOwnsDocument(ta);
	const exceeds = _rapierSourceSelectionExceedsWindow(ta);
	if (rapier.document.docKind !== 'markdown' && !exceeds) _rapierHeavyRuntime.restoreSelection();
	const markdown = _rapierSourceClipboardMarkdown(ta);
	if (markdown == null && !whole && !exceeds) return;
	try {
		e.clipboardData.setData('text/plain', markdown == null
			? (whole ? _rapierSourceText() : _rapierSourceRangeText(selected.start, selected.end)) : markdown);
		if (markdown != null) e.clipboardData.setData('text/markdown', _rapierSourceClipboardWithPictures(markdown, whole));
		e.preventDefault();
	} catch (_) {}
}
function _rapierSourceClipboardCut(e) {
	const ta = e.currentTarget;
	const selected = _rapierHeavyRuntime.selection(ta);
	const whole = _rapierSelectionOwnsDocument(ta);
	const exceeds = _rapierSourceSelectionExceedsWindow(ta);
	if (!exceeds) _rapierHeavyRuntime.restoreSelection();
	const markdown = _rapierSourceClipboardMarkdown(ta);
	if (markdown == null && !whole && !exceeds) return;
	try {
		e.clipboardData.setData('text/plain', markdown == null
			? (whole ? _rapierSourceText() : _rapierSourceRangeText(selected.start, selected.end)) : markdown);
		if (markdown != null) e.clipboardData.setData('text/markdown', _rapierSourceClipboardWithPictures(markdown, whole));
	} catch (_) { return; }
	e.preventDefault();
	if (rapier.access.readOnly) return;
	if (whole) { _rapierHeavyWindowReplaceAll(''); return; }
	if (rapier.document.docKind === 'markdown' || exceeds) {
		_rapierReplaceCanonicalSourceRange(selected.start, selected.end, '', selected.direction, {keepPictures: true});
		return;
	}
	const beforeInput = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'deleteByCut'});
	if (!ta.dispatchEvent(beforeInput)) return;
	ta.setRangeText('', ta.selectionStart, ta.selectionEnd, 'start');
	ta.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'deleteByCut'}));
}
(function _rapierBindSourceSelection() {
	const ta = document.getElementById('source-textarea');
	if (!ta) return;
	['select', 'keyup', 'pointerup'].forEach(type => ta.addEventListener(type, refreshFormatToolbar));

	['select', 'keyup', 'pointerup', 'input', 'focus'].forEach(type => {
		ta.addEventListener(type, () => {
			_rapierNoteWindowSelection(ta);
			if (type !== 'input') _rapierHeavyWindowMaybeSlideForCaret(ta);
		});
	});
	ta.addEventListener('pointerdown', event => {if (event.button === 0) _rapierHeavyRuntime.parkedSelection = null;});

	let pressed = false;
	ta.addEventListener('pointerdown', () => { pressed = true; });
	for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => { pressed = false; }, true);
	ta.addEventListener('select', () => {
		const win = _rapierHeavyRuntime.window;
		if (pressed || _rapierSelectionRuntime.minting || _rapierSelectionOwnsDocument(ta) || !ta.value.length ||
				!win || !(win.startChar > 0 || win.endChar < rapier.document.source.length)) return;
		if (ta.selectionStart === 0 && ta.selectionEnd === ta.value.length)
			_rapierSelectAllSource(ta, ta.selectionDirection === 'backward' ? 'backward' : 'forward');
	});
	ta.addEventListener('keydown', _rapierHeavyRuntime.key, {capture: true});

	ta.addEventListener('keydown', (e) => {
		if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
		if (String(e.key || '').toLowerCase() !== 'a') return;
		e.preventDefault();
		_rapierSelectAllSource(ta);
	});

	ta.addEventListener('copy', _rapierSourceClipboardCopy);
	ta.addEventListener('cut', _rapierSourceClipboardCut);
})();
function _rapierHeavyWindowReplaceAll(inserted) {
	const ta = document.getElementById('source-textarea');
	if (!ta) return;
	inserted = String(inserted == null ? '' : inserted)
		.replace(/\r\n?|\n/g, rapier.document.sourceNewline || '\n');
	const fullBefore = _rapierSourceText();
	const d = _rapierPrefixSuffixDiff(fullBefore, inserted);
	if (d.removed.length || d.inserted.length) {
		const committed = _rapierCommitSplices([d], {
			operation: rapier.document.docKind === 'markdown'
				? 'document.replace-source-range' : 'document.replace-range',
			selectionBefore: { start: 0, end: fullBefore.length },
			selectionAfter: { start: inserted.length, end: inserted.length },
		});
		if (!committed) return;
		inserted = _rapierSourceText();
		_notifyHistoryState();
	}
	if (_rapierSourceNeedsWindow()) {
		_rapierHeavyWindowMountFromString(rapier.document.source, inserted.length, inserted.length, { skipRefresh: true, preserveAssets: true });
	} else {
		_rapierHeavyWindowReset();
		ta.value = inserted;
		try { ta.setSelectionRange(inserted.length, inserted.length); } catch (_) {}
	}
	_bumpDocGeneration();
	_rapierSourceRuntime.flatDirty = true;
	_rapierRefreshSourceProjection();
	updateStats();
	_rapierFlushFlatIfDirty();
}
