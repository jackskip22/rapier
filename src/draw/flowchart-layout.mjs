// SPDX-License-Identifier: MIT

const FLOWCHART_LAYOUT_LIMITS = Object.freeze({
	figures: 1024,
	obstacles: 512,
	labelChars: 4096,
	textChars: 262144,
	searchStates: 32768,
	gridCells: 65536
});

export const ROUTE_PRICE = Object.freeze({crossing: 10000, outside: 30});
const OUTSIDE_WEIGHT = ROUTE_PRICE.outside, CROSS_WEIGHT = ROUTE_PRICE.crossing;
export function outsideHullLength(path, hull) {
	let total = 0;
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1], b = path[i]; let low = 0, high = 1;
		for (const [at, delta, min, max] of [[a[0], b[0] - a[0], hull.x0, hull.x1], [a[1], b[1] - a[1], hull.y0, hull.y1]]) {
			if (Math.abs(delta) < 1e-9) { if (at < min || at > max) { high = 0; break; } }
			else { const u = (min - at) / delta, v = (max - at) / delta; low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v)); }
		}
		total += Math.hypot(b[0] - a[0], b[1] - a[1]) * (1 - Math.max(0, high - low));
	}
	return total;
}
export function planFlowchartPorts(nodes, edges, boxes, across = false, corridors = null, options = null) {
	const byId = new Map(nodes.map((node, i) => [node.id, {node, box: boxes[i]}]));
	const placed = options?.occupied || [], alternatives = new Map();
	const hull = boxes.length ? {x0: Math.min(...boxes.map(b => b.minX)), y0: Math.min(...boxes.map(b => b.minY)), x1: Math.max(...boxes.map(b => b.maxX)), y1: Math.max(...boxes.map(b => b.maxY))} : null;
	const point = (box, bind) => [box.minX + bind.ax * box.w, box.minY + bind.ay * box.h];
	const blockers = ids => {
		const ends = ids.map(id => byId.get(id)?.box).filter(Boolean), mine = new Set(ids), out = [];
		for (const [id, {box}] of byId) {
			const pad = mine.has(id) ? 0 : 12, obstacle = {minX: box.minX - pad, maxX: box.maxX + pad, minY: box.minY - pad, maxY: box.maxY + pad};
			if (pad) for (const end of ends) for (const [low, high, crossLow, crossHigh] of [['minX', 'maxX', 'minY', 'maxY'], ['minY', 'maxY', 'minX', 'maxX']]) {
				if (end[crossHigh] < box[crossLow] - pad || end[crossLow] > box[crossHigh] + pad) continue;
				if (box[high] < end[low]) obstacle[high] = Math.min(obstacle[high], (box[high] + end[low]) / 2);
				if (end[high] < box[low]) obstacle[low] = Math.max(obstacle[low], (end[high] + box[low]) / 2);
			}
			out.push(obstacle);
		}
		return out;
	};
	const hits = (path, obstacles) => {
		for (let i = 1; i < path.length; i++) {
			const a = path[i - 1], b = path[i];
			for (const obstacle of obstacles) {
				if (Math.abs(a[0] - b[0]) < 1e-7 ? a[0] > obstacle.minX + 1e-7 && a[0] < obstacle.maxX - 1e-7 && Math.max(a[1], b[1]) > obstacle.minY + 1e-7 && Math.min(a[1], b[1]) < obstacle.maxY - 1e-7
					: a[1] > obstacle.minY + 1e-7 && a[1] < obstacle.maxY - 1e-7 && Math.max(a[0], b[0]) > obstacle.minX + 1e-7 && Math.min(a[0], b[0]) < obstacle.maxX - 1e-7) return true;
			}
		}
		return false;
	};
	const crosses = (path, ids) => {
		let total = 0;
		for (const other of placed) {
			if (ids.some(id => other.ids.includes(id))) continue;
			for (let i = 1; i < path.length; i++) for (let j = 1; j < other.path.length; j++) {
				const a = path[i - 1], b = path[i], c = other.path[j - 1], d = other.path[j];
				const between = (x, p, q) => x > Math.min(p, q) && x < Math.max(p, q);
				if (a[0] === b[0] && c[1] === d[1] && between(a[0], c[0], d[0]) && between(c[1], a[1], b[1]) ||
					a[1] === b[1] && c[0] === d[0] && between(a[1], c[1], d[1]) && between(c[0], a[0], b[0])) total++;
				if (options?.detail && (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(c[0] - d[0]) < 1e-7 && Math.abs(a[0] - c[0]) < 1e-7 || Math.abs(a[1] - b[1]) < 1e-7 && Math.abs(c[1] - d[1]) < 1e-7 && Math.abs(a[1] - c[1]) < 1e-7)) {
					const axis = Math.abs(a[0] - b[0]) < 1e-7 ? 1 : 0;
					total += Math.max(0, Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])));
				}
			}
		}
		return total;
	};
	for (const edge of edges) {
		const from = byId.get(edge.bind?.start?.to), to = byId.get(edge.bind?.end?.to);
		if (!from || !to || !['rect', 'text'].includes(from.node.shape.recognized) || !['rect', 'text'].includes(to.node.shape.recognized)) continue;
		const a = from.box, b = to.box, ids = [from.node.id, to.node.id];
		const candidates = [], obstacles = blockers(ids), ax = (a.minX + a.maxX) / 2, ay = (a.minY + a.maxY) / 2, bx = (b.minX + b.maxX) / 2, by = (b.minY + b.maxY) / 2;
		const pokesOut = (box, port) => hull && (port.ax === 0 && box.minX < hull.x0 + 28 || port.ax === 1 && box.maxX > hull.x1 - 28 || port.ay === 0 && box.minY < hull.y0 + 28 || port.ay === 1 && box.maxY > hull.y1 - 28);
		let bestCost = Infinity;
		const add = (start, end, corners = []) => {
			if (from !== to && (pokesOut(a, start) || pokesOut(b, end))) return;
			const first = point(a, start), last = point(b, end), path = [first, ...corners, last];
			const outside = hull ? outsideHullLength(path, hull) : 0;
			if (from !== to && outside > 1e-6) return;
			let length = 0;
			for (let i = 1; i < path.length; i++) length += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
			const bend = corners.length * 1000 + length / 100;
			if (bend >= bestCost) return;
			if (hits(path, obstacles)) return;
			const cost = crosses(path, ids) * CROSS_WEIGHT + bend + outside * OUTSIDE_WEIGHT;
			if (cost < bestCost) bestCost = cost;
			candidates.push({start, end, path, cost});
		};
		if (from === to) {
			for (const vertical of [true, false]) for (const side of [0, 1]) {
				const start = vertical ? {ax: side, ay: .2} : {ax: .2, ay: side}, end = vertical ? {ax: side, ay: .8} : {ax: .8, ay: side};
				const first = point(a, start), last = point(a, end), axis = vertical ? 0 : 1, at = first[axis] + (side ? 32 : -32);
				add(start, end, vertical ? [[at, first[1]], [at, last[1]]] : [[first[0], at], [last[0], at]]);
			}
			alternatives.set(edge, candidates.sort((a, b) => a.cost - b.cost));
			continue;
		}
		const parallel = edges.filter(other => other.bind?.start?.to === ids[0] && other.bind?.end?.to === ids[1] || other.bind?.start?.to === ids[1] && other.bind?.end?.to === ids[0]);
		const offset = (parallel.indexOf(edge) - (parallel.length - 1) / 2) * 8;
		for (const vertical of [true, false]) {
			const low = Math.max(vertical ? a.minX : a.minY, vertical ? b.minX : b.minY) + 8;
			const high = Math.min(vertical ? a.maxX : a.maxY, vertical ? b.maxX : b.maxY) - 8;
			const separated = vertical ? a.maxY < b.minY || b.maxY < a.minY : a.maxX < b.minX || b.maxX < a.minX;
			if (low > high || !separated) continue;
			for (const at of new Set([Math.max(low, Math.min(high, (vertical ? bx : by) + offset)), low, high, (low + high) / 2])) {
			add(vertical ? {ax: (at - a.minX) / a.w, ay: by > ay ? 1 : 0} : {ax: bx > ax ? 1 : 0, ay: (at - a.minY) / a.h},
				vertical ? {ax: (at - b.minX) / b.w, ay: by > ay ? 0 : 1} : {ax: bx > ax ? 0 : 1, ay: (at - b.minY) / b.h});
			}
		}
		if ((bx > a.maxX + 16 || bx < a.minX - 16) && (ay < b.minY - 16 || ay > b.maxY + 16))
			add({ax: bx > ax ? 1 : 0, ay: .5}, {ax: .5, ay: ay < by ? 0 : 1}, [[bx, ay]]);
		if ((by > a.maxY + 16 || by < a.minY - 16) && (ax < b.minX - 16 || ax > b.maxX + 16))
			add({ax: .5, ay: by > ay ? 1 : 0}, {ax: ax < bx ? 0 : 1, ay: .5}, [[ax, by]]);
		for (const vertical of [true, false]) for (const side of [0, 1]) {
			const sign = side ? 1 : -1;
			const first = vertical ? [side ? a.maxX : a.minX, ay] : [ax, side ? a.maxY : a.minY];
			const last = vertical ? [side ? b.maxX : b.minX, by] : [bx, side ? b.maxY : b.minY];
			const axis = vertical ? 0 : 1;
			const outside = side ? Math.max(first[axis], last[axis]) : Math.min(first[axis], last[axis]);
			const tracks = [outside + sign * 24];
			for (const [id, {box}] of byId) if (!ids.includes(id)) {
				const at = vertical ? side ? box.maxX : box.minX : side ? box.maxY : box.minY;
				if (sign * (at - outside) >= 0) tracks.push(at + sign * 24);
			}
			for (const at of tracks) add(vertical ? {ax: side, ay: .5} : {ax: .5, ay: side},
				vertical ? {ax: side, ay: .5} : {ax: .5, ay: side},
				vertical ? [[at, ay], [at, by]] : [[ax, at], [bx, at]]);
		}
		for (const vertical of [true, false]) {
			const spans = [...byId.values()].map(({box}) => vertical ? [box.minX, box.maxX] : [box.minY, box.maxY]).sort((p, q) => p[0] - q[0]);
			const lanes = [];
			let reach = spans[0][1];
			for (const [low, high] of spans.slice(1)) {
				if (low - reach >= 34 || options?.detail && low - reach >= 22 && Math.max(vertical ? a.minX : a.minY, vertical ? b.minX : b.minY) === low && Math.min(vertical ? a.maxX : a.maxY, vertical ? b.maxX : b.maxY) === reach) lanes.push((reach + low) / 2);
				reach = Math.max(reach, high);
			}
			const near = vertical ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(ay, by), Math.max(ay, by)];
			const away = at => at < near[0] ? near[0] - at : at > near[1] ? at - near[1] : 0;
			const own = vertical === !across ? (corridors?.get(ids[0] + '>' + ids[1]) || []).map(point => point[vertical ? 0 : 1]) : [];
			for (const at of [...new Set(own), ...lanes.sort((p, q) => away(p) - away(q)).slice(0, 6)]) {
				const ends = [[a, ay, ax, by > ay ? 1 : 0], [b, by, bx, by > ay ? 0 : 1]].map(([box, along, mid, face]) => {
					const low = vertical ? box.minX : box.minY, high = vertical ? box.maxX : box.maxY, size = high - low;
					if (at > high || at < low) return {side: at > high ? 1 : 0, along};
					if (at >= low + 8 && at <= high - 8) return {face, share: (at - low) / size, mid};
					return null;
				});
				if (ends.includes(null) || ends[0].face !== undefined && ends[1].face !== undefined) continue;
				const [sa, sb] = ends, corners = [];
				const pointOf = (box, end, other) => vertical
					? end.side !== undefined ? [end.side ? box.maxX : box.minX, end.along] : [at, end.face ? box.maxY : box.minY]
					: end.side !== undefined ? [end.along, end.side ? box.maxY : box.minY] : [end.face ? box.maxX : box.minX, at];
				const first = pointOf(a, sa), last = pointOf(b, sb);
				if (sa.side !== undefined) corners.push(vertical ? [at, ay] : [ax, at]);
				if (sb.side !== undefined) corners.push(vertical ? [at, by] : [bx, at]);
				const port = (end, box) => end.side !== undefined ? (vertical ? {ax: end.side, ay: .5} : {ax: .5, ay: end.side}) : (vertical ? {ax: end.share, ay: end.face} : {ax: end.face, ay: end.share});
				add(port(sa, a), port(sb, b), corners);
			}
		}
		if (options?.detail && bestCost >= 1000) {
			const anchors = box => [0, 1].flatMap(axis => [0, 1].flatMap(side => {
				const span = axis ? box.w : box.h, share = Math.min(.25, 8 / span);
				return [share, .5, 1 - share].map(at => axis ? {ax: at, ay: side} : {ax: side, ay: at});
			}));
			const stub = (box, port) => {
				const p = point(box, port), axis = port.ax === 0 || port.ax === 1 ? 0 : 1, sign = (axis ? port.ay : port.ax) ? 1 : -1;
				let reach = 32;
				for (const {box: other} of byId.values()) if (other !== box) {
					const coordinate = p[1 - axis], low = axis ? other.minX : other.minY, high = axis ? other.maxX : other.maxY;
					const next = axis ? sign > 0 ? other.minY : other.maxY : sign > 0 ? other.minX : other.maxX, distance = (next - p[axis]) * sign;
					if (distance > 0 && coordinate > low - 12 && coordinate < high + 12) reach = Math.min(reach, distance / 2);
				}
				const q = p.slice(); q[axis] += sign * reach; return q;
			};
			for (const start of anchors(a)) for (const end of anchors(b)) {
				const first = stub(a, start), last = stub(b, end);
				for (const middle of [[first[0], last[1]], [last[0], first[1]]]) {
					const path = simplifyOrthogonalPolyline([point(a, start), first, middle, last, point(b, end)]);
					if (path.some((p, i) => i > 0 && i + 1 < path.length && (p[0] - path[i - 1][0]) * (path[i + 1][0] - p[0]) + (p[1] - path[i - 1][1]) * (path[i + 1][1] - p[1]) < -1e-7)) continue;
					add(start, end, path.slice(1, -1));
				}
			}
		}
		candidates.sort((a, b) => a.cost - b.cost);
		const distinct = new Map();
		for (const candidate of candidates) {
			const key = [candidate.start.ax, candidate.start.ay, candidate.end.ax, candidate.end.ay].map(value => value.toFixed(6)).join(':');
			if (!distinct.has(key)) distinct.set(key, candidate);
		}
		alternatives.set(edge, [...distinct.values()]);
		const best = candidates[0];
		if (best && best.cost < 40000 && !options?.keepPorts) {
			Object.assign(edge.bind.start, best.start); Object.assign(edge.bind.end, best.end);
			placed.push({ids, path: best.path});
		}
	}
	return alternatives;
}


