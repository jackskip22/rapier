// SPDX-License-Identifier: AGPL-3.0-only

export const NATIVE_HOSTS = Object.freeze(['android', 'windows', 'standin']);

const ALL = Object.freeze(['android', 'windows', 'standin']);
const ANDROID_STANDIN = Object.freeze(['android', 'standin']);
const ANDROID_WINDOWS = Object.freeze(['android', 'windows']);
const ANDROID = Object.freeze(['android']);
const WINDOWS = Object.freeze(['windows']);
const NO_ARGS = Object.freeze({});
const NO_KEYS = Object.freeze([]);
const NO_DIFFS = Object.freeze([]);

function op(name, hosts, args, result, purpose, options = {}) {
	return Object.freeze({
		name,
		hosts,
		byte: options.byte === true,
		args: Object.keys(args).length ? Object.freeze({ ...args }) : NO_ARGS,
		result: result.length ? Object.freeze([...result]) : NO_KEYS,
		resultType: options.resultType || 'object',
		purpose,
		uncalled: options.uncalled === true,
		disagreements: options.disagreements?.length ? Object.freeze([...options.disagreements]) : NO_DIFFS,
	});
}

const MEDIA_RESULT = ['id', 'key', 'position', 'duration', 'paused', 'ended', 'speed', 'error'];
const STAT_RESULT = ['size', 'modified', 'missing'];
const PRO_RESULT = ['available', 'unlocked', 'billingStatus', 'purchasePending', 'acknowledgementPending', 'message'];
const RESOURCE_RESULT = ['pack', 'status', 'progress', 'error', 'plugins', 'words'];
const REMINDER_STATE_RESULT = ['notificationsAllowed', 'exact', 'blocked'];

