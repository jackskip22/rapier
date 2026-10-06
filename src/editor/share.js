// Export dialect is a portable personal preference, owned with the export path.
function _rapierPandocDialectEnabled() {
	try { return localStorage.getItem('rapier:export.pandocDialect') === '1'; } catch (_) { return false; }
}
function _rapierSetPandocDialectEnabled(value) {
	try {
		if (typeof _rapierPersonal !== 'undefined') _rapierPersonal.rememberDrawing('exportDialect', value ? '1' : null);
		if (value) localStorage.setItem('rapier:export.pandocDialect', '1');
		else localStorage.removeItem('rapier:export.pandocDialect');
	} catch (_) {   }
}

/* Shared pages are static views. The editable source rides inside them as plain Markdown:

     <script type="text/markdown" data-filename="notes.md" data-kind="markdown" data-sha256="…"
             data-images="pic image-1" data-image-definitions="PIC">
     # Notes …
     [pic]: #pic
     </script>

   The page's own <img> elements are the picture store. Every Markdown image destination that is a
   data URL the page shows is rewritten, at that destination only (never anywhere else the same
   bytes might appear: code, prose, links), to a fragment `#id` naming the <img id="…"> that holds
   the bytes; the ids the writer used are declared in data-images so a reader resolves exactly those
   and no ordinary `#fragment` link. Only destination bytes are replaced; authored `<…>` delimiters stay encoded around
   the fragment and are restored with the source. A reference definition (`[label]: #id`) is a second, narrower case: its destination alone
   cannot tell a rewritten picture definition from an ordinary link definition someone wrote by hand
   whose target happens to equal a picture id (`[nav]: #pic`), so data-image-definitions separately
   lists which definitions the writer actually rewrote, by their normalized reference label (the same
   fold markdown-it's normalizeReference applies: trim, collapse whitespace, case-fold), each
   percent-encoded so the list stays a plain space-separated token run regardless of what characters
   the label itself contains. A reference definition line resolves only when both hold: its label is
   declared here, and its destination is a declared id. An inline image destination needs no such
   check -- `![…](#id)` names its id directly and is never ambiguous. Four characters are
   entity-encoded so any Markdown survives inside a script element, bijectively: `&` becomes `&amp;`, `<` becomes `&lt;`, authored `#` becomes `&#35;` and CR becomes
   `&#13;`. Only structural image substitutions write raw `#id`. Decode CR before resolving
   those image destinations, then `&#35;`, `&lt;` and `&amp;` after resolution. data-sha256 is the SHA-256 of the
   resolved document, including its leading BOM and delimiter choices. Compatibility conversion
   changes only the picture destination bytes the person requested. Nothing here is private to
   Rapier: any tool can read it or write it (markdown-standard.md, "The document as a web page"). */


/* One data-image-definitions token: a normalized reference label, percent-encoded (encodeURIComponent's
   own alphabet -- unreserved characters plus %XX) so it can never carry a raw space or quote. */


async function _rapierSharedSourceHash(...args) { return _rapierRenderModule('render')._rapierSharedSourceHash(...args); }

// Encode authored fragment markers; only a structural image substitution writes raw #id.
// CR survives HTML newline preprocessing. Ampersands decode last, preserving literal entities.



// Rewrites the document's image destinations for the page: a JPEG XL picture becomes the portable
// picture the page shows (images/browser.js materialize, via context.imageSubstitutions), and every
// destination the page shows becomes `#id` into that <img>. Structural only: images/interchange.js's
// destination scanner names the exact source ranges of used image destinations, so the same bytes
// in a code block, a sentence or an ordinary link are never touched. The `#id` swap always replaces
// destination span (row.start/end), leaving authored angle delimiters encoded around it. Returns the resolved document (what a reader recovers, and what is hashed), the
// encoded carried text, the ids used, and the normalized labels of the reference definitions among them.
function _rapierSharedSourceForms(...args) { return _rapierRenderModule('render')._rapierSharedSourceForms(...args); }

async function _rapierSharedSourceCarrier(...args) { return _rapierRenderModule('render')._rapierSharedSourceCarrier(...args); }

