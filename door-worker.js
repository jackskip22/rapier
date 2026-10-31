// SPDX-License-Identifier: AGPL-3.0-only
// Rapier's dedicated pages, answered with their own head and guide.
//
// One HTML asset carries the application and its search guides. The build keeps the door guides in inert templates
// inside the body's search region. A door replaces the home guide with its own and names its own address in the head.
// The application bytes between and after those regions pass through unchanged; the page opens the view from the address.
//
// The build writes each finished door beside the canonical page (`door-notes.html` and the rest).
// `_redirects` serves that file. The asset layer answers the request, so a normal page does not run this worker.
// If a door request does reach the worker and the file is absent, the canonical page is rewritten in one forward
// pass: each new chunk is searched only with the unmatched marker overlap, then the rest passes through.
//
// Fail open: any doubt (the asset missing, encoded, without its markers or guide) serves the plain page. The worker never
// refuses a person and never stands between `/` and its page.
const ORIGIN = 'https://rapier.website';
const PAGE = '/index.html';
export function doorAssetPath(path) {
	return '/door-' + path.slice(1) + '.html';
}
const BEGIN = '<!-- RAPIER_SEO_BEGIN -->';
const END = '<!-- RAPIER_SEO_END -->';
const HEAD_WINDOW = 65536;
// Bound a malformed asset's buffered prefix; the rest of the application is streamed without decoding.
const WINDOW = 1024 * 1024;

