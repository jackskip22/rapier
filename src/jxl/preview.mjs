// SPDX-License-Identifier: AGPL-3.0-only
const INTERVAL = 100;
const videoFile = file => /^video\//.test(file.type) || /\.(?:mp4|m4v|mov|webm|ogv|mkv|avi)$/i.test(file.name || '');

function firstFrame(url, signal) {
	return new Promise((resolve, reject) => {
		signal.throwIfAborted();
		const video = document.createElement('video');
		video.muted = true; video.playsInline = true; video.preload = 'auto';
		let settled = false;
		const abort = () => finish(signal.reason), timer = setTimeout(() => finish(new Error('Video preview timed out')), 15000);
		const finish = (error, blob) => {
			if (settled) return; settled = true;
			clearTimeout(timer); signal.removeEventListener('abort', abort);
			video.onloadeddata = video.onerror = null; video.removeAttribute('src'); video.load();
			error ? reject(error) : resolve(blob);
		};
		signal.addEventListener('abort', abort, {once: true});
		video.onloadeddata = () => {
			const canvas = document.createElement('canvas'), scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
			try {
				canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
				canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
				canvas.toBlob(blob => { canvas.width = canvas.height = 0; finish(blob ? null : new Error('Video preview unavailable'), blob); });
			} catch (error) { canvas.width = canvas.height = 0; finish(error); }
		};
		video.onerror = () => finish(new Error('Video preview unavailable'));
		video.src = url;
	});
}

export function createPicture(update) {
	let current = null, active = null, waiting = null, closed = false, finished = false;
	const notify = value => { try { update(value); } catch (_) {} };
	function cancel() {
		if (waiting) { waiting.resolve(); waiting = null; }
		active?.controller.abort();
	}
	async function load(job) {
		const controller = new AbortController(), {signal} = controller;
		active = {controller, job};
		let url = null, timer = 0;
		try {
			if (job.preview) {
				await new Promise((resolve, reject) => {
					const abort = () => { clearTimeout(timer); reject(signal.reason); };
					signal.addEventListener('abort', abort, {once: true});
					timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, INTERVAL);
				});
				signal.throwIfAborted();
			}
			const images = globalThis.RapierEmbeddedImages;
			let blob = job.input;
			if (job.preview) blob = await images.previewBlob(job.input, {signal, optional: true});
			else if (blob.type === 'image/jxl' && !await images.whenJxlDisplayKnown())
				blob = await images.previewBlob(new Uint8Array(await blob.arrayBuffer()), {signal});
			signal.throwIfAborted();
			if (!blob) return;
			url = URL.createObjectURL(blob);
			if (job.video) {
				const poster = await firstFrame(url, signal);
				signal.throwIfAborted(); URL.revokeObjectURL(url); url = null;
				url = URL.createObjectURL(poster);
			}
			await images.nativeImage(url, {signal});
			signal.throwIfAborted();
			if (closed || waiting) return;
			const previous = current;
			current = {url, preview: job.preview, final: job.final ? job.input : null}; url = null;
			notify(current);
			if (previous) URL.revokeObjectURL(previous.url);
		} catch (_) {
		} finally {
			clearTimeout(timer);
			if (url) URL.revokeObjectURL(url);
			active = null; job.resolve();
			if (waiting && !closed) { const next = waiting; waiting = null; void load(next); }
		}
	}
	function put(input, {preview = false, video = false, final = false, signal} = {}) {
		if (closed || preview && finished || signal?.aborted) return Promise.resolve();
		cancel();
		return new Promise(resolve => {
			const abort = () => {
				if (waiting === job) { waiting = null; job.resolve(); }
				else if (active?.job === job) active.controller.abort(signal.reason);
			};
			const job = {input, preview, video, final, resolve: () => { signal?.removeEventListener('abort', abort); resolve(); }};
			signal?.addEventListener('abort', abort, {once: true});
			if (signal?.aborted) { job.resolve(); return; }
			if (active) waiting = job; else void load(job);
		});
	}
	return Object.freeze({
		source(file) { finished = false; return put(file, {video: videoFile(file)}); },
		preview(frame, {signal} = {}) {
			if (!(frame?.bytes instanceof Uint8Array)) return Promise.resolve();
			return put(frame.bytes, {preview: true, signal});
		},
		finish(blob) { finished = true; return put(blob, {final: true}); },
		stop() { finished = true; cancel(); },
		close() {
			if (closed) return;
			closed = finished = true; cancel(); notify(null);
			if (current) URL.revokeObjectURL(current.url);
			current = null;
		},
	});
}