// The inverse of _rapierSharedSourceForms: an inline image destination (`![…](#id)`) resolves on a
// declared id alone -- it names its own id, so nothing else can claim it. A reference definition
// (`[label]: #id`) additionally needs its own normalized label in `definitions`: without that check
// an ordinary hand-written definition whose destination happens to equal a picture id (`[nav]: #pic`)
// would resolve exactly like the picture definition it collides with, corrupting a document that was
// never a picture reference at all (markdown-standard.md, "The document as a web page").
function _rapierSharedResolve(...args) { return _rapierRenderModule('render')._rapierSharedResolve(...args); }

async function _rapierReadSharedDocument(...args) { return _rapierRenderModule('render')._rapierReadSharedDocument(...args); }

// Rapier's own stylesheet does the look -- the shared page is the same document the standalone
// export is, so it renders through _rapierArtifactStyles and gets the real .md-render rules: the
// numbered list's own counters, the checkbox treatment, callouts, footnotes, tables. What is left
// here is only what Share itself puts on the page and therefore owns the look of.
//
// First the nearest-side float that stands in for the planner when scripts are off: a float needs
// its container to contain it, and needs the blocks that must never run beside a picture to clear
// it. Then the long-code cap: _rapierShareCapLongCodeBlocks appends a "N lines" span inside the
// <pre> and marks the block, and nothing else in Rapier draws either -- without these rules that
// span reads as a line of the person's own code and the block runs the whole height of the page.
// It is hidden for print, where a capped, scrolling block would print as a cropped one.
function _rapierSharedPageFallbackCss(...args) { return _rapierRenderModule('render')._rapierSharedPageFallbackCss(...args); }

// The live editor, export and Share use the same eligible text blocks, including controls.
function _rapierShareWrapKind(...args) { return _rapierRenderModule('render')._rapierShareWrapKind(...args); }

// The picture-only paragraph a positioned picture (any of the four wrap values) actually occupies
// -- its own occurrence, either the bare image or a single link wrapping only it (the layout
// model's imageOnly), and that occurrence's own owning paragraph. One owner for the check every
// positioning pass below needs.
function _rapierSharePictureParagraph(...args) { return _rapierRenderModule('render')._rapierSharePictureParagraph(...args); }

function _rapierSharedPageLayout(...args) { return _rapierRenderModule('render')._rapierSharedPageLayout(...args); }

/* A code block over 40 lines gets a scrolling height cap in the offline page, with a small "N
	 lines" note at its top-right so a reader knows there is more; print lifts the cap (see the
	 `[data-rapier-code-lines]` rule in the export's own @media print block) so nothing
	 is cut on paper. The editor's own read surface is untouched -- this runs only here, against the
	 shared page's own styled-root clone, never against spec/markdown-style.css's live block-read. */

function _rapierShareCapLongCodeBlocks(...args) { return _rapierRenderModule('render')._rapierShareCapLongCodeBlocks(...args); }

// Embedded assets have already been materialized into the captured export context. A visible
// remote picture is still only a link, even after the author allowed it to load in the editor.
// Refuse the whole page, with every unresolved occurrence named; never export a missing picture
// or turn Export into a new network-consent path. The captured and working source stay untouched.
async function _rapierRequireOfflinePageImages(...args) { return _rapierRenderModule('render')._rapierRequireOfflinePageImages(...args); }

async function _rapierBuildSharedPage(...args) { return _rapierRenderModule('render')._rapierBuildSharedPage(...args); }

async function _rapierShareFile(options) {
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	const opts = options || {};
	const blob = opts.blob;
	const filename = String(opts.filename || 'document');
	const mime = String(opts.mime || (blob && blob.type) || 'application/octet-stream');
	const platform = window.RapierPlatform;

	if (platform?.host.canShare && typeof platform.host.share === 'function') {
		try {
			/* Native share APIs ack opening the system share surface, not delivery to a target. */
			const opened = await platform.host.share(blob, filename, mime) === true;
			if (opened) _rapierAnnounceShared(filename, blob);
			return opened;
		} catch (error) {
			if (error?.name === 'AbortError') return false;
			console.warn('[rapier] native share failed', error);
		}
	}

	if (platform && platform.environment.allowsWebShareFallback === true) {
		try {
			if (navigator.canShare && navigator.share && typeof File !== 'undefined') {
				const file = new File([blob], filename, { type: mime });
				if (navigator.canShare({ files: [file] })) {
					if (navigator.userActivation?.isActive === false && !await rapierConfirm({
						title: 'ready to share', message: filename, confirmLabel: 'share',
					})) return false;
					await navigator.share({ files: [file], title: filename });
					_rapierAnnounceShared(filename, blob);
					return true;
				}
			}
		} catch (error) {
			if (error && error.name === 'AbortError') return false;
			console.warn('[rapier] share failed, falling back to save', error);
		}
	}

	const saved = await _download(blob, filename);
	if (saved === true) {
		showToast('share unavailable — saved ' + _rapierShareProduced(filename, blob) + ' instead', 'info');
		return true;
	}
	if (saved === null) showToast('share unavailable — ' + filename + ' could not be saved', 'error');
	return false;
}

