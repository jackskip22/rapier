// SPDX-License-Identifier: AGPL-3.0-only
const _RAPIER_AGENT_MARKS = Object.freeze(['', 'feather', 'star', 'moon', 'sun', 'zap', 'anchor', 'compass', 'coffee']);
const _rapierAgentSpell = Object.seal({ name: '', greeted: '', acts: [], undo: [], labels: new Map(), timer: 0, noteTimer: 0, wrote: null, near: new Set(), kind: '', pending: false });

function _rapierAgentSelf() {
	try {
		const value = JSON.parse(localStorage.getItem('rapier:agent-self') || '{}');
		return { name: typeof value.name === 'string' ? value.name.trim().slice(0, 16) : '',
			mark: _RAPIER_AGENT_MARKS.includes(value.mark) ? value.mark : '' };
	} catch (_) { return { name: '', mark: '' }; }
}
function _rapierAgentSelfSet(change) {
	try { localStorage.setItem('rapier:agent-self', JSON.stringify({ ..._rapierAgentSelf(), ...change })); } catch (_) {}
	_rapierAgentBarRender();
}
function _rapierAgentName() { return _rapierAgentSelf().name || _rapierAgentSpell.name || 'Agent'; }
function _rapierAgentNamed(name) {
	const given = name ? String(name).trim().slice(0, 24) : '';
	if (!given || given === _rapierAgentSpell.name) return;
	_rapierAgentSpell.name = given;
	_rapierAgentBarRender();
}

function _rapierAgentMarkNode(mark) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('class', 'agent-mark');
	if (mark) {
		const use = document.createElementNS(svg.namespaceURI, 'use');
		use.setAttribute('href', '#i-mark-' + mark);
		svg.append(use);
	}
	return svg;
}
function _rapierAgentWho(node) {
	const mark = _rapierAgentSelf().mark, name = _rapierAgentName();
	if (!node || node.dataset.who === mark + '|' + name) return;
	node.dataset.who = mark + '|' + name;
	const label = document.createElement('span');
	label.textContent = name;
	node.replaceChildren(_rapierAgentMarkNode(mark), label);
}

function _rapierAgentNoteHome(surface) {
	const line = document.getElementById('agent-note');
	if (!line) return;
	const home = surface?.querySelector('.rapier-draw-toolbar') || document.body;
	if (line.parentElement === home) return;
	home.appendChild(line);
	if (surface && line.style.top) line.style.top = '';
	_rapierApplyModalIsolation();
	_rapierAgentBarRenderSoon();
}
function _rapierAgentNotePlace(line) {
	const scrollFab = document.getElementById('scroll-fab');
	const circle = !line.hidden && scrollFab && scrollFab.classList.contains('visible') ? scrollFab : null;
	if (!circle) {
		if (line.classList.contains('visible')) line.classList.remove('visible');
		if (line.style.top) line.style.top = '';
		return;
	}
	if (line.closest('.rapier-draw-toolbar')) {
		if (line.style.top) line.style.top = '';
	} else {
		const box = circle.getBoundingClientRect(), top = (box.top + box.height / 2) + 'px';
		if (line.style.top !== top) line.style.top = top;
	}
	if (_rapierAgentSpell.pending) {
		_rapierAgentSpell.pending = false;
		if (!line.classList.contains('visible')) line.classList.add('visible');
	}
}

function _rapierAgentHereRender(ids) {
	const want = new Set(ids.filter(id => id != null).map(String));
	for (const node of document.querySelectorAll('#editor-blocks > .rapier-agent-here')) {
		if (!want.has(node.dataset.blockId)) node.classList.remove('rapier-agent-here');
	}
	for (const id of want) document.querySelector('#editor-blocks > [data-block-id="' + CSS.escape(id) + '"]')?.classList.add('rapier-agent-here');
}
function _rapierAgentBarWrote(blockId) {
	_rapierAgentSpell.wrote = blockId == null ? null : { blockId, until: _rapierNow() + 3000 };
	if (blockId != null) _rapierAgentSpell.near.add(String(blockId));
	if (blockId != null) setTimeout(_rapierAgentBarRenderSoon, 3060);
	_rapierAgentBarRender();
}
function _rapierAgentWroteBlock() {
	const wrote = _rapierAgentSpell.wrote;
	return wrote && _rapierNow() < wrote.until ? wrote.blockId : null;
}

