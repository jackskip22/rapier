// The note owns only ordinary links. These controls decorate them; all bytes go through
// Notes' existing folder owner. Removing a link never removes an object or another note's past.
const _rapierAttachments = {observer: null, frame: 0, rows: new Map(), dialogs: new Set(), intake: Promise.resolve(), bound: false};
function _rapierAttachmentsModel() { return globalThis.RapierNotesAttachments; }
function _rapierAttachmentsOwner() {
	return _rapierNotes.mode && !_rapierNotes.open && _rapierNotes.current ? rapier.identity.authority || '' : '';
}
function _rapierAttachmentsError(error) { showToast(String(error?.message || error), 'error'); }
function _rapierAttachmentsButton(word, action) {
	const b = _rapierNotesEl('button', 'rapier-notes-btn', word); b.type = 'button';
	b.addEventListener('click', event => {
		event.preventDefault(); event.stopPropagation();
		if (b.disabled) return;
		b.disabled = true;
		// Invoke synchronously: Web Share must begin in the button's actual user activation.
		try { Promise.resolve(action()).catch(_rapierAttachmentsError).finally(() => { b.disabled = false; }); }
		catch (error) { b.disabled = false; _rapierAttachmentsError(error); }
	});
	return b;
}
function _rapierAttachmentsDialog(title) {
	const d = _rapierNotesEl('dialog', 'rapier-recording-sheet rapier-attachment-sheet'); d.setAttribute('aria-label', title);
	d.appendChild(_rapierNotesEl('h2', 'rapier-notes-sheet-name', title));
	d.addEventListener('close', () => { _rapierAttachments.dialogs.delete(d); d.remove(); }, {once: true});
	d.addEventListener('click', event => {
		if (event.target !== d) return;
		const box = d.getBoundingClientRect();
		if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) d.close();
	});
	_rapierAttachments.dialogs.add(d); document.body.appendChild(d); d.showModal(); return d;
}
function _rapierAttachmentsDownload(file, name) {
	// Never navigate to an app-origin blob: HTML, SVG and unknown bytes are downloads,
	// not executable content in Rapier. The original remains in the Notes folder.
	const url = URL.createObjectURL(file), a = document.createElement('a');
	a.href = url; a.download = name; a.rel = 'noopener'; a.hidden = true;
	document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
	showToast('Download started. Open the saved file with an app on your device.', 'info');
}
async function _rapierAttachmentsOpen(name) {
	if (!await _rapierNotesUnlock()) return;
	const stat = await _rapierNotesStore.attachmentStat(name);
	if (!stat) throw new Error(name + ' is missing. The link was kept. Restore the file from a backup, or add the original and link it again.');
	const open = globalThis.RapierPlatform?.host?.openAttachment;
	if (typeof open === 'function') {
		const result = await open(name);
		if (!result?.opened) throw new Error('No app opened ' + name + '. Your file is still in Notes. Use Backup to export it, or install an app that can open this kind of file.');
		return;
	}
	const d = _rapierAttachmentsDialog(name), status = _rapierNotesEl('p', '', 'Preparing the file on this device.'); d.appendChild(status);
	try {
		const source = await _rapierNotesStore.readAttachment(name);
		if (!source) throw new Error('This file disappeared. Its link was kept; restore the file from a backup.');
		if (!d.open) return;
		const file = new File([source], name, {type: _rapierAttachmentsModel().attachmentMime(name)});
		let share = false;
		try { share = typeof navigator.share === 'function' && navigator.canShare?.({files: [file]}) === true; } catch (_) {}
		status.textContent = share ? 'Choose an app through your device’s share menu, or save a copy to open from Files. The original stays in Notes.' : 'This browser cannot hand this file directly to an app. Save a copy, then open it from Files. The original stays in Notes.';
		if (share) d.appendChild(_rapierAttachmentsButton('Open or share', async () => {
			try { await navigator.share({files: [file], title: name}); d.close(); }
			catch (error) { if (error?.name !== 'AbortError') throw new Error('The device did not accept the file. Use Save file instead.'); }
		}));
		d.appendChild(_rapierAttachmentsButton('Save file', () => _rapierAttachmentsDownload(file, name)));
	} catch (error) { if (d.open) status.textContent = String(error?.message || error); else throw error; }
}
async function _rapierAttachmentsEdit(owner, transform) {
	await _rapierNotesFlush();
	// Law 57: what happened to the link. Where a copied file waits is said once, by the copy's own caller.
	if (!owner || owner !== _rapierAttachmentsOwner()) throw new Error('The original note is no longer open, so no link was added.');
	const source = _rapierSourceText(), next = transform(source);
	if (next !== source && !await _rapierNotesApplyText(next, 'notes.attachment', 'File link')) throw new Error('The note changed before its file link could be written, so no link was added.');
	await _rapierNotesAutosave(); await _rapierNotesFlush(); _rapierAttachmentsInit();
}
async function _rapierAttachmentsLink(name, owner) {
	if (!await _rapierNotesStore.attachmentStat(name)) throw new Error('This file is missing. Nothing was linked.');
	await _rapierAttachmentsEdit(owner, text => _rapierAttachmentsModel().addAttachmentLine(text, {name}));
	showToast('File linked', 'success');
}
async function _rapierAttachmentsDelete(name, row) {
	if (!await _rapierNotesUnlock()) return;
	await _rapierNotesFlush();
	const review = await _rapierNotesStore.reviewAttachmentDeletion(name);
	// A native <dialog> occupies the top layer; Rapier's shared confirmation overlay
	// would be hidden underneath it. Return to Saved files after the decision.
	const sheet = row.closest?.('dialog'); sheet?.close();
	try {
		if (!await rapierConfirm(_rapierAttachmentsModel().attachmentDeletionQuestion(review))) return;
		// Autosave and retained-history work that landed during the question must be
		// included in the second, lease-owned review.
		await _rapierNotesFlush();
		await _rapierNotesStore.deleteAttachment(review, {confirmed: true});
		row.remove();
		// Existing inline decorations may still describe the now-missing file. Invalidate
		// only this filename; the scan will recreate its rows from the unchanged links.
		for (const [link, view] of _rapierAttachments.rows) if (view.entry.name === name) {
			view.ui.remove(); link.classList.remove('rapier-attachment-link'); _rapierAttachments.rows.delete(link);
		}
		_rapierAttachmentsInit();
		showToast(name + ' deleted forever. Notes and their earlier versions were not changed.', 'info');
	} finally { if (sheet) await _rapierAttachmentsShelf(); }
}
function _rapierAttachmentsRow(entry, {owner = '', unlink = false, link = false, deletion = false, references = null} = {}) {
	const A = _rapierAttachmentsModel(), row = _rapierNotesEl('span', 'rapier-attachment-row'); row.contentEditable = 'false';
	row.dataset.attachmentName = entry.name;
	const details = _rapierNotesEl('span', 'rapier-attachment-details'), name = _rapierNotesEl('strong', 'rapier-attachment-name', entry.name);
	const meta = _rapierNotesEl('span', 'rapier-attachment-meta', A.attachmentKind(entry.name) + ' · Reading size');
	details.append(name, meta); row.appendChild(details);
	const open = _rapierAttachmentsButton('Open', () => _rapierAttachmentsOpen(entry.name)); row.appendChild(open);
	if (link && owner) row.appendChild(_rapierAttachmentsButton('Link', () => _rapierAttachmentsLink(entry.name, owner)));
	if (unlink && owner) row.appendChild(_rapierAttachmentsButton('Unlink', async () => {
		await _rapierAttachmentsEdit(owner, text => A.removeAttachmentLink(text, entry));
		showToast('Link removed. The file remains in Saved files.', 'info');
	}));
	if (deletion) {
		details.appendChild(_rapierNotesEl('span', 'rapier-attachment-meta', A.attachmentReferenceWords(references)));
		row.appendChild(_rapierAttachmentsButton('Delete forever', () => _rapierAttachmentsDelete(entry.name, row)));
	}
	row.addEventListener('pointerdown', event => event.stopPropagation());
	row.addEventListener('click', event => event.stopPropagation());
	row.addEventListener('keydown', event => {
		if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('button')) { event.preventDefault(); event.stopPropagation(); event.target.closest('button').click(); }
	});
	void _rapierNotesStore.attachmentStat(entry.name).then(stat => {
		if (!row.isConnected) return;
		meta.textContent = A.attachmentKind(entry.name) + ' · ' + (stat ? A.attachmentSizeWords(stat.size) : 'Missing file — restore it from a backup');
		open.disabled = !stat;
	}).catch(error => { if (row.isConnected) meta.textContent = 'File unavailable: ' + String(error?.message || error); });
	return row;
}
async function _rapierAttachmentsShelf() {
	try {
		if (!await _rapierNotesUnlock()) return;
		await _rapierNotesReady();
		const owner = _rapierAttachmentsOwner(), d = _rapierAttachmentsDialog('Saved files');
		if (typeof _rapierRecorderShelfClose === 'function') d.addEventListener('close', () => _rapierRecorderShelfClose(), {once: true});
		d.appendChild(_rapierNotesEl('p', '', 'Files and recordings stay here after their notes or links are deleted, and Backup includes them. To reuse one, open a note and choose Link here. Delete forever shows what uses a file, then deletes only that file.'));
		const status = _rapierNotesEl('p', '', 'Reading saved files'); d.appendChild(status);
		await _rapierNotesFlush();
		let references;
		try { references = await _rapierNotesStore.fileReferences(); }
		catch (error) { d.appendChild(_rapierNotesEl('p', '', String(error?.message || error))); }
		const names = (await _rapierNotesStore.attachmentNames()).filter(name => !/^\..*\.tmp$/.test(name)).sort((a, b) => a.localeCompare(b));
		const recordings = (await _rapierNotesStore.audioNames()).sort((a, b) => a.localeCompare(b));
		if (!d.open) return;
		const counted = [[names.length, 'file'], [recordings.length, 'recording']].filter(([n]) => n).map(([n, word]) => n.toLocaleString('en') + ' ' + word + (n === 1 ? '' : 's'));
		status.textContent = counted.length ? counted.join(' and ') : 'No saved files yet. In a note, use + → Add file to add one.';
		if (names.length && recordings.length) d.appendChild(_rapierNotesEl('h3', 'rapier-attachment-heading', 'Files'));
		// Only visible rows ask for sizes. The next page is a real button, not a hidden cap.
		let cursor = 0;
		const more = _rapierAttachmentsButton('Show more files', () => { show(); });
		const show = () => { for (let end = Math.min(cursor + 40, names.length); cursor < end; cursor++) d.insertBefore(_rapierAttachmentsRow({name: names[cursor]}, {owner, link: true, deletion: true, references: references?.attachments.get(names[cursor]) || (references ? {live: [], trash: [], history: []} : null)}), more); more.hidden = cursor >= names.length; };
		d.appendChild(more); show();
		// Recordings: nothing in the audio folder is hidden, used or not.
		if (recordings.length) {
			d.appendChild(_rapierNotesEl('h3', 'rapier-attachment-heading', 'Recordings'));
			for (const name of recordings) d.appendChild(_rapierAttachmentsRecordingRow(name, references ? references.recordings.get(name) || {live: [], trash: [], history: []} : null, references?.lengths.get(name) ?? null));
		}
	} catch (error) { _rapierAttachmentsError(error); }
}
// Name, size, users, player; SAVE; DELETE FOREVER once no note uses it.
function _rapierAttachmentsRecordingRow(name, references, seconds = null) {
	const A = _rapierAttachmentsModel(), row = _rapierNotesEl('span', 'rapier-attachment-row rapier-attachment-recording'); row.contentEditable = 'false';
	row.dataset.recordingFile = name;
	const used = references ? [...new Set([...references.live, ...references.trash].map(r => r.file.replace(/\.md$/i, '')))] : null;
	const where = used == null ? 'where it is used could not be read' : used.length ? 'in ' + used.join(', ') : 'in no note';
	const details = _rapierNotesEl('span', 'rapier-attachment-details'), meta = _rapierNotesEl('span', 'rapier-attachment-meta', 'Recording · ' + where);
	details.append(_rapierNotesEl('strong', 'rapier-attachment-name', name), meta); row.appendChild(details);
	if (typeof _rapierRecorderShelfView === 'function') row.appendChild(_rapierRecorderShelfView(name, seconds).el);
	row.appendChild(_rapierAttachmentsButton('Save', async () => { const file = await _rapierNotesStore.readAudio(name); if (!file) throw new Error(name + ' is missing from the notes folder.'); _rapierAttachmentsDownload(file, name); }));
	if (used && !used.length) { const forever = _rapierAttachmentsButton('Delete forever', () => _rapierAttachmentsDeleteRecording(name, row)); forever.classList.add('rapier-attachment-apart'); row.appendChild(forever); }
	row.addEventListener('pointerdown', event => event.stopPropagation());
	row.addEventListener('click', event => event.stopPropagation());
	void _rapierNotesStore.audioStat(name).then(stat => {
		if (row.isConnected) meta.textContent = 'Recording · ' + (stat ? A.attachmentSizeWords(stat.size) : 'missing') + ' · ' + where;
	}).catch(error => { if (row.isConnected) meta.textContent = 'Recording unavailable: ' + String(error?.message || error); });
	return row;
}
// The folder owner's review names what still plays it; refuses if anything changed.
async function _rapierAttachmentsDeleteRecording(name, row) {
	if (!await _rapierNotesUnlock()) return;
	await _rapierNotesFlush();
	const review = await _rapierNotesStore.reviewRecordingDeletion(name);
	if (review.live.length || review.trash.length) throw new Error([...new Set([...review.live, ...review.trash].map(r => r.file.replace(/\.md$/i, '')))].join(', ') + ' still uses this recording. Delete it from the note first.');
	// The shared question is not in the top layer: Saved files steps aside for it and comes back.
	const sheet = row.closest?.('dialog'); sheet?.close();
	try {
		const past = review.history.length, notes = [...new Set(review.history.map(h => h.file.replace(/\.md$/i, '')))].join(', ');
		const plays = past ? ' ' + (past === 1 ? 'An earlier version of ' + notes + ' plays it; it' : past + ' earlier versions of ' + notes + ' play it; they') + ' will open without it.' : '';
		if (!await rapierConfirm({title: 'Delete this recording forever?', message: name + ' (' + _rapierAttachmentsModel().attachmentSizeWords(review.size) + ') leaves the notes folder.' + plays + ' This cannot be undone.', confirmLabel: 'Delete forever', destructive: true})) return;
		await _rapierNotesFlush();
		await _rapierNotesStore.deleteRecording(review, {confirmed: true});
		showToast(name + ' deleted forever.', 'info');
		void _rapierNotesStorageAnswer(false);
	} finally { if (sheet) await _rapierAttachmentsShelf(); }
}
async function _rapierAttachmentsAdd(files, {fresh = false, owner = _rapierAttachmentsOwner()} = {}) {
	const A = _rapierAttachmentsModel(), decision = A.attachmentIntake(files, {streaming: true});
	if (decision.refusal) throw new Error(decision.refusal);
	if (!await _rapierNotesUnlock()) return;
	await _rapierNotesReady();
	const kind = await _rapierNotesStorageKind();
	if (kind === 'fault') throw new Error('The Notes folder could not be opened. Nothing was added; keep the original files.');
	if (kind === 'memory') throw new Error('This tab’s storage is temporary, so it cannot keep files. Nothing was added.');
	if (!fresh && (!owner || _rapierAttachmentsOwner() !== owner)) throw new Error('Open the intended note before adding a file. Nothing was copied.');
	if (decision.confirm && !await rapierConfirm({title: 'keep files with this note?', message: decision.message, confirmLabel: 'Keep files', cancelLabel: 'Cancel'})) return;
	const kept = [], controller = new AbortController();
	const sheet = _rapierAttachmentsDialog('Keeping files'), status = _rapierNotesEl('p', '', 'Preparing the file copy');
	const progress = _rapierNotesEl('progress', ''); sheet.append(status, progress);
	let settled = false;
	const cancel = () => { if (!settled) { controller.abort(); status.textContent = 'Cancelling the unfinished copy'; } };
	sheet.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
	sheet.addEventListener('close', cancel);
	sheet.appendChild(_rapierAttachmentsButton('Cancel', cancel));
	const check = () => { if (controller.signal.aborted) throw new Error('File copy cancelled. No link was added.'); };
	try {
		for (const file of decision.files) {
			if (!fresh && _rapierAttachmentsOwner() !== owner) throw new Error('The original note closed.');
			check();
			const name = await _rapierNotesStore.createAttachment(file.name, file, {signal: controller.signal, onProgress: state => {
				check();
				const phase = state.phase === 'verifying' ? 'Verifying' : state.phase === 'hashing' ? 'Reading' : 'Copying';
				status.textContent = phase + ' ' + file.name + ' — ' + A.attachmentSizeWords(state.done) + ' of ' + A.attachmentSizeWords(state.total);
				progress.max = Math.max(1, state.total); progress.value = state.done;
			}});
			kept.push({name, label: file.name});
		}
		check(); settled = true; sheet.close();
		if (fresh) {
			const source = kept.reduce((text, entry) => A.addAttachmentLine(text, entry), '');
			const wanted = _rapierNotesModel().noteFileName(kept[0].label, Object.keys(_rapierNotes.index.notes));
			const file = await _rapierNotesWriteNew(source, wanted); _rapierNotesAdmit(file, source); _rapierNotesPlaceNew(file);
			await _rapierNotesWriteIndex(); await _rapierNotesOpenNote(file);
		} else await _rapierAttachmentsEdit(owner, text => kept.reduce((source, entry) => A.addAttachmentLine(source, entry), text));
		showToast(kept.length + (kept.length === 1 ? ' file kept' : ' files kept'), 'success');
	} catch (error) {
		// Law 57: the files already copied, said once, where they wait -- not advice about originals no copy touches.
		throw new Error(String(error?.message || error) + (kept.length ? ' ' + (kept.length === 1 ? '1 copied file stays' : kept.length + ' copied files stay') + ' in Saved files.' : ''));
	} finally { settled = true; if (sheet.open) sheet.close(); }
}
function _rapierAttachmentsQueue(files, options) {
	const work = _rapierAttachments.intake.catch(() => {}).then(() => _rapierAttachmentsAdd(files, options));
	_rapierAttachments.intake = work; void work.catch(_rapierAttachmentsError); return work;
}
// A file belongs to the open note. A paste or drop over the cards still makes one.
async function _rapierAttachmentsPick() {
	try {
		if (!await _rapierNotesUnlock()) return;
		const owner = _rapierAttachmentsOwner();
		if (!owner) throw new Error('Open a note before adding a file.');
		if (typeof _rapierPrepareFileChooser === 'function') await _rapierPrepareFileChooser('notes-attachment');
		const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.hidden = true;
		document.body.appendChild(input);
		input.addEventListener('cancel', () => input.remove(), {once: true});
		input.addEventListener('change', () => { const files = Array.from(input.files || []); input.remove(); if (files.length) void _rapierAttachmentsQueue(files, {fresh: false, owner}); }, {once: true});
		input.click();
	} catch (error) { _rapierAttachmentsError(error); }
}
function _rapierAttachmentsTransferEvent(event) {
	if (!_rapierNotes.mode || !event.target?.closest?.('#editor-blocks, #rapier-notes-surface')) return;
	const transfer = event.clipboardData || event.dataTransfer;
	const directory = Array.from(transfer?.items || []).some(item => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory);
	const files = _rapierAttachmentsModel()?.attachmentTransfer(transfer) || [];
	if (!directory && !files.length) return;
	event.preventDefault(); event.stopImmediatePropagation();
	if (directory) { showToast('Folders cannot be pasted or dropped: pick their files with + → Add file, or import an export ZIP from Notes settings. Nothing was added.', 'info'); return; }
	// The unlock gate is inside _rapierAttachmentsAdd, after the size decision. Queued in the event's own turn so the intake promise is this paste's.
	void _rapierAttachmentsQueue(files, {fresh: _rapierNotes.open, owner: _rapierAttachmentsOwner()});
}
function _rapierAttachmentsClose() {
	const S = _rapierAttachments; S.observer?.disconnect();
	if (S.frame) cancelAnimationFrame(S.frame); S.frame = 0;
	for (const [link, row] of S.rows) { row.ui.remove(); link.classList.remove('rapier-attachment-link'); }
	S.rows.clear();
	for (const d of S.dialogs) d.close();
}
function _rapierAttachmentsScan() {
	const S = _rapierAttachments, A = _rapierAttachmentsModel(), host = document.getElementById('editor-blocks'), owner = _rapierAttachmentsOwner();
	if (!host || !A || !owner) { _rapierAttachmentsClose(); return; }
	S.observer?.disconnect();
	try {
		const found = new Map(), seen = new Set();
		for (const entry of A.attachmentsOf(_rapierSourceText())) { const rows = found.get(entry.name) || []; rows.push(entry); found.set(entry.name, rows); }
		for (const link of host.querySelectorAll('.block-wrapper:not(.block-wrapper--editing) > .block-read a[href]')) {
			const name = A.attachmentFromHref(link.getAttribute('href')), entry = found.get(name)?.shift();
			if (!entry) continue;
			let row = S.rows.get(link);
			if (row && (row.entry.raw !== entry.raw || row.entry.start !== entry.start || row.owner !== owner)) { row.ui.remove(); S.rows.delete(link); row = null; }
			if (!row) { const ui = _rapierAttachmentsRow(entry, {owner, unlink: true}); link.classList.add('rapier-attachment-link'); link.after(ui); row = {ui, entry, owner}; S.rows.set(link, row); }
			seen.add(link);
		}
		for (const [link, row] of S.rows) if (!seen.has(link)) { row.ui.remove(); link.classList.remove('rapier-attachment-link'); S.rows.delete(link); }
	} finally { S.observer?.observe(host, {childList: true, subtree: true}); }
}
function _rapierAttachmentsInit() {
	const S = _rapierAttachments, host = document.getElementById('editor-blocks'); if (!host) return;
	if (!S.observer) S.observer = new MutationObserver(records => {
		if (records.every(record => record.target.nodeType === 1 && record.target.closest('.rapier-attachment-row, .rapier-recording-row'))) return;
		if (!S.frame) S.frame = requestAnimationFrame(() => { S.frame = 0; _rapierAttachmentsScan(); });
	});
	_rapierAttachmentsScan();
}
function _rapierAttachmentsCard(host, file, text) {
	const rows = _rapierAttachmentsModel()?.attachmentsOf(text) || [], names = [...new Set(rows.map(row => row.name))];
	for (const name of names.slice(0, 2)) host.appendChild(_rapierAttachmentsRow({name}));
	if (names.length > 2) host.appendChild(_rapierAttachmentsButton((names.length - 2) + ' more files', () => _rapierNotesOpenNote(file)));
}
function _rapierAttachmentsBind() {
	if (_rapierAttachments.bound) return; _rapierAttachments.bound = true;
	document.addEventListener('paste', _rapierAttachmentsTransferEvent, true);
	document.addEventListener('drop', _rapierAttachmentsTransferEvent, true);
	document.addEventListener('dragover', event => {
		if (_rapierNotes.mode && event.target?.closest?.('#editor-blocks, #rapier-notes-surface') && Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
	}, true);
}
_rapierAttachmentsBind();
