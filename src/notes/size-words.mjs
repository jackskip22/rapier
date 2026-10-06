// SPDX-License-Identifier: AGPL-3.0-only
// Bytes, then kB, MB, GB, decimal, one place. No imports: the backup worker carries it.
export function attachmentSizeWords(bytes) {
	if (!Number.isSafeInteger(bytes) || bytes < 0) return 'Size unavailable';
	if (bytes < 1000) return bytes + (bytes === 1 ? ' byte' : ' bytes');
	const unit = bytes < 1000000 ? 'kB' : bytes < 1000000000 ? 'MB' : 'GB';
	return (bytes / (unit === 'kB' ? 1000 : unit === 'MB' ? 1000000 : 1000000000)).toLocaleString('en', {maximumFractionDigits: 1}) + ' ' + unit;
}
