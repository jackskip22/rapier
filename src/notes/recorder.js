const _rapierRecorder = {draft: null, dialog: null, players: new Map(), shelf: new Set(), attached: new Set(), observer: null, scan: 0, epoch: 0, speech: null, transcript: null, said: null, sound: null, bar: null};
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
	const id = globalThis.RapierPlatform?.environment.id;
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
function _rapierRecorderOpen(fresh) {
	const R = _rapierRecorder;
	if (R.transcript) { _rapierRecorderRecoverTranscript(); return; }
	if (R.dialog?.open) return;
	let start = false;
	if (!R.draft) {
		if (!globalThis.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') { showToast(_rapierNotesWords().Device + ' cannot record audio', 'info'); return; }
		if (!navigator.mediaDevices?.getUserMedia || !globalThis.isSecureContext) { showToast(_rapierNotesWords().native ? 'This device cannot open a microphone.' : 'This page cannot open a microphone. Open it in a secure browser window.', 'info'); return; }
		if (!fresh && !_rapierRecorderOwner()) { showToast('Open a note before adding a recording', 'info'); return; }
		R.draft = {fresh, owner: fresh ? '' : _rapierRecorderOwner(), note: fresh ? _rapierNotesModel().noteFileName('Recording', Object.keys(_rapierNotes.index.notes)) : _rapierNotes.current, phase: 'idle', chunks: [], held: [], pending: [], session: null, entry: null, saved: 0, custody: '', streamFault: '', blob: null, duration: null, stream: null, recorder: null, timer: 0, name: '', file: '', linked: false, fault: ''};
		start = true;
	}
	_rapierRecorderClosePlayers(); _rapierRecorderQuiet();
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
		else if (act === 'discard') { if (draft?.linked) void _rapierRecorderDiscard(); else if (draft) { _rapierRecorderQuiet(); draft.asking = true; _rapierRecorderRender(); } }
		else if (act === 'discard-no') { if (draft) { draft.asking = false; _rapierRecorderRender(); } }
		else if (act === 'discard-yes') { if (draft) draft.asking = false; if (draft?.phase === 'recording' || draft?.phase === 'paused') void _rapierRecorderDiscardLive(); else void _rapierRecorderDiscard(); }
		else if (act === 'pause' || act === 'resume') _rapierRecorderPause(act === 'pause');
		else if (act === 'cancel') _rapierRecorderDismiss();
		else if (act === 'save') void _rapierRecorderSaveFile();
		else if (act === 'microphone-settings') void _rapierRecorderMicrophoneSettings();
		else if (act === 'stamp') _rapierRecorderStamp();
	});
	const part = (tag, className) => _rapierNotesEl(tag, className);
	R.parts = {name: part('div', 'rapier-recording-name'), stage: part('div', 'rapier-recording-stage'), primary: _rapierRecorderButton('', 'stop'),
		left: _rapierRecorderButton('', ''), right: _rapierRecorderButton('', ''), caption: part('p', 'rapier-recording-caption')};
	R.parts.primary.classList.add('rapier-recording-primary');
	const band = R.parts.band = part('div', 'find-bar rapier-recording-band'), box = (tag, act) => { const b = part(tag, 'rapier-notes-add'); if (act) { b.type = 'button'; b.dataset.recordingAct = act; } return b; };
	const stamp = R.parts.stamp = box('button', 'stamp'), stop = box('button', 'stop');
	R.parts.clock = box('span', '');
	stop.append(_rapierNotesIcon(['M5 5h14v14H5z']), 'Stop');
	band.append(R.parts.clock, stamp, stop);
	for (const name of ['pointerdown', 'mousedown']) band.addEventListener(name, e => e.preventDefault());
	const meter = R.parts.meter = part('div', 'rapier-recording-meter'); meter.setAttribute('aria-hidden', 'true');
	for (let i = 0; i < RAPIER_RECORDER_BARS; i++) meter.appendChild(part('span', ''));
	const acts = part('div', 'rapier-recording-acts'); acts.append(R.parts.left, R.parts.right);
	d.append(band, R.parts.name, R.parts.stage, R.parts.primary, acts, R.parts.caption);
	document.body.appendChild(d);
	if (start) void _rapierRecorderStart(); else _rapierRecorderRender();
	if (d.classList.contains('rapier-recording-docked')) d.show(); else d.showModal();
}
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
	const docked = !d.fresh && !asking && (live || d.phase === 'requesting');
	if (sheet.classList.contains('rapier-recording-docked') !== docked) {
		const open = sheet.open; if (open) sheet.close();
		sheet.classList.toggle('rapier-recording-docked', docked);
		if (open) { if (docked) sheet.show(); else sheet.showModal(); }
	}
	const clock = live || decided;
	s.name.textContent = clock ? A.durationWords(live ? _rapierRecorderElapsed(d) / 1000 : d.duration || 0) : 'Record';
	if (paused) s.name.appendChild(_rapierNotesEl('span', 'rapier-recording-state', 'Paused'));
	s.name.classList.toggle('rapier-recording-name--clock', clock);
	if (clock) s.name.setAttribute('role', 'timer'); else s.name.removeAttribute('role');
	sheet.setAttribute('aria-label', clock ? 'Recording' : 'Record');
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
		if (d.fault) _rapierRecorderAct(s.left, 'save', 'Save audio file', !busy); else _rapierRecorderAct(s.left, '', '');
		_rapierRecorderAct(s.right, 'discard', d.linked ? 'Close' : 'Discard', !busy);
	} else {
		_rapierRecorderAct(s.primary, 'record', 'Try again');
		if (d.refused && _rapierRecorderApp() && typeof globalThis.RapierPlatform?.host?.openMicrophoneSettings === 'function') _rapierRecorderAct(s.left, 'microphone-settings', 'Microphone settings', !d.openingSettings);
		else _rapierRecorderAct(s.left, '', '');
		_rapierRecorderAct(s.right, 'cancel', 'Close');
	}
	const caption = asking ? 'What was recorded leaves the notes folder. This cannot be undone.'
		: d.phase === 'requesting' ? 'Waiting for the microphone.'
		: live ? (d.session ? '• Saved as you record.\n• If the page closes, it comes back when Notes opens.' : d.custody || 'Keep this page open while recording.')
		: decided ? d.fault || (d.entry ? 'Already in the notes folder. If this page closes, it is offered back when Notes opens.' : 'Keep this page open until you keep or discard it.')
		: d.refused ? _rapierRecorderMicrophoneHelp() : '';
	s.caption.textContent = caption;
	if (decided && d.fault) s.caption.setAttribute('role', 'status'); else s.caption.removeAttribute('role');
	_rapierRecorderStampWords(d);
	if (docked) return;
	if (had?.isConnected && !had.disabled && had.style.visibility !== 'hidden' && (had.dataset.recordingAct ?? null) === focus) return;
	const again = focus && sheet.querySelector('[data-recording-act="' + focus + '"]:not([disabled])');
	if (again && again.style.visibility !== 'hidden') again.focus();
	else if (had || !sheet.contains(document.activeElement)) (s.primary.disabled ? sheet.querySelector('button:not([disabled])') : s.primary)?.focus();
}
function _rapierRecorderReleaseMic(d) {
	d.releaseLifetime?.();
	clearInterval(d.timer); d.timer = 0; _rapierRecorderMeterStop(d);
	for (const track of d.stream?.getTracks() || []) track.stop(); d.stream = null;
}
const RAPIER_RECORDER_BARS = 32;
function _rapierRecorderMeter(d) {
	try {
		const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
		if (!Context || !d.stream) return;
		const context = new Context(), analyser = context.createAnalyser();
		analyser.fftSize = 8192; context.createMediaStreamSource(d.stream).connect(analyser);
		const samples = new Float32Array(analyser.fftSize);
		const meter = d.meter = {context, frame: 0, last: 0, level: 0, peak: 0, levels: new Array(RAPIER_RECORDER_BARS).fill(0)};
		const tick = now => {
			if (d.meter !== meter) return;
			meter.frame = requestAnimationFrame(tick);
			if (d.phase !== 'recording') { meter.last = now; return; }
			if (now - meter.last < 70) return;
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
function _rapierRecorderElapsed(d) { return (d.elapsed || 0) + (d.phase === 'recording' && d.started ? performance.now() - d.started : 0); }
function _rapierRecorderPause(on, automatic = false) {
	const R = _rapierRecorder, d = R.draft;
	if (!d?.recorder || d.phase !== (on ? 'recording' : 'paused')) return;
	if (!automatic) d.mutedPause = false;
	try {
		if (on) { d.recorder.pause(); d.elapsed = _rapierRecorderElapsed(d); d.phase = 'paused'; d.flushRecording?.(); }
		else { d.recorder.resume(); d.started = performance.now(); d.phase = 'recording'; }
	} catch (_) {  }
	d.refreshWakeLock?.();
	_rapierRecorderRender();
}
function _rapierRecorderLifetime(d) {
	const listeners = [], tracks = d.stream.getAudioTracks(); let ended = false, wake = null, pending = null, generation = 0;
	const active = () => !ended && _rapierRecorder.draft === d && ['recording', 'paused'].includes(d.phase);
	const listen = (target, name, fn) => { target?.addEventListener?.(name, fn); listeners.push(() => target?.removeEventListener?.(name, fn)); };
	const releaseWake = () => { generation++; const held = wake; wake = null; if (held) void held.release().catch(() => {}); };
	const refreshWake = d.refreshWakeLock = () => {
		if (!active() || d.phase !== 'recording' || document.visibilityState === 'hidden') { releaseWake(); return; }
		if (wake || pending || typeof navigator.wakeLock?.request !== 'function') return;
		const token = generation;
		pending = Promise.resolve().then(() => navigator.wakeLock.request('screen')).then(async lock => {
			if (token !== generation || !active() || d.phase !== 'recording' || document.visibilityState === 'hidden') { await lock.release(); return; }
			wake = lock; lock.addEventListener('release', () => { if (wake === lock) wake = null; }, {once: true});
		}).catch(() => {}).finally(() => { pending = null; if (token !== generation) refreshWake(); });
	};
	const flush = d.flushRecording = () => { if (active() && d.recorder.state !== 'inactive') try { d.recorder.requestData?.(); } catch (_) {} };
	listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); refreshWake(); });
	listen(globalThis, 'pagehide', () => { if (!active()) return; flush(); _rapierRecorderStop(); releaseWake(); });
	for (const track of tracks) {
		listen(track, 'mute', () => {
			if (!active()) return; flush();
			if (d.phase === 'recording') { _rapierRecorderPause(true, true); d.mutedPause = d.phase === 'paused'; }
		});
		listen(track, 'unmute', () => {
			if (!active() || !d.mutedPause || tracks.some(value => value.muted)) return;
			d.mutedPause = false; _rapierRecorderPause(false, true);
		});
	}
	d.releaseLifetime = () => {
		if (ended) return; ended = true; for (const remove of listeners) remove(); releaseWake();
		d.releaseLifetime = d.refreshWakeLock = d.flushRecording = null;
	};
	if (tracks.some(track => track.muted)) { _rapierRecorderPause(true, true); d.mutedPause = d.phase === 'paused'; }
	refreshWake();
}
async function _rapierRecorderStart() {
	const R = _rapierRecorder, d = R.draft;
	if (!d || d.phase !== 'idle') return;
	const mime = _rapierRecorderModel().RECORDING_TYPES.find(type => MediaRecorder.isTypeSupported(type));
	if (!mime) { d.fault = _rapierNotesWords().Device + ' cannot record audio in a form Notes can keep.'; _rapierRecorderRender(); return; }
	d.phase = 'requesting'; d.fault = ''; d.refused = false; d.custody = ''; d.streamFault = ''; d.session = null; d.entry = null; d.saved = 0; d.held = []; d.pending = []; d.chunks = []; d.blob = null; _rapierRecorderRender();
	try {
		const stream = await navigator.mediaDevices.getUserMedia({audio: true});
		if (R.draft !== d || d.phase !== 'requesting') { for (const t of stream.getTracks()) t.stop(); return; }
		d.stream = stream;
		const recorder = d.recorder = new MediaRecorder(stream, {mimeType: mime});
		d.mime = recorder.mimeType || mime; d.completed = false; d.captureFault = false; d.mutedPause = false; d.bitrate = recorder.audioBitsPerSecond;
		try { d.session = await _rapierNotesStore.beginRecording(d.note, d.mime); }
		catch (error) { d.session = null; d.custody = String(error?.message || error); }
		if (R.draft !== d || d.phase !== 'requesting') { for (const t of stream.getTracks()) t.stop(); await _rapierRecorderDropSession(d, {abandon: true}); return; }
		recorder.ondataavailable = e => { if (!e.data?.size || d.discarded) return; if (d.session && !d.streamFault) _rapierRecorderAppend(d, e.data); else d.chunks.push(e.data); };
		recorder.onerror = e => { d.captureFault = true; d.fault = 'The microphone stopped unexpectedly. Keep the audio captured so far or save its file.'; showToast(d.fault, 'error'); _rapierRecorderStop(); };
		recorder.onstop = () => {
			if (d.completed) return; d.completed = true;
			if (d.discarded) return;
			if (d.phase === 'recording' || d.phase === 'paused') d.duration = Math.max(1, Math.round(_rapierRecorderElapsed(d) / 1000));
			_rapierRecorderReleaseMic(d);
			void _rapierRecorderConclude(d, recorder.mimeType || mime);
		};
		for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => { if (d.phase === 'recording' || d.phase === 'paused') { d.fault = 'The microphone disconnected. Keep the audio captured so far.'; _rapierRecorderStop(); } }, {once: true});
		recorder.start(1000); d.started = performance.now(); d.elapsed = 0; d.duration = 0; d.phase = 'recording';
		_rapierRecorderLifetime(d);
		_rapierRecorderMeter(d);
		d.timer = setInterval(() => { if (R.draft === d && d.phase === 'recording' && R.parts) { R.parts.name.textContent = _rapierRecorderModel().durationWords(_rapierRecorderElapsed(d) / 1000); _rapierRecorderStampWords(d); } }, 250);
		_rapierRecorderRender();
	} catch (error) {
		_rapierRecorderReleaseMic(d);
		await _rapierRecorderDropSession(d, {abandon: true});
		if (R.draft !== d) return;
		d.fault = _rapierRecorderError(error); d.refused = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
		d.phase = 'idle'; _rapierRecorderRender();
	}
}
function _rapierRecorderAppend(d, blob) {
	d.held.push(blob);
	let acknowledged;
	try { acknowledged = d.session.append(blob); } catch (error) { acknowledged = Promise.reject(error); }
	d.pending.push(acknowledged);
	acknowledged.then(saved => { d.saved = saved; const at = d.held.indexOf(blob); if (at >= 0) d.held.splice(at, 1); },
		error => {
			if (d.streamFault || d.discarded) return;
			d.streamFault = String(error?.message || error);
			d.fault = 'The notes folder stopped keeping this recording (' + d.streamFault + '). The audio captured so far is still here.';
			if (d.phase === 'recording' || d.phase === 'paused') _rapierRecorderStop();
		});
}
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
			d.entry = await session.finish(d.duration, {stopped: d.completed && !d.captureFault}); d.session = null;
			d.name = d.entry.name; d.phase = 'review'; render(); return;
		} catch (error) {
			d.session = null; d.phase = 'idle';
			d.fault = 'The recording could not be finished here: ' + String(error?.message || error) + ' The audio kept so far stays in the notes folder and is offered back when Notes opens.';
			render(); return;
		}
	}
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
	catch (error) { d.captureFault = true; d.fault = 'The recorder could not finish: ' + String(error?.message || error); d.recorder.onstop?.(); }
	_rapierRecorderReleaseMic(d); _rapierRecorderRender();
}
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
	if (d.asking) { d.asking = false; _rapierRecorderRender(); return; }
	if (d.phase === 'idle' || d.phase === 'requesting') { _rapierRecorderFinish(); return; }
	if (d.phase === 'recording' || d.phase === 'paused') { _rapierRecorderStop(); return; }
	showToast('Keep or discard this recording before closing it', 'info');
}
function _rapierRecorderStampWords(d) {
	const {stamp, clock} = _rapierRecorder.parts || {}, words = _rapierRecorderModel().durationWords(Math.floor(_rapierRecorderElapsed(d) / 1000));
	if (!stamp) return;
	clock.replaceChildren(_rapierNotesIcon(RAPIER_NOTES_ADD_ICONS.recording), words);
	stamp.replaceChildren(_rapierNotesGlyph('plus'), words);
	stamp.disabled = d.phase !== 'recording' && d.phase !== 'paused';
	stamp.setAttribute('aria-label', 'Insert the time ' + words);
}
function _rapierRecorderStamp() {
	const d = _rapierRecorder.draft;
	if (!d || d.fresh || !_rapierRecorderOwner()) return;
	const seconds = Math.floor(_rapierRecorderElapsed(d) / 1000), words = _rapierRecorderModel().durationWords(seconds);
	const node = getSelection()?.focusNode, host = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.block-edit');
	if (!host?.isContentEditable) { showToast('Tap in the note where the time goes, then tap the time.', 'info'); return; }
	d.stamps = true;
	if (typeof _rangeInsertHTML === 'function' && !host.closest('.block-wrapper--source-edit')) { _rangeInsertHTML('<a href="#t=' + seconds + '">' + words + '</a>'); document.execCommand('insertText', false, ' '); }
	else document.execCommand('insertText', false, '[' + words + '](#t=' + seconds + ') ');
}
function _rapierRecorderPlayAt(href) {
	const m = /^(.*)#t=(\d+)$/.exec(String(href)), k = m && _rapierRecorderKeyOf(m[1]);
	if (!k) return false;
	const R = _rapierRecorder, p = R.sound?.key === k.key ? null : [..._rapierRecorder.players.values()].find(view => view.key === k.key);
	const view = p || Object.assign(_rapierRecorderView(R.sound?.key === k.key ? R.sound.label : 'the recording', k.source, R.sound?.key === k.key ? R.sound.duration : null, k.key), {name: k.name, file: _rapierNotes.current || ''});
	void (async () => {
		if (R.speech) { showToast('Finish transcription before playing another recording', 'info'); return; }
		const audio = await _rapierRecorderLoad(view); _rapierRecorderQuiet(view); R.sound.kept = true;
		audio.currentTime = Number(m[2]); await audio.play();
	})().catch(error => showToast(String(error?.message || error), 'error'));
	return true;
}
async function _rapierRecorderEdit(owner, transform) {
	await _rapierNotesFlush();
	if (!owner || _rapierRecorderOwner() !== owner) throw new Error('The original note is no longer open. Save the file to keep this work separately.');
	const text = _rapierSourceText(), next = transform(text);
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
			d.request ||= 'recording-' + crypto.randomUUID();
			if (!d.file) d.file = await _rapierNotesWriteNew(text, d.note, {}, d.request);
			_rapierNotesAdmit(d.file, text); d.linked = true;
			R.dialog.close(); await _rapierNotesOpenNote(d.file);
			if (_rapierNotes.current !== d.file) words = 'Recording kept in ' + String(d.file).replace(/\.md$/i, '');
		} else {
			await _rapierRecorderEdit(d.owner, text => {
				if (d.stamps) text = text.replace(/\]\(#t=(\d+)\)/g, (m, at) => '](' + A.recordingHref(d.name) + '#t=' + at + ')');
				if (A.recordingsOf(text).some(r => r.name === d.name)) { d.linked = true; return text; }
				d.linked = true; return A.addRecordingLine(text, {name: d.name, duration: d.duration});
			});
		}
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
const RAPIER_RECORDER_GLYPHS = {play: ['M7 4.5v15l12.5-7.5z'], pause: ['M6.5 4.5h4v15h-4z', 'M13.5 4.5h4v15h-4z']};
function _rapierRecorderView(label, source, duration = null, key = '') {
	const el = _rapierNotesEl('span', 'rapier-recording-player');
	const play = _rapierRecorderButton('', 'play'); play.classList.add('rapier-recording-play');
	const bar = document.createElement('input'); bar.type = 'range'; bar.className = 'rapier-recording-bar'; bar.min = '0'; bar.max = '1'; bar.step = 'any'; bar.value = '0';
	const time = _rapierNotesEl('span', 'rapier-recording-time');
	el.append(play, bar, time);
	const view = {el, play, bar, time, label, source, duration, key, audio: null, url: '', blob: null, loading: null, seeking: false, playing: null};
	if (key) for (const field of ['audio', 'blob', 'url']) Object.defineProperty(view, field, {get() { const s = _rapierRecorder.sound; return s?.key === view.key ? s[field] : field === 'url' ? '' : null; }, set() {}});
	play.addEventListener('click', () => void _rapierRecorderToggle(view));
	bar.addEventListener('input', () => { view.seeking = true; bar.dataset.dragging = 'true'; _rapierRecorderPaintView(view); void _rapierRecorderSeek(view, Number(bar.value)); });
	bar.addEventListener('change', () => { view.seeking = false; delete bar.dataset.dragging; _rapierRecorderPaintView(view); });
	bar.addEventListener('pointerdown', () => { bar.dataset.dragging = 'true'; });
	for (const name of ['pointerup', 'pointercancel', 'blur']) bar.addEventListener(name, () => { if (!view.seeking) delete bar.dataset.dragging; });
	bar.addEventListener('keydown', e => {
		const step = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[e.key];
		if (!step) return;
		e.preventDefault(); e.stopPropagation();
		const at = Number.isFinite(view.audio?.currentTime) ? view.audio.currentTime : Number(bar.value) || 0;
		void _rapierRecorderSeek(view, Math.max(0, Math.min(Number(bar.max) || 0, at + step)));
	});
	el.addEventListener('keydown', e => {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const k = e.key.toLowerCase(), skip = {j: -15, l: 30}[k];
		if (k === 'k' || k === ' ' && e.target === bar) { e.preventDefault(); e.stopPropagation(); void _rapierRecorderToggle(view); }
		else if (skip) { e.preventDefault(); e.stopPropagation(); void _rapierRecorderSkip(view, skip); }
	});
	_rapierRecorderPaintView(view);
	return view;
}
function _rapierRecorderKeyOf(href) {
	const A = _rapierRecorderModel(), clean = String(href || '').split('#')[0], name = A?.recordingFromHref(clean);
	if (name) return {key: 'audio/' + name, name, source: () => _rapierNotesStore.readAudio(name)};
	const T = globalThis.RapierNotesAttachments, file = T?.attachmentFromHref(clean);
	if (file && T.attachmentKind(file) === 'Audio') return {key: 'attachments/' + file, name: file, source: () => _rapierNotesStore.readAttachment(file)};
	return null;
}
async function _rapierRecorderLoad(view) {
	if (view.key) return _rapierRecorderSoundFor(view);
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
		audio.addEventListener('error', () => { if (!view.gone) showToast(_rapierNotesWords().Device + ' cannot play this recording. Save its audio file to open it elsewhere.', 'error'); });
		return audio;
	})().finally(() => { view.loading = null; });
	return view.loading;
}
function _rapierRecorderSpeed() { const v = Number(RapierPreferences.read('audioSpeed')); return v > 0 ? v : 1; }
async function _rapierRecorderSoundFor(view) {
	const R = _rapierRecorder;
	if (R.sound?.key === view.key) {
		const s = R.sound;
		if (!s.file && view.file) s.file = view.file;
		return s.audio || await s.loading;
	}
	_rapierRecorderSoundClose();
	const s = R.sound = {key: view.key, name: view.name || view.key.replace(/^[^/]*\//, ''), label: view.label, file: view.file || _rapierNotes.current || '', duration: view.duration, source: view.source, audio: null, url: '', blob: null, loading: null, kept: true};
	s.loading = (async () => {
		const file = await view.source();
		if (R.sound !== s) throw new Error('The recording was closed');
		if (!file) throw new Error('The recording file is missing. Import or restore it with the note.');
		const audio = new Audio(), speed = _rapierRecorderSpeed();
		s.url = URL.createObjectURL(file.type ? file : new Blob([file], {type: _rapierRecorderModel().audioMime('', s.name)}));
		s.blob = file; audio.preload = 'metadata'; audio.defaultPlaybackRate = speed; audio.playbackRate = speed; audio.src = s.url;
		for (const type of ['timeupdate', 'durationchange', 'play', 'pause', 'ended', 'seeked', 'ratechange']) audio.addEventListener(type, () => { if (R.sound === s) _rapierRecorderSoundPaint(type); });
		audio.addEventListener('error', () => { if (R.sound === s) showToast(_rapierNotesWords().Device + ' cannot play this recording. Save its audio file to open it elsewhere.', 'error'); });
		s.audio = audio; _rapierRecorderSession(s);
		return audio;
	})();
	s.loading.catch(() => { if (R.sound === s) _rapierRecorderSoundClose(); }).finally(() => { s.loading = null; });
	return s.loading;
}
function _rapierRecorderSoundClose() {
	const R = _rapierRecorder, s = R.sound;
	if (!s) return;
	R.sound = null;
	if (s.audio) { s.audio.pause(); s.audio.removeAttribute('src'); s.audio.load(); }
	if (s.url) URL.revokeObjectURL(s.url);
	_rapierRecorderSession(null); _rapierRecorderSoundPaint('close');
}
function _rapierRecorderViews() {
	const R = _rapierRecorder;
	for (const view of R.attached) { if (view.el.isConnected) view.seen = true; else if (view.seen) R.attached.delete(view); }
	return [...R.players.values(), ...R.shelf, ...R.attached, R.card, R.bar?.view].filter(Boolean);
}
function _rapierRecorderSoundPaint(type) {
	const R = _rapierRecorder, s = R.sound;
	for (const view of _rapierRecorderViews()) if (view.el.isConnected || view === R.card) _rapierRecorderPaintView(view);
	_rapierRecorderCardPaint();
	if (s?.audio && (type === 'play' || type === 'pause' || type === 'ended')) _rapierRecorderHost(!s.audio.paused && !s.audio.ended);
	if (!s) _rapierRecorderHost(false);
	_rapierRecorderSessionState();
	_rapierRecorderSaid();
	_rapierRecorderBarPaint();
}
async function _rapierRecorderSkip(view, seconds) {
	try {
		const audio = await _rapierRecorderLoad(view), total = Number.isFinite(audio.duration) ? audio.duration : view.duration ?? Infinity;
		audio.currentTime = Math.max(0, Math.min(total, (audio.currentTime || 0) + seconds));
	} catch (error) { if (!view.gone || view.key) showToast(String(error?.message || error), 'error'); }
}
const RAPIER_RECORDER_SPEEDS = ['1', '1.25', '1.5', '2', '0.75'];
function _rapierRecorderSpeedNext() {
	const now = String(_rapierRecorderSpeed()), next = RAPIER_RECORDER_SPEEDS[(RAPIER_RECORDER_SPEEDS.indexOf(now) + 1) % RAPIER_RECORDER_SPEEDS.length];
	RapierPreferences.write('audioSpeed', next);
	const audio = _rapierRecorder.sound?.audio; if (audio) { audio.defaultPlaybackRate = Number(next); audio.playbackRate = Number(next); }
	_rapierRecorderSoundPaint('ratechange');
}
function _rapierRecorderStampNow(view) {
	const s = _rapierRecorder.sound, audio = s?.key === view.key ? s.audio : null, A = _rapierRecorderModel();
	const seconds = Math.floor(audio?.currentTime || 0), words = A.durationWords(seconds);
	const node = getSelection()?.focusNode, host = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.block-edit');
	if (!host?.isContentEditable || !_rapierRecorderOwner()) { showToast('Tap in the note where the time goes, then tap the time.', 'info'); return; }
	const href = (view.key.startsWith('audio/') ? A.recordingHref(s?.name || view.name) : globalThis.RapierNotesAttachments.attachmentHref(s?.name || view.name)) + '#t=' + seconds;
	if (typeof _rangeInsertHTML === 'function' && !host.closest('.block-wrapper--source-edit')) { _rangeInsertHTML('<a href="' + href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">' + words + '</a>'); document.execCommand('insertText', false, ' '); }
	else document.execCommand('insertText', false, '[' + words + '](' + href + ') ');
}
const RAPIER_RECORDER_LINES = {play: [['polygon', {points: '5 3 19 12 5 21 5 3'}]], pause: [['rect', {x: 6, y: 4, width: 4, height: 16}], ['rect', {x: 14, y: 4, width: 4, height: 16}]],
	back: [['path', {d: 'm11 19-9-7 9-7v14Zm11 0-9-7 9-7v14Z'}]], forward: [['path', {d: 'm2 5 9 7-9 7V5Zm11 0 9 7-9 7V5Z'}]], head: [['circle', {cx: 16, cy: 16, r: 15}]]};
function _rapierRecorderLine(name) {
	const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', name === 'head' ? '0 0 32 32' : '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
	for (const [tag, attrs] of RAPIER_RECORDER_LINES[name]) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); svg.appendChild(el); }
	return svg;
}
function _rapierRecorderControl(act, label) {
	const b = _rapierRecorderButton('', act); b.classList.add('rapier-recording-icon'); b.setAttribute('aria-label', label);
	for (const name of ['pointerdown', 'mousedown']) b.addEventListener(name, e => e.preventDefault());
	return b;
}
function _rapierRecorderControls(view) {
	const back = _rapierRecorderControl('back', 'Back 15 seconds'), on = _rapierRecorderControl('forward', 'On 30 seconds');
	back.append(_rapierRecorderLine('back')); on.append(_rapierRecorderLine('forward'));
	back.addEventListener('click', () => void _rapierRecorderSkip(view, -15));
	on.addEventListener('click', () => void _rapierRecorderSkip(view, 30));
	for (const name of ['pointerdown', 'mousedown']) view.play.addEventListener(name, e => e.preventDefault());
	view.outline = true; view.playing = null;
	const speed = _rapierRecorderButton('1×', 'speed'); speed.classList.add('rapier-recording-speed');
	for (const name of ['pointerdown', 'mousedown']) speed.addEventListener(name, e => e.preventDefault());
	speed.addEventListener('click', () => _rapierRecorderSpeedNext());
	view.speed = speed;
	return {speed, back, on, play: view.play};
}
function _rapierRecorderSeekRail(view) {
	const seek = _rapierNotesEl('span', 'rapier-recording-seek'), track = _rapierNotesEl('span', 'rapier-recording-track'), head = _rapierRecorderLine('head');
	head.classList.add('rapier-recording-head');
	seek.append(track, head, view.bar);
	view.seekEl = seek;
	return seek;
}
function _rapierRecorderDeck(view, rows = null) {
	const {speed, back, on, play} = _rapierRecorderControls(view);
	const controls = _rapierNotesEl('span', 'rapier-recording-controls'), quiet = _rapierNotesEl('span', 'rapier-recording-pair');
	if (rows) quiet.append(_rapierRecorderKebab(rows));
	quiet.append(speed, back, on); controls.append(quiet, play);
	view.el.classList.add('rapier-recording-deck');
	view.el.replaceChildren(_rapierRecorderSeekRail(view), view.time, controls);
	_rapierRecorderPaintView(view);
	return view.el;
}
function _rapierRecorderKebab(rows) {
	const b = _rapierRecorderButton('', 'more'); b.classList.add('rapier-recording-icon', 'rapier-recording-kebab');
	b.setAttribute('aria-label', 'More'); b.setAttribute('aria-haspopup', 'dialog'); b.append(_rapierNotesGlyph('kebab'));
	b.addEventListener('click', e => {
		e.preventDefault(); e.stopPropagation();
		const R = _rapierRecorder; R.menu = rows().filter(Boolean);
		if (!R.menu.length || !_rapierRecorderOwner()) return;
		_rapierNotesNoteSheet('audio');
	});
	return b;
}
function _rapierRecorderMenuRows() { return (_rapierRecorder.menu || []).map(([word, icon]) => [word, icon]); }
function _rapierRecorderMenuRow(index) { const R = _rapierRecorder, row = R.menu?.[index]; R.menu = null; if (row) Promise.resolve().then(row[2]).catch(error => showToast(String(error?.message || error), 'error')); }
function _rapierRecorderLinkPlace() {
	const R = _rapierRecorder, owner = _rapierRecorderOwner();
	R.linkAt = null;
	if (!R.sound?.audio || !owner || typeof _rapierPictureCaretTarget !== 'function' || typeof _pasteTargetWrapperFromRange !== 'function') return;
	try {
		const sel = getSelection(); if (!sel?.rangeCount || !sel.isCollapsed) return;
		const range = sel.getRangeAt(0), wrapper = _pasteTargetWrapperFromRange(range), split = wrapper && _rapierPictureCaretTarget(range, wrapper)?.sourceSplit;
		if (split && Number.isSafeInteger(split.start) && Number.isSafeInteger(split.point)) R.linkAt = {owner, at: split.start + split.point, source: _rapierSourceText()};
	} catch (_) { R.linkAt = null; }
}
document.addEventListener('pointerdown', e => { if (e.target?.closest?.('#btn-notes-plus')) _rapierRecorderLinkPlace(); }, true);
function _rapierRecorderLinkWords() {
	const R = _rapierRecorder, s = R.sound;
	if (!s?.audio || !_rapierRecorderOwner()) return '';
	R.linkSeconds = Math.floor(s.audio.currentTime || 0);
	return 'Link to ' + _rapierRecorderModel().durationWords(R.linkSeconds);
}
async function _rapierRecorderLinkNow() {
	const R = _rapierRecorder, s = R.sound, place = R.linkAt, seconds = R.linkSeconds ?? Math.floor(s?.audio?.currentTime || 0);
	R.linkAt = null;
	if (!s) return;
	if (!place) { _rapierRecorderStampNow({key: s.key, name: s.name}); return; }
	const A = _rapierRecorderModel(), href = (s.key.startsWith('audio/') ? A.recordingHref(s.name) : globalThis.RapierNotesAttachments.attachmentHref(s.name)) + '#t=' + seconds;
	try {
		await _rapierRecorderEdit(place.owner, text => {
			if (text !== place.source) throw new Error('The note changed before the link was added. Tap where it goes and try again.');
			const before = text.slice(0, place.at), gap = before && !/\s$/.test(before) ? ' ' : '';
			return before + gap + '[' + A.durationWords(seconds) + '](' + href + ')' + (/^\s/.test(text.slice(place.at)) ? '' : ' ') + text.slice(place.at);
		});
	} catch (error) { showToast(String(error?.message || error), 'error'); }
}
function _rapierRecorderPaintView(view) {
	const A = _rapierRecorderModel(), audio = view.audio;
	const total = view.duration ?? (Number.isFinite(audio?.duration) ? audio.duration : null);
	const playing = !!audio && !audio.paused && !audio.ended;
	const at = view.seeking ? Number(view.bar.value) || 0 : Math.min(Number.isFinite(audio?.currentTime) ? audio.currentTime : 0, total ?? Infinity);
	if (view.playing !== playing) {
		view.playing = playing;
		view.play.replaceChildren(view.outline ? _rapierRecorderLine(playing ? 'pause' : 'play') : _rapierNotesIcon(RAPIER_RECORDER_GLYPHS[playing ? 'pause' : 'play']));
		view.play.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + view.label);
	}
	const max = total > 0 ? total : 1;
	if (view.bar.max !== String(max)) view.bar.max = String(max);
	if (!view.seeking) view.bar.value = String(Math.min(at, max));
	view.bar.toggleAttribute('disabled', !!view.off || !(total > 0));
	view.bar.style.setProperty('--played', (Math.min(1, at / max) * 100).toFixed(2) + '%');
	for (const [key, value] of [['aria-label', 'Where in ' + view.label], ['aria-valuetext', A.durationWords(at) + ' of ' + A.durationWords(total)]])
		if (view.bar.getAttribute(key) !== value) view.bar.setAttribute(key, value);
	const words = A.durationWords(at) + ' / ' + A.durationWords(total);
	if (view.time.textContent !== words) view.time.textContent = words;
	if (view.speed) { const x = String(_rapierRecorderSpeed()).replace(/^0\./, '.') + '×'; if (view.speed.textContent !== x) { view.speed.textContent = x; view.speed.setAttribute('aria-label', 'Speed ' + _rapierRecorderSpeed() + ' times'); } }
	if (view.sub) { const words = (view.note ? view.note + ' · ' : '') + A.durationWords(at) + ' / ' + A.durationWords(total); if (view.sub.textContent !== words) view.sub.textContent = words; }
	if (view.line) view.line.style.setProperty('--played', (Math.min(1, at / max) * 100).toFixed(2) + '%');
	if (view.seekEl) view.seekEl.style.setProperty('--p', Math.min(1, at / max).toFixed(4));
	for (const element of [view.el, view.ui]) if (element && element.dataset.playing !== String(playing)) element.dataset.playing = String(playing);
	view.onPaint?.();
}
function _rapierRecorderQuiet(except) {
	const R = _rapierRecorder;
	if (R.sound && R.sound.key !== except?.key) R.sound.audio?.pause();
	if (R.review && R.review !== except) R.review.audio?.pause();
}
function _rapierRecorderCardButton(button, file, take) {
	const s = _rapierRecorder.sound, playing = !!s && s.key === 'audio/' + take.name && (!s.file || s.file === file) && !!s.audio && !s.audio.paused && !s.audio.ended;
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
		R.card = _rapierRecorderView(take.label, () => _rapierNotesStore.readAudio(name), take.duration, 'audio/' + name);
		Object.assign(R.card, {file, name});
	}
	void _rapierRecorderToggle(R.card);
}
function _rapierRecorderCardClose() {
	const R = _rapierRecorder, view = R.card;
	if (!view) return;
	R.card = null; _rapierRecorderDrop(view); _rapierRecorderCardPaint();
}
function _rapierRecorderShelfView(name, seconds) { const view = Object.assign(_rapierRecorderView(name, () => _rapierNotesStore.readAudio(name), seconds, 'audio/' + name), {name}); _rapierRecorderDeck(view); _rapierRecorderShelfWatch(view); _rapierRecorder.shelf.add(view); return view; }
function _rapierRecorderShelfClose() { const R = _rapierRecorder; for (const view of R.shelf) _rapierRecorderDrop(view); R.shelf.clear(); }
async function _rapierRecorderToggle(view) {
	try {
		if (_rapierRecorder.speech) { showToast('Finish transcription before playing another recording', 'info'); return; }
		const audio = await _rapierRecorderLoad(view);
		if (!audio.paused && !audio.ended) { audio.pause(); if (view.key && view !== _rapierRecorder.bar?.view && _rapierRecorderInSight(view)) _rapierRecorder.sound.kept = false; return; }
		_rapierRecorderQuiet(view);
		if (view.key && _rapierRecorder.sound) _rapierRecorder.sound.kept = true;
		if (audio.ended || view.duration > 0 && audio.currentTime >= view.duration - 0.05) audio.currentTime = 0;
		await audio.play();
	} catch (error) { if (!view.gone || view.key) showToast(String(error?.message || error), 'error'); }
}
async function _rapierRecorderSeek(view, seconds) {
	try { const audio = await _rapierRecorderLoad(view); audio.currentTime = seconds; _rapierRecorderPaintView(view); }
	catch (error) { if (!view.gone || view.key) showToast(String(error?.message || error), 'error'); }
}
function _rapierRecorderShelfWatch(view) {
	const R = _rapierRecorder;
	if (!R.sight && typeof IntersectionObserver === 'function') {
		R.inSight = new Set();
		R.sight = new IntersectionObserver(entries => { for (const e of entries) { if (e.isIntersecting) R.inSight.add(e.target); else R.inSight.delete(e.target); } _rapierRecorderBarPaint(); });
	}
	R.sight?.observe(view.el);
}
function _rapierRecorderInSight(view) {
	const R = _rapierRecorder, key = view?.key || R.sound?.key;
	return !!key && _rapierRecorderViews().some(v => v !== R.bar?.view && v.key === key && v.el.isConnected && R.inSight?.has(v.el));
}
function _rapierRecorderBar() {
	const R = _rapierRecorder;
	if (R.bar) return R.bar;
	const el = _rapierNotesEl('div', 'rapier-recording-row rapier-recording-now'); el.hidden = true;
	el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Playing');
	const view = _rapierRecorderView('the recording', () => R.sound?.source?.(), null, 'none');
	const line = _rapierNotesEl('span', 'rapier-recording-line'), go = _rapierRecorderButton('', 'go'), close = _rapierRecorderControl('close', 'Stop and close the player');
	const title = _rapierNotesEl('span', 'rapier-recording-title'), sub = _rapierNotesEl('span', 'rapier-recording-sub');
	go.classList.add('rapier-recording-go'); go.append(title, sub);
	close.append(_rapierNotesGlyph('close'));
	go.addEventListener('click', () => void _rapierRecorderGoBack());
	close.addEventListener('click', () => _rapierRecorderSoundClose());
	const {back, on, play} = _rapierRecorderControls(view);
	view.speed = null; view.line = line; view.sub = sub; view.titleEl = title;
	back.classList.add('rapier-recording-wide'); on.classList.add('rapier-recording-wide');
	el.append(line, go, back, on, play, close);
	el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('click', e => e.stopPropagation());
	el.addEventListener('keydown', e => {
		if (e.key === 'Tab' || e.key === 'Escape') return;
		const control = e.target?.closest?.('[data-recording-act]');
		if (control && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); control.click(); }
	});
	view.ui = el;
	document.body.appendChild(el);
	return R.bar = {el, view, go, title};
}
function _rapierRecorderBarPaint() {
	const R = _rapierRecorder, s = R.sound;
	const show = !!s?.audio && s.kept && !R.dialog?.open && !_rapierRecorderInSight();
	if (!show && !R.bar) return;
	const bar = _rapierRecorderBar(), view = bar.view;
	if (s) {
		const title = s.file ? String(s.file).replace(/\.md$/i, '').split('/').pop() : s.name;
		if (view.key !== s.key) { view.key = s.key; view.playing = null; }
		view.label = s.label; view.duration = s.duration; view.name = s.name;
		const name = s.label && s.label !== 'the recording' ? s.label : s.name;
		view.note = s.file ? title : '';
		if (bar.title.textContent !== name) { bar.title.textContent = name; bar.go.setAttribute('aria-label', s.file ? 'Open ' + title : name); }
		bar.go.disabled = !s.file;
		_rapierRecorderPaintView(view);
	}
	if (show) {
		const cards = _rapierNotes.open && !_rapierNotes.surface?.hidden ? _rapierNotes.surface.querySelector('.rapier-notes-head') : null;
		const head = cards || document.querySelector('.top-bar'), top = Math.max(0, Math.round(head?.getBoundingClientRect().bottom || 0));
		const layer = cards ? _rapierNotes.surface : document.body;
		if (bar.el.parentElement !== layer) layer.appendChild(bar.el);
		if (bar.top !== top) { bar.top = top; bar.el.style.setProperty('--rapier-now-top', top + 'px'); }
	}
	if (bar.el.hidden === show) {
		bar.el.hidden = !show;
		document.body.classList.toggle('rapier-recording-now-on', show);
	}
	if (show && bar.height !== bar.el.offsetHeight) { bar.height = bar.el.offsetHeight; document.body.style.setProperty('--rapier-now-h', bar.height + 'px'); }
}
async function _rapierRecorderGoBack() {
	const R = _rapierRecorder, s = R.sound, state = _rapierNotes;
	if (!s?.file) return;
	const show = () => { const row = [...R.players.values()].find(p => p.key === s.key)?.ui || [..._rapierRecorder.attached].find(v => v.key === s.key && v.el.isConnected)?.el; row?.scrollIntoView({block: 'center'}); };
	try {
		if (state.mode && state.current === s.file) { show(); return; }
		const id = state.index?.notes?.[s.file]?.id;
		const opened = state.open || state.mode ? await _rapierNotesOpenNote(s.file) : id ? await _rapierNotesOpenById(id) : false;
		if (opened !== false) requestAnimationFrame(() => requestAnimationFrame(show));
	} catch (error) { showToast(String(error?.message || error), 'error'); }
}
function _rapierRecorderSession(s) {
	const M = navigator.mediaSession;
	if (!M) return;
	const R = _rapierRecorder, act = fn => details => { const audio = R.sound?.audio; if (audio) fn(audio, details || {}); };
	const handlers = s ? {
		play: act(audio => { R.sound.kept = true; _rapierRecorderQuiet(R.bar?.view || {key: R.sound.key}); void audio.play().catch(() => {}); }),
		pause: act(audio => audio.pause()),
		stop: () => _rapierRecorderSoundClose(),
		seekbackward: act((audio, d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 15)); }),
		seekforward: act((audio, d) => { audio.currentTime = Math.min(Number.isFinite(audio.duration) ? audio.duration : Infinity, audio.currentTime + (d.seekOffset || 30)); }),
		seekto: act((audio, d) => { if (Number.isFinite(d.seekTime)) { if (d.fastSeek && typeof audio.fastSeek === 'function') audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; } }),
	} : {};
	for (const name of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto']) { try { M.setActionHandler(name, handlers[name] || null); } catch (_) {} }
	try {
		M.metadata = s && typeof MediaMetadata === 'function' ? new MediaMetadata({title: s.label && s.label !== 'the recording' ? s.label : s.name, artist: s.file ? String(s.file).replace(/\.md$/i, '').split('/').pop() : '', album: 'Rapier Notes'}) : null;
		if (!s) M.playbackState = 'none';
	} catch (_) {}
}
function _rapierRecorderSessionState() {
	const M = navigator.mediaSession, audio = _rapierRecorder.sound?.audio;
	if (!M || !audio) return;
	try {
		M.playbackState = audio.paused || audio.ended ? 'paused' : 'playing';
		const duration = Number.isFinite(audio.duration) ? audio.duration : _rapierRecorder.sound.duration;
		if (duration > 0 && typeof M.setPositionState === 'function') M.setPositionState({duration, playbackRate: audio.playbackRate || 1, position: Math.min(duration, Math.max(0, audio.currentTime || 0))});
	} catch (_) {}
}
function _rapierRecorderHost(playing) {
	const R = _rapierRecorder;
	if (R.hostPlaying === playing) return;
	R.hostPlaying = playing;
	try { globalThis.RapierPlatform?.host?.mediaPlaying?.(playing); } catch (_) {}
}
function _rapierRecorderSaid() {
	const R = _rapierRecorder, s = R.sound, host = document.getElementById('editor-blocks');
	let block = null;
	if (s?.audio && host && _rapierRecorderOwner() && (!s.file || s.file === _rapierNotes.current) && s.audio.currentTime > 0) {
		const at = s.audio.currentTime;
		let best = -1;
		for (const link of host.querySelectorAll('.block-read a[href*="#t="]')) {
			const m = /^(.*)#t=(\d+)$/.exec(link.getAttribute('href') || ''), k = m && _rapierRecorderKeyOf(m[1]);
			if (!k || k.key !== s.key) continue;
			const t = Number(m[2]);
			if (t <= at && t >= best) { best = t; block = link.closest('.block-wrapper'); }
		}
	}
	if (R.saidBlock === block) return;
	R.saidBlock?.classList.remove('rapier-recording-said-now');
	R.saidBlock = block; block?.classList.add('rapier-recording-said-now');
}
function _rapierRecorderFileView(name, label, rows = null) {
	const R = _rapierRecorder, k = _rapierRecorderKeyOf(globalThis.RapierNotesAttachments.attachmentHref(name));
	if (!k) return null;
	const view = Object.assign(_rapierRecorderView(label || name, k.source, null, k.key), {name, file: _rapierNotes.current || ''});
	const box = _rapierNotesEl('span', 'rapier-recording-file'); box.append(_rapierRecorderDeck(view, rows));
	R.attached.add(view); _rapierRecorderShelfWatch(view);
	return box;
}
function _rapierRecorderRelease(view) {
	if (!view) return;
	_rapierRecorder.sight?.unobserve(view.el); _rapierRecorder.inSight?.delete(view.el);
	if (view.key) { view.playing = null; return; }
	view.audio?.pause();
	if (view.audio) { view.audio.removeAttribute('src'); view.audio.load(); }
	if (view.url) URL.revokeObjectURL(view.url);
	view.audio = null; view.url = ''; view.blob = null; view.playing = null;
	if (view.el.isConnected) _rapierRecorderPaintView(view);
}
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
	if (R.scan) { cancelAnimationFrame(R.scan); R.scan = 0; }
	R.observer?.disconnect();
	if (R.speech) { R.speech.cancelled = true; try { R.speech.recognition?.abort(); } catch (_) {} R.speech.cleanup?.(); R.speech = null; }
	for (const p of R.players.values()) { _rapierRecorderDrop(p); p.link?.classList.remove('rapier-recording-link'); }
	R.players.clear(); requestAnimationFrame(() => _rapierRecorderBarPaint());
}
function _rapierRecorderDrop(p) { p.gone = true; _rapierRecorderRelease(p); p.ui?.remove(); }
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
	_rapierRecorderScan(); requestAnimationFrame(() => _rapierRecorderBarPaint());
}
function _rapierRecorderScan() {
	const R = _rapierRecorder, A = _rapierRecorderModel(), host = document.getElementById('editor-blocks');
	if (!host || !A) return;
	R.observer?.disconnect();
	try {
		if (!_rapierRecorderOwner()) { _rapierRecorderClosePlayers(); return; }
		const rows = A.recordingsOf(_rapierSourceText()), byName = new Map(), seen = new Set(), loose = new Map();
		for (const row of rows) { if (!byName.has(row.name)) byName.set(row.name, []); byName.get(row.name).push(row); }
		for (const [link, p] of R.players) if (!link.isConnected) { R.players.delete(link); if (!loose.has(p.name)) loose.set(p.name, []); loose.get(p.name).push(p); }
		for (const link of host.querySelectorAll('.block-wrapper:not(.block-wrapper--editing) > .block-read a[href]')) {
			const name = A.recordingFromHref(link.getAttribute('href')), candidates = byName.get(name);
			if (!candidates?.length) continue;
			const row = candidates.shift(); let p = R.players.get(link);
			if (p && p.row.name !== name) { _rapierRecorderDrop(p); R.players.delete(link); p = null; }
			if (!p && loose.get(name)?.length) { p = loose.get(name).shift(); p.link = link; link.classList.add('rapier-recording-link'); link.after(p.ui); R.players.set(link, p); }
			if (!p) {
				const ui = _rapierNotesEl('span', 'rapier-recording-row'); ui.contentEditable = 'false'; ui.dataset.recordingName = name;
				p = Object.assign(_rapierRecorderView(row.label || 'the recording', () => _rapierNotesStore.readAudio(name), row.duration, 'audio/' + name), {row, link, ui, name, file: _rapierNotes.current || ''});
				const I = RAPIER_NOTES_ICONS;
				_rapierRecorderDeck(p, () => [
					['Save', I.page, async () => { await _rapierRecorderLoad(p); _rapierRecorderDownload(p.blob, p.row.name); }],
					_rapierRecorderLocalSpeech() ? ['Transcribe', I.mic, () => _rapierRecorderTranscribe(p)] : null,
					['Delete', I.trash, () => _rapierRecorderDelete(p)]]);
				ui.append(p.el); link.classList.add('rapier-recording-link'); link.after(ui);
				ui.addEventListener('pointerdown', e => e.stopPropagation()); ui.addEventListener('click', e => { e.stopPropagation(); });
				ui.addEventListener('keydown', e => {
					if (e.key === 'Tab' || e.key === 'Escape') return;
					const control = e.target?.closest?.('[data-recording-act]');
					e.stopPropagation();
					if (control && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); control.click(); }
				});
				R.players.set(link, p); _rapierRecorderShelfWatch(p);
			}
			p.row = row; p.duration = row.duration; seen.add(link); _rapierRecorderPaintView(p);
		}
		_rapierRecorderSaid();
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
		if (!track || track.kind !== 'audio' || track.readyState !== 'live') throw new Error(_rapierNotesWords().Device + ' cannot transcribe a saved recording on-device');
		const recognition = job.recognition = new C();
		recognition.processLocally = true;
		if (recognition.processLocally !== true) throw new Error(_rapierNotesWords().Device + ' could not guarantee on-device transcription');
		recognition.lang = lang; recognition.continuous = true; recognition.interimResults = true;
		job.cleanup = () => { audio.pause(); for (const t of stream.getTracks()) t.stop(); };
		const words = await new Promise((resolve, reject) => {
			const final = new Map(), began = new Map(); let timer;
			const endAudio = () => { recognition.stop(); };
			const cleanup = () => { clearTimeout(timer); audio.removeEventListener('ended', endAudio); };
			recognition.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) {
				if (!began.has(i)) began.set(i, Math.max(0, Math.floor(audio.currentTime - 1)));
				if (e.results[i].isFinal) final.set(i, {at: began.get(i), text: e.results[i][0].transcript.trim()});
			} };
			const said = () => [...final.values()].filter(line => line.text);
			recognition.onerror = e => { cleanup(); const partial = said(); if (partial.length) { showToast('Transcription stopped. Keeping the words recognized so far.', 'info'); resolve(partial); } else reject(new Error('On-device transcription stopped: ' + e.error)); };
			recognition.onend = () => { cleanup(); resolve(said()); };
			audio.addEventListener('ended', endAudio, {once: true});
			timer = setTimeout(() => { recognition.abort(); }, Math.max(30000, ((p.row.duration || 600) + 30) * 1000));
			try { recognition.start(track); audio.play().catch(error => { recognition.abort(); cleanup(); reject(error); }); } catch (error) { cleanup(); reject(error); }
		});
		if (job.cancelled) return;
		if (!words.length) { showToast('No words were recognized', 'info'); return; }
		R.transcript = {owner, name: p.row.name, raw: p.row.raw, line: p.row.line, words: words.map(line => line.text).join(' '), lines: words};
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
			if (!row) throw new Error('The recording link changed. The recognized words are still here; restore the link and retry.');
			const I = globalThis.RapierNotesImport, A = _rapierRecorderModel();
			const words = draft.lines?.length ? draft.lines.map(line => '[' + A.durationWords(line.at) + '](' + A.recordingHref(draft.name) + '#t=' + line.at + ') ' + I.literalBlock(line.text)).join('\n\n') : I.literalBlock(draft.words);
			const end = text.indexOf('\n', row.end), at = end < 0 ? text.length : end;
			const addition = '\n\n' + words + '\n';
			if (text.slice(at, at + addition.length) === addition) return text;
			return text.slice(0, at) + addition + text.slice(at);
		});
		R.transcript = null; R.recovery?.close(); R.recovery?.remove(); R.recovery = null; showToast('Recognized words added beneath the recording', 'success');
	} catch (error) { showToast('The recognized words are still here. ' + String(error?.message || error), 'error'); _rapierRecorderRecoverTranscript(); }
}
function _rapierRecorderRecoverTranscript() {
	const R = _rapierRecorder, draft = R.transcript;
	if (!draft || R.recovery?.open) return;
	const sheet = R.recovery = _rapierNotesEl('dialog', 'rapier-recording-sheet'); sheet.setAttribute('aria-label', 'Recognized words');
	const text = _rapierNotesEl('textarea', 'rapier-recording-words'); text.value = draft.words; text.readOnly = true; text.setAttribute('aria-label', 'Recognized words');
	sheet.append(_rapierNotesEl('div', 'rapier-notes-sheet-name', 'Recognized words'), text);
	const retry = _rapierRecorderButton('Retry save to note', 'retry'), save = _rapierRecorderButton('Save text file', 'save'), discard = _rapierRecorderButton('Discard words', 'discard');
	retry.addEventListener('click', () => void _rapierRecorderKeepTranscript());
	save.addEventListener('click', () => { try { _rapierRecorderDownload(new Blob([draft.words + '\n'], {type: 'text/plain'}), 'Recognized words.txt'); } catch (error) { showToast(String(error?.message || error), 'error'); } });
	discard.addEventListener('click', () => { R.transcript = null; sheet.close(); sheet.remove(); R.recovery = null; });
	sheet.addEventListener('cancel', () => { sheet.remove(); R.recovery = null; });
	sheet.append(retry, save, discard); document.body.appendChild(sheet); sheet.showModal();
}
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
		const entry = await recovered.finish();
		Object.assign(offer, entry);
		let file = entry.note && state.index?.notes?.[entry.note] ? entry.note : null, assigned = null;
		const line = {name: entry.name, duration: entry.duration};
		if (file) {
			if (state.current === file) await _rapierNotesFlush();
			const text = (await _rapierNotesTexts([file])).get(file);
			if (text == null) throw new Error('The note could not be read. The recording is kept; try again.');
			if (!A.recordingsOf(text).some(r => r.name === entry.name)) {
				const next = A.addRecordingLine(text, line);
				if (state.current === file) { if (!await _rapierNotesApplyText(next, 'notes.recording', 'Recording', {settle: true})) throw new Error('The note changed while the recording was being added. The recording is kept; try again.'); await _rapierNotesFlush(); }
				else await _rapierNotesSave(file, next);
				_rapierNotesHold(file, next); if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
			}
		} else {
			const text = A.addRecordingLine('', line);
			file = assigned = await _rapierNotesWriteNew(text, M.isMarkdownNote(entry.originalNote) ? entry.originalNote : 'Recording.md');
			_rapierNotesAdmit(file, text);
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
window.addEventListener('pagehide', e => { _rapierRecorderStop(); _rapierRecorderClosePlayers(); if (!e.persisted) _rapierRecorderSoundClose(); });
Object.defineProperty(globalThis, 'rapierRecordingFacts', {configurable: true, get: () => ({phase: _rapierRecorder.draft?.phase || 'closed', recorderState: _rapierRecorder.draft?.recorder?.state ?? null, name: _rapierRecorder.draft?.name || '', duration: _rapierRecorder.draft?.duration ?? null, bitrate: _rapierRecorder.draft?.bitrate ?? null, bytes: _rapierRecorder.draft?.blob?.size ?? _rapierRecorder.draft?.entry?.size ?? 0, streaming: !!(_rapierRecorder.draft?.session || _rapierRecorder.draft?.entry), saved: _rapierRecorder.draft?.saved ?? 0, level: _rapierRecorder.draft?.meter?.level ?? null, levelPeak: _rapierRecorder.draft?.meter?.peak ?? null, custody: _rapierRecorder.draft?.custody || '', entry: _rapierRecorder.draft?.entry ? {name: _rapierRecorder.draft.entry.name, state: _rapierRecorder.draft.entry.state, size: _rapierRecorder.draft.entry.size} : null, offers: (_rapierNotes.recordingOffers || []).length, recovery: !!_rapierRecorder.offers?.open, players: [..._rapierRecorder.players.values()].map(p => ({name: p.row.name, duration: p.row.duration, playing: !!p.audio && !p.audio.paused, ended: !!p.audio?.ended, at: p.audio?.currentTime ?? 0, url: p.url})), review: _rapierRecorder.review ? {playing: !!_rapierRecorder.review.audio && !_rapierRecorder.review.audio.paused && !_rapierRecorder.review.audio.ended, at: _rapierRecorder.review.audio?.currentTime ?? 0, duration: _rapierRecorder.review.duration} : null, card: _rapierRecorder.card ? {file: _rapierRecorder.card.file, name: _rapierRecorder.card.name, playing: !!_rapierRecorder.card.audio && !_rapierRecorder.card.audio.paused && !_rapierRecorder.card.audio.ended, at: _rapierRecorder.card.audio?.currentTime ?? 0} : null, localSpeech: !!_rapierRecorderLocalSpeech(), transcriptPending: !!_rapierRecorder.transcript, now: _rapierRecorder.sound ? {key: _rapierRecorder.sound.key, file: _rapierRecorder.sound.file, playing: !!_rapierRecorder.sound.audio && !_rapierRecorder.sound.audio.paused && !_rapierRecorder.sound.audio.ended, at: _rapierRecorder.sound.audio?.currentTime ?? 0, rate: _rapierRecorder.sound.audio?.playbackRate ?? null, url: _rapierRecorder.sound.url, bar: !!_rapierRecorder.bar && !_rapierRecorder.bar.el.hidden} : null})});