// The words the engine shows while the sheet is open (`_rapierRenderDocumentHead` in editor/engine.js). The row
// runtime-pack-roundtrip reads the served head and the opened sheet's head and refuses a difference.
// A door that is a tool people search for (`h1`) says, in the words a crawler reads without running the page, what
// the searcher came to do: one heading, a short paragraph (`lead`), the steps (`howTo`), questions and answers (`faq`)
// and the pages next to it (`related`; `/` is the editor itself, the home page); `howTo` is one [heading, steps] or a list of them,
// and `features` the application's feature list, each shown in the guide. It is the free web application at its own address (WebApplication data).
// `view` names what the address opens (the engine, draw/door.js, notes/door.js).
const free = 'Yes. Rapier is free and open source, with no account, ads or tracking.';
const offline = 'Yes, once the page has loaded. Add it to your home screen to open it like an app, or keep the whole editor as one HTML file.';
const local = 'No. Rapier works in your browser. Local editing uploads nothing.';
const saved = 'Yes. Press Done to download it as JPEG XL, PNG or layers (OpenRaster), or add it to your document';
export const DOORS = Object.freeze({
	'/privacy': Object.freeze({name: 'Privacy and terms', title: 'Rapier privacy and terms',
		description: 'Rapier privacy and terms: local editing, optional services, data storage and deletion.',
		image: 'og-privacy.png', imageSize: [1200, 630], imageAlt: 'Rapier: privacy and terms'}),
	'/commercial': Object.freeze({name: 'Commercial license', title: 'Rapier commercial license',
		description: 'Commercial licenses for embedding Rapier in proprietary products. The editor is free under AGPL-3.0-only.',
		image: 'og-commercial.png', imageSize: [1200, 630], imageAlt: 'Rapier: commercial license'}),
	// The editor views a search engine may show as sitelinks under the home result: each opens that view
	// (the engine reads the address), and each is a page of its own for a reader that runs nothing.
	// `image` is the card shown when the address is shared: a PNG at the site root, `imageSize` pixels wide and high.
	'/notes': Object.freeze({name: 'Notes', title: 'Private notes app, free and offline | Rapier Notes',
		description: 'Private Markdown notes with colors, pins, checklists, pictures, voice recordings and history. Import from Google Keep and 15+ apps. No account.',
		image: 'og-notes.png', imageSize: [1200, 630], imageAlt: 'Rapier Notes: Markdown notes on your phone',
		h1: 'Private notes app', view: 'notes', related: ['/', '/draw'],
		lead: 'Rapier Notes keeps your notes on your device, as plain Markdown files shown as cards. Pin and color them, add checklists, pictures and voice notes, and go back to any earlier version. Import brings in Google Keep, Apple Notes, Evernote, Notion, Obsidian and more. There is no account. The Android app adds reminders and a home-screen widget.',
		faq: Object.freeze([
			Object.freeze(['Is it a Google Keep alternative?', 'Yes. Import your Google Keep notes from a Google Takeout export: text, checklists, pins and pictures become Markdown notes.']),
			Object.freeze(['Where are my notes kept?', 'On your device, in your browser or the Android app. Nothing is uploaded unless you turn on sync to storage you own.']),
			Object.freeze(['Is there an Android app?', 'Yes, Rapier on Google Play. It has no internet permission.']),
			Object.freeze(['Is it free?', free]),
		])}),
	'/draw': Object.freeze({name: 'Draw', title: 'Free drawing app online: draw on your phone | Rapier Draw',
		description: 'Draw freehand with a finger, mouse or pen, build diagrams with arrows that stay attached, and paint. Free in your browser, no download or account.',
		image: 'og-draw.png', imageSize: [1200, 630], imageAlt: 'Rapier Draw: draw and paint in Markdown',
		h1: 'Free drawing app online', view: 'draw', related: ['/paint', '/watercolor', '/gallery', '/diagrams'],
		lead: 'Rapier Draw opens a canvas in your browser. Draw with your finger on a phone, or with a mouse or a pen. Select a shape to move, resize, label or restyle it, or attach an arrow that moves with it. Drawings are SVG: sharp at any size and editable later.',
		faq: Object.freeze([
			Object.freeze(['Can I draw on my phone?', 'Yes. Rapier is made for phones first: draw with your finger, and pinch to zoom.']),
			Object.freeze(['Do I need to download anything?', 'No. Draw runs in your browser. There is also an Android app on Google Play.']),
			Object.freeze(['Where does my drawing go?', 'Press Done and it goes into your document as an editable SVG. Save the document as one Markdown file, pictures inside.']),
			Object.freeze(['Is it free?', free]),
		])}),
	// The Watercolor card is drawn from `picture` (tools/og-card.mjs). To show a new painting instead, save it as a PNG, change `image` and `imageSize`
	// here and allow the file in .assetsignore; tools/stage-site.mjs reads the image names here. A new file name makes social sites fetch the card again.
	'/watercolor': Object.freeze({name: 'Watercolor', title: 'Free online watercolor painting | Rapier Watercolor',
		description: 'Paint watercolor in your browser with flowing pigments, wet washes and textured paper. Keep transparent paintings in editable drawings. Free, no account.',
		image: 'og-watercolor.png', imageSize: [1200, 630], imageAlt: 'Blue, yellow and rose watercolor washes painted in Rapier',
		picture: 'watercolor-painting.png', pictureCaption: 'Overlapping watercolor washes painted in Rapier.',
		h1: 'Online watercolor painting', view: 'watercolor', related: ['/paint', '/draw'],
		lead: 'This page opens a watercolor canvas. Wet color spreads across textured paper, pigments blend, and washes dry with darker edges. Paint with a finger, a mouse or a pen.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Does it work on a phone?', 'Yes. Paint with your finger or a stylus. Watercolor needs WebGPU; without it, Rapier paints with Brushes.']),
			Object.freeze(['Can I save my painting?', saved + ' as an editable drawing.']),
		])}),
	'/paint': Object.freeze({name: 'Paint', title: 'Free painting app online, no download | Rapier Paint',
		description: 'Paint in your browser with oil, bristle, pencil, pen and watercolor brushes. Use a finger, mouse or pen. Free, no download, no account.',
		image: 'og-paint.png', imageSize: [1200, 630], imageAlt: 'Rapier Paint: paint on your phone',
		h1: 'Free painting app online', view: 'paint', related: ['/watercolor', '/draw', '/jxl', '/notes'],
		lead: 'This page opens a canvas with real brushes: oil, bristle, scumble, pencil and pen from MyPaint, and watercolor that flows. Paint with your finger, then smudge, erase and undo. Nothing to download or sign up for.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Do I need to download an app?', 'No. It runs in your browser. On Android you can also install Rapier from Google Play.']),
			Object.freeze(['Can kids use it?', 'Yes. There are no ads, accounts or tracking.']),
			Object.freeze(['Can I save my painting?', saved + '.']),
		])}),
	// /jxl answers the JPEG XL searches: what goes in, what comes out, and the steps. Each claim is the
	// converter's (jxl/convert.mjs, jxl/frames.mjs, jxl/png.mjs); the sizes are its own results for the card's painting (og-card.mjs).
	'/jxl': Object.freeze({name: 'JPEG XL converter', title: 'Free JPEG XL converter: PNG, JPG, GIF and video to JXL | Rapier',
		description: 'Convert PNG, JPG, GIF, WebP and video to JPEG XL (JXL), free, in your browser. Lossless or lossy; under Lossless a JPEG restores exactly. Offline.',
		image: 'og-jxl-flowers.png', imageSize: [1200, 630], imageAlt: 'Watercolor flowers painted in Rapier. flowers.png: 710 KB to 428 KB, lossless. flowers.jpg: 152 KB to 125 KB, restores the JPEG exactly.',
		h1: 'Free JPEG XL converter', view: 'jxl', encoder: Object.freeze({name: 'rapier-jxl', repository: 'https://github.com/jackskip22/rapier-jxl', package: 'https://www.npmjs.com/package/rapier-jxl'}), related: ['/paint', '/draw', '/notes'],
		features: Object.freeze(['JPG, PNG, GIF, WebP, AVIF and APNG to JPEG XL', 'MP4, WebM and MOV to animated JPEG XL', 'Lossless, High or Medium quality', 'Exact JPEG recompression', 'Keeps transparency, 16-bit PNG, color profiles and HDR', 'Runs offline on your device', 'Many files at once, zip download']),
		lead: 'Convert PNG, JPG, GIF and video to JPEG XL (JXL), free. Files are made on your device, offline; nothing is uploaded. Choose the quality: Lossless, High or Medium. Under Lossless a JPEG converts exactly: smaller, and the original restores byte for byte.',
		howTo: Object.freeze([
			Object.freeze(['How to convert PNG or JPG to JPEG XL', Object.freeze(['Choose or drop pictures: JPG, PNG, WebP, AVIF or any picture your browser opens.', 'Choose the quality: Lossless, High or Medium. Effort keeps the picture: more effort makes a smaller file and takes longer. Under Lossless a JPEG converts exactly.', 'Download each .jxl file, or all of them as one zip.'])]),
			Object.freeze(['How to convert a video to animated JPEG XL', Object.freeze(['Choose or drop an MP4, WebM or MOV.', 'The first time, download JPEG XL complete: free, once, then offline.', 'Up to 30 frames a second, without sound. A long or large video is scaled down or cut, and its row says so.', 'Download the .jxl file.'])]),
			Object.freeze(['How to convert a GIF to animated JXL', Object.freeze(['Choose or drop an animated GIF, APNG or animated WebP.', 'The first time, download JPEG XL complete: free, once, then offline.', 'Choose the quality: Lossless, or High or Medium for a smaller file. Frame timing is kept.', 'Download the .jxl file.'])]),
		]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my picture uploaded?', 'No. Files are converted on your device.']),
			Object.freeze(['Does it work offline?', 'Yes. The encoder is inside Rapier. Videos and animations need JPEG XL complete, a one-time download; after that they convert offline too.']),
			Object.freeze(['Is JPEG XL lossless?', 'Lossless is. High and Medium are lossy and much smaller. A JPEG converted under Lossless restores byte for byte.']),
			Object.freeze(['How much smaller is JPEG XL?', 'An exact JPEG: usually 10 to 20% smaller. A 710 KB PNG painting: 428 KB lossless, 73 KB at High, 35 KB at Medium.']),
			Object.freeze(['What does it keep?', 'Transparency, 16-bit PNG (Lossless), color profiles such as Display P3 and Adobe RGB, and HDR PNGs (PQ or HLG). Video sound is dropped.']),
			Object.freeze(['How many pictures can I convert?', 'Any number. Rapier converts a few at a time; Cancel stops it. If the device runs out of memory, finished files are kept.']),
			Object.freeze(['Which browsers open JPEG XL?', 'Chrome 155, Firefox 158 and Safari 17 and later. Safari does not play animated JPEG XL. Any browser can make the files here.']),
		]),
		sections: Object.freeze([
			Object.freeze(['How it works', 'The JPEG XL encoder is part of Rapier, which is one offline HTML file. Your browser reads each picture, or plays each video frame by frame, and the encoder writes the JPEG XL file on your device. Nothing is uploaded. A JPEG is carried into JPEG XL without decoding it, then restored and checked against the original before you download.']),
			Object.freeze(['Why JPEG XL', 'In Lossless mode a JPEG converts to a smaller file and restores the exact original. Other pictures come out smaller at the same quality. JPEG XL also holds transparency, high dynamic range and animation.']),
			Object.freeze(['How rapier-jxl compares', '17% smaller files than libjxl and libvips at the same quality (effort 7, 2,560-pixel photos). 12% smaller uploads than libvips at the same quality (effort 3, 2,560-pixel photos). The upload encoder downloads 182 KB; libvips in the browser downloads 2.9 MB. Half the memory of libvips for a 12-megapixel upload. Measured against libjxl 0.12.0 and wasm-vips 0.0.19, same SSIMULACRA 2 score.']),
			Object.freeze(['Use rapier-jxl in your site or app', 'rapier-jxl is the JPEG XL encoder inside Rapier: JavaScript and WebAssembly, WebGPU at high efforts, MIT licensed, no dependencies. It encodes lossless and lossy pictures and animations, carries a JPEG exactly, and keeps alpha and HDR. The upload encoder is about 182 KB gzipped; the full encoder about 294 KB. Run npm install rapier-jxl, then import {encode} from rapier-jxl/upload: encode(file) returns the JPEG XL bytes.', Object.freeze([Object.freeze(['rapier-jxl on GitHub', 'https://github.com/jackskip22/rapier-jxl']), Object.freeze(['rapier-jxl on npm', 'https://www.npmjs.com/package/rapier-jxl'])])]),
		])}),
	// /diff answers the comparison searches (diff checker, compare text, compare two Word documents).
	// Its words say compare, never diff (many people do not know the word), but for the searched phrase "diff checker":
	// where Rapier wins first (nothing uploaded, Word and PDF read here, moves shown as moves), then the steps. Each claim is the page's
	// (editor/diff-view.js) and Compare's (agent/diff.mjs). /markdown-diff, the earlier Markdown-only page, answers with a 301 here (_redirects).
	'/diff': Object.freeze({name: 'Compare documents', title: 'Compare text, Word and PDF files online, free | Rapier',
		description: 'A free diff checker: compare two texts, Word documents or PDFs and see every change, word by word. Moved paragraphs show as moves. Nothing uploaded.',
		image: 'og-diff.png', imageSize: [1200, 630], imageAlt: 'Rapier: compare text and documents',
		h1: 'Compare text and documents', view: 'diff', encoder: Object.freeze({name: 'rapier-diff', repository: 'https://github.com/jackskip22/rapier-diff', package: 'https://www.npmjs.com/package/rapier-diff'}), related: ['/word-to-markdown', '/pdf-to-markdown', '/'],
		features: Object.freeze(['Compare pasted text, Markdown, code, Word (.docx) and PDF', 'Word by word, not just line by line', 'A moved paragraph shows as a move', 'Word documents compared as formatted pages, pictures included', 'Documents side by side on a computer, one column on a phone', 'Runs offline on your device: nothing uploaded', 'Open either side in Rapier to edit it']),
		lead: 'Paste two texts, or choose two files, and see what changed, word by word. Word documents and PDFs are read on your device, not uploaded. A paragraph that moved shows as one move, with any words changed inside it, not as a deletion and an insertion. Free, with no account or limits.',
		howTo: Object.freeze([
			Object.freeze(['How to compare two texts', Object.freeze(['Paste the original text on the left, or the top on a phone.', 'Paste the changed text on the right.', 'Tap Compare. Step through the changes with the arrows at the top; close the comparison to change either text.'])]),
			Object.freeze(['How to compare two Word documents', Object.freeze(['Choose or drop the original .docx on the first side.', 'Choose or drop the changed .docx on the second side.', 'Tap Compare. Each change shows on the page as the document draws it, old beside new, with the changed words marked.'])]),
		]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Are my files uploaded?', 'No. Text, Word documents and PDFs are compared on your device. It works offline once the page has loaded.']),
			Object.freeze(['Can I compare Word documents?', 'Yes. Choose two .docx files. Each is read as its formatted text, pictures included, and the changes show on the page, old beside new.']),
			Object.freeze(['Can I compare PDF files?', 'Yes, PDFs with text. The first time, Rapier downloads its free PDF reader once. A scanned PDF has no text to compare.']),
			Object.freeze(['Does it show moved text?', 'Yes. A paragraph that moved shows as one move, with any words changed inside it.']),
			Object.freeze(['Does it compare code?', 'Yes. Paste code, or choose two code files, and the changed lines show with the changed words marked.']),
			Object.freeze(['Can I edit the result?', 'Yes. Open either side in Rapier, a free Markdown editor, and keep writing.']),
		]),
		sections: Object.freeze([
			Object.freeze(['How it works', 'Rapier compares words, not just lines, then groups the edits into changes a person reads: a replaced word, an added sentence, a moved paragraph. It runs inside Rapier, one offline HTML file. Your browser reads each file; nothing is sent anywhere.']),
			Object.freeze(['Use rapier-diff in your site or app', 'rapier-diff is the comparison engine inside Rapier: plain JavaScript, MIT licensed, no dependencies. Run npm install rapier-diff, then import {diff} from rapier-diff: diff(before, after) returns the exact edits and the changes they make.', Object.freeze([Object.freeze(['rapier-diff on GitHub', 'https://github.com/jackskip22/rapier-diff']), Object.freeze(['rapier-diff on npm', 'https://www.npmjs.com/package/rapier-diff'])])]),
		])}),
	// The converter (interchange/convert-view.js) at its hub and its four pair addresses: one view, each address choosing what it makes
	// first. Each claim is the editor's own import (interchange/browser.js) or export (_rapierBuildEditorExport).
	'/convert': Object.freeze({name: 'Document converter', title: 'Markdown converter: PDF, Word and HTML to Markdown, free | Rapier',
		description: 'Convert PDF, Word and HTML to Markdown ready for AI, pictures kept, or Markdown to Word, PDF and HTML. Free, offline, nothing uploaded.',
		image: 'og-convert.png', imageSize: [1200, 630], imageAlt: 'Rapier: Markdown converter',
		h1: 'Markdown converter', view: 'convert',
		related: ['/word-to-markdown', '/pdf-to-markdown', '/markdown-to-word', '/markdown-to-pdf', '/jxl'],
		features: Object.freeze(['PDF to Markdown', 'Word (.docx) to Markdown', 'HTML to Markdown', 'Markdown to Word (.docx)', 'Markdown to PDF', 'Markdown to HTML', 'Pictures kept inside the Markdown file', 'Many files at once', 'Runs offline on your device']),
		lead: 'Turn PDF, Word and HTML files into Markdown ready for AI tools and LLMs, pictures kept inside the file, or turn Markdown into Word, PDF or a web page. Every file is converted on your device, offline: nothing is uploaded. Download the result, or edit it in Rapier first.',
		howTo: Object.freeze([
			Object.freeze(['How to convert a file to Markdown', Object.freeze(['Choose or drop PDF, Word or HTML files.', 'Leave Convert to on Markdown.', 'Download each .md file, or tap Edit to open it in Rapier.'])]),
			Object.freeze(['How to convert Markdown to Word, PDF or HTML', Object.freeze(['Choose or drop .md files.', 'Choose Word, PDF or HTML under Convert to.', 'Download each .docx, .pdf or .html file.'])]),
		]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Are my files uploaded?', 'No. Files are converted on your device, so private documents never reach a server or an AI service.']),
			Object.freeze(['Can I give the Markdown to ChatGPT or Claude?', 'Yes. Markdown keeps headings, lists and tables as plain text, which AI tools and LLMs read well. Convert here, then paste or attach the .md file.']),
			Object.freeze(['Does it work offline?', 'Yes. Word, HTML and Markdown convert offline. PDF to Markdown needs the free PDF reader, downloaded once; then it works offline too.']),
			Object.freeze(['What happens to pictures?', 'Pictures from Word and PDF go inside the Markdown file in their own format, so one .md carries them. Markdown to Word, PDF or HTML keeps them as they look on the page.']),
			Object.freeze(['Can I convert HTML to Markdown, or Markdown to HTML?', 'Yes. Drop an .html file and choose Markdown: headings, lists, tables, links and code become Markdown. Drop an .md file and choose HTML for a web page that opens offline.']),
		])}),
	// /math answers the LaTeX equation searches: type TeX, see it drawn, take it out. Each claim
	// is the view's (editor/math-view.js) or Rapier Math's (math/README.md).
	'/math': Object.freeze({name: 'LaTeX equation editor', title: 'LaTeX equation editor online: SVG, PNG and Word | Rapier',
		description: 'Type LaTeX and see the equation as you type. Copy it into Word or Google Docs, or save it as SVG or PNG. Free, offline, nothing uploaded.',
		image: 'og-math.png', imageSize: [1200, 630], imageAlt: 'Rapier: LaTeX equation editor',
		h1: 'LaTeX equation editor', view: 'math', encoder: Object.freeze({name: 'rapier-math', repository: 'https://github.com/jackskip22/rapier-math', package: 'https://www.npmjs.com/package/rapier-math'}), related: ['/diff', '/jxl', '/markdown-to-word', '/'],
		features: Object.freeze(['LaTeX drawn as you type', 'Copy into Word as an editable equation', 'Copy as a picture for Google Docs and Slides', 'SVG and PNG with a transparent background', 'MathML and Markdown', 'Math keys on a phone', 'Runs offline on your device']),
		lead: 'Type LaTeX and see the equation as you type. Copy it into Word as an editable equation, paste it into Google Docs as a picture, or save it as SVG or PNG. It is drawn on your device: nothing is uploaded, and it works offline.',
		howTo: Object.freeze([
			Object.freeze(['How to make a LaTeX equation image', Object.freeze(['Type or paste your LaTeX, without dollar signs. The equation is drawn as you type.', 'Tap Download SVG for a sharp picture at any size, or Download PNG for a transparent picture.'])]),
			Object.freeze(['How to put a LaTeX equation in Word', Object.freeze(['Type your LaTeX.', 'Tap Copy for Word.', 'Paste it into Word. It becomes an editable Word equation.'])]),
			Object.freeze(['How to put a LaTeX equation in Google Docs', Object.freeze(['Type your LaTeX.', 'Tap Copy picture.', 'Paste it into Google Docs or Slides.'])]),
		]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my equation uploaded?', 'No. Rapier Math draws it in your browser.']),
			Object.freeze(['Does it work offline?', offline]),
			Object.freeze(['Which LaTeX does it know?', 'LaTeX math: fractions, roots, sums, integrals, matrices, cases, aligned equations, accents, Greek letters, blackboard bold and chemistry with \\ce.']),
			Object.freeze(['What if I mistype a command?', 'The equation editor says what is wrong, and for a misspelled command such as \\farc it offers the right one, \\frac.']),
			Object.freeze(['Can I write a whole document with equations?', 'Yes. Tap Open in Rapier: the equation opens in the editor, and the document exports to Word with editable equations, or to PDF.']),
		]),
		sections: Object.freeze([
			Object.freeze(['How it works', 'Rapier Math is part of Rapier, which is one offline HTML file. It turns LaTeX into SVG with the Latin Modern font inside, so the equation looks the same everywhere and stays sharp at any size. For Word it writes MathML, which Word turns into its own equation.']),
			Object.freeze(['Use rapier-math in your site or app', 'rapier-math is the math renderer inside Rapier: TeX to SVG, MIT licensed (its Latin Modern font under the GUST Font License), no dependencies. It draws offline and at once, writes MathML, and plugs into markdown-it and rehype. Run npm install rapier-math, then import {render} from rapier-math: render(tex).svg is the picture.', Object.freeze([Object.freeze(['rapier-math on GitHub', 'https://github.com/jackskip22/rapier-math']), Object.freeze(['rapier-math on npm', 'https://www.npmjs.com/package/rapier-math'])])]),
		])}),
	'/markdown-to-pdf': Object.freeze({name: 'Markdown to PDF', title: 'Markdown to PDF: free online converter | Rapier',
		description: 'Convert Markdown files to PDF with searchable text: tables, code, math and pictures. Free, in your browser, nothing uploaded.',
		image: 'og-markdown-to-pdf.png', imageSize: [1200, 630], imageAlt: 'Rapier: Markdown to PDF',
		h1: 'Markdown to PDF', view: 'convert', related: ['/markdown-to-word', '/convert'],
		lead: 'Drop .md files and download each one as a PDF. Rapier writes the PDF on your device: nothing is uploaded. The text stays searchable, and the Markdown travels inside the PDF, so Rapier can open it again as the same Markdown.',
		howTo: Object.freeze(['How to convert Markdown to PDF', Object.freeze(['Choose or drop .md files. Convert to is on PDF.', 'Download each PDF, or tap Edit to change the Markdown in Rapier first.', 'The PDF has searchable text and the Markdown inside it.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my file uploaded?', local]),
			Object.freeze(['Can I add a page break?', 'Yes. Tap Edit, then + on the bar under the text, then Line.']),
			Object.freeze(['Do tables, code and math come through?', 'Yes, with pictures, drawings and diagrams, as they look on the page.']),
		])}),
	'/markdown-to-word': Object.freeze({name: 'Markdown to Word', title: 'Markdown to Word (.docx): free online converter | Rapier',
		description: 'Convert Markdown files to editable Word documents: headings, lists, tables, code and pictures. Free, in your browser, no upload or account.',
		image: 'og-markdown-to-word.png', imageSize: [1200, 630], imageAlt: 'Rapier: Markdown to Word',
		h1: 'Markdown to Word', view: 'convert', related: ['/word-to-markdown', '/markdown-to-pdf', '/convert'],
		lead: 'Drop .md files and download each one as an editable Word document, with headings, lists, tables, code and pictures. Rapier writes the .docx on your device: nothing is uploaded.',
		howTo: Object.freeze(['How to convert Markdown to Word', Object.freeze(['Choose or drop .md files. Convert to is on Word.', 'Download each .docx file, or tap Edit to change the Markdown in Rapier first.', 'The .docx opens in Word as an editable document.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my file uploaded?', local]),
			Object.freeze(['Can I go back from Word to Markdown?', 'Yes. Drop the .docx and choose Markdown. A Word file Rapier made gives back the same Markdown.']),
		])}),
	'/word-to-markdown': Object.freeze({name: 'Word to Markdown', title: 'Word to Markdown: convert .docx to .md online | Rapier',
		description: 'Convert Word documents to Markdown, pictures included. Download the .md file. Free, in your browser, nothing uploaded.',
		image: 'og-word-to-markdown.png', imageSize: [1200, 630], imageAlt: 'Rapier: Word to Markdown',
		h1: 'Word to Markdown', view: 'convert', related: ['/markdown-to-word', '/pdf-to-markdown', '/convert', '/diff'],
		lead: 'Convert Word documents to Markdown ready for AI tools and LLMs: headings, lists, tables, links and pictures, the pictures inside the .md file. Rapier reads the Word document on your device, offline: nothing is uploaded.',
		howTo: Object.freeze(['How to convert Word to Markdown', Object.freeze(['Choose or drop .docx files. Convert to is on Markdown.', 'Download each .md file, with the pictures inside it.', 'Or tap Edit to open it in Rapier as an editable Markdown page.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my document uploaded?', local]),
			Object.freeze(['Does it keep tables and pictures?', 'Yes. Tables become Markdown tables, or HTML where cells are merged, and pictures go inside the .md file.']),
			Object.freeze(['Can I also convert a PDF?', 'Yes. Drop a PDF too. PDF reading is a free plug-in, downloaded once.']),
		])}),
	'/pdf-to-markdown': Object.freeze({name: 'PDF to Markdown', title: 'PDF to Markdown: convert PDF to .md online | Rapier',
		description: 'Convert PDF to Markdown for AI and LLMs, text and pictures included. Free, in your browser, offline. Nothing is uploaded.',
		image: 'og-pdf-to-markdown.png', imageSize: [1200, 630], imageAlt: 'Rapier: PDF to Markdown',
		h1: 'PDF to Markdown', view: 'convert', related: ['/word-to-markdown', '/markdown-to-pdf', '/convert', '/diff'],
		lead: 'Convert PDF files to Markdown ready for AI tools and LLMs, with their pictures. Rapier reads the PDF on your device, offline: nothing is uploaded, so a private PDF never reaches a server. Check the reading order, or tap Edit to fix it in Rapier.',
		howTo: Object.freeze(['How to convert PDF to Markdown', Object.freeze(['Choose or drop .pdf files. Convert to is on Markdown.', 'The first time, Rapier downloads its free PDF reader once.', 'Download each .md file, or tap Edit to check the reading order in Rapier.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my PDF uploaded?', 'No. The PDF reader runs in your browser.']),
			Object.freeze(['Does it keep the pictures?', 'Yes. Pictures go inside the Markdown file.']),
			Object.freeze(['Does a PDF made in Rapier come back exactly?', 'Yes. A PDF Rapier exports carries its Markdown, and converting it gives back the same file.']),
		])}),
	// /diagrams answers the Mermaid and diagram-maker searches. It opens the diagram maker
	// (diagrams/view.js) over the editor; /mermaid-editor answers 301 here.
	'/diagrams': Object.freeze({name: 'Diagrams', title: 'Mermaid live editor and free diagram maker online | Rapier',
		description: 'Write Mermaid and see it drawn: flowcharts, sequence, class, state, ER and Gantt diagrams. Export SVG or PNG. Free, offline, no sign-up, nothing uploaded.',
		image: 'og-diagrams.png', imageSize: [1200, 630], imageAlt: 'Rapier: free diagram maker and Mermaid editor',
		h1: 'Free diagram maker', view: 'diagrams', related: ['/draw', '/jxl', '/diff', '/'],
		features: Object.freeze(['Mermaid live editor: the diagram is drawn as you type', 'Flowchart, sequence, class, state, ER, Gantt, pie, mind map, timeline, journey, Git, quadrant, XY chart, Sankey and Kanban', 'Export SVG or PNG', 'Copy as a Markdown mermaid block, or open it in the editor', 'Draw diagrams by hand with arrows that stay attached', 'Runs offline on your device; nothing uploaded, no sign-up']),
		lead: 'Write Mermaid and the diagram is drawn as you type: flowcharts, sequence, class, state and ER diagrams, Gantt charts, mind maps and more. Save it as SVG or PNG, copy it as Markdown, or open it in the editor and export the document as PDF or Word. Rather move boxes by hand? Draw makes diagrams with arrows that stay attached. It all runs on your device: nothing is uploaded, and there is no sign-up.',
		howTo: Object.freeze([
			Object.freeze(['How to make a diagram from Mermaid', Object.freeze(['Pick an example, such as Flowchart or Sequence, or paste your Mermaid.', 'Change the words and the drawing follows as you type.', 'Tap SVG or PNG to download it, or Copy Markdown for a mermaid block.'])]),
			Object.freeze(['How to convert Mermaid to SVG or PNG', Object.freeze(['Paste your Mermaid diagram.', 'Tap SVG for a picture that stays sharp at any size, or PNG for one at twice its size.', 'The file is made on your device.'])]),
			Object.freeze(['How to draw a flowchart by hand', Object.freeze(['Tap Draw by hand.', 'Draw boxes and join them with arrows. An arrow stays attached when you move a box.', 'Tap Done to put the drawing in your document, kept as editable SVG.'])]),
		]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my diagram uploaded?', 'No. Diagrams are drawn on your device. Nothing is sent anywhere, and there is no sign-up.']),
			Object.freeze(['Does it work offline?', 'Yes. Flowcharts draw at once. Other kinds use the free diagram plug-in, which downloads once and then works offline.']),
			Object.freeze(['Which diagrams can I make?', 'Flowcharts, sequence, class, state and ER diagrams, Gantt charts, pie charts, mind maps, timelines, user journeys, Git graphs, quadrant charts, XY charts, Sankey diagrams, Kanban boards and more: Mermaid syntax.']),
			Object.freeze(['Can I export Mermaid to SVG or PNG?', 'Yes. SVG keeps the diagram sharp at any size, with its fonts inside. PNG is twice the drawn size, on white.']),
			Object.freeze(['Can I use it on my phone?', 'Yes. It is made for phones first, and works the same on a computer.']),
		]),
		sections: Object.freeze([
			Object.freeze(['How it works', 'Rapier is one offline HTML file. Flowcharts are drawn by Rapier itself; the other kinds by Pele, an MIT Mermaid renderer, in Rapier\'s plug-in. Both run in your browser, so your diagram never leaves your device.']),
			Object.freeze(['Put diagrams in your site or app', 'rapier-embed puts the Rapier editor, diagrams included, in your web app. It runs from your own copy and saves to your storage.', Object.freeze([Object.freeze(['Rapier on GitHub', 'https://github.com/jackskip22/rapier']), Object.freeze(['rapier-embed on npm', 'https://www.npmjs.com/package/rapier-embed'])])]),
		]),
		}),
});

