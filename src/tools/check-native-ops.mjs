// SPDX-License-Identifier: AGPL-3.0-only

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const PAGE_LITERAL_CALL_RE = /\b(?:_nativeHostCall|_nativeHostNotify|_callPro|_nativeRequestIntake)\(\s*'([^']+)'\s*[,)]/g;
const PAGE_AUDIO_SUBOP_RE = /\b(?:call|changedAsync)\(\s*'([a-z][a-z0-9.]*)'/g;
const PAGE_RECOVERY_SUBOP_RE = /\bcall\(\s*'([a-z][a-z0-9.]*)'/g;
const PAGE_BACKUP_ALLOWLIST_RE = /\/\^notes\\\.backup\\\.\(\?:([^$]+)\)\$\//;
const PAGE_LANE_RE = /seam\.NATIVE_BYTE_OPS\.indexOf\(\s*operation\s*\)\s*>=\s*0/;
const TRANSPORT_BYTE_OPS_RE = /export const NATIVE_BYTE_OPS = Object\.freeze\(\[([^\]]*)\]\)/;
const INTAKE_BYTE_OPS = Object.freeze(['intake.chunk']);

const KOTLIN_WHEN_ARM_RE = /^\s*("[a-zA-Z0-9.]+"(?:\s*,\s*"[a-zA-Z0-9.]+")*)\s*->/gm;
const KOTLIN_QUOTED_OP_RE = /"([a-zA-Z0-9.]+)"/g;
const KOTLIN_IF_OP_EQ_RE = /^\s*if\s*\(\s*operation\s*==\s*"([a-z][a-z0-9.]*)"\s*\)/gm;
const KOTLIN_FRAME_OP_EQ_RE = /\bframe\.op\s*==\s*"([a-z][a-z0-9.]*)"/g;
const KOTLIN_FRAME_CONST_RE = /\bframe\.op\s*==\s*NativeDocumentFrames\.([A-Z0-9_]+)/g;
const KOTLIN_CONST_VAL_RE = /\bconst\s+val\s+([A-Z0-9_]+)\s*=\s*"([a-z][a-z0-9.]*)"/g;
const KOTLIN_SET_OF_RE = /operation\s+in\s+setOf\(([^)]+)\)/;

const CPP_WIDE_OP_EQ_RE = /\boperation\s*==\s*L"([a-zA-Z0-9_.]+)"/g;
const CPP_NARROW_OP_EQ_RE = /\boperation\s*==\s*"([a-zA-Z0-9_.]+)"/g;
const CPP_WIDE_FRAME_OP_RE = /\bop\s*==\s*L"([a-zA-Z0-9_.]+)"/g;
const CPP_NARROW_SYNC_OP_RE = /\bop\s*==\s*"([a-zA-Z0-9_.]+)"/g;

const STANDIN_CASE_RE = /\bcase\s+'([a-zA-Z0-9_.]+)'\s*:/g;
const STANDIN_IF_OP_EQ_RE = /(?<!typeof\s+)\boperation\s*===\s*'([a-zA-Z0-9_.]+)'/g;
const STANDIN_FRAME_EQ_RE = /(?<!typeof\s+)\bhead\.op\s*===\s*'([a-zA-Z0-9_.]+)'/g;
const STANDIN_FRAME_LIST_RE = /\[([^\]]+)\]\.includes\(head\.op\)/g;
const STANDIN_SINGLE_QUOTED_RE = /'([a-zA-Z0-9_.]+)'/g;

const FILES = Object.freeze({
	table: 'repo/shell/native-ops.mjs',
	page: 'repo/shell/platform.js',
	standin: 'repo/tools/android-sim/host.mjs',
	bridgeKt: 'repo/android/app/src/main/java/app/rapier/RapierBridge.kt',
	docFramesKt: 'repo/android/app/src/main/java/app/rapier/NativeDocumentFrames.kt',
	notesPortKt: 'repo/android/app/src/main/java/app/rapier/NativeNotesPort.kt',
	recoveryKt: 'repo/android/app/src/main/java/app/rapier/NativeRecovery.kt',
	backupKt: 'repo/android/app/src/main/java/app/rapier/RapierAndroidBackup.kt',
	syncKt: 'repo/android/app/src/main/java/app/rapier/RapierSyncCourier.kt',
	playbackKt: 'repo/android/app/src/main/java/app/rapier/RapierPlaybackService.kt',
	rapierCpp: 'repo/windows/rapier.cpp',
	notesPortH: 'repo/windows/notes-port.h',
	syncNativeH: 'repo/windows/sync-native.h',
	folderBrokerH: 'repo/windows/folder-broker.h',
	lockedNotesH: 'repo/windows/locked-notes.h',
});

function sliceBetween(text, startMarker, endMarker, label, errors) {
	const start = text.indexOf(startMarker);
	if (start < 0) {
		errors.push(`bridge parser anchor "${startMarker}" is missing; fix ${label}`);
		return '';
	}
	const end = text.indexOf(endMarker, start + startMarker.length);
	if (end < 0) {
		errors.push(`bridge parser anchor "${endMarker}" is missing; fix ${label}`);
		return '';
	}
	return text.slice(start, end);
}

const CPP_COMMENT_OR_STRING_RE = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|L?"(?:\\.|[^"\\])*"|(?<![0-9A-Za-z_])L?'(?:\\.|[^'\\])*'/g;
function stripCppComments(text) {
	return text.replace(CPP_COMMENT_OR_STRING_RE, m => (m.startsWith('/') ? (m.includes('\n') ? '\n' : ' ') : m));
}

function cppBalanced(text, openAt) {
	const openCh = text[openAt];
	const closeCh = openCh === '(' ? ')' : openCh === '{' ? '}' : '';
	if (!closeCh) return null;
	let depth = 0;
	for (let i = openAt; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (ch === '/' && next === '/') {
			const nl = text.indexOf('\n', i + 2);
			if (nl < 0) return null;
			i = nl;
			continue;
		}
		if (ch === '/' && next === '*') {
			const end = text.indexOf('*/', i + 2);
			if (end < 0) return null;
			i = end + 1;
			continue;
		}
		if (ch === '"' || (ch === '\'' && !(i > 0 && /[0-9A-Za-z_]/.test(text[i - 1])))) {
			const quote = ch;
			i++;
			for (; i < text.length; i++) {
				if (text[i] === '\\') { i++; continue; }
				if (text[i] === quote) break;
			}
			continue;
		}
		if (ch === openCh) depth++;
		else if (ch === closeCh) {
			depth--;
			if (depth === 0) return { body: text.slice(openAt + 1, i), end: i + 1 };
		}
	}
	return null;
}

function cppFunctionBody(text, signature, label, errors) {
	let searchFrom = 0;
	while (searchFrom < text.length) {
		const at = text.indexOf(signature, searchFrom);
		if (at < 0) {
			errors.push(`C++ function anchor "${signature}" is missing; fix ${label}`);
			return '';
		}
		const parenAt = text.indexOf('(', at);
		const args = parenAt >= 0 ? cppBalanced(text, parenAt) : null;
		if (!args) {
			errors.push(`C++ parameter list for "${signature}" is malformed; fix ${label}`);
			return '';
		}
		let cursor = args.end;
		while (cursor < text.length) {
			while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
			if (text.startsWith('const', cursor) && !/[A-Za-z0-9_]/.test(text[cursor + 5] || '')) { cursor += 5; continue; }
			if (text.startsWith('override', cursor) && !/[A-Za-z0-9_]/.test(text[cursor + 8] || '')) { cursor += 8; continue; }
			if (text.startsWith('noexcept', cursor) && !/[A-Za-z0-9_]/.test(text[cursor + 8] || '')) { cursor += 8; continue; }
			break;
		}
		if (text[cursor] === ';') {
			searchFrom = cursor + 1;
			continue;
		}
		if (text[cursor] === '{') {
			const body = cppBalanced(text, cursor);
			if (!body) {
				errors.push(`C++ body for "${signature}" is malformed; fix ${label}`);
				return '';
			}
			return body.body;
		}
		searchFrom = cursor + 1;
	}
	errors.push(`C++ definition for "${signature}" is missing; fix ${label}`);
	return '';
}

