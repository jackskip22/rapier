// Binds the first screen's controls before they are shown. A tap lands here until the editor's
// action table is installed; the editor drains the queue into that table, so nothing visible is dead
// and a tap is not dropped. Once that table is installed it hears every control, including the ones
// the first screen does not contain. This file is inlined by the build. It is not a second editor.
(() => {
	const screen = document.getElementById('rapier-first-screen');
	if (!screen) return;
	const queue = [];
	const answered = [];
	const performed = [];
	const controlOf = event => event.target instanceof Element ? event.target.closest('[data-action]') : null;
	const shown = control => !!(control && screen.contains(control) && !control.hidden && !control.closest('[hidden]') && control.getClientRects().length);
	const onEarlyClick = event => {
		const control = controlOf(event);
		if (!shown(control)) return;
		event.preventDefault();
		event.rapierBound = true;
		answered.push(String(control.dataset.action || ''));
		queue.push(event);
	};
	document.addEventListener('click', onEarlyClick, true);
	globalThis.__rapierFirstScreen = {
		answered, performed,
		install(next) {
			const pending = queue.splice(0);
			for (const event of pending) next(event);
			document.removeEventListener('click', onEarlyClick, true);
			document.addEventListener('click', next);
		},
	};
})();