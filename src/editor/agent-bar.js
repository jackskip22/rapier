function _rapierTravelDestinationForResolved(resolved) {
	if (!resolved) return null;
	if (resolved.kind === 'travel-block') {
		const index = rapier.document.blocks.findIndex(block => block.id === resolved.block?.id);
		return index < 0 ? null : _rapierTravelDestination(
			'markdown', _rapierBlockSourceStart(index) + resolved.start);
	}
	if (resolved.kind === 'document-range') {
		return _rapierTravelDestination('source', resolved.start);
	}
	if (resolved.kind === 'markdown-range') {
		return _rapierTravelDestination('markdown', resolved.start);
	}
	const index = rapier.document.blocks.findIndex(block => block.id === resolved.startBlock?.id);
	if (index < 0) return null;
	const text = String(resolved.startText || '');
	const ratio = text.length ? _rapierClamp(Number(resolved.start) / text.length, 0, 1) : 0;
	return _rapierTravelDestination('markdown',
		_rapierBlockSourceStart(index) + Math.round(rapier.document.blocks[index].raw.length * ratio));
}
const _RAPIER_OUTLINE_LABEL_LIMIT = 64;
function _rapierOutlineDisplayLabel(label) {
	const text = String(label || '');
	return text.length > _RAPIER_OUTLINE_LABEL_LIMIT
		? text.slice(0, _RAPIER_OUTLINE_LABEL_LIMIT - 1) + '…'
		: text;
}
const _RAPIER_REVEAL_SCROLL_MS = 700;
const _RAPIER_REVEAL_ALIGN_FRAMES = 6;
function _rapierScrollResolvedIntoView(resolved) {
	const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
	if (resolved.kind === 'document-range') {
		const textarea = document.getElementById('source-textarea');
		if (!textarea) return { reason: 'surface_missing' };

		const local = _rapierTaPos(resolved.start);
		if (local < 0 || local > textarea.value.length) return { reason: 'target_outside_source_window' };
		const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
		const top = Math.max(0, _rapierLineFromPos(textarea.value, local) * lineHeight - textarea.clientHeight / 2);
		const scrolled = Math.abs(textarea.scrollTop - top) > 1;
		if (scrolled) textarea.scrollTo({ top, behavior });
		return { reason: '', element: textarea, scroller: textarea, scrolled };
	}

	const region = resolved.kind === 'markdown-range'
		? _rapierMarkdownRangeBlockIndices(resolved.start, resolved.end)
		: null;
	if (resolved.kind === 'markdown-range' && !region) return { reason: 'surface_missing' };
	const blockId = region ? rapier.document.blocks[region.first].id : resolved.startBlock.id;
	const wrapper = document.querySelector('[data-block-id="' + blockId + '"]');
	const host = document.getElementById('editor-blocks');
	if (!wrapper || !host) return { reason: 'surface_missing' };

	_rapierRevealSectionForWrapper(wrapper);
	const rect = wrapper.getBoundingClientRect();
	const view = host.getBoundingClientRect();
	const scrolled = rect.top < view.top || rect.bottom > view.bottom;
	if (scrolled) wrapper.scrollIntoView({ block: 'center', behavior });
	return { reason: '', element: wrapper, scroller: host, scrolled };
}
function _rapierAwaitScrollRest(scroller, signal) {
	return new Promise(resolve => {
		let done = false;
		const settle = value => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			scroller.removeEventListener('scrollend', settle);
			if (signal && abort) {
				try { signal.removeEventListener('abort', abort); } catch (_) {}
			}
			requestAnimationFrame(() => resolve(value !== false));
		};
		const abort = () => settle(false);
		const timer = setTimeout(() => settle(true), _RAPIER_REVEAL_SCROLL_MS);
		scroller.addEventListener('scrollend', settle, { once: true });
		if (signal && typeof signal.addEventListener === 'function') {
			signal.addEventListener('abort', abort, { once: true });
			if (signal.aborted === true) abort();
		}
	});
}
async function _rapierSettleRevealScroll(scroll, signal, restoreToken) {
	const owns = () => (!signal || signal.aborted !== true) &&
		(restoreToken === null || restoreToken === rapier.view.restoreToken);
	if (!scroll.scrolled) return owns();
	if (!await _rapierAwaitScrollRest(scroll.scroller, signal) || !owns()) return false;

	if (scroll.element === scroll.scroller) return true;
	for (let attempt = 0; attempt < _RAPIER_REVEAL_ALIGN_FRAMES; attempt++) {
		if (!owns() || !scroll.element.isConnected) return false;
		const view = scroll.scroller.getBoundingClientRect();
		const rect = scroll.element.getBoundingClientRect();
		const delta = rect.top - (view.top + Math.max(0, (view.height - rect.height) / 2));
		if (Math.abs(delta) <= 1) return true;
		const previous = scroll.scroller.scrollTop;
		scroll.scroller.scrollTop = Math.max(0, previous + delta);
		if (scroll.scroller.scrollTop === previous) return true;
		await new Promise(resolve => requestAnimationFrame(resolve));
	}
	return owns();
}
const _rapierAgentBar = Object.seal({
	running: 0, invocations: new Set(), symbol: null, renderFrame: 0,
	work: null, workAuthority: '', workEpoch: 0, workTimer: 0,
	connectedUntil: 0, connectedAuthority: '', connectedEpoch: 0, connectedTimer: 0,
	acornUntil: 0, acornLast: '', acornTimer: 0, acornAuthority: '', acornEpoch: 0,
});
const _RAPIER_ACORN_LINGER_MS = 4000;
const _RAPIER_AGENT_CONNECTED_MS = 1800000;
function _rapierAgentBarMarkAcorn(invocation) {
	if (!invocation || !invocation.structural) return;
	const bar = _rapierAgentBar;
	bar.acornUntil = _rapierNow() + _RAPIER_ACORN_LINGER_MS;
	bar.acornAuthority = String(invocation.documentAuthority || '');
	bar.acornEpoch = Number(invocation.documentEpoch || 0);
	bar.acornLast = String(invocation.operation || '');
	clearTimeout(bar.acornTimer);
	bar.acornTimer = setTimeout(() => { bar.acornTimer = 0; _rapierAgentBarRender(); }, _RAPIER_ACORN_LINGER_MS + 60);
}
function _rapierAgentBarDisconnected() {
	const bar = _rapierAgentBar;
	bar.invocations.clear();
	bar.connectedUntil = 0; bar.connectedAuthority = ''; bar.connectedEpoch = 0;
	clearTimeout(bar.connectedTimer); bar.connectedTimer = 0;
	bar.acornUntil = 0; bar.acornAuthority = ''; bar.acornEpoch = 0; bar.acornLast = '';
	clearTimeout(bar.acornTimer); bar.acornTimer = 0;
	_rapierAgentBarRender();
}
function _rapierAgentBarMarkConnected(invocation) {
	const bar = _rapierAgentBar;
	bar.connectedAuthority = String(invocation.documentAuthority || '');
	bar.connectedEpoch = Number(invocation.documentEpoch || 0);
	bar.connectedUntil = _rapierNow() + _RAPIER_AGENT_CONNECTED_MS;
	clearTimeout(bar.connectedTimer);

	bar.connectedTimer = setTimeout(() => {
		bar.connectedTimer = 0;
		_rapierAgentBarRender();
	}, _RAPIER_AGENT_CONNECTED_MS + 60);
}
function _rapierAgentConnected() {
	const bar = _rapierAgentBar;
	if (!bar.connectedUntil) return false;
	return bar.connectedAuthority === String(rapier.identity.authority || '') &&
		bar.connectedEpoch === Number(rapier.identity.epoch || 0) &&
		_rapierNow() < bar.connectedUntil;
}
const _rapierAgentNote = Object.seal({ text: '', identity: null });
function _rapierAgentNoteText() {
	const parked = _rapierWaitPendingHere() || _rapierHostedAskHere();
	if (parked && parked.event === 'message' && parked.prompt) return String(parked.prompt);
	return _rapierAgentNote.identity && _rapierIdentityIsCurrent(_rapierAgentNote.identity)
		? _rapierAgentNote.text : '';
}
function _rapierAgentNoteRetire() {
	if (_rapierAgentSpell.kind === 'invite' && _rapierAgentInviteEnd('declined')) return;
	_rapierAgentNote.text = '';
	_rapierAgentNote.identity = null;
	_rapierAgentSpell.kind = '';
	_rapierAgentSpell.pending = false;
}
function _rapierAgentNoteSet(text, kind = 'said') {
	if (kind !== 'invite' && _rapierAgentInvitation.current) {
		if (kind === 'arrived' || kind === 'finished') return;
		_rapierAgentInviteEnd('declined');
	}
	_rapierAgentNote.text = String(text || '');
	_rapierAgentNote.identity = _rapierAgentNote.text ? _rapierDocumentIdentity() : null;
	_rapierAgentSpell.kind = _rapierAgentNote.text ? kind : '';
}
function _rapierAgentNoteShow(lifetime = 0) {
	_rapierAgentSpell.pending = true;
	clearTimeout(_rapierAgentSpell.noteTimer);
	if (lifetime) _rapierAgentSpell.noteTimer = setTimeout(_rapierAgentNoteQuiet, lifetime);
	_rapierAgentBarRender();
}
function _rapierStructuralIdentityMoving() {
	return !!(_rapierMutationBarrierActive() || _rapierEditingRuntime.pasteJob ||
		rapier.composition.block || rapier.composition.source || rapier.sourceTransition.busy ||
		rapier.undo.flatBurstOpen || !_rapierHistoryIsComplete());
}
function _rapierStructuralIdentityCurrent(identity) {
	if (!identity || typeof identity !== 'object') return false;
	if (_rapierStructuralIdentityMoving()) return false;
	if (String(identity.authority || '') !== String(rapier.identity.authority || '') ||
			Number(identity.epoch || 0) !== Number(rapier.identity.epoch || 0) ||
			String(identity.filename || '') !== String(rapier.document.filename || '') ||
			Number(identity.revision || 0) !== Number(rapier.revision.settled || 0) ||
			Number(identity.generation || 0) !== Number(rapier.revision.generation || 0)) return false;

	const actual = rapier.document.source.integrity();
	return Number(identity.chars || 0) === actual.chars &&
		String(identity.fnv || '') === actual.fnv && String(identity.adler || '') === actual.adler;
}
function _rapierAgentBarSymbol() {
	const held = _rapierAgentBar.symbol;
	if (!held || !_rapierStructureDocKind()) return '';

	const identity = held.identity || {};
	const metadataCurrent = String(identity.authority || '') === String(rapier.identity.authority || '') &&
		Number(identity.epoch || 0) === Number(rapier.identity.epoch || 0) &&
		String(identity.filename || '') === String(rapier.document.filename || '') &&
		Number(identity.revision || 0) === Number(rapier.revision.settled || 0) &&
		Number(identity.generation || 0) === Number(rapier.revision.generation || 0);
	const moving = _rapierStructuralIdentityMoving();
	return metadataCurrent && !moving ? held.label : '';
}
function _rapierAgentBarTarget() {
	let at = 0;
	let target = null;
	const authority = String(rapier.identity.authority || '');
	const epoch = Number(rapier.identity.epoch || 0);
	for (const record of _rapierLiveContexts.values()) {

		if (record.delivered !== true || record.observedBy?.kind !== 'agent' ||
				record.createdAt <= at ||
				record.documentAuthority !== authority || record.documentEpoch !== epoch) continue;
		at = record.createdAt;
		target = record.target;
	}
	let blockId = null;
	if (target && target.kind === 'block-range') blockId = target.startBlockId;
	else if (target && target.kind === 'markdown-range') {
		const region = _rapierMarkdownRangeBlockIndices(target.start, target.end);
		blockId = region ? rapier.document.blocks[region.first].id : null;
	}
	for (const transaction of _rapierRecentTransactions()) {

		if (transaction.actor?.kind !== 'agent' || transaction.documentAuthority !== authority ||
				Number(transaction.createdAt) < at) continue;
		const affected = transaction.affectedBlockIds;
		if (!affected || !affected.length) continue;
		at = Number(transaction.createdAt);
		blockId = affected[0];
	}
	const block = blockId == null
		? null : (rapier.document.blocks || []).find(item => item.id === blockId);

	return block && document.querySelector('[data-block-id="' + block.id + '"]')
		? { kind: 'block-range', startBlock: block, endBlock: block, startText: '', start: 0, end: 0 }
		: null;
}
function _rapierAgentBarHeadingOfBlock(blockId) {
	const index = (rapier.document.blocks || []).findIndex(block => block.id === blockId);
	if (index < 0) return '';
	let label = '';
	for (const entry of _rapierOutlineFromBlocks()) {
		if (entry.blockIndex > index) break;
		label = entry.label;
	}
	return _rapierOutlineDisplayLabel(label);
}
function _rapierAgentBarHeading(target) {
	return _rapierAgentBarHeadingOfBlock(target.startBlock.id);
}
function _rapierAgentBarHandleBlock(handleId) {
	const record = _rapierLiveContexts.get(String(handleId || ''));
	const target = record && record.target;
	if (!target) return null;
	if (target.kind === 'block-range') return target.startBlockId;
	if (target.kind === 'markdown-range') {
		const region = _rapierMarkdownRangeBlockIndices(target.start, target.end);
		return region ? rapier.document.blocks[region.first].id : null;
	}
	return null;
}
function _rapierAgentBarInvocationStructural(operation, input) {
	if (rapier.document.docKind === 'markdown') return operation === 'document.outline' ||
		(operation === 'document.find' && !!(input && typeof input.kind === 'string'));
	if (!_rapierStructureDocKind()) return false;
	if (operation === 'document.find') return !!(input && typeof input.kind === 'string');
	return operation === 'document.outline' || operation === 'document.read' ||
		operation === 'document.edit';
}
function _rapierAgentBarInvocationBlocks(operation, input) {
	const request = input && typeof input === 'object' ? input : {};
	const words = [request.text, ...(Array.isArray(request.changes) ? request.changes.flatMap(change => [change?.old, change?.after, change?.before]) : [])]
		.filter(text => typeof text === 'string' && text);
	if (['edit', 'show'].includes(operation) && rapier.document.docKind === 'markdown') {
		const source = _rapierSourceText();
		return words.map(text => {
			const at = source.indexOf(text), offset = at < 0 ? null : _rapierBodyOffsetOfCanonical(at);
			const region = Number.isSafeInteger(offset) && _rapierMarkdownRangeBlockIndices(offset, offset + text.length);
			return region ? rapier.document.blocks[region.first].id : null;
		});
	}
	if (operation === 'editor.reveal' ||
			(operation === 'document.wait_for_user' && request.context_handle)) {
		return [_rapierAgentBarHandleBlock(request.context_handle)];
	}
	if (operation === 'document.edit') {
		return (Array.isArray(request.edits) ? request.edits : [])
			.map(edit => _rapierAgentBarHandleBlock(edit && edit.context_handle));
	}
	if (operation === 'document.read') {
		const ref = String(request.target?.ref || '');
		const outline = _rapierParseOutlineRef(ref);
		if (outline) {
			const ticket = _rapierOutlineTickets.get(outline.ticketId);
			const index = ticket && ticket.byToken.get(outline.token);
			const witness = index == null ? null : ticket.witnesses[index];
			return [witness && witness.blockId != null ? witness.blockId : null];
		}
		const focus = /^rfoc_([0-9a-f]{16})$/.exec(ref);
		if (focus) {
			const ticket = _rapierFocusTickets.get(focus[1]);
			const blockId = ticket && ticket.witness ? ticket.witness.blockId : null;
			return [blockId != null ? blockId : null];
		}
		return [null];
	}
	return null;
}
const _RAPIER_AGENT_DOING = Object.freeze({
	'document.observe': 'Looking', 'document.outline': 'Mapping', 'document.find': 'Searching',
	'document.read': 'Reading', 'document.edit': 'Editing',
	'document.undo': 'Undoing a change', 'comparison.present': 'Comparing', 'editor.reveal': 'Pointing',
	'document.save': 'Saving', 'document.replace': 'Opening a file', 'document.wait_for_user': 'Waiting',
});
function _rapierAgentBarActiveHeading(invocations) {
	let heading = '';
	for (const invocation of invocations) {
		if (!invocation.blocks || !invocation.blocks.length) return '';
		for (const blockId of invocation.blocks) {
			const label = blockId == null ? '' : _rapierAgentBarHeadingOfBlock(blockId);
			if (!label) return '';
			if (!heading) heading = label;
			else if (heading !== label) return '';
		}
	}
	return heading;
}
function _rapierStructureActiveHere(invocations) {
	const active = _rapierStructureRuntime.active;
	if (!active || !active.request || !(active.invocationIds instanceof Set)) return false;
	const identity = active.request.identity || active.request.after?.identity || active.request.before?.identity;
	if (!_rapierStructuralIdentityCurrent(identity)) return false;
	for (const invocation of invocations || []) {
		if (invocation && invocation.id && active.invocationIds.has(String(invocation.id))) return true;
	}
	return false;
}
async function _rapierAgentBarJump() {
	const target = _rapierAgentBarTarget();
	if (!target) return false;
	const travel = _rapierTravelBegin('jump to agent');
	const restoreToken = rapier.view.restoreToken;
	const scroll = _rapierScrollResolvedIntoView(target);
	if (scroll.reason) return false;
	const settled = await _rapierSettleRevealScroll(scroll, null, restoreToken);
	if (scroll.scrolled) _rapierTravelCommit(travel, _rapierTravelDestinationForResolved(target));
	return settled;
}
function _rapierAgentPresence(word, acorn, location, active, reading = false) {
	globalThis.RapierChanges?.presence({active, target: _rapierAgentBarTarget()});
	const state = word === 'WORKING' ? 'working' : (word ? 'settled' : '');
	const witnessed = word ? String(word) + (location ? ' ' + location : '') : '';

	if (renderScrollFabPresence(state, witnessed, acorn, reading)) _rapierRefreshScrollFabs();
	_rapierAgentPresenceLine(word);
}
function _rapierAgentPresenceLine(word) {
	const line = document.getElementById('agent-note');
	if (!line) return;
	const said = word || _rapierAgentSpell.kind === 'invite' ? _rapierAgentNoteText() : '';
	if (!said) _rapierAgentNoteRetire();
	const saidNode = line.querySelector('.agent-note__said');
	if (saidNode.textContent !== said) saidNode.textContent = said;
	_rapierAgentWho(line.querySelector('.agent-note__who'));
	document.getElementById('agent-note-undo').hidden = !(_rapierAgentSpell.kind === 'finished' && _rapierAgentSpell.undo.length);
	document.getElementById('agent-note-go').hidden = _rapierAgentSpell.kind !== 'invite';
	line.hidden = !said;
	_rapierAgentNotePlace(line);
}
function _rapierAgentBarRenderSoon() {
	if (_rapierAgentBar.renderFrame) return;
	const later = typeof requestAnimationFrame === 'function' && !document.hidden
		? requestAnimationFrame : (fn => setTimeout(fn, 16));
	_rapierAgentBar.renderFrame = later(() => {
		_rapierAgentBar.renderFrame = 0;
		_rapierAgentBarRender();
	});
}
function _rapierAgentBarRender(presence = null) {
	const bar = _rapierAgentBar;
	if (presence && typeof presence === 'object') {
		bar.work = presence;
		bar.workAuthority = String(rapier.identity.authority || '');
		bar.workEpoch = Number(rapier.identity.epoch || 0);
		clearTimeout(bar.workTimer);
		bar.workTimer = 0;
		const ends = (presence.pointers || []).filter(pointer => pointer.status === 'shown' && pointer.expiresAt > Date.now())
			.map(pointer => pointer.expiresAt);
		if (ends.length) bar.workTimer = setTimeout(() => { bar.workTimer = 0; _rapierAgentBarRender(); }, Math.max(0, Math.min(...ends) - Date.now()));
	}
	const row = document.getElementById('agent-row');
	if (!row) return;
	_rapierAgentFollowRender();
	const note = document.getElementById('agent-row-note-input');
	const send = document.getElementById('agent-row-send');

	const target = _rapierAgentBarTarget();
	const symbol = _rapierAgentBarSymbol();
	const authority = String(rapier.identity.authority || '');
	const epoch = Number(rapier.identity.epoch || 0);
	const parked = _rapierWaitPendingHere() || _rapierHostedAskHere() || ([..._rapierAgentBar.invocations].some(invocation =>
		invocation.ask && invocation.documentAuthority === authority) ? { event: 'message', prompt: '', watch: null } : null);

	const executing = [..._rapierAgentBar.invocations].filter(invocation =>
		!invocation.ask && !(parked && invocation.operation === 'document.wait_for_user') &&
		invocation.documentAuthority === authority && invocation.documentEpoch === epoch);
	const connected = _rapierAgentConnected();
	const work = bar.workAuthority === authority && bar.workEpoch === epoch ? bar.work : null;
	const pointing = !!work?.pointers?.some(pointer => pointer.status === 'shown' && pointer.expiresAt > Date.now());
	const asking = parked ? 1 : 0;
	const working = executing.length > 0 || Number(work?.inFlight || 0) - asking > 0;
	const active = working || pointing;

	const holding = !!note && !note.disabled && (note.value !== '' || document.activeElement === note);
	row.hidden = !(active || parked !== null || target !== null || symbol !== '' || connected || holding);

	const parkedNow = !!(parked && parked.event === 'message' && parked.reply);
	const app = _rapierHostedTalk();
	const spoken = row.hidden ? [] : app ? Array.from({ length: app.status.messagesQueued || 0 }) : _rapierMessageQueueHere();
	const hosted = globalThis.RAPIER_APPS_HOST === true && !app;
	const box = document.getElementById('agent-row-note');
	if (box) box.hidden = hosted;
	if (note) {
		note.disabled = row.hidden || hosted;
		note.placeholder = parkedNow ? 'reply to ' + _rapierAgentName()
			: spoken.length ? 'message queued' : 'message ' + _rapierAgentName();
	}
	if (send) send.disabled = row.hidden || hosted;

	const queuedLine = document.getElementById('agent-row-queued');
	if (queuedLine) {
		queuedLine.hidden = spoken.length === 0;
		const queuedText = spoken.length === 1 ? '1 MESSAGE QUEUED' : spoken.length + ' MESSAGES QUEUED';
		if (queuedLine.textContent !== queuedText) queuedLine.textContent = queuedText;
	}
	if (row.hidden) {

		const state = document.getElementById('agent-row-state');
		if (state) state.textContent = '';
		const under = document.getElementById('agent-row-under');
		if (under) under.textContent = '';
		const gone = document.getElementById('agent-row-said');
		if (gone) { gone.textContent = ''; gone.hidden = true; }
		document.getElementById('agent-row-jump').hidden = true;
		_rapierAgentHereRender([]);
		_rapierAgentPresence('', false);
		return;
	}
	_rapierAgentWho(document.getElementById('agent-row-who'));
	_rapierAgentHereRender([_rapierAgentWroteBlock(), ...(working ? executing.flatMap(invocation => invocation.blocks || []) : [])]);
	const parkedMessage = parkedNow;
	const settledHeading = target ? _rapierAgentBarHeading(target) : '';
	let word;
	let heading;
	if (working) {
		word = 'WORKING';
		heading = _rapierAgentBarActiveHeading(executing);
	} else if (parked) {
		word = 'WAITING';
		const anchor = parked.watch && parked.watch.markerAnchor;
		heading = anchor && anchor.kind === 'block-range'
			? _rapierAgentBarHeadingOfBlock(anchor.startBlock.id) : '';
	} else if (pointing || target !== null || symbol !== '') {

		word = 'AGENT';
		heading = settledHeading;
	} else {

		word = 'CONNECTED';
		heading = '';
	}
	row.dataset.presence = word.toLowerCase();

	const state = document.getElementById('agent-row-state');
	const stateText = word === 'WAITING' ? 'WAITING FOR YOU' : word;
	if (state.textContent !== stateText) state.textContent = stateText;

	const usingAcorn = executing.some(invocation => invocation.structural) || _rapierStructureActiveHere(executing);
	if (usingAcorn) {
		bar.acornUntil = _rapierNow() + _RAPIER_ACORN_LINGER_MS;
		bar.acornAuthority = authority;
		bar.acornEpoch = epoch;
		bar.acornLast = (executing.find(invocation => invocation.structural) || {}).operation || bar.acornLast;
		clearTimeout(bar.acornTimer);

		bar.acornTimer = setTimeout(() => { bar.acornTimer = 0; _rapierAgentBarRender(); }, _RAPIER_ACORN_LINGER_MS + 60);
	}

	const lingering = !usingAcorn && _rapierNow() < bar.acornUntil &&
		bar.acornAuthority === authority && bar.acornEpoch === epoch;
	const acorn = usingAcorn || lingering && (!!_rapierStructureDocKind() || rapier.document.docKind === 'markdown');
	const done = {
		'document.outline': 'mapped the structure', 'document.find': 'searched the syntax',
		'document.read': 'read a declaration', 'document.edit': 'edited and re-parsed',
	};

	const doing = executing.length === 1 ? (_RAPIER_AGENT_DOING[executing[0].operation] || _RAPIER_AGENT_DOING['document.' + executing[0].operation] || 'Working') : (working ? 'Working' : pointing ? 'Pointing' : '');

	const where = parkedMessage ? ''
		: doing ? (usingAcorn ? 'Using Acorn · ' : '') + doing + (heading ? ' under ' + heading : (symbol ? ' in ' + symbol : ''))
		: lingering ? 'Acorn ' + ((_rapierStructureDocKind() && done[bar.acornLast]) || 'read the structure')
		: (heading ? 'Under ' + heading : (symbol ? 'in ' + symbol : ''));
	const underLine = document.getElementById('agent-row-under');
	if (underLine.textContent !== where) underLine.textContent = where;

	const said = document.getElementById('agent-row-said');
	const saidText = _rapierAgentNoteText();
	if (said) {
		if (said.textContent !== saidText) said.textContent = saidText;
		said.hidden = !saidText;
	}
	const jump = document.getElementById('agent-row-jump');
	jump.hidden = !target;

	const toWait = !!(parked && parked.watch && parked.watch.markerAnchor);
	const jumpText = toWait ? 'GO TO AGENT' : 'GO TO CHANGE';
	if (jump.textContent !== jumpText) jump.textContent = jumpText;
	jump.setAttribute('aria-label', toWait ? 'go to where your agent is waiting'
		: (settledHeading ? 'go to the change under ' + settledHeading : 'go to the change'));
	_rapierAgentPresence(word, acorn, where, active, usingAcorn);
}
function _rapierAgentNoteQuiet() {
	const line = document.getElementById('agent-note');
	if (line) line.classList.remove('visible');
}
function _rapierAgentNoteTouched(event) {
	const target = event.target, type = event.type;
	if (target && typeof target.closest === 'function' && target.closest('#agent-note')) return;
	if (type === 'keydown' && /^(Tab|Shift|Control|Alt|Meta)$/.test(event.key)) return;
	if (type === 'keydown') _rapierAgentInvitation.keyAt = _rapierNow();
	if (_rapierAgentInvitation.current) { if (type === 'keydown') _rapierAgentInviteEnd('declined'); return; }
	_rapierAgentNoteQuiet();
}
let _rapierAgentNoteComposing = false;
function _rapierHostedAskHere() {
	const ask = _rapierHostedTalk()?.status.ask;
	return ask ? { event: 'message', prompt: ask.question || '', watch: null, reply: () => {} } : null;
}
function renderScrollFabPresence(state, witnessed, acorn, active) {
	const fab = document.getElementById('scroll-fab');
	if (!fab) return false;

	const resting = String(fab.getAttribute('aria-label') || '').split(' — ')[0];
	const nextLabel = witnessed ? resting + ' — ' + witnessed : resting;
	const glyph = document.getElementById('scroll-fab-acorn');
	const mark = state && !acorn ? _rapierAgentSelf().mark : '';
	const worn = document.getElementById('scroll-fab-mark');
	if (worn && (worn.dataset.mark || '') !== mark) {
		worn.dataset.mark = mark;
		worn.replaceChildren(...(mark ? [_rapierAgentMarkNode(mark)] : []));
	}

	if ((fab.dataset.presence || '') === state && fab.getAttribute('aria-label') === nextLabel &&
			(!glyph || (glyph.hidden === !acorn && (glyph.dataset.active === 'true') === !!active))) return false;
	if (state) fab.dataset.presence = state; else delete fab.dataset.presence;
	if (state) fab.dataset.tip = 'Agent connected. Tap for status, messages and changes.';
	else delete fab.dataset.tip;
	fab.setAttribute('aria-label', nextLabel);
	if (glyph) {
		glyph.hidden = !acorn;
		if (active) glyph.dataset.active = 'true'; else delete glyph.dataset.active;
	}
	return true;
}