const ENTRIES = [
	op('platform.state', ALL, {}, [
		'platformId', 'capabilities', 'resources', 'partPacks', 'notesStoreGeneration',
		'notesBackupSettings', 'waterPro', 'launcherIcon', 'recents', 'pendingIntake',
		'saveRecoveryPending', 'recoveryAutoResume', 'currentFileBound', 'currentFileAuthority',
		'currentFileGeneration', 'pro', 'support', 'windowInsets', 'installation', 'accent',
	], 'Read the native host bootstrap capabilities, bindings, entitlements and window state.', {
		disagreements: [
			'windows omits Android-only bootstrap fields (resources, partPacks, notesBackupSettings, waterPro, launcherIcon, saveRecoveryPending, recoveryAutoResume, support, windowInsets, installation) because desktop bundles resources in RCDATA and has no Play packs, Android cloud backup, launcher-icon aliases or system window insets; PlatformState() leaves notesPin off because MSIX VFS redirects FOLDERID_Programs out of Start Menu and versioned WindowsApps .lnk targets break across Store updates (note-shortcuts.h:51,88), and leaves syncTransport off because desktop OAuth client IDs are unregistered in this cut (sync-native.h:202,217)',
			'android and standin omit accent because only the Windows Watercolor app takes the person\'s Windows accent color (shell/platform.js, the owner 25 Nov ~17:25 AWST)',
			'standin baseState() sets pro to {unlocked, state} instead of {available, unlocked, billingStatus, purchasePending, ...} and waterPro to {unlocked: false} instead of {available, features}',
		],
	}),
	op('page.ready', ALL, {}, [], 'Tell the native host the editor document is interactive and ready for deferred work and receipts.'),
	op('window.theme', ALL, { dark: 'boolean' }, [], 'Publish the active light or dark window chrome theme to the native host.'),
	op('window.backState', ANDROID_STANDIN, { consumes: 'boolean' }, [], 'Publish whether the page currently handles Android system Back itself.'),
	op('window.gestureExclusion', ANDROID_STANDIN, {
		rect: 'object|null',
		width: 'number',
	}, [], 'Update Android system-gesture exclusion bounds over the active drawing canvas.'),
	op('window.requestClose', ALL, {}, [], 'Ask the native host to begin its window or activity close negotiation.'),
	op('window.closeApproved', ALL, { closeToken: 'number' }, ['closeToken', 'closing', 'cancelled'], 'Confirm that the page has settled state for a close token and may close.', {
		disagreements: [
			'standin returns {} instead of {closeToken, closing: true} or {closeToken, cancelled: true} (host.mjs:236 vs RapierBridge.kt:69, rapier.cpp:1284)',
		],
	}),
	op('window.cancelClose', ALL, { closeToken: 'number' }, ['closeToken', 'closing', 'cancelled'], 'Withdraw or cancel a pending native window close negotiation by token.'),
	op('window.checkpointCompleted', ALL, { checkpoint: 'number', kept: 'boolean' }, [], 'Report completion of a host-requested pause or departure recovery checkpoint.', {
		disagreements: [
			'android reads checkpoint and ignores kept (RapierBridge.kt:618) because only desktop departure retention tracks kept',
		],
	}),
	op('window.new', WINDOWS, {}, ['opened'], 'Open a new desktop Rapier window when the current window has been touched.', {
		disagreements: ['windows leaves newWindow off because a person would see a new choice on Windows, which waits for the owner\'s word with pictures; the handler answers'],
	}),
	op('document.dirty', ALL, { dirty: 'boolean' }, [], 'Publish whether the open document has unsaved edits that block unconfirmed close.'),
	op('document.title', WINDOWS, { title: 'string' }, [], 'Update the native desktop window title for the active document.'),
	op('operations.listed', ANDROID_STANDIN, { tools: 'array' }, [], 'Publish the page tool definitions to the Android on-device agent bridge.'),
	op('operations.result', ANDROID_STANDIN, {
		callId: 'string',
		ok: 'boolean',
		result: 'object?',
		error: 'string?',
	}, [], 'Return the page result or error for one host-invoked agent tool call.'),

	op('file.open', ALL, { purpose: 'string?' }, ['started', 'cancelled'], 'Open the native file picker and stream the chosen file over RapierIntake.'),
	op('file.readCurrent', ANDROID_WINDOWS, {
		documentAuthority: 'string',
	}, ['started', 'cancelled'], 'Re-read the currently bound external file over RapierIntake.'),
	op('file.checkExternal', ANDROID_WINDOWS, { documentAuthority: 'string' }, ['status', 'fileGeneration'], 'Inspect whether the bound external file changed or disappeared outside Rapier.'),
	op('document.acceptOpened', ALL, {
		path: 'string',
		documentAuthority: 'string',
		nativeDocumentAuthority: 'string',
		fileGeneration: 'string|null',
		intakeId: 'number',
	}, ['bound'], 'Bind the editor to a delivered intake file after verifying authority and generation.', {
		disagreements: [
			'standin checks only Boolean(args.path) and ignores documentAuthority, nativeDocumentAuthority, fileGeneration and intakeId (host.mjs:178)',
		],
	}),
	op('document.detach', ALL, { documentAuthority: 'string' }, [], 'Release the native host binding to the current external file.', {
		disagreements: [
			'android detaches unconditionally without reading args.documentAuthority (RapierBridge.kt:576) because Android holds a single activity URI binding',
		],
	}),
	op('document.ackSaveResult', ALL, {
		requestId: 'string',
		payloadDigest: 'string',
	}, ['acknowledged'], 'Acknowledge a durable document.saveResult receipt so the host can retire it.'),
	op('intake.clear', ALL, { intakeId: 'number?' }, [], 'Release a pending or refused RapierIntake payload on the native host.'),
	op('save.choose', WINDOWS, {
		name: 'string',
		documentAuthority: 'string',
		documentGeneration: 'number',
		documentRevision: 'number',
		fileGeneration: 'string|null',
	}, ['cancelled', 'token', 'name'], 'Prompt for a Save As destination up front so the page can encode for the chosen extension.'),
	op('transfer.begin', ALL, {
		purpose: 'string',
		requestId: 'string',
		name: 'string',
		mime: 'string',
		documentAuthority: 'string',
		documentGeneration: 'number',
		documentRevision: 'number',
		fileGeneration: 'string|null',
		exclusiveNewDestination: 'boolean?',
		chosenDestination: 'string?',
		payloadLength: 'number',
		payloadDigest: 'string',
	}, ['accepted', 'chunkBytes', 'generation'], 'Begin a chunked page-to-host byte transfer for Save, Save As, Export, Share or Water video.'),
	op('transfer.chunk', ALL, {
		requestId: 'string',
		sequence: 'number',
		bytes: 'bytes',
	}, ['sequence', 'received'], 'Send one verified byte chunk of an active page-to-host document transfer.', { byte: true }),
	op('transfer.end', ALL, { requestId: 'string' }, ['accepted', 'picker', 'shared'], 'Seal an active document transfer and launch the save write or system share sheet.'),
	op('transfer.cancel', ALL, { requestId: 'string' }, ['accepted', 'cancelled', 'status'], 'Cancel an unaccepted or in-progress page-to-host document transfer.'),
	op('document.print', ANDROID_WINDOWS, { name: 'string' }, ['started'], 'Open the native system print UI for the current document.', {
		disagreements: [
			'windows ignores args.name because WebView2 ICoreWebView2_16::ShowPrintUI takes no job-name parameter and uses document.title',
		],
	}),
	op('clipboard.write', WINDOWS, { text: 'string', html: 'string' }, ['copied'], 'Write plain text and HTML formats to the native desktop clipboard.'),
	op('external.open', ANDROID_WINDOWS, { url: 'string' }, ['opened'], 'Open an admitted external URI in the operating system handler.'),
	op('recent.note', ALL, {
		name: 'string',
		path: 'string',
		documentAuthority: 'string',
	}, [], 'Record a bound external file in the native recent-files list.'),
	op('recent.open', ALL, { path: 'string' }, [], 'Reopen a previously recorded native recent file by path.'),

	op('folder.choose', ANDROID_WINDOWS, {}, ['cancelled', 'token', 'root', 'capabilities', 'platform', 'status', 'provider', 'reason'], 'Pick a user folder and open a pinned original-folder session.', {
		disagreements: [
			'windows resolves unusable folders with {status: "unavailable", provider: "windows", reason} because the desktop original-folder client reads structured broker refusals, whereas android rejects with FolderRefused (RapierOriginalFolder.kt:38)',
		],
	}),
	op('folder.call', ANDROID_WINDOWS, {
		token: 'string',
		method: 'string',
		args: 'object?',
	}, ['value', 'error'], 'Invoke a method on an open original-folder session by token.'),
	op('folder.close', ANDROID_WINDOWS, { token: 'string' }, [], 'Close an open original-folder session and release its pins and staging.'),

	op('resources.status', ALL, { id: 'string' }, RESOURCE_RESULT, 'Read the install state of the plug-in pack carrying a resource id.', {
		disagreements: [
			'windows omits pack, progress, error, plugins and words because desktop plug-in resources are embedded in executable RCDATA and always return {status: "ready"}; standin returns {status: "absent", progress: 0} when pluginPacks is unset (host.mjs:259)',
		],
	}),
	op('resources.ensure', ALL, { id: 'string' }, RESOURCE_RESULT, 'Download or verify the plug-in pack carrying a resource id.', {
		disagreements: [
			'windows omits pack, progress, error, plugins and words because desktop plug-in resources are embedded in executable RCDATA and always return {status: "ready"}',
		],
	}),
	op('resources.remove', ANDROID_STANDIN, { id: 'string' }, RESOURCE_RESULT, 'Request removal of an on-demand Google Play plug-in pack.'),
	op('parts.ensure', ANDROID_STANDIN, { id: 'string' }, ['id', 'status'], 'Bring an on-demand Google Play app part pack onto the device.'),
	op('platform.microphoneSettings', ANDROID_WINDOWS, {}, ['opened'], 'Open the operating system microphone permission settings screen.'),
	op('platform.appStorage', ANDROID_STANDIN, {}, ['opened', 'cleared'], 'Open Android system application storage settings for Rapier.'),
	op('storage.report', ANDROID_STANDIN, {}, [
		'complete', 'incomplete', 'errors', 'symlinksRefused', 'outsideRefused', 'entries', 'buckets',
	], 'Count Rapier storage usage by bucket without deleting files.'),
	op('storage.clearTemporary', ANDROID_STANDIN, {}, [
		'removedBytes', 'failures', 'skipped', 'refused', 'cancelled', 'partial',
	], 'Delete allowlisted expired staging, temporary Note files and old acknowledged shares.'),
	op('storage.cancel', ANDROID_STANDIN, {}, [], 'Cancel an active Android storage count or temporary-files cleanup.'),

	op('pro.purchase', ANDROID_WINDOWS, {}, PRO_RESULT, 'Start a native store purchase flow for Rapier Pro.', {
		disagreements: [
			'windows omits acknowledgementPending and always includes message because Microsoft Store durable add-ons require no client acknowledgement and ProAsync/ProStateOf is owned by the FACTORY F4/S3 Store purchase lane',
		],
	}),
	op('pro.restore', ANDROID_WINDOWS, {}, PRO_RESULT, 'Restore and re-query the user Rapier Pro store entitlement.', {
		disagreements: [
			'windows omits acknowledgementPending and always includes message because Microsoft Store durable add-ons require no client acknowledgement and ProAsync/ProStateOf is owned by the FACTORY F4/S3 Store purchase lane',
		],
	}),
	op('pro.refresh', ALL, {}, [...PRO_RESULT, 'state'], 'Refresh the cached Rapier Pro entitlement state from the native store.', {
		disagreements: [
			'windows omits acknowledgementPending and state because Microsoft Store durable add-ons require no client acknowledgement and ProAsync/ProStateOf is owned by the FACTORY F4/S3 Store purchase lane; standin returns {unlocked, state} (host.mjs:87, 174)',
		],
	}),
	op('pro.review', ANDROID, { code: 'string' }, PRO_RESULT, 'Redeem a Google Play review access code on the native entitlement owner.'),
	op('support.state', ANDROID_STANDIN, {}, [
		'available', 'products', 'billingStatus', 'purchasePending', 'consumptionPending', 'product', 'message',
	], 'Read the Android Support Rapier tip-jar billing state.', {
		resultType: 'object|null',
		uncalled: true,
		disagreements: [
			'platform.js never calls support.state (it reads support from platform.state and support.changed); android returns a billing object (RapierBilling.kt:719-728) while standin returns null (host.mjs:258)',
		],
	}),
	op('support.purchase', ANDROID, { product: 'string' }, [
		'available', 'products', 'billingStatus', 'purchasePending', 'consumptionPending', 'product', 'message',
	], 'Launch a consumable Google Play Support Rapier purchase.'),
	op('review.saved', ANDROID_STANDIN, { identity: 'string' }, ['saved'], 'Record a saved note identity toward Google Play in-app review eligibility.'),
	op('review.finished', ANDROID_STANDIN, { kind: 'string', token: 'string' }, [], 'Report a finished user act toward Google Play in-app review readiness.'),
	op('review.launch', ANDROID_STANDIN, { token: 'string' }, [], 'Launch the armed Google Play in-app review sheet for a ready token.'),
	op('review.cancel', ANDROID_STANDIN, {}, [], 'Cancel any armed Google Play in-app review request on new interaction.'),
	op('water.pro.state', ANDROID_STANDIN, {}, ['available', 'features', 'unlocked'], 'Read the native watercolor Pro entitlement and feature list.', {
		uncalled: true,
		disagreements: [
			'platform.js never calls water.pro.state; android returns {available, features} (RapierWaterPro.kt:11-15) while standin returns {unlocked: false} (host.mjs:257)',
		],
	}),
	op('water.pro.authorize', ANDROID, { feature: 'string' }, ['authorized'], 'Verify native entitlement for a Pro watercolor feature.'),
	op('water.palettes.read', ANDROID, {}, ['revision', 'palettes'], 'Read saved custom watercolor palettes from atomic native storage.'),
	op('water.palettes.write', ANDROID, { revision: 'string', palettes: 'array' }, ['revision', 'palettes'], 'Atomically replace saved watercolor palettes when the revision matches.'),
	op('launcherIcon.set', ANDROID, { color: 'string' }, ['color'], 'Select the Android launcher icon color alias.'),

	op('tts.speak', ANDROID, {
		text: 'string',
		utteranceId: 'string',
		rate: 'number',
	}, ['accepted', 'reason'], 'Start Android text-to-speech playback for an utterance.'),
	op('tts.stop', ANDROID_STANDIN, {}, [], 'Stop active Android text-to-speech playback.'),
	op('tts.pause', ANDROID_STANDIN, {}, [], 'Pause Android text-to-speech playback (stops the utterance on Android).'),
	op('tts.resume', ANDROID_STANDIN, {}, [], 'Acknowledge text-to-speech resume after a page-managed pause.'),
	op('voice.begin', ANDROID_STANDIN, { lang: 'string' }, ['words', 'why'], 'Start Android foreground voice capture and on-device speech recognition.'),
	op('voice.pcm', ANDROID_STANDIN, { data: 'string' }, [], 'Feed base64 PCM audio samples into the on-device speech recognizer.'),
	op('voice.pause', ANDROID_STANDIN, { paused: 'boolean' }, [], 'Update pause state for active voice capture and its foreground notification.'),
	op('voice.end', ANDROID_STANDIN, {}, [], 'Stop active voice capture and settle final recognized speech.'),
	op('voice.dialog', ANDROID_STANDIN, { lang: 'string' }, ['text', 'unavailable'], 'Open the system speech-recognition dialog for a single spoken phrase.'),
	op('media.playing', ANDROID_STANDIN, { playing: 'boolean' }, [], 'Hold or release the WebView background wake state while HTML audio is playing.'),
	op('media.prepare', ANDROID, { key: 'string', title: 'string?' }, MEDIA_RESULT, 'Prepare a Notes audio file in the Android foreground media playback service.'),
	op('media.play', ANDROID, { id: 'string' }, MEDIA_RESULT, 'Start or resume Android foreground playback for the prepared audio session.'),
	op('media.pause', ANDROID, { id: 'string' }, MEDIA_RESULT, 'Pause Android foreground playback for the prepared audio session.'),
	op('media.seek', ANDROID, { id: 'string', position: 'number' }, MEDIA_RESULT, 'Seek the prepared Android audio session to a millisecond position.'),
	op('media.speed', ANDROID, { id: 'string', speed: 'number' }, MEDIA_RESULT, 'Change the playback speed of the prepared Android audio session.'),
	op('media.stop', ANDROID, { id: 'string' }, MEDIA_RESULT, 'Stop and release the prepared Android audio playback session.'),
	op('media.state', ANDROID, {}, MEDIA_RESULT, 'Read the current Android foreground audio playback session state.', {
		uncalled: true,
		disagreements: [
			'android answers media.state in RapierBridge.kt:673 and RapierPlaybackService.kt:133,140, but platform.js (_nativeCreateAudio) never calls it',
		],
	}),
	op('reminders.state', ANDROID_STANDIN, {}, REMINDER_STATE_RESULT, 'Read Android notification and exact-alarm grant state for Notes reminders.'),
	op('reminders.permission', ANDROID, {}, [...REMINDER_STATE_RESULT, 'scheduled'], 'Request Android notification permission and refresh scheduled reminders.'),
	op('reminders.actions', ANDROID_STANDIN, {}, ['actions'], 'Read pending Done or Snooze actions taken on Android reminder notifications.'),
	op('reminders.ack', ANDROID, { tokens: 'array' }, ['acknowledged'], 'Acknowledge applied Android reminder notification action tokens.'),
	op('reminders.settings', ANDROID, { kind: 'string' }, ['opened'], 'Open Android notification or exact-alarm system settings for reminders.'),
	op('reminders.begin', ANDROID_STANDIN, { id: 'string' }, [], 'Begin a batched upload of Notes reminder rows.'),
	op('reminders.rows', ANDROID_STANDIN, { id: 'string', rows: 'array' }, [], 'Append up to 64 reminder rows to the active reminder upload.'),
	op('reminders.commit', ANDROID_STANDIN, { id: 'string' }, [...REMINDER_STATE_RESULT, 'scheduled'], 'Persist and arm the uploaded Notes reminder table on Android.'),
	op('reminders.cancel', ANDROID_STANDIN, { id: 'string' }, [], 'Discard an unfinished batched reminder upload by id.'),

	op('recovery.store.prepare', ANDROID_STANDIN, {}, ['writable', 'reason', 'storageFull'], 'Verify and prepare the native binary recovery directory.'),
	op('recovery.store.list', ANDROID_STANDIN, { prefix: 'string?' }, ['names'], 'List snapshot filenames in the native binary recovery store.'),
	op('recovery.store.stat', ANDROID_STANDIN, { name: 'string' }, STAT_RESULT, 'Read byte size and modification time of one recovery file.', {
		uncalled: true,
		disagreements: [
			'android (RapierBridge.kt:612, NativeRecovery.kt:26) and standin answer recovery.store.stat, but platform.js (_nativeBinaryRecoveryStore) never calls it',
		],
	}),
	op('recovery.store.read.begin', ANDROID_STANDIN, { id: 'string', name: 'string' }, STAT_RESULT, 'Open a bounded read handle on a binary recovery snapshot file.'),
	op('recovery.store.read.chunk', ANDROID_STANDIN, {
		id: 'string',
		offset: 'number',
		size: 'number',
	}, ['offset', 'bytes'], 'Read a byte chunk from an open binary recovery read handle.', { byte: true }),
	op('recovery.store.read.close', ANDROID_STANDIN, { id: 'string' }, [], 'Close an open binary recovery read handle.'),
	op('recovery.store.write.begin', ANDROID_STANDIN, {
		id: 'string',
		name: 'string',
		size: 'number',
		digest: 'string',
		expectedDigest: 'string|null?',
	}, [], 'Begin a verified atomic write (or compared pointer write) in recovery storage.'),
	op('recovery.store.write.chunk', ANDROID_STANDIN, {
		id: 'string',
		offset: 'number',
		bytes: 'bytes',
	}, ['offset'], 'Append a byte chunk to an open binary recovery write.', { byte: true }),
	op('recovery.store.write.commit', ANDROID_STANDIN, { id: 'string' }, ['written', 'kept', 'recreated'], 'Verify digest and atomically commit a staged binary recovery write.'),
	op('recovery.store.write.abort', ANDROID_STANDIN, { id: 'string' }, [], 'Abort and delete a staged binary recovery write.'),
	op('recovery.store.remove', ANDROID_STANDIN, { name: 'string' }, [], 'Remove a file from the native binary recovery store.'),

	op('notes.store.prepare', ALL, {}, ['writable', 'reason', 'storageFull'], 'Prepare the native Notes store directory and verify atomic write support.'),
	op('notes.store.list', ALL, { prefix: 'string?' }, ['names'], 'List filenames directly under a prefix in the native Notes store.'),
	op('notes.store.stat', ALL, { name: 'string' }, STAT_RESULT, 'Read size and modification timestamp of a file in the native Notes store.'),
	op('notes.store.stat.all', ALL, { prefix: 'string?' }, ['names', 'sizes', 'modified'], 'Read names, sizes and modification times of all files under a Notes prefix.'),
	op('notes.store.read.begin', ALL, { id: 'string', name: 'string' }, STAT_RESULT, 'Open a snapshot read handle for a file in the native Notes store.'),
	op('notes.store.read.chunk', ALL, {
		id: 'string',
		offset: 'number',
		size: 'number',
	}, ['offset', 'bytes'], 'Read a byte chunk from an open Notes read handle.', { byte: true }),
	op('notes.store.read.close', ALL, { id: 'string' }, [], 'Close an open Notes read handle.'),
	op('notes.store.write.begin', ALL, {
		id: 'string',
		name: 'string',
		size: 'number',
		digest: 'string',
	}, [], 'Begin a staged SHA-256 verified write in the native Notes store.'),
	op('notes.store.write.chunk', ALL, {
		id: 'string',
		offset: 'number',
		bytes: 'bytes',
	}, ['offset'], 'Append a byte chunk to an open Notes staged write.', { byte: true }),
	op('notes.store.write.commit', ALL, { id: 'string' }, ['written', 'kept', 'recreated'], 'Verify readback digest and atomically commit a staged Notes write.', {
		disagreements: [
			'standin returns only {written} and never populates optional kept or recreated fields (host.mjs:113 vs NativeNotesPort.kt:41-44, notes-port.h:118-121)',
		],
	}),
	op('notes.store.write.abort', ALL, { id: 'string' }, [], 'Abort and remove an uncommitted Notes staged write.'),
	op('notes.store.remove', ALL, { name: 'string' }, [], 'Delete a file from the native Notes store.'),
	op('notes.store.recording.begin', ALL, { name: 'string' }, ['size'], 'Create or open an appendable Notes audio recording file.'),
	op('notes.store.recording.append', ALL, {
		name: 'string',
		offset: 'number',
		bytes: 'bytes',
	}, ['offset'], 'Append audio bytes at the expected offset of an active Notes recording.', { byte: true }),
	op('notes.store.lock.acquire', ALL, {
		id: 'string',
		name: 'string',
		ifAvailable: 'boolean',
	}, ['acquired'], 'Acquire a cross-window native Notes writer or operational lease.'),
	op('notes.store.lock.cancel', ALL, { id: 'string' }, [], 'Cancel a waiting native Notes lease acquisition request.'),
	op('notes.store.lock.release', ALL, { id: 'string' }, [], 'Release a held native Notes lease after queued byte work drains.'),
	op('notes.store.delete.write.begin', ANDROID_WINDOWS, {
		id: 'string',
		name: 'string',
		size: 'number',
		digest: 'string',
		expectedDigest: 'string|null',
	}, [], 'Begin a conditional deletion-guarded write in the ordinary Notes store.'),
	op('notes.store.delete.frame', ANDROID_WINDOWS, {
		slot: 'number',
		expectedDigest: 'string|null',
		frame: 'string',
		reserveDigest: 'string|null',
	}, ['written'], 'Atomically update one of the two Notes deletion-journal frame slots.'),
	op('notes.store.delete.observe', ANDROID_WINDOWS, { name: 'string' }, ['missing', 'digest', 'epoch', 'generation'], 'Observe the current deletion identity and generation of a Notes file.'),
	op('notes.store.delete.detach', ANDROID_WINDOWS, {
		name: 'string',
		held: 'string',
		digest: 'string',
		epoch: 'string',
		generation: 'number',
	}, ['state'], 'Detach a Notes file into deletion custody if its observed identity still holds.'),
	op('notes.store.delete.remove', ANDROID_WINDOWS, { name: 'string', digest: 'string' }, ['removed'], 'Remove a detached Notes file once its deletion journal record is durable.'),
	op('notes.store.draft.list', ANDROID_WINDOWS, {}, ['files', 'token'], 'Read kept synchronous draft files and write token in a locked-note window.'),
	op('notes.store.locked.list', ANDROID_WINDOWS, {}, [], 'List encrypted locked-note container ids on this device.', { resultType: 'array' }),
	op('notes.store.locked.open', ANDROID_WINDOWS, { id: 'string' }, ['opened', 'resuming'], 'Authenticate the user and open a locked note in its isolated native window.'),
	op('notes.store.seal.pending', ALL, {}, [
		'file', 'id', 'digest', 'ledger', 'historyDigest', 'media', 'transfer',
	], 'Return any interrupted locked-note seal transfer awaiting ordinary-copy cleanup.', {
		resultType: 'object|null',
	}),
	op('notes.store.seal.begin', ANDROID_WINDOWS, { size: 'number', digest: 'string' }, ['id'], 'Verify Pro and user identity and begin sealing a note into an encrypted container.'),
	op('notes.store.seal.chunk', ANDROID_WINDOWS, {
		id: 'string',
		offset: 'number',
		base64: 'string',
	}, ['offset'], 'Append base64 packet bytes to an in-progress locked-note seal transfer.'),
	op('notes.store.seal.stage', ANDROID_WINDOWS, { id: 'string' }, ['sealed'], 'Verify and stage all encrypted files of a locked-note seal transfer.'),
	op('notes.store.seal.commit', ANDROID_WINDOWS, { id: 'string' }, ['locked'], 'Mark a staged locked note ready and open its isolated native editor window.'),
	op('notes.store.seal.cancel', ANDROID_WINDOWS, {}, [], 'Cancel and wipe an unfinished locked-note seal transfer.'),
	op('notes.attachment.begin', WINDOWS, {
		requestId: 'string',
		generation: 'string',
		name: 'string',
		payloadLength: 'number',
		payloadDigest: 'string',
	}, ['generation', 'chunkBytes'], 'Stage a desktop Notes attachment copy for verified read-only Open With handoff.', {
		disagreements: ['windows leaves notesAttachmentOpen and notesAttachmentBytes off because a person would see a new choice on Windows, which waits for the owner\'s word with pictures, and the staging owner ACL is proved only on a real Windows machine; the handler answers'],
	}),
	op('notes.attachment.chunk', WINDOWS, {
		requestId: 'string',
		sequence: 'number',
		bytes: 'bytes',
	}, ['sequence', 'received'], 'Write one verified chunk to a staged desktop Notes attachment.', { byte: true,
		disagreements: ['windows leaves notesAttachmentOpen and notesAttachmentBytes off because a person would see a new choice on Windows, which waits for the owner\'s word with pictures, and the staging owner ACL is proved only on a real Windows machine; the handler answers'],
	}),
	op('notes.attachment.open', ANDROID_WINDOWS, {
		name: 'string?',
		requestId: 'string?',
		generation: 'string?',
	}, ['opened', 'cancelled'], 'Open a Notes attachment in an external application after host verification.', {
		disagreements: [
			'windows takes {requestId, generation} after notes.attachment.begin/chunk and may include cancelled because desktop Notes holds attachments in OPFS rather than a native file path, whereas android takes {name} and returns {opened}',
		],
	}),
	op('notes.attachment.cancel', WINDOWS, { requestId: 'string', generation: 'string' }, ['cancelled'], 'Cancel and delete an unsealed desktop Notes attachment staging directory.'),
	op('notes.unlock', ANDROID, {}, ['unlocked'], 'Prompt to unlock the Android keyguard from lock-screen note capture.'),
	op('notes.captureReady', ANDROID_STANDIN, { token: 'string', ready: 'boolean' }, [], 'Report that lock-screen note capture has prepared its fresh note for a token.'),
	op('notes.requestRole', ANDROID, {}, ['available', 'held', 'settings'], 'Check Android ROLE_NOTES status and open Default Apps when available.'),
	op('notes.pinShortcut', ANDROID_WINDOWS, { file: 'string', id: 'string' }, ['requested'], 'Pin a shortcut to a specific note on the launcher or Windows Start menu.', {
		disagreements: [
			'windows leaves capability notesPin off in PlatformState() because MSIX VFS redirects FOLDERID_Programs writes out of the Start Menu and IShellLinkW targets inside versioned WindowsApps folders break across Store updates (note-shortcuts.h:51,88)',
		],
	}),
	op('notes.opened', ANDROID_WINDOWS, { file: 'string', id: 'string' }, [], 'Update shortcut metadata when a note is opened.'),
	op('notes.gone', ANDROID_WINDOWS, { id: 'string' }, [], 'Remove any pinned launcher or Start menu shortcut for a deleted note.'),
	op('shares.list', ANDROID_STANDIN, {}, ['items'], 'List items staged in the Android share-sheet inbox awaiting Notes import.'),
	op('shares.read.chunk', ANDROID_STANDIN, {
		id: 'string',
		offset: 'number',
		size: 'number',
	}, ['offset', 'bytes'], 'Read a byte chunk from a staged Android share-inbox item.', { byte: true }),
	op('shares.ack', ANDROID_STANDIN, { id: 'string', digest: 'string' }, ['acknowledged'], 'Acknowledge an imported share-inbox item by id and SHA-256 digest.'),

	op('notes.backup.status', ANDROID_STANDIN, {}, [
		'quotaBytes', 'lastAttempt', 'pendingRestores', 'unfinishedRestores', 'state',
		'totalBytes', 'selectedBytes', 'archiveBytes', 'omittedCount', 'omittedBytes', 'omitted',
	], 'Read Android cloud backup quota, selection plan and restore inbox status.'),
	op('notes.backup.pending', ANDROID_STANDIN, {}, ['sessions'], 'List prepared Android cloud restore sessions waiting in the restore inbox.'),
	op('notes.backup.settings.get', ANDROID_STANDIN, {}, ['values'], 'Read authored preference values mirrored for Android cloud backup.'),
	op('notes.backup.settings', ANDROID_STANDIN, { values: 'object' }, ['saved'], 'Write validated preference values to the Android cloud backup mirror.'),
	op('notes.backup.read.begin', ANDROID, {
		session: 'string',
		id: 'string',
		name: 'string',
	}, STAT_RESULT, 'Open a read handle on a file inside a pending Android restore session.'),
	op('notes.backup.read.chunk', ANDROID, {
		session: 'string',
		id: 'string',
		offset: 'number',
		size: 'number',
	}, ['offset', 'bytes'], 'Read a byte chunk from an open Android restore session file.', { byte: true }),
	op('notes.backup.read.close', ANDROID_STANDIN, { session: 'string', id: 'string' }, [], 'Close an open read handle in an Android restore session.'),
	op('notes.backup.copy', ANDROID, {
		session: 'string',
		name: 'string',
		target: 'string?',
		digest: 'string',
	}, ['copied'], 'Atomically copy a verified file from an Android restore session into Notes.'),
	op('notes.backup.complete', ANDROID, {
		session: 'string',
		manifestDigest: 'string',
	}, ['completed'], 'Apply restored settings and palettes and retire a completed Android restore session.'),

	op('sync.open', ANDROID, {}, [
		'state', 'opened', 'listing', 'protocolCompatible', 'configured', 'code', 'reason',
	], 'Verify handshake and open the Android Rapier Sync companion app.'),
	op('sync.pause', ANDROID_STANDIN, {}, [], 'Pause Android Rapier Sync courier transfers and retire older staging.'),
	op('sync.resume', ANDROID, { destination: 'string' }, ['verifiedObjects', 'keptObjects'], 'Resume Android Rapier Sync courier transfers for an approved plain destination.'),
	op('sync.status', ANDROID_STANDIN, {}, ['state', 'listing', 'ready'], 'Read Android Rapier Sync companion installation and readiness state.'),
	op('sync.cancel', ANDROID_STANDIN, { transfer: 'string' }, [], 'Cancel and delete staging for an open Android sync transfer.'),
	op('sync.plain.status', ANDROID_STANDIN, {}, ['offered', 'destinations'], 'List approved plain-file sync destinations from the Android companion.'),
	op('sync.plain.list', ANDROID, { destination: 'string', area: 'string' }, ['files'], 'List remote files and revisions in a plain-sync destination area.'),
	op('sync.plain.get.begin', ANDROID, {
		destination: 'string',
		area: 'string',
		name: 'string',
	}, ['missing', 'transfer', 'size', 'rev', 'sha256'], 'Stage a remote plain-sync file into native no-backup storage for chunked reading.'),
	op('sync.plain.get.chunk', ANDROID, {
		transfer: 'string',
		offset: 'number',
		size: 'number',
	}, ['offset', 'bytes'], 'Read a byte chunk from a staged incoming plain-sync file.', { byte: true }),
	op('sync.plain.get.end', ANDROID_STANDIN, { transfer: 'string' }, [], 'Close and delete a staged incoming plain-sync file.'),
	op('sync.plain.put.begin', ANDROID, {
		destination: 'string',
		area: 'string',
		name: 'string',
		size: 'number',
		sha256: 'string',
		ifAbsent: 'boolean?',
		ifRev: 'string?',
	}, ['transfer'], 'Begin staging an outgoing plain-sync file with expected size, digest and revision.'),
	op('sync.plain.put.chunk', ANDROID, {
		transfer: 'string',
		offset: 'number',
		bytes: 'bytes',
	}, ['offset'], 'Append a byte chunk to a staged outgoing plain-sync file.', { byte: true }),
	op('sync.plain.put.end', ANDROID, { transfer: 'string' }, ['rev', 'sha256', 'size'], 'Verify digest of a staged outgoing file and upload it via Rapier Sync.'),
	op('sync.plain.remove', ANDROID, {
		destination: 'string',
		area: 'string',
		name: 'string',
		ifRev: 'string',
	}, ['removed'], 'Delete a remote plain-sync file at its expected revision via Rapier Sync.'),
	op('sync.bootstrap', WINDOWS, {}, ['schema', 'available', 'providers'], 'Read Windows native Sync provider registrations and qualification state.', {
		disagreements: [
			'windows leaves capability syncTransport off in PlatformState() because desktop OAuth provider client IDs are unregistered and Bootstrap() sets available: false in this cut (sync-native.h:202,217)',
		],
	}),
	op('sync.authorize.listen', WINDOWS, {
		service: 'string',
		redirectUri: 'string',
		state: 'string',
		timeoutMs: 'number',
	}, ['listener'], 'Bind the exclusive loopback OAuth callback listener for desktop Sync sign-in.'),
	op('sync.authorize.open', WINDOWS, { listener: 'string', url: 'string' }, ['opened'], 'Verify PKCE parameters and open the provider OAuth URL in the system browser.'),
	op('sync.authorize.wait', WINDOWS, { listener: 'string' }, ['url'], 'Await and validate the loopback OAuth redirect for an open Sync listener.'),
	op('sync.authorize.close', WINDOWS, { listener: 'string' }, ['closed'], 'Cancel and close a desktop Sync loopback OAuth listener.'),
	op('sync.credentials.capture', WINDOWS, {
		binding: 'object',
		token: 'object',
		receipt: 'string',
		accepted: 'boolean',
	}, ['sealed', 'accepted', 'receipt'], 'Confirm or mark recovery-only an issued OAuth credential receipt in DPAPI custody.'),
	op('sync.credentials.list', WINDOWS, { service: 'string', offset: 'number?' }, ['records', 'next'], 'List stored OAuth credential custody receipts for a Sync provider.'),
	op('sync.credentials.forget', WINDOWS, { service: 'string', receipt: 'string' }, ['forgotten', 'retainedForRevocation'], 'Forget a revoked Sync credential receipt or mark it pending revocation.'),
	op('sync.credentials.retry', WINDOWS, {}, ['sealed'], 'Retry flushing dirty Sync credential custody state to disk.'),
	op('sync.http.begin', WINDOWS, {
		service: 'string',
		url: 'string',
		method: 'string',
		headers: 'object',
		purpose: 'string',
		sourceReceipt: 'string|null',
		size: 'number',
		maxBytes: 'number',
		timeoutMs: 'number',
		sha256: 'string',
	}, ['transfer'], 'Reserve byte budget and open a provider-pinned HTTPS request on Windows.'),
	op('sync.http.write', WINDOWS, {
		transfer: 'string',
		offset: 'number',
		bytes: 'string',
	}, ['offset'], 'Append base64 request body bytes to a prepared Windows Sync HTTP transfer.'),
	op('sync.http.send', WINDOWS, { transfer: 'string' }, [
		'url', 'redirected', 'status', 'headers', 'size', 'sha256', 'credentialReceipt',
	], 'Verify whole-body digest, execute the pinned HTTPS request and seal any issued grant.'),
	op('sync.http.read', WINDOWS, {
		transfer: 'string',
		offset: 'number',
		size: 'number',
	}, ['offset', 'bytes'], 'Read a base64 chunk of the completed Windows Sync HTTP response body.'),
	op('sync.http.close', WINDOWS, { transfer: 'string' }, ['closed'], 'Close a completed Windows Sync HTTP transfer and release its byte budget.'),
	op('sync.http.cancel', WINDOWS, { transfer: 'string' }, ['closed'], 'Cancel an active Windows Sync HTTP transfer.'),
];

export const NATIVE_OPS = Object.freeze(Object.fromEntries(ENTRIES.map(entry => [entry.name, entry])));
