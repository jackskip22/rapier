// SPDX-License-Identifier: AGPL-3.0-only
export const CONVERTER = 'https://rapier.website/jxl';
const short = name => name.length > 64 ? name.slice(0, 30) + '…' + name.slice(-30) : name;

export function convertOnDoor({files = [], quality, effort} = {}, uncounted = 0) {
	const given = (Array.isArray(files) ? files : [files]).filter(file => file !== undefined && file !== null);
	const usable = given.filter(file => typeof file === 'object' && typeof file.file_id === 'string' && file.file_id);
	const named = usable.map(file => ({name: short(String(file.file_name || 'picture')), file_id: file.file_id,
		...(file.mime_type ? {mime_type: file.mime_type} : {})}));
	const count = named.length, unpassed = given.length - count + uncounted;
	const opened = 'Rapier\'s converter opens in this chat\'s view' + (count ? ' with ' + count + (count === 1 ? ' picture' : ' pictures') : '') +
		'. ' + (count ? 'They convert on the person\'s own device, where the person saves the results; the server converts nothing, so there is no count here.' :
			'No picture reached it, so it is empty: the person chooses pictures there, and they convert on the person\'s own device.') +
		(unpassed ? ' ' + unpassed + (unpassed === 1 ? ' picture was' : ' pictures were') + ' passed without a file_id, so the converter cannot read ' + (unpassed === 1 ? 'it' : 'them') +
			'; tell the person to choose ' + (unpassed === 1 ? 'it' : 'them') + ' in the converter.' : '') +
		' The converter tells you what it got and how the conversion ended.';
	return {reply: {outcome: 'converter', converter: CONVERTER, pictures: count, ...(unpassed ? {unpassed} : {}), message: opened, ...(quality ? {quality} : {}), ...(effort ? {effort} : {}),
		hint: 'Where no view shows, give the person ' + CONVERTER + ' to add the pictures there.',
		files: named}, content: []};
}
