// SPDX-License-Identifier: AGPL-3.0-only
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
	let current = null, active = null, waiting = null, closed = false;
	const notify = value => { try { update(value); } catch (_) {} };
	function cancel() {
		if (waiting) { waiting.resolve(); waiting = null; }
		active?.controller.abort();
	}
	async function load(job) {
		const controller = new AbortController(), {signal} = controller;
		active = {controller, job};
		let url = null;
		try {
			const images = globalThis.RapierEmbeddedImages;
			let blob = job.input;
			if (blob.type === 'image/jxl' && !await images.whenJxlDisplayKnown())
				blob = await images.previewBlob(new Uint8Array(await blob.arrayBuffer()), {signal});
			signal.throwIfAborted();
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
			current = {url}; url = null;
			notify(current);
			if (previous) URL.revokeObjectURL(previous.url);
		} catch (_) {
		} finally {
			if (url) URL.revokeObjectURL(url);
			active = null; job.resolve();
			if (waiting && !closed) { const next = waiting; waiting = null; void load(next); }
		}
	}
	function put(input, {video = false} = {}) {
		if (closed) return Promise.resolve();
		cancel();
		return new Promise(resolve => {
			const job = {input, video, resolve};
			if (active) waiting = job; else void load(job);
		});
	}
	return Object.freeze({
		source(file) { return put(file, {video: videoFile(file)}); },
		finish(blob) { return put(blob); },
		stop() { cancel(); },
		close() {
			if (closed) return;
			closed = true; cancel(); notify(null);
			if (current) URL.revokeObjectURL(current.url);
			current = null;
		},
	});
}
