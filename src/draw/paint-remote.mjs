// SPDX-License-Identifier: AGPL-3.0-only
import {PAINT_SETTINGS} from './paint.mjs';
import {sha256Yielding, checkByteAbort} from '../notes/integrity.mjs';

const SETTING_AT = Object.fromEntries(PAINT_SETTINGS.map((row, i) => [row[0], i]));
export const PAINT_BATCH_LIMIT = 8192;
export async function paintDigestMatches(data, digest, options = {}) {
	if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) || !ArrayBuffer.isView(data)) return false;
	const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return await sha256Yielding(bytes, options) === digest;
}
const schedule = fn => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16);
const paintReplaySession = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
let paintRemoteIdentity = 0;

export class RemotePaintSurface {
	constructor(remote, id, width, height, options = {}) {
		this.remote = remote; this.id = id;
		this.width = width; this.height = height; this.toothOX = 0; this.toothOY = 0; this.scale = options.mode==='water'?(options.pixelScale??3)/3:1;
		this.meta = {width, height, revision: 0, bounds: null, growBox: undefined, toothOX: 0, toothOY: 0, wetState: false, wet: false, _wetWork: false, wetPending: 0, opStats: null};
		this.pending = 0; this.structural = 0; this.failure = null; this.display = null; this.gone = false;
		this.options = structuredClone(options); this.importOffset = [0, 0]; this.replay = null; this.replayQueue = []; this.gravity = [0, 0]; this.paper = null;
		this.sheetId = remote._identity + '-' + id;
	}
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
		if (this.gone) return {promise: ticket ? Promise.resolve(false) : null};
		const entry = {wire, surface: this, mutates, structural, transfer};
		if (mutates) { this.pending++; if (structural) this.structural++; }
		else entry.surface = null;
		if (ticket) entry.promise = new Promise((resolve, reject) => { entry.settle = resolve; entry.reject = reject; });
		this.remote._enqueue(entry);
		return entry;
	}
	tilt(gx, gy) {
		this.gravity = [gx, gy];
		const queue = this.remote._queue, last = queue[queue.length - 1];
		if (last && last.wire.method === 'tilt' && last.wire.id === this.id) { last.wire.args = [gx, gy]; if (last.replayCommand) last.replayCommand.args = [gx, gy]; return; }
		this._push({target: 'surface', id: this.id, method: 'tilt', args: [gx, gy]}, {mutates: this.options.mode !== 'water'});
	}
	set(name, value) {
		if (name === 'toothOX') this.toothOX = value; else if (name === 'toothOY') this.toothOY = value; else if (name === 'scale') this.scale = value; else if (name === 'paper') this.paper = value;
		this._push({target: 'surface', id: this.id, method: 'set', args: [name, value]}, {structural: name === 'toothOX' || name === 'toothOY'});
	}
	settleWet() { this._push({target: 'surface', id: this.id, method: 'settleWet', args: []}); }
	finishWetWork() { this._push({target: 'surface', id: this.id, method: '_finishWetWork', args: []}); }
	dryWet(feed = 8, slice = 8) { return this._push({target: 'surface', id: this.id, method: 'dryWet', args: [feed, slice]}, {ticket: true}).promise; }
	advanceWet(milliseconds) { return this._push({target: 'surface', id: this.id, method: 'advanceWet', args: [milliseconds]}, {ticket: true}).promise; }
	fromRGBA8(data, width, height, x = 0, y = 0) {
		this.importOffset = [x, y];
		const buffer = data.buffer;
		this._push({target: 'surface', id: this.id, method: 'fromRGBA8', args: [data, width, height, x, y]}, {transfer: buffer instanceof ArrayBuffer && data.byteOffset === 0 && data.byteLength === buffer.byteLength ? buffer : null});
	}
	fromWaterMaterial(replay,session) {
		const work=this._push({target:'surface',id:this.id,method:'fromWaterMaterial',args:[structuredClone(replay),session,this.importOffset.slice()]},{structural:true,ticket:true}).promise;
		this.materialReady=work;
		work.then(()=>{if(this.materialReady===work)this.materialReady=null;},()=>{});
		this.remote.flush().catch(()=>{});return work;
	}
	grow(left = 0, top = 0, right = 0, bottom = 0) {
		left = Math.max(0, Math.ceil(left)); top = Math.max(0, Math.ceil(top)); right = Math.max(0, Math.ceil(right)); bottom = Math.max(0, Math.ceil(bottom));
		if (!(left || top || right || bottom)) return {dx: 0, dy: 0};
		this.width += left + right; this.height += top + bottom; this.toothOX -= left; this.toothOY -= top;
		if(this.options.mode==='water')this.importOffset=[this.importOffset[0]+left,this.importOffset[1]+top];
		this._push({target: 'surface', id: this.id, method: 'grow', args: [left, top, right, bottom]}, {structural: true});
		return {dx: left, dy: top};
	}
	beginStroke({record = false} = {}) {
		const token = {id: ++this.remote._tokens, width: this.width, height: this.height, toothOX: this.toothOX, toothOY: this.toothOY, importOffset:this.importOffset.slice()};
		if(this.options.mode==='water')this.waterCheckpoint=token;
		if (this.replay) {
			const box = this.bounds();
			if (box) this.replay.crop = [box.x0, box.y0, box.x1, box.y1];
			this.replayQueue.push(this.replay); this.replay = null;
		}
		if (record) this.replay = {id: this.sheetId + '-' + token.id, actor: 'human',
			sheet: {id: this.sheetId, width: this.width, height: this.height, options: structuredClone(this.options), offset: this.importOffset.slice(), scale: this.scale, toothOX: this.toothOX, toothOY: this.toothOY, paper: structuredClone(this.paper)},
			brushes: [], commands: [{target: 'surface', id: this.id, method: 'tilt', args: this.gravity.slice()}]};
		this._push({target: 'surface', id: this.id, method: 'beginStroke', args: [token.id]}, {mutates: false});
		return token;
	}
	endStroke(token, cancel = false) {
		if (!token) return false;
		if (cancel) { this.width = token.width; this.height = token.height; this.toothOX = token.toothOX; this.toothOY = token.toothOY; this.replay = null; }
		if(cancel && this.options.mode==='water')this.importOffset=token.importOffset.slice();
		this._push({target: 'surface', id: this.id, method: 'endStroke', args: [token.id, cancel === true]}, {structural: cancel === true});
		return true;
	}
	peekReplay() { return [...this.replayQueue, ...(this.replay ? [this.replay] : [])]; }
	takeReplay() { const records = this.peekReplay(); this.replay = null; this.replayQueue = []; return records.length ? records : null; }
	restoreReplay(records) {
		const held = new Set(this.peekReplay().map(record => record.id));
		this.replayQueue.unshift(...(records || []).filter(record => !held.has(record.id)));
	}
	sync(options) { return this.remote.sync(this, options); }
	_receiveDisplay(reply) {
		const display=reply.display;
		if(!this.gone&&this.display&&(!display||display.generation===this.displayGeneration)) { this.display(reply); return; }
		if(display?.bitmap) { display.bitmap.close(); this.adoptDisplay(display.canvasGeneration,display.frame,false); }
	}
	bindDisplay(canvas, shownGeneration = 0) {
		if(this.gone)throw new Error('The painting display is no longer live');
		const generation=this.displayGeneration=(this.displayGeneration||0)+1;
		this.remote.flush().catch(()=>{});
		return this.remote.client.request('bindDisplay',{surfaceId:this.id,generation,shownGeneration,canvas},[canvas]).then(reply=>{
			this._receiveDisplay(reply);
		},error=>{
			if(error.recoverable&&(this.gone||this.displayGeneration!==generation))return;
			throw this.remote._fail(error);
		});
	}
	repaintDisplay() {
		if(this.gone)return Promise.resolve();
		const generation=++this.displayGeneration;
		this.remote.flush().catch(()=>{});
		return this.remote.client.request('display',{surfaceId:this.id,generation}).then(reply=>{
			if(!this.gone&&this.displayGeneration===generation)this.remote._state(reply);
			else this._receiveDisplay(reply);
		},error=>{throw this.remote._fail(error);});
	}
	adoptDisplay(canvasGeneration,frame=null,accepted=true) {
		if(this.gone||frame===null&&this.displayAdopted===canvasGeneration)return;
		if(frame===null)this.displayAdopted=canvasGeneration;
		this.remote.client.request('adoptDisplay',{surfaceId:this.id,canvasGeneration,...(frame===null?{}:{frame,accepted})}).then(reply=>{
			if(reply.meta)this._receiveDisplay(reply);
		},error=>{this.remote._fail(error);});
	}
	async readRGBA8(box = null) { return (await this.remote.read(this, {box})).pixels; }
	readBounds(options = {}) { return this.remote.read(this, {bounds: true, ...options}); }
	waterSheet() { return {id:this.sheetId,width:this.width,height:this.height,offset:this.importOffset.slice(),scale:this.scale,toothOX:this.toothOX,toothOY:this.toothOY,options:{...structuredClone(this.options),mode:'water',paper:this.options.paper || 'cold-press'}}; }
	applyWater(action) {
		const data=structuredClone(action),dx=this.toothOX/(this.scale*3),dy=this.toothOY/(this.scale*3),point=([x,y,...rest])=>[x+dx,y+dy,...rest];
		if(data.paths)data.paths=data.paths.map(path=>path.map(point));if(data.at)data.at=point(data.at);
		const work=this._push({target:'surface',id:this.id,method:'applyWater',args:[data]},{ticket:true}).promise;
		this.remote.flush().catch(()=>{});return work;
	}
	readMaterial(box=null) { return this.remote.read(this,{box,snapshot:true}); }
	samplePigment(x,y) { return this.remote.read(this,{sample:[x+this.toothOX/(this.scale*3),y+this.toothOY/(this.scale*3)],verify:false}).then(reply=>reply.sample || reply.pigment || null); }
	drop() { this.remote.dropSurface(this); }
}