function diagramFeedbackArcs(nodes, edges, written = null) {
	const ids = new Map(nodes.map((node, at) => [node.id, at])), n = nodes.length;
	const incoming = Array.from({length: n}, () => []), outgoing = Array.from({length: n}, () => []);
	const inDegree = new Int32Array(n), outDegree = new Int32Array(n), alive = new Uint8Array(n).fill(1);
	for (const edge of edges) {
		const from = ids.get(edge.from), to = ids.get(edge.to);
		if (from === undefined || to === undefined || from === to) continue;
		outgoing[from].push(to); incoming[to].push(from); outDegree[from]++; inDegree[to]++;
	}
	const reach = new Float64Array(n).fill(Infinity), queue = [];
	for (let at = 0; at < n; at++) if (!inDegree[at]) { reach[at] = 0; queue.push(at); }
	for (let head = 0; head < queue.length; head++) for (const to of outgoing[queue[head]]) if (reach[to] === Infinity) { reach[to] = reach[queue[head]] + 1; queue.push(to); }
	const noSource = !queue.length, rank = at => written?.get(nodes[at].id) ?? n + at;
	const left = [], right = [];
	for (let remaining = n; remaining; remaining--) {
		let sink = -1, source = -1, best = -1;
		for (let at = 0; at < n; at++) if (alive[at]) {
			if (sink < 0 && !outDegree[at]) sink = at;
			if (source < 0 && !inDegree[at]) source = at;
			if (best < 0 || noSource && rank(at) < rank(best)) best = at;
			else if (!noSource && (outDegree[at] - inDegree[at] > outDegree[best] - inDegree[best] || outDegree[at] - inDegree[at] === outDegree[best] - inDegree[best] && reach[at] < reach[best])) best = at;
		}
		const at = sink >= 0 ? sink : source >= 0 ? source : best;
		(sink >= 0 ? right : left).push(at); alive[at] = 0;
		for (const to of outgoing[at]) if (alive[to]) inDegree[to]--;
		for (const from of incoming[at]) if (alive[from]) outDegree[from]--;
	}
	const order = new Int32Array(n);[...left, ...right.reverse()].forEach((at, rank) => { order[at] = rank; });
	return {backward: new Set(edges.filter(edge => edge.from !== edge.to && order[ids.get(edge.from)] > order[ids.get(edge.to)])),
		selfLoops: new Set(edges.filter(edge => edge.from === edge.to))};
}

