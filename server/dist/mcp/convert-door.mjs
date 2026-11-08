// SPDX-License-Identifier: AGPL-3.0-only
export const CONVERTER = 'https://rapier.website/jxl';
const short = name => name.length > 64 ? name.slice(0, 30) + '…' + name.slice(-30) : name;

export function convertOnDoor({files = [], quality = 'high', effort = 7} = {}) {
	return {reply: {outcome: 'converter', converter: CONVERTER, converted: 0, quality, effort,
		hint: 'Open ' + CONVERTER + ' for the person: they add the pictures there, and they convert on their own device; nothing is uploaded.',
		files: files.map(file => ({name: short(String(file.name)), converter: CONVERTER}))}, content: []};
}