export class RemotePaintBrush {
	constructor(remote, id, definition) {
		this.remote = remote; this.id = id; this.gone = false;
		this.wet = definition.wet ? {...definition.wet} : null;
		this.rapier = definition.rapier ? {...definition.rapier} : null;
		this.base = definition.settings.map(row => row.base);
		this.loadFuel = null;
		this.definition = structuredClone(Object.fromEntries(['settings', 'rapier', 'wet', 'wetInputs', 'tool', 'water'].filter(key => definition[key] != null).map(key => [key, definition[key]])));
		this.replaySetup = [];
	}
	getBaseValue(name) { return this.base[SETTING_AT[name]]; }
	_command(method, args) {
		const wire = {target: 'brush', id: this.id, method, args};
		if (method === 'seed') this.replaySetup = [];
		this.replaySetup.push(structuredClone(wire));
		this.remote._enqueue({wire, surface: null, mutates: false});
	}
	seed(value) { this._command('seed', [value]); }
	setColor(r, g, b) { this._command('setColor', [r, g, b]); }
	setPigment(pigment) { this._command('setPigment',[structuredClone(pigment)]); }
	setBaseValue(name, value) { this.base[SETTING_AT[name]] = value; this._command('setBaseValue', [name, value]); }
	setHead(held, erasing = false) { this._command('setHead', [held, !!erasing]); }
	reset() { this._command('reset', []); }
	newStroke() { this._command('newStroke', []); }
	rebase(dx, dy) { if (dx || dy) this._command('rebase', [dx, dy]); }
	strokeTo(surface, x, y, pressure, xtilt = 0, ytilt = 0, dtime = .001, viewzoom = 1, viewrotation = 0, barrel = 0, inputKind = 'script', inputTime = null) {
		if (surface.gone) return;
		surface.pending++;
		const args = [x, y, pressure, xtilt, ytilt, dtime, viewzoom, viewrotation, barrel];
		if (surface.options.mode === 'water') args.push(inputKind,inputTime);
		this.remote._enqueue({wire: {target: 'stroke', surfaceId: surface.id, brushId: this.id, args}, surface, mutates: true, brush: this});
	}
	drop() { this.remote.dropBrush(this); }
}