export function findFeedbackArcSet(nodes, edges, idToIdx = null, diagram = false, written = null) {
	if (diagram) return diagramFeedbackArcs(nodes, edges, written);
	const n = nodes.length;
	if (!idToIdx) {
		idToIdx = new Map();
		for (let i = 0; i < n; i++) idToIdx.set(nodes[i].id, i);
	}
	const m = edges.length;
	const head = new Int32Array(n).fill(-1);
	const toArr = new Int32Array(m);
	const nextArr = new Int32Array(m);
	const edgeIdxArr = new Int32Array(m);
	const inDeg = new Int32Array(n);
	const selfLoops = new Set();
	let eCount = 0;

	for (let i = m - 1; i >= 0; i--) {
		const e = edges[i];
		const u = idToIdx.get(e.from), v = idToIdx.get(e.to);
		if (u === undefined || v === undefined) continue;
		if (u === v) { selfLoops.add(e); continue; }
		toArr[eCount] = v;
		edgeIdxArr[eCount] = i;
		nextArr[eCount] = head[u];
		head[u] = eCount++;
		inDeg[v]++;
	}

	const state = new Uint8Array(n);
	const backward = new Set();

	const visit = u => {
		state[u] = 1;
		for (let ei = head[u]; ei !== -1; ei = nextArr[ei]) {
			const to = toArr[ei];
			if (state[to] === 1) backward.add(edges[edgeIdxArr[ei]]);
			else if (state[to] === 0) visit(to);
		}
		state[u] = 2;
	};

	for (let i = 0; i < n; i++) if (inDeg[i] === 0 && state[i] === 0) visit(i);
	for (let i = 0; i < n; i++) if (state[i] === 0) visit(i);

	return { backward, selfLoops };
}