function _rapierAgentWillKept(region, near = null) {
	const will = _rapierWillParse(_rapierSourceText()), spans = _rapierExcerptCanonicalBlockSpans(), kept = [], blocks = rapier.document.blocks;
	for (const [index, row] of will.regions.entries()) {
		if (!['keep', 'append'].includes(row.law) || region != null && region !== index) continue;
		const passage = [];
		let first = -1, last = -1;
		for (const [at, block] of blocks.entries()) {
			const span = spans.get(block.id);
			if (!span || span.end <= row.openerStart) continue;
			if (span.start >= row.end) break;
			passage.push(block.id);
			if (first < 0) first = at;
			last = at;
		}
		if (near && !blocks.slice(Math.max(0, first - 1), last + 2).some(block => near.has(String(block.id)))) continue;
		kept.push(...passage);
	}
	const nodes = kept.map(id => document.querySelector('#editor-blocks > [data-block-id="' + CSS.escape(id) + '"]')).filter(Boolean);
	for (const node of nodes) {
		clearTimeout(node._rapierWillTimer);
		node.classList.remove('rapier-will-kept');
		void node.offsetWidth;
		node.classList.add('rapier-will-kept');
		node._rapierWillTimer = setTimeout(() => node.classList.remove('rapier-will-kept'), 3400);
	}
}

function _rapierAgentSpellBegin(authority) {
	const spell = _rapierAgentSpell;
	clearTimeout(spell.timer);
	if (_rapierAgentSpell.kind === 'finished') { _rapierAgentNoteRetire(); _rapierAgentNoteQuiet(); }
	if (spell.greeted === authority) return;
	spell.greeted = authority;
	_rapierAgentNoteSet('Joined', 'arrived');
	_rapierAgentNoteShow(4000);
}
function _rapierAgentAsked() {
	if (_rapierAgentSpell.kind === 'ask') { _rapierAgentNoteRetire(); _rapierAgentNoteQuiet(); }
}
function _rapierAgentBarActed(actId, label) {
	if (actId && !_rapierAgentSpell.acts.includes(String(actId))) _rapierAgentSpell.acts.push(String(actId));
	if (actId && typeof label === 'string' && label.trim()) _rapierAgentSpell.labels.set(String(actId), label.trim());
	if (!_rapierAgentBar.running) _rapierAgentSpellQuiet();
}
function _rapierAgentSpellQuiet() {
	const spell = _rapierAgentSpell;
	if (!spell.acts.length) return;
	clearTimeout(spell.timer);
	spell.timer = setTimeout(() => {
		if (_rapierAgentBar.running || !spell.acts.length) return;
		if (_rapierAgentInvitation.current) { _rapierAgentSpellQuiet(); return; }
		spell.undo = spell.acts.splice(0);
		for (const id of spell.labels.keys()) if (!spell.undo.includes(id)) spell.labels.delete(id);
		_rapierAgentSpellFinished();
		const near = new Set(spell.near);
		spell.near.clear();
		if (near.size) _rapierAgentWillKept(null, near);
	}, 2500);
}
function _rapierAgentSpellFinished() {
	const count = _rapierAgentSpell.undo.length;
	const labels = new Set(_rapierAgentSpell.undo.map(id => _rapierAgentSpell.labels.get(id)));
	const [label] = labels, named = labels.size === 1 && label && label !== 'Agent edit' ? (label.length > 60 ? label.slice(0, 59) + '…' : label) : '';
	_rapierAgentNoteSet((named || 'Finished') + ' · ' + count + (count === 1 ? ' change' : ' changes'), 'finished');
	_rapierAgentNoteShow(10000);
}
async function _rapierAgentUndoSpell() {
	const acts = _rapierAgentSpell.undo.splice(0).reverse();
	_rapierAgentNoteRetire();
	_rapierAgentNoteQuiet();
	_rapierAgentBarRender();
	for (const [index, actId] of acts.entries()) {
		const result = await rapier.undo.undoAct({ actId });
		if (['applied', 'unchanged'].includes(result?.outcome)) continue;
		if (['document_not_settled', 'mutation_in_progress', 'human_edit_in_progress'].includes(result?.reason)) {
			_rapierAgentSpell.undo = acts.slice(index).reverse();
			_rapierAgentSpellFinished();
			showToast('Finish typing, then Undo again.', 'info');
		} else showToast('This change could not be undone.', 'info');
		break;
	}
	globalThis.RapierChanges?.schedule();
}