function cppIfBlocks(rawBlock, { topLevelOnly = true } = {}) {
	const block = stripCppComments(rawBlock);
	const out = [];
	const re = /\bif\s*\(/g;
	let m;
	while ((m = re.exec(block)) !== null) {
		const openParen = block.indexOf('(', m.index);
		const cond = cppBalanced(block, openParen);
		if (!cond) continue;
		let cursor = cond.end;
		while (cursor < block.length && /\s/.test(block[cursor])) cursor++;
		let entry = null;
		if (block[cursor] === '{') {
			const body = cppBalanced(block, cursor);
			if (body) entry = { cond: cond.body, body: body.body, start: m.index, end: body.end };
		} else {
			let end = cursor;
			for (; end < block.length; end++) {
				if (block[end] === '(' || block[end] === '{') {
					const inner = cppBalanced(block, end);
					if (inner) { end = inner.end - 1; continue; }
				}
				if (block[end] === ';') { end++; break; }
			}
			entry = { cond: cond.body, body: block.slice(cursor, end), start: m.index, end };
		}
		if (entry) {
			out.push(entry);
			if (topLevelOnly) re.lastIndex = entry.end;
		}
	}
	return out;
}

function extractWideInserts(rawBlock, varNames = null) {
	const block = stripCppComments(rawBlock);
	const keys = new Set();
	const directRe = /\b([A-Za-z_][A-Za-z0-9_]*)\.Insert\(\s*L"([A-Za-z0-9_]+)"\s*,/g;
	for (const m of block.matchAll(directRe)) {
		if (!varNames || varNames.has(m[1])) keys.add(m[2]);
	}
	const ternaryRe = /\b([A-Za-z_][A-Za-z0-9_]*)\.Insert\([^{};?]*\?\s*L"([A-Za-z0-9_]+)"\s*:\s*L"([A-Za-z0-9_]+)"\s*,/g;
	for (const m of block.matchAll(ternaryRe)) {
		if (!varNames || varNames.has(m[1])) { keys.add(m[2]); keys.add(m[3]); }
	}
	return keys;
}

function extractNarrowJsonAssigns(rawBlock, varName = 'out') {
	const block = stripCppComments(rawBlock);
	const keys = new Set();
	const re = new RegExp(`\\b${varName}\\["([A-Za-z0-9_]+)"\\]\\s*=`, 'g');
	for (const m of block.matchAll(re)) keys.add(m[1]);
	return keys;
}

function kotlinWhenCases(block) {
	const found = [];
	for (const match of block.matchAll(KOTLIN_WHEN_ARM_RE)) {
		for (const item of match[1].matchAll(KOTLIN_QUOTED_OP_RE)) found.push(item[1]);
	}
	return found;
}

function expandBackupRegex(body) {
	const raw = body.replace(/\\\./g, '.');
	const top = [];
	let depth = 0;
	let current = '';
	for (const ch of raw) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (ch === '|' && depth === 0) {
			top.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	if (current) top.push(current);
	const out = [];
	for (const part of top) {
		const nested = part.match(/^([a-z0-9.]+)\(\?:([a-z0-9.|]+)\)$/);
		if (nested) {
			for (const choice of nested[2].split('|')) out.push('notes.backup.' + nested[1] + choice);
		} else {
			out.push('notes.backup.' + part);
		}
	}
	return out;
}

function expectedAndroidFile(op, byte) {
	if (op === 'transfer.chunk') return `${FILES.bridgeKt} and ${FILES.docFramesKt}`;
	if (op.startsWith('notes.backup.')) return FILES.backupKt;
	if (op.startsWith('recovery.store.')) return byte ? FILES.recoveryKt : `${FILES.bridgeKt} and ${FILES.recoveryKt}`;
	if (op.startsWith('media.') && op !== 'media.playing') return `${FILES.bridgeKt} and ${FILES.playbackKt}`;
	if (op.startsWith('sync.') && op !== 'sync.open') return FILES.syncKt;
	if (op.startsWith('notes.store.seal.') || op === 'notes.store.locked.list' || op === 'notes.store.locked.open' || op === 'notes.store.draft.list') {
		return FILES.bridgeKt;
	}
	if (op.startsWith('notes.store.')) return FILES.notesPortKt;
	return FILES.bridgeKt;
}

function expectedWindowsFile(op, byte) {
	if (byte) {
		if (op.startsWith('notes.store.')) return `${FILES.rapierCpp} and ${FILES.notesPortH}`;
		return FILES.rapierCpp;
	}
	if (op.startsWith('sync.')) return FILES.syncNativeH;
	if (op.startsWith('notes.store.seal.') || op.startsWith('notes.store.lock.') || op === 'notes.store.locked.list' || op === 'notes.store.locked.open' || op === 'notes.store.draft.list') {
		return FILES.rapierCpp;
	}
	if (op.startsWith('notes.store.')) return FILES.notesPortH;
	return FILES.rapierCpp;
}

function parsePage(repoRoot, errors) {
	const text = readFileSync(join(repoRoot, 'shell/platform.js'), 'utf8');
	const callFn = sliceBetween(text, 'function _nativeHostCall(', '\n\tfunction _nativeHostNotify(', FILES.page, errors);
	if (!PAGE_LANE_RE.test(callFn) || /args\s*&&\s*args\.bytes/.test(callFn)) {
		errors.push(`_nativeHostCall must choose the byte lane by NATIVE_BYTE_OPS.indexOf(operation) alone, never by an argument; fix ${FILES.page}`);
	}
	const ops = new Set();
	for (const m of text.matchAll(PAGE_LITERAL_CALL_RE)) ops.add(m[1]);
	const audioBlock = sliceBetween(text, 'function _nativeCreateAudio(', '\n\tfunction _nativeBinaryRecoveryStore(', FILES.page, errors);
	for (const m of audioBlock.matchAll(PAGE_AUDIO_SUBOP_RE)) ops.add('media.' + m[1]);
	const recBlock = sliceBetween(text, 'function _nativeBinaryRecoveryStore(', '\n\tfunction _createNativePlatform(', FILES.page, errors);
	for (const m of recBlock.matchAll(PAGE_RECOVERY_SUBOP_RE)) ops.add('recovery.store.' + m[1]);
	const backupMatch = text.match(PAGE_BACKUP_ALLOWLIST_RE);
	if (!backupMatch) {
		errors.push(`notes.backup allowlist regex is missing from notesBackup port; fix ${FILES.page}`);
	} else {
		for (const op of expandBackupRegex(backupMatch[1])) ops.add(op);
	}
	return ops;
}

function parseAndroid(repoRoot, errors) {
	const control = new Map();
	const byte = new Map();
	const record = (map, op, file) => { if (!map.has(op)) map.set(op, file); };

	const docFrames = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/NativeDocumentFrames.kt'), 'utf8');
	const frameConsts = new Map();
	for (const m of docFrames.matchAll(KOTLIN_CONST_VAL_RE)) frameConsts.set(m[1], m[2]);

	const bridge = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/RapierBridge.kt'), 'utf8');
	const frameBlock = sliceBetween(bridge, 'fun handleHostFrame(', 'fun handleHostRequest(', FILES.bridgeKt, errors);
	for (const m of frameBlock.matchAll(KOTLIN_FRAME_OP_EQ_RE)) record(byte, m[1], FILES.bridgeKt);
	for (const m of frameBlock.matchAll(KOTLIN_FRAME_CONST_RE)) {
		const resolved = frameConsts.get(m[1]);
		if (!resolved) errors.push(`NativeDocumentFrames.${m[1]} in ${FILES.bridgeKt} is missing from ${FILES.docFramesKt}; fix ${FILES.docFramesKt}`);
		else record(byte, resolved, FILES.bridgeKt);
	}

	const preWhen = sliceBetween(bridge, 'fun handleHostRequest(', 'when (operation) {', FILES.bridgeKt, errors);
	for (const m of preWhen.matchAll(KOTLIN_IF_OP_EQ_RE)) record(control, m[1], FILES.bridgeKt);
	if (preWhen.includes('operation.startsWith("notes.store.seal.")')) {
		const sealBlock = sliceBetween(preWhen, 'when (operation.removePrefix("notes.store.seal.")) {', 'else -> error("Unknown lock operation")', FILES.bridgeKt, errors);
		for (const sub of kotlinWhenCases(sealBlock)) record(control, 'notes.store.seal.' + sub, FILES.bridgeKt);
	}

	const whenBlock = sliceBetween(bridge, 'when (operation) {', 'else -> fail("unsupported operation")', FILES.bridgeKt, errors);
	const bridgeRecovery = new Set();
	const bridgeMedia = new Set();
	for (const op of kotlinWhenCases(whenBlock)) {
		record(control, op, FILES.bridgeKt);
		if (op.startsWith('recovery.store.')) bridgeRecovery.add(op);
		if (op.startsWith('media.') && op !== 'media.playing') bridgeMedia.add(op);
	}

	if (preWhen.includes('operation.startsWith("notes.store.")')) {
		const notesPort = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/NativeNotesPort.kt'), 'utf8');
		const bytesReq = sliceBetween(notesPort, 'internal fun NativeNotesBytes.request(', 'else -> error("Unsupported native Notes operation")', FILES.notesPortKt, errors);
		for (const sub of kotlinWhenCases(bytesReq)) record(control, 'notes.store.' + sub, FILES.notesPortKt);
		const sessReq = sliceBetween(notesPort, 'internal fun NativeNotesSession.request(', 'else -> execute(', FILES.notesPortKt, errors);
		for (const sub of kotlinWhenCases(sessReq)) record(control, 'notes.store.' + sub, FILES.notesPortKt);
		if (frameBlock.includes('notesStore.answer(frame')) {
			const sessAns = sliceBetween(notesPort, 'internal fun NativeNotesSession.answer(', 'else -> error("Only byte operations cross as frames")', FILES.notesPortKt, errors);
			for (const op of kotlinWhenCases(sessAns)) record(byte, op, FILES.notesPortKt);
		}
	}

	const recovery = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/NativeRecovery.kt'), 'utf8');
	const recReq = sliceBetween(recovery, 'fun request(', 'fun answer(', FILES.recoveryKt, errors);
	const setMatch = recReq.match(KOTLIN_SET_OF_RE);
	const portRecovery = new Set();
	if (!setMatch) {
		errors.push(`NativeRecovery.request allowlist setOf(...) is missing; fix ${FILES.recoveryKt}`);
	} else {
		for (const m of setMatch[1].matchAll(KOTLIN_QUOTED_OP_RE)) portRecovery.add('recovery.store.' + m[1]);
	}
	for (const op of bridgeRecovery) {
		if (!portRecovery.has(op)) errors.push(`${op}: listed in ${FILES.bridgeKt} but rejected by ${FILES.recoveryKt}; fix ${FILES.recoveryKt}`);
	}
	for (const op of portRecovery) {
		if (!bridgeRecovery.has(op)) errors.push(`${op}: allowed in ${FILES.recoveryKt} but not routed by ${FILES.bridgeKt}; fix ${FILES.bridgeKt}`);
	}
	if (frameBlock.includes('frame.op.startsWith("recovery.store.")')) {
		const recAns = sliceBetween(recovery, 'fun answer(', 'override fun close()', FILES.recoveryKt, errors);
		for (const m of recAns.matchAll(KOTLIN_FRAME_OP_EQ_RE)) record(byte, m[1], FILES.recoveryKt);
	}

	if (preWhen.includes('operation.startsWith("notes.backup.")')) {
		const backup = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/RapierAndroidBackup.kt'), 'utf8');
		const bkReq = sliceBetween(backup, 'fun request(', 'else -> error("Unknown Android backup operation")', FILES.backupKt, errors);
		for (const sub of kotlinWhenCases(bkReq)) record(control, 'notes.backup.' + sub, FILES.backupKt);
		const bkAns = sliceBetween(backup, 'fun answer(', '\n}', FILES.backupKt, errors);
		for (const m of bkAns.matchAll(KOTLIN_FRAME_OP_EQ_RE)) record(byte, m[1], FILES.backupKt);
	}

	if (preWhen.includes('operation.startsWith("sync.")')) {
		const sync = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/RapierSyncCourier.kt'), 'utf8');
		const syReq = sliceBetween(sync, 'fun request(', 'else -> error("Unsupported sync operation")', FILES.syncKt, errors);
		for (const sub of kotlinWhenCases(syReq)) record(control, 'sync.' + sub, FILES.syncKt);
		if (frameBlock.includes('frame.op.startsWith("sync.")')) {
			const syAns = sliceBetween(sync, 'fun answer(', 'else -> error("Only sync byte operations cross as frames")', FILES.syncKt, errors);
			for (const op of kotlinWhenCases(syAns)) record(byte, op, FILES.syncKt);
		}
	}

	const playback = readFileSync(join(repoRoot, 'android/app/src/main/java/app/rapier/RapierPlaybackService.kt'), 'utf8');
	const pbReq = sliceBetween(playback, 'internal fun request(', 'else -> error("Unknown playback operation")', FILES.playbackKt, errors);
	const portMedia = new Set();
	for (const m of pbReq.matchAll(/\bif\s*\(\s*operation\s*==\s*"([a-z][a-z0-9.]*)"\s*\)/g)) portMedia.add('media.' + m[1]);
	for (const sub of kotlinWhenCases(pbReq)) portMedia.add('media.' + sub);
	for (const op of bridgeMedia) {
		if (!portMedia.has(op)) errors.push(`${op}: routed in ${FILES.bridgeKt} but missing in ${FILES.playbackKt}; fix ${FILES.playbackKt}`);
	}
	for (const op of portMedia) {
		if (!bridgeMedia.has(op)) errors.push(`${op}: handled in ${FILES.playbackKt} but not routed in ${FILES.bridgeKt}; fix ${FILES.bridgeKt}`);
	}

	const all = new Map([...control, ...byte]);
	return { control, byte, all };
}

function parseWindows(repoRoot, errors) {
	const control = new Map();
	const byte = new Map();
	const answers = new Map();
	const record = (map, op, file) => { if (!map.has(op)) map.set(op, file); };
	const ensureAnswer = (op, file) => {
		if (!answers.has(op)) {
			answers.set(op, { file, keys: new Set(), hasObject: false, hasNull: false, hasArray: false, bareEmpty: false, metaHasBase64Bytes: false });
		}
		return answers.get(op);
	};
	const addKeys = (op, file, iter) => {
		const entry = ensureAnswer(op, file);
		entry.hasObject = true;
		for (const k of iter) entry.keys.add(k);
	};

	const cpp = readFileSync(join(repoRoot, 'windows/rapier.cpp'), 'utf8');
	const notesH = readFileSync(join(repoRoot, 'windows/notes-port.h'), 'utf8');
	const syncH = readFileSync(join(repoRoot, 'windows/sync-native.h'), 'utf8');
	const folderH = readFileSync(join(repoRoot, 'windows/folder-broker.h'), 'utf8');
	const lockedH = readFileSync(join(repoRoot, 'windows/locked-notes.h'), 'utf8');

	const platformStateBody = cppFunctionBody(cpp, 'JsonObject PlatformState(', FILES.rapierCpp, errors);
	const windowsCapabilities = new Set();
	for (const m of stripCppComments(platformStateBody).matchAll(/L"([A-Za-z0-9_]+)"/g)) {
		windowsCapabilities.add(m[1]);
	}
	const helperKeys = {
		windowCloseReceipt: extractWideInserts(cppFunctionBody(cpp, 'JsonObject WindowCloseReceipt(', FILES.rapierCpp, errors), new Set(['result'])),
		chooseSave: extractWideInserts(cppFunctionBody(cpp, 'void ChooseSave(', FILES.rapierCpp, errors), new Set(['result'])),
		beginTransfer: extractWideInserts(cppFunctionBody(cpp, 'JsonObject BeginTransfer(', FILES.rapierCpp, errors), new Set(['result'])),
		appendTransfer: extractWideInserts(cppFunctionBody(cpp, 'JsonObject AppendTransfer(', FILES.rapierCpp, errors), new Set(['result'])),
		finishTransfer: extractWideInserts(cppFunctionBody(cpp, 'JsonObject FinishTransfer(', FILES.rapierCpp, errors), new Set(['accepted'])),
		shareTransfer: new Set([
			...extractWideInserts(cppFunctionBody(cpp, 'FinishShareTransferAsync(', FILES.rapierCpp, errors), new Set(['result'])),
			...extractWideInserts(cppFunctionBody(cpp, 'void QueueShareTransfer(', FILES.rapierCpp, errors), new Set(['result'])),
		]),
		proState: extractWideInserts(cppFunctionBody(cpp, 'JsonObject ProStateOf(', FILES.rapierCpp, errors), new Set(['state'])),
		beginAttachment: extractWideInserts(cppFunctionBody(cpp, 'void BeginAttachment(', FILES.rapierCpp, errors), new Set(['result'])),
		openAttachment: extractWideInserts(cppFunctionBody(cpp, 'void OpenAttachment(', FILES.rapierCpp, errors), new Set(['answer'])),
		appendAttachment: extractWideInserts(cppFunctionBody(cpp, 'void AppendAttachment(', FILES.rapierCpp, errors), new Set(['result'])),
		platformState: extractWideInserts(platformStateBody, new Set(['state'])),
		acceptOpened: extractWideInserts(cppFunctionBody(cpp, 'void AcceptOpenedAsync(', FILES.rapierCpp, errors), new Set(['result'])),
		drainLeases: extractWideInserts(cppFunctionBody(cpp, 'void DrainNotesLeases(', FILES.rapierCpp, errors), new Set(['result'])),
	};

	const extCheckBody = cppFunctionBody(cpp, 'bool QueueExternalCheck(', FILES.rapierCpp, errors);
	const extReplyIf = cppIfBlocks(extCheckBody, { topLevelOnly: false })
		.find(b => b.cond.trim() === '!responseId.empty()' && b.body.includes('HostResponse('));
	helperKeys.externalCheck = extReplyIf ? extractWideInserts(extReplyIf.body, new Set(['answer', 'result'])) : new Set();

	const finishLockedBody = cppFunctionBody(cpp, 'void FinishLockedVerification(', FILES.rapierCpp, errors);
	const finishIfs = cppIfBlocks(finishLockedBody);
	const sealVerifyIf = finishIfs.find(b => b.cond.includes('LockedIntent::Seal'));
	const openVerifyIf = finishIfs.find(b => b.cond.includes('LockedIntent::Open'));
	helperKeys.lockedSealVerify = sealVerifyIf ? extractWideInserts(sealVerifyIf.body, new Set(['result'])) : new Set();
	helperKeys.lockedOpenVerify = openVerifyIf ? extractWideInserts(openVerifyIf.body, new Set(['result'])) : new Set();

	const folderDispatch = cppFunctionBody(folderH, 'Json dispatch(const std::string& method', FILES.folderBrokerH, errors);
	const folderHelloIf = cppIfBlocks(folderDispatch).find(b => b.cond.includes('method == "hello"'));
	helperKeys.folderHello = folderHelloIf ? extractNarrowJsonAssigns(folderHelloIf.body, 'out') : new Set();

	const lockedStageBody = cppFunctionBody(lockedH, 'std::string Stage(', FILES.lockedNotesH, errors);
	const lockedPendingBody = cppFunctionBody(lockedH, 'std::string Pending(', FILES.lockedNotesH, errors);
	helperKeys.sealPending = new Set([
		...extractNarrowJsonAssigns(lockedStageBody, 'origin'),
		...extractNarrowJsonAssigns(lockedPendingBody, 'out'),
	]);

	function analyzeCppHandler(op, rawBlock, file, isFrame = false) {
		const block = stripCppComments(rawBlock);
		const entry = ensureAnswer(op, file);
		if (/\bHostResponseNull\s*\(/.test(block) || /message\.Insert\(\s*L"result"\s*,\s*JsonValue::CreateNullValue\(\)\s*\)/.test(block)) {
			entry.hasNull = true;
		}
		if (/\bJsonArray\b[\s\S]*?message\.Insert\(\s*L"result"\s*,/.test(block)) {
			entry.hasArray = true;
		}
		if (/\bHostResponse\(\s*[A-Za-z0-9_]+\s*,\s*true\s*\)/.test(block)) {
			entry.hasObject = true;
			entry.bareEmpty = true;
		}
		const responseVars = new Set();
		const respRe = isFrame
			? /\bHostFrameAnswer\([^;]*?,\s*(?:true|ok)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\b/g
			: /\bHostResponse\(\s*[A-Za-z0-9_]+\s*,\s*(?:true|ok)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\b/g;
		for (const m of block.matchAll(respRe)) {
			if (m[1] !== 'JsonObject' && m[1] !== 'JsonFrom') responseVars.add(m[1]);
		}
		if (responseVars.size > 0) {
			addKeys(op, file, extractWideInserts(block, responseVars));
		}
		if (/\bJsonFrom\(\s*result\s*\)/.test(block)) {
			addKeys(op, file, extractNarrowJsonAssigns(block, 'out'));
		}
		if (/\bPlatformState\(\s*\)/.test(block)) addKeys(op, file, helperKeys.platformState);
		if (/\bProAsync\(\s*id\b/.test(block)) addKeys(op, file, helperKeys.proState);
		if (block.includes('BeginWindowClose(') || block.includes('CancelWindowClose(') || block.includes('WindowCloseReceipt(')) {
			addKeys(op, file, helperKeys.windowCloseReceipt);
		}
		if (block.includes('ChooseSave(')) addKeys(op, file, helperKeys.chooseSave);
		if (block.includes('BeginTransfer(')) addKeys(op, file, helperKeys.beginTransfer);
		if (block.includes('AppendTransfer(')) addKeys(op, file, helperKeys.appendTransfer);
		if (block.includes('FinishTransfer(')) addKeys(op, file, helperKeys.finishTransfer);
		if (block.includes('QueueShareTransfer(')) addKeys(op, file, helperKeys.shareTransfer);
		if (block.includes('BeginAttachment(')) addKeys(op, file, helperKeys.beginAttachment);
		if (block.includes('OpenAttachment(')) addKeys(op, file, helperKeys.openAttachment);
		if (block.includes('AppendAttachment(')) addKeys(op, file, helperKeys.appendAttachment);
		if (block.includes('AcceptOpenedAsync(')) addKeys(op, file, helperKeys.acceptOpened);
		if (/\bQueueExternalCheck\(\s*true\s*,\s*id\b/.test(block)) addKeys(op, file, helperKeys.externalCheck);
		if (block.includes('Dispatch("hello"')) addKeys(op, file, helperKeys.folderHello);
		if (block.includes('->Pending()')) addKeys(op, file, helperKeys.sealPending);
		if (block.includes('LockedIntent::Seal')) addKeys(op, file, helperKeys.lockedSealVerify);
		if (block.includes('LockedIntent::Open')) addKeys(op, file, helperKeys.lockedOpenVerify);
		if (block.includes('leases->Acquire(')) addKeys(op, file, helperKeys.drainLeases);
	}

	const locked = sliceBetween(cpp, 'bool HandleLockedNotesOperation(', '\nvoid HandleHostRequest(', FILES.rapierCpp, errors);
	for (const b of cppIfBlocks(locked)) {
		for (const m of b.cond.matchAll(CPP_WIDE_OP_EQ_RE)) {
			record(control, m[1], FILES.rapierCpp);
			analyzeCppHandler(m[1], b.body, FILES.rapierCpp);
		}
		if (b.cond.includes('operation.rfind(L"notes.store.seal.", 0) == 0')) {
			const cleanBody = stripCppComments(b.body);
			const innerIfs = cppIfBlocks(cleanBody);
			let lastStepIfEnd = 0;
			const handled = new Set();
			const allowed = [];
			for (const inner of innerIfs) {
				const eqMatches = [...inner.cond.matchAll(/\bstep\s*==\s*L"([a-zA-Z0-9_.]+)"/g)].map(m => m[1]);
				const neqMatches = [...inner.cond.matchAll(/\bstep\s*!=\s*L"([a-zA-Z0-9_.]+)"/g)].map(m => m[1]);
				for (const sub of eqMatches) {
					handled.add(sub);
					const full = 'notes.store.seal.' + sub;
					record(control, full, FILES.rapierCpp);
					analyzeCppHandler(full, inner.body, FILES.rapierCpp);
				}
				for (const sub of neqMatches) {
					allowed.push(sub);
					record(control, 'notes.store.seal.' + sub, FILES.rapierCpp);
				}
				if ((eqMatches.length > 0 || neqMatches.length > 0) && inner.end > lastStepIfEnd) {
					lastStepIfEnd = inner.end;
				}
			}
			const trailing = allowed.filter(sub => !handled.has(sub));
			if (trailing.length === 1) {
				analyzeCppHandler('notes.store.seal.' + trailing[0], cleanBody.slice(lastStepIfEnd), FILES.rapierCpp);
			}
		}
	}

	const lease = sliceBetween(cpp, 'void NotesLeaseOperation(', 'void DrainNotesLeases(', FILES.rapierCpp, errors);
	let leaseAcquireExplicit = false;
	for (const b of cppIfBlocks(lease)) {
		for (const m of b.cond.matchAll(CPP_NARROW_OP_EQ_RE)) {
			const full = 'notes.store.' + m[1];
			if (m[1] === 'lock.acquire') leaseAcquireExplicit = true;
			record(control, full, FILES.rapierCpp);
			analyzeCppHandler(full, b.body, FILES.rapierCpp);
		}
	}
	if (!leaseAcquireExplicit && lease.includes('leases->Acquire(')) {
		errors.push(`notes.store.lock.acquire: NotesLeaseOperation accepts arbitrary notes.store.lock.* names without checking operation == "lock.acquire"; fix ${FILES.rapierCpp}`);
		record(control, 'notes.store.lock.acquire', FILES.rapierCpp);
		analyzeCppHandler('notes.store.lock.acquire', lease, FILES.rapierCpp);
	}

	const req = sliceBetween(cpp, 'void HandleHostRequest(', 'HostResponse(id, false, JsonObject(), L"unsupported operation");', FILES.rapierCpp, errors);
	for (const b of cppIfBlocks(req)) {
		const opsInCond = [...b.cond.matchAll(CPP_WIDE_OP_EQ_RE)].map(m => m[1]);
		if (opsInCond.length === 0) continue;
		const innerIfs = cppIfBlocks(b.body);
		for (const op of opsInCond) {
			record(control, op, FILES.rapierCpp);
			analyzeCppHandler(op, b.body, FILES.rapierCpp);
			for (const inner of innerIfs) {
				if (inner.cond.includes(`L"${op}"`)) analyzeCppHandler(op, inner.body, FILES.rapierCpp);
			}
		}
	}

	const hostFrameAnswerBody = cppFunctionBody(cpp, 'void HostFrameAnswer(', FILES.rapierCpp, errors);
	const frameCarriesTopLevelBytes = /\bframe\.Insert\(\s*L"bytes"\s*,/.test(stripCppComments(hostFrameAnswerBody));
	const notesFrameBody = cppFunctionBody(cpp, 'void NotesFrame(', FILES.rapierCpp, errors);
	const notesFrameUsesAnswerFrame = /\bRapierNotes::AnswerFrame\s*\(/.test(stripCppComments(notesFrameBody));

	const frame = sliceBetween(cpp, 'void HandleHostFrame(', 'HostFrameAnswer(op, requestId, generation, false, JsonObject(), L"unsupported operation");', FILES.rapierCpp, errors);
	const notesFrameOps = new Set();
	for (const b of cppIfBlocks(frame)) {
		const opsInCond = [...b.cond.matchAll(CPP_WIDE_FRAME_OP_RE)].map(m => m[1]);
		for (const op of opsInCond) {
			record(byte, op, FILES.rapierCpp);
			if (b.body.includes('NotesFrame(')) notesFrameOps.add(op);
			else analyzeCppHandler(op, b.body, FILES.rapierCpp, true);
		}
	}

	const byteOpSet = new Set();
	if (notesH.includes('inline bool ByteOperation(')) {
		const byteOpBody = cppFunctionBody(notesH, 'inline bool ByteOperation(', FILES.notesPortH, errors);
		for (const m of byteOpBody.matchAll(CPP_NARROW_OP_EQ_RE)) byteOpSet.add(m[1]);
	}

	if (notesFrameOps.size > 0) {
		if (!notesFrameUsesAnswerFrame || !notesH.includes('inline Json AnswerFrame(')) {
			const notesReq = sliceBetween(notesH, 'inline Json Request(', 'Refuse("Unsupported native Notes operation");', FILES.notesPortH, errors);
			for (const b of cppIfBlocks(notesReq)) {
				for (const m of b.cond.matchAll(CPP_NARROW_OP_EQ_RE)) {
					const full = 'notes.store.' + m[1];
					if (!notesFrameOps.has(full)) continue;
					const keys = extractNarrowJsonAssigns(b.body, 'out');
					const entry = ensureAnswer(full, `${FILES.rapierCpp} and ${FILES.notesPortH}`);
					entry.hasObject = true;
					if (keys.has('bytes')) {
						entry.metaHasBase64Bytes = true;
						keys.delete('bytes');
					}
					for (const k of keys) entry.keys.add(k);
				}
			}
		} else {
			const ansBody = cppFunctionBody(notesH, 'inline Json AnswerFrame(', FILES.notesPortH, errors);
			for (const b of cppIfBlocks(ansBody)) {
				for (const m of b.cond.matchAll(CPP_NARROW_OP_EQ_RE)) {
					const full = 'notes.store.' + m[1];
					const file = `${FILES.rapierCpp} and ${FILES.notesPortH}`;
					const metaKeys = extractNarrowJsonAssigns(b.body, 'out');
					const entry = ensureAnswer(full, file);
					entry.hasObject = true;
					if (metaKeys.has('bytes')) {
						entry.metaHasBase64Bytes = true;
						metaKeys.delete('bytes');
					}
					for (const k of metaKeys) entry.keys.add(k);
					if (/\breplyBytes\s*=\s*Base64Encode\b/.test(stripCppComments(b.body)) && frameCarriesTopLevelBytes) {
						entry.keys.add('bytes');
					}
				}
			}
		}
	}

	if (req.includes('operation.rfind(L"notes.store.", 0) == 0')) {
		const refusesByteOnControl = /\bRapierNotes::ByteOperation\(\s*step\s*\)/.test(stripCppComments(req));
		const statKeys = extractNarrowJsonAssigns(cppFunctionBody(notesH, 'inline Json StatResult(', FILES.notesPortH, errors), 'out');
		const notesReq = sliceBetween(notesH, 'inline Json Request(', 'Refuse("Unsupported native Notes operation");', FILES.notesPortH, errors);
		for (const b of cppIfBlocks(notesReq)) {
			for (const m of b.cond.matchAll(CPP_NARROW_OP_EQ_RE)) {
				const sub = m[1];
				if (refusesByteOnControl && byteOpSet.has(sub)) continue;
				const full = 'notes.store.' + sub;
				record(control, full, FILES.notesPortH);
				const keys = extractNarrowJsonAssigns(b.body, 'out');
				if (/\bStatResult\s*\(/.test(b.body)) {
					for (const k of statKeys) keys.add(k);
				}
				const entry = ensureAnswer(full, FILES.notesPortH);
				entry.hasObject = true;
				if (keys.size === 0) entry.bareEmpty = true;
				for (const k of keys) entry.keys.add(k);
			}
		}
	}

	if (req.includes('operation.rfind(L"sync.", 0) == 0')) {
		const syncHelpers = {
			bootstrap: extractNarrowJsonAssigns(cppFunctionBody(syncH, 'Json Bootstrap() const', FILES.syncNativeH, errors), 'result'),
			capture: extractNarrowJsonAssigns(cppFunctionBody(syncH, 'Json Capture(', FILES.syncNativeH, errors), 'result'),
			forget: extractNarrowJsonAssigns(cppFunctionBody(syncH, 'Json Forget(', FILES.syncNativeH, errors), 'result'),
			listen: extractNarrowJsonAssigns(cppFunctionBody(syncH, 'Json Listen(', FILES.syncNativeH, errors), 'result'),
			open: extractNarrowJsonAssigns(cppFunctionBody(syncH, 'Json Open(', FILES.syncNativeH, errors), 'result'),
			wait: extractNarrowJsonAssigns(cppFunctionBody(syncH, 'Json Wait(', FILES.syncNativeH, errors), 'result'),
		};
		const syncDisp = sliceBetween(syncH, 'Json Dispatch(const Job& job)', 'throw Refusal("unsupported native Sync operation");', FILES.syncNativeH, errors);
		const collectSyncBlock = (op, rawBlock) => {
			const block = stripCppComments(rawBlock);
			record(control, op, FILES.syncNativeH);
			const keys = extractNarrowJsonAssigns(block, 'result');
			if (block.includes('Bootstrap()')) for (const k of syncHelpers.bootstrap) keys.add(k);
			if (block.includes('Listen(')) for (const k of syncHelpers.listen) keys.add(k);
			if (block.includes('Open(')) for (const k of syncHelpers.open) keys.add(k);
			if (block.includes('Wait(')) for (const k of syncHelpers.wait) keys.add(k);
			if (block.includes('vault_.Capture(')) for (const k of syncHelpers.capture) keys.add(k);
			if (block.includes('vault_.Forget(')) for (const k of syncHelpers.forget) keys.add(k);
			addKeys(op, FILES.syncNativeH, keys);
		};
		for (const b of cppIfBlocks(syncDisp)) {
			const opsInCond = [...b.cond.matchAll(CPP_NARROW_SYNC_OP_RE)].map(m => m[1]);
			if (opsInCond.length === 0) continue;
			const cleanBody = stripCppComments(b.body);
			const innerIfs = cppIfBlocks(cleanBody).filter(inner => /\bop\s*==\s*"([a-zA-Z0-9_.]+)"/.test(inner.cond));
			if (innerIfs.length === 0) {
				for (const op of opsInCond) collectSyncBlock(op, cleanBody);
			} else {
				const handled = new Set();
				let lastEnd = 0;
				for (const inner of innerIfs) {
					for (const m of inner.cond.matchAll(CPP_NARROW_SYNC_OP_RE)) {
						handled.add(m[1]);
						collectSyncBlock(m[1], inner.body);
					}
					if (inner.end > lastEnd) lastEnd = inner.end;
				}
				for (const op of opsInCond) {
					if (!handled.has(op)) collectSyncBlock(op, cleanBody.slice(lastEnd));
				}
			}
		}
	}

	const all = new Map([...control, ...byte]);
	return { control, byte, all, answers, capabilities: windowsCapabilities };
}

const WINDOWS_CAPABILITY_GATES = Object.freeze({
	'window.new': ['newWindow'],
	'notes.attachment.begin': ['notesAttachmentOpen', 'notesAttachmentBytes'],
	'notes.attachment.chunk': ['notesAttachmentOpen', 'notesAttachmentBytes'],
	'notes.pinShortcut': ['notesPin'],
	'sync.bootstrap': ['syncTransport'],
});

function validateWindowsAnswers(nativeOps, windows, errors) {
	for (const [op, dims] of Object.entries(WINDOWS_CAPABILITY_GATES)) {
		const spec = nativeOps[op];
		if (!spec || !spec.hosts.includes('windows')) continue;
		for (const cap of dims) {
			const enabled = windows.capabilities.has(cap);
			const explainedOff = spec.disagreements.some(d => /\bwindows\b/i.test(d) && new RegExp(`\\b${cap}\\b`).test(d) && /\boff\b/i.test(d) && /\bbecause\b/i.test(d));
			if (!enabled && !explainedOff) {
				errors.push(`${op}: Windows PlatformState() omits capability "${cap}" without explaining why in ${FILES.table}; fix ${FILES.rapierCpp} or ${FILES.table}`);
			} else if (enabled && explainedOff) {
				errors.push(`${op}: Windows PlatformState() sets capability "${cap}", but ${FILES.table} still says it is off; fix ${FILES.table}`);
			}
		}
	}
	for (const [op, spec] of Object.entries(nativeOps)) {
		if (!Array.isArray(spec.hosts) || !spec.hosts.includes('windows')) continue;

		for (const diff of spec.disagreements) {
			if (/\bwindows\b/i.test(diff) && !/\bbecause\b/i.test(diff)) {
				errors.push(`${op}: Windows disagreement in ${FILES.table} does not explain why ("because ..."); fix ${expectedWindowsFile(op, spec.byte)} or ${FILES.table}`);
			}
		}

		const actual = windows.answers.get(op);
		const target = actual?.file || expectedWindowsFile(op, spec.byte);
		if (!actual) {
			errors.push(`${op}: could not extract Windows answer shape; fix ${target}`);
			continue;
		}
		if (actual.metaHasBase64Bytes) {
			errors.push(`${op}: Windows puts base64 "bytes" inside meta.result instead of top-level frame.bytes; fix ${target}`);
		}

		if (spec.resultType === 'array') {
			if (!actual.hasArray || actual.hasObject || actual.hasNull) {
				errors.push(`${op}: ${FILES.table} sets resultType "array", but Windows returns a non-array result; fix ${target} or ${FILES.table}`);
			}
			if (actual.keys.size > 0) {
				errors.push(`${op}: ${FILES.table} sets resultType "array" with empty keys, but Windows inserts [${[...actual.keys].join(', ')}]; fix ${target} or ${FILES.table}`);
			}
			continue;
		}
		if (actual.hasArray) {
			errors.push(`${op}: Windows returns a JsonArray, but ${FILES.table} sets resultType "${spec.resultType}"; fix ${target} or ${FILES.table}`);
		}
		if (spec.resultType === 'object|null') {
			if (!actual.hasNull) {
				errors.push(`${op}: ${FILES.table} sets resultType "object|null", but Windows never returns null${actual.bareEmpty ? ' (returns empty {} instead)' : ''}; fix ${target} or ${FILES.table}`);
			}
			if (spec.result.length > 0 && actual.bareEmpty) {
				errors.push(`${op}: Windows returns empty {} where ${FILES.table} requires null or {${spec.result.join(', ')}}; fix ${target}`);
			}
		} else if (actual.hasNull) {
			errors.push(`${op}: Windows can return null, but ${FILES.table} sets resultType "${spec.resultType}"; fix ${target} or ${FILES.table}`);
		}

		const allowed = new Set(spec.result);
		const extra = [...actual.keys].filter(k => !allowed.has(k)).sort();
		if (extra.length > 0) {
			errors.push(`${op}: Windows answer includes unlisted field(s) [${extra.join(', ')}] (table result: [${spec.result.join(', ')}]); fix ${target} or ${FILES.table}`);
		}
		if (spec.result.length > 0 && actual.keys.size === 0) {
			errors.push(`${op}: Windows answers {} with no fields, but ${FILES.table} requires [${spec.result.join(', ')}]; fix ${target} or ${FILES.table}`);
			continue;
		}

		const missing = spec.result.filter(k => !actual.keys.has(k));
		if (missing.length > 0) {
			const winDiffs = spec.disagreements.filter(d => /\bwindows\b/i.test(d) && /\bomits\b/i.test(d) && /\bbecause\b/i.test(d)).join(' ');
			const unexplained = spec.hosts.length > 1
				? missing.filter(k => !new RegExp(`\\b${k}\\b`).test(winDiffs))
				: missing;
			if (unexplained.length > 0) {
				errors.push(`${op}: Windows answer omits field(s) [${unexplained.join(', ')}] listed in ${FILES.table}; fix ${target} or ${FILES.table}`);
			}
		}
	}
}

function parseStandin(repoRoot, nativeOps, errors) {
	const text = readFileSync(join(repoRoot, 'tools/android-sim/host.mjs'), 'utf8');
	const storeBlock = sliceBetween(text, 'function store(', '\n  // `host.overrides[operation]`', FILES.standin, errors);
	const controlBlock = sliceBetween(text, 'function control(', '\n  function frame(', FILES.standin, errors);
	const frameBlock = sliceBetween(text, 'function frame(', '\n  async function deliver(', FILES.standin, errors);

	const storeOps = new Set();
	for (const m of storeBlock.matchAll(STANDIN_CASE_RE)) storeOps.add(m[1]);

	const controlGatedByTable =
		/Object\.hasOwn\(\s*NATIVE_OPS\s*,\s*operation\s*\)/.test(controlBlock) &&
		/!spec\.hosts\.includes\(\s*'android'\s*\)/.test(controlBlock) &&
		/!spec\.hosts\.includes\(\s*'standin'\s*\)/.test(controlBlock);
	if (!controlGatedByTable) {
		errors.push(`stand-in control() does not guard operations against NATIVE_OPS android/standin membership; fix ${FILES.standin}`);
	}

	if (/default:\s*return\s*\{\s*\}/.test(controlBlock)) {
		errors.push(`wildcard "default: return {}" answers unlisted and non-Android operations; fix ${FILES.standin}`);
	}

	const emptyResultFromTable =
		controlGatedByTable &&
		/default:\s*(?:\/\/[^\n]*\n\s*)*if\s*\(\s*spec\.resultType\s*===\s*'object'\s*&&\s*spec\.result\.length\s*===\s*0\s*\)\s*return\s*\{\s*\}/.test(controlBlock);

	const control = new Map();
	const byte = new Map();
	for (const m of controlBlock.matchAll(STANDIN_IF_OP_EQ_RE)) control.set(m[1], FILES.standin);
	for (const m of controlBlock.matchAll(STANDIN_CASE_RE)) control.set(m[1], FILES.standin);

	if (controlBlock.includes("operation.startsWith('notes.store.')")) {
		for (const sub of storeOps) {
			const full = 'notes.store.' + sub;
			if (!controlGatedByTable || (Object.hasOwn(nativeOps, full) && nativeOps[full].hosts?.includes('standin'))) {
				control.set(full, FILES.standin);
			}
		}
	}
	if (controlBlock.includes("operation.startsWith('recovery.store.')")) {
		for (const sub of storeOps) {
			const full = 'recovery.store.' + sub;
			if (!controlGatedByTable || (Object.hasOwn(nativeOps, full) && nativeOps[full].hosts?.includes('standin'))) {
				control.set(full, FILES.standin);
			}
		}
	}

	if (emptyResultFromTable) {
		for (const spec of Object.values(nativeOps)) {
			if (!spec || spec.byte || !Array.isArray(spec.hosts) || !spec.hosts.includes('standin')) continue;
			if (spec.name.startsWith('notes.store.') || spec.name.startsWith('recovery.store.')) continue;
			if (spec.resultType === 'object' && Array.isArray(spec.result) && spec.result.length === 0) {
				control.set(spec.name, FILES.standin);
			}
		}
	}

	const frameGatedByTable =
		/Object\.hasOwn\(\s*NATIVE_OPS\s*,\s*head\.op\s*\)/.test(frameBlock) &&
		/!spec\.hosts\.includes\(\s*'android'\s*\)/.test(frameBlock) &&
		/!spec\.hosts\.includes\(\s*'standin'\s*\)/.test(frameBlock);
	if (!frameGatedByTable) {
		errors.push(`stand-in frame() does not guard byte operations against NATIVE_OPS android/standin membership; fix ${FILES.standin}`);
	}
	for (const m of frameBlock.matchAll(STANDIN_FRAME_EQ_RE)) byte.set(m[1], FILES.standin);
	for (const m of frameBlock.matchAll(STANDIN_FRAME_LIST_RE)) {
		for (const item of m[1].matchAll(STANDIN_SINGLE_QUOTED_RE)) byte.set(item[1], FILES.standin);
	}

	const all = new Map([...control, ...byte]);
	return { control, byte, all };
}

function validateTableStructure(mod, errors) {
	const { NATIVE_OPS, NATIVE_HOSTS } = mod;
	if (!NATIVE_OPS || typeof NATIVE_OPS !== 'object' || !Object.isFrozen(NATIVE_OPS)) {
		errors.push(`NATIVE_OPS must be a frozen object; fix ${FILES.table}`);
		return {};
	}
	const allowedHosts = new Set(['android', 'windows', 'standin']);
	if (!Array.isArray(NATIVE_HOSTS) || !Object.isFrozen(NATIVE_HOSTS)) {
		errors.push(`NATIVE_HOSTS must be a frozen array; fix ${FILES.table}`);
	}
	for (const [key, spec] of Object.entries(NATIVE_OPS)) {
		if (!spec || typeof spec !== 'object' || !Object.isFrozen(spec)) {
			errors.push(`${key}: entry is not frozen; fix ${FILES.table}`);
			continue;
		}
		if (spec.name !== key) {
			errors.push(`${key}: entry.name "${spec.name}" does not match its table key; fix ${FILES.table}`);
		}
		if (!Array.isArray(spec.hosts) || !Object.isFrozen(spec.hosts) || spec.hosts.length === 0) {
			errors.push(`${key}: hosts must be a non-empty frozen array; fix ${FILES.table}`);
		} else {
			for (const h of spec.hosts) {
				if (!allowedHosts.has(h)) errors.push(`${key}: unknown host "${h}"; fix ${FILES.table}`);
			}
			if (new Set(spec.hosts).size !== spec.hosts.length) {
				errors.push(`${key}: duplicate host in hosts array; fix ${FILES.table}`);
			}
		}
		if (typeof spec.byte !== 'boolean') {
			errors.push(`${key}: byte must be a boolean; fix ${FILES.table}`);
		}
		if (!spec.args || typeof spec.args !== 'object' || Array.isArray(spec.args) || !Object.isFrozen(spec.args)) {
			errors.push(`${key}: args must be a frozen plain object of {key: type}; fix ${FILES.table}`);
		} else {
			for (const [argKey, argType] of Object.entries(spec.args)) {
				if (typeof argType !== 'string' || !argType.trim()) {
					errors.push(`${key}: argument "${argKey}" is missing a type string; fix ${FILES.table}`);
				}
			}
		}
		if (!Array.isArray(spec.result) || !Object.isFrozen(spec.result)) {
			errors.push(`${key}: result must be a frozen array of result keys; fix ${FILES.table}`);
		}
		if (!['object', 'object|null', 'array'].includes(spec.resultType)) {
			errors.push(`${key}: invalid resultType "${spec.resultType}"; fix ${FILES.table}`);
		}
		if (typeof spec.purpose !== 'string' || !spec.purpose.trim() || spec.purpose.includes('\n')) {
			errors.push(`${key}: purpose must be a single non-empty line; fix ${FILES.table}`);
		}
		if (!Array.isArray(spec.disagreements) || !Object.isFrozen(spec.disagreements)) {
			errors.push(`${key}: disagreements must be a frozen array; fix ${FILES.table}`);
		}
	}
	return NATIVE_OPS;
}

export async function checkNativeOps(repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'), { bustCache = false } = {}) {
	const errors = [];
	const tableUrl = pathToFileURL(join(repoRoot, 'shell/native-ops.mjs')).href + (bustCache ? `?v=${Date.now()}-${Math.random()}` : '');
	const mod = await import(tableUrl);
	const nativeOps = validateTableStructure(mod, errors);

	const pageOps = parsePage(repoRoot, errors);
	const hasAndroidTree = existsSync(join(repoRoot, 'android'));
	const android = hasAndroidTree ? parseAndroid(repoRoot, errors) : null;
	const windows = parseWindows(repoRoot, errors);
	const standin = parseStandin(repoRoot, nativeOps, errors);

	for (const op of [...pageOps].sort()) {
		if (!Object.hasOwn(nativeOps, op)) {
			errors.push(`${op}: called in ${FILES.page} but missing from ${FILES.table}; add ${op} to ${FILES.table} or fix ${FILES.page}`);
		} else if (nativeOps[op].uncalled === true) {
			errors.push(`${op}: marked uncalled in ${FILES.table} but called in ${FILES.page}; fix ${FILES.table}`);
		}
	}

	for (const [op, spec] of Object.entries(nativeOps)) {
		const openPortFamily = op.startsWith('notes.store.') || op.startsWith('sync.') || op === 'shares.list' || op === 'shares.ack';
		if (!openPortFamily && !pageOps.has(op) && spec.uncalled !== true) {
			errors.push(`${op}: listed in ${FILES.table} without uncalled: true, and never called in ${FILES.page}; fix ${FILES.page} or mark uncalled in ${FILES.table}`);
		}
	}

	const hostMaps = {
		...(android ? { android: { ...android, expectedFile: expectedAndroidFile } } : {}),
		windows: { ...windows, expectedFile: expectedWindowsFile },
		standin: { ...standin, expectedFile: () => FILES.standin },
	};
	for (const [op, spec] of Object.entries(nativeOps)) {
		if (!Array.isArray(spec.hosts)) continue;
		if (spec.hosts.includes('standin') && !spec.hosts.includes('android')) {
			errors.push(`${op}: ${FILES.table} names standin without android, so ${FILES.standin} would answer an operation Android does not; fix ${FILES.table} or ${FILES.bridgeKt}`);
		}
		for (const hostName of spec.hosts) {
			const host = hostMaps[hostName];
			if (!host) continue;
			const laneMap = spec.byte ? host.byte : host.control;
			const otherMap = spec.byte ? host.control : host.byte;
			const target = host.expectedFile(op, spec.byte);
			if (!laneMap.has(op)) {
				if (otherMap.has(op)) {
					errors.push(`${op}: ${FILES.table} sets byte: ${spec.byte} for ${hostName}, but ${otherMap.get(op)} answers it on the ${spec.byte ? 'JSON control' : 'byte frame'} lane; fix ${target} or ${FILES.table}`);
				} else {
					errors.push(`${op}: ${FILES.table} names host "${hostName}" but no ${spec.byte ? 'byte-frame' : 'control'} handler answers it; fix ${target} or ${FILES.table}`);
				}
			} else if (otherMap.has(op)) {
				errors.push(`${op}: ${FILES.table} sets byte: ${spec.byte} for ${hostName}, and ${otherMap.get(op)} also answers it on the ${spec.byte ? 'JSON control' : 'byte frame'} lane; fix ${otherMap.get(op)}`);
			}
		}
	}

	for (const [hostName, host] of Object.entries(hostMaps)) {
		for (const [op, sourceFile] of [...host.all.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			if (!Object.hasOwn(nativeOps, op)) {
				errors.push(`${op}: ${hostName} answers an operation not listed in ${FILES.table}; fix ${sourceFile} or ${FILES.table}`);
			} else if (!nativeOps[op].hosts.includes(hostName)) {
				errors.push(`${op}: ${hostName} answers ${op} in ${sourceFile}, but ${FILES.table} lists hosts [${nativeOps[op].hosts.join(', ')}]; fix ${sourceFile} or ${FILES.table}`);
			}
		}
	}

	if (android) {
		for (const [op, sourceFile] of [...standin.all.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			if (!android.all.has(op)) {
				errors.push(`${op}: stand-in answers ${op} in ${sourceFile}, which Android (${FILES.bridgeKt}) does not answer; fix ${sourceFile}`);
			}
		}
	}

	const transport = readFileSync(join(repoRoot, 'shell/native-transport.mjs'), 'utf8');
	const listed = TRANSPORT_BYTE_OPS_RE.exec(transport);
	if (!listed) errors.push(`NATIVE_BYTE_OPS is missing; fix shell/native-transport.mjs`);
	else {
		const have = new Set([...listed[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
		const want = new Set([...Object.values(nativeOps).filter(spec => spec.byte).map(spec => spec.name), ...INTAKE_BYTE_OPS]);
		for (const name of want) if (!have.has(name)) errors.push(`${name}: byte: true in ${FILES.table} but missing from NATIVE_BYTE_OPS; fix shell/native-transport.mjs`);
		for (const name of have) if (!want.has(name)) errors.push(`${name}: in NATIVE_BYTE_OPS but not a byte operation in ${FILES.table}; fix shell/native-transport.mjs or ${FILES.table}`);
	}

	validateWindowsAnswers(nativeOps, windows, errors);

	return {
		ok: errors.length === 0,
		errors,
		androidChecked: Boolean(android),
		counts: {
			table: Object.keys(nativeOps).length,
			page: pageOps.size,
			android: android ? android.all.size : null,
			windows: windows.all.size,
			standin: standin.all.size,
		},
	};
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const customRoot = process.argv[2] && !process.argv[2].startsWith('--') ? resolve(process.argv[2]) : undefined;
	const result = await checkNativeOps(customRoot);
	if (!result.ok) {
		for (const err of result.errors) console.error(`check-native-ops: ${err}`);
		process.exit(1);
	}
	const androidSummary = result.androidChecked ? String(result.counts.android) : 'skipped (no repo/android tree)';
	console.log(`check-native-ops: ok (${result.counts.table} operations; android=${androidSummary}, windows=${result.counts.windows}, standin=${result.counts.standin}, platform.js=${result.counts.page})`);
}