export function assignRanksNetworkSimplex(nodes, edges, backward, options = {}) {
	const n = nodes.length;
	if (n === 0) return new Map();
	let idToIdx = options.idToIdx || null;
	if (!idToIdx) {
		idToIdx = new Map();
		for (let i = 0; i < n; i++) idToIdx.set(nodes[i].id, i);
	}
	const priorRanks = options.priorRanks || null;

	const outHead = new Int32Array(n).fill(-1);
	const inHead = new Int32Array(n).fill(-1);
	const inDeg = new Int32Array(n);
	const edgeU = [], edgeV = [], edgeW = [], outNext = [], inNext = [];

	for (let i = 0; i < edges.length; i++) {
		const e = edges[i];
		const u0 = idToIdx.get(e.from), v0 = idToIdx.get(e.to);
		if (u0 === undefined || v0 === undefined || u0 === v0) continue;
		const isBack = backward.has(e);
		const u = isBack ? v0 : u0;
		const v = isBack ? u0 : v0;
		const idx = edgeU.length;
		edgeU.push(u);
		edgeV.push(v);
		edgeW.push(isBack ? 1 : (e.weight || 2));
		outNext.push(outHead[u]);
		outHead[u] = idx;
		inNext.push(inHead[v]);
		inHead[v] = idx;
		inDeg[v]++;
	}

	const rank = new Int32Array(n);
	if (priorRanks) {
		for (let i = 0; i < n; i++) {
			const pr = priorRanks.get(nodes[i].id);
			if (Number.isInteger(pr) && pr >= 0) rank[i] = pr;
		}
	}

	const topo = new Int32Array(n);
	const remIn = new Int32Array(inDeg);
	let qHead = 0, qTail = 0;
	for (let i = 0; i < n; i++) if (remIn[i] === 0) topo[qTail++] = i;
	while (qHead < qTail) {
		const u = topo[qHead++];
		for (let ei = outHead[u]; ei !== -1; ei = outNext[ei]) {
			const v = edgeV[ei];
			if (rank[v] < rank[u] + 1) rank[v] = rank[u] + 1;
			if (--remIn[v] === 0) topo[qTail++] = v;
		}
	}
	if (qTail < n) {
		for (let i = 0; i < n; i++) if (remIn[i] > 0) topo[qTail++] = i;
	}

	if (!priorRanks) {
		for (let pass = 0; pass < 4; pass++) {
			let changed = false;
			for (let ti = n - 1; ti >= 0; ti--) {
				const u = topo[ti];
				if (outHead[u] === -1) continue;
				let minChildR = 0x3fffffff, maxParentR = -1;
				let outW = 0, inW = 0;
				for (let ei = outHead[u]; ei !== -1; ei = outNext[ei]) {
					const v = edgeV[ei];
					outW += edgeW[ei];
					if (rank[v] - 1 < minChildR) minChildR = rank[v] - 1;
				}
				for (let ei = inHead[u]; ei !== -1; ei = inNext[ei]) {
					const w = edgeU[ei];
					inW += edgeW[ei];
					if (rank[w] + 1 > maxParentR) maxParentR = rank[w] + 1;
				}
				if (inHead[u] === -1 || outW > inW) {
					const target = Math.max(maxParentR, minChildR);
					if (target > rank[u] && target <= minChildR) {
						rank[u] = target;
						changed = true;
					}
				}
			}
			if (!changed) break;
		}
	}

	let minR = 0x3fffffff;
	for (let i = 0; i < n; i++) if (rank[i] < minR) minR = rank[i];
	if (minR > 0 && minR < 0x3fffffff) {
		for (let i = 0; i < n; i++) rank[i] -= minR;
	}

	const out = new Map();
	for (let i = 0; i < n; i++) out.set(nodes[i].id, rank[i]);
	return out;
}

let _fenwick = new Int32Array(512);
function countBipartiteCrossings(lowerLen, flatPairs, pairCount) {
	if (pairCount <= 1) return 0;
	if (_fenwick.length <= lowerLen + 2) _fenwick = new Int32Array((lowerLen + 2) * 2);
	_fenwick.fill(0, 0, lowerLen + 2);
	let crossings = 0;
	for (let i = 0; i < pairCount; i++) {
		const idx = (flatPairs[i] & 0xffff) + 1;
		let sumLE = 0;
		for (let k = idx; k > 0; k -= k & -k) sumLE += _fenwick[k];
		crossings += (i - sumLE);
		for (let k = idx; k <= lowerLen; k += k & -k) _fenwick[k]++;
	}
	return crossings;
}

