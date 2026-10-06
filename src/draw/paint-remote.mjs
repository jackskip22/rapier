// SPDX-License-Identifier: AGPL-3.0-only
// The page's half of the painter. The engine's material lives in the painter (draw/paint-worker.mjs); the page holds
// a mirror of each surface and an identity for each brush, never a pixel of material. Input is queued here in the
// order the tool would have run it, with the tool's own arguments, and goes to the painter as one ordered batch a
// frame (a barrier sends what is queued at once). The painter answers in order: its replies carry each surface's
// facts and the rectangles that changed, which are laid straight on the display. Nothing here paints.
import {PAINT_SETTINGS} from './paint.mjs';
import {sha256Yielding, checkByteAbort} from '../notes/integrity.mjs';

const SETTING_AT = Object.fromEntries(PAINT_SETTINGS.map((row, i) => [row[0], i]));
// One batch never carries more commands than the painter admits; a longer queue goes as several, in order.
export const PAINT_BATCH_LIMIT = 8192;
// A read is verified only by a canonical digest of its own transferred bytes. Preview callers
// may opt out, but absence, malformed hashes and unavailable native crypto never mean matched.
export async function paintDigestMatches(data, digest, options = {}) {
	if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) || !ArrayBuffer.isView(data)) return false;
	const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return await sha256Yielding(bytes, options) === digest;
}
const schedule = fn => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16);