// What was produced, named exactly (Weapon §11.5): the file and its size, never a generic word.
function _rapierShareProduced(filename, blob) {
	const bytes = blob && Number.isFinite(blob.size) ? blob.size : 0;
	const size = bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KiB' : (bytes / 1048576).toFixed(1) + ' MiB';
	return bytes ? filename + ' (' + size + ')' : filename;
}

// A share that opened the system sheet: announced to assistive tech (the sheet itself is not in
// the page) and named on screen -- the sheet shows the destination, this names what went into it.
function _rapierAnnounceShared(filename, blob) {
	const produced = _rapierShareProduced(filename, blob);
	try { if (typeof srAnnounce === 'function') srAnnounce('shared ' + produced); } catch (_) {}
	try { showToast('shared ' + produced, 'success'); } catch (_) {}
}

// A return belongs to the carried document's identity, not this window or the document's current
// filename. Capture through Share's settled source door; never mutate or mark the document saved.
const _rapierPageReturn = {address: null, expiresAt: null, stamp: null, state: 'ready', message: '', timer: null};
function _rapierBindPageReturn(address, stamp = _rapierMutationStamp(), expiry = null) {
	let admitted = null, expiresAt = null;
	try {
		if (address) {
			expiresAt = Date.parse(RapierPageReturnAddress.returnExpiresAt(expiry));
			admitted = RapierPageReturnAddress.returnAddress(address);
		}
	} catch (_) { admitted = expiresAt = null; }
	if (!_rapierMutationStampSharesDocument(stamp)) return;
	Object.assign(_rapierPageReturn, {address: admitted, expiresAt, stamp, state: 'ready', message: ''});
	_rapierRenderPageReturn();
}
function _rapierPageReturnCurrent() {
	return !!_rapierPageReturn.address && _rapierMutationStampSharesDocument(_rapierPageReturn.stamp);
}
function _rapierRenderPageReturn() {
	clearTimeout(_rapierPageReturn.timer);
	_rapierPageReturn.timer = null;
	if (_rapierPageReturnCurrent() && _rapierPageReturn.state === 'ready') {
		const remaining = _rapierPageReturn.expiresAt - Date.now();
		if (remaining <= 0) {
			_rapierPageReturn.state = 'expired';
			_rapierPageReturn.message = 'Return expired. Your work is safe on this page.';
		} else _rapierPageReturn.timer = setTimeout(_rapierRenderPageReturn, Math.min(remaining, 2147483647));
	}
	const button = document.getElementById('share-send-back');
	const status = document.getElementById('share-send-back-status');
	if (!button || !status) return;
	button.hidden = !_rapierPageReturnCurrent();
	button.disabled = _rapierPageReturn.state === 'sending' || _rapierPageReturn.state === 'accepted';
	button.querySelector('.export-choice__label').textContent = ['expired', 'used'].includes(_rapierPageReturn.state) ? 'Save' : 'Send back';
	status.textContent = _rapierPageReturn.message || 'send this document back to the agent who gave you this page';
}
async function _rapierSendBack() {
	if (!_rapierPageReturnCurrent()) return false;
	const saveOffered = ['expired', 'used'].includes(_rapierPageReturn.state);
	_rapierRenderPageReturn();
	if (['expired', 'used'].includes(_rapierPageReturn.state)) return saveOffered ? rapierSave({forceSaveAs: true}) : false;
	if (_rapierPageReturn.state === 'sending' || _rapierPageReturn.state === 'accepted') return false;
	_rapierPageReturn.state = 'sending';
	_rapierPageReturn.message = 'Sending…';
	_rapierRenderPageReturn();
	try {
		const captured = await _rapierCaptureSettledExternalDocument();
		if (!captured || !_rapierPageReturnCurrent() || !_rapierMutationStampSharesDocument(captured.stamp)) {
			_rapierPageReturn.state = 'ready';
			_rapierPageReturn.message = 'Not sent. The document changed or is still being edited.';
			return false;
		}
		if (_rapierPageReturn.expiresAt <= Date.now()) { _rapierPageReturn.state = 'ready'; return false; }
		// No redirect may forward the source to another destination; a lost answer is not acceptance.
		const response = await fetch(_rapierPageReturn.address, {
			method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
			headers: {'Content-Type': 'text/markdown;charset=utf-8', 'X-Rapier-Name': encodeURIComponent(captured.metadata.filename)},
			body: (captured.metadata.bom ? '\uFEFF' : '') + captured.canonical,
		});
		const answer = await response.json();
		const accepted = response.ok && answer?.accepted === true;
		_rapierPageReturn.state = accepted ? 'accepted' : response.status === 410 ? 'expired' : response.status === 409 ? 'used' : 'ready';
		_rapierPageReturn.message = accepted ? 'Accepted. Your document was sent back.'
			: _rapierPageReturn.state === 'expired' ? 'Return expired. Your work is safe on this page.'
			: _rapierPageReturn.state === 'used' ? 'Return already used. Your work is safe on this page.'
			: 'Refused: ' + (typeof answer?.reason === 'string' ? answer.reason : 'the worker did not accept this return.');
		return accepted;
	} catch (_) {
		_rapierPageReturn.state = 'ready';
		_rapierPageReturn.message = 'Not confirmed. Check your connection. Nothing is retried automatically.';
		return false;
	} finally { _rapierRenderPageReturn(); }
}