export function layoutLayeredGraph(nodes, edges, options = {}) {
	if (!nodes.length) return {w: 0, h: 0, backward: new Set(), selfLoops: new Set(), ranks: new Map(), order: new Map(), positions: new Map(), corridors: new Map(), crossings: 0};
	const across = !!options.across;
	const baseGap = options.gap ?? 52;
	const baseSibling = options.sibling ?? 36;
	const compact = !!options.compact;
	const groups = options.groups || [];
	const prior = options.prior || null;
	const pins = options.pins || null;

	const itemIdToIdx = new Map();
	for (let i = 0; i < nodes.length; i++) itemIdToIdx.set(nodes[i].id, i);
	const validEdges = [];
	for (let i = 0; i < edges.length; i++) {
		const e = edges[i];
		if (itemIdToIdx.has(e.from) && itemIdToIdx.has(e.to)) validEdges.push(e);
	}

	const { backward, selfLoops } = findFeedbackArcSet(nodes, validEdges, itemIdToIdx, options.flowchart === true, options.written);
	const ranks = assignRanksNetworkSimplex(nodes, validEdges, backward, { priorRanks: prior?.ranks, idToIdx: itemIdToIdx });

	const groupOf = new Map();
	for (let g = 0; g < groups.length; g++) {
		const grp = groups[g];
		for (const m of grp.members || []) groupOf.set(m, g + 1);
	}

	let maxRank = 0;
	for (const r of ranks.values()) if (r > maxRank) maxRank = r;
	const rows = Array.from({ length: maxRank + 1 }, () => []);

	const allItems = new Array(nodes.length);
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const r = ranks.get(node.id) || 0;
		if (node.x === undefined) node.x = 0;
		if (node.y === undefined) node.y = 0;
		node._idx = i;
		node._rank = r;
		node._isDummy = false;
		node._group = groupOf.get(node.id) || 0;
		allItems[i] = node;
		rows[r].push(i);
	}

	const upAdj = Array.from({ length: nodes.length }, () => []);
	const downAdj = Array.from({ length: nodes.length }, () => []);
	const dummyChains = new Map();

	for (let i = 0; i < validEdges.length; i++) {
		const edge = validEdges[i];
		if (edge.from === edge.to) continue;
		const isBack = backward.has(edge);
		const uId = isBack ? edge.to : edge.from;
		const vId = isBack ? edge.from : edge.to;
		const rU = ranks.get(uId), rV = ranks.get(vId);
		if (rU === rV) continue;
		const topId = rU < rV ? uId : vId;
		const botId = rU < rV ? vId : uId;
		const loR = Math.min(rU, rV), hiR = Math.max(rU, rV);
		let prevIdx = itemIdToIdx.get(topId);
		const botIdx = itemIdToIdx.get(botId);

		if (hiR - loR === 1) {
			downAdj[prevIdx].push(botIdx);
			upAdj[botIdx].push(prevIdx);
		} else {
			const chain = [];
			const midR = (loR + hiR) >> 1;
			const sharedGrp = allItems[prevIdx]._group === allItems[botIdx]._group ? allItems[prevIdx]._group : 0;
			for (let r = loR + 1; r < hiR; r++) {
				const dIdx = allItems.length;
				const labelText = edge.label || edge.shape?.label;
				const hasLabelHere = r === midR && !!labelText;
				const labelSpan = hasLabelHere ? Math.min(140, labelText.length * 6.5 + 24) : 0;
				const dNode = {
					id: '__d' + dIdx,
					shape: 'dummy',
					label: '',
					style: null,
					w: across ? 14 : Math.max(18, labelSpan),
					h: across ? Math.max(18, labelSpan) : 14,
					labelWidth: 0,
					x: 0,
					y: 0,
					_idx: dIdx,
					_rank: r,
					_isDummy: true,
					_group: sharedGrp
				};
				allItems.push(dNode);
				upAdj.push([prevIdx]);
				downAdj.push([]);
				downAdj[prevIdx].push(dIdx);
				rows[r].push(dIdx);
				chain.push(dNode);
				prevIdx = dIdx;
			}
			downAdj[prevIdx].push(botIdx);
			upAdj[botIdx].push(prevIdx);
			dummyChains.set(edge, chain);
		}
	}

	const totalN = allItems.length;
	const posInRow = new Int32Array(totalN);
	const initialOrd = new Int32Array(totalN);
	const weights = new Float64Array(totalN);

	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		for (let i = 0; i < row.length; i++) {
			const u = row[i];
			const pOrd = !allItems[u]._isDummy && prior?.order?.get(allItems[u].id);
			initialOrd[u] = pOrd !== undefined ? pOrd : u;
			posInRow[u] = i;
		}
	}

	const updateRowPos = row => {
		for (let i = 0; i < row.length; i++) posInRow[row[i]] = i;
	};

	let flatPairs = new Uint32Array(Math.max(256, validEdges.length * 2));
	const countAllCrossings = () => {
		let total = 0;
		for (let r = 0; r + 1 < rows.length; r++) {
			const upper = rows[r];
			let pCount = 0;
			for (let i = 0; i < upper.length; i++) {
				const u = upper[i];
				const dn = downAdj[u];
				const dLen = dn.length;
				if (dLen === 0) continue;
				if (pCount + dLen >= flatPairs.length) {
					const next = new Uint32Array((flatPairs.length + dLen) * 2);
					next.set(flatPairs);
					flatPairs = next;
				}
				if (dLen === 1) {
					flatPairs[pCount++] = posInRow[dn[0]];
				} else if (dLen === 2) {
					const p0 = posInRow[dn[0]], p1 = posInRow[dn[1]];
					flatPairs[pCount++] = p0 < p1 ? p0 : p1;
					flatPairs[pCount++] = p0 < p1 ? p1 : p0;
				} else {
					const startP = pCount;
					for (let j = 0; j < dLen; j++) flatPairs[pCount++] = posInRow[dn[j]];
					for (let a = startP + 1; a < pCount; a++) {
						const v = flatPairs[a];
						let b = a - 1;
						while (b >= startP && flatPairs[b] > v) { flatPairs[b + 1] = flatPairs[b]; b--; }
						flatPairs[b + 1] = v;
					}
				}
			}
			if (pCount > 1) {
				total += countBipartiteCrossings(rows[r + 1].length, flatPairs, pCount);
			}
		}
		return total;
	};

	const computeWeight = (u, downward) => {
		const adj = downward ? upAdj[u] : downAdj[u];
		const len = adj.length;
		if (len === 0) return posInRow[u];
		if (len === 1) return posInRow[adj[0]];
		if (len === 2) return (posInRow[adj[0]] + posInRow[adj[1]]) * 0.5;
		const tmp = [];
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const p = posInRow[adj[i]];
			tmp.push(p);
			sum += p;
		}
		tmp.sort((a, b) => a - b);
		const mid = len >> 1;
		const med = (len & 1) ? tmp[mid] : (tmp[mid - 1] + tmp[mid]) * 0.5;
		return 0.65 * (sum / len) + 0.35 * med;
	};

	const hasAnyGroups = groups.length > 0;
	const sortRow = row => {
		const len = row.length;
		if (len <= 1) return;
		if (!hasAnyGroups) {
			if (len <= 32) {
				for (let i = 1; i < len; i++) {
					const v = row[i];
					const wv = weights[v], ov = initialOrd[v];
					let j = i - 1;
					while (j >= 0) {
						const u = row[j];
						const d = weights[u] - wv;
						if (d > 0 || (d === 0 && initialOrd[u] > ov)) {
							row[j + 1] = u;
							j--;
						} else break;
					}
					row[j + 1] = v;
				}
			} else {
				row.sort((a, b) => (weights[a] - weights[b]) || (initialOrd[a] - initialOrd[b]));
			}
			for (let i = 0; i < len; i++) posInRow[row[i]] = i;
			return;
		}
		row.sort((a, b) => (weights[a] - weights[b]) || (initialOrd[a] - initialOrd[b]));
		const clusterMean = new Map();
		const clusterCount = new Map();
		for (let i = 0; i < row.length; i++) {
			const g = allItems[row[i]]._group;
			if (g) {
				clusterMean.set(g, (clusterMean.get(g) || 0) + weights[row[i]]);
				clusterCount.set(g, (clusterCount.get(g) || 0) + 1);
			}
		}
		if (clusterMean.size > 0) {
			for (const [g, sum] of clusterMean) clusterMean.set(g, sum / clusterCount.get(g));
			row.sort((a, b) => {
				const ga = allItems[a]._group, gb = allItems[b]._group;
				if (ga === gb) return (weights[a] - weights[b]) || (initialOrd[a] - initialOrd[b]);
				const wa = ga ? clusterMean.get(ga) : weights[a];
				const wb = gb ? clusterMean.get(gb) : weights[b];
				return (wa - wb) || (initialOrd[a] - initialOrd[b]);
			});
		}
		updateRowPos(row);
	};

	const transposeRows = () => {
		for (let r = 0; r < rows.length; r++) {
			const row = rows[r];
			if (row.length < 2) continue;
			for (let i = 0; i + 1 < row.length; i++) {
				const u = row[i], v = row[i + 1];
				if (allItems[u]._group !== allItems[v]._group && allItems[u]._group && allItems[v]._group) continue;
				let cBefore = 0, cAfter = 0;
				const uUp = upAdj[u], vUp = upAdj[v];
				for (let a = 0; a < uUp.length; a++) {
					const pa = posInRow[uUp[a]];
					for (let b = 0; b < vUp.length; b++) {
						const pb = posInRow[vUp[b]];
						if (pa > pb) cBefore++;
						else if (pa < pb) cAfter++;
					}
				}
				const uDn = downAdj[u], vDn = downAdj[v];
				for (let a = 0; a < uDn.length; a++) {
					const pa = posInRow[uDn[a]];
					for (let b = 0; b < vDn.length; b++) {
						const pb = posInRow[vDn[b]];
						if (pa > pb) cBefore++;
						else if (pa < pb) cAfter++;
					}
				}
				if (cAfter < cBefore) {
					row[i] = v; row[i + 1] = u;
					posInRow[v] = i; posInRow[u] = i + 1;
				}
			}
		}
	};

	let bestRows = rows.map(r => r.slice());
	let bestCross = countAllCrossings();
	const numSweeps = bestCross === 0 ? (totalN > 120 ? 0 : 1) : (totalN > 120 ? 2 : 8);
	for (let pass = 0; pass < numSweeps; pass++) {
		if ((pass & 1) === 0) {
			for (let r = 1; r < rows.length; r++) {
				const row = rows[r];
				for (let i = 0; i < row.length; i++) weights[row[i]] = computeWeight(row[i], true);
				sortRow(row);
			}
		} else {
			for (let r = rows.length - 2; r >= 0; r--) {
				const row = rows[r];
				for (let i = 0; i < row.length; i++) weights[row[i]] = computeWeight(row[i], false);
				sortRow(row);
			}
		}
		if (bestCross > 0) transposeRows();
		const curCross = countAllCrossings();
		if (curCross < bestCross) {
			bestCross = curCross;
			bestRows = rows.map(r => r.slice());
			if (bestCross === 0) break;
		}
	}
	for (let r = 0; r < rows.length; r++) {
		rows[r] = bestRows[r];
		updateRowPos(rows[r]);
	}

	const breadthArr = new Float64Array(totalN);
	const depthArr = new Float64Array(totalN);
	for (let i = 0; i < totalN; i++) {
		breadthArr[i] = across ? allItems[i].h : allItems[i].w;
		depthArr[i] = across ? allItems[i].w : allItems[i].h;
	}

	const sameRankCaption = new Map();
	for (let i = 0; i < validEdges.length; i++) {
		const e = validEdges[i];
		const labelText = e.label || e.shape?.label;
		if (labelText && ranks.get(e.from) === ranks.get(e.to)) {
			const u = itemIdToIdx.get(e.from), v = itemIdToIdx.get(e.to);
			const key = u < v ? u * 65536 + v : v * 65536 + u;
			const span = Math.ceil((labelText.length * 7 + 56) / 8) * 8;
			if (span > (sameRankCaption.get(key) || 0)) sameRankCaption.set(key, span);
		}
	}

	const getSep = (u, v) => {
		const cap = sameRankCaption.size ? (sameRankCaption.get(u < v ? u * 65536 + v : v * 65536 + u) || 0) : 0;
		const gExtra = (allItems[u]._group !== allItems[v]._group && (allItems[u]._group || allItems[v]._group)) ? 20 : 0;
		const base = (allItems[u]._isDummy || allItems[v]._isDummy) ? Math.max(16, Math.round(baseSibling * 0.55)) : baseSibling;
		return Math.max(base + gExtra, cap);
	};

	const root = new Int32Array(totalN);
	const align = new Int32Array(totalN);
	const blockX = new Float64Array(totalN);
	const visitedBlock = new Uint8Array(totalN);

	const runBK = (downward, leftToRight) => {
		for (let i = 0; i < totalN; i++) { root[i] = i; align[i] = i; blockX[i] = 0; visitedBlock[i] = 0; }
		const rStart = downward ? 1 : rows.length - 2;
		const rEnd = downward ? rows.length : -1;
		const rStep = downward ? 1 : -1;

		for (let r = rStart; r !== rEnd; r += rStep) {
			const row = rows[r];
			let lastPos = leftToRight ? -1 : 0x3fffffff;
			const iStart = leftToRight ? 0 : row.length - 1;
			const iEnd = leftToRight ? row.length : -1;
			const iStep = leftToRight ? 1 : -1;
			for (let i = iStart; i !== iEnd; i += iStep) {
				const v = row[i];
				const adj = downward ? upAdj[v] : downAdj[v];
				const d = adj.length;
				if (!d) continue;
				if (d > 1) adj.sort((a, b) => posInRow[a] - posInRow[b]);
				const m1 = (d - 1) >> 1, m2 = d >> 1;
				const med0 = leftToRight ? adj[m1] : adj[m2];
				const med1 = leftToRight ? adj[m2] : adj[m1];
				for (let m = 0; m < (m1 === m2 ? 1 : 2); m++) {
					const u = m === 0 ? med0 : med1;
					if (align[v] !== v) break;
					const uPos = posInRow[u];
					const canAlign = leftToRight ? (uPos > lastPos) : (uPos < lastPos);
					if (canAlign && align[u] === u) {
						align[u] = v;
						root[v] = root[u];
						align[v] = root[v];
						lastPos = uPos;
					}
				}
			}
		}

		const placeBlock = v => {
			if (visitedBlock[v]) return;
			visitedBlock[v] = 1;
			blockX[v] = 0;
			let w = v;
			let guard = 0;
			do {
				const r = allItems[w]._rank;
				const row = rows[r];
				const idx = posInRow[w];
				const nIdx = leftToRight ? idx - 1 : idx + 1;
				if (nIdx >= 0 && nIdx < row.length) {
					const u = row[nIdx];
					const uRoot = root[u];
					placeBlock(uRoot);
					const sep = (breadthArr[u] + breadthArr[w]) * 0.5 + getSep(leftToRight ? u : w, leftToRight ? w : u);
					if (leftToRight) {
						if (blockX[uRoot] + sep > blockX[v]) blockX[v] = blockX[uRoot] + sep;
					} else {
						if (blockX[uRoot] - sep < blockX[v]) blockX[v] = blockX[uRoot] - sep;
					}
				}
				w = align[w];
			} while (w !== v && ++guard <= rows.length + 2);
		};

		for (let i = 0; i < totalN; i++) if (root[i] === i) placeBlock(i);
		const out = new Float64Array(totalN);
		for (let i = 0; i < totalN; i++) out[i] = blockX[root[i]];
		return out;
	};

	const centrePos = new Float64Array(totalN);
	if (totalN > 120) {
		const a0 = runBK(true, true);
		const a1 = runBK(true, false);
		let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity;
		for (let i = 0; i < totalN; i++) {
			const h = breadthArr[i] * 0.5;
			if (a0[i] - h < lo0) lo0 = a0[i] - h;
			if (a0[i] + h > hi0) hi0 = a0[i] + h;
			if (a1[i] - h < lo1) lo1 = a1[i] - h;
			if (a1[i] + h > hi1) hi1 = a1[i] + h;
		}
		const shift1 = (lo0 + hi0) * 0.5 - (lo1 + hi1) * 0.5;
		for (let i = 0; i < totalN; i++) centrePos[i] = (a0[i] + a1[i] + shift1) * 0.5;
	} else {
		const a0 = runBK(true, true);
		const a1 = runBK(true, false);
		const a2 = runBK(false, true);
		const a3 = runBK(false, false);
		const assigns = [a0, a1, a2, a3];

		let minSpan = Infinity, bestIdx = 0;
		const spans = assigns.map((arr, idx) => {
			let lo = Infinity, hi = -Infinity;
			for (let i = 0; i < totalN; i++) {
				const h = breadthArr[i] * 0.5;
				if (arr[i] - h < lo) lo = arr[i] - h;
				if (arr[i] + h > hi) hi = arr[i] + h;
			}
			if (hi - lo < minSpan) { minSpan = hi - lo; bestIdx = idx; }
			return { lo, hi };
		});
		for (let k = 0; k < 4; k++) {
			const shift = (k & 1) === 0 ? (spans[bestIdx].lo - spans[k].lo) : (spans[bestIdx].hi - spans[k].hi);
			if (shift !== 0) {
				const arr = assigns[k];
				for (let i = 0; i < totalN; i++) arr[i] += shift;
			}
		}

		for (let i = 0; i < totalN; i++) {
			let x0 = a0[i], x1 = a1[i], x2 = a2[i], x3 = a3[i];
			if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
			if (x2 > x3) { const t = x2; x2 = x3; x3 = t; }
			if (x0 > x2) { const t = x0; x0 = x2; x2 = t; }
			if (x1 > x3) { const t = x1; x1 = x3; x3 = t; }
			centrePos[i] = (x1 + x2) * 0.5;
		}
	}

	const leftBuf = new Float64Array(totalN);
	const rightBuf = new Float64Array(totalN);
	const wantBuf = new Float64Array(totalN);

	const beyondDiamond = (fromIdx, toIdx) => {
		const fromNode = allItems[fromIdx];
		if ((fromNode.shape?.recognized || fromNode.shape) !== 'diamond') return 0;
		const ch = downAdj[fromIdx];
		if (ch.length < 2 || ch.length > 3) return 0;
		let rankOrder = 0;
		for (let i = 0; i < ch.length; i++) if (centrePos[ch[i]] < centrePos[toIdx]) rankOrder++;
		const reach = compact
			? Math.max(breadthArr[fromIdx] * 0.5 + 12, (breadthArr[toIdx] + baseSibling) * 0.5)
			: breadthArr[fromIdx] * 0.5 + 24 + breadthArr[toIdx] * 0.5;
		return rankOrder === 0 ? -reach : rankOrder === ch.length - 1 ? reach : 0;
	};

	const refineRow = (row, down) => {
		const len = row.length;
		if (!len) return;
		for (let i = 0; i < len; i++) {
			const u = row[i];
			const item = allItems[u];
			if (!item._isDummy && pins?.has(item.id)) {
				const p = pins.get(item.id);
				wantBuf[i] = across ? p.y : p.x;
				continue;
			}
			const links = down ? upAdj[u] : downAdj[u];
			if (!links.length) { wantBuf[i] = centrePos[u]; continue; }
			let wSum = 0, wTot = 0;
			for (let k = 0; k < links.length; k++) {
				const peer = links[k];
				const peerLinks = down ? downAdj[peer] : upAdj[peer];
				const w = (item._isDummy && allItems[peer]._isDummy) ? 8 : (links.length === 1 && peerLinks.length === 1) ? 4 : 1;
				const off = down ? beyondDiamond(peer, u) : -beyondDiamond(u, peer);
				wSum += (centrePos[peer] + off) * w;
				wTot += w;
			}
			wantBuf[i] = wSum / wTot;
		}
		for (let i = 0; i < len; i++) {
			const u = row[i];
			const minA = i > 0 ? leftBuf[i - 1] + (breadthArr[row[i - 1]] + breadthArr[u]) * 0.5 + getSep(row[i - 1], u) : -Infinity;
			leftBuf[i] = wantBuf[i] > minA ? wantBuf[i] : minA;
		}
		for (let i = len - 1; i >= 0; i--) {
			const u = row[i];
			const maxA = i + 1 < len ? rightBuf[i + 1] - (breadthArr[u] + breadthArr[row[i + 1]]) * 0.5 - getSep(u, row[i + 1]) : Infinity;
			rightBuf[i] = wantBuf[i] < maxA ? wantBuf[i] : maxA;
		}
		for (let i = 0; i < len; i++) {
			const u = row[i];
			const item = allItems[u];
			if (!item._isDummy && pins?.has(item.id)) {
				const p = pins.get(item.id);
				centrePos[u] = across ? p.y : p.x;
			} else {
				centrePos[u] = (leftBuf[i] + rightBuf[i]) * 0.5;
			}
		}
	};

	const refinePasses = totalN > 120 ? 1 : 2;
	for (let pass = 0; pass < refinePasses; pass++) {
		for (let r = 1; r < rows.length; r++) refineRow(rows[r], true);
		for (let r = rows.length - 2; r >= 0; r--) refineRow(rows[r], false);
	}

	let least = Infinity, most = -Infinity;
	for (let i = 0; i < nodes.length; i++) {
		const c = centrePos[i], h = breadthArr[i] * 0.5;
		if (c - h < least) least = c - h;
		if (c + h > most) most = c + h;
	}
	if (!Number.isFinite(least)) { least = 0; most = 0; }
	const shiftT = -least;

	const rankGaps = new Float64Array(Math.max(1, rows.length)).fill(baseGap);
	for (let i = 0; i < validEdges.length; i++) {
		const e = validEdges[i];
		const labelText = e.label || e.shape?.label;
		if (!labelText) continue;
		const rU = ranks.get(e.from), rV = ranks.get(e.to);
		if (Math.abs(rU - rV) === 1) {
			const r = Math.min(rU, rV);
			const needed = across ? Math.min(160, labelText.length * 7 + 48) : 64;
			if (needed > rankGaps[r]) rankGaps[r] = Math.ceil(needed / 8) * 8;
		}
	}

	let cursor = 0;
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		let high = 24;
		for (let i = 0; i < row.length; i++) {
			const u = row[i];
			if (!allItems[u]._isDummy && depthArr[u] > high) high = depthArr[u];
		}
		for (let i = 0; i < row.length; i++) {
			const u = row[i];
			const item = allItems[u];
			const side = centrePos[u] - breadthArr[u] * 0.5 + shiftT;
			const along = cursor + (high - depthArr[u]) * 0.5;
			if (across) { item.x = along; item.y = side; }
			else { item.x = side; item.y = along; }
			if (!item._isDummy && pins?.has(item.id)) {
				const p = pins.get(item.id);
				item.x = p.x - item.w * 0.5;
				item.y = p.y - item.h * 0.5;
			}
		}
		if (r + 1 < rows.length) cursor += high + rankGaps[r];
		else cursor += high;
	}

	if (pins?.size) settleNodePositions([...nodes.filter(node => pins.has(node.id)), ...nodes.filter(node => !pins.has(node.id))], pins, across, Math.max(8, baseSibling));

	const corridors = new Map();
	for (const [edge, chain] of dummyChains) {
		const pts = chain.map(d => [d.x + d.w * 0.5, d.y + d.h * 0.5]);
		if (backward.has(edge)) pts.reverse();
		corridors.set(edge, pts);
	}

	const orderOut = new Map();
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		for (let i = 0; i < row.length; i++) {
			const u = row[i];
			if (!allItems[u]._isDummy) orderOut.set(allItems[u].id, i);
		}
	}
	const posOut = new Map();
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		posOut.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h, cx: n.x + n.w * 0.5, cy: n.y + n.h * 0.5 });
	}

	const span = nodes.length ? most - least : 0;
	return {
		w: pins?.size ? Math.max(0, ...nodes.map(node => node.x + node.w)) : across ? Math.max(0, cursor) : span,
		h: pins?.size ? Math.max(0, ...nodes.map(node => node.y + node.h)) : across ? span : Math.max(0, cursor),
		backward,
		selfLoops,
		ranks,
		order: orderOut,
		positions: posOut,
		corridors,
		crossings: bestCross
	};
}