export class RemotePaintSurface {
	constructor(remote, id, width, height) {
		this.remote = remote; this.id = id;
		// What the page will see once every command it has queued has run (grow and a cancelled stroke are the only
		// ones that change the shape; the painter confirms them in each reply).
		this.width = width; this.height = height; this.toothOX = 0; this.toothOY = 0; this.scale = 1;
		// What the painter last confirmed.
		this.meta = {width, height, revision: 0, bounds: null, growBox: undefined, toothOX: 0, toothOY: 0, wetState: false, wet: false, _wetWork: false, wetPending: 0, opStats: null};
		this.pending = 0; this.structural = 0; this.failure = null; this.display = null; this.gone = false;
	}
	// A revision that differs from every confirmed one while anything is queued for this surface: "the same as when
	// I read it" is only ever true of a surface nothing has touched since.
	get revision() { return this.pending ? this.meta.revision + 0.5 : this.meta.revision; }
	get settled() { return !this.pending && !this.failure; }
	get growBox() { return this.meta.growBox; }
	get wetState() { return this.meta.wetState; }
	get wet() { return this.meta.wet; }
	get _wetWork() { return this.meta._wetWork; }
	get wetPending() { return this.meta.wetPending; }
	get opStats() { return this.meta.opStats; }
	bounds() { const b = this.meta.bounds; return b ? {...b} : null; }
	_push(wire, {mutates = true, structural = false, transfer = null, ticket = false} = {}) {
		// A sheet already let go has nothing to be told: a late owner finds nothing to do.
		if (this.gone) return {promise: ticket ? Promise.resolve(false) : null};
		const entry = {wire, surface: this, mutates, structural, transfer};
		if (mutates) { this.pending++; if (structural) this.structural++; }
		else entry.surface = null;
		if (ticket) entry.promise = new Promise((resolve, reject) => { entry.settle = resolve; entry.reject = reject; });
		this.remote._enqueue(entry);
		return entry;
	}
	tilt(gx, gy) {
		const queue = this.remote._queue, last = queue[queue.length - 1];
		// Two tilts with nothing between them are one: the second wins, exactly as it would have run.
		if (last && last.wire.method === 'tilt' && last.wire.id === this.id) { last.wire.args = [gx, gy]; return; }
		this._push({target: 'surface', id: this.id, method: 'tilt', args: [gx, gy]});
	}
	set(name, value) {
		if (name === 'toothOX') this.toothOX = value; else if (name === 'toothOY') this.toothOY = value; else if (name === 'scale') this.scale = value;
		this._push({target: 'surface', id: this.id, method: 'set', args: [name, value]}, {structural: name === 'toothOX' || name === 'toothOY'});
	}
	settleWet() { this._push({target: 'surface', id: this.id, method: 'settleWet', args: []}); }
	finishWetWork() { this._push({target: 'surface', id: this.id, method: '_finishWetWork', args: []}); }
	// One bounded drying slice in the painter; resolves with whether the paper is dry.
	dryWet(feed = 8, slice = 8) { return this._push({target: 'surface', id: this.id, method: 'dryWet', args: [feed, slice]}, {ticket: true}).promise; }
	fromRGBA8(data, width, height, x = 0, y = 0) {
		const buffer = data.buffer;
		this._push({target: 'surface', id: this.id, method: 'fromRGBA8', args: [data, width, height, x, y]}, {transfer: buffer instanceof ArrayBuffer && data.byteOffset === 0 && data.byteLength === buffer.byteLength ? buffer : null});
	}
	grow(left = 0, top = 0, right = 0, bottom = 0) {
		left = Math.max(0, Math.ceil(left)); top = Math.max(0, Math.ceil(top)); right = Math.max(0, Math.ceil(right)); bottom = Math.max(0, Math.ceil(bottom));
		if (!(left || top || right || bottom)) return {dx: 0, dy: 0};
		this.width += left + right; this.height += top + bottom; this.toothOX -= left; this.toothOY -= top;
		this._push({target: 'surface', id: this.id, method: 'grow', args: [left, top, right, bottom]}, {structural: true});
		return {dx: left, dy: top};
	}
	// A stroke's checkpoint lives in the painter. The token names it and what shape the page restores on a cancel.
	beginStroke() {
		const token = {id: ++this.remote._tokens, width: this.width, height: this.height, toothOX: this.toothOX, toothOY: this.toothOY};
		this._push({target: 'surface', id: this.id, method: 'beginStroke', args: [token.id]}, {mutates: false});
		return token;
	}
	endStroke(token, cancel = false) {
		if (!token) return false;
		if (cancel) { this.width = token.width; this.height = token.height; this.toothOX = token.toothOX; this.toothOY = token.toothOY; }
		this._push({target: 'surface', id: this.id, method: 'endStroke', args: [token.id, cancel === true]}, {structural: cancel === true});
		return true;
	}
	// Everything queued so far has run and the mirror is the painter's own.
	sync() { return this.remote.sync(this); }
	// Pixels of a box (the whole surface when none), as the painter holds them after everything queued so far.
	async readRGBA8(box = null) { return (await this.remote.read(this, {box})).pixels; }
	// The painted box and its pixels at this point of the order; `box` and `pixels` are null for an empty surface.
	readBounds(options = {}) { return this.remote.read(this, {bounds: true, ...options}); }
	drop() { this.remote.dropSurface(this); }
}

export class RemotePaintBrush {
	constructor(remote, id, definition) {
		this.remote = remote; this.id = id; this.gone = false;
		this.wet = definition.wet ? {...definition.wet} : null;
		this.rapier = definition.rapier ? {...definition.rapier} : null;
		this.base = definition.settings.map(row => row.base);
		this.loadFuel = null;
	}
	getBaseValue(name) { return this.base[SETTING_AT[name]]; }
	_command(method, args) { this.remote._enqueue({wire: {target: 'brush', id: this.id, method, args}, surface: null, mutates: false}); }
	seed(value) { this._command('seed', [value]); }
	setColor(r, g, b) { this._command('setColor', [r, g, b]); }
	setBaseValue(name, value) { this.base[SETTING_AT[name]] = value; this._command('setBaseValue', [name, value]); }
	// The held head angle (degrees, or null to turn with the hand) and whether the stroke erases with its own head: the engine's, in the painter.
	setHead(held, erasing = false) { this._command('setHead', [held, !!erasing]); }
	reset() { this._command('reset', []); }
	newStroke() { this._command('newStroke', []); }
	rebase(dx, dy) { if (dx || dy) this._command('rebase', [dx, dy]); }
	strokeTo(surface, x, y, pressure, xtilt = 0, ytilt = 0, dtime = .001, viewzoom = 1, viewrotation = 0, barrel = 0) {
		if (surface.gone) return;
		surface.pending++;
		this.remote._enqueue({wire: {target: 'stroke', surfaceId: surface.id, brushId: this.id, args: [x, y, pressure, xtilt, ytilt, dtime, viewzoom, viewrotation, barrel]}, surface, mutates: true, brush: this});
	}
	drop() { this.remote.dropBrush(this); }
}

