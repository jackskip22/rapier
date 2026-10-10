/* Information sheets share the editor's modal owner. */
function _rapierOpenInfoSheet(kind) {
  const content = {
    share: ['share',
      'WEB PAGE — Offline, printable and editable in Rapier.',
      'PLAIN TEXT FILE — Original Markdown or code.',
      'IMAGE COMPATIBILITY MODE — For recipients who cannot display pictures; much larger files.',
      'WHO WROTE WHAT shares names; THE WHOLE HISTORY includes deleted text. Both start off.',
      'Shared files are not encrypted.'],
    copy: ['copy',
      'FORMATTED — Keeps headings, lists, links and tables.',
      'MARKDOWN — Original text and document details.',
      'PLAIN TEXT — Just the words.',
      'PANDOC AND QUARTO — Adjusts copied Markdown for these tools.'],
    'export-html': ['html',
      'PUBLISHING HTML — Website content, without Rapier’s styling.',
      'STANDALONE WEB PAGE — Offline, printable; reopen in Rapier to edit.'],
    code: ['code',
      'STANDARD / ACCENT — Usual or accent colours.',
      'CHECKERBOARD — Shades alternate lines. DIM / 100% changes shading.',
      'AUTO NUMBERS — All in code files; current in prose. Choose none, current or all.',
      'WRAPPING — Fits long lines onscreen.',
      'TRUNCATE / RESIZE — Cuts or shrinks long line numbers.',
      'Your file stays unchanged.'],
    pro: ['pro',
      'Android: one lifetime Google Play purchase; no subscription.',
      'Pro includes: ' + _rapierProFeatures().map(feature => feature.name).join(', ') + '.',
      'HOME-SCREEN WIDGET — Touch and hold your home screen, tap Widgets, then Rapier.',
      'APP ICON COLOUR — Settings, under Pro.',
      'RESTORE PURCHASE — Use the Google Play account you bought with.'],
    will: ['will', _RAPIER_WILL_INFO.lead,
      ..._RAPIER_WILL_INFO.laws.map(entry => _rapierProtectionWord(entry.law) + ' — ' + entry.line)],
    layout: ['layout',
      'PLAIN — Pictures sit upright on separate lines.',
      'Your saved sizes, positions and rotations stay unchanged.'],
    /* RAPIER_NOTES_BEGIN */
    'notes-sort': ['sort by',
      'CUSTOM — Drag cards into order.',
      'CREATED / MODIFIED — Newest first.'],
    'notes-layout': ['layout',
      'HALF — Two cards per row.',
      'FULL — One wider card.'],
    'notes-sections': ['sections',
      'NEW — Add a section.',
      'SECTIONS — Reorder, rename or delete your sections.',
      'Deleted sections’ notes move to Other.',
      'Pinned stays first.'],
    'sync': ['sync', ...(String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase() === 'android' ? [
      'RAPIER SYNC (COMING SOON) — A separate app that will connect your storage. Rapier itself never goes online.',
      'CLOUDFLARE, GOOGLE DRIVE, ONEDRIVE, DROPBOX, S3, WEBDAV — Chosen there.',
      'Until then, use BACKUP to keep copies.',
      'Your notes are encrypted on this device before they leave it.'] : [
      'CLOUDFLARE — Your own private storage, encrypted and free. Recommended.',
      'GOOGLE DRIVE, ONEDRIVE, DROPBOX — For files you already keep there.',
      'Your notes are encrypted on this device before they leave it.',
      'S3 and WebDAV: Rapier Sync on Android.'])],
    'notes-folder': ['folder',
      'Notes are Markdown files.',
      'IMPORT — Add notes or restore backups.',
      'BACKUP — Keep every part elsewhere. Not encrypted.',
      'TIDY HISTORY — Permanently removes older versions; keeps your notes.'],
    notes: ['notes',
      ...(String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase() === 'android' ? ['LOCK-SCREEN NOTES — Add Rapier to a lock screen shortcut in your phone\'s lock screen settings. Tapping it there starts a new note without unlocking; your other notes stay locked. If your phone has a default notes app setting, choose Rapier there too.'] : []),
      'SKILLS — Shows instruction notes, hidden by default. Connected agents can read notes.',
      'SYNC — Encrypts notes before uploading to your storage.',
      (() => {
        const S = globalThis.RapierNotesSyncSession, platform = String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase();
        const where = {url: location.href, native: ['android', 'windows'].includes(platform), framed: window.top !== window};
        if (where.native) return platform === 'android' ? 'Rapier Sync for Android is coming soon; use BACKUP for now.' : 'Open rapier.website to sync.';
        if (!S) return 'Sync could not load. Reopen Rapier.';
        if (S.syncAvailability(where).ready) return 'Cloudflare sign-in: Settings.';
        return S.r2KeyAvailability(where).ready ? 'Cloudflare sign-in: coming soon. Advanced setup accepts storage keys.'
          : 'Open rapier.website to sync.';
      })(),
      'Cloudflare access covers your account’s storage.',
      'Deleting notes leaves online history.',
      'BACKUP — Unencrypted. Keep every part elsewhere.',
      typeof _rapierNotesStorageSentence === 'function' ? _rapierNotesStorageSentence() : 'Storage is unconfirmed. Keep a backup elsewhere.'],
    /* RAPIER_NOTES_END */
  }[kind];
  if (!content) return;
  const list = _rapierInfoSheetShow(content[0], content.slice(1));
  if (kind === 'notes') {
    // Keep the live storage answer attached while the sheet is open.
    list.lastElementChild.id = 'notes-storage-note';
    if (typeof _rapierNotesStorageAnswer === 'function') void _rapierNotesStorageAnswer(false);
  }
}
// The house information sheet with a title and its lines: the kinds above, and a result's notes opened from a notice
// (an import's, interchange/browser.js) in the person's own time. Returns the list for a caller that keeps a line live.
function _rapierInfoSheetShow(title, lines) {
  const overlay = _rapierUi.refs.infoOverlay, sheet = overlay.querySelector('.info-action-sheet');
  overlay.querySelector('#info-sheet-title').textContent = title;
  const body = overlay.querySelector('.info-action-body'), list = document.createElement('ul');
  list.append(...lines.map(text => {
    const item = document.createElement('li'); item.textContent = text; return item;
  }));
  body.replaceChildren(list);
  sheet.scrollTop = 0;
  openDialog(overlay, {panel: '.info-action-sheet', noautofocus: true});
  sheet.focus({preventScroll: true});
  return list;
}

const _rapierInfoOverlay = document.getElementById('info-overlay');
_rapierInfoOverlay.addEventListener('click', event => {
  if (event.target === _rapierInfoOverlay || event.target.closest('[data-info-close]')) closeDialog(_rapierInfoOverlay);
});
_rapierInfoOverlay.addEventListener('keydown', event => {
  event.stopPropagation();
  if (event.key === 'Escape') { event.preventDefault(); closeDialog(_rapierInfoOverlay); }
});