// The site's documents, each a page of its own: the page's guide is the document (tools/seo-page.mjs guideSection), and the
// editor opens the same document from the site's /docs/ (editor/engine.js _rapierGuideStarter). `file` is its name in docs/.
export const GUIDES = Object.freeze({
	'/agents': Object.freeze({name: 'Rapier for agents', file: 'agents.md', title: 'Rapier for AI agents: MCP server, tools and skills',
		description: 'Connect Claude, Cursor, ChatGPT or any MCP client to Rapier with no account. Read and edit one live document with a person, draw, paint and export.',
		image: 'og-agents.png', imageSize: [1200, 630], imageAlt: 'Rapier for agents'}),
});
// Every page the site serves from a door file, with its head.
export const PAGES = Object.freeze({...DOORS, ...GUIDES});
// Pages of the site that are not the editor: the build writes each whole (`file`, tools/gallery-page.mjs) with the same head,
// data and links as the doors, and `_redirects` serves it. The worker never sees them.
export const STANDALONE = Object.freeze({
	'/gallery': Object.freeze({name: 'Gallery', file: 'gallery.html', title: 'Free vintage ornaments, borders and decorative letters | Rapier Gallery',
		description: 'Thousands of free ornaments, page borders and decorative capital letters, traced from old books. Open any piece in Rapier or download it as SVG.',
		image: 'og-gallery.png', imageSize: [1200, 630], imageAlt: 'Rapier Gallery: ornaments, borders and decorative letters',
		h1: 'Gallery', lead: 'Borders, ornaments and decorative letters, free in Rapier: page borders and title frames; corners, dividers, flourishes, cartouches, rosettes and vignettes; illuminated, Gothic, Renaissance, Baroque and Art Nouveau initials. Every piece is public domain SVG, traced from old books.'}),
});
// Every page of the site but home, for the links and the site's data.
export const SITE_PAGES = Object.freeze({...PAGES, ...STANDALONE});

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
const beginBytes = encoder.encode(BEGIN), endBytes = encoder.encode(END);
const attribute = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = value => String(value).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const jsonInScript = value => JSON.stringify(value).replace(/</g, '\\u003c');