// `client` speaks draw/paint-worker.mjs's protocol: the real worker's, or createLocalPaintClient's. One remote per
// client; a failure of either is the remote's (every pending promise rejects, nothing is sent again).
export function createPaintRemote(client, {onFailure = null, frame = schedule} = {}) {
	let serial = 0, flying = 0, wanted = false, failure = null;
	const surfaces = new Map(), brushes = new Map();
	const remote = {
		client, _queue: [], _tokens: 0, _tickets: new Set(),
		get failure() { return failure; },
		get idle() { return !remote._queue.length && !flying && !failure; },
		get inFlight() { return flying; },
		surface(width, height, options = {}) {
			if (failure) throw failure;
			const id = ++serial, surface = new RemotePaintSurface(remote, id, width, height);
			surfaces.set(id, surface);
			remote.flush().catch(() => {});
			client.request('create', {surfaceId: id, width, height, options}).then(reply => remote._state(reply), remote._fail);
			return surface;
		},
		brush(definition) {
			if (failure) throw failure;
			const id = ++serial, brush = new RemotePaintBrush(remote, id, definition);
			brushes.set(id, brush);
			remote.flush().catch(() => {});
			client.request('brush', {brushId: id, definition}).catch(remote._fail);
			return brush;
		},
		_enqueue(entry) {
			if (failure) throw failure;
			remote._queue.push(entry);
			if (entry.reject) remote._tickets.add(entry);
			remote.requestFrame();
		},
		requestFrame() {
			if (wanted || failure) return;
			wanted = true;
			frame(() => { wanted = false; if (!failure && !flying && remote._queue.length) remote.flush().catch(() => {}); });
		},
		// Sends everything queued, in order, without waiting for the answer.
		flush() {
			if (failure) return Promise.reject(failure);
			const sent = [];
			while (remote._queue.length) {
				const entries = remote._queue.splice(0, PAINT_BATCH_LIMIT), transfer = [];
				for (const entry of entries) if (entry.transfer) transfer.push(entry.transfer);
				sent.push(remote._send(entries, {}, transfer));
			}
			return Promise.all(sent);
		},
		_send(entries, extra, transfer = []) {
			flying++;
			let completed = 0;
			const apply = (reply, final = false) => {
				const end = reply.completed;
				if (!Number.isSafeInteger(end) || end < completed || end > entries.length || (final && end !== entries.length)) {
					throw remote._fail(new Error('The painter acknowledged a different command prefix'));
				}
				remote._reply(entries.slice(completed, end), reply);
				completed = end;
			};
			const request = {commands: entries.map(entry => entry.wire), ...extra};
			return client.request('batch', request, transfer, reply => apply(reply)).then(reply => {
				flying--;
				apply(reply, true);
				if (remote._queue.length) remote.requestFrame();
				return reply;
			}, error => { flying--; throw remote._fail(error); });
		},
		_reply(entries, reply) {
			let at = 0;
			for (const entry of entries) {
				if (entry.surface) { entry.surface.pending--; if (entry.structural) entry.surface.structural--; }
				if (entry.wire.target === 'surface') { const value = reply.values[at++]; remote._tickets.delete(entry); entry.settle?.(value); }
			}
			for (const state of reply.surfaces || []) remote._state(state);
			for (const [id, stats] of Object.entries(reply.brushes || {})) { const brush = brushes.get(+id); if (brush) brush.loadFuel = stats.loadFuel ?? null; }
		},
		_state(state) {
			const surface = surfaces.get(state?.surfaceId);
			if (!surface || surface.gone) return;
			surface.meta = state.meta;
			if (!surface.structural) {
				if (surface.width !== state.meta.width || surface.height !== state.meta.height || surface.toothOX !== state.meta.toothOX || surface.toothOY !== state.meta.toothOY) {
					remote._fail(new Error('The painter and the page disagree about a surface')); return;
				}
			}
			surface.display?.(state);
		},
		// Every command queued so far has run, and each surface's mirror is the painter's. One ordered round trip.
		sync(surface = null) {
			if (failure) return Promise.reject(failure);
			remote.flush().catch(() => {});
			// A retiring layer can still owe its existing barrier after an async readout.
			// Its queued work and drop remain ordered, but asking the painter for that
			// retired identity would poison the replacement surface. The barrier still runs.
			return remote._send([], surface && !surface.gone ? {include: [surface.id]} : {});
		},
		async read(surface, request = {}) {
			const {signal, ...wire} = request;
			const live = () => {
				if (failure) throw failure;
				checkByteAbort(signal);
			};
			if (surface.gone || surfaces.get(surface.id) !== surface) throw new Error('The paint surface is no longer live');
			// A read admitted before drop owns its ordered snapshot. Dropping blocks NEW reads,
			// not custody already in flight (a cap sheet can retire while its digest yields).
			live(); remote.flush().catch(() => {});
			let reply;
			try { reply = await client.request('read', {surfaceId: surface.id, ...wire}); }
			catch (error) { throw remote._fail(error); }
			live();
			let verified = false;
			if (reply.pixels && request.verify !== false) {
				verified = await paintDigestMatches(reply.pixels.data, reply.digest, {signal});
				live();
				if (!verified) throw remote._fail(new Error('The painter\'s readout does not match its digest'));
			}
			// Hashing may yield while a later ordered reply updates the mirror. Return this read's
			// snapshot, but never rewind the mirror or publish metadata from a refused read.
			if (!surface.gone && surfaces.get(surface.id) === surface && reply.meta && reply.meta.revision >= surface.meta.revision) surface.meta = {...surface.meta, ...reply.meta};
			return {...reply, verified};
		},
		// A small picture of a brush (a glyph, the Dip's sample): the painter paints it on a scratch sheet of its own.
		async preview(request) {
			if (failure) throw failure;
			try { return await client.request('preview', request); } catch (error) { throw remote._fail(error); }
		},
		// The footprint a head would lay (for the outline): the painter holds the engine, the page only draws what it is told.
		async footprint(request) {
			if (failure) throw failure;
			try { return await client.request('footprint', request); } catch (error) { throw remote._fail(error); }
		},
		dropSurface(surface) {
			if (surface.gone) return;
			surface.gone = true; surface.display = null; surfaces.delete(surface.id);
			if (failure) return;
			remote.flush().catch(() => {});
			client.request('drop', {surfaceIds: [surface.id]}).catch(remote._fail);
		},
		dropBrush(brush) {
			if (brush.gone) return;
			brush.gone = true; brushes.delete(brush.id);
			if (failure) return;
			remote.flush().catch(() => {});
			client.request('drop', {brushIds: [brush.id]}).catch(remote._fail);
		},
		_fail(error) {
			const wrapped = error instanceof Error ? error : new Error(String(error));
			if (failure) return failure;
			failure = wrapped;
			remote._queue.length = 0;
			for (const surface of surfaces.values()) surface.failure = wrapped;
			for (const entry of remote._tickets) entry.reject(wrapped);
			remote._tickets.clear();
			try { onFailure?.(wrapped); } catch (_) {}
			return wrapped;
		},
		close() { remote._fail(new Error('Paint remote is closed')); return client.close?.(); },
	};
	return remote;
}
