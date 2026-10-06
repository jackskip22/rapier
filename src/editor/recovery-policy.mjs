// SPDX-License-Identifier: AGPL-3.0-only

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

export { _rapierSelectRestoreCandidate };
