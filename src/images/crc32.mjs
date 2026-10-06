// SPDX-License-Identifier: AGPL-3.0-only
// IEEE CRC-32; pass the previous result to continue across chunks.
const table = new Uint32Array(256).map((_, value) => {
	for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});
export function crc32(bytes, previous = 0) {
	let crc = (previous ^ 0xffffffff) >>> 0;
	for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}
