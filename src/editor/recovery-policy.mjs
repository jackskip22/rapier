// SPDX-License-Identifier: AGPL-3.0-only

// Source and history are admitted together. A portable ledger is derived from the
// existing recovery envelope; it does not create a second history owner.
function _rapierRecoveryLedger(candidate, undo = candidate?.undo, kit) {
	try {
		if (!candidate) return null;
		const text = candidate.text ?? candidate.canonicalText ?? candidate.markdown;
		const metadata = {filename: candidate.filename, docKind: candidate.docKind};
		let ledger = candidate.carriedLedger || candidate.ledger;
		if (!ledger) {
			if (!undo || undo.schemaVersion !== 5 || !undo.integrity) return null;
			const {integrity, docId, ...bound} = undo;
			if (kit.textRoot(JSON.stringify(bound)) !== [integrity.chars, integrity.fnv, integrity.adler].join(':')) return null;
			for (const key of ['filename', 'docKind', 'documentAuthority', 'documentRevision', 'generation',
				'checkpointId', 'sourceRootId', 'historyComplete']) if (undo[key] !== candidate[key]) return null;
			if (JSON.stringify(undo.segmentIdentity || []) !== JSON.stringify(candidate.segmentIdentity || [])) return null;
			ledger = kit.exportLedger({text, metadata, records: undo.ledger, documentAuthority: undo.documentAuthority,
				revision: undo.documentRevision, root: undo.sourceRootId, complete: undo.historyComplete === true});
			const envelope = kit.historyEnvelope(ledger, candidate.segmentIdentity || []);
			if (JSON.stringify(envelope.branch) !== JSON.stringify(undo.branch) || envelope.cursor !== undo.cursor ||
				envelope.earliestRevision !== undo.earliestRevision || envelope.earliestHash !== undo.earliestHash ||
				['filename', 'docKind'].some(key => envelope.documentMetadata[key] !== undo.documentMetadata?.[key] ||
					envelope.earliestMetadata[key] !== undo.earliestMetadata?.[key])) return null;
		}
		const proven = kit.readLedger(ledger, text, metadata);
		if (ledger.documentAuthority !== candidate.documentAuthority || proven.revision !== candidate.documentRevision ||
			proven.root !== candidate.sourceRootId || proven.complete !== candidate.historyComplete) return null;
		kit.historyEnvelope(ledger, candidate.segmentIdentity || []);
		return proven.ledger;
	} catch (_) { return null; }
}

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
	const divergentPeers = peers.some(item => item.text !== candidate.text ||
		item.filename !== candidate.filename ||
		item.documentAuthority !== candidate.documentAuthority ||
		item.documentRevision !== candidate.documentRevision ||
		item.savedGeneration !== candidate.savedGeneration ||
		item.nextBlockId !== candidate.nextBlockId ||
		JSON.stringify(item.segmentIdentity || []) !== JSON.stringify(candidate.segmentIdentity || []) ||
		item.docKind !== candidate.docKind ||
		item.historyComplete !== candidate.historyComplete ||
		(item.carriedLedger?.sha256 || null) !== (candidate.carriedLedger?.sha256 || null) ||
		item.virtualDocumentKind !== candidate.virtualDocumentKind ||
		item.saveAsRequired !== candidate.saveAsRequired);
	const metadataUnverified = candidate.metadataVerified !== true;
	const integrityIssue = divergentPeers || metadataUnverified
		|| candidate.kind === 'idb-salvage'
		|| (idbEvidence && !idb.valid);
	if (integrityIssue) {

		return {
			candidate: {
				...candidate,
				savedGeneration: null,
				saveAsRequired: true,
			},
			integrityIssue,
			idb,
		};
	}
	return { candidate, integrityIssue, idb };
}

export { _rapierSelectRestoreCandidate, _rapierRecoveryLedger };
