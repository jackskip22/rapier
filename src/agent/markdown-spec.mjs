import {RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, applyMarkdownSpec as _rapierApplyMarkdownSpec,
  installMarkdownMath as _rapierInstallMarkdownMath} from '../spec/md-parser-config.mjs';
import {createMathMatcher} from '../math/delimiters.mjs';
import {SPACING_TYPES, SPACING_PRESETS, PAGE_SIZES, documentSpacing, documentSpacingCss, wordDocumentSettings} from '../spec/document-settings.mjs';
import {installMathRules} from '../math/markdown-rules.mjs';
import {splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter} from '../spec/frontmatter.mjs';
import {readDocumentSettings as _rapierReadDocumentSettings, updateDocumentSettings as _rapierUpdateDocumentSettings, DOCUMENT_LEADING as RAPIER_DOCUMENT_LEADING, documentTitle as _rapierDocumentTitle, documentLanguage as _rapierDocumentLanguage, documentSettingsStyle as _rapierDocumentSettingsStyle, documentSettingsPageRule as _rapierDocumentSettingsPageRule,
	documentFont as _rapierDocumentFont, writeDocumentFontSetting as _rapierWriteDocumentFontSetting} from '../spec/document-settings.mjs';
import {isTemplatePage} from '../spec/template-page.mjs';
import {fontDataUrl as rapierFontDataUrl, fontAssetKey as rapierFontAssetKey, readFontAssets as rapierReadFontAssets,
	writeFontAssets as rapierWriteFontAssets, serializeFontAsset as rapierSerializeFontAsset, documentFontsCss as rapierDocumentFontsCss,
	documentFontUsage as rapierDocumentFontUsage} from '../spec/document-fonts.mjs';

// SPDX-License-Identifier: AGPL-3.0-only
import {
	TEXT_COLOR_NAMES as RAPIER_TEXT_COLOR_NAMES,
	typography as rapierTypography, typographySourceRanges as rapierTypographySourceRanges, createTypography as rapierCreateTypography, FONT_STACKS as RAPIER_FONT_STACKS,
	PAGE_BREAK_MARKER as RAPIER_PAGE_BREAK_MARKER, formatColorRun as rapierFormatColorRun,
	pairMarkers as rapierPairMarkers, quotedWillSpan as rapierQuotedWillSpan,
	normalizeFontFamily as rapierNormalizeFontFamily, fontFamilyCss as rapierFontFamilyCss, formatFontRun as rapierFormatFontRun,
	INK_KINDS as RAPIER_INK_KINDS, INK_CLOSE as RAPIER_INK_CLOSE,
	INK_PATH_MAX as RAPIER_INK_PATH_MAX, INK_INT_MAX as RAPIER_INK_INT_MAX,
	formatInkOpen as rapierFormatInkOpen, formatInkRun as rapierFormatInkRun,
	matchInkOpen as rapierMatchInkOpen, parseInkOpen as rapierParseInkOpen,
	inkOpenBody as rapierInkOpenBody, parseInkBody as rapierParseInkBody,
	isInkClose as rapierIsInkClose, scanInkMarkers as rapierScanInkMarkers,
	pairInkMarkers as rapierPairInkMarkers, stripInkMarkers as rapierStripInkMarkers,
	pairInkSpans as rapierPairInkSpans, sliceInkArrows as rapierSliceInkArrows, prepareInkPaste as rapierPrepareInkPaste,
	hasInkMarker as rapierHasInkMarker, mayRetireInk, INK_OPEN_PATTERN as RAPIER_INK_OPEN_PATTERN,
	readInkMatch as rapierReadInkMatch, formatInkOpenFromBody as rapierFormatInkOpenFromBody,
	formatPageBreak as rapierFormatPageBreak, isPageBreakLine as rapierIsPageBreakLine,
	isPageBreakBlock as rapierIsPageBreakBlock,
} from '../spec/md-marks.mjs';
import {THEMATIC_BREAK as rapierThematicBreak, HARD_BREAK as rapierHardBreak, cellBreaks as rapierCellBreaks, parseCssColor as rapierParseCssColor,
	highlightOfStyle as rapierHighlightOfStyle, highlightRun as rapierHighlightRun, HIGHLIGHT_HEX as RAPIER_HIGHLIGHT_HEX, highlightOpen as rapierHighlightOpen,
	cellAlignment as rapierCellAlignment, delimiterRow as rapierDelimiterRow, htmlBlockLines as rapierHtmlBlockLines,
	codeLanguage as rapierCodeLanguage, codeBlock as rapierCodeBlock, scriptRun as rapierScriptRun,
	definitionList as rapierDefinitionList, detailsBlock as rapierDetailsBlock, orderedListExpressible as rapierOrderedListExpressible,
	linkTitle as rapierLinkTitle, markRuns as rapierMarkRuns,
	listIsLoose as rapierListIsLoose, wordListLevel as rapierWordListLevel, wordListIsMarker as rapierWordListIsMarker,
	wordListMarker as rapierWordListMarker, wordListTree as rapierWordListTree} from '../spec/html-reading.mjs';



function _rapierSourceCharEscaped(source, index) {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0 && source.charCodeAt(cursor) === 0x5c; cursor--) slashes++;
	return (slashes & 1) === 1;
}


