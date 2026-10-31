// The sheets and pickers the page opens: the pickers, Pro, confirm, privacy, licenses, navigator, welcome and the copy, share and export menus' opener; with Welcome's own document.
async function rapierOpenWelcomeDocument() {
	await _rapierAwaitPaste({ cancelPrecommit: true });
	const opened = await rapierOpenPlatformPayload({
		text: rapierWelcomeMarkdown(),
		name: 'welcome.md',
		transient: true,
	}, { virtualDocumentKind: 'welcome' });
	if (opened === false) return false;

	if (_rapierIsBuiltInWelcomeDocument()) await _rapierMarkWelcomeDocumentSaved(true);
	return true;
}
function _rapierUiSetPickerRoving(kind, target = null) {
	const buttons = _rapierUiPickerButtons(kind);
	const chosen = buttons.includes(target) ? target
		: (buttons.find(button => button.hasAttribute('data-active')) ||
			 buttons.find(button => button.getAttribute('aria-checked') === 'true') || buttons[0]);
	buttons.forEach(button => { button.tabIndex = button === chosen ? 0 : -1; });
	return chosen;
}
function _rapierUiOpenPicker(kind, event, pointerOwned = false) {
	_rapierUi.picker = kind;
	renderPickers();
	if (pointerOwned) {

		_rapierUiSetPickerRoving(kind);
		rapierRepositionFormatToolbar();
		return;
	}
	const target = _rapierUiSetPickerRoving(kind);
	if ((!event || event.detail === 0) && target) target.focus({ preventScroll: true });
	rapierRepositionFormatToolbar();
}
function _rapierUiOpenProSheet(detail = {}) {
	const refs = _rapierUi.refs;
	const feature = String(detail.feature || '');
	if (!_rapierUiPlatformFacts().pro || _rapierUiPro.unlocked) return false;
	if (feature) {
		try { if (!_rapierFeatureAllowed(feature) === false) return false; }
		catch (_) { return false; }
	}
	_rapierUiPro.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	if (_rapierUiPro.returnFocus &&
			_rapierUiPro.returnFocus.matches('input, textarea, [contenteditable="true"]')) {
		try { _rapierUiPro.returnFocus.blur(); } catch (_) {}
	}
	_rapierUiPro.returnSurface =
			_rapierUiDialogIsOpen(refs.settingsOverlay) ? 'settings'
		: _rapierUiDialogIsOpen(refs.exportOverlay) ? 'export'
		: _rapierUiDialogIsOpen(refs.copyOverlay) ? 'copy'
		: _rapierUiDialogIsOpen(refs.shareOverlay) ? 'share'
		: rapier.compare.active ? 'compare' : '';
	_rapierUiPro.feature = feature;
	closeDialog(refs.settingsOverlay);
	closeDialog(refs.exportOverlay);
	closeDialog(refs.copyOverlay);
	closeDialog(refs.shareOverlay);
	renderProSheet();
	openDialog(refs.proOverlay, { panel: '.pro-sheet', noreturn: true });
	return true;
}
function renderConfirm(request) {
	const refs = _rapierUi.refs;
	if (!refs) return;
	refs.confirmTitle.textContent = String(request.title || 'confirm').slice(0, 120);
	refs.confirmMessage.textContent = String(request.message || '');
	refs.confirmMessage.style.whiteSpace = 'pre-line';
	refs.confirmAccept.textContent = String(request.confirmLabel || 'continue').slice(0, 60);
	const secondary = request.secondaryLabel ? String(request.secondaryLabel).slice(0, 60) : '';
	refs.confirmSecondary.hidden = !secondary;
	refs.confirmSecondary.textContent = secondary || 'discard';

	refs.confirmAccept.dataset.pop = request.destructive && !secondary ? 'destructive' : 'affirm';
	refs.confirmSecondary.dataset.pop = request.destructive ? 'destructive' : 'affirm';
	refs.confirmAccept.parentElement.toggleAttribute('data-pop-plain', !!request.plain && !request.destructive);
	_rapierPopArrange(refs.confirmAccept.parentElement);
}
function _rapierUiOpenConfirm(request) {
	const refs = _rapierUi.refs;
	const requestId = String(request.requestId || '');
	if (!requestId) return;
	if (_rapierUi.confirmId) rapierResolveConfirm(_rapierUi.confirmId, false);
	_rapierUi.confirmReturnSettings = _rapierUiDialogIsOpen(refs.settingsOverlay);
	closeDialog(refs.settingsOverlay);
	_rapierUi.confirmId = requestId;
	renderConfirm(request);
	openDialog(refs.confirmOverlay, { panel: '.settings-panel', onEscape: () => _rapierUiResolveConfirm(false) });
}
// The commercial licence sheet (#commercial-overlay, door rapier.website/commercial, opened only by the boot from that
function _rapierUiOpenPrivacy(door) {
	const name = door === 'commercial' ? 'commercial' : 'privacy';
	closeDialog(_rapierUi.refs.settingsOverlay);
	openDialog(document.getElementById(name + '-overlay'), { panel: '.' + name + '-panel' });
	try { _rapierDoorPathMark(name, true); } catch (_) {}
	_rapierRenderDocumentHead();
}
function _rapierUiOpenLicenses() {
	closeDialog(_rapierUi.refs.settingsOverlay);
	_rapierUiUnfold(_rapierUi.refs.licensesOverlay);
	renderLicenses();
	openDialog(_rapierUi.refs.licensesOverlay, { panel: '.licenses-panel' });
}
function _rapierUiOpenNavigator(detail) {
	const refs = _rapierUi.refs;
	if (rapier.find?.open) {
		const back = _rapierNavigatorRuntime.returnFocus;
		_rapierUiSetFindOpen(false);
		if (back && (refs.findBar?.contains(back) || refs.replaceBar?.contains(back)))
			_rapierNavigatorRuntime.returnFocus = refs.find?.isConnected ? refs.find : null;
	}
	const state = _rapierUiNavigator;
	state.kind = detail.kind;
	state.structural = detail.structural === true;
	state.sense = detail.sense || 'headings';
	state.collapsed = false;
	state.totalLines = detail.totalLines || 0;

	state.clearLine = true;
	renderNavigator();
	openDialog(refs.navigatorOverlay, { panel: '.navigator-panel', noreturn: true, noautofocus: true });
	_rapierUiCircleGrowth(refs.navigatorOverlay.querySelector('.navigator-panel'), true);
	if (document.body.classList.contains('rapier-draw-open')) refs.navigatorClose.focus({ preventScroll: true });
	else if (state.kind === 'line') refs.gotoInput.focus({ preventScroll: true });
	else if (state.structural) refs.navigatorTitle.focus({ preventScroll: true });
	else refs.navigatorClose.focus({ preventScroll: true });
}
function _rapierUiOpenPlatformPayload(payload) {
	return payload ? rapierOpenPlatformPayload(payload) : false;
}
async function _rapierUiOpenWelcome() {
	closeDialog(_rapierUi.refs.settingsOverlay);
	if (_rapierNotesPart?.settingsBorrowing()) {
		_rapierNotesPart.settingsOpen(false);
		if (await _rapierNotesPart.editor() !== true) return;
	}
	if (await rapierOpenWelcomeDocument() === false) return;
	_rapierUiApplyReadOnly();
}
function _rapierUiOpenIconColour() {
	if (!_rapierRequireFeature('icon', { source: 'icon' })) return;
	const overlay = _rapierUi.refs.iconOverlay, sheet = overlay.querySelector('.info-action-sheet');
	openDialog(overlay, {panel: '.info-action-sheet', noautofocus: true});
	renderSwitch(_rapierUi.refs.iconSwatches, _rapierUiPro.launcherIcon);
	sheet.focus({preventScroll: true});
}
function _rapierUiOpenInterchange(overlay) {
	if (overlay === _rapierUi.refs.shareOverlay && !_rapierEmbedFeatureAllowed('share')) return false;
	const refs = _rapierUi.refs;
	if (overlay === refs.shareOverlay) _rapierShareLedgerReset();
	_rapierRenderPageReturn();
	closeDialog(refs.exportOverlay);
	closeDialog(refs.copyOverlay);
	closeDialog(refs.shareOverlay);
	openDialog(overlay, { panel: '.settings-panel' });
}
