// Pure confirmation copy. It projects the plan; it neither reads the folder nor grants deletion.
import {importUndoRows} from './import-receipt.mjs';
const count = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
export function describeImportUndo(receipt, plan) {
	const rows = importUndoRows(receipt, plan).map(({name, action, why}) => ({name, action, why,
		text: name + (action === 'remove' ? ' — remove: ' : ' — keep: ') + why}));
	return {title: 'undo import', rows, canConfirm: !plan.refuse,
		confirm: plan.remove.length ? 'Undo import' : 'Keep notes and finish undo',
		summary: plan.refuse || count(plan.remove.length, 'note') + ' will be removed; ' + count(plan.kept.length, 'note') + ' will be kept',
		lines: ['only the unchanged notes selected here will be removed',
			'sections, recordings, pictures, thumbnails and history will be kept',
			'notes outside this import will not be changed']};
}