export function createPaintRemote(client, {onFailure = null, frame = schedule} = {}) {
	let serial = 0, flying = 0, wanted = false, frameReady = false, failure = null;
	const surfaces = new Map(), brushes = new Map();
	const remote = {
		client, _queue: [], _tokens: 0, _tickets: new Set(), _identity: paintReplaySession + '-' + ++paintRemoteIdentity,
		get failure() { return failure; },
		get idle() { return !remote._queue.length && !flying && !failure; },
		get inFlight() { return flying; },
		surface(width, height, options = {}, waterMaterial = null) {
			if (failure) throw failure;
			if (waterMaterial && options.mode !== 'water') throw new Error('Only Water can restore native material');
			const initial = waterMaterial ? structuredClone(waterMaterial) : null;
			if (initial && (!Array.isArray(initial.offset) || initial.offset.length !== 2 || !initial.offset.every(Number.isSafeInteger))) throw new Error('The Water material offset is not valid');
			const id = ++serial, surface = new RemotePaintSurface(remote, id, width, height, options);
			surfaces.set(id, surface);
			remote.flush().catch(() => {});
			if (initial) {
				surface.importOffset = initial.offset.slice(); surface.pending++; surface.structural++;
				const work = client.request('create', {surfaceId: id, width, height, options, waterMaterial:initial}).then(reply => {
					surface.pending--; surface.structural--;
					if (surface.gone || surfaces.get(id) !== surface) { reply.display?.bitmap?.close(); return false; }
					if (reply.meta?.width !== width || reply.meta?.height !== height) { reply.display?.bitmap?.close(); throw remote._fail(new Error('The restored Water material does not fit its sheet')); }
					surface.toothOX += reply.meta.toothOX; surface.toothOY += reply.meta.toothOY;
					remote._state(reply); if (failure) throw failure; return true;
				}, error => { surface.pending--; surface.structural--; if (surface.gone && error.recoverable) return false; throw remote._fail(error); });
				surface.materialReady = work;
				work.then(() => { if (surface.materialReady === work) surface.materialReady = null; }, () => {});
			} else client.request('create', {surfaceId: id, width, height, options}).then(reply => remote._state(reply), remote._fail);
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
			const wire = entry.wire;
			if (wire.target === 'brush') {
				for (const surface of surfaces.values()) if (surface.replay?.brushes.some(row => row.id === wire.id)) surface.replay.commands.push(structuredClone(wire));
			} else if (entry.surface?.replay) {
				const record = entry.surface.replay;
				if (wire.target === 'stroke') {
					if (!record.brushes.some(row => row.id === entry.brush.id)) {
						record.brushes.push({id: entry.brush.id, definition: structuredClone(entry.brush.definition)});
						record.commands.push(...structuredClone(entry.brush.replaySetup));
					}
					record.commands.push(structuredClone(wire));
				} else if (!['beginStroke', 'endStroke', 'fromRGBA8'].includes(wire.method)) {
					entry.replayRecord = record; entry.replayCommand = structuredClone(wire);
					record.commands.push(entry.replayCommand);
					if (wire.method === 'dryWet') wire.record = true;
				}
			}
			remote._queue.push(entry);
			if (entry.reject) remote._tickets.add(entry);
			remote.requestFrame();
		},
		requestFrame() {
			if (wanted || failure) return;
			wanted = true;
			frame(() => { wanted = false; frameReady = true; if (!failure && !flying && remote._queue.length) remote.flush().catch(() => {}); });
		},
		flush() {
			if (failure) return Promise.reject(failure);
			frameReady = false;
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
				if (remote._queue.length) {
					if (frameReady && !flying) remote.flush().catch(() => {});
					else remote.requestFrame();
				}
				return reply;
			}, error => {
				flying--;
				if(error.recoverable) {
					for(const entry of entries.slice(completed)) {if(entry.surface){entry.surface.pending--;if(entry.structural)entry.surface.structural--;}remote._tickets.delete(entry);entry.reject?.(error);}
					for(const surface of surfaces.values())if(surface.waterCheckpoint){const token=surface.waterCheckpoint;surface.width=token.width;surface.height=token.height;surface.toothOX=token.toothOX;surface.toothOY=token.toothOY;surface.importOffset=token.importOffset.slice();surface.replay=null;}
					throw error;
				}
				throw remote._fail(error);
			});
		},
		_reply(entries, reply) {
			let at = 0;
			for (const entry of entries) {
				if (entry.surface) { entry.surface.pending--; if (entry.structural) entry.surface.structural--; }
				if (entry.wire.target === 'surface') {
					if(entry.wire.method==='endStroke' && entry.surface?.waterCheckpoint?.id===entry.wire.args[0])entry.surface.waterCheckpoint=null;
					const value = reply.values[at], work = reply.replayWork?.[at]; at++;
					if(entry.wire.method==='fromWaterMaterial' && value && entry.surface) {
						entry.surface.width=value.width;entry.surface.height=value.height;entry.surface.toothOX=value.toothOX;entry.surface.toothOY=value.toothOY;
					}
					if (entry.replayRecord && work) {
						const commands = entry.replayRecord.commands, position = commands.indexOf(entry.replayCommand);
						if (position >= 0) commands.splice(position, 1, ...work);
					}
					remote._tickets.delete(entry); entry.settle?.(value);
				}
			}
			for (const state of reply.surfaces || []) remote._state(state);
			for (const [id, stats] of Object.entries(reply.brushes || {})) { const brush = brushes.get(+id); if (brush) brush.loadFuel = stats.loadFuel ?? null; }
		},
		_state(state) {
			const surface = surfaces.get(state?.surfaceId);
			if (!surface || surface.gone) { state?.display?.bitmap?.close(); return; }
			surface.meta = state.meta;
			if (!surface.structural) {
				if (surface.width !== state.meta.width || surface.height !== state.meta.height || surface.toothOX !== state.meta.toothOX || surface.toothOY !== state.meta.toothOY) {
					state?.display?.bitmap?.close(); remote._fail(new Error('The painter and the page disagree about a surface')); return;
				}
			}
			if (surface.options.mode !== 'water' && state.materialOnly === true) return;
			surface._receiveDisplay(state);
		},
		sync(surface = null, options = {}) {
			if (failure) return Promise.reject(failure);
			remote.flush().catch(() => {});
			const extra = surface && !surface.gone ? {include: [surface.id]} : {};
			if (surface?.options.mode !== 'water' && options.materialOnly === true) extra.materialOnly = true;
			return Promise.all([remote._send([], extra),surface?.materialReady]).then(([reply])=>reply);
		},
		async read(surface, request = {}) {
			const {signal, ...wire} = request;
			const waterSheet=surface.options.mode==='water'?surface.waterSheet():null;
			const live = () => {
				if (failure) throw failure;
				checkByteAbort(signal);
			};
			if (surface.gone || surfaces.get(surface.id) !== surface) throw new Error('The paint surface is no longer live');
			live(); remote.flush().catch(() => {});
			let reply;
			try { [reply] = await Promise.all([client.request('read', {surfaceId: surface.id, ...wire, ...(waterSheet && wire.waterCheckpoint ? {waterSheet} : {})}),surface.materialReady]); }
			catch (error) { throw error.recoverable ? error : remote._fail(error); }
			live();
			let verified = false;
			if (reply.pixels && request.verify !== false) {
				verified = await paintDigestMatches(reply.pixels.data, reply.digest, {signal});
				live();
				if (!verified) throw remote._fail(new Error('The painter\'s readout does not match its digest'));
			}
			if (!surface.gone && surfaces.get(surface.id) === surface && reply.meta && reply.meta.revision >= surface.meta.revision) surface.meta = {...surface.meta, ...reply.meta};
			return {...reply, verified, ...(waterSheet?{waterSheet}: {})};
		},
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
	client.watchFailure?.(remote._fail);
	client.onDisplay = state => remote._state(state);
	return remote;
}