function indexOf(bytes, needle, from = 0) {
	const width = needle.length;
	if (width === 0) return from <= bytes.length ? from : -1;
	const last = bytes.length - width;
	if (from > last) return -1;
	const first = needle[0];
	let at = from;
	while (at <= last) {
		const hit = bytes.indexOf(first, at);
		if (hit < 0 || hit > last) return -1;
		let i = 1;
		for (; i < width; i++) if (bytes[hit + i] !== needle[i]) break;
		if (i === width) return hit;
		at = hit + 1;
	}
	return -1;
}

// `fromRel` is the first start that may match, counted from the beginning of `carry` + `chunk`.
function findAcross(carry, chunk, needle, fromRel = 0) {
	const width = needle.length;
	const carryLength = carry.length;
	const total = carryLength + chunk.length;
	if (fromRel < 0) fromRel = 0;
	if (width === 0 || fromRel > total - width) return -1;
	const first = needle[0];
	const boundary = Math.min(carryLength, total - width + 1);
	for (let start = fromRel; start < boundary; start++) {
		let matched = true;
		for (let i = 0; i < width; i++) {
			const pos = start + i;
			const byte = pos < carryLength ? carry[pos] : chunk[pos - carryLength];
			if (byte !== needle[i]) { matched = false; break; }
		}
		if (matched) return start;
	}
	let at = Math.max(0, fromRel - carryLength);
	const last = chunk.length - width;
	while (at <= last) {
		const hit = chunk.indexOf(first, at);
		if (hit < 0 || hit > last) return -1;
		let i = 1;
		for (; i < width; i++) if (chunk[hit + i] !== needle[i]) break;
		if (i === width) return carryLength + hit;
		at = hit + 1;
	}
	return -1;
}