function safeCodeFence(body, authored = '```', info = '') {
	const marker = String(authored).startsWith('~') || String(info).includes('`') ? '~' : '`';
	let size = Math.max(3, (String(authored).match(new RegExp('^' + marker + '+')) || [''])[0].length);
	for (const match of String(body).matchAll(new RegExp('^ {0,3}(' + marker + '{3,})[ \t]*\r?$', 'gm'))) {
		size = Math.max(size, match[1].length + 1);
	}
	return marker.repeat(size);
}

export {
	SPACING_TYPES, SPACING_PRESETS, PAGE_SIZES, documentSpacing, documentSpacingCss, wordDocumentSettings,
	createMathMatcher, installMathRules,
	safeCodeFence,
	RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, _rapierApplyMarkdownSpec as applyMarkdownSpec,
	_rapierSourceCharEscaped as sourceCharEscaped, _rapierInstallMarkdownMath as installMarkdownMath,
	_rapierSplitOpeningFrontmatter as splitOpeningFrontmatter,
	_rapierReadDocumentSettings as readDocumentSettings, _rapierUpdateDocumentSettings as updateDocumentSettings, RAPIER_DOCUMENT_LEADING as DOCUMENT_LEADING, _rapierDocumentTitle as documentTitle,
	_rapierDocumentLanguage as documentLanguage,
	_rapierDocumentSettingsStyle as documentSettingsStyle, _rapierDocumentSettingsPageRule as documentSettingsPageRule,
	_rapierDocumentFont as documentFont, _rapierWriteDocumentFontSetting as writeDocumentFontSetting, isTemplatePage,
	rapierFontDataUrl as fontDataUrl, rapierFontAssetKey as fontAssetKey, rapierReadFontAssets as readFontAssets,
	rapierWriteFontAssets as writeFontAssets, rapierSerializeFontAsset as serializeFontAsset,
	rapierDocumentFontsCss as documentFontsCss, rapierDocumentFontUsage as documentFontUsage,
	RAPIER_TEXT_COLOR_NAMES, RAPIER_PAGE_BREAK_MARKER, rapierFormatColorRun as formatColorRun,
	rapierPairMarkers as pairMarkers, rapierQuotedWillSpan as quotedWillSpan,
	RAPIER_FONT_STACKS, rapierTypography as typography, rapierTypographySourceRanges as typographySourceRanges, rapierCreateTypography as createTypography, rapierNormalizeFontFamily as normalizeFontFamily, rapierFontFamilyCss as fontFamilyCss,
	rapierFormatFontRun as formatFontRun,
	RAPIER_INK_KINDS, RAPIER_INK_CLOSE, RAPIER_INK_PATH_MAX, RAPIER_INK_INT_MAX,
	RAPIER_INK_KINDS as INK_KINDS, RAPIER_INK_CLOSE as INK_CLOSE, RAPIER_INK_PATH_MAX as INK_PATH_MAX, RAPIER_INK_INT_MAX as INK_INT_MAX,
	rapierFormatInkOpen as formatInkOpen, rapierFormatInkRun as formatInkRun,
	rapierMatchInkOpen as matchInkOpen, rapierParseInkOpen as parseInkOpen,
	rapierInkOpenBody as inkOpenBody, rapierParseInkBody as parseInkBody,
	rapierIsInkClose as isInkClose, rapierScanInkMarkers as scanInkMarkers,
	rapierPairInkMarkers as pairInkMarkers, rapierStripInkMarkers as stripInkMarkers,
	rapierPairInkSpans as pairInkSpans, rapierSliceInkArrows as sliceInkArrows, rapierPrepareInkPaste as prepareInkPaste,
	rapierHasInkMarker as hasInkMarker, RAPIER_INK_OPEN_PATTERN as INK_OPEN_PATTERN,
	rapierReadInkMatch as readInkMatch, rapierFormatInkOpenFromBody as formatInkOpenFromBody,
	rapierFormatPageBreak as formatPageBreak, rapierIsPageBreakLine as isPageBreakLine,
	rapierIsPageBreakBlock as isPageBreakBlock,
	rapierThematicBreak as thematicBreak, rapierHardBreak as hardBreak, rapierCellBreaks as cellBreaks, rapierParseCssColor as parseCssColor,
	rapierHighlightOfStyle as highlightOfStyle, rapierHighlightRun as highlightRun, RAPIER_HIGHLIGHT_HEX, rapierHighlightOpen as highlightOpen,
	rapierCellAlignment as cellAlignment, rapierDelimiterRow as delimiterRow, rapierHtmlBlockLines as htmlBlockLines,
	rapierCodeLanguage as codeLanguage, rapierCodeBlock as codeBlock, rapierScriptRun as scriptRun,
	rapierDefinitionList as definitionList, rapierDetailsBlock as detailsBlock, rapierOrderedListExpressible as orderedListExpressible,
	rapierLinkTitle as linkTitle, rapierMarkRuns as markRuns,
	rapierListIsLoose as listIsLoose,
	rapierWordListLevel as wordListLevel, rapierWordListIsMarker as wordListIsMarker,
	rapierWordListMarker as wordListMarker, rapierWordListTree as wordListTree,
};

export {mayRetireInk};