document.getElementById('agent-note-open')?.addEventListener('click', () => {
	if (_rapierAgentInviteEnd('accepted')) return;
	_rapierAgentNoteQuiet();
	_rapierOpenDocumentNavigator(_rapierNavigatorKindForFab());
	const parked = _rapierWaitPendingHere() || _rapierHostedAskHere();
	if (!parked || parked.event !== 'message') return;
	const reply = document.getElementById('agent-row-note-input');
	if (reply && !reply.disabled) reply.focus({ preventScroll: true });
});
document.getElementById('agent-note-undo')?.addEventListener('click', () => { void _rapierAgentUndoSpell(); });
document.getElementById('agent-row-who')?.addEventListener('click', event => {
	const panel = document.getElementById('agent-self');
	panel.hidden = !panel.hidden;
	event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
	if (panel.hidden) return;
	const self = _rapierAgentSelf(), name = document.getElementById('agent-self-name');
	name.value = self.name;
	name.placeholder = _rapierAgentSpell.name || 'Agent';
	for (const choice of panel.querySelectorAll('[data-mark]')) choice.setAttribute('aria-checked', String(choice.dataset.mark === self.mark));
});
new MutationObserver(() => {
	const panel = document.getElementById('agent-self');
	if (panel.hidden || document.getElementById('navigator-overlay').getAttribute('aria-hidden') !== 'true') return;
	panel.hidden = true;
	document.getElementById('agent-row-who').setAttribute('aria-expanded', 'false');
}).observe(document.getElementById('navigator-overlay'), { attributes: true, attributeFilter: ['aria-hidden'] });
document.getElementById('agent-self-name')?.addEventListener('input', event => { _rapierAgentSelfSet({ name: event.target.value }); });
document.getElementById('agent-self')?.addEventListener('click', event => {
	const choice = event.target.closest('[data-mark]');
	if (!choice) return;
	for (const other of event.currentTarget.querySelectorAll('[data-mark]')) other.setAttribute('aria-checked', String(other === choice));
	_rapierAgentSelfSet({ mark: choice.dataset.mark });
});

const _RAPIER_AGENT_INVITE_MS = 8000;
const _RAPIER_AGENT_INVITE_SAID = Object.freeze({ drawing: 'is drawing', painting: 'is painting', comparison: 'has a comparison',
	passage: 'is showing a passage', pointer: 'is pointing at a passage', note: 'opened a note', notes: 'is in Notes',
	source: 'is in the source', formatted: 'is in the formatted view' });
const _rapierAgentInvitation = Object.seal({ current: null, declined: new Set(), keyAt: 0 });

