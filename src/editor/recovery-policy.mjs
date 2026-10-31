// SPDX-License-Identifier: AGPL-3.0-only

function _rapierSavedBaselineValid(value) {
	if (value === null) return true;
	if (!value || typeof value !== 'object' || Array.isArray(value) ||
		Object.keys(value).length !== 3 || !['rootId', 'contentId', 'metadata'].every(key => Object.hasOwn(value, key)) ||
		typeof value.rootId !== 'string' || !value.rootId || value.rootId.length > 128 ||
		typeof value.contentId !== 'string' || !value.contentId || value.contentId.length > 128) return false;
	const metadata = value.metadata;
	return !!metadata && typeof metadata === 'object' && !Array.isArray(metadata) && Object.keys(metadata).length === 2 &&
		Object.hasOwn(metadata, 'filename') && Object.hasOwn(metadata, 'docKind') &&
		typeof metadata.filename === 'string' && metadata.filename.length > 0 && metadata.filename.length <= 512 &&
		['markdown', 'text', 'code'].includes(metadata.docKind);
}

function _rapierSavedBaseline(value) {
	if (!_rapierSavedBaselineValid(value)) return undefined;
	return value === null ? null : Object.freeze({rootId: value.rootId, contentId: value.contentId,
		metadata: Object.freeze({filename: value.metadata.filename, docKind: value.metadata.docKind})});
}

function _rapierRecoveryBomManifest(row) {
	const integrity = row.canonicalIntegrity || row.integrity || {};
	return JSON.stringify([String(row.documentAuthority || ''), integrity.chars, integrity.fnv, integrity.adler, row.bom === true]);
}