function settleNodePositions(nodes, pins, across, margin) {
	const side = across ? 'y' : 'x', breadth = across ? 'h' : 'w', along = across ? 'x' : 'y', depth = across ? 'w' : 'h';
	const settled = [];
	const intersects = (a, b) => a.x < b.x + b.w - 1e-7 && a.x + a.w > b.x + 1e-7 && a.y < b.y + b.h - 1e-7 && a.y + a.h > b.y + 1e-7;
	for (const node of nodes) {
		if (!settled.some(other => intersects(node, other))) { settled.push(node); continue; }
		if (pins?.has(node.id)) {
			const error = new RangeError('Pinned flowchart boxes overlap.');
			error.code = 'flowchart_layout_constraints'; throw error;
		}
		const intervals = settled.filter(other => node[along] < other[along] + other[depth] + margin && node[along] + node[depth] + margin > other[along])
			.map(other => [other[side] - node[breadth] - margin, other[side] + other[breadth] + margin]).sort((a, b) => a[0] - b[0]);
		const merged = [];
		for (const interval of intervals) {
			if (merged.length && interval[0] <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], interval[1]);
			else merged.push(interval.slice());
		}
		const occupied = merged.find(([low, high]) => node[side] > low && node[side] < high);
		if (occupied) node[side] = node[side] - occupied[0] < occupied[1] - node[side] ? occupied[0] : occupied[1];
		settled.push(node);
	}
}

