const _rapierRecorder = {draft: null, dialog: null, players: new Map(), shelf: new Set(), observer: null, scan: 0, epoch: 0, speech: null, transcript: null, said: null};
function _rapierRecorderModel() { return globalThis.RapierNotesAudio; }
function _rapierRecorderOwner() { return _rapierNotes.current && !_rapierNotes.open && _rapierNotes.mode ? String(rapier.identity.authority || '') : ''; }
function _rapierRecorderButton(word, act) {
	const b = _rapierNotesEl('button', 'rapier-notes-btn', word); b.type = 'button'; b.dataset.recordingAct = act; return b;
}
function _rapierRecorderError(error) {
	if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone access was not allowed.';
	if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'No microphone was found.';
	if (error?.name === 'NotReadableError' || error?.name === 'AbortError') return 'The microphone is busy or could not be opened.';
	return 'The recording could not start: ' + String(error?.message || error);
}
function _rapierRecorderApp() {
	const id = String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase();
	return id === 'android' || id === 'windows' ? id : '';
}
function _rapierRecorderMicrophoneHelp() {
	const app = _rapierRecorderApp();
	return app === 'android' ? 'Allow Rapier to use the microphone in app settings, then try again.'
		: app === 'windows' ? 'Allow microphone access for desktop apps in Windows settings, then try again.'
		: 'Allow the microphone for this page in the browser, then try again.';
}
async function _rapierRecorderMicrophoneSettings() {
	const R = _rapierRecorder, d = R.draft, open = globalThis.RapierPlatform?.host?.openMicrophoneSettings;
	if (!d?.refused || d.phase !== 'idle' || d.openingSettings || !_rapierRecorderApp() || typeof open !== 'function') return;
	d.openingSettings = true; _rapierRecorderRender();
	try { await open(); }
	catch (_) {
		if (R.draft === d && d.phase === 'idle' && d.refused) showToast(_rapierRecorderApp() === 'android'
			? 'App settings could not open. In Settings, choose Apps, Rapier, Permissions, then Microphone.'
			: 'Microphone settings could not open. Open Windows Settings and search for Microphone privacy settings.', 'error');
	} finally { d.openingSettings = false; if (R.draft === d) _rapierRecorderRender(); }
}
// One tap records (task #366): the + bar's RECORD and a note's RECORDING open the sheet already
// asking for the microphone. A draft that is still here (a Keep that failed, a review left open)
// is shown again as it was, never started over.
function _rapierRecorderOpen(fresh) {
	const R = _rapierRecorder;
	if (R.transcript) { _rapierRecorderRecoverTranscript(); return; }
	if (R.dialog?.open) return;
	let start = false;
	if (!R.draft) {
		if (!globalThis.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') { showToast('This browser cannot record audio', 'info'); return; }
		if (!navigator.mediaDevices?.getUserMedia || !globalThis.isSecureContext) { showToast('This page cannot open a microphone. Open it in a secure browser window.', 'info'); return; }
		if (!fresh && !_rapierRecorderOwner()) { showToast('Open a note before adding a recording', 'info'); return; }
		R.draft = {fresh, owner: fresh ? '' : _rapierRecorderOwner(), note: fresh ? _rapierNotesModel().noteFileName('Recording', Object.keys(_rapierNotes.index.notes)) : _rapierNotes.current, phase: 'idle', chunks: [], held: [], pending: [], session: null, entry: null, saved: 0, custody: '', streamFault: '', blob: null, duration: null, stream: null, recorder: null, timer: 0, name: '', file: '', linked: false, fault: ''};
		start = true;
	}
	_rapierRecorderClosePlayers();
	const d = R.dialog = _rapierNotesEl('dialog', 'rapier-recording-sheet rapier-recording-live');
	d.addEventListener('cancel', e => { e.preventDefault(); _rapierRecorderDismiss(); });
	d.addEventListener('click', e => {
		const control = e.target.closest('[data-recording-act]'), act = control?.dataset.recordingAct;
		if (!act || control.disabled) return;
		e.preventDefault();
		const draft = R.draft;
		if (act === 'record') void _rapierRecorderStart();
		else if (act === 'stop') _rapierRecorderStop();
		else if (act === 'keep') void _rapierRecorderKeep();
		// Discard asks first, on the sheet itself (a recording carries on while it asks). A recording
		// whose link already landed has nothing to discard: Close goes straight to closing.
		else if (act === 'discard') { if (draft?.linked) void _rapierRecorderDiscard(); else if (draft) { _rapierRecorderQuiet(); draft.asking = true; _rapierRecorderRender(); } }
		else if (act === 'discard-no') { if (draft) { draft.asking = false; _rapierRecorderRender(); } }
		else if (act === 'discard-yes') { if (draft) draft.asking = false; if (draft?.phase === 'recording' || draft?.phase === 'paused') void _rapierRecorderDiscardLive(); else void _rapierRecorderDiscard(); }
		else if (act === 'pause' || act === 'resume') _rapierRecorderPause(act === 'pause');
		else if (act === 'cancel') _rapierRecorderDismiss();
		else if (act === 'save') void _rapierRecorderSaveFile();
		else if (act === 'microphone-settings') void _rapierRecorderMicrophoneSettings();
	});
	// One frame for every phase: the name, a stage, the one big button, a row of small ones and a
	// caption. The phases fill it; they never rebuild it, so nothing the finger is on moves away.
	const part = (tag, className) => _rapierNotesEl(tag, className);
	R.parts = {name: part('div', 'rapier-recording-name'), stage: part('div', 'rapier-recording-stage'), primary: _rapierRecorderButton('', 'stop'),
		left: _rapierRecorderButton('', ''), right: _rapierRecorderButton('', ''), caption: part('p', 'rapier-recording-caption')};
	R.parts.primary.classList.add('rapier-recording-primary');
	const meter = R.parts.meter = part('div', 'rapier-recording-meter'); meter.setAttribute('aria-hidden', 'true');
	for (let i = 0; i < RAPIER_RECORDER_BARS; i++) meter.appendChild(part('span', ''));
	const acts = part('div', 'rapier-recording-acts'); acts.append(R.parts.left, R.parts.right);
	d.append(R.parts.name, R.parts.stage, R.parts.primary, acts, R.parts.caption);
	document.body.appendChild(d);
	if (start) void _rapierRecorderStart(); else _rapierRecorderRender();
	d.showModal();
}
// A slot's control: its act, its words, whether a finger may press it. An empty word hides it and
// keeps its place, so the row never reflows under a thumb.
function _rapierRecorderAct(button, act, word, enabled = true) {
	button.dataset.recordingAct = act; button.textContent = word; button.disabled = !enabled || !act;
	button.hidden = false; button.style.visibility = word ? '' : 'hidden';
}
function _rapierRecorderRender() {
	const R = _rapierRecorder, d = R.draft, sheet = R.dialog, s = R.parts;
	if (!d || !sheet || !s) return;
	const A = _rapierRecorderModel(), had = sheet.contains(document.activeElement) ? document.activeElement : null, focus = had?.dataset?.recordingAct ?? null;
	const live = d.phase === 'recording' || d.phase === 'paused', paused = d.phase === 'paused', decided = ['stopping', 'review', 'saving'].includes(d.phase);
	if (!live && d.phase !== 'review') d.asking = false;
	const asking = !!d.asking;
	// Its name is Record until the microphone is recording, then its clock; the clock that stopped
	// is the recording's length.
	const clock = live || decided;
	s.name.textContent = clock ? A.durationWords(live ? _rapierRecorderElapsed(d) / 1000 : d.duration || 0) : 'Record';
	if (paused) s.name.appendChild(_rapierNotesEl('span', 'rapier-recording-state', 'Paused'));
	s.name.classList.toggle('rapier-recording-name--clock', clock);
	if (clock) s.name.setAttribute('role', 'timer'); else s.name.removeAttribute('role');
	sheet.setAttribute('aria-label', clock ? 'Recording' : 'Record');
	// The stage: the level while the microphone is asked for and while it records (the same row of
	// bars throughout, so nothing moves when recording begins); the player once it has stopped, so it
	// is heard before it is kept; a failure's words when it failed.
	const hold = el => { if (el.parentNode !== s.stage) s.stage.replaceChildren(el); };
	if (decided && !R.review) R.review = _rapierRecorderView('the recording', () => _rapierRecorderReviewBytes(d), d.duration);
	if (asking) s.stage.replaceChildren(_rapierNotesEl('p', 'rapier-recording-said', 'Discard this recording?'));
	else if (d.phase === 'requesting' || live) { hold(s.meter); s.meter.classList.toggle('rapier-recording-meter--rest', d.phase !== 'recording'); }
	else if (decided) {
		const view = R.review; hold(view.el);
		view.duration = d.duration; view.off = d.phase !== 'review'; view.play.disabled = view.off; _rapierRecorderPaintView(view);
	} else {
		s.stage.replaceChildren();
		if (d.phase === 'idle' && d.fault) { const said = _rapierNotesEl('p', 'rapier-recording-said', d.fault); said.setAttribute('role', 'status'); s.stage.append(said); }
	}
	// The question's answers: the safe one where the big button always is; the destructive one on
	// the other side of the small row from DISCARD, so a second tap on the same spot finds nothing.
	if (asking) { _rapierRecorderAct(s.primary, 'discard-no', 'Keep it'); _rapierRecorderAct(s.left, 'discard-yes', 'Discard'); _rapierRecorderAct(s.right, '', ''); }
	else if (d.phase === 'requesting') { _rapierRecorderAct(s.primary, 'stop', 'Stop', false); _rapierRecorderAct(s.left, '', ''); _rapierRecorderAct(s.right, 'cancel', 'Cancel'); }
	else if (live) {
		_rapierRecorderAct(s.primary, 'stop', 'Stop');
		if (typeof d.recorder?.pause === 'function') _rapierRecorderAct(s.left, paused ? 'resume' : 'pause', paused ? 'Resume' : 'Pause'); else _rapierRecorderAct(s.left, '', '');
		_rapierRecorderAct(s.right, 'discard', 'Discard');
	}
	else if (decided) {
		const busy = d.phase !== 'review';
		_rapierRecorderAct(s.primary, 'keep', d.linked ? 'Try again' : 'Keep', !busy);
		// Saving an audio file is not a third choice beside KEEP: the note's row has SAVE. It is the way
		// out only when keeping has failed, or the folder could not keep all of it.
		if (d.fault) _rapierRecorderAct(s.left, 'save', 'Save audio file', !busy); else _rapierRecorderAct(s.left, '', '');
		_rapierRecorderAct(s.right, 'discard', d.linked ? 'Close' : 'Discard', !busy);
	} else {
		_rapierRecorderAct(s.primary, 'record', 'Try again');
		if (d.refused && _rapierRecorderApp() && typeof globalThis.RapierPlatform?.host?.openMicrophoneSettings === 'function') _rapierRecorderAct(s.left, 'microphone-settings', 'Microphone settings', !d.openingSettings);
		else _rapierRecorderAct(s.left, '', '');
		_rapierRecorderAct(s.right, 'cancel', 'Close');
	}
	// R5: with custody, every acknowledged chunk is already in the notes folder and is offered back if the
	// page goes away; without it (the seam's own notice says why) the page must stay open. Never "at
	// most a second lost": a chunk is a request to the recorder, not a bound on what it holds back.
	const caption = asking ? 'What was recorded leaves the notes folder. This cannot be undone.'
		: d.phase === 'requesting' ? 'Waiting for the microphone.'
		: live ? (d.session ? 'Kept in the notes folder as it goes. If this page closes, what was kept is offered back when Notes opens.' : d.custody || 'Keep this page open while recording.')
		: decided ? d.fault || (d.entry ? 'Already in the notes folder. If this page closes, it is offered back when Notes opens.' : 'Keep this page open until you keep or discard it.')
		: d.refused ? _rapierRecorderMicrophoneHelp() : '';
	s.caption.textContent = caption;
	if (decided && d.fault) s.caption.setAttribute('role', 'status'); else s.caption.removeAttribute('role');
	// Focus stays where the person is; a control that changed under it hands focus to the big button.
	if (had?.isConnected && !had.disabled && had.style.visibility !== 'hidden' && (had.dataset.recordingAct ?? null) === focus) return;
	const again = focus && sheet.querySelector('[data-recording-act="' + focus + '"]:not([disabled])');
	if (again && again.style.visibility !== 'hidden') again.focus();
	else if (had || !sheet.contains(document.activeElement)) (s.primary.disabled ? sheet.querySelector('button:not([disabled])') : s.primary)?.focus();
}
function _rapierRecorderReleaseMic(d) {
	clearInterval(d.timer); d.timer = 0; _rapierRecorderMeterStop(d);
	for (const track of d.stream?.getTracks() || []) track.stop(); d.stream = null;
}
// Recording is seen (task #366): an AnalyserNode over the microphone's own stream, read a dozen
// times a second -- the voice's rhythm, not a flicker -- and drawn as a row of bars that move from
// the right as sound arrives. Each bar is all the sound since the bar before it, so a sound shorter
// than the wait between two readings -- a clap, a click, a knock on the table -- still stands a bar.
// Loudness, not amplitude: -54 dB is the floor, 0 dB the top. Nothing is routed to the speakers.
// The level is a sight of the sound, never a condition of recording it: a page with no audio
// context records exactly the same.
const RAPIER_RECORDER_BARS = 32;
function _rapierRecorderMeter(d) {
	try {
		const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
		if (!Context || !d.stream) return;
		const context = new Context(), analyser = context.createAnalyser();
		// Room for the longest wait between two readings: 8192 samples, 0.17 s at 48 kHz.
		analyser.fftSize = 8192; context.createMediaStreamSource(d.stream).connect(analyser);
		const samples = new Float32Array(analyser.fftSize);
		const meter = d.meter = {context, frame: 0, last: 0, level: 0, peak: 0, levels: new Array(RAPIER_RECORDER_BARS).fill(0)};
		const tick = now => {
			if (d.meter !== meter) return;
			meter.frame = requestAnimationFrame(tick);
			// Paused, the level holds, and what the microphone hears meanwhile is not recorded, so
			// the first bar after the pause starts where the recording does.
			if (d.phase !== 'recording') { meter.last = now; return; }
			if (now - meter.last < 70) return;
			// The samples since the last reading and 20 ms before it: sound reaches the analyser in
			// bursts, so the seam between two readings is counted twice rather than lost.
			const span = Math.min(samples.length, Math.ceil((now - meter.last + 20) * context.sampleRate / 1000));
			meter.last = now;
			analyser.getFloatTimeDomainData(samples);
			let sum = 0; for (let i = samples.length - span; i < samples.length; i++) sum += samples[i] * samples[i];
			const rms = Math.sqrt(sum / span);
			meter.level = rms > 0 ? Math.max(0, Math.min(1, 1 + 20 * Math.log10(rms) / 54)) : 0;
			meter.peak = Math.max(meter.peak, meter.level);
			meter.levels.shift(); meter.levels.push(meter.level);
			const bars = _rapierRecorder.parts?.meter?.children || [];
			for (let i = 0; i < bars.length; i++) bars[i].style.transform = 'scaleY(' + Math.max(0.06, meter.levels[i] || 0).toFixed(3) + ')';
		};
		meter.frame = requestAnimationFrame(tick);
		if (context.state === 'suspended') void context.resume().catch(() => {});
	} catch (_) { _rapierRecorderMeterStop(d); }
}
function _rapierRecorderMeterStop(d) {
	const meter = d?.meter; if (!meter) return;
	d.meter = null; cancelAnimationFrame(meter.frame);
	try { void meter.context.close().catch(() => {}); } catch (_) {}
}
// The time recorded, the pauses left out: what the clock shows and what the kept line says.
function _rapierRecorderElapsed(d) { return (d.elapsed || 0) + (d.phase === 'recording' && d.started ? performance.now() - d.started : 0); }
// Pause holds the recorder itself: nothing is taken while paused, the same custody session carries
// on after it, and the recorder closes the pause out of the file (Chromium's muxer: 1.5 s, a 2.5 s
// pause and 1.5 s decode as 3.0 s). The clock and the level hold still; STOP and DISCARD still work.
function _rapierRecorderPause(on) {
	const R = _rapierRecorder, d = R.draft;
	if (!d?.recorder || d.phase !== (on ? 'recording' : 'paused')) return;
	try {
		if (on) { d.recorder.pause(); d.elapsed = _rapierRecorderElapsed(d); d.phase = 'paused'; }
		else { d.recorder.resume(); d.started = performance.now(); d.phase = 'recording'; }
	} catch (_) { /* The recorder refused; it keeps recording as it was. */ }
	_rapierRecorderRender();
}
async function _rapierRecorderStart() {
	const R = _rapierRecorder, d = R.draft;
	if (!d || d.phase !== 'idle') return;
	const mime = _rapierRecorderModel().RECORDING_TYPES.find(type => MediaRecorder.isTypeSupported(type));
	if (!mime) { d.fault = 'This browser cannot record audio in a form Notes can keep.'; _rapierRecorderRender(); return; }
	d.phase = 'requesting'; d.fault = ''; d.refused = false; d.custody = ''; d.streamFault = ''; d.session = null; d.entry = null; d.saved = 0; d.held = []; d.pending = []; d.chunks = []; d.blob = null; _rapierRecorderRender();
	try {
		const stream = await navigator.mediaDevices.getUserMedia({audio: true});
		if (R.draft !== d || d.phase !== 'requesting') { for (const t of stream.getTracks()) t.stop(); return; }
		d.stream = stream;
		const recorder = d.recorder = new MediaRecorder(stream, {mimeType: mime});
		d.mime = recorder.mimeType || mime; d.completed = false; d.bitrate = recorder.audioBitsPerSecond;
		// R5: durable custody BEFORE the first chunk, admitted on the container the recorder actually
		// produces (notes/recording.mjs begin). A refusal -- a container that cannot be recovered from
		// a prefix, storage with no append, a folder another page owns -- is said before recording
		// starts and the whole-Blob path records under that notice. It is never a silent downgrade of a
		// recording already under way.
		try { d.session = await _rapierNotesStore.beginRecording(d.note, d.mime); }
		catch (error) { d.session = null; d.custody = String(error?.message || error); }
		if (R.draft !== d || d.phase !== 'requesting') { for (const t of stream.getTracks()) t.stop(); await _rapierRecorderDropSession(d, {abandon: true}); return; }
		recorder.ondataavailable = e => { if (!e.data?.size || d.discarded) return; if (d.session && !d.streamFault) _rapierRecorderAppend(d, e.data); else d.chunks.push(e.data); };
		recorder.onerror = e => { d.fault = 'The microphone stopped unexpectedly. Keep the audio captured so far or save its file.'; showToast(d.fault, 'error'); _rapierRecorderStop(); };
		recorder.onstop = () => {
			// The stop event follows the recorder's last dataavailable: every chunk has been delivered
			// and, on the custody path, submitted. What remains is the seam's own queue.
			if (d.completed) return; d.completed = true;
			if (d.discarded) return;
			if (d.phase === 'recording' || d.phase === 'paused') d.duration = Math.max(1, Math.round(_rapierRecorderElapsed(d) / 1000));
			_rapierRecorderReleaseMic(d);
			void _rapierRecorderConclude(d, recorder.mimeType || mime);
		};
		for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => { if (d.phase === 'recording' || d.phase === 'paused') { d.fault = 'The microphone disconnected. Keep the audio captured so far.'; _rapierRecorderStop(); } }, {once: true});
		recorder.start(1000); d.started = performance.now(); d.elapsed = 0; d.duration = 0; d.phase = 'recording';
		_rapierRecorderMeter(d);
		d.timer = setInterval(() => { if (R.draft === d && d.phase === 'recording' && R.parts) R.parts.name.textContent = _rapierRecorderModel().durationWords(_rapierRecorderElapsed(d) / 1000); }, 250);
		_rapierRecorderRender();
	} catch (error) {
		_rapierRecorderReleaseMic(d);
		await _rapierRecorderDropSession(d, {abandon: true});
		if (R.draft !== d) return;
		// Said on the sheet, where the person is looking, with a way to try again.
		d.fault = _rapierRecorderError(error); d.refused = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
		d.phase = 'idle'; _rapierRecorderRender();
	}
}
// A delivered chunk is held in memory until the seam acknowledges it, then let go: the notes folder
// is the copy. If an append fails, the chunk that failed and everything after it stay held, so the
// captured audio can still be joined exactly once (the acknowledged prefix read back, then these).
function _rapierRecorderAppend(d, blob) {
	d.held.push(blob);
	let acknowledged;
	try { acknowledged = d.session.append(blob); } catch (error) { acknowledged = Promise.reject(error); }
	d.pending.push(acknowledged);
	acknowledged.then(saved => { d.saved = saved; const at = d.held.indexOf(blob); if (at >= 0) d.held.splice(at, 1); },
		error => {
			if (d.streamFault || d.discarded) return;
			// Storage stopped keeping the recording: the microphone stops, the prefix already kept stays
			// kept, and the sheet says so. Not a downgrade to memory behind the person's back.
			d.streamFault = String(error?.message || error);
			d.fault = 'The notes folder stopped keeping this recording (' + d.streamFault + '). The audio captured so far is still here.';
			if (d.phase === 'recording' || d.phase === 'paused') _rapierRecorderStop();
		});
}
// The end of a recording, once the recorder has delivered its last chunk. On the custody path the
// seam publishes the exact acknowledged bytes under an ordinary audio name and keeps a receipt
// until the Markdown link is saved (Keep); the sheet's review is over a file already in the folder.
async function _rapierRecorderConclude(d, type) {
	const R = _rapierRecorder;
	const render = () => { if (R.draft === d) _rapierRecorderRender(); };
	if (d.session && !d.streamFault) {
		d.phase = 'stopping'; render();
		await Promise.allSettled(d.pending);
	}
	if (d.session && !d.streamFault) {
		const session = d.session;
		if (!d.saved) {
			d.session = null; try { await session.abandon(); } catch (_) {}
			d.phase = 'idle'; d.fault = 'No sound was recorded.'; render(); return;
		}
		try {
			d.entry = await session.finish(d.duration); d.session = null;
			d.name = d.entry.name; d.phase = 'review'; render(); return;
		} catch (error) {
			// finish never removes bytes it could not publish: the kept audio stays in the folder's custody
			// and is offered back when Notes opens. Said here, not hidden behind a Blob that does not exist.
			d.session = null; d.phase = 'idle';
			d.fault = 'The recording could not be finished here: ' + String(error?.message || error) + ' The audio kept so far stays in the notes folder and is offered back when Notes opens.';
			render(); return;
		}
	}
	// The whole-Blob path: no custody (its notice was shown before the first chunk), or custody that
	// failed part-way. The acknowledged prefix is read back from the folder, what was delivered after
	// it is still held here, and the two joined are the captured audio in order with no chunk twice.
	let prefix = null;
	if (d.session && d.saved) {
		try { const bytes = await d.session.read(); prefix = bytes && bytes.length >= d.saved ? bytes.subarray(0, d.saved) : null; } catch (_) { prefix = null; }
		if (!prefix) d.fault = 'The audio kept so far could not be read back; it stays in the notes folder and is offered back when Notes opens. The rest of what was captured can be saved as a file, though it may not play without its beginning.';
	}
	d.blob = new Blob([...(prefix ? [prefix] : []), ...d.held, ...d.chunks], {type}); d.held = []; d.chunks = [];
	d.phase = d.blob.size ? 'review' : 'idle';
	if (!d.blob.size) { d.blob = null; d.fault = d.fault || 'No sound was recorded.'; await _rapierRecorderDropSession(d, {abandon: true}); }
	render();
}
// Let a custody session go. Abandon (the person's explicit decision, or nothing acknowledged, so
// nothing to lose) removes only that recording's unfinished copy; otherwise release, and the folder
// offers the kept audio back on open. Closing a sheet is never an implicit abandon.
async function _rapierRecorderDropSession(d, {abandon = false} = {}) {
	const session = d.session; if (!session) return;
	d.session = null;
	try { if (abandon || !d.saved) await session.abandon(); else await session.release(); } catch (_) {}
}
function _rapierRecorderStop() {
	const d = _rapierRecorder.draft;
	if (!d || d.phase !== 'recording' && d.phase !== 'paused') return;
	d.duration = Math.max(1, Math.round(_rapierRecorderElapsed(d) / 1000)); d.phase = 'stopping'; clearInterval(d.timer);
	try { if (d.recorder.state !== 'inactive') d.recorder.stop(); }
	catch (error) { d.fault = 'The recorder could not finish: ' + String(error?.message || error); d.recorder.onstop?.(); }
	_rapierRecorderReleaseMic(d); _rapierRecorderRender();
}
// The person's yes to "Discard this recording?" while it records: the microphone stops, nothing
// more is taken, and the custody session is abandoned through the folder owner -- on the session's
// own queue, after every chunk already submitted to it, so no chunk is left behind as an orphan and
// nothing half-written is offered back on the next open.
async function _rapierRecorderDiscardLive() {
	const R = _rapierRecorder, d = R.draft;
	if (!d || d.phase !== 'recording' && d.phase !== 'paused') return;
	d.discarded = true; d.phase = 'discarding';
	for (const button of R.dialog?.querySelectorAll('button') || []) button.disabled = true;
	try { if (d.recorder && d.recorder.state !== 'inactive') d.recorder.stop(); } catch (_) {}
	_rapierRecorderReleaseMic(d);
	await _rapierRecorderDropSession(d, {abandon: true});
	d.chunks = []; d.held = [];
	if (R.draft === d) _rapierRecorderFinish();
}
function _rapierRecorderFinish() {
	const R = _rapierRecorder;
	if (R.draft) { _rapierRecorderReleaseMic(R.draft); void _rapierRecorderDropSession(R.draft); }
	if (R.review) _rapierRecorderDrop(R.review); R.review = null;
	R.dialog?.close(); R.dialog?.remove(); R.dialog = null; R.parts = null; R.draft = null;
	_rapierRecorderInit(); void _rapierNotesStorageAnswer(false);
}
function _rapierRecorderDismiss() {
	const d = _rapierRecorder.draft;
	if (!d) return;
	// Escape over the question answers it the safe way.
	if (d.asking) { d.asking = false; _rapierRecorderRender(); return; }
	if (d.phase === 'idle' || d.phase === 'requesting') { _rapierRecorderFinish(); return; }
	if (d.phase === 'recording' || d.phase === 'paused') { _rapierRecorderStop(); return; }
	showToast('Keep or discard this recording before closing it', 'info');
}
async function _rapierRecorderEdit(owner, transform) {
	await _rapierNotesFlush();
	if (!owner || _rapierRecorderOwner() !== owner) throw new Error('The original note is no longer open. Save the file to keep this work separately.');
	const text = _rapierSourceText(), next = transform(text);
	// One owner of the open note's source: a recording's line is an undoable transaction like a tick
	// from a card, never a reload of the document around it (that would drop the undo ledger).
	if (next !== text && !await _rapierNotesApplyText(next, 'notes.recording', 'Recording')) throw new Error('The note changed while the recording was being added. Try again.');
	await _rapierNotesAutosave(); await _rapierNotesFlush(); _rapierRecorderInit();
}
async function _rapierRecorderKeep() {
	const R = _rapierRecorder, d = R.draft, A = _rapierRecorderModel();
	if (!d || d.phase !== 'review' || !(d.blob || d.entry)) return;
	_rapierRecorderRelease(R.review);
	d.phase = 'saving'; d.fault = ''; _rapierRecorderRender();
	let words = 'Recording kept';
	try {
		if (!d.name) d.name = d.entry ? d.entry.name : await _rapierNotesStore.createAudio(d.note, d.blob.type, d.blob);
		if (d.fresh) {
			const text = A.addRecordingLine('', {name: d.name, duration: d.duration});
			// A KEEP refused after the note's file landed (its index write refused) is finished by the
			// owner's recovery; the retry asks for the same note by this draft's request and is given it
			// back, never a second note linking the same recording.
			d.request ||= 'recording-' + crypto.randomUUID();
			if (!d.file) d.file = await _rapierNotesWriteNew(text, d.note, {}, d.request);
			_rapierNotesAdmit(d.file, text); d.linked = true;
			await _rapierNotesWriteIndex();
			// A modal editor transition must not trap its own unsaved-document question underneath.
			R.dialog.close(); await _rapierNotesOpenNote(d.file);
			if (_rapierNotes.current !== d.file) words = 'Recording kept in ' + String(d.file).replace(/\.md$/i, '');
		} else {
			await _rapierRecorderEdit(d.owner, text => {
				if (A.recordingsOf(text).some(r => r.name === d.name)) { d.linked = true; return text; }
				d.linked = true; return A.addRecordingLine(text, {name: d.name, duration: d.duration});
			});
		}
		// R5: the receipt is removed only after the ordinary link is verified in the note's own bytes.
		// A whole-Blob keep after custody failed part-way has the whole audio under its name now; the
		// unfinished copy is redundant and goes.
		if (d.entry) await _rapierNotesStore.acknowledgeRecording(d.entry, d.fresh ? d.file : null);
		else await _rapierRecorderDropSession(d, {abandon: true});
		_rapierRecorderFinish(); _rapierRecorderSay(words);
	} catch (error) {
		d.phase = 'review'; d.fault = 'The recording is still here. ' + String(error?.message || error);
		if (d.linked && !d.fresh && _rapierRecorderOwner() === d.owner) d.linked = A.recordingsOf(_rapierSourceText()).some(r => r.name === d.name);
		_rapierRecorderRender(); if (R.dialog && !R.dialog.open) R.dialog.showModal(); showToast(d.fault, 'error');
	}
}
async function _rapierRecorderDiscard() {
	const R = _rapierRecorder, d = R.draft;
	if (!d || d.phase !== 'review') return;
	if (d.linked) { _rapierRecorderFinish(); return; }
	_rapierRecorderRelease(R.review);
	d.phase = 'saving'; _rapierRecorderRender();
	try {
		if (d.entry) { const recovered = await _rapierNotesStore.openRecording(d.entry); await recovered.abandon(); d.entry = null; d.name = ''; }
		else { if (d.name) await _rapierNotesStore.removeAudio(d.name); await _rapierRecorderDropSession(d, {abandon: true}); }
		_rapierRecorderFinish();
	}
	catch (error) { d.phase = 'review'; d.fault = 'The recording file could not be discarded: ' + String(error?.message || error); _rapierRecorderRender(); }
}
async function _rapierRecorderSaveFile() {
	const d = _rapierRecorder.draft, A = _rapierRecorderModel();
	if (!d) return;
	try {
		if (d.entry) { const bytes = await _rapierNotesStore.readRecording(d.entry); if (!bytes) throw new Error('The recording could not be read from the notes folder'); _rapierRecorderDownload(new Blob([bytes], {type: d.entry.mime || d.mime || ''}), d.entry.name); }
		else _rapierRecorderDownload(d.blob, d.name || A.recordingName('Recording.md', [], d.blob?.type));
	} catch (error) { showToast(String(error?.message || error), 'error'); }
}
function _rapierRecorderDownload(blob, name) {
	if (!blob) return;
	const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// ---- One player, wherever a recording is heard ---------------------------------------------------
// The review in the sheet, the note's own row: play and pause are one button; the bar is a real
// range the finger drags or taps along and the keyboard steps a second at a time; the time says
// where it is and how long it is. The bytes are read only when it is played or moved along, and
// are let go with it (_rapierRecorderRelease). The length is the one the recording's line names
// when it names one -- a recorder's WebM carries none of its own.
const RAPIER_RECORDER_GLYPHS = {play: ['M7 4.5v15l12.5-7.5z'], pause: ['M6.5 4.5h4v15h-4z', 'M13.5 4.5h4v15h-4z']};
function _rapierRecorderView(label, source, duration = null) {
	const el = _rapierNotesEl('span', 'rapier-recording-player');
	const play = _rapierRecorderButton('', 'play'); play.classList.add('rapier-recording-play');
	const bar = document.createElement('input'); bar.type = 'range'; bar.className = 'rapier-recording-bar'; bar.min = '0'; bar.max = '1'; bar.step = 'any'; bar.value = '0';
	const time = _rapierNotesEl('span', 'rapier-recording-time');
	el.append(play, bar, time);
	const view = {el, play, bar, time, label, source, duration, audio: null, url: '', blob: null, loading: null, seeking: false, playing: null};
	play.addEventListener('click', () => void _rapierRecorderToggle(view));
	bar.addEventListener('input', () => { view.seeking = true; _rapierRecorderPaintView(view); void _rapierRecorderSeek(view, Number(bar.value)); });
	bar.addEventListener('change', () => { view.seeking = false; _rapierRecorderPaintView(view); });
	bar.addEventListener('keydown', e => {
		const step = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[e.key];
		if (!step) return;
		e.preventDefault(); e.stopPropagation();
		const at = Number.isFinite(view.audio?.currentTime) ? view.audio.currentTime : Number(bar.value) || 0;
		void _rapierRecorderSeek(view, Math.max(0, Math.min(Number(bar.max) || 0, at + step)));
	});
	_rapierRecorderPaintView(view);
	return view;
}
async function _rapierRecorderLoad(view) {
	if (view.audio) return view.audio;
	if (view.loading) return view.loading;
	view.loading = (async () => {
		const file = await view.source();
		if (view.gone) throw new Error('The recording was closed');
		if (!file) throw new Error('The recording file is missing. Import or restore it with the note.');
		const audio = new Audio(); view.blob = file; view.audio = audio;
		view.url = URL.createObjectURL(file.type ? file : new Blob([file], {type: _rapierRecorderModel().audioMime('', view.name || '')}));
		audio.preload = 'metadata'; audio.src = view.url;
		for (const type of ['timeupdate', 'durationchange', 'play', 'pause', 'ended', 'seeked']) audio.addEventListener(type, () => _rapierRecorderPaintView(view));
		audio.addEventListener('error', () => { if (!view.gone) showToast('This browser cannot play this recording. Save its audio file to open it elsewhere.', 'error'); });
		return audio;
	})().finally(() => { view.loading = null; });
	return view.loading;
}
function _rapierRecorderPaintView(view) {
	const A = _rapierRecorderModel(), audio = view.audio;
	const total = view.duration ?? (Number.isFinite(audio?.duration) ? audio.duration : null);
	const playing = !!audio && !audio.paused && !audio.ended;
	const at = view.seeking ? Number(view.bar.value) || 0 : Math.min(Number.isFinite(audio?.currentTime) ? audio.currentTime : 0, total ?? Infinity);
	if (view.playing !== playing) {
		view.playing = playing;
		view.play.replaceChildren(_rapierNotesIcon(RAPIER_RECORDER_GLYPHS[playing ? 'pause' : 'play']));
		view.play.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + view.label);
	}
	const max = total > 0 ? total : 1;
	if (view.bar.max !== String(max)) view.bar.max = String(max);
	if (!view.seeking) view.bar.value = String(Math.min(at, max));
	view.bar.disabled = view.off || !(total > 0);
	view.bar.style.setProperty('--played', (Math.min(1, at / max) * 100).toFixed(2) + '%');
	view.bar.setAttribute('aria-label', 'Where in ' + view.label); view.bar.setAttribute('aria-valuetext', A.durationWords(at) + ' of ' + A.durationWords(total));
	const words = A.durationWords(at) + ' / ' + A.durationWords(total);
	if (view.time.textContent !== words) view.time.textContent = words;
	view.el.dataset.playing = String(playing); if (view.ui) view.ui.dataset.playing = String(playing);
	view.onPaint?.();
}
// One sound at a time: whatever else is playing -- another row, the review, the card -- pauses.
function _rapierRecorderQuiet(except) {
	const R = _rapierRecorder;
	for (const view of [...R.players.values(), ...R.shelf, R.review, R.card]) if (view && view !== except) view.audio?.pause();
}
// The card's ▶ (notes/notes.js _rapierNotesCard): the recording plays where it is, the note closed,
// and a second tap pauses it -- the one sound at a time with every other player. The cards are drawn
// again often, so the one playing is known by its note and its name, and every ▶ is painted from
// that. Opening a note, recording, or leaving Notes lets it go.
function _rapierRecorderCardButton(button, file, take) {
	const view = _rapierRecorder.card, playing = !!view && view.file === file && view.name === take.name && !!view.audio && !view.audio.paused && !view.audio.ended;
	button.dataset.label = take.label; button.dataset.playing = String(playing);
	button.replaceChildren(_rapierNotesIcon(RAPIER_RECORDER_GLYPHS[playing ? 'pause' : 'play']));
	button.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + take.label);
}
function _rapierRecorderCardPaint() {
	for (const button of document.querySelectorAll('.rapier-notes-card [data-notes-play]')) {
		const file = button.closest('.rapier-notes-card')?.dataset.notesFile;
		if (file) _rapierRecorderCardButton(button, file, {name: button.dataset.notesPlay, label: button.dataset.label || button.dataset.notesPlay});
	}
}
function _rapierRecorderCardToggle(file, name) {
	const R = _rapierRecorder;
	if (R.card && (R.card.file !== file || R.card.name !== name)) _rapierRecorderCardClose();
	if (!R.card) {
		const take = _rapierNotesRecordings(file).find(row => row.name === name);
		if (!take) return;
		R.card = _rapierRecorderView(take.label, () => _rapierNotesStore.readAudio(name), take.duration);
		Object.assign(R.card, {file, name, onPaint: _rapierRecorderCardPaint});
	}
	void _rapierRecorderToggle(R.card);
}
function _rapierRecorderCardClose() {
	const R = _rapierRecorder, view = R.card;
	if (!view) return;
	R.card = null; _rapierRecorderDrop(view); _rapierRecorderCardPaint();
}
// Saved files' own players (notes/attachments.js): one sound at a time with every other, and let go
// when Saved files closes.
function _rapierRecorderShelfView(name, seconds) { const view = _rapierRecorderView(name, () => _rapierNotesStore.readAudio(name), seconds); _rapierRecorder.shelf.add(view); return view; }
function _rapierRecorderShelfClose() { const R = _rapierRecorder; for (const view of R.shelf) _rapierRecorderDrop(view); R.shelf.clear(); }
async function _rapierRecorderToggle(view) {
	try {
		if (_rapierRecorder.speech) { showToast('Finish transcription before playing another recording', 'info'); return; }
		const audio = await _rapierRecorderLoad(view);
		if (!audio.paused && !audio.ended) { audio.pause(); return; }
		_rapierRecorderQuiet(view);
		if (audio.ended || view.duration > 0 && audio.currentTime >= view.duration - 0.05) audio.currentTime = 0;
		await audio.play();
	} catch (error) { if (!view.gone) showToast(String(error?.message || error), 'error'); }
}
// A player let go while its bytes were still on their way -- the note closed, the cards opened a
// note -- has nothing to say about it: the person has moved on, and nothing plays.
async function _rapierRecorderSeek(view, seconds) {
	try { const audio = await _rapierRecorderLoad(view); audio.currentTime = seconds; _rapierRecorderPaintView(view); }
	catch (error) { if (!view.gone) showToast(String(error?.message || error), 'error'); }
}
function _rapierRecorderRelease(view) {
	if (!view) return;
	view.audio?.pause();
	if (view.audio) { view.audio.removeAttribute('src'); view.audio.load(); }
	if (view.url) URL.revokeObjectURL(view.url);
	view.audio = null; view.url = ''; view.blob = null; view.playing = null;
	if (view.el.isConnected) _rapierRecorderPaintView(view);
}
// The review hears what the folder now holds: the published audio on the custody path, else the
// whole recording still in this page.
async function _rapierRecorderReviewBytes(d) {
	if (!d.entry) return d.blob;
	const bytes = await _rapierNotesStore.readRecording(d.entry);
	if (!bytes) throw new Error('The recording could not be read from the notes folder');
	return new Blob([bytes], {type: d.entry.mime || d.mime || ''});
}
function _rapierRecorderLocalSpeech() {
	const C = globalThis.SpeechRecognition;
	return C && 'processLocally' in C.prototype && typeof C.available === 'function' && typeof HTMLMediaElement.prototype.captureStream === 'function' ? C : null;
}
// Said once, when kept (task #366). The words belong to the moment the recording joined its note, so
// the recorder keeps hold of its toast: when that note closes, or another note opens, the toast is
// withdrawn -- whether it was seen or is still waiting for room to be seen -- and is never said
// again later over the cards or on reopening the note. One kept toast at a time.
function _rapierRecorderSay(words) {
	const R = _rapierRecorder, root = document.getElementById('toast-root'), previous = root?.lastElementChild;
	_rapierRecorderUnsay();
	showToast(words, 'success');
	const toast = root && root.lastElementChild !== previous ? root.lastElementChild : null;
	R.said = toast ? {toast, where: _rapierRecorderOwner()} : null;
}
function _rapierRecorderUnsay(where) {
	const R = _rapierRecorder, said = R.said;
	if (!said || where !== undefined && said.where === where) return;
	R.said = null;
	if (said.toast.isConnected) said.toast.querySelector('.toast__close')?.click();
}
function _rapierRecorderClosePlayers() {
	const R = _rapierRecorder; R.epoch++;
	_rapierRecorderUnsay(); _rapierRecorderCardClose();
	// Nothing may decorate the words after this. Leaving a note is asynchronous (the folder is read
	// again on the way out), and every edit in that window is a mutation the watcher would answer by
	// rebuilding a player -- holding a blob open over a surface the person has already left.
	// _rapierRecorderInit watches again the next time a note is opened.
	if (R.scan) { cancelAnimationFrame(R.scan); R.scan = 0; }
	R.observer?.disconnect();
	if (R.speech) { R.speech.cancelled = true; try { R.speech.recognition?.abort(); } catch (_) {} R.speech.cleanup?.(); R.speech = null; }
	for (const p of R.players.values()) { _rapierRecorderDrop(p); p.link?.classList.remove('rapier-recording-link'); }
	R.players.clear();
}
// A row taken away for good: its bytes let go, its element gone, and nothing it was still loading lands.
function _rapierRecorderDrop(p) { p.gone = true; _rapierRecorderRelease(p); p.ui?.remove(); }
// DELETE takes the recording out of its note as one undoable change -- the editor's own transaction,
// as its line arrived -- and the note stays. The audio file stays in the notes folder: Undo brings the
// line back, and the note's own past still plays it (the folder owner's reachability law). It is
// listed in Saved files, where it can be deleted forever.
async function _rapierRecorderDelete(p) {
	const A = _rapierRecorderModel(), owner = _rapierRecorderOwner(), row = p.row;
	if (!owner) return;
	_rapierRecorderRelease(p);
	try {
		let removed = false;
		await _rapierRecorderEdit(owner, text => { const next = A.removeRecordingLine(text, row); removed = next !== text; return next; });
		if (!removed) throw new Error('The recording moved in the note before it could be deleted. Try again.');
		showToast('Recording deleted from this note. Its audio file stays in Saved files.', 'info');
	} catch (error) { showToast(String(error?.message || error), 'error'); }
}
// A block that is nothing but one recording's line, in an open note, is its player -- one thing,
// edited through the player's own controls or not at all. The engine asks here
// (editor/engine.js _rapierLoneControlBlock) and never enters it as words: not by a tap beside the
// controls, the page under it, an arrow or a merge. The source view still shows its Markdown line.
function _rapierRecorderLoneBlock(block) {
	const A = _rapierRecorderModel(), raw = String(block?.raw || '').trim();
	if (!A || !raw.includes('audio') || !_rapierRecorderOwner()) return false;
	try { const rows = A.recordingsOf(raw); return rows.length === 1 && rows[0].raw === raw; } catch (_) { return false; }
}
function _rapierRecorderInit() {
	const R = _rapierRecorder, host = document.getElementById('editor-blocks');
	_rapierRecorderUnsay(_rapierRecorderOwner());
	if (_rapierRecorderOwner()) _rapierRecorderCardClose();
	if (!host) return;
	if (!R.observer) R.observer = new MutationObserver(records => {
		if (records.every(r => r.target.nodeType === 1 && r.target.closest('.rapier-recording-row'))) return;
		if (!R.scan) R.scan = requestAnimationFrame(() => { R.scan = 0; _rapierRecorderScan(); });
	});
	R.observer.observe(host, {childList: true, subtree: true});
	_rapierRecorderScan();
}
function _rapierRecorderScan() {
	const R = _rapierRecorder, A = _rapierRecorderModel(), host = document.getElementById('editor-blocks');
	if (!host || !A) return;
	R.observer?.disconnect();
	try {
		if (!_rapierRecorderOwner()) { _rapierRecorderClosePlayers(); return; }
		const rows = A.recordingsOf(_rapierSourceText()), byName = new Map(), seen = new Set(), loose = new Map();
		for (const row of rows) { if (!byName.has(row.name)) byName.set(row.name, []); byName.get(row.name).push(row); }
		// A block drawn again -- an edit beside it, a save -- has a new link: its player moves to it,
		// still playing, rather than being torn down and built again under a finger.
		for (const [link, p] of R.players) if (!link.isConnected) { R.players.delete(link); if (!loose.has(p.name)) loose.set(p.name, []); loose.get(p.name).push(p); }
		for (const link of host.querySelectorAll('.block-wrapper:not(.block-wrapper--editing) > .block-read a[href]')) {
			const name = A.recordingFromHref(link.getAttribute('href')), candidates = byName.get(name);
			if (!candidates?.length) continue;
			const row = candidates.shift(); let p = R.players.get(link);
			if (p && p.row.name !== name) { _rapierRecorderDrop(p); R.players.delete(link); p = null; }
			if (!p && loose.get(name)?.length) { p = loose.get(name).shift(); p.link = link; link.classList.add('rapier-recording-link'); link.after(p.ui); R.players.set(link, p); }
			if (!p) {
				// The note's row: the one player, and under it SAVE, TRANSCRIBE (where this browser can
				// transcribe on the device) and, apart at the far end, DELETE.
				const ui = _rapierNotesEl('span', 'rapier-recording-row'); ui.contentEditable = 'false'; ui.dataset.recordingName = name;
				p = Object.assign(_rapierRecorderView(row.label || 'the recording', () => _rapierNotesStore.readAudio(name), row.duration), {row, link, ui, name});
				const acts = _rapierNotesEl('span', 'rapier-recording-row-acts'), save = _rapierRecorderButton('Save', 'download'), remove = _rapierRecorderButton('Delete', 'delete');
				save.setAttribute('aria-label', 'Save the audio file'); remove.setAttribute('aria-label', 'Delete the recording from this note');
				acts.append(save);
				if (_rapierRecorderLocalSpeech()) { const transcribe = _rapierRecorderButton('Transcribe', 'transcribe'); transcribe.addEventListener('click', () => void _rapierRecorderTranscribe(p)); acts.append(transcribe); }
				acts.append(remove);
				ui.append(p.el, acts); link.classList.add('rapier-recording-link'); link.after(ui);
				ui.addEventListener('pointerdown', e => e.stopPropagation()); ui.addEventListener('click', e => { e.stopPropagation(); });
				// The row sits inside the words, where the editor answers keys with its own writing. A key
				// on one of its controls is the control's own and goes no further (Tab moves on, Escape
				// is the note's), so the row is used by keyboard exactly as by finger.
				ui.addEventListener('keydown', e => {
					if (e.key === 'Tab' || e.key === 'Escape') return;
					const control = e.target?.closest?.('[data-recording-act]');
					e.stopPropagation();
					if (control && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); control.click(); }
				});
				save.addEventListener('click', async () => { try { await _rapierRecorderLoad(p); _rapierRecorderDownload(p.blob, p.row.name); } catch (error) { showToast(String(error?.message || error), 'error'); } });
				remove.addEventListener('click', () => void _rapierRecorderDelete(p));
				R.players.set(link, p);
			}
			p.row = row; p.duration = row.duration; seen.add(link); _rapierRecorderPaintView(p);
		}
		for (const list of loose.values()) for (const p of list) _rapierRecorderDrop(p);
		for (const [link, p] of R.players) if (!seen.has(link)) { _rapierRecorderDrop(p); link.classList.remove('rapier-recording-link'); R.players.delete(link); }
	} finally { R.observer?.observe(host, {childList: true, subtree: true}); }
}
async function _rapierRecorderTranscribe(p) {
	const R = _rapierRecorder, C = _rapierRecorderLocalSpeech(), owner = _rapierRecorderOwner();
	if (!C || !owner) return;
	if (R.speech) { showToast('A recording is already being transcribed', 'info'); return; }
	if (R.transcript) { _rapierRecorderRecoverTranscript(); return; }
	const job = R.speech = {owner, epoch: R.epoch, cancelled: false, recognition: null, cleanup: null};
	try {
		const lang = navigator.language || 'en-US';
		if (await C.available({langs: [lang], processLocally: true}) !== 'available') throw new Error('On-device transcription is not installed for this language. No audio was sent anywhere.');
		if (job.cancelled || job.epoch !== R.epoch) return;
		const audio = await _rapierRecorderLoad(p);
		_rapierRecorderQuiet(p);
		audio.currentTime = 0;
		if (audio.readyState < 2) await new Promise((resolve, reject) => {
			const done = fn => { audio.removeEventListener('canplay', ready); audio.removeEventListener('error', failed); clearTimeout(timer); fn(); };
			const ready = () => done(resolve), failed = () => done(() => reject(new Error('This recording could not be read'))), timer = setTimeout(failed, 10000);
			audio.addEventListener('canplay', ready, {once: true}); audio.addEventListener('error', failed, {once: true});
		});
		if (job.cancelled || job.epoch !== R.epoch) return;
		const stream = audio.captureStream(), track = stream.getAudioTracks()[0];
		if (!track || track.kind !== 'audio' || track.readyState !== 'live') throw new Error('This browser cannot transcribe a saved recording on-device');
		const recognition = job.recognition = new C();
		recognition.processLocally = true;
		if (recognition.processLocally !== true) throw new Error('This browser could not guarantee on-device transcription');
		recognition.lang = lang; recognition.continuous = true; recognition.interimResults = false;
		job.cleanup = () => { audio.pause(); for (const t of stream.getTracks()) t.stop(); };
		const words = await new Promise((resolve, reject) => {
			const final = new Map(); let timer;
			const endAudio = () => { recognition.stop(); };
			const cleanup = () => { clearTimeout(timer); audio.removeEventListener('ended', endAudio); };
			recognition.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) final.set(i, e.results[i][0].transcript); };
			recognition.onerror = e => { cleanup(); const partial = [...final.values()].join(' ').trim(); if (partial) { showToast('Transcription stopped. Keeping the words recognised so far.', 'info'); resolve(partial); } else reject(new Error('On-device transcription stopped: ' + e.error)); };
			recognition.onend = () => { cleanup(); resolve([...final.values()].join(' ').trim()); };
			audio.addEventListener('ended', endAudio, {once: true});
			timer = setTimeout(() => { recognition.abort(); }, Math.max(30000, ((p.row.duration || 600) + 30) * 1000));
			// Always a saved audio track, never the recognizer's implicit microphone or server path.
			try { recognition.start(track); audio.play().catch(error => { recognition.abort(); cleanup(); reject(error); }); } catch (error) { cleanup(); reject(error); }
		});
		if (job.cancelled) return;
		if (!words) { showToast('No words were recognised', 'info'); return; }
		R.transcript = {owner, name: p.row.name, raw: p.row.raw, line: p.row.line, words};
		await _rapierRecorderKeepTranscript();
	} catch (error) { if (!job.cancelled) showToast(String(error?.message || error), 'error'); }
	finally { job.cleanup?.(); if (R.speech === job) R.speech = null; }
}
async function _rapierRecorderKeepTranscript() {
	const R = _rapierRecorder, draft = R.transcript;
	if (!draft) return;
	try {
		await _rapierRecorderEdit(draft.owner, text => {
			const matches = _rapierRecorderModel().recordingsOf(text).filter(r => r.name === draft.name && r.raw === draft.raw);
			const row = matches.length === 1 ? matches[0] : matches.find(r => r.line === draft.line);
			if (!row) throw new Error('The recording link changed. The recognised words are still here; restore the link and retry.');
			const words = globalThis.RapierNotesImport.literalBlock(draft.words);
			const end = text.indexOf('\n', row.end), at = end < 0 ? text.length : end;
			const addition = '\n\n' + words + '\n';
			if (text.slice(at, at + addition.length) === addition) return text;
			return text.slice(0, at) + addition + text.slice(at);
		});
		R.transcript = null; R.recovery?.close(); R.recovery?.remove(); R.recovery = null; showToast('Recognised words added beneath the recording', 'success');
	} catch (error) { showToast('The recognised words are still here. ' + String(error?.message || error), 'error'); _rapierRecorderRecoverTranscript(); }
}
function _rapierRecorderRecoverTranscript() {
	const R = _rapierRecorder, draft = R.transcript;
	if (!draft || R.recovery?.open) return;
	const sheet = R.recovery = _rapierNotesEl('dialog', 'rapier-recording-sheet'); sheet.setAttribute('aria-label', 'Recognised words');
	const text = _rapierNotesEl('textarea', 'rapier-recording-words'); text.value = draft.words; text.readOnly = true; text.setAttribute('aria-label', 'Recognised words');
	sheet.append(_rapierNotesEl('div', 'rapier-notes-sheet-name', 'Recognised words'), text);
	const retry = _rapierRecorderButton('Retry save to note', 'retry'), save = _rapierRecorderButton('Save text file', 'save'), discard = _rapierRecorderButton('Discard words', 'discard');
	retry.addEventListener('click', () => void _rapierRecorderKeepTranscript());
	save.addEventListener('click', () => { try { _rapierRecorderDownload(new Blob([draft.words + '\n'], {type: 'text/plain'}), 'Recognised words.txt'); } catch (error) { showToast(String(error?.message || error), 'error'); } });
	discard.addEventListener('click', () => { R.transcript = null; sheet.close(); sheet.remove(); R.recovery = null; });
	sheet.addEventListener('cancel', () => { sheet.remove(); R.recovery = null; });
	sheet.append(retry, save, discard); document.body.appendChild(sheet); sheet.showModal();
}
// ---- Recovery: what the folder kept when a page went away ---------------------------------------
// The folder's read (notes/folder.mjs) returns every unfinished or unlinked recording as an offer;
// reading it is not showing it. This sheet is the showing: each offer with its words ("a recording
// that was cut short", "a saved recording waiting for its note link"), its duration when known, the
// note it belongs to, and the three honest choices. Keep publishes the exact kept prefix under an
// ordinary audio name and puts the ordinary link in the note (a new note when the recording never
// had one); Save audio file gives the bytes without touching the folder; Discard is the only
// removal, and it asks first. Later closes the sheet and changes nothing: the folder keeps offering.
function _rapierRecorderOfferRecovery() {
	const R = _rapierRecorder, state = _rapierNotes;
	const offers = (state.recordingOffers || []).filter(offer => offer && offer.id);
	if (!offers.length || !state.open || R.dialog?.open || R.recovery?.open || R.offers?.open) return;
	const sheet = R.offers = _rapierNotesEl('dialog', 'rapier-recording-sheet rapier-recording-offers');
	sheet.setAttribute('aria-label', 'Recordings kept for you'); sheet.dataset.recordingOffers = String(offers.length);
	sheet.append(_rapierNotesEl('div', 'rapier-notes-sheet-name', offers.length === 1 ? 'A recording was kept for you' : offers.length + ' recordings were kept for you'));
	for (const offer of offers) sheet.append(_rapierRecorderOfferRow(offer));
	const later = _rapierRecorderButton('Later', 'offer-later'); later.addEventListener('click', () => _rapierRecorderCloseOffers());
	sheet.append(later);
	sheet.addEventListener('cancel', e => { e.preventDefault(); _rapierRecorderCloseOffers(); });
	document.body.appendChild(sheet); sheet.showModal();
}
function _rapierRecorderCloseOffers() {
	const R = _rapierRecorder, sheet = R.offers; if (!sheet) return;
	R.offers = null; if (sheet.open) sheet.close(); sheet.remove();
}
function _rapierRecorderOfferRow(offer) {
	const A = _rapierRecorderModel(), row = _rapierNotesEl('div', 'rapier-recording-offer');
	row.dataset.recordingOffer = offer.id; row.dataset.recordingState = offer.state || '';
	const title = file => String(file || '').replace(/\.md$/i, '');
	// A recording whose note is gone cannot be linked into it (the seam refuses to rebind an
	// identity); it can still be saved as a file or discarded, and the sheet says why.
	const orphan = !offer.note && !!offer.noteId;
	const where = offer.note ? ', for ' + title(offer.note) : offer.originalNote ? ', begun for ' + title(offer.originalNote) + (orphan ? ' (that note is no longer here)' : ' (it will go in a new note)') : '';
	const words = (offer.notice || 'a recording that was cut short') + (offer.duration != null ? ', ' + A.durationWords(offer.duration) : '') + where;
	row.append(_rapierNotesEl('p', 'rapier-recording-hint', words.charAt(0).toUpperCase() + words.slice(1) + '.'));
	if (offer.problem) { const p = _rapierNotesEl('p', 'rapier-recording-hint', offer.problem); p.setAttribute('role', 'status'); row.append(p); }
	const acts = _rapierNotesEl('div', 'rapier-recording-offer-acts');
	const bytes = (offer.size || 0) > 0, writable = !offer.readOnly && offer.state !== 'unavailable';
	if (writable && bytes && !orphan && ['recording', 'publishing', 'finished'].includes(offer.state)) { const keep = _rapierRecorderButton('Keep', 'offer-keep'); keep.addEventListener('click', () => void _rapierRecorderOfferKeep(offer, row)); acts.append(keep); }
	if (bytes) { const save = _rapierRecorderButton('Save audio file', 'offer-save'); save.addEventListener('click', () => void _rapierRecorderOfferSave(offer)); acts.append(save); }
	if (writable) { const discard = _rapierRecorderButton('Discard', 'offer-discard'); discard.addEventListener('click', () => void _rapierRecorderOfferDiscard(offer, row)); acts.append(discard); }
	row.append(acts); return row;
}
function _rapierRecorderOfferDone(offer, row) {
	const R = _rapierRecorder, state = _rapierNotes;
	state.recordingOffers = (state.recordingOffers || []).filter(o => o !== offer && o?.id !== offer.id);
	row.remove();
	if (!R.offers?.querySelector('.rapier-recording-offer')) _rapierRecorderCloseOffers();
}
function _rapierRecorderOfferBusy(row, busy) { for (const b of row.querySelectorAll('button')) b.disabled = busy; }
async function _rapierRecorderOfferKeep(offer, row) {
	const A = _rapierRecorderModel(), M = _rapierNotesModel(), store = _rapierNotesStore, state = _rapierNotes;
	_rapierRecorderOfferBusy(row, true);
	try {
		const recovered = await store.openRecording(offer);
		// The exact kept prefix, published under an ordinary audio name; no repair, no trimming. The
		// receipt stays until the link below is verified in the note's own bytes.
		const entry = await recovered.finish();
		// Finish changes the kept receipt. A refused note write must leave this same offer usable
		// for Retry, Save audio file and Discard under the new proof, never the pre-finish one.
		Object.assign(offer, entry);
		let file = entry.note && state.index?.notes?.[entry.note] ? entry.note : null, assigned = null;
		const line = {name: entry.name, duration: entry.duration};
		if (file) {
			// A failed flush means the editor still owns unsaved words. Do not replace them from
			// the older file; the published audio and its updated offer remain here for retry.
			if (state.current === file) await _rapierNotesFlush();
			const text = (await _rapierNotesTexts([file])).get(file);
			if (text == null) throw new Error('The note could not be read. The recording is kept; try again.');
			if (!A.recordingsOf(text).some(r => r.name === entry.name)) {
				const next = A.addRecordingLine(text, line);
				// The open note goes through the editor's own transaction (as a tick from a card does);
				// a closed one is written through the owner against the digest this window read.
				if (state.current === file) { if (!await _rapierNotesApplyText(next, 'notes.recording', 'Recording', {settle: true})) throw new Error('The note changed while the recording was being added. The recording is kept; try again.'); await _rapierNotesFlush(); }
				else await _rapierNotesSave(file, next);
				_rapierNotesHold(file, next); if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
			}
		} else {
			const text = A.addRecordingLine('', line);
			file = assigned = await _rapierNotesWriteNew(text, M.isNoteFile(entry.originalNote) ? entry.originalNote : 'Recording.md');
			_rapierNotesAdmit(file, text); await _rapierNotesWriteIndex();
		}
		await store.acknowledgeRecording(entry, assigned);
		_rapierRecorderOfferDone(offer, row); _rapierNotesRender();
		_rapierRecorderSay('Recording kept in ' + String(file).replace(/\.md$/i, ''));
	} catch (error) {
		_rapierRecorderOfferBusy(row, false);
		showToast('The recording is still kept. ' + String(error?.message || error), 'error');
	}
}
async function _rapierRecorderOfferSave(offer) {
	const A = _rapierRecorderModel();
	try {
		const bytes = await _rapierNotesStore.readRecording(offer);
		if (!bytes) throw new Error('The recording could not be read from the notes folder');
		_rapierRecorderDownload(new Blob([bytes], {type: offer.mime || ''}), offer.name || A.recordingName(offer.originalNote || 'Recording.md', [], offer.mime));
	} catch (error) { showToast(String(error?.message || error), 'error'); }
}
async function _rapierRecorderOfferDiscard(offer, row) {
	const R = _rapierRecorder, sheet = R.offers;
	// The shared question is not in the top layer; the sheet steps aside for it and comes back.
	if (sheet?.open) sheet.close();
	const yes = await rapierConfirm({title: 'Discard this recording?', message: 'Its kept audio is removed from the notes folder. This cannot be undone.', confirmLabel: 'Discard', cancelLabel: 'Keep it', destructive: true});
	if (!yes) { if (sheet && sheet.isConnected && !sheet.open) sheet.showModal(); return; }
	_rapierRecorderOfferBusy(row, true);
	try {
		const recovered = await _rapierNotesStore.openRecording(offer); await recovered.abandon();
		_rapierRecorderOfferDone(offer, row);
		if (sheet && sheet.isConnected && R.offers === sheet && !sheet.open) sheet.showModal();
	} catch (error) {
		_rapierRecorderOfferBusy(row, false);
		if (sheet && sheet.isConnected && !sheet.open) sheet.showModal();
		showToast('The recording was kept: ' + String(error?.message || error), 'error');
	}
}
window.addEventListener('beforeunload', e => { const R = _rapierRecorder; if (R.transcript || R.draft && !['idle', 'requesting'].includes(R.draft.phase)) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', () => { _rapierRecorderStop(); _rapierRecorderClosePlayers(); });
Object.defineProperty(globalThis, 'rapierRecordingFacts', {configurable: true, get: () => ({phase: _rapierRecorder.draft?.phase || 'closed', recorderState: _rapierRecorder.draft?.recorder?.state ?? null, name: _rapierRecorder.draft?.name || '', duration: _rapierRecorder.draft?.duration ?? null, bitrate: _rapierRecorder.draft?.bitrate ?? null, bytes: _rapierRecorder.draft?.blob?.size ?? _rapierRecorder.draft?.entry?.size ?? 0, streaming: !!(_rapierRecorder.draft?.session || _rapierRecorder.draft?.entry), saved: _rapierRecorder.draft?.saved ?? 0, level: _rapierRecorder.draft?.meter?.level ?? null, levelPeak: _rapierRecorder.draft?.meter?.peak ?? null, custody: _rapierRecorder.draft?.custody || '', entry: _rapierRecorder.draft?.entry ? {name: _rapierRecorder.draft.entry.name, state: _rapierRecorder.draft.entry.state, size: _rapierRecorder.draft.entry.size} : null, offers: (_rapierNotes.recordingOffers || []).length, recovery: !!_rapierRecorder.offers?.open, players: [..._rapierRecorder.players.values()].map(p => ({name: p.row.name, duration: p.row.duration, playing: !!p.audio && !p.audio.paused, ended: !!p.audio?.ended, at: p.audio?.currentTime ?? 0, url: p.url})), review: _rapierRecorder.review ? {playing: !!_rapierRecorder.review.audio && !_rapierRecorder.review.audio.paused && !_rapierRecorder.review.audio.ended, at: _rapierRecorder.review.audio?.currentTime ?? 0, duration: _rapierRecorder.review.duration} : null, card: _rapierRecorder.card ? {file: _rapierRecorder.card.file, name: _rapierRecorder.card.name, playing: !!_rapierRecorder.card.audio && !_rapierRecorder.card.audio.paused && !_rapierRecorder.card.audio.ended, at: _rapierRecorder.card.audio?.currentTime ?? 0} : null, localSpeech: !!_rapierRecorderLocalSpeech(), transcriptPending: !!_rapierRecorder.transcript})});