function _rapierRecoveryEncodingManifest(row) {
	const integrity = row.canonicalIntegrity || row.integrity || {};
	return JSON.stringify([String(row.documentAuthority || ''), integrity.chars, integrity.fnv, integrity.adler,
		row.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8']);
}

function _rapierRecoveryStateFields(row) {
	return JSON.stringify([row.filename, row.documentAuthority, row.virtualDocumentKind, row.saveAsRequired, row.docKind, row.generation,
		row.documentRevision, row.savedGeneration, row.savedBaseline, row.nextBlockId, row.historyComplete, row.segmentIdentity || []]);
}

const _rapierRecoveryLedger = (() => {
	const exports = new WeakMap();
	return function _rapierRecoveryLedger(candidate, undo = candidate?.undo, kit) {
		try {
			if (!candidate) return null;
			const text = candidate.text ?? candidate.canonicalText ?? candidate.markdown;
			const metadata = {filename: candidate.filename, docKind: candidate.docKind};
			let ledger = candidate.carriedLedger || candidate.ledger;
			const carried = !!ledger;
			if (!carried) {
				if (!undo || undo.schemaVersion !== 5 || !undo.integrity) return null;
				const {integrity, docId, ...bound} = undo, json = JSON.stringify(bound);
				if (kit.textRoot(json) !== [integrity.chars, integrity.fnv, integrity.adler].join(':')) return null;
				for (const key of ['filename', 'docKind', 'documentAuthority', 'documentRevision', 'generation',
					'checkpointId', 'sourceRootId', 'historyComplete']) if (undo[key] !== candidate[key]) return null;
				if (JSON.stringify(undo.segmentIdentity || []) !== JSON.stringify(candidate.segmentIdentity || [])) return null;
				const exported = exports.get(undo);
				ledger = exported?.json === json && exported.text === text && exported.filename === metadata.filename &&
					exported.docKind === metadata.docKind ? exported.ledger
					: kit.exportLedger({text, metadata, records: undo.ledger, documentAuthority: undo.documentAuthority,
						revision: undo.documentRevision, root: undo.sourceRootId, complete: undo.historyComplete === true});
				exports.set(undo, {json, text, ...metadata, ledger});
				const envelope = kit.historyEnvelope(ledger, candidate.segmentIdentity || []);
				if (JSON.stringify(envelope.branch) !== JSON.stringify(undo.branch) || envelope.cursor !== undo.cursor ||
					envelope.earliestRevision !== undo.earliestRevision || envelope.earliestHash !== undo.earliestHash ||
					['filename', 'docKind'].some(key => envelope.documentMetadata[key] !== undo.documentMetadata?.[key] ||
						envelope.earliestMetadata[key] !== undo.earliestMetadata?.[key])) return null;
			}
			const proven = kit.readLedger(ledger, text, metadata);
			if (ledger.documentAuthority !== candidate.documentAuthority || proven.revision !== candidate.documentRevision ||
				proven.root !== candidate.sourceRootId || proven.complete !== candidate.historyComplete) return null;
			if (carried) kit.historyEnvelope(ledger, candidate.segmentIdentity || []);
			return proven.ledger;
		} catch (_) { return null; }
	};
})();

function _rapierSelectRestoreCandidate(admission) {
	const { idb, idbEvidence } = admission;
	const candidates = admission.candidates.slice();
	if (!candidates.length) return { candidate: null, integrityIssue: false, idb };

	const priority = { idb: 4, local: 3, checkpoint: 2, 'idb-salvage': 1 };
	candidates.sort((a, b) => b.generation - a.generation
		|| Number(b.verified) - Number(a.verified)
		|| b.ts - a.ts
		|| (priority[b.kind] || 0) - (priority[a.kind] || 0));
	const candidate = candidates[0];
	const peers = candidates.filter(item => item.generation === candidate.generation);
	const textIdentity = item => item.contentIntegrity
		? [item.contentIntegrity.chars, item.contentIntegrity.fnv, item.contentIntegrity.adler].join(':') : item.text;
	const divergentPeers = peers.some(item => textIdentity(item) !== textIdentity(candidate) ||
		item.filename !== candidate.filename ||
		item.documentAuthority !== candidate.documentAuthority ||
		item.documentRevision !== candidate.documentRevision ||
		item.savedGeneration !== candidate.savedGeneration ||
		JSON.stringify(item.savedBaseline) !== JSON.stringify(candidate.savedBaseline) ||
		item.nextBlockId !== candidate.nextBlockId ||
		JSON.stringify(item.segmentIdentity || []) !== JSON.stringify(candidate.segmentIdentity || []) ||
		item.docKind !== candidate.docKind ||
		item.historyComplete !== candidate.historyComplete ||
		(item.bom === true) !== (candidate.bom === true) ||
		(item.encoding === 'windows-1252') !== (candidate.encoding === 'windows-1252') ||
		(item.historyDigest || item.carriedLedger?.sha256 || null) !== (candidate.historyDigest || candidate.carriedLedger?.sha256 || null) ||
		item.virtualDocumentKind !== candidate.virtualDocumentKind ||
		item.saveAsRequired !== candidate.saveAsRequired);
	const metadataUnverified = candidate.metadataVerified !== true || !_rapierSavedBaselineValid(candidate.savedBaseline);
	const integrityIssue = divergentPeers || metadataUnverified
		|| candidate.kind === 'idb-salvage'
		|| (idbEvidence && !idb.valid);
	if (integrityIssue) {

		return {
			candidate: {
				...candidate,
				savedGeneration: null,
				savedBaseline: null,
				saveAsRequired: true,
			},
			integrityIssue,
			idb,
		};
	}
	return { candidate, integrityIssue, idb };
}

function _rapierRecoveryStamp(meta) {
	const integrity = (meta && meta.canonicalIntegrity) || {};
	const base = meta ? [meta.generation, integrity.chars, integrity.fnv, integrity.adler,
		meta.bom === true ? String(meta.bomIntegrity?.fnv || '') : '', meta.historyDigest || ''].join(':') : '';
	return meta && meta.encoding === 'windows-1252' ? base + ':' + String(meta.encodingIntegrity?.fnv || '') : base;
}

export { _rapierSelectRestoreCandidate, _rapierRecoveryLedger, _rapierRecoveryBomManifest, _rapierRecoveryEncodingManifest, _rapierRecoveryStateFields, _rapierRecoveryStamp,
	_rapierSavedBaselineValid, _rapierSavedBaseline };
