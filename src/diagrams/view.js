// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const EXAMPLES = Object.freeze([
		['Flowchart', 'flowchart TD\n  A[Idea] --> B[Draft]\n  B --> C{Ready?}\n  C -- yes --> D[Share]\n  C -- no --> B'],
		['Sequence', 'sequenceDiagram\n  actor Ana\n  participant App\n  participant Server\n  Ana->>App: Sign in\n  App->>Server: Check password\n  Server-->>App: OK\n  App-->>Ana: Welcome'],
		['Class', 'classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog {\n    +bark()\n  }\n  class Cat {\n    +meow()\n  }\n  Animal <|-- Dog\n  Animal <|-- Cat'],
		['State', 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review: submit\n  Review --> Draft: changes\n  Review --> Published: approve\n  Published --> [*]'],
		['ER', 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE : contains\n  CUSTOMER {\n    string name\n    string email\n  }\n  ORDER {\n    int id\n    date placed\n  }'],
		['Gantt', 'gantt\n  dateFormat YYYY-MM-DD\n  section Plan\n    Research :a, 2026-11-02, 4d\n    Design :b, after a, 5d\n  section Build\n    Code :c, after b, 8d\n    Test :d, after c, 3d'],
		['Pie', 'pie title Time spent\n  "Writing" : 45\n  "Editing" : 30\n  "Research" : 25'],
		['Mind map', 'mindmap\n  root((Launch))\n    Website\n      Pages\n      Search\n    App\n      Phone\n      Computer\n    People\n      Writers\n      Teams'],
		['Timeline', 'timeline\n  title Product\n  2024 : Idea\n  2025 : First version : Phone app\n  2026 : Diagrams : Notes'],
		['Journey', 'journey\n  title Morning\n  section Home\n    Wake up: 3: Me\n    Coffee: 5: Me\n  section Work\n    Commute: 2: Me\n    Stand-up: 4: Me, Team'],
		['Git', 'gitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout main\n  merge feature\n  commit'],
		['Quadrant', 'quadrantChart\n  title Tasks\n  x-axis Easy --> Hard\n  y-axis Low value --> High value\n  quadrant-1 Plan\n  quadrant-2 Do now\n  quadrant-3 Drop\n  quadrant-4 Later\n  Fix typo: [0.1, 0.3]\n  New page: [0.35, 0.8]\n  Rewrite: [0.85, 0.7]'],
		['XY chart', 'xychart\n  title "Visits"\n  x-axis [Jan, Feb, Mar, Apr, May]\n  y-axis "Visits" 0 --> 100\n  bar [20, 35, 50, 65, 90]\n  line [20, 35, 50, 65, 90]'],
		['Sankey', 'sankey\n  Income,Rent,40\n  Income,Food,20\n  Income,Savings,25\n  Income,Fun,15'],
		['Kanban', 'kanban\n  Todo\n    Write post\n    Pick photos\n  Doing\n    Edit draft\n  Done\n    Outline'],
	]);
	const SOURCE = Object.freeze([['Rapier on GitHub', 'https://github.com/jackskip22/rapier'], ['rapier-embed on npm', 'https://www.npmjs.com/package/rapier-embed']]);
	const ABOUT = Object.freeze(['Write Mermaid and the diagram is drawn as you type, on your device. Nothing is uploaded.',
		'Flowcharts draw at once. Every other kind uses the diagram plug-in, Pele (MIT), which downloads once and then works offline.',
		'Draw makes diagrams by hand, with arrows that stay attached, kept as editable SVG.',
		'Put the same editor, diagrams included, in your site or app with rapier-embed.']);
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const anchor = (label, href, away = true) => { const link = make('a', '', label); link.href = href; if (away) { link.target = '_blank'; link.rel = 'noopener'; } return link; };
	const button = (label, cls = '') => { const node = make('button', 'settings-action-btn' + (cls ? ' ' + cls : ''), label); node.type = 'button'; return node; };
	const native = source => globalThis.RapierFlowchart?.parseFlowchart(source).ok === true;
	const fence = source => '```mermaid\n' + source.replace(/\n+$/, '') + '\n```\n';

	function about() {
		const list = _rapierInfoSheetShow('Diagrams', ABOUT);
		for (const [label, href] of SOURCE) { const item = make('li'); item.append(anchor(label, href)); list.append(item); }
	}
	function build() {
		const root = make('div', 'rapier-diagrams-view'), title = make('div', 'rapier-diagrams-view__title', 'Diagrams');
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Diagrams');
		const bar = make('div', 'rapier-diagrams-view__bar'), shut = make('button', 'navigator-close'), heading = make('div', 'rapier-diagrams-view__heading');
		shut.type = 'button'; shut.setAttribute('aria-label', 'close');
		shut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
		const info = make('button', 'settings-info-btn');
		info.type = 'button'; info.setAttribute('aria-label', 'about Diagrams'); info.setAttribute('aria-haspopup', 'dialog');
		info.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
		heading.append(title, info); bar.append(heading, shut);
		const body = make('div', 'rapier-diagrams-view__body');
		const note = make('p', 'rapier-diagrams-view__note', 'Mermaid, drawn as you type. Nothing leaves your device.');
		const stage = make('div', 'rapier-diagrams-view__stage'), drawing = make('div', 'rapier-diagrams-view__drawing md-render'), reason = make('p', 'rapier-diagrams-view__note rapier-diagrams-view__reason');
		drawing.setAttribute('role', 'img'); drawing.setAttribute('aria-label', 'Diagram');
		reason.setAttribute('role', 'status'); reason.setAttribute('aria-live', 'polite');
		const install = button('Install diagram plug-in', 'rapier-diagrams-view__install'); install.hidden = true;
		stage.append(drawing, reason, install);
		const source = make('textarea', 'rapier-diagrams-view__source');
		source.spellcheck = false; source.setAttribute('autocapitalize', 'off'); source.setAttribute('autocomplete', 'off'); source.setAttribute('aria-label', 'Mermaid');
		source.value = EXAMPLES[0][1];
		const out = make('div', 'rapier-diagrams-view__grid'), svg = button('SVG'), png = button('PNG'), copy = button('Copy Markdown'), edit = button('Open in editor');
		out.setAttribute('role', 'group'); out.setAttribute('aria-label', 'Export');
		out.append(svg, png, copy, edit);
		const examples = make('div', 'rapier-diagrams-view__part'), kinds = make('div', 'rapier-diagrams-view__grid rapier-diagrams-view__kinds');
		kinds.setAttribute('role', 'group'); kinds.setAttribute('aria-label', 'Examples');
		const picks = EXAMPLES.map(([label, text]) => { const pick = button(label); pick.dataset.example = label; pick._rapierSource = text; return pick; });
		kinds.append(...picks);
		const hand = button('Draw by hand');
		examples.append(make('p', 'rapier-diagrams-view__note', 'Examples'), kinds, hand);
		const foot = _rapierToolFooter('/diagrams', 'rapier-embed');
		const write = make('div', 'rapier-diagrams-view__write');
		write.append(source, out, examples);
		body.append(note, stage, write, foot);
		root.append(bar, body);
		return {root, shut, info, drawing, reason, install, source, svg, png, copy, edit, picks, hand, inert: [], wasFocus: null, gen: 0, timer: 0, declined: false, shown: ''};
	}

	async function draw(self = view) {
		if (!self) return;
		const text = self.source.value, gen = ++self.gen, own = native(text), provider = _rapierProviders.mermaid;
		const current = () => view === self && self.gen === gen;
		self.install.hidden = true;
		try {
			let svg;
			if (own) {
				const rendered = globalThis.RapierFlowchart.renderFlowchart(text);
				if (!rendered.ok) throw new Error(rendered.reason);
				svg = rendered.svg;
			} else {
				if (!provider) throw new Error('This copy draws flowcharts only.');
				if (provider.status !== 'ready') await provider.check();
				if (!current()) return;
				if (provider.status !== 'ready' && !await plugin(self)) {
					if (!current()) return;
					self.drawing.replaceChildren(); self.shown = '';
					self.reason.textContent = 'Needs the diagram plug-in.'; self.install.hidden = false;
					return;
				}
				svg = await provider.renderToString(text);
			}
			await Promise.resolve(document.fonts?.ready).catch(() => {});
			if (!current()) return;
			_rapierApplyDiagramSvg(self.drawing, svg, own);
			const shown = self.drawing.querySelector('svg');
			if (shown && own) globalThis.RapierRender?.positionNativeDiagram?.(shown);
			self.shown = text; self.reason.textContent = '';
		} catch (error) {
			if (!current()) return;
			self.reason.textContent = _rapierFriendlyDiagramError(error);
		}
		paintOut(self);
	}
	function paintOut(self) { for (const node of [self.svg, self.png]) node.disabled = !self.shown || self.shown !== self.source.value; }
	async function plugin(self, asked = false) {
		const provider = _rapierProviders.mermaid;
		if (self.declined && !asked) return false;
		if (!asked) {
			const yes = await rapierConfirm({title: 'Install diagram plug-in?', plain: true, confirmLabel: 'Install',
				message: '• Draws sequence, class, Gantt and every other kind.\n• ' + _rapierPluginSize(provider.downloadBytes) + ', once.\n• Works offline.'}) === true;
			if (!yes) { self.declined = true; return false; }
		}
		const end = _rapierPluginProgress('mermaid', 'diagrams');
		try { await provider.install(); }
		catch (error) { showToast(_rapierErrorWords(error, 'Couldn’t install the diagram plug-in.'), 'error'); return false; }
		finally { end(); }
		return provider.status === 'ready';
	}

	async function picture() {
		const shown = view.drawing.querySelector('svg');
		if (!shown) return null;
		const held = make('div'), svg = shown.cloneNode(true);
		held.append(svg);
		if (svg.classList.contains('pele')) _rapierRenderModule('render')._rapierDocxRenderStyles(held);
		else svg.style.colorScheme = 'light';
		const box = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
		const width = Number.parseFloat(svg.getAttribute('width')) || box[2] || shown.getBoundingClientRect().width;
		const height = Number.parseFloat(svg.getAttribute('height')) || box[3] || shown.getBoundingClientRect().height;
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
		for (const property of ['width', 'height', 'max-width', 'max-height', 'margin', 'left', 'position', 'transform']) svg.style.removeProperty(property);
		svg.style.background = '#ffffff';
		if (svg.classList.contains('pele')) await globalThis.RapierExportFonts.embedDiagramFonts(svg, globalThis.RapierDocxFonts.DOCX_FONTS);
		return {text: new XMLSerializer().serializeToString(svg), width, height};
	}
	const named = kind => 'diagram.' + kind;
	function save(blob, name) {
		const link = make('a'), url = URL.createObjectURL(blob);
		link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 4000);
	}
	async function saveSvg() {
		const made = await picture();
		if (made) save(new Blob([made.text], {type: 'image/svg+xml'}), named('svg'));
	}
	async function savePng() {
		const made = await picture();
		if (!made) return;
		const url = URL.createObjectURL(new Blob([made.text], {type: 'image/svg+xml'}));
		try {
			const image = new Image();
			image.src = url; await image.decode();
			const scale = 2, canvas = document.createElement('canvas');
			canvas.width = Math.ceil(made.width * scale); canvas.height = Math.ceil(made.height * scale);
			const paint = canvas.getContext('2d');
			paint.fillStyle = '#ffffff'; paint.fillRect(0, 0, canvas.width, canvas.height);
			paint.drawImage(image, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise(done => canvas.toBlob(done, 'image/png'));
			if (blob) save(blob, named('png')); else showToast('Couldn’t make the PNG.', 'error');
		} catch (_) { showToast('Couldn’t make the PNG.', 'error'); }
		finally { URL.revokeObjectURL(url); }
	}
	async function copyFence() {
		try { await navigator.clipboard.writeText(fence(view.source.value)); showToast('Copied', 'info'); }
		catch (_) { showToast('Couldn’t copy.', 'error'); }
	}
	async function openInEditor() {
		const text = fence(view.source.value);
		close();
		await rapierOpenPlatformPayload({text, name: 'diagram.md', transient: true});
	}
	function drawByHand() {
		close();
		if (_rapierDrawOffered()) void _rapierPartReady('drawing').then(ready => { if (ready) _rapierDrawPart.open(undefined, 'shape'); });
	}

	function open() {
		if (view) return;
		view = build();
		const {root} = view;
		view.wasFocus = document.activeElement;
		for (const node of document.body.children) if (!node.inert && node.id !== 'toast-root' && node.id !== 'sr-live') { node.inert = true; view.inert.push(node); }
		document.body.append(root);
		const notices = document.getElementById('toast-root');
		if (notices) { view.notices = {root: notices, home: notices.parentElement}; root.append(notices); if (typeof _rapierScheduleToastLift === 'function') _rapierScheduleToastLift(); }
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('diagrams', true);
		document.documentElement.classList.remove('rapier-diagrams-start');
		view.shut.addEventListener('click', close);
		view.info.addEventListener('click', about);
		view.source.addEventListener('input', () => { const self = view; paintOut(self); clearTimeout(self.timer); self.timer = setTimeout(() => draw(self), 300); });
		view.install.addEventListener('click', async () => { const self = view; if (await plugin(self, true)) void draw(self); });
		view.svg.addEventListener('click', saveSvg);
		view.png.addEventListener('click', savePng);
		view.copy.addEventListener('click', copyFence);
		view.edit.addEventListener('click', openInEditor);
		view.hand.addEventListener('click', drawByHand);
		for (const pick of view.picks) pick.addEventListener('click', () => {
			view.source.value = pick._rapierSource;
			paintOut(view);
			clearTimeout(view.timer); void draw(view);
			view.drawing.scrollIntoView?.({block: 'nearest'});
		});
		root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
		paintOut(view);
		void draw(view);
	}
	function close() {
		if (!view) return;
		const done = view;
		view = null;
		clearTimeout(done.timer);
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('diagrams', false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	const face = Object.freeze({open, close, get state() { return Object.freeze({open: !!view}); }});
	_rapierDiagramsPart = face;
	if (_rapierDiagramsDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