async function rapierShare(kind) {
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	try {
		const captured = await _rapierCaptureSettledExternalDocument({carried: _rapierShareLedgerChoice()});
		if (!captured) return false;
		if (kind !== 'web' && captured.ledger && captured.metadata.docKind !== 'markdown') throw new Error('Choose web page to carry authorship or history with a code or plain-text document.');
		if (kind !== 'web') return await _rapierShareFile({
			blob: new Blob([RapierLedgerCarried.writeDocument((captured.metadata.bom ? '\uFEFF' : '') + captured.canonical,
				_rapierLedgerParts(captured.canonical, captured.ledger, captured.carried))], {type: captured.metadata.mime}),
			filename: captured.metadata.saveName, mime: captured.metadata.mime,
		});
		const page = await _rapierBuildSharedPage(captured);
		return await _rapierShareFile({...page, mime: 'text/html'});
	} catch (error) {
		showToast('Could not share: ' + error.message, 'error');
		return false;
	} finally { _rapierShareLedgerReset(); }
}

// Image compatibility mode's one writer. A shared page carries JPEG XL -- every current browser
// opens it and it is far smaller; ON converts each picture to the PNG or JPEG an older reader
// needs. The toggle's own `aria-pressed` is the state: one truth, nothing mirrored, nothing
// stored. It lives here rather than in the engine because it is a fact about sharing, and the
// engine's ownership ratchet is right to push it out.
function _rapierShareCompatSet(toggle, on) {
	if (!toggle) return;
	if (on && toggle.dataset?.ledgerChoice) {
		for (const other of document.querySelectorAll('[data-ledger-choice]')) if (other !== toggle) _rapierShareCompatSet(other, false);
	}
	toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
	const state = toggle.querySelector('.export-choice-toggle__state');
	if (state) state.textContent = on ? 'ON' : 'OFF';
}

