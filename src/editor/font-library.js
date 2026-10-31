// SPDX-License-Identifier: AGPL-3.0-only
const RAPIER_FONT_CATALOG = 'RAPIER_FONT_CATALOG_PIN';

async function _rapierFontLibraryJson(url, pin, key) {
	const name = new URL(url).pathname.split('/').pop();
	const provider = RapierPluginLoader.data({key, noun: 'font library', dash: ' — ', version: pin.sri,
		files: [{name, url, bytes: pin.bytes, sri: pin.sri.replace(/^sha384-/, '')}]});
	await provider.install();
	const bytes = (await provider.bytes())[name];
	return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

let _rapierFontLibrary = null;
async function _rapierFontLibraryOpen() {
	if (!RAPIER_FONT_CATALOG) { showToast('Font library unavailable', 'error'); return false; }
	const popup = _rapierProgressOpen({label: 'Loading fonts', after: 500});
	let catalog;
	try {
		_rapierFontLibrary ||= _rapierFontLibraryJson(RAPIER_FONT_CATALOG.url, RAPIER_FONT_CATALOG, 'font-catalog').then(raw => {
			RapierFontCatalog.admitFontCatalog(raw);
			const library = RapierFontInstall.createFontLibrary({families: raw.families, baseUrl: RAPIER_FONT_CATALOG.url, loader: RapierPluginLoader,
				fonts: _rapierDocumentFonts, progress: _rapierProgressOpen, outcome: () => {}});
			return {raw, library};
		});
		catalog = await _rapierFontLibrary;
	} catch (error) {
		_rapierFontLibrary = null;
		showToast(_rapierErrorWords(error, 'Couldn’t open the font library.'), 'error');
		return false;
	} finally { popup.end(); }
	const {raw, library} = catalog;
	RapierFontSheet.openFontLibrary({catalog: raw, library,
		manifest: {...raw.previews, url: new URL(raw.previews.url, RAPIER_FONT_CATALOG.url).href},
		readJson: (url, pin) => _rapierFontLibraryJson(url, pin, 'font-previews-' + pin.sri.slice(7, 19)),
		host: {beginDialog: _rapierBeginEngineDialog, arrange: _rapierPopArrange, errorWords: _rapierErrorWords}});
	return true;
}

_rapierFontsPart = Object.freeze({open: _rapierFontLibraryOpen});