export function layoutIncrementalGraph(nodes, edges, priorLayout, options = {}) {
	if (!priorLayout?.positions?.size) return layoutLayeredGraph(nodes, edges, options);
	const across = !!options.across, gap = options.gap ?? 52, sibling = options.sibling ?? 36, pins = options.pins || null;
	const primary = across ? 'x' : 'y', transverse = across ? 'y' : 'x', depth = across ? 'w' : 'h', breadth = across ? 'h' : 'w';
	const nodeMap = new Map(nodes.map(node => [node.id, node])), incoming = new Map(nodes.map(node => [node.id, []])), outgoing = new Map(nodes.map(node => [node.id, []]));
	for (const edge of edges) if (edge.from !== edge.to && nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
		incoming.get(edge.to).push(nodeMap.get(edge.from)); outgoing.get(edge.from).push(nodeMap.get(edge.to));
	}
	const ranks = new Map(), order = new Map(), rows = new Map(), pending = [], stable = [], changed = [], fixed = [];
	const groupOf = new Map(); for (const group of options.groups || []) for (const id of group.members || []) groupOf.set(id, group);
	const centre = (node, axis) => node[axis] + node[axis === 'x' ? 'w' : 'h'] / 2;
	const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
	const record = (node, rank) => { ranks.set(node.id, rank); if (!rows.has(rank)) rows.set(rank, []); rows.get(rank).push(node); };
	for (const [i, node] of nodes.entries()) {
		const old = priorLayout.positions.get(node.id), pin = pins?.get(node.id);
		if (!old && !pin) { pending.push(node); continue; }
		node.x = (pin?.x ?? old.cx ?? old.x + old.w / 2) - node.w / 2;
		node.y = (pin?.y ?? old.cy ?? old.y + old.h / 2) - node.h / 2;
		record(node, priorLayout.ranks?.get(node.id) ?? 0); order.set(node.id, priorLayout.order?.get(node.id) ?? i);
		(pin ? fixed : old.w === node.w && old.h === node.h ? stable : changed).push(node);
	}
	const sign = priorLayout.reverse ? -1 : 1;
	while (pending.length) {
		let at = pending.findIndex(node => [...incoming.get(node.id), ...outgoing.get(node.id)].some(peer => ranks.has(peer.id)));
		if (at < 0) at = 0;
		const node = pending.splice(at, 1)[0], parents = incoming.get(node.id).filter(peer => ranks.has(peer.id)), children = outgoing.get(node.id).filter(peer => ranks.has(peer.id));
		const peers = parents.length ? parents : children, rank = parents.length ? Math.max(...parents.map(peer => ranks.get(peer.id))) + 1 : children.length ? Math.min(...children.map(peer => ranks.get(peer.id))) - 1 : 0;
		const row = rows.get(rank), toward = parents.length ? 1 : -1;
		node[transverse] = (peers.length ? mean(peers.map(peer => centre(peer, transverse))) : 0) - node[breadth] / 2;
		if (row?.length) node[primary] = mean(row.map(peer => centre(peer, primary))) - node[depth] / 2;
		else if (peers.length) {
			const edge = sign * toward > 0 ? Math.max(...peers.map(peer => peer[primary] + peer[depth])) : Math.min(...peers.map(peer => peer[primary]));
			node[primary] = sign * toward > 0 ? edge + gap : edge - gap - node[depth];
		} else node[primary] = 0;
		const group = groupOf.get(node.id), members = group?.members.map(id => nodeMap.get(id)).filter(peer => peer && ranks.has(peer.id)) || [];
		let groupedRank = rank;
		if (members.length) {
			const before = parents.filter(peer => groupOf.get(peer.id) === group), after = children.filter(peer => groupOf.get(peer.id) === group), near = before.length ? before : after.length ? after : members;
			node.y = mean(near.map(peer => peer.y + peer.h / 2)) - node.h / 2;
			node.x = before.length || !after.length ? Math.max(...near.map(peer => peer.x + peer.w)) + gap : Math.min(...near.map(peer => peer.x)) - gap - node.w;
			if (!across) groupedRank = Math.round(mean(near.map(peer => ranks.get(peer.id))));
		}
		record(node, groupedRank); order.set(node.id, peers.length ? mean(peers.map(peer => order.get(peer.id) ?? 0)) : nodes.length); changed.push(node);
	}
	settleNodePositions([...fixed, ...stable, ...changed], pins, across, Math.max(8, sibling));
	for (const row of rows.values()) row.sort((a, b) => centre(a, transverse) - centre(b, transverse)).forEach((node, i) => order.set(node.id, i));
	const {backward, selfLoops} = findFeedbackArcSet(nodes, edges, null, options.flowchart === true, options.written);
	const positions = new Map(nodes.map(node => [node.id, {x: node.x, y: node.y, w: node.w, h: node.h, cx: node.x + node.w / 2, cy: node.y + node.h / 2}]));
	return {w: Math.max(0, ...nodes.map(node => node.x + node.w)), h: Math.max(0, ...nodes.map(node => node.y + node.h)), backward, selfLoops, ranks, order, positions,
		corridors: priorLayout.corridors || new Map(), crossings: null};
}

function simplifyOrthogonalPolyline(pts) {
	if (!pts || pts.length <= 2) return pts ? pts.map(p => [p[0], p[1]]) : [];
	const out = [];
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		if (out.length && Math.abs(out[out.length - 1][0] - p[0]) + Math.abs(out[out.length - 1][1] - p[1]) < 1e-5) continue;
		while (out.length >= 2) {
			const a = out[out.length - 2], b = out[out.length - 1];
			const cross = (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0]);
			const dot = (b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1]);
			if (Math.abs(cross) > 1e-4 || dot < -1e-4) break;
			out.pop();
		}
		out.push([p[0], p[1]]);
	}
	return out.length === 1 ? [out[0], out[0].slice()] : out;
}

export { FLOWCHART_LAYOUT_LIMITS };