function _rapierAgentFollowing() {
	try { return localStorage.getItem('rapier:agent-follow') === '1'; } catch (_) { return false; }
}
function _rapierAgentFollowSet(on) {
	try { if (on) localStorage.setItem('rapier:agent-follow', '1'); else localStorage.removeItem('rapier:agent-follow'); } catch (_) {}
	if (on) _rapierAgentInviteEnd('accepted');
	_rapierAgentFollowRender();
}
function _rapierAgentFollowRender() {
	const button = document.getElementById('agent-row-follow');
	if (!button) return;
	const on = _rapierAgentFollowing(), label = 'follow ' + _rapierAgentName();
	button.setAttribute('aria-pressed', String(on));
	if (button.textContent !== label) button.textContent = label;
}
function _rapierAgentTyping() {
	return _rapierNow() - _rapierAgentInvitation.keyAt < 2000 || !!(rapier.composition.block || rapier.composition.source);
}
function _rapierAgentInvite(kind, { looking = false, key = '', go = null, signal = null, until = 0 } = {}) {
	const invitation = _rapierAgentInvitation;
	if (_rapierAgentFollowing()) return Promise.resolve('following');
	if (looking) return Promise.resolve('looking');
	if (key && invitation.declined.has(key)) return Promise.resolve('declined');
	if (_rapierAgentTyping()) return Promise.resolve('typing');
	_rapierAgentInviteEnd('declined');
	return new Promise(resolve => {
		const row = { kind, key, go, resolve, timer: 0 };
		invitation.current = row;
		const lifetime = until ? Math.min(_RAPIER_AGENT_INVITE_MS, until - Date.now() - 1000) : _RAPIER_AGENT_INVITE_MS;
		row.timer = setTimeout(() => _rapierAgentInviteEnd('declined', row), Math.max(1500, lifetime));
		signal?.addEventListener?.('abort', () => _rapierAgentInviteEnd('declined', row), { once: true });
		_rapierAgentNoteSet(_RAPIER_AGENT_INVITE_SAID[kind] || 'is elsewhere', 'invite');
		_rapierAgentNoteShow();
	});
}
function _rapierAgentInviteEnd(answer, row = _rapierAgentInvitation.current) {
	const invitation = _rapierAgentInvitation;
	if (!row || invitation.current !== row) return false;
	invitation.current = null;
	clearTimeout(row.timer);
	if (answer === 'declined' && row.key) {
		invitation.declined.add(row.key);
		if (invitation.declined.size > 64) invitation.declined.delete(invitation.declined.values().next().value);
	}
	if (_rapierAgentSpell.kind === 'invite') { _rapierAgentNoteRetire(); _rapierAgentNoteQuiet(); _rapierAgentBarRender(); }
	if (answer === 'accepted' && typeof row.go === 'function') { try { row.go(); } catch (_) {} }
	row.resolve(answer);
	return true;
}
function _rapierAgentInviteToBlock(kind, blockId) {
	const wrapper = blockId == null ? null : document.querySelector('#editor-blocks > [data-block-id="' + CSS.escape(String(blockId)) + '"]');
	const host = document.getElementById('editor-blocks');
	if (!wrapper || !host || document.body.classList.contains('rapier-draw-open')) return;
	const box = wrapper.getBoundingClientRect(), view = host.getBoundingClientRect();
	if (box.bottom > view.top && box.top < view.bottom) return;
	void _rapierAgentInvite(kind, { go: () => _rapierAgentInviteToBlockNow(blockId) })
		.then(answer => { if (answer === 'following') _rapierAgentInviteToBlockNow(blockId); });
}
function _rapierAgentInviteToBlockNow(blockId) {
	const wrapper = document.querySelector('#editor-blocks > [data-block-id="' + CSS.escape(String(blockId)) + '"]');
	if (typeof _rapierNotesClose === 'function' && document.body.classList.contains('rapier-notes-open')) _rapierNotesClose();
	wrapper?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

document.getElementById('agent-note-go')?.addEventListener('click', () => { _rapierAgentInviteEnd('accepted'); });
document.getElementById('agent-note')?.addEventListener('keydown', event => {
	if (event.key === 'Escape' && _rapierAgentInviteEnd('declined')) event.preventDefault();
});
document.getElementById('agent-row-follow')?.addEventListener('click', () => { _rapierAgentFollowSet(!_rapierAgentFollowing()); });