// The choice belongs to this outgoing file, never to a profile or a saved preference.
function _rapierShareLedgerChoice() {
	return document.querySelector('[data-ledger-choice][aria-pressed="true"]')?.dataset.ledgerChoice || 'none';
}
function _rapierShareLedgerReset() {
	for (const toggle of document.querySelectorAll('[data-ledger-choice]')) _rapierShareCompatSet(toggle, false);
	const names = document.getElementById('share-ledger-authors');
	if (names) {
		const actors = [...new Set(rapier.undo.ledger.filter(row => row.transaction.actor.kind === 'agent').map(row => row.transaction.actor.id))];
		names.textContent = actors.length ? 'Recorded agent names and doors: ' + actors.join('; ') + '. These are host-supplied labels, not verified identities.' : '';
	}
}
function _rapierLedgerCapture() {
	return RapierLedger.exportLedger({text: _rapierGetCanonicalText(),
		records: rapier.undo.ledger.map(_rapierJournalRecord), documentAuthority: String(rapier.identity.authority),
		revision: Number(rapier.revision.settled), root: rapier.document.source.rootId,
		complete: _rapierHistoryIsComplete() && !rapier.undo.trimReason});
}
function _rapierLedgerParts(text, ledger, choice) {
	if (!ledger || !['authorship', 'history'].includes(choice)) return {ledger: null, authorship: null};
	// Compatibility conversion is its own export-only system edit. The live document never changes.
	const canonical = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
	const carried = RapierLedger.replaceLedgerText(ledger, canonical, {operation: 'export.convert', actor: {kind: 'system', id: 'rapier'}});
	return choice === 'history' ? {ledger: carried, authorship: null} : {ledger: null, authorship: RapierLedger.authorship(carried)};
}
function _rapierLedgerAdmission(text, parts) {
	const checked = RapierLedgerCarried.validateParts(text, parts);
	const canonical = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
	const ledger = checked.ledger || (checked.authorship
		? RapierLedger.ledgerFromAuthorship(checked.authorship, canonical, _rapierCreateDocumentAuthority()) : null);
	if (!ledger) return {};
	RapierLedger.historyEnvelope(ledger); // navigation as well as content is proved before any load.
	return {documentAuthority: ledger.documentAuthority, carriedLedger: ledger};
}
function _rapierLedgerInstall(ledger) {
	const proven = RapierLedger.readLedger(ledger, _rapierSourceText());
	if (proven.ledger.documentAuthority !== String(rapier.identity.authority)) throw new Error('The carried history belongs to another document.');
	const identity = rapier.document.docKind === 'markdown' ? _rapierCurrentSegmentIdentity() : [];
	const envelope = RapierLedger.historyEnvelope(proven.ledger, identity);
	rapier.revision.settled = proven.revision;
	_rapierResetSource(proven.text, proven.root);
	if (!_rapierInstallRestoredHistory(envelope)) throw new Error('The carried history could not be installed.');
	_notifyHistoryState();
}
// Compare a carried copy as an explicit merge proposal through the existing KEEP/DROP review.
// No source changes until that review is accepted; stale/abandoned review commits nothing.
async function _rapierLedgerReviewCopy(incoming, name) {
	const captured = await _rapierCaptureSettledExternalDocument({carried: 'history'});
	if (!captured || _rapierUserMutationBlocked()) return false;
	const merged = RapierLedger.merge(captured.ledger, incoming);
	if (merged.text === captured.canonical) { showToast('This copy adds no changes.', 'info'); return true; }
	if (rapier.compare.active || rapier.compare.running) await rapierCompareClose();
	if (!_rapierMutationStampIsCurrent(captured.stamp)) return false;
	const controller = new AbortController(), ctx = {actor: {kind: 'human', id: 'local'},
		transport: 'platform', operation: 'document.merge', requestId: null, signal: controller.signal};
	const resolved = {kind: 'document-range', source: captured.canonical, start: 0, end: captured.canonical.length, record: {}};
	const decision = await _rapierWillReviewOpen(resolved, merged.text, ctx);
	try {
		await _rapierAwaitWillRestore(decision.review, controller.signal);
		if (!decision.allowed || !_rapierMutationStampIsCurrent(captured.stamp) || _rapierUserMutationBlocked()) return false;
		// The merge itself preserves conflicting variants in the existing conflict envelope; the
		// person can edit those variants after accepting, and Undo still reaches either original.
		_rapierWillReviewRelease(decision.review, false);
		const rows = [{pos: 0, removed: captured.canonical, inserted: merged.text}];
		await _rapierWithCompoundTransaction(ctx, async () => {
			if (!_rapierMutationStampIsCurrent(captured.stamp)) throw new Error('The document changed before merging.');
			if (!await _rapierApplyCanonicalSplices(rows, {keepSourceMode: rapier.view.mode === 'source', retiredImages: []})) throw new Error('The merge could not be applied.');
		}, {carriedLedger: merged.ledger});
		await rapierFlushDirty({snapshot: true, durable: true});
		if (!merged.clean) _rapierCompareStart(captured.canonical, captured.metadata.filename, merged.text, name);
		return true;
	} finally { _rapierWillReviewRelease(decision.review, false); }
}
