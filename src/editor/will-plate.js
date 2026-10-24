const _RAPIER_WILL_PLATE_PROVENANCE_LIMIT = 8192;
const _rapierWillPlateProvenance = Object.seal({
	byProof: new Map(),
	bySource: new Map(),
});
function _rapierWillPlateProofReferences(blocks) {
	const proofs = new Set();
	for (const block of blocks || []) {
		const source = String(block?.raw || '');
		const proof = _rapierWillPlateProvenance.bySource.get(source);
		if (proof && _rapierWillPlateProvenance.byProof.get(proof) === source) proofs.add(proof);
	}
	return proofs;
}
function _rapierWillPlateForgetProof(proof) {
	const source = _rapierWillPlateProvenance.byProof.get(proof);
	_rapierWillPlateProvenance.byProof.delete(proof);
	if (_rapierWillPlateProvenance.bySource.get(source) === proof) {
		_rapierWillPlateProvenance.bySource.delete(source);
	}
}
function _rapierWillPlateRetainProvenance(blocks) {
	const keep = _rapierWillPlateProofReferences(blocks);
	for (const proof of _rapierWillPlateProvenance.byProof.keys()) {
		if (!keep.has(proof)) _rapierWillPlateForgetProof(proof);
	}
}
function _rapierWillPlateRandomProof() {
	const words = new Uint32Array(4);
	try { crypto.getRandomValues(words); }
	catch (_) {
		for (let index = 0; index < words.length; index++) {
			words[index] = Math.floor(Math.random() * 0x100000000);
		}
	}
	return 'rwp-' + Array.from(words, word => word.toString(16).padStart(8, '0')).join('');
}
function _rapierWillPlateMintProof(source) {
	const raw = String(source == null ? '' : source);
	const existing = _rapierWillPlateProvenance.bySource.get(raw);
	if (existing && _rapierWillPlateProvenance.byProof.get(existing) === raw) return existing;
	if (_rapierWillPlateProvenance.byProof.size >= _RAPIER_WILL_PLATE_PROVENANCE_LIMIT) {
		const blocks = typeof rapier === 'object' && rapier.document ? rapier.document.blocks : [];
		_rapierWillPlateRetainProvenance(blocks);
	}

	while (_rapierWillPlateProvenance.byProof.size >= _RAPIER_WILL_PLATE_PROVENANCE_LIMIT) {
		_rapierWillPlateForgetProof(_rapierWillPlateProvenance.byProof.keys().next().value);
	}
	let proof;
	do { proof = _rapierWillPlateRandomProof(); }
	while (_rapierWillPlateProvenance.byProof.has(proof));
	_rapierWillPlateProvenance.byProof.set(proof, raw);
	_rapierWillPlateProvenance.bySource.set(raw, proof);
	return proof;
}
function _rapierWillPlateTrustedSource(node) {
	if (!node || node.nodeType !== 1 || !node.classList ||
			!node.classList.contains('will-plate')) return null;
	const proof = String(node.getAttribute('data-will-proof') || '');
	if (!proof || !_rapierWillPlateProvenance.byProof.has(proof)) return null;
	const source = _rapierWillPlateDecode(node.getAttribute('data-will-b64'));
	return _rapierWillPlateProvenance.byProof.get(proof) === source ? source : null;
}
function _rapierProtectionWord(law) {
	const found = _RAPIER_PROTECTION_CHOICES.find(choice => choice.law === law);
	return found ? found.word : '';
}
function _rapierWillPlateText(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _rapierWillPlateEncode(value) {
	try { return btoa(unescape(encodeURIComponent(String(value == null ? '' : value)))); }
	catch (_) { return ''; }
}
function _rapierWillPlateDecode(value) {
	try { return decodeURIComponent(escape(atob(String(value == null ? '' : value)))); }
	catch (_) { return ''; }
}
function _rapierWillPlateContent(law, intent) {
	return '<span class="will-plate__law" aria-hidden="true">' + _RAPIER_WILL_LAW_GLYPH[law] + '</span>' +
		'<span class="will-plate__word will-plate__sr">' + _rapierWillPlateText(_rapierProtectionWord(law)) + '</span>' +
		(intent ? '<span class="will-plate__intent will-plate__sr">' + _rapierWillPlateText(intent) + '</span>' : '') +
		'<span class="will-plate__alarm" hidden></span>';
}
function _rapierWillPlateHeading(plate) {
	const wrapper = plate?.closest?.('.block-wrapper');
	if (!wrapper) return null;
	let next = _rapierAdjacentBlockWrapper(wrapper, 1);
	while (next && !next.classList.contains('block-wrapper')) next = next.nextElementSibling;
	const id = next ? Number(next.dataset.blockId) : NaN;
	if (!Number.isFinite(id)) return null;
	const state = _rapierProtectionState(id);
	return state?.owned && rapier.document.blocks[state.owned.openerIndex]?.id === Number(wrapper.dataset.blockId)
		? id : null;
}
function _rapierWillPlateDecorate(root) {
	if (!root) return;
	let fault = '';
	try {
		if (rapier.document.docKind !== 'markdown') return;
		const plates = root.querySelectorAll('.will-plate');
		if (!plates.length) return;
		const will = _rapierDocumentWill();
		fault = will.present ? String(will.fault || '') : '';
		plates.forEach(plate => _rapierWillPlateState(plate, fault));
	} catch (_) {}
}
function _rapierWillPlateState(plate, fault) {
	if (!plate) return;
	const broken = !!fault || plate.dataset.willPlate === 'fault';
	plate.classList.toggle('will-plate--fault', broken);
	const alarm = plate.querySelector(':scope > .will-plate__alarm');
	if (alarm) {
		alarm.hidden = !broken;
		alarm.textContent = broken ? ' · unreadable — agents are held everywhere' : '';
	}
}