function overlapTail(carry, chunk, width) {
	if (width <= 0) return new Uint8Array(0);
	if (chunk.length >= width) return chunk.subarray(chunk.length - width);
	const length = Math.min(width, carry.length + chunk.length);
	const out = new Uint8Array(length);
	const take = length - chunk.length;
	if (take > 0) out.set(carry.subarray(carry.length - take), 0);
	out.set(chunk, take);
	return out;
}

// `head` is the page's text from its start through the closing marker. Returns it with the door's words, or null
// when the head is not the shape this rewrites (the caller then serves the page as it is).
export function doorHead(head, path) {
	const door = PAGES[path];
	if (!door) return null;
	const title = /<title>([^<]*)<\/title>/.exec(head);
	const description = /<meta name="description" content="([^"]*)">/.exec(head);
	const canonical = /<link rel="canonical" href="([^"]*)">/.exec(head);
	const graph = /<script type="application\/ld\+json">[\s\S]*?<\/script>/.exec(head);
	if (!title || !description || !canonical || !graph || !head.includes(BEGIN) || !head.endsWith(END)) return null;
	const url = ORIGIN + path;
	const set = (text, pattern, replacement) => {
		if (!pattern.test(text)) throw new Error('head tag missing: ' + pattern);
		return text.replace(pattern, () => replacement);
	};
	let out = head;
	out = set(out, /<title>[^<]*<\/title>/, '<title>' + attribute(door.title) + '</title>');
	out = set(out, /<meta name="description" content="[^"]*">/, '<meta name="description" content="' + attribute(door.description) + '">');
	out = set(out, /<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + url + '">');
	out = set(out, /<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + attribute(door.title) + '">');
	out = set(out, /<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + attribute(door.description) + '">');
	out = set(out, /<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">');
	out = set(out, /<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + attribute(door.title) + '">');
	out = set(out, /<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + attribute(door.description) + '">');
	// A door with a card of its own (tools/og-card.mjs) shows it when its address is shared.
	if (door.image) {
		out = set(out, /<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + ORIGIN + '/' + door.image + '">');
		out = set(out, /<meta property="og:image:alt" content="[^"]*">/, '<meta property="og:image:alt" content="' + attribute(door.imageAlt) + '">');
		out = set(out, /<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="' + door.imageSize[0] + '">');
		out = set(out, /<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="' + door.imageSize[1] + '">');
		out = set(out, /<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + ORIGIN + '/' + door.image + '">');
	}
	out = out.replace(graph[0], () => '<script type="application/ld+json">' + jsonInScript(pageData(path)) + '</script>');
	// The page's own head, kept: the sheet's close puts these back (the engine reads this block when it is there).
	const home = {title: text(title[1]), description: text(description[1]), canonical: text(canonical[1])};
	return out.slice(0, out.length - END.length) + '<script type="application/json" id="rapier-home-head">' + jsonInScript(home) + '</script>\n' + END;
}

// A page's structured data: a page of the site, under the home page, not a second copy of the application's description.
// The Gallery is a collection of pictures (CollectionPage, a kind of WebPage).
// The engine a page names (`encoder`: the JPEG XL encoder, Rapier Diff): its repository and package are the same software as the page's application.
function encoderData(encoder, url) {
	return {'@type': 'SoftwareSourceCode', '@id': url + '#encoder', name: encoder.name, codeRepository: encoder.repository, url: encoder.package,
		programmingLanguage: 'JavaScript', license: 'https://opensource.org/license/mit'};
}
export function pageData(path) {
	const door = SITE_PAGES[path], url = ORIGIN + path;
	return {'@context': 'https://schema.org', '@graph': [
		{'@type': STANDALONE[path] ? 'CollectionPage' : 'WebPage', '@id': url + '#webpage', url, name: door.title, description: door.description, inLanguage: 'en',
			isPartOf: {'@id': ORIGIN + '/#website'}, breadcrumb: {'@id': url + '#breadcrumb'},
			...(door.image ? {primaryImageOfPage: {'@id': url + '#image'}} : {})},
		...(GUIDES[path] ? [{'@type': 'TechArticle', '@id': url + '#article', headline: door.name, url, description: door.description, inLanguage: 'en',
			mainEntityOfPage: {'@id': url + '#webpage'}, publisher: {'@id': ORIGIN + '/#organization'}}] : []),
		{'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
			{'@type': 'ListItem', position: 1, name: 'Rapier', item: ORIGIN + '/'},
			{'@type': 'ListItem', position: 2, name: door.name, item: url}]},
		...(door.image ? [{'@type': 'ImageObject', '@id': url + '#image', url: ORIGIN + '/' + (door.picture || door.image),
			caption: door.imageAlt}] : []),
		// A tool people search for is the free web application at this address. Its questions stay in the guide, with no
		// FAQPage data: Google stopped showing FAQ results on 7 May 2026, and the running page does not show the questions.
		...(DOORS[path]?.h1 ? [{'@type': 'WebApplication', '@id': url + '#application', name: door.h1, url, description: door.description,
			applicationCategory: /^\/(?:draw|paint|watercolor)$/.test(path) ? 'DesignApplication' : 'UtilitiesApplication',
			operatingSystem: 'Web', browserRequirements: 'Requires JavaScript', isAccessibleForFree: true,
			offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'}, isPartOf: {'@id': ORIGIN + '/#website'},
			...(door.features ? {featureList: door.features} : {}),
			...(door.encoder ? {isBasedOn: {'@id': url + '#encoder'}} : {})}] : []),
		...(door.encoder ? [encoderData(door.encoder, url)] : [])]};
}

function doorGuide(body, path) {
	const name = 'RAPIER_DOOR_' + path.slice(1).toUpperCase();
	const begin = '<!-- ' + name + '_BEGIN -->', end = '<!-- ' + name + '_END -->';
	const start = body.indexOf(begin), close = body.indexOf(end, start + begin.length);
	if (start < 0 || close < 0 || body.indexOf(begin, start + begin.length) >= 0 || body.indexOf(end, close + end.length) >= 0) return null;
	const template = body.slice(start + begin.length, close).trim();
	return /^<template>\s*(<section id="rapier-seo">[\s\S]*<\/section>)\s*<\/template>$/.exec(template)?.[1] ?? null;
}

// The whole page as bytes, for a host that has it whole. Decode only the head and search guide; every application byte stays exact.
// A guide page (GUIDES) is given its section; a door takes its section from the page's own template.
export function doorPage(bytes, path, section = null) {
	if (!(section === null ? DOORS[path] : GUIDES[path])) return bytes;
	const end = indexOf(bytes, endBytes), cut = end + endBytes.length;
	if (end < 0 || cut > HEAD_WINDOW) return bytes;
	const bodyAt = indexOf(bytes, beginBytes, cut), bodyEnd = indexOf(bytes, endBytes, bodyAt + beginBytes.length);
	const tailAt = bodyEnd + endBytes.length;
	if (bodyAt < 0 || bodyEnd < 0 || tailAt > WINDOW) return bytes;
	try {
		const head = doorHead(decoder.decode(bytes.subarray(0, cut)), path);
		const guide = section ?? doorGuide(decoder.decode(bytes.subarray(bodyAt + beginBytes.length, bodyEnd)), path);
		if (head === null || guide === null) return bytes;
		const next = encoder.encode(head), body = encoder.encode(BEGIN + '\n' + guide + '\n' + END);
		const middle = bytes.subarray(cut, bodyAt);
		const out = new Uint8Array(next.length + middle.length + body.length + bytes.length - tailAt);
		out.set(next); out.set(middle, next.length); out.set(body, next.length + middle.length);
		out.set(bytes.subarray(tailAt), next.length + middle.length + body.length);
		return out;
	} catch (_) { return bytes; }
}

// Buffer through the body's closing search marker so a missing guide cannot leave a rewritten head over the home body.
// Each chunk is kept once. The marker search covers that chunk and the unmatched overlap only.
// Once both replacements are known, the rest passes through as it arrives.
function doorStream(source, path) {
	const reader = source.getReader(), marker = endBytes, overlap = marker.length - 1;
	const chunks = [];
	let total = 0, carry = new Uint8Array(0), headAt = -1, bodyAt = -1, passing = false;
	const concat = () => {
		const out = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
		return out;
	};
	return new ReadableStream({
		async pull(controller) {
			try {
				if (passing) {
					const {value, done} = await reader.read();
					if (done) controller.close(); else controller.enqueue(value);
					return;
				}
				for (;;) {
					const read = await reader.read();
					const value = read.value, done = read.done;
					if (value && value.length) {
						const owned = new Uint8Array(value.byteLength);
						owned.set(value);
						const carryAt = total - carry.length;
						if (headAt < 0) {
							const rel = findAcross(carry, owned, marker, 0);
							if (rel >= 0) headAt = carryAt + rel;
						}
						if (headAt >= 0 && bodyAt < 0) {
							const rel = findAcross(carry, owned, marker, headAt + marker.length - carryAt);
							if (rel >= 0) bodyAt = carryAt + rel;
						}
						chunks.push(owned);
						total += owned.length;
						carry = overlapTail(carry, owned, overlap);
					}
					const headCut = headAt < 0 ? -1 : headAt + marker.length;
					const bodyCut = bodyAt < 0 ? -1 : bodyAt + marker.length;
					if (bodyAt >= 0 || done || total > WINDOW || (headAt >= 0 && headCut > HEAD_WINDOW) || (headAt < 0 && total > HEAD_WINDOW)) {
						passing = true;
						const held = total ? concat() : new Uint8Array(0);
						const changed = bodyAt >= 0 && bodyCut <= WINDOW ? doorPage(held, path) : held;
						if (changed.length) controller.enqueue(changed);
						chunks.length = 0;
						total = 0;
						if (done) controller.close();
						return;
					}
				}
			} catch (error) { controller.error(error); }
		},
		cancel(reason) { return reader.cancel(reason); },
	});
}

function contentEncoded(response) {
	const encoding = response.headers.get('content-encoding');
	return !!(encoding && encoding !== 'identity');
}
function htmlResponse(response) {
	return /^text\/html/i.test(response.headers.get('content-type') || '');
}
async function release(response) {
	try { if (response && response.body) await response.body.cancel(); } catch (_) {}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (env && env.DOOR_TRACE) console.log('door-worker ' + url.pathname);
		const plain = () => env.ASSETS.fetch(request);
		try {
			const method = request.method.toUpperCase();
			if (method !== 'GET' && method !== 'HEAD') return plain();
			const path = url.pathname.replace(/\/+$/, '');
			if (!DOORS[path]) return plain();
			// The routes of `_redirects`, kept: a trailing slash goes to the address without it.
			if (url.pathname !== path) return Response.redirect(url.origin + path + url.search, 308);
			const published = await env.ASSETS.fetch(new Request(new URL(doorAssetPath(path), url), request));
			// The door file is served as the asset layer gives it, compressed or not: only the page below is rewritten.
			if (published.status === 304 || published.status === 206 || (published.ok && htmlResponse(published))) return published;
			await release(published);
			const asset = await env.ASSETS.fetch(new Request(new URL(PAGE, url), {method: method === 'HEAD' ? 'HEAD' : 'GET', headers: {accept: 'text/html'}}));
			if (!asset.ok || (method !== 'HEAD' && !asset.body) || contentEncoded(asset) || !htmlResponse(asset)) {
				await release(asset);
				return plain();
			}
			const headers = new Headers(asset.headers);
			// The bytes are not the asset's: its length and validator no longer describe them.
			headers.delete('content-length'); headers.delete('etag');
			if (method === 'HEAD') {
				await release(asset);
				return new Response(null, {status: 200, headers});
			}
			return new Response(doorStream(asset.body, path), {status: 200, headers});
		} catch (_) { return plain(); }
	},
};
