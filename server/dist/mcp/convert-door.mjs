// SPDX-License-Identifier: AGPL-3.0-only
export const CONVERTER = 'https://rapier.website/jxl';
const short = name => name.length > 64 ? name.slice(0, 30) + '…' + name.slice(-30) : name;

export function convertOnDoor({files = [], quality, effort} = {}) {
	if (files.some(file => !file.file_id)) return null;
	const named = files.map(file => ({name: short(String(file.file_name || 'picture')), file_id: file.file_id,
		...(file.mime_type ? {mime_type: file.mime_type} : {})}));
	const count = named.length;
	const opened = 'Rapier\'s converter opens in this chat\'s view' + (count ? ' with ' + count + (count === 1 ? ' picture' : ' pictures') : '') +
		'. ' + (count ? 'They convert' : 'The person chooses pictures there; they convert') + ' on the person\'s own device, where the person saves the results; the server converts nothing, so there is no count here.';
	return {reply: {outcome: 'converter', converter: CONVERTER, pictures: count, message: opened, ...(quality ? {quality} : {}), ...(effort ? {effort} : {}),
		hint: 'Where no view shows, give the person ' + CONVERTER + ' to add the pictures there.',
		files: named}, content: []};
}
